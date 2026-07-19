"use client";

import { useEffect, useState } from "react";
import { ExternalLink, RefreshCw, LogOut, FilePlus2, ShieldCheck, Search, Download, Share } from "lucide-react";
import { InventoryItem, AccessCheckResponse } from "@/lib/types";
import {
  createInventorySpreadsheet,
  getGoogleEmail,
  isGoogleSheetsConfigured,
  isPickerConfigured,
  openSpreadsheetPicker,
  pullItemsFromSheet,
  pushItemsToSheet,
  pushUsageToSheet,
  requestAccessToken,
  sheetUrl,
  signOutGoogle,
} from "@/lib/googleSheets";
import { loadMovements, setLinkedSheetId } from "@/lib/storage";
import {
  getDeferredInstallPrompt,
  isIosSafari,
  isStandalone,
  subscribeInstallPrompt,
  triggerInstallPrompt,
} from "@/lib/installPrompt";
import PricingTiers from "./PricingTiers";
import DevAccessToggle from "./DevAccessToggle";

interface Props {
  items: InventoryItem[];
  onImport: (items: InventoryItem[]) => void;
  sheetId: string | null;
  setSheetId: (id: string | null) => void;
  access: AccessCheckResponse | null;
  // Called with a booking id when the signed-in Google account's email
  // matches an active visit booking, so the app shell can surface the
  // minimal "Status" tab — or with null on sign-out, to hide it again.
  onBookingMatch?: (bookingId: string | null) => void;
}

export default function AccountTab({ items, onImport, sheetId, setSheetId, access, onBookingMatch }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [trackOpen, setTrackOpen] = useState(false);
  const [trackEmail, setTrackEmail] = useState("");
  const [trackBusy, setTrackBusy] = useState(false);
  const [trackError, setTrackError] = useState<string | null>(null);
  const [installable, setInstallable] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [alreadyInstalled, setAlreadyInstalled] = useState(false);
  const [showIosInstructions, setShowIosInstructions] = useState(false);

  // Re-render whenever a native install prompt becomes available (or gets
  // used up) — see installPrompt.ts. Checked once on mount too, in case the
  // event already fired before this panel mounted.
  useEffect(() => {
    const sync = () => setInstallable(!!getDeferredInstallPrompt());
    sync();
    setAlreadyInstalled(isStandalone());
    return subscribeInstallPrompt(sync);
  }, []);

  const installApp = async () => {
    if (isIosSafari()) {
      setShowIosInstructions((v) => !v);
      return;
    }
    setInstalling(true);
    try {
      const accepted = await triggerInstallPrompt();
      flash(accepted ? "Installed! Look for it on your home screen." : "No worries — you can install it later too.");
    } finally {
      setInstalling(false);
    }
  };

  const flash = (msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(null), 4000);
  };

  // Best-effort, silent check: if the Google account the customer just
  // signed into also booked a visit, surface the minimal status tab
  // without making them type their email again. Never throws — a failure
  // here just means the tab doesn't appear, not a broken sign-in.
  const checkForMatchingBooking = async (token: string) => {
    try {
      const email = await getGoogleEmail(token);
      if (!email) return;
      const res = await fetch("/api/book-appointment/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const body = await res.json();
      if (res.ok && body.ok) onBookingMatch?.(body.id);
    } catch {
      // silent — this is a nice-to-have, not core to sign-in
    }
  };

  const connectGoogle = async () => {
    setBusy("connect");
    try {
      const token = await requestAccessToken(true);
      checkForMatchingBooking(token);

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
        await pushUsageToSheet(id, loadMovements(), items);
        flash("Connected and synced to a new Google Sheet.");
        return;
      }

      await pushItemsToSheet(sheetId, items);
      await pushUsageToSheet(sheetId, loadMovements(), items);
      flash("Connected and synced to Google Sheets.");
    } catch (e: any) {
      flash(e.message ?? "Couldn't connect to Google.");
    } finally {
      setBusy(null);
    }
  };

  const findBooking = async () => {
    if (!trackEmail.trim()) return;
    setTrackBusy(true);
    setTrackError(null);
    try {
      const res = await fetch("/api/book-appointment/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trackEmail.trim() }),
      });
      const body = await res.json();
      if (res.ok && body.ok) {
        window.location.href = `/book_appointment/status?id=${encodeURIComponent(body.id)}`;
      } else {
        setTrackError(body.error ?? "No active booking found for that email.");
      }
    } catch {
      setTrackError("Something went wrong. Try again.");
    } finally {
      setTrackBusy(false);
    }
  };

  const syncNow = async () => {
    if (!sheetId) return;
    setBusy("sync");
    try {
      await pushItemsToSheet(sheetId, items);
      await pushUsageToSheet(sheetId, loadMovements(), items);
      flash("Synced current inventory and usage to your Google Sheet.");
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
    onBookingMatch?.(null);
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

      <section className="mb-5 rounded-xl2 border border-surface-border bg-white p-4 shadow-card">
        <p className="mb-3 text-sm font-medium text-neutral-900">Booked a visit?</p>
        {!trackOpen ? (
          <button
            onClick={() => setTrackOpen(true)}
            className="flex w-full items-center gap-2 rounded-lg border border-surface-border px-3 py-2 text-sm text-neutral-700 hover:bg-surface-muted"
          >
            <Search size={14} /> Track your booking status
          </button>
        ) : (
          <div className="space-y-2">
            <input
              type="email"
              autoFocus
              placeholder="Email you booked with"
              value={trackEmail}
              onChange={(e) => setTrackEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && findBooking()}
              className="w-full rounded-lg border border-surface-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-neutral-900"
            />
            <button
              disabled={trackBusy}
              onClick={findBooking}
              className="w-full rounded-lg border border-neutral-900 bg-neutral-900 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              {trackBusy ? "Looking up…" : "Find my booking"}
            </button>
            {trackError && <p className="text-xs font-medium text-accent-low">{trackError}</p>}
          </div>
        )}
      </section>

      {!alreadyInstalled && (installable || isIosSafari()) && (
        <section className="mb-5 rounded-xl2 border border-surface-border bg-white p-4 shadow-card">
          <p className="mb-3 text-sm font-medium text-neutral-900">Install app</p>
          <button
            disabled={installing}
            onClick={installApp}
            className="flex w-full items-center gap-2 rounded-lg border border-surface-border px-3 py-2 text-sm text-neutral-700 hover:bg-surface-muted disabled:opacity-50"
          >
            <Download size={14} /> {installing ? "Installing…" : "Install app on this device"}
          </button>
          {showIosInstructions && (
            <p className="mt-2 flex items-start gap-1.5 text-xs text-neutral-500">
              <Share size={13} className="mt-0.5 shrink-0" /> Tap the Share icon in Safari, then "Add to Home
              Screen."
            </p>
          )}
        </section>
      )}

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
