import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SUN_DIR, NCS, time, drift, wind, applyTime, cloudUniform, paint, stripeTex, skyMaterial, cloudMaterial, cloudSpriteMaterial, waterMaterial } from './style.js';

export const HALF = 2000, WATER = 0, RUNWAY_H = 15, RW_L = 600, RW_W = 30;
export const SEG = 512, CELL = (HALF * 2) / SEG;
export const GLIDE = (3 * Math.PI) / 180; // standard 3° approach path

// Landing sites. heading = direction of the strip's local -Z (0 = north); aim = aiming point distance from each end.
export const STRIPS = [
  { name: 'Airfield', x: 0, z: 0, heading: 0, len: RW_L, w: RW_W, h: RUNWAY_H, aim: 90, surface: 'dirt' },
  { name: 'Meadow strip', x: -150, z: -920, heading: Math.PI / 2, len: 450, w: 25, h: 32, aim: 70, surface: 'grass' },
  { name: 'Beach strip', x: 425, z: 1775, heading: -1.22, len: 400, w: 22, h: 2, aim: 70, surface: 'sand' },
  // short, rising 5 % toward its heading: land uphill (heading) and take off downhill
  { name: 'Mountain meadow', x: 625, z: -1475, heading: 1.047, len: 250, w: 20, h: 214, aim: 45, surface: 'grass', slope: 0.05 },
];
for (const st of STRIPS) { st.fx = -Math.sin(st.heading); st.fz = -Math.cos(st.heading); st.slope ??= 0; }
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
// Railway: straight line across a valley at a fixed deck height; tunnels at both ends (portals computed below)
export const RAIL = { cx: -650, cz: 1175, dir: (40 * Math.PI) / 180, L: 350, deck: 80 };
RAIL.fx = Math.sin(RAIL.dir); RAIL.fz = Math.cos(RAIL.dir);
export const railS = (x, z) => (x - RAIL.cx) * RAIL.fx + (z - RAIL.cz) * RAIL.fz;
export const railV = (x, z) => -(x - RAIL.cx) * RAIL.fz + (z - RAIL.cz) * RAIL.fx;

// ---- terrain height ------------------------------------------------------
// Rolling hills, a mountain ring, a lake, island falloff into the sea, flattened runway.
function baseHeight(x, z) {
  const r = Math.hypot(x, z) / HALF;
  let h = (fbm(x * 0.0011 + 3.1, z * 0.0011 - 1.7) - 0.42) * 140 + 14;
  const ridge = fbm(x * 0.003 + 11, z * 0.003 + 5);
  h += smooth(0.5, 0.75, r) * (1 - smooth(0.8, 0.92, r)) * ridge * ridge * 750;
  h -= 60 * (1 - smooth(0, 380, Math.hypot(x - 750, z + 650)));
  h += (noise(x * 0.025, z * 0.025) - 0.5) * 3 + (noise(x * 0.06 + 9, z * 0.06) - 0.5) * 1.2; // small bumps
  h += (-35 - h) * smooth(0.9, 1.0, r);
  for (const st of STRIPS) {
    const dv = Math.max(Math.abs(across(st, x, z)) - st.w / 2 - 15, 0), du = Math.max(Math.abs(along(st, x, z)) - st.len / 2 - 30, 0);
    h += (st.h + st.slope * along(st, x, z) - h) * (1 - smooth(0, 160, Math.hypot(du, dv)));
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

const H = new Float32Array((SEG + 1) * (SEG + 1));
for (let j = 0; j <= SEG; j++)
  for (let i = 0; i <= SEG; i++) H[j * (SEG + 1) + i] = rawHeight(-HALF + i * CELL, -HALF + j * CELL);

// Exact height of the rendered terrain triangles (matches PlaneGeometry's diagonal)
export function groundAt(x, z) {
  const gx = (x + HALF) / CELL, gz = (z + HALF) / CELL;
  if (gx < 0 || gz < 0 || gx >= SEG || gz >= SEG) return -35;
  const i = Math.floor(gx), j = Math.floor(gz), fx = gx - i, fz = gz - j;
  const k = j * (SEG + 1) + i;
  const ha = H[k], hb = H[k + SEG + 1], hc = H[k + SEG + 2], hd = H[k + 1];
  return fx + fz <= 1
    ? ha + (hd - ha) * fx + (hb - ha) * fz
    : hc + (hb - hc) * (1 - fx) + (hd - hc) * (1 - fz);
}
export function slopeAt(x, z) {
  return Math.hypot(groundAt(x + 4, z) - groundAt(x - 4, z), groundAt(x, z + 4) - groundAt(x, z - 4)) / 8;
}

// ---- obstacle grid (trees, houses, buildings) ----------------------------
const GCELL = 50, GN = (HALF * 2) / GCELL;
const grid = Array.from({ length: GN * GN }, () => []);
export function addObstacle(x, z, r, top, bottom = -Infinity) {
  const i = Math.floor((x + HALF) / GCELL), j = Math.floor((z + HALF) / GCELL);
  if (i >= 0 && j >= 0 && i < GN && j < GN) grid[j * GN + i].push({ x, z, r, top, bottom });
}
const dynamic = new Map(); // movable obstacles, e.g. the parked plane
export function setDynamicObstacle(key, x, z, r, top) { dynamic.set(key, { x, z, r, top }); }
export function hitObstacle(x, y, z) {
  for (const o of dynamic.values()) if (y - 1 < o.top && (o.x - x) ** 2 + (o.z - z) ** 2 < (o.r + 3) ** 2) return true;
  const ci = Math.floor((x + HALF) / GCELL), cj = Math.floor((z + HALF) / GCELL);
  for (let j = cj - 1; j <= cj + 1; j++) {
    if (j < 0 || j >= GN) continue;
    for (let i = ci - 1; i <= ci + 1; i++) {
      if (i < 0 || i >= GN) continue;
      for (const o of grid[j * GN + i]) {
        if (y - 1 > o.top || y + 1 < o.bottom) continue;
        const dx = o.x - x, dz = o.z - z, rr = o.r + 3;
        if (dx * dx + dz * dz < rr * rr) return true;
      }
    }
  }
  return false;
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

  // Terrain with height/slope vertex colors
  const tGeo = new THREE.PlaneGeometry(HALF * 2, HALF * 2, SEG, SEG).rotateX(-Math.PI / 2);
  const pos = tGeo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const sand = new THREE.Color(0xe2cf9e), grassA = new THREE.Color(0xa8d060), grassB = new THREE.Color(0x5c9a46);
  const rock = new THREE.Color(0x8e8878), snow = new THREE.Color(0xf4f6f8);
  for (let v = 0; v < pos.count; v++) {
    const x = pos.getX(v), z = pos.getZ(v), h = groundAt(x, z), s = slopeAt(x, z);
    pos.setY(v, h);
    const n = fbm(x * 0.01, z * 0.01);
    if (h < 2.5) col.copy(sand);
    else if (h > 250 + n * 60) col.copy(snow);
    else if (h > 140 + n * 40 || s > 0.75) col.copy(rock);
    else col.copy(grassA).lerp(grassB, smooth(0.35, 0.65, n));
    col.toArray(colors, v * 3);
  }
  tGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  tGeo.computeVertexNormals();
  const terrain = new THREE.Mesh(tGeo, paint(0xffffff, { vertexColors: true }, { mottle: true }));
  terrain.receiveShadow = terrain.castShadow = true;
  scene.add(terrain);

  // Grid textures for the GPU ground cover: exact heights + terrain colour (sRGB)
  const heightTex = new THREE.DataTexture(H, SEG + 1, SEG + 1, THREE.RedFormat, THREE.FloatType);
  heightTex.needsUpdate = true;
  const colorData = new Uint8Array(pos.count * 4);
  for (let v = 0; v < pos.count; v++) {
    col.fromArray(colors, v * 3).convertLinearToSRGB();
    colorData.set([col.r * 255, col.g * 255, col.b * 255, 255], v * 4);
  }
  const colorTex = new THREE.DataTexture(colorData, SEG + 1, SEG + 1);
  colorTex.colorSpace = THREE.SRGBColorSpace;
  colorTex.magFilter = colorTex.minFilter = THREE.LinearFilter;
  colorTex.needsUpdate = true;

  // Sea + lake share one water plane; depth under the surface comes from the height grid
  const depthData = new Uint8Array((SEG + 1) * (SEG + 1));
  for (let k = 0; k < depthData.length; k++) depthData[k] = Math.round(Math.min(1, Math.max(0, (WATER - H[k]) / 60)) * 255);
  const depthTex = new THREE.DataTexture(depthData, SEG + 1, SEG + 1, THREE.RedFormat);
  depthTex.magFilter = depthTex.minFilter = THREE.LinearFilter;
  depthTex.needsUpdate = true;
  const water = new THREE.Mesh(new THREE.PlaneGeometry(40000, 40000).rotateX(-Math.PI / 2), waterMaterial(depthTex, HALF, SEG));
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
  const roofShape = new THREE.Shape([new THREE.Vector2(-0.5, 0), new THREE.Vector2(0.5, 0), new THREE.Vector2(0, 1)]);
  const roofGeo = new THREE.ExtrudeGeometry(roofShape, { depth: 1, bevelEnabled: false }).translate(0, 0, -0.5);
  const wallMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), paint(0xffffff), houses.length);
  const roofMesh = new THREE.InstancedMesh(roofGeo, paint(0xffffff), houses.length);
  const roofColors = [0xc0473a, 0x3f7f8c, 0xd98a3d, 0x4d6fa8, 0x9a4f6a];
  const chimneyMesh = new THREE.InstancedMesh(unitBox, paint(0xb8a890), houses.length);
  const chimneys = [];
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
    wallMesh.setColorAt(i, col.setHex(rand() < 0.5 ? 0xf6efe0 : 0xefe3c8));
    roofMesh.setColorAt(i, col.setHex(roofColors[Math.floor(rand() * roofColors.length)]));
    addObstacle(h.x, h.z, Math.max(h.w, h.d) * 0.6, y + h.hgt + 4.5);
  });
  chimneyMesh.count = chimneys.length;
  for (const o of [wallMesh, roofMesh, chimneyMesh]) { o.castShadow = o.receiveShadow = true; scene.add(o); }

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
  const MAX = 3000;
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.25, 0.35, 1, 6).translate(0, 0.5, 0), paint(0x6b4a2e), MAX);
  const rounds = new THREE.InstancedMesh(blobCanopy(), paint(0xffffff, {}, { wind: true }), MAX);
  const pines = new THREE.InstancedMesh(tieredPine(), paint(0xffffff, {}, { wind: true }), MAX);
  let nT = 0, nR = 0, nP = 0;
  const addTree = (x, z, s, pine) => {
    const h = groundAt(x, z);
    place(trunks, nT++, x, h - 0.3, z, s, 3.2 * s, s);
    col.setHSL(0.22 + rand() * 0.08, 0.45 + rand() * 0.17, 0.30 + rand() * 0.12);
    if (pine) {
      place(pines, nP, x, h + 1.8 * s, z, 2.2 * s, 7 * s, 2.2 * s, rand() * 6);
      pines.setColorAt(nP++, col.offsetHSL(0.05, -0.05, -0.07));
    } else {
      place(rounds, nR, x, h + 4.4 * s, z, 2.4 * s, 2.4 * s, 2.4 * s, rand() * 6);
      rounds.setColorAt(nR++, col);
    }
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
  trunks.count = nT; rounds.count = nR; pines.count = nP;
  for (const o of [trunks, rounds, pines]) { o.castShadow = o.receiveShadow = true; scene.add(o); }

  // Clouds: towering cumulus of many smaller puffs; flat bottoms, bumps and drift happen in the shader
  const NC = 40, PPC = 24, WRAP = HALF + 400;
  const puffGeo = new THREE.SphereGeometry(1, 20, 14);
  const span = new Float32Array(NC * PPC * 4);
  const puffs = new THREE.InstancedMesh(puffGeo, cloudMaterial(WRAP), NC * PPC);
  const clouds = [], mist = [];
  let pi = 0;
  for (let c = 0; c < NC; c++) {
    const W = 25 + rand() ** 1.5 * 70, B = 240 + rand() * 140, tall = W * (0.8 + rand() * 1.0);
    const cx = (rand() * 2 - 1) * HALF, cz = (rand() * 2 - 1) * HALF;
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
    clouds.push({ x: cx, z: cz, W, B, d: 0 });
  }
  const spanAttr = new THREE.InstancedBufferAttribute(span.slice(), 4).setUsage(THREE.DynamicDrawUsage);
  puffGeo.setAttribute('aSpan', spanAttr);
  puffs.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const baseMat = puffs.instanceMatrix.array.slice(); // unsorted source data
  const puffCloud = new Uint16Array(NC * PPC).map((_, i) => Math.floor(i / PPC));
  const puffOrder = Array.from({ length: NC * PPC }, (_, i) => i), puffDist = new Float32Array(NC * PPC);
  puffs.frustumCulled = false;
  scene.add(puffs);
  const mistGeo = new THREE.BufferGeometry();
  mistGeo.setAttribute('position', new THREE.Float32BufferAttribute(mist.flatMap((m) => m.slice(0, 3)), 3));
  mistGeo.setAttribute('aSpan', new THREE.Float32BufferAttribute(mist.flatMap((m) => m.slice(3)), 4));
  const mistPoints = new THREE.Points(mistGeo, cloudSpriteMaterial(WRAP));
  mistPoints.frustumCulled = false;
  scene.add(mistPoints);
  const order = clouds.map((_, i) => i);

  // Shadow box: grows with altitude, sits ahead of the camera on the ground, snapped to texels (no shimmer)
  const LX = new THREE.Vector3(), LY = new THREE.Vector3();
  const setTime = (name) => {
    const t = applyTime(name);
    sun.color.setHex(t.sunLight); sun.intensity = t.sunI;
    hemi.color.setHex(t.hemiSky); hemi.groundColor.setHex(t.hemiGround); hemi.intensity = t.hemiI;
    scene.background.setHex(t.horizon);
    scene.fog.density = t.fog;
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

  // Feed the nearest clouds to the cloud-shadow shader
  const updateCloudShadows = (camPos) => {
    for (const c of clouds) {
      c.cx = ((c.x + drift.value + WRAP) % (2 * WRAP) + 2 * WRAP) % (2 * WRAP) - WRAP;
      c.d = (c.cx - camPos.x) ** 2 + (c.z - camPos.z) ** 2;
    }
    order.sort((a, b) => clouds[a].d - clouds[b].d);
    for (let i = 0; i < NCS; i++) {
      const c = clouds[order[i]];
      cloudUniform.value[i].set(c.cx, c.z, c.W, c.B);
    }
    // Sort cloud puffs back-to-front so their soft edges blend correctly
    for (let i = 0; i < puffDist.length; i++) {
      const c = clouds[puffCloud[i]];
      puffDist[i] = (baseMat[i * 16 + 12] + c.cx - c.x - camPos.x) ** 2 + (baseMat[i * 16 + 13] - camPos.y) ** 2 + (baseMat[i * 16 + 14] - camPos.z) ** 2;
    }
    puffOrder.sort((a, b) => puffDist[b] - puffDist[a]);
    const dst = puffs.instanceMatrix.array, dSpan = spanAttr.array;
    for (let i = 0; i < puffOrder.length; i++) {
      const j = puffOrder[i];
      for (let k = 0; k < 16; k++) dst[i * 16 + k] = baseMat[j * 16 + k];
      for (let k = 0; k < 4; k++) dSpan[i * 4 + k] = span[j * 4 + k];
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
      updateCloudShadows(camera.position);
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
      terrain.castShadow = q.terrainShadow;
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
