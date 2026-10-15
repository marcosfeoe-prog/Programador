// Área fechada feita de células (salas e corredores) com a luz "assada" nos
// vértices: cada vértice guarda quanta luz recebe das lâmpadas da área (com
// queda pela distância e bloqueio pelas paredes). O material soma essa luz
// como brilho próprio, e a lanterna do jogador continua funcionando por cima.
// Usada nas áreas secretas que ficam longe da grade principal do nível.
import * as THREE from 'three';
import { GeoBuilder } from '../materials.js';
import { pushCircle } from './grid.js';
import { clamp } from '../util.js';

// Material com luz assada (atributo aBake) somada como emissão.
export function bakedMaterial(Q, o = {}) {
  const p = { color: o.color !== undefined ? o.color : 0xffffff, vertexColors: true };
  if (o.map) p.map = o.map;
  if (Q.normalMaps && o.normalMap) p.normalMap = o.normalMap;
  if (o.transparent) {
    p.transparent = true;
    p.opacity = o.opacity ?? 1;
  }
  if (!Q.lambert) {
    p.roughness = o.roughness ?? 0.9;
    p.metalness = o.metalness || 0;
    if (o.envMap && Q.envMap) {
      p.envMap = o.envMap;
      p.envMapIntensity = o.envIntensity ?? 0.3;
    }
  }
  const m = Q.lambert ? new THREE.MeshLambertMaterial(p) : new THREE.MeshStandardMaterial(p);
  const tint = new THREE.Color(...(o.light || [1, 0.85, 0.65]));
  m.userData.bakeColor = tint;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uBakeColor = { value: tint };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aBake;\nvarying float vBake;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBake = aBake;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vBake;\nuniform vec3 uBakeColor;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vBake * uBakeColor;');
  };
  m.customProgramCacheKey = () => 'liminar-baked';
  return m;
}

export class CellArea {
  // cfg: { ox, oz, cell, H, open: [[i, j], …], lights: [{ x, y, z, I }], ambient,
  //        wall/floor/ceil: { mat, uvW, uvH, tint } }
  constructor(game, cfg) {
    this.game = game;
    Object.assign(this, { ambient: 0.02, radius: 13 }, cfg);
    this.set = new Set(cfg.open.map(([i, j]) => this.k(i, j)));
    this.extra = [];
    this.group = new THREE.Group();
    game.scene.add(this.group);
    this.geos = [];
  }

  k(i, j) {
    return (i + 1000) * 4000 + (j + 1000);
  }

  isOpen(i, j) {
    return this.set.has(this.k(i, j));
  }

  cellAt(x, z) {
    return [Math.floor((x - this.ox) / this.cell), Math.floor((z - this.oz) / this.cell)];
  }

  openAt(x, z) {
    const [i, j] = this.cellAt(x, z);
    return this.isOpen(i, j);
  }

  // Segmento entre dois pontos passa só por células abertas?
  clear(x0, z0, x1, z1) {
    const d = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.ceil(d / 0.35);
    for (let s = 1; s < n; s++) {
      const t = s / n;
      if (!this.openAt(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t)) return false;
    }
    return true;
  }

  // Luz recebida num ponto (com normal opcional).
  bake(x, y, z, n) {
    let e = this.ambient;
    // um pouco para dentro da célula, para as paredes não se auto-bloquearem
    const px = n ? x + n[0] * 0.05 : x;
    const pz = n ? z + n[2] * 0.05 : z;
    for (const L of this.lights) {
      const dx = L.x - px;
      const dy = L.y - y;
      const dz = L.z - pz;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > this.radius * this.radius) continue;
      const d = Math.sqrt(d2) || 1e-3;
      let cos = 1;
      if (n) cos = (dx * n[0] + dy * n[1] + dz * n[2]) / d;
      if (cos <= 0) continue;
      if (!this.clear(px, pz, L.x, L.z)) continue;
      e += (L.I * (0.25 + 0.75 * cos)) / (d2 + 0.8);
    }
    return e;
  }

  lightLevel(x, z) {
    return this.bake(x, 0.1, z, [0, 1, 0]);
  }

  // Funções de lightmap para os GeoBuilders: u = luz assada.
  lmAt(y = 1.2) {
    return (x, z) => [this.bake(x, y, z, null), 0];
  }

  wallShade(y, H) {
    let k = 1 - 0.4 * Math.exp(-y / 0.1) - 0.1 * Math.exp(-y / 0.45);
    k *= 1 - 0.25 * Math.exp(-(H - y) / 0.12);
    return k;
  }

  build() {
    const c = this.cell;
    const H = this.H;
    const W = new GeoBuilder();
    const F = new GeoBuilder();
    const Cl = new GeoBuilder();
    const rows = [0, 0.12, 0.45, 1.0, H * 0.5, H - 0.5, H];
    const wt = this.wall.tint || [1, 1, 1];
    const ft = this.floor.tint || [1, 1, 1];
    const ct = this.ceil.tint || [1, 1, 1];
    const sub = Math.max(1, Math.round(c / 1.1));
    for (const key of this.set) {
      const i = Math.floor(key / 4000) - 1000;
      const j = (key % 4000) - 1000;
      const x0 = this.ox + i * c;
      const z0 = this.oz + j * c;
      // piso e teto subdivididos
      for (let a = 0; a < sub; a++)
        for (let b = 0; b < sub; b++) {
          const xa = x0 + (a * c) / sub;
          const xb = x0 + ((a + 1) * c) / sub;
          const za = z0 + (b * c) / sub;
          const zb = z0 + ((b + 1) * c) / sub;
          const fl = [];
          const cl = [];
          const up = [
            [xa, 0, zb],
            [xb, 0, zb],
            [xb, 0, za],
            [xa, 0, za],
          ];
          for (const p of up) fl.push(this.bake(p[0], 0.05, p[2], [0, 1, 0]), 0);
          const dn = [
            [xa, H, za],
            [xb, H, za],
            [xb, H, zb],
            [xa, H, zb],
          ];
          for (const p of dn) cl.push(this.bake(p[0], H - 0.05, p[2], [0, -1, 0]), 0);
          const fu = this.floor.uv || 2;
          const cu = this.ceil.uv || 2;
          const ftc = this.tintAt ? this.tintAt(i, j, 'floor') || ft : ft;
          F.quad(up, [0, 1, 0], up.flatMap((p) => [p[0] / fu, p[2] / fu]), fl, [ftc, ftc, ftc, ftc]);
          Cl.quad(dn, [0, -1, 0], dn.flatMap((p) => [p[0] / cu, p[2] / cu]), cl, [ct, ct, ct, ct]);
        }
      // paredes onde a vizinha é fechada
      for (const [di, dj] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        if (this.isOpen(i + di, j + dj)) continue;
        if (this.skip && this.skip.has(`${i},${j},${di},${dj}`)) continue;
        const n = [-di, 0, -dj];
        let ax, az, bx, bz;
        if (di === 1) [ax, az, bx, bz] = [x0 + c, z0, x0 + c, z0 + c];
        else if (di === -1) [ax, az, bx, bz] = [x0, z0 + c, x0, z0];
        else if (dj === 1) [ax, az, bx, bz] = [x0 + c, z0 + c, x0, z0 + c];
        else [ax, az, bx, bz] = [x0, z0, x0 + c, z0];
        const uw = this.wall.uvW || 2;
        const uh = this.wall.uvH || H;
        for (let s = 0; s < sub; s++) {
          const t0 = s / sub;
          const t1 = (s + 1) / sub;
          const pa = [ax + (bx - ax) * t0, az + (bz - az) * t0];
          const pb = [ax + (bx - ax) * t1, az + (bz - az) * t1];
          const ua = (Math.abs(n[0]) ? pa[1] : pa[0]) / uw;
          const ub = (Math.abs(n[0]) ? pb[1] : pb[0]) / uw;
          const dirU = di === 1 || dj === -1 ? 1 : -1;
          for (let r = 0; r < rows.length - 1; r++) {
            const ya = rows[r];
            const yb = rows[r + 1];
            const ka = this.wallShade(ya, H);
            const kb = this.wallShade(yb, H);
            const w2 = this.tintAt ? this.tintAt(i, j, 'wall') || wt : wt;
            const ca = [w2[0] * ka, w2[1] * ka, w2[2] * ka];
            const cb = [w2[0] * kb, w2[1] * kb, w2[2] * kb];
            const pts = [
              [pa[0], ya, pa[1]],
              [pb[0], ya, pb[1]],
              [pb[0], yb, pb[1]],
              [pa[0], yb, pa[1]],
            ];
            const lm = [];
            for (const p of pts) lm.push(this.bake(p[0], p[1], p[2], n), 0);
            W.quad(pts, n, [ua * dirU, ya / uh, ub * dirU, ya / uh, ub * dirU, yb / uh, ua * dirU, yb / uh], lm, [ca, ca, cb, cb]);
          }
        }
      }
    }
    this.addMesh(W, this.wall.mat);
    this.addMesh(F, this.floor.mat);
    this.addMesh(Cl, this.ceil.mat);
  }

  // Converte uv1.x em aBake e cria a malha.
  addMesh(gb, mat) {
    if (gb.empty) return null;
    const geo = gb.build();
    const uv1 = geo.attributes.uv1;
    const bake = new Float32Array(uv1.count);
    for (let i = 0; i < uv1.count; i++) bake[i] = uv1.getX(i);
    geo.setAttribute('aBake', new THREE.BufferAttribute(bake, 1));
    const m = new THREE.Mesh(geo, mat);
    m.matrixAutoUpdate = false;
    this.group.add(m);
    this.geos.push(geo);
    return m;
  }

  collide(p, r) {
    const c = this.cell;
    for (let it = 0; it < 2; it++) {
      const [ci, cj] = this.cellAt(p.x, p.z);
      for (let j = cj - 1; j <= cj + 1; j++)
        for (let i = ci - 1; i <= ci + 1; i++) {
          if (this.isOpen(i, j)) continue;
          const x0 = this.ox + i * c;
          const z0 = this.oz + j * c;
          pushCircle(p, r, x0, x0 + c, z0, z0 + c);
        }
      for (const b of this.extra) {
        if (p.x < b[0] - 1 || p.x > b[1] + 1 || p.z < b[2] - 1 || p.z > b[3] + 1) continue;
        pushCircle(p, r, b[0], b[1], b[2], b[3]);
      }
    }
    return p;
  }

  los(x0, z0, x1, z1) {
    return this.clear(x0, z0, x1, z1);
  }

  dispose() {
    this.game.scene.remove(this.group);
    for (const g of this.geos) g.dispose();
    this.group.traverse((o) => {
      if (o.geometry && !this.geos.includes(o.geometry)) o.geometry.dispose();
    });
  }
}

// Brilho por distância para malhas soltas (sem luz assada).
export function fadeK(d, near, far) {
  return clamp(1 - (d - near) / (far - near), 0, 1);
}
