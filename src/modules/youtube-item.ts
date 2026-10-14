import { extractYouTubeUrlFromText, isValidYouTubeUrl } from "../youtube/url";

export const TRANSCRIPT_ATTACHMENT_TITLE = "YouTube Transcript";
export const TRANSCRIPT_TAG = "youtube-transcript";

/** Resolve a YouTube watch URL from a library item. */
export function getYouTubeUrlFromItem(item: Zotero.Item): string | null {
  const parent = item.isAttachment()
    ? (item.parentItem ?? item)
    : item.isNote()
      ? (item.parentItem ?? item)
      : item;

  const urlField = parent.getField("url");
  if (typeof urlField === "string" && isValidYouTubeUrl(urlField)) {
    return urlField;
  }

  const fromExtra = extractYouTubeUrlFromText(
    String(parent.getField("extra") || ""),
  );
  if (fromExtra) return fromExtra;

  const attachmentIDs = parent.getAttachments();
  for (const id of attachmentIDs) {
    const attachment = Zotero.Items.get(id);
    if (!attachment?.isAttachment()) continue;
    if (
      attachment.attachmentLinkMode !== Zotero.Attachments.LINK_MODE_LINKED_URL
    ) {
      continue;
    }
    const linked = attachment.getField("url");
    if (typeof linked === "string" && isValidYouTubeUrl(linked)) {
      return linked;
    }
  }

  return null;
}

export function itemHasYouTubeUrl(item: Zotero.Item): boolean {
  return getYouTubeUrlFromItem(item) !== null;
}

export function findTranscriptAttachment(
  item: Zotero.Item,
): Zotero.Item | null {
  const parent =
    item.isAttachment() || item.isNote() ? (item.parentItem ?? item) : item;

  for (const id of parent.getAttachments()) {
    const attachment = Zotero.Items.get(id);
    if (!attachment?.isAttachment()) continue;
    const title = attachment.getField("title");
    if (title === TRANSCRIPT_ATTACHMENT_TITLE) {
      return attachment;
    }
    if (
      attachment.getTags().some((t) => t.tag === TRANSCRIPT_TAG) &&
      attachment.attachmentContentType === "text/html"
    ) {
      return attachment;
    }
  }
  return null;
}

export function getRegularItem(item: Zotero.Item): Zotero.Item | null {
  if (item.isRegularItem()) return item;
  if (item.isAttachment() || item.isNote()) {
    return item.parentItem ?? null;
  }
  return null;
}
