import type { TranscriptBlock } from "../transcript/types";

export type TranscriptFindMatch = {
  blockIndex: number;
  start: number;
  end: number;
};

/** Case-insensitive substring matches over trimmed caption lines. */
export function findTranscriptMatches(
  blocks: TranscriptBlock[],
  query: string,
): TranscriptFindMatch[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];

  const matches: TranscriptFindMatch[] = [];
  for (let blockIndex = 0; blockIndex < blocks.length; blockIndex++) {
    const text = blocks[blockIndex].quote.trim();
    if (!text) continue;
    const haystack = text.toLowerCase();
    let from = 0;
    while (from <= haystack.length - needle.length) {
      const start = haystack.indexOf(needle, from);
      if (start < 0) break;
      const end = start + needle.length;
      matches.push({ blockIndex, start, end });
      from = start + 1;
    }
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
