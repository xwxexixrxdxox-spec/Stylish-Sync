"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

interface Props {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

// Small popup confirmation, shared by every destructive one-tap action that
// needs a "are you sure" step (deleting an item, clearing the app cache).
// z-[210] so it always sits above a parent modal (e.g. the item edit modal,
// z-40) when triggered from inside one — deliberately a real popup rather
// than the app's other "tap again to confirm" inline-arm pattern, since
// that pattern relies on the button staying in view, which doesn't hold
// once a click can also close whatever it's sitting inside (the edit
// modal, in this case). Also has to clear the guided tour's own overlay
// (TutorialOverlay.tsx/PropertyTutorialOverlay.tsx, z-[200]) — the tour's
// final "Start Fresh" step spotlights the button that opens this exact
// dialog, and at the old z-50 the tour's dim mask visually swallowed it
// (rendered underneath the mask, outside the tour's own spotlight hole),
// making the real confirm button unreachable. A user-triggered confirmation
// should always win over a coach-mark overlay, so this sits above both.
//
// Portaled straight to document.body (like TutorialOverlay/
// PropertyTutorialOverlay already do) rather than rendered inline: when
// this dialog is opened from inside AccountSidebar.tsx, its parent panel
// slides in via a CSS `transform` (translate-x), and per the CSS spec any
// `transform`d ancestor becomes the containing block for descendant
// `position: fixed` elements - not the viewport. Rendered inline, this
// dialog's own "fixed inset-0" was silently being confined to that
// slide-in panel's box instead of the full screen, and the transform also
// gives the panel its own stacking context, so no z-index on this dialog
// could ever escape it to actually beat the tour's overlay - live-testing
// the "Start Fresh" tour step is what surfaced this: the confirm buttons
// looked right (same white card, right title/message) but tapping Cancel
// silently did nothing, because the click was landing on the tour's dim
// mask underneath instead. Portaling to document.body sidesteps the whole
// containing-block/stacking-context problem, the same way the tour
// overlays already do for the identical reason.
export default function ConfirmDialog({
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = true,
  busy = false,
  onConfirm,
  onCancel,
}: Props) {
  const cardRef = useRef<HTMLDivElement>(null);

  // Focus the dialog as soon as it mounts, so keyboard/screen-reader users
  // land inside it rather than staying on whatever triggered it underneath.
  useEffect(() => {
    cardRef.current?.focus();
  }, []);

  // Escape cancels, same as tapping the backdrop - but not while `busy`,
  // since a confirm is already in flight and letting Escape fire onCancel
  // mid-request would contradict the disabled Cancel/Confirm buttons right
  // next to it.
  useEffect(() => {
    if (busy) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy, onCancel]);

  // Minimal focus trap, matching TutorialOverlay's callout: Tab/Shift+Tab
  // cycles only between this dialog's own two buttons instead of escaping
  // to whatever's behind the backdrop.
  const onCardKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Tab" || !cardRef.current) return;
    const focusable = cardRef.current.querySelectorAll<HTMLElement>("button");
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[210] flex items-end justify-center bg-black/40 p-4 sm:items-center"
      onClick={onCancel}
    >
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-message"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onCardKeyDown}
        className="w-full max-w-sm rounded-xl2 bg-white p-5 shadow-card outline-none"
      >
        <p id="confirm-dialog-title" className="mb-1.5 text-sm font-semibold text-neutral-900">
          {title}
        </p>
        <p id="confirm-dialog-message" className="mb-4 text-sm text-neutral-600">
          {message}
        </p>
        <div className="flex gap-2">
          <button
            disabled={busy}
            onClick={onCancel}
            className="flex-1 rounded-lg border border-surface-border py-2 text-sm font-medium text-neutral-700 hover:bg-surface-muted disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            disabled={busy}
            onClick={onConfirm}
            className={`flex-1 rounded-lg py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50 ${
              danger ? "bg-accent-low" : "bg-neutral-900"
            }`}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
