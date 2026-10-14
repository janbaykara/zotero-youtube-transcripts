import { createRequire } from "node:module";
import { dirname, join } from "node:path";

import { defineConfig } from "zotero-plugin-scaffold";

import pkg from "./package.json";

const require = createRequire(import.meta.url);
const preactRoot = dirname(require.resolve("preact/package.json"));

/**
 * file: deps under zotero-syllabus bring their own nested `preact`, which
 * duplicates hooks state (`__H` undefined). Pin every Preact import here.
 */
const preactAliases = {
  preact: join(preactRoot, "dist/preact.module.js"),
  "preact/hooks": join(preactRoot, "hooks/dist/hooks.module.js"),
  "preact/jsx-runtime": join(
    preactRoot,
    "jsx-runtime/dist/jsxRuntime.module.js",
  ),
  "preact/jsx-dev-runtime": join(
    preactRoot,
    "jsx-runtime/dist/jsxRuntime.module.js",
  ),
  "preact/compat": join(preactRoot, "compat/dist/compat.module.js"),
};

export default defineConfig({
  source: ["src", "addon"],
  dist: ".scaffold/build",
  name: pkg.config.addonName,
  id: pkg.config.addonID,
  namespace: pkg.config.addonRef,
  updateURL: `https://github.com/{{owner}}/{{repo}}/releases/download/release/${
    pkg.version.includes("-") ? "update-beta.json" : "update.json"
  }`,
  xpiDownloadLink:
    "https://github.com/{{owner}}/{{repo}}/releases/download/v{{version}}/{{xpiName}}.xpi",

  build: {
    assets: ["addon/**/*.*"],
    define: {
      ...pkg.config,
      author: pkg.author,
      description: pkg.description,
      homepage: pkg.homepage,
      buildVersion: pkg.version,
      buildTime: "{{buildTime}}",
    },
    prefs: {
      prefix: pkg.config.prefsPrefix,
    },
    esbuildOptions: [
      {
        entryPoints: ["src/index.ts"],
        define: {
          __env__: `"${process.env.NODE_ENV}"`,
        },
        bundle: true,
        target: "firefox115",
        outfile: `.scaffold/build/addon/content/scripts/${pkg.config.addonRef}.js`,
        jsx: "automatic",
        jsxImportSource: "preact",
        alias: {
          ...preactAliases,
          react: preactAliases["preact/compat"],
          "react-dom": preactAliases["preact/compat"],
          "react/jsx-runtime": preactAliases["preact/jsx-runtime"],
        },
      },
    ],
  },

  test: {
    waitForPlugin: `() => Zotero.${pkg.config.addonInstance}.data.initialized`,
  },
});
