import { cookies } from "next/headers";
import { verifyAdminCookieValue, ADMIN_SESSION_COOKIE_NAME } from "@/lib/session";
import AdminLogin from "@/components/AdminLogin";
import AdminAvailabilityEditor from "@/components/AdminAvailabilityEditor";

// Server-rendered gate: whether the login form or the editor renders is
// decided from the signed cookie before anything reaches the client, so
// an unauthenticated visitor never even receives the editor's markup.
export default function AdminPage() {
  const isAdmin = verifyAdminCookieValue(cookies().get(ADMIN_SESSION_COOKIE_NAME)?.value);

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-4 pb-24 pt-8 sm:px-6">
      <h1 className="mb-6 text-lg font-semibold text-neutral-900">Visit availability</h1>
      {isAdmin ? <AdminAvailabilityEditor /> : <AdminLogin />}
    </main>
  );
}
