import * as THREE from 'three';

// ---- Times of day: sky, light and tint presets (applied at runtime through shared uniforms) ----
export const SUN_DIR = new THREE.Vector3(); // mutated in place by applyTime()
export const PALETTE = { shallow: 0x74d8cc, deep: 0x2b78ad };
const rgb = (r, g, b) => new THREE.Color(r, g, b); // linear values (ramp tints)
export const TIMES = {
  dawn: {
    label: 'Dawn', sun: [0.75, 0.22, -0.3], fog: 0.0006,
    zenith: 0x5a86c4, mid: 0xa9c3e0, horizon: 0xf6d8cf, glow: 0xffb7a0, sunDisc: 0xfff0e6, distTint: 0xa3aed0,
    sunLight: 0xffd2c0, sunI: 2.6, hemiSky: 0xc9d4ec, hemiGround: 0x7b8a62, hemiI: 1.0,
    cloudTop: 0xfff4f2, cloudBase: 0xa9a9c8, cloudWarm: 0xffc7b8,
    ramp: [rgb(0.55, 0.58, 0.8), rgb(1.0, 0.93, 0.9), rgb(1.15, 1.02, 0.95)],
  },
  golden: {
    label: 'Golden hour', sun: [-0.62, 0.4, 0.68], fog: 0.00045,
    zenith: 0x3d7cc9, mid: 0x93c4e6, horizon: 0xf1e2c6, glow: 0xffc68c, sunDisc: 0xfff5e0, distTint: 0x8fa6c4,
    sunLight: 0xffddb4, sunI: 3.2, hemiSky: 0xbcd6f0, hemiGround: 0x7d8f55, hemiI: 1.0,
    cloudTop: 0xfffaf0, cloudBase: 0x9aabc6, cloudWarm: 0xffdcb0,
    ramp: [rgb(0.5, 0.57, 0.78), rgb(1.0, 0.92, 0.8), rgb(1.18, 1.05, 0.86)],
  },
  dusk: {
    label: 'Dusk', sun: [-0.8, 0.12, -0.25], fog: 0.0005,
    zenith: 0x2c4a86, mid: 0x7d8fbf, horizon: 0xf0b98c, glow: 0xff9a5a, sunDisc: 0xffe0b0, distTint: 0x8a86b0,
    sunLight: 0xffb27a, sunI: 2.4, hemiSky: 0x8f9fcc, hemiGround: 0x5e6a48, hemiI: 0.8,
    cloudTop: 0xffe6cc, cloudBase: 0x7f7fa8, cloudWarm: 0xffa870,
    ramp: [rgb(0.42, 0.44, 0.7), rgb(0.95, 0.82, 0.72), rgb(1.2, 0.95, 0.72)],
  },
  // Last light: the sun just over the ridge at the head of the Pine Vale (due west), a teal sky already
  // pricked with stars, a broad gold glow low in the west, blue-teal shadows and deep haze
  twilight: {
    label: 'Twilight', sun: [-1, 0.13, 0.02], fog: 0.0007, stars: 1, glowPow: 2.2, glowAmt: 0.95,
    zenith: 0x10283f, mid: 0x2f6f82, horizon: 0x6f9fa4, glow: 0xffc66e, sunDisc: 0xfff4d0, distTint: 0x4f7896,
    sunLight: 0xffbe7a, sunI: 2.0, hemiSky: 0x6f98b4, hemiGround: 0x2c4238, hemiI: 0.9,
    cloudTop: 0x8fbfd0, cloudBase: 0x2f4a66, cloudWarm: 0xffa66a,
    ramp: [rgb(0.3, 0.46, 0.66), rgb(0.82, 0.86, 0.88), rgb(1.3, 1.0, 0.72)],
  },
};
// Shared by every material (paint, sky, clouds, water, grass, smoke, birds)
export const atmo = Object.fromEntries(
  ['uHorizon', 'uGlow', 'uZenith', 'uMid', 'uSunDisc', 'uDistTint', 'uCloudTop', 'uCloudBase', 'uCloudWarm', 'uRampShadow', 'uRampMid', 'uRampLit']
    .map((k) => [k, { value: new THREE.Color() }]),
);
atmo.uSunDir = { value: SUN_DIR };
// How wide and strong the sun's glow spreads through the haze, and starlight (sky dome only)
Object.assign(atmo, { uGlowPow: { value: 6 }, uGlowAmt: { value: 0.6 }, uStars: { value: 0 } });
export function applyTime(name) {
  const t = TIMES[name];
  SUN_DIR.set(...t.sun).normalize();
  for (const [u, k] of [['uHorizon', 'horizon'], ['uGlow', 'glow'], ['uZenith', 'zenith'], ['uMid', 'mid'], ['uSunDisc', 'sunDisc'], ['uDistTint', 'distTint'],
    ['uCloudTop', 'cloudTop'], ['uCloudBase', 'cloudBase'], ['uCloudWarm', 'cloudWarm']]) atmo[u].value.setHex(t[k]);
  atmo.uRampShadow.value.copy(t.ramp[0]); atmo.uRampMid.value.copy(t.ramp[1]); atmo.uRampLit.value.copy(t.ramp[2]);
  atmo.uGlowPow.value = t.glowPow ?? 6; atmo.uGlowAmt.value = t.glowAmt ?? 0.6; atmo.uStars.value = t.stars ?? 0;
  return t;
}
applyTime('golden');

// ---- Surface wind (from a compass bearing), with gusts. vec = current air velocity (m/s, blowing toward) ----
export const WINDS = { calm: { label: 'Calm', speed: 0, gust: 0 }, light: { label: 'Light', speed: 4, gust: 0.25 }, breezy: { label: 'Breezy', speed: 8, gust: 0.4 } };
export const wind = { from: 340, speed: 4, gust: 0.25, now: 0, vec: new THREE.Vector3() };
export function updateWind(t) {
  const f = 1 + wind.gust * (0.3 * Math.sin(t * 0.37) + 0.2 * Math.sin(t * 1.13 + 1.7) + 0.1 * Math.sin(t * 2.9 + 0.4)); // up to ±60 % of gust
  wind.now = Math.max(0, wind.speed * f);
  const b = THREE.MathUtils.degToRad(wind.from + 180) + wind.gust * 0.18 * Math.sin(t * 0.23 + 0.5);
  wind.vec.set(Math.sin(b) * wind.now, 0, -Math.cos(b) * wind.now);
}

export const time = { value: 0 };   // shared shader clock (wind, water, clouds)
export const drift = { value: 0 };  // total cloud drift along +x (metres)
export const pointScale = { value: 600 }; // pixels per metre at 1 m distance (point sprites)
export const NCS = 8;               // nearest clouds that cast shadows
export const cloudUniform = { value: Array.from({ length: NCS }, () => new THREE.Vector4()) }; // x, z, radius, base

const lin = (hex) => { const c = new THREE.Color(hex); return `vec3(${c.r.toFixed(4)}, ${c.g.toFixed(4)}, ${c.b.toFixed(4)})`; };
const P = PALETTE;
const withAtmo = (u) => Object.assign(u, atmo);

// Shared GLSL: sun direction, value noise, and the haze colour for a view direction.
// The haze is used by the sky dome, fog and water reflections so they all meet seamlessly.
const COMMON = /* glsl */ `
uniform vec3 uSunDir, uHorizon, uGlow, uZenith, uMid, uSunDisc, uDistTint, uCloudTop, uCloudBase, uCloudWarm, uRampShadow, uRampMid, uRampLit;
uniform float uGlowPow, uGlowAmt;
#define SUN_DIR uSunDir
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}
vec3 hazeColor(vec3 d) {
  float s = max(dot(d, SUN_DIR), 0.0);
  return mix(uHorizon, uGlow, pow(max(s, 1e-4), max(uGlowPow, 1.0)) * uGlowAmt); // guarded: stock materials (prop blur) lack these uniforms, and pow(0, 0) is NaN
}
`;

// Soft cloud shadows: project the point toward the sun up to each nearby cloud's base and test its footprint.
export const CLOUD_SHADOW = /* glsl */ `
uniform vec4 uClouds[${NCS}];
float cloudShadow(vec3 p) {
  float s = 0.0;
  for (int i = 0; i < ${NCS}; i++) {
    vec4 c = uClouds[i];
    if (c.z <= 0.0) continue;
    vec2 q = p.xz + SUN_DIR.xz * ((c.w - p.y) / SUN_DIR.y) - c.xy;
    q.y *= 1.4;
    float r = length(q);
    if (r > c.z * 1.2) continue; // the noise moves r by at most ±0.25·c.z; nothing shows past 0.95·c.z
    r += (vnoise(q * 0.04 + c.xy) - 0.5) * c.z * 0.5;
    s = max(s, 1.0 - smoothstep(c.z * 0.5, c.z * 0.95, r));
  }
  return s;
}
`;

// ---- Height fog + aerial perspective (replaces three's fog chunks globally) ----
// Denser in valleys, thinner at altitude; distant land turns blue-grey before fading into the haze.
THREE.ShaderChunk.fog_pars_vertex = /* glsl */ `
#ifdef USE_FOG
  varying vec3 vFogWorld;
#endif`;
THREE.ShaderChunk.fog_vertex = /* glsl */ `
#ifdef USE_FOG
  vec4 fogWP = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    fogWP = instanceMatrix * fogWP;
  #endif
  vFogWorld = (modelMatrix * fogWP).xyz;
#endif`;
THREE.ShaderChunk.fog_pars_fragment = COMMON + /* glsl */ `
#ifdef USE_FOG
  uniform float fogDensity;
  varying vec3 vFogWorld;
#endif`;
THREE.ShaderChunk.fog_fragment = /* glsl */ `
#ifdef USE_FOG
  vec3 fogRay = vFogWorld - cameraPosition;
  float fogDist = length(fogRay);
  float fogH = max(0.0, 0.5 * (vFogWorld.y + cameraPosition.y));
  gl_FragColor.rgb = mix(gl_FragColor.rgb, uDistTint, smoothstep(250.0, 2600.0, fogDist) * 0.35);
  float fogFactor = 1.0 - exp(-fogDist * fogDensity * exp(-fogH * 0.0045));
  gl_FragColor.rgb = mix(gl_FragColor.rgb, hazeColor(fogRay / max(fogDist, 1e-3)), fogFactor);
#endif`;

// Two-colour stripe texture along V (poles, lighthouse bands, mown grass)
export function stripeTex(a, b, ry) {
  const rgb = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255, 255];
  const t = new THREE.DataTexture(new Uint8Array([...rgb(a), ...rgb(b)]), 1, 2);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1, ry);
  t.needsUpdate = true;
  return t;
}

// ---- Painterly material --------------------------------------------------
// Lambert lighting squeezed into soft bands: cool blue shadows, warm mid-tone, warmer lit side.
// Cloud shadows push the surface into the shadow band.
const RAMP = /* glsl */ `
  float albedoL = max(dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114)), 0.02);
  float lightL = dot(outgoingLight - totalEmissiveRadiance, vec3(0.299, 0.587, 0.114)) / albedoL;
  #ifdef USE_FOG
    lightL = mix(lightL, min(lightL, 0.36), cloudShadow(vFogWorld) * 0.9);
  #endif
  vec3 tint = mix(uRampShadow, uRampMid, smoothstep(0.38, 0.50, lightL));
  tint = mix(tint, uRampLit, smoothstep(0.72, 0.86, lightL));
  outgoingLight = diffuseColor.rgb * tint + totalEmissiveRadiance;
  #include <opaque_fragment>`;

// Fine colour mottling in world space so large surfaces don't look flat up close
const MOTTLE = /* glsl */ `
  #include <color_fragment>
  #ifdef USE_FOG
    float mot = vnoise(vFogWorld.xz * 0.11) * 0.6 + vnoise(vFogWorld.xz * 0.43) * 0.4;
    diffuseColor.rgb *= 0.86 + 0.26 * mot;
  #endif`;

// Gentle sway, phase varies per instance; amplitude grows with height in the canopy
const WIND = /* glsl */ `
  #include <begin_vertex>
  #ifdef USE_INSTANCING
    float windPh = instanceMatrix[3].x * 0.05 + instanceMatrix[3].z * 0.07;
  #else
    float windPh = 0.0;
  #endif
  float sway = sin(uTime * 1.4 + windPh) * 0.6 + sin(uTime * 2.3 + windPh * 1.7) * 0.4;
  transformed.xz += vec2(sway, sway * 0.5) * 0.045 * max(position.y + 0.8, 0.0);`;

export function paint(color, opts = {}, { wind = false, mottle = false } = {}) {
  const m = new THREE.MeshLambertMaterial({ color, ...opts });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uClouds = cloudUniform;
    withAtmo(sh.uniforms);
    let fs = sh.fragmentShader
      .replace('#include <fog_pars_fragment>', '#include <fog_pars_fragment>\n' + CLOUD_SHADOW)
      .replace('#include <opaque_fragment>', RAMP);
    if (mottle) fs = fs.replace('#include <color_fragment>', MOTTLE);
    sh.fragmentShader = fs;
    if (wind) {
      sh.uniforms.uTime = time;
      sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', WIND);
    }
  };
  m.customProgramCacheKey = () => `paint-${wind}-${mottle}`;
  return m;
}

// ---- Sky dome: zenith → mid blue → warm horizon, sun disc and halo, drifting cirrus ----
export function skyMaterial() {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: withAtmo({ uTime: time }),
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uTime, uStars;
      varying vec3 vDir;
      #include <fog_pars_fragment>
      float hash13(vec3 p3) { p3 = fract(p3 * 0.1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
      void main() {
        vec3 d = normalize(vDir);
        vec3 col = mix(uMid, uZenith, smoothstep(0.12, 0.85, d.y));
        col = mix(hazeColor(d), col, smoothstep(0.0, 0.22, d.y));
        float s = max(dot(d, SUN_DIR), 0.0);
        col += uGlow * pow(s, 40.0) * 0.25;
        float cirrus = 0.0;
        if (d.y > 0.02) {
          vec2 cuv = d.xz / (d.y + 0.08) * 1.2 + vec2(uTime * 0.004, 0.0);
          vec2 st = vec2(cuv.x * 0.6 + cuv.y * 0.35, cuv.y * 3.0 - cuv.x * 0.8);
          float c = vnoise(st * 1.3) * 0.6 + vnoise(st * 3.1) * 0.3 + vnoise(st * 7.0) * 0.1;
          c = smoothstep(0.55, 0.85, c) * smoothstep(0.02, 0.25, d.y) * 0.55;
          col = mix(col, mix(uCloudTop, uGlow, pow(s, 4.0) * 0.6), c);
          cirrus = c;
        }
        if (uStars > 0.0 && d.y > 0.05) { // stars: one jittered point per direction cell, fading toward the glow
          vec3 g = d * 260.0, cell = floor(g);
          float k = hash13(cell);
          if (k > 0.965) {
            vec3 sp = cell + 0.5 + (vec3(hash13(cell + 7.1), hash13(cell + 3.7), hash13(cell + 1.3)) - 0.5) * 0.5;
            float star = 1.0 - smoothstep(0.08, 0.3, length(g - sp));
            float tw = 0.75 + 0.25 * sin(uTime * (1.5 + k * 40.0) + k * 900.0);
            col += vec3(0.95, 0.97, 1.0) * star * tw * (k - 0.965) / 0.035 * uStars
                 * smoothstep(0.05, 0.35, d.y) * (1.0 - smoothstep(0.2, 0.8, s)) * (1.0 - cirrus * 1.6);
          }
        }
        col = mix(col, uSunDisc, smoothstep(0.9990, 0.9994, s));
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
}

// ---- Cumulus: bumpy puffs flattened at the cloud base, blue-grey underside, bright warm tops ----
// Drift happens in the shader (per-cloud wrap across the map: wrap = { x0, span }), so instance matrices stay static.
export function cloudMaterial(wrap) {
  const mat = new THREE.ShaderMaterial({
    fog: true, transparent: true, depthWrite: false, // puffs are kept sorted back-to-front (world.js)
    uniforms: THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform float uDrift;
      attribute vec4 aSpan; // cloud base altitude, top altitude, centre x
      varying vec3 vN;
      varying vec3 vW;
      varying float vH;
      #include <fog_pars_vertex>
      float hash13(vec3 p3) { p3 = fract(p3 * 0.1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
      float vnoise3(vec3 p) {
        vec3 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(hash13(i), hash13(i + vec3(1, 0, 0)), u.x), mix(hash13(i + vec3(0, 1, 0)), hash13(i + vec3(1, 1, 0)), u.x), u.y),
                   mix(mix(hash13(i + vec3(0, 0, 1)), hash13(i + vec3(1, 0, 1)), u.x), mix(hash13(i + vec3(0, 1, 1)), hash13(i + vec3(1, 1, 1)), u.x), u.y), u.z);
      }
      void main() {
        vec3 transformed = position;
        mat4 m = modelMatrix * instanceMatrix;
        vec4 wp = m * vec4(position, 1.0);
        vec3 wn = normalize(mat3(m) * normal);
        // cauliflower bumps, computed before drift so shapes don't boil while moving
        float bump = vnoise3(wp.xyz * 0.035 + uTime * 0.015) * 0.6 + vnoise3(wp.xyz * 0.09) * 0.4;
        wp.xyz += wn * (bump - 0.4) * length(m[0].xyz) * 0.35;
        float cx = ${wrap.x0.toFixed(1)} + mod(aSpan.z + uDrift - ${wrap.x0.toFixed(1)}, ${wrap.span.toFixed(1)});
        wp.x += cx - aSpan.z;
        wp.y = max(wp.y, aSpan.x + fract(m[3].x * 0.137 + m[3].z * 0.071) * 0.8); // staggered so flat bases don't z-fight
        vH = clamp((wp.y - aSpan.x) / (aSpan.y - aSpan.x), 0.0, 1.0);
        vN = wn;
        vW = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
        #include <fog_vertex>
        #ifdef USE_FOG
          vFogWorld = wp.xyz;
        #endif
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vN;
      varying vec3 vW;
      varying float vH;
      #include <fog_pars_fragment>
      void main() {
        vec3 n = normalize(vN);
        vec3 toCam = cameraPosition - vW;
        // soft, smoke-like edges; fade out near the camera so you fly through mist and the plane stays visible
        float alpha = smoothstep(0.0, 0.5, dot(n, normalize(toCam))) * smoothstep(20.0, 110.0, length(toCam));
        float sunL = dot(n, SUN_DIR) * 0.5 + 0.5;
        float lit = smoothstep(0.3, 0.8, sunL * 0.6 + vH * 0.6);
        vec3 col = mix(uCloudBase, uCloudTop, lit);
        col = mix(col, uCloudWarm, smoothstep(0.7, 1.0, sunL) * 0.45);
        float rim = pow(1.0 - max(dot(n, normalize(cameraPosition - vW)), 0.0), 3.0);
        col += uCloudWarm * rim * 0.3 * smoothstep(0.3, 0.8, sunL);
        gl_FragColor = vec4(col, alpha);
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  mat.uniforms.uTime = time;
  mat.uniforms.uDrift = drift;
  withAtmo(mat.uniforms);
  return mat;
}

// ---- Cloud mist: soft round sprites (same look as the smoke) that soften cloud outlines and bases ----
export function cloudSpriteMaterial(wrap) {
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: true,
    uniforms: THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
    vertexShader: /* glsl */ `
      uniform float uScale;
      uniform float uDrift;
      attribute vec4 aSpan; // cloud base, top, centre x, sprite size
      varying float vH;
      varying float vA;
      #include <fog_pars_vertex>
      void main() {
        vec3 transformed = position;
        transformed.x += ${wrap.x0.toFixed(1)} + mod(aSpan.z + uDrift - ${wrap.x0.toFixed(1)}, ${wrap.span.toFixed(1)}) - aSpan.z;
        vec4 mv = viewMatrix * vec4(transformed, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = aSpan.w * uScale / max(-mv.z, 1.0);
        vH = clamp((transformed.y - aSpan.x) / (aSpan.y - aSpan.x), 0.0, 1.0);
        vA = smoothstep(12.0, 70.0, length(cameraPosition - transformed)); // thin out when inside the cloud
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      varying float vH;
      varying float vA;
      #include <fog_pars_fragment>
      void main() {
        vec2 c = gl_PointCoord * 2.0 - 1.0;
        float r = dot(c, c);
        if (r > 1.0) discard;
        float a = (1.0 - r) * (1.0 - r) * 0.5 * vA;
        float lit = smoothstep(0.0, 1.0, vH * 0.9 - c.y * 0.25 + 0.15);
        vec3 col = mix(uCloudBase, uCloudTop, lit);
        col = mix(col, uCloudWarm, 0.18 * lit);
        gl_FragColor = vec4(col, a);
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  mat.uniforms.uScale = pointScale;
  mat.uniforms.uDrift = drift;
  withAtmo(mat.uniforms);
  return mat;
}

// ---- Stylized water: depth-tinted, soft waves, sky reflection, sun shimmer, shore foam, cloud shadows ----
export function waterMaterial(depthTex, grid) {
  const { x0, z0, cell, segx, segz } = grid;
  const mat = new THREE.ShaderMaterial({
    fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uDepth: { value: null } }]),
    vertexShader: /* glsl */ `
      varying vec3 vW;
      #include <fog_pars_vertex>
      void main() {
        vec3 transformed = position;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vW = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uDepth;
      uniform float uTime;
      varying vec3 vW;
      #include <fog_pars_fragment>
      ${CLOUD_SHADOW}
      void main() {
        vec2 g01 = (vW.xz - vec2(${x0.toFixed(1)}, ${z0.toFixed(1)})) / vec2(${(segx * cell).toFixed(1)}, ${(segz * cell).toFixed(1)});
        vec2 uv = (g01 * vec2(${segx}.0, ${segz}.0) + 0.5) / vec2(${segx + 1}.0, ${segz + 1}.0);
        float depth = (g01.x < 0.0 || g01.y < 0.0 || g01.x > 1.0 || g01.y > 1.0) ? 1.0 : texture2D(uDepth, uv).r;
        if (depth < 0.002) discard; // dry land: kill the fragment so the plane can't z-fight distant shorelines

        vec2 p = vW.xz;
        float t = uTime;
        vec2 grad = vec2(0.8, 0.6) * cos(dot(p, vec2(0.8, 0.6)) * 0.08 + t * 1.1) * 0.08
                  + vec2(-0.5, 0.9) * cos(dot(p, vec2(-0.5, 0.9)) * 0.13 + t * 1.5) * 0.06
                  + vec2(0.95, -0.3) * cos(dot(p, vec2(0.95, -0.3)) * 0.31 + t * 2.1) * 0.04;
        float camDist = length(cameraPosition - vW);
        grad *= 1.0 - smoothstep(150.0, 1200.0, camDist); // fade ripples with distance to avoid aliasing
        vec3 n = normalize(vec3(-grad.x, 1.0, -grad.y));
        vec3 v = normalize(cameraPosition - vW);

        vec3 col = mix(${lin(P.shallow)}, ${lin(P.deep)}, smoothstep(0.0, 0.7, depth));
        col *= 0.85 + 0.25 * max(dot(n, SUN_DIR), 0.0);
        col *= 1.0 - 0.22 * cloudShadow(vW);
        float fres = pow(1.0 - max(dot(n, v), 0.0), 4.0);
        col = mix(col, hazeColor(reflect(-v, n)), fres * 0.6);
        float sunR = max(dot(reflect(-SUN_DIR, n), v), 0.0);
        col += uGlow * pow(sunR, 60.0) * 0.25;                            // soft shimmer path
        col += uSunDisc * step(0.5, pow(sunR, 3000.0)) * 0.3;               // tiny glints
        float foam = smoothstep(0.05, 0.0, depth - 0.008 * sin(t * 0.8 + (p.x + p.y) * 0.05));
        foam *= 1.0 - smoothstep(250.0, 900.0, camDist); // a thin band flickers at distance: fade it out
        col = mix(col, vec3(0.93, 0.95, 0.93), foam * 0.85);

        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  mat.uniforms.uDepth.value = depthTex;
  mat.uniforms.uTime = time;
  mat.uniforms.uClouds = cloudUniform;
  withAtmo(mat.uniforms);
  return mat;
}
