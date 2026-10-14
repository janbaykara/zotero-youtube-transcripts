import { expect } from "chai";
import {
  parseEmbeddedTranscriptData,
  serializeEmbeddedTranscriptData,
} from "../../../src/transcript/embedded-data";

describe("embedded transcript data", function () {
  it("round-trips through serialize + parse", function () {
    const payload = {
      videoId: "dQw4w9WgXcQ",
      title: "Hello",
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      lines: [{ text: "Hi", offset: 0, duration: 1000 }],
    };
    const html = `<html><body><script type="application/json" id="yt-transcript-data">
${serializeEmbeddedTranscriptData(payload)}
</script></body></html>`;
    expect(parseEmbeddedTranscriptData(html)).to.deep.equal(payload);
  });

  it("escapes script-breaking sequences in JSON", function () {
    const serialized = serializeEmbeddedTranscriptData({
      videoId: "abcdefghijk",
      title: "x",
      url: "https://youtu.be/abcdefghijk",
      lines: [{ text: "</script><b>hi</b>", offset: 0, duration: 1 }],
    });
    expect(serialized).to.include("\\u003c/script>");
    expect(serialized).to.not.include("</script>");
  });

  it("returns null for invalid payloads", function () {
    expect(parseEmbeddedTranscriptData("")).to.equal(null);
    expect(
      parseEmbeddedTranscriptData(
        `<script type="application/json" id="yt-transcript-data">{"videoId":1}</script>`,
      ),
    ).to.equal(null);
  });
});
