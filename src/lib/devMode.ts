// Single source of truth for "are dev/test-only affordances enabled,"
// used by the dev bypass toggle, check-access, and support-chat routes so
// they can never drift out of sync with each other. True automatically
// under `next dev` (NODE_ENV=development). Also true if
// NEXT_PUBLIC_ENABLE_TEST_TOOLS is explicitly set to "true," for testing a
// production-style local build (`next build && next start`). That flag
// defaults to unset — never set it in a real deployment's environment
// variables.
export function isTestToolsEnabled(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_ENABLE_TEST_TOOLS === "true";
}
