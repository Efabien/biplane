# Performance & Resource Consumption Plan

Target: the biplane flight game in `src/` (three.js, single `requestAnimationFrame` loop in `src/main.js`).
This plan lists 10 improvements ranked by expected impact, from a review dated 2026-09-26.
Line numbers refer to the current state of the files on branch `master` (commit `1126797`); re-locate by the quoted code if they have drifted.

General rules for the implementer:

- **Do not change the visual result** unless a task explicitly allows a stated, near-invisible difference.
- The game has no build step or test suite. Verify by running it (`play.command` / open `index.html` via a local server) and watching the on-HUD FPS counter (`GFX auto · <level> · <fps> fps`, bottom-right of the instrument panel). Press **G** to force quality levels, **M** for the map, **T** for a training approach, **Esc** for the menu.
- The auto-quality monitor (`src/main.js`, `monitor()`) reacts to average frame time; after a change, confirm the game still reaches/holds `high` on the dev machine.
- Keep the existing code style: compact, comment only non-obvious constraints, no new dependencies.
- Press **P** in game for the dev perf readout (not on the help card): average JS time of `frame()` (excludes the rAF wait and GPU work), frame interval / fps, and `renderer.info` draw calls + triangles for the whole frame including the shadow pass.

## Status

Revised order (agreed 2026-09-26; supersedes the table at the end):

| # | Step | Plan item | State |
|---|---|---|---|
| 0 | Perf readout (P key) | new | **done** |
| 1 | Cloud sort: two-level, shadow positions every frame | 1 | **done** |
| 2 | Ambient smoke distance gate | 7 | **done** |
| 3 | Cloud-shadow early-out + `NCS` 8 | 3.1 + 3.2 | **done** |
| 4 | Cloud geometry LOD | 2 | todo |
| 5 | AA / render-target type | 4 | todo |
| 6 | Shadow map 2048 | 5 | todo |
| 7 | HUD / compass throttle | 6 | todo |
| 8 | Terrain LOD for distant chunks | 11 (new) | **done** |
| 9 | Staging geometry + startup sampling | 10 + 9.1 + 9.2 | **done** (9.3 worker still deferred) |
| 10 | Tree chunks | 8 | **done** |

What was done:

- **0.** `<pre id="perf">` paper card (bottom centre, `index.html`), toggled with P in `src/main.js`; refreshed every 0.5 s. `renderer.info.autoReset = false` + one `info.reset()` per frame, so calls/triangles cover all composer passes and the shadow pass. Costs nothing when hidden (no `performance.now()`, no DOM writes). Headless (swiftshader) at `high`, looking at the home island: ~160–330 calls, 2.4–6.2 M triangles per frame depending on view (the dusk view over the volcano: 310 calls / 6.2 M).
- **1.** `updateClouds` in `src/world.js`: wrapped `c.cx` and the `cloudUniform` values are written every frame. Clouds are kept in two insertion-sorted index arrays (nearest-first horizontally for shadows, far-to-near in 3D for drawing — ~linear per frame since orders barely change). Puffs are emitted as per-cloud blocks in cloud draw order; the 24 puffs *within* each block are still sorted by true distance (a fixed intra-cloud order was tested and visibly wrong: seen from below, the crown puffs blend over the base). The matrix + `aSpan` buffers are rewritten only when the camera has moved, in the clouds' drifting frame, more than `max(4 m, 0.15 × distance to the nearest cloud)`, or at most every 0.5 s when the cloud order changed (two clouds only swap while about equidistant, i.e. not overlapping on screen). Measured in page (swiftshader, relative numbers meaningful): `world.update` 78 µs → 4 µs cruising at 50 m/s through the cloud layer, 60 → 2.3 µs parked, 240 → 48 µs worst case (rewrite every call); buffer re-uploads drop from 60/s to ~2/s cruising, ~1/s parked, ~6/s while flying through a cloud. Screenshots identical to the old per-frame global sort.
- **2.** `AMBIENT_FAR2 = 700²` exported from `src/smoke.js`; `life.update(dt, cam)` and `landmarks.update(dt, t, cam)` get `camera.position` from `src/main.js` and skip emitters farther than that horizontally. The accumulator simply isn't advanced while out of range (it is always < 1 after the spawn loop), so re-entry can't burst. Covers the village and crater-hamlet chimneys (both via `world.chimneys`) and the train (distance from the loco chimney). Verified: 0 ambient spawns from 1.5 km away, normal spawning near the village and the hamlet.
- **3.** `CLOUD_SHADOW` computes `length(q)` first and `continue`s when it exceeds `1.2 · c.z` (noise term is `(vnoise − 0.5) · 0.5 · c.z ∈ [−0.25, 0.25) · c.z` and the footprint is 0 from `0.95 · c.z`, so this is exact). `NCS` 16 → 8; its consumers are the uniform array, the GLSL loop and the world.js shadow sort, all keyed off the constant. Six varied views (golden, dawn, dusk, low and high) rendered with `NCS` 16 vs 8: no pixel differences except animated objects. Triangle/call counts unchanged by steps 1–3.
- **9 (plan 10 + 9.1 + 9.2).** The staging `PlaneGeometry` is gone: positions are filled straight from `H` (vertices are exactly grid nodes), colors go into the standalone `colors` array in the same loop, and normals come from `computeVertexNormals()` on a positions-only indexed `BufferGeometry` whose index is PlaneGeometry's exact triangulation — identical area-weighted normals, seamless chunk edges, `groundAt`'s diagonal preserved. The vertex loop no longer calls `groundAt`/`slopeAt` (5 bilinear lookups per vertex, ~2.6 M total): slope is a grid-node central difference on `H` (±1 node ≈ the old ±4 m probes; the wider 15.6 m span only shifts the rock threshold imperceptibly, per the plan). Chunk copies index the raw arrays via `subarray`. Transient staging drops from ~36 MB (pos+normal+uv+color attributes + Uint32 index) to ~25 MB (no uv, no duplicated color attribute) and the arrays are collectible after build. **9.2:** `renderPaperMap()` (~70 k `groundAt` samples + shading) left `createNav()`'s synchronous path — `paper` renders in a `requestIdleCallback` (setTimeout fallback) or lazily on the first `drawMap` that needs it (`paperReady()`), whichever comes first. 9.3 (worker) stays deferred.
- **8 (plan 11).** Terrain LOD: all 128 chunks share two index `BufferAttribute`s — the full-res one and a stitched half-res one (interior cells merged 2×2 with the same diagonal; the chunk-border cell ring stays full res and fans into the coarse interior, so shared edges are always full res and no T-junctions appear at LOD or chunk seams). `updateLod` in `world.update` swaps `geometry.index` by squared horizontal camera distance to each chunk's bounding-sphere centre with hysteresis (full < 1150 m, half > 1250 m; ~128 distance checks/frame). Half res is 2,176 triangles per chunk vs 8,192 (3.8× fewer); collision is untouched (`groundAt` reads `H`).
- **10 (plan 8).** `TCH` 500 → 1000 (tree-chunk grid 16×8 → 8×4): step 0 measured ~160–330 draw calls at `high` (the dusk volcano view at 310 brushes the ~300 threshold), and tree chunks dominate the count, doubled by the shadow pass. Bounds still small next to the ~2–3 km fog view distance, so frustum culling keeps working; `computeBoundingSphere()` handles the larger bounds.

---

## 1. Stop sorting + re-uploading all cloud puffs every frame

**Where:** `src/world.js:614-637` (`updateCloudShadows`), called every frame from `world.update` (`src/world.js:641-652`).

**Problem:** Every frame the function:
1. recomputes wrapped positions + camera distance for all 80 clouds and sorts them (for the 16-slot `cloudUniform`),
2. computes distances for all **1,920 puffs** (`NC = 80` clouds × `PPC = 24` puffs), sorts `puffOrder`,
3. rewrites the **entire** instance-matrix buffer (1920 × 16 floats) and `aSpan` buffer from `baseMat`/`span`, and flags both for GPU re-upload (`needsUpdate = true`) — every frame.

The back-to-front order changes very slowly: clouds drift at 4 m/s (`drift.value += 4 * dt`), the plane flies ~50 m/s.

**Approach:**
- Split the function: the cheap part (nothing — currently everything is in the expensive part) vs. the sort+rewrite part.
- Re-run the puff sort + buffer rewrite only when **either** the camera has moved more than a threshold (~40 m, compare against the camera position at last sort) **or** accumulated drift since the last sort exceeds a similar threshold **or** a max interval (~0.5 s) has elapsed. Only set `needsUpdate` on frames where the buffers were actually rewritten.
- The 80-cloud sort feeding `cloudUniform` (cloud shadows) can use the same trigger; the shadow footprints are soft, so a 0.5 s stale order is invisible. But `c.cx` (wrapped x) feeds the shader uniform — note the shader already applies drift itself for the *puffs* (`uDrift` in `cloudMaterial`), while `cloudUniform` values are CPU-side snapshots used by `CLOUD_SHADOW`. Shadow positions therefore freeze between updates: at 4 m/s drift and 0.5 s interval that is a 2 m jump on a ≥ 25 m radius footprint — acceptable. If it shimmers, update `cloudUniform` positions every frame (cheap: 16 vec4 writes) but re-sort rarely.
- Keep transparency correctness: puffs are `transparent`, `depthWrite: false`, drawn in buffer order. A slightly stale order is fine because puff alpha is soft (`smoothstep` edges).

**Acceptance:** no visible popping in cloud rendering while flying straight through/around clouds; CPU time of `world.update` drops (verify in the browser performance profiler: `updateCloudShadows` should disappear from the per-frame top list); FPS unchanged or better.

**Done (as implemented, see Status):** two-level sort instead of a plain throttle — clouds sorted incrementally every frame, puffs sorted within each cloud's block on rewrite; `cloudUniform` positions updated every frame (no frozen shadows); rewrite trigger scales with the distance to the nearest cloud instead of a fixed 40 m, and there is no time-based trigger other than the 0.5 s cap on reorder-only rewrites. The function is now `updateClouds`.

## 2. Cut cloud triangle count and vertex-shader cost

**Where:** `src/world.js:528` (`const puffGeo = new THREE.SphereGeometry(1, 20, 14)`), `src/world.js:568` (`puffs.frustumCulled = false`), vertex shader in `src/style.js` `cloudMaterial` (two `vnoise3` calls per vertex).

**Problem:** 560 triangles × 1,920 instances ≈ **1.07 M transparent triangles** with no frustum culling, each vertex running 2 `vnoise3` (16 hash evaluations). The bump displacement (`wp.xyz += wn * (bump - 0.4) …`) destroys the sphere silhouette anyway, so the tessellation is wasted.

**Approach (in order of preference, combine 1+2):**
1. Reduce `SphereGeometry(1, 20, 14)` to `SphereGeometry(1, 10, 7)` (~140 tris, 4× fewer vertices). Visually compare from the ground, from cruise altitude, and while flying through a cloud; the mist sprites hide most of the difference. If crowns look too faceted, try `12, 8`.
2. Drop the second (high-frequency) `vnoise3` octave in the vertex shader, or compute `bump` from a single octave — check that flat cloud bases don't show banding.
3. Optional, only if profiling still shows GPU-bound clouds: per-cloud culling. Because `frustumCulled = false` is required (the shader moves puffs by drift, so three.js bounds are wrong), culling must be manual: in the (now throttled, see item 1) sort pass, set the scale of matrices of puffs whose *cloud centre* (wrapped `c.cx`, `c.z`) is behind the camera-frustum … simpler: write culled puffs to the end of the buffer and shrink `puffs.count`. Keep all puffs of a cloud together (cull per cloud, never per puff) so no cloud is half-drawn. Since item 1, puffs are already written as per-cloud blocks, but the rewrite is throttled, so a frustum cull would need its own (view-direction) trigger or a generous margin.

**Do not** change `NC`, `PPC`, cloud shapes, or the mist points.

**Acceptance:** clouds look the same in a side-by-side screenshot at 1× zoom; GPU frame time drops measurably at `high` quality when clouds fill the view (point the plane up at a cloud bank).

## 3. Replace the per-fragment 16-cloud shadow loop with a cheaper path

**Where:** `src/style.js:83-97` (`CLOUD_SHADOW` / `cloudShadow()`), injected into: every `paint()` material (`src/style.js:173-190`, used by terrain, trees, houses, all props), the water shader (`src/style.js:337-395` — covers a huge screen area), and the grass shader (`src/grass.js:87-91`). `NCS = 16` is defined in `src/style.js:59`.

**Problem:** almost every fragment on screen loops over 16 clouds and evaluates a `vnoise` per cloud (~16 noise evaluations + smoothsteps per fragment).

**Approach — staged, stop when profiling says it's enough:**
1. **Early rejection before the noise:** inside the loop, first compute `float r0 = length(q)` and `continue` (accumulate nothing) when `r0 > c.z * 0.95 + c.z * 0.25` (the max the noise term can bring it back in: noise amplitude is `± c.z * 0.25`). This skips the `vnoise` for the vast majority of (fragment, cloud) pairs. Careful: keep the existing look for fragments that pass.
2. **Reduce `NCS` from 16 to 8.** The uniform array, the sort in `world.js` (`for (let i = 0; i < NCS; i++)`), and the GLSL loop all key off the exported constant, so this is a one-line change. Verify shadows don't pop when flying between cloud groups (the 8 nearest clouds are what matter; with 80 clouds over 8000 m, 8 is usually plenty locally).
3. **Only if still hot** (it likely won't be after 1+2): render a top-down cloud-shadow mask into a small render target (e.g. 256², orthographic camera over a ~3 km box around the plane, redrawn on the same throttle as item 1) and replace the loop in `cloudShadow()` with one texture fetch + the existing smoothstep shaping. This is a bigger change touching every shader that includes `CLOUD_SHADOW`; keep the function signature (`float cloudShadow(vec3 p)`) so call sites don't change.

**Acceptance:** cloud shadows on terrain, water and grass look unchanged in motion; fragment-bound scenes (low flight over water toward the sun) gain FPS at `high`.

**Done: 3.1 + 3.2** (see Status). The early-out uses `length(q) > 1.2 · c.z`, the exact bound. Note the shadow set is still the nearest clouds by *horizontal distance to the cloud centre*, while the shadow lands `B / tan(sun elevation)` away (≈ 0.6–0.9 km at golden hour, ≈ 2 km at dusk): if distant shadows ever pop, sort by the footprint centre (`c.cx − SUN_DIR.x · c.B / SUN_DIR.y`, likewise z) instead of raising `NCS` again.

## 4. Drop redundant AA and shrink the post-processing targets

**Where:** `src/main.js:177-200`: `EffectComposer` created with a `HalfFloatType`, `samples: 4` render target; `QUALITY` table at `src/main.js:185-189` (`high` = `pr: 2, samples: 4, smaa: true`); `applyQuality()` sets `rt.samples` and `smaa.enabled`.

**Problem:**
- At `high`: pixel-ratio 2 + 4×MSAA + SMAA. With 4×MSAA at pr 2, SMAA is nearly invisible but costs a full-screen pass (plus its internal edge/weight passes and materials).
- `HalfFloatType` doubles the memory and bandwidth of *both* composer render targets. Nothing in the chain needs HDR: the scene is LDR-lit, and `OutputPass` only does color-space conversion. On a retina laptop the two half-float 4×MSAA targets are the largest GPU allocation in the app (~150–250 MB).

**Approach:**
1. In the `QUALITY` table set `smaa: false` for `high` (keep it for `medium`, where `samples: 2` benefits from it). Update the comment at `src/main.js:177`.
2. Change the composer's render-target `type` from `THREE.HalfFloatType` to `THREE.UnsignedByteType` (or simply omit `type`). **Check:** `OutputPass` performs sRGB conversion; with an 8-bit intermediate target there is a possible slight banding in sky gradients — inspect the dusk sky closely. If banding is visible, keep HalfFloat and only do step 1; note the trade-off in the commit message.
3. Verify `applyQuality`'s `rt.dispose()` path still swaps sample counts correctly after the type change.

**Acceptance:** no visible AA regression at `high` (compare thin geometry: rigging wires on the plane, distant poles, tree edges); GPU memory (Chrome task manager / `renderer.info.memory`) drops; a full-screen pass disappears from the GPU profile at `high`.

## 5. Cap the shadow map at 2048²

**Where:** `src/main.js:185-189` (`QUALITY` `high` has `shadow: 4096`), consumed by `world.setQuality` (`src/world.js:654-661`); shadow box logic in `updateShadow` (`src/world.js:578-611`).

**Problem:** 4096² PCFSoft shadow map = 64 MB depth target and a heavier shadow pass. The shadow camera is at most 800 m wide (`size` clamps at 800) and is already texel-snapped, so 2048 texels over ≤ 1600 m is ~0.8 m/texel — with `PCFSoftShadowMap` and `normalBias 0.6` the difference from 4096 is marginal.

**Approach:** change `shadow: 4096` → `shadow: 2048` in the `high` entry (making `medium` and `high` share 2048; that's fine — `high` still differs by pr, MSAA, grass density, terrain shadows). Verify shadow edges on the plane at ground level and on trees from cruise altitude at `high`; if visibly worse near the ground, an alternative is keeping 4096 but reducing the max box `Math.min(800, …)` → `Math.min(600, …)` — pick whichever looks better, not both.

**Acceptance:** no obvious shadow-quality loss in the three flight regimes (parked, low pass, high cruise); 48 MB GPU memory saved at `high`.

## 6. Throttle the HUD panel and compass; remove expensive canvas state

**Where:** `src/hud.js` (`Hud.update` → `draw()` runs every frame; `needle()` at `src/hud.js:61-69` uses `shadowColor/shadowBlur`; `hub()`/`glass()` create gradients every draw), `src/nav.js:176-182` (`drawCompass` runs every frame; `drawMap` is already throttled to 10 Hz; `brass()` and the face/glass gradients are recreated per draw).

**Problem:** two full 2D-canvas repaints at 60 Hz on the main thread; `shadowBlur` is one of the slowest canvas operations; gradient objects are recreated per frame.

**Approach:**
1. Throttle both `Hud.draw()` and `drawCompass()` to **30 Hz** (accumulate `dt` like the existing `mapT` pattern in `nav.js:181`). Keep the needle-value smoothing (`this.v` in `hud.update`) running every frame so needles stay damped; only the *painting* is throttled. 30 Hz on mechanical-style needles is imperceptible.
2. In `needle()`, replace the `shadowBlur` drop shadow with a pre-drawn cheap equivalent: draw the needle polygon once more, offset (1, 1.5), in `rgba(0,0,0,0.35)`, *before* the real needle — same look, no blur. (Blur radius is only 2, so the hard copy reads the same at gauge size.)
3. Hoist gradient creation out of the per-frame path: `hub()`'s radial gradient depends only on `(cx, cy)` — cache per gauge index; `glass()`'s gradient likewise; in `nav.js`, cache the `brass` ring gradient, the compass face gradient and the glass gradient at `createNav()` scope (they depend only on constants). The map vignette in `drawMap` is inside the 10 Hz path — optional.

**Acceptance:** gauges and compass look identical (screenshot diff at rest); main-thread scripting time per frame drops (profiler: `draw`/`drawCompass` leave the top list); needles still move smoothly.

## 7. Distance-gate ambient smoke emission

**Where:** chimney smoke `src/life.js:126-130`, train smoke `src/landmarks.js:182-188`. Both call `smoke.spawn` unconditionally; the pool is a shared ring of `N = 900` particles (`src/smoke.js:6`) also used by the plane's exhaust.

**Problem:** ~20 chimneys × 1.1/s plus the train's 6/s emit even when kilometres away: invisible particles churn the ring buffer and **evict the plane's own exhaust trail** (the ring overwrites oldest slots), plus pointless integration work.

**Approach:** both `update` methods need the camera (or plane) position; the cheapest wiring is to pass `camera.position` into `life.update` and `landmarks.update` from `src/main.js:286` (`landmarks.update(dt, time.value)` → add a third arg; `life.update(dt)` → add one). Inside, skip `spawn` when the source is farther than ~700 m (`dx*dx + dz*dz > 700*700`, no `Math.hypot`). Keep the accumulators (`c.acc`, `smokeAcc.v`) **clamped** rather than accumulating while suppressed (else re-entering range dumps a burst): e.g. `c.acc = Math.min(c.acc + 1.1 * dt, 1)` when out of range, or simply reset to 0.

**Acceptance:** flying near the village/train looks unchanged; from far away, the plane's exhaust trail no longer shortens when many chimneys are active (easy to see: full throttle at altitude, trail length before/after).

**Done** (see Status): the range is a shared `AMBIENT_FAR2` in `src/smoke.js`; accumulators are frozen (not advanced) while out of range rather than clamped.

## 8. Reduce tree draw calls (only if profiling shows draw-call pressure)

**Where:** `src/world.js:461-524`: trees are collected per 500 m chunk (`TCH = 500`, grid `TNX × TNZ = 16 × 8`) into up to 3 `InstancedMesh`es per chunk (`trunks`, `rounds`, `pines`) → commonly 150+ draw calls, doubled by the shadow pass.

**Approach:** this one is a judgment call — measure first with `renderer.info.render.calls` (log it once per second temporarily). If terrain+trees calls exceed ~300 at `high`:
- Raise `TCH` from 500 to 1000 (grid 8×4). Chunks stay small enough for frustum culling to matter (view distance is ~2–3 km with fog) while quartering the mesh count. This is a one-constant change; `computeBoundingSphere()` already handles the larger bounds.
- Do **not** merge trunk and canopy geometries: they use different materials (static vs. wind-swaying) and per-instance colors on the canopy only.

**Acceptance:** `renderer.info.render.calls` drops; no visible change in tree pop-in (fog hides the horizon anyway); shadow pass cost drops proportionally.

## 9. Cut startup terrain sampling (~3 M height evaluations on the main thread)

**Where:**
- `src/world.js:143-145`: the `H` grid = 1025 × 513 = **526 k `rawHeight` calls** (each: `homeIsland` 2×fbm + 2×noise, `volcanicIsland`, 6-strip loop).
- `src/world.js:226-236` (vertex loop in `buildWorld`): another 525 k iterations, each calling `groundAt` (fine — reads `H`) **plus `slopeAt`** (= 4 more bilinear `groundAt` lookups) **plus a 5-octave `fbm`** for coloring.
- `src/nav.js:37-63` (`renderPaperMap`): ~70 k more `groundAt` calls + shading lookups, executed inside `createNav()` at startup.

**Approach (three independent sub-tasks, all safe):**
1. **Cheapen the vertex loop's slope:** vertices lie exactly on grid nodes, so `slopeAt`'s 4 bilinear interpolations collapse to direct `H[]` reads. Add a grid-index slope helper (central differences on `H` with the same 8 m span: nodes are `CELL ≈ 7.8` m apart, so ±1 node ≈ the current ±4 m at half the resolution — visually equivalent for the rock/grass threshold) and use it in the vertex loop. Keep the exported `slopeAt` unchanged (it's used at runtime by flight/placement code).
2. **Defer the paper map:** move `renderPaperMap()` out of `createNav()`'s synchronous path — render it lazily on the first `drawMap` call *or* in a `requestIdleCallback` after first frame. The map is hidden until the player presses **M** (`mapEl.hidden`), and `drawMap` already early-outs when hidden. Guard `drawMap` against `paper` not being ready yet.
3. **(Bigger, optional) move `H`-grid generation into a Web Worker:** only attempt if 1+2 still leave startup > ~1.5 s on the dev machine. Constraints: `buildWorld` and module-init code (`RAIL` portal search at `src/world.js:122-130`) consume `H` synchronously at module load, so this requires restructuring world init into an async phase — a real refactor. Prefer instead: profile `fbm` (the octave loop dominates) and micro-optimize `noise`/`hash` (they're already integer-hash based; gains here are limited). Recommendation: implement 1 and 2, measure, and stop unless load time is still a complaint.

**Acceptance:** identical terrain colors (screenshot diff of the same seed/view — the world is deterministic, `rng(7)`), identical map rendering when M is pressed; time from page load to first rendered frame measurably lower (use `performance.now()` logging around `buildWorld` and `createNav` before/after).

## 10. Build terrain chunks without the throwaway full-island geometry

**Where:** `src/world.js:221-270`. A full `PlaneGeometry(WX, WZ, 1024, 512)` (~525 k vertices: position + normal + uv + color ≈ 30 MB) is created, displaced, colored, `computeVertexNormals()`'d — then only *copied from* into 128 chunk geometries and abandoned to GC. Its `uv` attribute (4 MB) is never used at all.

**Approach:** replace the staging geometry with plain arrays:
- Positions: derive directly from `H` (x = `X0 + i * CELL`, y = `H[k]`, z = `Z0 + j * CELL`) — no `PlaneGeometry` needed.
- Colors: keep the existing loop but write into the standalone `colors` array (it already is one).
- Normals: `computeVertexNormals()` on the full grid is what guarantees seamless chunk edges (the comment at `src/world.js:240-241` is load-bearing). Replace it with an explicit central-difference normal from `H` (`normalize(vec3(H[k-1]-H[k+1], 2*CELL, H[k-(SEGX+1)]-H[k+(SEGX+1)]))`, clamped at borders). **Check visually**: central-difference normals differ slightly from area-weighted face normals — inspect ridge lines and the crater rim in golden light for shading changes; if noticeably different, keep `computeVertexNormals` on a positions-only `BufferGeometry` (still saves the uv/color duplication and the PlaneGeometry object churn).
- The chunk-copy loop then indexes the arrays directly (it already effectively does, via `pos.getX(v)` etc. — switch to raw array indexing `v*3`).
- Note two downstream consumers of the staging geometry: `pos.count` and the `colors` array feed `colorTex` (`src/world.js:275-283`) and the depth texture uses `H` directly — both keep working with plain arrays.

**Acceptance:** identical terrain rendering (screenshot diff, especially chunk seams and lighting on slopes); peak JS heap during load drops (~30 MB less transient allocation, visible in a heap profile timeline); `groundAt` still matches the rendered mesh (fly a landing on each strip; wheels must not float or sink).

## 11. Terrain LOD for distant chunks (new)

**Where:** terrain chunk meshes built in `buildWorld` (`src/world.js`, the chunk-copy loop after the staging geometry; 128 chunks).

**Problem:** every chunk is drawn at full grid resolution (~7.8 m cells) however far away it is; chunks 2–3 km out, deep in the haze, still cost their full triangle count in the main and shadow passes.

**Approach:** build a second, half-resolution index buffer per chunk (every other grid node, same vertex buffer) and switch the chunk's `geometry.index` (or swap between two geometries sharing attributes) by camera distance, e.g. beyond ~1.2 km. Watch seams: where a full-res chunk meets a half-res one the odd vertices on the shared edge form T-junctions — add skirts or stitch the edge (keep the edge row at full res in the half-res index buffer). Measure the triangle drop with the P readout.

**Acceptance:** no visible cracks or popping at the LOD boundary in golden and dusk light; triangle count drops at cruise altitude.

---

## Suggested order & verification matrix

*Superseded by the revised order in **Status** at the top.*

| Order | Item | Type | Risk | Measure with |
|---|---|---|---|---|
| 1 | 1. throttle puff sort/upload | frame CPU | low | performance profiler, FPS in cloud-heavy view |
| 2 | 2. cloud geometry LOD | frame GPU | low | FPS looking at clouds, `renderer.info.render.triangles` |
| 3 | 3.1 + 3.2 shadow-loop early-out, NCS=8 | frame GPU | low | FPS low over water toward sun |
| 4 | 4. AA / target type | GPU mem + pass | medium (banding check) | Chrome GPU memory, sky closeup at dusk |
| 5 | 5. shadow 2048 | GPU mem | low | shadow closeups |
| 6 | 6. HUD/compass throttle | frame CPU | low | profiler main thread |
| 7 | 7. smoke distance gate | frame CPU + quality | low | exhaust-trail length test |
| 8 | 9.1 + 9.2 startup sampling | load time | low | `performance.now()` around `buildWorld`/`createNav` |
| 9 | 10. chunk build without staging geo | load mem/time | medium (normals check) | heap timeline, visual seam check |
| 10 | 8. tree chunk size | draw calls | low | `renderer.info.render.calls` |

Items 3.3 (shadow mask RT) and 9.3 (worker) are explicitly **deferred**: only do them if measurements after the rest still justify the added complexity.
