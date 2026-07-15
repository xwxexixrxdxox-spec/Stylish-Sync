"use client";

import { useState } from "react";
import { ExternalLink, RefreshCw, LogOut, FilePlus2, ShieldCheck, Trash2 } from "lucide-react";
import { InventoryItem, AccessCheckResponse } from "@/lib/types";
import {
  createInventorySpreadsheet,
  isGoogleSheetsConfigured,
  pullItemsFromSheet,
  pushItemsToSheet,
  requestAccessToken,
  sheetUrl,
  signOutGoogle,
} from "@/lib/googleSheets";
import { clearAppCache, setLinkedSheetId } from "@/lib/storage";
import PricingTiers from "./PricingTiers";
import DevAccessToggle from "./DevAccessToggle";
import RestoreAccess from "./RestoreAccess";

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
      await requestAccessToken(true);
      let id = sheetId;
      if (!id) {
        id = await createInventorySpreadsheet();
        setSheetId(id);
        setLinkedSheetId(id);
      }
      await pushItemsToSheet(id, items);
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
    if (!sheetId) return;
    setBusy("import");
    try {
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

  return (
    <div className="mx-auto max-w-2xl px-4 pb-24 pt-5 sm:px-6">
      <h1 className="mb-4 text-lg font-semibold text-neutral-900">Account</h1>

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

      <section className="mb-5 rounded-xl2 border border-surface-border bg-white p-4 shadow-card">
        <p className="mb-3 text-sm font-medium text-neutral-900">Google Sheets</p>
        {!access?.access ? (
          <p className="text-xs text-neutral-500">
            Google Sheets two-way sync is a Premium feature. Subscribe below to connect your spreadsheet.
          </p>
        ) : !isGoogleSheetsConfigured() ? (
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

      <section className="mb-5 rounded-xl2 border border-surface-border bg-white p-4 shadow-card">
        <p className="mb-3 text-sm font-medium text-neutral-900">App</p>
        <a
          href="/privacy"
          className="block rounded-lg border border-surface-border px-3 py-2 text-sm text-neutral-700 hover:bg-surface-muted"
        >
          🔒 Privacy Policy
        </a>
        <a
          href="/terms"
          className="mt-2 block rounded-lg border border-surface-border px-3 py-2 text-sm text-neutral-700 hover:bg-surface-muted"
        >
          📄 Terms of Service
        </a>
        <button
          onClick={async () => {
            await clearAppCache();
            flash("Cache cleared. Reloading…");
            setTimeout(() => window.location.reload(), 800);
          }}
          className="mt-2 flex w-full items-center gap-2 rounded-lg border border-surface-border px-3 py-2 text-sm text-neutral-700 hover:bg-surface-muted"
        >
          <Trash2 size={14} /> Clear Cache & Reload
        </button>
        {access?.access && process.env.NEXT_PUBLIC_STRIPE_PORTAL_URL && (
          <a
            href={process.env.NEXT_PUBLIC_STRIPE_PORTAL_URL}
            className="mt-2 block rounded-lg border border-surface-border px-3 py-2 text-sm text-neutral-700 hover:bg-surface-muted"
          >
            💳 Manage billing
          </a>
        )}
      </section>

      {!access?.access && (
        <section>
          <RestoreAccess />
          <PricingTiers />
        </section>
      )}

      {message && <p className="mt-3 text-center text-xs font-medium text-neutral-600">{message}</p>}
    </div>
  );
}
