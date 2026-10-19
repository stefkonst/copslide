/* Whole-slide simulation page: full-body physics from the top of the slope to the playground.
   Three choices only: push speed, starting position, clothes (friction fitted to real runs). */
import RAPIER from "https://cdn.jsdelivr.net/npm/@dimforge/rapier3d-compat@0.14.0/rapier.es.js";
import { createSim, slideMesh, POSTURES, GEO, frameAt } from "./launch/body_sim.js?v=4";

const $ = id => document.getElementById(id);
const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const KMH = 3.6, S_START = 1.9;
const CLOTHES = {
  normal: { label: "Normal clothes (our riders)", muTurns: 0.41, mu: 0.21, tone: 0.3, note: "fitted to P12's run (logger + video)" },
  suit: { label: "Cop suit (our riders)", muTurns: 0.41, mu: 0.30, tone: 0.3, note: "fitted to Angel's and Stef's suit runs" },
  rain: { label: 'Rain suit ("wannabe cop")', muTurns: 0.188, mu: 0.188, tone: 0, note: "one friction fitted to his 0.75 s; relaxed body" },
  cop: { label: "The viral cop's uniform", muTurns: 0.137, mu: 0.137, tone: 0, note: "one friction fitted to his 0.70 s; relaxed body" },
};
let SW = null;
const host = $("view"), W = () => host.clientWidth, H = () => host.clientHeight;
const scene = new THREE.Scene(); scene.background = new THREE.Color(0xcfe3f0);
const cam = new THREE.PerspectiveCamera(45, W() / H(), 0.05, 200);
const ren = new THREE.WebGLRenderer({ antialias: true }); ren.setPixelRatio(Math.min(2, devicePixelRatio)); ren.setSize(W(), H()); host.innerHTML = ""; host.appendChild(ren.domElement);
scene.add(new THREE.HemisphereLight(0xffffff, 0x667755, 0.9)); const sun = new THREE.DirectionalLight(0xffffff, 0.7); sun.position.set(-4, 10, 6); scene.add(sun);
{
  const add = (part, mat) => { const m = slideMesh(GEO.S0, GEO.S_LIP, part), g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(m.vertices, 3)); g.setIndex(new THREE.BufferAttribute(m.indices, 1)); g.computeVertexNormals(); scene.add(new THREE.Mesh(g, mat)); };
  add("floor", new THREE.MeshStandardMaterial({ color: 0xb9c3cc, metalness: 0.6, roughness: 0.35, side: THREE.DoubleSide }));
  add("roof", new THREE.MeshStandardMaterial({ color: 0x8e99a3, metalness: 0.5, roughness: 0.4, side: THREE.DoubleSide, transparent: true, opacity: 0.22, depthWrite: false }));
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({ color: 0x9fb07a, roughness: 0.95 })); ground.rotation.x = -Math.PI / 2; scene.add(ground);
  const pad = new THREE.Mesh(new THREE.CircleGeometry(4, 40), new THREE.MeshStandardMaterial({ color: 0x8a5a4e, roughness: 0.95 })); pad.rotation.x = -Math.PI / 2; pad.position.y = 0.005; scene.add(pad);
  const F0 = frameAt(0), tower = new THREE.Mesh(new THREE.BoxGeometry(1.6, F0.o[1], 1.6), new THREE.MeshStandardMaterial({ color: 0xc96b4a, roughness: 0.8 }));
  tower.position.set(F0.o[0] - 0.9, F0.o[1] / 2, F0.o[2]); scene.add(tower);
}
let RAP = null, sim = null, meshes = {}, rate = 1, acc = 0, last = 0, camT = new THREE.Vector3(), camMode = "follow", hist = [];
function buildMeshes() {
  Object.values(meshes).forEach(m => scene.remove(m)); meshes = {};
  for (const [k, rb] of Object.entries(sim.bodies)) {
    const sh = rb.collider(0).shape, isBall = sh.halfExtents === undefined;
    const geo = isBall ? new THREE.SphereGeometry(sh.radius, 16, 12) : new THREE.BoxGeometry(sh.halfExtents.x * 2, sh.halfExtents.y * 2, sh.halfExtents.z * 2);
    const cl = $("cl").value, suitCol = cl === "cop" || cl === "suit" ? 0x1d2533 : cl === "rain" ? 0x4f7c96 : 0x3a4f6e;
    const col = k === "head" || k.startsWith("farm") ? 0xd9a888 : suitCol;
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: col, roughness: 0.7 }));
    if (k === "torso" && (cl === "cop" || cl === "suit")) m.add(new THREE.Mesh(new THREE.BoxGeometry(sh.halfExtents.x * 1.6, sh.halfExtents.y * 2.1, sh.halfExtents.z * 1.9), new THREE.MeshStandardMaterial({ color: 0xc8f02a })));
    scene.add(m); meshes[k] = m;
  }
}
function sync() {
  for (const [k, rb] of Object.entries(sim.bodies)) { const t = rb.translation(), q = rb.rotation(); meshes[k].position.set(t.x, t.y, t.z); meshes[k].quaternion.set(q.x, q.y, q.z, q.w); }
  const st = sim.state(), c = sim.com(), s = Math.min(st.s, GEO.S_LIP), F = frameAt(s);
  if (camMode === "overview") { cam.position.set(6, 8, 9); cam.lookAt(-1, 2.2, -2.5); return; }
  const tgt = st.s <= GEO.S_LIP ? new THREE.Vector3(...F.o.map((x, i) => x + F.n[i] * GEO.R)) : new THREE.Vector3(c.x, c.y, c.z);
  camT.lerp(tgt, 0.12);
  const back = new THREE.Vector3(...F.t).multiplyScalar(-1.6), up = new THREE.Vector3(0, 1.3, 0), side = new THREE.Vector3(...F.b).multiplyScalar(0.9);
  cam.position.copy(camT.clone().add(back).add(up).add(side)); cam.lookAt(camT);
}
function readouts(final) {
  const st = sim.state(), f = (x, d = 1) => x == null ? "—" : (+x).toFixed(d);
  const tile = (tl, tv, tu, tn = "") => `<div class="tile"><div class="tl">${tl}</div><div class="tv">${tv}<span class="tu">${tu}</span></div><div class="tn">${tn}</div></div>`;
  const ended = st.tLip != null ? `shot off the end at ${f(st.vLip * KMH)} km/h` : final ? `stopped at ${f(st.s, 1)} m` : "running…";
  $("read").innerHTML =
    tile("Top of the slope → end lip", st.tLip != null ? f(st.tLip, 1) : "—", st.tLip != null ? "s" : "", ended) +
    tile("Leaving the turns", st.vTurnsEnd != null ? f(st.vTurnsEnd * KMH) : "—", "km/h", "our riders ≈ 6 · the cop ≈ 13") +
    tile("Out of the tube", st.vMouth != null ? f(st.vMouth * KMH) : "—", "km/h", st.wallAtMouth != null ? `${f(Math.abs(st.wallAtMouth), 0)}° up the wall` : "") +
    tile("Body twisted", f(st.rollMax * 57.3, 0), "°", st.rollAtMouth != null ? `${f(Math.abs(st.rollAtMouth), 0)}° at the tube mouth` : "");
  hist.push([st.s, sim.com().v * KMH]);
  drawChart();
}
const REF_COL = { normal: "#e07b39", suit: "#3a78c2", rain: "#2a9d8f", cop: "#c98500" };
function drawChart() {
  const svg = $("chart"), Wd = svg.clientWidth || 600, Hd = 240, M = { l: 40, r: 10, t: 12, b: 30 };
  const XM = GEO.S_LIP + 0.5, X = s => M.l + Math.min(s, XM) / XM * (Wd - M.l - M.r), Y = v => Hd - M.b - Math.min(v, 30) / 30 * (Hd - M.t - M.b);
  svg.setAttribute("viewBox", `0 0 ${Wd} ${Hd}`);
  let g = `<rect x="${X(GEO.S_RT)}" y="${M.t}" width="${X(GEO.S_LT1) - X(GEO.S_RT)}" height="${Hd - M.t - M.b}" fill="${css("--grid")}" opacity="0.7"/>
    <text x="${(X(GEO.S_RT) + X(GEO.S_LT1)) / 2}" y="${M.t + 11}" fill="${css("--text-faint")}" font-size="10" text-anchor="middle">turns</text>
    <line x1="${X(GEO.S_MOUTH)}" x2="${X(GEO.S_MOUTH)}" y1="${M.t}" y2="${Hd - M.b}" stroke="${css("--text-faint")}" stroke-dasharray="3 3"/>
    <text x="${X(GEO.S_MOUTH) + 3}" y="${M.t + 11}" fill="${css("--text-faint")}" font-size="10">tube mouth</text>`;
  for (const v of [0, 10, 20, 30]) g += `<line x1="${M.l}" x2="${Wd - M.r}" y1="${Y(v)}" y2="${Y(v)}" stroke="${css("--grid")}"/><text x="${M.l - 5}" y="${Y(v) + 4}" fill="${css("--text-faint")}" font-size="10" text-anchor="end">${v}</text>`;
  for (const s of [0, 4, 8, 12]) g += `<text x="${X(s)}" y="${Hd - 12}" fill="${css("--text-faint")}" font-size="10" text-anchor="middle">${s} m</text>`;
  if (SW) for (const [k, p] of Object.entries(SW.whole.clothes)) {
    p = p.filter(q => q[1] <= XM); if (!p.length) continue;
    g += `<path d="M${p.map(q => X(q[1]).toFixed(1) + "," + Y(q[2]).toFixed(1)).join("L")}" fill="none" stroke="${REF_COL[k]}" stroke-width="1.4" opacity="0.8"/>`;
    const q = p[Math.floor(p.length * (k === "rain" ? 0.85 : k === "suit" ? 0.92 : 0.6))];
    g += `<text x="${X(q[1])}" y="${Y(q[2]) - 5}" fill="${REF_COL[k]}" font-size="10.5" font-weight="600" text-anchor="middle">${CLOTHES[k].label.split(" (")[0]}</text>`;
  }
  if (hist.length > 1) g += `<path d="M${hist.filter(h => h[0] <= XM).map(h => X(h[0]).toFixed(1) + "," + Y(h[1]).toFixed(1)).join("L")}" fill="none" stroke="#e0453a" stroke-width="3"/>`;
  g += `<text x="${(M.l + Wd - M.r) / 2}" y="${Hd - 1}" fill="${css("--text-dim")}" font-size="11" text-anchor="middle">distance down the slide · thin lines: each clothes setting with the riders' push · red: your run</text>`;
  svg.innerHTML = g;
}
function run() {
  if (!RAP) return;
  const c = CLOTHES[$("cl").value];
  sim = createSim(RAP, { v0: +$("push").value / KMH, mu: c.mu, muTurns: c.muTurns, tone: c.tone, posture: $("pos").value, s0: S_START });
  hist = []; buildMeshes(); const F = frameAt(S_START); camT.set(...F.o); sync(); readouts(false); acc = 0;
  $("clNote").textContent = `friction ${c.muTurns.toFixed(2)} in the turns, ${c.mu.toFixed(2)} on the last straight · ${c.note}`;
}
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (sim && !sim.state().done) { acc += dt * rate; const n = Math.floor(acc / sim.world.timestep); acc -= n * sim.world.timestep; sim.step(n); sync(); readouts(sim.state().done); }
  else if (sim && camMode === "overview") sync();
  ren.render(scene, cam);
}
$("pushVal").textContent = (+$("push").value).toFixed(1) + " km/h";
$("push").addEventListener("input", () => { $("pushVal").textContent = (+$("push").value).toFixed(1) + " km/h"; });
["push", "pos", "cl"].forEach(id => $(id).addEventListener("change", run));
$("go").addEventListener("click", run);
document.querySelectorAll("[data-rate]").forEach(b => b.addEventListener("click", () => { rate = +b.dataset.rate; document.querySelectorAll("[data-rate]").forEach(x => x.classList.toggle("active", x === b)); }));
document.querySelectorAll("[data-cam]").forEach(b => b.addEventListener("click", () => { camMode = b.dataset.cam; document.querySelectorAll("[data-cam]").forEach(x => x.classList.toggle("active", x === b)); }));
window.addEventListener("resize", () => { ren.setSize(W(), H()); cam.aspect = W() / H(); cam.updateProjectionMatrix(); drawChart(); });
fetch("data/body_sweeps.json?v=" + (window.V || "")).then(r => r.ok ? r.json() : null).then(d => { SW = d; if (d && d.clothes.rain) { CLOTHES.rain.mu = CLOTHES.rain.muTurns = d.clothes.rain.mu; } drawChart(); }).catch(() => { });
RAPIER.init().then(() => { RAP = RAPIER; const q = new URLSearchParams(location.search); if (q.get("clothes")) $("cl").value = q.get("clothes"); if (q.get("pos")) $("pos").value = q.get("pos"); run(); requestAnimationFrame(t => { last = t; loop(t); }); })
  .catch(e => { host.innerHTML = `<p class="notes">Physics engine failed to load (${e.message}).</p>`; });
