import { useEffect, useRef } from "react";
import {
  rotationRad, materialPreset, deviceBox, cameraDistance, dragToRot, clampRot,
  pickScreenMaterial, fitScale,
} from "../lib/live3d";

/**
 * Real-time WebGL device (the "Real 3D" mode). Two ways to get a device:
 *
 *  1. A real `.glb`/`.gltf` model the user loads (the industry-standard look) —
 *     a properly modeled phone with its own buttons, camera and rails. We center
 *     and auto-fit it, find its screen surface (by name, overridable), and map
 *     the screenshot onto that material.
 *  2. A procedurally-generated rounded metal slab fallback when no model is set.
 *
 * Either way it's lit by an environment map for true reflections, drag-rotates,
 * and renders to a canvas with `preserveDrawingBuffer` so html-to-image captures
 * it on export. three (and its loaders) are imported dynamically, so the heavy
 * WebGL bundle only loads when this mode is actually used.
 */
export function Live3DDevice({
  live3d, image, aspect = 2, width, height, editable = false, onChange, onModelInfo,
}) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const ctx = useRef(null);
  const rot = useRef({ rotX: live3d?.rotX || 0, rotY: live3d?.rotY || 0 });
  const modelSrc = useRef(null); // src currently loaded into the scene

  // --- one-time scene setup (dynamic three import) ---
  useEffect(() => {
    let cancelled = false;
    const canvas = canvasRef.current;
    if (!canvas) return;

    (async () => {
      let THREE, RoundedBoxGeometry, RoomEnvironment, GLTFLoader;
      try {
        THREE = await import("three");
        ({ RoundedBoxGeometry } = await import("three/examples/jsm/geometries/RoundedBoxGeometry.js"));
        ({ RoomEnvironment } = await import("three/examples/jsm/environments/RoomEnvironment.js"));
        ({ GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js"));
      } catch {
        return;
      }
      if (cancelled) return;

      let renderer;
      try {
        renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
      } catch {
        return;
      }
      renderer.setClearColor(0x000000, 0);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.05;

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 100);

      const pmrem = new THREE.PMREMGenerator(renderer);
      const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      scene.environment = env;

      const key = new THREE.DirectionalLight(0xffffff, 2.2);
      key.position.set(2, 3, 4);
      scene.add(key);
      const rim = new THREE.DirectionalLight(0xbcd0ff, 1.1);
      rim.position.set(-3, 1, -2);
      scene.add(rim);

      const group = new THREE.Group();
      scene.add(group);

      ctx.current = {
        THREE, RoundedBoxGeometry, GLTFLoader, renderer, scene, camera, group,
        pmrem, env, body: null, screen: null, screenTex: null,
        modelHolder: null, screenTargets: [], disposed: false, loadToken: 0,
      };
      resize();
      rebuild();
    })();

    return () => {
      cancelled = true;
      const c = ctx.current;
      if (!c || c.disposed) return;
      c.disposed = true;
      try {
        disposeProcedural(c);
        disposeModel(c);
        c.screenTex?.dispose();
        c.env?.dispose();
        c.pmrem?.dispose();
        c.renderer?.dispose();
      } catch { /* best-effort */ }
      ctx.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function disposeProcedural(c) {
    if (c.body) { c.group.remove(c.body); c.body.geometry.dispose(); c.body.material.dispose(); c.body = null; }
    if (c.screen) { c.group.remove(c.screen); c.screen.geometry.dispose(); c.screen.material.dispose(); c.screen = null; }
  }
  function disposeModel(c) {
    if (!c.modelHolder) return;
    c.group.remove(c.modelHolder);
    c.modelHolder.traverse((o) => {
      if (o.isMesh) {
        o.geometry?.dispose();
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m) => m?.dispose());
      }
    });
    c.modelHolder = null;
    c.screenTargets = [];
  }

  // decide procedural vs model
  function rebuild() {
    const c = ctx.current;
    if (!c) return;
    const src = live3d?.model?.src || null;
    if (src) {
      if (src !== modelSrc.current) loadModel(src);
      else applyState();
    } else {
      modelSrc.current = null;
      disposeModel(c);
      buildProcedural();
      applyState();
    }
  }

  /* ---------- procedural slab ---------- */
  function buildProcedural() {
    const c = ctx.current;
    if (!c) return;
    const { THREE, RoundedBoxGeometry, group } = c;
    disposeProcedural(c);

    const box = deviceBox(aspect);
    const preset = materialPreset(live3d?.material);
    const body = new THREE.Mesh(
      new RoundedBoxGeometry(box.width, box.height, box.depth, 6, box.radius),
      new THREE.MeshStandardMaterial({ color: new THREE.Color(preset.color), metalness: preset.metalness, roughness: preset.roughness, envMapIntensity: 1.1 })
    );
    group.add(body);

    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(box.width - box.bezel * 2, box.height - box.bezel * 2),
      new THREE.MeshBasicMaterial({ color: 0x05070d })
    );
    screen.position.z = box.depth / 2 + 0.001;
    group.add(screen);

    c.body = body;
    c.screen = screen;
    loadProceduralTexture();
  }

  function loadProceduralTexture() {
    const c = ctx.current;
    if (!c || !c.screen) return;
    const { THREE, screen } = c;
    if (!image) {
      screen.material.map = null;
      screen.material.color = new THREE.Color(0x05070d);
      screen.material.needsUpdate = true;
      render();
      return;
    }
    new THREE.TextureLoader().load(image, (tex) => {
      const cur = ctx.current;
      if (!cur || cur.disposed || cur.screen !== screen) { tex.dispose(); return; }
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = cur.renderer.capabilities.getMaxAnisotropy?.() || 1;
      cur.screenTex?.dispose();
      cur.screenTex = tex;
      screen.material.map = tex;
      screen.material.color = new THREE.Color(0xffffff);
      screen.material.needsUpdate = true;
      render();
    });
  }

  /* ---------- real .glb model ---------- */
  async function loadModel(src) {
    const c = ctx.current;
    if (!c) return;
    const token = ++c.loadToken;
    modelSrc.current = src;
    disposeProcedural(c);

    let buf;
    try {
      buf = await (await fetch(src)).arrayBuffer();
    } catch {
      onModelInfo?.({ error: "Couldn't read the model file." });
      return;
    }
    const cur = ctx.current;
    if (!cur || cur.disposed || token !== cur.loadToken) return;

    const loader = new cur.GLTFLoader();
    loader.parse(
      buf, "",
      (gltf) => {
        const c2 = ctx.current;
        if (!c2 || c2.disposed || token !== c2.loadToken) return;
        disposeModel(c2);
        mountModel(c2, gltf.scene);
      },
      () => onModelInfo?.({ error: "Couldn't parse this model (Draco-compressed .glb isn't supported — re-export uncompressed)." })
    );
  }

  function mountModel(c, root) {
    const { THREE, group } = c;

    // collect named screen-candidate materials before any transform
    const targets = [];
    const seen = new Set();
    root.traverse((o) => {
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach((m) => {
        if (!m) return;
        const name = m.name || o.name || "material";
        if (seen.has(name)) return;
        seen.add(name);
        targets.push({ name, material: m });
        m.envMapIntensity = 1.1;
      });
    });

    // center + uniform-fit
    const holder = new THREE.Group();
    holder.add(root);
    const box = new THREE.Box3().setFromObject(root);
    const size = new THREE.Vector3(); box.getSize(size);
    const center = new THREE.Vector3(); box.getCenter(center);
    root.position.sub(center);
    holder.scale.setScalar(fitScale(Math.max(size.x, size.y, size.z)));
    group.add(holder);

    c.modelHolder = holder;
    c.screenTargets = targets;

    onModelInfo?.({ names: targets.map((t) => t.name), error: null });
    applyModelScreenshot();
    applyState();
  }

  function applyModelScreenshot() {
    const c = ctx.current;
    if (!c || !c.modelHolder) return;
    const { THREE, screenTargets } = c;
    const key = live3d?.model?.screenKey || pickScreenMaterial(screenTargets.map((t) => t.name));
    const target = screenTargets.find((t) => t.name === key);
    if (!target || !image) { render(); return; }

    new THREE.TextureLoader().load(image, (tex) => {
      const cur = ctx.current;
      if (!cur || cur.disposed || !cur.modelHolder) { tex.dispose(); return; }
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.flipY = !!live3d?.model?.flip;
      tex.center.set(0.5, 0.5);
      tex.rotation = ((live3d?.model?.rotate || 0) * Math.PI) / 180;
      tex.anisotropy = cur.renderer.capabilities.getMaxAnisotropy?.() || 1;
      cur.screenTex?.dispose();
      cur.screenTex = tex;
      const m = target.material;
      m.map = tex;
      m.emissiveMap = tex;
      if (m.emissive) m.emissive = new THREE.Color(0xffffff);
      m.emissiveIntensity = 1;
      m.metalness = 0;
      m.roughness = 0.35;
      if ("color" in m) m.color = new THREE.Color(0xffffff);
      m.needsUpdate = true;
      render();
    });
  }

  /* ---------- shared: camera/rotation/render/resize ---------- */
  function applyState() {
    const c = ctx.current;
    if (!c) return;
    const r = rotationRad({ rotX: rot.current.rotX, rotY: rot.current.rotY });
    c.group.rotation.x = r.x;
    c.group.rotation.y = r.y;
    c.camera.position.set(0, 0, cameraDistance(live3d?.zoom));
    c.camera.lookAt(0, 0, 0);
    render();
  }

  function render() {
    const c = ctx.current;
    if (!c || c.disposed) return;
    c.renderer.render(c.scene, c.camera);
  }

  function resize() {
    const c = ctx.current;
    const wrap = wrapRef.current;
    if (!c || !wrap) return;
    const w = wrap.clientWidth || width || 300;
    const h = wrap.clientHeight || height || 600;
    const dpr = Math.min(3.5, Math.max(2, typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1));
    c.renderer.setPixelRatio(dpr);
    c.renderer.setSize(w, h, false);
    c.camera.aspect = w / h;
    c.camera.updateProjectionMatrix();
    render();
  }

  // model src / procedural geometry-affecting props
  useEffect(() => {
    if (!ctx.current) return;
    rot.current = { rotX: live3d?.rotX || 0, rotY: live3d?.rotY || 0 };
    rebuild();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aspect, live3d?.material, live3d?.model?.src]);

  // screen-mapping props (model only)
  useEffect(() => {
    if (!ctx.current || !live3d?.model?.src) return;
    applyModelScreenshot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live3d?.model?.screenKey, live3d?.model?.flip, live3d?.model?.rotate]);

  // rotation / zoom
  useEffect(() => {
    if (!ctx.current) return;
    rot.current = { rotX: live3d?.rotX || 0, rotY: live3d?.rotY || 0 };
    applyState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live3d?.rotX, live3d?.rotY, live3d?.zoom]);

  // screenshot
  useEffect(() => {
    if (!ctx.current) return;
    if (live3d?.model?.src) applyModelScreenshot();
    else loadProceduralTexture();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [image]);

  useEffect(() => {
    const onWin = () => resize();
    window.addEventListener("resize", onWin);
    return () => window.removeEventListener("resize", onWin);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- drag to rotate ---
  const drag = useRef(null);
  function onPointerDown(e) {
    if (!editable) return;
    e.stopPropagation();
    drag.current = { x: e.clientX, y: e.clientY, rotX: rot.current.rotX, rotY: rot.current.rotY };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }
  function onPointerMove(e) {
    const d = drag.current;
    if (!d) return;
    const { dRotX, dRotY } = dragToRot(e.clientX - d.x, e.clientY - d.y);
    rot.current = clampRot(d.rotX + dRotX, d.rotY + dRotY);
    applyState();
  }
  function onPointerUp() {
    if (!drag.current) return;
    drag.current = null;
    onChange?.({ rotX: rot.current.rotX, rotY: rot.current.rotY });
  }

  return (
    <div
      ref={wrapRef}
      className="absolute inset-0 z-10"
      style={{ touchAction: "none", cursor: editable ? "grab" : "default" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <canvas ref={canvasRef} className="h-full w-full" />
    </div>
  );
}

export default Live3DDevice;
