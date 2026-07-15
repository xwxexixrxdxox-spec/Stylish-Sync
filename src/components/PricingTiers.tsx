"use client";

import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { PRICING_TIERS, PricingTier } from "@/lib/stripeTiers";

const FEATURES = [
  "Unlimited items & barcode scans",
  "Google Sheets two-way sync",
  "Excel / CSV import & export",
  "Low-stock reorder alerts",
  "AI + live customer support",
];

export default function PricingTiers() {
  const defaultTier = PRICING_TIERS.find((t) => t.highlight) ?? PRICING_TIERS[0];
  const [selectedId, setSelectedId] = useState<PricingTier["id"]>(defaultTier.id);
  const selected = PRICING_TIERS.find((t) => t.id === selectedId) ?? defaultTier;

  return (
    <div>
      <div className="mb-4 rounded-xl2 bg-gradient-to-br from-neutral-900 to-neutral-700 p-5 text-white shadow-card">
        <p className="flex items-center gap-1.5 text-sm font-medium text-white/90">✨ InventorySync Premium</p>
        <p className="mt-1 text-sm text-white/70">Unlock cloud sync, unlimited items, and customer support.</p>
      </div>

      <ul className="mb-5 space-y-2">
        {FEATURES.map((f) => (
          <li key={f} className="flex items-center gap-2 text-sm text-neutral-700">
            <Check size={15} className="text-accent-ok" /> {f}
          </li>
        ))}
      </ul>

      <label htmlFor="plan-select" className="mb-1.5 block text-xs font-medium text-neutral-500">
        Choose your plan
      </label>
      <div className="relative mb-3">
        <select
          id="plan-select"
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value as PricingTier["id"])}
          className="w-full appearance-none rounded-xl2 border border-surface-border bg-white px-4 py-3 pr-10 text-sm font-medium text-neutral-900 shadow-card focus:outline-none focus:ring-2 focus:ring-neutral-900"
        >
          {PRICING_TIERS.map((tier) => (
            <option key={tier.id} value={tier.id}>
              {tier.label} — {tier.billingPeriod}
              {tier.highlight ? " (Most popular)" : ""}
            </option>
          ))}
        </select>
        <ChevronDown
          size={16}
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400"
        />
      </div>

      <p className="mb-4 text-xs text-neutral-500">{selected.blurb}</p>

      <a
        href={selected.paymentLinkUrl}
        className="block w-full rounded-xl2 bg-neutral-900 py-3 text-center text-sm font-semibold text-white shadow-card transition hover:-translate-y-0.5 hover:shadow-lg"
      >
        Subscribe — {selected.label}
      </a>

      <p className="mt-4 text-center text-xs text-neutral-400">
        Secure checkout via Stripe. Cancel anytime from your account.
      </p>
    </div>
  );
}
