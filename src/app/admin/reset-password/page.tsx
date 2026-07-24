"use client";

import { Suspense } from "react";
import AdminResetPassword from "@/components/AdminResetPassword";

export default function AdminResetPasswordPage() {
  return (
    <main className="mx-auto min-h-screen max-w-md px-4 pb-24 pt-10 sm:px-6">
      <Suspense fallback={<p className="text-sm text-neutral-500">Loading…</p>}>
        <AdminResetPassword />
      </Suspense>
    </main>
  );
}
