// Terreno: uma malha distante de baixa resolução cobrindo o continente inteiro e
// blocos detalhados (2–4 m) carregados em volta do jogador pelos workers.
import * as THREE from 'three';
import { WORLD } from './data.js';
import { grassTex, rockTex, sandTex, dirtTex, snowTex, macroTex } from './textures.js';

const CH = 256;

export function makeTerrainMaterial(shared, far) {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0 });
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, shared);
    s.uniforms.uFar = { value: far ? 1 : 0 };
    s.vertexShader = s.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute vec3 aCol;
attribute vec4 aW;
varying vec3 vCol;
varying vec4 vW;
varying vec3 vWP;
varying vec3 vWN;`,
      )
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
vWP = (modelMatrix * vec4(transformed, 1.0)).xyz;
vWN = normalize(mat3(modelMatrix) * objectNormal);
vCol = aCol;
vW = aW;`,
      );
    s.fragmentShader = s.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform sampler2D tGrass;
uniform sampler2D tRock;
uniform sampler2D tSand;
uniform sampler2D tDirt;
uniform sampler2D tSnow;
uniform sampler2D tMacro;
uniform sampler2D tCov;
uniform vec4 uCovRect;
uniform float uFar;
uniform float uWet;
uniform float uSnowCover;
varying vec3 vCol;
varying vec4 vW;
varying vec3 vWP;
varying vec3 vWN;`,
      )
      .replace(
        '#include <map_fragment>',
        `
if (uFar > 0.5) {
  vec2 cuv = (vWP.xz - uCovRect.xy) / uCovRect.zw;
  if (cuv.x > 0.0 && cuv.y > 0.0 && cuv.x < 1.0 && cuv.y < 1.0 && texture2D(tCov, cuv).r > 0.5) discard;
}
vec2 uvg = vWP.xz;
float mac = texture2D(tMacro, uvg / 1100.0).r * 0.6 + texture2D(tMacro, uvg / 190.0).r * 0.4;
vec3 g1 = texture2D(tGrass, uvg / 5.0).rgb;
vec3 g2 = texture2D(tGrass, uvg / 37.0).rgb;
vec3 grass = vCol * (g1 * 0.55 + g2 * 0.45) * 2.0 * (0.72 + mac * 0.56);
vec3 an = abs(vWN);
an = pow(an, vec3(4.0));
an /= (an.x + an.y + an.z);
vec3 rk = texture2D(tRock, vWP.zy / 11.0).rgb * an.x + texture2D(tRock, vWP.xz / 11.0).rgb * an.y + texture2D(tRock, vWP.xy / 11.0).rgb * an.z;
rk *= 0.82 + mac * 0.36;
vec3 sd = texture2D(tSand, uvg / 6.0).rgb * (0.9 + mac * 0.2);
vec3 dr = texture2D(tDirt, uvg / 4.0).rgb * (0.85 + mac * 0.3);
vec3 sn = texture2D(tSnow, uvg / 8.0).rgb;
vec4 w = clamp(vW, 0.0, 1.0);
w.z = max(w.z, uSnowCover * (1.0 - w.x) * step(0.5, vWN.y));
// transições recortadas pela textura (mais naturais que um degradê)
float gl = dot(g1, vec3(0.33));
float tw = smoothstep(0.15, 0.85, w.w + (gl - 0.5) * 0.6);
vec3 col = mix(grass, dr, tw);
col = mix(col, sd, smoothstep(0.1, 0.9, w.y + (sd.r - 0.75) * 0.8));
col = mix(col, rk, smoothstep(0.2, 0.8, w.x + (dot(rk, vec3(0.33)) - 0.45) * 0.7));
col = mix(col, sn, smoothstep(0.3, 0.7, w.z + (sn.r - 0.9)));
diffuseColor.rgb *= col;
`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
roughnessFactor = mix(0.97, 0.8, w.x);
roughnessFactor = mix(roughnessFactor, 0.55, w.z);
roughnessFactor = mix(roughnessFactor, 0.45, uWet * (1.0 - w.z) * 0.8);
diffuseColor.rgb *= 1.0 - uWet * 0.25;`,
      );
  };
  m.customProgramCacheKey = () => 'terrain' + (far ? 'F' : 'N');
  return m;
}

export class Terrain {
  constructor(scene, pool, Q) {
    this.scene = scene;
    this.pool = pool;
    this.Q = Q;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.ncx = Math.ceil((WORLD.maxX - WORLD.minX) / CH);
    this.ncz = Math.ceil((WORLD.maxZ - WORLD.minZ) / CH);
    this.covData = new Uint8Array(this.ncx * this.ncz);
    this.covTex = new THREE.DataTexture(this.covData, this.ncx, this.ncz, THREE.RedFormat, THREE.UnsignedByteType);
    this.covTex.magFilter = this.covTex.minFilter = THREE.NearestFilter;
    this.covTex.unpackAlignment = 1;
    this.covTex.needsUpdate = true;
    this.shared = {
      tGrass: { value: grassTex() },
      tRock: { value: rockTex() },
      tSand: { value: sandTex() },
      tDirt: { value: dirtTex() },
      tSnow: { value: snowTex() },
      tMacro: { value: macroTex() },
      tCov: { value: this.covTex },
      uCovRect: { value: new THREE.Vector4(WORLD.minX, WORLD.minZ, this.ncx * CH, this.ncz * CH) },
      uWet: { value: 0 },
      uSnowCover: { value: 0 },
    };
    this.matNear = makeTerrainMaterial(this.shared, false);
    this.matFar = makeTerrainMaterial(this.shared, true);
    this.chunks = new Map(); // chave -> {mesh, lod, pending}
    this.center = null;
    this.covDirty = false;
  }

  static geo(g, x0, z0) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(g.pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(g.nrm, 3));
    geo.setAttribute('aCol', new THREE.BufferAttribute(g.col, 3));
    geo.setAttribute('aW', new THREE.BufferAttribute(g.wgt, 4));
    geo.setIndex(new THREE.BufferAttribute(g.idx, 1));
    geo.boundingBox = new THREE.Box3(new THREE.Vector3(0, g.hmin - 5, 0), new THREE.Vector3(g.pos[g.pos.length - 3] || 1, g.hmax + 1, g.pos[g.pos.length - 1] || 1));
    geo.computeBoundingSphere();
    return geo;
  }

  async buildFar(onProgress) {
    const res = this.Q.farRes;
    const x0 = WORLD.minX - 2000;
    const z0 = WORLD.minZ - 2000;
    const nx = Math.round((WORLD.maxX - WORLD.minX + 4000) / res);
    const nz = Math.round((WORLD.maxZ - WORLD.minZ + 4000) / res);
    // divide em faixas para paralelizar nos workers
    const strips = 4;
    const per = Math.ceil(nz / strips);
    this.far = { x0, z0, nx, nz, res, heights: new Float32Array((nx + 1) * (nz + 1)) };
    const jobs = [];
    let done = 0;
    for (let s = 0; s < strips; s++) {
      const zz = s * per;
      const n = Math.min(per, nz - zz);
      if (n <= 0) continue;
      jobs.push(
        this.pool.run({ type: 'grid', x0, z0: z0 + zz * res, nx, nz: n, res, skirt: 0 }).then((g) => {
          const H = this.far.heights;
          for (let r = 0; r <= n; r++)
            for (let c = 0; c <= nx; c++) H[(zz + r) * (nx + 1) + c] = g.pos[(r * (nx + 1) + c) * 3 + 1];
          const geo = Terrain.geo(g, x0, z0 + zz * res);
          geo.boundingBox.max.x = nx * res;
          geo.boundingBox.max.z = n * res;
          geo.computeBoundingSphere();
          const m = new THREE.Mesh(geo, this.matFar);
          m.position.set(x0, 0, z0 + zz * res);
          m.receiveShadow = false;
          m.matrixAutoUpdate = false;
          m.updateMatrix();
          this.group.add(m);
          done++;
          if (onProgress) onProgress(done / strips);
        }),
      );
    }
    await Promise.all(jobs);
  }

  key(i, j) {
    return i * 1000 + j;
  }

  update(pos, force = false) {
    const ci = Math.floor((pos.x - WORLD.minX) / CH);
    const cj = Math.floor((pos.z - WORLD.minZ) / CH);
    const ring = this.Q.chunkRing;
    const want = new Map();
    for (let dj = -ring; dj <= ring; dj++)
      for (let di = -ring; di <= ring; di++) {
        const i = ci + di;
        const j = cj + dj;
        if (i < 0 || j < 0 || i >= this.ncx || j >= this.ncz) continue;
        const d = Math.max(Math.abs(di), Math.abs(dj));
        const lod = d <= this.Q.lod0Ring ? 0 : 1;
        want.set(this.key(i, j), { i, j, lod, d });
      }
    // remove o que saiu do anel
    for (const [k, c] of this.chunks) {
      if (!want.has(k)) {
        if (c.mesh) {
          this.group.remove(c.mesh);
          c.mesh.geometry.dispose();
          this.covData[c.j * this.ncx + c.i] = 0;
          this.covDirty = true;
        }
        c.dead = true;
        this.chunks.delete(k);
      }
    }
    // pede os que faltam (mais perto primeiro), limitando os pedidos simultâneos
    const list = [...want.values()].sort((a, b) => a.d - b.d);
    for (const w of list) {
      if (this.pool.load > 6) break;
      const k = this.key(w.i, w.j);
      let c = this.chunks.get(k);
      if (c && (c.lod === w.lod || c.pendingLod === w.lod)) continue;
      if (!c) {
        c = { i: w.i, j: w.j, lod: -1, mesh: null, pendingLod: -1 };
        this.chunks.set(k, c);
      }
      if (c.pendingLod >= 0) continue;
      this.request(c, w.lod);
    }
    if (this.covDirty) {
      this.covTex.needsUpdate = true;
      this.covDirty = false;
    }
  }

  get busy() {
    for (const c of this.chunks.values()) if (c.pendingLod >= 0 || !c.mesh) return true;
    return false;
  }

  request(c, lod) {
    c.pendingLod = lod;
    const res = lod === 0 ? this.Q.lod0Res : this.Q.lod1Res;
    const n = Math.round(CH / res);
    const x0 = WORLD.minX + c.i * CH;
    const z0 = WORLD.minZ + c.j * CH;
    this.pool.run({ type: 'grid', x0, z0, nx: n, nz: n, res, skirt: lod === 0 ? 2.5 : 6 }).then((g) => {
      if (c.dead) return;
      c.pendingLod = -1;
      const geo = Terrain.geo(g);
      geo.boundingBox.max.x = CH;
      geo.boundingBox.max.z = CH;
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, this.matNear);
      mesh.position.set(x0, 0, z0);
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      if (c.mesh) {
        this.group.remove(c.mesh);
        c.mesh.geometry.dispose();
      }
      c.mesh = mesh;
      c.lod = lod;
      this.group.add(mesh);
      this.covData[c.j * this.ncx + c.i] = 255;
      this.covTex.needsUpdate = true;
    });
  }
}
