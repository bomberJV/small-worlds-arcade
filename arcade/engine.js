// Pure rules for the three cartridges. No DOM, audio, storage or rendering.
export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export const DIFFICULTIES = {
  relaxed: { flightSpeed: 9, ringRadius: 1.7, ringsPerSector: 6, rocks: 4, drift: .6, pulse: .2, stackSpeed: 2.2, stackGoal: 12, label: 'Easygoing' },
  standard: { flightSpeed: 12, ringRadius: 1.35, ringsPerSector: 8, rocks: 7, drift: 1, pulse: .28, stackSpeed: 2.8, stackGoal: 18, label: 'One more try' },
};
export function randomSeed(seed) { let value = seed >>> 0; return () => ((value = (Math.imul(value, 1664525) + 1013904223) >>> 0) / 4294967296); }
const base = (mode, difficulty) => ({ mode, difficulty, phase: 'ready', elapsed: 0, score: 0, events: [] });

// ---- Ring Runner -------------------------------------------------------------------------
// Three sectors, each with its own rule. Low orbit teaches the line. In the debris field the
// rings drift and rocks cross the lane. In the nebula the rings breathe, shrinking and opening.
// A shield cell waits off the line in the last two sectors. Boost (held) flies faster and
// scores half as much again per ring; dead-center passes refill it.
export const SECTORS = [
  { name: 'Low orbit', brief: 'Find the line. Aim for the center of each ring.' },
  { name: 'Debris field', brief: 'The rings drift and rocks cross the lane. A rock costs a shield.' },
  { name: 'Nebula', brief: 'The rings breathe. Go through while they are open.' },
];
export const SHIP_RADIUS = .35, BOOST = { speed: 1.45, points: 1.5, drain: .32, perfect: .25, hit: .1 };
const SECTOR_GAP = 20, RING_GAP = 25;
// Where a ring is, and how wide, at a moment of the run. Drift and breathing follow the run's clock.
export function ringAt(ring, t) {
  const d = ring.drift, b = ring.pulse;
  return {
    x: ring.x + (d ? d.ax * Math.sin(d.w * t + d.phase) : 0), y: ring.y + (d ? d.ay * Math.sin(d.w * .8 * t + d.phase * 1.7) : 0),
    radius: ring.radius * (b ? 1 - b.amount * (.5 + .5 * Math.sin(b.w * t + b.phase)) : 1),
  };
}
export function createFlight(difficulty = 'standard', seed = 73) {
  const config = DIFFICULTIES[difficulty], random = randomSeed(seed), n = config.ringsPerSector, rings = [], rocks = [], cells = [];
  for (let k = 0; k < SECTORS.length; k++) for (let i = 0; i < n; i++) {
    const g = k * n + i, angle = g * .7 + k * .6, first = g < 2;
    rings.push({ x: first ? 0 : Math.sin(angle) * (2.1 + k * .55), y: first ? 0 : Math.cos(angle * .86) * 1.9, z: 24 + g * RING_GAP + k * SECTOR_GAP,
      radius: config.ringRadius, sector: k, index: g, result: null, at: null,
      drift: k === 1 ? { ax: config.drift * (.75 + .25 * Math.sin(g)), ay: config.drift * .55, w: .9 + .15 * (g % 3), phase: g * 1.3 } : null,
      pulse: k === 2 ? { amount: config.pulse, w: 2.1 + .2 * (g % 2), phase: g * .9 } : null });
  }
  // Rocks sit between rings of the debris field, well off the line between them.
  const field = rings.filter(r => r.sector === 1);
  for (let j = 0; j < config.rocks; j++) {
    const a = field[j % (field.length - 1)], b = field[j % (field.length - 1) + 1], t = .35 + .3 * random(), heading = random() * Math.PI * 2;
    const r = .45 + .45 * random(), reach = config.drift + r + SHIP_RADIUS + 1.35 + random() * 1.2;
    rocks.push({ x: a.x + (b.x - a.x) * t + Math.cos(heading) * reach, y: a.y + (b.y - a.y) * t + Math.sin(heading) * reach, z: a.z + (b.z - a.z) * t,
      r, spin: .3 + random() * .8, shape: Math.floor(random() * 1e6), hit: false });
  }
  // One shield cell in each of the last two sectors: a short detour from the line.
  for (const k of [1, 2]) {
    const inSector = rings.filter(r => r.sector === k), a = inSector[3], b = inSector[4], side = k === 1 ? 1 : -1;
    cells.push({ x: (a.x + b.x) / 2 + side * 1.7, y: (a.y + b.y) / 2 + .6, z: (a.z + b.z) / 2 + 3, taken: false, at: null });
  }
  return { ...base('flight', difficulty), seed, x: 0, y: 0, vx: 0, vy: 0, z: 0, shields: 3, passed: 0, combo: 0, longestCombo: 0, perfect: 0,
    boost: 1, boosting: false, sector: 0, sectorAt: 0, medals: [], grade: null, hits: 0, impacts: 0, rings, rocks, cells,
    stars: Array.from({ length: 160 }, () => ({ x: (random() - .5) * 100, y: (random() - .5) * 65, z: random() * 300 })), flash: 0 };
}
export function evaluateRing(ring, x, y) {
  const error = Math.hypot(x - ring.x, y - ring.y) / ring.radius;
  return { hit: error <= 1, perfect: error <= .3, accuracy: clamp(1 - error, 0, 1) };
}
// The best score a run can make without boost, for the grade.
export function flightPar(s) { let total = 0; for (let i = 0; i < s.rings.length; i++) total += 150 + Math.min(5, i) * 20; return total; }
function medal(s, k) {
  const rings = s.rings.filter(r => r.sector === k), hit = rings.filter(r => r.result && r.result !== 'miss').length, center = rings.filter(r => r.result === 'perfect').length;
  return hit === rings.length && center >= rings.length * .6 ? 'gold' : hit === rings.length ? 'silver' : hit >= rings.length / 2 ? 'bronze' : 'none';
}
function closeSector(s, k) {
  const m = medal(s, k), rings = s.rings.filter(r => r.sector === k);
  s.medals[k] = m;
  s.events.push({ type: 'sector', text: `${SECTORS[k].name} clear · ${m === 'none' ? 'no medal' : m} · ${rings.filter(r => r.result !== 'miss').length}/${rings.length} rings · ${rings.filter(r => r.result === 'perfect').length} dead center` });
}
export function stepFlight(s, input, dt) {
  if (s.phase !== 'playing') return;
  const old = { x: s.x, y: s.y, z: s.z, t: s.elapsed }, config = DIFFICULTIES[s.difficulty];
  s.elapsed += dt;
  const tx = input.target ? clamp((input.target.x - s.x) * 2.8, -5, 5) : (input.x || 0) * 5;
  const ty = input.target ? clamp((input.target.y - s.y) * 2.8, -5, 5) : (input.y || 0) * 5;
  const blend = 1 - Math.exp(-10 * dt);
  s.vx += (tx - s.vx) * blend; s.vy += (ty - s.vy) * blend;
  s.x = clamp(s.x + s.vx * dt, -5.8, 5.8); s.y = clamp(s.y + s.vy * dt, -3.6, 3.6);
  s.boosting = Boolean(input.boost) && s.boost > 0;
  if (s.boosting) s.boost = Math.max(0, s.boost - BOOST.drain * dt);
  s.z += (config.flightSpeed + s.sector * 1.2) * (s.boosting ? BOOST.speed : 1) * dt;
  s.flash = Math.max(0, s.flash - dt * 1.8);
  const at = z => { const t = clamp((z - old.z) / Math.max(.000001, s.z - old.z), 0, 1); return { x: old.x + (s.x - old.x) * t, y: old.y + (s.y - old.y) * t, t: old.t + (s.elapsed - old.t) * t }; };
  // Entering a sector.
  const next = s.rings.find(r => !r.result);
  if (next && next.sector > s.sector && s.z >= next.z - RING_GAP + 4) {
    s.sector = next.sector; s.sectorAt = s.elapsed;
    s.events.push({ type: 'sector-start', text: `Sector ${s.sector + 1} · ${SECTORS[s.sector].name}. ${SECTORS[s.sector].brief}` });
  }
  for (const rock of s.rocks) {
    if (rock.hit || rock.z > s.z || rock.z <= old.z) continue;
    const p = at(rock.z);
    if (Math.hypot(p.x - rock.x, p.y - rock.y) <= rock.r + SHIP_RADIUS) {
      rock.hit = true; s.impacts++; s.combo = 0; s.shields--; s.flash = 1;
      s.events.push({ type: 'impact', text: `Hit a rock. ${s.shields} ${s.shields === 1 ? 'shield' : 'shields'} left.` });
      if (s.shields <= 0) { s.phase = 'lost'; return; }
    }
  }
  for (const cell of s.cells) {
    if (cell.taken || cell.z > s.z || cell.z <= old.z) continue;
    const p = at(cell.z);
    if (Math.hypot(p.x - cell.x, p.y - cell.y) <= .95) {
      cell.taken = true; cell.at = s.elapsed;
      if (s.shields < 3) { s.shields++; s.events.push({ type: 'pickup', text: `Shield cell · ${s.shields} shields.` }); }
      else { s.score += 250; s.events.push({ type: 'pickup', text: 'Shield cell · shields full, +250.' }); }
    }
  }
  for (const ring of s.rings) {
    if (ring.result || ring.z > s.z) continue;
    // Judge at the crossing plane, at the moment of crossing, not after a frame has advanced beyond it.
    const p = at(ring.z), place = ringAt(ring, p.t), result = evaluateRing({ ...ring, ...place }, p.x, p.y);
    ring.result = result.hit ? result.perfect ? 'perfect' : 'hit' : 'miss'; ring.at = s.elapsed; s.passed++;
    if (result.hit) {
      s.combo++; s.hits++; s.longestCombo = Math.max(s.combo, s.longestCombo);
      if (result.perfect) s.perfect++;
      s.boost = Math.min(1, s.boost + (result.perfect ? BOOST.perfect : BOOST.hit));
      const points = Math.round(((result.perfect ? 150 : 100) + Math.min(5, s.combo - 1) * 20) * (s.boosting ? BOOST.points : 1));
      s.score += points; s.events.push({ type: ring.result, text: `${result.perfect ? 'Dead center' : 'Clean pass'}${s.boosting ? ' on boost' : ''} · +${points} · ${s.combo} in a row` });
    } else { s.combo = 0; s.shields--; s.flash = 1; s.events.push({ type: 'miss', text: `Missed a ring. ${s.shields} ${s.shields === 1 ? 'shield' : 'shields'} left.` }); }
    if (s.shields <= 0) { s.phase = 'lost'; break; }
    const following = s.rings[s.rings.indexOf(ring) + 1];
    if (SECTORS[ring.sector] && (!following || following.sector !== ring.sector)) closeSector(s, ring.sector);
    if (s.passed === s.rings.length) {
      s.phase = 'won';
      const share = s.score / flightPar(s);
      s.grade = share >= .95 ? 'S' : share >= .8 ? 'A' : share >= .6 ? 'B' : 'C';
    }
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
// ---- The Green Room ----------------------------------------------------------------------
// Three floors, each with its own rule. The Green Room is lit: learn the halls. The Dark is lit
// only by your lantern and the crystals' own glow. The Warden has someone walking the halls;
// if it reaches you, you lose a spark and start the floor again. Three crystals open each exit.
export const FLOORS = [
  { name: 'The Green Room', brief: 'Three crystals open the exit. Take your time.', size: { relaxed: [13, 11], standard: [15, 13] }, lantern: 9, loops: 0 },
  { name: 'The Dark', brief: 'Only your lantern and the crystals give light.', size: { relaxed: [13, 13], standard: [17, 13] }, lantern: { relaxed: 5.4, standard: 4.4 }, loops: .06 },
  { name: 'The Warden', brief: 'Something walks these halls. Keep moving.', size: { relaxed: [15, 13], standard: [19, 15] }, lantern: { relaxed: 6, standard: 5 }, loops: .12, warden: { relaxed: 1, standard: 1.3 } },
];
export const SPRINT = { speed: 1.55, drain: .35, regain: .22, winded: .35 }, WALK = 2.25, SPARKS = 3;
function carve(width, height, random, loops) {
  const grid = Array.from({ length: height }, () => Array(width).fill('1')), stack = [[1, 1]]; grid[1][1] = '0';
  while (stack.length) {
    const [x, y] = stack.at(-1), options = [[2, 0], [-2, 0], [0, 2], [0, -2]].filter(([dx, dy]) => x + dx > 0 && y + dy > 0 && x + dx < width - 1 && y + dy < height - 1 && grid[y + dy][x + dx] === '1');
    if (!options.length) { stack.pop(); continue; }
    const [dx, dy] = options[Math.floor(random() * options.length)]; grid[y + dy / 2][x + dx / 2] = '0'; grid[y + dy][x + dx] = '0'; stack.push([x + dx, y + dy]);
  }
  // Knock through some inner walls between two halls, so later floors have loops to escape along.
  for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
    if (grid[y][x] !== '1' || random() >= loops) continue;
    if ((grid[y][x - 1] === '0' && grid[y][x + 1] === '0' && grid[y - 1][x] === '1' && grid[y + 1][x] === '1') ||
        (grid[y - 1][x] === '0' && grid[y + 1][x] === '0' && grid[y][x - 1] === '1' && grid[y][x + 1] === '1')) grid[y][x] = '0';
  }
  return grid.map(row => row.join(''));
}
function buildFloor(s, index) {
  const spec = FLOORS[index], [width, height] = spec.size[s.difficulty], random = randomSeed(s.seed * 7 + index * 7919 + 13);
  const rows = carve(width, height, random, spec.loops), distances = mazeDistances(rows, [1, 1]);
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
  const lantern = typeof spec.lantern === 'number' ? spec.lantern : spec.lantern[s.difficulty];
  let warden = null;
  if (spec.warden) {
    // The warden starts far from you, at a crossing, away from the crystals and the exit.
    const far = cells.find(({ cell, d }) => d <= cells[0].d * .7 && d >= cells[0].d * .45 &&
      [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => rows[cell[1] + dy][cell[0] + dx] === '0').length >= 3 &&
      [...targets, exitCell].every(t => Math.hypot(t[0] - cell[0], t[1] - cell[1]) >= 2)) ?? cells[Math.floor(cells.length / 3)];
    warden = { x: far.cell[0] + .5, y: far.cell[1] + .5, home: [far.cell[0] + .5, far.cell[1] + .5], target: null, from: null, speed: spec.warden[s.difficulty], hunting: false, seen: 0 };
  }
  const a = rows[1][2] === '0' ? 0 : Math.PI / 2;
  Object.assign(s, { floor: index, floorAt: s.elapsed, grid: rows, x: 1.5, y: 1.5, a, startA: a,
    gems: targets.map(([x, y]) => ({ x: x + .5, y: y + .5, got: false })), exit: { x: exitCell[0] + .5, y: exitCell[1] + .5 }, collected: 0,
    visited: new Set(['1,1']), trail: [[1.5, 1.5]], lockNotice: false, lantern, warden, grace: 0, door: 0 });
}
export function createMaze(difficulty = 'standard', seed = 73) {
  const s = { ...base('maze', difficulty), seed, reveal: difficulty === 'relaxed', steps: 0, crystals: 0, sparks: SPARKS, stamina: 1, sprinting: false, winded: false, caught: 0, rand: (seed * 2654435761) >>> 0, splits: [] };
  buildFloor(s, 0);
  return s;
}
export function walkable(grid, x, y, radius = .18) {
  return [[-radius, -radius], [radius, -radius], [-radius, radius], [radius, radius]].every(([dx, dy]) => grid[Math.floor(y + dy)]?.[Math.floor(x + dx)] === '0');
}
const nextRandom = s => ((s.rand = (Math.imul(s.rand, 1664525) + 1013904223) >>> 0) / 4294967296);
// Whether a straight line between two points stays inside the halls.
export function inSight(grid, ax, ay, bx, by) {
  const distance = Math.hypot(bx - ax, by - ay); if (distance < .001) return true;
  return castRay(grid, ax, ay, (bx - ax) / distance, (by - ay) / distance, distance + .01).distance >= distance - .01;
}
function stepWarden(s, dt) {
  const w = s.warden, speed = w.speed * dt;
  const distance = Math.hypot(s.x - w.x, s.y - w.y), sees = distance < 6.5 && inSight(s.grid, w.x, w.y, s.x, s.y);
  if (sees && !w.hunting) s.events.push({ type: 'seen', text: 'The warden has seen you.' });
  w.hunting = sees || (w.hunting && w.seen < 2.5); w.seen = sees ? 0 : w.seen + dt;
  if (!w.target || Math.hypot(w.target[0] - w.x, w.target[1] - w.y) < .04) {
    if (w.target) { w.x = w.target[0]; w.y = w.target[1]; }
    const here = [Math.floor(w.x), Math.floor(w.y)], open = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => s.grid[here[1] + dy][here[0] + dx] === '0');
    let step;
    if (w.hunting) {
      // Toward you along the halls: the first step of the shortest way.
      const paths = mazeDistances(s.grid, [Math.floor(s.x), Math.floor(s.y)]);
      step = open.reduce((best, d) => { const v = paths.get(`${here[0] + d[0]},${here[1] + d[1]}`) ?? 1e9; return v < best.v ? { d, v } : best; }, { d: open[0], v: 1e9 }).d;
    } else {
      // Wandering: on at a straight, a fresh choice at a crossing, back only at a dead end.
      const back = w.from ? [-w.from[0], -w.from[1]] : null, forward = open.filter(d => !back || d[0] !== back[0] || d[1] !== back[1]);
      const choices = forward.length ? forward : open;
      step = choices[Math.floor(nextRandom(s) * choices.length)];
    }
    w.from = step; w.target = [here[0] + step[0] + .5, here[1] + step[1] + .5];
  }
  const dx = w.target[0] - w.x, dy = w.target[1] - w.y, length = Math.hypot(dx, dy), move = Math.min(length, speed * (w.hunting ? 1.15 : 1));
  if (length > 0) { w.x += dx / length * move; w.y += dy / length * move; }
}
export function stepMaze(s, input, dt) {
  if (s.phase !== 'playing') return;
  s.elapsed += dt; s.a += (input.x || 0) * dt * 1.8;
  s.grace = Math.max(0, s.grace - dt);
  const moving = Boolean(input.y);
  // Run yourself out and you are winded until a third of your breath comes back.
  s.sprinting = Boolean(input.sprint) && moving && !s.winded;
  s.stamina = s.sprinting ? Math.max(0, s.stamina - SPRINT.drain * dt) : Math.min(1, s.stamina + SPRINT.regain * dt);
  if (s.stamina === 0) s.winded = true; else if (s.stamina >= SPRINT.winded) s.winded = false;
  const distance = (input.y || 0) * dt * WALK * (s.sprinting ? SPRINT.speed : 1), x = s.x + Math.cos(s.a) * distance, y = s.y + Math.sin(s.a) * distance;
  if (walkable(s.grid, x, s.y)) s.x = x;
  if (walkable(s.grid, s.x, y)) s.y = y;
  const tile = `${Math.floor(s.x)},${Math.floor(s.y)}`;
  if (!s.visited.has(tile)) { s.visited.add(tile); s.steps++; }
  if (Math.hypot(s.x - s.trail.at(-1)[0], s.y - s.trail.at(-1)[1]) > .3) { s.trail.push([s.x, s.y]); if (s.trail.length > 900) s.trail.shift(); }
  s.gems.forEach(gem => { if (!gem.got && Math.hypot(gem.x - s.x, gem.y - s.y) < .43) { gem.got = true; s.collected++; s.crystals++; s.score = s.crystals; s.events.push({ type: 'gem', text: s.collected === s.gems.length ? 'All three crystals. The exit is open.' : `Crystal ${s.collected} of ${s.gems.length}. Keep exploring.` }); } });
  if (s.collected === s.gems.length) s.door = Math.min(1, s.door + dt * 1.2);
  if (s.warden) {
    stepWarden(s, dt);
    if (!s.grace && Math.hypot(s.warden.x - s.x, s.warden.y - s.y) < .55) {
      s.sparks--; s.caught++;
      if (s.sparks <= 0) { s.phase = 'lost'; s.events.push({ type: 'caught', text: 'The warden caught you. No sparks left.' }); return; }
      s.events.push({ type: 'caught', text: `The warden caught you. ${s.sparks} ${s.sparks === 1 ? 'spark' : 'sparks'} left; back to the stairs.` });
      // Back to the start of the floor; crystals already found stay found.
      Object.assign(s, { x: 1.5, y: 1.5, a: s.startA, grace: 2 }); Object.assign(s.warden, { x: s.warden.home[0], y: s.warden.home[1], target: null, from: null, hunting: false, seen: 9 });
    }
  }
  const atExit = Math.hypot(s.exit.x - s.x, s.exit.y - s.y) < .46;
  if (atExit && s.collected === s.gems.length) {
    s.splits.push(Math.round(s.elapsed * 10) / 10);
    if (s.floor === FLOORS.length - 1) { s.phase = 'won'; return; }
    buildFloor(s, s.floor + 1);
    s.events.push({ type: 'floor', text: `Floor ${s.floor + 1} · ${FLOORS[s.floor].name}. ${FLOORS[s.floor].brief}` });
  }
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
// ---- Sky Stack --------------------------------------------------------------------------
// The climb has three stages. Morning is plain stacking. In Wind, gusts speed the slab up and slow
// it down. In Sway, the whole tower leans back and forth, so you drop where the top will be.
// Three perfect drops in a row mend the footprint a little.
export const STAGES = [
  { name: 'Morning', brief: 'Find your timing.' },
  { name: 'Wind', brief: 'Gusts speed the slab up and slow it down.' },
  { name: 'Sway', brief: 'The tower sways. Drop where the top will be.' },
];
export const STACK = { size: 4, height: .55, perfect: .1, grow: .25, growAfter: 3, range: 5, gust: { relaxed: .28, standard: .42 }, sway: { relaxed: .35, standard: .6 } };
export const stackStage = s => Math.min(STAGES.length - 1, Math.floor(s.drops / (DIFFICULTIES[s.difficulty].stackGoal / STAGES.length)));
export function createStack(difficulty = 'standard') {
  return { ...base('stack', difficulty), blocks: [{ x: 0, z: 0, w: STACK.size, d: STACK.size }], moving: { x: -STACK.range, z: 0, w: STACK.size, d: STACK.size }, direction: 1, axis: 'x',
    perfect: 0, combo: 0, longestCombo: 0, marks: [], pieces: [], drops: 0, cooldown: 0, stage: 0, stageAt: 0, gust: 0, sway: 0, mended: 0, last: null, grade: null };
}
// Wind and sway build up over a couple of seconds as their stage begins, rather than arriving at once.
const settle = s => Math.min(1, Math.max(0, (s.elapsed - s.stageAt) / 2.5));
// How far the tower's top leans, along both axes, at this moment (zero before Sway).
function swayAt(s) { return stackStage(s) === 2 ? STACK.sway[s.difficulty] * Math.sin(s.elapsed * 1.15) * (s.stage === 2 ? settle(s) : 0) : 0; }
export function stepStack(s, input, dt) {
  if (s.phase !== 'playing') return;
  s.elapsed += dt; s.cooldown = Math.max(0, s.cooldown - dt);
  const stage = stackStage(s), t = s.elapsed;
  s.gust = stage >= 1 ? STACK.gust[s.difficulty] * (Math.sin(t * 1.3) * .6 + Math.sin(t * 2.9 + 1) * .4) * (stage === 1 && s.stage === 1 ? settle(s) : 1) : 0;
  s.sway = swayAt(s);
  // The slab rides the lean across its lane, so only its timing along the lane matters.
  const across = s.axis === 'x' ? 'z' : 'x'; s.moving[across] = s.blocks.at(-1)[across] + s.sway;
  if (!s.cooldown) {
    const center = s.blocks.at(-1)[s.axis] + s.sway, speed = (DIFFICULTIES[s.difficulty].stackSpeed + s.drops * .15) * (1 + s.gust);
    s.moving[s.axis] += dt * s.direction * speed;
    if (Math.abs(s.moving[s.axis] - center) >= STACK.range) { s.moving[s.axis] = center + Math.sign(s.moving[s.axis] - center) * STACK.range; s.direction *= -1; }
  }
  settleStack(s, dt);
}
// Offcuts fall, tumbling, until they land on a slab below them or on the roof (6.8 wide), then fade.
// This also runs after a run ends, so the last pieces finish falling.
export const ROOF_HALF = 3.4;
export function settleStack(s, dt) {
  for (const p of s.pieces) {
    p.life -= dt;
    if (p.landed) { p.settle = Math.min(1, (p.settle || 0) + dt * 6); continue; }
    p.vy -= dt * 8; p.y += p.vy * dt; p.spin += dt * 2;
    const under = s.blocks.reduce((y, b, i) => Math.abs(b.x - p.x) < (b.w + p.w) / 2 - .02 && Math.abs(b.z - p.z) < (b.d + p.d) / 2 - .02 && (i + 1) * STACK.height <= p.y + STACK.height * .6 ? Math.max(y, (i + 1) * STACK.height) : y,
      Math.abs(p.x) < ROOF_HALF + p.w / 2 && Math.abs(p.z) < ROOF_HALF + p.d / 2 ? 0 : -Infinity);
    if (p.y <= under) { p.y = under; p.vy = 0; p.landed = true; p.life = Math.min(p.life, 1.2); }
  }
  s.pieces = s.pieces.filter(p => p.life > 0);
}
export function stackGrade(s) {
  const goal = DIFFICULTIES[s.difficulty].stackGoal, top = s.blocks.at(-1), area = top.w * top.d / (STACK.size * STACK.size);
  const value = (s.perfect / goal) * .6 + area * .4;
  return value >= .8 ? 'S' : value >= .6 ? 'A' : value >= .4 ? 'B' : 'C';
}
export function dropStack(s) {
  if (s.phase !== 'playing' || s.cooldown > 0) return null;
  // The top in the world, leaning with the sway along the lane; kept blocks are stored upright.
  const lean = [s.sway, s.sway], under = s.blocks.at(-1), top = { ...under, x: under.x + lean[0], z: under.z + lean[1] };
  const moving = s.moving, delta = moving[s.axis] - top[s.axis], perfect = Math.abs(delta) <= STACK.perfect;
  if (perfect) moving[s.axis] = top[s.axis];
  const ox = intervalOverlap(moving.x, top.x, moving.w, top.w), oz = intervalOverlap(moving.z, top.z, moving.d, top.d), level = s.blocks.length;
  if (ox.size < .08 || oz.size < .08) {
    s.phase = 'lost'; s.grade = stackGrade(s); s.pieces.push({ ...moving, y: level * STACK.height, vy: 0, spin: 0, life: 3, whole: true });
    s.events.push({ type: 'miss', text: 'Missed the tower. Try again?' }); return { lost: true };
  }
  const kept = { x: ox.center - lean[0], z: oz.center - lean[1], w: ox.size, d: oz.size };
  const lostWidth = moving.w - ox.size, lostDepth = moving.d - oz.size;
  if (lostWidth > .001) s.pieces.push({ x: delta > 0 ? ox.center + ox.size / 2 + lostWidth / 2 : ox.center - ox.size / 2 - lostWidth / 2, z: moving.z, w: lostWidth, d: moving.d, y: level * STACK.height, vy: 0, spin: 0, life: 2, side: Math.sign(delta) });
  if (lostDepth > .001) s.pieces.push({ z: delta > 0 ? oz.center + oz.size / 2 + lostDepth / 2 : oz.center - oz.size / 2 - lostDepth / 2, x: moving.x, d: lostDepth, w: moving.w, y: level * STACK.height, vy: 0, spin: 0, life: 2, side: Math.sign(delta) });
  s.drops++; s.marks.push(perfect); s.combo = perfect ? s.combo + 1 : 0; s.longestCombo = Math.max(s.longestCombo, s.combo);
  if (perfect) s.perfect++;
  // A run of perfect drops mends the footprint a little, back toward the slab you started with.
  let grew = false;
  if (perfect && s.combo >= STACK.growAfter && (kept.w < STACK.size || kept.d < STACK.size)) {
    kept.w = Math.min(STACK.size, kept.w + STACK.grow); kept.d = Math.min(STACK.size, kept.d + STACK.grow); s.mended++; grew = true;
  }
  s.blocks.push(kept); s.last = { perfect, grew, at: s.elapsed };
  const points = perfect ? 150 + Math.min(5, s.combo - 1) * 25 : 100;
  s.score += points;
  s.events.push(grew ? { type: 'grow', text: `Perfect · ${s.combo} in a row · the slab grows back · +${points}` }
    : { type: perfect ? 'perfect' : 'cut', text: perfect ? `Perfect placement · +${points} · ${s.combo} in a row` : `Level ${s.drops} · ${Math.round(kept.w * kept.d / 16 * 100)}% of the starting footprint remains` });
  if (s.drops >= DIFFICULTIES[s.difficulty].stackGoal) { s.phase = 'won'; s.grade = stackGrade(s); return { perfect, kept, grew }; }
  const stage = stackStage(s);
  if (stage !== s.stage) { s.stage = stage; s.stageAt = s.elapsed; s.events.push({ type: 'stage-start', text: `Stage ${stage + 1} · ${STAGES[stage].name}. ${STAGES[stage].brief}` }); }
  s.axis = s.axis === 'x' ? 'z' : 'x'; s.direction = s.drops % 2 ? -1 : 1; s.sway = swayAt(s);
  const start = { ...kept, x: kept.x + s.sway, z: kept.z + s.sway };
  s.moving = { ...start, [s.axis]: start[s.axis] - s.direction * STACK.range }; s.cooldown = .14;
  return { perfect, kept, grew };
}
export function validateRecords(raw) {
  const result = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return result;
  for (const [key, value] of Object.entries(raw).slice(0, 100)) {
    if (!/^(flight|flight-v2|stack|stack-v2):(relaxed|standard)$|^maze(-v2)?:(relaxed|standard):\d{1,6}$/.test(key)) continue;
    if (!Number.isFinite(value) || value < 0 || value > 1000000) continue;
    result[key] = value;
  }
  return result;
}
// Ring Runner's three-sector course scores differently from the first course, so its bests start afresh.
// The Green Room's three floors take longer than its first single floor, so its times start afresh too,
// and Sky Stack's mending and stages change its scores.
export function recordKey(s) { return `${s.mode === 'flight' ? 'flight-v2' : s.mode === 'maze' ? 'maze-v2' : 'stack-v2'}:${s.difficulty}${s.mode === 'maze' ? ':' + s.seed : ''}`; }
export function updateRecord(records, s) {
  if (!['won', 'lost'].includes(s.phase)) return false;
  const key = recordKey(s);
  if (s.mode === 'maze') { if (s.phase !== 'won') return false; const value = Math.round(s.elapsed * 10) / 10; if (records[key] === undefined || value < records[key]) { records[key] = value; return true; } }
  else if (s.score > (records[key] || 0)) { records[key] = s.score; return true; }
  return false;
}
