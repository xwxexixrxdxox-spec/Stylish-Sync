"use client";

import { Share2, ShoppingCart } from "lucide-react";
import { InventoryItem } from "@/lib/types";

interface Props {
  items: InventoryItem[];
}

export default function ReorderTab({ items }: Props) {
  const low = items.filter((it) => it.quantity <= it.reorderAt);

  const share = async () => {
    const text = low
      .map(
        (it) =>
          `${it.name}${it.location ? ` (${it.location})` : ""}: have ${it.quantity} ${it.unit}, reorder at ${it.reorderAt}`
      )
      .join("\n");
    if (navigator.share) {
      await navigator.share({ title: "Items to reorder", text }).catch(() => {});
    } else {
      await navigator.clipboard.writeText(text).catch(() => {});
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-4 pb-24 pt-5 sm:px-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-neutral-900">Items to reorder</h1>
        <button
          onClick={share}
          className="flex items-center gap-1.5 rounded-lg border border-surface-border px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-surface-muted"
        >
          <Share2 size={14} /> Share
        </button>
      </div>

      {low.length === 0 ? (
        <p className="rounded-xl2 border border-dashed border-surface-border bg-white p-6 text-center text-sm text-neutral-400">
          Nothing needs reordering right now.
        </p>
      ) : (
        <>
        <p className="mb-3 text-[11px] leading-relaxed text-neutral-400">
          &quot;Find on Amazon&quot; searches by this item&apos;s barcode (or name) — results may not meet
          expectations, so always verify it&apos;s the right product before purchasing.
        </p>
        <div className="space-y-2.5">
          {low.map((it) => (
            <div key={it.id} className="rounded-xl2 border border-surface-border bg-white p-4 shadow-card">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-neutral-900">{it.name}</p>
                  <p className="mt-0.5 text-xs text-neutral-500">
                    In stock: {it.quantity} {it.unit} · reorder at {it.reorderAt}
                    {it.location && <> · 📍 {it.location}</>}
                  </p>
                  <p className="mt-1 text-xs font-medium text-accent-low">
                    Need {Math.max(it.reorderAt - it.quantity + 1, 1)} more
                  </p>
                </div>
                {/* Manual reorder v1: a UPC search on Amazon usually lands
                    directly on the exact product page, and falls back to a
                    name search for items without a barcode. (True automatic
                    reordering needs an Amazon Business account + Punchout/
                    ordering API access — there's no public consumer API.) */}
                <a
                  href={`https://www.amazon.com/s?k=${encodeURIComponent(it.barcode || it.name)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex shrink-0 items-center gap-1.5 rounded-lg border border-surface-border px-2.5 py-1.5 text-xs font-medium text-neutral-700 hover:bg-surface-muted"
                >
                  <ShoppingCart size={13} /> Find on Amazon
                </a>
              </div>
            </div>
          ))}
        </div>
        </>
      )}
    </div>
  );
}
