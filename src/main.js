import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { buildWorld, setDynamicObstacle, STRIPS } from './world.js';
import { createGroundCover } from './grass.js';
import { createPlane, syncPlane, LIVERIES } from './plane.js';
import { createSmoke } from './smoke.js';
import { buildLandmarks } from './landmarks.js';
import { createLife } from './life.js';
import { createNav } from './nav.js';
import { time, pointScale, TIMES, WINDS, wind, updateWind } from './style.js';
import { createSound } from './sound.js';
import { Flight, GEAR_H } from './flight.js';
import { Input } from './input.js';
import { Hud } from './hud.js';
import { createAdventure } from './adventure.js';

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, 1, 0.3, 9000);
const world = buildWorld(scene);
const cover = createGroundCover(scene, world);
// Two planes: the one you fly, and the other parked beside its own landing site
const planes = { red: createPlane(LIVERIES.red), blue: createPlane(LIVERIES.blue) };
const HOMES = { red: { strip: STRIPS[0], dir: 1 }, blue: { strip: STRIPS[1], dir: -1 } };
const PARK = { red: { x: 32, z: 250, yaw: 0.5 }, blue: { x: 45, z: -944, yaw: 2.6 } };
let plane = planes.red, started = false, paused = false;
for (const p of Object.values(planes)) scene.add(p.group);
const park = (id) => {
  const p = PARK[id], g = planes[id].group, y = world.groundAt(p.x, p.z);
  g.position.set(p.x, y + GEAR_H, p.z);
  g.quaternion.setFromEuler(new THREE.Euler(0.17, p.yaw, 0, 'YXZ'));
  planes[id].pilot.visible = true;
  setDynamicObstacle('parked', p.x, p.z, 4, y + 3);
};
park('blue');
const smoke = createSmoke(scene);
const landmarks = buildLandmarks(scene, smoke);
const life = createLife(scene, world, smoke);
const nav = createNav();
const _size = new THREE.Vector2();
const flight = new Flight(world);
const sound = createSound();

// ---- Start / pause menu: choose or switch plane, adventure, time of day, wind, sound ----
const menu = document.getElementById('menu'), resumeBtn = document.getElementById('resume');
const advBtn = menu.querySelector('.plane.adv'), quitAdvBtn = document.getElementById('quit-adv'), resetAdvBtn = document.getElementById('reset-adv');
const SUB = menu.querySelector('.sub').textContent;
const settings = { start: 'home', time: 'golden', wind: 'light', sound: 'on' };
let timeNow = settings.time; // what the sky shows: the menu's choice, or an adventure delivery's (e.g. dusk)
let adventure = null; // created below, once the menu and planes it drives exist
const OPTIONS = {
  start: [['home', 'Home strip'], ...STRIPS.map((s, i) => [String(i), s.name])],
  time: Object.entries(TIMES).map(([k, t]) => [k, t.label]),
  wind: Object.entries(WINDS).map(([k, w]) => [k, w.label]),
  sound: [['on', 'On'], ['off', 'Off']],
};
function applySetting(opt, value) {
  settings[opt] = value;
  if (opt === 'time') { world.setTime(value); timeNow = value; updateLamp(); }
  if (opt === 'wind') Object.assign(wind, { speed: WINDS[value].speed, gust: WINDS[value].gust });
  if (opt === 'sound') sound.setEnabled(value === 'on');
  if (opt === 'start') menu.querySelectorAll('.plane[data-plane]').forEach((b) => { b.querySelector('small').textContent = stripLabel(startFor(b.dataset.plane)); });
  menu.querySelectorAll(`[data-opt="${opt}"] button`).forEach((b) => b.classList.toggle('on', b.dataset.value === value));
}
for (const [opt, list] of Object.entries(OPTIONS)) {
  const seg = menu.querySelector(`[data-opt="${opt}"]`);
  for (const [value, label] of list) {
    const b = document.createElement('button');
    b.textContent = label;
    b.dataset.value = value;
    b.addEventListener('click', () => applySetting(opt, value));
    seg.append(b);
  }
  applySetting(opt, settings[opt]);
}
function refreshMenu() {
  menu.querySelectorAll('.plane[data-plane]').forEach((b) => b.classList.toggle('current', started && !adventure.active && planes[b.dataset.plane] === plane));
  advBtn.classList.toggle('current', adventure.active);
  advBtn.querySelector('small').textContent = adventure.active ? 'In progress · resume to carry on' : adventure.summary();
  quitAdvBtn.hidden = !adventure.active;
  resetAdvBtn.hidden = !adventure.hasProgress;
}
function openMenu() {
  paused = true;
  menu.hidden = false;
  menu.querySelector('.sub').textContent = adventure.active ? 'Paused · Island Air Mail' : 'Paused · pick a plane to switch, or resume';
  resumeBtn.hidden = false;
  refreshMenu();
}
function closeMenu() { if (started) { paused = false; menu.hidden = true; } }
// Where a plane starts: its home strip, or the landing site picked under "Start at"
function startFor(id) {
  if (settings.start === 'home') return HOMES[id];
  const strip = STRIPS[+settings.start];
  return { strip, dir: strip.takeoff };
}
function stripLabel({ strip, dir }) {
  const bearing = (THREE.MathUtils.radToDeg(Math.atan2(dir * strip.fx, -dir * strip.fz)) + 360) % 360;
  const rwy = String(Math.round(bearing / 10) || 36).padStart(2, '0');
  return `${strip.name} · ${strip.surface} runway ${rwy}`;
}
// Fly a plane from a given start; the other one goes back to its parking spot
function takeOff(id, start) {
  const other = id === 'red' ? 'blue' : 'red';
  plane.pilot.visible = true;
  plane = planes[id];
  plane.pilot.visible = !cockpit;
  park(other);
  flight.home = start;
  flight.reset();
  snap = true;
  started = true;
  closeMenu();
}
// Free flight with the chosen plane (leaves the adventure; its progress stays saved)
function choose(id) {
  adventure.stop();
  takeOff(id, startFor(id));
}
// Adventure: the red mail plane; resumes at the saved delivery, or carries on if it's already running
function startAdventure() {
  if (adventure.active) { closeMenu(); return; }
  adventure.begin();
}
// Quit the adventure: back to the start screen of free flight, as on first load
function quitAdventure() {
  adventure.stop();
  plane.pilot.visible = true;
  plane = planes.red;
  plane.pilot.visible = !cockpit;
  park('blue');
  flight.home = HOMES.red;
  flight.reset();
  syncPlane(plane, flight, 0);
  snap = true;
  started = paused = false;
  menu.querySelector('.sub').textContent = SUB;
  resumeBtn.hidden = true;
  refreshMenu();
}
// Adventure rewards change the world: the lighthouse lamp (lit at dusk and dawn once repaired) and the pilot's red scarf
function updateLamp() { landmarks.setLamp(!!adventure?.flags.lamp && (timeNow === 'dusk' || timeNow === 'dawn')); }
function applyFlags(flags) {
  updateLamp();
  if (flags.scarf) for (const p of Object.values(planes)) p.scarf.children[0].material.color.setHex(0xc0473a);
}
adventure = createAdventure({
  scene, world, flight,
  fly: (start) => takeOff('red', start),
  setTime: (name) => { timeNow = name ?? settings.time; world.setTime(timeNow); updateLamp(); },
  onFlags: applyFlags,
});
applyFlags(adventure.flags);
menu.querySelectorAll('.plane[data-plane]').forEach((b) => b.addEventListener('click', () => choose(b.dataset.plane)));
advBtn.addEventListener('click', startAdventure);
quitAdvBtn.addEventListener('click', quitAdventure);
resetAdvBtn.addEventListener('click', () => {
  if (!confirm('Start Island Air Mail over from the first delivery?')) return;
  const wasActive = adventure.active;
  adventure.reset();
  if (wasActive) { adventure.stop(); adventure.begin(); } else refreshMenu();
});
resumeBtn.addEventListener('click', closeMenu);
refreshMenu();
for (const ev of ['pointerdown', 'keydown']) addEventListener(ev, () => sound.unlock()); // browsers need a gesture to start audio
const input = new Input();
const hud = new Hud(document.getElementById('hud'));
const help = document.getElementById('help');

// Antialiasing: MSAA render target (geometry edges) + SMAA (thin wires, foliage)
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 }));
composer.addPass(new RenderPass(scene, camera));
const smaa = new SMAAPass(1, 1);
composer.addPass(smaa);
composer.addPass(new OutputPass());

// ---- Graphics quality: auto-adapts to frame time, G cycles auto / low / medium / high ----
const QUALITY = [
  { name: 'low', pr: 1, shadow: 1024, samples: 0, smaa: false, grass: 0.3, terrainShadow: false },
  { name: 'medium', pr: 1.5, shadow: 2048, samples: 2, smaa: true, grass: 0.6, terrainShadow: true },
  { name: 'high', pr: 2, shadow: 4096, samples: 4, smaa: true, grass: 1, terrainShadow: true },
];
let level = 2, ceiling = 2, auto = true;
function applyQuality() {
  const q = QUALITY[level];
  for (const rt of [composer.renderTarget1, composer.renderTarget2]) {
    if (rt.samples !== q.samples) { rt.samples = q.samples; rt.dispose(); }
  }
  smaa.enabled = q.smaa;
  world.setQuality(q);
  cover.setDensity(q.grass);
  resize();
}

function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  const pr = Math.min(devicePixelRatio, QUALITY[level].pr);
  renderer.setPixelRatio(pr);
  renderer.setSize(w, h, false);
  composer.setPixelRatio(pr);
  composer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);

// Frame-time monitor: drops a level when slow, climbs back only to levels that ran well
let ftSum = 0, ftN = 0, ftClock = 0, fps = 0;
function monitor(rawDt) {
  ftSum += rawDt; ftN++; ftClock += rawDt;
  if (ftClock < 2) return;
  const avg = ftSum / ftN;
  fps = Math.round(1 / avg);
  ftSum = ftN = ftClock = 0;
  if (!auto) return;
  if (avg > 1 / 45 && level > 0) { ceiling = --level; applyQuality(); }
  else if (avg < 1 / 58 && level < ceiling) { level++; applyQuality(); }
}

// ---- Camera: chase view that lags in turns, banks a little, widens FOV with speed; or cockpit view ----
let cockpit = false, snap = true, fov = 60, approachIdx = 0;
const eye = new THREE.Vector3(0, 1.0, 0.55);
const _f = new THREE.Vector3(), _sf = new THREE.Vector3(0, 0, -1), _u = new THREE.Vector3(), _d = new THREE.Vector3(), _l = new THREE.Vector3();
const WORLD_UP = new THREE.Vector3(0, 1, 0);
function updateCamera(dt) {
  const k = (rate) => 1 - Math.exp(-dt * rate);
  const targetFov = cockpit ? 72 : 60 + THREE.MathUtils.clamp((flight.airspeed - 20) / 35, 0, 1) * 8;
  fov += (targetFov - fov) * k(2);
  if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
  if (adventure.shot(camera, dt)) { snap = true; return; } // delivery scene: the adventure directs the camera

  if (cockpit) {
    camera.position.copy(eye).applyQuaternion(flight.q).add(flight.pos);
    camera.quaternion.copy(flight.q);
    camera.up.copy(WORLD_UP);
    return;
  }
  _f.set(0, 0, -1).applyQuaternion(flight.q);
  _u.set(0, 1, 0).applyQuaternion(flight.q);
  if (snap) _sf.copy(_f); else _sf.lerp(_f, k(2.5)).normalize();
  const ground = flight.state !== 'air';
  _d.copy(flight.pos).addScaledVector(_sf, ground ? -14 : -16);
  _d.y = Math.max(_d.y + (ground ? 4 : 4.5), world.groundAt(_d.x, _d.z) + 2);
  if (snap) camera.position.copy(_d); else camera.position.lerp(_d, k(5));
  snap = false;
  camera.up.copy(WORLD_UP).lerp(_u, 0.3).normalize();
  _l.copy(flight.pos).addScaledVector(_f, 40); // look well ahead: plane sits low in frame, runway visible above it
  _l.y += 2;
  camera.lookAt(_l);
}

applyQuality();
const clock = new THREE.Clock();
function frame() {
  const raw = clock.getDelta(), dt = Math.min(raw, 0.05);
  if (!menu.hidden) { if (input.consume('Digit1')) choose('red'); else if (input.consume('Digit2')) choose('blue'); else if (input.consume('Digit3')) startAdventure(); }
  if (input.consume('Escape') && started) { if (paused) closeMenu(); else openMenu(); }
  if (input.consume('KeyR') && !adventure.holdsPlane) { flight.reset(); snap = true; }
  if (input.consume('KeyT') && !adventure.active) { flight.startApproach(world.approaches[approachIdx++ % world.approaches.length]); snap = true; }
  if (input.consume('KeyC')) { cockpit = !cockpit; plane.pilot.visible = !cockpit; }
  if (input.consume('KeyH')) help.hidden = !help.hidden;
  if (input.consume('KeyM')) nav.toggleMap();
  if (input.consume('KeyG')) {
    if (auto) { auto = false; level = 0; } else if (level < 2) level++; else { auto = true; ceiling = 2; }
    applyQuality();
  }

  const live = started && !paused; // the pause menu freezes the world
  adventure.update(live ? dt : 0, input, live);
  if (live) {
    updateWind(time.value);
    if (!adventure.holdsPlane) flight.update(dt, input); // story cards and deliveries hold the plane still
    syncPlane(plane, flight, dt);
    smoke.update(dt, plane.group, flight);
  }
  updateCamera(dt);
  pointScale.value = renderer.getDrawingBufferSize(_size).y / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
  world.update(live || !started ? dt : 0, camera, flight.pos);
  if (live || !started) { landmarks.update(dt, time.value); life.update(dt); }
  sound.update(flight, !live);
  nav.update(dt, flight, adventure.target);
  cover.update(camera.position);
  hud.update(dt, flight, world, adventure.target, `WIND ${wind.speed ? `${wind.from}° ${Math.round(wind.now)} m/s` : 'CALM'}\nGFX ${auto ? 'auto · ' : ''}${QUALITY[level].name}${fps ? ` · ${fps} fps` : ''}`);
  composer.render();
  monitor(raw);
  input.endFrame();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
