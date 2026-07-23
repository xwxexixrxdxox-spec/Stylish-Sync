"use client";

import { useEffect, useRef, useState } from "react";
import { Minus, Plus, Pencil, Trash2, PackageOpen } from "lucide-react";
import { InventoryItem } from "@/lib/types";
import { playChime } from "@/lib/chime";
import Tooltip from "./Tooltip";
import ConfirmDialog from "./ConfirmDialog";
import BreakCaseDialog from "./BreakCaseDialog";

interface Props {
  item: InventoryItem;
  items: InventoryItem[];
  onAdjust: (id: string, delta: number) => void;
  onEdit: (item: InventoryItem) => void;
  onDelete: (id: string) => void;
  onBreakCase: (caseItemId: string, casesToBreak: number) => void;
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
}

export default function ItemCard({
  item,
  items,
  onAdjust,
  onEdit,
  onDelete,
  onBreakCase,
  tutorialTarget,
  onActivity,
}: Props) {
  const low = item.quantity <= item.reorderAt;
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [breakingCase, setBreakingCase] = useState(false);
  // Tap-to-edit the quantity directly (the number between the +/- buttons),
  // as a fast path to "set it to exactly N" without holding +/- or opening
  // the full edit modal — the pencil button still does the latter. Commits
  // as a delta through the same onAdjust path the +/- buttons use, so the
  // change is clamped at 0 and logged as a normal manual adjustment.
  const [editingQty, setEditingQty] = useState(false);
  const [qtyDraft, setQtyDraft] = useState("");

  const startEditQty = () => {
    onActivity?.();
    setQtyDraft(String(item.quantity));
    setEditingQty(true);
  };
  const commitQty = () => {
    setEditingQty(false);
    const next = Math.round(Number(qtyDraft));
    if (!Number.isFinite(next) || next < 0 || next === item.quantity) return;
    onActivity?.();
    onAdjust(item.id, next - item.quantity);
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
        <div className="flex items-center gap-2">
          <p className="truncate font-medium text-neutral-900">{item.name}</p>
        </div>
        <p className="mt-0.5 text-xs text-neutral-500">
          {item.barcode || "no barcode"} · {item.unit}
          {item.location && <> · 📍 {item.location}</>}
        </p>
        <div className="mt-2 flex items-center gap-2" data-tutorial={tutorialTarget ? "item-stock-controls" : undefined}>
          <div className="relative">
            <Tooltip label="Hold to decrease stock">
              <button
                aria-label="Decrease stock"
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
        <div className="flex gap-1.5">
          {eachItem && (
            <Tooltip label={`Break down into "${eachItem.name}"`}>
              <button
                aria-label="Break case into individual units"
                onClick={() => setBreakingCase(true)}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-surface-border text-neutral-500 hover:bg-surface-muted"
              >
                <PackageOpen size={14} />
              </button>
            </Tooltip>
          )}
          <Tooltip label="Edit item">
            <button
              aria-label="Edit item"
              onClick={() => onEdit(item)}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-surface-border text-neutral-500 hover:bg-surface-muted"
            >
              <Pencil size={14} />
            </button>
          </Tooltip>
          <Tooltip label="Delete item">
            <button
              aria-label="Delete item"
              onClick={() => setConfirmingDelete(true)}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-surface-border text-neutral-500 hover:bg-red-50 hover:text-accent-low"
            >
              <Trash2 size={14} />
            </button>
          </Tooltip>
        </div>
        <div className="text-right">
          <p className="text-sm font-medium text-neutral-800">${(item.pricePerUnit ?? 0).toFixed(2)} ea</p>
          {low && <p className="text-xs font-medium text-accent-low">Low stock</p>}
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
    </div>
  );
}
