"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search, CornerDownRight } from "lucide-react";
import { InventoryItem } from "@/lib/types";
import { getKnownLocations } from "@/lib/locations";
import { stockDeficit } from "@/lib/reorderStatus";
import {
  InventorySort,
  getInventorySort,
  setInventorySort,
  getCollapsedBreakdownGroups,
  setCollapsedBreakdownGroups,
} from "@/lib/storage";
import ItemCard from "./ItemCard";
import ItemEditModal from "./ItemEditModal";
import ImportExportPanel from "./ImportExportPanel";
import ShareBarcodeDatabase from "./ShareBarcodeDatabase";

interface Props {
  items: InventoryItem[];
  onAdjust: (id: string, delta: number) => void;
  onSave: (item: InventoryItem) => void;
  onDelete: (id: string) => void;
  onImport: (items: InventoryItem[]) => void;
  onBreakCase: (caseItemId: string, casesToBreak: number) => void;
}

export default function InventoryTab({ items, onAdjust, onSave, onDelete, onImport, onBreakCase }: Props) {
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<InventoryItem | null>(null);
  // Starts at the same "recent" default the persisted-preference reader
  // itself falls back to, then picks up whatever the customer last chose
  // once mounted - mirrors how the rest of this app (e.g. the linked
  // Google Sheet id in page.tsx) reads localStorage-backed prefs only
  // after mount, so there's no server/client hydration mismatch.
  const [sort, setSortState] = useState<InventorySort>("recent");
  useEffect(() => {
    setSortState(getInventorySort());
  }, []);
  const handleSortChange = (value: InventorySort) => {
    setSortState(value);
    setInventorySort(value);
  };

  // Which break-down groups (Unity-hierarchy-style foldouts — see
  // groupBreakDownChildren below) are collapsed, keyed by the parent
  // item's barcode. Same "read the persisted value only after mount"
  // reasoning as `sort` above.
  const [collapsedGroups, setCollapsedGroupsState] = useState<Set<string>>(new Set());
  useEffect(() => {
    setCollapsedGroupsState(getCollapsedBreakdownGroups());
  }, []);
  const toggleGroupCollapsed = useCallback((parentBarcode: string) => {
    setCollapsedGroupsState((prev) => {
      const next = new Set(prev);
      if (next.has(parentBarcode)) next.delete(parentBarcode);
      else next.add(parentBarcode);
      setCollapsedBreakdownGroups(next);
      return next;
    });
  }, []);

  // Any live sort — "Recently changed" most of all, but "Low stock first"
  // shifts under your finger too — can re-rank an item the instant its
  // quantity or updatedAt changes. Without this, holding + on one item (or
  // tapping the inline quantity editor) could yank that very item to a new
  // spot in the list mid-interaction, or shove a *different* item under
  // your finger right as you go to tap again. So: while any card reports
  // activity (a step, a hold tick, opening/typing the quantity editor), the
  // on-screen ORDER is frozen at whatever it was the instant before — the
  // numbers on each card still update live — and only re-settles into the
  // live sort order ~700ms after the last touch. isBusyRef/stableOrderRef
  // are refs (not state) so every tick of a hold doesn't itself trigger an
  // extra render; busyVersion is the one bit of state used to force a
  // single recompute once the grace period actually elapses.
  const ACTIVITY_FREEZE_MS = 700;
  const isBusyRef = useRef(false);
  const stableOrderRef = useRef<string[] | null>(null);
  const unfreezeTimerRef = useRef<number | null>(null);
  const [busyVersion, setBusyVersion] = useState(0);

  const handleActivity = useCallback(() => {
    isBusyRef.current = true;
    if (unfreezeTimerRef.current !== null) {
      window.clearTimeout(unfreezeTimerRef.current);
    }
    unfreezeTimerRef.current = window.setTimeout(() => {
      isBusyRef.current = false;
      unfreezeTimerRef.current = null;
      setBusyVersion((v) => v + 1); // one recompute now that re-sorting is allowed again
    }, ACTIVITY_FREEZE_MS);
  }, []);

  useEffect(
    () => () => {
      if (unfreezeTimerRef.current !== null) window.clearTimeout(unfreezeTimerRef.current);
    },
    []
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = !q
      ? items
      : items.filter(
          (it) =>
            it.name.toLowerCase().includes(q) ||
            it.barcode.toLowerCase().includes(q) ||
            (it.location || "").toLowerCase().includes(q)
        );

    if (isBusyRef.current && stableOrderRef.current) {
      const byId = new Map(base.map((it) => [it.id, it] as const));
      const ordered: InventoryItem[] = [];
      for (const id of stableOrderRef.current) {
        const it = byId.get(id);
        if (it) {
          ordered.push(it);
          byId.delete(id);
        }
      }
      // Anything not in the frozen order — e.g. a new item scanned in or
      // imported mid-interaction — just tacks onto the end rather than
      // vanishing until the freeze lifts.
      ordered.push(...byId.values());
      return ordered;
    }

    const sorted = [...base];
    if (sort === "name") {
      sorted.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sort === "low-stock") {
      // Biggest deficit first, so whatever needs reordering most urgently
      // surfaces at the top of the list. Uses the full `items` list (not
      // `base`/the filtered subset) so a break-down child that's currently
      // filtered out of view is still found when computing a linked
      // parent's effective quantity — see reorderStatus.ts.
      sorted.sort((a, b) => stockDeficit(b, items) - stockDeficit(a, items));
    } else {
      // "recent" (default): most recently changed or scanned first.
      sorted.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
    }
    stableOrderRef.current = sorted.map((it) => it.id);
    return sorted;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, query, sort, busyVersion]);

  // Purely a rendering-order transform — doesn't touch `filtered` itself,
  // so the value banner, item count, and the freeze/stable-order mechanism
  // above all keep working exactly as before against the flat sorted list.
  // This just decides where each card *draws*: a break-down child that
  // matches the current sort/search is pulled out of wherever it would
  // otherwise land and re-inserted directly under its parent case, so the
  // relationship reads as a visual group instead of two unrelated cards
  // that might be far apart (e.g. under "Low stock first" or "Name A-Z").
  const grouped = useMemo(
    () => groupBreakDownChildren(filtered, collapsedGroups),
    [filtered, collapsedGroups]
  );

  const locations = useMemo(() => getKnownLocations(items), [items]);

  // Estimated total dollar value of everything on hand: sum of quantity ×
  // price-per-unit across the *filtered* set, so it answers "what am I
  // looking at right now" — the full inventory when unfiltered, or just the
  // matching subset when a search is active (the label says which). Recomputes
  // live as stock is adjusted, items are edited, or the search changes. It's
  // an estimate because per-unit prices are whatever was entered/looked up,
  // not a valuation — the banner says so.
  const totalValue = useMemo(
    () => filtered.reduce((sum, it) => sum + (it.pricePerUnit ?? 0) * (it.quantity ?? 0), 0),
    [filtered]
  );
  const formattedValue = totalValue.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const isFiltered = query.trim().length > 0;

  return (
    <div className="mx-auto max-w-2xl px-4 pb-24 pt-5 sm:px-6">
      <h1 className="mb-4 flex items-center gap-2 text-lg font-semibold text-neutral-900">
        <span aria-hidden>📦</span> Inventory
      </h1>

      <ImportExportPanel items={items} onImport={onImport} />

      <div className="mt-3">
        <ShareBarcodeDatabase />
      </div>

      <div className="mb-3 mt-4 flex items-center gap-2">
        <div className="flex flex-1 items-center gap-2 rounded-xl2 border border-surface-border bg-white px-3 py-2 shadow-card">
          <Search size={16} className="text-neutral-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search items..."
            className="w-full bg-transparent text-sm outline-none placeholder:text-neutral-400"
          />
        </div>
        <select
          value={sort}
          onChange={(e) => handleSortChange(e.target.value as InventorySort)}
          aria-label="Sort items"
          className="shrink-0 rounded-xl2 border border-surface-border bg-white px-2.5 py-2 text-xs font-medium text-neutral-600 shadow-card"
        >
          <option value="recent">Recently changed</option>
          <option value="name">Name (A–Z)</option>
          <option value="low-stock">Low stock first</option>
        </select>
      </div>

      <p className="mb-3 text-xs text-neutral-500">
        {filtered.length} item{filtered.length === 1 ? "" : "s"} · tap ✏️ to edit · 🗑️ to delete · ± to adjust stock
      </p>

      {filtered.length > 0 && <InventoryValueBanner value={formattedValue} isFiltered={isFiltered} placement="top" />}

      <div className="space-y-2.5">
        {grouped.map((entry, index) =>
          entry.isChild ? (
            <div key={entry.item.id} className="ml-6 border-l-2 border-dashed border-surface-border pl-3">
              <p className="mb-1 flex items-center gap-1 text-[11px] font-medium text-neutral-400">
                <CornerDownRight size={11} /> broken down from {entry.parentName}
              </p>
              <ItemCard
                item={entry.item}
                items={items}
                onAdjust={onAdjust}
                onEdit={setEditing}
                onDelete={onDelete}
                onBreakCase={onBreakCase}
                tutorialTarget={false}
                onActivity={handleActivity}
              />
            </div>
          ) : (
            <ItemCard
              key={entry.item.id}
              item={entry.item}
              items={items}
              onAdjust={onAdjust}
              onEdit={setEditing}
              onDelete={onDelete}
              onBreakCase={onBreakCase}
              tutorialTarget={index === 0}
              onActivity={handleActivity}
              collapsed={entry.hasVisibleChild ? collapsedGroups.has(entry.item.barcode) : undefined}
              onToggleCollapsed={
                entry.hasVisibleChild ? () => toggleGroupCollapsed(entry.item.barcode) : undefined
              }
            />
          )
        )}
        {filtered.length === 0 && (
          <p className="rounded-xl2 border border-dashed border-surface-border bg-white p-6 text-center text-sm text-neutral-400">
            No items match "{query}".
          </p>
        )}
      </div>

      {/* Repeated at the bottom so a customer who's scrolled through a long
          list doesn't have to scroll back up to see the total — same live
          number, just within thumb reach after a long scroll. */}
      {filtered.length > 3 && <InventoryValueBanner value={formattedValue} isFiltered={isFiltered} placement="bottom" />}

      {editing && (
        <ItemEditModal
          item={editing}
          items={items}
          locations={locations}
          onClose={() => setEditing(null)}
          onSave={(it) => {
            onSave(it);
            setEditing(null);
          }}
          onDelete={(id) => {
            onDelete(id);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

interface GroupedEntry {
  item: InventoryItem;
  isChild: boolean;
  // Only set on a child entry — the case/pack item's name, shown as the
  // "broken down from ___" caption above the nested card.
  parentName?: string;
  // Only set on a parent (non-child) entry that actually has a linked
  // child present in this list — ItemCard only renders its foldout
  // triangle when this is present, so a case item with no visible child
  // to hide/show doesn't get a toggle that does nothing.
  hasVisibleChild?: boolean;
}

// Re-orders a flat (already filtered/sorted) list so each break-down child
// renders immediately after its parent case item, instead of wherever it
// happened to land in the name/recency/low-stock sort. Both items still
// need to be *in* `list` for this to apply — a child hidden by the current
// search, or a parent that's been filtered out, just renders on its own,
// same as before this existed. `collapsed` (parent barcodes) hides the
// child entirely, Unity-hierarchy-foldout style — the child still counts
// as "grouped" (so it doesn't reappear at its own sorted position), it
// just isn't pushed into the output at all while its parent is collapsed.
function groupBreakDownChildren(list: InventoryItem[], collapsed: Set<string>): GroupedEntry[] {
  const byBarcode = new Map(list.map((it) => [it.barcode, it] as const));
  // Every child id that a parent in this list will place inline below —
  // skipped at its own sorted position so it isn't rendered twice.
  const childIds = new Set<string>();
  for (const it of list) {
    if (!it.breaksDownIntoBarcode) continue;
    const child = byBarcode.get(it.breaksDownIntoBarcode);
    if (child && child.id !== it.id) childIds.add(child.id);
  }

  const out: GroupedEntry[] = [];
  for (const it of list) {
    if (childIds.has(it.id)) continue;
    const child = it.breaksDownIntoBarcode ? byBarcode.get(it.breaksDownIntoBarcode) : undefined;
    const hasVisibleChild = Boolean(child && child.id !== it.id);
    out.push({ item: it, isChild: false, hasVisibleChild });
    if (hasVisibleChild && !collapsed.has(it.barcode)) {
      out.push({ item: child!, isChild: true, parentName: it.name });
    }
  }
  return out;
}

function InventoryValueBanner({
  value,
  isFiltered,
  placement,
}: {
  value: string;
  isFiltered: boolean;
  placement: "top" | "bottom";
}) {
  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-xl2 border border-surface-border bg-white px-4 py-3 shadow-card ${
        placement === "top" ? "mb-3" : "mt-3"
      }`}
    >
      <div className="min-w-0">
        <p className="text-xs font-medium text-neutral-500">
          {isFiltered ? "Estimated value (matching items)" : "Estimated total inventory value"}
        </p>
        <p className="text-[11px] text-neutral-400">Quantity × price per unit · estimate only</p>
      </div>
      <p className="shrink-0 text-lg font-semibold tabular-nums text-neutral-900">{value}</p>
    </div>
  );
}
