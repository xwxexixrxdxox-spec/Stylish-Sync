"use client";

import { useState } from "react";
import { InventoryItem } from "@/lib/types";

interface Props {
  caseItem: InventoryItem;
  eachItem: InventoryItem;
  onConfirm: (casesToBreak: number) => void;
  onCancel: () => void;
}

// Confirms breaking down N units of a case/pack item into its linked
// each-level item (see breaksDownIntoBarcode/breaksDownIntoQty on
// InventoryItem). Its own small popup rather than reusing ConfirmDialog
// outright, since this one needs a quantity input and a live preview of
// what that many cases turns into on the each side — a plain yes/no
// doesn't capture "how many are you breaking down right now."
export default function BreakCaseDialog({ caseItem, eachItem, onConfirm, onCancel }: Props) {
  const perCase = caseItem.breaksDownIntoQty || 1;
  const [count, setCount] = useState(1);
  const clamped = Math.max(0, Math.min(Math.round(count) || 0, caseItem.quantity));

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={onCancel}>
      <div className="w-full max-w-sm rounded-xl2 bg-white p-5 shadow-card" onClick={(e) => e.stopPropagation()}>
        <p className="mb-1.5 text-sm font-semibold text-neutral-900">Break down &quot;{caseItem.name}&quot;</p>
        <p className="mb-4 text-sm text-neutral-600">
          This removes {caseItem.unit || "units"} from &quot;{caseItem.name}&quot; — counted the same as any other
          stock removal, so it still counts toward its own reorder point — and adds the equivalent individual units
          to &quot;{eachItem.name}&quot;.
        </p>

        <label className="mb-1 block text-xs font-medium text-neutral-500">
          How many {caseItem.unit || "cases"} to break down?
        </label>
        <input
          type="number"
          min={1}
          max={caseItem.quantity}
          className="mb-1 w-full rounded-lg border border-surface-border px-3 py-2 text-sm"
          value={count}
          onChange={(e) => setCount(Number(e.target.value))}
        />
        <p className="mb-4 text-xs text-neutral-500">
          {caseItem.quantity} in stock · adds {clamped * perCase} {eachItem.unit || "units"} to &quot;{eachItem.name}
          &quot;
        </p>

        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 rounded-lg border border-surface-border py-2 text-sm font-medium text-neutral-700 hover:bg-surface-muted"
          >
            Cancel
          </button>
          <button
            disabled={clamped <= 0}
            onClick={() => onConfirm(clamped)}
            className="flex-1 rounded-lg bg-neutral-900 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            Break down{clamped > 0 ? ` ${clamped}` : ""}
          </button>
        </div>
      </div>
    </div>
  );
}
