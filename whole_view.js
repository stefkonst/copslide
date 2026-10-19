/* Whole-slide simulation page (theory): full-body physics from the top of the slope to the playground.
   Choices: push speed, starting position, clothes (normal clothes or cop uniform, each a friction coefficient).
   No measured data here; the scenery is the City Hall Plaza playground (Boston), simplified. */
import RAPIER from "https://cdn.jsdelivr.net/npm/@dimforge/rapier3d-compat@0.14.0/rapier.es.js";
import { createSim, slideMesh, GEO, frameAt } from "./launch/body_sim.js?v=5";

const $ = id => document.getElementById(id);
const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const KMH = 3.6, S_START = 1.9, TONE = 0.3;
const CLOTHES = {
  normal: { label: "Normal clothes", mu: 0.40, col: 0x3a4f6e, note: "cotton / denim on steel" },
  cop: { label: "Cop uniform", mu: 0.15, col: 0x1d2533, vest: true, note: "smooth synthetic uniform on steel" },
};
const RUN_COL = ["#e0453a", "#7b61c4", "#2a9d8f"];
let TH = null;   // theory sweeps (reference curves)

/* ---------------------------------------------------------------- scene */
const host = $("view"), W = () => host.clientWidth, H = () => host.clientHeight;
const ren = new THREE.WebGLRenderer({ antialias: true }); ren.setPixelRatio(Math.min(2, devicePixelRatio)); ren.setSize(W(), H());
ren.shadowMap.enabled = true; ren.shadowMap.type = THREE.PCFSoftShadowMap; ren.outputEncoding = THREE.sRGBEncoding;
host.innerHTML = ""; host.appendChild(ren.domElement);
const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(45, W() / H(), 0.05, 300);
const PTS = []; for (let s = 0; s <= GEO.S_LIP; s += 0.1) PTS.push(new THREE.Vector3(...frameAt(s).o));
const box = new THREE.Box3().setFromPoints(PTS), C = box.getCenter(new THREE.Vector3()), SZ = box.getSize(new THREE.Vector3());
{
  // ---- helpers
  const V3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);
  const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, ...o });
  const put = (geo, mat, x, y, z, shadow = true) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = shadow; m.receiveShadow = true; scene.add(m); return m; };
  const tex = (w, h, draw, rx = 1, ry = 1) => { const c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d"), w, h);
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.anisotropy = 4; return t; };
  const speckle = (base, dots, n) => (x, w, h) => { x.fillStyle = base; x.fillRect(0, 0, w, h); for (let i = 0; i < n; i++) { x.fillStyle = dots[i % dots.length]; x.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5); } };
  const windows = (wall, glass, cols, rows, fin) => (x, w, h) => { x.fillStyle = wall; x.fillRect(0, 0, w, h);
    const cw = w / cols, rh = h / rows; for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) { x.fillStyle = glass; x.fillRect(i * cw + cw * 0.18, j * rh + rh * 0.22, cw * 0.64, rh * 0.56); }
    if (fin) { x.fillStyle = fin; for (let i = 0; i <= cols; i++) x.fillRect(i * cw - 1.5, 0, 3, h); } };
  // ---- sky, light
  const geo = new THREE.SphereGeometry(160, 24, 16), top = new THREE.Color(0x6f93bd), bot = new THREE.Color(0xe4e8ea), cols = [], p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) { const c = bot.clone().lerp(top, Math.max(0, p.getY(i) / 160)); cols.push(c.r, c.g, c.b); }
  geo.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));
  scene.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
  scene.add(new THREE.HemisphereLight(0xdfe8ef, 0x6a5a50, 0.6));
  const sun = new THREE.DirectionalLight(0xfff4e6, 0.85); sun.position.set(C.x + 7, 14, C.z + 6); sun.target.position.copy(C);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, far: 50 }); sun.shadow.bias = -0.0015;
  scene.add(sun, sun.target);
  // ---- frames along the slide
  const F0 = frameAt(0), FL = frameAt(GEO.S_LIP), T0 = V3(F0.t).setY(0).normalize(), TL = V3(FL.t).setY(0).normalize();
  const side = v => new THREE.Vector3(v.z, 0, -v.x);              // horizontal right of a horizontal direction
  // ---- ground: speckled light surfacing
  const gnd = put(new THREE.CircleGeometry(70, 64), std(0xb9b3a8, { map: tex(256, 256, speckle("#b9b3a8", ["#8f8a82", "#d8d3ca", "#a39d93"], 2600), 40, 40) }), C.x, 0, C.z, false);
  gnd.rotation.x = -Math.PI / 2;
  // ---- the slide
  const add = (part, mat) => { const m = slideMesh(GEO.S0, GEO.S_LIP, part), g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(m.vertices, 3)); g.setIndex(new THREE.BufferAttribute(m.indices, 1)); g.computeVertexNormals();
    const me = new THREE.Mesh(g, mat); me.castShadow = me.receiveShadow = true; scene.add(me); return me; };
  const steel = new THREE.MeshStandardMaterial({ color: 0xdfe4e8, metalness: 0.45, roughness: 0.3, side: THREE.DoubleSide });
  add("floor", steel);
  window._roof = add("roof", new THREE.MeshStandardMaterial({ color: 0xd2d8dc, metalness: 0.45, roughness: 0.32, side: THREE.DoubleSide, transparent: true, opacity: 0.35, depthWrite: false }));
  const band = std(0xa9b1b7, { metalness: 0.85, roughness: 0.35 }), bolt = std(0x6f777d, { metalness: 0.8 });
  const axisAt = s => { const F = frameAt(s); return [V3(F.o).addScaledVector(V3(F.n), GEO.R), V3(F.t)]; };
  for (let s = GEO.S_TOP + 0.9; s < GEO.S_MOUTH - 0.2; s += 1.25) {          // bolted joint bands
    const [ax, t] = axisAt(s), q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), t);
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(GEO.R + 0.03, GEO.R + 0.03, 0.07, 28, 1, true), band);
    ring.quaternion.copy(q).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2)); ring.position.copy(ax); scene.add(ring);
    for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2, b = new THREE.Mesh(new THREE.SphereGeometry(0.012, 6, 4), bolt);
      b.position.copy(ax).add(new THREE.Vector3(Math.cos(a) * (GEO.R + 0.035), Math.sin(a) * (GEO.R + 0.035), 0).applyQuaternion(q)); scene.add(b); }
  }

  for (const s of [GEO.S_B1 + 0.25, GEO.S_LIP - 0.35]) { const F = frameAt(s), b = V3(F.b);   // steel legs under the flat end
    for (const sg of [-1, 1]) { const o = V3(F.o).addScaledVector(b, sg * 0.28); put(new THREE.CylinderGeometry(0.025, 0.025, o.y, 8), std(0x9aa2a8, { metalness: 0.8 }), o.x, o.y / 2, o.z); } }
  // ---- maroon rubber hill: broad, smooth, the trough runs down it
  const rubber = std(0x8a4a43, { map: tex(256, 256, speckle("#8a4a43", ["#6e3a35", "#a7655b", "#c9a59b"], 3000), 6, 6), side: THREE.DoubleSide });
  { // height map: as high as the slide it supports allows, sloping away to the plaza, and never above the trough
    // floor anywhere the trough passes overhead (the turns cross over each other, so this must hold for every part).
    const S = []; for (let q = 0; q <= GEO.S_LIP; q += 0.05) { const F = frameAt(q); S.push([F.o[0], F.o[1], F.o[2], q]); }
    const sup = S.filter(p => p[3] >= GEO.S_RT - 0.3 && p[3] <= GEO.S_LIP - 0.3);
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; S.forEach(p => { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[2]); z1 = Math.max(z1, p[2]); });
    x0 -= 6; x1 += 6; z0 -= 6; z1 += 6;
    const step = 0.12, nx = Math.ceil((x1 - x0) / step), nz = Math.ceil((z1 - z0) / step), R = GEO.R, pos = [], uv = [], idx = [];
    for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
      const x = x0 + i * step, z = z0 + j * step;
      let h = 0, cap = 1e9;
      for (const p of sup) { const d = Math.hypot(x - p[0], z - p[2]); h = Math.max(h, p[1] - 0.05 - 0.75 * Math.max(0, d - 0.35)); }
      for (const p of S) { const d = Math.hypot(x - p[0], z - p[2]); if (d < R + 0.06) cap = Math.min(cap, p[1] + R - Math.sqrt(Math.max(0, R * R - Math.min(d, R) ** 2)) - 0.04); }
      h = Math.min(h, cap); pos.push(x, h < 0.01 ? -0.03 : h, z); uv.push(i / nx * 8, j / nz * 8);
    }
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const a = j * (nx + 1) + i, b = a + nx + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    const hill = new THREE.Mesh(g, rubber); hill.receiveShadow = hill.castShadow = true; scene.add(hill);
  }
  // ---- granite block stairs up the hill beside the trough, with hoop handrails
  { const gran = std(0x77746f, { map: tex(128, 128, speckle("#77746f", ["#5b5955", "#9a9690", "#3f3d3a"], 1800), 2, 2) });
    const s0 = GEO.S_B0 - 0.2, F = frameAt(s0), dir = V3(F.t).setY(0).normalize().negate(), r = side(dir.clone().negate()), base = V3(F.o).setY(0).addScaledVector(r, 2.6);
    for (let k = 0; k < 9; k++) { const h = 0.32 * (k + 1), at = base.clone().addScaledVector(dir, k * 0.42);
      put(new THREE.BoxGeometry(1.5, h, 0.46), gran, at.x, h / 2, at.z).rotation.y = Math.atan2(dir.x, dir.z); }
    const rail = std(0xc9ced2, { metalness: 0.85, roughness: 0.3 });
    for (let k = 0; k < 9; k += 2) { const at = base.clone().addScaledVector(dir, k * 0.42).addScaledVector(r, 0.85), h = 0.32 * (k + 1);
      const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.022, 6, 18, Math.PI), rail); hoop.position.set(at.x, h + 0.55, at.z); hoop.rotation.y = Math.atan2(dir.x, dir.z) + Math.PI / 2; hoop.castShadow = true; scene.add(hoop);
      for (const sg of [-1, 1]) put(new THREE.CylinderGeometry(0.022, 0.022, 0.55, 6), rail, at.x + dir.x * sg * 0.32, h + 0.27, at.z + dir.z * sg * 0.32); }
  }
  // ---- play tower: orange slats below, blue slats above; the tube leaves it high up
  { const w = 2.6, H1 = 4.6, H2 = 9.0, c = V3(F0.o).setY(0).addScaledVector(T0, -1.1), rot = Math.atan2(T0.x, T0.z);
    const core = put(new THREE.BoxGeometry(w - 0.1, H2, w - 0.1), std(0x2c3a4c), c.x, H2 / 2, c.z); core.rotation.y = rot;
    const slats = (y0, y1, color) => { const m = std(color, { roughness: 0.7 }); for (let f = 0; f < 4; f++) for (let k = 0; k < 9; k++) {
      const u = (k / 8 - 0.5) * (w - 0.3), ang = rot + f * Math.PI / 2, n = new THREE.Vector3(Math.sin(ang), 0, Math.cos(ang)), t = side(n);
      const sl = put(new THREE.BoxGeometry(0.14, y1 - y0, 0.08), m, c.x + n.x * w / 2 + t.x * u, (y0 + y1) / 2, c.z + n.z * w / 2 + t.z * u); sl.rotation.y = ang; } };
    slats(0.6, H1, 0xe2622f); slats(H1 + 0.3, H2 - 0.2, 0x2f74c0);
    put(new THREE.BoxGeometry(w + 0.25, 0.25, w + 0.25), std(0xdfe3e6), c.x, H1 + 0.12, c.z).rotation.y = rot;
    const cage = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 1.2, 16, 1, true), std(0x9aa3aa, { wireframe: true, metalness: 0.6 }));
    cage.position.copy(c).addScaledVector(side(T0), w / 2 + 0.55).setY(H1 + 1.4); scene.add(cage);
  }
  // ---- shade sails on tall poles
  { const pole = std(0x9aa3aa, { metalness: 0.7, roughness: 0.4 }), sail = std(0x22364a, { side: THREE.DoubleSide, roughness: 0.85 });
    const r = side(TL), A = V3(FL.o).setY(0);
    const sails = [[A.clone().addScaledVector(r, -4).addScaledVector(TL, 2), A.clone().addScaledVector(r, 5).addScaledVector(TL, 3), A.clone().addScaledVector(r, 1).addScaledVector(TL, -6), [6.5, 7.8, 8.6]],
                   [A.clone().addScaledVector(r, 5).addScaledVector(TL, 3), A.clone().addScaledVector(r, 9).addScaledVector(TL, -5), A.clone().addScaledVector(r, 1).addScaledVector(TL, -6), [7.8, 7.0, 8.6]]];
    sails.forEach(([a, b, c, h]) => { const g = new THREE.BufferGeometry(), P = [a, b, c].map((v, i) => new THREE.Vector3(v.x, h[i], v.z));
      g.setAttribute("position", new THREE.Float32BufferAttribute(P.flatMap(v => [v.x, v.y, v.z]), 3)); g.setIndex([0, 1, 2]); g.computeVertexNormals();
      const m = new THREE.Mesh(g, sail); m.castShadow = true; scene.add(m);
      P.forEach(v => put(new THREE.CylinderGeometry(0.11, 0.13, v.y + 0.4, 10), pole, v.x, (v.y + 0.4) / 2, v.z)); });
    // light poles with camera heads
    [[-6, -1], [7, 6], [-3, 9]].forEach(([u, t]) => { const at = A.clone().addScaledVector(r, u).addScaledVector(TL, t);
      put(new THREE.CylinderGeometry(0.06, 0.08, 6, 8), std(0x2b2f33), at.x, 3, at.z); put(new THREE.BoxGeometry(0.5, 0.12, 0.18), std(0x2b2f33), at.x, 6, at.z); });
  }
  // ---- Boston backdrop: JFK federal building, white grid tower, blue glass tower, concrete tower
  { const back = V3(F0.o).setY(0).addScaledVector(T0, -16), r = side(T0), yaw = Math.atan2(T0.x, T0.z);
    const bld = (u, t, w, h, d, texture) => { const at = back.clone().addScaledVector(r, u).addScaledVector(T0, t); const m = put(new THREE.BoxGeometry(w, h, d), std(0xffffff, { map: texture, roughness: 0.8 }), at.x, h / 2, at.z, false); m.rotation.y = yaw; return m; };
    bld(4, 6, 40, 12, 9, tex(512, 128, windows("#d9d2c3", "#56606a", 34, 4, "#c8c0af"), 1, 1));                 // JFK building (low, finned)
    bld(-6, -14, 14, 58, 14, tex(256, 512, windows("#e9ecee", "#8f9aa4", 12, 40), 1, 1));                     // white grid tower
    bld(9, -18, 13, 66, 13, tex(256, 512, windows("#5f89b8", "#9cc2e6", 10, 44), 1, 1));                      // blue glass tower
    bld(-24, -10, 16, 48, 16, tex(256, 512, windows("#b9b4ab", "#6d7177", 14, 34), 1, 1));                    // concrete tower (side photo)
    bld(26, -4, 12, 30, 12, tex(256, 512, windows("#cfc9bf", "#5e656c", 10, 22), 1, 1));
  }
  // ---- trees (a few leafy, a few bare)
  { const trunk = std(0x5e4634), leaf = std(0x5d8a45);
    [[-7, 3, 1], [8, 7, 1], [-9, -4, 0], [10, -2, 1], [4, 12, 0], [-12, 10, 1], [14, 4, 0]].forEach(([u, t, leafy]) => {
      const at = V3(FL.o).setY(0).addScaledVector(side(TL), u).addScaledVector(TL, t);
      put(new THREE.CylinderGeometry(0.09, 0.13, 2.4, 7), trunk, at.x, 1.2, at.z);
      if (leafy) { put(new THREE.IcosahedronGeometry(1.25, 1), leaf, at.x, 3.0, at.z); put(new THREE.IcosahedronGeometry(0.85, 1), leaf, at.x + 0.6, 3.6, at.z - 0.3); }
      else for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2, br = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.04, 1.3, 5), trunk);
        br.position.set(at.x + Math.cos(a) * 0.35, 2.7, at.z + Math.sin(a) * 0.35); br.rotation.set(Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6); scene.add(br); } });
  }
}

/* ---------------------------------------------------------------- body + physics */
let RAP = null, sim = null, meshes = {}, rate = 1, acc = 0, last = 0, camT = new THREE.Vector3(), camMode = "orbit", hist = [], runs = [];
function buildMeshes() {
  Object.values(meshes).forEach(m => scene.remove(m)); meshes = {};
  const cl = CLOTHES[$("cl").value];
  for (const [k, rb] of Object.entries(sim.bodies)) {
    const sh = rb.collider(0).shape, isBall = sh.halfExtents === undefined;
    const geo = isBall ? new THREE.SphereGeometry(sh.radius, 16, 12) : new THREE.BoxGeometry(sh.halfExtents.x * 2, sh.halfExtents.y * 2, sh.halfExtents.z * 2);
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: k === "head" || k.startsWith("farm") ? 0xd9a888 : cl.col, roughness: 0.7 }));
    if (k === "torso" && cl.vest) m.add(new THREE.Mesh(new THREE.BoxGeometry(sh.halfExtents.x * 1.6, sh.halfExtents.y * 2.1, sh.halfExtents.z * 1.9), new THREE.MeshStandardMaterial({ color: 0xc8f02a })));
    m.castShadow = true; scene.add(m); meshes[k] = m;
  }
}
// orbit starts where you would stand beside the granite stairs (like the landing cameras), aimed at the middle of the slide
const orbit = (() => {
  const A = frameAt(GEO.S_B0 + 0.6), th = new THREE.Vector3(A.t[0], 0, A.t[2]).normalize(), rt = new THREE.Vector3(th.z, 0, -th.x);
  const eye = new THREE.Vector3(A.o[0] + rt.x * 5.6 + th.x * 3.4, 2.4, A.o[2] + rt.z * 5.6 + th.z * 3.4);
  const d = eye.sub(new THREE.Vector3(C.x, C.y * 0.7, C.z)), r = d.length() * 1.12;
  return { th: Math.atan2(d.x, d.z), ph: Math.acos(Math.max(-1, Math.min(1, d.y / d.length()))), r };
})();
const TOWER = new THREE.Vector3(...frameAt(0).o).add(new THREE.Vector3(0, 2.4, 0)).addScaledVector(new THREE.Vector3(...frameAt(0).t), 0.4);
function sync() {
  for (const [k, rb] of Object.entries(sim.bodies)) { const t = rb.translation(), q = rb.rotation(); meshes[k].position.set(t.x, t.y, t.z); meshes[k].quaternion.set(q.x, q.y, q.z, q.w); }
  const st = sim.state(), c = sim.com(), s = Math.min(st.s, GEO.S_LIP), F = frameAt(s);
  const tgt = st.s <= GEO.S_LIP ? new THREE.Vector3(...F.o.map((x, i) => x + F.n[i] * GEO.R)) : new THREE.Vector3(c.x, c.y, c.z);
  camT.lerp(tgt, 0.12);
  const T = new THREE.Vector3(...F.t);
  window._roof.material.opacity = camMode === "pov" ? 0.08 : 0.35;
  if (camMode === "orbit") { cam.position.set(C.x + orbit.r * Math.sin(orbit.ph) * Math.sin(orbit.th), C.y * 0.7 + orbit.r * Math.cos(orbit.ph), C.z + orbit.r * Math.sin(orbit.ph) * Math.cos(orbit.th)); cam.lookAt(C.x, C.y * 0.7, C.z); }
  else if (camMode === "stairs") {   // standing beside the granite stairs, looking up the lower slide like the landing camera
    const A = frameAt(GEO.S_B0 + 0.6), th = new THREE.Vector3(A.t[0], 0, A.t[2]).normalize(), rt = new THREE.Vector3(th.z, 0, -th.x);
    cam.position.set(A.o[0] + rt.x * 5.6 + th.x * 3.4, 1.7, A.o[2] + rt.z * 5.6 + th.z * 3.4);
    const M = frameAt(GEO.S_MOUTH + 1.6).o; cam.lookAt(M[0], M[1] + 0.1, M[2]); }
  else if (camMode === "photo") { const FL = frameAt(GEO.S_LIP), tl = new THREE.Vector3(FL.t[0], 0, FL.t[2]).normalize(), rt = new THREE.Vector3(tl.z, 0, -tl.x);
    cam.position.set(FL.o[0] + tl.x * 3.6 + rt.x * 0.9, 1.1, FL.o[2] + tl.z * 3.6 + rt.z * 0.9); const M = frameAt(GEO.S_MOUTH - 1.5).o; cam.lookAt(M[0], M[1] + 0.8, M[2]); }
  else if (camMode === "tower") { cam.position.copy(TOWER); cam.lookAt(camT); }
  else if (camMode === "chase") { cam.position.copy(camT.clone().addScaledVector(T, -1.9).add(new THREE.Vector3(0, 0.9, 0))); cam.lookAt(camT.clone().addScaledVector(T, 1.2)); }
  else if (camMode === "pov") { const h = meshes.head.position; cam.position.copy(h.clone().add(new THREE.Vector3(0, 0.15, 0))); cam.lookAt(h.clone().addScaledVector(T, 2).add(new THREE.Vector3(0, -0.3, 0))); }
  else { cam.position.copy(camT.clone().addScaledVector(T, -1.6).add(new THREE.Vector3(0, 1.3, 0)).addScaledVector(new THREE.Vector3(...F.b), 0.9)); cam.lookAt(camT); }
}
let drag = false, lx = 0, ly = 0;
ren.domElement.addEventListener("pointerdown", e => { drag = true; lx = e.clientX; ly = e.clientY; });
window.addEventListener("pointerup", () => drag = false);
window.addEventListener("pointermove", e => { if (!drag || camMode !== "orbit") return; orbit.th -= (e.clientX - lx) * 0.006; orbit.ph = Math.max(0.25, Math.min(1.5, orbit.ph - (e.clientY - ly) * 0.006)); lx = e.clientX; ly = e.clientY; });
ren.domElement.addEventListener("wheel", e => { if (camMode !== "orbit") return; orbit.r = Math.max(3, Math.min(40, orbit.r + e.deltaY * 0.01)); e.preventDefault(); }, { passive: false });

function readouts(final) {
  const st = sim.state(), f = (x, d = 1) => x == null ? "—" : (+x).toFixed(d);
  const tile = (tl, tv, tu, tn = "") => `<div class="tile"><div class="tl">${tl}</div><div class="tv">${tv}<span class="tu">${tu}</span></div><div class="tn">${tn}</div></div>`;
  const ended = st.tLip != null ? `shot off the end at ${f(st.vLip * KMH)} km/h` : final ? `stopped at ${f(st.s, 1)} m` : "running…";
  $("read").innerHTML =
    tile("Top of the slope → end lip", st.tLip != null ? f(st.tLip, 1) : "—", st.tLip != null ? "s" : "", ended) +
    tile("Leaving the turns", st.vTurnsEnd != null ? f(st.vTurnsEnd * KMH) : "—", "km/h") +
    tile("Out of the tube", st.vMouth != null ? f(st.vMouth * KMH) : "—", "km/h", st.wallAtMouth != null ? `${f(Math.abs(st.wallAtMouth), 0)}° up the wall` : "") +
    tile("Body twisted", f(st.rollMax * 57.3, 0), "°", st.rollAtMouth != null ? `${f(Math.abs(st.rollAtMouth), 0)}° at the tube mouth` : "");
  hist.push([st.s, sim.com().v * KMH]);
  drawChart();
}
function drawChart() {
  const svg = $("chart"), Wd = svg.clientWidth || 600, Hd = 240, M = { l: 40, r: 10, t: 12, b: 30 };
  const XM = GEO.S_LIP + 0.5, X = s => M.l + Math.min(s, XM) / XM * (Wd - M.l - M.r), Y = v => Hd - M.b - Math.min(v, 30) / 30 * (Hd - M.t - M.b);
  svg.setAttribute("viewBox", `0 0 ${Wd} ${Hd}`);
  const path = (p, col, w, dash) => `<path d="M${p.filter(q => q[0] <= XM).map(q => X(q[0]).toFixed(1) + "," + Y(q[1]).toFixed(1)).join("L")}" fill="none" stroke="${col}" stroke-width="${w}" ${dash ? `stroke-dasharray="${dash}"` : ""}/>`;
  let g = `<rect x="${X(GEO.S_RT)}" y="${M.t}" width="${X(GEO.S_LT1) - X(GEO.S_RT)}" height="${Hd - M.t - M.b}" fill="${css("--grid")}" opacity="0.7"/>
    <text x="${(X(GEO.S_RT) + X(GEO.S_LT1)) / 2}" y="${M.t + 11}" fill="${css("--text-faint")}" font-size="10" text-anchor="middle">turns</text>
    <line x1="${X(GEO.S_MOUTH)}" x2="${X(GEO.S_MOUTH)}" y1="${M.t}" y2="${Hd - M.b}" stroke="${css("--text-faint")}" stroke-dasharray="3 3"/>
    <text x="${X(GEO.S_MOUTH) + 3}" y="${M.t + 11}" fill="${css("--text-faint")}" font-size="10">tube mouth</text>`;
  for (const v of [0, 10, 20, 30]) g += `<line x1="${M.l}" x2="${Wd - M.r}" y1="${Y(v)}" y2="${Y(v)}" stroke="${css("--grid")}"/><text x="${M.l - 5}" y="${Y(v) + 4}" fill="${css("--text-faint")}" font-size="10" text-anchor="end">${v}</text>`;
  for (const s of [0, 4, 8, 12]) g += `<text x="${X(s)}" y="${Hd - 12}" fill="${css("--text-faint")}" font-size="10" text-anchor="middle">${s} m</text>`;
  if (TH) for (const [k, p] of Object.entries(TH.profiles)) {   // reference: each clothes type, 6 km/h push, on the back
    const q = p.map(r => [r[1], r[2]]); g += path(q, css("--text-faint"), 1.3, "5 4");
    const m = q[Math.floor(q.length * (k === "cop" ? 0.55 : 0.75))]; if (m) g += `<text x="${Math.min(X(m[0]), Wd - M.r - 4)}" y="${Y(m[1]) - 6}" fill="${css("--text-dim")}" font-size="10.5" text-anchor="${X(m[0]) > Wd * 0.7 ? "end" : "middle"}">${CLOTHES[k].label}</text>`;
  }
  runs.forEach((r, i) => { g += path(r.p, RUN_COL[i % 3], 2, null); });
  if (hist.length > 1) g += path(hist, RUN_COL[runs.length % 3], 3, null);
  g += `<text x="${(M.l + Wd - M.r) / 2}" y="${Hd - 1}" fill="${css("--text-dim")}" font-size="11" text-anchor="middle">${Wd < 560 ? "distance (m) · thick: your run · dashed: reference" : "distance down the slide · thick: your run · thin: your previous runs · dashed: reference (6 km/h push, on the back)"}</text>`;
  svg.innerHTML = g;
}
function run() {
  if (!RAP) return;
  if (sim && hist.length > 5) { runs.push({ p: hist }); if (runs.length > 2) runs.shift(); }
  const mu = +$("mu").value;
  sim = createSim(RAP, { v0: +$("push").value / KMH, mu, muTurns: mu, tone: TONE, posture: $("pos").value, s0: S_START });
  hist = []; buildMeshes(); camT.set(...frameAt(S_START).o); sync(); readouts(false); acc = 0;
}
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (sim && !sim.state().done) { acc += dt * rate; const n = Math.floor(acc / sim.world.timestep); acc -= n * sim.world.timestep; sim.step(n); readouts(sim.state().done); }
  if (sim) sync();
  ren.render(scene, cam);
}
const setMuLabel = () => { $("muVal").textContent = (+$("mu").value).toFixed(2); $("clNote").textContent = `${CLOTHES[$("cl").value].note}; the slide stalls at ${Math.tan(GEO.TH).toFixed(2)} (= tan 30°)`; };
$("pushVal").textContent = (+$("push").value).toFixed(1) + " km/h";
$("push").addEventListener("input", () => { $("pushVal").textContent = (+$("push").value).toFixed(1) + " km/h"; });
$("cl").addEventListener("change", () => { $("mu").value = CLOTHES[$("cl").value].mu; setMuLabel(); run(); });
$("mu").addEventListener("input", setMuLabel);
["push", "pos", "mu"].forEach(id => $(id).addEventListener("change", run));
$("go").addEventListener("click", run);
document.querySelectorAll("[data-rate]").forEach(b => b.addEventListener("click", () => { rate = +b.dataset.rate; document.querySelectorAll("[data-rate]").forEach(x => x.classList.toggle("active", x === b)); }));
document.querySelectorAll("[data-cam]").forEach(b => b.addEventListener("click", () => { camMode = b.dataset.cam; document.querySelectorAll("[data-cam]").forEach(x => x.classList.toggle("active", x === b)); }));
window.addEventListener("resize", () => { ren.setSize(W(), H()); cam.aspect = W() / H(); cam.updateProjectionMatrix(); drawChart(); });
setMuLabel();
fetch("data/theory_sweeps.json?v=" + (window.V || "")).then(r => r.ok ? r.json() : null).then(d => { TH = d; drawChart(); }).catch(() => { });
RAPIER.init().then(() => { RAP = RAPIER; const q = new URLSearchParams(location.search); if (q.get("clothes") && CLOTHES[q.get("clothes")]) { $("cl").value = q.get("clothes"); $("mu").value = CLOTHES[q.get("clothes")].mu; setMuLabel(); } if (q.get("pos")) $("pos").value = q.get("pos"); if (q.get("cam")) document.querySelector(`[data-cam="${q.get("cam")}"]`)?.click(); run(); requestAnimationFrame(t => { last = t; loop(t); }); })
  .catch(e => { host.innerHTML = `<p class="notes">Physics engine failed to load (${e.message}).</p>`; });
