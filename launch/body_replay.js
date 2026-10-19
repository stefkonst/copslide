/* Recorded runs vs the full-body physics (Launch page, lower section).
   For each case: the video (where it may be published) with the simulated head / pelvis / feet drawn on top
   (see-through markers placed along the slide with the same four reference points the video timing uses),
   a synced 3-D replay of the simulated body, and speed vs time: body physics, point model, video. */
import { slideMesh, GEO } from "./body_sim.js?v=2";

const $ = id => document.getElementById(id);
const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const CASES = {
  cop:   { label: "The viral cop", note: "His news clip is hand-held (no fixed reference points) and not ours to publish: the 3-D replay and his two measured times are shown instead." },
  P12:   { label: "P12 (our fastest normal-clothes rider)", note: "Video not published without P12's consent: replay and measured times only." },
  Angel: { label: "Angel, cop suit (day 1)", media: "../media/angel_full_suit.mp4", vid: "angel_full_suit" },
  Stef:  { label: "Stef, cop suit (day 1)", media: "../media/stef_full_suit.mp4", vid: "stef_full_suit" },
};
let R = null, CUR = null, raf = 0, three = null;

function interp(xs, ys, x) { if (x <= xs[0]) return ys[0]; for (let i = 1; i < xs.length; i++) if (xs[i] >= x) { const f = (x - xs[i - 1]) / (xs[i] - xs[i - 1] || 1); return ys[i - 1] + (ys[i] - ys[i - 1]) * f; } return ys[ys.length - 1]; }
function simTimeAt(c, s) { const m = c.marks; for (let i = 1; i < m.length; i++) if (m[i][4] >= s) return interp([m[i - 1][4], m[i][4]], [m[i - 1][0], m[i][0]], s); return null; }

/* 3-D replay */
function initThree() {
  const host = $("rpView"), W = host.clientWidth, H = host.clientHeight;
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x1b2128);
  const cam = new THREE.PerspectiveCamera(40, W / H, 0.05, 100);
  const ren = new THREE.WebGLRenderer({ antialias: true }); ren.setPixelRatio(Math.min(2, devicePixelRatio)); ren.setSize(W, H);
  host.innerHTML = ""; host.appendChild(ren.domElement);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 0.85)); const sun = new THREE.DirectionalLight(0xffffff, 0.7); sun.position.set(2, 6, 5); scene.add(sun);
  const add = (part, mat) => { const m = slideMesh(GEO.S0, GEO.S_LIP, part), g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(m.vertices, 3)); g.setIndex(new THREE.BufferAttribute(m.indices, 1)); g.computeVertexNormals(); scene.add(new THREE.Mesh(g, mat)); };
  add("floor", new THREE.MeshStandardMaterial({ color: 0xb9c3cc, metalness: 0.7, roughness: 0.35, side: THREE.DoubleSide }));
  add("roof", new THREE.MeshStandardMaterial({ color: 0x8e99a3, side: THREE.DoubleSide, transparent: true, opacity: 0.15, depthWrite: false }));
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ color: 0x8a5a4e, roughness: 0.95 })); ground.rotation.x = -Math.PI / 2; scene.add(ground);
  three = { scene, cam, ren, meshes: [], camT: new THREE.Vector3() };
}
function buildBody(c) {
  three.meshes.forEach(m => three.scene.remove(m)); three.meshes = [];
  const SIZES = { head: [0.105], torso: [0.25, 0.105, 0.19], pelvis: [0.11, 0.10, 0.17], thigh: [0.21, 0.075, 0.075], shin: [0.23, 0.055, 0.055], uarm: [0.14, 0.045, 0.045], farm: [0.14, 0.04, 0.04] };
  for (const p of c.parts) {
    const s = SIZES[p.replace(/[LR]$/, "")], geo = s.length === 1 ? new THREE.SphereGeometry(s[0], 16, 12) : new THREE.BoxGeometry(s[0] * 2, s[1] * 2, s[2] * 2);
    const col = p === "head" || p.startsWith("farm") ? 0xd9a888 : p === "torso" ? 0x1d2533 : 0x24304a;
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: col, roughness: 0.7 }));
    if (p === "torso") m.add(new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.22, 0.36), new THREE.MeshStandardMaterial({ color: 0xc8f02a })));
    three.scene.add(m); three.meshes.push(m);
  }
}
function poseAt(c, t) {
  const F = c.frames; let i = 1; while (i < F.length - 1 && F[i][0] < t) i++;
  const a = F[i - 1], b = F[i], f = Math.max(0, Math.min(1, (t - a[0]) / (b[0] - a[0] || 1)));
  three.meshes.forEach((m, k) => {
    const o = 1 + 7 * k, L = j => a[o + j] + (b[o + j] - a[o + j]) * f;
    m.position.set(L(0), L(1), L(2));
    const qa = new THREE.Quaternion(a[o + 3], a[o + 4], a[o + 5], a[o + 6]), qb = new THREE.Quaternion(b[o + 3], b[o + 4], b[o + 5], b[o + 6]);
    m.quaternion.copy(qa.slerp(qb, f));
  });
  const p = three.meshes[c.parts.indexOf("pelvis")].position;
  if (three.snap) { three.camT.copy(p); three.snap = false; } else three.camT.lerp(p, 0.2); three.cam.position.set(three.camT.x - 1.1, three.camT.y + 1.2, three.camT.z + 1.8); three.cam.lookAt(three.camT);
  three.ren.render(three.scene, three.cam);
}

/* video overlay: s along the slide -> image pixel (piecewise linear through the clip's reference points) */
function overlay(c, simT) {
  const cv = $("rpOver"), v = $("rpVideo"), ctx = cv.getContext("2d");
  cv.width = v.clientWidth; cv.height = v.clientHeight; ctx.clearRect(0, 0, cv.width, cv.height);
  const cfg = R.videos[CUR]; if (!cfg || !v.videoWidth) return;
  const sx = cv.width / v.videoWidth, sy = cv.height / v.videoHeight, S = cfg.landmarks_s, P = cfg.landmarks_px;
  const px = s => { if (s < S[0]) return null; let j = 0; while (j < S.length - 2 && s > S[j + 1]) j++; const f = Math.min(1.08, (s - S[j]) / (S[j + 1] - S[j]));
    return [(P[j][0] + (P[j + 1][0] - P[j][0]) * f) * sx, (P[j][1] + (P[j + 1][1] - P[j][1]) * f) * sy]; };
  const m = c.marks; let i = 1; while (i < m.length - 1 && m[i][0] < simT) i++;
  const row = m[i], alpha = +$("rpAlpha").value;
  const dots = [[row[1], "#ffd166", "head"], [row[2], "#ef476f", "pelvis"], [row[3], "#06d6a0", "feet"]];
  ctx.globalAlpha = alpha; ctx.lineWidth = 4; ctx.strokeStyle = "#ffffff";
  const pts = dots.map(d => px(d[0])).filter(Boolean);
  if (pts.length > 1) { ctx.beginPath(); pts.forEach((p, k) => k ? ctx.lineTo(...p) : ctx.moveTo(...p)); ctx.stroke(); }
  dots.forEach(([s, col, lab]) => { const p = px(s); if (!p) return; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(p[0], p[1], 9, 0, 7); ctx.fill();
    ctx.font = "bold 13px Inter, sans-serif"; ctx.fillText("sim " + lab, p[0] + 11, p[1] - 8); });
  ctx.globalAlpha = 1;
}

/* speed vs time: body physics, point model, measured video gates (average over each stretch) */
function chart(c, simT) {
  const svg = $("rpChart"), W = svg.clientWidth || 600, H = 230, M = { l: 44, r: 12, t: 12, b: 32 };
  const t0 = c.summary.tMouth != null ? c.summary.tMouth - 1.0 : 0, t1 = (c.summary.tLip ?? c.marks[c.marks.length - 1][0]) + 0.6;
  const X = t => M.l + (t - t0) / (t1 - t0) * (W - M.l - M.r), Y = v => H - M.b - v / 30 * (H - M.t - M.b);
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  let g = "";
  for (let v = 0; v <= 30; v += 10) g += `<line x1="${M.l}" x2="${W - M.r}" y1="${Y(v)}" y2="${Y(v)}" stroke="${css("--grid")}"/><text x="${M.l - 5}" y="${Y(v) + 4}" fill="${css("--text-faint")}" font-size="10" text-anchor="end">${v}</text>`;
  const tm = c.summary.tMouth ?? 0;
  for (let t = tm + Math.ceil((t0 - tm) * 2) / 2; t <= t1; t += 0.5) g += `<text x="${X(t)}" y="${H - 14}" fill="${css("--text-faint")}" font-size="10" text-anchor="middle">${(t - (c.summary.tMouth ?? 0)).toFixed(1)}</text>`;
  const line = (pts, col, w, dash, lab, at) => {
    const q = pts.filter(p => p[0] >= t0 && p[0] <= t1); if (q.length < 2) return;
    g += `<path d="M${q.map(p => X(p[0]).toFixed(1) + "," + Y(p[1]).toFixed(1)).join("L")}" fill="none" stroke="${col}" stroke-width="${w}" ${dash ? `stroke-dasharray="${dash}"` : ""}/>`;
    const k = Math.min(q.length - 1, Math.max(0, Math.floor(q.length * at)));
    g += `<text x="${X(q[k][0])}" y="${Y(q[k][1]) - 7}" fill="${col}" font-size="11" font-weight="600" text-anchor="middle">${lab}</text>`;
  };
  line(c.marks.map(m => [m[0], m[5]]), "#e0453a", 2.5, null, "body physics", 0.35);
  line(c.point_model, "#9aa6b0", 1.8, "6 4", "point model", 0.75);
  (c.measured || []).forEach(([ta, tb, v, lab]) => {
    g += `<line x1="${X(ta)}" x2="${X(tb)}" y1="${Y(v)}" y2="${Y(v)}" stroke="#3a78c2" stroke-width="6" stroke-linecap="round" opacity="0.85"/>`;
    g += `<text x="${(X(ta) + X(tb)) / 2}" y="${Y(v) + 18}" fill="#3a78c2" font-size="10.5" font-weight="600" text-anchor="middle">${lab}</text>`;
  });
  if (simT != null) g += `<line x1="${X(simT)}" x2="${X(simT)}" y1="${M.t}" y2="${H - M.b}" stroke="${css("--accent")}" stroke-width="2"/>`;
  g += `<text x="${(M.l + W - M.r) / 2}" y="${H - 2}" fill="${css("--text-dim")}" font-size="11" text-anchor="middle">seconds after the tube mouth</text>`;
  g += `<text transform="translate(12 ${(M.t + H - M.b) / 2}) rotate(-90)" fill="${css("--text-dim")}" font-size="11" text-anchor="middle">km/h</text>`;
  svg.innerHTML = g;
}

function select(name) {
  CUR = name; const c = R.cases[name], meta = CASES[name];
  document.querySelectorAll("#rpChips .chip").forEach(b => b.classList.toggle("active", b.dataset.n === name));
  const v = $("rpVideo"); cancelAnimationFrame(raf);
  $("rpVidWrap").style.display = meta.media ? "" : "none"; $("rpNote").textContent = meta.note || "";
  if (meta.media) { v.src = meta.media + "?v=" + R.v; v.load(); }
  buildBody(c); three.snap = true;
  const s = c.summary, f = (x, d = 2) => x == null ? "—" : (+x).toFixed(d);
  $("rpRead").innerHTML = [["Tube mouth → lip (sim)", f(s.tLip != null && s.tMouth != null ? s.tLip - s.tMouth : null), "s", c.measured_txt || ""],
    ["Out of the tube (sim)", f(s.vMouth * 3.6, 1), "km/h", `leaving the turns ${f(s.vTurnsEnd * 3.6, 1)} km/h`],
    ["Up the wall at the mouth", f(s.wallAtMouth, 0), "°", `twisted ${f(s.rollAtMouth, 0)}° by then · max ${f(s.rollMax, 0)}°`],
    ["Friction (fitted)", `${f(c.params.muTurns, 2)} / ${f(c.params.mu, 2)}`, "", "turns / last straight · body physics"]]
    .map(([a, b, u, n]) => `<div class="tile"><div class="tl">${a}</div><div class="tv">${b}<span class="tu">${u}</span></div><div class="tn">${n}</div></div>`).join("");
  let t = c.summary.tMouth != null ? c.summary.tMouth - 1.0 : 0, last = performance.now();
  const tick = now => {
    const sync = c.sync;
    let simT;
    if (meta.media && !v.paused && sync) simT = v.currentTime - sync.video_t + sync.sim_t;
    else if (meta.media && sync) simT = v.currentTime - sync.video_t + sync.sim_t;
    else { t += (now - last) / 1000 * +$("rpRate").value; if (t > (c.summary.tLip ?? 6) + 1.5) t = (c.summary.tMouth ?? 1) - 1.0; simT = t; }
    last = now;
    poseAt(c, simT); if (meta.media) overlay(c, simT); chart(c, simT);
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
}

fetch("replays.json?v=" + (window.V || "")).then(r => r.json()).then(d => {
  R = d; initThree();
  $("rpChips").innerHTML = Object.keys(CASES).filter(k => d.cases[k]).map(k => `<button class="chip" data-n="${k}">${CASES[k].label}</button>`).join("");
  $("rpChips").querySelectorAll(".chip").forEach(b => b.addEventListener("click", () => select(b.dataset.n)));
  select(d.cases.Angel ? "Angel" : Object.keys(d.cases)[0]);
}).catch(e => { const el = $("rpNote"); if (el) el.textContent = "Replays unavailable (" + e.message + ")"; });
