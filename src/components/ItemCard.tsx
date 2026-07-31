"use client";

import { useEffect, useRef, useState } from "react";
import { Minus, Plus, Pencil, Trash2, PackageOpen, ChevronRight, ArrowLeftRight } from "lucide-react";
import { InventoryItem } from "@/lib/types";
import { playChime } from "@/lib/chime";
import { isLowStock } from "@/lib/reorderStatus";
import { isRecentOtherEdit } from "@/lib/recentEdit";
import { formatRelativeTime } from "@/lib/time";
import { locationSiblings } from "@/lib/itemMatch";
import { getKnownLocations } from "@/lib/locations";
import Tooltip from "./Tooltip";
import ConfirmDialog from "./ConfirmDialog";
import BreakCaseDialog from "./BreakCaseDialog";
import MoveStockDialog from "./MoveStockDialog";

interface Props {
  item: InventoryItem;
  items: InventoryItem[];
  onAdjust: (id: string, delta: number) => void;
  onEdit: (item: InventoryItem) => void;
  onDelete: (id: string) => void;
  onBreakCase: (caseItemId: string, casesToBreak: number) => void;
  // Transfers stock from this row to another location for the same
  // barcode (Phase 4 - per-location quantity tracking). See moveStock in
  // page.tsx. Only ever offered when the item has a barcode - a
  // barcode-less item has nothing to link a destination row to.
  onMoveStock: (itemId: string, destinationLocation: string, quantity: number) => void;
  // Marks this card's stock controls as the new-customer tutorial's
  // spotlight target (see TutorialOverlay.tsx / InventoryTab.tsx, which
  // only sets this on whichever item happens to render first) - not tied
  // to a specific item id, since the tour should still find something to
  // point at even after the seed items are edited or reordered.
  tutorialTarget?: boolean;
  // Pings the parent list every time this card does something that could
  // change sort order (a tap/hold step, opening or typing in the inline
  // quantity editor). InventoryTab uses this to freeze the on-screen order
  // for a moment so a live re-sort (e.g. "Recently changed") never yanks
  // the card you're actively touching out from under your finger.
  onActivity?: () => void;
  // Whether this item's break-down group (see InventoryTab.tsx's
  // groupBreakDownChildren) is currently collapsed — only meaningful, and
  // only ever rendered, when this item actually has a linked child (see
  // `eachItem` below). Undefined onToggleCollapsed means "don't show the
  // foldout at all," used for a child card, which never gets one of its
  // own (no nested-nested groups in this data model).
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}

export default function ItemCard({
  item,
  items,
  onAdjust,
  onEdit,
  onDelete,
  onBreakCase,
  onMoveStock,
  tutorialTarget,
  onActivity,
  collapsed,
  onToggleCollapsed,
}: Props) {
  // Low-stock accounts for a linked break-down child's remaining stock (see
  // reorderStatus.ts) — rawLow is the old plain "just this item's own
  // quantity" check, kept only to detect when the tie-in is the reason a
  // card that would otherwise look low isn't flagged, so that can be
  // surfaced rather than silently suppressed (see the hint near eachItem
  // below).
  const low = isLowStock(item, items);
  const rawLow = item.quantity <= item.reorderAt;
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [breakingCase, setBreakingCase] = useState(false);
  const [movingStock, setMovingStock] = useState(false);
  // Mirrors a real tap on the breakdown/edit/delete action icons onto a
  // data-tutorial-clicked attribute (same idea as the stock stepper's
  // burst-count attributes above it) so TutorialOverlay.tsx's per-icon
  // tour steps can self-resolve the instant the customer actually taps the
  // button being spotlighted, rather than requiring a separate "Next" tap
  // on top of the real gesture the step just asked for. Only meaningful
  // when tutorialTarget is set (the one card the tour ever points at); a
  // plain object rather than three separate booleans since all three only
  // ever get read via the same style of attribute lookup.
  const [tutorialClicked, setTutorialClicked] = useState<{ breakdown?: boolean; edit?: boolean; delete?: boolean }>({});
  // Other rows already tracking this same barcode at a different location
  // (Phase 4) - drives both the "Also at" line below and the Move dialog's
  // quick-pick chips. Recomputed every render from the live `items` list
  // rather than cached, same as eachItem below, so it stays correct as
  // siblings are added/removed/renamed.
  const siblings = locationSiblings(item, items);
  // Tap-to-edit the quantity directly (the number between the +/- buttons),
  // as a fast path to "set it to exactly N" without holding +/- or opening
  // the full edit modal — the pencil button still does the latter. Commits
  // as a delta through the same onAdjust path the +/- buttons use, so the
  // change is clamped at 0 and logged as a normal manual adjustment.
  const [editingQty, setEditingQty] = useState(false);
  const [qtyDraft, setQtyDraft] = useState("");

  // "Someone just changed this" overwrite guard (see recentEdit.ts) — only
  // checked once per card mount (i.e. once per distinct stock-touching
  // interaction session on this card), not on every tick of a held +/-
  // repeat, so a confirmed hold doesn't keep re-asking. Reset on Cancel so
  // trying again immediately still gets asked once more, rather than
  // silently unlocking unprotected edits after the first decline.
  const hasCheckedRecentEditRef = useRef(false);
  const [pendingOverwrite, setPendingOverwrite] = useState<(() => void) | null>(null);
  const guardRecentEdit = (proceed: () => void) => {
    if (!hasCheckedRecentEditRef.current) {
      hasCheckedRecentEditRef.current = true;
      if (isRecentOtherEdit(item)) {
        setPendingOverwrite(() => proceed);
        return;
      }
    }
    proceed();
  };

  const startEditQty = () => {
    onActivity?.();
    setQtyDraft(String(item.quantity));
    setEditingQty(true);
  };
  const commitQty = () => {
    setEditingQty(false);
    const next = Math.round(Number(qtyDraft));
    if (!Number.isFinite(next) || next < 0 || next === item.quantity) return;
    guardRecentEdit(() => {
      onActivity?.();
      onAdjust(item.id, next - item.quantity);
    });
  };
  // The linked each-item, looked up live by barcode every render rather
  // than trusted as "must still exist" — the customer can delete or
  // re-barcode the each item independently, at which point the case item's
  // link just quietly stops offering a "Break Case" button rather than
  // pointing at nothing.
  const eachItem = item.breaksDownIntoBarcode
    ? items.find((it) => it.barcode === item.breaksDownIntoBarcode)
    : undefined;

  // Cute little "+1"/"-1" pop that floats up from whichever button was
  // pressed, plus a quick squish/bounce on the icon itself.
  //
  // A plain tap always gets its own fresh pop-in-and-fade badge ("popping"
  // phase), exactly like before. Holding a button down repeats the step
  // (see startPress below) instead of doing nothing until release — but
  // repeat ticks don't each get their own badge. Instead the same badge
  // switches to a static "holding" phase that just counts up ("+1", "+2",
  // "+3"…) while pressed, with no animation running, and only fades out
  // ("releasing" phase) once the press ends. Firing a brand-new 650ms
  // pop-in-and-out animation every ~120ms tick (this component's original
  // approach, before hold-to-repeat existed) was the actual bug a tester
  // found: each tick's badge got yanked out mid-flight by the next tick's
  // before its animation ever reached completion, so only the very last
  // tick's badge actually finished — and that finish raced against the
  // finger lifting, occasionally leaving a badge stuck on screen well
  // after the hold had ended.
  const [burst, setBurst] = useState<{
    sign: 1 | -1;
    key: number;
    count: number;
    phase: "popping" | "holding" | "releasing";
  } | null>(null);
  const burstKeyRef = useRef(0);
  const holdTimeoutRef = useRef<number | null>(null);
  const holdIntervalRef = useRef<number | null>(null);
  // Removes the window-level release listeners installed by startPress —
  // see the comment there for why those exist at all.
  const releaseListenersCleanupRef = useRef<(() => void) | null>(null);

  const HOLD_REPEAT_DELAY_MS = 350; // pause before repeat kicks in, so a normal tap never feels like it double-fires
  const HOLD_REPEAT_INTERVAL_MS = 120;

  const applyStep = (delta: 1 | -1, repeating: boolean) => {
    onActivity?.();
    onAdjust(item.id, delta);
    playChime(delta > 0 ? "add" : "remove");
    setBurst((prev) =>
      repeating && prev && prev.sign === delta
        ? { ...prev, count: prev.count + 1 } // same key: update the existing badge in place, no remount
        : { sign: delta, key: ++burstKeyRef.current, count: 1, phase: "popping" }
    );
  };

  const clearHoldTimers = () => {
    if (holdTimeoutRef.current !== null) {
      window.clearTimeout(holdTimeoutRef.current);
      holdTimeoutRef.current = null;
    }
    if (holdIntervalRef.current !== null) {
      window.clearInterval(holdIntervalRef.current);
      holdIntervalRef.current = null;
    }
  };

  const startPress = (delta: 1 | -1, pointerId: number) => {
    guardRecentEdit(() => runStartPress(delta, pointerId));
  };

  const runStartPress = (delta: 1 | -1, pointerId: number) => {
    applyStep(delta, false); // the press itself always behaves like a normal single click
    clearHoldTimers();
    releaseListenersCleanupRef.current?.();
    // The button's own onPointerUp is NOT a reliable stop signal: every
    // repeat tick bumps this item's updatedAt, and pressing another item's
    // button mid-hold bumps that one's too — and under the default
    // "Recently changed" sort, either can re-sort the list and physically
    // move this button's DOM node while the finger is still down. Chrome
    // then delivers the eventual release to whatever's under the finger
    // now, not to the moved button — leaving the repeat interval running
    // forever after the finger lifted (a real bug found by holding + on one
    // item while tapping + on another). So the authoritative stop signal
    // lives on window, keyed to this exact pointer, where no amount of DOM
    // reshuffling can hide the release from it. The button-level handlers
    // stay as belt-and-suspenders (endPress is idempotent).
    const onRelease = (ev: PointerEvent) => {
      if (ev.pointerId === pointerId) endPress();
    };
    window.addEventListener("pointerup", onRelease);
    window.addEventListener("pointercancel", onRelease);
    releaseListenersCleanupRef.current = () => {
      window.removeEventListener("pointerup", onRelease);
      window.removeEventListener("pointercancel", onRelease);
      releaseListenersCleanupRef.current = null;
    };
    holdTimeoutRef.current = window.setTimeout(() => {
      // Switch the badge to its static "holding" phase (no animation while
      // still actively pressed) before the repeat ticks start bumping its
      // count.
      setBurst((prev) => (prev && prev.sign === delta ? { ...prev, phase: "holding" } : prev));
      holdIntervalRef.current = window.setInterval(() => applyStep(delta, true), HOLD_REPEAT_INTERVAL_MS);
    }, HOLD_REPEAT_DELAY_MS);
  };

  const endPress = () => {
    releaseListenersCleanupRef.current?.();
    clearHoldTimers();
    // If the hold actually reached "holding" phase, fade it out from where
    // it's already sitting (a fresh key so the fade-out animation starts
    // clean) rather than leaving it static forever.
    setBurst((prev) =>
      prev && prev.phase === "holding" ? { ...prev, key: ++burstKeyRef.current, phase: "releasing" } : prev
    );
  };

  // Space/Enter keydown fires repeatedly on its own (the OS's native key-
  // repeat) while held, so keyboard users get the same "hold to repeat"
  // result without needing separate timers — every keydown just applies a
  // normal single step, same as a tap.
  const handleKeyDown = (delta: 1 | -1) => (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      applyStep(delta, false);
    }
  };

  // If this card unmounts mid-hold (e.g. the item gets deleted, or an
  // import/sync replaces the list, while a finger is still down) the
  // repeat interval has to stop with it — otherwise it keeps firing
  // onAdjust for an id that's no longer in the list every 120ms forever.
  // The window-level release listeners have to go with it too, or they'd
  // fire against a torn-down component.
  useEffect(
    () => () => {
      clearHoldTimers();
      releaseListenersCleanupRef.current?.();
    },
    []
  );

  return (
    <div className="flex items-center justify-between rounded-xl2 border border-surface-border bg-white p-4 shadow-card">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          {eachItem && onToggleCollapsed && (
            <Tooltip label={collapsed ? "Expand broken-down item" : "Collapse broken-down item"}>
              <button
                type="button"
                onClick={onToggleCollapsed}
                aria-label={collapsed ? "Expand broken-down item" : "Collapse broken-down item"}
                aria-expanded={!collapsed}
                className="-ml-1 flex h-5 w-5 shrink-0 items-center justify-center text-neutral-400 hover:text-neutral-700"
              >
                <ChevronRight size={14} className={`transition-transform ${collapsed ? "" : "rotate-90"}`} />
              </button>
            </Tooltip>
          )}
          <p className="truncate font-medium text-neutral-900">{item.name}</p>
        </div>
        <p className="mt-0.5 text-xs text-neutral-500">
          {item.barcode || "no barcode"} · {item.unit}
          {item.location && <> · 📍 {item.location}</>}
        </p>
        {item.lastEditedBy && (
          <p className="mt-0.5 text-[11px] text-neutral-400">
            Edited by {item.lastEditedBy} · {formatRelativeTime(item.updatedAt)}
          </p>
        )}
        {siblings.length > 0 && (
          <p className="mt-0.5 text-[11px] text-neutral-400">
            🔗 Also at{" "}
            {siblings
              .map((s) => `${s.location || "no location"} (${s.quantity} ${s.unit})`)
              .join(", ")}
          </p>
        )}
        <div
          className="mt-2 flex items-center gap-2"
          data-tutorial={tutorialTarget ? "item-stock-controls" : undefined}
          // Read-only mirror of the burst state below, for the guided
          // tour's stock-controls-tap/-hold steps (TutorialOverlay.tsx) to
          // watch via MutationObserver — a real press bumps count to at
          // least 1 immediately, and a real hold (as opposed to a quick
          // tap) is the only thing that ever reaches phase "holding" or a
          // count of 2+, since that only happens once the hold-repeat
          // interval has actually fired at least once. Purely observational:
          // nothing here reads these attributes back, so they can't create
          // a stale-state bug in the app's own logic.
          data-tutorial-burst-count={tutorialTarget ? (burst?.count ?? 0) : undefined}
          data-tutorial-burst-phase={tutorialTarget ? (burst?.phase ?? "") : undefined}
        >
          <div className="relative">
            <Tooltip label="Hold to decrease stock">
              <button
                aria-label="Decrease stock"
                // The guided tour spotlights this button (and the + below)
                // directly rather than the whole row: the row is ~470px
                // wide while the two controls the narration actually names
                // are 28px each, so the old highlight covered half the card.
                data-tutorial={tutorialTarget ? "item-stock-decrement" : undefined}
                onPointerDown={(e) => startPress(-1, e.pointerId)}
                onPointerUp={endPress}
                onPointerLeave={endPress}
                onPointerCancel={endPress}
                onKeyDown={handleKeyDown(-1)}
                onContextMenu={(e) => e.preventDefault()}
                className="flex h-7 w-7 select-none items-center justify-center rounded-full border border-surface-border text-neutral-600 transition-transform duration-150 hover:bg-surface-muted active:scale-90"
              >
                <Minus size={14} key={burst?.sign === -1 ? burst.key : "idle"} className={burst?.sign === -1 ? "animate-btn-pop" : undefined} />
              </button>
            </Tooltip>
            {burst?.sign === -1 && (
              <span
                key={burst.key}
                onAnimationEnd={() => setBurst(null)}
                className={`pointer-events-none absolute left-1/2 top-0 select-none text-xs font-semibold text-accent-low ${
                  burst.phase === "popping"
                    ? "animate-float-up"
                    : burst.phase === "releasing"
                      ? "animate-float-away"
                      : "-translate-x-1/2 -translate-y-2 opacity-100"
                }`}
              >
                −{burst.count}
              </span>
            )}
          </div>
          {editingQty ? (
            <input
              autoFocus
              type="number"
              inputMode="numeric"
              value={qtyDraft}
              onChange={(e) => {
                onActivity?.();
                setQtyDraft(e.target.value);
              }}
              onBlur={commitQty}
              onFocus={(e) => e.currentTarget.select()}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
                else if (e.key === "Escape") setEditingQty(false);
              }}
              aria-label={`Set quantity for ${item.name}`}
              className="w-[64px] rounded-md border border-neutral-300 px-1 py-0.5 text-center text-sm font-semibold text-neutral-900 outline-none focus:border-neutral-900"
            />
          ) : (
            <button
              onClick={startEditQty}
              aria-label={`Quantity ${item.quantity} ${item.unit} — tap to edit`}
              data-tutorial={tutorialTarget ? "item-quantity-chip" : undefined}
              className={`min-w-[64px] select-none rounded-md px-1 py-0.5 text-center text-sm font-semibold hover:bg-surface-muted ${
                low ? "text-accent-low" : "text-neutral-800"
              }`}
            >
              {item.quantity} {item.unit}
            </button>
          )}
          <div className="relative">
            <Tooltip label="Hold to increase stock">
              <button
                aria-label="Increase stock"
                data-tutorial={tutorialTarget ? "item-stock-increment" : undefined}
                onPointerDown={(e) => startPress(1, e.pointerId)}
                onPointerUp={endPress}
                onPointerLeave={endPress}
                onPointerCancel={endPress}
                onKeyDown={handleKeyDown(1)}
                onContextMenu={(e) => e.preventDefault()}
                className="flex h-7 w-7 select-none items-center justify-center rounded-full border border-surface-border text-neutral-600 transition-transform duration-150 hover:bg-surface-muted active:scale-90"
              >
                <Plus size={14} key={burst?.sign === 1 ? burst.key : "idle"} className={burst?.sign === 1 ? "animate-btn-pop" : undefined} />
              </button>
            </Tooltip>
            {burst?.sign === 1 && (
              <span
                key={burst.key}
                onAnimationEnd={() => setBurst(null)}
                className={`pointer-events-none absolute left-1/2 top-0 select-none text-xs font-semibold text-accent-ok ${
                  burst.phase === "popping"
                    ? "animate-float-up"
                    : burst.phase === "releasing"
                      ? "animate-float-away"
                      : "-translate-x-1/2 -translate-y-2 opacity-100"
                }`}
              >
                +{burst.count}
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="ml-3 flex shrink-0 flex-col items-end gap-2">
        <div className="flex gap-1.5" data-tutorial={tutorialTarget ? "item-action-icons" : undefined}>
          {eachItem && (
            <Tooltip label={`Break down into "${eachItem.name}"`}>
              <button
                aria-label="Break case into individual units"
                onClick={() => {
                  setBreakingCase(true);
                  if (tutorialTarget) setTutorialClicked((c) => ({ ...c, breakdown: true }));
                }}
                data-tutorial={tutorialTarget ? "item-action-breakdown" : undefined}
                data-tutorial-clicked={tutorialClicked.breakdown ? "true" : undefined}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-surface-border text-neutral-500 hover:bg-surface-muted"
              >
                <PackageOpen size={14} />
              </button>
            </Tooltip>
          )}
          {item.barcode && (
            <Tooltip label="Move stock to another location">
              <button
                aria-label="Move stock to another location"
                onClick={() => setMovingStock(true)}
                data-tutorial={tutorialTarget ? "item-action-move" : undefined}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-surface-border text-neutral-500 hover:bg-surface-muted"
              >
                <ArrowLeftRight size={14} />
              </button>
            </Tooltip>
          )}
          <Tooltip label="Edit item">
            <button
              aria-label="Edit item"
              onClick={() => {
                onEdit(item);
                if (tutorialTarget) setTutorialClicked((c) => ({ ...c, edit: true }));
              }}
              data-tutorial={tutorialTarget ? "item-action-edit" : undefined}
              data-tutorial-clicked={tutorialClicked.edit ? "true" : undefined}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-surface-border text-neutral-500 hover:bg-surface-muted"
            >
              <Pencil size={14} />
            </button>
          </Tooltip>
          <Tooltip label="Delete item">
            <button
              aria-label="Delete item"
              onClick={() => {
                setConfirmingDelete(true);
                if (tutorialTarget) setTutorialClicked((c) => ({ ...c, delete: true }));
              }}
              data-tutorial={tutorialTarget ? "item-action-delete" : undefined}
              data-tutorial-clicked={tutorialClicked.delete ? "true" : undefined}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-surface-border text-neutral-500 hover:bg-red-50 hover:text-accent-low"
            >
              <Trash2 size={14} />
            </button>
          </Tooltip>
        </div>
        <div className="max-w-[9rem] text-right">
          <p className="text-sm font-medium text-neutral-800">${(item.pricePerUnit ?? 0).toFixed(2)} ea</p>
          {low && <p className="text-xs font-medium text-accent-low">Low stock</p>}
          {/* This item's own quantity alone would read as low, but the
              broken-down child item still has enough on hand to cover it —
              e.g. one intact case left after breaking a couple down — so
              it isn't flagged. Only shown when that's actually why it
              differs, not on every linked item. */}
          {!low && rawLow && eachItem && (
            <p className="mt-0.5 text-[11px] leading-snug text-neutral-400">
              Not low — {eachItem.quantity} {eachItem.unit} of broken-down {eachItem.name} on hand
            </p>
          )}
        </div>
      </div>

      {confirmingDelete && (
        <ConfirmDialog
          title={`Delete "${item.name}"?`}
          message="This removes the item from your inventory. Its past usage history stays intact, but it will no longer be trackable going forward. This can't be undone."
          confirmLabel="Delete"
          onCancel={() => setConfirmingDelete(false)}
          onConfirm={() => {
            setConfirmingDelete(false);
            onDelete(item.id);
          }}
        />
      )}

      {movingStock && (
        <MoveStockDialog
          item={item}
          siblingLocations={siblings.map((s) => s.location || "").filter(Boolean)}
          knownLocations={getKnownLocations(items)}
          onCancel={() => setMovingStock(false)}
          onConfirm={(destination, quantity) => {
            setMovingStock(false);
            onMoveStock(item.id, destination, quantity);
          }}
        />
      )}

      {breakingCase && eachItem && (
        <BreakCaseDialog
          caseItem={item}
          eachItem={eachItem}
          onCancel={() => setBreakingCase(false)}
          onConfirm={(n) => {
            setBreakingCase(false);
            onBreakCase(item.id, n);
          }}
        />
      )}

      {pendingOverwrite && (
        <ConfirmDialog
          title="Recently changed"
          message={`This item was updated ${formatRelativeTime(item.updatedAt)} by ${item.lastEditedBy} — overwrite that change?`}
          confirmLabel="Overwrite anyway"
          danger={false}
          onCancel={() => {
            hasCheckedRecentEditRef.current = false;
            setPendingOverwrite(null);
          }}
          onConfirm={() => {
            const proceed = pendingOverwrite;
            setPendingOverwrite(null);
            proceed();
          }}
        />
      )}
    </div>
  );
}
