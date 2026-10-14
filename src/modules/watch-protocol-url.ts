function extensionSpec(): string {
  return `zotero://${addon.data.config.addonRef}`;
}

/**
 * Stable zotero:// URL that opens the watch tab for a regular item.
 * Optional `offsetMs` seeks to that transcript time (`?t=<ms>`).
 */
export function buildWatchProtocolUrl(
  item: Zotero.Item,
  offsetMs?: number,
): string {
  const libraryID = item.libraryID;
  const key = item.key;
  let base: string;
  try {
    const library = Zotero.Libraries.get(libraryID) as
      | { isGroup?: boolean }
      | false
      | undefined;
    if (library && library.isGroup) {
      const groupID = Zotero.Groups.getGroupIDFromLibraryID(libraryID);
      if (groupID) {
        base = `${extensionSpec()}/watch/groups/${groupID}/items/${key}`;
      } else {
        base = `${extensionSpec()}/watch/library/items/${key}`;
      }
    } else {
      base = `${extensionSpec()}/watch/library/items/${key}`;
    }
  } catch {
    base = `${extensionSpec()}/watch/library/items/${key}`;
  }

  if (offsetMs == null || !Number.isFinite(offsetMs)) return base;
  const ms = Math.max(0, Math.floor(offsetMs));
  return `${base}?t=${ms}`;
}

export function watchProtocolExtensionSpec(): string {
  return extensionSpec();
}
