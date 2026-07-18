import { DecodeHintType } from "@zxing/library";

// Hints for the ZXing decoder: TRY_HARDER spends extra CPU time on each
// frame to pull a result out of glare, blur, or a skewed angle.
//
// NOTE: an earlier version of this file also set POSSIBLE_FORMATS to a
// fixed list of "typical retail" symbologies (UPC/EAN/Code128/etc.) to
// speed up each scan pass. That's a likely culprit for barcodes that
// decode on one device but not another: if a label uses a symbology
// outside that list (e.g. GS1 DataBar/RSS on variable-weight items,
// PDF417, Data Matrix, Aztec), it would silently never be recognized no
// matter how good the focus or lighting is - not an Android bug, just an
// overly-narrow allowlist. Removed here so every symbology ZXing supports
// is tried again.
export const SCAN_HINTS = new Map<DecodeHintType, unknown>([[DecodeHintType.TRY_HARDER, true]]);

// A native camera app photo is commonly 8-48 megapixels (and higher still
// on newer flagship phones). ZXing's decode() call is fully synchronous
// (it's not a Worker), so handing it a full-res photo blocks the main
// thread for a while - addressed below by downscaling before decode.
//
// But downscaling via the classic <img> + <canvas> route (loadImage /
// downscaleToCanvas below) still requires the browser to fully decode the
// ORIGINAL full-resolution image into memory first, and that memory isn't
// released deterministically - it's up to the garbage collector's timing,
// which lags under memory pressure. Doing that repeatedly in a row (taking
// "numerous pictures" is this app's core mobile workflow) can accumulate
// faster than the GC reclaims it, until the tab hits an out-of-memory
// error - matching reports of it working for the first several photos and
// then dying. createImageBitmap() with resize options avoids ever
// materializing the full-resolution bitmap where the browser supports it,
// and - critically - its result can be closed immediately and
// deterministically right after we've drawn it via .close(), so peak
// memory per photo stays small and bounded no matter how many photos get
// taken in a row. Falls back to the <img>/canvas path on browsers that
// don't support it.
export const MAX_PHOTO_DIMENSION = 1800;

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Couldn't load the captured photo."));
    img.src = url;
  });
}

function downscaleToCanvas(image: HTMLImageElement, maxDimension: number): HTMLCanvasElement {
  const { naturalWidth: width, naturalHeight: height } = image;
  const scale = Math.min(1, maxDimension / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas context unavailable.");
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export interface DecodedPhoto {
  canvas: HTMLCanvasElement;
  originalWidth: number;
  originalHeight: number;
}

export async function decodePhotoToCanvas(file: File, maxDimension: number): Promise<DecodedPhoto> {
  if (typeof createImageBitmap === "function") {
    let probe: ImageBitmap | null = null;
    try {
      // First pass just to read real dimensions - closed immediately so it
      // never lingers alongside the resized pass below.
      probe = await createImageBitmap(file);
      const { width: originalWidth, height: originalHeight } = probe;
      const scale = Math.min(1, maxDimension / Math.max(originalWidth, originalHeight));
      const targetWidth = Math.max(1, Math.round(originalWidth * scale));
      const targetHeight = Math.max(1, Math.round(originalHeight * scale));
      probe.close();
      probe = null;
      const bitmap = await createImageBitmap(file, {
        resizeWidth: targetWidth,
        resizeHeight: targetHeight,
        resizeQuality: "medium",
      });
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        bitmap.close();
        throw new Error("2D canvas context unavailable.");
      }
      ctx.drawImage(bitmap, 0, 0);
      bitmap.close();
      return { canvas, originalWidth, originalHeight };
    } catch {
      if (probe) probe.close();
      // Fall through to the <img>-based path below.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const image = await loadImage(url);
    const canvas = downscaleToCanvas(image, maxDimension);
    return { canvas, originalWidth: image.naturalWidth, originalHeight: image.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}
