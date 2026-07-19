"use client";

import { X } from "lucide-react";
import { InventoryItem, AccessCheckResponse } from "@/lib/types";
import AccountTab from "./AccountTab";

interface Props {
  open: boolean;
  onClose: () => void;
  items: InventoryItem[];
  onImport: (items: InventoryItem[]) => void;
  sheetId: string | null;
  setSheetId: (id: string | null) => void;
  access: AccessCheckResponse | null;
  onBookingMatch?: (bookingId: string | null) => void;
}

// Account settings live in a collapsible sidebar rather than a slot in the
// bottom tab bar, since they're opened far less often than Scan / Inventory
// / Reorder / Usage / Support. Standard slide-in drawer: dimmed backdrop
// (click to close) plus a panel that slides in from the right. AccountTab
// itself is unchanged content-wise - this just gives it a new home.
export default function AccountSidebar({
  open,
  onClose,
  items,
  onImport,
  sheetId,
  setSheetId,
  access,
  onBookingMatch,
}: Props) {
  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-black/30 transition-opacity duration-200 ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-label="Account"
        aria-hidden={!open}
        className={`fixed inset-y-0 right-0 z-50 w-full max-w-[360px] transform bg-surface-muted shadow-card transition-transform duration-200 ease-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-surface-border bg-white px-4 py-3">
          <span className="text-sm font-semibold text-neutral-900">Account</span>
          <button
            onClick={onClose}
            aria-label="Close account panel"
            className="rounded-lg p-1.5 text-neutral-500 hover:bg-surface-muted"
          >
            <X size={18} />
          </button>
        </div>
        <div className="h-[calc(100%-49px)] overflow-y-auto">
          <AccountTab
            items={items}
            onImport={onImport}
            sheetId={sheetId}
            setSheetId={setSheetId}
            access={access}
            onBookingMatch={onBookingMatch}
          />
        </div>
      </div>
    </>
  );
}
