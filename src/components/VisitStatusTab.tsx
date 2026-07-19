"use client";

import VisitStatusCard from "./VisitStatusCard";

interface Props {
  bookingId: string;
}

// Minimal, at-a-glance view of a visit's status, embedded right in the app
// as a bottom-nav tab. Only ever rendered once AccountTab has matched the
// customer's signed-in Google email to a booking (see page.tsx's
// trackedBookingId / BottomNav's conditional "status" tab) — most
// customers never see this, since most never connect a Google account
// that also booked a visit. Deliberately just the status card; the fuller
// standalone page (with its own "Back to app"/cancel links) still exists
// at /book_appointment/status for anyone following their email link.
export default function VisitStatusTab({ bookingId }: Props) {
  return (
    <div className="mx-auto max-w-2xl px-4 pb-24 pt-5 sm:px-6">
      <h1 className="mb-4 text-lg font-semibold text-neutral-900">Your visit status</h1>
      <VisitStatusCard bookingId={bookingId} />
    </div>
  );
}
