import { useEffect, useRef } from "react";
import { cleanInlineText } from "../lib/inlineText";

/**
 * Text the user can edit where it's painted. Until `editing` flips it renders
 * a plain node (double-click calls `onStart`); then it swaps — a different key,
 * so a fresh DOM node — to an uncontrolled contentEditable seeded once from
 * `value`. React never rewrites that text node, so the caret survives every
 * keystroke while `onChange` keeps the side panels live. Enter or blur commits
 * (`onDone`), Escape reverts; Shift+Enter breaks a line only when `multiline`.
 *
 * `style` is applied in both modes so the text keeps its exact typography while
 * being edited (what you type is what exports).
 */
export default function InlineText({
  value,
  editing = false,
  multiline = false,
  onStart,
  onChange,
  onDone,
  caret,
  className = "",
  style,
  ...rest
}) {
  const ref = useRef(null);
  const initial = useRef(value);

  // Seed + focus + select-all once per edit session.
  useEffect(() => {
    if (!editing) return;
    const el = ref.current;
    if (!el) return;
    initial.current = value ?? "";
    el.textContent = value ?? "";
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    if (sel) {
      sel.removeAllRanges();
      sel.addRange(range);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  if (!editing) {
    return (
      <div
        key="view"
        className={`${className} ${onStart ? "cursor-text" : ""}`}
        style={style}
        onDoubleClick={
          onStart
            ? (e) => {
                e.stopPropagation();
                onStart();
              }
            : undefined
        }
        {...rest}
      >
        {value}
      </div>
    );
  }

  const read = () => cleanInlineText(ref.current?.innerText ?? "", multiline);

  function insertAtCaret(text) {
    // execCommand fires the input event itself; the manual path must not.
    if (document.execCommand?.("insertText", false, text)) return;
    const sel = window.getSelection();
    if (!sel?.rangeCount) return;
    const range = sel.getRangeAt(0);
    range.deleteContents();
    const node = document.createTextNode(text);
    range.insertNode(node);
    range.setStartAfter(node);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
    onChange?.(read());
  }

  return (
    <div
      // Caller handlers (e.g. a pointerdown that selects) apply to view mode;
      // while editing, the field's own handlers below must win.
      {...rest}
      key="edit"
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      role="textbox"
      aria-multiline={multiline}
      className={`${className} cursor-text select-text outline-none`}
      style={{
        ...style,
        caretColor: caret,
        // Keep an emptied node the size of one line so the caret stays visible.
        minHeight: typeof style?.lineHeight === "string" ? style.lineHeight : "1em",
        minWidth: "1em",
      }}
      onInput={() => onChange?.(read())}
      onBlur={() => onDone?.()}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          onChange?.(initial.current);
          ref.current?.blur();
        } else if (e.key === "Enter") {
          e.preventDefault();
          if (multiline && e.shiftKey) insertAtCaret("\n");
          else ref.current?.blur();
        }
      }}
      onPaste={(e) => {
        // Plain text only — pasted markup would otherwise land in the export.
        e.preventDefault();
        insertAtCaret(cleanInlineText(e.clipboardData.getData("text/plain"), multiline));
      }}
      // The canvas clears selection on pointerdown and elements start a drag;
      // neither should fire from inside the field.
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    />
  );
}
