"use client";

// Tiny, dependency-free chime synthesized with the Web Audio API - no audio
// asset to fetch or bundle. Kept short (well under a quarter second) so it
// reads as a light confirmation tap rather than a notification sound.

let ctx: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;
  if (!ctx) ctx = new AudioCtx();
  // Browsers suspend new AudioContexts until a user gesture resumes them -
  // safe to call here since playChime is only ever invoked from a click.
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

function tone(target: AudioContext, freq: number, startTime: number, duration: number, peakGain: number) {
  const osc = target.createOscillator();
  const gain = target.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(peakGain, startTime + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
  osc.connect(gain);
  gain.connect(target.destination);
  osc.start(startTime);
  osc.stop(startTime + duration + 0.02);
}

/**
 * Short chime played alongside the "+1"/"-1" pop animation: a bright
 * ascending two-note ding for adding stock, a single lower note for
 * removing. Silently no-ops if Web Audio isn't available.
 */
export function playChime(kind: "add" | "remove") {
  const target = getContext();
  if (!target) return;
  const now = target.currentTime;
  if (kind === "add") {
    tone(target, 880, now, 0.14, 0.09);
    tone(target, 1318.51, now + 0.07, 0.16, 0.09);
  } else {
    tone(target, 523.25, now, 0.16, 0.08);
  }
}
