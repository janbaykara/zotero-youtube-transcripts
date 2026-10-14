import type { TranscriptBlock } from "./types";

/**
 * Index of the block whose start offset is the latest at or before `timeMs`.
 * Returns -1 when there are no blocks or time is before the first block.
 */
export function findActiveBlockIndex(
  blocks: TranscriptBlock[],
  timeMs: number,
): number {
  if (!blocks.length) return -1;
  const t = Math.max(0, timeMs);
  let active = -1;
  for (let i = 0; i < blocks.length; i++) {
    if (blocks[i].quoteTimeOffset <= t) {
      active = i;
    } else {
      break;
    }
  }
  return active;
}
