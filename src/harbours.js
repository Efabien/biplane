import * as THREE from 'three';
import { groundAt, slopeAt, addObstacle, STRIPS, ATOLL, SEA_LIGHT, SEAFORT, DOORS } from './world.js';
import { paint, stripeTex } from './style.js';

// Somewhere to live, or a boat to come by, at the mail stops by the sea: Elias rows down from his lighthouse to the
// Beach strip, Juniper's tea house on the Headland, Nell's stilt hut and jetty on the atoll, Oskar's boat at the
// offshore light, and the sea fort's supply launch. Moored boats ride the swell.
const strip = (name) => STRIPS.find((s) => s.name === name);

// Open rowing boat, bow toward local -z: plank hull walls around a wooden floor, a thwart, oars shipped inside
function rowboat(hullHex, len = 4.2, beam = 1.5) {
  const g = new THREE.Group(), L = len / 2, B = beam / 2;
  const outline = (s) => {
    const sh = new THREE.Shape();
    sh.moveTo(-B * s, L * s * 0.95);
    sh.lineTo(B * s, L * s * 0.95);
    sh.quadraticCurveTo(B * s * 1.08, -L * s * 0.2, 0, -L * s);
    sh.quadraticCurveTo(-B * s * 1.08, -L * s * 0.2, -B * s, L * s * 0.95);
    return sh;
  };
  const shell = outline(1);
  shell.holes.push(outline(0.86));
  const extrude = (sh, depth) => new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false, curveSegments: 8 }).rotateX(Math.PI / 2).translate(0, depth, 0);
  const add = (geo, hex, y = 0) => { const m = new THREE.Mesh(geo, paint(hex)); m.position.y = y; m.castShadow = m.receiveShadow = true; g.add(m); return m; };
  add(extrude(shell, 0.7), hullHex);
  add(extrude(outline(0.9), 0.3), 0x7a5a3a);                             // bilge + floorboards, clear of the waterline
  add(new THREE.BoxGeometry(beam * 0.88, 0.06, 0.28), 0x8a6a48, 0.52);    // thwart
  add(new THREE.BoxGeometry(beam * 0.9, 0.08, 0.14), 0xf2ebdc, 0.7).position.z = L * 0.95 - 0.07; // painted transom rail
  for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.07, 0.05, len * 0.72), 0xb89a6a, 0.33).position.x = s * 0.28; // oars
  return g;
}

// Plank jetty on posts: from (x0, z0) toward (dx, dz) for `len` metres, deck `h` above the water
function jetty(scene, x0, z0, dx, dz, len, h = 1.1, w = 1.9) {
  const g = new THREE.Group(), wood = paint(0x6b5238);
  g.position.set(x0 + dx * len / 2, 0, z0 + dz * len / 2);
  g.rotation.y = Math.atan2(dx, dz);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(w, 0.16, len), paint(0xffffff, { map: stripeTex(0x8a6a48, 0x74583c, len / 0.5) }));
  deck.position.y = h;
  const post = new THREE.CylinderGeometry(0.13, 0.15, h + 6, 6).translate(0, (h - 6) / 2, 0);
  for (let t = -len / 2 + 0.4; t <= len / 2; t += 3)
    for (const s of [-1, 1]) { const p = new THREE.Mesh(post, wood); p.position.set(s * (w / 2 - 0.1), 0, t); p.castShadow = true; g.add(p); }
  deck.castShadow = deck.receiveShadow = true;
  g.add(deck);
  scene.add(g);
  return { end: [x0 + dx * len, z0 + dz * len] };
}

// Small timber-framed building: walls, gable roof, door on local +z; stilts lift it off the ground or water
function hut(scene, x, y, z, rot, { w, d, hgt, wall, roof, stilts = 0 }) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = rot;
  const add = (geo, hex, px, py, pz) => { const m = new THREE.Mesh(geo, typeof hex === 'number' ? paint(hex) : hex); m.position.set(px, py, pz); m.castShadow = m.receiveShadow = true; g.add(m); return m; };
  const base = stilts;
  add(new THREE.BoxGeometry(w, hgt, d).translate(0, hgt / 2, 0), wall, 0, base, 0);
  const roofGeo = new THREE.ExtrudeGeometry(new THREE.Shape([new THREE.Vector2(-0.5, 0), new THREE.Vector2(0.5, 0), new THREE.Vector2(0, 1)]), { depth: 1, bevelEnabled: false }).translate(0, 0, -0.5);
  add(roofGeo, roof, 0, base + hgt, 0).scale.set(w * 1.3, w * 0.5, d * 1.2);
  add(new THREE.BoxGeometry(0.9, 1.9, 0.1).translate(0, 0.95, 0), 0x4a3322, w * 0.18, base, d / 2 + 0.05);
  const step = d / 2 + (stilts ? 2.4 : 0.6); // the doorstep (past the platform's step, on stilts)
  DOORS.push({ x: x + w * 0.18 * Math.cos(rot) + step * Math.sin(rot), z: z - w * 0.18 * Math.sin(rot) + step * Math.cos(rot) });
  add(new THREE.BoxGeometry(0.7, 0.6, 0.1), 0x26303c, -w * 0.22, base + hgt * 0.6, d / 2 + 0.05);
  if (stilts) {
    const post = new THREE.CylinderGeometry(0.14, 0.16, stilts + 4, 6).translate(0, (stilts - 4) / 2, 0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(post, 0x5a4632, sx * (w / 2 - 0.2), 0, sz * (d / 2 - 0.2));
    add(new THREE.BoxGeometry(w + 0.2, 0.15, d + 2.2), 0x7a5a3a, 0, base - 0.05, 0.8); // platform, with a step out front
  }
  scene.add(g);
  addObstacle(x, z, Math.max(w, d) * 0.7, y + base + hgt + w * 0.5);
  return g;
}

// Where the strip's side meets the water: march out from (x, z) along (dx, dz) until the ground dips below `level`
function shore(x, z, dx, dz, level = 0.3, max = 300) {
  for (let d = 0; d < max; d += 1) if (groundAt(x + dx * d, z + dz * d) < level) return d;
  return max;
}
// Out from the shore until the water is at least `depth` deep (heights below sea level are stretched 2.5×)
function reach(x, z, dx, dz, depth, max = 45) {
  for (let d = 4; d < max; d += 1) if (groundAt(x + dx * d, z + dz * d) < -depth) return d;
  return max;
}

export function buildHarbours(scene) {
  const moored = []; // boats riding the swell: group, rest height, phase
  const sites = []; // where each harbour went: { name, x, z }
  const moor = (hull, x, z, rot, ph) => {
    const b = rowboat(hull);
    b.position.set(x, -0.22, z); // floorboards just above the water (the sea plane would show through them)
    b.rotation.y = rot;
    scene.add(b);
    moored.push({ b, y: -0.22, rot, ph });
    return b;
  };

  // ---- Beach strip: Elias's boathouse above the tideline, a jetty, and the boat he rows down the coast in ----
  {
    const st = strip('Beach strip'), lx = -st.fz, lz = st.fx; // strip's lateral axis
    const side = groundAt(st.x + lx * 40, st.z + lz * 40) < groundAt(st.x - lx * 40, st.z - lz * 40) ? 1 : -1; // the sea side
    const sx = lx * side, sz = lz * side, along = st.len / 2 - 70; // near the strip's far end, clear of its middle
    const ax = st.x + st.fx * along, az = st.z + st.fz * along, d = shore(ax, az, sx, sz);
    const hx = ax + sx * Math.max(st.w / 2 + 18, d - 9), hz = az + sz * Math.max(st.w / 2 + 18, d - 9);
    sites.push({ name: 'beach', x: hx, z: hz });
    hut(scene, hx, groundAt(hx, hz) - 0.2, hz, Math.atan2(sx, sz), { w: 4.2, d: 5.5, hgt: 2.6, wall: 0x3f6f8a, roof: 0x8a4a35 });
    const jx = ax + sx * d, jz = az + sz * d, L = reach(jx, jz, sx, sz, 1.2);
    const { end } = jetty(scene, jx - sx * 3, jz - sz * 3, sx, sz, L + 3);
    moor(0x2f3f5c, end[0] - st.fx * 1.8 - sx * 1.5, end[1] - st.fz * 1.8 - sz * 1.5, Math.atan2(sx, sz), 0.4); // Elias's navy boat
    const b = rowboat(0xf2ebdc); // a second one drawn up on the sand, keel up to dry
    b.position.set(hx + st.fx * 7, groundAt(hx + st.fx * 7, hz + st.fz * 7) + 0.72, hz + st.fz * 7);
    b.rotation.set(Math.PI, Math.atan2(st.fx, st.fz) + 0.3, 0);
    scene.add(b);
  }

  // ---- Headland: Juniper's tea house beside the strip's inland end, with a veranda and tables outside ----
  {
    const st = strip('Headland'), lx = -st.fz, lz = st.fx;
    let best = null;
    for (const side of [1, -1]) for (let a = 40; a <= 120; a += 10) for (let l = 45; l <= 75; l += 5) {
      const x = st.x + st.fx * a + lx * side * l, z = st.z + st.fz * a + lz * side * l, s = slopeAt(x, z); // inland (along +heading)
      if (groundAt(x, z) > 20 && (!best || s < best.s)) best = { x, z, s, side };
    }
    sites.push({ name: 'teahouse', x: best.x, z: best.z });
    const rot = Math.atan2(-lx * best.side, -lz * best.side); // front faces the strip
    const g = hut(scene, best.x, groundAt(best.x, best.z) - 0.4, best.z, rot, { w: 7, d: 5.5, hgt: 3, wall: 0xf2e8d2, roof: 0x3f7f6a });
    const add = (geo, hex, x, y, z) => { const m = new THREE.Mesh(geo, paint(hex)); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; g.add(m); return m; };
    add(new THREE.BoxGeometry(8.4, 0.25, 3.2), 0x8a6a48, 0, 0.3, 4.3);                               // veranda
    for (const x of [-3.9, 3.9]) add(new THREE.CylinderGeometry(0.1, 0.1, 2.8, 6), 0xf2e8d2, x, 1.7, 5.7);
    add(new THREE.BoxGeometry(8.6, 0.12, 3.6), 0x3f7f6a, 0, 3.1, 4.3).rotation.x = 0.2;               // veranda awning
    add(new THREE.BoxGeometry(1.6, 0.5, 0.08), 0xf6f1e6, 2.2, 2.3, 2.83);                             // sign board
    for (const [tx, tz] of [[-4, 8.6], [0.5, 9.4], [4.5, 8.4]]) {                                      // tables with parasols
      add(new THREE.CylinderGeometry(0.55, 0.55, 0.06, 12), 0xf2ebdc, tx, 0.95, tz);
      add(new THREE.CylinderGeometry(0.05, 0.05, 2.2, 5).translate(0, 1.1, 0), 0x6b4a2e, tx, 0, tz);
      const para = add(new THREE.ConeGeometry(1.3, 0.6, 8), 0xffffff, tx, 2.35, tz);
      para.material.map = stripeTex(0xc0473a, 0xf6f1e6, 1);
      para.material.map.repeat.set(1, 1);
    }
  }

  // ---- Atoll sandbar: Nell's fisher hut on stilts at the lagoon's edge, her jetty and boat ----
  {
    const st = strip('Atoll sandbar'), lx = -st.fz, lz = st.fx;
    const side = (ATOLL.x - st.x) * lx + (ATOLL.z - st.z) * lz > 0 ? 1 : -1; // the lagoon side
    const sx = lx * side, sz = lz * side, along = -st.len / 2 + 80;
    const ax = st.x + st.fx * along, az = st.z + st.fz * along, d = Math.max(st.w / 2 + 16, shore(ax, az, sx, sz, 0.6));
    const hx = ax + sx * (d + 1), hz = az + sz * (d + 1);
    sites.push({ name: 'atoll', x: hx, z: hz });
    hut(scene, hx, 0, hz, Math.atan2(-sx, -sz), { w: 4, d: 4.5, hgt: 2.4, wall: 0xd9c49a, roof: 0xc9a860, stilts: 1.6 }); // thatch
    const L = reach(hx, hz, sx, sz, 1.2, 30);
    const { end } = jetty(scene, hx + sx * 2.2, hz + sz * 2.2, sx, sz, L, 1.4, 1.5);
    moor(0xe0a33a, end[0] + st.fx * 1.7, end[1] + st.fz * 1.7, Math.atan2(sx, sz) + 0.15, 1.7);
    for (let i = 0; i < 3; i++) { // drying racks with nets on the sand
      const x = hx - sx * (d * 0.5) + st.fx * (i * 3 - 3), z = hz - sz * (d * 0.5) + st.fz * (i * 3 - 3);
      const rack = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.2, 0.05).translate(0, 0.9, 0), paint(0x9a8a6a, { transparent: true, opacity: 0.7 }));
      rack.position.set(x, groundAt(x, z), z);
      rack.rotation.y = Math.atan2(sx, sz);
      scene.add(rack);
    }
  }

  // ---- Offshore light: Oskar's boat, tied up at an iron ladder down the caisson ----
  {
    const a = 1.1, dx = Math.sin(a), dz = Math.cos(a); // in the gap between the shoal's rocks
    const ladder = new THREE.Mesh(new THREE.BoxGeometry(0.7, 7.5, 0.12).translate(0, -0.9, 0), paint(0x3a3a3a));
    ladder.position.set(SEA_LIGHT.x + dx * 7.3, 3.2, SEA_LIGHT.z + dz * 7.3);
    ladder.rotation.y = a;
    ladder.rotation.x = -0.1;
    scene.add(ladder);
    moor(0x3f6f5a, SEA_LIGHT.x + dx * 10.8, SEA_LIGHT.z + dz * 10.8, a + Math.PI / 2, 2.9);
  }

  // ---- Sea fort: a landing stage on the rock footing, and the supply launch alongside ----
  {
    const a = -0.9, dx = Math.sin(a), dz = Math.cos(a);
    jetty(scene, SEAFORT.x + dx * 15, SEAFORT.z + dz * 15, dx, dz, 10, 1.3, 3);
    const px = SEAFORT.x + dx * 25, pz = SEAFORT.z + dz * 25;
    const launch = moor(0xa33a2a, px + dz * 2.6, pz - dx * 2.6, a, 3.6);
    launch.scale.set(1.3, 1.2, 1.5);
  }

  sites.push({ name: 'sealight', x: SEA_LIGHT.x, z: SEA_LIGHT.z }, { name: 'seafort', x: SEAFORT.x, z: SEAFORT.z });
  return {
    sites,
    update(t) {
      for (const m of moored) {
        m.b.position.y = m.y + Math.sin(t * 1.1 + m.ph) * 0.12;
        m.b.rotation.set(Math.sin(t * 0.9 + m.ph) * 0.05, m.rot + Math.sin(t * 0.3 + m.ph) * 0.06, Math.sin(t * 1.3 + m.ph * 2) * 0.04);
      }
    },
  };
}
