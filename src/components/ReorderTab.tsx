"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Share2, ShoppingCart, X } from "lucide-react";
import { CARRIER_OPTIONS, Carrier, InventoryItem, PackageTracking } from "@/lib/types";
import { getEffectiveQuantity, isLowStock } from "@/lib/reorderStatus";
import { addPackageTracking, loadPackageTracking, setPackageTrackingDismissed } from "@/lib/storage";
import { carrierTrackingUrl } from "@/lib/carrierTracking";
import ExperimentalBadge from "./ExperimentalBadge";

interface Props {
  items: InventoryItem[];
}

export default function ReorderTab({ items }: Props) {
  // A case/pack that's had a couple of units broken down into a linked
  // loose item doesn't count as low here just because its own remaining
  // count dipped — see reorderStatus.ts for why (in short: there's still
  // real supply sitting in the broken-down item).
  const low = items.filter((it) => isLowStock(it, items));

  // EXPERIMENTAL — package tracking log (see PackageTracking in types.ts).
  // Mirrors the same "local-first, not lifted into page.tsx" pattern
  // movements use in UsageTab.tsx: this component loads its own copy on
  // mount and re-syncs it after any local mutation, rather than the data
  // living in shared app state.
  const [tracking, setTracking] = useState<PackageTracking[]>([]);
  useEffect(() => {
    setTracking(loadPackageTracking());
  }, []);

  const trackingByItem = useMemo(() => {
    const map = new Map<string, PackageTracking[]>();
    for (const t of tracking) {
      if (t.dismissed) continue;
      const list = map.get(t.itemId) ?? [];
      list.push(t);
      map.set(t.itemId, list);
    }
    return map;
  }, [tracking]);

  const [addingFor, setAddingFor] = useState<string | null>(null);
  const [draftCarrier, setDraftCarrier] = useState<Carrier>("amazon");
  const [draftNumber, setDraftNumber] = useState("");

  const startAdding = (itemId: string) => {
    setAddingFor(itemId);
    setDraftCarrier("amazon");
    setDraftNumber("");
  };

  const saveTracking = (itemId: string) => {
    const trimmed = draftNumber.trim();
    if (!trimmed) return;
    addPackageTracking({ itemId, carrier: draftCarrier, trackingNumber: trimmed });
    setTracking(loadPackageTracking());
    setAddingFor(null);
    setDraftNumber("");
  };

  const dismiss = (id: string) => {
    setPackageTrackingDismissed(id, true);
    setTracking(loadPackageTracking());
  };

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
        <p className="mb-1.5 text-[11px] leading-relaxed text-neutral-400">
          &quot;Find on Amazon&quot; searches by this item&apos;s barcode (or name) — results may not meet
          expectations, so always verify it&apos;s the right product before purchasing.
        </p>
        <p className="mb-3 text-[11px] leading-relaxed text-neutral-400">
          Package tracking is experimental: it&apos;s just a place to jot down a tracking number and get a link
          to the carrier&apos;s own tracking page — there&apos;s no live status, no notifications, and no
          automatic &quot;delivered&quot; detection.
        </p>
        <div className="space-y-2.5">
          {low.map((it) => {
            const itemTracking = trackingByItem.get(it.id) ?? [];
            return (
            <div key={it.id} className="rounded-xl2 border border-surface-border bg-white p-4 shadow-card">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-neutral-900">{it.name}</p>
                  <p className="mt-0.5 text-xs text-neutral-500">
                    In stock: {it.quantity} {it.unit} · reorder at {it.reorderAt}
                    {it.location && <> · 📍 {it.location}</>}
                  </p>
                  <p className="mt-1 text-xs font-medium text-accent-low">
                    Need {Math.max(Math.ceil(it.reorderAt - getEffectiveQuantity(it, items) + 1), 1)} more
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

              <div className="mt-3 border-t border-surface-border pt-3">
                <div className="mb-1.5 flex items-center gap-1.5">
                  <span className="text-[11px] font-medium text-neutral-500">Package tracking</span>
                  <ExperimentalBadge />
                </div>

                {itemTracking.length > 0 && (
                  <div className="mb-2 space-y-1.5">
                    {itemTracking.map((t) => (
                      <div
                        key={t.id}
                        className="flex items-center justify-between gap-2 rounded-lg bg-surface-muted px-2.5 py-1.5 text-xs"
                      >
                        <a
                          href={carrierTrackingUrl(t.carrier, t.trackingNumber)}
                          target="_blank"
                          rel="noreferrer"
                          className="min-w-0 truncate font-medium text-neutral-700 hover:underline"
                        >
                          {CARRIER_OPTIONS.find((c) => c.value === t.carrier)?.label ?? t.carrier} ·{" "}
                          {t.trackingNumber} ↗
                        </a>
                        <button
                          onClick={() => dismiss(t.id)}
                          aria-label="Dismiss tracking entry"
                          className="shrink-0 rounded p-0.5 text-neutral-400 hover:bg-white hover:text-neutral-600"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {addingFor === it.id ? (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <select
                      value={draftCarrier}
                      onChange={(e) => setDraftCarrier(e.target.value as Carrier)}
                      className="rounded-lg border border-surface-border px-2 py-1.5 text-xs text-neutral-700"
                    >
                      {CARRIER_OPTIONS.map((c) => (
                        <option key={c.value} value={c.value}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                    <input
                      value={draftNumber}
                      onChange={(e) => setDraftNumber(e.target.value)}
                      placeholder="Tracking number"
                      className="min-w-0 flex-1 rounded-lg border border-surface-border px-2 py-1.5 text-xs text-neutral-700"
                    />
                    <button
                      onClick={() => saveTracking(it.id)}
                      disabled={!draftNumber.trim()}
                      className="rounded-lg bg-neutral-900 px-2.5 py-1.5 text-xs font-medium text-white disabled:opacity-40"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setAddingFor(null)}
                      className="rounded-lg px-2 py-1.5 text-xs font-medium text-neutral-500 hover:bg-surface-muted"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => startAdding(it.id)}
                    className="flex items-center gap-1 text-xs font-medium text-neutral-500 hover:text-neutral-700"
                  >
                    <Plus size={12} /> Add tracking number
                  </button>
                )}
              </div>
            </div>
            );
          })}
        </div>
        </>
      )}
    </div>
  );
}
