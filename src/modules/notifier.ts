import { getString } from "../utils/locale";
import { getPref } from "../utils/prefs";
import { fetchAndAttachTranscript } from "./fetch-and-attach";
import {
  findTranscriptAttachment,
  getYouTubeUrlFromItem,
} from "./youtube-item";

export function registerNotifier(): void {
  const callback = {
    notify: async (
      event: string,
      type: string,
      ids: number[] | string[],
      _extraData: { [key: string]: unknown },
    ) => {
      if (!addon?.data.alive) {
        unregisterNotifier(notifierID);
        return;
      }
      if (event !== "add" || type !== "item") return;
      if (!getPref("autoFetch")) return;

      for (const id of ids) {
        const item = Zotero.Items.get(id as number);
        if (!item || !item.isRegularItem()) continue;
        if (!getYouTubeUrlFromItem(item)) continue;
        if (findTranscriptAttachment(item)) continue;

        // Let Connector finish writing fields before we read the URL.
        await Zotero.Promise.delay(500);
        const refreshed = Zotero.Items.get(item.id);
        if (!refreshed || findTranscriptAttachment(refreshed)) continue;
        if (!getYouTubeUrlFromItem(refreshed)) continue;

        await fetchAndAttachTranscript(refreshed, {
          replaceExisting: false,
          showProgress: true,
        });
      }
    },
  };

  const notifierID = Zotero.Notifier.registerObserver(callback, ["item"]);

  Zotero.Plugins.addObserver({
    shutdown: ({ id }) => {
      if (id === addon.data.config.addonID) {
        unregisterNotifier(notifierID);
      }
    },
  });
}

function unregisterNotifier(notifierID: string): void {
  Zotero.Notifier.unregisterObserver(notifierID);
}

export function registerPrefs(): void {
  Zotero.PreferencePanes.register({
    pluginID: addon.data.config.addonID,
    src: rootURI + "content/preferences.xhtml",
    label: getString("prefs-title"),
    image: `chrome://${addon.data.config.addonRef}/content/icons/favicon.png`,
  });
}
