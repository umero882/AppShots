/**
 * What the canvas context menu offers for a resolved selection (see
 * resolveSelection). Pure: returns item descriptors bound to the `actions`
 * the editor passes in, so the menu for each target is unit-testable.
 *
 * Item: { id, label, onSelect, danger?, disabled? } or { separator: true }.
 */
const sep = { separator: true };

export function menuItemsFor(target, a, { canPaste = false } = {}) {
  if (!target) return [];
  const paste = canPaste ? [{ id: "paste", label: "Paste", onSelect: () => a.paste() }] : [];

  if (target.kind === "text") {
    const edit = { id: "edit", label: "Edit text", onSelect: () => a.editText(target.id ? { kind: "element", id: target.id } : { kind: "text", id: target.field }) };
    if (!target.id) return [edit, { id: "panel", label: "Open Text panel", onSelect: () => a.openPanel("text") }, ...(paste.length ? [sep, ...paste] : [])];
    return [edit, sep, ...elementItems(target, a, paste)];
  }

  if (target.kind === "element") {
    const items = [];
    if (target.label === "Badge") items.push({ id: "edit", label: "Edit text", onSelect: () => a.editText({ kind: "element", id: target.id }) }, sep);
    return [...items, ...elementItems(target, a, paste)];
  }

  if (target.kind === "device") {
    const items = [
      { id: "upload", label: target.hasImage ? "Replace screenshot…" : "Upload screenshot…", onSelect: () => a.uploadDevice(target.id) },
    ];
    if (target.hasImage) items.push({ id: "clear", label: "Remove screenshot", onSelect: () => a.removeScreenshot(target.id) });
    items.push(sep);
    // The legacy single mockup has no instance to copy or cut.
    if (!target.legacy) {
      items.push(
        { id: "copy", label: "Copy", onSelect: () => a.copy() },
        { id: "cut", label: "Cut", onSelect: () => a.cut() }
      );
    }
    items.push({ id: "duplicate", label: "Duplicate", onSelect: () => a.duplicateDevice(target.id) }, ...paste);
    if (target.legacy) items.push({ id: "promote", label: "Position freely", onSelect: () => a.promoteDevice() });
    else items.push(sep, { id: "delete", label: "Delete", danger: true, onSelect: () => a.deleteDevice(target.id) });
    return items;
  }

  if (target.kind === "background") {
    return [
      ...(paste.length ? [...paste, sep] : []),
      { id: "upload", label: "Upload background image…", onSelect: () => a.uploadBackground() },
      { id: "panel", label: "Open Background panel", onSelect: () => a.openPanel("background") },
    ];
  }

  return [];
}

function elementItems(t, a, paste = []) {
  return [
    { id: "copy", label: "Copy", onSelect: () => a.copy() },
    { id: "cut", label: "Cut", onSelect: () => a.cut() },
    { id: "duplicate", label: "Duplicate", onSelect: () => a.duplicateElement(t.id) },
    ...paste,
    sep,
    { id: "forward", label: "Bring forward", disabled: !!t.isTop, onSelect: () => a.reorderElement(t.id, "forward") },
    { id: "backward", label: "Send backward", disabled: !!t.isBottom, onSelect: () => a.reorderElement(t.id, "backward") },
    { id: "front", label: "Bring to front", disabled: !!t.isTop, onSelect: () => a.reorderElement(t.id, "front") },
    { id: "back", label: "Send to back", disabled: !!t.isBottom, onSelect: () => a.reorderElement(t.id, "back") },
    sep,
    { id: "delete", label: "Delete", danger: true, onSelect: () => a.deleteElement(t.id) },
  ];
}

/** The filmstrip's menu for screen `index` of `count`. */
export function screenMenuItems(index, count, a) {
  const last = count - 1;
  return [
    { id: "duplicate", label: "Duplicate screen", onSelect: () => a.duplicateScreen(index) },
    { id: "add", label: "Add screen after", onSelect: () => a.addScreenAfter(index) },
    sep,
    { id: "left", label: "Move left", disabled: index === 0, onSelect: () => a.moveScreen(index, index - 1) },
    { id: "right", label: "Move right", disabled: index === last, onSelect: () => a.moveScreen(index, index + 1) },
    { id: "first", label: "Move to start", disabled: index === 0, onSelect: () => a.moveScreen(index, 0) },
    { id: "end", label: "Move to end", disabled: index === last, onSelect: () => a.moveScreen(index, last) },
    sep,
    { id: "delete", label: "Delete screen", danger: true, disabled: count <= 1, onSelect: () => a.removeScreen(index) },
  ];
}
