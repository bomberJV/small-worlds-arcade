import test from 'node:test';
import assert from 'node:assert/strict';
import { DIFFICULTIES, SECTORS, BOOST, createFlight, evaluateRing, stepFlight, ringAt, flightPar, createMaze, mazeDistances, walkable, stepMaze, castRay, FLOORS, SPRINT, WALK, inSight, createStack, dropStack, stepStack, STAGES, STACK, stackStage, stackGrade, validateRecords, updateRecord, recordKey } from '../arcade/engine.js';

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
const clearFloor = s => { for (const gem of s.gems) { s.x = gem.x; s.y = gem.y; stepMaze(s, {}, .01); } s.x = s.exit.x; s.y = s.exit.y; stepMaze(s, {}, .01); };
test('maze exit stays locked until every crystal is collected once, then leads down a floor', () => {
  const s = createMaze(); s.phase = 'playing'; s.x = s.exit.x; s.y = s.exit.y; stepMaze(s, {}, .01);
  assert.equal(s.phase, 'playing'); assert.equal(s.events.at(-1).type, 'locked');
  for (const gem of s.gems) { s.x = gem.x; s.y = gem.y; stepMaze(s, {}, .01); stepMaze(s, {}, .01); }
  assert.equal(s.collected, 3); assert.equal(s.score, 3);
  s.x = s.exit.x; s.y = s.exit.y; stepMaze(s, {}, .01);
  assert.equal(s.phase, 'playing'); assert.equal(s.floor, 1); assert.equal(s.collected, 0); assert.equal(s.x, 1.5); assert.equal(s.events.at(-1).type, 'floor');
});
test('three floors: the dark narrows the lantern, the warden only walks the last floor, and the run ends on floor three', () => {
  for (const difficulty of Object.keys(DIFFICULTIES)) {
    const s = createMaze(difficulty, 11); s.phase = 'playing';
    assert.equal(s.floor, 0); assert.equal(s.warden, null); const lit = s.lantern;
    clearFloor(s); assert.equal(s.floor, 1); assert.ok(s.lantern < lit); assert.equal(s.warden, null);
    clearFloor(s); assert.equal(s.floor, 2); assert.ok(s.warden);
    s.warden.speed = 0;
    clearFloor(s); assert.equal(s.phase, 'won'); assert.equal(s.crystals, 9); assert.equal(s.splits.length, 3);
    assert.ok(s.splits.every((t, i) => !i || t >= s.splits[i - 1]));
  }
  assert.ok(FLOORS[1].lantern.standard < FLOORS[1].lantern.relaxed);
});
test('every floor of 300 mazes at both paces is solvable and the warden starts well away from you', () => {
  for (const difficulty of Object.keys(DIFFICULTIES)) for (let seed = 1; seed <= 300; seed++) {
    const s = createMaze(difficulty, seed); s.phase = 'playing';
    for (let floor = 0; floor < FLOORS.length; floor++) {
      if (floor) clearFloor(s);
      const distances = mazeDistances(s.grid, [1, 1]), keys = [...s.gems, s.exit].map(p => `${Math.floor(p.x)},${Math.floor(p.y)}`);
      assert.equal(new Set(keys).size, 4, `${difficulty} ${seed} floor ${floor}`); keys.forEach(k => assert.ok(distances.has(k)));
      if (s.warden) assert.ok(distances.get(`${Math.floor(s.warden.x)},${Math.floor(s.warden.y)}`) >= 6);
    }
  }
});
test('the warden hunts you when it sees you, costs a spark, sends you back, and three catches end the run', () => {
  const s = createMaze('standard', 5); s.phase = 'playing'; clearFloor(s); clearFloor(s);
  assert.equal(s.floor, 2); s.gems[0].got = true; s.collected = 1;
  // Put the warden in plain sight down the first hall.
  const run = [...s.grid[1]].findIndex((c, x) => x > 1 && c === '1');
  s.warden.x = Math.min(run - .5, 3.5); s.warden.y = 1.5; s.warden.target = null; s.x = 1.5; s.y = 1.5;
  stepMaze(s, {}, .01); assert.equal(s.warden.hunting, true); assert.ok(s.events.some(e => e.type === 'seen'));
  for (let i = 0; i < 400 && s.sparks === 3; i++) stepMaze(s, {}, 1 / 60);
  assert.equal(s.sparks, 2); assert.equal(s.caught, 1); assert.equal(s.x, 1.5); assert.equal(s.collected, 1); assert.ok(s.grace > 0);
  // Grace: the warden cannot catch you twice in the same moment.
  s.warden.x = s.x; s.warden.y = s.y; stepMaze(s, {}, .01); assert.equal(s.sparks, 2);
  s.grace = 0; stepMaze(s, {}, .01); assert.equal(s.sparks, 1);
  s.grace = 0; s.warden.x = s.x; s.warden.y = s.y; stepMaze(s, {}, .01); assert.equal(s.sparks, 0); assert.equal(s.phase, 'lost');
});
test('sprint is faster, drains stamina, and only recovers when you ease off', () => {
  const grid = ['1111111111111111111111', '1000000000000000000001', '1111111111111111111111'];
  const walk = createMaze(), run = createMaze();
  for (const s of [walk, run]) Object.assign(s, { grid, x: 1.5, y: 1.5, a: 0, phase: 'playing', warden: null });
  for (let i = 0; i < 60; i++) { stepMaze(walk, { y: 1 }, 1 / 60); stepMaze(run, { y: 1, sprint: true }, 1 / 60); }
  assert.ok(Math.abs((run.x - 1.5) / (walk.x - 1.5) - SPRINT.speed) < .01); assert.ok(run.stamina < 1); assert.equal(walk.stamina, 1);
  for (let i = 0; i < 600; i++) stepMaze(run, { y: 1, sprint: true }, 1 / 60);
  assert.equal(run.winded, true); assert.equal(run.sprinting, false); assert.ok(run.stamina < SPRINT.winded);
  run.x = 1.5; const x = run.x; stepMaze(run, { y: 1, sprint: true }, 1 / 60); assert.ok(Math.abs(run.x - x - WALK / 60) < 1e-9);
  for (let i = 0; i < 120; i++) stepMaze(run, { y: 1 }, 1 / 60); assert.equal(run.winded, false);
});
test('a straight hall is in sight and a wall blocks it', () => {
  const grid = ['11111', '10001', '11101', '10001', '11111'];
  assert.equal(inSight(grid, 1.5, 1.5, 3.5, 1.5), true); assert.equal(inSight(grid, 1.5, 1.5, 1.5, 3.5), false);
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
// Drop the slab exactly over where the top is now, leaning with any sway.
const dropOnTop = (s, offset = 0) => { s.cooldown = 0; const top = s.blocks.at(-1); s.moving = { ...top, x: top.x + s.sway + (s.axis === 'x' ? offset : 0), z: top.z + s.sway + (s.axis === 'z' ? offset : 0) }; return dropStack(s); };
test('the climb moves through three stages with a title for each', () => {
  for (const difficulty of Object.keys(DIFFICULTIES)) {
    const s = createStack(difficulty), goal = DIFFICULTIES[difficulty].stackGoal; s.phase = 'playing';
    const starts = [];
    for (let i = 0; i < goal; i++) { stepStack(s, {}, .3); dropOnTop(s); starts.push(...s.events.splice(0).filter(e => e.type === 'stage-start').map(() => s.drops)); }
    assert.deepEqual(starts, [goal / 3, goal * 2 / 3]); assert.equal(s.phase, 'won'); assert.equal(s.grade, 'S');
  }
  assert.equal(STAGES.length, 3);
});
test('wind changes the slab speed only from stage two, and sway only in stage three', () => {
  const s = createStack(); s.phase = 'playing';
  for (let i = 0; i < 40; i++) { stepStack(s, {}, .05); assert.equal(s.gust, 0); assert.equal(s.sway, 0); }
  while (stackStage(s) < 1) { stepStack(s, {}, .05); dropOnTop(s); }
  const gusts = new Set(); for (let i = 0; i < 80; i++) { stepStack(s, {}, .05); gusts.add(s.gust.toFixed(3)); assert.equal(s.sway, 0); assert.ok(Math.abs(s.gust) <= STACK.gust.standard + 1e-9); }
  assert.ok(gusts.size > 20);
  while (stackStage(s) < 2) { stepStack(s, {}, .05); dropOnTop(s); }
  let most = 0; for (let i = 0; i < 120; i++) { stepStack(s, {}, .05); most = Math.max(most, Math.abs(s.sway)); }
  assert.ok(most > STACK.sway.standard * .9 && most <= STACK.sway.standard + 1e-9);
});
test('with sway, the slab rides the lean across its lane; dropping over the upright top cuts it, dropping where the top leans is perfect', () => {
  const s = createStack(); s.phase = 'playing';
  while (stackStage(s) < 2) { stepStack(s, {}, .05); dropOnTop(s); }
  while (Math.abs(s.sway) < .4) stepStack(s, {}, .02);
  const across = s.axis === 'x' ? 'z' : 'x'; assert.ok(Math.abs(s.moving[across] - s.blocks.at(-1)[across] - s.sway) < 1e-9);
  const lean = s.sway, before = s.blocks.at(-1);
  const r = dropOnTop(s); assert.equal(r.perfect, true);
  assert.ok(Math.abs(s.blocks.at(-1).x - before.x) < 1e-9 && Math.abs(s.blocks.at(-1).z - before.z) < 1e-9, 'kept upright under the lean');
  while (Math.abs(s.sway) < .4) stepStack(s, {}, .02);
  const r2 = dropOnTop(s, -s.sway); assert.equal(r2.perfect, false); assert.ok(s.pieces.length > 0); void lean;
});
test('three perfect drops in a row mend the footprint, never past the starting slab', () => {
  const s = createStack(); s.phase = 'playing';
  dropOnTop(s, 1); assert.equal(s.blocks.at(-1).w, 3);
  dropOnTop(s); dropOnTop(s); assert.equal(s.blocks.at(-1).w, 3);
  const r = dropOnTop(s); assert.equal(r.grew, true); assert.equal(s.blocks.at(-1).w, 3 + STACK.grow); assert.equal(s.blocks.at(-1).d, Math.min(4, 4 + STACK.grow)); assert.equal(s.mended, 1);
  assert.equal(s.events.at(-1).type, 'grow');
  for (let i = 0; i < 8; i++) dropOnTop(s);
  assert.equal(s.blocks.at(-1).w, 4); assert.equal(s.blocks.at(-1).d, 4);
});
test('a grade weighs perfect drops and the footprint left', () => {
  const s = createStack(); s.drops = 18; s.perfect = 18; assert.equal(stackGrade(s), 'S');
  s.perfect = 0; s.blocks.push({ x: 0, z: 0, w: 1, d: 1 }); assert.equal(stackGrade(s), 'C');
  s.perfect = 12; s.blocks.push({ x: 0, z: 0, w: 4, d: 2 }); assert.equal(stackGrade(s), 'A');
  assert.equal(recordKey(createStack('relaxed')), 'stack-v2:relaxed');
});
test('tower input cooldown rejects accidental double taps', () => {
  const s = createStack(); s.phase = 'playing'; s.moving = { ...s.blocks.at(-1) }; dropStack(s); const score = s.score;
  assert.equal(dropStack(s), null); assert.equal(s.score, score); stepStack(s, {}, .2); assert.equal(s.cooldown, 0);
});
test('records reject malformed storage and use fastest completed maze run per seed', () => {
  const result = validateRecords({ 'flight:standard': 1200, 'flight-v2:relaxed': 3100, 'stack:relaxed': -1, 'maze:standard:73': 52.1, 'maze-v2:relaxed:9': 140.5, 'stack-v2:standard': 2400, 'bad:key': 6, 'flight:relaxed': '<img>', 'stack:standard': Infinity });
  assert.deepEqual(result, { 'flight:standard': 1200, 'flight-v2:relaxed': 3100, 'maze:standard:73': 52.1, 'maze-v2:relaxed:9': 140.5, 'stack-v2:standard': 2400 });
  assert.equal(recordKey(createFlight('relaxed')), 'flight-v2:relaxed');
  assert.deepEqual(validateRecords(['bad']), {}); assert.deepEqual(validateRecords(null), {});
  const s = createMaze(); s.phase = 'won'; s.elapsed = 45.4; assert.equal(updateRecord(result, s), true); assert.equal(result[recordKey(s)], 45.4);
  s.elapsed = 48; assert.equal(updateRecord(result, s), false); s.phase = 'lost'; s.elapsed = 1; assert.equal(updateRecord(result, s), false);
  const replay = createMaze(); assert.equal(replay.phase, 'ready'); assert.equal(replay.collected, 0); assert.equal(replay.elapsed, 0);
});
