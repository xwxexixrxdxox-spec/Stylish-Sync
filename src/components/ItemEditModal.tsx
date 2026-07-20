"use client";

import { useState } from "react";
import { InventoryItem } from "@/lib/types";
import { X, Trash2 } from "lucide-react";
import LocationField from "@/components/LocationField";
import ConfirmDialog from "@/components/ConfirmDialog";

interface Props {
  item: InventoryItem;
  items: InventoryItem[];
  onSave: (item: InventoryItem) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
  locations?: string[];
}

export default function ItemEditModal({ item, items, onSave, onDelete, onClose, locations = [] }: Props) {
  const [draft, setDraft] = useState<InventoryItem>(item);
  // Candidates for "breaks down into": every other item that has a
  // barcode, since the link itself is stored keyed by barcode (see
  // InventoryItem in types.ts) and an item with no barcode has nothing
  // stable to point at. Sorted by name so a customer with dozens of items
  // can actually find the right one instead of hunting through whatever
  // order they happen to be stored/scanned in.
  const linkCandidates = items
    .filter((it) => it.id !== item.id && it.barcode)
    .sort((a, b) => a.name.localeCompare(b.name));
  // Delete used to fire immediately on click with no confirmation at all —
  // a real gap, since it's one accidental tap away from permanently
  // removing an item. Now goes through the same confirm popup as the
  // trash icon on the inventory card itself.
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-t-2xl bg-white p-5 shadow-card sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-neutral-900">Edit item</h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-3">
          <Field label="Name">
            <input
              className="input"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </Field>
          <Field label="Barcode">
            <input
              className="input"
              value={draft.barcode}
              onChange={(e) => setDraft({ ...draft, barcode: e.target.value })}
            />
          </Field>
          <Field label="Location">
            <LocationField
              listId="location-options-edit"
              value={draft.location ?? ""}
              onChange={(value) => setDraft({ ...draft, location: value })}
              locations={locations}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Quantity">
              <input
                type="number"
                className="input"
                value={draft.quantity}
                onChange={(e) => setDraft({ ...draft, quantity: Number(e.target.value) })}
              />
            </Field>
            <Field label="Unit">
              <input
                className="input"
                value={draft.unit}
                onChange={(e) => setDraft({ ...draft, unit: e.target.value })}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Price per unit">
              <input
                type="number"
                step="0.01"
                className="input"
                value={draft.pricePerUnit}
                onChange={(e) => setDraft({ ...draft, pricePerUnit: Number(e.target.value) })}
              />
            </Field>
            <Field label="Reorder at">
              <input
                type="number"
                className="input"
                value={draft.reorderAt}
                onChange={(e) => setDraft({ ...draft, reorderAt: Number(e.target.value) })}
              />
            </Field>
          </div>

          <Field label="Breaks down into (optional)">
            <select
              className="input"
              value={draft.breaksDownIntoBarcode ?? ""}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  breaksDownIntoBarcode: e.target.value || undefined,
                  breaksDownIntoQty: e.target.value ? draft.breaksDownIntoQty || 12 : undefined,
                })
              }
            >
              <option value="">Not a case/pack — tracked as-is</option>
              {linkCandidates.map((it) => (
                <option key={it.id} value={it.barcode}>
                  {it.name}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-neutral-400">
              e.g. this item is a case that gets broken down into individually-tracked cans, bottles, etc. Adds a
              &quot;Break Case&quot; button to this item in the inventory list.
            </p>
          </Field>
          {draft.breaksDownIntoBarcode && (
            <Field label="How many does one unit break down into?">
              <input
                type="number"
                min={1}
                className="input"
                value={draft.breaksDownIntoQty ?? 12}
                onChange={(e) => setDraft({ ...draft, breaksDownIntoQty: Math.max(1, Number(e.target.value)) })}
              />
            </Field>
          )}
        </div>

        <div className="mt-5 flex items-center justify-between gap-3">
          <button
            onClick={() => setConfirmingDelete(true)}
            className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-accent-low hover:bg-red-50"
          >
            <Trash2 size={16} /> Delete
          </button>
          <button
            onClick={() => onSave({ ...draft, updatedAt: new Date().toISOString() })}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-foreground hover:opacity-90"
          >
            Save
          </button>
        </div>
      </div>

      {confirmingDelete && (
        <ConfirmDialog
          title={`Delete "${item.name}"?`}
          message="This removes the item from your inventory. Its past usage history stays intact, but it will no longer be trackable going forward. This can't be undone."
          confirmLabel="Delete"
          onCancel={() => setConfirmingDelete(false)}
          onConfirm={() => onDelete(item.id)}
        />
      )}

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
