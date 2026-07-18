"use client";

import { useEffect, useState } from "react";
import { Settings } from "lucide-react";
import { InventoryItem, AccessCheckResponse } from "@/lib/types";
import { loadItems, saveItems, getLinkedSheetId, setLinkedSheetId, logMovement } from "@/lib/storage";
import BottomNav, { TabId } from "@/components/BottomNav";
import InventoryTab from "@/components/InventoryTab";
import ScanTab from "@/components/ScanTab";
import ReorderTab from "@/components/ReorderTab";
import UsageTab from "@/components/UsageTab";
import SupportTab from "@/components/SupportTab";
import AccountSidebar from "@/components/AccountSidebar";
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
  const [accountOpen, setAccountOpen] = useState(false);

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
    const current = items.find((it) => it.id === id);
    setItems((prev) =>
      prev.map((it) =>
        it.id === id ? { ...it, quantity: Math.max(0, it.quantity + delta), updatedAt: new Date().toISOString() } : it
      )
    );
    if (current) {
      const applied = Math.max(0, current.quantity + delta) - current.quantity;
      if (applied !== 0) {
        logMovement({ itemId: id, delta: applied, reason: "manual-adjust", at: new Date().toISOString() });
      }
    }
  };

  const deleteItem = (id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
  };

  const bulkImport = (imported: InventoryItem[]) => {
    const before = new Map(items.map((it) => [it.barcode || it.id, it]));
    setItems((prev) => {
      const byBarcode = new Map(prev.map((it) => [it.barcode || it.id, it]));
      imported.forEach((it) => byBarcode.set(it.barcode || it.id, { ...byBarcode.get(it.barcode || it.id), ...it }));
      return Array.from(byBarcode.values());
    });
    // Only log a movement for items that already existed - a freshly
    // imported item has no prior quantity to diff against, so usage
    // tracking for it just starts from here.
    imported.forEach((it) => {
      const prevItem = before.get(it.barcode || it.id);
      if (!prevItem) return;
      const delta = it.quantity - prevItem.quantity;
      if (delta !== 0) {
        logMovement({ itemId: prevItem.id, delta, reason: "import", at: new Date().toISOString() });
      }
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
    const existing = items.find((it) => it.barcode === input.barcode && input.barcode);
    const itemId = existing ? existing.id : `item-${Date.now()}`;
    setItems((prev) => {
      const existingInPrev = prev.find((it) => it.barcode === input.barcode && input.barcode);
      if (existingInPrev) {
        return prev.map((it) =>
          it.id === existingInPrev.id
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
          id: itemId,
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
    logMovement({ itemId, delta: input.quantity, reason: "scan-add", at: new Date().toISOString() });
  };

  const removeStock = (input: { barcode: string; quantity: number }) => {
    const existing = items.find((it) => it.barcode === input.barcode);
    setItems((prev) =>
      prev.map((it) =>
        it.barcode === input.barcode
          ? { ...it, quantity: Math.max(0, it.quantity - (input.quantity || 1)), updatedAt: new Date().toISOString() }
          : it
      )
    );
    if (existing) {
      const removed = Math.min(input.quantity || 1, existing.quantity);
      if (removed > 0) {
        logMovement({ itemId: existing.id, delta: -removed, reason: "scan-remove", at: new Date().toISOString() });
      }
    }
  };

  return (
    <>
      {showLoadScreen && <LoadScreen exiting={loadScreenExiting} />}
      <main className="min-h-screen bg-surface-muted">
        <header className="sticky top-0 z-20 border-b border-surface-border bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/70">
          <div className="mx-auto flex max-w-2xl items-center justify-between gap-2 px-4 py-3 sm:px-6">
            <div className="flex items-center gap-2">
              <span className="text-lg" aria-hidden>
                📦
              </span>
              <span className="text-base font-semibold text-neutral-900">WS Inventory Management</span>
            </div>
            <button
              onClick={() => setAccountOpen(true)}
              aria-label="Open account settings"
              className="rounded-lg p-1.5 text-neutral-500 hover:bg-surface-muted"
            >
              <Settings size={20} />
            </button>
          </div>
        </header>

        {tab === "inventory" && (
          <InventoryTab items={items} onAdjust={adjust} onSave={upsertItem} onDelete={deleteItem} onImport={bulkImport} />
        )}
        {tab === "scan" && <ScanTab items={items} onAddStock={addStock} onRemoveStock={removeStock} access={access} />}
        {tab === "reorder" && <ReorderTab items={items} />}
        {tab === "usage" && <UsageTab items={items} />}
        {tab === "support" && <SupportTab />}

        <AccountSidebar
          open={accountOpen}
          onClose={() => setAccountOpen(false)}
          items={items}
          onImport={bulkImport}
          sheetId={sheetId}
          setSheetId={setSheetId}
          access={access}
        />

        <BottomNav active={tab} onChange={setTab} />
      </main>
    </>
  );
}
