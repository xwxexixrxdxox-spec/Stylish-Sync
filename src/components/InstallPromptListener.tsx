"use client";

import { useEffect } from "react";
import { initInstallPromptCapture } from "@/lib/installPrompt";

// Mounted once at the app root (see layout.tsx) so the install prompt is
// captured as early as possible — well before the account panel (where
// the actual "Install app" button lives) is ever opened.
export default function InstallPromptListener() {
  useEffect(() => {
    initInstallPromptCapture();
  }, []);
  return null;
}
