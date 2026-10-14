import { expect } from "chai";
import { formatTimestamp } from "../../../src/transcript/timestamp";

describe("formatTimestamp", function() {
  const cases: Array<[number, string]> = [
    [3661000, "01:01:01"],
    [61000, "01:01"],
    [3600000, "01:00:00"],
    [0, "00:00"],
    [-5000, "00:00"],
  ];

  for (const [timestamp, expected] of cases) {

    it(`formats ${timestamp} as ${expected}`, function() {
      expect(formatTimestamp(timestamp)).to.equal(expected);
    });
  }
});
