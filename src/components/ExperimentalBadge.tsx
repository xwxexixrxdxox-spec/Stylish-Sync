// Small "not fully baked yet" pill, currently only used on the Reorder
// tab's package tracking section. There's no live carrier-status API behind
// that feature — see PackageTracking in types.ts — so this badge exists to
// set expectations before a customer relies on it, until real usage shows
// whether the manual-log approach is worth keeping as-is.
export default function ExperimentalBadge() {
  return (
    <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-700">
      Experimental
    </span>
  );
}
