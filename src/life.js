import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { groundAt, slopeAt, stripAt, WATER, VILLAGE, LIGHTHOUSE, RUIN, SEAFORT, VALE_MEADOWS } from './world.js';
import { paint, time, atmo } from './style.js';
import { AMBIENT_FAR2 } from './smoke.js';

// Calm life: circling bird flocks, sailboats, grazing sheep, deer on the Fells, chimney smoke.
export function createLife(scene, world, smoke) {
  const dummy = new THREE.Object3D();

  // ---- Birds: swept-wing silhouettes that flap in the vertex shader ----
  const birdGeo = new THREE.BufferGeometry();
  birdGeo.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0, 0.35, 0, 0, -0.3, -1, 0.05, -0.2,
    0, 0, -0.3, 0, 0, 0.35, 1, 0.05, -0.2,
  ], 3));
  birdGeo.computeVertexNormals();
  const flocks = [
    { x: -220, z: 180, alt: 55, r: 90, w: 0.12, n: 8, gull: false },
    { x: 520, z: 320, alt: 85, r: 130, w: -0.09, n: 7, gull: false },
    { x: RUIN.x, z: RUIN.z, alt: 120, r: 110, w: 0.1, n: 6, gull: false, abs: true },
    { x: LIGHTHOUSE.x, z: LIGHTHOUSE.z, alt: 40, r: 70, w: -0.16, n: 7, gull: true },
    { x: SEAFORT.x, z: SEAFORT.z, alt: 45, r: 65, w: 0.15, n: 6, gull: true, abs: true },
  ];
  const birdMat = (color) => {
    const m = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide });
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = time;
      Object.assign(sh.uniforms, atmo);
      sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>',
        '#include <begin_vertex>\n  transformed.y += sin(uTime * 9.0 + float(gl_InstanceID) * 1.7) * 0.45 * abs(position.x);');
    };
    m.customProgramCacheKey = () => 'bird';
    return m;
  };
  const birds = [false, true].map((gull) => {
    const list = flocks.filter((f) => f.gull === gull);
    const mesh = new THREE.InstancedMesh(birdGeo, birdMat(gull ? 0xe8e6e0 : 0x3a3a42), list.reduce((a, f) => a + f.n, 0));
    mesh.frustumCulled = false;
    scene.add(mesh);
    for (const f of list) {
      f.y = (f.abs ? 0 : groundAt(f.x, f.z)) + f.alt;
      f.off = Array.from({ length: f.n }, () => [(Math.random() - 0.5) * 24, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 24, Math.random() * 6]);
    }
    return { mesh, list };
  });

  // ---- Sailboats: two on the lake, four along the coast ----
  const mastGeo = new THREE.CylinderGeometry(0.06, 0.08, 6, 5).translate(0, 3.4, 0);
  const sailGeo = new THREE.BufferGeometry();
  sailGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 1, 0.2, 0, 6, 0.2, 0, 1, -2.4, 0, 1, 0.35, 0, 5, 0.35, 0, 1, 2.4], 3));
  sailGeo.computeVertexNormals();
  const sailMat = paint(0xf8f5ec, { side: THREE.DoubleSide }), mastMat = paint(0x6b4a2e);
  const boats = [
    { x: 750, z: -650, r: 150, w: 0.02, hull: 0xf4f1ea }, { x: 750, z: -650, r: 95, w: -0.03, hull: 0x3f6f9a },
    { x: 0, z: 0, r: 2150, w: 0.0013, hull: 0xb5533c }, { x: 0, z: 0, r: 2200, w: -0.0012, hull: 0xf4f1ea },
    { x: 0, z: 0, r: 2120, w: 0.0014, hull: 0x3f6f9a }, { x: 0, z: 0, r: 2250, w: -0.0011, hull: 0x2f5a46 },
  ].map((b, i) => {
    const g = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.8, 5.2), paint(b.hull));
    hull.position.y = 0.3;
    g.add(hull, new THREE.Mesh(mastGeo, mastMat), new THREE.Mesh(sailGeo, sailMat));
    g.children.forEach((c) => { c.castShadow = true; });
    g.scale.setScalar(1.4);
    scene.add(g);
    return { ...b, g, ph: i * 1.3 + 0.4 };
  });

  // ---- Sheep: three herds in the meadows; they wander and graze (legs hidden in the grass) ----
  const bodyGeo = new THREE.IcosahedronGeometry(0.55, 1).scale(1, 0.8, 1.35).translate(0, 0.75, 0);
  const headGeo = new THREE.BoxGeometry(0.3, 0.32, 0.42).translate(0, 0.8, 0.8);
  const sheep = [];
  for (const [hx, hz] of [[-200, 330], [300, 250], [-480, -250]]) {
    for (let tries = 0, n = 0; n < 14 && tries < 200; tries++) {
      const x = hx + (Math.random() - 0.5) * 80, z = hz + (Math.random() - 0.5) * 80;
      if (groundAt(x, z) < 4 || slopeAt(x, z) > 0.3 || stripAt(x, z) || Math.hypot(x - VILLAGE.x, z - VILLAGE.z) < 140) continue;
      sheep.push({ x, z, hx, hz, yaw: Math.random() * 6.28, walk: 0, timer: Math.random() * 5 });
      n++;
    }
  }
  const bodies = new THREE.InstancedMesh(bodyGeo, paint(0xf2eee2), sheep.length);
  const heads = new THREE.InstancedMesh(headGeo, paint(0x3a3230), sheep.length);
  for (const o of [bodies, heads]) { o.castShadow = true; o.frustumCulled = false; scene.add(o); }

  // ---- Deer: small herds grazing the Fells' meadows (world.js picks them). They wander and graze like the sheep,
  // and bolt away from the plane when it comes low over them, bounding with their legs swinging ----
  const deerBody = new THREE.IcosahedronGeometry(0.5, 1).scale(0.9, 0.8, 1.6).translate(0, 1.1, 0);
  const deerHead = mergeGeometries([ // pivoted at the base of the neck (so it can dip to graze): neck, head, muzzle, ears
    new THREE.BoxGeometry(0.2, 0.62, 0.24).translate(0, 0.28, 0).rotateX(-0.45),
    new THREE.BoxGeometry(0.2, 0.22, 0.3).translate(0, 0.6, 0.3),
    new THREE.BoxGeometry(0.13, 0.13, 0.22).translate(0, 0.55, 0.52),
    new THREE.BoxGeometry(0.06, 0.16, 0.03).translate(-0.12, 0.76, 0.22).rotateZ(0.4),
    new THREE.BoxGeometry(0.06, 0.16, 0.03).translate(0.12, 0.76, 0.22).rotateZ(-0.4),
  ]);
  const antlers = mergeGeometries([-1, 1].flatMap((s) => [ // a buck's: beam curving out and back, two tines
    new THREE.BoxGeometry(0.04, 0.5, 0.04).translate(0, 0.25, 0).rotateZ(-s * 0.45).rotateX(0.35).translate(s * 0.07, 0.72, 0.2),
    new THREE.BoxGeometry(0.03, 0.24, 0.03).translate(0, 0.12, 0).rotateZ(-s * 1.1).translate(s * 0.17, 0.96, 0.14),
    new THREE.BoxGeometry(0.03, 0.2, 0.03).translate(0, 0.1, 0).rotateX(-0.9).translate(s * 0.25, 1.1, 0.1),
  ]));
  const deerLeg = new THREE.BoxGeometry(0.1, 0.95, 0.12).translate(0, -0.47, 0); // hangs from the hip
  const deer = [];
  for (const m of VALE_MEADOWS) {
    const n = 4 + Math.floor(Math.random() * 4);
    for (let k = 0, tries = 0; k < n && tries < 60; tries++) {
      const x = m.x + (Math.random() - 0.5) * 44, z = m.z + (Math.random() - 0.5) * 44;
      if (groundAt(x, z) < 4 || slopeAt(x, z) > 0.3) continue;
      deer.push({ x, z, hx: m.x, hz: m.z, yaw: Math.random() * 6.28, walk: 0, timer: Math.random() * 5, flee: 0, buck: k % 3 === 0, ph: Math.random() * 6, run: 0 });
      k++;
    }
  }
  const nBucks = deer.filter((d) => d.buck).length;
  const deerBodies = new THREE.InstancedMesh(deerBody, paint(0xffffff), deer.length);
  const deerHeads = new THREE.InstancedMesh(deerHead, paint(0xffffff), deer.length);
  const deerLegs = new THREE.InstancedMesh(deerLeg, paint(0x5a4432), deer.length * 4);
  const deerAntlers = new THREE.InstancedMesh(antlers, paint(0xd9cdb4), nBucks);
  const hide = new THREE.Color();
  deer.forEach((d, i) => {
    hide.setHSL(0.07 + Math.random() * 0.02, 0.35 + Math.random() * 0.1, 0.3 + Math.random() * 0.1, THREE.SRGBColorSpace);
    deerBodies.setColorAt(i, hide);
    deerHeads.setColorAt(i, hide);
  });
  for (const o of [deerBodies, deerHeads, deerLegs, deerAntlers]) { o.castShadow = true; o.frustumCulled = false; scene.add(o); }
  const _body = new THREE.Matrix4(), _loc = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _one = new THREE.Vector3(1, 1, 1);
  const part = (mesh, idx, x, y, z, rx) => { // a part's matrix: the body's, then a local offset and a pitch
    _loc.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, 0, 0)), _one);
    mesh.setMatrixAt(idx, _loc.premultiply(_body));
  };

  // ---- Chimney smoke ----
  const chimneys = world.chimneys.map((c) => ({ ...c, acc: Math.random() }));

  return {
    update(dt, cam) {
      const t = time.value;
      for (const { mesh, list } of birds) {
        let i = 0;
        for (const f of list) {
          const a = t * f.w, cx = f.x + Math.cos(a) * f.r, cz = f.z + Math.sin(a) * f.r;
          const yaw = Math.atan2(-Math.sin(a) * Math.sign(f.w), Math.cos(a) * Math.sign(f.w));
          const c = Math.cos(yaw), s = Math.sin(yaw);
          for (const [ox, oy, oz, ph] of f.off) {
            dummy.position.set(cx + ox * c + oz * s, f.y + oy + Math.sin(t * 0.7 + ph) * 1.5, cz - ox * s + oz * c);
            dummy.rotation.set(0, yaw, -0.25 * Math.sign(f.w));
            dummy.scale.setScalar(1.3);
            dummy.updateMatrix();
            mesh.setMatrixAt(i++, dummy.matrix);
          }
        }
        mesh.instanceMatrix.needsUpdate = true;
      }

      for (const b of boats) {
        const a = b.ph + t * b.w;
        b.g.position.set(b.x + Math.cos(a) * b.r, WATER + Math.sin(t * 1.3 + b.ph) * 0.1, b.z + Math.sin(a) * b.r);
        b.g.rotation.set(Math.sin(t * 0.8 + b.ph) * 0.03, Math.atan2(-Math.sin(a) * Math.sign(b.w), Math.cos(a) * Math.sign(b.w)), 0.12 * Math.sign(b.w) + Math.sin(t * 1.1 + b.ph) * 0.05, 'YXZ');
      }

      sheep.forEach((sh, i) => {
        sh.timer -= dt;
        if (sh.timer <= 0) { sh.walk = sh.walk ? 0 : 0.35; sh.timer = sh.walk ? 2 + Math.random() * 3 : 4 + Math.random() * 8; sh.yaw += (Math.random() - 0.5) * 2; }
        if (Math.hypot(sh.x - sh.hx, sh.z - sh.hz) > 45) sh.yaw = Math.atan2(sh.hx - sh.x, sh.hz - sh.z); // stay with the herd
        sh.x += Math.sin(sh.yaw) * sh.walk * dt;
        sh.z += Math.cos(sh.yaw) * sh.walk * dt;
        dummy.position.set(sh.x, groundAt(sh.x, sh.z) - 0.1, sh.z);
        dummy.rotation.set(sh.walk ? 0 : 0.12 + Math.sin(t * 2 + i) * 0.05, sh.yaw, 0); // head dips while grazing
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        bodies.setMatrixAt(i, dummy.matrix);
        heads.setMatrixAt(i, dummy.matrix);
      });
      bodies.instanceMatrix.needsUpdate = heads.instanceMatrix.needsUpdate = true;

      let buck = 0;
      deer.forEach((d, i) => {
        const g = groundAt(d.x, d.z), dx = d.x - cam.x, dz = d.z - cam.z, agl = cam.y - g;
        if (dx * dx + dz * dz < 170 * 170 && agl > -5 && agl < 90) { // the plane low overhead: bolt, away from it
          if (d.flee <= 0) d.yaw = Math.atan2(dx, dz) + (Math.random() - 0.5) * 0.8;
          d.flee = 4 + Math.random() * 2;
        }
        let speed;
        if (d.flee > 0) {
          d.flee -= dt;
          speed = 7.5;
          if (Math.hypot(d.x - d.hx, d.z - d.hz) > 160) d.yaw += (Math.atan2(d.hx - d.x, d.hz - d.z) - d.yaw) * 0.02; // bend back toward the meadow
        } else {
          d.timer -= dt;
          if (d.timer <= 0) { d.walk = d.walk ? 0 : 0.5; d.timer = d.walk ? 2 + Math.random() * 3 : 4 + Math.random() * 9; d.yaw += (Math.random() - 0.5) * 2; }
          if (Math.hypot(d.x - d.hx, d.z - d.hz) > 40) d.yaw = Math.atan2(d.hx - d.x, d.hz - d.z); // stay with the herd
          speed = d.walk;
        }
        if (speed) {
          const nx = d.x + Math.sin(d.yaw) * speed * dt, nz = d.z + Math.cos(d.yaw) * speed * dt;
          if (slopeAt(nx, nz) > 0.5 || groundAt(nx, nz) < 3 || world.hitObstacle(nx, g + 1, nz)) d.yaw += 1.2; // a tree, a cliff, the water: swerve
          else { d.x = nx; d.z = nz; }
          d.run += dt * (d.flee > 0 ? 11 : 5);
        }
        const bound = d.flee > 0 ? Math.abs(Math.sin(d.run * 0.5)) * 0.3 : 0, swing = Math.sin(d.run) * (d.flee > 0 ? 0.8 : speed ? 0.45 : 0);
        dummy.position.set(d.x, groundAt(d.x, d.z) + bound, d.z);
        dummy.rotation.set(d.flee > 0 ? -0.08 : 0, d.yaw, 0);
        dummy.scale.setScalar(d.buck ? 1.1 : 1);
        dummy.updateMatrix();
        _body.copy(dummy.matrix);
        deerBodies.setMatrixAt(i, _body);
        part(deerHeads, i, 0, 1.3, 0.55, d.flee > 0 || speed ? 0 : 0.85 + Math.sin(t * 1.6 + i) * 0.1); // head down to graze
        if (d.buck) part(deerAntlers, buck++, 0, 1.3, 0.55, d.flee > 0 || speed ? 0 : 0.85 + Math.sin(t * 1.6 + i) * 0.1);
        part(deerLegs, i * 4, -0.2, 1.05, 0.45, swing);
        part(deerLegs, i * 4 + 1, 0.2, 1.05, 0.45, -swing);
        part(deerLegs, i * 4 + 2, -0.2, 1.05, -0.45, -swing);
        part(deerLegs, i * 4 + 3, 0.2, 1.05, -0.45, swing);
      });
      deerBodies.instanceMatrix.needsUpdate = deerHeads.instanceMatrix.needsUpdate = deerLegs.instanceMatrix.needsUpdate = deerAntlers.instanceMatrix.needsUpdate = true;

      for (const c of chimneys) {
        if ((c.x - cam.x) ** 2 + (c.z - cam.z) ** 2 > AMBIENT_FAR2) continue; // acc stays < 1: no burst on return
        c.acc += 1.1 * dt;
        for (; c.acc >= 1; c.acc--)
          smoke.spawn(c.x + (Math.random() - 0.5) * 0.3, c.y, c.z + (Math.random() - 0.5) * 0.3, 0, 0.8, 0, 6 + Math.random() * 2, 1.4 + Math.random() * 0.4, 0.12, 1.1);
      }
    },
  };
}
