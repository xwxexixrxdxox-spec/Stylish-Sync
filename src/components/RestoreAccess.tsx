"use client";

import { useState } from "react";
import { Mail } from "lucide-react";

// Email-based "sign in" for paid features — matches how the original
// Base44 and ISC apps both asked for an email/account before unlocking
// their paid tier. No password: Stripe is the source of truth, so we
// just verify live that this email has an active subscription.
export default function RestoreAccess() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "checking" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("checking");
    setError(null);
    try {
      const res = await fetch("/api/restore-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const body = await res.json();
      if (res.ok && body.ok) {
        window.location.reload();
        return;
      }
      setStatus("error");
      setError(body.error ?? "Couldn't verify that email.");
    } catch {
      setStatus("error");
      setError("Couldn't verify that email right now.");
    }
  };

  return (
    <div className="mb-5 rounded-xl2 border border-surface-border bg-white p-4 shadow-card">
      <p className="mb-1 flex items-center gap-1.5 text-sm font-medium text-neutral-900">
        <Mail size={15} /> Already subscribed?
      </p>
      <p className="mb-3 text-xs text-neutral-500">
        Sign in with the email you paid with to restore access on this device — no password needed.
      </p>
      <form onSubmit={submit} className="flex gap-2">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="flex-1 rounded-lg border border-surface-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-neutral-900"
        />
        <button
          type="submit"
          disabled={status === "checking"}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-foreground hover:opacity-90 disabled:opacity-50"
        >
          {status === "checking" ? "Checking…" : "Sign in"}
        </button>
      </form>
      {error && <p className="mt-2 text-xs font-medium text-accent-low">{error}</p>}
    </div>
  );
}
