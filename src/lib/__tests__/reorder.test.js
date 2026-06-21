import { describe, it, expect } from "vitest";
import { moveItem } from "../reorder.js";

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
