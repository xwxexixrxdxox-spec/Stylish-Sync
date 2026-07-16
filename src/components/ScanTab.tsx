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

const UNITS: Unit[] = [
  "ea", "box", "case", "pack", "bag", "bottle", "can", "roll", "dozen", "pair",
  "kg", "lb", "oz", "g", "L", "ml", "fl oz",
];

interface Props {
  items: InventoryItem[];
  onAddStock: (input: { barcode: string; name: string; quantity: number; unit: Unit; pricePerUnit: number }) => void;
  onRemoveStock: (input: { barcode: string; quantity: number }) => void;
}

export default function ScanTab({ items, onAddStock, onRemoveStock }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const cancelFocusTimerRef = useRef<() => void>(() => {});
  const [scanning, setScanning] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [canTapFocus, setCanTapFocus] = useState(false);

  const [barcode, setBarcode] = useState("");
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [unit, setUnit] = useState<Unit>("ea");
  const [price, setPrice] = useState(0);
  const [looking, setLooking] = useState(false);

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
    try {
      const reader = new BrowserMultiFormatReader(SCAN_HINTS);
      setScanning(true);
      controlsRef.current = await reader.decodeFromConstraints(
        { video: SCAN_VIDEO_CONSTRAINTS },
        videoRef.current!,
        (result) => {
          if (result) {
            handleBarcodeDetected(result.getText());
          }
        }
      );
      const stream = videoRef.current?.srcObject;
      if (stream instanceof MediaStream) {
        setCanTapFocus(applyCameraTuning(stream));
      }
    } catch (e) {
      setScanning(false);
      setCameraError(
        "Couldn't access the camera. Check that this site has camera permission, or enter the barcode manually below."
      );
    }
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

  const handleBarcodeDetected = async (code: string) => {
    stopScan();
    setBarcode(code);
    const existing = items.find((it) => it.barcode === code);
    if (existing) {
      setName(existing.name);
      setUnit(existing.unit);
      setPrice(existing.pricePerUnit);
      return;
    }
    setLooking(true);
    const found = await lookupBarcode(code);
    setLooking(false);
    if (found) setName(found);
  };

  const reset = () => {
    setBarcode("");
    setName("");
    setQuantity(1);
    setUnit("ea");
    setPrice(0);
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
      {!scanning && (
        <button
          onClick={startScan}
          className="w-full rounded-xl2 bg-blue-500 py-4 text-center text-sm font-semibold text-white shadow-card hover:opacity-90"
        >
          📷 Scan Barcode
        </button>
      )}
      {cameraError && <p className="mt-2 text-xs text-accent-low">{cameraError}</p>}

      <div className="mt-5 space-y-3 rounded-xl2 border border-surface-border bg-white p-4 shadow-card">
        <Field label="Barcode">
          <input
            className="input"
            value={barcode}
            onChange={(e) => setBarcode(e.target.value)}
            placeholder="Scan or type manually"
          />
        </Field>
        <Field label="Item Description">
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={looking ? "Looking up…" : "Auto-fills from lookup, or type your own"}
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
