// Objetos da planície: postes com fiação, cercas, fardos de feno, quebra-ventos
// de árvores e sítios (casa, celeiro, silos). Tudo pode ser arrancado pelo vento
// e vira destroço com física simples (arrasto, sustentação, gravidade, quique).
import * as THREE from 'three';
import { patchFog } from './atmo.js';
import { canvasTexture, makeRng } from './noise.js';
import { windField } from './tornado.js';

const EXT = 7600;
const _w = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3(1, 1, 1);
const _p = new THREE.Vector3();
const _e = new THREE.Euler();
const _ax = new THREE.Vector3();

// --- texturas de material ----------------------------------------------------
const woodTex = () => canvasTexture(128, 128, (g, w, h, rnd) => {
  g.fillStyle = '#6b5640'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 90; i++) {
    g.strokeStyle = `rgba(${40 + rnd() * 40},${30 + rnd() * 25},${20 + rnd() * 15},${0.25 + rnd() * 0.3})`;
    g.lineWidth = 1 + rnd() * 2;
    const y = rnd() * h;
    g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(w * 0.3, y + rnd() * 6 - 3, w * 0.6, y + rnd() * 6 - 3, w, y); g.stroke();
  }
});
const strawTex = () => canvasTexture(128, 128, (g, w, h, rnd) => {
  g.fillStyle = '#a58a4c'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 700; i++) {
    const c = 120 + rnd() * 90;
    g.strokeStyle = `rgba(${c},${c * 0.82},${c * 0.45},0.55)`;
    g.lineWidth = 0.6 + rnd();
    const x = rnd() * w, y = rnd() * h, a = (rnd() - 0.5) * 0.6, l = 6 + rnd() * 16;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
});
const sidingTex = (base) => canvasTexture(128, 128, (g, w, h, rnd) => {
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 8) {
    g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(0, y, w, 1.5);
    g.fillStyle = 'rgba(255,255,255,0.06)'; g.fillRect(0, y + 2, w, 1);
  }
  for (let i = 0; i < 160; i++) {
    g.fillStyle = `rgba(0,0,0,${rnd() * 0.08})`;
    g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 6, 1 + rnd() * 3);
  }
});
const metalTex = () => canvasTexture(128, 128, (g, w, h, rnd) => {
  g.fillStyle = '#8b9096'; g.fillRect(0, 0, w, h);
  for (let x = 0; x < w; x += 10) {
    g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(x, 0, 2, h);
    g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(x + 4, 0, 2, h);
  }
  for (let i = 0; i < 40; i++) {
    g.fillStyle = `rgba(110,70,40,${rnd() * 0.25})`;
    g.beginPath(); g.arc(rnd() * w, rnd() * h, 2 + rnd() * 8, 0, 7); g.fill();
  }
});

function mat(opts) {
  return patchFog(new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0, ...opts }));
}

// --- destroços ------------------------------------------------------------------
class DebrisPool {
  constructor(scene, geo, material, max, kind) {
    this.mesh = new THREE.InstancedMesh(geo, material, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.max = max;
    this.kind = kind;
    this.bodies = [];
  }
}

export class Props {
  constructor(scene, quality) {
    this.scene = scene;
    this.quality = quality;
    this.rng = makeRng(2024);
    const wood = woodTex();
    this.mats = {
      wood: mat({ map: wood, color: 0xb8a58c }),
      darkWood: mat({ map: wood, color: 0x6e5a48 }),
      straw: mat({ map: strawTex(), color: 0xffffff }),
      red: mat({ map: sidingTex('#7a2a22'), color: 0xffffff }),
      white: mat({ map: sidingTex('#c9c4b8'), color: 0xffffff }),
      metal: mat({ map: metalTex(), color: 0xffffff, metalness: 0.4, roughness: 0.55 }),
      roof: mat({ color: 0x3c3f44, roughness: 0.75 }),
      trunk: mat({ color: 0x3b3128 }),
      leaves: mat({ vertexColors: true, roughness: 1 }),
      wire: new THREE.LineBasicMaterial({ color: 0x1b1b1b }),
    };
    this.statics = []; // objetos que podem ser arrancados
    this.time = 0;
    this.buildDebrisPools();
    this.buildPowerLine();
    this.buildFences();
    this.buildBales();
    this.buildTrees();
    this.buildFarms();
  }

  buildDebrisPools() {
    const s = this.scene;
    this.pools = {
      plank: new DebrisPool(s, new THREE.BoxGeometry(2.6, 0.06, 0.25), this.mats.wood, 900, 'plank'),
      panel: new DebrisPool(s, new THREE.BoxGeometry(1.8, 0.04, 1.1), this.mats.metal, 400, 'panel'),
      redPanel: new DebrisPool(s, new THREE.BoxGeometry(1.6, 0.05, 1.2), this.mats.red, 400, 'panel'),
      bale: new DebrisPool(s, new THREE.CylinderGeometry(0.8, 0.8, 1.3, 16).rotateZ(Math.PI / 2), this.mats.straw, 700, 'bale'),
      post: new DebrisPool(s, new THREE.BoxGeometry(0.11, 1.7, 0.11), this.mats.darkWood, 400, 'post'),
      branch: new DebrisPool(s, new THREE.CylinderGeometry(0.06, 0.1, 2.2, 5), this.mats.trunk, 400, 'branch'),
    };
    this.bodies = [];
  }

  // Cria um corpo dinâmico (destroço). k = área·Cd/(2·massa) aproximado.
  spawn(poolName, pos, vel, k, size, quat) {
    const pool = this.pools[poolName];
    let idx;
    if (pool.bodies.length < pool.max) {
      idx = pool.bodies.length;
    } else {
      // recicla o destroço mais antigo parado
      idx = pool.bodies.findIndex((b) => b.sleep);
      if (idx < 0) return null;
      const old = pool.bodies[idx];
      this.bodies.splice(this.bodies.indexOf(old), 1);
    }
    const b = {
      pool, idx, pos: pos.clone(), vel: vel.clone(), k, size,
      quat: quat ? quat.clone() : new THREE.Quaternion().setFromEuler(new THREE.Euler(this.rng() * 6, this.rng() * 6, this.rng() * 6)),
      spin: new THREE.Vector3((this.rng() - 0.5) * 4, (this.rng() - 0.5) * 4, (this.rng() - 0.5) * 4),
      sleep: false, thresh: 0, maxH: pos.y, travel: 0, start: pos.clone(),
    };
    pool.bodies[idx] = b;
    pool.mesh.count = Math.max(pool.mesh.count, idx + 1);
    this.bodies.push(b);
    this.writeBody(b);
    return b;
  }

  writeBody(b) {
    _m.compose(b.pos, b.quat, _s);
    b.pool.mesh.setMatrixAt(b.idx, _m);
    b.pool.mesh.instanceMatrix.needsUpdate = true;
  }

  // --- linha de energia ao longo da estrada principal --------------------------
  buildPowerLine() {
    const spacing = 75;
    const n = Math.floor((EXT * 2) / spacing);
    const poleGeo = new THREE.CylinderGeometry(0.12, 0.17, 10, 7).translate(0, 5, 0);
    const armGeo = new THREE.BoxGeometry(2.6, 0.13, 0.13).translate(0, 9.3, 0);
    poleGeo.groups = [];
    this.poles = new THREE.InstancedMesh(poleGeo, this.mats.darkWood, n);
    this.arms = new THREE.InstancedMesh(armGeo, this.mats.darkWood, n);
    this.poleData = [];
    for (let i = 0; i < n; i++) {
      const z = -EXT + i * spacing;
      const p = { x: 9, z, tilt: 0, dir: 0, fallen: false, thresh: 52 + this.rng() * 18, idx: i };
      this.poleData.push(p);
      this.writePole(p);
    }
    this.scene.add(this.poles, this.arms);
    // fios: 3 condutores com catenária
    const segs = 10;
    const pos = new Float32Array((n - 1) * 3 * segs * 2 * 3);
    this.wireGeo = new THREE.BufferGeometry();
    this.wireGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.wireSegs = segs;
    for (let i = 0; i < n - 1; i++) this.writeSpan(i);
    const wires = new THREE.LineSegments(this.wireGeo, this.mats.wire);
    wires.frustumCulled = false;
    this.scene.add(wires);
  }

  writePole(p) {
    // tomba na direção `dir` (eixo perpendicular à queda)
    _q.setFromAxisAngle(_ax.set(Math.cos(p.dir), 0, -Math.sin(p.dir)), p.tilt);
    _m.compose(_p.set(p.x, 0, p.z), _q, _s);
    this.poles.setMatrixAt(p.idx, _m);
    this.arms.setMatrixAt(p.idx, _m);
    this.poles.instanceMatrix.needsUpdate = true;
    this.arms.instanceMatrix.needsUpdate = true;
  }

  writeSpan(i) {
    const a = this.poleData[i], b = this.poleData[i + 1];
    const arr = this.wireGeo.attributes.position.array;
    const segs = this.wireSegs;
    let o = i * 3 * segs * 6;
    const broken = a.fallen || b.fallen;
    for (let w = 0; w < 3; w++) {
      const off = (w - 1) * 1.1;
      for (let s = 0; s < segs; s++) {
        for (let e = 0; e < 2; e++) {
          const t = (s + e) / segs;
          const sag = broken ? 0 : 0.9 * 4 * t * (1 - t);
          const y = broken ? 0.05 + 0.02 * w : 9.35 - sag;
          arr[o++] = a.x + off;
          arr[o++] = y;
          arr[o++] = a.z + (b.z - a.z) * t;
        }
      }
    }
    this.wireGeo.attributes.position.needsUpdate = true;
  }

  // --- cercas de arame ao longo das estradas -------------------------------------
  buildFences() {
    const posts = [];
    const roads = [-1610, 0, 1610];
    for (const rx of roads) {
      for (const side of [-1, 1]) {
        for (let z = -4800; z < 4800; z += 5) {
          if (Math.abs(((z + 805) % 1610 + 1610) % 1610 - 805) < 12) continue; // cruzamentos
          posts.push({ x: rx + side * 6.5, z, thresh: 44 + this.rng() * 14 });
        }
      }
    }
    this.fence = new THREE.InstancedMesh(new THREE.BoxGeometry(0.1, 1.4, 0.1).translate(0, 0.7, 0), this.mats.darkWood, posts.length);
    posts.forEach((p, i) => {
      p.idx = i;
      _m.compose(_p.set(p.x, 0, p.z), _q.setFromEuler(_e.set((this.rng() - 0.5) * 0.08, 0, (this.rng() - 0.5) * 0.08)), _s);
      this.fence.setMatrixAt(i, _m);
      this.statics.push({ kind: 'fence', x: p.x, z: p.z, thresh: p.thresh, idx: i, alive: true });
    });
    this.scene.add(this.fence);
    // arame: 3 fios por lado, renderizados como linhas longas por trecho
    const wpos = [];
    for (const rx of roads) {
      for (const side of [-1, 1]) {
        for (const h of [0.55, 0.9, 1.25]) {
          for (let z = -4800; z < 4800; z += 5) {
            wpos.push(rx + side * 6.5, h, z, rx + side * 6.5, h - 0.02, z + 5);
          }
        }
      }
    }
    this.fenceWireGeo = new THREE.BufferGeometry();
    this.fenceWireGeo.setAttribute('position', new THREE.Float32BufferAttribute(wpos, 3));
    const fw = new THREE.LineSegments(this.fenceWireGeo, new THREE.LineBasicMaterial({ color: 0x2c2a27, transparent: true, opacity: 0.55 }));
    fw.frustumCulled = false;
    this.scene.add(fw);
  }

  // --- fardos redondos de feno ----------------------------------------------------
  buildBales() {
    const count = this.quality.bales;
    const cells = [];
    for (let cx = -9; cx < 9; cx++) for (let cz = -9; cz < 9; cz++) if (this.rng() < 0.33) cells.push([cx, cz]);
    for (let i = 0; i < count; i++) {
      const [cx, cz] = cells[Math.floor(this.rng() * cells.length)];
      const x = cx * 805 + 40 + this.rng() * 725;
      const z = cz * 805 + 40 + this.rng() * 725;
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.rng() * 6.28);
      const b = this.spawn('bale', new THREE.Vector3(x, 0.8, z), new THREE.Vector3(), 0.0035, 0.8, q);
      if (b) { b.sleep = true; b.thresh = 38 + this.rng() * 10; }
    }
  }

  // --- árvores: quebra-ventos e árvores isoladas -------------------------------
  buildTrees() {
    const crown = new THREE.IcosahedronGeometry(1, 3);
    const p = crown.attributes.position;
    const colors = [];
    const rnd = makeRng(9);
    const offs = [];
    for (let k = 0; k < 6; k++) offs.push([(rnd() - 0.5) * 2.5, rnd() * 1.4, (rnd() - 0.5) * 2.5, 0.8 + rnd() * 0.6, rnd() * 10]);
    // copa irregular: soma de bolhas deslocando os vértices
    for (let i = 0; i < p.count; i++) {
      _p.fromBufferAttribute(p, i);
      let r = 1;
      for (const o of offs) r += 0.18 * Math.sin(_p.x * 3 + o[4]) * Math.sin(_p.y * 2.7 + o[4] * 1.3) * Math.sin(_p.z * 3.2 + o[4] * 0.7);
      r += (rnd() - 0.5) * 0.12;
      _p.multiplyScalar(r);
      _p.y *= 0.85;
      p.setXYZ(i, _p.x * 3.4, _p.y * 3.0 + 6.2, _p.z * 3.4);
      const shade = 0.55 + 0.45 * (_p.y * 0.5 + 0.5) + (rnd() - 0.5) * 0.15;
      colors.push(0.12 * shade, 0.2 * shade, 0.07 * shade);
    }
    crown.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    crown.computeVertexNormals();
    const trunk = new THREE.CylinderGeometry(0.22, 0.38, 6.5, 7).translate(0, 3.25, 0);
    const list = [];
    // quebra-ventos: fileiras de árvores na borda norte de alguns talhões
    for (let cx = -9; cx < 9; cx++) {
      for (let cz = -9; cz < 9; cz++) {
        if (this.rng() > 0.12) continue;
        const z = cz * 805 + 14;
        const x0 = cx * 805 + 30;
        const len = 300 + this.rng() * 450;
        for (let x = x0; x < x0 + len; x += 7 + this.rng() * 4) list.push([x, z + (this.rng() - 0.5) * 3]);
      }
    }
    for (let i = 0; i < 160; i++) list.push([(this.rng() - 0.5) * EXT * 2, (this.rng() - 0.5) * EXT * 2]);
    this.treeData = list.map(([x, z], i) => ({
      x, z, idx: i, s: 0.7 + this.rng() * 0.6, rot: this.rng() * 6.28, fall: 0, fallDir: 0, alive: true,
    }));
    this.trunks = new THREE.InstancedMesh(trunk, this.mats.trunk, list.length);
    this.crowns = new THREE.InstancedMesh(crown, this.mats.leaves, list.length);
    for (const t of this.treeData) {
      this.writeTree(t);
      this.statics.push({ kind: 'tree', x: t.x, z: t.z, thresh: 50 + this.rng() * 20, tree: t, alive: true });
    }
    this.scene.add(this.trunks, this.crowns);
  }

  writeTree(t) {
    _q.setFromAxisAngle(_ax.set(0, 1, 0), t.rot);
    if (t.fall > 0) {
      const fq = new THREE.Quaternion().setFromAxisAngle(_ax.set(Math.cos(t.fallDir), 0, Math.sin(t.fallDir)), t.fall);
      _q.premultiply(fq);
    }
    _m.compose(_p.set(t.x, 0, t.z), _q, _s.set(t.s, t.s, t.s));
    this.trunks.setMatrixAt(t.idx, _m);
    if (t.stripped) _m.compose(_p.set(t.x, -100, t.z), _q, _s);
    this.crowns.setMatrixAt(t.idx, _m);
    _s.set(1, 1, 1);
    this.trunks.instanceMatrix.needsUpdate = true;
    this.crowns.instanceMatrix.needsUpdate = true;
  }

  // --- sítios: casa, celeiro, silos -------------------------------------------------
  buildFarms() {
    this.farms = [];
    const spots = [[260, 420], [-1350, 1900], [2100, -900], [-2600, -2300], [3400, 2600], [-4100, 600], [900, -3600], [4700, -2900], [-600, 4400], [5600, 900], [-5200, -4300], [2400, 5200]];
    for (const [x, z] of spots) this.farms.push(this.buildFarm(x, z));
  }

  buildFarm(x, z) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = Math.floor(this.rng() * 4) * (Math.PI / 2);
    const parts = [];
    const add = (mesh, kind, thresh, debris) => {
      g.add(mesh);
      parts.push({ mesh, kind, thresh, debris, alive: true });
      return mesh;
    };
    // casa
    const house = new THREE.Group();
    const walls = new THREE.Mesh(new THREE.BoxGeometry(12, 3.2, 9).translate(0, 1.6, 0), this.mats.white);
    const roofGeo = new THREE.CylinderGeometry(0.01, 7.4, 3.0, 4, 1).rotateY(Math.PI / 4).scale(1.25, 1, 0.95).translate(0, 4.7, 0);
    const roof = new THREE.Mesh(roofGeo, this.mats.roof);
    house.add(walls);
    add(roof, 'roof', 44 + this.rng() * 6, { pool: 'panel', n: 26 });
    add(walls, 'walls', 62 + this.rng() * 10, { pool: 'plank', n: 70 });
    // celeiro
    const barnWalls = new THREE.Mesh(new THREE.BoxGeometry(14, 6, 20).translate(28, 3, 6), this.mats.red);
    const barnRoof = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 10.5, 4.2, 4, 1).rotateY(Math.PI / 4).scale(1, 1, 1.45).translate(28, 8.1, 6), this.mats.metal);
    add(barnRoof, 'roof', 42 + this.rng() * 6, { pool: 'panel', n: 34 });
    add(barnWalls, 'walls', 58 + this.rng() * 10, { pool: 'redPanel', n: 60 });
    // silos
    for (let i = 0; i < 2; i++) {
      const sx = 46, sz = -6 + i * 8;
      const silo = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 14, 20).translate(sx, 7, sz), this.mats.metal);
      const dome = new THREE.Mesh(new THREE.SphereGeometry(3.05, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2).translate(sx, 14, sz), this.mats.metal);
      add(dome, 'roof', 52 + this.rng() * 8, { pool: 'panel', n: 10 });
      add(silo, 'silo', 66 + this.rng() * 10, { pool: 'panel', n: 40 });
    }
    this.scene.add(g);
    g.updateMatrixWorld(true);
    const farm = { group: g, parts, x, z };
    for (const p of parts) {
      p.mesh.geometry.computeBoundingBox();
      const c = p.mesh.geometry.boundingBox.getCenter(new THREE.Vector3()).applyMatrix4(g.matrixWorld);
      p.center = c;
      p.box = p.mesh.geometry.boundingBox.clone();
      this.statics.push({ kind: 'farm', x: c.x, z: c.z, thresh: p.thresh, part: p, alive: true, farm });
    }
    return farm;
  }

  // Colisores simples (cilindros) para o jogador/veículo.
  colliders() {
    if (this._col) return this._col;
    const list = [];
    for (const f of this.farms) {
      for (const p of f.parts) {
        if (p.kind === 'roof') continue;
        const size = p.box.getSize(new THREE.Vector3());
        list.push({ x: p.center.x, z: p.center.z, r: Math.max(size.x, size.z) * 0.5, part: p });
      }
    }
    for (const t of this.treeData) list.push({ x: t.x, z: t.z, r: 0.5, tree: t });
    this._col = list;
    return list;
  }

  // --- atualização: arranca objetos e simula destroços -------------------------
  update(dt, storm, time, scar, stats) {
    this.time = time;
    const tor = storm.tornado;
    if (tor && tor.contact > 0.5) {
      const reach = tor.rBot * 4 + 150;
      for (const s of this.statics) {
        if (!s.alive) continue;
        const d = tor.distanceTo(s.x, s.z, time);
        if (d > reach) continue;
        windField(storm, s.x, 3, s.z, time, _w);
        const speed = Math.hypot(_w.x, _w.z);
        if (s.kind === 'tree') {
          const t = s.tree;
          if (speed > s.thresh) {
            t.fallDir = Math.atan2(-_w.x, _w.z);
            t.falling = true;
            if (speed > s.thresh + 18 && !t.stripped) {
              t.stripped = true;
              for (let i = 0; i < 6; i++) this.spawn('branch', new THREE.Vector3(t.x, 5 + this.rng() * 4, t.z), _w.clone().multiplyScalar(0.3), 0.012, 0.3);
              stats.destroyed++;
            }
            s.alive = !t.stripped;
            if (!t.counted) { t.counted = true; stats.trees++; }
          }
        } else if (speed > s.thresh) {
          s.alive = false;
          if (s.kind === 'fence') {
            _m.compose(_p.set(0, -100, 0), _q.identity(), _s.set(1, 1, 1));
            this.fence.setMatrixAt(s.idx, _m);
            this.fence.instanceMatrix.needsUpdate = true;
            this.spawn('post', new THREE.Vector3(s.x, 0.9, s.z), _w.clone().multiplyScalar(0.2), 0.009, 0.15);
          } else if (s.kind === 'farm') {
            this.breakPart(s.part, _w);
            stats.destroyed++;
          }
        }
      }
      // postes
      for (const p of this.poleData) {
        if (p.fallen || p.falling) continue;
        if (Math.abs(p.z - tor.pos.y) > reach + 200) continue;
        const d = tor.distanceTo(p.x, p.z, time);
        if (d > reach) continue;
        windField(storm, p.x, 6, p.z, time, _w);
        if (Math.hypot(_w.x, _w.z) > p.thresh) {
          p.falling = true;
          p.dir = Math.atan2(_w.x, _w.z);
          stats.poles++;
        }
      }
    }
    // animação de quedas
    for (const p of this.poleData) {
      if (!p.falling || p.fallen) continue;
      p.tilt = Math.min(Math.PI / 2 - 0.05, p.tilt + dt * (0.4 + p.tilt * 2.2));
      if (p.tilt >= Math.PI / 2 - 0.05) {
        p.fallen = true;
        if (p.idx > 0) this.writeSpan(p.idx - 1);
        if (p.idx < this.poleData.length - 1) this.writeSpan(p.idx);
      }
      this.writePole(p);
    }
    for (const t of this.treeData) {
      if (!t.falling || t.fall >= 1.45) continue;
      t.fall = Math.min(1.45, t.fall + dt * (0.3 + t.fall * 2));
      this.writeTree(t);
    }
    this.simulate(dt, storm, time);
  }

  breakPart(part, wind) {
    part.alive = false;
    part.mesh.visible = false;
    const { pool, n } = part.debris;
    const box = part.box;
    const g = part.mesh.parent;
    for (let i = 0; i < n; i++) {
      const lp = new THREE.Vector3(
        THREE.MathUtils.lerp(box.min.x, box.max.x, this.rng()),
        THREE.MathUtils.lerp(box.min.y, box.max.y, this.rng()),
        THREE.MathUtils.lerp(box.min.z, box.max.z, this.rng())
      ).applyMatrix4(g.matrixWorld);
      const v = wind.clone().multiplyScalar(0.15 + this.rng() * 0.2);
      v.y += 3 + this.rng() * 6;
      const k = pool === 'plank' ? 0.01 : pool === 'bale' ? 0.003 : 0.016;
      this.spawn(pool, lp, v, k * (0.7 + this.rng() * 0.6), 0.2);
    }
  }

  simulate(dt, storm, time) {
    const tor = storm.tornado;
    const sub = dt > 1 / 45 ? 2 : 1;
    const h = dt / sub;
    for (const b of this.bodies) {
      if (b.sleep) {
        if (!tor || b.thresh <= 0) continue;
        if (tor.distanceTo(b.pos.x, b.pos.z, time) > tor.rBot * 4 + 120) continue;
        windField(storm, b.pos.x, b.pos.y, b.pos.z, time, _w);
        if (Math.hypot(_w.x, _w.z) < b.thresh) continue;
        b.sleep = false;
      }
      let moving = false;
      for (let s = 0; s < sub; s++) {
        windField(storm, b.pos.x, b.pos.y, b.pos.z, time, _w);
        const rx = _w.x - b.vel.x, ry = _w.y - b.vel.y, rz = _w.z - b.vel.z;
        const rel = Math.hypot(rx, ry, rz);
        // flutuação de sustentação de placas
        const lift = b.pool.kind === 'panel' ? 0.35 : 0.08;
        b.vel.x += rx * rel * b.k * h;
        b.vel.y += (ry * rel * b.k + Math.abs(rel * rel * b.k * lift) * (Math.sin(time * 3 + b.idx) * 0.5 + 0.3)) * h - 9.81 * h;
        b.vel.z += rz * rel * b.k * h;
        b.pos.addScaledVector(b.vel, h);
        const ground = b.size;
        if (b.pos.y < ground) {
          b.pos.y = ground;
          if (b.vel.y < 0) b.vel.y *= -0.25;
          b.vel.x *= 0.82;
          b.vel.z *= 0.82;
          b.spin.multiplyScalar(0.85);
        }
        const sp = b.spin.length();
        if (sp > 1e-4) {
          _q.setFromAxisAngle(_ax.copy(b.spin).divideScalar(sp), sp * h);
          b.quat.premultiply(_q);
        }
        b.spin.addScaledVector(_ax.set(rz - rx * 0.3, rx * 0.2, ry - rz * 0.2), Math.min(rel, 60) * 0.002 * h * 10);
        b.spin.multiplyScalar(1 - 0.3 * h);
        moving = moving || b.vel.lengthSq() > 0.05 || b.pos.y > ground + 0.05;
      }
      b.maxH = Math.max(b.maxH, b.pos.y);
      if (!moving) {
        windField(storm, b.pos.x, b.pos.y, b.pos.z, time, _w);
        if (Math.hypot(_w.x, _w.z) < 25) {
          b.sleep = true;
          b.thresh = 30;
          // pousa deitado
          b.vel.set(0, 0, 0);
        }
      }
      this.writeBody(b);
    }
  }
}
