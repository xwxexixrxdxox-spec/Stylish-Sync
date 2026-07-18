"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BrowserMultiFormatReader, IScannerControls } from "@zxing/browser";
import { InventoryItem, Unit, AccessCheckResponse } from "@/lib/types";
import { getKnownLocations } from "@/lib/locations";
import ReceiptScanTab from "@/components/ReceiptScanTab";
import LocationField from "@/components/LocationField";
import { lookupBarcode } from "@/lib/productLookup";
import { contributeCommunityBarcode, lookupCommunityBarcode } from "@/lib/communityLookup";
import { playChime } from "@/lib/chime";
import {
  ExtendedTrackCapabilities,
  SCAN_VIDEO_CONSTRAINTS,
  applyCameraTuning,
  focusTrackAt,
  ScanDiagnostics,
  EMPTY_DIAGNOSTICS,
} from "@/lib/cameraTuning";
import { SCAN_HINTS, MAX_PHOTO_DIMENSION, decodePhotoToCanvas } from "@/lib/photoBarcodeScan";

const UNITS: Unit[] = [
  "ea", "box", "case", "pack", "bag", "bottle", "can", "roll", "dozen", "pair",
  "kg", "lb", "oz", "g", "L", "ml", "fl oz",
];

interface Props {
  items: InventoryItem[];
  onAddStock: (input: {
    barcode: string;
    name: string;
    quantity: number;
    unit: Unit;
    pricePerUnit: number;
    location?: string;
  }) => void;
  onRemoveStock: (input: { barcode: string; quantity: number }) => void;
  access: AccessCheckResponse | null;
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


export default function ScanTab({ items, onAddStock, onRemoveStock, access }: Props) {
  const [mode, setMode] = useState<"barcode" | "receipt">("barcode");
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
  const [location, setLocation] = useState("");
  const [lookupStatus, setLookupStatus] = useState<LookupStatus>("idle");
  const knownLocations = useMemo(() => getKnownLocations(items), [items]);
  // Same cute "+qty"/"-qty" pop + button squish used on the inventory list's
  // stock buttons, shown here on Add Stock / Remove after a successful tap.
  const [burst, setBurst] = useState<{ sign: 1 | -1; key: number; qty: number } | null>(null);
  const burstKeyRef = useRef(0);
  // Dedupes lookups so blur + Enter on the same unchanged barcode (or a
  // scan of a barcode someone already typed) doesn't fire a second
  // network request for a result we already have.
  const lastLookedUpRef = useRef<string | null>(null);
  // Set only when a lookup comes back "not-found" for the barcode
  // currently in the field - meaning neither the shared community database
  // nor the external UPC lookup had it. If the customer then fills in a
  // name/unit by hand and adds it to their inventory, the Add Stock
  // handler contributes that entry to the shared database so the next
  // customer to scan this same barcode gets it auto-filled too. Cleared
  // any time the barcode changes or a lookup finds something, so a stale
  // barcode never gets contributed under a newer one.
  const pendingContributionRef = useRef<string | null>(null);

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
    pendingContributionRef.current = null;

    const existing = items.find((it) => it.barcode === trimmed);
    if (existing) {
      setLookupStatus("existing");
      setName(existing.name);
      setUnit(existing.unit);
      setPrice(existing.pricePerUnit);
      setLocation(existing.location || "");
      return;
    }

    setLookupStatus("checking");

    // Check the shared, crowdsourced database first - it's free (no rate
    // limit like the external lookup below) and can succeed on barcodes
    // the external service has never heard of, since it's built entirely
    // from other WS Inventory Management customers typing in the real answer by hand.
    const community = await lookupCommunityBarcode(trimmed);
    if (community) {
      setLookupStatus("found");
      setName(community.name);
      if (community.unit) setUnit(community.unit as Unit);
      return;
    }

    const found = await lookupBarcode(trimmed);
    if (found) {
      setLookupStatus("found");
      setName(found);
      return;
    }

    // Neither the shared database nor the external lookup had this
    // barcode - mark it eligible for contribution so the Add Stock handler
    // below can share whatever the customer types in next.
    pendingContributionRef.current = trimmed;
    setLookupStatus("not-found");
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
    pendingContributionRef.current = null;
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
    setLocation("");
    setLookupStatus("idle");
    lastLookedUpRef.current = null;
    pendingContributionRef.current = null;
  };

  return (
    <div className="mx-auto max-w-2xl px-4 pb-24 pt-5 sm:px-6">
      <h1 className="mb-4 flex items-center gap-2 text-lg font-semibold text-neutral-900">
        <span aria-hidden>📷</span> Scan
      </h1>

      <div className="mb-4 flex gap-2">
        <button
          type="button"
          onClick={() => setMode("barcode")}
          className={`flex-1 rounded-lg py-2 text-sm font-semibold ${
            mode === "barcode" ? "bg-neutral-900 text-white" : "border border-surface-border bg-white text-neutral-600"
          }`}
        >
          📷 Barcode
        </button>
        <button
          type="button"
          onClick={() => setMode("receipt")}
          className={`flex-1 rounded-lg py-2 text-sm font-semibold ${
            mode === "receipt" ? "bg-neutral-900 text-white" : "border border-surface-border bg-white text-neutral-600"
          }`}
        >
          🧾 Receipt
        </button>
      </div>

      {mode === "barcode" && (
        <>
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
        <Field label="Location">
          <LocationField
            listId="location-options-scan"
            value={location}
            onChange={setLocation}
            locations={knownLocations}
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
          <div className="relative flex-1">
            <button
              onClick={() => {
                const trimmedName = name.trim();
                if (!trimmedName) return;
                // Only contribute to the shared database when this exact
                // barcode just came back "not-found" - never for a match
                // against an existing item or an external-lookup result,
                // both of which are already known and don't need sharing.
                if (pendingContributionRef.current && pendingContributionRef.current === barcode.trim()) {
                  void contributeCommunityBarcode(barcode.trim(), trimmedName, unit);
                }
                onAddStock({ barcode, name, quantity, unit, pricePerUnit: price, location: location.trim() || undefined });
                playChime("add");
                burstKeyRef.current += 1;
                setBurst({ sign: 1, key: burstKeyRef.current, qty: quantity });
                reset();
              }}
              className="w-full rounded-lg bg-green-600 py-2.5 text-sm font-semibold text-white hover:opacity-90"
            >
              <span
                key={burst?.sign === 1 ? burst.key : "idle-add"}
                className={`inline-block ${burst?.sign === 1 ? "animate-btn-pop" : ""}`}
              >
                + Add Stock
              </span>
            </button>
            {burst?.sign === 1 && (
              <span
                key={burst.key}
                onAnimationEnd={() => setBurst(null)}
                className="pointer-events-none absolute left-1/2 top-0 select-none animate-float-up text-sm font-semibold text-accent-ok"
              >
                +{burst.qty}
              </span>
            )}
          </div>
          <div className="relative flex-1">
            <button
              onClick={() => {
                if (!barcode.trim()) return;
                onRemoveStock({ barcode, quantity });
                playChime("remove");
                burstKeyRef.current += 1;
                setBurst({ sign: -1, key: burstKeyRef.current, qty: quantity });
                reset();
              }}
              className="w-full rounded-lg bg-red-500 py-2.5 text-sm font-semibold text-white hover:opacity-90"
            >
              <span
                key={burst?.sign === -1 ? burst.key : "idle-remove"}
                className={`inline-block ${burst?.sign === -1 ? "animate-btn-pop" : ""}`}
              >
                − Remove
              </span>
            </button>
            {burst?.sign === -1 && (
              <span
                key={burst.key}
                onAnimationEnd={() => setBurst(null)}
                className="pointer-events-none absolute left-1/2 top-0 select-none animate-float-up text-sm font-semibold text-accent-low"
              >
                −{burst.qty}
              </span>
            )}
          </div>
        </div>
      </div>
        </>
      )}

      {mode === "receipt" && <ReceiptScanTab items={items} onAddStock={onAddStock} />}

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
