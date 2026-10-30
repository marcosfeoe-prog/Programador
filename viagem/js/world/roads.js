// Malhas das estradas: pista com faixas pintadas, acostamento, pontes com pilares,
// guard-rails, balizadores e placas (entrada de cidade, fronteira e distâncias).
import * as THREE from 'three';
import { CITIES, COUNTRIES } from './data.js';
import { asphaltTex, gravelTex, textTex } from './textures.js';
import { merge, paint, xf, box, cyl } from '../geom.js';
import { drawFlag } from '../ui/flags.js';
import { fmtKm } from '../util.js';

const PIECE = 60; // pontos por pedaço (300 m)

export class Roads {
  constructor(scene, gen, Q) {
    this.scene = scene;
    this.gen = gen;
    this.Q = Q;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.pieces = [];
    this.mats = {};
    this.segHash = new Map(); // muros/guard-rails para colisão
    const asph = (c, w) => {
      const m = new THREE.MeshStandardMaterial({ map: asphaltTex(c, w), roughness: 0.88, metalness: 0 });
      m.polygonOffset = true;
      m.polygonOffsetFactor = -1;
      m.polygonOffsetUnits = -2;
      return m;
    };
    this.mats.asph = { white: asph('white', false), yellow: asph('yellow', false), whiteW: asph('white', true), yellowW: asph('yellow', true) };
    this.mats.gravel = new THREE.MeshStandardMaterial({ map: gravelTex(), roughness: 1 });
    this.mats.gravel.polygonOffset = true;
    this.mats.gravel.polygonOffsetFactor = -1;
    this.mats.struct = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.1, side: THREE.DoubleSide });
    this.mats.rail = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.75, side: THREE.DoubleSide });
    this.wet = 0;
  }

  build(roads) {
    this.roads = roads;
    for (const r of roads) {
      const n = r.hs.length;
      // país de cada ponto (para cor das faixas e placas de fronteira)
      r.country = new Uint8Array(n);
      for (let k = 0; k < n; k++) r.country[k] = k % 4 === 0 ? this.gen.countryAt(r.pts[k * 2], r.pts[k * 2 + 1]) : r.country[k - (k % 4)];
      for (let s = 0; s < n - 1; s += PIECE) this.buildPiece(r, s, Math.min(n - 1, s + PIECE));
      this.buildSigns(r);
    }
  }

  frame(r, k) {
    const p = r.pts;
    const n = r.hs.length;
    const a = Math.max(0, k - 1);
    const b = Math.min(n - 1, k + 1);
    let tx = p[b * 2] - p[a * 2];
    let tz = p[b * 2 + 1] - p[a * 2 + 1];
    const l = Math.hypot(tx, tz) || 1;
    tx /= l;
    tz /= l;
    return { x: p[k * 2], z: p[k * 2 + 1], y: r.hs[k], tx, tz, rx: -tz, rz: tx };
  }

  buildPiece(r, k0, k1) {
    const hw = r.hw;
    const wide = r.kind === 'rod';
    const cIdx = r.country[Math.floor((k0 + k1) / 2)];
    const lc = COUNTRIES[cIdx].lineColor;
    const amat = this.mats.asph[lc + (wide ? 'W' : '')];
    // centro do pedaço (para coordenadas locais e culling)
    const f0 = this.frame(r, Math.floor((k0 + k1) / 2));
    const ox = f0.x;
    const oz = f0.z;
    const oy = f0.y;
    const cityA = CITIES[r.a];
    const cityB = CITIES[r.b];
    const plazaSkip = (k) => {
      // não desenha a pista dentro da praça central (a praça cobre)
      const x = r.pts[k * 2];
      const z = r.pts[k * 2 + 1];
      return Math.hypot(x - cityA.x, z - cityA.z) < 20 || Math.hypot(x - cityB.x, z - cityB.z) < 20;
    };

    // ---- pista
    const prof = [
      [-1, 0, 0],
      [-0.5, 0.03, 0.25],
      [0, 0.05, 0.5],
      [0.5, 0.03, 0.75],
      [1, 0, 1],
    ];
    const P = [];
    const UV = [];
    const I = [];
    let rows = 0;
    for (let k = k0; k <= k1; k++) {
      const f = this.frame(r, k);
      for (const [o, dy, u] of prof) {
        P.push(f.x + f.rx * o * hw - ox, f.y + 0.02 + dy - oy, f.z + f.rz * o * hw - oz);
        UV.push(u, r.cum[k] / 12);
      }
      if (k > k0 && !(plazaSkip(k) && plazaSkip(k - 1))) {
        const a = (rows - 1) * 5;
        const b = rows * 5;
        for (let q = 0; q < 4; q++) I.push(a + q, a + q + 1, b + q, a + q + 1, b + q + 1, b + q);
      }
      rows++;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
    g.setIndex(I);
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, amat);
    mesh.position.set(ox, oy, oz);
    mesh.receiveShadow = true;
    this.group.add(mesh);
    const meshes = [mesh];

    // ---- acostamento de cascalho (fora das pontes)
    const SP = [];
    const SUV = [];
    const SI = [];
    let sr = 0;
    for (let k = k0; k <= k1; k++) {
      const f = this.frame(r, k);
      for (const side of [-1, 1]) {
        SP.push(f.x + f.rx * side * hw - ox, f.y + 0.015 - oy, f.z + f.rz * side * hw - oz);
        SP.push(f.x + f.rx * side * (hw + 1.6) - ox, f.y - 0.09 - oy, f.z + f.rz * side * (hw + 1.6) - oz);
        SUV.push(0, r.cum[k] / 4, 0.4, r.cum[k] / 4);
      }
      if (k > k0 && !r.br[k] && !r.br[k - 1] && !(plazaSkip(k) && plazaSkip(k - 1))) {
        const a = (sr - 1) * 4;
        const b = sr * 4;
        // lado esquerdo (side -1): vértices a, a+1 ; direito: a+2, a+3
        SI.push(a + 1, a, b + 1, a, b, b + 1);
        SI.push(a + 2, a + 3, b + 2, a + 3, b + 3, b + 2);
      }
      sr++;
    }
    if (SI.length) {
      const sg = new THREE.BufferGeometry();
      sg.setAttribute('position', new THREE.Float32BufferAttribute(SP, 3));
      sg.setAttribute('uv', new THREE.Float32BufferAttribute(SUV, 2));
      sg.setIndex(SI);
      sg.computeVertexNormals();
      const sm = new THREE.Mesh(sg, this.mats.gravel);
      sm.position.set(ox, oy, oz);
      sm.receiveShadow = true;
      this.group.add(sm);
      meshes.push(sm);
    }

    // ---- estruturas: pontes, guard-rails, balizadores
    const parts = [];
    const rails = [];
    const concrete = new THREE.Color(0.55, 0.54, 0.52);
    const white = new THREE.Color(0.92, 0.92, 0.9);
    const steel = new THREE.Color(0.7, 0.72, 0.74);
    const addSeg = (x0, z0, x1, z1) => {
      const cs = 32;
      const minx = Math.floor(Math.min(x0, x1) / cs);
      const maxx = Math.floor(Math.max(x0, x1) / cs);
      const minz = Math.floor(Math.min(z0, z1) / cs);
      const maxz = Math.floor(Math.max(z0, z1) / cs);
      for (let i = minx; i <= maxx; i++)
        for (let j = minz; j <= maxz; j++) {
          const key = i * 100000 + j;
          let l = this.segHash.get(key);
          if (!l) this.segHash.set(key, (l = []));
          l.push([x0, z0, x1, z1]);
        }
    };
    // ponte: laterais e mureta contínuas, pilares a cada ~30 m
    const quad = (arr, a, b, c, d, color) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...c, ...d], 3));
      geo.setIndex([0, 2, 1, 1, 2, 3]);
      geo.computeVertexNormals();
      paint(geo, color);
      arr.push(geo);
    };
    for (let k = k0 + 1; k <= k1; k++) {
      const fa = this.frame(r, k - 1);
      const fb = this.frame(r, k);
      if (r.br[k] && r.br[k - 1]) {
        for (const side of [-1, 1]) {
          const ow = hw + 0.45;
          const A = (f, o, y) => [f.x + f.rx * side * o - ox, f.y + y - oy, f.z + f.rz * side * o - oz];
          // face externa da laje
          quad(parts, A(fa, ow, 0.95), A(fb, ow, 0.95), A(fa, ow, -1.3), A(fb, ow, -1.3), concrete);
          // topo da mureta
          quad(parts, A(fa, hw, 0.95), A(fb, hw, 0.95), A(fa, ow, 0.95), A(fb, ow, 0.95), concrete);
          // face interna da mureta
          quad(parts, A(fa, hw, 0), A(fb, hw, 0), A(fa, hw, 0.95), A(fb, hw, 0.95), concrete);
          if (side === 1) {
            // fundo da laje
            const B = (f, o) => [f.x + f.rx * o - ox, f.y - 1.3 - oy, f.z + f.rz * o - oz];
            quad(parts, B(fa, ow), B(fb, ow), B(fa, -ow), B(fb, -ow), concrete.clone().multiplyScalar(0.7));
          }
          addSeg(fa.x + fa.rx * side * hw, fa.z + fa.rz * side * hw, fb.x + fb.rx * side * hw, fb.z + fb.rz * side * hw);
        }
        if (k % 6 === 0) {
          const hgt = fb.y - 1.3 - (r.hn[k] - 3);
          if (hgt > 1) {
            for (const o of hgt > 12 ? [-hw * 0.55, hw * 0.55] : [0]) {
              const pg = box(1.4, hgt, 1.4);
              xf(pg, fb.x + fb.rx * o - ox, fb.y - 1.3 - hgt / 2 - oy, fb.z + fb.rz * o - oz, 0, Math.atan2(fb.tx, fb.tz));
              paint(pg, concrete);
              parts.push(pg);
            }
          }
        }
      } else if (k % 2 === 0) {
        // guard-rail onde a encosta despenca
        for (const side of [-1, 1]) {
          const tx = fb.x + fb.rx * side * (hw + 4);
          const tz = fb.z + fb.rz * side * (hw + 4);
          const drop = fb.y - this.gen.height(tx, tz);
          const k2 = k - 2;
          if (drop > 2.6 && k2 >= k0) {
            const fa2 = this.frame(r, k2);
            const o = hw + 1.1;
            const A = (f, y) => [f.x + f.rx * side * o - ox, f.y + y - oy, f.z + f.rz * side * o - oz];
            quad(rails, A(fa2, 0.42), A(fb, 0.42), A(fa2, 0.78), A(fb, 0.78), steel);
            const pg = box(0.1, 0.8, 0.1);
            xf(pg, fb.x + fb.rx * side * (o + 0.08) - ox, fb.y + 0.38 - oy, fb.z + fb.rz * side * (o + 0.08) - oz);
            paint(pg, steel.clone().multiplyScalar(0.7));
            parts.push(pg);
            addSeg(fa2.x + fa2.rx * side * o, fa2.z + fa2.rz * side * o, fb.x + fb.rx * side * o, fb.z + fb.rz * side * o);
          }
        }
      }
      // balizadores a cada 50 m
      if (k % 10 === 0 && !r.br[k] && !plazaSkip(k)) {
        for (const side of [-1, 1]) {
          const o = hw + 1.35;
          const pg = box(0.1, 1.0, 0.1);
          xf(pg, fb.x + fb.rx * side * o - ox, fb.y + 0.45 - oy, fb.z + fb.rz * side * o - oz, 0, Math.atan2(fb.tx, fb.tz));
          paint(pg, white);
          parts.push(pg);
          const rg = box(0.11, 0.12, 0.11);
          xf(rg, fb.x + fb.rx * side * o - ox, fb.y + 0.82 - oy, fb.z + fb.rz * side * o - oz, 0, Math.atan2(fb.tx, fb.tz));
          paint(rg, side > 0 ? new THREE.Color(0.9, 0.35, 0.05) : new THREE.Color(0.9, 0.9, 0.95));
          parts.push(rg);
        }
      }
    }
    if (parts.length) {
      const m = new THREE.Mesh(merge(parts), this.mats.struct);
      m.position.set(ox, oy, oz);
      m.castShadow = true;
      m.receiveShadow = true;
      this.group.add(m);
      meshes.push(m);
    }
    if (rails.length) {
      const m = new THREE.Mesh(merge(rails), this.mats.rail);
      m.position.set(ox, oy, oz);
      m.castShadow = true;
      this.group.add(m);
      meshes.push(m);
    }
    for (const m of meshes) {
      m.matrixAutoUpdate = false;
      m.updateMatrix();
    }
    this.pieces.push({ x: ox, z: oz, meshes, vis: true });
  }

  // ---- placas
  sign(lines, x, y, z, yaw, opt = {}) {
    const w = opt.w || 3.2;
    const h = opt.h || 1.6;
    const tex = textTex(lines, {
      w: 512,
      h: Math.round((512 * h) / w),
      bg: opt.bg || '#1d5f3a',
      fg: opt.fg || '#ffffff',
      border: opt.border === undefined ? '#ffffff' : opt.border,
      font: opt.font || 'bold 70px "Trebuchet MS", sans-serif',
      sub: opt.sub || 'bold 46px "Trebuchet MS", sans-serif',
      flag: opt.flag ? (ctx, fx, fy, fw, fh) => drawFlag(ctx, opt.flag, fx, fy, fw, fh) : null,
    });
    const g = new THREE.Group();
    const board = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, metalness: 0.1 }));
    const back = new THREE.Mesh(new THREE.PlaneGeometry(w, h), this.mats.backSign || (this.mats.backSign = new THREE.MeshStandardMaterial({ color: 0x8a8d90, roughness: 0.6, metalness: 0.5 })));
    back.rotation.y = Math.PI;
    const ph = opt.post || 2.2;
    board.position.y = ph + h / 2;
    back.position.y = ph + h / 2;
    back.position.z = -0.01;
    g.add(board, back);
    const pm = this.mats.post || (this.mats.post = new THREE.MeshStandardMaterial({ color: 0x9a9da2, roughness: 0.4, metalness: 0.8 }));
    for (const px of [-w * 0.35, w * 0.35]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, ph + h, 8), pm);
      p.position.set(px, (ph + h) / 2, -0.04);
      p.castShadow = true;
      g.add(p);
    }
    g.position.set(x, y, z);
    g.rotation.y = yaw;
    this.group.add(g);
    this.signs = this.signs || [];
    this.signs.push(g);
    return g;
  }

  buildSigns(r) {
    const n = r.hs.length;
    const A = CITIES[r.a];
    const B = CITIES[r.b];
    // placa do lado direito de quem anda na direção dir, voltada para o motorista
    const place = (k, dir, lines, opt) => {
      const f = this.frame(r, k);
      const side = dir;
      const o = r.hw + 3.2;
      const x = f.x + f.rx * side * o;
      const z = f.z + f.rz * side * o;
      const y = this.gen.height(x, z);
      const yaw = Math.atan2(-f.tx * dir, -f.tz * dir);
      this.sign(lines, x, Math.min(y, f.y), z, yaw, opt);
    };
    const kAt = (dist) => {
      let k = 0;
      while (k < n - 1 && r.cum[k] < dist) k++;
      return k;
    };
    // entrada das cidades
    const ka = kAt(A.r + 35);
    const kb = kAt(r.len - B.r - 35);
    place(ka, -1, [A.name], { bg: '#f4f4f0', fg: '#1a1a1a', border: '#c22', w: 3.4, h: 1.1, post: 1.6 });
    place(kb, 1, [B.name], { bg: '#f4f4f0', fg: '#1a1a1a', border: '#c22', w: 3.4, h: 1.1, post: 1.6 });
    // distâncias logo na saída
    const ka2 = kAt(A.r + 140);
    const kb2 = kAt(r.len - B.r - 140);
    place(ka2, 1, [`${B.name}  ${fmtKm(r.len - r.cum[ka2])}`, r.name], { w: 4.2, h: 1.5 });
    place(kb2, -1, [`${A.name}  ${fmtKm(r.cum[kb2])}`, r.name], { w: 4.2, h: 1.5 });
    // fronteiras
    for (let k = 4; k < n; k += 4) {
      const c0 = r.country[k - 4];
      const c1 = r.country[k];
      if (c0 === c1) continue;
      // confirma que a mudança é estável (evita placas duplicadas na zona de mistura)
      let stable = true;
      for (let q = k; q < Math.min(n, k + 40); q += 4) if (r.country[q] !== c1) stable = false;
      if (!stable) continue;
      const C1 = COUNTRIES[c1];
      const C0 = COUNTRIES[c0];
      place(k, 1, [C1.name, C1.welcome], { flag: C1.flag, bg: '#123a7a', w: 4.4, h: 2.6, post: 1.4, font: 'bold 64px sans-serif', sub: 'bold 30px sans-serif' });
      place(k, -1, [C0.name, C0.welcome], { flag: C0.flag, bg: '#123a7a', w: 4.4, h: 2.6, post: 1.4, font: 'bold 64px sans-serif', sub: 'bold 30px sans-serif' });
      r.borders = r.borders || [];
      r.borders.push({ k, from: c0, to: c1 });
    }
  }

  // segmentos de muro perto de (x, z) para colisão
  segmentsNear(x, z) {
    return this.segHash.get(Math.floor(x / 32) * 100000 + Math.floor(z / 32));
  }

  update(cam, wet) {
    const R = this.Q.roadDist;
    for (const p of this.pieces) {
      const vis = Math.abs(p.x - cam.x) < R && Math.abs(p.z - cam.z) < R;
      if (vis !== p.vis) {
        p.vis = vis;
        for (const m of p.meshes) m.visible = vis;
      }
    }
    if (this.signs)
      for (const s of this.signs) s.visible = Math.abs(s.position.x - cam.x) < 900 && Math.abs(s.position.z - cam.z) < 900;
    if (wet !== this.wet) {
      this.wet = wet;
      for (const k in this.mats.asph) {
        const m = this.mats.asph[k];
        m.roughness = 0.88 - wet * 0.6;
        m.color.setScalar(1 - wet * 0.35);
      }
    }
  }
}
