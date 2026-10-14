import type { TranscriptBlock } from "../transcript/types";
import {
  parseTranscriptLineAnchorId,
  transcriptLineAnchorId,
} from "../transcript/line-anchor";
import { buildSnapshotHighlightPosition } from "../transcript/snapshot-position";
import { formatTimestamp } from "../transcript/timestamp";

export interface TranscriptSelectionRange {
  lineOffsetMs: number;
  start: number;
  end: number;
  text: string;
}

export interface TranscriptHighlight {
  id: number;
  key: string;
  lineOffsetMs: number;
  start: number;
  end: number;
  color: string;
  text: string;
  comment: string;
}

type AnnotationPosition = {
  type?: string;
  value?: string;
  exact?: string;
  refinedBy?: {
    type?: string;
    start?: number;
    end?: number;
    exact?: string;
  };
};

const FALLBACK_HIGHLIGHT_COLORS: Array<{ id: string; color: string }> = [
  { id: "general-yellow", color: "#ffd400" },
  { id: "general-red", color: "#ff6666" },
  { id: "general-green", color: "#5fb236" },
  { id: "general-blue", color: "#2ea8e5" },
  { id: "general-purple", color: "#a28ae5" },
  { id: "general-magenta", color: "#e56eee" },
  { id: "general-orange", color: "#f19837" },
  { id: "general-gray", color: "#aaaaaa" },
];

function defaultHighlightColor(): string {
  return Zotero.Annotations?.DEFAULT_COLOR || "#ffd400";
}

/** Zotero reader highlight palette (id + hex). */
export function getHighlightColors(): Array<{ id: string; color: string }> {
  const raw = (Zotero.Annotations as { COLORS?: unknown } | undefined)?.COLORS;
  if (!Array.isArray(raw) || raw.length === 0) {
    return FALLBACK_HIGHLIGHT_COLORS;
  }
  const out: Array<{ id: string; color: string }> = [];
  for (const entry of raw) {
    if (!Array.isArray(entry) || entry.length < 2) continue;
    const id = String(entry[0] ?? "");
    const color = String(entry[1] ?? "");
    if (!id || !/^#?[0-9a-fA-F]{3,8}$/.test(color)) continue;
    out.push({
      id,
      color: color.startsWith("#") ? color : `#${color}`,
    });
  }
  return out.length > 0 ? out : FALLBACK_HIGHLIGHT_COLORS;
}

export interface SelectionAnchor {
  /** Viewport X next to the selection (prefer right edge). */
  clientX: number;
  /** Viewport Y centered on the selection. */
  clientY: number;
}

/** Anchor point beside the current transcript selection, or null. */
export function selectionAnchorInTranscript(
  root: HTMLElement,
): SelectionAnchor | null {
  const win = root.ownerDocument.defaultView;
  const sel = win?.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
  if (!sel.toString().trim()) return null;

  const range = sel.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return null;

  const rect = range.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return null;

  return {
    clientX: rect.right + 8,
    clientY: rect.top + rect.height / 2,
  };
}

function isHighlightItem(item: Zotero.Item): boolean {
  const type = item.annotationType as unknown;
  return type === "highlight" || type === 1 || type === "1";
}

function parsePosition(raw: string | null | undefined): AnnotationPosition | null {
  if (!raw) return null;
  try {
    const pos =
      typeof raw === "string"
        ? (JSON.parse(raw) as AnnotationPosition)
        : (raw as AnnotationPosition);
    if (!pos || typeof pos !== "object") return null;
    return pos;
  } catch {
    return null;
  }
}

/**
 * Reader multi-line selections often include HTML timestamp-column tokens
 * (`00:22`) between caption lines. Strip known stamp labels before matching.
 */
export function stripTranscriptTimestamps(
  text: string,
  blocks: TranscriptBlock[],
): string {
  if (!text) return "";
  const stamps = [
    ...new Set(blocks.map((b) => formatTimestamp(b.quoteTimeOffset))),
  ].sort((a, b) => b.length - a.length);
  let out = text;
  for (const stamp of stamps) {
    const escaped = stamp.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(`(?:^|\\s)${escaped}(?=\\s|$)`, "g"), " ");
  }
  return out.replace(/\s+/g, " ").trim();
}

function findLineOffsetByText(
  blocks: TranscriptBlock[],
  annotationText: string,
): number | null {
  const needle = annotationText.trim();
  if (!needle) return null;
  for (const block of blocks) {
    const hay = block.quote.trim();
    if (!hay) continue;
    if (hay.includes(needle) || needle.includes(hay)) {
      return block.quoteTimeOffset;
    }
  }
  return null;
}

/**
 * Try to place `needle` on consecutive caption lines.
 * Prefers `preferredStartIdx` when set, otherwise the earliest start that
 * fully consumes the needle (needed for mid-line starts: naive
 * "line contained in quote" matching often lands on a later full line).
 */
function spanQuoteFromBlocks(
  blocks: TranscriptBlock[],
  needle: string,
  preferredStartIdx = -1,
): Array<{ lineOffsetMs: number; start: number; end: number; text: string }> {
  const order: number[] = [];
  if (preferredStartIdx >= 0 && preferredStartIdx < blocks.length) {
    order.push(preferredStartIdx);
  }
  for (let i = 0; i < blocks.length; i++) {
    if (i !== preferredStartIdx) order.push(i);
  }
  for (const startIdx of order) {
    const spanned = splitQuoteAcrossBlocks(blocks, startIdx, needle);
    if (spanned.length > 0) return spanned;
  }
  return [];
}

/**
 * Resolve a highlight onto one or more caption lines.
 * Positions are always relative to pure caption text (HTML `#yt-l-*` cells /
 * watch `.yt-watch-line-text`) — never timestamps.
 */
function highlightsFromAnnotation(
  ann: Zotero.Item,
  blocks: TranscriptBlock[],
): TranscriptHighlight[] {
  const text = (ann.annotationText || "").trim();
  if (!text) return [];

  const color = ann.annotationColor || defaultHighlightColor();
  const comment = String(ann.annotationComment || "");
  const position = parsePosition(ann.annotationPosition);
  const quoteExact =
    (position?.type === "TextQuoteSelector" && position.exact) ||
    (position?.refinedBy?.type === "TextQuoteSelector" &&
      position.refinedBy.exact) ||
    text;

  const cleanedQuote = stripTranscriptTimestamps(
    String(quoteExact || text),
    blocks,
  );
  if (!cleanedQuote) return [];

  const lineOffsets = new Set(blocks.map((b) => b.quoteTimeOffset));
  let preferredStartIdx = -1;
  if (position?.type === "CssSelector" && typeof position.value === "string") {
    const anchored = parseTranscriptLineAnchorId(position.value);
    if (anchored != null && lineOffsets.has(anchored)) {
      preferredStartIdx = blocks.findIndex(
        (b) => b.quoteTimeOffset === anchored,
      );
    }
  }

  // Single-line: prefer TextPositionSelector when it fits this caption cell.
  // Skip when the quote clearly spans more than this line (timestamp-joined
  // multi-line selections often keep a first-line CssSelector + bad offsets).
  if (preferredStartIdx >= 0) {
    const lineText = blocks[preferredStartIdx].quote.trim();
    const lineOffsetMs = blocks[preferredStartIdx].quoteTimeOffset;
    const refined = position?.refinedBy;
    const quoteLooksMultiLine =
      cleanedQuote.length > lineText.length + 1 &&
      cleanedQuote.includes(lineText) &&
      cleanedQuote !== lineText;
    if (
      !quoteLooksMultiLine &&
      refined?.type === "TextPositionSelector" &&
      Number.isFinite(refined.start) &&
      Number.isFinite(refined.end)
    ) {
      const rawStart = Math.floor(refined.start!);
      const rawEnd = Math.floor(refined.end!);
      if (rawStart >= 0 && rawEnd > rawStart && rawEnd <= lineText.length) {
        return [
          {
            id: ann.id,
            key: ann.key,
            lineOffsetMs,
            start: rawStart,
            end: rawEnd,
            color,
            text: lineText.slice(rawStart, rawEnd),
            comment,
          },
        ];
      }
    }
  }

  // Span across consecutive lines (tbody multi-line, reader multi-line, or
  // watch saves with a joined quote). Tries every start so mid-line selections
  // still resolve when the CssSelector is `tbody` / non-line.
  const spanned = spanQuoteFromBlocks(blocks, cleanedQuote, preferredStartIdx);
  if (spanned.length > 0) {
    return spanned.map((part, i) => ({
      id: ann.id,
      key: i === 0 ? ann.key : `${ann.key}:${i}`,
      lineOffsetMs: part.lineOffsetMs,
      start: part.start,
      end: part.end,
      color,
      text: part.text,
      comment: i === 0 ? comment : "",
    }));
  }

  // Last resort: substring on a single line.
  let lineOffsetMs: number | null =
    preferredStartIdx >= 0
      ? blocks[preferredStartIdx].quoteTimeOffset
      : findLineOffsetByText(blocks, cleanedQuote);
  if (lineOffsetMs == null) {
    lineOffsetMs = findLineOffsetByText(blocks, String(quoteExact || text));
  }
  if (lineOffsetMs == null) return [];
  const startIdx = blocks.findIndex((b) => b.quoteTimeOffset === lineOffsetMs);
  if (startIdx < 0) return [];
  const lineText = blocks[startIdx].quote.trim();
  const idx = lineText.indexOf(cleanedQuote);
  if (idx < 0) return [];
  return [
    {
      id: ann.id,
      key: ann.key,
      lineOffsetMs,
      start: idx,
      end: idx + cleanedQuote.length,
      color,
      text: lineText.slice(idx, idx + cleanedQuote.length),
      comment,
    },
  ];
}

/** Walk consecutive blocks consuming `needle` (whitespace-flexible). */
function splitQuoteAcrossBlocks(
  blocks: TranscriptBlock[],
  startIdx: number,
  needle: string,
): Array<{ lineOffsetMs: number; start: number; end: number; text: string }> {
  const stampSet = new Set(
    blocks.map((b) => formatTimestamp(b.quoteTimeOffset)),
  );
  const stripLeadingStamp = (value: string): string => {
    let next = value.replace(/^\s+/, "");
    // Reader inserts one stamp label between caption lines.
    for (let n = 0; n < 3; n++) {
      const match = /^(\d{1,2}:\d{2}(?::\d{2})?)\s*/.exec(next);
      if (!match || !stampSet.has(match[1])) break;
      next = next.slice(match[0].length);
    }
    return next;
  };

  const normalizedNeedle = stripLeadingStamp(
    needle.replace(/\s+/g, " ").trim(),
  );
  if (!normalizedNeedle) return [];

  // Fast path: needle contained in the first line.
  const first = blocks[startIdx]?.quote.trim() ?? "";
  const localIdx = first.indexOf(normalizedNeedle);
  if (localIdx >= 0) {
    return [
      {
        lineOffsetMs: blocks[startIdx].quoteTimeOffset,
        start: localIdx,
        end: localIdx + normalizedNeedle.length,
        text: first.slice(localIdx, localIdx + normalizedNeedle.length),
      },
    ];
  }

  const parts: Array<{
    lineOffsetMs: number;
    start: number;
    end: number;
    text: string;
  }> = [];
  let remaining = normalizedNeedle;

  for (let i = startIdx; i < blocks.length && remaining.length > 0; i++) {
    remaining = stripLeadingStamp(remaining);
    if (!remaining) break;

    const lineText = blocks[i].quote.trim();
    if (!lineText) continue;

    if (i === startIdx) {
      // Find the longest prefix of `remaining` that is a suffix of this line,
      // or the full line if remaining starts with it.
      if (remaining.startsWith(lineText)) {
        parts.push({
          lineOffsetMs: blocks[i].quoteTimeOffset,
          start: 0,
          end: lineText.length,
          text: lineText,
        });
        remaining = stripLeadingStamp(
          remaining.slice(lineText.length).replace(/^\s+/, ""),
        );
        continue;
      }
      // Needle may start mid-line.
      for (let s = 0; s < lineText.length; s++) {
        const suffix = lineText.slice(s);
        if (remaining.startsWith(suffix)) {
          parts.push({
            lineOffsetMs: blocks[i].quoteTimeOffset,
            start: s,
            end: lineText.length,
            text: suffix,
          });
          remaining = stripLeadingStamp(
            remaining.slice(suffix.length).replace(/^\s+/, ""),
          );
          break;
        }
      }
      if (parts.length === 0) return [];
      continue;
    }

    if (remaining.startsWith(lineText)) {
      parts.push({
        lineOffsetMs: blocks[i].quoteTimeOffset,
        start: 0,
        end: lineText.length,
        text: lineText,
      });
      remaining = stripLeadingStamp(
        remaining.slice(lineText.length).replace(/^\s+/, ""),
      );
      continue;
    }

    // Final partial line.
    if (lineText.startsWith(remaining)) {
      parts.push({
        lineOffsetMs: blocks[i].quoteTimeOffset,
        start: 0,
        end: remaining.length,
        text: remaining,
      });
      remaining = "";
      break;
    }

    // Gap — can't align further.
    break;
  }

  return remaining.length === 0 ? parts : [];
}

/** Map attachment highlight annotations onto watch-tab caption lines. */
export function mapAnnotationsToHighlights(
  annotations: Zotero.Item[],
  blocks: TranscriptBlock[],
): TranscriptHighlight[] {
  const out: TranscriptHighlight[] = [];
  for (const ann of annotations) {
    if (!isHighlightItem(ann)) continue;
    out.push(...highlightsFromAnnotation(ann, blocks));
  }
  return out.sort(
    (a, b) =>
      a.lineOffsetMs - b.lineOffsetMs || a.start - b.start || a.id - b.id,
  );
}

export async function loadAttachmentHighlights(
  attachment: Zotero.Item,
  blocks: TranscriptBlock[],
): Promise<TranscriptHighlight[]> {
  try {
    await attachment.loadDataType("childItems");
  } catch {
    // ignore
  }
  let annotations: Zotero.Item[] = [];
  try {
    annotations = attachment.getAnnotations?.(false) || [];
  } catch (err) {
    ztoolkit.log("loadAttachmentHighlights: getAnnotations failed", err);
    return [];
  }
  return mapAnnotationsToHighlights(annotations, blocks);
}

export async function updateTranscriptHighlight(
  annotationID: number,
  patch: { color?: string; comment?: string },
): Promise<void> {
  const item = Zotero.Items.get(annotationID);
  if (!item || !item.isAnnotation?.()) {
    throw new Error("Annotation not found");
  }
  if (patch.color != null) {
    item.annotationColor = patch.color;
  }
  if (patch.comment != null) {
    item.annotationComment = patch.comment;
  }
  await item.saveTx();
}

export async function deleteTranscriptHighlight(
  annotationID: number,
): Promise<void> {
  const item = Zotero.Items.get(annotationID);
  if (!item || !item.isAnnotation?.()) return;
  await Zotero.Items.trashTx(annotationID);
}

/**
 * Join per-line selection ranges into one annotation quote.
 * Watch-tab display re-splits via splitQuoteAcrossBlocks / mapAnnotationsToHighlights.
 */
export function joinedQuoteFromRanges(
  ranges: TranscriptSelectionRange[],
): string {
  return ranges
    .map((r) => r.text.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join(" ");
}

async function readAttachmentHtml(
  attachment: Zotero.Item,
): Promise<string | null> {
  try {
    const path = (await attachment.getFilePathAsync()) as string | false;
    if (!path) return null;
    const html = await Zotero.File.getContentsAsync(path);
    return typeof html === "string" ? html : null;
  } catch {
    return null;
  }
}

export async function createTranscriptHighlights(
  attachment: Zotero.Item,
  ranges: TranscriptSelectionRange[],
  color = defaultHighlightColor(),
): Promise<Zotero.Item[]> {
  const usable = ranges.filter((r) => r.text.trim() && r.end > r.start);
  if (usable.length === 0) return [];

  const first = usable[0];
  const html = await readAttachmentHtml(attachment);
  const built = html
    ? buildSnapshotHighlightPosition(html, usable)
    : null;

  // Fallback: single-line cell anchor (or first line only if HTML unavailable).
  const position =
    built?.position ??
    ({
      type: "CssSelector",
      value: `#${transcriptLineAnchorId(first.lineOffsetMs)}`,
      refinedBy: {
        type: "TextPositionSelector",
        start: first.start,
        end: first.end,
      },
    } as const);
  const quote = (
    built?.quote ||
    (usable.length === 1
      ? usable[0].text.trim()
      : joinedQuoteFromRanges(usable))
  )
    .replace(/\s+/g, " ")
    .trim();
  if (!quote) return [];

  const key =
    (
      Zotero as unknown as {
        DataObjectUtilities?: { generateKey?: () => string };
      }
    ).DataObjectUtilities?.generateKey?.() ||
    Zotero.Utilities.generateObjectKey();

  try {
    // Snapshot reader only accepts CssSelector refined by TextPositionSelector
    // (TextQuoteSelector throws and crashes the reader). Multi-line selections
    // use tbody + relative TextPosition — same shape as reader toSelector().
    const item = await Zotero.Annotations.saveFromJSON(attachment, {
      key,
      type: "highlight",
      text: quote,
      comment: "",
      color,
      pageLabel: formatTimestamp(first.lineOffsetMs),
      sortIndex: built?.sortIndex ?? String(first.lineOffsetMs).padStart(8, "0"),
      position,
    } as any);
    return item ? [item] : [];
  } catch (err) {
    ztoolkit.log(
      "createTranscriptHighlights: failed",
      first.lineOffsetMs,
      usable.length,
      err,
    );
    return [];
  }
}

// DOM globals like Element/NodeFilter are missing in the Zotero sandbox.
const ELEMENT_NODE = 1;
const SHOW_TEXT = 4;

function isElementNode(node: Node | null | undefined): node is Element {
  return !!node && node.nodeType === ELEMENT_NODE;
}

/** Caption text cell — mirrors HTML `#yt-l-*` (no timestamps). */
function lineTextEl(row: HTMLElement): HTMLElement {
  if (row.classList?.contains("yt-watch-line-text")) return row;
  return (
    (row.querySelector(".yt-watch-line-text") as HTMLElement | null) || row
  );
}

/** Resolve a selection boundary to a caption text cell. */
function closestLineRow(node: Node | null | undefined): HTMLElement | null {
  if (!node) return null;
  const el = (
    isElementNode(node) ? node : node.parentElement
  ) as HTMLElement | null;
  if (!el) return null;
  const text = el.closest?.(".yt-watch-line-text") as HTMLElement | null;
  if (text) return text;
  // Boundary landed on gutter / row chrome — use that row's caption cell.
  const row = el.closest?.(".yt-watch-line") as HTMLElement | null;
  return (
    (row?.querySelector(".yt-watch-line-text") as HTMLElement | null) ?? null
  );
}

/** Character offset of (node, offset) within element's flattened text. */
export function textOffsetInElement(
  root: HTMLElement,
  node: Node,
  offset: number,
): number {
  if (!root.contains(node) && node !== root) {
    return 0;
  }
  const doc = root.ownerDocument;
  const walker = doc.createTreeWalker(root, SHOW_TEXT);
  let count = 0;
  let current: Node | null;
  while ((current = walker.nextNode())) {
    const length = current.textContent?.length ?? 0;
    if (current === node) {
      return count + Math.max(0, Math.min(length, offset));
    }
    count += length;
  }
  if (node === root) {
    return Math.max(0, Math.min(count, offset));
  }
  return count;
}

function queryHtmlElements(root: HTMLElement, selector: string): HTMLElement[] {
  return Array.from(root.querySelectorAll(selector)).filter(
    (node): node is HTMLElement =>
      !!node && (node as Node).nodeType === ELEMENT_NODE,
  );
}

function collectLineRows(root: HTMLElement): HTMLElement[] {
  // Prefer caption cells so offsets match HTML `#yt-l-*` text positions.
  const texts = queryHtmlElements(
    root,
    ".yt-watch-line-text[data-line-offset]",
  );
  if (texts.length > 0) return texts;
  const rows = queryHtmlElements(root, ".yt-watch-line[data-line-offset]");
  if (rows.length > 0) return rows;
  return queryHtmlElements(root, "[data-line-offset]");
}

/**
 * Clip `range` to `el`'s contents and return character offsets within `el`.
 * Returns null when the range does not intersect the element.
 */
function clippedOffsetsInElement(
  range: Range,
  el: HTMLElement,
): { start: number; end: number } | null {
  try {
    if (typeof range.intersectsNode === "function") {
      if (!range.intersectsNode(el)) return null;
    } else {
      const startRow = closestLineRow(range.startContainer);
      const endRow = closestLineRow(range.endContainer);
      if (
        startRow !== el &&
        endRow !== el &&
        !(startRow && el.contains(startRow)) &&
        !(endRow && el.contains(endRow))
      ) {
        return null;
      }
    }
  } catch {
    return null;
  }

  const full = el.textContent ?? "";
  if (!full) return null;

  let start = 0;
  let end = full.length;

  // Boundary inside this cell → precise offset; otherwise the selection
  // covers the whole cell (started before / ended after).
  if (el.contains(range.startContainer) || range.startContainer === el) {
    start = textOffsetInElement(el, range.startContainer, range.startOffset);
  }
  if (el.contains(range.endContainer) || range.endContainer === el) {
    end = textOffsetInElement(el, range.endContainer, range.endOffset);
  }

  if (start > end) {
    const t = start;
    start = end;
    end = t;
  }
  start = Math.max(0, Math.min(full.length, start));
  end = Math.max(start, Math.min(full.length, end));
  if (end <= start) return null;
  return { start, end };
}

function collapseWs(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Resolve a viewport point to a caption line + character offset. */
export function lineCaretAtPoint(
  root: HTMLElement,
  clientX: number,
  clientY: number,
): { lineOffsetMs: number; offset: number; text: string } | null {
  const doc = root.ownerDocument as Document & {
    caretPositionFromPoint?: (
      x: number,
      y: number,
    ) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };

  let node: Node | null = null;
  let offset = 0;
  if (typeof doc.caretPositionFromPoint === "function") {
    const pos = doc.caretPositionFromPoint(clientX, clientY);
    if (pos) {
      node = pos.offsetNode;
      offset = pos.offset;
    }
  } else if (typeof doc.caretRangeFromPoint === "function") {
    const r = doc.caretRangeFromPoint(clientX, clientY);
    if (r) {
      node = r.startContainer;
      offset = r.startOffset;
    }
  }
  if (!node) {
    const hit = doc.elementFromPoint(clientX, clientY) as Node | null;
    node = hit;
    offset = 0;
  }
  if (!node || !root.contains(node)) return null;

  const line = closestLineRow(node);
  if (!line || !root.contains(line)) return null;
  const textRoot = lineTextEl(line);
  const text = textRoot.textContent ?? "";
  const lineOffsetMs = Number(
    line.dataset.lineOffset || textRoot.dataset.lineOffset,
  );
  if (!Number.isFinite(lineOffsetMs)) return null;

  let charOffset = 0;
  if (textRoot.contains(node) || node === textRoot) {
    charOffset = textOffsetInElement(textRoot, node, offset);
  } else {
    // Point landed on row chrome — snap to start/end by horizontal position.
    const rect = textRoot.getBoundingClientRect();
    charOffset = clientX < rect.left + rect.width / 2 ? 0 : text.length;
  }
  charOffset = Math.max(0, Math.min(text.length, charOffset));
  return { lineOffsetMs, offset: charOffset, text };
}

/**
 * Build per-line ranges covering every caption from start caret to end caret
 * (inclusive), independent of window.getSelection().
 */
export function rangesBetweenCarets(
  lines: Array<{ lineOffsetMs: number; text: string }>,
  start: { lineOffsetMs: number; offset: number },
  end: { lineOffsetMs: number; offset: number },
): TranscriptSelectionRange[] {
  if (lines.length === 0) return [];
  let i = lines.findIndex((l) => l.lineOffsetMs === start.lineOffsetMs);
  let j = lines.findIndex((l) => l.lineOffsetMs === end.lineOffsetMs);
  if (i < 0 || j < 0) return [];

  let startOff = start.offset;
  let endOff = end.offset;
  if (i > j || (i === j && startOff > endOff)) {
    const ti = i;
    i = j;
    j = ti;
    const to = startOff;
    startOff = endOff;
    endOff = to;
  }

  const out: TranscriptSelectionRange[] = [];
  for (let k = i; k <= j; k++) {
    const line = lines[k];
    const startPos = k === i ? Math.max(0, Math.min(line.text.length, startOff)) : 0;
    const endPos =
      k === j
        ? Math.max(startPos, Math.min(line.text.length, endOff))
        : line.text.length;
    if (endPos <= startPos) continue;
    const text = line.text.slice(startPos, endPos);
    if (!text.trim()) continue;
    out.push({
      lineOffsetMs: line.lineOffsetMs,
      start: startPos,
      end: endPos,
      text,
    });
  }
  return out;
}

/** Catalog caption lines under a transcript root (watch tab). */
export function catalogTranscriptLines(
  root: HTMLElement,
): Array<{ lineOffsetMs: number; text: string }> {
  return collectLineRows(root)
    .map((row) => {
      const textRoot = lineTextEl(row);
      const lineOffsetMs = Number(
        row.dataset.lineOffset || textRoot.dataset.lineOffset,
      );
      return { lineOffsetMs, text: textRoot.textContent ?? "" };
    })
    .filter((l) => Number.isFinite(l.lineOffsetMs));
}

/**
 * Map a multi-line selected string onto consecutive caption lines.
 * Used when the live Range only covers the first line (common with
 * user-select:none gutters between watch-tab rows) but sel.toString()
 * still includes later lines.
 */
export function lineRangesFromSelectedText(
  lines: Array<{ lineOffsetMs: number; text: string }>,
  selectedText: string,
): TranscriptSelectionRange[] {
  const needle = collapseWs(selectedText);
  if (!needle) return [];

  const norms = lines
    .map((l) => ({
      lineOffsetMs: l.lineOffsetMs,
      text: l.text,
      norm: collapseWs(l.text),
      lead: l.text.match(/^\s*/)?.[0].length ?? 0,
    }))
    .filter((l) => l.norm.length > 0);

  let best: TranscriptSelectionRange[] = [];

  for (let i = 0; i < norms.length; i++) {
    for (let j = i; j < norms.length; j++) {
      const slice = norms.slice(i, j + 1);
      const joined = slice.map((l) => l.norm).join(" ");
      if (joined === needle) {
        const ranges = slice.map((l) => ({
          lineOffsetMs: l.lineOffsetMs,
          start: 0,
          end: l.text.length,
          text: l.text,
        }));
        if (ranges.length > best.length) best = ranges;
        continue;
      }
      if (j === i) continue;

      const first = slice[0];
      const last = slice[slice.length - 1];
      const mid = slice
        .slice(1, -1)
        .map((l) => l.norm)
        .join(" ");

      for (let fs = 0; fs < first.norm.length; fs++) {
        const head = first.norm.slice(fs);
        if (!needle.startsWith(head)) continue;
        let rest = needle.slice(head.length);
        if (rest.startsWith(" ")) rest = rest.slice(1);

        if (mid) {
          if (!rest.startsWith(mid)) continue;
          rest = rest.slice(mid.length);
          if (rest.startsWith(" ")) rest = rest.slice(1);
        }

        if (!rest || !last.norm.startsWith(rest)) continue;

        const ranges: TranscriptSelectionRange[] = [];
        const firstStart = first.lead + fs;
        ranges.push({
          lineOffsetMs: first.lineOffsetMs,
          start: firstStart,
          end: first.text.length,
          text: first.text.slice(firstStart),
        });
        for (const m of slice.slice(1, -1)) {
          ranges.push({
            lineOffsetMs: m.lineOffsetMs,
            start: 0,
            end: m.text.length,
            text: m.text,
          });
        }
        const lastEnd = last.lead + rest.length;
        ranges.push({
          lineOffsetMs: last.lineOffsetMs,
          start: 0,
          end: Math.min(last.text.length, lastEnd),
          text: last.text.slice(0, Math.min(last.text.length, lastEnd)),
        });
        if (ranges.length > best.length) best = ranges;
      }
    }
  }

  return best;
}

/**
 * Read selection ranges inside the transcript pane (one entry per caption line).
 * Combines Range geometry with sel.toString() matching so multi-line drags that
 * stall on timestamp/comment gutters still produce one range per caption line.
 */
export function selectionRangesInTranscript(
  root: HTMLElement,
): TranscriptSelectionRange[] {
  const win = root.ownerDocument.defaultView;
  const sel = win?.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return [];

  const range = sel.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return [];

  const lineEls = collectLineRows(root);
  if (lineEls.length === 0) return [];

  const startRow = closestLineRow(range.startContainer);
  const endRow = closestLineRow(range.endContainer);
  let startIdx = startRow
    ? lineEls.findIndex((el) => el === startRow || el.contains(startRow))
    : -1;
  let endIdx = endRow
    ? lineEls.findIndex((el) => el === endRow || el.contains(endRow))
    : -1;
  if (startIdx >= 0 && endIdx >= 0 && startIdx > endIdx) {
    const t = startIdx;
    startIdx = endIdx;
    endIdx = t;
  }

  const out: TranscriptSelectionRange[] = [];
  for (let i = 0; i < lineEls.length; i++) {
    const row = lineEls[i];
    const textRoot = lineTextEl(row);
    const inSpan = startIdx >= 0 && endIdx >= 0 && i >= startIdx && i <= endIdx;
    const clipped = clippedOffsetsInElement(range, textRoot);
    const resolved =
      clipped ??
      (inSpan && (textRoot.textContent ?? "").trim()
        ? { start: 0, end: (textRoot.textContent ?? "").length }
        : null);
    if (!resolved) continue;
    const text = (textRoot.textContent ?? "").slice(
      resolved.start,
      resolved.end,
    );
    if (!text.trim()) continue;

    const lineOffsetMs = Number(
      row.dataset.lineOffset || textRoot.dataset.lineOffset,
    );
    if (!Number.isFinite(lineOffsetMs)) continue;

    out.push({
      lineOffsetMs,
      start: resolved.start,
      end: resolved.end,
      text,
    });
  }

  const catalog = lineEls
    .map((row) => {
      const textRoot = lineTextEl(row);
      const lineOffsetMs = Number(
        row.dataset.lineOffset || textRoot.dataset.lineOffset,
      );
      return {
        lineOffsetMs,
        text: textRoot.textContent ?? "",
      };
    })
    .filter((l) => Number.isFinite(l.lineOffsetMs) && collapseWs(l.text));

  const fromText = lineRangesFromSelectedText(catalog, sel.toString());
  return fromText.length > out.length ? fromText : out;
}
