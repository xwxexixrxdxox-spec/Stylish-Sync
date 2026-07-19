"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2, LogOut, Save } from "lucide-react";
import { AvailabilityWindow, BookingRecord } from "@/lib/types";

const CONTACT_LABEL: Record<string, string> = { email: "Email", phone: "Phone call", text: "Text message" };

export default function AdminAvailabilityEditor() {
  const [windows, setWindows] = useState<AvailabilityWindow[]>([]);
  const [bookings, setBookings] = useState<BookingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [draft, setDraft] = useState({ date: "", start: "", end: "" });

  useEffect(() => {
    fetch("/api/admin/availability")
      .then((r) => r.json())
      .then((body) => {
        if (body.ok) {
          setWindows(body.windows ?? []);
          setBookings(body.bookings ?? []);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const addWindow = () => {
    if (!draft.date || !draft.start || !draft.end || draft.start >= draft.end) {
      setMessage("Enter a date, start time, and end time (end must be after start).");
      return;
    }
    setWindows((prev) => [...prev, draft].sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start)));
    setDraft({ date: "", start: "", end: "" });
    setMessage(null);
  };

  const removeWindow = (idx: number) => {
    setWindows((prev) => prev.filter((_, i) => i !== idx));
  };

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ windows }),
      });
      const body = await res.json();
      setMessage(body.ok ? "Saved." : body.error ?? "Couldn't save.");
    } catch {
      setMessage("Couldn't save — check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  const signOut = async () => {
    await fetch("/api/admin/logout", { method: "POST" }).catch(() => {});
    window.location.reload();
  };

  if (loading) return <p className="text-sm text-neutral-500">Loading…</p>;

  return (
    <div className="space-y-6">
      <section className="rounded-xl2 border border-surface-border bg-white p-4 shadow-card">
        <p className="mb-3 text-sm font-medium text-neutral-900">Open time windows</p>
        <p className="mb-3 text-xs text-neutral-500">
          Add the days/times you're free to travel to customer sites. These get split into 1-hour bookable slots on
          the public page.
        </p>

        {windows.length === 0 && <p className="mb-3 text-xs text-neutral-400">No windows added yet.</p>}
        <ul className="mb-3 space-y-1.5">
          {windows.map((w, i) => (
            <li
              key={`${w.date}-${w.start}-${i}`}
              className="flex items-center justify-between rounded-lg border border-surface-border px-3 py-2 text-sm text-neutral-700"
            >
              <span>
                {w.date} · {w.start}–{w.end}
              </span>
              <button onClick={() => removeWindow(i)} aria-label="Remove" className="text-neutral-400 hover:text-accent-low">
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>

        <div className="grid grid-cols-3 gap-2">
          <input
            type="date"
            value={draft.date}
            onChange={(e) => setDraft((d) => ({ ...d, date: e.target.value }))}
            className="rounded-lg border border-surface-border px-2 py-2 text-sm outline-none focus:ring-2 focus:ring-neutral-900"
          />
          <input
            type="time"
            value={draft.start}
            onChange={(e) => setDraft((d) => ({ ...d, start: e.target.value }))}
            className="rounded-lg border border-surface-border px-2 py-2 text-sm outline-none focus:ring-2 focus:ring-neutral-900"
          />
          <input
            type="time"
            value={draft.end}
            onChange={(e) => setDraft((d) => ({ ...d, end: e.target.value }))}
            className="rounded-lg border border-surface-border px-2 py-2 text-sm outline-none focus:ring-2 focus:ring-neutral-900"
          />
        </div>
        <button
          onClick={addWindow}
          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-surface-border py-2 text-sm font-medium text-neutral-700 hover:bg-surface-muted"
        >
          <Plus size={14} /> Add window
        </button>

        <button
          onClick={save}
          disabled={saving}
          className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg bg-brand py-2.5 text-sm font-semibold text-brand-foreground hover:opacity-90 disabled:opacity-50"
        >
          <Save size={14} /> {saving ? "Saving…" : "Save availability"}
        </button>
        {message && <p className="mt-2 text-center text-xs font-medium text-neutral-600">{message}</p>}
      </section>

      <section className="rounded-xl2 border border-surface-border bg-white p-4 shadow-card">
        <p className="mb-3 text-sm font-medium text-neutral-900">Upcoming requests</p>
        {bookings.length === 0 ? (
          <p className="text-xs text-neutral-400">No upcoming requests yet.</p>
        ) : (
          <ul className="space-y-2">
            {bookings.map((b) => (
              <li key={b.id} className="rounded-lg border border-surface-border px-3 py-2 text-xs text-neutral-700">
                <p className="font-medium text-neutral-900">
                  {b.date} at {b.start} · {b.hours}h
                </p>
                <p>
                  {b.name} — {b.email} — {b.phone} ({CONTACT_LABEL[b.contactMethod] ?? b.contactMethod})
                </p>
                {b.notes && <p className="mt-1 text-neutral-500">{b.notes}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <button
        onClick={signOut}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-surface-border py-2 text-sm text-neutral-700 hover:bg-surface-muted"
      >
        <LogOut size={14} /> Sign out
      </button>
    </div>
  );
}
