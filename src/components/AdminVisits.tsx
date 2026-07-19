"use client";

import { useEffect, useState } from "react";
import { Play, Coffee, CheckCircle2, XCircle, Clock, AlertTriangle } from "lucide-react";
import { BookingRecord, VisitStatus, BREAK_REQUIRED_MINUTES, BookingDuration } from "@/lib/types";

const CONTACT_LABEL: Record<string, string> = { email: "Email", phone: "Phone call", text: "Text message" };

const STATUS_LABEL: Record<VisitStatus, string> = {
  not_started: "Not started",
  clocked_in: "Clocked in",
  on_break: "On a break",
  finished: "Finished",
};

const STATUS_BADGE: Record<VisitStatus, string> = {
  not_started: "bg-neutral-100 text-neutral-600",
  clocked_in: "bg-green-100 text-green-800",
  on_break: "bg-amber-100 text-amber-800",
  finished: "bg-neutral-900 text-white",
};

// Mirrors the server-side sum in booking.ts's totalBreakMinutes — only
// completed breaks (or ones the server has already closed out) carry a
// nonzero `minutes`, so this naturally counts "so far" while a break is
// still in progress.
function breakMinutesTaken(b: BookingRecord): number {
  return b.breaks.reduce((sum, br) => sum + br.minutes, 0);
}

function breakMinutesRequired(b: BookingRecord): number {
  return BREAK_REQUIRED_MINUTES[b.hours as BookingDuration] ?? 0;
}

export default function AdminVisits() {
  const [bookings, setBookings] = useState<BookingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    fetch("/api/admin/bookings")
      .then((r) => r.json())
      .then((body) => {
        if (body.ok) setBookings(body.bookings ?? []);
        else setError(body.error ?? "Couldn't load visits.");
      })
      .catch(() => setError("Couldn't load visits."))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const setStatus = async (id: string, status: VisitStatus) => {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/bookings/${encodeURIComponent(id)}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const body = await res.json();
      if (body.ok && body.record) {
        setBookings((prev) => prev.map((b) => (b.id === id ? body.record : b)));
      } else {
        setError(body.error ?? "Couldn't update status.");
      }
    } catch {
      setError("Couldn't update status — check your connection and try again.");
    } finally {
      setBusyId(null);
    }
  };

  const cancel = async (id: string) => {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch("/api/admin/cancel-booking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const body = await res.json();
      if (body.ok) {
        setBookings((prev) => prev.filter((b) => b.id !== id));
      } else {
        setError(body.error ?? "Couldn't cancel.");
      }
    } catch {
      setError("Couldn't cancel — check your connection and try again.");
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return <p className="text-sm text-neutral-500">Loading…</p>;

  return (
    <div className="space-y-3">
      {error && <p className="text-xs font-medium text-accent-low">{error}</p>}

      {bookings.length === 0 && <p className="text-sm text-neutral-400">No visits yet.</p>}

      {bookings.map((b) => {
        const busy = busyId === b.id;
        const required = breakMinutesRequired(b);
        const taken = breakMinutesTaken(b);
        const breakMet = required === 0 || taken >= required;
        const finishBlockedReason = !breakMet
          ? `Kentucky law requires ${required} min of break for a ${b.hours}h visit — only ${taken} min logged so far.`
          : undefined;
        return (
          <section key={b.id} className="rounded-xl2 border border-surface-border bg-white p-4 shadow-card">
            <div className="mb-2 flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-neutral-900">
                  {b.date} at {b.start} · {b.hours}h
                </p>
                <p className="text-xs text-neutral-500">
                  {b.name} — {b.email} — {b.phone} ({CONTACT_LABEL[b.contactMethod] ?? b.contactMethod})
                </p>
                {b.notes && <p className="mt-1 text-xs text-neutral-500">{b.notes}</p>}
                {required > 0 && b.visitStatus !== "not_started" && (
                  <p className={`mt-1 text-xs font-medium ${breakMet ? "text-neutral-400" : "text-accent-low"}`}>
                    Break: {taken}/{required} min logged
                  </p>
                )}
                {b.autoClockedOut && (
                  <p className="mt-1 flex items-center gap-1 text-xs font-medium text-accent-low">
                    <AlertTriangle size={12} /> Auto clocked out — hit the 12-hour legal maximum
                  </p>
                )}
              </div>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${STATUS_BADGE[b.visitStatus]}`}>
                {STATUS_LABEL[b.visitStatus]}
              </span>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {b.visitStatus === "not_started" && (
                <button
                  disabled={busy}
                  onClick={() => setStatus(b.id, "clocked_in")}
                  className="flex items-center gap-1.5 rounded-lg border border-surface-border px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-surface-muted disabled:opacity-50"
                >
                  <Play size={13} /> Clock in
                </button>
              )}
              {b.visitStatus === "clocked_in" && (
                <>
                  <button
                    disabled={busy}
                    onClick={() => setStatus(b.id, "on_break")}
                    className="flex items-center gap-1.5 rounded-lg border border-surface-border px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-surface-muted disabled:opacity-50"
                  >
                    <Coffee size={13} /> Take a break
                  </button>
                  <button
                    disabled={busy || !breakMet}
                    title={finishBlockedReason}
                    onClick={() => setStatus(b.id, "finished")}
                    className="flex items-center gap-1.5 rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
                  >
                    <CheckCircle2 size={13} /> Finished
                  </button>
                </>
              )}
              {b.visitStatus === "on_break" && (
                <>
                  <button
                    disabled={busy}
                    onClick={() => setStatus(b.id, "clocked_in")}
                    className="flex items-center gap-1.5 rounded-lg border border-surface-border px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-surface-muted disabled:opacity-50"
                  >
                    <Clock size={13} /> Resume
                  </button>
                  <button
                    disabled={busy || !breakMet}
                    title={finishBlockedReason}
                    onClick={() => setStatus(b.id, "finished")}
                    className="flex items-center gap-1.5 rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
                  >
                    <CheckCircle2 size={13} /> Finished
                  </button>
                </>
              )}
              {b.visitStatus !== "finished" && (
                <button
                  disabled={busy}
                  onClick={() => cancel(b.id)}
                  className="ml-auto flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-accent-low hover:bg-red-50 disabled:opacity-50"
                >
                  <XCircle size={13} /> Cancel
                </button>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
