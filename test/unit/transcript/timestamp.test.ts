import { expect } from "chai";
import { formatTimestamp } from "../../../src/transcript/timestamp";

describe("formatTimestamp", function () {
  it("formats 3661000 as 01:01:01", function () {
    expect(formatTimestamp(3661000)).to.equal("01:01:01");
  });

  it("formats 61000 as 01:01", function () {
    expect(formatTimestamp(61000)).to.equal("01:01");
  });

  it("formats 3600000 as 01:00:00", function () {
    expect(formatTimestamp(3600000)).to.equal("01:00:00");
  });

  it("formats 0 as 00:00", function () {
    expect(formatTimestamp(0)).to.equal("00:00");
  });

  it("formats -5000 as 00:00", function () {
    expect(formatTimestamp(-5000)).to.equal("00:00");
  });
});
