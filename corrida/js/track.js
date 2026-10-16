// Pista (spline fechada), terreno ondulado, zebras, muros com patrocínios,
// arquibancada, boxes, pórtico de largada, árvores e montanhas.
import * as THREE from 'three';
import * as TX from './textures.js';

const CONTROL = [
  [0, -205], [250, -200], [340, -165], [370, -80], [330, 10], [260, 45], [215, 100], [225, 165],
  [230, 235], [170, 275], [60, 250], [0, 175], [-60, 110], [-150, 130], [-260, 200], [-350, 150],
  [-375, 40], [-335, -60], [-330, -165], [-250, -200],
];

export const ROAD_HALF = 7;
export const CURB_W = 1.3;
export const WALL_OFF = 17;
const DS = 2; // espaçamento entre amostras (m)

// Relevo suave (m). Usado pela física e pelas malhas.
export function terrainHeight(x, z) {
  return (
    3.2 * Math.sin(x / 140 + 0.6) * Math.cos(z / 170 - 0.3) +
    1.8 * Math.sin((x + z) / 95 + 1.2) +
    0.6 * Math.sin(x / 37 - z / 53)
  );
}

export class Track {
  constructor() {
    const curve = new THREE.CatmullRomCurve3(
      CONTROL.map(([x, z]) => new THREE.Vector3(x, 0, z)),
      true,
      'centripetal',
    );
    this.length = curve.getLength();
    const N = Math.round(this.length / DS);
    this.N = N;
    this.ds = this.length / N;
    const pts = curve.getSpacedPoints(N);
    this.px = new Float32Array(N);
    this.pz = new Float32Array(N);
    this.py = new Float32Array(N);
    this.tx = new Float32Array(N);
    this.tz = new Float32Array(N);
    this.curv = new Float32Array(N); // curvatura com sinal (+ = curva para a direita)
    this.line = new Float32Array(N); // deslocamento lateral do traçado ideal
    this.vmax = new Float32Array(N);
    this.curb = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
      this.px[i] = pts[i].x;
      this.pz[i] = pts[i].z;
      this.py[i] = terrainHeight(pts[i].x, pts[i].z);
    }
    for (let i = 0; i < N; i++) {
      const a = (i + 1) % N;
      const b = (i - 1 + N) % N;
      const dx = this.px[a] - this.px[b];
      const dz = this.pz[a] - this.pz[b];
      const l = Math.hypot(dx, dz);
      this.tx[i] = dx / l;
      this.tz[i] = dz / l;
    }
    for (let i = 0; i < N; i++) {
      const a = (i + 2) % N;
      const b = (i - 2 + N) % N;
      // derivada da tangente projetada no vetor "direita"
      const dtx = this.tx[a] - this.tx[b];
      const dtz = this.tz[a] - this.tz[b];
      const [rx, rz] = this.right(i);
      this.curv[i] = (dtx * rx + dtz * rz) / (4 * this.ds);
    }
    // traçado ideal: tangencia o lado de dentro das curvas
    const raw = new Float32Array(N);
    for (let i = 0; i < N; i++) raw[i] = THREE.MathUtils.clamp(this.curv[i] * 260, -1, 1) * (ROAD_HALF - 2.2);
    for (let i = 0; i < N; i++) {
      let s = 0;
      for (let k = -18; k <= 18; k++) s += raw[(i + k + N) % N];
      this.line[i] = s / 37;
    }
    // velocidade máxima em cada ponto (aderência lateral)
    for (let i = 0; i < N; i++) {
      let c = 0;
      for (let k = -4; k <= 4; k++) c = Math.max(c, Math.abs(this.curv[(i + k + N) % N]));
      this.vmax[i] = Math.min(95, Math.sqrt((1.1 * 9.81) / Math.max(c, 1e-4)));
    }
    // zebras onde há curva
    for (let i = 0; i < N; i++) {
      if (Math.abs(this.curv[i]) > 1 / 160) for (let k = -12; k <= 12; k++) this.curb[(i + k + N) % N] = 1;
    }
  }

  right(i) {
    // direita = tangente × cima
    return [-this.tz[i], this.tx[i]];
  }

  // amostra mais próxima (busca local a partir de `hint`, ou global)
  nearest(x, z, hint = -1) {
    const N = this.N;
    let best = -1;
    let bd = Infinity;
    if (hint >= 0) {
      for (let k = -30; k <= 30; k++) {
        const i = (hint + k + N) % N;
        const d = (this.px[i] - x) ** 2 + (this.pz[i] - z) ** 2;
        if (d < bd) {
          bd = d;
          best = i;
        }
      }
      if (bd < 40 * 40) return best;
    }
    for (let i = 0; i < N; i += 3) {
      const d = (this.px[i] - x) ** 2 + (this.pz[i] - z) ** 2;
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    return this.nearest(x, z, best);
  }

  lateral(i, x, z) {
    const [rx, rz] = this.right(i);
    return (x - this.px[i]) * rx + (z - this.pz[i]) * rz;
  }

  // Consulta do solo para a física: altura, normal e aderência.
  ground(x, z, hint, out) {
    const i = this.nearest(x, z, hint);
    const lat = this.lateral(i, x, z);
    const al = Math.abs(lat);
    let h = terrainHeight(x, z);
    let grip = 1;
    let roll = 0.015;
    let surface = 0;
    if (al <= ROAD_HALF) {
      h += 0.05;
    } else if (al <= ROAD_HALF + CURB_W && this.curb[i]) {
      // zebra com ondulação (vibra)
      const along = (x - this.px[i]) * this.tx[i] + (z - this.pz[i]) * this.tz[i] + i * this.ds;
      h += 0.06 + 0.025 * Math.abs(Math.sin(along * 2.1));
      grip = 0.92;
      surface = 1;
    } else {
      grip = 0.62;
      roll = 0.09;
      surface = 2;
    }
    const e = 0.4;
    const hx = terrainHeight(x + e, z) - terrainHeight(x - e, z);
    const hz = terrainHeight(x, z + e) - terrainHeight(x, z - e);
    const nx = -hx / (2 * e);
    const nz = -hz / (2 * e);
    const l = Math.hypot(nx, 1, nz);
    out.h = h;
    out.nx = nx / l;
    out.ny = 1 / l;
    out.nz = nz / l;
    out.grip = grip;
    out.roll = roll;
    out.surface = surface;
    out.idx = i;
    out.lat = lat;
    return out;
  }

  // posição/rumo para o grid ou recolocação
  pose(i, lat) {
    i = ((i % this.N) + this.N) % this.N;
    const [rx, rz] = this.right(i);
    const x = this.px[i] + rx * lat;
    const z = this.pz[i] + rz * lat;
    return { x, z, y: terrainHeight(x, z) + 0.05, heading: Math.atan2(this.tx[i], this.tz[i]) };
  }

  // ---------------------------------------------------------------- malhas
  build(scene, q) {
    this.q = q;
    const group = new THREE.Group();
    scene.add(group);
    this.buildTerrain(group, q.terrain);
    this.buildRoad(group);
    this.buildCurbs(group);
    this.buildWalls(group);
    this.buildStartArea(group);
    this.buildTrees(group, q.trees);
    if (q.grass) this.buildGrass(group, q.grass);
    this.buildMountains(group);
    return group;
  }

  buildTerrain(group, seg) {
    const size = 1800;
    const geo = new THREE.PlaneGeometry(size, size, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const cols = new Float32Array(pos.count * 3);
    const uv = geo.attributes.uv;
    for (let k = 0; k < pos.count; k++) {
      const x = pos.getX(k);
      const z = pos.getZ(k);
      pos.setY(k, terrainHeight(x, z));
      uv.setXY(k, x / 9, z / 9);
      const n = 0.88 + 0.12 * Math.sin(x / 41 + Math.sin(z / 29)) * Math.cos(z / 33);
      cols[k * 3] = n;
      cols[k * 3 + 1] = n;
      cols[k * 3 + 2] = n * 0.95;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ map: TX.grassTexture(), vertexColors: true, roughness: 0.95 });
    const m = new THREE.Mesh(geo, mat);
    m.receiveShadow = true;
    group.add(m);
  }

  // faixa ao longo da pista entre deslocamentos laterais `offs`, com altura dada
  ribbon(offs, heightFn, uvFn, filter) {
    const N = this.N;
    const C = offs.length;
    const pos = [];
    const uvs = [];
    const idx = [];
    let vi = 0;
    let prevOk = false;
    for (let i = 0; i <= N; i++) {
      const k = i % N;
      const ok = !filter || filter(k);
      const [rx, rz] = this.right(k);
      for (let c = 0; c < C; c++) {
        const x = this.px[k] + rx * offs[c];
        const z = this.pz[k] + rz * offs[c];
        pos.push(x, heightFn(x, z, c), z);
        const [u, v] = uvFn(i, c);
        uvs.push(u, v);
      }
      if (i > 0 && ok && prevOk) {
        const a = vi - C;
        for (let c = 0; c < C - 1; c++) idx.push(a + c, a + c + 1, vi + c, a + c + 1, vi + c + 1, vi + c);
      }
      prevOk = ok;
      vi += C;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  buildRoad(group) {
    const W = ROAD_HALF;
    const vRep = this.length / Math.round(this.length / 10);
    const offs = [-W, -W * 0.5, 0, W * 0.5, W];
    const g = this.ribbon(
      offs,
      (x, z) => terrainHeight(x, z) + 0.05,
      (i, c) => [c / (offs.length - 1), (i * this.ds) / vRep],
    );
    const tex = TX.asphaltTexture();
    tex.anisotropy = this.q.aniso;
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.88, metalness: 0 }));
    m.receiveShadow = true;
    group.add(m);
    // faixa de largada (quadriculada)
    const ck = TX.checkerTexture(14, 2);
    ck.wrapS = ck.wrapT = THREE.ClampToEdgeWrapping;
    // reconstrói apenas o trecho 0..1
    const lp = [];
    const luv = [];
    for (const k of [0, 1]) {
      const [rx, rz] = this.right(k);
      for (const s of [-W, W]) {
        const x = this.px[k] + rx * s;
        const z = this.pz[k] + rz * s;
        lp.push(x, terrainHeight(x, z) + 0.07, z);
        luv.push(s < 0 ? 0 : 1, k);
      }
    }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
    lg.setAttribute('uv', new THREE.Float32BufferAttribute(luv, 2));
    lg.setIndex([0, 2, 1, 1, 2, 3]);
    lg.computeVertexNormals();
    const line = new THREE.Mesh(lg, new THREE.MeshStandardMaterial({ map: ck, roughness: 0.7, side: THREE.DoubleSide }));
    line.receiveShadow = true;
    group.add(line);
    // marcações do grid
    const gridMat = new THREE.MeshBasicMaterial({ color: 0xf2f2f2 });
    for (let k = 0; k < 8; k++) {
      const p = this.pose(-6 - k * 5, k % 2 ? -3.2 : 3.2);
      const mk = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.25), gridMat);
      mk.rotation.order = 'YXZ';
      mk.rotation.y = p.heading;
      mk.rotation.x = -Math.PI / 2;
      mk.position.set(p.x, terrainHeight(p.x, p.z) + 0.075, p.z);
      group.add(mk);
    }
  }

  buildCurbs(group) {
    const W = ROAD_HALF;
    const mat = new THREE.MeshStandardMaterial({ map: TX.curbTexture(), roughness: 0.6 });
    for (const sgn of [1, -1]) {
      const offs = sgn > 0 ? [W - 0.05, W + CURB_W * 0.5, W + CURB_W] : [-W - CURB_W, -W - CURB_W * 0.5, -W + 0.05];
      const g = this.ribbon(
        offs,
        (x, z, c) => terrainHeight(x, z) + (c === 1 ? 0.1 : sgn > 0 ? (c === 0 ? 0.07 : 0.05) : c === 2 ? 0.07 : 0.05),
        (i, c) => [c / 2, (i * this.ds) / 3],
        (k) => this.curb[k] === 1,
      );
      const m = new THREE.Mesh(g, mat);
      m.receiveShadow = true;
      group.add(m);
    }
  }

  buildWalls(group) {
    const tex = TX.barrierTexture();
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 });
    const topMat = new THREE.MeshStandardMaterial({ color: 0xbdbcb6, roughness: 0.9 });
    const H = 1.1;
    for (const sgn of [1, -1]) {
      const o = sgn * WALL_OFF;
      const o2 = sgn * (WALL_OFF + 0.45);
      const face = this.ribbon(
        [o, o],
        (x, z, c) => terrainHeight(x, z) + (c === 0 ? -0.3 : H),
        (i, c) => [(i * this.ds) / 24, c === 0 ? 0 : 1],
      );
      // a face deve olhar para a pista
      if (sgn < 0) flipIndex(face);
      const fm = new THREE.Mesh(face, mat);
      fm.castShadow = true;
      fm.receiveShadow = true;
      group.add(fm);
      const top = this.ribbon(
        [o, o2],
        (x, z) => terrainHeight(x, z) + H,
        (i, c) => [i, c],
      );
      if (sgn < 0) flipIndex(top);
      group.add(new THREE.Mesh(top, topMat));
      const back = this.ribbon(
        [o2, o2],
        (x, z, c) => terrainHeight(x, z) + (c === 0 ? H : -0.3),
        (i, c) => [i, c],
      );
      if (sgn < 0) flipIndex(back);
      group.add(new THREE.Mesh(back, topMat));
    }
  }

  buildStartArea(group) {
    // pórtico de largada com semáforo
    const p0 = this.pose(0, 0);
    const gantry = new THREE.Group();
    gantry.position.set(p0.x, terrainHeight(p0.x, p0.z), p0.z);
    gantry.rotation.y = p0.heading;
    const steel = new THREE.MeshStandardMaterial({ color: 0x30343a, metalness: 0.7, roughness: 0.4 });
    for (const s of [-1, 1]) {
      const pil = new THREE.Mesh(new THREE.BoxGeometry(0.6, 8, 0.6), steel);
      pil.position.set(s * (ROAD_HALF + 2.5), 4, 0);
      pil.castShadow = true;
      gantry.add(pil);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(2 * (ROAD_HALF + 3), 1.6, 0.8), steel);
    beam.position.set(0, 7.6, 0);
    beam.castShadow = true;
    gantry.add(beam);
    const banner = TX.bannerTexture('CORRIDA 3D', '#c41e1e', '#ffffff');
    for (const s of [1, -1]) {
      const b = new THREE.Mesh(new THREE.PlaneGeometry(2 * (ROAD_HALF + 2), 1.3), new THREE.MeshStandardMaterial({ map: banner, roughness: 0.6 }));
      b.position.set(0, 7.6, s * 0.41);
      if (s < 0) b.rotation.y = Math.PI;
      gantry.add(b);
    }
    this.startLights = [];
    for (let k = 0; k < 5; k++) {
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.6, 0.4), new THREE.MeshStandardMaterial({ color: 0x111111 }));
      box.position.set(-2 + k, 5.9, -0.2);
      gantry.add(box);
      const lm = new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff0000, emissiveIntensity: 0 });
      for (const yy of [0.35, -0.35]) {
        const l = new THREE.Mesh(new THREE.CircleGeometry(0.22, 16), lm);
        l.position.set(-2 + k, 5.9 + yy, -0.41);
        l.rotation.y = Math.PI;
        gantry.add(l);
      }
      this.startLights.push(lm);
    }
    group.add(gantry);

    // arquibancada do lado direito da reta, boxes do lado esquerdo
    const seatMat = new THREE.MeshStandardMaterial({ color: 0x9ea4ab, roughness: 0.8 });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.5, metalness: 0.3, side: THREE.DoubleSide });
    const crowdGeo = new THREE.BoxGeometry(0.45, 0.8, 0.35);
    const crowdMat = new THREE.MeshStandardMaterial({ roughness: 0.9 });
    const people = [];
    const rand = TX.rng(77);
    const standLen = 26; // amostras por bloco
    for (const startI of [-70, -40, 6]) {
      const iMid = startI + standLen / 2;
      const p = this.pose(iMid, -(WALL_OFF + 12));
      const g = new THREE.Group();
      g.position.set(p.x, terrainHeight(p.x, p.z) - 0.2, p.z);
      g.rotation.y = p.heading;
      const len = standLen * this.ds - 2;
      // local: +z = sentido da pista, +x = para longe da pista (esquerda)
      for (let r = 0; r < 8; r++) {
        const hgt = 0.6 + r * 0.6;
        const step = new THREE.Mesh(new THREE.BoxGeometry(1.2, hgt, len), seatMat);
        step.position.set(r * 1.2 - 4, hgt / 2, 0);
        step.castShadow = true;
        step.receiveShadow = true;
        g.add(step);
        for (let q = 0; q < len / 0.75; q++) {
          if (rand() < 0.22) continue;
          people.push({ g, x: r * 1.2 - 4, y: hgt + 0.4, z: -len / 2 + 0.4 + q * 0.75 + (rand() - 0.5) * 0.2, c: rand() });
        }
      }
      for (const zz of [-len / 2, 0, len / 2]) {
        const col = new THREE.Mesh(new THREE.BoxGeometry(0.3, 9.5, 0.3), seatMat);
        col.position.set(5, 4.75, zz);
        g.add(col);
      }
      const roof = new THREE.Mesh(new THREE.BoxGeometry(12, 0.15, len + 1), roofMat);
      roof.position.set(0, 9.3, 0);
      roof.rotation.z = -0.1;
      roof.castShadow = true;
      g.add(roof);
      group.add(g);
      g.updateMatrixWorld(true);
    }
    // público (instanciado)
    const palette = [0xc8141c, 0x1446b8, 0xf2b705, 0xffffff, 0x0f7a3a, 0x222222, 0xe8620c, 0x9c27b0];
    const inst = new THREE.InstancedMesh(crowdGeo, crowdMat, people.length);
    const m4 = new THREE.Matrix4();
    const col = new THREE.Color();
    people.forEach((pp, k) => {
      m4.makeTranslation(pp.x, pp.y, pp.z);
      m4.premultiply(pp.g.matrixWorld);
      inst.setMatrixAt(k, m4);
      inst.setColorAt(k, col.setHex(palette[(pp.c * palette.length) | 0]));
    });
    inst.castShadow = false;
    group.add(inst);

    // prédio dos boxes
    const pitTex = TX.garageTexture();
    pitTex.repeat.set(6, 1);
    const pitMat = [
      new THREE.MeshStandardMaterial({ color: 0xd8d8d8 }),
      new THREE.MeshStandardMaterial({ color: 0xd8d8d8 }),
      new THREE.MeshStandardMaterial({ color: 0x9a9a9a }),
      new THREE.MeshStandardMaterial({ color: 0xd8d8d8 }),
      new THREE.MeshStandardMaterial({ map: pitTex }),
      new THREE.MeshStandardMaterial({ map: pitTex }),
    ];
    const pp = this.pose(-30, WALL_OFF + 14);
    const pit = new THREE.Mesh(new THREE.BoxGeometry(18, 7, 100), pitMat);
    pit.position.set(pp.x, terrainHeight(pp.x, pp.z) + 3.2, pp.z);
    pit.rotation.y = pp.heading;
    pit.castShadow = true;
    pit.receiveShadow = true;
    group.add(pit);
    const tower = new THREE.Mesh(new THREE.BoxGeometry(6, 14, 6), new THREE.MeshStandardMaterial({ color: 0x2b2f36, metalness: 0.4, roughness: 0.3 }));
    const tp = this.pose(-2, WALL_OFF + 12);
    tower.position.set(tp.x, terrainHeight(tp.x, tp.z) + 7, tp.z);
    tower.rotation.y = tp.heading;
    tower.castShadow = true;
    group.add(tower);
  }

  // distância aproximada (m) até o eixo da pista
  distToTrack(x, z) {
    let bd = Infinity;
    for (let i = 0; i < this.N; i += 4) {
      const d = (this.px[i] - x) ** 2 + (this.pz[i] - z) ** 2;
      if (d < bd) bd = d;
    }
    return Math.sqrt(bd);
  }

  buildTrees(group, count) {
    const rand = TX.rng(2024);
    const trunkGeo = new THREE.CylinderGeometry(0.18, 0.28, 3, 6);
    trunkGeo.translate(0, 1.5, 0);
    const leafGeo = new THREE.IcosahedronGeometry(2.4, 1);
    leafGeo.translate(0, 4.6, 0);
    const pineGeo = new THREE.ConeGeometry(2.1, 7, 8);
    pineGeo.translate(0, 5.5, 0);
    const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshStandardMaterial({ color: 0x5a3d26, roughness: 1 }), count);
    const leaves = new THREE.InstancedMesh(leafGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true }), count);
    const pines = new THREE.InstancedMesh(pineGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true }), count);
    let nl = 0;
    let np = 0;
    let nt = 0;
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    const col = new THREE.Color();
    for (let tries = 0; tries < count * 6 && nt < count; tries++) {
      const x = (rand() - 0.5) * 1500;
      const z = (rand() - 0.5) * 1300;
      const d = this.distToTrack(x, z);
      if (d < WALL_OFF + 9) continue;
      if (d > 120 && rand() < 0.5) continue;
      const sc = 0.8 + rand() * 0.7;
      p.set(x, terrainHeight(x, z) - 0.1, z);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * 6.28);
      s.set(sc, sc * (0.9 + rand() * 0.3), sc);
      m4.compose(p, q, s);
      trunks.setMatrixAt(nt++, m4);
      if (rand() < 0.55) {
        leaves.setMatrixAt(nl, m4);
        leaves.setColorAt(nl++, col.setHSL(0.24 + rand() * 0.08, 0.5, 0.25 + rand() * 0.12));
      } else {
        pines.setMatrixAt(np, m4);
        pines.setColorAt(np++, col.setHSL(0.3 + rand() * 0.06, 0.45, 0.18 + rand() * 0.08));
      }
    }
    trunks.count = nt;
    leaves.count = nl;
    pines.count = np;
    for (const m of [trunks, leaves, pines]) {
      m.castShadow = true;
      m.receiveShadow = true;
      group.add(m);
    }
  }

  // tufos de grama 3D (instanciados) entre a zebra e o muro e fora dele
  buildGrass(group, count) {
    const rand = TX.rng(31);
    // tufo com 9 folhas finas espalhadas num raio pequeno, base escura e ponta clara
    const pos = [];
    const col = [];
    const nor = [];
    for (let k = 0; k < 9; k++) {
      const a = rand() * Math.PI;
      const ox = (rand() - 0.5) * 0.35;
      const oz = (rand() - 0.5) * 0.35;
      const w = 0.025 + rand() * 0.02;
      const h = 0.18 + rand() * 0.22;
      const ca = Math.cos(a) * w;
      const sa = Math.sin(a) * w;
      const lx = (rand() - 0.5) * 0.12;
      const lz = (rand() - 0.5) * 0.12;
      // duas faces (frente e verso) com normais para cima: a grama recebe a
      // mesma luz do chão dos dois lados
      pos.push(ox - ca, 0, oz - sa, ox + ca, 0, oz + sa, ox + lx, h, oz + lz);
      pos.push(ox + ca, 0, oz + sa, ox - ca, 0, oz - sa, ox + lx, h, oz + lz);
      for (let f = 0; f < 2; f++) {
        col.push(0.26, 0.42, 0.15, 0.26, 0.42, 0.15, 0.46, 0.68, 0.26);
        nor.push(0, 1, 0, 0, 1, 0, 0, 1, 0);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const inst = new THREE.InstancedMesh(geo, mat, count);
    const m4 = new THREE.Matrix4();
    const qt = new THREE.Quaternion();
    const sc = new THREE.Vector3();
    const p = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const c = new THREE.Color();
    let n = 0;
    for (let t = 0; t < count * 2 && n < count; t++) {
      const i = Math.floor(rand() * this.N);
      const side = rand() < 0.5 ? -1 : 1;
      // 60% perto da pista (entre zebra e muro), resto fora do muro
      const lat = rand() < 0.6 ? ROAD_HALF + CURB_W + 0.4 + rand() * (WALL_OFF - ROAD_HALF - CURB_W - 0.8) : WALL_OFF + 1 + rand() * 45;
      const pp = this.pose(i, side * lat);
      p.set(pp.x + (rand() - 0.5) * 2, 0, pp.z + (rand() - 0.5) * 2);
      p.y = terrainHeight(p.x, p.z) - 0.02;
      qt.setFromAxisAngle(up, rand() * 6.28);
      const s = 0.8 + rand() * 0.8;
      sc.set(s, s * (0.6 + rand() * 0.7), s);
      m4.compose(p, qt, sc);
      inst.setMatrixAt(n, m4);
      inst.setColorAt(n++, c.setRGB(0.8 + rand() * 0.2, 0.85 + rand() * 0.2, 0.75 + rand() * 0.15));
    }
    inst.count = n;
    inst.receiveShadow = true;
    inst.layers.set(1);
    group.add(inst);
  }

  buildMountains(group) {
    const geo = new THREE.CylinderGeometry(1400, 1400, 1, 96, 6, true);
    const pos = geo.attributes.position;
    const rand = TX.rng(9);
    const heights = Array.from({ length: 97 }, () => 60 + rand() * 160);
    for (let k = 0; k < pos.count; k++) {
      const y = pos.getY(k) + 0.5; // 0..1
      const a = Math.atan2(pos.getZ(k), pos.getX(k));
      const idx = Math.round(((a + Math.PI) / (Math.PI * 2)) * 96) % 96;
      const h = heights[idx] * (0.6 + 0.4 * Math.sin(a * 7)) + 20;
      pos.setY(k, y * h - 15);
      const r = 1400 - y * 120;
      pos.setX(k, Math.cos(a) * r);
      pos.setZ(k, Math.sin(a) * r);
    }
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x5f7a66, roughness: 1, side: THREE.BackSide, flatShading: true }));
    group.add(m);
  }
}

function flipIndex(g) {
  const a = g.index.array;
  for (let k = 0; k < a.length; k += 3) {
    const t = a[k + 1];
    a[k + 1] = a[k + 2];
    a[k + 2] = t;
  }
  g.index.needsUpdate = true;
  g.computeVertexNormals();
}
