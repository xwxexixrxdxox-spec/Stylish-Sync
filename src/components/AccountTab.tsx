"use client";

import { useEffect, useState } from "react";
import {
  ExternalLink,
  RefreshCw,
  LogOut,
  ShieldCheck,
  Search,
  Download,
  Share,
  UploadCloud,
  DownloadCloud,
  AlertTriangle,
  HelpCircle,
  Eraser,
  Bell,
} from "lucide-react";
import { InventoryItem, AccessCheckResponse } from "@/lib/types";
import {
  createInventorySpreadsheet,
  getGoogleEmail,
  getRemoteSyncToken,
  isGoogleSheetsConfigured,
  isPickerConfigured,
  newSyncToken,
  openSpreadsheetPicker,
  pullItemsFromSheet,
  pullUsageFromSheet,
  pushItemsToSheet,
  pushUsageToSheet,
  requestAccessToken,
  setRemoteSyncToken,
  sheetUrl,
  signOutGoogle,
} from "@/lib/googleSheets";
import { reconcileUsageFromSheetRows } from "@/lib/usageReport";
import Tooltip from "@/components/Tooltip";
import ConfirmDialog from "@/components/ConfirmDialog";
import {
  getLastSyncedAt,
  getLastSyncToken,
  getSyncedUsageIds,
  loadMovements,
  replaceMovements,
  setLastSyncedAt,
  setLastSyncToken,
  setLinkedSheetId,
  setSyncedUsageIds,
  startFreshInventory,
} from "@/lib/storage";
import {
  getDeferredInstallPrompt,
  isIosSafari,
  isStandalone,
  subscribeInstallPrompt,
  triggerInstallPrompt,
} from "@/lib/installPrompt";
import {
  disablePushReminders,
  enablePushReminders,
  getExistingPushSubscription,
  isPushSupported,
} from "@/lib/pushReminders";
import PricingTiers from "./PricingTiers";
import DevAccessToggle from "./DevAccessToggle";

// Coarse "how long ago" for the Last synced line — doesn't need
// second-level precision, just enough for someone to eyeball "that's from
// this morning" vs "that's from three days ago" when checking whether this
// device is likely to be behind another one.
function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

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
  // Lets a customer pull the new-customer walkthrough back up on demand
  // (see TutorialOverlay.tsx) even long after its one automatic launch on
  // a fresh install has come and gone. Optional since this panel is also
  // reused in contexts that don't wire up the tour.
  onReplayTutorial?: () => void;
}

export default function AccountTab({ items, onImport, sheetId, setSheetId, access, onBookingMatch, onReplayTutorial }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [trackOpen, setTrackOpen] = useState(false);
  const [trackEmail, setTrackEmail] = useState("");
  // Local "Start Fresh" — the non-Google counterpart to the Google Sheets
  // section's "Start Fresh (new sheet)" button below. Separate confirm gate
  // from ClearCacheButton's (header icon) since this is scoped specifically
  // to wiping inventory/usage back to empty, not app files/service worker.
  const [confirmingLocalFresh, setConfirmingLocalFresh] = useState(false);
  const [localFreshBusy, setLocalFreshBusy] = useState(false);
  const [trackBusy, setTrackBusy] = useState(false);
  const [trackError, setTrackError] = useState<string | null>(null);
  const [installable, setInstallable] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [alreadyInstalled, setAlreadyInstalled] = useState(false);
  const [showIosInstructions, setShowIosInstructions] = useState(false);
  // Reorder-reminder push notifications (see pushReminders.ts). "unknown"
  // until the async subscription check on mount resolves, so the toggle
  // never flashes the wrong state.
  const [remindersState, setRemindersState] = useState<"unknown" | "unsupported" | "off" | "on">("unknown");
  const [remindersBusy, setRemindersBusy] = useState(false);

  useEffect(() => {
    if (!isPushSupported()) {
      setRemindersState("unsupported");
      return;
    }
    let cancelled = false;
    getExistingPushSubscription().then((sub) => {
      if (!cancelled) setRemindersState(sub ? "on" : "off");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleReminders = async () => {
    setRemindersBusy(true);
    try {
      if (remindersState === "on") {
        await disablePushReminders();
        setRemindersState("off");
        flash("Reorder reminders turned off — the stored summary was deleted.");
      } else {
        const result = await enablePushReminders(items);
        if (result === "enabled") {
          setRemindersState("on");
          flash("Reorder reminders are on. You'll only ever get a notification when something's actually worth checking.");
        } else if (result === "denied") {
          flash("Notifications are blocked for this site — allow them in your browser settings, then try again.");
        } else {
          flash("Couldn't enable reminders on this device. Try again in a moment.");
        }
      }
    } finally {
      setRemindersBusy(false);
    }
  };
  // Set when a push is about to overwrite changes another device made to
  // the sheet since this device last synced — see pushToSheetId below for
  // the actual detection. Holds the spreadsheet id so the modal's
  // "pull first" / "overwrite anyway" buttons know what to act on without
  // relying on the sheetId prop still matching (it will, in practice, but
  // being explicit here avoids a subtle bug if that ever changes).
  const [conflict, setConflict] = useState<{ targetId: string } | null>(null);
  const [showSyncHelp, setShowSyncHelp] = useState(false);
  // Purely informational "Last synced" line — see storage.ts's
  // getLastSyncedAt/setLastSyncedAt. Re-read whenever sheetId changes (a
  // fresh link, or switching sheets via the picker) and stamped fresh
  // after every successful push/pull in pushToSheetId/pullFromSheetId.
  const [lastSyncedAt, setLastSyncedAtState] = useState<string | null>(null);

  useEffect(() => {
    setLastSyncedAtState(sheetId ? getLastSyncedAt(sheetId) : null);
  }, [sheetId]);

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

  // Pushes both Inventory and Usage to `targetId` and stamps a fresh sync
  // token afterward — the one place all "send my local state to the
  // sheet" flows funnel through, so the conflict check can't accidentally
  // be skipped by a call site that forgot it. Returns "conflict" instead
  // of pushing when the sheet has a token this device hasn't seen (i.e.
  // some other device pushed since this device last synced here) — unless
  // `force` is set, which is what "overwrite anyway" uses to push past
  // that warning on purpose.
  // Stamps "synced just now" both to storage (so it survives a reload/other
  // tab) and to this component's own state (so the "Last synced" line
  // updates immediately rather than waiting for a remount).
  const stampSynced = (targetId: string) => {
    const iso = new Date().toISOString();
    setLastSyncedAt(targetId, iso);
    setLastSyncedAtState(iso);
  };

  const pushToSheetId = async (targetId: string, opts?: { force?: boolean }): Promise<"done" | "conflict"> => {
    if (!opts?.force) {
      const remoteToken = await getRemoteSyncToken(targetId);
      const localToken = getLastSyncToken(targetId);
      // Only a real mismatch against a token this device previously saw
      // counts as a conflict — a brand-new link (no local token yet) or a
      // spreadsheet with no token yet (never pushed by this feature
      // before) both mean "nothing to conflict with."
      if (localToken && remoteToken && remoteToken !== localToken) {
        return "conflict";
      }
    }
    await pushItemsToSheet(targetId, items);
    await pushUsageToSheet(targetId, loadMovements(), items);
    const token = newSyncToken();
    await setRemoteSyncToken(targetId, token);
    setLastSyncToken(targetId, token);
    stampSynced(targetId);
    return "done";
  };

  // Pulls both Inventory and Usage from `targetId` into local storage and
  // records the sheet's current token as "seen," so this device won't get
  // a false conflict warning on its next push for changes it just pulled
  // itself. The Usage side goes through reconcileUsageFromSheetRows rather
  // than a blind overwrite, so edits/deletions made directly in the sheet
  // are respected (see that function's comment for the exact rules).
  const pullFromSheetId = async (
    targetId: string
  ): Promise<{ itemCount: number; added: number; updated: number; deleted: number; unmatchedBarcodes: string[] }> => {
    const remoteItems = await pullItemsFromSheet(targetId);
    onImport(remoteItems);

    const sheetRows = await pullUsageFromSheet(targetId);
    const previouslySynced = getSyncedUsageIds(targetId);
    // Matched against remoteItems (this pull's fresh item list), not the
    // items prop — bulkImport's merge (see page.tsx) gives a matched
    // barcode the *imported* item's id, so remoteItems already has the
    // ids usage rows need to resolve against post-merge.
    const result = reconcileUsageFromSheetRows(sheetRows, loadMovements(), remoteItems, previouslySynced);
    replaceMovements(result.movements);
    setSyncedUsageIds(targetId, result.syncedIds);

    const remoteToken = await getRemoteSyncToken(targetId);
    if (remoteToken) setLastSyncToken(targetId, remoteToken);
    stampSynced(targetId);

    return {
      itemCount: remoteItems.length,
      added: result.added,
      updated: result.updated,
      deleted: result.deleted,
      unmatchedBarcodes: result.unmatchedBarcodes,
    };
  };

  const summarizePull = (r: { itemCount: number; added: number; updated: number; deleted: number; unmatchedBarcodes: string[] }) => {
    const usageBits: string[] = [];
    if (r.added) usageBits.push(`${r.added} new`);
    if (r.updated) usageBits.push(`${r.updated} updated`);
    if (r.deleted) usageBits.push(`${r.deleted} removed`);
    const usagePart = usageBits.length ? `${usageBits.join(", ")} usage row(s)` : "no usage changes";
    let msg = `Pulled ${r.itemCount} item(s) — ${usagePart}.`;
    if (r.unmatchedBarcodes.length) {
      msg += ` ${r.unmatchedBarcodes.length} usage row barcode(s) in the sheet didn't match an item in your inventory.`;
    }
    return msg;
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
          const result = await pullFromSheetId(picked);
          flash(`Connected — ${summarizePull(result)}`);
          return;
        }
        const id = await createInventorySpreadsheet();
        setSheetId(id);
        setLinkedSheetId(id);
        // Nothing to conflict with on a spreadsheet this device just
        // created — force the first push through.
        await pushToSheetId(id, { force: true });
        flash("Connected and synced to a new Google Sheet.");
        return;
      }

      const result = await pushToSheetId(sheetId);
      if (result === "conflict") {
        setConflict({ targetId: sheetId });
        return;
      }
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

  // "Push to Sheet" — sends this device's current inventory and usage to
  // the linked sheet, overwriting what's there. Named (and warned) as a
  // push specifically because that's the direction that can lose data:
  // see pushToSheetId for the conflict check this goes through first.
  const pushNow = async () => {
    if (!sheetId) return;
    setBusy("push");
    try {
      const result = await pushToSheetId(sheetId);
      if (result === "conflict") {
        setConflict({ targetId: sheetId });
        return;
      }
      flash("Pushed your current inventory and usage to your Google Sheet.");
    } catch (e: any) {
      flash(e.message ?? "Push failed.");
    } finally {
      setBusy(null);
    }
  };

  // "Pull from Sheet" — brings the sheet's current inventory and usage
  // into this device, including reconciling any edits/deletions made
  // directly in the Usage tab. Never overwrites the *sheet*, so there's
  // nothing to warn about here the way there is for a push.
  const pullNow = async () => {
    setBusy("pull");
    try {
      // Always let the customer browse and pick which sheet to pull from
      // — not just re-pull whatever's currently linked — so switching to a
      // different existing spreadsheet is possible at any time.
      let targetId = sheetId;
      if (isPickerConfigured()) {
        const token = await requestAccessToken();
        const picked = await openSpreadsheetPicker(token);
        if (!picked) return; // picker closed without a selection — not an error
        targetId = picked;
        setSheetId(picked);
        setLinkedSheetId(picked);
      }
      if (!targetId) return;
      const result = await pullFromSheetId(targetId);
      flash(summarizePull(result));
    } catch (e: any) {
      flash(e.message ?? "Pull failed.");
    } finally {
      setBusy(null);
    }
  };

  const resolveConflictByPulling = async () => {
    if (!conflict) return;
    setBusy("pull");
    try {
      const result = await pullFromSheetId(conflict.targetId);
      flash(`${summarizePull(result)} Push again if you still want to send your own changes too.`);
    } catch (e: any) {
      flash(e.message ?? "Pull failed.");
    } finally {
      setConflict(null);
      setBusy(null);
    }
  };

  const resolveConflictByOverwriting = async () => {
    if (!conflict) return;
    setBusy("push");
    try {
      await pushToSheetId(conflict.targetId, { force: true });
      flash("Overwrote the sheet with this device's inventory and usage.");
    } catch (e: any) {
      flash(e.message ?? "Push failed.");
    } finally {
      setConflict(null);
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

  // Wipes this device's inventory/usage back to empty (see
  // startFreshInventory's comment for why it writes [] instead of just
  // deleting the key) and reloads — the same "clear storage, then reload
  // so every read path picks up the new state" pattern ClearCacheButton
  // uses, which is simpler and more reliable here than trying to push an
  // empty array through page.tsx's items state (that state only persists
  // back to storage when non-empty, to avoid wiping real data during the
  // brief window before the initial loadItems() call resolves).
  const startFreshLocalInventory = () => {
    setLocalFreshBusy(true);
    startFreshInventory();
    window.location.reload();
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
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-medium text-neutral-900">Google Sheets</p>
          {isGoogleSheetsConfigured() && sheetId && (
            <Tooltip label="What's the difference between Push and Pull?">
              <button
                onClick={() => setShowSyncHelp((v) => !v)}
                aria-label="What's the difference between Push and Pull?"
                className="text-neutral-400 hover:text-neutral-600"
              >
                <HelpCircle size={16} />
              </button>
            </Tooltip>
          )}
        </div>

        {showSyncHelp && (
          <div className="mb-3 space-y-2 rounded-lg bg-surface-muted p-3 text-xs text-neutral-600">
            <p>
              <span className="font-medium text-neutral-800">Push to Sheet</span> sends this device's inventory and
              usage to the sheet, replacing what's there.
            </p>
            <p>
              <span className="font-medium text-neutral-800">Pull from Sheet</span> brings the sheet's inventory and
              usage into this device — including any rows you edited or deleted directly in the sheet's Usage tab.
            </p>
            <p>
              Signed in on more than one device? Always Pull before you Push if you're not sure the sheet has your
              latest changes — Push will warn you first if another device has synced more recently, but Pull is the
              safe way to check. The "Last synced" line below shows how current this device is.
            </p>
            <p>
              This protects against two devices taking turns — it isn't real-time. If two people edit at the exact
              same moment on different devices, whoever pushes second still gets the warning, but their own edits
              made since their last sync would need a manual merge rather than being combined automatically.
            </p>
          </div>
        )}

        {!isGoogleSheetsConfigured() ? (
          <p className="text-xs text-neutral-500">
            Google Sheets sync isn't configured for this deployment yet — see the README's "Google Sheets setup"
            section.
          </p>
        ) : !sheetId ? (
          <button
            disabled={busy === "connect"}
            onClick={connectGoogle}
            data-tutorial="google-signin"
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
              disabled={busy === "push"}
              onClick={pushNow}
              className="flex w-full items-center gap-2 rounded-lg border border-surface-border px-3 py-2 text-sm text-neutral-700 hover:bg-surface-muted disabled:opacity-50"
            >
              <UploadCloud size={14} /> {busy === "push" ? "Pushing…" : "Push to Sheet"}
            </button>
            <button
              disabled={busy === "pull"}
              onClick={pullNow}
              className="flex w-full items-center gap-2 rounded-lg border border-surface-border px-3 py-2 text-sm text-neutral-700 hover:bg-surface-muted disabled:opacity-50"
            >
              <DownloadCloud size={14} /> {busy === "pull" ? "Pulling…" : "Pull from Sheet"}
            </button>
            {lastSyncedAt && (
              <p className="px-1 text-[11px] text-neutral-400">Last synced on this device: {formatRelativeTime(lastSyncedAt)}</p>
            )}
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

      {remindersState !== "unsupported" && (
        <section className="mb-5 rounded-xl2 border border-surface-border bg-white p-4 shadow-card">
          <p className="mb-3 text-sm font-medium text-neutral-900">Reorder Reminders</p>
          <button
            disabled={remindersBusy || remindersState === "unknown"}
            onClick={toggleReminders}
            className={`flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50 ${
              remindersState === "on"
                ? "border border-surface-border text-neutral-700 hover:bg-surface-muted"
                : "bg-neutral-900 text-white hover:opacity-90"
            }`}
          >
            <Bell size={14} />
            {remindersBusy
              ? "Working…"
              : remindersState === "on"
                ? "Turn off daily reminders"
                : "Turn on daily reminders"}
          </button>
          <p className="mt-2 text-[11px] leading-relaxed text-neutral-400">
            A daily notification naming the exact items worth acting on — what&apos;s below its reorder point, and
            which fast-moving items are on pace to run out — with real quantities from your own usage. If nothing
            needs attention, no notification is sent. Turning this on stores a small summary of those items (names
            and counts only) on our server so reminders work while the app is closed; turning it off deletes it.
            {isIosSafari() && " On iPhone/iPad, install the app to your home screen first — iOS only delivers web notifications to installed apps."}
          </p>
        </section>
      )}

      <section className="mb-5 rounded-xl2 border border-surface-border bg-white p-4 shadow-card">
        <p className="mb-3 text-sm font-medium text-neutral-900">Inventory Data</p>
        <button
          disabled={localFreshBusy}
          onClick={() => setConfirmingLocalFresh(true)}
          data-tutorial="start-fresh-local"
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-accent-low hover:bg-red-50 disabled:opacity-50"
        >
          <Eraser size={14} /> {localFreshBusy ? "Clearing…" : "Start Fresh (clear inventory)"}
        </button>
        <p className="mt-2 text-[11px] text-neutral-400">
          Clears every item and usage record on this device and starts with an empty inventory — no Google account
          needed. {sheetId && "Your linked Google Sheet isn't touched; pull from it afterward if you want that data back."}
        </p>
        {onReplayTutorial && (
          <button
            onClick={onReplayTutorial}
            className="mt-3 w-full text-center text-xs font-medium text-neutral-400 hover:text-neutral-600"
          >
            ↻ Replay the welcome tour
          </button>
        )}
      </section>

      {confirmingLocalFresh && (
        <ConfirmDialog
          title="Start fresh?"
          message={
            "This clears every item and usage record on this device and starts with a completely empty inventory " +
            "— including the 3 sample items new installs start with, if you still have those. This can't be undone." +
            (sheetId ? " Your linked Google Sheet itself isn't touched — pull from it afterward to bring that data back onto this device." : "")
          }
          confirmLabel="Start fresh"
          busy={localFreshBusy}
          onCancel={() => setConfirmingLocalFresh(false)}
          onConfirm={startFreshLocalInventory}
        />
      )}

      {conflict && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="w-full max-w-sm rounded-xl2 bg-white p-5 shadow-card">
            <div className="mb-2 flex items-center gap-2 text-amber-700">
              <AlertTriangle size={18} />
              <p className="text-sm font-semibold">This sheet has newer changes</p>
            </div>
            <p className="mb-4 text-sm text-neutral-600">
              Another device has synced to this Google Sheet since this device last did. Pushing now would overwrite
              those changes. Pull them in first, or push your own changes anyway?
            </p>
            <div className="space-y-2">
              <button
                disabled={busy === "pull" || busy === "push"}
                onClick={resolveConflictByPulling}
                className="w-full rounded-lg bg-neutral-900 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
              >
                {busy === "pull" ? "Pulling…" : "Pull first (recommended)"}
              </button>
              <button
                disabled={busy === "pull" || busy === "push"}
                onClick={resolveConflictByOverwriting}
                className="w-full rounded-lg border border-red-200 py-2 text-sm font-medium text-accent-low hover:bg-red-50 disabled:opacity-50"
              >
                {busy === "push" ? "Overwriting…" : "Overwrite anyway"}
              </button>
              <button
                disabled={busy === "pull" || busy === "push"}
                onClick={() => setConflict(null)}
                className="w-full rounded-lg py-2 text-sm text-neutral-500 hover:bg-surface-muted disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

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
