import { expect } from "chai";
import { formatTranscriptHtml } from "../../../src/transcript/format-html";
import {
  TRANSCRIPT_DATA_SCRIPT_ID,
  parseEmbeddedTranscriptData,
} from "../../../src/transcript/embedded-data";
import type { TranscriptResponse } from "../../../src/transcript/types";

const transcript: TranscriptResponse = {
  title: 'Test <Title> & "Quotes"',
  lines: [
    { text: "Hello <b>world</b>", offset: 0, duration: 2000 },
    { text: "Second line", offset: 2000, duration: 2000 },
    { text: "Third line", offset: 4000, duration: 2000 },
  ],
};

const url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";

describe("formatTranscriptHtml", function () {
  it("emits a self-contained HTML document with escaped text", function () {
    const html = formatTranscriptHtml(transcript, url, { timestampMod: 2 });
    expect(html).to.include("<!DOCTYPE html>");
    expect(html).to.include('<meta charset="utf-8"');
    expect(html).to.include("Test &lt;Title&gt; &amp; &quot;Quotes&quot;");
    expect(html).to.include("Hello &lt;b&gt;world&lt;/b&gt;");
    expect(html).to.not.include("<iframe");
  });

  it("embeds offline JSON transcript data", function () {
    const html = formatTranscriptHtml(transcript, url, { timestampMod: 2 });
    expect(html).to.include(
      `<script type="application/json" id="${TRANSCRIPT_DATA_SCRIPT_ID}">`,
    );
    const data = parseEmbeddedTranscriptData(html);
    expect(data).to.not.equal(null);
    expect(data!.videoId).to.equal("dQw4w9WgXcQ");
    expect(data!.url).to.equal(url);
    expect(data!.title).to.equal('Test <Title> & "Quotes"');
    expect(data!.lines).to.have.length(3);
    expect(data!.lines[0].text).to.equal("Hello <b>world</b>");
  });

  it("lays out timestamps and text in two table columns", function () {
    const html = formatTranscriptHtml(transcript, url, { timestampMod: 2 });
    expect(html).to.include('<table class="transcript">');
    expect(html).to.include('<td class="ts">');
    expect(html).to.include('<td class="text"');
    expect(html).to.include("user-select: none");
    // Without watchUrl, timestamps fall back to YouTube deep links.
    expect(html).to.include(
      'href="https://www.youtube.com/watch?v=dQw4w9WgXcQ&amp;t=0"',
    );
    // Stamp text is CSS-only so reader selections don't ingest it.
    expect(html).to.include('data-time="00:00"');
    expect(html).to.include("content: attr(data-time)");
    expect(html).to.not.include(">00:00</a>");
  });

  it("links timestamps to the watch tab when watchUrl is set", function () {
    const watchUrl = "zotero://youtubetranscripts/watch/library/items/ABCD1234";
    const html = formatTranscriptHtml(transcript, url, {
      timestampMod: 2,
      watchUrl,
    });
    expect(html).to.include(`href="${watchUrl}?t=0"`);
    expect(html).to.include(`href="${watchUrl}?t=4000"`);
    expect(html).to.not.include("youtube.com/watch?v=dQw4w9WgXcQ&amp;t=");
  });

  it("emits a stable per-line anchor id for snapshot annotations", function () {
    const html = formatTranscriptHtml(transcript, url, { timestampMod: 2 });
    expect(html).to.include('id="yt-l-0"');
    expect(html).to.include('id="yt-l-2000"');
    expect(html).to.include('id="yt-l-4000"');
    // timestampMod=2 → timestamp shown on lines 0 and 2 only
    expect(html).to.include('data-time="00:00"');
    expect(html).to.include('data-time="00:04"');
    expect(html).to.include("Second line");
  });

  it("returns empty string for empty lines", function () {
    expect(
      formatTranscriptHtml({ title: "x", lines: [] }, url, {
        timestampMod: 5,
      }),
    ).to.equal("");
  });

  it("includes a watch-tab link when watchUrl is provided", function () {
    const watchUrl = "zotero://youtubetranscripts/watch/library/items/ABCD1234";
    const html = formatTranscriptHtml(transcript, url, {
      timestampMod: 2,
      watchUrl,
      watchLabel: "Open watch tab",
    });
    expect(html).to.include(`href="${watchUrl}"`);
    expect(html).to.include('class="watch"');
    expect(html).to.include(">Open watch tab</a>");
  });

  it("omits the watch-tab link when watchUrl is absent", function () {
    const html = formatTranscriptHtml(transcript, url, { timestampMod: 2 });
    expect(html).to.not.include("zotero://youtubetranscripts");
    expect(html).to.not.include('class="watch"');
  });
});
