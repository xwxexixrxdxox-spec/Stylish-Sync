"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { applyTheme, onThemeChange, resolvedTheme, setThemePreference } from "@/lib/theme";
import Tooltip from "./Tooltip";

// Single-tap toggle: shows the icon for the theme a tap would switch TO
// (moon while light, sun while dark) - matches the icon convention most
// customers already know from other apps. Taking the simple "just flips
// it" approach the user asked for as a fallback to auto-matching the
// device, rather than a 3-way light/dark/system picker - once tapped, the
// choice sticks as an explicit override (see theme.ts); nothing here
// deletes that override, so there's no built-in way back to "follow the
// device" from this button alone. That's a deliberate simplicity trade,
// not an oversight - a customer who wants that back can always match
// their device's own setting from here again with one more tap once it's
// showing what they want.
export default function ThemeToggle() {
  // Starts "light" on the server and until mount (matches the pre-hydration
  // DOM the layout's bootstrap script may have already dark-ified) - synced
  // for real in the effect below right after mount, same pattern used
  // elsewhere in this app for anything that reads localStorage/matchMedia.
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(resolvedTheme() === "dark");
    const unsub = onThemeChange(() => setDark(resolvedTheme() === "dark"));
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = () => {
    const next = resolvedTheme() === "dark" ? "light" : "dark";
    setThemePreference(next);
    applyTheme();
    setDark(next === "dark");
  };

  return (
    <Tooltip label={dark ? "Switch to light mode" : "Switch to dark mode"} side="bottom">
      <button
        onClick={toggle}
        aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
        className="rounded-lg p-1.5 text-neutral-500 hover:bg-surface-muted"
      >
        {dark ? <Sun size={18} /> : <Moon size={18} />}
      </button>
    </Tooltip>
  );
}
