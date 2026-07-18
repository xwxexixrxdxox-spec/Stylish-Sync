"use client";

import { Minus, Plus, Pencil } from "lucide-react";
import { InventoryItem } from "@/lib/types";

interface Props {
  item: InventoryItem;
  onAdjust: (id: string, delta: number) => void;
  onEdit: (item: InventoryItem) => void;
}

export default function ItemCard({ item, onAdjust, onEdit }: Props) {
  const low = item.quantity <= item.reorderAt;
  return (
    <div className="flex items-center justify-between rounded-xl2 border border-surface-border bg-white p-4 shadow-card">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate font-medium text-neutral-900">{item.name}</p>
        </div>
        <p className="mt-0.5 text-xs text-neutral-500">
          {item.barcode || "no barcode"} · {item.unit}
          {item.location && <> · 📍 {item.location}</>}
        </p>
        <div className="mt-2 flex items-center gap-2">
          <button
            aria-label="Decrease stock"
            onClick={() => onAdjust(item.id, -1)}
            className="flex h-7 w-7 items-center justify-center rounded-full border border-surface-border text-neutral-600 hover:bg-surface-muted"
          >
            <Minus size={14} />
          </button>
          <span className={`min-w-[64px] text-center text-sm font-semibold ${low ? "text-accent-low" : "text-neutral-800"}`}>
            {item.quantity} {item.unit}
          </span>
          <button
            aria-label="Increase stock"
            onClick={() => onAdjust(item.id, 1)}
            className="flex h-7 w-7 items-center justify-center rounded-full border border-surface-border text-neutral-600 hover:bg-surface-muted"
          >
            <Plus size={14} />
          </button>
        </div>
      </div>
      <div className="ml-3 flex shrink-0 flex-col items-end gap-2">
        <button
          aria-label="Edit item"
          onClick={() => onEdit(item)}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-surface-border text-neutral-500 hover:bg-surface-muted"
        >
          <Pencil size={14} />
        </button>
        <div className="text-right">
          <p className="text-sm font-medium text-neutral-800">${item.pricePerUnit.toFixed(2)} ea</p>
          {low && <p className="text-xs font-medium text-accent-low">Low stock</p>}
        </div>
      </div>
    </div>
  );
}
