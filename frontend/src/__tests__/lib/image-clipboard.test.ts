import { describe, expect, it } from "vitest";
import { codeBlockLanguage, rasterSize } from "../../lib/image-clipboard";

describe("rasterSize", () => {
  it("keeps source image pixels when the pixel ratio is one", () => {
    expect(rasterSize(1200, 630, 1)).toEqual({ width: 1200, height: 630 });
  });

  it("scales rendered code and diagrams for the active display density", () => {
    expect(rasterSize(640.2, 360.2, 2)).toEqual({ width: 1281, height: 721 });
  });

  it("rejects content without an exportable size", () => {
    expect(() => rasterSize(0, 100, 1)).toThrow("no exportable size");
    expect(() => rasterSize(100, 100, 0)).toThrow("no exportable size");
  });
});

describe("codeBlockLanguage", () => {
  it("passes the fenced Markdown language to the native code-card renderer", () => {
    const code = document.createElement("code");
    code.className = "hljs language-go";
    expect(codeBlockLanguage(code)).toBe("go");
  });

  it("lets Freeze analyse code when the fence has no language", () => {
    const code = document.createElement("code");
    code.className = "hljs";
    expect(codeBlockLanguage(code)).toBe("");
  });
});
