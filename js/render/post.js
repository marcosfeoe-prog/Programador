// Pós-processamento: neblina atmosférica, composição das nuvens volumétricas,
// exposição, tone mapping ACES, gradação de cor, vinheta, granulação e FXAA.
import * as THREE from 'three';
import { FOG_GLSL } from './fog.js';

const quadVert = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const compositeFrag = /* glsl */ `
precision highp float;
uniform sampler2D tScene;
uniform sampler2D tDepth;
uniform sampler2D tVol;
uniform mat4 uInvProj;
uniform mat4 uCamWorld;
uniform vec3 uCamPos;
uniform float uExposure;
uniform float uTime;
uniform float uSaturation;
uniform float uContrast;
uniform vec3 uTint;
uniform float uVignette;
uniform float uGrain;
uniform float uDamage;
uniform float uLetterbox;
uniform float uUnderwater;
uniform vec2 uVolSize;
varying vec2 vUv;

${FOG_GLSL}

float distAt(vec2 uv) {
  float d = texture(tDepth, uv).x;
  if (d >= 0.999999) return 60000.0;
  vec4 pv = uInvProj * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
  return length(pv.xyz / pv.w);
}

// Upsampling bilateral: evita halos das nuvens em volta de objetos próximos
vec4 volUpsample(vec2 uv, float dist) {
  vec2 p = uv * uVolSize - 0.5;
  vec2 i = floor(p);
  vec2 f = p - i;
  vec4 acc = vec4(0.0);
  float ws = 0.0;
  for (int k = 0; k < 4; k++) {
    vec2 o = vec2(float(k % 2), float(k / 2));
    vec2 tc = (i + o + 0.5) / uVolSize;
    float d = distAt(tc);
    float wb = (o.x > 0.5 ? f.x : 1.0 - f.x) * (o.y > 0.5 ? f.y : 1.0 - f.y) + 1e-3;
    float rel = abs(log(max(d, 0.1)) - log(max(dist, 0.1)));
    float w = wb / (1.0 + rel * rel * 40.0);
    acc += texture(tVol, tc) * w;
    ws += w;
  }
  return acc / ws;
}

vec3 aces(vec3 x) {
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

void main() {
  vec2 ndc = vUv * 2.0 - 1.0;
  vec4 vp = uInvProj * vec4(ndc, 1.0, 1.0);
  vec3 rd = normalize((uCamWorld * vec4(normalize(vp.xyz / vp.w), 0.0)).xyz);
  float depth = texture(tDepth, vUv).x;
  float dist = 22000.0;
  if (depth < 0.999999) {
    vec4 pv = uInvProj * vec4(ndc, depth * 2.0 - 1.0, 1.0);
    dist = length(pv.xyz / pv.w);
  }
  vec3 scene = texture(tScene, vUv).rgb;
  float ft = fogTrans(uCamPos, rd, dist);
  vec3 col = scene * ft + fogColorDir(rd) * (1.0 - ft);

  vec4 vol = volUpsample(vUv, dist >= 22000.0 ? 60000.0 : dist);
  col = col * vol.a + vol.rgb;

  col *= uExposure;
  col = aces(col);
  // Gradação de cor
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(l), col, uSaturation);
  col = (col - 0.5) * uContrast + 0.5;
  col *= uTint;
  col = max(col, 0.0);
  // Vinheta
  vec2 q = vUv - 0.5;
  float vig = 1.0 - dot(q, q) * uVignette;
  col *= vig;
  // Dano (bordas vermelhas)
  float edge = smoothstep(0.15, 0.55, length(q));
  col = mix(col, vec3(0.45, 0.02, 0.0), edge * uDamage * 0.75);
  // sRGB
  col = pow(col, vec3(1.0 / 2.2));
  // Granulação de filme
  col += (hash(vUv * 1000.0 + fract(uTime) * 100.0) - 0.5) * uGrain;
  // Barras cinematográficas
  if (abs(q.y) > 0.5 - uLetterbox) col = vec3(0.0);
  gl_FragColor = vec4(col, dot(col, vec3(0.299, 0.587, 0.114)));
}
`;

const fxaaFrag = /* glsl */ `
precision highp float;
uniform sampler2D tInput;
uniform vec2 uRes;
varying vec2 vUv;
#define FXAA_REDUCE_MIN (1.0 / 128.0)
#define FXAA_REDUCE_MUL (1.0 / 8.0)
#define FXAA_SPAN_MAX 8.0
void main() {
  vec2 inv = 1.0 / uRes;
  vec2 fc = vUv * uRes;
  vec3 rgbNW = texture(tInput, (fc + vec2(-1.0, -1.0)) * inv).xyz;
  vec3 rgbNE = texture(tInput, (fc + vec2(1.0, -1.0)) * inv).xyz;
  vec3 rgbSW = texture(tInput, (fc + vec2(-1.0, 1.0)) * inv).xyz;
  vec3 rgbSE = texture(tInput, (fc + vec2(1.0, 1.0)) * inv).xyz;
  vec3 rgbM = texture(tInput, vUv).xyz;
  vec3 luma = vec3(0.299, 0.587, 0.114);
  float lNW = dot(rgbNW, luma), lNE = dot(rgbNE, luma), lSW = dot(rgbSW, luma), lSE = dot(rgbSE, luma), lM = dot(rgbM, luma);
  float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE)));
  float lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
  vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), ((lNW + lSW) - (lNE + lSE)));
  float dirReduce = max((lNW + lNE + lSW + lSE) * (0.25 * FXAA_REDUCE_MUL), FXAA_REDUCE_MIN);
  float rcpDirMin = 1.0 / (min(abs(dir.x), abs(dir.y)) + dirReduce);
  dir = min(vec2(FXAA_SPAN_MAX), max(vec2(-FXAA_SPAN_MAX), dir * rcpDirMin)) * inv;
  vec3 rgbA = 0.5 * (texture(tInput, vUv + dir * (1.0 / 3.0 - 0.5)).xyz + texture(tInput, vUv + dir * (2.0 / 3.0 - 0.5)).xyz);
  vec3 rgbB = rgbA * 0.5 + 0.25 * (texture(tInput, vUv + dir * -0.5).xyz + texture(tInput, vUv + dir * 0.5).xyz);
  float lB = dot(rgbB, luma);
  gl_FragColor = vec4((lB < lMin || lB > lMax) ? rgbA : rgbB, 1.0);
}
`;

const copyFrag = /* glsl */ `
precision highp float;
uniform sampler2D tInput;
varying vec2 vUv;
void main() { gl_FragColor = vec4(texture(tInput, vUv).rgb, 1.0); }
`;

function fsQuad(material) {
  const scene = new THREE.Scene();
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  mesh.frustumCulled = false;
  scene.add(mesh);
  return scene;
}

export class PostProcessing {
  constructor(renderer, quality) {
    this.renderer = renderer;
    this.quality = quality;
    this.orthoCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.depthTexture = new THREE.DepthTexture(4, 4);
    this.depthTexture.type = THREE.UnsignedIntType;
    this.sceneRT = new THREE.WebGLRenderTarget(4, 4, {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      depthBuffer: true,
      depthTexture: this.depthTexture,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });
    this.ldrRT = new THREE.WebGLRenderTarget(4, 4, {
      type: THREE.UnsignedByteType,
      format: THREE.RGBAFormat,
      depthBuffer: false,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });

    this.uniforms = {
      tScene: { value: this.sceneRT.texture },
      tDepth: { value: this.depthTexture },
      tVol: { value: null },
      uInvProj: { value: new THREE.Matrix4() },
      uCamWorld: { value: new THREE.Matrix4() },
      uCamPos: { value: new THREE.Vector3() },
      uExposure: { value: 1 },
      uTime: { value: 0 },
      uSaturation: { value: 1 },
      uContrast: { value: 1.05 },
      uTint: { value: new THREE.Color(1, 1, 1) },
      uVignette: { value: 0.9 },
      uGrain: { value: 0.02 },
      uDamage: { value: 0 },
      uLetterbox: { value: 0 },
      uUnderwater: { value: 0 },
      uVolSize: { value: new THREE.Vector2(1, 1) },
      uFogColor: { value: new THREE.Color() },
      uFogSunColor: { value: new THREE.Color() },
      uFogSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uFog: { value: new THREE.Vector2(0.0001, 0.001) },
    };
    this.compositeMat = new THREE.ShaderMaterial({
      vertexShader: quadVert,
      fragmentShader: compositeFrag,
      uniforms: this.uniforms,
      depthTest: false,
      depthWrite: false,
    });
    this.compositeScene = fsQuad(this.compositeMat);

    this.fxaaMat = new THREE.ShaderMaterial({
      vertexShader: quadVert,
      fragmentShader: fxaaFrag,
      uniforms: { tInput: { value: this.ldrRT.texture }, uRes: { value: new THREE.Vector2(1, 1) } },
      depthTest: false,
      depthWrite: false,
    });
    this.fxaaScene = fsQuad(this.fxaaMat);
    this.copyMat = new THREE.ShaderMaterial({
      vertexShader: quadVert,
      fragmentShader: copyFrag,
      uniforms: { tInput: { value: this.ldrRT.texture } },
      depthTest: false,
      depthWrite: false,
    });
    this.copyScene = fsQuad(this.copyMat);
  }

  setSize(w, h) {
    this.sceneRT.setSize(w, h);
    this.ldrRT.setSize(w, h);
    this.fxaaMat.uniforms.uRes.value.set(w, h);
    this.width = w;
    this.height = h;
  }

  // Liga os uniformes de neblina compartilhados com o volumétrico.
  shareFog(volUniforms) {
    for (const k of ['uFogColor', 'uFogSunColor', 'uFogSunDir', 'uFog']) volUniforms[k] = this.uniforms[k];
  }

  render(scene, camera, volumetrics, overlayScene, time) {
    const r = this.renderer;
    // 1) Cena opaca em HDR linear + profundidade
    r.setRenderTarget(this.sceneRT);
    r.clear();
    r.render(scene, camera);
    // 2) Volumétrico (meia resolução)
    volumetrics.render(r, camera, this.depthTexture, time);
    // 3) Composição
    const u = this.uniforms;
    u.tVol.value = volumetrics.output;
    u.uVolSize.value.set(volumetrics.rt.width, volumetrics.rt.height);
    u.uInvProj.value.copy(camera.projectionMatrixInverse);
    u.uCamWorld.value.copy(camera.matrixWorld);
    u.uCamPos.value.copy(camera.position);
    u.uTime.value = time;
    r.setRenderTarget(this.ldrRT);
    r.render(this.compositeScene, this.orthoCam);
    // 4) Sobreposição (chuva, detritos finos, relâmpagos)
    if (overlayScene) {
      const ac = r.autoClear;
      r.autoClear = false;
      r.render(overlayScene, camera);
      r.autoClear = ac;
    }
    // 5) Tela
    r.setRenderTarget(null);
    r.render(this.quality.fxaa ? this.fxaaScene : this.copyScene, this.orthoCam);
  }
}
