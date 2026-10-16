// Nível 177 — peças compartilhadas pelas cinco áreas: o Mike (o próprio
// andarilho, visto de fora), a trilha sonora que continua de uma área para a
// outra, casas simples, chaleira com vapor, fogo, partículas e a faixa de cena.
import * as THREE from 'three';
import { GeoBuilder } from '../materials.js';
import { getTex, TEX } from '../textures.js';
import { mulberry32, TAU } from '../util.js';
import { NPC } from './level0_1_npc.js';

export const MIKE_LOOK = { skin: '#c8956c', hair: '#2a1c12', hairStyle: 'short', suit: '#3c4a3a', accent: '#d8c070', arms: 'down', eyes: '#2c1d12', beard: 'rgba(40,25,15,0.35)' };

// O Mike de corpo inteiro (para as cenas).
export function makeMike(level) {
  const me = new NPC(level, { id: 'mike', name: '', role: '', x: 0, z: 0, yaw: 0, h: 1.75, look: MIKE_LOOK });
  me.tag.visible = false;
  me.root.visible = false;
  me.amb.value.set(0.6, 0.6, 0.62);
  return me;
}

// Ciclo de caminhada simples (pernas e braços balançando).
export function walkPose(me, ph, k = 1) {
  me.legs.forEach((hip, i) => {
    const s = i ? 1 : -1;
    hip.rotation.x = Math.sin(ph) * 0.5 * s * k;
    const knee = hip.children.find((c) => c.isGroup);
    if (knee) knee.rotation.x = Math.max(0, -Math.sin(ph) * s) * 0.7 * k;
  });
  me.arms.forEach((a, i) => {
    const s = i ? -1 : 1;
    a.sh.rotation.x = Math.sin(ph) * 0.4 * s * k;
    a.sh.rotation.z = a.sx * 0.08;
    a.el.rotation.x = -0.25 * k;
  });
}

// ------------------------------------------------------------ trilha sonora
// A faixa continua de onde parou ao trocar de área (mesmo nome).
export const TRACK_A = { name: 'l177a', url: 'assets/audio/l177_rescue.m4a' };
export const TRACK_B = { name: 'l177b', url: 'assets/audio/l177_notthesame.m4a' };

export function music(level, T, gain = 0.55) {
  const g = level.game;
  const a = g.audio;
  if (!a.ready) return null;
  if (!level.track) {
    if (a.B[T.name]) {
      const mem = g.trackMem && g.trackMem.name === T.name ? g.trackMem.pos : 0;
      level.track = a.startTrack(T.name, gain, 1.5, mem);
      level.trackName = T.name;
    } else if (!level.trackLoading) {
      level.trackLoading = true;
      a.loadTrack(T.name, T.url);
    }
  }
  return level.track;
}

export async function preloadTrack(game, T) {
  if (!game.audio.ready) return;
  await Promise.race([game.audio.loadTrack(T.name, T.url), new Promise((r) => setTimeout(r, 4000))]);
}

export function rememberTrack(level) {
  if (level.track && level.track.pos) level.game.trackMem = { name: level.trackName, pos: level.track.pos() };
}

// ------------------------------------------------------------ texturas
export function dotTex() {
  const S = 64;
  const c = TEX.makeCanvas(S, S);
  const x = c.getContext('2d');
  const g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.3, 'rgba(255,255,255,0.6)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, S, S);
  return TEX.toTex(c, { repeat: false });
}

export function flameTex() {
  const c = TEX.makeCanvas(64, 128);
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 96, 2, 32, 80, 60);
  g.addColorStop(0, 'rgba(255,250,210,1)');
  g.addColorStop(0.25, 'rgba(255,190,70,0.95)');
  g.addColorStop(0.6, 'rgba(255,90,20,0.5)');
  g.addColorStop(1, 'rgba(255,40,0,0)');
  x.fillStyle = g;
  x.beginPath();
  x.moveTo(32, 2);
  x.bezierCurveTo(60, 50, 64, 100, 32, 126);
  x.bezierCurveTo(0, 100, 4, 50, 32, 2);
  x.fill();
  return TEX.toTex(c, { repeat: false });
}

// Grama: textura para o chão e cartões de tufos.
export function grassTex(S, base, hue0, hue1, light0, light1, seed = 1) {
  const c = TEX.makeCanvas(S, S);
  const x = c.getContext('2d');
  x.fillStyle = base;
  x.fillRect(0, 0, S, S);
  const r = mulberry32(seed);
  const k = S / 512;
  const n = Math.floor((S * S) / 60);
  for (let i = 0; i < n; i++) {
    const px = r() * S;
    const py = r() * S;
    const len = (3 + r() * 6) * k;
    const a = -Math.PI / 2 + (r() - 0.5) * 1.2;
    x.strokeStyle = `hsl(${hue0 + r() * (hue1 - hue0)},${35 + r() * 30}%,${light0 + r() * (light1 - light0)}%)`;
    x.lineWidth = (0.7 + r() * 1.2) * k;
    for (const ox of px < 10 * k ? [0, S] : px > S - 10 * k ? [0, -S] : [0])
      for (const oy of py < 10 * k ? [0, S] : py > S - 10 * k ? [0, -S] : [0]) {
        x.beginPath();
        x.moveTo(px + ox, py + oy);
        x.lineTo(px + ox + Math.cos(a) * len, py + oy + Math.sin(a) * len);
        x.stroke();
      }
  }
  return TEX.toTex(c);
}

export function bladeTex(hue0, hue1, l0, l1, seed = 3) {
  const S = 128;
  const c = TEX.makeCanvas(S, S);
  const x = c.getContext('2d');
  const r = mulberry32(seed);
  for (let i = 0; i < 40; i++) {
    const bx = 8 + r() * (S - 16);
    const h = S * (0.4 + r() * 0.6);
    const lean = (r() - 0.5) * 30;
    const w = 2 + r() * 3;
    const g = x.createLinearGradient(0, S, 0, S - h);
    const hue = hue0 + r() * (hue1 - hue0);
    g.addColorStop(0, `hsl(${hue},40%,${l0}%)`);
    g.addColorStop(1, `hsl(${hue},${45 + r() * 30}%,${l1 - r() * 12}%)`);
    x.fillStyle = g;
    x.beginPath();
    x.moveTo(bx - w, S);
    x.quadraticCurveTo(bx + lean * 0.3, S - h * 0.6, bx + lean, S - h);
    x.quadraticCurveTo(bx + lean * 0.3 + w * 0.3, S - h * 0.6, bx + w, S);
    x.fill();
  }
  return TEX.toTex(c, { repeat: false });
}

// Tufos de capim em volta do jogador (InstancedMesh com cartões cruzados).
export class GrassTufts {
  constructor(level, map, R, h = 0.42, color = 0xffffff) {
    this.L = level;
    const pos = [];
    const nor = [];
    const uv = [];
    for (const a of [0, Math.PI / 3, (2 * Math.PI) / 3]) {
      const cx = Math.cos(a) * 0.3;
      const cz = Math.sin(a) * 0.3;
      const P = [
        [-cx, 0, -cz],
        [cx, 0, cz],
        [cx, h, cz],
        [-cx, 0, -cz],
        [cx, h, cz],
        [-cx, h, -cz],
      ];
      const U = [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 0],
        [1, 1],
        [0, 1],
      ];
      for (let i = 0; i < 6; i++) {
        pos.push(...P[i]);
        nor.push(0, 1, 0);
        uv.push(...U[i]);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    this.geo = g;
    this.mat = new THREE.MeshStandardMaterial({ map, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 1, color });
    this.R = R;
    const n = Math.ceil((R * 2) / 1.4) ** 2;
    this.mesh = new THREE.InstancedMesh(g, this.mat, n);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    level.scene.add(this.mesh);
  }

  refresh(px, pz, ground, skip) {
    const c = 1.4;
    const R = this.R;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const v = new THREE.Vector3();
    const s3 = new THREE.Vector3();
    let n = 0;
    const h = (a, b, k) => {
      const s = Math.sin(a * 127.1 + b * 311.7 + k * 74.7) * 43758.5453;
      return s - Math.floor(s);
    };
    for (let i = Math.floor((px - R) / c); i <= Math.floor((px + R) / c); i++)
      for (let j = Math.floor((pz - R) / c); j <= Math.floor((pz + R) / c); j++) {
        const x = (i + h(i, j, 1)) * c;
        const z = (j + h(i, j, 2)) * c;
        if ((x - px) ** 2 + (z - pz) ** 2 > R * R) continue;
        if (skip && skip(x, z)) continue;
        if (n >= this.mesh.instanceMatrix.count) break;
        const s = 0.7 + h(i, j, 3) * 0.8;
        m.compose(v.set(x, ground(x, z) - 0.03, z), q.setFromEuler(e.set(0, h(i, j, 4) * TAU, 0)), s3.set(s, s * (0.8 + h(i, j, 5) * 0.6), s));
        this.mesh.setMatrixAt(n++, m);
      }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.L.scene.remove(this.mesh);
    this.mesh.dispose();
    this.geo.dispose();
    this.mat.dispose();
  }
}

// ------------------------------------------------------------ partículas
// Vapor/fumaça subindo de um ponto (sprites que crescem e somem).
export class Puffs {
  constructor(parent, map, { n = 14, color = 0xffffff, size = 0.25, grow = 1.2, rise = 0.5, life = 3, spread = 0.05, opacity = 0.5 } = {}) {
    this.o = { size, grow, rise, life, spread, opacity };
    this.list = [];
    for (let i = 0; i < n; i++) {
      const m = new THREE.SpriteMaterial({ map, color, transparent: true, depthWrite: false, opacity: 0 });
      const s = new THREE.Sprite(m);
      s.visible = false;
      parent.add(s);
      this.list.push({ s, t: (i / n) * life, ox: 0, oz: 0 });
    }
    this.origin = new THREE.Vector3();
  }

  update(dt) {
    const o = this.o;
    for (const p of this.list) {
      p.t += dt;
      if (p.t > o.life) {
        p.t -= o.life;
        p.ox = (Math.random() - 0.5) * o.spread;
        p.oz = (Math.random() - 0.5) * o.spread;
      }
      const k = p.t / o.life;
      p.s.visible = true;
      p.s.position.set(this.origin.x + p.ox + Math.sin(p.t * 1.7) * 0.05 * k * 4, this.origin.y + k * o.rise * o.life, this.origin.z + p.oz);
      p.s.scale.setScalar(o.size * (1 + k * o.grow * 3));
      p.s.material.opacity = o.opacity * Math.sin(Math.PI * k) * (1 - k * 0.3);
    }
  }

  dispose() {
    for (const p of this.list) {
      p.s.removeFromParent();
      p.s.material.dispose();
    }
  }
}

// Fogo: algumas chamas (sprites) tremulando + luz.
export class Fire {
  constructor(parent, map, x, y, z, { scale = 1, light = true, intensity = 6, dist = 10 } = {}) {
    this.g = new THREE.Group();
    this.g.position.set(x, y, z);
    parent.add(this.g);
    this.flames = [];
    for (let i = 0; i < 5; i++) {
      const m = new THREE.SpriteMaterial({ map, color: new THREE.Color(1.6, 1.1, 0.7), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
      const s = new THREE.Sprite(m);
      const a = (i / 5) * TAU;
      s.userData = { x: Math.cos(a) * 0.12 * scale, z: Math.sin(a) * 0.12 * scale, ph: Math.random() * 10, h: (0.45 + Math.random() * 0.3) * scale };
      this.g.add(s);
      this.flames.push(s);
    }
    if (light) {
      this.light = new THREE.PointLight(0xff8a3a, intensity, dist, 1.6);
      this.light.position.set(0, 0.4 * scale, 0);
      this.g.add(this.light);
      this.base = intensity;
    }
  }

  update(t) {
    for (const s of this.flames) {
      const u = s.userData;
      const f = 0.8 + Math.sin(t * 9 + u.ph) * 0.15 + Math.sin(t * 23 + u.ph * 2) * 0.08;
      s.scale.set(u.h * 0.55, u.h * f, 1);
      s.position.set(u.x, (u.h * f) / 2, u.z);
    }
    if (this.light) this.light.intensity = this.base * (0.85 + Math.sin(t * 13) * 0.08 + Math.sin(t * 31) * 0.06);
  }

  dispose() {
    for (const s of this.flames) s.material.dispose();
    this.g.removeFromParent();
  }
}

// Chaleira (corpo, tampa, bico e alça).
export function kettle(parent, x, y, z, color = 0x8a2a24) {
  const g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.5 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1a1a1c, roughness: 0.5 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 12), m);
  body.scale.y = 0.8;
  body.position.y = 0.11;
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.04, 12), m);
  lid.position.y = 0.22;
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), dark);
  knob.position.y = 0.25;
  const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.03, 0.16, 8), m);
  spout.position.set(0.15, 0.15, 0);
  spout.rotation.z = -0.9;
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.012, 6, 16, Math.PI), dark);
  handle.position.y = 0.22;
  g.add(body, lid, knob, spout, handle);
  g.position.set(x, y, z);
  parent.add(g);
  g.userData.mats = [m, dark];
  g.userData.spout = new THREE.Vector3(x + 0.22, y + 0.24, z);
  return g;
}

// ------------------------------------------------------------ casa simples
// h: { x, z, w, d, rot (0 | ±π/2 | π: lado da porta = +z local), y, color, roof,
//      windows: true, lit: true, door: 'open' | 'none' }
// Devolve colisores e funções de apoio. Todas as casas: um cômodo só.
export function buildHouse(h, colliders, S) {
  const H = h.H || 2.7;
  const T = 0.16;
  h.cs = Math.cos(h.rot || 0);
  h.sn = Math.sin(h.rot || 0);
  const q = Math.abs(h.sn) > 0.5;
  h.hx = (q ? h.d : h.w) / 2;
  h.hz = (q ? h.w : h.d) / 2;
  h.floor = h.y + 0.25;
  h.T = T;
  h.toWorld = (lx, lz) => [h.x + lx * h.cs + lz * h.sn, h.z - lx * h.sn + lz * h.cs];
  h.inside = (x, z, m = 0) => Math.abs(x - h.x) < h.hx - T - m && Math.abs(z - h.z) < h.hz - T - m;
  const gw = new GeoBuilder();
  const gr = new GeoBuilder();
  const { w, d } = h;
  const col = h.color || [0.8, 0.78, 0.74];
  const wood = [0.32, 0.22, 0.2];
  const box = (gb, lx, y0, y1, lz, sx, sz, c, solid = true, us = 1.2) => {
    const [x, z] = h.toWorld(lx, lz);
    const sy = y1 - y0;
    gb.box(x, h.y + y0 + sy / 2, z, sx, sy, sz, c, null, { rot: h.rot || 0, uvScale: us, ao: 0.25 });
    if (solid) {
      const ax = (q ? sz : sx) / 2;
      const az = (q ? sx : sz) / 2;
      colliders.push([x - ax, x + ax, z - az, z + az]);
    }
  };
  h.box = box;
  const fy = 0.25;
  const top = fy + H;
  const wallX = (lz, holes) => {
    let a = -w / 2;
    for (const o of [...holes, [w / 2, w / 2, 0, 0]]) {
      if (o[0] > a) box(gw, (a + o[0]) / 2, fy, top, lz, o[0] - a, T, col);
      if (o[1] > o[0]) {
        if (o[2] > fy + 0.01) box(gw, (o[0] + o[1]) / 2, fy, o[2], lz, o[1] - o[0], T, col);
        box(gw, (o[0] + o[1]) / 2, o[3], top, lz, o[1] - o[0], T, col, false);
        box(gw, o[0] - 0.04, o[2], o[3], lz, 0.08, T + 0.04, wood, false);
        box(gw, o[1] + 0.04, o[2], o[3], lz, 0.08, T + 0.04, wood, false);
      }
      a = o[1];
    }
  };
  const wallZ = (lx, holes) => {
    let a = -d / 2 + T;
    for (const o of [...holes, [d / 2 - T, d / 2 - T, 0, 0]]) {
      if (o[0] > a) box(gw, lx, fy, top, (a + o[0]) / 2, T, o[0] - a, col);
      if (o[1] > o[0]) {
        box(gw, lx, fy, o[2], (o[0] + o[1]) / 2, T, o[1] - o[0], col);
        box(gw, lx, o[3], top, (o[0] + o[1]) / 2, T, o[1] - o[0], col, false);
        box(gw, lx, o[2] - 0.05, o[2], (o[0] + o[1]) / 2, T + 0.08, o[1] - o[0] + 0.1, wood, false);
      }
      a = o[1];
    }
  };
  const dw = 0.56;
  const dh = fy + 2.15;
  const win = h.windows === false ? [] : [[-0.6, 0.6, fy + 0.9, fy + 1.9]];
  wallX(d / 2 - T / 2, [[-dw, dw, fy, dh], ...(h.windows === false ? [] : [[w / 4 - 0.1, w / 4 + 0.9, fy + 0.9, fy + 1.9]])]);
  wallX(-d / 2 + T / 2, h.windows === false ? [] : [[-0.6, 0.6, fy + 0.9, fy + 1.9]]);
  wallZ(-w / 2 + T / 2, win);
  wallZ(w / 2 - T / 2, win);
  h.windowsLocal = h.windows === false ? [] : [
    [w / 4 + 0.4, d / 2 - T / 2, 'x'],
    [0, -d / 2 + T / 2, 'x'],
    [-w / 2 + T / 2, 0, 'z'],
    [w / 2 - T / 2, 0, 'z'],
  ];
  box(gw, 0, -0.8, fy, 0, w, d, h.floorColor || [0.45, 0.32, 0.26], false, 1);
  box(gw, 0, -0.25, 0.13, d / 2 + 0.35, 1.7, 0.7, [0.36, 0.27, 0.25], false);
  // teto plano por dentro
  box(gw, 0, top - 0.02, top, 0, w - 2 * T, d - 2 * T, [col[0] * 0.8, col[1] * 0.8, col[2] * 0.8], false);
  const ridge = 1.6;
  for (const lz of [d / 2 - T / 2, -d / 2 + T / 2]) {
    const n = lz > 0 ? 1 : -1;
    const p = (lx, y) => {
      const [x, z] = h.toWorld(lx, lz + n * (T / 2));
      return [x, h.y + y, z];
    };
    gw.quad([p(-w / 2, top), p(w / 2, top), p(0, top + ridge), p(0, top + ridge)], [h.sn * n, 0, h.cs * n], [0, 0, w / 1.2, 0, w / 2.4, ridge / 1.2, w / 2.4, ridge / 1.2], null, [col, col, col, col]);
  }
  const ov = 0.45;
  const rc = h.roof || [0.42, 0.26, 0.24];
  for (const s of [-1, 1]) {
    const P = (lx, y, lz) => {
      const [x, z] = h.toWorld(lx, lz);
      return [x, h.y + y, z];
    };
    const ex = s * (w / 2 + ov);
    const ey = top - (ov / (w / 2)) * ridge;
    const pts = s > 0 ? [P(ex, ey, d / 2 + ov), P(ex, ey, -d / 2 - ov), P(0, top + ridge + 0.08, -d / 2 - ov), P(0, top + ridge + 0.08, d / 2 + ov)] : [P(ex, ey, -d / 2 - ov), P(ex, ey, d / 2 + ov), P(0, top + ridge + 0.08, d / 2 + ov), P(0, top + ridge + 0.08, -d / 2 - ov)];
    const slope = Math.hypot(w / 2 + ov, ridge);
    const nl = [s * ridge, w / 2, 0];
    const L = Math.hypot(...nl);
    gr.quad(pts, [(nl[0] * h.cs) / L, nl[1] / L, (-nl[0] * h.sn) / L], [0, 0, (d + 2 * ov) / 2, 0, (d + 2 * ov) / 2, slope / 2, 0, slope / 2], null, [rc, rc, rc, rc]);
  }
  if (h.chimney !== false) box(gr, w / 4, top + 0.4, top + ridge + 0.9, -d / 6, 0.55, 0.55, [0.42, 0.32, 0.3], false);
  h.chimneyTop = (() => {
    const [x, z] = h.toWorld(w / 4, -d / 6);
    return new THREE.Vector3(x, h.y + top + ridge + 1.0, z);
  })();
  const [dx, dz] = h.toWorld(0, d / 2 + 0.9);
  h.front = { x: dx, z: dz };
  const pl = getTex('planks', S);
  const rf = getTex('roof', S);
  h.wallMat = new THREE.MeshStandardMaterial({ map: pl.map, normalMap: pl.normalMap, vertexColors: true, roughness: 0.9, side: THREE.DoubleSide });
  h.roofMat = new THREE.MeshStandardMaterial({ map: rf.map, vertexColors: true, roughness: 0.85, side: THREE.DoubleSide });
  h.mesh = new THREE.Mesh(gw.build(), h.wallMat);
  h.roofMesh = new THREE.Mesh(gr.build(), h.roofMat);
  // vidros acesos (amarelo quente) ou escuros
  h.glassMat = new THREE.MeshBasicMaterial({ color: h.lit ? new THREE.Color(1.8, 1.25, 0.6) : new THREE.Color(0.05, 0.06, 0.08), side: THREE.DoubleSide });
  h.glass = new THREE.Group();
  for (const [lx, lz, ax] of h.windowsLocal) {
    const [x, z] = h.toWorld(lx, lz);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(ax === 'x' ? (lx > 0.1 ? 1.0 : 1.2) : 1.2, 1.0), h.glassMat);
    m.position.set(x, h.y + fy + 1.4, z);
    m.rotation.y = (h.rot || 0) + (ax === 'z' ? Math.PI / 2 : 0);
    h.glass.add(m);
  }
  h.group = new THREE.Group();
  h.group.add(h.mesh, h.roofMesh, h.glass);
  h.dispose = () => {
    h.mesh.geometry.dispose();
    h.roofMesh.geometry.dispose();
    h.glass.traverse((o) => o.geometry && o.geometry.dispose());
    for (const m of [h.wallMat, h.roofMat, h.glassMat]) m.dispose();
  };
  return h;
}

// ------------------------------------------------------------ faixa de cena
export class CineBars {
  constructor(onSkip) {
    const bars = document.createElement('div');
    bars.id = 'cine';
    bars.innerHTML = '<div class="cb top"></div><div class="cb bot"><div id="cine-sub"></div><div id="cine-skip">tocar / E para pular</div></div>';
    document.body.appendChild(bars);
    this.el = bars;
    if (onSkip) {
      const skip = (e) => {
        e.preventDefault();
        onSkip();
      };
      bars.addEventListener('touchend', skip, { passive: false });
      bars.addEventListener('click', skip);
    }
  }

  sub(text) {
    const el = document.getElementById('cine-sub');
    if (el) el.textContent = text;
  }

  dispose() {
    if (this.el) this.el.remove();
    this.el = null;
  }
}

// Legendas por tempo: [[t, texto], ...]
export function subsAt(list, t, state) {
  let out = null;
  while (state.i < list.length && t >= list[state.i][0]) out = list[state.i++][1];
  return out;
}

// Placa/papel com texto escrito à mão.
export function letterTex(lines, { w = 256, h = 320, bg = '#f4ecd8', ink = '#3a2a4a', font = 'italic 26px Georgia, serif' } = {}) {
  const c = TEX.makeCanvas(w, h);
  const x = c.getContext('2d');
  x.fillStyle = bg;
  x.fillRect(0, 0, w, h);
  x.strokeStyle = 'rgba(120,100,140,0.18)';
  for (let y = 40; y < h; y += 28) {
    x.beginPath();
    x.moveTo(12, y);
    x.lineTo(w - 12, y);
    x.stroke();
  }
  x.fillStyle = ink;
  x.font = font;
  x.textAlign = 'center';
  lines.forEach((l, i) => x.fillText(l, w / 2, 70 + i * 40));
  return TEX.toTex(c, { repeat: false });
}
