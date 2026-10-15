// Nível 5 — as três portas que abrem (além da 595, a saída):
//  • 333: um quarto vazio com uma carta na mesa sobre os segredos do hotel.
//  • 472: uma escada que desce ao subsolo — outro hotel, mais velho, com
//    corredores longos de paredes verdes e carpete azul.
//  • 666: corredores escuros de azulejo e quartzo. Alucinações e barulhos.
//    Em algum lugar do labirinto, um radar de entidades.
// Cada área é construída longe da grade do hotel (luz assada nos vértices)
// e o jogador é levado até ela com um escurecimento.
import * as THREE from 'three';
import { CellArea, bakedMaterial } from './area.js';
import { GeoBuilder } from '../materials.js';
import { getTex } from '../textures.js';
import { mulberry32, TAU } from '../util.js';
import { guestFaceURL } from './level5_tex.js';
import './level37_tex.js';

const LETTER = [
  'Para quem abriu a 333: este é o único quarto do hotel que fica vazio de propósito. Eu fiquei aqui tempo demais para não perceber. O hotel guarda os segredos nos números das portas. Quase todas ficam trancadas para sempre. Quatro não.',
  'Primeiro, o Hóspede. Ele não anda enquanto alguém olha para ele. Ele não tem pressa, e não precisa ter: o corredor é dele. Nos corredores longos, ande de costas se precisar, mas não deixe de olhar. Quando as luzes tremem, ele está perto.',
  'A 595 é a saída verdadeira. A chave fica na recepção, mas a porta não cede enquanto as caldeiras estiverem acesas. Feche as três válvulas lá embaixo, no fundo do hotel, e a fechadura estala sozinha. Eu ouvi esse estalo uma vez. Não tive coragem de ir.',
  'A 472 desce. Embaixo do hotel existe outro hotel, mais velho, de paredes verdes e carpete azul. Os corredores são compridos demais. O jazz chega lá abafado, como se viesse do teto. Ninguém se hospeda no subsolo. Mas alguém deixou o livro de registros aberto.',
  'A 666 não é um quarto. É azulejo e quartzo, no escuro. Lá dentro você vai ver gente que não está lá e ouvir o seu nome. Não acredite em nada. Mas alguém largou lá no fundo um radar que mostra as coisas que nos caçam. Vale o susto. — M., hóspede do 333',
];

const REGISTRY =
  'Livro de registros do subsolo. As assinaturas param em 1931. A última linha diz: "Quarto 472 — hóspede desceu e não subiu. Conta em aberto." Embaixo, com outra letra: "Se você leu isto, suba. O Hóspede não desce até aqui, mas o tempo desce."';

function tex(Q, name) {
  return getTex(name, Q.tex);
}

// Cópia de uma textura com as cores trocadas (ex.: damasco vermelho → verde).
function recolor(t, fn) {
  const img = t.image;
  const cv = document.createElement('canvas');
  cv.width = img.width;
  cv.height = img.height;
  const c = cv.getContext('2d');
  c.drawImage(img, 0, 0);
  const d = c.getImageData(0, 0, cv.width, cv.height);
  const a = d.data;
  for (let i = 0; i < a.length; i += 4) {
    const [r, g, b] = fn(a[i], a[i + 1], a[i + 2]);
    a[i] = r;
    a[i + 1] = g;
    a[i + 2] = b;
  }
  c.putImageData(d, 0, 0);
  const out = new THREE.CanvasTexture(cv);
  out.colorSpace = t.colorSpace;
  out.wrapS = t.wrapS;
  out.wrapT = t.wrapT;
  out.anisotropy = t.anisotropy;
  return out;
}

// ------------------------------------------------------------ base
class Area {
  constructor(level, cfg) {
    this.L = level;
    this.game = level.game;
    this.Q = level.Q;
    this.area = new CellArea(level.game, cfg);
    this.mats = [];
    this.disposables = [];
  }

  mat(o) {
    const m = bakedMaterial(this.Q, o);
    this.mats.push(m);
    return m;
  }

  props(fn, mat, y = 1.0) {
    const gb = new GeoBuilder();
    fn(gb, this.area.lmAt(y));
    return this.area.addMesh(gb, mat);
  }

  show(on) {
    this.area.group.visible = on;
  }

  collide(p, r) {
    return this.area.collide(p, r);
  }

  lightLevel(x, z) {
    return this.area.lightLevel(x, z);
  }

  los(x0, z0, x1, z1) {
    return this.area.los(x0, z0, x1, z1);
  }

  near(player, x, z, r) {
    return Math.hypot(player.pos.x - x, player.pos.z - z) < r;
  }

  exitAction(player) {
    const e = this.back;
    if (!this.near(player, e.x, e.z, 1.4)) return null;
    return { label: e.label, action: () => this.L.leaveArea() };
  }

  update() {}

  dispose() {
    this.area.dispose();
    for (const m of this.mats) m.dispose();
    for (const d of this.disposables) d.dispose();
  }
}

// ------------------------------------------------------------ 333
export class Room333 extends Area {
  constructor(level) {
    const Q = level.Q;
    const c = 1.25;
    const ox = 5000;
    const oz = 5000;
    const H = 3.2;
    const open = [];
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) open.push([i, j]);
    super(level, {
      ox,
      oz,
      cell: c,
      H,
      open,
      lights: [{ x: ox + 2.5, y: H - 0.5, z: oz + 2.7, I: 7 }],
      ambient: 0.05,
      wall: { uvW: 1.3, uvH: 3.6, tint: [0.95, 0.88, 0.8] },
      floor: { uv: 1.3, tint: [0.9, 0.85, 0.8] },
      ceil: { uv: 2.6, tint: [0.85, 0.82, 0.78] },
    });
    const A = this.area;
    const dam = tex(Q, 'l5Damask');
    const par = tex(Q, 'l5Parquet');
    const pla = tex(Q, 'l5Plaster');
    const wood = tex(Q, 'l5Wood');
    A.wall.mat = this.mat({ map: dam.map, normalMap: dam.normalMap, roughness: 0.75, light: [1, 0.82, 0.6] });
    A.floor.mat = this.mat({ map: par.map, normalMap: par.normalMap, roughness: 0.5, light: [1, 0.82, 0.6] });
    A.ceil.mat = this.mat({ map: pla.map, roughness: 0.95, light: [1, 0.82, 0.6] });
    A.build();
    const woodMat = this.mat({ map: wood.map, normalMap: wood.normalMap, roughness: 0.4, light: [1, 0.82, 0.6] });
    const tx = ox + 2.5;
    const tz = oz + 3.4;
    this.table = { x: tx, z: tz };
    this.props((gb, lm) => {
      const W = [0.55, 0.36, 0.22];
      gb.box(tx, 0.74, tz, 1.2, 0.05, 0.7, W, lm, {});
      for (const [a, b] of [
        [-0.54, -0.3],
        [0.54, -0.3],
        [-0.54, 0.3],
        [0.54, 0.3],
      ])
        gb.box(tx + a, 0.36, tz + b, 0.05, 0.72, 0.05, W, lm, {});
      // cadeira
      gb.box(tx, 0.45, tz - 0.75, 0.45, 0.04, 0.42, W, lm, {});
      gb.box(tx, 0.7, tz - 0.96, 0.45, 0.5, 0.04, W, lm, {});
      for (const [a, b] of [
        [-0.2, -0.56],
        [0.2, -0.56],
        [-0.2, -0.94],
        [0.2, -0.94],
      ])
        gb.box(tx + a, 0.22, tz + b, 0.04, 0.45, 0.04, W, lm, {});
      // a carta
      gb.box(tx + 0.1, 0.772, tz - 0.05, 0.22, 0.004, 0.3, [1.4, 1.35, 1.2], lm, { rot: 0.25, ao: 0 });
      // porta de volta (parede sul) e luminária pendente
      gb.box(ox + 2.5, 1.08, oz + 0.04, 1.0, 2.16, 0.06, [0.42, 0.24, 0.13], lm, {});
      gb.box(ox + 2.88, 1.05, oz + 0.09, 0.06, 0.06, 0.06, [0.9, 0.7, 0.3], lm, {});
      gb.box(ox + 2.5, H - 0.25, oz + 2.7, 0.02, 0.5, 0.02, [0.1, 0.1, 0.1], lm, {});
      // quadro torto e um armário vazio aberto
      gb.box(ox + 4.96, 1.7, oz + 2.5, 0.04, 0.6, 0.8, [0.3, 0.2, 0.12], lm, { rot: 0.05 });
      gb.box(ox + 0.35, 1.05, oz + 4.6, 0.7, 2.1, 0.7, [0.4, 0.26, 0.15], lm, {});
    }, woodMat);
    A.extra.push([tx - 0.62, tx + 0.62, tz - 0.38, tz + 0.38], [ox + 0, ox + 0.72, oz + 4.24, oz + 5]);
    // lâmpada acesa
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.4, 1.6) }));
    bulb.position.set(ox + 2.5, H - 0.55, oz + 2.7);
    A.group.add(bulb);
    this.disposables.push(bulb.geometry, bulb.material);
    this.entry = { x: ox + 2.5, z: oz + 0.9, yaw: Math.PI };
    this.back = { x: ox + 2.5, z: oz + 0.6, label: 'Voltar ao corredor do hotel' };
    this.surface = 'wood';
  }

  interactable(player) {
    if (this.near(player, this.table.x, this.table.z, 1.45)) return { label: 'Ler a carta', action: () => this.read(0) };
    return this.exitAction(player);
  }

  read(page) {
    const g = this.game;
    if (page === 0) g.audio.paper();
    const last = page === LETTER.length - 1;
    g.hud.dialog(`Carta (${page + 1}/${LETTER.length})`, LETTER[page], [
      last ? { text: 'Dobrar a carta', fn: () => this.done() } : { text: 'Continuar lendo…', fn: () => this.read(page + 1) },
      { text: 'Parar de ler', fn: () => g.hud.closeDialog() },
    ]);
  }

  done() {
    const g = this.game;
    g.hud.closeDialog();
    if (!this.readAll) {
      this.readAll = true;
      g.addSanity(10);
      g.hud.message('Você dobra a carta. Os segredos do Nível 5: 595, 472 e 666. (+Sanidade)', 5);
    }
  }

  navTarget() {
    return this.readAll ? this.back : this.table;
  }

  update() {
    this.L.sanityExtra = -0.6;
  }
}

// ------------------------------------------------------------ 472
export class Under472 extends Area {
  constructor(level) {
    const Q = level.Q;
    const c = 2.6;
    const ox = 6000;
    const oz = 5000;
    const H = 3.2;
    const set = new Map();
    const add = (i, j) => set.set(`${i},${j}`, [i, j]);
    for (const j of [0, 6, 12]) for (let i = 0; i <= 36; i++) add(i, j);
    for (const i of [0, 12, 24, 36]) for (let j = 0; j <= 12; j++) add(i, j);
    add(-1, 6);
    add(-2, 6);
    const rnd = mulberry32(472);
    const lights = [];
    const sconces = [];
    for (const [i, j] of set.values()) {
      if (i < 0 || (i + j) % 3) continue;
      if (rnd() < 0.22) continue; // lâmpada queimada
      const x = ox + (i + 0.5) * c;
      const z = oz + (j + 0.5) * c;
      lights.push({ x, y: 2.4, z, I: 3.4 });
      sconces.push([x, z]);
    }
    lights.push({ x: ox - 1.2 * c, y: 2.4, z: oz + 6.5 * c, I: 4 });
    super(level, {
      ox,
      oz,
      cell: c,
      H,
      open: [...set.values()],
      lights,
      ambient: 0.02,
      wall: { uvW: 1.3, uvH: 3.6, tint: [0.9, 0.95, 0.9] },
      floor: { uv: 1.3, tint: [0.9, 0.9, 1.0] },
      ceil: { uv: 2.6, tint: [0.7, 0.72, 0.66] },
    });
    const A = this.area;
    const dam = tex(Q, 'l5Damask');
    const car = tex(Q, 'l5Carpet');
    const pla = tex(Q, 'l5Plaster');
    const wood = tex(Q, 'l5Wood');
    const lt = [1, 0.8, 0.55];
    // paredes verde-musgo e carpete azul: as do hotel lá de cima, com as cores trocadas
    const green = recolor(dam.map, (r, g, b) => [g * 0.8, r * 0.95, b * 0.8]);
    const blue = recolor(car.map, (r, g, b) => [b * 0.9, g * 0.95, r * 1.05]);
    this.disposables.push(green, blue);
    A.wall.mat = this.mat({ map: green, normalMap: dam.normalMap, roughness: 0.75, light: lt });
    A.floor.mat = this.mat({ map: blue, normalMap: car.normalMap, roughness: 0.97, light: lt });
    A.ceil.mat = this.mat({ map: pla.map, roughness: 0.95, light: lt });
    A.build();
    const woodMat = this.mat({ map: wood.map, normalMap: wood.normalMap, roughness: 0.4, light: lt });
    // portas trancadas ao longo dos corredores e a escada de volta
    this.props((gb, lm) => {
      for (const [i, j] of set.values()) {
        if (i < 0 || i % 2) continue;
        for (const s of [-1, 1]) {
          if (A.isOpen(i, j + s)) continue;
          if (j % 6) continue;
          const x = ox + (i + 0.5) * c;
          const z = oz + (j + 0.5) * c + s * (c / 2 - 0.03);
          gb.box(x, 1.1, z, 1.0, 2.2, 0.06, [0.3, 0.18, 0.1], lm, {});
          gb.box(x, 1.85, z - s * 0.04, 0.16, 0.08, 0.02, [0.9, 0.7, 0.3], lm, { ao: 0 });
          gb.box(x + 0.36, 1.05, z - s * 0.05, 0.05, 0.05, 0.05, [0.9, 0.7, 0.3], lm, { ao: 0 });
        }
      }
      // escada subindo (oeste)
      const sx = ox - 2 * c;
      const sz = oz + 6.5 * c;
      for (let k = 0; k < 8; k++) gb.box(sx + 0.2 + k * 0.32 - 0.5, 0.1 + k * 0.2, sz, 0.34, 0.2 + k * 0.4, c - 0.1, [0.35, 0.22, 0.14], lm, {});
      // mesa com o livro de registros (fim leste)
      const dx = ox + 36.5 * c;
      const dz = oz + 6.5 * c;
      gb.box(dx, 0.5, dz, 0.8, 1.0, 1.6, [0.4, 0.25, 0.14], lm, {});
      gb.box(dx, 1.03, dz, 0.4, 0.05, 0.55, [0.55, 0.15, 0.1], lm, { rot: 0.2 });
    }, woodMat);
    // arandelas acesas
    const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 1.7, 0.9) });
    const gg = new THREE.SphereGeometry(0.06, 8, 6);
    this.disposables.push(glow, gg);
    for (const [x, z] of sconces) {
      const m = new THREE.Mesh(gg, glow);
      m.position.set(x, H - 0.12, z);
      A.group.add(m);
    }
    this.desk = { x: ox + 36.5 * c - 0.8, z: oz + 6.5 * c };
    A.extra.push([this.desk.x + 0.4, this.desk.x + 1.2, this.desk.z - 0.8, this.desk.z + 0.8]);
    this.entry = { x: ox + 0.5 * c, z: oz + 6.5 * c, yaw: -Math.PI / 2 };
    this.back = { x: ox - 1.0 * c, z: oz + 6.5 * c, label: 'Subir a escada de volta ao hotel' };
    this.surface = 'carpet';
    // itens: água e bilhetes
    this.items = [
      { type: 'water', key: '5:472:w1', x: ox + 12.5 * c, z: oz + 2.3 * c },
      { type: 'water', key: '5:472:w2', x: ox + 30.5 * c, z: oz + 12.5 * c },
      { type: 'note', key: '5:472:n1', x: ox + 24.5 * c, z: oz + 0.5 * c, rot: 1 },
    ];
  }

  enter() {
    const g = this.game;
    for (const it of this.items) if (!this.L.taken.has(it.key) && !it.spawned) {
      it.spawned = true;
      it.light = 0.6;
      g.items.spawn(it, this.area.group);
    }
    if (!this.jazz) this.jazz = g.audio.positional('jazz', this.area.ox + 18 * 2.6, 6, this.area.oz + 6 * 2.6, { gain: 0.28, rate: 0.72, ref: 6, rolloff: 0.6, wet: 1 });
    g.audio.setMuffle(0.6);
  }

  leave() {
    if (this.jazz) {
      this.jazz.stop();
      this.jazz = null;
    }
    this.game.audio.setMuffle(0);
  }

  interactable(player) {
    if (this.near(player, this.desk.x, this.desk.z, 1.5))
      return {
        label: 'Ler o livro de registros',
        action: () => {
          this.game.audio.paper();
          this.game.hud.showNote(REGISTRY);
          if (!this.readReg) {
            this.readReg = true;
            this.game.addSanity(6);
          }
        },
      };
    return this.exitAction(player);
  }

  navTarget() {
    return this.readReg ? this.back : this.desk;
  }

  update() {
    this.L.sanityExtra = 0.05;
  }
}

// ------------------------------------------------------------ 666
export class Quartz666 extends Area {
  constructor(level) {
    const Q = level.Q;
    const c = 2.8;
    const ox = 7000;
    const oz = 5000;
    const H = 3.0;
    const N = 8; // nós do labirinto (N × N)
    const rnd = mulberry32(666);
    const open = new Map();
    const add = (i, j) => open.set(`${i},${j}`, [i, j]);
    // labirinto (busca em profundidade)
    const seen = new Set(['0,0']);
    const stack = [[0, 0]];
    const parent = new Map();
    add(0, 0);
    while (stack.length) {
      const [a, b] = stack[stack.length - 1];
      const nb = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]
        .map(([da, db]) => [a + da, b + db, da, db])
        .filter(([na, nb2]) => na >= 0 && nb2 >= 0 && na < N && nb2 < N && !seen.has(`${na},${nb2}`));
      if (!nb.length) {
        stack.pop();
        continue;
      }
      const [na, nb2, da, db] = nb[Math.floor(rnd() * nb.length)];
      seen.add(`${na},${nb2}`);
      parent.set(`${na},${nb2}`, [a, b]);
      add(na * 2, nb2 * 2);
      add(a * 2 + da, b * 2 + db);
      stack.push([na, nb2]);
    }
    // alguns atalhos para não ser só becos
    for (let k = 0; k < 6; k++) {
      const a = Math.floor(rnd() * (N - 1));
      const b = Math.floor(rnd() * N);
      if (rnd() < 0.5) add(a * 2 + 1, b * 2);
      else add(b * 2, a * 2 + 1);
    }
    add(0, -1);
    // nó mais distante (por caminho) = onde está o radar
    const depth = (key) => {
      let d = 0;
      let k = key;
      while (parent.has(k)) {
        const p = parent.get(k);
        k = `${p[0]},${p[1]}`;
        d++;
      }
      return d;
    };
    let far = [0, 0];
    let fd = -1;
    for (const k of seen) {
      const d = depth(k);
      if (d > fd) {
        fd = d;
        far = k.split(',').map(Number);
      }
    }
    // quartzo: aglomerados em algumas células, cada um com um brilho fraco
    const clusters = [];
    const lights = [];
    for (const [i, j] of open.values()) {
      if (j < 0 || rnd() > 0.2) continue;
      const x = ox + (i + 0.2 + rnd() * 0.6) * c;
      const z = oz + (j + 0.2 + rnd() * 0.6) * c;
      clusters.push([x, z, 0.6 + rnd() * 0.8, rnd()]);
      lights.push({ x, y: 0.6, z, I: 0.9 });
    }
    super(level, {
      ox,
      oz,
      cell: c,
      H,
      open: [...open.values()],
      lights,
      ambient: 0.006,
      radius: 7,
      wall: { uvW: 1.4, uvH: 1.4, tint: [0.62, 0.64, 0.68] },
      floor: { uv: 1.4, tint: [0.5, 0.5, 0.54] },
      ceil: { uv: 1.4, tint: [0.4, 0.4, 0.44] },
    });
    const A = this.area;
    const tile = tex(Q, 'l37Tile');
    const grey = tex(Q, 'l37Grey');
    const lt = [0.8, 0.7, 1.0];
    A.wall.mat = this.mat({ map: tile.map, normalMap: tile.normalMap, roughness: 0.25, metalness: 0.05, light: lt, envMap: level.env, envIntensity: 0.5 });
    A.floor.mat = this.mat({ map: grey.map, normalMap: grey.normalMap, roughness: 0.3, light: lt, envMap: level.env, envIntensity: 0.5 });
    A.ceil.mat = this.mat({ map: tile.map, roughness: 0.5, light: lt });
    A.build();
    // cristais de quartzo
    const qb = new GeoBuilder();
    const cone = new THREE.ConeGeometry(1, 1, 6);
    cone.translate(0, 0.5, 0);
    const m4 = new THREE.Matrix4();
    for (const [x, z, s, r] of clusters) {
      const n = 3 + Math.floor(r * 5);
      for (let k = 0; k < n; k++) {
        const a = (k / n) * TAU + r * 4;
        const h = s * (0.5 + ((k * 37) % 10) / 12);
        const w = 0.06 + (h * 0.12);
        const tilt = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.sin(a) * 0.45, 0, Math.cos(a) * 0.45));
        m4.compose(new THREE.Vector3(x + Math.cos(a) * 0.12, 0, z + Math.sin(a) * 0.12), tilt, new THREE.Vector3(w, h, w));
        const tone = 0.75 + ((k * 13) % 7) / 25;
        qb.addGeometry(cone, m4, [tone, tone * 0.85, tone * 0.95]);
      }
    }
    cone.dispose();
    this.quartzMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.12, metalness: 0.1, transparent: true, opacity: 0.86, emissive: new THREE.Color(0.35, 0.22, 0.4), envMap: level.env || null });
    this.mats.push(this.quartzMat);
    const qgeo = qb.build();
    this.disposables.push(qgeo);
    A.group.add(new THREE.Mesh(qgeo, this.quartzMat));
    for (const [x, z] of clusters) A.extra.push([x - 0.22, x + 0.22, z - 0.22, z + 0.22]);
    // porta de volta (sul da entrada)
    const doorMat = this.mat({ color: 0xffffff, light: lt });
    this.props((gb, lm) => {
      gb.box(ox + c / 2, 1.08, oz - c + 0.04, 1.0, 2.16, 0.06, [0.25, 0.08, 0.06], lm, {});
      gb.box(ox + c / 2 + 0.36, 1.05, oz - c + 0.09, 0.05, 0.05, 0.05, [0.7, 0.6, 0.3], lm, {});
    }, doorMat);
    // a silhueta das alucinações
    const fm = new THREE.MeshBasicMaterial({ color: 0x020202, transparent: true, opacity: 0 });
    const fig = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 1.1, 4, 8), fm);
    body.position.y = 0.95;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), fm);
    head.position.y = 1.78;
    fig.add(body, head);
    fig.visible = false;
    A.group.add(fig);
    this.fig = fig;
    this.figMat = fm;
    this.disposables.push(fm, body.geometry, head.geometry);
    this.radarPos = { x: ox + (far[0] * 2 + 0.5) * c, z: oz + (far[1] * 2 + 0.5) * c };
    this.entry = { x: ox + c / 2, z: oz - c + 0.9, yaw: Math.PI };
    this.back = { x: ox + c / 2, z: oz - c + 0.6, label: 'Sair pela porta 666' };
    this.surface = 'tile';
    this.halT = 6;
    this.cool = 0;
  }

  enter() {
    const g = this.game;
    this.prevFlash = g.player.flashOn;
    g.player.flashOn = true;
    if (!this.L.taken.has('5:radar') && !this.radarSpawned) {
      this.radarSpawned = true;
      const R = this.radarPos;
      g.items.spawn(
        {
          type: 'key',
          key: '5:radar',
          x: R.x,
          z: R.z,
          y: 0.02,
          label: 'Pegar o radar de entidades',
          makeMesh: (it) => this.radarMesh(it),
          onUse: (game) => {
            game.inventory.add('radar');
            game.audio.play('beep', { gain: 0.4, rate: 1.4 });
            game.hud.message('Um radar de entidades! Pontos vermelhos mostram o que caça você — em qualquer nível. Ele fica na mochila.', 6);
          },
        },
        this.area.group,
      );
    }
  }

  leave() {
    this.game.player.flashOn = this.prevFlash;
    this.fig.visible = false;
  }

  radarMesh(it) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 0.22), new THREE.MeshStandardMaterial({ color: 0x2a3a30, roughness: 0.5, emissive: 0x0a140e }));
    const scr = new THREE.Mesh(new THREE.CircleGeometry(0.055, 20), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 2.2, 0.9) }));
    scr.rotation.x = -Math.PI / 2;
    scr.position.set(0, 0.026, -0.02);
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.18, 5), body.material);
    ant.position.set(0.06, 0.1, 0.09);
    g.add(body, scr, ant);
    g.position.set(it.x, 0.03, it.z);
    g.rotation.y = 0.6;
    this.area.group.add(g);
    this.radarScr = scr;
    this.disposables.push(body.geometry, body.material, scr.geometry, scr.material, ant.geometry);
    return g;
  }

  interactable(player) {
    return this.exitAction(player);
  }

  navTarget() {
    return this.L.taken.has('5:radar') ? this.back : this.radarPos;
  }

  // Alucinações: vultos, sussurros, batidas, passos, estática e quartzo pulsando.
  update(dt, player) {
    const g = this.game;
    const P = player.pos;
    this.L.sanityExtra = 0.32;
    this.cool -= dt;
    const t = g.time;
    this.quartzMat.emissiveIntensity = 0.8 + Math.sin(t * 1.3) * 0.25 + (this.flare > 0 ? this.flare * 3 : 0);
    this.flare = Math.max(0, (this.flare || 0) - dt);
    if (this.radarScr) this.radarScr.material.color.setRGB(0.3, 1.6 + Math.sin(t * 6) * 0.8, 0.9);
    // vulto: some quando é encarado ou depois de um tempo
    if (this.fig.visible) {
      this.figT -= dt;
      const dx = this.fig.position.x - P.x;
      const dz = this.fig.position.z - P.z;
      const d = Math.hypot(dx, dz);
      const f = (-dx * Math.sin(player.yaw) - dz * Math.cos(player.yaw)) / Math.max(d, 0.01);
      this.figMat.opacity = Math.min(0.92, this.figMat.opacity + dt * 3);
      this.fig.lookAt(P.x, 0, P.z);
      if (f > 0.93 && !this.figSeen) {
        this.figSeen = true;
        this.figT = Math.min(this.figT, 0.35);
        g.audio.sting();
        g.addSanity(-4);
      }
      if (this.figT <= 0 || d < 3) {
        this.fig.visible = false;
        this.figMat.opacity = 0;
      }
    }
    this.halT -= dt;
    if (this.halT > 0) return;
    this.halT = 5 + Math.random() * 8;
    const yaw = player.yaw;
    const pan = Math.random() * 2 - 1;
    const r = Math.random();
    if (r < 0.2) {
      g.audio.play('whisper', { gain: 0.4, rate: 0.8 + Math.random() * 0.4, pan, wet: 1.4 });
      if (Math.random() < 0.4) g.hud.message(['…volte…', '…você não devia ter aberto…', '…estamos atrás de você…', '…olhe para trás…'][Math.floor(Math.random() * 4)], 2.5);
      g.addSanity(-2);
    } else if (r < 0.36) {
      for (let k = 0; k < 3; k++) g.audio.play('knock', { gain: 0.35, rate: 0.8 + Math.random() * 0.2, pan, wet: 1.2, when: k * 0.35 });
    } else if (r < 0.52) {
      for (let k = 0; k < 4; k++) g.audio.play(g.audio.B.step.tile, { gain: 0.25 - k * 0.04, rate: 0.9, pan: -Math.sin(yaw) * 0, wet: 0.9, when: k * 0.48 });
      g.hud.message('Passos atrás de você.', 2);
    } else if (r < 0.72) {
      // vulto no fim do corredor à frente
      const fx = -Math.sin(yaw);
      const fz = -Math.cos(yaw);
      for (let d = 13; d >= 6; d -= 1) {
        const x = P.x + fx * d;
        const z = P.z + fz * d;
        if (!this.area.openAt(x, z) || !this.area.clear(P.x, P.z, x, z)) continue;
        this.fig.position.set(x, 0, z);
        this.fig.visible = true;
        this.figMat.opacity = 0;
        this.figT = 1.6;
        this.figSeen = false;
        break;
      }
    } else if (r < 0.84) {
      g.glitch = Math.max(g.glitch, 0.7);
      g.damage = Math.max(g.damage, 0.3);
      g.audio.play('tvstatic', { gain: 0.3, rate: 0.9 });
    } else if (r < 0.94) {
      this.flare = 0.8;
      g.audio.play('crackle', { gain: 0.3, rate: 0.6, wet: 1.2 });
    } else if (this.cool <= 0) {
      this.cool = 40;
      g.hud.scare(guestFaceURL());
      g.audio.scare();
      g.addSanity(-8);
      g.vibrate(150);
    }
  }

  dispose() {
    this.leave();
    super.dispose();
  }
}
