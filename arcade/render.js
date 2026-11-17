import { DIFFICULTIES } from './engine.js';
import { flightScene } from './flight3d.js';
import { roomScene } from './room3d.js';
const TAU = Math.PI * 2;
function polygon(ctx, points, fill, stroke) { ctx.beginPath(); points.forEach((p, i) => i ? ctx.lineTo(...p) : ctx.moveTo(...p)); ctx.closePath(); if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); } }
function tower(ctx, w, h, s) {
  const gradient = ctx.createLinearGradient(0, 0, 0, h); gradient.addColorStop(0, '#142632'); gradient.addColorStop(.65, '#405f5a'); gradient.addColorStop(1, '#8d9c70'); ctx.fillStyle = gradient; ctx.fillRect(0, 0, w, h);
  const sunX = w * .8, sunY = h * .2; ctx.fillStyle = '#d7dc9b4a'; ctx.beginPath(); ctx.arc(sunX, sunY, Math.min(w, h) * .09, 0, TAU); ctx.fill();
  for (let i = 0; i < 16; i++) { const bw = w / 14, height = (Math.sin(i * 42.1) * .5 + .5) * h * .13 + h * .03; ctx.fillStyle = i % 2 ? '#243f3f50' : '#35514a50'; ctx.fillRect(i * w / 15, h * .79 - height, bw, height + h * .22); }
  const scale = Math.min(w / 16, h / 13), camY = Math.max(0, s.blocks.length - 5) * .55, base = h * .71 + camY * scale;
  const project = (x, y, z) => [w / 2 + (x - z) * scale * .79, base + (x + z) * scale * .32 - y * scale];
  function box(b, y, hue, alpha = 1) {
    const a = b.w / 2, d = b.d / 2, x = b.x, z = b.z, vertices = [[x - a, y, z - d], [x + a, y, z - d], [x + a, y, z + d], [x - a, y, z + d], [x - a, y + .55, z - d], [x + a, y + .55, z - d], [x + a, y + .55, z + d], [x - a, y + .55, z + d]].map(q => project(...q));
    ctx.globalAlpha = alpha; ctx.lineWidth = 1;
    for (const [face, light] of [[[1, 2, 6, 5], 39], [[2, 3, 7, 6], 27], [[4, 5, 6, 7], 67]]) polygon(ctx, face.map(i => vertices[i]), `hsl(${hue} 32% ${light}%)`, '#132b2860');
    ctx.globalAlpha = 1;
  }
  box({ x: 0, z: 0, w: 11, d: 11 }, -1, 143);
  s.blocks.forEach((b, i) => box(b, i * .55, 76 + i * 6));
  for (const p of s.pieces) box(p, p.y, 76 + s.drops * 6, Math.min(1, p.life));
  if (!['lost', 'won'].includes(s.phase)) {
    const top = s.blocks.at(-1), y = s.blocks.length * .55;
    // Footprint guides make the depth of the active lane legible.
    const corners = [[top.x - top.w / 2, y + .02, top.z - top.d / 2], [top.x + top.w / 2, y + .02, top.z - top.d / 2], [top.x + top.w / 2, y + .02, top.z + top.d / 2], [top.x - top.w / 2, y + .02, top.z + top.d / 2]].map(q => project(...q));
    ctx.setLineDash([3, 4]); ctx.lineWidth = 1; polygon(ctx, corners, null, '#f1f4beaa'); ctx.setLineDash([]);
    box(s.moving, y, 63 + s.drops * 6);
    const center = project(top.x, y + .65, top.z); ctx.strokeStyle = '#e9f6ba77'; ctx.beginPath(); ctx.moveTo(center[0] - 4, center[1]); ctx.lineTo(center[0] + 4, center[1]); ctx.stroke();
  }
  const goal = DIFFICULTIES[s.difficulty].stackGoal, x = 18, y = h - 55;
  for (let i = 0; i < goal; i++) { ctx.fillStyle = i < s.drops ? '#d9f57e' : '#d8e4af30'; ctx.fillRect(x + i * Math.min(9, (w - 45) / goal), y, 5, 12); }
}
// `options`: { now, reduced } for the 3D scenes' cameras and lights.
export function renderGame(ctx, width, height, state, options = {}) {
  if (!width || !height) return;
  ctx.save(); ctx.lineWidth = 1; ctx.textAlign = 'left'; ctx.globalAlpha = 1;
  if (state.mode === 'flight') flightScene(ctx, width, height, state, options);
  else if (state.mode === 'maze') roomScene(ctx, width, height, state, options);
  else tower(ctx, width, height, state);
  ctx.restore();
}
