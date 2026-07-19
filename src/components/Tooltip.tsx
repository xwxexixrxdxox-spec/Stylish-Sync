"use client";

import { ReactNode, useState } from "react";

interface Props {
  label: string;
  children: ReactNode;
  side?: "top" | "bottom";
}

// Small hover/focus bubble for icon-only buttons — the app has quite a few
// (pencil edit, +/- stock, header icons, "?" help toggles) whose purpose
// isn't spelled out anywhere on screen. Reuses the same dark-bubble look
// already established for the Usage chart's hover tooltip
// (bg-neutral-900/white text/rounded-md) rather than inventing a new style.
// Triggers on focus as well as hover so keyboard users get the same info a
// mouse user would, not just an inaccessible hover-only affordance.
export default function Tooltip({ label, children, side = "top" }: Props) {
  const [show, setShow] = useState(false);

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onFocus={() => setShow(true)}
      onBlur={() => setShow(false)}
    >
      {children}
      {show && (
        <span
          role="tooltip"
          className={`pointer-events-none absolute left-1/2 z-30 -translate-x-1/2 whitespace-nowrap rounded-md bg-neutral-900 px-2 py-1 text-[11px] font-medium text-white shadow-card ${
            side === "top" ? "bottom-full mb-2" : "top-full mt-2"
          }`}
        >
          {label}
        </span>
      )}
    </span>
  );
}
