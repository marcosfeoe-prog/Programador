// Subnível 0.1 — o recheio da Estação Zênite: janelas, móveis, máquinas, as
// bobinas de Tesla (com arcos animados), o hangar com a nave e o elevador, e o
// casco/estruturas externas vistos pelas janelas.
import * as THREE from 'three';
import { wallFrame, subtractSpan, glowMaterial, dynMaterial } from './level0_1_build.js';
import { zSign, zLogo, zScreen, holoTex, ControlScreen } from './level0_1_tex.js';
import { clamp, mulberry32, TAU } from '../util.js';

const yieldFrame = () => new Promise((r) => setTimeout(r, 0));
const rotY = (a, x, y, z) => new THREE.Matrix4().makeRotationY(a).setPosition(x, y, z);

// ------------------------------------------------------------ ajudantes
// Placa plana emissiva (sinalização, telas) — malha própria por textura.
function plate(L, tex, x, y, z, w, h, yaw, k = 0.35, extra = {}) {
  const m = glowMaterial(L.U, { map: tex, k, transparent: !!extra.transparent });
  if (extra.intensity) m.color.multiplyScalar(extra.intensity);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
  mesh.position.set(x, y, z);
  mesh.rotation.y = yaw;
  L.dynamic.add(mesh);
  (L.disposers = L.disposers || []).push(() => {
    m.dispose();
    if (tex) tex.dispose();
  });
  return mesh;
}

// Planta em vaso: caule e folhas em leque (quads cruzados).
function plant(B, M, x, z, s = 1, pot = true, seed = 1) {
  const r = mulberry32(seed);
  if (pot) {
    B.cyl(M.white, x, 0.3 * s, z, 0.32 * s, 0.6 * s, { r2: 0.38 * s, sides: 12 });
    B.cyl(M.soil, x, 0.6 * s + 0.005, z, 0.34 * s, 0.01, { sides: 12 });
  }
  const y0 = pot ? 0.6 * s : 0;
  const n = 9;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + r() * 0.5;
    const tilt = 0.5 + r() * 0.6;
    const len = (0.7 + r() * 0.5) * s;
    const w = 0.22 * s;
    const m = new THREE.Matrix4()
      .makeRotationY(a)
      .multiply(new THREE.Matrix4().makeRotationX(-tilt))
      .setPosition(x, y0, z);
    B.with(m, () => {
      B.rect(M.leaf, [-w / 2, 0, 0], [w, 0, 0], [0, len, 0], [0, 0, 1], [0, 0, 1, 1], false);
    });
  }
}

// Árvore ornamental do Átrio.
function tree(B, M, x, z, h, seed) {
  const r = mulberry32(seed);
  B.cyl(M.wood, x, h * 0.35, z, 0.12, h * 0.7, { r2: 0.08, sides: 8 });
  for (let i = 0; i < 6; i++) {
    const a = r() * TAU;
    const d = 0.3 + r() * 0.5;
    const g = new THREE.IcosahedronGeometry(0.55 + r() * 0.35, 1);
    B.geo(M.leaf, g, new THREE.Matrix4().makeScale(1, 0.75, 1).setPosition(x + Math.cos(a) * d, h * (0.72 + r() * 0.25), z + Math.sin(a) * d));
  }
}

// Banco com assento estofado (comprimento ao longo de `ax`).
function bench(B, M, L, x, z, len, ax = 'z', back = 0) {
  const sx = ax === 'x' ? len : 0.55;
  const sz = ax === 'z' ? len : 0.55;
  B.box(M.base, x, 0.2, z, sx * 0.9, 0.4, sz * 0.7);
  B.box(M.fabric, x, 0.45, z, sx, 0.1, sz);
  if (back) {
    const bx = ax === 'z' ? x + back * 0.25 : x;
    const bz = ax === 'x' ? z + back * 0.25 : z;
    B.box(M.fabric, bx, 0.78, bz, ax === 'z' ? 0.08 : len, 0.6, ax === 'x' ? 0.08 : len);
  }
  L.col(x - sx / 2, x + sx / 2, z - sz / 2, z + sz / 2);
}

function table(B, M, L, x, z) {
  B.cyl(M.white, x, 0.75, z, 0.75, 0.05, { sides: 20 });
  B.cyl(M.chrome, x, 0.37, z, 0.06, 0.74, { sides: 8 });
  B.cyl(M.base, x, 0.02, z, 0.35, 0.04, { sides: 16 });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + 0.6;
    const sx = x + Math.cos(a) * 1.05;
    const sz = z + Math.sin(a) * 1.05;
    B.cyl(M.chrome, sx, 0.23, sz, 0.035, 0.46, { sides: 6 });
    B.cyl(M.fabricRed, sx, 0.48, sz, 0.2, 0.06, { sides: 12 });
  }
  L.col(x - 1.0, x + 1.0, z - 1.0, z + 1.0);
}

function crate(B, M, L, x, z, s = 1.2, y = 0, wood = true, yaw = 0) {
  B.with(rotY(yaw, x, y + s / 2, z), () => {
    if (wood) {
      B.box(M.wood, 0, 0, 0, s, s, s);
      // ripas
      for (const sy of [-1, 1]) B.box(M.wood, 0, (sy * s) / 2.6, 0, s + 0.04, 0.1, s + 0.04, { skip: { py: true, ny: true } });
    } else {
      B.box(M.dark, 0, 0, 0, s * 1.6, s, s);
      B.box(M.hazard, 0, s * 0.3, 0, s * 1.6 + 0.02, 0.08, s + 0.02, { skip: { py: true, ny: true } });
    }
  });
  const hx = (wood ? s : s * 1.6) / 2 + 0.05;
  const hz = s / 2 + 0.05;
  if (y < 0.5) L.col(x - hx, x + hx, z - hz, z + hz);
}

function screenMesh(L, seed, hue, title, x, y, z, w, h, yaw, tilt = 0) {
  const m = plate(L, zScreen(seed, hue, title), x, y, z, w, h, yaw, 0.6, { intensity: 1.3 });
  m.rotation.x = tilt;
  m.rotation.order = 'YXZ';
  return m;
}

// Janelas: caixilhos, travessas e o vidro.
function windows(L, B, M, room) {
  for (const side of ['n', 's', 'w', 'e']) {
    const F = wallFrame(room, side);
    for (const o of (room.holes && room.holes[side]) || []) {
      if (o.kind === 'field') {
        const mid = F.p((o.a0 + o.a1) / 2, (o.y0 + o.y1) / 2);
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(o.a1 - o.a0, o.y1 - o.y0), L.fieldMat);
        mesh.position.set(mid[0] + F.out[0] * 0.1, mid[1], mid[2] + F.out[2] * 0.1);
        mesh.rotation.y = Math.atan2(F.n[0], F.n[2]);
        mesh.renderOrder = 4;
        L.dynamic.add(mesh);
        // emissores do campo em volta do vão
        const p0 = F.p(o.a0, o.y1);
        B.rect(M.blue, [p0[0] + F.n[0] * 0.02, o.y1 - 0.08, p0[2] + F.n[2] * 0.02], [F.U[0] * (o.a1 - o.a0), 0, F.U[2] * (o.a1 - o.a0)], [0, 0.06, 0], F.n, [0, 0, 1, 1], false);
        continue;
      }
      if (o.kind !== 'window') continue;
      const gp = F.p(o.a0, o.y0);
      const L2 = o.a1 - o.a0;
      L.addGlass(
        [gp[0] + F.out[0] * 0.18, gp[1], gp[2] + F.out[2] * 0.18],
        [F.U[0] * L2, 0, F.U[2] * L2],
        [0, o.y1 - o.y0, 0],
        F.n,
      );
      // montantes verticais
      if (o.mull) {
        const n = Math.round(L2 / o.mull);
        for (let i = 1; i < n; i++) {
          const a = o.a0 + (i * L2) / n;
          const p = F.p(a, (o.y0 + o.y1) / 2);
          const mw = 0.16;
          B.box(
            M.frame,
            p[0] + F.out[0] * 0.1,
            p[1],
            p[2] + F.out[2] * 0.1,
            F.U[0] ? mw : 0.2,
            o.y1 - o.y0,
            F.U[2] ? mw : 0.2,
            { skip: { py: true, ny: true } },
          );
        }
      }
      if (o.transom) {
        const p = F.p((o.a0 + o.a1) / 2, o.transom);
        B.box(M.frame, p[0] + F.out[0] * 0.1, p[1], p[2] + F.out[2] * 0.1, F.U[0] ? L2 : 0.2, 0.16, F.U[2] ? L2 : 0.2);
      }
    }
  }
}

// ------------------------------------------------------------ bobinas de Tesla
export class Coils {
  constructor(L) {
    this.L = L;
    this.list = [
      { x: -13, z: -80 },
      { x: 13, z: -80 },
      { x: 0, z: -96 },
    ].map((c, i) => ({ ...c, i, calm: false, px: c.x, pz: c.z + 4.3, flash: 0 }));
    // arcos: fitas viradas para a câmera
    this.segs = 12;
    this.arcsPer = L.Q.id === 'low' ? 3 : 5;
    const nArcs = this.list.length * this.arcsPer;
    const nv = nArcs * (this.segs + 1) * 2;
    this.pts = new Float32Array(nArcs * (this.segs + 1) * 3);
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(nv * 3);
    this.colA = new Float32Array(nv * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.colA, 3));
    const idx = [];
    for (let a = 0; a < nArcs; a++) {
      const b = a * (this.segs + 1) * 2;
      for (let s = 0; s < this.segs; s++) {
        const i = b + s * 2;
        idx.push(i, i + 1, i + 2, i + 1, i + 3, i + 2);
      }
    }
    geo.setIndex(idx);
    this.geo = geo;
    this.mat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
    L.dynamic.add(this.mesh);
    this.regenT = 0;
    // brilho no topo de cada bobina
    this.glowMats = [];
    for (const c of this.list) {
      const m = new THREE.MeshBasicMaterial({ color: 0xff7a40, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
      const t = new THREE.Mesh(new THREE.TorusGeometry(1.62, 0.1, 8, 40), m);
      t.rotation.x = Math.PI / 2;
      t.position.set(c.x, 8.2, c.z);
      L.dynamic.add(t);
      c.ring = t;
      this.glowMats.push(m);
      if (['high', 'ultra'].includes(L.Q.id)) {
        c.light = new THREE.PointLight(0xff8050, 30, 26, 1.6);
        c.light.position.set(c.x, 8.6, c.z);
        L.dynamic.add(c.light);
      }
    }
    this.camV = new THREE.Vector3();
  }

  build(B, M, L) {
    for (const c of this.list) {
      const { x, z } = c;
      B.setRoom(L.byId.F);
      B.cyl(M.dark, x, 0.2, z, 2.6, 0.4, { sides: 24 });
      B.cyl(M.hazard, x, 0.2, z, 2.62, 0.38, { sides: 24, caps: false, uvScale: 4 });
      B.cyl(M.frame, x, 0.5, z, 1.5, 0.2, { sides: 24 });
      B.cyl(M.copper, x, 1.25, z, 1.3, 1.3, { sides: 28, caps: false, uvScale: 1 });
      B.cyl(M.dark, x, 1.95, z, 1.35, 0.1, { sides: 28 });
      B.cyl(M.white, x, 4.8, z, 0.42, 6.2, { sides: 18 });
      B.cyl(M.copper, x, 4.8, z, 0.45, 5.6, { sides: 18, caps: false, uvScale: 3 });
      B.geo(M.chrome, new THREE.TorusGeometry(1.45, 0.45, 12, 36), new THREE.Matrix4().makeRotationX(Math.PI / 2).setPosition(x, 8.2, z));
      B.geo(M.chrome, new THREE.SphereGeometry(0.55, 16, 10), new THREE.Matrix4().makeTranslation(x, 8.55, z));
      // cerca
      const R = 3.3;
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * TAU;
        if (Math.abs(Math.sin(a) - 1) < 0.05) continue;
        B.cyl(M.frame, x + Math.cos(a) * R, 0.55, z + Math.sin(a) * R, 0.04, 1.1, { sides: 6, caps: false });
      }
      B.geo(M.hazard, new THREE.TorusGeometry(R, 0.04, 6, 48), new THREE.Matrix4().makeRotationX(Math.PI / 2).setPosition(x, 1.1, z));
      L.col(x - 3.4, x + 3.4, z - 3.4, z + 3.4);
      // painel de calibração
      B.with(rotY(0, x, 0, z + 3.85), () => {
        B.box(M.dark, 0, 0.55, 0, 1.1, 1.1, 0.5);
        B.box(M.frame, 0, 1.15, -0.05, 1.2, 0.1, 0.62);
        B.box(M.base, 0, 1.3, -0.12, 1.0, 0.35, 0.08);
      });
      L.col(x - 0.6, x + 0.6, z + 3.55, z + 4.15);
      c.screen = plate(L, zScreen(400 + c.i, 15, `BOBINA ${c.i + 1}`), x, 1.32, z + 3.85 - 0.075, 0.9, 0.3, 0, 0.2, { intensity: 1.4 });
      c.screen.rotation.x = -0.25;
      L.spots.push({
        x: c.px,
        z: c.pz,
        r: 1.7,
        label: () => (c.calm ? `Bobina ${c.i + 1}: em fase` : `Calibrar a bobina ${c.i + 1}`),
        action: () => this.panel(c),
      });
    }
  }

  panel(c) {
    const L = this.L;
    const g = L.game;
    if (c.calm) {
      g.hud.message(`Bobina ${c.i + 1}: 60,0 kHz. Estável.`, 2.5);
      return;
    }
    if (!g.objectiveDone('deliver')) {
      g.audio.play('beep', { gain: 0.3, rate: 0.5 });
      g.hud.message(
        g.objectiveDone('talk') ? 'O painel está apagado: faltam os fusíveis de plasma. A engenheira Vega precisa instalá-los.' : 'O painel está apagado. Melhor perguntar a alguém da estação.',
        4,
      );
      return;
    }
    const r = Math.random();
    const val = r < 0.5 ? 52 + Math.random() * 6.5 : 61.5 + Math.random() * 6.5;
    const high = val > 60;
    const fmt = val.toFixed(1).replace('.', ',');
    const who = { name: `Painel da bobina ${c.i + 1}`, role: 'Calibração de fase', portrait: '', voice: false };
    const zap = () => {
      c.flash = 1.2;
      g.audio.play('crackle', { gain: 0.6, rate: 1.4 });
      g.audio.play('scare', { gain: 0.2, rate: 1.6 });
      g.vibrate(160);
      g.addSanity(-8);
      g.damage = 0.6;
      L.say(who, 'ZZZT! Um arco estala no anel de cobre e passa raspando pelo seu braço. A fase piorou. (Alvo: 60,0 kHz)', [
        { text: 'Tentar de novo', fn: () => this.panel(c) },
        { text: 'Sair' },
      ]);
    };
    const ok = () => {
      L.say(who, 'O ponteiro desliza até 60,0 kHz e trava. O estalo dos arcos vira um zumbido grave e limpo. FASE TRAVADA.', [{ text: 'Ótimo.' }]);
      L.calibrate(c.i);
    };
    L.say(
      who,
      `Frequência de ressonância: ${fmt} kHz. Alvo: 60,0 kHz. O ponteiro treme e os arcos chicoteiam a cerca. Ajustar o capacitor:`,
      [
        { text: 'Aumentar a frequência', fn: () => (high ? zap() : ok()) },
        { text: 'Diminuir a frequência', fn: () => (high ? ok() : zap()) },
        { text: 'Deixar como está' },
      ],
    );
  }

  setCalm(i) {
    const c = this.list[i];
    c.calm = true;
    c.flash = 1.5;
    this.glowMats[i].color.setHex(0x6fc8ff);
    if (c.light) c.light.color.setHex(0x7fb8ff);
  }

  // Raio irregular entre dois pontos (deslocamento de ponto médio).
  bolt(o, ax, ay, az, bx, by, bz, jit) {
    const n = this.segs;
    const P = this.pts;
    P[o] = ax;
    P[o + 1] = ay;
    P[o + 2] = az;
    P[o + n * 3] = bx;
    P[o + n * 3 + 1] = by;
    P[o + n * 3 + 2] = bz;
    for (let i = 1; i < n; i++) {
      const t = i / n;
      const k = Math.sin(t * Math.PI) * jit;
      P[o + i * 3] = ax + (bx - ax) * t + (Math.random() - 0.5) * k;
      P[o + i * 3 + 1] = ay + (by - ay) * t + (Math.random() - 0.5) * k;
      P[o + i * 3 + 2] = az + (bz - az) * t + (Math.random() - 0.5) * k;
    }
  }

  update(dt, t, player) {
    const L = this.L;
    const cam = L.game.camera.position;
    this.regenT -= dt;
    const regen = this.regenT <= 0;
    if (regen) this.regenT = 0.05 + Math.random() * 0.04;
    const n = this.segs;
    let arc = 0;
    for (const c of this.list) {
      c.flash = Math.max(0, c.flash - dt);
      const near = Math.hypot(player.pos.x - c.x, player.pos.z - c.z) < 60;
      for (let k = 0; k < this.arcsPer; k++, arc++) {
        const o = arc * (n + 1) * 3;
        if (regen) {
          const a = Math.random() * TAU;
          const sx = c.x + Math.cos(a) * 1.5;
          const sz = c.z + Math.sin(a) * 1.5;
          if (c.calm) {
            const b = a + 0.6 + Math.random() * 1.2;
            const r = 1.5 + Math.random() * 0.7;
            this.bolt(o, sx, 8.4, sz, c.x + Math.cos(b) * r, 8.2 + (Math.random() - 0.3) * 1.2, c.z + Math.sin(b) * r, 0.5);
          } else {
            const b = a + (Math.random() - 0.5) * 1.4;
            const r = 2.5 + Math.random() * 3.2;
            const ty = Math.random() < 0.35 ? 1.1 : 3 + Math.random() * 6;
            this.bolt(o, sx, 8.3, sz, c.x + Math.cos(b) * r, ty, c.z + Math.sin(b) * r, 1.6);
          }
        }
        // fita virada para a câmera
        const on = near && (c.calm ? Math.random() < 0.85 : Math.random() < 0.7) ? 1 : 0;
        const col = c.calm ? [0.5, 0.75, 1.6] : [1.6, 0.6, 0.9];
        const wdt = c.calm ? 0.045 : 0.07;
        const vb = arc * (n + 1) * 2;
        for (let i = 0; i <= n; i++) {
          const p = o + i * 3;
          const q = o + Math.min(i + 1, n) * 3;
          const pr = o + Math.max(i - 1, 0) * 3;
          const tx = this.pts[q] - this.pts[pr];
          const ty = this.pts[q + 1] - this.pts[pr + 1];
          const tz = this.pts[q + 2] - this.pts[pr + 2];
          const vx = cam.x - this.pts[p];
          const vy = cam.y - this.pts[p + 1];
          const vz = cam.z - this.pts[p + 2];
          let sx = ty * vz - tz * vy;
          let sy = tz * vx - tx * vz;
          let sz = tx * vy - ty * vx;
          const sl = Math.hypot(sx, sy, sz) || 1;
          const w = wdt * (1 - Math.abs(i / n - 0.4) * 0.6) * on;
          sx = (sx / sl) * w;
          sy = (sy / sl) * w;
          sz = (sz / sl) * w;
          const v = (vb + i * 2) * 3;
          this.pos[v] = this.pts[p] + sx;
          this.pos[v + 1] = this.pts[p + 1] + sy;
          this.pos[v + 2] = this.pts[p + 2] + sz;
          this.pos[v + 3] = this.pts[p] - sx;
          this.pos[v + 4] = this.pts[p + 1] - sy;
          this.pos[v + 5] = this.pts[p + 2] - sz;
          for (let j = 0; j < 6; j++) this.colA[v + j] = col[j % 3] * (1 + c.flash);
        }
      }
      // brilho do anel e luz
      const fl = c.calm ? 0.85 + Math.sin(t * 9 + c.i) * 0.05 : 0.5 + Math.random() * 0.6;
      c.ring.material.opacity = clamp(fl + c.flash * 0.5, 0, 1);
      if (c.light) c.light.intensity = (c.calm ? 26 : 10 + Math.random() * 40) * (1 + c.flash);
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
  }

  dispose() {
    this.geo.dispose();
    this.mat.dispose();
    for (const m of this.glowMats) m.dispose();
  }
}

// ------------------------------------------------------------ itens
function fuseItem(L, idx, x, y, z) {
  const key = `z:fuse:${idx}`;
  if (L.taken.has(key)) return;
  (L.fuseSpots = L.fuseSpots || []).push({ key, x, z });
  L.game.items.spawn(
    {
      type: 'fuse',
      key,
      x,
      z,
      y,
      label: 'Pegar o fusível de plasma',
      makeMesh: (it) => {
        const g = new THREE.Group();
        const amb = { value: new THREE.Vector3(0.3, 0.3, 0.3) };
        const metal = dynMaterial(L.Q, { color: 0xb8c0c8, roughness: 0.3, metalness: 0.9 }, amb);
        const core = new THREE.MeshBasicMaterial({ color: 0x66e0ff });
        core.color.multiplyScalar(2.2);
        const glass = new THREE.MeshBasicMaterial({ color: 0x88ddff, transparent: true, opacity: 0.25, depthWrite: false });
        const c1 = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.05, 12), metal);
        c1.position.y = 0.025;
        const c2 = c1.clone();
        c2.position.y = 0.275;
        const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.2, 12, 1, true), glass);
        tube.position.y = 0.15;
        const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.2, 8), core);
        rod.position.y = 0.15;
        g.add(c1, c2, tube, rod);
        g.position.set(it.x, it.y || 0, it.z);
        g.rotation.z = it.lay ? Math.PI / 2 : 0;
        amb.value.copy(L.ambientAt(it.x, (it.y || 0) + 0.2, it.z));
        L.dynamic.add(g);
        (L.disposers = L.disposers || []).push(() => {
          metal.dispose();
          core.dispose();
          glass.dispose();
        });
        return g;
      },
      onUse: (g, it) => L.pickFuse(it),
    },
    L.dynamic,
  );
}

function note(L, i, x, y, z, rot) {
  const key = `z:note:${i}`;
  if (L.taken.has(key)) return;
  L.game.items.spawn({ type: 'note', key, x, z, y, rot, light: 1.0 }, L.dynamic);
}

// ------------------------------------------------------------ salas
export async function buildProps(L, B) {
  const M = L.M;
  const R = L.byId;
  for (const r of L.rooms) {
    B.setRoom(r);
    windows(L, B, M, r);
  }
  corridor(L, B, M, R.A);
  await yieldFrame();
  atrium(L, B, M, R.B);
  await yieldFrame();
  mirante(L, B, M, R.C);
  await yieldFrame();
  refeitorio(L, B, M, R.D);
  await yieldFrame();
  bridge(L, B, M, R.E);
  generators(L, B, M, R.F);
  await yieldFrame();
  control(L, B, M, R.G);
  await yieldFrame();
  hangar(L, B, M, R.H);
}

// Costelas estruturais nas paredes e vigas no teto.
function ribs(B, M, room, axis, from, to, step, w = 0.3, d = 0.18, beam = true) {
  for (let a = from; a <= to + 1e-3; a += step) {
    if (axis === 'z') {
      for (const [x, s] of [
        [room.x0, 1],
        [room.x1, -1],
      ]) {
        let blocked = false;
        for (const o of room.holes[s > 0 ? 'w' : 'e'] || []) if (a > o.a0 - w && a < o.a1 + w) blocked = true;
        if (!blocked) B.box(M.frame, x + (s * d) / 2, room.h / 2, a, d, room.h, w, { skip: { py: true, ny: true } });
      }
      if (beam) B.box(M.frame, (room.x0 + room.x1) / 2, room.h - 0.12, a, room.x1 - room.x0, 0.24, w, { skip: { py: true } });
    } else {
      for (const [z, s] of [
        [room.z0, 1],
        [room.z1, -1],
      ]) {
        let blocked = false;
        for (const o of room.holes[s > 0 ? 'n' : 's'] || []) if (a > o.a0 - w && a < o.a1 + w) blocked = true;
        if (!blocked) B.box(M.frame, a, room.h / 2, z + (s * d) / 2, w, room.h, d, { skip: { py: true, ny: true } });
      }
      if (beam) B.box(M.frame, a, room.h - 0.12, (room.z0 + room.z1) / 2, w, 0.24, room.z1 - room.z0, { skip: { py: true } });
    }
  }
}

// Luminárias de teto (lente emissiva) nos pontos das luzes da sala.
function fixtures(B, M, room, w = 1.2, d = 0.4, mat) {
  for (const l of room.lights) {
    if (l.ch || !l.dir || l.dir[1] !== -1) continue;
    B.box(M.frame, l.x, l.y + 0.02, l.z, w + 0.12, 0.05, d + 0.12, { skip: { py: true } });
    B.rect(mat || M.lamp, [l.x - w / 2, l.y - 0.01, l.z - d / 2], [w, 0, 0], [0, 0, d], [0, -1, 0], [0, 0, 1, 1], false);
  }
}

function corridor(L, B, M, r) {
  B.setRoom(r);
  ribs(B, M, r, 'z', 2.5, 22.5, 4, 0.3, 0.16);
  fixtures(B, M, r, 1.6, 0.5);
  // faixas-guia azuis no rodapé
  for (const x of [-2.86, 2.86]) B.rect(M.blue, [x, 0.14, 1], [0, 0, 22.4], [0, 0.03, 0], [x < 0 ? 1 : -1, 0, 0], [0, 0, 1, 1], false);
  // O fim do corredor: um pedaço do Saguão grudado na parede
  B.rect(M.paperW, [-1.6, 0, 23.985], [3.2, 0, 0], [0, 3.2, 0], [0, 0, -1], 'world', false);
  B.rect(M.paperC, [-1.6, 0.004, 21.9], [3.2, 0, 0], [0, 0, 2.1], [0, 1, 0], 'world', false);
  // a porta de madeira (deste lado ela não abre)
  const wood = M.wood;
  B.box(wood, 0, 1.04, 23.95, 0.96, 2.08, 0.05);
  B.box(M.base, -0.52, 1.08, 23.93, 0.08, 2.16, 0.1);
  B.box(M.base, 0.52, 1.08, 23.93, 0.08, 2.16, 0.1);
  B.box(M.base, 0, 2.16, 23.93, 1.12, 0.08, 0.1);
  B.geo(M.chrome, new THREE.SphereGeometry(0.035, 10, 8), new THREE.Matrix4().makeTranslation(0.36, 1.0, 23.88));
  B.rect(M.lampWarm, [-0.46, 0.003, 23.88], [0.92, 0, 0], [0, 0, 0.06], [0, 1, 0], [0, 0, 1, 1], false);
  L.spots.push({
    x: 0,
    z: 23.2,
    r: 1.6,
    label: 'Abrir a porta de madeira',
    action: () => {
      const g = L.game;
      g.audio.play('creak', { gain: 0.4 });
      L.say({ name: 'A porta de madeira', role: '', portrait: '', voice: false }, 'A maçaneta gira. Do outro lado, o zumbido das lâmpadas fluorescentes e um cheiro de carpete úmido. Voltar para o Saguão?', [
        { text: 'Voltar ao Nível 0', fn: () => g.enterLevel('0', 'door', 0.4) },
        { text: 'Ficar na estação' },
      ]);
    },
  });
  // boas-vindas
  plate(L, zSign('ESTAÇÃO ZÊNITE', 'Bem-vindo. Você está seguro aqui.', '#7cc8ff'), -2.97, 2.1, 12.5, 2.4, 0.6, Math.PI / 2, 0.3);
  plate(L, zSign('ÁTRIO', 'Mirante · Refeitório · Geradores', '#7cc8ff', 1), 0, 2.95, 0.43, 1.8, 0.45, 0, 0.3).rotation.y = Math.PI;
  note(L, 0, 2.3, 0.02, 4, 0.4);
}

function atrium(L, B, M, r) {
  B.setRoom(r);
  // balcão anelar (laje) e guarda-corpo de vidro
  const by = 4.6;
  const slabs = [
    [-15, 15, -30, -28],
    [-15, 15, -2, 0],
    [-15, -13, -28, -2],
    [13, 15, -28, -2],
  ];
  for (const [x0, x1, z0, z1] of slabs) B.box(M.white, (x0 + x1) / 2, by + 0.15, (z0 + z1) / 2, x1 - x0, 0.3, z1 - z0, { fine: true });
  const edge = [
    [-13, 13, -28, -28],
    [-13, 13, -2, -2],
    [-13, -13, -28, -2],
    [13, 13, -28, -2],
  ];
  for (const [x0, x1, z0, z1] of edge) {
    const len = Math.max(x1 - x0, z1 - z0);
    const alongX = x1 !== x0;
    L.addGlass([x0, by + 0.3, z0], alongX ? [len, 0, 0] : [0, 0, len], [0, 1.0, 0], alongX ? [0, 0, 1] : [1, 0, 0]);
    B.box(M.chrome, (x0 + x1) / 2, by + 1.33, (z0 + z1) / 2, alongX ? len : 0.08, 0.06, alongX ? 0.08 : len);
  }
  // luzes embutidas sob o balcão
  for (const l of r.lights) if (l.dir && l.y < 5) B.cyl(M.lampWarm, l.x, by - 0.01, l.z, 0.22, 0.02, { sides: 12 });
  fixtures(B, M, { lights: r.lights.filter((l) => l.y > 8) }, 1.6, 1.6);
  // claraboia: caixilhos e vidro
  for (let x = -5; x <= 5; x += 2.5) B.box(M.frame, x, 9.6, -15, 0.14, 0.14, 10);
  for (let z = -20; z <= -10; z += 5) B.box(M.frame, 0, 9.6, z, 10, 0.14, 0.14);
  L.addGlass([-5, 9.7, -20], [10, 0, 0], [0, 0, 10], [0, -1, 0]);
  // holograma central
  B.cyl(M.dark, 0, 0.25, -15, 1.8, 0.5, { sides: 32 });
  B.cyl(M.white, 0, 0.75, -15, 1.4, 0.5, { sides: 32 });
  B.cyl(M.cyan, 0, 1.01, -15, 1.25, 0.02, { sides: 32 });
  L.col(-1.9, 1.9, -16.9, -13.1);
  const holo = new THREE.Mesh(
    new THREE.SphereGeometry(1.5, 32, 16),
    new THREE.MeshBasicMaterial({ map: holoTex(), color: 0x66d8ff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }),
  );
  holo.position.set(0, 3.2, -15);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(2.3, 0.03, 6, 64),
    new THREE.MeshBasicMaterial({ color: 0x66d8ff, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }),
  );
  ring.position.copy(holo.position);
  ring.rotation.x = Math.PI / 2 - 0.3;
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(1.25, 1.5, 2.2, 32, 1, true),
    new THREE.MeshBasicMaterial({ color: 0x3fb6ff, transparent: true, opacity: 0.08, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }),
  );
  beam.position.set(0, 2.1, -15);
  holo.renderOrder = ring.renderOrder = beam.renderOrder = 5;
  L.dynamic.add(holo, ring, beam);
  (L.animate = L.animate || []).push((dt, t) => {
    holo.rotation.y += dt * 0.25;
    ring.rotation.z += dt * 0.4;
    holo.material.opacity = 0.45 + Math.sin(t * 2.1) * 0.05 + (Math.random() < 0.02 ? 0.3 : 0);
  });
  (L.disposers = L.disposers || []).push(() => {
    holo.material.map.dispose();
    for (const m of [holo, ring, beam]) m.material.dispose();
  });
  // jardineiras com árvores e bancos
  let seed = 10;
  for (const x of [-9, 9])
    for (const z of [-7, -23]) {
      B.box(M.white, x, 0.35, z, 3.2, 0.7, 3.2);
      B.rect(M.soil, [x - 1.5, 0.71, z - 1.5], [3, 0, 0], [0, 0, 3], [0, 1, 0], 'world', false);
      tree(B, M, x, z, 3.8, seed++);
      plant(B, M, x + 1.0, z + 1.0, 0.7, false, seed++);
      plant(B, M, x - 1.0, z - 0.9, 0.6, false, seed++);
      L.col(x - 1.65, x + 1.65, z - 1.65, z + 1.65);
    }
  bench(B, M, L, -9, -15, 3.2, 'z', -1);
  bench(B, M, L, 9, -15, 3.2, 'z', 1);
  bench(B, M, L, 0, -3.6, 3, 'x', 0);
  // totens de informação
  for (const x of [-4.5, 4.5]) {
    B.box(M.white, x, 0.9, -3, 0.6, 1.8, 0.25);
    screenMesh(L, 300 + x, 200, 'MAPA DA ESTAÇÃO', x, 1.3, -3.13, 0.5, 0.8, Math.PI);
    L.col(x - 0.35, x + 0.35, -3.2, -2.8);
  }
  // logotipo e placas
  plate(L, zLogo(), 0, 6.6, -29.98, 9, 2.25, 0, 0.25, { transparent: true, intensity: 1.4 });
  plate(L, zSign('GERADORES', 'Passarela · Hangar · Controle', '#ffb347'), 3.9, 2.6, -29.97, 2.2, 0.55, 0, 0.3);
  plate(L, zSign('MIRANTE', 'Observação', '#7cc8ff', -1), -14.97, 2.6, -21.2, 2.2, 0.55, Math.PI / 2, 0.3);
  plate(L, zSign('REFEITÓRIO', 'Alojamentos', '#9fd36b', 1), 14.97, 2.6, -21.2, 2.2, 0.55, -Math.PI / 2, 0.3);
  // colunas de luz nas paredes
  for (const z of [-25, -5]) {
    for (const [x, s] of [
      [-15, 1],
      [15, -1],
    ])
      B.rect(M.blue, [x + s * 0.02, 0.4, z - 0.05], [0, 0, 0.1], [0, 3.9, 0], [s, 0, 0], [0, 0, 1, 1], false);
  }
  note(L, 1, 9.2, 0.51, -14.6, 1.2);
}

function mirante(L, B, M, r) {
  B.setRoom(r);
  fixtures(B, M, r, 0.6, 0.6, M.lampWarm);
  // guarda-corpo diante da janela
  for (let z = -28; z <= -2 + 1e-3; z += 1.625) B.cyl(M.chrome, -44.3, 0.5, z, 0.035, 1.0, { sides: 8 });
  B.cyl(M.chrome, -44.3, 1.02, -15, 0.05, 26, { sides: 10, axis: 'z' });
  L.col(-45.2, -44.15, -30, 0);
  // fileiras de bancos olhando para a janela
  for (const x of [-38.5, -32.5, -26.5]) {
    bench(B, M, L, x, -20, 5, 'z', 1);
    bench(B, M, L, x, -10, 5, 'z', 1);
  }
  // telescópio
  const tx = -42.3;
  const tz = -6.6;
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU + 0.4;
    const m = new THREE.Matrix4()
      .makeTranslation(tx + Math.cos(a) * 0.35, 0.62, tz + Math.sin(a) * 0.35)
      .multiply(new THREE.Matrix4().makeRotationAxis(new THREE.Vector3(-Math.sin(a), 0, Math.cos(a)), -0.32));
    B.geo(M.frame, new THREE.CylinderGeometry(0.025, 0.03, 1.3, 6), m);
  }
  B.box(M.dark, tx, 1.3, tz, 0.22, 0.2, 0.22);
  const tube = new THREE.Matrix4()
    .makeTranslation(tx - 0.2, 1.62, tz)
    .multiply(new THREE.Matrix4().makeRotationY(Math.PI / 2 + 0.25))
    .multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2 - 0.42));
  B.geo(M.white, new THREE.CylinderGeometry(0.16, 0.13, 1.5, 16), tube);
  B.geo(M.dark, new THREE.CylinderGeometry(0.17, 0.17, 0.12, 16), tube.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0.72, 0)));
  B.geo(M.dark, new THREE.CylinderGeometry(0.03, 0.03, 0.18, 8), tube.clone().multiply(new THREE.Matrix4().makeTranslation(0, -0.8, 0)));
  L.col(tx - 0.5, tx + 0.5, tz - 0.5, tz + 0.5);
  L.spots.push({
    x: tx + 0.6,
    z: tz,
    r: 1.5,
    label: 'Olhar pelo telescópio',
    action: () => {
      const g = L.game;
      g.audio.click();
      g.hud.message(
        'Pela ocular: Tétis Rubra, enorme. Perto do equador, um retângulo amarelo-pálido do tamanho de uma cidade. Ele pisca como uma lâmpada fluorescente com defeito.',
        6,
      );
      g.addSanity(-3);
    },
  });
  // caixa de manutenção (fusível 1)
  B.box(M.dark, -43.4, 0.25, -4.4, 0.7, 0.5, 0.45);
  B.with(new THREE.Matrix4().makeTranslation(-43.4, 0.5, -4.62).multiply(new THREE.Matrix4().makeRotationX(-1.2)), () => B.box(M.hazard, 0, 0.0, 0.22, 0.7, 0.03, 0.45));
  L.col(-43.8, -43.0, -4.65, -4.15);
  fuseItem(L, 0, -43.4, 0.5, -4.35);
  // vasos e luminárias de chão
  plant(B, M, -16.5, -28.5, 1.4, true, 31);
  plant(B, M, -16.5, -1.5, 1.4, true, 32);
  plant(B, M, -43.5, -29, 1.2, true, 33);
  plant(B, M, -43.5, -1, 1.2, true, 34);
  for (const [x, z] of [
    [-16.5, -28.5],
    [-16.5, -1.5],
    [-43.5, -29],
    [-43.5, -1],
  ])
    L.col(x - 0.45, x + 0.45, z - 0.45, z + 0.45);
  plate(L, zSign('MIRANTE', 'Orfeu · a estrela · o vazio', '#d9c9ff'), -15.43, 2.6, -21, 2.2, 0.55, -Math.PI / 2, 0.3);
  note(L, 2, -32.5, 0.51, -9.3, 2.3);
}

function refeitorio(L, B, M, r) {
  B.setRoom(r);
  fixtures(B, M, r, 1.2, 0.6);
  // balcão e cozinha
  B.box(M.base, 27, 0.48, -27.7, 14, 0.96, 0.9);
  B.box(M.white, 27, 1.0, -27.7, 14.2, 0.08, 1.05);
  L.col(19.9, 34.1, -28.25, -27.15);
  B.box(M.dark, 27, 0.45, -29.65, 19, 0.9, 0.7);
  B.box(M.chrome, 27, 0.92, -29.65, 19, 0.04, 0.72);
  L.col(17.5, 36.5, -30, -29.25);
  // geladeira, fogão, prateleiras, cafeteira
  B.box(M.white, 18.3, 1.05, -29.55, 1.0, 2.1, 0.8);
  B.box(M.chrome, 18.7, 1.2, -29.13, 0.04, 0.6, 0.04);
  B.box(M.base, 24, 0.95, -29.65, 1.4, 0.05, 0.6);
  for (const [x, z] of [
    [23.7, -29.8],
    [24.3, -29.8],
    [23.7, -29.5],
    [24.3, -29.5],
  ])
    B.cyl(M.dark, x, 0.99, z, 0.12, 0.03, { sides: 10 });
  B.cyl(M.chrome, 23.75, 1.08, -29.55, 0.14, 0.18, { sides: 12 });
  for (const y of [1.6, 2.1, 2.6]) {
    B.box(M.frame, 30, y, -29.82, 6, 0.04, 0.35);
    const rr = mulberry32(y * 100);
    for (let i = 0; i < 14; i++) {
      const x = 27.3 + i * 0.4 + rr() * 0.1;
      const h = 0.15 + rr() * 0.18;
      B.cyl(rr() < 0.5 ? M.white : M.fabricRed, x, y + 0.02 + h / 2, -29.82 + (rr() - 0.5) * 0.12, 0.06 + rr() * 0.04, h, { sides: 8 });
    }
  }
  B.box(M.dark, 34.5, 1.15, -29.6, 0.5, 0.5, 0.45);
  B.cyl(M.white, 34.4, 0.97, -29.4, 0.05, 0.1, { sides: 8 });
  plate(L, zSign('REFEITÓRIO', 'Sopa de algas · sempre quente', '#9fd36b'), 27, 3.4, -29.98, 3, 0.75, 0, 0.3);
  // mesas
  for (const x of [22, 28, 34]) for (const z of [-20.5, -12.5]) table(B, M, L, x, z);
  // beliches nos alojamentos
  for (const x of [21, 25.5, 30, 34.5]) {
    const z = -0.5;
    for (const [dx, dz] of [
      [-1.05, -0.45],
      [1.05, -0.45],
      [-1.05, 0.42],
      [1.05, 0.42],
    ])
      B.box(M.base, x + dx, 1.1, z + dz, 0.07, 2.2, 0.07);
    for (const y of [0.42, 1.72]) {
      B.box(M.frame, x, y - 0.05, z, 2.2, 0.08, 0.95);
      B.box(M.fabric, x, y + 0.06, z, 2.05, 0.16, 0.86);
      B.box(M.linen, x - 0.8, y + 0.2, z + 0.05, 0.35, 0.1, 0.6);
    }
    // cortina
    B.rect(M.fabricRed, [x - 1.1, 0.95, z - 0.5], [0.9, 0, 0], [0, 1.6, 0], [0, 0, -1], [0, 0, 1, 1], false);
    for (let k = 0; k < 6; k++) B.box(M.frame, x + 1.15, 0.3 + k * 0.3, z - 0.45, 0.04, 0.03, 0.04);
    L.col(x - 1.15, x + 1.15, -1.0, 0);
  }
  fuseItem(L, 1, 35.0, 1.82, -0.55);
  plate(L, zSign('ALOJAMENTOS', 'Silêncio, por favor', '#9fd36b'), 27.5, 2.9, -0.02, 2.4, 0.6, Math.PI, 0.3);
  // bebedouro
  B.box(M.white, 16.0, 0.6, -24.5, 0.5, 1.2, 0.5);
  B.cyl(M.cyan, 16.0, 1.38, -24.5, 0.17, 0.36, { sides: 12 });
  L.col(15.7, 16.3, -24.8, -24.2);
  L.game.items.spawn({ type: 'cooler', noMesh: true, key: 'z:cooler', x: 16.3, z: -24.5 }, L.dynamic);
  plant(B, M, 16.3, -1.2, 1.1, true, 41);
  plant(B, M, 39.3, -28.8, 1.1, true, 42);
  L.col(15.8, 16.8, -1.7, -0.7);
  L.col(38.8, 39.8, -29.3, -28.3);
  L.game.items.spawn({ type: 'water', key: 'z:water:0', x: 21.7, z: -20.2, y: 0.78, light: 1.1 }, L.dynamic);
}

function bridge(L, B, M, r) {
  B.setRoom(r);
  fixtures(B, M, r, 0.8, 0.3);
  for (const x of [-2.3, 2.3]) B.rect(M.blue, [x - 0.03, 0.005, -54.8], [0.06, 0, 0], [0, 0, 24.2], [0, 1, 0], [0, 0, 1, 1], false);
  for (const x of [-2.75, 2.75]) {
    B.cyl(M.chrome, x, 1.0, -42.7, 0.04, 24, { sides: 8, axis: 'z' });
    for (let z = -54; z <= -31.5; z += 2.34) B.box(M.frame, x + Math.sign(x) * 0.12, 0.95, z, 0.24, 0.05, 0.05);
  }
  plate(L, zSign('SALA DOS GERADORES', 'Alta tensão · use os painéis', '#ffb347'), 0, 3.25, -54.97, 2.4, 0.6, 0, 0.3);
}

function generators(L, B, M, r) {
  B.setRoom(r);
  fixtures(B, M, r, 2.4, 2.4);
  ribs(B, M, r, 'z', -104, -60, 6.6, 0.6, 0.4, false);
  // vigas da ponte rolante
  for (const z of [-70, -95]) B.box(M.hazard, 0, 14.4, z, 60, 0.9, 0.7);
  B.box(M.dark, 0, 13.7, -82.5, 3, 0.6, 26);
  // turbinas
  for (const s of [-1, 1]) {
    const x = s * 23;
    B.cyl(M.white, x, 3.1, -82, 2.6, 34, { sides: 32, axis: 'z' });
    for (let z = -97; z <= -67; z += 4) B.cyl(M.dark, x, 3.1, z, 2.7, 0.5, { sides: 32, axis: 'z' });
    B.cyl(M.chrome, x, 3.1, -64.7, 1.6, 0.7, { sides: 24, axis: 'z' });
    B.cyl(M.chrome, x, 3.1, -99.3, 1.6, 0.7, { sides: 24, axis: 'z' });
    for (const z of [-94, -82, -70]) B.box(M.dark, x, 0.45, z, 4.4, 0.9, 1.4);
    // janelinhas de inspeção acesas
    for (let z = -95; z <= -69; z += 4) B.box(M.cyan, x - s * 2.45, 3.6, z + 2, 0.06, 0.5, 0.9);
    L.col(x - 2.8, x + 2.8, -99.8, -64.2);
    // tubulação até as bobinas
    B.cyl(M.copper, (x + s * -13) / 2 + s * 0.5, 0.45, -80, 0.32, Math.abs(x) - 13 - 3.2, { sides: 12, axis: 'x', uvScale: 0.2 });
    // canos verticais na parede
    for (let z = -104; z <= -62; z += 6.6) B.cyl(M.chrome, s * 29.6, 8, z + 3.3, 0.18, 16, { sides: 10 });
  }
  B.cyl(M.copper, 0, 0.45, -88, 0.32, 13, { sides: 12, axis: 'z', uvScale: 0.2 });
  // passarela elevada diante da janela norte
  B.box(M.grate, 0, 7, -107.6, 50, 0.2, 2.6);
  for (let x = -24; x <= 24; x += 3) {
    B.cyl(M.chrome, x, 7.55, -106.35, 0.03, 1.1, { sides: 6, caps: false });
  }
  B.cyl(M.chrome, 0, 8.1, -106.35, 0.04, 50, { sides: 8, axis: 'x' });
  for (const x of [-24, -12, 0, 12, 24]) {
    B.box(M.dark, x, 3.45, -107.6, 0.35, 6.9, 0.35);
    L.col(x - 0.25, x + 0.25, -107.85, -107.35);
  }
  // marcações de piso: zonas de segurança
  for (const x of [-26, 26]) B.rect(M.hazard, [x - 0.15, 0.004, -100], [0.3, 0, 0], [0, 0, 36], [0, 1, 0], 'world', false);
  // console da engenheira
  B.box(M.dark, -4.6, 0.5, -64.5, 3.4, 1.0, 0.9);
  B.box(M.frame, -4.6, 1.04, -64.5, 3.5, 0.08, 1.0);
  L.col(-6.4, -2.8, -65, -64);
  screenMesh(L, 501, 30, 'FASE B1-B3', -5.6, 1.45, -64.75, 0.9, 0.55, 0, -0.2);
  screenMesh(L, 502, 190, 'CARGA', -3.6, 1.45, -64.75, 0.9, 0.55, 0, -0.2);
  // giroflex de emergência
  const beacons = [];
  for (const [x, z, yaw] of [
    [-29.7, -70, Math.PI / 2],
    [29.7, -70, -Math.PI / 2],
    [0, -55.7, Math.PI],
  ]) {
    B.cyl(M.dark, x, 4.0, z, 0.12, 0.2, { sides: 10 });
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 12, 8),
      new THREE.MeshBasicMaterial({ color: 0xff2a1a, fog: false }),
    );
    m.material.color.multiplyScalar(3);
    m.position.set(x, 4.2, z);
    m.rotation.y = yaw;
    L.dynamic.add(m);
    beacons.push(m);
  }
  L.animate = L.animate || [];
  L.animate.push((dt, t) => {
    for (const b of beacons) b.visible = !L.fullPower && Math.sin(t * 6) > 0;
  });
  L.disposers.push(() => beacons.forEach((b) => b.material.dispose()));
  L.coils.build(B, M, L);
  plate(L, zSign('HANGAR', 'Elevador de serviço', '#ffb347', -1), -29.97, 5.3, -70, 2.4, 0.6, Math.PI / 2, 0.3);
  plate(L, zSign('CONTROLE', 'Rede principal', '#7cc8ff', 1), 29.97, 3.6, -70, 2.4, 0.6, -Math.PI / 2, 0.3);
  note(L, 3, -2.8, 1.09, -64.4, 0.2);
}

function control(L, B, M, r) {
  B.setRoom(r);
  fixtures(B, M, r, 1.2, 0.6);
  // tela principal
  L.ctrlScreen = new ControlScreen();
  const scr = plate(L, L.ctrlScreen.tex, 39, 2.2, -79.85, 6, 3, 0, 0.15, { intensity: 1.2 });
  B.box(M.dark, 39, 2.2, -79.9, 6.3, 3.3, 0.06);
  let acc = 0;
  L.animate.push((dt, t) => {
    acc += dt;
    if (acc > 0.25) {
      acc = 0;
      L.ctrlScreen.draw(L.power, L.st.coils, t);
    }
  });
  void scr;
  // mesas de console em arco
  for (const [x, yaw] of [
    [34.5, 0.35],
    [39, 0],
    [43.5, -0.35],
  ]) {
    B.with(rotY(yaw, x, 0, -77.4), () => {
      B.box(M.dark, 0, 0.45, 0, 4.2, 0.9, 1.0);
      B.box(M.frame, 0, 0.93, 0.05, 4.3, 0.06, 1.15);
      B.box(M.base, 0, 1.25, -0.35, 4.0, 0.55, 0.12);
    });
    for (let k = -1; k <= 1; k++) {
      const sx = x + Math.cos(yaw) * k * 1.3;
      const sz = -77.4 - Math.sin(yaw) * k * 1.3 - 0.29;
      screenMesh(L, 600 + x * 3 + k, 160 + k * 40, ['REDE', 'FASE', 'CARGA'][k + 1], sx, 1.27, sz, 1.1, 0.45, yaw, -0.1);
    }
    L.col(x - 2.3, x + 2.3, -78.1, -76.8);
  }
  // cadeiras
  for (const x of [34.5, 39, 43.5]) {
    const z = -75.4;
    B.cyl(M.base, x, 0.22, z, 0.05, 0.44, { sides: 8 });
    B.cyl(M.dark, x, 0.03, z, 0.32, 0.05, { sides: 10 });
    B.box(M.fabric, x, 0.47, z, 0.55, 0.1, 0.55);
    B.box(M.fabric, x, 0.85, z + 0.27, 0.55, 0.7, 0.08);
    if (x !== 39) L.col(x - 0.3, x + 0.3, z - 0.3, z + 0.3);
  }
  // racks de servidores
  for (let x = 32; x <= 46; x += 1.4) {
    B.box(M.dark, x, 1.1, -60.6, 1.2, 2.2, 0.9);
    const rr = mulberry32(x * 10);
    for (let k = 0; k < 6; k++) B.box(rr() < 0.2 ? M.red : M.green, x - 0.4 + rr() * 0.8, 0.4 + k * 0.3, -61.06, 0.04, 0.03, 0.01);
  }
  L.col(31.3, 46.7, -61.1, -60);
  plant(B, M, 47.3, -79.3, 1.0, true, 61);
  L.col(46.8, 47.8, -79.8, -78.8);
}

function hangar(L, B, M, r) {
  B.setRoom(r);
  fixtures(B, M, r, 1.8, 1.0);
  // plataforma de pouso
  const cx = -39;
  const cz = -70.5;
  for (const [x0, z0, w, d] of [
    [cx - 5.5, cz - 5.5, 11, 0.3],
    [cx - 5.5, cz + 5.2, 11, 0.3],
    [cx - 5.5, cz - 5.5, 0.3, 11],
    [cx + 5.2, cz - 5.5, 0.3, 11],
  ])
    B.rect(M.hazard, [x0, 0.004, z0], [w, 0, 0], [0, 0, d], [0, 1, 0], 'world', false);
  for (const [x0, z0, w, d] of [
    [cx - 1.2, cz - 1.5, 0.3, 3],
    [cx + 0.9, cz - 1.5, 0.3, 3],
    [cx - 0.9, cz - 0.15, 1.8, 0.3],
  ])
    B.rect(M.white, [x0, 0.004, z0], [w, 0, 0], [0, 0, d], [0, 1, 0], 'world', false);
  // nave auxiliar (proa para o campo de força, ao sul)
  B.with(rotY(0, cx, 0, cz), () => {
    const body = new THREE.CapsuleGeometry(1.25, 4.6, 8, 20).rotateX(Math.PI / 2);
    B.geo(M.hull, body, new THREE.Matrix4().makeScale(1.15, 0.85, 1).setPosition(0, 1.9, 0));
    B.geo(M.dark, new THREE.SphereGeometry(0.95, 16, 10, 0, TAU, 0, Math.PI / 2).rotateX(Math.PI / 2 + 0.5), new THREE.Matrix4().makeTranslation(0, 2.35, 2.25));
    B.box(M.hullDark, 0, 1.55, -0.6, 7.6, 0.18, 2.4);
    for (const s of [-1, 1]) {
      B.box(M.hazard, s * 3.6, 1.55, -0.6, 0.5, 0.2, 2.42, { skip: { py: false } });
      B.cyl(M.dark, s * 1.6, 1.5, -3.6, 0.45, 1.0, { sides: 14, axis: 'z' });
      B.cyl(M.engine, s * 1.6, 1.5, -4.11, 0.33, 0.02, { sides: 14, axis: 'z' });
      B.cyl(M.frame, s * 1.0, 0.45, 1.5, 0.06, 0.9, { sides: 6 });
      B.cyl(M.frame, s * 1.2, 0.45, -2.0, 0.06, 0.9, { sides: 6 });
      B.cyl(M.dark, s * 1.0, 0.05, 1.5, 0.22, 0.1, { sides: 10 });
      B.cyl(M.dark, s * 1.2, 0.05, -2.0, 0.22, 0.1, { sides: 10 });
    }
    B.box(M.hullDark, 0, 3.0, -2.6, 0.18, 1.3, 1.6);
  });
  L.col(cx - 3.9, cx + 3.9, cz - 4.3, cz + 3.7);
  // caixas
  crate(B, M, L, -46.6, -78.6, 1.3);
  crate(B, M, L, -46.6, -78.6, 1.1, 1.3, true, 0.3);
  crate(B, M, L, -44.9, -78.7, 1.2);
  crate(B, M, L, -33, -78.4, 1.2, 0, false);
  crate(B, M, L, -33.2, -76.6, 1.2, 0, false);
  crate(B, M, L, -33, -78.4, 1.0, 1.2, true, -0.2);
  crate(B, M, L, -44.6, -66.4, 0.5);
  // caixa aberta com o fusível 3
  B.box(M.wood, -46.7, 0.3, -62.4, 0.9, 0.6, 0.7, { skip: { py: true } });
  B.with(new THREE.Matrix4().makeTranslation(-46.7, 0.6, -62.8).multiply(new THREE.Matrix4().makeRotationX(-1.9)), () => B.box(M.wood, 0, 0, 0.35, 0.9, 0.04, 0.7));
  L.col(-47.2, -46.2, -62.8, -62.0);
  fuseItem(L, 2, -46.7, 0.62, -62.4);
  // tanques
  for (const z of [-63, -65]) {
    B.cyl(M.white, -32, 1.4, z, 0.75, 2.8, { sides: 18 });
    B.cyl(M.hazard, -32, 2.2, z, 0.76, 0.2, { sides: 18, caps: false });
    L.col(-32.8, -31.2, z - 0.8, z + 0.8);
  }
  // elevador de serviço (parede oeste)
  B.box(M.frame, -47.85, 1.6, -71.45, 0.3, 3.2, 0.3);
  B.box(M.frame, -47.85, 1.6, -68.55, 0.3, 3.2, 0.3);
  B.box(M.frame, -47.85, 3.35, -70, 0.3, 0.3, 3.2);
  B.box(M.dark, -47.97, 1.6, -70, 0.06, 3.2, 2.8);
  B.box(M.hazard, -47.6, 0.006, -70, 1.4, 0.012, 2.9);
  B.box(M.dark, -47.88, 1.3, -72.0, 0.12, 0.4, 0.25);
  const amb = { value: new THREE.Vector3(0.3, 0.3, 0.3) };
  const doorMat = dynMaterial(L.Q, { color: 0xb4bcc6, roughness: 0.35, metalness: 0.7 }, amb);
  const doors = [];
  for (const s of [-1, 1]) {
    const d = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.9, 1.3), doorMat);
    d.position.set(-47.86, 1.45, -70 + s * 0.66);
    L.dynamic.add(d);
    doors.push(d);
  }
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xff3020 });
  lampMat.color.multiplyScalar(2.5);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), lampMat);
  lamp.position.set(-47.8, 1.35, -72.0);
  L.dynamic.add(lamp);
  plate(L, zSign('ELEVADOR DE SERVIÇO', 'Níveis de manutenção', '#ffb347'), -47.62, 3.9, -70, 2.4, 0.6, Math.PI / 2, 0.3);
  L.disposers.push(() => {
    doorMat.dispose();
    lampMat.dispose();
  });
  let open = 0;
  L.animate.push((dt, t, player) => {
    amb.value.copy(L.ambientAt(-47, 1.5, -70));
    lampMat.color.setHex(L.elevatorReady ? 0x40ff70 : 0xff3020).multiplyScalar(2.5);
    const want = L.elevatorReady && Math.hypot(player.pos.x + 47, player.pos.z + 70) < 3.5 ? 1 : 0;
    open = clamp(open + (want ? dt : -dt) * 1.4, 0, 1);
    doors[0].position.z = -70 - 0.66 - open * 1.2;
    doors[1].position.z = -70 + 0.66 + open * 1.2;
  });
  L.spots.push({
    x: -46.7,
    z: -70,
    r: 1.9,
    label: () => (L.elevatorReady ? 'Entrar no elevador' : 'Chamar o elevador'),
    action: () => {
      const g = L.game;
      if (!L.elevatorReady) {
        g.audio.play('beep', { gain: 0.35, rate: 0.5 });
        g.hud.message(
          g.objectiveDone('coils') ? 'O painel pede autorização da Sala de Controle. Fale com o Lúcio.' : 'Sem energia. A luz do painel continua vermelha.',
          3.5,
        );
        return;
      }
      g.completeObjective('elevator', 'As portas se fecham. A estação some lá em cima.');
      g.audio.play('ding', { gain: 0.6 });
      g.reachExit('door', 1.2);
    },
  });
  plate(L, zSign('BAÍA 1', 'Campo de força ativo', '#7cc8ff'), -30.83, 5.3, -61.5, 2.2, 0.55, -Math.PI / 2, 0.3);
}

// ------------------------------------------------------------ casco externo
export function buildHull(L, B) {
  const M = L.M;
  B.setRoom(null);
  const off = 0.2;
  for (const r of L.rooms) {
    const hull = r.id === 'F' || r.id === 'H' ? M.hullDark : M.hull;
    for (const side of ['n', 's', 'w', 'e']) {
      const F = wallFrame(r, side);
      const holes = (r.holes && r.holes[side]) || [];
      const n = [-F.n[0], 0, -F.n[2]];
      const cuts = new Set([F.a0 - off, F.a1 + off]);
      for (const o of holes) {
        cuts.add(o.a0);
        cuts.add(o.a1);
      }
      const xs = [...cuts].sort((a, b) => a - b);
      for (let i = 0; i < xs.length - 1; i++) {
        const a = xs[i];
        const b = xs[i + 1];
        const mid = (a + b) / 2;
        let solid = [[-off, r.h + off]];
        for (const o of holes) if (mid > o.a0 && mid < o.a1) solid = subtractSpan(solid, o.y0, o.y1);
        for (const [y0, y1] of solid) {
          const p = F.p(a, y0);
          B.rect(hull, [p[0] + F.out[0] * off, y0, p[2] + F.out[2] * off], [F.U[0] * (b - a), 0, F.U[2] * (b - a)], [0, y1 - y0, 0], n, 'world', false);
        }
      }
    }
    // teto e fundo
    const holesT = r.ceilHoles || [];
    const x0 = r.x0 - off;
    const x1 = r.x1 + off;
    const z0 = r.z0 - off;
    const z1 = r.z1 + off;
    if (holesT.length) {
      const c = holesT[0];
      const top = r.h + (c.depth || 0.6);
      for (const q of [
        [x0, x1, z0, c.z0],
        [x0, x1, c.z1, z1],
        [x0, c.x0, c.z0, c.z1],
        [c.x1, x1, c.z0, c.z1],
      ])
        B.rect(hull, [q[0], top, q[2]], [q[1] - q[0], 0, 0], [0, 0, q[3] - q[2]], [0, 1, 0], 'world', false);
      // bordas do teto até a laje mais alta
      B.rect(hull, [x0, r.h + off, z0], [x1 - x0, 0, 0], [0, top - r.h - off, 0], [0, 0, -1], 'world', false);
      B.rect(hull, [x0, r.h + off, z1], [x1 - x0, 0, 0], [0, top - r.h - off, 0], [0, 0, 1], 'world', false);
      B.rect(hull, [x0, r.h + off, z0], [0, 0, z1 - z0], [0, top - r.h - off, 0], [-1, 0, 0], 'world', false);
      B.rect(hull, [x1, r.h + off, z0], [0, 0, z1 - z0], [0, top - r.h - off, 0], [1, 0, 0], 'world', false);
    } else B.rect(hull, [x0, r.h + off, z0], [x1 - x0, 0, 0], [0, 0, z1 - z0], [0, 1, 0], 'world', false);
    B.rect(M.hullDark, [x0, -off, z0], [x1 - x0, 0, 0], [0, 0, z1 - z0], [0, -1, 0], 'world', false);
  }
}

// ------------------------------------------------------------ estruturas externas
export function buildExterior(L, B) {
  const M = L.M;
  B.setRoom(null);
  // asas de painéis solares (leste e oeste, à altura da Sala dos Geradores)
  for (const s of [-1, 1]) {
    const x0 = s * 30.2;
    const len = 150;
    const cx = x0 + (s * len) / 2;
    B.box(M.hullDark, cx, 9, -100, len, 0.8, 0.8);
    for (let k = 0; k < 9; k++) {
      const x = x0 + s * (12 + k * 15);
      for (const dz of [-1, 1]) {
        B.box(M.solar, x, 9, -100 + dz * 7, 12, 0.12, 11);
        B.box(M.frame, x, 9, -100 + dz * 1.4, 12.2, 0.2, 0.2);
      }
      B.box(M.hullDark, x, 9, -100, 0.4, 0.4, 26);
    }
  }
  // radiadores ao norte
  B.box(M.hullDark, 0, 8, -150, 1.2, 1.2, 80);
  for (let z = -120; z >= -186; z -= 6) {
    for (const s of [-1, 1]) B.box(M.hull, s * 14, 8, z, 26, 6, 0.25);
  }
  // cargueiro estacionado a noroeste (fora da linha de Orfeu)
  const fx = -150;
  const fz = -110;
  B.with(rotY(0.7, fx, -8, fz), () => {
    B.geo(M.hull, new THREE.CylinderGeometry(7, 7, 60, 24).rotateX(Math.PI / 2), new THREE.Matrix4().makeTranslation(0, 4, 0));
    B.geo(M.hullDark, new THREE.SphereGeometry(7, 24, 12, 0, TAU, 0, Math.PI / 2).rotateX(Math.PI / 2), new THREE.Matrix4().makeTranslation(0, 4, 30));
    for (let z = -26; z <= 24; z += 10) B.cyl(M.hazard, 0, 4, z, 7.1, 0.8, { sides: 24, axis: 'z', caps: false });
    for (const [dx, dy] of [
      [-4, 0],
      [4, 0],
      [0, 4],
      [0, -4],
    ]) {
      B.cyl(M.dark, dx, 4 + dy, -32, 2.2, 4, { sides: 16, axis: 'z' });
      B.cyl(M.engine, dx, 4 + dy, -34.05, 1.7, 0.05, { sides: 16, axis: 'z' });
    }
    B.box(M.hullDark, 0, 12, -5, 4, 3, 16);
    B.box(M.cyan, 0, 12.3, 3.05, 3.4, 0.5, 0.05);
  });
  // antena parabólica no teto do refeitório
  B.cyl(M.frame, 27, 6, -16, 0.2, 3.6, { sides: 10 });
  const dish = new THREE.SphereGeometry(4.5, 24, 8, 0, TAU, 0, 0.6).rotateX(Math.PI);
  B.geo(M.hull, dish, new THREE.Matrix4().makeRotationX(-0.9).setPosition(27, 9.2, -16));
  B.cyl(M.frame, 27, 10.4, -18.8, 0.05, 4, { sides: 6 });
  // mastros e luzes de navegação piscando
  const navs = [];
  const nav = (mat, x, y, z) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), new THREE.MeshBasicMaterial({ color: mat === 'r' ? 0xff2020 : 0x30ff70, fog: false }));
    m.material.color.multiplyScalar(4);
    m.position.set(x, y, z);
    L.dynamic.add(m);
    navs.push(m);
  };
  nav('r', -180.4, 9, -100);
  nav('g', 180.4, 9, -100);
  nav('r', 0, 8, -190.5);
  nav('g', fx + 25, 3, fz + 28);
  for (const [x, z] of [
    [-30, -55],
    [30, -55],
    [-45, -30],
    [40, 0],
  ]) {
    B.cyl(M.frame, x, 9 + 3, z, 0.08, 6, { sides: 6 });
    nav(x < 0 ? 'r' : 'g', x, 15.2, z);
  }
  L.animate.push((dt, t) => navs.forEach((m, i) => (m.visible = (t * 0.8 + i * 0.13) % 1.5 < 0.25)));
  L.disposers.push(() => navs.forEach((m) => m.material.dispose()));
}
