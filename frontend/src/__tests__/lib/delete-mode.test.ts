import { describe, expect, it } from "vitest";
import {
  DEFAULT_DELETE_MODE,
  describeDeleteMode,
  normalizeDeleteMode,
} from "../../lib/delete-mode";

describe("delete mode", () => {
  it("defaults missing or invalid values to the system Trash", () => {
    expect(DEFAULT_DELETE_MODE).toBe("system_trash");
    expect(normalizeDeleteMode("")).toBe("system_trash");
    expect(normalizeDeleteMode("unknown")).toBe("system_trash");
  });

  it("preserves every supported deletion destination", () => {
    expect(normalizeDeleteMode("system_trash")).toBe("system_trash");
    expect(normalizeDeleteMode("vault_trash")).toBe("vault_trash");
    expect(normalizeDeleteMode("permanent")).toBe("permanent");
  });

  it("labels permanent deletion as irreversible", () => {
    expect(describeDeleteMode("system_trash")).toContain("where it can be restored");
    expect(describeDeleteMode("vault_trash")).toContain("where it can be restored");
    expect(describeDeleteMode("permanent")).toContain("cannot be undone");
  });
});
