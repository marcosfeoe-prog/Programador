// Registro de estruturas destrutíveis (indicadores de dano) e conjuntos instanciados de
// construções com estados de dano: telhado danificado → sem telhado → paredes caídas →
// arrasada → varrida da fundação.

import * as THREE from 'three';
import { efFromWind } from '../config.js';

// Indicadores de dano (DI) e o vento (m/s) de cada grau de dano (DoD), no espírito da
// escala EF. "state" é o estado visual aplicado; "label" vai para o relatório.
export const DI = {
  house: {
    name: 'Casa',
    dod: [
      { v: 30, state: 1, label: 'telhas e calhas arrancadas' },
      { v: 39, state: 1, label: 'cobertura do telhado perdida, janelas quebradas' },
      { v: 46, state: 2, label: 'telhado levantado, parte da estrutura perdida' },
      { v: 53, state: 2, label: 'telhado inteiro arrancado' },
      { v: 62, state: 3, label: 'paredes externas derrubadas' },
      { v: 76, state: 4, label: 'casa arrasada' },
      { v: 91, state: 5, label: 'casa varrida da fundação' },
    ],
  },
  mobile: {
    name: 'Trailer (casa móvel)',
    dod: [
      { v: 30, state: 1, label: 'saia e telhado danificados' },
      { v: 38, state: 6, label: 'trailer deslocado da base' },
      { v: 45, state: 7, label: 'trailer capotado' },
      { v: 54, state: 4, label: 'trailer destruído' },
    ],
  },
  barn: {
    name: 'Celeiro/galpão',
    dod: [
      { v: 30, state: 1, label: 'chapas do telhado soltas' },
      { v: 40, state: 2, label: 'telhado arrancado' },
      { v: 50, state: 3, label: 'estrutura desabada' },
      { v: 66, state: 5, label: 'galpão varrido' },
    ],
  },
  masonry: {
    name: 'Prédio de alvenaria',
    dod: [
      { v: 33, state: 1, label: 'letreiros e cobertura danificados' },
      { v: 44, state: 1, label: 'vidraças quebradas, parte do telhado perdida' },
      { v: 54, state: 2, label: 'telhado arrancado' },
      { v: 64, state: 3, label: 'paredes desabadas' },
      { v: 79, state: 4, label: 'prédio destruído' },
      { v: 96, state: 5, label: 'prédio varrido' },
    ],
  },
  church: {
    name: 'Igreja',
    dod: [
      { v: 33, state: 1, label: 'telhas e vitrais danificados' },
      { v: 48, state: 2, label: 'telhado e torre derrubados' },
      { v: 63, state: 3, label: 'paredes desabadas' },
      { v: 80, state: 4, label: 'igreja destruída' },
    ],
  },
  silo: {
    name: 'Silo/elevador de grãos',
    dod: [
      { v: 40, state: 1, label: 'cobertura do silo danificada' },
      { v: 56, state: 2, label: 'topo do silo arrancado' },
      { v: 71, state: 4, label: 'silo desabado' },
    ],
  },
  bin: {
    name: 'Silo metálico',
    dod: [
      { v: 34, state: 1, label: 'silo amassado' },
      { v: 46, state: 4, label: 'silo arrancado e arremessado' },
    ],
  },
  tree: {
    name: 'Árvores',
    dod: [
      { v: 30, state: 1, label: 'galhos pequenos quebrados' },
      { v: 38, state: 1, label: 'galhos grandes quebrados' },
      { v: 45, state: 2, label: 'árvores arrancadas pela raiz' },
      { v: 55, state: 3, label: 'troncos partidos' },
      { v: 86, state: 4, label: 'árvores descascadas' },
    ],
  },
  pole: {
    name: 'Postes de energia',
    dod: [
      { v: 38, state: 1, label: 'postes inclinados' },
      { v: 50, state: 2, label: 'postes quebrados' },
    ],
  },
  car: {
    name: 'Veículos',
    dod: [
      { v: 40, state: 1, label: 'veículos arrastados' },
      { v: 53, state: 2, label: 'veículos capotados' },
      { v: 68, state: 3, label: 'veículos arremessados' },
    ],
  },
  tower: {
    name: "Caixa d'água elevada",
    dod: [
      { v: 50, state: 1, label: 'caixa amassada' },
      { v: 72, state: 4, label: "caixa d'água derrubada" },
    ],
  },
  turbine: {
    name: 'Turbina eólica',
    dod: [
      { v: 45, state: 1, label: 'pás danificadas' },
      { v: 72, state: 4, label: 'torre da turbina derrubada' },
    ],
  },
  pivot: {
    name: 'Pivô de irrigação',
    dod: [{ v: 38, state: 4, label: 'pivô central tombado' }],
  },
  canopy: {
    name: 'Posto de combustível',
    dod: [
      { v: 36, state: 1, label: 'cobertura das bombas danificada' },
      { v: 50, state: 2, label: 'cobertura desabada' },
      { v: 66, state: 3, label: 'loja do posto destruída' },
    ],
  },
};

export function dodEF(v) {
  return Math.max(0, efFromWind(v));
}

// Registro com hash espacial.
export class StructureRegistry {
  constructor() {
    this.list = [];
    this.cell = 120;
    this.grid = new Map();
  }
  add(s) {
    s.id = this.list.length;
    s.state = 0;
    s.dod = 0;
    s.peak = 0;
    this.list.push(s);
    const k = this.key(s.x, s.z);
    let a = this.grid.get(k);
    if (!a) this.grid.set(k, (a = []));
    a.push(s.id);
    return s;
  }
  key(x, z) {
    return Math.floor(x / this.cell) * 100003 + Math.floor(z / this.cell);
  }
  near(x, z, R, out = []) {
    out.length = 0;
    const c = this.cell;
    const x0 = Math.floor((x - R) / c);
    const x1 = Math.floor((x + R) / c);
    const z0 = Math.floor((z - R) / c);
    const z1 = Math.floor((z + R) / c);
    for (let i = x0; i <= x1; i++)
      for (let j = z0; j <= z1; j++) {
        const a = this.grid.get(i * 100003 + j);
        if (a) for (const id of a) out.push(this.list[id]);
      }
    return out;
  }
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

// Conjunto instanciado de construções de uma zona (cidade ou área rural).
export class BuildingSet {
  constructor(mats, rubbleGeo, slabGeo) {
    this.mats = mats;
    this.rubbleGeo = rubbleGeo;
    this.slabGeo = slabGeo;
    this.models = new Map();
    this.items = [];
    this.group = new THREE.Group();
  }
  add(model, x, y, z, rot, wallColor, roofColor, scale = 1) {
    let rec = this.models.get(model);
    if (!rec) this.models.set(model, (rec = { model, items: [] }));
    const it = { model, x, y, z, rot, wallColor: new THREE.Color(wallColor), roofColor: new THREE.Color(roofColor), scale, state: 0, idx: rec.items.length, set: this };
    rec.items.push(it);
    it.slot = this.items.length;
    this.items.push(it);
    return it;
  }
  finalize() {
    for (const rec of this.models.values()) {
      const n = rec.items.length;
      const wm = new THREE.InstancedMesh(rec.model.walls, this.mats.wall, n);
      const rm = new THREE.InstancedMesh(rec.model.roof, this.mats.roof[rec.model.roofType] || this.mats.roof.shingles, n);
      wm.castShadow = rm.castShadow = true;
      wm.receiveShadow = rm.receiveShadow = true;
      rec.walls = wm;
      rec.roof = rm;
      rec.items.forEach((it, i) => {
        this.matrix(it, 1, 1);
        wm.setMatrixAt(i, _m);
        rm.setMatrixAt(i, _m);
        wm.setColorAt(i, it.wallColor);
        rm.setColorAt(i, it.roofColor);
      });
      wm.computeBoundingSphere();
      rm.computeBoundingSphere();
      this.group.add(wm, rm);
    }
    const N = Math.max(1, this.items.length);
    this.slab = new THREE.InstancedMesh(this.slabGeo, this.mats.slab, N);
    this.rubble = new THREE.InstancedMesh(this.rubbleGeo, this.mats.wall, N);
    this.slab.receiveShadow = true;
    this.rubble.castShadow = true;
    this.rubble.receiveShadow = true;
    this.items.forEach((it, i) => {
      const md = it.model;
      _e.set(0, it.rot, 0);
      _q.setFromEuler(_e);
      _m.compose(_p.set(it.x, it.y + 0.05, it.z), _q, _s.set(md.w * it.scale + 0.4, 1, md.d * it.scale + 0.4));
      this.slab.setMatrixAt(i, _m);
      _m.makeScale(0, 0, 0);
      this.rubble.setMatrixAt(i, _m);
      this.rubble.setColorAt(i, _c.set('#ffffff'));
    });
    this.slab.computeBoundingSphere();
    // A esfera do entulho deve cobrir a zona inteira (começa invisível).
    this.rubble.boundingSphere = this.slab.boundingSphere.clone();
    this.group.add(this.slab, this.rubble);
    return this.group;
  }
  matrix(it, sy = 1, sxz = 1, tilt = 0, tiltAxis = 0) {
    _e.set(tiltAxis ? 0 : tilt, it.rot, tiltAxis ? tilt : 0, 'YXZ');
    _q.setFromEuler(_e);
    _m.compose(_p.set(it.x, it.y, it.z), _q, _s.set(it.scale * sxz, it.scale * sy, it.scale * sxz));
    return _m;
  }
  // Aplica o estado visual de dano.
  setState(it, state, rng = Math.random) {
    if (state <= it.state && state < 6) return;
    it.state = state;
    const rec = this.models.get(it.model);
    const md = it.model;
    if (state === 1) {
      _c.copy(it.roofColor).multiplyScalar(0.62);
      rec.roof.setColorAt(it.idx, _c);
      rec.roof.instanceColor.needsUpdate = true;
    }
    if (state >= 2 && state <= 5) {
      _m.makeScale(0, 0, 0);
      rec.roof.setMatrixAt(it.idx, _m);
      rec.roof.instanceMatrix.needsUpdate = true;
    }
    if (state === 3) {
      rec.walls.setMatrixAt(it.idx, this.matrix(it, 0.42, 1, (rng() - 0.5) * 0.18));
      rec.walls.instanceMatrix.needsUpdate = true;
    }
    if (state >= 4 && state <= 5) {
      _m.makeScale(0, 0, 0);
      rec.walls.setMatrixAt(it.idx, _m);
      rec.walls.instanceMatrix.needsUpdate = true;
    }
    if (state === 6) {
      // Trailer deslocado.
      it.rot += (rng() - 0.5) * 0.5;
      it.x += (rng() - 0.5) * 4;
      it.z += (rng() - 0.5) * 4;
      rec.walls.setMatrixAt(it.idx, this.matrix(it));
      rec.roof.setMatrixAt(it.idx, this.matrix(it));
      rec.walls.instanceMatrix.needsUpdate = true;
      rec.roof.instanceMatrix.needsUpdate = true;
    }
    if (state === 7) {
      // Capotado: deitado de lado.
      it.y += md.d * 0.5;
      rec.walls.setMatrixAt(it.idx, this.matrix(it, 1, 1, Math.PI / 2, 0));
      rec.roof.setMatrixAt(it.idx, this.matrix(it, 1, 1, Math.PI / 2, 0));
      rec.walls.instanceMatrix.needsUpdate = true;
      rec.roof.instanceMatrix.needsUpdate = true;
    }
    if (state === 3 || state === 4) {
      _e.set(0, it.rot + rng() * 0.4, 0);
      _q.setFromEuler(_e);
      const k = state === 3 ? 0.9 : 1.1;
      _m.compose(_p.set(it.x, it.y, it.z), _q, _s.set(md.w * it.scale * k, Math.min(3, md.H * 0.4) * (state === 3 ? 0.7 : 1), md.d * it.scale * k));
      this.rubble.setMatrixAt(it.slot, _m);
      this.rubble.instanceMatrix.needsUpdate = true;
    }
    if (state === 5) {
      _m.makeScale(0, 0, 0);
      this.rubble.setMatrixAt(it.slot, _m);
      this.rubble.instanceMatrix.needsUpdate = true;
    }
  }
}
