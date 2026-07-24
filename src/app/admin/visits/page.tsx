import { cookies } from "next/headers";
import { verifyAdminCookieValue, ADMIN_SESSION_COOKIE_NAME } from "@/lib/session";
import AdminLogin from "@/components/AdminLogin";
import AdminVisits from "@/components/AdminVisits";

export default function AdminVisitsPage() {
  const isAdmin = verifyAdminCookieValue(cookies().get(ADMIN_SESSION_COOKIE_NAME)?.value);

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-4 pb-24 pt-8 sm:px-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-neutral-900">Visits</h1>
        <div className="flex items-center gap-3">
          {isAdmin && (
            <a
              href="https://dashboard.stripe.com/payments"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-medium text-blue-600 hover:underline"
            >
              Stripe dashboard ↗
            </a>
          )}
          <a href="/admin" className="text-xs font-medium text-blue-600 hover:underline">
            ← Availability
          </a>
        </div>
      </div>
      {isAdmin ? <AdminVisits /> : <AdminLogin />}
    </main>
  );
}
