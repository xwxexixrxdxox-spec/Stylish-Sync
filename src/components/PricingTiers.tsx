"use client";

import { Check } from "lucide-react";
import { PRICING_TIERS } from "@/lib/stripeTiers";

const FEATURES = [
  "Unlimited items & barcode scans",
  "Excel / CSV import & export",
  "Low-stock reorder alerts",
  "Live human support — a real person, not just AI",
];

export default function PricingTiers() {
  return (
    <div>
      <div className="mb-4 rounded-xl2 bg-gradient-to-br from-neutral-900 to-neutral-700 p-5 text-white shadow-card">
        <p className="flex items-center gap-1.5 text-sm font-medium text-white/90">✨ InventorySync Premium</p>
        <p className="mt-1 text-sm text-white/70">Unlock unlimited items and live human support.</p>
      </div>

      <p className="mb-3 text-xs text-neutral-500">
        🤖 Chatting with Juesika (our AI assistant) and Google Sheets sync are free for everyone — Premium adds:
      </p>

      <ul className="mb-5 space-y-2">
        {FEATURES.map((f) => (
          <li key={f} className="flex items-center gap-2 text-sm text-neutral-700">
            <Check size={15} className="text-accent-ok" /> {f}
          </li>
        ))}
      </ul>

      <div className="grid grid-cols-2 gap-3">
        {PRICING_TIERS.map((tier) => (
          <a
            key={tier.id}
            href={tier.paymentLinkUrl}
            className={`rounded-xl2 border p-4 text-center shadow-card transition hover:-translate-y-0.5 hover:shadow-lg ${
              tier.highlight ? "border-neutral-900 bg-neutral-900 text-white" : "border-surface-border bg-white text-neutral-900"
            }`}
          >
            {tier.highlight && (
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-white/70">Most popular</p>
            )}
            <p className="text-base font-semibold">{tier.label}</p>
            <p className={`mt-1 text-xs ${tier.highlight ? "text-white/60" : "text-neutral-500"}`}>
              {tier.billingPeriod}
            </p>
          </a>
        ))}
      </div>

      <p className="mt-4 text-center text-xs text-neutral-400">
        Secure checkout via Stripe. Cancel anytime from your account.
      </p>
    </div>
  );
}
