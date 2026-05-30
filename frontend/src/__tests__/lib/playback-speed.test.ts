import { describe, it, expect, beforeEach } from "vitest";
import {
  PLAYBACK_SPEEDS,
  DEFAULT_PLAYBACK_SPEED,
  formatSpeedLabel,
  normalizeSpeed,
  loadStoredSpeed,
  storeSpeed,
} from "../../lib/playback-speed";

describe("PLAYBACK_SPEEDS", () => {
  it("requested speeds are all available", () => {
    expect([...PLAYBACK_SPEEDS]).toEqual([0.5, 0.75, 1, 1.25, 1.5, 2, 3]);
  });

  it("includes 等倍速 (1x) as the default", () => {
    expect(DEFAULT_PLAYBACK_SPEED).toBe(1);
    expect(PLAYBACK_SPEEDS).toContain(1);
  });
});

describe("formatSpeedLabel", () => {
  it("formats integer speeds without decimals", () => {
    expect(formatSpeedLabel(1)).toBe("1×");
    expect(formatSpeedLabel(2)).toBe("2×");
    expect(formatSpeedLabel(3)).toBe("3×");
  });

  it("trims trailing zeros from fractional speeds", () => {
    expect(formatSpeedLabel(0.5)).toBe("0.5×");
    expect(formatSpeedLabel(0.75)).toBe("0.75×");
    expect(formatSpeedLabel(1.25)).toBe("1.25×");
    expect(formatSpeedLabel(1.5)).toBe("1.5×");
  });
});

describe("normalizeSpeed", () => {
  it("snaps to the closest valid option", () => {
    expect(normalizeSpeed(0.7)).toBe(0.75);
    expect(normalizeSpeed(1.4)).toBe(1.5);
    expect(normalizeSpeed(2.6)).toBe(3);
  });

  it("parses numeric strings", () => {
    expect(normalizeSpeed("1.25")).toBe(1.25);
  });

  it("falls back to default for invalid input", () => {
    expect(normalizeSpeed("abc")).toBe(DEFAULT_PLAYBACK_SPEED);
    expect(normalizeSpeed(0)).toBe(DEFAULT_PLAYBACK_SPEED);
    expect(normalizeSpeed(-5)).toBe(DEFAULT_PLAYBACK_SPEED);
    expect(normalizeSpeed(null)).toBe(DEFAULT_PLAYBACK_SPEED);
  });
});

describe("loadStoredSpeed / storeSpeed (real jsdom localStorage)", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("returns default when nothing stored", () => {
    expect(loadStoredSpeed(window.localStorage)).toBe(DEFAULT_PLAYBACK_SPEED);
  });

  it("round-trips a stored speed through localStorage", () => {
    storeSpeed(window.localStorage, 1.5);
    expect(window.localStorage.getItem("obails.playbackSpeed")).toBe("1.5");
    expect(loadStoredSpeed(window.localStorage)).toBe(1.5);
  });

  it("normalizes stored values on load", () => {
    window.localStorage.setItem("obails.playbackSpeed", "2.9");
    expect(loadStoredSpeed(window.localStorage)).toBe(3);
  });

  it("survives undefined storage", () => {
    expect(loadStoredSpeed(undefined)).toBe(DEFAULT_PLAYBACK_SPEED);
    expect(() => storeSpeed(undefined, 2)).not.toThrow();
  });
});
