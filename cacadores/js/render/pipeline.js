// Pipeline de renderização: cena (HDR + profundidade) → nuvens (baixa resolução) →
// volume abaixo da base (média resolução) → composição com upsample bilateral, céu,
// névoa, exposição, tone mapping ACES e correção de cor → partículas por cima.

import * as THREE from 'three';

const COMPOSITE = /* glsl */ `
precision highp float;
uniform sampler2D tScene;
uniform sampler2D tDepth;
uniform sampler2D tCloud;
uniform sampler2D tVol;
uniform vec2 uCloudRes;
uniform vec2 uVolRes;
uniform mat4 uProjInv;
uniform mat4 uCamMat;
uniform float uNear;
uniform float uFar;
uniform vec3 uSunDir;
uniform vec3 uSunCol;
uniform vec3 uMoonDir;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uHaze;
uniform float uNight;
uniform float uVis;
uniform float uCamY;
uniform float uGround;
uniform float uExposure;
uniform float uTime;
uniform float uFlash;
uniform float uSat;
uniform float uGreen;
uniform float uFade;
uniform float uRainLens;
uniform float uDamage;
uniform float uMeter;
varying vec2 vUv;

float sstep(float a, float b, float x) { float t = clamp((x - a) / (b - a), 0.0, 1.0); return t * t * (3.0 - 2.0 * t); }
float hg(float c, float g) { float g2 = g * g; return (1.0 - g2) / (12.566 * pow(max(1.0 + g2 - 2.0 * g * c, 1e-4), 1.5)); }
float h12(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

vec3 rayDir(vec2 uv) {
  vec4 v = uProjInv * vec4(uv * 2.0 - 1.0, 1.0, 1.0);
  v /= v.w;
  return normalize((uCamMat * vec4(v.xyz, 0.0)).xyz);
}
float linZ(float d) {
  return (uNear * uFar) / (uFar - d * (uFar - uNear));
}

vec4 upsample(sampler2D t, vec2 res, vec2 uv, float zFull, float spread) {
  // Bilateral 3×3 (tenda): suaviza o pontilhado do ray marching sem borrar silhuetas.
  vec2 p = uv * res - 0.5;
  vec2 b = (floor(p) + 0.5) / res;
  vec2 f = fract(p);
  vec4 acc = vec4(0.0);
  float ws = 0.0;
  for (int j = -1; j <= 2; j++)
    for (int i = -1; i <= 2; i++) {
      vec2 o = vec2(float(i), float(j));
      vec2 tuv = b + o / res;
      vec2 dd = (o - f) / spread;
      float wb = max(0.0, 1.0 - abs(dd.x)) * max(0.0, 1.0 - abs(dd.y));
      if (wb <= 0.0) continue;
      float zk = linZ(texture2D(tDepth, tuv).x);
      float wd = 1.0 / (0.002 + abs(zk - zFull) / max(zFull, 1.0));
      float w = wb * wd + 1e-7;
      acc += texture2D(t, tuv) * w;
      ws += w;
    }
  return acc / max(ws, 1e-7);
}

vec3 skyColor(vec3 rd) {
  float y = rd.y;
  vec3 c = mix(uHorizon, uZenith, pow(clamp(y, 0.0, 1.0), 0.42));
  if (y < 0.0) c = mix(uHorizon, uHaze * 0.85, clamp(-y * 6.0, 0.0, 1.0));
  float mu = dot(rd, uSunDir);
  c += uSunCol * (0.018 * hg(mu, 0.78) + 0.0015);
  c += uSunCol * smoothstep(0.99986, 0.99996, mu) * 70.0;
  // Noite: estrelas e lua.
  if (uNight > 0.01 && y > 0.0) {
    vec2 sp = vec2(atan(rd.z, rd.x) * 180.0, asin(y) * 180.0);
    vec2 cell = floor(sp);
    float h = h12(cell);
    float star = step(0.985, h) * sstep(0.35, 0.0, length(fract(sp) - 0.5)) * (0.5 + 0.5 * sin(uTime * 3.0 + h * 50.0));
    c += vec3(0.8, 0.85, 1.0) * star * 0.25 * uNight * clamp(y * 4.0, 0.0, 1.0);
    float mm = dot(rd, uMoonDir);
    c += vec3(0.75, 0.8, 0.9) * smoothstep(0.99955, 0.99975, mm) * 1.2 * uNight;
    c += vec3(0.05, 0.06, 0.09) * hg(mm, 0.85) * 0.05 * uNight;
  }
  return c;
}

vec3 aces(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}

void main() {
  vec2 uv = vUv;
  vec3 rd = rayDir(uv);
  float depth = texture2D(tDepth, uv).x;
  bool sky = depth >= 0.99999;
  float zf = linZ(depth);
  vec3 col;
  if (sky) {
    vec3 bg = skyColor(rd);
    vec4 cl = upsample(tCloud, uCloudRes, uv, zf, 1.9);
    col = bg * (1.0 - cl.a) + cl.rgb;
  } else {
    col = texture2D(tScene, uv).rgb;
    vec3 fwd = -normalize(uCamMat[2].xyz);
    float dist = zf / max(dot(rd, fwd), 1e-4);
    // Névoa com perfil de altura (mais densa junto ao chão).
    float hfac = exp(-max(uCamY - uGround, 0.0) / 1500.0);
    float fog = 1.0 - exp(-dist / uVis * mix(0.75, 1.0, hfac));
    float mu = dot(rd, uSunDir);
    vec3 fogCol = uHaze + uSunCol * 0.012 * hg(mu, 0.7);
    col = mix(col, fogCol, fog);
  }
  vec4 v = upsample(tVol, uVolRes, uv, zf, 1.0);
  col = col * (1.0 - v.a) + v.rgb;
  // Clarão de relâmpago próximo.
  col += vec3(0.6, 0.65, 0.8) * uFlash * 0.25;
  if (uMeter > 0.5) { gl_FragColor = vec4(col, 1.0); return; }
  col *= uExposure;
  col = aces(col);
  // Cor: saturação, tom esverdeado sob núcleos de granizo, contraste leve.
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(l), col, uSat);
  col *= mix(vec3(1.0), vec3(0.88, 1.04, 0.92), uGreen);
  col = pow(col, vec3(1.0 / 2.2));
  col = (col - 0.5) * 1.08 + 0.5;
  // Gotas na lente (câmera na chuva).
  if (uRainLens > 0.01) {
    vec2 g = uv * vec2(28.0, 16.0);
    vec2 id = floor(g);
    float h = h12(id + floor(uTime * 0.7 + h12(id) * 5.0));
    vec2 c = fract(g) - vec2(0.5 + (h - 0.5) * 0.6, 0.5);
    float drop = sstep(0.18, 0.08, length(c * vec2(1.0, 0.8))) * step(1.0 - uRainLens * 0.5, h);
    col = mix(col, col * 1.15 + 0.03, drop * 0.6);
  }
  // Vinheta.
  vec2 vv = uv - 0.5;
  col *= 1.0 - dot(vv, vv) * 0.55;
  // Dano no veículo: bordas vermelhas.
  col = mix(col, vec3(0.6, 0.05, 0.03), uDamage * sstep(0.2, 0.75, length(vv) * 1.4));
  col *= 1.0 - uFade;
  // Pontilhado contra faixas (banding) no céu escuro.
  col += (h12(gl_FragCoord.xy + fract(uTime)) - 0.5) / 255.0;
  gl_FragColor = vec4(col, 1.0);
}
`;

const VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

export class Pipeline {
  constructor(renderer, q) {
    this.r = renderer;
    this.q = q;
    this.scale = 1;
    this.halfFloat = renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float');
    this.type = this.halfFloat ? THREE.HalfFloatType : THREE.UnsignedByteType;
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: COMPOSITE,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        tScene: { value: null },
        tDepth: { value: null },
        tCloud: { value: null },
        tVol: { value: null },
        uCloudRes: { value: new THREE.Vector2() },
        uVolRes: { value: new THREE.Vector2() },
        uProjInv: { value: new THREE.Matrix4() },
        uCamMat: { value: new THREE.Matrix4() },
        uNear: { value: 0.5 },
        uFar: { value: 1000 },
        uSunDir: { value: new THREE.Vector3() },
        uSunCol: { value: new THREE.Color() },
        uMoonDir: { value: new THREE.Vector3() },
        uZenith: { value: new THREE.Color() },
        uHorizon: { value: new THREE.Color() },
        uHaze: { value: new THREE.Color() },
        uNight: { value: 0 },
        uVis: { value: 30000 },
        uCamY: { value: 0 },
        uGround: { value: 0 },
        uExposure: { value: 1 },
        uTime: { value: 0 },
        uFlash: { value: 0 },
        uSat: { value: 1 },
        uGreen: { value: 0 },
        uFade: { value: 0 },
        uRainLens: { value: 0 },
        uDamage: { value: 0 },
        uMeter: { value: 0 },
      },
    });
    // Fotometria: a composição é desenhada também num alvo minúsculo e lida de volta.
    this.meterRT = new THREE.WebGLRenderTarget(24, 14, { type: THREE.FloatType, depthBuffer: false });
    this.meterBuf = new Float32Array(24 * 14 * 4);
    this.meterT = 0;
    this.avgLum = 0.15;
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat);
    this.quad.frustumCulled = false;
    this.qscene = new THREE.Scene();
    this.qscene.add(this.quad);
    this.qcam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.overlay = new THREE.Scene();
    this.size = new THREE.Vector2(1, 1);
  }

  makeTargets(w, h) {
    this.dispose();
    const q = this.q;
    const sw = Math.max(1, Math.round(w * this.scale));
    const sh = Math.max(1, Math.round(h * this.scale));
    this.sceneRT = new THREE.WebGLRenderTarget(sw, sh, {
      type: this.type,
      depthBuffer: true,
      samples: q.msaa || 0,
      depthTexture: new THREE.DepthTexture(sw, sh),
    });
    this.sceneRT.texture.minFilter = THREE.LinearFilter;
    this.sceneRT.texture.generateMipmaps = false;
    const mk = (s) => {
      const rt = new THREE.WebGLRenderTarget(Math.max(1, Math.round(sw * s)), Math.max(1, Math.round(sh * s)), { type: this.type, depthBuffer: false });
      rt.texture.minFilter = THREE.LinearFilter;
      rt.texture.magFilter = THREE.LinearFilter;
      rt.texture.generateMipmaps = false;
      return rt;
    };
    this.cloudRT = mk(q.cloudScale);
    this.volRT = mk(q.volScale);
    this.size.set(w, h);
  }

  dispose() {
    for (const k of ['sceneRT', 'cloudRT', 'volRT']) {
      if (this[k]) {
        this[k].depthTexture?.dispose();
        this[k].dispose();
        this[k] = null;
      }
    }
  }

  resize(w, h) {
    if (!this.sceneRT || w !== this.size.x || h !== this.size.y) this.makeTargets(w, h);
  }

  setScale(s) {
    if (Math.abs(s - this.scale) < 0.02) return;
    this.scale = s;
    this.makeTargets(this.size.x, this.size.y);
  }

  setQuality(q) {
    this.q = q;
    this.makeTargets(this.size.x, this.size.y);
  }

  render(scene, camera, volume, params) {
    const r = this.r;
    r.setRenderTarget(this.sceneRT);
    r.setClearColor(0x000000, 0);
    r.clear(true, true, false);
    r.render(scene, camera);
    const depth = this.sceneRT.depthTexture;
    volume.setCamera(camera);
    volume.renderClouds(r, this.cloudRT, depth, this.q.cloudSteps, this.q.lightSteps);
    volume.renderVolume(r, this.volRT, depth, this.q.volSteps);
    const u = this.mat.uniforms;
    u.tScene.value = this.sceneRT.texture;
    u.tDepth.value = depth;
    u.tCloud.value = this.cloudRT.texture;
    u.tVol.value = this.volRT.texture;
    u.uCloudRes.value.set(this.cloudRT.width, this.cloudRT.height);
    u.uVolRes.value.set(this.volRT.width, this.volRT.height);
    u.uProjInv.value.copy(camera.projectionMatrixInverse);
    u.uCamMat.value.copy(camera.matrixWorld);
    u.uNear.value = camera.near;
    u.uFar.value = camera.far;
    u.uCamY.value = camera.position.y;
    for (const k in params) if (u[k] !== undefined) {
      const val = params[k];
      if (val && val.isColor) u[k].value.copy(val);
      else if (val && val.isVector3) u[k].value.copy(val);
      else u[k].value = val;
    }
    // Mede a luminância média (log) de tempos em tempos.
    this.meterT -= 1;
    if (this.meterT <= 0) {
      this.meterT = 20;
      u.uMeter.value = 1;
      r.setRenderTarget(this.meterRT);
      r.render(this.qscene, this.qcam);
      u.uMeter.value = 0;
      try {
        r.readRenderTargetPixels(this.meterRT, 0, 0, 24, 14, this.meterBuf);
        let s = 0;
        let n = 0;
        for (let i = 0; i < 24 * 14; i++) {
          const y = this.meterBuf[i * 4] * 0.2126 + this.meterBuf[i * 4 + 1] * 0.7152 + this.meterBuf[i * 4 + 2] * 0.0722;
          // Peso maior no centro da imagem.
          const px = (i % 24) / 23 - 0.5;
          const py = Math.floor(i / 24) / 13 - 0.5;
          const w = 1.4 - Math.hypot(px, py) * 1.4;
          if (Number.isFinite(y)) {
            s += Math.log(Math.max(1e-4, y)) * w;
            n += w;
          }
        }
        if (n > 0) this.avgLum = Math.exp(s / n);
      } catch (e) {}
    }
    r.setRenderTarget(null);
    r.render(this.qscene, this.qcam);
    // Partículas próximas (chuva, granizo) por cima, com teste de profundidade manual.
    if (this.overlay.children.length) {
      r.autoClear = false;
      r.render(this.overlay, camera);
      r.autoClear = true;
    }
    return depth;
  }
}
