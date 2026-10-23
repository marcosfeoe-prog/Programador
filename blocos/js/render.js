// Renderização: materiais dos blocos, qualidade gráfica (Baixo/Médio/Alto/ULTRA), sombras do sol,
// pós-processamento, céu, nuvens, seleção e rachaduras.
import * as THREE from 'three';
import { CS, CH } from './consts.js';
import { buildChunkGeometry, setMeshOptions } from './mesher.js';
import { tileUV, Painter, canvasTexture } from './textures.js';
import { mulberry32, Perlin } from './noise.js';

// ---------- níveis de qualidade ----------
export const QUALITY = {
  low: { label: 'Baixo', pixelRatio: 0.6, shadows: 0, waving: false, hd: false, post: false, water: false, skyClouds: false, blockClouds: false, fastLeaves: true, particles: 0.35, fallingLeaves: false, articulated: false },
  medium: { label: 'Médio', pixelRatio: 1.5, shadows: 0, waving: false, hd: false, post: false, water: false, skyClouds: false, blockClouds: true, fastLeaves: false, particles: 1, fallingLeaves: false, articulated: false },
  high: { label: 'Alto', pixelRatio: 1.75, shadows: 1024, shadowRange: 44, pcf: 1, waving: true, hd: false, post: true, bloom: true, godrays: false, water: true, skyClouds: false, blockClouds: true, fastLeaves: false, particles: 1, fallingLeaves: true, articulated: false },
  ultra: { label: 'ULTRA', pixelRatio: 2, shadows: 2048, shadowRange: 64, pcf: 2, waving: true, hd: true, post: true, bloom: true, godrays: true, water: true, skyClouds: true, blockClouds: false, fastLeaves: false, particles: 1, fallingLeaves: true, articulated: true },
};
export const QUALITY_ORDER = ['low', 'medium', 'high', 'ultra'];

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
    gl_Position = projectionMatrix * mv;
  }
`;

const blockFrag = /* glsl */ `
  uniform sampler2D uAtlas;
  uniform sampler2D uNormalAtlas;
  uniform sampler2D uShadowMap;
  uniform mat4 uShadowMatrix;
  uniform float uShadowTexel;
  uniform float uSkyDarken;
  uniform vec3 uSkyColor;
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
  varying vec2 vUv;
  varying vec4 vLight;
  varying vec3 vTint;
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying vec3 vTangent;
  varying float vFlags;
  varying float vDist;

  float lb(float L) {
    float f = 1.0 - L / 15.0;
    float b = (1.0 - f) / (f * 3.0 + 1.0);
    return mix(b, sqrt(b), uGamma);
  }

  vec4 atlas(sampler2D t, vec2 uv) {
    #ifdef HD
      // fica dentro da textura do bloco para não "vazar" para a vizinha no atlas
      vec2 cell = floor(uv * 16.0);
      vec2 f = fract(uv * 16.0);
      vec2 dx = dFdx(uv), dy = dFdy(uv);
      float m = clamp(max(length(dx), length(dy)) * 16.0 * 0.6, 0.5 / 64.0, 0.2);
      f = clamp(f, m, 1.0 - m);
      return textureGrad(t, (cell + f) / 16.0, dx, dy);
    #else
      return texture2D(t, uv);
    #endif
  }

  float shadowAt(vec3 wp, vec3 n) {
    #ifdef SHADOWS
      vec4 sc = uShadowMatrix * vec4(wp + n * 0.06, 1.0);
      if (sc.x <= 0.0 || sc.x >= 1.0 || sc.y <= 0.0 || sc.y >= 1.0 || sc.z >= 1.0) return 1.0;
      float bias = 0.0008;
      float s = 0.0;
      #if PCF == 2
        for (int i = -2; i <= 2; i++) for (int j = -2; j <= 2; j++)
          s += step(sc.z - bias, texture2D(uShadowMap, sc.xy + vec2(float(i), float(j)) * uShadowTexel * 0.75).r);
        s /= 25.0;
      #else
        for (int i = 0; i <= 1; i++) for (int j = 0; j <= 1; j++)
          s += step(sc.z - bias, texture2D(uShadowMap, sc.xy + (vec2(float(i), float(j)) - 0.5) * uShadowTexel).r);
        s /= 4.0;
      #endif
      // suaviza a borda da área com sombra
      vec2 e = min(sc.xy, 1.0 - sc.xy);
      float fade = smoothstep(0.0, 0.08, min(e.x, e.y));
      return mix(1.0, s, fade);
    #else
      return 1.0;
    #endif
  }

  void main() {
    vec4 tex = atlas(uAtlas, vUv);
    if (tex.a < uAlphaTest) discard;
    float skyL = max(0.0, vLight.x * 15.0 - uSkyDarken);
    float bs = lb(skyL);
    float bb = lb(vLight.y * 15.0);
    vec3 N = normalize(vNormal);
    float ao = vLight.w;
    // quanto deste ponto enxerga o céu (só aí o sol pode bater)
    float exposure = smoothstep(0.6, 0.95, vLight.x);
    float alpha = tex.a * uOpacity;
    vec3 col;
    bool isWater = vFlags > 3.5 && vFlags < 4.5;
    #ifdef HD
      vec3 T = normalize(vTangent - N * dot(vTangent, N));
      vec3 Bt = cross(N, T);
      vec4 nm = atlas(uNormalAtlas, vUv);
      vec3 tn = nm.xyz * 2.0 - 1.0;
      vec3 Np = normalize(T * tn.x + Bt * tn.y + N * max(tn.z, 0.2));
      float shadow = shadowAt(vWorld, N);
      if (vFlags > 0.5 && vFlags < 1.5) shadow = 0.45 + 0.55 * shadow;
      float ndl = max(dot(Np, uSunDir), 0.0);
      float wrap = max(dot(N, uSunDir) * 0.5 + 0.5, 0.0);
      float sunVis = ndl * shadow * exposure * uSunAmount;
      vec3 ambient = uSkyColor * bs * (0.34 + 0.14 * Np.y + 0.08 * wrap + 0.38 * (1.0 - uSunAmount));
      vec3 direct = uSunColor * sunVis;
      vec3 torch = bb * vec3(1.08, 0.82, 0.56) * 1.15;
      vec3 light = (ambient + direct) * ao + torch * ao;
      light = max(light, vec3(0.02));
      col = tex.rgb * vTint * light;
      vec3 V = normalize(uCamPos - vWorld);
      vec3 H = normalize(uSunDir + V);
      float gloss = max(nm.a, uWet * 0.6 * step(0.5, N.y) * exposure);
      float sp = pow(max(dot(Np, H), 0.0), mix(12.0, 120.0, gloss)) * gloss * sunVis;
      col += uSunColor * sp * 0.9;
      // plantas e folhas deixam passar luz (translucidez)
      if (vFlags > 0.5 && vFlags < 2.5) col += tex.rgb * vTint * uSunColor * max(dot(-N, uSunDir), 0.0) * 0.25 * exposure * shadow * uSunAmount;
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
          vec3 Nw = normalize(vec3(-g.x, 1.0, -g.y));
          float fres = 0.03 + 0.97 * pow(1.0 - max(dot(Nw, V), 0.0), 5.0);
          vec3 R = reflect(-V, Nw);
          float skyExp = lb(skyL);
          vec3 refl = mix(uSkyHor, uSkyTop, clamp(R.y * 2.0, 0.0, 1.0)) * (0.35 + 0.65 * exposure) * max(skyExp, 0.1);
          float shadowW = shadowAt(vWorld, vec3(0.0, 1.0, 0.0));
          float spec = pow(max(dot(R, uSunDir), 0.0), 220.0) * 4.0 * shadowW * exposure * uSunAmount;
          vec3 body = vec3(0.03, 0.12, 0.2) * (bs + bb * 0.5) * 1.6 + tex.rgb * 0.15 * bs;
          col = mix(body, refl, fres) + uSunColor * spec;
          alpha = clamp(mix(0.62, 0.97, fres) + spec, 0.0, 1.0);
        }
      }
    #endif
    float fog = smoothstep(uFogNear, uFogFar, vDist);
    gl_FragColor = vec4(mix(col, uFogColor, fog), alpha);
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
const brightFrag = `uniform sampler2D tColor; varying vec2 vUv;
  void main(){ vec3 c = texture2D(tColor, vUv).rgb; float l = max(c.r, max(c.g, c.b)); gl_FragColor = vec4(c * smoothstep(1.0, 2.0, l), 1.0); }`;
const blurFrag = `uniform sampler2D tColor; uniform vec2 uDir; varying vec2 vUv;
  void main(){ vec3 s = texture2D(tColor, vUv).rgb * 0.227;
    s += texture2D(tColor, vUv + uDir * 1.385).rgb * 0.316; s += texture2D(tColor, vUv - uDir * 1.385).rgb * 0.316;
    s += texture2D(tColor, vUv + uDir * 3.231).rgb * 0.07; s += texture2D(tColor, vUv - uDir * 3.231).rgb * 0.07;
    gl_FragColor = vec4(s, 1.0); }`;
const compositeFrag = `
  uniform sampler2D tColor; uniform sampler2D tBloom; uniform sampler2D tDepth;
  uniform float uBloom; uniform float uExposure; uniform vec2 uSunUV; uniform float uRays; uniform vec3 uSunColor;
  varying vec2 vUv;
  vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
  void main(){
    vec3 c = texture2D(tColor, vUv).rgb;
    #ifdef BLOOM
      c += texture2D(tBloom, vUv).rgb * uBloom;
    #endif
    #ifdef GODRAYS
      if (uRays > 0.0) {
        // raios de sol: espalha a luz do céu visível na direção do sol
        vec2 d = (vUv - uSunUV) / 40.0;
        vec2 p = vUv;
        float acc = 0.0, w = 1.0;
        for (int i = 0; i < 40; i++) {
          p -= d;
          float sky = step(0.9999, texture2D(tDepth, p).r);
          float rad = 1.0 - min(length(p - uSunUV) * 1.6, 1.0);
          acc += sky * rad * w;
          w *= 0.965;
        }
        c += uSunColor * acc / 40.0 * uRays;
      }
    #endif
    vec3 lin = pow(max(c, 0.0), vec3(2.2)) * uExposure;
    vec3 mapped = pow(aces(lin), vec3(1.0 / 2.2));
    float l = dot(mapped, vec3(0.299, 0.587, 0.114));
    mapped = mix(vec3(l), mapped, 1.04);
    gl_FragColor = vec4(mapped, 1.0);
  }`;

export class Renderer {
  constructor(canvas, atlas) {
    THREE.ColorManagement.enabled = false;
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.gl.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.gl.autoClear = false;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(70, 1, 0.05, 1200);
    this.camera.layers.enable(1);
    this.camera.layers.enable(2);
    this.atlas = atlas;
    this.lowAtlas = atlas;
    this.uniforms = {
      uAtlas: { value: atlas },
      uNormalAtlas: { value: null },
      uShadowMap: { value: null },
      uShadowMatrix: { value: new THREE.Matrix4() },
      uShadowTexel: { value: 1 / 1024 },
      uSkyDarken: { value: 0 },
      uSkyColor: { value: new THREE.Color(1, 1, 1) },
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
    };
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
    this.setQuality('medium');
  }

  // Troca a qualidade gráfica: materiais, sombras, pós-processamento e texturas.
  setQuality(name, hdBuilder) {
    const q = QUALITY[name] || QUALITY.medium;
    this.qualityName = name;
    this.q = q;
    if (q.hd && !this.hdAtlas && hdBuilder) this.hdAtlas = hdBuilder();
    const hd = q.hd && this.hdAtlas;
    this.atlas = hd ? this.hdAtlas.albedo : this.lowAtlas;
    this.uniforms.uAtlas.value = this.atlas;
    this.uniforms.uNormalAtlas.value = hd ? this.hdAtlas.normal : null;
    const defines = {};
    if (q.waving) defines.WAVING = 1;
    if (hd) defines.HD = 1;
    if (q.shadows) {
      defines.SHADOWS = 1;
      defines.PCF = q.pcf;
    }
    const mk = (extra) =>
      new THREE.ShaderMaterial({
        uniforms: { ...this.uniforms, uAlphaTest: { value: extra.alphaTest }, uOpacity: { value: 1 } },
        defines: { ...defines, ...(extra.defines || {}) },
        vertexShader: blockVert,
        fragmentShader: blockFrag,
        transparent: !!extra.transparent,
        depthWrite: extra.depthWrite ?? true,
        side: THREE.FrontSide,
      });
    const oldS = this.solidMat, oldT = this.transMat;
    this.solidMat = mk({ alphaTest: hd ? 0.4 : 0.5 });
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
      this.uniforms.uShadowMap.value = this.shadowRT.depthTexture;
      this.uniforms.uShadowTexel.value = 1 / q.shadows;
      const r = q.shadowRange;
      this.shadowCam = new THREE.OrthographicCamera(-r, r, r, -r, 1, 400);
      this.shadowCam.layers.set(1);
      this.depthMat = new THREE.ShaderMaterial({ uniforms: { uAtlas: this.uniforms.uAtlas, uTime: this.uniforms.uTime }, vertexShader: depthVert, fragmentShader: depthFrag });
      this.entityDepthMat = new THREE.MeshBasicMaterial();
    } else this.uniforms.uShadowMap.value = null;
    // pós-processamento
    if (q.post) {
      this.postMats = {
        bright: new THREE.ShaderMaterial({ uniforms: { tColor: { value: null } }, vertexShader: fsVert, fragmentShader: brightFrag, depthTest: false, depthWrite: false }),
        blur: new THREE.ShaderMaterial({ uniforms: { tColor: { value: null }, uDir: { value: new THREE.Vector2() } }, vertexShader: fsVert, fragmentShader: blurFrag, depthTest: false, depthWrite: false }),
        composite: new THREE.ShaderMaterial({
          uniforms: {
            tColor: { value: null }, tBloom: { value: null }, tDepth: { value: null }, uBloom: { value: 0.6 }, uExposure: { value: 1.0 },
            uSunUV: { value: new THREE.Vector2() }, uRays: { value: 0 }, uSunColor: { value: new THREE.Color() },
          },
          defines: { ...(q.bloom ? { BLOOM: 1 } : {}), ...(q.godrays ? { GODRAYS: 1 } : {}) },
          vertexShader: fsVert,
          fragmentShader: compositeFrag,
          depthTest: false,
          depthWrite: false,
        }),
      };
    }
    this.sky.setMode(q.skyClouds);
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
    if (this.q && this.q.post) {
      const size = this.gl.getDrawingBufferSize(new THREE.Vector2());
      const W = size.x, H = size.y;
      if (this.hdrRT) {
        this.hdrRT.dispose();
        this.bloomA.dispose();
        this.bloomB.dispose();
      }
      this.hdrRT = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, depthTexture: new THREE.DepthTexture(W, H, THREE.UnsignedIntType) });
      const bw = Math.max(1, W >> 2), bh = Math.max(1, H >> 2);
      this.bloomA = new THREE.WebGLRenderTarget(bw, bh, { type: THREE.HalfFloatType });
      this.bloomB = new THREE.WebGLRenderTarget(bw, bh, { type: THREE.HalfFloatType });
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
    const u = this.uniforms;
    u.uTime.value = performance.now() / 1000;
    u.uSkyDarken.value = (1 - env.daylight) * 11 + rain * 2;
    u.uSkyColor.value.copy(env.lightColor);
    u.uSunDir.value.copy(env.lightDir);
    u.uSunColor.value.copy(env.sunColor);
    u.uSunAmount.value = 1 - rain * 0.85;
    u.uCamPos.value.copy(cam.position);
    u.uSkyTop.value.copy(env.top);
    u.uSkyHor.value.copy(env.hor);
    u.uWindStrength.value = 1 + rain * 1.5;
    u.uWet.value = rain;
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
    const m = this.uniforms.uShadowMatrix.value;
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

  render(extraScene, extraCam, shadowCenter) {
    const g = this.gl;
    if (shadowCenter && this.q.shadows && this.uniforms.uSunAmount.value > 0.05) this.renderShadows(shadowCenter);
    if (this.q.post) {
      g.setRenderTarget(this.hdrRT);
      g.setClearColor(this.clearColor || 0x87ceeb, 1);
      g.clear(true, true, true);
      g.render(this.skyScene, this.camera);
      g.render(this.scene, this.camera);
      const pm = this.postMats;
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
      // posição do sol na tela para os raios
      cu.uRays.value = 0;
      if (this.q.godrays && this.env && !this.underwater) {
        const sp = this.env.sunDir.clone().multiplyScalar(400).add(this.camera.position).project(this.camera);
        const front = this.env.sunDir.dot(this.camera.getWorldDirection(new THREE.Vector3())) > 0;
        if (front && this.env.sunDir.y > -0.05) {
          cu.uSunUV.value.set(sp.x * 0.5 + 0.5, sp.y * 0.5 + 0.5);
          const edge = Math.max(Math.abs(sp.x), Math.abs(sp.y));
          cu.uRays.value = 0.55 * Math.max(0, 1 - Math.max(0, edge - 0.6) * 1.2) * (1 - this.weather.rain) * Math.min(1, this.env.sunDir.y * 6 + 0.4);
          cu.uSunColor.value.copy(this.env.sunColor);
        }
      }
      cu.uExposure.value = 0.68;
      this.fsPass(pm.composite, { tColor: this.hdrRT.texture }, null);
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
    this.group.visible = !underwater;
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
