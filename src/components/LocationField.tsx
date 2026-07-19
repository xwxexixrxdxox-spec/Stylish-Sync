"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

// A combobox for picking (or typing) an item's location: a normal text
// input — so a brand-new location can always just be typed — paired with
// a hand-built dropdown that behaves like a real <select>. Tapping/
// clicking the field (or the chevron) opens every location already in use
// as a scrollable list to browse, not just an inline autocomplete; typing
// narrows that same list live, which is the "auto populate as you type"
// behavior already liked on mobile. This used to be a plain
// input+<datalist>, which gives that live-filter behavior for free but
// only as a browser-native popup — one that isn't rendered at all on iOS
// Safari and looks/behaves differently everywhere else, and never offers
// a "show me everything" browse mode without typing first. Building the
// list by hand instead makes both behaviors consistent on every device.
interface Props {
  value: string;
  onChange: (value: string) => void;
  locations: string[];
  listId: string;
  placeholder?: string;
}

export default function LocationField({ value, onChange, locations, listId, placeholder }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Close on any click/tap outside the field or its dropdown — the usual
  // combobox pattern. Only listens while open, so this doesn't add a
  // global listener for every field on the page all the time.
  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  const trimmed = value.trim().toLowerCase();
  // Empty field (e.g. just opened via the chevron, nothing typed yet) shows
  // every known location — the "browse like a dropdown" mode. Once there's
  // text, narrow to matches — the "auto populate" mode.
  const filtered = trimmed ? locations.filter((loc) => loc.toLowerCase().includes(trimmed)) : locations;

  return (
    <div ref={rootRef} className="relative">
      <div className="relative">
        <input
          className="input pr-8"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
          }}
          placeholder={placeholder ?? "e.g. Dry Stock, Freezer, Back Room"}
        />
        {locations.length > 0 && (
          <button
            type="button"
            aria-label={open ? "Hide locations" : "Browse existing locations"}
            onClick={() => setOpen((o) => !o)}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-neutral-400 hover:text-neutral-600"
          >
            <ChevronDown size={16} className={`transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
        )}
      </div>

      {open && filtered.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-surface-border bg-white py-1 shadow-card"
        >
          {filtered.map((loc) => (
            <li key={loc} role="option" aria-selected={loc === value}>
              <button
                type="button"
                onClick={() => {
                  onChange(loc);
                  setOpen(false);
                }}
                className={`block w-full truncate px-3 py-1.5 text-left text-sm hover:bg-surface-muted ${
                  loc === value ? "bg-surface-muted font-medium text-neutral-900" : "text-neutral-700"
                }`}
              >
                {loc}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
