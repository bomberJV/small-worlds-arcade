import { clamp, castRay, DIFFICULTIES } from './engine.js';
const TAU = Math.PI * 2;
function polygon(ctx, points, fill, stroke) { ctx.beginPath(); points.forEach((p, i) => i ? ctx.lineTo(...p) : ctx.moveTo(...p)); ctx.closePath(); if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); } }
function flight(ctx, w, h, s) {
  const f = Math.min(w, h) * 1.05, project = (x, y, z) => [w / 2 + (x - s.x) * f / z, h / 2 - (y - s.y) * f / z];
  ctx.fillStyle = '#070d15'; ctx.fillRect(0, 0, w, h);
  const nebula = ctx.createRadialGradient(w * .7 - s.x * 2, h * .26 + s.y * 2, 0, w * .7, h * .26, w * .7);
  nebula.addColorStop(0, '#35516870'); nebula.addColorStop(.45, '#29374a25'); nebula.addColorStop(1, '#07101900'); ctx.fillStyle = nebula; ctx.fillRect(0, 0, w, h);
  // Distant planet: a destination, never a collision obstacle.
  const px = w * .78 - s.x * 4, py = h * .2 + s.y * 4, pr = Math.min(w, h) * .15;
  ctx.fillStyle = '#233c40'; ctx.beginPath(); ctx.arc(px, py, pr, 0, TAU); ctx.fill();
  ctx.fillStyle = '#0c1921'; ctx.beginPath(); ctx.ellipse(px + pr * .35, py, pr * .82, pr, -.22, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#90bb9c30'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(px, py, pr * 1.8, pr * .25, -.3, 0, TAU); ctx.stroke();
  for (const p of s.stars) {
    const z = ((p.z - s.z) % 280 + 280) % 280 + 1, [x, y] = project(p.x, p.y, z), radius = clamp(f / z * .03, .5, 1.5);
    if (x < -10 || x > w + 10 || y < -10 || y > h + 10) continue;
    ctx.fillStyle = `rgba(196,219,214,${clamp(.2 + 30 / z, .2, .8)})`; ctx.beginPath(); ctx.arc(x, y, radius, 0, TAU); ctx.fill();
    if (z < 22 && s.phase === 'playing') { ctx.strokeStyle = '#b8d4d143'; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (x - w / 2) * .018, y + (y - h / 2) * .018); ctx.stroke(); }
  }
  const next = s.rings.find(r => !r.result);
  for (const ring of [...s.rings].reverse()) {
    const z = ring.z - s.z; if (z <= .3 || z > 165) continue;
    const [x, y] = project(ring.x, ring.y, z), radius = ring.radius * f / z, nextRing = ring === next;
    ctx.strokeStyle = nextRing ? '#d9f57e' : '#8ab3a37a'; ctx.lineWidth = clamp(f / z * .09, 1, 7);
    ctx.beginPath(); ctx.arc(x, y, radius, 0, TAU); ctx.stroke();
    if (nextRing) {
      ctx.strokeStyle = '#d9f57e33'; ctx.lineWidth = clamp(f / z * .32, 3, 20); ctx.beginPath(); ctx.arc(x, y, radius, 0, TAU); ctx.stroke();
      ctx.lineWidth = 1; ctx.strokeStyle = '#d9f57e60';
      for (let i = 0; i < 8; i++) { const angle = i / 8 * TAU + .2; ctx.beginPath(); ctx.moveTo(x + Math.cos(angle) * radius * 1.1, y + Math.sin(angle) * radius * 1.1); ctx.lineTo(x + Math.cos(angle) * radius * 1.18, y + Math.sin(angle) * radius * 1.18); ctx.stroke(); }
      if (z < 85) { ctx.fillStyle = '#e7ecc7'; ctx.font = '9px ui-monospace, monospace'; ctx.textAlign = 'center'; ctx.fillText(String(s.passed + 1).padStart(2, '0'), x, y - radius - 11); ctx.textAlign = 'left'; }
      if (radius < Math.min(w, h) * .5) { ctx.fillStyle = '#e9f0d6'; ctx.beginPath(); ctx.arc(x, y, 2, 0, TAU); ctx.fill(); }
    }
  }
  const reticle = '#e5edcc99'; ctx.strokeStyle = reticle; ctx.lineWidth = 1;
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) { ctx.beginPath(); ctx.moveTo(w / 2 + dx * 8, h / 2 + dy * 8); ctx.lineTo(w / 2 + dx * 17, h / 2 + dy * 17); ctx.stroke(); }
  ctx.strokeStyle = '#b6d7a533'; ctx.beginPath(); ctx.arc(w / 2, h / 2, 26, 0, TAU); ctx.stroke();
  // The small target tracker remains useful when a ring moves outside the screen.
  if (next) {
    const dx = next.x - s.x, dy = next.y - s.y, radius = 24, cx = w - 43, cy = h - 54;
    ctx.fillStyle = '#07100dbb'; ctx.beginPath(); ctx.arc(cx, cy, radius + 5, 0, TAU); ctx.fill(); ctx.strokeStyle = '#6b8b7166'; ctx.beginPath(); ctx.arc(cx, cy, radius, 0, TAU); ctx.stroke();
    ctx.fillStyle = '#d9f57e'; ctx.beginPath(); ctx.arc(cx + clamp(dx / 6, -1, 1) * radius, cy - clamp(dy / 4, -1, 1) * radius, 3, 0, TAU); ctx.fill(); ctx.fillStyle = '#ffffff88'; ctx.fillRect(cx - 1, cy - 1, 2, 2);
  }
  polygon(ctx, [[0, h], [w * .11, h * .89], [w * .32, h * .93], [w * .39, h], [w * .61, h], [w * .68, h * .93], [w * .89, h * .89], [w, h]], '#1b2c355c', '#94b7a62a');
  const progress = s.passed / s.rings.length; ctx.fillStyle = '#48665366'; ctx.fillRect(w * .35, h - 19, w * .3, 2); ctx.fillStyle = '#d9f57e'; ctx.fillRect(w * .35, h - 19, w * .3 * progress, 2);
  if (s.flash > 0) { ctx.fillStyle = `rgba(185,70,103,${s.flash * .11})`; ctx.fillRect(0, 0, w, h); }
}
function maze(ctx, w, h, s) {
  const ceiling = ctx.createLinearGradient(0, 0, 0, h / 2); ceiling.addColorStop(0, '#152423'); ceiling.addColorStop(1, '#080e0b'); ctx.fillStyle = ceiling; ctx.fillRect(0, 0, w, h / 2);
  const floor = ctx.createLinearGradient(0, h / 2, 0, h); floor.addColorStop(0, '#12180e'); floor.addColorStop(1, '#4c5e35'); ctx.fillStyle = floor; ctx.fillRect(0, h / 2, w, h / 2);
  const fov = 1.12, focal = w / 2 / Math.tan(fov / 2), dirX = Math.cos(s.a), dirY = Math.sin(s.a), sideX = -dirY, sideY = dirX, columns = Math.max(80, Math.min(480, Math.floor(w / 2))), stripe = w / columns, depth = [];
  for (let i = 0; i < columns; i++) {
    const cameraX = (i + .5) / columns * 2 - 1, dx = dirX + sideX * cameraX * Math.tan(fov / 2), dy = dirY + sideY * cameraX * Math.tan(fov / 2), hit = castRay(s.grid, s.x, s.y, dx, dy), d = hit.distance;
    depth[i] = d; const wallH = Math.min(h * 5, focal / d), top = (h - wallH) / 2, light = Math.max(19, 145 / (1 + d * .22)) * (hit.side ? .72 : 1);
    const seam = hit.texture < .025 || hit.texture > .975, grain = ((Math.floor(hit.texture * 55) * 17 + hit.x * 7 + hit.y * 13) % 11) / 11;
    ctx.fillStyle = `rgb(${light * .63 + grain * 4},${light * .87 + grain * 5},${light * .51 + grain * 3})`; ctx.fillRect(i * stripe, top, stripe + 1, wallH);
    if (seam) { ctx.fillStyle = '#101b0c55'; ctx.fillRect(i * stripe, top, stripe + 1, wallH); }
    for (const pos of [.22, .55, .87]) { ctx.fillStyle = '#11200e5c'; ctx.fillRect(i * stripe, top + wallH * pos, stripe + 1, Math.max(1, wallH * .005)); }
    ctx.fillStyle = '#b2ca6b23'; ctx.fillRect(i * stripe, top + wallH * .025, stripe + 1, Math.max(1, wallH * .012));
    ctx.fillStyle = '#0a100a44'; ctx.fillRect(i * stripe, top + wallH * .94, stripe + 1, wallH * .06);
  }
  const objects = [...s.gems.filter(g => !g.got).map(g => ({ ...g, type: 'gem' })), { ...s.exit, type: 'exit' }].map(o => ({ ...o, depth: (o.x - s.x) * dirX + (o.y - s.y) * dirY })).filter(o => o.depth > .08).sort((a, b) => b.depth - a.depth);
  for (const o of objects) {
    const horizontal = (o.x - s.x) * sideX + (o.y - s.y) * sideY, center = w / 2 + horizontal * focal / o.depth, size = focal / o.depth * (o.type === 'gem' ? .18 : .32), bob = o.type === 'gem' ? Math.sin(s.elapsed * 2.6 + o.x) * size * .08 : 0;
    if (center + size < 0 || center - size > w) continue;
    const y = h / 2 + bob;
    // Clip sprites one screen stripe at a time: a wall cannot leak through a gem.
    const start = clamp(Math.floor((center - size) / stripe), 0, columns - 1), end = clamp(Math.ceil((center + size) / stripe), 0, columns - 1);
    for (let i = start; i <= end; i++) {
      if (o.depth >= depth[i] - .01) continue;
      ctx.save(); ctx.beginPath(); ctx.rect(i * stripe, 0, stripe + .5, h); ctx.clip();
      if (o.type === 'gem') {
        polygon(ctx, [[center, y - size * 1.65], [center + size * .66, y], [center, y + size * 1.4], [center - size * .66, y]], '#d9f57e');
        polygon(ctx, [[center, y - size * 1.65], [center + size * .66, y], [center, y + size * 1.4]], '#a8cd59');
        polygon(ctx, [[center, y - size * 1.65], [center - size * .66, y], [center, y - size * .2]], '#f0f8b8');
      } else {
        const open = s.collected === s.gems.length; ctx.fillStyle = open ? '#e3abc0' : '#69735f'; ctx.fillRect(center - size * .6, h / 2 - size * 1.35, size * 1.2, size * 2.7); ctx.fillStyle = open ? '#342330' : '#192115'; ctx.fillRect(center - size * .46, h / 2 - size * 1.18, size * .92, size * 2.45);
        ctx.fillStyle = open ? '#f4c7d6' : '#9aaa85'; ctx.font = `${Math.max(5, size * .22)}px monospace`; ctx.textAlign = 'center'; ctx.fillText(open ? 'EXIT' : 'LOCKED', center, h / 2 - size * .5); ctx.textAlign = 'left';
        for (let n = 0; n < 3; n++) { ctx.fillStyle = n < s.collected ? '#d9f57e' : '#43523a'; ctx.fillRect(center - size * .3 + n * size * .23, h / 2 + size * .05, size * .15, size * .15); }
      }
      ctx.restore();
    }
  }
  const cols = s.grid[0].length, rows = s.grid.length, cell = Math.min(w < 500 ? 4.6 : 6, (w * .31) / cols), mapW = cols * cell, mapH = rows * cell, ox = w - mapW - 14, oy = 15;
  ctx.fillStyle = '#081107dc'; ctx.fillRect(ox - 5, oy - 5, mapW + 10, mapH + 10);
  const known = (x, y) => s.reveal || [...[[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]].some(([dx, dy]) => s.visited.has(`${x + dx},${y + dy}`));
  s.grid.forEach((row, y) => [...row].forEach((v, x) => { if (!known(x, y)) return; ctx.fillStyle = v === '1' ? '#71845a77' : '#9ab56b15'; ctx.fillRect(ox + x * cell, oy + y * cell, cell - .5, cell - .5); }));
  ctx.strokeStyle = '#b7d8746b'; ctx.lineWidth = 1; ctx.beginPath(); s.trail.forEach(([x, y], i) => i ? ctx.lineTo(ox + x * cell, oy + y * cell) : ctx.moveTo(ox + x * cell, oy + y * cell)); ctx.stroke();
  for (const gem of s.gems.filter(g => !g.got)) if (known(Math.floor(gem.x), Math.floor(gem.y))) { ctx.fillStyle = '#d9f57e'; ctx.fillRect(ox + gem.x * cell - 1, oy + gem.y * cell - 1, 2, 2); }
  if (known(Math.floor(s.exit.x), Math.floor(s.exit.y))) { ctx.fillStyle = '#e6adbc'; ctx.fillRect(ox + s.exit.x * cell - 1.5, oy + s.exit.y * cell - 1.5, 3, 3); }
  ctx.fillStyle = '#f4f5df'; ctx.beginPath(); ctx.arc(ox + s.x * cell, oy + s.y * cell, 2, 0, TAU); ctx.fill(); ctx.strokeStyle = '#edf3d6'; ctx.beginPath(); ctx.moveTo(ox + s.x * cell, oy + s.y * cell); ctx.lineTo(ox + (s.x + dirX) * cell, oy + (s.y + dirY) * cell); ctx.stroke();
  ctx.strokeStyle = '#e5ecc73a'; ctx.beginPath(); ctx.moveTo(w / 2 - 4, h / 2); ctx.lineTo(w / 2 + 4, h / 2); ctx.moveTo(w / 2, h / 2 - 4); ctx.lineTo(w / 2, h / 2 + 4); ctx.stroke();
  const vignette = ctx.createRadialGradient(w / 2, h / 2, h * .2, w / 2, h / 2, Math.max(w, h) * .7); vignette.addColorStop(0, '#0000'); vignette.addColorStop(1, '#0009'); ctx.fillStyle = vignette; ctx.fillRect(0, 0, w, h);
}
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
export function renderGame(ctx, width, height, state) {
  if (!width || !height) return;
  ctx.save(); ctx.lineWidth = 1; ctx.textAlign = 'left'; ctx.globalAlpha = 1;
  if (state.mode === 'flight') flight(ctx, width, height, state);
  else if (state.mode === 'maze') maze(ctx, width, height, state);
  else tower(ctx, width, height, state);
  ctx.restore();
}
