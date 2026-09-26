import * as THREE from 'three';
import { GEAR_H } from './flight.js';

// Vintage instrument panel: brass-bezel gauges with aged cream faces on a stitched leather plate,
// plus a typewriter status plate. Static parts are pre-rendered; needles are smoothed and drawn each frame.
const _e = new THREE.Euler();
const G = 104, GAP = 10, PLATE = 56;
const W = 4 * G + 5 * GAP, H = GAP + G + 8 + PLATE + GAP;
const DIAL_FONT = "'Oswald', 'Arial Narrow', sans-serif", TYPE_FONT = "'Special Elite', 'Courier New', monospace";
const INK = '#2a2118', RAD = Math.PI / 180;

function gaugeFace(label, ticks, lx = 0, ly = 0.55) {
  const c = document.createElement('canvas'), dpr = Math.min(devicePixelRatio, 2);
  c.width = c.height = G * dpr;
  const g = c.getContext('2d'), r = G / 2;
  g.scale(dpr, dpr);
  g.translate(r, r);
  // brass bezel
  let grad = g.createLinearGradient(-r, -r, r, r);
  grad.addColorStop(0, '#f6e0a6'); grad.addColorStop(0.45, '#b8893f'); grad.addColorStop(1, '#6e4f1f');
  g.fillStyle = grad; g.beginPath(); g.arc(0, 0, r - 1, 0, 7); g.fill();
  g.fillStyle = '#4a3516'; g.beginPath(); g.arc(0, 0, r - 7, 0, 7); g.fill();
  // aged cream face with a darker rim and a few foxing spots
  grad = g.createRadialGradient(-6, -8, 4, 0, 0, r - 8);
  grad.addColorStop(0, '#f7f0dc'); grad.addColorStop(0.75, '#e8dcbc'); grad.addColorStop(1, '#c9b78e');
  g.fillStyle = grad; g.beginPath(); g.arc(0, 0, r - 8, 0, 7); g.fill();
  let seed = label.length * 7919;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 14; i++) {
    g.fillStyle = `rgba(120, 85, 40, ${0.05 + rnd() * 0.07})`;
    g.beginPath(); g.arc((rnd() - 0.5) * (r - 14) * 1.6, (rnd() - 0.5) * (r - 14) * 1.6, 0.8 + rnd() * 2.2, 0, 7); g.fill();
  }
  ticks(g, r - 10);
  g.fillStyle = INK; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `500 8px ${DIAL_FONT}`;
  g.fillText(label, lx * r, ly * r);
  // brass screws on the bezel
  for (const a of [45, 135, 225, 315]) {
    const x = Math.cos(a * RAD) * (r - 4), y = Math.sin(a * RAD) * (r - 4);
    g.fillStyle = '#d9b56a'; g.beginPath(); g.arc(x, y, 2, 0, 7); g.fill();
    g.strokeStyle = '#5a4118'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(x - 1.4, y - 1.4); g.lineTo(x + 1.4, y + 1.4); g.stroke();
  }
  return c;
}

// Ticks + numerals along an arc: value v maps to canvas angle a0 + (v - min) / (max - min) * sweep (degrees, clockwise)
function scale(g, R, { min, max, a0, sweep, minor, major, num = (v) => String(v), arcs = [] }) {
  const ang = (v) => (a0 + ((v - min) / (max - min)) * sweep) * RAD;
  for (const [from, to, color, w = 4] of arcs) {
    g.strokeStyle = color; g.lineWidth = w; g.beginPath(); g.arc(0, 0, R - 2, ang(from), ang(to)); g.stroke();
  }
  g.strokeStyle = INK; g.fillStyle = INK; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (let v = min; v <= max + 1e-6; v += minor) {
    const a = ang(v), big = Math.abs(v / major - Math.round(v / major)) < 1e-6, len = big ? 7 : 3.5;
    g.lineWidth = big ? 1.6 : 0.8;
    g.beginPath(); g.moveTo(Math.cos(a) * R, Math.sin(a) * R); g.lineTo(Math.cos(a) * (R - len), Math.sin(a) * (R - len)); g.stroke();
    if (big) { g.font = `500 10px ${DIAL_FONT}`; g.fillText(num(v), Math.cos(a) * (R - 14), Math.sin(a) * (R - 14)); }
  }
}

function needle(g, cx, cy, a, len, w, tip = '#b8322a') {
  g.save(); g.translate(cx, cy); g.rotate(a);
  g.shadowColor = 'rgba(0,0,0,0.35)'; g.shadowBlur = 2; g.shadowOffsetX = 1; g.shadowOffsetY = 1.5;
  g.fillStyle = INK;
  g.beginPath(); g.moveTo(-len * 0.18, -w); g.lineTo(len * 0.8, -w * 0.45); g.lineTo(len * 0.8, w * 0.45); g.lineTo(-len * 0.18, w); g.fill();
  g.fillStyle = tip;
  g.beginPath(); g.moveTo(len * 0.8, -w * 0.45); g.lineTo(len, 0); g.lineTo(len * 0.8, w * 0.45); g.fill();
  g.restore();
}

function hub(g, cx, cy) {
  const grad = g.createRadialGradient(cx - 1, cy - 1, 0.5, cx, cy, 5);
  grad.addColorStop(0, '#fbe7b0'); grad.addColorStop(1, '#8a6427');
  g.fillStyle = grad; g.beginPath(); g.arc(cx, cy, 4.5, 0, 7); g.fill();
}

function glass(g, cx, cy) {
  const r = G / 2 - 9;
  const grad = g.createLinearGradient(cx - r, cy - r, cx + r * 0.3, cy + r * 0.3);
  grad.addColorStop(0, 'rgba(255,255,255,0.28)'); grad.addColorStop(0.5, 'rgba(255,255,255,0.04)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.beginPath(); g.arc(cx, cy, r, 0, 7); g.fill();
}

function leather(g) {
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, 'rgba(66, 46, 32, 0.93)'); grad.addColorStop(1, 'rgba(40, 27, 19, 0.93)');
  g.fillStyle = grad; g.beginPath(); g.roundRect(0, 0, W, H, 10); g.fill();
  g.strokeStyle = 'rgba(230, 200, 150, 0.45)'; g.lineWidth = 1; g.setLineDash([4, 3]);
  g.beginPath(); g.roundRect(5, 5, W - 10, H - 10, 7); g.stroke(); g.setLineDash([]);
  // brass status plate
  const py = GAP + G + 8;
  const plate = g.createLinearGradient(0, py, 0, py + PLATE);
  plate.addColorStop(0, '#e9d6a4'); plate.addColorStop(1, '#c7a969');
  g.fillStyle = plate; g.beginPath(); g.roundRect(GAP, py, W - 2 * GAP, PLATE, 4); g.fill();
  g.strokeStyle = 'rgba(90, 65, 25, 0.6)'; g.lineWidth = 1; g.stroke();
  for (const x of [GAP + 7, W - GAP - 7]) for (const y of [py + 7, py + PLATE - 7]) {
    g.fillStyle = '#8a6427'; g.beginPath(); g.arc(x, y, 2.2, 0, 7); g.fill();
  }
}

export class Hud {
  constructor(el) {
    this.el = el;
    this.dpr = Math.min(devicePixelRatio, 2);
    el.width = W * this.dpr; el.height = H * this.dpr;
    el.style.width = `${W}px`;
    this.g = el.getContext('2d');
    this.v = { spd: 0, agl: 0, vs: 0, rpm: 0 };
    this.lines = ['', '', ''];
    this.t = 1;
    this.build();
    document.fonts?.ready.then(() => this.build()); // redraw faces once the vintage fonts arrive
  }

  build() {
    const arcSpd = { min: 0, max: 250, a0: 135, sweep: 270, minor: 10, major: 50, num: (v) => (v < 250 ? String(v) : ''),
      arcs: [[70, 120, '#f4f1e8', 3], [80, 190, '#4e8a3c'], [190, 220, '#d9a431'], [219, 221, '#b8322a', 5]] };
    this.faces = [
      gaugeFace('KM/H', (g, R) => scale(g, R, arcSpd)),
      gaugeFace('ALT  m', (g, R) => scale(g, R, { min: 0, max: 10, a0: -90, sweep: 360, minor: 0.5, major: 1, num: (v) => (v < 10 ? String(v) : '') }), 0, -0.3),
      gaugeFace('m/s', (g, R) => {
        scale(g, R, { min: -10, max: 10, a0: 20, sweep: 320, minor: 1, major: 5, num: (v) => String(Math.abs(v)) });
        g.font = `500 8px ${DIAL_FONT}`; g.fillText('UP', -R * 0.35, -R * 0.35); g.fillText('DN', -R * 0.35, R * 0.35);
      }, 0.32, 0),
      gaugeFace('RPM ×100', (g, R) => scale(g, R, { min: 0, max: 30, a0: 135, sweep: 270, minor: 1, major: 5, num: (v) => (v < 30 ? String(v) : ''), arcs: [[6, 22, '#4e8a3c'], [24.6, 25.4, '#b8322a', 5]] })),
    ];
    const bg = document.createElement('canvas');
    bg.width = W * this.dpr; bg.height = H * this.dpr;
    const g = bg.getContext('2d');
    g.scale(this.dpr, this.dpr);
    leather(g);
    this.faces.forEach((f, i) => g.drawImage(f, GAP + i * (G + GAP), GAP, G, G));
    this.bg = bg;
  }

  update(dt, f, world, target = null, gfx = '') {
    // Needle targets, smoothed like a damped instrument
    const agl = Math.max(0, f.pos.y - GEAR_H - world.groundAt(f.pos.x, f.pos.z));
    const rpm = f.state === 'crashed' ? 0 : 6 + f.throttle * 19 + Math.min(f.airspeed, 55) * 0.05;
    const k = Math.min(1, dt * 6), v = this.v;
    v.spd += (f.airspeed * 3.6 - v.spd) * k;
    v.agl += (agl - v.agl) * k;
    v.vs += (THREE.MathUtils.clamp(f.vs, -10, 10) - v.vs) * k;
    v.rpm += (rpm - v.rpm) * Math.min(1, dt * 3);

    // Text refreshed ~10x per second: status + direction to the adventure objective, or to the nearest landing site
    if ((this.t += dt) >= 0.1) {
      this.t = 0;
      const { strip, dist: sd } = world.nearestStrip(f.pos.x, f.pos.z);
      const goal = target ?? { label: strip.name, x: strip.x, z: strip.z };
      const dist = target ? Math.hypot(goal.x - f.pos.x, goal.z - f.pos.z) : sd;
      let nav = '';
      if (target || dist > 400) {
        const yaw = _e.setFromQuaternion(f.q, 'YXZ').y;
        let rel = Math.atan2(-(goal.x - f.pos.x), -(goal.z - f.pos.z)) - yaw;
        rel = THREE.MathUtils.radToDeg(Math.atan2(Math.sin(rel), Math.cos(rel)));
        const turn = Math.abs(rel) < 8 ? 'dead ahead' : `${Math.round(Math.abs(rel))}° ${rel > 0 ? 'left' : 'right'}`;
        nav = `${goal.label} ${dist < 1000 ? `${Math.round(dist / 10) * 10} m` : `${(dist / 1000).toFixed(1)} km`}, ${turn}`;
      }
      const [status, extra] = f.status.split('\n');
      const [windLine, gfxLine = ''] = gfx.split('\n');
      this.lines = [status.toUpperCase(), extra || nav, windLine, gfxLine];
    }
    this.draw();
  }

  draw() {
    const g = this.g, v = this.v;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    g.drawImage(this.bg, 0, 0, W, H);
    const cx = (i) => GAP + i * (G + GAP) + G / 2, cy = GAP + G / 2, R = G / 2 - 12;

    needle(g, cx(0), cy, (135 + (THREE.MathUtils.clamp(v.spd, 0, 250) / 250) * 270) * RAD, R, 2.4);
    hub(g, cx(0), cy);

    // Altimeter: odometer drum + short needle (100 m per numeral) + long needle (10 m per numeral)
    const drum = String(Math.round(v.agl)).padStart(4, '0');
    g.fillStyle = '#1f1812'; g.fillRect(cx(1) - 15, cy + 4, 30, 12);
    g.font = `500 10px ${DIAL_FONT}`; g.fillStyle = '#f2e8cc'; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let d = 0; d < 4; d++) g.fillText(drum[d], cx(1) - 10.5 + d * 7, cy + 10.5);
    needle(g, cx(1), cy, (-90 + ((v.agl % 1000) / 1000) * 360) * RAD, R * 0.62, 3, INK);
    needle(g, cx(1), cy, (-90 + ((v.agl % 100) / 100) * 360) * RAD, R, 2);
    hub(g, cx(1), cy);

    needle(g, cx(2), cy, (180 - (v.vs / 10) * 160) * RAD, R, 2.4);
    hub(g, cx(2), cy);

    needle(g, cx(3), cy, (135 + (THREE.MathUtils.clamp(v.rpm, 0, 30) / 30) * 270) * RAD, R, 2.4);
    hub(g, cx(3), cy);

    for (let i = 0; i < 4; i++) glass(g, cx(i), cy);

    // Typewriter status plate
    const py = GAP + G + 8;
    g.textAlign = 'left'; g.textBaseline = 'alphabetic'; g.fillStyle = INK;
    g.font = `15px ${TYPE_FONT}`;
    g.fillText(this.lines[0], GAP + 16, py + 22);
    g.font = `12px ${TYPE_FONT}`;
    if (this.lines[1]) g.fillText(`→ ${this.lines[1]}`, GAP + 16, py + 42);
    g.textAlign = 'right'; g.font = `11px ${TYPE_FONT}`; g.fillStyle = INK;
    g.fillText(this.lines[2], W - GAP - 16, py + 22);
    g.font = `10px ${TYPE_FONT}`; g.fillStyle = 'rgba(42, 33, 24, 0.65)';
    g.fillText(this.lines[3], W - GAP - 16, py + 42);
  }
}
