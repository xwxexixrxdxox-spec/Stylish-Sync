"use client";

import { useRef, useState } from "react";
import { Minus, Plus, Pencil, Trash2 } from "lucide-react";
import { InventoryItem } from "@/lib/types";
import { playChime } from "@/lib/chime";
import Tooltip from "./Tooltip";
import ConfirmDialog from "./ConfirmDialog";

interface Props {
  item: InventoryItem;
  onAdjust: (id: string, delta: number) => void;
  onEdit: (item: InventoryItem) => void;
  onDelete: (id: string) => void;
}

export default function ItemCard({ item, onAdjust, onEdit, onDelete }: Props) {
  const low = item.quantity <= item.reorderAt;
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Cute little "+1"/"-1" pop that floats up from whichever button was
  // pressed, plus a quick squish/bounce on the icon itself. `key` forces
  // React to remount the badge on every click (even repeated same-direction
  // clicks) so the animation always restarts from the beginning.
  const [burst, setBurst] = useState<{ sign: 1 | -1; key: number } | null>(null);
  const burstKeyRef = useRef(0);

  const handleAdjust = (delta: 1 | -1) => {
    onAdjust(item.id, delta);
    playChime(delta > 0 ? "add" : "remove");
    burstKeyRef.current += 1;
    setBurst({ sign: delta, key: burstKeyRef.current });
  };

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
          <div className="relative">
            <Tooltip label="Decrease stock by 1">
              <button
                aria-label="Decrease stock"
                onClick={() => handleAdjust(-1)}
                className="flex h-7 w-7 items-center justify-center rounded-full border border-surface-border text-neutral-600 transition-transform duration-150 hover:bg-surface-muted active:scale-90"
              >
                <Minus size={14} key={burst?.sign === -1 ? burst.key : "idle"} className={burst?.sign === -1 ? "animate-btn-pop" : undefined} />
              </button>
            </Tooltip>
            {burst?.sign === -1 && (
              <span
                key={burst.key}
                onAnimationEnd={() => setBurst(null)}
                className="pointer-events-none absolute left-1/2 top-0 select-none animate-float-up text-xs font-semibold text-accent-low"
              >
                −1
              </span>
            )}
          </div>
          <span className={`min-w-[64px] text-center text-sm font-semibold ${low ? "text-accent-low" : "text-neutral-800"}`}>
            {item.quantity} {item.unit}
          </span>
          <div className="relative">
            <Tooltip label="Increase stock by 1">
              <button
                aria-label="Increase stock"
                onClick={() => handleAdjust(1)}
                className="flex h-7 w-7 items-center justify-center rounded-full border border-surface-border text-neutral-600 transition-transform duration-150 hover:bg-surface-muted active:scale-90"
              >
                <Plus size={14} key={burst?.sign === 1 ? burst.key : "idle"} className={burst?.sign === 1 ? "animate-btn-pop" : undefined} />
              </button>
            </Tooltip>
            {burst?.sign === 1 && (
              <span
                key={burst.key}
                onAnimationEnd={() => setBurst(null)}
                className="pointer-events-none absolute left-1/2 top-0 select-none animate-float-up text-xs font-semibold text-accent-ok"
              >
                +1
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="ml-3 flex shrink-0 flex-col items-end gap-2">
        <div className="flex gap-1.5">
          <Tooltip label="Edit item">
            <button
              aria-label="Edit item"
              onClick={() => onEdit(item)}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-surface-border text-neutral-500 hover:bg-surface-muted"
            >
              <Pencil size={14} />
            </button>
          </Tooltip>
          <Tooltip label="Delete item">
            <button
              aria-label="Delete item"
              onClick={() => setConfirmingDelete(true)}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-surface-border text-neutral-500 hover:bg-red-50 hover:text-accent-low"
            >
              <Trash2 size={14} />
            </button>
          </Tooltip>
        </div>
        <div className="text-right">
          <p className="text-sm font-medium text-neutral-800">${(item.pricePerUnit ?? 0).toFixed(2)} ea</p>
          {low && <p className="text-xs font-medium text-accent-low">Low stock</p>}
        </div>
      </div>

      {confirmingDelete && (
        <ConfirmDialog
          title={`Delete "${item.name}"?`}
          message="This removes the item from your inventory. Its past usage history stays intact, but it will no longer be trackable going forward. This can't be undone."
          confirmLabel="Delete"
          onCancel={() => setConfirmingDelete(false)}
          onConfirm={() => {
            setConfirmingDelete(false);
            onDelete(item.id);
          }}
        />
      )}
    </div>
  );
}
