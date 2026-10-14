/** Stylesheet URL for Preact chrome mounts (watch tab, dialogs). */
export function getCSSUrl(): string {
  return `chrome://${addon.data.config.addonRef}/content/tailwind.css`;
}
