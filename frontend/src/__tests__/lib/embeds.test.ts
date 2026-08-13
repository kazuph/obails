import { describe, expect, it } from "vitest";
import { parseMarkdown } from "../../lib/markdown";
import { getImageEmbedDimensions, getPreviewEmbedKind, sanitizeEmbedHtml } from "../../lib/embeds";

describe("getPreviewEmbedKind", () => {
  it("classifies only resolved embed links", () => {
    expect(getPreviewEmbedKind({ isEmbed: true, exists: true, targetPath: "note.md" })).toBe("note");
    expect(getPreviewEmbedKind({ isEmbed: true, exists: true, targetPath: "audio/tone.wav" })).toBe("audio");
    expect(getPreviewEmbedKind({ isEmbed: true, exists: false, targetPath: "note.md" })).toBeNull();
    expect(getPreviewEmbedKind({ isEmbed: false, exists: true, targetPath: "note.md" })).toBeNull();
  });
});

describe("getImageEmbedDimensions", () => {
  it("keeps only positive safe integer dimensions as DOM attribute values", () => {
    expect(getImageEmbedDimensions({ isEmbed: true, exists: true, targetPath: "image.png", width: 640, height: 480 }))
      .toEqual({ width: "640", height: "480" });
    expect(getImageEmbedDimensions({ isEmbed: true, exists: true, targetPath: "image.png", width: 0, height: Number.MAX_SAFE_INTEGER + 1 }))
      .toEqual({});
  });
});

describe("sanitizeEmbedHtml", () => {
  it("replaces the old unsanitized insertion path with a safe DOM fragment", () => {
    const unsafe = '<script>window.pwned = true</script><style>body { display: none }</style><iframe src="https://example.test"></iframe><object></object><embed><img src="x" onerror="window.pwned = true"><a href="javascript:window.pwned = true">bad</a>';
    const oldTemplate = document.createElement("template");
    oldTemplate.innerHTML = unsafe;
    expect(oldTemplate.content.querySelector("script")).not.toBeNull();
    expect(oldTemplate.content.querySelector("[onerror]")).not.toBeNull();
    expect(oldTemplate.content.querySelector('a[href^="javascript:"]')).not.toBeNull();

    const fragment = sanitizeEmbedHtml(unsafe);
    expect(fragment.querySelector("script, style, iframe, object, embed")).toBeNull();
    expect(fragment.querySelector("[onerror]")).toBeNull();
    expect(fragment.querySelector('[href^="javascript:"]')).toBeNull();
  });

  it("preserves Obails wiki, KaTeX, data, class, aria, and safe href attributes", () => {
    const fragment = sanitizeEmbedHtml(parseMarkdown("![[Target Note]]\n\n$y=x^2$\n\n[Safe](https://example.test/path)"));
    const wikiLink = fragment.querySelector<HTMLElement>(".wiki-link[data-embed-link='wikilink']");
    expect(wikiLink?.getAttribute("data-link")).toBe("Target Note");
    expect(wikiLink?.classList.contains("wiki-link")).toBe(true);
    expect(fragment.querySelector(".katex")).not.toBeNull();
    expect(fragment.querySelector<HTMLAnchorElement>('a[href="https://example.test/path"]')?.href).toBe("https://example.test/path");
    expect(sanitizeEmbedHtml('<span aria-label="Embedded note">note</span>').querySelector("span")?.getAttribute("aria-label")).toBe("Embedded note");
  });
});
