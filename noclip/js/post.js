// Pós-processamento: cena em HDR (MSAA), bloom em cadeia (dual Kawase), e uma
// composição com aberração cromática, tone mapping fílmico, gradação, vinheta,
// granulação, efeitos de dano, piscar de olhos, falhas e fade.
import * as THREE from 'three';

const VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const PREFILTER = /* glsl */ `
uniform sampler2D tIn; uniform vec2 uTexel; uniform float uThreshold;
varying vec2 vUv;
vec3 pf(vec3 c) {
  float br = max(c.r, max(c.g, c.b));
  float k = 0.6;
  float soft = clamp(br - uThreshold + k, 0.0, 2.0 * k);
  soft = soft * soft / (4.0 * k + 1e-4);
  float w = max(soft, br - uThreshold) / max(br, 1e-4);
  return min(c * w, vec3(40.0));
}
void main() {
  vec2 o = uTexel * 0.5;
  vec3 c = pf(texture2D(tIn, vUv + vec2(-o.x, -o.y)).rgb) + pf(texture2D(tIn, vUv + vec2(o.x, -o.y)).rgb)
         + pf(texture2D(tIn, vUv + vec2(-o.x, o.y)).rgb) + pf(texture2D(tIn, vUv + vec2(o.x, o.y)).rgb);
  gl_FragColor = vec4(c * 0.25, 1.0);
}
`;

const DOWN = /* glsl */ `
uniform sampler2D tIn; uniform vec2 uTexel;
varying vec2 vUv;
void main() {
  vec2 o = uTexel;
  vec3 c = texture2D(tIn, vUv).rgb * 4.0;
  c += texture2D(tIn, vUv + vec2(-o.x, -o.y)).rgb;
  c += texture2D(tIn, vUv + vec2(o.x, -o.y)).rgb;
  c += texture2D(tIn, vUv + vec2(-o.x, o.y)).rgb;
  c += texture2D(tIn, vUv + vec2(o.x, o.y)).rgb;
  gl_FragColor = vec4(c / 8.0, 1.0);
}
`;

const UP = /* glsl */ `
uniform sampler2D tIn; uniform vec2 uTexel; uniform float uWeight;
varying vec2 vUv;
void main() {
  vec2 o = uTexel;
  vec3 c = texture2D(tIn, vUv + vec2(-o.x * 2.0, 0.0)).rgb;
  c += texture2D(tIn, vUv + vec2(-o.x, o.y)).rgb * 2.0;
  c += texture2D(tIn, vUv + vec2(0.0, o.y * 2.0)).rgb;
  c += texture2D(tIn, vUv + vec2(o.x, o.y)).rgb * 2.0;
  c += texture2D(tIn, vUv + vec2(o.x * 2.0, 0.0)).rgb;
  c += texture2D(tIn, vUv + vec2(o.x, -o.y)).rgb * 2.0;
  c += texture2D(tIn, vUv + vec2(0.0, -o.y * 2.0)).rgb;
  c += texture2D(tIn, vUv + vec2(-o.x, -o.y)).rgb * 2.0;
  gl_FragColor = vec4(c / 12.0 * uWeight, 1.0);
}
`;

const COMPOSITE = /* glsl */ `
uniform sampler2D tScene; uniform sampler2D tBloom;
uniform vec2 uRes; uniform float uTime;
uniform float uBloom, uExposure, uCA, uVignette, uGrain, uHurt, uLowHp, uDesat, uFade, uBlink, uGlitch, uSat, uContrast;
uniform vec3 uTint, uLift;
varying vec2 vUv;

float h12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }

vec3 aces(vec3 x) {
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}
vec3 toSRGB(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

void main() {
  vec2 uv = vUv;
  // falha: faixas horizontais deslocadas
  if (uGlitch > 0.0) {
    float band = floor(uv.y * 48.0 + floor(uTime * 23.0) * 7.0);
    float r = h12(vec2(band, floor(uTime * 17.0)));
    if (r < uGlitch * 0.35) uv.x += (h12(vec2(band, 3.1)) - 0.5) * 0.08 * uGlitch;
  }
  vec2 d = uv - 0.5;
  float r2 = dot(d, d);
  vec2 off = d * r2 * uCA;
  vec3 col;
  col.r = texture2D(tScene, uv - off).r;
  col.g = texture2D(tScene, uv).g;
  col.b = texture2D(tScene, uv + off).b;
  vec3 bl = texture2D(tBloom, uv).rgb;
  col += bl * uBloom;
  col *= uExposure;
  col = aces(col);
  // gradação
  col = col * uTint + uLift;
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(l), col, uSat * (1.0 - uDesat));
  col = (col - 0.5) * uContrast + 0.5;
  // vinheta
  float vig = smoothstep(0.85, 0.2, length(d * vec2(1.0, 0.85)) * (1.0 + uVignette));
  col *= mix(1.0, vig, 0.85);
  // dano
  float edge = smoothstep(0.25, 0.75, length(d));
  float pulse = 0.6 + 0.4 * sin(uTime * 7.0);
  col = mix(col, col * vec3(1.0, 0.25, 0.2) + vec3(0.18, 0.0, 0.0) * edge, clamp(uHurt * edge * 1.4 + uLowHp * edge * pulse * 0.6, 0.0, 0.85));
  // granulação (mais forte no escuro)
  float g = h12(gl_FragCoord.xy + fract(uTime * 13.7) * 371.0) - 0.5;
  col += g * uGrain * (0.55 - 0.35 * clamp(l, 0.0, 1.0));
  if (uGlitch > 0.0) col += (h12(gl_FragCoord.xy * 0.5 + uTime) - 0.5) * uGlitch * 0.25;
  // pálpebras
  if (uBlink > 0.0) {
    float lid = (1.0 - uBlink) * 0.62 * (1.0 - d.x * d.x * 1.4);
    float m = smoothstep(lid, lid + 0.08 + 0.1 * (1.0 - uBlink), abs(d.y));
    col *= 1.0 - m;
  }
  col *= 1.0 - uFade;
  col = clamp(col, 0.0, 1.0);
  col = toSRGB(col);
  col += (h12(gl_FragCoord.xy + 17.0) - 0.5) / 255.0;
  gl_FragColor = vec4(col, 1.0);
}
`;

export class Post {
  constructor(renderer) {
    this.r = renderer;
    this.levels = 5;
    this.scale = 1;
    this.msaa = 4;
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
    this.quad = new THREE.Mesh(geo, null);
    this.quad.frustumCulled = false;
    this.scene = new THREE.Scene();
    this.scene.add(this.quad);
    const mk = (frag, uniforms, blending = THREE.NoBlending) =>
      new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false, blending });
    this.mPre = mk(PREFILTER, { tIn: { value: null }, uTexel: { value: new THREE.Vector2() }, uThreshold: { value: 1.0 } });
    this.mDown = mk(DOWN, { tIn: { value: null }, uTexel: { value: new THREE.Vector2() } });
    this.mUp = mk(UP, { tIn: { value: null }, uTexel: { value: new THREE.Vector2() }, uWeight: { value: 1 } }, THREE.AdditiveBlending);
    this.u = {
      tScene: { value: null },
      tBloom: { value: null },
      uRes: { value: new THREE.Vector2() },
      uTime: { value: 0 },
      uBloom: { value: 0.7 },
      uExposure: { value: 1.0 },
      uCA: { value: 0.02 },
      uVignette: { value: 0.25 },
      uGrain: { value: 0.06 },
      uHurt: { value: 0 },
      uLowHp: { value: 0 },
      uDesat: { value: 0 },
      uFade: { value: 0 },
      uBlink: { value: 0 },
      uGlitch: { value: 0 },
      uSat: { value: 1 },
      uContrast: { value: 1.05 },
      uTint: { value: new THREE.Vector3(1, 1, 1) },
      uLift: { value: new THREE.Vector3(0, 0, 0) },
    };
    this.mComp = mk(COMPOSITE, this.u);
    this.rt = null;
    this.chain = [];
  }

  configure(msaa, levels) {
    this.msaa = msaa;
    this.levels = levels;
    this._w = 0;
  }

  setSize(w, h) {
    const sw = Math.max(2, Math.round(w * this.scale)), sh = Math.max(2, Math.round(h * this.scale));
    if (this._w === sw && this._h === sh && this.rt) return;
    this._w = sw;
    this._h = sh;
    if (this.rt) this.rt.dispose();
    this.chain.forEach((c) => c.dispose());
    this.rt = new THREE.WebGLRenderTarget(sw, sh, {
      type: THREE.HalfFloatType,
      samples: this.msaa,
      depthBuffer: true,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });
    this.chain = [];
    let cw = sw >> 1, ch = sh >> 1;
    for (let i = 0; i < this.levels; i++) {
      this.chain.push(
        new THREE.WebGLRenderTarget(Math.max(1, cw), Math.max(1, ch), {
          type: THREE.HalfFloatType,
          depthBuffer: false,
          minFilter: THREE.LinearFilter,
          magFilter: THREE.LinearFilter,
        })
      );
      cw >>= 1;
      ch >>= 1;
    }
    this.u.uRes.value.set(sw, sh);
  }

  pass(mat, target) {
    this.quad.material = mat;
    this.r.setRenderTarget(target);
    this.r.render(this.scene, this.cam);
  }

  render(scene, camera, overlay, overlayCam) {
    const r = this.r;
    r.autoClear = false;
    r.setRenderTarget(this.rt);
    r.clear(true, true, true);
    r.render(scene, camera);
    if (overlay) {
      r.clearDepth();
      r.render(overlay, overlayCam);
    }
    // bloom
    const c = this.chain;
    this.mPre.uniforms.tIn.value = this.rt.texture;
    this.mPre.uniforms.uTexel.value.set(1 / this.rt.width, 1 / this.rt.height);
    this.pass(this.mPre, c[0]);
    for (let i = 1; i < c.length; i++) {
      this.mDown.uniforms.tIn.value = c[i - 1].texture;
      this.mDown.uniforms.uTexel.value.set(1 / c[i - 1].width, 1 / c[i - 1].height);
      this.pass(this.mDown, c[i]);
    }
    for (let i = c.length - 1; i > 0; i--) {
      this.mUp.uniforms.tIn.value = c[i].texture;
      this.mUp.uniforms.uTexel.value.set(0.5 / c[i].width, 0.5 / c[i].height);
      this.mUp.uniforms.uWeight.value = 1.0;
      this.pass(this.mUp, c[i - 1]);
    }
    this.u.tScene.value = this.rt.texture;
    this.u.tBloom.value = c[0].texture;
    this.pass(this.mComp, null);
    r.autoClear = true;
  }
}
