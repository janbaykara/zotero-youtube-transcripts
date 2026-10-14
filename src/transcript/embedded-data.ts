import type { TranscriptLine, TranscriptResponse } from "./types";

export const TRANSCRIPT_DATA_SCRIPT_ID = "yt-transcript-data";

export interface EmbeddedTranscriptData {
  videoId: string;
  title: string;
  url: string;
  lines: TranscriptLine[];
}

export function buildEmbeddedTranscriptData(
  transcript: TranscriptResponse,
  url: string,
  videoId: string,
): EmbeddedTranscriptData {
  return {
    videoId,
    title: transcript.title?.trim() || "YouTube Transcript",
    url,
    lines: transcript.lines,
  };
}

/** Serialize for a non-executing <script type="application/json"> tag. */
export function serializeEmbeddedTranscriptData(
  data: EmbeddedTranscriptData,
): string {
  // Prevent early </script> termination if a caption ever contains that sequence.
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

export function parseEmbeddedTranscriptData(
  html: string,
): EmbeddedTranscriptData | null {
  if (!html) return null;

  const pattern = new RegExp(
    `<script\\s+type=["']application/json["']\\s+id=["']${TRANSCRIPT_DATA_SCRIPT_ID}["']\\s*>\\s*([\\s\\S]*?)\\s*</script>`,
    "i",
  );
  const match = html.match(pattern);
  if (!match?.[1]) return null;

  try {
    const parsed = JSON.parse(match[1]) as Partial<EmbeddedTranscriptData>;
    if (
      typeof parsed.videoId !== "string" ||
      !parsed.videoId ||
      typeof parsed.title !== "string" ||
      typeof parsed.url !== "string" ||
      !Array.isArray(parsed.lines)
    ) {
      return null;
    }
    const lines: TranscriptLine[] = [];
    for (const line of parsed.lines) {
      if (
        !line ||
        typeof line.text !== "string" ||
        typeof line.offset !== "number" ||
        typeof line.duration !== "number"
      ) {
        return null;
      }
      lines.push({
        text: line.text,
        offset: line.offset,
        duration: line.duration,
      });
    }
    return {
      videoId: parsed.videoId,
      title: parsed.title,
      url: parsed.url,
      lines,
    };
  } catch {
    return null;
  }
}
