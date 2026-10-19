/* Full-body physics of the slide from the top of the turns to the playground:
   right turn (120°, 2.35 m) → left turn (45°, 1.00 m) → covered lower straight → tube mouth (8.80 m) →
   open trough → bend → flat → lip (12.75 m, 0.55 m above the ground) → flight → playground.
   Engine: Rapier 3-D 0.14 (contacts with Coulomb friction from the real normal forces).
   Rider: 11-part ragdoll (head, torso, pelvis, 2 × thigh/shin/upper arm/forearm), 75 kg, joint limits,
   and optional muscle tone (PD springs holding the starting posture; 0 = limp, 1 = tense).
   Friction: clothes–steel μ in the turns (s < 7.05 m) and μ on the lower straight + flat, separately;
   body–ground μg (rubber playground). Geometry as analysis/track.py (turn sweeps estimated from the gyro).
   Runs in the browser and in Node: createSim(RAPIER, params) → { step(n), state(), com(), bodies, ... }. */

export const GEO = { TH: 30 * Math.PI / 180, S_RT: 3.70, S_RT1: 6.05, S_LT1: 7.05, S_MOUTH: 8.80, S_B0: 11.05, S_B1: 11.45,
  S_LIP: 12.75, R: 0.375, LIP_H: 0.55, S0: 3.20, SWEEP_R: -120 * Math.PI / 180, SWEEP_L: 45 * Math.PI / 180 };
const G = GEO, { TH, S_MOUTH, S_B0, S_B1, S_LIP, R, LIP_H } = GEO;
export const pitch = s => s < S_B0 ? TH : s < S_B1 ? TH * (1 - (s - S_B0) / (S_B1 - S_B0)) : 0;
const yawRate = s => s >= G.S_RT && s < G.S_RT1 ? G.SWEEP_R / (G.S_RT1 - G.S_RT) : s >= G.S_RT1 && s < G.S_LT1 ? G.SWEEP_L / (G.S_LT1 - G.S_RT1) : 0;

/* path table: bottom-of-trough point o, tangent t, normal n (slide "up"), side b = t × n; y up, yaw + = left */
const DS = 0.005;
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = a => { const l = Math.hypot(...a); return a.map(x => x / l); };
const PATH = (() => {
  const out = []; let o = [0, 0, 0], psi = 0;
  for (let s = G.S0; s <= S_LIP + 1e-9; s += DS) {
    const p = pitch(s), t = [Math.cos(p) * Math.cos(psi), -Math.sin(p), -Math.cos(p) * Math.sin(psi)];
    const n = norm([0, 1, 0].map((u, i) => u - t[1] * t[i])), b = cross(t, n);
    out.push({ s, o: o.slice(), t, n, b });
    const pm = pitch(s + DS / 2), ym = psi + yawRate(s + DS / 2) * DS / 2;
    o = [o[0] + Math.cos(pm) * Math.cos(ym) * DS, o[1] - Math.sin(pm) * DS, o[2] - Math.cos(pm) * Math.sin(ym) * DS];
    psi += yawRate(s + DS / 2) * DS;
  }
  const L = out[out.length - 1].o.slice();
  for (const q of out) q.o = [q.o[0] - L[0], q.o[1] - L[1] + LIP_H, q.o[2] - L[2]];   // lip at (0, LIP_H, 0)
  return out;
})();
export const frameAt = s => {
  const i = Math.max(0, Math.min(PATH.length - 2, Math.floor((s - G.S0) / DS))), A = PATH[i], B = PATH[i + 1], f = (s - A.s) / DS;
  const mix = (a, b) => a.map((x, k) => x + (b[k] - x) * f);
  return { s, o: mix(A.o, B.o), t: norm(mix(A.t, B.t)), n: norm(mix(A.n, B.n)), b: norm(mix(A.b, B.b)) };
};
export const LIP = PATH[PATH.length - 1];
/* arc length of the point nearest to p, searched around a hint (keeps track through the turns) */
export function sNear(p, hint = G.S0) {
  const d = q => { const v = [p[0] - q.o[0] - q.n[0] * R, p[1] - q.o[1] - q.n[1] * R, p[2] - q.o[2] - q.n[2] * R]; return dot(v, v); };   // to the trough axis
  if (hint >= S_LIP) { const L = PATH[PATH.length - 1]; return S_LIP + Math.max(0, dot([p[0] - L.o[0], p[1] - L.o[1], p[2] - L.o[2]], L.t)); }
  const N = PATH.length - 1, i0 = Math.min(N, Math.max(0, Math.floor((hint - 0.6 - G.S0) / DS))), i1 = Math.min(N, Math.ceil((hint + 0.8 - G.S0) / DS));
  let best = i0;
  for (let i = i0; i <= i1; i++) if (d(PATH[i]) < d(PATH[best])) best = i;
  const q = PATH[best], along = dot([p[0] - q.o[0], p[1] - q.o[1], p[2] - q.o[2]], q.t);
  return best === PATH.length - 1 ? S_LIP + Math.max(0, along) : q.s + Math.max(-DS, Math.min(DS, along));
}

/* slide surface between s0 and s1: trough floor + walls (±92°) and, inside the tube, the roof */
export function slideMesh(s0 = G.S0, s1 = S_LIP, part = "all") {
  const V = [], I = [];
  const strip = (sList, a0, a1, na) => {
    const base = V.length / 3;
    for (const s of sList) {
      const F = frameAt(s);
      for (let j = 0; j <= na; j++) {
        const a = a0 + (a1 - a0) * j / na, k = R * (1 - Math.cos(a)), m = R * Math.sin(a);
        V.push(F.o[0] + F.n[0] * k + F.b[0] * m, F.o[1] + F.n[1] * k + F.b[1] * m, F.o[2] + F.n[2] * k + F.b[2] * m);
      }
    }
    for (let i = 0; i < sList.length - 1; i++) for (let j = 0; j < na; j++) {
      const a = base + i * (na + 1) + j, b = a + na + 1; I.push(a, a + 1, b, b, a + 1, b + 1);
    }
  };
  const step = s => (s >= S_B0 - 0.05 && s < S_B1 + 0.05) ? 0.02 : (s < G.S_LT1 ? 0.04 : 0.05);
  const list = (a, b) => { const o = []; for (let s = a; s < b - 1e-9; s += step(s)) o.push(s); o.push(b); return o; };
  if (part !== "roof") strip(list(s0, s1), -1.6, 1.6, 36);
  const r1 = Math.min(s1, S_MOUTH);
  if (part !== "floor" && r1 > s0 + 1e-6) strip(list(s0, r1), 1.6, 2 * Math.PI - 1.6, 24);
  return { vertices: new Float32Array(V), indices: new Uint32Array(I) };
}

/* ragdoll parts in the body frame: x toward the feet, y out of the belly (anterior), z to the left */
export const PARTS = {
  head: { ball: 0.105, m: 5.5 }, torso: { box: [0.25, 0.105, 0.19], m: 28 }, pelvis: { box: [0.11, 0.10, 0.17], m: 11 },
  thighL: { box: [0.21, 0.075, 0.075], m: 8 }, thighR: { box: [0.21, 0.075, 0.075], m: 8 },
  shinL: { box: [0.23, 0.055, 0.055], m: 4.4 }, shinR: { box: [0.23, 0.055, 0.055], m: 4.4 },
  uarmL: { box: [0.14, 0.045, 0.045], m: 2.1 }, uarmR: { box: [0.14, 0.045, 0.045], m: 2.1 },
  farmL: { box: [0.14, 0.04, 0.04], m: 1.5 }, farmR: { box: [0.14, 0.04, 0.04], m: 1.5 },
};
export const POSTURES = {
  back:    { label: "lying on the back", roll: 0, spine: 0, knee: 0, arm: 0.05, elbow: 0 },
  sitting: { label: "sitting up", roll: 0, spine: -0.85, knee: 0, arm: 1.0, elbow: -0.3 },
  belly:   { label: "on the belly, legs straight", roll: Math.PI, spine: 0, knee: 0, arm: 0.05, elbow: 0 },
  cop:     { label: "the cop: on the belly, legs up", roll: Math.PI, spine: 0.15, knee: -1.45, arm: 0.1, elbow: -0.6 },
  side:    { label: "on the side", roll: Math.PI / 2, spine: 0, knee: -0.3, arm: 0.2, elbow: -0.4 },
};
function pose(P) {
  const rot = (a, v) => [v[0] * Math.cos(a) - v[1] * Math.sin(a), v[0] * Math.sin(a) + v[1] * Math.cos(a), v[2]];
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const out = {}, J = {};
  out.pelvis = { c: [0, 0, 0], a: 0 };
  J.spine = [-0.12, 0, 0];
  out.torso = { c: add(J.spine, rot(P.spine, [-0.25, 0, 0])), a: P.spine };
  J.neck = add(J.spine, rot(P.spine, [-0.52, 0, 0]));
  out.head = { c: add(J.spine, rot(P.spine, [-0.64, 0, 0])), a: P.spine };
  for (const [k, z] of [["L", 0.215], ["R", -0.215]]) {
    J["shoulder" + k] = add(J.spine, rot(P.spine, [-0.45, 0, z]));
    const aa = P.spine + P.arm;
    out["uarm" + k] = { c: add(J["shoulder" + k], rot(aa, [0.14, 0, 0])), a: aa };
    J["elbow" + k] = add(J["shoulder" + k], rot(aa, [0.28, 0, 0]));
    out["farm" + k] = { c: add(J["elbow" + k], rot(aa + P.elbow, [0.14, 0, 0])), a: aa + P.elbow };
  }
  for (const [k, z] of [["L", 0.095], ["R", -0.095]]) {
    J["hip" + k] = [0.08, 0, z];
    out["thigh" + k] = { c: add(J["hip" + k], [0.21, 0, 0]), a: 0 };
    J["knee" + k] = add(J["hip" + k], [0.42, 0, 0]);
    out["shin" + k] = { c: add(J["knee" + k], rot(P.knee, [0.23, 0, 0])), a: P.knee };
  }
  return { parts: out, joints: J };
}

/* quaternions {x,y,z,w} */
const qz = a => ({ x: 0, y: 0, z: Math.sin(a / 2), w: Math.cos(a / 2) });
const qx = a => ({ x: Math.sin(a / 2), y: 0, z: 0, w: Math.cos(a / 2) });
const qmul = (a, b) => ({ w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z, x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
  y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x, z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w });
const qinv = q => ({ x: -q.x, y: -q.y, z: -q.z, w: q.w });
export const qrot = (q, v) => { const u = [q.x, q.y, q.z], s = q.w, d = dot(u, v), uu = dot(u, u), c = cross(u, v);
  return [0, 1, 2].map(i => 2 * d * u[i] + (s * s - uu) * v[i] + 2 * s * c[i]); };
function qFromBasis(t, n, b) {   // rotation taking x → t, y → n, z → b
  const m = [[t[0], n[0], b[0]], [t[1], n[1], b[1]], [t[2], n[2], b[2]]], tr = m[0][0] + m[1][1] + m[2][2];
  if (tr > 0) { const S = Math.sqrt(tr + 1) * 2; return { w: S / 4, x: (m[2][1] - m[1][2]) / S, y: (m[0][2] - m[2][0]) / S, z: (m[1][0] - m[0][1]) / S }; }
  if (m[0][0] > m[1][1] && m[0][0] > m[2][2]) { const S = Math.sqrt(1 + m[0][0] - m[1][1] - m[2][2]) * 2; return { w: (m[2][1] - m[1][2]) / S, x: S / 4, y: (m[0][1] + m[1][0]) / S, z: (m[0][2] + m[2][0]) / S }; }
  if (m[1][1] > m[2][2]) { const S = Math.sqrt(1 + m[1][1] - m[0][0] - m[2][2]) * 2; return { w: (m[0][2] - m[2][0]) / S, x: (m[0][1] + m[1][0]) / S, y: S / 4, z: (m[1][2] + m[2][1]) / S }; }
  const S = Math.sqrt(1 + m[2][2] - m[0][0] - m[1][1]) * 2; return { w: (m[1][0] - m[0][1]) / S, x: (m[0][2] + m[2][0]) / S, y: (m[1][2] + m[2][1]) / S, z: S / 4 };
}

export function createSim(RAPIER, prm) {
  const p = Object.assign({ v0: 1.6, mu: 0.25, muTurns: null, muGround: 0.8, posture: "back", spin: 0, tone: 0.3, s0: 3.35 }, prm);
  if (p.muTurns == null) p.muTurns = p.mu;
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = 1 / 240;
  world.integrationParameters.numSolverIterations = 8;
  const RULE = RAPIER.CoefficientCombineRule.Multiply, FLAGS = RAPIER.TriMeshFlags ? RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES : undefined;
  const fixed = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  const addMesh = (s0, s1, mu) => { const m = slideMesh(s0, s1);
    world.createCollider(RAPIER.ColliderDesc.trimesh(m.vertices, m.indices, FLAGS).setFriction(mu).setFrictionCombineRule(RULE).setRestitution(0.05), fixed); };
  addMesh(G.S0, G.S_LT1, p.muTurns);
  addMesh(G.S_LT1, S_LIP, p.mu);
  const ground = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.05, 0));
  world.createCollider(RAPIER.ColliderDesc.cuboid(40, 0.05, 40).setFriction(p.muGround).setFrictionCombineRule(RULE).setRestitution(0.1), ground);

  // posture → placement at s0, lifted so every corner is inside the tube
  const P = POSTURES[p.posture] || POSTURES.back, K = pose(P), qroll = qx(P.roll);
  let y0 = 0;
  for (const [k, def] of Object.entries(PARTS)) {
    const pr = K.parts[k], q = qmul(qroll, qz(pr.a)), h = def.ball ? [def.ball, def.ball, def.ball] : def.box, c = qrot(qroll, pr.c);
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
      const d = qrot(q, [sx * h[0], sy * h[1], sz * h[2]]), y = c[1] + d[1], z = c[2] + d[2], lim = R - 0.01;
      y0 = Math.max(y0, R - y - Math.sqrt(Math.max(0, lim * lim - z * z)));
    }
  }
  const F = frameAt(p.s0), qslide = qFromBasis(F.t, F.n, F.b);
  const toWorld = v => [0, 1, 2].map(i => F.o[i] + F.t[i] * v[0] + F.n[i] * (v[1] + y0) + F.b[i] * v[2]);
  const bodies = {}, mass = {};
  let M = 0;
  for (const [k, def] of Object.entries(PARTS)) {
    const pr = K.parts[k], q = qmul(qslide, qmul(qroll, qz(pr.a))), c = toWorld(qrot(qroll, pr.c));
    const rb = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(...c).setRotation(q).setCcdEnabled(true)
      .setLinvel(F.t[0] * p.v0, F.t[1] * p.v0, F.t[2] * p.v0).setAngvel({ x: F.t[0] * p.spin, y: F.t[1] * p.spin, z: F.t[2] * p.spin })
      .setAngularDamping(0.3));
    const cd = def.ball ? RAPIER.ColliderDesc.ball(def.ball) : RAPIER.ColliderDesc.cuboid(...def.box);
    world.createCollider(cd.setMass(def.m).setFriction(1.0).setFrictionCombineRule(RULE).setRestitution(0.05), rb);
    bodies[k] = rb; mass[k] = def.m; M += def.m;
  }
  const local = (k, wv) => { const pr = K.parts[k], q = qmul(qroll, qz(pr.a)), c = qrot(qroll, pr.c);
    const r = qrot(qinv(q), qrot(qroll, wv).map((x, i) => x - c[i])); return { x: r[0], y: r[1], z: r[2] }; };
  const springs = [];
  const joint = (a, b, jn, kind, lim, kmax) => {
    const jd = kind === "hinge" ? RAPIER.JointData.revolute(local(a, K.joints[jn]), local(b, K.joints[jn]), { x: 0, y: 0, z: 1 })
      : RAPIER.JointData.spherical(local(a, K.joints[jn]), local(b, K.joints[jn]));
    if (lim) { jd.limitsEnabled = true; jd.limits = lim; }
    const j = world.createImpulseJoint(jd, bodies[a], bodies[b], true);
    try { j.setContactsEnabled(false); } catch (e) { }
    springs.push({ a: bodies[a], b: bodies[b], rel: qmul(qinv(bodies[a].rotation()), bodies[b].rotation()), k: kmax * p.tone });
  };
  joint("torso", "head", "neck", "ball", null, 60);
  joint("pelvis", "torso", "spine", "hinge", [-1.2, 0.6], 400);
  for (const k of ["L", "R"]) {
    joint("pelvis", "thigh" + k, "hip" + k, "ball", null, 300);
    joint("thigh" + k, "shin" + k, "knee" + k, "hinge", [-2.4, 0.05], 150);
    joint("torso", "uarm" + k, "shoulder" + k, "ball", null, 60);
    joint("uarm" + k, "farm" + k, "elbow" + k, "hinge", [-2.4, 0.05], 30);
  }
  function applyTone() {   // muscle tone: PD torque pulling each joint back towards its starting angle
    if (p.tone <= 0) return;
    for (const rb of Object.values(bodies)) rb.resetTorques(true);
    for (const sp of springs) {
      const qa = sp.a.rotation(), qb = sp.b.rotation(), want = qmul(qa, sp.rel);
      let e = qmul(want, qinv(qb)); if (e.w < 0) e = { x: -e.x, y: -e.y, z: -e.z, w: -e.w };
      const s = Math.hypot(e.x, e.y, e.z), ang = 2 * Math.atan2(s, e.w), ax = s > 1e-9 ? [e.x / s, e.y / s, e.z / s] : [0, 0, 0];
      const wa = sp.a.angvel(), wb = sp.b.angvel(), c = 0.06 * sp.k, dw = [wb.x - wa.x, wb.y - wa.y, wb.z - wa.z];
      const tq = [0, 1, 2].map(i => sp.k * ang * ax[i] - c * dw[i]);
      sp.b.addTorque({ x: tq[0], y: tq[1], z: tq[2] }, true); sp.a.addTorque({ x: -tq[0], y: -tq[1], z: -tq[2] }, true);
    }
  }

  // ---------------------------------------------------------------- measurement
  const st = { t: 0, s: p.s0, tMouth: null, tLip: null, vMouth: null, vLip: null, vTurnsEnd: null, tTurnsEnd: null,
    headHits: 0, headMaxKmh: 0, lastHit: -1, rollPrev: null, rollAcc: 0, rollMax: 0, rollAtMouth: null, wallAtMouth: null,
    landX: null, restD: null, flying: false, done: false, path: [], frames: [] };
  const com = () => {
    let x = 0, y = 0, z = 0, vx = 0, vy = 0, vz = 0;
    for (const [k, rb] of Object.entries(bodies)) { const t = rb.translation(), v = rb.linvel(), m = mass[k];
      x += m * t.x; y += m * t.y; z += m * t.z; vx += m * v.x; vy += m * v.y; vz += m * v.z; }
    return { x: x / M, y: y / M, z: z / M, v: Math.hypot(vx, vy, vz) / M };
  };
  let landP = null;
  function measure() {
    const c = com(), s = sNear([c.x, c.y, c.z], st.s); st.s = s;
    const Fs = frameAt(Math.min(s, S_LIP));
    if (st.tTurnsEnd === null && s >= G.S_LT1) { st.tTurnsEnd = st.t; st.vTurnsEnd = c.v; }
    if (st.tMouth === null && s >= S_MOUTH) {
      st.tMouth = st.t; st.vMouth = c.v;
      const d = [c.x - Fs.o[0], c.y - Fs.o[1], c.z - Fs.o[2]];
      st.wallAtMouth = Math.atan2(dot(d, Fs.b), R - dot(d, Fs.n)) * 57.3;   // how far up the wall (deg, + = left)
    }
    if (st.tLip === null && s >= S_LIP) { st.tLip = st.t; st.vLip = c.v; st.flying = true; }
    if (s < S_LIP) {   // head hitting the walls (> 35° up from the bottom, moving outward > 0.8 m/s)
      const h = bodies.head.translation(), hv = bodies.head.linvel(), Fh = frameAt(Math.min(sNear([h.x, h.y, h.z], s), S_LIP));
      const ax = Fh.o.map((x, i) => x + Fh.n[i] * R), d = [h.x - ax[0], h.y - ax[1], h.z - ax[2]];
      const dn = dot(d, Fh.n), db = dot(d, Fh.b), rr = Math.hypot(dn, db), ang = Math.atan2(Math.abs(db), -dn);
      if (rr > R - PARTS.head.ball - 0.015 && ang > 0.6) {
        const vr = (dot([hv.x, hv.y, hv.z], Fh.n) * dn + dot([hv.x, hv.y, hv.z], Fh.b) * db) / (rr || 1);
        if (vr > 0.8 && st.t - st.lastHit > 0.15) { st.headHits++; st.lastHit = st.t; st.headMaxKmh = Math.max(st.headMaxKmh, vr * 3.6); }
      }
    }
    const qt = bodies.torso.rotation(), a = qrot(qt, [0, 1, 0]), r = Math.atan2(dot(a, Fs.b), dot(a, Fs.n));
    if (st.rollPrev !== null) { let dd = r - st.rollPrev; if (dd > Math.PI) dd -= 2 * Math.PI; if (dd < -Math.PI) dd += 2 * Math.PI; st.rollAcc += dd; }
    st.rollPrev = r; st.rollMax = Math.max(st.rollMax, Math.abs(st.rollAcc));
    if (st.tMouth !== null && st.rollAtMouth === null) st.rollAtMouth = st.rollAcc * 57.3;
    if (st.flying && landP === null) for (const rb of Object.values(bodies)) if (rb.translation().y < 0.16) { landP = [c.x, c.z]; st.landX = Math.hypot(c.x, c.z); break; }
    if (landP && c.v < 0.25 && st.restD === null) { st.restD = Math.hypot(c.x - landP[0], c.z - landP[1]); st.done = true; }
    if (st.t > 25) st.done = true;
    if (Math.round(st.t * 240) % 8 === 0) {   // 30 Hz record: time, s, speed, and every part's pose (for replays)
      st.path.push([st.t, s, c.v]);
      st.frames.push([st.t, ...Object.values(bodies).flatMap(rb => { const t = rb.translation(), q = rb.rotation(); return [t.x, t.y, t.z, q.x, q.y, q.z, q.w]; })]);
    }
  }
  return {
    world, bodies, params: p, parts: Object.keys(bodies),
    step(n = 1) { for (let i = 0; i < n && !st.done; i++) { applyTone(); world.step(); st.t += world.timestep; measure(); } },
    state: () => st, com,
  };
}

/* the point model of the last straight (analysis/laststraight.py), for comparison */
export function pointModel(v0, mu, s0 = S_MOUTH) {
  const g = 9.81, KAP = TH / (S_B1 - S_B0);
  let s = s0, v = v0, t = 0; const dt = 0.001;
  while (s < S_LIP && t < 20) {
    const th = pitch(s), k = s >= S_B0 && s < S_B1 ? KAP : 0;
    const a = g * Math.sin(th) - mu * (g * Math.cos(th) + v * v * k) - 0.5 * 1.2 * 0.12 * v * v / 75;
    if (v <= 0 && a <= 0) return { t: null, vExit: 0 };
    v = Math.max(0, v + a * dt); s += v * dt; t += dt;
  }
  return { t, vExit: v };
}
