// Geometria dos veículos (sedã, picape, SUV, trator) com cores por vértice.
import * as THREE from 'three';
import { mergeColored } from './parts.js';

const PAINT = new THREE.Color(1, 1, 1);
const GLASS = new THREE.Color(0.05, 0.06, 0.07);
const TIRE = new THREE.Color(0.035, 0.035, 0.035);
const RIM = new THREE.Color(0.5, 0.5, 0.52);
const DARK = new THREE.Color(0.08, 0.08, 0.085);
const HEAD = new THREE.Color(1.6, 1.5, 1.2);
const TAIL = new THREE.Color(0.9, 0.05, 0.03);

function box(w, h, l, x, y, z, color) {
  const g = new THREE.BoxGeometry(w, h, l);
  g.translate(x, y, z);
  return { geo: g, color };
}

function wheel(r, wdt, x, y, z) {
  const t = new THREE.CylinderGeometry(r, r, wdt, 14);
  t.rotateZ(Math.PI / 2);
  t.translate(x, y, z);
  const rim = new THREE.CylinderGeometry(r * 0.55, r * 0.55, wdt + 0.02, 10);
  rim.rotateZ(Math.PI / 2);
  rim.translate(x, y, z);
  return [
    { geo: t, color: TIRE },
    { geo: rim, color: RIM },
  ];
}

export const VEHICLE_TYPES = {
  sedan: { w: 1.8, h: 1.45, l: 4.6, mass: 1400, name: 'Sedã' },
  pickup: { w: 1.95, h: 1.9, l: 5.4, mass: 2200, name: 'Picape' },
  suv: { w: 1.9, h: 1.8, l: 4.9, mass: 2000, name: 'SUV' },
  tractor: { w: 2.2, h: 2.9, l: 4.0, mass: 5500, name: 'Trator' },
};

export function buildVehicleGeometry(type) {
  const it = [];
  if (type === 'sedan') {
    it.push(box(1.8, 0.62, 4.6, 0, 0.6, 0, PAINT));
    it.push(box(1.6, 0.56, 2.3, 0, 1.18, -0.15, GLASS));
    it.push(box(1.62, 0.07, 1.95, 0, 1.48, -0.2, PAINT));
    it.push(box(1.82, 0.22, 0.25, 0, 0.42, 2.32, DARK));
    it.push(box(1.82, 0.22, 0.25, 0, 0.42, -2.32, DARK));
    it.push(box(0.35, 0.12, 0.05, 0.62, 0.72, 2.31, HEAD), box(0.35, 0.12, 0.05, -0.62, 0.72, 2.31, HEAD));
    it.push(box(0.35, 0.12, 0.05, 0.62, 0.72, -2.31, TAIL), box(0.35, 0.12, 0.05, -0.62, 0.72, -2.31, TAIL));
    for (const [x, z] of [[0.82, 1.45], [-0.82, 1.45], [0.82, -1.45], [-0.82, -1.45]]) it.push(...wheel(0.33, 0.24, x, 0.33, z));
  } else if (type === 'pickup') {
    it.push(box(1.95, 0.8, 5.4, 0, 0.82, 0, PAINT));
    it.push(box(1.82, 0.66, 1.9, 0, 1.55, 0.55, GLASS));
    it.push(box(1.84, 0.08, 1.7, 0, 1.9, 0.5, PAINT));
    it.push(box(0.1, 0.45, 2.3, 0.92, 1.42, -1.5, PAINT), box(0.1, 0.45, 2.3, -0.92, 1.42, -1.5, PAINT));
    it.push(box(1.85, 0.45, 0.1, 0, 1.42, -2.65, PAINT));
    it.push(box(1.97, 0.28, 0.25, 0, 0.55, 2.72, DARK), box(1.97, 0.28, 0.25, 0, 0.55, -2.72, DARK));
    it.push(box(0.4, 0.16, 0.05, 0.68, 0.98, 2.71, HEAD), box(0.4, 0.16, 0.05, -0.68, 0.98, 2.71, HEAD));
    it.push(box(0.14, 0.3, 0.05, 0.86, 1.0, -2.71, TAIL), box(0.14, 0.3, 0.05, -0.86, 1.0, -2.71, TAIL));
    for (const [x, z] of [[0.86, 1.75], [-0.86, 1.75], [0.86, -1.7], [-0.86, -1.7]]) it.push(...wheel(0.42, 0.3, x, 0.42, z));
  } else if (type === 'suv') {
    it.push(box(1.9, 0.75, 4.9, 0, 0.78, 0, PAINT));
    it.push(box(1.78, 0.62, 3.2, 0, 1.45, -0.35, GLASS));
    it.push(box(1.8, 0.08, 3.1, 0, 1.78, -0.4, PAINT));
    it.push(box(1.92, 0.25, 0.25, 0, 0.5, 2.47, DARK), box(1.92, 0.25, 0.25, 0, 0.5, -2.47, DARK));
    it.push(box(0.38, 0.14, 0.05, 0.66, 0.92, 2.46, HEAD), box(0.38, 0.14, 0.05, -0.66, 0.92, 2.46, HEAD));
    it.push(box(0.2, 0.25, 0.05, 0.8, 1.05, -2.46, TAIL), box(0.2, 0.25, 0.05, -0.8, 1.05, -2.46, TAIL));
    for (const [x, z] of [[0.84, 1.55], [-0.84, 1.55], [0.84, -1.55], [-0.84, -1.55]]) it.push(...wheel(0.39, 0.28, x, 0.39, z));
  } else if (type === 'tractor') {
    it.push(box(1.0, 1.0, 2.6, 0, 1.3, 0.6, PAINT));
    it.push(box(1.3, 1.3, 1.3, 0, 2.2, -0.9, GLASS));
    it.push(box(1.45, 0.1, 1.45, 0, 2.9, -0.9, PAINT));
    it.push(box(0.12, 1.0, 0.12, 0.3, 2.3, 1.4, DARK));
    it.push(...wheel(0.85, 0.5, 0.95, 0.85, -1.0), ...wheel(0.85, 0.5, -0.95, 0.85, -1.0));
    it.push(...wheel(0.5, 0.3, 0.75, 0.5, 1.45), ...wheel(0.5, 0.3, -0.75, 0.5, 1.45));
  }
  return mergeColored(it);
}

const geoCache = {};
export function vehicleGeometry(type) {
  if (!geoCache[type]) geoCache[type] = buildVehicleGeometry(type);
  return geoCache[type];
}

export const CAR_COLORS = ['#e8e8e6', '#1c1d20', '#7d8288', '#9b1b1b', '#1f3c78', '#2f5d3a', '#c9b48a', '#5a5f66', '#b8b9bb', '#6b2d2d', '#d8c25a', '#2b6f9e'];

export function makeVehicleMesh(type, colorHex, shadows) {
  const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(colorHex), vertexColors: true, roughness: 0.38, metalness: 0.15 });
  const mesh = new THREE.Mesh(vehicleGeometry(type), mat);
  mesh.castShadow = shadows;
  mesh.receiveShadow = true;
  return mesh;
}
