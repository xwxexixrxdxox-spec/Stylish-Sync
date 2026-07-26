"use client";

import { useMemo, useState } from "react";
import { Search, ChevronRight } from "lucide-react";
import { InventoryItem, StockMovement, UsageRangeValue, USAGE_RANGE_OPTIONS } from "@/lib/types";
import { formatRelativeTime } from "@/lib/time";

interface Props {
  items: InventoryItem[];
  movements: StockMovement[];
  onSelectItem: (id: string) => void;
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
// sparkline for whichever range is selected — so a customer with more than
// a handful of items isn't stuck flipping through a one-item-at-a-time
// dropdown just to see who's using the most stock. Tapping a row is the
// "small ui" that drills into the existing full detail view (stat tiles +
// the bigger used-vs-restocked chart, still in UsageTab.tsx) for that item.
export default function UsageOverview({ items, movements, onSelectItem }: Props) {
  const [query, setQuery] = useState("");
  const [rangeValue, setRangeValue] = useState<UsageRangeValue>(30);

  // Usage-only (delta < 0) movements, grouped by item once up front — every
  // per-item computation below then scans just its own (much smaller) list
  // rather than re-filtering the full movement log per row.
  const usageByItemId = useMemo(() => {
    const map = new Map<string, StockMovement[]>();
    movements.forEach((m) => {
      if (m.delta >= 0) return;
      const list = map.get(m.itemId);
      if (list) list.push(m);
      else map.set(m.itemId, [m]);
    });
    return map;
  }, [movements]);

  // Global earliest movement (across every item), not per-item — "All
  // time" here means "since the earliest usage this account has ever
  // logged," so every row's sparkline shares the same x-axis window rather
  // than each item silently starting at a different date.
  const earliestMovementDate = useMemo(() => {
    if (!movements.length) return null;
    return startOfDay(new Date(Math.min(...movements.map((m) => new Date(m.at).getTime()))));
  }, [movements]);

  const { rangeStart, rangeEnd, spanDays } = useMemo(() => {
    const today = startOfDay(new Date());
    const end = new Date(today);
    end.setDate(end.getDate() + 1); // exclusive, so "today" is fully included
    const start =
      rangeValue === "all"
        ? earliestMovementDate ?? today
        : (() => {
            const d = new Date(today);
            d.setDate(d.getDate() - (rangeValue - 1));
            return d;
          })();
    const span = Math.max(1, Math.round((today.getTime() - start.getTime()) / 86_400_000) + 1);
    return { rangeStart: start, rangeEnd: end, spanDays: span };
  }, [rangeValue, earliestMovementDate]);

  const rangeLabel = rangeValue === "all" ? "all time" : `last ${rangeValue}d`;

  // Sorted by total used (descending) — the items actually moving stock
  // surface first, since that's almost always what "an overview of usage"
  // is for. Items with zero usage in the range still show up (further
  // down, alphabetically among themselves) rather than being hidden, so
  // this stays a true overview of *all* items, not just the active ones.
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
    return matching
      .map((item) => {
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
        return { item, totalUsed, avgPerDay, lastUsedAt, sparkline };
      })
      .sort((a, b) => b.totalUsed - a.totalUsed || a.item.name.localeCompare(b.item.name));
  }, [items, query, usageByItemId, rangeStart, rangeEnd, spanDays]);

  return (
    <div>
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 items-center gap-2 rounded-xl2 border border-surface-border bg-white px-3 py-2 shadow-card sm:max-w-[220px]">
          <Search size={16} className="text-neutral-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search items..."
            aria-label="Search items"
            className="w-full bg-transparent text-sm outline-none placeholder:text-neutral-400"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {USAGE_RANGE_OPTIONS.map((r) => (
            <button
              key={r.label}
              onClick={() => setRangeValue(r.value)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
                rangeValue === r.value
                  ? "border-neutral-900 bg-neutral-900 text-white"
                  : "border-surface-border text-neutral-600 hover:bg-surface-muted"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-xl2 border border-dashed border-surface-border bg-white p-6 text-center text-sm text-neutral-400">
          {query.trim() ? "No items match your search." : "Add some inventory first, then usage trends will show up here."}
        </p>
      ) : (
        <div className="space-y-2">
          {rows.map(({ item, totalUsed, avgPerDay, lastUsedAt, sparkline }) => {
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
