// Sky Stack's scene: a tower of lit slabs built on a rooftop above a small city, through a
// morning sky, a windy afternoon among the clouds, and a night of stars. The camera rises with
// the tower, nudges on each drop and pulls back at the end to show the whole climb.
// Canvas 2D with its own projection; the rules live in engine.js and are not changed here.
import { clamp, randomSeed, DIFFICULTIES, STAGES, STACK, stackStage } from './engine.js';

const TAU = Math.PI * 2, NEAR = .3, H = STACK.height;
const mix = (a, b, t) => a + (b - a) * t;
const mix3 = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
const ease = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const norm = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const css = (c, a = 1) => `rgba(${Math.round(clamp(c[0], 0, 255))},${Math.round(clamp(c[1], 0, 255))},${Math.round(clamp(c[2], 0, 255))},${a})`;
const hsl = (h, s, l) => { s /= 100; l /= 100; const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l), f = n => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1)); return [f(0) * 255, f(8) * 255, f(4) * 255]; };

// Each stage's sky and light. Sun directions point toward the light.
const SKIES = [
  { top: [104, 160, 206], bottom: [244, 214, 176], haze: [236, 214, 186], sun: norm([.8, .45, .35]), sunColour: [1, .86, .66], ambient: [.42, .44, .48], disc: [255, 236, 190], ground: [86, 104, 98] },
  { top: [44, 104, 176], bottom: [176, 200, 214], haze: [178, 196, 204], sun: norm([.25, .85, .6]), sunColour: [1, .97, .9], ambient: [.4, .43, .48], disc: [255, 250, 230], ground: [74, 92, 92] },
  { top: [6, 10, 28], bottom: [36, 34, 66], haze: [40, 40, 72], sun: norm([.6, .55, -.15]), sunColour: [.5, .58, .85], ambient: [.2, .22, .34], disc: [228, 232, 250], ground: [18, 22, 36] },
];

function camera(eye, target, focal, cx, cy) {
  const f = norm(sub(target, eye)), r = norm(cross(f, [0, 1, 0])), u = cross(r, f);
  const view = p => { const d = sub(p, eye); return [dot(d, r), dot(d, u), dot(d, f)]; };
  return { eye, f, r, u, focal, cx, cy, view,
    project(p) { const v = view(p); return v[2] < NEAR ? null : [cx + v[0] * focal / v[2], cy - v[1] * focal / v[2], v[2]]; },
    far(d) { const z = dot(d, f); return z < .05 ? null : [cx + dot(d, r) * focal / z, cy - dot(d, u) * focal / z]; } };
}

// A box: eight corners, six faces with their outward normals.
const FACES = [[[0, 1, 2, 3], [0, -1, 0]], [[4, 7, 6, 5], [0, 1, 0]], [[0, 4, 5, 1], [0, 0, -1]], [[1, 5, 6, 2], [1, 0, 0]], [[2, 6, 7, 3], [0, 0, 1]], [[3, 7, 4, 0], [-1, 0, 0]]];
function corners(x, y, z, w, h, d, turn) {
  const a = w / 2, b = d / 2, local = [[-a, 0, -b], [a, 0, -b], [a, 0, b], [-a, 0, b], [-a, h, -b], [a, h, -b], [a, h, b], [-a, h, b]];
  if (!turn) return local.map(p => [x + p[0], y + p[1], z + p[2]]);
  // A falling piece tumbles about its middle.
  const c = Math.cos(turn.angle), s = Math.sin(turn.angle), mid = h / 2;
  return local.map(([px, py, pz]) => {
    let qy = py - mid, qx = px, qz = pz;
    if (turn.axis === 'z') [qx, qy] = [qx * c - qy * s, qx * s + qy * c]; else [qz, qy] = [qz * c - qy * s, qz * s + qy * c];
    return [x + qx, y + mid + qy, z + qz];
  });
}
// Draws a lit box. `glow` lifts its colour; `edge` strokes the top edges in a lighter tone.
function box(ctx, cam, sky, light, pts, colour, { glow = 0, edge = true, alpha = 1, fog = 0 } = {}) {
  const faces = [];
  for (const [idx, n0] of FACES) {
    const p = idx.map(i => pts[i]), n = norm(cross(sub(p[1], p[0]), sub(p[3], p[0]))), c = p.reduce((a, q) => [a[0] + q[0] / 4, a[1] + q[1] / 4, a[2] + q[2] / 4], [0, 0, 0]);
    const outward = dot(n, n0) >= 0 || !dot(n0, n0) ? n : n.map(v => -v);
    if (dot(outward, sub(cam.eye, c)) <= 0) continue;
    const s = p.map(q => cam.project(q)); if (s.some(q => !q)) continue;
    const lambert = Math.max(0, dot(outward, light.dir)), sky = Math.max(0, outward[1]) * .25;
    const k = light.colour.map((v, i) => light.ambient[i] + v * lambert * .85 + sky + glow);
    faces.push({ s, top: outward[1] > .9, colour: mix3(colour.map((v, i) => v * k[i]), light.haze, fog) });
  }
  ctx.globalAlpha = alpha;
  for (const f of faces) {
    ctx.beginPath(); f.s.forEach((q, i) => i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])); ctx.closePath();
    ctx.fillStyle = css(f.colour); ctx.strokeStyle = css(f.colour); ctx.fill(); ctx.stroke();
    if (edge && f.top) { ctx.strokeStyle = css(f.colour.map(v => v * 1.18 + 18), .7); ctx.stroke(); }
  }
  ctx.globalAlpha = 1;
  void sky;
}

// ---- The city below and the sky, fixed for every run --------------------------------------
const CITY = (() => {
  const random = randomSeed(5150), out = [];
  for (let gx = -7; gx <= 7; gx++) for (let gz = -7; gz <= 7; gz++) {
    const x = gx * 4.2 + (random() - .5), z = gz * 4.2 + (random() - .5), r = Math.hypot(x, z);
    if (r < 8.5 || r > 32 || random() < .25) continue;
    out.push({ x, z, w: 1.6 + random() * 1.5, d: 1.6 + random() * 1.5, h: .8 + random() * 2.6 * (1 - r / 45), tone: random(), lit: random() });
  }
  return out;
})();
const STARS = (() => { const random = randomSeed(808), out = []; for (let i = 0; i < 260; i++) { const t = random() * TAU, y = .08 + random() * .92, r = Math.sqrt(1 - y * y); out.push([Math.cos(t) * r, y, Math.sin(t) * r, .3 + random() * .7]); } return out; })();
const CLOUDS = (() => { const random = randomSeed(4411), out = []; for (let i = 0; i < 14; i++) { const t = random() * TAU, r = 7 + random() * 20; out.push({ x: Math.cos(t) * r, z: Math.sin(t) * r, y: 3 + random() * 6, s: 1.6 + random() * 2.6, seed: random() }); } return out; })();
const GROUND = -7, ROOF = 0;

const memory = new WeakMap();
function remember(s) {
  if (!memory.has(s)) memory.set(s, { camY: 1.2, reach: 0, orbit: 0, lastAt: null, dropAt: null, stageAt: null, stage: s.stage, sky: s.stage, frameAt: null, ended: null, phase: s.phase, wind: 0 });
  return memory.get(s);
}

export function stackScene(ctx, w, h, s, { now = 0, reduced = false } = {}) {
  const m = remember(s), dt = m.frameAt === null ? 0 : clamp((now - m.frameAt) / 1000, 0, .1); m.frameAt = now;
  if (s.last && s.last.at !== m.lastAt) { m.lastAt = s.last.at; m.dropAt = now; }
  if (s.stage !== m.stage) { m.stage = s.stage; m.stageAt = now; }
  if (m.phase !== s.phase) { if (s.phase === 'won' || s.phase === 'lost') m.ended = now; if (s.phase === 'playing' && m.phase === 'ready') m.stageAt = now; m.phase = s.phase; }
  // The sky changes over a couple of seconds as a new stage begins.
  m.sky = reduced ? s.stage : mix(m.sky, s.stage, clamp(dt * 1.2, 0, 1));
  const i0 = Math.floor(m.sky), i1 = Math.min(2, i0 + 1), kt = m.sky - i0, A = SKIES[i0], B = SKIES[i1];
  const sky = { top: mix3(A.top, B.top, kt), bottom: mix3(A.bottom, B.bottom, kt), haze: mix3(A.haze, B.haze, kt), disc: mix3(A.disc, B.disc, kt), ground: mix3(A.ground, B.ground, kt) };
  const light = { dir: norm(mix3(A.sun, B.sun, kt)), colour: mix3(A.sunColour, B.sunColour, kt), ambient: mix3(A.ambient, B.ambient, kt), haze: sky.haze };
  const night = clamp(m.sky - 1, 0, 1);
  m.wind = mix(m.wind, s.gust || 0, clamp(dt * 3, 0, 1));

  // Camera: rising with the tower, a quarter view so both lanes read; at the end, back to show it all.
  const top = s.blocks.length * H, ended = (s.phase === 'won' || s.phase === 'lost') && m.ended !== null ? ease((now - m.ended) / (reduced ? 1 : 2200)) : 0;
  m.camY = reduced || m.frameAt === null ? top : mix(m.camY, top, clamp(dt * 4, 0, 1));
  if (!reduced && (s.phase === 'ready' || ended)) m.orbit += dt * (s.phase === 'ready' ? .12 : .18);
  const bump = m.dropAt !== null && !reduced ? Math.sin(clamp((now - m.dropAt) / 260, 0, 1) * Math.PI) * .09 : 0;
  const fit = Math.max(14, top * 1.1 + 8), R = mix(14, fit, ended);
  const targetY = mix(m.camY + .3 - bump, top * .5, ended), az = Math.PI / 4 + m.orbit + (reduced ? 0 : Math.sin(now * .00013) * .05);
  const eye = [Math.cos(az) * R * .86, targetY + R * mix(.42, .22, ended), Math.sin(az) * R * .86], target = [0, targetY, 0];
  // Enough lens to take in the slab's whole run across the lane, wide or tall screen.
  const dist = Math.hypot(...sub(eye, target)), focal = Math.min(w * dist / 16, h * dist / (ended ? Math.max(11, top + 4) : 11));
  const cam = camera(eye, target, focal, w / 2, h / 2 + (w < h ? h * .04 : 0));

  backdrop(ctx, w, h, cam, sky, light, night, now, reduced);
  // The city, then the building the tower stands on.
  const fogOf = p => clamp(Math.hypot(p[0] - eye[0], p[2] - eye[2]) / 60, 0, .85);
  const items = CITY.map(b => ({ b, d: Math.hypot(b.x - eye[0], b.z - eye[2]) })).sort((a, b) => b.d - a.d);
  for (const { b } of items) {
    const colour = mix3(hsl(196 + b.tone * 40, 14, 30 + b.tone * 16), [34, 38, 58], night * .6);
    box(ctx, cam, sky, light, corners(b.x, GROUND, b.z, b.w, b.h, b.d), colour, { edge: false, fog: fogOf([b.x, 0, b.z]) });
    if (night > .05) windows(ctx, cam, b, night);
  }
  box(ctx, cam, sky, light, corners(0, GROUND, 0, 6.4, ROOF - GROUND - .02, 6.4), mix3([120, 126, 130], [44, 48, 70], night), { edge: false });
  windows(ctx, cam, { x: 0, z: 0, w: 6.4, d: 6.4, h: ROOF - GROUND, lit: .9 }, night, 5);
  box(ctx, cam, sky, light, corners(0, ROOF - .02, 0, 6.8, .14, 6.8), mix3([150, 154, 150], [64, 68, 96], night), { edge: true });

  // Clouds behind the tower, the tower, then clouds in front.
  // Clouds drift, faster in the wind, and wrap round the city.
  if (!reduced) m.drift = (m.drift || 0) + dt * (.25 + Math.abs(m.wind) * 4);
  const cloudItems = CLOUDS.map(c => { const x = ((c.x + (m.drift || 0) + 30) % 60 + 60) % 60 - 30; return { c, x, d: Math.hypot(x - eye[0], c.z - eye[2]) }; });
  const towerD = Math.hypot(eye[0], eye[2]);
  cloudItems.filter(it => it.d >= towerD).sort((a, b) => b.d - a.d).forEach(it => cloud(ctx, cam, it, sky, night));
  tower(ctx, cam, s, sky, light, now, reduced, m, night);
  cloudItems.filter(it => it.d < towerD).sort((a, b) => b.d - a.d).forEach(it => cloud(ctx, cam, it, sky, night, .8));

  overlay(ctx, w, h, s, m, now, reduced, night);
}

function backdrop(ctx, w, h, cam, sky, light, night, now, reduced) {
  // Where the horizon sits on screen, so the gradient meets it.
  const hz = cam.far(norm([cam.f[0], 0, cam.f[2]])), y0 = hz ? hz[1] : h * .6;
  const g = ctx.createLinearGradient(0, Math.min(0, y0 - h * .9), 0, y0);
  g.addColorStop(0, css(sky.top)); g.addColorStop(1, css(sky.bottom)); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  if (night > .02) for (const [x, y, z, b] of STARS) {
    const p = cam.far([x, y, z]); if (!p || p[1] > y0) continue;
    const tw = reduced ? 1 : .7 + .3 * Math.sin(now * .002 + x * 40);
    ctx.fillStyle = `rgba(235,238,255,${night * b * tw})`; ctx.fillRect(p[0], p[1], b > .8 ? 2 : 1.2, b > .8 ? 2 : 1.2);
  }
  // The sun, or the moon, where it is in view.
  const disc = cam.far(norm([light.dir[0], .18 + light.dir[1] * .2, light.dir[2]]));
  if (disc) {
    const r = Math.min(w, h) * .05, halo = ctx.createRadialGradient(disc[0], disc[1], r * .4, disc[0], disc[1], r * 5);
    halo.addColorStop(0, css(sky.disc, .5)); halo.addColorStop(1, css(sky.disc, 0)); ctx.fillStyle = halo; ctx.fillRect(disc[0] - r * 5, disc[1] - r * 5, r * 10, r * 10);
    ctx.fillStyle = css(sky.disc); ctx.beginPath(); ctx.arc(disc[0], disc[1], r * (night > .5 ? .7 : 1), 0, TAU); ctx.fill();
  }
  // The ground: a wide plane falling into haze.
  const ring = []; for (let i = 0; i < 48; i++) { const t = i / 48 * TAU; ring.push(cam.project([Math.cos(t) * 80, GROUND, Math.sin(t) * 80])); }
  const visible = ring.filter(Boolean);
  if (visible.length > 2) {
    const gy = Math.min(...visible.map(p => p[1])), gg = ctx.createLinearGradient(0, gy, 0, h);
    gg.addColorStop(0, css(sky.haze)); gg.addColorStop(.35, css(sky.ground)); gg.addColorStop(1, css(sky.ground.map(v => v * .7)));
    ctx.fillStyle = gg; ctx.fillRect(0, gy, w, h - gy);
  }
}

function windows(ctx, cam, b, night, rows = 0) {
  // At night, a few lit windows on the faces toward you.
  const levels = rows || Math.max(1, Math.floor(b.h / .8)), x0 = b.x - b.w / 2, z0 = b.z - b.d / 2;
  const faces = [[[x0, z0 + b.d + .01], [1, 0], [0, 0, 1]], [[x0 + b.w + .01, z0], [0, 1], [1, 0, 0]], [[x0, z0 - .01], [1, 0], [0, 0, -1]], [[x0 - .01, z0], [0, 1], [-1, 0, 0]]];
  for (const [[ox, oz], [ux, uz], n] of faces) {
    if (dot(n, sub(cam.eye, [ox, GROUND, oz])) <= 0) continue;
    const span = ux ? b.w : b.d, cols = Math.max(2, Math.floor(span / .7));
    for (let r = 0; r < levels; r++) for (let c = 0; c < cols; c++) {
      if (((r * 7 + c * 13 + Math.floor(b.lit * 97)) % 5) > 1) continue;
      const p = cam.project([ox + ux * (c + .5) * span / cols, GROUND + (r + .5) * (b.h - .3) / levels + .15, oz + uz * (c + .5) * span / cols]); if (!p) continue;
      const size = Math.max(.8, cam.focal * .1 / p[2]);
      ctx.fillStyle = `rgba(255,214,140,${.8 * night})`; ctx.fillRect(p[0] - size / 2, p[1] - size / 2, size, size * 1.3);
    }
  }
}

function cloud(ctx, cam, it, sky, night, alpha = 1) {
  const c = it.c, p = cam.project([it.x, c.y, c.z]); if (!p) return;
  const r = cam.focal * c.s / p[2]; if (p[0] + r * 1.6 < 0 || p[0] - r * 1.6 > ctx.canvas.width || p[1] + r < 0) return;
  const colour = mix3([252, 250, 244], [70, 74, 108], night);
  for (let k = 0; k < 4; k++) {
    const ox = (k - 1.5) * r * .55, oy = Math.sin(c.seed * 9 + k * 2) * r * .14, rr = r * (.55 + .25 * Math.sin(c.seed * 7 + k));
    const g = ctx.createRadialGradient(p[0] + ox, p[1] + oy, 0, p[0] + ox, p[1] + oy, rr);
    g.addColorStop(0, css(colour, .5 * alpha)); g.addColorStop(1, css(colour, 0)); ctx.fillStyle = g; ctx.fillRect(p[0] + ox - rr, p[1] + oy - rr, rr * 2, rr * 2);
  }
  void sky;
}

// The tower: each slab coloured by its height, the lean in Sway, the slab you are moving, its shadow
// on the top, falling offcuts, and a ripple on a perfect drop.
function tower(ctx, cam, s, sky, light, now, reduced, m, night) {
  const n = s.blocks.length, lean = i => n > 1 ? s.sway * Math.pow(i / (n - 1), 1.3) : 0;
  const colourOf = i => hsl(78 + i * 7, 52, 58);
  const behind = [], front = [];
  for (const p of s.pieces) (dot(sub([p.x, 0, p.z], [0, 0, 0]), norm([cam.eye[0], 0, cam.eye[2]])) < 0 ? behind : front).push(p);
  const piece = p => box(ctx, cam, sky, light, corners(p.x, p.y, p.z, p.w, H, p.d, { axis: p.w < p.d || p.whole && s.axis === 'z' ? 'x' : 'z', angle: (p.side || 1) * p.spin * .8 }), colourOf(n), { alpha: clamp(p.life, 0, 1) });
  behind.forEach(piece);
  // Bottom to top; at night each slab's top edge glows as it is laid, so the tower reads as a column of light.
  s.blocks.forEach((b, i) => {
    const x = b.x + lean(i), z = b.z + lean(i);
    box(ctx, cam, sky, light, corners(x, i * H, z, b.w, H, b.d), colourOf(i), { glow: night * .18 });
    if (night < .05 || !i) return;
    const y = (i + 1) * H, q = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, c]) => cam.project([x + a * b.w / 2, y, z + c * b.d / 2]));
    if (!q.every(Boolean)) return;
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineWidth = 1.5;
    ctx.beginPath(); q.forEach((p, k) => k ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath();
    ctx.strokeStyle = css(colourOf(i).map(v => v * .8), .55 * night); ctx.stroke(); ctx.restore();
  });
  const topBlock = s.blocks.at(-1), ty = n * H, tx = topBlock.x + s.sway, tz = topBlock.z + s.sway;
  if (s.phase === 'playing' || s.phase === 'paused' || s.phase === 'ready') {
    const mv = s.moving;
    // The moving slab's shadow on the top: where the light falls, it shows what you would keep.
    const ox = [Math.max(mv.x - mv.w / 2, tx - topBlock.w / 2), Math.min(mv.x + mv.w / 2, tx + topBlock.w / 2)], oz = [Math.max(mv.z - mv.d / 2, tz - topBlock.d / 2), Math.min(mv.z + mv.d / 2, tz + topBlock.d / 2)];
    if (ox[1] > ox[0] && oz[1] > oz[0] && s.phase !== 'ready') {
      const q = [[ox[0], ty + .005, oz[0]], [ox[1], ty + .005, oz[0]], [ox[1], ty + .005, oz[1]], [ox[0], ty + .005, oz[1]]].map(p => cam.project(p));
      if (q.every(Boolean)) { ctx.beginPath(); q.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath(); ctx.fillStyle = 'rgba(10,20,30,.22)'; ctx.fill(); }
    }
    // A dotted outline of the top, lifted to the moving slab's height.
    const g = [[tx - topBlock.w / 2, ty + H, tz - topBlock.d / 2], [tx + topBlock.w / 2, ty + H, tz - topBlock.d / 2], [tx + topBlock.w / 2, ty + H, tz + topBlock.d / 2], [tx - topBlock.w / 2, ty + H, tz + topBlock.d / 2]].map(p => cam.project(p));
    if (g.every(Boolean) && s.phase !== 'ready') { ctx.setLineDash([3, 4]); ctx.beginPath(); g.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath(); ctx.strokeStyle = night > .5 ? 'rgba(220,230,255,.55)' : 'rgba(255,255,240,.7)'; ctx.stroke(); ctx.setLineDash([]); }
    if (s.phase !== 'ready') box(ctx, cam, sky, light, corners(mv.x, ty, mv.z, mv.w, H, mv.d), colourOf(n), { glow: .12 + (reduced ? 0 : Math.sin(now * .006) * .04) });
  }
  front.forEach(piece);
  // A ripple round the top on a perfect drop, brighter when the slab grows back.
  if (s.last?.perfect && m.dropAt !== null && now - m.dropAt < 700 && !reduced) {
    const t = (now - m.dropAt) / 700, b = s.blocks.at(-1), y = (n - 1) * H + H, grow = .15 + t * 1.1, cx = b.x + s.sway, cz = b.z + s.sway;
    const q = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, c]) => cam.project([cx + a * (b.w / 2 + grow), y, cz + c * (b.d / 2 + grow)]));
    if (q.every(Boolean)) { ctx.beginPath(); q.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath(); ctx.lineWidth = s.last.grew ? 3 : 2; ctx.strokeStyle = s.last.grew ? `rgba(255,236,150,${1 - t})` : `rgba(255,255,255,${.85 * (1 - t)})`; ctx.stroke(); ctx.lineWidth = 1; }
  }
}

function overlay(ctx, w, h, s, m, now, reduced, night) {
  const small = w < 520, goal = DIFFICULTIES[s.difficulty].stackGoal, per = goal / STAGES.length, ink = night > .5 ? 'rgba(230,234,255,' : 'rgba(18,30,36,';
  if (s.phase === 'ready') return;
  // Bottom: a level bar in three stages.
  const x0 = 18, y0 = h - (small ? 34 : 28), cell = Math.min(10, (w * .5) / goal);
  for (let i = 0; i < goal; i++) {
    const gap = Math.floor(i / per) * 6;
    ctx.fillStyle = i < s.drops ? (s.marks[i] ? 'rgba(217,245,126,.95)' : ink + '.6)') : ink + '.18)';
    ctx.fillRect(x0 + i * cell + gap, y0, cell - 3, 8);
  }
  ctx.font = `600 ${small ? 9 : 10}px ui-monospace, monospace`; ctx.fillStyle = ink + '.75)'; ctx.textAlign = 'left';
  ctx.fillText(`STAGE ${s.stage + 1}/3 · ${STAGES[s.stage].name.toUpperCase()}${s.combo > 1 ? ` · ${s.combo} PERFECT IN A ROW` : ''}`, x0, y0 - 8);
  // Wind: an arrow that grows and shrinks with the gusts.
  if (s.stage === 1 && s.phase === 'playing') {
    const cx = w - 70, cy = h - 34, len = 18 + Math.abs(m.wind) * 70, dir = Math.sign(m.wind || 1);
    ctx.strokeStyle = ink + '.7)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx - dir * len / 2, cy); ctx.lineTo(cx + dir * len / 2, cy); ctx.lineTo(cx + dir * (len / 2 - 6), cy - 5); ctx.moveTo(cx + dir * len / 2, cy); ctx.lineTo(cx + dir * (len / 2 - 6), cy + 5); ctx.stroke(); ctx.lineWidth = 1;
    ctx.textAlign = 'center'; ctx.fillText(m.wind * (s.direction || 1) > 0 ? 'GUST' : 'LULL', cx, cy - 12); ctx.textAlign = 'left';
  }
  // The stage's title, as it begins.
  if (m.stageAt !== null && now - m.stageAt < 2800 && s.phase === 'playing') {
    const t = (now - m.stageAt) / 2800, a = Math.min(1, t * 5, (1 - t) * 3.5), y = h * .2;
    ctx.textAlign = 'center';
    ctx.font = `600 ${small ? 10 : 11}px ui-monospace, monospace`; ctx.fillStyle = ink + `${.75 * a})`; ctx.fillText(`STAGE ${s.stage + 1} OF 3`, w / 2, y - 20);
    ctx.font = `600 ${small ? 24 : 32}px Georgia, serif`; ctx.fillStyle = night > .5 ? `rgba(246,246,255,${a})` : `rgba(14,26,30,${a})`; ctx.fillText(STAGES[s.stage].name, w / 2, y + 10);
    ctx.font = `${small ? 12 : 14}px Georgia, serif`; ctx.fillStyle = ink + `${.8 * a})`; ctx.fillText(STAGES[s.stage].brief, w / 2, y + 32);
    ctx.textAlign = 'left';
  }
}
