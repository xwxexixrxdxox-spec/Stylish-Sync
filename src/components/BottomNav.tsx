"use client";

import { Boxes, ScanLine, ListChecks, MessageCircleQuestion, BarChart3 } from "lucide-react";

// "account" is no longer a bottom-nav tab - Account settings moved into a
// collapsible sidebar (see AccountSidebar.tsx) opened from the header, to
// make room for the Usage tab without crowding the bar.
export type TabId = "scan" | "inventory" | "reorder" | "usage" | "support";

interface Props {
  active: TabId;
  onChange: (tab: TabId) => void;
}

const ITEMS: { id: TabId; label: string; icon: typeof Boxes }[] = [
  { id: "scan", label: "Scan", icon: ScanLine },
  { id: "inventory", label: "Inventory", icon: Boxes },
  { id: "reorder", label: "Reorder", icon: ListChecks },
  { id: "usage", label: "Usage", icon: BarChart3 },
  { id: "support", label: "Support", icon: MessageCircleQuestion },
];

export default function BottomNav({ active, onChange }: Props) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-surface-border bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
      <div className="mx-auto flex max-w-2xl justify-around px-2 py-1.5">
        {ITEMS.map(({ id, label, icon: Icon }) => {
          const isActive = active === id;
          return (
            <button
              key={id}
              onClick={() => onChange(id)}
              className="flex min-w-[64px] flex-col items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-medium"
            >
              <Icon
                size={22}
                strokeWidth={isActive ? 2.4 : 1.8}
                className={isActive ? "text-brand" : "text-neutral-400"}
              />
              <span className={isActive ? "text-brand" : "text-neutral-400"}>{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
