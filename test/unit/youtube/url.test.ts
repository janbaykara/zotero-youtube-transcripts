import { expect } from "chai";
import {
  extractYouTubeUrlFromText,
  isValidYouTubeUrl,
} from "../../../src/youtube/url";

describe("youtube/url", function() {
  describe("isValidYouTubeUrl", function() {
    it("validates youtube.com and youtu.be URLs", function() {
      expect(
        isValidYouTubeUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
      ).to.equal(true);
      expect(isValidYouTubeUrl("https://youtu.be/dQw4w9WgXcQ")).to.equal(true);
      expect(
        isValidYouTubeUrl("https://www.youtube.com/shorts/dQw4w9WgXcQ"),
      ).to.equal(true);
      expect(
        isValidYouTubeUrl("https://www.youtube.com/embed/dQw4w9WgXcQ"),
      ).to.equal(true);
      expect(
        isValidYouTubeUrl("https://www.youtube.com/live/dQw4w9WgXcQ"),
      ).to.equal(true);
    });

    it("rejects non-YouTube and malformed URLs", function() {
      expect(isValidYouTubeUrl("https://www.google.com")).to.equal(false);
      expect(isValidYouTubeUrl("not a url")).to.equal(false);
      expect(isValidYouTubeUrl("")).to.equal(false);
      expect(isValidYouTubeUrl("youtube.com")).to.equal(false);
      expect(isValidYouTubeUrl(null)).to.equal(false);
    });
  });

  describe("extractYouTubeUrlFromText", function() {
    it("extracts the first YouTube URL from mixed text", function() {
      const text =
        "Check https://www.google.com and https://www.youtube.com/watch?v=dQw4w9WgXcQ";
      expect(extractYouTubeUrlFromText(text)).to.equal(
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      );
    });

    it("returns null when no YouTube URL is present", function() {
      expect(extractYouTubeUrlFromText("no links here")).to.equal(null);
      expect(extractYouTubeUrlFromText("")).to.equal(null);
    });
  });
});
