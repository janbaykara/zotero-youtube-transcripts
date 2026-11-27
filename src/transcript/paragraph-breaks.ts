import type { TranscriptBlock } from "./types";

/** Blocks with optional cue duration so silence gaps can be measured. */
export type ParagraphBlock = TranscriptBlock & {
  durationMs?: number;
};

const MIN_LARGE_GAP_MS = 1800;
const GAP_MEDIAN_FACTOR = 2.2;
/** Soft length limit: break only after this many finished sentences. */
const MAX_SENTENCES_PER_PARAGRAPH = 6;
const HEADLINE_MAX_CHARS = 40;

function cueEndMs(block: ParagraphBlock): number {
  const duration = Number(block.durationMs);
  if (Number.isFinite(duration) && duration > 0) {
    return block.quoteTimeOffset + duration;
  }
  return block.quoteTimeOffset;
}

function gapBefore(prev: ParagraphBlock, curr: ParagraphBlock): number {
  return Math.max(0, curr.quoteTimeOffset - cueEndMs(prev));
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function stripCueText(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

/** Cue ends on sentence-final punctuation (. ? ! …). */
export function endsWithSentence(raw: string): boolean {
  return /[.?!…]["')\]]*$/u.test(stripCueText(raw));
}

/**
 * Count finished sentences in caption text.
 * A terminator counts when followed by space/end, or by a closing quote/bracket.
 * Skips common single-letter initials / abbreviations like "e.g." / "Dr.".
 */
export function countSentences(raw: string): number {
  const text = stripCueText(raw);
  if (!text) return 0;

  let count = 0;
  const re = /[.?!…]/gu;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) != null) {
    const idx = match.index;
    const ch = match[0];
    const before = text.slice(Math.max(0, idx - 3), idx);
    const after = text[idx + 1] ?? "";

    // Skip dotted abbreviations: letter + "." + letter (e.g. "e.g", "U.S").
    if (
      ch === "." &&
      /[A-Za-zÀ-ÖØ-öø-ÿ]$/u.test(before) &&
      /[A-Za-zÀ-ÖØ-öø-ÿ]/u.test(after)
    ) {
      continue;
    }
    // Skip single-capital initials: "A." mid-stream before another capital.
    if (
      ch === "." &&
      /(?:^|[\s("])[A-ZÀ-ÖØ]$/u.test(before) &&
      /[A-ZÀ-ÖØ]/u.test(after)
    ) {
      continue;
    }

    const rest = text.slice(idx + 1);
    if (rest === "" || /^[\s"'”’)\]\}]/u.test(rest)) {
      count += 1;
    }
  }
  return count;
}

/**
 * Only clear section titles — YouTube cues are often short mid-sentence
 * fragments, so Title Case / "short = headline" heuristics are too greedy.
 */
export function looksLikeHeadline(raw: string): boolean {
  const text = stripCueText(raw);
  if (!text || text.length > HEADLINE_MAX_CHARS) return false;
  // Ordinary prose / caption fragments.
  if (/[,.;?!…]/.test(text)) return false;

  const letters = text.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ]/gu, "");
  if (letters.length < 4) return false;

  // Nearly ALL CAPS labels: "PART ONE", "CHAPTER TWO".
  const upper = letters.replace(/[^A-ZÀ-ÖØ]/gu, "").length;
  if (upper / letters.length >= 0.85) return true;

  // Short label ending in a colon, e.g. "Introduction:".
  if (/^[A-ZÀ-ÖØ][^:]{0,28}:$/u.test(text)) return true;

  return false;
}

/**
 * Returns true for each block that should start a new visual paragraph.
 * Index 0 is always a paragraph start.
 *
 * Soft length breaks wait for a finished sentence, then open a new
 * paragraph on the following cue once ~6 sentences have accumulated.
 */
export function computeParagraphStarts(blocks: ParagraphBlock[]): boolean[] {
  const n = blocks.length;
  const starts = Array.from({ length: n }, (_, i) => i === 0);
  if (n <= 1) return starts;

  const gaps: number[] = [];
  for (let i = 1; i < n; i++) {
    gaps.push(gapBefore(blocks[i - 1], blocks[i]));
  }
  // Typical spacing from ordinary adjacent cues — ignore already-large
  // silences so they don't inflate the break threshold.
  const speechGaps = gaps.filter((g) => g > 0 && g < MIN_LARGE_GAP_MS);
  const typicalGap = median(
    speechGaps.length > 0 ? speechGaps : gaps.filter((g) => g > 0),
  );
  const largeGap = Math.max(
    MIN_LARGE_GAP_MS,
    typicalGap > 0 ? typicalGap * GAP_MEDIAN_FACTOR : MIN_LARGE_GAP_MS,
  );

  let sentencesInParagraph = countSentences(blocks[0]?.quote ?? "");

  for (let i = 1; i < n; i++) {
    const prev = blocks[i - 1];
    const curr = blocks[i];
    const text = stripCueText(curr.quote);
    const gap = gaps[i - 1];
    const prevHeadline = looksLikeHeadline(prev.quote);
    const currHeadline = looksLikeHeadline(curr.quote);

    const prevEndedSentence = endsWithSentence(prev.quote);

    let start = false;
    if (prevHeadline) start = true;
    else if (currHeadline) start = true;
    // Pauses only open a paragraph after a finished sentence — never split
    // a clause just because the speaker hesitated mid-thought.
    else if (gap >= largeGap && prevEndedSentence) start = true;
    else if (
      sentencesInParagraph >= MAX_SENTENCES_PER_PARAGRAPH &&
      prevEndedSentence
    ) {
      start = true;
    }

    starts[i] = start;
    if (start) {
      sentencesInParagraph = countSentences(text);
    } else {
      sentencesInParagraph += countSentences(text);
    }
  }

  return starts;
}
