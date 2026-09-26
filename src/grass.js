import * as THREE from 'three';
import { HALF, SEG, CELL, WATER, STRIPS } from './world.js';
import { time, cloudUniform, CLOUD_SHADOW, atmo } from './style.js';

// Ground cover near the camera: grass tufts and flower clusters in a tile that wraps around the camera.
// Placement, terrain height, colour and wind all happen on the GPU, so the CPU cost is one uniform per frame.
const TILE = 160, GRASS = 26000, FLOWERS = 5000;

// GLSL: 1.0 on any landing strip (kept mown / clear)
const ON_STRIP = STRIPS.map((s) => `max(step(abs(dot(wp - vec2(${s.x.toFixed(1)}, ${s.z.toFixed(1)}), vec2(${s.fx.toFixed(4)}, ${s.fz.toFixed(4)}))), ${(s.len / 2 + 2).toFixed(1)})
      * step(abs(dot(wp - vec2(${s.x.toFixed(1)}, ${s.z.toFixed(1)}), vec2(${(-s.fz).toFixed(4)}, ${s.fx.toFixed(4)}))), ${(s.w / 2 + 1).toFixed(1)}), `).join('') + '0.0' + ')'.repeat(STRIPS.length);

function tuftGeometry() {
  // Three leaning blades, unit height
  const pos = [];
  for (let b = 0; b < 3; b++) {
    const a = (b / 3) * Math.PI * 2 + 0.3, ca = Math.cos(a), sa = Math.sin(a);
    const w = 0.07, lean = 0.25;
    pos.push(-sa * w, 0, ca * w, sa * w, 0, -ca * w, ca * lean, 1, sa * lean);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return g;
}

function flowerGeometry() {
  // Small flattened head on a short invisible stem (raised so it sways like a tip)
  return new THREE.IcosahedronGeometry(0.09, 0).scale(1, 0.6, 1).translate(0, 0.42, 0);
}

function material(heightTex, colorTex, flower) {
  return new THREE.ShaderMaterial({
    fog: true,
    side: THREE.DoubleSide,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uHeight: { value: null }, uColor: { value: null }, uCam: { value: new THREE.Vector3() } }]),
    vertexShader: /* glsl */ `
      uniform sampler2D uHeight;
      uniform sampler2D uColor;
      uniform vec3 uCam;
      uniform float uTime;
      attribute vec4 aOff; // tile x, tile z, rotation, scale
      varying vec3 vCol;
      varying float vTip;
      varying vec3 vW;
      #include <fog_pars_vertex>
      float heightAt(vec2 p) {
        vec2 g = clamp((p + ${HALF.toFixed(1)}) / ${CELL.toFixed(4)}, vec2(0.0), vec2(${SEG - 1}.0));
        ivec2 i = ivec2(floor(g));
        vec2 f = fract(g);
        float a = texelFetch(uHeight, i, 0).r, b = texelFetch(uHeight, i + ivec2(1, 0), 0).r;
        float c = texelFetch(uHeight, i + ivec2(0, 1), 0).r, d = texelFetch(uHeight, i + ivec2(1, 1), 0).r;
        return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
      }
      float rnd(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main() {
        vec2 origin = uCam.xz - ${(TILE / 2).toFixed(1)};
        vec2 wp = origin + mod(aOff.xy - origin, ${TILE.toFixed(1)});
        float h = heightAt(wp);
        float slope = abs(heightAt(wp + vec2(3.0, 0.0)) - h) + abs(heightAt(wp + vec2(0.0, 3.0)) - h);
        float keep = (1.0 - smoothstep(${(TILE * 0.3).toFixed(1)}, ${(TILE * 0.48).toFixed(1)}, length(wp - uCam.xz)))
                   * step(${(WATER + 3).toFixed(1)}, h) * step(h, 130.0) * (1.0 - smoothstep(1.2, 2.0, slope))
                   * (1.0 - ${ON_STRIP});
        ${flower ? 'keep *= step(0.6, rnd(floor(wp / 25.0)));  // flowers grow in patches' : ''}
        float s = aOff.w * keep;
        float c = cos(aOff.z), sn = sin(aOff.z);
        vec3 p = position * s;
        p.xz = mat2(c, -sn, sn, c) * p.xz;
        vTip = clamp(position.y * 2.4, 0.0, 1.0);
        float sway = sin(uTime * 2.0 + wp.x * 0.3 + wp.y * 0.2) * 0.5 + sin(uTime * 3.1 + wp.x * 0.11) * 0.3;
        p.xz += vec2(sway, sway * 0.6) * 0.12 * position.y * s;
        vec3 transformed = vec3(wp.x, h - 0.05, wp.y) + p;
        ${flower
          ? `float k = rnd(aOff.xy);
             vCol = k < 0.35 ? vec3(0.95, 0.93, 0.86) : k < 0.6 ? vec3(0.98, 0.78, 0.25) : k < 0.8 ? vec3(0.92, 0.55, 0.62) : vec3(0.62, 0.55, 0.88);
             vTip = 1.0;`
          : `vec2 cuv = ((wp + ${HALF.toFixed(1)}) / ${(2 * HALF).toFixed(1)} * ${SEG}.0 + 0.5) / ${SEG + 1}.0;
             vCol = texture2D(uColor, cuv).rgb * (0.9 + 0.2 * rnd(aOff.xy));`}
        vW = transformed;
        gl_Position = projectionMatrix * viewMatrix * vec4(transformed, 1.0);
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vCol;
      varying float vTip;
      varying vec3 vW;
      #include <fog_pars_fragment>
      ${CLOUD_SHADOW}
      void main() {
        vec3 base = vCol * mix(0.62, 1.12, vTip);
        vec3 tint = mix(uRampMid, uRampShadow, cloudShadow(vW) * 0.85);
        gl_FragColor = vec4(base * tint, 1.0);
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
}

export function createGroundCover(scene, world) {
  const make = (geo, count, flower, s0, s1) => {
    const g = new THREE.InstancedBufferGeometry().copy(geo);
    const off = new Float32Array(count * 4);
    for (let i = 0; i < count; i++)
      off.set([Math.random() * TILE, Math.random() * TILE, Math.random() * Math.PI * 2, s0 + Math.random() * (s1 - s0)], i * 4);
    g.setAttribute('aOff', new THREE.InstancedBufferAttribute(off, 4));
    g.instanceCount = count;
    const mat = material(world.heightTex, world.colorTex, flower);
    mat.uniforms.uHeight.value = world.heightTex;
    mat.uniforms.uColor.value = world.colorTex;
    mat.uniforms.uTime = time;
    mat.uniforms.uClouds = cloudUniform;
    Object.assign(mat.uniforms, atmo);
    const mesh = new THREE.Mesh(g, mat);
    mesh.frustumCulled = false;
    scene.add(mesh);
    return { mesh, count };
  };
  const layers = [make(tuftGeometry(), GRASS, false, 0.35, 0.8), make(flowerGeometry(), FLOWERS, true, 0.8, 1.2)];
  return {
    update(camPos) { for (const l of layers) l.mesh.material.uniforms.uCam.value.copy(camPos); },
    setDensity(f) { for (const l of layers) { l.mesh.geometry.instanceCount = Math.floor(l.count * f); l.mesh.visible = f > 0; } },
  };
}
