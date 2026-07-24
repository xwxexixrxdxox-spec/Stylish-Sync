"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, CheckCircle2, Clock } from "lucide-react";
import { OpenSlot, ContactMethod, BOOKING_DURATIONS, BookingDuration, BOOKING_WINDOW_END } from "@/lib/types";
import { VISIT_OFFER, VISITS_ENABLED } from "@/lib/stripeTiers";

function toMinutesLocal(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}
const WINDOW_END_MIN = toMinutesLocal(BOOKING_WINDOW_END);

function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${m.toString().padStart(2, "0")} ${period}`;
}

function formatDate(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export default function BookAppointmentPage() {
  const [slots, setSlots] = useState<OpenSlot[] | null>(null);
  const [selected, setSelected] = useState<OpenSlot | null>(null);
  const [hours, setHours] = useState<BookingDuration>(BOOKING_DURATIONS[0]);
  const [form, setForm] = useState({ name: "", email: "", phone: "", contactMethod: "email" as ContactMethod, notes: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [booking, setBooking] = useState<{ id: string; cancelToken: string } | null>(null);

  useEffect(() => {
    // Requests are paused (see VISITS_ENABLED) — skip fetching availability
    // entirely rather than loading real open slots into a page that won't
    // let anyone actually book them.
    if (!VISITS_ENABLED) return;
    fetch("/api/book-appointment")
      .then((r) => r.json())
      .then((body) => setSlots(body.slots ?? []))
      .catch(() => setSlots([]));
  }, []);

  const byDate = useMemo(() => {
    const map = new Map<string, OpenSlot[]>();
    for (const s of slots ?? []) {
      if (!map.has(s.date)) map.set(s.date, []);
      map.get(s.date)!.push(s);
    }
    return map;
  }, [slots]);

  if (!VISITS_ENABLED) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
        <CalendarDays className="mb-3 text-neutral-400" size={40} />
        <h1 className="text-lg font-semibold text-neutral-900">Visit requests are paused</h1>
        <p className="mt-2 text-sm text-neutral-600">
          We're not accepting new in-person visit requests right now while we finish testing the admin/technician
          side. Check back soon — the rest of the app is free to use in the meantime.
        </p>
        <a href="/" className="mt-5 rounded-lg border border-surface-border px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-surface-muted">
          Back to app
        </a>
      </main>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    setSubmitting(true);
    setError(null);
    try {
      // The technician's clock-in window is judged against wherever the
      // visit is actually happening, so this is sent along with the
      // booking rather than assumed to match the business owner's zone.
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const res = await fetch("/api/book-appointment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: selected.date, start: selected.start, hours, timezone, ...form }),
      });
      const body = await res.json();
      if (res.ok && body.ok) {
        setDone(true);
        if (body.bookingId && body.cancelToken) setBooking({ id: body.bookingId, cancelToken: body.cancelToken });
      } else {
        setError(body.error ?? "Couldn't submit your request. Try another time.");
      }
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
        <CheckCircle2 className="mb-3 text-accent-ok" size={40} />
        <h1 className="text-lg font-semibold text-neutral-900">Request sent</h1>
        <p className="mt-2 text-sm text-neutral-600">
          We'll reach out via your preferred contact method to confirm{" "}
          {selected && `${formatDate(selected.date)} at ${formatTime(selected.start)}`}. You're billed after the
          visit based on actual time spent — no payment needed now.
        </p>

        {booking && (
          <div className="mt-4 flex flex-col items-center gap-2 text-xs">
            <a href={`/book_appointment/status?id=${encodeURIComponent(booking.id)}`} className="font-medium text-blue-600 hover:underline">
              Track visit status →
            </a>
            <a
              href={`/book_appointment/cancel?id=${encodeURIComponent(booking.id)}&token=${encodeURIComponent(booking.cancelToken)}`}
              className="font-medium text-blue-600 hover:underline"
            >
              Cancel this request →
            </a>
          </div>
        )}

        <a href="/" className="mt-5 rounded-lg border border-surface-border px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-surface-muted">
          Back to app
        </a>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-4 pb-24 pt-8 sm:px-6">
      <h1 className="mb-1 text-lg font-semibold text-neutral-900">Request an in-person visit</h1>
      <p className="mb-6 text-sm text-neutral-500">
        {VISIT_OFFER.hourlyRateLabel} ({VISIT_OFFER.hourlyRateBlurb}), or {VISIT_OFFER.dailyRateLabel} (
        {VISIT_OFFER.dailyRateBlurb}). Billed after the visit — nothing to pay now.
      </p>

      {slots === null && <p className="text-sm text-neutral-500">Loading availability…</p>}

      {slots !== null && slots.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-xl2 border border-dashed border-surface-border p-6 text-center">
          <CalendarDays className="text-neutral-400" size={24} />
          <p className="text-sm text-neutral-500">No open times posted right now — check back soon.</p>
        </div>
      )}

      {slots !== null && slots.length > 0 && !selected && (
        <div className="space-y-4">
          {Array.from(byDate.entries()).map(([date, daySlots]) => (
            <section key={date} className="rounded-xl2 border border-surface-border bg-white p-4 shadow-card">
              <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-neutral-900">
                <CalendarDays size={15} /> {formatDate(date)}
              </p>
              <div className="flex flex-wrap gap-2">
                {daySlots.map((s) => (
                  <button
                    key={s.start}
                    onClick={() => {
                      setSelected(s);
                      // getOpenSlots only ever offers a start time that can
                      // fit at least the shortest duration, so this is
                      // always safe as the default — but a previously
                      // chosen longer duration might not fit this new
                      // start, so reset rather than carry it over.
                      setHours(BOOKING_DURATIONS[0]);
                    }}
                    className="rounded-lg border border-surface-border px-3 py-1.5 text-xs font-medium text-neutral-700 hover:border-neutral-900 hover:bg-surface-muted"
                  >
                    {formatTime(s.start)}
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {selected && (
        <form onSubmit={submit} className="space-y-4">
          <div className="flex items-center justify-between rounded-xl2 border border-surface-border bg-white p-4 shadow-card">
            <p className="flex items-center gap-1.5 text-sm font-medium text-neutral-900">
              <Clock size={15} /> {formatDate(selected.date)} at {formatTime(selected.start)}
            </p>
            <button type="button" onClick={() => setSelected(null)} className="text-xs font-medium text-blue-600 hover:underline">
              Change
            </button>
          </div>

          <div className="rounded-xl2 border border-surface-border bg-white p-4 shadow-card">
            <label className="mb-2 block text-xs font-medium text-neutral-700">
              Visit length <span className="font-normal text-neutral-400">Fixed blocks, capped at 12h/day.</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {BOOKING_DURATIONS.map((d) => {
                const fits = toMinutesLocal(selected.start) + d * 60 <= WINDOW_END_MIN;
                return (
                  <button
                    key={d}
                    type="button"
                    disabled={!fits}
                    title={fits ? undefined : `Would run past ${BOOKING_WINDOW_END} — pick an earlier start or a shorter visit.`}
                    onClick={() => setHours(d)}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${
                      hours === d
                        ? "border-neutral-900 bg-neutral-900 text-white"
                        : "border-surface-border text-neutral-700 hover:border-neutral-900 hover:bg-surface-muted"
                    }`}
                  >
                    {d}h
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-3 rounded-xl2 border border-surface-border bg-white p-4 shadow-card">
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-700">Name</label>
              <input
                required
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="w-full rounded-lg border border-surface-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-neutral-900"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-700">Email</label>
              <input
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                className="w-full rounded-lg border border-surface-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-neutral-900"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-700">Phone</label>
              <input
                type="tel"
                required
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                className="w-full rounded-lg border border-surface-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-neutral-900"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-700">Preferred contact method</label>
              <select
                value={form.contactMethod}
                onChange={(e) => setForm((f) => ({ ...f, contactMethod: e.target.value as ContactMethod }))}
                className="w-full rounded-lg border border-surface-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-neutral-900"
              >
                <option value="email">Email</option>
                <option value="phone">Phone call</option>
                <option value="text">Text message</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-700">Additional notes (optional)</label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                rows={3}
                className="w-full rounded-lg border border-surface-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-neutral-900"
              />
            </div>
          </div>

          {error && <p className="text-xs font-medium text-accent-low">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl2 border border-neutral-900 bg-neutral-900 py-2.5 text-center text-sm font-semibold text-white shadow-card transition hover:-translate-y-0.5 hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? "Sending…" : "Request this visit"}
          </button>
        </form>
      )}
    </main>
  );
}
