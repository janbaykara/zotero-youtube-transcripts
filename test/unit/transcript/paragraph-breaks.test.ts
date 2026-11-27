import { equal, ok } from "assert";

import {
  computeParagraphStarts,
  countSentences,
  endsWithSentence,
  looksLikeHeadline,
} from "../../../src/transcript/paragraph-breaks";

describe("looksLikeHeadline", function () {
  it("detects ALL CAPS and trailing-colon labels", function () {
    ok(looksLikeHeadline("CHAPTER TWO"));
    ok(looksLikeHeadline("Introduction:"));
  });

  it("rejects ordinary sentences and caption fragments", function () {
    equal(looksLikeHeadline("He walked into the room."), false);
    equal(looksLikeHeadline("into it today by way of"), false);
    equal(looksLikeHeadline("an essay from 1933,"), false);
    equal(looksLikeHeadline("Arcades Project, but I want to lead"), false);
    equal(
      looksLikeHeadline("This is a longer ordinary caption without end"),
      false,
    );
  });
});

describe("countSentences / endsWithSentence", function () {
  it("counts terminal punctuation", function () {
    equal(countSentences("One. Two? Three!"), 3);
    equal(countSentences("And in a sense,"), 0);
    equal(endsWithSentence("And in a sense,"), false);
    equal(endsWithSentence("around them."), true);
  });
});

describe("computeParagraphStarts", function () {
  it("marks the first cue and large silence gaps after a sentence end", function () {
    const starts = computeParagraphStarts([
      { quote: "Hello there.", quoteTimeOffset: 0, durationMs: 1000 },
      { quote: "More talk.", quoteTimeOffset: 1200, durationMs: 800 },
      { quote: "After a pause.", quoteTimeOffset: 5000, durationMs: 900 },
    ]);
    equal(starts[0], true);
    equal(starts[1], false);
    equal(starts[2], true);
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
    equal(starts[0], true);
    equal(starts[1], false);
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
    equal(starts[0], true);
    equal(starts[1], false);
    equal(starts[2], false);
    equal(starts[3], false);
  });

  it("breaks before ALL-CAPS headings and after them", function () {
    const starts = computeParagraphStarts([
      { quote: "Warmup sentence here.", quoteTimeOffset: 0, durationMs: 1000 },
      { quote: "PART ONE", quoteTimeOffset: 1100, durationMs: 600 },
      { quote: "Body text resumes.", quoteTimeOffset: 1800, durationMs: 1000 },
    ]);
    equal(starts[0], true);
    equal(starts[1], true);
    equal(starts[2], true);
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
    equal(starts[0], true);
    // After 6 complete sentences, the next cue starts a paragraph.
    equal(starts[6], true);
    equal(starts[7], false);
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
    equal(starts[6], true);
    equal(starts[6] && blocks[6].quote.includes("And in a sense"), true);
    equal(starts[7], false);
  });
});
