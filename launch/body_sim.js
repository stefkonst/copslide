/* Full-body physics of the last straight (tube → open trough → flat → lip → flight → playground).
   Rigid-body engine: Rapier 3-D 0.14 (contacts + Coulomb friction from the actual normal forces).
   The rider is a 13-part ragdoll (head, torso, pelvis, 2 × thigh, shin, upper arm, forearm) joined by
   spherical / hinge joints; the slide is a smooth triangle mesh of the measured geometry.
   Works in the browser and in Node (validation): createSim(RAPIER, params) → { step(), state(), ... }.

   Geometry (same as analysis/laststraight.py): slope 30° to s = 11.05 m, eases to flat over 0.40 m,
   flat to the lip at 12.75 m, 0.55 m above the ground; trough radius 0.375 m; covered tube until 8.80 m.
   Body: 75 kg, segment sizes of an adult (≈ 1.80 m), mass split after anthropometric tables.
   Friction: clothes–steel μ (slider), body–ground μg (rubber playground, default 0.8). Restitution 0.05. */

export const GEO = { TH: 30 * Math.PI / 180, S_MOUTH: 8.80, S_B0: 11.05, S_B1: 11.45, S_LIP: 12.75, R: 0.375, LIP_H: 0.55, S_TUBE0: 7.6 };
const { TH, S_MOUTH, S_B0, S_B1, S_LIP, R, LIP_H, S_TUBE0 } = GEO;
export const pitch = s => s < S_B0 ? TH : s < S_B1 ? TH * (1 - (s - S_B0) / (S_B1 - S_B0)) : 0;

/* path table: s → bottom-of-trough point (x, y); z = 0 */
const DS = 0.005, PATH = (() => {
  const out = []; let x = 0, y = 0;
  for (let s = S_TUBE0; s <= S_LIP + 1e-9; s += DS) { out.push([s, x, y]); const th = pitch(s + DS / 2); x += Math.cos(th) * DS; y -= Math.sin(th) * DS; }
  const [, xl, yl] = out[out.length - 1];
  return out.map(([s, x, y]) => [s, x - xl, y - yl + LIP_H]);   // lip at x = 0, y = LIP_H
})();
export const at = s => {
  const i = Math.max(0, Math.min(PATH.length - 2, Math.floor((s - S_TUBE0) / DS))), f = (s - PATH[i][0]) / DS;
  return [PATH[i][1] + (PATH[i + 1][1] - PATH[i][1]) * f, PATH[i][2] + (PATH[i + 1][2] - PATH[i][2]) * f];
};
export const sOfX = x => {   // x is monotonic in s
  if (x >= 0) return S_LIP + x;
  let lo = 0, hi = PATH.length - 1;
  if (x <= PATH[0][1]) return S_TUBE0;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; PATH[m][1] < x ? lo = m : hi = m; }
  return PATH[lo][0] + (x - PATH[lo][1]) / (PATH[hi][1] - PATH[lo][1]) * DS;
};
const frameAt = s => { const th = pitch(s), [x, y] = at(s); return { o: [x, y, 0], t: [Math.cos(th), -Math.sin(th), 0], n: [Math.sin(th), Math.cos(th), 0] }; };

/* slide surface as one continuous triangle mesh: the trough floor and walls (±92°) all the way from inside
   the tube to the lip, plus the roof of the covered tube; triangles wound so normals face the rider */
export function slideMesh(flip = true, part = "all") {
  const V = [], I = [];
  const strip = (sList, a0, a1, na) => {
    const base = V.length / 3;
    for (const s of sList) {
      const F = frameAt(s);
      for (let j = 0; j <= na; j++) {
        const a = a0 + (a1 - a0) * j / na, cr = Math.cos(a), sr = Math.sin(a);
        V.push(F.o[0] + F.n[0] * R * (1 - cr), F.o[1] + F.n[1] * R * (1 - cr), R * sr);
      }
    }
    for (let i = 0; i < sList.length - 1; i++) for (let j = 0; j < na; j++) {
      const a = base + i * (na + 1) + j, b = a + na + 1;
      if (flip) I.push(a, a + 1, b, b, a + 1, b + 1); else I.push(a, b, a + 1, b, b + 1, a + 1);
    }
  };
  const sl = (a, b, d) => { const o = []; for (let s = a; s < b - 1e-9; s += d) o.push(s); o.push(b); return o; };
  const sAll = [...sl(S_TUBE0, S_B0, 0.05), ...sl(S_B0, S_B1, 0.02).slice(1), ...sl(S_B1, S_LIP, 0.05).slice(1)];
  if (part !== "roof") strip(sAll, -1.6, 1.6, 36);
  if (part !== "floor") strip(sl(S_TUBE0, S_MOUTH, 0.05), 1.6, 2 * Math.PI - 1.6, 24);
  return { vertices: new Float32Array(V), indices: new Uint32Array(I) };
}

/* ragdoll parts in the body frame: x toward the feet, y out of the belly (anterior), z to the left */
const PARTS = {          // half extents (or radius) and mass (kg)
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

/* forward kinematics of a posture: part → { c: centre, q: rotation about z (in-plane angle) }, joints */
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

/* quaternion helpers */
const qz = a => ({ x: 0, y: 0, z: Math.sin(a / 2), w: Math.cos(a / 2) });
const qx = a => ({ x: Math.sin(a / 2), y: 0, z: 0, w: Math.cos(a / 2) });
const qmul = (a, b) => ({ w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z, x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
  y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x, z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w });
const qrot = (q, v) => { const u = [q.x, q.y, q.z], s = q.w, d = u[0] * v[0] + u[1] * v[1] + u[2] * v[2], uu = u[0] * u[0] + u[1] * u[1] + u[2] * u[2];
  const c = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  return [0, 1, 2].map(i => 2 * d * u[i] + (s * s - uu) * v[i] + 2 * s * c[i]); };
const qinv = q => ({ x: -q.x, y: -q.y, z: -q.z, w: q.w });

export function createSim(RAPIER, prm) {
  const p = Object.assign({ v0: 4.5, mu: 0.25, muGround: 0.8, posture: "back", spin: 0, s0: 8.35 }, prm);
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = 1 / 240;
  world.integrationParameters.numSolverIterations = 8;
  const RULE = RAPIER.CoefficientCombineRule.Multiply;
  // slide (friction = mu, multiplied with the body's 1.0) and ground (mu_ground)
  const mesh = slideMesh(p.flip !== false);
  const slideBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  const flags = RAPIER.TriMeshFlags ? RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES : undefined;
  world.createCollider(RAPIER.ColliderDesc.trimesh(mesh.vertices, mesh.indices, flags).setFriction(p.mu).setFrictionCombineRule(RULE).setRestitution(0.05), slideBody);
  const ground = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(10, -0.05, 0));
  world.createCollider(RAPIER.ColliderDesc.cuboid(30, 0.05, 10).setFriction(p.muGround).setFrictionCombineRule(RULE).setRestitution(0.1), ground);

  // posture → world placement at s0 (body frame x along the slide, y away from the steel after the roll)
  const P = POSTURES[p.posture] || POSTURES.back, K = pose(P);
  const qroll = qx(P.roll);
  const corners = [];
  for (const [k, def] of Object.entries(PARTS)) {
    const pr = K.parts[k], q = qmul(qroll, qz(pr.a));
    const h = def.ball ? [def.ball, def.ball, def.ball] : def.box;
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
      const c = qrot(qroll, pr.c), d = qrot(q, [sx * h[0], sy * h[1], sz * h[2]]);
      corners.push([c[0] + d[0], c[1] + d[1], c[2] + d[2]]);
    }
  }
  // lift so every corner is inside the tube circle (radius R - 1 cm) and centre laterally
  let y0 = 0;
  for (const [, y, z] of corners) { const lim = R - 0.01; y0 = Math.max(y0, R - y - Math.sqrt(Math.max(0, lim * lim - z * z))); }
  const F = frameAt(p.s0);
  const toWorld = v => [F.o[0] + F.t[0] * v[0] + F.n[0] * (v[1] + y0), F.o[1] + F.t[1] * v[0] + F.n[1] * (v[1] + y0), v[2]];
  const qslide = qz(-TH);   // body x along the slide tangent (pitch down by 30°)
  const bodies = {}, mass = {};
  let M = 0;
  for (const [k, def] of Object.entries(PARTS)) {
    const pr = K.parts[k], q = qmul(qslide, qmul(qroll, qz(pr.a))), c = toWorld(qrot(qroll, pr.c));
    const desc = RAPIER.RigidBodyDesc.dynamic().setTranslation(...c).setRotation(q).setCcdEnabled(true)
      .setLinvel(F.t[0] * p.v0, F.t[1] * p.v0, 0).setAngvel({ x: F.t[0] * p.spin, y: F.t[1] * p.spin, z: 0 })
      .setAngularDamping(0.3);
    const rb = world.createRigidBody(desc);
    const cd = def.ball ? RAPIER.ColliderDesc.ball(def.ball) : RAPIER.ColliderDesc.cuboid(...def.box);
    world.createCollider(cd.setMass(def.m).setFriction(1.0).setFrictionCombineRule(RULE).setRestitution(0.05), rb);
    bodies[k] = rb; mass[k] = def.m; M += def.m;
  }
  // joints: anchors given in the body frame → local frames of each part
  const local = (k, wv) => { const pr = K.parts[k], q = qmul(qroll, qz(pr.a)), c = qrot(qroll, pr.c);
    const d = qrot(qroll, wv).map((x, i) => x - c[i]); const r = qrot(qinv(q), d); return { x: r[0], y: r[1], z: r[2] }; };
  const joint = (a, b, jn, kind, lim) => {
    const A = local(a, K.joints[jn]), B = local(b, K.joints[jn]);
    const jd = kind === "hinge" ? RAPIER.JointData.revolute(A, B, { x: 0, y: 0, z: 1 }) : RAPIER.JointData.spherical(A, B);
    if (lim) { jd.limitsEnabled = true; jd.limits = lim; }
    const j = world.createImpulseJoint(jd, bodies[a], bodies[b], true);
    try { j.setContactsEnabled(false); } catch (e) { }
    return j;
  };
  joint("torso", "head", "neck", "ball");
  joint("pelvis", "torso", "spine", "hinge", [-1.2, 0.6]);
  for (const k of ["L", "R"]) {
    joint("pelvis", "thigh" + k, "hip" + k, "ball");
    joint("thigh" + k, "shin" + k, "knee" + k, "hinge", [-2.4, 0.05]);
    joint("torso", "uarm" + k, "shoulder" + k, "ball");
    joint("uarm" + k, "farm" + k, "elbow" + k, "hinge", [-2.4, 0.05]);
  }

  // ---------------------------------------------------------------- measurement
  const st = { t: 0, tMouth: null, tLip: null, vMouth: null, vLip: null, headHits: 0, headMaxKmh: 0, lastHit: -1,
    roll0: null, rollPrev: null, rollAcc: 0, rollMax: 0, landX: null, tLand: null, restX: null, flying: false, done: false, path: [] };
  const com = () => {
    let x = 0, y = 0, z = 0, vx = 0, vy = 0, vz = 0;
    for (const [k, rb] of Object.entries(bodies)) { const t = rb.translation(), v = rb.linvel(), m = mass[k];
      x += m * t.x; y += m * t.y; z += m * t.z; vx += m * v.x; vy += m * v.y; vz += m * v.z; }
    return { x: x / M, y: y / M, z: z / M, v: Math.hypot(vx, vy, vz) / M };
  };
  const rollAngle = () => {   // torso anterior axis in the slide cross-section; 0 = belly up
    const q = bodies.torso.rotation(), a = qrot(q, [0, 1, 0]), c = com(), s = Math.min(sOfX(c.x), S_LIP), Fs = frameAt(s);
    return Math.atan2(a[2], a[0] * Fs.n[0] + a[1] * Fs.n[1]);
  };
  function measure() {
    const c = com(), s = sOfX(c.x);
    if (st.tMouth === null && s >= S_MOUTH) { st.tMouth = st.t; st.vMouth = c.v; }
    if (st.tLip === null && c.x >= 0) { st.tLip = st.t; st.vLip = c.v; st.flying = true; }
    // head hitting the side walls: head close to the wall, more than 35° up from the bottom, moving outward
    if (s < S_LIP) {
      const h = bodies.head.translation(), hv = bodies.head.linvel(), sh = Math.min(sOfX(h.x), S_LIP), Fh = frameAt(sh);
      const ax = [Fh.o[0] + Fh.n[0] * R, Fh.o[1] + Fh.n[1] * R, 0];
      const d = [h.x - ax[0], h.y - ax[1], h.z], dn = d[0] * Fh.n[0] + d[1] * Fh.n[1], dz = d[2];
      const rr = Math.hypot(dn, dz), ang = Math.atan2(Math.abs(dz), -dn);
      if (rr > R - PARTS.head.ball - 0.015 && ang > 0.6) {
        const vr = ((hv.x * Fh.n[0] + hv.y * Fh.n[1]) * dn + hv.z * dz) / (rr || 1);
        if (vr > 0.8 && st.t - st.lastHit > 0.15) { st.headHits++; st.lastHit = st.t; st.headMaxKmh = Math.max(st.headMaxKmh, vr * 3.6); }
      }
    }
    const r = rollAngle();
    if (st.rollPrev !== null) { let d = r - st.rollPrev; if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; st.rollAcc += d; }
    else st.roll0 = r;
    st.rollPrev = r; st.rollMax = Math.max(st.rollMax, Math.abs(st.rollAcc));
    if (st.flying && st.landX === null) {
      for (const rb of Object.values(bodies)) if (rb.translation().y < 0.16) { st.landX = c.x; st.tLand = st.t; break; }
    }
    if (st.landX !== null && c.v < 0.25 && st.restX === null) { st.restX = c.x; st.done = true; }
    if (st.t > 12) st.done = true;
    if (Math.round(st.t * 240) % 6 === 0) st.path.push([st.t, s, c.v]);
  }
  return {
    world, bodies, params: p,
    step(n = 1) { for (let i = 0; i < n && !st.done; i++) { world.step(); st.t += world.timestep; measure(); } },
    state: () => st, com,
  };
}

/* the cheap point model (same as analysis/laststraight.py), for comparison */
export function pointModel(v0, mu, s0 = S_MOUTH) {
  const G = 9.81, KAP = TH / (S_B1 - S_B0);
  let s = s0, v = v0, t = 0; const dt = 0.001;
  while (s < S_LIP && t < 20) {
    const th = pitch(s), k = s >= S_B0 && s < S_B1 ? KAP : 0;
    const a = G * Math.sin(th) - mu * (G * Math.cos(th) + v * v * k) - 0.5 * 1.2 * 0.12 * v * v / 75;
    if (v <= 0 && a <= 0) return { t: null, vExit: 0 };
    v = Math.max(0, v + a * dt); s += v * dt; t += dt;
  }
  return { t, vExit: v };
}
