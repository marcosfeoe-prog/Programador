// Peças compartilhadas pelos capítulos 2 e 3: materiais da cidade, prédios, salas com
// interior, carros, postes, barricadas, tendas, contêineres, placas, zonas de inimigos
// (aparecem quando o jogador se aproxima e somem quando ele vai embora) e população
// itinerante do mundo aberto.
import * as THREE from 'three';
import { tex, signTex } from '../textures.js';
import { boxGeo } from '../geo.js';
import { rand } from '../util.js';

const Std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.9, ...o });

let CM = null;
// Materiais urbanos (criados uma vez e reaproveitados entre capítulos).
export function cityMats() {
  if (CM) return CM;
  const D = THREE.DoubleSide;
  CM = {
    asphalt: Std({ map: tex('asphalt'), color: 0x9a9a98 }),
    sidewalk: Std({ map: tex('sidewalk'), color: 0xa8a49c }),
    concrete: Std({ map: tex('concrete'), color: 0xa8a49c }),
    concreteDark: Std({ map: tex('concrete'), color: 0x6a6864 }),
    brick: Std({ map: tex('brick'), color: 0xb0a098 }),
    facade: Std({ map: tex('facade'), color: 0xc8c0b0 }),
    facadeBrick: Std({ map: tex('facadeBrick'), color: 0xc0b0a0 }),
    facadeBlue: Std({ map: tex('facadeBlue'), color: 0xb8c0c8 }),
    roofTop: Std({ map: tex('concrete'), color: 0x5a5854 }),
    line: new THREE.MeshStandardMaterial({ color: 0xc8b878, roughness: 0.8 }),
    lineWhite: new THREE.MeshStandardMaterial({ color: 0xb8b8b0, roughness: 0.8 }),
    carRed: Std({ color: 0x6a1e18, roughness: 0.45, metalness: 0.5 }),
    carBlue: Std({ color: 0x22344a, roughness: 0.45, metalness: 0.5 }),
    carWhite: Std({ color: 0x9a9a94, roughness: 0.45, metalness: 0.5 }),
    carGreen: Std({ color: 0x2e3a2a, roughness: 0.5, metalness: 0.4 }),
    carYellow: Std({ color: 0x9a7a1a, roughness: 0.5, metalness: 0.4 }),
    army: Std({ color: 0x3a4230, roughness: 0.7, metalness: 0.2 }),
    tarp: Std({ map: tex('fabric'), color: 0x4a5236, side: D }),
    tarpBlue: Std({ map: tex('fabric'), color: 0x2a3a5a, side: D }),
    tire: Std({ color: 0x141414, roughness: 0.95 }),
    glassCar: Std({ color: 0x0a0c10, roughness: 0.2, metalness: 0.5 }),
    pole: Std({ map: tex('metal'), color: 0x5a5c60, metalness: 0.6, roughness: 0.5 }),
    lampOn: new THREE.MeshBasicMaterial({ color: 0xffb860 }),
    lampOff: Std({ color: 0x2a2a2a }),
    chain: new THREE.MeshStandardMaterial({ color: 0x8a8a8e, metalness: 0.7, roughness: 0.5, transparent: true, opacity: 0.55, side: D, depthWrite: false }),
    sand: Std({ map: tex('fabric'), color: 0x8a7a58 }),
    jersey: Std({ map: tex('concrete'), color: 0xb8b4a8 }),
    stripe: Std({ color: 0xb03a22 }),
    yellow: Std({ color: 0xc8a018, roughness: 0.6 }),
    trash: Std({ color: 0x141618, roughness: 0.5 }),
    tile: Std({ map: tex('sidewalk'), color: 0x7a7470 }),
    darkGlass: Std({ color: 0x06080a, roughness: 0.15, metalness: 0.4 }),
    shutter: Std({ map: tex('metal'), color: 0x6a6a6e, metalness: 0.5, roughness: 0.6 }),
  };
  return CM;
}

// ======================================================================= construção
export function signMesh(w, text, x, y, z, ry, sw = 3, sh = 0.75, opts = {}) {
  const mat = new THREE.MeshStandardMaterial({ map: signTex(text, opts), roughness: 0.8, emissive: opts.glow ? 0xffffff : 0x000000, emissiveMap: opts.glow ? signTex(text, opts) : null, emissiveIntensity: opts.glow ? 0.35 : 0 });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(sw, sh), mat);
  m.position.set(x, y, z);
  m.rotation.y = ry;
  m.receiveShadow = true;
  w.root.add(m);
  // placa com fundo para não ficar transparente por trás
  w.box(x - Math.sin(ry) * 0.04, y, z - Math.cos(ry) * 0.04, sw + 0.1, sh + 0.1, 0.06, w.M.beam, { ry, cast: false });
  return m;
}

// Prédio maciço com fachada. Altura em múltiplos de 3 m (andares).
export function building(w, x, z, bw, bd, floors, mat, o = {}) {
  const C = cityMats();
  const h = floors * 3;
  const ry = o.ry || 0;
  w.box(x, h / 2, z, bw, h, bd, mat, { ry, col: true, tile: 6 });
  // laje e platibanda
  w.box(x, h + 0.25, z, bw + 0.3, 0.5, bd + 0.3, C.roofTop, { ry, tile: 3 });
  // base escura (calçada encostada)
  w.box(x, 0.35, z, bw + 0.08, 0.7, bd + 0.08, C.concreteDark, { ry, tile: 2, cast: false });
  if (o.tank) w.cyl(x + bw * 0.2, h + 1.5, z + bd * 0.15, 1.2, 1.2, 2, C.concreteDark, { seg: 10 });
  if (o.antenna) w.box(x - bw * 0.25, h + 2.5, z - bd * 0.2, 0.1, 5, 0.1, C.pole);
}

// Fachada térrea (vitrine, porta, toldo) colada em uma face de um prédio.
// face: 'e' (+X), 'w' (-X), 'n' (+Z), 's' (-Z). u: deslocamento ao longo da face.
export function storefront(w, x, z, face, u, width = 6, o = {}) {
  const C = cityMats();
  const M = w.M;
  const nx = face === 'e' ? 1 : face === 'w' ? -1 : 0,
    nz = face === 'n' ? 1 : face === 's' ? -1 : 0;
  const ry = face === 'e' ? Math.PI / 2 : face === 'w' ? -Math.PI / 2 : face === 'n' ? 0 : Math.PI;
  const tx = -nz,
    tz = nx; // tangente
  const cx = x + tx * u + nx * 0.06,
    cz = z + tz * u + nz * 0.06;
  w.box(cx, 1.4, cz, width, 2.6, 0.12, o.closed ? C.shutter : C.darkGlass, { ry, cast: false, tile: 2 });
  w.box(cx, 2.85, cz, width + 0.4, 0.3, 0.2, M.beam, { ry });
  if (o.awning !== false) w.box(cx + nx * 0.7, 3.1, cz + nz * 0.7, width + 0.2, 0.08, 1.5, o.awningMat || C.tarp, { ry, rx: 0.18 });
  if (o.sign) signMesh(w, o.sign, cx + nx * 0.08, 3.55, cz + nz * 0.08, ry, Math.min(width, 5), 0.7, o.signOpts || {});
}

// Sala com interior (paredes com uma porta, piso, teto). Registra como ambiente interno.
// door: { side: 'e'|'w'|'n'|'s', at: deslocamento ao longo da parede, width }
export function room(w, o) {
  const C = cityMats();
  const { x, z } = o;
  const rw = o.w,
    rd = o.d,
    h = o.h ?? 3.6,
    t = 0.3;
  const wall = o.wall || C.concrete;
  const doors = o.doors || [o.door];
  const segX = (zz, side) => {
    // parede ao longo de X (norte/sul)
    const ds = doors.filter((d) => d && d.side === side);
    let cuts = ds.map((d) => [d.at - d.width / 2, d.at + d.width / 2]).sort((a, b) => a[0] - b[0]);
    let cur = -rw / 2;
    for (const [a, b] of cuts) {
      if (a > cur + 0.05) w.box(x + (cur + a) / 2, h / 2, zz, a - cur, h, t, wall, { col: true, tile: 3 });
      w.box(x + (a + b) / 2, h - (h - 2.5) / 2, zz, b - a, h - 2.5, t, wall, { tile: 3 });
      cur = b;
    }
    if (rw / 2 > cur + 0.05) w.box(x + (cur + rw / 2) / 2, h / 2, zz, rw / 2 - cur, h, t, wall, { col: true, tile: 3 });
  };
  const segZ = (xx, side) => {
    const ds = doors.filter((d) => d && d.side === side);
    let cuts = ds.map((d) => [d.at - d.width / 2, d.at + d.width / 2]).sort((a, b) => a[0] - b[0]);
    let cur = -rd / 2;
    for (const [a, b] of cuts) {
      if (a > cur + 0.05) w.box(xx, h / 2, z + (cur + a) / 2, t, h, a - cur, wall, { col: true, tile: 3 });
      w.box(xx, h - (h - 2.5) / 2, z + (a + b) / 2, t, h - 2.5, b - a, wall, { tile: 3 });
      cur = b;
    }
    if (rd / 2 > cur + 0.05) w.box(xx, h / 2, z + (cur + rd / 2) / 2, t, h, rd / 2 - cur, wall, { col: true, tile: 3 });
  };
  segX(z + rd / 2, 'n');
  segX(z - rd / 2, 's');
  segZ(x + rw / 2, 'e');
  segZ(x - rw / 2, 'w');
  w.box(x, 0.02, z, rw - t, 0.04, rd - t, o.floor || C.tile, { cast: false, tile: 2 });
  if (o.roof !== false) {
    w.box(x, h + 0.15, z, rw + 0.3, 0.3, rd + 0.3, C.roofTop, { tile: 3 });
    // lâmpadas fluorescentes apagadas
    for (let k = -rw / 2 + 2; k < rw / 2 - 1; k += 4) w.box(x + k, h - 0.08, z, 0.2, 0.06, Math.min(3, rd - 2), C.lampOff, { cast: false });
  }
  w.indoors.push({ x, z, hw: rw / 2, hd: rd / 2, c: 1, s: 0 });
}

// Paredes internas simples (divisórias com colisão).
export function wallSeg(w, x0, z0, x1, z1, h = 3.4, mat = null, th = 0.2) {
  const C = cityMats();
  const dx = x1 - x0,
    dz = z1 - z0;
  const L = Math.hypot(dx, dz);
  w.box((x0 + x1) / 2, h / 2, (z0 + z1) / 2, th, h, L, mat || C.concrete, { ry: Math.atan2(dx, dz), col: true, tile: 3 });
}

export function car(w, x, z, ry = 0, mat = null, o = {}) {
  const C = cityMats();
  const m = mat || [C.carRed, C.carBlue, C.carWhite, C.carGreen, C.carYellow][Math.floor(w.rng.next() * 5)];
  const c = Math.cos(ry),
    s = Math.sin(ry);
  const P = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
  const burnt = o.burnt;
  const body = burnt ? w.M.rust : m;
  w.box(x, 0.62, z, 1.8, 0.7, 4.3, body, { ry, col: true, cm: 'metal', y0: 0, y1: 1.45, st: false });
  const [cx, cz] = P(0, -0.25);
  w.box(cx, 1.22, cz, 1.62, 0.55, 2.2, burnt ? w.M.dark : C.glassCar, { ry });
  const [rx, rz] = P(0, -0.25);
  w.box(rx, 1.52, rz, 1.5, 0.06, 1.9, body, { ry });
  for (const [a, b] of [
    [-0.82, 1.35],
    [0.82, 1.35],
    [-0.82, -1.35],
    [0.82, -1.35],
  ]) {
    const [tx, tz] = P(a, b);
    w.cyl(tx, 0.34, tz, 0.34, 0.34, 0.24, C.tire, { rz: Math.PI / 2, ry, seg: 10 });
  }
  if (o.lightsOn) {
    const [fx, fz] = P(0, 2.16);
    w.box(fx, 0.72, fz, 1.4, 0.12, 0.05, C.lampOn, { ry, cast: false });
  }
}

export function bus(w, x, z, ry = 0, mat = null) {
  const C = cityMats();
  const m = mat || C.carYellow;
  const c = Math.cos(ry),
    s = Math.sin(ry);
  const P = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
  w.box(x, 1.65, z, 2.5, 2.7, 10.5, m, { ry, col: true, cm: 'metal', tile: 2 });
  for (const sx of [-1, 1]) {
    const [gx, gz] = P(sx * 1.26, 0.4);
    w.box(gx, 2.1, gz, 0.04, 0.9, 8.6, C.glassCar, { ry, cast: false });
  }
  for (const [a, b] of [
    [-1.05, 3.4],
    [1.05, 3.4],
    [-1.05, -3.4],
    [1.05, -3.4],
  ]) {
    const [tx, tz] = P(a, b);
    w.cyl(tx, 0.48, tz, 0.48, 0.48, 0.32, C.tire, { rz: Math.PI / 2, ry, seg: 10 });
  }
}

export function truck(w, x, z, ry = 0) {
  const C = cityMats();
  const c = Math.cos(ry),
    s = Math.sin(ry);
  const P = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
  const [kx, kz] = P(0, 2.6);
  w.box(kx, 1.4, kz, 2.3, 2.0, 2.0, C.army, { ry, col: true, cm: 'metal' });
  const [gx, gz] = P(0, 3.62);
  w.box(gx, 1.75, gz, 2.0, 0.7, 0.05, C.glassCar, { ry, cast: false });
  const [bx, bz] = P(0, -1.1);
  w.box(bx, 1.1, bz, 2.4, 0.3, 5.2, C.army, { ry, col: true, cm: 'metal', y0: 0, y1: 2.8 });
  w.box(bx, 2.15, bz, 2.4, 1.9, 5.2, C.tarp, { ry, tile: 2 });
  for (const lz of [2.6, -0.4, -2.4]) {
    for (const sx of [-1, 1]) {
      const [tx, tz] = P(sx * 1.05, lz);
      w.cyl(tx, 0.5, tz, 0.5, 0.5, 0.36, C.tire, { rz: Math.PI / 2, ry, seg: 10 });
    }
  }
}

export function lampPost(w, x, z, ry = 0, lit = false, color = 0xffa850) {
  const C = cityMats();
  w.cyl(x, 3.0, z, 0.08, 0.12, 6, C.pole, { col: true, cr: 0.15, seg: 8 });
  const ax = x + Math.sin(ry) * 0.9,
    az = z + Math.cos(ry) * 0.9;
  w.box((x + ax) / 2, 5.95, (z + az) / 2, 0.08, 0.08, 1.9, C.pole, { ry });
  w.box(ax, 5.85, az, 0.5, 0.14, 0.28, lit ? C.lampOn : C.lampOff, { ry, cast: false });
  if (lit) {
    w.light(ax, 5.4, az, color, 26, 16, 0.05);
    const g = new THREE.Sprite(w.glowMat);
    g.position.set(ax, 5.7, az);
    g.scale.setScalar(2.4);
    w.root.add(g);
  }
}

export function jersey(w, x, z, ry = 0, len = 3) {
  const C = cityMats();
  w.box(x, 0.45, z, 0.6, 0.9, len, C.jersey, { ry, col: true, tile: 1.5 });
  w.box(x, 0.12, z, 0.75, 0.24, len, C.jersey, { ry, tile: 1.5 });
}

export function sandbags(w, x, z, ry = 0, len = 3, rows = 3) {
  const C = cityMats();
  for (let r = 0; r < rows; r++) {
    const n = Math.max(1, Math.round(len / 0.6));
    for (let i = 0; i < n; i++) {
      const off = -len / 2 + (i + (r % 2 ? 0.5 : 0.25)) * (len / n);
      w.box(x + Math.sin(ry) * off, 0.14 + r * 0.24, z + Math.cos(ry) * off, 0.5, 0.26, len / n - 0.04, C.sand, { ry, tile: 0.6 });
    }
  }
  w.col.addBox(x, z, 0.55, len, ry, { y0: 0, y1: rows * 0.24 + 0.05, mat: 'stone' });
}

export function tent(w, x, z, ry = 0, mat = null) {
  const C = cityMats();
  const m = mat || C.tarp;
  const c = Math.cos(ry),
    s = Math.sin(ry);
  for (const sx of [-1, 1]) w.box(x + sx * 0.8 * c, 1.0, z - sx * 0.8 * s, 2.56, 0.05, 4.2, m, { ry, rz: -sx * 0.896, tile: 2 });
  w.box(x, 2.0, z, 0.08, 0.08, 4.4, C.pole, { ry });
  w.col.addBox(x, z, 3.0, 4.0, ry, { y0: 0, y1: 2.0, mat: 'wood', shootThrough: true });
}

// Barraca militar maior (posto de evacuação).
export function bigTent(w, x, z, ry = 0) {
  const C = cityMats();
  w.box(x, 1.25, z, 5, 2.5, 7, C.tarp, { ry, col: true, cm: 'wood', tile: 2 });
  w.box(x, 2.9, z, 5.4, 0.8, 7.2, C.tarp, { ry, rx: 0, tile: 2 });
  w.box(x, 3.4, z, 0.2, 0.2, 7.4, C.pole, { ry });
}

export function container(w, x, z, ry = 0, color = 0x5a2a20, h = 2.6) {
  const m = containerMat(color);
  w.box(x, h / 2, z, 2.45, h, 6.1, m, { ry, col: true, cm: 'metal', tile: 1.2 });
}
const contMats = new Map();
function containerMat(color) {
  let m = contMats.get(color);
  if (!m) {
    m = Std({ map: tex('rust'), color, metalness: 0.4, roughness: 0.7 });
    contMats.set(color, m);
  }
  return m;
}

// Alambrado com postes (transparente, bloqueia passagem mas não a visão).
export function chainFence(w, x0, z0, x1, z1, h = 2.4) {
  const C = cityMats();
  const dx = x1 - x0,
    dz = z1 - z0;
  const L = Math.hypot(dx, dz);
  const ry = Math.atan2(dx, dz);
  w.box((x0 + x1) / 2, h / 2, (z0 + z1) / 2, 0.03, h, L, C.chain, { ry, cast: false, tile: 1 });
  const n = Math.max(1, Math.round(L / 3));
  for (let i = 0; i <= n; i++) {
    const k = i / n;
    w.cyl(x0 + dx * k, h / 2, z0 + dz * k, 0.04, 0.04, h, C.pole, { seg: 6 });
  }
  w.col.addBox((x0 + x1) / 2, (z0 + z1) / 2, 0.15, L, ry, { y0: 0, y1: h, mat: 'metal', shootThrough: true });
}

export function trashBags(w, x, z, n = 3) {
  const C = cityMats();
  for (let i = 0; i < n; i++) {
    const s = rand(0.35, 0.5);
    w.geo(new THREE.SphereGeometry(s, 7, 5), C.trash, x + rand(-0.6, 0.6), s * 0.7, z + rand(-0.6, 0.6), rand(0, 3), 0, 0, { sy: 0.75 });
  }
}

export function dumpster(w, x, z, ry = 0) {
  const C = cityMats();
  w.box(x, 0.65, z, 1.9, 1.3, 1.2, C.carGreen, { ry, col: true, cm: 'metal' });
  w.box(x, 1.36, z, 1.95, 0.08, 1.25, C.trash, { ry, rx: -0.15 });
}

// Pilha de destroços (escombros de concreto) que bloqueia uma rua.
export function rubble(w, x, z, r = 3) {
  const C = cityMats();
  for (let i = 0; i < 9; i++) {
    const s = rand(0.5, 1.3);
    w.box(x + rand(-r, r) * 0.6, s * 0.4, z + rand(-r, r) * 0.6, s * 1.6, s * 0.9, s * 1.2, i % 3 ? C.concrete : C.concreteDark, { ry: rand(0, 3), rx: rand(-0.3, 0.3), tile: 2 });
  }
  w.col.addCircle(x, z, r * 0.85, { y0: 0, y1: 1.6, mat: 'stone' });
}

export function burningCar(w, x, z, ry = 0) {
  car(w, x, z, ry, null, { burnt: true });
  w.fires.push({ x, y: 1.2, z, size: 1.3, rate: 22, acc: 0, embers: true });
  w.light(x, 2.2, z, 0xff7a2a, 40, 14, 0.3, 5);
}

export function barrelFire(w, x, z) {
  const C = cityMats();
  w.cyl(x, 0.45, z, 0.32, 0.3, 0.9, w.M.rust, { col: true, seg: 10, cm: 'metal' });
  w.fires.push({ x, y: 0.95, z, size: 0.8, rate: 14, acc: 0, embers: true });
  w.light(x, 1.5, z, 0xff8a3a, 22, 11, 0.3, 8);
  void C;
}

// ======================================================================= zonas de inimigos
// zone: { id, x, z, r, list: [defs], when?(L), keep? } — aparece quando o jogador chega
// a r metros; fica "limpa" (salva) quando todos morrem; some se o jogador se afastar sem
// lutar (mapas grandes).
export function updateZones(L, zones, dt) {
  const G = L.G,
    P = G.player;
  const st = L.c.zones || (L.c.zones = {});
  L.c.zoneT = (L.c.zoneT || 0) - dt;
  if (L.c.zoneT > 0) return;
  L.c.zoneT = 0.3;
  for (const z of zones) {
    if (L.flags['clear_' + z.id]) continue;
    if (z.when && !z.when(L)) continue;
    const s = st[z.id];
    const d = Math.hypot(P.pos.x - z.x, P.pos.z - z.z);
    if (!s) {
      if (d < z.r) {
        const list = [];
        for (const def of z.list) list.push(G.enemies.spawn(def.k || 'v', def.x, def.z, def));
        st[z.id] = { list };
        G.enemies.flowT = 0;
      }
      continue;
    }
    if (s.list.every((e) => !e.alive)) {
      L.flags['clear_' + z.id] = true;
      if (z.onClear) z.onClear(L);
      continue;
    }
    // longe e ninguém lutando: guarda para depois
    if (!z.keep && d > z.r + 70 && !s.list.some((e) => e.alive && e.alert)) {
      for (const e of s.list) if (e.alive) e.remove();
      delete st[z.id];
    }
  }
}

export function resetZones(L) {
  L.c.zones = {};
  L.c.zoneT = 0;
}

// População itinerante do mundo aberto: mantém alguns infectados ao redor do jogador.
export function updateRoamers(L, cfg, dt) {
  const G = L.G,
    P = G.player;
  const r = L.c.roam || (L.c.roam = { list: [], t: 2 });
  r.t -= dt;
  if (r.t > 0) return;
  r.t = 1.2;
  r.list = r.list.filter((e) => !e.removed);
  for (const e of r.list) {
    const d = Math.hypot(e.pos.x - P.pos.x, e.pos.z - P.pos.z);
    if (d > 95 && !(e.alive && e.alert)) e.remove();
  }
  const alive = r.list.filter((e) => e.alive).length;
  if (alive >= cfg.max || G.enemies.aliveCount() > cfg.cap) return;
  if (cfg.allow && !cfg.allow(L)) return;
  for (let tries = 0; tries < 6; tries++) {
    const a = rand(0, Math.PI * 2),
      dist = rand(42, 70);
    const x = P.pos.x + Math.cos(a) * dist,
      z = P.pos.z + Math.sin(a) * dist;
    if (G.nav.isBlocked(x, z)) continue;
    if (cfg.avoid && cfg.avoid(x, z)) continue;
    const kind = cfg.pick(x, z);
    if (!kind) continue;
    const n = kind === 'dog' ? 2 + Math.floor(Math.random() * 2) : 1;
    for (let i = 0; i < n; i++) {
      const e = G.enemies.spawn(kind, x + rand(-1.5, 1.5), z + rand(-1.5, 1.5), { idle: kind === 'dragger' ? 'dormant' : 'wander', yaw: rand(0, 6.28) });
      r.list.push(e);
    }
    break;
  }
}

export function resetRoamers(L) {
  L.c.roam = { list: [], t: 3 };
}

// Remove inimigos comuns perto de um ponto (antes de uma cena).
export function clearAround(G, x, z, r) {
  for (const e of G.enemies.list) {
    if (e.isBoss || !e.alive) continue;
    if (Math.hypot(e.pos.x - x, e.pos.z - z) < r) e.remove();
  }
}

export function groundBox(w, x, z, bw, bd, mat, tile = 4, y = 0.004) {
  w.B.add(boxGeo(bw, 0.008, bd, tile), mat, new THREE.Matrix4().makeTranslation(x, y, z), { cast: false, receive: true, chunk: w.chunk(x, z) });
}
