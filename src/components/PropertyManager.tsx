"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2, UploadCloud, DownloadCloud, Package, Wrench, AlertTriangle } from "lucide-react";
import {
  PropertyItem,
  OrderedPart,
  MaintenanceTask,
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
import { formatRelativeTime } from "@/lib/time";
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

  const addPart = (propertyId: string, description: string) => {
    if (!description.trim()) return;
    const { updatedAt, lastEditedBy } = touch();
    const part: OrderedPart = {
      id: `part-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      description: description.trim(),
      status: "ordered",
      updatedAt,
    };
    setProperties((prev) =>
      prev.map((p) => (p.id === propertyId ? { ...p, orderedParts: [...p.orderedParts, part], updatedAt, lastEditedBy } : p))
    );
  };

  const updatePartStatus = (propertyId: string, partId: string, status: OrderedPart["status"]) => {
    const { updatedAt, lastEditedBy } = touch();
    setProperties((prev) =>
      prev.map((p) =>
        p.id === propertyId
          ? {
              ...p,
              orderedParts: p.orderedParts.map((part) => (part.id === partId ? { ...part, status, updatedAt } : part)),
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
    };
    setProperties((prev) =>
      prev.map((p) =>
        p.id === propertyId ? { ...p, maintenanceTasks: [...p.maintenanceTasks, task], updatedAt, lastEditedBy } : p
      )
    );
  };

  const updateTaskStatus = (propertyId: string, taskId: string, status: MaintenanceTask["status"]) => {
    const { updatedAt, lastEditedBy } = touch();
    setProperties((prev) =>
      prev.map((p) =>
        p.id === propertyId
          ? {
              ...p,
              maintenanceTasks: p.maintenanceTasks.map((task) =>
                task.id === taskId ? { ...task, status, updatedAt } : task
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
              onAddPart={(desc) => addPart(p.id, desc)}
              onUpdatePartStatus={(partId, status) => updatePartStatus(p.id, partId, status)}
              onRemovePart={(partId) => removePart(p.id, partId)}
              onAddTask={(desc) => addTask(p.id, desc)}
              onUpdateTaskStatus={(taskId, status) => updateTaskStatus(p.id, taskId, status)}
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
  onAddPart: (description: string) => void;
  onUpdatePartStatus: (partId: string, status: OrderedPart["status"]) => void;
  onRemovePart: (partId: string) => void;
  onAddTask: (description: string) => void;
  onUpdateTaskStatus: (taskId: string, status: MaintenanceTask["status"]) => void;
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
  const [newPart, setNewPart] = useState("");
  const [newTask, setNewTask] = useState("");

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
          {property.orderedParts.map((part) => (
            <div key={part.id} className="flex items-center gap-1.5 rounded-lg bg-surface-muted px-2 py-1.5">
              <span className="flex-1 text-xs text-neutral-700">{part.description}</span>
              <select
                value={part.status}
                onChange={(e) => onUpdatePartStatus(part.id, e.target.value as OrderedPart["status"])}
                className="rounded-md border border-surface-border bg-white px-1.5 py-1 text-[11px] outline-none"
              >
                {ORDERED_PART_STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <button
                onClick={() => onRemovePart(part.id)}
                aria-label="Remove part"
                className="text-neutral-400 hover:text-accent-low"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
        <div className="mt-1.5 flex gap-1.5">
          <input
            value={newPart}
            onChange={(e) => setNewPart(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                onAddPart(newPart);
                setNewPart("");
              }
            }}
            placeholder="Add a part…"
            className="flex-1 rounded-lg border border-surface-border px-2.5 py-1.5 text-xs outline-none focus:ring-2 focus:ring-neutral-900"
          />
          <button
            onClick={() => {
              onAddPart(newPart);
              setNewPart("");
            }}
            disabled={!newPart.trim()}
            className="rounded-lg border border-surface-border px-2.5 text-neutral-600 hover:bg-surface-muted disabled:opacity-40"
          >
            <Plus size={13} />
          </button>
        </div>
      </div>

      <div className="border-t border-surface-border pt-3">
        <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-neutral-700">
          <Wrench size={13} /> Maintenance / repair tasks
        </p>
        <div className="space-y-1.5">
          {property.maintenanceTasks.map((task) => (
            <div key={task.id} className="flex items-center gap-1.5 rounded-lg bg-surface-muted px-2 py-1.5">
              <span className="flex-1 text-xs text-neutral-700">{task.description}</span>
              <select
                value={task.status}
                onChange={(e) => onUpdateTaskStatus(task.id, e.target.value as MaintenanceTask["status"])}
                className="rounded-md border border-surface-border bg-white px-1.5 py-1 text-[11px] outline-none"
              >
                {MAINTENANCE_TASK_STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <button
                onClick={() => onRemoveTask(task.id)}
                aria-label="Remove task"
                className="text-neutral-400 hover:text-accent-low"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
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
      </div>
    </div>
  );
}
