import * as THREE from 'three';
import { paint } from './style.js';

// Fabric wing texture: faint rib lines along the span
function ribTexture() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 4;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 64, 4);
  g.fillStyle = '#e2d3c8';
  for (let x = 0; x < 64; x += 16) g.fillRect(x, 0, 3, 4);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.repeat.set(6, 1);
  t.anisotropy = 4;
  return t;
}

export const LIVERIES = {
  red: { body: 0xf2e4c4, wing: 0xc4453a, trim: 0xc4453a, roundel: 0xc4453a },
  blue: { body: 0xf4f1ea, wing: 0x3d6fb0, trim: 0x2f5690, roundel: 0xf0c24a },
};

// Biplane built from primitives. Nose points to -Z, origin is the centre of gravity.
export function createPlane(livery = LIVERIES.red) {
  const g = new THREE.Group();
  const cream = paint(livery.body), red = paint(livery.trim), dark = paint(0x3a3a3a), metal = paint(0x75767a);
  const wood = paint(0x7a5230), skin = paint(0xe8b98f), leather = paint(0x6b4326);
  const wing = paint(livery.wing, { map: ribTexture() });
  const glass = paint(0xcfe6f0, { transparent: true, opacity: 0.35 });

  const add = (geo, mat, x, y, z, parent = g) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    parent.add(m);
    return m;
  };
  const pivot = (x, y, z, parent = g) => { const p = new THREE.Group(); p.position.set(x, y, z); parent.add(p); return p; };
  const up = new THREE.Vector3(0, 1, 0);
  const wire = (a, b) => {
    const d = new THREE.Vector3().subVectors(b, a);
    const m = add(new THREE.CylinderGeometry(0.012, 0.012, d.length(), 4), dark, 0, 0, 0);
    m.position.copy(a).addScaledVector(d, 0.5);
    m.quaternion.setFromUnitVectors(up, d.normalize());
  };
  const V = (x, y, z) => new THREE.Vector3(x, y, z);

  // Fuselage, open cowling with radial engine, exhausts, propeller
  add(new THREE.CylinderGeometry(0.6, 0.22, 6, 16).rotateX(-Math.PI / 2), cream, 0, 0, 1);
  add(new THREE.CylinderGeometry(0.66, 0.62, 0.7, 20, 1, true).rotateX(-Math.PI / 2), paint(livery.trim, { side: THREE.DoubleSide }), 0, 0, -2.2);
  add(new THREE.CircleGeometry(0.62, 20), dark, 0, 0, -1.9);
  const cyl = new THREE.CylinderGeometry(0.09, 0.1, 0.34, 8);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const c = add(cyl, metal, Math.cos(a) * 0.36, Math.sin(a) * 0.36, -2.3);
    c.rotation.z = a - Math.PI / 2;
  }
  add(new THREE.SphereGeometry(0.2, 10, 8), metal, 0, 0, -2.35);
  const exhaust = new THREE.CylinderGeometry(0.05, 0.06, 0.9, 6).rotateX(Math.PI / 2);
  for (const x of [-0.58, 0.58]) add(exhaust, dark, x, -0.28, -1.5);
  const prop = pivot(0, 0, -2.65);
  add(new THREE.SphereGeometry(0.18, 10, 8).scale(1, 1, 1.4), cream, 0, 0, -0.08, prop);
  add(new THREE.BoxGeometry(0.16, 2.6, 0.05), wood, 0, 0, 0, prop);

  // Wings (fabric ribs), roundels, struts and bracing wires
  add(new THREE.BoxGeometry(9.4, 0.12, 1.4), wing, 0, 1.25, -1.1);
  add(new THREE.BoxGeometry(8.6, 0.12, 1.3), wing, 0, -0.5, -0.8);
  const roundelOuter = new THREE.CircleGeometry(0.5, 24).rotateX(-Math.PI / 2);
  const roundelInner = new THREE.CircleGeometry(0.24, 24).rotateX(-Math.PI / 2);
  for (const x of [-3.3, 3.3]) {
    add(roundelOuter, cream, x, 1.316, -1.1);
    add(roundelInner, paint(livery.roundel), x, 1.318, -1.1);
  }
  const strut = new THREE.BoxGeometry(0.08, 1.75, 0.08);
  for (const x of [-3.4, 3.4]) for (const z of [-1.4, -0.55]) add(strut, wood, x, 0.375, z);
  const cabane = new THREE.BoxGeometry(0.07, 0.75, 0.07);
  for (const x of [-0.5, 0.5]) for (const z of [-1.5, -0.8]) add(cabane, wood, x, 0.85, z);
  for (const s of [-1, 1]) for (const z of [-1.4, -0.55]) {
    wire(V(s * 0.55, -0.45, z), V(s * 3.35, 1.2, z));
    wire(V(s * 0.55, 1.2, z), V(s * 3.35, -0.45, z));
  }
  for (const s of [-1, 1]) wire(V(s * 1.5, 0.08, 3.7), V(0, 1.2, 3.8));

  // Control surfaces (pivot at hinge line so they visibly deflect)
  const ailGeo = new THREE.BoxGeometry(2.4, 0.07, 0.35).translate(0, 0, 0.17);
  const ailL = pivot(-3.3, 1.25, -0.4), ailR = pivot(3.3, 1.25, -0.4);
  add(ailGeo, red, 0, 0, 0, ailL);
  add(ailGeo, red, 0, 0, 0, ailR);
  add(new THREE.BoxGeometry(3.2, 0.08, 0.9), cream, 0, 0.05, 3.7);
  const elevator = pivot(0, 0.05, 4.15);
  add(new THREE.BoxGeometry(3.2, 0.06, 0.5).translate(0, 0, 0.25), red, 0, 0, 0, elevator);
  add(new THREE.BoxGeometry(0.08, 1.2, 0.9), cream, 0, 0.65, 3.75);
  const rudder = pivot(0, 0.65, 4.2);
  add(new THREE.BoxGeometry(0.07, 1.2, 0.5).translate(0, 0, 0.25), red, 0, 0, 0, rudder);

  // Landing gear with hub caps, tail wheel
  for (const x of [-0.75, 0.75]) add(new THREE.BoxGeometry(0.08, 0.8, 0.08), dark, x, -0.85, -1.2);
  add(new THREE.BoxGeometry(1.7, 0.06, 0.06), dark, 0, -1.25, -1.2);
  const wheel = new THREE.CylinderGeometry(0.35, 0.35, 0.16, 18).rotateZ(Math.PI / 2);
  const hub = new THREE.CylinderGeometry(0.15, 0.15, 0.18, 12).rotateZ(Math.PI / 2);
  for (const x of [-0.9, 0.9]) { add(wheel, dark, x, -1.25, -1.2); add(hub, cream, x, -1.25, -1.2); }
  add(new THREE.BoxGeometry(0.06, 0.4, 0.06), dark, 0, -0.4, 3.9);
  add(new THREE.CylinderGeometry(0.1, 0.1, 0.06, 10).rotateZ(Math.PI / 2), dark, 0, -0.6, 3.92);

  // Cockpit: padded rim, windscreen, pilot with goggles and a scarf
  add(new THREE.TorusGeometry(0.4, 0.06, 8, 20).rotateX(Math.PI / 2), leather, 0, 0.55, 0.6);
  const screen = add(new THREE.BoxGeometry(0.5, 0.18, 0.02), glass, 0, 0.64, -0.05);
  screen.rotation.x = -0.35;
  screen.castShadow = false;
  const pilot = pivot(0, 0.75, 0.6);
  add(new THREE.SphereGeometry(0.22, 12, 10), skin, 0, 0, 0, pilot);
  add(new THREE.SphereGeometry(0.235, 12, 10, 0, Math.PI * 2, 0, Math.PI / 2), leather, 0, 0.02, 0, pilot);
  const lens = new THREE.CylinderGeometry(0.06, 0.06, 0.05, 10).rotateX(Math.PI / 2);
  for (const x of [-0.08, 0.08]) add(lens, metal, x, 0.1, -0.2, pilot);
  const scarf = pivot(0.05, -0.15, 0.12, pilot);
  add(new THREE.BoxGeometry(0.1, 0.02, 0.7).translate(0, 0, 0.35), paint(0xf4f1ea), 0, 0, 0, scarf);

  return { group: g, prop, ailL, ailR, elevator, rudder, pilot, scarf, t: 0 };
}

export function syncPlane(p, f, dt) {
  p.t += dt;
  p.group.position.copy(f.pos);
  p.group.quaternion.copy(f.q);
  if (f.state !== 'crashed') p.prop.rotation.z += (6 + f.throttle * 60) * dt;
  const c = f.ctrl;
  p.ailR.rotation.x = -c.roll * 0.4;
  p.ailL.rotation.x = c.roll * 0.4;
  p.elevator.rotation.x = -c.pitch * 0.4;
  p.rudder.rotation.y = c.yaw * 0.4;
  // Scarf trails in the slipstream and flutters faster with airspeed
  const v = Math.min(f.airspeed / 40, 1);
  p.scarf.rotation.x = 0.9 - v * 0.8 + Math.sin(p.t * (4 + v * 10)) * 0.08;
  p.scarf.rotation.y = Math.sin(p.t * (3 + v * 8) + 1) * (0.1 + v * 0.15);
}
