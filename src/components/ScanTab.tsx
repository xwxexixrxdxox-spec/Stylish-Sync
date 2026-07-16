"use client";

import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader, IScannerControls } from "@zxing/browser";
import { DecodeHintType } from "@zxing/library";
import { InventoryItem, Unit } from "@/lib/types";
import { lookupBarcode } from "@/lib/productLookup";

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
const SCAN_HINTS = new Map<DecodeHintType, unknown>([[DecodeHintType.TRY_HARDER, true]]);

// Camera capability keys below (focusMode, exposureMode, whiteBalanceMode,
// pointsOfInterest) come from the W3C Image Capture spec, which extends
// the standard MediaTrackConstraints/Capabilities but isn't part of
// TypeScript's bundled DOM lib - hence the extra types and casts.
interface ExtendedTrackCapabilities extends MediaTrackCapabilities {
  focusMode?: string[];
  exposureMode?: string[];
  whiteBalanceMode?: string[];
  pointsOfInterest?: unknown;
}
type ExtendedConstraintSet = MediaTrackConstraintSet & {
  focusMode?: string;
  exposureMode?: string;
  whiteBalanceMode?: string;
  pointsOfInterest?: { x: number; y: number }[];
};

// Prefer the rear camera at a higher resolution. "ideal" constraints are a
// soft preference, so this still falls back gracefully on devices/browsers
// that don't support them. Focus/exposure/white-balance are requested here
// too, but on a lot of Android + Chrome combinations that initial request
// is ignored - applyCameraTuning() below re-applies them directly on the
// live track once the stream exists, which is much more reliably honored.
const SCAN_VIDEO_CONSTRAINTS: MediaTrackConstraints = {
  facingMode: { ideal: "environment" },
  width: { ideal: 1920 },
  height: { ideal: 1080 },
  advanced: [
    {
      focusMode: "continuous",
      exposureMode: "continuous",
      whiteBalanceMode: "continuous",
    } as ExtendedConstraintSet,
  ],
};

// A focusMode value counts as "actionable" only if we'd actually do
// something with it in focusTrackAt below - keep this in sync with the
// single-shot/continuous branches there so the tap-to-focus hint is never
// shown for a capability (e.g. "manual") that tapping wouldn't act on.
function hasActionableFocusMode(focusMode: string[] | undefined): boolean {
  return !!focusMode && (focusMode.includes("single-shot") || focusMode.includes("continuous"));
}

// Re-applies continuous focus/exposure/white-balance directly on the live
// video track (feature-detected via getCapabilities, so this is a no-op -
// not an error - on browsers/devices that don't expose camera controls,
// e.g. iOS Safari). Returns whether the track exposes an actionable focus
// control, which the caller uses to decide whether to offer tap-to-focus.
function applyCameraTuning(stream: MediaStream): boolean {
  const track = stream.getVideoTracks()[0];
  if (!track || typeof track.getCapabilities !== "function") return false;
  let caps: ExtendedTrackCapabilities;
  try {
    caps = track.getCapabilities() as ExtendedTrackCapabilities;
  } catch {
    return false;
  }
  const advanced: ExtendedConstraintSet = {};
  if (caps.focusMode?.includes("continuous")) advanced.focusMode = "continuous";
  if (caps.exposureMode?.includes("continuous")) advanced.exposureMode = "continuous";
  if (caps.whiteBalanceMode?.includes("continuous")) advanced.whiteBalanceMode = "continuous";
  if (Object.keys(advanced).length > 0) {
    // Best-effort only - a device rejecting this constraint shouldn't be
    // treated any differently than one that never had the capability.
    track.applyConstraints({ advanced: [advanced] } as MediaTrackConstraints).catch(() => {});
  }
  return hasActionableFocusMode(caps.focusMode);
}

// Mimics a native camera app's "tap to focus": nudges the lens to refocus
// at the tapped point (as a normalized 0-1 x/y), then hands focus back to
// continuous mode shortly after. Entirely feature-detected/best-effort -
// silently does nothing on devices/browsers that don't support manual
// focus points (which includes most iOS Safari versions, where continuous
// autofocus already runs by default and needs no help). Returns a cleanup
// function that cancels the pending "revert to continuous" timer, if any,
// so callers can clear it on stop/unmount.
function focusTrackAt(stream: MediaStream, x: number, y: number): () => void {
  const track = stream.getVideoTracks()[0];
  if (!track || typeof track.getCapabilities !== "function") return () => {};
  let caps: ExtendedTrackCapabilities;
  try {
    caps = track.getCapabilities() as ExtendedTrackCapabilities;
  } catch {
    return () => {};
  }
  if (!hasActionableFocusMode(caps.focusMode)) return () => {};
  const advanced: ExtendedConstraintSet = {};
  if (caps.pointsOfInterest) advanced.pointsOfInterest = [{ x, y }];
  advanced.focusMode = caps.focusMode?.includes("single-shot") ? "single-shot" : "continuous";

  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  track
    .applyConstraints({ advanced: [advanced] } as MediaTrackConstraints)
    .then(() => {
      if (advanced.focusMode === "single-shot" && caps.focusMode?.includes("continuous")) {
        timeoutId = setTimeout(() => {
          track
            .applyConstraints({ advanced: [{ focusMode: "continuous" } as ExtendedConstraintSet] } as MediaTrackConstraints)
            .catch(() => {});
        }, 1500);
      }
    })
    .catch(() => {});

  return () => {
    if (timeoutId) clearTimeout(timeoutId);
  };
}

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
const MAX_PHOTO_DIMENSION = 1800;

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

interface DecodedPhoto {
  canvas: HTMLCanvasElement;
  originalWidth: number;
  originalHeight: number;
}

async function decodePhotoToCanvas(file: File, maxDimension: number): Promise<DecodedPhoto> {
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

// Temporary on-screen diagnostics for tracking down device-specific scan
// failures (e.g. reports of "works on iOS, not on this Android phone")
// without needing to see the device's screen directly. Shows the camera
// settings actually granted plus a live tally of decode attempts, broken
// down by why each attempt failed - "no barcode-shaped pattern found" vs.
// "found something but couldn't read it cleanly" are very different
// problems (framing/distance vs. focus/blur/resolution).
interface ScanDiagnostics {
  attempts: number;
  notFound: number;
  errorKinds: Record<string, number>;
  actualWidth: number | null;
  actualHeight: number | null;
  facingModeActual: string | null;
  focusModes: string[] | null;
  exposureModes: string[] | null;
  whiteBalanceModes: string[] | null;
  tuningApplied: boolean;
}

const EMPTY_DIAGNOSTICS: ScanDiagnostics = {
  attempts: 0,
  notFound: 0,
  errorKinds: {},
  actualWidth: null,
  actualHeight: null,
  facingModeActual: null,
  focusModes: null,
  exposureModes: null,
  whiteBalanceModes: null,
  tuningApplied: false,
};

const UNITS: Unit[] = [
  "ea", "box", "case", "pack", "bag", "bottle", "can", "roll", "dozen", "pair",
  "kg", "lb", "oz", "g", "L", "ml", "fl oz",
];

interface Props {
  items: InventoryItem[];
  onAddStock: (input: { barcode: string; name: string; quantity: number; unit: Unit; pricePerUnit: number }) => void;
  onRemoveStock: (input: { barcode: string; quantity: number }) => void;
}

// Surfaced next to the Barcode field so a lookup - whether triggered by the
// scanner, the photo fallback, or someone typing/pasting a barcode by hand -
// always gives visible feedback instead of silently filling in a name (or
// silently doing nothing when nothing was found). "existing" and "found"
// are both successes, kept separate because they mean different things:
// "existing" matched an item already in this inventory, "found" pulled a
// product name from the external lookup for a barcode seen for the first
// time.
type LookupStatus = "idle" | "checking" | "existing" | "found" | "not-found";

// Fallback for devices whose browser camera stream never reports a usable
// focus capability at all (confirmed via the diagnostics above: some Android
// + Chrome combinations only ever expose focusMode: ["manual"], with no
// "continuous" or "single-shot" - meaning applyCameraTuning/focusTrackAt
// above have nothing to work with, and the live getUserMedia stream stays
// stuck at a fixed, non-macro focus distance no matter the barcode's
// distance or angle). Rather than fight the Web Image Capture API further,
// this hands the shot off to the phone's native camera app instead (which
// autofocuses fine - it's the OS camera, not the constrained web stream)
// via <input type="file" capture>, then decodes that single still photo.


export default function ScanTab({ items, onAddStock, onRemoveStock }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const cancelFocusTimerRef = useRef<() => void>(() => {});
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [scanning, setScanning] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [canTapFocus, setCanTapFocus] = useState(false);
  const [diagnostics, setDiagnostics] = useState<ScanDiagnostics>(EMPTY_DIAGNOSTICS);
  const [photoDecoding, setPhotoDecoding] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [photoDiagnostic, setPhotoDiagnostic] = useState<string | null>(null);

  const [barcode, setBarcode] = useState("");
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [unit, setUnit] = useState<Unit>("ea");
  const [price, setPrice] = useState(0);
  const [lookupStatus, setLookupStatus] = useState<LookupStatus>("idle");
  // Dedupes lookups so blur + Enter on the same unchanged barcode (or a
  // scan of a barcode someone already typed) doesn't fire a second
  // network request for a result we already have.
  const lastLookedUpRef = useRef<string | null>(null);

  useEffect(
    () => () => {
      controlsRef.current?.stop();
      cancelFocusTimerRef.current();
    },
    []
  );

  const startScan = async () => {
    setCameraError(null);
    setCanTapFocus(false);
    setDiagnostics(EMPTY_DIAGNOSTICS);
    try {
      const reader = new BrowserMultiFormatReader(SCAN_HINTS);
      setScanning(true);
      controlsRef.current = await reader.decodeFromConstraints(
        { video: SCAN_VIDEO_CONSTRAINTS },
        videoRef.current!,
        (result, error) => {
          if (result) {
            handleBarcodeDetected(result.getText());
            return;
          }
          // Every failed attempt reports an error - almost always
          // NotFoundException ("nothing barcode-shaped in this frame"),
          // which is normal and not worth tallying individually. Anything
          // else (ChecksumException, FormatException, ...) means a pattern
          // WAS found but couldn't be read cleanly, which points at
          // focus/blur/resolution rather than framing/distance.
          const kind = error?.getKind() ?? "unknown";
          setDiagnostics((prev) => ({
            ...prev,
            attempts: prev.attempts + 1,
            notFound: kind === "NotFoundException" ? prev.notFound + 1 : prev.notFound,
            errorKinds:
              kind === "NotFoundException"
                ? prev.errorKinds
                : { ...prev.errorKinds, [kind]: (prev.errorKinds[kind] ?? 0) + 1 },
          }));
        }
      );
      const stream = videoRef.current?.srcObject;
      if (stream instanceof MediaStream) {
        const tuningApplied = applyCameraTuning(stream);
        setCanTapFocus(tuningApplied);
        const track = stream.getVideoTracks()[0];
        if (track) {
          let settings: MediaTrackSettings = {};
          let caps: ExtendedTrackCapabilities = {};
          try {
            settings = track.getSettings();
          } catch {
            // Settings inspection isn't supported here; leave defaults.
          }
          try {
            caps = track.getCapabilities() as ExtendedTrackCapabilities;
          } catch {
            // Capability inspection isn't supported here; leave defaults.
          }
          setDiagnostics((prev) => ({
            ...prev,
            actualWidth: settings.width ?? prev.actualWidth,
            actualHeight: settings.height ?? prev.actualHeight,
            facingModeActual: settings.facingMode ?? prev.facingModeActual,
            focusModes: caps.focusMode ?? prev.focusModes,
            exposureModes: caps.exposureMode ?? prev.exposureModes,
            whiteBalanceModes: caps.whiteBalanceMode ?? prev.whiteBalanceModes,
            tuningApplied,
          }));
        }
      }
    } catch (e) {
      setScanning(false);
      setCameraError(
        "Couldn't access the camera. Check that this site has camera permission, or enter the barcode manually below."
      );
    }
  };

  const handleVideoLoadedMetadata = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return;
    setDiagnostics((prev) => ({ ...prev, actualWidth: video.videoWidth, actualHeight: video.videoHeight }));
  };

  const stopScan = () => {
    controlsRef.current?.stop();
    controlsRef.current = null;
    cancelFocusTimerRef.current();
    setScanning(false);
    setCanTapFocus(false);
  };

  const handleVideoTap = (e: React.MouseEvent<HTMLVideoElement>) => {
    const video = videoRef.current;
    const stream = video?.srcObject;
    if (!video || !(stream instanceof MediaStream)) return;
    const rect = video.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const x = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
    const y = Math.min(Math.max((e.clientY - rect.top) / rect.height, 0), 1);
    cancelFocusTimerRef.current();
    cancelFocusTimerRef.current = focusTrackAt(stream, x, y);
  };

  const openPhotoCapture = () => {
    if (scanning) stopScan();
    setPhotoError(null);
    photoInputRef.current?.click();
  };

  const handlePhotoCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file next time
    if (!file) return;
    setPhotoError(null);
    setPhotoDiagnostic(null);
    setPhotoDecoding(true);
    // Let the "Reading photo…" label actually paint before the synchronous
    // decode below blocks the main thread - otherwise the UI can appear to
    // freeze with no feedback at all while a big photo decodes.
    await new Promise((resolve) => setTimeout(resolve, 30));
    const startedAt = performance.now();
    try {
      const { canvas, originalWidth, originalHeight } = await decodePhotoToCanvas(file, MAX_PHOTO_DIMENSION);
      const reader = new BrowserMultiFormatReader(SCAN_HINTS);
      const result = reader.decodeFromCanvas(canvas);
      setPhotoDiagnostic(
        `${originalWidth}×${originalHeight} → ${canvas.width}×${canvas.height}, decoded in ${Math.round(performance.now() - startedAt)}ms`
      );
      handleBarcodeDetected(result.getText());
    } catch {
      setPhotoDiagnostic(`scanned in ${Math.round(performance.now() - startedAt)}ms`);
      setPhotoError(
        "Couldn't find a barcode in that photo. Try filling more of the frame with the barcode, more light, or holding steadier, then retake."
      );
    } finally {
      setPhotoDecoding(false);
    }
  };

  // Shared by the scanner, the photo fallback, and manual entry below - one
  // lookup path so all three sources give the same "checking / found /
  // existing / not-found" feedback instead of the scanner silently doing
  // more than manual typing ever did.
  const runBarcodeLookup = async (code: string) => {
    const trimmed = code.trim();
    if (!trimmed || trimmed === lastLookedUpRef.current) return;
    lastLookedUpRef.current = trimmed;

    const existing = items.find((it) => it.barcode === trimmed);
    if (existing) {
      setLookupStatus("existing");
      setName(existing.name);
      setUnit(existing.unit);
      setPrice(existing.pricePerUnit);
      return;
    }

    setLookupStatus("checking");
    const found = await lookupBarcode(trimmed);
    if (found) {
      setLookupStatus("found");
      setName(found);
    } else {
      setLookupStatus("not-found");
    }
  };

  const handleBarcodeDetected = (code: string) => {
    stopScan();
    setBarcode(code);
    runBarcodeLookup(code);
  };

  const handleBarcodeChange = (value: string) => {
    setBarcode(value);
    // Clear stale feedback the moment the value changes so an old
    // "not found" or "found: X" doesn't linger while they edit or retype.
    setLookupStatus("idle");
  };

  const handleBarcodeBlur = () => {
    runBarcodeLookup(barcode);
  };

  const handleBarcodeKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    // Triggers the blur handler above rather than duplicating the lookup
    // call here, so there's exactly one place this logic lives.
    e.currentTarget.blur();
  };

  const reset = () => {
    setBarcode("");
    setName("");
    setQuantity(1);
    setUnit("ea");
    setPrice(0);
    setLookupStatus("idle");
    lastLookedUpRef.current = null;
  };

  return (
    <div className="mx-auto max-w-2xl px-4 pb-24 pt-5 sm:px-6">
      <h1 className="mb-4 flex items-center gap-2 text-lg font-semibold text-neutral-900">
        <span aria-hidden>📷</span> Scan
      </h1>

      <div
        className={`overflow-hidden rounded-xl2 border border-surface-border bg-black shadow-card ${
          scanning ? "" : "hidden"
        }`}
      >
        <div className="relative">
          <video
            ref={videoRef}
            className="aspect-[4/3] w-full object-cover"
            muted
            playsInline
            autoPlay
            onClick={handleVideoTap}
            onLoadedMetadata={handleVideoLoadedMetadata}
          />
          {scanning && (
            <div className="scan-overlay pointer-events-none absolute inset-0">
              <div className="scan-bar" />
            </div>
          )}
          {canTapFocus && (
            <div className="pointer-events-none absolute bottom-2 left-0 right-0 flex justify-center">
              <span className="rounded-full bg-black/60 px-2.5 py-1 text-xs text-white/90">
                Tap the barcode to focus
              </span>
            </div>
          )}
        </div>
        <button
          onClick={stopScan}
          className="w-full bg-white py-3 text-sm font-medium text-neutral-800 hover:bg-surface-muted"
        >
          Cancel scan
        </button>
      </div>
      {(scanning || diagnostics.attempts > 0) && (
        <div className="mt-3 rounded-lg border border-dashed border-neutral-300 bg-neutral-50 p-3">
          <p className="mb-1.5 text-xs font-semibold text-neutral-500">Scan diagnostics (temporary)</p>
          <div className="space-y-0.5 font-mono text-[11px] leading-relaxed text-neutral-600">
            <p>
              resolution: {diagnostics.actualWidth ?? "?"}×{diagnostics.actualHeight ?? "?"}
            </p>
            <p>facing: {diagnostics.facingModeActual ?? "unknown"}</p>
            <p>focus modes: {diagnostics.focusModes?.join(", ") || "none reported"}</p>
            <p>exposure modes: {diagnostics.exposureModes?.join(", ") || "none reported"}</p>
            <p>white balance modes: {diagnostics.whiteBalanceModes?.join(", ") || "none reported"}</p>
            <p>auto-tuning applied: {diagnostics.tuningApplied ? "yes" : "no"}</p>
            <p>frames scanned: {diagnostics.attempts}</p>
            <p>no barcode found: {diagnostics.notFound}</p>
            {Object.entries(diagnostics.errorKinds).map(([kind, count]) => (
              <p key={kind}>
                {kind}: {count}
              </p>
            ))}
          </div>
          {diagnostics.attempts > 15 && Object.keys(diagnostics.errorKinds).length === 0 && (
            <p className="mt-1.5 text-[11px] text-amber-700">
              Only &quot;no barcode found&quot; so far - the camera isn&apos;t detecting anything
              barcode-shaped in frame. Try moving the barcode more centered, or closer/farther away.
            </p>
          )}
          {Object.keys(diagnostics.errorKinds).length > 0 && (
            <p className="mt-1.5 text-[11px] text-amber-700">
              A barcode-like pattern is being detected but not decoding cleanly - this points at
              focus, blur, or resolution rather than framing.
            </p>
          )}
        </div>
      )}
      {!scanning && (
        <button
          onClick={startScan}
          className="w-full rounded-xl2 bg-blue-500 py-4 text-center text-sm font-semibold text-white shadow-card hover:opacity-90"
        >
          📷 Scan Barcode
        </button>
      )}
      {cameraError && <p className="mt-2 text-xs text-accent-low">{cameraError}</p>}

      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handlePhotoCapture}
      />
      <button
        type="button"
        onClick={openPhotoCapture}
        disabled={photoDecoding}
        className="mt-2 w-full rounded-xl2 border border-surface-border bg-white py-3 text-center text-sm font-semibold text-neutral-700 shadow-card hover:bg-surface-muted disabled:opacity-60"
      >
        {photoDecoding ? "Reading photo…" : "🖼️ Trouble scanning? Take a photo instead"}
      </button>
      <p className="mt-1 text-[11px] text-neutral-400">
        Uses your phone&apos;s regular camera app for a sharper, better-focused shot - helpful if
        live scanning above won&apos;t lock onto the barcode.
      </p>
      {photoError && <p className="mt-2 text-xs text-accent-low">{photoError}</p>}
      {photoDiagnostic && (
        <p className="mt-1 font-mono text-[10px] text-neutral-400">last photo: {photoDiagnostic}</p>
      )}

      <div className="mt-5 space-y-3 rounded-xl2 border border-surface-border bg-white p-4 shadow-card">
        <Field label="Barcode">
          <input
            className="input"
            value={barcode}
            onChange={(e) => handleBarcodeChange(e.target.value)}
            onBlur={handleBarcodeBlur}
            onKeyDown={handleBarcodeKeyDown}
            placeholder="Scan or type manually"
          />
          {lookupStatus === "checking" && (
            <p className="mt-1 text-[11px] text-neutral-400">🔎 Looking up barcode…</p>
          )}
          {lookupStatus === "existing" && (
            <p className="mt-1 text-[11px] text-green-700">✓ Matches an item already in your inventory</p>
          )}
          {lookupStatus === "found" && (
            <p className="mt-1 text-[11px] text-green-700">✓ Product found — details filled in below</p>
          )}
          {lookupStatus === "not-found" && (
            <p className="mt-1 text-[11px] text-amber-700">
              No product found for this barcode - enter the details below manually.
            </p>
          )}
        </Field>
        <Field label="Item Description">
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={lookupStatus === "checking" ? "Looking up…" : "Auto-fills from lookup, or type your own"}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Quantity">
            <input
              type="number"
              className="input"
              value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value))}
            />
          </Field>
          <Field label="Unit">
            <select className="input" value={unit} onChange={(e) => setUnit(e.target.value as Unit)}>
              {UNITS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Price per Unit">
          <div className="flex items-center gap-1">
            <span className="text-neutral-400">$</span>
            <input
              type="number"
              step="0.01"
              className="input"
              value={price}
              onChange={(e) => setPrice(Number(e.target.value))}
            />
          </div>
        </Field>

        <div className="flex gap-2 pt-1">
          <button
            onClick={() => {
              if (!name.trim()) return;
              onAddStock({ barcode, name, quantity, unit, pricePerUnit: price });
              reset();
            }}
            className="flex-1 rounded-lg bg-green-600 py-2.5 text-sm font-semibold text-white hover:opacity-90"
          >
            + Add Stock
          </button>
          <button
            onClick={() => {
              if (!barcode.trim()) return;
              onRemoveStock({ barcode, quantity });
              reset();
            }}
            className="flex-1 rounded-lg bg-red-500 py-2.5 text-sm font-semibold text-white hover:opacity-90"
          >
            − Remove
          </button>
        </div>
      </div>

      <style jsx global>{`
        .input {
          width: 100%;
          border-radius: 0.5rem;
          border: 1px solid #e7e7ea;
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
        }
        .input:focus {
          outline: 2px solid #171717;
          outline-offset: 1px;
        }
        .scan-overlay {
          overflow: hidden;
        }
        .scan-bar {
          position: absolute;
          left: 6%;
          right: 6%;
          height: 3px;
          border-radius: 999px;
          background: linear-gradient(90deg, transparent, #22c55e 20%, #4ade80, #22c55e 80%, transparent);
          box-shadow: 0 0 10px 3px rgba(34, 197, 94, 0.85);
          animation: scan-move 2.2s ease-in-out infinite;
        }
        @keyframes scan-move {
          0% {
            top: 6%;
          }
          50% {
            top: 92%;
          }
          100% {
            top: 6%;
          }
        }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-neutral-500">{label}</span>
      {children}
    </label>
  );
}
