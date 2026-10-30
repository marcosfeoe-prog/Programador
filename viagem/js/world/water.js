// Mar e lagos: reflexo do céu (Fresnel), brilho do sol, cor pela profundidade
// (turquesa no raso) e espuma na beira, lida de um mapa de alturas do mundo.
import * as THREE from 'three';
import { WORLD, LAKES } from './data.js';
import { SKY_GLSL } from './sky.js';
import { RNG } from '../util.js';

function normalNoiseTex() {
  const S = 256;
  const rng = new RNG(9);
  // soma de ondas senoidais periódicas -> altura -> normal
  const waves = [];
  for (let i = 0; i < 24; i++) {
    const kx = rng.int(-6, 6);
    const ky = rng.int(-6, 6);
    if (!kx && !ky) continue;
    waves.push([kx, ky, rng.float(0, Math.PI * 2), 1 / Math.hypot(kx, ky)]);
  }
  const h = new Float32Array(S * S);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      let s = 0;
      for (const w of waves) s += Math.sin(((w[0] * x + w[1] * y) / S) * Math.PI * 2 + w[2]) * w[3];
      h[y * S + x] = s;
    }
  const d = new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const dx = h[y * S + ((x + 1) % S)] - h[y * S + ((x + S - 1) % S)];
      const dy = h[((y + 1) % S) * S + x] - h[((y + S - 1) % S) * S + x];
      const nx = -dx * 0.9;
      const ny = -dy * 0.9;
      const l = Math.hypot(nx, ny, 1);
      const o = (y * S + x) * 4;
      d[o] = (nx / l) * 127 + 128;
      d[o + 1] = (ny / l) * 127 + 128;
      d[o + 2] = (1 / l) * 127 + 128;
      d[o + 3] = 255;
    }
  const t = new THREE.DataTexture(d, S, S, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}

const VS = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vWP;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWP = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
  #include <logdepthbuf_vertex>
}`;

const FS = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
${SKY_GLSL}
uniform sampler2D tNormal;
uniform sampler2D tHeight;
uniform vec4 uHRect;
uniform float uLevel;
uniform vec3 uShallow;
uniform vec3 uDeep;
uniform vec3 uLightCol;
uniform float uAmbient;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform float uRough;
varying vec3 vWP;
void main() {
  #include <logdepthbuf_fragment>
  vec2 huv = (vWP.xz - uHRect.xy) / uHRect.zw;
  float ht = texture2D(tHeight, huv).r;
  float depth = uLevel - ht;
  vec2 p = vWP.xz;
  float t = uTime;
  vec3 n1 = texture2D(tNormal, p / 23.0 + vec2(t * 0.012, t * 0.007)).xyz * 2.0 - 1.0;
  vec3 n2 = texture2D(tNormal, p / 7.3 + vec2(-t * 0.02, t * 0.017)).xyz * 2.0 - 1.0;
  vec3 n3 = texture2D(tNormal, p / 130.0 + vec2(t * 0.004, -t * 0.003)).xyz * 2.0 - 1.0;
  vec3 nn = normalize(vec3(n1.xy * 0.6 + n2.xy * 0.35 + n3.xy * 0.8, 1.0));
  float dist = length(cameraPosition - vWP);
  // ondas mais suaves ao longe (evita serrilhado)
  nn = normalize(mix(nn, vec3(0.0, 0.0, 1.0), clamp(dist / 2500.0, 0.0, 0.85)));
  vec3 N = normalize(vec3(nn.x * uRough, 1.0, nn.y * uRough));
  vec3 V = normalize(cameraPosition - vWP);
  float NdV = max(dot(N, V), 0.0);
  float fres = 0.02 + 0.98 * pow(1.0 - NdV, 5.0);
  vec3 R = reflect(-V, N);
  R.y = abs(R.y) + 0.02;
  vec3 refl = skyColor(normalize(R), true);
  float sp = pow(max(dot(normalize(R), uSunDir), 0.0), 380.0);
  vec3 spec = uSunCol * sp * 14.0 * uSunVis;
  float dk = 1.0 - exp(-max(depth, 0.0) * 0.18);
  vec3 body = mix(uShallow, uDeep, dk);
  float sunL = max(uSunDir.y, 0.0);
  body *= uLightCol * (0.25 + sunL * 0.75) + uAmbient * (uZenith * 0.6 + uHorizon * 0.4);
  vec3 col = mix(body, refl, fres);
  col += spec;
  // espuma na arrebentação
  float fn = texture2D(tNormal, p / 3.0 + vec2(t * 0.05, 0.0)).x;
  float wave = 0.5 + 0.5 * sin(t * 1.3 - depth * 4.0 + fn * 3.0);
  float foam = smoothstep(1.4, 0.0, depth + (fn - 0.5) * 0.8) * (0.45 + 0.55 * wave);
  col = mix(col, vec3(0.92) * (uLightCol * 0.6 + uAmbient * 0.6), clamp(foam, 0.0, 1.0) * 0.85);
  float alpha = smoothstep(-0.05, 0.9, depth) * 0.85 + 0.15 * fres;
  alpha = max(alpha, foam * 0.9);
  float ff = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist);
  col = mix(col, uFogColor, ff);
  gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class Water {
  constructor(scene, sky) {
    this.scene = scene;
    this.sky = sky;
    this.normal = normalNoiseTex();
    this.mats = [];
    this.heightTex = null;
    this.meshes = [];
  }

  // heights: Float32Array (nx+1)*(nz+1) da malha distante
  build(heights, x0, z0, nx, nz, res) {
    const N = (nx + 1) * (nz + 1);
    const half = new Uint16Array(N);
    for (let i = 0; i < N; i++) half[i] = THREE.DataUtils.toHalfFloat(heights[i]);
    const tex = new THREE.DataTexture(half, nx + 1, nz + 1, THREE.RedFormat, THREE.HalfFloatType);
    tex.magFilter = tex.minFilter = THREE.LinearFilter;
    tex.unpackAlignment = 1;
    tex.needsUpdate = true;
    this.heightTex = tex;
    // texel centers: o vértice i fica em x0 + i*res
    const rect = new THREE.Vector4(x0 - res / 2, z0 - res / 2, (nx + 1) * res, (nz + 1) * res);
    const make = (level, shallow, deep, rough) => {
      const u = {
        ...this.sky.uniforms,
        tNormal: { value: this.normal },
        tHeight: { value: tex },
        uHRect: { value: rect },
        uLevel: { value: level },
        uShallow: { value: new THREE.Color(...shallow) },
        uDeep: { value: new THREE.Color(...deep) },
        uLightCol: { value: new THREE.Color(1, 1, 1) },
        uAmbient: { value: 0.5 },
        uFogColor: { value: new THREE.Color() },
        uFogDensity: { value: 0.0001 },
        uRough: { value: rough },
      };
      const m = new THREE.ShaderMaterial({
        uniforms: u,
        vertexShader: VS,
        fragmentShader: FS,
        transparent: true,
        depthWrite: true,
      });
      this.mats.push(m);
      return m;
    };
    const sea = make(0, [0.1, 0.55, 0.55], [0.01, 0.09, 0.16], 0.55);
    const W = 64000;
    const g = new THREE.PlaneGeometry(W, W, 8, 8);
    g.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(g, sea);
    m.position.y = WORLD.seaLevel;
    m.renderOrder = 2;
    this.scene.add(m);
    this.meshes.push(m);
    for (const l of LAKES) {
      const lm = make(l.level, [0.12, 0.42, 0.38], [0.02, 0.1, 0.12], 0.32);
      const lg = new THREE.CircleGeometry(l.r * 1.15, 64);
      lg.rotateX(-Math.PI / 2);
      const mesh = new THREE.Mesh(lg, lm);
      mesh.position.set(l.x, l.level, l.z);
      mesh.renderOrder = 2;
      this.scene.add(mesh);
      this.meshes.push(mesh);
    }
  }

  update(sky, fog) {
    for (const m of this.mats) {
      m.uniforms.uLightCol.value.copy(sky.sun.color).multiplyScalar(sky.sun.intensity / 3);
      m.uniforms.uAmbient.value = 0.25 + 0.5 * (1 - sky.light.night);
      m.uniforms.uFogColor.value.copy(fog.color);
      m.uniforms.uFogDensity.value = fog.density;
    }
  }

  // a cor do mar muda conforme a região (mais turquesa nos trópicos)
  setTint(shallow) {
    if (this.mats[0]) this.mats[0].uniforms.uShallow.value.lerp(shallow, 0.02);
  }
}
