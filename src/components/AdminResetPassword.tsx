"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { KeyRound, CheckCircle2 } from "lucide-react";

export default function AdminResetPassword() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirm) {
      setStatus("error");
      setError("Passwords don't match.");
      return;
    }
    setStatus("saving");
    setError(null);
    try {
      const res = await fetch("/api/admin/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword }),
      });
      const body = await res.json();
      if (res.ok && body.ok) {
        setStatus("done");
      } else {
        setStatus("error");
        setError(body.error ?? "Couldn't reset your password.");
      }
    } catch {
      setStatus("error");
      setError("Something went wrong. Try again.");
    }
  };

  if (!token) {
    return (
      <div className="mx-auto max-w-sm rounded-xl2 border border-surface-border bg-white p-5 text-center shadow-card">
        <p className="text-sm text-neutral-600">
          This link is missing its reset token. Go back to the sign-in page and request a new one.
        </p>
        <a href="/admin" className="mt-3 inline-block text-xs font-medium text-blue-600 hover:underline">
          ← Back to sign-in
        </a>
      </div>
    );
  }

  if (status === "done") {
    return (
      <div className="mx-auto max-w-sm rounded-xl2 border border-surface-border bg-white p-5 text-center shadow-card">
        <CheckCircle2 className="mx-auto mb-2 text-accent-ok" size={28} />
        <p className="text-sm font-medium text-neutral-900">Password updated</p>
        <p className="mt-1 text-xs text-neutral-500">You can sign in with your new password now.</p>
        <a href="/admin" className="mt-3 inline-block text-xs font-medium text-blue-600 hover:underline">
          Go to sign-in →
        </a>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-sm rounded-xl2 border border-surface-border bg-white p-5 shadow-card">
      <p className="mb-1 flex items-center gap-1.5 text-sm font-medium text-neutral-900">
        <KeyRound size={15} /> Set a new password
      </p>
      <p className="mb-3 text-xs text-neutral-500">
        This link is single-use and expires 30 minutes after it was sent.
      </p>
      <form onSubmit={submit} className="space-y-2">
        <input
          type="password"
          required
          minLength={8}
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder="New password (8+ characters)"
          className="w-full rounded-lg border border-surface-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-neutral-900"
        />
        <input
          type="password"
          required
          minLength={8}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="Confirm new password"
          className="w-full rounded-lg border border-surface-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-neutral-900"
        />
        <button
          type="submit"
          disabled={status === "saving"}
          className="w-full rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-foreground hover:opacity-90 disabled:opacity-50"
        >
          {status === "saving" ? "Saving…" : "Set new password"}
        </button>
      </form>
      {error && <p className="mt-2 text-xs font-medium text-accent-low">{error}</p>}
    </div>
  );
}
