import { describe, expect, it } from "vitest";
import { isCurrentBinaryOpen } from "../../lib/binary-open-guard";

describe("isCurrentBinaryOpen", () => {
  it("rejects an older binary response after the same pane has opened a markdown generation", () => {
    expect(isCurrentBinaryOpen(
      { paneId: "left", generation: 4 },
      { paneId: "left", generation: 5 },
    )).toBe(false);
  });

  it("keeps pane identities independent even when their generation values match", () => {
    expect(isCurrentBinaryOpen(
      { paneId: "left", generation: 4 },
      { paneId: "right", generation: 4 },
    )).toBe(false);
    expect(isCurrentBinaryOpen(
      { paneId: "right", generation: 4 },
      { paneId: "right", generation: 4 },
    )).toBe(true);
  });
});
