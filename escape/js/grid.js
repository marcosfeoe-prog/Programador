// Mapa em grade: colisão, linha de visão, caminhos (BFS) e a geometria das
// paredes gerada só nas faces visíveis, com UV em coordenadas de mundo.
import * as THREE from 'three';

export const FLOOR = 0;
export const WALL = 1;
export const SOLID = 2; // bloqueia, mas é desenhado por um objeto (caixa, pilar…)
export const LOW = 3; // viga baixa: só passa agachado
export const DOOR = 4; // bloqueia enquanto a porta estiver fechada

const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

export class Grid {
  constructor(w, h, cs, fill = WALL) {
    this.w = w;
    this.h = h;
    this.cs = cs;
    this.c = new Uint8Array(w * h).fill(fill);
    this.doors = new Map();
  }

  idx(x, z) {
    return z * this.w + x;
  }
  inside(x, z) {
    return x >= 0 && z >= 0 && x < this.w && z < this.h;
  }
  get(x, z) {
    return this.inside(x, z) ? this.c[z * this.w + x] : WALL;
  }
  set(x, z, v) {
    if (this.inside(x, z)) this.c[z * this.w + x] = v;
  }
  fillRect(x0, z0, x1, z1, v) {
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) this.set(x, z, v);
  }
  cellOf(p) {
    return [Math.floor(p.x / this.cs), Math.floor(p.z / this.cs)];
  }
  center(x, z, y = 0) {
    return new THREE.Vector3((x + 0.5) * this.cs, y, (z + 0.5) * this.cs);
  }

  doorAt(x, z) {
    return this.doors.get(this.idx(x, z));
  }

  blocksPlayer(x, z, crouch) {
    const v = this.get(x, z);
    if (v === FLOOR) return false;
    if (v === LOW) return !crouch;
    if (v === DOOR) {
      const d = this.doorAt(x, z);
      return !(d && d.open && d.angle > 0.9);
    }
    return true;
  }

  walkableForEntity(x, z) {
    const v = this.get(x, z);
    if (v === DOOR) {
      const d = this.doorAt(x, z);
      return !d || !d.locked;
    }
    return v === FLOOR || v === LOW;
  }

  // Empurra um círculo (raio r) para fora das células que bloqueiam.
  collide(p, r, crouch, forEntity = false) {
    const cs = this.cs;
    for (let it = 0; it < 2; it++) {
      const x0 = Math.floor((p.x - r) / cs);
      const x1 = Math.floor((p.x + r) / cs);
      const z0 = Math.floor((p.z - r) / cs);
      const z1 = Math.floor((p.z + r) / cs);
      for (let z = z0; z <= z1; z++) {
        for (let x = x0; x <= x1; x++) {
          const blocked = forEntity ? !this.walkableForEntity(x, z) : this.blocksPlayer(x, z, crouch);
          if (!blocked) continue;
          const minX = x * cs;
          const minZ = z * cs;
          const cx = Math.max(minX, Math.min(p.x, minX + cs));
          const cz = Math.max(minZ, Math.min(p.z, minZ + cs));
          let dx = p.x - cx;
          let dz = p.z - cz;
          const d2 = dx * dx + dz * dz;
          if (d2 > r * r) continue;
          if (d2 > 1e-8) {
            const d = Math.sqrt(d2);
            p.x += (dx / d) * (r - d);
            p.z += (dz / d) * (r - d);
          } else {
            // Centro dentro da célula: sai pelo lado mais próximo.
            const pen = [p.x - minX, minX + cs - p.x, p.z - minZ, minZ + cs - p.z];
            const m = Math.min(...pen);
            if (m === pen[0]) p.x = minX - r;
            else if (m === pen[1]) p.x = minX + cs + r;
            else if (m === pen[2]) p.z = minZ - r;
            else p.z = minZ + cs + r;
          }
        }
      }
    }
  }

  // Linha de visão entre dois pontos (paredes, sólidos e portas fechadas bloqueiam).
  los(a, b) {
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const dist = Math.hypot(dx, dz);
    const steps = Math.ceil(dist / (this.cs * 0.25));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const x = Math.floor((a.x + dx * t) / this.cs);
      const z = Math.floor((a.z + dz * t) / this.cs);
      const v = this.get(x, z);
      if (v === WALL || v === SOLID) return false;
      if (v === DOOR) {
        const d = this.doorAt(x, z);
        if (!d || !d.open) return false;
      }
    }
    return true;
  }

  // Distâncias BFS a partir de uma célula. `pass(x,z)` decide o que é andável.
  bfs(sx, sz, pass) {
    const dist = new Int32Array(this.w * this.h).fill(-1);
    if (!this.inside(sx, sz)) return dist;
    const q = new Int32Array(this.w * this.h);
    let head = 0;
    let tail = 0;
    dist[this.idx(sx, sz)] = 0;
    q[tail++] = this.idx(sx, sz);
    while (head < tail) {
      const i = q[head++];
      const x = i % this.w;
      const z = (i / this.w) | 0;
      for (const [ox, oz] of DIRS) {
        const nx = x + ox;
        const nz = z + oz;
        if (!this.inside(nx, nz)) continue;
        const j = this.idx(nx, nz);
        if (dist[j] >= 0 || !pass(nx, nz)) continue;
        dist[j] = dist[i] + 1;
        q[tail++] = j;
      }
    }
    return dist;
  }

  playerPass = (x, z) => {
    const v = this.get(x, z);
    return v === FLOOR || v === LOW || v === DOOR;
  };

  // Transforma em parede todo piso que não pode ser alcançado do início.
  sealUnreachable(sx, sz) {
    const d = this.bfs(sx, sz, this.playerPass);
    for (let i = 0; i < d.length; i++) if (d[i] < 0 && this.c[i] === FLOOR) this.c[i] = WALL;
    return d;
  }

  // Próxima célula para ir de (x,z) em direção ao alvo, usando o campo BFS.
  stepToward(field, x, z) {
    let best = null;
    let bd = field[this.idx(x, z)];
    if (bd < 0) bd = 1e9;
    for (const [ox, oz] of DIRS) {
      const nx = x + ox;
      const nz = z + oz;
      if (!this.inside(nx, nz)) continue;
      const d = field[this.idx(nx, nz)];
      if (d >= 0 && d < bd) {
        bd = d;
        best = [nx, nz];
      }
    }
    return best;
  }

  floorCells(pred = (v) => v === FLOOR) {
    const out = [];
    for (let z = 0; z < this.h; z++) for (let x = 0; x < this.w; x++) if (pred(this.get(x, z), x, z)) out.push([x, z]);
    return out;
  }
}

// ---------- Geometria ----------

// Faces das paredes voltadas para células não-parede.
// opts: height, texW, texH (tamanho em metros de uma repetição da textura), isWall(v)
export function buildWalls(grid, material, opts = {}) {
  const H = opts.height ?? 3;
  const texW = opts.texW ?? 2;
  const texH = opts.texH ?? H;
  const isWall = opts.isWall ?? ((v) => v === WALL);
  const cs = grid.cs;
  const pos = [];
  const nor = [];
  const uv = [];
  const quad = (ax, az, bx, bz, nx, nz) => {
    // a → b ao longo da parede, vista de frente (normal n).
    const u0 = (nx !== 0 ? az : ax) / texW;
    const u1 = (nx !== 0 ? bz : bx) / texW;
    const v1 = H / texH;
    const verts = [
      [ax, 0, az, u0, 0],
      [bx, 0, bz, u1, 0],
      [bx, H, bz, u1, v1],
      [ax, 0, az, u0, 0],
      [bx, H, bz, u1, v1],
      [ax, H, az, u0, v1],
    ];
    for (const [x, y, z, u, v] of verts) {
      pos.push(x, y, z);
      nor.push(nx, 0, nz);
      uv.push(u, v);
    }
  };
  for (let z = 0; z < grid.h; z++) {
    for (let x = 0; x < grid.w; x++) {
      if (!isWall(grid.get(x, z))) continue;
      const x0 = x * cs;
      const z0 = z * cs;
      const x1 = x0 + cs;
      const z1 = z0 + cs;
      // Ordem dos vértices escolhida para a face olhar para fora.
      if (grid.inside(x + 1, z) && !isWall(grid.get(x + 1, z))) quad(x1, z1, x1, z0, 1, 0);
      if (grid.inside(x - 1, z) && !isWall(grid.get(x - 1, z))) quad(x0, z0, x0, z1, -1, 0);
      if (grid.inside(x, z + 1) && !isWall(grid.get(x, z + 1))) quad(x0, z1, x1, z1, 0, 1);
      if (grid.inside(x, z - 1) && !isWall(grid.get(x, z - 1))) quad(x1, z0, x0, z0, 0, -1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return new THREE.Mesh(geo, material);
}

// Lista das faces de parede (para enfeitar com canos, rodapés, etc.).
export function wallFaces(grid, isWall = (v) => v === WALL) {
  const out = [];
  for (let z = 0; z < grid.h; z++) {
    for (let x = 0; x < grid.w; x++) {
      if (!isWall(grid.get(x, z))) continue;
      for (const [ox, oz] of DIRS) {
        const nx = x + ox;
        const nz = z + oz;
        if (grid.inside(nx, nz) && grid.get(nx, nz) === FLOOR) out.push({ x, z, nx: ox, nz: oz, fx: nx, fz: nz });
      }
    }
  }
  return out;
}

export function buildPlane(grid, material, y, texSize, up = true) {
  const W = grid.w * grid.cs;
  const D = grid.h * grid.cs;
  const geo = new THREE.PlaneGeometry(W, D);
  const uvs = geo.attributes.uv;
  for (let i = 0; i < uvs.count; i++) uvs.setXY(i, (uvs.getX(i) * W) / texSize, (uvs.getY(i) * D) / texSize);
  const m = new THREE.Mesh(geo, material);
  m.rotation.x = up ? -Math.PI / 2 : Math.PI / 2;
  m.position.set(W / 2, y, D / 2);
  return m;
}

// ---------- Luzes do teto ----------
// Muitas luminárias emissivas + um pequeno conjunto de PointLights que segue
// as luminárias acesas mais próximas do jogador.

export class LampSystem {
  constructor(scene, opts) {
    this.scene = scene;
    this.lamps = [];
    this.color = new THREE.Color(opts.color ?? 0xfff3c8);
    this.intensity = opts.intensity ?? 6;
    this.range = opts.range ?? 9;
    this.y = opts.y ?? 2.95;
    this.geo = opts.geometry;
    this.mat = opts.material;
    this.poolSize = opts.pool ?? 6;
    this.pool = [];
    for (let i = 0; i < this.poolSize; i++) {
      const l = new THREE.PointLight(this.color, 0, this.range, 1.6);
      scene.add(l);
      this.pool.push(l);
    }
    this.timer = 0;
    this.master = 1;
    this.mesh = null;
    this.tmpC = new THREE.Color();
  }

  add(x, z, state = 'on') {
    this.lamps.push({ x, z, state, level: state === 'off' ? 0 : 1, flick: Math.random() * 10, rot: 0 });
  }

  finalize(rotFn) {
    const n = this.lamps.length;
    this.mesh = new THREE.InstancedMesh(this.geo, this.mat, Math.max(1, n));
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3(1, 1, 1);
    this.lamps.forEach((l, i) => {
      const rot = rotFn ? rotFn(l) : 0;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot);
      m.compose(new THREE.Vector3(l.x, this.y, l.z), q, s);
      this.mesh.setMatrixAt(i, m);
      this.mesh.setColorAt(i, this.tmpC.setScalar(l.level));
    });
    this.mesh.count = n;
    this.scene.add(this.mesh);
  }

  nearest(p, n = 1) {
    return [...this.lamps]
      .map((l) => [l, (l.x - p.x) ** 2 + (l.z - p.z) ** 2])
      .sort((a, b) => a[1] - b[1])
      .slice(0, n)
      .map((a) => a[0]);
  }

  update(dt, playerPos) {
    const t = performance.now() / 1000;
    let changed = false;
    this.lamps.forEach((l, i) => {
      let target = 1;
      if (l.state === 'off') target = 0;
      else if (l.state === 'flicker') {
        l.flick -= dt;
        if (l.flick < 0) {
          l.flick = Math.random() < 0.3 ? Math.random() * 0.12 : Math.random() * 2.5;
          l.dim = Math.random() < 0.5 ? Math.random() * 0.25 : 1;
        }
        target = l.dim ?? 1;
      } else if (l.state === 'pulse') target = 0.55 + 0.45 * Math.sin(t * 5 + l.x * 0.3);
      target *= this.master;
      if (Math.abs(target - l.level) > 0.01) {
        l.level = target;
        this.mesh.setColorAt(i, this.tmpC.setScalar(Math.max(0.05, l.level)));
        changed = true;
      }
    });
    if (changed) this.mesh.instanceColor.needsUpdate = true;
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = 0.2;
      this.near = this.lamps
        .filter((l) => l.state !== 'off')
        .map((l) => [l, (l.x - playerPos.x) ** 2 + (l.z - playerPos.z) ** 2])
        .sort((a, b) => a[1] - b[1])
        .slice(0, this.poolSize)
        .map((a) => a[0]);
    }
    this.pool.forEach((light, i) => {
      const l = this.near && this.near[i];
      if (!l) {
        light.intensity = 0;
        return;
      }
      light.position.set(l.x, this.y - 0.25, l.z);
      light.intensity = this.intensity * l.level;
    });
  }
}

// ---------- Portas articuladas ----------

export function makeDoor(scene, grid, x, z, opts) {
  const cs = grid.cs;
  // A porta fica no meio da célula, ao longo do eixo da parede.
  const alongX = opts.alongX;
  const w = cs;
  const h = opts.height ?? 2.2;
  const pivot = new THREE.Group();
  const panel = new THREE.Mesh(new THREE.BoxGeometry(w - 0.04, h, 0.08), opts.material);
  panel.position.set(w / 2, h / 2, 0);
  pivot.add(panel);
  // Maçaneta.
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), opts.knobMaterial);
  knob.position.set(w - 0.15, 1.0, 0.07);
  const knob2 = knob.clone();
  knob2.position.z = -0.07;
  pivot.add(knob, knob2);
  const c = grid.center(x, z);
  if (alongX) pivot.position.set(c.x - cs / 2, 0, c.z);
  else {
    pivot.position.set(c.x, 0, c.z + cs / 2);
    pivot.rotation.y = Math.PI / 2;
  }
  const baseRot = pivot.rotation.y;
  scene.add(pivot);
  // Verga acima da porta.
  if (opts.wallHeight > h) {
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(cs, opts.wallHeight - h, cs), opts.lintelMaterial);
    lintel.position.set(c.x, h + (opts.wallHeight - h) / 2, c.z);
    scene.add(lintel);
  }
  const door = {
    x,
    z,
    pivot,
    open: false,
    angle: 0,
    locked: !!opts.locked,
    baseRot,
    pos: c,
    update(dt) {
      const target = this.open ? 1.65 : 0;
      this.angle += (target - this.angle) * Math.min(1, dt * 4);
      this.pivot.rotation.y = this.baseRot - this.angle;
    },
  };
  grid.set(x, z, DOOR);
  grid.doors.set(grid.idx(x, z), door);
  return door;
}
