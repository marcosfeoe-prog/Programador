// Objetos: itens que se pegam (com luz de sonda) e móveis estáticos (com luz
// por vértice), montados com primitivas.
import * as THREE from 'three';
import { gameMaterial, tex } from './materials.js';
import { almondLabel, paperTex } from './textures.js';
import { t } from './i18n.js';

const M4 = (x, y, z, ry = 0, rx = 0, rz = 0, s = 1) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(s, s, s));

let LABEL = null;
const probeMat = (o) => gameMaterial({ probe: true, forcePBR: true, ...o });

// --------------------------------------------------------------- itens --
export function makeItem(kind, seed = 1) {
  const g = new THREE.Group();
  if (kind === 'almond') {
    if (!LABEL) LABEL = almondLabel();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.036, 0.19, 18), probeMat({ color: 0xd9cdb0, roughness: 0.18, transparent: true }));
    body.material.opacity = 0.82;
    body.position.y = 0.095;
    const label = new THREE.Mesh(new THREE.CylinderGeometry(0.0365, 0.0375, 0.08, 18, 1, true), probeMat({ map: LABEL, roughness: 0.6 }));
    label.position.y = 0.09;
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.034, 0.04, 14), body.material);
    neck.position.y = 0.21;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.02, 12), probeMat({ color: 0x2b4c8a, roughness: 0.4 }));
    cap.position.y = 0.24;
    g.add(body, label, neck, cap);
  } else if (kind === 'battery') {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.062, 14), probeMat({ color: 0x1b1b1b, roughness: 0.3, metalness: 0.4 }));
    body.position.y = 0.031;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.0172, 0.0172, 0.024, 14, 1, true), probeMat({ color: 0xc8892a, roughness: 0.35, metalness: 0.6 }));
    band.position.y = 0.05;
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.006, 10), probeMat({ color: 0xbbbbbb, metalness: 0.9, roughness: 0.2 }));
    tip.position.y = 0.065;
    g.add(body, band, tip);
    g.rotation.z = Math.PI / 2;
    g.position.y = 0.017;
  } else if (kind === 'note') {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.26), probeMat({ map: paperTex(seed), roughness: 0.9, side: THREE.DoubleSide }));
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.006;
    g.add(m);
  } else if (kind === 'fuse') {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.07, 14), probeMat({ color: 0xe9e2d0, roughness: 0.5 }));
    const capm = probeMat({ color: 0xc9c9c9, metalness: 0.9, roughness: 0.25 });
    const c1 = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.018, 14), capm);
    c1.position.y = 0.04;
    const c2 = c1.clone();
    c2.position.y = -0.04;
    const fg = new THREE.Group();
    fg.add(body, c1, c2);
    fg.rotation.z = Math.PI / 2;
    fg.position.y = 0.016;
    g.add(fg);
  } else if (kind === 'key') {
    const brass = probeMat({ color: 0xd9a63a, metalness: 0.9, roughness: 0.25 });
    const bow = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.006, 8, 18), brass);
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.008, 0.005), brass);
    shaft.position.x = 0.045;
    const t1 = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.014, 0.005), brass);
    t1.position.set(0.065, -0.008, 0);
    const t2 = t1.clone();
    t2.position.x = 0.052;
    g.add(bow, shaft, t1, t2);
    g.rotation.x = -Math.PI / 2;
    g.position.y = 0.004;
  }
  g.traverse((o) => {
    if (o.isMesh) o.castShadow = true;
  });
  return g;
}

// brilho piscando para itens de missão
let SPARK = null;
export function sparkle() {
  if (!SPARK) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 30);
    gr.addColorStop(0, 'rgba(255,250,220,1)');
    gr.addColorStop(0.25, 'rgba(255,240,190,0.5)');
    gr.addColorStop(1, 'rgba(255,240,190,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = 'rgba(255,255,240,0.9)';
    g.fillRect(31, 4, 2, 56);
    g.fillRect(4, 31, 56, 2);
    SPARK = new THREE.CanvasTexture(c);
  }
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: SPARK, color: new THREE.Color(2, 2, 1.8), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
  s.scale.setScalar(0.12);
  return s;
}

// Registra um item no nível (interação + efeito).
export function addPickup(level, kind, x, z, { y = 0, rot = 0, note = null, onTake = null, spark = false, label = null } = {}) {
  const game = level.game;
  const obj = makeItem(kind, Math.floor(x * 31 + z * 7));
  const holder = new THREE.Group();
  holder.position.set(x, y, z);
  holder.rotation.y = rot;
  holder.add(obj);
  let sp = null;
  if (spark) {
    sp = sparkle();
    sp.position.y = 0.1;
    holder.add(sp);
  }
  level.group.add(holder);
  const pk = { kind, obj: holder, taken: false, sp };
  level.pickups.push(pk);
  const labels = { almond: 'p_almond', battery: 'p_battery', note: 'p_note', fuse: 'p_fuse', key: 'p_padlock' };
  const it = {
    pos: new THREE.Vector3(x, y + 0.08, z),
    r: 0.25,
    label: () => (label ? label() : t(labels[kind])),
    use: () => {
      if (pk.taken) return;
      if (kind !== 'note') {
        pk.taken = true;
        it.done = true;
        level.group.remove(holder);
      }
      const p = game.player;
      if (kind === 'almond') {
        p.heal(35);
        p.stamina = 1;
        game.audio.drink();
        game.ui.toast(t('t_almond'));
      } else if (kind === 'battery') {
        p.battery = Math.min(1, p.battery + 0.65);
        game.audio.pickup();
        game.ui.toast(t('t_battery'));
      } else if (kind === 'note') {
        game.overlay('note', t('notes.' + note));
      } else game.audio.pickup();
      onTake && onTake();
    },
  };
  level.interactables.push(it);
  if (sp) level.updaters.push((dt, tt) => sp.material.opacity = 0.35 + 0.65 * Math.max(0, Math.sin(tt * 3 + x)));
  return pk;
}

// ---------------------------------------------------- móveis (estáticos) --
const WOOD = { map: 'wood.jpg', normalMap: 'wood_n.jpg', roughness: 0.85 };

export function crate(level, x, z, s = 0.8, rot = 0, y = 0) {
  const b = level.prop('crate', WOOD);
  b.box(x, y + s / 2, z, s, s, s, { rot, uvs: 0.5 });
  // ripas nas bordas
  const e = 0.05;
  for (const [ox, oz] of [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ]) {
    const c = Math.cos(rot), sn = Math.sin(rot);
    const px = (ox * (s / 2 - e / 2 + 0.008)), pz = (oz * (s / 2 - e / 2 + 0.008));
    b.box(x + px * c + pz * sn, y + s / 2, z - px * sn + pz * c, e, s, e, { rot, uvs: 0.5 });
  }
  level.grid.addSolid(x - s / 2 - 0.02, z - s / 2 - 0.02, x + s / 2 + 0.02, z + s / 2 + 0.02, y, y + s);
}

export function cardboard(level, x, y, z, w, h, d, rot = 0) {
  const b = level.prop('cardboard', { map: 'cardboard.jpg', normalMap: 'cardboard_n.jpg', roughness: 0.9 });
  b.box(x, y + h / 2, z, w, h, d, { rot, uvs: 0.5 });
  const tape = level.prop('tape', { color: 0xb59a6a, roughness: 0.4 });
  tape.box(x, y + h + 0.002, z, w * 0.18, 0.004, d + 0.004, { rot });
}

export function pallet(level, x, z, rot = 0) {
  const b = level.prop('crate', WOOD);
  for (let i = -2; i <= 2; i++) b.box(x + i * 0.27 * Math.cos(rot), 0.13, z - i * 0.27 * Math.sin(rot), 0.1, 0.02, 1.2, { rot, uvs: 0.5 });
  for (const o of [-0.5, 0, 0.5]) b.box(x + o * Math.sin(rot), 0.06, z + o * Math.cos(rot), 1.2, 0.1, 0.1, { rot, uvs: 0.5 });
  level.grid.addSolid(x - 0.6, z - 0.6, x + 0.6, z + 0.6, 0, 0.14, { nav: false });
}

// Estante metálica com caixas.
export function shelf(level, x, z, len, rot, r) {
  const steel = level.prop('steel', { color: 0x2d4f8c, roughness: 0.45, metalness: 0.5 });
  const beam = level.prop('beam', { color: 0xd86a1e, roughness: 0.5, metalness: 0.4 });
  const deck = level.prop('deck', { color: 0x777a7c, roughness: 0.6, metalness: 0.5 });
  const D = 0.9, H = 2.6;
  const c = Math.cos(rot), s = Math.sin(rot);
  const P = (u, v) => [x + u * c + v * s, z - u * s + v * c];
  const n = Math.max(1, Math.round(len / 1.8));
  const seg = len / n;
  for (let i = 0; i <= n; i++) {
    const u = -len / 2 + i * seg;
    for (const v of [-D / 2, D / 2]) {
      const [px, pz] = P(u, v);
      steel.box(px, H / 2, pz, 0.07, H, 0.07, { rot });
    }
  }
  for (const y of [0.15, 0.95, 1.75, 2.5]) {
    for (const v of [-D / 2, D / 2]) {
      const [px, pz] = P(0, v);
      beam.box(px, y, pz, len, 0.1, 0.05, { rot });
    }
    const [px, pz] = P(0, 0);
    deck.box(px, y + 0.06, pz, len, 0.02, D, { rot });
    // caixas
    if (y < 2.4)
      for (let u = -len / 2 + 0.3; u < len / 2 - 0.3; u += r.range(0.45, 0.8)) {
        if (r.chance(0.25)) continue;
        const w = r.range(0.35, 0.6), h = r.range(0.25, 0.55), dd = r.range(0.4, 0.75);
        const [bx, bz] = P(u, r.range(-0.1, 0.1));
        cardboard(level, bx, y + 0.07, bz, w, Math.min(h, 0.7), dd, rot + r.range(-0.08, 0.08));
      }
  }
  const [a0x, a0z] = P(-len / 2, -D / 2), [a1x, a1z] = P(len / 2, D / 2);
  level.grid.addSolid(Math.min(a0x, a1x) - 0.04, Math.min(a0z, a1z) - 0.04, Math.max(a0x, a1x) + 0.04, Math.max(a0z, a1z) + 0.04, 0, H);
}

// Mesa de festa com toalha, pratos, copos, chapéus e às vezes bolo.
export function partyTable(level, x, z, rot, r, cloth) {
  const W = 1.8, D = 0.9, Hh = 0.74;
  const c = Math.cos(rot), s = Math.sin(rot);
  const P = (u, v) => [x + u * c + v * s, z - u * s + v * c];
  const top = level.prop('cloth' + cloth, { map: 'cloth.jpg', normalMap: 'cloth_n.jpg', color: cloth, roughness: 0.35 });
  top.box(x, Hh, z, W + 0.1, 0.03, D + 0.1, { rot, uvs: 1 });
  // aba da toalha caindo
  top.box(...[P(0, D / 2 + 0.05)].map(([a, b]) => [a, Hh - 0.13, b])[0], W + 0.1, 0.27, 0.01, { rot, uvs: 1 });
  top.box(...[P(0, -D / 2 - 0.05)].map(([a, b]) => [a, Hh - 0.13, b])[0], W + 0.1, 0.27, 0.01, { rot, uvs: 1 });
  top.box(...[P(W / 2 + 0.05, 0)].map(([a, b]) => [a, Hh - 0.13, b])[0], 0.01, 0.27, D + 0.1, { rot, uvs: 1 });
  top.box(...[P(-W / 2 - 0.05, 0)].map(([a, b]) => [a, Hh - 0.13, b])[0], 0.01, 0.27, D + 0.1, { rot, uvs: 1 });
  const leg = level.prop('legs', { color: 0x3a3a3a, roughness: 0.5, metalness: 0.6 });
  for (const [u, v] of [
    [W / 2 - 0.1, D / 2 - 0.1],
    [-W / 2 + 0.1, D / 2 - 0.1],
    [W / 2 - 0.1, -D / 2 + 0.1],
    [-W / 2 + 0.1, -D / 2 + 0.1],
  ]) {
    const [px, pz] = P(u, v);
    leg.box(px, (Hh - 0.27) / 2, pz, 0.04, Hh - 0.27, 0.04, { rot });
  }
  const plate = level.prop('plate', { color: 0xf2efe6, roughness: 0.4 });
  const cupG = new THREE.CylinderGeometry(0.035, 0.028, 0.1, 10, 1, true);
  const plG = new THREE.CylinderGeometry(0.11, 0.08, 0.015, 16);
  const hatG = new THREE.ConeGeometry(0.07, 0.18, 12, 1, true);
  const cups = level.prop('cups', { color: 0xd23a6a, roughness: 0.5, side: THREE.DoubleSide });
  const hats = level.prop('hats', { color: 0x3b7be0, roughness: 0.6, side: THREE.DoubleSide });
  for (let i = 0; i < 6; i++) {
    const u = -W / 2 + 0.3 + (i % 3) * 0.6, v = i < 3 ? -D / 2 + 0.2 : D / 2 - 0.2;
    const [px, pz] = P(u + r.range(-0.05, 0.05), v);
    plate.add(plG, M4(px, Hh + 0.024, pz));
    if (r.chance(0.6)) {
      const [cx, cz] = P(u + 0.18, v * 0.6);
      cups.add(cupG, M4(cx, Hh + 0.065, cz));
    }
    if (r.chance(0.35)) {
      const [hx, hz] = P(u - 0.15, v * 0.5);
      hats.add(hatG, M4(hx, Hh + 0.105, hz, 0, r.range(-0.2, 0.2), r.range(-0.2, 0.2)));
    }
  }
  if (r.chance(0.4)) {
    const cake = level.prop('cake', { color: 0xf0d8e0, roughness: 0.7 });
    const cakeG = new THREE.CylinderGeometry(0.17, 0.17, 0.14, 20);
    cake.add(cakeG, M4(x, Hh + 0.09, z));
    const icing = level.prop('icing', { color: 0xc8325a, roughness: 0.5 });
    icing.add(new THREE.CylinderGeometry(0.175, 0.175, 0.02, 20), M4(x, Hh + 0.16, z));
    const cand = level.prop('candles', { color: 0x4fa3e0, roughness: 0.5 });
    for (let k = 0; k < 5; k++) cand.add(new THREE.CylinderGeometry(0.006, 0.006, 0.07, 6), M4(x + Math.cos(k * 1.25) * 0.09, Hh + 0.205, z + Math.sin(k * 1.25) * 0.09));
  }
  const [a0x, a0z] = P(-W / 2 - 0.05, -D / 2 - 0.05), [a1x, a1z] = P(W / 2 + 0.05, D / 2 + 0.05);
  level.grid.addSolid(Math.min(a0x, a1x), Math.min(a0z, a1z), Math.max(a0x, a1x), Math.max(a0z, a1z), Hh - 0.3, Hh + 0.02);
}

export function chair(level, x, z, rot, color = 0x9a9a98) {
  const b = level.prop('chair' + color, { color, roughness: 0.45, metalness: 0.3 });
  const c = Math.cos(rot), s = Math.sin(rot);
  const P = (u, v) => [x + u * c + v * s, z - u * s + v * c];
  b.box(x, 0.45, z, 0.44, 0.04, 0.42, { rot });
  const [bx, bz] = P(0, -0.2);
  b.box(bx, 0.74, bz, 0.44, 0.24, 0.03, { rot });
  for (const [u, v] of [
    [0.19, 0.18],
    [-0.19, 0.18],
    [0.19, -0.19],
    [-0.19, -0.19],
  ]) {
    const [px, pz] = P(u, v);
    b.box(px, v < 0 ? 0.43 : 0.22, pz, 0.025, v < 0 ? 0.86 : 0.44, 0.025, { rot });
  }
  level.grid.addSolid(x - 0.25, z - 0.25, x + 0.25, z + 0.25, 0, 0.5, { occlude: false });
}

// Tomada / grelha de ventilação nas paredes (decoração realista).
export function wallBits(level, quads, r, count = 60) {
  const b = level.prop('outlet', { color: 0xe8e4d8, roughness: 0.35 });
  const v = level.prop('vent', { color: 0xc9c5b8, roughness: 0.5, metalness: 0.3 });
  const walls = quads.filter((q) => q.kind === 1 && q.base && q.lu > 1);
  for (let i = 0; i < count; i++) {
    const q = walls[Math.floor(r() * walls.length)];
    const s = 0.3 + r() * (q.lu - 0.6);
    const vent = r.chance(0.35);
    const y = vent ? q.lv - 0.35 : 0.3;
    const p = [q.o[0] + q.u[0] * s, y, q.o[2] + q.u[2] * s];
    const rot = Math.atan2(q.n[0], q.n[2]);
    const off = vent ? 0.008 : 0.006;
    const cx = p[0] + q.n[0] * off, cz = p[2] + q.n[2] * off;
    if (vent) {
      v.box(cx, y, cz, 0.5, 0.3, 0.016, { rot });
      for (let k = 0; k < 6; k++) v.box(cx + q.n[0] * 0.01, y - 0.11 + k * 0.045, cz + q.n[2] * 0.01, 0.44, 0.012, 0.012, { rot });
    } else {
      b.box(cx, y, cz, 0.08, 0.12, 0.012, { rot });
    }
  }
}

// Porta (retângulo com batente) encostada numa face de parede; devolve as peças.
export function doorOnWall(level, q, s, { w = 0.95, h = 2.1, map = 'door_metal.jpg', frameColor = 0x6d6a62, normal = 'door_metal_n.jpg', rough = 'door_metal_r.jpg', metal = 0.3 } = {}) {
  const rot = Math.atan2(q.n[0], q.n[2]);
  const bx = q.o[0] + q.u[0] * s, bz = q.o[2] + q.u[2] * s;
  const frame = level.prop('frame', { color: frameColor, roughness: 0.5, metalness: 0.4 });
  const fx = (k, y, ww, hh) => frame.box(bx + q.u[0] * k + q.n[0] * 0.03, y, bz + q.u[2] * k + q.n[2] * 0.03, ww, hh, 0.06, { rot });
  fx(-w / 2 - 0.04, h / 2, 0.08, h);
  fx(w / 2 + 0.04, h / 2, 0.08, h);
  fx(0, h + 0.04, w + 0.16, 0.08);
  // vão escuro atrás da porta (aparece quando abre)
  const voidM = level.prop('void', { color: 0x000000, roughness: 1, vlight: false });
  voidM.quad(
    [
      [bx - q.u[0] * w / 2 + q.n[0] * 0.004, 0, bz - q.u[2] * w / 2 + q.n[2] * 0.004],
      [bx + q.u[0] * w / 2 + q.n[0] * 0.004, 0, bz + q.u[2] * w / 2 + q.n[2] * 0.004],
      [bx + q.u[0] * w / 2 + q.n[0] * 0.004, h, bz + q.u[2] * w / 2 + q.n[2] * 0.004],
      [bx - q.u[0] * w / 2 + q.n[0] * 0.004, h, bz - q.u[2] * w / 2 + q.n[2] * 0.004],
    ],
    q.n,
    [[0, 0], [1, 0], [1, 1], [0, 1]]
  );
  // folha da porta: objeto dinâmico com dobradiça
  const hinge = new THREE.Group();
  hinge.position.set(bx - q.u[0] * w / 2 + q.n[0] * 0.03, 0, bz - q.u[2] * w / 2 + q.n[2] * 0.03);
  hinge.rotation.y = rot;
  const mat = probeMat({ map: tex(map), normalMap: normal ? tex(normal, { srgb: false }) : null, roughnessMap: rough ? tex(rough, { srgb: false }) : null, metalness: metal, roughness: 1 });
  const leaf = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.045), mat);
  leaf.position.set(w / 2, h / 2, 0);
  leaf.castShadow = true;
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.13, 8), probeMat({ color: 0xaaaaaa, metalness: 0.9, roughness: 0.25 }));
  handle.rotation.z = Math.PI / 2;
  handle.position.set(w - 0.12, 1.02, 0.05);
  leaf.add(handle);
  hinge.add(leaf);
  level.group.add(hinge);
  level.pickups.push({ obj: hinge, taken: false, kind: 'door' });
  const center = new THREE.Vector3(bx + q.n[0] * 0.05, 1.1, bz + q.n[2] * 0.05);
  const col = level.grid.addSolid(Math.min(bx - q.u[0] * w / 2, bx + q.u[0] * w / 2) - 0.02 + Math.min(0, q.n[0] * 0.1), Math.min(bz - q.u[2] * w / 2, bz + q.u[2] * w / 2) - 0.02 + Math.min(0, q.n[2] * 0.1), Math.max(bx - q.u[0] * w / 2, bx + q.u[0] * w / 2) + 0.02 + Math.max(0, q.n[0] * 0.1), Math.max(bz - q.u[2] * w / 2, bz + q.u[2] * w / 2) + 0.02 + Math.max(0, q.n[2] * 0.1), 0, h, { occlude: false, nav: false });
  return { hinge, leaf, center, rot, q, s, w, h, col, mat };
}
