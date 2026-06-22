import { describe, it, expect } from "vitest";
import { noteFreq, MUSIC_TRACKS, trackById, A4 } from "../music.js";

describe("noteFreq", () => {
  it("anchors A4 at 440Hz", () => {
    expect(noteFreq(69)).toBe(A4);
  });
  it("computes middle C and an octave relationship", () => {
    expect(noteFreq(60)).toBeCloseTo(261.63, 1);
    expect(noteFreq(72)).toBeCloseTo(noteFreq(60) * 2, 5);
  });
});

describe("MUSIC_TRACKS catalog", () => {
  it("offers several built-in moods", () => {
    expect(MUSIC_TRACKS.length).toBeGreaterThanOrEqual(3);
    expect(MUSIC_TRACKS.map((t) => t.id)).toEqual(expect.arrayContaining(["calm", "upbeat"]));
  });
  it("every track has a name, a positive loop length and chords", () => {
    for (const t of MUSIC_TRACKS) {
      expect(t.name).toBeTruthy();
      expect(t.loopSec).toBeGreaterThan(0);
      expect(Array.isArray(t.chords) && t.chords.length).toBeTruthy();
      for (const c of t.chords) expect(c.every((n) => Number.isFinite(n))).toBe(true);
    }
  });
  it("trackById finds a track or returns null", () => {
    expect(trackById("calm")?.name).toBe("Calm");
    expect(trackById("nope")).toBeNull();
  });
});
