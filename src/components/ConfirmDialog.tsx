"use client";

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
// z-50 so it always sits above a parent modal (e.g. the item edit modal,
// z-40) when triggered from inside one — deliberately a real popup rather
// than the app's other "tap again to confirm" inline-arm pattern, since
// that pattern relies on the button staying in view, which doesn't hold
// once a click can also close whatever it's sitting inside (the edit
// modal, in this case).
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
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      onClick={onCancel}
    >
      <div className="w-full max-w-sm rounded-xl2 bg-white p-5 shadow-card" onClick={(e) => e.stopPropagation()}>
        <p className="mb-1.5 text-sm font-semibold text-neutral-900">{title}</p>
        <p className="mb-4 text-sm text-neutral-600">{message}</p>
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
    </div>
  );
}
