import { expect } from "chai";
import {
  clampMatchIndex,
  findTranscriptMatches,
  nextMatchIndex,
  prevMatchIndex,
  wrapMatchIndex,
} from "../../../src/modules/transcript-find";
import type { TranscriptBlock } from "../../../src/transcript/types";

const blocks: TranscriptBlock[] = [
  { quote: "Hello world", quoteTimeOffset: 0 },
  { quote: "  HELLO again  ", quoteTimeOffset: 1000 },
  { quote: "nothing here", quoteTimeOffset: 2000 },
  { quote: "say hello hello!", quoteTimeOffset: 3000 },
];

describe("transcript-find", function () {
  describe("findTranscriptMatches", function () {
    it("returns empty for blank query", function () {
      expect(findTranscriptMatches(blocks, "")).to.deep.equal([]);
      expect(findTranscriptMatches(blocks, "   ")).to.deep.equal([]);
    });

    it("matches case-insensitively on trimmed text", function () {
      expect(findTranscriptMatches(blocks, "hello")).to.deep.equal([
        { segments: [{ blockIndex: 0, start: 0, end: 5 }] },
        { segments: [{ blockIndex: 1, start: 0, end: 5 }] },
        { segments: [{ blockIndex: 3, start: 4, end: 9 }] },
        { segments: [{ blockIndex: 3, start: 10, end: 15 }] },
      ]);
    });

    it("finds multiple hits in one line", function () {
      expect(findTranscriptMatches(blocks, "ll")).to.deep.equal([
        { segments: [{ blockIndex: 0, start: 2, end: 4 }] },
        { segments: [{ blockIndex: 1, start: 2, end: 4 }] },
        { segments: [{ blockIndex: 3, start: 6, end: 8 }] },
        { segments: [{ blockIndex: 3, start: 12, end: 14 }] },
      ]);
    });

    it("matches phrases that span consecutive lines", function () {
      expect(findTranscriptMatches(blocks, "world hello")).to.deep.equal([
        {
          segments: [
            { blockIndex: 0, start: 6, end: 11 },
            { blockIndex: 1, start: 0, end: 5 },
          ],
        },
      ]);
    });

    it("normalizes query whitespace for cross-line matches", function () {
      expect(findTranscriptMatches(blocks, "world   hello")).to.deep.equal([
        {
          segments: [
            { blockIndex: 0, start: 6, end: 11 },
            { blockIndex: 1, start: 0, end: 5 },
          ],
        },
      ]);
    });

    it("matches a phrase spanning more than two lines", function () {
      expect(
        findTranscriptMatches(blocks, "again nothing here say"),
      ).to.deep.equal([
        {
          segments: [
            { blockIndex: 1, start: 6, end: 11 },
            { blockIndex: 2, start: 0, end: 12 },
            { blockIndex: 3, start: 0, end: 3 },
          ],
        },
      ]);
    });

    it("returns empty when nothing matches", function () {
      expect(findTranscriptMatches(blocks, "zzz")).to.deep.equal([]);
    });
  });

  describe("match index helpers", function () {
    it("wrapMatchIndex wraps and handles empty", function () {
      expect(wrapMatchIndex(0, 0)).to.equal(-1);
      expect(wrapMatchIndex(3, 3)).to.equal(0);
      expect(wrapMatchIndex(-1, 3)).to.equal(2);
    });

    it("next/prev wrap around", function () {
      expect(nextMatchIndex(2, 3)).to.equal(0);
      expect(prevMatchIndex(0, 3)).to.equal(2);
      expect(nextMatchIndex(-1, 3)).to.equal(0);
      expect(prevMatchIndex(-1, 3)).to.equal(2);
      expect(nextMatchIndex(0, 0)).to.equal(-1);
    });

    it("clampMatchIndex keeps a valid index", function () {
      expect(clampMatchIndex(5, 0)).to.equal(-1);
      expect(clampMatchIndex(-1, 4)).to.equal(0);
      expect(clampMatchIndex(10, 4)).to.equal(3);
      expect(clampMatchIndex(1, 4)).to.equal(1);
    });
  });
});
