"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { InventoryItem } from "@/lib/types";
import { getKnownLocations } from "@/lib/locations";
import ItemCard from "./ItemCard";
import ItemEditModal from "./ItemEditModal";
import ImportExportPanel from "./ImportExportPanel";

interface Props {
  items: InventoryItem[];
  onAdjust: (id: string, delta: number) => void;
  onSave: (item: InventoryItem) => void;
  onDelete: (id: string) => void;
  onImport: (items: InventoryItem[]) => void;
}

export default function InventoryTab({ items, onAdjust, onSave, onDelete, onImport }: Props) {
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<InventoryItem | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (it) =>
        it.name.toLowerCase().includes(q) ||
        it.barcode.toLowerCase().includes(q) ||
        (it.location || "").toLowerCase().includes(q)
    );
  }, [items, query]);

  const locations = useMemo(() => getKnownLocations(items), [items]);

  return (
    <div className="mx-auto max-w-2xl px-4 pb-24 pt-5 sm:px-6">
      <h1 className="mb-4 flex items-center gap-2 text-lg font-semibold text-neutral-900">
        <span aria-hidden>📦</span> Inventory
      </h1>

      <ImportExportPanel items={items} onImport={onImport} />

      <div className="mb-3 mt-4 flex items-center gap-2 rounded-xl2 border border-surface-border bg-white px-3 py-2 shadow-card">
        <Search size={16} className="text-neutral-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search items..."
          className="w-full bg-transparent text-sm outline-none placeholder:text-neutral-400"
        />
      </div>

      <p className="mb-3 text-xs text-neutral-500">
        {filtered.length} item{filtered.length === 1 ? "" : "s"} · tap ✏️ to edit · ± to adjust stock
      </p>

      <div className="space-y-2.5">
        {filtered.map((item) => (
          <ItemCard key={item.id} item={item} onAdjust={onAdjust} onEdit={setEditing} />
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
