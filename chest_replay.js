/* Analysis page: a ride's chest-camera video (left) next to the simulated rider's view (right), synced at the tube mouth.
   Markers appear on the video as the ride passes the first turn, the second turn, the tube mouth and the end: turn starts
   from the chest camera's own gyro, the mouth from its picture, the end (not visible to it) from the synced simulation.
   page.js dispatches a "ride-selected" event with the run id; rides without a chest replay hide the panel. */
import { slideMesh, GEO, frameAt, sNear } from "./launch/body_sim.js?v=5";

const $ = id => document.getElementById(id);
const CHEST = { 39: "P14", 24: "P02" };       // run id -> replay case
let R = null, CUR = null, raf = 0, three = null, RATE = 0.5;

function initThree() {
  const host = $("chView"), W = host.clientWidth, H = host.clientHeight;
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x101418);
  const cam = new THREE.PerspectiveCamera(75, W / H, 0.02, 100);   // wide, like the GoPro
  const ren = new THREE.WebGLRenderer({ antialias: true }); ren.setPixelRatio(Math.min(2, devicePixelRatio)); ren.setSize(W, H);
  host.innerHTML = ""; host.appendChild(ren.domElement);
  scene.add(new THREE.HemisphereLight(0xdfe8ef, 0x223344, 0.18));
  const lamp = new THREE.PointLight(0xa58cff, 0.9, 3.0); scene.add(lamp);      // the rider's leg LEDs light the tube at night
  const add = (part, mat) => { const m = slideMesh(GEO.S0, GEO.S_LIP, part), g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(m.vertices, 3)); g.setIndex(new THREE.BufferAttribute(m.indices, 1)); g.computeVertexNormals(); scene.add(new THREE.Mesh(g, mat)); };
  add("floor", new THREE.MeshStandardMaterial({ color: 0x5d646b, metalness: 0.5, roughness: 0.3, side: THREE.DoubleSide }));
  add("roof", new THREE.MeshStandardMaterial({ color: 0x3f454b, metalness: 0.5, roughness: 0.35, side: THREE.DoubleSide }));
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ color: 0x8a7f74, roughness: 0.95 }));
  ground.rotation.x = -Math.PI / 2; scene.add(ground);
  for (let i = 0; i < 14; i++) { const l = new THREE.PointLight(0xfff1d6, 0.6, 14); const F = frameAt(GEO.S_LIP); l.position.set(F.o[0] + (i % 7 - 3) * 3, 5, F.o[2] + (i < 7 ? 6 : -6)); scene.add(l); }   // plaza lights
  three = { scene, cam, ren, lamp, meshes: [], s: GEO.S0 };
}
function buildBody(c) {
  three.meshes.forEach(m => three.scene.remove(m)); three.meshes = [];
  const SIZES = { head: [0.105], torso: [0.25, 0.105, 0.19], pelvis: [0.11, 0.10, 0.17], thigh: [0.21, 0.075, 0.075], shin: [0.23, 0.055, 0.055], uarm: [0.14, 0.045, 0.045], farm: [0.14, 0.04, 0.04] };
  for (const p of c.parts) {
    const s = SIZES[p.replace(/[LR]$/, "")], geo = s.length === 1 ? new THREE.SphereGeometry(s[0], 16, 12) : new THREE.BoxGeometry(s[0] * 2, s[1] * 2, s[2] * 2);
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: p.startsWith("shin") ? 0x6b6f8a : p === "head" ? 0xd9a888 : 0x3a4f6e, roughness: 0.7 }));
    m.visible = !/^(head|torso|pelvis|uarm|farm)/.test(p);   // a chest camera sees the legs and the slide ahead
    three.scene.add(m); three.meshes.push(m);
  }
}
function poseAt(c, t) {
  const F = c.frames; let i = 1; while (i < F.length - 1 && F[i][0] < t) i++;
  const a = F[i - 1], b = F[i], f = Math.max(0, Math.min(1, (t - a[0]) / (b[0] - a[0] || 1)));
  three.meshes.forEach((m, k) => {
    const o = 1 + 7 * k, L = j => a[o + j] + (b[o + j] - a[o + j]) * f;
    m.position.set(L(0), L(1), L(2));
    m.quaternion.copy(new THREE.Quaternion(a[o + 3], a[o + 4], a[o + 5], a[o + 6]).slerp(new THREE.Quaternion(b[o + 3], b[o + 4], b[o + 5], b[o + 6]), f));
  });
  const head = three.meshes[c.parts.indexOf("head")].position, torso = three.meshes[c.parts.indexOf("torso")].position;
  three.s = sNear([torso.x, torso.y, torso.z], three.s);
  // chest camera: at the upper chest, looking down the slide past the legs
  const Fh = frameAt(Math.min(three.s, GEO.S_LIP)), n = new THREE.Vector3(...Fh.n), tg = new THREE.Vector3(...Fh.t);
  const eye = torso.clone().addScaledVector(n, 0.2).addScaledVector(tg, 0.05), F2 = frameAt(Math.min(three.s + 1.6, GEO.S_LIP));
  three.cam.position.copy(eye); three.cam.lookAt(F2.o[0] + F2.n[0] * GEO.R * 0.5, F2.o[1] + F2.n[1] * GEO.R * 0.5, F2.o[2] + F2.n[2] * GEO.R * 0.5);
  const legs = three.meshes[c.parts.indexOf("shinL")]?.position; three.lamp.position.copy(legs || eye);   // LEDs on the legs
  three.ren.render(three.scene, three.cam);
}
function marker(c, vt) {
  const ev = c.chest.events, el = $("chMark");
  let cur = null; for (const e of ev) if (vt >= e[0] && vt < e[0] + 1.3) cur = e;
  el.style.opacity = cur ? 1 : 0;
  if (cur) el.innerHTML = `${cur[1]}<small>${cur[2]}</small>`;
  $("chTimeline").innerHTML = ev.map(e => `<span class="${vt >= e[0] ? "on" : ""}">${e[1]} <i>${e[0].toFixed(2)} s</i></span>`).join("");
}
function show(name) {
  CUR = name; const c = R.cases[name], v = $("chVideo"); cancelAnimationFrame(raf);
  v.src = c.chest.media + "?v=" + R.v; v.playbackRate = RATE; v.load(); v.onloadedmetadata = () => { v.currentTime = 0; v.playbackRate = RATE; v.play().catch(() => {}); };
  buildBody(c); three.s = GEO.S0;
  const tick = () => {
    const simT = v.currentTime - c.sync.video_t + c.sync.sim_t;
    poseAt(c, simT); marker(c, v.currentTime);
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
}
document.querySelectorAll(".chR").forEach(b => b.addEventListener("click", () => { RATE = +b.dataset.r; $("chVideo").playbackRate = RATE;
  document.querySelectorAll(".chR").forEach(x => x.classList.toggle("active", x === b)); }));
const ready = fetch("launch/replays.json?v=" + (window.V || "")).then(r => r.json()).then(d => { R = d; });
function pick(name) {
  document.querySelectorAll(".chP").forEach(b => b.classList.toggle("active", b.dataset.n === name));
  ready.then(() => { if (!three) initThree(); if (R.cases[name] && R.cases[name].chest) show(name); });
}
document.querySelectorAll(".chP").forEach(b => b.addEventListener("click", () => pick(b.dataset.n)));
// always on, P02 by default; picking P02 or P14 in the ranking switches it
window.addEventListener("ride-selected", e => { const name = CHEST[e.detail]; if (name && name !== CUR) pick(name); });
pick("P02");
