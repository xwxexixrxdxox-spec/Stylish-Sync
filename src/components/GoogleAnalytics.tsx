"use client";

import { useEffect, useState } from "react";
import Script from "next/script";
import { getCookieConsent, onCookieConsentChange } from "@/lib/storage";

// Google Analytics (GA4) is opt-in only, gated behind the same cookie
// consent choice CookieConsentBanner already collects (see tutorial.ts's
// "cookie-consent" step, which surfaces that banner early in the
// new-customer walkthrough) — declining, or never having answered yet,
// means gtag.js is never injected into the page at all. Not loaded-and-
// disabled: genuinely absent, so no GA cookie or network request happens
// without an affirmative "Accept" first. Listens for the live consent
// event too, so accepting mid-session (without a reload) turns this on
// immediately rather than requiring a refresh.
//
// Requires NEXT_PUBLIC_GA_MEASUREMENT_ID to be set; renders nothing at all
// if it isn't, same "missing config degrades gracefully" pattern used
// elsewhere in this app (see isGoogleSheetsConfigured/isPickerConfigured).
export default function GoogleAnalytics() {
  const [consented, setConsented] = useState(false);

  useEffect(() => {
    setConsented(getCookieConsent() === "accepted");
    return onCookieConsentChange((value) => setConsented(value === "accepted"));
  }, []);

  const measurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
  if (!measurementId || !consented) return null;

  return (
    <>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`} strategy="afterInteractive" />
      <Script id="google-analytics-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${measurementId}', {
            anonymize_ip: true,
            // Keeps this a plain usage-analytics tool, not an ad-tracking
            // one - matches the privacy policy's "we don't run third-party
            // advertising trackers" claim, which stays true only because
            // these are explicitly turned off.
            allow_google_signals: false,
            allow_ad_personalization_signals: false
          });
        `}
      </Script>
    </>
  );
}
