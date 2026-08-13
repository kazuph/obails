import { describe, expect, it } from "vitest";
import { evaluateIndependentScroll, type ScrollOwnerSnap } from "../../lib/independent-scroll-oracle";

function snap(partial: Partial<ScrollOwnerSnap>): ScrollOwnerSnap {
  return {
    left: "L0",
    body: "B0",
    right: "R0",
    outlineY: 100,
    ...partial,
  };
}

describe("evaluateIndependentScroll", () => {
  it("passes when each owner changes alone in right→left→body order", () => {
    const baseline = snap({});
    const afterRight = snap({ outlineY: 140, right: "R1" });
    const afterLeft = snap({ outlineY: 140, right: "R1", left: "L1" });
    const afterBody = snap({ outlineY: 140, right: "R1", left: "L1", body: "B1" });
    const verdict = evaluateIndependentScroll(baseline, afterRight, afterLeft, afterBody);
    expect(verdict).toEqual({
      rightOnly: true,
      leftOnly: true,
      bodyOnly: true,
      independentScrollAssert: true,
    });
  });

  it("allows body scroll to sync outline highlight/position without failing bodyOnly", () => {
    const baseline = snap({});
    const afterRight = snap({ outlineY: 140, right: "R1" });
    const afterLeft = snap({ outlineY: 140, right: "R1", left: "L1" });
    const afterBody = snap({ outlineY: 200, right: "R2", left: "L1", body: "B1" });
    const verdict = evaluateIndependentScroll(baseline, afterRight, afterLeft, afterBody);
    expect(verdict.bodyOnly).toBe(true);
    expect(verdict.independentScrollAssert).toBe(true);
  });

  it("fails when body scroll also moves the left owner", () => {
    const baseline = snap({});
    const afterRight = snap({ outlineY: 140, right: "R1" });
    const afterLeft = snap({ outlineY: 140, right: "R1", left: "L1" });
    const afterBody = snap({ outlineY: 140, right: "R1", left: "L2", body: "B1" });
    const verdict = evaluateIndependentScroll(baseline, afterRight, afterLeft, afterBody);
    expect(verdict.bodyOnly).toBe(false);
    expect(verdict.independentScrollAssert).toBe(false);
  });

  it("fails when right scroll does not move outline Y", () => {
    const baseline = snap({});
    const afterRight = snap({});
    const afterLeft = snap({ left: "L1" });
    const afterBody = snap({ left: "L1", body: "B1" });
    const verdict = evaluateIndependentScroll(baseline, afterRight, afterLeft, afterBody);
    expect(verdict.rightOnly).toBe(false);
    expect(verdict.independentScrollAssert).toBe(false);
  });
});
