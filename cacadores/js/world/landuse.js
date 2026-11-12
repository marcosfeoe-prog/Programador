// Uso do solo: divide o campo em lavouras, pastos, matas e plantações florestais e pinta
// o mapa de cores do terreno (com estradas, cidades e água). Também responde consultas
// de superfície (o que existe debaixo de um ponto) para a física e os detritos.

import * as THREE from 'three';
import { RNG, hash2 } from '../core/rng.js';
import { Noise } from '../core/noise.js';
import { CROP_INFO } from './countries.js';
import { WORLD } from '../config.js';
import { segDist, smoothstep } from '../core/math.js';

const URBAN = { name: 'urbano', color: [0.4, 0.46, 0.3], rows: 0, height: 0, dust: 0.6 };
const WATER = { name: 'água', color: [0.12, 0.16, 0.16], rows: 0, height: 0, dust: 0 };

export class LandUse {
  constructor(country, terrain, roads, cities, seed) {
    this.country = country;
    this.terrain = terrain;
    this.roads = roads;
    this.cities = cities;
    this.seed = seed;
    this.noise = new Noise(seed + 5);
    this.rng = new RNG(seed);
    this.fields = new Map();
    this.Q = 512; // grade de consulta
    this.qcell = WORLD.size / this.Q;
    this.qgrid = new Int32Array(this.Q * this.Q);
    // Cor do solo em sRGB (o mapa de cores é pintado em sRGB).
    const sc = new THREE.Color(country.soil);
    this.soil = { r: 0, g: 0, b: 0 };
    sc.getRGB(this.soil, THREE.SRGBColorSpace);
    const g = country.grid;
    this.gridded = !!g;
    this.fsize = country.fieldSize;
    this.ang = g ? g.angle || 0 : 0;
    this.ca = Math.cos(-this.ang);
    this.sa = Math.sin(-this.ang);
  }

  // Identifica o talhão em (x, z). Retorna o registro do talhão.
  fieldAt(x, z) {
    let key;
    let cx;
    let cz;
    if (this.gridded) {
      const u = x * this.ca - z * this.sa;
      const v = x * this.sa + z * this.ca;
      // Quartos de seção (às vezes a seção inteira é um só talhão).
      const sec = this.country.grid.spacing;
      const si = Math.floor(u / sec);
      const sj = Math.floor(v / sec);
      const merge = hash2(si, sj, this.seed) < 0.35;
      const half = hash2(si, sj, this.seed + 1) < 0.5;
      if (merge) {
        cx = si * 4;
        cz = sj * 4;
      } else if (half) {
        cx = si * 4 + (u - si * sec < sec / 2 ? 0 : 2);
        cz = sj * 4;
      } else {
        cx = si * 4 + (u - si * sec < sec / 2 ? 0 : 2);
        cz = sj * 4 + (v - sj * sec < sec / 2 ? 0 : 2);
      }
      key = cx * 65536 + cz;
    } else {
      // Talhões irregulares (Voronoi com bordas levemente tortas).
      const s = this.fsize;
      const wx = x + this.noise.n2(x / 900, z / 900) * s * 0.18;
      const wz = z + this.noise.n2(x / 900 + 7.7, z / 900 - 3.1) * s * 0.18;
      const gi = Math.floor(wx / s);
      const gj = Math.floor(wz / s);
      let best = 1e18;
      for (let oi = -1; oi <= 1; oi++)
        for (let oj = -1; oj <= 1; oj++) {
          const ci = gi + oi;
          const cj = gj + oj;
          const px = (ci + 0.15 + 0.7 * hash2(ci, cj, this.seed)) * s;
          const pz = (cj + 0.15 + 0.7 * hash2(ci, cj, this.seed + 3)) * s;
          // Talhões alongados na direção das curvas de nível.
          const dx = wx - px;
          const dz = wz - pz;
          const an = hash2(ci, cj, this.seed + 9) * Math.PI;
          const a1 = dx * Math.cos(an) + dz * Math.sin(an);
          const a2 = -dx * Math.sin(an) + dz * Math.cos(an);
          const d = a1 * a1 * 0.55 + a2 * a2;
          if (d < best) {
            best = d;
            cx = ci;
            cz = cj;
          }
        }
      key = cx * 65536 + cz;
    }
    let f = this.fields.get(key);
    if (!f) f = this.makeField(key, cx, cz, x, z);
    return f;
  }

  makeField(key, cx, cz, x, z) {
    const rng = new RNG((key ^ this.seed) >>> 0);
    const c = this.country;
    let weights = c.crops.map((cr) => cr.w);
    // Matas ciliares e encostas íngremes ficam com floresta (Brasil/Chile/Uruguai).
    const slope = this.terrain.slopeAt(x, z);
    const types = c.crops.map((cr) => cr.type);
    weights = weights.map((w, i) => {
      const info = CROP_INFO[types[i]];
      if (info.forest) return w * (1 + slope * 14);
      return w * Math.max(0.15, 1 - slope * 6);
    });
    // Chile: plantações de pinus concentradas na Cordilheira da Costa.
    if (c.terrain.coastRange) weights = weights.map((w, i) => (CROP_INFO[types[i]].forest ? w * (x < -3000 ? 3 : 0.5) : w));
    const type = types[rng.weighted(weights)];
    const info = CROP_INFO[type];
    let rowAng;
    if (this.gridded) rowAng = this.ang + (rng.chance(0.5) ? 0 : Math.PI / 2);
    else {
      // Plantio em nível: linhas acompanham o relevo.
      const n = this.terrain.normalAt(x, z);
      rowAng = Math.atan2(n.z, n.x) + Math.PI / 2 + rng.range(-0.3, 0.3);
    }
    const f = {
      key,
      type,
      info,
      rowAng: ((rowAng % Math.PI) + Math.PI) % Math.PI,
      tint: rng.range(0.86, 1.12),
      hue: rng.range(-0.05, 0.05),
      moist: rng.range(0, 1),
      cx,
      cz,
    };
    this.fields.set(key, f);
    return f;
  }

  cityAt(x, z) {
    for (const c of this.cities) {
      const d = Math.hypot(x - c.x, z - c.z);
      if (d < c.radius) return c;
    }
    return null;
  }

  // Monta a grade de consulta e pinta as texturas.
  build(res) {
    const Q = this.Q;
    const H = WORLD.half;
    // Grade de consulta: -1 = cidade, -2 = água, senão índice do talhão.
    this.fieldList = [];
    const idOf = new Map();
    for (let j = 0; j < Q; j++)
      for (let i = 0; i < Q; i++) {
        const x = -H + (i + 0.5) * this.qcell;
        const z = -H + (j + 0.5) * this.qcell;
        let v;
        if (this.terrain.waterAt(x, z)) v = -2;
        else if (this.cityAt(x, z)) v = -1;
        else {
          const f = this.fieldAt(x, z);
          if (!idOf.has(f.key)) {
            idOf.set(f.key, this.fieldList.length);
            this.fieldList.push(f);
            f.cells = [];
          }
          v = idOf.get(f.key);
          f.cells.push(j * Q + i);
        }
        this.qgrid[j * Q + i] = v;
      }
    this.colorTex = this.paintColor(res);
    this.dataTex = this.paintData(Math.min(1024, res));
    return this;
  }

  surfaceAt(x, z) {
    const H = WORLD.half;
    const i = Math.floor((x + H) / this.qcell);
    const j = Math.floor((z + H) / this.qcell);
    if (i < 0 || j < 0 || i >= this.Q || j >= this.Q) return { kind: 'field', info: CROP_INFO.pasture };
    const v = this.qgrid[j * this.Q + i];
    if (v === -2) return { kind: 'water', info: WATER };
    if (v === -1) return { kind: 'urban', info: URBAN };
    const f = this.fieldList[v];
    return { kind: 'field', info: f.info, field: f };
  }

  cropColor(f, x, z, out) {
    const info = f.info;
    let r;
    let g;
    let b;
    if (!info.color) {
      // Terra arada: cor do solo do país, mais escura onde está úmida.
      const k = 0.85 + f.moist * 0.2;
      r = this.soil.r * k;
      g = this.soil.g * k;
      b = this.soil.b * k;
    } else {
      [r, g, b] = info.color;
    }
    const n = this.noise.fbm2(x / 260, z / 260, 3);
    const n2 = this.noise.n2(x / 60, z / 60);
    let t = f.tint * (1 + n * 0.16 + n2 * 0.05);
    r *= t * (1 + f.hue);
    g *= t;
    b *= t * (1 - f.hue);
    // Manchas de solo exposto em pastos e palhada.
    if (f.type === 'pasture' || f.type === 'stubble') {
      const bare = smoothstep(0.35, 0.6, this.noise.fbm2(x / 90 + 3, z / 90, 3));
      r += (this.soil.r - r) * bare * 0.45;
      g += (this.soil.g - g) * bare * 0.45;
      b += (this.soil.b - b) * bare * 0.45;
    }
    out[0] = r;
    out[1] = g;
    out[2] = b;
    return out;
  }

  paintColor(R) {
    const H = WORLD.half;
    const cv = document.createElement('canvas');
    cv.width = cv.height = R;
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(R, R);
    const d = img.data;
    const px = WORLD.size / R;
    const col = [0, 0, 0];
    const Q = this.Q;
    let lastKey = -1;
    let lastField = null;
    for (let j = 0; j < R; j++) {
      const z = -H + (j + 0.5) * px;
      for (let i = 0; i < R; i++) {
        const x = -H + (i + 0.5) * px;
        const qi = Math.min(Q - 1, Math.floor(((i + 0.5) / R) * Q));
        const qj = Math.min(Q - 1, Math.floor(((j + 0.5) / R) * Q));
        const v = this.qgrid[qj * Q + qi];
        let r;
        let g;
        let b;
        if (v === -2) {
          r = 0.1;
          g = 0.13;
          b = 0.13;
        } else if (v === -1) {
          // Gramados e terrenos urbanos.
          const n = this.noise.fbm2(x / 70, z / 70, 3);
          r = 0.32 + n * 0.08;
          g = 0.4 + n * 0.08;
          b = 0.22 + n * 0.05;
          if (this.country.houseStyle !== 'us' && this.country.houseStyle !== 'ca') {
            const k = 0.35;
            r = r * (1 - k) + this.soil.r * k * 1.1;
            g = g * (1 - k) + this.soil.g * k * 1.1;
            b = b * (1 - k) + this.soil.b * k * 1.1;
          }
        } else {
          let f;
          if (this.gridded) {
            f = this.fieldAt(x, z);
          } else {
            // Recalcula a borda exata (em resolução de pixel) só perto de bordas.
            const key = this.fieldList[v].key;
            if (key === lastKey) f = lastField;
            else f = this.fieldAt(x, z);
            if (f.key !== key) f = this.fieldAt(x, z);
            lastKey = f.key;
            lastField = f;
          }
          this.cropColor(f, x, z, col);
          [r, g, b] = col;
          // Bordas de talhão com capim/mato.
          const edge = this.edgeFactor(x, z, f);
          if (edge > 0) {
            r = r * (1 - edge) + 0.3 * edge;
            g = g * (1 - edge) + 0.36 * edge;
            b = b * (1 - edge) + 0.2 * edge;
          }
        }
        const o = (j * R + i) * 4;
        d[o] = Math.min(255, Math.max(0, r) * 255);
        d[o + 1] = Math.min(255, Math.max(0, g) * 255);
        d[o + 2] = Math.min(255, Math.max(0, b) * 255);
        d[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    // Estradas desenhadas por cima (vistas de longe).
    ctx.lineCap = 'round';
    const toPx = (p) => [((p[0] + H) / WORLD.size) * R, ((p[1] + H) / WORLD.size) * R];
    for (const road of this.roads.roads) {
      const w = Math.max(1, (road.def.width / px) * 1.1);
      ctx.strokeStyle =
        road.def.surface === 'asphalt' ? 'rgba(62,62,64,0.95)' : road.def.surface === 'gravel' ? 'rgba(170,150,130,0.9)' : `rgba(${(this.soil.r * 255 * 1.2) | 0},${(this.soil.g * 255 * 1.2) | 0},${(this.soil.b * 255 * 1.2) | 0},0.9)`;
      ctx.lineWidth = w;
      ctx.beginPath();
      road.pts.forEach((p, k) => {
        const [a, b] = toPx(p);
        if (k === 0) ctx.moveTo(a, b);
        else ctx.lineTo(a, b);
      });
      ctx.stroke();
    }
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    this.colorCanvas = cv;
    return t;
  }

  edgeFactor(x, z, f) {
    if (this.gridded) {
      const u = x * this.ca - z * this.sa;
      const v = x * this.sa + z * this.ca;
      const q = this.country.grid.spacing / 2;
      const du = Math.abs(((u % q) + q) % q - q / 2);
      const dv = Math.abs(((v % q) + q) % q - q / 2);
      const e = q / 2 - Math.min(du, dv);
      return e < 7 ? 0.5 * (1 - e / 7) : 0;
    }
    return 0;
  }

  paintData(R) {
    const H = WORLD.half;
    const data = new Uint8Array(R * R * 4);
    const px = WORLD.size / R;
    for (let j = 0; j < R; j++) {
      const z = -H + (j + 0.5) * px;
      for (let i = 0; i < R; i++) {
        const x = -H + (i + 0.5) * px;
        const s = this.surfaceAt(x, z);
        let veg = 0.7;
        let ang = 0;
        let rows = 0;
        let spacing = 0.5;
        if (s.kind === 'urban') veg = 0.9;
        else if (s.kind === 'water') veg = 0;
        else {
          const f = this.gridded ? this.fieldAt(x, z) : s.field;
          const info = f.info;
          veg = info.color ? (f.type === 'pasture' ? 1 : 0.55) : 0.05;
          if (info.forest) veg = 0.5;
          ang = f.rowAng;
          rows = info.rows > 0 ? 1 : 0;
          spacing = info.rows || 0.5;
        }
        // Linha 0 do dado = norte do mapa (mesma orientação da textura de cor com flipY).
        const o = ((R - 1 - j) * R + i) * 4;
        data[o] = veg * 255;
        data[o + 1] = (ang / Math.PI) * 255;
        data[o + 2] = rows * 255;
        data[o + 3] = Math.min(255, (spacing / 1.0) * 255);
      }
    }
    const t = new THREE.DataTexture(data, R, R, THREE.RGBAFormat, THREE.UnsignedByteType);
    t.minFilter = THREE.LinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    t.needsUpdate = true;
    return t;
  }

  // Lista de talhões florestais para a vegetação.
  forestFields() {
    return this.fieldList.filter((f) => f.info.forest);
  }

  cellCenter(idx) {
    const H = WORLD.half;
    const i = idx % this.Q;
    const j = Math.floor(idx / this.Q);
    return [-H + (i + 0.5) * this.qcell, -H + (j + 0.5) * this.qcell];
  }

  isOpenField(x, z) {
    const s = this.surfaceAt(x, z);
    return s.kind === 'field' && !s.info.forest;
  }
}

// Material do terreno: cor do mapa + texturas de detalhe + linhas de plantio no shader.
export function terrainMaterial(land, textures, patchWorld) {
  const mat = new THREE.MeshStandardMaterial({ map: land.colorTex, roughness: 0.96, metalness: 0 });
  patchWorld(mat, { key: 'terrain' });
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, r) => {
    prev(shader, r);
    shader.uniforms.tDetail = { value: textures.detail };
    shader.uniforms.tLand = { value: land.dataTex };
    shader.uniforms.uSoil = { value: new THREE.Color(land.country.soil) };
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform sampler2D tDetail;
        uniform sampler2D tLand;
        uniform vec3 uSoil;`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        {
          vec2 wp = vWPos.xz;
          vec4 land = texture2D(tLand, vMapUv);
          ivec2 ts = textureSize(tLand, 0);
          vec4 landN = texelFetch(tLand, ivec2(vMapUv * vec2(ts)), 0);
          float dist = length(vWPos - cameraPosition);
          vec4 d1 = texture2D(tDetail, wp / 3.1);
          vec4 d2 = texture2D(tDetail, wp / 13.7 + 0.37);
          vec4 d3 = texture2D(tDetail, wp / 410.0);
          float veg = land.r;
          // Grama (folhas) e torrões de solo.
          float grassD = mix(1.0, (d1.r * 0.6 + d2.r * 0.4) * 2.0, 0.55 * veg * sstep(260.0, 20.0, dist));
          float soilD = mix(1.0, (d1.g * 0.5 + d2.g * 0.5) * 2.0, 0.6 * (1.0 - veg) * sstep(300.0, 15.0, dist));
          float big = 0.86 + d3.a * 0.28;
          diffuseColor.rgb *= grassD * soilD * big;
          // Linhas de plantio (só culturas espaçadas: milho, soja, sorgo, girassol, sulcos).
          float spacing = landN.a;
          if (landN.b > 0.5 && spacing > 0.4) {
            float ang = landN.g * 3.14159265;
            float rc = dot(wp, vec2(cos(ang), sin(ang))) / spacing;
            float fw = fwidth(rc);
            float rows = 0.5 + 0.5 * cos(rc * 6.2831853);
            float fade = 1.0 - smoothstep(0.035, 0.11, fw);
            diffuseColor.rgb *= 1.0 - fade * 0.24 * (1.0 - rows);
          }
        }`,
      );
  };
  mat.customProgramCacheKey = () => 'terrain-land';
  return mat;
}

// Material do terreno de fundo: colcha de retalhos procedural com a paleta do país.
export function skirtMaterial(country, textures, patchWorld) {
  const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.97 });
  patchWorld(mat, { key: 'skirt' });
  const prev = mat.onBeforeCompile;
  const palette = country.crops.slice(0, 6).map((c) => {
    const info = CROP_INFO[c.type];
    const col = info.color ? new THREE.Color().setRGB(info.color[0], info.color[1], info.color[2], THREE.SRGBColorSpace) : new THREE.Color(country.soil);
    return col;
  });
  while (palette.length < 6) palette.push(new THREE.Color(0.36, 0.47, 0.22));
  mat.onBeforeCompile = (shader, r) => {
    prev(shader, r);
    shader.uniforms.uPal = { value: palette };
    shader.uniforms.tDetail = { value: textures.detail };
    shader.uniforms.uCell = { value: country.fieldSize * 1.1 };
    shader.uniforms.uSnow = { value: country.terrain.andes ? 1 : 0 };
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform vec3 uPal[6];
        uniform sampler2D tDetail;
        uniform float uCell;
        uniform float uSnow;
        float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          vec2 c = floor(vWPos.xz / uCell);
          float h = h21(c);
          int k = int(floor(h * 5.999));
          vec3 col = uPal[0];
          for (int i = 0; i < 6; i++) if (i == k) col = uPal[i];
          float n = texture2D(tDetail, vWPos.xz / 2900.0).a;
          col *= 0.8 + 0.35 * n + 0.15 * h21(c + 3.1);
          // Rochas e neve nas montanhas.
          float alt = vWPos.y;
          col = mix(col, vec3(0.33, 0.31, 0.3), smoothstep(700.0, 1400.0, alt));
          col = mix(col, vec3(0.92, 0.94, 0.97), uSnow * smoothstep(1900.0, 2400.0, alt + n * 300.0));
          diffuseColor.rgb = col;
        }`,
      );
  };
  mat.customProgramCacheKey = () => 'skirt-' + country.id;
  return mat;
}
