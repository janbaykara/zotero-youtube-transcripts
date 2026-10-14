import { registerItemMenu } from "./modules/menu";
import { registerNotifier, registerPrefs } from "./modules/notifier";
import {
  registerReaderWatchLinks,
  unregisterReaderWatchLinks,
} from "./modules/reader-watch-links";
import {
  registerWatchProtocol,
  unregisterWatchProtocol,
} from "./modules/watch-protocol";
import {
  registerViewItemsHook,
  unregisterViewItemsHook,
} from "./modules/view-items-hook";
import {
  registerWatchTabContextPane,
  registerWatchTabSelectionSync,
  unregisterWatchTabContextPane,
} from "./modules/watch-tab";
import {
  registerWatchTabAudioHook,
  unregisterWatchTabAudioHook,
} from "./modules/watch-tab-audio";
import { configureWorkspacePackages } from "./utils/configurePackages";
import { initLocale } from "./utils/locale";
import { createZToolkit } from "./utils/ztoolkit";

let watchTabSelectionNotifierID: string | null = null;

async function onStartup() {
  await Promise.all([
    Zotero.initializationPromise,
    Zotero.unlockPromise,
    Zotero.uiReadyPromise,
  ]);

  initLocale();
  configureWorkspacePackages();
  registerPrefs();
  registerNotifier();
  registerWatchProtocol();
  registerWatchTabAudioHook();
  watchTabSelectionNotifierID = registerWatchTabSelectionSync();
  registerReaderWatchLinks();

  await Promise.all(
    Zotero.getMainWindows().map((win) => onMainWindowLoad(win)),
  );

  addon.data.initialized = true;
}

async function onMainWindowLoad(win: _ZoteroTypes.MainWindow): Promise<void> {
  addon.data.ztoolkit = createZToolkit();

  win.MozXULElement.insertFTLIfNeeded(
    `${addon.data.config.addonRef}-mainWindow.ftl`,
  );

  // Inject / refresh watch-tab stylesheets (cache-bust so hot reload picks up CSS).
  const doc = win.document;
  const sheets = [
    ["tailwind-css", "tailwind.css"],
    ["pane-css", "zoteroPane.css"],
  ] as const;
  const bust = Date.now();
  for (const [suffix, file] of sheets) {
    const cssId = `${addon.data.config.addonRef}-${suffix}`;
    const href = `chrome://${addon.data.config.addonRef}/content/${file}?t=${bust}`;
    const existing = doc.getElementById(cssId) as HTMLLinkElement | null;
    if (existing) {
      existing.href = href;
      continue;
    }
    const link = doc.createElement("link");
    link.id = cssId;
    link.rel = "stylesheet";
    link.href = href;
    doc.documentElement.appendChild(link);
  }

  registerWatchTabContextPane(win);
  // Re-bind after window / hot-reload so tabHooks.toggleAudio.yt stays live.
  registerWatchTabAudioHook();
  registerViewItemsHook(win);
  registerItemMenu();
}

async function onMainWindowUnload(win: Window): Promise<void> {
  try {
    unregisterViewItemsHook(win as _ZoteroTypes.MainWindow);
    unregisterWatchTabContextPane(win as _ZoteroTypes.MainWindow);
  } catch {
    // ignore
  }
  ztoolkit.unregisterAll();
}

function onShutdown(): void {
  unregisterWatchProtocol();
  unregisterReaderWatchLinks();
  unregisterWatchTabAudioHook();
  if (watchTabSelectionNotifierID) {
    Zotero.Notifier.unregisterObserver(watchTabSelectionNotifierID);
    watchTabSelectionNotifierID = null;
  }
  for (const win of Zotero.getMainWindows()) {
    try {
      unregisterViewItemsHook(win);
      unregisterWatchTabContextPane(win);
    } catch {
      // ignore
    }
  }
  ztoolkit.unregisterAll();
  addon.data.alive = false;
  // @ts-expect-error - Plugin instance is not typed
  delete Zotero[addon.data.config.addonInstance];
}

export default {
  onStartup,
  onShutdown,
  onMainWindowLoad,
  onMainWindowUnload,
};
