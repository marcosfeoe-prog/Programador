// Renderização: materiais dos blocos, qualidade gráfica (Baixo/Médio/Alto/ULTRA/MAX), sombras do sol,
// pós-processamento, céu, nuvens, seleção e rachaduras.
import * as THREE from 'three';
import { CS, CH, SEA } from './consts.js';
import { buildChunkGeometry, setMeshOptions } from './mesher.js';
import { tileUV, Painter, canvasTexture } from './textures.js';
import { mulberry32, Perlin } from './noise.js';
import { SKY_VERT, SKY_FRAG, CLOUD_GLSL } from './maxsky.js';

// ---------- níveis de qualidade ----------
export const QUALITY = {
  low: { label: 'Baixo', pixelRatio: 0.6, shadows: 0, waving: false, hd: false, post: false, water: false, skyClouds: false, blockClouds: false, fastLeaves: true, particles: 0.35, fallingLeaves: false, articulated: false },
  medium: { label: 'Médio', pixelRatio: 1.5, shadows: 0, waving: false, hd: false, post: false, water: false, skyClouds: false, blockClouds: true, fastLeaves: false, particles: 1, fallingLeaves: false, articulated: false },
  high: { label: 'Alto', pixelRatio: 1.75, shadows: 1024, shadowRange: 44, pcf: 1, waving: true, hd: false, post: true, bloom: true, godrays: false, water: true, skyClouds: false, blockClouds: true, fastLeaves: false, particles: 1, fallingLeaves: true, articulated: false },
  ultra: { label: 'ULTRA', pixelRatio: 2, shadows: 2048, shadowRange: 64, pcf: 2, waving: true, hd: 64, post: true, bloom: true, godrays: true, water: true, skyClouds: true, blockClouds: false, fastLeaves: false, particles: 1, fallingLeaves: true, articulated: true },
  max: {
    label: 'MAX', pixelRatio: 2, shadows: 4096, shadowRange: 96, pcf: 3, waving: true, hd: 128, post: true, bloom: true, godrays: true, water: true,
    skyClouds: true, blockClouds: false, fastLeaves: false, particles: 1, fallingLeaves: true, articulated: true,
    max: true, pom: true, ssao: true, reflections: true, fxaa: true, litModels: true, skinScale: 4, fireflies: true,
  },
};
export const QUALITY_ORDER = ['low', 'medium', 'high', 'ultra', 'max'];

// Uniforms compartilhados entre blocos, céu e modelos iluminados
export const U = {
  uAtlas: { value: null },
  uNormalAtlas: { value: null },
  uShadowMap: { value: null },
  uShadowMatrix: { value: new THREE.Matrix4() },
  uShadowTexel: { value: 1 / 1024 },
  uSkyDarken: { value: 0 },
  uSkyColor: { value: new THREE.Color(1, 1, 1) },
  uAmbColor: { value: new THREE.Color(0.6, 0.7, 0.9) },
  uGamma: { value: 0.35 },
  uFogColor: { value: new THREE.Color(0.7, 0.8, 1) },
  uFogNear: { value: 80 },
  uFogFar: { value: 120 },
  uSunDir: { value: new THREE.Vector3(0, 1, 0) },
  uSunColor: { value: new THREE.Color(1, 1, 1) },
  uSunAmount: { value: 1 },
  uCamPos: { value: new THREE.Vector3() },
  uSkyTop: { value: new THREE.Color() },
  uSkyHor: { value: new THREE.Color() },
  uTime: { value: 0 },
  uWindStrength: { value: 1 },
  uWet: { value: 0 },
  // MAX
  uSkyTex: { value: null },
  uResolution: { value: new THREE.Vector2(1, 1) },
  uRefraction: { value: null },
  uReflection: { value: null },
  uReflMatrix: { value: new THREE.Matrix4() },
  uReflOn: { value: 0 },
  uWaterLevel: { value: SEA + 0.85 },
  uClipY: { value: -1e9 },
  uCloudCover: { value: 0.5 },
};

const blockVert = /* glsl */ `
  attribute vec4 aLight;
  attribute vec3 aTint;
  attribute vec3 aTangent;
  attribute float aFlags;
  uniform float uTime;
  uniform float uWindStrength;
  varying vec2 vUv;
  varying vec4 vLight;
  varying vec3 vTint;
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying vec3 vTangent;
  varying float vFlags;
  varying float vDist;
  varying float vViewZ;
  void main() {
    vUv = uv;
    vLight = aLight;
    vTint = aTint;
    vFlags = aFlags;
    vNormal = normal;
    vTangent = aTangent;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    #ifdef WAVING
      float t = uTime;
      if (aFlags > 0.5 && aFlags < 1.5) {
        // folhas balançando com o vento
        float w = uWindStrength;
        wp.x += (sin(t * 1.6 + wp.x * 0.7 + wp.y * 0.5) * 0.035 + sin(t * 3.3 + wp.z * 1.3) * 0.012) * w;
        wp.z += cos(t * 1.3 + wp.z * 0.6 + wp.y * 0.4) * 0.035 * w;
        wp.y += sin(t * 2.0 + wp.x + wp.z) * 0.015 * w;
      } else if (aFlags > 1.5 && aFlags < 2.5) {
        // topo das plantas: rajadas lentas + tremor rápido
        float gust = sin(t * 0.55 + wp.x * 0.04 + wp.z * 0.03) * 0.5 + 0.5;
        wp.x += (sin(t * 2.1 + wp.x * 0.8 + wp.z * 0.3) * (0.05 + 0.09 * gust)) * uWindStrength;
        wp.z += (cos(t * 1.7 + wp.z * 0.8 + wp.x * 0.2) * 0.05) * uWindStrength;
      } else if (aFlags > 3.5 && aFlags < 4.5) {
        // ondas na superfície da água
        wp.y += (sin(t * 1.5 + wp.x * 0.8) * 0.5 + sin(t * 1.15 + wp.z * 0.9 + 1.3) * 0.5) * 0.04 - 0.04;
      }
    #endif
    vWorld = wp.xyz;
    vec4 mv = viewMatrix * wp;
    vDist = length(mv.xyz);
    vViewZ = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

// pedaço de GLSL das sombras (usado pelos blocos e pelos modelos iluminados)
export const SHADOW_GLSL = /* glsl */ `
  uniform sampler2D uShadowMap;
  uniform mat4 uShadowMatrix;
  uniform float uShadowTexel;
  const vec2 PD[16] = vec2[16](
    vec2(-0.94201624, -0.39906216), vec2(0.94558609, -0.76890725), vec2(-0.094184101, -0.92938870), vec2(0.34495938, 0.29387760),
    vec2(-0.91588581, 0.45771432), vec2(-0.81544232, -0.87912464), vec2(-0.38277543, 0.27676845), vec2(0.97484398, 0.75648379),
    vec2(0.44323325, -0.97511554), vec2(0.53742981, -0.47373420), vec2(-0.26496911, -0.41893023), vec2(0.79197514, 0.19090188),
    vec2(-0.24188840, 0.99706507), vec2(-0.81409955, 0.91437590), vec2(0.19984126, 0.78641367), vec2(0.14383161, -0.14100790));
  float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
  float shadowAt(vec3 wp, vec3 n) {
    #ifdef SHADOWS
      vec4 sc = uShadowMatrix * vec4(wp + n * 0.06, 1.0);
      if (sc.x <= 0.0 || sc.x >= 1.0 || sc.y <= 0.0 || sc.y >= 1.0 || sc.z >= 1.0) return 1.0;
      float bias = 0.0008;
      float s = 0.0;
      #if PCF == 3
        // sombra suave com penumbra variável (PCSS): mais nítida perto do objeto, borrada longe
        float a = ign(gl_FragCoord.xy) * 6.2831853;
        mat2 R = mat2(cos(a), sin(a), -sin(a), cos(a));
        float avg = 0.0, cnt = 0.0;
        for (int i = 0; i < 12; i++) {
          float d = texture2D(uShadowMap, sc.xy + R * PD[i] * uShadowTexel * 8.0).r;
          if (d < sc.z - bias) { avg += d; cnt += 1.0; }
        }
        if (cnt < 0.5) s = 1.0;
        else {
          avg /= cnt;
          float pen = clamp((sc.z - avg) * 170.0, 1.0, 10.0);
          for (int i = 0; i < 16; i++) s += step(sc.z - bias, texture2D(uShadowMap, sc.xy + R * PD[i] * uShadowTexel * pen).r);
          s /= 16.0;
        }
      #elif PCF == 2
        for (int i = -2; i <= 2; i++) for (int j = -2; j <= 2; j++)
          s += step(sc.z - bias, texture2D(uShadowMap, sc.xy + vec2(float(i), float(j)) * uShadowTexel * 0.75).r);
        s /= 25.0;
      #else
        for (int i = 0; i <= 1; i++) for (int j = 0; j <= 1; j++)
          s += step(sc.z - bias, texture2D(uShadowMap, sc.xy + (vec2(float(i), float(j)) - 0.5) * uShadowTexel).r);
        s /= 4.0;
      #endif
      vec2 e = min(sc.xy, 1.0 - sc.xy);
      float fade = smoothstep(0.0, 0.08, min(e.x, e.y));
      return mix(1.0, s, fade);
    #else
      return 1.0;
    #endif
  }
`;

const blockFrag = /* glsl */ `
  uniform sampler2D uAtlas;
  uniform sampler2D uNormalAtlas;
  uniform float uSkyDarken;
  uniform vec3 uSkyColor;
  uniform vec3 uAmbColor;
  uniform float uGamma;
  uniform vec3 uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;
  uniform float uAlphaTest;
  uniform float uOpacity;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform float uSunAmount;
  uniform vec3 uCamPos;
  uniform vec3 uSkyTop;
  uniform vec3 uSkyHor;
  uniform float uTime;
  uniform float uWet;
  uniform sampler2D uSkyTex;
  uniform vec2 uResolution;
  uniform sampler2D uRefraction;
  uniform sampler2D uReflection;
  uniform mat4 uReflMatrix;
  uniform float uReflOn;
  uniform float uWaterLevel;
  uniform float uClipY;
  uniform float uCloudCover;
  varying vec2 vUv;
  varying vec4 vLight;
  varying vec3 vTint;
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying vec3 vTangent;
  varying float vFlags;
  varying float vDist;
  varying float vViewZ;
  ${SHADOW_GLSL}
  #ifdef MAX
    ${CLOUD_GLSL}
    // sombra das nuvens que passam no céu
    float cloudShadow(vec3 wp) {
      if (uSunDir.y < 0.05) return 1.0;
      vec2 p = wp.xz + uSunDir.xz / uSunDir.y * (330.0 - wp.y);
      float c = cloudMap(p, uTime) - (1.0 - uCloudCover) * 0.95 + 0.28 - 0.45;
      return 1.0 - smoothstep(-0.06, 0.16, c) * 0.72;
    }
    // cáusticas: luz ondulada no fundo da água
    float caustics(vec2 p, float t) {
      vec2 q = p * 0.9;
      float c = 0.0;
      for (int i = 0; i < 3; i++) {
        q += vec2(sin(q.y * 1.7 + t * 0.9), cos(q.x * 1.3 - t * 0.7)) * 0.6;
        c += pow(abs(sin(q.x + q.y + t * 0.5)), 6.0);
        q *= 1.6;
      }
      return c;
    }
  #endif

  float lb(float L) {
    float f = 1.0 - L / 15.0;
    float b = (1.0 - f) / (f * 3.0 + 1.0);
    return mix(b, sqrt(b), uGamma);
  }

  #ifdef POM
    // relevo por parallax: anda pelo mapa de altura até achar a superfície
    vec2 pom(vec2 cell, vec2 f, vec3 vt, float scale, vec2 dx, vec2 dy) {
      const int STEPS = 22;
      float layer = 1.0 / float(STEPS);
      vec2 delta = vt.xy / max(vt.z, 0.2) * scale * layer;
      float depth = 0.0;
      float h = 1.0 - textureGrad(uNormalAtlas, (cell + f) / 16.0, dx, dy).b;
      vec2 pf = f;
      float ph = h, pd = 0.0;
      for (int i = 0; i < STEPS; i++) {
        if (depth >= h) break;
        pf = f;
        ph = h;
        pd = depth;
        f -= delta;
        depth += layer;
        h = 1.0 - textureGrad(uNormalAtlas, (cell + clamp(f, 0.002, 0.998)) / 16.0, dx, dy).b;
      }
      float after = h - depth, before = ph - pd;
      float w = after / (after - before + 1e-5);
      return mix(f, pf, clamp(w, 0.0, 1.0));
    }
    // o próprio relevo faz sombra (pedrinhas, tijolos)
    float pomShadow(vec2 cell, vec2 f, vec3 lt, float scale, vec2 dx, vec2 dy) {
      if (lt.z <= 0.0) return 1.0;
      float h0 = textureGrad(uNormalAtlas, (cell + f) / 16.0, dx, dy).b;
      float sh = 0.0;
      for (int i = 1; i <= 6; i++) {
        float t = float(i) / 6.0;
        vec2 g = clamp(f + lt.xy / lt.z * scale * t * (1.0 - h0), 0.002, 0.998);
        float h = textureGrad(uNormalAtlas, (cell + g) / 16.0, dx, dy).b;
        sh = max(sh, (h - (h0 + t * (1.0 - h0))) * 6.0);
      }
      return 1.0 - clamp(sh, 0.0, 0.7);
    }
  #endif

  void main() {
    #ifdef MAX
      if (vWorld.y < uClipY) discard;
    #endif
    vec3 N = normalize(vNormal);
    float alpha;
    vec4 tex;
    #ifdef HD
      vec3 T = normalize(vTangent - N * dot(vTangent, N));
      vec3 Bt = cross(N, T);
      vec2 dx = dFdx(vUv), dy = dFdy(vUv);
      vec2 cell = floor(vUv * 16.0);
      vec2 f = fract(vUv * 16.0);
      float selfShadow = 1.0;
      #ifdef POM
        if (vFlags < 0.5 && vDist < 22.0) {
          vec3 Vw = normalize(uCamPos - vWorld);
          vec3 vt = vec3(dot(Vw, T), dot(Vw, Bt), dot(Vw, N));
          // some perto das bordas do bloco para não marcar a emenda entre blocos
          vec2 ef = min(f, 1.0 - f);
          float sc = 0.05 * (1.0 - smoothstep(14.0, 22.0, vDist)) * smoothstep(0.0, 0.12, min(ef.x, ef.y));
          if (vt.z > 0.0 && sc > 0.0) {
            f = pom(cell, f, vt, sc, dx, dy);
            selfShadow = pomShadow(cell, clamp(f, 0.002, 0.998), vec3(dot(uSunDir, T), dot(uSunDir, Bt), dot(uSunDir, N)), sc, dx, dy);
          }
        }
      #endif
      // fica dentro da textura do bloco para não "vazar" para a vizinha no atlas
      float m = clamp(max(length(dx), length(dy)) * 16.0 * 0.6, 0.5 / TILE_RES, 0.2);
      vec2 uvF = (cell + clamp(f, m, 1.0 - m)) / 16.0;
      tex = textureGrad(uAtlas, uvF, dx, dy);
      vec4 nm = textureGrad(uNormalAtlas, uvF, dx, dy);
    #else
      tex = texture2D(uAtlas, vUv);
    #endif
    if (tex.a < uAlphaTest) discard;
    float skyL = max(0.0, vLight.x * 15.0 - uSkyDarken);
    float bs = lb(skyL);
    float bb = lb(vLight.y * 15.0);
    float ao = vLight.w;
    // quanto deste ponto enxerga o céu (só aí o sol pode bater)
    float exposure = smoothstep(0.6, 0.95, vLight.x);
    alpha = tex.a * uOpacity;
    vec3 col;
    bool isWater = vFlags > 3.5 && vFlags < 4.5;
    #ifdef HD
      vec3 tn = vec3(nm.xy * 2.0 - 1.0, 0.0);
      tn.z = sqrt(max(0.04, 1.0 - dot(tn.xy, tn.xy)));
      vec3 Np = normalize(T * tn.x + Bt * tn.y + N * tn.z);
      float shadow = shadowAt(vWorld, N);
      if (vFlags > 0.5 && vFlags < 1.5) shadow = 0.45 + 0.55 * shadow;
      #ifdef MAX
        shadow *= cloudShadow(vWorld) * selfShadow;
      #endif
      float ndl = max(dot(Np, uSunDir), 0.0);
      float wrap = max(dot(N, uSunDir) * 0.5 + 0.5, 0.0);
      float sunVis = ndl * shadow * exposure * uSunAmount;
      #ifdef MAX
        // luz do céu azulada nas sombras, sol quente no que está iluminado
        vec3 ambient = uAmbColor * bs * (0.36 + 0.16 * Np.y + 0.06 * wrap + 0.38 * (1.0 - uSunAmount));
        vec3 albedo = tex.rgb * vTint * (1.0 - uWet * 0.18 * step(0.5, N.y) * exposure);
        // tochas tremulando
        vec3 cellP = floor(vWorld + N * 0.5);
        float fl = 1.0 + 0.05 * sin(uTime * 9.0 + dot(cellP, vec3(1.3, 2.1, 0.7))) + 0.035 * sin(uTime * 23.0 + cellP.x);
        vec3 torch = bb * fl * vec3(1.15, 0.78, 0.48) * 1.2;
        vec3 direct = uSunColor * sunVis;
        // cáusticas no fundo de lagos e do mar
        if (vWorld.y < uWaterLevel && vLight.x < 0.93 && vLight.x > 0.25) direct += uSunColor * caustics(vWorld.xz, uTime) * 0.35 * uSunAmount * ndl;
      #else
        vec3 ambient = uSkyColor * bs * (0.34 + 0.14 * Np.y + 0.08 * wrap + 0.38 * (1.0 - uSunAmount));
        vec3 albedo = tex.rgb * vTint;
        vec3 torch = bb * vec3(1.08, 0.82, 0.56) * 1.15;
        vec3 direct = uSunColor * sunVis;
      #endif
      vec3 light = (ambient + direct) * ao + torch * ao;
      light = max(light, vec3(0.02));
      col = albedo * light;
      vec3 V = normalize(uCamPos - vWorld);
      vec3 H = normalize(uSunDir + V);
      float gloss = max(nm.a, uWet * 0.6 * step(0.5, N.y) * exposure);
      float sp = pow(max(dot(Np, H), 0.0), mix(12.0, 120.0, gloss)) * gloss * sunVis;
      col += uSunColor * sp * 0.9;
      // plantas e folhas deixam passar luz (translucidez)
      if (vFlags > 0.5 && vFlags < 2.5) col += albedo * uSunColor * max(dot(-N, uSunDir), 0.0) * 0.25 * exposure * shadow * uSunAmount;
    #else
      float sh = 1.0;
      #ifdef SHADOWS
        float shadow = shadowAt(vWorld, N);
        if (vFlags > 0.5 && vFlags < 1.5) shadow = 0.5 + 0.5 * shadow;
        float facing = step(0.05, dot(N, uSunDir));
        sh = mix(1.0, mix(0.5, 1.0, shadow), exposure * facing * uSunAmount);
      #endif
      vec3 light = max(bs * sh * uSkyColor, bb * vec3(1.05, 0.9, 0.72)) * vLight.z * ao;
      light = max(light, vec3(0.025));
      col = tex.rgb * vTint * light;
    #endif
    #ifdef WATER_FX
      if (isWater) {
        vec3 V = normalize(uCamPos - vWorld);
        if (V.y > 0.0) {
          vec2 p = vWorld.xz;
          float t = uTime;
          vec2 g = vec2(0.0);
          g += vec2(0.8, 0.6) * cos(dot(p, vec2(0.8, 0.6)) * 1.3 + t * 1.6) * 0.09;
          g += vec2(-0.5, 0.86) * cos(dot(p, vec2(-0.5, 0.86)) * 2.1 + t * 2.3) * 0.06;
          g += vec2(0.2, -0.98) * cos(dot(p, vec2(0.2, -0.98)) * 3.7 + t * 3.1) * 0.035;
          g += vec2(-0.9, -0.4) * cos(dot(p, vec2(-0.9, -0.4)) * 6.3 + t * 4.2) * 0.02;
          #ifdef MAX
            // ondulações finas extras
            g += vec2(0.6, -0.8) * cos(dot(p, vec2(0.6, -0.8)) * 11.0 + t * 5.3) * 0.012;
            g += vec2(-0.3, -0.95) * cos(dot(p, vec2(-0.3, -0.95)) * 17.0 + t * 6.1) * 0.008;
            g *= 1.0 + uWet * 1.5;
          #endif
          vec3 Nw = normalize(vec3(-g.x, 1.0, -g.y));
          float fres = 0.02 + 0.98 * pow(1.0 - max(dot(Nw, V), 0.0), 5.0);
          vec3 R = reflect(-V, Nw);
          float skyExp = lb(skyL);
          float shadowW = shadowAt(vWorld, vec3(0.0, 1.0, 0.0));
          float spec = pow(max(dot(R, uSunDir), 0.0), 220.0) * 4.0 * shadowW * exposure * uSunAmount;
          #ifdef MAX
            vec2 suv = gl_FragCoord.xy / uResolution;
            // reflexo do mundo (espelho planar) ou do céu
            vec3 refl;
            vec2 sky2 = vec2(clamp(suv.x + Nw.x * 0.05, 0.0, 1.0), clamp(1.0 - suv.y + 0.02, 0.0, 1.0));
            vec3 skyRefl = texture2D(uSkyTex, sky2).rgb;
            if (uReflOn > 0.5 && abs(vWorld.y - uWaterLevel) < 0.6) {
              vec4 rp = uReflMatrix * vec4(vWorld, 1.0);
              vec2 ruv = rp.xy / rp.w + Nw.xz * 0.035;
              refl = texture2D(uReflection, clamp(ruv, 0.001, 0.999)).rgb;
            } else refl = skyRefl * (0.35 + 0.65 * exposure);
            // refração com absorção pela profundidade: raso é claro, fundo é azul-escuro
            vec2 rf = suv + Nw.xz * 0.045 * min(1.0, 8.0 / vDist);
            vec4 under = texture2D(uRefraction, rf);
            if (under.a < vViewZ) under = texture2D(uRefraction, suv);
            float depthW = max(under.a - vViewZ, 0.0);
            float thick = depthW * (1.0 + (1.0 - V.y));
            vec3 absorb = exp(-vec3(0.42, 0.085, 0.055) * thick);
            vec3 deep = vec3(0.012, 0.075, 0.11) * (bs + bb * 0.4) * 1.4;
            vec3 refr = mix(deep, under.rgb, absorb);
            // espuma na beira
            float foamN = cnoise(vWorld.xz * 2.3 + t * 0.4) * cnoise(vWorld.xz * 5.1 - t * 0.3);
            float foam = smoothstep(0.55, 0.0, depthW) * smoothstep(0.08, 0.35, foamN) * 0.75;
            col = mix(refr, refl, fres) + uSunColor * spec;
            col = mix(col, vec3(0.92, 0.95, 1.0) * (bs * 0.8 + bb * 0.4 + 0.05), foam);
            alpha = 1.0;
          #else
            vec3 refl = mix(uSkyHor, uSkyTop, clamp(R.y * 2.0, 0.0, 1.0)) * (0.35 + 0.65 * exposure) * max(skyExp, 0.1);
            vec3 body = vec3(0.03, 0.12, 0.2) * (bs + bb * 0.5) * 1.6 + tex.rgb * 0.15 * bs;
            col = mix(body, refl, fres) + uSunColor * spec;
            alpha = clamp(mix(0.62, 0.97, fres) + spec, 0.0, 1.0);
          #endif
        }
      }
    #endif
    #ifdef MAX
      // perspectiva aérea: o terreno some na cor do céu atrás dele, com névoa mais densa nos vales
      vec2 suvF = gl_FragCoord.xy / uResolution;
      vec3 skyBehind = texture2D(uSkyTex, suvF).rgb;
      float haze = 1.0 - exp(-vDist * (0.0035 + exp(-max(vWorld.y - 60.0, 0.0) * 0.05) * 0.004) * (1.0 + uWet * 3.0));
      float fog = max(smoothstep(uFogNear, uFogFar, vDist), haze * 0.85);
      if (uClipY > -1e8) fog = smoothstep(uFogNear, uFogFar, vDist);
      gl_FragColor = vec4(mix(col, skyBehind, fog), alpha);
    #else
      float fog = smoothstep(uFogNear, uFogFar, vDist);
      gl_FragColor = vec4(mix(col, uFogColor, fog), alpha);
    #endif
  }
`;

// profundidade para o mapa de sombras (respeita o recorte das folhas)
const depthVert = /* glsl */ `
  attribute float aFlags;
  uniform float uTime;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    if (aFlags > 0.5 && aFlags < 1.5) wp.x += sin(uTime * 1.6 + wp.x * 0.7 + wp.y * 0.5) * 0.035;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;
const depthFrag = /* glsl */ `
  uniform sampler2D uAtlas;
  varying vec2 vUv;
  void main() {
    if (texture2D(uAtlas, vUv).a < 0.5) discard;
    gl_FragColor = vec4(1.0);
  }
`;

// ---------- pós-processamento ----------
const fsVert = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const copyFrag = `uniform sampler2D tColor; varying vec2 vUv; void main(){ gl_FragColor = texture2D(tColor, vUv); }`;
// cópia da cena opaca: cor + profundidade linear (para a água refratar e para o SSAO)
const sceneCopyFrag = `uniform sampler2D tColor; uniform sampler2D tDepth; uniform float uNear, uFar; varying vec2 vUv;
  void main(){ float d = texture2D(tDepth, vUv).r; float z = uNear * uFar / (uFar - d * (uFar - uNear));
    gl_FragColor = vec4(texture2D(tColor, vUv).rgb, d >= 0.99999 ? 10000.0 : z); }`;
const brightFrag = `uniform sampler2D tColor; varying vec2 vUv;
  void main(){ vec3 c = texture2D(tColor, vUv).rgb; float l = max(c.r, max(c.g, c.b)); gl_FragColor = vec4(c * smoothstep(1.0, 2.0, l), 1.0); }`;
const blurFrag = `uniform sampler2D tColor; uniform vec2 uDir; varying vec2 vUv;
  void main(){ vec3 s = texture2D(tColor, vUv).rgb * 0.227;
    s += texture2D(tColor, vUv + uDir * 1.385).rgb * 0.316; s += texture2D(tColor, vUv - uDir * 1.385).rgb * 0.316;
    s += texture2D(tColor, vUv + uDir * 3.231).rgb * 0.07; s += texture2D(tColor, vUv - uDir * 3.231).rgb * 0.07;
    gl_FragColor = vec4(s, 1.0); }`;
// oclusão de ambiente em espaço de tela (cantos e frestas escurecem)
const ssaoFrag = `
  uniform sampler2D tScene; uniform vec3 uKernel[12]; uniform float uTanHalf; uniform float uAspect;
  varying vec2 vUv;
  vec3 viewPos(vec2 uv) { float z = texture2D(tScene, uv).a; vec2 n = uv * 2.0 - 1.0; return vec3(n.x * uTanHalf * uAspect * z, n.y * uTanHalf * z, -z); }
  float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
  void main(){
    vec3 P = viewPos(vUv);
    if (-P.z > 160.0) { gl_FragColor = vec4(1.0); return; }
    vec3 N = normalize(cross(dFdx(P), dFdy(P)));
    if (dot(N, P) > 0.0) N = -N;
    float a = ign(gl_FragCoord.xy) * 6.2831853;
    vec3 rv = vec3(cos(a), sin(a), 0.0);
    vec3 T = normalize(rv - N * dot(rv, N)), B = cross(N, T);
    float R = 0.55, occ = 0.0;
    for (int i = 0; i < 12; i++) {
      vec3 k = uKernel[i];
      vec3 s = P + (T * k.x + B * k.y + N * k.z) * R;
      vec2 uv = vec2(s.x / (-s.z * uTanHalf * uAspect), s.y / (-s.z * uTanHalf)) * 0.5 + 0.5;
      float sz = texture2D(tScene, uv).a;
      float range = smoothstep(0.0, 1.0, R / max(abs(-P.z - sz), 0.001));
      occ += (sz < -s.z - 0.04 ? 1.0 : 0.0) * range;
    }
    float ao = 1.0 - occ / 12.0;
    gl_FragColor = vec4(vec3(ao), 1.0);
  }`;
const compositeFrag = `
  uniform sampler2D tColor; uniform sampler2D tBloom; uniform sampler2D tDepth; uniform sampler2D tAO; uniform sampler2D tScene;
  uniform float uBloom; uniform float uExposure; uniform vec2 uSunUV; uniform float uRays; uniform vec3 uSunColor;
  uniform float uNear; uniform float uFar; uniform float uTime; uniform float uAspect; uniform float uFlare;
  varying vec2 vUv;
  vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
  float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  void main(){
    vec3 c = texture2D(tColor, vUv).rgb;
    #ifdef SSAO
      // oclusão só no terreno opaco (não sobre a água, que fica na frente)
      float d = texture2D(tDepth, vUv).r;
      float z = uNear * uFar / (uFar - d * (uFar - uNear));
      float zo = texture2D(tScene, vUv).a;
      if (abs(z - zo) < 0.05 * z + 0.05) c *= mix(1.0, texture2D(tAO, vUv).r, 0.6);
    #endif
    #ifdef BLOOM
      c += texture2D(tBloom, vUv).rgb * uBloom;
    #endif
    #ifdef GODRAYS
      if (uRays > 0.0) {
        // raios de sol: espalha a luz do céu claro (também nas brechas das nuvens)
        vec2 dd = (vUv - uSunUV) / float(RAY_SAMPLES);
        vec2 p = vUv;
        float acc = 0.0, w = 1.0;
        for (int i = 0; i < RAY_SAMPLES; i++) {
          p -= dd;
          float sky = step(0.9999, texture2D(tDepth, p).r);
          #ifdef MAXFX
            vec3 sc = texture2D(tColor, p).rgb;
            sky *= smoothstep(0.75, 1.2, max(sc.r, max(sc.g, sc.b)));
          #endif
          float rad = 1.0 - min(length((p - uSunUV) * vec2(uAspect, 1.0)) * 1.3, 1.0);
          acc += sky * rad * w;
          w *= 0.975;
        }
        c += uSunColor * acc / float(RAY_SAMPLES) * uRays;
      }
    #endif
    #ifdef MAXFX
      // reflexos de lente quando o sol aparece
      if (uFlare > 0.0) {
        vec2 axis = vec2(0.5) - uSunUV;
        vec3 fl = vec3(0.0);
        float ks[5] = float[5](0.35, 0.6, 1.25, 1.6, 2.0);
        vec3 cs[5] = vec3[5](vec3(1.0, 0.6, 0.3), vec3(0.4, 0.8, 1.0), vec3(0.6, 1.0, 0.6), vec3(1.0, 0.4, 0.8), vec3(0.5, 0.6, 1.0));
        float rs[5] = float[5](0.03, 0.05, 0.02, 0.07, 0.11);
        for (int i = 0; i < 5; i++) {
          vec2 gp = uSunUV + axis * ks[i];
          float dist = length((vUv - gp) * vec2(uAspect, 1.0));
          fl += cs[i] * smoothstep(rs[i], rs[i] * 0.6, dist) * 0.07;
        }
        float halo = length((vUv - vec2(0.5) - axis * -0.0) * vec2(uAspect, 1.0));
        fl += vec3(0.6, 0.7, 1.0) * smoothstep(0.02, 0.0, abs(halo - 0.42)) * 0.04 * smoothstep(0.6, 0.1, length(axis));
        c += fl * uFlare * uSunColor;
      }
    #endif
    vec3 lin = pow(max(c, 0.0), vec3(2.2)) * uExposure;
    vec3 mapped = pow(aces(lin), vec3(1.0 / 2.2));
    float l = dot(mapped, vec3(0.299, 0.587, 0.114));
    mapped = mix(vec3(l), mapped, 1.04);
    #ifdef MAXFX
      // leve granulação de filme e vinheta
      mapped += (hash(vUv * 731.0 + fract(uTime)) - 0.5) * 0.012;
      vec2 vc = vUv - 0.5;
      mapped *= 1.0 - dot(vc, vc) * 0.35;
    #endif
    gl_FragColor = vec4(mapped, 1.0);
  }`;
// antisserrilhado (FXAA)
const fxaaFrag = `
  uniform sampler2D tColor; uniform vec2 uTexel; varying vec2 vUv;
  float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
  void main(){
    vec3 nw = texture2D(tColor, vUv + vec2(-1.0, -1.0) * uTexel).rgb;
    vec3 ne = texture2D(tColor, vUv + vec2(1.0, -1.0) * uTexel).rgb;
    vec3 sw = texture2D(tColor, vUv + vec2(-1.0, 1.0) * uTexel).rgb;
    vec3 se = texture2D(tColor, vUv + vec2(1.0, 1.0) * uTexel).rgb;
    vec3 m = texture2D(tColor, vUv).rgb;
    float lnw = luma(nw), lne = luma(ne), lsw = luma(sw), lse = luma(se), lm = luma(m);
    float lmin = min(lm, min(min(lnw, lne), min(lsw, lse)));
    float lmax = max(lm, max(max(lnw, lne), max(lsw, lse)));
    vec2 dir = vec2(-((lnw + lne) - (lsw + lse)), ((lnw + lsw) - (lne + lse)));
    float red = max((lnw + lne + lsw + lse) * 0.03125, 1.0 / 128.0);
    float rcp = 1.0 / (min(abs(dir.x), abs(dir.y)) + red);
    dir = clamp(dir * rcp, -8.0, 8.0) * uTexel;
    vec3 a = 0.5 * (texture2D(tColor, vUv + dir * (1.0 / 3.0 - 0.5)).rgb + texture2D(tColor, vUv + dir * (2.0 / 3.0 - 0.5)).rgb);
    vec3 b = a * 0.5 + 0.25 * (texture2D(tColor, vUv - dir * 0.5).rgb + texture2D(tColor, vUv + dir * 0.5).rgb);
    float lb = luma(b);
    gl_FragColor = vec4((lb < lmin || lb > lmax) ? a : b, 1.0);
  }`;

export class Renderer {
  constructor(canvas, atlas) {
    THREE.ColorManagement.enabled = false;
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.gl.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.gl.autoClear = false;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(70, 1, 0.05, 1200);
    for (const l of [1, 2, 3]) this.camera.layers.enable(l);
    this.atlas = atlas;
    this.lowAtlas = atlas;
    this.uniforms = U;
    U.uAtlas.value = atlas;
    this.chunkGroup = new THREE.Group();
    this.scene.add(this.chunkGroup);
    this.skyScene = new THREE.Scene();
    this.sky = new Sky(this.skyScene);
    this.clouds = new Clouds(this.scene);
    this.selection = this.makeSelection();
    this.crack = this.makeCrack();
    this.radius = 8;
    this.weather = { rain: 0, thunder: 0, flash: 0 };
    // passes de tela cheia
    this.fsScene = new THREE.Scene();
    this.fsCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.fsQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this.fsQuad.frustumCulled = false;
    this.fsScene.add(this.fsQuad);
    this.reflCam = new THREE.PerspectiveCamera(70, 1, 0.05, 1200);
    for (const l of [1, 2]) this.reflCam.layers.enable(l);
    this.setQuality('medium');
  }

  // Troca a qualidade gráfica: materiais, sombras, pós-processamento e texturas.
  setQuality(name, hdBuilder) {
    const q = QUALITY[name] || QUALITY.medium;
    this.qualityName = name;
    this.q = q;
    const hdAtlas = q.hd && hdBuilder ? hdBuilder(q.hd) : null;
    this.hdAtlas = hdAtlas;
    this.atlas = hdAtlas ? hdAtlas.albedo : this.lowAtlas;
    U.uAtlas.value = this.atlas;
    U.uNormalAtlas.value = hdAtlas ? hdAtlas.normal : null;
    const defines = {};
    if (q.waving) defines.WAVING = 1;
    if (hdAtlas) {
      defines.HD = 1;
      defines.TILE_RES = hdAtlas.size.toFixed(1);
      if (q.pom) defines.POM = 1;
    }
    if (q.shadows) {
      defines.SHADOWS = 1;
      defines.PCF = q.pcf;
    }
    if (q.max) defines.MAX = 1;
    const mk = (extra) =>
      new THREE.ShaderMaterial({
        uniforms: { ...U, uAlphaTest: { value: extra.alphaTest }, uOpacity: { value: 1 } },
        defines: { ...defines, ...(extra.defines || {}) },
        vertexShader: blockVert,
        fragmentShader: blockFrag,
        transparent: !!extra.transparent,
        depthWrite: extra.depthWrite ?? true,
        side: THREE.FrontSide,
      });
    const oldS = this.solidMat, oldT = this.transMat;
    this.solidMat = mk({ alphaTest: hdAtlas ? 0.4 : 0.5 });
    this.transMat = mk({ alphaTest: 0.01, transparent: true, depthWrite: false, defines: q.water ? { WATER_FX: 1 } : {} });
    for (const m of this.chunkGroup.children) m.material = m.userData.trans ? this.transMat : this.solidMat;
    if (oldS) oldS.dispose();
    if (oldT) oldT.dispose();
    this.crack.material.map = this.atlas;
    this.crack.material.needsUpdate = true;
    // sombras
    if (q.shadows) {
      if (!this.shadowRT || this.shadowRT.width !== q.shadows) {
        if (this.shadowRT) this.shadowRT.dispose();
        this.shadowRT = new THREE.WebGLRenderTarget(q.shadows, q.shadows, { depthTexture: new THREE.DepthTexture(q.shadows, q.shadows, THREE.UnsignedIntType), depthBuffer: true });
        this.shadowRT.depthTexture.minFilter = this.shadowRT.depthTexture.magFilter = THREE.NearestFilter;
      }
      U.uShadowMap.value = this.shadowRT.depthTexture;
      U.uShadowTexel.value = 1 / q.shadows;
      const r = q.shadowRange;
      this.shadowCam = new THREE.OrthographicCamera(-r, r, r, -r, 1, 400);
      this.shadowCam.layers.set(1);
      this.depthMat = new THREE.ShaderMaterial({ uniforms: { uAtlas: U.uAtlas, uTime: U.uTime }, vertexShader: depthVert, fragmentShader: depthFrag });
      this.entityDepthMat = new THREE.MeshBasicMaterial();
    } else U.uShadowMap.value = null;
    // pós-processamento
    if (q.post) {
      const fs = (frag, uniforms, defs = {}) =>
        new THREE.ShaderMaterial({ uniforms, defines: defs, vertexShader: fsVert, fragmentShader: frag, depthTest: false, depthWrite: false });
      const kernel = [];
      const rnd = mulberry32(7);
      for (let i = 0; i < 12; i++) {
        const v = new THREE.Vector3(rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 0.85 + 0.15).normalize();
        const s = i / 12;
        v.multiplyScalar(0.25 + 0.75 * s * s);
        kernel.push(v);
      }
      this.postMats = {
        bright: fs(brightFrag, { tColor: { value: null } }),
        blur: fs(blurFrag, { tColor: { value: null }, uDir: { value: new THREE.Vector2() } }),
        copy: fs(copyFrag, { tColor: { value: null } }),
        sceneCopy: fs(sceneCopyFrag, { tColor: { value: null }, tDepth: { value: null }, uNear: { value: 0.05 }, uFar: { value: 1200 } }),
        ssao: fs(ssaoFrag, { tScene: { value: null }, uKernel: { value: kernel }, uTanHalf: { value: 0.7 }, uAspect: { value: 1 } }),
        fxaa: fs(fxaaFrag, { tColor: { value: null }, uTexel: { value: new THREE.Vector2() } }),
        composite: fs(
          compositeFrag,
          {
            tColor: { value: null }, tBloom: { value: null }, tDepth: { value: null }, tAO: { value: null }, tScene: { value: null },
            uBloom: { value: 0.6 }, uExposure: { value: 0.68 }, uSunUV: { value: new THREE.Vector2() }, uRays: { value: 0 }, uSunColor: { value: new THREE.Color() },
            uNear: { value: 0.05 }, uFar: { value: 1200 }, uTime: { value: 0 }, uAspect: { value: 1 }, uFlare: { value: 0 },
          },
          {
            ...(q.bloom ? { BLOOM: 1 } : {}),
            ...(q.godrays ? { GODRAYS: 1, RAY_SAMPLES: q.max ? 64 : 40 } : {}),
            ...(q.ssao ? { SSAO: 1 } : {}),
            ...(q.max ? { MAXFX: 1 } : {}),
          },
        ),
        sky: q.max
          ? new THREE.ShaderMaterial({
              uniforms: {
                uInvProj: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() }, uCamPos: { value: new THREE.Vector3() },
                uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uTime: U.uTime, uCover: U.uCloudCover, uRain: { value: 0 }, uFlash: { value: 0 },
              },
              vertexShader: SKY_VERT,
              fragmentShader: SKY_FRAG,
              depthTest: false,
              depthWrite: false,
            })
          : null,
      };
    }
    this.sky.setMode(q.skyClouds);
    this.sky.hidden = !!q.max;
    setMeshOptions({ fastLeaves: q.fastLeaves });
    this.resize();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    // Baixo renderiza com menos pixels que a tela; os outros limitam a densidade da tela
    const dpr = window.devicePixelRatio || 1;
    const qp = this.q ? this.q.pixelRatio : 1;
    this.gl.setPixelRatio(qp < 1 ? qp : Math.min(dpr, qp));
    this.gl.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    for (const k of ['hdrRT', 'bloomA', 'bloomB', 'skyRT', 'reflRT', 'sceneRT', 'aoA', 'aoB', 'ldrRT']) {
      if (this[k]) this[k].dispose();
      this[k] = null;
    }
    if (!this.q || !this.q.post) return;
    const size = this.gl.getDrawingBufferSize(new THREE.Vector2());
    const W = size.x, H = size.y;
    const half = { type: THREE.HalfFloatType };
    this.hdrRT = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, depthTexture: new THREE.DepthTexture(W, H, THREE.UnsignedIntType) });
    const bw = Math.max(1, W >> 2), bh = Math.max(1, H >> 2);
    this.bloomA = new THREE.WebGLRenderTarget(bw, bh, half);
    this.bloomB = new THREE.WebGLRenderTarget(bw, bh, half);
    if (this.q.max) {
      const hw = Math.max(1, W >> 1), hh = Math.max(1, H >> 1);
      this.skyRT = new THREE.WebGLRenderTarget(hw, hh, half);
      this.reflRT = new THREE.WebGLRenderTarget(hw, hh, { type: THREE.HalfFloatType, depthBuffer: true });
      this.sceneRT = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, depthBuffer: false });
      this.aoA = new THREE.WebGLRenderTarget(hw, hh, { depthBuffer: false });
      this.aoB = new THREE.WebGLRenderTarget(hw, hh, { depthBuffer: false });
      this.ldrRT = new THREE.WebGLRenderTarget(W, H, { depthBuffer: false });
      this.ldrRT.texture.minFilter = this.ldrRT.texture.magFilter = THREE.LinearFilter;
      U.uSkyTex.value = this.skyRT.texture;
      U.uRefraction.value = this.sceneRT.texture;
      U.uReflection.value = this.reflRT.texture;
    }
  }

  // Remonta as malhas pendentes (as próximas e as editadas primeiro).
  updateChunks(world, px, pz, budgetMs = 6) {
    const t0 = performance.now();
    const pcx = Math.floor(px / CS), pcz = Math.floor(pz / CS);
    const list = [];
    for (const c of world.chunks.values()) {
      const dx = c.cx - pcx, dz = c.cz - pcz;
      const d = Math.max(Math.abs(dx), Math.abs(dz));
      if (c.meshes) {
        const vis = d <= this.radius;
        for (const m of c.meshes) if (m) m.visible = vis;
      }
      if (!c.dirty || d > this.radius) continue;
      list.push([c, (c.priority ? -1000 : 0) + dx * dx + dz * dz]);
    }
    list.sort((a, b) => a[1] - b[1]);
    let built = 0;
    for (const [c, p] of list) {
      if (p >= 0 && performance.now() - t0 > budgetMs && built > 0) break;
      if (!world.canMesh(c)) continue;
      this.buildChunk(world, c);
      built++;
    }
    return list.length - built;
  }

  buildChunk(world, c) {
    const { solid, trans } = buildChunkGeometry(world, c);
    this.disposeChunk(c);
    c.meshes = [];
    if (solid) {
      const m = new THREE.Mesh(solid, this.solidMat);
      m.position.set(c.cx * CS, 0, c.cz * CS);
      m.matrixAutoUpdate = false;
      m.updateMatrix();
      m.layers.enable(1);
      this.chunkGroup.add(m);
      c.meshes.push(m);
    }
    if (trans) {
      const m = new THREE.Mesh(trans, this.transMat);
      m.position.set(c.cx * CS, 0, c.cz * CS);
      m.matrixAutoUpdate = false;
      m.updateMatrix();
      m.renderOrder = 1;
      m.userData.trans = true;
      // camada 3: água e gelo (no MAX são desenhados num passo próprio, por cima da cena)
      m.layers.set(3);
      this.chunkGroup.add(m);
      c.meshes.push(m);
    }
    c.dirty = false;
    c.priority = false;
  }

  disposeChunk(c) {
    if (!c.meshes) return;
    for (const m of c.meshes) {
      this.chunkGroup.remove(m);
      m.geometry.dispose();
    }
    c.meshes = null;
  }

  clearChunks(world) {
    for (const c of world.chunks.values()) this.disposeChunk(c);
  }
  // força remontar tudo (troca de qualidade)
  remeshAll(world) {
    if (!world) return;
    for (const c of world.chunks.values()) c.dirty = true;
  }

  makeSelection() {
    const g = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.004, 1.004, 1.004));
    const m = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.45 }));
    m.visible = false;
    this.scene.add(m);
    return m;
  }
  setSelection(hit, box) {
    if (!hit) {
      this.selection.visible = false;
      return;
    }
    const [x0, y0, z0, x1, y1, z1] = box;
    this.selection.visible = true;
    this.selection.scale.set(x1 - x0, y1 - y0, z1 - z0);
    this.selection.position.set(hit.x + (x0 + x1) / 2, hit.y + (y0 + y1) / 2, hit.z + (z0 + z1) / 2);
  }

  makeCrack() {
    const g = new THREE.BoxGeometry(1.006, 1.006, 1.006);
    const m = new THREE.Mesh(
      g,
      new THREE.MeshBasicMaterial({ map: this.atlas, transparent: true, alphaTest: 0.05, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
    );
    m.visible = false;
    m.renderOrder = 2;
    this.scene.add(m);
    this._crackStage = -1;
    return m;
  }
  setCrack(hit, stage) {
    if (!hit || stage < 0) {
      this.crack.visible = false;
      return;
    }
    this.crack.visible = true;
    this.crack.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
    if (stage !== this._crackStage) {
      this._crackStage = stage;
      const [u0, v0, u1, v1] = tileUV('crack_' + stage);
      const uv = this.crack.geometry.attributes.uv;
      for (let i = 0; i < uv.count; i++) {
        const k = i % 4;
        uv.setXY(i, k % 2 ? u1 : u0, k < 2 ? v1 : v0);
      }
      uv.needsUpdate = true;
    }
  }

  // Atualiza céu, neblina e luz conforme a hora e o clima.
  updateEnvironment(world, cam, opts) {
    const rain = this.weather.rain;
    const env = skyColors(world.time, rain);
    const u = U;
    u.uTime.value = performance.now() / 1000;
    u.uSkyDarken.value = (1 - env.daylight) * 11 + rain * 2;
    u.uSkyColor.value.copy(env.lightColor);
    // luz ambiente azulada do céu (MAX): mais azul de dia, quase nada à noite
    u.uAmbColor.value.copy(env.top).lerp(new THREE.Color(1, 1, 1), 0.45).multiplyScalar(1.05).lerp(env.lightColor, 1 - env.daylight);
    u.uSunDir.value.copy(env.lightDir);
    u.uSunColor.value.copy(env.sunColor);
    u.uSunAmount.value = 1 - rain * 0.85;
    u.uCamPos.value.copy(cam.position);
    u.uSkyTop.value.copy(env.top);
    u.uSkyHor.value.copy(env.hor);
    u.uWindStrength.value = 1 + rain * 1.5;
    u.uWet.value = rain;
    u.uCloudCover.value = 0.5 + rain * 0.45;
    // relâmpago
    if (this.weather.flash > 0) {
      u.uSkyDarken.value = Math.max(0, u.uSkyDarken.value - this.weather.flash * 10);
      env.fog.lerp(new THREE.Color(0.8, 0.85, 1), this.weather.flash * 0.6);
    }
    const far = this.radius * CS;
    if (opts.underwater) {
      u.uFogColor.value.setRGB(0.05 * env.daylight + 0.02, 0.12 * env.daylight + 0.03, 0.35 * env.daylight + 0.06);
      u.uFogNear.value = 1;
      u.uFogFar.value = 22;
    } else if (opts.inLava) {
      u.uFogColor.value.setRGB(0.6, 0.15, 0.02);
      u.uFogNear.value = 0;
      u.uFogFar.value = 3;
    } else {
      u.uFogColor.value.copy(env.fog);
      u.uFogNear.value = far * (0.62 - rain * 0.35);
      u.uFogFar.value = far * (0.98 - rain * 0.3);
    }
    this.sky.update(cam, env, world.time, opts.underwater, rain);
    this.clouds.update(cam, env, opts.clouds && this.q.blockClouds && !opts.underwater && !opts.inLava, far, rain);
    this.clearColor = opts.underwater ? u.uFogColor.value : env.fog;
    this.env = env;
    this.underwater = !!opts.underwater;
    this.inLava = !!opts.inLava;
    return env;
  }

  // mapa de sombras: chunks (com recorte das folhas) e depois criaturas/jogador
  renderShadows(center) {
    if (!this.q.shadows || !this.env) return;
    const sc = this.shadowCam;
    const d = this.env.lightDir;
    const r = this.q.shadowRange;
    // gruda a câmera de sombra na grade de texels para a sombra não tremer
    const texel = (2 * r) / this.q.shadows;
    const up = Math.abs(d.y) > 0.99 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const look = new THREE.Matrix4().lookAt(d, new THREE.Vector3(), up);
    const inv = look.clone().invert();
    const c = center.clone().applyMatrix4(inv);
    c.x = Math.round(c.x / texel) * texel;
    c.y = Math.round(c.y / texel) * texel;
    c.applyMatrix4(look);
    sc.position.copy(c).addScaledVector(d, 200);
    sc.up.copy(up);
    sc.lookAt(c);
    sc.updateMatrixWorld();
    sc.updateProjectionMatrix();
    const m = U.uShadowMatrix.value;
    m.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    m.multiply(sc.projectionMatrix).multiply(sc.matrixWorldInverse);
    const g = this.gl;
    g.setRenderTarget(this.shadowRT);
    g.setClearColor(0xffffff, 1);
    g.clear(true, true, true);
    this.scene.overrideMaterial = this.depthMat;
    sc.layers.set(1);
    g.render(this.scene, sc);
    this.scene.overrideMaterial = this.entityDepthMat;
    sc.layers.set(2);
    g.render(this.scene, sc);
    this.scene.overrideMaterial = null;
    g.setRenderTarget(null);
  }

  // céu MAX em meia resolução, visto pela câmera dada
  renderSkyMax(cam) {
    const m = this.postMats.sky;
    cam.updateMatrixWorld();
    m.uniforms.uInvProj.value.copy(cam.projectionMatrixInverse);
    m.uniforms.uCamWorld.value.copy(cam.matrixWorld);
    m.uniforms.uCamPos.value.copy(cam.position);
    m.uniforms.uRain.value = this.weather.rain;
    m.uniforms.uFlash.value = this.weather.flash;
    // o céu usa a posição real do sol (a luz direta à noite vem da lua)
    if (this.env) m.uniforms.uSunDir.value.copy(this.env.sunDir);
    this.fsPass(m, {}, this.skyRT);
  }

  // reflexo planar da água: câmera espelhada na altura do mar
  renderReflection() {
    const cam = this.camera, rc = this.reflCam;
    const h = U.uWaterLevel.value;
    if (cam.position.y < h - 0.2 || this.underwater) {
      U.uReflOn.value = 0;
      return;
    }
    rc.fov = cam.fov;
    rc.aspect = cam.aspect;
    rc.near = cam.near;
    rc.far = cam.far;
    rc.updateProjectionMatrix();
    const dir = cam.getWorldDirection(new THREE.Vector3());
    rc.position.set(cam.position.x, 2 * h - cam.position.y, cam.position.z);
    rc.up.set(0, 1, 0);
    rc.lookAt(rc.position.x + dir.x, rc.position.y - dir.y, rc.position.z + dir.z);
    rc.updateMatrixWorld();
    const tm = U.uReflMatrix.value;
    tm.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    tm.multiply(rc.projectionMatrix).multiply(rc.matrixWorldInverse);
    this.renderSkyMax(rc);
    const g = this.gl;
    U.uResolution.value.set(this.reflRT.width, this.reflRT.height);
    U.uClipY.value = h - 0.15;
    U.uCamPos.value.copy(rc.position);
    g.setRenderTarget(this.reflRT);
    g.clear(true, true, true);
    this.fsPass(this.postMats.copy, { tColor: this.skyRT.texture }, this.reflRT);
    g.render(this.scene, rc);
    U.uClipY.value = -1e9;
    U.uCamPos.value.copy(cam.position);
    U.uReflOn.value = 1;
  }

  render(extraScene, extraCam, shadowCenter) {
    const g = this.gl;
    if (shadowCenter && this.q.shadows && U.uSunAmount.value > 0.05) this.renderShadows(shadowCenter);
    if (this.q.post) {
      const pm = this.postMats;
      const W = this.hdrRT.width, H = this.hdrRT.height;
      if (this.q.max) {
        // 1) reflexo da água, 2) céu, 3) cena opaca, 4) cópia para refração, 5) água por cima
        this.renderReflection();
        this.renderSkyMax(this.camera);
        U.uResolution.value.set(W, H);
        g.setRenderTarget(this.hdrRT);
        g.setClearColor(this.clearColor || 0x87ceeb, 1);
        g.clear(true, true, true);
        if (!this.underwater && !this.inLava) this.fsPass(pm.copy, { tColor: this.skyRT.texture }, this.hdrRT);
        this.camera.layers.disable(3);
        g.render(this.scene, this.camera);
        this.camera.layers.enable(3);
        pm.sceneCopy.uniforms.uNear.value = this.camera.near;
        pm.sceneCopy.uniforms.uFar.value = this.camera.far;
        this.fsPass(pm.sceneCopy, { tColor: this.hdrRT.texture, tDepth: this.hdrRT.depthTexture }, this.sceneRT);
        g.setRenderTarget(this.hdrRT);
        this.camera.layers.set(3);
        g.render(this.scene, this.camera);
        for (const l of [0, 1, 2]) this.camera.layers.enable(l);
        // oclusão de ambiente
        if (this.q.ssao) {
          pm.ssao.uniforms.uTanHalf.value = Math.tan((this.camera.fov * Math.PI) / 360);
          pm.ssao.uniforms.uAspect.value = this.camera.aspect;
          this.fsPass(pm.ssao, { tScene: this.sceneRT.texture }, this.aoA);
          pm.blur.uniforms.uDir.value.set(1 / this.aoA.width, 0);
          this.fsPass(pm.blur, { tColor: this.aoA.texture }, this.aoB);
          pm.blur.uniforms.uDir.value.set(0, 1 / this.aoA.height);
          this.fsPass(pm.blur, { tColor: this.aoB.texture }, this.aoA);
        }
      } else {
        g.setRenderTarget(this.hdrRT);
        g.setClearColor(this.clearColor || 0x87ceeb, 1);
        g.clear(true, true, true);
        g.render(this.skyScene, this.camera);
        g.render(this.scene, this.camera);
      }
      if (this.q.bloom) {
        this.fsPass(pm.bright, { tColor: this.hdrRT.texture }, this.bloomA);
        pm.blur.uniforms.uDir.value.set(1 / this.bloomA.width, 0);
        this.fsPass(pm.blur, { tColor: this.bloomA.texture }, this.bloomB);
        pm.blur.uniforms.uDir.value.set(0, 1 / this.bloomA.height);
        this.fsPass(pm.blur, { tColor: this.bloomB.texture }, this.bloomA);
      }
      const cu = pm.composite.uniforms;
      cu.tBloom.value = this.bloomA.texture;
      cu.tDepth.value = this.hdrRT.depthTexture;
      cu.tAO.value = this.aoA ? this.aoA.texture : null;
      cu.tScene.value = this.sceneRT ? this.sceneRT.texture : null;
      cu.uNear.value = this.camera.near;
      cu.uFar.value = this.camera.far;
      cu.uTime.value = U.uTime.value;
      cu.uAspect.value = this.camera.aspect;
      // posição do sol na tela para os raios e reflexos de lente
      cu.uRays.value = 0;
      cu.uFlare.value = 0;
      if (this.q.godrays && this.env && !this.underwater) {
        const sp = this.env.sunDir.clone().multiplyScalar(400).add(this.camera.position).project(this.camera);
        const front = this.env.sunDir.dot(this.camera.getWorldDirection(new THREE.Vector3())) > 0;
        if (front && this.env.sunDir.y > -0.05) {
          cu.uSunUV.value.set(sp.x * 0.5 + 0.5, sp.y * 0.5 + 0.5);
          const edge = Math.max(Math.abs(sp.x), Math.abs(sp.y));
          const vis = Math.max(0, 1 - Math.max(0, edge - 0.6) * 1.2) * (1 - this.weather.rain) * Math.min(1, this.env.sunDir.y * 6 + 0.4);
          cu.uRays.value = (this.q.max ? 0.75 : 0.55) * vis;
          cu.uFlare.value = edge < 1 ? vis * this.sunVisible() : 0;
          cu.uSunColor.value.copy(this.env.sunColor);
        }
      }
      // adaptação do olho no MAX: ao entardecer e à noite a exposição sobe devagar
      const expT = this.q.max && this.env ? 0.68 * (1 + (1 - this.env.daylight) * 0.85) : 0.68;
      this.exposure = this.exposure === undefined ? expT : this.exposure + (expT - this.exposure) * 0.04;
      cu.uExposure.value = this.exposure;
      if (this.q.fxaa) {
        this.fsPass(pm.composite, { tColor: this.hdrRT.texture }, this.ldrRT);
        pm.fxaa.uniforms.uTexel.value.set(1 / W, 1 / H);
        this.fsPass(pm.fxaa, { tColor: this.ldrRT.texture }, null);
      } else this.fsPass(pm.composite, { tColor: this.hdrRT.texture }, null);
    } else {
      g.setRenderTarget(null);
      g.setClearColor(this.clearColor || 0x87ceeb, 1);
      g.clear(true, true, true);
      g.render(this.skyScene, this.camera);
      g.render(this.scene, this.camera);
    }
    if (extraScene) {
      g.clearDepth();
      g.render(extraScene, extraCam);
    }
  }
  // o sol está à vista? (para os reflexos de lente); usa um raio contra os blocos
  sunVisible() {
    if (!this.sunProbe) return 1;
    return this.sunProbe();
  }
  fsPass(mat, uniforms, target) {
    for (const [k, v] of Object.entries(uniforms)) mat.uniforms[k].value = v;
    this.fsQuad.material = mat;
    this.gl.setRenderTarget(target);
    this.gl.render(this.fsScene, this.fsCam);
  }
}

// ---------- céu ----------
const C = (r, g, b) => new THREE.Color(r / 255, g / 255, b / 255);
const DAY_TOP = C(120, 167, 255), DAY_HOR = C(190, 214, 255);
const NIGHT_TOP = C(2, 3, 10), NIGHT_HOR = C(12, 16, 34);
const RAIN_TOP = C(90, 98, 110), RAIN_HOR = C(130, 138, 148);
const SUNSET = C(255, 120, 50);

export function skyColors(time, rain = 0) {
  const a = (time / 24000) * Math.PI * 2;
  const sunH = Math.sin(a);
  const daylight = Math.max(0.0, Math.min(1, sunH * 2.5 + 0.55)) * (1 - rain * 0.35);
  const top = NIGHT_TOP.clone().lerp(DAY_TOP.clone().lerp(RAIN_TOP, rain), daylight);
  const hor = NIGHT_HOR.clone().lerp(DAY_HOR.clone().lerp(RAIN_HOR, rain), daylight);
  // brilho do nascer/pôr do sol perto do horizonte
  const glow = Math.max(0, 1 - Math.abs(sunH) / 0.35) * (1 - rain * 0.8);
  const sunDir = new THREE.Vector3(Math.cos(a), sunH, 0.18).normalize();
  const fog = hor.clone().lerp(SUNSET, glow * 0.35);
  const lightColor = new THREE.Color(1, 1, 1).lerp(C(170, 185, 255), 1 - daylight).lerp(C(255, 200, 160), glow * 0.35);
  // luz direta: sol de dia, lua (fraca e azulada) à noite
  const up = sunH > -0.05;
  const lightDir = up ? sunDir.clone() : sunDir.clone().negate();
  const sunStrength = up ? Math.min(1, sunH * 4 + 0.2) : Math.min(1, -sunH * 4) * 0.18;
  const sunColor = up ? C(255, 244, 222).lerp(C(255, 150, 70), glow * 0.8).multiplyScalar(0.75 * sunStrength) : C(150, 170, 255).multiplyScalar(sunStrength);
  return { daylight, top, hor, fog, glow, sunDir, lightColor, lightDir, sunColor };
}

const skyFrag = /* glsl */ `
  uniform vec3 uTop, uHor, uSunset, uSun; uniform float uGlow; uniform float uTime; uniform float uRain; uniform float uDay;
  varying vec3 vP;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float s = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) { s += noise(p) * a; p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
    return s;
  }
  void main(){
    vec3 d = normalize(vP);
    float h = d.y;
    vec3 col = mix(uHor, uTop, smoothstep(0.0, 0.45, h));
    if (h < 0.0) col = mix(uHor, uHor * 0.35, smoothstep(0.0, -0.4, h));
    vec3 sd = normalize(uSun);
    float s = max(dot(d, sd), 0.0);
    float band = pow(1.0 - min(abs(h), 1.0), 4.0);
    col = mix(col, uSunset, uGlow * band * (0.35 + 0.65 * pow(s, 3.0)));
    #ifdef REALISTIC
      // halo do sol (espalhamento de Mie)
      col += vec3(1.0, 0.85, 0.6) * pow(s, 24.0) * 0.35 * uDay * (1.0 - uRain);
      // nuvens: camada de ruído projetada no céu, iluminada pelo sol
      if (h > 0.0) {
        vec2 pc = d.xz / (h + 0.06) * 1.4 + vec2(uTime * 0.012, uTime * 0.004);
        float cover = mix(0.45, 0.9, uRain);
        float n = fbm(pc * 0.55);
        float dens = smoothstep(1.0 - cover, 1.0 - cover + 0.32, n);
        float n2 = fbm(pc * 0.55 + sd.xz * 0.06);
        float lit = clamp(0.65 + (n - n2) * 4.0, 0.25, 1.25);
        vec3 cloudDay = mix(vec3(0.55, 0.58, 0.64), vec3(1.02, 1.0, 0.97), lit);
        cloudDay = mix(cloudDay, vec3(0.42, 0.44, 0.48), uRain * 0.8);
        vec3 cloudCol = mix(vec3(0.05, 0.06, 0.09), cloudDay, uDay);
        cloudCol = mix(cloudCol, uSunset * 1.1, uGlow * 0.55 * (0.4 + 0.6 * pow(s, 2.0)));
        // borda iluminada perto do sol
        cloudCol += vec3(1.0, 0.9, 0.7) * pow(s, 10.0) * (1.0 - dens) * 0.6 * uDay;
        float fade = smoothstep(0.0, 0.18, h);
        col = mix(col, cloudCol, dens * fade * 0.96);
      }
    #endif
    gl_FragColor = vec4(col, 1.0);
  }`;

class Sky {
  constructor(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);
    this.uniforms = {
      uTop: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uSun: { value: new THREE.Vector3() }, uGlow: { value: 0 },
      uSunset: { value: SUNSET }, uTime: { value: 0 }, uRain: { value: 0 }, uDay: { value: 1 },
    };
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(500, 32, 20));
    this.dome.renderOrder = -10;
    this.group.add(this.dome);
    this.setMode(false);

    this.sunTex = canvasTexture(paintSun());
    this.moonTex = canvasTexture(paintMoon());
    const quad = (tex, size) => {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(size, size),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending }),
      );
      m.renderOrder = -9;
      this.group.add(m);
      return m;
    };
    this.sun = quad(this.sunTex, 70);
    this.moon = quad(this.moonTex, 46);

    const rnd = mulberry32(42);
    const pos = [];
    for (let i = 0; i < 1500; i++) {
      const u = rnd() * 2 - 1, t = rnd() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      pos.push(r * Math.cos(t) * 450, u * 450, r * Math.sin(t) * 450);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    this.starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, depthWrite: false, depthTest: false });
    this.stars = new THREE.Points(sg, this.starMat);
    this.stars.renderOrder = -9.5;
    this.group.add(this.stars);
  }
  setMode(realistic) {
    if (this.realistic === realistic && this.dome.material) return;
    this.realistic = realistic;
    if (this.dome.material) this.dome.material.dispose();
    this.dome.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      defines: realistic ? { REALISTIC: 1 } : {},
      vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: skyFrag,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
    });
  }
  update(cam, env, time, underwater, rain) {
    this.group.position.copy(cam.position);
    this.group.visible = !underwater && !this.hidden;
    const u = this.uniforms;
    u.uTop.value.copy(env.top);
    u.uHor.value.copy(env.hor);
    u.uSun.value.copy(env.sunDir);
    u.uGlow.value = env.glow;
    u.uTime.value = performance.now() / 1000;
    u.uRain.value = rain;
    u.uDay.value = env.daylight;
    const d = env.sunDir;
    this.sun.position.set(d.x * 400, d.y * 400, d.z * 400);
    this.sun.lookAt(0, 0, 0);
    this.moon.position.set(-d.x * 400, -d.y * 400, -d.z * 400);
    this.moon.lookAt(0, 0, 0);
    this.sun.material.opacity = this.moon.material.opacity = 1 - rain * 0.9;
    this.starMat.opacity = Math.max(0, 1 - env.daylight * 1.6) * (1 - rain);
    this.stars.rotation.z = (time / 24000) * Math.PI * 2;
  }
}

function paintSun() {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const d = Math.max(Math.abs(x - 15.5), Math.abs(y - 15.5));
    let a = 0, col = '255,250,210';
    if (d < 6) a = 1;
    else if (d < 7) { a = 1; col = '255,230,140'; }
    else a = Math.max(0, 0.45 - (d - 7) * 0.05);
    g.fillStyle = `rgba(${col},${a})`;
    g.fillRect(x, y, 1, 1);
  }
  return c;
}
function paintMoon() {
  const p = new Painter(77);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    if (x < 4 || x > 11 || y < 4 || y > 11) p.set(x, y, [0, 0, 0], 0);
    else {
      const crater = (x === 6 && y === 6) || (x === 9 && y === 8) || (x === 7 && y === 10) || (x === 10 && y === 5);
      p.set(x, y, crater ? [150, 150, 170] : [220, 225, 240], 255);
    }
  }
  return p.canvas();
}

// ---------- nuvens em blocos ----------
const CLOUD_CELL = 12, CLOUD_N = 48, CLOUD_Y = 140, CLOUD_H = 4;
class Clouds {
  constructor(scene) {
    const noise = new Perlin(1234);
    const on = (x, z) => {
      x = ((x % CLOUD_N) + CLOUD_N) % CLOUD_N;
      z = ((z % CLOUD_N) + CLOUD_N) % CLOUD_N;
      // ruído periódico: amostra num toro
      const a = (x / CLOUD_N) * Math.PI * 2, b = (z / CLOUD_N) * Math.PI * 2;
      const v = noise.noise3(Math.cos(a) * 3, Math.sin(a) * 3 + Math.cos(b) * 3, Math.sin(b) * 3) + noise.noise3(Math.cos(a) * 7, Math.sin(a) * 7 + Math.cos(b) * 7, Math.sin(b) * 7 + 9) * 0.4;
      return v > 0.12;
    };
    const pos = [], col = [];
    const quad = (pts, s) => {
      const [a, b, c, d] = pts;
      pos.push(...a, ...b, ...c, ...a, ...c, ...d);
      for (let i = 0; i < 6; i++) col.push(s, s, s);
    };
    const S = CLOUD_CELL, H = CLOUD_H;
    for (let z = 0; z < CLOUD_N; z++) for (let x = 0; x < CLOUD_N; x++) {
      if (!on(x, z)) continue;
      const x0 = x * S, x1 = x0 + S, z0 = z * S, z1 = z0 + S;
      quad([[x0, H, z1], [x1, H, z1], [x1, H, z0], [x0, H, z0]], 1);
      quad([[x0, 0, z0], [x1, 0, z0], [x1, 0, z1], [x0, 0, z1]], 0.7);
      if (!on(x + 1, z)) quad([[x1, 0, z1], [x1, 0, z0], [x1, H, z0], [x1, H, z1]], 0.85);
      if (!on(x - 1, z)) quad([[x0, 0, z0], [x0, 0, z1], [x0, H, z1], [x0, H, z0]], 0.85);
      if (!on(x, z + 1)) quad([[x0, 0, z1], [x1, 0, z1], [x1, H, z1], [x0, H, z1]], 0.92);
      if (!on(x, z - 1)) quad([[x1, 0, z0], [x0, 0, z0], [x0, H, z0], [x1, H, z0]], 0.92);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(1, 1, 1) }, uFog: { value: new THREE.Color() }, uFar: { value: 300 }, uCam: { value: new THREE.Vector3() } },
      vertexShader: `attribute vec3 color; varying vec3 vC; varying vec3 vW; void main(){ vC = color; vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `uniform vec3 uColor, uFog, uCam; uniform float uFar; varying vec3 vC; varying vec3 vW;
        void main(){ float d = length(vW.xz - uCam.xz); float f = smoothstep(uFar*0.5, uFar, d);
          gl_FragColor = vec4(mix(vC * uColor, uFog, f), 0.8 * (1.0 - f)); }`,
      transparent: true,
      depthWrite: false,
    });
    this.group = new THREE.Group();
    this.tiles = [];
    for (let i = 0; i < 9; i++) {
      const m = new THREE.Mesh(g, this.mat);
      m.frustumCulled = false;
      m.renderOrder = 3;
      this.group.add(m);
      this.tiles.push(m);
    }
    scene.add(this.group);
    this.drift = 0;
    this.last = performance.now();
  }
  update(cam, env, enabled, far, rain = 0) {
    this.group.visible = enabled;
    if (!enabled) return;
    const now = performance.now();
    this.drift += ((now - this.last) / 1000) * (1.2 + rain * 2);
    this.last = now;
    const T = CLOUD_N * CLOUD_CELL;
    const ox = cam.position.x - this.drift, oz = cam.position.z;
    const bx = Math.floor(ox / T) * T + this.drift, bz = Math.floor(oz / T) * T;
    let k = 0;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      this.tiles[k++].position.set(bx + dx * T, CLOUD_Y, bz + dz * T);
    }
    const day = env.daylight * (1 - rain * 0.45);
    this.mat.uniforms.uColor.value.setRGB(0.12 + 0.88 * day, 0.12 + 0.88 * day, 0.16 + 0.84 * day).lerp(new THREE.Color(1, 0.75, 0.6), env.glow * 0.3);
    this.mat.uniforms.uFog.value.copy(env.fog);
    this.mat.uniforms.uFar.value = Math.max(220, far * 1.6);
    this.mat.uniforms.uCam.value.copy(cam.position);
  }
}

export { CH };
