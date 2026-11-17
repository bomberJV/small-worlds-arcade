// Ring Runner's scene: a chase camera behind a faceted ship, lit rings with depth, three
// sector skies, rocks, shield cells, an engine trail and dust that streaks on boost.
// Canvas 2D with its own projection; the rules live in engine.js and are not changed here.
import { clamp, ringAt, randomSeed, SECTORS, SHIP_RADIUS } from './engine.js';

const TAU = Math.PI * 2;
const mix = (a, b, t) => a + (b - a) * t;
const ease = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const norm = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const LIGHT = norm([-.45, .75, -.5]);            // the sun is up and to the left, behind
const rgb = (c, k = 1, a = 1) => `rgba(${Math.round(clamp(c[0] * k, 0, 255))},${Math.round(clamp(c[1] * k, 0, 255))},${Math.round(clamp(c[2] * k, 0, 255))},${a})`;

// Per-sector sky: top and bottom of the gradient, the haze colour and the dust colour.
const SKIES = [
  { top: [6, 16, 24], bottom: [12, 34, 40], haze: [70, 130, 140], dust: [196, 222, 214] },
  { top: [14, 12, 10], bottom: [34, 27, 20], haze: [150, 118, 82], dust: [222, 205, 180] },
  { top: [13, 9, 26], bottom: [36, 18, 48], haze: [150, 90, 190], dust: [220, 200, 240] },
];

// A camera: where it is, its three axes and its lens.
function camera(eye, target, roll, focal, cx, cy) {
  const f = norm([target[0] - eye[0], target[1] - eye[1], target[2] - eye[2]]);
  let r = norm(cross([0, 1, 0], f)), u = cross(f, r);
  if (roll) { const c = Math.cos(roll), s = Math.sin(roll); [r, u] = [r.map((v, i) => v * c + u[i] * s), u.map((v, i) => u[i] * c - r[i] * s)]; }
  const view = p => { const d = [p[0] - eye[0], p[1] - eye[1], p[2] - eye[2]]; return [dot(d, r), dot(d, u), dot(d, f)]; };
  return {
    eye, r, u, f, focal, cx, cy, view,
    // Screen position and depth of a world point, or null behind the lens.
    project(p) { const v = view(p); if (v[2] < .25) return null; return [cx + v[0] * focal / v[2], cy - v[1] * focal / v[2], v[2]]; },
    // A direction at infinity: stars, the planet, the nebula.
    far(d) { const z = dot(d, f); if (z < .05) return null; return [cx + dot(d, r) * focal / z, cy - dot(d, u) * focal / z, z]; },
  };
}

// ---- Models -----------------------------------------------------------------------------
// The ship, nose along +z. Faces carry a material: hull, wing, canopy or fin.
const SHIP_V = [[0, 0, 1.55], [0, .27, .15], [0, -.19, .1], [-.38, 0, -.1], [.38, 0, -.1], [0, .2, -.82], [0, -.13, -.82], [-.3, 0, -.82],
  [.3, 0, -.82], [-1.28, -.06, -.78], [1.28, -.06, -.78], [0, .64, -1], [0, .24, -.32], [-1.05, -.04, -.98], [1.05, -.04, -.98]];
const SHIP_F = [[0, 1, 3, 'canopy'], [0, 4, 1, 'canopy'], [0, 3, 2, 'hull'], [0, 2, 4, 'hull'], [1, 7, 3, 'hull'], [1, 5, 7, 'hull'], [1, 8, 5, 'hull'],
  [1, 4, 8, 'hull'], [2, 3, 7, 'belly'], [2, 7, 6, 'belly'], [2, 6, 8, 'belly'], [2, 8, 4, 'belly'], [5, 6, 7, 'tail'], [5, 8, 6, 'tail'],
  [3, 9, 7, 'wing'], [9, 13, 7, 'wing'], [4, 8, 10, 'wing'], [10, 8, 14, 'wing'], [12, 11, 5, 'fin']];
const MATERIALS = { hull: [196, 208, 196], belly: [120, 132, 126], wing: [92, 112, 104], tail: [60, 70, 66], canopy: [84, 196, 196], fin: [210, 236, 128] };

// A rock: an icosahedron pushed in and out, the same every time for its shape number.
const ICO = (() => {
  const t = (1 + Math.sqrt(5)) / 2, v = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]].map(norm);
  const f = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
  return { v, f };
})();
const rockShapes = new Map();
function rockShape(id) {
  if (!rockShapes.has(id)) { const random = randomSeed(id); rockShapes.set(id, ICO.v.map(p => p.map(c => c * (.72 + random() * .5)))); }
  return rockShapes.get(id);
}
const rotate = (p, ax, ay, az) => {
  let [x, y, z] = p, c, s;
  c = Math.cos(ax); s = Math.sin(ax); [y, z] = [y * c - z * s, y * s + z * c];
  c = Math.cos(ay); s = Math.sin(ay); [x, z] = [x * c + z * s, -x * s + z * c];
  c = Math.cos(az); s = Math.sin(az); [x, y] = [x * c - y * s, x * s + y * c];
  return [x, y, z];
};

// Faces of a mesh in world space, lit, ready to sort with everything else.
function meshFaces(cam, verts, faces, place, colourOf, glow = 0) {
  const world = verts.map(place), out = [];
  for (const face of faces) {
    const [a, b, c] = [world[face[0]], world[face[1]], world[face[2]]];
    const pa = cam.project(a), pb = cam.project(b), pc = cam.project(c);
    if (!pa || !pb || !pc) continue;
    let n = norm(cross([b[0] - a[0], b[1] - a[1], b[2] - a[2]], [c[0] - a[0], c[1] - a[1], c[2] - a[2]]));
    const toEye = norm([cam.eye[0] - a[0], cam.eye[1] - a[1], cam.eye[2] - a[2]]);
    if (dot(n, toEye) < 0) n = n.map(v => -v);   // two-sided: light the face that is seen
    const lambert = Math.max(0, dot(n, LIGHT)), rim = Math.pow(1 - Math.abs(dot(n, toEye)), 3);
    out.push({ depth: (pa[2] + pb[2] + pc[2]) / 3, points: [pa, pb, pc], colour: colourOf(face), light: .3 + .75 * lambert + glow, rim });
  }
  return out;
}

let sceneryCache = null;
function scenery(from, to) {
  if (sceneryCache?.from === from && sceneryCache.to === to) return sceneryCache.rocks;
  const random = randomSeed(907), rocks = [];
  for (let i = 0; i < 46; i++) {
    const side = random() < .5 ? -1 : 1, x = side * (8 + random() * 16), y = (random() - .5) * 22;
    rocks.push({ x, y: Math.abs(y) < 5 && Math.abs(x) < 10 ? y + 8 * Math.sign(y || 1) : y, z: from + random() * (to - from), r: .5 + random() * random() * 3.2, spin: .2 + random() * .6, shape: 5000 + i });
  }
  sceneryCache = { from, to, rocks };
  return rocks;
}

// ---- Per-run memory: the engine trail and when the run ended ----------------------------
const memory = new WeakMap();
function remember(s) { if (!memory.has(s)) memory.set(s, { trail: [], ended: null, last: null, readyAngle: 2.35 }); return memory.get(s); }

// ---- The scene ---------------------------------------------------------------------------
export function flightScene(ctx, w, h, s, { now = 0, reduced = false } = {}) {
  const mem = remember(s);
  const sectorZ = k => s.rings.find(r => r.sector === k)?.z ?? 0;
  // Sky blends from one sector to the next over the gap before its first ring.
  let sky = 0;
  for (let k = 1; k < SECTORS.length; k++) sky += ease((s.z - (sectorZ(k) - 55)) / 40);
  const k0 = Math.min(SECTORS.length - 1, Math.floor(sky)), k1 = Math.min(SECTORS.length - 1, k0 + 1), kt = sky - k0;
  const tone = key => SKIES[k0][key].map((c, i) => mix(c, SKIES[k1][key][i], kt));
  const finished = ['won', 'lost'].includes(s.phase);
  if (finished && mem.ended === null) mem.ended = now;
  if (!finished) mem.ended = null;
  const after = mem.ended === null ? 0 : (now - mem.ended) / 1000;
  // Where the ship is drawn: past the end it carries on at cruise.
  const shipZ = s.z + (s.phase === 'won' ? after * 9 : 0);
  const ship = [s.x, s.y, shipZ];

  // Camera. In the run: behind and above, lagging the ship a little and banking with it.
  const focal = Math.min(w, h) * 1.02 + Math.abs(w - h) * .22, cx = w / 2, cy = h * .5;
  // The ship sits low in the frame so the ring ahead stays in sight above it.
  const chase = { eye: [s.x * .72, s.y * .72 + 1.45, shipZ - 5.4], target: [s.x * .88, s.y * .88 + 1.05, shipZ + 16], roll: reduced ? 0 : -s.vx * .028 };
  // Before the run, and after it, the camera circles the ship.
  const orbit = angle => ({ eye: [s.x + Math.sin(angle) * 5.2, s.y + 1.25 + Math.sin(angle * .7) * .45, shipZ + Math.cos(angle) * 5.2], target: [s.x, s.y + .1, shipZ + .4], roll: 0 });
  let view = chase;
  const blend = (a, b, t) => ({ eye: a.eye.map((v, i) => mix(v, b.eye[i], t)), target: a.target.map((v, i) => mix(v, b.target[i], t)), roll: mix(a.roll, b.roll, t) });
  if (s.phase === 'ready') { mem.readyAngle = reduced ? 2.35 : 2.35 + (now * .00022) % TAU; view = orbit(mem.readyAngle); }
  else if (s.phase === 'playing' && !reduced && s.elapsed < 1.6) {
    // The launch: the camera swings from where it was circling round to behind the ship.
    view = blend(orbit(mem.readyAngle), chase, ease(s.elapsed / 1.6));
  } else if (finished && !reduced) {
    // The finish: the camera rises and pulls back round the ship.
    const t = ease(after / 2.4), angle = Math.PI - .9 + after * .25, radius = 5.2 * (1 + t * .7);
    const wide = { eye: [s.x + Math.sin(angle) * radius, s.y + 1.25 + t * 1.6, shipZ + Math.cos(angle) * radius], target: [s.x, s.y + .1, shipZ + .4], roll: 0 };
    view = blend(chase, wide, t);
  }
  // A knock when a rock or a ring is missed.
  const shake = reduced ? 0 : s.flash * s.flash * .12;
  if (shake) { view.eye = [view.eye[0] + Math.sin(now * .09) * shake, view.eye[1] + Math.cos(now * .11) * shake, view.eye[2]]; }
  const cam = camera(view.eye, view.target, view.roll, focal, cx, cy);

  // ---- Sky ------------------------------------------------------------------------------
  const top = tone('top'), bottom = tone('bottom'), haze = tone('haze'), dustColour = tone('dust');
  const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, rgb(top)); g.addColorStop(1, rgb(bottom));
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  const horizon = cam.far([0, 0, 1]);
  if (horizon) {
    const glow = ctx.createRadialGradient(horizon[0], horizon[1], 0, horizon[0], horizon[1], Math.max(w, h) * .75);
    glow.addColorStop(0, rgb(haze, 1, .22)); glow.addColorStop(.5, rgb(haze, 1, .06)); glow.addColorStop(1, rgb(haze, 1, 0));
    ctx.fillStyle = glow; ctx.fillRect(0, 0, w, h);
  }
  // Stars at infinity.
  for (const p of s.stars) {
    const az = p.x / 50 * Math.PI, el = p.y / 32.5 * 1.25, d = [Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)], at = cam.far(d);
    if (!at || at[0] < -4 || at[0] > w + 4 || at[1] < -4 || at[1] > h + 4) continue;
    const twinkle = reduced ? .7 : .55 + .45 * Math.sin(now * .002 + p.z);
    ctx.fillStyle = `rgba(214,228,224,${(.25 + .5 * (p.z / 300)) * twinkle})`; ctx.fillRect(at[0], at[1], p.z > 250 ? 1.6 : 1, p.z > 250 ? 1.6 : 1);
  }
  backdrop(ctx, w, h, cam, k0, k1, kt, now, reduced, s);

  // ---- Things in the world, sorted far to near -------------------------------------------
  const items = [];
  const t = s.elapsed;
  const next = s.rings.find(r => !r.result);
  for (const ring of s.rings) {
    const ahead = ring.z - shipZ;
    if (ahead < -8 || ahead > 190) continue;
    ringItems(ctx, items, cam, ring, ringAt(ring, ring.at ?? t), ring === next, t, now, reduced);
  }
  for (const rock of s.rocks) {
    const ahead = rock.z - shipZ; if (ahead < -8 || ahead > 170) continue;
    const shape = rockShape(rock.shape), spin = (reduced ? 0 : now * .001) * rock.spin;
    const faces = meshFaces(cam, shape, ICO.f, p => { const q = rotate(p, spin + rock.shape, spin * .7, rock.shape * .3); return [rock.x + q[0] * rock.r, rock.y + q[1] * rock.r, rock.z + q[2] * rock.r]; },
      () => rock.hit ? [150, 90, 80] : [128, 112, 96]);
    for (const f of faces) items.push({ depth: f.depth, draw: () => face(ctx, f) });
  }
  // The rest of the debris field: rocks outside the lane, for the look of the place only.
  const field = s.rings.filter(r => r.sector === 1);
  if (field.length) for (const rock of scenery(field[0].z - 40, field[field.length - 1].z + 30)) {
    const ahead = rock.z - shipZ; if (ahead < -10 || ahead > 200) continue;
    const shape = rockShape(rock.shape), spin = (reduced ? 0 : now * .0006) * rock.spin;
    for (const f of meshFaces(cam, shape, ICO.f, p => { const q = rotate(p, spin + rock.shape, spin, 0); return [rock.x + q[0] * rock.r, rock.y + q[1] * rock.r, rock.z + q[2] * rock.r]; }, () => [104, 92, 80]))
      items.push({ depth: f.depth, draw: () => face(ctx, f) });
  }
  for (const cell of s.cells) {
    const ahead = cell.z - shipZ; if (ahead < -6 || ahead > 150) continue;
    const at = cam.project([cell.x, cell.y, cell.z]); if (!at) continue;
    items.push({ depth: at[2], draw: () => shieldCell(ctx, cam, cell, at, now, t, reduced) });
  }
  // The ship.
  const bank = reduced ? -s.vx * .06 : -s.vx * .11 + (s.phase === 'ready' ? Math.sin(now * .0012) * .05 : 0), pitch = s.vy * .055, yaw = s.vx * .04;
  const shipFaces = meshFaces(cam, SHIP_V, SHIP_F, p => { const q = rotate(p, -pitch, yaw, bank); return [ship[0] + q[0] * .5, ship[1] + q[1] * .5, ship[2] + q[2] * .5]; },
    f => MATERIALS[f[3]], s.flash * .4);
  const shipDepth = cam.view(ship)[2];
  for (const f of shipFaces) items.push({ depth: f.depth, draw: () => face(ctx, f, f.colour === MATERIALS.canopy) });
  const tail = rotate([0, 0, -.9 * .5], -pitch, yaw, bank).map((v, i) => v + ship[i]);
  items.push({ depth: shipDepth + .4, draw: () => engine(ctx, cam, tail, s, now, reduced) });
  // The engine trail: where the tail has been.
  if (s.phase === 'playing' || finished) {
    if (!mem.last || mem.last !== s.elapsed) { mem.trail.push([...tail]); mem.last = s.elapsed; if (mem.trail.length > 46) mem.trail.shift(); }
  } else mem.trail.length = 0;
  items.push({ depth: shipDepth + 1.5, draw: () => trail(ctx, cam, mem.trail, s) });

  items.sort((a, b) => b.depth - a.depth);
  for (const item of items) item.draw();

  // ---- Dust: close particles that stream past and streak on boost ------------------------
  dust(ctx, w, h, cam, s, shipZ, dustColour, reduced);

  // ---- On the glass ----------------------------------------------------------------------
  overlay(ctx, w, h, cam, s, next, ship, now, reduced, after);
}

// Each sector's backdrop at infinity.
function backdrop(ctx, w, h, cam, k0, k1, kt, now, reduced, s) {
  const weight = k => (k === k0 ? 1 - kt : 0) + (k === k1 && k1 !== k0 ? kt : 0);
  const unit = Math.min(w, h);
  // Low orbit: a planet with its atmosphere and a ring system, below and to the left.
  if (weight(0) > .01) {
    const at = cam.far(norm([-.75, -.42, 1])), a = weight(0);
    if (at) {
      const r = unit * .34;
      ctx.save(); ctx.globalAlpha = a;
      const air = ctx.createRadialGradient(at[0], at[1], r * .95, at[0], at[1], r * 1.18);
      air.addColorStop(0, '#6fd2d066'); air.addColorStop(1, '#6fd2d000'); ctx.fillStyle = air; ctx.beginPath(); ctx.arc(at[0], at[1], r * 1.18, 0, TAU); ctx.fill();
      const body = ctx.createRadialGradient(at[0] - r * .45, at[1] - r * .5, r * .1, at[0], at[1], r);
      body.addColorStop(0, '#3f7f84'); body.addColorStop(.55, '#1d4448'); body.addColorStop(1, '#0a1a1e'); ctx.fillStyle = body;
      ctx.beginPath(); ctx.arc(at[0], at[1], r, 0, TAU); ctx.fill();
      // Cloud bands.
      ctx.save(); ctx.beginPath(); ctx.arc(at[0], at[1], r, 0, TAU); ctx.clip();
      for (let i = 0; i < 7; i++) {
        const y = at[1] - r + (i + .5) * r * 2 / 7 + Math.sin(i * 2.3) * r * .05;
        ctx.fillStyle = `rgba(190,232,226,${.025 + .02 * Math.sin(i * 1.7 + (reduced ? 0 : now * .00005))})`;
        ctx.fillRect(at[0] - r, y, r * 2, r * .07);
      }
      const night = ctx.createLinearGradient(at[0] - r, at[1] - r, at[0] + r, at[1] + r);
      night.addColorStop(.45, '#05101400'); night.addColorStop(1, '#051014ee'); ctx.fillStyle = night; ctx.fillRect(at[0] - r, at[1] - r, r * 2, r * 2);
      ctx.restore();
      ctx.strokeStyle = '#b6dccb38'; ctx.lineWidth = Math.max(1, r * .03);
      ctx.beginPath(); ctx.ellipse(at[0], at[1], r * 1.65, r * .26, -.32, Math.PI * 1.03, Math.PI * 1.97, true); ctx.stroke();
      ctx.restore();
    }
  }
  // Debris field: a broken moon far ahead, its pieces strung out beside it.
  if (weight(1) > .01) {
    const at = cam.far(norm([.42, .22, 1])), a = weight(1);
    if (at) {
      const r = unit * .13;
      ctx.save(); ctx.globalAlpha = a;
      const body = ctx.createRadialGradient(at[0] - r * .4, at[1] - r * .4, r * .1, at[0], at[1], r);
      body.addColorStop(0, '#a99a86'); body.addColorStop(1, '#3c342b'); ctx.fillStyle = body;
      ctx.beginPath(); ctx.moveTo(at[0] + r, at[1]);
      for (let i = 1; i <= 24; i++) { const q = i / 24 * TAU, bite = q > 5.1 && q < 5.9 ? .72 : 1; ctx.lineTo(at[0] + Math.cos(q) * r * bite, at[1] + Math.sin(q) * r * bite); }
      ctx.fill();
      const random = randomSeed(311);
      for (let i = 0; i < 34; i++) {
        const q = 5.3 + i * .05 + (random() - .5) * .25, d = r * (1.1 + i * .07 + random() * .35), size = Math.max(.8, r * (.07 - i * .0016) * (.5 + random()));
        ctx.fillStyle = `rgba(150,132,110,${.65 - i * .016})`; ctx.beginPath(); ctx.arc(at[0] + Math.cos(q) * d, at[1] + Math.sin(q) * d * .6 + (random() - .5) * r * .2, size, 0, TAU); ctx.fill();
      }
      ctx.restore();
    }
  }
  // Nebula: soft clouds in three colours, and the star the course ends at.
  if (weight(2) > .01) {
    const a = weight(2), drift = reduced ? 0 : now * .00002;
    // The clouds are soft, so they are drawn at a quarter of the size and scaled up.
    const scale = .25, cw = Math.ceil(w * scale), ch = Math.ceil(h * scale);
    if (!backdrop.clouds) backdrop.clouds = document.createElement('canvas');
    const layer = backdrop.clouds; if (layer.width !== cw || layer.height !== ch) { layer.width = cw; layer.height = ch; }
    const c2 = layer.getContext('2d'); c2.clearRect(0, 0, cw, ch); c2.globalCompositeOperation = 'lighter';
    const clouds = [[-.6, .3, '#5b3c8a', .9], [.5, .1, '#2f7f8a', .8], [.1, .45, '#a2508a', .7], [-.2, -.25, '#3a2f7a', .8], [.75, -.3, '#7a3f6a', .6], [-.85, -.1, '#26606a', .7]];
    for (const [x, y, colour, size] of clouds) {
      const at = cam.far(norm([x + Math.sin(drift + x) * .03, y, 1])); if (!at) continue;
      const r = unit * size * scale, cx = at[0] * scale, cy = at[1] * scale, cloud = c2.createRadialGradient(cx, cy, 0, cx, cy, r);
      cloud.addColorStop(0, colour + '55'); cloud.addColorStop(.5, colour + '22'); cloud.addColorStop(1, colour + '00');
      c2.fillStyle = cloud; c2.fillRect(cx - r, cy - r, r * 2, r * 2);
    }
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a; ctx.drawImage(layer, 0, 0, w, h);
    const end = s.rings[s.rings.length - 1].z, near = clamp(1 - (end - s.z) / 260, 0, 1);
    const sun = cam.far(norm([0, .08, 1]));
    if (sun) {
      const r = unit * (.03 + .05 * near), flare = ctx.createRadialGradient(sun[0], sun[1], 0, sun[0], sun[1], r * 9);
      flare.addColorStop(0, '#fff7e2'); flare.addColorStop(.08, '#ffe3a8cc'); flare.addColorStop(.35, '#f0a8d033'); flare.addColorStop(1, '#f0a8d000');
      ctx.fillStyle = flare; ctx.fillRect(sun[0] - r * 9, sun[1] - r * 9, r * 18, r * 18);
      ctx.strokeStyle = `rgba(255,236,200,${.12 + .2 * near})`; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(sun[0] - r * 14, sun[1]); ctx.lineTo(sun[0] + r * 14, sun[1]); ctx.stroke();
    }
    ctx.restore();
  }
}

// A ring as a lit tube: segments split into the half behind its centre and the half in front,
// so the ship can be drawn between them as it passes through.
function ringItems(ctx, items, cam, ring, place, isNext, t, now, reduced) {
  const centre = [place.x, place.y, ring.z], c = cam.project(centre);
  if (!c) return;
  const segments = 44, tube = .085, points = [];
  for (let i = 0; i <= segments; i++) {
    const q = i / segments * TAU;
    points.push({ q, p: cam.project([place.x + Math.cos(q) * place.radius, place.y + Math.sin(q) * place.radius, ring.z]) });
  }
  const since = ring.at === null ? null : t - ring.at;
  const state = ring.result === 'miss' ? 'miss' : ring.result ? 'passed' : isNext ? 'next' : 'ahead';
  const metal = state === 'miss' ? [150, 70, 88] : state === 'passed' ? [130, 168, 140] : [176, 196, 182];
  const fade = state === 'passed' || state === 'miss' ? clamp(1 - since / 1.4, .15, 1) : clamp((190 - (ring.z - cam.eye[2])) / 40, 0, 1);
  const halves = [[], []];
  for (let i = 0; i < segments; i++) {
    const a = points[i], b = points[i + 1]; if (!a.p || !b.p) continue;
    halves[(a.p[2] + b.p[2]) / 2 < c[2] ? 1 : 0].push([a, b]);
  }
  halves.forEach((list, front) => items.push({ depth: c[2] + (front ? -.05 : .05), draw: () => {
    ctx.save(); ctx.lineCap = 'round'; ctx.globalAlpha = fade;
    for (const [a, b] of list) {
      const q = (a.q + b.q) / 2, normal = [Math.cos(q), Math.sin(q), 0], light = .38 + .7 * Math.max(0, dot(normal, LIGHT));
      const width = Math.max(1, tube * 2 * cam.focal / ((a.p[2] + b.p[2]) / 2));
      ctx.strokeStyle = rgb(metal, light); ctx.lineWidth = width;
      ctx.beginPath(); ctx.moveTo(a.p[0], a.p[1]); ctx.lineTo(b.p[0], b.p[1]); ctx.stroke();
      // The glowing inner edge: lime on the ring to fly through next.
      if (state === 'next' || state === 'ahead') {
        ctx.strokeStyle = state === 'next' ? `rgba(217,245,126,${.75 + (reduced ? 0 : .25 * Math.sin(now * .008))})` : 'rgba(150,200,170,.35)';
        ctx.lineWidth = Math.max(.6, width * .32);
        const inset = .82;
        ctx.beginPath(); ctx.moveTo(c[0] + (a.p[0] - c[0]) * inset, c[1] + (a.p[1] - c[1]) * inset); ctx.lineTo(c[0] + (b.p[0] - c[0]) * inset, c[1] + (b.p[1] - c[1]) * inset); ctx.stroke();
      }
    }
    // Four beacons on the rim.
    if (front && state !== 'miss') for (let i = 0; i < 4; i++) {
      const p = points[i * segments / 4].p; if (!p) continue;
      const on = reduced || Math.sin(now * .006 + i * 1.6 + ring.index) > -.2, size = clamp(tube * 1.1 * cam.focal / p[2], 1, 5);
      ctx.fillStyle = on ? (state === 'next' ? '#f2ffc6' : '#cfe2d4') : '#3a4a40'; ctx.beginPath(); ctx.arc(p[0], p[1], size, 0, TAU); ctx.fill();
    }
    ctx.restore();
    // A burst when a ring is passed, and its number when it is next.
    if (front && since !== null && since < .7 && state === 'passed') {
      const k = since / .7, r = (place.radius * (1 + k * .9)) * cam.focal / c[2];
      ctx.strokeStyle = ring.result === 'perfect' ? `rgba(242,255,198,${1 - k})` : `rgba(180,230,200,${.8 - k * .8})`; ctx.lineWidth = Math.max(1, 6 * (1 - k));
      ctx.beginPath(); ctx.arc(c[0], c[1], r, 0, TAU); ctx.stroke();
    }
    if (front && state === 'next') {
      const r = place.radius * cam.focal / c[2];
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const halo = ctx.createRadialGradient(c[0], c[1], r * .7, c[0], c[1], r * 1.25);
      halo.addColorStop(0, 'rgba(217,245,126,0)'); halo.addColorStop(.5, 'rgba(217,245,126,.12)'); halo.addColorStop(1, 'rgba(217,245,126,0)');
      ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(c[0], c[1], r * 1.25, 0, TAU); ctx.fill(); ctx.restore();
      if (r < Math.min(ctx.canvas.width, ctx.canvas.height)) { ctx.fillStyle = '#eef4d8'; ctx.beginPath(); ctx.arc(c[0], c[1], 1.8, 0, TAU); ctx.fill(); }
      if (c[2] < 90) { ctx.fillStyle = '#e7ecc7'; ctx.font = '10px ui-monospace, monospace'; ctx.textAlign = 'center'; ctx.fillText(String(ring.index + 1).padStart(2, '0'), c[0], c[1] - r - 12); ctx.textAlign = 'left'; }
    }
  } }));
}

function face(ctx, f, glass = false) {
  const [a, b, c] = f.points;
  ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1]); ctx.closePath();
  ctx.fillStyle = rgb(f.colour, f.light); ctx.fill();
  ctx.strokeStyle = glass ? 'rgba(200,255,250,.35)' : rgb(f.colour, f.light * .82 + f.rim * .9, .9); ctx.lineWidth = .7; ctx.stroke();
  if (f.rim > .25) { ctx.strokeStyle = `rgba(230,250,240,${f.rim * .35})`; ctx.stroke(); }
}

function engine(ctx, cam, tail, s, now, reduced) {
  const at = cam.project(tail); if (!at) return;
  const boost = s.boosting ? 1 : 0, flicker = reduced ? 1 : .85 + .15 * Math.sin(now * .05), r = (.35 + boost * .35) * cam.focal / at[2] * flicker;
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(at[0], at[1], 0, at[0], at[1], r);
  g.addColorStop(0, boost ? '#f4fbff' : '#fff6dc'); g.addColorStop(.3, boost ? '#7fd8ffcc' : '#ffcf7acc'); g.addColorStop(1, boost ? '#3f8fff00' : '#ff8a3a00');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(at[0], at[1], r, 0, TAU); ctx.fill(); ctx.restore();
}

function trail(ctx, cam, points, s) {
  if (points.length < 2) return;
  ctx.save(); ctx.lineCap = 'butt'; ctx.lineJoin = 'round';
  for (let i = 1; i < points.length; i++) {
    const a = cam.project(points[i - 1]), b = cam.project(points[i]); if (!a || !b) continue;
    const k = i / points.length;
    ctx.strokeStyle = s.boosting ? `rgba(127,216,255,${k * k * .55})` : `rgba(255,214,140,${k * k * .4})`;
    ctx.lineWidth = Math.max(.4, .07 * cam.focal / b[2] * k);
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
  }
  ctx.restore();
}

function shieldCell(ctx, cam, cell, at, now, t, reduced) {
  const size = .55 * cam.focal / at[2], spin = reduced ? 0 : now * .0016;
  if (cell.taken) {
    const k = clamp((t - cell.at) / .6, 0, 1); if (k >= 1) return;
    ctx.strokeStyle = `rgba(127,232,255,${1 - k})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(at[0], at[1], size * (1 + k * 3), 0, TAU); ctx.stroke(); return;
  }
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(at[0], at[1], 0, at[0], at[1], size * 2.4);
  g.addColorStop(0, '#dff9ffcc'); g.addColorStop(.3, '#7fe8ff55'); g.addColorStop(1, '#7fe8ff00'); ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(at[0], at[1], size * 2.4, 0, TAU); ctx.fill(); ctx.restore();
  ctx.strokeStyle = '#bff4ff'; ctx.lineWidth = Math.max(1, size * .12); ctx.beginPath();
  for (let i = 0; i <= 6; i++) { const q = spin + i / 6 * TAU, x = at[0] + Math.cos(q) * size, y = at[1] + Math.sin(q) * size * .62; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
  ctx.stroke();
  ctx.fillStyle = '#eafcff'; ctx.font = `${Math.max(9, size * .9)}px ui-monospace, monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('+', at[0], at[1]); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
}

// Close dust around the lane, repeating every 90 units so there is always some streaming past.
const DUST = (() => { const random = randomSeed(4049); return Array.from({ length: 110 }, () => [(random() - .5) * 26, (random() - .5) * 17, random() * 90]); })();
function dust(ctx, w, h, cam, s, shipZ, colour, reduced) {
  const streak = s.phase === 'playing' && !reduced ? (s.boosting ? 2.6 : .9) : 0;
  ctx.save(); ctx.lineCap = 'round';
  for (const [x, y, z0] of DUST) {
    const z = shipZ - 4 + ((z0 - shipZ) % 90 + 90) % 90, a = cam.project([x, y, z]); if (!a || a[2] > 70) continue;
    const alpha = clamp(1 - a[2] / 70, 0, 1) * .6;
    if (streak) {
      const b = cam.project([x, y, z + streak]); if (!b) continue;
      ctx.strokeStyle = rgb(colour, 1, alpha); ctx.lineWidth = Math.max(.6, 1.6 / Math.max(1, a[2] * .2));
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    } else { ctx.fillStyle = rgb(colour, 1, alpha); ctx.fillRect(a[0], a[1], 1.2, 1.2); }
  }
  ctx.restore();
}

// Reticle, radar, boost, sector cards and the edge of the screen on a hit.
function overlay(ctx, w, h, cam, s, next, ship, now, reduced, after) {
  if (s.phase === 'playing') {
    // Where the ship will be at the next ring's distance: the aim point.
    const aim = cam.project([ship[0] + s.vx * .25, ship[1] + s.vy * .25, ship[2] + 22]);
    if (aim) {
      ctx.strokeStyle = '#e5edccaa'; ctx.lineWidth = 1;
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) { ctx.beginPath(); ctx.moveTo(aim[0] + dx * 7, aim[1] + dy * 7); ctx.lineTo(aim[0] + dx * 14, aim[1] + dy * 14); ctx.stroke(); }
      ctx.strokeStyle = '#b6d7a540'; ctx.beginPath(); ctx.arc(aim[0], aim[1], 20, 0, TAU); ctx.stroke();
    }
    if (next) {
      const p = ringAt(next, s.elapsed), dx = p.x - s.x, dy = p.y - s.y, radius = 24, rx = w - 43, ry = h - 54;
      ctx.fillStyle = '#07100dbb'; ctx.beginPath(); ctx.arc(rx, ry, radius + 5, 0, TAU); ctx.fill(); ctx.strokeStyle = '#6b8b7166'; ctx.beginPath(); ctx.arc(rx, ry, radius, 0, TAU); ctx.stroke();
      ctx.fillStyle = '#d9f57e'; ctx.beginPath(); ctx.arc(rx + clamp(dx / 6, -1, 1) * radius, ry - clamp(dy / 4, -1, 1) * radius, 3, 0, TAU); ctx.fill(); ctx.fillStyle = '#ffffff88'; ctx.fillRect(rx - 1, ry - 1, 2, 2);
    }
    // Boost.
    const bx = 18, by = h - 30, bw = Math.min(150, w * .3);
    ctx.fillStyle = '#07100dbb'; ctx.fillRect(bx - 4, by - 14, bw + 8, 24);
    ctx.fillStyle = '#9bb3a0'; ctx.font = '9px ui-monospace, monospace'; ctx.fillText(s.boosting ? 'BOOST ×1.5' : 'BOOST', bx, by - 3);
    ctx.fillStyle = '#2b3a33'; ctx.fillRect(bx, by + 2, bw, 3);
    ctx.fillStyle = s.boosting ? '#7fd8ff' : '#d9f57e'; ctx.fillRect(bx, by + 2, bw * s.boost, 3);
  }
  // Progress along the course, with a tick at each sector.
  const total = s.rings.length, px = w * .35, pw = w * .3, py = h - 19;
  ctx.fillStyle = '#48665366'; ctx.fillRect(px, py, pw, 2); ctx.fillStyle = '#d9f57e'; ctx.fillRect(px, py, pw * s.passed / total, 2);
  for (let k = 1; k < SECTORS.length; k++) { const x = px + pw * s.rings.findIndex(r => r.sector === k) / total; ctx.fillStyle = '#d9f57e88'; ctx.fillRect(x, py - 3, 1, 8); }
  // The sector's name as it begins.
  if (s.phase === 'playing') {
    const since = s.elapsed - s.sectorAt, k = since < 2.6 ? since / 2.6 : 1;
    if (k < 1) {
      const a = ease(k / .15) * (1 - ease((k - .7) / .3));
      ctx.save(); ctx.globalAlpha = a; ctx.textAlign = 'center';
      ctx.fillStyle = '#d9f57e'; ctx.font = '10px ui-monospace, monospace'; ctx.fillText(`SECTOR ${String(s.sector + 1).padStart(2, '0')} / ${SECTORS.length}`, w / 2, h * .14);
      ctx.fillStyle = '#f2f5e8'; ctx.font = `${Math.round(Math.min(44, w * .07))}px Georgia, serif`; ctx.fillText(SECTORS[s.sector].name, w / 2, h * .14 + Math.min(44, w * .07) + 6);
      ctx.fillStyle = '#c6d2c4'; ctx.font = '12px system-ui, sans-serif'; ctx.fillText(SECTORS[s.sector].brief, w / 2, h * .14 + Math.min(44, w * .07) + 28);
      ctx.restore();
    }
  }
  // A red edge on a hit.
  if (s.flash > 0) {
    const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * .3, w / 2, h / 2, Math.max(w, h) * .75);
    g.addColorStop(0, 'rgba(185,70,103,0)'); g.addColorStop(1, `rgba(185,70,103,${s.flash * .45})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  }
  // The finish: the grade over the ship.
  if (s.phase === 'won' && s.grade) {
    const a = ease((after - .4) / .8);
    ctx.save(); ctx.globalAlpha = a; ctx.textAlign = 'center'; ctx.fillStyle = '#d9f57e'; ctx.font = `${Math.round(Math.min(96, h * .18))}px Georgia, serif`;
    ctx.fillText(s.grade, w * .82, h * .3); ctx.font = '10px ui-monospace, monospace'; ctx.fillStyle = '#c6d2c4'; ctx.fillText('GRADE', w * .82, h * .3 + 18); ctx.restore();
  }
}
