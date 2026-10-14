import { expect } from "chai";
import { formatTranscriptHtml } from "../../../src/transcript/format-html";
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
    expect(html).to.not.include("<script");
    expect(html).to.not.include("<iframe");
  });

  it("lays out timestamps and text in two table columns", function () {
    const html = formatTranscriptHtml(transcript, url, { timestampMod: 2 });
    expect(html).to.include('<table class="transcript">');
    expect(html).to.include('<td class="ts">');
    expect(html).to.include('<td class="text">');
    expect(html).to.include("user-select: none");
    expect(html).to.include(
      'href="https://www.youtube.com/watch?v=dQw4w9WgXcQ&amp;t=0"',
    );
    expect(html).to.include(">00:00</a>");
  });

  it("returns empty string for empty lines", function () {
    expect(
      formatTranscriptHtml({ title: "x", lines: [] }, url, {
        timestampMod: 5,
      }),
    ).to.equal("");
  });
});
