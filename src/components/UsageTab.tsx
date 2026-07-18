"use client";

import { useEffect, useMemo, useState } from "react";
import { InventoryItem, StockMovement } from "@/lib/types";
import { loadMovements } from "@/lib/storage";

interface Props {
  items: InventoryItem[];
}

const RANGE_OPTIONS = [7, 14, 30] as const;
type RangeDays = (typeof RANGE_OPTIONS)[number];

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

// Usage tab: pick a product, see how fast it's actually being consumed.
// Built on the stock movement log (storage.ts) rather than raw item
// quantity, since quantity alone can't tell restocks apart from usage.
export default function UsageTab({ items }: Props) {
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [rangeDays, setRangeDays] = useState<RangeDays>(14);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  useEffect(() => {
    setMovements(loadMovements());
  }, []);

  useEffect(() => {
    if (!selectedId && items.length) setSelectedId(items[0].id);
  }, [items, selectedId]);

  const selectedItem = items.find((it) => it.id === selectedId) || null;

  const days = useMemo(() => {
    const today = startOfDay(new Date());
    return Array.from({ length: rangeDays }, (_, i) => {
      const d = new Date(today);
      d.setDate(d.getDate() - (rangeDays - 1 - i));
      return d;
    });
  }, [rangeDays]);

  const usageByDay = useMemo(() => {
    if (!selectedItem) return [];
    const totals = new Map<string, number>();
    days.forEach((d) => totals.set(localDateKey(d), 0));
    movements
      .filter((m) => m.itemId === selectedItem.id && m.delta < 0)
      .forEach((m) => {
        const key = localDateKey(new Date(m.at));
        if (totals.has(key)) totals.set(key, (totals.get(key) || 0) + Math.abs(m.delta));
      });
    return days.map((d) => ({
      date: d,
      key: localDateKey(d),
      used: totals.get(localDateKey(d)) || 0,
    }));
  }, [movements, selectedItem, days]);

  const totalUsed = usageByDay.reduce((sum, d) => sum + d.used, 0);
  const avgPerDay = totalUsed / rangeDays;
  const hasAnyMovementsForItem = selectedItem ? movements.some((m) => m.itemId === selectedItem.id) : false;
  const maxUsed = Math.max(1, ...usageByDay.map((d) => d.used));
  const daysOfStockLeft = selectedItem && avgPerDay > 0 ? Math.round(selectedItem.quantity / avgPerDay) : null;

  return (
    <div className="mx-auto max-w-2xl px-4 pb-24 pt-5 sm:px-6">
      <h1 className="mb-4 text-lg font-semibold text-neutral-900">Usage</h1>

      {items.length === 0 ? (
        <p className="rounded-xl2 border border-dashed border-surface-border bg-white p-6 text-center text-sm text-neutral-400">
          Add some inventory first, then usage trends will show up here.
        </p>
      ) : (
        <>
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
            <div className="flex gap-1.5">
              {RANGE_OPTIONS.map((r) => (
                <button
                  key={r}
                  onClick={() => setRangeDays(r)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
                    rangeDays === r
                      ? "border-neutral-900 bg-neutral-900 text-white"
                      : "border-surface-border text-neutral-600 hover:bg-surface-muted"
                  }`}
                >
                  {r}d
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
                  <p className="mt-0.5 text-[11px] text-neutral-500">used, last {rangeDays}d</p>
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
                <p className="mb-3 text-xs font-medium text-neutral-500">Units used per day</p>
                <div className="relative flex h-[140px] items-end gap-[3px]">
                  {usageByDay.map((d, i) => {
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
                            {d.date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}: {d.used}{" "}
                            {selectedItem?.unit}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="mt-2 flex justify-between text-[10px] text-neutral-400">
                  <span>{days[0].toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
                  <span>
                    {days[days.length - 1].toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  </span>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
