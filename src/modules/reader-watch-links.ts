import { watchProtocolExtensionSpec } from "./watch-protocol-url";
import {
  TRANSCRIPT_ATTACHMENT_TITLE,
  TRANSCRIPT_TAG,
} from "./youtube-item";

type ReaderView = {
  _iframeWindow?: Window;
  initializedPromise?: Promise<void>;
};

type ReaderLike = {
  itemID?: number;
  _internalReader?: {
    _primaryView?: ReaderView;
    _secondaryView?: ReaderView;
  };
};

const attachedWindows = new WeakSet<Window>();
let notifierID: string | null = null;

function isTranscriptAttachment(item: Zotero.Item): boolean {
  if (!item.isAttachment()) return false;
  if (item.getField("title") === TRANSCRIPT_ATTACHMENT_TITLE) return true;
  return (
    item.attachmentContentType === "text/html" &&
    item.getTags().some((t) => t.tag === TRANSCRIPT_TAG)
  );
}

function isWatchHref(href: string | null | undefined): boolean {
  if (!href) return false;
  const spec = watchProtocolExtensionSpec();
  return href === spec || href.startsWith(`${spec}/`);
}

function findAnchor(event: MouseEvent): Element | null {
  const path =
    typeof event.composedPath === "function" ? event.composedPath() : [];
  for (const node of path) {
    if (
      node &&
      typeof node === "object" &&
      "localName" in node &&
      (node as Element).localName === "a"
    ) {
      return node as Element;
    }
  }
  let target = event.target as Node | null;
  if (target && target.nodeType === 3) {
    target = target.parentElement;
  }
  if (target && typeof (target as Element).closest === "function") {
    return (target as Element).closest("a");
  }
  return null;
}

function openWatchHref(href: string): void {
  try {
    const win = Zotero.getMainWindow();
    if (win?.ZoteroPane?.loadURI) {
      win.ZoteroPane.loadURI(href);
      return;
    }
  } catch (err) {
    ztoolkit.log("reader-watch-links: loadURI failed", err);
  }

  try {
    const uri = Services.io.newURI(href);
    const ph = Services.io.getProtocolHandler("zotero").wrappedJSObject as {
      _extensions: Record<
        string,
        { doAction?: (uri: nsIURI) => void | Promise<void> }
      >;
    };
    const ext = ph._extensions[watchProtocolExtensionSpec()];
    void ext?.doAction?.(uri);
  } catch (err) {
    ztoolkit.log("reader-watch-links: doAction failed", err);
  }
}

function onContentClick(event: MouseEvent): void {
  const link = findAnchor(event);
  if (!link) return;
  const href = link.getAttribute("href");
  if (!isWatchHref(href)) return;

  // Snapshot reader treats non-http(s) links as in-document; intercept first.
  event.preventDefault();
  event.stopImmediatePropagation();
  openWatchHref(href!);
}

function attachToContentWindow(win: Window | null | undefined): void {
  if (!win || attachedWindows.has(win)) return;
  attachedWindows.add(win);
  win.addEventListener("click", onContentClick, true);
}

async function wait(ms: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function attachToReader(reader: ReaderLike): Promise<void> {
  if (!reader.itemID) return;
  const item = Zotero.Items.get(reader.itemID);
  if (!item || !isTranscriptAttachment(item)) return;

  try {
    await reader._internalReader?._primaryView?.initializedPromise;
  } catch {
    // ignore
  }

  for (let attempt = 0; attempt < 40; attempt++) {
    const primary = reader._internalReader?._primaryView?._iframeWindow;
    if (primary) {
      attachToContentWindow(primary);
      attachToContentWindow(
        reader._internalReader?._secondaryView?._iframeWindow,
      );
      return;
    }
    await wait(100);
  }
}

async function attachToTab(tabID: string): Promise<void> {
  const reader = Zotero.Reader.getByTabID(tabID) as ReaderLike | false;
  if (reader) await attachToReader(reader);
}

function attachToOpenReaders(): void {
  const readers =
    (
      Zotero.Reader as unknown as {
        _readers?: ReaderLike[];
      }
    )._readers ?? [];
  for (const reader of readers) {
    void attachToReader(reader);
  }
}

export function registerReaderWatchLinks(): string {
  attachToOpenReaders();

  notifierID = Zotero.Notifier.registerObserver(
    {
      notify(event, type, ids) {
        if (type !== "tab") return;
        if (event !== "select" && event !== "add") return;
        for (const id of ids) {
          void attachToTab(String(id));
        }
      },
    },
    ["tab"],
    "youtubetranscripts-reader-watch-links",
  );
  return notifierID;
}

export function unregisterReaderWatchLinks(): void {
  if (notifierID) {
    Zotero.Notifier.unregisterObserver(notifierID);
    notifierID = null;
  }
}
