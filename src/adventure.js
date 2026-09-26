import * as THREE from 'three';
import { STRIPS, LIGHTHOUSE, VOLCANO } from './world.js';
import { paint } from './style.js';

// Adventure mode, "Island Air Mail": a cosy chain of deliveries. No timers and no failing: a crash just puts you
// back at the start of the delivery (R). Progress is saved after every delivery and resumes at the next one.
const SAVE_KEY = 'biplane.adventure.v1';
const strip = (name) => STRIPS.find((s) => s.name === name);
const home = (name, dir) => ({ strip: strip(name), dir });

// Recipient looks: shirt, trousers, hat colour + hat style ('straw' | 'cap' | 'bun')
const MISSIONS = [
  {
    title: 'The First Round',
    start: home('Airfield', 1),
    brief: 'The islands have gone a long while without a mail pilot. Old Tom at the airfield hands you a satchel of letters and a thermos of tea.\n\nFirst stop: Maud\'s farm by the Meadow strip, just to the north. Take off, follow the gold beacon and land gently on the grass.',
    steps: [{ type: 'land', strip: 'Meadow strip' }],
    recipient: { name: 'Maud', shirt: 0xc0473a, legs: 0x5a6b8a, hat: 0xe0c070, style: 'straw' },
    thanks: '"The seed catalogue, at last!" Maud tucks the letters under her arm. "Come back at harvest time, I\'ll have plums for you."',
  },
  {
    title: 'The Lighthouse Parcel',
    start: home('Meadow strip', -1),
    brief: 'Maud has a parcel for her brother Elias, keeper of the lighthouse on the east coast: a jar of plum jam and a new wick for the lamp.\n\nFly past the lighthouse so Elias knows you\'re coming, then land on the Beach strip.',
    steps: [
      { type: 'pass', label: 'Fly past the lighthouse', x: LIGHTHOUSE.x, z: LIGHTHOUSE.z, r: 160 },
      { type: 'land', strip: 'Beach strip' },
    ],
    recipient: { name: 'Elias', shirt: 0x2f3f5c, legs: 0x3a3230, hat: 0x1f2a40, style: 'cap' },
    thanks: '"A new wick! The lamp was getting sulky." Elias has the jam open before you\'ve even climbed down.',
  },
  {
    title: 'Across the Strait',
    start: home('Beach strip', 1),
    brief: 'Elias points east, across the water, to the green island with the sleeping volcano. "A letter for Juniper. She\'s opened a tea house up on the Headland."\n\nCome in from the sea, over the cliff edge, and land heading inland.',
    steps: [{ type: 'land', strip: 'Headland' }],
    recipient: { name: 'Juniper', shirt: 0x3f8c80, legs: 0x3f8c80, hat: 0x5a3a26, style: 'bun' },
    thanks: '"From my sister!" Juniper presses a tin of ginger biscuits into your hands. "For the road. And do stop by for tea."',
  },
  {
    title: 'Up the Volcano',
    start: home('Headland', -1),
    brief: 'The crater hamlet only gets news by air, and today Granny Ada turns ninety. Juniper has baked her a cake.\n\nTake off over the cliff. There\'s a gap in the crater\'s western rim: line up with it and fly in low. Go gently, it\'s a cake.',
    steps: [
      { type: 'pass', label: 'Line up with the gap in the rim', x: VOLCANO.x + VOLCANO.bx * 700, z: VOLCANO.z + VOLCANO.bz * 700, r: 130 },
      { type: 'land', strip: 'Caldera' },
    ],
    recipient: { name: 'Granny Ada', shirt: 0x8a5a9a, legs: 0x8a5a9a, hat: 0xd8d4cc, style: 'bun' },
    thanks: 'The whole hamlet comes out to sing. Granny Ada cuts the cake and saves you the very first slice.',
  },
];
const FINAL = {
  title: 'Mail Pilot of the Islands',
  body: 'Every letter delivered, every parcel in one piece. The islands have a mail pilot again.\n\nMore rounds are coming. Until then, the sky is yours.',
};

const load = () => {
  try { return { mission: 0, done: false, ...JSON.parse(localStorage.getItem(SAVE_KEY)) }; } catch { return { mission: 0, done: false }; }
};
const store = (s) => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(s)); } catch { /* private window: progress lasts this session */ } };

// A small villager in the same chunky style as the pilot; faces local +Z
function makeVillager(look) {
  const g = new THREE.Group(), skin = paint(0xe8b894), shirt = paint(look.shirt), legs = paint(look.legs), hat = paint(look.hat);
  const add = (geo, mat, x, y, z, parent = g) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    parent.add(m);
    return m;
  };
  const pivot = (x, y, z) => { const p = new THREE.Group(); p.position.set(x, y, z); g.add(p); return p; };
  const legL = pivot(-0.1, 0.85, 0), legR = pivot(0.1, 0.85, 0), armL = pivot(-0.29, 1.5, 0), armR = pivot(0.29, 1.5, 0);
  for (const l of [legL, legR]) add(new THREE.BoxGeometry(0.15, 0.85, 0.17), legs, 0, -0.425, 0, l);
  for (const a of [armL, armR]) {
    add(new THREE.BoxGeometry(0.11, 0.55, 0.13), shirt, 0, -0.26, 0, a);
    add(new THREE.SphereGeometry(0.065, 8, 6), skin, 0, -0.56, 0, a);
  }
  add(new THREE.CylinderGeometry(0.2, 0.23, 0.72, 10), shirt, 0, 1.2, 0);
  add(new THREE.SphereGeometry(0.16, 12, 10), skin, 0, 1.72, 0);
  if (look.style === 'straw') {
    add(new THREE.CylinderGeometry(0.36, 0.36, 0.025, 16), hat, 0, 1.83, 0);
    add(new THREE.CylinderGeometry(0.14, 0.16, 0.14, 12), hat, 0, 1.9, 0);
  } else if (look.style === 'cap') {
    add(new THREE.CylinderGeometry(0.17, 0.17, 0.09, 12), hat, 0, 1.85, 0);
    add(new THREE.BoxGeometry(0.22, 0.02, 0.14), hat, 0, 1.81, 0.15);
  } else {
    add(new THREE.SphereGeometry(0.168, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), hat, 0, 1.73, -0.01);
    add(new THREE.SphereGeometry(0.08, 8, 6), hat, 0, 1.82, -0.15);
  }
  return { g, legL, legR, armL, armR };
}

function makeParcel() {
  const g = new THREE.Group();
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.3, 0.36), paint(0xb88a5a));
  const twine = paint(0xf2e8cc);
  g.add(box, new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.31, 0.04), twine), new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.31, 0.37), twine));
  g.children.forEach((c) => { c.castShadow = true; });
  return g;
}

// Soft gold column marking the current objective, visible through the haze, fading near the top and up close
function makeBeacon() {
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 } },
    vertexShader: /* glsl */ `
      varying float vY;
      varying float vD;
      void main() {
        vY = uv.y;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vD = length(cameraPosition.xz - wp.xz);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      varying float vY;
      varying float vD;
      void main() {
        float a = pow(1.0 - vY, 1.6) * (0.28 + 0.07 * sin(uTime * 2.0)) * smoothstep(40.0, 160.0, vD);
        gl_FragColor = vec4(1.0, 0.78, 0.35, a);
      }`,
  });
  const m = new THREE.Mesh(new THREE.CylinderGeometry(7, 7, 420, 20, 1, true).translate(0, 210, 0), mat);
  m.renderOrder = 2;
  m.visible = false;
  return m;
}

export function createAdventure({ scene, world, flight, fly }) {
  let mode = 'off', mission = 0, step = 0, deliver = null, onCard = null;
  const beacon = makeBeacon();
  scene.add(beacon);

  // ---- story cards (a typed letter over the scene) ----
  const card = document.getElementById('story');
  const $ = (sel) => card.querySelector(sel);
  function showCard({ kicker, title, body, stamp = '', button }, then) {
    $('.kicker').textContent = kicker;
    $('h2').textContent = title;
    $('.body').textContent = body;
    $('.stamp').textContent = stamp;
    $('.stamp').hidden = !stamp;
    $('button').textContent = button;
    card.hidden = false;
    document.activeElement?.blur?.(); // Enter is handled once, by update(); a focused button would fire a second time
    onCard = then;
  }
  function closeCard() {
    card.hidden = true;
    const f = onCard;
    onCard = null;
    f?.();
  }
  $('button').addEventListener('click', closeCard);

  const M = () => MISSIONS[mission];
  const target = () => {
    if (mode !== 'fly') return null;
    const s = M().steps[step];
    if (s.type === 'pass') return { label: s.label, x: s.x, z: s.z };
    const st = strip(s.strip);
    return { label: `Deliver to ${M().recipient.name} · ${st.name}`, x: st.x, z: st.z };
  };

  function brief() {
    mode = 'brief';
    fly(M().start);
    showCard({ kicker: `Delivery ${mission + 1} of ${MISSIONS.length}`, title: M().title, body: M().brief, button: 'Take off' }, () => { mode = 'fly'; step = 0; });
  }

  // ---- delivery scene: the recipient walks up, takes the parcel, and is delighted ----
  function startDelivery() {
    mode = 'deliver';
    flight.throttle = 0;
    const h = flight.heading, fx = -Math.sin(h), fz = -Math.cos(h);
    let side = 1; // walk up on the right unless that side is water or steep
    const ok = (sx) => { const x = flight.pos.x - fz * sx * 9, z = flight.pos.z + fx * sx * 9; return world.groundAt(x, z) > 1.5 && world.slopeAt(x, z) < 0.3; };
    if (!ok(1) && ok(-1)) side = -1;
    const rx = -fz * side, rz = fx * side;
    const at = (x, z) => new THREE.Vector3(x, world.groundAt(x, z), z);
    const from = at(flight.pos.x + rx * 9 + fx * 3, flight.pos.z + rz * 9 + fz * 3), to = at(flight.pos.x + rx * 2.4 - fx * 1.5, flight.pos.z + rz * 2.4 - fz * 1.5); // beside the cockpit, behind the wing
    const v = makeVillager(M().recipient), parcel = makeParcel();
    scene.add(v.g, parcel);
    parcel.visible = false;
    const sink = flight.lastSink ?? 2;
    deliver = {
      t: 0, v, parcel, from, to, walk: from.distanceTo(to) / 1.6, seat: new THREE.Vector3(flight.pos.x - fx * 0.8, flight.pos.y + 1.1, flight.pos.z - fz * 0.8),
      stamp: sink < 1.2 ? 'Postmark: butter-smooth landing' : sink < 2.4 ? 'Postmark: gentle landing' : 'Postmark: a bit of a bump, parcel fine',
      centre: at((flight.pos.x + to.x) / 2, (flight.pos.z + to.z) / 2).add(new THREE.Vector3(0, 1, 0)),
      angle: Math.atan2(rz - fz * 0.8, rx - fx * 0.8), // rear quarter on the recipient's side: the handover in front, the wing behind it
    };
  }

  function updateDelivery(dt) {
    const d = deliver, v = d.v;
    d.t += dt;
    const t = d.t, g = v.g;
    const ground = (x, z) => world.groundAt(x, z);
    let yaw, hop = 0, swing = 0, armsUp = 0, wave = 0;
    if (t < d.walk) { // walk in
      const k = t / d.walk;
      g.position.lerpVectors(d.from, d.to, k);
      yaw = Math.atan2(d.to.x - d.from.x, d.to.z - d.from.z);
      swing = Math.sin(t * 9) * 0.6;
    } else {
      g.position.copy(d.to);
      yaw = Math.atan2(flight.pos.x - d.to.x, flight.pos.z - d.to.z);
      const u = t - d.walk;
      if (u < 1.2) armsUp = Math.min(1, u * 2.5); // reach for the parcel
      else { hop = Math.abs(Math.sin((u - 1.2) * 6)) * 0.25 * (u < 3.2 ? 1 : 0); armsUp = 0.35; wave = Math.sin(u * 10) * 0.5 + 2.4; }
      // parcel arcs from the cockpit into their hands
      const hands = new THREE.Vector3(d.to.x + Math.sin(yaw) * 0.35, ground(d.to.x, d.to.z) + 1.15 + hop, d.to.z + Math.cos(yaw) * 0.35);
      const k = THREE.MathUtils.clamp((u - 0.2) / 0.9, 0, 1);
      d.parcel.visible = true;
      d.parcel.position.lerpVectors(d.seat, hands, k);
      d.parcel.position.y += Math.sin(k * Math.PI) * 1.6;
      d.parcel.rotation.set(0, yaw + k * 3, 0);
      if (u > 3.8 && mode === 'deliver') thanks();
    }
    g.position.y = ground(g.position.x, g.position.z) + hop;
    g.rotation.y = yaw;
    v.legL.rotation.x = swing; v.legR.rotation.x = -swing;
    v.armL.rotation.x = -swing * 0.7 - armsUp * 1.3; v.armR.rotation.x = swing * 0.7 - armsUp * 1.3;
    v.armR.rotation.z = wave ? wave : 0;
    v.armL.rotation.z = 0;
  }

  function clearDelivery() {
    if (!deliver) return;
    scene.remove(deliver.v.g, deliver.parcel);
    deliver = null;
  }

  function thanks() {
    mode = 'thanks';
    const last = mission === MISSIONS.length - 1;
    store(last ? { mission: 0, done: true } : { mission: mission + 1, done: false });
    showCard({ kicker: `Delivered to ${M().recipient.name}`, title: M().title, body: M().thanks, stamp: deliver.stamp, button: last ? 'Read the last letter' : 'Next delivery' }, () => {
      clearDelivery();
      if (!last) { mission++; brief(); return; }
      mode = 'final';
      showCard({ kicker: 'Island Air Mail', title: FINAL.title, body: FINAL.body, button: 'Keep flying' }, () => { mode = 'off'; });
    });
  }

  return {
    get active() { return mode !== 'off'; },
    get holdsPlane() { return mode === 'brief' || mode === 'deliver' || mode === 'thanks' || mode === 'final'; },
    get target() { return target(); },
    summary() {
      const s = load();
      if (s.done) return 'Completed · fly the round again';
      if (s.mission === 0) return `New · ${MISSIONS.length} deliveries to make`;
      return `Resume · delivery ${s.mission + 1} of ${MISSIONS.length}: ${MISSIONS[s.mission].title}`;
    },
    get hasProgress() { const s = load(); return s.done || s.mission > 0; },
    begin() {
      clearDelivery();
      const s = load();
      mission = s.done ? 0 : Math.min(s.mission, MISSIONS.length - 1);
      brief();
    },
    stop() {
      mode = 'off';
      card.hidden = true;
      onCard = null;
      clearDelivery();
      beacon.visible = false;
    },
    reset() { store({ mission: 0, done: false }); },
    update(dt, input, live) {
      beacon.material.uniforms.uTime.value += dt;
      if (live && !card.hidden && (input.consume('Enter') || input.consume('Space'))) closeCard();
      const tg = target();
      beacon.visible = !!tg;
      if (tg) beacon.position.set(tg.x, world.groundAt(tg.x, tg.z), tg.z);
      if (mode === 'fly') {
        const s = M().steps[step];
        if (s.type === 'pass' && flight.state === 'air' && Math.hypot(flight.pos.x - s.x, flight.pos.z - s.z) < s.r) step++;
        else if (s.type === 'land' && flight.state === 'ground' && flight.flown && flight.speed < 0.5 && world.stripAt(flight.pos.x, flight.pos.z) === strip(s.strip)) startDelivery();
      }
      if (deliver) updateDelivery(dt);
    },
    // Delivery camera: a slow orbit around the plane and the recipient
    shot(camera, dt) {
      if (!deliver) return false;
      const d = deliver, c = d.centre;
      d.angle += dt * 0.12;
      const x = c.x + Math.cos(d.angle) * 13, z = c.z + Math.sin(d.angle) * 13;
      const p = new THREE.Vector3(x, Math.max(c.y + 2.5, world.groundAt(x, z) + 2), z);
      camera.position.lerp(p, 1 - Math.exp(-dt * 2.5));
      camera.up.set(0, 1, 0);
      camera.lookAt(c.x, c.y + 0.4, c.z);
      return true;
    },
  };
}
