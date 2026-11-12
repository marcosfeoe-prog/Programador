// Árvores instanciadas por espécie (carvalho, cedro, choupo, eucalipto, araucária, pinus,
// abeto, álamo…), com balanço ao vento e estados de dano: galhos quebrados, arrancada,
// tronco partido e descascada.

import * as THREE from 'three';
import { RNG } from '../core/rng.js';
import { Noise } from '../core/noise.js';
import { mergeGeos } from './buildings.js';
import { patchWorld } from '../render/materials.js';
import { WORLD } from '../config.js';

const SPECIES = {
  oak: { h: [8, 14], trunkR: 0.28, trunkH: 0.35, crown: 'round', crownW: 0.75, color: '#4f6b2c', bark: 'bark' },
  broadleaf: { h: [9, 16], trunkR: 0.26, trunkH: 0.4, crown: 'round', crownW: 0.65, color: '#3f6326', bark: 'bark' },
  cottonwood: { h: [14, 22], trunkR: 0.4, trunkH: 0.35, crown: 'round', crownW: 0.7, color: '#5a7a32', bark: 'bark' },
  cedar: { h: [5, 9], trunkR: 0.18, trunkH: 0.12, crown: 'cone', crownW: 0.38, color: '#33452a', bark: 'bark' },
  spruce: { h: [10, 18], trunkR: 0.22, trunkH: 0.1, crown: 'cone', crownW: 0.3, color: '#22381f', bark: 'bark' },
  poplar: { h: [14, 22], trunkR: 0.25, trunkH: 0.12, crown: 'column', crownW: 0.16, color: '#4d6c2a', bark: 'bark' },
  pine: { h: [16, 26], trunkR: 0.25, trunkH: 0.55, crown: 'pine', crownW: 0.28, color: '#26401f', bark: 'bark' },
  eucalyptus: { h: [20, 32], trunkR: 0.28, trunkH: 0.5, crown: 'euca', crownW: 0.3, color: '#506a45', bark: 'barkLight' },
  araucaria: { h: [16, 26], trunkR: 0.32, trunkH: 0.7, crown: 'araucaria', crownW: 0.45, color: '#2c4422', bark: 'bark' },
};

function lumpy(geo, seed, amt) {
  const n = new Noise(seed);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const k = 1 + n.n2(x * 2.1 + y, z * 2.1 - y) * amt + n.n2(x * 5 + 3, z * 5 + y * 3) * amt * 0.4;
    p.setXYZ(i, x * k, y * (1 + (k - 1) * 0.6), z * k);
  }
  geo.computeVertexNormals();
  return geo;
}

// Gera as geometrias (tronco, copa) normalizadas para altura 1.
function speciesGeometry(name) {
  const sp = SPECIES[name];
  const th = sp.trunkH;
  const r = sp.trunkR / 10;
  let trunk = new THREE.CylinderGeometry(r * 0.55, r, sp.crown === 'euca' || sp.crown === 'pine' || sp.crown === 'araucaria' ? 0.96 : th + 0.12, 6, 1);
  trunk.translate(0, (sp.crown === 'euca' || sp.crown === 'pine' || sp.crown === 'araucaria' ? 0.96 : th + 0.12) / 2, 0);
  const parts = [];
  const w = sp.crownW;
  switch (sp.crown) {
    case 'round': {
      const blobs = [
        [0, th + (1 - th) * 0.5, 0, 0.52],
        [w * 0.35, th + (1 - th) * 0.42, 0.05, 0.38],
        [-w * 0.3, th + (1 - th) * 0.55, -0.1, 0.4],
        [0.05, th + (1 - th) * 0.4, -w * 0.28, 0.34],
      ];
      blobs.slice(0, 3).forEach(([x, y, z, s], i) => {
        const g = lumpy(new THREE.IcosahedronGeometry(1, 1), 11 + i, 0.2);
        g.scale((s * w) / 0.75, s * (1 - th) * 0.95, (s * w) / 0.75);
        g.translate(x, y, z);
        parts.push(g);
      });
      break;
    }
    case 'cone': {
      for (let k = 0; k < 3; k++) {
        const g = lumpy(new THREE.ConeGeometry(w * (0.5 - k * 0.1), (1 - th) * (0.62 - k * 0.12), 9, 2), 21 + k, 0.12);
        g.translate(0, th + (1 - th) * (0.3 + k * 0.24), 0);
        parts.push(g);
      }
      break;
    }
    case 'column': {
      const g = lumpy(new THREE.IcosahedronGeometry(1, 1), 31, 0.14);
      g.scale(w * 0.5, 0.5, w * 0.5);
      g.translate(0, 0.55, 0);
      parts.push(g);
      break;
    }
    case 'pine': {
      // Copa irregular no alto (pinus radiata de plantação).
      for (let k = 0; k < 3; k++) {
        const g = lumpy(new THREE.IcosahedronGeometry(1, 1), 41 + k, 0.25);
        g.scale(w * (0.55 - k * 0.08), 0.13, w * (0.55 - k * 0.08));
        g.translate((k % 2 ? 0.02 : -0.02) * w, 0.6 + k * 0.11, (k % 3 ? 0.02 : -0.03) * w);
        parts.push(g);
      }
      break;
    }
    case 'euca': {
      for (let k = 0; k < 3; k++) {
        const g = lumpy(new THREE.IcosahedronGeometry(1, 1), 51 + k, 0.3);
        const s = w * (0.45 - k * 0.06);
        g.scale(s, 0.11, s);
        g.translate(Math.sin(k * 2.1) * w * 0.25, 0.62 + k * 0.1, Math.cos(k * 1.7) * w * 0.25);
        parts.push(g);
      }
      break;
    }
    case 'araucaria': {
      // Copa em forma de taça/candelabro, achatada no topo.
      const pts = [];
      for (let k = 0; k <= 8; k++) {
        const t = k / 8;
        pts.push(new THREE.Vector2(w * (0.08 + Math.pow(t, 0.6) * 0.92), 0.78 + t * 0.15 - (t > 0.9 ? (t - 0.9) * 0.6 : 0)));
      }
      pts.push(new THREE.Vector2(w * 0.95, 0.95));
      pts.push(new THREE.Vector2(0.001, 0.97));
      const g = lumpy(new THREE.LatheGeometry(pts, 12), 61, 0.08);
      parts.push(g);
      // Galhos (tufos) abaixo da taça.
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        const b = lumpy(new THREE.IcosahedronGeometry(1, 1), 70 + k, 0.2);
        b.scale(w * 0.22, 0.04, w * 0.22);
        b.translate(Math.cos(a) * w * 0.55, 0.74, Math.sin(a) * w * 0.55);
        parts.push(b);
      }
      break;
    }
  }
  // Os UVs da copa vêm da projeção esférica (para a textura de folhas).
  const crown = mergeGeos(parts);
  const p = crown.attributes.position;
  const uv = crown.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    uv.setXY(i, (Math.atan2(z, x) / Math.PI) * 2 + 0.5, y * 3);
  }
  crown.computeVertexNormals();
  // Cor por vértice: copa mais escura embaixo e por dentro (oclusão).
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const rr = Math.hypot(p.getX(i), p.getZ(i));
    const k = 0.55 + 0.45 * Math.min(1, Math.max(0, (y - th) / (1 - th))) * (0.7 + 0.3 * Math.min(1, rr / (w * 0.5)));
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = k;
  }
  crown.setAttribute('color', new THREE.BufferAttribute(col, 3));
  // Tronco também ganha atributo de cor (necessário ao material com vertexColors).
  trunk = mergeGeos([trunk]);
  return { trunk, crown };
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

export class Vegetation {
  constructor(country, terrain, textures, seed, density) {
    this.country = country;
    this.terrain = terrain;
    this.rng = new RNG(seed);
    this.density = density;
    this.trees = [];
    this.textures = textures;
    this.geos = {};
    this.chunkN = 4;
  }

  add(species, x, z, scale = 1) {
    if (!SPECIES[species]) species = 'broadleaf';
    if (Math.abs(x) > WORLD.half - 5 || Math.abs(z) > WORLD.half - 5) return null;
    const sp = SPECIES[species];
    const h = (sp.h[0] + this.rng.next() * (sp.h[1] - sp.h[0])) * scale;
    const t = { species, x, z, y: this.terrain.heightAt(x, z) - 0.2, h, rot: this.rng.next() * Math.PI * 2, tint: this.rng.range(0.78, 1.15), state: 0, lean: 0, leanDir: 0 };
    this.trees.push(t);
    return t;
  }

  build(structures) {
    const group = new THREE.Group();
    group.name = 'trees';
    const barkMat = {
      bark: patchWorld(new THREE.MeshStandardMaterial({ map: this.textures.bark, roughness: 0.95 }), { sway: true, key: 'bark' }),
      barkLight: patchWorld(new THREE.MeshStandardMaterial({ map: this.textures.barkLight, roughness: 0.9 }), { sway: true, key: 'barkL' }),
    };
    const leafMat = patchWorld(new THREE.MeshStandardMaterial({ map: this.textures.foliage, vertexColors: true, roughness: 0.85 }), { sway: true, key: 'leaf', wet: 0.6 });
    // Agrupa por pedaço do mapa e espécie.
    const H = WORLD.half;
    const cs = WORLD.size / this.chunkN;
    const buckets = new Map();
    for (const t of this.trees) {
      const ci = Math.min(this.chunkN - 1, Math.floor((t.x + H) / cs));
      const cj = Math.min(this.chunkN - 1, Math.floor((t.z + H) / cs));
      const key = `${ci},${cj},${t.species}`;
      let b = buckets.get(key);
      if (!b) buckets.set(key, (b = []));
      b.push(t);
    }
    this.meshes = [];
    for (const [key, list] of buckets) {
      const species = key.split(',')[2];
      if (!this.geos[species]) this.geos[species] = speciesGeometry(species);
      const g = this.geos[species];
      const sp = SPECIES[species];
      const trunk = new THREE.InstancedMesh(g.trunk, barkMat[sp.bark], list.length);
      const crown = new THREE.InstancedMesh(g.crown, leafMat, list.length);
      trunk.castShadow = crown.castShadow = true;
      trunk.receiveShadow = crown.receiveShadow = true;
      const base = new THREE.Color(sp.color);
      list.forEach((t, i) => {
        t.trunkMesh = trunk;
        t.crownMesh = crown;
        t.idx = i;
        this.matrix(t);
        trunk.setMatrixAt(i, _m);
        crown.setMatrixAt(i, _m);
        _c.copy(base).multiplyScalar(t.tint);
        if (species === 'eucalyptus') _c.offsetHSL(0.02, -0.05, 0);
        crown.setColorAt(i, _c);
        trunk.setColorAt(i, _c.setRGB(1, 1, 1));
        if (structures) {
          const s = structures.add({ kind: 'tree', di: 'tree', x: t.x, z: t.z, y: t.y, r: t.h * 0.2, h: t.h, tree: t, minor: true });
          t.struct = s;
        }
      });
      trunk.computeBoundingSphere();
      crown.computeBoundingSphere();
      group.add(trunk, crown);
      this.meshes.push(trunk, crown);
    }
    this.group = group;
    return group;
  }

  matrix(t, extra = null) {
    // Inclinação/queda na direção do vento.
    _e.set(0, t.rot, 0);
    _q.setFromEuler(_e);
    if (t.lean) {
      const ax = new THREE.Vector3(Math.cos(t.leanDir + Math.PI / 2), 0, Math.sin(t.leanDir + Math.PI / 2));
      const ql = new THREE.Quaternion().setFromAxisAngle(ax, t.lean);
      _q.premultiply(ql);
    }
    const sy = extra?.sy ?? 1;
    _m.compose(_p.set(t.x, t.y, t.z), _q, _s.set(t.h, t.h * sy, t.h));
    return _m;
  }

  // Estados: 1 galhos quebrados, 2 arrancada (deitada), 3 tronco partido, 4 descascada.
  setState(t, state, windDir) {
    if (state <= t.state) return;
    t.state = state;
    if (state === 1) {
      t.crownMesh.getColorAt(t.idx, _c);
      _c.multiplyScalar(0.8);
      t.crownMesh.setColorAt(t.idx, _c);
      t.crownMesh.instanceColor.needsUpdate = true;
      t.lean = 0.12;
      t.leanDir = windDir;
    } else if (state === 2) {
      t.lean = Math.PI / 2 - 0.08;
      t.leanDir = windDir;
      t.y += 0.3;
    } else if (state >= 3) {
      t.lean = 0.05;
      t.leanDir = windDir;
    }
    this.matrix(t);
    if (state >= 3) {
      _m.compose(_p.set(t.x, t.y, t.z), _q, _s.set(t.h * (state === 4 ? 0.8 : 1), t.h * (state === 4 ? 0.45 : 0.28), t.h * (state === 4 ? 0.8 : 1)));
      t.trunkMesh.setMatrixAt(t.idx, _m);
      _m.makeScale(0, 0, 0);
      t.crownMesh.setMatrixAt(t.idx, _m);
      if (state === 4) {
        t.trunkMesh.setColorAt(t.idx, _c.setRGB(0.55, 0.5, 0.45));
        t.trunkMesh.instanceColor.needsUpdate = true;
      }
    } else {
      t.trunkMesh.setMatrixAt(t.idx, _m);
      t.crownMesh.setMatrixAt(t.idx, _m);
    }
    t.trunkMesh.instanceMatrix.needsUpdate = true;
    t.crownMesh.instanceMatrix.needsUpdate = true;
  }

  // ---------------------------------------------------------------- distribuição
  populate(land, roads, cities, farms) {
    const c = this.country;
    const rng = this.rng;
    const d = this.density;
    const types = c.treeTypes;
    // Orçamento de árvores (desempenho): as matas já são escuras no mapa de cor; as
    // árvores 3D ficam concentradas nas bordas, que é o que se vê da estrada.
    const budget = Math.round(13000 * d);
    const forestBudget = budget * 0.55;
    let candidates = 0;
    for (const f of land.forestFields()) candidates += f.cells.length * 2.2;
    const keep = Math.min(1, forestBudget / Math.max(1, candidates));
    // Florestas e plantações: bordas densas, interior esparso.
    for (const f of land.forestFields()) {
      const sp = f.info.forest === 'broadleaf' ? (c.id === 'brasil' ? null : rng.pick(types)) : f.info.forest;
      const cells = f.cells;
      for (const idx of cells) {
        const [cx, cz] = land.cellCenter(idx);
        // Borda se algum vizinho não pertence ao talhão.
        const Q = land.Q;
        const i = idx % Q;
        const j = Math.floor(idx / Q);
        let edge = false;
        for (const [di, dj] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const ni = i + di;
          const nj = j + dj;
          if (ni < 0 || nj < 0 || ni >= Q || nj >= Q) continue;
          if (land.qgrid[nj * Q + ni] !== land.qgrid[idx]) edge = true;
        }
        if (!edge && rng.next() > keep * 0.35) continue;
        const n = Math.round((edge ? 7 : 1.2) * Math.min(1, keep * 1.6) * (rng.next() + 0.5));
        for (let k = 0; k < n; k++) {
          const x = cx + rng.range(-0.5, 0.5) * land.qcell;
          const z = cz + rng.range(-0.5, 0.5) * land.qcell;
          if (roads.query(x, z, 9)) continue;
          const s = sp || (rng.chance(0.35) ? 'araucaria' : 'broadleaf');
          this.add(s, x, z, rng.range(0.8, 1.15));
        }
      }
    }
    // Quebra-ventos ao longo das estradas da grade.
    if (c.windbreaks > 0) {
      for (const r of roads.roads) {
        if (!r.grid || rng.next() > c.windbreaks * 0.5) continue;
        const sp = rng.pick(types);
        const side = rng.sign() * (r.def.width * 0.5 + 9);
        const start = rng.int(0, Math.max(0, r.pts.length - 40));
        const len = rng.int(15, 60);
        for (let i = start; i < Math.min(r.pts.length - 1, start + len); i += 1) {
          if (rng.next() > 0.8 * d + 0.2) continue;
          const a = r.pts[i];
          const b = r.pts[i + 1];
          const dx = b[0] - a[0];
          const dz = b[1] - a[1];
          const L = Math.hypot(dx, dz) || 1;
          const x = a[0] - (dz / L) * side + rng.range(-1, 1);
          const z = a[1] + (dx / L) * side + rng.range(-1, 1);
          if (land.isOpenField(x, z)) this.add(sp, x, z, rng.range(0.8, 1.1));
        }
      }
    }
    // Mata ciliar ao longo dos rios.
    for (const rv of this.terrain.rivers) {
      for (let i = 0; i < rv.pts.length - 1; i++) {
        const a = rv.pts[i];
        const b = rv.pts[i + 1];
        const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const n = Math.round((L / 30) * d);
        for (let k = 0; k < n; k++) {
          const t = rng.next();
          const side = rng.sign() * (rv.width * 0.5 + rng.range(4, 60));
          const dx = (b[0] - a[0]) / L;
          const dz = (b[1] - a[1]) / L;
          const x = a[0] + (b[0] - a[0]) * t - dz * side;
          const z = a[1] + (b[1] - a[1]) * t + dx * side;
          if (this.terrain.waterAt(x, z) || roads.query(x, z, 8)) continue;
          this.add(c.id === 'usa' ? 'cottonwood' : c.id === 'brasil' && rng.chance(0.3) ? 'araucaria' : 'broadleaf', x, z, rng.range(0.8, 1.2));
        }
      }
    }
    // Árvores isoladas nos pastos (muito comum no Brasil e no Uruguai).
    const lone = Math.round(900 * c.treeDensity * d);
    for (let k = 0; k < lone; k++) {
      const x = rng.range(-WORLD.half, WORLD.half);
      const z = rng.range(-WORLD.half, WORLD.half);
      const s = land.surfaceAt(x, z);
      if (s.kind !== 'field' || s.info.forest || (s.field.type !== 'pasture' && rng.chance(0.85))) continue;
      if (roads.query(x, z, 10)) continue;
      const sp = c.id === 'brasil' && rng.chance(0.4) ? 'araucaria' : rng.pick(types);
      const n = rng.chance(0.3) ? rng.int(2, 6) : 1;
      for (let i = 0; i < n; i++) this.add(sp, x + rng.range(-12, 12), z + rng.range(-12, 12), rng.range(0.8, 1.2));
    }
    // Árvores de rua e quintais nas cidades.
    for (const city of cities) {
      for (const lot of city.lots) {
        if (rng.next() > 0.55 * d) continue;
        const sp = c.id === 'brasil' && rng.chance(0.15) ? 'araucaria' : rng.pick(types.filter((t) => t !== 'pine' && t !== 'eucalyptus')) || 'broadleaf';
        this.add(sp, lot.treeX, lot.treeZ, rng.range(0.6, 1));
      }
    }
    // Corta o excesso (as árvores são sorteadas para sair, sem padrão visível).
    if (this.trees.length > budget * 0.85) {
      const target = Math.round(budget * 0.85);
      for (let k = this.trees.length - 1; k > 0; k--) {
        const j = rng.int(0, k);
        const t = this.trees[k];
        this.trees[k] = this.trees[j];
        this.trees[j] = t;
      }
      this.trees.length = target;
    }
    // Arvoredos das fazendas.
    for (const farm of farms) {
      const n = Math.round(farm.trees * d);
      for (let k = 0; k < n; k++) {
        const a = rng.range(0, Math.PI * 2);
        const r = rng.range(farm.r * 0.7, farm.r * 1.3);
        const x = farm.x + Math.cos(a) * r;
        const z = farm.z + Math.sin(a) * r;
        if (roads.query(x, z, 8)) continue;
        this.add(farm.treeSpecies || rng.pick(types), x, z, rng.range(0.8, 1.2));
      }
    }
  }
}
