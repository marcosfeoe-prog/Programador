// Pós-processamento: cena em HDR → bloom físico (cadeia de mips, sem limiar) →
// composição "sonho": tonemapping ACES, gradação pastel, aberração cromática,
// bordas desfocadas, vinheta, vazamento de luz, granulação, VHS e fade.
import * as THREE from 'three';

const VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const DOWN = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 uTexel;
uniform float uKaris;
varying vec2 vUv;
vec3 S(vec2 o) { return texture2D(tSrc, vUv + o * uTexel).rgb; }
float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
void main() {
  vec3 a = S(vec2(-2.0, 2.0)), b = S(vec2(0.0, 2.0)), c = S(vec2(2.0, 2.0));
  vec3 d = S(vec2(-2.0, 0.0)), e = S(vec2(0.0)), f = S(vec2(2.0, 0.0));
  vec3 g = S(vec2(-2.0, -2.0)), h = S(vec2(0.0, -2.0)), i = S(vec2(2.0, -2.0));
  vec3 j = S(vec2(-1.0, 1.0)), k = S(vec2(1.0, 1.0)), l = S(vec2(-1.0, -1.0)), m = S(vec2(1.0, -1.0));
  vec3 col;
  if (uKaris > 0.5) {
    vec3 g0 = (a + b + d + e) * 0.25, g1 = (b + c + e + f) * 0.25;
    vec3 g2 = (d + e + g + h) * 0.25, g3 = (e + f + h + i) * 0.25, g4 = (j + k + l + m) * 0.25;
    float w0 = 0.125 / (1.0 + lum(g0)), w1 = 0.125 / (1.0 + lum(g1));
    float w2 = 0.125 / (1.0 + lum(g2)), w3 = 0.125 / (1.0 + lum(g3)), w4 = 0.5 / (1.0 + lum(g4));
    col = (g0 * w0 + g1 * w1 + g2 * w2 + g3 * w3 + g4 * w4) / (w0 + w1 + w2 + w3 + w4);
  } else {
    col = e * 0.125 + (a + c + g + i) * 0.03125 + (b + d + f + h) * 0.0625 + (j + k + l + m) * 0.125;
  }
  gl_FragColor = vec4(max(col, vec3(0.0)), 1.0);
}
`;

const UP = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 uTexel;
varying vec2 vUv;
void main() {
  vec2 r = uTexel;
  vec3 c = texture2D(tSrc, vUv + vec2(-r.x, r.y)).rgb + texture2D(tSrc, vUv + vec2(0.0, r.y)).rgb * 2.0
         + texture2D(tSrc, vUv + r).rgb + texture2D(tSrc, vUv + vec2(-r.x, 0.0)).rgb * 2.0
         + texture2D(tSrc, vUv).rgb * 4.0 + texture2D(tSrc, vUv + vec2(r.x, 0.0)).rgb * 2.0
         + texture2D(tSrc, vUv - r).rgb + texture2D(tSrc, vUv + vec2(0.0, -r.y)).rgb * 2.0
         + texture2D(tSrc, vUv + vec2(r.x, -r.y)).rgb;
  gl_FragColor = vec4(c / 16.0, 1.0);
}
`;

const COMP = /* glsl */ `
uniform sampler2D tScene;
uniform sampler2D tBloom;
uniform vec2 uRes;
uniform float uTime;
uniform float uExposure, uBloom, uBloomNorm, uEdgeBlur, uCA, uGrain, uVignette;
uniform float uSat, uContrast, uSplit, uFade, uVHS, uWobble, uLeak, uHaze;
uniform vec3 uBloomTint, uLift, uGain, uVigColor, uTintShadow, uTintHigh, uFadeColor, uLeakColor;
varying vec2 vUv;

const mat3 ACESIn = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
const mat3 ACESOut = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
vec3 RRTODT(vec3 v) { vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
vec3 aces(vec3 c) { c = ACESIn * c; c = RRTODT(c); c = ACESOut * c; return clamp(c, 0.0, 1.0); }
vec3 toSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
float h12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float lum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

void main() {
  vec2 uv = vUv;
  float aspect = uRes.x / uRes.y;
  if (uWobble > 0.0) {
    uv += vec2(sin(uv.y * 9.0 + uTime * 1.7), cos(uv.x * 7.0 + uTime * 1.3)) * 0.006 * uWobble;
  }
  float band = 0.0;
  if (uVHS > 0.0) {
    float line = floor(uv.y * 270.0);
    uv.x += (h12(vec2(line, floor(uTime * 30.0))) - 0.5) * 0.0016 * uVHS;
    float bp = fract(uTime * 0.07);
    band = smoothstep(0.035, 0.0, abs(uv.y - (1.08 - bp * 1.3))) * uVHS;
    uv.x += band * 0.012 * sin(uv.y * 400.0 + uTime * 40.0);
  }
  vec2 dc = uv - 0.5;
  float r2 = dot(dc * vec2(aspect, 1.0), dc * vec2(aspect, 1.0));
  vec2 caOff = dc * uCA * (0.4 + r2 * 2.5);
  vec3 col;
  col.r = texture2D(tScene, uv - caOff).r;
  col.g = texture2D(tScene, uv).g;
  col.b = texture2D(tScene, uv + caOff).b;
  if (uVHS > 0.0) {
    vec2 px = vec2(1.0 / uRes.x, 0.0) * 3.0;
    vec3 bl = (texture2D(tScene, uv - px * 2.0).rgb + texture2D(tScene, uv - px).rgb + texture2D(tScene, uv + px).rgb + texture2D(tScene, uv + px * 2.0).rgb) * 0.25;
    float y0 = lum(col);
    vec3 chroma = bl - vec3(lum(bl));
    col = mix(col, max(vec3(y0) + chroma * 1.15, 0.0), 0.75 * uVHS);
  }
  vec3 bloom = texture2D(tBloom, uv).rgb * uBloomNorm;
  float edge = smoothstep(0.08, 0.55, r2);
  col = mix(col, bloom * uBloomTint, clamp(uBloom + edge * uEdgeBlur, 0.0, 1.0));
  // névoa difusora (Pro-Mist): realces sangram no entorno
  col += bloom * uBloomTint * uHaze;
  col *= uExposure / 0.6;
  col = aces(col);
  col = toSRGB(col);
  float l = lum(col);
  col = mix(vec3(l), col, uSat);
  col = (col - 0.5) * uContrast + 0.5;
  col += (uTintShadow * (1.0 - l) * (1.0 - l) + uTintHigh * l * l) * uSplit;
  col = uLift + clamp(col, 0.0, 1.0) * (1.0 - uLift);
  col *= uGain;
  // vazamento de luz (filme) que passeia pelas bordas
  if (uLeak > 0.0) {
    vec2 lp = vec2(0.5 + 0.62 * cos(uTime * 0.05), 0.5 + 0.55 * sin(uTime * 0.037 + 1.0));
    float lk = smoothstep(0.75, 0.0, length((uv - lp) * vec2(aspect, 1.0)));
    col = 1.0 - (1.0 - col) * (1.0 - uLeakColor * lk * uLeak);
  }
  float v = smoothstep(1.05, 0.2, sqrt(r2) * 1.15);
  col = mix(uVigColor, col, mix(1.0, v, uVignette));
  if (uVHS > 0.0) {
    col *= 1.0 - uVHS * 0.07 * (0.5 + 0.5 * sin(uv.y * uRes.y * 1.5708));
    col += (h12(gl_FragCoord.xy + uTime) - 0.5) * band * 0.9;
    col = mix(col, col * vec3(1.03, 0.98, 1.04), uVHS);
  }
  float n = h12(gl_FragCoord.xy + fract(uTime * 7.31) * vec2(311.0, 197.0)) - 0.5;
  col += n * uGrain * (0.55 + 0.45 * (1.0 - l));
  col += (h12(gl_FragCoord.xy * 1.37 + 3.1) - 0.5) / 255.0;
  col = mix(col, uFadeColor, uFade);
  gl_FragColor = vec4(col, 1.0);
}
`;

export const POST_DEFAULTS = {
  exposure: 1.0,
  bloom: 0.07,
  bloomTint: '#ffffff',
  haze: 0.0,
  edgeBlur: 0.25,
  ca: 0.0035,
  grain: 0.035,
  vignette: 0.35,
  vigColor: '#140a18',
  sat: 1.0,
  contrast: 1.0,
  split: 0.0,
  tintShadow: '#2a1a40',
  tintHigh: '#ffd6e6',
  lift: '#000000',
  gain: '#ffffff',
  leak: 0.0,
  leakColor: '#ff9ec8',
};

export class Post {
  constructor(renderer) {
    this.renderer = renderer;
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
    this.quad = new THREE.Mesh(g);
    this.quad.frustumCulled = false;
    this.scene = new THREE.Scene();
    this.scene.add(this.quad);
    this.levels = 6;
    this.samples = 0;
    // sem render target de ponto flutuante, cai para 8 bits (sem HDR, mas funciona)
    const ext = renderer.extensions;
    this.hdr = ext.has('EXT_color_buffer_float') || ext.has('EXT_color_buffer_half_float');
    this.rtType = this.hdr ? THREE.HalfFloatType : THREE.UnsignedByteType;
    this.mips = [];
    this.sceneRT = null;
    this.w = 0;
    this.h = 0;
    const common = { vertexShader: VERT, depthTest: false, depthWrite: false };
    this.downMat = new THREE.ShaderMaterial({
      ...common,
      fragmentShader: DOWN,
      uniforms: { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uKaris: { value: 0 } },
    });
    this.upMat = new THREE.ShaderMaterial({
      ...common,
      fragmentShader: UP,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
      uniforms: { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } },
    });
    const u = {
      tScene: { value: null },
      tBloom: { value: null },
      uRes: { value: new THREE.Vector2(1, 1) },
      uTime: { value: 0 },
      uBloomNorm: { value: 1 / 6 },
      uFade: { value: 0 },
      uFadeColor: { value: new THREE.Color(1, 1, 1) },
      uVHS: { value: 0 },
      uWobble: { value: 0 },
    };
    this.compMat = new THREE.ShaderMaterial({ ...common, fragmentShader: COMP, uniforms: u });
    this.cur = {};
    this.target = {};
    // multiplicadores de configuração do jogador
    this.user = { grain: 1, ca: 1, vhs: 0 };
    this.set(POST_DEFAULTS, true);
    this._sync();
  }

  // Define parâmetros da composição. Com instant=false o valor desliza (transições suaves).
  set(p, instant = false) {
    for (const k in p) {
      const v = p[k];
      const isColor = typeof v === 'string';
      const val = isColor ? new THREE.Color(v) : v;
      this.target[k] = val;
      if (instant || this.cur[k] === undefined) this.cur[k] = isColor ? val.clone() : val;
    }
  }

  update(dt) {
    const k = 1 - Math.exp(-dt * 1.6);
    for (const key in this.target) {
      const t = this.target[key];
      if (t && t.isColor) this.cur[key].lerp(t, k);
      else this.cur[key] += (t - this.cur[key]) * k;
    }
  }

  setSize(w, h, samples = this.samples) {
    w = Math.max(2, Math.floor(w));
    h = Math.max(2, Math.floor(h));
    if (w === this.w && h === this.h && samples === this.samples && this.sceneRT) return;
    this.w = w;
    this.h = h;
    this.samples = samples;
    if (this.sceneRT) this.sceneRT.dispose();
    for (const m of this.mips) m.dispose();
    this.sceneRT = new THREE.WebGLRenderTarget(w, h, {
      type: this.rtType,
      samples: this.hdr ? samples : 0,
      depthBuffer: true,
      stencilBuffer: false,
    });
    this.sceneRT.texture.generateMipmaps = false;
    this.mips = [];
    let mw = w, mh = h;
    for (let i = 0; i < this.levels; i++) {
      mw = Math.max(1, Math.floor(mw / 2));
      mh = Math.max(1, Math.floor(mh / 2));
      const rt = new THREE.WebGLRenderTarget(mw, mh, { type: this.rtType, depthBuffer: false });
      rt.texture.generateMipmaps = false;
      this.mips.push(rt);
    }
    this.compMat.uniforms.uRes.value.set(w, h);
  }

  _sync() {
    const u = this.compMat.uniforms;
    const c = this.cur;
    const setU = (name, v) => {
      if (!u[name]) u[name] = { value: v && v.isColor ? v.clone() : v };
      else if (v && v.isColor) u[name].value.copy(v);
      else u[name].value = v;
    };
    setU('uExposure', c.exposure);
    setU('uBloom', c.bloom);
    setU('uBloomTint', c.bloomTint);
    setU('uHaze', c.haze);
    setU('uEdgeBlur', c.edgeBlur);
    setU('uCA', c.ca * (this.user ? this.user.ca : 1));
    setU('uGrain', c.grain * (this.user ? this.user.grain : 1));
    setU('uVignette', c.vignette);
    setU('uVigColor', c.vigColor);
    setU('uSat', c.sat);
    setU('uContrast', c.contrast);
    setU('uSplit', c.split);
    setU('uTintShadow', c.tintShadow);
    setU('uTintHigh', c.tintHigh);
    setU('uLift', c.lift);
    setU('uGain', c.gain);
    setU('uLeak', c.leak);
    setU('uLeakColor', c.leakColor);
  }

  render(scene, camera, time) {
    const r = this.renderer;
    r.setRenderTarget(this.sceneRT);
    r.render(scene, camera);

    const q = this.quad;
    q.material = this.downMat;
    let src = this.sceneRT.texture, sw = this.w, sh = this.h;
    for (let i = 0; i < this.levels; i++) {
      const u = this.downMat.uniforms;
      u.tSrc.value = src;
      u.uTexel.value.set(1 / sw, 1 / sh);
      u.uKaris.value = i === 0 ? 1 : 0;
      r.setRenderTarget(this.mips[i]);
      r.render(this.scene, this.camera);
      src = this.mips[i].texture;
      sw = this.mips[i].width;
      sh = this.mips[i].height;
    }
    q.material = this.upMat;
    const ac = r.autoClear;
    r.autoClear = false;
    for (let i = this.levels - 1; i > 0; i--) {
      const u = this.upMat.uniforms;
      u.tSrc.value = this.mips[i].texture;
      u.uTexel.value.set(1 / this.mips[i].width, 1 / this.mips[i].height);
      r.setRenderTarget(this.mips[i - 1]);
      r.render(this.scene, this.camera);
    }
    r.autoClear = ac;

    this._sync();
    const u = this.compMat.uniforms;
    u.uVHS.value = this.user.vhs;
    u.uTime.value = time;
    u.uBloomNorm.value = 1 / this.levels;
    u.tScene.value = this.sceneRT.texture;
    u.tBloom.value = this.mips[0].texture;
    q.material = this.compMat;
    r.setRenderTarget(null);
    r.render(this.scene, this.camera);
  }
}
