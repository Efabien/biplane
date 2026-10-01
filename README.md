# Biplane

A cosy, painterly biplane game that runs in the browser: fly an open-cockpit biplane over a chain of islands,
practise landings on eight airstrips, or carry the island mail in a three-chapter adventure.

Built with [three.js](https://threejs.org) 0.160 (loaded from a CDN), plain ES modules and no build step.
Everything is generated in code: terrain, trees, buildings, textures, sky, water and sound. There are no asset files.

## Play

**Online: <https://efabien.github.io/biplane/>** (GitHub Pages, served straight from `master`).

To run it locally, it has to be served over http, because browsers block ES modules on `file://`.

- **macOS:** double-click `play.command`. It serves the folder on port 8000 with caching off and opens the browser.
- **Anywhere:** run `python3 -m http.server` in this folder, then open <http://localhost:8000>.

A WebGL2 browser is required (current Chrome, Edge, Firefox, or Safari 15+).

### Controls

| Key | Action | Key | Action |
|---|---|---|---|
| W / S | throttle | ↑ / ↓ | pitch (↓ pulls up, like a stick) |
| ← / → | roll | A / D | rudder, steer on the ground |
| B | wheel brake | C | chase / cockpit camera |
| R | reset to the start | T | landing practice (cycles the approaches) |
| M | map | G | graphics: auto → low → medium → high |
| Esc | pause menu | H | hide the controls card |
| 1 – 4 / 5 | in the menu: red, blue, bush plane, island hopper / adventure | P | perf readout (dev) |

Enter or Space closes story cards.

### The menu

- **Plane:** the red biplane (Airfield), the blue parasol monoplane (Meadow strip), the yellow bush plane (Pine Vale) or the green island hopper (Beach strip). The red one is quicker (~205 km/h) with a sharp stall around 75 km/h; the blue one is lighter and slower (~165 km/h), lifts off early and stalls gently around 60 km/h. The bush plane is the slowest (~140 km/h) and gets off in under 30 m, with a very soft stall around 50 km/h; the island hopper is a heavy cabin biplane (~150 km/h) that needs a longer run, climbs and rolls sedately, and stalls softly around 57 km/h. The planes you're not flying wait parked beside their home strips.
- **Island Air Mail:** the adventure. Progress is saved in the browser after every delivery.
- **Start at:** take off from any of the eight landing sites.
- **Time of day:** Dawn, Golden hour, Dusk or Twilight. **Wind:** Calm, Light or Breezy. **Sound:** on or off.

## The world

About 10 km × 4 km of islands, west to east:

- **The home island:** the Airfield (dirt runway), a village with a windmill, a lighthouse, a castle on a ridge,
  a lake under a floating sky ruin, a railway viaduct with a steam train, and snowy mountains. Strips: Airfield,
  Meadow strip, Beach strip, Mountain meadow.
- **The sea fort,** guarding the strait.
- **The volcanic island:** jungle slopes, the Headland strip on a sea cliff (with Juniper's tea house), and a
  crater hamlet whose Caldera strip you reach through a gap in the rim.
- **The sea stacks** and an **offshore lighthouse**.
- **The coral atoll,** with the Atoll sandbar strip and a fisher's stilt hut.
- **Pine Vale,** in the north-east: a spruce-dark river valley with log cabins, a waterfall off a hanging valley,
  and the Pine Vale strip. Best seen at Twilight, flying up the valley toward the sunset.

Along the way: clouds with shadows, sailboats, sheep, birds, chimney smoke, moored boats, fireflies in the low light,
and a lighthouse beam that stays lit at dusk once you've earned it in the adventure.

## Island Air Mail (adventure)

Cosy deliveries with no timers and no failing. A crash just puts you back at the start of the delivery (R).

1. **The New Mail Pilot:** four deliveries around the home island and up the volcano.
2. **Harvest Season:** plums, lamp oil, a castle fair, and a scarf. Rewards change the world: the lighthouse is
   lit at dusk, and the pilot gets a red scarf.
3. **Letters to the Vale:** the sea fort, the atoll, the offshore light and the Pine Vale's cabins. Places with
   nowhere to land get their parcel dropped: fly low over them and it floats down on a parachute.

## Graphics and performance

Graphics adapt automatically: the game steps down a level when it averages below 45 fps, and back up when there's
headroom. G forces a level.

| Level | Pixel density | Antialiasing | Shadows | Grass |
|---|---|---|---|---|
| low | 1× | none | 1024², no terrain shadows | 30 % |
| medium | up to 1.5× | 2× MSAA + SMAA | 2048² | 60 % |
| high | up to 2× | 4× MSAA + SMAA | 4096² | 100 % |

Rough guide (measured on an Apple M3 Pro; other machines are estimates):
- Any WebGL2 integrated GPU runs `low`.
- `high` at 1080p wants a GTX 1060 / RX 580, an Apple M1, or a recent Iris Xe or Radeon 680M.
- `high` on Retina or 4K (2× density) wants an RTX 2060 / 3060 or an M1 Pro / M2 Pro.

## Development

- `src/`: the game, one ES module per concern (see [`AGENTS.md`](AGENTS.md) for the map and conventions).
- `tools/`: headless helpers (need Chrome and python3):
  - `tools/shot.sh OUT.png 'at=waterfall&t=twilight'` renders any view and prints build time, draw calls and triangles.
    `-r HEAD` also renders a git ref and counts the changed pixels.
  - `tools/adventure.sh` plays the whole adventure with a scripted plane and prints every step and card.
- [`PERF_PLAN.md`](PERF_PLAN.md): the performance plan, with what's done and what's still open.

There's no package.json, no bundler and no test framework. Check changes by playing them, and with the tools above.
