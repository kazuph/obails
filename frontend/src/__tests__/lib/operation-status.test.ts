import { describe, expect, it } from "vitest";
import { describeHumanOperationError } from "../../lib/operation-status";

describe("describeHumanOperationError", () => {
  it("keeps an already human backend sentence", () => {
    expect(describeHumanOperationError(
      new Error("popout window dependencies are unavailable"),
      "the new window could not be opened",
    )).toBe("popout window dependencies are unavailable");
  });

  it("does not expose a raw JSON error payload", () => {
    expect(describeHumanOperationError(
      '{"message":"cannot pop out the final visible workspace pane"}',
      "the new window could not be opened",
    )).toBe("the new window could not be opened");
    expect(describeHumanOperationError(
      { message: '["internal"]' },
      "the new window could not be opened",
    )).toBe("the new window could not be opened");
  });

  it("uses the fallback when no message can be extracted", () => {
    expect(describeHumanOperationError(undefined, "the new window could not be opened"))
      .toBe("the new window could not be opened");
  });
});
