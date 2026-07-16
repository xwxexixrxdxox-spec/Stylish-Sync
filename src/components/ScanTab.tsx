"use client";

import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader, IScannerControls } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";
import { InventoryItem, Unit } from "@/lib/types";
import { lookupBarcode } from "@/lib/productLookup";

// Hints for the ZXing decoder: TRY_HARDER spends extra CPU time on each
// frame to pull a result out of glare, blur, or a skewed angle, and
// restricting POSSIBLE_FORMATS to the barcode types actually used on
// retail/inventory labels keeps the decoder from wasting attempts on
// formats we'll never see (which also speeds up each scan pass).
const SCAN_HINTS = new Map<DecodeHintType, unknown>([
  [DecodeHintType.TRY_HARDER, true],
  [
    DecodeHintType.POSSIBLE_FORMATS,
    [
      BarcodeFormat.EAN_13,
      BarcodeFormat.EAN_8,
      BarcodeFormat.UPC_A,
      BarcodeFormat.UPC_E,
      BarcodeFormat.CODE_128,
      BarcodeFormat.CODE_39,
      BarcodeFormat.CODE_93,
      BarcodeFormat.ITF,
      BarcodeFormat.CODABAR,
      BarcodeFormat.QR_CODE,
    ],
  ],
]);

// Prefer the rear camera at a higher resolution with continuous autofocus.
// Continuous autofocus in particular helps a lot with motion/hand-shake
// blur; "ideal" constraints are a soft preference, so this still falls
// back gracefully on devices/browsers that don't support them.
const SCAN_VIDEO_CONSTRAINTS: MediaTrackConstraints = {
  facingMode: { ideal: "environment" },
  width: { ideal: 1920 },
  height: { ideal: 1080 },
  advanced: [{ focusMode: "continuous" } as unknown as MediaTrackConstraintSet],
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

export default function ScanTab({ items, onAddStock, onRemoveStock }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const [scanning, setScanning] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const [barcode, setBarcode] = useState("");
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [unit, setUnit] = useState<Unit>("ea");
  const [price, setPrice] = useState(0);
  const [looking, setLooking] = useState(false);

  useEffect(() => () => controlsRef.current?.stop(), []);

  const startScan = async () => {
    setCameraError(null);
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
    setScanning(false);
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
          <video ref={videoRef} className="aspect-[4/3] w-full object-cover" muted playsInline autoPlay />
          {scanning && (
            <div className="scan-overlay pointer-events-none absolute inset-0">
              <div className="scan-bar" />
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
