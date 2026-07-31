"use client";

// A small "the voice guide is talking right now" indicator - a row of bars
// that bounce while narration is playing and sit flat/still the moment it
// pauses or ends. Added for the tutorial's welcome and Google sign-in
// steps (see tutorial.ts's showSoundBar field), where there's otherwise
// zero visual feedback that anything is actually happening during a beat
// with nothing on screen to spotlight yet (welcome) or where the thing
// being narrated is a background concept rather than a single tappable
// element (Google sign-in's "why" more than its "where").
//
// Deliberately a CSS approximation rather than a real Web Audio
// AnalyserNode reading the actual clip's live amplitude. A true analyser
// needs its own AudioContext + MediaElementSourceNode per <audio> element,
// and TutorialOverlay/PropertyTutorialOverlay both construct a brand new
// Audio() instance for every single step (see playStepAt) - wiring a fresh
// analyser graph to each one, cleaning the old one up, and handling every
// browser's autoplay-policy quirks around AudioContext resume() was a lot
// of surface area for a HUD accent nobody is scrutinizing frame-by-frame.
// Four bars bouncing out of sync (via a shared keyframe with a different
// animation-delay each, see tailwind.config.ts's soundbar-bounce) reads as
// "someone is talking" just as well in practice, with none of that risk.
const BAR_COUNT = 4;
const BAR_DELAYS_MS = [0, 120, 60, 180]; // deliberately not evenly spaced - a uniform stagger still reads as one repeating pattern instead of "alive"

interface Props {
  // Whether narration is actively playing right now - bars bounce while
  // true, and settle to a low flat line the instant it goes false (paused,
  // muted, or between clips), rather than continuing to animate against
  // silence.
  speaking: boolean;
}

export default function TutorialSoundBar({ speaking }: Props) {
  return (
    <div
      className="flex items-end gap-[3px]"
      style={{ height: 16 }}
      role="img"
      aria-label={speaking ? "Voice guide speaking" : "Voice guide paused"}
    >
      {Array.from({ length: BAR_COUNT }, (_, i) => (
        <div
          key={i}
          className={`w-[3px] rounded-full bg-amber-300 transition-opacity duration-200 ${
            speaking ? "animate-soundbar-bounce opacity-100" : "opacity-40"
          }`}
          style={{
            height: "100%",
            transformOrigin: "bottom",
            animationDelay: speaking ? `${BAR_DELAYS_MS[i]}ms` : undefined,
            // Flat, non-bouncing baseline when not speaking - a fixed short
            // scale rather than 0, so the bars read as "resting", not gone.
            transform: speaking ? undefined : "scaleY(0.3)",
          }}
        />
      ))}
    </div>
  );
}
