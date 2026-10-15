// Nível 3 — atrás do grande portão trancado: um salão de robótica limpo e
// iluminado, completamente diferente dos corredores de tijolo. Esteiras com
// caixas, braços mecânicos, robôs trabalhando, robôs patrulhando, cápsulas de
// recarga e um terminal. As máquinas tomaram conta do Nível 3.
// Também: o portão (com a cena dele abrindo) e o computador que destrava a
// porta de saída do segundo andar.
import * as THREE from 'three';
import { ZBuilder, buildShell, bakeMaterial, dynMaterial, glowMaterial, bakeLight } from './level0_1_build.js';
import { zScreen } from './level0_1_tex.js';
import { getTex, textCanvasTex } from '../textures.js';
import { angleDiff, clamp, damp, smoothstep } from '../util.js';

const v3 = (x, y, z) => new THREE.Vector3(x, y, z);

function down(x, y, z, I, range, c = [0.92, 0.97, 1.0]) {
  return { x, y, z, I, range, c, dir: [0, -1, 0], pow: 0.8, soft: 1.5 };
}

// ------------------------------------------------------------ robôs
class Robot {
  // kind: 'worker' (parado numa bancada, braços trabalhando) | 'walker' (patrulha) | 'pod' (dormindo na cápsula)
  constructor(H, x, z, yaw, kind, path) {
    this.H = H;
    this.kind = kind;
    this.x = x;
    this.z = z;
    this.yaw = yaw;
    this.baseYaw = yaw;
    this.path = path;
    this.seg = 0;
    this.phase = Math.random() * 10;
    this.look = 0;
    const M = H.rm;
    const root = new THREE.Group();
    const box = (mat, w, h, d, x0, y0, z0, parent) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x0, y0, z0);
      (parent || root).add(m);
      return m;
    };
    // pernas
    this.legs = [];
    for (const s of [-1, 1]) {
      const hip = new THREE.Group();
      hip.position.set(s * 0.13, 0.95, 0);
      root.add(hip);
      box(M.dark, 0.12, 0.45, 0.14, 0, -0.22, 0, hip);
      const knee = new THREE.Group();
      knee.position.y = -0.45;
      hip.add(knee);
      box(M.white, 0.13, 0.46, 0.15, 0, -0.23, 0, knee);
      box(M.dark, 0.16, 0.06, 0.26, 0, -0.47, 0.04, knee);
      this.legs.push({ hip, knee, s });
    }
    // tronco
    const torso = new THREE.Group();
    torso.position.y = 0.95;
    root.add(torso);
    box(M.dark, 0.32, 0.18, 0.2, 0, 0.08, 0, torso);
    box(M.white, 0.46, 0.5, 0.28, 0, 0.42, 0, torso);
    box(M.dark, 0.3, 0.22, 0.02, 0, 0.45, 0.145, torso);
    this.core = box(M.eye, 0.08, 0.08, 0.02, 0, 0.45, 0.16, torso);
    box(M.stripe, 0.47, 0.05, 0.29, 0, 0.62, 0, torso);
    this.torso = torso;
    // cabeça com visor
    const head = new THREE.Group();
    head.position.set(0, 0.76, 0);
    torso.add(head);
    box(M.dark, 0.08, 0.08, 0.08, 0, 0.02, 0, head);
    box(M.white, 0.26, 0.2, 0.24, 0, 0.15, 0, head);
    this.visor = box(M.eye, 0.22, 0.05, 0.02, 0, 0.16, 0.125, head);
    const ant = box(M.dark, 0.015, 0.14, 0.015, 0.08, 0.31, -0.04, head);
    void ant;
    this.head = head;
    // braços
    this.arms = [];
    for (const s of [-1, 1]) {
      const sh = new THREE.Group();
      sh.position.set(s * 0.29, 0.6, 0);
      torso.add(sh);
      box(M.dark, 0.1, 0.1, 0.1, 0, 0, 0, sh);
      box(M.white, 0.1, 0.36, 0.11, 0, -0.2, 0, sh);
      const el = new THREE.Group();
      el.position.y = -0.38;
      sh.add(el);
      box(M.dark, 0.09, 0.34, 0.1, 0, -0.17, 0, el);
      box(M.dark, 0.11, 0.08, 0.06, 0, -0.37, 0.02, el);
      this.arms.push({ sh, el, s });
    }
    if (kind === 'pod') {
      // dormindo: cabeça baixa, visor apagado
      head.rotation.x = 0.45;
      for (const a of this.arms) a.sh.rotation.x = 0.05;
    }
    root.position.set(x, 0, z);
    root.rotation.y = yaw;
    H.group.add(root);
    this.root = root;
  }

  update(dt, t, player, alarm) {
    const p = player.pos;
    const dx = p.x - this.x;
    const dz = p.z - this.z;
    const d = Math.hypot(dx, dz);
    const toP = Math.atan2(dx, dz);
    let walking = false;
    if (this.kind === 'walker' && !this.stare) {
      const [tx, tz] = this.path[(this.seg + 1) % this.path.length];
      const ex = tx - this.x;
      const ez = tz - this.z;
      const e = Math.hypot(ex, ez);
      if (e < 0.2) this.seg = (this.seg + 1) % this.path.length;
      else {
        const want = Math.atan2(ex, ez);
        this.yaw += clamp(angleDiff(want, this.yaw), -dt * 2.5, dt * 2.5);
        const sp = 0.8 * clamp(1 - Math.abs(angleDiff(want, this.yaw)), 0, 1);
        this.x += Math.sin(this.yaw) * sp * dt;
        this.z += Math.cos(this.yaw) * sp * dt;
        walking = sp > 0.1;
      }
    }
    // perto do andarilho (ou com o alarme): param e encaram
    this.stare = this.kind !== 'pod' && (d < 5 || alarm > 0);
    if (this.stare) this.yaw += clamp(angleDiff(toP, this.yaw), -dt * 2, dt * 2);
    else if (this.kind === 'worker') this.yaw += clamp(angleDiff(this.baseYaw, this.yaw), -dt, dt);
    this.root.position.set(this.x, 0, this.z);
    this.root.rotation.y = this.yaw;
    this.phase += dt * (walking ? 5.5 : 1);
    const ph = this.phase;
    // pernas
    for (const l of this.legs) {
      const s = walking ? Math.sin(ph + (l.s > 0 ? Math.PI : 0)) : 0;
      l.hip.rotation.x = s * 0.45;
      l.knee.rotation.x = walking ? Math.max(0, -Math.cos(ph + (l.s > 0 ? Math.PI : 0))) * 0.7 : 0;
    }
    this.root.position.y = walking ? Math.abs(Math.sin(ph)) * 0.03 : 0;
    // braços
    for (const a of this.arms) {
      if (this.kind === 'worker' && !this.stare) {
        a.sh.rotation.x = -0.9 + Math.sin(t * 2.2 + this.phase + a.s) * 0.25;
        a.el.rotation.x = -0.7 + Math.sin(t * 3.1 + a.s * 2) * 0.35;
      } else if (walking) {
        a.sh.rotation.x = Math.sin(ph + (a.s > 0 ? 0 : Math.PI)) * 0.35;
        a.el.rotation.x = -0.2;
      } else if (this.kind !== 'pod') {
        a.sh.rotation.x = damp(a.sh.rotation.x, 0, 4, dt);
        a.el.rotation.x = damp(a.el.rotation.x, -0.1, 4, dt);
      }
    }
    // cabeça: varredura com o visor; encara quando é para encarar
    if (this.kind !== 'pod') {
      const rel = this.stare ? clamp(angleDiff(toP, this.yaw), -1, 1) : Math.sin(t * 0.7 + this.phase) * 0.5;
      this.head.rotation.y = damp(this.head.rotation.y, rel, 6, dt);
      this.head.rotation.x = damp(this.head.rotation.x, this.stare ? clamp(-Math.atan2(1.62 - 1.86, d), -0.3, 0.3) : 0.1, 6, dt);
    }
  }

  dispose() {
    this.root.traverse((o) => o.geometry && o.geometry.dispose());
  }
}

// ------------------------------------------------------------ salão
export class RobotHall {
  // r: { x0, x1, z0, z1 } em metros (já recuado da parede da grade); gate: { z0, z1 } na parede oeste
  constructor(L, r, gate) {
    this.L = L;
    this.game = L.game;
    this.Q = L.Q;
    this.r = r;
    this.gateZ = gate;
    this.group = new THREE.Group();
    L.dynamic.add(this.group);
    this.U = { uPower: { value: 1 } };
    this.colliders = [];
    this.robots = [];
    this.animate = [];
    this.disposers = [];
    this.realSun = false;
    this.alarm = 0;
    this._bk = new Float32Array(6);
    this.amb = { value: new THREE.Vector3(0.25, 0.27, 0.3) };
    this.build();
  }

  bakeAt(room, x, y, z, nx, ny, nz) {
    return bakeLight(room || this.room, [x, y, z], [nx, ny, nz], this._bk, null);
  }

  build() {
    const Q = this.Q;
    const U = this.U;
    const S = Q.tex;
    const r = this.r;
    const T = (n) => getTex(n, S);
    const mk = (o, uvS) => {
      const m = bakeMaterial(Q, o, U);
      m.userData.uvS = uvS;
      return m;
    };
    const fl = T('zFloor');
    const wl = T('zWall');
    const dk = T('zDark');
    const cl = T('zCeil');
    const hz = T('zHazard');
    const M = {
      floor: mk({ map: fl.map, normalMap: fl.normalMap, roughnessMap: fl.roughnessMap, roughness: 1, metalness: 0.2, color: 0xaab2ba }, 2.4),
      wall: mk({ map: wl.map, normalMap: wl.normalMap, roughness: 0.55 }, 2.4),
      ceil: mk({ map: cl.map, normalMap: cl.normalMap, roughness: 0.85 }, 2.4),
      dark: mk({ map: dk.map, normalMap: dk.normalMap, roughnessMap: dk.roughnessMap, roughness: 1, metalness: 0.5 }, 2),
      frame: mk({ color: 0xc2c9d1, roughness: 0.35, metalness: 0.7 }, 2),
      hazard: mk({ map: hz.map, roughness: 0.6 }, 1.2),
      white: mk({ color: 0xe9edf0, roughness: 0.35, metalness: 0.05 }, 2),
      belt: mk({ color: 0x1a1c20, roughness: 0.7 }, 1),
      lamp: glowMaterial(U, { color: 0xf2f8ff, k: 0 }),
      red: glowMaterial(U, { color: 0xff3020, k: 0 }),
      cyan: glowMaterial(U, { color: 0x50e0ff, k: 0 }),
      green: glowMaterial(U, { color: 0x40ff80, k: 0 }),
    };
    M.lamp.color.multiplyScalar(2.4);
    M.red.color.multiplyScalar(2.5);
    M.cyan.color.multiplyScalar(2);
    for (const k of ['lamp', 'red', 'cyan', 'green']) M[k].userData.noShadow = true;
    this.M = M;
    const zc = (this.gateZ.z0 + this.gateZ.z1) / 2;
    const room = {
      id: 'hall',
      x0: r.x0,
      x1: r.x1,
      z0: r.z0,
      z1: r.z1,
      h: 8,
      box: true,
      amb: [0.05, 0.055, 0.065],
      lights: [],
      holes: { w: [{ a0: this.gateZ.z0, a1: this.gateZ.z1, y0: 0, y1: 3.0, kind: 'portal' }], n: [], s: [], e: [] },
      mats: { floor: M.floor, wall: M.wall, ceil: M.ceil, trim: M.frame, base: M.hazard, frame: M.frame, reveal: M.dark },
    };
    const W = r.x1 - r.x0;
    const D = r.z1 - r.z0;
    for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) room.lights.push(down(r.x0 + (W * (i + 0.5)) / 4, 7.9, r.z0 + (D * (j + 0.5)) / 3, 34, 18));
    room.lights.push({ x: r.x1 - 0.5, y: 4, z: (r.z0 + r.z1) / 2, I: 18, range: 14, c: [0.4, 0.8, 1.0] });
    room.lights.push({ x: r.x0 + 1, y: 2.5, z: zc, I: 5, range: 6, c: [1, 0.2, 0.15] });
    this.room = room;
    const B = new ZBuilder(this);
    buildShell(B, room, this.colliders);
    B.setRoom(room);
    // luminárias
    for (const l of room.lights) if (l.dir) B.rect(M.lamp, [l.x - 1.6, 7.98, l.z - 0.2], [3.2, 0, 0], [0, 0, 0.4], [0, -1, 0], [0, 0, 1, 1], false);
    // faixa de perigo em volta das esteiras e linhas no chão
    const lines = [r.z0 + D * 0.32, r.z0 + D * 0.68];
    this.belts = [];
    for (const z of lines) {
      const x0 = r.x0 + 5;
      const x1 = r.x1 - 3;
      B.box(M.dark, (x0 + x1) / 2, 0.45, z, x1 - x0, 0.9, 1.2);
      B.box(M.belt, (x0 + x1) / 2, 0.92, z, x1 - x0 + 0.1, 0.05, 1.0);
      for (let x = x0 + 0.5; x < x1; x += 1.2) B.box(M.frame, x, 0.92, z + 0.58, 0.04, 0.12, 0.04);
      B.rect(M.hazard, [x0 - 0.2, 0.004, z - 1.2], [x1 - x0 + 0.4, 0, 0], [0, 0, 0.25], [0, 1, 0], 'world', false);
      B.rect(M.hazard, [x0 - 0.2, 0.004, z + 0.95], [x1 - x0 + 0.4, 0, 0], [0, 0, 0.25], [0, 1, 0], 'world', false);
      this.colliders.push([x0, x1, z - 0.65, z + 0.65]);
      this.belts.push({ x0, x1, z });
    }
    // racks de servidores (norte) e cápsulas de recarga (sul)
    for (let x = r.x0 + 6; x < r.x1 - 2; x += 1.3) {
      B.box(M.dark, x, 1.1, r.z0 + 0.6, 1.1, 2.2, 0.9);
      for (let k = 0; k < 6; k++) B.box(k % 3 ? M.green : M.cyan, x - 0.35 + ((k * 37) % 70) / 100, 0.4 + k * 0.3, r.z0 + 1.06, 0.04, 0.03, 0.01);
    }
    this.colliders.push([r.x0 + 5, r.x1 - 2, r.z0, r.z0 + 1.1]);
    const pods = [];
    for (let k = 0; k < 6; k++) {
      const x = r.x0 + 6 + k * 2.4;
      const z = r.z1 - 1.0;
      B.box(M.white, x, 0.08, z, 1.4, 0.16, 1.2);
      B.box(M.white, x, 2.5, z, 1.4, 0.2, 1.2);
      B.box(M.dark, x, 1.3, z + 0.55, 1.4, 2.4, 0.1);
      for (const s of [-1, 1]) B.box(M.frame, x + s * 0.68, 1.3, z, 0.06, 2.4, 0.06);
      B.rect(M.cyan, [x - 0.6, 2.38, z - 0.5], [1.2, 0, 0], [0, 0, 1.0], [0, -1, 0], [0, 0, 1, 1], false);
      pods.push([x, z]);
    }
    this.colliders.push([r.x0 + 5, r.x1 - 2, r.z1 - 1.7, r.z1]);
    // telão na parede leste
    const tz = (r.z0 + r.z1) / 2;
    B.box(M.dark, r.x1 - 0.12, 4.5, tz, 0.12, 3.4, 7.2);
    // terminal (o computador)
    const cx = r.x1 - 2.2;
    const cz = r.z0 + D * 0.5 + 4.4;
    B.box(M.dark, cx, 0.5, cz, 1.0, 1.0, 1.8);
    B.box(M.frame, cx, 1.03, cz, 1.1, 0.06, 1.9);
    B.box(M.dark, cx + 0.2, 1.5, cz, 0.08, 0.8, 1.2);
    B.box(M.white, cx - 0.2, 1.08, cz, 0.35, 0.03, 0.9);
    this.colliders.push([cx - 0.55, cx + 0.55, cz - 0.95, cz + 0.95]);
    this.pc = { x: cx - 0.9, z: cz, sx: cx + 0.15, sz: cz };
    // braços mecânicos nas esteiras (montados dinamicamente)
    this.meshes = B.build(this.group);
    // telas e placas
    this.bigScreen = this.screen(textScreen('NÍVEL 3 · CONTROLE ROBÓTICO', 'MÃO DE OBRA HUMANA: DESNECESSÁRIA', '#ff5040'), r.x1 - 0.2, 4.5, tz, 7, 3.2, -Math.PI / 2, 1.3);
    this.pcScreen = this.screen(textScreen('TERMINAL CR-3', 'PORTA SAÍDA (2º ANDAR): TRAVADA', '#ff5040'), cx + 0.14, 1.5, cz, 1.1, 0.7, -Math.PI / 2, 1.5);
    this.screen(zScreen(901, 0, 'PRODUÇÃO'), r.x1 - 0.2, 6.6, tz - 4.6, 1.6, 1.0, -Math.PI / 2, 1.2);
    this.screen(zScreen(902, 190, 'UNIDADES'), r.x1 - 0.2, 6.6, tz + 4.6, 1.6, 1.0, -Math.PI / 2, 1.2);
    // materiais dos robôs
    const amb = this.amb;
    const rm = {
      white: dynMaterial(Q, { color: 0xd8dde2, roughness: 0.3, metalness: 0.3 }, amb),
      dark: dynMaterial(Q, { color: 0x2a2e34, roughness: 0.45, metalness: 0.6 }, amb),
      stripe: dynMaterial(Q, { color: 0xd04a20, roughness: 0.5 }, amb),
      eye: new THREE.MeshBasicMaterial({ color: 0xff2a20 }),
    };
    rm.eye.color.multiplyScalar(2.5);
    this.rm = rm;
    // robôs: trabalhadores nas esteiras, dois patrulhando, seis dormindo nas cápsulas
    for (const b of this.belts) {
      for (let k = 0; k < 3; k++) {
        const x = b.x0 + 2 + k * ((b.x1 - b.x0 - 4) / 2);
        this.robots.push(new Robot(this, x, b.z - 1.05, 0, 'worker'));
      }
    }
    const midZ = (lines[0] + lines[1]) / 2;
    this.robots.push(new Robot(this, r.x0 + 3, midZ, Math.PI / 2, 'walker', [[r.x0 + 3, midZ], [r.x1 - 3, midZ]]));
    this.robots.push(new Robot(this, r.x1 - 3.5, r.z0 + 2.4, -Math.PI / 2, 'walker', [[r.x1 - 3.5, r.z0 + 2.4], [r.x0 + 4, r.z0 + 2.4], [r.x0 + 4, lines[0] - 1.8], [r.x1 - 3.5, lines[0] - 1.8]]));
    for (const [x, z] of pods) this.robots.push(new Robot(this, x, z - 0.05, Math.PI, 'pod'));
    // braços industriais
    this.armsInd = [];
    for (const b of this.belts) {
      for (let k = 0; k < 2; k++) {
        const x = b.x0 + 3.5 + k * ((b.x1 - b.x0) / 2);
        this.armsInd.push(this.industrialArm(x, b.z + 1.2));
      }
    }
    // caixas andando nas esteiras
    const crateG = new THREE.BoxGeometry(0.5, 0.4, 0.5);
    this.crates = [];
    for (const b of this.belts)
      for (let k = 0; k < 5; k++) {
        const m = new THREE.Mesh(crateG, rm.stripe);
        m.userData = { b, u: k / 5 };
        this.group.add(m);
        this.crates.push(m);
      }
    this.disposers.push(() => crateG.dispose());
    // portão
    this.makeGate();
  }

  screen(tex, x, y, z, w, h, yaw, k) {
    const m = new THREE.MeshBasicMaterial({ map: tex });
    m.color.setScalar(k);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
    mesh.position.set(x, y, z);
    mesh.rotation.y = yaw;
    this.group.add(mesh);
    this.disposers.push(() => {
      tex.dispose();
      m.dispose();
      mesh.geometry.dispose();
    });
    return mesh;
  }

  industrialArm(x, z) {
    const M = this.rm;
    const base = new THREE.Group();
    base.position.set(x, 0, z);
    const mk = (geo, mat, y, parent) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.y = y;
      parent.add(m);
      return m;
    };
    mk(new THREE.CylinderGeometry(0.35, 0.45, 0.4, 16), M.dark, 0.2, base);
    const turn = new THREE.Group();
    turn.position.y = 0.4;
    base.add(turn);
    mk(new THREE.CylinderGeometry(0.22, 0.25, 0.4, 14), M.stripe, 0.2, turn);
    const j1 = new THREE.Group();
    j1.position.y = 0.45;
    turn.add(j1);
    const a1 = mk(new THREE.BoxGeometry(0.2, 1.2, 0.22), M.stripe, 0.6, j1);
    void a1;
    const j2 = new THREE.Group();
    j2.position.y = 1.2;
    j1.add(j2);
    mk(new THREE.BoxGeometry(0.16, 1.0, 0.18), M.stripe, 0.5, j2);
    const j3 = new THREE.Group();
    j3.position.y = 1.0;
    j2.add(j3);
    mk(new THREE.CylinderGeometry(0.08, 0.08, 0.2, 10), M.dark, 0.1, j3);
    mk(new THREE.BoxGeometry(0.25, 0.06, 0.06), M.dark, 0.22, j3);
    this.group.add(base);
    this.colliders.push([x - 0.5, x + 0.5, z - 0.5, z + 0.5]);
    return { base, turn, j1, j2, j3, ph: Math.random() * 6 };
  }

  makeGate() {
    const r = this.r;
    const g = new THREE.Group();
    const iron = new THREE.MeshStandardMaterial({ color: 0x8a8e92, roughness: 0.5, metalness: 0.8, emissive: 0x15171a });
    const white = new THREE.MeshStandardMaterial({ color: 0xf0f0f0, roughness: 0.4, metalness: 0.3, emissive: 0x404040 });
    const z0 = this.gateZ.z0;
    const z1 = this.gateZ.z1;
    const w = z1 - z0;
    const h = 3.0;
    const bars = new THREE.Group();
    for (let z = z0 + 0.15; z < z1 - 0.1; z += 0.22) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, h, 6), iron);
      b.position.set(0, h / 2, z);
      bars.add(b);
    }
    for (const y of [0.15, 1.0, 2.0, 2.85]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, w), iron);
      b.position.set(0, y, (z0 + z1) / 2);
      bars.add(b);
    }
    // cadeado branco e placa "FORA DOS LIMITES"
    const lock = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.2, 0.18), white);
    lock.position.set(-0.08, 1.1, (z0 + z1) / 2);
    bars.add(lock);
    this.signTex = textCanvasTex(256, 128, (c, W, H) => {
      c.fillStyle = '#2a2418';
      c.fillRect(0, 0, W, H);
      c.strokeStyle = '#d8b040';
      c.lineWidth = 6;
      c.strokeRect(6, 6, W - 12, H - 12);
      c.fillStyle = '#e8c050';
      c.font = 'bold 34px Arial, Helvetica, sans-serif';
      c.textAlign = 'center';
      c.fillText('FORA DOS', W / 2, 54);
      c.fillText('LIMITES', W / 2, 96);
    });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.35), new THREE.MeshBasicMaterial({ map: this.signTex }));
    sign.material.color.setScalar(0.7);
    sign.position.set(-0.06, 1.9, z0 + 0.8);
    sign.rotation.y = -Math.PI / 2;
    bars.add(sign);
    g.add(bars);
    g.position.set(r.x0 - 0.15, 0, 0);
    this.L.dynamic.add(g);
    this.gate = { g, bars, open: 0, target: 0, x: r.x0 - 0.15, zc: (z0 + z1) / 2 };
    this.disposers.push(() => {
      iron.dispose();
      white.dispose();
      sign.material.dispose();
      this.signTex.dispose();
      g.traverse((o) => o.geometry && o.geometry.dispose());
    });
  }

  gateCollider() {
    if (this.gate.open > 0.7) return null;
    return [this.gate.x - 0.15, this.gate.x + 0.15, this.gateZ.z0, this.gateZ.z1];
  }

  // ------------------------------------------------------------ cena do portão
  startCine() {
    const g = this.game;
    this.cine = 0;
    g.player.frozen = true;
    g.hud.show(false);
    const bars = document.createElement('div');
    bars.id = 'cine';
    bars.innerHTML = '<div class="cb top"></div><div class="cb bot"><div id="cine-sub"></div><div id="cine-skip">tocar / E para pular</div></div>';
    document.body.appendChild(bars);
    this.bars = bars;
    const skip = (e) => {
      e.preventDefault();
      this.cine = Math.max(this.cine, 12.2);
    };
    bars.addEventListener('touchend', skip, { passive: false });
    bars.addEventListener('click', skip);
    this.subs = [
      [0.4, 'A chave branca gira. Algo pesado destrava do outro lado.'],
      [3.6, 'O portão sobe, rangendo.'],
      [6.4, 'Luz branca. Máquinas. Movimento.'],
      [9.3, 'Eles param. E viram a cabeça para você.'],
      [12.4, ''],
    ];
    this.subI = 0;
    g.audio.play('door', { gain: 0.6, rate: 0.5 });
    g.audio.play('machine', { gain: 0.4, rate: 0.6 });
  }

  updateCine(dt) {
    const g = this.game;
    this.cine += dt;
    const t = this.cine;
    if (g.input.pressed('interact')) this.cine = Math.max(this.cine, 12.2);
    while (this.subI < this.subs.length && t >= this.subs[this.subI][0]) {
      const el = document.getElementById('cine-sub');
      if (el) el.textContent = this.subs[this.subI][1];
      this.subI++;
    }
    const G = this.gate;
    G.target = 1;
    G.open = smoothstep(2.2, 6, t);
    G.bars.position.y = G.open * 2.9;
    G.bars.position.x = Math.sin(t * 40) * 0.01 * (t > 2.2 && t < 6 ? 1 : 0);
    if (t > 2.2 && !this.creak) {
      this.creak = true;
      g.audio.play('creak', { gain: 0.6, rate: 0.7 });
      g.vibrate(200);
    }
    if (t > 9.3 && !this.turned) {
      this.turned = true;
      this.alarm = 4;
      g.audio.play('beep', { gain: 0.4, rate: 0.6 });
      g.audio.play('beep', { gain: 0.4, rate: 0.6, when: 0.25 });
    }
    // câmera: diante do portão → atravessa → passeia pelo salão → encara os robôs
    const gx = G.x;
    const gz = G.zc;
    const r = this.r;
    const keys = [
      [0, v3(gx - 2.6, 1.6, gz + 0.6), v3(gx, 1.3, gz)],
      [5.5, v3(gx - 1.4, 1.5, gz), v3(gx + 4, 1.4, gz)],
      [8.5, v3(gx + 4.5, 3.6, gz - 1.5), v3(r.x1 - 6, 1.2, r.z0 + (r.z1 - r.z0) * 0.32)],
      [11, v3(gx + 7, 2.2, gz), v3(gx + 11, 1.7, gz - 1)],
      [13, v3(gx - 1.0, 1.62, gz), v3(gx + 6, 1.55, gz)],
    ];
    let a = keys[0];
    let b = keys[keys.length - 1];
    for (let k = 0; k < keys.length - 1; k++)
      if (t <= keys[k + 1][0]) {
        a = keys[k];
        b = keys[k + 1];
        break;
      }
    const u = smoothstep(a[0], b[0], Math.min(t, b[0]));
    const cam = g.camera;
    cam.position.lerpVectors(a[1], b[1], u);
    cam.up.set(0, 1, 0);
    cam.lookAt(new THREE.Vector3().lerpVectors(a[2], b[2], u));
    if (t >= 13.2) this.endCine();
  }

  endCine() {
    const g = this.game;
    this.cine = null;
    if (this.bars) this.bars.remove();
    this.bars = null;
    this.gate.open = 1;
    this.gate.bars.position.set(0, 2.9, 0);
    g.hud.show(true);
    g.player.frozen = false;
    g.player.pos.set(this.gate.x - 1.0, 0, this.gate.zc);
    g.player.yaw = -Math.PI / 2;
    g.player.pitch = 0;
    g.completeObjective('gate', 'O portão está aberto. Os robôs dominam esta parte do Nível 3. Ache o computador.');
  }

  // ------------------------------------------------------------ quadro
  update(dt, t, player) {
    const p = player.pos;
    const r = this.r;
    const near = this.cine !== null && this.cine !== undefined ? true : p.x > r.x0 - 20 && p.x < r.x1 + 5 && p.z > r.z0 - 10 && p.z < r.z1 + 10;
    this.group.visible = near || this.gate.open > 0;
    if (!near) return;
    this.alarm = Math.max(0, this.alarm - dt);
    const al = this.alarm;
    // olhos e núcleo piscam no alarme
    const k = al > 0 ? (Math.sin(t * 14) > 0 ? 3.5 : 0.6) : 2.2 + Math.sin(t * 2) * 0.3;
    this.rm.eye.color.setRGB(1 * k, 0.12 * k, 0.08 * k);
    for (const rb of this.robots) rb.update(dt, t, player, al);
    for (const a of this.armsInd) {
      const s = t * 0.9 + a.ph;
      a.turn.rotation.y = Math.sin(s) * 1.2;
      a.j1.rotation.z = -0.5 + Math.sin(s * 1.3) * 0.35;
      a.j2.rotation.z = 1.2 + Math.sin(s * 1.7 + 1) * 0.4;
      a.j3.rotation.y = s * 2;
    }
    for (const c of this.crates) {
      const u = c.userData;
      u.u = (u.u + dt * 0.04) % 1;
      c.position.set(u.b.x0 + 0.4 + u.u * (u.b.x1 - u.b.x0 - 0.8), 1.15, u.b.z);
    }
    this.bigScreen.material.color.setScalar(1.1 + (al > 0 ? Math.sin(t * 14) * 0.5 : 0));
  }

  dispose() {
    if (this.bars) this.bars.remove();
    for (const rb of this.robots) rb.dispose();
    for (const a of this.armsInd) a.base.traverse((o) => o.geometry && o.geometry.dispose());
    for (const m of this.meshes) m.geometry.dispose();
    for (const k in this.M) this.M[k].dispose();
    for (const k in this.rm) this.rm[k].dispose();
    for (const f of this.disposers) f();
    this.L.dynamic.remove(this.group);
  }
}

// Tela com título e linha de status.
export function textScreen(title, status, color) {
  return textCanvasTex(512, 256, (c, w, h) => {
    c.fillStyle = '#05080c';
    c.fillRect(0, 0, w, h);
    c.strokeStyle = color;
    c.lineWidth = 3;
    c.strokeRect(10, 10, w - 20, h - 20);
    c.fillStyle = color;
    c.font = 'bold 34px monospace';
    c.textAlign = 'center';
    c.fillText(title, w / 2, 72);
    c.font = '22px monospace';
    c.fillStyle = '#c8d8e8';
    c.fillText(status, w / 2, 140);
    c.fillStyle = color;
    for (let i = 0; i < 18; i++) c.fillRect(30 + i * 25, 210 - ((i * 37) % 50), 16, ((i * 37) % 50) + 8);
  });
}

