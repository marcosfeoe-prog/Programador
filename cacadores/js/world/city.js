// Cidades (malha de ruas, lotes, centro comercial, praça com igreja, escola, posto,
// caixa d'água, elevador de grãos, parque de trailers) e fazendas espalhadas pelo campo.

import * as THREE from 'three';
import { RNG } from '../core/rng.js';
import { Noise } from '../core/noise.js';
import { WORLD } from '../config.js';
import { smoothPath } from './roads.js';
import {
  GeoBuilder,
  houseParams,
  makeHouse,
  shopParams,
  makeChurch,
  makeWaterTower,
  farmBuildings,
  mobileHome,
  schoolModel,
  gasStation,
  cylinderInto,
  rubbleGeometry,
  boxAtlas,
  mergeGeos,
} from './buildings.js';
import { BuildingSet } from './structures.js';
import { patchWorld } from '../render/materials.js';

const STYLE = {
  us: { block: [125, 108], front: 22, setback: 10, depth: 40, ang: 0, palette: ['#f2efe6', '#e9e1cf', '#d8dcdf', '#efe3b8', '#c9d6df', '#c5ceb4', '#d9c6a5', '#ffffff', '#b8c4cc'], roofs: ['#5a5856', '#3c3b3a', '#6b5a4a', '#77736e', '#4a4e55'] },
  ca: { block: [125, 108], front: 22, setback: 10, depth: 40, ang: 0, palette: ['#f2efe6', '#e2d8c6', '#d0d8de', '#b9c9b0', '#e8e0c8', '#c84a3a', '#ffffff', '#9fb4c4'], roofs: ['#4a4846', '#2e2d2c', '#5e5246', '#6a6d72'] },
  br: { block: [96, 84], front: 13, setback: 4, depth: 30, ang: 0.45, palette: ['#f2d16b', '#f4b49a', '#b8dcb0', '#a8cde8', '#ffffff', '#f2e6c8', '#d8b8e0', '#f0a25a', '#e8e4dc', '#9fd4c8'], roofs: ['#ffffff', '#f0e0d8', '#e8d0c0', '#ffffff'] },
  ar: { block: [100, 100], front: 11, setback: 1.5, depth: 32, ang: 0.15, palette: ['#f2efe8', '#efe2c4', '#dcd8d0', '#e8c890', '#d8a888', '#ffffff', '#c8c4bc'], roofs: ['#ffffff', '#efe0d4', '#f0f0f0'] },
  uy: { block: [100, 100], front: 11, setback: 1.5, depth: 32, ang: 0.3, palette: ['#f2efe8', '#efe2c4', '#dcd8d0', '#e8c890', '#cfe0e8', '#ffffff', '#e8d8b0'], roofs: ['#ffffff', '#efe0d4', '#f0f0f0'] },
  cl: { block: [100, 92], front: 13, setback: 3, depth: 30, ang: 0.4, palette: ['#e8eef2', '#f2d16b', '#9ec2dc', '#e88a7a', '#a8d0a0', '#ffffff', '#f2e6c8', '#c84a3a', '#5a8ac0'], roofs: ['#a8aaac', '#8c3a2e', '#c8c8c8', '#4a6a8a', '#ffffff'] },
};

const CORRUGATED = ['#a8aaac', '#9a4a32', '#4f6f4f', '#8c8e90', '#c0c2c4', '#6a3a2a', '#5a6e8a'];

export function styleOf(country) {
  return STYLE[country.houseStyle] || STYLE.us;
}

// ------------------------------------------------------------------ Layout
export function layoutSettlements(country, terrain, roads, seed) {
  const rng = new RNG(seed);
  const st = styleOf(country);
  const noise = new Noise(seed + 3);
  const cities = [];
  for (const def of country.cities) {
    const r = [0, 520, 850, 1200][def.size] || 700;
    const city = { ...def, radius: r, lots: [], landmarks: [], streets: [], plaza: null, rng: rng.fork(def.name) };
    const crng = city.rng;
    city.ang = st.ang ? crng.range(-st.ang, st.ang) : 0;
    const ca = Math.cos(city.ang);
    const sa = Math.sin(city.ang);
    const toW = (u, v) => [def.x + u * ca - v * sa, def.z + u * sa + v * ca];
    const bound = (u, v) => {
      const th = Math.atan2(v, u);
      return r * (0.8 + 0.32 * noise.n2(Math.cos(th) * 1.3 + def.x * 0.001, Math.sin(th) * 1.3));
    };
    const inside = (u, v) => Math.hypot(u, v) < bound(u, v);
    const [bx, bz] = st.block;
    const nu = Math.ceil(r / bx) + 1;
    const nv = Math.ceil(r / bz) + 1;
    // Ruas: linhas da grade recortadas pelo contorno da cidade.
    for (const axis of [0, 1]) {
      const n = axis === 0 ? nu : nv;
      for (let k = -n; k <= n; k++) {
        const fixed = axis === 0 ? (k + 0.5) * bx : (k + 0.5) * bz;
        let run = [];
        const L = axis === 0 ? nv * bz : nu * bx;
        for (let t = -L; t <= L; t += 20) {
          const u = axis === 0 ? fixed : t;
          const v = axis === 0 ? t : fixed;
          if (inside(u, v)) run.push(toW(u, v));
          else if (run.length) {
            if (run.length > 2) city.streets.push(run);
            run = [];
          }
        }
        if (run.length > 2) city.streets.push(run);
      }
    }
    for (const s of city.streets) roads.add('street', s, '', { city: def.name });

    // Quarteirões e lotes.
    const latin = country.houseStyle !== 'us' && country.houseStyle !== 'ca';
    const sw = 9;
    for (let i = -nu; i < nu; i++)
      for (let j = -nv; j < nv; j++) {
        const cu = (i + 1) * bx;
        const cv = (j + 1) * bz;
        if (!inside(cu, cv)) continue;
        const dc = Math.hypot(cu, cv) / r;
        const isPlaza = latin && i === -1 && j === -1;
        if (isPlaza) {
          const [px, pz] = toW(cu, cv);
          city.plaza = { x: px, z: pz, u: cu, v: cv, w: bx - sw, d: bz - sw };
          continue;
        }
        const down = dc < (def.size >= 3 ? 0.32 : def.size === 2 ? 0.24 : 0.16);
        const Bu = bx - sw;
        const Bv = bz - sw;
        const front = down ? crng.range(10, 15) : st.front * crng.range(0.85, 1.2);
        const n = Math.max(1, Math.floor(Bu / front));
        const fw = Bu / n;
        for (const side of [-1, 1]) {
          for (let k = 0; k < n; k++) {
            if (!down && crng.chance(0.08)) continue; // terreno vazio
            const u = cu - Bu / 2 + fw * (k + 0.5);
            const setback = down ? 0.6 : st.setback * crng.range(0.8, 1.3);
            const vEdge = cv + (side * Bv) / 2;
            const lot = {
              u,
              v: vEdge - side * setback,
              face: side, // a frente aponta para +side em v
              fw,
              kind: down ? 'shop' : 'house',
              dc,
            };
            const [x, z] = toW(lot.u, lot.v);
            lot.x = x;
            lot.z = z;
            lot.rot = -city.ang + (side > 0 ? 0 : Math.PI);
            // Árvore no quintal da frente ou na calçada.
            const tv = vEdge - side * Math.max(1.5, setback * 0.5);
            const [tx, tz] = toW(u + fw * 0.35 * crng.sign(), tv);
            lot.treeX = tx;
            lot.treeZ = tz;
            if (!roads.query(x, z, 5)) city.lots.push(lot);
          }
        }
      }
    // Marcos: igreja, escola, posto, caixa d'água, elevador, trailers.
    const pickLot = (pred) => {
      const cands = city.lots.filter((l) => l.kind === 'house' && pred(l));
      if (!cands.length) return null;
      const l = crng.pick(cands);
      l.kind = 'used';
      return l;
    };
    if (city.plaza) city.landmarks.push({ kind: 'church', x: city.plaza.x, z: city.plaza.z, rot: city.ang, plaza: true });
    else {
      const l = pickLot((l) => l.dc < 0.6);
      if (l) city.landmarks.push({ kind: 'church', x: l.x, z: l.z, rot: l.rot });
    }
    if (def.size >= 2) {
      const l = pickLot((l) => l.dc > 0.3 && l.dc < 0.8);
      if (l) city.landmarks.push({ kind: 'school', x: l.x, z: l.z, rot: l.rot });
      if (def.size >= 3) {
        const l2 = pickLot((l) => l.dc > 0.4);
        if (l2) city.landmarks.push({ kind: 'school', x: l2.x, z: l2.z, rot: l2.rot });
      }
    }
    const tower = country.props?.waterTower;
    if (tower) {
      const a = crng.range(0, Math.PI * 2);
      const tx = def.x + Math.cos(a) * r * 0.35;
      const tz = def.z + Math.sin(a) * r * 0.35;
      if (!roads.query(tx, tz, 14)) city.landmarks.push({ kind: 'watertower', x: tx, z: tz, rot: 0 });
    }
    cities.push(city);
  }
  // Posto e elevador junto às rodovias, na saída da cidade.
  for (const city of cities) {
    const crng = city.rng;
    let placedGas = false;
    let placedElev = false;
    for (const road of roads.roads) {
      if (road.type !== 'highway' && road.type !== 'interstate') continue;
      for (let i = 0; i < road.pts.length - 1; i++) {
        const p = road.pts[i];
        const d = Math.hypot(p[0] - city.x, p[1] - city.z);
        if (Math.abs(d - city.radius * 0.95) > 25) continue;
        const q = road.pts[i + 1];
        const dx = q[0] - p[0];
        const dz = q[1] - p[1];
        const L = Math.hypot(dx, dz) || 1;
        const side = crng.sign();
        const off = road.def.width / 2 + 16;
        const x = p[0] - (dz / L) * off * side;
        const z = p[1] + (dx / L) * off * side;
        // A frente (+z local) aponta para a rodovia.
        const rot = Math.atan2((dz / L) * side, -(dx / L) * side);
        if (!placedGas) {
          city.landmarks.push({ kind: 'gas', x, z, rot });
          placedGas = true;
        } else if (!placedElev && (country.props?.elevator || country.props?.silosCoop) && city.size >= 1) {
          const x2 = p[0] - (dz / L) * (off + 30) * -side;
          const z2 = p[1] + (dx / L) * (off + 30) * -side;
          city.landmarks.push({ kind: 'elevator', x: x2, z: z2, rot: Math.atan2(dx, dz) + Math.PI / 2 });
          placedElev = true;
        }
        if (placedGas && placedElev) break;
      }
      if (placedGas && placedElev) break;
    }
    if (country.props?.mobileHomes && city.size >= 2 && crng.chance(0.85)) {
      // Parque de trailers na periferia.
      const a = crng.range(0, Math.PI * 2);
      const cx = city.x + Math.cos(a) * (city.radius + 160);
      const cz = city.z + Math.sin(a) * (city.radius + 160);
      if (!terrain.waterAt(cx, cz)) city.landmarks.push({ kind: 'trailerpark', x: cx, z: cz, rot: crng.range(0, Math.PI) });
    }
  }
  const farms = layoutFarms(country, terrain, roads, cities, rng.fork('farms'));
  return { cities, farms };
}

function layoutFarms(country, terrain, roads, cities, rng) {
  const farms = [];
  const target = Math.round({ us: 120, ca: 105, br: 190, ar: 60, uy: 62, cl: 95 }[country.houseStyle] * (country.farmDensity || 1) * 0.85);
  const cand = roads.roads.filter((r) => r.type !== 'street' && r.type !== 'interstate');
  let tries = 0;
  while (farms.length < target && tries < target * 30) {
    tries++;
    const r = rng.pick(cand);
    const i = rng.int(0, r.pts.length - 2);
    const a = r.pts[i];
    const b = r.pts[i + 1];
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const L = Math.hypot(dx, dz) || 1;
    const side = rng.sign();
    const off = rng.range(70, 190);
    const x = a[0] - (dz / L) * off * side;
    const z = a[1] + (dx / L) * off * side;
    if (Math.abs(x) > WORLD.half - 300 || Math.abs(z) > WORLD.half - 300) continue;
    if (terrain.waterAt(x, z) || terrain.slopeAt(x, z) > 0.18) continue;
    if (cities.some((c) => Math.hypot(c.x - x, c.z - z) < c.radius + 350)) continue;
    const minSep = country.houseStyle === 'br' ? 380 : 650;
    if (farms.some((f) => Math.hypot(f.x - x, f.z - z) < minSep)) continue;
    if (roads.query(x, z, 40)) continue;
    // Entrada da fazenda (estradinha de terra).
    const ax = a[0] - (dz / L) * (r.def.width / 2) * side;
    const az = a[1] + (dx / L) * (r.def.width / 2) * side;
    const drive = smoothPath(
      [
        [ax, az],
        [(ax + x) / 2 + rng.range(-10, 10), (az + z) / 2 + rng.range(-10, 10)],
        [x, z],
      ],
      15,
    );
    roads.add('dirt', drive, '', { driveway: true, local: true });
    // face = rotação que aponta a frente da casa (+z local) para a estrada.
    farms.push({ x, z, face: Math.atan2((dz / L) * side, -(dx / L) * side), r: 45, trees: rng.int(8, 22), seed: rng.int(1, 1e9) });
  }
  return farms;
}

// ------------------------------------------------------------------ Malhas
export function buildSettlementMeshes(country, terrain, settlements, textures, registry, seed) {
  const rng = new RNG(seed + 99);
  const st = styleOf(country);
  const style = country.houseStyle;
  const mats = makeMaterials(textures);
  const rubbleGeo = rubbleGeometry(7);
  const slabGeo = new THREE.BoxGeometry(1, 0.35, 1);
  slabGeo.translate(0, -0.1, 0);
  const root = new THREE.Group();
  root.name = 'settlements';

  // Repertório de modelos do país.
  const pool = {
    houses: Array.from({ length: 10 }, () => makeHouse(houseParams(style, rng))),
    shops: Array.from({ length: 6 }, () => makeHouse(shopParams(style, rng))),
    church: [makeChurch(style, rng), makeChurch(style, rng)],
    school: schoolModel(style),
    gas: gasStation(style, rng),
    mobile: [mobileHome(rng), mobileHome(rng)],
    farm: farmBuildings(style, rng),
    farm2: farmBuildings(style, rng),
    bins: [binModel(4.5, 7), binModel(6, 9), binModel(3.6, 6)],
    silo: siloModel(),
    elevator: elevatorModel(style),
  };
  const wallColor = (latinPaint = true) => rng.pick(st.palette);
  const roofColorFor = (model) => {
    if (model.roofType === 'corrugated') return rng.pick(CORRUGATED);
    if (model.roofType === 'clay') return new THREE.Color(1, 1, 1).multiplyScalar(rng.range(0.82, 1.05));
    if (model.roofType === 'flat') return new THREE.Color(1, 1, 1).multiplyScalar(rng.range(0.7, 1.1));
    return rng.pick(st.roofs);
  };
  const ground = (x, z, w, d, rot) => {
    // Menor altura sob a planta (a fundação aparece no lado de baixo).
    let h = 1e9;
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    for (const [u, v] of [
      [-w / 2, -d / 2],
      [w / 2, -d / 2],
      [w / 2, d / 2],
      [-w / 2, d / 2],
      [0, 0],
    ])
      h = Math.min(h, terrain.heightAt(x + u * c + v * s, z - u * s + v * c));
    return h;
  };
  const place = (set, model, x, z, rot, di, kind, name, color = null) => {
    const y = ground(x, z, model.w, model.d, rot);
    const it = set.add(model, x, y, z, rot, color || wallColor(), roofColorFor(model));
    const s = registry.add({ kind, di, x, z, y, r: Math.max(model.w, model.d) * 0.5, h: model.h, item: it, name });
    it.struct = s;
    return it;
  };

  for (const city of settlements.cities) {
    const set = new BuildingSet(mats, rubbleGeo, slabGeo);
    for (const lot of city.lots) {
      if (lot.kind === 'used') continue;
      const model = lot.kind === 'shop' ? rng.pick(pool.shops) : rng.pick(pool.houses);
      // Gira para a frente encarar a rua.
      place(set, model, lot.x, lot.z, lot.rot, lot.kind === 'shop' ? 'masonry' : 'house', lot.kind, city.name);
    }
    for (const lm of city.landmarks) {
      if (lm.kind === 'church') place(set, rng.pick(pool.church), lm.x, lm.z, lm.rot, 'church', 'church', city.name, style === 'us' || style === 'ca' ? '#ffffff' : rng.pick(['#f2efe6', '#f2e2a8', '#e8eef2']));
      else if (lm.kind === 'school') place(set, pool.school, lm.x, lm.z, lm.rot, 'masonry', 'school', city.name, '#f0e8d8');
      else if (lm.kind === 'gas') place(set, pool.gas, lm.x, lm.z, lm.rot, 'canopy', 'gas', city.name, '#ffffff');
      else if (lm.kind === 'elevator') place(set, pool.elevator, lm.x, lm.z, lm.rot, 'silo', 'elevator', city.name, style === 'ca' ? rng.pick(['#c8402a', '#e2b632', '#d8d0c0']) : '#e0dcd4');
      else if (lm.kind === 'watertower') {
        const wt = makeWaterTower(city.name, style);
        const y = terrain.heightAt(lm.x, lm.z);
        wt.position.set(lm.x, y, lm.z);
        wt.rotation.y = rng.range(0, Math.PI * 2);
        wt.traverse((o) => {
          if (o.material) patchWorld(o.material, { key: 'wt' + o.material.uuid.slice(0, 4) });
        });
        root.add(wt);
        registry.add({ kind: 'watertower', di: 'tower', x: lm.x, z: lm.z, y, r: 8, h: 40, object: wt, name: city.name });
      } else if (lm.kind === 'trailerpark') {
        const c = Math.cos(lm.rot);
        const s = Math.sin(lm.rot);
        for (let i = 0; i < 4; i++)
          for (let j = 0; j < 5; j++) {
            const u = (i - 1.5) * 30;
            const v = (j - 2) * 14;
            place(set, rng.pick(pool.mobile), lm.x + u * c - v * s, lm.z + u * s + v * c, lm.rot, 'mobile', 'mobile', city.name, rng.pick(['#f2f0ea', '#e8e4d8', '#d8e2e8', '#efe8cc']));
          }
      }
    }
    root.add(set.finalize());
    city.set = set;
  }

  // Fazendas.
  const H = WORLD.half;
  const zones = new Map();
  const zoneOf = (x, z) => {
    const k = Math.floor((x + H) / 6000) + ',' + Math.floor((z + H) / 6000);
    let s = zones.get(k);
    if (!s) zones.set(k, (s = new BuildingSet(mats, rubbleGeo, slabGeo)));
    return s;
  };
  for (const farm of settlements.farms) {
    const frng = new RNG(farm.seed);
    const set = zoneOf(farm.x, farm.z);
    // Eixos locais do terreiro: "frente" aponta para a estrada, "direita" ao lado.
    const fx = Math.sin(farm.face);
    const fz = Math.cos(farm.face);
    const rx = Math.cos(farm.face);
    const rz = -Math.sin(farm.face);
    const at = (u, v) => [farm.x + rx * u + fx * v, farm.z + rz * u + fz * v];
    const house = frng.pick(pool.houses);
    const [hx, hz] = at(0, 0);
    // Trailer como casa da fazenda às vezes (EUA).
    const useMobile = country.props?.mobileHomes && frng.chance(0.25);
    place(set, useMobile ? frng.pick(pool.mobile) : house, hx, hz, farm.face, useMobile ? 'mobile' : 'house', useMobile ? 'mobile' : 'farmhouse', 'zona rural');
    const fb = frng.chance(0.5) ? pool.farm : pool.farm2;
    const nb = frng.int(1, Math.min(3, fb.length));
    for (let k = 0; k < nb; k++) {
      const b = fb[k % fb.length];
      const u = frng.range(-30, 30) + (k - 1) * 18;
      const v = -frng.range(28, 55) - (b.model.d || 10) * 0.5;
      const [bx, bz] = at(u, v);
      place(set, b.model, bx, bz, farm.face + (frng.chance(0.5) ? 0 : Math.PI / 2), 'barn', b.kind, 'zona rural', b.kind === 'barn' ? frng.pick(['#a8352a', '#b8402e', '#8c2f26', '#e8e4dc']) : '#ffffff');
    }
    // Silos e silos metálicos.
    if (style !== 'cl' && frng.chance(0.7)) {
      const nbins = frng.int(1, 4);
      const binModelPick = frng.pick(pool.bins);
      for (let k = 0; k < nbins; k++) {
        const [bx, bz] = at(35 + k * (binModelPick.w + 2), -12);
        place(set, binModelPick, bx, bz, 0, 'bin', 'bin', 'zona rural', '#ffffff');
      }
    }
    if ((style === 'us' || style === 'ca') && frng.chance(0.3)) {
      const [sx, sz] = at(-35, -20);
      place(set, pool.silo, sx, sz, 0, 'silo', 'silo', 'zona rural', '#ffffff');
    }
    farm.treeSpecies = style === 'br' && frng.chance(0.4) ? 'eucalyptus' : null;
  }
  for (const set of zones.values()) root.add(set.finalize());
  return root;
}

function makeMaterials(textures) {
  const wall = patchWorld(new THREE.MeshStandardMaterial({ map: textures.facade, roughness: 0.85 }), { paint: true, key: 'facade', wet: 0.5 });
  const roof = {
    shingles: patchWorld(new THREE.MeshStandardMaterial({ map: textures.shingles, roughness: 0.9 }), { key: 'shingles' }),
    clay: patchWorld(new THREE.MeshStandardMaterial({ map: textures.clay, roughness: 0.75 }), { key: 'clay' }),
    corrugated: patchWorld(new THREE.MeshStandardMaterial({ map: textures.corrugated, roughness: 0.45, metalness: 0.45 }), { key: 'corr' }),
    flat: patchWorld(new THREE.MeshStandardMaterial({ map: textures.flat, roughness: 0.95 }), { key: 'flat' }),
  };
  const slab = patchWorld(new THREE.MeshStandardMaterial({ color: '#9c9890', roughness: 0.95 }), { key: 'slab' });
  for (const m of [wall, ...Object.values(roof), slab]) m.side = THREE.FrontSide;
  return { wall, roof, slab };
}

function binModel(r, h) {
  const gb = new GeoBuilder();
  const top = cylinderInto(gb, 0, 0, 0, r, h, 'metalVert', 18, 'metal', r * 0.45);
  return { walls: gb.build(), roof: new GeoBuilder().build(), roofType: 'corrugated', w: r * 2, d: r * 2, h: top, H: h };
}

function siloModel() {
  const gb = new GeoBuilder();
  const top = cylinderInto(gb, 0, 0, 0, 3.2, 20, 'concrete', 16, 'metal', 2.6);
  return { walls: gb.build(), roof: new GeoBuilder().build(), roofType: 'flat', w: 6.4, d: 6.4, h: top, H: 20 };
}

function elevatorModel(style) {
  const gb = new GeoBuilder();
  let top = 0;
  if (style === 'ca') {
    // Elevador de madeira das pradarias ("sentinela das pradarias").
    const m = makeHouse({ w: 10, d: 10, stories: 1, storyH: 22, roof: 'gable', pitch: 0.6, over: 0.3, tiles: { plain: 'barnBoard', win: null, door: 'barnDoor' }, roofType: 'corrugated' });
    boxAtlas(gb, 9, 0, 0, 8, 9, 8, 'barnBoard');
    return { walls: mergeGeos([m.walls, gb.build()]), roof: m.roof, roofType: 'corrugated', w: 18, d: 10, h: m.h, H: 22 };
  }
  // Silos de concreto geminados com casa de máquinas no alto.
  for (let k = 0; k < 4; k++) top = Math.max(top, cylinderInto(gb, (k - 1.5) * 8.4, 0, 0, 4.2, 30, 'concrete', 16, 'concrete', 0.6));
  boxAtlas(gb, 0, 30, 0, 12, 8, 7, 'metal');
  boxAtlas(gb, 20, 0, 0, 7, 12, 7, 'metal');
  return { walls: gb.build(), roof: new GeoBuilder().build(), roofType: 'flat', w: 40, d: 10, h: 38, H: 30 };
}
