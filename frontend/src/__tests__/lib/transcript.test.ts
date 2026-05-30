import { describe, it, expect } from "vitest";
import { transcriptPathForAudio } from "../../lib/transcript";

describe("transcriptPathForAudio", () => {
  it("replaces the audio extension with .md", () => {
    expect(transcriptPathForAudio("foo.wav")).toBe("foo.md");
    expect(transcriptPathForAudio("foo.mp3")).toBe("foo.md");
    expect(transcriptPathForAudio("foo.m4a")).toBe("foo.md");
  });

  it("keeps the directory path", () => {
    expect(transcriptPathForAudio("55_Podcast/foo.wav")).toBe("55_Podcast/foo.md");
    expect(transcriptPathForAudio("a/b/c.opus")).toBe("a/b/c.md");
  });

  it("handles names with spaces and unicode", () => {
    expect(transcriptPathForAudio("name with spaces.wav")).toBe("name with spaces.md");
    expect(transcriptPathForAudio("55_Podcast/小説思考_ユナ版.wav")).toBe(
      "55_Podcast/小説思考_ユナ版.md",
    );
  });

  it("appends .md when there is no extension", () => {
    expect(transcriptPathForAudio("noext")).toBe("noext.md");
  });

  it("does not treat a dot in a directory name as an extension", () => {
    expect(transcriptPathForAudio("my.folder/track")).toBe("my.folder/track.md");
  });

  it("matches the Go backend behavior for the sample file", () => {
    // services/transcribe_service.go transcriptPath と一致すること
    expect(transcriptPathForAudio("podcast/episode.wav")).toBe("podcast/episode.md");
  });
});
