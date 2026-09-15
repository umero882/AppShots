import { useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * A right-click menu anchored at a viewport point. Closes on Escape, on any
 * pointerdown outside it, on scroll/resize, or when an item is chosen. Kept
 * inside the viewport by nudging its top-left corner after measuring.
 */
export default function ContextMenu({ x, y, items, onClose }) {
  const ref = useRef(null);
  const [pos, setPos] = useState({ left: x, top: y });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const pad = 8;
    setPos({
      left: Math.max(pad, Math.min(x, window.innerWidth - r.width - pad)),
      top: Math.max(pad, Math.min(y, window.innerHeight - r.height - pad)),
    });
  }, [x, y, items]);

  useEffect(() => {
    const away = (e) => { if (!ref.current?.contains(e.target)) onClose(); };
    const key = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("pointerdown", away, true);
    window.addEventListener("keydown", key);
    window.addEventListener("scroll", onClose, true);
    window.addEventListener("resize", onClose);
    window.addEventListener("blur", onClose);
    return () => {
      window.removeEventListener("pointerdown", away, true);
      window.removeEventListener("keydown", key);
      window.removeEventListener("scroll", onClose, true);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("blur", onClose);
    };
  }, [onClose]);

  if (!items?.length) return null;
  return (
    <div
      ref={ref}
      role="menu"
      className="fixed z-[70] min-w-[184px] rounded-xl border border-white/10 bg-ink-900/95 p-1 shadow-2xl backdrop-blur"
      style={pos}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((it, i) =>
        it.separator ? (
          <div key={`sep-${i}`} className="my-1 h-px bg-white/10" />
        ) : (
          <button
            key={it.id}
            role="menuitem"
            type="button"
            disabled={it.disabled}
            onClick={() => {
              onClose();
              it.onSelect();
            }}
            className={`flex w-full items-center rounded-lg px-2.5 py-1.5 text-left text-xs font-medium transition disabled:opacity-40 disabled:hover:bg-transparent ${
              it.danger ? "text-red-300 hover:bg-red-500/10" : "text-slate-200 hover:bg-white/10"
            }`}
          >
            {it.label}
          </button>
        )
      )}
    </div>
  );
}
