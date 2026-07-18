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
          <div className="h-[30px] w-1 rounded-[1px] bg-white" />
          <div className="h-[22px] w-1 rounded-[1px] bg-white" />
          <div className="h-[34px] w-[7px] rounded-[1px] bg-white" />
          <div className="h-[22px] w-1 rounded-[1px] bg-white" />
          <div className="h-[30px] w-1 rounded-[1px] bg-white" />
        </div>
        <div className="flex animate-label-in flex-col items-center gap-1.5">
          <div className="text-[19px] font-semibold tracking-[-0.01em] text-ink-900">InventorySync</div>
          <div className="text-[13px] font-normal text-[#8a8a8f]">Scan, Track, Reorder</div>
        </div>
        <div className="mt-1.5 h-[3px] w-[120px] overflow-hidden rounded-full bg-surface-border">
          <div className="h-full animate-fill-bar rounded-full bg-ink-900" />
        </div>
      </div>
    </div>
  );
}
