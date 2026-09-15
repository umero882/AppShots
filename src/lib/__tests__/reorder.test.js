import { describe, it, expect } from "vitest";
import { moveItem, slotAt, moveTarget } from "../reorder.js";

const ids = (l) => l.join("");

describe("moveItem", () => {
  const list = ["a", "b", "c", "d"];
  it("moves an item forward", () => {
    expect(ids(moveItem(list, 0, 2))).toBe("bcad");
  });
  it("moves an item backward", () => {
    expect(ids(moveItem(list, 3, 1))).toBe("adbc");
  });
  it("clamps the target to bounds", () => {
    expect(ids(moveItem(list, 0, 99))).toBe("bcda");
    expect(ids(moveItem(list, 3, -5))).toBe("dabc");
  });
  it("is a no-op for an out-of-range source", () => {
    expect(ids(moveItem(list, 9, 0))).toBe("abcd");
  });
  it("returns a new array, leaving the original untouched", () => {
    const out = moveItem(list, 0, 1);
    expect(out).not.toBe(list);
    expect(ids(list)).toBe("abcd");
  });
});

describe("slotAt / moveTarget (drag to reorder)", () => {
  const centers = [50, 150, 250]; // three items

  it("finds the slot the pointer is over", () => {
    expect(slotAt(10, centers)).toBe(0);
    expect(slotAt(100, centers)).toBe(1);
    expect(slotAt(200, centers)).toBe(2);
    expect(slotAt(300, centers)).toBe(3);
    expect(slotAt(50, centers)).toBe(0); // exactly on a center: not past it
  });

  it("maps a slot to the final index, skipping the no-op drops", () => {
    // dragging item 0: slots 0 and 1 both mean "stay"
    expect(moveTarget(0, 0)).toBeNull();
    expect(moveTarget(0, 1)).toBeNull();
    expect(moveTarget(0, 2)).toBe(1);
    expect(moveTarget(0, 3)).toBe(2);
    // dragging item 2 to the front
    expect(moveTarget(2, 0)).toBe(0);
    expect(moveTarget(2, 2)).toBeNull();
    expect(moveTarget(2, 3)).toBeNull();
  });

  it("round-trips through moveItem", () => {
    const list = ["a", "b", "c"];
    expect(moveItem(list, 0, moveTarget(0, 3))).toEqual(["b", "c", "a"]);
    expect(moveItem(list, 2, moveTarget(2, 0))).toEqual(["c", "a", "b"]);
    expect(moveItem(list, 1, moveTarget(1, 3))).toEqual(["a", "c", "b"]);
  });
});
