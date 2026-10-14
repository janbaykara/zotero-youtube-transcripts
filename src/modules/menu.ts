import { getString } from "../utils/locale";
import { fetchAndAttachForItems } from "./fetch-and-attach";
import { itemHasYouTubeUrl } from "./youtube-item";

export function registerItemMenu(): void {
  const menuIcon = `chrome://${addon.data.config.addonRef}/content/icons/favicon@0.5x.png`;

  ztoolkit.Menu.register("item", {
    tag: "menuitem",
    id: "zotero-itemmenu-youtubetranscripts-get",
    label: getString("menuitem-get-transcript"),
    icon: menuIcon,
    getVisibility: () => {
      const selected = Zotero.getActiveZoteroPane()?.getSelectedItems() ?? [];
      return selected.some((item) => itemHasYouTubeUrl(item));
    },
    commandListener: () => {
      void onGetTranscriptCommand();
    },
  });
}

async function onGetTranscriptCommand(): Promise<void> {
  const selected = Zotero.getActiveZoteroPane()?.getSelectedItems() ?? [];
  const targets = selected.filter((item) => itemHasYouTubeUrl(item));
  if (targets.length === 0) return;
  await fetchAndAttachForItems(targets, { replaceExisting: true });
}
