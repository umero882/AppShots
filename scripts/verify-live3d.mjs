// Headless verification of the live-3D GLB pipeline (no WebGL/DOM): parse a
// minimal glTF with named "Body"/"Screen" materials through GLTFLoader, then run
// the model-specific logic — material discovery, screen pick, center/fit.
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { pickScreenMaterial, fitScale } from "../src/lib/live3d.js";

// minimal DOM-event polyfill so THREE.FileLoader's data-URI path runs in Node
globalThis.ProgressEvent = globalThis.ProgressEvent || class { constructor(type, init = {}) { this.type = type; Object.assign(this, init); } };

const ok = (c, m) => console.log(`${c ? "✓" : "✗ FAIL"}  ${m}`);
let failures = 0;
const must = (c, m) => { ok(c, m); if (!c) failures++; };

// two triangles: a body (y -1..1) and a screen quad-ish in front (z=0.051)
const verts = new Float32Array([
  -0.5, -1, 0,   0.5, -1, 0,   0, 1, 0,           // body  (material 0)
  -0.45, -0.95, 0.051,  0.45, -0.95, 0.051,  0, 0.95, 0.051, // screen (material 1)
]);
const b64 = Buffer.from(verts.buffer).toString("base64");

const gltf = {
  asset: { version: "2.0" },
  scenes: [{ nodes: [0] }],
  scene: 0,
  nodes: [{ mesh: 0 }],
  meshes: [{
    primitives: [
      { attributes: { POSITION: 0 }, material: 0 },
      { attributes: { POSITION: 1 }, material: 1 },
    ],
  }],
  materials: [
    { name: "Body", pbrMetallicRoughness: { metallicFactor: 1, roughnessFactor: 0.3 } },
    { name: "Screen", pbrMetallicRoughness: { baseColorFactor: [0, 0, 0, 1] } },
  ],
  accessors: [
    { bufferView: 0, byteOffset: 0, componentType: 5126, count: 3, type: "VEC3", min: [-0.5, -1, 0], max: [0.5, 1, 0] },
    { bufferView: 0, byteOffset: 36, componentType: 5126, count: 3, type: "VEC3", min: [-0.45, -0.95, 0.051], max: [0.45, 0.95, 0.051] },
  ],
  bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: verts.byteLength }],
  buffers: [{ byteLength: verts.byteLength, uri: "data:application/octet-stream;base64," + b64 }],
};

const loader = new GLTFLoader();
const parsed = await new Promise((res, rej) => loader.parse(JSON.stringify(gltf), "", res, rej));
must(!!parsed?.scene, "GLTFLoader.parse returned a scene");

const targets = [];
parsed.scene.traverse((o) => {
  if (!o.isMesh) return;
  const mats = Array.isArray(o.material) ? o.material : [o.material];
  mats.forEach((m) => { if (m && !targets.find((t) => t.name === m.name)) targets.push({ name: m.name, material: m }); });
});
const names = targets.map((t) => t.name);
must(names.includes("Screen") && names.includes("Body"), `discovered materials: [${names.join(", ")}]`);

const key = pickScreenMaterial(names);
must(key === "Screen", `pickScreenMaterial picked "${key}" (expected Screen)`);

const box = new THREE.Box3().setFromObject(parsed.scene);
const size = new THREE.Vector3(); box.getSize(size);
const center = new THREE.Vector3(); box.getCenter(center);
const scale = fitScale(Math.max(size.x, size.y, size.z));
must(size.y > 1.9 && size.y < 2.1, `bounding box height ~2 (got ${size.y.toFixed(3)})`);
must(scale > 1.1 && scale < 1.3, `fit scale ~1.2 (got ${scale.toFixed(3)})`);
must(Math.abs(center.y) < 1e-6, `model centered on Y (center.y=${center.y.toFixed(4)})`);

// confirm the screen material can take a map assignment (the texture step)
const target = targets.find((t) => t.name === key);
target.material.map = { isTexture: true };
target.material.needsUpdate = true;
must(!!target.material.map, "screen material accepts a texture map assignment");

console.log(failures === 0 ? "\nRESULT: ALL-OK" : `\nRESULT: ${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
