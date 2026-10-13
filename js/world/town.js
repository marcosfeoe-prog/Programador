// Pequena cidade: ruas, casas de madeira, comércio de alvenaria, igreja, escola,
// posto de gasolina, caixa d'água, parque de trailers, fazenda, carros, postes e fiação.
// Cada construção é composta de peças destrutíveis (ver parts.js / damage.js).
import * as THREE from 'three';
import { RNG } from '../util/math.js';
import { makeVehicleMesh, VEHICLE_TYPES, CAR_COLORS } from './vehicles.js';
import { roadZ, roadX, FARM } from './terrain.js';

export const TOWN_HALF = 512;
const Z_STREETS = [-160, -55, 0, 55, 160];
const X_STREETS = [-220, -110, 0, 110, 220];
const COLUMNS = [
  [-215, -115],
  [-105, -5],
  [5, 105],
  [115, 215],
];

const SIDING_COLORS = ['#f2efe6', '#e9e1cc', '#c9d6dd', '#d9d2bf', '#b9c4b0', '#efe3b8', '#a9b7c6', '#d7c6b6', '#ffffff', '#c7c2b8', '#9fb0a2', '#e6d0c0'];
const ROOF_COLORS = ['#5b5d61', '#3e3f42', '#6b5446', '#4a3c34', '#2f3032', '#7a6a5c', '#5c3a32'];
const BRICK_TINTS = ['#ffffff', '#f0d9c8', '#d8d0c8', '#e8c0a8', '#c8b8a8'];
const SIGN_COLORS = ['#b22222', '#1d4e89', '#2e7d32', '#f9a825', '#6a1b9a', '#ef6c00', '#00838f'];

const _q = new THREE.Quaternion();
const _qy = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _v = new THREE.Vector3();
const _e = new THREE.Euler();
const _up = new THREE.Vector3(0, 1, 0);

export class Town {
  constructor(scene, terrain, pools, quality) {
    this.scene = scene;
    this.terrain = terrain;
    this.pools = pools;
    this.quality = quality;
    this.rng = new RNG(2024);
    this.buildings = [];
    this.cars = [];
    this.poles = [];
    this.poleLines = [];
    this.yardTrees = [];
    this.streetLights = [];
    this.lamps = [];
    this.drives = [];
    this.lots = [];
    this.sirenPos = new THREE.Vector3(14, 0, -30);
    this.layout();
    this.buildUtilities();
    this.drawMap();
    this.power = 1;
  }

  // ------------------------------------------------------------------ helpers
  newBuilding(kind, di, name, x, z, yaw, w, d) {
    const y = this.terrain.heightAt(x, z);
    const b = {
      id: this.buildings.length,
      kind, di, name, x, y, z, yaw, w, d,
      groups: {},
      dod: 0,
      quality: this.rng.float(0.85, 1.15),
      collide: true,
      hw: w / 2,
      hd: d / 2,
    };
    _qy.setFromAxisAngle(_up, yaw);
    b.qYaw = _qy.clone();
    this.buildings.push(b);
    return b;
  }

  part(b, group, pool, lx, ly, lz, sx, sy, sz, color, rx = 0, ry = 0, rz = 0) {
    _v.set(lx, ly, lz).applyQuaternion(b.qYaw);
    _p.set(b.x + _v.x, b.y + _v.y, b.z + _v.z);
    _e.set(rx, ry, rz, 'YXZ');
    _q.setFromEuler(_e);
    _q.premultiply(b.qYaw);
    const col = color ? (color.isColor ? color : new THREE.Color(color)) : null;
    const h = this.pools.add(pool, _p, _q, _v.set(sx, sy, sz), col);
    if (!h) return null;
    h.group = group;
    h.b = b;
    h.local = new THREE.Vector3(lx, ly, lz);
    if (!b.groups[group]) b.groups[group] = [];
    b.groups[group].push(h);
    return h;
  }

  // ------------------------------------------------------------------ casas
  buildHouse(x, z, yaw, opts = {}) {
    const r = this.rng;
    const w = opts.w || r.float(10, 13.5);
    const d = opts.d || r.float(8, 10.5);
    const stories = opts.stories || (r.chance(0.25) ? 2 : 1);
    const wh = 2.75 * stories;
    const b = this.newBuilding('house', 'house', opts.name || (stories > 1 ? 'Casa de dois andares' : 'Casa'), x, z, yaw, w, d);
    const siding = new THREE.Color(opts.siding || r.pick(SIDING_COLORS));
    const roofC = new THREE.Color(opts.roof || r.pick(ROOF_COLORS));
    const trim = new THREE.Color('#f4f4f0');
    const fy = 0.45;
    const th = 0.2;
    b.height = fy + wh;
    this.part(b, 'foundation', 'concrete', 0, 0.12, 0, w + 0.3, 0.7, d + 0.3);
    // Paredes (segmentos destacáveis)
    const segF = 3;
    for (const side of [1, -1]) {
      for (let k = 0; k < segF; k++) {
        const sw = w / segF;
        const cx = -w / 2 + sw * (k + 0.5);
        const h = this.part(b, 'walls', 'siding', cx, fy + wh / 2, side * (d / 2 - th / 2), sw, wh, th, siding);
        if (h) {
          h.normal = new THREE.Vector3(0, 0, side);
          h.windows = [];
        }
      }
    }
    for (const side of [1, -1]) {
      const segs = 2;
      const dd = d - th * 2;
      for (let k = 0; k < segs; k++) {
        const sd = dd / segs;
        const cz = -dd / 2 + sd * (k + 0.5);
        const h = this.part(b, 'walls', 'siding', side * (w / 2 - th / 2), fy + wh / 2, cz, th, wh, sd, siding);
        if (h) {
          h.normal = new THREE.Vector3(side, 0, 0);
          h.windows = [];
        }
      }
    }
    const walls = b.groups.walls;
    const wallAt = (lx, lz) => {
      let best = null;
      let bd = 1e9;
      for (const wl of walls) {
        const dd = Math.hypot(wl.local.x - lx, wl.local.z - lz);
        if (dd < bd) {
          bd = dd;
          best = wl;
        }
      }
      return best;
    };
    const lit = () => (r.chance(0.65) ? new THREE.Color(r.float(0.6, 1.0), r.float(0.45, 0.75), r.float(0.25, 0.45)) : new THREE.Color(0.02, 0.02, 0.02));
    const addWin = (lx, ly, lz, sx, sz) => {
      const h = this.part(b, 'windows', 'glass', lx, ly, lz, sx, 1.3, sz, lit());
      if (h) {
        const wl = wallAt(lx, lz);
        h.wall = wl;
        wl.windows.push(h);
      }
    };
    for (let s = 0; s < stories; s++) {
      const wy = fy + 1.55 + s * 2.75;
      // frente: 2 janelas + porta
      addWin(-w / 3, wy, d / 2 + 0.03, 1.4, 0.07);
      addWin(w / 3, wy, d / 2 + 0.03, 1.4, 0.07);
      if (s > 0) addWin(0, wy, d / 2 + 0.03, 1.2, 0.07);
      // fundos
      addWin(-w / 3, wy, -d / 2 - 0.03, 1.3, 0.07);
      addWin(w / 3, wy, -d / 2 - 0.03, 1.0, 0.07);
      // laterais
      addWin(w / 2 + 0.03, wy, -d / 6, 0.07, 1.2);
      addWin(-w / 2 - 0.03, wy, d / 6, 0.07, 1.2);
    }
    const door = this.part(b, 'door', 'paint', 0, fy + 1.05, d / 2 + 0.04, 1.0, 2.1, 0.08, r.pick(['#5a3320', '#7b1e1e', '#1e3a5c', '#e8e8e8', '#2f4f2f']));
    if (door) door.wall = wallAt(0, d / 2);
    // Telhado de duas águas
    const pitch = r.float(0.42, 0.6);
    const ov = 0.45;
    const rise = (d / 2) * Math.tan(pitch);
    const baseY = fy + wh;
    const L = (d / 2 + ov) / Math.cos(pitch);
    for (const s of [1, -1]) {
      const cz = (s * (d / 2 + ov)) / 2;
      const cy = baseY + rise - ((d / 2 + ov) * Math.tan(pitch)) / 2;
      const nz = Math.sin(pitch) * s;
      const ny = Math.cos(pitch);
      for (const hx of [-1, 1]) {
        const len = (w + 0.6) / 2;
        const h = this.part(b, 'roof', 'roof', (hx * len) / 2, cy + ny * 0.08, cz + nz * 0.08, len, 0.16, L, roofC, s * pitch, 0, 0);
        if (h) h.plate = true;
      }
    }
    for (const s of [1, -1]) {
      this.part(b, 'gables', 'gable', s * (w / 2 - th / 2), baseY + rise / 2, 0, d - 0.02, rise, th, siding, 0, Math.PI / 2, 0);
    }
    // Fascia
    this.part(b, 'trim', 'paint', 0, baseY - 0.1, d / 2 + ov - 0.05, w + 0.6, 0.22, 0.08, trim);
    this.part(b, 'trim', 'paint', 0, baseY - 0.1, -(d / 2 + ov - 0.05), w + 0.6, 0.22, 0.08, trim);
    // Chaminé
    if (r.chance(0.7)) {
      const cz = -d / 6;
      const top = baseY + rise * (1 - Math.abs(cz) / (d / 2)) + 1.1;
      const bot = baseY - 0.6;
      this.part(b, 'chimney', 'brick', w / 2 - 1.3, (top + bot) / 2, cz, 0.75, top - bot, 0.75, '#ffffff');
    }
    b.roofTop = baseY + rise;
    return b;
  }

  // ------------------------------------------------------------------ comércio
  buildCommercial(x, z, yaw, w, d, opts = {}) {
    const r = this.rng;
    const stories = opts.stories || (r.chance(0.35) ? 2 : 1);
    const h = opts.h || (stories === 2 ? r.float(7.2, 8.4) : r.float(4.6, 5.6));
    const b = this.newBuilding('commercial', 'commercial', opts.name || 'Prédio comercial', x, z, yaw, w, d);
    b.height = h;
    const useBrick = opts.brick ?? r.chance(0.75);
    const wallPool = useBrick ? 'brick' : 'siding';
    const wallCol = new THREE.Color(useBrick ? r.pick(BRICK_TINTS) : r.pick(SIDING_COLORS));
    const th = 0.3;
    this.part(b, 'foundation', 'concrete', 0, 0.1, 0, w + 0.4, 0.4, d + 0.4);
    const fy = 0.3;
    const segX = Math.max(2, Math.round(w / 7));
    const segZ = Math.max(2, Math.round(d / 7));
    for (const side of [1, -1]) {
      for (let k = 0; k < segX; k++) {
        const sw = w / segX;
        const hh = this.part(b, 'walls', wallPool, -w / 2 + sw * (k + 0.5), fy + h / 2, side * (d / 2 - th / 2), sw, h, th, wallCol);
        if (hh) {
          hh.normal = new THREE.Vector3(0, 0, side);
          hh.windows = [];
        }
      }
    }
    for (const side of [1, -1]) {
      const dd = d - th * 2;
      for (let k = 0; k < segZ; k++) {
        const sd = dd / segZ;
        const hh = this.part(b, 'walls', wallPool, side * (w / 2 - th / 2), fy + h / 2, -dd / 2 + sd * (k + 0.5), th, h, sd, wallCol);
        if (hh) {
          hh.normal = new THREE.Vector3(side, 0, 0);
          hh.windows = [];
        }
      }
    }
    const walls = b.groups.walls;
    const nearestWall = (lx, lz) => walls.reduce((a, c) => (Math.hypot(c.local.x - lx, c.local.z - lz) < Math.hypot(a.local.x - lx, a.local.z - lz) ? c : a));
    const addWin = (lx, ly, lz, sx, sy, sz, lit) => {
      const hh = this.part(b, 'windows', 'glass', lx, ly, lz, sx, sy, sz, lit ? new THREE.Color(1, 0.85, 0.55) : new THREE.Color(0.03, 0.03, 0.03));
      if (hh) {
        const wl = nearestWall(lx, lz);
        hh.wall = wl;
        wl.windows.push(hh);
      }
    };
    // Vitrine
    if (!opts.noStorefront) {
      const panes = Math.max(2, Math.round((w * 0.75) / 3.2));
      const pw = (w * 0.75) / panes;
      for (let k = 0; k < panes; k++) addWin(-w * 0.375 + pw * (k + 0.5), fy + 1.6, d / 2 + 0.04, pw - 0.15, 2.4, 0.08, r.chance(0.8));
      // Toldo + letreiro
      this.part(b, 'awning', 'metal', 0, fy + 3.15, d / 2 + 0.85, w * 0.82, 0.12, 1.7, r.pick(SIGN_COLORS), -0.25, 0, 0);
      this.part(b, 'sign', 'paint', 0, Math.min(h - 0.7, fy + 4.1), d / 2 + 0.16, w * 0.6, 0.9, 0.18, r.pick(SIGN_COLORS));
    }
    if (stories === 2 || opts.windowsAll) {
      const n = Math.max(2, Math.round(w / 3.5));
      for (let k = 0; k < n; k++) {
        const lx = -w / 2 + (w / n) * (k + 0.5);
        const ly = opts.windowsAll ? fy + 1.9 : fy + 5.4;
        addWin(lx, ly, d / 2 + 0.04, 1.3, 1.5, 0.08, r.chance(0.5));
        addWin(lx, ly, -d / 2 - 0.04, 1.3, 1.5, 0.08, r.chance(0.5));
      }
    }
    // Telhado plano em placas + platibanda
    const nx = Math.max(2, Math.round(w / 9));
    const nz = Math.max(2, Math.round(d / 9));
    const roofC = new THREE.Color(r.pick(['#4c4d50', '#3b3c3e', '#5e5f62']));
    for (let i = 0; i < nx; i++) {
      for (let k = 0; k < nz; k++) {
        const hh = this.part(b, 'roof', 'roof', -w / 2 + (w / nx) * (i + 0.5), fy + h + 0.12, -d / 2 + (d / nz) * (k + 0.5), w / nx, 0.24, d / nz, roofC);
        if (hh) hh.plate = true;
      }
    }
    for (const side of [1, -1]) {
      this.part(b, 'parapet', wallPool, 0, fy + h + 0.45, side * (d / 2 - th / 2), w, 0.7, th, wallCol);
      this.part(b, 'parapet', wallPool, side * (w / 2 - th / 2), fy + h + 0.45, 0, th, 0.7, d - th * 2, wallCol);
    }
    if (r.chance(0.6)) this.part(b, 'extras', 'metal', r.float(-w / 4, w / 4), fy + h + 0.85, r.float(-d / 4, d / 4), 2.2, 1.2, 1.6, '#d0d0d0');
    b.roofTop = fy + h + 0.8;
    return b;
  }

  buildChurch(x, z, yaw) {
    const b = this.buildHouse(x, z, yaw, { w: 13, d: 24, stories: 2, siding: '#f6f6f2', roof: '#3a3b3e', name: 'Igreja' });
    b.kind = 'church';
    b.di = 'church';
    // Torre e campanário na frente
    const ty = 0.45;
    const tw = 4.2;
    const tz = 12 + tw / 2 - 0.2;
    const th = 14;
    for (const [lx, lz, sx, sz] of [
      [0, tz + tw / 2 - 0.1, tw, 0.2],
      [0, tz - tw / 2 + 0.1, tw, 0.2],
      [tw / 2 - 0.1, tz, 0.2, tw],
      [-tw / 2 + 0.1, tz, 0.2, tw],
    ]) {
      const h = this.part(b, 'steeple', 'siding', lx, ty + th / 2, lz, sx, th, sz, '#f6f6f2');
      if (h) h.windows = [];
    }
    this.part(b, 'steeple', 'spire', 0, ty + th + 4.5, tz, tw * 1.05, 9, tw * 1.05, '#3a3b3e');
    this.part(b, 'steeple', 'paint', 0, ty + th + 9.6, tz, 0.15, 1.6, 0.15, '#d4af37');
    this.part(b, 'steeple', 'paint', 0, ty + th + 9.9, tz, 0.8, 0.15, 0.15, '#d4af37');
    this.part(b, 'door', 'paint', 0, ty + 1.4, tz + tw / 2 + 0.02, 1.8, 2.8, 0.1, '#5a3320');
    b.d = 24 + tw;
    b.hd = b.d / 2;
    return b;
  }

  buildMobileHome(x, z, yaw) {
    const r = this.rng;
    const w = 4.3;
    const l = 14.5;
    const b = this.newBuilding('mobile', 'mobile', 'Casa móvel (trailer)', x, z, yaw, l, w);
    b.height = 3.7;
    const col = new THREE.Color(r.pick(['#f1efe8', '#e8dcc0', '#cfd8dc', '#d7ccc8', '#e0e7d8']));
    for (const lx of [-5, 0, 5]) this.part(b, 'blocks', 'concrete', lx, 0.35, 0, 0.6, 0.7, 3.6);
    const body = this.part(b, 'body', 'metal', 0, 0.7 + 1.45, 0, l, 2.9, w, col);
    this.part(b, 'skirt', 'metal', 0, 0.36, 0, l - 0.2, 0.7, w - 0.15, '#8d8d8d');
    body.windows = [];
    for (const lx of [-4.8, -1.6, 2.4, 5.2]) {
      for (const s of [1, -1]) {
        const h = this.part(b, 'windows', 'glass', lx, 2.35, s * (w / 2 + 0.03), 1.2, 1.0, 0.06, r.chance(0.6) ? new THREE.Color(0.9, 0.7, 0.45) : new THREE.Color(0.02, 0.02, 0.02));
        if (h) {
          h.wall = body;
          body.windows.push(h);
        }
      }
    }
    const door = this.part(b, 'door', 'paint', 1.2, 1.75, w / 2 + 0.04, 0.9, 1.95, 0.06, '#a0a0a0');
    if (door) door.wall = body;
    this.part(b, 'awning', 'metal', 1.2, 3.0, w / 2 + 1.0, 3.2, 0.08, 2.0, '#cfcfcf', -0.12, 0, 0);
    return b;
  }

  buildBarn(x, z, yaw) {
    const b = this.newBuilding('barn', 'barn', 'Celeiro', x, z, yaw, 16, 24);
    const red = new THREE.Color('#8e2b20');
    const w = 16;
    const d = 24;
    const wh = 6.5;
    b.height = wh;
    this.part(b, 'foundation', 'concrete', 0, 0.1, 0, w + 0.3, 0.4, d + 0.3);
    for (const side of [1, -1]) {
      for (let k = 0; k < 2; k++) {
        const h = this.part(b, 'walls', 'wood', -w / 4 + (w / 2) * k, 0.3 + wh / 2, side * (d / 2 - 0.12), w / 2, wh, 0.24, red);
        if (h) {
          h.normal = new THREE.Vector3(0, 0, side);
          h.windows = [];
        }
      }
      for (let k = 0; k < 3; k++) {
        const sd = (d - 0.5) / 3;
        const h = this.part(b, 'walls', 'wood', side * (w / 2 - 0.12), 0.3 + wh / 2, -(d - 0.5) / 2 + sd * (k + 0.5), 0.24, wh, sd, red);
        if (h) {
          h.normal = new THREE.Vector3(side, 0, 0);
          h.windows = [];
        }
      }
    }
    this.part(b, 'door', 'paint', 0, 0.3 + 2.2, d / 2 + 0.05, 4.4, 4.4, 0.1, '#eeeeee');
    const pitch = 0.62;
    const rise = (w / 2) * Math.tan(pitch);
    const L = (w / 2 + 0.6) / Math.cos(pitch);
    for (const s of [1, -1]) {
      for (let k = 0; k < 3; k++) {
        const len = (d + 0.8) / 3;
        const h = this.part(b, 'roof', 'metal', s * ((w / 2 + 0.6) / 2), 0.3 + wh + rise - ((w / 2 + 0.6) * Math.tan(pitch)) / 2 + 0.06, -(d + 0.8) / 2 + len * (k + 0.5), L, 0.1, len, '#7a7f84', 0, 0, -s * pitch);
        if (h) h.plate = true;
      }
    }
    for (const s of [1, -1]) this.part(b, 'gables', 'gable', 0, 0.3 + wh + rise / 2, s * (d / 2 - 0.12), w - 0.05, rise, 0.24, red);
    b.roofTop = wh + rise;
    return b;
  }

  buildSilo(x, z) {
    const b = this.newBuilding('silo', 'silo', 'Silo', x, z, 0, 6, 6);
    b.height = 18;
    const c = this.part(b, 'body', 'cylinder', 0, 9, 0, 6, 18, 6, '#d8d4cc');
    if (c) c.windows = [];
    this.part(b, 'roof', 'metalCyl', 0, 18.4, 0, 6.2, 0.9, 6.2, '#9aa0a6');
    return b;
  }

  buildWaterTower(x, z) {
    const b = this.newBuilding('water', 'watertower', "Caixa d'água", x, z, 0, 10, 10);
    b.height = 30;
    b.collide = false;
    for (const [lx, lz] of [[3.4, 3.4], [-3.4, 3.4], [3.4, -3.4], [-3.4, -3.4]]) {
      const h = this.part(b, 'legs', 'metalCyl', lx, 12, lz, 0.55, 24, 0.55, '#b0b6bb');
      if (h) h.windows = [];
    }
    this.part(b, 'tank', 'metalCyl', 0, 27, 0, 10.5, 7, 10.5, '#c9ced2');
    this.part(b, 'tankTop', 'spire', 0, 31.5, 0, 10.5, 2.2, 10.5, '#9da3a8');
    return b;
  }

  buildGasStation(x, z, yaw) {
    const b = this.newBuilding('gas', 'canopy', 'Cobertura do posto', x, z, yaw, 18, 11);
    b.collide = false;
    b.height = 5.6;
    for (const [lx, lz] of [[-6, -3.5], [6, -3.5], [-6, 3.5], [6, 3.5]]) {
      const h = this.part(b, 'columns', 'cylinder', lx, 2.6, lz, 0.5, 5.2, 0.5, '#e0e0e0');
      if (h) h.windows = [];
    }
    for (let i = 0; i < 2; i++) {
      const h = this.part(b, 'roof', 'metal', -4.5 + i * 9, 5.6, 0, 9, 0.9, 11, '#e8e8e8');
      if (h) h.plate = true;
    }
    this.part(b, 'trim', 'paint', 0, 5.6, 5.52, 18.05, 0.6, 0.06, '#c62828');
    this.part(b, 'trim', 'paint', 0, 5.6, -5.52, 18.05, 0.6, 0.06, '#c62828');
    for (const lx of [-6, 0, 6]) this.part(b, 'pumps', 'paint', lx, 0.8, 0, 0.9, 1.6, 0.6, '#d32f2f');
    return b;
  }

  // ------------------------------------------------------------------ layout
  layout() {
    const r = this.rng;
    const t = this.terrain;
    const addCar = (x, z, yaw, type) => {
      type = type || r.pick(['sedan', 'sedan', 'suv', 'pickup']);
      this.cars.push({ x, z, yaw, type, color: r.pick(CAR_COLORS) });
    };

    // Residencial
    for (const s of [-160, -55, 55, 160]) {
      for (const side of [1, -1]) {
        if (Math.abs(s) === 55 && Math.sign(s) !== side) continue;
        for (const [x0, x1] of COLUMNS) {
          for (let k = 0; k < 3; k++) {
            if (r.chance(0.08)) continue;
            const lotW = (x1 - x0) / 3;
            const cx = x0 + lotW * (k + 0.5) + r.float(-2, 2);
            const d = r.float(8, 10.5);
            const cz = s + side * (12.5 + d / 2 + r.float(0, 3));
            const yaw = side > 0 ? Math.PI : 0;
            const b = this.buildHouse(cx, cz, yaw, { d });
            const dx = cx + (r.chance(0.5) ? 1 : -1) * (b.w / 2 + 2.4);
            this.drives.push({ x: dx, z0: s + side * 4.5, z1: cz + side * (d / 2), w: 3.6 });
            if (r.chance(0.55)) addCar(dx, s + side * (8.5 + r.float(0, 3)), yaw + (r.chance(0.5) ? Math.PI : 0));
            // árvores de quintal
            const nt = r.int(0, 2);
            for (let i = 0; i < nt; i++) {
              const tx = cx + r.float(-lotW / 2 + 3, lotW / 2 - 3);
              const tz = cz + side * r.float(d / 2 + 4, d / 2 + 14);
              if (Math.abs(tx - dx) > 3) this.yardTrees.push({ x: tx, z: tz });
            }
            if (r.chance(0.5)) this.yardTrees.push({ x: cx + r.float(-lotW / 2 + 3, lotW / 2 - 3), z: s + side * r.float(7.5, 9) });
            this.lots.push({ x: cx, z: cz });
          }
        }
      }
    }

    // Centro (Rua Principal, z = 0)
    for (const side of [1, -1]) {
      for (let ci = 0; ci < COLUMNS.length; ci++) {
        const [x0, x1] = COLUMNS[ci];
        const yaw = side > 0 ? Math.PI : 0;
        if (ci === 3 && side > 0) {
          this.buildChurch((x0 + x1) / 2 + 8, side * (6 + 3 + 17), yaw);
          continue;
        }
        if (ci === 0 && side < 0) {
          const b = this.buildCommercial((x0 + x1) / 2, side * (6 + 4 + 8), yaw, 52, 15, { name: 'Escola', h: 4.8, stories: 1, brick: true, noStorefront: true, windowsAll: true });
          b.kind = 'school';
          for (let i = 0; i < 4; i++) addCar(x0 + 12 + i * 5, side * 40, Math.PI / 2);
          continue;
        }
        let x = x0;
        while (x < x1 - 12) {
          const w = Math.min(r.float(16, 27), x1 - x);
          const d = r.float(15, 21);
          const isHall = ci === 1 && side > 0 && x === x0;
          const ww = isHall ? 30 : w;
          this.buildCommercial(x + ww / 2, side * (6 + 3 + d / 2), yaw, ww - 1, d, isHall ? { name: 'Prefeitura', stories: 2, h: 8.2, brick: true } : {});
          x += ww;
        }
      }
    }
    // Carros estacionados na Rua Principal
    for (let x = -270; x <= 270; x += 7.5) {
      if (X_STREETS.some((s) => Math.abs(x - s) < 9)) continue;
      for (const side of [1, -1]) if (r.chance(0.35)) addCar(x, side * 4.6, side > 0 ? -Math.PI / 2 : Math.PI / 2);
    }

    // Posto de gasolina e caixa d'água
    this.buildGasStation(256, 24, Math.PI);
    this.buildCommercial(256, 42, Math.PI, 10, 8, { name: 'Loja de conveniência', stories: 1, h: 4.2 });
    addCar(250, 22, 0);
    this.buildWaterTower(-258, -32);

    // Parque de trailers
    for (const tx of [322, 368]) {
      for (let tz = -98; tz <= 98; tz += 24) {
        if (Math.abs(tz) < 14) continue;
        if (r.chance(0.2)) continue;
        this.buildMobileHome(tx, tz, Math.PI / 2 + (tx > 340 ? Math.PI : 0));
        if (r.chance(0.5)) addCar(tx + (tx > 340 ? -9 : 9), tz + 4, 0);
      }
    }

    // Fazenda
    this.buildHouse(FARM.x, FARM.z, Math.PI / 2, { name: 'Casa da fazenda', siding: '#f2f0ea', roof: '#4a3c34', stories: 2 });
    this.buildBarn(FARM.x + 48, FARM.z - 14, Math.PI / 2);
    this.buildSilo(FARM.x + 64, FARM.z + 14);
    this.buildSilo(FARM.x + 72, FARM.z + 22);
    this.cars.push({ x: FARM.x + 22, z: FARM.z + 12, yaw: 0.4, type: 'tractor', color: '#2e7d32' });
    addCar(FARM.x + 14, FARM.z - 10, 1.2, 'pickup');
    for (let i = 0; i < 9; i++) this.yardTrees.push({ x: FARM.x - 30 + r.float(-6, 6), z: FARM.z - 40 + i * 11 });

    // Picape do jogador (caçador de tempestades)
    this.playerTruck = { x: -318, z: -4.6, yaw: -Math.PI / 2, type: 'pickup', color: '#f0f0ee', player: true };
    this.cars.push(this.playerTruck);
    this.playerSpawn = new THREE.Vector3(-312, 0, -8);

    // Instancia os veículos
    for (const c of this.cars) {
      const mesh = makeVehicleMesh(c.type, c.color, this.quality.shadows);
      c.y = t.heightAt(c.x, c.z);
      mesh.position.set(c.x, c.y, c.z);
      mesh.rotation.y = c.yaw;
      this.scene.add(mesh);
      c.mesh = mesh;
      c.spec = VEHICLE_TYPES[c.type];
      c.name = c.player ? 'Sua picape' : c.spec.name;
    }

    // Postes de iluminação na Rua Principal
    let alt = 1;
    for (let x = -262; x <= 262; x += 38) {
      if (X_STREETS.some((s) => Math.abs(x - s) < 7)) continue;
      alt *= -1;
      const z = alt * 7.6;
      const y = t.heightAt(x, z);
      const pole = this.pools.add('metalCyl', new THREE.Vector3(x, y + 3.6, z), new THREE.Quaternion(), new THREE.Vector3(0.18, 7.2, 0.18), new THREE.Color('#6d7378'));
      const arm = this.pools.add('metal', new THREE.Vector3(x, y + 7.1, z - alt * 1.0), new THREE.Quaternion(), new THREE.Vector3(0.12, 0.12, 2.0), new THREE.Color('#6d7378'));
      const lamp = this.pools.add('glass', new THREE.Vector3(x, y + 7.0, z - alt * 1.9), new THREE.Quaternion(), new THREE.Vector3(0.5, 0.14, 0.8), new THREE.Color(2.2, 1.6, 0.9));
      this.streetLights.push({ x, z, y, pole, arm, lamp, alive: true, lampPos: new THREE.Vector3(x, y + 6.9, z - alt * 1.9) });
    }
  }

  // ------------------------------------------------------------------ postes e fios
  buildUtilities() {
    const t = this.terrain;
    const lines = [];
    const along = (fn, from, to, step) => {
      const pts = [];
      for (let s = from; s <= to; s += step) pts.push(fn(s));
      return pts;
    };
    lines.push(along((x) => [x, roadZ(x) + 9.5], -1650, 1650, 46));
    lines.push(along((z) => [roadX(z) + 9, z], -1300, -20, 46));
    lines.push(along((z) => [roadX(z) + 9, z], 20, 1300, 46));
    for (const s of [-160, -55, 55, 160]) lines.push(along((x) => [x, s + 6.5 * Math.sign(s)], -270, 270, 45));

    const wood = new THREE.Color('#7a5c43');
    for (const pts of lines) {
      const line = [];
      for (let i = 0; i < pts.length; i++) {
        const [x, z] = pts[i];
        const y = t.heightAt(x, z);
        const nxt = pts[Math.min(i + 1, pts.length - 1)];
        const prv = pts[Math.max(i - 1, 0)];
        const dirA = Math.atan2(nxt[1] - prv[1], nxt[0] - prv[0]);
        const q = new THREE.Quaternion().setFromAxisAngle(_up, -dirA);
        const pole = this.pools.add('woodCyl', new THREE.Vector3(x, y + 5, z), new THREE.Quaternion(), new THREE.Vector3(0.3, 10.4, 0.3), wood);
        const arm = this.pools.add('wood', new THREE.Vector3(x, y + 9.4, z), q.clone(), new THREE.Vector3(0.12, 0.14, 2.3), wood);
        let xf = null;
        if (i % 4 === 2) xf = this.pools.add('metalCyl', new THREE.Vector3(x + 0.35, y + 8.2, z), new THREE.Quaternion(), new THREE.Vector3(0.55, 0.95, 0.55), new THREE.Color('#9ea4a8'));
        const p = {
          id: this.poles.length, x, y, z, dirA, q, pole, arm, xf,
          dod: 0, quality: this.rng.float(0.85, 1.15), alive: true, lean: 0, spans: [],
          inTown: Math.abs(x) < 420 && Math.abs(z) < 260,
        };
        this.poles.push(p);
        line.push(p);
      }
      this.poleLines.push(line);
    }
    // Fios com catenária
    const SEG = 8;
    const spans = [];
    for (const line of this.poleLines) {
      for (let i = 0; i < line.length - 1; i++) {
        const a = line[i];
        const b = line[i + 1];
        const sp = { a, b, down: false, offset: spans.length };
        spans.push(sp);
        a.spans.push(sp);
        b.spans.push(sp);
      }
    }
    this.spans = spans;
    this.wireSeg = SEG;
    const pos = new Float32Array(spans.length * 3 * SEG * 2 * 3);
    this.wireGeo = new THREE.BufferGeometry();
    this.wireGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    for (const sp of spans) this.writeSpan(sp);
    this.wireGeo.computeBoundingSphere();
    const wires = new THREE.LineSegments(this.wireGeo, new THREE.LineBasicMaterial({ color: 0x151515 }));
    wires.frustumCulled = false;
    this.scene.add(wires);
    this.wires = wires;
  }

  writeSpan(sp) {
    const SEG = this.wireSeg;
    const arr = this.wireGeo.attributes.position.array;
    let o = sp.offset * 3 * SEG * 2 * 3;
    const a = sp.a;
    const b = sp.b;
    for (let w = 0; w < 3; w++) {
      const off = (w - 1) * 1.0;
      const pa = new THREE.Vector3(a.x + Math.cos(a.dirA + Math.PI / 2) * off, a.y + 9.5, a.z + Math.sin(a.dirA + Math.PI / 2) * off);
      const pb = new THREE.Vector3(b.x + Math.cos(b.dirA + Math.PI / 2) * off, b.y + 9.5, b.z + Math.sin(b.dirA + Math.PI / 2) * off);
      for (let k = 0; k < SEG; k++) {
        for (const tt of [k / SEG, (k + 1) / SEG]) {
          const x = pa.x + (pb.x - pa.x) * tt;
          const z = pa.z + (pb.z - pa.z) * tt;
          let y;
          if (sp.down) y = this.terrain.heightAt(x, z) + 0.12 + Math.sin(tt * Math.PI) * 0.3;
          else y = pa.y + (pb.y - pa.y) * tt - Math.sin(tt * Math.PI) * 0.75;
          arr[o++] = x;
          arr[o++] = y;
          arr[o++] = z;
        }
      }
    }
    this.wireGeo.attributes.position.needsUpdate = true;
  }

  // ------------------------------------------------------------------ mapa (ruas)
  drawMap() {
    const S = 1024;
    const cv = document.createElement('canvas');
    cv.width = cv.height = S;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, S, S);
    ctx.globalCompositeOperation = 'lighter';
    const H = TOWN_HALF;
    const rect = (x0, z0, x1, z1, style) => {
      ctx.fillStyle = style;
      ctx.fillRect(x0 + H, H - Math.max(z0, z1), Math.abs(x1 - x0), Math.abs(z1 - z0));
    };
    const G = 'rgb(0,255,0)';
    const R = 'rgb(255,0,0)';
    // Calçadas
    for (const s of Z_STREETS) {
      const hw = s === 0 ? 6 : 4.5;
      rect(-275, s - hw - 2.2, 275, s - hw - 0.4, G);
      rect(-275, s + hw + 0.4, 275, s + hw + 2.2, G);
    }
    for (const s of X_STREETS) {
      rect(s - 6.7, -170, s - 4.9, 170, G);
      rect(s + 4.9, -170, s + 6.7, 170, G);
    }
    // Calçadas largas e estacionamentos no centro
    rect(-275, -9, 275, -6, G);
    rect(-275, 6, 275, 9, G);
    rect(-213, -50, -117, -32, R);
    rect(230, 8, 290, 48, G);
    // Entradas de garagem
    ctx.globalCompositeOperation = 'source-over';
    for (const d of this.drives) {
      ctx.fillStyle = 'rgb(0,200,0)';
      ctx.fillRect(d.x - d.w / 2 + H, H - Math.max(d.z0, d.z1), d.w, Math.abs(d.z1 - d.z0));
    }
    ctx.globalCompositeOperation = 'lighter';
    // Ruas (asfalto)
    for (const s of Z_STREETS) {
      const hw = s === 0 ? 6 : 4.5;
      if (s === 0) {
        // A Rua Principal vira rodovia (segue roadZ)
        for (let x = -H; x < H; x += 2) {
          ctx.fillStyle = R;
          ctx.fillRect(x + H, H - (roadZ(x) + hw), 2.2, hw * 2);
        }
      } else rect(-275, s - hw, 275, s + hw, R);
    }
    for (const s of X_STREETS) {
      if (s === 0) {
        for (let z = -H; z < H; z += 2) {
          ctx.fillStyle = R;
          ctx.fillRect(roadX(z) - 4.5 + H, H - z - 2.2, 9, 2.2);
        }
      } else rect(s - 4.5, -175, s + 4.5, 175, R);
    }
    // Cascalho do parque de trailers
    ctx.fillStyle = 'rgb(120,120,0)';
    ctx.fillRect(338 + H, H - 108, 10, 216);
    ctx.fillRect(300 + H, H - 4, 90, 8);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.NoColorSpace;
    tex.anisotropy = 8;
    this.mapTexture = tex;
  }

  // Colisões simples do jogador com construções em pé.
  collide(pos, radius) {
    for (const b of this.buildings) {
      if (!b.collide || b.dod >= 5) continue;
      const dx = pos.x - b.x;
      const dz = pos.z - b.z;
      if (dx * dx + dz * dz > (Math.max(b.hw, b.hd) + radius + 2) ** 2) continue;
      if (pos.y > b.y + (b.height || 6) + 1.5) continue;
      const c = Math.cos(b.yaw);
      const s = Math.sin(b.yaw);
      let lx = dx * c - dz * s;
      let lz = dx * s + dz * c;
      // considera paredes que ainda existem
      const hw = b.hw + radius;
      const hd = b.hd + radius;
      if (Math.abs(lx) < hw && Math.abs(lz) < hd) {
        if (b.groups.walls && b.groups.walls.filter((w) => w.alive).length < b.groups.walls.length * 0.5) continue;
        const px = hw - Math.abs(lx);
        const pz = hd - Math.abs(lz);
        if (px < pz) lx = Math.sign(lx || 1) * hw;
        else lz = Math.sign(lz || 1) * hd;
        pos.x = b.x + lx * c + lz * s;
        pos.z = b.z - lx * s + lz * c;
      }
    }
  }

  setPower(p) {
    this.power = p;
  }
}
