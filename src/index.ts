import { BasicTool } from "zotero-plugin-toolkit";
import Addon from "./addon";
import { config } from "../package.json";

const basicTool = new BasicTool();

const ZoteroGlobal = basicTool.getGlobal("Zotero") as typeof Zotero &
  Record<string, { data?: { alive?: boolean } } | undefined>;
// Replace any prior instance so scaffold/hot reload picks up new hooks.
const prior = ZoteroGlobal[config.addonInstance];
if (prior) {
  try {
    if (prior.data) prior.data.alive = false;
  } catch {
    // ignore
  }
  delete ZoteroGlobal[config.addonInstance];
}

_globalThis.addon = new Addon();
defineGlobal("ztoolkit", () => {
  return _globalThis.addon.data.ztoolkit;
});
// @ts-expect-error - Plugin instance is not typed
Zotero[config.addonInstance] = addon;

function defineGlobal(name: Parameters<BasicTool["getGlobal"]>[0]): void;
function defineGlobal(name: string, getter: () => any): void;
function defineGlobal(name: string, getter?: () => any) {
  Object.defineProperty(_globalThis, name, {
    get() {
      return getter ? getter() : basicTool.getGlobal(name);
    },
  });
}
