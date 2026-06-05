import { describe, it, expect } from "vitest";
import { formatPlaybackTime } from "../../lib/time";

describe("formatPlaybackTime", () => {
    it("formats zero as 0:00", () => {
        expect(formatPlaybackTime(0)).toBe("0:00");
    });

    it("formats seconds under a minute", () => {
        expect(formatPlaybackTime(5)).toBe("0:05");
        expect(formatPlaybackTime(59)).toBe("0:59");
    });

    it("formats minutes and seconds", () => {
        expect(formatPlaybackTime(60)).toBe("1:00");
        expect(formatPlaybackTime(125)).toBe("2:05");
        expect(formatPlaybackTime(599)).toBe("9:59");
    });

    it("formats hours with zero-padded minutes and seconds", () => {
        expect(formatPlaybackTime(3600)).toBe("1:00:00");
        expect(formatPlaybackTime(3661)).toBe("1:01:01");
        expect(formatPlaybackTime(7325)).toBe("2:02:05");
    });

    it("floors fractional seconds", () => {
        expect(formatPlaybackTime(12.9)).toBe("0:12");
        expect(formatPlaybackTime(59.999)).toBe("0:59");
    });

    it("falls back to 0:00 for invalid values", () => {
        expect(formatPlaybackTime(NaN)).toBe("0:00");
        expect(formatPlaybackTime(Infinity)).toBe("0:00");
        expect(formatPlaybackTime(-10)).toBe("0:00");
    });
});
