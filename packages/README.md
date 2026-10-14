# Vendored workspace packages

Copies of `@janbaykara/*` libraries from [zotero-syllabus](https://github.com/janbaykara/zotero-syllabus) so CI and clones build without a sibling checkout. They are not published to npm.

| Package                 | Role                                           |
| ----------------------- | ---------------------------------------------- |
| `zotero-jotai-state`    | Prefs/Notifier subscribe helpers + Jotai atoms |
| `zotero-cache`          | Notifier-invalidated item/collection/pref LRU  |
| `zotero-chrome`         | Chrome content/skin URLs, XUL helpers          |
| `zotero-preact`         | Mount Preact into roots, tabs, dialogs         |
| `zotero-tailwind-theme` | Tailwind `@theme` → Zotero CSS tokens          |
