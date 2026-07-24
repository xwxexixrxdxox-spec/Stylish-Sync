import { Carrier } from "./types";

// EXPERIMENTAL — see PackageTracking in types.ts for what "experimental"
// means here. This is a link-out to each carrier's own public tracking
// page, not a live status API — nothing here confirms the tracking number
// is even valid until the customer clicks through and looks.
//
// Amazon in particular has no general-purpose public tracking-number
// lookup page the way UPS/FedEx/USPS do. `track.amazon.com/tracking/<id>`
// only resolves Amazon Logistics shipments (tracking IDs that start with
// "TBA") — anything shipped by a third-party carrier through Amazon (a UPS
// or USPS number on an Amazon order) won't resolve there at all. This is a
// best-effort link, not a guarantee; the UI should tell the customer to
// fall back to "Your Orders" on amazon.com if it doesn't work.
export function carrierTrackingUrl(carrier: Carrier, trackingNumber: string): string {
  const n = encodeURIComponent(trackingNumber.trim());
  switch (carrier) {
    case "ups":
      return `https://www.ups.com/track?loc=en_US&tracknum=${n}`;
    case "fedex":
      return `https://www.fedex.com/fedextrack/?trknbr=${n}`;
    case "usps":
      return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${n}`;
    case "amazon":
      return `https://track.amazon.com/tracking/${n}`;
  }
}
