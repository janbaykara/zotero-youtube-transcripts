/**
 * Wire workspace packages that need host chrome globals once at startup.
 * Only `@janbaykara/zotero-preact` requires configure; other packages use
 * `Zotero` / call-site options.
 */

import { configureZoteroPreact } from "@janbaykara/zotero-preact";
import { zoteroCache } from "@janbaykara/zotero-cache";

import { getCSSUrl } from "./css";

export function configureWorkspacePackages(): void {
  const log = (...args: unknown[]) => {
    try {
      ztoolkit.log(...args);
    } catch {
      // tests / early boot
    }
  };

  configureZoteroPreact({
    log,
    getMainWindow: () => ztoolkit.getGlobal("Zotero").getMainWindow(),
    getTabs: () => ztoolkit.getGlobal("Zotero_Tabs"),
    // Toolkit major versions can differ across sibling checkouts; cast at the seam.
    createDialog: (rows, cols) => new ztoolkit.Dialog(rows, cols) as any,
    getStylesheetUrl: getCSSUrl,
    isTestEnv: () => false,
    getSingletonDialog: () => addon.data.dialog,
    setSingletonDialog: (dialog) => {
      addon.data.dialog = dialog;
    },
    dialogRootIdPrefix: "youtubetranscripts-dialog",
  });

  try {
    zoteroCache.initialize();
  } catch (err) {
    log("zoteroCache.initialize failed", err);
  }
}
