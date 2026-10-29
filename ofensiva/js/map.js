// Mapa "Poeira": layout inspirado nos clássicos mapas de desarme de bomba.
// O mundo é uma grade de células de 2 m (parede ou piso) mais caixotes (AABBs).
// Daqui saem a malha 3D, a colisão, o raycast das balas e a navegação dos bots.
import * as THREE from 'three';
import { sandstoneTex, floorTex, crateTex, siteLetterTex } from './textures.js';

export const CELL = 2;
export const WALL_H = 6;
const W = 46;
const H = 48;

// Áreas escavadas na rocha [x0, z0, x1, z1] em células (inclusivo).
const CARVE = [
  [18, 2, 27, 8], // base CT
  [2, 2, 13, 13], // bombsite B
  [29, 2, 43, 13], // bombsite A
  [13, 4, 18, 7], // portas do B (CT → B)
  [27, 4, 29, 7], // CT → A
  [20, 8, 24, 35], // meio
  [25, 16, 28, 19], // passarela (curto)
  [26, 12, 29, 16], // subida do curto
  [38, 14, 42, 33], // longo A
  [30, 31, 42, 34], // portas do longo
  [30, 34, 34, 37], // base T → longo
  [12, 37, 34, 45], // base T
  [20, 35, 24, 37], // base T → meio
  [3, 37, 12, 41], // saída dos túneis
  [3, 14, 7, 37], // túneis superiores
  [7, 26, 20, 28], // túnel inferior → meio
];

// Blocos de parede recolocados para criar cobertura.
const PILLARS = [
  [9, 8, 10, 9], // pilar do B
  [30, 9, 31, 10], // pilar do A
  [22, 4, 23, 5], // base CT
  [22, 40, 23, 41], // base T
  [38, 26, 39, 27], // canto do longo
  [6, 20, 7, 22], // estreitamento do túnel
  [20, 14, 21, 15], // portas do meio (vão de 2 m no centro)
  [23, 14, 24, 15],
];

// Caixotes: [cx, cz, altura] (1 = baixo, 2 = empilhado).
const CRATES = [
  [4, 6, 2], [5, 6, 1], [4, 7, 1], [11, 4, 1], [11, 5, 2], [7, 11, 1], // B
  [35, 7, 2], [34, 7, 1], [35, 8, 1], [41, 4, 1], [41, 5, 1], [32, 4, 1], // A
  [22, 22, 1], [20, 30, 1], [22, 31, 2], [23, 31, 1], // meio
  [19, 3, 1], [26, 7, 1], // base CT
  [14, 39, 1], [14, 40, 2], [30, 43, 1], [26, 38, 1], // base T
  [41, 18, 1], [39, 30, 1], [40, 30, 2], // longo
  [3, 30, 1], // túnel
  [27, 17, 1], // curto
];
const CRATE_SIZE = 1.7;
const CRATE_H = 1.1;

// Zonas de bomba (células).
const SITES = {
  A: [32, 3, 40, 11],
  B: [3, 3, 11, 11],
};

const SPAWNS = {
  T: [[17, 42], [19, 42], [21, 43], [24, 42], [26, 42], [18, 44], [25, 44], [28, 41]],
  CT: [[20, 4], [21, 6], [24, 6], [25, 4], [20, 6], [25, 6], [26, 3], [21, 3]],
};

// Pontos estratégicos (células) usados pelos bots: [cx, cz, olharX, olharZ].
export const SPOTS = {
  ctHold: {
    A: [[39, 8, 40, 18], [33, 6, 28, 14], [36, 3, 40, 16]],
    B: [[6, 4, 5, 16], [12, 9, 5, 15], [8, 3, 5, 15]],
    mid: [[22, 10, 22, 32], [19, 5, 22, 20]],
  },
  tPost: {
    A: [[33, 10, 28, 5], [38, 6, 22, 6], [40, 12, 28, 13]],
    B: [[10, 10, 14, 5], [5, 9, 13, 5], [8, 4, 14, 6]],
  },
  plant: { A: [37, 9], B: [7, 8] },
  // rotas dos T: pontos intermediários até o bombsite
  routes: {
    A: [
      [[32, 36], [40, 29], [40, 16]], // longo
      [[22, 33], [22, 18], [26, 17], [28, 13]], // curto
    ],
    B: [
      [[8, 39], [5, 25], [5, 15]], // túneis
      [[22, 33], [21, 27], [8, 27], [5, 16]], // meio → túnel inferior
    ],
  },
  callouts: [
    ['Bombsite A', 29, 2, 43, 13],
    ['Bombsite B', 2, 2, 13, 13],
    ['Base CT', 18, 2, 27, 8],
    ['Portas do B', 13, 4, 18, 7],
    ['Meio', 20, 8, 24, 35],
    ['Curto', 25, 12, 29, 19],
    ['Longo', 38, 14, 42, 33],
    ['Portas do longo', 30, 31, 42, 37],
    ['Base T', 12, 37, 34, 45],
    ['Túneis', 3, 14, 7, 41],
    ['Túnel inferior', 7, 26, 20, 28],
    ['Túneis', 3, 37, 12, 41],
  ],
};

export class GameMap {
  constructor() {
    this.W = W;
    this.H = H;
    this.grid = new Uint8Array(W * H).fill(1); // 1 = parede
    for (const [x0, z0, x1, z1] of CARVE) this.fill(x0, z0, x1, z1, 0);
    for (const [x0, z0, x1, z1] of PILLARS) this.fill(x0, z0, x1, z1, 1);
    // borda sempre sólida
    for (let x = 0; x < W; x++) this.grid[x] = this.grid[(H - 1) * W + x] = 1;
    for (let z = 0; z < H; z++) this.grid[z * W] = this.grid[z * W + W - 1] = 1;

    this.boxes = [];
    this.blocked = new Uint8Array(W * H); // células bloqueadas para navegação
    for (const [cx, cz, h] of CRATES) {
      const x = (cx + 0.5) * CELL;
      const z = (cz + 0.5) * CELL;
      const s = CRATE_SIZE / 2;
      this.boxes.push({
        min: [x - s, 0, z - s],
        max: [x + s, CRATE_H * h, z + s],
        h,
        cx,
        cz,
      });
      this.blocked[cz * W + cx] = 1;
    }
    this.sites = {};
    for (const k in SITES) {
      const [x0, z0, x1, z1] = SITES[k];
      this.sites[k] = { x0: x0 * CELL, z0: z0 * CELL, x1: (x1 + 1) * CELL, z1: (z1 + 1) * CELL };
    }
    this.size = [W * CELL, H * CELL];
  }

  fill(x0, z0, x1, z1, v) {
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) this.grid[z * W + x] = v;
  }

  isWall(cx, cz) {
    if (cx < 0 || cz < 0 || cx >= W || cz >= H) return true;
    return this.grid[cz * W + cx] === 1;
  }

  walkable(cx, cz) {
    return !this.isWall(cx, cz) && !this.blocked[cz * W + cx];
  }

  cellCenter(cx, cz, out = new THREE.Vector3()) {
    return out.set((cx + 0.5) * CELL, 0, (cz + 0.5) * CELL);
  }

  spawnPoints(team) {
    return SPAWNS[team].map(([cx, cz]) => this.cellCenter(cx, cz));
  }

  siteAt(p) {
    for (const k in this.sites) {
      const s = this.sites[k];
      if (p.x >= s.x0 && p.x <= s.x1 && p.z >= s.z0 && p.z <= s.z1) return k;
    }
    return null;
  }

  calloutAt(p) {
    const cx = p.x / CELL;
    const cz = p.z / CELL;
    for (const [name, x0, z0, x1, z1] of SPOTS.callouts) {
      if (cx >= x0 && cx < x1 + 1 && cz >= z0 && cz < z1 + 1) return name;
    }
    return '';
  }

  // ---------------------------------------------------------------- malhas
  build(scene) {
    const group = new THREE.Group();
    const wallTex = sandstoneTex(1);
    const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.92 });
    const trimMat = new THREE.MeshStandardMaterial({ map: sandstoneTex(5, [170, 140, 96]), roughness: 0.95 });

    // Paredes: só as faces voltadas para células de piso, com UV em metros.
    const pos = [];
    const nor = [];
    const uv = [];
    const quad = (ax, az, bx, bz, nx, nz, y0, y1) => {
      const len = Math.hypot(bx - ax, bz - az);
      const u0 = (ax * Math.abs(nz) + az * Math.abs(nx)) / 4;
      const u1 = u0 + len / 4;
      const v0 = y0 / 4;
      const v1 = y1 / 4;
      pos.push(ax, y0, az, bx, y0, bz, bx, y1, bz, ax, y0, az, bx, y1, bz, ax, y1, az);
      for (let i = 0; i < 6; i++) nor.push(nx, 0, nz);
      uv.push(u0, v0, u1, v0, u1, v1, u0, v0, u1, v1, u0, v1);
    };
    const tops = [];
    for (let z = 0; z < H; z++) {
      for (let x = 0; x < W; x++) {
        if (!this.isWall(x, z)) continue;
        const x0 = x * CELL;
        const x1 = x0 + CELL;
        const z0 = z * CELL;
        const z1 = z0 + CELL;
        // altura varia um pouco para quebrar a silhueta
        const hh = WALL_H + ((x * 7 + z * 13) % 5 === 0 ? 1.2 : 0);
        const open = (dx, dz) => x + dx >= 0 && z + dz >= 0 && x + dx < W && z + dz < H && !this.isWall(x + dx, z + dz);
        if (open(0, 1)) quad(x0, z1, x1, z1, 0, 1, 0, hh);
        if (open(0, -1)) quad(x1, z0, x0, z0, 0, -1, 0, hh);
        if (open(1, 0)) quad(x1, z1, x1, z0, 1, 0, 0, hh);
        if (open(-1, 0)) quad(x0, z0, x0, z1, -1, 0, 0, hh);
        if (open(0, 1) || open(0, -1) || open(1, 0) || open(-1, 0)) tops.push([x0, z0, hh]);
      }
    }
    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    wg.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    wg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    const walls = new THREE.Mesh(wg, wallMat);
    walls.castShadow = walls.receiveShadow = true;
    group.add(walls);

    // Topo das paredes (silhueta vista de cima dos caixotes e sombras corretas).
    const topGeo = new THREE.BoxGeometry(CELL, 0.4, CELL);
    const topMesh = new THREE.InstancedMesh(topGeo, trimMat, tops.length);
    const m = new THREE.Matrix4();
    tops.forEach(([x0, z0, hh], i) => {
      m.makeTranslation(x0 + CELL / 2, hh + 0.2, z0 + CELL / 2);
      topMesh.setMatrixAt(i, m);
    });
    topMesh.castShadow = true;
    group.add(topMesh);

    // Rodapé escuro (sujeira acumulada ao pé das paredes).
    const dirt = [];
    const dnor = [];
    for (let i = 0; i < pos.length; i += 18) {
      const ax = pos[i];
      const az = pos[i + 2];
      const bx = pos[i + 3];
      const bz = pos[i + 5];
      const nxx = nor[i];
      const nzz = nor[i + 2];
      const o = 0.01;
      dirt.push(
        ax + nxx * o, 0.01, az + nzz * o, bx + nxx * o, 0.01, bz + nzz * o, bx + nxx * o, 0.6, bz + nzz * o,
        ax + nxx * o, 0.01, az + nzz * o, bx + nxx * o, 0.6, bz + nzz * o, ax + nxx * o, 0.6, az + nzz * o,
      );
      for (let k = 0; k < 6; k++) dnor.push(nxx, 0, nzz);
    }
    const dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.Float32BufferAttribute(dirt, 3));
    dg.setAttribute('normal', new THREE.Float32BufferAttribute(dnor, 3));
    const dcol = [];
    for (let i = 0; i < dirt.length; i += 3) {
      const a = dirt[i + 1] < 0.3 ? 0.45 : 0;
      dcol.push(a);
    }
    dg.setAttribute('alpha', new THREE.Float32BufferAttribute(dcol, 1));
    const dirtMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      vertexShader: 'attribute float alpha; varying float vA; void main(){ vA = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'varying float vA; void main(){ gl_FragColor = vec4(0.22,0.15,0.08,vA); }',
    });
    group.add(new THREE.Mesh(dg, dirtMat));

    // Piso
    const ft = floorTex(2);
    ft.repeat.set((W * CELL) / 4, (H * CELL) / 4);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(W * CELL, H * CELL),
      new THREE.MeshStandardMaterial({ map: ft, roughness: 0.95 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set((W * CELL) / 2, 0, (H * CELL) / 2);
    floor.receiveShadow = true;
    group.add(floor);

    // Marcação pintada no chão dos bombsites
    for (const k in this.sites) {
      const s = this.sites[k];
      const w = s.x1 - s.x0;
      const d = s.z1 - s.z0;
      const edge = new THREE.Mesh(
        new THREE.RingGeometry(0.97, 1, 4, 1),
        new THREE.MeshBasicMaterial({ color: 0xb02a1a, transparent: true, opacity: 0.35, depthWrite: false }),
      );
      edge.rotation.x = -Math.PI / 2;
      edge.rotation.z = Math.PI / 4;
      edge.scale.set(w * 0.7, d * 0.7, 1);
      edge.position.set((s.x0 + s.x1) / 2, 0.02, (s.z0 + s.z1) / 2);
      group.add(edge);
      const letter = new THREE.Mesh(
        new THREE.PlaneGeometry(5, 5),
        new THREE.MeshBasicMaterial({ map: siteLetterTex(k), transparent: true, depthWrite: false, opacity: 0.8 }),
      );
      letter.rotation.x = -Math.PI / 2;
      letter.position.set((s.x0 + s.x1) / 2, 0.03, (s.z0 + s.z1) / 2);
      group.add(letter);
    }
    this.placeWallLetters(group);

    // Caixotes
    const ct = crateTex(3);
    const crateMat = new THREE.MeshStandardMaterial({ map: ct, roughness: 0.85 });
    const crateMat2 = new THREE.MeshStandardMaterial({ map: crateTex(8), roughness: 0.85, color: 0xd8c8a8 });
    const cg = new THREE.BoxGeometry(CRATE_SIZE, CRATE_H, CRATE_SIZE);
    for (const b of this.boxes) {
      for (let i = 0; i < b.h; i++) {
        const mesh = new THREE.Mesh(cg, (b.cx + b.cz + i) % 2 ? crateMat : crateMat2);
        mesh.position.set((b.min[0] + b.max[0]) / 2, CRATE_H * (i + 0.5), (b.min[2] + b.max[2]) / 2);
        mesh.rotation.y = i === 1 ? 0.12 : 0;
        if (i === 1) mesh.scale.set(0.92, 1, 0.92);
        mesh.castShadow = mesh.receiveShadow = true;
        group.add(mesh);
      }
    }

    // Vigas de madeira cruzando os corredores
    const beamMat = new THREE.MeshStandardMaterial({ color: 0x4a3420, roughness: 0.9 });
    for (const [x, z, w] of [[45, 24, 10], [45, 66, 10], [11, 50, 10], [81, 50, 10], [65, 70, 10]]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, 0.3, 0.3), beamMat);
      b.position.set(x, 5.2, z);
      b.castShadow = true;
      group.add(b);
    }

    scene.add(group);
    this.group = group;
  }

  // Letras dos bombsites pintadas na parede mais próxima de cada ponto.
  placeWallLetters(group) {
    const spots = [
      ['A', 36, 2], // norte do A
      ['A', 40, 13.5], // saída do longo
      ['B', 7, 2],
      ['B', 2, 8],
    ];
    for (const [k, cx, cz] of spots) {
      // procura a parede mais próxima em 4 direções
      const p = this.cellCenter(Math.floor(cx), Math.floor(cz));
      p.y = 2.6;
      let best = null;
      for (const [dx, dz, ry] of [[0, -1, 0], [0, 1, Math.PI], [-1, 0, Math.PI / 2], [1, 0, -Math.PI / 2]]) {
        const hit = this.raycast(p, new THREE.Vector3(dx, 0, dz), 30, false);
        if (hit && (!best || hit.dist < best.dist)) best = { ...hit, ry, dx, dz };
      }
      if (!best) continue;
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(2.4, 2.4),
        new THREE.MeshBasicMaterial({ map: siteLetterTex(k), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
      );
      m.position.set(p.x + best.dx * (best.dist - 0.02), 2.6, p.z + best.dz * (best.dist - 0.02));
      m.rotation.y = best.ry;
      group.add(m);
    }
  }

  // ---------------------------------------------------------------- raycast
  // Raio contra paredes (DDA na grade), caixotes e chão. dir deve ser unitário.
  raycast(o, d, maxDist, floor = true) {
    let best = maxDist;
    let normal = null;
    let kind = null;
    // paredes
    let cx = Math.floor(o.x / CELL);
    let cz = Math.floor(o.z / CELL);
    const stepX = d.x > 0 ? 1 : -1;
    const stepZ = d.z > 0 ? 1 : -1;
    const tDX = d.x !== 0 ? Math.abs(CELL / d.x) : Infinity;
    const tDZ = d.z !== 0 ? Math.abs(CELL / d.z) : Infinity;
    let tMX = d.x !== 0 ? ((d.x > 0 ? (cx + 1) * CELL : cx * CELL) - o.x) / d.x : Infinity;
    let tMZ = d.z !== 0 ? ((d.z > 0 ? (cz + 1) * CELL : cz * CELL) - o.z) / d.z : Infinity;
    let t = 0;
    let side = -1;
    if (this.isWall(cx, cz) && o.y < WALL_H) {
      return { dist: 0, normal: new THREE.Vector3(0, 1, 0), kind: 'wall', point: o.clone() };
    }
    while (t < best) {
      if (tMX < tMZ) {
        t = tMX;
        tMX += tDX;
        cx += stepX;
        side = 0;
      } else {
        t = tMZ;
        tMZ += tDZ;
        cz += stepZ;
        side = 1;
      }
      if (t >= best) break;
      if (cx < 0 || cz < 0 || cx >= W || cz >= H) break;
      if (this.grid[cz * W + cx] === 1) {
        const y = o.y + d.y * t;
        if (y < WALL_H && y > -0.1) {
          best = t;
          kind = 'wall';
          normal = side === 0 ? new THREE.Vector3(-stepX, 0, 0) : new THREE.Vector3(0, 0, -stepZ);
          break;
        }
      }
    }
    // caixotes
    for (const b of this.boxes) {
      const r = rayBox(o, d, b.min, b.max, best);
      if (r) {
        best = r.t;
        normal = r.n;
        kind = 'crate';
      }
    }
    if (floor && d.y < 0) {
      const tf = -o.y / d.y;
      if (tf > 0 && tf < best) {
        best = tf;
        normal = new THREE.Vector3(0, 1, 0);
        kind = 'floor';
      }
    }
    if (!kind) return null;
    return {
      dist: best,
      normal,
      kind,
      point: new THREE.Vector3(o.x + d.x * best, o.y + d.y * best, o.z + d.z * best),
    };
  }

  // Linha de visão livre entre dois pontos?
  lineClear(a, b) {
    const d = _v.subVectors(b, a);
    const len = d.length();
    if (len < 1e-4) return true;
    d.divideScalar(len);
    return !this.raycast(a, d.clone(), len - 0.05, false);
  }

  // ---------------------------------------------------------------- colisão
  // Sólidos que intersectam a AABB dada (paredes como caixas + caixotes).
  solidsNear(minX, minY, minZ, maxX, maxY, maxZ, out) {
    out.length = 0;
    const c0 = Math.floor(minX / CELL);
    const c1 = Math.floor(maxX / CELL);
    const r0 = Math.floor(minZ / CELL);
    const r1 = Math.floor(maxZ / CELL);
    for (let z = r0; z <= r1; z++) {
      for (let x = c0; x <= c1; x++) {
        if (this.isWall(x, z)) out.push([x * CELL, -10, z * CELL, (x + 1) * CELL, 50, (z + 1) * CELL]);
      }
    }
    for (const b of this.boxes) {
      if (b.max[0] > minX && b.min[0] < maxX && b.max[2] > minZ && b.min[2] < maxZ && b.max[1] > minY && b.min[1] < maxY) {
        out.push([b.min[0], b.min[1], b.min[2], b.max[0], b.max[1], b.max[2]]);
      }
    }
    return out;
  }

  // Altura do chão (topo de caixote ou 0) sob um ponto, abaixo de y.
  groundAt(x, z, r, y) {
    let g = 0;
    for (const b of this.boxes) {
      if (x + r > b.min[0] && x - r < b.max[0] && z + r > b.min[2] && z - r < b.max[2] && b.max[1] <= y + 0.05) {
        g = Math.max(g, b.max[1]);
      }
    }
    return g;
  }

  // ---------------------------------------------------------------- navegação
  toCell(p) {
    return [Math.floor(p.x / CELL), Math.floor(p.z / CELL)];
  }

  // Célula caminhável mais próxima (busca em espiral).
  nearestWalkable(cx, cz) {
    if (this.walkable(cx, cz)) return [cx, cz];
    for (let r = 1; r < 6; r++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          if (this.walkable(cx + dx, cz + dz)) return [cx + dx, cz + dz];
        }
      }
    }
    return [cx, cz];
  }

  // A* 8 direções sem cortar quinas. Retorna lista de pontos (mundo).
  findPath(from, to) {
    const [sx, sz] = this.nearestWalkable(...this.toCell(from));
    const [gx, gz] = this.nearestWalkable(...this.toCell(to));
    const N = W * H;
    const start = sz * W + sx;
    const goal = gz * W + gx;
    const g = new Float32Array(N).fill(Infinity);
    const came = new Int32Array(N).fill(-1);
    const closed = new Uint8Array(N);
    const heap = new MinHeap();
    g[start] = 0;
    heap.push(start, 0);
    const hfn = (i) => {
      const dx = Math.abs((i % W) - gx);
      const dz = Math.abs(((i / W) | 0) - gz);
      return Math.max(dx, dz) + 0.414 * Math.min(dx, dz);
    };
    let found = false;
    let iter = 0;
    while (heap.size && iter++ < 6000) {
      const cur = heap.pop();
      if (cur === goal) {
        found = true;
        break;
      }
      if (closed[cur]) continue;
      closed[cur] = 1;
      const x = cur % W;
      const z = (cur / W) | 0;
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dz) continue;
          const nx = x + dx;
          const nz = z + dz;
          if (!this.walkable(nx, nz)) continue;
          if (dx && dz && (!this.walkable(x + dx, z) || !this.walkable(x, z + dz))) continue;
          const ni = nz * W + nx;
          if (closed[ni]) continue;
          // custo extra perto de paredes: os bots andam pelo meio dos corredores
          let wallPen = 0;
          if (!this.walkable(nx + 1, nz) || !this.walkable(nx - 1, nz) || !this.walkable(nx, nz + 1) || !this.walkable(nx, nz - 1)) wallPen = 0.35;
          const ng = g[cur] + (dx && dz ? 1.414 : 1) + wallPen;
          if (ng < g[ni]) {
            g[ni] = ng;
            came[ni] = cur;
            heap.push(ni, ng + hfn(ni));
          }
        }
      }
    }
    if (!found) return [to.clone()];
    const cells = [];
    for (let c = goal; c !== -1; c = came[c]) cells.push(c);
    cells.reverse();
    // suavização: pula pontos enquanto houver passagem livre
    const pts = cells.map((c) => this.cellCenter(c % W, (c / W) | 0));
    const out = [];
    let i = 0;
    while (i < pts.length - 1) {
      let j = pts.length - 1;
      while (j > i + 1 && !this.walkClear(pts[i], pts[j])) j--;
      out.push(pts[j]);
      i = j;
    }
    if (out.length) out[out.length - 1] = to.clone().setY(0);
    return out;
  }

  // Passagem livre para um corpo de ~0,5 m de raio entre dois pontos do chão.
  walkClear(a, b) {
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    const steps = Math.ceil(len / 0.5);
    const px = -dz / len * 0.55;
    const pz = dx / len * 0.55;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const x = a.x + dx * t;
      const z = a.z + dz * t;
      for (const k of [-1, 0, 1]) {
        if (!this.walkable(Math.floor((x + px * k) / CELL), Math.floor((z + pz * k) / CELL))) return false;
      }
    }
    return true;
  }
}

const _v = new THREE.Vector3();

function rayBox(o, d, mn, mx, maxT) {
  let tmin = 0;
  let tmax = maxT;
  let axis = -1;
  let sign = 0;
  const oa = [o.x, o.y, o.z];
  const da = [d.x, d.y, d.z];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(da[i]) < 1e-9) {
      if (oa[i] < mn[i] || oa[i] > mx[i]) return null;
      continue;
    }
    let t1 = (mn[i] - oa[i]) / da[i];
    let t2 = (mx[i] - oa[i]) / da[i];
    let s = -1;
    if (t1 > t2) {
      [t1, t2] = [t2, t1];
      s = 1;
    }
    if (t1 > tmin) {
      tmin = t1;
      axis = i;
      sign = s;
    }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  if (axis < 0) return null; // origem dentro da caixa
  const n = new THREE.Vector3();
  n.setComponent(axis, sign);
  return { t: tmin, n };
}
export { rayBox };

class MinHeap {
  constructor() {
    this.k = [];
    this.p = [];
  }
  get size() {
    return this.k.length;
  }
  push(k, p) {
    const a = this.k;
    const b = this.p;
    a.push(k);
    b.push(p);
    let i = a.length - 1;
    while (i > 0) {
      const j = (i - 1) >> 1;
      if (b[j] <= b[i]) break;
      [a[i], a[j]] = [a[j], a[i]];
      [b[i], b[j]] = [b[j], b[i]];
      i = j;
    }
  }
  pop() {
    const a = this.k;
    const b = this.p;
    const top = a[0];
    const lk = a.pop();
    const lp = b.pop();
    if (a.length) {
      a[0] = lk;
      b[0] = lp;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && b[l] < b[m]) m = l;
        if (r < a.length && b[r] < b[m]) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m], a[i]];
        [b[i], b[m]] = [b[m], b[i]];
        i = m;
      }
    }
    return top;
  }
}

// Desenho do mapa em 2D (radar e mapa geral).
export function drawMapImage(map, px = 4) {
  const c = document.createElement('canvas');
  c.width = map.W * px;
  c.height = map.H * px;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(0,0,0,0)';
  g.clearRect(0, 0, c.width, c.height);
  for (let z = 0; z < map.H; z++) {
    for (let x = 0; x < map.W; x++) {
      if (map.isWall(x, z)) continue;
      g.fillStyle = '#b9a47a';
      g.fillRect(x * px, z * px, px, px);
    }
  }
  for (const k in map.sites) {
    const s = map.sites[k];
    const k2 = px / CELL;
    g.fillStyle = 'rgba(200,50,30,0.35)';
    g.fillRect(s.x0 * k2, s.z0 * k2, (s.x1 - s.x0) * k2, (s.z1 - s.z0) * k2);
    g.fillStyle = '#ffdfcf';
    g.font = `bold ${px * 4}px sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(k, ((s.x0 + s.x1) / 2) * k2, ((s.z0 + s.z1) / 2) * k2);
  }
  g.fillStyle = '#7d6847';
  for (const b of map.boxes) {
    const k2 = px / CELL;
    g.fillRect(b.min[0] * k2, b.min[2] * k2, (b.max[0] - b.min[0]) * k2, (b.max[2] - b.min[2]) * k2);
  }
  return c;
}
