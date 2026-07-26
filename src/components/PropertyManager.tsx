"use client";

import { useEffect, useState } from "react";
import {
  Plus,
  Trash2,
  UploadCloud,
  DownloadCloud,
  Package,
  Wrench,
  AlertTriangle,
  Search,
  ShoppingCart,
  ChevronDown,
  Clock,
} from "lucide-react";
import {
  PropertyItem,
  OrderedPart,
  MaintenanceTask,
  Unit,
  ORDERED_PART_STATUS_OPTIONS,
  MAINTENANCE_TASK_STATUS_OPTIONS,
} from "@/lib/types";
import {
  loadPropertyItems,
  savePropertyItems,
  getLinkedSheetId,
  getEditorName,
  getLastPropertySyncedAt,
  setLastPropertySyncedAt,
  getLastPropertySyncToken,
  setLastPropertySyncToken,
} from "@/lib/storage";
import {
  pushPropertyToSheet,
  pullPropertyFromSheet,
  getRemotePropertySyncToken,
  setRemotePropertySyncToken,
  newSyncToken,
  sheetUrl,
} from "@/lib/googleSheets";
import { lookupBarcodeCandidates, BarcodeLookupResult } from "@/lib/productLookup";
import { lookupCommunityBarcode } from "@/lib/communityLookup";
import { RETAILERS } from "@/lib/retailerSearch";
import { formatRelativeTime } from "@/lib/time";

// Same unit list ScanTab.tsx/ReceiptScanTab.tsx use for their own manual-
// entry dropdowns — kept as a local copy rather than a new shared export,
// matching how those two already each keep their own copy rather than a
// shared constant.
const UNITS: Unit[] = [
  "ea", "box", "case", "pack", "bag", "bottle", "can", "roll", "dozen", "pair",
  "kg", "lb", "oz", "g", "L", "ml", "fl oz",
];

// What PropertyCard's "Add a part" mini-form hands back to addPart below —
// partNumber/unit/pricePerUnit are whatever the barcode/UPC lookup filled
// in (or the customer typed over it), same optional shape as OrderedPart
// itself.
interface NewPartInput {
  partNumber?: string;
  description: string;
  unit?: Unit;
  pricePerUnit?: number;
}
import ConfirmDialog from "@/components/ConfirmDialog";

// Manages the Property list end-to-end (create/edit/delete a property, and
// its two independently status-tracked sub-lists — ordered parts and
// maintenance tasks) and syncs it to the "Property" tab on whatever Google
// Sheet is already linked from the Inventory side (see AccountTab.tsx) —
// this page deliberately never creates its own spreadsheet; Property only
// ever writes into the *same* sheet the customer already connected, into
// its own tab, so there's exactly one spreadsheet per customer to keep
// track of rather than two.
export default function PropertyManager() {
  const [properties, setProperties] = useState<PropertyItem[]>([]);
  const [sheetId, setSheetId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAtState] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Add-property inline form state.
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newLocation, setNewLocation] = useState("");
  const [newSerial, setNewSerial] = useState("");
  const [newNotes, setNewNotes] = useState("");

  useEffect(() => {
    setProperties(loadPropertyItems());
    const id = getLinkedSheetId();
    setSheetId(id);
    if (id) setLastSyncedAtState(getLastPropertySyncedAt(id));
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (loaded) savePropertyItems(properties);
  }, [properties, loaded]);

  const flash = (msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(null), 4000);
  };

  const touch = (): { updatedAt: string; lastEditedBy: string | undefined } => ({
    updatedAt: new Date().toISOString(),
    lastEditedBy: getEditorName() ?? undefined,
  });

  const addProperty = () => {
    if (!newName.trim()) return;
    const { updatedAt, lastEditedBy } = touch();
    const item: PropertyItem = {
      id: `prop-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: newName.trim(),
      location: newLocation.trim() || undefined,
      serialNumber: newSerial.trim() || undefined,
      notes: newNotes.trim() || undefined,
      orderedParts: [],
      maintenanceTasks: [],
      updatedAt,
      lastEditedBy,
    };
    setProperties((prev) => [...prev, item]);
    setNewName("");
    setNewLocation("");
    setNewSerial("");
    setNewNotes("");
    setAddOpen(false);
  };

  const updateProperty = (id: string, patch: Partial<PropertyItem>) => {
    const { updatedAt, lastEditedBy } = touch();
    setProperties((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch, updatedAt, lastEditedBy } : p)));
  };

  const deleteProperty = (id: string) => {
    setProperties((prev) => prev.filter((p) => p.id !== id));
    setConfirmDeleteId(null);
  };

  const addPart = (propertyId: string, input: NewPartInput) => {
    if (!input.description.trim()) return;
    const { updatedAt, lastEditedBy } = touch();
    const part: OrderedPart = {
      id: `part-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      partNumber: input.partNumber?.trim() || undefined,
      description: input.description.trim(),
      unit: input.unit,
      pricePerUnit: input.pricePerUnit,
      status: "ordered",
      updatedAt,
      // Seed the story with its first chapter — every part starts life
      // "ordered," so that's the first entry rather than an empty history.
      statusHistory: [{ status: "ordered", at: updatedAt, by: lastEditedBy }],
    };
    setProperties((prev) =>
      prev.map((p) => (p.id === propertyId ? { ...p, orderedParts: [...p.orderedParts, part], updatedAt, lastEditedBy } : p))
    );
  };

  // `note` covers things like a cancellation reason (see the PropertyCard
  // cancel-reason prompt) — optional for every other transition. Appends
  // to statusHistory rather than replacing it, so the full chronological
  // record survives every subsequent change; `status`/`updatedAt` stay the
  // "current state" fields everything else in the app already reads.
  const updatePartStatus = (propertyId: string, partId: string, status: OrderedPart["status"], note?: string) => {
    const { updatedAt, lastEditedBy } = touch();
    setProperties((prev) =>
      prev.map((p) =>
        p.id === propertyId
          ? {
              ...p,
              orderedParts: p.orderedParts.map((part) =>
                part.id === partId
                  ? {
                      ...part,
                      status,
                      updatedAt,
                      statusHistory: [...part.statusHistory, { status, at: updatedAt, note, by: lastEditedBy }],
                    }
                  : part
              ),
              updatedAt,
              lastEditedBy,
            }
          : p
      )
    );
  };

  const removePart = (propertyId: string, partId: string) => {
    const { updatedAt, lastEditedBy } = touch();
    setProperties((prev) =>
      prev.map((p) =>
        p.id === propertyId
          ? { ...p, orderedParts: p.orderedParts.filter((part) => part.id !== partId), updatedAt, lastEditedBy }
          : p
      )
    );
  };

  const addTask = (propertyId: string, description: string) => {
    if (!description.trim()) return;
    const { updatedAt, lastEditedBy } = touch();
    const task: MaintenanceTask = {
      id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      description: description.trim(),
      status: "needed",
      updatedAt,
      statusHistory: [{ status: "needed", at: updatedAt, by: lastEditedBy }],
    };
    setProperties((prev) =>
      prev.map((p) =>
        p.id === propertyId ? { ...p, maintenanceTasks: [...p.maintenanceTasks, task], updatedAt, lastEditedBy } : p
      )
    );
  };

  const updateTaskStatus = (propertyId: string, taskId: string, status: MaintenanceTask["status"], note?: string) => {
    const { updatedAt, lastEditedBy } = touch();
    setProperties((prev) =>
      prev.map((p) =>
        p.id === propertyId
          ? {
              ...p,
              maintenanceTasks: p.maintenanceTasks.map((task) =>
                task.id === taskId
                  ? {
                      ...task,
                      status,
                      updatedAt,
                      statusHistory: [...task.statusHistory, { status, at: updatedAt, note, by: lastEditedBy }],
                    }
                  : task
              ),
              updatedAt,
              lastEditedBy,
            }
          : p
      )
    );
  };

  const removeTask = (propertyId: string, taskId: string) => {
    const { updatedAt, lastEditedBy } = touch();
    setProperties((prev) =>
      prev.map((p) =>
        p.id === propertyId
          ? { ...p, maintenanceTasks: p.maintenanceTasks.filter((task) => task.id !== taskId), updatedAt, lastEditedBy }
          : p
      )
    );
  };

  const stampSynced = (id: string) => {
    const iso = new Date().toISOString();
    setLastPropertySyncedAt(id, iso);
    setLastSyncedAtState(iso);
  };

  // Same push-with-conflict-check shape as AccountTab's pushToSheetId, but
  // scoped entirely to the Property tab's own sync token (see
  // PROPERTY_SYNC_TOKEN_RANGE in googleSheets.ts) — a conflict here means
  // another device pushed Property changes since this device last synced
  // Property, and has nothing to do with Inventory/Usage's own tracking.
  const pushNow = async (force = false) => {
    if (!sheetId) return;
    setBusy("push");
    try {
      if (!force) {
        const remoteToken = await getRemotePropertySyncToken(sheetId);
        const localToken = getLastPropertySyncToken(sheetId);
        if (localToken && remoteToken && remoteToken !== localToken) {
          setConflict(true);
          return;
        }
      }
      await pushPropertyToSheet(sheetId, properties);
      const token = newSyncToken();
      await setRemotePropertySyncToken(sheetId, token);
      setLastPropertySyncToken(sheetId, token);
      stampSynced(sheetId);
      flash("Pushed your property list to the sheet's Property tab.");
    } catch (e: any) {
      flash(e?.message ?? "Push failed.");
    } finally {
      setBusy(null);
    }
  };

  const pullNow = async () => {
    if (!sheetId) return;
    setBusy("pull");
    try {
      const remote = await pullPropertyFromSheet(sheetId);
      setProperties(remote);
      const remoteToken = await getRemotePropertySyncToken(sheetId);
      if (remoteToken) setLastPropertySyncToken(sheetId, remoteToken);
      stampSynced(sheetId);
      flash(`Pulled ${remote.length} propert${remote.length === 1 ? "y" : "ies"} from the sheet.`);
    } catch (e: any) {
      flash(e?.message ?? "Pull failed.");
    } finally {
      setBusy(null);
      setConflict(false);
    }
  };

  if (!loaded) {
    return <p className="py-10 text-center text-sm text-neutral-400">Loading…</p>;
  }

  return (
    <div>
      <section className="mb-5 rounded-xl2 border border-surface-border bg-white p-4 shadow-card">
        <p className="mb-3 text-sm font-medium text-neutral-900">Sync with Google Sheets</p>
        {!sheetId ? (
          <p className="text-xs leading-relaxed text-neutral-500">
            Property syncs into a new <span className="font-medium text-neutral-700">Property</span> tab on the
            same spreadsheet your Inventory already uses — connect Google Sheets from the Account panel first
            (Account → Google Sheets → Sign in with Google), then come back here.
          </p>
        ) : (
          <div className="space-y-2">
            <a
              href={sheetUrl(sheetId)}
              target="_blank"
              rel="noreferrer"
              className="block rounded-lg border border-surface-border px-3 py-2 text-sm text-green-700 hover:bg-surface-muted"
            >
              📗 Open My Google Sheet
            </a>
            <button
              disabled={busy === "push"}
              onClick={() => pushNow(false)}
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
          </div>
        )}
      </section>

      <section className="mb-5 rounded-xl2 border border-surface-border bg-white p-4 shadow-card">
        {!addOpen ? (
          <button
            onClick={() => setAddOpen(true)}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-neutral-900 py-2 text-sm font-semibold text-white hover:opacity-90"
          >
            <Plus size={14} /> Add property
          </button>
        ) : (
          <div className="space-y-2">
            <p className="text-sm font-medium text-neutral-900">New property</p>
            <input
              autoFocus
              placeholder="Name (e.g. Rooftop HVAC unit)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="w-full rounded-lg border border-surface-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-neutral-900"
            />
            <input
              placeholder="Location (optional)"
              value={newLocation}
              onChange={(e) => setNewLocation(e.target.value)}
              className="w-full rounded-lg border border-surface-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-neutral-900"
            />
            <input
              placeholder="Serial number (optional)"
              value={newSerial}
              onChange={(e) => setNewSerial(e.target.value)}
              className="w-full rounded-lg border border-surface-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-neutral-900"
            />
            <textarea
              placeholder="Notes (optional)"
              value={newNotes}
              onChange={(e) => setNewNotes(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-surface-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-neutral-900"
            />
            <div className="flex gap-2">
              <button
                onClick={() => setAddOpen(false)}
                className="flex-1 rounded-lg border border-surface-border py-2 text-sm font-medium text-neutral-700 hover:bg-surface-muted"
              >
                Cancel
              </button>
              <button
                disabled={!newName.trim()}
                onClick={addProperty}
                className="flex-1 rounded-lg bg-neutral-900 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
              >
                Add
              </button>
            </div>
          </div>
        )}
      </section>

      {properties.length === 0 ? (
        <p className="py-8 text-center text-sm text-neutral-400">
          No property tracked yet — add your first item above.
        </p>
      ) : (
        <div className="space-y-4">
          {properties.map((p) => (
            <PropertyCard
              key={p.id}
              property={p}
              onUpdate={(patch) => updateProperty(p.id, patch)}
              onDelete={() => setConfirmDeleteId(p.id)}
              onAddPart={(input) => addPart(p.id, input)}
              onUpdatePartStatus={(partId, status, note) => updatePartStatus(p.id, partId, status, note)}
              onRemovePart={(partId) => removePart(p.id, partId)}
              onAddTask={(desc) => addTask(p.id, desc)}
              onUpdateTaskStatus={(taskId, status, note) => updateTaskStatus(p.id, taskId, status, note)}
              onRemoveTask={(taskId) => removeTask(p.id, taskId)}
            />
          ))}
        </div>
      )}

      {message && <p className="mt-4 text-center text-xs font-medium text-neutral-600">{message}</p>}

      {confirmDeleteId && (
        <ConfirmDialog
          title="Delete this property?"
          message="This removes the property and its ordered-parts / maintenance history from this device. If it's already synced, push again afterward to remove it from the sheet too."
          confirmLabel="Delete"
          busy={false}
          onCancel={() => setConfirmDeleteId(null)}
          onConfirm={() => deleteProperty(confirmDeleteId)}
        />
      )}

      {conflict && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="w-full max-w-sm rounded-xl2 bg-white p-5 shadow-card">
            <div className="mb-2 flex items-center gap-2 text-amber-700">
              <AlertTriangle size={18} />
              <p className="text-sm font-semibold">The Property tab has newer changes</p>
            </div>
            <p className="mb-4 text-sm text-neutral-600">
              Another device has synced Property changes to this sheet since this device last did. Pushing now
              would overwrite those changes. Pull them in first, or push your own changes anyway?
            </p>
            <div className="space-y-2">
              <button
                disabled={busy === "pull" || busy === "push"}
                onClick={pullNow}
                className="w-full rounded-lg bg-neutral-900 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
              >
                {busy === "pull" ? "Pulling…" : "Pull first (recommended)"}
              </button>
              <button
                disabled={busy === "pull" || busy === "push"}
                onClick={() => pushNow(true)}
                className="w-full rounded-lg border border-red-200 py-2 text-sm font-medium text-accent-low hover:bg-red-50 disabled:opacity-50"
              >
                {busy === "push" ? "Overwriting…" : "Overwrite anyway"}
              </button>
              <button
                disabled={busy === "pull" || busy === "push"}
                onClick={() => setConflict(false)}
                className="w-full rounded-lg py-2 text-sm text-neutral-500 hover:bg-surface-muted disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface CardProps {
  property: PropertyItem;
  onUpdate: (patch: Partial<PropertyItem>) => void;
  onDelete: () => void;
  onAddPart: (input: NewPartInput) => void;
  onUpdatePartStatus: (partId: string, status: OrderedPart["status"], note?: string) => void;
  onRemovePart: (partId: string) => void;
  onAddTask: (description: string) => void;
  onUpdateTaskStatus: (taskId: string, status: MaintenanceTask["status"], note?: string) => void;
  onRemoveTask: (taskId: string) => void;
}

function PropertyCard({
  property,
  onUpdate,
  onDelete,
  onAddPart,
  onUpdatePartStatus,
  onRemovePart,
  onAddTask,
  onUpdateTaskStatus,
  onRemoveTask,
}: CardProps) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(property.name);
  const [location, setLocation] = useState(property.location ?? "");
  const [serialNumber, setSerialNumber] = useState(property.serialNumber ?? "");
  const [notes, setNotes] = useState(property.notes ?? "");
  const [newTask, setNewTask] = useState("");

  // "Add a part" mini-form — collapsed by default (see addPartOpen) since
  // it's a 4-field form (part number, description, unit, price) rather
  // than the single-line quick-add the Maintenance list still uses.
  const [addPartOpen, setAddPartOpen] = useState(false);
  const [partNumber, setPartNumber] = useState("");
  const [partDescription, setPartDescription] = useState("");
  const [partUnit, setPartUnit] = useState<Unit>("ea");
  const [partPrice, setPartPrice] = useState("");
  const [priceFromLookup, setPriceFromLookup] = useState(false);
  const [lookupStatus, setLookupStatus] = useState<"idle" | "checking" | "found" | "multiple" | "not-found">("idle");
  const [candidates, setCandidates] = useState<BarcodeLookupResult[]>([]);
  const [findMenuForPartId, setFindMenuForPartId] = useState<string | null>(null);

  // Status-history tracking (2026-07) — expandable "story" panel per
  // part/task (ids are unique across both lists, so one piece of state
  // covers both) and a reason-capture prompt shown specifically when a
  // status change lands on "cancelled," since a cancellation is the one
  // transition where "why" is worth recording alongside "when."
  const [historyOpenFor, setHistoryOpenFor] = useState<string | null>(null);
  const [cancelPromptFor, setCancelPromptFor] = useState<{ kind: "part" | "task"; id: string } | null>(null);
  const [cancelNote, setCancelNote] = useState("");

  // Auto-close for terminal statuses (2026-07) — once a part is Installed
  // or a task is Completed, it's done: leaving it sitting in the same list
  // as active work invites a customer to glance at the page and assume
  // it's still in progress. Cancelled is folded into "closed" too for the
  // same reason (it's equally not-active-work), even though the request
  // named Installed/Completed specifically. Closed entries collapse into
  // their own section, become read-only (no more accidental status
  // flips), and show who closed them out and when, right on the row —
  // full detail is still one tap away via the History panel. "Reopen" is
  // a purely local, transient toggle (see reopenedPartIds/reopenedTaskIds)
  // — it doesn't touch data on its own; only actually picking a new status
  // afterward writes a new (attributed, timestamped) history entry, which
  // is what actually documents the reopening in the audit trail.
  const isPartClosed = (status: OrderedPart["status"]) => status === "installed" || status === "cancelled";
  const isTaskClosed = (status: MaintenanceTask["status"]) => status === "completed" || status === "cancelled";
  const [partsClosedOpen, setPartsClosedOpen] = useState(false);
  const [tasksClosedOpen, setTasksClosedOpen] = useState(false);
  const [reopenedPartIds, setReopenedPartIds] = useState<Set<string>>(new Set());
  const [reopenedTaskIds, setReopenedTaskIds] = useState<Set<string>>(new Set());

  const handlePartStatusChange = (part: OrderedPart, status: OrderedPart["status"]) => {
    if (status === "cancelled") {
      setCancelPromptFor({ kind: "part", id: part.id });
      setCancelNote("");
      return;
    }
    onUpdatePartStatus(part.id, status);
  };

  const handleTaskStatusChange = (task: MaintenanceTask, status: MaintenanceTask["status"]) => {
    if (status === "cancelled") {
      setCancelPromptFor({ kind: "task", id: task.id });
      setCancelNote("");
      return;
    }
    onUpdateTaskStatus(task.id, status);
  };

  const confirmCancel = () => {
    if (!cancelPromptFor) return;
    if (cancelPromptFor.kind === "part") {
      onUpdatePartStatus(cancelPromptFor.id, "cancelled", cancelNote.trim() || undefined);
    } else {
      onUpdateTaskStatus(cancelPromptFor.id, "cancelled", cancelNote.trim() || undefined);
    }
    setCancelPromptFor(null);
    setCancelNote("");
  };

  const orderedPartStatusLabel = (status: OrderedPart["status"]) =>
    ORDERED_PART_STATUS_OPTIONS.find((opt) => opt.value === status)?.label ?? status;
  const maintenanceTaskStatusLabel = (status: MaintenanceTask["status"]) =>
    MAINTENANCE_TASK_STATUS_OPTIONS.find((opt) => opt.value === status)?.label ?? status;

  // Fills the part-number lookup fields from one candidate — same
  // "description always overwrites, price only overwrites (and only then
  // flags as an estimate) when this candidate actually has one" behavior
  // as ScanTab.tsx's applyCandidate, since it's the same underlying
  // lookup and the same "online estimate, not this business's own price"
  // caveat applies here too.
  const applyPartCandidate = (candidate: BarcodeLookupResult) => {
    setPartDescription(candidate.name);
    if (candidate.price !== null) {
      setPartPrice(String(candidate.price));
      setPriceFromLookup(true);
    } else {
      setPriceFromLookup(false);
    }
  };

  // Looks up a typed-in part number the same way ScanTab.tsx resolves a
  // scanned barcode: the shared, crowdsourced community database first
  // (free, name+unit only), then the external UPC/product lookup (can
  // return 0/1/multiple candidates) — see productLookup.ts and
  // communityLookup.ts for why each step is shaped the way it is. There's
  // no camera scan here (unlike Scan/Receipt Scan) since a part number
  // usually comes from a handwritten note or a part's own label the
  // customer is typing in, not a barcode they're pointing a camera at —
  // if that turns out to matter, camera scanning is a natural follow-up.
  const lookupPart = async () => {
    const trimmed = partNumber.trim();
    if (!trimmed) return;
    setLookupStatus("checking");
    setCandidates([]);
    setPriceFromLookup(false);

    const community = await lookupCommunityBarcode(trimmed);
    if (community) {
      setLookupStatus("found");
      setPartDescription(community.name);
      if (community.unit) setPartUnit(community.unit as Unit);
      return;
    }

    const found = await lookupBarcodeCandidates(trimmed);
    if (found.length === 1) {
      setLookupStatus("found");
      applyPartCandidate(found[0]);
      return;
    }
    if (found.length > 1) {
      setLookupStatus("multiple");
      setCandidates(found);
      applyPartCandidate(found[0]);
      return;
    }
    setLookupStatus("not-found");
  };

  const submitNewPart = () => {
    if (!partDescription.trim()) return;
    const price = Number(partPrice);
    onAddPart({
      partNumber: partNumber.trim() || undefined,
      description: partDescription.trim(),
      unit: partUnit,
      pricePerUnit: partPrice.trim() && Number.isFinite(price) ? price : undefined,
    });
    setPartNumber("");
    setPartDescription("");
    setPartUnit("ea");
    setPartPrice("");
    setPriceFromLookup(false);
    setLookupStatus("idle");
    setCandidates([]);
    setAddPartOpen(false);
  };

  // "Find at" query for a part: prefer its part number when it has one —
  // a manufacturer part number usually lands a search directly on the
  // right product, the same reason ReorderTab.tsx's "auto" mode prefers a
  // barcode over a name — falling back to the description otherwise.
  const partQuery = (part: OrderedPart) => part.partNumber || part.description;

  // One row for the Ordered Parts list, shared by the active section and
  // the (reopened) closed section — `editable` is what actually decides
  // whether it shows the live status dropdown or the closed summary/badge,
  // independent of which section it's rendered in.
  const renderPartRow = (part: OrderedPart, editable: boolean) => {
    const closingEntry = part.statusHistory[part.statusHistory.length - 1];
    return (
      <div
        key={part.id}
        className={`rounded-lg px-2 py-1.5 ${editable ? "bg-surface-muted" : "border border-green-200 bg-green-50"}`}
      >
        <div className="flex items-center gap-1.5">
          <div className="min-w-0 flex-1">
            <span className="block truncate text-xs text-neutral-700">{part.description}</span>
            {(part.partNumber || part.pricePerUnit != null) && (
              <span className="block text-[10px] text-neutral-400">
                {part.partNumber && <>#{part.partNumber}</>}
                {part.partNumber && part.pricePerUnit != null && " · "}
                {part.pricePerUnit != null && (
                  <>
                    ${part.pricePerUnit.toFixed(2)}
                    {part.unit ? ` / ${part.unit}` : ""} est.
                  </>
                )}
              </span>
            )}
            {!editable && (
              <span className="block text-[10px] font-medium text-green-700">
                ✓ {orderedPartStatusLabel(part.status)}
                {closingEntry?.by && ` · by ${closingEntry.by}`}
                {" · "}
                {new Date(part.updatedAt).toLocaleDateString()}
              </span>
            )}
          </div>
          {editable ? (
            <select
              value={part.status}
              onChange={(e) => handlePartStatusChange(part, e.target.value as OrderedPart["status"])}
              className="rounded-md border border-surface-border bg-white px-1.5 py-1 text-[11px] outline-none"
            >
              {ORDERED_PART_STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          ) : (
            <button
              onClick={() => setReopenedPartIds((prev) => new Set(prev).add(part.id))}
              className="shrink-0 rounded-md border border-surface-border bg-white px-1.5 py-1 text-[11px] font-medium text-neutral-500 hover:bg-surface-muted"
            >
              Reopen
            </button>
          )}
          <button
            onClick={() => setHistoryOpenFor(historyOpenFor === part.id ? null : part.id)}
            aria-label="View status history"
            className={`flex items-center rounded-md border px-1.5 py-1 ${
              historyOpenFor === part.id
                ? "border-neutral-900 bg-neutral-900 text-white"
                : "border-surface-border bg-white text-neutral-500 hover:bg-surface-muted"
            }`}
          >
            <Clock size={12} />
          </button>
          <div className="relative shrink-0">
            <button
              onClick={() => setFindMenuForPartId(findMenuForPartId === part.id ? null : part.id)}
              aria-label="Find this part at a store"
              className="flex items-center gap-1 rounded-md border border-surface-border bg-white px-1.5 py-1 text-neutral-500 hover:bg-surface-muted"
            >
              <ShoppingCart size={12} />
              <ChevronDown size={10} />
            </button>
            {findMenuForPartId === part.id && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setFindMenuForPartId(null)} />
                <div className="absolute right-0 z-20 mt-1 w-36 overflow-hidden rounded-lg border border-surface-border bg-white shadow-card">
                  {RETAILERS.map((r) => (
                    <a
                      key={r.id}
                      href={r.buildUrl(partQuery(part))}
                      target="_blank"
                      rel="noreferrer"
                      onClick={() => setFindMenuForPartId(null)}
                      className="block px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-surface-muted"
                    >
                      {r.label}
                    </a>
                  ))}
                </div>
              </>
            )}
          </div>
          <button
            onClick={() => onRemovePart(part.id)}
            aria-label="Remove part"
            className="text-neutral-400 hover:text-accent-low"
          >
            <Trash2 size={12} />
          </button>
        </div>

        {cancelPromptFor?.kind === "part" && cancelPromptFor.id === part.id && (
          <div className="mt-1.5 rounded-lg border border-amber-200 bg-amber-50 p-2">
            <p className="mb-1 text-[11px] font-medium text-amber-800">Cancelling — reason (optional)?</p>
            <input
              autoFocus
              value={cancelNote}
              onChange={(e) => setCancelNote(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && confirmCancel()}
              placeholder="e.g. ordered wrong part, no longer needed…"
              className="mb-1.5 w-full rounded-md border border-amber-200 bg-white px-2 py-1 text-[11px] outline-none focus:ring-1 focus:ring-amber-400"
            />
            <div className="flex gap-1.5">
              <button
                onClick={() => setCancelPromptFor(null)}
                className="flex-1 rounded-md border border-surface-border bg-white py-1 text-[11px] font-medium text-neutral-600 hover:bg-surface-muted"
              >
                Never mind
              </button>
              <button
                onClick={confirmCancel}
                className="flex-1 rounded-md bg-accent-low py-1 text-[11px] font-semibold text-white hover:opacity-90"
              >
                Cancel part
              </button>
            </div>
          </div>
        )}

        {historyOpenFor === part.id && (
          <div className="mt-1.5 space-y-1 rounded-lg border border-surface-border bg-white p-2">
            <p className="text-[10px] font-medium uppercase tracking-wide text-neutral-400">Status history</p>
            {[...part.statusHistory]
              .sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0))
              .map((entry, i) => (
                <div key={i} className="text-[11px] text-neutral-600">
                  <span className="font-medium text-neutral-800">{orderedPartStatusLabel(entry.status)}</span>
                  {" — "}
                  {new Date(entry.at).toLocaleString()}
                  {entry.by && <span className="text-neutral-400"> · by {entry.by}</span>}
                  {entry.note && <span className="block text-neutral-400">{entry.note}</span>}
                </div>
              ))}
          </div>
        )}
      </div>
    );
  };

  // Same shape as renderPartRow above, for the Maintenance / repair tasks
  // list.
  const renderTaskRow = (task: MaintenanceTask, editable: boolean) => {
    const closingEntry = task.statusHistory[task.statusHistory.length - 1];
    return (
      <div
        key={task.id}
        className={`rounded-lg px-2 py-1.5 ${editable ? "bg-surface-muted" : "border border-green-200 bg-green-50"}`}
      >
        <div className="flex items-center gap-1.5">
          <div className="min-w-0 flex-1">
            <span className="block text-xs text-neutral-700">{task.description}</span>
            {!editable && (
              <span className="block text-[10px] font-medium text-green-700">
                ✓ {maintenanceTaskStatusLabel(task.status)}
                {closingEntry?.by && ` · by ${closingEntry.by}`}
                {" · "}
                {new Date(task.updatedAt).toLocaleDateString()}
              </span>
            )}
          </div>
          {editable ? (
            <select
              value={task.status}
              onChange={(e) => handleTaskStatusChange(task, e.target.value as MaintenanceTask["status"])}
              className="rounded-md border border-surface-border bg-white px-1.5 py-1 text-[11px] outline-none"
            >
              {MAINTENANCE_TASK_STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          ) : (
            <button
              onClick={() => setReopenedTaskIds((prev) => new Set(prev).add(task.id))}
              className="shrink-0 rounded-md border border-surface-border bg-white px-1.5 py-1 text-[11px] font-medium text-neutral-500 hover:bg-surface-muted"
            >
              Reopen
            </button>
          )}
          <button
            onClick={() => setHistoryOpenFor(historyOpenFor === task.id ? null : task.id)}
            aria-label="View status history"
            className={`flex items-center rounded-md border px-1.5 py-1 ${
              historyOpenFor === task.id
                ? "border-neutral-900 bg-neutral-900 text-white"
                : "border-surface-border bg-white text-neutral-500 hover:bg-surface-muted"
            }`}
          >
            <Clock size={12} />
          </button>
          <button
            onClick={() => onRemoveTask(task.id)}
            aria-label="Remove task"
            className="text-neutral-400 hover:text-accent-low"
          >
            <Trash2 size={12} />
          </button>
        </div>

        {cancelPromptFor?.kind === "task" && cancelPromptFor.id === task.id && (
          <div className="mt-1.5 rounded-lg border border-amber-200 bg-amber-50 p-2">
            <p className="mb-1 text-[11px] font-medium text-amber-800">Cancelling — reason (optional)?</p>
            <input
              autoFocus
              value={cancelNote}
              onChange={(e) => setCancelNote(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && confirmCancel()}
              placeholder="e.g. no longer needed, duplicate task…"
              className="mb-1.5 w-full rounded-md border border-amber-200 bg-white px-2 py-1 text-[11px] outline-none focus:ring-1 focus:ring-amber-400"
            />
            <div className="flex gap-1.5">
              <button
                onClick={() => setCancelPromptFor(null)}
                className="flex-1 rounded-md border border-surface-border bg-white py-1 text-[11px] font-medium text-neutral-600 hover:bg-surface-muted"
              >
                Never mind
              </button>
              <button
                onClick={confirmCancel}
                className="flex-1 rounded-md bg-accent-low py-1 text-[11px] font-semibold text-white hover:opacity-90"
              >
                Cancel task
              </button>
            </div>
          </div>
        )}

        {historyOpenFor === task.id && (
          <div className="mt-1.5 space-y-1 rounded-lg border border-surface-border bg-white p-2">
            <p className="text-[10px] font-medium uppercase tracking-wide text-neutral-400">Status history</p>
            {[...task.statusHistory]
              .sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0))
              .map((entry, i) => (
                <div key={i} className="text-[11px] text-neutral-600">
                  <span className="font-medium text-neutral-800">{maintenanceTaskStatusLabel(entry.status)}</span>
                  {" — "}
                  {new Date(entry.at).toLocaleString()}
                  {entry.by && <span className="text-neutral-400"> · by {entry.by}</span>}
                  {entry.note && <span className="block text-neutral-400">{entry.note}</span>}
                </div>
              ))}
          </div>
        )}
      </div>
    );
  };

  const saveEdit = () => {
    if (!name.trim()) return;
    onUpdate({
      name: name.trim(),
      location: location.trim() || undefined,
      serialNumber: serialNumber.trim() || undefined,
      notes: notes.trim() || undefined,
    });
    setEditing(false);
  };

  return (
    <div className="rounded-xl2 border border-surface-border bg-white p-4 shadow-card">
      {!editing ? (
        <div className="mb-3 flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-neutral-900">{property.name}</p>
            {property.location && <p className="text-xs text-neutral-500">{property.location}</p>}
            {property.serialNumber && <p className="text-xs text-neutral-400">S/N {property.serialNumber}</p>}
            {property.notes && <p className="mt-1 text-xs text-neutral-500">{property.notes}</p>}
            {property.lastEditedBy && (
              <p className="mt-1 text-[11px] text-neutral-400">
                Edited by {property.lastEditedBy} · {formatRelativeTime(property.updatedAt)}
              </p>
            )}
          </div>
          <div className="flex shrink-0 gap-1">
            <button
              onClick={() => setEditing(true)}
              className="rounded-lg px-2 py-1 text-xs font-medium text-neutral-500 hover:bg-surface-muted"
            >
              Edit
            </button>
            <button
              onClick={onDelete}
              aria-label="Delete property"
              className="rounded-lg p-1.5 text-neutral-400 hover:bg-red-50 hover:text-accent-low"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      ) : (
        <div className="mb-3 space-y-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-surface-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-neutral-900"
          />
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Location"
            className="w-full rounded-lg border border-surface-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-neutral-900"
          />
          <input
            value={serialNumber}
            onChange={(e) => setSerialNumber(e.target.value)}
            placeholder="Serial number"
            className="w-full rounded-lg border border-surface-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-neutral-900"
          />
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes"
            rows={2}
            className="w-full rounded-lg border border-surface-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-neutral-900"
          />
          <div className="flex gap-2">
            <button
              onClick={() => setEditing(false)}
              className="flex-1 rounded-lg border border-surface-border py-1.5 text-xs font-medium text-neutral-700 hover:bg-surface-muted"
            >
              Cancel
            </button>
            <button
              disabled={!name.trim()}
              onClick={saveEdit}
              className="flex-1 rounded-lg bg-neutral-900 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              Save
            </button>
          </div>
        </div>
      )}

      <div className="mb-3 border-t border-surface-border pt-3">
        <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-neutral-700">
          <Package size={13} /> Ordered parts
        </p>
        <div className="space-y-1.5">
          {property.orderedParts
            .filter((part) => !isPartClosed(part.status))
            .map((part) => renderPartRow(part, true))}
        </div>

        {!addPartOpen ? (
          <button
            onClick={() => setAddPartOpen(true)}
            className="mt-1.5 flex items-center gap-1 text-xs font-medium text-neutral-500 hover:text-neutral-700"
          >
            <Plus size={13} /> Add a part
          </button>
        ) : (
          <div className="mt-1.5 space-y-1.5 rounded-lg border border-surface-border p-2">
            <div className="flex gap-1.5">
              <input
                value={partNumber}
                onChange={(e) => setPartNumber(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && lookupPart()}
                placeholder="Part number (optional)"
                className="flex-1 rounded-lg border border-surface-border px-2.5 py-1.5 text-xs outline-none focus:ring-2 focus:ring-neutral-900"
              />
              <button
                onClick={lookupPart}
                disabled={!partNumber.trim() || lookupStatus === "checking"}
                className="flex items-center gap-1 rounded-lg border border-surface-border px-2.5 text-xs font-medium text-neutral-600 hover:bg-surface-muted disabled:opacity-40"
              >
                <Search size={12} /> {lookupStatus === "checking" ? "Looking up…" : "Look up"}
              </button>
            </div>
            {lookupStatus === "found" && (
              <p className="text-[11px] text-green-700">✓ Found — details filled in below</p>
            )}
            {lookupStatus === "not-found" && (
              <p className="text-[11px] text-amber-700">No match for that part number — enter details manually.</p>
            )}
            {lookupStatus === "multiple" && (
              <div className="space-y-1 rounded-lg bg-surface-muted p-1.5">
                <p className="px-0.5 text-[11px] font-medium text-neutral-600">
                  {candidates.length} possible matches — pick one, or edit the description below.
                </p>
                {candidates.map((c, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => applyPartCandidate(c)}
                    className={`block w-full rounded-md border px-2 py-1 text-left text-[11px] ${
                      partDescription === c.name
                        ? "border-neutral-900 bg-white font-medium text-neutral-900"
                        : "border-surface-border bg-white text-neutral-600 hover:bg-white/60"
                    }`}
                  >
                    {c.name}
                    {c.price !== null && <span className="ml-1.5 text-neutral-400">· ${c.price.toFixed(2)} est.</span>}
                  </button>
                ))}
              </div>
            )}
            <input
              value={partDescription}
              onChange={(e) => setPartDescription(e.target.value)}
              placeholder="Description"
              className="w-full rounded-lg border border-surface-border px-2.5 py-1.5 text-xs outline-none focus:ring-2 focus:ring-neutral-900"
            />
            <div className="flex gap-1.5">
              <select
                value={partUnit}
                onChange={(e) => setPartUnit(e.target.value as Unit)}
                className="rounded-lg border border-surface-border px-2 py-1.5 text-xs outline-none"
              >
                {UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min="0"
                step="0.01"
                value={partPrice}
                onChange={(e) => {
                  setPartPrice(e.target.value);
                  setPriceFromLookup(false);
                }}
                placeholder="Price per unit"
                className="flex-1 rounded-lg border border-surface-border px-2.5 py-1.5 text-xs outline-none focus:ring-2 focus:ring-neutral-900"
              />
            </div>
            {priceFromLookup && (
              <p className="text-[10px] text-neutral-400">Price is an online estimate — verify before ordering.</p>
            )}
            <div className="flex gap-1.5">
              <button
                onClick={() => {
                  setAddPartOpen(false);
                  setPartNumber("");
                  setPartDescription("");
                  setPartUnit("ea");
                  setPartPrice("");
                  setPriceFromLookup(false);
                  setLookupStatus("idle");
                  setCandidates([]);
                }}
                className="flex-1 rounded-lg border border-surface-border py-1.5 text-xs font-medium text-neutral-700 hover:bg-surface-muted"
              >
                Cancel
              </button>
              <button
                onClick={submitNewPart}
                disabled={!partDescription.trim()}
                className="flex-1 rounded-lg bg-neutral-900 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
              >
                Add part
              </button>
            </div>
          </div>
        )}

        {(() => {
          const closedParts = property.orderedParts.filter((part) => isPartClosed(part.status));
          if (!closedParts.length) return null;
          return (
            <div className="mt-2">
              <button
                onClick={() => setPartsClosedOpen((v) => !v)}
                className="flex items-center gap-1 text-[11px] font-medium text-neutral-400 hover:text-neutral-600"
              >
                <ChevronDown size={11} className={partsClosedOpen ? "" : "-rotate-90"} />
                Closed ({closedParts.length})
              </button>
              {partsClosedOpen && (
                <div className="mt-1.5 space-y-1.5">
                  {closedParts.map((part) => renderPartRow(part, reopenedPartIds.has(part.id)))}
                </div>
              )}
            </div>
          );
        })()}
      </div>

      <div className="border-t border-surface-border pt-3">
        <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-neutral-700">
          <Wrench size={13} /> Maintenance / repair tasks
        </p>
        <div className="space-y-1.5">
          {property.maintenanceTasks
            .filter((task) => !isTaskClosed(task.status))
            .map((task) => renderTaskRow(task, true))}
        </div>
        <div className="mt-1.5 flex gap-1.5">
          <input
            value={newTask}
            onChange={(e) => setNewTask(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                onAddTask(newTask);
                setNewTask("");
              }
            }}
            placeholder="Add a task…"
            className="flex-1 rounded-lg border border-surface-border px-2.5 py-1.5 text-xs outline-none focus:ring-2 focus:ring-neutral-900"
          />
          <button
            onClick={() => {
              onAddTask(newTask);
              setNewTask("");
            }}
            disabled={!newTask.trim()}
            className="rounded-lg border border-surface-border px-2.5 text-neutral-600 hover:bg-surface-muted disabled:opacity-40"
          >
            <Plus size={13} />
          </button>
        </div>

        {(() => {
          const closedTasks = property.maintenanceTasks.filter((task) => isTaskClosed(task.status));
          if (!closedTasks.length) return null;
          return (
            <div className="mt-2">
              <button
                onClick={() => setTasksClosedOpen((v) => !v)}
                className="flex items-center gap-1 text-[11px] font-medium text-neutral-400 hover:text-neutral-600"
              >
                <ChevronDown size={11} className={tasksClosedOpen ? "" : "-rotate-90"} />
                Closed ({closedTasks.length})
              </button>
              {tasksClosedOpen && (
                <div className="mt-1.5 space-y-1.5">
                  {closedTasks.map((task) => renderTaskRow(task, reopenedTaskIds.has(task.id)))}
                </div>
              )}
            </div>
          );
        })()}
      </div>
    </div>
  );
}
