import { expect } from "chai";

import {
  parseTranscriptLineAnchorId,
  transcriptLineAnchorId,
} from "../../../src/transcript/line-anchor";

describe("transcript line anchors", function () {
  it("builds and parses stable ids", function () {
    expect(transcriptLineAnchorId(0)).to.equal("yt-l-0");
    expect(transcriptLineAnchorId(1234.9)).to.equal("yt-l-1234");
    expect(parseTranscriptLineAnchorId("yt-l-2000")).to.equal(2000);
    expect(parseTranscriptLineAnchorId("#yt-l-2000")).to.equal(2000);
    expect(parseTranscriptLineAnchorId("nope")).to.equal(null);
  });
});
