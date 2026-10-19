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
  const geo = new THREE.SphereGeometry(140, 24, 16), top = new THREE.Color(0x4f7fb3), bot = new THREE.Color(0xdfe7ea), cols = [], p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) { const c = bot.clone().lerp(top, Math.max(0, p.getY(i) / 140)); cols.push(c.r, c.g, c.b); }
  geo.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));
  scene.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
  scene.add(new THREE.HemisphereLight(0xcfe3f0, 0x7a6a5a, 0.55));
  const sun = new THREE.DirectionalLight(0xfff2e0, 0.85); sun.position.set(C.x + 6, 12, C.z + 5); sun.target.position.copy(C);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, far: 40 }); sun.shadow.bias = -0.0015;
  scene.add(sun, sun.target);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(60, 64), new THREE.MeshStandardMaterial({ color: 0x4c7340, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.position.set(C.x, 0, C.z); ground.receiveShadow = true; scene.add(ground);
  const plaza = new THREE.Mesh(new THREE.PlaneGeometry(26, 18), new THREE.MeshStandardMaterial({ color: 0x857a6e, roughness: 0.95 }));   // brick plaza
  plaza.rotation.x = -Math.PI / 2; plaza.position.set(C.x, 0.003, C.z - 3); plaza.receiveShadow = true; scene.add(plaza);
  const L = frameAt(GEO.S_LIP), pad = new THREE.Mesh(new THREE.CircleGeometry(3.2, 40), new THREE.MeshStandardMaterial({ color: 0xaa4a3d, roughness: 0.95 }));
  pad.rotation.x = -Math.PI / 2; pad.position.set(L.o[0] + L.t[0] * 1.5, 0.006, L.o[2] + L.t[2] * 1.5); pad.receiveShadow = true; scene.add(pad);
  // the slide
  const add = (part, mat) => { const m = slideMesh(GEO.S0, GEO.S_LIP, part), g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(m.vertices, 3)); g.setIndex(new THREE.BufferAttribute(m.indices, 1)); g.computeVertexNormals();
    const me = new THREE.Mesh(g, mat); me.castShadow = me.receiveShadow = true; scene.add(me); return me; };
  add("floor", new THREE.MeshStandardMaterial({ color: 0xaab4bb, metalness: 0.85, roughness: 0.3, side: THREE.DoubleSide }));
  window._roof = add("roof", new THREE.MeshStandardMaterial({ color: 0x9aa3aa, metalness: 0.8, roughness: 0.35, side: THREE.DoubleSide, transparent: true, opacity: 0.35, depthWrite: false }));
  window._roof.castShadow = true;
  const ribMat = new THREE.MeshStandardMaterial({ color: 0x7d858b, metalness: 0.8, roughness: 0.4 });
  for (let s = GEO.S_TOP + 0.35; s < GEO.S_MOUTH; s += 0.7) { const F = frameAt(s), ax = new THREE.Vector3(...F.o.map((x, i) => x + F.n[i] * GEO.R));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(GEO.R + 0.015, 0.012, 8, 24), ribMat); ring.position.copy(ax); ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(...F.t)); scene.add(ring); }
  // red rubber mound under the lower slide (closed, domed)
  const rows = []; for (let s = GEO.S_RT + 0.5; s <= GEO.S_LIP; s += 0.15) rows.push(frameAt(s));
  const pos = [], idx = [], N = 12, half = 1.7, hill = 2.2;
  rows.forEach(F => { const r = new THREE.Vector3(F.t[2], 0, -F.t[0]).normalize(), ridge = Math.max(0, F.o[1] - 0.04);
    for (let j = 0; j <= N; j++) { const f = j / N * 2 - 1, y = Math.max(0, ridge - hill * 0.5 * (1 - Math.cos(f * Math.PI))); pos.push(F.o[0] + r.x * f * half, y, F.o[2] + r.z * f * half); } });
  for (let i = 0; i < rows.length - 1; i++) for (let j = 0; j < N; j++) { const a = i * (N + 1) + j, b = a + N + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  const mg = new THREE.BufferGeometry(); mg.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); mg.setIndex(idx); mg.computeVertexNormals();
  const mound = new THREE.Mesh(mg, new THREE.MeshStandardMaterial({ color: 0xaa4a3d, roughness: 0.95, side: THREE.DoubleSide })); mound.castShadow = mound.receiveShadow = true; scene.add(mound);
  // entry tower: striped deck + shade sail
  const c = document.createElement("canvas"); c.width = 256; c.height = 384; const x = c.getContext("2d");
  ["#e25a3c", "#3b6f99", "#e25a3c", "#dfe3e6"].forEach((col, i) => { for (let k = i; k < 10; k += 4) { x.fillStyle = col; x.fillRect(k * 26, 0, 26, 384); } });
  const F0 = frameAt(0), deckY = F0.o[1] - 0.02, back = new THREE.Vector3(...F0.t).multiplyScalar(-0.75);
  const tower = new THREE.Mesh(new THREE.BoxGeometry(1.5, deckY, 1.5), new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(c), roughness: 0.85 }));
  tower.position.set(F0.o[0] + back.x, deckY / 2, F0.o[2] + back.z); tower.castShadow = tower.receiveShadow = true; scene.add(tower);
  const sail = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 2.8), new THREE.MeshStandardMaterial({ color: 0x2c5f8a, roughness: 0.8, side: THREE.DoubleSide }));
  sail.rotation.x = -Math.PI / 2.4; sail.position.set(F0.o[0] + back.x, deckY + 1.6, F0.o[2] + back.z); sail.castShadow = true; scene.add(sail);
  // Boston backdrop: City Hall's stepped concrete block + towers behind
  const conc = new THREE.MeshStandardMaterial({ color: 0xa59d92, roughness: 1 }), glass = new THREE.MeshStandardMaterial({ color: 0x7f93a6, roughness: 0.4, metalness: 0.3 });
  const away = new THREE.Vector3(C.x - 4, 0, C.z - 22);
  [[0, 6, 18, 12], [0, 9.5, 20, 9], [0, 12, 22, 6]].forEach(([dx, h, w, d]) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, 2.6, d), conc); b.position.set(away.x + dx, h, away.z); b.castShadow = true; scene.add(b); });
  const base = new THREE.Mesh(new THREE.BoxGeometry(16, 5, 10), conc); base.position.set(away.x, 2.5, away.z); scene.add(base);
  [[-22, 26, -30], [-14, 38, -40], [12, 30, -36], [22, 44, -46], [30, 22, -28], [-30, 18, -24]].forEach(([dx, h, dz]) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(6, h, 6), glass); b.position.set(C.x + dx, h / 2, C.z + dz); scene.add(b); });
  // trees
  const trunk = new THREE.MeshStandardMaterial({ color: 0x6b4a33, roughness: 1 }), leaf = new THREE.MeshStandardMaterial({ color: 0x4f7a3f, roughness: 1 });
  [[8, -3], [9.5, 2], [-8, -4], [7, 6], [-9, 4], [-4, 9], [4, -10], [-12, -9], [12, -8]].forEach(([dx, dz]) => {
    const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 1.8, 6), trunk); tr.position.set(C.x + dx, 0.9, C.z + dz);
    const lf = new THREE.Mesh(new THREE.IcosahedronGeometry(1.0, 0), leaf); lf.position.set(C.x + dx, 2.2, C.z + dz);
    tr.castShadow = lf.castShadow = true; scene.add(tr, lf); });
}

/* ---------------------------------------------------------------- body + physics */
let RAP = null, sim = null, meshes = {}, rate = 1, acc = 0, last = 0, camT = new THREE.Vector3(), camMode = "follow", hist = [], runs = [];
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
const orbit = { th: -0.65, ph: 1.15, r: Math.max(9, SZ.length() * 0.9) };
const TOWER = new THREE.Vector3(...frameAt(0).o).add(new THREE.Vector3(0, 1.6, 0));
function sync() {
  for (const [k, rb] of Object.entries(sim.bodies)) { const t = rb.translation(), q = rb.rotation(); meshes[k].position.set(t.x, t.y, t.z); meshes[k].quaternion.set(q.x, q.y, q.z, q.w); }
  const st = sim.state(), c = sim.com(), s = Math.min(st.s, GEO.S_LIP), F = frameAt(s);
  const tgt = st.s <= GEO.S_LIP ? new THREE.Vector3(...F.o.map((x, i) => x + F.n[i] * GEO.R)) : new THREE.Vector3(c.x, c.y, c.z);
  camT.lerp(tgt, 0.12);
  const T = new THREE.Vector3(...F.t);
  window._roof.material.opacity = camMode === "pov" ? 0.08 : 0.35;
  if (camMode === "orbit") { cam.position.set(C.x + orbit.r * Math.sin(orbit.ph) * Math.sin(orbit.th), C.y * 0.7 + orbit.r * Math.cos(orbit.ph), C.z + orbit.r * Math.sin(orbit.ph) * Math.cos(orbit.th)); cam.lookAt(C.x, C.y * 0.7, C.z); }
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
    const m = q[Math.floor(q.length * (k === "cop" ? 0.55 : 0.75))]; if (m) g += `<text x="${X(m[0])}" y="${Y(m[1]) - 6}" fill="${css("--text-dim")}" font-size="10.5" text-anchor="middle">${CLOTHES[k].label} (reference)</text>`;
  }
  runs.forEach((r, i) => { g += path(r.p, RUN_COL[i % 3], 2, null); });
  if (hist.length > 1) g += path(hist, RUN_COL[runs.length % 3], 3, null);
  g += `<text x="${(M.l + Wd - M.r) / 2}" y="${Hd - 1}" fill="${css("--text-dim")}" font-size="11" text-anchor="middle">distance down the slide · thick: your run · thin: your previous runs · dashed: reference (6 km/h push, on the back)</text>`;
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
