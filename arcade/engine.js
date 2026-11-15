// Pure rules for the three cartridges. No DOM, audio, storage or rendering.
export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export const DIFFICULTIES = {
  relaxed: { flightSpeed: 9, ringRadius: 1.7, flightCount: 15, stackSpeed: 2.2, stackGoal: 12, label: 'Easygoing' },
  standard: { flightSpeed: 12, ringRadius: 1.35, flightCount: 18, stackSpeed: 2.8, stackGoal: 18, label: 'One more try' },
};
export function randomSeed(seed) { let value = seed >>> 0; return () => ((value = (Math.imul(value, 1664525) + 1013904223) >>> 0) / 4294967296); }
const base = (mode, difficulty) => ({ mode, difficulty, phase: 'ready', elapsed: 0, score: 0, events: [] });
export function createFlight(difficulty = 'standard', seed = 73) {
  const config = DIFFICULTIES[difficulty], random = randomSeed(seed);
  const rings = Array.from({ length: config.flightCount }, (_, i) => {
    const section = Math.floor(i / 6), angle = i * .7 + section * .6;
    return { x: i < 2 ? 0 : Math.sin(angle) * (2.1 + section * .55), y: i < 2 ? 0 : Math.cos(angle * .86) * 1.9, z: 24 + i * 25, radius: config.ringRadius, result: null };
  });
  return { ...base('flight', difficulty), x: 0, y: 0, vx: 0, vy: 0, z: 0, shields: 3, passed: 0, combo: 0, longestCombo: 0, perfect: 0, rings,
    stars: Array.from({ length: 160 }, () => ({ x: (random() - .5) * 100, y: (random() - .5) * 65, z: random() * 300 })), flash: 0 };
}
export function evaluateRing(ring, x, y) {
  const error = Math.hypot(x - ring.x, y - ring.y) / ring.radius;
  return { hit: error <= 1, perfect: error <= .3, accuracy: clamp(1 - error, 0, 1) };
}
export function stepFlight(s, input, dt) {
  if (s.phase !== 'playing') return;
  const old = { x: s.x, y: s.y, z: s.z }, config = DIFFICULTIES[s.difficulty];
  s.elapsed += dt;
  const tx = input.target ? clamp((input.target.x - s.x) * 2.8, -5, 5) : (input.x || 0) * 5;
  const ty = input.target ? clamp((input.target.y - s.y) * 2.8, -5, 5) : (input.y || 0) * 5;
  const blend = 1 - Math.exp(-10 * dt);
  s.vx += (tx - s.vx) * blend; s.vy += (ty - s.vy) * blend;
  s.x = clamp(s.x + s.vx * dt, -5.8, 5.8); s.y = clamp(s.y + s.vy * dt, -3.6, 3.6);
  s.z += (config.flightSpeed + Math.floor(s.passed / 6) * 1.2) * dt;
  s.flash = Math.max(0, s.flash - dt * 1.8);
  for (const ring of s.rings) {
    if (ring.result || ring.z > s.z) continue;
    // Judge at the crossing plane, not after a frame has advanced beyond it.
    const t = clamp((ring.z - old.z) / Math.max(.000001, s.z - old.z), 0, 1);
    const result = evaluateRing(ring, old.x + (s.x - old.x) * t, old.y + (s.y - old.y) * t);
    ring.result = result.hit ? result.perfect ? 'perfect' : 'hit' : 'miss'; s.passed++;
    if (result.hit) {
      s.combo++; s.longestCombo = Math.max(s.combo, s.longestCombo);
      if (result.perfect) s.perfect++;
      const points = (result.perfect ? 150 : 100) + Math.min(5, s.combo - 1) * 20;
      s.score += points; s.events.push({ type: ring.result, text: `${result.perfect ? 'Dead center' : 'Clean pass'} · +${points} · ${s.combo} in a row` });
    } else { s.combo = 0; s.shields--; s.flash = 1; s.events.push({ type: 'miss', text: `Missed a ring. ${s.shields} ${s.shields === 1 ? 'shield' : 'shields'} left.` }); }
    if (s.shields <= 0) { s.phase = 'lost'; break; }
    if (s.passed === s.rings.length) s.phase = 'won';
  }
}
export function mazeDistances(grid, from) {
  const seen = new Map(), queue = [from]; seen.set(from.join(','), 0);
  for (let i = 0; i < queue.length; i++) {
    const [x, y] = queue[i], d = seen.get(`${x},${y}`);
    for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
      const nx = x + dx, ny = y + dy, key = `${nx},${ny}`;
      if (grid[ny]?.[nx] === '0' && !seen.has(key)) { seen.set(key, d + 1); queue.push([nx, ny]); }
    }
  }
  return seen;
}
export function createMaze(difficulty = 'standard', seed = 73) {
  const random = randomSeed(seed), width = difficulty === 'relaxed' ? 13 : 17, height = 13;
  const grid = Array.from({ length: height }, () => Array(width).fill('1')), stack = [[1, 1]]; grid[1][1] = '0';
  while (stack.length) {
    const [x, y] = stack.at(-1), options = [[2, 0], [-2, 0], [0, 2], [0, -2]].filter(([dx, dy]) => x + dx > 0 && y + dy > 0 && x + dx < width - 1 && y + dy < height - 1 && grid[y + dy][x + dx] === '1');
    if (!options.length) { stack.pop(); continue; }
    const [dx, dy] = options[Math.floor(random() * options.length)]; grid[y + dy / 2][x + dx / 2] = '0'; grid[y + dy][x + dx] = '0'; stack.push([x + dx, y + dy]);
  }
  const rows = grid.map(row => row.join('')), distances = mazeDistances(rows, [1, 1]);
  const cells = [...distances].map(([key, d]) => ({ cell: key.split(',').map(Number), d })).sort((a, b) => b.d - a.d);
  const exitCell = cells[0].cell, targets = [];
  for (const { cell, d } of cells) {
    if (d < 7 || Math.hypot(cell[0] - exitCell[0], cell[1] - exitCell[1]) < 2) continue;
    if (targets.every(t => Math.hypot(t[0] - cell[0], t[1] - cell[1]) >= 4)) targets.push(cell);
    if (targets.length === 3) break;
  }
  // The normal placement is well separated; retain three objectives even for an
  // unusually compact far-distance ordering in a future maze size/preset.
  for (const { cell, d } of cells) {
    if (targets.length === 3) break;
    if (d > 3 && (cell[0] !== exitCell[0] || cell[1] !== exitCell[1]) && targets.every(t => t[0] !== cell[0] || t[1] !== cell[1])) targets.push(cell);
  }
  return { ...base('maze', difficulty), seed, x: 1.5, y: 1.5, a: rows[1][2] === '0' ? 0 : Math.PI / 2, grid: rows,
    gems: targets.map(([x, y]) => ({ x: x + .5, y: y + .5, got: false })), exit: { x: exitCell[0] + .5, y: exitCell[1] + .5 }, collected: 0, visited: new Set(['1,1']), trail: [[1.5, 1.5]], reveal: difficulty === 'relaxed', steps: 0, lockNotice: false };
}
export function walkable(grid, x, y, radius = .18) {
  return [[-radius, -radius], [radius, -radius], [-radius, radius], [radius, radius]].every(([dx, dy]) => grid[Math.floor(y + dy)]?.[Math.floor(x + dx)] === '0');
}
export function stepMaze(s, input, dt) {
  if (s.phase !== 'playing') return;
  s.elapsed += dt; s.a += (input.x || 0) * dt * 1.8;
  const distance = (input.y || 0) * dt * 2.25, x = s.x + Math.cos(s.a) * distance, y = s.y + Math.sin(s.a) * distance;
  if (walkable(s.grid, x, s.y)) s.x = x;
  if (walkable(s.grid, s.x, y)) s.y = y;
  const tile = `${Math.floor(s.x)},${Math.floor(s.y)}`;
  if (!s.visited.has(tile)) { s.visited.add(tile); s.steps++; }
  if (Math.hypot(s.x - s.trail.at(-1)[0], s.y - s.trail.at(-1)[1]) > .3) { s.trail.push([s.x, s.y]); if (s.trail.length > 900) s.trail.shift(); }
  s.gems.forEach(gem => { if (!gem.got && Math.hypot(gem.x - s.x, gem.y - s.y) < .43) { gem.got = true; s.collected++; s.score = s.collected; s.events.push({ type: 'gem', text: s.collected === s.gems.length ? 'All crystals found. The exit is open.' : `Crystal ${s.collected} of ${s.gems.length}. Keep exploring.` }); } });
  const atExit = Math.hypot(s.exit.x - s.x, s.exit.y - s.y) < .46;
  if (atExit && s.collected === s.gems.length) s.phase = 'won';
  else if (atExit && !s.lockNotice) { s.lockNotice = true; s.events.push({ type: 'locked', text: `Exit locked: find ${s.gems.length - s.collected} more crystals.` }); }
  else if (!atExit) s.lockNotice = false;
}
// Grid DDA: exact cell-boundary intersections, with no small-distance ray marching.
export function castRay(grid, x, y, dx, dy, max = 35) {
  let mx = Math.floor(x), my = Math.floor(y), side = 0;
  const deltaX = Math.abs(1 / (dx || 1e-10)), deltaY = Math.abs(1 / (dy || 1e-10)), sx = dx < 0 ? -1 : 1, sy = dy < 0 ? -1 : 1;
  let tx = (dx < 0 ? x - mx : mx + 1 - x) * deltaX, ty = (dy < 0 ? y - my : my + 1 - y) * deltaY;
  for (let i = 0; i < 200; i++) {
    if (tx < ty) { mx += sx; tx += deltaX; side = 0; } else { my += sy; ty += deltaY; side = 1; }
    const distance = side === 0 ? tx - deltaX : ty - deltaY;
    if (distance > max || grid[my]?.[mx] !== '0') {
      const hit = side === 0 ? y + distance * dy : x + distance * dx;
      return { distance: Math.min(max, Math.max(.001, distance)), side, texture: hit - Math.floor(hit), x: mx, y: my };
    }
  }
  return { distance: max, side: 0, texture: 0, x: mx, y: my };
}
export function intervalOverlap(a, b, sizeA, sizeB) {
  const low = Math.max(a - sizeA / 2, b - sizeB / 2), high = Math.min(a + sizeA / 2, b + sizeB / 2);
  return { size: Math.max(0, high - low), center: (high + low) / 2 };
}
export function createStack(difficulty = 'standard') {
  return { ...base('stack', difficulty), blocks: [{ x: 0, z: 0, w: 4, d: 4 }], moving: { x: -5, z: 0, w: 4, d: 4 }, direction: 1, axis: 'x', perfect: 0, combo: 0, pieces: [], drops: 0, cooldown: 0 };
}
export function stepStack(s, input, dt) {
  if (s.phase !== 'playing') return;
  s.elapsed += dt; s.cooldown = Math.max(0, s.cooldown - dt);
  if (!s.cooldown) {
    const center = s.blocks.at(-1)[s.axis], speed = DIFFICULTIES[s.difficulty].stackSpeed + s.drops * .15;
    s.moving[s.axis] += dt * s.direction * speed;
    if (Math.abs(s.moving[s.axis] - center) >= 5) { s.moving[s.axis] = center + Math.sign(s.moving[s.axis] - center) * 5; s.direction *= -1; }
  }
  for (const p of s.pieces) { p.vy -= dt * 8; p.y += p.vy * dt; p.spin += dt * 2; p.life -= dt; }
  s.pieces = s.pieces.filter(p => p.life > 0);
}
export function dropStack(s) {
  if (s.phase !== 'playing' || s.cooldown > 0) return null;
  const top = s.blocks.at(-1), moving = s.moving, delta = moving[s.axis] - top[s.axis], perfect = Math.abs(delta) <= .10;
  if (perfect) moving[s.axis] = top[s.axis];
  const ox = intervalOverlap(moving.x, top.x, moving.w, top.w), oz = intervalOverlap(moving.z, top.z, moving.d, top.d), level = s.blocks.length;
  if (ox.size < .08 || oz.size < .08) { s.phase = 'lost'; s.events.push({ type: 'miss', text: 'Missed the tower. Try again?' }); return { lost: true }; }
  const kept = { x: ox.center, z: oz.center, w: ox.size, d: oz.size };
  const lostWidth = moving.w - ox.size, lostDepth = moving.d - oz.size;
  if (lostWidth > .001) s.pieces.push({ x: delta > 0 ? kept.x + ox.size / 2 + lostWidth / 2 : kept.x - ox.size / 2 - lostWidth / 2, z: moving.z, w: lostWidth, d: moving.d, y: level * .55, vy: 0, spin: 0, life: 2 });
  if (lostDepth > .001) s.pieces.push({ z: delta > 0 ? kept.z + oz.size / 2 + lostDepth / 2 : kept.z - oz.size / 2 - lostDepth / 2, x: moving.x, d: lostDepth, w: moving.w, y: level * .55, vy: 0, spin: 0, life: 2 });
  s.blocks.push(kept); s.drops++; s.combo = perfect ? s.combo + 1 : 0;
  if (perfect) s.perfect++;
  const points = perfect ? 150 + Math.min(5, s.combo - 1) * 25 : 100;
  s.score += points; s.events.push({ type: perfect ? 'perfect' : 'cut', text: perfect ? `Perfect placement · +${points} · ${s.combo} in a row` : `Level ${s.drops} · ${Math.round(ox.size * oz.size / 16 * 100)}% of the starting footprint remains` });
  if (s.drops >= DIFFICULTIES[s.difficulty].stackGoal) { s.phase = 'won'; return { perfect, kept }; }
  s.axis = s.axis === 'x' ? 'z' : 'x'; s.direction = s.drops % 2 ? -1 : 1;
  s.moving = { ...kept, [s.axis]: kept[s.axis] - s.direction * 5 }; s.cooldown = .14;
  return { perfect, kept };
}
export function validateRecords(raw) {
  const result = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return result;
  for (const [key, value] of Object.entries(raw).slice(0, 100)) {
    if (!/^(flight|stack):(relaxed|standard)$|^maze:(relaxed|standard):\d{1,6}$/.test(key)) continue;
    if (!Number.isFinite(value) || value < 0 || value > 1000000) continue;
    result[key] = value;
  }
  return result;
}
export function recordKey(s) { return `${s.mode}:${s.difficulty}${s.mode === 'maze' ? ':' + s.seed : ''}`; }
export function updateRecord(records, s) {
  if (!['won', 'lost'].includes(s.phase)) return false;
  const key = recordKey(s);
  if (s.mode === 'maze') { if (s.phase !== 'won') return false; const value = Math.round(s.elapsed * 10) / 10; if (records[key] === undefined || value < records[key]) { records[key] = value; return true; } }
  else if (s.score > (records[key] || 0)) { records[key] = s.score; return true; }
  return false;
}
