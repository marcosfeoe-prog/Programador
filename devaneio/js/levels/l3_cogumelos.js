// Nível III — o bosque dos cogumelos: cogumelos gigantes cor-de-rosa com pintas,
// névoa rosada, samambaias, uma trilha de pedras e esporos flutuando.
import * as THREE from 'three';
import { Level } from '../game/level.js';
import { Grass, makeMask, makeHeightMap } from '../engine/grass.js';
import { groundMaterial, foliageMaterial, blobMaterial, std, additive, sphericalNormals } from '../engine/materials.js';
import { ground, merge, tf, lathe, cylinder } from '../engine/geo.js';
import * as TX from '../engine/textures.js';
import { fbm, rng, smooth } from '../engine/noise.js';
import { injectAtmo } from '../engine/atmosphere.js';
import { instanced, rockGeometry, heightfield } from './util.js';

export const META = {
  id: 'cogumelos',
  numeral: 'III',
  name: 'o bosque dos cogumelos',
  line: 'tudo é macio. tudo é rosa.',
};

const SPOTS_GLSL = /* glsl */ `
vec3 sHash3(vec3 p) {
  p = vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6)));
  return fract(sin(p) * 43758.5453123);
}
float spots(vec3 p, float scale, float size) {
  vec3 q = p * scale;
  vec3 i = floor(q), f = fract(q);
  float best = 9.0;
  float rr = 1.0;
  for (int z = -1; z <= 1; z++)
  for (int y = -1; y <= 1; y++)
  for (int x = -1; x <= 1; x++) {
    vec3 g = vec3(float(x), float(y), float(z));
    vec3 h = sHash3(i + g);
    vec3 d = g + h - f;
    float dd = dot(d, d);
    if (dd < best) { best = dd; rr = 0.55 + 0.8 * h.x; }
  }
  return 1.0 - smoothstep(size * rr * 0.75, size * rr, sqrt(best));
}
`;

function capMaterial(color, spotColor, scale, size) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.42, metalness: 0 });
  m.onBeforeCompile = (sh) => {
    injectAtmo(sh);
    sh.uniforms.uSpot = { value: new THREE.Color(spotColor) };
    sh.uniforms.uSpotP = { value: new THREE.Vector2(scale, size) };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObj;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObj = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObj;\nuniform vec3 uSpot;\nuniform vec2 uSpotP;\n' + SPOTS_GLSL)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
  float sp = spots(normalize(vObj + vec3(0.0, 0.3, 0.0)) * 3.0, uSpotP.x, uSpotP.y) * smoothstep(0.05, 0.3, vObj.y + 0.2);
  diffuseColor.rgb = mix(diffuseColor.rgb, uSpot, sp);
  diffuseColor.rgb *= 0.92 + 0.12 * vObj.y;`
      );
  };
  m.customProgramCacheKey = () => 'mushcap';
  return m;
}

function gillMaterial(color) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.8, side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => {
    injectAtmo(sh);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObj;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObj = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObj;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
  float ang = atan(vObj.z, vObj.x);
  float g = 0.5 + 0.5 * sin(ang * 140.0);
  diffuseColor.rgb *= 0.78 + 0.22 * g;
  diffuseColor.rgb *= 0.7 + 0.3 * smoothstep(0.0, 1.0, length(vObj.xz));`
      );
  };
  m.customProgramCacheKey = () => 'mushgill';
  return m;
}

// Molde de cogumelo (unidades: altura do caule = 1). Devolve caule, chapéu e lamelas.
function mushroomTemplate(rand, { stemR = 0.09, capR = 0.48, capH = 0.28, flat = 0.5, bend = 0.06 } = {}) {
  const prof = [
    [0.0, 0.0],
    [stemR * 1.5, 0.0],
    [stemR * 1.55, 0.03],
    [stemR * 1.2, 0.1],
    [stemR * 1.02, 0.35],
    [stemR * 0.92, 0.7],
    [stemR * 0.95, 0.86],
    [stemR * 1.38, 0.875],
    [stemR * 1.22, 0.89],
    [stemR * 0.95, 0.9],
    [stemR * 0.85, 1.02],
  ];
  const stem = lathe(prof, 18);
  // curvatura leve do caule
  const sp = stem.attributes.position;
  for (let i = 0; i < sp.count; i++) {
    const y = sp.getY(i);
    sp.setX(i, sp.getX(i) + bend * y * y);
  }
  stem.computeVertexNormals();
  // chapéu: domo com borda que se curva para baixo
  const cap = [];
  const N = 14;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const a = t * Math.PI * 0.5;
    const r = capR * Math.sin(a) * (1 + 0.04 * Math.sin(t * Math.PI));
    const y = 1.0 + capH * Math.pow(Math.cos(a), 1 + flat);
    cap.push([r, y]);
  }
  cap.push([capR * 1.0, 0.985]);
  cap.push([capR * 0.96, 0.96]);
  // lathe espera o perfil de baixo para cima; invertendo para normais para fora
  const capGeo = lathe(cap.reverse().map(([r, y]) => [Math.max(r, 0.0001), y]), 32);
  const capP = capGeo.attributes.position;
  for (let i = 0; i < capP.count; i++) capP.setX(i, capP.getX(i) + bend);
  capGeo.computeVertexNormals();
  const gill = new THREE.RingGeometry(stemR * 0.9, capR * 0.965, 40, 1);
  gill.rotateX(Math.PI / 2);
  tf(gill, [bend, 0.965, 0]);
  return { stem, cap: capGeo, gill };
}

export class Level3 extends Level {
  heightAt(x, z) {
    const n = fbm(x * 0.035 + 2.0, z * 0.035 + 9.0, 3, 41) - 0.5;
    const pathD = this.pathDist ? this.pathDist(x, z) : 10;
    return n * 1.5 * smooth(1, 6, pathD) + n * 0.4;
  }

  surfaceAt(x, z) {
    return this.pathDist && this.pathDist(x, z) < 0.9 ? 'stone' : 'forest';
  }

  build() {
    const q = this.ctx.quality;
    const rand = rng(303);
    this.spawn = { x: 0, z: 2, yaw: 0 };
    this.bounds = { x: 0, z: -60, r: 160 };
    this.titleCam = { from: [0.4, 1.5, 4], to: [-0.6, 1.6, -12], yaw: 0.08, pitch: 0.12, dur: 90 };
    this.env = {
      sky: {
        zenith: '#fbd2e6',
        horizon: '#fde6f0',
        ground: '#d8b0c4',
        horizonSun: '#fff0f4',
        horizonSunAmt: 0.3,
        skyExp: 0.6,
        sunElev: 62,
        sunAzim: -25,
        sunColor: '#fff4f8',
        sunGlow: 0.6,
        sunGlowPow: 6,
        cloudOpacity: 0,
        skyFog: 600,
        skyHaze: 0.85,
      },
      atmo: {
        fogColor: '#f5cfe0',
        fogSunColor: '#fff2f6',
        fogSunAmount: 0.5,
        fogBase: 0.0075,
        airFalloff: 1 / 45,
        fogGround: 0.006,
        fogFalloff: 0.35,
        wind: [0.5, 0.8, 0.35],
      },
      sun: { color: '#fff0f6', intensity: 1.9 },
      hemi: { sky: '#ffd8ea', ground: '#7a8a68', intensity: 0.5 },
      envIntensity: 1.1,
      exposure: 0.9,
      shadowExtent: 30,
      memoryColor: '#fff0f8',
      post: {
        bloom: 0.11,
        bloomTint: '#ffe6f2',
        haze: 0.07,
        edgeBlur: 0.34,
        ca: 0.0035,
        grain: 0.035,
        vignette: 0.28,
        vigColor: '#ffe2ef',
        sat: 1.2,
        contrast: 0.98,
        split: 0.07,
        tintShadow: '#4a2a5a',
        tintHigh: '#ffe0ee',
        lift: '#24121e',
        gain: '#fffaff',
        leak: 0.16,
        leakColor: '#ffc0dc',
      },
      music: 'cogumelos',
    };

    // trilha de pedras (curva) — usada também para o relevo e a máscara da grama
    const curve = new THREE.CatmullRomCurve3(
      [[0, 4], [1.5, -14], [4, -30], [-1, -46], [-6, -60], [-2, -78], [5, -92], [4, -108], [2, -124]].map(([x, z]) => new THREE.Vector3(x, 0, z))
    );
    const pts = curve.getSpacedPoints(260);
    this.pathPts = pts;
    this.pathDist = (x, z) => {
      let best = 1e9;
      for (let i = 0; i < pts.length; i += 2) {
        const dx = pts[i].x - x, dz = pts[i].z - z;
        const d = dx * dx + dz * dz;
        if (d < best) best = d;
      }
      return Math.sqrt(best);
    };

    const ftex = TX.forestFloor({ a: '#4f6a48', b: '#7a6a66', c: '#86a06a', seed: 31 });
    const gm = groundMaterial({
      map: ftex.map,
      normalMap: ftex.normalMap,
      roughness: 0.95,
      far: '#a7959e',
      farStart: 20,
      farEnd: 80,
      farMix: 0.5,
      macro: 0.2,
      macroScale: 0.05,
    });
    const hfn = (x, z) => this.heightAt(x, z);
    this.mesh(heightfield(380, 190, hfn, 4), gm, { cast: false });
    const far = ground(8000, 8000, 4, 120, 120);
    far.translate(0, -0.9, 0);
    this.mesh(far, gm, { cast: false });
    this.hmap = makeHeightMap(hfn, [-190, -190, 380, 380], 381);

    // pedras da trilha
    const stoneG = rockGeometry(rand, 1);
    const stoneTex = TX.concrete(9);
    const stoneMat = std('#ffffff', { map: stoneTex.map, normalMap: stoneTex.normalMap, roughness: 0.9 });
    const stones = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const p = pts[i], n = pts[i + 1];
      const tx = n.x - p.x, tz = n.z - p.z;
      const len = Math.hypot(tx, tz) || 1;
      const ox = -tz / len, oz = tx / len;
      for (const side of [-0.45, 0.45]) {
        if (rand() < 0.15) continue;
        const x = p.x + ox * (side + (rand() - 0.5) * 0.25), z = p.z + oz * (side + (rand() - 0.5) * 0.25);
        const s = 0.28 + rand() * 0.18;
        const g = 165 + rand() * 40;
        stones.push({ x, y: this.heightAt(x, z) + 0.01, z, s, sy: s * 0.5, ry: rand() * 6, color: `rgb(${g | 0},${(g * 0.96) | 0},${(g * 0.98) | 0})` });
      }
    }
    this.add(instanced(stoneG, stoneMat, stones, { cast: false }));

    // cogumelos gigantes
    const templates = [
      mushroomTemplate(rand, { stemR: 0.085, capR: 0.5, capH: 0.3, flat: 0.6, bend: 0.05 }),
      mushroomTemplate(rand, { stemR: 0.075, capR: 0.42, capH: 0.36, flat: 0.2, bend: -0.04 }),
      mushroomTemplate(rand, { stemR: 0.1, capR: 0.62, capH: 0.18, flat: 1.4, bend: 0.03 }),
      mushroomTemplate(rand, { stemR: 0.07, capR: 0.38, capH: 0.32, flat: 0.4, bend: 0.08 }),
    ];
    const stemTex = TX.stucco();
    const stemMat = std('#f6ecef', { roughness: 0.75, normalMap: stemTex.normalMap, emissive: '#ffd6e4', emissiveIntensity: 0.06 });
    const capMat = capMaterial('#ef7fa9', '#ffeef4', 1.9, 0.26);
    const gillMat = gillMaterial('#f3c2d2');
    const giants = [[], [], [], []];
    const placed = [];
    const tryPlace = (x, z, s, k) => {
      for (const p of placed) if (Math.hypot(p[0] - x, p[1] - z) < (p[2] + s) * 0.55) return false;
      if (this.pathDist(x, z) < s * 0.12 + 2.2) return false;
      placed.push([x, z, s]);
      const y = this.heightAt(x, z) - 0.15;
      giants[k].push({ x, y, z, s, sy: s * (0.85 + rand() * 0.3), ry: rand() * 6.28, rz: (rand() - 0.5) * 0.08 });
      this.circle(x, z, s * 0.1 + 0.15);
      return true;
    };
    // heróis perto da trilha (composição da foto)
    tryPlace(-5.5, -9, 9, 0);
    tryPlace(6.5, -16, 11, 2);
    tryPlace(-9, -36, 12, 0);
    tryPlace(9, -42, 8, 1);
    tryPlace(-3.5, -24, 4.5, 3);
    tryPlace(3.4, -5, 3.2, 1);
    let guard = 0;
    while (placed.length < 95 && guard++ < 3000) {
      const a = rand() * Math.PI * 2, r = 4 + Math.sqrt(rand()) * 150;
      const x = Math.cos(a) * r, z = Math.sin(a) * r - 60;
      const s = 3 + Math.pow(rand(), 1.5) * 13;
      tryPlace(x, z, s, Math.floor(rand() * 4));
    }
    giants.forEach((items, k) => {
      if (!items.length) return;
      const t = templates[k];
      this.add(instanced(t.stem, stemMat, items));
      this.add(instanced(t.cap, capMat, items));
      this.add(instanced(t.gill, gillMat, items, { cast: false }));
    });
    // cogumelos médios pintados perto da trilha (como na foto)
    const mids = [[], []];
    for (let i = 0; i < 46; i++) {
      const p = pts[Math.floor(rand() * pts.length)];
      const side = rand() < 0.5 ? -1 : 1;
      const x = p.x + side * (2.2 + rand() * 4), z = p.z + (rand() - 0.5) * 3;
      if (this.pathDist(x, z) < 1.8) continue;
      const s = 1.2 + rand() * 2.2;
      mids[i % 2].push({ x, y: this.heightAt(x, z) - 0.05, z, s, sy: s * (0.8 + rand() * 0.4), ry: rand() * 6, rz: (rand() - 0.5) * 0.12 });
      this.circle(x, z, s * 0.09 + 0.05);
    }
    const midCap = capMaterial('#f2588e', '#ffe6ef', 2.3, 0.22);
    mids.forEach((items, k) => {
      const t = templates[k === 0 ? 1 : 3];
      this.add(instanced(t.stem, stemMat, items));
      this.add(instanced(t.cap, midCap, items));
      this.add(instanced(t.gill, gillMat, items, { cast: false }));
    });

    // cogumelo-porta no fim da trilha
    const doorT = templates[0];
    const dm = { x: 2, y: this.heightAt(2, -132) - 0.2, z: -132, s: 17, sy: 15, ry: 0.4 };
    this.add(instanced(doorT.stem, stemMat, [dm]));
    this.add(instanced(doorT.cap, capMat, [dm]));
    this.add(instanced(doorT.gill, gillMat, [dm], { cast: false }));
    this.circle(2, -132, 1.9);

    // cogumelinhos (aglomerados, e um círculo de fadas)
    const small = mushroomTemplate(rand, { stemR: 0.12, capR: 0.42, capH: 0.32, flat: 0.3, bend: 0.0 });
    const smallCap = capMaterial('#ff5a92', '#ffffff', 2.6, 0.24);
    const smalls = [];
    const addSmall = (x, z, s) => smalls.push({ x, y: this.heightAt(x, z) - 0.01, z, s, sy: s * (0.8 + rand() * 0.5), ry: rand() * 6, rz: (rand() - 0.5) * 0.3 });
    for (let c = 0; c < 120; c++) {
      let cx, cz;
      if (c < 40) {
        const p = pts[Math.floor(rand() * pts.length)];
        const side = rand() < 0.5 ? -1 : 1;
        cx = p.x + side * (1.3 + rand() * 2.5);
        cz = p.z + (rand() - 0.5) * 2;
      } else {
        const g = placed[Math.floor(rand() * placed.length)];
        const a = rand() * 6.28;
        cx = g[0] + Math.cos(a) * (g[2] * 0.14 + 0.6);
        cz = g[1] + Math.sin(a) * (g[2] * 0.14 + 0.6);
      }
      const n = 4 + Math.floor(rand() * 10);
      for (let i = 0; i < n; i++) addSmall(cx + (rand() - 0.5) * 1.4, cz + (rand() - 0.5) * 1.4, 0.1 + Math.pow(rand(), 2) * 0.45);
    }
    const ring = { x: -18, z: -96 };
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2;
      addSmall(ring.x + Math.cos(a) * 2.4, ring.z + Math.sin(a) * 2.4, 0.16 + rand() * 0.12);
    }
    this.add(instanced(small.stem, stemMat, smalls, { cast: false }));
    this.add(instanced(small.cap, smallCap, smalls, { cast: false }));

    // samambaias
    const frond = TX.fernFrond();
    const fernMat = foliageMaterial(frond, { sway: 0.08, roughness: 0.75 });
    const fronds = [];
    for (let i = 0; i < 7; i++) {
      const g = new THREE.PlaneGeometry(0.42, 1, 1, 6);
      g.translate(0, 0.5, 0);
      const p = g.attributes.position;
      for (let k = 0; k < p.count; k++) {
        const y = p.getY(k);
        p.setZ(k, -y * y * 0.7);
        p.setY(k, y * (1 - y * 0.35));
      }
      g.computeVertexNormals();
      tf(g, [0, 0, 0], [-0.55 - rand() * 0.35, (i / 7) * Math.PI * 2 + rand() * 0.4, 0]);
      fronds.push(g);
    }
    const fernGeo = merge(fronds);
    sphericalNormals(fernGeo, [0, 0, 0], [0, 0.6, 0]);
    const ferns = [];
    for (let i = 0; i < 520; i++) {
      let x, z;
      if (i < 260) {
        const p = pts[Math.floor(rand() * pts.length)];
        const side = rand() < 0.5 ? -1 : 1;
        x = p.x + side * (1.6 + rand() * 5);
        z = p.z + (rand() - 0.5) * 3;
      } else {
        const a = rand() * 6.28, r = Math.sqrt(rand()) * 90;
        x = Math.cos(a) * r;
        z = Math.sin(a) * r - 60;
      }
      if (this.pathDist(x, z) < 1.3) continue;
      const s = 0.5 + rand() * 0.8;
      const gr = 0.75 + rand() * 0.4;
      ferns.push({ x, y: this.heightAt(x, z) - 0.05, z, s, ry: rand() * 6, color: new THREE.Color(gr, gr * (0.95 + rand() * 0.1), gr) });
    }
    this.add(instanced(fernGeo, fernMat, ferns));

    // tocos (para uma das lembranças)
    const barkT = TX.bark();
    const stump = new THREE.Mesh(cylinder(0.55, 0.7, 0.75, 16), std('#8a6f66', { map: barkT.map, normalMap: barkT.normalMap, roughness: 0.95 }));
    stump.position.set(14, this.heightAt(14, -68) + 0.3, -68);
    stump.castShadow = stump.receiveShadow = true;
    this.add(stump);
    const top = new THREE.Mesh(new THREE.CircleGeometry(0.55, 20), std('#c9a99a', { roughness: 0.9 }));
    top.rotation.x = -Math.PI / 2;
    top.position.set(14, stump.position.y + 0.376, -68);
    this.add(top);
    this.circle(14, -68, 0.7);

    // grama da floresta (sem crescer na trilha)
    const mask = makeMask([-190, -190, 380, 380], (ctx) => {
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1.7;
      ctx.lineJoin = ctx.lineCap = 'round';
      ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.z) : ctx.moveTo(p.x, p.z)));
      ctx.stroke();
    }, 1024);
    const grass = new Grass({
      tile: 10,
      slots: q.grassSlots,
      density: 30 * q.grassDensity,
      height: [0.1, 0.32],
      width: [0.03, 0.06],
      base: '#1f3a1e',
      tip: '#73a35c',
      dry: '#9fb07a',
      dryAmount: 0.3,
      ao: 0.45,
      patch: 0.7,
      seed: 5,
    });
    grass.setMask(mask);
    grass.setHeightMap(this.hmap);
    this.grass.push(grass);
    this.add(grass.group);

    // esporos flutuando ao redor do jogador
    const NS = 700;
    const spos = new Float32Array(NS * 3);
    const sdat = [];
    for (let i = 0; i < NS; i++) sdat.push([rand() * 40 - 20, rand() * 8, rand() * 40 - 20, rand()]);
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(spos, 3));
    const sm = new THREE.PointsMaterial({
      size: 0.045,
      map: TX.radial('rgba(255,255,255,1)', 'rgba(255,255,255,0)', 32, 0.2),
      color: '#ffe6f2',
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    sm.defines = { DV_ADDITIVE: '' };
    const spores = new THREE.Points(sg, sm);
    spores.frustumCulled = false;
    this.add(spores);
    this.onUpdate((dt, t, game) => {
      const c = game.camera.position;
      for (let i = 0; i < NS; i++) {
        const d = sdat[i];
        d[1] += dt * (0.08 + d[3] * 0.12);
        d[0] += Math.sin(t * 0.3 + d[3] * 20) * dt * 0.1;
        let x = ((d[0] - c.x + 20) % 40 + 40) % 40 - 20 + c.x;
        let z = ((d[2] - c.z + 20) % 40 + 40) % 40 - 20 + c.z;
        const y = (d[1] % 8) + this.heightAt(x, z);
        spos[i * 3] = x;
        spos[i * 3 + 1] = y;
        spos[i * 3 + 2] = z;
      }
      sg.attributes.position.needsUpdate = true;
    });

    // feixes de luz entre os chapéus
    const beamTex = TX.radial('rgba(255,255,255,0.55)', 'rgba(255,255,255,0)', 64);
    const beamMat = additive(beamTex, '#fff0f6', 0.35);
    beamMat.side = THREE.DoubleSide;
    for (let i = 0; i < 9; i++) {
      const a = rand() * 6.28, r = 8 + rand() * 50;
      const b = new THREE.Mesh(new THREE.PlaneGeometry(3 + rand() * 3, 26), beamMat);
      b.position.set(Math.cos(a) * r, 10, Math.sin(a) * r - 50);
      b.rotation.set(0.25, rand() * 6.28, 0.35);
      b.renderOrder = 4;
      this.add(b);
    }

    this.memoryDefs = [
      { x: -7.5, z: -35, theme: 'cat', caption: 'mimi', line: 'ela sempre sabia quando você estava triste.' },
      { x: 14, z: -68, y0: 1.55, theme: 'fort', caption: 'a cabana de lençóis', line: 'lá dentro, o mundo era do tamanho certo.' },
      { x: ring.x, z: ring.z, theme: 'stars', caption: 'estrelas no teto', line: 'elas brilhavam até você dormir.' },
    ];
    for (const m of this.memoryDefs) m.y = this.heightAt(m.x, m.z) + (m.y0 || 1.3);
    this.door = { x: 2.6, z: -129.6, y: this.heightAt(2.6, -129.6) - 0.05, yaw: 0.18, frame: '#fff4f8', leaf: '#f6c6d8', knob: '#ffe6a8', beamColor: '#ffe6f2' };
    this.doorLine = 'o maior cogumelo abriu uma porta.';
    this.sounds = [
      { type: 'chimes', x: -9, y: 3, z: -36, gain: 0.5 },
      { type: 'chimes', x: 9, y: 3, z: -70, gain: 0.4 },
      { type: 'chimes', x: -18, y: 1, z: -96, gain: 0.5 },
    ];
    this.trigger(1, -16, 5, (g) => g.whisper('tudo aqui é macio.'));
    this.trigger(-5, -60, 6, (g) => g.whisper('você está diminuindo, ou eles estão crescendo?'));
    this.trigger(4, -106, 6, (g) => g.whisper('quase lá. quase acordando.'));
  }
}
