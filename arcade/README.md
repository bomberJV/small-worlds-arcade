# Small Worlds Arcade

Three original mini-games in a shared browser cabinet. Everything runs locally with Canvas 2D, ES modules, and optional Web Audio; there are no runtime dependencies, accounts, external assets or network calls.

## Run

Serve the extracted collection root using `python3 -m http.server 8000`, then open `/arcade/`. ES modules need HTTP; opening the HTML file directly is not supported. A current desktop or mobile browser is required.

## Cartridges

### Ring Runner

Fly a fixed three-sector course, preserving three shields. Standard pace has 18 rings; Easygoing has 15 wider rings and a lower flight speed. Rings ahead are visible, the next target is highlighted, and a small radar points toward its center.

- Steer with arrows/WASD, hold the on-screen arrows, or drag the view to aim.
- A pass earns 100 points; a center pass earns 150. A streak adds up to 100 points per ring.
- Three misses end a run. Best scores are separate for each pace.
- The course is deliberately repeatable, so personal bests at a given pace are comparable. The seeded star field is decorative.
- Crossing detection interpolates the ship position at the ring plane, rather than judging a later frame position.

### The Green Room

A connected, generated maze with three crystals and one locked exit. There is no time limit. Collect all crystals, then enter the pink doorway.

- Up/W moves forward; Down/S backs up. Left/A and Right/D turn. Drag horizontally to look around.
- The minimap reveals explored corridors and records your trail. Reveal map can show the whole layout at any time.
- New maze generates a different deterministic layout. Standard uses a 17×13 grid; Easygoing uses 13×13 and starts with the full map revealed.
- Every generated target is reachable. Records store the fastest completed escape for the exact seed and pace, so times on different mazes are not compared.
- Revealing the map is a navigation aid; records do not distinguish assisted and unassisted runs. There is no competitive leaderboard.
- Wall rendering uses grid DDA ray casting. Sprite stripes are occluded against wall depth; crystals cannot show through walls.

### Sky Stack

Drop the moving slab over the tower. Every overhang is cut from the next footprint and rendered as a falling piece. The active axis alternates each level.

- Press Space, tap the tower, or click Drop block.
- Complete 18 levels on Standard or 12 on Easygoing.
- Close drops snap into place without shrinking the footprint. Perfect streaks earn extra points; ordinary overlaps still earn 100 points.
- A miss ends the run. A short input cooldown prevents accidental double taps from dropping the next slab immediately.
- The rendering is a 3D isometric projection. Falling pieces are illustrative effects, not a rigid-body physics solver.

## Controls and behavior

Play, Restart, Pause/Resume and pace controls are visible outside the canvas. Escape or P pauses/resumes while focus is in the arcade cabinet. Switching tabs/windows, hiding the document or scrolling the game out of view pauses gameplay. Starting/resuming restores focus to the canvas. Touch arrows track pointer capture and cancellation so movement cannot remain stuck after a gesture ends.

Sound is off by default and can be enabled explicitly. It uses short, quiet synthesized cues and fails gracefully if Web Audio is unavailable. Gameplay never requires sound. The initial scene is still until Play; reduced-motion preferences disable decorative transitions, but game motion remains part of the requested interaction.

Scores, crystals, levels, status, controls and completion messages are exposed as DOM text. The moving worlds are still primarily visual; these games are not claimed to be fully playable without vision.

## Code

- `engine.js`: pure game rules, seeded maze generation, collision geometry, scoring, record validation and DDA ray intersections.
- `render.js`: perspective flight scene, ray-cast maze and isometric tower.
- `app.js`: input, fixed-step loop, UI, pause handling, optional sound and local records.
- `index.html`, `app.css`: cabinet UI and responsive layout.
- `../shared/`: shared canvas sizing, base styling and storage utilities.

Simulation runs at a fixed 90 Hz while rendering follows the browser. Time accumulation is bounded after a stalled frame; returning from a hidden state never fast-forwards a run. The render loop sleeps when idle, paused, hidden or offscreen, aside from briefly finishing a feedback transition.

## Validation

`tests/arcade.test.mjs` in the source collection exercises:

- Steering through every ring at both paces, three-miss failure, and crossing-plane hit detection.
- Paused-state invariance and fresh replay state.
- 500 generated maze seeds at each pace: three distinct crystals, a distinct exit, and reachability of every target.
- Locked-exit rules, single collection per crystal, successful escape, wall clearance and exact DDA intersections.
- Tower overlap cuts, missed placements, perfect streaks, both completion targets and double-tap protection.
- Malformed saved-record rejection and faster-only completed-maze records.

Run from the collection root with `node --test tests/arcade.test.mjs`. These are rule tests, not a claim of exhaustive physical-device or browser testing. Rendering and controls also need visual browser QA before publication.

## Data and limits

Local records use `brandon-arcade-records-v2` and are validated on read. They stay on the current browser; clearing site data removes them. At most 100 record entries are retained. Storage failure leaves play available with in-memory records for the current visit.

These are short original arcade games, not large commercial titles. No online multiplayer, leaderboard, cloud saves, imported game assets, or external game rules are included.
