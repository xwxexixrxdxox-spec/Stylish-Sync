"use client";

import { useState } from "react";
import { FlaskConical } from "lucide-react";
import { AccessCheckResponse } from "@/lib/types";
import { isTestToolsEnabled } from "@/lib/devMode";

// Renders under `next dev` automatically (NODE_ENV=development, no config
// needed). It ALSO renders if you explicitly set
// NEXT_PUBLIC_ENABLE_TEST_TOOLS=true in your env — for the case where
// you're testing a production-style build locally (`next build && next
// start`) and still want the toggle available. That flag defaults to
// unset/false, so a real deploy stays safe unless someone deliberately
// sets it in that environment's variables too — don't set it there.
interface Props {
  access: AccessCheckResponse | null;
}

export default function DevAccessToggle({ access }: Props) {
  const [loading, setLoading] = useState(false);

  if (!isTestToolsEnabled()) return null;

  const toggle = async (enable: boolean) => {
    setLoading(true);
    try {
      await fetch("/api/dev/toggle-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enable }),
      });
      window.location.reload();
    } finally {
      setLoading(false);
    }
  };

  const isSimulated = access?.plan === "Dev Test Mode (not a real subscription)";

  return (
    <section className="mb-5 rounded-xl2 border border-dashed border-amber-300 bg-amber-50 p-4 shadow-card">
      <p className="mb-1 flex items-center gap-1.5 text-sm font-medium text-amber-900">
        <FlaskConical size={15} /> Testing tools (dev only — hidden in production)
      </p>
      <p className="mb-3 text-xs text-amber-800">
        Preview the paid experience without running a real Stripe transaction. This never touches Stripe and never
        appears in a production build.
      </p>
      {isSimulated ? (
        <button
          disabled={loading}
          onClick={() => toggle(false)}
          className="w-full rounded-lg border border-amber-300 bg-white py-2 text-sm font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-50"
        >
          {loading ? "Working…" : "Turn off simulated paid access"}
        </button>
      ) : (
        <button
          disabled={loading}
          onClick={() => toggle(true)}
          className="w-full rounded-lg bg-amber-900 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {loading ? "Working…" : "Simulate paid access"}
        </button>
      )}
    </section>
  );
}
