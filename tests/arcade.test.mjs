import test from 'node:test';
import assert from 'node:assert/strict';
import { DIFFICULTIES, SECTORS, BOOST, createFlight, evaluateRing, stepFlight, ringAt, flightPar, createMaze, mazeDistances, walkable, stepMaze, castRay, createStack, dropStack, stepStack, validateRecords, updateRecord, recordKey } from '../arcade/engine.js';

test('flight course is completable by ordinary steering at both paces', () => {
  for (const difficulty of Object.keys(DIFFICULTIES)) {
    const state = createFlight(difficulty); state.phase = 'playing';
    for (let i = 0; i < 90 * 90 && state.phase === 'playing'; i++) {
      const ring = state.rings.find(r => !r.result), place = ringAt(ring, state.elapsed);
      stepFlight(state, { target: { x: place.x, y: place.y } }, 1 / 90);
    }
    assert.equal(state.phase, 'won'); assert.equal(state.shields, 3); assert.equal(state.impacts, 0); assert.equal(state.passed, state.rings.length);
    assert.ok(state.perfect >= state.rings.length - 1);
    assert.deepEqual(state.medals, ['gold', 'gold', 'gold']); assert.equal(state.grade, 'S');
    assert.equal(state.rings.length, DIFFICULTIES[difficulty].ringsPerSector * SECTORS.length);
  }
});
test('each sector has its own rule: still rings, drifting rings with rocks, breathing rings', () => {
  const state = createFlight();
  const by = k => state.rings.filter(r => r.sector === k);
  assert.ok(by(0).every(r => !r.drift && !r.pulse));
  assert.ok(by(1).every(r => r.drift && !r.pulse)); assert.ok(state.rocks.length === DIFFICULTIES.standard.rocks);
  assert.ok(by(2).every(r => r.pulse && !r.drift));
  const drifting = by(1)[0], a = ringAt(drifting, 0), b = ringAt(drifting, 1.5);
  assert.ok(Math.hypot(a.x - b.x, a.y - b.y) > .05); assert.equal(a.radius, drifting.radius);
  const breathing = by(2)[0], sizes = [0, .4, .8, 1.2, 1.6, 2].map(t => ringAt(breathing, t).radius);
  assert.ok(Math.min(...sizes) < breathing.radius * .85 && Math.max(...sizes) <= breathing.radius);
  // Every rock sits off the line between the rings it lies between, by more than a ring can drift.
  const field = by(1);
  for (const rock of state.rocks) {
    const i = field.findIndex((r, k) => field[k + 1] && r.z <= rock.z && field[k + 1].z >= rock.z), a = field[i], c = field[i + 1], t = (rock.z - a.z) / (c.z - a.z);
    assert.ok(Math.hypot(rock.x - (a.x + (c.x - a.x) * t), rock.y - (a.y + (c.y - a.y) * t)) > rock.r + DIFFICULTIES.standard.drift + .5);
  }
});
test('a rock costs a shield once, and a shield cell gives one back', () => {
  const state = createFlight(); state.phase = 'playing'; state.shields = 2;
  const rock = state.rocks[0]; state.rings.forEach(r => { r.result = r.z < rock.z ? 'hit' : null; });
  state.passed = state.rings.filter(r => r.result).length; state.sector = 1;
  state.z = rock.z - .5; state.x = rock.x; state.y = rock.y;
  stepFlight(state, { target: { x: rock.x, y: rock.y } }, .1);
  assert.equal(rock.hit, true); assert.equal(state.shields, 1); assert.equal(state.impacts, 1);
  stepFlight(state, { target: { x: rock.x, y: rock.y } }, .1); assert.equal(state.shields, 1);
  const cell = state.cells[0]; state.z = cell.z - .5; state.x = cell.x; state.y = cell.y; state.vx = state.vy = 0;
  state.rings.forEach(r => { if (r.z < cell.z) r.result = r.result || 'hit'; });
  stepFlight(state, { target: { x: cell.x, y: cell.y } }, .1);
  assert.equal(cell.taken, true); assert.equal(state.shields, 2);
  assert.ok(state.events.some(e => e.type === 'impact') && state.events.some(e => e.type === 'pickup'));
});
test('boost flies faster, drains while held, scores half again, and center passes refill it', () => {
  const plain = createFlight(), boosted = createFlight(); plain.phase = boosted.phase = 'playing';
  stepFlight(plain, {}, .5); stepFlight(boosted, { boost: true }, .5);
  assert.ok(Math.abs(boosted.z / plain.z - BOOST.speed) < 1e-9); assert.ok(Math.abs(boosted.boost - (1 - BOOST.drain * .5)) < 1e-9);
  const empty = createFlight(); empty.phase = 'playing'; empty.boost = 0; stepFlight(empty, { boost: true }, .5); assert.equal(empty.boosting, false); assert.equal(empty.z, plain.z);
  const s = createFlight(); s.phase = 'playing'; s.boost = .5; s.z = 23.9;
  stepFlight(s, { boost: true, target: { x: 0, y: 0 } }, .05);
  assert.equal(s.rings[0].result, 'perfect'); assert.equal(s.score, 225); assert.ok(Math.abs(s.boost - (.5 - BOOST.drain * .05 + BOOST.perfect)) < 1e-9);
});
test('sectors are announced, closed with a medal, and the run ends with a grade', () => {
  const state = createFlight('relaxed'); state.phase = 'playing';
  for (let i = 0; i < 90 * 90 && state.phase === 'playing'; i++) {
    const ring = state.rings.find(r => !r.result), place = ringAt(ring, state.elapsed), sloppy = ring.sector === 1 ? 1.1 : 0;
    stepFlight(state, { target: { x: place.x + sloppy * place.radius * .5, y: place.y } }, 1 / 90);
    state.events.length > 40 && state.events.splice(0, 20);
  }
  assert.equal(state.phase, 'won');
  assert.equal(state.medals.length, 3); assert.equal(state.medals[0], 'gold'); assert.notEqual(state.medals[1], 'gold');
  assert.ok(['S', 'A', 'B', 'C'].includes(state.grade)); assert.ok(state.score <= flightPar(state) * BOOST.points);
});
test('three ring misses end the run and cannot award repeated scores', () => {
  const state = createFlight(); state.phase = 'playing'; state.x = 5.8; state.y = 3.6;
  for (let i = 0; i < 90 * 20 && state.phase === 'playing'; i++) stepFlight(state, {}, 1 / 90);
  assert.equal(state.phase, 'lost'); assert.equal(state.shields, 0); assert.equal(state.passed, 3);
  const snapshot = JSON.stringify(state); stepFlight(state, {}, 1); assert.equal(JSON.stringify(state), snapshot);
});
test('ring hit is judged at the plane crossing, not at the end of the frame', () => {
  const state = createFlight(); state.phase = 'playing'; state.z = 23; state.vx = 5; state.rings = [{ x: 5 / 12, y: 0, z: 24, radius: .1, result: null }];
  stepFlight(state, { x: 1 }, .2); assert.equal(state.rings[0].result, 'perfect'); assert.ok(state.x > .9); assert.equal(state.phase, 'won');
  assert.equal(evaluateRing({ x: 0, y: 0, radius: 1 }, 1, 0).hit, true); assert.equal(evaluateRing({ x: 0, y: 0, radius: 1 }, 1.01, 0).hit, false);
});
test('paused rules do not advance a game or accept a tower drop', () => {
  for (const [factory, step] of [[createFlight, stepFlight], [createMaze, stepMaze], [createStack, stepStack]]) {
    const state = factory(); state.phase = 'paused'; const snapshot = JSON.stringify(state); step(state, { x: 1, y: 1 }, 1); assert.equal(JSON.stringify(state), snapshot);
    if (state.mode === 'stack') assert.equal(dropStack(state), null);
  }
});
test('500 generated mazes at both paces have exactly three distinct reachable crystals and a reachable exit', () => {
  for (const difficulty of Object.keys(DIFFICULTIES)) for (let seed = 1; seed <= 500; seed++) {
    const s = createMaze(difficulty, seed), distances = mazeDistances(s.grid, [1, 1]);
    assert.equal(s.gems.length, 3, `${difficulty} seed ${seed}`);
    const targets = [...s.gems, s.exit].map(p => `${Math.floor(p.x)},${Math.floor(p.y)}`);
    assert.equal(new Set(targets).size, 4);
    targets.forEach(key => assert.ok(distances.has(key), `Unreachable ${key}, seed ${seed}`));
    assert.ok(s.grid[0].split('').every(x => x === '1')); assert.ok(s.grid.at(-1).split('').every(x => x === '1'));
  }
});
test('maze seeds are reproducible but different layouts really differ', () => {
  assert.deepEqual(createMaze('standard', 73).grid, createMaze('standard', 73).grid);
  assert.notDeepEqual(createMaze('standard', 73).grid, createMaze('standard', 74).grid);
});
test('maze exit stays locked until every crystal is collected once', () => {
  const s = createMaze(); s.phase = 'playing'; s.x = s.exit.x; s.y = s.exit.y; stepMaze(s, {}, .01);
  assert.equal(s.phase, 'playing'); assert.equal(s.events.at(-1).type, 'locked');
  for (const gem of s.gems) { s.x = gem.x; s.y = gem.y; stepMaze(s, {}, .01); stepMaze(s, {}, .01); }
  assert.equal(s.collected, 3); assert.equal(s.score, 3);
  s.x = s.exit.x; s.y = s.exit.y; stepMaze(s, {}, .01); assert.equal(s.phase, 'won');
});
test('wall collisions retain player clearance and DDA rays hit exact boundaries', () => {
  const grid = ['11111', '10001', '10001', '10001', '11111'];
  assert.equal(walkable(grid, 1.5, 1.5), true); assert.equal(walkable(grid, 1.05, 1.5), false); assert.equal(walkable(grid, -1, 2), false);
  assert.equal(castRay(grid, 2.5, 2.5, 1, 0).distance, 1.5); assert.equal(castRay(grid, 2.5, 2.5, -1, 0).distance, 1.5);
  assert.ok(Math.abs(castRay(grid, 2.5, 2.5, 1, 1).distance - 1.5) < 1e-12);
  const state = createMaze(); state.grid = grid; state.x = 1.5; state.y = 1.5; state.a = Math.PI; state.phase = 'playing';
  for (let i = 0; i < 900; i++) stepMaze(state, { y: 1 }, 1 / 90);
  assert.ok(state.x >= 1.18); assert.ok(state.x < 1.21);
});
test('tower overhangs are cut from footprint and missed drops end the game', () => {
  const s = createStack(); s.phase = 'playing'; s.moving.x = 2;
  const result = dropStack(s); assert.equal(result.perfect, false); assert.equal(s.blocks.at(-1).w, 2); assert.equal(s.blocks.at(-1).d, 4); assert.equal(s.blocks.at(-1).x, 1); assert.equal(s.pieces.length, 1); assert.equal(s.axis, 'z');
  s.cooldown = 0; s.moving.z = 8; dropStack(s); assert.equal(s.phase, 'lost'); assert.equal(s.drops, 1);
});
test('perfect placements preserve size, increase score, and complete both goals', () => {
  for (const difficulty of Object.keys(DIFFICULTIES)) {
    const s = createStack(difficulty); s.phase = 'playing';
    for (let i = 0; i < DIFFICULTIES[difficulty].stackGoal; i++) { s.cooldown = 0; s.moving = { ...s.blocks.at(-1) }; dropStack(s); }
    assert.equal(s.phase, 'won'); assert.equal(s.blocks.at(-1).w * s.blocks.at(-1).d, 16); assert.equal(s.perfect, DIFFICULTIES[difficulty].stackGoal); assert.ok(s.score > s.drops * 150);
    const score = s.score; dropStack(s); assert.equal(s.score, score);
  }
});
test('tower input cooldown rejects accidental double taps', () => {
  const s = createStack(); s.phase = 'playing'; s.moving = { ...s.blocks.at(-1) }; dropStack(s); const score = s.score;
  assert.equal(dropStack(s), null); assert.equal(s.score, score); stepStack(s, {}, .2); assert.equal(s.cooldown, 0);
});
test('records reject malformed storage and use fastest completed maze run per seed', () => {
  const result = validateRecords({ 'flight:standard': 1200, 'flight-v2:relaxed': 3100, 'stack:relaxed': -1, 'maze:standard:73': 52.1, 'bad:key': 6, 'flight:relaxed': '<img>', 'stack:standard': Infinity });
  assert.deepEqual(result, { 'flight:standard': 1200, 'flight-v2:relaxed': 3100, 'maze:standard:73': 52.1 });
  assert.equal(recordKey(createFlight('relaxed')), 'flight-v2:relaxed');
  assert.deepEqual(validateRecords(['bad']), {}); assert.deepEqual(validateRecords(null), {});
  const s = createMaze(); s.phase = 'won'; s.elapsed = 45.4; assert.equal(updateRecord(result, s), true); assert.equal(result[recordKey(s)], 45.4);
  s.elapsed = 48; assert.equal(updateRecord(result, s), false); s.phase = 'lost'; s.elapsed = 1; assert.equal(updateRecord(result, s), false);
  const replay = createMaze(); assert.equal(replay.phase, 'ready'); assert.equal(replay.collected, 0); assert.equal(replay.elapsed, 0);
});
