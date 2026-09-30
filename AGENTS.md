# Working on this codebase

Read this before changing the game. It's written for AI coding assistants and humans alike; `README.md` covers
what the game is and how to play it.

## Quick facts

- Plain ES modules and three.js **0.160**. `three` and `three/addons/` come from jsdelivr through the import map
  in `index.html`. There's no package.json, no bundler and no node_modules. Keep it that way: no new dependencies.
- Entry: `index.html` (menu, HUD canvases, story card DOM, CSS) → `src/main.js` (wiring + the frame loop).
- It must be served over http (`play.command`, or `python3 -m http.server`). `file://` blocks the modules.
- Everything is procedural: no image, model or audio files. Textures are canvas or DataTexture, sound is WebAudio.
- No test suite. Verify by rendering and playing (see **Verifying changes**).
- Git: work on `master` (there's no remote). Commits have a descriptive subject and a body saying what and why.

## Module map

| File | What it owns |
|---|---|
| `src/main.js` | Renderer and composer (MSAA target + SMAA + OutputPass), menu, the fleet (`FLEET`: per plane its home strip + take-off direction and parking spot; the ones not flown stay parked, each a `parked-<id>` dynamic obstacle), camera (cockpit at `plane.eye`), quality levels + auto monitor, key handling, the frame loop |
| `src/world.js` | **The world**: the height function and grid `H`, `groundAt`/`slopeAt`, strips (`STRIPS`), landmark positions, terrain mesh (chunks + LOD), terrain colours, water plane, village and hamlet houses, strip dressing, trees, clouds, lights, shadows, `setTime`, obstacle grid |
| `src/style.js` | The look: time-of-day presets (`TIMES`), shared `atmo` uniforms, fog/haze shader chunks, `paint()` (the toon-banded Lambert used by nearly everything), sky, clouds, cloud mist, water shaders, wind |
| `src/landmarks.js` | Lighthouse (+ lamp beams), offshore light, sea fort, castle, sky ruin, railway viaduct + steam train |
| `src/vale.js` | Pine Vale dressing: waterfall + stream, boulders, log cabins (+ smoke, lit windows), fireflies, spray |
| `src/harbours.js` | Homes and boats at seaside mail stops: jetties, huts, tea house, moored rowboats |
| `src/life.js` | Birds, sailboats, sheep, village and hamlet chimney smoke |
| `src/grass.js` | GPU ground cover (grass tufts, flowers) in a tile that follows the camera, coloured from the terrain colour texture |
| `src/smoke.js` | Shared particle ring (exhaust, crash plume, chimneys, train, spray); `AMBIENT_FAR2` gates ambient emitters |
| `src/flight.js` | Flight model (`Flight`: state `ground`/`air`/`crashed`, `pos`, `vel`, `q`, `heading`, `throttle`, `flown`), per-plane handling (`AIRCRAFT.red/blue/bush/racer`: thrust, drag, lift, stall, optional `VAPP`/`TAPP` for training approaches; `setAircraft` before `reset`), ground handling, collisions |
| `src/plane.js` | Plane models (red biplane, blue parasol monoplane, yellow bush plane, silver racer; `LIVERIES[].kind` picks the airframe, which may give its own cockpit `eye`, smoke `exhausts` and `openCockpit: false` for a cabin or canopy; the prop, tail, cockpit and wheels are shared) + liveries, `syncPlane` (prop blur, control surfaces) |
| `src/adventure.js` | Island Air Mail: `CHAPTERS` data, people, story cards, villagers, drops, beacon, save/load |
| `src/nav.js` | Compass tape and paper minimap (`PLACES` labels, rendered from `groundAt`) |
| `src/hud.js` | Instrument panel |
| `src/input.js`, `src/sound.js` | Keyboard state (`down`, `consume`), synthesized engine and wind |

Frame order (`main.js` `frame()`): menu keys → `adventure.update` → wind, flight, `syncPlane`, smoke → camera →
`world.update` (clouds, shadow box, LOD, windsocks) → landmarks / vale / harbours / life → sound, nav, grass, HUD →
`composer.render()` → auto quality monitor.

## Coordinates and conventions

- Metres. **x = east, z = south, y = up; north is −z.** Bearings are clockwise from north
  (`atan2(dx, −dz)`).
- A strip's `heading` is the direction of its local −Z, and `fx, fz = −sin(heading), −cos(heading)` point that way
  (0 = north). Other fields: `len`, `w`, `h` (elevation), `aim` (aiming point from each end), `surface`
  (`dirt` / `grass` / `sand`), `slope`, `blend` (terrain flattening radius), and `takeoff` (menu start direction:
  1 along the heading, −1 against it).
- `along(st, x, z)` / `across(st, x, z)` (module-private in world.js) are a point's offsets in a strip's frame.
- Pine Vale has its own frame: `valeUV(x, z) → [u, v]`, with u up the valley from the mouth (westward) and v to the
  south; `valeXZ(u, v)` goes back. `valeRiver(u)` is the river's centreline.

## World generation (src/world.js)

- The grid covers x −2000…8000 and z −2000…2000 (`X0, Z0, SEGX = 1280, SEGZ = 512, CELL = 7.8125`).
  `H[j·(SEGX+1)+i]` holds node heights. `groundAt` interpolates **exactly** like the rendered triangles, so collision,
  placement and the grass all agree with what's drawn.
- `baseHeight(x, z) = max(homeIsland, volcanicIsland, atoll, seaStacks, pineVale)`, then strip flattening. Each
  island function returns −35 away from itself. `rawHeight` adds the railway cutting and **stretches heights below
  0 by 2.5×**, so shores stay crisp and water depth reads well. Keep that in mind when choosing a riverbed or
  seabed value.
- **One water plane at y = 0** serves the sea, the lake and the Pine Vale river. Its shader gets depth from a texture
  of `H` and discards fragments over dry land. So any water body is terrain carved below 0. Water above sea level
  needs its own mesh (like the vale's stream, `vale.js`).
- Terrain colours are computed per grid node in one loop, by region (`vale`, `tropic`, home), with noise-ragged
  blends. After that come the relief shading and, once the trees are placed, the forest-floor shading, and then the
  chunk colours and `colorTex` (which colours the grass) are refilled.
- Build order inside `buildWorld` matters for determinism (next section): lights, sky → terrain → textures, water
  → hangar → strips → approaches → **village houses (rand)** → hamlet (own rng) → windmill → **trees (rand)** →
  atoll / stacks / vale trees (own rngs) → forest shade → tree meshes → **clouds (rand)**.
- Collision: `addObstacle(x, z, radius, top, bottom?)` registers a cylinder in a 50 m grid, and
  `flight.js` tests it through `hitObstacle`. Anything solid you add (buildings, rocks, jetties) should register one.

### Determinism: the shared `rand` sequence

`buildWorld` draws the village houses, the home and volcano trees, and the clouds from **one** `rand = rng(7)`.
A rejected sample costs a number of `rand()` calls that depends on the terrain height there. So **new land inside
an existing loop's sampling box, or any new `rand()` call, reshuffles every later tree and every cloud.** Rules:

- New features get their own `rng(seed)`. Seeds in use: 5, 7, 11, 19, 23, 29, 31, 41, 53, 61, 71.
- Keep new land off existing islands' footprints. Where a sampling box overlaps new land, reject it right after
  drawing x, z (the same `rand()` cost as the old "sea" rejection); the volcano tree loop does this for Pine Vale.
- Check that it held: `tools/shot.sh -r HEAD out.png 'at=volcano&d=900'` should report ~0 changed pixels outside
  your new area. The grass uses `Math.random()`, so a few dozen pixels always differ.

## Rendering and materials

- **Use `paint(color, opts, { wind, mottle })`** (style.js) for anything lit. It adds the banded toon ramp, cloud
  shadows, height fog and haze, and optionally wind sway (instanced trees) and mottling plus cliff strata (terrain).
  Stock three.js materials don't get the atmosphere uniforms (`atmo`) that the shared fog code reads.
- A custom `ShaderMaterial` that should sit in the haze: `fog: true`, uniforms `UniformsUtils.clone(UniformsLib.fog)`
  plus `Object.assign(uniforms, atmo)`. The vertex shader declares `vec3 transformed = position;` and includes
  `fog_pars_vertex` / `fog_vertex`, and the fragment shader includes `fog_pars_fragment`, `colorspace_fragment`
  and `fog_fragment`. `fog_pars_fragment` also brings `vnoise`, `hash12` and `hazeColor` (see `waterMaterial`,
  `flowMaterial` in vale.js).
- **GLSL `pow(x, y)` is NaN for x < 0, and for x = 0 with y = 0.** An interpolated varying that "is 0 at the edge"
  lands a hair below 0 there, and NaN pixels render black or brown (it has caused a dark ring on the lighthouse
  beams and a black prop blur). Always `pow(max(x, 0.0), y)`.
- Colour spaces: hex colours are sRGB and three converts them. **`Color.setHSL` is in *linear* space by default**
  (r160): pass `THREE.SRGBColorSpace` as the 4th argument for perceptual lightness, or "dark" colours come out
  pale.
- Transparent, sorted things: the clouds are depth-sorted on the CPU (`updateClouds`). Additive effects (beams,
  fireflies) use `depthWrite: false`.

## Time of day

Presets live in `TIMES` (style.js): sun direction, fog, sky colours, lights, cloud colours, and the tone `ramp`.
Optional fields are `stars`, `glowPow` and `glowAmt`. `applyTime` pushes a preset into the shared uniforms, and
`world.setTime(name)` also sets the lights and window glow. Low-light behaviour is keyed by name in three places:
- window glow: `world.setTime`, and cabin windows in `vale.setTime`
- the lighthouse lamp (needs the adventure's `lamp` flag): `main.js` `updateLamp`
- fireflies: `vale.setTime`

Add a new low-light preset to all three.

## Adventure (src/adventure.js)

- `CHAPTERS[]`: `{ title, intro?, final: { title, body }, missions[] }`. A mission is
  `{ title, start: home(stripName, dir), time?, brief, steps[], thanks }`.
- Step types:
  - `land`: `{ strip, who }`; a villager walks up and takes the parcel.
  - `pickup`: `{ strip, who, item }`.
  - `pass`: `{ label, x, z, r }`.
  - `circle`: `{ label, x, z, r }`; a full loop inside the ring.
  - `drop`: `{ label, x, z, r, agl, deck? }`; fly within `r` and below `agl` m and a parcel parachutes down.

  Any step can also carry `say` (the card after it), `flag` (set when done), and `who` (a key of `PEOPLE`; people
  met only from the air just need `{ name }`).
- Strips are looked up **by name** (`strip(name)`), so adding or reordering `STRIPS` never breaks a mission.
  Renaming a strip does.
- Save: `localStorage['biplane.adventure.v1'] = { chapter, mission, done, through?, flags }`. `through` records how
  many chapters existed when everything was finished. Older saves without it count as 2, and newer chapters
  unlock instead of starting over. Rewards (`flags`: `lamp`, `scarf`) survive a reset.
- After any story change, run `tools/adventure.sh`: it must end with `Completed` and exit 0.

## Performance

- Budget: the auto monitor drops a level below 45 fps average and climbs back above 58. Levels are defined in
  `main.js` `QUALITY`. On the dev machine (M3 Pro) the heaviest view costs ~11 ms at 1280×800 and the world builds
  in ~0.4 s.
- What keeps it fast: terrain in 64×64 chunks with a stitched half-res index beyond 1.25 km; trees as one
  `InstancedMesh` per 1 km chunk and kind; clouds re-sorted incrementally; ambient emitters only within
  `AMBIENT_FAR2`; baked shading (relief, forest floor, canopy vertex colours) instead of per-frame effects.
- Prefer baking at build time to shading per frame, and avoid adding full-screen passes (bloom, SSAO) or
  per-frame CPU loops over thousands of objects.
- Measure: press P in game (CPU ms, frame interval, draw calls, triangles including the shadow pass), or
  `WAIT=40000 tools/shot.sh out.png 'at=vale&t=twilight&frames=30'` for a GPU-synced frame time.
- `PERF_PLAN.md` tracks the performance work, including the items still open.

## Verifying changes

- `tools/shot.sh OUT.png 'QUERY'` renders a view headlessly (`tools/shot.html`: `cam=x,y,z,lx,ly,lz` or
  `at=<strip name | village | lighthouse | castle | ruin | volcano | atoll | sealight | seafort | waterfall | vale>`
  with `a=` bearing, `d=` distance, `y=` height; `t=` time of day; `lamp=1`; `w=`, `h=`; `frames=N`). It prints
  `build`, `calls`, `tris`.
- `tools/shot.sh -r REF OUT.png 'QUERY'` also renders `REF` (in a temporary git worktree) and counts the changed
  pixels. Use it for "nothing else changed" checks and before/after comparisons.
- `tools/adventure.sh` plays the full story.
- Look at the screenshots yourself. Most bugs here are visual (z-fighting, NaN pixels, floating or buried objects,
  colour-space mistakes).
- Before finishing, load `index.html` too (the real page), e.g. `--dump-dom` in headless Chrome. The menu is
  replaced by an error message if a module fails to load.

## Recipes

**Add terrain or an island:** write `myIsland(x, z)` returning −35 away from it, add it to `baseHeight`'s `max`,
and keep it off existing footprints (above). Add a colour branch in the terrain colour loop. Place its trees with a
new `rng(seed)`, through `record(...)` so they're chunked, shaded and splatted onto the forest floor. Register
obstacles, and add a `nav.js` `PLACES` label. Then check the rest of the world is unchanged (`-r HEAD`).

**Add a landing strip:** append to `STRIPS`, with `blend` small enough not to fill nearby features. The strip
dressing, windsock, menu "Start at" entry, grass exclusion and training approaches (`world.approaches`, the ones
with a clear 3° path) all follow automatically. Keep trees and buildings clear of its approach corridor
(`across < ~70–90 m` over `len/2 + 450–780 m`).

**Add a building or prop:** build it from `paint()` materials, sink it slightly into the ground (`groundAt − 0.5`),
set `castShadow`/`receiveShadow`, and `addObstacle` it. Use InstancedMesh when there are more than a handful.

**Add a delivery:** extend `CHAPTERS` (and `PEOPLE`), then run `tools/adventure.sh`.
