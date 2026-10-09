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

// Flat plate with rounded corners (wings, tail surfaces): footprint w × d, thickness t along y, trailing edge at +z.
// notch = { w, d } scoops a rounded cutout out of the middle of the trailing edge.
// UVs are normalized to the footprint so the rib texture repeats like it did on the old boxes.
function plate(w, d, t, r, notch) {
  const s = new THREE.Shape(), hw = w / 2, hd = d / 2;
  s.moveTo(-hw + r, -hd);
  s.lineTo(hw - r, -hd);
  s.quadraticCurveTo(hw, -hd, hw, -hd + r);
  s.lineTo(hw, hd - r);
  s.quadraticCurveTo(hw, hd, hw - r, hd);
  if (notch) {
    const nw = notch.w / 2, nd = hd - notch.d;
    s.lineTo(nw, hd);
    s.quadraticCurveTo(nw, nd, 0, nd);
    s.quadraticCurveTo(-nw, nd, -nw, hd);
  }
  s.lineTo(-hw + r, hd);
  s.quadraticCurveTo(-hw, hd, -hw, hd - r);
  s.lineTo(-hw, -hd + r);
  s.quadraticCurveTo(-hw, -hd, -hw + r, -hd);
  const g = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: false, curveSegments: 5 }).rotateX(Math.PI / 2).translate(0, t / 2, 0);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / w + 0.5, uv.getY(i) / d + 0.5);
  return g;
}

// Prop blur: transparent disc, darker mid, a pale ring where the tips catch the light
function blurTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 10, 64, 64, 64);
  grad.addColorStop(0, 'rgba(58, 48, 38, 0)');
  grad.addColorStop(0.35, 'rgba(58, 48, 38, 0.5)');
  grad.addColorStop(0.85, 'rgba(70, 58, 46, 0.3)');
  grad.addColorStop(0.93, 'rgba(232, 222, 200, 0.45)');
  grad.addColorStop(1, 'rgba(232, 222, 200, 0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export const LIVERIES = {
  red: { body: 0xf2e4c4, wing: 0xc4453a, trim: 0xc4453a, roundel: 0xc4453a, reg: 'IA-1' },
  blue: { body: 0x3d6fb0, wing: 0xf4f1ea, trim: 0x23406e, roundel: 0xf0c24a, reg: 'IA-2', kind: 'parasol' },
  bush: { body: 0xe8b830, wing: 0xe8b830, trim: 0x2b2622, roundel: 0x2b2622, reg: 'IA-3', kind: 'bush' },
  hopper: { body: 0x79976c, wing: 0xf2e4c4, trim: 0xf2e4c4, roundel: 0x2f5d3a, reg: 'IA-4', kind: 'hopper' },
};

// Three vertical rudder stripes in the livery's colours, hinge side first
function rudderTexture(l) {
  const c = document.createElement('canvas');
  c.width = 48; c.height = 16;
  const g = c.getContext('2d');
  [l.trim, l.body, l.roundel].forEach((hex, i) => {
    g.fillStyle = `#${hex.toString(16).padStart(6, '0')}`;
    g.fillRect(i * 16, 0, 16, 16);
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Registration letters, dark ink on a transparent decal
function regTexture(text) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 40;
  const g = c.getContext('2d');
  g.font = '600 30px "Oswald", "Arial Narrow", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#3f3a32';
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  const draw = () => { g.clearRect(0, 0, 128, 40); g.fillText(text, 64, 21); t.needsUpdate = true; };
  draw();
  document.fonts?.ready.then(draw); // redraw once the webfont is in
  return t;
}

// Tapered box along z (the parasol's slab-sided fuselage and cowl): top(z), bot(z) and half(z) give its top edge,
// bottom edge and half-width at each of `segs` stations from z0 to z1
function slab(z0, z1, segs, top, bot, half) {
  const g = new THREE.BoxGeometry(1, 1, z1 - z0, 1, 1, segs), pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const z = pos.getZ(i) + (z0 + z1) / 2;
    pos.setXYZ(i, Math.sign(pos.getX(i)) * half(z), pos.getY(i) > 0 ? top(z) : bot(z), z);
  }
  g.computeVertexNormals();
  return g;
}

// A plane built from primitives. Nose points to -Z, origin is the centre of gravity. livery.kind picks the airframe
// (a biplane, or a parasol monoplane); the prop, tail, cockpit and wheels are shared and sit in the same places,
// so the flight model, ground handling and exhaust smoke fit both.
export function createPlane(livery = LIVERIES.red) {
  const g = new THREE.Group();
  const k = {
    livery, g,
    cream: paint(livery.body), trim: paint(livery.trim), dark: paint(0x3a3a3a), metal: paint(0x75767a),
    wood: paint(0x7a5230), leather: paint(0x6b4326), roundel: paint(livery.roundel),
    wing: paint(livery.wing, { map: ribTexture() }),
  };
  const add = k.add = (geo, mat, x, y, z, parent = g) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    parent.add(m);
    return m;
  };
  const pivot = k.pivot = (x, y, z, parent = g) => { const p = new THREE.Group(); p.position.set(x, y, z); parent.add(p); return p; };
  const up = new THREE.Vector3(0, 1, 0);
  k.rod = (a, b, r, mat, sides = 6) => {
    const d = new THREE.Vector3().subVectors(b, a);
    const m = add(new THREE.CylinderGeometry(r, r, d.length(), sides), mat, 0, 0, 0);
    m.position.copy(a).addScaledVector(d, 0.5);
    m.quaternion.setFromUnitVectors(up, d.normalize());
    return m;
  };
  k.wire = (a, b) => k.rod(a, b, 0.012, k.dark, 4);
  k.V = (x, y, z) => new THREE.Vector3(x, y, z);
  k.regMat = paint(0xffffff, { map: regTexture(livery.reg), alphaTest: 0.5 });
  const { cream, trim, dark, metal, leather, V } = k;
  const skin = paint(0xe8b98f), glass = paint(0xcfe6f0, { transparent: true, opacity: 0.35 });

  // Fuselage, engine, wings, struts and main gear legs. Returns the aileron pivots, and optionally `eye` (the cockpit
  // camera, local), `exhausts` (the smoke points; the airframe then draws its own exhaust pipes) and
  // `openCockpit: false` (a cabin or canopy: no leather rim or windscreen)
  const air = (AIRFRAMES[livery.kind] ?? biplane)(k);
  const { ailL, ailR } = air;

  // Exhausts, propeller
  const exhaust = new THREE.CylinderGeometry(0.05, 0.06, 0.9, 6).rotateX(Math.PI / 2);
  if (!air.exhausts) for (const x of [-0.58, 0.58]) add(exhaust, dark, x, -0.28, -1.5);
  const prop = pivot(0, 0, -2.65);
  add(new THREE.SphereGeometry(0.18, 10, 8).scale(1, 1, 1.4), cream, 0, 0, -0.08, prop);
  const bladeMat = paint(0x7a5230, { transparent: true }); // fades out as the blur disc fades in
  const bladeGeo = new THREE.BoxGeometry(0.16, 2.6, 0.05);
  add(bladeGeo, bladeMat, 0, 0, 0, prop);
  add(bladeGeo, bladeMat, 0, 0, 0, prop).rotation.z = Math.PI / 2;
  const blur = add(new THREE.CircleGeometry(1.32, 32), new THREE.MeshBasicMaterial({
    map: blurTexture(), transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide,
  }), 0, 0, 0.03, prop);
  blur.castShadow = false;
  blur.visible = false;

  // Tail: tailplane and elevator, braced to the fin
  add(plate(3.2, 0.9, 0.08, 0.3), cream, 0, 0.05, 3.7);
  const elevator = pivot(0, 0.05, 4.15);
  add(plate(3.2, 0.5, 0.06, 0.2).translate(0, 0, 0.25), trim, 0, 0, 0, elevator);
  for (const s of [-1, 1]) k.wire(V(s * 1.5, 0.08, 3.7), V(0, 1.2, 3.8));
  // Fin and comma-shaped rudder, built in the (z, y) plane; the rudder hinge is its straight front edge
  const finShape = new THREE.Shape();
  finShape.moveTo(-0.45, -0.6);
  finShape.lineTo(0.45, -0.6);
  finShape.lineTo(0.45, 0.5);
  finShape.quadraticCurveTo(0.45, 0.62, 0.28, 0.62);
  finShape.quadraticCurveTo(-0.15, 0.62, -0.45, -0.6);
  const finGeo = new THREE.ExtrudeGeometry(finShape, { depth: 0.08, bevelEnabled: false, curveSegments: 8 }).rotateY(-Math.PI / 2).translate(0.04, 0, 0);
  add(finGeo, cream, 0, 0.65, 3.75);
  const rudShape = new THREE.Shape();
  rudShape.moveTo(0, -0.6);
  rudShape.lineTo(0, 0.5);
  rudShape.quadraticCurveTo(0.02, 0.78, 0.3, 0.8); // balance horn above the fin
  rudShape.quadraticCurveTo(0.62, 0.78, 0.62, 0.35);
  rudShape.quadraticCurveTo(0.62, -0.15, 0.3, -0.45);
  rudShape.quadraticCurveTo(0.18, -0.55, 0, -0.6);
  const rudGeo = new THREE.ExtrudeGeometry(rudShape, { depth: 0.07, bevelEnabled: false, curveSegments: 8 }).rotateY(-Math.PI / 2).translate(0.035, 0, 0);
  const ruv = rudGeo.attributes.uv; // normalize to the shape's bounds so the stripes span the whole rudder
  for (let i = 0; i < ruv.count; i++) ruv.setXY(i, ruv.getX(i) / 0.62, (ruv.getY(i) + 0.6) / 1.4);
  const rudder = pivot(0, 0.65, 4.2);
  add(rudGeo, paint(0xffffff, { map: rudderTexture(livery) }), 0, 0, 0, rudder);

  // Wheels with hub caps (their contact points set GEAR_H and the tail-down pitch), tail wheel
  const wheel = new THREE.CylinderGeometry(0.35, 0.35, 0.16, 18).rotateZ(Math.PI / 2);
  const hub = new THREE.CylinderGeometry(0.15, 0.15, 0.18, 12).rotateZ(Math.PI / 2);
  for (const x of [-0.9, 0.9]) { add(wheel, dark, x, -1.25, -1.2); add(hub, cream, x, -1.25, -1.2); }
  add(new THREE.CylinderGeometry(0.1, 0.1, 0.06, 10).rotateZ(Math.PI / 2), dark, 0, -0.6, 3.92);

  // Cockpit: padded rim and windscreen (unless the airframe encloses it), pilot with goggles and a scarf
  if (air.openCockpit !== false) {
    add(new THREE.TorusGeometry(0.4, 0.06, 8, 20).rotateX(Math.PI / 2), leather, 0, 0.55, 0.6);
    const screen = add(new THREE.BoxGeometry(0.5, 0.18, 0.02), glass, 0, 0.64, -0.05);
    screen.rotation.x = -0.35;
    screen.castShadow = false;
  }
  const pilot = pivot(0, 0.75, 0.6);
  add(new THREE.SphereGeometry(0.22, 12, 10), skin, 0, 0, 0, pilot);
  add(new THREE.SphereGeometry(0.235, 12, 10, 0, Math.PI * 2, 0, Math.PI / 2), leather, 0, 0.02, 0, pilot);
  const lens = new THREE.CylinderGeometry(0.06, 0.06, 0.05, 10).rotateX(Math.PI / 2);
  for (const x of [-0.08, 0.08]) add(lens, metal, x, 0.1, -0.2, pilot);
  const scarf = pivot(0.05, -0.15, 0.12, pilot);
  add(new THREE.BoxGeometry(0.1, 0.02, 0.7).translate(0, 0, 0.35), paint(0xf4f1ea), 0, 0, 0, scarf);
  // Arms (port, starboard), hanging inside the fuselage until a delivery scene raises one over the rim
  const arms = [-1, 1].map((s) => {
    const a = pivot(s * 0.3, -0.32, 0, pilot);
    add(new THREE.BoxGeometry(0.11, 0.55, 0.13), leather, 0, -0.26, 0, a);
    add(new THREE.SphereGeometry(0.065, 8, 6), skin, 0, -0.56, 0, a);
    return a;
  });

  const eye = air.eye ?? V(0, 1.0, 0.55), exhausts = air.exhausts ?? [V(-0.58, -0.28, -1.0), V(0.58, -0.28, -1.0)];
  return { group: g, prop, bladeMat, blur, ailL, ailR, elevator, rudder, pilot, scarf, arms, openCockpit: air.openCockpit !== false, eye, exhausts, t: 0 };
}

// Biplane: round fuselage, open cowling with a radial engine, two wings with struts and bracing wires
function biplane({ livery, add, pivot, wire, V, cream, trim, dark, metal, wood, leather, roundel, wing, regMat }) {
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

  // Turtle deck: a tapering spine from the cockpit down to the tail, with a padded headrest
  add(new THREE.CylinderGeometry(0.32, 0.06, 3, 10).rotateX(-Math.PI / 2), cream, 0, 0.26, 2.55).scale.set(0.85, 1, 1);
  add(new THREE.SphereGeometry(0.13, 10, 8), leather, 0, 0.52, 1.02).scale.set(1, 1.4, 0.7);

  // Wings (fabric ribs, rounded tips), roundels, struts and bracing wires
  add(plate(9.4, 1.4, 0.12, 0.55), wing, 0, 1.25, -1.1);
  add(plate(8.6, 1.3, 0.12, 0.5), wing, 0, -0.5, -0.8);
  const roundelOuter = new THREE.CircleGeometry(0.5, 24).rotateX(-Math.PI / 2);
  const roundelInner = new THREE.CircleGeometry(0.24, 24).rotateX(-Math.PI / 2);
  for (const x of [-3.3, 3.3]) {
    add(roundelOuter, cream, x, 1.316, -1.1);
    add(roundelInner, roundel, x, 1.318, -1.1);
  }
  // Under the lower wing (visible when the plane banks) and on the fuselage sides, with the registration
  const underOuter = new THREE.CircleGeometry(0.42, 24).rotateX(Math.PI / 2);
  const underInner = new THREE.CircleGeometry(0.2, 24).rotateX(Math.PI / 2);
  for (const x of [-2.9, 2.9]) {
    add(underOuter, cream, x, -0.566, -0.8);
    add(underInner, roundel, x, -0.568, -0.8);
  }
  const sideOuter = new THREE.CircleGeometry(0.26, 24), sideInner = new THREE.CircleGeometry(0.13, 24);
  const regGeo = new THREE.PlaneGeometry(0.85, 0.26);
  for (const s of [-1, 1]) {
    add(sideOuter, cream, s * 0.39, 0, 1.5).rotation.y = s * Math.PI / 2;
    add(sideInner, roundel, s * 0.4, 0, 1.5).rotation.y = s * Math.PI / 2;
    const reg = add(regGeo, regMat, s * 0.315, 0, 2.6);
    reg.rotation.y = s * Math.PI / 2;
    reg.castShadow = false;
  }
  const strut = new THREE.BoxGeometry(0.08, 1.75, 0.08);
  for (const x of [-3.4, 3.4]) for (const z of [-1.4, -0.55]) add(strut, wood, x, 0.375, z);
  const cabane = new THREE.BoxGeometry(0.07, 0.75, 0.07);
  for (const x of [-0.5, 0.5]) for (const z of [-1.5, -0.8]) add(cabane, wood, x, 0.85, z);
  for (const s of [-1, 1]) for (const z of [-1.4, -0.55]) {
    wire(V(s * 0.55, -0.45, z), V(s * 3.35, 1.2, z));
    wire(V(s * 0.55, 1.2, z), V(s * 3.35, -0.45, z));
  }

  // Ailerons on the top wing, hinged at its trailing edge
  const ailGeo = plate(2.4, 0.35, 0.07, 0.15).translate(0, 0, 0.17);
  const ailL = pivot(-3.3, 1.25, -0.4), ailR = pivot(3.3, 1.25, -0.4);
  add(ailGeo, trim, 0, 0, 0, ailL);
  add(ailGeo, trim, 0, 0, 0, ailR);

  // Main gear legs and axle, tail wheel leg
  for (const x of [-0.75, 0.75]) add(new THREE.BoxGeometry(0.08, 0.8, 0.08), dark, x, -0.85, -1.2);
  add(new THREE.BoxGeometry(1.7, 0.06, 0.06), dark, 0, -1.25, -1.2);
  add(new THREE.BoxGeometry(0.06, 0.4, 0.06), dark, 0, -0.4, 3.9);
  return { ailL, ailR };
}

// Parasol monoplane (Pietenpol-like): slab-sided fuselage with a cowled inline engine, one wing held above the
// cockpit on cabane and lift struts, a cutout in its trailing edge over the pilot, and split-axle gear
function parasol({ livery, add, pivot, rod, V, cream, trim, dark, metal, leather, roundel, wing, regMat }) {
  // Fuselage: level on top back to the cockpit, then sloping down to the tail post; square in section
  const top = (z) => z < 1.2 ? 0.5 : 0.5 - (z - 1.2) / 2.9 * 0.26;
  const bot = (z) => -0.5 + (z + 2) / 6.1 * 0.48;
  const half = (z) => z < -0.5 ? 0.46 : 0.46 - (z + 0.5) / 4.6 * 0.38;
  add(slab(-2, 4.1, 14, top, bot, half), cream, 0, 0, 0);
  // Cowl in the trim colour, a little narrower at the front, with louvres and a round air intake
  const cowlT = (z) => 0.5 + (z + 2) * 0.13, cowlB = (z) => -0.5 - (z + 2) * 0.13, cowlH = (z) => 0.465 + (z + 2) * 0.1;
  add(slab(-2.55, -1.95, 1, cowlT, cowlB, cowlH), trim, 0, 0, 0);
  const louvre = new THREE.BoxGeometry(0.02, 0.05, 0.3);
  for (const s of [-1, 1]) for (const y of [0.12, 0.24, 0.36]) add(louvre, dark, s * 0.45, y, -2.2);
  add(new THREE.CircleGeometry(0.3, 20).rotateY(Math.PI), dark, 0, 0, -2.556);

  // Cheatline along each side, then the roundel and registration on top of it
  const slope = Math.atan(0.38 / 4.6);
  const cheat = (off, y0, y1) => { // a ribbon on the side, following the taper, from y0 at the nose to y1 at the tail
    const pts = [], zs = [-1.95, -0.5, 3.4];
    for (const s of [-1, 1]) for (let i = 0; i < 2; i++) {
      const [za, zb] = [zs[i], zs[i + 1]], ya = y0 + (y1 - y0) * (za + 2) / 5.4, yb = y0 + (y1 - y0) * (zb + 2) / 5.4;
      const xa = s * (half(za) + off), xb = s * (half(zb) + off), w = 0.05;
      pts.push(xa, ya - w, za, xb, yb - w, zb, xb, yb + w, zb, xa, ya - w, za, xb, yb + w, zb, xa, ya + w, za);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    geo.computeVertexNormals();
    return geo;
  };
  add(cheat(0.004, 0.3, 0.17), paint(livery.trim, { side: THREE.DoubleSide }), 0, 0, 0).castShadow = false;
  const sideOuter = new THREE.CircleGeometry(0.28, 24), sideInner = new THREE.CircleGeometry(0.135, 24);
  const regGeo = new THREE.PlaneGeometry(0.85, 0.26);
  for (const s of [-1, 1]) {
    const ry = s * (Math.PI / 2 - slope), y = (top(1.5) + bot(1.5)) / 2;
    add(sideOuter, cream, s * (half(1.5) + 0.008), y, 1.5).rotation.y = ry;
    add(sideInner, roundel, s * (half(1.5) + 0.011), y, 1.5).rotation.y = ry;
    const reg = add(regGeo, regMat, s * (half(2.4) + 0.008), 0.02, 2.4);
    reg.rotation.y = ry;
    reg.castShadow = false;
  }
  add(new THREE.SphereGeometry(0.13, 10, 8), leather, 0, 0.56, 1.02).scale.set(1, 1.4, 0.7); // headrest

  // The wing, 1 m above the fuselage, in two halves with 2.5° of dihedral. Each half is a group hinged at the
  // centre of the wing's underside (y 1.48), so the undersides meet exactly and the tops cross in a clean crease;
  // its roundels (on top and underneath) and aileron ride in it. A half is the plate's outline cut at x = 0,
  // with half of the cockpit cutout, and UVs on the full span's footprint so the ribs run on across the seam.
  const DIH = 2.5 * Math.PI / 180, WW = 10.4, WD = 1.5, WT = 0.14, WR = 0.6, NW = 0.65, ND = 0.75 - 0.42;
  const halfWing = (s) => {
    const sh = new THREE.Shape(), hw = WW / 2, hd = WD / 2;
    sh.moveTo(0, -hd);
    sh.lineTo(s * (hw - WR), -hd);
    sh.quadraticCurveTo(s * hw, -hd, s * hw, -hd + WR);
    sh.lineTo(s * hw, hd - WR);
    sh.quadraticCurveTo(s * hw, hd, s * (hw - WR), hd);
    sh.lineTo(s * NW, hd);
    sh.quadraticCurveTo(s * NW, ND, 0, ND);
    sh.lineTo(0, -hd);
    const g = new THREE.ExtrudeGeometry(sh, { depth: WT, bevelEnabled: false, curveSegments: 5 }).rotateX(Math.PI / 2).translate(0, WT, 0);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / WW + 0.5, uv.getY(i) / WD + 0.5);
    return g;
  };
  const rise = (x) => Math.abs(x) * Math.tan(DIH); // height of the wing above its centre at span station x
  const upOuter = new THREE.CircleGeometry(0.55, 24).rotateX(-Math.PI / 2), upInner = new THREE.CircleGeometry(0.26, 24).rotateX(-Math.PI / 2);
  const dnOuter = new THREE.CircleGeometry(0.5, 24).rotateX(Math.PI / 2), dnInner = new THREE.CircleGeometry(0.24, 24).rotateX(Math.PI / 2);
  const ailGeo = plate(2.8, 0.35, 0.08, 0.15).translate(0, 0, 0.17);
  const ail = {};
  for (const s of [-1, 1]) {
    const w = pivot(0, 1.48, -0.95);
    w.rotation.z = s * DIH;
    add(halfWing(s), wing, 0, 0, 0, w);
    const x = s * 3.7;
    add(upOuter, cream, x, WT + 0.006, 0, w);
    add(upInner, roundel, x, WT + 0.008, 0, w);
    add(dnOuter, cream, x, -0.006, 0, w);
    add(dnInner, roundel, x, -0.008, 0, w);
    // Aileron outboard, hinged at the trailing edge; its pivot's x axis runs along the tilted span
    ail[s] = pivot(x, WT / 2, 0.75, w);
    add(ailGeo, trim, 0, 0, 0, ail[s]);
  }
  const ailL = ail[-1], ailR = ail[1];
  // Cabane struts from the top longerons to the wing's centre, lift struts from the bottom longerons out to its
  // spars, and a jury strut propping each lift strut; each top end sits 1 cm into the wing's underside
  const under = (x) => 1.49 + rise(x);
  for (const s of [-1, 1]) {
    for (const z of [-1.45, -0.55]) {
      rod(V(s * 0.42, 0.48, z), V(s * 0.3, under(0.3), z), 0.035, trim);
      const foot = V(s * 0.44, -0.4, z), tip = V(s * 3.1, under(3.1), z);
      rod(foot, tip, 0.045, trim);
      const mid = foot.clone().lerp(tip, 0.5);
      rod(mid, V(mid.x, under(mid.x), z), 0.025, trim);
    }
  }

  // Split-axle main gear: a V of legs from the bottom longerons to each hub, and a half-axle hinged under the belly
  for (const s of [-1, 1]) {
    const hub = V(s * 0.82, -1.25, -1.2);
    rod(V(s * 0.44, -0.45, -1.75), hub, 0.035, dark);
    rod(V(s * 0.44, -0.42, -0.7), hub, 0.035, dark);
    rod(V(s * 0.04, -0.46, -1.2), hub, 0.03, metal);
  }
  rod(V(0, bot(3.8) + 0.02, 3.8), V(0, -0.6, 3.92), 0.03, dark); // tail wheel leg
  return { ailL, ailR };
}

// Piecewise-linear profile through [z, value] points (clamped at the ends)
const lerpPts = (pts) => (z) => {
  if (z <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    const [z1, v1] = pts[i], [z0, v0] = pts[i - 1];
    if (z <= z1) return v0 + (v1 - v0) * (z - z0) / (z1 - z0);
  }
  return pts[pts.length - 1][1];
};

// One half (s = −1 left, 1 right) of a rectangular wing with rounded tips, its root at x = 0, underside at y = 0.
// UVs on the full span's footprint so the ribs run on across the seam.
function halfPlate(s, W, D, T, R) {
  const sh = new THREE.Shape(), hw = W / 2, hd = D / 2;
  sh.moveTo(0, -hd);
  sh.lineTo(s * (hw - R), -hd);
  sh.quadraticCurveTo(s * hw, -hd, s * hw, -hd + R);
  sh.lineTo(s * hw, hd - R);
  sh.quadraticCurveTo(s * hw, hd, s * (hw - R), hd);
  sh.lineTo(0, hd);
  sh.lineTo(0, -hd);
  const g = new THREE.ExtrudeGeometry(sh, { depth: T, bevelEnabled: false, curveSegments: 5 }).rotateX(Math.PI / 2).translate(0, T, 0);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / W + 0.5, uv.getY(i) / D + 0.5);
  return g;
}

// Cub-style bush plane: slab-sided fuselage with a glazed cabin tucked under a high wing, a flat-four whose cylinder
// heads stick out of the cowl, V lift struts, a lightning-bolt cheatline and fat tundra tyres
function bush({ livery, add, pivot, rod, V, cream, trim, dark, metal, leather, wing, regMat }) {
  // Fuselage in three slabs that meet end to end: the cowl (nose up to the firewall), the cabin's lower body (flat on
  // top at the window sills) and the rear fuselage, which falls from the cabin roof to the tail post
  const cowlT = lerpPts([[-2.55, 0.32], [-1.55, 0.62]]), cowlB = lerpPts([[-2.55, -0.3], [-1.55, -0.5]]);
  const cowlH = lerpPts([[-2.55, 0.3], [-1.55, 0.5]]);
  add(slab(-2.55, -1.55, 4, cowlT, cowlB, cowlH), cream, 0, 0, 0);
  add(slab(-1.55, 1.15, 1, () => 0.62, () => -0.5, () => 0.5), cream, 0, 0, 0);
  const aftT = lerpPts([[1.15, 1.12], [4.1, 0.24]]), aftB = lerpPts([[1.15, -0.5], [4.1, -0.02]]);
  const aftH = lerpPts([[1.15, 0.5], [4.1, 0.08]]);
  add(slab(1.15, 4.1, 8, aftT, aftB, aftH), cream, 0, 0, 0);
  const side = (z) => z < -1.55 ? cowlH(z) : z < 1.15 ? 0.5 : aftH(z); // half-width of the sides at z

  // Cabin glazing: one transparent slab whose sloping top is the windscreen and whose sides are the windows. Its
  // bottom and back end are buried in the fuselage, its roof sits a centimetre under the wing
  const glass = paint(0xcfe6f0, { transparent: true, opacity: 0.35 });
  const glassT = lerpPts([[-1.55, 0.6], [-0.95, 1.19], [0.75, 1.19], [1.15, 1.1], [1.25, 1.08]]);
  add(slab(-1.55, 1.25, 28, glassT, () => 0.5, () => 0.485), glass, 0, 0, 0).castShadow = false;
  // Inside: a canvas-lined floor at sill height, a padded instrument panel with three gauges, a seat back
  const inside = paint(0x8a7456), panel = paint(0x3a332c);
  add(new THREE.BoxGeometry(0.94, 0.02, 2.2), inside, 0, 0.63, 0.05).receiveShadow = true;
  add(new THREE.BoxGeometry(0.94, 0.24, 0.06), panel, 0, 0.75, -1.08);
  add(new THREE.CylinderGeometry(0.035, 0.035, 0.94, 8).rotateZ(Math.PI / 2), leather, 0, 0.875, -1.08); // padded top
  const gauge = new THREE.CircleGeometry(0.045, 14);
  for (const x of [-0.17, 0, 0.17]) add(gauge, metal, x, 0.77, -1.046).castShadow = false;
  // Control stick and rudder pedals in the footwell
  rod(V(0, 0.64, -0.2), V(0, 0.8, -0.26), 0.014, dark);
  add(new THREE.SphereGeometry(0.03, 8, 6), leather, 0, 0.81, -0.265);
  for (const x of [-0.16, 0.16]) add(new THREE.BoxGeometry(0.1, 0.07, 0.025), metal, x, 0.655, -0.85).rotation.x = -0.6;
  add(new THREE.BoxGeometry(0.5, 0.42, 0.08), leather, 0, 0.84, 0.95);
  // Window frames: windscreen posts, door posts, sills and roof rails, and a centre strip down the windscreen
  for (const s of [-1, 1]) {
    const x = s * 0.49;
    rod(V(x, 0.62, -1.55), V(x, 1.19, -0.95), 0.03, cream);
    rod(V(x, 0.62, 0.05), V(x, 1.19, 0.05), 0.03, cream);
    rod(V(x, 1.19, -0.95), V(x, 1.19, 0.75), 0.028, cream);
    rod(V(x, 1.19, 0.75), V(x, 1.11, 1.15), 0.028, cream);
    rod(V(x, 0.63, -1.55), V(x, 0.63, 1.15), 0.03, cream);
    rod(V(x, 0.62, 1.12), V(x, 1.11, 1.12), 0.03, cream);
    add(new THREE.BoxGeometry(0.02, 0.03, 0.12), dark, s * 0.505, 0.7, 0.18); // door handle
  }
  rod(V(0, 0.62, -1.55), V(0, 1.19, -0.95), 0.02, cream);

  // Engine: flat-four with finned cylinder heads poking out of the cowl on each side (the right bank a little
  // further forward), a nose bowl with two air intakes, a fuel cap and float-wire gauge ahead of the windscreen
  const barrel = new THREE.CylinderGeometry(0.1, 0.1, 0.24, 8).rotateZ(Math.PI / 2);
  const fin = new THREE.CylinderGeometry(0.135, 0.135, 0.02, 10).rotateZ(Math.PI / 2);
  const rocker = new THREE.BoxGeometry(0.05, 0.17, 0.15);
  for (const s of [-1, 1]) for (const z of [-2.28, -1.9].map((z) => z - (s > 0 ? 0.1 : 0))) {
    const x0 = side(z);
    add(barrel, metal, s * (x0 + 0.09), 0.05, z);
    for (let i = 0; i < 3; i++) add(fin, metal, s * (x0 + 0.03 + i * 0.055), 0.05, z);
    add(rocker, dark, s * (x0 + 0.225), 0.05, z);
  }
  const intake = new THREE.CircleGeometry(0.09, 16).rotateY(Math.PI);
  for (const x of [-0.17, 0.17]) add(intake, dark, x, -0.07, -2.556);
  add(new THREE.CylinderGeometry(0.2, 0.22, 0.08, 16).rotateX(Math.PI / 2), metal, 0, 0, -2.58); // prop flange
  add(new THREE.CylinderGeometry(0.05, 0.05, 0.05, 8), metal, 0, cowlT(-1.8) + 0.01, -1.8);
  rod(V(0, cowlT(-1.72), -1.72), V(0, cowlT(-1.72) + 0.2, -1.72), 0.008, metal, 4);
  // Exhaust stacks under the nose
  const pipe = new THREE.CylinderGeometry(0.045, 0.05, 0.5, 6).rotateX(Math.PI / 2);
  for (const x of [-0.18, 0.18]) add(pipe, dark, x, -0.53, -1.75);

  // Lightning-bolt cheatline: a black ribbon from the nose, zagging down under the cabin, then on to the tail. The
  // polyline gets extra points at the slab joins so it hugs each side's taper
  const bolt = [[-2.52, 0.04], [-0.35, 0.3], [0.2, -0.02], [0.55, 0.14], [4.0, 0.06]];
  const pts = [];
  for (let i = 0; i < bolt.length - 1; i++) {
    const [za, ya] = bolt[i], [zb, yb] = bolt[i + 1];
    pts.push(bolt[i]);
    for (const zj of [-1.55, 1.15]) if (zj > za && zj < zb) pts.push([zj, ya + (yb - ya) * (zj - za) / (zb - za)]);
  }
  pts.push(bolt[bolt.length - 1]);
  const rib = [], w = 0.045;
  for (const s of [-1, 1]) for (let i = 0; i < pts.length - 1; i++) {
    const [za, ya] = pts[i], [zb, yb] = pts[i + 1], xa = s * (side(za) + 0.005), xb = s * (side(zb) + 0.005);
    rib.push(xa, ya - w, za, xb, yb - w, zb, xb, yb + w, zb, xa, ya - w, za, xb, yb + w, zb, xa, ya + w, za);
  }
  const ribGeo = new THREE.BufferGeometry();
  ribGeo.setAttribute('position', new THREE.Float32BufferAttribute(rib, 3));
  ribGeo.computeVertexNormals();
  add(ribGeo, paint(livery.trim, { side: THREE.DoubleSide }), 0, 0, 0).castShadow = false;
  // Registration on the rear fuselage, above the stripe
  const regGeo = new THREE.PlaneGeometry(0.85, 0.26), taper = Math.atan(0.42 / 2.95);
  for (const s of [-1, 1]) {
    const reg = add(regGeo, regMat, s * (aftH(2.5) + 0.008), 0.42, 2.5);
    reg.rotation.y = s * (Math.PI / 2 - taper);
    reg.castShadow = false;
  }
  // A black disc with a yellow centre on each side of the fin (the Cub's bear badge, in spirit)
  const badgeO = new THREE.CircleGeometry(0.17, 20), badgeI = new THREE.CircleGeometry(0.1, 20);
  for (const s of [-1, 1]) {
    add(badgeO, trim, s * 0.046, 0.62, 3.95).rotation.y = s * Math.PI / 2;
    add(badgeI, cream, s * 0.048, 0.62, 3.95).rotation.y = s * Math.PI / 2;
  }

  // The wing, sitting right on the cabin roof: two halves with 1.5° of dihedral hinged at the centre of the
  // underside, rounded tips, ailerons outboard at the trailing edge
  const DIH = 1.5 * Math.PI / 180, WW = 10.7, WD = 1.7, WT = 0.16;
  const rise = (x) => Math.abs(x) * Math.tan(DIH);
  const ailGeo = plate(2.7, 0.36, 0.08, 0.15).translate(0, 0, 0.18);
  const ail = {};
  for (const s of [-1, 1]) {
    const wg = pivot(0, 1.2, -0.1);
    wg.rotation.z = s * DIH;
    add(halfPlate(s, WW, WD, WT, 0.6), wing, 0, 0, 0, wg).receiveShadow = true;
    ail[s] = pivot(s * 3.75, WT / 2, WD / 2, wg);
    add(ailGeo, wing, 0, 0, 0, ail[s]);
  }
  const ailL = ail[-1], ailR = ail[1];

  // V lift struts from the lower longerons to the front and rear spars, each with a jury strut to the wing
  const under = (x) => 1.21 + rise(x);
  for (const s of [-1, 1]) {
    const foot = V(s * 0.5, -0.36, -0.2);
    for (const z of [-0.65, 0.35]) {
      const tip = V(s * 3.2, under(3.2), z);
      rod(foot, tip, 0.04, cream);
      const mid = foot.clone().lerp(tip, 0.55);
      rod(mid, V(mid.x, under(mid.x), z), 0.022, cream);
    }
    add(new THREE.BoxGeometry(0.06, 0.12, 0.2), dark, s * 0.51, -0.36, -0.2); // strut fitting
  }

  // Main gear: a V of legs from the belly to each axle, a half-axle to the centre, and fat tundra tyres (wider,
  // not taller: the tread is still 0.35 from the hub, so the contact point stays at GEAR_H) with bright hub caps
  const prof = [];
  for (let i = 0; i <= 8; i++) {
    const a = -Math.PI / 2 + (i / 8) * Math.PI; // round-shouldered balloon section, 0.5 wide
    prof.push(new THREE.Vector2(0.13 + 0.22 * Math.pow(Math.max(Math.cos(a), 0), 0.6), 0.25 * Math.sin(a)));
  }
  const tyre = new THREE.LatheGeometry(prof, 18).rotateZ(Math.PI / 2);
  const cap = new THREE.CylinderGeometry(0.12, 0.13, 0.04, 14).rotateZ(Math.PI / 2);
  for (const s of [-1, 1]) {
    add(tyre, dark, s * 0.9, -1.25, -1.2);
    add(cap, cream, s * 1.15, -1.25, -1.2);
    add(cap, cream, s * 0.65, -1.25, -1.2);
    const hub = V(s * 0.63, -1.25, -1.2);
    rod(V(s * 0.3, -0.5, -1.65), hub, 0.035, cream);
    rod(V(s * 0.3, -0.5, -0.8), hub, 0.035, cream);
    rod(V(s * 0.03, -0.5, -1.2), hub, 0.03, metal);
    add(new THREE.CylinderGeometry(0.035, 0.035, 0.25, 6).rotateZ(Math.PI / 2), dark, s * 0.76, -1.25, -1.2); // axle
  }
  rod(V(0, aftB(3.8) + 0.02, 3.8), V(0, -0.6, 3.92), 0.03, dark); // tail wheel leg

  return {
    ailL, ailR,
    eye: V(0, 0.95, 0.25), // the pilot's eyes (leaning forward a little), under the wing root
    openCockpit: false,
    exhausts: [V(-0.18, -0.53, -1.45), V(0.18, -0.53, -1.45)],
  };
}

// Smooth profile through stations [z, v1, v2, …] (Catmull-Rom per value, clamped at the ends): f(z) → [z, v1, v2, …]
const smoothPts = (rows) => (z) => {
  let i = 0;
  while (i < rows.length - 2 && z > rows[i + 1][0]) i++;
  const p1 = rows[i], p2 = rows[i + 1], p0 = rows[i - 1] ?? p1, p3 = rows[i + 2] ?? p2;
  const t = THREE.MathUtils.clamp((z - p1[0]) / (p2[0] - p1[0]), 0, 1), t2 = t * t, t3 = t2 * t;
  return p1.map((_, j) => j === 0 ? z : 0.5 * (2 * p1[j] + (p2[j] - p0[j]) * t
    + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (3 * p1[j] - p0[j] - 3 * p2[j] + p3[j]) * t3));
};

// Superellipse cross-section along z: prof(z) → [z, yc, a, b, e] gives the centre height, half-width, half-height and
// squareness (2 = ellipse). φ runs from the bottom (0) up the +x side to the top (π); f0..f1 picks part of the loop
// (0.25..0.75 is the upper half). UVs: along z, then around (φ / 2π).
const sePow = (c, e) => Math.sign(c) * Math.pow(Math.abs(c), 2 / e);
function loft(prof, z0, z1, nz, nr, f0 = 0, f1 = 1) {
  const pos = [], uv = [], idx = [];
  for (let j = 0; j <= nz; j++) {
    const [z, yc, a, b, e] = prof(z0 + (z1 - z0) * j / nz);
    for (let i = 0; i <= nr; i++) {
      const u = f0 + (f1 - f0) * i / nr, f = u * Math.PI * 2;
      pos.push(a * sePow(Math.sin(f), e), yc - b * sePow(Math.cos(f), e), z);
      uv.push(j / nz, u);
    }
  }
  for (let j = 0; j < nz; j++) for (let i = 0; i < nr; i++) {
    const p = j * (nr + 1) + i, q = p + nr + 1;
    idx.push(p, p + 1, q, p + 1, q + 1, q);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Fox Moth-style island hopper: a cabin biplane. A deep, round-shouldered fuselage carries a glazed passenger cabin
// between the wings (two windows a side, a door on the port side), the pilot sits in the open cockpit behind it, an
// inverted inline four lives under a long rounded cowl, and the wings are swept a little, Moth fashion
function hopper({ livery, add, pivot, rod, wire, V, cream, trim, dark, metal, wood, leather, roundel, wing, regMat }) {
  // Fuselage: superellipse sections [z, centre y, half-width, half-height, squareness], nose cap to tail post
  const Z0 = -2.62, Z1 = 4.22;
  const body = smoothPts([
    [Z0, -0.02, 0.2, 0.2, 2], [-2.4, -0.01, 0.33, 0.35, 2.4], [-2.0, 0, 0.42, 0.45, 2.8], [-1.55, 0, 0.5, 0.54, 3],
    [-0.8, 0, 0.52, 0.56, 3], [-0.1, 0, 0.5, 0.54, 3], [0.6, -0.02, 0.44, 0.5, 2.8], [1.4, -0.02, 0.36, 0.42, 2.6],
    [2.4, 0, 0.24, 0.3, 2.4], [3.3, 0.04, 0.13, 0.18, 2.2], [Z1, 0.08, 0.015, 0.03, 2],
  ]);
  add(loft(body, Z0, Z1, 32, 20), cream, 0, 0, 0);
  add(new THREE.CircleGeometry(0.2, 16).rotateY(Math.PI), dark, 0, -0.02, Z0 + 0.005); // closes the nose round the spinner
  // Where the fuselage's skin is at height y, station z (for decals that hug it)
  const skinX = (z, y) => {
    const [, yc, a, b, e] = body(z), t = Math.min(1, Math.abs((y - yc) / b));
    return a * Math.pow(1 - Math.pow(t, e), 1 / e);
  };
  const decal = (w, h, zc, yc, mat, s, off, segs = 6) => {
    const g = new THREE.PlaneGeometry(w, h, segs, 3).rotateY(s * Math.PI / 2), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const z = p.getZ(i) + zc, y = p.getY(i) + yc;
      p.setXYZ(i, s * (skinX(z, y) + off), y, z);
    }
    g.computeVertexNormals();
    add(g, mat, 0, 0, 0).castShadow = false;
  };

  // Cheatline along the window sills from the cowl to the tail, the cabin door (port side: a dark seam round a
  // body-coloured panel, a handle and a step), two cabin windows a side (cream frames, dark glass), the roundel
  // and the registration aft
  const disc = (r, zc, yc, mat, s, off) => { // a circle decal hugging the skin
    const g = new THREE.CircleGeometry(r, 24).rotateY(s * Math.PI / 2), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const z = p.getZ(i) + zc, y = p.getY(i) + yc;
      p.setXYZ(i, s * (skinX(z, y) + off), y, z);
    }
    g.computeVertexNormals();
    add(g, mat, 0, 0, 0).castShadow = false;
  };
  const glass = paint(0x3b5a66), seam = paint(0x33402f);
  for (const s of [-1, 1]) {
    decal(5.7, 0.07, 0.75, 0.0, trim, s, 0.01, 40);
    if (s < 0) {
      decal(0.76, 1.02, -0.45, 0.0, seam, s, 0.014);
      decal(0.7, 0.96, -0.45, 0.0, cream, s, 0.018);
      add(new THREE.BoxGeometry(0.02, 0.03, 0.12), dark, s * (skinX(-0.2, -0.12) + 0.03), -0.12, -0.2);
      add(new THREE.BoxGeometry(0.22, 0.03, 0.14), dark, s * 0.6, -0.62, -0.45); // step
    }
    for (const zc of [-1.15, -0.45]) {
      decal(0.56, 0.4, zc, 0.26, trim, s, 0.022);
      decal(0.5, 0.34, zc, 0.26, glass, s, 0.026);
    }
    disc(0.26, 1.5, 0.0, trim, s, 0.012);
    disc(0.13, 1.5, 0.0, roundel, s, 0.016);
    decal(0.62, 0.19, 2.35, 0.06, regMat, s, 0.014);
  }
  add(new THREE.SphereGeometry(0.13, 10, 8), leather, 0, 0.52, 1.02).scale.set(1, 1.4, 0.7); // headrest


  // Engine: cowl louvres on each side, a filler cap on top, and the inline four's exhaust manifold running down the
  // port side to a stub under the cabin's front window
  const louvre = new THREE.BoxGeometry(0.02, 0.05, 0.28);
  for (const s of [-1, 1]) for (const y of [0.1, 0.22, 0.34]) add(louvre, dark, s * (skinX(-1.95, y) + 0.005), y, -1.95);
  add(new THREE.CylinderGeometry(0.05, 0.05, 0.05, 8), metal, 0, body(-1.75)[1] + body(-1.75)[3] + 0.01, -1.75);
  const px = (z) => -(skinX(z, -0.3) + 0.04);
  rod(V(px(-2.25), -0.3, -2.25), V(px(-1.0), -0.3, -1.0), 0.04, dark);
  for (const z of [-2.15, -1.95, -1.75, -1.55]) rod(V(px(z) + 0.03, -0.18, z), V(px(z), -0.3, z), 0.025, dark);
  rod(V(px(-1.0), -0.3, -1.0), V(px(-0.9) - 0.04, -0.42, -0.72), 0.04, dark);

  // Wings: two fabric panels swept back 6° (both edges parallel, Moth fashion), the top one 1.25 m up and a little
  // ahead of the lower, which passes through the fuselage under the windows. zw(x, z) is where a chord line at
  // root station z has moved to at span station x.
  const SWEEP = 6 * Math.PI / 180, TAN = Math.tan(SWEEP), zw = (x, z) => z + Math.abs(x) * TAN;
  const swept = (geo) => { // shear a plate into a swept panel
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) p.setZ(i, zw(p.getX(i), p.getZ(i)));
    geo.computeVertexNormals();
    return geo;
  };
  const TOP = { y: 1.25, z: -1.1, w: 9.4, d: 1.4 }, LOW = { y: -0.42, z: -0.8, w: 8.8, d: 1.3 };
  add(swept(plate(TOP.w, TOP.d, 0.12, 0.55)), wing, 0, TOP.y, TOP.z);
  add(swept(plate(LOW.w, LOW.d, 0.12, 0.5)), wing, 0, LOW.y, LOW.z);
  const roundelOuter = new THREE.CircleGeometry(0.5, 24).rotateX(-Math.PI / 2);
  const roundelInner = new THREE.CircleGeometry(0.24, 24).rotateX(-Math.PI / 2);
  for (const x of [-3.3, 3.3]) {
    add(roundelOuter, cream, x, TOP.y + 0.066, zw(x, TOP.z));
    add(roundelInner, roundel, x, TOP.y + 0.068, zw(x, TOP.z));
  }
  const underOuter = new THREE.CircleGeometry(0.42, 24).rotateX(Math.PI / 2);
  const underInner = new THREE.CircleGeometry(0.2, 24).rotateX(Math.PI / 2);
  for (const x of [-2.9, 2.9]) {
    add(underOuter, cream, x, LOW.y - 0.066, zw(x, LOW.z));
    add(underInner, roundel, x, LOW.y - 0.068, zw(x, LOW.z));
  }
  // Interplane struts and bracing wires at two chord stations, cabane N-struts from the cabin roof to the top wing
  for (const s of [-1, 1]) for (const z of [-1.4, -0.55]) {
    const x = s * 3.4;
    rod(V(x, LOW.y + 0.05, zw(x, z)), V(x, TOP.y - 0.05, zw(x, z)), 0.045, wood, 8);
    wire(V(s * 0.55, LOW.y + 0.05, zw(0.55, z)), V(s * 3.35, TOP.y - 0.05, zw(3.35, z)));
    wire(V(s * 0.5, TOP.y - 0.05, zw(0.5, z)), V(s * 3.35, LOW.y + 0.05, zw(3.35, z)));
  }
  for (const s of [-1, 1]) {
    for (const z of [-1.5, -0.75]) rod(V(s * 0.4, body(z)[1] + body(z)[3] - 0.01, z), V(s * 0.5, TOP.y - 0.05, z), 0.035, wood, 8);
    rod(V(s * 0.4, body(-1.5)[1] + body(-1.5)[3] - 0.01, -1.5), V(s * 0.5, TOP.y - 0.05, -0.75), 0.03, wood, 8);
  }

  // Ailerons on the lower wing, outboard, hinged along the swept trailing edge (the pivot is yawed to follow it,
  // so its x axis runs along the hinge and syncPlane's rotation.x works it)
  const ailGeo = plate(2.3, 0.34, 0.07, 0.15).translate(0, 0, 0.17), ail = {};
  for (const s of [-1, 1]) {
    const x = s * 3.1;
    ail[s] = pivot(x, LOW.y, zw(x, LOW.z + LOW.d / 2));
    ail[s].rotation.order = 'YXZ';
    ail[s].rotation.y = -s * SWEEP;
    add(ailGeo, roundel, 0, 0, 0, ail[s]);
  }

  // Split-axle main gear: a V of legs from the lower longerons to each hub, a half-axle hinged under the belly,
  // then the tail wheel leg
  for (const s of [-1, 1]) {
    const hub = V(s * 0.82, -1.25, -1.2);
    rod(V(s * 0.46, -0.5, -1.75), hub, 0.035, dark);
    rod(V(s * 0.46, -0.48, -0.7), hub, 0.035, dark);
    rod(V(s * 0.04, -0.54, -1.2), hub, 0.03, metal);
  }
  rod(V(0, body(3.8)[1] - body(3.8)[3] + 0.03, 3.8), V(0, -0.6, 3.92), 0.03, dark);

  return {
    ailL: ail[-1], ailR: ail[1],
    exhausts: [V(-0.6, -0.44, -0.6), V(-0.6, -0.44, -0.6)], // both smoke points at the single stub, port side
  };
}

const AIRFRAMES = { biplane, parasol, bush, hopper };

export function syncPlane(p, f, dt) {
  p.t += dt;
  p.group.position.copy(f.pos);
  p.group.quaternion.copy(f.q);
  const rate = f.state === 'crashed' ? 0 : 6 + f.throttle * 60;
  p.prop.rotation.z += rate * dt;
  // Crossfade the blades into the blur disc as the prop spins up
  const b = THREE.MathUtils.clamp((rate - 12) / 35, 0, 1);
  p.bladeMat.opacity = 1 - b * 0.8;
  p.blur.material.opacity = b * 0.75;
  p.blur.visible = b > 0.02;
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
