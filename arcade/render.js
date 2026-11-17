import { flightScene } from './flight3d.js';
import { roomScene } from './room3d.js';
import { stackScene } from './stack3d.js';
// `options`: { now, reduced } for the 3D scenes' cameras and lights.
export function renderGame(ctx, width, height, state, options = {}) {
  if (!width || !height) return;
  ctx.save(); ctx.lineWidth = 1; ctx.textAlign = 'left'; ctx.globalAlpha = 1;
  if (state.mode === 'flight') flightScene(ctx, width, height, state, options);
  else if (state.mode === 'maze') roomScene(ctx, width, height, state, options);
  else stackScene(ctx, width, height, state, options);
  ctx.restore();
}
