// Grama e flores na GPU: lâminas instanciadas numa grade que acompanha a câmera.
// A altura vem da textura do relevo e a densidade da máscara de campos, então nada
// precisa ser recalculado na CPU quando o jogador anda.
import * as THREE from 'three';
import { HALF, RES } from './heightfield.js';
import { HEIGHT_GLSL } from './water.js';

export function makeMaskTexture(hf) {
  const data = new Uint8Array(RES * RES * 2);
  for (let i = 0; i < RES * RES; i++) {
    data[i * 2] = hf.grass[i];
    data[i * 2 + 1] = hf.forest[i];
  }
  const t = new THREE.DataTexture(data, RES, RES, THREE.RGFormat, THREE.UnsignedByteType);
  t.minFilter = THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

function bladeGeometry() {
  // lâmina com 3 segmentos (7 vértices), base em y=0 e ponta em y=1
  const pos = [];
  const uv = [];
  const segs = 3;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const w = 0.5 * (1 - t * 0.85);
    if (i < segs) {
      pos.push(-w, t, 0, w, t, 0);
      uv.push(0, t, 1, t);
    } else {
      pos.push(0, 1, 0);
      uv.push(0.5, 1);
    }
  }
  const idx = [];
  for (let i = 0; i < segs - 1; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const a = (segs - 1) * 2;
  idx.push(a, a + 1, a + 2);
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

export class Grass {
  constructor(scene, hf, heightTex, maskTex, sky, quality) {
    const cfg = { low: [26, 0.55], medium: [36, 0.42], high: [48, 0.33], ultra: [62, 0.28] }[quality] || [48, 0.33];
    const radius = cfg[0];
    const spacing = cfg[1];
    const side = Math.ceil((radius * 2) / spacing);
    const count = side * side;
    const geo = bladeGeometry();
    // posições locais numa grade; o deslocamento por célula vem de hash no shader
    const offs = new Float32Array(count * 2);
    let k = 0;
    for (let j = 0; j < side; j++)
      for (let i = 0; i < side; i++) {
        offs[k++] = (i - side / 2) * spacing;
        offs[k++] = (j - side / 2) * spacing;
      }
    geo.setAttribute('aOff', new THREE.InstancedBufferAttribute(offs, 2));
    geo.instanceCount = count;
    this.uniforms = {
      tHeight: { value: heightTex },
      tMask: { value: maskTex },
      uCam: { value: new THREE.Vector3() },
      uTime: { value: 0 },
      uRadius: { value: radius },
      uSpacing: { value: spacing },
      uSide: { value: side * spacing },
      uWind: { value: 1 },
      uPlayer: { value: new THREE.Vector3(0, -1000, 0) },
    };
    const mat = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.uniforms);
      sh.vertexShader = sh.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
attribute vec2 aOff;
uniform sampler2D tMask;
uniform vec3 uCam, uPlayer;
uniform float uTime, uRadius, uSpacing, uSide, uWind;
varying vec3 vGCol;
varying float vGT;
${HEIGHT_GLSL}
float gh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }`,
        )
        .replace(
          '#include <beginnormal_vertex>',
          `vec3 objectNormal = vec3(0.0, 1.0, 0.0);`,
        )
        .replace(
          '#include <begin_vertex>',
          `
// a grade "rola" com a câmera: cada lâmina tem um lugar fixo no mundo
vec2 cell = floor((uCam.xz - aOff) / uSide + 0.5);
vec2 wp = aOff + cell * uSide;
vec2 id = floor(wp / uSpacing + 0.5);
float r1 = gh(id), r2 = gh(id + 17.3), r3 = gh(id + 41.1), r4 = gh(id + 7.7);
wp += (vec2(r1, r2) - 0.5) * uSpacing * 1.1;
vec2 muv = (wp + ${HALF.toFixed(1)}) / ${(2 * HALF).toFixed(1)};
vec2 mask = texture2D(tMask, muv).rg;
float dens = mask.r;
float d = length(wp - uCam.xz);
float fadeR = 1.0 - smoothstep(uRadius * 0.6, uRadius, d);
float keep = step(r3, dens * 1.05) * fadeR;
float h = (0.22 + r4 * 0.38) * (0.55 + dens * 0.6) * keep;
float flower = step(0.965, r2) * step(0.45, dens) * (1.0 - mask.g);
h *= 1.0 - flower * 0.35;
float y0 = terrainH(wp);
float ang = r1 * 6.2831;
vec2 dir = vec2(cos(ang), sin(ang));
vec3 transformed = vec3(0.0);
float t = position.y;
float w = position.x * (0.05 + r2 * 0.04) * (1.0 + flower * 1.6);
// vento e curvatura
float gust = sin(uTime * 1.6 + wp.x * 0.08 + wp.y * 0.05) * 0.5 + sin(uTime * 3.7 + wp.x * 0.3) * 0.18;
vec2 bend = vec2(0.6, 0.3) * (gust * uWind) + dir * (r3 - 0.5) * 0.6;
// lâminas se afastam do jogador
vec2 away = wp - uPlayer.xz; float pd = length(away);
bend += (pd < 1.2 ? normalize(away + 1e-4) * (1.2 - pd) * 1.6 : vec2(0.0));
transformed.xz = wp + vec2(-dir.y, dir.x) * w + bend * t * t * h * 0.6;
transformed.y = y0 + t * h * (1.0 - 0.15 * dot(bend, bend));
vGT = t;
vec3 base = mix(vec3(0.04, 0.095, 0.016), vec3(0.1, 0.19, 0.032), r4);
vec3 dry = vec3(0.22, 0.18, 0.05);
vGCol = mix(base, dry, smoothstep(0.6, 0.95, gh(floor(wp / 37.0))) * 0.35);
vec3 fc = r1 < 0.33 ? vec3(0.85, 0.62, 0.04) : r1 < 0.66 ? vec3(0.75, 0.1, 0.22) : vec3(0.7, 0.7, 0.8);
vGCol = mix(vGCol, fc, flower * step(0.75, t));
`,
        )
        .replace('#include <project_vertex>', 'vec4 mvPosition = viewMatrix * vec4(transformed, 1.0);\ngl_Position = projectionMatrix * mvPosition;')
        .replace('#include <worldpos_vertex>', 'vec4 worldPosition = vec4(transformed, 1.0);');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vGCol;\nvarying float vGT;')
        .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nnormal = normalize(vNormal);')
        .replace('#include <color_fragment>', 'diffuseColor.rgb = vGCol * (0.55 + 0.6 * vGT);');
    };
    mat.customProgramCacheKey = () => 'grass';
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = false;
    this.mesh.castShadow = false;
    scene.add(this.mesh);
  }

  update(dt, camPos, playerPos) {
    this.uniforms.uTime.value += dt;
    this.uniforms.uCam.value.copy(camPos);
    if (playerPos) this.uniforms.uPlayer.value.copy(playerPos);
  }
}
