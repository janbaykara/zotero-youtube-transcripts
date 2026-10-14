import { buildTimestampUrl, extractVideoId } from "../youtube/url";
import {
  TRANSCRIPT_DATA_SCRIPT_ID,
  buildEmbeddedTranscriptData,
  serializeEmbeddedTranscriptData,
} from "./embedded-data";
import { transcriptLineAnchorId } from "./line-anchor";
import { formatTimestamp } from "./timestamp";
import type { TranscriptResponse } from "./types";

export interface HtmlFormatOptions {
  timestampMod: number;
  /** zotero:// URL that opens the watch tab for the parent item. */
  watchUrl?: string;
  /** Visible label for the watch-tab link (defaults to English). */
  watchLabel?: string;
}

export function formatTranscriptHtml(
  transcript: TranscriptResponse,
  url: string,
  options: HtmlFormatOptions,
): string {
  if (!transcript?.lines || !Array.isArray(transcript.lines)) return "";
  if (transcript.lines.length === 0) return "";

  const timestampMod =
    options.timestampMod <= 0
      ? 1
      : Math.max(1, Math.floor(options.timestampMod)) || 5;

  const title = escapeHtml(transcript.title?.trim() || "YouTube Transcript");
  const today = new Date().toISOString().split("T")[0];
  const sourceUrl = url || "";
  const sourceHref = escapeHtml(sourceUrl);
  const videoId = extractVideoId(url) || "";
  const lines = transcript.lines.filter((line) => line.text.trim().length > 0);

  const embedded = serializeEmbeddedTranscriptData(
    buildEmbeddedTranscriptData(transcript, url, videoId),
  );

  // One row per caption line (matches the watch tab) with a stable CSS id so
  // snapshot annotations can target the same text from the reader or watch UI.
  // Timestamp links open the watch tab at that offset when watchUrl is set.
  const bodyRows = lines
    .map((line, index) => {
      const showTimestamp = index % timestampMod === 0;
      const timestamp = formatTimestamp(line.offset);
      const href = options.watchUrl
        ? `${options.watchUrl}?t=${Math.max(0, Math.floor(line.offset))}`
        : url
          ? buildTimestampUrl(url, line.offset)
          : "#";
      const text = escapeHtml(line.text.trim());
      const anchor = transcriptLineAnchorId(line.offset);
      // Timestamp label is CSS `attr(data-time)` so reader multi-line
      // selections don't ingest "00:22" into annotation quotes.
      const tsCell = showTimestamp
        ? `<td class="ts"><a href="${escapeHtml(href)}" data-time="${escapeHtml(timestamp)}" aria-label="${escapeHtml(timestamp)}"></a></td>`
        : `<td class="ts"></td>`;
      return `    <tr>
      ${tsCell}
      <td class="text" id="${anchor}">${text}</td>
    </tr>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${title}</title>
<style>
  :root {
    color-scheme: light dark;
  }
  body {
    font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
    line-height: 1.55;
    max-width: 48rem;
    margin: 0 auto;
    padding: 1.5rem 1.25rem 3rem;
  }
  h1 {
    font-size: 1.35rem;
    margin: 0 0 0.75rem;
    line-height: 1.3;
  }
  .meta {
    color: CanvasText;
    opacity: 0.7;
    font-size: 0.9rem;
    margin-bottom: 1.5rem;
  }
  .meta a {
    color: inherit;
  }
  table.transcript {
    width: 100%;
    border-collapse: collapse;
  }
  table.transcript td {
    vertical-align: top;
    padding: 0.35rem 0;
  }
  table.transcript td.ts {
    width: 1%;
    white-space: nowrap;
    padding-right: 0.85rem;
    user-select: none;
    -moz-user-select: none;
    -webkit-user-select: none;
  }
  table.transcript td.ts a {
    font-variant-numeric: tabular-nums;
    text-decoration: none;
    font-weight: 600;
    font-size: 0.9rem;
  }
  table.transcript td.ts a::before {
    content: attr(data-time);
  }
  table.transcript td.ts a:hover {
    text-decoration: underline;
  }
  table.transcript td.text {
    width: 99%;
  }
</style>
</head>
<body>
<article>
  <h1>${title}</h1>
  <p class="meta">
    Source: ${sourceUrl ? `<a href="${sourceHref}">${sourceHref}</a>` : "Unknown"}
    · Retrieved: ${escapeHtml(today)}${
      options.watchUrl
        ? ` · <a class="watch" href="${escapeHtml(options.watchUrl)}">${escapeHtml(
            options.watchLabel || "Open watch tab",
          )}</a>`
        : ""
    }
  </p>
  <table class="transcript">
    <tbody>
${bodyRows}
    </tbody>
  </table>
</article>
<script type="application/json" id="${TRANSCRIPT_DATA_SCRIPT_ID}">
${embedded}
</script>
</body>
</html>
`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
