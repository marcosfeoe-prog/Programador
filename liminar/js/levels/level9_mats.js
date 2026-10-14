// Nível 9 — texturas e materiais: revestimento de madeira, telhas, grama, folhas,
// janelas, placas de rua, céu noturno com lua e a iluminação dos postes injetada
// nos shaders (as "poças de luz" dos postes e das varandas sem luzes reais).
import * as THREE from 'three';
import { registerTexture, getTex, TEX } from '../textures.js';
import { SKY_GLSL } from './outdoor.js';
import { mulberry32, clamp } from '../util.js';

const { makeCanvas, toTex, noiseField, whiteNoise, paintRGB, normalMap } = TEX;
const gf = (v) => Number(v).toFixed(3); // número → literal float GLSL

// ------------------------------------------------------------------ texturas
// Revestimento de madeira (lap siding): 8 tábuas sobrepostas por ladrilho, em cinza
// (a cor vem dos vértices).
registerTexture('l9Siding', (S) => {
  const grain = noiseField(S, S, 2, 48, 3, 901);
  const low = noiseField(S, S, 3, 3, 4, 902);
  const fine = whiteNoise(S * S, 903);
  const hf = new Float32Array(S * S);
  const cv = paintRGB(S, S, (x, y, i, o) => {
    const fy = ((y / S) * 8) % 1;
    const board = Math.floor((y / S) * 8);
    const shadow = 0.5 + 0.5 * Math.min(1, fy / 0.13);
    const k = (0.86 + grain[i] * 0.05 + low[i] * 0.07 + fine[i] * 0.025 + ((board * 7) % 5) * 0.008) * shadow * (0.96 + 0.04 * fy);
    o[0] = o[1] = o[2] = k;
    hf[i] = fy + grain[i] * 0.05;
  });
  return { map: toTex(cv), normalMap: normalMap(hf, S, S, 3.5) };
});

// Telhas asfálticas de três abas, 8 fiadas por ladrilho.
registerTexture('l9Shingle', (S) => {
  const fine = whiteNoise(S * S, 911);
  const low = noiseField(S, S, 4, 4, 4, 912);
  const hf = new Float32Array(S * S);
  const rows = 8;
  const tabs = 4;
  const cv = paintRGB(S, S, (x, y, i, o) => {
    const ry = (y / S) * rows;
    const row = Math.floor(ry);
    const fy = ry - row;
    const rx = (x / S) * tabs + (row % 2) * 0.5 + ((row * 0.37) % 1) * 0.2;
    const tab = Math.floor(rx);
    const fx = rx - tab;
    const slot = fy > 0.45 && Math.min(fx, 1 - fx) < 0.012;
    const tk = 0.85 + (((tab * 13 + row * 7) % 11) / 11) * 0.25;
    let k = (0.5 + fine[i] * 0.12 + low[i] * 0.08) * tk;
    k *= 0.55 + 0.45 * Math.min(1, fy / 0.12);
    if (slot) k *= 0.4;
    o[0] = o[1] = o[2] = k;
    hf[i] = fy * 0.8 + fine[i] * 0.15 - (slot ? 0.4 : 0);
  });
  return { map: toTex(cv), normalMap: normalMap(hf, S, S, 2.5) };
});

// Grama de gramado (colorida), ladrilho de 2 m.
registerTexture('l9Grass', (S) => {
  const fine = whiteNoise(S * S, 921);
  const mid = noiseField(S, S, 16, 16, 3, 922);
  const low = noiseField(S, S, 3, 3, 3, 923);
  const blades = noiseField(S, S, 64, 8, 2, 924);
  const cv = paintRGB(S, S, (x, y, i, o) => {
    const b = blades[i] * 0.5 + fine[i] * 0.5;
    const k = 0.62 + b * 0.35 + mid[i] * 0.15;
    const dry = clamp(low[i] * 2.5 - 0.3, 0, 1) * 0.5;
    o[0] = (0.16 + dry * 0.12) * k;
    o[1] = (0.24 + dry * 0.04) * k;
    o[2] = 0.09 * k;
  });
  return { map: toTex(cv) };
});

// Folhagem: aglomerados de folhas com frestas escuras.
registerTexture('l9Leaves', (S) => {
  const a = noiseField(S, S, 24, 24, 2, 931);
  const b = noiseField(S, S, 6, 6, 3, 932);
  const fine = whiteNoise(S * S, 933);
  const hf = new Float32Array(S * S);
  const cv = paintRGB(S, S, (x, y, i, o) => {
    const v = a[i] * 0.7 + b[i] * 0.3;
    const leaf = v > -0.12 ? 1 : 0.35;
    const k = (0.55 + v * 0.45 + fine[i] * 0.06) * leaf;
    o[0] = 0.62 * k;
    o[1] = 0.85 * k;
    o[2] = 0.5 * k;
    hf[i] = v * leaf;
  });
  return { map: toTex(cv), normalMap: normalMap(hf, S, S, 2.5) };
});

// Janelas: atlas 2×2 com variações (cortinas, persiana, cortina fina, blecaute).
// map = moldura/vidro/tecido; emissiveMap = quanto da luz interna passa.
registerTexture('l9Window', (S) => {
  const H = S / 2;
  const fine = whiteNoise(S * S, 941);
  const folds = (u) => 0.75 + 0.25 * Math.sin(u * 60) * Math.sin(u * 23 + 1);
  const cell = (u, v, kind) => {
    // u, v ∈ [0,1) dentro da célula; v = 0 no topo
    const fr = 0.07;
    if (u < fr || u > 1 - fr || v < fr || v > 1 - fr) return [0.82, 0];
    let mull = false;
    const gu = (u - fr) / (1 - 2 * fr);
    const gv = (v - fr) / (1 - 2 * fr);
    if (kind === 0)
      mull = Math.abs(gu - 1 / 3) < 0.012 || Math.abs(gu - 2 / 3) < 0.012 || Math.abs((gv * 6) % 1) < 0.03 || Math.abs((gv * 6) % 1) > 0.97;
    if (kind === 1 || kind === 3) mull = Math.abs(gv - 0.5) < 0.025;
    if (kind === 2) mull = Math.abs(gu - 0.5) < 0.018 || Math.abs(gv - 0.5) < 0.018;
    if (Math.abs(gv - 0.5) < 0.03 && kind !== 2) mull = true;
    if (mull) return [0.8, 0];
    // tecido / vidro
    if (kind === 0) {
      const side = Math.min(gu, 1 - gu);
      if (side < 0.22 + gv * 0.06) return [0.36 * folds(gu), 0.45];
      return [0.04, 1];
    }
    if (kind === 1) {
      if (gv < 0.55) {
        const slat = (gv * 30) % 1 < 0.78;
        return slat ? [0.42, 0.22] : [0.06, 0.9];
      }
      return [0.04, 1];
    }
    if (kind === 2) return [0.3 * folds(gu * 1.3), 0.6];
    if (gv < 0.7) return [0.38 + gv * 0.05, 0.55];
    return [0.04, 1];
  };
  const em = makeCanvas(S, S);
  const emc = em.getContext('2d');
  const eimg = emc.createImageData(S, S);
  const cv = paintRGB(S, S, (x, y, i, o) => {
    const kind = (x >= H ? 1 : 0) + (y >= H ? 2 : 0);
    const r = cell((x % H) / H, (y % H) / H, kind);
    const k = r[0] + fine[i] * 0.015;
    const glass = r[1] === 1;
    o[0] = k * (glass ? 0.8 : 1.0);
    o[1] = k * (glass ? 0.95 : 0.96);
    o[2] = k * (glass ? 1.2 : 0.88);
    const e = r[1] * 255;
    eimg.data[i * 4] = e;
    eimg.data[i * 4 + 1] = e;
    eimg.data[i * 4 + 2] = e;
    eimg.data[i * 4 + 3] = 255;
  });
  emc.putImageData(eimg, 0, 0);
  return { map: toTex(cv, { repeat: false }), emissiveMap: toTex(em, { repeat: false }) };
});

// Ruído em quatro canais (dados lineares): poças, manchas, rachaduras seladas.
registerTexture('l9Noise', (S) => {
  const n = Math.min(S, 512);
  const a = noiseField(n, n, 4, 4, 4, 951);
  const b = noiseField(n, n, 12, 12, 3, 952);
  const c = noiseField(n, n, 6, 6, 2, 953);
  const d = noiseField(n, n, 24, 24, 2, 954);
  const data = new Uint8Array(n * n * 4);
  for (let i = 0; i < n * n; i++) {
    data[i * 4] = clamp(a[i] * 0.5 + 0.5, 0, 1) * 255;
    data[i * 4 + 1] = clamp(b[i] * 0.5 + 0.5, 0, 1) * 255;
    data[i * 4 + 2] = clamp(c[i] * 0.5 + 0.5, 0, 1) * 255;
    data[i * 4 + 3] = clamp(d[i] * 0.5 + 0.5, 0, 1) * 255;
  }
  const t = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return { map: t };
});

// ------------------------------------------------------------------ placas
// Nomes das ruas: horizontais (z constante) têm nomes de flores e árvores,
// verticais (x constante) nomes de pássaros.
export const STREETS_H = [
  'Rua das Acácias',
  'Rua dos Ipês',
  'Rua das Magnólias',
  'Rua dos Jacarandás',
  'Rua das Hortênsias',
  'Rua dos Girassóis',
  'Rua das Camélias',
  'Rua dos Lírios',
  'Rua das Violetas',
  'Rua dos Cedros',
  'Rua das Orquídeas',
  'Rua dos Salgueiros',
];
export const STREETS_V = [
  'Rua dos Sabiás',
  'Rua dos Bem-te-vis',
  'Rua das Andorinhas',
  'Rua dos Canários',
  'Rua das Garças',
  'Rua dos Pardais',
  'Rua das Corujas',
  'Rua dos Tucanos',
  'Rua das Gaivotas',
  'Rua dos Colibris',
  'Rua das Rolinhas',
  'Rua dos Periquitos',
];

// Atlas das placas: 24 nomes (2 colunas × 12 linhas), dígitos 0–9 e a placa PARE.
// Devolve { tex, name(k) → [u0,v0,u1,v1], digit(d), stop }.
export function signAtlas(size) {
  const W = size;
  const H = size;
  const k = size / 1024;
  const cv = makeCanvas(W, H);
  const c = cv.getContext('2d');
  c.clearRect(0, 0, W, H);
  c.scale(k, k);
  const names = [...STREETS_H, ...STREETS_V];
  const PW = 512;
  const PH = 72;
  names.forEach((n, idx) => {
    const x = (idx % 2) * PW;
    const y = Math.floor(idx / 2) * PH;
    c.fillStyle = '#123f86';
    c.fillRect(x, y, PW, PH);
    c.strokeStyle = '#eef2f6';
    c.lineWidth = 5;
    c.strokeRect(x + 7, y + 7, PW - 14, PH - 14);
    c.fillStyle = '#f2f4f6';
    c.font = 'bold 34px Arial, Helvetica, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(n.toUpperCase(), x + PW / 2, y + PH / 2 + 2, PW - 40);
  });
  // dígitos (brancos sobre fundo escuro)
  const DY = 12 * PH;
  for (let d = 0; d < 10; d++) {
    const x = d * 56;
    c.fillStyle = '#141414';
    c.fillRect(x, DY, 56, 80);
    c.fillStyle = '#f0ece0';
    c.font = 'bold 64px Georgia, serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(String(d), x + 28, DY + 44);
  }
  // PARE
  const sx = 870;
  const sy = DY + 2;
  const R = 74;
  c.beginPath();
  for (let q = 0; q < 8; q++) {
    const a = Math.PI / 8 + (q * Math.PI) / 4;
    c.lineTo(sx + R + Math.cos(a) * R, sy + R + Math.sin(a) * R);
  }
  c.closePath();
  c.fillStyle = '#f2f2f2';
  c.fill();
  c.beginPath();
  for (let q = 0; q < 8; q++) {
    const a = Math.PI / 8 + (q * Math.PI) / 4;
    c.lineTo(sx + R + Math.cos(a) * (R - 6), sy + R + Math.sin(a) * (R - 6));
  }
  c.closePath();
  c.fillStyle = '#b3121c';
  c.fill();
  c.fillStyle = '#ffffff';
  c.font = 'bold 40px Arial, Helvetica, sans-serif';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText('PARE', sx + R, sy + R + 2);
  const tex = toTex(cv, { repeat: false });
  const rect = (x, y, w, h) => [x / 1024, 1 - (y + h) / 1024, (x + w) / 1024, 1 - y / 1024];
  return {
    tex,
    name: (idx) => rect((idx % 2) * PW + 2, Math.floor(idx / 2) * PH + 2, PW - 4, PH - 4),
    digit: (d) => rect(d * 56 + 2, DY + 2, 52, 76),
    stop: rect(sx, sy, R * 2, R * 2),
  };
}

// ------------------------------------------------------------------ luz dos postes
// Os postes e as luzes de varanda não são luzes do three.js: as N mais próximas vão
// para dois arrays de uniforms e cada material soma a contribuição delas no shader.
export function lampUniforms(n) {
  return {
    n,
    uL9P: { value: Array.from({ length: n }, () => new THREE.Vector4(0, -1e4, 0, 1)) },
    uL9C: { value: Array.from({ length: n }, () => new THREE.Vector4(0, 0, 0, 0)) },
  };
}

const lampGLSL = (n) => /* glsl */ `
#define L9N ${n}
uniform vec4 uL9P[ L9N ];
uniform vec4 uL9C[ L9N ];
varying vec3 vL9W;
void l9Lights( vec3 P, vec3 N, vec3 V, float shin, inout vec3 dif, inout vec3 spec ) {
  for ( int i = 0; i < L9N; i ++ ) {
    vec4 lp = uL9P[ i ];
    vec4 lc = uL9C[ i ];
    vec3 d = lp.xyz - P;
    float d2 = dot( d, d );
    float r2 = lp.w * lp.w;
    if ( d2 >= r2 ) continue;
    vec3 l = d * inversesqrt( d2 );
    float w = 1.0 - d2 / r2;
    float att = w * w / ( d2 + 1.0 );
    // postes iluminam para baixo (cone); varandas em todas as direções
    float cone = mix( 1.0, smoothstep( 0.12, 0.5, l.y ), lc.w );
    vec3 c = lc.rgb * att * cone;
    dif += c * max( dot( N, l ), 0.0 );
    vec3 h = normalize( l + V );
    spec += c * pow( max( dot( N, h ), 0.0 ), shin ) * ( shin + 8.0 ) * 0.04;
  }
}
`;

// Acumula vários remendos de shader num material (encadeados).
export function patchMat(mat, key, fn) {
  const ud = mat.userData;
  if (!ud.patches) {
    ud.patches = [];
    ud.keys = [];
    mat.onBeforeCompile = (sh) => {
      for (const f of ud.patches) f(sh);
    };
    mat.customProgramCacheKey = () => ud.keys.join('|');
  }
  ud.patches.push(fn);
  ud.keys.push(key);
  return mat;
}

// Injeta a luz dos postes. opts: { shin, spec } (expressões GLSL), { pre } código antes da soma.
export function injectLamps(mat, U, opts = {}) {
  const shin = opts.shin || '18.0';
  const spec = opts.spec || '0.04';
  return patchMat(mat, 'l9lamps' + U.n + shin + spec, (sh) => {
    sh.uniforms.uL9P = U.uL9P;
    sh.uniforms.uL9C = U.uL9C;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vL9W;').replace(
      '#include <project_vertex>',
      `#include <project_vertex>
      vec4 l9wp = vec4( transformed, 1.0 );
      #ifdef USE_INSTANCING
        l9wp = instanceMatrix * l9wp;
      #endif
      vL9W = ( modelMatrix * l9wp ).xyz;`,
    );
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + lampGLSL(U.n)).replace(
      '#include <lights_fragment_end>',
      `#include <lights_fragment_end>
      {
        vec3 l9N = normalize( ( vec4( normal, 0.0 ) * viewMatrix ).xyz );
        vec3 l9V = normalize( cameraPosition - vL9W );
        vec3 l9D = vec3( 0.0 );
        vec3 l9S = vec3( 0.0 );
        l9Lights( vL9W, l9N, l9V, ${shin}, l9D, l9S );
        reflectedLight.directDiffuse += diffuseColor.rgb * l9D;
        #ifdef LAMBERT
          reflectedLight.directDiffuse += l9S * ( ${spec} ) * 0.6;
        #else
          reflectedLight.directSpecular += l9S * ( ${spec} );
        #endif
      }`,
    );
  });
}

// Material padrão do nível (Lambert na qualidade baixa).
export function baseMat(Q, o) {
  const p = { color: 0xffffff, vertexColors: o.vertexColors !== false };
  if (o.map) p.map = o.map;
  if (o.emissiveMap) {
    p.emissiveMap = o.emissiveMap;
    p.emissive = new THREE.Color(1, 1, 1);
  }
  if (o.side) p.side = o.side;
  if (o.alphaTest) p.alphaTest = o.alphaTest;
  if (Q.lambert) return new THREE.MeshLambertMaterial(p);
  if (o.normalMap && Q.normalMaps) {
    p.normalMap = o.normalMap;
    p.normalScale = new THREE.Vector2(o.normalScale || 1, o.normalScale || 1);
  }
  p.roughness = o.roughness !== undefined ? o.roughness : 0.9;
  p.metalness = o.metalness || 0;
  if (o.envMap) {
    p.envMap = o.envMap;
    p.envMapIntensity = o.envIntensity !== undefined ? o.envIntensity : 1;
  }
  return new THREE.MeshStandardMaterial(p);
}

// Chão (asfalto molhado): UV em coordenadas de mundo, poças, sarjeta úmida,
// rachaduras seladas, bueiros e reflexos alongados dos postes.
export function makeGroundMat(Q, U, P, RW, env) {
  const as = getTex('asphalt', Q.tex);
  const nz = getTex('l9Noise', Q.tex).map;
  const mat = baseMat(Q, {
    map: as.map,
    normalMap: as.normalMap,
    normalScale: 0.6,
    roughness: 0.6,
    envMap: env,
    envIntensity: 0.8,
    vertexColors: false,
  });
  const uni = { uNoise: { value: nz } };
  patchMat(mat, 'l9ground', (sh) => {
    Object.assign(sh.uniforms, uni);
    sh.vertexShader = sh.vertexShader.replace(
      '#include <uv_vertex>',
      `#include <uv_vertex>
      vec2 l9xz = ( modelMatrix * vec4( position, 1.0 ) ).xz * 0.25;
      #ifdef USE_MAP
        vMapUv = l9xz;
      #endif
      #ifdef USE_NORMALMAP
        vNormalMapUv = l9xz;
      #endif`,
    );
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform sampler2D uNoise;
        float l9Wet = 0.0;
        float l9Pud = 0.0;`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        {
          vec2 w = vL9W.xz;
          vec4 nA = texture2D( uNoise, w * 0.021 );
          vec4 nB = texture2D( uNoise, w * 0.083 + 0.31 );
          vec2 q = mod( w + ${gf(P / 2)}, ${gf(P)} ) - ${gf(P / 2)};
          vec2 a = abs( q );
          float curb = ( a.x < ${gf(RW)} && a.y < ${gf(RW)} ) ? length( vec2( ${gf(RW)} ) - a ) : ${gf(RW)} - min( a.x, a.y );
          float gutter = smoothstep( 0.9, 0.05, curb );
          l9Pud = smoothstep( 0.6, 0.66, nA.r + nB.g * 0.22 + gutter * 0.2 );
          l9Wet = clamp( 0.45 + gutter * 0.4 + nB.b * 0.25, 0.0, 1.0 );
          vec3 c = diffuseColor.rgb * ( 0.85 + nA.g * 0.3 );
          // remendos de asfalto mais escuro
          c *= 1.0 - smoothstep( 0.62, 0.64, nB.a ) * 0.25;
          // rachaduras seladas com piche
          float tar = 1.0 - smoothstep( 0.0, 0.006, abs( nB.b - 0.5 ) );
          c = mix( c, vec3( 0.015 ), tar * 0.8 );
          l9Pud = max( l9Pud, tar * 0.5 );
          // bueiro perto de cada cruzamento
          vec2 mh = q - vec2( 1.7, -2.3 );
          float md = length( mh );
          if ( md < 0.38 ) {
            float grid = step( 0.5, fract( ( mh.x + mh.y ) * 9.0 ) ) * step( md, 0.33 );
            c = mix( vec3( 0.06, 0.055, 0.05 ), vec3( 0.03 ), grid );
            l9Pud = 0.15;
            l9Wet = 0.7;
          }
          // superfície molhada fica mais escura
          c *= mix( 1.0, 0.5, l9Wet );
          c *= mix( 1.0, 0.45, l9Pud );
          diffuseColor.rgb = c;
        }`,
      );
    if (!Q.lambert) {
      sh.fragmentShader = sh.fragmentShader.replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor = mix( mix( 0.75, 0.32, l9Wet ), 0.04, l9Pud );`,
      );
    }
    // reflexo dos postes no asfalto molhado: rastro alongado na vertical
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <lights_fragment_end>',
      `#include <lights_fragment_end>
      {
        vec3 V = normalize( cameraPosition - vL9W );
        vec3 R = reflect( -V, vec3( 0.0, 1.0, 0.0 ) );
        float fres = 0.04 + 0.96 * pow( 1.0 - max( V.y, 0.0 ), 5.0 );
        vec3 refl = vec3( 0.0 );
        for ( int i = 0; i < L9N; i ++ ) {
          vec4 lp = uL9P[ i ];
          vec4 lc = uL9C[ i ];
          vec3 d = lp.xyz - vL9W;
          float dh = length( d.xz );
          if ( dh > 32.0 ) continue;
          vec3 l = normalize( d );
          vec2 rh = normalize( R.xz + 1e-5 );
          vec2 lh = normalize( l.xz + 1e-5 );
          float az = 1.0 - dot( rh, lh );
          float el = R.y - l.y;
          float sharp = mix( 1.0, 8.0, l9Pud );
          float s = exp( -az * 900.0 * sharp - el * el * 18.0 * sharp );
          float fade = 1.0 - dh / 32.0;
          refl += lc.rgb * s * fade * fade * mix( 0.5, 2.5, l9Pud );
        }
        #ifdef LAMBERT
          reflectedLight.directDiffuse += refl * fres * 0.05 * ( 0.35 + l9Wet ) + vec3( 0.006, 0.009, 0.012 ) * fres * l9Pud;
        #else
          reflectedLight.directSpecular += refl * fres * 0.06 * ( 0.35 + l9Wet );
        #endif
      }`,
    );
  });
  injectLamps(mat, U, { shin: 'mix( 30.0, 220.0, l9Pud )', spec: 'mix( 0.1, 0.9, l9Pud ) * l9Wet' });
  return mat;
}

// Lotes (laje acima do meio-fio): faixa de grama, calçada de concreto e gramado.
// As faces verticais são o meio-fio.
export function makeYardMat(Q, U, P, RW, STRIP, LOT) {
  const grass = getTex('l9Grass', Q.tex).map;
  const side = getTex('sidewalk', Q.tex).map;
  const nz = getTex('l9Noise', Q.tex).map;
  const mat = baseMat(Q, { map: grass, roughness: 0.95, vertexColors: false });
  const uni = { uSide: { value: side }, uNoise: { value: nz } };
  patchMat(mat, 'l9yard', (sh) => {
    Object.assign(sh.uniforms, uni);
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform sampler2D uSide;
        uniform sampler2D uNoise;
        float l9Wet = 0.0;`,
      )
      .replace(
        '#include <map_fragment>',
        `{
          vec2 w = vL9W.xz;
          vec3 wn = normalize( ( vec4( vNormal, 0.0 ) * viewMatrix ).xyz );
          vec4 nA = texture2D( uNoise, w * 0.03 );
          vec2 q = mod( w + ${gf(P / 2)}, ${gf(P)} ) - ${gf(P / 2)};
          vec2 a = abs( q );
          float dm = min( a.x, a.y );
          vec3 grassC = texture2D( map, w * 0.5 ).rgb * ( 0.75 + nA.r * 0.5 );
          grassC = mix( grassC, grassC * vec3( 1.25, 1.05, 0.7 ), smoothstep( 0.55, 0.7, nA.g ) * 0.6 );
          vec3 c;
          if ( wn.y < 0.5 ) {
            // meio-fio
            c = texture2D( uSide, vec2( w.x + w.y, vL9W.y ) * 0.33 ).rgb * 0.95;
            l9Wet = 0.5;
          } else {
            bool corner = a.x < ${gf(LOT)} && a.y < ${gf(LOT)};
            bool walk = corner || ( dm > ${gf(RW + STRIP)} && dm < ${gf(LOT)} );
            if ( walk ) {
              // placas alinhadas com a calçada
              vec2 su = a.x < a.y ? vec2( ( a.x - ${gf(RW + STRIP)} ), w.y ) : vec2( w.x, ( a.y - ${gf(RW + STRIP)} ) );
              c = texture2D( uSide, su / 3.0 ).rgb * ( 0.8 + nA.b * 0.3 );
              c = mix( c, c * vec3( 0.75, 0.8, 0.7 ), smoothstep( 0.6, 0.75, nA.a ) * 0.5 );
              l9Wet = 0.35 + nA.g * 0.3;
            } else {
              c = grassC;
              // terra nas bordas da grama
              float edge = min( abs( dm - ${gf(RW + STRIP)} ), abs( dm - ${gf(LOT)} ) );
              c = mix( c, vec3( 0.07, 0.055, 0.04 ), smoothstep( 0.12, 0.0, edge ) * 0.6 );
              l9Wet = 0.08;
            }
          }
          diffuseColor.rgb *= c;
        }`,
      );
  });
  injectLamps(mat, U, { shin: '40.0', spec: 'l9Wet * 0.35' });
  return mat;
}

// Janelas: vidro escuro refletivo; algumas acesas (quente), TV (azul trêmulo) e
// janelas com uma silhueta parada. aGroup: 0 apagada, 1 acesa, 2 TV, 3 silhueta, 4 sala da TV da casa certa.
export function makeWindowMat(Q, U, env) {
  const t = getTex('l9Window', Q.tex);
  const mat = baseMat(Q, { map: t.map, emissiveMap: t.emissiveMap, roughness: 0.15, envMap: env, envIntensity: 1.2 });
  const uni = {
    uWin: {
      value: [
        new THREE.Color(0, 0, 0),
        new THREE.Color(1.9, 1.1, 0.5),
        new THREE.Color(0.5, 0.7, 1.4),
        new THREE.Color(1.6, 0.9, 0.42),
        new THREE.Color(0.5, 0.7, 1.4),
      ],
    },
  };
  patchMat(mat, 'l9win', (sh) => {
    Object.assign(sh.uniforms, uni);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aGroup;\nvarying float vWG;\nvarying vec2 vWUv;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvWG = aGroup;\nvWUv = uv;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uWin[ 5 ];\nvarying float vWG;\nvarying vec2 vWUv;')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        {
          int g = int( vWG + 0.5 );
          vec3 ec = uWin[ 0 ];
          for ( int i = 1; i < 5; i ++ ) if ( i == g ) ec = uWin[ i ];
          totalEmissiveRadiance *= ec;
          if ( g == 3 ) {
            // silhueta de alguém parado atrás do vidro
            vec2 lu = fract( vWUv * 2.0 );
            float head = 1.0 - smoothstep( 0.075, 0.085, length( ( lu - vec2( 0.5, 0.6 ) ) * vec2( 1.0, 0.85 ) ) );
            float body = 1.0 - smoothstep( 0.17, 0.19, length( ( lu - vec2( 0.5, 0.22 ) ) * vec2( 0.8, 0.9 ) ) );
            float neck = step( abs( lu.x - 0.5 ), 0.03 ) * step( 0.35, lu.y ) * step( lu.y, 0.55 );
            float m = max( max( head, body * step( lu.y, 0.4 ) ), neck );
            totalEmissiveRadiance *= 1.0 - m * 0.97;
            diffuseColor.rgb *= 1.0 - m * 0.9;
          }
        }`,
      );
  });
  injectLamps(mat, U, { shin: '90.0', spec: '0.9' });
  return { mat, uniforms: uni };
}

// Lâmpadas (cabeças dos postes, luzes de varanda): brilho por grupo.
// Grupos: 0 fixa, 1–3 piscando, 4 queimada, 5 varanda acesa, 6 varanda apagada.
export function makeLampMat() {
  return new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uI: { value: [6, 6, 6, 6, 0.02, 4, 0.04, 0] } }]),
    vertexShader: /* glsl */ `
      attribute float aGroup;
      varying vec3 vCol;
      varying float vG;
      #include <fog_pars_vertex>
      void main() {
        vCol = color;
        vG = aGroup;
        vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform float uI[ 8 ];
      varying vec3 vCol;
      varying float vG;
      #include <fog_pars_fragment>
      void main() {
        int g = int( vG + 0.5 );
        float k = uI[ 0 ];
        for ( int i = 1; i < 8; i ++ ) if ( i == g ) k = uI[ i ];
        gl_FragColor = vec4( vCol * ( k + 0.02 ), 1.0 );
        #include <fog_fragment>
      }`,
    vertexColors: true,
    fog: true,
  });
}

// Halos aditivos: cone de luz na neblina sob cada poste aceso e brilho em volta da
// lâmpada (billboard). uv1.x = 0 cone, 1 billboard; uv1.y = tamanho do billboard.
export function makeHaloMat(fogDensity) {
  return new THREE.ShaderMaterial({
    uniforms: { uI: { value: [6, 6, 6, 6, 0, 4, 0, 0] }, uFogD: { value: fogDensity }, uK: { value: 1 } },
    vertexShader: /* glsl */ `
      attribute float aGroup;
      #ifndef USE_UV1
        attribute vec2 uv1;
      #endif
      varying vec3 vCol;
      varying float vG;
      varying vec2 vUv;
      varying float vType;
      varying float vDist;
      varying float vEdge;
      void main() {
        vCol = color;
        vG = aGroup;
        vUv = uv;
        vType = uv1.x;
        vec3 p = position;
        if ( uv1.x > 0.5 ) {
          vec3 right = vec3( viewMatrix[ 0 ][ 0 ], viewMatrix[ 1 ][ 0 ], viewMatrix[ 2 ][ 0 ] );
          vec3 up = vec3( viewMatrix[ 0 ][ 1 ], viewMatrix[ 1 ][ 1 ], viewMatrix[ 2 ][ 1 ] );
          p += ( right * ( uv.x - 0.5 ) + up * ( uv.y - 0.5 ) ) * uv1.y;
          vEdge = 1.0;
        } else {
          vec3 wp = ( modelMatrix * vec4( p, 1.0 ) ).xyz;
          vec3 v = normalize( cameraPosition - wp );
          vEdge = abs( dot( normalize( normal ), v ) );
        }
        vec4 mv = modelViewMatrix * vec4( p, 1.0 );
        vDist = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uI[ 8 ];
      uniform float uFogD;
      uniform float uK;
      varying vec3 vCol;
      varying float vG;
      varying vec2 vUv;
      varying float vType;
      varying float vDist;
      varying float vEdge;
      void main() {
        int g = int( vG + 0.5 );
        float k = uI[ 0 ];
        for ( int i = 1; i < 8; i ++ ) if ( i == g ) k = uI[ i ];
        float a;
        if ( vType > 0.5 ) {
          float r = length( vUv - 0.5 ) * 2.0;
          a = exp( -r * r * 7.0 ) * 0.09 + exp( -r * r * 40.0 ) * 0.12;
        } else {
          a = pow( vEdge, 2.5 ) * pow( vUv.y, 1.6 ) * 0.03 * smoothstep( 0.0, 0.25, vUv.y );
        }
        float fog = exp( -pow( uFogD * vDist * 0.75, 2.0 ) );
        gl_FragColor = vec4( vCol * k * a * fog * uK, 1.0 );
      }`,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

// Folhagem com balanço do vento (árvores, arbustos, cercas vivas).
export function makeFoliageMat(Q, U, windU) {
  const t = getTex('l9Leaves', Q.tex);
  const mat = baseMat(Q, { map: t.map, normalMap: t.normalMap, roughness: 0.85 });
  patchMat(mat, 'l9wind', (sh) => {
    sh.uniforms.uTime = windU.uTime;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;').replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      {
        vec3 wp = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
        float k = smoothstep( 1.2, 7.0, wp.y );
        float gust = sin( uTime * 0.6 + wp.x * 0.05 + wp.z * 0.03 ) * 0.6 + 0.5;
        float sw = sin( uTime * 1.7 + wp.x * 0.4 + wp.z * 0.3 ) * 0.5 + sin( uTime * 3.1 + wp.y * 1.3 ) * 0.2;
        transformed.x += ( sw + gust ) * 0.09 * k;
        transformed.z += ( sw * 0.6 + gust * 0.4 ) * 0.07 * k;
      }`,
    );
  });
  injectLamps(mat, U, { shin: '10.0', spec: '0.05' });
  return mat;
}

// Céu noturno: brilho de luz urbana no horizonte, estrelas fracas, lua com halo e nuvens.
export function makeNightSky(o) {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uZen: { value: new THREE.Color(...o.zenith) },
      uHor: { value: new THREE.Color(...o.horizon) },
      uFog: { value: new THREE.Color(...o.fog) },
      uMoonDir: { value: o.moonDir.clone().normalize() },
      uMoon: { value: new THREE.Color(...o.moon) },
      uCloud: { value: new THREE.Color(...o.cloud) },
      uCloudLit: { value: new THREE.Color(...o.cloudLit) },
      uCover: { value: o.cover },
      uTime: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        vec4 p = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
        gl_Position = p.xyww;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uZen, uHor, uFog, uMoonDir, uMoon, uCloud, uCloudLit;
      uniform float uCover, uTime;
      varying vec3 vDir;
      ${SKY_GLSL}
      void main() {
        vec3 d = normalize( vDir );
        float h = d.y;
        vec3 col = mix( uHor, uZen, pow( clamp( h, 0.0, 1.0 ), 0.55 ) );
        // estrelas (poucas: a cidade apaga a maioria)
        vec3 cell = floor( d * 260.0 );
        float sh = fract( sin( dot( cell, vec3( 12.9898, 78.233, 37.719 ) ) ) * 43758.5453 );
        float star = step( 0.9975, sh ) * smoothstep( 0.1, 0.5, h );
        float tw = 0.6 + 0.4 * sin( uTime * 3.0 + sh * 400.0 );
        col += vec3( 0.55, 0.6, 0.7 ) * star * tw * ( sh - 0.9975 ) * 400.0 * 0.05;
        // lua
        float md = dot( d, uMoonDir );
        vec3 mt = normalize( cross( uMoonDir, vec3( 0.0, 1.0, 0.0 ) ) );
        vec3 mb = cross( mt, uMoonDir );
        vec2 mp = vec2( dot( d, mt ), dot( d, mb ) ) * 60.0;
        float disk = smoothstep( 0.99957, 0.99966, md );
        float maria = sFbm( mp * 3.0 + 4.0 );
        col += uMoon * disk * ( 0.75 + 0.35 * smoothstep( 0.35, 0.65, maria ) ) * 6.0;
        col += uMoon * ( pow( max( md, 0.0 ), 900.0 ) * 0.5 + pow( max( md, 0.0 ), 30.0 ) * 0.06 + pow( max( md, 0.0 ), 4.0 ) * 0.015 );
        // nuvens
        vec2 cp = d.xz / max( h + 0.08, 0.03 ) * 0.4 + vec2( uTime * 0.003, uTime * 0.0012 );
        float n = sFbm( cp * 1.3 );
        float n2 = sFbm( cp * 4.2 + 3.0 );
        float ca = smoothstep( uCover, uCover + 0.35, n + n2 * 0.2 ) * smoothstep( 0.0, 0.15, h );
        vec3 cc = mix( uCloud, uCloudLit, clamp( pow( max( md, 0.0 ), 6.0 ) * 1.4 + n2 * 0.3, 0.0, 1.0 ) );
        col = mix( col, cc, ca * 0.92 );
        col = mix( uFog, col, smoothstep( -0.02, 0.2, h ) );
        gl_FragColor = vec4( col, 1.0 );
      }`,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1000, 32, 16), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return mesh;
}

// Rosto do Cão para o susto (sem imagens externas).
export function houndFaceURL() {
  const W = 256;
  const cv = makeCanvas(W, W);
  const c = cv.getContext('2d');
  c.fillStyle = '#000';
  c.fillRect(0, 0, W, W);
  const rnd = mulberry32(77);
  // rosto pálido e magro
  const g = c.createRadialGradient(128, 120, 10, 128, 130, 110);
  g.addColorStop(0, '#d8d2c8');
  g.addColorStop(0.6, '#9b958c');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = g;
  c.beginPath();
  c.ellipse(128, 132, 70, 96, 0, 0, Math.PI * 2);
  c.fill();
  // olhos fundos
  for (const x of [98, 158]) {
    const e = c.createRadialGradient(x, 112, 2, x, 112, 24);
    e.addColorStop(0, '#000');
    e.addColorStop(0.55, '#050403');
    e.addColorStop(1, 'rgba(40,35,30,0)');
    c.fillStyle = e;
    c.beginPath();
    c.ellipse(x, 112, 24, 18, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = 'rgba(230,240,220,0.9)';
    c.beginPath();
    c.arc(x + 3, 113, 2.2, 0, Math.PI * 2);
    c.fill();
  }
  // boca aberta, comprida demais
  c.fillStyle = '#0a0606';
  c.beginPath();
  c.ellipse(128, 196, 24, 34, 0, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = 'rgba(210,200,180,0.7)';
  c.lineWidth = 2;
  for (let i = 0; i < 7; i++) {
    c.beginPath();
    c.moveTo(108 + i * 6.5, 166 + Math.abs(i - 3) * 2);
    c.lineTo(110 + i * 6.5, 176 + Math.abs(i - 3) * 2);
    c.stroke();
  }
  // cabelo preto comprido caindo sobre o rosto
  c.strokeStyle = 'rgba(5,5,5,0.92)';
  for (let i = 0; i < 90; i++) {
    const x = 40 + rnd() * 176;
    c.lineWidth = 1 + rnd() * 3;
    c.beginPath();
    c.moveTo(128 + (x - 128) * 0.4, 20 + rnd() * 20);
    c.quadraticCurveTo(x + (rnd() - 0.5) * 30, 120, x + (rnd() - 0.5) * 40, 200 + rnd() * 60);
    c.stroke();
  }
  return cv.toDataURL();
}
