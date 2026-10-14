import { h } from "preact";
import { renderComponent, TabManager } from "@janbaykara/zotero-preact";

import { getString } from "../utils/locale";
import { getCachedRegularItem } from "./transcript-attachment";
import { requestWatchSeek } from "./watch-seek";
import { WatchErrorBoundary } from "./ui/WatchErrorBoundary";
import { WatchPage } from "./ui/WatchPage";

export const WATCH_TAB_TYPE = "yt-watch";

export type WatchTabParams = { itemID: number };

export type OpenWatchTabOptions = {
  /** Seek to this transcript offset (ms) after the tab is shown. */
  seekMs?: number;
};

function watchTree(params: WatchTabParams) {
  return h(WatchErrorBoundary, null, h(WatchPage, { itemID: params.itemID }));
}

export function watchTabId(itemID: number): string {
  return `${WATCH_TAB_TYPE}-${itemID}`;
}

export const watchTabManager = new TabManager<WatchTabParams>({
  type: WATCH_TAB_TYPE,
  title: (params) => {
    const item = params?.itemID ? getCachedRegularItem(params.itemID) : null;
    const title = item?.getDisplayTitle?.() || getString("watch-tab-title");
    return title;
  },
  rootElementIdFactory: (params) => `yt-watch-root-${params?.itemID ?? 0}`,
  // itemID enables Zotero's tab context pane (item sidebar), same as reader tabs.
  // tab.data.icon must be a CSS item-type name (not a chrome:// URL) — see
  // tabBar.js CSSItemTypeIcon. The red YouTube mark is applied in zoteroPane.css.
  data: (params?: WatchTabParams) => ({
    icon: "videoRecording",
    itemID: params?.itemID,
  }),
  componentFactory: (params) => watchTree(params!),
  getTabId: (params) => watchTabId(params?.itemID ?? 0),
});

/** Let Zotero show the item context pane beside watch tabs. */
export function registerWatchTabContextPane(
  win: _ZoteroTypes.MainWindow,
): void {
  try {
    const tabs = win.Zotero_Tabs as unknown as {
      _hasContextPaneTypes: string[];
    };
    if (!tabs._hasContextPaneTypes.includes(WATCH_TAB_TYPE)) {
      tabs._hasContextPaneTypes.push(WATCH_TAB_TYPE);
    }
  } catch (err) {
    ztoolkit.log("registerWatchTabContextPane failed", err);
  }
}

export function unregisterWatchTabContextPane(
  win: _ZoteroTypes.MainWindow,
): void {
  try {
    const tabs = win.Zotero_Tabs as unknown as {
      _hasContextPaneTypes: string[];
    };
    tabs._hasContextPaneTypes = tabs._hasContextPaneTypes.filter(
      (t) => t !== WATCH_TAB_TYPE,
    );
  } catch {
    // ignore
  }
}

/** Keep library selection in sync when a watch tab is focused. */
export function registerWatchTabSelectionSync(): string {
  const callback = {
    notify: (
      event: string,
      type: string,
      ids: Array<string | number>,
      extraData: { [key: string]: { type?: string } },
    ) => {
      if (!addon?.data.alive) return;
      if (type !== "tab" || event !== "select") return;
      const tabID = String(ids[0] ?? "");
      const tabType = extraData?.[tabID]?.type;
      if (
        tabType !== WATCH_TAB_TYPE &&
        !tabID.startsWith(`${WATCH_TAB_TYPE}-`)
      ) {
        return;
      }
      void syncLibrarySelectionForWatchTab(tabID);
    },
  };
  return String(Zotero.Notifier.registerObserver(callback, ["tab"]));
}

async function syncLibrarySelectionForWatchTab(tabID: string): Promise<void> {
  try {
    const win = Zotero.getMainWindow();
    if (!win) return;
    const tab = (
      win.Zotero_Tabs as unknown as {
        _getTab: (id: string) => { tab?: { data?: { itemID?: number } } };
      }
    )._getTab(tabID)?.tab;
    let itemID = tab?.data?.itemID;
    if (itemID == null) {
      const match = /^yt-watch-(\d+)$/.exec(tabID);
      if (match) itemID = Number(match[1]);
    }
    if (itemID == null || !Number.isFinite(itemID)) return;
    await selectItemInLibrary(itemID);
  } catch (err) {
    ztoolkit.log("syncLibrarySelectionForWatchTab failed", err);
  }
}

async function selectItemInLibrary(itemID: number): Promise<void> {
  const item = Zotero.Items.get(itemID);
  if (!item) return;
  const parentID = item.isRegularItem()
    ? item.id
    : item.parentItemID || item.id;
  const win = Zotero.getMainWindow();
  const pane = (Zotero.getActiveZoteroPane?.() ||
    (win as { ZoteroPane?: unknown } | null)?.ZoteroPane) as
    | {
        selectItem: (
          id: number,
          options?: { noTabSwitch?: boolean },
        ) => Promise<boolean> | boolean;
      }
    | undefined;
  if (!pane?.selectItem) return;
  try {
    // Keep the watch tab selected — default selectItem jumps to library.
    await pane.selectItem(parentID, { noTabSwitch: true });
  } catch (err) {
    ztoolkit.log("selectItemInLibrary failed", err);
  }
}

/** Re-fire tab select so the context pane binds after itemID is set. */
function refreshWatchTabContextPane(
  win: _ZoteroTypes.MainWindow,
  itemID: number,
): void {
  const tabId = watchTabId(itemID);
  try {
    if (win.Zotero_Tabs.selectedID !== tabId) return;
    Zotero.Notifier.trigger(
      "select",
      "tab",
      [tabId] as unknown as number[],
      { [tabId]: { type: WATCH_TAB_TYPE } },
      true,
    );
  } catch (err) {
    ztoolkit.log("refreshWatchTabContextPane failed", err);
  }
}

function ensureWatchTabItemData(
  win: _ZoteroTypes.MainWindow,
  itemID: number,
): void {
  try {
    const tabId = watchTabId(itemID);
    const result = (
      win.Zotero_Tabs as unknown as {
        _getTab: (id: string) => {
          tab?: { data?: Record<string, unknown> };
        };
      }
    )._getTab(tabId);
    const tab = result?.tab;
    if (!tab) return;
    tab.data = {
      ...(tab.data || {}),
      itemID,
      icon: "videoRecording",
    };
  } catch {
    // tab may not exist yet
  }
}

function mountIntoRoot(
  win: _ZoteroTypes.MainWindow,
  itemID: number,
  root: HTMLElement,
): void {
  root.style.width = "100%";
  root.style.height = "100%";
  root.style.minHeight = "0";
  root.style.display = "flex";
  root.style.flexDirection = "column";
  root.style.overflow = "hidden";
  // XUL/HTML deck panels often need absolute fill to get a real height.
  root.style.position = "absolute";
  root.style.inset = "0";

  renderComponent(
    win,
    root,
    watchTree({ itemID }),
    `tab-yt-watch-${itemID}`,
    `yt-watch:${itemID}`,
  );
}

function findWatchRoot(
  win: _ZoteroTypes.MainWindow,
  itemID: number,
): HTMLElement | null {
  const byId = win.document.getElementById(`yt-watch-root-${itemID}`);
  if (byId) return byId as HTMLElement;

  // Fall back: selected tab-content first element.
  try {
    const tabId = watchTabId(itemID);
    const panel = win.document.getElementById(tabId);
    const child = panel?.firstElementChild;
    if (child && child.nodeType === 1) {
      return child as HTMLElement;
    }
  } catch {
    // ignore
  }
  return null;
}

/**
 * Open (or focus) the watch tab and ensure Preact actually mounts.
 * TabManager.ensureRendered can race tab-content creation and leave a blank panel.
 * When already mounted, skip remount so timestamp seeks stay smooth.
 */
export function openWatchTab(
  itemID: number,
  options?: OpenWatchTabOptions,
): void {
  const win = Zotero.getMainWindow();
  if (!win) return;

  registerWatchTabContextPane(win);

  if (options?.seekMs != null && Number.isFinite(options.seekMs)) {
    requestWatchSeek(itemID, options.seekMs);
  }

  try {
    watchTabManager.open(win, { itemID });
  } catch (err) {
    ztoolkit.log("watchTabManager.open failed", err);
  }

  // Context pane + "Show in Library" read tab.data.itemID.
  ensureWatchTabItemData(win, itemID);
  refreshWatchTabContextPane(win, itemID);
  void selectItemInLibrary(itemID);

  const existing = findWatchRoot(win, itemID);
  if (existing && existing.childElementCount > 0) {
    // Already live — seek is delivered via watch-seek subscribers.
    return;
  }

  const attempt = (label: string): boolean => {
    const root = findWatchRoot(win, itemID);
    if (!root) {
      ztoolkit.log(`openWatchTab(${label}): root missing for`, itemID);
      return false;
    }
    try {
      mountIntoRoot(win, itemID, root);
      ztoolkit.log(
        `openWatchTab(${label}): mounted`,
        itemID,
        root.childElementCount,
      );
      return root.childElementCount > 0;
    } catch (err) {
      ztoolkit.log(`openWatchTab(${label}): mount failed`, err);
      root.textContent = `Watch tab mount failed: ${
        err instanceof Error ? err.message : String(err)
      }`;
      return false;
    }
  };

  if (attempt("sync")) return;

  // Tab-content nodes are sometimes not queryable until after the current turn.
  win.setTimeout(() => {
    if (attempt("timeout0")) return;
    win.setTimeout(() => attempt("timeout50"), 50);
  }, 0);
}
