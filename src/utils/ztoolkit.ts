import {
  BasicTool,
  DialogHelper,
  makeHelperTool,
  MenuManager,
  ProgressWindowHelper,
  UITool,
  unregister,
} from "zotero-plugin-toolkit";
import { config } from "../../package.json";

export { createZToolkit };

/**
 * Custom toolkit that only loads helpers we use.
 * Omitting PromptManager avoids registering the debug-only
 * zotero://plugin and zotero://ztoolkit-debug protocol handlers
 * that full ZoteroToolkit ships in toolkit 5.x.
 * @see https://github.com/janbaykara/zotero-youtube-transcripts/issues/8
 */
class MyToolkit extends BasicTool {
  UI = new UITool(this);
  Menu = new MenuManager(this);
  ProgressWindow = makeHelperTool(ProgressWindowHelper, this);
  Dialog = makeHelperTool(DialogHelper, this);

  unregisterAll() {
    unregister(this);
  }
}

function createZToolkit() {
  const _ztoolkit = new MyToolkit();
  initZToolkit(_ztoolkit);
  return _ztoolkit;
}

function initZToolkit(_ztoolkit: ReturnType<typeof createZToolkit>) {
  const env = __env__;
  _ztoolkit.basicOptions.log.prefix = `[${config.addonName}]`;
  _ztoolkit.basicOptions.log.disableConsole = env === "production";
  _ztoolkit.UI.basicOptions.ui.enableElementJSONLog = __env__ === "development";
  _ztoolkit.UI.basicOptions.ui.enableElementDOMLog = __env__ === "development";
  // Getting basicOptions.debug will load global modules like the debug bridge.
  // since we want to deprecate it, should avoid using it unless necessary.
  // _ztoolkit.basicOptions.debug.disableDebugBridgePassword =
  //   __env__ === "development";
  _ztoolkit.basicOptions.api.pluginID = config.addonID;
  _ztoolkit.ProgressWindow.setIconURI(
    "default",
    `chrome://${config.addonRef}/content/icons/favicon.png`,
  );
}
