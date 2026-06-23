import { useEffect, useRef } from "react";
import {
  rotationRad, materialPreset, deviceBox, cameraDistance, dragToRot, clampRot,
} from "../lib/live3d";

/**
 * Real-time WebGL device (the "Real 3D" mode). A procedurally-generated rounded
 * metal body with the screenshot textured on the screen plane, lit by an
 * environment map for true reflections, and draggable to rotate. Rendered to a
 * canvas with `preserveDrawingBuffer` so html-to-image captures it on export.
 *
 * Three.js (and the two example modules) are imported dynamically so the heavy
 * WebGL bundle only loads when a user actually turns this mode on — the main app
 * bundle is untouched. The geometry is generic/procedural (no copyrighted device
 * renders), so it is safe to ship.
 */
export function Live3DDevice({ live3d, image, aspect = 2, width, height, editable = false, onChange }) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const ctx = useRef(null); // { THREE, renderer, scene, camera, group, body, screen, pmrem, env, disposed }
  const rot = useRef({ rotX: live3d?.rotX || 0, rotY: live3d?.rotY || 0 });

  // --- one-time scene setup (dynamic three import) ---
  useEffect(() => {
    let cancelled = false;
    const canvas = canvasRef.current;
    if (!canvas) return;

    (async () => {
      let THREE, RoundedBoxGeometry, RoomEnvironment;
      try {
        THREE = await import("three");
        ({ RoundedBoxGeometry } = await import("three/examples/jsm/geometries/RoundedBoxGeometry.js"));
        ({ RoomEnvironment } = await import("three/examples/jsm/environments/RoomEnvironment.js"));
      } catch {
        return; // three failed to load — wrapper stays empty, CSS device still available
      }
      if (cancelled) return;

      let renderer;
      try {
        renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
      } catch {
        return; // no WebGL context (e.g. headless) — fail gracefully
      }
      renderer.setClearColor(0x000000, 0); // transparent: the screen background shows through
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.05;

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 100);

      // environment map for metal reflections (procedural studio room)
      const pmrem = new THREE.PMREMGenerator(renderer);
      const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      scene.environment = env;

      // a couple of lights for crisp highlights on top of the env
      const key = new THREE.DirectionalLight(0xffffff, 2.2);
      key.position.set(2, 3, 4);
      scene.add(key);
      const rim = new THREE.DirectionalLight(0xbcd0ff, 1.1);
      rim.position.set(-3, 1, -2);
      scene.add(rim);

      const group = new THREE.Group();
      scene.add(group);

      ctx.current = { THREE, RoundedBoxGeometry, renderer, scene, camera, group, pmrem, env, body: null, screen: null, screenTex: null, disposed: false };
      buildDevice();
      resize();
      applyState();
    })();

    return () => {
      cancelled = true;
      const c = ctx.current;
      if (!c || c.disposed) return;
      c.disposed = true;
      try {
        c.body?.geometry?.dispose();
        c.body?.material?.dispose();
        c.screen?.geometry?.dispose();
        c.screen?.material?.dispose();
        c.screenTex?.dispose();
        c.env?.dispose();
        c.pmrem?.dispose();
        c.renderer?.dispose();
      } catch {
        /* best-effort cleanup */
      }
      ctx.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // (re)build geometry when the aspect or material changes
  function buildDevice() {
    const c = ctx.current;
    if (!c) return;
    const { THREE, RoundedBoxGeometry, group } = c;
    if (c.body) { group.remove(c.body); c.body.geometry.dispose(); c.body.material.dispose(); }
    if (c.screen) { group.remove(c.screen); c.screen.geometry.dispose(); c.screen.material.dispose(); }

    const box = deviceBox(aspect);
    const preset = materialPreset(live3d?.material);
    const bodyGeo = new RoundedBoxGeometry(box.width, box.height, box.depth, 6, box.radius);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(preset.color),
      metalness: preset.metalness,
      roughness: preset.roughness,
      envMapIntensity: 1.1,
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    group.add(body);

    const sw = box.width - box.bezel * 2;
    const sh = box.height - box.bezel * 2;
    const screenGeo = new THREE.PlaneGeometry(sw, sh);
    const screenMat = new THREE.MeshBasicMaterial({ color: 0x05070d });
    const screen = new THREE.Mesh(screenGeo, screenMat);
    screen.position.z = box.depth / 2 + 0.001; // just proud of the front face
    group.add(screen);

    c.body = body;
    c.screen = screen;
    loadTexture();
  }

  function loadTexture() {
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

  // push rotation/zoom/camera into the scene and render one frame
  function applyState() {
    const c = ctx.current;
    if (!c) return;
    const { group, camera } = c;
    const r = rotationRad({ rotX: rot.current.rotX, rotY: rot.current.rotY });
    group.rotation.x = r.x;
    group.rotation.y = r.y;
    camera.position.set(0, 0, cameraDistance(live3d?.zoom));
    camera.lookAt(0, 0, 0);
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
    // Render the backing buffer at extra resolution so html-to-image's upscale to
    // the true store size stays crisp; cap for performance.
    const dpr = Math.min(3.5, Math.max(2, typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1));
    c.renderer.setPixelRatio(dpr);
    c.renderer.setSize(w, h, false);
    c.camera.aspect = w / h;
    c.camera.updateProjectionMatrix();
    render();
  }

  // react to prop changes (rotation sliders, material, zoom, image, aspect)
  useEffect(() => {
    const c = ctx.current;
    if (!c) return;
    rot.current = { rotX: live3d?.rotX || 0, rotY: live3d?.rotY || 0 };
    buildDevice();
    applyState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aspect, live3d?.material]);

  useEffect(() => {
    const c = ctx.current;
    if (!c) return;
    rot.current = { rotX: live3d?.rotX || 0, rotY: live3d?.rotY || 0 };
    applyState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live3d?.rotX, live3d?.rotY, live3d?.zoom]);

  useEffect(() => {
    loadTexture();
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
    const next = clampRot(d.rotX + dRotX, d.rotY + dRotY);
    rot.current = next;
    applyState();
  }
  function onPointerUp() {
    const d = drag.current;
    if (!d) return;
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
