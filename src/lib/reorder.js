/** Move an item from index `from` to index `to`, returning a new array. */
export function moveItem(list, from, to) {
  const arr = [...(list || [])];
  if (from < 0 || from >= arr.length) return arr;
  const target = Math.max(0, Math.min(arr.length - 1, to));
  const [item] = arr.splice(from, 1);
  arr.splice(target, 0, item);
  return arr;
}
