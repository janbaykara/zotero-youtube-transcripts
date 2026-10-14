import { expect } from "chai";
import {
  formatAnnotationCommentHtml,
  formatLineCommentsHtml,
} from "../../../src/transcript/comment-html";

describe("comment-html", function () {
  describe("formatAnnotationCommentHtml", function () {
    it("escapes plain text and preserves line breaks", function () {
      const html = formatAnnotationCommentHtml("Hello <world> &\nnext");
      expect(html).to.equal("Hello &lt;world&gt; &amp;<br/>next");
    });

    it("emits XHTML-safe br tags from HTML input", function () {
      if (typeof DOMParser === "undefined") this.skip();
      const html = formatAnnotationCommentHtml("line1<br>line2");
      expect(html).to.include("<br/>");
      expect(html.toLowerCase()).to.not.match(/<br(?!\s*\/?>)/);
    });

    it("renders basic HTML when a DOM is available", function () {
      // jsdom-less environments strip tags; with DOMParser/document they sanitize.
      const input = "<p>Hi <strong>there</strong></p><script>alert(1)</script>";
      const html = formatAnnotationCommentHtml(input);
      if (typeof document !== "undefined" || typeof DOMParser !== "undefined") {
        expect(html).to.include("<strong>there</strong>");
        expect(html.toLowerCase()).to.not.include("<script");
      } else {
        expect(html).to.include("Hi");
        expect(html.toLowerCase()).to.not.include("<script");
      }
    });
  });

  describe("formatLineCommentsHtml", function () {
    it("wraps multiple comments in blocks", function () {
      const html = formatLineCommentsHtml(["one", "two"]);
      expect(html).to.include('class="yt-watch-comment-block"');
      expect(html).to.include("one");
      expect(html).to.include("two");
    });
  });
});
