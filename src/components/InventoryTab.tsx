"use client";

import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { InventoryItem } from "@/lib/types";
import { getKnownLocations } from "@/lib/locations";
import { InventorySort, getInventorySort, setInventorySort } from "@/lib/storage";
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
    const sorted = [...base];
    if (sort === "name") {
      sorted.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sort === "low-stock") {
      // Biggest deficit (reorderAt - quantity) first, so whatever needs
      // reordering most urgently surfaces at the top of the list.
      sorted.sort((a, b) => b.reorderAt - b.quantity - (a.reorderAt - a.quantity));
    } else {
      // "recent" (default): most recently changed or scanned first.
      sorted.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
    }
    return sorted;
  }, [items, query, sort]);

  const locations = useMemo(() => getKnownLocations(items), [items]);

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

      <div className="space-y-2.5">
        {filtered.map((item, index) => (
          <ItemCard
            key={item.id}
            item={item}
            items={items}
            onAdjust={onAdjust}
            onEdit={setEditing}
            onDelete={onDelete}
            onBreakCase={onBreakCase}
            tutorialTarget={index === 0}
          />
        ))}
        {filtered.length === 0 && (
          <p className="rounded-xl2 border border-dashed border-surface-border bg-white p-6 text-center text-sm text-neutral-400">
            No items match "{query}".
          </p>
        )}
      </div>

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
