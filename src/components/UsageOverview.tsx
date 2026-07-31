"use client";

import { useMemo, useState } from "react";
import { Search, ChevronRight } from "lucide-react";
import { InventoryItem, StockMovement, UsageRangeValue } from "@/lib/types";
import { formatRelativeTime } from "@/lib/time";

interface Props {
  items: InventoryItem[];
  movements: StockMovement[];
  onSelectItem: (id: string) => void;
  // Set only while the tutorial's "usage" step is active (see
  // tutorial.ts/TutorialOverlay.tsx and UsageTab.tsx, which threads this
  // down from page.tsx) - narrows the list to just this one item so a
  // first-time customer isn't hunting through a whole list to find the
  // item the tour is narrating. Falls back to showing every row as normal
  // the instant the id doesn't match anything (item got deleted mid-tour)
  // rather than rendering an empty list.
  tutorialFocusItemId?: string;
}

// Small, fixed-count trend bars per item row — deliberately not the same
// adaptive day/week/month bucketing the detail view uses (buildBuckets in
// UsageTab.tsx). A sparkline here only needs to answer "does this item's
// usage look steady, spiky, or dead" at a glance across a whole list of
// items — nobody reads exact values off it — so an even split of the
// selected range into a fixed bin count keeps both the per-item cost and
// the row's width predictable no matter how long a range is selected.
const SPARK_BINS = 20;
const SPARK_HEIGHT_PX = 32;
const DEFAULT_RANGE: UsageRangeValue = 30;

function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function buildSparkline(movements: StockMovement[], start: Date, end: Date, bins: number): number[] {
  const totalMs = end.getTime() - start.getTime();
  const result = new Array(bins).fill(0);
  if (totalMs <= 0) return result;
  movements.forEach((m) => {
    const t = new Date(m.at).getTime();
    if (t < start.getTime() || t >= end.getTime()) return;
    const idx = Math.min(bins - 1, Math.floor(((t - start.getTime()) / totalMs) * bins));
    result[idx] += Math.abs(m.delta);
  });
  return result;
}

// Overview list: every item at a glance — total used, avg/day, and a trend
// sparkline, each computed over THAT item's own tracking window
// (InventoryItem.usageTrackingDays, the same "Track usage by" default the
// detail view opens to — see ItemEditModal.tsx / UsageTab.tsx) rather than
// one shared filter applied to every row. A customer who's set a 90-day
// window on a slow-moving item because it barely restocks should see that
// item's usage over 90 days here too, not have it silently overridden by
// whatever range happens to be selected for the rest of the list — this
// list deliberately has no range picker of its own for exactly that
// reason; it always reflects each item's own configured (or default)
// window automatically. Tapping a row is the "small ui" that drills into
// the existing full detail view (stat tiles + the bigger used-vs-restocked
// chart, still in UsageTab.tsx) for that item, where its window can still
// be adjusted per-visit.
export default function UsageOverview({ items, movements, onSelectItem, tutorialFocusItemId }: Props) {
  const [query, setQuery] = useState("");

  // Every movement, grouped by item once up front — every per-item
  // computation below then scans just its own (much smaller) list rather
  // than re-filtering the full movement log per row. Kept as two maps:
  // `usage` (delta < 0 only) for the totals/sparkline, and `all` (every
  // sign) for finding an item's own earliest movement when ITS window is
  // "all time" — mirrors what the detail view treats as the start of
  // history for that item, not a restock-free subset of it.
  const { usageByItemId, allByItemId } = useMemo(() => {
    const usage = new Map<string, StockMovement[]>();
    const all = new Map<string, StockMovement[]>();
    movements.forEach((m) => {
      const allList = all.get(m.itemId);
      if (allList) allList.push(m);
      else all.set(m.itemId, [m]);
      if (m.delta >= 0) return;
      const usageList = usage.get(m.itemId);
      if (usageList) usageList.push(m);
      else usage.set(m.itemId, [m]);
    });
    return { usageByItemId: usage, allByItemId: all };
  }, [movements]);

  // Sorted by total used (descending) — the items actually moving stock
  // surface first, since that's almost always what "an overview of usage"
  // is for. Items with zero usage in their own window still show up
  // (further down, alphabetically among themselves) rather than being
  // hidden, so this stays a true overview of *all* items, not just the
  // active ones.
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matching = !q
      ? items
      : items.filter(
          (it) =>
            it.name.toLowerCase().includes(q) ||
            it.barcode.toLowerCase().includes(q) ||
            (it.location || "").toLowerCase().includes(q)
        );
    const today = startOfDay(new Date());
    const rangeEnd = new Date(today);
    rangeEnd.setDate(rangeEnd.getDate() + 1); // exclusive, so "today" is fully included

    return matching
      .map((item) => {
        const ownRange = item.usageTrackingDays ?? DEFAULT_RANGE;
        let rangeStart: Date;
        if (ownRange === "all") {
          const itemMovements = allByItemId.get(item.id);
          rangeStart = itemMovements?.length
            ? startOfDay(new Date(Math.min(...itemMovements.map((m) => new Date(m.at).getTime()))))
            : today;
        } else {
          rangeStart = new Date(today);
          rangeStart.setDate(rangeStart.getDate() - (ownRange - 1));
        }
        const spanDays = Math.max(1, Math.round((today.getTime() - rangeStart.getTime()) / 86_400_000) + 1);

        const inRange = (usageByItemId.get(item.id) ?? []).filter((m) => {
          const t = new Date(m.at).getTime();
          return t >= rangeStart.getTime() && t < rangeEnd.getTime();
        });
        const totalUsed = inRange.reduce((sum, m) => sum + Math.abs(m.delta), 0);
        const avgPerDay = totalUsed / spanDays;
        const lastUsedAt = inRange.length
          ? inRange.reduce((latest, m) => (m.at > latest ? m.at : latest), inRange[0].at)
          : null;
        const sparkline = buildSparkline(inRange, rangeStart, rangeEnd, SPARK_BINS);
        const rangeLabel = ownRange === "all" ? "all time" : `last ${ownRange}d`;
        return { item, totalUsed, avgPerDay, lastUsedAt, sparkline, rangeLabel };
      })
      .sort((a, b) => b.totalUsed - a.totalUsed || a.item.name.localeCompare(b.item.name));
  }, [items, query, usageByItemId, allByItemId]);

  // Narrowed to just the tutorial's own target item while its step is
  // active - falls back to the full list the instant that id doesn't match
  // any row (item deleted mid-tour, or the tour isn't running) rather than
  // silently showing an empty screen. Deliberately not folded into the
  // `rows` useMemo above: it's a cheap filter over an already-small array,
  // and keeping it separate means a change to tutorialFocusItemId alone
  // doesn't have to re-run the real per-item usage math above it.
  const focused = tutorialFocusItemId ? rows.filter((r) => r.item.id === tutorialFocusItemId) : rows;
  const displayRows = focused.length ? focused : rows;

  return (
    <div>
      <div className="mb-2 flex items-center gap-2 rounded-xl2 border border-surface-border bg-white px-3 py-2 shadow-card">
        <Search size={16} className="text-neutral-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search items..."
          aria-label="Search items"
          className="w-full bg-transparent text-sm outline-none placeholder:text-neutral-400"
        />
      </div>
      <p className="mb-3 text-[11px] text-neutral-400">
        Each item shows usage over its own tracking window — 30 days by default, or whatever you&apos;ve set for it
        (&quot;Track usage by&quot;) from the pencil icon in Inventory.
      </p>

      {displayRows.length === 0 ? (
        <p className="rounded-xl2 border border-dashed border-surface-border bg-white p-6 text-center text-sm text-neutral-400">
          {query.trim() ? "No items match your search." : "Add some inventory first, then usage trends will show up here."}
        </p>
      ) : (
        <div className="space-y-2" data-tutorial="usage-overview-list">
          {displayRows.map(({ item, totalUsed, avgPerDay, lastUsedAt, sparkline, rangeLabel }) => {
            const maxBin = Math.max(1, ...sparkline);
            return (
              <button
                key={item.id}
                onClick={() => onSelectItem(item.id)}
                className="flex w-full items-center gap-3 rounded-xl2 border border-surface-border bg-white p-3 text-left shadow-card hover:bg-surface-muted"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-neutral-900">{item.name}</p>
                  <p className="mt-0.5 truncate text-[11px] text-neutral-400">
                    {totalUsed > 0 ? (
                      <>
                        {totalUsed} {item.unit} used · {avgPerDay.toFixed(1)}/day, {rangeLabel}
                        {lastUsedAt && <> · last {formatRelativeTime(lastUsedAt)}</>}
                      </>
                    ) : (
                      `No usage ${rangeLabel}`
                    )}
                  </p>
                </div>
                <div
                  className="flex shrink-0 items-end gap-[2px]"
                  style={{ height: SPARK_HEIGHT_PX }}
                  aria-hidden="true"
                >
                  {sparkline.map((v, i) => (
                    <div
                      key={i}
                      className="w-[3px] rounded-t-[1px] bg-neutral-900/70"
                      style={{ height: `${Math.max(3, Math.round((v / maxBin) * SPARK_HEIGHT_PX))}px` }}
                    />
                  ))}
                </div>
                <ChevronRight size={16} className="shrink-0 text-neutral-300" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
