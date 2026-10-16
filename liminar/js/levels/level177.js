// Nível 177 — "Memórias do Passado", Área 1: corredores roxos, carpete
// violeta e luminárias que deixam tudo num brilho roxo intenso. Em algum lugar
// há uma porta branca. Atrás dela começam as memórias do andarilho — o Mike.
// (Áreas 2 a 5 em level177_park/neon/hill/fog.js.)
import * as THREE from 'three';
import { GridLevel, W, EH } from './grid.js';
import { getTex, indoorEnvTex } from '../textures.js';
import { panelMaterial } from '../materials.js';
import { clamp, fbm, hash3, mulberry32, TAU } from '../util.js';
import { music, preloadTrack, rememberTrack, TRACK_A } from './level177_common.js';

const mod = (a, n) => ((a % n) + n) % n;
const C = 3;

export class Level177 extends GridLevel {
  constructor(game) {
    super(game, {
      cell: C,
      H: 3.0,
      T: 0.16,
      doorW: 1.1,
      doorH: 2.15,
      chunkCells: 8,
      seed: (game.seed ^ 0x177) >>> 0,
      lightRadius: 9,
      lightEmitPow: 1,
      bounce: 0.6,
      ambient: 0.03,
      wallUV: [1.6, 1.6],
      floorUV: 1.2,
      ceilUV: 1.2,
    });
    this.num = 177;
    this.surface = 'carpet';
    this.panelI = 8;
    this.flickerGap = 9;
    this.deadChance = 0.04;
    const S = this.Q.tex;
    const dw = getTex('drywall', S);
    const cp = getTex('carpet', S);
    const ce = getTex('ceiling', S);
    const pn = getTex('panel', S);
    const gr = getTex('grime', S);
    const env = game.makeEnv(indoorEnvTex(['#5a3a78', '#3a2450', '#1a1024'], '#f0d8ff'));
    this.env = env;
    this.mats = {
      floor: { map: cp.map, normalMap: cp.normalMap, normalScale: 0.8, roughness: 0.95, color: 0x8e7ee8, dirtColor: new THREE.Color(0.3, 0.2, 0.36), dirtAmt: 0.4, wet: 0.05 },
      wall: { map: dw.map, normalMap: dw.normalMap, normalScale: 0.6, roughness: 0.85, vertexColors: true, color: 0xb894e0, envMap: env, envIntensity: 0.15 },
      ceil: { map: ce.map, normalMap: ce.normalMap, roughness: 0.95, lmIntensity: 0.45, vertexColors: true, color: 0xd0b8f0 },
      prop: { map: gr.map, normalMap: gr.normalMap, vertexColors: true, roughness: 0.6, envMap: env, envIntensity: 0.4 },
    };
    this.panelMat = panelMaterial(pn.map, 0xe0b0ff);
    this.look = {
      exposure: 1.05,
      tint: [1.02, 0.86, 1.12],
      sat: 1.15,
      contrast: 1.05,
      lift: [0.02, 0.005, 0.035],
      bloom: 0.45,
      bloomThreshold: 0.85,
      fog: [0.2, 0.08, 0.3],
      fogNear: 0.25,
      lightColor: [0.82, 0.55, 1.0],
      flashlight: false,
      ambience: 'level177',
      reverb: 2.2,
      sanityDrain: 0.05,
    };
    this.objectives = [{ id: 'porta', text: 'Encontre a porta branca' }];
    this.route();
  }

  // Corredores: linhas a cada 4 células, colunas a cada 5, e alguns salões.
  corridor(ix, iz) {
    if (mod(iz, 4) === 0 && hash3(Math.floor(ix / 7), iz, this.seed + 1) < 0.88) return true;
    if (mod(ix, 5) === 0 && hash3(ix, Math.floor(iz / 6), this.seed + 2) < 0.7) return true;
    return false;
  }

  hall(ix, iz) {
    return hash3(Math.floor(ix / 3), Math.floor(iz / 3), this.seed + 3) < 0.08;
  }

  open(ix, iz) {
    return this.corridor(ix, iz) || this.hall(ix, iz);
  }

  genEdge(kind, ix, iz) {
    const bx = kind === EH ? ix : ix - 1;
    const bz = kind === EH ? iz - 1 : iz;
    const a = this.open(ix, iz);
    const b = this.open(bx, bz);
    if (a && b) return W.NONE;
    if (!a && !b) return W.NONE;
    return W.FULL;
  }

  genLight(cx, cz) {
    const dc = this.doorCell;
    if (dc && cz === dc[1] && cx === dc[0]) return { x: cx * C + 1.5, z: cz * C + 1.5, y: this.H - 0.02, ax: 0, len: 1.2, wid: 0.6, I: 9, group: 0 };
    if (!this.open(cx, cz) || mod(cx + cz, 2)) return null;
    const h = this.hashCell(cx, cz, 3);
    let group = 0;
    if (h < 0.12) group = 3;
    else if (h < 0.22) group = 1;
    else if (h < 0.3) group = 2;
    return { x: cx * C + 1.5, z: cz * C + 1.5, y: this.H - 0.02, ax: mod(cz, 2) ? 1 : 0, len: 1.2, wid: 0.6, I: 8, group };
  }

  dirt(x, z) {
    const n = fbm(x * 0.15, z * 0.15, 3, this.seed + 11);
    return clamp((n - 0.05) / 0.3, 0, 1);
  }

  route() {
    const rnd = mulberry32(this.seed * 7 + 3);
    this.clearCell(0, 0);
    const a = rnd() * TAU;
    let dx = Math.round(Math.cos(a) * 22);
    const dz = Math.round((Math.sin(a) * 22) / 4) * 4;
    dx = dx === 0 ? 1 : dx;
    this.clearCell(dx, dz);
    this.carve(0, 0, dx, dz, rnd);
    this.doorCell = [dx, dz];
    this.setEdge(EH, dx, dz, W.EXIT);
    this.door = { x: dx * C + 1.5, z: dz * C + this.T / 2 + 0.01 };
    this.exit = { x: this.door.x, z: this.door.z + 0.7 };
    this.spawn = { x: 1.5, z: 1.5, yaw: Math.atan2(-(this.exit.x - 1.5), -(this.exit.z - 1.5)) };
    this.makeDoor();
  }

  // A porta branca: limpa demais para este lugar, com uma luz quente por baixo.
  makeDoor() {
    const d = this.door;
    const g = new THREE.Group();
    const white = new THREE.MeshStandardMaterial({ color: 0xf6f4f2, roughness: 0.35, emissive: 0xd8d2e0 });
    const frame = new THREE.MeshStandardMaterial({ color: 0xe8e2ea, roughness: 0.4, emissive: 0xb8b0c4 });
    const knob = new THREE.MeshStandardMaterial({ color: 0xc8a060, roughness: 0.3, metalness: 0.8 });
    const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 1.9, 1.3) });
    const pivot = new THREE.Group();
    pivot.position.set(-0.53, 0, 0.03);
    const slab = new THREE.Mesh(new THREE.BoxGeometry(1.06, 2.13, 0.05), white);
    slab.position.set(0.53, 1.065, 0);
    const kb = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), knob);
    kb.position.set(0.95, 1.0, 0.05);
    pivot.add(slab, kb);
    for (const s of [-1, 1]) {
      const f = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.25, 0.1), frame);
      f.position.set(s * 0.57, 1.125, 0.05);
      g.add(f);
    }
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.22, 0.08, 0.1), frame);
    top.position.set(0, 2.21, 0.05);
    const line = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.012, 0.02), glow);
    line.position.set(0, 0.008, 0.09);
    // atrás da porta: luz branca
    const back = new THREE.Mesh(new THREE.PlaneGeometry(1.06, 2.13), glow);
    back.position.set(0, 1.065, -0.05);
    back.rotation.y = Math.PI;
    g.add(pivot, top, line, back);
    g.position.set(d.x, 0, d.z);
    this.dynamic.add(g);
    this.doorGroup = g;
    this.doorPivot = pivot;
    this.doorMats = [white, frame, knob, glow];
  }

  async preload(px, pz, progress) {
    await preloadTrack(this.game, TRACK_A);
    return super.preload(px, pz, progress);
  }

  tick(dt, player) {
    const g = this.game;
    this.time = (this.time || 0) + dt;
    music(this, TRACK_A, 0.55);
    if (this.opening) {
      this.openK = Math.min(1, this.openK + dt * 0.8);
      this.doorPivot.rotation.y = this.openK * 1.6;
    }
    if (this.time > 2.5 && !this.said1) {
      this.said1 = true;
      g.hud.say([
        'Roxo… tudo roxo. Por que isso parece tão familiar?',
        'Eu já estive num lugar assim. Não aqui… mas num lugar assim. Quando eu era criança.',
        'Tem alguma coisa me esperando. Eu sinto.',
      ]);
    }
    const p = player.pos;
    if (!this.said2 && Math.hypot(p.x - this.door.x, p.z - this.door.z) < 10) {
      this.said2 = true;
      g.hud.say(['Uma porta branca. Limpa demais pra esse lugar.', 'Tem luz passando por baixo. Uma luz quente… de casa.']);
    }
  }

  interactable(player) {
    const p = player.pos;
    const d = this.door;
    const dx = p.x - d.x;
    const dz = p.z - d.z;
    if (!this.opening && Math.abs(dx) < 1.0 && dz > 0 && dz < 1.7) {
      return {
        label: 'Abrir a porta branca',
        action: () => {
          const g = this.game;
          this.opening = true;
          this.openK = 0;
          g.completeObjective('porta', 'A porta abre para uma luz branca. Do outro lado, cheiro de grama molhada e noite.');
          g.enterLevel('177.2', 'door', 1.0);
        },
      };
    }
    return null;
  }

  navTarget() {
    return this.exit;
  }

  collide(p, r) {
    super.collide(p, r);
    if (!this.opening) {
      const d = this.door;
      const qx = clamp(p.x, d.x - 0.6, d.x + 0.6);
      const qz = clamp(p.z, d.z - 0.02, d.z + 0.1);
      const ddx = p.x - qx;
      const ddz = p.z - qz;
      const dd = Math.hypot(ddx, ddz);
      if (dd < r && dd > 1e-6) {
        p.x = qx + (ddx / dd) * r;
        p.z = qz + (ddz / dd) * r;
      }
    }
    return p;
  }

  groundY() {
    return 0;
  }

  exitEmitter() {
    return { x: this.door.x, y: 1.4, z: this.door.z, sound: 'hum', gain: 0.12 };
  }

  dispose() {
    rememberTrack(this);
    for (const m of this.doorMats) m.dispose();
    this.doorGroup.traverse((o) => o.geometry && o.geometry.dispose());
    this.panelMat.dispose();
    super.dispose();
  }
}
