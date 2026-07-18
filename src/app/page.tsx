"use client";

import { useEffect, useState } from "react";
import { InventoryItem, AccessCheckResponse } from "@/lib/types";
import { loadItems, saveItems, getLinkedSheetId, setLinkedSheetId } from "@/lib/storage";
import BottomNav, { TabId } from "@/components/BottomNav";
import InventoryTab from "@/components/InventoryTab";
import ScanTab from "@/components/ScanTab";
import ReorderTab from "@/components/ReorderTab";
import SupportTab from "@/components/SupportTab";
import AccountTab from "@/components/AccountTab";
import LoadScreen from "@/components/LoadScreen";

// Minimum time to keep the load screen up, so its entrance animation
// (logo mark + label + progress fill) always gets to finish playing even
// when the actual data load (localStorage + access check) is instant.
const LOAD_SCREEN_MIN_MS = 1500;
const LOAD_SCREEN_FADE_MS = 300;

export default function HomePage() {
  const [tab, setTab] = useState<TabId>("inventory");
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [sheetId, setSheetIdState] = useState<string | null>(null);
  const [access, setAccess] = useState<AccessCheckResponse | null>(null);
  const [showLoadScreen, setShowLoadScreen] = useState(true);
  const [loadScreenExiting, setLoadScreenExiting] = useState(false);

  useEffect(() => {
    setItems(loadItems());
    setSheetIdState(getLinkedSheetId());
    fetch("/api/check-access")
      .then((r) => r.json())
      .then(setAccess)
      .catch(() => setAccess({ access: false }));
    const timer = setTimeout(() => setLoadScreenExiting(true), LOAD_SCREEN_MIN_MS);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!loadScreenExiting) return;
    const timer = setTimeout(() => setShowLoadScreen(false), LOAD_SCREEN_FADE_MS);
    return () => clearTimeout(timer);
  }, [loadScreenExiting]);

  useEffect(() => {
    if (items.length) saveItems(items);
  }, [items]);

  useEffect(() => {
    if (!access?.access && tab === "support") setTab("inventory");
  }, [access, tab]);

  const setSheetId = (id: string | null) => {
    setSheetIdState(id);
    setLinkedSheetId(id);
  };

  const upsertItem = (item: InventoryItem) => {
    setItems((prev) => {
      const idx = prev.findIndex((it) => it.id === item.id);
      if (idx === -1) return [...prev, item];
      const next = [...prev];
      next[idx] = item;
      return next;
    });
  };

  const adjust = (id: string, delta: number) => {
    setItems((prev) =>
      prev.map((it) =>
        it.id === id ? { ...it, quantity: Math.max(0, it.quantity + delta), updatedAt: new Date().toISOString() } : it
      )
    );
  };

  const deleteItem = (id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
  };

  const bulkImport = (imported: InventoryItem[]) => {
    setItems((prev) => {
      const byBarcode = new Map(prev.map((it) => [it.barcode || it.id, it]));
      imported.forEach((it) => byBarcode.set(it.barcode || it.id, { ...byBarcode.get(it.barcode || it.id), ...it }));
      return Array.from(byBarcode.values());
    });
  };

  const addStock = (input: {
    barcode: string;
    name: string;
    quantity: number;
    unit: string;
    pricePerUnit: number;
    location?: string;
  }) => {
    setItems((prev) => {
      const existing = prev.find((it) => it.barcode === input.barcode && input.barcode);
      if (existing) {
        return prev.map((it) =>
          it.id === existing.id
            ? {
                ...it,
                quantity: it.quantity + input.quantity,
                pricePerUnit: input.pricePerUnit || it.pricePerUnit,
                // Only overwrite the item's known location when this restock
                // actually specified one - leaving it blank shouldn't erase a
                // location that was already recorded on an earlier add.
                location: input.location ? input.location : it.location,
                updatedAt: new Date().toISOString(),
              }
            : it
        );
      }
      return [
        ...prev,
        {
          id: `item-${Date.now()}`,
          barcode: input.barcode,
          name: input.name,
          quantity: input.quantity,
          unit: input.unit,
          pricePerUnit: input.pricePerUnit,
          reorderAt: Math.max(1, Math.round(input.quantity * 0.25)),
          updatedAt: new Date().toISOString(),
          location: input.location,
        },
      ];
    });
  };

  const removeStock = (input: { barcode: string; quantity: number }) => {
    setItems((prev) =>
      prev.map((it) =>
        it.barcode === input.barcode
          ? { ...it, quantity: Math.max(0, it.quantity - (input.quantity || 1)), updatedAt: new Date().toISOString() }
          : it
      )
    );
  };

  return (
    <>
      {showLoadScreen && <LoadScreen exiting={loadScreenExiting} />}
      <main className="min-h-screen bg-surface-muted">
        <header className="sticky top-0 z-20 border-b border-surface-border bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/70">
          <div className="mx-auto flex max-w-2xl items-center gap-2 px-4 py-3 sm:px-6">
            <span className="text-lg" aria-hidden>
              📦
            </span>
            <span className="text-base font-semibold text-neutral-900">InventorySync</span>
          </div>
        </header>

        {tab === "inventory" && (
          <InventoryTab items={items} onAdjust={adjust} onSave={upsertItem} onDelete={deleteItem} onImport={bulkImport} />
        )}
        {tab === "scan" && <ScanTab items={items} onAddStock={addStock} onRemoveStock={removeStock} access={access} />}
        {tab === "reorder" && <ReorderTab items={items} />}
        {tab === "support" && access?.access && <SupportTab />}
        {tab === "account" && (
          <AccountTab items={items} onImport={bulkImport} sheetId={sheetId} setSheetId={setSheetId} access={access} />
        )}

        <BottomNav active={tab} onChange={setTab} supportUnlocked={Boolean(access?.access)} />
      </main>
    </>
  );
}
