import { describe, expect, it } from "vitest";
import { rasterSize } from "../../lib/image-clipboard";

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
