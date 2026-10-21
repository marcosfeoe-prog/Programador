// Peças compartilhadas pelos níveis.
import * as THREE from 'three';
import { FLOOR } from '../grid.js';
import { exitSign } from '../textures.js';

export function atmosphere(game, o) {
  const s = game.scene;
  s.background = new THREE.Color(o.fog);
  s.fog = new THREE.Fog(o.fog, o.near, o.far);
  const hemi = new THREE.HemisphereLight(o.sky, o.ground, o.hemi);
  s.add(hemi);
  game.vm.hemi.color.set(o.vmColor ?? o.sky);
  game.vm.hemi.intensity = o.vmIntensity ?? 1.4;
  game.renderer.toneMappingExposure = o.exposure ?? 1;
  return hemi;
}

// Luminária plana voltada para baixo.
export function lampGeometry(w, l) {
  const g = new THREE.PlaneGeometry(w, l);
  g.rotateX(Math.PI / 2);
  return g;
}

// Células alcançáveis ordenadas pela distância (BFS) a partir do início.
export function byDistance(dist, grid, pred = () => true) {
  const out = [];
  for (let i = 0; i < dist.length; i++) {
    if (dist[i] < 0) continue;
    const x = i % grid.w;
    const z = (i / grid.w) | 0;
    if (grid.get(x, z) === FLOOR && pred(x, z)) out.push([x, z, dist[i]]);
  }
  return out.sort((a, b) => a[2] - b[2]);
}

// Escolhe n células afastadas umas das outras dentro de uma faixa de distância.
export function spreadCells(rng, cells, n, minGap, avoid = []) {
  const chosen = [];
  const pool = rng.shuffle([...cells]);
  for (const c of pool) {
    if (chosen.length >= n) break;
    const ok = [...chosen, ...avoid].every((o) => Math.hypot(o[0] - c[0], o[1] - c[1]) >= minGap);
    if (ok) chosen.push(c);
  }
  return chosen;
}

// Vizinho-parede de uma célula de piso (para fixar objetos na parede).
export function wallNeighbor(grid, x, z, isWall) {
  for (const [ox, oz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (isWall(grid.get(x + ox, z + oz))) return [ox, oz];
  return null;
}

// Posição/rotação de algo encostado na parede da célula (x,z) na direção (ox,oz).
export function onWall(grid, x, z, ox, oz, y, inset = 0.02) {
  const c = grid.center(x, z, y);
  c.x += ox * (grid.cs / 2 - inset);
  c.z += oz * (grid.cs / 2 - inset);
  // O objeto olha para dentro da célula.
  const rotY = Math.atan2(-ox, -oz);
  return { pos: c, rotY };
}

export function exitSignMesh(text = 'EXIT') {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 0.28), new THREE.MeshBasicMaterial({ map: exitSign(text), toneMapped: false }));
  return m;
}

export function solidInstanced(scene, geo, mat, list) {
  const im = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length));
  list.forEach((m, i) => im.setMatrixAt(i, m));
  im.count = list.length;
  scene.add(im);
  return im;
}
