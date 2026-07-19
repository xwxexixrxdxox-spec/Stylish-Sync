"use client";

import { useState } from "react";
import { Lock } from "lucide-react";

export default function AdminLogin() {
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "checking" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("checking");
    setError(null);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const body = await res.json();
      if (res.ok && body.ok) {
        window.location.reload();
        return;
      }
      setStatus("error");
      setError(body.error ?? "Incorrect password.");
    } catch {
      setStatus("error");
      setError("Something went wrong. Try again.");
    }
  };

  return (
    <div className="mx-auto max-w-sm rounded-xl2 border border-surface-border bg-white p-5 shadow-card">
      <p className="mb-1 flex items-center gap-1.5 text-sm font-medium text-neutral-900">
        <Lock size={15} /> Owner sign-in
      </p>
      <p className="mb-3 text-xs text-neutral-500">Enter your admin password to edit your visit availability.</p>
      <form onSubmit={submit} className="space-y-2">
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="w-full rounded-lg border border-surface-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-neutral-900"
        />
        <button
          type="submit"
          disabled={status === "checking"}
          className="w-full rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-foreground hover:opacity-90 disabled:opacity-50"
        >
          {status === "checking" ? "Checking…" : "Sign in"}
        </button>
      </form>
      {error && <p className="mt-2 text-xs font-medium text-accent-low">{error}</p>}
    </div>
  );
}
