import * as THREE from 'three';
import { pointScale, atmo, wind } from './style.js';

// Shared smoke particles (plane exhaust, crash plume, chimneys, steam train): soft round points that slow to
// the surrounding air, drift with the wind, rise, grow and fade.
const N = 900;
const EXHAUSTS = [new THREE.Vector3(-0.58, -0.28, -1.0), new THREE.Vector3(0.58, -0.28, -1.0)];
const COWL = new THREE.Vector3(0, 0.3, -2.2);
// Ambient emitters (chimneys, train) only puff within this horizontal range of the camera, so far-off
// smoke doesn't churn the ring and evict the plane's exhaust trail
export const AMBIENT_FAR2 = 700 * 700;

export function createSmoke(scene) {
  const pos = new Float32Array(N * 3), vel = new Float32Array(N * 3);
  const age = new Float32Array(N).fill(1), life = new Float32Array(N).fill(1), rise = new Float32Array(N);
  const t = new Float32Array(N).fill(1), k = new Float32Array(N * 2);
  const geo = new THREE.BufferGeometry();
  const posAttr = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage);
  const tAttr = new THREE.BufferAttribute(t, 1).setUsage(THREE.DynamicDrawUsage);
  const kAttr = new THREE.BufferAttribute(k, 2).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', posAttr);
  geo.setAttribute('aT', tAttr);
  geo.setAttribute('aK', kAttr);

  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: true,
    uniforms: THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
    vertexShader: /* glsl */ `
      uniform float uScale;
      attribute float aT;  // normalized age, >= 1 means dead
      attribute vec2 aK;   // size factor, darkness
      varying float vT;
      varying float vDark;
      #include <fog_pars_vertex>
      void main() {
        vec3 transformed = position;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        float size = mix(0.35, 3.2, sqrt(aT)) * aK.x * (1.0 + aK.y * 1.5);
        gl_PointSize = aT >= 1.0 ? 0.0 : size * uScale / -mv.z;
        vT = aT;
        vDark = aK.y;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      varying float vT;
      varying float vDark;
      #include <fog_pars_fragment>
      void main() {
        vec2 c = gl_PointCoord * 2.0 - 1.0;
        float r = dot(c, c);
        if (r > 1.0) discard;
        float a = (1.0 - r) * (1.0 - r) * smoothstep(0.0, 0.08, vT) * (1.0 - vT) * mix(0.22, 0.4, vDark);
        vec3 col = mix(vec3(0.86, 0.84, 0.80), vec3(0.22, 0.21, 0.2), vDark) * (0.92 - 0.12 * c.y); // lighter on top
        gl_FragColor = vec4(col, a);
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  mat.uniforms.uScale = pointScale;
  Object.assign(mat.uniforms, atmo);
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  scene.add(points);

  let next = 0, acc = 0, side = 0;
  // size ≈ 1 for exhaust; dark 0 = white-grey, 1 = charcoal; riseSpeed = final vertical speed (m/s)
  const spawn = (x, y, z, vx, vy, vz, lifeS, size, dark, riseSpeed) => {
    const i = next;
    next = (next + 1) % N;
    pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
    vel[i * 3] = vx; vel[i * 3 + 1] = vy; vel[i * 3 + 2] = vz;
    age[i] = 0; life[i] = lifeS; rise[i] = riseSpeed;
    k[i * 2] = size; k[i * 2 + 1] = dark;
  };

  const p = new THREE.Vector3(), fwd = new THREE.Vector3();
  const rnd = () => Math.random() - 0.5;
  return {
    spawn,
    update(dt, group, flight) {
      // Plane: exhaust trail (thicker with throttle), or a thin dark plume after a crash
      group.updateMatrixWorld();
      const crashed = flight.state === 'crashed';
      acc += (crashed ? 22 : 6 + 44 * flight.throttle) * dt;
      for (; acc >= 1; acc--) {
        if (crashed) {
          group.localToWorld(p.copy(COWL));
          spawn(p.x, p.y, p.z, rnd() * 0.6, 2 + Math.random(), rnd() * 0.6, 5 + Math.random() * 2, 0.8 + Math.random() * 0.4, 0.75, 2.2);
        } else {
          group.localToWorld(p.copy(EXHAUSTS[side ^= 1]));
          p.addScaledVector(flight.vel, -Math.random() * dt); // spread emission within the frame so the trail has no gaps
          fwd.set(0, 0, -1).applyQuaternion(group.quaternion);
          const v = flight.vel;
          spawn(p.x, p.y, p.z,
            v.x * 0.2 - fwd.x * 3 + rnd() * 0.8, v.y * 0.2 - fwd.y * 3 + rnd() * 0.8 + 0.3, v.z * 0.2 - fwd.z * 3 + rnd() * 0.8,
            1.6 + Math.random() * 1.2, 0.8 + Math.random() * 0.4, 0, 0.5);
        }
      }
      // Integrate every live particle
      const damp = 1 - Math.exp(-dt * 1.3);
      for (let i = 0; i < N; i++) {
        if (age[i] >= life[i]) { t[i] = 1; continue; }
        age[i] += dt;
        t[i] = Math.min(1, age[i] / life[i]);
        const j = i * 3;
        vel[j] += (wind.vec.x - vel[j]) * damp;
        vel[j + 1] += (rise[i] - vel[j + 1]) * damp;
        vel[j + 2] += (wind.vec.z - vel[j + 2]) * damp;
        pos[j] += vel[j] * dt;
        pos[j + 1] += vel[j + 1] * dt;
        pos[j + 2] += vel[j + 2] * dt;
      }
      posAttr.needsUpdate = tAttr.needsUpdate = kAttr.needsUpdate = true;
    },
  };
}
