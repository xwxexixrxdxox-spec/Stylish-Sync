"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import VisitStatusCard from "@/components/VisitStatusCard";

function StatusInner() {
  const params = useSearchParams();
  const id = params.get("id") ?? "";
  return (
    <div className="space-y-4">
      <VisitStatusCard bookingId={id} />
      <a href="/" className="block text-center text-xs font-medium text-blue-600 hover:underline">
        Back to app →
      </a>
    </div>
  );
}

export default function VisitStatusPage() {
  return (
    <main className="mx-auto min-h-screen max-w-md px-4 pb-24 pt-10 sm:px-6">
      <h1 className="mb-4 text-center text-lg font-semibold text-neutral-900">Your visit status</h1>
      <Suspense fallback={<p className="text-sm text-neutral-500">Loading…</p>}>
        <StatusInner />
      </Suspense>
    </main>
  );
}
