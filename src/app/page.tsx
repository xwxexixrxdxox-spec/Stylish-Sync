"use client";

import { useEffect, useRef, useState } from "react";
import { Compass, Menu, X, Check } from "lucide-react";
import { InventoryItem } from "@/lib/types";
import {
  loadItems,
  saveItems,
  getLinkedSheetId,
  setLinkedSheetId,
  logMovement,
  loadMovements,
  replaceMovements,
  resetTutorialCompleted,
  getEditorName,
  isFreshInstall,
  getTutorialCompleted,
  getTourInviteDismissed,
  setTourInviteDismissed,
} from "@/lib/storage";
import { itemMergeKey, countByBarcode } from "@/lib/itemMatch";
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

// How long the Undo chip stays offered after a stepper adjustment, and how
// long a follow-up tap on the same item still counts as part of the same
// correction rather than a new one. Both jobs deliberately share one number:
// the thing a customer can still see is exactly the thing they can still
// take back, so the chip never quietly stops meaning what it says. Ten
// seconds is long enough to notice "that's one too many" and act, short
// enough that the chip isn't still sitting there hours later offering to
// rewrite a count someone has since worked from.
const ADJUST_UNDO_WINDOW_MS = 10_000;

export default function HomePage() {
  const [tab, setTab] = useState<TabId>("inventory");
  const [items, setItemsState] = useState<InventoryItem[]>([]);
  // A synchronous mirror of `items`, and the thing every write goes through
  // (setItems below). This exists because of a real, reproducible bug:
  // handing a function to a React state setter does NOT mean that function
  // runs there and then. React only evaluates an updater eagerly while the
  // component has no other work already scheduled; the moment anything else
  // on this component has queued an update in the same tick, the updater is
  // deferred to the next render instead. Every +/- tap schedules several
  // updates at once (the stepper's own badge, the activity ping, the
  // quantity itself), so on a fast double tap - and on every tick of
  // hold-to-repeat - a pattern like
  //
  //     let applied = 0;
  //     setItems((prev) => { applied = ...; return next; });
  //     if (applied !== 0) logMovement(...);        // <- never ran
  //
  // silently skipped both the StockMovement and the Undo offer while the
  // quantity itself still changed. Verified live: two taps in one tick moved
  // an item from 6 to 8, wrote zero movement entries, and showed no Undo
  // chip - stock leaving the shelf with nothing on the Usage tab to show for
  // it, and no way to take it back. Reading and writing through a ref makes
  // the newest list available in the same tick it was produced, which is
  // what the logging actually needs.
  const itemsRef = useRef<InventoryItem[]>([]);
  itemsRef.current = items;

  // Applies a change to the live list and hands back both the list it
  // replaced and the list it produced, so a delta can be logged immediately
  // rather than hoped for. Everything writes through here rather than
  // setItemsState - a functional updater that slipped past the ref would put
  // the mirror behind again for whatever ran next in the same tick.
  const setItems = (next: InventoryItem[] | ((prev: InventoryItem[]) => InventoryItem[])) => {
    const prev = itemsRef.current;
    const value = typeof next === "function" ? (next as (p: InventoryItem[]) => InventoryItem[])(prev) : next;
    itemsRef.current = value;
    setItemsState(value);
    return { prev, next: value };
  };
  const [sheetId, setSheetIdState] = useState<string | null>(null);
  const [showLoadScreen, setShowLoadScreen] = useState(true);
  const [loadScreenExiting, setLoadScreenExiting] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [trackedBookingId, setTrackedBookingId] = useState<string | null>(null);
  const [tutorialActive, setTutorialActive] = useState(false);
  // The tour's currently-showing step id, mirrored up from TutorialOverlay
  // (see its onStepChange prop) so a couple of real features can be
  // tutorial-aware without TutorialOverlay needing to know anything about
  // them: ClearCacheButton goes dud for the tutorial's whole duration
  // (below), and UsageTab narrows its overview list to one item only
  // while the "usage" step specifically is showing.
  const [tutorialStepId, setTutorialStepId] = useState<string | null>(null);
  // The first-visit "New here? Take the tour" chip. Nothing in the app used
  // to announce that a guided tour existed at all - the only way in was the
  // compass icon in the header, which reads as "explore" to someone who has
  // never seen this app before. The chip is the invitation; it is shown once,
  // to a genuinely new customer, and never returns once it's been answered
  // either way.
  const [showTourInvite, setShowTourInvite] = useState(false);
  // Shown for a few seconds after the tour reaches its last step, so the
  // walkthrough ends on "you're done, here's what to do next" rather than
  // just vanishing mid-thought.
  const [tourFinished, setTourFinished] = useState(false);

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
    const fresh = isFreshInstall();
    setShowTourInvite(
      fresh && !getTutorialCompleted() && !getTourInviteDismissed(),
    );
    setItems(loadItems());
    setSheetIdState(getLinkedSheetId());
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

  // Both ways out of the invitation chip mark it answered, so it never
  // appears a second time. Taking the tour counts as an answer too - if the
  // customer bails on step 3 we don't want the chip waiting for them when
  // they get back; the compass in the header is there for a second attempt.
  const acceptTourInvite = () => {
    setTourInviteDismissed();
    setShowTourInvite(false);
    setTourFinished(false);
    setTab("inventory");
    setAccountOpen(false);
    setTutorialActive(true);
  };

  const dismissTourInvite = () => {
    setTourInviteDismissed();
    setShowTourInvite(false);
  };

  useEffect(() => {
    if (!loadScreenExiting) return;
    const timer = setTimeout(() => setShowLoadScreen(false), LOAD_SCREEN_FADE_MS);
    return () => clearTimeout(timer);
  }, [loadScreenExiting]);

  // Clears itself so finishing the tour doesn't leave one last thing to
  // close. Long enough to read twice; the X is there for anyone faster.
  useEffect(() => {
    if (!tourFinished) return;
    const timer = setTimeout(() => setTourFinished(false), 9000);
    return () => clearTimeout(timer);
  }, [tourFinished]);

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
    // The quantity delta is diffed against the list as it stands right now
    // (setItems's `prev`), not against the `items` this closure captured
    // when upsertItem() was called. Needed so a customer correcting a count
    // through the full Edit item modal (the Quantity field) logs a movement
    // too, the same way the +/- stepper and tap-to-edit chip already do via
    // adjust() - previously this path updated `quantity` with no
    // StockMovement at all, so the Usage tab could show zero usage for an
    // item a customer had visibly used and corrected by hand.
    const { prev } = setItems((current) => {
      const idx = current.findIndex((it) => it.id === item.id);
      if (idx === -1) return [...current, item];
      const next = [...current];
      next[idx] = item;
      return next;
    });
    const before = prev.find((it) => it.id === item.id);
    const delta = before ? item.quantity - before.quantity : 0;
    if (delta !== 0) {
      logMovement({ itemId: item.id, delta, reason: "manual-adjust", at: new Date().toISOString(), by: item.lastEditedBy });
    }
  };

  // The most recent stepper adjustment, while it's still take-back-able.
  // `net` is the burst summed so far and `movementIds` every log entry that
  // burst produced, because undoing has to remove those entries rather than
  // log a compensating one - a customer who tapped + one too many times
  // never used that unit, and a +1/-1 pair left in the log would show on the
  // Usage tab as real activity that never happened.
  const [lastAdjust, setLastAdjust] = useState<{
    itemId: string;
    net: number;
    movementIds: string[];
    at: number;
  } | null>(null);

  const undoLastAdjust = () => {
    const undo = lastAdjust;
    if (!undo) return;
    if (undo.net !== 0) {
      setItems((prev) =>
        prev.map((it) =>
          it.id === undo.itemId
            ? { ...it, quantity: Math.max(0, it.quantity - undo.net), updatedAt: new Date().toISOString() }
            : it
        )
      );
    }
    if (undo.movementIds.length) {
      const ids = new Set(undo.movementIds);
      replaceMovements(loadMovements().filter((m) => !ids.has(m.id)));
    }
    setLastAdjust(null);
  };

  // Retire the offer once the window has passed, so the chip doesn't sit
  // there indefinitely offering to rewrite a count someone has since worked
  // from. Held open for the whole guided tour, though: the tour narrates
  // this control, and a chip that vanished mid-sentence would leave the
  // narration pointing at nothing.
  useEffect(() => {
    if (!lastAdjust || tutorialActive) return;
    const timer = window.setTimeout(() => setLastAdjust(null), ADJUST_UNDO_WINDOW_MS);
    return () => window.clearTimeout(timer);
  }, [lastAdjust, tutorialActive]);

  // Start Fresh's tutorial-safe path (see AccountTab's startFreshLocalInventory).
  // Storage has already been emptied by the time this runs; all that's left is
  // to bring this component's copy in line without a reload, which would take
  // the tour overlay with it. Safe against the persist effect below, which
  // deliberately skips empty arrays — storage is already [] and stays that way,
  // so the two agree.
  const clearInventoryInPlace = () => {
    setItems([]);
    setLastAdjust(null);
  };

  const adjust = (id: string, delta: number) => {
    // The logged delta is diffed against the list as it stands right now,
    // not against the `items` closed over when adjust() was called - a rapid
    // burst of taps (a fast double tap, or hold-to-repeat on +/-) fires
    // several adjust() calls before React re-renders, so every call after
    // the first would otherwise see the same stale pre-burst quantity and
    // log the wrong (or a duplicate) delta instead of the one actually
    // applied on top of whatever the previous call in the burst just did.
    // `applied` rather than `delta` because the quantity is clamped at zero:
    // tapping minus on an item already at 0 changes nothing, and logging a
    // -1 there would invent usage that never happened.
    const editorName = getEditorName() ?? undefined;
    const target = itemsRef.current.find((it) => it.id === id);
    if (!target) return;
    const nextQuantity = Math.max(0, target.quantity + delta);
    const applied = nextQuantity - target.quantity;
    if (applied !== 0) {
      setItems((prev) =>
        prev.map((it) =>
          it.id === id
            ? { ...it, quantity: nextQuantity, updatedAt: new Date().toISOString(), lastEditedBy: editorName }
            : it
        )
      );
      const movementId = logMovement({
        itemId: id,
        delta: applied,
        reason: "manual-adjust",
        at: new Date().toISOString(),
        by: editorName,
      });
      const now = Date.now();
      setLastAdjust((prev) => {
        // A hold-to-repeat burst is one correction in the customer's head,
        // so keep folding taps on the same item into a single offer while
        // the window is open rather than replacing it each time - otherwise
        // undoing a run of seven would take seven taps.
        const continuing = prev && prev.itemId === id && now - prev.at < ADJUST_UNDO_WINDOW_MS;
        const movementIds = continuing ? [...prev.movementIds] : [];
        if (movementId) movementIds.push(movementId);
        return { itemId: id, net: (continuing ? prev.net : 0) + applied, movementIds, at: now };
      });
    }
  };

  const deleteItem = (id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
  };

  const bulkImport = (imported: InventoryItem[]) => {
    // Merge key: barcode alone when it's unambiguous on both sides (0 or 1
    // row using it, in the current inventory AND in the incoming batch) -
    // this is the common case, and it's what lets a customer relocate an
    // item by editing its Location field (or the cell directly in their
    // Google Sheet) and have it still merge into the same row rather than
    // spawn a duplicate. Only once a barcode genuinely has 2+ rows on
    // either side (Phase 4 - the same product tracked at more than one
    // location) does location become part of the key, so those rows merge
    // into their own matching row instead of one collapsing into the
    // other - the exact "does the pull/merge logic silently collapse two
    // same-barcode rows into one" risk flagged when this feature was
    // planned.
    const localCounts = countByBarcode(items);
    const importedCounts = countByBarcode(imported);
    const keyFor = (it: Pick<InventoryItem, "barcode" | "location" | "id">) => {
      const bc = it.barcode.trim();
      if (!bc) return it.id;
      const ambiguous = (localCounts.get(bc) ?? 0) > 1 || (importedCounts.get(bc) ?? 0) > 1;
      return ambiguous ? itemMergeKey(bc, it.location) : bc;
    };

    const before = new Map(items.map((it) => [keyFor(it), it]));
    const editorName = getEditorName() ?? undefined;
    setItems((prev) => {
      const byKey = new Map(prev.map((it) => [keyFor(it), it]));
      imported.forEach((it) => {
        const key = keyFor(it);
        byKey.set(key, {
          ...byKey.get(key),
          ...it,
          lastEditedBy: editorName,
        });
      });
      return Array.from(byKey.values());
    });
    // Only log a movement for items that already existed - a freshly
    // imported item has no prior quantity to diff against, so usage
    // tracking for it just starts from here.
    imported.forEach((it) => {
      const prevItem = before.get(keyFor(it));
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
    if (input.barcode) {
      const matches = list.filter((it) => it.barcode === input.barcode);
      const loc = (input.location || "").trim().toLowerCase();
      if (!loc) {
        // No location was given on this add/scan - fall back to "the one
        // row this barcode has" regardless of what location THAT row
        // happens to carry (unchanged pre-Phase4 behavior, for a customer
        // who's never touched locations at all). With 2+ rows already
        // split across locations, a blank location can't say which one
        // this belongs to, so this deliberately does not guess - the Scan
        // tab's "existing-multi" picker (see ScanTab.tsx) is what's
        // supposed to force a choice before addStock/removeStock are ever
        // called with a blank location in that case.
        return matches.length === 1 ? matches[0] : undefined;
      }
      // A location WAS given - it's the authoritative signal for which row
      // this is, even when this barcode currently has only one row. This
      // is deliberately NOT "match the one row regardless of location":
      // that used to mean scanning the same barcode at a brand-new second
      // location (e.g. moving from "Sports Locker 1" to "Sports Locker 2"
      // with the same foot-spray barcode) silently matched the Locker-1
      // row anyway, overwrote its location to Locker 2, and added the two
      // quantities together into one row - the opposite of what
      // per-location tracking is for. A given location only ever matches a
      // row that's actually already at that location; anything else falls
      // through to the caller creating a fresh row for it.
      return matches.find((it) => (it.location || "").trim().toLowerCase() === loc);
    }
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
  const removeStock = (input: { barcode: string; quantity: number; location?: string }): boolean => {
    const requested = Math.max(0, Math.floor(input.quantity));
    if (requested <= 0) return false;
    const matches = items.filter((it) => it.barcode === input.barcode);
    if (matches.length === 0) return false;
    // Same rule as findMatchingItem above: a blank location falls back to
    // "the one row" only when there's exactly one; a location that WAS
    // given is authoritative regardless of how many rows exist, and only
    // matches a row actually at that location - never "the one row,
    // whichever location it happens to be at." See findMatchingItem's
    // comment for the real bug this fixes (removing from the wrong
    // location's row instead of reporting no match).
    const loc = (input.location || "").trim().toLowerCase();
    const existing = loc
      ? matches.find((it) => (it.location || "").trim().toLowerCase() === loc)
      : matches.length === 1
        ? matches[0]
        : undefined;
    if (!existing) return false;
    const targetId = existing.id;
    const editorName = getEditorName() ?? undefined;
    setItems((prev) =>
      // Keyed on the specific row's id, not "every row with this barcode" -
      // before Phase 4 those were always the same set of exactly one row,
      // but once a barcode can legitimately have 2+ rows (different
      // locations), matching on barcode alone here would have silently
      // deducted stock from every location sharing it instead of just the
      // one this removal was actually for.
      prev.map((it) =>
        it.id === targetId
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

  // Transfers N units of an item from its current row to another location
  // for the same barcode - the "Move stock" action (ItemCard's Move
  // button). Creates the destination row automatically, pre-filled from
  // the source (unit, price, reorder threshold - all editable after), if
  // no row for that location already exists; otherwise adds onto the
  // existing one. See moveStockDestinationId below for why the destination
  // id is resolved before setItems runs.
  const moveStock = (sourceItemId: string, destinationLocationInput: string, quantity: number) => {
    const source = items.find((it) => it.id === sourceItemId);
    if (!source || !source.barcode) return;
    const n = Math.max(0, Math.min(Math.round(quantity) || 0, source.quantity));
    const destLocation = destinationLocationInput.trim();
    if (n <= 0 || !destLocation) return;
    if (destLocation.toLowerCase() === (source.location || "").trim().toLowerCase()) return;

    const destExisting = items.find(
      (it) =>
        it.id !== source.id &&
        it.barcode === source.barcode &&
        (it.location || "").trim().toLowerCase() === destLocation.toLowerCase()
    );
    // Resolved once, up front, the same way addStock resolves itemId -
    // setItems's updater can run more than once in some React modes, and
    // logMovement below needs one stable id to log against regardless.
    const destId = destExisting ? destExisting.id : `item-${Date.now()}`;
    const now = new Date().toISOString();
    const editorName = getEditorName() ?? undefined;

    setItems((prev) => {
      const next = prev.map((it) =>
        it.id === source.id
          ? { ...it, quantity: Math.max(0, it.quantity - n), updatedAt: now, lastEditedBy: editorName }
          : it
      );
      if (next.some((it) => it.id === destId)) {
        return next.map((it) =>
          it.id === destId ? { ...it, quantity: it.quantity + n, updatedAt: now, lastEditedBy: editorName } : it
        );
      }
      return [
        ...next,
        {
          id: destId,
          barcode: source.barcode,
          name: source.name,
          quantity: n,
          unit: source.unit,
          pricePerUnit: source.pricePerUnit,
          reorderAt: source.reorderAt,
          updatedAt: now,
          location: destLocation,
          lastEditedBy: editorName,
        },
      ];
    });
    logMovement({ itemId: source.id, delta: -n, reason: "transfer-out", at: now, by: editorName });
    logMovement({ itemId: destId, delta: n, reason: "transfer-in", at: now, by: editorName });
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
              <Tooltip label="Take the tour" side="bottom">
                <button
                  onClick={replayTutorial}
                  aria-label="Take the tour"
                  className="rounded-lg p-1.5 text-neutral-500 hover:bg-surface-muted"
                >
                  <Compass size={18} />
                </button>
              </Tooltip>
              <ThemeToggle dataTutorial="header-theme-toggle" />
              <ClearCacheButton dataTutorial="header-clear-cache" tutorialDud={tutorialActive} />
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

        {/* First-visit invitation. Deliberately not a modal: a brand new
            customer who'd rather poke around first shouldn't have to answer
            a dialog to reach their own screen. It sits under the header, in
            the reading path, and disappears for good either way. Hidden
            during the tour itself so it isn't sitting in the spotlight of
            the very first step. */}
        {showTourInvite && !tutorialActive && !showLoadScreen && (
          <div className="mx-auto max-w-2xl px-4 pt-3 sm:px-6">
            <div className="flex items-center gap-3 rounded-xl2 border border-surface-border bg-white px-4 py-3 shadow-card">
              <Compass size={18} className="shrink-0 text-neutral-500" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-neutral-900">New here?</p>
                <p className="text-[11px] text-neutral-500">
                  A short guided tour shows you around the app.
                </p>
              </div>
              <button
                onClick={acceptTourInvite}
                className="shrink-0 rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
              >
                Take the tour
              </button>
              <button
                onClick={dismissTourInvite}
                aria-label="Dismiss tour invitation"
                className="shrink-0 rounded-lg p-1 text-neutral-400 hover:bg-surface-muted hover:text-neutral-700"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        )}

        {tab === "inventory" && (
          <InventoryTab
            items={items}
            onAdjust={adjust}
            onSave={upsertItem}
            onDelete={deleteItem}
            onImport={bulkImport}
            onBreakCase={breakCase}
            onMoveStock={moveStock}
            undoAdjust={lastAdjust ? { itemId: lastAdjust.itemId, net: lastAdjust.net, onUndo: undoLastAdjust } : null}
          />
        )}
        {tab === "scan" && (
          <ScanTab
            items={items}
            onAddStock={addStock}
            onRemoveStock={removeStock}
            onSaveItem={upsertItem}
            onDeleteItem={deleteItem}
          />
        )}
        {tab === "reorder" && <ReorderTab items={items} />}
        {tab === "usage" && (
          <UsageTab
            items={items}
            onSave={upsertItem}
            tutorialFocusItemId={tutorialActive && tutorialStepId === "usage" ? items[0]?.id : undefined}
          />
        )}
        {tab === "support" && <SupportTab />}
        {tab === "status" && trackedBookingId && <VisitStatusTab bookingId={trackedBookingId} />}

        <AccountSidebar
          open={accountOpen}
          onClose={() => setAccountOpen(false)}
          items={items}
          onImport={bulkImport}
          sheetId={sheetId}
          setSheetId={setSheetId}
          onBookingMatch={setTrackedBookingId}
          onReplayTutorial={replayTutorial}
          // Only wired up while the tour is on screen, so Start Fresh clears
          // in place instead of reloading the page out from under it. Outside
          // the tour the long-standing reload behaviour is untouched.
          onLocalFresh={tutorialActive ? clearInventoryInPlace : undefined}
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

        {/* The tour used to just stop - the last step's overlay disappeared
            and the customer was returned to an ordinary screen with no
            acknowledgement that they'd finished anything. This is the
            sign-off, and it names the two things a real first-day customer
            actually does next. Non-blocking and self-dismissing: it sits
            above the bottom nav, nothing is behind it, and it clears itself
            so there's no chore attached to finishing. */}
        {tourFinished && (
          <div className="fixed inset-x-0 bottom-16 z-40 px-3">
            <div className="mx-auto flex max-w-2xl items-start gap-3 rounded-xl2 border border-surface-border bg-white px-4 py-3 shadow-card">
              <Check size={18} className="mt-0.5 shrink-0 text-accent-ok" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-neutral-900">That&apos;s the tour</p>
                <p className="text-[11px] text-neutral-500">
                  Ready when you are — add your first item with the + button, or
                  import a spreadsheet from Account &amp; settings.
                </p>
              </div>
              <button
                onClick={() => setTourFinished(false)}
                aria-label="Dismiss"
                className="shrink-0 rounded-lg p-1 text-neutral-400 hover:bg-surface-muted hover:text-neutral-700"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        )}

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
            onClose={(reason) => {
              setTutorialActive(false);
              setTutorialStepId(null);
              // Only a completed tour earns the sign-off. Someone who hit
              // "Skip" has just told us they want the screen back; handing
              // them one more thing to dismiss would be the opposite of
              // listening.
              if (reason === "finished") setTourFinished(true);
            }}
            onStepChange={setTutorialStepId}
          />
        )}
      </main>
    </>
  );
}
