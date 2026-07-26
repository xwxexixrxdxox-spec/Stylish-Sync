import { cookies } from "next/headers";
import { verifySessionCookieValue, SESSION_COOKIE_NAME } from "@/lib/session";
import { getAccountById } from "@/lib/accounts";
import PropertyManager from "@/components/PropertyManager";

// A dedicated page (not a BottomNav tab) for tracking physical
// property/equipment — separate from the Inventory tab's consumable stock.
// Gated server-side on the same signed-in customer-account session
// Account/AccountTab.tsx already established (see accounts.ts), the same
// way /admin/visits gates on the admin cookie — checked here rather than
// client-side so a signed-out visitor never even receives the property
// list's markup, just the sign-in prompt below.
export default async function PropertyPage() {
  const session = verifySessionCookieValue(cookies().get(SESSION_COOKIE_NAME)?.value);
  const account = session ? await getAccountById(session.accountId) : null;

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-4 pb-24 pt-6 sm:px-6">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-neutral-900">Manage Property</h1>
        <a href="/" className="text-xs font-medium text-blue-600 hover:underline">
          ← Back to app
        </a>
      </div>

      {!account ? (
        <div className="rounded-xl2 border border-surface-border bg-white p-5 text-center shadow-card">
          <p className="mb-1 text-sm font-semibold text-neutral-900">Sign in required</p>
          <p className="mb-4 text-sm text-neutral-500">
            Property tracking is part of your account — sign up or log in from the Account panel, then come back
            here.
          </p>
          <a
            href="/"
            className="inline-block rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
          >
            Go sign in
          </a>
        </div>
      ) : (
        <PropertyManager />
      )}
    </main>
  );
}
