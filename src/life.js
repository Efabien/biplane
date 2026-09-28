import * as THREE from 'three';
import { groundAt, slopeAt, stripAt, WATER, VILLAGE, LIGHTHOUSE, RUIN, SEAFORT } from './world.js';
import { paint, time, atmo } from './style.js';
import { AMBIENT_FAR2 } from './smoke.js';

// Calm life: circling bird flocks, sailboats, grazing sheep, chimney smoke.
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

      for (const c of chimneys) {
        if ((c.x - cam.x) ** 2 + (c.z - cam.z) ** 2 > AMBIENT_FAR2) continue; // acc stays < 1: no burst on return
        c.acc += 1.1 * dt;
        for (; c.acc >= 1; c.acc--)
          smoke.spawn(c.x + (Math.random() - 0.5) * 0.3, c.y, c.z + (Math.random() - 0.5) * 0.3, 0, 0.8, 0, 6 + Math.random() * 2, 1.4 + Math.random() * 0.4, 0.12, 1.1);
      }
    },
  };
}
