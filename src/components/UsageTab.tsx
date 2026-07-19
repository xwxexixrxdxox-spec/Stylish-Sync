"use client";

import { useEffect, useMemo, useState } from "react";
import { HelpCircle } from "lucide-react";
import { InventoryItem, StockMovement } from "@/lib/types";
import { loadMovements } from "@/lib/storage";
import UsageImportPanel from "./UsageImportPanel";

interface Props {
  items: InventoryItem[];
}

const RANGE_OPTIONS: { label: string; value: RangeValue }[] = [
  { label: "7d", value: 7 },
  { label: "14d", value: 14 },
  { label: "30d", value: 30 },
  { label: "90d", value: 90 },
  { label: "1y", value: 365 },
  { label: "All", value: "all" },
];
type RangeValue = 7 | 14 | 30 | 90 | 365 | "all";
type Granularity = "day" | "week" | "month";

interface Bucket {
  key: string;
  label: string;
  tooltipLabel: string;
  start: Date;
  end: Date; // exclusive
}

function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

// Local calendar-day key (not UTC) so a scan at 11pm doesn't get bucketed
// into "tomorrow" for anyone west of UTC.
function localDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// A daily bar chart stops being readable (or fast) once the range spans
// more than a couple months, and "All time" for a customer who's used the
// app for years could mean well over a thousand days — so longer ranges
// fall back to weekly, then monthly buckets rather than ever rendering one
// bar per day beyond ~60 days.
function pickGranularity(spanDays: number): Granularity {
  if (spanDays <= 60) return "day";
  if (spanDays <= 400) return "week";
  return "month";
}

function buildBuckets(rangeStart: Date, today: Date, granularity: Granularity): Bucket[] {
  if (granularity === "day") {
    const spanDays = Math.round((today.getTime() - rangeStart.getTime()) / 86_400_000) + 1;
    return Array.from({ length: spanDays }, (_, i) => {
      const d = new Date(rangeStart);
      d.setDate(d.getDate() + i);
      const end = new Date(d);
      end.setDate(end.getDate() + 1);
      const label = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
      return { key: localDateKey(d), label, tooltipLabel: label, start: d, end };
    });
  }

  if (granularity === "week") {
    // Step backward from "tomorrow" (exclusive end) in 7-day chunks until
    // the whole range is covered — anchored to today rather than calendar
    // ISO weeks, which keeps the math simple and the most recent bucket
    // always ending "now."
    const buckets: Bucket[] = [];
    let end = new Date(today);
    end.setDate(end.getDate() + 1);
    while (end.getTime() > rangeStart.getTime()) {
      const start = new Date(end);
      start.setDate(start.getDate() - 7);
      const label = start.toLocaleDateString(undefined, { month: "short", day: "numeric" });
      buckets.unshift({ key: localDateKey(start), label, tooltipLabel: `Week of ${label}`, start, end });
      end = start;
    }
    return buckets;
  }

  // month — actual calendar months, nicer labels for a multi-year "All"
  // view than 30-day rolling chunks would give.
  const buckets: Bucket[] = [];
  let cursor = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1);
  const endCursor = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  while (cursor.getTime() < endCursor.getTime()) {
    const next = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    const label = cursor.toLocaleDateString(undefined, { month: "short", year: "2-digit" });
    buckets.push({
      key: `${cursor.getFullYear()}-${cursor.getMonth()}`,
      label,
      tooltipLabel: cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" }),
      start: cursor,
      end: next,
    });
    cursor = next;
  }
  return buckets;
}

// Usage tab: pick a product, see how fast it's actually being consumed.
// Built on the stock movement log (storage.ts) rather than raw item
// quantity, since quantity alone can't tell restocks apart from usage.
export default function UsageTab({ items }: Props) {
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [rangeValue, setRangeValue] = useState<RangeValue>(30);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    setMovements(loadMovements());
  }, []);

  useEffect(() => {
    if (!selectedId && items.length) setSelectedId(items[0].id);
  }, [items, selectedId]);

  const selectedItem = items.find((it) => it.id === selectedId) || null;

  const earliestMovementDate = useMemo(() => {
    if (!selectedItem) return null;
    const relevant = movements.filter((m) => m.itemId === selectedItem.id);
    if (!relevant.length) return null;
    return startOfDay(new Date(Math.min(...relevant.map((m) => new Date(m.at).getTime()))));
  }, [movements, selectedItem]);

  const { buckets, granularity, spanDays } = useMemo(() => {
    const today = startOfDay(new Date());
    const rangeStart =
      rangeValue === "all"
        ? earliestMovementDate ?? today
        : (() => {
            const d = new Date(today);
            d.setDate(d.getDate() - (rangeValue - 1));
            return d;
          })();
    const span = Math.max(1, Math.round((today.getTime() - rangeStart.getTime()) / 86_400_000) + 1);
    const g = pickGranularity(span);
    return { buckets: buildBuckets(rangeStart, today, g), granularity: g, spanDays: span };
  }, [rangeValue, earliestMovementDate]);

  const usageByBucket = useMemo(() => {
    if (!selectedItem || !buckets.length) return [];
    const totals = new Map<string, number>(buckets.map((b) => [b.key, 0]));
    // Buckets are sorted and contiguous, so a linear scan from the front
    // (rather than re-scanning all buckets per movement) would be a fair
    // bit faster at very large history sizes — not worth the extra
    // complexity yet at this app's scale (thousands of movements, at most
    // a few hundred buckets even for "All" over several years).
    movements
      .filter((m) => m.itemId === selectedItem.id && m.delta < 0)
      .forEach((m) => {
        const t = new Date(m.at).getTime();
        const bucket = buckets.find((b) => t >= b.start.getTime() && t < b.end.getTime());
        if (bucket) totals.set(bucket.key, (totals.get(bucket.key) || 0) + Math.abs(m.delta));
      });
    return buckets.map((b) => ({ ...b, used: totals.get(b.key) || 0 }));
  }, [movements, selectedItem, buckets]);

  const totalUsed = usageByBucket.reduce((sum, d) => sum + d.used, 0);
  const avgPerDay = totalUsed / spanDays;
  const hasAnyMovementsForItem = selectedItem ? movements.some((m) => m.itemId === selectedItem.id) : false;
  const maxUsed = Math.max(1, ...usageByBucket.map((d) => d.used));
  const daysOfStockLeft = selectedItem && avgPerDay > 0 ? Math.round(selectedItem.quantity / avgPerDay) : null;
  const rangeLabel = rangeValue === "all" ? "all time" : `last ${rangeValue}d`;
  const chartUnitLabel = granularity === "day" ? "day" : granularity === "week" ? "week" : "month";

  return (
    <div className="mx-auto max-w-2xl px-4 pb-24 pt-5 sm:px-6">
      <div className="mb-4 flex items-center gap-2">
        <h1 className="text-lg font-semibold text-neutral-900">Usage</h1>
        <button
          onClick={() => setShowHelp((v) => !v)}
          aria-label="How is usage calculated?"
          className="text-neutral-400 hover:text-neutral-600"
        >
          <HelpCircle size={16} />
        </button>
      </div>

      {showHelp && (
        <div className="mb-4 space-y-2 rounded-xl2 border border-surface-border bg-white p-4 text-xs leading-relaxed text-neutral-600 shadow-card">
          <p>
            <span className="font-medium text-neutral-800">What counts as usage:</span> anything that removes stock —
            a scanned Remove, a manual quantity decrease, or an imported/pulled usage entry. Restocks (Add Stock,
            imports that increase quantity) never count toward usage.
          </p>
          <p>
            <span className="font-medium text-neutral-800">The numbers above the chart:</span> total used and avg/day
            are summed over whichever date range is selected below. "Stock left at this rate" divides the item's
            current quantity by that avg/day — it's a rough projection, not an alert or a guarantee.
          </p>
          <p>
            <span className="font-medium text-neutral-800">The chart's bars:</span> daily for ranges up to ~2 months,
            weekly up to about a year, monthly beyond that — so a bar never gets so thin it stops being readable.
          </p>
          <p>
            <span className="font-medium text-neutral-800">Editing usage in your Google Sheet:</span> if you've
            connected Google Sheets (see Settings → Google Sheets), every sync writes a "Usage" tab with one row per
            usage entry. You can fix a typo, correct a quantity or date, or delete a row you don't want tracked,
            directly in that sheet. Those changes only reach the app after you tap{" "}
            <span className="font-medium text-neutral-800">Pull from Sheet</span> — nothing you edit there takes
            effect until you pull. Adding a brand-new row (leave the "Sync ID" column blank) works too — it's picked
            up as a new usage entry on the next pull, matched to an item by its Barcode column.
          </p>
        </div>
      )}

      {items.length === 0 ? (
        <p className="rounded-xl2 border border-dashed border-surface-border bg-white p-6 text-center text-sm text-neutral-400">
          Add some inventory first, then usage trends will show up here.
        </p>
      ) : (
        <>
          <UsageImportPanel items={items} onImported={() => setMovements(loadMovements())} />

          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className="rounded-lg border border-surface-border px-3 py-2 text-sm text-neutral-800 focus:outline focus:outline-2 focus:outline-neutral-900 sm:max-w-[220px]"
            >
              {items.map((it) => (
                <option key={it.id} value={it.id}>
                  {it.name}
                </option>
              ))}
            </select>
            <div className="flex flex-wrap gap-1.5">
              {RANGE_OPTIONS.map((r) => (
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

          {!hasAnyMovementsForItem ? (
            <p className="rounded-xl2 border border-dashed border-surface-border bg-white p-6 text-center text-sm text-neutral-400">
              No usage history yet for {selectedItem?.name} — this starts tracking automatically as you scan stock
              in and out, so trends will build up over the next few days.
            </p>
          ) : (
            <>
              <div className="mb-4 grid grid-cols-3 gap-2.5 text-center">
                <div className="rounded-xl2 border border-surface-border bg-white p-3 shadow-card">
                  <p className="text-lg font-semibold text-neutral-900">
                    {totalUsed} <span className="text-xs font-normal text-neutral-400">{selectedItem?.unit}</span>
                  </p>
                  <p className="mt-0.5 text-[11px] text-neutral-500">used, {rangeLabel}</p>
                </div>
                <div className="rounded-xl2 border border-surface-border bg-white p-3 shadow-card">
                  <p className="text-lg font-semibold text-neutral-900">{avgPerDay.toFixed(1)}</p>
                  <p className="mt-0.5 text-[11px] text-neutral-500">avg / day</p>
                </div>
                <div className="rounded-xl2 border border-surface-border bg-white p-3 shadow-card">
                  <p
                    className={`text-lg font-semibold ${
                      daysOfStockLeft !== null && daysOfStockLeft <= 7 ? "text-accent-low" : "text-neutral-900"
                    }`}
                  >
                    {daysOfStockLeft !== null ? `~${daysOfStockLeft}d` : "—"}
                  </p>
                  <p className="mt-0.5 text-[11px] text-neutral-500">stock left at this rate</p>
                </div>
              </div>

              <div className="rounded-xl2 border border-surface-border bg-white p-4 shadow-card">
                <p className="mb-3 text-xs font-medium text-neutral-500">Units used per {chartUnitLabel}</p>
                <div className="relative flex h-[140px] items-end gap-[3px]">
                  {usageByBucket.map((d, i) => {
                    const heightPct = Math.max(2, (d.used / maxUsed) * 100);
                    return (
                      <div
                        key={d.key}
                        // h-full is load-bearing: the bar below sizes itself
                        // with a percentage height, which only resolves
                        // against an ancestor that has an explicit (not
                        // auto) height. Without this the bars silently
                        // collapse to 0px, since this wrapper is a
                        // content-sized flex item otherwise.
                        className="group relative h-full flex-1"
                        onMouseEnter={() => setHoverIdx(i)}
                        onMouseLeave={() => setHoverIdx((cur) => (cur === i ? null : cur))}
                      >
                        <div
                          className="absolute bottom-0 mx-auto w-full rounded-t-[3px] bg-neutral-900/80 transition-[height] duration-200"
                          style={{ height: `${heightPct}%` }}
                        />
                        {hoverIdx === i && (
                          <div className="pointer-events-none absolute -top-9 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-md bg-neutral-900 px-2 py-1 text-[11px] font-medium text-white shadow-card">
                            {d.tooltipLabel}: {d.used} {selectedItem?.unit}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="mt-2 flex justify-between text-[10px] text-neutral-400">
                  <span>{usageByBucket[0]?.label}</span>
                  <span>{usageByBucket[usageByBucket.length - 1]?.label}</span>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
