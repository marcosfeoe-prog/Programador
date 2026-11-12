// Ajudantes para espalhar objetos instanciados e montar geometrias de vegetação.
import * as THREE from 'three';
import { merge, paint, tf } from '../engine/geo.js';
import { sphericalNormals } from '../engine/materials.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

// items: [{ x, y, z, ry, rx, rz, s | sx,sy,sz, color }]
export function instanced(geo, mat, items, { cast = true, receive = true } = {}) {
  const im = new THREE.InstancedMesh(geo, mat, Math.max(1, items.length));
  items.forEach((it, i) => {
    _e.set(it.rx || 0, it.ry || 0, it.rz || 0, 'YXZ');
    _q.setFromEuler(_e);
    const s = it.s ?? 1;
    _s.set(it.sx ?? s, it.sy ?? s, it.sz ?? s);
    _m.compose(_p.set(it.x, it.y || 0, it.z), _q, _s);
    im.setMatrixAt(i, _m);
    if (it.color) im.setColorAt(i, _c.set(it.color));
  });
  im.count = items.length;
  im.instanceMatrix.needsUpdate = true;
  if (im.instanceColor) im.instanceColor.needsUpdate = true;
  im.castShadow = cast;
  im.receiveShadow = receive;
  im.computeBoundingSphere();
  return im;
}

// Arbusto feito de cartões cruzados e inclinados (folhagem com alfa)
export function shrubGeometry(rand, cards = 9, w = 1.3, h = 1.0) {
  const parts = [];
  for (let i = 0; i < cards; i++) {
    const g = new THREE.PlaneGeometry(w * (0.75 + rand() * 0.4), h * (0.7 + rand() * 0.45));
    g.translate(0, g.parameters.height / 2 - 0.05, 0);
    const a = (i / cards) * Math.PI + rand() * 0.4;
    const tilt = (rand() - 0.5) * 0.7;
    tf(g, [(rand() - 0.5) * w * 0.35, 0, (rand() - 0.5) * w * 0.35], [tilt, a, 0]);
    parts.push(g);
  }
  // cartões horizontais por cima (topo arredondado)
  for (let i = 0; i < 3; i++) {
    const g = new THREE.PlaneGeometry(w * 0.8, w * 0.8);
    g.rotateX(-Math.PI / 2 + (rand() - 0.5) * 0.5);
    g.rotateY(rand() * 3);
    g.translate((rand() - 0.5) * 0.2, h * (0.45 + rand() * 0.25), (rand() - 0.5) * 0.2);
    parts.push(g);
  }
  const geo = merge(parts);
  sphericalNormals(geo, [0, h * 0.3, 0], [0, h * 0.25, 0]);
  return geo;
}

// Pedrinha irregular
export function rockGeometry(rand, detail = 0) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const k = 0.75 + rand() * 0.45;
    pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * k * 0.6, pos.getZ(i) * k);
  }
  g.computeVertexNormals();
  return g;
}

// Acácia de copa achatada (silhueta de savana)
export function acaciaGeometry(rand, color = '#343a40', trunkColor = '#2a2a30') {
  const parts = [];
  const h = 4 + rand() * 3;
  const trunk = paint(new THREE.CylinderGeometry(0.12, 0.22, h * 0.6, 6), trunkColor);
  tf(trunk, [0, h * 0.3, 0], [0, 0, (rand() - 0.5) * 0.2]);
  parts.push(trunk);
  for (let i = 0; i < 3; i++) {
    const b = paint(new THREE.CylinderGeometry(0.06, 0.1, h * 0.45, 5), trunkColor);
    const a = (i / 3) * Math.PI * 2 + rand();
    tf(b, [Math.cos(a) * 0.5, h * 0.72, Math.sin(a) * 0.5], [Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6]);
    parts.push(b);
  }
  const cw = 3 + rand() * 2.5;
  for (let i = 0; i < 9; i++) {
    const s = new THREE.IcosahedronGeometry(1, 1);
    const a = rand() * Math.PI * 2, d = rand() * cw * 0.6;
    const r = cw * (0.35 + rand() * 0.25);
    paint(s, color, 0.06, rand);
    tf(s, [Math.cos(a) * d, h + rand() * 0.5, Math.sin(a) * d], [0, rand() * 3, 0], [r, r * 0.22, r]);
    parts.push(s);
  }
  return merge(parts);
}

// Barreira de morros distantes (anel) — só nas direções onde o ruído permite
export function hillRing(noise, { inner = 700, outer = 1500, height = 60, seg = 220, rings = 10, color = '#e4b0b0', seed = 1 } = {}) {
  const pos = [];
  const col = [];
  const idx = [];
  const c = new THREE.Color(color);
  for (let j = 0; j <= rings; j++) {
    const t = j / rings;
    const r = inner + (outer - inner) * t;
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      const prof = Math.sin(t * Math.PI);
      const n = noise(Math.cos(a) * 3 + 10 + seed, Math.sin(a) * 3 + t * 1.5);
      const mask = Math.max(0, n - 0.35) / 0.65;
      const h = prof * height * mask * (0.6 + 0.8 * noise(a * 7 + seed, t * 4));
      pos.push(Math.cos(a) * r, h - 1, Math.sin(a) * r);
      col.push(c.r, c.g, c.b);
    }
  }
  for (let j = 0; j < rings; j++) {
    for (let i = 0; i < seg; i++) {
      const a = j * (seg + 1) + i, b = a + seg + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Relevo: malha quadrada com alturas de uma função
export function heightfield(size, seg, heightAt, uvScale = 4) {
  const g = new THREE.PlaneGeometry(size, size, seg, seg);
  g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position;
  const uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    pos.setY(i, heightAt(x, z));
    uv.setXY(i, x / uvScale, -z / uvScale);
  }
  g.computeVertexNormals();
  return g;
}
