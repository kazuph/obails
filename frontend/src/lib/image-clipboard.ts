import * as ImageClipboardService from "../../bindings/github.com/kazuph/obails/services/imageclipboardservice.js";

const PNG_MIME_TYPE = "image/png";

function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
        return;
      }
      reject(new Error("PNG image generation failed."));
    }, PNG_MIME_TYPE);
  });
}

function loadSvgImage(svg: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("The rendered content could not be loaded as an image."));
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

export function rasterSize(
  width: number,
  height: number,
  pixelRatio: number,
): { width: number; height: number } {
  if (width <= 0 || height <= 0 || pixelRatio <= 0) {
    throw new Error("The content has no exportable size.");
  }
  return {
    width: Math.ceil(width * pixelRatio),
    height: Math.ceil(height * pixelRatio),
  };
}

export function codeBlockLanguage(code: HTMLElement): string {
  const languageClass = Array.from(code.classList).find((name) => name.startsWith("language-"));
  return languageClass?.slice("language-".length) || "";
}

function elementCanvas(element: HTMLElement): {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  width: number;
  height: number;
} {
  const width = Math.ceil(Math.max(element.scrollWidth, element.getBoundingClientRect().width));
  const height = Math.ceil(Math.max(element.scrollHeight, element.getBoundingClientRect().height));
  const pixelRatio = window.devicePixelRatio || 1;
  const output = rasterSize(width, height, pixelRatio);
  const canvas = document.createElement("canvas");
  canvas.width = output.width;
  canvas.height = output.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas rendering is unavailable.");
  context.scale(pixelRatio, pixelRatio);
  return { canvas, context, width, height };
}

function backgroundColor(element: HTMLElement): string {
  let current: HTMLElement | null = element;
  while (current) {
    const color = window.getComputedStyle(current).backgroundColor;
    if (color !== "transparent" && color !== "rgba(0, 0, 0, 0)") return color;
    current = current.parentElement;
  }
  return "white";
}

export async function svgElementToPng(svg: SVGSVGElement, host: HTMLElement): Promise<Blob> {
  const { canvas, context, width, height } = elementCanvas(host);
  context.fillStyle = backgroundColor(host);
  context.fillRect(0, 0, width, height);

  const hostRect = host.getBoundingClientRect();
  const svgRect = svg.getBoundingClientRect();
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("width", String(svgRect.width));
  clone.setAttribute("height", String(svgRect.height));
  const serialized = new XMLSerializer().serializeToString(clone);
  const image = await loadSvgImage(serialized);
  context.drawImage(
    image,
    svgRect.left - hostRect.left + host.scrollLeft,
    svgRect.top - hostRect.top + host.scrollTop,
    svgRect.width,
    svgRect.height,
  );
  return canvasToPng(canvas);
}

export async function imageElementToPng(image: HTMLImageElement): Promise<Blob> {
  if (!image.complete) {
    await new Promise<void>((resolve, reject) => {
      image.addEventListener("load", () => resolve(), { once: true });
      image.addEventListener("error", () => reject(new Error("The image could not be loaded.")), { once: true });
    });
  }
  if (typeof image.decode === "function") await image.decode();
  const { width, height } = rasterSize(image.naturalWidth, image.naturalHeight, 1);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas rendering is unavailable.");
  context.drawImage(image, 0, 0, width, height);
  return canvasToPng(canvas);
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const separator = result.indexOf(",");
      if (separator === -1) {
        reject(new Error("PNG image encoding failed."));
        return;
      }
      resolve(result.slice(separator + 1));
    };
    reader.onerror = () => reject(reader.error || new Error("PNG image encoding failed."));
    reader.readAsDataURL(blob);
  });
}

export async function copyPngToClipboard(blob: Blob): Promise<void> {
  if (blob.type !== PNG_MIME_TYPE) {
    throw new Error("Only PNG images can be copied.");
  }
  await ImageClipboardService.SetPNG(await blobToBase64(blob));
}

export async function copyCodeImage(code: string, language: string): Promise<void> {
  await ImageClipboardService.SetCodePNG(code, language);
}
