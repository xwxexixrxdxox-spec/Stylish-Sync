"use client";

import { useEffect, useRef } from "react";

// The "your guide is talking to you right now" panel: a bright blue
// oscilloscope trace on a dark frosted card, floating just above the bottom
// nav. Built from the customer's VoiceUI reference image, and deliberately
// scoped to exactly two steps - the inventory tour's `welcome` and the
// property tour's `welcome-property` (see each step list's showSoundBar
// field). Their note, verbatim: "have a cool animation playing while the
// narrator talks during the welcome step but not any other step would this
// animation play."
//
// Why those two steps and no others: they're the only steps with no
// spotlight target at all. Everywhere else the amber glow is already saying
// "look here, and listen," so a second animated thing competing for the eye
// would just be noise. On a welcome step there is nothing on screen to glow
// at, the page is fully live and undimmed, and the tour has no dialog card
// - without this the customer's first four seconds of the product are a
// voice coming out of a page that looks completely idle. This is the thing
// that says "that's me, and I'm talking to you."
//
// This replaced TutorialSoundBar.tsx, a 4-bar 16px chip that lived inside
// the HUD pill. Its core engineering call still stands and is worth keeping
// on the record: this is a synthesized trace, NOT a real Web Audio
// AnalyserNode reading the clip's live amplitude. An analyser needs its own
// AudioContext + MediaElementSourceNode per <audio> element, and both
// overlays construct a brand new Audio() for every single step (see
// playStepAt) - wiring a fresh analyser graph to each one, tearing the old
// one down, and handling every browser's autoplay-policy quirks around
// AudioContext.resume() is a lot of failure surface for an accent nobody
// scrutinizes frame by frame. Three summed sine waves under a
// syllable-rate envelope read as "someone is speaking" just as well.
//
// Blue rather than the tour's amber on purpose: amber means "this control,
// right here." The voice isn't a control, and colour-coding it the same way
// would quietly teach the customer that amber sometimes means nothing to
// tap.

// Enough points that the trace looks jagged rather than like a smooth rope,
// but few enough that rebuilding the whole `points` string every frame is
// cheap. This only ever animates on two steps of a ~48-step tour.
//
// This and the wave frequencies below are a matched pair: the fastest
// component packs ~24 peaks across the panel, and Nyquist means you need
// well over 2 samples per peak or the trace visibly crawls and shimmers
// from aliasing rather than oscillating. 176 points gives ~7 samples per
// peak, which is enough to draw each one cleanly. Raise the frequencies
// without raising this and it gets worse, not spikier.
const POINT_COUNT = 176;
const VIEW_W = 320;
const VIEW_H = 56;
const MID = VIEW_H / 2;
// Leaves a few px of headroom so the stroke's round cap and glow never get
// clipped by the viewBox at a peak.
const MAX_AMP = MID - 4;

function flatPoints(): string {
  return Array.from(
    { length: POINT_COUNT },
    (_, i) => `${((i / (POINT_COUNT - 1)) * VIEW_W).toFixed(1)},${MID}`,
  ).join(" ");
}

const FLAT = flatPoints();

interface Props {
  // Whether narration is actually playing right now - wired off the real
  // <audio> element's play/pause/ended events by both overlays, not
  // inferred from "is this the active step," so muting mid-clip or a clip
  // simply finishing both settle the trace honestly instead of leaving it
  // dancing against silence.
  speaking: boolean;
}

export default function TutorialVoiceWave({ speaking }: Props) {
  const traceRef = useRef<SVGPolylineElement>(null);
  const ghostRef = useRef<SVGPolylineElement>(null);
  // Read inside the animation frame rather than closed over, so a
  // mute/unmute mid-clip is picked up by the loop already in flight.
  const speakingRef = useRef(speaking);
  speakingRef.current = speaking;
  // Survives across effect runs so the trace *eases* between talking and
  // resting instead of snapping flat the instant a clip ends.
  const levelRef = useRef(0);

  useEffect(() => {
    const trace = traceRef.current;
    if (!trace) return;

    // Someone who has asked their OS for less motion gets a still trace
    // rather than a jittering one. The panel is decorative; the narration
    // it accompanies is the actual content, and that's untouched.
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      trace.setAttribute("points", FLAT);
      ghostRef.current?.setAttribute("points", FLAT);
      return;
    }

    let raf = 0;
    let last = performance.now();

    const frame = (now: number) => {
      // Clamped so a backgrounded tab returning after 30s doesn't jump the
      // envelope forward by a huge dt and pop.
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const target = speakingRef.current ? 1 : 0;
      levelRef.current += (target - levelRef.current) * Math.min(dt * 6, 1);
      const level = levelRef.current;
      const t = now / 1000;

      let main = "";
      let ghost = "";
      for (let i = 0; i < POINT_COUNT; i++) {
        const u = i / (POINT_COUNT - 1);
        const x = u * VIEW_W;
        // Tapers both ends into the centre line, so the trace resolves out
        // of flat at the panel's edges instead of getting chopped off
        // mid-peak.
        const taper = Math.sin(Math.PI * u);
        // Roughly syllable-rate swell - this is what makes it read as
        // speech rather than a tone generator.
        const env = 0.4 + 0.6 * Math.abs(Math.sin(t * 2.2 + u * 1.7));
        // Three incommensurate frequencies: the fast two give the jagged
        // texture, the slow one keeps the whole trace drifting so it never
        // settles into a visibly repeating pattern. These started an octave
        // and a half lower and the result read as a rolling rope rather
        // than a voice trace - a real scope packs a lot of peaks into a
        // little width, and that density is most of what makes it legible
        // as sound. See POINT_COUNT above before changing them again.
        const wave =
          Math.sin(u * 78 + t * 9) * 0.46 +
          Math.sin(u * 151 - t * 14) * 0.3 +
          Math.sin(u * 23 + t * 4.7) * 0.36;
        const amp = wave * env * taper * level * MAX_AMP;
        main += `${x.toFixed(1)},${(MID - amp).toFixed(1)} `;
        ghost += `${x.toFixed(1)},${(MID - amp * 0.55).toFixed(1)} `;
      }
      trace.setAttribute("points", main.trim());
      ghostRef.current?.setAttribute("points", ghost.trim());

      // Park the loop once it's silent and fully settled. The effect
      // re-runs on `speaking`, which restarts it - so a resting panel costs
      // nothing per frame rather than redrawing a flat line 60 times a
      // second for as long as the step is up.
      if (!speakingRef.current && level < 0.002) {
        levelRef.current = 0;
        trace.setAttribute("points", FLAT);
        ghostRef.current?.setAttribute("points", FLAT);
        return;
      }
      raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [speaking]);

  return (
    // pointer-events-none matters as much here as on the overlay root: the
    // page underneath is fully live now, and this panel sits over real
    // content. It must never eat a tap.
    <div
      className={`pointer-events-none fixed bottom-24 left-1/2 z-[201] -translate-x-1/2 transition-opacity duration-300 ${
        speaking ? "opacity-100" : "opacity-60"
      }`}
      role="img"
      aria-label={speaking ? "Voice guide speaking" : "Voice guide paused"}
    >
      <div className="flex w-[min(20rem,82vw)] flex-col items-center gap-1.5 rounded-2xl border border-sky-400/25 bg-neutral-950/80 px-4 py-3 shadow-card backdrop-blur">
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          className="h-12 w-full overflow-visible"
          aria-hidden="true"
          focusable="false"
        >
          {/* A thicker, dimmer trace at 55% of the amplitude sitting behind
              the main one - the cheap way to get the "there's depth to
              this" look of a real scope without a second animation. */}
          <polyline
            ref={ghostRef}
            points={FLAT}
            fill="none"
            stroke="#0ea5e9"
            strokeOpacity={0.35}
            strokeWidth={5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <polyline
            ref={traceRef}
            points={FLAT}
            fill="none"
            stroke="#7dd3fc"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ filter: "drop-shadow(0 0 6px rgba(56,189,248,0.85))" }}
          />
        </svg>
        <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-sky-200/70">
          {speaking ? "Speaking" : "Voice guide"}
        </span>
      </div>
    </div>
  );
}
