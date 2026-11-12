// Objetos que mudam de estado (itens, caixas, barris, documentos, portão, manivelas, ponte,
// grade da arena), interações, gatilhos de roteiro, objetivos e checkpoints.
import * as THREE from 'three';
import { makeCrate, makeDrum, makePickupModel, makeWinch, makeGateLeaf, makePortcullis, makeNoteModel, mats } from './models.js';
import { tex } from './textures.js';
import { NOTES, ITEMS, OBJ } from './story.js';
import { explode } from './combat.js';
import { RIVER } from './collision.js';
import { ARENA } from './world.js';
import { clamp, rand, chance, weighted, easeInOut } from './util.js';

// ---------------------------------------------------------------- dados da fase
const PICKUPS = [
  { id: 'p1', type: 'ammo_pistol', n: 10, x: -9.4, z: 13.4 },
  { id: 'p2', type: 'tonic', n: 1, x: 1.9, z: 30.0 },
  { id: 'p3', type: 'weapon_shotgun', n: 1, anchor: 'shotgun' },
  { id: 'p4', type: 'ammo_shotgun', n: 6, anchor: 'shells1' },
  { id: 'p5', type: 'grenade', n: 1, anchor: 'grenadeCart' },
  { id: 'p6', type: 'ammo_pistol', n: 12, x: 19.4, z: 35.2 },
  { id: 'key', type: 'key', n: 1, anchor: 'key' },
  { id: 'p7', type: 'tonic', n: 1, anchor: 'tonicMayor' },
  { id: 'p8', type: 'ammo_pistol', n: 8, x: -27.6, z: 17.4 },
  { id: 'q1', type: 'ammo_pistol', n: 10, x: -3.4, z: 85.2 },
  { id: 'q2', type: 'ammo_shotgun', n: 5, x: 3.5, z: 98.6 },
  { id: 'q3', type: 'ammo_pistol', n: 10, x: -22.6, z: 108.8 },
  { id: 'q4', type: 'tonic', n: 1, x: -26.8, z: 108.9 },
  { id: 'q5', type: 'tonic', n: 1, x: 19.4, z: 99.4 },
  { id: 'q6', type: 'grenade', n: 1, x: -3.4, z: 112.2 },
  { id: 'q7', type: 'ammo_shotgun', n: 4, x: 3.5, z: 121.4 },
  { id: 'q8', type: 'medkit', n: 1, x: 4.4, z: 126.6 },
  { id: 'q9', type: 'ammo_pistol', n: 12, x: 13.0, z: 93.7 },
  { id: 'r1', type: 'ammo_pistol', n: 20, x: -2.6, z: 142.6 },
  { id: 'r2', type: 'ammo_shotgun', n: 8, x: 2.6, z: 142.6 },
  { id: 'r3', type: 'tonic', n: 1, x: -2.6, z: 146.3 },
  { id: 'r4', type: 'medkit', n: 1, x: 2.6, z: 146.3 },
  { id: 'r5', type: 'grenade', n: 2, x: 0, z: 144.6 },
];

const CRATES = [
  { id: 'c1', x: 6, z: 12.6 },
  { id: 'c2', x: -6.8, z: 17.2 },
  { id: 'c3', x: 20, z: 47.6 },
  { id: 'c4', x: -12.5, z: 60.6 },
  { id: 'c5', x: 27.4, z: 25.4, loot: 'ammo_pistol' },
  { id: 'c6', x: -24.6, z: 21.8 },
  { id: 'c7', x: -3.8, z: 79.6 },
  { id: 'c8', x: 3.8, z: 88.2 },
  { id: 'c9', x: -3.8, z: 118.6 },
  { id: 'c10', x: 3.8, z: 108.6, loot: 'tonic' },
  { id: 'c11', x: -34, z: 100.4 },
  { id: 'c12', x: 34, z: 84.2, loot: 'ammo_shotgun' },
];

const DRUMS = [
  { id: 'd1', x: -3.7, z: 36.9 },
  { id: 'd2', x: 19.2, z: 37.8 },
  { id: 'd3', x: 9, z: 52.6 },
  { id: 'd4', x: -3.6, z: 97.2 },
  { id: 'd5', x: 3.8, z: 116.6 },
];

const NOTE_DEFS = [
  { id: 'aviso', anchor: 'noteEntrance' },
  { id: 'diario', anchor: 'noteDiary' },
  { id: 'prefeito', anchor: 'noteMayor' },
  { id: 'ferreiro', anchor: 'noteSmith' },
  { id: 'relatorio', anchor: 'noteReport' },
];

// Grupos de inimigos
export const GROUPS = {
  z1: [
    { k: 'v', x: 2.2, z: 34.3, idle: 'talk', yaw: -2.3 },
    { k: 'v', x: -1.9, z: 34.7, idle: 'talk', yaw: 2.6 },
    { k: 'v', x: 1.3, z: 29.3, idle: 'talk', yaw: 0.2 },
    { k: 'v', x: -18.4, z: 24.7, idle: 'chop', weapon: 'axe', yaw: Math.PI },
    { k: 'v', x: 19.3, z: 33.4, idle: 'idle', weapon: 'pitchfork', yaw: -1.6 },
    { k: 'v', x: 19.8, z: 41.6, idle: 'idle', yaw: -1.4 },
    { k: 'v', x: 1.5, z: 47, idle: 'wander' },
    { k: 'v', x: -2.5, z: 52, idle: 'wander' },
    { k: 'v', x: 10.4, z: 55.6, idle: 'idle', yaw: -1.2 },
    { k: 'v', x: 12.0, z: 49.4, idle: 'idle', yaw: 2.4 },
  ],
  z1behind: [
    { k: 'v', x: 0, z: -12, idle: 'hunt' },
    { k: 'v', x: -3, z: -16, idle: 'hunt' },
    { k: 'v', x: 2.5, z: -19, idle: 'hunt' },
  ],
  z1ambush: [
    { k: 'v', x: -36, z: 62, idle: 'hunt' },
    { k: 'v', x: -35, z: 46.5, idle: 'hunt' },
    { k: 'v', x: -23.5, z: 69, idle: 'hunt' },
    { k: 'v', x: -8, z: 66.5, idle: 'hunt' },
    { k: 'v', x: -27, z: 38.6, idle: 'hunt' },
  ],
  z2: [
    { k: 'v', x: 4, z: 86, idle: 'wander' },
    { k: 'v', x: -9, z: 92.6, idle: 'pray', yaw: -0.6 },
    { k: 'v', x: 3.6, z: 104.4, idle: 'idle', yaw: Math.PI },
    { k: 'v', x: -3, z: 115, idle: 'wander' },
    { k: 'v', x: 13.6, z: 118.6, idle: 'idle', yaw: -2.2 },
    { k: 'c', x: -23, z: 108.6, idle: 'dormant', yaw: 1.5 },
    { k: 'c', x: 29.8, z: 92, idle: 'dormant', yaw: -1.5 },
  ],
  w1: [
    { k: 'v', x: -33, z: 84, idle: 'hunt' },
    { k: 'v', x: -33, z: 121, idle: 'hunt' },
    { k: 'v', x: -12, z: 127, idle: 'hunt' },
    { k: 'c', x: -30, z: 77, idle: 'hunt' },
  ],
  w2: [
    { k: 'v', x: 33, z: 80, idle: 'hunt' },
    { k: 'v', x: 33, z: 120, idle: 'hunt' },
    { k: 'v', x: 12, z: 127.6, idle: 'hunt' },
    { k: 'c', x: 31, z: 111, idle: 'hunt' },
  ],
  z2after: [
    { k: 'v', x: 0, z: 75, idle: 'hunt' },
    { k: 'v', x: 2.5, z: 77, idle: 'hunt' },
    { k: 'v', x: -2.5, z: 78, idle: 'hunt' },
  ],
};

export const CHECKPOINTS = {
  cp1: { x: 0, z: -18, yaw: 0, zone: 1, group: 'z1' },
  cp2: { x: 0, z: 78, yaw: 0, zone: 2, group: 'z2' },
  cp2b: { x: 0, z: 124, yaw: 0, zone: 2, group: 'z2after' },
  cp3: { x: 0, z: 143.4, yaw: 0, zone: 3, group: 'boss' },
};

const PROMPT_ITEM = (t, n) => {
  const name = ITEMS[t] ? ITEMS[t].name : t;
  return n > 1 && t !== 'weapon_shotgun' ? `${name} ×${n}` : name;
};

const _v = new THREE.Vector3();

export class Level {
  constructor(G) {
    this.G = G;
    this.scene = G.scene;
    this.dyn = new THREE.Group();
    this.scene.add(this.dyn);
    this.pickups = [];
    this.crates = [];
    this.drums = [];
    this.notes = [];
    this.flags = {};
    this.state = null;
    this.dropN = 0;
    this.glowMat = new THREE.SpriteMaterial({ map: tex('glow'), color: 0xffe2a8, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.55 });
    this.buildStatic();
  }

  // Portão, ponte, manivelas e grade: criados uma vez; o estado é aplicado em load().
  buildStatic() {
    const G = this.G,
      col = G.col;
    // portão do cemitério
    this.gateL = makeGateLeaf(2.95, 3.2);
    this.gateL.position.set(-2.95, 0, 72);
    this.gateR = makeGateLeaf(2.95, 3.2);
    this.gateR.position.set(2.95, 0, 72);
    this.scene.add(this.gateL, this.gateR);
    const m = mats();
    this.chain = new THREE.Group();
    for (let i = 0; i < 9; i++) {
      const l = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.014, 4, 8), m.iron);
      l.position.set(-0.36 + i * 0.09, 1.55 + Math.sin(i * 0.7) * 0.05, 72.06);
      l.rotation.y = i % 2 ? Math.PI / 2 : 0;
      this.chain.add(l);
    }
    const lock = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.2, 0.08), m.brass);
    lock.position.set(0.05, 1.42, 72.1);
    this.chain.add(lock);
    this.scene.add(this.chain);
    this.gateCol = col.addBox(0, 72, 6, 0.3, 0, { y0: 0, y1: 3.2, mat: 'metal', shootThrough: true });
    // manivelas
    this.winches = {};
    for (const id of ['w1', 'w2']) {
      const a = G.world.anchors[id === 'w1' ? 'winch1' : 'winch2'];
      const w = makeWinch();
      w.position.set(a.x, 0, a.z);
      w.rotation.y = a.ry;
      this.scene.add(w);
      col.addBox(a.x, a.z, 1.5, 0.7, a.ry, { y0: 0, y1: 1.3, mat: 'wood' });
      this.winches[id] = { id, x: a.x, z: a.z, mesh: w, wheel: w.userData.wheel, progress: 0, done: false, sound: 0 };
    }
    // ponte levadiça (pivô na margem sul)
    this.bridge = new THREE.Group();
    this.bridge.position.set(0, 0, RIVER.z0);
    const deck = new THREE.Mesh(new THREE.BoxGeometry(5, 0.25, 10.3), new THREE.MeshStandardMaterial({ map: tex('planks'), color: 0x8a7058, roughness: 0.9 }));
    deck.material.map = tex('planks');
    deck.position.set(0, -0.12, 5.15);
    deck.castShadow = deck.receiveShadow = true;
    this.bridge.add(deck);
    for (const sx of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.9, 10.3), m.darkWood);
      rail.position.set(sx * 2.45, 0.45, 5.15);
      rail.castShadow = true;
      this.bridge.add(rail);
      for (let k = 0; k <= 5; k++) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.1, 0.18), m.darkWood);
        post.position.set(sx * 2.45, 0.45, k * 2.05);
        post.castShadow = true;
        this.bridge.add(post);
      }
    }
    this.scene.add(this.bridge);
    this.bridgeChains = [];
    for (const sx of [-1, 1]) {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1, 5), m.iron);
      c.castShadow = true;
      this.scene.add(c);
      this.bridgeChains.push({ mesh: c, sx });
    }
    this.bridgeBlock = col.addBox(0, RIVER.z0 - 0.3, 5.6, 0.6, 0, { y0: 0, y1: 4, invisible: true });
    this.bridgeRails = [col.addBox(-2.62, (RIVER.z0 + RIVER.z1) / 2, 0.25, RIVER.z1 - RIVER.z0 + 1.2, 0, { y0: 0, y1: 1.1, mat: 'wood', shootThrough: true }), col.addBox(2.62, (RIVER.z0 + RIVER.z1) / 2, 0.25, RIVER.z1 - RIVER.z0 + 1.2, 0, { y0: 0, y1: 1.1, mat: 'wood', shootThrough: true })];
    this.bridgeDeck = col.addBox(0, (RIVER.z0 + RIVER.z1) / 2, 5, RIVER.z1 - RIVER.z0, 0, { y0: -0.3, y1: 0, mat: 'wood' });
    // grade da arena
    this.portcullis = makePortcullis(7.6, 4.8);
    this.portcullis.position.set(0, 4.6, ARENA.z - ARENA.r - 0.3);
    this.scene.add(this.portcullis);
    this.portCol = col.addBox(0, ARENA.z - ARENA.r - 0.3, 7.6, 0.4, 0, { y0: 0, y1: 4.8, mat: 'metal', shootThrough: true });
  }

  newState() {
    return { cp: 'cp1', flags: {}, taken: {}, broken: {}, read: {}, winch: { w1: 0, w2: 0 } };
  }

  // Monta os objetos dinâmicos de acordo com o estado salvo.
  load(state) {
    const G = this.G;
    this.state = JSON.parse(JSON.stringify(state));
    this.state.flags = this.state.flags || {};
    this.state.taken = this.state.taken || {};
    this.state.broken = this.state.broken || {};
    this.state.read = this.state.read || {};
    this.state.winch = this.state.winch || { w1: 0, w2: 0 };
    this.flags = this.state.flags;
    // limpa
    for (const p of this.pickups) this.dyn.remove(p.obj);
    for (const c of this.crates) this.removeCrate(c);
    for (const d of this.drums) this.removeDrum(d);
    for (const n of this.notes) this.dyn.remove(n.obj);
    this.pickups = [];
    this.crates = [];
    this.drums = [];
    this.notes = [];
    const D = G.diff;
    for (const d of PICKUPS) {
      if (this.state.taken[d.id]) continue;
      let n = d.n;
      if (d.type === 'ammo_pistol' || d.type === 'ammo_shotgun') n = Math.max(2, Math.round(n * D.drop));
      const a = d.anchor ? G.world.anchors[d.anchor] : null;
      this.addPickup(d.id, d.type, n, a ? a.x : d.x, a ? a.y : 0.02, a ? a.z : d.z, true);
    }
    for (const d of CRATES) if (!this.state.broken[d.id]) this.addCrate(d);
    for (const d of DRUMS) if (!this.state.broken[d.id]) this.addDrum(d);
    for (const d of NOTE_DEFS) {
      if (this.state.read[d.id]) continue;
      const a = G.world.anchors[d.anchor];
      const obj = makeNoteModel();
      obj.position.set(a.x, a.y, a.z);
      if (a.wall) {
        obj.rotation.set(Math.PI / 2, 0, 0);
        obj.rotation.y = a.ry || 0;
      } else obj.rotation.y = rand(0, 3);
      const glow = new THREE.Sprite(this.glowMat);
      glow.scale.setScalar(0.5);
      glow.position.y = 0.05;
      obj.add(glow);
      this.dyn.add(obj);
      this.notes.push({ id: d.id, x: a.x, y: a.y, z: a.z, obj, glow });
    }
    // estados de portão/ponte/manivelas/grade
    this.setGate(!!this.flags.gateOpen, true);
    for (const id of ['w1', 'w2']) {
      const w = this.winches[id];
      w.progress = this.state.winch[id] || 0;
      w.done = w.progress >= 1;
    }
    this.setBridge(!!this.flags.bridgeDown, true);
    this.setPortcullis(!!this.flags.arena, true);
    G.nav.rebuild(G.col, 0.38);
    this.anim = [];
    this.holdT = 0;
  }

  // ------------------------------------------------------------ itens
  addPickup(id, type, n, x, y, z, persistent) {
    const obj = makePickupModel(type);
    const holder = new THREE.Group();
    holder.position.set(x, y, z);
    holder.add(obj);
    const glow = new THREE.Sprite(this.glowMat);
    glow.scale.setScalar(type === 'weapon_shotgun' ? 1.1 : 0.6);
    glow.position.y = 0.1;
    holder.add(glow);
    this.dyn.add(holder);
    const p = { id, type, n, x, y, z, obj: holder, inner: obj, glow, persistent, t: rand(0, 6), drop: 0 };
    this.pickups.push(p);
    return p;
  }

  drop(type, n, x, z) {
    const p = this.addPickup('drop' + ++this.dropN, type, n, x, 0.02, z, false);
    p.drop = 0.6;
    p.obj.position.y = 1.0;
    return p;
  }

  // Sorteio do que um inimigo deixa ao morrer. Garante munição se o jogador estiver sem.
  enemyDrop(x, z, kind) {
    const G = this.G,
      P = G.player,
      D = G.diff;
    const totalAmmo = P.ammo.pistol + P.weapons.pistol.mag + (P.weapons.shotgun.owned ? P.ammo.shotgun + P.weapons.shotgun.mag : 0);
    const starving = totalAmmo < 8;
    let p = (kind === 'crawler' ? 0.5 : 0.42) * D.drop;
    if (starving) p = 1;
    if (!chance(p)) return;
    const table = [
      ['ammo_pistol', 50],
      ['ammo_shotgun', P.weapons.shotgun.owned ? 18 : 0],
      ['tonic', P.hp < 60 ? 22 : 12],
      ['grenade', 4],
    ];
    const t = starving ? (P.weapons.shotgun.owned && chance(0.3) ? 'ammo_shotgun' : 'ammo_pistol') : weighted(table);
    const n = t === 'ammo_pistol' ? Math.round(rand(5, 9) * D.drop) + 1 : t === 'ammo_shotgun' ? Math.round(rand(2, 4) * D.drop) + 1 : 1;
    this.drop(t, n, x, z);
  }

  takePickup(p) {
    const G = this.G;
    const label = G.player.addItem(p.type, p.n);
    if (p.persistent) this.state.taken[p.id] = true;
    this.dyn.remove(p.obj);
    this.pickups.splice(this.pickups.indexOf(p), 1);
    if (p.type === 'key' || p.type === 'weapon_shotgun') G.audio.keyItem();
    else G.audio.pickup();
    G.ui.msg(label, p.type === 'key' || p.type === 'weapon_shotgun');
    if (p.type === 'key') this.onKey();
  }

  // ------------------------------------------------------------ caixas e barris
  addCrate(d) {
    const obj = makeCrate(0.8);
    obj.position.set(d.x, 0, d.z);
    obj.rotation.y = rand(-0.4, 0.4);
    this.dyn.add(obj);
    const c = { ...d, obj, kind: 'crate', alive: true };
    c.col = this.G.col.addBox(d.x, d.z, 0.8, 0.8, obj.rotation.y, { y0: 0, y1: 0.8, mat: 'wood', owner: c });
    c.onShot = () => this.breakCrate(c);
    this.crates.push(c);
  }

  removeCrate(c) {
    this.dyn.remove(c.obj);
    this.G.col.remove(c.col);
    c.alive = false;
  }

  breakCrate(c) {
    if (!c.alive) return;
    const G = this.G;
    this.removeCrate(c);
    this.crates.splice(this.crates.indexOf(c), 1);
    this.state.broken[c.id] = true;
    G.fx.chips({ x: c.x, y: 0.5, z: c.z }, { x: 0, y: 1, z: 0 }, 16, [0.5, 0.38, 0.25]);
    G.fx.dust({ x: c.x, y: 0.4, z: c.z }, { x: 0, y: 1, z: 0 }, 6);
    G.audio.breakWood(c);
    G.nav.rebuild(G.col, 0.38, { minX: c.x - 2, minZ: c.z - 2, maxX: c.x + 2, maxZ: c.z + 2 });
    const D = G.diff;
    let type = c.loot;
    if (!type) {
      if (!chance(0.6 * Math.min(1.3, D.drop))) return;
      type = weighted([
        ['ammo_pistol', 50],
        ['ammo_shotgun', G.player.weapons.shotgun.owned ? 18 : 0],
        ['tonic', 18],
        ['grenade', 5],
      ]);
    }
    const n = type === 'ammo_pistol' ? Math.round(rand(6, 10) * D.drop) : type === 'ammo_shotgun' ? Math.round(rand(3, 5) * D.drop) : 1;
    this.drop(type, Math.max(1, n), c.x, c.z);
  }

  addDrum(d) {
    const obj = makeDrum();
    obj.position.set(d.x, 0, d.z);
    obj.rotation.y = rand(0, 3);
    this.dyn.add(obj);
    const dr = { ...d, obj, kind: 'drum', alive: true, fuse: -1 };
    dr.col = this.G.col.addCircle(d.x, d.z, 0.31, { y0: 0, y1: 0.9, mat: 'metal', owner: dr });
    dr.onShot = () => this.igniteDrum(dr, 0.12);
    this.drums.push(dr);
  }

  removeDrum(d) {
    this.dyn.remove(d.obj);
    this.G.col.remove(d.col);
    d.alive = false;
  }

  igniteDrum(d, delay = 0.12) {
    if (!d.alive || d.fuse >= 0) return;
    d.fuse = delay;
    this.G.audio.fuse(d);
  }

  explosionAt(x, z, r) {
    for (const c of [...this.crates]) if (Math.hypot(c.x - x, c.z - z) < r * 0.7) this.breakCrate(c);
    for (const d of this.drums) if (d.alive && d.fuse < 0 && Math.hypot(d.x - x, d.z - z) < r) this.igniteDrum(d, rand(0.12, 0.3));
  }

  meleeAt(x, z, r) {
    for (const c of [...this.crates]) if (Math.hypot(c.x - x, c.z - z) < r + 0.4) this.breakCrate(c);
    for (const d of this.drums) if (d.alive && Math.hypot(d.x - x, d.z - z) < r + 0.3) this.G.audio.hit('metal', d);
  }

  // ------------------------------------------------------------ portão, ponte, manivelas, grade
  setGate(open, instant = false) {
    const target = open ? 1 : 0;
    if (instant) {
      this.gateOpenK = target;
      this.applyGate();
    }
    this.gateCol.enabled = !open;
    this.chain.visible = !open;
  }

  applyGate() {
    const k = easeInOut(this.gateOpenK || 0);
    this.gateL.rotation.y = -1.75 * k;
    this.gateR.rotation.y = Math.PI + 1.75 * k;
  }

  setBridge(down, instant = false) {
    if (instant) {
      this.bridgeK = down ? 1 : 0;
      this.applyBridge();
    }
    this.bridgeBlock.enabled = !down;
    for (const r of this.bridgeRails) r.enabled = down;
    this.bridgeDeck.enabled = down;
    this.G.col.bridgeDown = down;
  }

  applyBridge() {
    const k = this.bridgeK || 0;
    const ang = -1.35 * (1 - easeInOut(k));
    this.bridge.rotation.x = ang;
    // correntes do topo da ponte até os postes
    for (const c of this.bridgeChains) {
      _v.set(c.sx * 2.45, 0.2, 10.2).applyEuler(this.bridge.rotation).add(this.bridge.position);
      const ax = c.sx * 3.1,
        ay = 3.1,
        az = RIVER.z0 - 1.0;
      const dx = _v.x - ax,
        dy = _v.y - ay,
        dz = _v.z - az;
      const L = Math.hypot(dx, dy, dz);
      c.mesh.position.set((ax + _v.x) / 2, (ay + _v.y) / 2, (az + _v.z) / 2);
      c.mesh.scale.set(1, L, 1);
      c.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx / L, dy / L, dz / L));
      c.mesh.visible = k < 0.999;
    }
  }

  setPortcullis(closed, instant = false) {
    if (instant) {
      this.portK = closed ? 1 : 0;
      this.portcullis.position.y = 4.6 * (1 - this.portK);
    }
    this.portCol.enabled = closed;
  }

  onKey() {
    const G = this.G;
    if (!this.flags.ambush) {
      this.flags.ambush = true;
      G.enemies.spawnGroup(GROUPS.z1ambush, 10);
      G.audio.sting();
      G.ui.msg('Eles ouviram você...');
    }
  }

  openGate() {
    const G = this.G;
    this.flags.gateOpen = true;
    this.setGate(true);
    this.anim.push({ k: 'gate', t: 0, dur: 1.8 });
    G.audio.creak({ x: 0, z: 72 }, 1.8);
    G.audio.chain({ x: 0, z: 72 }, 5);
    G.nav.rebuild(G.col, 0.38, { minX: -6, minZ: 69, maxX: 6, maxZ: 75 });
    G.enemies.spawnGroup(GROUPS.z2, 0);
    G.ui.msg('O portão se abriu.');
  }

  lowerBridge() {
    const G = this.G;
    this.flags.bridgeDown = true;
    this.anim.push({ k: 'bridge', t: 0, dur: 4.2 });
    G.audio.rumble({ x: 0, z: RIVER.z0 }, 4.2);
    G.fx.shake(0.25);
    G.ui.msg('A ponte levadiça está descendo...');
  }

  lockArena() {
    const G = this.G;
    this.flags.arena = true;
    this.setPortcullis(true);
    this.anim.push({ k: 'port', t: 0, dur: 0.45 });
    G.nav.rebuild(G.col, 0.38, { minX: -6, minZ: ARENA.z - ARENA.r - 3, maxX: 6, maxZ: ARENA.z - ARENA.r + 3 });
    G.ui.bossIntro();
  }

  // ------------------------------------------------------------ atualização
  update(dt) {
    const G = this.G,
      P = G.player,
      t = G.time;
    // animação dos itens
    for (const p of this.pickups) {
      p.t += dt;
      if (p.drop > 0) {
        p.drop -= dt;
        const k = clamp(1 - p.drop / 0.6, 0, 1);
        p.obj.position.y = p.y + (1 - k) * (1 - k) * 1.0 + Math.sin(k * Math.PI) * 0.3;
      }
      p.inner.rotation.y += dt * 0.8;
      p.glow.material.opacity = 0.35 + Math.sin(p.t * 3) * 0.2;
    }
    for (const n of this.notes) n.glow.scale.setScalar(0.45 + Math.sin(t * 2.5) * 0.08);
    // barris com pavio
    for (const d of this.drums) {
      if (!d.alive || d.fuse < 0) continue;
      d.fuse -= dt;
      G.fx.sparks({ x: d.x, y: 0.9, z: d.z }, { x: 0, y: 1, z: 0 }, 1);
      if (d.fuse <= 0) {
        this.removeDrum(d);
        this.state.broken[d.id] = true;
        explode(G, d.x, 0.5, d.z, 5, 160, 45);
        G.nav.rebuild(G.col, 0.38, { minX: d.x - 2, minZ: d.z - 2, maxX: d.x + 2, maxZ: d.z + 2 });
      }
    }
    if (this.drums.some((d) => !d.alive)) this.drums = this.drums.filter((d) => d.alive);
    // animações de portão/ponte/grade
    for (const a of this.anim) {
      a.t += dt;
      const k = clamp(a.t / a.dur, 0, 1);
      if (a.k === 'gate') {
        this.gateOpenK = k;
        this.applyGate();
      } else if (a.k === 'bridge') {
        this.bridgeK = k;
        this.applyBridge();
        if (k >= 1 && !a.done) {
          a.done = true;
          this.setBridge(true);
          G.nav.rebuild(G.col, 0.38, { minX: -6, minZ: RIVER.z0 - 3, maxX: 6, maxZ: RIVER.z1 + 3 });
          G.fx.shake(0.4);
          G.audio.slam({ x: 0, z: RIVER.z1 }, 1);
          G.ui.msg('A ponte desceu. O caminho para a forja está livre.');
          if (!P.dead) this.checkpoint('cp2b');
          G.enemies.spawnGroup(GROUPS.z2after, 12);
        }
      } else if (a.k === 'port') {
        this.portK = k;
        this.portcullis.position.y = 4.6 * (1 - k * k);
        if (k >= 1 && !a.done) {
          a.done = true;
          G.audio.slam({ x: 0, z: ARENA.z - ARENA.r }, 1.2);
          G.fx.shake(0.45);
          G.fx.dust({ x: 0, y: 0.2, z: ARENA.z - ARENA.r - 0.3 }, { x: 0, y: 1, z: 0 }, 14);
        }
      }
    }
    this.anim = this.anim.filter((a) => a.t < a.dur);
    // manivelas girando
    for (const id in this.winches) {
      const w = this.winches[id];
      if (w.spin > 0) {
        w.spin -= dt;
        w.wheel.rotation.x -= dt * 4;
      }
    }
    if (P.dead || G.state !== 'play') return;
    this.triggers();
    this.interaction(dt);
  }

  triggers() {
    const G = this.G,
      P = G.player,
      f = this.flags;
    const z = P.pos.z;
    if (!f.square && z > 17 && z < 70) {
      f.square = true;
      G.enemies.spawnGroup(GROUPS.z1behind, 14);
    }
    if (!f.sawVillage && z > 6) f.sawVillage = true;
    if (f.gateOpen && !f.cp2 && z > 77) {
      f.cp2 = true;
      this.checkpoint('cp2');
    }
    if (f.bridgeDown && !f.cp3 && z > 142.2) {
      f.cp3 = true;
      this.checkpoint('cp3');
      if (!G.enemies.boss) G.enemies.spawn('boss', 0, ARENA.z + 9, { yaw: Math.PI });
    }
    if (f.bridgeDown && !f.arena && z > ARENA.z - ARENA.r + 3.2) this.lockArena();
  }

  checkpoint(id) {
    const G = this.G;
    const cp = CHECKPOINTS[id];
    this.state.cp = id;
    this.state.flags = this.flags;
    const snap = JSON.parse(JSON.stringify(this.state));
    snap.player = G.player.serialize();
    snap.stats = { ...G.stats };
    snap.pos = { x: cp.x, z: cp.z, yaw: cp.yaw };
    G.game.saveCheckpoint(snap);
    G.ui.checkpoint();
  }

  // Item, documento ou mecanismo mais próximo à frente.
  interaction(dt) {
    const G = this.G,
      P = G.player,
      I = G.input;
    let best = null,
      bd = 1e9;
    const fx = Math.sin(P.yaw),
      fz = Math.cos(P.yaw);
    const consider = (obj, x, z, r, kind) => {
      const dx = x - P.pos.x,
        dz = z - P.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > r) return;
      const front = (dx * fx + dz * fz) / (d || 1);
      const score = d - front * 0.5 + (kind === 'note' ? 0.35 : 0);
      if (d > 0.9 && front < -0.3) return;
      if (score < bd) {
        bd = score;
        best = { obj, kind, d };
      }
    };
    for (const p of this.pickups) if (p.drop <= 0) consider(p, p.x, p.z, 1.7, 'pickup');
    for (const n of this.notes) consider(n, n.x, n.z, 1.7, 'note');
    if (!this.flags.gateOpen) consider(null, 0, 71.2, 2.8, 'gate');
    for (const id in this.winches) {
      const w = this.winches[id];
      if (!w.done && this.flags.gateOpen) consider(w, w.x, w.z, 2.1, 'winch');
    }
    let prompt = null;
    if (P.kickTarget) prompt = { key: 'E', text: 'Chutar', urgent: true };
    else if (best) {
      const o = best.obj;
      if (best.kind === 'pickup') prompt = { key: 'E', text: 'Pegar: ' + PROMPT_ITEM(o.type, o.n) };
      else if (best.kind === 'note') prompt = { key: 'E', text: 'Ler: ' + NOTES[o.id].title };
      else if (best.kind === 'gate') prompt = { key: 'E', text: P.keys.cemetery ? 'Destrancar o portão' : 'Examinar o portão' };
      else if (best.kind === 'winch') prompt = { key: 'E', text: 'Girar a manivela (segure)', hold: o.progress };
    }
    G.ui.prompt(prompt);
    if (!best || P.kickTarget) {
      this.holdT = 0;
      return;
    }
    const o = best.obj;
    if (best.kind === 'winch') {
      if (I.isHeld('act') && !P.action) {
        if (!this.flags[o.id + 'wave']) {
          this.flags[o.id + 'wave'] = true;
          G.enemies.spawnGroup(GROUPS[o.id], 10);
          G.audio.sting();
        }
        o.progress = Math.min(1, o.progress + dt / 3.2);
        this.state.winch[o.id] = o.progress;
        o.spin = 0.1;
        o.sound -= dt;
        if (o.sound <= 0) {
          o.sound = 0.16;
          G.audio.ratchet(o);
        }
        if (o.progress >= 1 && !o.done) {
          o.done = true;
          G.audio.chain(o, 8);
          const n = (this.winches.w1.done ? 1 : 0) + (this.winches.w2.done ? 1 : 0);
          G.ui.msg(n < 2 ? 'Uma trava da ponte se soltou. Falta a outra manivela.' : 'As duas travas se soltaram!');
          if (n === 2) this.lowerBridge();
        }
      }
      return;
    }
    if (!I.pressed('act')) return;
    I.consume('act');
    if (best.kind === 'pickup') this.takePickup(o);
    else if (best.kind === 'note') {
      if (!P.notes.includes(o.id)) P.notes.push(o.id);
      // o documento vai para a mochila (Documentos) e sai do cenário
      this.state.read[o.id] = true;
      this.dyn.remove(o.obj);
      this.notes.splice(this.notes.indexOf(o), 1);
      if (o.id === 'aviso' || o.id === 'prefeito') this.flags.knowKey = true;
      G.game.openNote(o.id);
    } else if (best.kind === 'gate') {
      if (P.keys.cemetery) this.openGate();
      else {
        this.flags.knowKey = true;
        G.ui.msg('O portão está trancado com uma corrente. A chave deve estar com o prefeito.');
      }
    }
  }

  // Objetivo atual e ponto para a bússola.
  objective() {
    const G = this.G,
      P = G.player,
      f = this.flags;
    if (f.bossDead) return { text: OBJ.end, target: null };
    if (f.arena) {
      const b = G.enemies.boss;
      return { text: OBJ.boss, target: b && b.alive ? { x: b.pos.x, z: b.pos.z } : null };
    }
    if (f.bridgeDown) return { text: OBJ.cross, target: { x: 0, z: ARENA.z - ARENA.r + 4 } };
    if (f.gateOpen) {
      const ws = Object.values(this.winches).filter((w) => !w.done);
      const n = 2 - ws.length;
      let tg = null,
        bd = 1e9;
      for (const w of ws) {
        const d = Math.hypot(w.x - P.pos.x, w.z - P.pos.z);
        if (d < bd) {
          bd = d;
          tg = { x: w.x, z: w.z };
        }
      }
      return { text: OBJ.winches(n), target: tg };
    }
    if (P.keys.cemetery) return { text: OBJ.openGate, target: { x: 0, z: 71 } };
    if (f.knowKey || f.square) return { text: OBJ.findKey, target: { x: -15.2, z: 54 } };
    return { text: OBJ.start, target: { x: 0, z: 26 } };
  }
}
