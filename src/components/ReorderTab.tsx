"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Plus, Share2, ShoppingCart, X } from "lucide-react";
import { CARRIER_OPTIONS, Carrier, InventoryItem, PackageTracking } from "@/lib/types";
import { getEffectiveQuantity, isLowStock } from "@/lib/reorderStatus";
import {
  addPackageTracking,
  getRetailerSearchBy,
  loadPackageTracking,
  RetailerSearchBy,
  setPackageTrackingDismissed,
  setRetailerSearchBy,
} from "@/lib/storage";
import { RETAILERS } from "@/lib/retailerSearch";
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

  // "Find at <retailer>" — which item's dropdown of retailer links is open,
  // plus the shared barcode/name/auto search preference (persisted per
  // device, same pattern as the editor name tag in storage.ts).
  const [findMenuFor, setFindMenuFor] = useState<string | null>(null);
  const [searchBy, setSearchByState] = useState<RetailerSearchBy>("auto");
  useEffect(() => {
    setSearchByState(getRetailerSearchBy());
  }, []);
  const handleSearchByChange = (value: RetailerSearchBy) => {
    setSearchByState(value);
    setRetailerSearchBy(value);
  };
  // "auto" prefers a barcode when the item has one (a UPC search usually
  // lands directly on the exact product page) and falls back to the name
  // otherwise — same heuristic the old Amazon-only link used, just now
  // shared across every retailer.
  const queryFor = (it: InventoryItem) => {
    if (searchBy === "barcode") return it.barcode || it.name;
    if (searchBy === "name") return it.name;
    return it.barcode || it.name;
  };

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
          data-tutorial="reorder-share-button"
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
          &quot;Find at&quot; searches each store by this item&apos;s barcode or name — results may not meet
          expectations, so always verify it&apos;s the right product before purchasing.
        </p>
        <div
          className="mb-3 flex items-center gap-1.5 text-[11px] text-neutral-500"
          data-tutorial="reorder-search-by-toggle"
        >
          <span>Search by:</span>
          {(["auto", "barcode", "name"] as RetailerSearchBy[]).map((opt) => (
            <button
              key={opt}
              onClick={() => handleSearchByChange(opt)}
              // Tour hooks on the two individual pills the tour actually
              // asks for by name. The row as a whole is still tagged above
              // for the step that introduces all three at once; these let
              // the follow-up steps put the glow on the one pill they are
              // talking about rather than the whole row.
              data-tutorial={
                opt === "barcode"
                  ? "reorder-search-by-barcode"
                  : opt === "name"
                    ? "reorder-search-by-description"
                    : undefined
              }
              className={`rounded-full px-2 py-0.5 font-medium ${
                searchBy === opt
                  ? "bg-neutral-900 text-white"
                  : "border border-surface-border text-neutral-500 hover:bg-surface-muted"
              }`}
            >
              {opt === "auto" ? "Auto" : opt === "barcode" ? "Barcode" : "Description"}
            </button>
          ))}
        </div>
        <p className="mb-3 text-[11px] leading-relaxed text-neutral-400">
          Package tracking is experimental: it&apos;s just a place to jot down a tracking number and get a link
          to the carrier&apos;s own tracking page — there&apos;s no live status, no notifications, and no
          automatic &quot;delivered&quot; detection.
        </p>
        <div className="space-y-2.5">
          {low.map((it, itemIndex) => {
            const itemTracking = trackingByItem.get(it.id) ?? [];
            return (
            <div
              key={it.id}
              className="rounded-xl2 border border-surface-border bg-white p-4 shadow-card"
              // Tour hook: the "reorder" step keeps this whole card (not
              // just the low-stock text or the Find-at button individually)
              // out of the blur mask for its entire duration - see
              // focusSelectors on the "reorder" step in tutorial.ts.
              data-tutorial={itemIndex === 0 ? "reorder-item-card" : undefined}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-neutral-900">{it.name}</p>
                  <p className="mt-0.5 text-xs text-neutral-500">
                    In stock: {it.quantity} {it.unit} · reorder at {it.reorderAt}
                    {it.location && <> · 📍 {it.location}</>}
                  </p>
                  <p
                    className="mt-1 text-xs font-medium text-accent-low"
                    // Tour hook: the guided tour's "reorder" step spotlights
                    // this red warning text on the first low-stock item —
                    // the concrete "here's why this screen matters" — before
                    // switching to the Find-at button below. Scoped to the
                    // first row only, same as ItemCard's tutorialTarget
                    // convention for the Inventory tab's stock-controls step.
                    data-tutorial={itemIndex === 0 ? "reorder-low-stock-text" : undefined}
                  >
                    Need {Math.max(Math.ceil(it.reorderAt - getEffectiveQuantity(it, items) + 1), 1)} more
                  </p>
                </div>
                {/* Manual reorder v1: a UPC search usually lands directly on
                    the exact product page, and falls back to a name search
                    for items without a barcode. (True automatic reordering
                    needs a retailer business account + Punchout/ordering API
                    access — there's no public consumer API for any of
                    these.) Multiple retailers since not everyone stocks up
                    at the same store — see retailerSearch.ts. */}
                <div className="relative shrink-0">
                  <button
                    onClick={() => setFindMenuFor(findMenuFor === it.id ? null : it.id)}
                    data-tutorial={itemIndex === 0 ? "reorder-find-at-button" : undefined}
                    className="flex items-center gap-1.5 rounded-lg border border-surface-border px-2.5 py-1.5 text-xs font-medium text-neutral-700 hover:bg-surface-muted"
                  >
                    <ShoppingCart size={13} /> Find at <ChevronDown size={12} />
                  </button>
                  {findMenuFor === it.id && (
                    <>
                      {/* Click-outside catcher — a plain fixed overlay below
                          the menu itself, same pattern used elsewhere in
                          this app for dismissible popovers. */}
                      <div className="fixed inset-0 z-10" onClick={() => setFindMenuFor(null)} />
                      {/* Tour hook: the retailer list itself, not the button
                          that opens it. The customer's note on the old tour
                          was that the glow "didn't fit the store dropdown" -
                          it was ringing a small button while the actual list
                          of stores hung below it, unlit. This menu is
                          absolutely positioned, so it can't grow the wrapper
                          it lives in; the tour has to be able to name it
                          directly (see retargetWhilePresent in tutorial.ts). */}
                      <div
                        className="absolute right-0 z-20 mt-1 w-40 overflow-hidden rounded-lg border border-surface-border bg-white shadow-card"
                        data-tutorial={itemIndex === 0 ? "reorder-find-at-menu" : undefined}
                      >
                        {RETAILERS.map((r) => (
                          <a
                            key={r.id}
                            href={r.buildUrl(queryFor(it))}
                            target="_blank"
                            rel="noreferrer"
                            onClick={() => setFindMenuFor(null)}
                            className="block px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-surface-muted"
                          >
                            {r.label}
                          </a>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div
                className="mt-3 border-t border-surface-border pt-3"
                data-tutorial={itemIndex === 0 ? "reorder-package-tracking" : undefined}
              >
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
