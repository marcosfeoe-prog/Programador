// Motor dos níveis internos (0, 1 e 4): mundo infinito em grade, gerado em
// blocos ("chunks") de forma determinística. Paredes ficam nas arestas das
// células. Cada bloco recebe um lightmap calculado na hora: a luz de cada
// luminária é traçada pela grade (DDA) e as paredes, batentes e vergas de
// portas projetam sombra; depois vem a luz rebatida (borrão largo) e a
// oclusão de contato junto às paredes.
import * as THREE from 'three';
import { GeoBuilder, litMaterial } from '../materials.js';
import { clamp, hash3 } from '../util.js';

export const EH = 0; // aresta horizontal (ao longo de x), entre (ix, iz-1) e (ix, iz)
export const EV = 1; // aresta vertical (ao longo de z), entre (ix-1, iz) e (ix, iz)
export const W = { NONE: 0, FULL: 1, DOOR: 2, HALF_A: 3, HALF_B: 4, GLASS: 5, WINDOW: 6, EXIT: 7 };

const now = () => performance.now();

export class GridLevel {
  constructor(game, cfg) {
    this.game = game;
    this.Q = game.Q;
    this.scene = game.scene;
    this.cell = 2.4;
    this.H = 2.7;
    this.T = 0.14;
    this.doorW = 1.0;
    this.doorH = 2.1;
    this.chunkCells = 8;
    this.seed = 1;
    this.lightRadius = 9;
    this.lightEmitPow = 1; // 1 = luminária embutida (cosseno), ~0.3 = tubo nu
    this.bounce = 0.35;
    this.ambient = 0.02;
    this.wallUV = [1.2, 2.7];
    this.floorUV = 2;
    this.ceilUV = 1.2;
    this.ceilLM = 0.35;
    this.indoor = true;
    Object.assign(this, cfg);
    this.S = this.cell * this.chunkCells;
    this.pad = 0.6;
    this.edgeMemo = new Map();
    this.lightMemo = new Map();
    this.overrides = new Map();
    this.chunks = new Map();
    this.building = null;
    this.taken = new Set();
    this.memoTrim = 0;
    this.dynamic = new THREE.Group();
    this.scene.add(this.dynamic);
    this.makePieces();
  }

  // ------------------------------------------------------------ definição
  makePieces() {
    const c = this.cell;
    const H = this.H;
    const m = c / 2;
    const dw = this.doorW / 2;
    const P = {};
    const full = [{ a0: 0, a1: c, y0: 0, y1: H }];
    P[W.NONE] = [];
    P[W.FULL] = full;
    P[W.WINDOW] = full;
    P[W.EXIT] = full;
    P[W.DOOR] = [
      { a0: 0, a1: m - dw, y0: 0, y1: H },
      { a0: m + dw, a1: c, y0: 0, y1: H },
      { a0: m - dw, a1: m + dw, y0: this.doorH, y1: H },
    ];
    P[W.HALF_A] = [{ a0: 0, a1: m, y0: 0, y1: H }];
    P[W.HALF_B] = [{ a0: m, a1: c, y0: 0, y1: H }];
    const po = 0.07;
    P[W.GLASS] = [
      { a0: 0, a1: po, y0: 0, y1: H },
      { a0: c - po, a1: c, y0: 0, y1: H },
      { a0: po, a1: c - po, y0: 0, y1: 0.9 },
      { a0: po, a1: c - po, y0: 2.2, y1: H },
    ];
    this.pieces = P;
    // vãos de vidro (não bloqueiam luz nem visão, mas bloqueiam a passagem)
    this.glassSpan = { a0: po, a1: c - po, y0: 0.9, y1: 2.2 };
  }

  key(ix, iz) {
    return (ix + 32768) * 65536 + (iz + 32768);
  }

  edge(kind, ix, iz) {
    const k = this.key(ix, iz) * 2 + kind;
    let v = this.overrides.get(k);
    if (v !== undefined) return v;
    v = this.edgeMemo.get(k);
    if (v === undefined) {
      v = this.genEdge(kind, ix, iz);
      this.edgeMemo.set(k, v);
    }
    return v;
  }

  setEdge(kind, ix, iz, type) {
    this.overrides.set(this.key(ix, iz) * 2 + kind, type);
  }

  light(cx, cz) {
    const k = this.key(cx, cz);
    let v = this.lightMemo.get(k);
    if (v === undefined) {
      v = this.genLight(cx, cz) || null;
      this.lightMemo.set(k, v);
    }
    return v;
  }

  // Ganchos a sobrescrever pelos níveis.
  genEdge() {
    return W.NONE;
  }
  genLight() {
    return null;
  }
  pillar() {
    return 0;
  }
  genProps() {
    return [];
  }
  dirt() {
    return 0;
  }

  // A aresta tem um trecho de parede inteira encostando no canto `end` (0 = início, 1 = fim)?
  touches(kind, ix, iz, end) {
    const ps = this.pieces[this.edge(kind, ix, iz)];
    for (const p of ps) {
      if (p.y0 > 0 || p.y1 < this.H) continue;
      if (end === 0 && p.a0 === 0) return true;
      if (end === 1 && p.a1 === this.cell) return true;
    }
    return false;
  }

  // Regras de canto para não deixar frestas nem faces coplanares.
  cornerInfo(kind, ix, iz, end) {
    let gx, gz, coll, perp;
    if (kind === EH) {
      gx = ix + end;
      gz = iz;
      coll = end === 0 ? this.touches(EH, ix - 1, iz, 1) : this.touches(EH, ix + 1, iz, 0);
      perp = this.touches(EV, gx, gz - 1, 1) || this.touches(EV, gx, gz, 0);
    } else {
      gx = ix;
      gz = iz + end;
      coll = end === 0 ? this.touches(EV, ix, iz - 1, 1) : this.touches(EV, ix, iz + 1, 0);
      perp = this.touches(EH, gx - 1, gz, 1) || this.touches(EH, gx, gz, 0);
    }
    if (this.pillar(gx, gz) > 0) return { ext: 0, cap: false };
    return { ext: perp && !coll ? this.T / 2 : 0, cap: !perp && !coll };
  }

  // ------------------------------------------------------------ visibilidade
  // A aresta bloqueia um raio que a cruza na posição `along` e altura `y`?
  blocks(kind, ix, iz, along, y) {
    const t = this.edge(kind, ix, iz);
    if (t === W.NONE) return false;
    const ps = this.pieces[t];
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      if (along >= p.a0 - 0.02 && along <= p.a1 + 0.02 && y >= p.y0 && y <= p.y1) return true;
    }
    return false;
  }

  // Raio de (px,py,pz) até (sx,sy,sz) passa sem atravessar paredes? (DDA na grade)
  visible(px, py, pz, sx, sy, sz) {
    const c = this.cell;
    let cx = Math.floor(px / c);
    let cz = Math.floor(pz / c);
    const tcx = Math.floor(sx / c);
    const tcz = Math.floor(sz / c);
    const dx = sx - px;
    const dz = sz - pz;
    const stepX = dx > 0 ? 1 : -1;
    const stepZ = dz > 0 ? 1 : -1;
    const adx = Math.abs(dx);
    const adz = Math.abs(dz);
    const tdx = adx > 1e-9 ? c / adx : Infinity;
    const tdz = adz > 1e-9 ? c / adz : Infinity;
    let tmx = adx > 1e-9 ? (stepX > 0 ? (cx + 1) * c - px : px - cx * c) / adx : Infinity;
    let tmz = adz > 1e-9 ? (stepZ > 0 ? (cz + 1) * c - pz : pz - cz * c) / adz : Infinity;
    let guard = 200;
    while ((cx !== tcx || cz !== tcz) && guard-- > 0) {
      if (tmx < tmz) {
        if (tmx > 1) break;
        const ex = stepX > 0 ? cx + 1 : cx;
        const zc = pz + dz * tmx;
        if (this.blocks(EV, ex, cz, zc - cz * c, py + (sy - py) * tmx)) return false;
        cx += stepX;
        tmx += tdx;
      } else {
        if (tmz > 1) break;
        const ez = stepZ > 0 ? cz + 1 : cz;
        const xc = px + dx * tmz;
        if (this.blocks(EH, cx, ez, xc - cx * c, py + (sy - py) * tmz)) return false;
        cz += stepZ;
        tmz += tdz;
      }
    }
    return true;
  }

  // ------------------------------------------------------------ blocos
  chunkKey(cx, cz) {
    return cx * 100000 + cz;
  }

  wantedChunks(px, pz) {
    const S = this.S;
    const R = Math.max(1, Math.ceil(this.Q.viewDist / S));
    const pcx = Math.floor(px / S);
    const pcz = Math.floor(pz / S);
    const list = [];
    for (let dz = -R; dz <= R; dz++) {
      for (let dx = -R; dx <= R; dx++) {
        // distância do jogador até o retângulo do bloco
        const x0 = (pcx + dx) * S;
        const z0 = (pcz + dz) * S;
        const ddx = Math.max(x0 - px, 0, px - (x0 + S));
        const ddz = Math.max(z0 - pz, 0, pz - (z0 + S));
        const d = Math.hypot(ddx, ddz);
        if (d <= this.Q.viewDist + 2) list.push({ cx: pcx + dx, cz: pcz + dz, d });
      }
    }
    list.sort((a, b) => a.d - b.d);
    return { list, R };
  }

  // Carrega tudo ao redor de uma posição (tela de carregamento).
  async preload(px, pz, progress) {
    const { list } = this.wantedChunks(px, pz);
    let i = 0;
    for (const w of list) {
      const k = this.chunkKey(w.cx, w.cz);
      if (!this.chunks.has(k)) {
        const gen = this.buildChunk(w.cx, w.cz);
        let r = gen.next();
        while (!r.done) r = gen.next();
      }
      i++;
      if (progress) progress(i / list.length);
      await new Promise((res) => setTimeout(res, 0));
    }
  }

  updateChunks(px, pz) {
    const { list } = this.wantedChunks(px, pz);
    const keep = new Set();
    for (const w of list) keep.add(this.chunkKey(w.cx, w.cz));
    // descarrega blocos distantes (com folga)
    for (const [k, ch] of this.chunks) {
      if (keep.has(k)) continue;
      const cxm = (ch.cx + 0.5) * this.S;
      const czm = (ch.cz + 0.5) * this.S;
      if (Math.hypot(cxm - px, czm - pz) > this.Q.viewDist + this.S * 1.3) this.disposeChunk(ch);
    }
    // continua (ou inicia) a geração com orçamento de tempo
    const t0 = now();
    const budget = this.game.settings.mobile ? 5 : 7;
    while (now() - t0 < budget) {
      if (!this.building) {
        const next = list.find((w) => !this.chunks.has(this.chunkKey(w.cx, w.cz)));
        if (!next) break;
        this.building = this.buildChunk(next.cx, next.cz);
      }
      const r = this.building.next();
      if (r.done) this.building = null;
    }
    if (this.memoTrim++ > 600) {
      this.memoTrim = 0;
      if (this.edgeMemo.size > 250000) this.edgeMemo.clear();
      if (this.lightMemo.size > 120000) this.lightMemo.clear();
    }
  }

  disposeChunk(ch) {
    for (const m of ch.meshes) {
      this.scene.remove(m);
      m.geometry.dispose();
      if (!m.userData.sharedMat) {
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        for (const mm of mats) mm.dispose();
      }
    }
    for (const it of ch.items) {
      it.dead = true;
      if (it.mesh) this.dynamic.remove(it.mesh);
    }
    if (ch.lmTex) ch.lmTex.dispose();
    if (ch.onDispose) ch.onDispose();
    this.chunks.delete(this.chunkKey(ch.cx, ch.cz));
  }

  dispose() {
    for (const ch of [...this.chunks.values()]) this.disposeChunk(ch);
    this.scene.remove(this.dynamic);
  }

  chunkAt(x, z) {
    return this.chunks.get(this.chunkKey(Math.floor(x / this.S), Math.floor(z / this.S)));
  }

  // Luz total (pré-calculada) no ponto, para a jogabilidade.
  lightLevel(x, z) {
    const ch = this.chunkAt(x, z);
    if (!ch || !ch.lmTotal) return 0.5;
    const span = this.S + this.pad * 2;
    const res = ch.res;
    const ix = clamp(Math.floor(((x - ch.x0 + this.pad) / span) * res), 0, res - 1);
    const iz = clamp(Math.floor(((z - ch.z0 + this.pad) / span) * res), 0, res - 1);
    const i = iz * res + ix;
    const s = this.game.lmScale;
    return ch.lmTotal[i] + ch.lmA[i] * s.y + ch.lmB[i] * s.z;
  }

  *buildChunk(ccx, ccz) {
    const key = this.chunkKey(ccx, ccz);
    const N = this.chunkCells;
    const c = this.cell;
    const S = this.S;
    const ch = { cx: ccx, cz: ccz, x0: ccx * S, z0: ccz * S, meshes: [], items: [], colliders: [], props: [] };
    const cx0 = ccx * N;
    const cz0 = ccz * N;
    // 1) objetos do bloco (definidos antes para a oclusão no lightmap)
    this.genProps(ch, cx0, cz0);
    // 2) lightmap
    const tpm = this.Q.lmTpm * (this.lmDensity || 1);
    const span = S + this.pad * 2;
    const res = Math.max(8, Math.ceil(span * tpm));
    const ts = span / res;
    const ox = ch.x0 - this.pad;
    const oz = ch.z0 - this.pad;
    ch.res = res;
    const lm = (x, z) => [(x - ox) / span, (z - oz) / span];
    const lights = [];
    const LR = Math.ceil(this.lightRadius / c) + 1;
    const ns = this.Q.lmSamples;
    for (let z = cz0 - LR; z < cz0 + N + LR; z++) {
      for (let x = cx0 - LR; x < cx0 + N + LR; x++) {
        const L = this.light(x, z);
        if (!L || L.group === 3) continue;
        for (let s = 0; s < ns; s++) {
          const f = ns === 1 ? 0 : (s + 0.5) / ns - 0.5;
          const off = f * L.len * 0.85;
          lights.push({
            x: L.x + (L.ax === 0 ? off : 0),
            z: L.z + (L.ax === 1 ? off : 0),
            y: L.y,
            I: L.I / ns,
            g: L.group,
          });
        }
      }
    }
    const E0 = new Float32Array(res * res);
    const EA = new Float32Array(res * res);
    const EB = new Float32Array(res * res);
    const R2 = this.lightRadius * this.lightRadius;
    const ep = this.lightEmitPow;
    const recvY = 0.05;
    let tick = now();
    for (let j = 0; j < res; j++) {
      const z = oz + (j + 0.5) * ts;
      for (let i = 0; i < res; i++) {
        const x = ox + (i + 0.5) * ts;
        let e0 = 0;
        let ea = 0;
        let eb = 0;
        for (let k = 0; k < lights.length; k++) {
          const L = lights[k];
          const dx = L.x - x;
          const dz = L.z - z;
          const d2 = dx * dx + dz * dz;
          if (d2 > R2) continue;
          const h = L.y - recvY;
          const r2 = d2 + h * h;
          const cosr = h / Math.sqrt(r2);
          const e = (L.I * cosr * (ep === 1 ? cosr : Math.pow(cosr, ep))) / r2;
          if (e < 0.004) continue;
          if (!this.visible(x, recvY, z, L.x, L.y - 0.02, L.z)) continue;
          if (L.g === 0) e0 += e;
          else if (L.g === 1) ea += e;
          else eb += e;
        }
        const idx = j * res + i;
        E0[idx] = e0;
        EA[idx] = ea;
        EB[idx] = eb;
      }
      if (now() - tick > 4) {
        yield;
        tick = now();
      }
    }
    // suaviza a penumbra
    blur(E0, res, 1);
    blur(EA, res, 1);
    blur(EB, res, 1);
    // luz rebatida: borrão largo da luz total
    const tot = new Float32Array(res * res);
    for (let i = 0; i < tot.length; i++) tot[i] = E0[i] + (EA[i] + EB[i]) * 0.7;
    const rb = Math.max(2, Math.round(1.4 * tpm));
    blur(tot, res, rb);
    blur(tot, res, rb);
    yield;
    // oclusão de contato perto das paredes, pilares e objetos
    const data = new Uint8Array(res * res * 4);
    ch.lmTotal = new Float32Array(res * res);
    ch.lmA = EA;
    ch.lmB = EB;
    for (let j = 0; j < res; j++) {
      const z = oz + (j + 0.5) * ts;
      for (let i = 0; i < res; i++) {
        const x = ox + (i + 0.5) * ts;
        const idx = j * res + i;
        const ao = this.floorAO(x, z, ch);
        const r = (E0[idx] + tot[idx] * this.bounce + this.ambient) * ao;
        const a = EA[idx] * ao;
        const b = EB[idx] * ao;
        EA[idx] = a;
        EB[idx] = b;
        ch.lmTotal[idx] = r;
        const o = idx * 4;
        data[o] = Math.sqrt(clamp(r / 4, 0, 1)) * 255;
        data[o + 1] = Math.sqrt(clamp(a / 4, 0, 1)) * 255;
        data[o + 2] = Math.sqrt(clamp(b / 4, 0, 1)) * 255;
        data[o + 3] = clamp(this.dirt(x, z), 0, 1) * 255;
      }
    }
    const tex = new THREE.DataTexture(data, res, res, THREE.RGBAFormat, THREE.UnsignedByteType);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.colorSpace = THREE.NoColorSpace;
    tex.channel = 1;
    tex.needsUpdate = true;
    ch.lmTex = tex;
    yield;

    // 3) geometria
    const gWall = new GeoBuilder();
    const gFloor = new GeoBuilder();
    const gCeil = new GeoBuilder();
    const gPanel = new GeoBuilder();
    const gProp = new GeoBuilder();
    const gGlass = new GeoBuilder();
    const gExtra = new GeoBuilder();
    const G = { wall: gWall, floor: gFloor, ceil: gCeil, panel: gPanel, prop: gProp, glass: gGlass, extra: gExtra, lm };
    const layers = this.sharedLayers || {};
    for (const name in layers) G[name] = new GeoBuilder();
    for (let z = cz0; z < cz0 + N; z++) {
      for (let x = cx0; x < cx0 + N; x++) {
        this.buildEdge(G, EH, x, z);
        this.buildEdge(G, EV, x, z);
        const p = this.pillar(x, z);
        if (p > 0) this.buildPillar(G, x * c, z * c, p);
        const L = this.light(x, z);
        if (L) this.buildLight(G, L);
      }
    }
    this.buildFloorCeil(G, ch);
    for (const p of ch.props) if (p.draw) p.draw(G);
    if (this.buildExtra) this.buildExtra(G, ch, cx0, cz0);
    yield;

    // 4) malhas
    const add = (gb, mat, shared = false) => {
      if (gb.empty) return null;
      const mesh = new THREE.Mesh(gb.build(), mat);
      mesh.matrixAutoUpdate = false;
      mesh.userData.sharedMat = shared;
      mesh.castShadow = !!this.Q.flashShadow;
      mesh.receiveShadow = !!this.Q.flashShadow;
      this.scene.add(mesh);
      ch.meshes.push(mesh);
      return mesh;
    };
    const M = this.mats;
    add(gFloor, litMaterial(this.Q, { ...M.floor, lightMap: tex }));
    add(gWall, litMaterial(this.Q, { ...M.wall, lightMap: tex }));
    add(gCeil, litMaterial(this.Q, { ...M.ceil, lightMap: tex }));
    add(gProp, litMaterial(this.Q, { ...M.prop, lightMap: tex }));
    add(gExtra, litMaterial(this.Q, { ...(M.extra || M.prop), lightMap: tex }));
    const pm = add(gPanel, this.panelMat, true);
    if (pm) pm.castShadow = pm.receiveShadow = false;
    for (const name in layers) {
      const lm2 = add(G[name], layers[name], true);
      if (lm2) lm2.castShadow = false;
    }
    if (this.glassMat) {
      const gm = add(gGlass, this.glassMat, true);
      if (gm) {
        gm.castShadow = false;
        gm.renderOrder = 2;
      }
    }
    // 5) itens coletáveis
    for (const it of ch.items) {
      if (this.taken.has(it.key)) continue;
      it.light = this.lightLevel(it.x, it.z);
      this.game.items.spawn(it, this.dynamic);
    }
    this.chunks.set(key, ch);
    if (this.onChunkBuilt) this.onChunkBuilt(ch);
  }

  // Distância às superfícies verticais próximas → oclusão de contato no piso.
  floorAO(x, z, ch) {
    const c = this.cell;
    const cx = Math.floor(x / c);
    const cz = Math.floor(z / c);
    const lx = x - cx * c;
    const lz = z - cz * c;
    const hT = this.T / 2;
    let d = 9;
    const check = (kind, ix, iz, perp, along) => {
      const t = this.edge(kind, ix, iz);
      if (t === W.NONE) return;
      for (const p of this.pieces[t]) {
        if (p.y0 > 0.01) continue;
        const da = along < p.a0 ? p.a0 - along : along > p.a1 ? along - p.a1 : 0;
        const dd = Math.hypot(Math.max(0, perp - hT), da);
        if (dd < d) d = dd;
      }
    };
    check(EH, cx, cz, lz, lx);
    check(EH, cx, cz + 1, c - lz, lx);
    check(EV, cx, cz, lx, lz);
    check(EV, cx + 1, cz, c - lx, lz);
    // pilares nos cantos
    for (let k = 0; k < 4; k++) {
      const gx = cx + (k & 1);
      const gz = cz + (k >> 1);
      const p = this.pillar(gx, gz);
      if (p <= 0) continue;
      const ddx = Math.max(0, Math.abs(x - gx * c) - p / 2);
      const ddz = Math.max(0, Math.abs(z - gz * c) - p / 2);
      d = Math.min(d, Math.hypot(ddx, ddz));
    }
    for (const p of ch.props) {
      if (!p.ao) continue;
      const b = p.ao;
      const ddx = Math.max(0, b[0] - x, x - b[1]);
      const ddz = Math.max(0, b[2] - z, z - b[3]);
      if (ddx > 0.8 || ddz > 0.8) continue;
      d = Math.min(d, Math.hypot(ddx, ddz) + (b[4] || 0));
    }
    return 1 - 0.5 * Math.exp(-d / 0.16) - 0.12 * Math.exp(-d / 0.6);
  }

  // Sombreamento vertical das paredes: escuro junto ao piso e ao teto.
  wallShade(y) {
    const H = this.H;
    let k = 1 - 0.45 * Math.exp(-y / 0.1) - 0.12 * Math.exp(-y / 0.45);
    k *= 1 - 0.3 * Math.exp(-(H - y) / 0.12);
    k *= 0.9 + 0.16 * (y / H);
    return k;
  }

  wallRows(y0, y1) {
    const H = this.H;
    const rows = [y0];
    for (const y of [0.04, 0.12, 0.3, 0.7, H * 0.5, H - 0.45, H - 0.15, H - 0.04]) if (y > y0 + 0.01 && y < y1 - 0.01) rows.push(y);
    rows.push(y1);
    return rows;
  }

  // Monta uma face vertical subdividida em altura.
  vface(gb, ax, az, bx, bz, y0, y1, n, uA, uB, lmFn) {
    const rows = this.wallRows(y0, y1);
    const vr = this.wallUV[1];
    const off = 0.25;
    const la = lmFn(ax + n[0] * off, az + n[2] * off);
    const lb = lmFn(bx + n[0] * off, bz + n[2] * off);
    for (let r = 0; r < rows.length - 1; r++) {
      const ya = rows[r];
      const yb = rows[r + 1];
      const ka = this.wallShade(ya);
      const kb = this.wallShade(yb);
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
        [
          [ka, ka, ka],
          [ka, ka, ka],
          [kb, kb, kb],
          [kb, kb, kb],
        ],
      );
    }
  }

  hface(gb, x0, x1, z0, z1, y, up, lmFn, uvs = 1, shade = 1) {
    const l = (x, z) => lmFn(x, z);
    const c = [shade, shade, shade];
    const pts = up
      ? [
          [x0, y, z1],
          [x1, y, z1],
          [x1, y, z0],
          [x0, y, z0],
        ]
      : [
          [x0, y, z0],
          [x1, y, z0],
          [x1, y, z1],
          [x0, y, z1],
        ];
    const lmv = [];
    const uv = [];
    for (const p of pts) {
      lmv.push(...l(p[0], p[2]));
      uv.push(p[0] / uvs, p[2] / uvs);
    }
    gb.quad(pts, [0, up ? 1 : -1, 0], uv, lmv, [c, c, c, c]);
  }

  buildEdge(G, kind, ix, iz) {
    const t = this.edge(kind, ix, iz);
    if (t === W.NONE) return;
    const c = this.cell;
    const hT = this.T / 2;
    const ps = this.pieces[t];
    const c0 = this.cornerInfo(kind, ix, iz, 0);
    const c1 = this.cornerInfo(kind, ix, iz, 1);
    const ur = this.wallUV[0];
    const gb = G.wall;
    for (const p of ps) {
      const atStart = p.a0 === 0 && p.y0 === 0 && p.y1 === this.H;
      const atEnd = p.a1 === c && p.y0 === 0 && p.y1 === this.H;
      const e0 = atStart ? c0.ext : 0;
      const e1 = atEnd ? c1.ext : 0;
      const cap0 = atStart ? c0.cap : true;
      const cap1 = atEnd ? c1.cap : true;
      const a0 = p.a0 - e0;
      const a1 = p.a1 + e1;
      if (kind === EH) {
        const zc = iz * c;
        const xa = ix * c + a0;
        const xb = ix * c + a1;
        this.vface(gb, xa, zc + hT, xb, zc + hT, p.y0, p.y1, [0, 0, 1], xa / ur, xb / ur, G.lm);
        this.vface(gb, xb, zc - hT, xa, zc - hT, p.y0, p.y1, [0, 0, -1], -xb / ur, -xa / ur, G.lm);
        if (cap0) this.vface(gb, xa, zc - hT, xa, zc + hT, p.y0, p.y1, [-1, 0, 0], 0, this.T / ur, G.lm);
        if (cap1) this.vface(gb, xb, zc + hT, xb, zc - hT, p.y0, p.y1, [1, 0, 0], 0, this.T / ur, G.lm);
        if (p.y0 > 0) this.hface(gb, xa, xb, zc - hT, zc + hT, p.y0, false, G.lm, ur, 0.75);
        if (p.y1 < this.H) this.hface(gb, xa, xb, zc - hT, zc + hT, p.y1, true, G.lm, ur, 1);
      } else {
        const xc = ix * c;
        const za = iz * c + a0;
        const zb = iz * c + a1;
        this.vface(gb, xc - hT, za, xc - hT, zb, p.y0, p.y1, [-1, 0, 0], za / ur, zb / ur, G.lm);
        this.vface(gb, xc + hT, zb, xc + hT, za, p.y0, p.y1, [1, 0, 0], -zb / ur, -za / ur, G.lm);
        if (cap0) this.vface(gb, xc + hT, za, xc - hT, za, p.y0, p.y1, [0, 0, -1], 0, this.T / ur, G.lm);
        if (cap1) this.vface(gb, xc - hT, zb, xc + hT, zb, p.y0, p.y1, [0, 0, 1], 0, this.T / ur, G.lm);
        if (p.y0 > 0) this.hface(gb, xc - hT, xc + hT, za, zb, p.y0, false, G.lm, ur, 0.75);
        if (p.y1 < this.H) this.hface(gb, xc - hT, xc + hT, za, zb, p.y1, true, G.lm, ur, 1);
      }
    }
    if (t === W.GLASS && G.glass) this.buildGlass(G, kind, ix, iz);
    if (this.decorateEdge) this.decorateEdge(G, kind, ix, iz, t);
  }

  buildGlass(G, kind, ix, iz) {
    const c = this.cell;
    const s = this.glassSpan;
    const pts =
      kind === EH
        ? [
            [ix * c + s.a0, s.y0, iz * c],
            [ix * c + s.a1, s.y0, iz * c],
            [ix * c + s.a1, s.y1, iz * c],
            [ix * c + s.a0, s.y1, iz * c],
          ]
        : [
            [ix * c, s.y0, iz * c + s.a1],
            [ix * c, s.y0, iz * c + s.a0],
            [ix * c, s.y1, iz * c + s.a0],
            [ix * c, s.y1, iz * c + s.a1],
          ];
    const n = kind === EH ? [0, 0, 1] : [-1, 0, 0];
    G.glass.quad(pts, n, [0, 0, 1, 0, 1, 1, 0, 1], null, null);
  }

  buildPillar(G, x, z, size) {
    const h = size / 2;
    const ur = this.wallUV[0];
    const gb = G.wall;
    this.vface(gb, x - h, z + h, x + h, z + h, 0, this.H, [0, 0, 1], (x - h) / ur, (x + h) / ur, G.lm);
    this.vface(gb, x + h, z - h, x - h, z - h, 0, this.H, [0, 0, -1], (x - h) / ur, (x + h) / ur, G.lm);
    this.vface(gb, x - h, z - h, x - h, z + h, 0, this.H, [-1, 0, 0], (z - h) / ur, (z + h) / ur, G.lm);
    this.vface(gb, x + h, z + h, x + h, z - h, 0, this.H, [1, 0, 0], (z - h) / ur, (z + h) / ur, G.lm);
  }

  // Luminária embutida no forro (padrão).
  buildLight(G, L) {
    const y = this.H - 0.004;
    const hw = (L.ax === 0 ? L.len : L.wid) / 2;
    const hd = (L.ax === 0 ? L.wid : L.len) / 2;
    const pts = [
      [L.x - hw, y, L.z - hd],
      [L.x + hw, y, L.z - hd],
      [L.x + hw, y, L.z + hd],
      [L.x - hw, y, L.z + hd],
    ];
    const uv = L.ax === 0 ? [0, 0, 0, 1, 1, 1, 1, 0] : [0, 0, 1, 0, 1, 1, 0, 1];
    G.panel.quad(pts, [0, -1, 0], uv, null, null, L.group);
  }

  buildFloorCeil(G, ch) {
    const x0 = ch.x0;
    const z0 = ch.z0;
    const x1 = x0 + this.S;
    const z1 = z0 + this.S;
    this.hface(G.floor, x0, x1, z0, z1, 0, true, G.lm, this.floorUV);
    this.hface(G.ceil, x0, x1, z0, z1, this.H, false, G.lm, this.ceilUV);
  }

  // ------------------------------------------------------------ luzes que piscam
  // Cada grupo alterna entre longos períodos acesos e surtos de oscilação.
  updateFlicker(dt) {
    if (!this.flick) {
      this.flick = [0, 1].map((i) => ({ v: 1, timer: 1 + i * 2.3, burst: 0, tog: 0, dim: 1 }));
    }
    const out = [];
    for (const f of this.flick) {
      f.timer -= dt;
      if (f.burst > 0) {
        f.burst -= dt;
        f.tog -= dt;
        if (f.tog <= 0) {
          f.tog = 0.03 + Math.random() * 0.12;
          const prev = f.v;
          f.v = Math.random() < 0.55 ? 0.05 + Math.random() * 0.15 : 0.7 + Math.random() * 0.4;
          if (prev > 0.5 && f.v < 0.5) f.clicked = true;
        }
        if (f.burst <= 0) {
          f.v = Math.random() < (this.deadChance || 0) ? 0.02 : 1;
          f.timer = 2 + Math.random() * (this.flickerGap || 7);
        }
      } else if (f.timer <= 0) {
        f.burst = 0.25 + Math.random() * 1.4;
        f.tog = 0;
      }
      out.push(f.v);
    }
    return out;
  }

  // Atualização por quadro comum aos níveis em grade.
  update(dt, player) {
    this.updateChunks(player.pos.x, player.pos.z);
    const [a, b] = this.updateFlicker(dt);
    const g = this.game.power;
    this.game.lmScale.set(g, a * g, b * g);
    const pi = this.panelI || 6;
    if (this.panelMat) this.panelMat.uniforms.uGroupI.value.set(pi * g, pi * a * g, pi * b * g, 0.0);
    for (let i = 0; i < 2; i++) {
      const f = this.flick[i];
      if (f.clicked) {
        f.clicked = false;
        const lvl = this.chunkAt(player.pos.x, player.pos.z);
        if (lvl) {
          const near = this.groupNear(player.pos.x, player.pos.z, i + 1);
          if (near > 0.02) this.game.audio.crackle(Math.min(1, near * 2));
        }
      }
    }
    if (this.tick) this.tick(dt, player);
  }

  // Quanto da luz no ponto vem do grupo (1 = A, 2 = B).
  groupNear(x, z, g) {
    const ch = this.chunkAt(x, z);
    if (!ch || !ch.lmA) return 0;
    const span = this.S + this.pad * 2;
    const res = ch.res;
    const ix = clamp(Math.floor(((x - ch.x0 + this.pad) / span) * res), 0, res - 1);
    const iz = clamp(Math.floor(((z - ch.z0 + this.pad) / span) * res), 0, res - 1);
    return (g === 1 ? ch.lmA : ch.lmB)[iz * res + ix];
  }

  // ------------------------------------------------------------ colisão
  // Empurra um círculo (x,z,raio) para fora das paredes. Retorna a posição corrigida.
  collide(p, r) {
    const c = this.cell;
    const hT = this.T / 2;
    const cx = Math.floor(p.x / c);
    const cz = Math.floor(p.z / c);
    for (let iter = 0; iter < 2; iter++) {
      for (let iz = cz - 1; iz <= cz + 2; iz++) {
        for (let ix = cx - 1; ix <= cx + 2; ix++) {
          if (ix <= cx + 1) this.collideEdge(p, r, EH, ix, iz, hT);
          if (iz <= cz + 1) this.collideEdge(p, r, EV, ix, iz, hT);
          const pl = this.pillar(ix, iz);
          if (pl > 0) pushCircle(p, r, ix * c - pl / 2, ix * c + pl / 2, iz * c - pl / 2, iz * c + pl / 2);
        }
      }
      for (const k of this.nearChunks(p.x, p.z)) for (const b of k.colliders) pushCircle(p, r, b[0], b[1], b[2], b[3]);
    }
    return p;
  }

  nearChunks(x, z) {
    const out = [];
    const S = this.S;
    const fx = Math.floor((x - 2) / S);
    const tx = Math.floor((x + 2) / S);
    const fz = Math.floor((z - 2) / S);
    const tz = Math.floor((z + 2) / S);
    for (let a = fz; a <= tz; a++)
      for (let b = fx; b <= tx; b++) {
        const ch = this.chunks.get(this.chunkKey(b, a));
        if (ch) out.push(ch);
      }
    return out;
  }

  collideEdge(p, r, kind, ix, iz, hT) {
    const t = this.edge(kind, ix, iz);
    if (t === W.NONE) return;
    const c = this.cell;
    for (const q of this.pieces[t]) {
      if (q.y0 > 1.6) continue;
      if (kind === EH) pushCircle(p, r, ix * c + q.a0 - hT, ix * c + q.a1 + hT, iz * c - hT, iz * c + hT);
      else pushCircle(p, r, ix * c - hT, ix * c + hT, iz * c + q.a0 - hT, iz * c + q.a1 + hT);
    }
    if (t === W.GLASS) {
      const s = this.glassSpan;
      if (kind === EH) pushCircle(p, r, ix * c + s.a0, ix * c + s.a1, iz * c - 0.03, iz * c + 0.03);
      else pushCircle(p, r, ix * c - 0.03, ix * c + 0.03, iz * c + s.a0, iz * c + s.a1);
    }
  }

  // Linha de visão para entidades (altura dos olhos).
  los(x0, z0, x1, z1, y = 1.5) {
    return this.visible(x0, y, z0, x1, y, z1);
  }

  // Força uma rota aberta entre duas células (portas onde havia parede).
  carve(ax, az, bx, bz, rnd) {
    let x = ax;
    let z = az;
    const open = (kind, ix, iz) => {
      const t = this.edge(kind, ix, iz);
      if (t === W.FULL || t === W.GLASS || t === W.WINDOW) this.setEdge(kind, ix, iz, W.DOOR);
    };
    let guard = 4000;
    while ((x !== bx || z !== bz) && guard-- > 0) {
      const rx = Math.abs(bx - x);
      const rz = Math.abs(bz - z);
      const goX = rz === 0 || (rx > 0 && rnd() < rx / (rx + rz));
      if (goX) {
        const s = Math.sign(bx - x);
        open(EV, s > 0 ? x + 1 : x, z);
        x += s;
      } else {
        const s = Math.sign(bz - z);
        open(EH, x, s > 0 ? z + 1 : z);
        z += s;
      }
    }
  }

  // Abre as paredes ao redor de uma célula (vira porta).
  clearCell(cx, cz) {
    const open = (kind, ix, iz) => {
      const t = this.edge(kind, ix, iz);
      if (t !== W.NONE && t !== W.DOOR && t !== W.EXIT) this.setEdge(kind, ix, iz, W.DOOR);
    };
    open(EH, cx, cz);
    open(EH, cx, cz + 1);
    open(EV, cx, cz);
    open(EV, cx + 1, cz);
  }

  hashCell(x, z, k) {
    return hash3(x * 7 + k * 131, z * 13 - k * 17, this.seed);
  }
}

// Empurra o círculo para fora de um retângulo XZ.
export function pushCircle(p, r, x0, x1, z0, z1) {
  const qx = p.x < x0 ? x0 : p.x > x1 ? x1 : p.x;
  const qz = p.z < z0 ? z0 : p.z > z1 ? z1 : p.z;
  const dx = p.x - qx;
  const dz = p.z - qz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return false;
  if (d2 > 1e-10) {
    const d = Math.sqrt(d2);
    p.x = qx + (dx / d) * r;
    p.z = qz + (dz / d) * r;
  } else {
    // centro dentro do retângulo: sai pelo lado mais próximo
    const l = p.x - x0;
    const rr = x1 - p.x;
    const t = p.z - z0;
    const b = z1 - p.z;
    const m = Math.min(l, rr, t, b);
    if (m === l) p.x = x0 - r;
    else if (m === rr) p.x = x1 + r;
    else if (m === t) p.z = z0 - r;
    else p.z = z1 + r;
  }
  return true;
}

// Borrão de caixa separável in-place (bordas presas).
function blur(a, n, r) {
  if (r <= 0) return;
  const tmp = new Float32Array(a.length);
  const w = 1 / (2 * r + 1);
  for (let j = 0; j < n; j++) {
    const row = j * n;
    let s = 0;
    for (let k = -r; k <= r; k++) s += a[row + clamp(k, 0, n - 1)];
    for (let i = 0; i < n; i++) {
      tmp[row + i] = s * w;
      s += a[row + Math.min(n - 1, i + r + 1)] - a[row + Math.max(0, i - r)];
    }
  }
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let k = -r; k <= r; k++) s += tmp[clamp(k, 0, n - 1) * n + i];
    for (let j = 0; j < n; j++) {
      a[j * n + i] = s * w;
      s += tmp[Math.min(n - 1, j + r + 1) * n + i] - tmp[Math.max(0, j - r) * n + i];
    }
  }
}
