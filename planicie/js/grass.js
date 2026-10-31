// Grama instanciada que acompanha a câmera (posições fixas no mundo,
// janela que se desloca), curvada pela brisa e pelo vento do tornado.
import * as THREE from 'three';
import { U, COMMON_GLSL } from './atmo.js';
import { GROUND_ALBEDO_GLSL } from './ground.js';

const vert = /* glsl */ `
#define IN_VERTEX
precision highp float;
${COMMON_GLSL}
${GROUND_ALBEDO_GLSL}
uniform float uPatch;
uniform float uBladeW;
uniform float uBladeH;
attribute vec3 aSeed;
varying vec3 vCol;
varying vec3 vW;
varying float vY;

vec2 tornadoWind(vec2 p) {
  if (uTorOn < 0.01) return vec2(0.0);
  vec2 rel = p - uTor;
  float r = max(length(rel), 0.5);
  float rc = uTorRc;
  float vt = uTorVmax * uTorOn * (r < rc ? r / rc : pow(rc / r, 0.7));
  vec2 tang = vec2(-rel.y, rel.x) / r * uTorSpin;
  vec2 inflow = -rel / r * (r > rc * 0.7 ? 0.45 : 0.0);
  return (tang + inflow) * vt;
}

void main() {
  vec2 local = aSeed.xy * uPatch;
  vec2 origin = uCam.xz - uPatch * 0.5;
  vec2 world = origin + mod(local - origin, uPatch);
  float rnd = hash12(floor(world * 37.0));
  float rnd2 = hash12(world * 13.1 + 7.0);
  float dist = length(world - uCam.xz);
  float fade = 1.0 - smoothstep(uPatch * 0.3, uPatch * 0.5, dist);

  float veg, scar;
  vec3 alb = groundAlbedo(world, veg, scar);
  vec4 fi = fieldInfo(world);
  bool wheat = fi.x > 0.5 && fi.x < 1.5 && fi.w > 6.0;

  float h = uBladeH * veg * (0.55 + 0.7 * rnd) * fade * (wheat ? 1.45 : 1.0);
  float w = uBladeW * (0.7 + 0.6 * rnd2) * (wheat ? 0.8 : 1.0);

  // vento: brisa com rajadas + afluxo do tornado
  vec2 gustUv = world * 0.012 - uWind * uTime * 0.012;
  float gust = texture(uN2, gustUv).g;
  vec2 wind = uWind * (0.6 + 1.2 * gust) + tornadoWind(world);
  float speed = length(wind);
  vec2 wdir = wind / max(speed, 1e-3);
  float flutter = sin(uTime * (2.0 + speed * 0.15) + rnd * 6.283 + dot(world, vec2(0.4, 0.3))) * 0.15;
  float bend = clamp(speed / 22.0, 0.0, 1.35) + flutter * (0.3 + min(speed / 30.0, 1.0));
  // vento violento arranca a vegetação
  h *= 1.0 - smoothstep(55.0, 85.0, speed);

  float ang = rnd2 * 6.2832;
  vec2 side = vec2(cos(ang), sin(ang));
  float y = position.y;
  float taper = 1.0 - y;
  vec2 offs = side * position.x * w * taper;
  float b = bend * y * y;
  vec2 lean = wdir * b * h * 0.9 + side.yx * vec2(1.0, -1.0) * 0.08 * h * y * y * (rnd - 0.5);
  float yy = y * h * (1.0 - 0.38 * min(bend, 1.2) * y);

  vec3 pos = vec3(world.x + offs.x + lean.x, yy, world.y + offs.y + lean.y);
  vW = pos;
  vY = y;

  vec3 base = alb * (0.7 + 0.5 * rnd);
  vec3 tip = wheat ? alb * vec3(1.35, 1.3, 1.15) : mix(alb * 1.4, vec3(0.55, 0.52, 0.3), 0.25 * rnd2);
  vCol = mix(base * 0.55, tip, y);
  gl_Position = projectionMatrix * viewMatrix * vec4(pos, 1.0);
  if (h < 0.01) gl_Position = vec4(0.0, 0.0, -2.0, 1.0);
}
`;

const frag = /* glsl */ `
precision highp float;
${COMMON_GLSL}
varying vec3 vCol;
varying vec3 vW;
varying float vY;
void main() {
  vec3 light = groundLight(vW.xz, uSunDir.y * 0.8 + 0.1);
  // translucidez contra o sol baixo
  vec3 v = normalize(vW - uCam);
  float back = pow(max(dot(v, uSunDir), 0.0), 4.0) * (1.0 - stormCov(vW.xz));
  vec3 col = vCol * light + vCol * uSunCol * back * vY * 0.6;
  float dist = length(vW - uCam);
  col = applyFog(col, uCam, v, dist);
  gl_FragColor = vec4(col, 1.0);
}
`;

function bladeGeometry(segments) {
  const pos = [];
  const idx = [];
  for (let i = 0; i <= segments; i++) {
    const y = i / segments;
    if (i < segments) {
      pos.push(-0.5, y, 0, 0.5, y, 0);
    } else {
      pos.push(0, 1, 0);
    }
  }
  for (let i = 0; i < segments - 1; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const a = (segments - 1) * 2;
  idx.push(a, a + 1, a + 2);
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

function makeLayer(count, patch, bladeW, bladeH, segments, seed) {
  const g = bladeGeometry(segments);
  const seeds = new Float32Array(count * 3);
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < count; i++) {
    seeds[i * 3] = rnd();
    seeds[i * 3 + 1] = rnd();
    seeds[i * 3 + 2] = rnd();
  }
  g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 3));
  g.instanceCount = count;
  const mat = new THREE.ShaderMaterial({
    vertexShader: vert,
    fragmentShader: frag,
    uniforms: {
      ...U,
      uPatch: { value: patch },
      uBladeW: { value: bladeW },
      uBladeH: { value: bladeH },
    },
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false;
  return mesh;
}

export function createGrass(quality) {
  const group = new THREE.Group();
  const n = quality.grass;
  if (n <= 0) return group;
  group.add(makeLayer(Math.round(n * 0.6), 34, 0.07, 0.75, 4, 12345));
  group.add(makeLayer(Math.round(n * 0.4), 120, 0.16, 0.8, 3, 777));
  return group;
}
