import { expect } from "chai";
import { parseCaptionXml } from "../../../src/youtube/parse-captions";

describe("parseCaptionXml", function () {
  it("parses <text> tag format", function () {
    const xml = `<?xml version="1.0" encoding="utf-8" ?>
      <transcript>
        <text start="0.5" dur="2.5">Hello world</text>
        <text start="3.0" dur="1.5">This is a test</text>
      </transcript>
    `;

    const lines = parseCaptionXml(xml);
    expect(lines).to.have.length(2);
    expect(lines[0].text).to.equal("Hello world");
    expect(lines[0].offset).to.equal(500);
    expect(lines[0].duration).to.equal(2500);
  });

  it("parses <p> tag format", function () {
    const xml = `<?xml version="1.0" encoding="utf-8" ?>
      <timedtext>
        <p t="500" d="2500">Hello world</p>
        <p t="3000" d="1500">This is a test</p>
      </timedtext>
    `;

    const lines = parseCaptionXml(xml);
    expect(lines).to.have.length(2);
    expect(lines[0].offset).to.equal(500);
    expect(lines[0].duration).to.equal(2500);
  });

  it("decodes HTML entities and strips tags", function () {
    const xml = `<?xml version="1.0" encoding="utf-8" ?>
      <transcript>
        <text start="0" dur="1">Tom &amp; Jerry</text>
        <text start="1" dur="1">Hello <font color="#AAAAAA">world</font></text>
      </transcript>
    `;

    const lines = parseCaptionXml(xml);
    expect(lines[0].text).to.equal("Tom & Jerry");
    expect(lines[1].text).to.equal("Hello world");
  });

  it("skips empty text entries", function () {
    const xml = `<?xml version="1.0" encoding="utf-8" ?>
      <transcript>
        <text start="0" dur="1">Hello</text>
        <text start="1" dur="1">   </text>
        <text start="2" dur="1">World</text>
      </transcript>
    `;

    const lines = parseCaptionXml(xml);
    expect(lines).to.have.length(2);
  });
});
