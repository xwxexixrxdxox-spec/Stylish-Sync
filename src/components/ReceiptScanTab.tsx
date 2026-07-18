"use client";

import { useMemo, useRef, useState } from "react";
import { recognize } from "tesseract.js";
import { InventoryItem, Unit } from "@/lib/types";
import { getKnownLocations } from "@/lib/locations";
import LocationField from "@/components/LocationField";

// Receipts print at very high DPI and modern phone cameras produce huge
// photos - OCR accuracy actually benefits from more resolution than the
// barcode photo-fallback path uses (see ScanTab's MAX_PHOTO_DIMENSION),
// since small printed digits need to stay legible, but still needs a cap
// to keep Tesseract's in-browser recognition pass from taking forever or
// exhausting memory on a 12+ megapixel original.
const MAX_RECEIPT_DIMENSION = 2200;

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

// Same createImageBitmap-with-resize-options approach ScanTab.tsx uses for
// the barcode photo fallback, so repeated receipt captures in a row don't
// accumulate full-resolution decoded bitmaps in memory - see the detailed
// comment above decodePhotoToCanvas in ScanTab.tsx for why that matters on
// mobile. Falls back to the <img>/canvas path on browsers without it.
async function decodeReceiptPhotoToCanvas(file: File): Promise<HTMLCanvasElement> {
  if (typeof createImageBitmap === "function") {
    let probe: ImageBitmap | null = null;
    try {
      probe = await createImageBitmap(file);
      const { width, height } = probe;
      const scale = Math.min(1, MAX_RECEIPT_DIMENSION / Math.max(width, height));
      probe.close();
      probe = null;
      const bitmap = await createImageBitmap(file, {
        resizeWidth: Math.max(1, Math.round(width * scale)),
        resizeHeight: Math.max(1, Math.round(height * scale)),
        resizeQuality: "high",
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
      return canvas;
    } catch {
      if (probe) probe.close();
      // Fall through to the <img>-based path below.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const image = await loadImage(url);
    return downscaleToCanvas(image, MAX_RECEIPT_DIMENSION);
  } finally {
    URL.revokeObjectURL(url);
  }
}

interface ParsedLine {
  id: string;
  include: boolean;
  name: string;
  quantity: number;
  unit: Unit;
  pricePerUnit: number;
  barcode: string;
  matchedExisting: boolean;
}

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
}

const UNITS: Unit[] = [
  "ea", "box", "case", "pack", "bag", "bottle", "can", "roll", "dozen", "pair",
  "kg", "lb", "oz", "g", "L", "ml", "fl oz",
];

// Lines that are clearly receipt chrome rather than a purchased item -
// store totals, tax, tender/payment lines, and similar. Skipped entirely
// by the parser below rather than surfaced as a low-confidence "item" the
// customer would just have to notice and delete during review.
const SKIP_LINE_PATTERN =
  /\b(subtotal|total|tax|change|cash|debit|credit|visa|mastercard|amex|discover|balance|tender|card\b|approved|auth|ref\s*#|store\s*#|cashier|register|thank you|receipt\s*#|order\s*#|survey|coupon)\b/i;

// A trailing price like "3.99" or "$12.50" at the end of a line - receipts
// almost always right-align the price on each item line, so this is the
// strongest signal that a line is a purchased item rather than a store
// header/footer line (which usually doesn't end in a price at all).
const PRICE_AT_END = /\$?\s*(\d{1,4}\.\d{2})\s*$/;

// A leading quantity marker like "2 x", "2x", "QTY 2", "2 @" before the
// item description.
const LEADING_QTY = /^\s*(?:qty\.?\s*)?(\d{1,3})\s*(?:x|@|ea\b)?\s+/i;

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

// Deliberately simple word-overlap scorer rather than a real fuzzy-search
// library - OCR output on receipts is noisy enough (abbreviated names, odd
// spacing, misread characters) that a fancier edit-distance algorithm
// wouldn't meaningfully outperform this, and every result here goes through
// a mandatory human review pass before anything is committed anyway.
function bestMatch(name: string, items: InventoryItem[]): InventoryItem | null {
  const target = normalize(name);
  if (!target) return null;
  const targetWords = new Set(target.split(" ").filter((w) => w.length > 2));
  if (targetWords.size === 0) return null;

  let best: InventoryItem | null = null;
  let bestScore = 0;
  for (const item of items) {
    const itemWords = new Set(normalize(item.name).split(" ").filter((w) => w.length > 2));
    if (itemWords.size === 0) continue;
    let overlap = 0;
    itemWords.forEach((w) => {
      if (targetWords.has(w)) overlap += 1;
    });
    const score = overlap / Math.max(targetWords.size, itemWords.size);
    if (score > bestScore) {
      bestScore = score;
      best = item;
    }
  }
  return bestScore >= 0.5 ? best : null;
}

// Heuristic line-item extraction: receipts have no per-item barcode to
// decode (confirmed via research earlier in this project - the barcode at
// the bottom of a receipt is a whole-transaction lookup key for the
// store's own POS system, not a container for itemized data), so this
// reads the printed text lines instead. Every result is provisional and
// meant to be corrected in the review step, not trusted outright.
function parseReceiptText(text: string, items: InventoryItem[]): ParsedLine[] {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const results: ParsedLine[] = [];
  let counter = 0;

  for (const line of lines) {
    if (SKIP_LINE_PATTERN.test(line)) continue;
    const priceMatch = line.match(PRICE_AT_END);
    if (!priceMatch || priceMatch.index === undefined) continue;
    const pricePerUnit = parseFloat(priceMatch[1]);
    if (!Number.isFinite(pricePerUnit) || pricePerUnit <= 0) continue;

    let rest = line.slice(0, priceMatch.index).trim();
    let quantity = 1;
    const qtyMatch = rest.match(LEADING_QTY);
    if (qtyMatch) {
      quantity = parseInt(qtyMatch[1], 10) || 1;
      rest = rest.slice(qtyMatch[0].length).trim();
    }

    // Strip trailing item codes/SKUs (long digit runs) some receipts print
    // right before the price - not useful as a description and confusing
    // to show the customer during review.
    rest = rest.replace(/\b\d{6,}\b/g, "").replace(/\s{2,}/g, " ").trim();

    if (!rest || rest.length < 2) continue;

    const match = bestMatch(rest, items);
    counter += 1;
    results.push({
      id: `receipt-line-${counter}`,
      include: true,
      name: match ? match.name : rest,
      quantity,
      unit: match ? match.unit : "ea",
      pricePerUnit,
      barcode: match ? match.barcode : "",
      matchedExisting: Boolean(match),
    });
  }

  return results;
}

export default function ReceiptScanTab({ items, onAddStock }: Props) {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const libraryInputRef = useRef<HTMLInputElement>(null);
  const [ocrRunning, setOcrRunning] = useState(false);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [parsedLines, setParsedLines] = useState<ParsedLine[] | null>(null);
  const [addedCount, setAddedCount] = useState<number | null>(null);
  const [batchLocation, setBatchLocation] = useState("");
  const knownLocations = useMemo(() => getKnownLocations(items), [items]);

  const openCamera = () => {
    setOcrError(null);
    setAddedCount(null);
    cameraInputRef.current?.click();
  };

  const openLibrary = () => {
    setOcrError(null);
    setAddedCount(null);
    libraryInputRef.current?.click();
  };

  const handleCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file next time
    if (!file) return;
    setOcrError(null);
    setAddedCount(null);
    setParsedLines(null);
    setBatchLocation("");
    setOcrRunning(true);
    try {
      const canvas = await decodeReceiptPhotoToCanvas(file);
      const { data } = await recognize(canvas, "eng");
      const lines = parseReceiptText(data.text || "", items);
      if (lines.length === 0) {
        setOcrError(
          "Couldn't find any priced line items in that photo. Try a flatter angle, better lighting, or make sure the whole receipt is in frame, then retake."
        );
      } else {
        setParsedLines(lines);
      }
    } catch {
      setOcrError("Couldn't read that photo. Try retaking it with better lighting or a steadier hand.");
    } finally {
      setOcrRunning(false);
    }
  };

  const updateLine = (id: string, patch: Partial<ParsedLine>) => {
    setParsedLines((prev) => (prev ? prev.map((l) => (l.id === id ? { ...l, ...patch } : l)) : prev));
  };

  const removeLine = (id: string) => {
    setParsedLines((prev) => (prev ? prev.filter((l) => l.id !== id) : prev));
  };

  const includedCount = parsedLines ? parsedLines.filter((l) => l.include).length : 0;

  const confirmAdd = () => {
    if (!parsedLines) return;
    const included = parsedLines.filter((l) => l.include && l.name.trim());
    const location = batchLocation.trim() || undefined;
    included.forEach((l) => {
      onAddStock({
        barcode: l.barcode,
        name: l.name.trim(),
        quantity: l.quantity,
        unit: l.unit,
        pricePerUnit: l.pricePerUnit,
        location,
      });
    });
    setAddedCount(included.length);
    setParsedLines(null);
    setBatchLocation("");
  };

  return (
    <div className="mt-4">
      <div className="rounded-xl2 border border-dashed border-surface-border bg-white p-4 shadow-card">
        <p className="mb-1 text-sm font-semibold text-neutral-900">🧾 Scan a Receipt</p>
        <p className="mb-3 text-xs text-neutral-500">
          Reads the printed item lines on a receipt photo and drafts a bulk-upload list. Receipts
          don&apos;t carry a per-item barcode, so this uses text recognition instead — always double-check
          the results below before adding them, since OCR can misread prices, quantities, or descriptions.
        </p>
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleCapture}
        />
        <input
          ref={libraryInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleCapture}
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={openCamera}
            disabled={ocrRunning}
            className="flex-1 rounded-xl2 bg-blue-500 py-3 text-center text-sm font-semibold text-white shadow-card hover:opacity-90 disabled:opacity-60"
          >
            {ocrRunning ? "Reading…" : "📷 Take a Photo"}
          </button>
          <button
            type="button"
            onClick={openLibrary}
            disabled={ocrRunning}
            className="flex-1 rounded-xl2 border border-surface-border bg-white py-3 text-center text-sm font-semibold text-neutral-700 shadow-card hover:bg-neutral-50 disabled:opacity-60"
          >
            {ocrRunning ? "Reading…" : "🖼️ Choose from Photos"}
          </button>
        </div>
        {ocrRunning && (
          <p className="mt-2 text-xs text-neutral-500">Reading receipt… this can take a moment.</p>
        )}
        {ocrError && <p className="mt-2 text-xs text-accent-low">{ocrError}</p>}
        {addedCount !== null && (
          <p className="mt-2 text-xs text-green-700">
            ✓ Added {addedCount} item{addedCount === 1 ? "" : "s"} to your inventory.
          </p>
        )}
      </div>

      {parsedLines && (
        <div className="mt-3 rounded-xl2 border border-surface-border bg-white p-4 shadow-card">
          <p className="mb-1 text-sm font-semibold text-neutral-900">Review before adding</p>
          <p className="mb-3 text-xs text-neutral-500">
            Uncheck anything that isn&apos;t a real item, and fix any description, quantity, or price OCR
            got wrong.
            {parsedLines.some((l) => l.matchedExisting) &&
              " Lines marked \"matched\" were linked to an item already in your inventory."}
          </p>
          <label className="mb-3 block">
            <span className="mb-1 block text-xs font-medium text-neutral-500">
              Location for these items (optional, applies to all)
            </span>
            <LocationField
              listId="location-options-receipt"
              value={batchLocation}
              onChange={setBatchLocation}
              locations={knownLocations}
            />
          </label>
          <div className="space-y-3">
            {parsedLines.map((line) => (
              <div key={line.id} className="rounded-lg border border-surface-border p-3">
                <div className="mb-2 flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={line.include}
                    onChange={(e) => updateLine(line.id, { include: e.target.checked })}
                  />
                  <input
                    className="input flex-1"
                    value={line.name}
                    onChange={(e) => updateLine(line.id, { name: e.target.value })}
                  />
                  {line.matchedExisting && (
                    <span className="whitespace-nowrap text-[10px] text-green-700">matched</span>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <label className="block">
                    <span className="mb-1 block text-[10px] font-medium text-neutral-500">Qty</span>
                    <input
                      type="number"
                      className="input"
                      value={line.quantity}
                      onChange={(e) => updateLine(line.id, { quantity: Number(e.target.value) })}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[10px] font-medium text-neutral-500">Unit</span>
                    <select
                      className="input"
                      value={line.unit}
                      onChange={(e) => updateLine(line.id, { unit: e.target.value as Unit })}
                    >
                      {UNITS.map((u) => (
                        <option key={u} value={u}>
                          {u}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[10px] font-medium text-neutral-500">Price</span>
                    <input
                      type="number"
                      step="0.01"
                      className="input"
                      value={line.pricePerUnit}
                      onChange={(e) => updateLine(line.id, { pricePerUnit: Number(e.target.value) })}
                    />
                  </label>
                </div>
                <button
                  type="button"
                  onClick={() => removeLine(line.id)}
                  className="mt-2 text-[11px] text-neutral-400 hover:text-accent-low"
                >
                  Remove line
                </button>
              </div>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <button
              onClick={confirmAdd}
              disabled={includedCount === 0}
              className="flex-1 rounded-lg bg-green-600 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
            >
              + Add {includedCount} Item{includedCount === 1 ? "" : "s"} to Inventory
            </button>
            <button
              onClick={() => {
                setParsedLines(null);
                setBatchLocation("");
              }}
              className="flex-1 rounded-lg border border-surface-border bg-white py-2.5 text-sm font-semibold text-neutral-700 hover:bg-surface-muted"
            >
              Discard
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
