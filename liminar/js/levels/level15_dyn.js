// Nível 15 — peças que mudam durante o jogo: a folha de correr das portas de
// metal, o leitor de cartão, a tela e a lâmpada dos terminais e a comporta.
import * as THREE from 'three';
import { GeoBuilder } from '../materials.js';
import { getTex } from '../textures.js';

const STEEL = [0.5, 0.52, 0.54];
const RIB = [0.4, 0.42, 0.44];
const DARK = [0.12, 0.13, 0.14];
const YELLOW = [0.86, 0.62, 0.08];
const BLACK = [0.05, 0.05, 0.055];

// Folha da porta reforçada em coordenadas do mundo (serve para a porta lacrada,
// que vai direto para a geometria do bloco, e para a que desliza).
export function doorLeaf(gb, d, dw, dh, lm) {
  const ex = d.kind === 0;
  const w = dw + 0.14;
  const box = (a, y, n, sa, sy, sn, col) => {
    const x = d.x + (ex ? a : d.nx * n);
    const z = d.z + (ex ? d.nz * n : a);
    gb.box(x, y, z, ex ? sa : sn, sy, ex ? sn : sa, col, lm, { ao: 0 });
  };
  box(0, dh / 2 + 0.01, 0, w, dh + 0.02, 0.08, STEEL);
  for (const n of [-0.045, 0.045]) {
    for (const y of [0.52, 0.98, 1.9]) box(0, y, n, w - 0.14, 0.07, 0.012, RIB);
    box(-w / 2 + 0.13, 1.05, n, 0.05, 0.36, 0.012, DARK);
  }
  // visor de vidro aramado
  box(0.22, 1.45, 0, 0.26, 0.42, 0.094, [0.07, 0.09, 0.1]);
  // faixa de perigo na base
  const n = 9;
  for (let i = 0; i < n; i++) box(-w / 2 + (i + 0.5) * (w / n), 0.15, 0, w / n, 0.22, 0.092, i % 2 ? YELLOW : BLACK);
}

// Porta que desliza para dentro da parede: malha com o pivô no centro do vão.
export function slidingDoor(d, dw, dh, mat, lm) {
  const gb = new GeoBuilder();
  doorLeaf(gb, d, dw, dh, lm);
  const geo = gb.build();
  geo.translate(-d.x, 0, -d.z);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(d.x, 0, d.z);
  return mesh;
}

// Lâmpada do leitor de cartão (troca de cor ao liberar).
export function readerLed(p, nx, nz) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.035, 0.035), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 1.3, 0.1) }));
  m.position.set(p[0] + nx * 0.043, 1.31, p[2] + nz * 0.043);
  m.rotation.y = Math.atan2(nx, nz);
  return m;
}

// Tela e lâmpada de status de um terminal.
export function terminalFx(t) {
  const misc = getTex('l15Misc', 0);
  const rot = Math.atan2(t.fx, t.fz);
  const sx = t.x + t.fx * -0.058;
  const sz = t.z + t.fz * -0.058;
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.68, 0.4),
    new THREE.MeshBasicMaterial({ map: t.done ? misc.screenOn : misc.screenOff, color: new THREE.Color(1.5, 1.5, 1.5), fog: true }),
  );
  screen.position.set(sx, 1.22, sz);
  screen.rotation.y = rot;
  const lamp = new THREE.Mesh(
    new THREE.CylinderGeometry(0.045, 0.05, 0.09, 12),
    new THREE.MeshBasicMaterial({ color: 0xffffff, fog: true }),
  );
  lamp.position.set(t.x - t.fx * 0.12, 1.6, t.z - t.fz * 0.12);
  return { screen, lamp, misc };
}

// Comporta circular: tampa articulada na dobradiça, fundo escuro, giroflexes e painel.
export function hatchFx(h, mat, lm) {
  const R = h.r;
  const fx = h.x - 0.17;
  const hz = h.z + R + 0.05;
  const gb = new GeoBuilder();
  gb.cylinder(fx, h.y, h.z, R - 0.03, 0.16, [0.56, 0.58, 0.6], lm, { axis: 'x', sides: 36 });
  gb.cylinder(fx - 0.09, h.y, h.z, R * 0.72, 0.03, [0.48, 0.5, 0.52], lm, { axis: 'x', sides: 36 });
  gb.cylinder(fx - 0.11, h.y, h.z, R * 0.42, 0.02, DARK, lm, { axis: 'x', sides: 24 });
  // faces frontais (as tampas do cilindro ficam do lado da parede)
  for (const [x, r, col] of [
    [fx - 0.08, R - 0.03, [0.56, 0.58, 0.6]],
    [fx - 0.105, R * 0.72, [0.48, 0.5, 0.52]],
    [fx - 0.121, R * 0.42, DARK],
  ]) {
    const disc = new THREE.CircleGeometry(r, 36);
    gb.addGeometry(disc, new THREE.Matrix4().makeTranslation(x, h.y, h.z).multiply(new THREE.Matrix4().makeRotationY(-Math.PI / 2)), col);
    disc.dispose();
  }
  // volante de travamento
  const wheel = new THREE.TorusGeometry(R * 0.36, 0.035, 8, 28);
  const wm = new THREE.Matrix4().makeTranslation(fx - 0.24, h.y, h.z).multiply(new THREE.Matrix4().makeRotationY(Math.PI / 2));
  gb.addGeometry(wheel, wm, [0.75, 0.15, 0.1]);
  wheel.dispose();
  gb.cylinder(fx - 0.17, h.y, h.z, 0.07, 0.14, DARK, lm, { axis: 'x', sides: 12 });
  gb.box(fx - 0.2, h.y, h.z, 0.03, R * 0.72, 0.035, DARK, lm, { ao: 0 });
  gb.box(fx - 0.2, h.y, h.z, 0.03, 0.035, R * 0.72, DARK, lm, { ao: 0 });
  // trincos radiais
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    gb.box(fx - 0.09, h.y + Math.sin(a) * R * 0.86, h.z + Math.cos(a) * R * 0.86, 0.05, 0.12, 0.12, DARK, lm, { ao: 0 });
  }
  // braço da dobradiça
  gb.box(fx - 0.1, h.y + 0.6, (h.z + R * 0.4 + hz) / 2, 0.08, 0.16, hz - h.z - R * 0.4, STEEL, lm, { ao: 0 });
  gb.box(fx - 0.1, h.y - 0.6, (h.z + R * 0.4 + hz) / 2, 0.08, 0.16, hz - h.z - R * 0.4, STEEL, lm, { ao: 0 });
  const geo = gb.build();
  // o uv1 dos vértices do volante fica num ponto só do lightmap
  const uv1 = geo.attributes.uv1;
  const l = lm(fx - 0.5, h.z);
  for (let i = 0; i < uv1.count; i++) if (uv1.getX(i) === 0 && uv1.getY(i) === 0) uv1.setXY(i, l[0], l[1]);
  geo.translate(-fx, 0, -hz);
  const door = new THREE.Mesh(geo, mat);
  door.position.set(fx, 0, hz);
  // fundo escuro (o túnel atrás da tampa)
  const voidMat = new THREE.MeshBasicMaterial({ map: getTex('l15Void', 0).map, fog: true });
  const hole = new THREE.Mesh(new THREE.CircleGeometry(R - 0.02, 40), voidMat);
  hole.position.set(h.x - 0.066, h.y, h.z);
  hole.rotation.y = -Math.PI / 2;
  // giroflexes (âmbar) e lâmpada do painel
  const beaconMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.25, 0.12, 0.02), fog: true });
  const beacons = [-1, 1].map((s) => {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.09, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), beaconMat);
    b.position.set(h.x - 0.1, 2.81, h.z + s * 1.25);
    return b;
  });
  const status = new THREE.Mesh(
    new THREE.PlaneGeometry(0.07, 0.07),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 0.15, 0.08) }),
  );
  status.position.set(h.x - 0.125, 1.36, h.z - 1.55);
  status.rotation.y = -Math.PI / 2;
  return { door, hole, beacons, beaconMat, status, mats: [voidMat, beaconMat, status.material] };
}
