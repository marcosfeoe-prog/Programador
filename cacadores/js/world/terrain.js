// Relevo de cada país: campo de alturas, rios escavados, malha do terreno do mapa e o
// terreno de fundo até o horizonte (com a Cordilheira dos Andes no Chile).

import * as THREE from 'three';
import { Noise } from '../core/noise.js';
import { WORLD } from '../config.js';
import { smoothstep, segDist } from '../core/math.js';

export class Terrain {
  constructor(country, seed, segs) {
    this.country = country;
    this.cfg = country.terrain;
    this.noise = new Noise(seed);
    this.noise2 = new Noise(seed + 77);
    this.N = segs;
    this.half = WORLD.half;
    this.cell = (2 * this.half) / segs;
    this.rivers = (country.rivers || []).map((r) => ({ ...r }));
    this.cityFlat = [];
    this.h = new Float32Array((segs + 1) * (segs + 1));
  }

  // Altura "analítica" (antes da malha). Usada para gerar a grade e o fundo.
  rawHeight(x, z) {
    const c = this.cfg;
    const n = this.noise;
    let h = n.fbm2(x / c.scale, z / c.scale, 5) * c.amp;
    if (c.hills > 0.2) {
      // Morros e vales encaixados (Brasil, Uruguai, Chile).
      const r = n.ridge2(x / (c.scale * 1.3) + 9.1, z / (c.scale * 1.3) - 3.7, 4);
      h += (r - 0.45) * c.amp * 1.4 * c.hills;
    }
    h += this.noise2.fbm2(x / 700, z / 700, 3) * c.amp * 0.06 * c.rough;
    if (c.coastRange) {
      // Cordilheira da Costa no oeste do Chile.
      const k = smoothstep(-1500, -8000, x);
      h += k * (180 + n.ridge2(x / 2400, z / 2400, 4) * 260);
    }
    if (c.ocean !== undefined) {
      const coast = c.ocean + n.fbm2(z / 3000, 4.2, 3) * 900;
      const k = smoothstep(coast + 1200, coast - 300, x);
      h = h * (1 - k) + k * -14;
    }
    // Rios: vale com fundo abaixo das margens.
    for (const rv of this.rivers) {
      let best = 1e9;
      const p = rv.pts;
      for (let i = 0; i < p.length - 1; i++) {
        const d = segDist(x, z, p[i][0], p[i][1], p[i + 1][0], p[i + 1][1]).d;
        if (d < best) best = d;
      }
      const w = rv.width * 0.5;
      const valley = Math.max(w * 6, 500 + c.amp * 6);
      const depth = Math.min(30, 4 + c.amp * 0.25 + rv.width * 0.02);
      const k1 = smoothstep(valley, w, best);
      h -= k1 * (depth * 0.6 + Math.max(0, h) * 0.5);
      const k2 = smoothstep(w + 25, w * 0.6, best);
      h -= k2 * depth * 0.6;
    }
    // Cidades em terreno mais suave.
    for (const cf of this.cityFlat) {
      const d = Math.hypot(x - cf.x, z - cf.z);
      const k = smoothstep(cf.r * 1.6, cf.r * 0.6, d);
      if (k > 0) h = h * (1 - k * 0.7) + cf.h * k * 0.7;
    }
    return h;
  }

  build() {
    const N = this.N;
    const H = this.half;
    // Altura de referência das cidades (média local suavizada).
    for (const c of this.country.cities) {
      const r = [420, 420, 650, 900][c.size] || 650;
      this.cityFlat.push({ x: c.x, z: c.z, r, h: 0 });
    }
    const saved = this.cityFlat;
    this.cityFlat = [];
    for (const cf of saved) {
      let s = 0;
      for (let k = 0; k < 9; k++) s += this.rawHeight(cf.x + ((k % 3) - 1) * cf.r * 0.5, cf.z + (Math.floor(k / 3) - 1) * cf.r * 0.5);
      cf.h = s / 9;
    }
    this.cityFlat = saved;
    for (let j = 0; j <= N; j++)
      for (let i = 0; i <= N; i++) this.h[j * (N + 1) + i] = this.rawHeight(-H + i * this.cell, -H + j * this.cell);
    // Nível da água dos rios (decresce rio abaixo).
    for (const rv of this.rivers) {
      const pts = [];
      const p = rv.pts;
      for (let i = 0; i < p.length - 1; i++) {
        const L = Math.hypot(p[i + 1][0] - p[i][0], p[i + 1][1] - p[i][1]);
        const n = Math.max(1, Math.ceil(L / 60));
        for (let k = 0; k < n; k++) {
          const t = k / n;
          pts.push([p[i][0] + (p[i + 1][0] - p[i][0]) * t, p[i][1] + (p[i + 1][1] - p[i][1]) * t]);
        }
      }
      pts.push(p[p.length - 1]);
      let lvl = 1e9;
      rv.water = pts.map(([x, z]) => {
        let m = this.heightAt(x, z);
        for (const o of [-0.3, 0.3]) {
          const dx = 0;
          m = Math.min(m, this.heightAt(x + o * rv.width * 0.3 + dx, z + o * rv.width * 0.3));
        }
        lvl = Math.min(lvl, m + 0.8);
        return [x, lvl, z];
      });
    }
    return this;
  }

  // Altura exata da malha (interpolação nos triângulos da grade).
  heightAt(x, z) {
    const N = this.N;
    const H = this.half;
    if (x < -H || x > H || z < -H || z > H) return this.rawHeight(x, z);
    const fx0 = (x + H) / this.cell;
    const fz0 = (z + H) / this.cell;
    let i = Math.floor(fx0);
    let j = Math.floor(fz0);
    if (i >= N) i = N - 1;
    if (j >= N) j = N - 1;
    const fx = fx0 - i;
    const fz = fz0 - j;
    const W = N + 1;
    const ha = this.h[j * W + i];
    const hb = this.h[j * W + i + 1];
    const hc = this.h[(j + 1) * W + i];
    const hd = this.h[(j + 1) * W + i + 1];
    if (fx + fz <= 1) return ha + (hb - ha) * fx + (hc - ha) * fz;
    return hd + (hc - hd) * (1 - fx) + (hb - hd) * (1 - fz);
  }

  normalAt(x, z, out = new THREE.Vector3()) {
    const e = 2;
    const hx = this.heightAt(x + e, z) - this.heightAt(x - e, z);
    const hz = this.heightAt(x, z + e) - this.heightAt(x, z - e);
    return out.set(-hx, 2 * e, -hz).normalize();
  }

  slopeAt(x, z) {
    const e = 15;
    const hx = this.heightAt(x + e, z) - this.heightAt(x - e, z);
    const hz = this.heightAt(x, z + e) - this.heightAt(x, z - e);
    return Math.hypot(hx, hz) / (2 * e);
  }

  // Distância ao rio mais próximo (e se é água).
  waterAt(x, z) {
    for (const rv of this.rivers) {
      const p = rv.pts;
      for (let i = 0; i < p.length - 1; i++) {
        const d = segDist(x, z, p[i][0], p[i][1], p[i + 1][0], p[i + 1][1]).d;
        if (d < rv.width * 0.5) return true;
      }
    }
    const c = this.cfg;
    if (c.ocean !== undefined) return this.heightAt(x, z) < -1;
    return false;
  }

  mesh(material) {
    const N = this.N;
    const H = this.half;
    const W = N + 1;
    const pos = new Float32Array(W * W * 3);
    const uv = new Float32Array(W * W * 2);
    for (let j = 0; j <= N; j++)
      for (let i = 0; i <= N; i++) {
        const k = j * W + i;
        pos[k * 3] = -H + i * this.cell;
        pos[k * 3 + 1] = this.h[k];
        pos[k * 3 + 2] = -H + j * this.cell;
        uv[k * 2] = i / N;
        uv[k * 2 + 1] = 1 - j / N;
      }
    const idx = new Uint32Array(N * N * 6);
    let o = 0;
    for (let j = 0; j < N; j++)
      for (let i = 0; i < N; i++) {
        const a = j * W + i;
        const b = a + 1;
        const c = a + W;
        const d = c + 1;
        idx[o++] = a;
        idx[o++] = c;
        idx[o++] = b;
        idx[o++] = b;
        idx[o++] = c;
        idx[o++] = d;
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, material);
    m.receiveShadow = true;
    m.name = 'terrain';
    return m;
  }

  // Terreno de fundo: anel grande e de baixa resolução em volta do mapa.
  skirtMesh(material) {
    const R = WORLD.skirt;
    const N = 96;
    const H = this.half;
    const pos = [];
    const uv = [];
    const idx = [];
    // Grade não uniforme: mais densa perto do mapa.
    const coord = (t) => Math.sign(t) * Math.pow(Math.abs(t), 1.8) * R;
    const W = N + 1;
    for (let j = 0; j <= N; j++)
      for (let i = 0; i <= N; i++) {
        const x = coord((i / N) * 2 - 1);
        const z = coord((j / N) * 2 - 1);
        let y = this.rawHeight(x, z);
        const inside = Math.max(Math.abs(x), Math.abs(z));
        // Afunda um pouco dentro do mapa (fica escondido sob o terreno principal).
        if (inside < H - 100) y -= 40;
        if (this.cfg.andes) y += this.andes(x, z);
        pos.push(x, y, z);
        uv.push(x / (2 * H) + 0.5, 0.5 - z / (2 * H));
      }
    for (let j = 0; j < N; j++)
      for (let i = 0; i < N; i++) {
        const a = j * W + i;
        idx.push(a, a + W, a + 1, a + 1, a + W, a + W + 1);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, material);
    m.name = 'skirt';
    return m;
  }

  // Andes: cordilheira a 35–60 km a leste, com vulcões nevados (Antuco, Nevados de Chillán).
  andes(x, z) {
    if (x < 22000) return 0;
    const n = this.noise;
    const k = smoothstep(22000, 48000, x);
    let h = k * (1800 + n.ridge2(x / 9000, z / 9000, 5) * 2600);
    const volc = [
      [52000, 26000, 2985],
      [47000, -30000, 3212],
      [60000, -4000, 2600],
    ];
    for (const [vx, vz, vh] of volc) {
      const d = Math.hypot(x - vx, z - vz);
      h = Math.max(h, vh * Math.max(0, 1 - d / 14000) ** 1.6 + k * 900);
    }
    return h;
  }
}
