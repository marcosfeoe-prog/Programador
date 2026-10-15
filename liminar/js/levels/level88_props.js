// Nível 88 — construções e objetos: a cabana de toras (com porta que abre e
// fecha), o píer, o acampamento abandonado com a carta, o paredão e a boca da
// caverna, pedras, troncos caídos, tocos e placas da trilha.
import * as THREE from 'three';
import { GeoBuilder } from '../materials.js';
import { textCanvasTex, TEX } from '../textures.js';
import { clamp, mulberry32, TAU } from '../util.js';
import { zc, halfW, trailZ, groundH, CAVE, shoreS, WORLD } from './level88_world.js';

const v3 = (x, y, z) => new THREE.Vector3(x, y, z);

// Pedra irregular (icosaedro deformado com ruído).
export function rockGeometry(seed, detail = 1) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const r = mulberry32(seed);
  const p = g.attributes.position;
  const ks = [r(), r(), r()];
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const n = 1 + 0.22 * Math.sin(x * 3.1 + ks[0] * 9) * Math.sin(y * 2.7 + ks[1] * 9) + 0.12 * Math.sin(z * 5.3 + ks[2] * 9);
    p.setXYZ(i, x * n * (1.1 + ks[0] * 0.3), y * n * (0.65 + ks[1] * 0.3), z * n);
  }
  g.computeVertexNormals();
  return g;
}

// ------------------------------------------------------------ cabana
export class Cabin {
  // x,z: centro; a porta fica na parede norte (−z), virada para a trilha e o lago.
  constructor(L, x, z) {
    this.L = L;
    this.x = x;
    this.z = z;
    this.W = 4.6;
    this.D = 5.4;
    this.base = Math.max(groundH(x - 2.3, z - 2.7), groundH(x + 2.3, z - 2.7), groundH(x - 2.3, z + 2.7), groundH(x + 2.3, z + 2.7)) + 0.12;
    this.floorY = this.base + 0.25;
    this.doorW = 1.0;
    this.doorX = x - 0.6; // centro do vão da porta
    this.open = 1; // começa aberta
    this.openTarget = 1;
  }

  build(gb, gbLog, M) {
    const { x, z, W, D } = this;
    const fy = this.floorY;
    const r = mulberry32(881);
    const logR = 0.14;
    const rows = 9;
    const wallH = rows * logR * 1.9;
    this.wallTop = fy + wallH;
    const logCol = (k) => [0.85 + k * 0.3, 0.82 + k * 0.28, 0.78 + k * 0.25];
    // pedras da fundação e assoalho
    for (const [dx, dz] of [
      [-W / 2, -D / 2],
      [W / 2, -D / 2],
      [-W / 2, D / 2],
      [W / 2, D / 2],
      [0, -D / 2],
      [0, D / 2],
    ]) {
      const gy = groundH(x + dx, z + dz);
      gb.addGeometry(rockGeometry(900 + dx * 7 + dz), new THREE.Matrix4().makeScale(0.35, Math.max(0.3, fy - gy), 0.35).setPosition(x + dx, (fy + gy) / 2 - 0.05, z + dz), [0.5, 0.5, 0.48]);
    }
    for (let i = 0; i < 18; i++) {
      const px = x - W / 2 + 0.13 + i * ((W - 0.26) / 18) + (W - 0.26) / 36;
      gb.box(px, fy - 0.03, z, (W - 0.26) / 18 - 0.01, 0.06, D - 0.2, [0.55 + r() * 0.2, 0.47 + r() * 0.15, 0.36 + r() * 0.1], null, { uvScale: 1 });
    }
    // paredes de toras (cruzam nos cantos)
    const doorL = this.doorX - this.doorW / 2;
    const doorR = this.doorX + this.doorW / 2;
    const doorTopRow = 7; // linhas abaixo disto têm o vão da porta
    const winZ0 = z - 0.6;
    const winZ1 = z + 0.6;
    for (let k = 0; k < rows; k++) {
      const y = fy + logR + k * logR * 1.9;
      const c = logCol(r() * 0.4 - 0.2);
      // frente (norte) e fundos (sul): toras ao longo de x
      for (const [zz, front] of [
        [z - D / 2, true],
        [z + D / 2, false],
      ]) {
        const segs = front && k < doorTopRow ? [[x - W / 2 - 0.25, doorL], [doorR, x + W / 2 + 0.25]] : [[x - W / 2 - 0.25, x + W / 2 + 0.25]];
        for (const [a, b] of segs) gbLog.cylinder((a + b) / 2, y, zz, logR, b - a, c, null, { axis: 'x', sides: 8 });
      }
      // laterais: toras ao longo de z (janela na parede leste)
      for (const xx of [x - W / 2, x + W / 2]) {
        const yy = y + logR * 0.95;
        if (yy > this.wallTop) continue;
        const win = xx > x && k >= 3 && k <= 5;
        const segs = win ? [[z - D / 2 - 0.25, winZ0], [winZ1, z + D / 2 + 0.25]] : [[z - D / 2 - 0.25, z + D / 2 + 0.25]];
        for (const [a, b] of segs) gbLog.cylinder(xx, yy, (a + b) / 2, logR, b - a, c, null, { axis: 'z', sides: 8 });
      }
    }
    // tábuas pregadas na janela
    for (let i = 0; i < 3; i++) gb.box(x + W / 2 + 0.16, fy + 0.95 + i * 0.25, z, 0.04, 0.16, 1.5, [0.5, 0.44, 0.36], null, { rot: (r() - 0.5) * 0.4 });
    // batente da porta
    const dh = doorTopRow * logR * 1.9;
    for (const dx of [doorL - 0.04, doorR + 0.04]) gb.box(dx, fy + dh / 2, z - D / 2, 0.09, dh, 0.32, [0.42, 0.36, 0.28]);
    gb.box(this.doorX, fy + dh + 0.05, z - D / 2, this.doorW + 0.2, 0.1, 0.32, [0.42, 0.36, 0.28]);
    this.doorH = dh;
    // empenas e telhado (cumeeira ao longo de z)
    const top = this.wallTop;
    const ridge = top + 1.5;
    const ov = 0.45;
    for (const zz of [z - D / 2, z + D / 2]) {
      for (let i = 0; i < 8; i++) {
        const t = (i + 0.5) / 8;
        const w = (W + 0.5) * (1 - t);
        gb.box(x, top + t * (ridge - top), zz, w, (ridge - top) / 8 - 0.005, 0.1, [0.45, 0.4, 0.33]);
      }
    }
    const slope = Math.atan2(ridge - top, W / 2 + ov);
    const len = Math.hypot(W / 2 + ov, ridge - top);
    for (const s of [-1, 1]) {
      for (let i = 0; i < 14; i++) {
        const zz = z - D / 2 - ov + (i + 0.5) * ((D + ov * 2) / 14);
        const sh = 0.32 + r() * 0.12;
        const m = new THREE.Matrix4()
          .makeTranslation(x + (s * (W / 2 + ov)) / 2, (top + ridge) / 2 + 0.05, zz)
          .multiply(new THREE.Matrix4().makeRotationZ(-s * slope));
        gb.addGeometry(new THREE.BoxGeometry(len + 0.1, 0.06, (D + ov * 2) / 14 - 0.02), m, [sh, sh * 0.9, sh * 0.8]);
      }
    }
    // cama, mesa, cadeira, prateleira
    gb.box(x + 1.5, fy + 0.25, z + 1.4, 1.0, 0.1, 2.0, [0.45, 0.37, 0.27]);
    for (const [dx, dz] of [
      [-0.45, -0.95],
      [0.45, -0.95],
      [-0.45, 0.95],
      [0.45, 0.95],
    ])
      gb.box(x + 1.5 + dx, fy + 0.12, z + 1.4 + dz, 0.08, 0.25, 0.08, [0.35, 0.28, 0.2]);
    gb.box(x + 1.5, fy + 0.38, z + 1.4, 0.9, 0.16, 1.9, [0.36, 0.38, 0.33]);
    gb.box(x + 1.5, fy + 0.5, z + 2.15, 0.6, 0.1, 0.35, [0.62, 0.6, 0.55]);
    gb.box(x - 1.2, fy + 0.74, z + 1.6, 1.3, 0.06, 0.8, [0.5, 0.41, 0.3]);
    for (const [dx, dz] of [
      [-0.58, -0.33],
      [0.58, -0.33],
      [-0.58, 0.33],
      [0.58, 0.33],
    ])
      gb.box(x - 1.2 + dx, fy + 0.36, z + 1.6 + dz, 0.07, 0.72, 0.07, [0.4, 0.32, 0.23]);
    gb.box(x - 1.2, fy + 0.45, z + 0.8, 0.45, 0.05, 0.45, [0.48, 0.4, 0.3], null, { rot: 0.3 });
    gb.box(x - W / 2 + 0.2, fy + 1.5, z + 0.2, 0.3, 0.04, 1.6, [0.45, 0.37, 0.27]);
    for (let i = 0; i < 5; i++) gb.cylinder(x - W / 2 + 0.2, fy + 1.6, z - 0.4 + i * 0.3, 0.05, 0.16, [0.4 + r() * 0.3, 0.38 + r() * 0.2, 0.3], null, { sides: 8 });
    // lampião
    this.lampPos = v3(x - 1.4, fy + 0.95, z + 1.75);
    gb.cylinder(this.lampPos.x, fy + 0.8, this.lampPos.z, 0.07, 0.05, [0.2, 0.18, 0.15], null, { sides: 10 });
    gb.cylinder(this.lampPos.x, fy + 1.07, this.lampPos.z, 0.05, 0.05, [0.2, 0.18, 0.15], null, { sides: 10 });
  }

  // porta, vidro do lampião e luz (objetos que mudam)
  dynamic(M, group) {
    const g = new THREE.Group();
    const geo = new GeoBuilder();
    const r = mulberry32(882);
    const w = this.doorW;
    const h = this.doorH;
    for (let i = 0; i < 5; i++) geo.box(w * ((i + 0.5) / 5), h / 2, 0, w / 5 - 0.01, h - 0.02, 0.05, [0.5 + r() * 0.1, 0.42 + r() * 0.08, 0.32], null);
    for (const y of [0.35, h - 0.35]) geo.box(w / 2, y, 0.04, w - 0.08, 0.12, 0.04, [0.4, 0.33, 0.25]);
    geo.box(w * 0.5, h / 2, 0.05, 0.1, h * 0.9, 0.04, [0.4, 0.33, 0.25], null, { rot: 0 });
    geo.box(w - 0.12, h * 0.48, 0.09, 0.05, 0.05, 0.08, [0.15, 0.14, 0.13]);
    const door = new THREE.Mesh(geo.build(), M.wood);
    door.castShadow = false;
    // dobradiça no lado esquerdo do vão
    g.position.set(this.doorX - w / 2, this.floorY, this.z - this.D / 2 - 0.02);
    g.add(door);
    group.add(g);
    this.doorPivot = g;
    // lampião aceso (vidro brilhante + luz quente)
    const glass = new THREE.Mesh(
      new THREE.CylinderGeometry(0.055, 0.06, 0.2, 10),
      new THREE.MeshBasicMaterial({ color: 0xffb060, transparent: true, opacity: 0.9 }),
    );
    glass.material.color.multiplyScalar(2.5);
    glass.position.copy(this.lampPos);
    group.add(glass);
    this.glass = glass;
    this.light = new THREE.PointLight(0xffa050, 4, 11, 1.6);
    this.light.position.copy(this.lampPos).add(v3(0, 0.15, 0));
    group.add(this.light);
  }

  // dentro da cabana?
  inside(px, pz, m = 0) {
    return Math.abs(px - this.x) < this.W / 2 - 0.25 + m && Math.abs(pz - this.z) < this.D / 2 - 0.25 + m;
  }

  closed() {
    return this.open < 0.08;
  }

  colliders(list) {
    const { x, z, W, D } = this;
    const t = 0.2;
    const doorL = this.doorX - this.doorW / 2;
    const doorR = this.doorX + this.doorW / 2;
    list.push([x - W / 2 - 0.3, doorL, z - D / 2 - t, z - D / 2 + t]);
    list.push([doorR, x + W / 2 + 0.3, z - D / 2 - t, z - D / 2 + t]);
    list.push([x - W / 2 - 0.3, x + W / 2 + 0.3, z + D / 2 - t, z + D / 2 + t]);
    list.push([x - W / 2 - t, x - W / 2 + t, z - D / 2, z + D / 2]);
    list.push([x + W / 2 - t, x + W / 2 + t, z - D / 2, z + D / 2]);
    // móveis
    list.push([x + 1.0, x + 2.0, z + 0.4, z + 2.4]);
    list.push([x - 1.85, x - 0.55, z + 1.2, z + 2.0]);
  }

  doorCollider() {
    if (this.open > 0.3) return null;
    const doorL = this.doorX - this.doorW / 2;
    const doorR = this.doorX + this.doorW / 2;
    return [doorL, doorR, this.z - this.D / 2 - 0.15, this.z - this.D / 2 + 0.15];
  }

  toggle() {
    this.openTarget = this.openTarget > 0.5 ? 0 : 1;
    this.L.game.audio.play('door', { gain: 0.6, rate: this.openTarget ? 1.1 : 0.9 });
    return this.openTarget;
  }

  update(dt, t) {
    this.open += clamp(this.openTarget - this.open, -dt * 2.4, dt * 2.4);
    this.doorPivot.rotation.y = this.open * 1.75;
    const fl = 0.85 + Math.sin(t * 9.1) * 0.05 + Math.sin(t * 23.7) * 0.04 + (Math.random() - 0.5) * 0.05;
    this.light.intensity = 4 * fl;
    this.glass.material.opacity = 0.75 + fl * 0.2;
  }
}

// ------------------------------------------------------------ cenário
// Monta pedras, troncos caídos, tocos, o píer, o acampamento e a caverna.
// Devolve { colliders (círculos), spots (interações), items }.
export function buildScenery(L, gb, gbLog, gbRock) {
  const r = mulberry32(8890);
  const circles = [];
  // pedras grandes pela margem e pela floresta
  const rocks = [rockGeometry(1), rockGeometry(2), rockGeometry(3)];
  for (let i = 0; i < 220; i++) {
    const x = WORLD.x0 + 10 + r() * (WORLD.x1 - WORLD.x0 - 20);
    const nearShore = r() < 0.45;
    const off = nearShore ? halfW(x) + (r() - 0.2) * 6 : halfW(x) + 4 + r() * 110;
    const z = zc(x) + (r() < 0.5 ? -1 : 1) * off;
    if (Math.abs(z - trailZ(x)) < 2.2) continue;
    const s = 0.4 + Math.pow(r(), 2.5) * 2.2;
    const y = groundH(x, z);
    gbRock.addGeometry(rocks[i % 3], new THREE.Matrix4().makeRotationY(r() * TAU).scale(v3(s, s, s)).setPosition(x, y + s * 0.15, z), [0.75 + r() * 0.25, 0.75 + r() * 0.25, 0.72 + r() * 0.25]);
    if (s > 0.6) circles.push([x, z, s * 0.95]);
  }
  // troncos caídos e tocos
  for (let i = 0; i < 70; i++) {
    const x = WORLD.x0 + 15 + r() * (WORLD.x1 - WORLD.x0 - 40);
    const z = zc(x) + (r() < 0.5 ? -1 : 1) * (halfW(x) + 5 + r() * 100);
    if (Math.abs(z - trailZ(x)) < 3) continue;
    const y = groundH(x, z);
    if (r() < 0.55) {
      const len = 3 + r() * 6;
      const rad = 0.18 + r() * 0.2;
      const a = r() * TAU;
      const m = new THREE.Matrix4().makeRotationY(a).multiply(new THREE.Matrix4().makeRotationZ(Math.PI / 2 + (r() - 0.5) * 0.1)).setPosition(x, y + rad * 0.7, z);
      gbLog.addGeometry(new THREE.CylinderGeometry(rad * 0.8, rad, len, 8, 1, false), m, [0.7, 0.65, 0.6]);
      for (let k = -1; k <= 1; k++) circles.push([x + Math.cos(a) * k * len * 0.33, z - Math.sin(a) * k * len * 0.33, rad + 0.15]);
    } else {
      const rad = 0.25 + r() * 0.2;
      const hh = 0.3 + r() * 0.5;
      gbLog.cylinder(x, y + hh / 2 - 0.05, z, rad, hh, [0.75, 0.7, 0.62], null, { sides: 9, r2: rad * 0.85 });
      circles.push([x, z, rad + 0.1]);
    }
  }
  return { circles };
}

// Píer de tábuas saindo da margem em direção ao lago.
export function buildDock(gb, x, z0, dir) {
  const r = mulberry32(8892);
  const len = 9;
  const top = 0.45;
  for (let i = 0; i < 36; i++) {
    const z = z0 + dir * (i * 0.25 + 0.12);
    if (i === 27 || i === 31) continue;
    gb.box(x + (r() - 0.5) * 0.04, top + (r() - 0.5) * 0.02, z, 1.5, 0.05, 0.22, [0.42 + r() * 0.1, 0.37 + r() * 0.08, 0.3], null, { rot: (r() - 0.5) * 0.04 });
  }
  for (let k = 0; k <= 3; k++) {
    const z = z0 + dir * (k * 3 + 0.2);
    const gy = Math.min(0, groundH(x, z));
    for (const dx of [-0.7, 0.7]) gb.cylinder(x + dx, (top + gy) / 2 - 0.1, z, 0.08, top - gy + 0.4, [0.3, 0.27, 0.22], null, { sides: 7 });
  }
  return { x, z0, z1: z0 + dir * len, top };
}

// Acampamento abandonado: anel de pedras, fogueira apagada, barraca caída, toras.
export function buildCamp(gb, gbLog, gbRock, cx, cz, circles) {
  const r = mulberry32(8893);
  const gy = groundH(cx, cz);
  const rock = rockGeometry(7, 0);
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * TAU;
    gbRock.addGeometry(rock, new THREE.Matrix4().makeScale(0.22, 0.16, 0.2).setPosition(cx + Math.cos(a) * 0.75, gy + 0.05, cz + Math.sin(a) * 0.75), [0.55, 0.53, 0.5]);
  }
  for (let i = 0; i < 4; i++) {
    const a = r() * TAU;
    const m = new THREE.Matrix4().makeRotationY(a).multiply(new THREE.Matrix4().makeRotationZ(Math.PI / 2 - 0.15)).setPosition(cx, gy + 0.12, cz);
    gbLog.addGeometry(new THREE.CylinderGeometry(0.05, 0.06, 0.9, 6), m, [0.12, 0.1, 0.09]);
  }
  gb.cylinder(cx, gy + 0.01, cz, 0.6, 0.02, [0.08, 0.07, 0.07], null, { sides: 14 });
  // bancos de tora
  for (const [dx, dz, a] of [
    [2.2, 0.4, 0.2],
    [-1.6, 1.9, 1.3],
  ]) {
    const m = new THREE.Matrix4().makeRotationY(a).multiply(new THREE.Matrix4().makeRotationZ(Math.PI / 2)).setPosition(cx + dx, gy + 0.22, cz + dz);
    gbLog.addGeometry(new THREE.CylinderGeometry(0.22, 0.24, 2.0, 8), m, [0.7, 0.65, 0.58]);
    circles.push([cx + dx, cz + dz, 0.6]);
  }
  // barraca caída (lona afundada)
  const tx = cx - 2.8;
  const tz = cz - 2.2;
  const pos = [];
  const N = 6;
  for (let j = 0; j <= N; j++)
    for (let i = 0; i <= N; i++) {
      const u = i / N - 0.5;
      const v = j / N - 0.5;
      const sag = Math.max(0, 0.55 - Math.abs(u) * 1.2) * (1 - Math.abs(v) * 0.6) + Math.sin(u * 9 + v * 7) * 0.04;
      pos.push([tx + u * 2.2, groundH(tx + u * 2.2, tz + v * 2.6) + 0.03 + sag, tz + v * 2.6]);
    }
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) {
      const a = pos[j * (N + 1) + i];
      const b = pos[j * (N + 1) + i + 1];
      const c = pos[(j + 1) * (N + 1) + i + 1];
      const d = pos[(j + 1) * (N + 1) + i];
      const n = new THREE.Vector3().crossVectors(v3(...d).sub(v3(...a)), v3(...b).sub(v3(...a))).normalize();
      gb.quad([a, b, c, d], [n.x, n.y, n.z], [0, 0, 1, 0, 1, 1, 0, 1], null, [[0.3, 0.33, 0.24], [0.3, 0.33, 0.24], [0.28, 0.3, 0.22], [0.28, 0.3, 0.22]]);
    }
  circles.push([tx, tz, 1.2]);
  // toco onde fica a carta
  const sx = cx + 1.4;
  const sz = cz - 1.3;
  gbLog.cylinder(sx, gy + 0.3, sz, 0.32, 0.65, [0.75, 0.7, 0.62], null, { sides: 10, r2: 0.3 });
  circles.push([sx, sz, 0.4]);
  return { letter: { x: sx, z: sz, y: groundH(sx, sz) + 0.63 } };
}

// Paredão de pedra e a boca da caverna (túnel que desce para dentro da rocha).
export function buildCave(gbRock, gbTunnel, circles) {
  const r = mulberry32(8894);
  const rocks = [rockGeometry(11), rockGeometry(12), rockGeometry(13), rockGeometry(14)];
  const cx = CAVE.x;
  const cz = CAVE.z;
  // blocos grandes formando a face do paredão (deixa o vão da entrada)
  for (let i = 0; i < 46; i++) {
    const z = zc(225) - 60 + i * 2.8 + (r() - 0.5) * 1.5;
    const s = 2.4 + r() * 2.6;
    if (Math.abs(z - cz) < 3.4 + s * 0.85) continue;
    const x = 224.5 + r() * 3 + Math.abs(z - cz) * 0.02;
    const y = groundH(x - 2, z) - 0.5 + r() * 2;
    const k = 1.25 + r() * 0.35;
    gbRock.addGeometry(rocks[i % 4], new THREE.Matrix4().makeRotationY(r() * TAU).scale(v3(s * 0.8, s * 1.2, s)).setPosition(x, y + s * 0.6, z), [k, k, k * 0.97]);
    if (Math.abs(z - cz) < 30) circles.push([x - 0.5, z, s * 0.85]);
  }
  // pedras do arco da entrada
  for (const [dz, s, dy] of [
    [-4.3, 1.7, 0.7],
    [4.3, 1.8, 0.8],
    [0, 2.4, 5.6],
    [-3.2, 1.5, 3.9],
    [3.3, 1.5, 4.0],
  ]) {
    gbRock.addGeometry(rocks[Math.floor(r() * 4)], new THREE.Matrix4().makeRotationY(r() * TAU).scale(v3(s * 0.9, s, s * 0.8)).setPosition(cx + 2.2, CAVE.y + dy, cz + dz), [1.3, 1.3, 1.26]);
    if (dy < 2) circles.push([cx + 2.2, cz + dz, s * 0.75]);
  }
  // totens de pedras empilhadas guiando até a boca
  for (const [dx, dz] of [
    [-6, 3.2],
    [-14, 5.5],
    [-24, 7],
  ]) {
    const gx = cx + dx;
    const gz = cz + dz;
    let y = groundH(gx, gz);
    for (let k = 0; k < 4; k++) {
      const s = 0.32 - k * 0.06;
      gbRock.addGeometry(rocks[k % 4], new THREE.Matrix4().makeRotationY(k * 1.3).scale(v3(s, s * 0.6, s)).setPosition(gx, y + s * 0.5, gz), [0.85, 0.85, 0.82]);
      y += s * 1.05;
    }
    circles.push([gx, gz, 0.35]);
  }
  // túnel: anéis irregulares, visto por dentro
  const segs = 14;
  const ring = 12;
  const pts = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const x = cx + 1.2 + t * 16;
    const fy = CAVE.y - t * 2.2;
    const row = [];
    // perfil: paredes quase verticais e teto em arco
    for (let k = 0; k <= ring; k++) {
      const a = (k / ring) * Math.PI;
      const jit = Math.sin(i * 1.7 + k * 2.1) * 0.18;
      const w = 2.55 - t * 0.5 + jit;
      const wall = 2.5 - t * 0.5;
      const zz = Math.cos(a) * w;
      const yy = Math.sin(a) < 0.2 ? Math.sin(a) * 5 * wall : wall + (Math.sin(a) - 0.2) * 1.4 + jit * 0.5;
      row.push([x, fy + yy, cz + (Math.abs(Math.cos(a)) > 0.98 ? Math.sign(Math.cos(a)) * w : zz * 1.05)]);
    }
    pts.push(row);
  }
  for (let i = 0; i < segs; i++)
    for (let k = 0; k < ring; k++) {
      const a = pts[i][k];
      const b = pts[i][k + 1];
      const c = pts[i + 1][k + 1];
      const d = pts[i + 1][k];
      const n = new THREE.Vector3().crossVectors(v3(...b).sub(v3(...a)), v3(...d).sub(v3(...a))).normalize();
      const sh = 0.38 * Math.pow(1 - i / segs, 2.2) + 0.015;
      gbTunnel.quad([a, d, c, b], [n.x, n.y, n.z], [0, 0, 0, 1, 1, 1, 1, 0], null, [[sh, sh, sh], [sh, sh, sh], [sh * 0.8, sh * 0.8, sh * 0.8], [sh * 0.8, sh * 0.8, sh * 0.8]]);
    }
  // chão do túnel
  for (let i = 0; i < segs; i++) {
    const a = pts[i][0];
    const b = pts[i + 1][0];
    const c = pts[i + 1][ring];
    const d = pts[i][ring];
    const sh = 0.32 * Math.pow(1 - i / segs, 2.2) + 0.015;
    gbTunnel.quad([d, c, b, a], [0, 1, 0], [0, 0, 1, 0, 1, 1, 0, 1], null, [[sh, sh, sh], [sh, sh, sh], [sh, sh, sh], [sh, sh, sh]]);
  }
  // fundo escuro do túnel (maior que a seção)
  const e = pts[segs][0];
  const ex = e[0] + 0.2;
  const ey = e[1] - 0.5;
  gbTunnel.quad([[ex, ey, cz + 4], [ex, ey, cz - 4], [ex, ey + 6, cz - 4], [ex, ey + 6, cz + 4]], [-1, 0, 0], [0, 0, 1, 0, 1, 1, 0, 1], null, [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]]);
}

// Placas de madeira entalhadas ao longo da trilha.
export function signMesh(text, mat) {
  const tex = textCanvasTex(256, 96, (c, w, h) => {
    c.fillStyle = '#4a3a28';
    c.fillRect(0, 0, w, h);
    for (let i = 0; i < 6; i++) {
      c.fillStyle = `rgba(0,0,0,${0.08 + (i % 2) * 0.06})`;
      c.fillRect(0, (i * h) / 6, w, 2);
    }
    c.fillStyle = '#1c140c';
    c.font = 'bold 34px Georgia, serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(text, w / 2, h / 2 + 2);
  });
  const m = mat.clone();
  m.map = tex;
  m.color.setRGB(1, 1, 1);
  return new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.34, 0.05), m);
}

export function noiseSprite() {
  const S = 128;
  const cv = TEX.makeCanvas(S, S);
  const c = cv.getContext('2d');
  const img = c.createImageData(S, S);
  const n = TEX.noiseField(S, S, 4, 4, 4, 8895);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const i = y * S + x;
      const d = Math.hypot(x - S / 2, y - S / 2) / (S / 2);
      const a = clamp(1 - d, 0, 1) ** 1.6 * (0.4 + n[i] * 0.8);
      img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = 255;
      img.data[i * 4 + 3] = a * 255;
    }
  c.putImageData(img, 0, 0);
  return TEX.toTex(cv, { repeat: false });
}

export { shoreS };
