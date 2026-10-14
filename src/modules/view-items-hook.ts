import {
  getRegularItem,
  itemHasYouTubeUrl,
  TRANSCRIPT_ATTACHMENT_TITLE,
  TRANSCRIPT_TAG,
} from "./youtube-item";
import { openWatchTab } from "./watch-tab";

type ActivateFn = (event: Event, items: Zotero.Item[]) => void;

type PaneWithActivate = {
  onItemTreeActivate: ActivateFn;
};

type WrapRecord = {
  wrapped: ActivateFn;
  /** Function to call for non-YouTube items (whatever was current at install). */
  next: ActivateFn;
};

const WRAP_NAME = "ytWatchOnItemTreeActivate";

const wraps = new WeakMap<object, WrapRecord>();
const pendingTimers = new WeakMap<object, number[]>();

function isOurWrap(fn: ActivateFn | null | undefined): boolean {
  if (!fn) return false;
  try {
    return fn.name === WRAP_NAME;
  } catch {
    return false;
  }
}

function isOurTranscriptAttachment(item: Zotero.Item): boolean {
  if (!item.isAttachment()) return false;
  if (item.getField("title") === TRANSCRIPT_ATTACHMENT_TITLE) return true;
  return (
    item.attachmentContentType === "text/html" &&
    item.getTags().some((t) => t.tag === TRANSCRIPT_TAG)
  );
}

/** True when activate should open the watch tab instead of default view. */
function shouldOpenWatchTab(item: Zotero.Item): boolean {
  if (!itemHasYouTubeUrl(item)) return false;
  if (item.isRegularItem()) return true;
  // Transcript HTML would otherwise open in the snapshot reader.
  return isOurTranscriptAttachment(item);
}

function install(win: _ZoteroTypes.MainWindow): void {
  const pane = win.ZoteroPane as unknown as PaneWithActivate | undefined;
  if (!pane?.onItemTreeActivate) return;

  // Still our outermost wrap — nothing to do.
  if (isOurWrap(pane.onItemTreeActivate)) return;

  // Another plugin may have replaced us; wrap whatever is current so we stay outermost.
  const next = pane.onItemTreeActivate.bind(pane) as ActivateFn;

  const wrapped = {
    [WRAP_NAME](event: Event, items: Zotero.Item[]) {
      if (!addon?.data.alive) {
        return next(event, items);
      }

      const list = Array.isArray(items) ? items : [];
      if (list.length === 1 && shouldOpenWatchTab(list[0])) {
        const parent = getRegularItem(list[0]);
        if (parent) {
          openWatchTab(parent.id);
          return;
        }
      }

      return next(event, items);
    },
  }[WRAP_NAME] as ActivateFn;

  wraps.set(pane, { wrapped, next });
  pane.onItemTreeActivate = wrapped;
}

function clearPending(win: _ZoteroTypes.MainWindow): void {
  const timers = pendingTimers.get(win);
  if (!timers) return;
  for (const id of timers) {
    win.clearTimeout(id);
  }
  pendingTimers.delete(win);
}

/**
 * Intercept item-tree activate (double-click / Enter) before viewItems.
 * Re-installs on a short delay so we stay outside other plugins that wrap
 * ZoteroPane methods during window startup.
 */
export function registerViewItemsHook(win: _ZoteroTypes.MainWindow): void {
  clearPending(win);
  install(win);

  const timers: number[] = [];
  for (const delay of [0, 500, 2000]) {
    timers.push(
      win.setTimeout(() => {
        if (!addon?.data.alive) return;
        install(win);
      }, delay) as unknown as number,
    );
  }
  pendingTimers.set(win, timers);
}

export function unregisterViewItemsHook(win: _ZoteroTypes.MainWindow): void {
  clearPending(win);
  const pane = win.ZoteroPane as unknown as PaneWithActivate | undefined;
  if (!pane) return;
  const record = wraps.get(pane);
  if (!record) return;
  // Only unwrap if we are still the outermost handler.
  if (
    pane.onItemTreeActivate === record.wrapped ||
    isOurWrap(pane.onItemTreeActivate)
  ) {
    pane.onItemTreeActivate = record.next;
  }
  wraps.delete(pane);
}
