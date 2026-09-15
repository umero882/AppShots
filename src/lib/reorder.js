/** Move an item from index `from` to index `to`, returning a new array. */
export function moveItem(list, from, to) {
  const arr = [...(list || [])];
  if (from < 0 || from >= arr.length) return arr;
  const target = Math.max(0, Math.min(arr.length - 1, to));
  const [item] = arr.splice(from, 1);
  arr.splice(target, 0, item);
  return arr;
}

/**
 * Where a dragged item would drop: the slot index (0..n) the pointer is over,
 * given the horizontal centers of the items in order — the pointer is past
 * every center it has crossed.
 */
export function slotAt(x, centers) {
  let slot = 0;
  for (const c of centers) if (x > c) slot += 1;
  return slot;
}

/**
 * Translate a drop slot into the final index for moveItem: removing `from`
 * first shifts every later slot down by one. Returns null when the drop would
 * leave the order unchanged.
 */
export function moveTarget(from, slot) {
  const to = slot > from ? slot - 1 : slot;
  return to === from ? null : to;
}
