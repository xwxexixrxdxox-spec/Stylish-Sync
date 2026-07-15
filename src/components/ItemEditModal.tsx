"use client";

import { useState } from "react";
import { InventoryItem } from "@/lib/types";
import { X, Trash2 } from "lucide-react";

interface Props {
  item: InventoryItem;
  onSave: (item: InventoryItem) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

export default function ItemEditModal({ item, onSave, onDelete, onClose }: Props) {
  const [draft, setDraft] = useState<InventoryItem>(item);

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
        </div>

        <div className="mt-5 flex items-center justify-between gap-3">
          <button
            onClick={() => onDelete(item.id)}
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
