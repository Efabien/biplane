import * as THREE from 'three';
import { groundAt, addObstacle, blobCanopy, LIGHTHOUSE, CASTLE, RUIN, RAIL } from './world.js';
import { paint, stripeTex } from './style.js';

// Landmarks to fly to: coastal lighthouse, ridge castle, floating ruin over the lake, railway viaduct with a steam train.
export function buildLandmarks(scene, smoke) {
  const stone = paint(0xd9cfb8), roofRed = paint(0xb5533c), dark = paint(0x3a3a3a), cream = paint(0xf2e8d2);
  const add = (geo, mat, x, y, z, parent) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  const group = (x, y, z, ry = 0) => { const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; scene.add(g); return g; };
  const roofGeo = new THREE.ExtrudeGeometry(new THREE.Shape([new THREE.Vector2(-0.5, 0), new THREE.Vector2(0.5, 0), new THREE.Vector2(0, 1)]), { depth: 1, bevelEnabled: false }).translate(0, 0, -0.5);

  // ---- Lighthouse on the east headland, with the keeper's cottage ----
  {
    const { x, z } = LIGHTHOUSE, gy = groundAt(x, z) - 1;
    const g = group(x, gy, z, 0.4);
    add(new THREE.CylinderGeometry(2.0, 2.8, 22, 18).translate(0, 11, 0), paint(0xffffff, { map: stripeTex(0xc4453a, 0xf6f1e6, 4) }), 0, 0, 0, g);
    add(new THREE.CylinderGeometry(3.0, 3.0, 0.5, 18), dark, 0, 22.2, 0, g);
    add(new THREE.TorusGeometry(3.0, 0.07, 4, 28).rotateX(Math.PI / 2), dark, 0, 23.2, 0, g);
    add(new THREE.CylinderGeometry(1.6, 1.6, 2.4, 14), paint(0xfff1c4, { emissive: 0x5a4a28 }), 0, 23.7, 0, g);
    add(new THREE.ConeGeometry(2.0, 2.2, 14), roofRed, 0, 26, 0, g);
    add(new THREE.BoxGeometry(7, 4, 6).translate(0, 2, 0), cream, 7, 0, 4, g);
    const roof = add(roofGeo, roofRed, 7, 4, 4, g);
    roof.scale.set(7.8, 2.6, 6.6);
    addObstacle(x, z, 3.5, gy + 28);
    addObstacle(x + 7, z + 4, 5, gy + 7);
  }

  // ---- Castle on the south-east ridge: keep, four round towers, curtain walls ----
  {
    const { x, z } = CASTLE, top = groundAt(x, z), ry = 0.3, c = Math.cos(ry), s = Math.sin(ry);
    const w = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
    const g = group(x, 0, z, ry);
    const base = (lx, lz) => { const [wx, wz] = w(lx, lz); return groundAt(wx, wz) - 6; }; // sink every part into the slope
    const keepB = base(0, 0);
    add(new THREE.BoxGeometry(12, 1, 12).translate(0, 0.5, 0), stone, 0, keepB, 0, g).scale.y = top + 24 - keepB;
    const crenel = new THREE.BoxGeometry(1.4, 1.4, 1.4);
    for (let i = -2; i <= 2; i++) for (const [a, b] of [[i * 2.6, 5.4], [i * 2.6, -5.4], [5.4, i * 2.6], [-5.4, i * 2.6]]) add(crenel, stone, a, top + 24.7, b, g);
    const T = 17;
    for (const [lx, lz] of [[T, T], [T, -T], [-T, T], [-T, -T]]) {
      const b = base(lx, lz), h = top + 17 - b;
      add(new THREE.CylinderGeometry(3.6, 4.0, h, 14).translate(0, h / 2, 0), stone, lx, b, lz, g);
      add(new THREE.ConeGeometry(4.6, 7, 14), roofRed, lx, top + 20.5, lz, g);
      addObstacle(...w(lx, lz), 5, top + 24);
    }
    for (const [lx, lz, len, rot] of [[0, T, 2 * T, 0], [0, -T, 2 * T, 0], [T, 0, 2 * T, Math.PI / 2], [-T, 0, 2 * T, Math.PI / 2]]) {
      const b = base(lx, lz), h = top + 9 - b;
      add(new THREE.BoxGeometry(len, h, 2.4).translate(0, h / 2, 0), stone, lx, b, lz, g).rotation.y = rot;
      for (let k = -2; k <= 2; k++) {
        const along = (k / 2) * T;
        addObstacle(...w(rot ? lx : along, rot ? along : lz), 2.5, top + 9);
      }
    }
    add(new THREE.CylinderGeometry(0.1, 0.1, 6, 6), dark, 0, top + 27, 0, g);
    const flag = new THREE.BufferGeometry();
    flag.setAttribute('position', new THREE.Float32BufferAttribute([0, top + 29.8, 0, 0, top + 28.2, 0, 2.6, top + 29, 0], 3));
    flag.computeVertexNormals();
    add(flag, paint(0x3f6f9a, { side: THREE.DoubleSide }), 0, 0, 0, g);
    addObstacle(x, z, 9, top + 30);
  }

  // ---- Floating ruin above the lake: rocky underside, meadow top, broken columns, a giant tree ----
  const ruin = group(RUIN.x, RUIN.y, RUIN.z);
  {
    const rock = new THREE.ConeGeometry(38, 55, 12, 5).rotateX(Math.PI).translate(0, -27.5, 0);
    const p = rock.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      if (y < -1) { const f = 0.78 + Math.random() * 0.4; p.setXYZ(i, p.getX(i) * f, y * (0.9 + Math.random() * 0.15), p.getZ(i) * f); }
    }
    rock.computeVertexNormals();
    add(rock, paint(0x8c7b66, { flatShading: true }), 0, 0, 0, ruin);
    add(new THREE.CylinderGeometry(40, 38, 5, 16).translate(0, -2.5, 0), paint(0x8fc25a), 0, 0, 0, ruin);
    const col = new THREE.CylinderGeometry(1.2, 1.3, 1, 10).translate(0, 0.5, 0), ruinStone = paint(0xe2d8c2);
    [[14, 0, 11], [9.9, 9.9, 5], [0, 14, 8], [-9.9, 9.9, 12], [-14, 0, 4], [-9.9, -9.9, 12], [0, -14, 12], [9.9, -9.9, 6]].forEach(([a, b, h]) => {
      add(col, ruinStone, a, 0, b, ruin).scale.y = h;
    });
    add(new THREE.BoxGeometry(11.5, 1.6, 2.6), ruinStone, -4.95, 12.8, -11.95, ruin).rotation.y = 0.39; // lintel on two columns
    add(new THREE.CylinderGeometry(1.2, 1.9, 12, 8).translate(0, 6, 0), paint(0x6b4a2e), 0, 0, 0, ruin);
    add(blobCanopy(), paint(0x5f9e45, {}, { wind: true }), 0, 16, 0, ruin).scale.setScalar(8);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + Math.random() * 0.4, r = 33 + Math.random() * 4;
      add(new THREE.ConeGeometry(0.5, 8 + Math.random() * 10, 4).rotateX(Math.PI), paint(0x5b6b3a), Math.cos(a) * r, -8, Math.sin(a) * r, ruin);
    }
    addObstacle(RUIN.x, RUIN.z, 40, RUIN.y + 28, RUIN.y - 22);
    addObstacle(RUIN.x, RUIN.z, 20, RUIN.y - 20, RUIN.y - 58);
  }

  // ---- Railway: stone viaduct across the valley, tunnel portals, track, steam train ----
  const { cx, cz, fx, fz, deck, s1, s2 } = RAIL;
  const rail = group(cx, 0, cz, Math.atan2(fx, fz)); // local +Z runs along the line (s), local X across it
  const at = (s) => [cx + fx * s, cz + fz * s];
  const len = s2 - s1 + 8, mid = (s1 + s2) / 2;
  add(new THREE.BoxGeometry(7, 0.8, len), stone, 0, deck, mid, rail);
  for (const x of [-0.75, 0.75]) add(new THREE.BoxGeometry(0.12, 0.18, len), dark, x, deck + 0.49, mid, rail);
  const nSleepers = Math.floor(len / 0.9) + 1;
  const sleepers = new THREE.InstancedMesh(new THREE.BoxGeometry(2.6, 0.12, 0.3), paint(0x6b4a2e), nSleepers);
  const dummy = new THREE.Object3D();
  let n = 0;
  for (; n < nSleepers; n++) { dummy.position.set(0, deck + 0.44, s1 - 4 + n * 0.9); dummy.updateMatrix(); sleepers.setMatrixAt(n, dummy.matrix); }
  sleepers.count = n;
  rail.add(sleepers);

  // Piers every 24 m where the valley drops away, with a semicircular arch between neighbours
  const SPAN = 24, archShape = new THREE.Shape();
  archShape.moveTo(-SPAN / 2, -12); archShape.lineTo(-SPAN / 2, 0); archShape.lineTo(SPAN / 2, 0); archShape.lineTo(SPAN / 2, -12);
  archShape.absarc(0, -12, SPAN / 2 - 1.6, 0, Math.PI, false);
  const archGeo = new THREE.ExtrudeGeometry(archShape, { depth: 7, bevelEnabled: false, curveSegments: 16 }).translate(0, 0, -3.5).rotateY(Math.PI / 2);
  const piers = [];
  for (let s = s1; s <= s2; s += SPAN) { const g = groundAt(...at(s)); if (g < deck - 4) piers.push([s, g]); }
  for (const [s, g] of piers) {
    const h = deck - g + 3;
    add(new THREE.BoxGeometry(7, h, 3.2).translate(0, h / 2, 0), stone, 0, g - 3, s, rail);
    addObstacle(...at(s), 3, deck + 1);
  }
  for (let i = 0; i + 1 < piers.length; i++) add(archGeo, stone, 0, deck - 0.4, piers[i][0] + SPAN / 2, rail);
  if (piers.length) {
    const a = piers[0][0] - SPAN / 2, b = piers[piers.length - 1][0] + SPAN / 2;
    for (const x of [-3.3, 3.3]) add(new THREE.BoxGeometry(0.5, 1, b - a), stone, x, deck + 0.9, (a + b) / 2, rail);
    for (let s = a; s <= b; s += 10) addObstacle(...at(s), 4, deck + 1.5, deck - 2.5); // deck only: you can fly under the arches
  }
  // Tunnel portals facing the valley
  for (const [s, face] of [[s1, 1], [s2, -1]]) {
    add(new THREE.BoxGeometry(18, 14, 3), stone, 0, deck + 5, s, rail);
    add(new THREE.BoxGeometry(5.5, 5.5, 0.3), paint(0x1e1a18), 0, deck + 3.2, s + face * 1.6, rail);
    add(new THREE.CylinderGeometry(2.75, 2.75, 0.3, 14, 1, false, -Math.PI / 2, Math.PI).rotateX(-Math.PI / 2), paint(0x1e1a18), 0, deck + 5.95, s + face * 1.6, rail);
    addObstacle(...at(s), 9, deck + 12);
  }

  // Steam locomotive + three carriages; loops through the hills (hidden in the tunnels)
  const green = paint(0x2f5a46), red = paint(0xa33a2a), maroon = paint(0x7a2e2e), black = paint(0x262626);
  const loco = new THREE.Group();
  add(new THREE.BoxGeometry(2.4, 0.5, 7), black, 0, 0.8, 0, loco);
  add(new THREE.CylinderGeometry(1.1, 1.1, 5, 14).rotateX(Math.PI / 2), green, 0, 2.0, 0.8, loco);
  add(new THREE.CylinderGeometry(1.12, 1.12, 0.6, 14).rotateX(Math.PI / 2), black, 0, 2.0, 3.3, loco);
  add(new THREE.CylinderGeometry(0.35, 0.45, 1.3, 10), black, 0, 3.5, 2.6, loco);
  add(new THREE.BoxGeometry(2.6, 2.6, 2.2), green, 0, 2.3, -2.4, loco);
  add(new THREE.BoxGeometry(2.9, 0.2, 2.6), black, 0, 3.7, -2.4, loco);
  add(new THREE.BoxGeometry(2.6, 0.5, 0.3), red, 0, 0.9, 3.6, loco);
  const wheel = new THREE.CylinderGeometry(0.7, 0.7, 0.2, 14).rotateZ(Math.PI / 2);
  for (const x of [-1.05, 1.05]) for (const zz of [-1.6, 0.3, 2.1]) add(wheel, red, x, 0.7, zz, loco);
  const carGeo = [new THREE.BoxGeometry(2.62, 1.0, 8), new THREE.BoxGeometry(2.6, 1.5, 8), new THREE.BoxGeometry(2.64, 0.6, 7), new THREE.BoxGeometry(2.9, 0.3, 8.3)];
  const cars = [loco];
  for (let i = 0; i < 3; i++) {
    const car = new THREE.Group();
    add(carGeo[0], maroon, 0, 1.4, 0, car);
    add(carGeo[1], cream, 0, 2.65, 0, car);
    add(carGeo[2], paint(0x3a4450), 0, 2.8, 0, car);
    add(carGeo[3], paint(0x6d6a66), 0, 3.55, 0, car);
    for (const zz of [-2.8, 2.8]) add(new THREE.BoxGeometry(2.2, 0.6, 1.6), black, 0, 0.6, zz, car);
    cars.push(car);
  }
  cars.forEach((c) => rail.add(c));
  const START = s1 - 80, END = s2 + 80, SPEED = 9;
  let sTrain = mid;
  const chimney = new THREE.Vector3(), smokeAcc = { v: 0 };

  return {
    update(dt, t) {
      ruin.position.y = RUIN.y + Math.sin(t * 0.3) * 1.5;
      ruin.rotation.y += dt * 0.01;
      sTrain += SPEED * dt;
      if (sTrain > END) sTrain = START;
      cars.forEach((c, i) => c.position.set(0, deck + 0.6, sTrain - i * 9.6 - (i ? 1 : 0)));
      if (sTrain > s1 && sTrain < s2 + 4) { // puffs only outside the tunnels
        smokeAcc.v += 6 * dt;
        for (; smokeAcc.v >= 1; smokeAcc.v--) {
          loco.localToWorld(chimney.set(0, 4.2, 2.6));
          smoke.spawn(chimney.x, chimney.y, chimney.z, (Math.random() - 0.5) * 0.6, 2.5, (Math.random() - 0.5) * 0.6, 3.5, 1.2, 0.35, 1.2);
        }
      }
    },
  };
}
