import * as THREE from 'three';
import { STRIPS, LIGHTHOUSE, CASTLE, VOLCANO, SEAFORT, SEA_LIGHT, VALE, VALE_CABINS, valeUV, valeXZ } from './world.js';
import { paint } from './style.js';

// Adventure mode, "Island Air Mail": cosy chapters of deliveries. No timers and no failing: a crash just puts you
// back at the start of the delivery (R). Progress is saved after every delivery and resumes at the next one;
// a chapter unlocks once the one before it is finished.
const SAVE_KEY = 'biplane.adventure.v1';
const strip = (name) => STRIPS.find((s) => s.name === name);
const home = (name, dir) => ({ strip: strip(name), dir });
const RIM_GAP = { x: VOLCANO.x + VOLCANO.bx * 700, z: VOLCANO.z + VOLCANO.bz * 700 };
// Pine Vale landmarks: the cabin nearest a distance up the valley, and the pool in front of the waterfall
const cabin = (u) => { const c = VALE_CABINS.reduce((a, b) => (Math.abs(valeUV(b.x, b.z)[0] - u) < Math.abs(valeUV(a.x, a.z)[0] - u) ? b : a)); return { x: c.x, z: c.z }; };
const [fallX, fallZ] = valeXZ(VALE.fall - 160, 0);

// Villagers: shirt, trousers, hat colour + hat style ('straw' | 'cap' | 'bun')
const PEOPLE = {
  maud: { name: 'Maud', shirt: 0xc0473a, legs: 0x5a6b8a, hat: 0xe0c070, style: 'straw' },
  elias: { name: 'Elias', shirt: 0x2f3f5c, legs: 0x3a3230, hat: 0x1f2a40, style: 'cap' },
  juniper: { name: 'Juniper', shirt: 0x3f8c80, legs: 0x3f8c80, hat: 0x5a3a26, style: 'bun' },
  ada: { name: 'Granny Ada', shirt: 0x8a5a9a, legs: 0x8a5a9a, hat: 0xd8d4cc, style: 'bun' },
  bram: { name: 'Bram', shirt: 0x6b7a3a, legs: 0x4a4038, hat: 0x4a5a2a, style: 'cap' },
  nell: { name: 'Nell', shirt: 0xe0a33a, legs: 0x3f6f8a, hat: 0xf2e8cc, style: 'straw' },
  hilde: { name: 'Hilde', shirt: 0x9a3a2e, legs: 0x3a3a3a, hat: 0x2e4a3a, style: 'cap' },
  // only ever met from the air (parcels are dropped to them)
  garrison: { name: 'The sea fort' }, oskar: { name: 'Oskar' }, lindqvists: { name: 'The Lindqvists' }, per: { name: 'Old Per' }, wren: { name: 'Wren' },
};

// Steps: 'land' (deliver to `who`), 'pickup' (`who` loads the plane), 'pass' (fly near a point), 'circle' (loop around it),
// 'drop' (fly over a point within `r`, lower than `agl` metres above the ground or sea: a parcel floats down on a parachute;
// `deck` = a platform it can land on, e.g. the sea fort's).
// `say` is the card after a step; the last step's card is the mission's `thanks`. `flag` is set when the step is done.
const CHAPTERS = [
  {
    title: 'The New Mail Pilot',
    final: {
      title: 'Mail Pilot of the Islands',
      body: 'Every letter delivered, every parcel in one piece. The islands have a mail pilot again.\n\nWord is getting around. When you\'re ready, a new chapter is waiting in the menu.',
    },
    missions: [
      {
        title: 'The First Round',
        start: home('Airfield', 1),
        brief: 'The islands have gone a long while without a mail pilot. Old Tom at the airfield hands you a satchel of letters and a thermos of tea.\n\nFirst stop: Maud\'s farm by the Meadow strip, just to the north. Take off, follow the gold beacon and land gently on the grass.',
        steps: [{ type: 'land', strip: 'Meadow strip', who: 'maud' }],
        thanks: '"The seed catalogue, at last!" Maud tucks the letters under her arm. "Come back at harvest time, I\'ll have plums for you."',
      },
      {
        title: 'The Lighthouse Parcel',
        start: home('Meadow strip', -1),
        brief: 'Maud has a parcel for her brother Elias, keeper of the lighthouse on the east coast: a jar of plum jam and a new wick for the lamp.\n\nFly past the lighthouse so Elias knows you\'re coming, then land on the Beach strip.',
        steps: [
          { type: 'pass', label: 'Fly past the lighthouse', x: LIGHTHOUSE.x, z: LIGHTHOUSE.z, r: 160 },
          { type: 'land', strip: 'Beach strip', who: 'elias' },
        ],
        thanks: '"A new wick! The lamp was getting sulky." Elias has the jam open before you\'ve even climbed down.',
      },
      {
        title: 'Across the Strait',
        start: home('Beach strip', 1),
        brief: 'Elias points east, across the water, to the green island with the sleeping volcano. "A letter for Juniper. She\'s opened a tea house up on the Headland."\n\nCome in from the sea, over the cliff edge, and land heading inland.',
        steps: [{ type: 'land', strip: 'Headland', who: 'juniper' }],
        thanks: '"From my sister!" Juniper presses a tin of ginger biscuits into your hands. "For the road. And do stop by for tea."',
      },
      {
        title: 'Up the Volcano',
        start: home('Headland', -1),
        brief: 'The crater hamlet only gets news by air, and today Granny Ada turns ninety. Juniper has baked her a cake.\n\nTake off over the cliff. There\'s a gap in the crater\'s western rim: line up with it and fly in low. Go gently, it\'s a cake.',
        steps: [
          { type: 'pass', label: 'Line up with the gap in the rim', ...RIM_GAP, r: 130 },
          { type: 'land', strip: 'Caldera', who: 'ada' },
        ],
        thanks: 'The whole hamlet comes out to sing. Granny Ada cuts the cake and saves you the very first slice.',
      },
    ],
  },
  {
    title: 'Harvest Season',
    intro: 'The plums are ripe, the evenings are drawing in, and the castle is planning its harvest fair.\n\nThese days everybody on the islands knows the sound of your engine. The mail bag has never been fuller.',
    final: {
      title: 'The Harvest Fair',
      body: 'On Saturday the whole island turns out at the castle. There\'s plum jam on every table, the lighthouse sweeps the sea at dusk, and a certain flock of sheep has pride of place.\n\nYou fly over in your new scarf, and everybody waves.',
    },
    missions: [
      {
        title: 'Plums for the Tea House',
        start: home('Airfield', 1),
        brief: 'Maud kept her promise: the plums are in. Juniper wants every last one for jam.\n\nLand at the Meadow strip to load the baskets, then carry them across the strait to the Headland.',
        steps: [
          { type: 'pickup', strip: 'Meadow strip', who: 'maud', item: 'plums', say: 'Maud heaves two baskets of plums into the front locker. "Mind the bumps, they bruise." Off to the Headland.' },
          { type: 'land', strip: 'Headland', who: 'juniper' },
        ],
        thanks: 'Juniper is already warming the jam pan. "Plum and ginger, I think. You\'ll have the first jar."',
      },
      {
        title: 'The Keeper\'s Evening',
        start: home('Headland', -1),
        time: 'dusk',
        brief: 'The sun is going down and Elias has run out of lamp oil. Juniper fills a can from the tea house store.\n\nGet it to the Beach strip before dark, then fly past the lighthouse to see the lamp lit.',
        steps: [
          { type: 'land', strip: 'Beach strip', who: 'elias', flag: 'lamp', say: 'Elias grabs the can and sets off for the tower at a run. Take off again and fly past the lighthouse.' },
          { type: 'pass', label: 'Fly past the lighthouse', x: LIGHTHOUSE.x, z: LIGHTHOUSE.z, r: 200 },
        ],
        thanks: 'The lamp flickers, catches, then sweeps out across the darkening water. Up on the gallery a tiny figure waves his cap.\n\nFrom now on the lighthouse is lit every dusk.',
      },
      {
        title: 'The Castle Fair',
        start: home('Beach strip', 1),
        brief: 'The castle holds its harvest fair on Saturday, and the invitations have come by post: one for every farm on the island.\n\nCircle the castle so the herald sees they\'ve arrived, then take the shepherd\'s invitation up to the Mountain meadow. It\'s short and sloping: land uphill.',
        steps: [
          { type: 'circle', label: 'Circle the castle', x: CASTLE.x, z: CASTLE.z, r: 280 },
          { type: 'land', strip: 'Mountain meadow', who: 'bram' },
        ],
        thanks: 'Bram reads the invitation twice. "A fair! I\'ll bring the sheep." He seems to mean it.',
      },
      {
        title: 'A Scarf for the Pilot',
        start: home('Mountain meadow', -1),
        brief: 'Bram has a sack of the softest wool on the island, and Granny Ada has been asking for some.\n\nTake off downhill, it\'s a short strip, then head for the gap in the crater\'s rim.',
        steps: [
          { type: 'pass', label: 'Line up with the gap in the rim', ...RIM_GAP, r: 130 },
          { type: 'land', strip: 'Caldera', who: 'ada', flag: 'scarf' },
        ],
        thanks: 'By the time you\'ve finished your tea, Granny Ada has knitted you a scarf, red as a postbox. "Every proper mail pilot needs one."',
      },
    ],
  },
  {
    title: 'Letters to the Vale',
    intro: 'Far out in the north-east, past the sea stacks, there is a valley so thick with spruce it looks black from the air. Settlers have built log cabins along its river, and not one letter has reached them.\n\nSome of this post goes where no plane can land. Fly low over the spot and let the parcel go: it floats down on a little parachute.',
    final: {
      title: 'Mail Pilot of the Far Isles',
      body: 'The Pine Vale has a post round now: fort, light, atoll, and every cabin up the river.\n\nOn still evenings the settlers leave their lamps in the windows, so the mail plane can find its way home up the valley.',
    },
    missions: [
      {
        title: 'The Sea Fort\'s Post',
        start: home('Headland', -1),
        brief: 'Juniper hands you the first sack for the far north-east. "The old route goes by the sea fort. The garrison hasn\'t had letters in weeks. Then Nell on the atoll knows the way."\n\nThe fort stands in open water, west of here. Fly low over it and drop the post, then land on the Atoll sandbar.',
        steps: [
          { type: 'drop', label: 'Drop the post on the sea fort', x: SEAFORT.x, z: SEAFORT.z, r: 90, agl: 70, deck: { r: 13.5, y: 13 }, who: 'garrison', say: 'A soldier on the ramparts waves both arms: post received. Then he points east. On to the atoll.' },
          { type: 'land', strip: 'Atoll sandbar', who: 'nell' },
        ],
        thanks: '"Post, out here?" Nell shades her eyes against the glare off the lagoon. "Then you\'ll be wanting the Pine Vale. North, past the stacks. Can\'t miss it: the whole island\'s one big forest."',
      },
      {
        title: 'The Offshore Light',
        start: home('Atoll sandbar', 1),
        brief: 'Nell has a basket of smoked fish for Oskar, keeper of the offshore light on the shoal to the west. "He\'s got no landing, mind. You\'ll have to drop it."\n\nThen thread the sea stacks and land at the new strip in the Pine Vale.',
        steps: [
          { type: 'drop', label: 'Drop the basket at the offshore light', x: SEA_LIGHT.x, z: SEA_LIGHT.z, r: 90, agl: 60, deck: { r: 7.4, y: 6.5 }, who: 'oskar', say: 'Oskar has the basket before the wind can take it, and waves his cap. Now north, through the stacks.' },
          { type: 'pass', label: 'Thread the sea stacks', x: 6080, z: 720, r: 160 },
          { type: 'land', strip: 'Pine Vale', who: 'hilde' },
        ],
        thanks: 'Hilde leans on her axe. "A mail plane! We\'d given up." She was the first to build here, down by the river mouth. "The others are further up the valley. They\'ll never believe it."',
      },
      {
        title: 'Cabin Rounds',
        start: home('Pine Vale', -1),
        brief: 'Hilde sorts the sack on a stump: a parcel for the Lindqvists by the river mouth, one for old Per in the middle of the valley, and one for the cabin that looks out at the waterfall.\n\nNone of them has a landing strip. Drop each parcel low over its cabin, then come back to the strip.',
        steps: [
          { type: 'drop', label: 'Drop to the Lindqvists\' cabin', ...cabin(150), r: 70, agl: 50, who: 'lindqvists', say: 'Two children race out of the cabin after the parachute before it even touches down.' },
          { type: 'drop', label: 'Drop to old Per\'s cabin', ...cabin(880), r: 70, agl: 50, who: 'per', say: 'Old Per is on his porch and catches it, first time, without getting up. Now the cabin by the waterfall.' },
          { type: 'drop', label: 'Drop to the cabin by the falls', ...cabin(1170), r: 70, agl: 50, who: 'wren' },
          { type: 'land', strip: 'Pine Vale', who: 'hilde' },
        ],
        thanks: '"Per says it\'s the first letter he\'s had in eleven years." Hilde grins. "And Wren from the falls cabin has gone up to her lookout above the waterfall, to paint. She\'s asked for her lantern."',
      },
      {
        title: 'Lantern above the Falls',
        start: home('Pine Vale', -1),
        time: 'twilight',
        brief: 'Last light in the Pine Vale. Wren is painting at her lookout cabin on the ledge above the waterfall, and she\'ll need her lantern to find the path down.\n\nFly up the valley toward the falls, climb over the cliff and drop the lantern at the lookout, then come back down to land.',
        steps: [
          { type: 'pass', label: 'Fly up the valley to the waterfall', x: fallX, z: fallZ, r: 140 },
          { type: 'drop', label: 'Drop the lantern at the lookout', ...cabin(1480), r: 70, agl: 50, who: 'wren', say: 'A little light bobs along the ledge, then stops and waves. Wren has her lantern. Back down the valley to land.' },
          { type: 'land', strip: 'Pine Vale', who: 'hilde' },
        ],
        thanks: 'Hilde has a fire going outside her cabin. Up the valley, one by one, the cabin windows glow in the dusk, and high above the waterfall a lantern twinkles back.',
      },
    ],
  },
];
const TOTAL = CHAPTERS.reduce((n, c) => n + c.missions.length, 0);

// Save: where you are (chapter + mission), whether everything is done, and what you've changed in the world
function load() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch { /* unreadable: start fresh */ }
  s ??= {};
  if (s.chapter === undefined) s = s.done ? { chapter: 1, mission: 0 } : { chapter: 0, mission: s.mission ?? 0 }; // saves from before chapters
  // finished every chapter there was (`through`; 2 before it was saved): newer chapters unlock instead of starting over
  if (s.done && (s.through ?? 2) < CHAPTERS.length) s = { ...s, chapter: s.through ?? 2, mission: 0, done: false };
  return { chapter: 0, mission: 0, done: false, flags: {}, ...s };
}
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

// A parcel tied with twine, or a basket heaped with plums
function makeParcel(item) {
  const g = new THREE.Group();
  if (item === 'plums') {
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.2, 0.26, 12), paint(0xa8773f)));
    const plum = new THREE.SphereGeometry(0.07, 8, 6), purple = paint(0x5a2a5a);
    for (let i = 0; i < 9; i++) {
      const m = new THREE.Mesh(plum, purple), a = i * 2.4;
      m.position.set(Math.cos(a) * 0.15 * (i % 3 ? 1 : 0.3), 0.14 + (i % 2) * 0.04, Math.sin(a) * 0.15 * (i % 3 ? 1 : 0.3));
      g.add(m);
    }
  } else {
    const twine = paint(0xf2e8cc);
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.3, 0.36), paint(0xb88a5a)),
      new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.31, 0.04), twine), new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.31, 0.37), twine));
  }
  g.children.forEach((c) => { c.castShadow = true; });
  return g;
}

// A parcel hanging under a small striped parachute (for drops); the canopy opens out once it's clear of the plane
function makeChute() {
  const g = new THREE.Group(), canopy = new THREE.Group(), cloth = paint(0xffffff, { side: THREE.DoubleSide }), cord = paint(0x3a3228);
  const parcel = makeParcel();
  g.add(parcel);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1.1, 16, 6, 0, Math.PI * 2, 0, Math.PI * 0.42).toNonIndexed(), cloth);
  const p = dome.geometry.attributes.position, stripe = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i += 3) { // eight gores, alternating red and cream, one solid colour per triangle
    const a = Math.atan2(p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2), p.getX(i) + p.getX(i + 1) + p.getX(i + 2));
    const c = Math.floor(((a + Math.PI) / (Math.PI * 2)) * 8) % 2 ? [0.75, 0.12, 0.08] : [0.92, 0.88, 0.78];
    for (let k = 0; k < 3; k++) stripe.set(c, (i + k) * 3);
  }
  dome.geometry.setAttribute('color', new THREE.BufferAttribute(stripe, 3));
  cloth.vertexColors = true;
  dome.position.y = 1.3;
  canopy.add(dome);
  for (let k = 0; k < 4; k++) { // shroud lines from the canopy rim down to the parcel
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4, line = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.9, 4), cord);
    line.position.set(Math.cos(a) * 0.45, 1.05, Math.sin(a) * 0.45);
    line.rotation.set(Math.sin(a) * 0.45, 0, -Math.cos(a) * 0.45);
    canopy.add(line);
  }
  g.add(canopy);
  g.traverse((o) => { o.castShadow = true; });
  return { g, canopy };
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
        float a = pow(max(1.0 - vY, 0.0), 1.6) * (0.28 + 0.07 * sin(uTime * 2.0)) * smoothstep(40.0, 160.0, vD);
        gl_FragColor = vec4(1.0, 0.78, 0.35, a);
      }`,
  });
  const m = new THREE.Mesh(new THREE.CylinderGeometry(7, 7, 420, 20, 1, true).translate(0, 210, 0), mat);
  m.renderOrder = 2;
  m.visible = false;
  return m;
}

// deps: fly(start) puts the mail plane on a strip; setTime(name | null) overrides the time of day (null = the menu's);
// onFlags(flags) is told whenever the world changes (lighthouse lit, new scarf)
export function createAdventure({ scene, world, flight, fly, setTime, onFlags, sound = { fx() {} } }) {
  let mode = 'off', chapter = 0, mission = 0, step = 0, act = null, onCard = null, circle = null;
  let drop = null; const dropped = []; // the parcel falling for the current drop step; parcels lying where they came down
  let flags = load().flags;
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
    sound.fx('card');
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

  const C = () => CHAPTERS[chapter], M = () => C().missions[mission], S = () => M().steps[step];
  const target = () => {
    if (mode !== 'fly') return null;
    const s = S();
    if (s.type === 'pass') return { label: s.label, x: s.x, z: s.z };
    if (s.type === 'drop') return { label: drop ? 'Parcel away!' : `${s.label} · below ${s.agl} m`, x: s.x, z: s.z };
    if (s.type === 'circle') return { label: `${s.label} · ${Math.round(Math.min(1, Math.abs(circle?.acc ?? 0) / (Math.PI * 2)) * 100)}%`, x: s.x, z: s.z };
    const st = strip(s.strip), who = PEOPLE[s.who].name;
    return { label: s.type === 'pickup' ? `Collect from ${who} · ${st.name}` : `Deliver to ${who} · ${st.name}`, x: st.x, z: st.z };
  };
  const setFlag = (name) => {
    if (!name || flags[name]) return;
    flags = { ...flags, [name]: true };
    store({ ...load(), flags });
    onFlags(flags);
  };

  function brief() {
    clearDrops();
    mode = 'brief';
    step = 0;
    circle = null;
    setTime(M().time ?? null);
    fly(M().start);
    showCard({ kicker: `Chapter ${chapter + 1} · delivery ${mission + 1} of ${C().missions.length}`, title: M().title, body: M().brief, button: 'Take off' }, () => { mode = 'fly'; });
  }
  function openChapter() {
    if (!C().intro) { brief(); return; }
    mode = 'brief';
    setTime(null);
    fly(C().missions[0].start);
    showCard({ kicker: `Chapter ${chapter + 1}`, title: C().title, body: C().intro, button: 'Begin' }, brief);
  }

  // A step is done: its card (or the mission's thanks, if it was the last), then fly on or move to the next mission
  function stepDone(stamp = '') {
    const s = S(), last = step === M().steps.length - 1;
    setFlag(s.flag);
    if (!last) {
      if (!s.say) { step++; circle = null; mode = 'fly'; return; }
      mode = 'card';
      showCard({ kicker: M().title, title: PEOPLE[s.who]?.name ?? M().title, body: s.say, button: 'Carry on' }, () => { clearAct(); step++; circle = null; mode = 'fly'; });
      return;
    }
    // mission complete: save where to pick up next time
    const lastInChapter = mission === C().missions.length - 1, lastChapter = chapter === CHAPTERS.length - 1;
    const next = !lastInChapter ? { chapter, mission: mission + 1, done: false } : !lastChapter ? { chapter: chapter + 1, mission: 0, done: false } : { chapter: 0, mission: 0, done: true, through: CHAPTERS.length };
    store({ ...next, flags });
    mode = 'card';
    const who = PEOPLE[s.who];
    showCard({ kicker: who ? `Delivered to ${who.name}` : `Delivery ${mission + 1} of ${C().missions.length} · done`, title: M().title, body: M().thanks, stamp, button: lastInChapter ? 'Read the last letter' : 'Next delivery' }, () => {
      clearAct();
      if (!lastInChapter) { mission++; brief(); return; }
      mode = 'final';
      showCard({ kicker: `Chapter ${chapter + 1} complete`, title: C().final.title, body: C().final.body, button: 'Keep flying' }, () => { mode = 'off'; setTime(null); });
    });
  }

  // ---- scenes on the ground: a villager walks up to the cockpit to take a parcel ('land') or hand one over ('pickup') ----
  function startScene(kind) {
    mode = 'scene';
    flight.throttle = 0;
    const s = S(), h = flight.heading, fx = -Math.sin(h), fz = -Math.cos(h);
    let side = 1; // walk up on the right unless that side is water or steep
    const ok = (sx) => { const x = flight.pos.x - fz * sx * 9, z = flight.pos.z + fx * sx * 9; return world.groundAt(x, z) > 1.5 && world.slopeAt(x, z) < 0.3; };
    if (!ok(1) && ok(-1)) side = -1;
    const rx = -fz * side, rz = fx * side;
    const at = (x, z) => new THREE.Vector3(x, world.groundAt(x, z), z);
    const from = at(flight.pos.x + rx * 9 + fx * 3, flight.pos.z + rz * 9 + fz * 3), to = at(flight.pos.x + rx * 2.4 - fx * 1.5, flight.pos.z + rz * 2.4 - fz * 1.5); // beside the cockpit, behind the wing
    const v = makeVillager(PEOPLE[s.who]), parcel = makeParcel(s.item);
    scene.add(v.g, parcel);
    parcel.visible = kind === 'pickup';
    const sink = flight.lastSink ?? 2;
    act = {
      kind, t: 0, v, parcel, from, to, walk: from.distanceTo(to) / 1.6, seat: new THREE.Vector3(flight.pos.x - fx * 0.8, flight.pos.y + 1.1, flight.pos.z - fz * 0.8),
      stamp: sink < 1.2 ? 'Postmark: butter-smooth landing' : sink < 2.4 ? 'Postmark: gentle landing' : 'Postmark: a bit of a bump, parcel fine',
      centre: at((flight.pos.x + to.x) / 2, (flight.pos.z + to.z) / 2).add(new THREE.Vector3(0, 1, 0)),
      angle: Math.atan2(rz - fz * 0.8, rx - fx * 0.8), // rear quarter on the villager's side: the handover in front, the wing behind it
    };
  }

  function updateScene(dt) {
    const d = act, v = d.v, g = v.g;
    d.t += dt;
    const t = d.t, ground = (x, z) => world.groundAt(x, z);
    let yaw, hop = 0, swing = 0, armsUp = 0, wave = 0;
    const hands = (y) => new THREE.Vector3(g.position.x + Math.sin(yaw) * 0.35, y + 1.15, g.position.z + Math.cos(yaw) * 0.35);
    if (t < d.walk) { // walk in (carrying the parcel, for a pickup)
      g.position.lerpVectors(d.from, d.to, t / d.walk);
      yaw = Math.atan2(d.to.x - d.from.x, d.to.z - d.from.z);
      swing = Math.sin(t * 9) * 0.6;
      if (Math.sign(swing) !== d.sw) { d.sw = Math.sign(swing); sound.fx('step', { at: g.position, soft: world.stripAt(g.position.x, g.position.z)?.surface !== 'dirt' }); }
      if (d.kind === 'pickup') { armsUp = 0.9; swing *= 0.3; d.parcel.position.copy(hands(ground(g.position.x, g.position.z))); d.parcel.rotation.y = yaw; }
    } else {
      g.position.copy(d.to);
      yaw = Math.atan2(flight.pos.x - d.to.x, flight.pos.z - d.to.z);
      const u = t - d.walk;
      if (u < 1.2) armsUp = d.kind === 'pickup' ? 1.3 : Math.min(1, u * 2.5); // reach up to the cockpit
      else { hop = Math.abs(Math.sin((u - 1.2) * 6)) * 0.25 * (u < 3.2 ? 1 : 0); armsUp = 0.35; wave = Math.sin(u * 10) * 0.5 + 2.4; }
      // the parcel arcs between the cockpit and their hands
      const k = THREE.MathUtils.clamp((u - 0.2) / 0.9, 0, 1), h = hands(ground(d.to.x, d.to.z) + hop);
      const [a, b] = d.kind === 'pickup' ? [h, d.seat] : [d.seat, h];
      d.parcel.visible = !(d.kind === 'pickup' && k >= 1);
      d.parcel.position.lerpVectors(a, b, k);
      d.parcel.position.y += Math.sin(k * Math.PI) * 1.6;
      d.parcel.rotation.set(0, yaw + k * 3, 0);
      if (k >= 1 && !d.thud) { d.thud = true; sound.fx('thump'); }
      if (u > 3.8 && mode === 'scene') stepDone(d.kind === 'land' ? d.stamp : '');
    }
    g.position.y = ground(g.position.x, g.position.z) + hop;
    g.rotation.y = yaw;
    v.legL.rotation.x = swing; v.legR.rotation.x = -swing;
    v.armL.rotation.x = -swing * 0.7 - armsUp * 1.3; v.armR.rotation.x = swing * 0.7 - armsUp * 1.3;
    v.armR.rotation.z = wave;
  }

  // ---- drops: the parcel leaves the plane with its speed, the chute opens and slows it to a gentle drift down ----
  const _ = new THREE.Vector3();
  function startDrop() {
    const c = makeChute();
    c.g.position.copy(flight.pos).add(_.set(0, -1.2, 0));
    c.canopy.scale.setScalar(0.05);
    scene.add(c.g);
    drop = { ...c, vel: flight.vel.clone().multiplyScalar(0.8), t: 0, deck: S().deck, at: S() };
  }
  function updateDrops(dt) {
    if (drop) {
      const d = drop, g = d.g;
      d.t += dt;
      const open = THREE.MathUtils.smoothstep(d.t, 0.3, 1.1);
      d.canopy.scale.setScalar(0.05 + open * 0.95);
      if (open >= 0.5 && !d.cloth) { d.cloth = true; sound.fx('cloth', { at: g.position }); }
      const k = 1 - Math.exp(-dt * (0.4 + open * 2.2));
      d.vel.x -= d.vel.x * k; d.vel.z -= d.vel.z * k;
      if (open < 0.5) d.vel.y -= 9.8 * dt; // free fall until the chute bites, then its steady sink
      else d.vel.y += (-5 - d.vel.y) * (1 - Math.exp(-dt * 3));
      g.position.addScaledVector(d.vel, dt);
      g.rotation.y += dt * 0.6;
      g.rotation.z = Math.sin(d.t * 1.7) * 0.12 * open; // gentle swing under the canopy
      let floor = Math.max(world.groundAt(g.position.x, g.position.z), 0); // ground, or the sea, or the landmark's deck
      if (d.deck && Math.hypot(g.position.x - d.at.x, g.position.z - d.at.z) < d.deck.r) floor = d.deck.y;
      if (g.position.y <= floor + 0.2) {
        g.position.y = floor + 0.2;
        g.rotation.z = 0;
        d.canopy.scale.set(1, 0.25, 1); // the chute collapses over the parcel
        sound.fx('thump', { at: g.position });
        dropped.push({ g, t: 0 });
        drop = null;
        if (mode === 'fly' && S().type === 'drop') stepDone();
      }
    }
    for (let i = dropped.length - 1; i >= 0; i--) if ((dropped[i].t += dt) > 20) { scene.remove(dropped[i].g); dropped.splice(i, 1); }
  }
  function clearDrops() {
    if (drop) scene.remove(drop.g);
    for (const d of dropped) scene.remove(d.g);
    drop = null;
    dropped.length = 0;
  }

  function clearAct() {
    if (!act) return;
    scene.remove(act.v.g, act.parcel);
    act = null;
  }

  return {
    get active() { return mode !== 'off'; },
    get holdsPlane() { return mode === 'brief' || mode === 'scene' || mode === 'card' || mode === 'final'; },
    get target() { return target(); },
    get flags() { return flags; },
    summary() {
      const s = load();
      if (s.done) return 'Completed · fly the rounds again';
      if (s.chapter === 0 && s.mission === 0) return `New · ${CHAPTERS[0].missions.length} deliveries to make`;
      const ch = CHAPTERS[s.chapter];
      if (s.mission === 0) return `Chapter ${s.chapter + 1} unlocked · ${ch.title}`;
      return `Resume · chapter ${s.chapter + 1}, delivery ${s.mission + 1} of ${ch.missions.length}: ${ch.missions[s.mission].title}`;
    },
    get hasProgress() { const s = load(); return s.done || s.chapter > 0 || s.mission > 0; },
    begin() {
      clearAct();
      const s = load();
      chapter = s.done ? 0 : Math.min(s.chapter, CHAPTERS.length - 1);
      mission = s.done ? 0 : Math.min(s.mission, C().missions.length - 1);
      if (mission === 0) openChapter(); else brief();
    },
    stop() {
      mode = 'off';
      card.hidden = true;
      onCard = null;
      clearAct();
      clearDrops();
      beacon.visible = false;
      setTime(null);
    },
    reset() { store({ chapter: 0, mission: 0, done: false, flags }); }, // rewards (lit lighthouse, scarf) are kept
    update(dt, input, live) {
      beacon.material.uniforms.uTime.value += dt;
      if (live && !card.hidden && (input.consume('Enter') || input.consume('Space'))) closeCard();
      const tg = target();
      beacon.visible = !!tg;
      if (tg) beacon.position.set(tg.x, world.groundAt(tg.x, tg.z), tg.z);
      if (mode === 'fly') {
        const s = S(), air = flight.state === 'air', dist = Math.hypot(flight.pos.x - s.x, flight.pos.z - s.z);
        if (s.type === 'pass' && air && dist < s.r) stepDone();
        else if (s.type === 'drop' && air && !drop && dist < s.r
          && flight.pos.y - Math.max(world.groundAt(flight.pos.x, flight.pos.z), 0) < s.agl) startDrop();
        else if (s.type === 'circle') { // add up the angle swept around the point while inside the ring
          if (air && dist < s.r) {
            const a = Math.atan2(flight.pos.z - s.z, flight.pos.x - s.x);
            circle ??= { acc: 0, prev: null };
            if (circle.prev !== null) circle.acc += Math.atan2(Math.sin(a - circle.prev), Math.cos(a - circle.prev));
            circle.prev = a;
            if (Math.abs(circle.acc) >= Math.PI * 2) stepDone();
          } else if (circle) circle.prev = null; // left the ring: keep the progress, don't count the jump on re-entry
        } else if ((s.type === 'land' || s.type === 'pickup') && flight.state === 'ground' && flight.flown && flight.speed < 0.5
          && world.stripAt(flight.pos.x, flight.pos.z) === strip(s.strip)) startScene(s.type);
      }
      if (act) updateScene(dt);
      if (dt > 0) updateDrops(dt);
    },
    // Scene camera: a slow orbit around the plane and the villager
    shot(camera, dt) {
      if (!act) return false;
      const d = act, c = d.centre;
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
