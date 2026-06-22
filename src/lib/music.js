/**
 * Built-in background music — synthesized with WebAudio (no audio files, no
 * licensing concerns, royalty-free by construction). Each track is a short,
 * seamlessly-loopable chord loop rendered to an AudioBuffer at export time.
 *
 * The note math + track catalog are pure/testable; renderTrackBuffer needs an
 * OfflineAudioContext (browser only).
 */

export const A4 = 440;

/** Equal-tempered frequency for a MIDI note number (69 = A4 = 440Hz). */
export function noteFreq(midi) {
  return A4 * Math.pow(2, (midi - 69) / 12);
}

// Chords as MIDI note arrays. Layers (pad/bass/arp/beat) toggle the texture.
export const MUSIC_TRACKS = [
  {
    id: "calm", name: "Calm", desc: "Soft ambient pad",
    loopSec: 8, bpm: 70, wave: "triangle", pad: true, bass: true, arp: false, beat: false,
    chords: [[60, 64, 67, 71], [57, 60, 64, 67], [53, 57, 60, 64], [55, 59, 62, 65]],
  },
  {
    id: "upbeat", name: "Upbeat", desc: "Bright arpeggio + beat",
    loopSec: 8, bpm: 112, wave: "triangle", pad: true, bass: true, arp: true, beat: true,
    chords: [[60, 64, 67], [55, 59, 62], [57, 60, 64], [53, 57, 60]],
  },
  {
    id: "cinematic", name: "Cinematic", desc: "Swelling pad",
    loopSec: 8, bpm: 60, wave: "sawtooth", pad: true, bass: true, arp: false, beat: false,
    chords: [[48, 60, 67, 72], [50, 57, 65, 69], [53, 60, 69, 72], [55, 59, 67, 74]],
  },
  {
    id: "lofi", name: "Lo-fi", desc: "Mellow chords + soft beat",
    loopSec: 8, bpm: 84, wave: "sine", pad: true, bass: true, arp: false, beat: true,
    chords: [[62, 65, 69, 72], [55, 59, 62, 65], [60, 64, 67, 71], [57, 60, 64, 67]],
  },
];

export function trackById(id) {
  return MUSIC_TRACKS.find((t) => t.id === id) || null;
}

/* ----------------------------- synthesis (browser) ----------------------------- */

function tone(ctx, dest, { freq, start, dur, type = "sine", gain = 0.2, attack = 0.01, release = 0.1, detune = 0 }) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  if (detune) o.detune.value = detune;
  const g = ctx.createGain();
  const t1 = start + dur;
  g.gain.setValueAtTime(0, start);
  g.gain.linearRampToValueAtTime(gain, start + attack);
  g.gain.setValueAtTime(gain, Math.max(start + attack, t1 - release));
  g.gain.linearRampToValueAtTime(0, t1);
  o.connect(g).connect(dest);
  o.start(start);
  o.stop(t1 + 0.02);
}

function kick(ctx, dest, start, gain = 0.5) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.frequency.setValueAtTime(140, start);
  o.frequency.exponentialRampToValueAtTime(45, start + 0.12);
  g.gain.setValueAtTime(gain, start);
  g.gain.exponentialRampToValueAtTime(0.001, start + 0.18);
  o.connect(g).connect(dest);
  o.start(start);
  o.stop(start + 0.2);
}

function hat(ctx, dest, start, gain = 0.1) {
  const len = Math.floor(ctx.sampleRate * 0.05);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const s = ctx.createBufferSource();
  s.buffer = buf;
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 7000;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, start);
  g.gain.exponentialRampToValueAtTime(0.001, start + 0.04);
  s.connect(hp).connect(g).connect(dest);
  s.start(start);
  s.stop(start + 0.06);
}

/**
 * Render a track to a loopable AudioBuffer via OfflineAudioContext.
 * @returns {Promise<AudioBuffer>|null}
 */
export function renderTrackBuffer(track, sampleRate = 44100) {
  if (!track) return null;
  const OAC = (typeof window !== "undefined") && (window.OfflineAudioContext || window.webkitOfflineAudioContext);
  if (!OAC) return null;
  const ctx = new OAC(2, Math.ceil(sampleRate * track.loopSec), sampleRate);
  const master = ctx.createGain();
  master.gain.value = 0.85;
  const comp = ctx.createDynamicsCompressor();
  master.connect(comp).connect(ctx.destination);

  const bars = track.chords.length;
  const secPerChord = track.loopSec / bars;
  for (let i = 0; i < bars; i++) {
    const t0 = i * secPerChord;
    const chord = track.chords[i];
    if (track.pad) {
      for (const n of chord) {
        tone(ctx, master, {
          freq: noteFreq(n), start: t0, dur: secPerChord, type: track.wave,
          gain: 0.09, attack: secPerChord * 0.25, release: secPerChord * 0.3, detune: 4,
        });
      }
    }
    if (track.bass) {
      tone(ctx, master, { freq: noteFreq(chord[0] - 12), start: t0, dur: secPerChord, type: "sine", gain: 0.18, attack: 0.02, release: 0.2 });
    }
    if (track.arp) {
      const steps = 8;
      const stepDur = secPerChord / steps;
      for (let s = 0; s < steps; s++) {
        const n = chord[s % chord.length] + 12;
        tone(ctx, master, { freq: noteFreq(n), start: t0 + s * stepDur, dur: stepDur * 0.9, type: "triangle", gain: 0.11, attack: 0.005, release: stepDur * 0.4 });
      }
    }
    if (track.beat) {
      const beats = Math.max(1, Math.round((secPerChord * track.bpm) / 60));
      const beatDur = secPerChord / beats;
      for (let b = 0; b < beats; b++) {
        kick(ctx, master, t0 + b * beatDur, 0.5);
        hat(ctx, master, t0 + b * beatDur + beatDur / 2, 0.09);
      }
    }
  }
  return ctx.startRendering();
}
