// Cenário: margem do rio debaixo do viaduto, ao pôr do sol (a batalha).
// O rio corre ao longo de X (z < -8); a área plana de cascalho vai de
// z = -5 a z = 12; o barranco gramado sobe até a rua em z = 18 (y = 4.5),
// com a escada de concreto em x = -6. O viaduto passa por cima em x ≈ 12.
import * as THREE from 'three';
import { toon, flat, mesh } from '../toon.js';
import { B, ground, freeze, concreteTex, tileTex, graffitiTex, streetLamp, skyline, mountains, house } from './common.js';
import { makeTrashCan, makeCrate } from '../props.js';
import { RNG } from '../util.js';

const WATER_VERT = /* glsl */ `
varying vec3 vW;
#include <fog_pars_vertex>
void main() {
  vec4 wp = modelMatrix * vec4( position, 1.0 );
  vW = wp.xyz;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const WATER_FRAG = /* glsl */ `
uniform vec3 uNear;
uniform vec3 uFar;
uniform vec3 uSun;
uniform vec3 uSunDir;
uniform float uTime;
varying vec3 vW;
#include <fog_pars_fragment>
float h( vec2 p ) { return fract( sin( dot( p, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 ); }
void main() {
  vec3 v = normalize( vW - cameraPosition );
  float fres = pow( 1.0 - abs( v.y ), 3.0 );
  vec3 col = mix( uNear, uFar, clamp( fres * 1.2, 0.0, 1.0 ) );
  // faixas de ondulação desenhadas (estilo anime)
  float w = sin( vW.x * 0.35 + uTime * 0.6 + sin( vW.z * 0.8 + uTime * 0.4 ) * 1.5 ) * sin( vW.z * 1.7 - uTime * 0.9 );
  col += smoothstep( 0.82, 0.9, w ) * 0.12;
  // trilha de brilho do sol na água
  vec3 r = reflect( v, vec3( 0.0, 1.0, 0.0 ) );
  float s = dot( r, normalize( uSunDir ) );
  vec2 cell = floor( vec2( vW.x * 1.4, vW.z * 3.0 + uTime * 1.5 ) );
  float sp = step( 0.86, h( cell ) ) * smoothstep( 0.93, 0.995, s );
  col += uSun * ( smoothstep( 0.97, 1.0, s ) * 0.5 + sp * 1.4 );
  gl_FragColor = vec4( col, 1.0 );
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

export function buildRiver(q) {
  const g = new THREE.Group();
  const rng = new RNG(33);
  ground(g, 600, 300, toon(0x5a7a3a), 0, 145, -0.04);
  ground(g, 600, 300, toon(0x3a4a2a), 0, -240, -0.04);
  // água
  const waterU = {
    uNear: { value: new THREE.Color(0x3a3a6a) },
    uFar: { value: new THREE.Color(0xf0905a) },
    uSun: { value: new THREE.Color(0xffc070) },
    uSunDir: { value: new THREE.Vector3(0.45, 0.1, 0.89) },
    uTime: { value: 0 },
  };
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(600, 80),
    new THREE.ShaderMaterial({
      vertexShader: WATER_VERT,
      fragmentShader: WATER_FRAG,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, waterU]),
      fog: true,
    }),
  );
  water.material.uniforms.uTime = waterU.uTime;
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, -0.7, -48);
  g.add(water);
  B(g, 600, 1.2, 100, 0x2a2a3a, 0, -2, -48);
  // talude de concreto até a água
  const rev = B(g, 300, 0.2, 3.6, 0xffffff, 0, -0.45, -6.6, { map: tileTex('#a8a49c', '#8a867e', 4, 'rev'), uv: 1 / 2 });
  rev.rotation.x = -0.21;
  // cascalho e grama
  B(g, 300, 0.03, 17, 0xc8bca4, 0, -0.03, 3.5, { map: concreteTex('#c4b89e', 'grav'), uv: 1 / 3 });
  for (let i = 0; i < 26; i++) {
    const p = new THREE.Mesh(new THREE.CircleGeometry(rng.float(1, 3), 10), toon(0x7a9a4a));
    p.rotation.x = -Math.PI / 2;
    p.position.set(rng.float(-40, 40), 0.006, rng.float(-3, 11));
    p.scale.y = rng.float(0.4, 1);
    if (Math.abs(p.position.x) < 6 && p.position.z < 8 && p.position.z > -1) continue;
    g.add(p);
  }
  // barranco gramado e rua de cima
  const bank = B(g, 300, 0.3, 7.6, 0x6a9a44, 0, 2.05, 15.2);
  bank.rotation.x = -0.64;
  B(g, 300, 4.5, 8, 0x5a8a3a, 0, 0, 22.1);
  B(g, 300, 0.05, 6, 0x4a4c52, 0, 4.5, 21.5);
  for (let x = -60; x <= 60; x += 2) B(g, 0.06, 1.0, 0.06, 0xd8d8d8, x, 4.5, 18.4);
  B(g, 120, 0.06, 0.06, 0xd8d8d8, 0, 5.45, 18.4);
  B(g, 120, 0.06, 0.06, 0xd8d8d8, 0, 5.05, 18.4);
  // escada de concreto
  for (let i = 0; i < 15; i++) {
    const y = 4.5 - (i + 1) * 0.3;
    B(g, 2.2, 0.3, 0.42 + (i === 14 ? 0.2 : 0), 0xb0aca4, -6, Math.max(0, y), 18 - i * 0.42 - 0.21, { outline: 0.25, cast: true });
  }
  for (const s of [-1, 1]) {
    const rail = B(g, 0.06, 0.06, 6.6, 0xc0c4c8, -6 + s * 1.1, 2.6, 14.9);
    rail.rotation.x = -0.62;
  }
  for (let x = -40; x <= 40; x += 16) if (Math.abs(x + 6) > 3) streetLamp(g, x, 19.5, { h: 4.8, arm: 0.5, ry: Math.PI, color: 0xfff0c8, cone: false }).position.y = 4.5;
  // viaduto
  const deckTex = concreteTex('#9a968e', 'deck');
  B(g, 12, 1.2, 160, 0xffffff, 12, 7.6, -20, { map: deckTex, uv: 1 / 6, cast: true });
  B(g, 12.4, 0.8, 160, 0xb0aca4, 12, 8.8, -20);
  for (const s of [-1, 1]) B(g, 0.2, 0.9, 160, 0xd0ccc4, 12 + s * 6.1, 8.8, -20);
  const graf = graffitiTex();
  for (const z of [14, -2, -26]) {
    for (const x of [8.5, 15.5]) {
      const p = B(g, 1.8, 7.6, 1.8, 0xffffff, x, z === 14 ? 4.5 : 0, z, { map: deckTex, uv: 1 / 3, cast: true, outline: 0.4 });
      if (z === -2 && x === 8.5) {
        const gm = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.0), toon(0xffffff, { map: graf }));
        gm.rotation.y = -Math.PI / 2;
        gm.position.set(x - 0.91, 1.4, z);
        g.add(gm);
      }
    }
    B(g, 9, 1, 2.2, 0x9a968e, 12, 6.6, z);
  }
  // do outro lado do rio: margem, casas e cidade contra o pôr do sol
  B(g, 600, 3, 10, 0x4a5a3a, 0, -0.7, -92);
  for (let i = 0; i < 14; i++) house(g, -90 + i * 14, -100, 9, 8, 6 + (i % 3) * 2, { wall: 0x8a7a8a, roof: 0x3a2a3a, night: true, lit: 0.3, seed: 90 + i });
  skyline(g, { r0: 170, r1: 320, n: 120, night: true, color: 0x5a4a6a, seed: 31, hMax: 60 });
  mountains(g, { r: 480, color: 0x6a5a8a, hMax: 90 });
  // lixo e caixotes (o primeiro bandido cai neles)
  for (const [x, z] of [
    [-4.6, -1.8],
    [-4.0, -2.4],
    [-5.2, -2.6],
  ]) {
    const t = makeTrashCan(0x5a6a7a);
    t.position.set(x, 0, z);
    g.add(t);
  }
  const cr = makeCrate(0x9a7a4a);
  cr.position.set(-3.6, 0.22, -1.6);
  g.add(cr);
  // juncos na beira
  const reedM = toon(0x8a9a4a);
  for (let i = 0; i < 60; i++) {
    const r = new THREE.Mesh(new THREE.ConeGeometry(0.05, rng.float(0.6, 1.2), 4), reedM);
    r.position.set(rng.float(-40, 40), -0.5, rng.float(-8.6, -8.0));
    g.add(r);
  }
  freeze(g);
  return {
    group: g,
    water: waterU,
    env: {
      sky: 'sunset',
      hemi: { sky: 0xb08ab8, ground: 0x6a4a3a, int: 1.15 },
      sun: { color: 0xffa860, int: 2.5, dir: [0.45, 0.14, 0.89], box: 22, center: [0, 0, 4] },
      fog: { color: 0xc88a7a, near: 60, far: 420 },
      rim: 0x7a3a10,
    },
    update(t) {
      waterU.uTime.value = t;
    },
  };
}
