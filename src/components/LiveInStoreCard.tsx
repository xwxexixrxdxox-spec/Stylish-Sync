"use client";

import { useEffect, useState } from "react";
import { Wrench, X } from "lucide-react";
import { VISIT_OFFER, VISITS_ENABLED } from "@/lib/stripeTiers";
import { getLiveInStoreDismissed, setLiveInStoreDismissed } from "@/lib/storage";

// The "Live In-Store Inventory Setup" card from the old PricingTiers panel,
// pulled out into its own component so it can stand on its own as a regular
// section of the Account panel (rather than only ever showing up bundled
// with the free-features list, and only for customers not already on a paid
// plan).
//
// While VISITS_ENABLED is off, this doesn't just render the old plain
// "Coming soon" button — the whole card goes inert (pointer-events-none) and
// gets a translucent "Coming Soon" overlay with its own close button, same
// as a splash/announcement banner. Closing it hides the card entirely on
// this device, the same "nag at most once" pattern as InstallBanner's
// dismiss flag — see getLiveInStoreDismissed/setLiveInStoreDismissed in
// storage.ts. The moment we (the admins) flip VISITS_ENABLED to true, this
// stops checking the dismissed flag at all and just shows the real,
// clickable card to everyone, dismissed or not.
export default function LiveInStoreCard() {
  // Default to hidden, same as InstallBanner - avoids a flash of the wrong
  // state before the localStorage check below can run on mount.
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(VISITS_ENABLED || !getLiveInStoreDismissed());
  }, []);

  const dismiss = () => {
    setLiveInStoreDismissed();
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <section className="relative mb-5 overflow-hidden rounded-xl2 border border-surface-border bg-white p-4 shadow-card">
      <div className={VISITS_ENABLED ? "" : "pointer-events-none select-none"} aria-hidden={!VISITS_ENABLED}>
        <p className="flex items-center gap-1.5 text-sm font-semibold text-neutral-900">
          <Wrench size={15} /> Live In-Store Inventory Setup
        </p>
        <p className="mt-1 text-xs text-neutral-500">
          Don&apos;t want to scan 500–1,000+ items yourself? A technician comes to your store and scans/catalogs your
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

        {VISITS_ENABLED ? (
          <>
            <a
              href={VISIT_OFFER.bookingUrl}
              className="mt-3 block rounded-xl2 border border-neutral-900 bg-neutral-900 py-2.5 text-center text-sm font-semibold text-white shadow-card transition hover:-translate-y-0.5 hover:opacity-90"
            >
              Request a Visit
            </a>
            <p className="mt-2 text-center text-[11px] text-neutral-400">
              No payment now — pick a time that works and we&apos;ll bill you after the visit based on actual time
              spent.
            </p>
          </>
        ) : (
          <div className="mt-3 block cursor-not-allowed rounded-xl2 border border-surface-border bg-surface-muted py-2.5 text-center text-sm font-semibold text-neutral-400">
            Coming soon
          </div>
        )}
      </div>

      {!VISITS_ENABLED && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/70 backdrop-blur-[1px]">
          <span className="rounded-full bg-neutral-900 px-3 py-1 text-xs font-semibold text-white shadow-card">
            Coming Soon
          </span>
          <button
            onClick={dismiss}
            aria-label="Dismiss Coming Soon notice"
            className="absolute right-2 top-2 rounded-full p-1 text-neutral-500 hover:bg-white hover:text-neutral-900"
          >
            <X size={16} />
          </button>
        </div>
      )}
    </section>
  );
}
