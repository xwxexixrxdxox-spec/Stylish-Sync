"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, XCircle, Loader2, CalendarDays } from "lucide-react";
import { VISIT_OFFER } from "@/lib/stripeTiers";

type State = "verifying" | "ok-subscription" | "ok-install" | "error";

function PaymentSuccessInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [state, setState] = useState<State>("verifying");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const sessionId = params.get("session_id");
    if (!sessionId) {
      setState("error");
      setErrorMsg("We didn't receive a payment confirmation from Stripe. If you completed checkout, try refreshing this page from your confirmation email link.");
      return;
    }
    fetch(`/api/verify-session?session_id=${encodeURIComponent(sessionId)}`)
      .then(async (res) => {
        const body = await res.json();
        if (res.ok && body.ok) {
          if (body.mode === "payment") {
            // One-time charge - this is the install booking fee, not a
            // subscription. Stay on this page and show the scheduling
            // step instead of bouncing back to the app.
            setState("ok-install");
          } else {
            setState("ok-subscription");
            setTimeout(() => router.replace("/"), 1800);
          }
        } else {
          setState("error");
          setErrorMsg(body.error ?? "We couldn't verify this payment yet.");
        }
      })
      .catch(() => {
        setState("error");
        setErrorMsg("Something went wrong verifying your payment.");
      });
  }, [params, router]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-surface-muted px-6 text-center">
      <div className="w-full max-w-sm rounded-xl2 border border-surface-border bg-white p-8 shadow-card">
        {state === "verifying" && (
          <>
            <Loader2 className="mx-auto mb-3 animate-spin text-neutral-400" size={32} />
            <p className="text-sm font-medium text-neutral-800">Confirming your payment with Stripe…</p>
            <p className="mt-1 text-xs text-neutral-500">This only takes a moment.</p>
          </>
        )}
        {state === "ok-subscription" && (
          <>
            <CheckCircle2 className="mx-auto mb-3 text-accent-ok" size={32} />
            <p className="text-sm font-medium text-neutral-800">Payment confirmed — welcome to Premium!</p>
            <p className="mt-1 text-xs text-neutral-500">Taking you back to the app…</p>
          </>
        )}
        {state === "ok-install" && (
          <>
            <CheckCircle2 className="mx-auto mb-3 text-accent-ok" size={32} />
            <p className="text-sm font-medium text-neutral-800">Payment confirmed!</p>
            <p className="mt-1 text-xs text-neutral-500">
              Last step — pick a time for your on-site visit ({VISIT_OFFER.hourlyRateLabel}, or {VISIT_OFFER.dailyRateLabel} as
              an alternate flat day rate).
            </p>

            <div className="mt-4 flex flex-col items-center gap-2 rounded-lg border border-dashed border-surface-border p-4">
              <CalendarDays className="text-neutral-400" size={24} />
              <a
                href={VISIT_OFFER.bookingUrl}
                className="text-xs font-medium text-blue-600 hover:underline"
              >
                Request a visit time →
              </a>
            </div>

            <a
              href="/"
              className="mt-4 inline-block rounded-lg border border-surface-border px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-surface-muted"
            >
              Return to app
            </a>
          </>
        )}
        {state === "error" && (
          <>
            <XCircle className="mx-auto mb-3 text-accent-low" size={32} />
            <p className="text-sm font-medium text-neutral-800">We couldn't confirm that payment yet</p>
            <p className="mt-1 text-xs text-neutral-500">{errorMsg}</p>
            <a
              href="/"
              className="mt-4 inline-block rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-foreground"
            >
              Return to app
            </a>
          </>
        )}
      </div>
    </main>
  );
}

export default function PaymentSuccessPage() {
  return (
    <Suspense>
      <PaymentSuccessInner />
    </Suspense>
  );
}
