import type { TranscriptBlock } from "../transcript/types";

export type TranscriptFindSegment = {
  blockIndex: number;
  start: number;
  end: number;
};

/** One navigable hit — one or more per-line segments when the query spans lines. */
export type TranscriptFindMatch = {
  segments: TranscriptFindSegment[];
};

type HaystackMapEntry =
  | { kind: "char"; blockIndex: number; offset: number }
  | { kind: "sep" };

function normalizeQuery(query: string): string {
  return query.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Build a space-joined haystack of trimmed caption lines, plus a map from each
 * haystack index back to a line char (or the inserted inter-line separator).
 */
function buildHaystack(blocks: TranscriptBlock[]): {
  haystack: string;
  map: HaystackMapEntry[];
} {
  let haystack = "";
  const map: HaystackMapEntry[] = [];

  for (let blockIndex = 0; blockIndex < blocks.length; blockIndex++) {
    const text = blocks[blockIndex].quote.trim();
    if (!text) continue;
    if (haystack.length > 0) {
      haystack += " ";
      map.push({ kind: "sep" });
    }
    const lower = text.toLowerCase();
    for (let offset = 0; offset < lower.length; offset++) {
      haystack += lower[offset];
      map.push({ kind: "char", blockIndex, offset });
    }
  }

  return { haystack, map };
}

/** Map a haystack [start, end) slice onto per-line segments (skipping seps). */
function segmentsFromHaystackRange(
  map: HaystackMapEntry[],
  start: number,
  end: number,
): TranscriptFindSegment[] {
  const segments: TranscriptFindSegment[] = [];
  let current: TranscriptFindSegment | null = null;

  for (let i = start; i < end; i++) {
    const entry = map[i];
    if (!entry || entry.kind === "sep") {
      current = null;
      continue;
    }
    if (
      current &&
      current.blockIndex === entry.blockIndex &&
      current.end === entry.offset
    ) {
      current.end = entry.offset + 1;
      continue;
    }
    current = {
      blockIndex: entry.blockIndex,
      start: entry.offset,
      end: entry.offset + 1,
    };
    segments.push(current);
  }

  return segments;
}

/**
 * Case-insensitive substring matches over the full transcript, including
 * phrases that span consecutive caption lines (joined with a single space).
 */
export function findTranscriptMatches(
  blocks: TranscriptBlock[],
  query: string,
): TranscriptFindMatch[] {
  const needle = normalizeQuery(query);
  if (!needle) return [];

  const { haystack, map } = buildHaystack(blocks);
  if (!haystack || needle.length > haystack.length) return [];

  const matches: TranscriptFindMatch[] = [];
  let from = 0;
  while (from <= haystack.length - needle.length) {
    const start = haystack.indexOf(needle, from);
    if (start < 0) break;
    const end = start + needle.length;
    const segments = segmentsFromHaystackRange(map, start, end);
    if (segments.length > 0) {
      matches.push({ segments });
    }
    from = start + 1;
  }
  return matches;
}

/** Wrap match index into `[0, total)` (or `-1` when empty). */
export function wrapMatchIndex(index: number, total: number): number {
  if (total <= 0) return -1;
  const mod = index % total;
  return mod < 0 ? mod + total : mod;
}

export function nextMatchIndex(current: number, total: number): number {
  if (total <= 0) return -1;
  if (current < 0) return 0;
  return wrapMatchIndex(current + 1, total);
}

export function prevMatchIndex(current: number, total: number): number {
  if (total <= 0) return -1;
  if (current < 0) return total - 1;
  return wrapMatchIndex(current - 1, total);
}

/** Keep index valid after the match list shrinks or grows. */
export function clampMatchIndex(index: number, total: number): number {
  if (total <= 0) return -1;
  if (index < 0) return 0;
  return Math.min(index, total - 1);
}
