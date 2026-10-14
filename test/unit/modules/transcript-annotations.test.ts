import { expect } from "chai";

import {
  joinedQuoteFromRanges,
  lineRangesFromSelectedText,
  mapAnnotationsToHighlights,
  rangesBetweenCarets,
  stripTranscriptTimestamps,
  type TranscriptSelectionRange,
} from "../../../src/modules/transcript-annotations";
import type { TranscriptBlock } from "../../../src/transcript/types";

function fakeAnnotation(opts: {
  id: number;
  key: string;
  text: string;
  color?: string;
  comment?: string;
  position?: unknown;
}): Zotero.Item {
  return {
    id: opts.id,
    key: opts.key,
    annotationType: "highlight",
    annotationText: opts.text,
    annotationColor: opts.color || "#ffd400",
    annotationComment: opts.comment || "",
    annotationPosition: opts.position ? JSON.stringify(opts.position) : "",
  } as unknown as Zotero.Item;
}

describe("transcript-annotations", function () {
  describe("mapAnnotationsToHighlights", function () {
    const blocks: TranscriptBlock[] = [
      { quote: "Hello world", quoteTimeOffset: 0 },
      { quote: "Second line here", quoteTimeOffset: 2000 },
    ];

    it("maps CssSelector anchors with TextPositionSelector", function () {
      const mapped = mapAnnotationsToHighlights(
        [
          fakeAnnotation({
            id: 1,
            key: "ABCDEFGH",
            text: "world",
            position: {
              type: "CssSelector",
              value: "#yt-l-0",
              refinedBy: {
                type: "TextPositionSelector",
                start: 6,
                end: 11,
              },
            },
          }),
        ],
        blocks,
      );
      expect(mapped).to.have.length(1);
      expect(mapped[0].lineOffsetMs).to.equal(0);
      expect(mapped[0].start).to.equal(6);
      expect(mapped[0].end).to.equal(11);
      expect(mapped[0].text).to.equal("world");
    });

    it("falls back to text match when selector is missing", function () {
      const mapped = mapAnnotationsToHighlights(
        [
          fakeAnnotation({
            id: 2,
            key: "IJKLMNOP",
            text: "Second line",
          }),
        ],
        blocks,
      );
      expect(mapped).to.have.length(1);
      expect(mapped[0].lineOffsetMs).to.equal(2000);
      expect(mapped[0].start).to.equal(0);
      expect(mapped[0].end).to.equal("Second line".length);
    });

    it("splits a multi-line quote across consecutive caption lines", function () {
      const mapped = mapAnnotationsToHighlights(
        [
          fakeAnnotation({
            id: 3,
            key: "MULTI001",
            text: "Hello world Second line here",
            comment: "note",
            position: {
              type: "CssSelector",
              value: "#yt-l-0",
              refinedBy: {
                type: "TextPositionSelector",
                // Deliberately past the first line — forces span logic.
                start: 0,
                end: 40,
              },
            },
          }),
        ],
        blocks,
      );
      expect(mapped).to.have.length(2);
      expect(mapped[0].lineOffsetMs).to.equal(0);
      expect(mapped[0].text).to.equal("Hello world");
      expect(mapped[0].comment).to.equal("note");
      expect(mapped[1].lineOffsetMs).to.equal(2000);
      expect(mapped[1].text).to.equal("Second line here");
      expect(mapped[1].comment).to.equal("");
    });

    it("keeps per-line TextPositionSelector highlights intact", function () {
      const mapped = mapAnnotationsToHighlights(
        [
          fakeAnnotation({
            id: 4,
            key: "LINE0001",
            text: "Hello",
            position: {
              type: "CssSelector",
              value: "#yt-l-0",
              refinedBy: {
                type: "TextPositionSelector",
                start: 0,
                end: 5,
              },
            },
          }),
          fakeAnnotation({
            id: 5,
            key: "LINE0002",
            text: "Second",
            position: {
              type: "CssSelector",
              value: "#yt-l-2000",
              refinedBy: {
                type: "TextPositionSelector",
                start: 0,
                end: 6,
              },
            },
          }),
        ],
        blocks,
      );
      expect(mapped).to.have.length(2);
      expect(mapped.map((h) => h.lineOffsetMs)).to.deep.equal([0, 2000]);
    });

    it("maps multi-line quotes that include HTML timestamp tokens", function () {
      // Reader selection across a stamped row often injects "00:02".
      const mapped = mapAnnotationsToHighlights(
        [
          fakeAnnotation({
            id: 6,
            key: "WITHSTAMP",
            text: "Hello world 00:02 Second line here",
            position: {
              type: "CssSelector",
              value: "#yt-l-0",
              refinedBy: {
                type: "TextPositionSelector",
                start: 0,
                end: 50,
              },
            },
          }),
        ],
        blocks,
      );
      expect(mapped).to.have.length(2);
      expect(mapped[0].text).to.equal("Hello world");
      expect(mapped[1].text).to.equal("Second line here");
    });

    it("strips known transcript timestamps from reader quotes", function () {
      expect(
        stripTranscriptTimestamps("Hello world 00:02 Second line here", blocks),
      ).to.equal("Hello world Second line here");
    });

    it("maps tbody-anchored multi-line positions via quote text", function () {
      const mapped = mapAnnotationsToHighlights(
        [
          fakeAnnotation({
            id: 7,
            key: "TBODY001",
            text: "Hello world Second line here",
            position: {
              type: "CssSelector",
              value: "tbody",
              refinedBy: {
                type: "TextPositionSelector",
                start: 100,
                end: 200,
              },
            },
          }),
        ],
        blocks,
      );
      expect(mapped).to.have.length(2);
      expect(mapped.map((h) => h.text)).to.deep.equal([
        "Hello world",
        "Second line here",
      ]);
    });

    it("maps multi-line quotes that start mid-line", function () {
      const mapped = mapAnnotationsToHighlights(
        [
          fakeAnnotation({
            id: 8,
            key: "MIDSTART",
            text: "world Second line here",
            position: {
              type: "CssSelector",
              value: "tbody",
              refinedBy: {
                type: "TextPositionSelector",
                start: 50,
                end: 120,
              },
            },
          }),
        ],
        blocks,
      );
      expect(mapped).to.have.length(2);
      expect(mapped[0]).to.include({
        lineOffsetMs: 0,
        start: 6,
        end: 11,
        text: "world",
      });
      expect(mapped[1]).to.include({
        lineOffsetMs: 2000,
        start: 0,
        end: 16,
        text: "Second line here",
      });
    });

    it("maps multi-line quotes that end mid-line", function () {
      const mapped = mapAnnotationsToHighlights(
        [
          fakeAnnotation({
            id: 9,
            key: "MIDEND",
            text: "Hello world Second",
            position: {
              type: "CssSelector",
              value: "tbody",
              refinedBy: {
                type: "TextPositionSelector",
                start: 10,
                end: 80,
              },
            },
          }),
        ],
        blocks,
      );
      expect(mapped).to.have.length(2);
      expect(mapped[0].text).to.equal("Hello world");
      expect(mapped[1]).to.include({
        lineOffsetMs: 2000,
        start: 0,
        end: 6,
        text: "Second",
      });
    });

    it("maps multi-line quotes with mid-line start and end", function () {
      const mapped = mapAnnotationsToHighlights(
        [
          fakeAnnotation({
            id: 10,
            key: "MIDBOTH",
            text: "world Second",
            position: {
              type: "CssSelector",
              value: "tbody",
              refinedBy: {
                type: "TextPositionSelector",
                start: 20,
                end: 60,
              },
            },
          }),
        ],
        blocks,
      );
      expect(mapped).to.have.length(2);
      expect(mapped.map((h) => h.text)).to.deep.equal(["world", "Second"]);
      expect(mapped[0].start).to.equal(6);
      expect(mapped[1].end).to.equal(6);
    });
  });

  describe("rangesBetweenCarets", function () {
    const lines = [
      { lineOffsetMs: 68000, text: "vegetable and uh this is dry seasoning." },
      { lineOffsetMs: 72000, text: "It's the main seasoning. This is very" },
    ];

    it("covers every caption from start caret to end caret", function () {
      const ranges = rangesBetweenCarets(
        lines,
        { lineOffsetMs: 68000, offset: 0 },
        { lineOffsetMs: 72000, offset: lines[1].text.length },
      );
      expect(ranges).to.have.length(2);
      expect(ranges[0].text).to.equal(lines[0].text);
      expect(ranges[1].text).to.equal(lines[1].text);
    });

    it("supports partial first and last lines", function () {
      const ranges = rangesBetweenCarets(
        lines,
        { lineOffsetMs: 68000, offset: 10 },
        { lineOffsetMs: 72000, offset: 4 },
      );
      expect(ranges).to.have.length(2);
      expect(ranges[0].text).to.equal(lines[0].text.slice(10));
      expect(ranges[1].text).to.equal("It's");
    });
  });

  describe("lineRangesFromSelectedText", function () {
    const lines = [
      { lineOffsetMs: 68000, text: "vegetable and uh this is dry seasoning." },
      { lineOffsetMs: 72000, text: "It's the main seasoning. This is very" },
    ];

    it("maps a newline-joined selection onto consecutive lines", function () {
      const selected = `${lines[0].text}\n${lines[1].text}`;
      const ranges = lineRangesFromSelectedText(lines, selected);
      expect(ranges).to.have.length(2);
      expect(ranges.map((r) => r.lineOffsetMs)).to.deep.equal([68000, 72000]);
    });
  });

  describe("joinedQuoteFromRanges + map round-trip", function () {
    it("stores one quote that maps back onto each selected line", function () {
      const selection: TranscriptSelectionRange[] = [
        {
          lineOffsetMs: 0,
          start: 0,
          end: 11,
          text: "Hello world",
        },
        {
          lineOffsetMs: 2000,
          start: 0,
          end: 16,
          text: "Second line here",
        },
      ];
      const quote = joinedQuoteFromRanges(selection);
      expect(quote).to.equal("Hello world Second line here");

      const mapped = mapAnnotationsToHighlights(
        [
          fakeAnnotation({
            id: 99,
            key: "JOINED001",
            text: quote,
            position: {
              type: "CssSelector",
              value: "#yt-l-0",
              refinedBy: {
                type: "TextPositionSelector",
                start: 0,
                end: quote.length,
              },
            },
          }),
        ],
        [
          { quote: "Hello world", quoteTimeOffset: 0 },
          { quote: "Second line here", quoteTimeOffset: 2000 },
        ],
      );
      expect(mapped).to.have.length(2);
      expect(mapped[0].id).to.equal(99);
      expect(mapped[1].id).to.equal(99);
      expect(mapped.map((h) => h.text)).to.deep.equal([
        "Hello world",
        "Second line here",
      ]);
    });
  });
});
