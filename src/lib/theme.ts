"use client";

// Light/dark theme. Defaults to following the device's OS-level color
// scheme (prefers-color-scheme), same as most native apps - most customers
// never need to touch this. The header toggle (ThemeToggle.tsx) lets
// anyone override that per-device; once they do, the override sticks until
// they explicitly switch back, rather than fighting the OS setting on every
// visit. Kept as its own module (not folded into storage.ts) since the
// class-on-<html> side effect below is DOM manipulation, not just storage
// read/write like everything else in storage.ts.

const THEME_KEY = "isc_theme_v1";
const THEME_EVENT = "isc-theme-changed";

export type ThemePreference = "light" | "dark" | "system";

export function getThemePreference(): ThemePreference {
  if (typeof window === "undefined") return "system";
  const raw = window.localStorage.getItem(THEME_KEY);
  return raw === "light" || raw === "dark" ? raw : "system";
}

// "system" clears the override (removes the key) rather than storing the
// literal string "system" - that way a customer whose OS switches from
// light to dark later (day/night auto-switching is common) keeps tracking
// it automatically, exactly as if they'd never touched the toggle.
export function setThemePreference(pref: ThemePreference): void {
  if (typeof window === "undefined") return;
  if (pref === "system") {
    window.localStorage.removeItem(THEME_KEY);
  } else {
    window.localStorage.setItem(THEME_KEY, pref);
  }
  applyTheme();
  window.dispatchEvent(new Event(THEME_EVENT));
}

// What's actually painted right now, resolving "system" against the OS's
// current preference at call time.
export function resolvedTheme(): "light" | "dark" {
  const pref = getThemePreference();
  if (pref !== "system") return pref;
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

// Toggles the .dark class on <html>, which is what every dark: override in
// globals.css keys off. Also called by the inline bootstrap script in
// layout.tsx (a plain copy of this same logic, since that script runs
// before any of this module's JS has loaded) to avoid a flash of the wrong
// theme between first paint and hydration.
export function applyTheme(): void {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", resolvedTheme() === "dark");
}

// Lets ThemeToggle re-render when either the stored preference changes (a
// tap on the toggle itself) or the OS preference changes out from under an
// unset ("system") preference - both cases repaint the app, so both need
// to be observable.
export function onThemeChange(handler: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(THEME_EVENT, handler);
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const mediaHandler = () => {
    applyTheme();
    handler();
  };
  media.addEventListener("change", mediaHandler);
  return () => {
    window.removeEventListener(THEME_EVENT, handler);
    media.removeEventListener("change", mediaHandler);
  };
}
