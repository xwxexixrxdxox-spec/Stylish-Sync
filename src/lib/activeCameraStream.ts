// Module-level registry for whichever camera MediaStream is currently
// live, so code outside the component that opened it can release it
// before a full-page reload/navigation. Mirrors installPrompt.ts's
// "module state instead of React context" pattern for the same reason:
// the two components involved here - ScanTab (which owns the stream) and
// ClearCacheButton (which triggers a full reload from the header, visible
// on every tab including Scan) - are unrelated siblings under page.tsx,
// and threading a barely-related "hey, stop the camera" concern through
// props across that whole tree would be worse than a small shared module.
//
// Why this matters specifically for the iOS Safari "digital artifact" a
// tester reported when tapping Clear Cache & Reload: reload()/navigating
// away triggers WebKit's "capture a snapshot of the current page, then
// transition to the fresh one" animation. If a live camera <video> element
// is still actively rendering frames at the exact moment that fires - e.g.
// a customer taps the header's Clear Cache icon without first backing out
// of an active barcode scan - the raw camera feed itself, not just app UI,
// can end up baked into that snapshot. A blurry/noisy/half-updated video
// frame frozen into a page-transition snapshot is a very literal reading
// of "digital artifact." Explicitly stopping the stream (which blanks the
// video element) and giving the browser a paint frame before navigating
// (see ClearCacheButton.tsx) avoids that.
let activeStream: MediaStream | null = null;

export function setActiveCameraStream(stream: MediaStream | null): void {
  activeStream = stream;
}

// Safe to call even if nothing is active, or if the stream's tracks were
// already stopped elsewhere (e.g. zxing's own controls.stop() cleanup) -
// stopping an already-stopped MediaStreamTrack is a no-op per spec, not an
// error.
export function stopActiveCameraStream(): void {
  if (!activeStream) return;
  activeStream.getTracks().forEach((track) => track.stop());
  activeStream = null;
}
