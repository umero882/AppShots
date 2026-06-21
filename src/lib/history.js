/**
 * Pure undo/redo stack transitions. Storage (refs) lives in the component; these
 * functions just compute the next stacks so the semantics are unit-testable.
 */

/**
 * Decide whether to record `snapshot` into the past stack. Rapid edits within
 * `window` ms coalesce into one step (and StrictMode double-invokes are absorbed).
 * @returns { past, pushed }
 */
export function pushPast(past, snapshot, { now, last, cap = 60, window = 500 } = {}) {
  if (now - last < window && past.length) return { past, pushed: false };
  const next = [...past, snapshot];
  while (next.length > cap) next.shift();
  return { past: next, pushed: true };
}

/** Undo: move present→future, pop past→present. Returns null if nothing to undo. */
export function undoStacks(past, future, present) {
  if (!past.length) return null;
  return {
    past: past.slice(0, -1),
    present: past[past.length - 1],
    future: [present, ...future],
  };
}

/** Redo: move present→past, shift future→present. Returns null if nothing to redo. */
export function redoStacks(past, future, present) {
  if (!future.length) return null;
  return {
    past: [...past, present],
    present: future[0],
    future: future.slice(1),
  };
}
