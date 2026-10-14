import { openWatchTab } from "./watch-tab";
import { watchProtocolExtensionSpec } from "./watch-protocol-url";

const WATCH_PATH_PREFIX = "watch/";

type ProtocolExtension = {
  noContent: true;
  doAction: (uri: nsIURI) => Promise<void>;
  newChannel: (uri: nsIURI) => void;
};

function parseSeekMsFromPath(pathWithQuery: string): number | undefined {
  const q = pathWithQuery.indexOf("?");
  if (q < 0) return undefined;
  const query = pathWithQuery.slice(q + 1);
  for (const part of query.split("&")) {
    const [rawKey, rawVal = ""] = part.split("=");
    if (rawKey !== "t") continue;
    const n = Number(decodeURIComponent(rawVal));
    if (Number.isFinite(n) && n >= 0) return Math.floor(n);
  }
  return undefined;
}

async function resolveItemFromWatchPath(
  path: string,
): Promise<Zotero.Item | null> {
  const params: {
    libraryID?: number;
    groupID?: string;
    objectKey?: string;
  } = {};
  // Zotero.Router is untyped in the plugin typings.
  const Router = (
    Zotero as unknown as {
      Router: new (p: object) => {
        add: (route: string, cb?: () => void) => void;
        run: (path: string) => void;
      };
    }
  ).Router;
  const router = new Router(params);
  router.add("library/items/:objectKey", () => {
    params.libraryID = Zotero.Libraries.userLibraryID;
  });
  router.add("groups/:groupID/items/:objectKey");
  router.run(path);

  if (params.groupID) {
    const libraryID = Zotero.Groups.getLibraryIDFromGroupID(
      Number(params.groupID),
    );
    if (!libraryID) return null;
    params.libraryID = libraryID;
  }
  if (!params.libraryID || !params.objectKey) return null;

  return (
    (await Zotero.Items.getByLibraryAndKeyAsync(
      params.libraryID,
      params.objectKey,
    )) || null
  );
}

async function handleWatchUri(uri: nsIURI): Promise<void> {
  try {
    let path = uri.pathQueryRef || "";
    if (path.startsWith("/")) path = path.substring(1);
    if (!path.startsWith(WATCH_PATH_PREFIX)) {
      ztoolkit.log("watch-protocol: unknown path", path);
      return;
    }
    path = path.substring(WATCH_PATH_PREFIX.length);
    const seekMs = parseSeekMsFromPath(path);
    const pathOnly = path.includes("?")
      ? path.slice(0, path.indexOf("?"))
      : path;

    const item = await resolveItemFromWatchPath(pathOnly);
    if (!item) {
      ztoolkit.log("watch-protocol: item not found", pathOnly);
      return;
    }

    const parent = item.isRegularItem()
      ? item
      : item.parentItemID
        ? Zotero.Items.get(item.parentItemID)
        : null;
    if (!parent?.isRegularItem()) {
      ztoolkit.log("watch-protocol: no regular parent for", item.id);
      return;
    }

    openWatchTab(parent.id, seekMs != null ? { seekMs } : undefined);
  } catch (err) {
    ztoolkit.log("watch-protocol: failed", err);
  }
}

export function registerWatchProtocol(): void {
  try {
    const ph = Services.io.getProtocolHandler("zotero").wrappedJSObject as {
      _extensions: Record<string, ProtocolExtension>;
    };
    const spec = watchProtocolExtensionSpec();
    const extension: ProtocolExtension = {
      noContent: true,
      doAction: handleWatchUri,
      newChannel(uri) {
        void this.doAction(uri);
      },
    };
    ph._extensions[spec] = extension;
    ztoolkit.log("watch-protocol: registered", spec);
  } catch (err) {
    ztoolkit.log("watch-protocol: register failed", err);
  }
}

export function unregisterWatchProtocol(): void {
  try {
    const ph = Services.io.getProtocolHandler("zotero").wrappedJSObject as {
      _extensions: Record<string, ProtocolExtension>;
    };
    delete ph._extensions[watchProtocolExtensionSpec()];
  } catch {
    // ignore
  }
}

export { buildWatchProtocolUrl } from "./watch-protocol-url";
