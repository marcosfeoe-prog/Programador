// Nível 177, Área 3 — corredores de neon colorido, curtos e tortos, como o
// caminho para uma festa. A 50 m, uma porta branca com uma carta pregada:
// "Festa de Mike". É ali que o andarilho lembra o próprio nome.
import * as THREE from 'three';
import { OutdoorLevel } from './outdoor.js';
import { pushCircle } from './grid.js';
import { GeoBuilder } from '../materials.js';
import { TEX } from '../textures.js';
import { mulberry32, TAU } from '../util.js';
import { music, preloadTrack, rememberTrack, TRACK_A, letterTex } from './level177_common.js';

const CS = 2.5; // tamanho da célula
const H = 3.0;
const PATH = [
  [0, 0],
  [0, -6],
  [3, -6],
  [3, -12],
  [-1, -12],
  [-1, -19],
];
const INVITE =
  'FESTA DE MIKE! 🎈 Você está convidado. Sábado, às sete da noite, no alto do morro, perto da fogueira — como todo ano. ' +
  'Vai ter bolo de chocolate, velas e todo mundo cantando desafinado. Não se atrase, aniversariante. A gente te espera. ' +
  '(Se perder o caminho, é só seguir as luzes.)';

export class Level177Neon extends OutdoorLevel {
  constructor(game) {
    super(game, { P: 100, walkSpeed: 2.2, camFar: 300 });
    this.num = 177;
    this.time = 0;
    this.colliders = [];
    this.geos = [];
    this.mats = [];
    this.texs = [];
    this.look = {
      exposure: 1.0,
      tint: [1.02, 0.96, 1.06],
      sat: 1.25,
      contrast: 1.1,
      lift: [0.01, 0.005, 0.02],
      bloom: 0.4,
      bloomThreshold: 0.9,
      fog: [0.02, 0.01, 0.04],
      lightColor: [1, 1, 1],
      flashlight: false,
      ambience: 'level177_3',
      reverb: 2.4,
      sanityDrain: 0.05,
    };
    this.objectives = [
      { id: 'porta', text: 'Siga as luzes até a porta branca' },
      { id: 'carta', text: 'Leia a carta pregada na porta' },
    ];
    this.scene.fog = new THREE.FogExp2(new THREE.Color(...this.look.fog), 0.035);
    this.scene.background = new THREE.Color(...this.look.fog);
    this.hemi = new THREE.HemisphereLight(0x9080b0, 0x302840, 1.4);
    this.scene.add(this.hemi);
    // células abertas, na ordem do caminho
    this.cells = [];
    this.open = new Map();
    for (let k = 0; k < PATH.length - 1; k++) {
      const [x0, z0] = PATH[k];
      const [x1, z1] = PATH[k + 1];
      const n = Math.max(Math.abs(x1 - x0), Math.abs(z1 - z0));
      for (let i = k ? 1 : 0; i <= n; i++) {
        const c = [x0 + Math.sign(x1 - x0) * i, z0 + Math.sign(z1 - z0) * i];
        this.open.set(c[0] + ',' + c[1], this.cells.length);
        this.cells.push(c);
      }
    }
    const last = this.cells[this.cells.length - 1];
    this.door = { x: (last[0] + 0.5) * CS, z: last[1] * CS + 0.02 };
    this.exit = { x: this.door.x, z: this.door.z + 0.8 };
    this.spawn = { x: CS / 2, z: CS / 2, yaw: 0 };
  }

  isOpen(i, j) {
    return this.open.has(i + ',' + j);
  }

  hue(k) {
    const c = new THREE.Color().setHSL((k / this.cells.length) * 0.85 + 0.85, 1, 0.55);
    return [c.r, c.g, c.b];
  }

  async preload(px, pz, progress) {
    await preloadTrack(this.game, TRACK_A);
    progress(0.4);
    this.build();
    this.makeDoor();
    this.makeDecor();
    progress(1);
  }

  build() {
    const gw = new GeoBuilder();
    const gn = new GeoBuilder();
    const dark = [0.16, 0.13, 0.2];
    const quadWall = (ax, az, bx, bz, n, col) => {
      gw.quad(
        [
          [ax, 0, az],
          [bx, 0, bz],
          [bx, H, bz],
          [ax, H, az],
        ],
        n,
        [0, 0, CS, 0, CS, H, 0, H],
        null,
        [col, col, col, col],
      );
    };
    this.cells.forEach(([i, j], k) => {
      const x0 = i * CS;
      const z0 = j * CS;
      const x1 = x0 + CS;
      const z1 = z0 + CS;
      const c = this.hue(k);
      const tint = [dark[0] + c[0] * 0.22, dark[1] + c[1] * 0.22, dark[2] + c[2] * 0.22];
      // piso brilhante e teto
      gw.box(x0 + CS / 2, -0.05, z0 + CS / 2, CS, 0.1, CS, [0.08 + c[0] * 0.06, 0.07 + c[1] * 0.06, 0.1 + c[2] * 0.06], null, { ao: 0 });
      gw.box(x0 + CS / 2, H + 0.05, z0 + CS / 2, CS, 0.1, CS, [0.04, 0.035, 0.05], null, { ao: 0 });
      // faixa de neon no meio do teto
      gn.box(x0 + CS / 2, H - 0.03, z0 + CS / 2, 0.12, 0.04, CS * 0.9, c, null, { ao: 0, rot: this.isOpen(i + 1, j) || this.isOpen(i - 1, j) ? Math.PI / 2 : 0 });
      const edges = [
        [i, j - 1, x0, z0, x1, z0, [0, 0, 1]],
        [i, j + 1, x1, z1, x0, z1, [0, 0, -1]],
        [i - 1, j, x0, z1, x0, z0, [1, 0, 0]],
        [i + 1, j, x1, z0, x1, z1, [-1, 0, 0]],
      ];
      for (const [ni, nj, ax, az, bx, bz, n] of edges) {
        if (this.isOpen(ni, nj)) continue;
        const last = k === this.cells.length - 1 && nj === j - 1;
        if (last) {
          // parede da porta: deixa o vão de 1,1 m
          const mx = (ax + bx) / 2;
          quadWall(ax, az, mx + 0.55 * Math.sign(ax - bx), az, n, tint);
          quadWall(mx - 0.55 * Math.sign(ax - bx), az, bx, bz, n, tint);
          gw.box(mx, (2.2 + H) / 2, az, 1.1, H - 2.2, 0.05, tint, null, { ao: 0 });
          this.colliders.push([ax, mx - 0.55, az - 0.05, az + 0.05], [mx + 0.55, bx, az - 0.05, az + 0.05]);
        } else {
          quadWall(ax, az, bx, bz, n, tint);
          this.colliders.push([Math.min(ax, bx) - (n[0] ? 0.05 : 0), Math.max(ax, bx) + (n[0] ? 0.05 : 0), Math.min(az, bz) - (n[2] ? 0.05 : 0), Math.max(az, bz) + (n[2] ? 0.05 : 0)]);
        }
        // tubos de neon no alto e no rodapé da parede
        const off = 0.04;
        const cx = (ax + bx) / 2 + n[0] * off;
        const cz = (az + bz) / 2 + n[2] * off;
        const sx = n[0] ? 0.05 : CS;
        const sz = n[0] ? CS : 0.05;
        gn.box(cx, H - 0.25, cz, sx, 0.05, sz, c, null, { ao: 0 });
        gn.box(cx, 0.12, cz, sx, 0.04, sz, c, null, { ao: 0 });
      }
    });
    this.wallMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0 });
    this.neonMat = new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(2.2, 2.2, 2.2) });
    this.mats.push(this.wallMat, this.neonMat);
    this.walls = new THREE.Mesh(gw.build(), this.wallMat);
    this.neon = new THREE.Mesh(gn.build(), this.neonMat);
    this.geos.push(this.walls.geometry, this.neon.geometry);
    this.scene.add(this.walls, this.neon);
    // algumas luzes coloridas pelo caminho
    this.lights = [];
    for (let k = 2; k < this.cells.length; k += 5) {
      const [i, j] = this.cells[k];
      const c = this.hue(k);
      const l = new THREE.PointLight(new THREE.Color(...c), 6, 9, 1.4);
      l.position.set((i + 0.5) * CS, H - 0.6, (j + 0.5) * CS);
      this.dynamic.add(l);
      this.lights.push({ l, k });
    }
  }

  makeDoor() {
    const d = this.door;
    const g = new THREE.Group();
    const white = this.mat(new THREE.MeshStandardMaterial({ color: 0xf6f4f2, roughness: 0.35, emissive: 0x302c30 }));
    const frame = this.mat(new THREE.MeshStandardMaterial({ color: 0xe8e2ea, roughness: 0.4 }));
    const knob = this.mat(new THREE.MeshStandardMaterial({ color: 0xc8a060, roughness: 0.3, metalness: 0.8 }));
    const pivot = new THREE.Group();
    pivot.position.set(-0.53, 0, 0);
    const slab = new THREE.Mesh(new THREE.BoxGeometry(1.06, 2.15, 0.05), white);
    slab.position.set(0.53, 1.075, 0);
    const kb = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), knob);
    kb.position.set(0.95, 1.0, 0.05);
    // a carta pregada
    const lt = letterTex(['Festa de', 'Mike!', '', 'sábado, 19h', 'no alto do morro'], { font: 'italic bold 34px Georgia, serif' });
    this.texs.push(lt);
    const letter = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.5), this.mat(new THREE.MeshStandardMaterial({ map: lt, roughness: 0.8, emissive: 0x403830, emissiveMap: lt })));
    letter.position.set(0.53, 1.45, 0.03);
    letter.rotation.z = 0.05;
    const pin = new THREE.Mesh(new THREE.SphereGeometry(0.012, 6, 4), knob);
    pin.position.set(0.53, 1.64, 0.04);
    pivot.add(slab, kb, letter, pin);
    for (const s of [-1, 1]) {
      const f = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.25, 0.1), frame);
      f.position.set(s * 0.58, 1.125, 0.02);
      g.add(f);
    }
    const glow = this.mat(new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 1.6, 1.0) }));
    const back = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 2.2), glow);
    back.position.set(0, 1.1, -0.06);
    g.add(pivot, back);
    g.position.set(d.x, 0, d.z);
    this.dynamic.add(g);
    this.doorGroup = g;
    this.doorPivot = pivot;
  }

  mat(m) {
    this.mats.push(m);
    return m;
  }

  // Confete no chão, balões perto da porta e um letreiro de neon.
  makeDecor() {
    const r = mulberry32(1777);
    const n = 260;
    const geo = new THREE.PlaneGeometry(0.035, 0.05);
    geo.rotateX(-Math.PI / 2);
    this.geos.push(geo);
    const cm = this.mat(new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }));
    const conf = new THREE.InstancedMesh(geo, cm, n);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const v = new THREE.Vector3();
    const s = new THREE.Vector3(1, 1, 1);
    const col = new THREE.Color();
    for (let k = 0; k < n; k++) {
      const [i, j] = this.cells[Math.floor(r() * this.cells.length)];
      m.compose(v.set((i + r()) * CS, 0.006, (j + r()) * CS), q.setFromEuler(e.set(0, r() * TAU, 0)), s);
      conf.setMatrixAt(k, m);
      conf.setColorAt(k, col.setHSL(r(), 0.9, 0.6));
    }
    this.scene.add(conf);
    this.confetti = conf;
    // balões
    const d = this.door;
    const cols = [0xff6fb0, 0x6fd8ff, 0xfff06a, 0xb08aff];
    this.balloons = [];
    for (let k = 0; k < 6; k++) {
      const bm = this.mat(new THREE.MeshStandardMaterial({ color: cols[k % 4], roughness: 0.25, emissive: cols[k % 4], emissiveIntensity: 0.25 }));
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 10), bm);
      this.geos.push(b.geometry);
      const side = k < 3 ? -1 : 1;
      b.position.set(d.x + side * (0.85 + (k % 3) * 0.12), 2.35 + (k % 3) * 0.2, d.z + 0.2 + (k % 2) * 0.12);
      b.scale.y = 1.2;
      this.dynamic.add(b);
      this.balloons.push({ b, y: b.position.y, k });
    }
    // letreiro "feliz aniversário" na parede do meio do caminho
    const c = TEX.makeCanvas(512, 128);
    const x = c.getContext('2d');
    x.fillStyle = '#000';
    x.fillRect(0, 0, 512, 128);
    x.font = 'italic bold 56px "Brush Script MT", "Comic Sans MS", cursive';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.shadowColor = '#ff4fd8';
    x.shadowBlur = 18;
    x.fillStyle = '#ffd6f6';
    x.fillText('feliz aniversário', 256, 66);
    const st = TEX.toTex(c, { repeat: false });
    this.texs.push(st);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 0.5), this.mat(new THREE.MeshBasicMaterial({ map: st, color: new THREE.Color(1.8, 1.8, 1.8), blending: THREE.AdditiveBlending, transparent: true })));
    // parede do fundo do primeiro trecho (célula 0,-6 olhando para -z)
    sign.position.set(CS / 2, 1.9, -6 * CS + 0.06);
    this.dynamic.add(sign);
    this.sign = sign;
    this.geos.push(sign.geometry);
  }

  update(dt, player) {
    const g = this.game;
    const p = player.pos;
    this.time += dt;
    const t = this.time;
    // neon pulsando e luzes "correndo"
    this.neonMat.color.setScalar(1.9 + Math.sin(t * 2.2) * 0.35);
    for (const L of this.lights) L.l.intensity = 5 + Math.sin(t * 3 + L.k) * 2;
    for (const B of this.balloons) B.b.position.y = B.y + Math.sin(t * 1.1 + B.k) * 0.05;
    if (this.opening) {
      this.openK = Math.min(1, this.openK + dt * 0.8);
      this.doorPivot.rotation.y = this.openK * 1.6;
    }
    const tr = music(this, TRACK_A, 0.55);
    if (tr && !this.musSet) {
      this.musSet = true;
      tr.setRate(0.8, 2);
      tr.setFx(0.7, 2);
    }
    if (t > 2 && !this.said.has('a')) this.say('a', ['Neon… parece uma festa. Uma festa sem ninguém.', 'Essas cores… eu lembro das luzes piscando. E de gente cantando.']);
    if (p.z < -5 * CS && p.z > -7 * CS) this.say('b', ['“Feliz aniversário”… pra quem?']);
    if (Math.hypot(p.x - this.door.x, p.z - this.door.z) < 6) {
      this.say('c', ['Uma carta pregada na porta.']);
      if (!g.objectiveDone('porta')) g.completeObjective('porta');
    }
    // depois de ler a carta
    if (this.reading && !g.hud.noteOpen) {
      this.reading = false;
      if (!g.objectiveDone('carta')) {
        g.completeObjective('carta', 'O convite é para você.');
        this.said.delete('d');
        g.mikeNamed = true;
        this.say('d', ['Festa de Mike…', 'Mike. Esse… esse sou eu. Meu nome é Mike.', 'Eu tinha esquecido o meu próprio nome.'], true);
      }
    }
  }

  get said() {
    if (!this._said) this._said = new Set();
    return this._said;
  }

  say(id, lines, force = false) {
    const g = this.game;
    if (this.said.has(id) || (g.hud.dlg && !force)) return false;
    this.said.add(id);
    g.hud.say(lines, null, g.mikeNamed ? 'MIKE' : 'VOCÊ');
    return true;
  }

  collide(p, r) {
    for (let it = 0; it < 2; it++) {
      for (const b of this.colliders) if (p.x > b[0] - 1 && p.x < b[1] + 1 && p.z > b[2] - 1 && p.z < b[3] + 1) pushCircle(p, r, b[0], b[1], b[2], b[3]);
      if (!this.opening) pushCircle(p, r, this.door.x - 0.6, this.door.x + 0.6, this.door.z - 0.05, this.door.z + 0.05);
    }
    // nunca sair das células
    const i = Math.floor(p.x / CS);
    const j = Math.floor(p.z / CS);
    if (!this.isOpen(i, j) && this.okP) {
      p.x = this.okP.x;
      p.z = this.okP.z;
    }
    this.okP = { x: p.x, z: p.z };
    return p;
  }

  groundY() {
    return 0;
  }

  surfaceAt() {
    return 'tile';
  }

  los() {
    return true;
  }

  lightLevel() {
    return 0.8;
  }

  interactable(player) {
    const g = this.game;
    const p = player.pos;
    const d = this.door;
    if (this.opening || Math.abs(p.x - d.x) > 1.0 || p.z - d.z < 0 || p.z - d.z > 1.8) return null;
    if (!g.objectiveDone('carta'))
      return {
        label: 'Ler a carta',
        action: () => {
          g.audio.paper();
          g.hud.showNote(INVITE);
          this.reading = true;
        },
      };
    return {
      label: 'Abrir a porta',
      action: () => {
        this.opening = true;
        this.openK = 0;
        g.enterLevel('177.4', 'door', 1.0);
      },
    };
  }

  navTarget() {
    return this.exit;
  }

  dispose() {
    rememberTrack(this);
    super.dispose();
    this.scene.remove(this.walls, this.neon, this.confetti, this.hemi);
    this.confetti.dispose();
    this.doorGroup.traverse((o) => o.geometry && o.geometry.dispose());
    for (const x of this.geos) x.dispose();
    for (const m of this.mats) m.dispose();
    for (const t of this.texs) t.dispose();
  }
}
