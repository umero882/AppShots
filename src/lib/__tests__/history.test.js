import { describe, it, expect } from "vitest";
import { pushPast, undoStacks, redoStacks } from "../history.js";

describe("pushPast", () => {
  it("pushes when enough time has passed", () => {
    const { past, pushed } = pushPast(["a"], "b", { now: 2000, last: 1000 });
    expect(pushed).toBe(true);
    expect(past).toEqual(["a", "b"]);
  });
  it("coalesces a rapid burst (does not push)", () => {
    const { past, pushed } = pushPast(["a"], "b", { now: 1100, last: 1000 });
    expect(pushed).toBe(false);
    expect(past).toEqual(["a"]);
  });
  it("always pushes the first entry even within the window", () => {
    const { pushed } = pushPast([], "a", { now: 1100, last: 1000 });
    expect(pushed).toBe(true);
  });
  it("caps the stack length, dropping the oldest", () => {
    const big = Array.from({ length: 60 }, (_, i) => i);
    const { past } = pushPast(big, 99, { now: 5000, last: 0, cap: 60 });
    expect(past).toHaveLength(60);
    expect(past[0]).toBe(1); // 0 dropped
    expect(past[59]).toBe(99);
  });
});

describe("undoStacks", () => {
  it("pops past into present and pushes old present to future", () => {
    const r = undoStacks(["s1", "s2"], ["s4"], "s3");
    expect(r.present).toBe("s2");
    expect(r.past).toEqual(["s1"]);
    expect(r.future).toEqual(["s3", "s4"]);
  });
  it("returns null when nothing to undo", () => {
    expect(undoStacks([], [], "s")).toBeNull();
  });
});

describe("redoStacks", () => {
  it("shifts future into present and pushes old present to past", () => {
    const r = redoStacks(["s1"], ["s3", "s4"], "s2");
    expect(r.present).toBe("s3");
    expect(r.past).toEqual(["s1", "s2"]);
    expect(r.future).toEqual(["s4"]);
  });
  it("returns null when nothing to redo", () => {
    expect(redoStacks(["s1"], [], "s2")).toBeNull();
  });
});

describe("undo/redo round trip", () => {
  it("restores the original after undo then redo", () => {
    const past = ["A"], future = [];
    const present = "B";
    const u = undoStacks(past, future, present); // present -> A, future has B
    expect(u.present).toBe("A");
    const r = redoStacks(u.past, u.future, u.present); // back to B
    expect(r.present).toBe("B");
  });
});
