import { expect } from "chai";
import { findActiveBlockIndex } from "../../../src/transcript/active-line";
import type { TranscriptBlock } from "../../../src/transcript/types";

const blocks: TranscriptBlock[] = [
  { quote: "a", quoteTimeOffset: 0 },
  { quote: "b", quoteTimeOffset: 5000 },
  { quote: "c", quoteTimeOffset: 12000 },
];

describe("findActiveBlockIndex", function () {
  it("returns -1 for empty blocks", function () {
    expect(findActiveBlockIndex([], 1000)).to.equal(-1);
  });

  it("picks the latest block at or before time", function () {
    expect(findActiveBlockIndex(blocks, 0)).to.equal(0);
    expect(findActiveBlockIndex(blocks, 4999)).to.equal(0);
    expect(findActiveBlockIndex(blocks, 5000)).to.equal(1);
    expect(findActiveBlockIndex(blocks, 11999)).to.equal(1);
    expect(findActiveBlockIndex(blocks, 12000)).to.equal(2);
    expect(findActiveBlockIndex(blocks, 999999)).to.equal(2);
  });
});
