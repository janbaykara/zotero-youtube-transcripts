/**
 * Build snapshot-reader annotation positions from watch-tab line ranges.
 *
 * Single-line: `#yt-l-*` + cell-relative TextPositionSelector (fits the cell).
 * Multi-line: CssSelector on `tbody` + TextPositionSelector over the tbody text
 * stream (same shape the snapshot reader produces via toSelector()).
 */

import { transcriptLineAnchorId } from "./line-anchor";

export type LineRangeForPosition = {
  lineOffsetMs: number;
  start: number;
  end: number;
  text: string;
};

export type SnapshotAnnotationPosition = {
  type: "CssSelector";
  value: string;
  refinedBy?: {
    type: "TextPositionSelector";
    start: number;
    end: number;
  };
};

const SHOW_TEXT = 4;

/** Decode the entities formatTranscriptHtml / escapeHtml emit. */
function decodeBasicEntities(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

function extractTbodyInner(html: string): string | null {
  const match = /<tbody\b[^>]*>([\s\S]*?)<\/tbody>/i.exec(html);
  return match ? match[1] : null;
}

/**
 * Flatten text nodes under an HTML fragment the way
 * `document.createTreeWalker(root, NodeFilter.SHOW_TEXT)` does:
 * every run of characters outside tags, including whitespace between tags.
 *
 * Prefer {@link textPositionFromDom} in Zotero — HTML5 table parsing can drop
 * some inter-tag whitespace that a raw string walk still counts.
 */
export function flattenHtmlTextNodes(fragment: string): string {
  let out = "";
  let i = 0;
  while (i < fragment.length) {
    if (fragment[i] === "<") {
      if (fragment.startsWith("<!--", i)) {
        const end = fragment.indexOf("-->", i + 4);
        i = end < 0 ? fragment.length : end + 3;
        continue;
      }
      const close = fragment.indexOf(">", i + 1);
      if (close < 0) break;
      i = close + 1;
      continue;
    }
    const next = fragment.indexOf("<", i);
    const raw = next < 0 ? fragment.slice(i) : fragment.slice(i, next);
    out += decodeBasicEntities(raw);
    i = next < 0 ? fragment.length : next;
  }
  return out;
}

/**
 * Character range of a caption cell's text content within the tbody text
 * stream (string-walk coordinates — used when DOMParser is unavailable).
 */
export function cellTextRangeInTbody(
  tbodyInner: string,
  anchorId: string,
): { start: number; end: number; text: string } | null {
  const openRe = new RegExp(
    `<td\\b[^>]*\\bid\\s*=\\s*["']${anchorId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'][^>]*>`,
    "i",
  );
  const open = openRe.exec(tbodyInner);
  if (!open) return null;

  const contentStart = open.index + open[0].length;
  const closeIdx = tbodyInner.indexOf("</td>", contentStart);
  if (closeIdx < 0) return null;

  const before = flattenHtmlTextNodes(tbodyInner.slice(0, contentStart));
  const cellRaw = tbodyInner.slice(contentStart, closeIdx);
  const text = flattenHtmlTextNodes(cellRaw);
  return {
    start: before.length,
    end: before.length + text.length,
    text,
  };
}

function firstTextNode(el: Element): Text | null {
  const walker = el.ownerDocument.createTreeWalker(el, SHOW_TEXT);
  return walker.nextNode() as Text | null;
}

/** Mirror Zotero reader `textPositionFromRange(range, root)`. */
export function textPositionFromRange(
  range: Range,
  root: Element,
): { start: number; end: number } | null {
  const iter = root.ownerDocument.createTreeWalker(root, SHOW_TEXT);
  let start: number | undefined;
  let end: number | undefined;
  let pos = 0;
  let node: Node | null;
  while ((node = iter.nextNode())) {
    if (node === range.startContainer) {
      start = pos + range.startOffset;
    }
    if (node === range.endContainer) {
      end = pos + range.endOffset;
    }
    if (node.nodeValue) {
      pos += node.nodeValue.length;
    }
  }
  if (start === undefined || end === undefined) return null;
  return { start, end };
}

function parseHtmlDocument(html: string): Document | null {
  if (typeof DOMParser === "undefined") return null;
  try {
    return new DOMParser().parseFromString(html, "text/html");
  } catch {
    return null;
  }
}

function multiLinePositionFromDom(
  html: string,
  first: LineRangeForPosition,
  last: LineRangeForPosition,
): { start: number; end: number } | null {
  const doc = parseHtmlDocument(html);
  if (!doc) return null;

  const tbody =
    doc.querySelector("table.transcript tbody") || doc.querySelector("tbody");
  if (!tbody) return null;

  const startEl = doc.getElementById(
    transcriptLineAnchorId(first.lineOffsetMs),
  );
  const endEl = doc.getElementById(transcriptLineAnchorId(last.lineOffsetMs));
  if (!startEl || !endEl) return null;

  const startNode = firstTextNode(startEl);
  const endNode = firstTextNode(endEl);
  if (!startNode?.nodeValue || !endNode?.nodeValue) return null;

  const startOff = Math.max(
    0,
    Math.min(startNode.nodeValue.length, first.start),
  );
  const endOff = Math.max(0, Math.min(endNode.nodeValue.length, last.end));

  const range = doc.createRange();
  try {
    range.setStart(startNode, startOff);
    range.setEnd(endNode, endOff);
  } catch {
    return null;
  }

  const offsets = textPositionFromRange(range, tbody);
  if (!offsets || offsets.end <= offsets.start) return null;
  return offsets;
}

function multiLinePositionFromString(
  html: string,
  first: LineRangeForPosition,
  last: LineRangeForPosition,
): { start: number; end: number } | null {
  const tbodyInner = extractTbodyInner(html);
  if (tbodyInner == null) return null;

  const startCell = cellTextRangeInTbody(
    tbodyInner,
    transcriptLineAnchorId(first.lineOffsetMs),
  );
  const endCell = cellTextRangeInTbody(
    tbodyInner,
    transcriptLineAnchorId(last.lineOffsetMs),
  );
  if (!startCell || !endCell) return null;

  const start =
    startCell.start +
    Math.max(0, Math.min(startCell.text.length, first.start));
  const end =
    endCell.start + Math.max(0, Math.min(endCell.text.length, last.end));
  if (end <= start) return null;

  const tbodyLen = flattenHtmlTextNodes(tbodyInner).length;
  if (end > tbodyLen) return null;
  return { start, end };
}

/**
 * Position + quote text for saving a watch selection into the snapshot HTML.
 */
export function buildSnapshotHighlightPosition(
  html: string,
  ranges: LineRangeForPosition[],
): {
  position: SnapshotAnnotationPosition;
  quote: string;
  sortIndex: string;
} | null {
  const usable = ranges.filter((r) => r.text.trim() && r.end > r.start);
  if (usable.length === 0) return null;

  const first = usable[0];
  const last = usable[usable.length - 1];
  const sortIndex = String(first.lineOffsetMs).padStart(8, "0");

  if (usable.length === 1) {
    return {
      sortIndex,
      quote: first.text.trim(),
      position: {
        type: "CssSelector",
        value: `#${transcriptLineAnchorId(first.lineOffsetMs)}`,
        refinedBy: {
          type: "TextPositionSelector",
          start: first.start,
          end: first.end,
        },
      },
    };
  }

  const offsets =
    multiLinePositionFromDom(html, first, last) ||
    multiLinePositionFromString(html, first, last);
  if (!offsets) return null;

  // Flat quote for the annotation item — no linebreaks (watch/reader UI).
  const quote = usable
    .map((r) => r.text.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join(" ");

  return {
    sortIndex,
    quote,
    position: {
      type: "CssSelector",
      value: "tbody",
      refinedBy: {
        type: "TextPositionSelector",
        start: offsets.start,
        end: offsets.end,
      },
    },
  };
}
