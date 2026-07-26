// Single source of truth for "are dev/test-only affordances enabled,"
// used by test-only UI (e.g. ScanTab's scan diagnostics panel) and the
// support-chat route so they can never drift out of sync with each other.
// True automatically under `next dev` (NODE_ENV=development). Also true if
// NEXT_PUBLIC_ENABLE_TEST_TOOLS is explicitly set to "true," for testing a
// production-style local build (`next build && next start`). That flag
// defaults to unset — never set it in a real deployment's environment
// variables.
export function isTestToolsEnabled(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_ENABLE_TEST_TOOLS === "true";
}
