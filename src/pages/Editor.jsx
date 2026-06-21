import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  ArrowLeft, Plus, Download, Trash2, Copy, Check, Loader2,
  Image as ImageIcon, Upload, Smartphone, Palette, Type, LayoutTemplate, Sparkles,
  Contrast, Search, Wand2, Github, AlertCircle, Shapes,
  BringToFront, SendToBack, ArrowUp, ArrowDown, Undo2, Redo2,
  ChevronLeft, ChevronRight,
} from "lucide-react";
import Logo from "../components/Logo";
import TemplateGrid from "../components/TemplateGrid";
import {
  applyTemplateStyle, textPosFor, worstContrast, suggestTextColor,
} from "../lib/galleryTemplates";
import { BG_PRESETS, BG_CATEGORIES } from "../lib/backgroundImages";
import { searchImages } from "../lib/imageSearch";
import {
  getCapabilities, suggestBackgrounds, generateImage, aiGradientCss, AI_MODELS,
} from "../lib/aiBackground";
import ScreenCanvas from "../components/ScreenCanvas";
import { useAuth } from "../lib/auth";
import { backend } from "../lib/backend";
import { DEVICES, getDevice } from "../lib/devices";
import {
  makeElement, makeEmojiElement, makeIconElement, makeImageElement, elementSvg,
  reorderElements, duplicateElement, clamp01,
  BADGES, SHAPES, ARROWS, EMOJI, ICONS, PHOTO_CATEGORIES,
} from "../lib/elements";
import { elementIcon } from "../lib/elementIcons";
import {
  GRADIENTS, SOLIDS, FONTS, LAYOUTS, defaultScreen, defaultProjectState,
} from "../lib/templates";
import {
  exportNode, copyNodeToClipboard, readFileAsDataURL, renderNode, dataUrlToBytes, triggerDownload,
} from "../lib/export";
import { createZip } from "../lib/zip";
import { pushPast, undoStacks, redoStacks } from "../lib/history";
import { moveItem } from "../lib/reorder";

const TABS = [
  { id: "templates", label: "Templates", icon: Sparkles },
  { id: "device", label: "Device", icon: Smartphone },
  { id: "background", label: "Background", icon: Palette },
  { id: "text", label: "Text", icon: Type },
  { id: "layout", label: "Layout", icon: LayoutTemplate },
  { id: "elements", label: "Elements", icon: Shapes },
];

export default function Editor() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [project, setProject] = useState(null);
  const [state, setState] = useState(null);
  const [name, setName] = useState("");
  const [activeScreen, setActiveScreen] = useState(0);
  const [tab, setTab] = useState("device");
  const [saveState, setSaveState] = useState("saved"); // saved | saving | dirty
  const [exporting, setExporting] = useState(false);
  const [selectedEl, setSelectedEl] = useState(null);
  const [format, setFormat] = useState("png"); // png | jpeg
  const [copied, setCopied] = useState(false);

  const canvasRef = useRef(null);
  const fileRef = useRef(null);
  const saveTimer = useRef(null);

  // Undo/redo history. Snapshots of `state`; rapid edits (typing/dragging) within
  // a short window coalesce into one step.
  const past = useRef([]);
  const future = useRef([]);
  const lastPush = useRef(0);
  const [, setHistTick] = useState(0);

  // load
  useEffect(() => {
    let active = true;
    backend.getProject(id).then((p) => {
      if (!active) return;
      if (!p || p.userId !== user.id) {
        navigate("/dashboard");
        return;
      }
      setProject(p);
      setState(p.state || defaultProjectState());
      setName(p.name);
    });
    return () => {
      active = false;
    };
  }, [id, user.id, navigate]);

  // Keyboard shortcuts for the selected element (ignored while typing in a field).
  useEffect(() => {
    function onKey(e) {
      if (!selectedEl) return;
      const t = e.target;
      const tag = (t?.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select" || t?.isContentEditable) return;
      const el = state?.screens?.[activeScreen]?.elements?.find((x) => x.id === selectedEl);
      if (!el) return;
      const step = e.shiftKey ? 0.05 : 0.01;
      switch (e.key) {
        case "Delete":
        case "Backspace":
          e.preventDefault();
          deleteElement(selectedEl);
          break;
        case "Escape":
          setSelectedEl(null);
          break;
        case "ArrowLeft":
          e.preventDefault();
          changeElement(selectedEl, { x: clamp01(el.x - step) });
          break;
        case "ArrowRight":
          e.preventDefault();
          changeElement(selectedEl, { x: clamp01(el.x + step) });
          break;
        case "ArrowUp":
          e.preventDefault();
          changeElement(selectedEl, { y: clamp01(el.y - step) });
          break;
        case "ArrowDown":
          e.preventDefault();
          changeElement(selectedEl, { y: clamp01(el.y + step) });
          break;
        case "[":
          reorderElement(selectedEl, "backward");
          break;
        case "]":
          reorderElement(selectedEl, "forward");
          break;
        case "d":
        case "D":
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            duplicateSelectedElement();
          }
          break;
        default:
          break;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedEl, state, activeScreen]);

  // Undo / redo (Cmd/Ctrl+Z, Shift to redo; Ctrl+Y). Ignored while typing.
  useEffect(() => {
    function onKey(e) {
      const t = e.target;
      const tag = (t?.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select" || t?.isContentEditable) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && (e.key === "z" || e.key === "Z")) {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
      } else if (mod && (e.key === "y" || e.key === "Y")) {
        e.preventDefault();
        redo();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state, name]);

  // debounced autosave
  const scheduleSave = useCallback(
    (nextState, nextName) => {
      setSaveState("saving");
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        await backend.updateProject(id, {
          name: nextName,
          state: nextState,
        });
        setSaveState("saved");
      }, 600);
    },
    [id]
  );

  function pushHistory(snapshot) {
    if (!snapshot) return;
    const now = Date.now();
    const { past: np, pushed } = pushPast(past.current, snapshot, { now, last: lastPush.current });
    past.current = np;
    if (pushed) {
      future.current = [];
      setHistTick((v) => v + 1);
    }
    lastPush.current = now;
  }

  function update(patch) {
    setState((prev) => {
      pushHistory(prev);
      const next = typeof patch === "function" ? patch(prev) : { ...prev, ...patch };
      scheduleSave(next, name);
      return next;
    });
  }

  function undo() {
    if (!past.current.length) return;
    setState((cur) => {
      const r = undoStacks(past.current, future.current, cur);
      if (!r) return cur;
      past.current = r.past;
      future.current = r.future;
      scheduleSave(r.present, name);
      return r.present;
    });
    setSelectedEl(null);
    lastPush.current = 0;
    setHistTick((v) => v + 1);
  }

  function redo() {
    if (!future.current.length) return;
    setState((cur) => {
      const r = redoStacks(past.current, future.current, cur);
      if (!r) return cur;
      past.current = r.past;
      future.current = r.future;
      scheduleSave(r.present, name);
      return r.present;
    });
    setSelectedEl(null);
    lastPush.current = 0;
    setHistTick((v) => v + 1);
  }

  function updateName(value) {
    setName(value);
    scheduleSave(state, value);
  }

  function updateScreen(idx, patch) {
    update((prev) => {
      const screens = prev.screens.map((s, i) => (i === idx ? { ...s, ...patch } : s));
      return { ...prev, screens };
    });
  }

  function addElement(el) {
    update((prev) => ({
      ...prev,
      screens: prev.screens.map((s, i) =>
        i === activeScreen ? { ...s, elements: [...(s.elements || []), el] } : s
      ),
    }));
    setSelectedEl(el.id);
    setTab("elements");
  }

  function changeElement(id, patch) {
    update((prev) => ({
      ...prev,
      screens: prev.screens.map((s, i) =>
        i === activeScreen
          ? { ...s, elements: (s.elements || []).map((e) => (e.id === id ? { ...e, ...patch } : e)) }
          : s
      ),
    }));
  }

  function deleteElement(id) {
    update((prev) => ({
      ...prev,
      screens: prev.screens.map((s, i) =>
        i === activeScreen ? { ...s, elements: (s.elements || []).filter((e) => e.id !== id) } : s
      ),
    }));
    setSelectedEl((cur) => (cur === id ? null : cur));
  }

  function selectElement(id) {
    setSelectedEl(id);
    if (id) setTab("elements"); // surface the element's layer/delete controls
  }

  function reorderElement(id, op) {
    update((prev) => ({
      ...prev,
      screens: prev.screens.map((s, i) =>
        i === activeScreen ? { ...s, elements: reorderElements(s.elements || [], id, op) } : s
      ),
    }));
  }

  function duplicateSelectedElement() {
    const el = state?.screens[activeScreen]?.elements?.find((x) => x.id === selectedEl);
    if (el) addElement(duplicateElement(el));
  }

  async function onUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await readFileAsDataURL(file);
    updateScreen(activeScreen, { image: dataUrl });
    e.target.value = "";
  }

  function addScreen() {
    update((prev) => {
      const base = prev.screens[activeScreen]?.background || prev.background;
      const next = { ...defaultScreen(), background: base ? { ...base } : undefined };
      return { ...prev, screens: [...prev.screens, next] };
    });
    setActiveScreen(state.screens.length);
  }

  function duplicateScreen(idx) {
    update((prev) => {
      const copy = { ...prev.screens[idx], id: Math.random().toString(36).slice(2, 9) };
      const screens = [...prev.screens];
      screens.splice(idx + 1, 0, copy);
      return { ...prev, screens };
    });
  }

  function moveScreen(from, to) {
    if (to < 0 || to >= state.screens.length) return;
    update((prev) => ({ ...prev, screens: moveItem(prev.screens, from, to) }));
    setActiveScreen(to);
  }

  function removeScreen(idx) {
    if (state.screens.length === 1) return;
    update((prev) => ({
      ...prev,
      screens: prev.screens.filter((_, i) => i !== idx),
    }));
    setActiveScreen((a) => Math.max(0, a > idx ? a - 1 : a));
  }

  async function exportOne() {
    if (!canvasRef.current) return;
    setExporting(true);
    setSelectedEl(null);
    await new Promise((r) => setTimeout(r, 60)); // let selection chrome clear
    try {
      const device = getDevice(state.deviceId);
      await exportNode(canvasRef.current, device.canvas.w, {
        filename: `${slug(name)}-${activeScreen + 1}`,
        format,
      });
    } finally {
      setExporting(false);
    }
  }

  async function copyCurrent() {
    if (!canvasRef.current) return;
    setSelectedEl(null);
    await new Promise((r) => setTimeout(r, 60));
    try {
      const device = getDevice(state.deviceId);
      await copyNodeToClipboard(canvasRef.current, device.canvas.w);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard may be blocked (permissions / insecure context) — ignore
    }
  }

  async function exportAll() {
    setExporting(true);
    setSelectedEl(null);
    const device = getDevice(state.deviceId);
    const ext = format === "jpeg" ? "jpg" : "png";
    try {
      const files = [];
      for (let i = 0; i < state.screens.length; i++) {
        setActiveScreen(i);
        // wait a tick for the canvas to re-render the active screen
        await new Promise((r) => setTimeout(r, 350));
        if (canvasRef.current) {
          const dataUrl = await renderNode(canvasRef.current, device.canvas.w, { format });
          files.push({ name: `${slug(name)}-${i + 1}.${ext}`, data: await dataUrlToBytes(dataUrl) });
        }
      }
      if (files.length) {
        const url = URL.createObjectURL(createZip(files));
        triggerDownload(url, `${slug(name)}.zip`);
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      }
    } finally {
      setExporting(false);
    }
  }

  if (!state) {
    return (
      <div className="grid min-h-screen place-items-center bg-ink-950 text-slate-400">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  const textPos = textPosFor(state.layoutId);
  const canvasState = { ...state, _textPos: textPos };
  const screen = state.screens[activeScreen];
  const showWatermark = user.plan === "free";

  return (
    <div className="flex h-screen flex-col bg-ink-950">
      {/* top bar */}
      <header className="flex items-center justify-between gap-4 border-b border-white/5 px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-3">
          <Link to="/dashboard" className="btn-ghost px-2.5 py-2">
            <ArrowLeft size={16} />
          </Link>
          <Logo to="/dashboard" />
          <span className="text-white/20">/</span>
          <input
            value={name}
            onChange={(e) => updateName(e.target.value)}
            className="min-w-0 rounded-lg bg-transparent px-2 py-1 text-sm font-semibold text-white outline-none hover:bg-white/5 focus:bg-white/5"
          />
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <button
              onClick={undo}
              disabled={!past.current.length}
              title="Undo (Ctrl/Cmd+Z)"
              className="btn-ghost px-2 py-2 disabled:opacity-30"
            >
              <Undo2 size={16} />
            </button>
            <button
              onClick={redo}
              disabled={!future.current.length}
              title="Redo (Ctrl/Cmd+Shift+Z)"
              className="btn-ghost px-2 py-2 disabled:opacity-30"
            >
              <Redo2 size={16} />
            </button>
          </div>
          <SaveBadge state={saveState} />
          <div className="hidden overflow-hidden rounded-lg border border-white/10 sm:flex">
            {["png", "jpeg"].map((f) => (
              <button
                key={f}
                onClick={() => setFormat(f)}
                className={`px-2.5 py-1.5 text-[11px] font-semibold uppercase transition ${
                  format === f ? "bg-white/10 text-white" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {f === "jpeg" ? "JPG" : "PNG"}
              </button>
            ))}
          </div>
          <button onClick={copyCurrent} disabled={exporting} className="btn-ghost hidden md:inline-flex" title="Copy current screen to clipboard">
            {copied ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} />}
            {copied ? "Copied" : "Copy"}
          </button>
          <button onClick={exportAll} disabled={exporting} className="btn-ghost hidden sm:inline-flex" title="Download all screens as a .zip">
            {exporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
            Export .zip
          </button>
          <button onClick={exportOne} disabled={exporting} className="btn-primary">
            {exporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
            Export {format === "jpeg" ? "JPG" : "PNG"}
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* left controls */}
        <aside className="flex w-[330px] shrink-0 flex-col border-r border-white/5 bg-ink-900">
          <div className="scroll-thin flex overflow-x-auto border-b border-white/5">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex min-w-[60px] flex-1 shrink-0 flex-col items-center gap-1 px-1 py-3 text-[11px] font-semibold transition ${
                  tab === t.id ? "bg-white/5 text-brand-300" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <t.icon size={17} />
                {t.label}
              </button>
            ))}
          </div>

          <div className="scroll-thin flex-1 overflow-y-auto p-4">
            {tab === "templates" && <TemplatesPanel update={update} />}
            {tab === "device" && <DevicePanel state={state} update={update} />}
            {tab === "background" && (
              <BackgroundPanel
                state={state}
                update={update}
                screen={screen}
                onScreen={(p) => updateScreen(activeScreen, p)}
              />
            )}
            {tab === "text" && (
              <TextPanel
                state={state}
                update={update}
                screen={screen}
                onScreen={(p) => updateScreen(activeScreen, p)}
              />
            )}
            {tab === "layout" && <LayoutPanel state={state} update={update} />}
            {tab === "elements" && (
              <ElementsPanel
                onAdd={addElement}
                elements={screen.elements || []}
                selectedId={selectedEl}
                onReorder={reorderElement}
                onDelete={deleteElement}
                onChange={changeElement}
                onDuplicate={duplicateSelectedElement}
              />
            )}
          </div>
        </aside>

        {/* center stage */}
        <main className="flex min-w-0 flex-1 flex-col">
          <div className="flex flex-1 overflow-auto bg-[radial-gradient(circle_at_50%_30%,rgba(99,102,241,0.08),transparent_60%)] p-8 pb-16">
            <div className="relative m-auto">
              <div ref={canvasRef} className="relative" onPointerDown={() => setSelectedEl(null)}>
                <ScreenCanvas
                  state={canvasState}
                  screen={screen}
                  width={300}
                  editableElements={!exporting}
                  selectedElement={selectedEl}
                  onSelectElement={selectElement}
                  onChangeElement={changeElement}
                  onDeleteElement={deleteElement}
                />
                {showWatermark && (
                  <div className="pointer-events-none absolute bottom-2 right-2 rounded-md bg-black/40 px-2 py-0.5 text-[9px] font-semibold text-white/80 backdrop-blur">
                    Made with AppShots
                  </div>
                )}
              </div>
              <button
                onClick={() => fileRef.current?.click()}
                className="btn-soft absolute -bottom-12 left-1/2 -translate-x-1/2 whitespace-nowrap"
              >
                <Upload size={15} /> {screen.image ? "Replace screenshot" : "Upload screenshot"}
              </button>
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={onUpload} />
            </div>
          </div>

          {/* screen filmstrip */}
          <div className="border-t border-white/5 bg-ink-900 p-3">
            <div className="scroll-thin flex items-center gap-3 overflow-x-auto">
              {state.screens.map((s, i) => (
                <div key={s.id} className="group relative shrink-0">
                  <button
                    onClick={() => setActiveScreen(i)}
                    className={`overflow-hidden rounded-lg border-2 transition ${
                      i === activeScreen ? "border-brand-500" : "border-transparent hover:border-white/20"
                    }`}
                  >
                    <ScreenCanvas state={canvasState} screen={s} width={56} />
                  </button>
                  <div className="absolute -top-1.5 -right-1.5 flex gap-0.5 opacity-0 transition group-hover:opacity-100">
                    <button
                      onClick={() => duplicateScreen(i)}
                      className="grid h-5 w-5 place-items-center rounded-full bg-ink-800 text-slate-300 hover:text-white"
                      title="Duplicate"
                    >
                      <Copy size={11} />
                    </button>
                    {state.screens.length > 1 && (
                      <button
                        onClick={() => removeScreen(i)}
                        className="grid h-5 w-5 place-items-center rounded-full bg-ink-800 text-slate-300 hover:text-red-400"
                        title="Delete"
                      >
                        <Trash2 size={11} />
                      </button>
                    )}
                  </div>
                  {state.screens.length > 1 && (
                    <>
                      <button
                        onClick={() => moveScreen(i, i - 1)}
                        disabled={i === 0}
                        title="Move left"
                        className="absolute left-0 top-1/2 z-10 grid h-5 w-5 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-ink-800 text-slate-200 opacity-0 shadow transition hover:text-white disabled:opacity-0 group-hover:opacity-100 group-hover:disabled:opacity-20"
                      >
                        <ChevronLeft size={12} />
                      </button>
                      <button
                        onClick={() => moveScreen(i, i + 1)}
                        disabled={i === state.screens.length - 1}
                        title="Move right"
                        className="absolute right-0 top-1/2 z-10 grid h-5 w-5 translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-ink-800 text-slate-200 opacity-0 shadow transition hover:text-white disabled:opacity-0 group-hover:opacity-100 group-hover:disabled:opacity-20"
                      >
                        <ChevronRight size={12} />
                      </button>
                    </>
                  )}
                  <span className="mt-1 block text-center text-[10px] text-slate-500">{i + 1}</span>
                </div>
              ))}
              <button
                onClick={addScreen}
                className="grid h-[100px] w-14 shrink-0 place-items-center rounded-lg border border-dashed border-white/15 text-slate-400 hover:border-brand-500/50 hover:text-brand-300"
                title="Add screen"
              >
                <Plus size={18} />
              </button>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

/* ----------------------------- panels ----------------------------- */

function TemplatesPanel({ update }) {
  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-400">
        Applies style to all screens · keeps your images.
      </p>
      <TemplateGrid
        compact
        thumbWidth={120}
        onSelect={(t) => update((prev) => applyTemplateStyle(prev, t))}
      />
    </div>
  );
}

function DevicePanel({ state, update }) {
  const grouped = {
    ios: DEVICES.filter((d) => d.store === "ios"),
    android: DEVICES.filter((d) => d.store === "android"),
  };
  return (
    <div className="space-y-5">
      {Object.entries(grouped).map(([store, devices]) => (
        <div key={store}>
          <p className="label">{store === "ios" ? "App Store" : "Google Play"}</p>
          <div className="grid grid-cols-2 gap-2">
            {devices.map((d) => (
              <button
                key={d.id}
                onClick={() => update({ deviceId: d.id })}
                className={`rounded-xl border p-3 text-left text-sm transition ${
                  state.deviceId === d.id
                    ? "border-brand-500 bg-brand-500/10 text-white"
                    : "border-white/10 bg-white/[0.02] text-slate-300 hover:border-white/20"
                }`}
              >
                <p className="font-semibold">{d.name}</p>
                <p className="text-[11px] text-slate-500">
                  {d.canvas.w}×{d.canvas.h}
                </p>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function BackgroundPanel({ state, update, screen, onScreen }) {
  const bg = screen.background || state.background;
  const fileRef = useRef(null);
  const [bgCat, setBgCat] = useState("Gradient");
  // "view" lets the AI generator share the panel with the real background types.
  const [view, setView] = useState(null);
  const effView = view || bg.type;
  const suggested = suggestTextColor(bg);
  const lowContrast =
    bg.type !== "image" &&
    state.text.color.toLowerCase() !== suggested.toLowerCase() &&
    worstContrast(state.text.color, bg) < 3;

  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [provider, setProvider] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState("");
  const [picking, setPicking] = useState(null);
  const [caps, setCaps] = useState(null);

  useEffect(() => {
    getCapabilities().then(setCaps);
  }, []);

  async function onUploadBg(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await readFileAsDataURL(file);
    onScreen({ background: { ...bg, type: "image", image: dataUrl } });
    e.target.value = "";
  }

  // Image search — Pexels when configured, else Openverse (see lib/imageSearch).
  async function runSearch(e) {
    e?.preventDefault();
    const term = q.trim();
    if (!term) {
      setQuery("");
      setResults([]);
      setSearchErr("");
      return;
    }
    setQuery(term);
    setSearching(true);
    setSearchErr("");
    setResults([]);
    try {
      const { results: items, provider: prov } = await searchImages(term);
      setResults(items);
      setProvider(prov);
      if (items.length === 0) setSearchErr(`No results for “${term}”. Try another search.`);
    } catch {
      setSearchErr("Search is unavailable right now — please try again.");
    } finally {
      setSearching(false);
    }
  }

  function clearSearch() {
    setQ("");
    setQuery("");
    setResults([]);
    setSearchErr("");
  }

  // Picking a result: fetch the full image cross-origin and store as a data-URL
  // so it persists and exports cleanly.
  async function pickResult(item) {
    setPicking(item.id);
    try {
      const resp = await fetch(item.full, { mode: "cors" });
      const blob = await resp.blob();
      const dataUrl = await readFileAsDataURL(blob);
      onScreen({ background: { ...bg, type: "image", image: dataUrl } });
    } catch {
      onScreen({ background: { ...bg, type: "image", image: item.full } });
    } finally {
      setPicking(null);
    }
  }

  return (
    <div className="space-y-5">
      {lowContrast && (
        <button
          type="button"
          onClick={() => update({ text: { ...state.text, color: suggested } })}
          className="flex w-full items-center gap-2 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-left text-xs text-amber-200 transition hover:bg-amber-400/20"
        >
          <Contrast size={15} className="shrink-0" />
          <span className="flex-1">
            Your headline is hard to read here. Use{" "}
            {suggested === "#ffffff" ? "light" : "dark"} text?
          </span>
          <span className="rounded bg-amber-400/20 px-1.5 py-0.5 font-semibold text-amber-100">
            Apply
          </span>
        </button>
      )}
      <div className="flex gap-2">
        {["gradient", "solid", "image", "ai"].map((t) => {
          const active = t === "ai" ? effView === "ai" : effView === t;
          return (
            <button
              key={t}
              onClick={() => {
                if (t === "ai") setView("ai");
                else {
                  setView(t);
                  onScreen({ background: { ...bg, type: t } });
                }
              }}
              className={`flex-1 rounded-lg py-2 text-sm font-semibold capitalize transition ${
                active ? "bg-brand-600 text-white" : "bg-white/5 text-slate-300"
              }`}
            >
              {t === "ai" ? (
                <span className="flex items-center justify-center gap-1">
                  <Sparkles size={13} /> AI
                </span>
              ) : (
                t
              )}
            </button>
          );
        })}
      </div>

      {effView === "ai" && (
        <AiBackgroundPanel state={state} update={update} bg={bg} onScreen={onScreen} caps={caps} />
      )}

      {effView === "gradient" && (
        <div>
          <p className="label">Gradient</p>
          <div className="grid grid-cols-4 gap-2.5">
            {GRADIENTS.map((g) => (
              <button
                key={g.id}
                onClick={() => onScreen({ background: { ...bg, gradient: g.id, aiGradient: null } })}
                title={g.name}
                className={`h-12 rounded-xl ring-2 transition ${
                  bg.gradient === g.id && !bg.aiGradient ? "ring-white" : "ring-transparent hover:ring-white/30"
                }`}
                style={{ background: `linear-gradient(${g.angle}deg, ${g.from}, ${g.to})` }}
              />
            ))}
          </div>
        </div>
      )}

      {effView === "solid" && (
        <div>
          <p className="label">Color</p>
          <div className="grid grid-cols-5 gap-2.5">
            {SOLIDS.map((c) => (
              <button
                key={c}
                onClick={() => onScreen({ background: { ...bg, solid: c } })}
                className={`h-10 rounded-xl ring-2 transition ${
                  bg.solid === c ? "ring-white" : "ring-white/10 hover:ring-white/30"
                }`}
                style={{ background: c }}
              />
            ))}
          </div>
          <div className="mt-3">
            <p className="label">Custom</p>
            <input
              type="color"
              value={bg.solid}
              onChange={(e) => onScreen({ background: { ...bg, solid: e.target.value } })}
              className="h-10 w-full cursor-pointer rounded-lg bg-transparent"
            />
          </div>
        </div>
      )}

      {effView === "image" && (
        <div className="space-y-4">
          <button onClick={() => fileRef.current?.click()} className="btn-soft w-full justify-center">
            <Upload size={15} /> Upload image
          </button>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={onUploadBg} />

          <form onSubmit={runSearch} className="flex gap-2">
            <div className="relative flex-1">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search the web for any image"
                className="input pl-9"
              />
            </div>
            <button type="submit" disabled={searching} className="btn-soft">
              {searching ? <Loader2 size={15} className="animate-spin" /> : "Search"}
            </button>
          </form>

          {query ? (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="label mb-0">Results for “{query}”</p>
                <button onClick={clearSearch} className="text-xs text-slate-400 transition hover:text-white">
                  Back to gallery
                </button>
              </div>
              {searching ? (
                <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-400">
                  <Loader2 size={16} className="animate-spin" /> Searching…
                </div>
              ) : searchErr ? (
                <p className="py-8 text-center text-sm text-slate-400">{searchErr}</p>
              ) : (
                <div className="grid grid-cols-3 gap-2.5">
                  {results.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => pickResult(r)}
                      disabled={!!picking}
                      title={r.title}
                      className="relative h-16 overflow-hidden rounded-xl bg-ink-800 bg-cover bg-center ring-2 ring-transparent transition hover:ring-white/30 disabled:opacity-60"
                      style={{ backgroundImage: `url("${r.thumb}")` }}
                    >
                      {picking === r.id && (
                        <span className="absolute inset-0 grid place-items-center bg-black/50">
                          <Loader2 size={16} className="animate-spin text-white" />
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
              <p className="mt-2 text-[11px] text-slate-500">
                {provider === "Pexels" ? (
                  <>
                    Photos provided by{" "}
                    <a
                      href="https://www.pexels.com"
                      target="_blank"
                      rel="noreferrer"
                      className="text-brand-300 hover:text-brand-200"
                    >
                      Pexels
                    </a>
                  </>
                ) : (
                  "Free images via Openverse (Creative Commons)."
                )}
              </p>
            </div>
          ) : (
            <div>
              <p className="label">Explore</p>
              <div className="scroll-thin -mx-1 mb-3 flex gap-1.5 overflow-x-auto px-1 pb-1">
                {["All", ...BG_CATEGORIES].map((c) => (
                  <button
                    key={c}
                    onClick={() => setBgCat(c)}
                    className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${
                      bgCat === c ? "bg-brand-600 text-white" : "bg-white/5 text-slate-300 hover:bg-white/10"
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-2.5">
                {BG_PRESETS.filter((p) => bgCat === "All" || p.category === bgCat).map((p) => (
                  <button
                    key={p.id}
                    onClick={() => onScreen({ background: { ...bg, type: "image", image: p.image } })}
                    title={p.name}
                    className={`h-16 rounded-xl bg-cover bg-center ring-2 transition ${
                      bg.image === p.image ? "ring-white" : "ring-transparent hover:ring-white/30"
                    }`}
                    style={{ backgroundImage: `url("${p.image}")` }}
                  />
                ))}
              </div>
            </div>
          )}
          {bg.image && (
            <div className="space-y-3 border-t border-white/10 pt-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Adjust · improves text legibility
              </p>
              <div>
                <p className="label">Blur · {bg.blur || 0}</p>
                <input
                  type="range"
                  min="0"
                  max="10"
                  step="0.5"
                  value={bg.blur || 0}
                  onChange={(e) => onScreen({ background: { ...bg, blur: +e.target.value } })}
                  className="w-full accent-brand-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="label">Overlay</p>
                  <input
                    type="color"
                    value={bg.overlay || "#000000"}
                    onChange={(e) =>
                      onScreen({ background: { ...bg, overlay: e.target.value } })
                    }
                    className="h-9 w-full cursor-pointer rounded-lg bg-transparent"
                  />
                </div>
                <div>
                  <p className="label">Strength · {Math.round((bg.overlayOpacity || 0) * 100)}%</p>
                  <input
                    type="range"
                    min="0"
                    max="0.8"
                    step="0.05"
                    value={bg.overlayOpacity || 0}
                    onChange={(e) =>
                      onScreen({
                        background: { ...bg, overlay: bg.overlay || "#000000", overlayOpacity: +e.target.value },
                      })
                    }
                    className="w-full accent-brand-500"
                  />
                </div>
              </div>
            </div>
          )}

          {bg.image && (
            <button
              onClick={() => onScreen({ background: { ...bg, type: "gradient", image: null } })}
              className="text-xs text-slate-400 transition hover:text-white"
            >
              Remove image
            </button>
          )}
        </div>
      )}
    </div>
  );
}

const REPO_NOTICES = {
  "github-bad-url": "That doesn't look like a GitHub repo URL — generating from your prompt.",
  "github-not-found": "Couldn't find that repo — generating from your prompt.",
  "github-private":
    "That repo is private (or doesn't exist). Add GITHUB_TOKEN to .env.local to read private repos — generating from your prompt for now.",
  "github-bad-token": "Your GitHub token was rejected — generating from your prompt.",
  "github-rate-limit": "GitHub rate limit hit — generating from your prompt.",
  "github-error": "Couldn't read that repo — generating from your prompt.",
};

function AiBackgroundPanel({ state, update, bg, onScreen, caps }) {
  const hasAi = caps?.ai;
  const canImage = !!caps?.image;
  const [url, setUrl] = useState("");
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState(AI_MODELS[0].id);
  const [loading, setLoading] = useState(false);
  const [concepts, setConcepts] = useState([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [genId, setGenId] = useState(null);
  const [imgErr, setImgErr] = useState("");

  const canSuggest = !!hasAi && (url.trim() || prompt.trim()) && !loading;
  const activeCss = bg.aiGradient?.css;

  async function onSuggest() {
    if (!canSuggest) return;
    setLoading(true);
    setError("");
    setNotice("");
    setImgErr("");
    setConcepts([]);
    try {
      const { concepts: out, repoNotice } = await suggestBackgrounds({
        url: url.trim(),
        prompt: prompt.trim(),
        model,
      });
      if (repoNotice) setNotice(REPO_NOTICES[repoNotice] || REPO_NOTICES["github-error"]);
      setConcepts(out);
    } catch (e) {
      setError(
        e.message === "no-llm-key"
          ? "Set ANTHROPIC_API_KEY in .env.local and restart the dev server."
          : "Couldn't reach the AI — please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  function applyGradient(c) {
    onScreen({
      background: {
        ...bg,
        type: "gradient",
        gradient: null,
        image: null,
        aiGradient: {
          css: aiGradientCss(c),
          name: c.name,
          style: c.style,
          angle: c.angle,
          stops: c.stops,
        },
      },
    });
  }

  async function applyImage(c) {
    if (!canImage) return;
    setGenId(c.name);
    setImgErr("");
    try {
      const dataUrl = await generateImage({ concept: c, prompt: prompt.trim() });
      onScreen({ background: { ...bg, type: "image", image: dataUrl } });
    } catch {
      setImgErr("Image generation failed — try again.");
    } finally {
      setGenId(null);
    }
  }

  return (
    <div className="space-y-3">
      {caps && !hasAi && (
        <div className="flex gap-2 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-200">
          <AlertCircle size={15} className="mt-0.5 shrink-0" />
          <span>
            Add <code className="rounded bg-black/30 px-1">ANTHROPIC_API_KEY</code> to{" "}
            <code className="rounded bg-black/30 px-1">.env.local</code> and restart the dev
            server to enable AI suggestions.
          </span>
        </div>
      )}

      <div>
        <p className="label">GitHub repo URL (optional)</p>
        <div className="relative">
          <Github size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="github.com/owner/repo"
            className="input pl-9"
          />
        </div>
        <p className="mt-1 text-[10px] text-slate-500">
          Private repo? Add <code className="text-slate-400">GITHUB_TOKEN</code> to .env.local.
        </p>
      </div>

      <div>
        <p className="label">Prompt (optional)</p>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="e.g. dark, premium, calm — the mood you want"
          rows={2}
          className="input resize-none"
        />
      </div>

      <div className="flex items-center gap-2">
        <select
          value={model}
          onChange={(e) => setModel(e.target.value)}
          className="input w-auto flex-1"
          title="Model"
        >
          {AI_MODELS.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
        <button onClick={onSuggest} disabled={!canSuggest} className="btn-primary shrink-0">
          {loading ? <Loader2 size={15} className="animate-spin" /> : <Wand2 size={15} />}
          {concepts.length ? "Suggest 2 more" : "Suggest"}
        </button>
      </div>

      {notice && <p className="text-[11px] text-amber-300/90">{notice}</p>}
      {error && <p className="text-xs text-red-400">{error}</p>}
      {imgErr && <p className="text-xs text-red-400">{imgErr}</p>}

      {loading && (
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-400">
          <Loader2 size={16} className="animate-spin" /> Designing 2 on-brand backgrounds…
        </div>
      )}

      {!loading &&
        concepts.map((c) => {
          const css = aiGradientCss(c);
          const isActive = activeCss === css;
          return (
            <div
              key={c.name}
              className={`rounded-xl border p-3 transition ${
                isActive ? "border-brand-500 bg-brand-500/5" : "border-white/10 bg-white/[0.02]"
              }`}
            >
              <div className="flex gap-3">
                <div
                  className="h-16 w-12 shrink-0 rounded-lg ring-1 ring-white/10"
                  style={{ background: css }}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-white">{c.name}</p>
                  <p className="mt-0.5 line-clamp-2 text-[11px] text-slate-400">{c.rationale}</p>
                </div>
              </div>
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                <button onClick={() => applyGradient(c)} className="btn-soft px-2.5 py-1 text-xs">
                  {isActive ? <Check size={13} /> : null} Use as background
                </button>
                <button
                  onClick={() => applyImage(c)}
                  disabled={!canImage || !!genId}
                  title={canImage ? "Generate a real image" : "Add an image-gen API key to enable"}
                  className="btn-ghost px-2.5 py-1 text-xs disabled:opacity-40"
                >
                  {genId === c.name ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <ImageIcon size={13} />
                  )}
                  Generate image
                </button>
                <button
                  onClick={() => update({ text: { ...state.text, color: c.suggestedTextColor } })}
                  title="Apply suggested text color"
                  className="ml-auto flex items-center gap-1 rounded-md border border-white/10 px-1.5 py-1 text-[11px] text-slate-300 hover:border-white/30"
                >
                  <span
                    className="h-3 w-3 rounded-full ring-1 ring-white/30"
                    style={{ background: c.suggestedTextColor }}
                  />
                  Text
                </button>
              </div>
            </div>
          );
        })}

      {concepts.length > 0 && !canImage && (
        <p className="text-[11px] text-slate-500">
          “Generate image” needs an image-gen key (OPENAI_API_KEY or
          STABILITY_API_KEY) in .env.local. Gradients work with just the Anthropic key.
        </p>
      )}
    </div>
  );
}

function TextPanel({ state, update, screen, onScreen }) {
  const t = state.text;
  // Effective subheading style (independent size/color/weight), with fallback
  // for projects created before subtext existed.
  const sub = state.subtext || {
    color: t.color,
    size: Math.round(t.size * 0.45),
    weight: 500,
  };
  const setSub = (patch) => update({ subtext: { ...sub, ...patch } });
  return (
    <div className="space-y-5">
      <div>
        <p className="label">Headline</p>
        <input
          className="input"
          value={screen.heading}
          placeholder="Your headline"
          onChange={(e) => onScreen({ heading: e.target.value })}
        />
      </div>
      <div>
        <p className="label">Subheading</p>
        <input
          className="input"
          value={screen.subheading || ""}
          placeholder="Optional supporting line"
          onChange={(e) => onScreen({ subheading: e.target.value })}
        />
      </div>
      <div>
        <p className="label">Font</p>
        <div className="grid grid-cols-2 gap-2">
          {FONTS.map((f) => (
            <button
              key={f.id}
              onClick={() => update({ text: { ...t, font: f.id } })}
              style={{ fontFamily: f.stack }}
              className={`rounded-lg border py-2 text-sm transition ${
                t.font === f.id ? "border-brand-500 bg-brand-500/10 text-white" : "border-white/10 text-slate-300"
              }`}
            >
              {f.name}
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="label">Size · {t.size}px</p>
        <input
          type="range"
          min="36"
          max="110"
          value={t.size}
          onChange={(e) => update({ text: { ...t, size: +e.target.value } })}
          className="w-full accent-brand-500"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="label">Weight</p>
          <select
            className="input"
            value={t.weight}
            onChange={(e) => update({ text: { ...t, weight: +e.target.value } })}
          >
            {[400, 500, 600, 700, 800, 900].map((w) => (
              <option key={w} value={w}>{w}</option>
            ))}
          </select>
        </div>
        <div>
          <p className="label">Align</p>
          <select
            className="input"
            value={t.align}
            onChange={(e) => update({ text: { ...t, align: e.target.value } })}
          >
            {["left", "center", "right"].map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <p className="label">Color</p>
        <input
          type="color"
          value={t.color}
          onChange={(e) => update({ text: { ...t, color: e.target.value } })}
          className="h-10 w-full cursor-pointer rounded-lg bg-transparent"
        />
      </div>

      <div className="space-y-4 border-t border-white/10 pt-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Subheading style
        </p>
        <div>
          <p className="label">Size · {sub.size}px</p>
          <input
            type="range"
            min="18"
            max="90"
            value={sub.size}
            onChange={(e) => setSub({ size: +e.target.value })}
            className="w-full accent-brand-500"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="label">Weight</p>
            <select
              className="input"
              value={sub.weight}
              onChange={(e) => setSub({ weight: +e.target.value })}
            >
              {[300, 400, 500, 600, 700, 800].map((w) => (
                <option key={w} value={w}>{w}</option>
              ))}
            </select>
          </div>
          <div>
            <p className="label">Color</p>
            <input
              type="color"
              value={sub.color}
              onChange={(e) => setSub({ color: e.target.value })}
              className="h-10 w-full cursor-pointer rounded-lg bg-transparent"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function LayoutPanel({ state, update }) {
  return (
    <div className="space-y-5">
      <div>
        <p className="label">Layout</p>
        <div className="grid grid-cols-2 gap-2">
          {LAYOUTS.map((l) => (
            <button
              key={l.id}
              onClick={() => update({ layoutId: l.id, deviceScale: l.deviceScale })}
              className={`rounded-xl border p-3 text-sm transition ${
                state.layoutId === l.id
                  ? "border-brand-500 bg-brand-500/10 text-white"
                  : "border-white/10 text-slate-300 hover:border-white/20"
              }`}
            >
              {l.name}
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="label">Device size · {Math.round(state.deviceScale * 100)}%</p>
        <input
          type="range"
          min="0.5"
          max="1"
          step="0.01"
          value={state.deviceScale}
          onChange={(e) => update({ deviceScale: +e.target.value })}
          className="w-full accent-brand-500"
        />
      </div>
    </div>
  );
}

function LayerBtn({ label, onClick, disabled, children }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      className="grid place-items-center rounded-lg border border-white/10 bg-white/[0.03] py-2 text-slate-200 transition hover:border-white/25 disabled:opacity-30"
    >
      {children}
    </button>
  );
}

function ElementsPanel({ onAdd, elements = [], selectedId = null, onReorder, onDelete, onChange, onDuplicate }) {
  const CATS = ["Badges", "Shapes", "Arrows", "Emoji", "Icons", "Photos"];
  const [cat, setCat] = useState("Badges");

  const selIndex = elements.findIndex((e) => e.id === selectedId);
  const selected = selIndex >= 0 ? elements[selIndex] : null;
  const isBottom = selIndex <= 0;
  const isTop = selIndex === elements.length - 1;
  const [emojiQ, setEmojiQ] = useState("");

  // photo browser state
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [picking, setPicking] = useState(null);
  const [photoErr, setPhotoErr] = useState("");
  const [provider, setProvider] = useState("");

  async function runSearch(term) {
    const t = (term || "").trim();
    if (!t) return;
    setQ(t);
    setSearching(true);
    setPhotoErr("");
    setResults([]);
    try {
      const { results: items, provider: prov } = await searchImages(t);
      setResults(items);
      setProvider(prov);
      if (!items.length) setPhotoErr(`No results for “${t}”.`);
    } catch {
      setPhotoErr("Search is unavailable right now.");
    } finally {
      setSearching(false);
    }
  }

  async function pickPhoto(item) {
    setPicking(item.id);
    try {
      const resp = await fetch(item.full, { mode: "cors" });
      const blob = await resp.blob();
      const dataUrl = await readFileAsDataURL(blob);
      onAdd(makeImageElement(dataUrl));
    } catch {
      onAdd(makeImageElement(item.full));
    } finally {
      setPicking(null);
    }
  }

  const filteredEmoji = emojiQ.trim()
    ? EMOJI.filter((x) => x.k.includes(emojiQ.trim().toLowerCase()))
    : EMOJI;

  const elLabel = (el) =>
    el.kind === "badge"
      ? el.text
      : el.kind === "emoji"
      ? el.emoji
      : el.kind === "icon"
      ? el.icon
      : el.kind === "image"
      ? "Photo"
      : el.variant || el.kind;

  return (
    <div className="space-y-4">
      {selected && (
        <div className="rounded-xl border border-brand-500/40 bg-brand-500/5 p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="truncate text-xs font-semibold text-white">
              Selected: <span className="text-brand-200">{elLabel(selected)}</span>
            </p>
            <span className="text-[10px] text-slate-500">
              layer {selIndex + 1}/{elements.length}
            </span>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            <LayerBtn label="To back" onClick={() => onReorder(selected.id, "back")} disabled={isBottom}>
              <SendToBack size={15} />
            </LayerBtn>
            <LayerBtn label="Backward" onClick={() => onReorder(selected.id, "backward")} disabled={isBottom}>
              <ArrowDown size={15} />
            </LayerBtn>
            <LayerBtn label="Forward" onClick={() => onReorder(selected.id, "forward")} disabled={isTop}>
              <ArrowUp size={15} />
            </LayerBtn>
            <LayerBtn label="To front" onClick={() => onReorder(selected.id, "front")} disabled={isTop}>
              <BringToFront size={15} />
            </LayerBtn>
          </div>

          {/* properties */}
          <div className="mt-3 space-y-2.5">
            <div>
              <p className="label mb-1">Opacity · {Math.round((selected.opacity ?? 1) * 100)}%</p>
              <input
                type="range"
                min="0.1"
                max="1"
                step="0.05"
                value={selected.opacity ?? 1}
                onChange={(e) => onChange(selected.id, { opacity: +e.target.value })}
                className="w-full accent-brand-500"
              />
            </div>

            {(selected.kind === "shape" || selected.kind === "arrow" || selected.kind === "icon") && (
              <div>
                <p className="label mb-1">Color</p>
                <input
                  type="color"
                  value={selected.color || "#111827"}
                  onChange={(e) => onChange(selected.id, { color: e.target.value })}
                  className="h-8 w-full cursor-pointer rounded-lg bg-transparent"
                />
              </div>
            )}

            {selected.kind === "badge" && selected.text != null && (
              <div>
                <p className="label mb-1">Text</p>
                <input
                  value={selected.text}
                  onChange={(e) => onChange(selected.id, { text: e.target.value })}
                  className="input"
                />
              </div>
            )}
          </div>

          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              onClick={() => onDuplicate(selected.id)}
              className="flex items-center justify-center gap-1.5 rounded-lg border border-white/10 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-white/5"
            >
              <Copy size={13} /> Duplicate
            </button>
            <button
              onClick={() => onDelete(selected.id)}
              className="flex items-center justify-center gap-1.5 rounded-lg border border-red-500/30 py-1.5 text-xs font-semibold text-red-300 transition hover:bg-red-500/10"
            >
              <Trash2 size={13} /> Delete
            </button>
          </div>
          <p className="mt-2 text-[10px] text-slate-500">
            Tip: arrow keys nudge · ⌫ delete · ⌘/Ctrl+D duplicate · [ ] layer · Esc deselect
          </p>
        </div>
      )}

      <p className="text-xs text-slate-400">
        Click to add to the active screen, then drag · resize · rotate on the canvas.
      </p>

      <div className="scroll-thin -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {CATS.map((c) => (
          <button
            key={c}
            onClick={() => setCat(c)}
            className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${
              cat === c ? "bg-brand-600 text-white" : "bg-white/5 text-slate-300 hover:bg-white/10"
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      {cat === "Badges" && (
        <div className="grid grid-cols-2 gap-2">
          {BADGES.map((b) => (
            <button
              key={b.id}
              onClick={() => onAdd(makeElement(b))}
              className="flex items-center justify-center rounded-lg border border-white/10 bg-white/[0.02] p-2 transition hover:border-white/25"
            >
              <span
                className="flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-1 text-[10px] font-bold"
                style={{ background: b.bg, color: b.fg }}
              >
                {b.badge === "rating" && <span style={{ color: b.color }}>{"★".repeat(b.stars || 5)}</span>}
                {b.emoji && <span>{b.emoji}</span>}
                {b.text}
              </span>
            </button>
          ))}
        </div>
      )}

      {(cat === "Shapes" || cat === "Arrows") && (
        <div className="grid grid-cols-4 gap-2">
          {(cat === "Shapes" ? SHAPES : ARROWS).map((s) => (
            <button
              key={s.id}
              onClick={() => onAdd(makeElement(s))}
              title={s.label}
              className="grid h-14 place-items-center rounded-lg border border-white/10 bg-white/[0.02] p-2 transition hover:border-white/25"
            >
              {s.kind === "badge" ? (
                <span className="rounded bg-ink-900 px-1.5 py-1 text-[8px] font-bold text-white">
                  {s.text}
                </span>
              ) : (
                <img src={elementSvg(makeElement(s))} alt={s.label} className="max-h-9 max-w-9" />
              )}
            </button>
          ))}
        </div>
      )}

      {cat === "Emoji" && (
        <div className="space-y-2">
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              value={emojiQ}
              onChange={(e) => setEmojiQ(e.target.value)}
              placeholder="Search emoji"
              className="input pl-9"
            />
          </div>
          <div className="grid grid-cols-6 gap-1.5">
            {filteredEmoji.map((x) => (
              <button
                key={x.e}
                onClick={() => onAdd(makeEmojiElement(x.e))}
                title={x.k}
                className="grid h-10 place-items-center rounded-lg text-xl transition hover:bg-white/10"
              >
                {x.e}
              </button>
            ))}
          </div>
        </div>
      )}

      {cat === "Icons" && (
        <div className="grid grid-cols-6 gap-1.5">
          {ICONS.map((name, i) => {
            const Icon = elementIcon(name);
            return (
              <button
                key={name + i}
                onClick={() => onAdd(makeIconElement(name))}
                title={name}
                className="grid h-10 place-items-center rounded-lg text-slate-200 transition hover:bg-white/10"
              >
                <Icon size={20} />
              </button>
            );
          })}
        </div>
      )}

      {cat === "Photos" && (
        <div className="space-y-3">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              runSearch(q);
            }}
            className="flex gap-2"
          >
            <div className="relative flex-1">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search people, food, travel…"
                className="input pl-9"
              />
            </div>
            <button type="submit" disabled={searching} className="btn-soft">
              {searching ? <Loader2 size={15} className="animate-spin" /> : "Search"}
            </button>
          </form>

          <div className="scroll-thin -mx-1 flex flex-wrap gap-1.5 px-1">
            {PHOTO_CATEGORIES.map((p) => (
              <button
                key={p.id}
                onClick={() => runSearch(p.q)}
                className="shrink-0 rounded-full bg-white/5 px-2 py-1 text-[10px] font-medium text-slate-300 transition hover:bg-white/10"
              >
                {p.label}
              </button>
            ))}
          </div>

          {searching ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-400">
              <Loader2 size={16} className="animate-spin" /> Searching…
            </div>
          ) : photoErr ? (
            <p className="py-6 text-center text-sm text-slate-400">{photoErr}</p>
          ) : results.length ? (
            <>
              <div className="grid grid-cols-3 gap-2">
                {results.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => pickPhoto(r)}
                    disabled={!!picking}
                    title={r.title}
                    className="relative h-16 overflow-hidden rounded-lg bg-ink-800 bg-cover bg-center ring-2 ring-transparent transition hover:ring-white/30 disabled:opacity-60"
                    style={{ backgroundImage: `url("${r.thumb}")` }}
                  >
                    {picking === r.id && (
                      <span className="absolute inset-0 grid place-items-center bg-black/50">
                        <Loader2 size={16} className="animate-spin text-white" />
                      </span>
                    )}
                  </button>
                ))}
              </div>
              {provider && (
                <p className="text-[11px] text-slate-500">
                  {provider === "Pexels" ? "Photos via Pexels." : "Images via Openverse (CC)."}
                </p>
              )}
            </>
          ) : (
            <p className="py-6 text-center text-xs text-slate-500">
              Pick a category or search to add a photo element.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function SaveBadge({ state }) {
  const map = {
    saved: { icon: Check, text: "Saved", cls: "text-emerald-400" },
    saving: { icon: Loader2, text: "Saving…", cls: "text-slate-400" },
    dirty: { icon: Loader2, text: "Unsaved", cls: "text-amber-400" },
  };
  const { icon: Icon, text, cls } = map[state] || map.saved;
  return (
    <span className={`hidden items-center gap-1.5 text-xs font-medium sm:inline-flex ${cls}`}>
      <Icon size={13} className={state === "saving" ? "animate-spin" : ""} />
      {text}
    </span>
  );
}

function slug(s) {
  return (s || "appshots").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "screen";
}
