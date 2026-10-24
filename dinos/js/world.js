// Mundo: relevo procedural, lagos e rio, texturas do chão misturadas por
// altura/inclinação, vegetação instanciada (coníferas, cicas, samambaias,
// arbustos com frutas), rochas, água animada e consultas espaciais.
import * as THREE from 'three';
import { makeSimplex2D, mulberry32, clamp, lerp, smoothstep, TAU } from './util.js';
import { makeTerrainSet, makeBark, makeFoliage, makeFrond, makeBerryBush, makeWaterNormal } from './textures.js';

export const WORLD_SIZE = 1100;
export const HALF = WORLD_SIZE / 2;
export const WATER_Y = 0;
export const PLAY_RADIUS = 470;

const windUniform = { value: 0 };

// Adiciona balanço de vento no vertex shader (folhagem).
function addWind(mat, amount) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uWind = windUniform;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uWind;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        {
          vec4 wp = instanceMatrix * vec4(position, 1.0);
          float k = max(position.y, 0.0) * ${amount.toFixed(4)};
          float ph = wp.x * 0.11 + wp.z * 0.07 + instanceMatrix[3][0] * 0.3;
          transformed.x += sin(uWind * 1.7 + ph) * k;
          transformed.z += cos(uWind * 1.3 + ph * 1.3) * k * 0.6;
        }`,
      );
  };
  return mat;
}

export class World {
  constructor(scene, quality, seed = 1337) {
    this.scene = scene;
    this.quality = quality;
    this.seed = seed;
    this.rng = mulberry32(seed);
    this.noise = makeSimplex2D(seed);
    this.noise2 = makeSimplex2D(seed + 1);
    this.obstacles = []; // {x, z, r}
    this.obsGrid = new Map();
    this.bushes = [];
    this.bushGrid = new Map();
    this.waterPts = [];
    this.lakes = [];
    const r = this.rng;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + r() * 0.9;
      const d = 140 + r() * 220;
      this.lakes.push({ x: Math.cos(a) * d, z: Math.sin(a) * d, r: 38 + r() * 40 });
    }
    this.buildTerrain();
    this.buildWater();
    this.buildVegetation();
  }

  // ---------------------------------------------------------------- relevo
  riverZ(x) {
    return 110 * Math.sin(x / 170 + 0.6) + 40 * Math.sin(x / 53) - 40;
  }

  heightRaw(x, z) {
    const n = this.noise;
    const n2 = this.noise2;
    let h = 7;
    h += 9 * n(x / 320, z / 320);
    h += 4.5 * n(x / 120 + 3.1, z / 120 - 1.7);
    h += 1.4 * n(x / 40, z / 40);
    h += 0.4 * n(x / 12, z / 12);
    // colinas mais altas em algumas regiões
    const hills = smoothstep(0.1, 0.7, n2(x / 400, z / 400));
    h += hills * (14 + 10 * Math.abs(n(x / 90, z / 90)));
    // lagos
    for (const L of this.lakes) {
      const d = Math.hypot(x - L.x, z - L.z) / L.r;
      const bowl = 1 - smoothstep(0.55, 1.35, d + 0.15 * n2(x / 25, z / 25));
      h = lerp(h, -3.5 + d * 2.5, bowl);
    }
    // rio
    const dr = Math.abs(z - this.riverZ(x));
    const river = 1 - smoothstep(7, 26, dr + 4 * n2(x / 30, z / 30));
    h = lerp(h, -2.2 + dr * 0.08, river);
    // montanhas nas bordas (limite do mapa)
    const rr = Math.hypot(x, z);
    const edge = smoothstep(PLAY_RADIUS - 40, HALF, rr + 25 * n(x / 80, z / 80));
    h += edge * (55 + 30 * Math.abs(n(x / 60, z / 60)));
    return h;
  }

  buildTerrain() {
    const q = this.quality;
    const N = q.terrainRes;
    this.N = N;
    this.cell = WORLD_SIZE / N;
    const V = N + 1;
    const H = new Float32Array(V * V);
    for (let j = 0; j < V; j++) {
      for (let i = 0; i < V; i++) {
        H[j * V + i] = this.heightRaw(-HALF + i * this.cell, -HALF + j * this.cell);
      }
    }
    this.H = H;

    const pos = new Float32Array(V * V * 3);
    const splat = new Float32Array(V * V * 4);
    const idx = [];
    for (let j = 0; j < V; j++) {
      for (let i = 0; i < V; i++) {
        const k = j * V + i;
        const x = -HALF + i * this.cell;
        const z = -HALF + j * this.cell;
        const h = H[k];
        pos[k * 3] = x;
        pos[k * 3 + 1] = h;
        pos[k * 3 + 2] = z;
        const hl = H[j * V + Math.max(0, i - 1)];
        const hr = H[j * V + Math.min(V - 1, i + 1)];
        const hd = H[Math.max(0, j - 1) * V + i];
        const hu = H[Math.min(V - 1, j + 1) * V + i];
        const slope = Math.hypot(hr - hl, hu - hd) / (2 * this.cell);
        const nz = this.noise2(x / 35, z / 35);
        let rock = smoothstep(0.45, 0.8, slope + nz * 0.1);
        let sand = (1 - smoothstep(0.6, 2.2, h + nz * 0.6)) * (1 - rock);
        let dirt = smoothstep(0.45, 0.85, this.noise(x / 60 + 9, z / 60) + nz * 0.2) * 0.7 * (1 - rock) * (1 - sand);
        dirt = Math.max(dirt, smoothstep(0.38, 0.55, slope) * (1 - rock) * 0.7);
        let grass = Math.max(0, 1 - rock - sand - dirt);
        const s = grass + dirt + sand + rock || 1;
        splat.set([grass / s, dirt / s, sand / s, rock / s], k * 4);
        if (i < N && j < N) {
          const a = k;
          const b = k + 1;
          const c = k + V;
          const d = k + V + 1;
          // diagonal de (i+1,j) para (i,j+1) — igual à consulta de altura
          idx.push(a, c, b, b, c, d);
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('splat', new THREE.BufferAttribute(splat, 4));
    geo.setIndex(idx);
    geo.computeVertexNormals();

    const T = makeTerrainSet(this.seed);
    this.terrainTex = T;
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0 });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.tGrass = { value: T.grass };
      sh.uniforms.tDirt = { value: T.dirt };
      sh.uniforms.tSand = { value: T.sand };
      sh.uniforms.tRock = { value: T.rock };
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec4 splat;\nvarying vec4 vSplat;\nvarying vec3 vWPos;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSplat = splat;\nvWPos = (modelMatrix * vec4(position, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader
        .replace(
          '#include <common>',
          '#include <common>\nuniform sampler2D tGrass, tDirt, tSand, tRock;\nvarying vec4 vSplat;\nvarying vec3 vWPos;',
        )
        .replace(
          '#include <map_fragment>',
          `{
            vec2 uv = vWPos.xz / 7.0;
            vec4 g = mix(texture2D(tGrass, uv), texture2D(tGrass, uv * 0.23 + 0.31), 0.45);
            vec4 d = mix(texture2D(tDirt, uv * 0.9), texture2D(tDirt, uv * 0.21), 0.4);
            vec4 s = texture2D(tSand, uv * 0.8);
            vec2 ruv = vec2(vWPos.x + vWPos.z, vWPos.y) / 9.0;
            vec4 r = mix(texture2D(tRock, uv * 0.6), texture2D(tRock, ruv), 0.5);
            vec4 w = vSplat;
            // transições com textura (menos borrado)
            float n = (g.g - 0.3) * 0.6;
            w.y = clamp(w.y + n * w.y, 0.0, 1.0);
            w /= max(dot(w, vec4(1.0)), 1e-3);
            vec4 col = g * w.x + d * w.y + s * w.z + r * w.w;
            // areia molhada perto da água
            float wet = 1.0 - smoothstep(-0.2, 0.6, vWPos.y);
            col.rgb *= mix(1.0, 0.6, wet);
            diffuseColor *= col;
          }`,
        )
        .replace(
          '#include <roughnessmap_fragment>',
          `#include <roughnessmap_fragment>
          roughnessFactor = mix(roughnessFactor, 0.35, 1.0 - smoothstep(-0.2, 0.5, vWPos.y));`,
        );
    };
    this.terrain = new THREE.Mesh(geo, mat);
    this.terrain.receiveShadow = true;
    this.scene.add(this.terrain);
  }

  // altura exata (mesma triangulação da malha)
  height(x, z) {
    const N = this.N;
    const V = N + 1;
    const fx = clamp((x + HALF) / this.cell, 0, N - 1e-4);
    const fz = clamp((z + HALF) / this.cell, 0, N - 1e-4);
    const i = Math.floor(fx);
    const j = Math.floor(fz);
    const u = fx - i;
    const v = fz - j;
    const H = this.H;
    const h00 = H[j * V + i];
    const h10 = H[j * V + i + 1];
    const h01 = H[(j + 1) * V + i];
    const h11 = H[(j + 1) * V + i + 1];
    if (u + v <= 1) return h00 + (h10 - h00) * u + (h01 - h00) * v;
    return h11 + (h01 - h11) * (1 - u) + (h10 - h11) * (1 - v);
  }

  normal(x, z, out = new THREE.Vector3()) {
    const e = 1.5;
    const hl = this.height(x - e, z);
    const hr = this.height(x + e, z);
    const hd = this.height(x, z - e);
    const hu = this.height(x, z + e);
    return out.set(hl - hr, 2 * e, hd - hu).normalize();
  }

  // ---------------------------------------------------------------- água
  buildWater() {
    const tex = makeWaterNormal(this.seed + 3);
    tex.repeat.set(90, 90);
    this.waterTex = tex;
    const mat = new THREE.MeshStandardMaterial({
      color: 0x1f4a52,
      roughness: 0.06,
      metalness: 0.1,
      transparent: true,
      opacity: 0.84,
      normalMap: tex,
      normalScale: new THREE.Vector2(0.35, 0.35),
      depthWrite: false,
    });
    const geo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, 1, 1);
    geo.rotateX(-Math.PI / 2);
    this.water = new THREE.Mesh(geo, mat);
    this.water.position.y = WATER_Y;
    this.water.renderOrder = 1;
    this.scene.add(this.water);

    // pontos de água rasa para a IA ir beber
    const step = 6;
    for (let z = -PLAY_RADIUS; z < PLAY_RADIUS; z += step) {
      for (let x = -PLAY_RADIUS; x < PLAY_RADIUS; x += step) {
        const h = this.height(x, z);
        if (h < -0.25 && h > -1.2) {
          let land = false;
          for (const [dx, dz] of [[step, 0], [-step, 0], [0, step], [0, -step]]) {
            if (this.height(x + dx, z + dz) > 0.2) land = true;
          }
          if (land && Math.hypot(x, z) < PLAY_RADIUS - 20) this.waterPts.push({ x, z });
        }
      }
    }
  }

  isWater(x, z) {
    return this.height(x, z) < WATER_Y - 0.15;
  }

  waterDepth(x, z) {
    return Math.max(0, WATER_Y - this.height(x, z));
  }

  nearestWater(x, z) {
    let best = null;
    let bd = Infinity;
    for (const p of this.waterPts) {
      const d = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    return best ? { x: best.x, z: best.z, d: Math.sqrt(bd) } : null;
  }

  // ---------------------------------------------------------------- vegetação
  okSpot(x, z, minH = 0.8, maxSlope = 0.45) {
    if (Math.hypot(x, z) > PLAY_RADIUS + 10) return false;
    const h = this.height(x, z);
    if (h < minH) return false;
    const n = this.normal(x, z);
    return 1 - n.y < maxSlope * 0.3;
  }

  addObstacle(x, z, r) {
    const o = { x, z, r };
    this.obstacles.push(o);
    const key = `${Math.floor(x / 16)},${Math.floor(z / 16)}`;
    if (!this.obsGrid.has(key)) this.obsGrid.set(key, []);
    this.obsGrid.get(key).push(o);
  }

  // empurra um círculo (x,z,r) para fora dos obstáculos; retorna o deslocamento
  collide(pos, r) {
    const cx = Math.floor(pos.x / 16);
    const cz = Math.floor(pos.z / 16);
    let hit = false;
    for (let j = -1; j <= 1; j++) {
      for (let i = -1; i <= 1; i++) {
        const list = this.obsGrid.get(`${cx + i},${cz + j}`);
        if (!list) continue;
        for (const o of list) {
          const dx = pos.x - o.x;
          const dz = pos.z - o.z;
          const d = Math.hypot(dx, dz);
          const min = r + o.r;
          if (d < min && d > 1e-4) {
            pos.x = o.x + (dx / d) * min;
            pos.z = o.z + (dz / d) * min;
            hit = true;
          }
        }
      }
    }
    return hit;
  }

  buildVegetation() {
    const q = this.quality;
    const r = this.rng;
    const forest = (x, z) => this.noise2(x / 140 + 5, z / 140 - 2) * 0.7 + this.noise(x / 50, z / 50) * 0.3;
    const dummy = new THREE.Object3D();

    // ---- materiais ----
    const bark = makeBark(this.seed + 10);
    const barkMat = new THREE.MeshStandardMaterial({ map: bark.map, normalMap: bark.normalMap, roughness: 0.95 });
    bark.map.repeat.set(2, 3);
    bark.normalMap.repeat.set(2, 3);
    const palmBark = makeBark(this.seed + 11, [0.42, 0.35, 0.24]);
    palmBark.map.repeat.set(2, 6);
    palmBark.normalMap.repeat.set(2, 6);
    const palmBarkMat = new THREE.MeshStandardMaterial({ map: palmBark.map, normalMap: palmBark.normalMap, roughness: 0.95 });
    const needles = makeFoliage(this.seed + 12);
    needles.map.repeat.set(3, 2);
    needles.normalMap.repeat.set(3, 2);
    const needleMat = addWind(
      new THREE.MeshStandardMaterial({ map: needles.map, normalMap: needles.normalMap, roughness: 0.9 }),
      0.006,
    );
    const frondTex = makeFrond(this.seed + 13);
    const frondMat = addWind(
      new THREE.MeshStandardMaterial({ map: frondTex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.85 }),
      0.04,
    );
    const fernTex = makeFrond(this.seed + 14, [0.16, 0.34, 0.08], [0.36, 0.55, 0.16]);
    const fernMat = addWind(
      new THREE.MeshStandardMaterial({ map: fernTex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.9 }),
      0.12,
    );
    const berry = makeBerryBush(this.seed + 15);
    const bushMat = addWind(new THREE.MeshStandardMaterial({ map: berry.map, normalMap: berry.normalMap, roughness: 0.85 }), 0.03);
    const rockMap = this.terrainTex.rock.clone();
    const rockNrm = this.terrainTex.rockN.clone();
    rockMap.repeat.set(3, 2);
    rockNrm.repeat.set(3, 2);
    rockMap.needsUpdate = rockNrm.needsUpdate = true;
    const rockMat = new THREE.MeshStandardMaterial({ map: rockMap, normalMap: rockNrm, roughness: 0.95 });

    // ---- geometrias ----
    const trunkGeo = new THREE.CylinderGeometry(0.16, 0.38, 12, 8, 1);
    trunkGeo.translate(0, 6, 0);
    const coneParts = [];
    for (let i = 0; i < 4; i++) {
      const g = new THREE.ConeGeometry(3.2 - i * 0.62, 4.2 - i * 0.4, 9, 1, true);
      g.translate(0, 4.5 + i * 2.3, 0);
      coneParts.push(g);
    }
    const conGeo = mergeGeos(coneParts);

    // palmeira/cica: tronco + leque de folhas curvadas
    const palmTrunk = new THREE.CylinderGeometry(0.22, 0.32, 5, 8, 4);
    palmTrunk.translate(0, 2.5, 0);
    const frondGeo = (count, len, wid, droop, y0, tilt = 0.55) => {
      const parts = [];
      for (let i = 0; i < count; i++) {
        const g = new THREE.PlaneGeometry(wid, len, 1, 6);
        g.translate(0, len / 2, 0);
        // curva a folha
        const p = g.attributes.position;
        for (let k = 0; k < p.count; k++) {
          const t = p.getY(k) / len;
          p.setZ(k, -t * t * len * droop);
        }
        g.rotateX(-Math.PI / 2 + tilt + (i % 2) * 0.15);
        g.rotateY((i / count) * TAU + (i % 3) * 0.2);
        g.translate(0, y0, 0);
        parts.push(g);
      }
      return mergeGeos(parts);
    };
    const palmCrown = frondGeo(11, 3.6, 1.3, 0.55, 5);
    const fernGeo = frondGeo(9, 1.5, 0.6, 0.35, 0.02, 1.0);
    const bushGeo = new THREE.IcosahedronGeometry(1.2, 2);
    {
      const p = bushGeo.attributes.position;
      const v = new THREE.Vector3();
      for (let k = 0; k < p.count; k++) {
        v.fromBufferAttribute(p, k);
        const s = 1 + 0.18 * Math.sin(v.x * 4.1 + v.z * 3.3) + 0.12 * Math.cos(v.y * 5.7);
        v.multiplyScalar(s);
        v.y = v.y * 0.75 + 0.75;
        p.setXYZ(k, v.x, v.y, v.z);
      }
      bushGeo.computeVertexNormals();
    }
    const rockGeo = new THREE.IcosahedronGeometry(1, 1);
    {
      const p = rockGeo.attributes.position;
      const v = new THREE.Vector3();
      for (let k = 0; k < p.count; k++) {
        v.fromBufferAttribute(p, k);
        const s = 1 + 0.25 * this.noise(v.x * 1.7 + 3, v.z * 1.7 + v.y);
        v.multiplyScalar(s);
        v.y *= 0.65;
        p.setXYZ(k, v.x, v.y, v.z);
      }
      rockGeo.computeVertexNormals();
    }

    // ---- distribuição ----
    const conifers = [];
    const palms = [];
    const ferns = [];
    const rocks = [];
    const tries = q.vegetation;
    for (let i = 0; i < tries * 1.2; i++) {
      const x = (r() * 2 - 1) * (PLAY_RADIUS + 30);
      const z = (r() * 2 - 1) * (PLAY_RADIUS + 30);
      const f = forest(x, z);
      if (f > 0.05 && r() < smoothstep(0.05, 0.45, f) && this.okSpot(x, z, 1.5, 0.6)) {
        conifers.push({ x, z, s: 0.7 + r() * 0.75, ry: r() * TAU });
      }
    }
    for (let i = 0; i < tries * 0.45; i++) {
      const x = (r() * 2 - 1) * PLAY_RADIUS;
      const z = (r() * 2 - 1) * PLAY_RADIUS;
      const h = this.height(x, z);
      const nearWater = h < 6;
      if ((nearWater || r() < 0.25) && this.okSpot(x, z, 0.9, 0.5)) palms.push({ x, z, s: 0.7 + r() * 0.7, ry: r() * TAU });
    }
    for (let i = 0; i < tries * 2.2; i++) {
      const x = (r() * 2 - 1) * PLAY_RADIUS;
      const z = (r() * 2 - 1) * PLAY_RADIUS;
      if (forest(x, z) > -0.25 && this.okSpot(x, z, 0.6, 0.7)) ferns.push({ x, z, s: 0.6 + r() * 1.0, ry: r() * TAU });
    }
    for (let i = 0; i < tries * 0.12; i++) {
      const x = (r() * 2 - 1) * PLAY_RADIUS;
      const z = (r() * 2 - 1) * PLAY_RADIUS;
      if (this.okSpot(x, z, 0.3, 1.5)) rocks.push({ x, z, s: 0.6 + r() * r() * 3.5, ry: r() * TAU });
    }
    const bushCount = q.bushes;
    for (let i = 0; i < bushCount * 6 && this.bushes.length < bushCount; i++) {
      const x = (r() * 2 - 1) * (PLAY_RADIUS - 10);
      const z = (r() * 2 - 1) * (PLAY_RADIUS - 10);
      const f = forest(x, z);
      if (f > -0.35 && f < 0.35 && this.okSpot(x, z, 1.0, 0.5)) {
        const s = 0.8 + r() * 0.6;
        this.bushes.push({ x, z, s, ry: r() * TAU, food: 60 * s, max: 60 * s, idx: this.bushes.length, dirty: false });
      }
    }

    const make = (geo, mat, list, shadow, yOff = 0, sink = 0) => {
      const m = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length));
      list.forEach((o, i) => {
        dummy.position.set(o.x, this.height(o.x, o.z) + yOff - sink * o.s, o.z);
        dummy.rotation.set(0, o.ry, 0);
        dummy.scale.setScalar(o.s);
        dummy.updateMatrix();
        m.setMatrixAt(i, dummy.matrix);
      });
      m.count = list.length;
      m.castShadow = shadow;
      m.receiveShadow = true;
      m.computeBoundingSphere();
      this.scene.add(m);
      return m;
    };
    make(trunkGeo, barkMat, conifers, true, -0.3);
    make(conGeo, needleMat, conifers, true, -0.3);
    make(palmTrunk, palmBarkMat, palms, true, -0.2);
    make(palmCrown, frondMat, palms, true, -0.2);
    make(fernGeo, fernMat, ferns, false);
    make(rockGeo, rockMat, rocks, true, 0, 0.25);
    this.bushMesh = make(bushGeo, bushMat, this.bushes, true, -0.25);

    for (const c of conifers) this.addObstacle(c.x, c.z, 0.45 * c.s);
    for (const p of palms) this.addObstacle(p.x, p.z, 0.35 * p.s);
    for (const k of rocks) if (k.s > 1.1) this.addObstacle(k.x, k.z, 0.85 * k.s);
    for (const b of this.bushes) {
      const key = `${Math.floor(b.x / 32)},${Math.floor(b.z / 32)}`;
      if (!this.bushGrid.has(key)) this.bushGrid.set(key, []);
      this.bushGrid.get(key).push(b);
    }
    this.counts = { conifers: conifers.length, palms: palms.length, ferns: ferns.length, rocks: rocks.length, bushes: this.bushes.length };
  }

  nearestBush(x, z, maxD = 60, minFood = 5) {
    let best = null;
    let bd = maxD * maxD;
    const R = Math.ceil(maxD / 32);
    const cx = Math.floor(x / 32);
    const cz = Math.floor(z / 32);
    for (let j = -R; j <= R; j++) {
      for (let i = -R; i <= R; i++) {
        const list = this.bushGrid.get(`${cx + i},${cz + j}`);
        if (!list) continue;
        for (const b of list) {
          if (b.food < minFood) continue;
          const d = (b.x - x) ** 2 + (b.z - z) ** 2;
          if (d < bd) {
            bd = d;
            best = b;
          }
        }
      }
    }
    return best;
  }

  eatBush(b, amount) {
    const got = Math.min(b.food, amount);
    b.food -= got;
    b.dirty = true;
    return got;
  }

  update(dt, time) {
    windUniform.value = time;
    this.waterTex.offset.x = time * 0.008;
    this.waterTex.offset.y = time * 0.005;
    // arbustos crescem de volta e encolhem quando comidos
    const dummy = World._dummy || (World._dummy = new THREE.Object3D());
    let changed = false;
    this._regrowT = (this._regrowT || 0) + dt;
    const regrow = this._regrowT > 1;
    for (const b of this.bushes) {
      if (regrow && b.food < b.max) {
        b.food = Math.min(b.max, b.food + 0.25 * this._regrowT);
        b.dirty = true;
      }
      if (b.dirty) {
        b.dirty = false;
        changed = true;
        const f = 0.35 + 0.65 * (b.food / b.max);
        dummy.position.set(b.x, this.height(b.x, b.z) - 0.25, b.z);
        dummy.rotation.set(0, b.ry, 0);
        dummy.scale.set(b.s * f, b.s * (0.5 + 0.5 * f), b.s * f);
        dummy.updateMatrix();
        this.bushMesh.setMatrixAt(b.idx, dummy.matrix);
      }
    }
    if (regrow) this._regrowT = 0;
    if (changed) this.bushMesh.instanceMatrix.needsUpdate = true;
  }

  // posição de terra firme aleatória (para nascer/reaparecer)
  randomLand(rnd = Math.random, minR = 0, maxR = PLAY_RADIUS - 40, minH = 1.2) {
    for (let i = 0; i < 400; i++) {
      const a = rnd() * TAU;
      const d = minR + Math.sqrt(rnd()) * (maxR - minR);
      const x = Math.cos(a) * d;
      const z = Math.sin(a) * d;
      if (this.okSpot(x, z, minH, 0.5)) return { x, z };
    }
    return { x: 0, z: 0 };
  }
}

function mergeGeos(list) {
  // junta geometrias indexadas com position/normal/uv
  let vCount = 0;
  let iCount = 0;
  for (const g of list) {
    vCount += g.attributes.position.count;
    iCount += g.index ? g.index.count : g.attributes.position.count;
  }
  const pos = new Float32Array(vCount * 3);
  const nrm = new Float32Array(vCount * 3);
  const uv = new Float32Array(vCount * 2);
  const idx = new Uint32Array(iCount);
  let vo = 0;
  let io = 0;
  for (const g of list) {
    if (!g.attributes.normal) g.computeVertexNormals();
    g.computeVertexNormals();
    pos.set(g.attributes.position.array, vo * 3);
    nrm.set(g.attributes.normal.array, vo * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, vo * 2);
    if (g.index) {
      for (let i = 0; i < g.index.count; i++) idx[io + i] = g.index.array[i] + vo;
      io += g.index.count;
    } else {
      for (let i = 0; i < g.attributes.position.count; i++) idx[io + i] = vo + i;
      io += g.attributes.position.count;
    }
    vo += g.attributes.position.count;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}
