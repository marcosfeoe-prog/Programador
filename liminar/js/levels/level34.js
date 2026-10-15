// Nível 34 — "Sistema de Esgoto": túneis sem fim com tijolos na metade de
// cima e pedra na metade de baixo, água amarelada parada no chão, quase sem
// luz. Um dos níveis mais perigosos: Sorridentes no escuro, Cães de caça,
// bandos de Ratos da Morte e boatos de um Ladrão de Pele.
// Áreas diferentes: esgoto comum, trechos decaídos (paredes desmoronando),
// trechos onde as paredes mudam de cor e trechos sem teto, sob um céu
// esverdeado e doente.
// Saída: a Sala de Junção, onde dois túneis se cruzam; mergulhar até o fundo
// da água leva ao Nível 35.
import * as THREE from 'three';
import { GridLevel, W, EH, EV } from './grid.js';
import { getTex, indoorEnvTex } from '../textures.js';
import { panelMaterial } from '../materials.js';
import { clamp, fbm, hash3, mulberry32, TAU } from '../util.js';
import './level34_tex.js';
import './level3_tex.js';
import { GridHounds } from './level3_hound.js';
import { DeathRats } from './level34_rats.js';

const C = 3; // célula
const H = 2.8; // pé-direito
const ZR = 10; // tamanho (em células) de cada área
const ROOF = 0.35; // espessura da laje vista de cima
const POOL_R = 3.1;
const mod = (a, n) => ((a % n) + n) % n;

// Tons das paredes nas áreas em que elas "mudam de cor".
const HUES = [
  [0.4, 0.95, 0.85],
  [1.15, 0.42, 0.38],
  [0.7, 0.48, 1.15],
  [0.55, 1.05, 0.4],
  [1.15, 0.9, 0.3],
  [0.42, 0.62, 1.2],
];

export class Level34 extends GridLevel {
  constructor(game) {
    super(game, {
      cell: C,
      H,
      T: 0.3,
      doorW: 1.4,
      doorH: 2.25,
      chunkCells: 8,
      seed: (game.seed ^ 0x3434) >>> 0,
      lightRadius: 9,
      lightEmitPow: 0.5,
      bounce: 0.45,
      ambient: 0.004,
      wallUV: [3, H],
      floorUV: 3,
      ceilUV: 2.4,
    });
    this.num = 34;
    this.surface = 'concrete';
    this.panelI = 8;
    this.flickerGap = 5;
    this.flashIntensity = 24;
    this.smilerMax = 2;
    this.ratPacks = 2;
    this.zoneMemo = new Map();
    const S = this.Q.tex;
    const wl = getTex('l34Wall', S);
    const fl = getTex('l34Floor', S);
    const br = getTex('l3Brick', S);
    const pn = getTex('panel', S);
    const gr = getTex('grime', S);
    const env = game.makeEnv(indoorEnvTex(['#3a3a22', '#22220f', '#101008'], '#e8f0b0', 4));
    this.mats = {
      floor: { map: fl.map, normalMap: fl.normalMap, roughnessMap: fl.roughnessMap, roughness: 1, dirtColor: new THREE.Color(0.35, 0.36, 0.2), dirtAmt: 0.8, wet: 0.85, envMap: env, envIntensity: 0.9 },
      wall: { map: wl.map, normalMap: wl.normalMap, roughnessMap: wl.roughnessMap, roughness: 1, vertexColors: true, envMap: env, envIntensity: 0.35 },
      ceil: { map: br.map, normalMap: br.normalMap, roughness: 1, lmIntensity: 0.5, vertexColors: true, color: 0x8a7a6a },
      prop: { map: gr.map, normalMap: gr.normalMap, vertexColors: true, roughness: 0.6, metalness: 0.35, envMap: env, envIntensity: 0.5 },
      extra: { color: 0xffffff, vertexColors: true, roughness: 0.18, metalness: 0.1, envMap: env, envIntensity: 0.55, transparent: true, opacity: 0.9, depthWrite: true },
    };
    this.panelMat = panelMaterial(pn.map, 0xffd890);
    this.look = {
      exposure: 1.05,
      tint: [0.98, 1.02, 0.88],
      sat: 0.85,
      contrast: 1.12,
      lift: [0.004, 0.006, 0.002],
      bloom: 0.26,
      fog: [0.016, 0.02, 0.012],
      fogNear: 0.05,
      lightColor: [1.0, 0.92, 0.62],
      flashlight: true,
      battery: 1 / 190,
      smilers: true,
      watcher: { near: 11, far: 22, first: 75, gap: 80 },
      ambience: 'level34',
      reverb: 2.8,
      sanityDrain: 0.24,
    };
    this.objectives = [
      { id: 'junction', text: 'Encontre a Sala de Junção, onde dois túneis se cruzam' },
      { id: 'dive', text: 'Mergulhe até o fundo da água' },
    ];
    this.told = {};
    this.route();
    this.makeSky();
  }

  // ------------------------------------------------------------ áreas
  zone(cx, cz) {
    const rx = Math.floor(cx / ZR);
    const rz = Math.floor(cz / ZR);
    const k = rx * 4096 + rz;
    let z = this.zoneMemo.get(k);
    if (z) return z;
    const h = hash3(rx * 3 + 1, rz * 5 + 2, this.seed + 5);
    if (rx === 0 && rz === 0) z = { type: 'esgoto', tint: [1, 1, 1] };
    else if (h < 0.4) z = { type: 'esgoto', tint: [1, 1, 1] };
    else if (h < 0.6) z = { type: 'decaida', tint: [0.62, 0.6, 0.48] };
    else if (h < 0.8) z = { type: 'cor', tint: HUES[Math.floor(hash3(rx, rz, this.seed + 6) * HUES.length)] };
    else z = { type: 'aberto', tint: [0.84, 0.98, 0.78] };
    this.zoneMemo.set(k, z);
    return z;
  }

  inJ(ix, iz) {
    const J = this.J;
    return ix >= J.x0 && ix < J.x1 && iz >= J.z0 && iz < J.z1;
  }

  isOpen(cx, cz) {
    return this.zone(cx, cz).type === 'aberto' && !this.inJ(cx, cz);
  }

  // Túneis principais (linhas) + passagens e câmaras.
  corridor(ix, iz) {
    if (this.inJ(ix, iz)) return true;
    const open = this.zone(ix, iz).type === 'aberto';
    if (mod(iz, 6) === 0 && hash3(Math.floor(ix / 8), iz, this.seed + 1) < 0.86) return true;
    if (mod(ix, 7) === 0 && hash3(ix, Math.floor(iz / 7), this.seed + 2) < 0.82) return true;
    if (open) {
      if (mod(iz, 6) === 1 && hash3(Math.floor(ix / 8), iz - 1, this.seed + 1) < 0.86) return true;
      if (hash3(Math.floor(ix / 3), Math.floor(iz / 3), this.seed + 4) < 0.3) return true;
    }
    return hash3(Math.floor(ix / 2), Math.floor(iz / 2), this.seed + 3) < 0.07;
  }

  flooded(cx, cz) {
    if (Math.abs(cx) + Math.abs(cz) < 4 || this.inJ(cx, cz) || !this.corridor(cx, cz)) return false;
    return fbm(cx * 0.11 + 9, cz * 0.11, 3, this.seed + 21) > 0.08;
  }

  genEdge(kind, ix, iz) {
    const bx = kind === EH ? ix : ix - 1;
    const bz = kind === EH ? iz - 1 : iz;
    const J = this.J;
    const ja = this.inJ(ix, iz);
    const jb = this.inJ(bx, bz);
    if (ja && jb) return W.NONE;
    if (ja !== jb) {
      // os dois túneis atravessam a sala pelo meio
      if (kind === EV && iz === J.zm) return W.NONE;
      if (kind === EH && ix === J.xm) return W.NONE;
      return W.FULL;
    }
    const ca = this.corridor(ix, iz);
    const cb = this.corridor(bx, bz);
    if (ca && cb) return hash3(ix * 3 + kind, iz, this.seed + 9) < 0.03 ? W.DOOR : W.NONE;
    if (ca || cb) {
      const h = hash3(ix * 2 + kind, iz, this.seed + 11);
      const zt = this.zone(ca ? ix : bx, ca ? iz : bz).type;
      if (zt === 'decaida') {
        // paredes desmoronando: buracos para cavidades escuras
        if (h < 0.1) return W.HALF_A;
        if (h < 0.2) return W.HALF_B;
        if (h < 0.26) return W.DOOR;
      } else if (h < 0.04) return W.DOOR;
      return W.FULL;
    }
    return W.NONE;
  }

  dark(cx, cz) {
    if (Math.abs(cx) + Math.abs(cz) < 6) return false;
    return fbm(cx * 0.09 + 40, cz * 0.09, 3, this.seed + 8) < -0.12;
  }

  genLight(cx, cz) {
    if (!this.corridor(cx, cz)) return null;
    const J = this.J;
    if (this.inJ(cx, cz)) {
      if ((cx === J.x0 + 1 || cx === J.x1 - 2) && (cz === J.z0 + 1 || cz === J.z1 - 2))
        return { x: cx * C + 1.5, z: cz * C + 1.5, y: H - 0.4, ax: 0, len: 0.25, wid: 0.25, I: 11, group: 0 };
      return null;
    }
    if (this.isOpen(cx, cz)) {
      // céu aberto: luz difusa vinda de cima
      if (mod(cx, 2) || mod(cz, 2)) return null;
      return { sky: true, x: cx * C + 1.5, z: cz * C + 1.5, y: H + 4, ax: 0, len: 0, wid: 0, I: 34, group: 0 };
    }
    if (mod(cx + cz, 3) !== 0) return null;
    const near = Math.abs(cx) + Math.abs(cz) < 5;
    const h = this.hashCell(cx, cz, 3);
    const zt = this.zone(cx, cz).type;
    let group = 0;
    let I = 9;
    if (near) group = 0;
    else if (this.dark(cx, cz)) {
      if (h > 0.12) return null;
      group = h < 0.06 ? 1 : 3;
    } else if (zt === 'decaida') {
      if (h > 0.2) return null;
      group = h < 0.07 ? 3 : h < 0.14 ? 1 : 2;
      I = 7;
    } else if (zt === 'cor') {
      if (h > 0.55) return null;
      group = h < 0.06 ? 1 : 0;
      I = 10;
    } else {
      if (h > 0.42) return null;
      group = h < 0.05 ? 3 : h < 0.12 ? 1 : h < 0.17 ? 2 : 0;
    }
    return { x: cx * C + 1.5, z: cz * C + 1.5, y: H - 0.4, ax: 0, len: 0.25, wid: 0.25, I, group };
  }

  // Raio de luz do céu só passa por onde não há teto.
  visible(px, py, pz, sx, sy, sz) {
    if (sy > H + 0.5) {
      const t = (H - py) / (sy - py);
      const xh = px + (sx - px) * t;
      const zh = pz + (sz - pz) * t;
      if (!this.isOpen(Math.floor(xh / C), Math.floor(zh / C))) return false;
      return super.visible(px, py, pz, xh, H - 0.01, zh);
    }
    return super.visible(px, py, pz, sx, sy, sz);
  }

  // Lâmpada nua numa gaiola, pendurada num fio.
  buildLight(G, L) {
    if (L.sky) return;
    const y = L.y;
    G.prop.box(L.x, (y + H) / 2 + 0.08, L.z, 0.02, H - y - 0.16, 0.02, [0.12, 0.12, 0.1], G.lm, { ao: 0 });
    G.prop.cylinder(L.x, y + 0.12, L.z, 0.06, 0.06, [0.25, 0.22, 0.18], G.lm, { sides: 8 });
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * TAU;
      G.prop.box(L.x + Math.cos(a) * 0.09, y, L.z + Math.sin(a) * 0.09, 0.012, 0.2, 0.012, [0.18, 0.16, 0.12], G.lm, { ao: 0 });
    }
    G.panel.cylinder(L.x, y - 0.02, L.z, 0.05, 0.12, [1, 1, 1], null, { sides: 8, group: L.group });
  }

  dirt(x, z) {
    const n = fbm(x * 0.13, z * 0.13, 3, this.seed + 11);
    return clamp((n + 0.15) / 0.3, 0, 1);
  }

  tintAt(x, z) {
    return this.zone(Math.floor(x / C), Math.floor(z / C)).tint;
  }

  // Face vertical com o tom da área (paredes "mudam de cor").
  vface(gb, ax, az, bx, bz, y0, y1, n, uA, uB, lmFn) {
    const rows = this.wallRows(y0, y1);
    const vr = this.wallUV[1];
    const off = 0.25;
    const la = lmFn(ax + n[0] * off, az + n[2] * off);
    const lb = lmFn(bx + n[0] * off, bz + n[2] * off);
    const t = this.tintAt((ax + bx) / 2 + n[0] * 0.3, (az + bz) / 2 + n[2] * 0.3);
    for (let r = 0; r < rows.length - 1; r++) {
      const ya = rows[r];
      const yb = rows[r + 1];
      const ka = this.wallShade(ya);
      const kb = this.wallShade(yb);
      const ca = [ka * t[0], ka * t[1], ka * t[2]];
      const cb = [kb * t[0], kb * t[1], kb * t[2]];
      gb.quad(
        [
          [ax, ya, az],
          [bx, ya, bz],
          [bx, yb, bz],
          [ax, yb, az],
        ],
        n,
        [uA, ya / vr, uB, ya / vr, uB, yb / vr, uA, yb / vr],
        [la[0], la[1], lb[0], lb[1], lb[0], lb[1], la[0], la[1]],
        [ca, ca, cb, cb],
      );
    }
  }

  // Abóbada: chanfro de tijolo entre a parede e o teto; canos de esgoto.
  decorateEdge(G, kind, ix, iz, t) {
    if (t !== W.FULL) return;
    const hT = this.T / 2;
    const ch = 0.55;
    const sides = [];
    if (kind === EH) {
      if (this.corridor(ix, iz) && !this.isOpen(ix, iz)) sides.push(1);
      if (this.corridor(ix, iz - 1) && !this.isOpen(ix, iz - 1)) sides.push(-1);
    } else {
      if (this.corridor(ix, iz) && !this.isOpen(ix, iz)) sides.push(1);
      if (this.corridor(ix - 1, iz) && !this.isOpen(ix - 1, iz)) sides.push(-1);
    }
    const ur = this.wallUV[0];
    const v0 = (H - ch) / H;
    for (const s of sides) {
      if (kind === EH) {
        const zc = iz * C;
        const xa = ix * C;
        const xb = xa + C;
        const tn = this.tintAt(xa + 1.5, zc + s);
        const col = [tn[0] * 0.8, tn[1] * 0.8, tn[2] * 0.8];
        const lA = G.lm(xa, zc + s * 0.6);
        const lB = G.lm(xb, zc + s * 0.6);
        const za = zc + s * hT;
        const zb = zc + s * (hT + ch);
        const pts = [
          [xa, H - ch, za],
          [xb, H - ch, za],
          [xb, H, zb],
          [xa, H, zb],
        ];
        const q = s > 0 ? pts : [pts[1], pts[0], pts[3], pts[2]];
        const uv = s > 0 ? [xa / ur, v0, xb / ur, v0, xb / ur, 1, xa / ur, 1] : [xb / ur, v0, xa / ur, v0, xa / ur, 1, xb / ur, 1];
        const lm = s > 0 ? [...lA, ...lB, ...lB, ...lA] : [...lB, ...lA, ...lA, ...lB];
        G.wall.quad(q, [0, -0.707, s * 0.707], uv, lm, [col, col, col, col]);
      } else {
        const xc = ix * C;
        const za = iz * C;
        const zb = za + C;
        const tn = this.tintAt(xc + s, za + 1.5);
        const col = [tn[0] * 0.8, tn[1] * 0.8, tn[2] * 0.8];
        const lA = G.lm(xc + s * 0.6, za);
        const lB = G.lm(xc + s * 0.6, zb);
        const xa = xc + s * hT;
        const xb = xc + s * (hT + ch);
        const pts = [
          [xa, H - ch, za],
          [xa, H - ch, zb],
          [xb, H, zb],
          [xb, H, za],
        ];
        const q = s < 0 ? pts : [pts[1], pts[0], pts[3], pts[2]];
        const uv = s < 0 ? [za / ur, v0, zb / ur, v0, zb / ur, 1, za / ur, 1] : [zb / ur, v0, za / ur, v0, za / ur, 1, zb / ur, 1];
        const lm = s < 0 ? [...lA, ...lB, ...lB, ...lA] : [...lB, ...lA, ...lA, ...lB];
        G.wall.quad(q, [s * 0.707, -0.707, 0], uv, lm, [col, col, col, col]);
      }
    }
    // cano grosso de esgoto ao longo da parede
    const h = hash3(ix * 5 + kind, iz * 3, this.seed + 21);
    if (h < 0.16 && sides.length) {
      const s = sides[0];
      const r = 0.15;
      const off = hT + r + 0.04;
      const y = 0.55 + h * 4;
      const col = h < 0.08 ? [0.36, 0.22, 0.12] : [0.28, 0.3, 0.26];
      if (kind === EH) G.prop.cylinder(ix * C + C / 2, y, iz * C + s * off, r, C + 0.02, col, G.lm, { axis: 'x', sides: 10, caps: false });
      else G.prop.cylinder(ix * C + s * off, y, iz * C + C / 2, r, C + 0.02, col, G.lm, { axis: 'z', sides: 10, caps: false });
    }
  }

  // Itens, entulho e água parada.
  genProps(ch, cx0, cz0) {
    const N = this.chunkCells;
    for (let z = cz0; z < cz0 + N; z++)
      for (let x = cx0; x < cx0 + N; x++) {
        if (!this.corridor(x, z) || this.inJ(x, z) || Math.abs(x) + Math.abs(z) < 3) continue;
        const h = this.hashCell(x, z, 51);
        const px = x * C + 0.8 + this.hashCell(x, z, 54) * 1.4;
        const pz = z * C + 0.8 + this.hashCell(x, z, 55) * 1.4;
        if (h > 0.989)
          ch.items.push({
            type: 'water',
            key: `34:${x}:${z}:w`,
            x: px,
            z: pz,
            label: 'Pegar Água de Amêndoa (turva)',
            onUse: (game) => {
              game.addSanity(-12);
              game.audio.drink();
              game.damage = Math.max(game.damage, 0.6);
              game.hud.message('Gosto de ferrugem e esgoto. A Água de Amêndoa daqui está contaminada! (−Sanidade)', 4.5);
            },
          });
        else if (h > 0.976) ch.items.push({ type: 'battery', key: `34:${x}:${z}:b`, x: px, z: pz });
        else if (h > 0.966) ch.items.push({ type: 'note', key: `34:${x}:${z}:n`, x: px, z: pz, rot: h * 40 });
        // entulho nas áreas decaídas
        if (this.zone(x, z).type === 'decaida' && this.hashCell(x, z, 52) < 0.22) {
          const rx = x * C + 0.7 + this.hashCell(x, z, 56) * 1.6;
          const rz = z * C + 0.7 + this.hashCell(x, z, 57) * 1.6;
          const n = 4 + Math.floor(this.hashCell(x, z, 58) * 5);
          const pieces = [];
          for (let k = 0; k < n; k++) {
            const a = hash3(x * 9 + k, z, this.seed + 59) * TAU;
            const d = hash3(x, z * 9 + k, this.seed + 60) * 0.5;
            pieces.push([rx + Math.cos(a) * d, rz + Math.sin(a) * d, 0.12 + hash3(x + k, z - k, this.seed + 61) * 0.2, a]);
          }
          ch.props.push({
            ao: [rx - 0.5, rx + 0.5, rz - 0.5, rz + 0.5, 0.1],
            draw: (G) => {
              for (const [qx, qz, s, a] of pieces) G.prop.box(qx, s / 2, qz, s * 1.8, s, s, [0.4, 0.24, 0.15], G.lm, { rot: a });
              G.prop.box(rx, 0.06, rz, 1.0, 0.12, 0.8, [0.3, 0.28, 0.24], G.lm, { rot: pieces[0][3] });
            },
          });
          ch.colliders.push([rx - 0.45, rx + 0.45, rz - 0.4, rz + 0.4]);
        }
      }
  }

  // Piso, teto (só onde há teto), laje vista de cima, água parada e o poço.
  buildFloorCeil(G, ch) {
    const N = this.chunkCells;
    const cx0 = Math.round(ch.x0 / C);
    const cz0 = Math.round(ch.z0 / C);
    this.hface(G.floor, ch.x0, ch.x0 + this.S, ch.z0, ch.z0 + this.S, 0, true, G.lm, this.floorUV);
    for (let z = cz0; z < cz0 + N; z++) {
      let run = null;
      for (let x = cx0; x <= cx0 + N; x++) {
        const covered = x < cx0 + N && !this.isOpen(x, z);
        if (covered && run === null) run = x;
        if (!covered && run !== null) {
          this.hface(G.ceil, run * C, x * C, z * C, (z + 1) * C, H, false, G.lm, this.ceilUV);
          this.hface(G.ceil, run * C, x * C, z * C, (z + 1) * C, H + ROOF, true, G.lm, this.ceilUV, 0.5);
          run = null;
        }
      }
      for (let x = cx0; x < cx0 + N; x++) {
        // borda da laje voltada para as áreas sem teto
        if (this.isOpen(x, z)) continue;
        const sideCol = [0.5, 0.5, 0.48];
        const l = G.lm(x * C + 1.5, z * C + 1.5);
        const lm = [...l, ...l, ...l, ...l];
        const x0 = x * C;
        const x1 = x0 + C;
        const z0 = z * C;
        const z1 = z0 + C;
        const uv = [0, 0, 1, 0, 1, 0.12, 0, 0.12];
        if (this.isOpen(x + 1, z)) G.wall.quad([[x1, H, z1], [x1, H, z0], [x1, H + ROOF, z0], [x1, H + ROOF, z1]], [1, 0, 0], uv, lm, [sideCol, sideCol, sideCol, sideCol]);
        if (this.isOpen(x - 1, z)) G.wall.quad([[x0, H, z0], [x0, H, z1], [x0, H + ROOF, z1], [x0, H + ROOF, z0]], [-1, 0, 0], uv, lm, [sideCol, sideCol, sideCol, sideCol]);
        if (this.isOpen(x, z + 1)) G.wall.quad([[x0, H, z1], [x1, H, z1], [x1, H + ROOF, z1], [x0, H + ROOF, z1]], [0, 0, 1], uv, lm, [sideCol, sideCol, sideCol, sideCol]);
        if (this.isOpen(x, z - 1)) G.wall.quad([[x1, H, z0], [x0, H, z0], [x0, H + ROOF, z0], [x1, H + ROOF, z0]], [0, 0, -1], uv, lm, [sideCol, sideCol, sideCol, sideCol]);
      }
    }
    // água amarelada parada
    const wc = [0.34, 0.28, 0.1];
    for (let z = cz0; z < cz0 + N; z++)
      for (let x = cx0; x < cx0 + N; x++) {
        if (!this.flooded(x, z)) continue;
        const pts = [
          [x * C, 0.09, (z + 1) * C],
          [(x + 1) * C, 0.09, (z + 1) * C],
          [(x + 1) * C, 0.09, z * C],
          [x * C, 0.09, z * C],
        ];
        const lm = [];
        for (const p of pts) lm.push(...G.lm(p[0], p[2]));
        G.extra.quad(pts, [0, 1, 0], [x * 0.5, (z + 1) * 0.5, (x + 1) * 0.5, (z + 1) * 0.5, (x + 1) * 0.5, z * 0.5, x * 0.5, z * 0.5], lm, [wc, wc, wc, wc]);
      }
  }

  // O poço da Sala de Junção (no bloco do centro dela).
  buildExtra(G, ch) {
    const P = this.pool;
    if (P.x < ch.x0 || P.x >= ch.x0 + this.S || P.z < ch.z0 || P.z >= ch.z0 + this.S) return;
    const n = 28;
    const rim = 0.32;
    for (let k = 0; k < n; k++) {
      const a = ((k + 0.5) / n) * TAU;
      const x = P.x + Math.cos(a) * (POOL_R + rim / 2);
      const z = P.z + Math.sin(a) * (POOL_R + rim / 2);
      G.prop.box(x, 0.22, z, rim, 0.44, ((TAU * (POOL_R + rim)) / n) * 1.04, [0.42, 0.4, 0.36], G.lm, { rot: -a });
    }
    // água escura e funda dentro do poço
    const wc = [0.06, 0.07, 0.03];
    const c0 = G.lm(P.x, P.z);
    for (let k = 0; k < n; k++) {
      const a0 = (k / n) * TAU;
      const a1 = ((k + 1) / n) * TAU;
      const p0 = [P.x + Math.cos(a0) * POOL_R, 0.3, P.z + Math.sin(a0) * POOL_R];
      const p1 = [P.x + Math.cos(a1) * POOL_R, 0.3, P.z + Math.sin(a1) * POOL_R];
      const l0 = G.lm(p0[0], p0[2]);
      const l1 = G.lm(p1[0], p1[2]);
      G.extra.quad([[P.x, 0.3, P.z], p1, p0, [P.x, 0.3, P.z]], [0, 1, 0], [0.5, 0.5, 0.5 + Math.cos(a1) * 0.5, 0.5 + Math.sin(a1) * 0.5, 0.5 + Math.cos(a0) * 0.5, 0.5 + Math.sin(a0) * 0.5, 0.5, 0.5], [...c0, ...l1, ...l0, ...c0], [wc, wc, wc, wc]);
    }
    // fundo preto (a água é turva, mas a profundidade aparece)
    G.prop.cylinder(P.x, 0.15, P.z, POOL_R, 0.28, [0.01, 0.01, 0.01], null, { sides: n, caps: true });
    // escadinha de ferro descendo para dentro da água
    for (let k = 0; k < 4; k++) G.prop.box(P.x + POOL_R - 0.25, 0.42 - k * 0.12, P.z, 0.05, 0.03, 0.5, [0.3, 0.2, 0.12], G.lm, { ao: 0 });
    for (const s of [-1, 1]) G.prop.box(P.x + POOL_R - 0.25, 0.45, P.z + s * 0.25, 0.04, 0.6, 0.04, [0.3, 0.2, 0.12], G.lm, { ao: 0 });
  }

  // ------------------------------------------------------------ rota
  route() {
    const rnd = mulberry32(this.seed * 7 + 11);
    const a = rnd() * TAU;
    const dist = 34 + rnd() * 6;
    const xm = Math.round((Math.cos(a) * dist) / 7) * 7;
    const zm = Math.round((Math.sin(a) * dist) / 6) * 6;
    this.J = { x0: xm - 2, x1: xm + 3, z0: zm - 2, z1: zm + 3, xm, zm };
    this.pool = { x: (xm + 0.5) * C, z: (zm + 0.5) * C };
    this.clearCell(0, 0);
    this.carve(0, 0, xm, zm, rnd);
    this.spawn = { x: C / 2, z: C / 2, yaw: -Math.PI / 2 };
    this.exit = { x: this.pool.x, z: this.pool.z };
  }

  makeSky() {
    const fog = new THREE.Color(...this.look.fog);
    this.skyMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uFog: { value: fog } },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform vec3 uFog;
        varying vec3 vDir;
        float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float n(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(h(i), h(i + vec2(1.0, 0.0)), f.x), mix(h(i + vec2(0.0, 1.0)), h(i + vec2(1.0, 1.0)), f.x), f.y);
        }
        void main() {
          vec3 d = normalize(vDir);
          float y = d.y;
          vec3 top = vec3(0.07, 0.13, 0.06);
          vec3 hor = vec3(0.26, 0.36, 0.16);
          vec3 c = mix(hor, top, smoothstep(0.0, 0.8, y));
          vec2 uv = d.xz / max(y, 0.1) * 1.4 + vec2(uTime * 0.012, uTime * 0.005);
          float cl = n(uv) * 0.55 + n(uv * 2.3) * 0.3 + n(uv * 5.1) * 0.15;
          c = mix(c, vec3(0.4, 0.48, 0.26), smoothstep(0.45, 0.85, cl) * 0.55);
          c *= 0.85 + 0.15 * sin(uTime * 0.2);
          float k = smoothstep(0.02, 0.22, y);
          gl_FragColor = vec4(mix(uFog, c, k), 1.0);
        }`,
      side: THREE.BackSide,
      depthTest: false,
      depthWrite: false,
      fog: false,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(20, 32, 16), this.skyMat);
    this.sky.renderOrder = -100;
    this.sky.frustumCulled = false;
    this.scene.add(this.sky);
  }

  // ------------------------------------------------------------ entidades
  floorOf() {
    return 1;
  }

  groundY() {
    return 0;
  }

  waterY(x, z) {
    return this.flooded(Math.floor(x / C), Math.floor(z / C)) ? 0.06 : 0;
  }

  surfaceAt(x, z) {
    return this.flooded(Math.floor(x / C), Math.floor(z / C)) ? 'dirt' : 'concrete';
  }

  // Sorridente: lanterna apagada e olhar para o chão fazem ele sumir.
  smilerHide(player) {
    return !player.flashOn && player.pitch < -0.55;
  }

  ratFace() {
    if (this.ratURL) return this.ratURL;
    const cv = document.createElement('canvas');
    cv.width = cv.height = 256;
    const c = cv.getContext('2d');
    c.fillStyle = '#000';
    c.fillRect(0, 0, 256, 256);
    const rnd = mulberry32(3434);
    for (let k = 0; k < 9; k++) {
      const x = 30 + rnd() * 196;
      const y = 40 + rnd() * 170;
      const s = 0.5 + rnd() * 0.8;
      for (const dx of [-7, 7]) {
        const g = c.createRadialGradient(x + dx * s, y, 0, x + dx * s, y, 9 * s);
        g.addColorStop(0, 'rgba(255,60,40,1)');
        g.addColorStop(1, 'rgba(120,0,0,0)');
        c.fillStyle = g;
        c.beginPath();
        c.arc(x + dx * s, y, 9 * s, 0, TAU);
        c.fill();
      }
      c.fillStyle = 'rgba(230,220,190,0.8)';
      c.fillRect(x - 3 * s, y + 12 * s, 2.5 * s, 7 * s);
      c.fillRect(x + 0.5 * s, y + 12 * s, 2.5 * s, 7 * s);
    }
    this.ratURL = cv.toDataURL();
    return this.ratURL;
  }

  // ------------------------------------------------------------ quadro
  tick(dt, player) {
    const g = this.game;
    const p = player.pos;
    this.time = (this.time || 0) + dt;
    this.sky.position.copy(g.camera.position);
    this.skyMat.uniforms.uTime.value = this.time;
    if (!this.hounds) this.hounds = new GridHounds(this);
    if (!this.rats) this.rats = new DeathRats(this);
    this.noHounds = this.noRats = !!this.diving;
    this.hounds.update(dt, player);
    const ratFear = this.rats.update(dt, player);
    g.st.fear = Math.max(g.st.fear || 0, ratFear);
    this.sanityExtra = (this.houndFear || 0) * 0.45 + ratFear * 0.4;
    // água: anda devagar e chapinha
    const cx = Math.floor(p.x / C);
    const cz = Math.floor(p.z / C);
    const wet = this.flooded(cx, cz);
    this.walkSpeed = wet ? 1.65 : 2.15;
    if (wet && player.speed > 0.5) {
      this.splashT = (this.splashT || 0) - dt * player.speed;
      if (this.splashT <= 0) {
        this.splashT = 1.1;
        g.audio.play('water', { gain: 0.1 + Math.random() * 0.05, rate: 1.6 + Math.random() * 0.5, wet: 0.5 });
      }
      if (!this.told.water) {
        this.told.water = true;
        g.hud.message('Água amarelada até o tornozelo. Fria, grossa, cheira a ferrugem. Você anda mais devagar aqui.', 4.5);
      }
    }
    // mensagens das áreas
    const zt = this.inJ(cx, cz) ? 'J' : this.zone(cx, cz).type;
    if (zt !== this.lastZone) {
      this.lastZone = zt;
      const msg = {
        decaida: 'Aqui as paredes estão desmoronando. Tijolos soltos, buracos para cavidades escuras.',
        cor: 'As paredes mudaram de cor de repente. Ninguém pintou isso.',
        aberto: 'Não há teto aqui. Lá em cima, um céu esverdeado e doente, sem sol.',
      }[zt];
      if (msg && !this.told[zt]) {
        this.told[zt] = true;
        g.hud.message(msg, 4.5);
      }
      if (zt === 'J') g.completeObjective('junction', 'A Sala de Junção: dois túneis se cruzam em volta de um poço de água escura. Dizem que o fundo leva para fora.');
    }
    // dicas das entidades
    if (!this.told.smiler && g.smilers && g.smilers.pool.some((s) => s.active && s.alpha > 0.3)) {
      this.told.smiler = true;
      g.hud.message('Um sorriso no escuro. Apague a lanterna e olhe para o chão até ele sumir.', 5);
    }
    if (!this.told.watcher && g.watcher && g.watcher.state === 1) {
      this.told.watcher = true;
      setTimeout(() => g.level === this && g.hud.message('Uma silhueta humana no fim do túnel… Dizem que um Ladrão de Pele anda por aqui.', 4.5), 1500);
    }
  }

  collide(p, r) {
    super.collide(p, r);
    const P = this.pool;
    const dx = p.x - P.x;
    const dz = p.z - P.z;
    const d = Math.hypot(dx, dz);
    const R = POOL_R + 0.32 + r;
    if (d < R && d > 1e-4) {
      p.x = P.x + (dx / d) * R;
      p.z = P.z + (dz / d) * R;
    }
    return p;
  }

  interactable(player) {
    const p = player.pos;
    const g = this.game;
    if (this.diving) return null;
    const P = this.pool;
    if (Math.hypot(p.x - P.x, p.z - P.z) < POOL_R + 1.6) {
      return {
        label: 'Mergulhar até o fundo da água',
        action: () => {
          this.diving = true;
          g.completeObjective('junction');
          g.completeObjective('dive', 'Você prende o ar e afunda na água escura. Mais fundo. Mais fundo… até uma luz fraca lá embaixo.');
          g.audio.play('water', { gain: 0.5, rate: 0.6 });
          g.audio.setMuffle(1);
          setTimeout(() => g.audio.setMuffle(0), 3500);
          g.reachExit('noclip', 1.6);
        },
      };
    }
    return null;
  }

  navTarget() {
    return this.exit;
  }

  exitEmitter() {
    return { x: this.pool.x, y: 0.4, z: this.pool.z, sound: 'water', gain: 0.45 };
  }

  dispose() {
    if (this.hounds) this.hounds.dispose();
    if (this.rats) this.rats.dispose();
    this.scene.remove(this.sky);
    this.sky.geometry.dispose();
    this.skyMat.dispose();
    this.panelMat.dispose();
    super.dispose();
  }
}
