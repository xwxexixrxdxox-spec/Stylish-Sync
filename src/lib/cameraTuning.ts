// Camera capability keys below (focusMode, exposureMode, whiteBalanceMode,
// pointsOfInterest) come from the W3C Image Capture spec, which extends
// the standard MediaTrackConstraints/Capabilities but isn't part of
// TypeScript's bundled DOM lib - hence the extra types and casts.
export interface ExtendedTrackCapabilities extends MediaTrackCapabilities {
  focusMode?: string[];
  exposureMode?: string[];
  whiteBalanceMode?: string[];
  pointsOfInterest?: unknown;
}
type ExtendedConstraintSet = MediaTrackConstraintSet & {
  focusMode?: string;
  exposureMode?: string;
  whiteBalanceMode?: string;
  pointsOfInterest?: { x: number; y: number }[];
};

// Prefer the rear camera at a higher resolution. "ideal" constraints are a
// soft preference, so this still falls back gracefully on devices/browsers
// that don't support them. Focus/exposure/white-balance are requested here
// too, but on a lot of Android + Chrome combinations that initial request
// is ignored - applyCameraTuning() below re-applies them directly on the
// live track once the stream exists, which is much more reliably honored.
export const SCAN_VIDEO_CONSTRAINTS: MediaTrackConstraints = {
  facingMode: { ideal: "environment" },
  width: { ideal: 1920 },
  height: { ideal: 1080 },
  advanced: [
    {
      focusMode: "continuous",
      exposureMode: "continuous",
      whiteBalanceMode: "continuous",
    } as ExtendedConstraintSet,
  ],
};

// A focusMode value counts as "actionable" only if we'd actually do
// something with it in focusTrackAt below - keep this in sync with the
// single-shot/continuous branches there so the tap-to-focus hint is never
// shown for a capability (e.g. "manual") that tapping wouldn't act on.
function hasActionableFocusMode(focusMode: string[] | undefined): boolean {
  return !!focusMode && (focusMode.includes("single-shot") || focusMode.includes("continuous"));
}

// Re-applies continuous focus/exposure/white-balance directly on the live
// video track (feature-detected via getCapabilities, so this is a no-op -
// not an error - on browsers/devices that don't expose camera controls,
// e.g. iOS Safari). Returns whether the track exposes an actionable focus
// control, which the caller uses to decide whether to offer tap-to-focus.
export function applyCameraTuning(stream: MediaStream): boolean {
  const track = stream.getVideoTracks()[0];
  if (!track || typeof track.getCapabilities !== "function") return false;
  let caps: ExtendedTrackCapabilities;
  try {
    caps = track.getCapabilities() as ExtendedTrackCapabilities;
  } catch {
    return false;
  }
  const advanced: ExtendedConstraintSet = {};
  if (caps.focusMode?.includes("continuous")) advanced.focusMode = "continuous";
  if (caps.exposureMode?.includes("continuous")) advanced.exposureMode = "continuous";
  if (caps.whiteBalanceMode?.includes("continuous")) advanced.whiteBalanceMode = "continuous";
  if (Object.keys(advanced).length > 0) {
    // Best-effort only - a device rejecting this constraint shouldn't be
    // treated any differently than one that never had the capability.
    track.applyConstraints({ advanced: [advanced] } as MediaTrackConstraints).catch(() => {});
  }
  return hasActionableFocusMode(caps.focusMode);
}

// Mimics a native camera app's "tap to focus": nudges the lens to refocus
// at the tapped point (as a normalized 0-1 x/y), then hands focus back to
// continuous mode shortly after. Entirely feature-detected/best-effort -
// silently does nothing on devices/browsers that don't support manual
// focus points (which includes most iOS Safari versions, where continuous
// autofocus already runs by default and needs no help). Returns a cleanup
// function that cancels the pending "revert to continuous" timer, if any,
// so callers can clear it on stop/unmount.
export function focusTrackAt(stream: MediaStream, x: number, y: number): () => void {
  const track = stream.getVideoTracks()[0];
  if (!track || typeof track.getCapabilities !== "function") return () => {};
  let caps: ExtendedTrackCapabilities;
  try {
    caps = track.getCapabilities() as ExtendedTrackCapabilities;
  } catch {
    return () => {};
  }
  if (!hasActionableFocusMode(caps.focusMode)) return () => {};
  const advanced: ExtendedConstraintSet = {};
  if (caps.pointsOfInterest) advanced.pointsOfInterest = [{ x, y }];
  advanced.focusMode = caps.focusMode?.includes("single-shot") ? "single-shot" : "continuous";

  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  track
    .applyConstraints({ advanced: [advanced] } as MediaTrackConstraints)
    .then(() => {
      if (advanced.focusMode === "single-shot" && caps.focusMode?.includes("continuous")) {
        timeoutId = setTimeout(() => {
          track
            .applyConstraints({ advanced: [{ focusMode: "continuous" } as ExtendedConstraintSet] } as MediaTrackConstraints)
            .catch(() => {});
        }, 1500);
      }
    })
    .catch(() => {});

  return () => {
    if (timeoutId) clearTimeout(timeoutId);
  };
}

// Temporary on-screen diagnostics for tracking down device-specific scan
// failures (e.g. reports of "works on iOS, not on this Android phone")
// without needing to see the device's screen directly. Shows the camera
// settings actually granted plus a live tally of decode attempts, broken
// down by why each attempt failed - "no barcode-shaped pattern found" vs.
// "found something but couldn't read it cleanly" are very different
// problems (framing/distance vs. focus/blur/resolution).
export interface ScanDiagnostics {
  attempts: number;
  notFound: number;
  errorKinds: Record<string, number>;
  actualWidth: number | null;
  actualHeight: number | null;
  facingModeActual: string | null;
  focusModes: string[] | null;
  exposureModes: string[] | null;
  whiteBalanceModes: string[] | null;
  tuningApplied: boolean;
}

export const EMPTY_DIAGNOSTICS: ScanDiagnostics = {
  attempts: 0,
  notFound: 0,
  errorKinds: {},
  actualWidth: null,
  actualHeight: null,
  facingModeActual: null,
  focusModes: null,
  exposureModes: null,
  whiteBalanceModes: null,
  tuningApplied: false,
};
