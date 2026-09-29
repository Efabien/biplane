import * as THREE from 'three';
import { groundAt, addObstacle, stripAt, VALE, VALE_POOL, valeXZ, valeRiver, valeRiverWidth } from './world.js';
import { paint, time, atmo, pointScale } from './style.js';
import { AMBIENT_FAR2 } from './smoke.js';

// Pine Vale dressing: the waterfall off the hanging valley and the stream feeding it, boulders in and along
// the river, spray rising from the plunge pool, and fireflies over the water in the low light.
function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Running water: streaks scrolling along uv.y (fall = 1: a veil of white water; 0: the stream's surface)
function flowMaterial(fall, len) {
  const mat = new THREE.ShaderMaterial({
    fog: true, transparent: true, depthWrite: !fall, side: fall ? THREE.DoubleSide : THREE.FrontSide,
    uniforms: THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      #include <fog_pars_vertex>
      void main() {
        vec3 transformed = position;
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      varying vec2 vUv;
      #include <fog_pars_fragment>
      void main() {
        float y = vUv.y * ${len.toFixed(1)}, t = uTime;
        float n = vnoise(vec2(vUv.x * ${fall ? '22.0' : '9.0'}, y * ${fall ? '0.09' : '0.12'} - t * ${fall ? '1.9' : '0.9'})) * 0.6
                + vnoise(vec2(vUv.x * ${fall ? '55.0' : '23.0'}, y * ${fall ? '0.25' : '0.3'} - t * ${fall ? '3.1' : '1.6'})) * 0.4;
        float edge = smoothstep(0.0, 0.14, vUv.x) * smoothstep(1.0, 0.86, vUv.x);
        vec3 lit = mix(uRampMid, uRampLit, 0.4);
        ${fall
          ? `vec3 col = mix(vec3(0.55, 0.7, 0.76), vec3(0.96, 0.98, 1.0), smoothstep(0.3, 0.75, n)) * lit + uGlow * 0.12;
             float a = (0.55 + 0.45 * smoothstep(0.35, 0.6, n)) * edge * smoothstep(0.0, 0.04, vUv.y) * (1.0 - smoothstep(0.88, 1.0, vUv.y) * 0.7);`
          : `vec3 col = mix(vec3(0.12, 0.3, 0.36), vec3(0.85, 0.93, 0.95), smoothstep(0.62, 0.85, n) * 0.8) * lit
                      + hazeColor(normalize(vec3(-1.0, 0.1, 0.0))) * 0.25;
             col = mix(col, vec3(0.92, 0.96, 0.97), smoothstep(0.93, 1.0, vUv.y) * 0.7); // white water at the lip
             float a = mix(0.75, 1.0, edge);`}
        gl_FragColor = vec4(col, a);
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  mat.uniforms.uTime = time;
  Object.assign(mat.uniforms, atmo);
  return mat;
}

// A lumpy boulder: jittered icosahedron, faceted
function boulderGeometry(seed) {
  const r = rng(seed), g = new THREE.IcosahedronGeometry(1, 1), p = g.attributes.position, v = new THREE.Vector3();
  const bumps = new Map();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const key = `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`; // shared corners move together: no cracks
    if (!bumps.has(key)) bumps.set(key, 0.78 + r() * 0.4);
    v.multiplyScalar(bumps.get(key));
    if (v.y < 0) v.y *= 0.6; // flatter underneath
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

export function buildVale(scene, smoke) {
  const vr = rng(53), V = VALE;

  // ---- Stream across the hanging valley, sliding over the lip ----
  const L = 232, SW = 30, lipX = V.x - V.fall;
  // uv.x across, uv.y growing downstream (+x, toward the lip); the far end hangs a metre over the edge
  const stream = new THREE.Mesh(new THREE.PlaneGeometry(SW, L).rotateX(-Math.PI / 2).rotateY(-Math.PI / 2), flowMaterial(false, L));
  stream.position.set(lipX - L / 2 + 1, V.stream, V.z);
  stream.receiveShadow = true;
  scene.add(stream);

  // ---- Waterfall: a veil following the water's arc off the lip, kept clear of the cliff face ----
  const ROWS = 28, T = Math.sqrt((2 * V.stream) / 9.8), VX = 7;
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= ROWS; i++) {
    const s = i / ROWS, t = T * s, y = V.stream - 4.9 * t * t;
    let u = V.fall + 1 - VX * t;
    const half = 7 + 4 * s;
    for (const v of [-half, 0, half]) while (groundAt(...valeXZ(u, v)) > y - 1.5 && u > V.fall - 60) u -= 0.5; // stand off the rock
    const [x] = valeXZ(u, 0);
    for (let j = 0; j <= 4; j++) {
      const f = j / 4, v = (f * 2 - 1) * half;
      pos.push(x + Math.sin(f * Math.PI) * 1.2, Math.max(y, -0.5), V.z + v); // bowed slightly outward mid-veil
      uv.push(f, s);
    }
  }
  for (let i = 0; i < ROWS; i++) for (let j = 0; j < 4; j++) { const a = i * 5 + j, b = a + 5; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  const fallGeo = new THREE.BufferGeometry();
  fallGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  fallGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  fallGeo.setIndex(idx);
  fallGeo.computeBoundingSphere();
  const fall = new THREE.Mesh(fallGeo, flowMaterial(true, V.stream));
  fall.renderOrder = 1;
  scene.add(fall);
  const [poolX, poolZ] = valeXZ(VALE_POOL.u + 22, 0); // where the veil meets the pool

  // ---- Boulders: midstream rocks breaking the surface, banks, the plunge pool, scree on the valley floor ----
  const rocks = [];
  const nearStrip = (x, z) => [[0, 0], [25, 0], [-25, 0], [0, 25], [0, -25]].some(([dx, dz]) => stripAt(x + dx, z + dz));
  const addRock = (u, v, size, sink) => {
    const [x, z] = valeXZ(u, v), g = groundAt(x, z);
    if (nearStrip(x, z)) return;
    const sy = size * (0.5 + vr() * 0.35);
    const y = g < 0 ? 0.25 + vr() * 1.1 - sy * 0.9 : g - sy * sink; // in the water: just the crown breaks the surface
    rocks.push({ x, y, z, sx: size * (0.8 + vr() * 0.5), sy, sz: size * (0.8 + vr() * 0.5), ry: vr() * 6 });
    if (size > 1.5) addObstacle(x, z, size * 0.9, y + sy);
  };
  for (let n = 0; n < 70; n++) { const u = 20 + vr() * (VALE_POOL.u - 40); addRock(u, valeRiver(u) + (vr() * 2 - 1) * valeRiverWidth(u) * 1.1, 1.2 + vr() * 2.6, 0.4); }
  for (let n = 0; n < 150; n++) { const u = vr() * VALE_POOL.u, side = vr() < 0.5 ? -1 : 1; addRock(u, valeRiver(u) + side * (valeRiverWidth(u) + 2 + vr() ** 2 * 30), 0.8 + vr() * 3, 0.35); }
  for (let n = 0; n < 24; n++) { const a = vr() * Math.PI * 2, d = VALE_POOL.r * (0.9 + vr() * 0.5); addRock(VALE_POOL.u + Math.cos(a) * d, Math.sin(a) * d, 2 + vr() * 3.5, 0.35); }
  for (let n = 0; n < 90; n++) addRock(-100 + vr() * 1400, (vr() * 2 - 1) * 380, 1 + vr() * 4, 0.4);
  const geos = [boulderGeometry(3), boulderGeometry(8)], rockMat = paint(0xffffff);
  const dummy = new THREE.Object3D(), col = new THREE.Color();
  geos.forEach((geo, k) => {
    const list = rocks.filter((_, i) => i % 2 === k), mesh = new THREE.InstancedMesh(geo, rockMat, list.length);
    list.forEach((r, i) => {
      dummy.position.set(r.x, r.y, r.z); dummy.rotation.set(0, r.ry, 0); dummy.scale.set(r.sx, r.sy, r.sz); dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, col.setHSL(0.54 + vr() * 0.05, 0.06 + vr() * 0.08, 0.2 + vr() * 0.1));
    });
    mesh.computeBoundingSphere();
    mesh.castShadow = mesh.receiveShadow = true;
    scene.add(mesh);
  });

  // ---- Fireflies: drifting glints over the river and its banks, out at dusk and twilight ----
  const NF = 420, fpos = new Float32Array(NF * 3), fph = new Float32Array(NF);
  for (let i = 0; i < NF; i++) {
    const u = 80 + vr() * (VALE_POOL.u - 60), [x, z] = valeXZ(u, valeRiver(u) + (vr() * 2 - 1) * 90);
    fpos.set([x, Math.max(0.4, groundAt(x, z)) + 0.8 + vr() * 5, z], i * 3);
    fph[i] = vr() * 100;
  }
  const fGeo = new THREE.BufferGeometry();
  fGeo.setAttribute('position', new THREE.BufferAttribute(fpos, 3));
  fGeo.setAttribute('aPh', new THREE.BufferAttribute(fph, 1));
  const fMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: time, uScale: pointScale, uOn: { value: 0 } },
    vertexShader: /* glsl */ `
      uniform float uTime, uScale, uOn;
      attribute float aPh;
      varying float vA;
      void main() {
        vec3 p = position + vec3(sin(uTime * 0.31 + aPh) * 3.0, sin(uTime * 0.53 + aPh * 1.7) * 1.2, cos(uTime * 0.27 + aPh * 0.6) * 3.0);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = uOn > 0.0 ? max(2.0, 0.35 * uScale / -mv.z) : 0.0;
        vA = uOn * pow(0.5 + 0.5 * sin(uTime * (0.8 + fract(aPh) * 1.2) + aPh), 3.0) * (1.0 - smoothstep(250.0, 500.0, -mv.z));
      }`,
    fragmentShader: /* glsl */ `
      varying float vA;
      void main() {
        vec2 c = gl_PointCoord * 2.0 - 1.0;
        float r = dot(c, c);
        if (r > 1.0) discard;
        gl_FragColor = vec4(vec3(1.0, 0.86, 0.45) * (1.0 - r) * (1.0 - r) * vA, 1.0);
      }`,
  });
  const flies = new THREE.Points(fGeo, fMat);
  flies.frustumCulled = false;
  scene.add(flies);

  let sprayAcc = 0;
  return {
    setTime(name) { fMat.uniforms.uOn.value = name === 'twilight' ? 1 : name === 'dusk' ? 0.7 : 0; flies.visible = fMat.uniforms.uOn.value > 0; },
    update(dt, camPos) {
      // spray rising off the plunge pool, only while the camera is near enough to see it
      if ((camPos.x - poolX) ** 2 + (camPos.z - poolZ) ** 2 > AMBIENT_FAR2 * 4) return;
      for (sprayAcc += dt * 7; sprayAcc >= 1; sprayAcc--)
        smoke.spawn(poolX + (vr() - 0.5) * 10, 0.5 + vr() * 3, poolZ + (vr() - 0.5) * 16, 1 + vr() * 2.5, 1 + vr(), (vr() - 0.5) * 2, 4 + vr() * 3, 3.5 + vr() * 2, 0, 1.4);
    },
  };
}
