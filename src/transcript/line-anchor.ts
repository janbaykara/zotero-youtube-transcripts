/** Stable CSS id for a caption line in the HTML attachment (and watch UI). */
export function transcriptLineAnchorId(offsetMs: number): string {
  return `yt-l-${Math.max(0, Math.floor(offsetMs))}`;
}

export function parseTranscriptLineAnchorId(value: string): number | null {
  const raw = value.startsWith("#") ? value.slice(1) : value;
  const match = /^yt-l-(\d+)$/.exec(raw);
  if (!match) return null;
  return Number(match[1]);
}
