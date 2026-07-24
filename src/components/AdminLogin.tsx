"use client";

import { useState } from "react";
import { Lock, Eye, EyeOff } from "lucide-react";

export default function AdminLogin() {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [status, setStatus] = useState<"idle" | "checking" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotStatus, setForgotStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [forgotMessage, setForgotMessage] = useState<string | null>(null);

  const sendResetLink = async () => {
    setForgotStatus("sending");
    setForgotMessage(null);
    try {
      const res = await fetch("/api/admin/forgot-password", { method: "POST" });
      const body = await res.json();
      if (res.ok && body.ok) {
        setForgotStatus("sent");
        setForgotMessage("Check your email for a link to set a new password.");
      } else {
        setForgotStatus("error");
        setForgotMessage(body.error ?? "Couldn't send a reset link right now.");
      }
    } catch {
      setForgotStatus("error");
      setForgotMessage("Something went wrong. Try again.");
    }
  };

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
        <div className="relative">
          <input
            type={showPassword ? "text" : "password"}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="w-full rounded-lg border border-surface-border py-2 pl-3 pr-10 text-sm outline-none focus:ring-2 focus:ring-neutral-900"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            className="absolute inset-y-0 right-0 flex items-center px-3 text-neutral-400 hover:text-neutral-700"
          >
            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        <button
          type="submit"
          disabled={status === "checking"}
          className="w-full rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-foreground hover:opacity-90 disabled:opacity-50"
        >
          {status === "checking" ? "Checking…" : "Sign in"}
        </button>
      </form>
      {error && <p className="mt-2 text-xs font-medium text-accent-low">{error}</p>}

      <div className="mt-3 border-t border-surface-border pt-3">
        {!forgotOpen ? (
          <button
            type="button"
            onClick={() => setForgotOpen(true)}
            className="text-xs font-medium text-blue-600 hover:underline"
          >
            Forgot password?
          </button>
        ) : (
          <div>
            {forgotStatus !== "sent" && (
              <>
                <p className="mb-2 text-xs text-neutral-500">
                  We'll email a one-time reset link to your recovery address.
                </p>
                <button
                  type="button"
                  onClick={sendResetLink}
                  disabled={forgotStatus === "sending"}
                  className="rounded-lg border border-surface-border px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-surface-muted disabled:opacity-50"
                >
                  {forgotStatus === "sending" ? "Sending…" : "Send reset link"}
                </button>
              </>
            )}
            {forgotMessage && (
              <p
                className={`mt-2 text-xs font-medium ${
                  forgotStatus === "error" ? "text-accent-low" : "text-accent-ok"
                }`}
              >
                {forgotMessage}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
