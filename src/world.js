import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SUN_DIR, NCS, time, drift, wind, applyTime, cloudUniform, paint, stripeTex, skyMaterial, cloudMaterial, cloudSpriteMaterial, waterMaterial } from './style.js';

export const HALF = 2000, WATER = 0, RUNWAY_H = 15, RW_L = 600, RW_W = 30;
// World grid: the home island (radius HALF, centred on the origin), a volcanic island to the east,
// then a sea-stack crossing and a coral atoll in the far east
export const X0 = -HALF, Z0 = -HALF, SEGX = 1280, SEGZ = 512, CELL = (HALF * 2) / SEGZ, WX = SEGX * CELL, WZ = SEGZ * CELL;
export const GRID = { x0: X0, z0: Z0, cell: CELL, segx: SEGX, segz: SEGZ };
export const GLIDE = (3 * Math.PI) / 180; // standard 3° approach path

// Landing sites. heading = direction of the strip's local -Z (0 = north); aim = aiming point distance from each end;
// takeoff = direction to start a take-off from the menu (1 = along heading, -1 = against it).
export const STRIPS = [
  { name: 'Airfield', x: 0, z: 0, heading: 0, len: RW_L, w: RW_W, h: RUNWAY_H, aim: 90, surface: 'dirt' },
  { name: 'Meadow strip', x: -150, z: -920, heading: Math.PI / 2, len: 450, w: 25, h: 32, aim: 70, surface: 'grass' },
  { name: 'Beach strip', x: 425, z: 1775, heading: -1.22, len: 400, w: 22, h: 2, aim: 70, surface: 'sand' },
  // short, rising 5 % toward its heading: land uphill (heading) and take off downhill
  { name: 'Mountain meadow', x: 625, z: -1475, heading: 1.047, len: 250, w: 20, h: 214, aim: 45, surface: 'grass', slope: 0.05, takeoff: -1 },
  // on the meadow floor of the volcano's crater: fly in low through the breach in the rim (heading), leave the same way
  { name: 'Caldera', x: 4450, z: -350, heading: -1.22, len: 260, w: 20, h: 215, aim: 40, surface: 'grass', takeoff: -1 },
  // on a grassy promontory that ends in a sea cliff: land inland (heading), take off over the edge
  { name: 'Headland', x: 3600, z: 1480, heading: 0, len: 300, w: 22, h: 45, aim: 60, surface: 'grass', blend: 40, headland: true, takeoff: -1 },
  // a built-up sandbar along the atoll ring's south-east arc: both approaches over water
  { name: 'Atoll sandbar', x: 7423, z: 854, heading: 2.79, len: 320, w: 20, h: 2, aim: 60, surface: 'sand', blend: 60 },
];
for (const st of STRIPS) { st.fx = -Math.sin(st.heading); st.fz = -Math.cos(st.heading); st.slope ??= 0; st.blend ??= 160; st.takeoff ??= 1; }
const along = (st, x, z) => (x - st.x) * st.fx + (z - st.z) * st.fz;
const across = (st, x, z) => -(x - st.x) * st.fz + (z - st.z) * st.fx;
export function stripAt(x, z) {
  for (const st of STRIPS) if (Math.abs(along(st, x, z)) <= st.len / 2 && Math.abs(across(st, x, z)) <= st.w / 2) return st;
  return null;
}
export function nearestStrip(x, z) {
  let best = null, bd = Infinity;
  for (const st of STRIPS) { const d = Math.hypot(x - st.x, z - st.z); if (d < bd) { bd = d; best = st; } }
  return { strip: best, dist: bd };
}

// ---- noise / helpers -----------------------------------------------------
function hash(i, j) {
  let n = (Math.imul(i, 374761393) + Math.imul(j, 668265263)) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}
function noise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash(xi, zi), b = hash(xi + 1, zi), c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, z) {
  let s = 0, amp = 0.5, f = 1;
  for (let o = 0; o < 5; o++) { s += amp * noise(x * f, z * f); f *= 2.03; amp *= 0.5; }
  return s / 0.97;
}
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- landmarks -------------------------------------------------------------
export const VILLAGE = { x: -330, z: 40 };
export const LIGHTHOUSE = { x: 1840, z: 260 };
export const CASTLE = { x: 725, z: 1150 };
export const RUIN = { x: 750, z: -650, y: 150 }; // floating island above the lake
// Volcanic island: crater floor + rim, breached toward the west-south-west (bx, bz points out through the gap)
export const ISLE = { x: 4100, z: 100, rx: 1750, rz: 1650 };
export const VOLCANO = { x: 4450, z: -350, floor: 215, floorR: 330, rimR: 470, rim: 340, foot: 1300, bx: -0.94, bz: 0.34 };
// Coral atoll: a reef ring of linked motu around a shallow lagoon; (bx, bz) points out through the pass
export const ATOLL = { x: 7000, z: 700, R: 450, bx: -0.707, bz: -0.707 };
// Offshore works, both standing in open water: a lighthouse on the shoal south of the sea stacks,
// and a round sea fort guarding the strait off the volcanic island's west coast
export const SEA_LIGHT = { x: 6150, z: 1500 };
export const SEAFORT = { x: 2500, z: 800 };
// Sea stacks: rock pillars on the crossing between the volcano coast and the atoll (own rng: the rest of the world stays put)
export const STACKS = [];
{
  const sr = rng(23);
  for (let t = 0; t < 4000 && STACKS.length < 26; t++) {
    const x = 5750 + sr() * 650, z = 150 + sr() * 1200;
    if (STACKS.some((s) => (s.x - x) ** 2 + (s.z - z) ** 2 < 130 * 130)) continue;
    STACKS.push({ x, z, r: 16 + sr() * 26, h: 28 + sr() * 45 });
  }
}
// Railway: straight line across a valley at a fixed deck height; tunnels at both ends (portals computed below)
export const RAIL = { cx: -650, cz: 1175, dir: (40 * Math.PI) / 180, L: 350, deck: 80 };
RAIL.fx = Math.sin(RAIL.dir); RAIL.fz = Math.cos(RAIL.dir);
export const railS = (x, z) => (x - RAIL.cx) * RAIL.fx + (z - RAIL.cz) * RAIL.fz;
export const railV = (x, z) => -(x - RAIL.cx) * RAIL.fz + (z - RAIL.cz) * RAIL.fx;

// ---- terrain height ------------------------------------------------------
// Rolling hills, a mountain ring, a lake, island falloff into the sea, flattened runway.
function homeIsland(x, z) {
  const r = Math.hypot(x, z) / HALF;
  if (r >= 1) return -35; // the falloff term reaches exactly -35 at r = 1, so this is exact
  let h = (fbm(x * 0.0011 + 3.1, z * 0.0011 - 1.7) - 0.42) * 140 + 14;
  const ridge = fbm(x * 0.003 + 11, z * 0.003 + 5);
  h += smooth(0.5, 0.75, r) * (1 - smooth(0.8, 0.92, r)) * ridge * ridge * 750;
  h -= 60 * (1 - smooth(0, 380, Math.hypot(x - 750, z + 650)));
  h += (noise(x * 0.025, z * 0.025) - 0.5) * 3 + (noise(x * 0.06 + 9, z * 0.06) - 0.5) * 1.2; // small bumps
  return h + (-35 - h) * smooth(0.9, 1.0, r);
}
// Low green hills around a volcano whose crater holds a flat meadow; a breach through the rim leads in from the west
function volcanicIsland(x, z) {
  const V = VOLCANO, r = Math.hypot((x - ISLE.x) / ISLE.rx, (z - ISLE.z) / ISLE.rz);
  if (r > 1.05) return -35;
  let h = (fbm(x * 0.0012 + 21.3, z * 0.0012 - 7.9) - 0.45) * 100 + 12;
  h += (noise(x * 0.025 + 40, z * 0.025) - 0.5) * 3 + (noise(x * 0.06 + 49, z * 0.06) - 0.5) * 1.2;
  const d = Math.hypot(x - V.x, z - V.z);
  if (d < V.foot) {
    let v = d < V.rimR ? V.floor + (V.rim - V.floor) * smooth(V.floorR, V.rimR, d) : V.rim * (1 - smooth(V.rimR, V.foot, d));
    v += (fbm(x * 0.012 + 7, z * 0.012 - 3) - 0.5) * 50 * smooth(V.rimR, 650, d) * (1 - smooth(900, V.foot, d)); // ravines
    const a = (x - V.x) * V.bx + (z - V.z) * V.bz, lat = Math.abs(-(x - V.x) * V.bz + (z - V.z) * V.bx);
    if (a > 0) v += (Math.min(v, V.floor - Math.max(0, a - V.floorR) * 0.05) - v) * (1 - smooth(60, 170, lat)); // the breach
    h = Math.max(h, v);
  }
  h += (-35 - h) * smooth(0.85, 1.0, r);
  // The headland: a broad green ridge running out to sea under its strip, cut off by a cliff just past the seaward end
  for (const st of STRIPS) if (st.headland) {
    const u = along(st, x, z), tip = -st.len / 2 - 25;
    const lift = st.h * (1 - smooth(70, 240, Math.abs(across(st, x, z)))) * smooth(tip - 30, tip, u) * (1 - smooth(500, 900, u));
    if (lift > 1) h = Math.max(h, lift * (1 + (noise(x * 0.03, z * 0.03) - 0.5) * 0.1 * smooth(40, 90, Math.abs(across(st, x, z)))));
  }
  return h;
}
// Coral atoll: sandy motu where the ring noise runs high, awash reef where it runs low; the ring stays
// submerged across the pass so the lagoon opens to the sea. The lagoon floor stays shallow (bright water).
function atoll(x, z) {
  const A = ATOLL, d = Math.hypot(x - A.x, z - A.z);
  if (d > A.R + 320) return -35;
  const h = d < A.R ? -1.5 - 4 * (1 - smooth(A.R - 330, A.R - 110, d)) : -4 - 31 * smooth(0, 300, d - A.R);
  const band = 1 - smooth(0, 155, Math.abs(d - A.R));
  const n = fbm(x * 0.0045 + 70, z * 0.0045 - 40);
  // -35 base so the ring vanishes under the lagoon/shelf floor off the band (max() below picks the floor)
  let ring = -35 + band * (33.5 + 10.5 * smooth(0.4, 0.72, n) + (noise(x * 0.05 + 80, z * 0.05) - 0.5) * 1.2);
  if ((x - A.x) * A.bx + (z - A.z) * A.bz > 0) {
    const lat = Math.abs(-(x - A.x) * A.bz + (z - A.z) * A.bx);
    ring = Math.min(ring, -1.5 + Math.max(0, ring + 1.5) * smooth(90, 200, lat));
  }
  return Math.max(h, ring);
}
// Sea stacks: steep pillars, rock-sided by the slope colour rule, grass-capped where the top is wide enough
function seaStacks(x, z) {
  if (x < 5600 || x > 6550 || z < -50 || z > 1550) return -35;
  let h = -35;
  for (const s of STACKS) {
    let d = Math.hypot(x - s.x, z - s.z);
    if (d > s.r * 2.2) continue;
    d *= 1 + (noise(x * 0.06 + 60, z * 0.06 + 25) - 0.5) * 0.4; // ragged outline
    h = Math.max(h, -35 + (s.h + 35) * (1 - smooth(s.r * 0.45, s.r * 2, d)));
  }
  return h;
}
function baseHeight(x, z) {
  let h = Math.max(homeIsland(x, z), volcanicIsland(x, z), atoll(x, z), seaStacks(x, z));
  for (const st of STRIPS) {
    const dv = Math.max(Math.abs(across(st, x, z)) - st.w / 2 - 15, 0), du = Math.max(Math.abs(along(st, x, z)) - st.len / 2 - 30, 0);
    h += (st.h + st.slope * along(st, x, z) - h) * (1 - smooth(0, st.blend, Math.hypot(du, dv)));
  }
  return h;
}

// Tunnel portals: walking out from the valley floor, the first point where the ground covers the train
{
  let sMin = 0, gMin = Infinity;
  for (let t = -RAIL.L; t <= RAIL.L; t += 5) { const g = baseHeight(RAIL.cx + RAIL.fx * t, RAIL.cz + RAIL.fz * t); if (g < gMin) { gMin = g; sMin = t; } }
  const cover = (t) => baseHeight(RAIL.cx + RAIL.fx * t, RAIL.cz + RAIL.fz * t) > RAIL.deck + 8;
  let a = sMin, b = sMin;
  while (a > -RAIL.L && !cover(a)) a -= 2;
  while (b < RAIL.L && !cover(b)) b += 2;
  RAIL.s1 = a; RAIL.s2 = b;
}

// Base terrain + a cutting for the railway between the portals
function rawHeight(x, z) {
  let h = baseHeight(x, z);
  const s = railS(x, z);
  if (s > RAIL.s1 - 4 && s < RAIL.s2 + 4) {
    const v = Math.abs(railV(x, z));
    if (v < 12) h = Math.min(h, RAIL.deck - 0.4 + (h - RAIL.deck + 0.4) * smooth(5, 12, v));
  }
  return h < 0 ? h * 2.5 : h; // steeper below sea level: a crisp shoreline instead of a flickering one
}

const H = new Float32Array((SEGX + 1) * (SEGZ + 1));
for (let j = 0; j <= SEGZ; j++)
  for (let i = 0; i <= SEGX; i++) H[j * (SEGX + 1) + i] = rawHeight(X0 + i * CELL, Z0 + j * CELL);

// Exact height of the rendered terrain triangles (matches PlaneGeometry's diagonal)
export function groundAt(x, z) {
  const gx = (x - X0) / CELL, gz = (z - Z0) / CELL;
  if (gx < 0 || gz < 0 || gx >= SEGX || gz >= SEGZ) return -35;
  const i = Math.floor(gx), j = Math.floor(gz), fx = gx - i, fz = gz - j;
  const k = j * (SEGX + 1) + i;
  const ha = H[k], hb = H[k + SEGX + 1], hc = H[k + SEGX + 2], hd = H[k + 1];
  return fx + fz <= 1
    ? ha + (hd - ha) * fx + (hb - ha) * fz
    : hc + (hb - hc) * (1 - fx) + (hd - hc) * (1 - fz);
}
export function slopeAt(x, z) {
  return Math.hypot(groundAt(x + 4, z) - groundAt(x - 4, z), groundAt(x, z + 4) - groundAt(x, z - 4)) / 8;
}

// ---- obstacle grid (trees, houses, buildings) ----------------------------
const GCELL = 50, GNX = WX / GCELL, GNZ = WZ / GCELL;
const grid = Array.from({ length: GNX * GNZ }, () => []);
export function addObstacle(x, z, r, top, bottom = -Infinity) {
  const i = Math.floor((x - X0) / GCELL), j = Math.floor((z - Z0) / GCELL);
  if (i >= 0 && j >= 0 && i < GNX && j < GNZ) grid[j * GNX + i].push({ x, z, r, top, bottom });
}
const dynamic = new Map(); // movable obstacles, e.g. the parked plane
export function setDynamicObstacle(key, x, z, r, top) { dynamic.set(key, { x, z, r, top }); }
export function hitObstacle(x, y, z) {
  for (const o of dynamic.values()) if (y - 1 < o.top && (o.x - x) ** 2 + (o.z - z) ** 2 < (o.r + 3) ** 2) return true;
  const ci = Math.floor((x - X0) / GCELL), cj = Math.floor((z - Z0) / GCELL);
  for (let j = cj - 1; j <= cj + 1; j++) {
    if (j < 0 || j >= GNZ) continue;
    for (let i = ci - 1; i <= ci + 1; i++) {
      if (i < 0 || i >= GNX) continue;
      for (const o of grid[j * GNX + i]) {
        if (y - 1 > o.top || y + 1 < o.bottom) continue;
        const dx = o.x - x, dz = o.z - z, rr = o.r + 3;
        if (dx * dx + dz * dz < rr * rr) return true;
      }
    }
  }
  return false;
}

// Whitewashed plaster for the house walls: faint mottling, a stone plinth with block seams at the
// bottom (walls are sunk a metre into the slope, so the plinth meets the ground). Instance colour tints it.
function plasterTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 64, 64);
  const pr = rng(5);
  g.fillStyle = 'rgba(160, 150, 130, 0.10)';
  for (let i = 0; i < 40; i++) {
    const s = 3 + pr() * 9;
    g.fillRect(pr() * 64, pr() * 44, s, s * (0.5 + pr() * 0.8));
  }
  g.fillStyle = '#b3a48c';
  g.fillRect(0, 47, 64, 17);
  g.fillStyle = 'rgba(90, 78, 60, 0.5)';
  g.fillRect(0, 47, 64, 2);
  g.fillStyle = 'rgba(105, 92, 72, 0.45)';
  for (let x = 2 + pr() * 6; x < 64; x += 7 + pr() * 8) g.fillRect(x, 50, 1.5, 14);
  for (let i = 0; i < 12; i++) g.fillRect(pr() * 60, 49 + pr() * 13, 3 + pr() * 5, 1.5);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---- world build ---------------------------------------------------------
export function buildWorld(scene) {
  const rand = rng(7);
  const dummy = new THREE.Object3D();
  const col = new THREE.Color();
  const place = (mesh, i, x, y, z, sx, sy, sz, ry = 0) => {
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, ry, 0);
    dummy.scale.set(sx, sy, sz);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  };

  scene.background = new THREE.Color();
  scene.fog = new THREE.FogExp2(0xffffff, 0.00045); // colour comes from the haze shader (style.js)

  // Lights: low warm sun (shadow box follows the plane) + sky/grass hemisphere; set by the time of day
  const hemi = new THREE.HemisphereLight();
  scene.add(hemi);
  const sun = new THREE.DirectionalLight();
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -140, right: 140, top: 140, bottom: -140, near: 10, far: 3600 });
  sun.shadow.bias = -0.0008;
  sun.shadow.normalBias = 0.6;
  scene.add(sun, sun.target);

  const sky = new THREE.Mesh(new THREE.SphereGeometry(6000, 32, 16), skyMaterial());
  sky.frustumCulled = false;
  sky.renderOrder = -1;
  scene.add(sky);

  // Terrain with height/slope vertex colors. Vertices are exactly the H grid nodes, so positions come straight
  // from H (no staging PlaneGeometry) and slope collapses to grid central differences (±1 node ≈ the old ±4 m
  // probes; borders one-sided, all open sea). Normals still come from computeVertexNormals over the full grid
  // (seamless chunk edges) with PlaneGeometry's triangulation, so shading and groundAt's diagonal are unchanged.
  const NV = (SEGX + 1) * (SEGZ + 1), RS = SEGX + 1;
  const positions = new Float32Array(NV * 3), colors = new Float32Array(NV * 3);
  const fullIdx = new Uint32Array(SEGX * SEGZ * 6);
  for (let j = 0, n = 0; j < SEGZ; j++)
    for (let i = 0; i < SEGX; i++) {
      const a = j * RS + i, b = a + RS;
      fullIdx[n++] = a; fullIdx[n++] = b; fullIdx[n++] = a + 1; fullIdx[n++] = b; fullIdx[n++] = b + 1; fullIdx[n++] = a + 1;
    }
  const sand = new THREE.Color(0xe2cf9e), grassA = new THREE.Color(0xa8d060), grassB = new THREE.Color(0x5c9a46);
  const rock = new THREE.Color(0x8e8878), snow = new THREE.Color(0xf4f6f8), fern = new THREE.Color(0x7cc653), jungle = new THREE.Color(0x3a8a3c);
  for (let j = 0, v = 0; j <= SEGZ; j++)
    for (let i = 0; i <= SEGX; i++, v++) {
      const x = X0 + i * CELL, z = Z0 + j * CELL, h = H[v];
      positions[v * 3] = x; positions[v * 3 + 1] = h; positions[v * 3 + 2] = z;
      const s = Math.hypot(H[v + (i < SEGX ? 1 : 0)] - H[v - (i > 0 ? 1 : 0)], H[v + (j < SEGZ ? RS : 0)] - H[v - (j > 0 ? RS : 0)]) / (2 * CELL);
      const n = fbm(x * 0.01, z * 0.01), tropic = x > HALF && Math.hypot((x - ISLE.x) / ISLE.rx, (z - ISLE.z) / ISLE.rz) < 1.05;
      if (h < 2.5) col.copy(sand);
      else if (tropic) col.copy(s > 0.9 ? rock : fern).lerp(jungle, s > 0.9 ? 0.35 : smooth(0.3, 0.7, n + h / 500)); // lush volcanic island, rock only on cliffs
      else if (h > 250 + n * 60) col.copy(snow);
      else if (h > 140 + n * 40 || s > 0.75) col.copy(rock);
      else col.copy(grassA).lerp(grassB, smooth(0.35, 0.65, n));
      col.toArray(colors, v * 3);
    }
  const staging = new THREE.BufferGeometry();
  staging.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  staging.setIndex(new THREE.BufferAttribute(fullIdx, 1));
  staging.computeVertexNormals();
  const normals = staging.attributes.normal.array;

  // Split into CHUNK×CHUNK-cell meshes so the main and shadow passes can frustum-cull what's out of view.
  // All chunks share two index buffers: full res (PlaneGeometry's diagonals, matches groundAt) and a half-res
  // LOD for distant chunks. In the LOD, border cells stay full res and fan into the coarse interior, so shared
  // edges are always full res: no T-junction cracks at LOD boundaries or between chunks.
  const CHUNK = 64, CR = CHUNK + 1, terrainMat = paint(0xffffff, { vertexColors: true }, { mottle: true });
  const cFull = [], cHalf = [], N = (i, j) => j * CR + i;
  for (let j = 0; j < CHUNK; j++)
    for (let i = 0; i < CHUNK; i++) { const a = N(i, j), b = a + CR; cFull.push(a, b, a + 1, b, b + 1, a + 1); }
  for (let j = 0; j < CHUNK; j += 2)
    for (let i = 0; i < CHUNK; i += 2) {
      const A = N(i, j), B = N(i + 2, j), C = N(i, j + 2), D = N(i + 2, j + 2);
      const MT = N(i + 1, j), MB = N(i + 1, j + 2), ML = N(i, j + 1), MR = N(i + 2, j + 1);
      const T = j === 0, Bo = j === CHUNK - 2, L = i === 0, R = i === CHUNK - 2;
      if (T && L) cHalf.push(D, B, MT, D, MT, A, D, A, ML, D, ML, C);
      else if (T && R) cHalf.push(C, MT, A, C, B, MT, C, MR, B, C, D, MR);
      else if (Bo && L) cHalf.push(B, A, ML, B, ML, C, B, C, MB, B, MB, D);
      else if (Bo && R) cHalf.push(A, MR, B, A, D, MR, A, MB, D, A, C, MB);
      else if (T) cHalf.push(A, C, MT, MT, C, D, MT, D, B);
      else if (Bo) cHalf.push(A, C, MB, A, MB, B, B, MB, D);
      else if (L) cHalf.push(A, ML, B, ML, D, B, ML, C, D);
      else if (R) cHalf.push(A, MR, B, A, C, MR, C, D, MR);
      else cHalf.push(A, C, B, C, D, B); // coarse cell, same diagonal direction as full res
    }
  const idxFull = new THREE.BufferAttribute(Uint16Array.from(cFull), 1), idxHalf = new THREE.BufferAttribute(Uint16Array.from(cHalf), 1);
  const terrain = new THREE.Group();
  for (let cj = 0; cj < SEGZ; cj += CHUNK)
    for (let ci = 0; ci < SEGX; ci += CHUNK) {
      const n = CR * CR, cp = new Float32Array(n * 3), cn = new Float32Array(n * 3), cc = new Float32Array(n * 3);
      for (let j = 0, k = 0; j <= CHUNK; j++)
        for (let i = 0; i <= CHUNK; i++, k += 3) {
          const v = ((cj + j) * RS + ci + i) * 3;
          cp.set(positions.subarray(v, v + 3), k);
          cn.set(normals.subarray(v, v + 3), k);
          cc.set(colors.subarray(v, v + 3), k);
        }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(cp, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(cn, 3));
      g.setAttribute('color', new THREE.BufferAttribute(cc, 3));
      g.setIndex(idxFull);
      g.computeBoundingSphere();
      const m = new THREE.Mesh(g, terrainMat);
      m.receiveShadow = m.castShadow = true;
      terrain.add(m);
    }
  scene.add(terrain);

  // Grid textures for the GPU ground cover: exact heights + terrain colour (sRGB)
  const heightTex = new THREE.DataTexture(H, SEGX + 1, SEGZ + 1, THREE.RedFormat, THREE.FloatType);
  heightTex.needsUpdate = true;
  const colorData = new Uint8Array(NV * 4);
  for (let v = 0; v < NV; v++) {
    col.fromArray(colors, v * 3).convertLinearToSRGB();
    colorData.set([col.r * 255, col.g * 255, col.b * 255, 255], v * 4);
  }
  const colorTex = new THREE.DataTexture(colorData, SEGX + 1, SEGZ + 1);
  colorTex.colorSpace = THREE.SRGBColorSpace;
  colorTex.magFilter = colorTex.minFilter = THREE.LinearFilter;
  colorTex.needsUpdate = true;

  // Sea + lake share one water plane; depth under the surface comes from the height grid
  const depthData = new Uint8Array((SEGX + 1) * (SEGZ + 1));
  for (let k = 0; k < depthData.length; k++) depthData[k] = Math.round(Math.min(1, Math.max(0, (WATER - H[k]) / 60)) * 255);
  const depthTex = new THREE.DataTexture(depthData, SEGX + 1, SEGZ + 1, THREE.RedFormat);
  depthTex.magFilter = depthTex.minFilter = THREE.LinearFilter;
  depthTex.needsUpdate = true;
  const water = new THREE.Mesh(new THREE.PlaneGeometry(40000, 40000).rotateX(-Math.PI / 2), waterMaterial(depthTex, GRID));
  water.position.y = WATER;
  Object.assign(water.material, { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
  scene.add(water);

  // Hangar (quonset) next to the runway
  const hangar = new THREE.Group();
  hangar.position.set(48, RUNWAY_H, 200);
  const walls = new THREE.Mesh(new THREE.BoxGeometry(16, 3, 22), paint(0x8a6a4a));
  walls.position.y = 1.5;
  const arch = new THREE.Mesh(
    new THREE.CylinderGeometry(8, 8, 22, 16, 1, false, -Math.PI / 2, Math.PI).rotateX(-Math.PI / 2),
    paint(0xb5533c),
  );
  arch.position.y = 3;
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.3, 6, 12), paint(0x3d3430));
  door.position.set(-8, 3, 0);
  for (const o of [walls, arch, door]) { o.castShadow = o.receiveShadow = true; hangar.add(o); }
  scene.add(hangar);
  addObstacle(48, 200, 12, RUNWAY_H + 11);

  // ---- Landing sites: surface, edge / threshold / aiming-point markers, corner poles, windsock ----
  const WHITE = 0xfbf8ee, ORANGE = 0xe8742c;
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const poleGeo = new THREE.CylinderGeometry(0.12, 0.12, 10, 6).translate(0, 5, 0);
  const poleMat = paint(0xffffff, { map: stripeTex(ORANGE, 0xf6f1e6, 3) });
  const flagGeo = new THREE.BufferGeometry();
  flagGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 9.9, 0, 0, 8.6, 0, 1.8, 9.25, 0], 3));
  flagGeo.computeVertexNormals();
  const flagMat = paint(ORANGE, { side: THREE.DoubleSide });
  const socks = [];

  for (const st of STRIPS) {
    const half = st.len / 2;
    const toWorld = (x, z) => [st.x - x * st.fz - z * st.fx, st.z + x * st.fx - z * st.fz];
    const g = new THREE.Group();
    g.position.set(st.x, st.h, st.z);
    g.rotation.y = st.heading;
    scene.add(g);

    const soft = st.surface !== 'dirt'; // grass and sand strips use raised boards instead of paint
    const yAt = (z) => -z * st.slope;  // local height offset along a sloped strip (local -Z = uphill)
    const surfMat = st.surface === 'grass'
      ? paint(0xffffff, { map: stripeTex(0xcfe08a, 0xb4d470, st.len / 12), polygonOffset: true, polygonOffsetFactor: -2 })
      : paint(st.surface === 'sand' ? 0xeadbb0 : 0xc9b27f, { polygonOffset: true, polygonOffsetFactor: -2 });
    const surf = new THREE.Mesh(new THREE.PlaneGeometry(st.w, st.len).rotateX(-Math.PI / 2), surfMat);
    surf.position.y = 0.05;
    surf.rotation.x = Math.atan(st.slope);
    surf.receiveShadow = true;
    g.add(surf);

    // Markers: edge markers (white; white/orange boards on grass), threshold bars, aiming-point blocks
    const marks = new THREE.InstancedMesh(unitBox, paint(0xffffff), 96);
    let m = 0;
    const mark = (x, y, z, sx, sy, sz, hex) => { place(marks, m, x, y + yAt(z), z, sx, sy, sz); marks.setColorAt(m++, col.setHex(hex)); };
    const step = soft ? 30 : 40;
    for (let z = -half; z <= half + 0.1; z += step)
      for (const x of [-st.w / 2 - 1, st.w / 2 + 1]) mark(x, soft ? 0.3 : 0.2, z, soft ? 1.2 : 0.8, soft ? 0.6 : 0.4, soft ? 3.5 : 2.5, soft && Math.round(z / step) % 2 ? ORANGE : WHITE);
    for (const e of [-1, 1]) {
      for (let x = -st.w / 2 + 3.5; x <= st.w / 2 - 3.5; x += 3.14)
        soft ? mark(x, 0.2, e * (half - 2), 2.4, 0.4, 1.2, WHITE) : mark(x, 0.08, e * (half - 12), 1.4, 0.06, 14, WHITE);
      for (const x of [-st.w / 4 - 1, st.w / 4 + 1]) mark(x, soft ? 0.15 : 0.08, e * (half - st.aim), st.w * 0.13, soft ? 0.3 : 0.06, 18, WHITE);
    }
    marks.count = m;
    marks.receiveShadow = true;
    g.add(marks);

    // Tall striped poles with flags at the four corners (visible from the air)
    const poles = new THREE.InstancedMesh(poleGeo, poleMat, 4), flags = new THREE.InstancedMesh(flagGeo, flagMat, 4);
    let c = 0;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const x = sx * (st.w / 2 + 6), z = sz * (half + 4);
      place(poles, c, x, yAt(z), z, 1, 1, 1);
      place(flags, c++, x, yAt(z), z, 1, 1, 1, sx > 0 ? Math.PI : 0);
      const [wx, wz] = toWorld(x, z);
      addObstacle(wx, wz, 0.5, st.h + yAt(z) + 10);
    }
    for (const o of [poles, flags]) { o.castShadow = true; g.add(o); }

    // Windsock beside the far end
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 6, 6), paint(0xeeeeee));
    const sx = -st.w / 2 - 10, sz = -half + 20;
    pole.position.set(sx, 3 + yAt(sz), sz);
    const sock = new THREE.Group();
    sock.position.set(sx, 5.6 + yAt(sz), sz);
    sock.add(new THREE.Mesh(new THREE.ConeGeometry(0.45, 2.4, 10, 1, true).rotateZ(-Math.PI / 2).translate(1.3, 0, 0), paint(ORANGE, { side: THREE.DoubleSide })));
    g.add(pole, sock);
    socks.push({ sock, heading: st.heading });
    const [wsx, wsz] = toWorld(sx, sz);
    addObstacle(wsx, wsz, 1, st.h + yAt(sz) + 6);
  }

  // Training approaches on the 3° path, starting as far out (400–700 m) as the terrain under the path allows
  const approaches = [];
  for (const st of STRIPS) for (const d of [1, -1]) {
    const ox = -d * st.fx, oz = -d * st.fz, aimU = st.len / 2 - st.aim, aimY = st.h - d * aimU * st.slope;
    let D = 150;
    while (D <= 700 && groundAt(st.x + ox * (aimU + D), st.z + oz * (aimU + D)) < aimY + D * Math.tan(GLIDE) * 0.6) D += 25;
    const clear = D - 25 >= 400;
    const bearing = (THREE.MathUtils.radToDeg(Math.atan2(-ox, oz)) + 360) % 360;
    const rwy = String(((Math.round(bearing / 10) + 35) % 36) + 1).padStart(2, '0');
    if (clear) approaches.push({ strip: st, ox, oz, aimU, aimY, D: Math.min(700, D - 25), name: `${st.name} rwy ${rwy}` });
  }

  // Village: instanced walls + gable roofs
  const vc = VILLAGE;
  const houses = [];
  for (let t = 0; t < 600 && houses.length < 18; t++) {
    const a = rand() * Math.PI * 2, d = 15 + rand() * 110;
    const x = vc.x + Math.cos(a) * d, z = vc.z + Math.sin(a) * d;
    if (slopeAt(x, z) > 0.25 || groundAt(x, z) < 3) continue;
    if (houses.some((h) => (h.x - x) ** 2 + (h.z - z) ** 2 < 400)) continue;
    houses.push({ x, z, w: 6 + rand() * 4, d: 7 + rand() * 5, hgt: 4 + rand() * 3, rot: rand() * Math.PI });
  }
  // Crater hamlet on the caldera floor, clear of the strip and the approach through the breach (own rng: the rest of the world stays put)
  const hr = rng(11), V = VOLCANO, nVillage = houses.length;
  for (let t = 0; t < 400 && houses.length < nVillage + 8; t++) {
    const a = hr() * Math.PI * 2, d = 90 + hr() * 190;
    const x = V.x + Math.cos(a) * d, z = V.z + Math.sin(a) * d;
    if (Math.abs(-(x - V.x) * V.bz + (z - V.z) * V.bx) < 55) continue;
    if (slopeAt(x, z) > 0.25 || groundAt(x, z) < V.floor - 2) continue;
    if (houses.some((h) => (h.x - x) ** 2 + (h.z - z) ** 2 < 500)) continue;
    houses.push({ x, z, w: 5 + hr() * 3, d: 6 + hr() * 4, hgt: 3.5 + hr() * 2, rot: Math.atan2(x - V.x, z - V.z) + (hr() - 0.5) * 0.4, r1: hr(), r2: hr() });
  }
  const roofShape = new THREE.Shape([new THREE.Vector2(-0.5, 0), new THREE.Vector2(0.5, 0), new THREE.Vector2(0, 1)]);
  const roofGeo = new THREE.ExtrudeGeometry(roofShape, { depth: 1, bevelEnabled: false }).translate(0, 0, -0.5);
  const wallMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), paint(0xffffff, { map: plasterTexture() }), houses.length);
  const roofMesh = new THREE.InstancedMesh(roofGeo, paint(0xffffff), houses.length);
  const roofColors = [0xc0473a, 0x3f7f8c, 0xd98a3d, 0x4d6fa8, 0x9a4f6a];
  const chimneyMesh = new THREE.InstancedMesh(unitBox, paint(0xb8a890), houses.length);
  const chimneys = [];
  // Doors, windows and roof ridge beams (window panes glow warm at dusk and dawn, set by setTime)
  const dr = rng(31);
  const doorColors = [0x6b4a2e, 0x8a4a35, 0x4a5f6e, 0x5a6e55, 0x77502f];
  const doorMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.9, 1.9, 0.12).translate(0, 0.95, 0), paint(0xffffff), houses.length);
  const frameMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.74, 0.94, 0.1), paint(0xf6f3e8), houses.length * 7);
  const paneMat = paint(0x26303c, { emissive: 0x0e1218 });
  const paneMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.56, 0.76, 0.14), paneMat, houses.length * 7);
  const ridgeMesh = new THREE.InstancedMesh(unitBox, paint(0x5a4632), houses.length);
  let nWin = 0;
  const addWindow = (h, gy, lx, ly, lz, ry, sc = 1) => {
    const c = Math.cos(h.rot), sn = Math.sin(h.rot);
    const wx = h.x + lx * c + lz * sn, wz = h.z - lx * sn + lz * c;
    place(frameMesh, nWin, wx, gy + ly, wz, sc, sc, 1, h.rot + ry);
    place(paneMesh, nWin++, wx, gy + ly, wz, sc, sc, 1, h.rot + ry);
  };
  houses.forEach((h, i) => {
    const y = groundAt(h.x, h.z) - 1;
    if (i % 3 !== 2) { // two houses in three have a chimney
      const ox = h.w * 0.25, oz = h.d * 0.2, c = Math.cos(h.rot), sn = Math.sin(h.rot);
      const roofY = y + h.hgt + 1 + (2.5 + h.w * 0.25) * 0.56;
      const cx = h.x + ox * c + oz * sn, cz = h.z - ox * sn + oz * c;
      place(chimneyMesh, chimneys.length, cx, roofY + 0.5, cz, 0.8, 2.2, 0.8, h.rot);
      chimneys.push({ x: cx, y: roofY + 1.6, z: cz });
    }
    place(wallMesh, i, h.x, y, h.z, h.w, h.hgt + 1, h.d, h.rot);
    place(roofMesh, i, h.x, y + h.hgt + 1, h.z, h.w * 1.15, 2.5 + h.w * 0.25, h.d * 1.1, h.rot);
    wallMesh.setColorAt(i, col.setHex((h.r1 ?? rand()) < 0.5 ? 0xf6efe0 : 0xefe3c8));
    roofMesh.setColorAt(i, col.setHex(roofColors[Math.floor((h.r2 ?? rand()) * roofColors.length)]));
    // Painted door on one gable end, windows around, a small attic window over the door, a dark ridge beam
    const gy = y + 1, c = Math.cos(h.rot), sn = Math.sin(h.rot);
    const fz = dr() < 0.5 ? 1 : -1, dx = (dr() - 0.5) * h.w * 0.35, dz = fz * (h.d / 2 + 0.07);
    place(doorMesh, i, h.x + dx * c + dz * sn, gy, h.z - dx * sn + dz * c, 1, 1, 1, h.rot);
    doorMesh.setColorAt(i, col.setHex(doorColors[Math.floor(dr() * doorColors.length)]));
    addWindow(h, gy, -Math.sign(dx || 1) * h.w * 0.27, 1.6, fz * (h.d / 2 + 0.06), 0);
    addWindow(h, gy, (dr() - 0.5) * h.w * 0.5, 1.6, -fz * (h.d / 2 + 0.06), 0);
    for (const sx of [-1, 1]) {
      const offs = h.d > 8.5 || dr() < 0.4 ? [-h.d * 0.22, h.d * 0.22] : [(dr() - 0.5) * h.d * 0.3];
      for (const oz of offs) addWindow(h, gy, sx * (h.w / 2 + 0.06), 1.6, oz, Math.PI / 2);
    }
    addWindow(h, gy, 0, h.hgt + 0.7, fz * (h.d * 0.55 + 0.05), 0, 0.6);
    place(ridgeMesh, i, h.x, y + h.hgt + 1 + 2.5 + h.w * 0.25 - 0.06, h.z, 0.16, 0.14, h.d * 1.12, h.rot);
    addObstacle(h.x, h.z, Math.max(h.w, h.d) * 0.6, y + h.hgt + 4.5);
  });
  chimneyMesh.count = chimneys.length;
  frameMesh.count = paneMesh.count = nWin;
  for (const o of [wallMesh, roofMesh, chimneyMesh, doorMesh, frameMesh, paneMesh, ridgeMesh]) { o.castShadow = o.receiveShadow = true; scene.add(o); }

  // Windmill with turning blades
  const wx = vc.x + 70, wz = vc.z - 95;
  const mill = new THREE.Group();
  mill.position.set(wx, groundAt(wx, wz) - 0.5, wz);
  mill.rotation.y = 0.6;
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 3.2, 14, 10).translate(0, 7, 0), paint(0xe8dcc4));
  const cap = new THREE.Mesh(new THREE.ConeGeometry(3, 3.5, 10).translate(0, 15.7, 0), paint(0xb5533c));
  const blades = new THREE.Group();
  blades.position.set(0, 13, -3.3);
  const bladeGeo = new THREE.BoxGeometry(1, 8, 0.15).translate(0, 4.4, 0), wood = paint(0x7a5a3a);
  for (let b = 0; b < 4; b++) {
    const blade = new THREE.Mesh(bladeGeo, wood);
    blade.rotation.z = (b * Math.PI) / 2;
    blade.castShadow = true;
    blades.add(blade);
  }
  for (const o of [tower, cap]) { o.castShadow = o.receiveShadow = true; mill.add(o); }
  mill.add(blades);
  scene.add(mill);
  addObstacle(wx, wz, 5, mill.position.y + 22);

  // Trees: clustered-blob broadleaf canopies, tiered pines, a few giant camphor trees; canopies sway
  // Collected per 500 m chunk (one InstancedMesh per chunk and kind) so the main and shadow passes cull by chunk.
  const MAX = 3000, TCH = 1000, TNX = WX / TCH, TNZ = WZ / TCH; // 1 km chunks: quarter the draw calls of 500 m, still culls under the ~2–3 km fog
  const kinds = {
    trunks: { geo: new THREE.CylinderGeometry(0.25, 0.35, 1, 6).translate(0, 0.5, 0), mat: paint(0x6b4a2e) },
    rounds: { geo: blobCanopy(), mat: paint(0xffffff, {}, { wind: true }) },
    pines: { geo: tieredPine(), mat: paint(0xffffff, {}, { wind: true }) },
  };
  const chunks = new Map();
  let nT = 0;
  const record = (kind, x, z, y, sx, sy, sz, ry = 0, color = null) => {
    const ci = Math.min(TNX - 1, Math.max(0, Math.floor((x - X0) / TCH))), cj = Math.min(TNZ - 1, Math.max(0, Math.floor((z - Z0) / TCH)));
    const key = cj * TNX + ci;
    if (!chunks.has(key)) chunks.set(key, { trunks: [], rounds: [], pines: [] });
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, ry, 0);
    dummy.scale.set(sx, sy, sz);
    dummy.updateMatrix();
    chunks.get(key)[kind].push({ m: dummy.matrix.clone(), c: color?.clone() });
  };
  const addTree = (x, z, s, pine) => {
    const h = groundAt(x, z);
    record('trunks', x, z, h - 0.3, s, 3.2 * s, s);
    nT++;
    col.setHSL(0.22 + rand() * 0.08, 0.45 + rand() * 0.17, 0.30 + rand() * 0.12);
    if (pine) record('pines', x, z, h + 1.8 * s, 2.2 * s, 7 * s, 2.2 * s, rand() * 6, col.offsetHSL(0.05, -0.05, -0.07));
    else record('rounds', x, z, h + 4.4 * s, 2.4 * s, 2.4 * s, 2.4 * s, rand() * 6, col);
    addObstacle(x, z, 2 * s, h + (pine ? 8.8 : 7.8) * s);
  };
  // Giant camphor trees in the meadows around the airfield (landmarks)
  for (const [x, z] of [[-200, -60], [170, -150], [150, 400], [-240, 270], [-120, -420]]) addTree(x, z, 3.2, false);
  for (let t = 0; t < 40000 && nT < MAX; t++) {
    const x = (rand() * 2 - 1) * HALF * 0.92, z = (rand() * 2 - 1) * HALF * 0.92;
    const h = groundAt(x, z);
    if (h < 3 || h > 220) continue;
    if (fbm(x * 0.004 + 50, z * 0.004) < 0.55 && rand() > 0.03) continue; // forest patches + a few lone trees
    if (STRIPS.some((st) => Math.abs(across(st, x, z)) < 90 && Math.abs(along(st, x, z)) < st.len / 2 + 450)) continue; // keep strips + approaches clear
    if ((x - vc.x) ** 2 + (z - vc.z) ** 2 < 150 * 150) continue;
    if (Math.hypot(x - CASTLE.x, z - CASTLE.z) < 50 || Math.hypot(x - LIGHTHOUSE.x, z - LIGHTHOUSE.z) < 35) continue;
    if (Math.abs(railV(x, z)) < 22 && railS(x, z) > RAIL.s1 - 40 && railS(x, z) < RAIL.s2 + 40) continue;
    if (slopeAt(x, z) > 0.6) continue;
    addTree(x, z, 0.8 + rand() * 0.7, h > 70 || rand() < 0.15);
  }
  // Volcanic island: jungle-thick broadleaf woods all the way up the volcano, a few pines near the rim
  const nHome = nT;
  for (let t = 0; t < 60000 && nT - nHome < 4000; t++) {
    const x = ISLE.x + (rand() * 2 - 1) * ISLE.rx, z = ISLE.z + (rand() * 2 - 1) * ISLE.rz;
    const h = groundAt(x, z);
    if (h < 3 || h > 330) continue;
    if (fbm(x * 0.004 - 30, z * 0.004 + 12) < 0.44 && rand() > 0.05) continue;
    if (houses.some((o) => (o.x - x) ** 2 + (o.z - z) ** 2 < 15 * 15)) continue;
    if (STRIPS.some((st) => Math.abs(across(st, x, z)) < 90 && Math.abs(along(st, x, z)) < st.len / 2 + 450)) continue;
    if (slopeAt(x, z) > 0.7) continue;
    addTree(x, z, 0.9 + rand() * 0.8, h > 260 || rand() < 0.06);
  }
  // Atoll: a light broadleaf scatter on the grassy motu; green tufts cap the flatter sea stacks
  const ar = rng(19);
  for (let t = 0, n = 0; t < 4000 && n < 60; t++) {
    const a = ar() * Math.PI * 2, d = ATOLL.R + (ar() * 2 - 1) * 110;
    const x = ATOLL.x + Math.cos(a) * d, z = ATOLL.z + Math.sin(a) * d;
    if (groundAt(x, z) < 3.5) continue;
    if (STRIPS.some((st) => Math.abs(across(st, x, z)) < 90 && Math.abs(along(st, x, z)) < st.len / 2 + 450)) continue;
    addTree(x, z, 0.55 + ar() * 0.35, false);
    n++;
  }
  for (const s of STACKS) if (s.h < 48 && ar() < 0.6) addTree(s.x, s.z, 0.6 + ar() * 0.3, false);
  for (const chunk of chunks.values())
    for (const [kind, list] of Object.entries(chunk)) {
      if (!list.length) continue;
      const mesh = new THREE.InstancedMesh(kinds[kind].geo, kinds[kind].mat, list.length);
      list.forEach(({ m, c }, i) => { mesh.setMatrixAt(i, m); if (c) mesh.setColorAt(i, c); });
      mesh.computeBoundingSphere();
      mesh.castShadow = mesh.receiveShadow = true;
      scene.add(mesh);
    }

  // Clouds: towering cumulus of many smaller puffs; flat bottoms, bumps and drift happen in the shader
  const NC = 80, PPC = 24, WRAP = { x0: X0 - 400, span: WX + 800 }; // clouds drift east and wrap across the whole map
  const puffGeo = new THREE.SphereGeometry(1, 20, 14);
  const span = new Float32Array(NC * PPC * 4);
  const puffs = new THREE.InstancedMesh(puffGeo, cloudMaterial(WRAP), NC * PPC);
  const clouds = [], mist = [];
  let pi = 0;
  for (let c = 0; c < NC; c++) {
    const W = 25 + rand() ** 1.5 * 70, B = 240 + rand() * 140, tall = W * (0.8 + rand() * 1.0);
    const cx = X0 + rand() * WX, cz = Z0 + rand() * WZ;
    const parts = [];
    const ring = (n, dist, y, s0, s1) => {
      for (let p = 0; p < n; p++) {
        const a = (p / n) * Math.PI * 2 + rand() * 0.8, d = dist * (0.7 + rand() * 0.5);
        parts.push({ ox: Math.cos(a) * d * W, oy: y * (0.8 + rand() * 0.4), oz: Math.sin(a) * d * W * 0.7, s: W * (s0 + rand() * (s1 - s0)) });
      }
    };
    ring(8, 0.62, W * 0.08, 0.28, 0.4);     // wide base
    ring(6, 0.3, W * 0.14, 0.34, 0.46);     // base fill
    ring(6, 0.3, tall * 0.45, 0.28, 0.4);   // middle
    ring(4, 0.14, tall * 0.75, 0.22, 0.32); // crown
    const top = B + Math.max(...parts.map((p) => p.oy + p.s * 0.8));
    for (const p of parts) {
      place(puffs, pi, cx + p.ox, B + p.oy, cz + p.oz, p.s * 0.85, p.s * 0.68, p.s * 0.85); // solid core, softened by the mist
      span.set([B, top, cx, 0], pi++ * 4);
      for (let k = 0; k < 2; k++) { // two mist sprites on the puff's surface
        const a = rand() * Math.PI * 2, e = rand() * 1.2 - 0.3;
        mist.push([cx + p.ox + Math.cos(a) * Math.cos(e) * p.s * 0.7, Math.max(B + p.s * 0.2, B + p.oy + Math.sin(e) * p.s * 0.6), cz + p.oz + Math.sin(a) * Math.cos(e) * p.s * 0.7, B, top, cx, p.s * (1.4 + rand() * 0.6)]);
      }
    }
    for (let k = 0; k < 6; k++) { // wispy base
      const a = (k / 6) * Math.PI * 2 + rand();
      mist.push([cx + Math.cos(a) * W * 0.6, B + W * 0.12, cz + Math.sin(a) * W * 0.45, B, top, cx, W * (0.6 + rand() * 0.3)]);
    }
    clouds.push({ x: cx, z: cz, W, B, y: (B + top) / 2, cx });
  }
  const spanAttr = new THREE.InstancedBufferAttribute(span.slice(), 4).setUsage(THREE.DynamicDrawUsage);
  puffGeo.setAttribute('aSpan', spanAttr);
  puffs.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const baseMat = puffs.instanceMatrix.array.slice(); // unsorted source data
  const puffOrder = Uint16Array.from({ length: NC * PPC }, (_, i) => i), puffFar = new Float32Array(NC * PPC); // cloud c's puffs: block c*PPC
  puffs.frustumCulled = false;
  scene.add(puffs);
  const mistGeo = new THREE.BufferGeometry();
  mistGeo.setAttribute('position', new THREE.Float32BufferAttribute(mist.flatMap((m) => m.slice(0, 3)), 3));
  mistGeo.setAttribute('aSpan', new THREE.Float32BufferAttribute(mist.flatMap((m) => m.slice(3)), 4));
  const mistPoints = new THREE.Points(mistGeo, cloudSpriteMaterial(WRAP));
  mistPoints.frustumCulled = false;
  scene.add(mistPoints);
  const order = Uint8Array.from(clouds, (_, i) => i), drawOrder = order.slice(), cloudD = new Float32Array(NC), cloudFar = new Float32Array(NC);
  const sortedAt = new THREE.Vector3(Infinity, 0, 0);
  let reordered = false, sortAge = 0;

  // Shadow box: grows with altitude, sits ahead of the camera on the ground, snapped to texels (no shimmer)
  const LX = new THREE.Vector3(), LY = new THREE.Vector3();
  const setTime = (name) => {
    const t = applyTime(name);
    sun.color.setHex(t.sunLight); sun.intensity = t.sunI;
    hemi.color.setHex(t.hemiSky); hemi.groundColor.setHex(t.hemiGround); hemi.intensity = t.hemiI;
    scene.background.setHex(t.horizon);
    scene.fog.density = t.fog;
    paneMat.emissive.setHex(name === 'dusk' || name === 'dawn' ? 0xdd8f38 : 0x0e1218); // lit windows in the low light
    LX.crossVectors(new THREE.Vector3(0, 1, 0), SUN_DIR).normalize();
    LY.crossVectors(SUN_DIR, LX);
  };
  setTime('golden');
  const _dir = new THREE.Vector3(), _c = new THREE.Vector3();
  let shadowSize = 0;
  const updateShadow = (camera, planePos) => {
    const agl = Math.max(0, planePos.y - groundAt(planePos.x, planePos.z));
    const size = Math.min(800, Math.round((140 + agl * 1.5) / 50) * 50);
    const sc = sun.shadow.camera;
    if (size !== shadowSize) {
      shadowSize = size;
      Object.assign(sc, { left: -size, right: size, top: size, bottom: -size });
      sc.updateProjectionMatrix();
    }
    camera.getWorldDirection(_dir);
    _dir.y = 0;
    if (_dir.lengthSq() < 1e-4) _dir.set(0, 0, -1);
    _dir.normalize();
    _c.set(planePos.x + _dir.x * size * 0.4, 0, planePos.z + _dir.z * size * 0.4);
    _c.y = groundAt(_c.x, _c.z);
    const texel = (2 * size) / sun.shadow.mapSize.x, u = _c.dot(LX), v = _c.dot(LY);
    _c.addScaledVector(LX, Math.round(u / texel) * texel - u).addScaledVector(LY, Math.round(v / texel) * texel - v);
    sun.target.position.copy(_c);
    sun.position.copy(_c).addScaledVector(SUN_DIR, 2000);
  };

  // Terrain LOD: distant chunks draw the stitched half-res index (~3.8× fewer triangles). Hysteresis so a
  // chunk straddling the boundary doesn't flip every frame. Collision is untouched (groundAt reads H).
  const LOD_FAR2 = 1250 * 1250, LOD_NEAR2 = 1150 * 1150;
  const updateLod = (camPos) => {
    for (const m of terrain.children) {
      const c = m.geometry.boundingSphere.center;
      const d2 = (c.x - camPos.x) ** 2 + (c.z - camPos.z) ** 2;
      if (d2 > LOD_FAR2) { if (m.geometry.index !== idxHalf) m.geometry.setIndex(idxHalf); }
      else if (d2 < LOD_NEAR2 && m.geometry.index !== idxFull) m.geometry.setIndex(idxFull);
    }
  };

  // Insertion sort of idx[from, to) by ascending key: orders barely change between frames, so this is ~linear
  const isort = (idx, key, from = 0, to = idx.length) => {
    let moved = false;
    for (let i = from + 1; i < to; i++) {
      const v = idx[i], k = key[v];
      let j = i - 1;
      for (; j >= from && key[idx[j]] > k; j--) idx[j + 1] = idx[j];
      if (j + 1 !== i) { idx[j + 1] = v; moved = true; }
    }
    return moved;
  };
  // Every frame: feed the nearest clouds to the cloud-shadow shader. Puffs are drawn back-to-front for their soft edges,
  // cloud by cloud with each cloud's puffs sorted within its block. The buffers are only rewritten when the camera has
  // moved (relative to the drifting clouds) far enough, for the nearest cloud, to reorder puffs, or at most every 0.5 s
  // when clouds swapped places: two clouds only swap while about equidistant, i.e. not overlapping on screen.
  const updateClouds = (camPos, dt) => {
    let near = Infinity;
    for (let i = 0; i < NC; i++) {
      const c = clouds[i];
      c.cx = WRAP.x0 + (((c.x + drift.value - WRAP.x0) % WRAP.span) + WRAP.span) % WRAP.span;
      cloudD[i] = (c.cx - camPos.x) ** 2 + (c.z - camPos.z) ** 2;
      cloudFar[i] = -cloudD[i] - (c.y - camPos.y) ** 2;
      near = Math.min(near, -cloudFar[i]);
    }
    isort(order, cloudD);
    for (let i = 0; i < NCS; i++) {
      const c = clouds[order[i]];
      cloudUniform.value[i].set(c.cx, c.z, c.W, c.B);
    }
    const step = Math.max(4, 0.15 * Math.sqrt(near));
    const rx = camPos.x - drift.value; // camera position in the clouds' drifting frame
    if (isort(drawOrder, cloudFar)) reordered = true;
    sortAge += dt;
    if (!(reordered && sortAge > 0.5) && (rx - sortedAt.x) ** 2 + (camPos.y - sortedAt.y) ** 2 + (camPos.z - sortedAt.z) ** 2 < step * step) return;
    sortedAt.set(rx, camPos.y, camPos.z);
    reordered = false; sortAge = 0;
    const dst = puffs.instanceMatrix.array, dSpan = spanAttr.array;
    let n = 0;
    for (const ci of drawOrder) {
      const dx = clouds[ci].cx - clouds[ci].x - camPos.x, b = ci * PPC;
      for (let j = b; j < b + PPC; j++) puffFar[j] = -((baseMat[j * 16 + 12] + dx) ** 2 + (baseMat[j * 16 + 13] - camPos.y) ** 2 + (baseMat[j * 16 + 14] - camPos.z) ** 2);
      isort(puffOrder, puffFar, b, b + PPC);
      for (let i = b; i < b + PPC; i++, n++) {
        const j = puffOrder[i];
        for (let k = 0; k < 16; k++) dst[n * 16 + k] = baseMat[j * 16 + k];
        for (let k = 0; k < 4; k++) dSpan[n * 4 + k] = span[j * 4 + k];
      }
    }
    puffs.instanceMatrix.needsUpdate = spanAttr.needsUpdate = true;
  };

  return {
    groundAt, slopeAt, hitObstacle, heightTex, colorTex, stripAt, nearestStrip, approaches, chimneys, setTime,
    update(dt, camera, planePos) {
      time.value += dt;
      drift.value += 4 * dt;
      sky.position.copy(camera.position);
      updateShadow(camera, planePos);
      updateLod(camera.position);
      updateClouds(camera.position, dt);
      blades.rotation.z += dt * 0.6;
      const wYaw = Math.atan2(-wind.vec.z, wind.vec.x), droop = -(1 - Math.min(1, wind.now / 9)) * 1.2;
      for (const { sock, heading } of socks) {
        const flutter = Math.min(1, wind.now / 4) * 0.06;
        sock.rotation.set(0, wYaw - heading + Math.sin(time.value * 2.1) * flutter, droop + Math.sin(time.value * 3.3) * flutter, 'YXZ');
      }
    },
    setQuality(q) {
      if (sun.shadow.mapSize.x !== q.shadow) {
        sun.shadow.mapSize.set(q.shadow, q.shadow);
        sun.shadow.map?.dispose();
        sun.shadow.map = null;
      }
      for (const m of terrain.children) m.castShadow = q.terrainShadow;
    },
  };
}
// Broadleaf canopy: several blobs, normals blended toward the canopy centre for soft painterly shading
export function blobCanopy() {
  const blobs = [[0, 0, 0, 1], [0.65, 0.25, 0.2, 0.72], [-0.6, 0.2, -0.25, 0.75], [0.1, 0.55, -0.55, 0.62], [-0.15, 0.45, 0.6, 0.6], [0, 0.85, 0, 0.55]];
  const g = mergeGeometries(blobs.map(([x, y, z, r]) => new THREE.IcosahedronGeometry(r, 2).translate(x, y, z)));
  const p = g.attributes.position, n = g.attributes.normal, v = new THREE.Vector3(), w = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.set(p.getX(i), p.getY(i) - 0.2, p.getZ(i)).normalize();
    w.set(n.getX(i), n.getY(i), n.getZ(i)).multiplyScalar(0.4).addScaledVector(v, 0.6).normalize();
    n.setXYZ(i, w.x, w.y, w.z);
  }
  return g;
}

// Pine: three stacked cones, unit height
function tieredPine() {
  return mergeGeometries([
    new THREE.ConeGeometry(1, 0.5, 8).translate(0, 0.25, 0),
    new THREE.ConeGeometry(0.78, 0.45, 8).translate(0, 0.5, 0),
    new THREE.ConeGeometry(0.55, 0.4, 8).translate(0, 0.8, 0),
  ]);
}
