// Base dos níveis: monta faces da grade, luminárias, objetos, decalques, faz o
// bake e cria as malhas. Também cuida de lâmpadas piscando e da energia.
import * as THREE from 'three';
import { Q } from './config.js';
import { extractQuads, packCharts, quadsGeometry, baseboardGeometry, decalGeometry, GeoBuilder, K_FLOOR, K_WALL, K_CEIL, K_SOFFIT } from './build.js';
import { bake, ProbeField } from './bake.js';
import { gameMaterial, tex, LU, setProbe } from './materials.js';
import { noise1, rng as mkRng, clamp } from './util.js';

// Padrões de lâmpada com defeito.
export class Flicker {
  constructor(kind, seed) {
    this.kind = kind; // 'buzz' | 'dying' | 'rare'
    this.r = mkRng(seed);
    this.v = 1;
    this.t = 0;
    this.wait = this.r.range(1, 6);
    this.seq = [];
    this.seed = seed;
    this.changed = false;
  }
  update(dt, time) {
    const prev = this.v;
    if (this.kind === 'dying') {
      const n = noise1(time * 9, this.seed);
      const n2 = noise1(time * 31, this.seed + 7);
      this.v = n > 0.42 ? 0.85 + 0.15 * n2 : n2 > 0.6 ? 0.35 : 0.04;
    } else {
      if (this.seq.length) {
        this.t -= dt;
        if (this.t <= 0) {
          const [v, d] = this.seq.shift();
          this.v = v;
          this.t = d;
        }
      } else {
        this.v = 1;
        this.wait -= dt;
        if (this.wait <= 0) {
          const n = this.kind === 'buzz' ? this.r.int(3, 9) : this.r.int(2, 5);
          for (let i = 0; i < n; i++) {
            this.seq.push([this.r.chance(0.6) ? this.r.range(0.0, 0.15) : this.r.range(0.4, 0.8), this.r.range(0.03, 0.14)]);
            this.seq.push([1, this.r.range(0.03, 0.25)]);
          }
          if (this.kind === 'rare' && this.r.chance(0.4)) this.seq.push([0.02, this.r.range(1.5, 4)]);
          this.wait = this.kind === 'buzz' ? this.r.range(1.5, 7) : this.r.range(8, 22);
        }
      }
    }
    this.changed = Math.abs(this.v - prev) > 0.4;
    return this.v;
  }
}

export class Level {
  constructor(game, { w, h, H = 3, doorH = 2.2, seed = 1 }) {
    this.game = game;
    this.seed = seed;
    this.r = mkRng(seed);
    this.group = new THREE.Group();
    this.lights = [];
    this.fixtures = [];
    this.props = new Map();
    this.decals = new Map();
    this.interactables = [];
    this.entities = [];
    this.pickups = [];
    this.updaters = [];
    this.flick = [null, new Flicker('buzz', seed * 3 + 1), new Flicker('dying', seed * 3 + 2), new Flicker('rare', seed * 3 + 3)];
    this.flickV = [1, 1, 1, 1];
    this.power = 1;
    this.powerTarget = 1;
    this.time = 0;
    this.H = H;
    this.doorH = doorH;
    this.dims = { w, h };
    // aparência (cada nível sobrescreve)
    this.fog = { color: 0x0b0a06, density: 0.06 };
    this.grade = { exposure: 1.0, tint: [1, 1, 1], lift: [0, 0, 0], sat: 1, contrast: 1.05, bloom: 0.7, ca: 0.02, grain: 0.06 };
    this.bakeParams = {
      ambient: [0.006, 0.0055, 0.004],
      floorAlb: [0.4, 0.34, 0.2],
      wallAlb: [0.5, 0.45, 0.25],
      ind: [0.8, 1.0, 0.95],
      bounce: 0.9,
      aoK: 1.3,
      aoRays: 8,
      aoRange: 0.7,
      spread: 40,
    };
    this.panelColor = new THREE.Color(1, 0.97, 0.88);
  }

  // ----------------------------------------------------------- montagem --
  prop(key, mat) {
    if (!this.props.has(key)) this.props.set(key, { b: new GeoBuilder(), mat, vlight: mat.vlight !== false });
    return this.props.get(key).b;
  }
  decal(key, mat) {
    if (!this.decals.has(key)) this.decals.set(key, { list: [], mat });
    return this.decals.get(key).list;
  }

  light(x, y, z, I, { hx = 0.05, hz = 0.05, kind = 'panel', group = 0, radius = 9, color = this.panelColor } = {}) {
    const c = color.isColor ? [color.r, color.g, color.b] : color;
    this.lights.push({ x, y, z, I, hx, hz, kind, group, radius, c });
  }

  // Luminária embutida no forro (0,6 x 1,2 m)
  panel(x, z, { rot = false, group = 0, broken = false, I = 9, w = 0.6, d = 1.2, radius = 9 } = {}) {
    const H = this.H;
    const hx = (rot ? d : w) / 2, hz = (rot ? w : d) / 2;
    if (!broken) {
      this.light(x, H - 0.02, z, I, { hx, hz, group, radius });
      this.fixtures.push({ x, z, hx, hz, group });
    } else {
      const ob = this.prop('panelOff', { map: 'panel.jpg', color: 0x77746a, roughness: 0.45 });
      const y = H - 0.016, su = (hx * 2) / 0.6, sv = (hz * 2) / 0.6;
      ob.quad([[x - hx, y, z - hz], [x + hx, y, z - hz], [x + hx, y, z + hz], [x - hx, y, z + hz]], [0, -1, 0], [[0, 0], [su, 0], [su, sv], [0, sv]]);
    }
    const fb = this.prop('fixture', { color: 0xd8d4c8, roughness: 0.5, metalness: 0.2 });
    const t = 0.035;
    fb.box(x, H - 0.012, z - hz - t / 2, hx * 2 + t * 2, 0.024, t, { skip: 'py' });
    fb.box(x, H - 0.012, z + hz + t / 2, hx * 2 + t * 2, 0.024, t, { skip: 'py' });
    fb.box(x - hx - t / 2, H - 0.012, z, t, 0.024, hz * 2, { skip: 'py' });
    fb.box(x + hx + t / 2, H - 0.012, z, t, 0.024, hz * 2, { skip: 'py' });
  }

  async finish(onProgress = () => {}) {
    const grid = this.grid;
    grid.finalize();
    const q = Q();
    const quads = extractQuads(grid);
    const atlas = packCharts(quads, q.tpm);
    this.quads = quads;
    this.atlas = atlas;
    if (this.decorate) this.decorate(quads, atlas);
    grid.finalize(); // objetos colocados na decoração também fazem sombra
    // difusores das luminárias por grupo
    const diff = new Map();
    for (const f of this.fixtures) {
      if (!diff.has(f.group)) diff.set(f.group, new GeoBuilder());
      const b = diff.get(f.group);
      const y = this.H - 0.016;
      const P = [
        [f.x - f.hx, y, f.z - f.hz],
        [f.x + f.hx, y, f.z - f.hz],
        [f.x + f.hx, y, f.z + f.hz],
        [f.x - f.hx, y, f.z + f.hz],
      ];
      const su = f.hx * 2 / 0.6, sv = f.hz * 2 / 0.6;
      b.quad(P, [0, -1, 0], [[0, 0], [su, 0], [su, sv], [0, sv]]);
    }
    // lotes de vértices dos objetos
    const batches = [];
    const keys = [];
    for (const [k, p] of this.props) {
      if (!p.vlight || !p.b.count) continue;
      batches.push({ pos: Float32Array.from(p.b.pos), nrm: Float32Array.from(p.b.nrm) });
      keys.push(k);
    }
    const params = { ...this.bakeParams, samples: q.samples };
    const res = await bake({ grid, lights: this.lights, quads, atlas, vertBatches: batches, params, probeY: 1.1, onProgress });
    this.lm = res.lm;
    this.flickTex = res.flick;
    this.probes = new ProbeField(grid, res.probes);
    const lmOpts = { lightMap: res.lm, flickMap: res.flick };
    const s = this.surf;
    const surface = (def, kinds) => {
      const geo = quadsGeometry(quads, atlas, kinds, def.scale);
      const m = gameMaterial({
        map: def.tex ? tex(def.tex + '.jpg') : null,
        normalMap: def.tex && def.normal !== false ? tex(def.tex + '_n.jpg', { srgb: false }) : null,
        roughnessMap: def.tex && def.rough !== false ? tex(def.tex + '_r.jpg', { srgb: false }) : null,
        color: def.color ?? 0xffffff,
        roughness: def.roughness ?? 1,
        normalScale: def.normalScale ?? 0.8,
        macro: def.macro ?? 0.1,
        grime: def.grime,
        envMap: def.envMap,
        envMapIntensity: def.envMapIntensity,
        ...lmOpts,
      });
      const mesh = new THREE.Mesh(geo, m);
      mesh.matrixAutoUpdate = false;
      mesh.receiveShadow = true;
      this.group.add(mesh);
      return mesh;
    };
    this.meshFloor = surface(s.floor, [K_FLOOR]);
    this.meshWall = surface(s.wall, s.soffit ? [K_WALL] : [K_WALL, K_SOFFIT]);
    if (s.soffit) surface(s.soffit, [K_SOFFIT]);
    this.meshCeil = surface(s.ceil, [K_CEIL]);
    if (s.trim) {
      const geo = baseboardGeometry(quads, atlas, s.trim.h ?? 0.1);
      const m = gameMaterial({ color: s.trim.color, roughness: s.trim.roughness ?? 0.6, map: s.trim.tex ? tex(s.trim.tex) : null, macro: 0.08, ...lmOpts });
      const mesh = new THREE.Mesh(geo, m);
      mesh.matrixAutoUpdate = false;
      this.group.add(mesh);
    }
    // objetos com luz por vértice
    keys.forEach((k, i) => {
      const p = this.props.get(k);
      const geo = p.b.build();
      geo.setAttribute('aLight', new THREE.BufferAttribute(res.verts[i].light, 3));
      geo.setAttribute('aFlick', new THREE.BufferAttribute(res.verts[i].flick, 3));
      const mo = { ...p.mat };
      if (typeof mo.map === 'string') mo.map = tex(mo.map);
      if (typeof mo.normalMap === 'string') mo.normalMap = tex(mo.normalMap, { srgb: false });
      if (typeof mo.roughnessMap === 'string') mo.roughnessMap = tex(mo.roughnessMap, { srgb: false });
      const m = gameMaterial({ ...mo, vlight: true });
      const mesh = new THREE.Mesh(geo, m);
      mesh.matrixAutoUpdate = false;
      mesh.castShadow = !!p.mat.castShadow;
      mesh.receiveShadow = true;
      this.group.add(mesh);
      p.mesh = mesh;
    });
    // objetos sem bake (emissivos etc.)
    for (const [, p] of this.props) {
      if (p.vlight || !p.b.count) continue;
      const mo = { ...p.mat };
      if (typeof mo.map === 'string') mo.map = tex(mo.map);
      const mesh = new THREE.Mesh(p.b.build(), gameMaterial(mo));
      mesh.matrixAutoUpdate = false;
      this.group.add(mesh);
      p.mesh = mesh;
    }
    // difusores
    this.diffMats = new Map();
    for (const [g, b] of diff) {
      const on = g >= 0;
      const m = gameMaterial({
        color: on ? 0x000000 : 0x9a968a,
        roughness: 0.3,
        emissive: on ? this.panelColor : 0x000000,
        emissiveIntensity: on ? this.panelGlow ?? 7 : 0,
        emissiveMap: tex('panel.jpg'),
        map: on ? null : tex('panel.jpg'),
        emitPower: true,
      });
      const mesh = new THREE.Mesh(b.build(), m);
      mesh.matrixAutoUpdate = false;
      this.group.add(mesh);
      this.diffMats.set(g, m);
    }
    // decalques
    for (const [, d] of this.decals) {
      if (!d.list.length) continue;
      const mo = { ...d.mat };
      if (typeof mo.map === 'string') mo.map = tex(mo.map);
      if (typeof mo.normalMap === 'string') mo.normalMap = tex(mo.normalMap, { srgb: false });
      const m = gameMaterial({ transparent: true, depthWrite: false, polygonOffset: true, macro: 0, ...mo, ...lmOpts });
      const mesh = new THREE.Mesh(decalGeometry(d.list, atlas), m);
      mesh.matrixAutoUpdate = false;
      mesh.renderOrder = 1;
      this.group.add(mesh);
    }
    // sondas para objetos dinâmicos já colocados
    for (const p of this.pickups) this.lightObject(p.obj);
    this.afterBake && this.afterBake();
  }

  // Aplica a sonda de luz do lugar a todos os materiais com sonda do objeto.
  lightObject(obj, gain = 1) {
    if (!this.probes) return;
    const d = (this._pd ||= new Float32Array(18));
    obj.updateMatrixWorld(true);
    const p = new THREE.Vector3().setFromMatrixPosition(obj.matrixWorld);
    this.probes.sample(p.x, p.z, d);
    obj.traverse((o) => {
      if (o.material) for (const m of [].concat(o.material)) setProbe(m, d, gain);
    });
  }

  // ------------------------------------------------------------ execução --
  update(dt) {
    this.time += dt;
    const t = this.time;
    for (let g = 1; g < 4; g++) this.flickV[g] = this.flick[g].update(dt, t);
    this.power = clamp(this.power + Math.sign(this.powerTarget - this.power) * Math.min(Math.abs(this.powerTarget - this.power), dt * (this.powerRate || 3)), 0, 1);
    const p = this.powerOverride ?? this.power;
    LU.uPower.value = p;
    LU.uFlick.value.set(this.flickV[1], this.flickV[2], this.flickV[3]);
    if (this.diffMats)
      for (const [g, m] of this.diffMats) if (g > 0) m.emissiveIntensity = (this.panelGlow ?? 7) * this.flickV[g];
    for (const u of this.updaters) u(dt, t);
    const st = this.game.state;
    if (st === 'play' || st === 'intro' || st === 'dying') for (const e of this.entities) e.update(dt);
    for (const pk of this.pickups) if (!pk.taken && pk.spin) pk.obj.rotation.y += dt * 0.6;
  }

  // brilho local (0..~2) em um ponto, já com energia e lâmpadas piscando
  lightLevel(x, z) {
    return this.probes ? this.probes.level(x, z) * (this.powerOverride ?? this.power) : 0.5;
  }

  dispose() {
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) for (const m of [].concat(o.material)) m.dispose();
    });
    this.lm && this.lm.dispose();
    this.flickTex && this.flickTex.dispose();
    for (const e of this.entities) e.dispose && e.dispose();
  }
}
