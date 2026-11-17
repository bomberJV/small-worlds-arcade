# Small Worlds Arcade

Three original mini-games in a shared browser cabinet. Everything runs locally with Canvas 2D, ES modules, and optional Web Audio; there are no runtime dependencies, accounts, external assets or network calls.

## Run

Serve the extracted collection root using `python3 -m http.server 8000`, then open `/arcade/`. ES modules need HTTP; opening the HTML file directly is not supported. A current desktop or mobile browser is required.

## Cartridges

### Ring Runner

Fly a fixed course of three sectors, each with its own rule, keeping three shields. Standard pace has eight rings per sector (24); Easygoing has six wider rings per sector (18), slower flight, fewer rocks and gentler movement.

1. **Low orbit.** Still rings over a ringed planet: learn the line.
2. **Debris field.** The rings drift, and rocks cross the lane between them. A rock costs a shield.
3. **Nebula.** The rings breathe, shrinking to about three quarters of their width and opening again. Go through while they are open.

- Steer with arrows/WASD, hold the on-screen arrows, or drag the view to aim. Hold Space (or the Boost button) to boost.
- A pass earns 100 points, a center pass 150, and a streak adds up to 100 per ring. Boost flies 45% faster and scores half as much again per ring. It drains while held, and center passes (more) and clean passes (less) refill it.
- A missed ring or a rock costs a shield; three end the run. A shield cell waits a short detour off the line in the debris field and the nebula; with full shields it is worth 250 points.
- Each sector closes with a medal: gold for every ring with at least 60% dead center, silver for every ring, bronze for half. A finished run is graded S to C against the best score possible without boost.
- The course is deliberately repeatable, so personal bests at a given pace are comparable. Bests from the original one-sector course are kept under their old key and not compared with this one.
- Crossing detection interpolates the ship position, and the run's clock, at each ring and rock plane, rather than judging a later frame position. A drifting or breathing ring is judged where it was at the moment of crossing.

The scene (`flight3d.js`) is a chase camera behind a faceted ship, with lit rings drawn in two halves so the ship passes between them, a sky for each sector (a ringed planet, a broken moon and its debris, a nebula with the star the course ends at), lit rocks, an engine trail and dust that streaks on boost. Before a run the camera circles the ship; at the start it swings round behind it; at the finish it pulls back. With reduced motion the camera does not circle, swing, bank or shake.

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
- `render.js`: the ray-cast maze and isometric tower, and the entry point for all three.
- `flight3d.js`: Ring Runner's scene and cameras.
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
