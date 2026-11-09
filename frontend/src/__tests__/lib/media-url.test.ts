import { describe, expect, it } from "vitest";
import { mediaUrl } from "../../lib/media-url";

describe("mediaUrl", () => {
  it("requires a token and escapes the path and token", () => {
    expect(mediaUrl("folder/a & b.wav", "")).toBeNull();
    const result = mediaUrl("folder/a & b.wav", "a+b/c");
    const url = new URL(result!, "http://localhost");
    expect(url.pathname).toBe("/media/audio");
    expect(url.searchParams.get("path")).toBe("folder/a & b.wav");
    expect(url.searchParams.get("token")).toBe("a+b/c");
  });
});
