"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, XCircle } from "lucide-react";

function CancelInner() {
  const params = useSearchParams();
  const id = params.get("id") ?? "";
  const token = params.get("token") ?? "";
  const [state, setState] = useState<"idle" | "cancelling" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const cancel = async () => {
    setState("cancelling");
    setError(null);
    try {
      const res = await fetch("/api/book-appointment/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, token }),
      });
      const body = await res.json();
      if (res.ok && body.ok) {
        setState("done");
      } else {
        setState("error");
        setError(body.error ?? "Couldn't cancel this request.");
      }
    } catch {
      setState("error");
      setError("Something went wrong. Try again.");
    }
  };

  if (!id || !token) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl2 border border-dashed border-surface-border p-6 text-center">
        <XCircle className="text-neutral-400" size={24} />
        <p className="text-sm text-neutral-500">This cancel link is missing some details — use the link from your confirmation email.</p>
      </div>
    );
  }

  if (state === "done") {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl2 border border-surface-border bg-white p-6 text-center shadow-card">
        <CheckCircle2 className="text-accent-ok" size={28} />
        <p className="text-sm font-medium text-neutral-900">Your visit request has been cancelled.</p>
        <a href="/book_appointment" className="mt-2 text-xs font-medium text-blue-600 hover:underline">
          Book a different time →
        </a>
      </div>
    );
  }

  return (
    <div className="rounded-xl2 border border-surface-border bg-white p-6 text-center shadow-card">
      <p className="mb-4 text-sm text-neutral-700">Cancel your visit request?</p>
      <button
        disabled={state === "cancelling"}
        onClick={cancel}
        className="w-full rounded-xl2 border border-red-200 bg-white py-2.5 text-sm font-semibold text-accent-low hover:bg-red-50 disabled:opacity-50"
      >
        {state === "cancelling" ? "Cancelling…" : "Yes, cancel this request"}
      </button>
      {error && <p className="mt-2 text-xs font-medium text-accent-low">{error}</p>}
    </div>
  );
}

export default function CancelBookingPage() {
  return (
    <main className="mx-auto min-h-screen max-w-md px-4 pb-24 pt-10 sm:px-6">
      <h1 className="mb-4 text-center text-lg font-semibold text-neutral-900">Cancel visit request</h1>
      <Suspense fallback={<p className="text-sm text-neutral-500">Loading…</p>}>
        <CancelInner />
      </Suspense>
    </main>
  );
}
