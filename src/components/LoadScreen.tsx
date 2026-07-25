"use client";

interface Props {
  exiting?: boolean;
}

/**
 * App load/splash screen, implemented from the "Load Screen" design handoff.
 * Shown briefly while the app boots (localStorage read + access check) so
 * there's a branded moment instead of a blank flash.
 */
export default function LoadScreen({ exiting = false }: Props) {
  return (
    <div
      className={`fixed inset-0 z-50 flex min-h-[560px] items-center justify-center bg-surface-muted transition-opacity duration-300 ${
        exiting ? "pointer-events-none opacity-0" : "opacity-100"
      }`}
    >
      <div className="flex flex-col items-center gap-[22px]">
        <div className="flex h-[76px] w-[76px] animate-mark-in items-center justify-center gap-[5px] rounded-[20px] bg-ink-900 shadow-card">
          {/* Fixed white bars against the always-dark logo square (bg-ink-900
              deliberately isn't touched by the dark-mode overrides in
              globals.css, same reasoning as the brand/CTA buttons) - these
              use an arbitrary-value class (bg-[#ffffff]) rather than the
              plain `bg-white` utility specifically so the global
              `.dark .bg-white` card-surface override (which correctly
              darkens the ~70 other bg-white card surfaces app-wide) can't
              catch them too and turn the icon invisible against its own
              background. */}
          <div className="h-[30px] w-1 rounded-[1px] bg-[#ffffff]" />
          <div className="h-[22px] w-1 rounded-[1px] bg-[#ffffff]" />
          <div className="h-[34px] w-[7px] rounded-[1px] bg-[#ffffff]" />
          <div className="h-[22px] w-1 rounded-[1px] bg-[#ffffff]" />
          <div className="h-[30px] w-1 rounded-[1px] bg-[#ffffff]" />
        </div>
        <div className="flex animate-label-in flex-col items-center gap-1.5">
          {/* text-neutral-900 (not text-ink-900) on purpose: same #171717 in
              light mode, but this one IS covered by the global dark-mode
              text override, so the headline stays readable instead of
              rendering near-invisible dark-gray-on-dark. */}
          <div className="text-[19px] font-semibold tracking-[-0.01em] text-neutral-900">
            WS Inventory Management
          </div>
          <div className="text-[13px] font-normal text-[#8a8a8f]">Scan, Track, Reorder</div>
        </div>
        <div className="mt-1.5 h-[3px] w-[120px] overflow-hidden rounded-full bg-surface-border">
          {/* Explicit dark: variant (rather than bg-ink-900) since this fill
              needs to flip color by theme - dark-on-light in light mode,
              light-on-dark in dark mode - which a shared bg-ink-900 override
              can't do without also repainting the logo square above. */}
          <div className="h-full animate-fill-bar rounded-full bg-[#171717] dark:bg-[#f4f4f5]" />
        </div>
      </div>
    </div>
  );
}
