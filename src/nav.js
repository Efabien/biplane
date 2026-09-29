import * as THREE from 'three';
import { groundAt, STRIPS, VILLAGE, LIGHTHOUSE, CASTLE, RUIN, RAIL, VOLCANO, ATOLL, SEA_LIGHT, SEAFORT, VALE, X0, Z0, WX, WZ } from './world.js';

// Vintage navigation: a brass-framed compass tape (top right) and an old paper map in a brass ring (bottom right).
const PLACES = [
  { name: 'Village', x: VILLAGE.x, z: VILLAGE.z },
  { name: 'Lighthouse', x: LIGHTHOUSE.x, z: LIGHTHOUSE.z },
  { name: 'Castle', x: CASTLE.x, z: CASTLE.z },
  { name: 'Sky ruin', x: RUIN.x, z: RUIN.z },
  { name: 'Viaduct', x: RAIL.cx + RAIL.fx * (RAIL.s1 + RAIL.s2) / 2, z: RAIL.cz + RAIL.fz * (RAIL.s1 + RAIL.s2) / 2 },
  { name: 'Sea fort', x: SEAFORT.x, z: SEAFORT.z },
  { name: 'Volcano', x: VOLCANO.x + 420, z: VOLCANO.z - 300 },
  { name: 'Sea stacks', x: 6250, z: 750 },
  { name: 'Offshore light', x: SEA_LIGHT.x, z: SEA_LIGHT.z },
  { name: 'Atoll', x: ATOLL.x, z: ATOLL.z },
  { name: 'Pine Vale', x: VALE.x - 700, z: VALE.z - 330 },
  { name: 'Waterfall', x: VALE.x - VALE.fall, z: VALE.z + 60 },
];
// The map follows the plane, showing EXT metres around it; the paper covers the whole world plus a margin of sea
const EXT = 2150, MAP = 176, RING = 9, SIZE = MAP + 2 * RING, PPM = MAP / (2 * EXT);
const PX0 = X0 - 400, PZ0 = Z0 - 400, PW = Math.round((WX + 800) * PPM), PH = Math.round((WZ + 800) * PPM);
const INK = '#2a2118', SEPIA = '#6b4a2a', RED = '#a8321f', GOLD = '#e8b54a';
const DIAL_FONT = "'Oswald', 'Arial Narrow', sans-serif", TYPE_FONT = "'Special Elite', 'Courier New', monospace";
const bearingTo = (dx, dz) => (THREE.MathUtils.radToDeg(Math.atan2(dx, -dz)) + 360) % 360; // 0 = north (-z), clockwise
const wrap180 = (d) => ((d + 540) % 360) - 180;

function setupCanvas(el, w, h) {
  const dpr = Math.min(devicePixelRatio, 2);
  el.width = w * dpr; el.height = h * dpr;
  el.style.width = `${w}px`; el.style.height = `${h}px`;
  const ctx = el.getContext('2d');
  ctx.scale(dpr, dpr);
  return ctx;
}

const brass = (g, x0, y0, x1, y1) => {
  const grad = g.createLinearGradient(x0, y0, x1, y1);
  grad.addColorStop(0, '#f6e0a6'); grad.addColorStop(0.45, '#b8893f'); grad.addColorStop(1, '#6e4f1f');
  return grad;
};

// Paper map, rendered once: parchment land tones with hill shading, muted ink sea, inked coastline, faint grid
function renderPaperMap() {
  const c = document.createElement('canvas');
  c.width = PW; c.height = PH;
  const ctx = c.getContext('2d'), img = ctx.createImageData(PW, PH), step = 1 / PPM;
  const H = new Float32Array(PW * PH);
  for (let py = 0; py < PH; py++) for (let px = 0; px < PW; px++) H[py * PW + px] = groundAt(PX0 + (px + 0.5) * step, PZ0 + (py + 0.5) * step);
  const at = (px, py) => H[THREE.MathUtils.clamp(py, 0, PH - 1) * PW + THREE.MathUtils.clamp(px, 0, PW - 1)];
  for (let py = 0; py < PH; py++) for (let px = 0; px < PW; px++) {
    const h = at(px, py), k = (py * PW + px) * 4;
    let col;
    if (h < 0) col = h < -20 ? [150, 176, 172] : [176, 198, 188];
    else col = h < 3 ? [236, 222, 184] : h < 60 ? [226, 214, 172] : h < 140 ? [212, 196, 150] : h < 250 ? [190, 170, 128] : [240, 232, 212];
    if (h >= 0) { // hill shading, warm sepia
      const sh = THREE.MathUtils.clamp(1 + ((at(px - 1, py) - at(px + 1, py)) * 0.6 + (at(px, py - 1) - at(px, py + 1)) * 0.4) / step * 0.3, 0.72, 1.12);
      col = col.map((v) => v * sh);
    }
    const coast = (h >= 0) !== (at(px + 1, py) >= 0) || (h >= 0) !== (at(px, py + 1) >= 0);
    if (coast) col = [96, 72, 44];
    img.data.set([...col, 255], k);
  }
  ctx.putImageData(img, 0, 0);
  ctx.strokeStyle = 'rgba(107, 74, 42, 0.18)'; ctx.lineWidth = 0.6;
  const gs = (4000 / 6) * PPM; // grid lines every 667 m, as before
  for (let p = gs; p < PW; p += gs) { ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, PH); ctx.stroke(); }
  for (let p = gs; p < PH; p += gs) { ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(PW, p); ctx.stroke(); }
  return c;
}

export function createNav() {
  const compassEl = document.getElementById('compass'), mapEl = document.getElementById('minimap');
  const CW = 380, CH = 50;
  const cc = setupCanvas(compassEl, CW, CH), mc = setupCanvas(mapEl, SIZE, SIZE);
  // The paper map (~70 k height samples) is rendered off the startup path: idle after first frame, or on demand
  let paper = null;
  const paperReady = () => (paper ??= renderPaperMap());
  (window.requestIdleCallback ?? ((f) => setTimeout(f, 0)))(paperReady);
  let cx = 0, cz = 0; // world point at the centre of the map (the plane)
  const toMap = (x, z) => [SIZE / 2 + (x - cx) * PPM, SIZE / 2 + (z - cz) * PPM];
  const fwd = new THREE.Vector3();
  let mapT = 1;

  function drawCompass(heading, px, pz, target) {
    const g = cc;
    g.clearRect(0, 0, CW, CH);
    g.fillStyle = brass(g, 0, 0, CW, CH); g.beginPath(); g.roundRect(0, 0, CW, CH, 8); g.fill();
    const face = g.createLinearGradient(0, 5, 0, CH - 5);
    face.addColorStop(0, '#f5eed8'); face.addColorStop(1, '#dccfa9');
    g.fillStyle = face; g.beginPath(); g.roundRect(5, 5, CW - 10, CH - 10, 5); g.fill();
    g.save(); g.beginPath(); g.rect(6, 5, CW - 12, CH - 10); g.clip();
    const ppd = (CW - 12) / 120;
    g.strokeStyle = INK; g.fillStyle = INK; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let d = Math.ceil((heading - 62) / 5) * 5; d <= heading + 62; d += 5) {
      const x = CW / 2 + (d - heading) * ppd, dd = ((d % 360) + 360) % 360;
      g.lineWidth = dd % 10 ? 0.8 : 1.4;
      g.beginPath(); g.moveTo(x, CH - 5); g.lineTo(x, CH - 5 - (dd % 10 ? 4 : 8)); g.stroke();
      if (dd % 30 === 0) {
        const card = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' }[dd];
        g.font = card ? `600 13px ${DIAL_FONT}` : `500 11px ${DIAL_FONT}`;
        g.fillStyle = card === 'N' ? RED : INK;
        g.fillText(card ?? String(dd / 10).padStart(2, '0'), x, CH - 20);
        g.fillStyle = INK;
      }
    }
    // Landing sites as small red pennants, landmarks as ink diamonds (named near the centre); labels never overlap
    const used = [];
    const marker = (x, z, name, strip) => {
      const diff = wrap180(bearingTo(x - px, z - pz) - heading);
      if (Math.abs(diff) > 58) return;
      const sx = CW / 2 + diff * ppd;
      g.fillStyle = strip ? RED : SEPIA;
      g.beginPath();
      if (strip) { g.moveTo(sx, 8); g.lineTo(sx, 16); g.lineTo(sx + 7, 11); g.closePath(); g.fill(); g.fillRect(sx - 0.6, 8, 1.2, 10); }
      else { g.moveTo(sx, 8); g.lineTo(sx + 3, 11.5); g.lineTo(sx, 15); g.lineTo(sx - 3, 11.5); g.closePath(); g.fill(); }
      g.font = `10px ${TYPE_FONT}`;
      const half = g.measureText(name).width / 2 + 4, lx = sx + (strip ? 26 : 0);
      if ((strip || Math.abs(diff) < 12) && !used.some(([a, b]) => lx + half > a && lx - half < b)) {
        g.fillStyle = strip ? RED : SEPIA; g.fillText(name, lx, 12);
        used.push([lx - half, lx + half]);
      }
    };
    for (const s of STRIPS) marker(s.x, s.z, s.name, true);
    for (const p of PLACES) marker(p.x, p.z, p.name, false);
    if (target) { // adventure objective: a gold envelope on the tape
      const diff = wrap180(bearingTo(target.x - px, target.z - pz) - heading);
      const sx = CW / 2 + THREE.MathUtils.clamp(diff, -58, 58) * ppd;
      g.fillStyle = GOLD; g.strokeStyle = INK; g.lineWidth = 0.8;
      g.beginPath(); g.rect(sx - 6, 24, 12, 8); g.fill(); g.stroke();
      g.beginPath(); g.moveTo(sx - 6, 24); g.lineTo(sx, 29); g.lineTo(sx + 6, 24); g.stroke();
    }
    g.restore();
    // lubber line
    g.fillStyle = RED;
    g.beginPath(); g.moveTo(CW / 2 - 5, CH - 5); g.lineTo(CW / 2 + 5, CH - 5); g.lineTo(CW / 2, CH - 13); g.fill();
    const glass = g.createLinearGradient(0, 5, 0, CH / 2);
    glass.addColorStop(0, 'rgba(255,255,255,0.3)'); glass.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = glass; g.fillRect(6, 5, CW - 12, CH / 2 - 5);
  }

  function drawMap(heading, px, pz, target) {
    const g = mc, c = SIZE / 2;
    g.clearRect(0, 0, SIZE, SIZE);
    cx = px; cz = pz;
    g.save(); g.beginPath(); g.arc(c, c, MAP / 2, 0, 7); g.clip();
    g.fillStyle = 'rgb(150, 176, 172)'; g.fillRect(0, 0, SIZE, SIZE); // open sea beyond the paper
    g.drawImage(paperReady(), ...toMap(PX0, PZ0));
    g.font = `9px ${TYPE_FONT}`; g.textAlign = 'center';
    for (const s of STRIPS) {
      const [x, y] = toMap(s.x, s.z);
      g.save(); g.translate(x, y); g.rotate(-s.heading);
      g.fillStyle = RED; g.fillRect(-2, (-s.len / 2 / (2 * EXT)) * MAP, 4, (s.len / (2 * EXT)) * MAP);
      g.restore();
    }
    for (const p of PLACES) {
      const [x, y] = toMap(p.x, p.z);
      g.fillStyle = INK; g.beginPath(); g.arc(x, y, 2, 0, 7); g.fill();
      g.fillStyle = SEPIA; g.fillText(p.name, THREE.MathUtils.clamp(x, 34, SIZE - 34), y - 5);
    }
    if (target) { // adventure objective, pinned to the rim when it's off the map
      let [tx, ty] = toMap(target.x, target.z);
      const dx = tx - c, dy = ty - c, r = Math.hypot(dx, dy), max = MAP / 2 - 7;
      if (r > max) { tx = c + (dx / r) * max; ty = c + (dy / r) * max; }
      g.fillStyle = GOLD; g.strokeStyle = INK; g.lineWidth = 1;
      g.beginPath(); g.arc(tx, ty, 4.5, 0, 7); g.fill(); g.stroke();
    }
    // the plane, as a small red arrowhead
    const [x, y] = toMap(px, pz);
    g.save(); g.translate(x, y); g.rotate(THREE.MathUtils.degToRad(heading));
    g.fillStyle = RED; g.strokeStyle = '#f5eed8'; g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(0, -7); g.lineTo(5, 5); g.lineTo(0, 2.5); g.lineTo(-5, 5); g.closePath(); g.fill(); g.stroke();
    g.restore();
    // aged vignette on the paper
    const vig = g.createRadialGradient(c, c, MAP * 0.3, c, c, MAP / 2);
    vig.addColorStop(0, 'rgba(120, 85, 40, 0)'); vig.addColorStop(1, 'rgba(120, 85, 40, 0.28)');
    g.fillStyle = vig; g.fillRect(0, 0, SIZE, SIZE);
    g.restore();
    // brass ring with a north marker
    g.lineWidth = RING; g.strokeStyle = brass(g, 0, 0, SIZE, SIZE);
    g.beginPath(); g.arc(c, c, MAP / 2 + RING / 2, 0, 7); g.stroke();
    g.fillStyle = RED; g.beginPath(); g.moveTo(c, 1); g.lineTo(c + 5, RING + 1); g.lineTo(c - 5, RING + 1); g.fill();
    g.fillStyle = INK; g.font = `600 10px ${DIAL_FONT}`; g.fillText('N', c, RING + 12);
  }

  return {
    update(dt, flight, target = null) {
      fwd.set(0, 0, -1).applyQuaternion(flight.q);
      const heading = bearingTo(fwd.x, fwd.z);
      drawCompass(heading, flight.pos.x, flight.pos.z, target);
      if ((mapT += dt) >= 0.1 && !mapEl.hidden) { mapT = 0; drawMap(heading, flight.pos.x, flight.pos.z, target); }
    },
    toggleMap() { mapEl.hidden = !mapEl.hidden; },
  };
}
