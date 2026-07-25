"use client";

import { useEffect, useState } from "react";
import { Menu } from "lucide-react";
import { InventoryItem, AccessCheckResponse } from "@/lib/types";
import {
  loadItems,
  saveItems,
  getLinkedSheetId,
  setLinkedSheetId,
  logMovement,
  isFreshInstall,
  getTutorialCompleted,
  resetTutorialCompleted,
  getEditorName,
} from "@/lib/storage";
import { syncPushDigest } from "@/lib/pushReminders";
import BottomNav, { TabId } from "@/components/BottomNav";
import InventoryTab from "@/components/InventoryTab";
import ScanTab from "@/components/ScanTab";
import ReorderTab from "@/components/ReorderTab";
import UsageTab from "@/components/UsageTab";
import SupportTab from "@/components/SupportTab";
import VisitStatusTab from "@/components/VisitStatusTab";
import AccountSidebar from "@/components/AccountSidebar";
import LoadScreen from "@/components/LoadScreen";
import ClearCacheButton from "@/components/ClearCacheButton";
import Tooltip from "@/components/Tooltip";
import TutorialOverlay from "@/components/TutorialOverlay";
import InstallBanner from "@/components/InstallBanner";
import ThemeToggle from "@/components/ThemeToggle";
import SpotifyWidget from "@/components/SpotifyWidget";

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
  const [trackedBookingId, setTrackedBookingId] = useState<string | null>(null);
  const [tutorialActive, setTutorialActive] = useState(false);

  // If the matched booking gets cleared (e.g. Google sign-out) while the
  // customer is sitting on the Status tab, don't strand them on a tab that
  // no longer exists in the bar.
  useEffect(() => {
    if (!trackedBookingId && tab === "status") setTab("inventory");
  }, [trackedBookingId, tab]);

  useEffect(() => {
    // Has to be read before loadItems() below, which writes the seed data
    // the instant it finds ITEMS_KEY missing - that write is exactly the
    // signal this is checking for, so calling loadItems() first would
    // erase it before this ever saw it.
    const freshInstall = isFreshInstall();
    setItems(loadItems());
    setSheetIdState(getLinkedSheetId());
    if (freshInstall && !getTutorialCompleted()) setTutorialActive(true);
    fetch("/api/check-access")
      .then((r) => r.json())
      .then(setAccess)
      .catch(() => setAccess({ access: false }));
    const timer = setTimeout(() => setLoadScreenExiting(true), LOAD_SCREEN_MIN_MS);
    return () => clearTimeout(timer);
  }, []);

  // "Replay the welcome tour" (AccountTab, inside the Account sidebar) -
  // relaunches the walkthrough on demand regardless of whether it's
  // already been finished/skipped, or the inventory no longer looks
  // anything like the original 3 seed items. Resets to the tour's own
  // starting position (Inventory tab, sidebar closed) so it opens from a
  // consistent, known state rather than wherever the customer happened to
  // be sitting when they asked for it.
  const replayTutorial = () => {
    resetTutorialCompleted();
    setTab("inventory");
    setAccountOpen(false);
    setTutorialActive(true);
  };

  useEffect(() => {
    if (!loadScreenExiting) return;
    const timer = setTimeout(() => setShowLoadScreen(false), LOAD_SCREEN_FADE_MS);
    return () => clearTimeout(timer);
  }, [loadScreenExiting]);

  useEffect(() => {
    if (items.length) saveItems(items);
  }, [items]);

  // Keep the server-side reorder-reminder digest tracking real inventory as
  // it changes (syncPushDigest is a no-op unless this browser has actually
  // opted in — see pushReminders.ts). Debounced a few seconds so a burst of
  // rapid changes (hold-to-repeat on +/-, a bulk import) collapses into one
  // network write instead of one per tick.
  useEffect(() => {
    if (!items.length) return;
    const timer = setTimeout(() => void syncPushDigest(items), 4000);
    return () => clearTimeout(timer);
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
    // The logged delta is computed from `prev` inside the updater itself,
    // not from the `items` closed over when adjust() was called - a rapid
    // burst of taps (hold-to-repeat on +/-) fires several adjust() calls
    // before React re-renders, so every call after the first would
    // otherwise see the same stale pre-burst quantity and log the wrong
    // (or a duplicate) delta instead of the one actually applied on top of
    // whatever the previous call in the burst just did.
    let applied = 0;
    const editorName = getEditorName() ?? undefined;
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== id) return it;
        const nextQuantity = Math.max(0, it.quantity + delta);
        applied = nextQuantity - it.quantity;
        return { ...it, quantity: nextQuantity, updatedAt: new Date().toISOString(), lastEditedBy: editorName };
      })
    );
    if (applied !== 0) {
      logMovement({ itemId: id, delta: applied, reason: "manual-adjust", at: new Date().toISOString(), by: editorName });
    }
  };

  const deleteItem = (id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
  };

  const bulkImport = (imported: InventoryItem[]) => {
    const before = new Map(items.map((it) => [it.barcode || it.id, it]));
    const editorName = getEditorName() ?? undefined;
    setItems((prev) => {
      const byBarcode = new Map(prev.map((it) => [it.barcode || it.id, it]));
      imported.forEach((it) =>
        byBarcode.set(it.barcode || it.id, {
          ...byBarcode.get(it.barcode || it.id),
          ...it,
          lastEditedBy: editorName,
        })
      );
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
        logMovement({ itemId: prevItem.id, delta, reason: "import", at: new Date().toISOString(), by: editorName });
      }
    });
  };

  // Shared merge key for addStock below: prefer matching by barcode (the
  // normal path), but a scan that never got a barcode - camera failed,
  // manual receipt entry, an item that just doesn't have one - still needs
  // *some* way to accumulate into the same row on repeat adds instead of
  // spawning a fresh duplicate every time. Falling back to an exact
  // name+location match (case-insensitive) covers the common "typed the
  // same item in twice" case without risking merging two genuinely
  // different barcodeless items that just happen to share a name in
  // different locations.
  const findMatchingItem = (
    list: InventoryItem[],
    input: { barcode: string; name: string; location?: string }
  ): InventoryItem | undefined => {
    if (input.barcode) return list.find((it) => it.barcode === input.barcode);
    const name = input.name.trim().toLowerCase();
    if (!name) return undefined;
    const location = (input.location || "").trim().toLowerCase();
    return list.find(
      (it) => !it.barcode && it.name.trim().toLowerCase() === name && (it.location || "").trim().toLowerCase() === location
    );
  };

  const addStock = (input: {
    barcode: string;
    name: string;
    quantity: number;
    unit: string;
    pricePerUnit: number;
    location?: string;
  }) => {
    const existing = findMatchingItem(items, input);
    const itemId = existing ? existing.id : `item-${Date.now()}`;
    const editorName = getEditorName() ?? undefined;
    setItems((prev) => {
      const existingInPrev = findMatchingItem(prev, input);
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
                lastEditedBy: editorName,
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
          lastEditedBy: editorName,
        },
      ];
    });
    logMovement({ itemId, delta: input.quantity, reason: "scan-add", at: new Date().toISOString(), by: editorName });
  };

  // Breaks down N units of a case/pack item into its linked each-level
  // item (see breaksDownIntoBarcode/breaksDownIntoQty on InventoryItem).
  // Per the customer's explicit choice: this is a manual action (not
  // automatic on receiving a shipment), and the case side is logged as
  // real removed stock — not a no-op transfer — so its reorder threshold
  // and usage history reflect that cases actually left the "still sealed"
  // count, giving the customer the same "time to reorder more cases"
  // signal any other stock removal would.
  const breakCase = (caseItemId: string, casesToBreak: number) => {
    const caseItem = items.find((it) => it.id === caseItemId);
    if (!caseItem || !caseItem.breaksDownIntoBarcode || !caseItem.breaksDownIntoQty) return;
    const eachItem = items.find((it) => it.barcode === caseItem.breaksDownIntoBarcode);
    if (!eachItem) return;
    const n = Math.max(0, Math.min(Math.round(casesToBreak) || 0, caseItem.quantity));
    if (n <= 0) return;
    const addedEaches = n * caseItem.breaksDownIntoQty;
    const now = new Date().toISOString();
    const editorName = getEditorName() ?? undefined;
    setItems((prev) =>
      prev.map((it) => {
        if (it.id === caseItem.id) return { ...it, quantity: it.quantity - n, updatedAt: now, lastEditedBy: editorName };
        if (it.id === eachItem.id)
          return { ...it, quantity: it.quantity + addedEaches, updatedAt: now, lastEditedBy: editorName };
        return it;
      })
    );
    logMovement({ itemId: caseItem.id, delta: -n, reason: "break-case", at: now, by: editorName });
    logMovement({ itemId: eachItem.id, delta: addedEaches, reason: "break-case", at: now, by: editorName });
  };

  // Returns whether anything was actually removed - false for "no item in
  // this inventory has that barcode" (the caller uses this to decide
  // whether removal actually happened, rather than always reporting
  // success back to the customer regardless of whether stock moved).
  const removeStock = (input: { barcode: string; quantity: number }): boolean => {
    const requested = Math.max(0, Math.floor(input.quantity));
    const existing = items.find((it) => it.barcode === input.barcode);
    if (!existing || requested <= 0) return false;
    const editorName = getEditorName() ?? undefined;
    setItems((prev) =>
      prev.map((it) =>
        it.barcode === input.barcode
          ? { ...it, quantity: Math.max(0, it.quantity - requested), updatedAt: new Date().toISOString(), lastEditedBy: editorName }
          : it
      )
    );
    const removed = Math.min(requested, existing.quantity);
    if (removed > 0) {
      logMovement({ itemId: existing.id, delta: -removed, reason: "scan-remove", at: new Date().toISOString(), by: editorName });
    }
    return true;
  };

  return (
    <>
      {showLoadScreen && <LoadScreen exiting={loadScreenExiting} />}
      <main className="min-h-screen bg-surface-muted">
        <header className="sticky top-0 z-20 border-b border-surface-border bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/70">
          <div className="mx-auto flex max-w-2xl items-center justify-between gap-2 px-4 py-3 sm:px-6">
            <button
              onClick={() => setTab("scan")}
              aria-label="Go to Scan tab"
              className="flex items-center gap-2 rounded-lg -m-1 p-1 hover:opacity-70"
            >
              <span className="text-lg" aria-hidden>
                📦
              </span>
              <span className="text-base font-semibold text-neutral-900">WS Inventory Management</span>
            </button>
            <div className="flex items-center gap-1">
              <ThemeToggle />
              <ClearCacheButton />
              <Tooltip label="Account & settings" side="bottom">
                <button
                  onClick={() => setAccountOpen(true)}
                  aria-label="Open account settings"
                  data-tutorial="account-gear"
                  className="rounded-lg p-1.5 text-neutral-500 hover:bg-surface-muted"
                >
                  <Menu size={20} />
                </button>
              </Tooltip>
            </div>
          </div>
        </header>

        {tab === "inventory" && (
          <InventoryTab
            items={items}
            onAdjust={adjust}
            onSave={upsertItem}
            onDelete={deleteItem}
            onImport={bulkImport}
            onBreakCase={breakCase}
          />
        )}
        {tab === "scan" && (
          <ScanTab
            items={items}
            onAddStock={addStock}
            onRemoveStock={removeStock}
            access={access}
            onSaveItem={upsertItem}
            onDeleteItem={deleteItem}
          />
        )}
        {tab === "reorder" && <ReorderTab items={items} />}
        {tab === "usage" && <UsageTab items={items} onSave={upsertItem} />}
        {tab === "support" && <SupportTab />}
        {tab === "status" && trackedBookingId && <VisitStatusTab bookingId={trackedBookingId} />}

        <AccountSidebar
          open={accountOpen}
          onClose={() => setAccountOpen(false)}
          items={items}
          onImport={bulkImport}
          sheetId={sheetId}
          setSheetId={setSheetId}
          access={access}
          onBookingMatch={setTrackedBookingId}
          onReplayTutorial={replayTutorial}
        />

        {/* Suppressed while the tutorial is active - the overlay already
            dims/spotlights the screen, and the install banner popping up
            mid-tour (it polls independently on its own timer) would either
            get hidden behind the tutorial's dimming layer or sit awkwardly
            on top of a callout, competing for the same bottom-of-screen
            attention as the tour's own "Next" card. */}
        <InstallBanner suppressed={tutorialActive} />

        {/* Same reasoning as InstallBanner above - stays out of the way
            while the tour has the screen's attention. */}
        <SpotifyWidget suppressed={tutorialActive} />

        <BottomNav active={tab} onChange={setTab} showStatusTab={!!trackedBookingId} />

        {/* Gated on !showLoadScreen so the tour never stacks on top of the
            opening animation - tutorialActive can flip true well before
            that finishes exiting. */}
        {tutorialActive && !showLoadScreen && (
          <TutorialOverlay
            tab={tab}
            setTab={setTab}
            accountOpen={accountOpen}
            setAccountOpen={setAccountOpen}
            sheetId={sheetId}
            onClose={() => setTutorialActive(false)}
          />
        )}
      </main>
    </>
  );
}
