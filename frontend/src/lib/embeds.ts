import DOMPurify from "dompurify";

export type PreviewEmbedKind = "note" | "image" | "pdf" | "audio";

export type EmbedLink = {
  isEmbed: boolean;
  exists: boolean;
  targetPath: string;
  width?: number | null;
  height?: number | null;
};

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"]);
const AUDIO_EXTENSIONS = new Set(["mp3", "m4a", "wav", "ogg", "flac", "aac", "opus"]);

function extension(path: string): string {
  return path.slice(path.lastIndexOf(".") + 1).toLowerCase();
}

export function getPreviewEmbedKind(link: EmbedLink): PreviewEmbedKind | null {
  if (!link.isEmbed || !link.exists || !link.targetPath) {
    return null;
  }

  const ext = extension(link.targetPath);
  if (ext === "md" || ext === "markdown") return "note";
  if (IMAGE_EXTENSIONS.has(ext)) return "image";
  if (ext === "pdf") return "pdf";
  if (AUDIO_EXTENSIONS.has(ext)) return "audio";
  return null;
}

function validDimension(value: number | null | undefined): string | null {
  return Number.isSafeInteger(value) && value > 0 ? String(value) : null;
}

export function getImageEmbedDimensions(link: EmbedLink): { width?: string; height?: string } {
  const width = validDimension(link.width);
  const height = validDimension(link.height);
  return {
    ...(width ? { width } : {}),
    ...(height ? { height } : {}),
  };
}

export function sanitizeEmbedHtml(html: string): DocumentFragment {
  return DOMPurify.sanitize(html, {
    FORBID_TAGS: ["script", "style", "iframe", "object", "embed"],
    RETURN_DOM_FRAGMENT: true,
  }) as DocumentFragment;
}
