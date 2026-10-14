import { getCachedItem } from "@janbaykara/zotero-cache";

import {
  type EmbeddedTranscriptData,
  parseEmbeddedTranscriptData,
} from "../transcript/embedded-data";
import { formatTranscriptHtml } from "../transcript/format-html";
import { getString } from "../utils/locale";
import { getPref } from "../utils/prefs";
import { fetchAndAttachTranscript } from "./fetch-and-attach";
import { buildWatchProtocolUrl } from "./watch-protocol-url";
import {
  findTranscriptAttachment,
  getRegularItem,
  getYouTubeUrlFromItem,
} from "./youtube-item";

export async function readTranscriptAttachmentHtml(
  attachment: Zotero.Item,
): Promise<{ path: string; html: string } | null> {
  try {
    const path = (await attachment.getFilePathAsync()) as string | false;
    if (!path) return null;
    const html = await Zotero.File.getContentsAsync(path);
    if (typeof html !== "string") return null;
    return { path, html };
  } catch (err) {
    ztoolkit.log("readTranscriptAttachmentHtml failed", err);
    return null;
  }
}

export async function readTranscriptAttachmentData(
  attachment: Zotero.Item,
): Promise<EmbeddedTranscriptData | null> {
  const file = await readTranscriptAttachmentHtml(attachment);
  if (!file) return null;
  return parseEmbeddedTranscriptData(file.html);
}

/**
 * Rewrite older HTML attachments so each line has a stable #yt-l-* anchor
 * and the meta block links to the watch tab.
 */
export async function ensureTranscriptLineAnchors(
  attachment: Zotero.Item,
  data: EmbeddedTranscriptData,
  parent?: Zotero.Item | null,
): Promise<void> {
  const file = await readTranscriptAttachmentHtml(attachment);
  if (!file) return;
  const hasAnchors = /id="yt-l-\d+"/.test(file.html);
  const hasWatchLink = file.html.includes(
    `zotero://${addon.data.config.addonRef}/watch/`,
  );
  // Older HTML linked timestamps to YouTube; rewrite to watch-tab seeks.
  const hasWatchTimestamps = /class="ts"><a href="zotero:\/\//.test(file.html);
  // Prefer CSS attr() timestamps so reader selections skip stamp text.
  const hasCssTimestamps = /data-time="/.test(file.html);
  if (hasAnchors && hasWatchLink && hasWatchTimestamps && hasCssTimestamps) {
    return;
  }

  try {
    const html = formatTranscriptHtml(
      { title: data.title, lines: data.lines },
      data.url,
      {
        timestampMod: getPref("timestampMod"),
        watchUrl: parent ? buildWatchProtocolUrl(parent) : undefined,
        watchLabel: getString("transcript-html-open-watch"),
      },
    );
    if (!html) return;
    await Zotero.File.putContentsAsync(file.path, html);
    ztoolkit.log("ensureTranscriptLineAnchors: upgraded HTML transcript");
  } catch (err) {
    ztoolkit.log("ensureTranscriptLineAnchors failed", err);
  }
}

/**
 * CssSelector annotation positions only work in the snapshot reader, which
 * requires LINK_MODE_IMPORTED_URL (importFromFile creates IMPORTED_FILE).
 */
export async function ensureTranscriptSnapshotAttachment(
  attachment: Zotero.Item,
  sourceUrl?: string,
): Promise<void> {
  try {
    if (attachment.isSnapshotAttachment?.()) return;
    if (attachment.attachmentContentType !== "text/html") return;

    attachment.attachmentLinkMode = Zotero.Attachments.LINK_MODE_IMPORTED_URL;
    const url = sourceUrl || attachment.getField("url") || "";
    if (url) {
      attachment.setField("url", url);
    }
    await attachment.saveTx();
    ztoolkit.log("ensureTranscriptSnapshotAttachment: converted to snapshot");
  } catch (err) {
    ztoolkit.log("ensureTranscriptSnapshotAttachment failed", err);
  }
}

/** Convert TextQuoteSelector refinements that crash the snapshot reader. */
export async function repairTranscriptAnnotationPositions(
  attachment: Zotero.Item,
): Promise<void> {
  try {
    await attachment.loadDataType("childItems");
  } catch {
    return;
  }

  let annotations: Zotero.Item[] = [];
  try {
    annotations = attachment.getAnnotations?.(false) || [];
  } catch {
    return;
  }

  const file = await readTranscriptAttachmentHtml(attachment);
  if (!file) return;

  for (const ann of annotations) {
    let pos: {
      type?: string;
      value?: string;
      refinedBy?: {
        type?: string;
        exact?: string;
        start?: number;
        end?: number;
      };
    };
    try {
      pos = JSON.parse(ann.annotationPosition || "");
    } catch {
      continue;
    }
    if (
      pos?.type !== "CssSelector" ||
      pos.refinedBy?.type !== "TextQuoteSelector"
    ) {
      continue;
    }

    const exact = (pos.refinedBy.exact || ann.annotationText || "").trim();
    const id = String(pos.value || "").replace(/^#/, "");
    const match = id
      ? file.html.match(
          new RegExp(
            `id="${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}">([^<]*)`,
          ),
        )
      : null;
    const cell = match?.[1] ?? "";
    const start = exact && cell ? cell.indexOf(exact) : -1;
    const end = start >= 0 ? start + exact.length : Math.max(1, exact.length);

    pos.refinedBy = {
      type: "TextPositionSelector",
      start: start >= 0 ? start : 0,
      end,
    };
    try {
      ann.annotationPosition = JSON.stringify(pos);
      await ann.saveTx();
    } catch (err) {
      ztoolkit.log("repairTranscriptAnnotationPositions failed", err);
    }
  }
}

export async function ensureTranscriptAttachment(item: Zotero.Item): Promise<{
  parent: Zotero.Item;
  attachment: Zotero.Item;
  data: EmbeddedTranscriptData;
} | null> {
  const parent = getRegularItem(item);
  if (!parent || !getYouTubeUrlFromItem(parent)) {
    return null;
  }

  let attachment = findTranscriptAttachment(parent);
  if (!attachment) {
    const result = await fetchAndAttachTranscript(parent, {
      replaceExisting: false,
      showProgress: true,
    });
    if (result !== "attached" && result !== "skipped") {
      return null;
    }
    attachment = findTranscriptAttachment(parent);
  }

  if (!attachment) return null;

  let data = await readTranscriptAttachmentData(attachment);
  if (!data) {
    // Older attachments without embedded JSON — re-fetch once.
    const result = await fetchAndAttachTranscript(parent, {
      replaceExisting: true,
      showProgress: true,
    });
    if (result !== "attached") return null;
    attachment = findTranscriptAttachment(parent);
    if (!attachment) return null;
    data = await readTranscriptAttachmentData(attachment);
  }

  if (!data) return null;
  await ensureTranscriptLineAnchors(attachment, data, parent);
  await ensureTranscriptSnapshotAttachment(attachment, data.url);
  await repairTranscriptAnnotationPositions(attachment);
  return { parent, attachment, data };
}

export function getCachedRegularItem(itemID: number): Zotero.Item | null {
  const item = getCachedItem(itemID) ?? Zotero.Items.get(itemID);
  if (!item) return null;
  return getRegularItem(item);
}
