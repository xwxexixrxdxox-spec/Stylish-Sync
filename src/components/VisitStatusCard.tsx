"use client";

import { useEffect, useState } from "react";
import { CircleDot, Coffee, CheckCircle2, Clock, AlertCircle } from "lucide-react";
import { PublicBookingStatus, VisitStatus } from "@/lib/types";
import { VISIT_OFFER } from "@/lib/stripeTiers";

const STATUS_COPY: Record<VisitStatus, { label: string; sub: string; icon: typeof Clock }> = {
  not_started: { label: "Not started yet", sub: "We haven't started your visit yet.", icon: Clock },
  clocked_in: { label: "In progress", sub: "The technician is on-site and working.", icon: CircleDot },
  on_break: { label: "On a break", sub: "The technician is taking a short break and will resume shortly.", icon: Coffee },
  finished: { label: "Finished", sub: "Your visit is complete.", icon: CheckCircle2 },
};

function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${m.toString().padStart(2, "0")} ${period}`;
}

interface Props {
  bookingId: string;
}

// Shared by the standalone /book_appointment/status page and the embedded
// "Status" bottom-nav tab (see VisitStatusTab) — same fetch/poll logic
// against the same public status endpoint, just wrapped differently by
// each caller. Pulled out so the two never drift out of sync.
export default function VisitStatusCard({ bookingId }: Props) {
  const [status, setStatus] = useState<PublicBookingStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!bookingId) {
      setError("Missing visit id.");
      setLoading(false);
      return;
    }
    const load = () =>
      fetch(`/api/book-appointment/status?id=${encodeURIComponent(bookingId)}`)
        .then((r) => r.json())
        .then((body) => {
          if (body.status) setStatus(body.status);
          else setError(body.error ?? "Couldn't load status.");
        })
        .catch(() => setError("Couldn't load status."))
        .finally(() => setLoading(false));

    load();
    // Poll gently so this updates as the technician clocks in/out without
    // the customer needing to refresh manually.
    const interval = setInterval(load, 20_000);
    return () => clearInterval(interval);
  }, [bookingId]);

  if (loading) return <p className="text-sm text-neutral-500">Loading…</p>;
  if (error || !status) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl2 border border-dashed border-surface-border p-6 text-center">
        <AlertCircle className="text-neutral-400" size={24} />
        <p className="text-sm text-neutral-500">{error ?? "Couldn't find that visit."}</p>
      </div>
    );
  }

  const copy = STATUS_COPY[status.visitStatus];
  const Icon = copy.icon;

  return (
    <div className="space-y-4">
      <section className="rounded-xl2 border border-surface-border bg-white p-5 text-center shadow-card">
        <Icon className="mx-auto mb-2 text-neutral-700" size={28} />
        <p className="text-base font-semibold text-neutral-900">{copy.label}</p>
        <p className="mt-1 text-sm text-neutral-500">{copy.sub}</p>
        <p className="mt-3 text-xs text-neutral-400">
          {status.date} at {formatTime(status.start)} · {status.hours}h visit for {status.name}
        </p>
      </section>

      {status.visitStatus === "finished" && (
        <a
          href={VISIT_OFFER.paymentLinkUrl}
          className="block rounded-xl2 border border-neutral-900 bg-neutral-900 py-2.5 text-center text-sm font-semibold text-white shadow-card transition hover:-translate-y-0.5 hover:opacity-90"
        >
          Pay now
        </a>
      )}
    </div>
  );
}
