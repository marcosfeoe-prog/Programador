// Chão da planície: um plano enorme com textura procedural de talhões
// (pasto, trigo, terra arada, lavoura em fileiras, capim seco), estradas de
// terra em malha de 1 milha e a cicatriz deixada pelo tornado.
import * as THREE from 'three';
import { U, COMMON_GLSL } from './atmo.js';

export const GROUND_ALBEDO_GLSL = /* glsl */ `
uniform sampler2D uN2;
uniform sampler2D uScar;
uniform float uScarExt;

float scarAt(vec2 xz) {
  vec2 uv = xz / (uScarExt * 2.0) + 0.5;
  if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) return 0.0;
  return texture(uScar, uv).r;
}

// Cor base do terreno; também devolve a "altura de vegetação" (0..1).
vec3 groundAlbedo(vec2 xz, out float veg, out float scar) {
  vec4 fi = fieldInfo(xz);
  vec4 nA = texture(uN2, xz / 3100.0);
  vec4 nB = texture(uN2, xz / 420.0 + 0.37);
  vec4 nC = texture(uN2, xz / 61.0 + 0.71);
  vec4 nD = texture(uN2, xz / 7.3);
  vec4 nE = texture(uN2, xz / 1.4 + 0.13);
  float micro = nD.a * 0.6 + nE.r * 0.4;
  vec3 c;
  float t = fi.x;
  float rowCoord = fi.y > 0.5 ? xz.x : xz.y;
  #ifdef IN_VERTEX
  float rowAA = 1.0;
#else
  float rowAA = 1.0 - smoothstep(0.15, 0.5, fwidth(rowCoord) / 0.9);
#endif
  float rows = sin(rowCoord * 6.2832 / 0.9) * 0.5 + 0.5;
  if (t < 0.5) {
    // pasto
    vec3 g1 = vec3(0.16, 0.24, 0.07);
    vec3 g2 = vec3(0.27, 0.33, 0.11);
    vec3 dry = vec3(0.42, 0.39, 0.2);
    c = mix(g1, g2, nB.g);
    c = mix(c, dry, smoothstep(0.55, 0.85, nA.r) * 0.6);
    c *= 0.82 + 0.36 * nC.b;
    veg = 0.55 + 0.35 * nC.r;
  } else if (t < 1.5) {
    // trigo maduro
    vec3 w1 = vec3(0.44, 0.34, 0.15);
    vec3 w2 = vec3(0.54, 0.43, 0.22);
    c = mix(w1, w2, nB.b);
    c = mix(c, vec3(0.4, 0.38, 0.17), smoothstep(0.6, 0.9, nC.g) * 0.4);
    c *= 0.88 + 0.24 * nC.a;
    veg = 1.0;
  } else if (t < 2.5) {
    // terra arada
    vec3 s1 = vec3(0.2, 0.15, 0.1);
    vec3 s2 = vec3(0.31, 0.24, 0.17);
    c = mix(s1, s2, nB.r * 0.6 + micro * 0.4);
    c *= 1.0 - rowAA * (rows * 0.35);
    veg = 0.0;
  } else if (t < 3.5) {
    // lavoura jovem em fileiras (soja/milho)
    vec3 soil = vec3(0.27, 0.2, 0.14);
    vec3 crop = vec3(0.17, 0.27, 0.07);
    float cover = mix(0.55, smoothstep(0.35, 0.75, rows), rowAA);
    c = mix(soil, crop, cover) * (0.9 + 0.2 * nC.g);
    veg = 0.35 * smoothstep(0.4, 0.8, rows) * rowAA + 0.2 * (1.0 - rowAA);
  } else {
    // capim seco
    c = mix(vec3(0.36, 0.32, 0.18), vec3(0.45, 0.4, 0.24), nB.a);
    c *= 0.85 + 0.3 * nC.b;
    veg = 0.7;
  }
  // margem de mato entre talhões
  float margin = 1.0 - smoothstep(3.0, 9.0 + 6.0 * nC.r, fi.w);
  c = mix(c, vec3(0.2, 0.26, 0.09) * (0.8 + 0.4 * nC.g), margin);
  veg = mix(veg, 0.8, margin);
  // estradas de cascalho
  float rd = roadDist(xz);
  float road = 1.0 - smoothstep(3.2, 4.6 + nD.b * 1.2, rd);
  vec3 gravel = mix(vec3(0.36, 0.33, 0.28), vec3(0.47, 0.43, 0.37), micro);
  float rut = smoothstep(0.5, 0.0, abs(rd - 1.1)) * 0.18;
  gravel *= 1.0 - rut;
  c = mix(c, gravel, road);
  veg *= 1.0 - road;
  veg = max(veg, 0.0);
  c *= 0.9 + 0.2 * micro;
  // cicatriz do tornado: solo raspado e lama
  scar = scarAt(xz);
  vec3 scoured = mix(vec3(0.22, 0.17, 0.12), vec3(0.3, 0.24, 0.17), micro);
  c = mix(c, scoured, smoothstep(0.05, 0.7, scar));
  veg *= 1.0 - smoothstep(0.05, 0.6, scar);
  return c;
}
`;

const vert = /* glsl */ `
varying vec3 vW;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const frag = /* glsl */ `
precision highp float;
${COMMON_GLSL}
${GROUND_ALBEDO_GLSL}
varying vec3 vW;
void main() {
  float veg, scar;
  vec3 alb = groundAlbedo(vW.xz, veg, scar);
  // sombreamento suave de micro-relevo
  vec4 nD = texture(uN2, vW.xz / 4.1 + 0.5);
  float ao = 0.85 + 0.15 * nD.g;
  vec3 col = alb * groundLight(vW.xz, uSunDir.y) * ao;
  vec3 d = vW - uCam;
  float dist = length(d);
  col = applyFog(col, uCam, d / dist, dist);
  gl_FragColor = vec4(col, 1.0);
}
`;

export function createGround() {
  // subdividido: triângulos gigantes podem ser recortados errado em alguns drivers
  const geo = new THREE.PlaneGeometry(90000, 90000, 90, 90);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: frag, uniforms: U });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  return mesh;
}

// Textura da cicatriz (16 km × 16 km): pintada na CPU conforme o tornado passa.
export class ScarMap {
  constructor(size = 1024, extent = 8000) {
    this.size = size;
    this.extent = extent;
    this.data = new Uint8Array(size * size);
    this.tex = new THREE.DataTexture(this.data, size, size, THREE.RedFormat);
    this.tex.magFilter = THREE.LinearFilter;
    this.tex.minFilter = THREE.LinearFilter;
    this.tex.needsUpdate = true;
    this.dirty = false;
    U.uScar.value = this.tex;
    U.uScarExt.value = extent;
  }

  paint(x, z, radius, strength) {
    const s = this.size;
    const px = ((x / (this.extent * 2)) + 0.5) * s;
    const pz = ((z / (this.extent * 2)) + 0.5) * s;
    const pr = Math.max(1.2, (radius / (this.extent * 2)) * s);
    const x0 = Math.max(0, Math.floor(px - pr - 1)), x1 = Math.min(s - 1, Math.ceil(px + pr + 1));
    const z0 = Math.max(0, Math.floor(pz - pr - 1)), z1 = Math.min(s - 1, Math.ceil(pz + pr + 1));
    for (let j = z0; j <= z1; j++) {
      for (let i = x0; i <= x1; i++) {
        const d = Math.hypot(i + 0.5 - px, j + 0.5 - pz) / pr;
        if (d >= 1) continue;
        const k = j * s + i;
        const v = this.data[k] + (1 - d * d) * strength * 255;
        this.data[k] = Math.min(255, Math.max(this.data[k], v));
      }
    }
    this.dirty = true;
  }

  sample(x, z) {
    const s = this.size;
    const i = Math.floor(((x / (this.extent * 2)) + 0.5) * s);
    const j = Math.floor(((z / (this.extent * 2)) + 0.5) * s);
    if (i < 0 || j < 0 || i >= s || j >= s) return 0;
    return this.data[j * s + i] / 255;
  }

  flush() {
    if (this.dirty) {
      this.tex.needsUpdate = true;
      this.dirty = false;
    }
  }
}
