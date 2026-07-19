"use client";

import { Check, Wrench } from "lucide-react";
import { VISIT_OFFER } from "@/lib/stripeTiers";

const FREE_FEATURES = [
  "Clyde, our AI support assistant",
  "Google Sheets two-way sync",
  "Near-unlimited item scans & adds (via Sheets)",
  "Excel / CSV import & export",
  "Low-stock reorder alerts",
];

export default function PricingTiers() {
  return (
    <div>
      <div className="mb-4 rounded-xl2 bg-gradient-to-br from-neutral-900 to-neutral-700 p-5 text-white shadow-card">
        <p className="flex items-center gap-1.5 text-sm font-medium text-white/90">📦 WS Inventory Management</p>
        <p className="mt-1 text-sm text-white/70">Free to use, start to finish — no card required.</p>
      </div>

      <ul className="mb-5 space-y-2">
        {FREE_FEATURES.map((f) => (
          <li key={f} className="flex items-center gap-2 text-sm text-neutral-700">
            <Check size={15} className="text-accent-ok" /> {f}
          </li>
        ))}
      </ul>

      <div className="rounded-xl2 border border-surface-border bg-white p-4 shadow-card">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-neutral-900">
          <Wrench size={15} /> Live In-Store Inventory Setup
        </p>
        <p className="mt-1 text-xs text-neutral-500">
          Don't want to scan 500–1,000+ items yourself? A technician comes to your store and scans/catalogs your
          whole inventory for you, in person.
        </p>

        <div className="mt-3 grid grid-cols-2 gap-3 text-center">
          <div className="rounded-lg border border-surface-border p-3">
            <p className="text-base font-semibold text-neutral-900">{VISIT_OFFER.hourlyRateLabel}</p>
            <p className="mt-0.5 text-[11px] text-neutral-500">{VISIT_OFFER.hourlyRateBlurb}</p>
          </div>
          <div className="rounded-lg border border-surface-border p-3">
            <p className="text-base font-semibold text-neutral-900">{VISIT_OFFER.dailyRateLabel}</p>
            <p className="mt-0.5 text-[11px] text-neutral-500">{VISIT_OFFER.dailyRateBlurb}</p>
          </div>
        </div>

        <a
          href={VISIT_OFFER.bookingUrl}
          className="mt-3 block rounded-xl2 border border-neutral-900 bg-neutral-900 py-2.5 text-center text-sm font-semibold text-white shadow-card transition hover:-translate-y-0.5 hover:opacity-90"
        >
          Request a Visit
        </a>
        <p className="mt-2 text-center text-[11px] text-neutral-400">
          No payment now — pick a time that works and we'll bill you after the visit based on actual time spent.
        </p>
      </div>
    </div>
  );
}
