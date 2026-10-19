/* 3-D view of the full-body physics on the Launch page (three.js r128 is loaded globally as THREE). */
import RAPIER from "https://cdn.jsdelivr.net/npm/@dimforge/rapier3d-compat@0.14.0/rapier.es.js";
import { createSim, slideMesh, pointModel, POSTURES, GEO, at, sOfX } from "./body_sim.js?v=1";

const $ = id => document.getElementById(id);
const KMH = 3.6, COP_T = 0.70;
const host = $("view");
const W = () => host.clientWidth, H = () => host.clientHeight;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1b2128);
const cam = new THREE.PerspectiveCamera(42, W() / H(), 0.05, 100);
const ren = new THREE.WebGLRenderer({ antialias: true });
ren.setPixelRatio(Math.min(2, window.devicePixelRatio)); ren.setSize(W(), H()); host.innerHTML = ""; host.appendChild(ren.domElement);
scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 0.85));
const sun = new THREE.DirectionalLight(0xffffff, 0.75); sun.position.set(2, 6, 5); scene.add(sun);

// slide (same mesh the physics uses) and playground
{
  const add = (part, mat) => { const m = slideMesh(true, part), g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(m.vertices, 3)); g.setIndex(new THREE.BufferAttribute(m.indices, 1)); g.computeVertexNormals();
    scene.add(new THREE.Mesh(g, mat)); };
  add("floor", new THREE.MeshStandardMaterial({ color: 0xb9c3cc, metalness: 0.7, roughness: 0.35, side: THREE.DoubleSide }));
  add("roof", new THREE.MeshStandardMaterial({ color: 0x8e99a3, metalness: 0.5, roughness: 0.4, side: THREE.DoubleSide, transparent: true, opacity: 0.18, depthWrite: false }));
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 16), new THREE.MeshStandardMaterial({ color: 0x8a5a4e, roughness: 0.95 }));
  ground.rotation.x = -Math.PI / 2; ground.position.set(4, 0, 0); scene.add(ground);
  const [xm, ym] = at(GEO.S_MOUTH);   // tube-mouth ring
  const ring = new THREE.Mesh(new THREE.TorusGeometry(GEO.R, 0.015, 8, 40), new THREE.MeshStandardMaterial({ color: 0x8e99a3 }));
  ring.position.set(xm + Math.sin(GEO.TH) * GEO.R, ym + Math.cos(GEO.TH) * GEO.R, 0); ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(Math.cos(GEO.TH), -Math.sin(GEO.TH), 0)); scene.add(ring);
}

let RAP = null, sim = null, meshes = {}, rate = 0.5, acc = 0, last = 0, camT = new THREE.Vector3();
const COLORS = { head: 0xd9a888, torso: 0x1d2533, pelvis: 0x1d2533 };
function buildMeshes() {
  Object.values(meshes).forEach(m => scene.remove(m)); meshes = {};
  for (const [k, rb] of Object.entries(sim.bodies)) {
    const c = rb.collider(0), sh = c.shape;
    const geo = sh.radius !== undefined && sh.halfExtents === undefined ? new THREE.SphereGeometry(sh.radius, 16, 12)
      : new THREE.BoxGeometry(sh.halfExtents.x * 2, sh.halfExtents.y * 2, sh.halfExtents.z * 2);
    const col = COLORS[k] ?? (k.startsWith("shin") ? 0x2a3550 : k.startsWith("farm") ? 0xd9a888 : 0x24304a);
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: col, roughness: 0.7 }));
    if (k === "torso") {   // hi-vis vest on the back, like the cop
      const v = new THREE.Mesh(new THREE.BoxGeometry(sh.halfExtents.x * 1.6, sh.halfExtents.y * 2.1, sh.halfExtents.z * 1.9), new THREE.MeshStandardMaterial({ color: 0xc8f02a }));
      m.add(v);
    }
    scene.add(m); meshes[k] = m;
  }
}
function sync() {
  for (const [k, rb] of Object.entries(sim.bodies)) {
    const t = rb.translation(), q = rb.rotation();
    meshes[k].position.set(t.x, t.y, t.z); meshes[k].quaternion.set(q.x, q.y, q.z, q.w);
  }
  const c = sim.com();
  camT.lerp(new THREE.Vector3(c.x, c.y, 0), 0.15);
  cam.position.set(camT.x - 0.9, camT.y + 1.05, 1.55); cam.lookAt(camT);
}
function readouts(final) {
  const st = sim.state(), f = (x, d = 2) => x == null ? "—" : x.toFixed(d);
  const tml = st.tLip != null && st.tMouth != null ? st.tLip - st.tMouth : null;
  const pm = st.vMouth != null ? pointModel(st.vMouth, sim.params.mu) : null;
  const tile = (tl, tv, tu, tn = "") => `<div class="tile"><div class="tl">${tl}</div><div class="tv">${tv}<span class="tu">${tu}</span></div><div class="tn">${tn}</div></div>`;
  $("bodyRead").innerHTML =
    tile("Tube mouth → lip (body)", f(tml), tml != null ? "s" : "", tml != null ? (tml <= COP_T + 0.067 ? "as fast as the cop (0.70 s)" : `${f(tml - COP_T)} s slower than the cop`) + (pm && pm.t ? ` · point model ${f(pm.t)} s` : "") : (final ? "did not reach the lip" : "running…")) +
    tile("Speed off the lip", st.vLip != null ? f(st.vLip * KMH, 1) : "—", "km/h", st.vMouth != null ? `in at the mouth ${f(st.vMouth * KMH, 1)} km/h` : "") +
    tile("Body rolled", f(st.rollMax * 57.3, 0), "°", `head hits on the walls: ${st.headHits}` + (st.headHits ? ` (up to ${f(st.headMaxKmh, 0)} km/h)` : "")) +
    tile("Slid on the playground", st.restX != null && st.landX != null ? f(st.restX - st.landX, 1) : "—", "m", st.landX != null ? `landed ${f(st.landX, 1)} m past the lip` : "");
}
function run() {
  if (!RAP) return;
  const v = +$("sV").value / KMH;
  sim = createSim(RAP, { v0: v, mu: +$("sM").value, muGround: +$("sG").value, posture: $("sP").value,
                         spin: +$("sS").value * 2 * Math.PI, s0: GEO.S_MOUTH - 0.25 });
  buildMeshes(); camT.set(...(() => { const c = sim.com(); return [c.x, c.y, 0]; })()); sync(); readouts(false); acc = 0;
}
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (sim && !sim.state().done) {
    acc += dt * rate;
    const n = Math.floor(acc / sim.world.timestep); acc -= n * sim.world.timestep;
    sim.step(n); sync(); readouts(sim.state().done);
  }
  ren.render(scene, cam);
}
window.addEventListener("resize", () => { ren.setSize(W(), H()); cam.aspect = W() / H(); cam.updateProjectionMatrix(); });
$("slow").addEventListener("click", () => { rate = 0.25; });
$("real").addEventListener("click", () => { rate = 1.0; });

RAPIER.init().then(() => {
  RAP = RAPIER;
  window.BODY = { run };
  const start = () => run();
  if (window.LAUNCH_READY) start(); else setTimeout(start, 600);
  requestAnimationFrame(t => { last = t; loop(t); });
}).catch(e => { host.innerHTML = `<p class="notes">Physics engine failed to load (${e.message}).</p>`; });
