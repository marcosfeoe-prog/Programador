// Fase atual: itens, caixas, barris e documentos (comuns a todos os capítulos), interações,
// gatilhos, objetivos e checkpoints. O que é próprio de cada capítulo (portões, pontes, NPCs,
// missões, chefes) fica em js/chapters/*.js e é chamado daqui.
import * as THREE from 'three';
import { makeCrate, makeDrum, makePickupModel, makeNoteModel } from './models.js';
import { tex } from './textures.js';
import { NOTES, ITEMS } from './story.js';
import { explode } from './combat.js';
import { clamp, rand, chance, weighted } from './util.js';
import { AMMO, ownedAmmoTypes, totalAmmo } from './weapons.js';

const PROMPT_ITEM = (t, n) => {
  let name = ITEMS[t] ? ITEMS[t].name : t;
  if (t.startsWith('ammo_') && AMMO[t.slice(5)]) name = AMMO[t.slice(5)].name;
  return n > 1 && !t.startsWith('weapon_') ? `${name} ×${n}` : name;
};

export function ammoAmount(type, D) {
  const a = AMMO[type.slice(5)];
  if (!a) return 1;
  return Math.max(1, Math.round(rand(a.box[0], a.box[1]) * D.drop));
}

export class Level {
  constructor(G) {
    this.G = G;
    this.scene = G.scene;
    this.dyn = new THREE.Group();
    this.scene.add(this.dyn);
    this.root = null;
    this.chapter = null;
    this.c = {};
    this.pickups = [];
    this.crates = [];
    this.drums = [];
    this.notes = [];
    this.flags = {};
    this.state = null;
    this.dropN = 0;
    this.glowMat = new THREE.SpriteMaterial({ map: tex('glow'), color: 0xffe2a8, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.55 });
  }

  // Troca de capítulo: descarta os objetos do anterior e cria os do novo.
  setChapter(ch) {
    if (this.root) this.scene.remove(this.root);
    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.chapter = ch;
    this.c = {};
    this.pickups = [];
    this.crates = [];
    this.drums = [];
    this.notes = [];
    this.dyn.clear();
    if (ch.setup) ch.setup(this);
  }

  newState() {
    return { chapter: this.chapter.id, cp: this.chapter.firstCheckpoint, flags: {}, taken: {}, broken: {}, read: {}, data: {} };
  }

  // Monta os objetos dinâmicos de acordo com o estado salvo.
  load(state) {
    const G = this.G,
      ch = this.chapter;
    this.state = JSON.parse(JSON.stringify(state));
    const st = this.state;
    st.flags = st.flags || {};
    st.taken = st.taken || {};
    st.broken = st.broken || {};
    st.read = st.read || {};
    st.data = st.data || {};
    if (st.winch && !st.data.winch) st.data.winch = st.winch;
    this.flags = st.flags;
    for (const c of this.crates) this.removeCrate(c);
    for (const d of this.drums) this.removeDrum(d);
    this.dyn.clear();
    this.pickups = [];
    this.crates = [];
    this.drums = [];
    this.notes = [];
    const D = G.diff;
    for (const d of ch.pickups || []) {
      if (st.taken[d.id]) continue;
      let n = d.n;
      if (d.type.startsWith('ammo_')) n = Math.max(1, Math.round(n * D.drop));
      const a = d.anchor ? G.world.anchors[d.anchor] : null;
      if (d.anchor && !a) continue;
      this.addPickup(d.id, d.type, n, a ? a.x : d.x, a ? a.y : d.y ?? 0.02, a ? a.z : d.z, true);
    }
    for (const d of ch.crates || []) if (!st.broken[d.id]) this.addCrate(d);
    for (const d of ch.drums || []) if (!st.broken[d.id]) this.addDrum(d);
    for (const d of ch.notes || []) {
      if (st.read[d.id]) continue;
      const a = d.anchor ? G.world.anchors[d.anchor] : d;
      if (!a) continue;
      this.addNote(d.id, a);
    }
    if (ch.apply) ch.apply(this);
    G.nav.rebuild(G.col, 0.38);
    this.holdT = 0;
  }

  addNote(id, a) {
    const obj = makeNoteModel();
    obj.position.set(a.x, a.y ?? 0.02, a.z);
    if (a.wall) {
      obj.rotation.set(Math.PI / 2, 0, 0);
      obj.rotation.y = a.ry || 0;
    } else obj.rotation.y = rand(0, 3);
    const glow = new THREE.Sprite(this.glowMat);
    glow.scale.setScalar(0.5);
    glow.position.y = 0.05;
    obj.add(glow);
    this.dyn.add(obj);
    const n = { id, x: a.x, y: a.y ?? 0.02, z: a.z, obj, glow };
    this.notes.push(n);
    return n;
  }

  // ------------------------------------------------------------ itens
  addPickup(id, type, n, x, y, z, persistent) {
    const obj = makePickupModel(type);
    const holder = new THREE.Group();
    holder.position.set(x, y, z);
    holder.add(obj);
    const glow = new THREE.Sprite(this.glowMat);
    glow.scale.setScalar(type.startsWith('weapon_') ? 1.1 : 0.6);
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
    const starving = totalAmmo(P) < 8;
    let p = (kind === 'crawler' || kind === 'dog' ? 0.45 : kind === 'brute' ? 0.9 : 0.4) * D.drop;
    if (starving) p = 1;
    if (!chance(p)) return;
    const types = ownedAmmoTypes(P);
    let t;
    if (starving) t = 'ammo_' + (chance(0.65) ? 'pistol' : types[Math.floor(Math.random() * types.length)]);
    else {
      const table = [['tonic', P.hp < 60 ? 22 : 12], ['grenade', 3], ['molotov', 3]];
      for (const a of types) table.push(['ammo_' + a, a === 'pistol' ? 46 : a === 'shotgun' ? 18 : 12]);
      t = weighted(table);
    }
    const n = t.startsWith('ammo_') ? ammoAmount(t, D) : 1;
    this.drop(t, n, x, z);
  }

  takePickup(p) {
    const G = this.G;
    const label = G.player.addItem(p.type, p.n);
    if (p.persistent) this.state.taken[p.id] = true;
    this.dyn.remove(p.obj);
    this.pickups.splice(this.pickups.indexOf(p), 1);
    const special = p.type === 'key' || p.type.startsWith('weapon_') || p.type.startsWith('mission_');
    if (special) G.audio.keyItem();
    else G.audio.pickup();
    G.ui.msg(label, special);
    if (this.chapter.onPickup) this.chapter.onPickup(this, p);
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
      const table = [['tonic', 18], ['grenade', 4], ['molotov', 4]];
      for (const a of ownedAmmoTypes(G.player)) table.push(['ammo_' + a, a === 'pistol' ? 50 : a === 'shotgun' ? 18 : 12]);
      type = weighted(table);
    }
    const n = type.startsWith('ammo_') ? ammoAmount(type, D) : 1;
    this.drop(type, n, c.x, c.z);
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

  // ------------------------------------------------------------ atualização
  update(dt) {
    const G = this.G,
      P = G.player,
      t = G.time;
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
    if (this.chapter.update) this.chapter.update(this, dt);
    if (P.dead || G.state !== 'play') return;
    if (this.chapter.triggers) this.chapter.triggers(this);
    if (G.state === 'play') this.interaction(dt);
  }

  checkpoint(id) {
    const G = this.G;
    const cp = this.chapter.checkpoints[id];
    this.state.cp = id;
    this.state.chapter = this.chapter.id;
    this.state.flags = this.flags;
    const snap = JSON.parse(JSON.stringify(this.state));
    snap.player = G.player.serialize();
    snap.stats = { ...G.stats };
    snap.pos = { x: cp.x, z: cp.z, yaw: cp.yaw };
    G.game.saveCheckpoint(snap);
    G.ui.checkpoint();
  }

  readNote(n) {
    const G = this.G,
      P = G.player;
    if (!P.notes.includes(n.id)) P.notes.push(n.id);
    this.state.read[n.id] = true;
    this.dyn.remove(n.obj);
    const i = this.notes.indexOf(n);
    if (i >= 0) this.notes.splice(i, 1);
    if (this.chapter.onNoteRead) this.chapter.onNoteRead(this, n.id);
    G.game.openNote(n.id);
  }

  // Item, documento ou mecanismo mais próximo à frente.
  interaction(dt) {
    const G = this.G,
      P = G.player,
      I = G.input,
      ch = this.chapter;
    let best = null,
      bd = 1e9;
    const fx = Math.sin(P.yaw),
      fz = Math.cos(P.yaw);
    const consider = (obj, x, z, r, kind, bias = 0) => {
      const dx = x - P.pos.x,
        dz = z - P.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > r) return;
      const front = (dx * fx + dz * fz) / (d || 1);
      const score = d - front * 0.5 + bias;
      if (d > 0.9 && front < -0.3) return;
      if (score < bd) {
        bd = score;
        best = { obj, kind, d };
      }
    };
    for (const p of this.pickups) if (p.drop <= 0) consider(p, p.x, p.z, 1.7, 'pickup');
    for (const n of this.notes) consider(n, n.x, n.z, 1.7, 'note', 0.35);
    if (ch.interactables) ch.interactables(this, consider);
    let prompt = null;
    if (P.grabbed) prompt = { key: 'E', text: 'Solte-se! (aperte várias vezes)', urgent: true };
    else if (P.kickTarget) prompt = { key: 'E', text: 'Chutar', urgent: true };
    else if (best) {
      const o = best.obj;
      if (best.kind === 'pickup') prompt = { key: 'E', text: 'Pegar: ' + PROMPT_ITEM(o.type, o.n) };
      else if (best.kind === 'note') prompt = { key: 'E', text: 'Ler: ' + (NOTES[o.id] ? NOTES[o.id].title : 'Documento') };
      else if (ch.prompt) prompt = ch.prompt(this, best);
    }
    G.ui.prompt(prompt);
    if (!best || P.kickTarget) {
      this.holdT = 0;
      return;
    }
    const o = best.obj;
    const pressed = I.pressed('act');
    if (P.grabbed) return;
    if (best.kind === 'pickup' || best.kind === 'note') {
      if (!pressed) return;
      I.consume('act');
      if (best.kind === 'pickup') this.takePickup(o);
      else this.readNote(o);
      return;
    }
    if (ch.interact) {
      const used = ch.interact(this, best, { pressed, held: I.isHeld('act') && !P.action, dt });
      if (used) I.consume('act');
    }
  }

  objective() {
    return this.chapter.objective(this);
  }

  // Lista de missões do capítulo ({ title, desc, done, active }) ou null.
  missions() {
    return this.chapter && this.chapter.missions ? this.chapter.missions(this) : null;
  }
}
