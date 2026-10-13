// Gera uma textura 3D de ruído (Perlin-Worley) diretamente na GPU.
// Usada pelo renderizador volumétrico de nuvens, supercélula e tornado.
import * as THREE from 'three';

const frag = /* glsl */ `
precision highp float;
uniform float uLayer;
uniform float uSize;
varying vec2 vUv;

vec3 hash33(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}

// Worley periódico: período = número de células.
float worley(vec3 p, float period) {
  vec3 id = floor(p);
  vec3 f = fract(p);
  float d = 1e9;
  for (int z = -1; z <= 1; z++)
  for (int y = -1; y <= 1; y++)
  for (int x = -1; x <= 1; x++) {
    vec3 o = vec3(float(x), float(y), float(z));
    vec3 c = mod(id + o, period);
    vec3 r = o + hash33(c + 17.0) - f;
    d = min(d, dot(r, r));
  }
  return sqrt(d);
}

vec3 grad(vec3 c) {
  vec3 h = hash33(c) * 2.0 - 1.0;
  return normalize(h + 1e-4);
}

float perlin(vec3 p, float period) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float n000 = dot(grad(mod(i + vec3(0,0,0), period)), f - vec3(0,0,0));
  float n100 = dot(grad(mod(i + vec3(1,0,0), period)), f - vec3(1,0,0));
  float n010 = dot(grad(mod(i + vec3(0,1,0), period)), f - vec3(0,1,0));
  float n110 = dot(grad(mod(i + vec3(1,1,0), period)), f - vec3(1,1,0));
  float n001 = dot(grad(mod(i + vec3(0,0,1), period)), f - vec3(0,0,1));
  float n101 = dot(grad(mod(i + vec3(1,0,1), period)), f - vec3(1,0,1));
  float n011 = dot(grad(mod(i + vec3(0,1,1), period)), f - vec3(0,1,1));
  float n111 = dot(grad(mod(i + vec3(1,1,1), period)), f - vec3(1,1,1));
  return mix(mix(mix(n000, n100, u.x), mix(n010, n110, u.x), u.y),
             mix(mix(n001, n101, u.x), mix(n011, n111, u.x), u.y), u.z);
}

float perlinFbm(vec3 p, float period, int oct) {
  float s = 0.0, a = 0.5, n = 0.0;
  for (int i = 0; i < 6; i++) {
    if (i >= oct) break;
    s += a * perlin(p, period);
    n += a;
    p *= 2.0; period *= 2.0; a *= 0.5;
  }
  return s / n;
}

float worleyFbm(vec3 p, float period) {
  float w1 = 1.0 - worley(p, period);
  float w2 = 1.0 - worley(p * 2.0, period * 2.0);
  float w3 = 1.0 - worley(p * 4.0, period * 4.0);
  return w1 * 0.625 + w2 * 0.25 + w3 * 0.125;
}

float remap(float x, float a, float b, float c, float d) {
  return c + (x - a) / (b - a) * (d - c);
}

void main() {
  vec3 uvw = vec3(vUv, (uLayer + 0.5) / uSize);
  // Canal R: Perlin-Worley (forma geral, "couve-flor").
  float pf = perlinFbm(uvw * 4.0, 4.0, 5) * 0.5 + 0.5;
  pf = clamp(remap(pf, -0.05, 1.05, 0.0, 1.0), 0.0, 1.0);
  float wf = worleyFbm(uvw * 4.0, 4.0);
  float pw = clamp(remap(pf, wf - 1.0, 1.0, 0.0, 1.0), 0.0, 1.0);
  pw = clamp((pw - 0.55) / 0.27, 0.0, 1.0);
  // Canais G/B/A: Worley em frequências crescentes (erosão de detalhes).
  float g = worleyFbm(uvw * 6.0, 6.0);
  float b = worleyFbm(uvw * 12.0, 12.0);
  float a = perlinFbm(uvw * 8.0, 8.0, 3) * 0.5 + 0.5;
  gl_FragColor = vec4(pw, g, b, a);
}
`;

const vert = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

export function generateNoise3D(renderer, size = 64) {
  const rt = new THREE.WebGL3DRenderTarget(size, size, size, {
    format: THREE.RGBAFormat,
    type: THREE.UnsignedByteType,
    depthBuffer: false,
  });
  const tex = rt.texture;
  tex.format = THREE.RGBAFormat;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = tex.wrapR = THREE.RepeatWrapping;
  tex.generateMipmaps = false;

  const mat = new THREE.ShaderMaterial({
    vertexShader: vert,
    fragmentShader: frag,
    uniforms: { uLayer: { value: 0 }, uSize: { value: size } },
    depthTest: false,
    depthWrite: false,
  });
  const scene = new THREE.Scene();
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  quad.frustumCulled = false;
  scene.add(quad);

  const prevTarget = renderer.getRenderTarget();
  for (let z = 0; z < size; z++) {
    mat.uniforms.uLayer.value = z;
    renderer.setRenderTarget(rt, z);
    renderer.render(scene, cam);
  }
  renderer.setRenderTarget(prevTarget);
  mat.dispose();
  quad.geometry.dispose();
  return tex;
}
