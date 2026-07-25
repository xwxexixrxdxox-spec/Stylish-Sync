"use client";

import { useState } from "react";
import { InventoryItem } from "@/lib/types";
import LocationField from "@/components/LocationField";

interface Props {
  item: InventoryItem;
  // Other rows already sharing this item's barcode - shown as quick-pick
  // chips so moving between two locations that already both exist doesn't
  // require retyping a location name from memory.
  siblingLocations: string[];
  // Every location known app-wide, for the free-type field - lets this
  // move also be the very first split of a single-location item into two.
  knownLocations: string[];
  onConfirm: (destinationLocation: string, quantity: number) => void;
  onCancel: () => void;
}

// Confirms transferring N units of an item from its current location-row
// to another location for the same barcode (see moveStock in page.tsx) -
// the "Move stock" action introduced by Phase 4 (per-location quantity
// tracking). Its own popup rather than the plain yes/no ConfirmDialog,
// same reasoning as BreakCaseDialog: this needs a quantity input and a
// destination to pick, not just a confirmation.
export default function MoveStockDialog({ item, siblingLocations, knownLocations, onConfirm, onCancel }: Props) {
  const [destination, setDestination] = useState("");
  const [count, setCount] = useState(item.quantity > 0 ? 1 : 0);
  const clamped = Math.max(0, Math.min(Math.round(count) || 0, item.quantity));
  const trimmedDest = destination.trim();
  const sourceLocation = (item.location || "").trim();
  const sameAsSource = trimmedDest.length > 0 && trimmedDest.toLowerCase() === sourceLocation.toLowerCase();
  const canMove = clamped > 0 && trimmedDest.length > 0 && !sameAsSource;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={onCancel}>
      <div className="w-full max-w-sm rounded-xl2 bg-white p-5 shadow-card" onClick={(e) => e.stopPropagation()}>
        <p className="mb-1.5 text-sm font-semibold text-neutral-900">Move &quot;{item.name}&quot;</p>
        <p className="mb-4 text-sm text-neutral-600">
          Moves stock from {sourceLocation ? `"${sourceLocation}"` : "its current (no location set) row"} to another
          location for this same product. If that location doesn&apos;t already have its own row, one is created
          automatically — same unit, price, and reorder point as this one, editable after.
        </p>

        <label className="mb-1 block text-xs font-medium text-neutral-500">
          How many {item.unit || "units"} to move?
        </label>
        <input
          type="number"
          min={1}
          max={item.quantity}
          className="mb-3 w-full rounded-lg border border-surface-border px-3 py-2 text-sm"
          value={count}
          onChange={(e) => setCount(Number(e.target.value))}
        />

        <label className="mb-1 block text-xs font-medium text-neutral-500">Move to which location?</label>
        <LocationField
          listId="move-stock-destination"
          value={destination}
          onChange={setDestination}
          locations={knownLocations}
          placeholder="e.g. Front Fridge"
        />
        {siblingLocations.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {siblingLocations.map((loc) => (
              <button
                key={loc}
                type="button"
                onClick={() => setDestination(loc)}
                className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                  trimmedDest.toLowerCase() === loc.toLowerCase()
                    ? "bg-neutral-900 text-white"
                    : "border border-surface-border text-neutral-600 hover:bg-surface-muted"
                }`}
              >
                {loc}
              </button>
            ))}
          </div>
        )}
        {sameAsSource && (
          <p className="mt-2 text-[11px] text-accent-low">
            That&apos;s already this row&apos;s own location — pick a different one to move stock there.
          </p>
        )}
        <p className="mt-3 text-xs text-neutral-500">
          {item.quantity} {item.unit} on hand at the source
        </p>

        <div className="mt-4 flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 rounded-lg border border-surface-border py-2 text-sm font-medium text-neutral-700 hover:bg-surface-muted"
          >
            Cancel
          </button>
          <button
            disabled={!canMove}
            onClick={() => onConfirm(trimmedDest, clamped)}
            className="flex-1 rounded-lg bg-neutral-900 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            Move{clamped > 0 ? ` ${clamped}` : ""}
          </button>
        </div>
      </div>
    </div>
  );
}
