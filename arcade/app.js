import { canvasSize, safeLoad, safeSave } from '../shared/core.js';
import { DIFFICULTIES, createFlight, createMaze, createStack, stepFlight, stepMaze, stepStack, dropStack, validateRecords, updateRecord, recordKey } from './engine.js';
import { renderGame } from './render.js';

const $ = selector => document.querySelector(selector), canvas = $('#game'), surface = canvasSize(canvas), reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const copy = {
  flight: { title: 'Ring Runner', eyebrow: 'CARTRIDGE 01 / FLY THROUGH THE RINGS', opening: 'Can you hit the center?', intro: 'Fly through the rings and aim for the center. Keep passing them to build a combo. You have three shields; miss three rings and the run ends.', controls: 'Steer with arrows or WASD. On touch, drag the game view or hold the arrow buttons. The little radar points toward the next ring.', hint: 'ARROWS / WASD TO STEER · DRAG TO AIM · ESC TO PAUSE', canvas: 'Ring Runner game view. Use arrows or WASD to steer, or drag on touch. Escape pauses the game.', rules: 'Each pass earns 100 points. A center pass earns 150. Consecutive passes build a bonus, up to 100 extra points per ring. Missing a ring costs a shield; three misses end the run. The course is fixed at each pace so best scores are comparable. Easygoing has wider rings and slower flight.' },
  maze: { title: 'The Green Room', eyebrow: 'CARTRIDGE 02 / FIND THE EXIT', opening: 'There is a way out.', intro: 'Find all three crystals, then head for the pink exit. The map fills in as you go. Take your time, or try to beat your last run.', controls: 'Up / W goes forward; Down / S backs up. Left / A and Right / D turn. You can also drag the view to look around. Your map fills in as you explore.', hint: '↑ / W FORWARD · ← → / A D TURN · DRAG TO LOOK · ESC PAUSES', canvas: 'The Green Room maze. Use arrows or WASD to walk and turn; drag to look around. Escape pauses. Collect three crystals and find the exit.', rules: 'The exit opens only when all three crystals are collected. Each generated maze is connected, with reachable objectives. There is no time limit. Reveal map is always available if you get turned around. Best escape time is saved for this exact maze and pace. New maze resets the run and generates a different layout.' },
  stack: { title: 'Sky Stack', eyebrow: 'CARTRIDGE 03 / STACK THE BLOCKS', opening: 'How high can you get?', intro: 'Drop the slab onto the tower. Anything hanging over the edge gets cut off, so the next one gets harder. A perfect drop keeps the whole footprint.', controls: 'Press Space, tap the tower, or use Drop block. The active lane alternates each level. Place the slab over the dotted footprint.', hint: 'SPACE / TAP THE TOWER TO DROP · ESC TO PAUSE', canvas: 'Sky Stack tower game. Press Space or tap the tower to drop a block. Escape pauses.', rules: 'Every successful level earns 100 points. A perfect drop earns 150 plus a streak bonus. Near-perfect drops snap into place. Every overhang is removed from the next slab. Miss the tower and the run ends. Complete 18 levels to build the skyline; Easygoing asks for 12 with slower movement.' },
};
const factories = { flight: createFlight, maze: createMaze, stack: createStack }, steppers = { flight: stepFlight, maze: stepMaze, stack: stepStack };
let mode = 'flight', difficulty = 'standard', seed = 73, state = factories.flight(difficulty, seed), records = validateRecords(safeLoad('brandon-arcade-records-v2', {}));
let previousTime = 0, accumulated = 0, lastUiTime = 0, frameId = 0, visible = true, lastPhase = state.phase, finished = false, feedbackUntil = 0;
const keys = new Set(), touchKeys = new Map(); let aim = null, lookPointer = null, soundEnabled = false, audioContext = null;
const timeLabel = seconds => { const mins = Math.floor(seconds / 60); return `${mins}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`; };
function status(text) { $('#game-status').textContent = text; }
function clearInput() { keys.clear(); touchKeys.clear(); aim = null; lookPointer = null; document.querySelectorAll('[data-key]').forEach(b => b.classList.remove('pressed')); }
function syncBest() {
  const value = records[recordKey(state)];
  $('#best-label').textContent = mode === 'maze' ? `FASTEST ESCAPE / MAZE ${state.seed}` : 'PERSONAL BEST / THIS PACE';
  $('#best').textContent = Number.isFinite(value) ? mode === 'maze' ? `${timeLabel(value)}.${Math.round(value * 10) % 10}` : value.toLocaleString() : 'No record yet.';
}
function configure() {
  const text = copy[mode]; $('#game-title').textContent = text.title; $('#game-description').textContent = text.intro; $('#game-controls').textContent = text.controls;
  $('#game-rules').replaceChildren(); const p = document.createElement('p'); p.textContent = text.rules; $('#game-rules').append(p);
  $('#input-hint').textContent = text.hint; canvas.setAttribute('aria-label', text.canvas);
  $('#cartridge-label').textContent = `${text.title.toUpperCase()} / ${mode === 'maze' ? 'MAZE ' + seed : DIFFICULTIES[difficulty].label.toUpperCase()}`;
  $('#renderer-label').textContent = { flight: 'PERSPECTIVE 3D / RING RUNNER', maze: 'RAY-CAST 3D / THE GREEN ROOM', stack: 'ISOMETRIC 3D / SKY STACK' }[mode];
  $('#new-maze').hidden = mode !== 'maze'; $('#map-toggle').hidden = mode !== 'maze'; $('#action').hidden = mode !== 'stack'; $('#touch-controls').hidden = mode === 'stack';
  document.querySelectorAll('[data-game]').forEach(b => b.setAttribute('aria-pressed', b.dataset.game === mode));
  $('#map-toggle').setAttribute('aria-pressed', Boolean(state.reveal)); $('#map-toggle').textContent = state.reveal ? 'Hide full map' : 'Reveal map';
  syncBest(); syncUi(); syncOverlay();
}
function reset(message = 'Ready when you are.') {
  clearInput(); state = factories[mode](difficulty, seed); finished = false; accumulated = 0; previousTime = 0; lastPhase = 'ready'; feedbackUntil = 0;
  $('#game-feedback').className = ''; status(message); configure(); requestFrame();
}
function start() {
  reset(); state.phase = 'playing'; lastPhase = 'playing'; status(mode === 'maze' ? 'Find the three crystals, then the exit.' : mode === 'flight' ? 'The first two rings are straight ahead. Aim for the center.' : 'Watch the moving slab. Drop it over the footprint.');
  syncOverlay(); canvas.focus({ preventScroll: true }); $('#game-stage').scrollIntoView({ behavior: reduceMotion.matches ? 'instant' : 'smooth', block: 'center' }); requestFrame();
}
function pause(reason = 'Paused. Pick up where you left off.') {
  if (state.phase !== 'playing') return;
  state.phase = 'paused'; clearInput(); accumulated = 0; status(reason); syncOverlay(); requestFrame();
}
function togglePause() {
  if (state.phase === 'playing') pause();
  else if (state.phase === 'paused') { state.phase = 'playing'; previousTime = 0; accumulated = 0; status('Back in the game.'); syncOverlay(); canvas.focus({ preventScroll: true }); requestFrame(); }
}
function syncOverlay() {
  const phase = state.phase, text = copy[mode], overlay = $('#game-overlay');
  overlay.hidden = phase === 'playing'; $('#pause-game').disabled = !['playing', 'paused'].includes(phase); $('#pause-game').textContent = phase === 'paused' ? 'Resume' : 'Pause';
  $('#start-game').textContent = phase === 'ready' ? 'Play' : ['won', 'lost'].includes(phase) ? 'Play again' : 'Restart'; $('#action').disabled = phase !== 'playing';
  if (phase === 'playing') return;
  $('#overlay-eyebrow').textContent = phase === 'ready' ? text.eyebrow : phase === 'paused' ? 'INTERMISSION' : phase === 'won' ? 'RUN COMPLETE' : 'ONE MORE TRY?';
  $('#overlay-title').textContent = phase === 'ready' ? text.opening : phase === 'paused' ? 'Paused.' : phase === 'won' ? { flight: 'Nice. You made it.', maze: 'There’s the exit.', stack: 'Nice tower.' }[mode] : mode === 'flight' ? 'Lost the line.' : 'Missed it. One more try?';
  $('#overlay-copy').textContent = phase === 'ready' ? mode === 'maze' ? 'Find three crystals to open the exit. Your map will fill in as you explore.' : mode === 'flight' ? `${state.rings.length} rings. Three shields. Aim for the center.` : `${DIFFICULTIES[difficulty].stackGoal} drops to the skyline. How steady is your timing?` : phase === 'paused' ? 'Your run is paused. Press Resume or Escape to keep going.' : mode === 'maze' ? `Escaped maze ${seed} in ${timeLabel(state.elapsed)}. Try it again or carve a new path.` : mode === 'flight' ? `${state.score.toLocaleString()} points · ${state.perfect} center passes · best streak ${state.longestCombo}` : `${state.drops} levels · ${state.perfect} perfect drops · ${state.score.toLocaleString()} points`;
  $('#overlay-prompt').textContent = phase === 'ready' ? 'PRESS PLAY BELOW TO BEGIN' : phase === 'paused' ? 'PRESS RESUME OR ESCAPE TO CONTINUE' : 'PRESS PLAY AGAIN FOR ANOTHER RUN';
}
function syncUi() {
  const s = state, labels = mode === 'flight' ? ['Rings', 'Combo', 'Score'] : mode === 'maze' ? ['Crystals', 'Time', 'Explored'] : ['Levels', 'Perfect', 'Score'];
  const values = mode === 'flight' ? [`${s.passed}/${s.rings.length}`, String(s.combo), String(s.score)] : mode === 'maze' ? [`${s.collected}/3`, timeLabel(s.elapsed), String(s.visited.size)] : [`${s.drops}/${DIFFICULTIES[difficulty].stackGoal}`, String(s.perfect), String(s.score)];
  ['one', 'two', 'three'].forEach((key, i) => { $('#stat-' + key + '-label').textContent = labels[i]; $('#stat-' + key).textContent = values[i]; });
  $('#game-hud').textContent = mode === 'flight' ? `SHIELDS ${'●'.repeat(s.shields)}${'○'.repeat(3 - s.shields)}\nSECTOR ${Math.min(3, Math.floor(s.passed / 6) + 1)} · RING ${Math.min(s.passed + 1, s.rings.length)}/${s.rings.length}` : mode === 'maze' ? `CRYSTALS ${s.collected}/3 · ${timeLabel(s.elapsed)}\n${s.collected === 3 ? 'EXIT OPEN' : 'FIND ALL THREE CRYSTALS'}` : `LEVEL ${s.drops}/${DIFFICULTIES[difficulty].stackGoal}\n${s.axis === 'x' ? '↘' : '↙'} NEXT LANE · ${s.combo ? s.combo + ' PERFECT STREAK' : 'FIND YOUR TIMING'}`;
}
function feedback(event, now) {
  status(event.text); const element = $('#game-feedback'); element.textContent = event.text; element.className = `show${event.type === 'miss' ? ' miss' : ''}`; feedbackUntil = now + 1600;
  playSound(event.type === 'miss' ? 'miss' : event.type === 'perfect' ? 'perfect' : 'hit');
}
function complete() {
  if (finished) return; finished = true; clearInput();
  const improved = updateRecord(records, state); while (Object.keys(records).length > 100) delete records[Object.keys(records)[0]];
  const saved = safeSave('brandon-arcade-records-v2', records); $('#best-note').textContent = saved ? 'Saved only in this browser.' : 'Storage unavailable; this record lasts for this visit.';
  syncBest(); status((state.phase === 'won' ? 'Run complete.' : 'Run over.') + (improved ? ' A new personal best.' : ' One more try?')); if (state.phase === 'won') playSound('win'); syncOverlay(); syncUi();
}
function input() {
  const pressed = key => keys.has(key) || [...touchKeys.values()].includes(key);
  return { x: (pressed('ArrowRight') ? 1 : 0) - (pressed('ArrowLeft') ? 1 : 0), y: (pressed('ArrowUp') ? 1 : 0) - (pressed('ArrowDown') ? 1 : 0), target: aim };
}
function act() { if (mode !== 'stack') return; dropStack(state); requestFrame(); }
function frame(now) {
  frameId = 0; if (document.hidden || !visible) { previousTime = 0; return; }
  const elapsed = previousTime ? Math.min((now - previousTime) / 1000, .1) : 0; previousTime = now;
  if (state.phase === 'playing') {
    accumulated += elapsed; const command = input();
    while (accumulated >= 1 / 90 && state.phase === 'playing') { steppers[mode](state, command, 1 / 90); accumulated -= 1 / 90; }
  } else accumulated = 0;
  for (const event of state.events.splice(0)) feedback(event, now);
  if (['won', 'lost'].includes(state.phase) && !finished) complete();
  if (lastPhase !== state.phase) { lastPhase = state.phase; syncOverlay(); }
  renderGame(surface.ctx, surface.w, surface.h, state);
  if (now - lastUiTime > 100) { syncUi(); lastUiTime = now; }
  if (feedbackUntil && now > feedbackUntil) { $('#game-feedback').className = ''; feedbackUntil = 0; }
  if (state.phase === 'playing' || feedbackUntil) requestFrame();
}
function requestFrame() { if (!frameId && visible && !document.hidden) frameId = requestAnimationFrame(frame); }
new ResizeObserver(requestFrame).observe(canvas);
new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; if (!visible) pause('Paused while the game is out of view.'); else requestFrame(); }, { threshold: .03 }).observe(canvas);
const mapKey = key => ({ a: 'ArrowLeft', d: 'ArrowRight', w: 'ArrowUp', s: 'ArrowDown' })[key.toLowerCase()] || key;
// While a run is on, steering keys reach the game wherever focus is. A click on a game
// button used to hand the arrow keys back to the page, which scrolled it up and down.
const formField = target => target.closest?.('input, select, textarea, [contenteditable]');
const interactive = target => target.closest?.('button, a, summary, input, select, textarea, [contenteditable]');
function gameKey(event, key) {
  if (event.target === canvas) return true;
  if (state.phase !== 'playing' || event.ctrlKey || event.metaKey || event.altKey) return false;
  if (key.startsWith('Arrow')) return !formField(event.target);
  return key === ' ' && !interactive(event.target);
}
document.addEventListener('keydown', event => {
  const key = mapKey(event.key);
  if (!gameKey(event, key)) return;
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' ', 'Escape', 'p', 'P'].includes(key)) event.preventDefault();
  if (key === ' ') { if (!event.repeat) act(); }
  else if (key.startsWith('Arrow')) { aim = null; keys.add(key); }
});
document.addEventListener('keyup', event => keys.delete(mapKey(event.key)));
$('#game-area').addEventListener('keydown', event => {
  if (event.key === 'Escape' || (event.key.toLowerCase() === 'p' && event.target.tagName !== 'SELECT')) {
    event.preventDefault(); if (!event.repeat) togglePause();
  }
});
canvas.addEventListener('blur', () => keys.clear());
for (const button of document.querySelectorAll('[data-key]')) {
  button.addEventListener('pointerdown', event => { event.preventDefault(); if (state.phase !== 'playing') return; button.setPointerCapture(event.pointerId); aim = null; touchKeys.set(event.pointerId, button.dataset.key); button.classList.add('pressed'); });
  const release = event => { touchKeys.delete(event.pointerId); button.classList.remove('pressed'); };
  button.addEventListener('pointerup', release); button.addEventListener('pointercancel', release); button.addEventListener('lostpointercapture', release);
  button.addEventListener('click', event => { if (event.detail !== 0 || state.phase !== 'playing') return; const key = 'access-' + button.dataset.key; touchKeys.set(key, button.dataset.key); button.classList.add('pressed'); setTimeout(() => { touchKeys.delete(key); button.classList.remove('pressed'); }, 180); });
}
canvas.addEventListener('pointerdown', event => {
  canvas.focus({ preventScroll: true }); if (state.phase !== 'playing') return;
  canvas.setPointerCapture(event.pointerId);
  if (mode === 'stack') act();
  else if (mode === 'flight') setAim(event);
  else lookPointer = { id: event.pointerId, x: event.clientX };
});
function setAim(event) { const rect = canvas.getBoundingClientRect(); aim = { x: (event.clientX - rect.left) / rect.width * 11.6 - 5.8, y: 3.6 - (event.clientY - rect.top) / rect.height * 7.2 }; }
canvas.addEventListener('pointermove', event => {
  if (state.phase !== 'playing' || !canvas.hasPointerCapture(event.pointerId)) return;
  if (mode === 'flight') setAim(event);
  else if (mode === 'maze' && lookPointer?.id === event.pointerId) { state.a += (event.clientX - lookPointer.x) * .007; lookPointer.x = event.clientX; }
});
for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(event, () => { aim = null; lookPointer = null; });
addEventListener('blur', () => pause('Paused while you were away.'));
document.addEventListener('visibilitychange', () => { if (document.hidden) pause('Paused while you were away.'); else { previousTime = 0; requestFrame(); } });
$('#start-game').addEventListener('click', start); $('#pause-game').addEventListener('click', togglePause); $('#action').addEventListener('click', act);
$('#difficulty').addEventListener('change', event => { difficulty = event.target.value; reset('Pace changed. Start a fresh run when you’re ready.'); });
$('#new-maze').addEventListener('click', () => { seed = seed >= 999999 ? 1 : seed + 1; reset(`Maze ${seed} is ready. Three crystals, one exit.`); });
$('#map-toggle').addEventListener('click', () => { state.reveal = !state.reveal; $('#map-toggle').setAttribute('aria-pressed', state.reveal); $('#map-toggle').textContent = state.reveal ? 'Hide full map' : 'Reveal map'; requestFrame(); });
for (const button of document.querySelectorAll('[data-game]')) button.addEventListener('click', () => { mode = button.dataset.game; reset(); });
$('#sound-toggle').addEventListener('click', async () => {
  if (soundEnabled) { soundEnabled = false; $('#sound-toggle').textContent = 'Sound off'; $('#sound-toggle').setAttribute('aria-pressed', false); return; }
  const button = $('#sound-toggle'); button.disabled = true;
  try {
    audioContext ??= new (window.AudioContext || window.webkitAudioContext)();
    await Promise.race([audioContext.resume(), new Promise((_, reject) => setTimeout(() => reject(new Error('Audio unavailable')), 2500))]);
    soundEnabled = true; button.textContent = 'Sound on'; button.setAttribute('aria-pressed', true); playSound('hit');
  } catch { status('Sound is unavailable here. The games still work silently.'); }
  finally { button.disabled = false; }
});
function playSound(kind) {
  if (!soundEnabled || !audioContext || audioContext.state !== 'running') return;
  const notes = kind === 'win' ? [392, 523.25, 659.25] : kind === 'perfect' ? [523.25, 783.99] : kind === 'miss' ? [145] : [392];
  notes.forEach((frequency, i) => { const at = audioContext.currentTime + i * .075, oscillator = audioContext.createOscillator(), gain = audioContext.createGain(); oscillator.type = 'sine'; oscillator.frequency.value = frequency; gain.gain.setValueAtTime(0, at); gain.gain.linearRampToValueAtTime(.035, at + .008); gain.gain.exponentialRampToValueAtTime(.0001, at + .18); oscillator.connect(gain); gain.connect(audioContext.destination); oscillator.start(at); oscillator.stop(at + .2); oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); }; });
}
configure(); requestFrame();
// Full screen: the game column fills the screen. The Fullscreen API is used where the browser
// has it; elsewhere (iPhone Safari) the column becomes a fixed overlay.
const gameColumn = $('.game-column'), expandButton = $('#expand-game');
function setExpanded(on) {
  gameColumn.classList.toggle('expanded', on); document.documentElement.classList.toggle('game-expanded', on);
  expandButton.setAttribute('aria-pressed', on); expandButton.textContent = on ? 'Exit full screen' : 'Full screen';
  canvas.focus({ preventScroll: true }); requestFrame();
}
expandButton.addEventListener('click', async () => {
  if (!gameColumn.classList.contains('expanded')) {
    setExpanded(true);
    try { if (gameColumn.requestFullscreen && !document.fullscreenElement) await gameColumn.requestFullscreen({ navigationUI: 'hide' }); } catch { /* The overlay alone still fills the window. */ }
  } else {
    if (document.fullscreenElement) { try { await document.exitFullscreen(); } catch { /* Already out. */ } }
    setExpanded(false);
  }
});
document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && gameColumn.classList.contains('expanded')) setExpanded(false); });
