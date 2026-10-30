// Mundo: terreno procedural (colinas, rio, lagos, montanhas nas bordas),
// texturas misturadas por shader, água animada, céu com sol/lua/estrelas/
// nuvens, ciclo de dia e noite, vegetação instanciada (com vento) e fontes
// de comida e água para o sistema de sobrevivência.
import * as THREE from 'three';
import { makeNoise, rng, clamp, smoothstep, lerp, SpatialGrid } from './util.js';
import {
  terrainTextures,
  waterNormalTexture,
  barkTexture,
  frondTexture,
  needleTexture,
  grassTuftTexture,
  rockTexture,
} from './textures.js';
import { DAY_SECONDS } from './config.js';

export const HALF = 512; // o mapa vai de −512 a +512 m
export const WATER = 0;

const N = makeNoise(4242);
const N2 = makeNoise(777);
const LAKES = [
  { x: -210, z: -160, r: 85 },
  { x: 230, z: 190, r: 70 },
  { x: 140, z: -280, r: 55 },
  { x: -260, z: 260, r: 60 },
];
const riverX = (z) => 70 * Math.sin(z / 150) + 35 * Math.sin(z / 61 + 1.3) + 20;

// altura "analítica" (usada para gerar a grade)
function rawHeight(x, z) {
  let h = 5 + N.fbm(x / 230, z / 230, 5) * 18;
  const ridge = 1 - Math.abs(N2.noise(x / 160, z / 160));
  h += ridge * ridge * 9 * smoothstep(-0.1, 0.4, N.noise(x / 400 + 3, z / 400));
  // bordas viram montanhas (limite natural do mapa)
  const r = Math.max(Math.abs(x), Math.abs(z)) / HALF;
  h += smoothstep(0.72, 1.0, r) * 75 * (0.7 + 0.3 * N.noise(x / 60, z / 60));
  // rio sinuoso
  const d = Math.abs(x - riverX(z));
  const river = 1 - smoothstep(7, 30, d);
  h = lerp(h, -2.2 + 1.2 * (1 - smoothstep(0, 9, d)) * 0, river * smoothstep(0.85, 0.7, r));
  // lagos
  for (const L of LAKES) {
    const dl = Math.hypot(x - L.x, z - L.z) / L.r;
    const k = 1 - smoothstep(0.35, 1.05, dl);
    h = lerp(h, -5.5 + dl * 4, k);
  }
  return h;
}

export class World {
  constructor(scene, quality, renderer) {
    this.scene = scene;
    this.quality = quality;
    this.renderer = renderer;
    this.time = 7.5; // horas
    this.day = 1;
    this.wind = new THREE.Vector2(1, 0.3);
    this.uTime = { value: 0 };
    this.plants = [];
    this.trees = [];
    this.plantGrid = new SpatialGrid(24);
    this.treeGrid = new SpatialGrid(24);
    this.obstGrid = new SpatialGrid(16);
    this.waterGrid = new SpatialGrid(32);
    this.buildTerrain();
    this.buildWater();
    this.buildSky();
    this.buildLights();
    this.buildVegetation();
    this.buildWaterPoints();
  }

  // ------------------------------------------------------------------ terreno
  buildTerrain() {
    const S = this.quality.label === 'Baixa' ? 160 : this.quality.label === 'Média' ? 200 : 256;
    this.res = S;
    this.cell = (HALF * 2) / S;
    const H = new Float32Array((S + 1) * (S + 1));
    for (let j = 0; j <= S; j++)
      for (let i = 0; i <= S; i++) H[j * (S + 1) + i] = rawHeight(-HALF + i * this.cell, -HALF + j * this.cell);
    this.H = H;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array((S + 1) * (S + 1) * 3);
    const splat = new Float32Array((S + 1) * (S + 1) * 4);
    for (let j = 0; j <= S; j++)
      for (let i = 0; i <= S; i++) {
        const k = j * (S + 1) + i;
        const x = -HALF + i * this.cell;
        const z = -HALF + j * this.cell;
        const h = H[k];
        pos[k * 3] = x;
        pos[k * 3 + 1] = h;
        pos[k * 3 + 2] = z;
        const hx = H[j * (S + 1) + Math.min(S, i + 1)] - H[j * (S + 1) + Math.max(0, i - 1)];
        const hz = H[Math.min(S, j + 1) * (S + 1) + i] - H[Math.max(0, j - 1) * (S + 1) + i];
        const slope = Math.hypot(hx, hz) / (2 * this.cell);
        let rock = smoothstep(0.55, 0.85, slope) + smoothstep(32, 45, h);
        let sand = smoothstep(1.6, 0.4, h) * (1 - rock);
        let dirt = smoothstep(0.15, 0.45, N2.fbm(x / 50, z / 50, 3)) * 0.8 + smoothstep(0.3, 0.55, slope) * 0.5;
        if (h < -0.3) dirt += 0.6;
        let grass = Math.max(0, 1 - rock - sand - dirt);
        const sum = grass + dirt + rock + sand + 1e-5;
        splat.set([grass / sum, dirt / sum, rock / sum, sand / sum], k * 4);
      }
    const idx = [];
    for (let j = 0; j < S; j++)
      for (let i = 0; i < S; i++) {
        const a = j * (S + 1) + i;
        const b = a + S + 1;
        // mesmo corte de triângulos usado em height()
        idx.push(a, b, a + 1, a + 1, b, b + 1);
      }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('splat', new THREE.BufferAttribute(splat, 4));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const tex = terrainTextures();
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0 });
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, { tGrass: { value: tex.grass }, tDirt: { value: tex.dirt }, tRock: { value: tex.rock }, tSand: { value: tex.sand } });
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec4 splat;\nvarying vec4 vSplat;\nvarying vec3 vWP;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvSplat = splat;\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader
        .replace(
          '#include <common>',
          '#include <common>\nuniform sampler2D tGrass, tDirt, tRock, tSand;\nvarying vec4 vSplat;\nvarying vec3 vWP;',
        )
        .replace(
          '#include <map_fragment>',
          `vec2 tA = vWP.xz * 0.17;
          vec2 tB = vWP.xz * 0.021;
          vec3 cg = mix(texture2D(tGrass, tA).rgb, texture2D(tGrass, tB).rgb, 0.45);
          vec3 cd = mix(texture2D(tDirt, tA).rgb, texture2D(tDirt, tB).rgb, 0.35);
          vec3 cr = mix(texture2D(tRock, vec2(vWP.x + vWP.z * 0.7, vWP.y) * 0.09).rgb, texture2D(tRock, tB).rgb, 0.3);
          vec3 cs = texture2D(tSand, tA).rgb;
          vec4 w = vSplat;
          // quebra a transição com o próprio padrão das texturas
          w.y += (cd.r - 0.4) * 0.6 * w.y;
          w.z += (cr.r - 0.4) * 0.8 * w.z;
          w = max(w, 0.0); w /= (w.x + w.y + w.z + w.w + 1e-4);
          vec3 tcol = cg * w.x + cd * w.y + cr * w.z + cs * w.w;
          // solo molhado perto da água
          tcol *= mix(0.62, 1.0, smoothstep(-0.2, 0.9, vWP.y));
          diffuseColor.rgb *= tcol;`,
        );
    };
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    this.terrain = mesh;
    this.scene.add(mesh);
  }

  height(x, z) {
    const S = this.res;
    const fx = clamp((x + HALF) / this.cell, 0, S - 1e-4);
    const fz = clamp((z + HALF) / this.cell, 0, S - 1e-4);
    const i = Math.floor(fx);
    const j = Math.floor(fz);
    const u = fx - i;
    const v = fz - j;
    const H = this.H;
    const a = H[j * (S + 1) + i];
    const b = H[(j + 1) * (S + 1) + i];
    const c = H[j * (S + 1) + i + 1];
    const d = H[(j + 1) * (S + 1) + i + 1];
    // triângulos (a,b,c) e (c,b,d)
    if (u + v <= 1) return a + (c - a) * u + (b - a) * v;
    return d + (b - d) * (1 - u) + (c - d) * (1 - v);
  }

  slope(x, z) {
    const e = 1.5;
    return Math.hypot(this.height(x + e, z) - this.height(x - e, z), this.height(x, z + e) - this.height(x, z - e)) / (2 * e);
  }

  // ------------------------------------------------------------------ água
  buildWater() {
    const nt = waterNormalTexture();
    nt.repeat.set(60, 60);
    this.waterNormal = nt;
    const mat = new THREE.MeshStandardMaterial({
      color: 0x24525e,
      roughness: 0.06,
      metalness: 0.15,
      transparent: true,
      opacity: 0.8,
      normalMap: nt,
      normalScale: new THREE.Vector2(0.45, 0.45),
    });
    const geo = new THREE.PlaneGeometry(HALF * 2, HALF * 2, 1, 1);
    geo.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(geo, mat);
    m.position.y = WATER;
    m.renderOrder = 2;
    this.water = m;
    this.scene.add(m);
  }

  buildWaterPoints() {
    // pontos de margem (onde dá para beber) para a IA
    this.waterPoints = [];
    for (let z = -HALF + 20; z < HALF - 20; z += 5)
      for (let x = -HALF + 20; x < HALF - 20; x += 5) {
        const h = this.height(x, z);
        if (h > -0.6 && h < 0.05) {
          const p = { x, z };
          this.waterPoints.push(p);
          this.waterGrid.add(p, x, z);
        }
      }
  }

  nearestWater(x, z, r = 150) {
    let best = null;
    let bd = r * r;
    this.waterGrid.query(x, z, r, (p) => {
      const d = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (d < bd) {
        bd = d;
        best = p;
      }
    });
    return best;
  }

  // ------------------------------------------------------------------ céu
  buildSky() {
    this.skyU = {
      uTop: { value: new THREE.Color() },
      uHorizon: { value: new THREE.Color() },
      uGround: { value: new THREE.Color(0x3a3a30) },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uMoonDir: { value: new THREE.Vector3(0, -1, 0) },
      uSunColor: { value: new THREE.Color() },
      uNight: { value: 0 },
      uTime: this.uTime,
      uCloud: { value: 0.5 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.skyU,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: `varying vec3 vDir;
        void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`,
      fragmentShader: `varying vec3 vDir;
        uniform vec3 uTop, uHorizon, uGround, uSunDir, uMoonDir, uSunColor;
        uniform float uNight, uTime, uCloud;
        float hash(vec3 p){ p = fract(p*0.3183099+.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
        float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
          float a=hash(vec3(i,1.)), b=hash(vec3(i+vec2(1,0),1.)), c=hash(vec3(i+vec2(0,1),1.)), d=hash(vec3(i+vec2(1,1),1.));
          return mix(mix(a,b,f.x),mix(c,d,f.x),f.y); }
        float fbm(vec2 p){ float s=0., a=.5; for(int i=0;i<5;i++){ s+=a*vn(p); p*=2.03; a*=.5;} return s; }
        void main(){
          vec3 d = normalize(vDir);
          float h = d.y;
          vec3 col = mix(uHorizon, uTop, pow(clamp(h, 0., 1.), 0.45));
          col = mix(col, uGround, smoothstep(0.0, -0.2, h));
          float sd = max(dot(d, uSunDir), 0.);
          col += uSunColor * (pow(sd, 900.) * 40. + pow(sd, 10.) * 0.35 + pow(sd, 2.5) * 0.25 * (1. - abs(uSunDir.y)));
          // estrelas
          if (uNight > 0.01) {
            vec3 q = floor(d * 260.);
            float s = hash(q);
            float tw = 0.6 + 0.4 * sin(uTime * 2.5 + s * 60.);
            col += vec3(step(0.9972, s)) * uNight * smoothstep(0.02, 0.25, h) * tw * 1.4;
          }
          // lua
          float md = dot(d, uMoonDir);
          col += vec3(0.95, 0.95, 1.0) * smoothstep(0.99945, 0.9997, md) * (0.4 + uNight * 1.4);
          col += vec3(0.25, 0.3, 0.45) * pow(max(md, 0.), 80.) * uNight * 0.4;
          // nuvens
          if (h > 0.0) {
            vec2 cp = d.xz / (h + 0.12) * 1.6 + vec2(uTime * 0.012, uTime * 0.004);
            float c = fbm(cp);
            c = smoothstep(0.5 - uCloud * 0.25, 0.85, c) * smoothstep(0.0, 0.18, h);
            vec3 cc = mix(uHorizon * 1.05, vec3(1.0), 0.55) * (0.35 + 0.65 * (1. - uNight));
            cc += uSunColor * pow(sd, 6.) * 0.5;
            col = mix(col, cc, c * 0.85);
          }
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(1000, 32, 16), mat);
    sky.frustumCulled = false;
    sky.renderOrder = -1;
    this.sky = sky;
    this.scene.add(sky);
    // mapa de ambiente do próprio céu (reflexos na água)
    if (this.quality.label !== 'Baixa') {
      this.envScene = new THREE.Scene();
      this.envScene.add(new THREE.Mesh(sky.geometry, mat));
      this.pmrem = new THREE.PMREMGenerator(this.renderer);
      this.envT = 0;
    }
    this.scene.fog = new THREE.Fog(0x9ab0c8, 80, this.quality.view);
  }

  buildLights() {
    this.hemi = new THREE.HemisphereLight(0xbfd4ff, 0x4a4030, 0.8);
    this.scene.add(this.hemi);
    const sun = new THREE.DirectionalLight(0xffffff, 2.5);
    sun.castShadow = this.quality.shadows;
    if (sun.castShadow) {
      sun.shadow.mapSize.set(this.quality.shadowSize, this.quality.shadowSize);
      const c = sun.shadow.camera;
      c.left = c.bottom = -55;
      c.right = c.top = 55;
      c.near = 1;
      c.far = 400;
      sun.shadow.bias = -0.0006;
      sun.shadow.normalBias = 0.04;
    }
    this.sun = sun;
    this.scene.add(sun);
    this.scene.add(sun.target);
  }

  // ------------------------------------------------------------------ vegetação
  buildVegetation() {
    const q = this.quality;
    const R = rng(1234);
    const bark = barkTexture();
    const needles = needleTexture();
    // --- conífera (estilo araucária) ---
    const trunkGeo = new THREE.CylinderGeometry(0.22, 0.5, 14, 7, 1, true);
    trunkGeo.translate(0, 7, 0);
    const crown = [];
    for (let i = 0; i < 5; i++) {
      const g = new THREE.ConeGeometry(3.4 - i * 0.6, 2.8, 9, 1, false);
      g.translate(0, 6.5 + i * 1.8, 0);
      crown.push(g);
    }
    const crownGeo = mergeGeos(crown);
    // --- cicadácea / samambaia arborescente ---
    const frondT = frondTexture([62, 112, 42], true, 31);
    const cycTrunk = new THREE.CylinderGeometry(0.3, 0.42, 3.2, 7, 1, true);
    cycTrunk.translate(0, 1.6, 0);
    const cycFr = frondCluster(12, 3.4, 1.0, 3.1, 0.6);
    // --- samambaia (comestível) ---
    const fernT = frondTexture([66, 120, 38], false, 41);
    const fernGeo = frondCluster(9, 1.5, 0.45, 0.05, 0.9);

    const trunkMat = new THREE.MeshStandardMaterial({ map: bark, roughness: 0.95 });
    const crownMat = new THREE.MeshStandardMaterial({ map: needles, roughness: 0.9, color: 0xc8d8b8 });
    const frondMat = windMaterial(new THREE.MeshStandardMaterial({ map: frondT, alphaTest: 0.5, roughness: 0.8 }), this.uTime, 0.04);
    const fernMat = windMaterial(new THREE.MeshStandardMaterial({ map: fernT, alphaTest: 0.5, roughness: 0.8 }), this.uTime, 0.08);

    const okSpot = (x, z, minH = 0.9, maxSlope = 0.5) => {
      const h = this.height(x, z);
      return h > minH && h < 40 && this.slope(x, z) < maxSlope;
    };
    const forest = (x, z) => N2.fbm(x / 120 + 10, z / 120, 3);

    const conifers = [];
    const cycads = [];
    const ferns = [];
    const rocks = [];
    const nCon = Math.round(1100 * q.trees);
    const nCyc = Math.round(600 * q.trees);
    const nFern = Math.round(1500 * q.trees);
    let tries = 0;
    while (conifers.length < nCon && tries++ < nCon * 30) {
      const x = (R() * 2 - 1) * (HALF - 15);
      const z = (R() * 2 - 1) * (HALF - 15);
      if (forest(x, z) < 0.05 + R() * 0.2) continue;
      if (!okSpot(x, z, 1.2, 0.6)) continue;
      conifers.push({ x, z, s: 0.7 + R() * 0.7, r: R() * 6.28 });
    }
    tries = 0;
    while (cycads.length < nCyc && tries++ < nCyc * 30) {
      const x = (R() * 2 - 1) * (HALF - 15);
      const z = (R() * 2 - 1) * (HALF - 15);
      if (forest(x, z) < -0.15 + R() * 0.1) continue;
      if (!okSpot(x, z, 0.6, 0.5)) continue;
      cycads.push({ x, z, s: 0.7 + R() * 0.6, r: R() * 6.28 });
    }
    tries = 0;
    while (ferns.length < nFern && tries++ < nFern * 30) {
      const x = (R() * 2 - 1) * (HALF - 15);
      const z = (R() * 2 - 1) * (HALF - 15);
      if (forest(x, z) < -0.3 + R() * 0.35) continue;
      if (!okSpot(x, z, 0.5, 0.55)) continue;
      ferns.push({ x, z, s: 0.8 + R() * 0.7, r: R() * 6.28 });
    }
    const nRock = Math.round(320 * q.trees);
    for (let i = 0; i < nRock; i++) {
      const x = (R() * 2 - 1) * (HALF - 10);
      const z = (R() * 2 - 1) * (HALF - 10);
      const h = this.height(x, z);
      if (h < -1) continue;
      rocks.push({ x, z, s: 0.5 + Math.pow(R(), 3) * 4, r: R() * 6.28, t: R() * 3 });
    }

    // instâncias em blocos (para recorte por frustum)
    this.chunks = [];
    this.addInstanced(conifers, [
      { geo: trunkGeo, mat: trunkMat, shadow: true },
      { geo: crownGeo, mat: crownMat, shadow: true },
    ]);
    this.addInstanced(cycads, [
      { geo: cycTrunk, mat: trunkMat, shadow: true },
      { geo: cycFr, mat: frondMat, shadow: false },
    ]);
    const fernParts = this.addInstanced(ferns, [{ geo: fernGeo, mat: fernMat, shadow: false }]);
    void fernParts;
    const rockGeo = new THREE.IcosahedronGeometry(1, 2);
    {
      const p = rockGeo.attributes.position;
      const v = new THREE.Vector3();
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i);
        const k = 1 + N.noise(v.x * 1.7 + 5, v.y * 1.7 + v.z) * 0.35;
        v.multiplyScalar(k);
        v.y *= 0.65;
        p.setXYZ(i, v.x, v.y, v.z);
      }
      rockGeo.computeVertexNormals();
    }
    const rockMat = new THREE.MeshStandardMaterial({ map: rockTexture(), roughness: 0.92 });
    this.addInstanced(rocks, [{ geo: rockGeo, mat: rockMat, shadow: true, sink: 0.25 }]);

    // fontes de comida e obstáculos
    for (const t of conifers) {
      const o = { x: t.x, z: t.z, r: 0.45 * t.s, kind: 'tree' };
      this.obstGrid.add(o, t.x, t.z);
      const f = { x: t.x, z: t.z, food: 100, max: 100, type: 'tree', item: t };
      this.trees.push(f);
      this.treeGrid.add(f, t.x, t.z);
    }
    for (const t of cycads) this.obstGrid.add({ x: t.x, z: t.z, r: 0.38 * t.s, kind: 'tree' }, t.x, t.z);
    for (const r of rocks) if (r.s > 1.2) this.obstGrid.add({ x: r.x, z: r.z, r: r.s * 0.85, kind: 'rock' }, r.x, r.z);
    for (const f of ferns) {
      const p = { x: f.x, z: f.z, food: 100, max: 100 * f.s, type: 'plant', item: f, regrow: 0 };
      p.food = p.max;
      this.plants.push(p);
      this.plantGrid.add(p, f.x, f.z);
    }

    // grama em tufos (com vento)
    const grassMat = windMaterial(
      new THREE.MeshStandardMaterial({ map: grassTuftTexture(), alphaTest: 0.45, roughness: 0.9, color: 0xd8e8b0 }),
      this.uTime,
      0.16,
    );
    const tuft = new THREE.PlaneGeometry(1.1, 0.8);
    tuft.translate(0, 0.38, 0);
    const t2 = tuft.clone().rotateY(Math.PI / 2);
    const tuftGeo = twoSided(upNormals(mergeGeos([tuft, t2]), 1));
    const tufts = [];
    tries = 0;
    while (tufts.length < q.grass && tries++ < q.grass * 10) {
      const x = (R() * 2 - 1) * (HALF - 20);
      const z = (R() * 2 - 1) * (HALF - 20);
      const h = this.height(x, z);
      if (h < 0.8 || h > 30 || this.slope(x, z) > 0.45) continue;
      if (N2.fbm(x / 40, z / 40, 2) < -0.2) continue;
      tufts.push({ x, z, s: 0.7 + R() * 0.9, r: R() * 6.28 });
    }
    this.addInstanced(tufts, [{ geo: tuftGeo, mat: grassMat, shadow: false, far: 140 }]);
  }

  // distribui itens em blocos de 128 m, cada bloco é um InstancedMesh
  addInstanced(items, parts) {
    const CH = 128;
    const groups = new Map();
    for (const it of items) {
      const k = Math.floor((it.x + HALF) / CH) + ',' + Math.floor((it.z + HALF) / CH);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(it);
    }
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    for (const [, list] of groups) {
      const meshes = parts.map((pt) => {
        const im = new THREE.InstancedMesh(pt.geo, pt.mat, list.length);
        im.castShadow = pt.shadow && this.quality.shadows;
        im.receiveShadow = true;
        return im;
      });
      let cx = 0;
      let cz = 0;
      list.forEach((it, i) => {
        q.setFromAxisAngle(up, it.r);
        s.setScalar(it.s);
        const sink = (parts[0].sink || 0) * it.s;
        p.set(it.x, this.height(it.x, it.z) - 0.15 - sink, it.z);
        m.compose(p, q, s);
        for (const im of meshes) im.setMatrixAt(i, m);
        it.meshes = meshes;
        it.index = i;
        cx += it.x;
        cz += it.z;
      });
      cx /= list.length;
      cz /= list.length;
      for (const im of meshes) {
        im.computeBoundingSphere();
        this.scene.add(im);
        this.chunks.push({ mesh: im, x: cx, z: cz, far: parts.find((pp) => pp.mat === im.material).far || 0 });
      }
    }
  }

  // planta comida: encolhe; volta a crescer com o tempo
  setPlantScale(p, k) {
    const it = p.item;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), it.r);
    const s = new THREE.Vector3().setScalar(it.s * k);
    m.compose(new THREE.Vector3(it.x, this.height(it.x, it.z) - 0.15, it.z), q, s);
    for (const im of it.meshes) {
      im.setMatrixAt(it.index, m);
      im.instanceMatrix.needsUpdate = true;
    }
  }

  consumePlant(p, amount) {
    const got = Math.min(p.food, amount);
    p.food -= got;
    if (p.type === 'plant') this.setPlantScale(p, 0.3 + 0.7 * (p.food / p.max));
    return got;
  }

  nearestFood(x, z, r, type = 'plant', pred = null) {
    const grid = type === 'tree' ? this.treeGrid : this.plantGrid;
    let best = null;
    let bd = r * r;
    grid.query(x, z, r, (p) => {
      if (p.food < 15) return;
      if (pred && !pred(p)) return;
      const d = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (d < bd) {
        bd = d;
        best = p;
      }
    });
    return best;
  }

  // empurra um círculo para fora de troncos e rochas
  collide(pos, radius) {
    let hit = false;
    this.obstGrid.query(pos.x, pos.z, radius + 4, (o) => {
      // dinossauros grandes passam por cima de pedras pequenas
      if (o.kind === 'rock' && o.r < radius * 0.35) return;
      const dx = pos.x - o.x;
      const dz = pos.z - o.z;
      const min = radius * 0.6 + o.r;
      const d2 = dx * dx + dz * dz;
      if (d2 < min * min && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        pos.x += (dx / d) * (min - d);
        pos.z += (dz / d) * (min - d);
        hit = true;
      }
    });
    const lim = HALF - 8;
    pos.x = clamp(pos.x, -lim, lim);
    pos.z = clamp(pos.z, -lim, lim);
    return hit;
  }

  // ------------------------------------------------------------------ tempo
  get isNight() {
    return this.time < 5.5 || this.time > 19;
  }

  timeString() {
    const h = Math.floor(this.time);
    const m = Math.floor((this.time - h) * 60);
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
  }

  update(dt, camera, focus, timeScale = 1) {
    this.uTime.value += dt;
    this.time += (dt * 24 * timeScale) / DAY_SECONDS;
    if (this.time >= 24) {
      this.time -= 24;
      this.day++;
    }
    // sol: nasce às 6 h, se põe às 18 h
    const a = ((this.time - 6) / 24) * Math.PI * 2;
    const sunDir = new THREE.Vector3(Math.cos(a) * 0.85, Math.sin(a), 0.35).normalize();
    const elev = sunDir.y;
    const moonDir = sunDir.clone().negate();
    moonDir.z = 0.3;
    moonDir.normalize();
    const day = smoothstep(-0.08, 0.25, elev);
    const twi = Math.max(0, 1 - Math.abs(elev) / 0.22) * smoothstep(-0.25, -0.05, elev);
    const night = 1 - smoothstep(-0.2, 0.02, elev);
    const U = this.skyU;
    const cTop = new THREE.Color(0x061026).lerp(new THREE.Color(0x3a74c4), day);
    const cHor = new THREE.Color(0x0e1830).lerp(new THREE.Color(0xa9c6e2), day).lerp(new THREE.Color(0xe88a4e), twi * 0.75);
    U.uTop.value.copy(cTop);
    U.uHorizon.value.copy(cHor);
    U.uSunDir.value.copy(sunDir);
    U.uMoonDir.value.copy(moonDir);
    U.uSunColor.value.set(0xfff0d8).lerp(new THREE.Color(0xff8a40), twi);
    U.uNight.value = night;
    U.uCloud.value = 0.55 + 0.25 * Math.sin(this.day * 1.7 + this.time * 0.1);
    this.sky.position.copy(camera.position);

    // luzes
    const sunUp = elev > -0.05;
    const ld = sunUp ? sunDir : moonDir;
    this.sun.color.copy(sunUp ? U.uSunColor.value : new THREE.Color(0x8ea4d8));
    this.sun.intensity = sunUp ? 0.3 + 2.6 * smoothstep(-0.05, 0.3, elev) : 0.35 * smoothstep(0.0, 0.3, moonDir.y);
    this.hemi.color.copy(cTop).lerp(new THREE.Color(0xffffff), 0.35);
    this.hemi.groundColor.set(0x3a3020).multiplyScalar(0.4 + 0.6 * day);
    this.hemi.intensity = 0.25 + 0.75 * day;
    // a sombra acompanha o foco, alinhada à grade de texels
    const t = focus.clone();
    const snap = 110 / this.quality.shadowSize;
    t.x = Math.round(t.x / snap) * snap;
    t.z = Math.round(t.z / snap) * snap;
    this.sun.target.position.copy(t);
    this.sun.position.copy(t).addScaledVector(ld, 180);

    const fogC = cHor.clone().lerp(new THREE.Color(0x7a8c9a), 0.25 * day);
    this.scene.fog.color.copy(fogC);
    this.renderer.setClearColor(fogC);

    if (this.pmrem) {
      this.envT -= dt;
      if (this.envT <= 0) {
        this.envT = 6;
        const rt = this.pmrem.fromScene(this.envScene, 0, 1, 1100);
        if (this.envRT) this.envRT.dispose();
        this.envRT = rt;
        const wm = this.water.material;
        if (!wm.envMap) {
          wm.envMap = rt.texture;
          wm.needsUpdate = true;
        } else wm.envMap = rt.texture;
      }
    }
    this.waterNormal.offset.set(this.uTime.value * 0.004, this.uTime.value * 0.0025);
    this.water.material.color.set(0x24525e).multiplyScalar(0.25 + 0.75 * day);

    // recorte por distância dos blocos de vegetação
    const cx = camera.position.x;
    const cz = camera.position.z;
    const vd = this.quality.view + 60;
    for (const c of this.chunks) {
      const d = Math.hypot(c.x - cx, c.z - cz);
      c.mesh.visible = c.far ? d < c.far + 90 : d < vd;
    }

    // plantas voltam a crescer
    this._regrowT = (this._regrowT || 0) + dt;
    if (this._regrowT > 2) {
      const k = this._regrowT;
      this._regrowT = 0;
      for (const p of this.plants) {
        if (p.food < p.max) {
          p.food = Math.min(p.max, p.food + k * 0.5);
          this.setPlantScale(p, 0.3 + 0.7 * (p.food / p.max));
        }
      }
      for (const tr of this.trees) tr.food = Math.min(tr.max, tr.food + k * 0.4);
    }
    return { day, night, elev };
  }
}

// ------------------------------------------------------------------ helpers
function mergeGeos(list) {
  const pos = [];
  const nor = [];
  const uv = [];
  const idx = [];
  let off = 0;
  for (const g0 of list) {
    const g = g0.index ? g0 : g0;
    const p = g.attributes.position;
    pos.push(...p.array);
    nor.push(...g.attributes.normal.array);
    uv.push(...g.attributes.uv.array);
    if (g.index) for (const i of g.index.array) idx.push(i + off);
    else for (let i = 0; i < p.count; i++) idx.push(i + off);
    off += p.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  out.setIndex(idx);
  return out;
}

// folhas arqueadas saindo de um ponto (samambaia / cicadácea)
function frondCluster(n, len, width, baseY, droop) {
  const parts = [];
  for (let i = 0; i < n; i++) {
    const g = new THREE.PlaneGeometry(width, len, 1, 6);
    g.translate(0, len / 2, 0);
    const p = g.attributes.position;
    const up = 0.9 - (i % 3) * 0.25;
    for (let k = 0; k < p.count; k++) {
      const y = p.getY(k);
      const t = y / len;
      // levanta e depois cai (arco)
      const zz = y * Math.cos(up);
      const yy = y * Math.sin(up) - droop * len * t * t;
      p.setXYZ(k, p.getX(k), yy + baseY, zz);
    }
    g.rotateY((i / n) * Math.PI * 2 + i * 0.37);
    parts.push(g);
  }
  return twoSided(upNormals(mergeGeos(parts)));
}

// duplica os triângulos com ordem invertida (face de trás com a mesma normal),
// assim a folha não depende do gl_FrontFacing e não fica preta vista por trás
function twoSided(g) {
  const idx = g.index.array;
  const out = Array.from(idx);
  for (let i = 0; i < idx.length; i += 3) out.push(idx[i], idx[i + 2], idx[i + 1]);
  g.setIndex(out);
  return g;
}

// folhagem fina fica escura vista de baixo; normais "para cima" a iluminam por igual
function upNormals(g, k = 0.85) {
  const n = g.attributes.normal;
  for (let i = 0; i < n.count; i++) {
    const x = n.getX(i) * (1 - k);
    const z = n.getZ(i) * (1 - k);
    const l = Math.hypot(x, k, z);
    n.setXYZ(i, x / l, k / l, z / l);
  }
  return g;
}

// balanço de vento no vertex shader (proporcional à altura do vértice)
function windMaterial(mat, uTime, amp) {
  mat.customProgramCacheKey = () => 'vento' + amp;
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        {
          vec3 ip = vec3(0.0);
          #ifdef USE_INSTANCING
            ip = instanceMatrix[3].xyz;
          #endif
          float hh = max(position.y, 0.0);
          float w = sin(uTime * 1.6 + ip.x * 0.21 + ip.z * 0.17) + 0.5 * sin(uTime * 3.7 + ip.x * 0.5);
          transformed.x += w * ${amp.toFixed(3)} * hh * hh;
          transformed.z += w * ${(amp * 0.6).toFixed(3)} * hh * hh;
        }`,
      );
  };
  return mat;
}
