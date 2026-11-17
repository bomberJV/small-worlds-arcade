// The Green Room's scene: three floors of halls in real 3D, lit by ceiling lamps, your lantern,
// the crystals' own glow, the exit and the warden's lamp. A camera that swoops down from a view of
// the whole floor into your eyes, bobs as you walk, and rises back out when you escape.
// Canvas 2D with its own projection; the rules live in engine.js and are not changed here.
import { clamp, inSight, FLOORS, WALK, SPRINT } from './engine.js';

const TAU = Math.PI * 2, NEAR = .04, UP = [0, 1, 0];
const mix = (a, b, t) => a + (b - a) * t;
const mix3 = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
const ease = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const norm = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const hash = (x, y, k = 0) => { let n = Math.imul(x * 374761393 + y * 668265263 + k * 2246822519, 1274126177) >>> 0; n = Math.imul(n ^ (n >>> 13), 1103515245) >>> 0; return (n >>> 8) / 16777216; };
const css = (c, a = 1) => `rgba(${Math.round(clamp(c[0], 0, 255))},${Math.round(clamp(c[1], 0, 255))},${Math.round(clamp(c[2], 0, 255))},${a})`;

// How each floor looks. Light colours are 0–1 multipliers on the surface colour.
const LOOKS = [
  { wall: [126, 168, 98], low: [86, 120, 68], floor: [82, 98, 60], ceil: [58, 74, 52], top: [150, 184, 118], ambient: [.19, .21, .16], fog: [8, 15, 11], density: .08, gamma: .85, sky: .32,
    lamp: { colour: [1, .88, .62], range: 3.6, strength: 1.5, every: 5 }, lantern: [1, .94, .8], lanternStrength: .9, chalk: [226, 240, 170], map: '#b7d874', style: 'boards' },
  { wall: [124, 122, 122], low: [92, 90, 92], floor: [70, 72, 82], ceil: [44, 46, 54], top: [100, 108, 124], ambient: [.016, .018, .026], fog: [1, 2, 4], density: .13, sky: .07,
    lamp: null, lantern: [1, .74, .44], lanternStrength: 3.2, gamma: .9, chalk: [190, 206, 230], map: '#9fb2d0', style: 'stone' },
  { wall: [156, 100, 80], low: [112, 68, 56], floor: [82, 62, 56], ceil: [50, 36, 34], top: [134, 90, 74], ambient: [.055, .035, .035], fog: [12, 4, 4], density: .11, sky: .12,
    lamp: { colour: [1, .3, .2], range: 2.8, strength: 1, every: 9, flicker: true }, lantern: [1, .84, .6], lanternStrength: 2, gamma: .9, chalk: [240, 200, 170], map: '#e09a80', style: 'brick' },
];
// Light from above that the ambient comes in along, so walls facing different ways read apart.
const KEY = norm([-.35, .8, -.5]);
const CRYSTAL = [196, 255, 122], EXIT_OPEN = [255, 150, 196], EXIT_SHUT = [150, 162, 140], WARDEN_LAMP = [255, 168, 90];

// ---- Camera --------------------------------------------------------------------------------
// World: x and z are the maze's columns and rows (z = grid y), y is up; walls are one unit tall.
function camera(eye, target, roll, focal, cx, cy) {
  const f = norm(sub(target, eye));
  let r = norm(cross(f, UP)), u = cross(r, f);
  if (roll) { const c = Math.cos(roll), s = Math.sin(roll); [r, u] = [r.map((v, i) => v * c + u[i] * s), u.map((v, i) => u[i] * c - r[i] * s)]; }
  const view = p => { const d = sub(p, eye); return [dot(d, r), dot(d, u), dot(d, f)]; };
  const screen = v => [cx + v[0] * focal / v[2], cy - v[1] * focal / v[2], v[2]];
  return { eye, f, focal, cx, cy, view, screen, project: p => { const v = view(p); return v[2] < NEAR ? null : screen(v); } };
}
// A polygon on screen, clipped at the lens so a wall right beside you still draws.
function clipped(cam, points, w, h) {
  const v = points.map(cam.view); let poly = v;
  if (v.some(p => p[2] < NEAR)) {
    poly = [];
    for (let i = 0; i < v.length; i++) {
      const a = v[i], b = v[(i + 1) % v.length], ina = a[2] >= NEAR, inb = b[2] >= NEAR;
      if (ina) poly.push(a);
      if (ina !== inb) { const t = (NEAR - a[2]) / (b[2] - a[2]); poly.push(mix3(a, b, t)); }
    }
    if (poly.length < 3) return null;
  }
  const out = poly.map(cam.screen);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const p of out) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
  return x1 < 0 || x0 > w || y1 < 0 || y0 > h ? null : out;
}
function fillPoly(ctx, pts, colour) {
  ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.closePath();
  ctx.fillStyle = colour; ctx.strokeStyle = colour; ctx.fill(); ctx.stroke();   // the matching stroke closes hairline seams
}

// A line in the world, added to the current path; clipped at the lens.
function line(ctx, cam, p, q) {
  let a = cam.view(p), b = cam.view(q);
  if (a[2] < NEAR && b[2] < NEAR) return;
  if (a[2] < NEAR) a = mix3(a, b, (NEAR - a[2]) / (b[2] - a[2])); else if (b[2] < NEAR) b = mix3(b, a, (NEAR - b[2]) / (a[2] - b[2]));
  const sa = cam.screen(a), sb = cam.screen(b); ctx.moveTo(sa[0], sa[1]); ctx.lineTo(sb[0], sb[1]);
}
// The lines that make a wall read as a material: boards and a rail, stone blocks, or brick.
function material(ctx, cam, panel, style, colour, fade) {
  const at = (u, v) => [panel.origin[0] + panel.u[0] * u + panel.n[0] * .004, v, panel.origin[2] + panel.u[2] * u + panel.n[2] * .004];
  const seg = (u0, v0, u1, v1) => line(ctx, cam, at(u0, v0), at(u1, v1));
  ctx.beginPath();
  if (style === 'boards') {
    for (const u of [.125, .25, .375, .5, .625, .75, .875]) seg(u, .02, u, .4);
    seg(0, .96, 1, .96); seg(.5, .44, .5, .94); seg(0, .44, 0, .94);
  } else if (style === 'stone') {
    for (const v of [.25, .5, .75]) seg(0, v, 1, v);
    for (let k = 0; k < 4; k++) { const off = ((k + panel.row) % 2) * .25; for (const u of [off, off + .5]) seg(u, k * .25, u, k * .25 + .25); }
  } else {
    for (let k = 1; k < 7; k++) seg(0, k / 7, 1, k / 7);
    for (let k = 0; k < 7; k++) { const off = ((k + panel.row) % 2) * .125; for (let u = off; u < 1; u += .25) seg(u, k / 7, u, (k + 1) / 7); }
  }
  ctx.strokeStyle = css(colour.map(c => c * .45), .75 * fade); ctx.stroke();
  // A highlight just under each joint, where light catches the edge.
  ctx.beginPath();
  if (style === 'boards') { seg(0, .425, 1, .425); seg(0, .015, 1, .015); }
  else if (style === 'stone') for (const v of [.255, .505, .755]) seg(0, v, 1, v);
  ctx.strokeStyle = css(colour.map(c => c * 1.5 + 12), .5 * fade); ctx.stroke();
  if (style === 'boards') { ctx.beginPath(); seg(0, .41, 1, .41); ctx.lineWidth = 2; ctx.strokeStyle = css(colour.map(c => c * .5), .7 * fade); ctx.stroke(); ctx.lineWidth = 1; }
}

// ---- The floor's geometry and its fixed lights, built once per floor ------------------------
const open = (grid, x, y) => grid[y]?.[x] === '0';
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
function exitWall(grid, exit) {
  const x = Math.floor(exit.x), y = Math.floor(exit.y), opens = DIRS.filter(([dx, dy]) => open(grid, x + dx, y + dy)), walls = DIRS.filter(([dx, dy]) => !open(grid, x + dx, y + dy));
  if (!walls.length) return null;
  const back = opens[0] && walls.find(([dx, dy]) => dx === -opens[0][0] && dy === -opens[0][1]);
  return back || walls[0];
}
function build(s, look) {
  const grid = s.grid, H = grid.length, W = grid[0].length, faces = [], byCell = new Map(), panels = new Map(), tops = [];
  const add = (key, face) => { faces.push(face); if (!byCell.has(key)) byCell.set(key, []); byCell.get(key).push(face); };
  // A face is shaded at both ends and drawn as a gradient between them, so light falls off across it.
  const quad = (pts, n, albedo, kind, owner) => ({ pts, n, c: mix3(pts[0], pts[2], .5), ends: [mix3(pts[0], pts[3], .5), mix3(pts[1], pts[2], .5)], albedo, kind, owner, lights: [[], []] });
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const key = `${x},${y}`;
    if (!open(grid, x, y)) {
      const tint = 1 + (hash(x, y, 9) - .5) * .1;
      tops.push(quad([[x, 1, y], [x + 1, 1, y], [x + 1, 1, y + 1], [x, 1, y + 1]], UP, look.top.map(c => c * tint), 'top', key));
      continue;
    }
    // Floor and ceiling in quarters, so lamplight falls in a pool rather than a flat square.
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
      const x0 = x + i / 2, x1 = x0 + .5, z0 = y + j / 2, z1 = z0 + .5, checker = (x + y) % 2 ? .94 : 1.04, grain = 1 + (hash(x * 2 + i, y * 2 + j, 1) - .5) * .05;
      add(key, quad([[x0, 0, z0], [x1, 0, z0], [x1, 0, z1], [x0, 0, z1]], UP, look.floor.map(c => c * checker * grain), 'floor', key));
      add(key, quad([[x0, 1, z0], [x1, 1, z0], [x1, 1, z1], [x0, 1, z1]], [0, -1, 0], look.ceil.map(c => c * grain), 'ceil', key));
    }
    // Wall faces bordering this hall, in four panels: a darker lower band and the wall above.
    for (const [dx, dy] of DIRS) {
      if (open(grid, x + dx, y + dy)) continue;
      const n = [-dx, 0, -dy], px = x + .5 + dx * .5, pz = y + .5 + dy * .5, tx = dy !== 0 ? 1 : 0, tz = dx !== 0 ? 1 : 0;
      // One wall panel: four lit pieces drawn together, then the lines of its material.
      const panel = { n, c: [px, .5, pz], origin: [px - tx * .5, 0, pz - tz * .5], u: [tx, 0, tz], subs: [], row: (x + y) % 2 };
      if (!panels.has(key)) panels.set(key, []); panels.get(key).push(panel);
      for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
        const a = i / 2 - .5, b = a + .5, y0 = j ? .42 : 0, y1 = j ? 1 : .42, grain = 1 + (hash(x * 4 + dx + i, y * 4 + dy, j + 3) - .5) * .1;
        const albedo = (j ? look.wall : look.low).map(c => c * grain);
        const face = quad([[px + tx * a, y0, pz + tz * a], [px + tx * b, y0, pz + tz * b], [px + tx * b, y1, pz + tz * b], [px + tx * a, y1, pz + tz * a]], n, albedo, 'wall', key);
        panel.subs.push(face); add(key, face);
      }
    }
  }
  // Fixed lights: ceiling lamps, the three crystals and the exit.
  const lights = [], cells = [...byCell.keys()].map(k => k.split(',').map(Number));
  if (look.lamp) {
    const r = look.lamp.every, start = [1, 1];
    for (const [x, y] of cells) {
      const corridor = DIRS.filter(([dx, dy]) => open(grid, x + dx, y + dy)).length;
      const pick = (x === start[0] && y === start[1]) || (hash(x, y, s.floor + 40) < 1 / r && corridor !== 2) || (hash(x, y, s.floor + 41) < .45 / r);
      if (pick && lights.every(l => l.kind !== 'lamp' || Math.hypot(l.cell[0] - x, l.cell[1] - y) >= 2.2))
        lights.push({ kind: 'lamp', cell: [x, y], p: [x + .5, .93, y + .5], colour: look.lamp.colour, range: look.lamp.range, phase: hash(x, y, 77) * TAU });
    }
  }
  s.gems.forEach((g, i) => lights.push({ kind: 'gem', index: i, cell: [Math.floor(g.x), Math.floor(g.y)], p: [g.x, .42, g.y], colour: CRYSTAL.map(c => c / 255), range: 2.5 }));
  const door = exitWall(grid, s.exit), ex = s.exit.x + (door ? door[0] * .3 : 0), ez = s.exit.y + (door ? door[1] * .3 : 0);
  lights.push({ kind: 'exit', cell: [Math.floor(s.exit.x), Math.floor(s.exit.y)], p: [ex, .45, ez], colour: EXIT_OPEN.map(c => c / 255), range: 3.2 });
  for (const face of faces) face.ends.forEach((end, e) => {
    const probe = [mix(end[0], face.c[0], .1) + face.n[0] * .03, mix(end[2], face.c[2], .1) + face.n[2] * .03];
    lights.forEach((light, index) => {
      const d = Math.hypot(light.p[0] - end[0], light.p[1] - end[1], light.p[2] - end[2]); if (d > light.range) return;
      const lambert = dot(face.n, norm(sub(light.p, end))); if (lambert <= 0) return;
      if (!inSight(grid, light.p[0], light.p[2], probe[0], probe[1])) return;
      face.lights[e].push(index, Math.pow(1 - d / light.range, 1.6) * (.35 + .65 * lambert));
    });
  });
  return { grid, W, H, faces, byCell, panels, tops, lights, door };
}

// Cells you can see from (x, y), by rays across the view: the halls to draw, nothing behind walls.
function visible(grid, x, y, a, fov, max) {
  const seen = new Set(), rays = 150;
  for (let i = 0; i < rays; i++) {
    const angle = a + (i / (rays - 1) - .5) * fov, dx = Math.cos(angle), dy = Math.sin(angle);
    let mx = Math.floor(x), my = Math.floor(y); seen.add(`${mx},${my}`);
    const deltaX = Math.abs(1 / (dx || 1e-10)), deltaY = Math.abs(1 / (dy || 1e-10)), sx = dx < 0 ? -1 : 1, sy = dy < 0 ? -1 : 1;
    let tx = (dx < 0 ? x - mx : mx + 1 - x) * deltaX, ty = (dy < 0 ? y - my : my + 1 - y) * deltaY;
    for (let step = 0; step < 80; step++) {
      if (tx < ty) { mx += sx; if (tx > max) break; tx += deltaX; } else { my += sy; if (ty > max) break; ty += deltaY; }
      if (!open(grid, mx, my)) break;
      seen.add(`${mx},${my}`);
    }
  }
  // Neighbours too, so a hall glimpsed between two rays does not flicker at a corner.
  for (const key of [...seen]) { const [cx, cy] = key.split(',').map(Number); for (const [dx, dy] of DIRS) if (open(grid, cx + dx, cy + dy)) seen.add(`${cx + dx},${cy + dy}`); }
  return seen;
}

// ---- Models --------------------------------------------------------------------------------
// The warden: a hooded figure in rings, widest at the hem, with a lamp in one hand.
const WARDEN_RINGS = [[0, .27], [.3, .2], [.52, .15], [.68, .2], [.78, .1], [.88, .13]], WARDEN_SIDES = 8;
function wardenMesh(x, z, facing, sway) {
  const v = [], f = [];
  // A ragged hem, narrow waist, shoulders, then the hood. It hovers a little off the floor.
  WARDEN_RINGS.forEach(([y, r], ring) => { for (let i = 0; i < WARDEN_SIDES; i++) { const t = i / WARDEN_SIDES * TAU + facing, lean = y * sway, rr = ring ? r : r * (i % 2 ? .82 : 1.08); v.push([x + Math.cos(t) * rr + Math.cos(facing) * lean, y + .03 + (ring ? 0 : (i % 2) * .05), z + Math.sin(t) * rr + Math.sin(facing) * lean]); } });
  const apex = v.length; v.push([x + Math.cos(facing) * (-.04 + .92 * sway), 1.02, z + Math.sin(facing) * (-.04 + .92 * sway)]);
  for (let ring = 0; ring < WARDEN_RINGS.length - 1; ring++) for (let i = 0; i < WARDEN_SIDES; i++) {
    const a = ring * WARDEN_SIDES + i, b = ring * WARDEN_SIDES + (i + 1) % WARDEN_SIDES;
    f.push([a, b, b + WARDEN_SIDES, a + WARDEN_SIDES, ring < 3 ? 'robe' : 'hood']);
  }
  const top = (WARDEN_RINGS.length - 1) * WARDEN_SIDES;
  for (let i = 0; i < WARDEN_SIDES; i++) f.push([top + i, top + (i + 1) % WARDEN_SIDES, apex, 'hood']);
  return { v, f };
}

// ---- Per-run memory: camera moves and moments that need a start time -------------------------
const memory = new WeakMap();
function remember(s) {
  if (!memory.has(s)) memory.set(s, { geo: null, geoFloor: -1, geoGrid: null, last: [s.x, s.y], walk: 0, speed: 0,
    // Play makes a fresh run that is already playing; treat its first frame as the start, so the camera swoops in.
    phase: s.phase === 'playing' && s.elapsed === 0 ? 'ready' : s.phase, floor: s.floor, swoopAt: null, titleAt: null,
    endAt: null, caughtAt: null, gotAt: null, collected: s.collected, sparks: s.sparks, facing: 0, frameAt: null, orbit: 0 });
  return memory.get(s);
}

// ---- The scene ------------------------------------------------------------------------------
export function roomScene(ctx, w, h, s, { now = 0, reduced = false } = {}) {
  const m = remember(s), look = LOOKS[s.floor], spec = FLOORS[s.floor];
  if (!m.geo || m.geoGrid !== s.grid) { m.geo = build(s, look); m.geoGrid = s.grid; }
  const g = m.geo, dt = m.frameAt === null ? 0 : clamp((now - m.frameAt) / 1000, 0, .1); m.frameAt = now;

  // Moments: the run starting, a new floor, a crystal, a catch, the end.
  if (m.phase !== s.phase) {
    if (s.phase === 'playing' && m.phase === 'ready') { m.swoopAt = now; m.titleAt = now; }
    if (s.phase === 'won' || s.phase === 'lost') m.endAt = now;
    m.phase = s.phase;
  }
  if (m.floor !== s.floor) { m.floor = s.floor; m.swoopAt = now; m.titleAt = now; m.collected = s.collected; m.last = [s.x, s.y]; }
  if (s.collected > m.collected) m.gotAt = now; m.collected = s.collected;
  if (s.sparks < m.sparks) { m.caughtAt = now; m.last = [s.x, s.y]; } m.sparks = s.sparks;

  // Walking: speed from how far you moved, a step bob from how far you have walked.
  const moved = Math.hypot(s.x - m.last[0], s.y - m.last[1]); m.last = [s.x, s.y];
  if (dt > 0 && moved < 1) { m.speed = mix(m.speed, moved / dt, clamp(dt * 10, 0, 1)); m.walk += moved; }
  if (s.phase !== 'playing') m.speed = mix(m.speed, 0, clamp(dt * 6, 0, 1));
  const stride = clamp(m.speed / WALK, 0, SPRINT.speed), bob = reduced ? 0 : Math.sin(m.walk * 6.4) * .022 * Math.min(1, stride), sway = reduced ? 0 : Math.cos(m.walk * 3.2) * .012 * Math.min(1, stride);

  // Poses: your eyes, and the whole floor from above.
  // On a tall phone screen the lens keeps a sensible height and narrows across instead.
  const dirX = Math.cos(s.a), dirZ = Math.sin(s.a), baseFocal = Math.max(w / 2 / Math.tan(.56), h / 2 / Math.tan(.66)), fov = 2 * Math.atan(w / 2 / baseFocal);
  const eyeFP = [s.x - dirZ * sway, .5 + bob, s.y + dirX * sway], targetFP = [eyeFP[0] + dirX, .5 + bob * .4, eyeFP[2] + dirZ];
  if (!reduced && s.phase === 'ready') m.orbit += dt * .07;
  const R = 1.18 * Math.max(g.W, g.H * Math.max(1, w / h * .8)) * (w < h ? 1.25 : 1), centre = [g.W / 2, 0, g.H / 2];
  const eyeOver = [centre[0] + Math.sin(m.orbit) * R * .45, R * .9, centre[2] + Math.cos(m.orbit) * R * .45], targetOver = [centre[0], 0, centre[2] - .5];
  let eye = eyeFP, target = targetFP, roll = 0, focal = baseFocal * (1 - .07 * clamp(stride - 1, 0, 1) / (SPRINT.speed - 1));
  if (s.phase === 'ready') { eye = eyeOver; target = targetOver; focal = baseFocal; }
  else if (m.swoopAt !== null && !reduced && now - m.swoopAt < 1500) {
    // Down from above the floor into your eyes: the first glimpse of its halls.
    const t = (now - m.swoopAt) / 1500, e = ease(t), drop = ease(clamp((t - .15) / .85, 0, 1));
    eye = [mix(eyeOver[0], eyeFP[0], e), mix(eyeOver[1], eyeFP[1], drop * drop * (2 - drop)), mix(eyeOver[2], eyeFP[2], e)];
    target = mix3(targetOver, targetFP, ease(clamp((t - .35) / .65, 0, 1)));
  }
  else if (s.phase === 'won' && m.endAt !== null) {
    const e = reduced ? 1 : ease((now - m.endAt) / 2600);
    eye = mix3(eyeFP, eyeOver, e); target = mix3(targetFP, targetOver, ease(clamp(e * 1.4, 0, 1))); focal = mix(focal, baseFocal, e);
  } else if (s.phase === 'lost' && m.endAt !== null) {
    const e = reduced ? 1 : ease((now - m.endAt) / 1500);
    eye = [eyeFP[0], mix(eyeFP[1], .14, e), eyeFP[2]]; target = [targetFP[0], mix(targetFP[1], .6, e), targetFP[2]]; roll = .38 * e;
  }
  if (m.caughtAt !== null && !reduced && now - m.caughtAt < 450) {
    const k = 1 - (now - m.caughtAt) / 450; eye = [eye[0] + Math.sin(now * .09) * .05 * k, eye[1] + Math.cos(now * .11) * .04 * k, eye[2]]; roll += Math.sin(now * .05) * .06 * k;
  }
  const cam = camera(eye, target, roll, focal, w / 2, h / 2), inside = eye[1] < .99, overhead = eye[1] > 1.01;
  // Fog thins as the camera climbs, so the view from above shows the whole floor.
  const density = look.density * clamp(1.6 - eye[1] * .6, .08, 1), reach = Math.min(24, 4.6 / density);
  // Above the walls a soft light from overhead shows the floor's plan; it fades as you descend.
  const sky = look.sky * clamp((eye[1] - 1) / 3, 0, 1);

  // Lights for this frame.
  const flick = (l, i) => look.lamp?.flicker && !reduced ? (Math.sin(now * .004 + l.phase) > .93 || Math.sin(now * .013 + i) > .97 ? .25 : .92 + Math.sin(now * .02 + l.phase) * .08) : 1;
  const pulse = reduced ? 1 : .85 + Math.sin(now * .0042) * .15;
  const intensity = g.lights.map((l, i) => l.kind === 'lamp' ? look.lamp.colour.map(c => c * look.lamp.strength * flick(l, i))
    : l.kind === 'gem' ? (s.gems[l.index].got ? [0, 0, 0] : l.colour.map(c => c * .95 * pulse))
      : (s.door > 0 ? l.colour.map(c => c * (.25 + s.door * 1.1)) : EXIT_SHUT.map(c => c / 255 * .22)));
  const flame = reduced ? 1 : .94 + Math.sin(now * .017) * .03 + Math.sin(now * .041) * .03;
  const lantern = { p: [s.x, .46, s.y], range: s.lantern, colour: look.lantern, strength: look.lanternStrength * flame };
  const warden = s.warden, wardenLamp = warden ? { p: [warden.x + Math.cos(m.facing + 1.2) * .22, .42, warden.y + Math.sin(m.facing + 1.2) * .22], range: 2.7 } : null;
  const wardenSees = new Map();
  const shadeAt = (face, e) => {
    const at = face.ends[e], list = face.lights[e];
    const k0 = .7 + .6 * Math.max(0, dot(face.n, KEY)), light = [(look.ambient[0] + sky) * k0, (look.ambient[1] + sky) * k0, (look.ambient[2] + sky) * k0];
    for (let i = 0; i < list.length; i += 2) { const c = intensity[list[i]], k = list[i + 1]; light[0] += c[0] * k; light[1] += c[1] * k; light[2] += c[2] * k; }
    // The lantern: brightest where you are looking.
    const toL = sub(lantern.p, at), d = Math.hypot(...toL);
    if (d < lantern.range) {
      // A cone ahead of you, and a softer spill to the sides.
      const lambert = Math.max(0, dot(face.n, [toL[0] / d, toL[1] / d, toL[2] / d])), ahead = -(toL[0] * dirX + toL[2] * dirZ) / d, spot = .3 + .7 * Math.pow(clamp((ahead - .35) / .65, 0, 1), 1.5);
      const k = Math.pow(1 - d / lantern.range, 2) * (.3 + .7 * lambert) * spot * lantern.strength;
      light[0] += lantern.colour[0] * k; light[1] += lantern.colour[1] * k; light[2] += lantern.colour[2] * k;
    }
    if (wardenLamp) {
      const toW = sub(wardenLamp.p, at), dw = Math.hypot(...toW);
      if (dw < wardenLamp.range) {
        if (!wardenSees.has(face.owner)) { const [cx, cy] = face.owner.split(',').map(Number); wardenSees.set(face.owner, inSight(s.grid, wardenLamp.p[0], wardenLamp.p[2], cx + .5, cy + .5)); }
        if (wardenSees.get(face.owner)) {
          const k = Math.pow(1 - dw / wardenLamp.range, 1.5) * (.35 + .65 * Math.max(0, dot(face.n, [toW[0] / dw, toW[1] / dw, toW[2] / dw]))) * 1.1;
          light[0] += WARDEN_LAMP[0] / 255 * k; light[1] += WARDEN_LAMP[1] / 255 * k; light[2] += WARDEN_LAMP[2] / 255 * k;
        }
      }
    }
    const fog = Math.exp(-Math.hypot(...sub(at, eye)) * density);
    return face.albedo.map((c, i) => mix(look.fog[i], 255 * Math.pow(clamp(c * light[i] / 255, 0, 1), look.gamma), fog));
  };
  // Fill a face with its light running from one end to the other.
  const paint = (face, pts) => {
    const a = shadeAt(face, 0), b = shadeAt(face, 1), pa = cam.project(face.ends[0]), pb = cam.project(face.ends[1]);
    if (!pa || !pb || Math.hypot(pb[0] - pa[0], pb[1] - pa[1]) < 2) { const c = mix3(a, b, .5); fillPoly(ctx, pts, css(c)); return c; }
    const g = ctx.createLinearGradient(pa[0], pa[1], pb[0], pb[1]); g.addColorStop(0, css(a)); g.addColorStop(1, css(b));
    fillPoly(ctx, pts, g); return mix3(a, b, .5);
  };

  // The backdrop is the fog itself.
  ctx.fillStyle = css(look.fog); ctx.fillRect(0, 0, w, h); ctx.lineWidth = 1; ctx.lineJoin = 'round';

  // What to draw: from above, everything; from inside, the halls in view.
  const cells = overhead ? null : visible(s.grid, eye[0], eye[2], Math.atan2(cam.f[2], cam.f[0]), Math.min(TAU * .9, fov * 1.4 + (eye[1] - .5) * 2), reach);
  const shown = key => !cells || cells.has(key);
  const faces = cells ? [...cells].flatMap(key => g.byCell.get(key) || []) : g.faces;
  // Floors and ceilings first: nothing on the floor of a hall overlaps another part of it.
  for (const face of faces) {
    if (face.kind === 'wall' || (face.kind === 'ceil' && !inside)) continue;
    const pts = clipped(cam, face.pts, w, h); if (pts) paint(face, pts);
  }
  // Joints between floor tiles and beams across the ceiling, close by.
  const keys = cells ? [...cells] : [...g.byCell.keys()];
  ctx.beginPath();
  for (const key of keys) {
    const [x, z] = key.split(',').map(Number); if (Math.hypot(x + .5 - eye[0], z + .5 - eye[2]) > 7) continue;
    line(ctx, cam, [x, .002, z], [x + 1, .002, z]); line(ctx, cam, [x, .002, z], [x, .002, z + 1]);
  }
  ctx.strokeStyle = css(look.fog.map(c => c * .5), .55); ctx.stroke();
  if (inside) {
    ctx.beginPath(); ctx.lineWidth = 3;
    for (const key of keys) { const [x, z] = key.split(',').map(Number); if (Math.hypot(x + .5 - eye[0], z + .5 - eye[2]) < 7) { line(ctx, cam, [x, .998, z], [x + 1, .998, z]); line(ctx, cam, [x, .998, z], [x, .998, z + 1]); } }
    ctx.strokeStyle = css(look.fog.map(c => c * .4), .7); ctx.stroke(); ctx.lineWidth = 1;
  }
  decals(ctx, cam, s, look, lantern, shown, density, now, reduced, m);

  // Walls, wall tops, crystals, the exit door, lamps and the warden, far to near.
  const items = [];
  for (const key of keys) for (const panel of g.panels.get(key) || []) {
    if (dot(panel.n, sub(eye, panel.c)) <= 0) continue;
    const d = Math.hypot(...sub(panel.c, eye));
    items.push({ d, draw: () => {
      let colour = null, n = 0;
      for (const face of panel.subs) { const pts = clipped(cam, face.pts, w, h); if (!pts) continue; const c = paint(face, pts); colour = colour ? colour.map((v, i) => v + c[i]) : c; n++; }
      if (colour && d < 6.5) material(ctx, cam, panel, look.style, colour.map(v => v / n), 1 - d / 6.5);
    } });
  }
  if (overhead) for (const face of g.tops) items.push({ d: Math.hypot(...sub(face.c, eye)) - .02, draw: () => { const pts = clipped(cam, face.pts, w, h); if (pts) paint(face, pts); } });
  s.gems.forEach((gem, i) => {
    if (gem.got || !shown(`${Math.floor(gem.x)},${Math.floor(gem.y)}`)) return;
    const centre = [gem.x, .44 + (reduced ? 0 : Math.sin(now * .0026 + i * 2) * .035), gem.y];
    items.push({ d: Math.hypot(...sub(centre, eye)), draw: () => crystal(ctx, cam, centre, reduced ? i : now * .0011 + i, density, w, h) });
  });
  if (g.door && shown(`${Math.floor(s.exit.x)},${Math.floor(s.exit.y)}`)) {
    const n = [-g.door[0], 0, -g.door[1]], c = [s.exit.x + g.door[0] * .5, .4, s.exit.y + g.door[1] * .5];
    items.push({ d: Math.hypot(...sub(c, eye)) - .06, draw: () => door(ctx, cam, s, c, n, density, now, reduced, w, h) });
  }
  g.lights.forEach((l, i) => {
    if (l.kind !== 'lamp' || !shown(`${l.cell[0]},${l.cell[1]}`)) return;
    items.push({ d: Math.hypot(...sub(l.p, eye)) - .03, draw: () => lamp(ctx, cam, l, intensity[i], inside, density) });
  });
  if (warden && shown(`${Math.floor(warden.x)},${Math.floor(warden.y)}`)) {
    const want = warden.hunting ? Math.atan2(s.y - warden.y, s.x - warden.x) : warden.from ? Math.atan2(warden.from[1], warden.from[0]) : m.facing;
    let turn = ((want - m.facing + Math.PI) % TAU + TAU) % TAU - Math.PI; m.facing += turn * clamp(dt * 6, 0, 1);
    items.push({ d: Math.hypot(warden.x - eye[0], .5 - eye[1], warden.y - eye[2]), draw: () => wardenFigure(ctx, cam, s, m, lantern, wardenLamp, look, density, now, reduced, w, h) });
  }
  items.sort((a, b) => b.d - a.d).forEach(item => item.draw());

  overlay(ctx, w, h, s, m, cam, look, spec, now, reduced, inside);
}

// Chalk marks where you have walked, and the pad you arrived on.
function decals(ctx, cam, s, look, lantern, shown, density, now, reduced, m) {
  const glowEnd = s.phase === 'won' && m.endAt !== null ? ease((now - m.endAt) / 2000) : 0;
  const pad = [];
  for (let i = 0; i <= 20; i++) { const t = i / 20 * TAU; pad.push(cam.project([1.5 + Math.cos(t) * .3, .004, 1.5 + Math.sin(t) * .3])); }
  if (pad.every(Boolean)) { ctx.strokeStyle = css(look.chalk, .35 * Math.exp(-Math.hypot(1.5 - cam.eye[0], 1.5 - cam.eye[2]) * density)); ctx.beginPath(); pad.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.stroke(); }
  for (let i = 0; i < s.trail.length; i += 2) {
    const [x, z] = s.trail[i]; if (!shown(`${Math.floor(x)},${Math.floor(z)}`)) continue;
    const p = cam.project([x, .003, z]); if (!p) continue;
    const near = Math.max(0, 1 - Math.hypot(x - lantern.p[0], z - lantern.p[2]) / lantern.range), lit = clamp(look.ambient[0] * 2.4 + near, 0, 1);
    const alpha = Math.max(lit * .4, glowEnd * .9) * Math.exp(-p[2] * density), r = Math.max(.6, cam.focal * .016 / p[2]);
    if (alpha < .02) continue;
    ctx.fillStyle = css(glowEnd ? mix3(look.chalk, [255, 255, 255], glowEnd * .3) : look.chalk, alpha);
    ctx.beginPath(); ctx.ellipse(p[0], p[1], r, r * .45, 0, 0, TAU); ctx.fill();
  }
}

// A crystal: an elongated octahedron that turns, glows and lights the hall around it.
function crystal(ctx, cam, c, spin, density, w, h) {
  const ring = [0, 1, 2, 3].map(i => { const t = spin + i * Math.PI / 2; return [c[0] + Math.cos(t) * .085, c[1], c[2] + Math.sin(t) * .085]; });
  const top = [c[0], c[1] + .18, c[2]], bottom = [c[0], c[1] - .15, c[2]], fog = Math.exp(-Math.hypot(...sub(c, cam.eye)) * density * .55);
  const glowAt = cam.project(c);
  if (glowAt) {
    const r = cam.focal * (cam.eye[1] > 1 ? 1.1 : .55) / glowAt[2]; ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const halo = ctx.createRadialGradient(glowAt[0], glowAt[1], 0, glowAt[0], glowAt[1], r); halo.addColorStop(0, css(CRYSTAL, .38 * fog)); halo.addColorStop(.35, css(CRYSTAL, .12 * fog)); halo.addColorStop(1, css(CRYSTAL, 0));
    ctx.fillStyle = halo; ctx.fillRect(glowAt[0] - r, glowAt[1] - r, r * 2, r * 2); ctx.restore();
  }
  const faces = [];
  for (let i = 0; i < 4; i++) for (const tip of [top, bottom]) {
    const a = ring[i], b = ring[(i + 1) % 4], n = norm(cross(sub(b, a), sub(tip, a))), outward = dot(n, sub(a, c)) > 0 ? n : n.map(v => -v);
    if (dot(outward, sub(cam.eye, a)) <= 0) continue;
    const pts = clipped(cam, [a, b, tip], w, h); if (!pts) continue;
    // Lit from inside: facets toward the light go pale, the rest stay a deep glowing green.
    const k = Math.max(0, dot(outward, norm([-.3, .8, -.4]))), lit = tip === top ? .35 + .65 * k : .15 + .4 * k;
    faces.push({ d: Math.hypot(...sub(mix3(mix3(a, b, .5), tip, .33), cam.eye)), pts, colour: mix3([10, 20, 12], mix3([70, 160, 70], [235, 255, 200], lit), fog) });
  }
  faces.sort((p, q) => q.d - p.d).forEach(f => fillPoly(ctx, f.pts, css(f.colour)));
}

// The exit: a door in the end wall. Three lights over it count your crystals; with all three
// the doors slide apart and pink light spills out from the stairs beyond.
function door(ctx, cam, s, c, n, density, now, reduced, w, h) {
  const t = [n[2], 0, -n[0]], at = (u, v, off = .012) => [c[0] + t[0] * u + n[0] * off, v, c[2] + t[2] * u + n[2] * off];
  const quad = (u0, u1, v0, v1, off) => clipped(cam, [at(u0, v0, off), at(u1, v0, off), at(u1, v1, off), at(u0, v1, off)], w, h);
  const fog = Math.exp(-Math.hypot(...sub(c, cam.eye)) * density), open = s.door, shade = (rgb, k = 1) => css(mix3([4, 4, 6], rgb.map(v => v * k), fog));
  let p = quad(-.34, .34, 0, .86, .01); if (p) fillPoly(ctx, p, shade([48, 44, 50]));
  p = quad(-.27, .27, 0, .76, .016);
  if (p) {
    // The opening: dark when locked, bright pink when the doors part.
    if (!open) fillPoly(ctx, p, shade([26, 24, 30]));
    else {
      // Light coming up the stairs: deep at the top of the opening, nearly white at the bottom.
      const top = cam.project(at(0, .76, .016)), foot = cam.project(at(0, 0, .016)), pulse = 1 + (reduced ? 0 : Math.sin(now * .005) * .06);
      const g = top && foot ? ctx.createLinearGradient(top[0], top[1], foot[0], foot[1]) : null;
      if (g) { g.addColorStop(0, shade([150, 60, 110], open * pulse)); g.addColorStop(.6, shade(EXIT_OPEN, open * pulse)); g.addColorStop(1, shade([255, 236, 244], open * pulse)); fillPoly(ctx, p, g); }
      else fillPoly(ctx, p, shade(EXIT_OPEN, open));
      ctx.beginPath(); for (const v of [.08, .18, .28, .38]) line(ctx, cam, at(-.27, v, .018), at(.27, v, .018));
      ctx.strokeStyle = css([150, 70, 110], .5 * open * fog); ctx.stroke();
    }
  }
  const slide = .27 * ease(open);
  for (const side of [-1, 1]) { p = quad(side < 0 ? -.27 - 0 : slide, side < 0 ? -slide : .27, 0, .76, .02); if (p && slide < .265) fillPoly(ctx, p, shade(open ? [120, 108, 116] : [92, 98, 88], .9)); }
  for (let i = 0; i < 3; i++) { p = quad(-.12 + i * .09 - .025, -.12 + i * .09 + .025, .8, .835, .02); if (p) fillPoly(ctx, p, i < s.collected ? css(mix3([4, 4, 6], CRYSTAL, Math.max(fog, .6))) : shade([40, 46, 36])); }
  if (open) {
    const mid = cam.project(at(0, .4, .2));
    if (mid) { const r = cam.focal * .9 / mid[2], g = ctx.createRadialGradient(mid[0], mid[1], 0, mid[0], mid[1], r); g.addColorStop(0, css(EXIT_OPEN, .32 * open * fog)); g.addColorStop(1, css(EXIT_OPEN, 0)); ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g; ctx.fillRect(mid[0] - r, mid[1] - r, r * 2, r * 2); ctx.restore(); }
  }
}

function lamp(ctx, cam, l, rgb, inside, density) {
  const fog = Math.exp(-Math.hypot(...sub(l.p, cam.eye)) * density * .6), k = Math.max(rgb[0], rgb[1], rgb[2]);
  if (inside) {
    const disc = []; for (let i = 0; i < 10; i++) { const t = i / 10 * TAU; disc.push([l.p[0] + Math.cos(t) * .07, .995, l.p[2] + Math.sin(t) * .07]); }
    const pts = disc.map(p => cam.project(p)); if (pts.every(Boolean)) fillPoly(ctx, pts, css(mix3([20, 18, 14], rgb.map(v => 120 + v * 120), fog)));
  }
  const p = cam.project([l.p[0], .97, l.p[2]]); if (!p || p[2] < .35) return;
  const r = Math.min(cam.focal * .42 / p[2], cam.focal * .7); ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], r); g.addColorStop(0, css(rgb.map(v => v * 255), .3 * fog * Math.min(1, k))); g.addColorStop(1, css(rgb.map(v => v * 255), 0));
  ctx.fillStyle = g; ctx.fillRect(p[0] - r, p[1] - r, r * 2, r * 2); ctx.restore();
}

function wardenFigure(ctx, cam, s, m, lantern, wardenLamp, look, density, now, reduced, w, h) {
  const wd = s.warden, sway = reduced ? 0 : Math.sin(now * .004) * .04 + (wd.hunting ? .06 : 0);
  const { v, f } = wardenMesh(wd.x, wd.y, m.facing, sway), centre = [wd.x, .5, wd.y], fog = Math.exp(-Math.hypot(...sub(centre, cam.eye)) * density * .8);
  const faces = [];
  for (const face of f) {
    const pts3 = face.slice(0, -1).map(i => v[i]);
    let n = norm(cross(sub(pts3[1], pts3[0]), sub(pts3[2], pts3[0]))); if (dot(n, sub(pts3[0], centre)) < 0) n = n.map(x => -x);
    const mid = pts3.reduce((a, p) => [a[0] + p[0] / pts3.length, a[1] + p[1] / pts3.length, a[2] + p[2] / pts3.length], [0, 0, 0]);
    if (dot(n, sub(cam.eye, mid)) <= 0) continue;
    const pts = clipped(cam, pts3, w, h); if (!pts) continue;
    // Dark cloth: lit a little by your lantern, warm on the side its own lamp hangs, and a rim at the edges.
    let light = look.ambient[0] * 2;
    const toL = sub(lantern.p, mid), d = Math.hypot(...toL); if (d < lantern.range) light += Math.pow(1 - d / lantern.range, 2) * Math.max(.2, dot(n, norm(toL))) * lantern.strength * .5;
    const toW = sub(wardenLamp.p, mid), warm = Math.max(0, dot(n, norm(toW))) * Math.max(0, 1 - Math.hypot(...toW) / .9);
    const rim = Math.pow(1 - Math.abs(dot(n, norm(sub(cam.eye, mid)))), 3) * .6;
    const base = face.at(-1) === 'robe' ? [34, 26, 30] : [22, 17, 22];
    const colour = base.map((c, i) => c * (.5 + light) + WARDEN_LAMP[i] * warm * .55 + [90, 50, 40][i] * rim);
    faces.push({ d: Math.hypot(...sub(mid, cam.eye)), pts, colour: mix3(look.fog, colour, fog) });
  }
  faces.sort((a, b) => b.d - a.d).forEach(face => fillPoly(ctx, face.pts, css(face.colour)));
  // Eyes under the hood, and the lamp in its hand.
  const fx = Math.cos(m.facing), fz = Math.sin(m.facing), side = [-fz, 0, fx], eyeColour = wd.hunting ? [255, 80, 60] : [255, 180, 110];
  for (const k of [-1, 1]) {
    const e = [wd.x + fx * (.13 + sway * .85) + side[0] * .04 * k, .87, wd.y + fz * (.13 + sway * .85) + side[2] * .04 * k];
    if (dot([fx, 0, fz], sub(cam.eye, e)) <= 0) continue;
    const p = cam.project(e); if (!p) continue;
    const r = Math.max(.8, cam.focal * .014 / p[2]); ctx.fillStyle = css(eyeColour, Math.max(fog, .5)); ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, TAU); ctx.fill();
  }
  const lp = cam.project(wardenLamp.p);
  if (lp) {
    const flicker = reduced ? 1 : .85 + Math.sin(now * .03) * .08 + Math.sin(now * .071) * .07, r = cam.focal * .5 / lp[2];
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(lp[0], lp[1], 0, lp[0], lp[1], r); g.addColorStop(0, css(WARDEN_LAMP, .55 * flicker * Math.max(fog, .4))); g.addColorStop(.2, css(WARDEN_LAMP, .16 * flicker * Math.max(fog, .4))); g.addColorStop(1, css(WARDEN_LAMP, 0));
    ctx.fillStyle = g; ctx.fillRect(lp[0] - r, lp[1] - r, r * 2, r * 2); ctx.restore();
    ctx.fillStyle = css([255, 230, 180], Math.max(fog, .5)); ctx.fillRect(lp[0] - Math.max(1, r * .05), lp[1] - Math.max(1.5, r * .08), Math.max(2, r * .1), Math.max(3, r * .16));
  }
}

// ---- Overlay: map, crystals, sparks, breath, the floor's title, and moments ------------------
function overlay(ctx, w, h, s, m, cam, look, spec, now, reduced, inside) {
  const small = w < 520, playing = s.phase === 'playing' || s.phase === 'paused';
  // Edges darken, and close in further while the warden is hunting you.
  const near = s.warden ? clamp(1 - Math.hypot(s.warden.x - s.x, s.warden.y - s.y) / 6, 0, 1) : 0, hunted = s.warden?.hunting && playing ? .35 + near * .65 : 0;
  const v = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * .25, w / 2, h / 2, Math.max(w, h) * .72);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, hunted ? `rgba(${Math.round(70 + 80 * hunted)},6,6,${.55 + .3 * hunted * (reduced ? 1 : .8 + Math.sin(now * .012) * .2)})` : 'rgba(0,0,0,.55)');
  ctx.fillStyle = v; ctx.fillRect(0, 0, w, h);
  if (m.gotAt !== null && now - m.gotAt < 600) { ctx.fillStyle = css(CRYSTAL, .18 * (1 - (now - m.gotAt) / 600)); ctx.fillRect(0, 0, w, h); }
  if (m.caughtAt !== null && now - m.caughtAt < 900) { ctx.fillStyle = `rgba(150,10,10,${.5 * (1 - (now - m.caughtAt) / 900)})`; ctx.fillRect(0, 0, w, h); }
  if (s.phase === 'lost' && m.endAt !== null) { ctx.fillStyle = `rgba(40,0,0,${.55 * ease((now - m.endAt) / 1500)})`; ctx.fillRect(0, 0, w, h); }
  if (s.phase === 'ready' || s.phase === 'won' || s.phase === 'lost') return;
  if (inside && s.phase === 'playing') { ctx.strokeStyle = 'rgba(235,240,215,.28)'; ctx.beginPath(); ctx.moveTo(w / 2 - 4, h / 2); ctx.lineTo(w / 2 + 4, h / 2); ctx.moveTo(w / 2, h / 2 - 4); ctx.lineTo(w / 2, h / 2 + 4); ctx.stroke(); }

  // Map, top right: what you have seen so far, or all of it with the map revealed.
  const cols = s.grid[0].length, rows = s.grid.length, cell = Math.min(small ? 4.4 : 6, (w * .3) / cols), mapW = cols * cell, mapH = rows * cell, ox = w - mapW - 14, oy = 15;
  ctx.fillStyle = 'rgba(4,8,6,.78)'; ctx.fillRect(ox - 5, oy - 5, mapW + 10, mapH + 10);
  const known = (x, y) => s.reveal || [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => s.visited.has(`${x + dx},${y + dy}`));
  s.grid.forEach((row, y) => [...row].forEach((c, x) => { if (!known(x, y)) return; ctx.fillStyle = c === '1' ? look.map + '70' : look.map + '16'; ctx.fillRect(ox + x * cell, oy + y * cell, cell - .5, cell - .5); }));
  ctx.strokeStyle = look.map + '80'; ctx.beginPath(); s.trail.forEach(([x, y], i) => i ? ctx.lineTo(ox + x * cell, oy + y * cell) : ctx.moveTo(ox + x * cell, oy + y * cell)); ctx.stroke();
  for (const gem of s.gems) if (!gem.got && known(Math.floor(gem.x), Math.floor(gem.y))) { ctx.fillStyle = css(CRYSTAL); ctx.fillRect(ox + gem.x * cell - 1.5, oy + gem.y * cell - 1.5, 3, 3); }
  if (known(Math.floor(s.exit.x), Math.floor(s.exit.y))) { ctx.fillStyle = s.collected === 3 ? css(EXIT_OPEN) : '#8c9484'; ctx.fillRect(ox + s.exit.x * cell - 2, oy + s.exit.y * cell - 2, 4, 4); }
  // The warden shows only when it is in sight of you or of the hall you are in.
  if (s.warden && inSight(s.grid, s.x, s.y, s.warden.x, s.warden.y)) { ctx.fillStyle = s.warden.hunting ? '#ff5a46' : '#ffad6e'; ctx.beginPath(); ctx.arc(ox + s.warden.x * cell, oy + s.warden.y * cell, 2.4, 0, TAU); ctx.fill(); }
  const dx = Math.cos(s.a), dy = Math.sin(s.a);
  ctx.fillStyle = '#f4f5df'; ctx.beginPath(); ctx.arc(ox + s.x * cell, oy + s.y * cell, 2, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#edf3d6'; ctx.beginPath(); ctx.moveTo(ox + s.x * cell, oy + s.y * cell); ctx.lineTo(ox + (s.x + dx * 1.2) * cell, oy + (s.y + dy * 1.2) * cell); ctx.stroke();

  // Bottom left: crystals on this floor, sparks left, and breath for running.
  const x0 = 16, y0 = h - (small ? 86 : 30);
  ctx.textAlign = 'left';
  for (let i = 0; i < 3; i++) {
    const cx = x0 + 8 + i * 20, cy = y0 - 4, got = i < s.collected;
    ctx.beginPath(); ctx.moveTo(cx, cy - 8); ctx.lineTo(cx + 5, cy); ctx.lineTo(cx, cy + 7); ctx.lineTo(cx - 5, cy); ctx.closePath();
    ctx.fillStyle = got ? css(CRYSTAL) : 'rgba(220,230,200,.12)'; ctx.fill(); ctx.strokeStyle = got ? css(CRYSTAL) : 'rgba(220,230,200,.4)'; ctx.stroke();
  }
  const sx = x0 + 74;
  for (let i = 0; i < 3; i++) {
    const cx = sx + i * 15, cy = y0 - 4, lit = i < s.sparks;
    ctx.fillStyle = lit ? 'rgba(255,214,150,.95)' : 'rgba(255,214,150,.16)'; ctx.beginPath();
    for (let k = 0; k < 8; k++) { const r = k % 2 ? 2 : 5.5, t = k / 8 * TAU - Math.PI / 2; k ? ctx.lineTo(cx + Math.cos(t) * r, cy + Math.sin(t) * r) : ctx.moveTo(cx + Math.cos(t) * r, cy + Math.sin(t) * r); }
    ctx.closePath(); ctx.fill();
  }
  const bx = sx + 52, bw = small ? 54 : 74;
  ctx.fillStyle = 'rgba(220,230,200,.14)'; ctx.fillRect(bx, y0 - 6, bw, 4);
  ctx.fillStyle = s.winded ? 'rgba(255,120,100,.8)' : s.sprinting ? 'rgba(240,250,210,.95)' : 'rgba(220,230,200,.6)'; ctx.fillRect(bx, y0 - 6, bw * s.stamina, 4);
  ctx.font = `600 9px ui-monospace, monospace`; ctx.fillStyle = 'rgba(220,230,200,.6)'; ctx.fillText(s.winded ? 'WINDED' : 'RUN', bx, y0 + 8);

  // The floor's title, as it begins.
  if (m.titleAt !== null && now - m.titleAt < 3000 && s.phase === 'playing') {
    const t = (now - m.titleAt) / 3000, a = Math.min(1, t * 5, (1 - t) * 3.5), y = h * (small ? .3 : .36);
    ctx.textAlign = 'center'; ctx.fillStyle = `rgba(0,0,0,${.35 * a})`; ctx.fillRect(0, y - 46, w, 84);
    ctx.font = `600 ${small ? 10 : 11}px ui-monospace, monospace`; ctx.fillStyle = css(look.chalk, .8 * a); ctx.fillText(`FLOOR ${s.floor + 1} OF ${FLOORS.length}`, w / 2, y - 22);
    ctx.font = `600 ${small ? 24 : 32}px Georgia, serif`; ctx.fillStyle = `rgba(246,246,230,${a})`; ctx.fillText(spec.name, w / 2, y + 8);
    ctx.font = `${small ? 12 : 14}px Georgia, serif`; ctx.fillStyle = `rgba(236,236,220,${.82 * a})`; ctx.fillText(spec.brief, w / 2, y + 30);
  }
  ctx.textAlign = 'left';
}
