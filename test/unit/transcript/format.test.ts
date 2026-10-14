import { expect } from "chai";
import { formatTranscript } from "../../../src/transcript/format";
import type { TranscriptResponse } from "../../../src/transcript/types";

const mockTranscriptResponse: TranscriptResponse = {
  title: "Test Video Title",
  lines: [
    { text: "Hello world", offset: 0, duration: 2000 },
    { text: "This is a test", offset: 2000, duration: 3000 },
    { text: "of the transcript", offset: 5000, duration: 2500 },
    { text: "formatting system", offset: 7500, duration: 3000 },
    { text: "with multiple lines", offset: 10500, duration: 2800 },
    { text: "for comprehensive testing", offset: 13300, duration: 4000 },
  ],
};

const testUrl = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";

describe("formatTranscript", function() {
  it("formats minimal template as plain text", function() {
    const result = formatTranscript(mockTranscriptResponse, testUrl, {
      timestampMod: 5,
      template: "minimal",
    });
    expect(result).to.equal(
      "Hello world This is a test of the transcript formatting system with multiple lines for comprehensive testing",
    );
  });

  it("includes timestamp links in standard template", function() {
    const result = formatTranscript(mockTranscriptResponse, testUrl, {
      timestampMod: 2,
      template: "standard",
    });
    expect(result).to.include(
      "[00:00](https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=0)",
    );
    expect(result).to.include(
      "[00:05](https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=5)",
    );
  });

  it("includes title and source in rich template", function() {
    const result = formatTranscript(mockTranscriptResponse, testUrl, {
      timestampMod: 2,
      template: "rich",
    });
    expect(result).to.include("## Test Video Title");
    expect(result).to.include(
      "**Source**: https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    );
  });

  it("returns empty string for empty transcript", function() {
    const result = formatTranscript({ title: "Empty", lines: [] }, testUrl, {
      timestampMod: 5,
    });
    expect(result).to.equal("");
  });
});
