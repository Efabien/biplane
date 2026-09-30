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

  // Fuselage, engine, wings, struts and main gear legs; returns the aileron pivots
  const { ailL, ailR } = livery.kind === 'parasol' ? parasol(k) : biplane(k);

  // Exhausts, propeller
  const exhaust = new THREE.CylinderGeometry(0.05, 0.06, 0.9, 6).rotateX(Math.PI / 2);
  for (const x of [-0.58, 0.58]) add(exhaust, dark, x, -0.28, -1.5);
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

  return { group: g, prop, bladeMat, blur, ailL, ailR, elevator, rudder, pilot, scarf, t: 0 };
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
