import { expect } from "chai";

import {
  computeParagraphStarts,
  countSentences,
  endsWithSentence,
  looksLikeHeadline,
  supportsParagraphMode,
} from "../../../src/transcript/paragraph-breaks";

describe("paragraph-breaks", function () {
  describe("supportsParagraphMode", function () {
    it("allows short transcripts regardless of punctuation", function () {
      const blocks = Array.from({ length: 8 }, (_, i) => ({
        quote: `caption fragment ${i} without end`,
        quoteTimeOffset: i * 1000,
      }));
      expect(supportsParagraphMode(blocks)).to.equal(true);
    });

    it("rejects long transcripts with no sentence endings", function () {
      const blocks = Array.from({ length: 40 }, (_, i) => ({
        quote: `auto caption words keep going without any end ${i}`,
        quoteTimeOffset: i * 1000,
      }));
      expect(supportsParagraphMode(blocks)).to.equal(false);
    });

    it("rejects long transcripts with only a stray sentence ending", function () {
      const blocks = Array.from({ length: 40 }, (_, i) => ({
        quote:
          i === 10
            ? "One lonely period here."
            : `auto caption words keep going without any end ${i}`,
        quoteTimeOffset: i * 1000,
      }));
      expect(supportsParagraphMode(blocks)).to.equal(false);
    });

    it("allows punctuated lecture captions", function () {
      const blocks = Array.from({ length: 24 }, (_, i) => ({
        quote: `Complete spoken sentence number ${i + 1}.`,
        quoteTimeOffset: i * 1000,
      }));
      expect(supportsParagraphMode(blocks)).to.equal(true);
    });
  });

  describe("looksLikeHeadline", function () {
    it("detects ALL CAPS and trailing-colon labels", function () {
      expect(looksLikeHeadline("CHAPTER TWO")).to.equal(true);
      expect(looksLikeHeadline("Introduction:")).to.equal(true);
    });

    it("rejects ordinary sentences and caption fragments", function () {
      expect(looksLikeHeadline("He walked into the room.")).to.equal(false);
      expect(looksLikeHeadline("into it today by way of")).to.equal(false);
      expect(looksLikeHeadline("an essay from 1933,")).to.equal(false);
      expect(looksLikeHeadline("Arcades Project, but I want to lead")).to.equal(
        false,
      );
      expect(
        looksLikeHeadline("This is a longer ordinary caption without end"),
      ).to.equal(false);
    });
  });

  describe("countSentences / endsWithSentence", function () {
    it("counts terminal punctuation", function () {
      expect(countSentences("One. Two? Three!")).to.equal(3);
      expect(countSentences("And in a sense,")).to.equal(0);
      expect(endsWithSentence("And in a sense,")).to.equal(false);
      expect(endsWithSentence("around them.")).to.equal(true);
    });
  });

  describe("computeParagraphStarts", function () {
    it("marks the first cue and large silence gaps after a sentence end", function () {
      const starts = computeParagraphStarts([
        { quote: "Hello there.", quoteTimeOffset: 0, durationMs: 1000 },
        { quote: "More talk.", quoteTimeOffset: 1200, durationMs: 800 },
        { quote: "After a pause.", quoteTimeOffset: 5000, durationMs: 900 },
      ]);
      expect(starts[0]).to.equal(true);
      expect(starts[1]).to.equal(false);
      expect(starts[2]).to.equal(true);
    });

    it("does not break on a mid-sentence pause", function () {
      const starts = computeParagraphStarts([
        {
          quote: "young people, children,",
          quoteTimeOffset: 0,
          durationMs: 1000,
        },
        {
          quote: "benefit in the same way as in the past.",
          quoteTimeOffset: 4000,
          durationMs: 1200,
        },
      ]);
      expect(starts[0]).to.equal(true);
      expect(starts[1]).to.equal(false);
    });

    it("does not break on short mid-sentence caption cues", function () {
      const starts = computeParagraphStarts([
        {
          quote: "but I want to lead",
          quoteTimeOffset: 0,
          durationMs: 800,
        },
        {
          quote: "into it today by way of",
          quoteTimeOffset: 900,
          durationMs: 900,
        },
        {
          quote: "an essay from 1933,",
          quoteTimeOffset: 1900,
          durationMs: 900,
        },
        {
          quote: "entitled Experience and Poverty.",
          quoteTimeOffset: 2900,
          durationMs: 1000,
        },
      ]);
      expect(starts[0]).to.equal(true);
      expect(starts[1]).to.equal(false);
      expect(starts[2]).to.equal(false);
      expect(starts[3]).to.equal(false);
    });

    it("breaks before ALL-CAPS headings and after them", function () {
      const starts = computeParagraphStarts([
        {
          quote: "Warmup sentence here.",
          quoteTimeOffset: 0,
          durationMs: 1000,
        },
        { quote: "PART ONE", quoteTimeOffset: 1100, durationMs: 600 },
        {
          quote: "Body text resumes.",
          quoteTimeOffset: 1800,
          durationMs: 1000,
        },
      ]);
      expect(starts[0]).to.equal(true);
      expect(starts[1]).to.equal(true);
      expect(starts[2]).to.equal(true);
    });

    it("breaks after six finished sentences, only at a sentence boundary", function () {
      const blocks = [
        ...Array.from({ length: 6 }, (_, i) => ({
          quote: `Sentence number ${i + 1} ends here.`,
          quoteTimeOffset: i * 1000,
          durationMs: 800,
        })),
        {
          quote: "And in a sense,",
          quoteTimeOffset: 6000,
          durationMs: 700,
        },
        {
          quote: "he continued the thought.",
          quoteTimeOffset: 6800,
          durationMs: 900,
        },
      ];
      const starts = computeParagraphStarts(blocks);
      expect(starts[0]).to.equal(true);
      // After 6 complete sentences, the next cue starts a paragraph.
      expect(starts[6]).to.equal(true);
      expect(starts[7]).to.equal(false);
    });

    it("does not split mid-sentence even after many cues", function () {
      const blocks = [
        ...Array.from({ length: 6 }, (_, i) => ({
          quote: `Complete sentence ${i + 1}.`,
          quoteTimeOffset: i * 1000,
          durationMs: 800,
        })),
        {
          quote: "And in a sense,",
          quoteTimeOffset: 6000,
          durationMs: 700,
        },
        {
          quote: "he has incorporated those encounters.",
          quoteTimeOffset: 6800,
          durationMs: 900,
        },
      ];
      // Force a would-be break after sentence 6, then ensure the following
      // mid-clause cue is the paragraph start — not a split inside it.
      const starts = computeParagraphStarts(blocks);
      expect(starts[6]).to.equal(true);
      expect(starts[6] && blocks[6].quote.includes("And in a sense")).to.equal(
        true,
      );
      expect(starts[7]).to.equal(false);
    });
  });
});
