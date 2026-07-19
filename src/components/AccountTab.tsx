"use client";

import { useState } from "react";
import { ExternalLink, RefreshCw, LogOut, FilePlus2, ShieldCheck } from "lucide-react";
import { InventoryItem, AccessCheckResponse } from "@/lib/types";
import {
  createInventorySpreadsheet,
  isGoogleSheetsConfigured,
  isPickerConfigured,
  openSpreadsheetPicker,
  pullItemsFromSheet,
  pushItemsToSheet,
  requestAccessToken,
  sheetUrl,
  signOutGoogle,
} from "@/lib/googleSheets";
import { setLinkedSheetId } from "@/lib/storage";
import PricingTiers from "./PricingTiers";
import DevAccessToggle from "./DevAccessToggle";

interface Props {
  items: InventoryItem[];
  onImport: (items: InventoryItem[]) => void;
  sheetId: string | null;
  setSheetId: (id: string | null) => void;
  access: AccessCheckResponse | null;
}

export default function AccountTab({ items, onImport, sheetId, setSheetId, access }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const flash = (msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(null), 4000);
  };

  const connectGoogle = async () => {
    setBusy("connect");
    try {
      const token = await requestAccessToken(true);

      // First-time connect (no sheet linked yet): offer to pick one of the
      // customer's existing spreadsheets before falling back to creating a
      // fresh one. Re-authenticating an already-linked sheet skips this —
      // that button just needs a fresh token, not a new sheet choice.
      if (!sheetId) {
        const picked = isPickerConfigured() ? await openSpreadsheetPicker(token) : null;
        if (picked) {
          setSheetId(picked);
          setLinkedSheetId(picked);
          const remote = await pullItemsFromSheet(picked);
          onImport(remote);
          flash(`Connected — imported ${remote.length} items from your sheet.`);
          return;
        }
        const id = await createInventorySpreadsheet();
        setSheetId(id);
        setLinkedSheetId(id);
        await pushItemsToSheet(id, items);
        flash("Connected and synced to a new Google Sheet.");
        return;
      }

      await pushItemsToSheet(sheetId, items);
      flash("Connected and synced to Google Sheets.");
    } catch (e: any) {
      flash(e.message ?? "Couldn't connect to Google.");
    } finally {
      setBusy(null);
    }
  };

  const syncNow = async () => {
    if (!sheetId) return;
    setBusy("sync");
    try {
      await pushItemsToSheet(sheetId, items);
      flash("Synced current inventory to your Google Sheet.");
    } catch (e: any) {
      flash(e.message ?? "Sync failed.");
    } finally {
      setBusy(null);
    }
  };

  const importFromSheet = async () => {
    setBusy("import");
    try {
      // Always let the customer browse and pick which sheet to import from
      // — not just re-pull whatever's currently linked — so switching to a
      // different existing spreadsheet is possible at any time.
      if (isPickerConfigured()) {
        const token = await requestAccessToken();
        const picked = await openSpreadsheetPicker(token);
        if (!picked) return; // picker closed without a selection — not an error
        setSheetId(picked);
        setLinkedSheetId(picked);
        const remote = await pullItemsFromSheet(picked);
        onImport(remote);
        flash(`Imported ${remote.length} items from your Google Sheet.`);
        return;
      }

      if (!sheetId) return;
      const remote = await pullItemsFromSheet(sheetId);
      onImport(remote);
      flash(`Imported ${remote.length} items from your Google Sheet.`);
    } catch (e: any) {
      flash(e.message ?? "Import failed.");
    } finally {
      setBusy(null);
    }
  };

  const startFresh = async () => {
    setBusy("fresh");
    try {
      const id = await createInventorySpreadsheet();
      setSheetId(id);
      setLinkedSheetId(id);
      flash("Created a new spreadsheet.");
    } catch (e: any) {
      flash(e.message ?? "Couldn't create a new sheet.");
    } finally {
      setBusy(null);
    }
  };

  const signOut = () => {
    signOutGoogle();
    setSheetId(null);
    setLinkedSheetId(null);
    flash("Signed out of Google.");
  };

  const signOutOfAccount = async () => {
    setBusy("account-sign-out");
    try {
      await fetch("/api/sign-out", { method: "POST" }).catch(() => {});
      window.location.reload();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="px-4 pb-6 pt-4">
      <DevAccessToggle access={access} />

      {access?.access && (
        <div className="mb-4 flex items-center gap-2 rounded-xl2 border border-green-200 bg-green-50 p-4 text-sm text-green-800 shadow-card">
          <ShieldCheck size={18} />
          <div>
            <p className="font-medium">Premium active</p>
            {access.currentPeriodEnd && (
              <p className="text-xs text-green-700">
                Renews {new Date(access.currentPeriodEnd).toLocaleDateString()}
              </p>
            )}
          </div>
        </div>
      )}

      {access?.access && access.plan !== "Dev Test Mode (not a real subscription)" && (
        <button
          disabled={busy === "account-sign-out"}
          onClick={signOutOfAccount}
          className="mb-5 flex w-full items-center justify-center gap-2 rounded-lg border border-surface-border px-3 py-2 text-sm text-neutral-700 hover:bg-surface-muted disabled:opacity-50"
        >
          <LogOut size={14} /> {busy === "account-sign-out" ? "Signing out…" : "Sign out"}
        </button>
      )}

      <section className="mb-5 rounded-xl2 border border-surface-border bg-white p-4 shadow-card">
        <p className="mb-3 text-sm font-medium text-neutral-900">Google Sheets</p>
        {!isGoogleSheetsConfigured() ? (
          <p className="text-xs text-neutral-500">
            Google Sheets sync isn't configured for this deployment yet — see the README's "Google Sheets setup"
            section.
          </p>
        ) : !sheetId ? (
          <button
            disabled={busy === "connect"}
            onClick={connectGoogle}
            className="w-full rounded-lg border border-surface-border py-2 text-sm font-medium text-neutral-700 hover:bg-surface-muted disabled:opacity-50"
          >
            {busy === "connect" ? "Connecting…" : "Sign in with Google"}
          </button>
        ) : (
          <div className="space-y-2">
            <a
              href={sheetUrl(sheetId)}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between rounded-lg border border-surface-border px-3 py-2 text-sm text-green-700 hover:bg-surface-muted"
            >
              <span className="flex items-center gap-2">📗 Open My Google Sheet</span>
              <ExternalLink size={14} />
            </a>
            <button
              disabled={busy === "sync"}
              onClick={syncNow}
              className="flex w-full items-center gap-2 rounded-lg border border-surface-border px-3 py-2 text-sm text-neutral-700 hover:bg-surface-muted disabled:opacity-50"
            >
              <RefreshCw size={14} /> {busy === "sync" ? "Syncing…" : "Sync now"}
            </button>
            <button
              disabled={busy === "import"}
              onClick={importFromSheet}
              className="flex w-full items-center gap-2 rounded-lg border border-surface-border px-3 py-2 text-sm text-neutral-700 hover:bg-surface-muted disabled:opacity-50"
            >
              <FilePlus2 size={14} /> {busy === "import" ? "Importing…" : "Import from sheet"}
            </button>
            <button
              onClick={connectGoogle}
              className="flex w-full items-center gap-2 rounded-lg border border-surface-border px-3 py-2 text-sm text-neutral-700 hover:bg-surface-muted"
            >
              <RefreshCw size={14} /> Re-authenticate Google
            </button>
            <button
              onClick={signOut}
              className="flex w-full items-center gap-2 rounded-lg border border-surface-border px-3 py-2 text-sm text-neutral-700 hover:bg-surface-muted"
            >
              <LogOut size={14} /> Sign out
            </button>
            <button
              disabled={busy === "fresh"}
              onClick={startFresh}
              className="w-full rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-accent-low hover:bg-red-50 disabled:opacity-50"
            >
              {busy === "fresh" ? "Creating…" : "Start Fresh (new sheet)"}
            </button>
          </div>
        )}
      </section>

      {access?.access && process.env.NEXT_PUBLIC_STRIPE_PORTAL_URL && (
        <section className="mb-5 rounded-xl2 border border-surface-border bg-white p-4 shadow-card">
          <p className="mb-3 text-sm font-medium text-neutral-900">App</p>
          <a
            href={process.env.NEXT_PUBLIC_STRIPE_PORTAL_URL}
            className="block rounded-lg border border-surface-border px-3 py-2 text-sm text-neutral-700 hover:bg-surface-muted"
          >
            💳 Manage billing
          </a>
        </section>
      )}

      {!access?.access && (
        <section>
          <PricingTiers />
        </section>
      )}

      {message && <p className="mt-3 text-center text-xs font-medium text-neutral-600">{message}</p>}

      <div className="mt-6 flex items-center justify-center gap-4 pb-2 text-xs">
        <a href="/privacy" className="text-blue-600 hover:underline">
          Privacy Policy
        </a>
        <a href="/terms" className="text-blue-600 hover:underline">
          Terms of Service
        </a>
      </div>
    </div>
  );
}
