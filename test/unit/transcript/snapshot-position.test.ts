import { expect } from "chai";

import { formatTranscriptHtml } from "../../../src/transcript/format-html";
import { transcriptLineAnchorId } from "../../../src/transcript/line-anchor";
import {
  buildSnapshotHighlightPosition,
  cellTextRangeInTbody,
  flattenHtmlTextNodes,
} from "../../../src/transcript/snapshot-position";
import type { TranscriptResponse } from "../../../src/transcript/types";

const transcript: TranscriptResponse = {
  title: "Test",
  lines: [
    { text: "Hello world", offset: 0, duration: 2000 },
    { text: "Second line", offset: 2000, duration: 2000 },
    { text: "Third line", offset: 4000, duration: 2000 },
  ],
};

describe("buildSnapshotHighlightPosition", function () {
  const html = formatTranscriptHtml(transcript, "https://youtu.be/dQw4w9WgXcQ", {
    timestampMod: 1,
  });

  it("anchors single-line selections on #yt-l-* with cell offsets", function () {
    const built = buildSnapshotHighlightPosition(html, [
      { lineOffsetMs: 0, start: 6, end: 11, text: "world" },
    ]);
    expect(built).to.not.equal(null);
    expect(built!.position.value).to.equal(`#${transcriptLineAnchorId(0)}`);
    expect(built!.position.refinedBy).to.deep.equal({
      type: "TextPositionSelector",
      start: 6,
      end: 11,
    });
    expect(built!.quote).to.equal("world");
  });

  it("anchors multi-line selections on tbody with in-range TextPosition", function () {
    const built = buildSnapshotHighlightPosition(html, [
      { lineOffsetMs: 0, start: 0, end: 11, text: "Hello world" },
      { lineOffsetMs: 2000, start: 0, end: 11, text: "Second line" },
    ]);
    expect(built).to.not.equal(null);
    expect(built!.position.value).to.equal("tbody");
    const refined = built!.position.refinedBy!;
    expect(refined.type).to.equal("TextPositionSelector");
    expect(refined.start).to.be.a("number");
    expect(refined.end).to.be.greaterThan(refined.start);

    const tbody = /<tbody\b[^>]*>([\s\S]*?)<\/tbody>/i.exec(html)![1];
    const stream = flattenHtmlTextNodes(tbody);
    expect(refined.end).to.be.at.most(stream.length);
    expect(stream.slice(refined.start, refined.end)).to.include("Hello world");
    expect(stream.slice(refined.start, refined.end)).to.include("Second line");
    expect(built!.quote).to.equal("Hello world Second line");
  });

  it("cellTextRangeInTbody locates caption cells in the text stream", function () {
    const tbody = /<tbody\b[^>]*>([\s\S]*?)<\/tbody>/i.exec(html)![1];
    const cell = cellTextRangeInTbody(tbody, transcriptLineAnchorId(2000));
    expect(cell).to.not.equal(null);
    expect(cell!.text).to.equal("Second line");
    expect(
      flattenHtmlTextNodes(tbody).slice(cell!.start, cell!.end),
    ).to.equal("Second line");
  });
});
