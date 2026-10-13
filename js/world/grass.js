// Grama e plantações instanciadas ao redor da câmera (lâminas fixas no mundo,
// que se curvam ao vento). Some nas ruas, na floresta densa e no solo arrancado.
import * as THREE from 'three';
import { RNG } from '../util/math.js';
import { ROAD_GLSL } from './terrain.js';

export class Grass {
  constructor(scene, terrain, townMap, townHalf, count) {
    this.count = count;
    if (!count) return;
    const rng = new RNG(12);
    const tile = Math.sqrt(count / 10); // ~10 lâminas/m²
    this.tile = tile;
    // Lâmina: 3 segmentos (7 vértices)
    const base = new THREE.BufferGeometry();
    const P = [-0.5, 0, 0.5, 0, -0.42, 0.33, 0.42, 0.33, -0.3, 0.66, 0.3, 0.66, 0, 1];
    const pos = [];
    for (let i = 0; i < 7; i++) pos.push(P[i * 2], P[i * 2 + 1], 0);
    base.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    base.setIndex([0, 1, 2, 1, 3, 2, 2, 3, 4, 3, 5, 4, 4, 5, 6]);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index;
    geo.attributes.position = base.attributes.position;
    const off = new Float32Array(count * 2);
    const rnd = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      off[i * 2] = rng.float(0, tile);
      off[i * 2 + 1] = rng.float(0, tile);
      rnd[i * 4] = rng.next();
      rnd[i * 4 + 1] = rng.next();
      rnd[i * 4 + 2] = rng.next();
      rnd[i * 4 + 3] = rng.next();
    }
    geo.setAttribute('aOff', new THREE.InstancedBufferAttribute(off, 2));
    geo.setAttribute('aRnd', new THREE.InstancedBufferAttribute(rnd, 4));
    geo.instanceCount = count;

    // Mapa de alturas como textura (amostragem bilinear manual)
    const n1 = terrain.N + 1;
    const hTex = new THREE.DataTexture(terrain.heights, n1, n1, THREE.RedFormat, THREE.FloatType);
    hTex.minFilter = hTex.magFilter = THREE.NearestFilter;
    hTex.needsUpdate = true;

    this.uniforms = {
      tHeight: { value: hTex },
      tTown: { value: townMap },
      tWorld: { value: terrain.worldMap },
      tScour: { value: terrain.scourMap },
      uN: { value: terrain.N },
      uHalf: { value: terrain.half },
      uTownHalf: { value: townHalf },
      uTile: { value: tile },
      uTime: { value: 0 },
      uWind: { value: new THREE.Vector3(1, 0, 0.2) },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunColor: { value: new THREE.Color(1, 1, 1) },
      uSky: { value: new THREE.Color(0.3, 0.35, 0.4) },
      uGround: { value: new THREE.Color(0.1, 0.1, 0.08) },
      uFlash: { value: 0 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      side: THREE.DoubleSide,
      vertexShader: /* glsl */ `
        attribute vec2 aOff;
        attribute vec4 aRnd;
        uniform sampler2D tHeight;
        uniform sampler2D tTown;
        uniform sampler2D tWorld;
        uniform sampler2D tScour;
        uniform float uN, uHalf, uTownHalf, uTile, uTime;
        uniform vec3 uWind;
        varying vec3 vCol;
        varying float vH;
        varying vec3 vNor;
        varying vec3 vWP;
        ${ROAD_GLSL}
        float hAt(vec2 p) {
          vec2 g = clamp((p + uHalf) / (2.0 * uHalf) * uN, vec2(0.0), vec2(uN - 0.001));
          vec2 i = floor(g);
          vec2 f = g - i;
          float a = texelFetch(tHeight, ivec2(i), 0).r;
          float b = texelFetch(tHeight, ivec2(i) + ivec2(1, 0), 0).r;
          float c = texelFetch(tHeight, ivec2(i) + ivec2(0, 1), 0).r;
          float d = texelFetch(tHeight, ivec2(i) + ivec2(1, 1), 0).r;
          if (f.x + f.y < 1.0) return a + (b - a) * f.x + (c - a) * f.y;
          return d + (c - d) * (1.0 - f.x) + (b - d) * (1.0 - f.y);
        }
        void main() {
          vec2 cam = cameraPosition.xz;
          vec2 p = cam + mod(aOff - cam, uTile) - uTile * 0.5;
          float dist = length(p - cam);
          float fade = smoothstep(uTile * 0.5, uTile * 0.32, dist);
          vec4 wm = texture2D(tWorld, (p + uHalf) / (2.0 * uHalf));
          float field = wm.g;
          float crop = wm.b;
          float height = mix(0.35, 0.8, aRnd.x);
          float width = mix(0.04, 0.08, aRnd.y);
          vec3 baseC = vec3(0.07, 0.12, 0.03);
          vec3 tipC = mix(vec3(0.22, 0.36, 0.09), vec3(0.4, 0.42, 0.17), aRnd.z * aRnd.z * aRnd.z);
          float dens = 1.0;
          dens *= 1.0 - smoothstep(0.2, 0.6, wm.r) * 0.85;
          if (field > 0.5) {
            if (crop < 0.2) dens = 0.0;
            else if (crop < 0.45) { height = mix(0.35, 0.6, aRnd.x); tipC = vec3(0.22, 0.42, 0.1); }
            else if (crop < 0.72) { height = mix(0.8, 1.15, aRnd.x); width *= 0.8; baseC = vec3(0.3, 0.22, 0.08); tipC = vec3(0.82, 0.65, 0.3); }
            else { height = mix(1.6, 2.3, aRnd.x); width *= 2.2; baseC = vec3(0.08, 0.14, 0.04); tipC = vec3(0.25, 0.45, 0.12); }
          }
          vec2 tuv = (p + uTownHalf) / (2.0 * uTownHalf);
          if (tuv.x > 0.0 && tuv.x < 1.0 && tuv.y > 0.0 && tuv.y < 1.0) {
            vec3 tm = texture2D(tTown, tuv).rgb;
            dens *= 1.0 - smoothstep(0.1, 0.4, max(tm.r, tm.g));
            if (abs(p.x) < 400.0 && abs(p.y) < 260.0) height *= 0.55; // gramados aparados
          } else {
            float dr = min(abs(p.y - roadZ(p.x)), abs(p.x - roadX(p.y)));
            dens *= smoothstep(5.0, 7.0, dr);
          }
          float sc = texture2D(tScour, (p + uHalf) / (2.0 * uHalf)).r;
          dens *= 1.0 - smoothstep(0.1, 0.5, sc);
          float y0 = hAt(p);
          if (y0 > 480.0) dens = 0.0;
          if (aRnd.w > dens) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
          height *= fade;
          float yaw = aRnd.z * 6.2831;
          vec2 dir = vec2(cos(yaw), sin(yaw));
          float t = position.y;
          // vento
          float wstr = uWind.z;
          float gust = sin(uTime * 2.1 + p.x * 0.35 + p.y * 0.21) * 0.5 + 0.5;
          float bend = (0.15 + wstr * (0.5 + 0.7 * gust)) * t * t;
          vec2 wdir = normalize(uWind.xy + 1e-4);
          vec2 xz = p + vec2(-dir.y, dir.x) * position.x * width + wdir * bend * height * 0.9;
          float y = y0 + t * height * (1.0 - 0.35 * bend);
          vWP = vec3(xz.x, y, xz.y);
          vH = t;
          vCol = mix(baseC, tipC, t) * mix(0.75, 1.2, aRnd.y);
          vNor = normalize(vec3(dir.x * 0.6, 1.0, dir.y * 0.6));
          gl_Position = projectionMatrix * viewMatrix * vec4(vWP, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uSunDir;
        uniform vec3 uSunColor;
        uniform vec3 uSky;
        uniform vec3 uGround;
        uniform float uFlash;
        varying vec3 vCol;
        varying float vH;
        varying vec3 vNor;
        varying vec3 vWP;
        void main() {
          vec3 n = normalize(vNor);
          if (!gl_FrontFacing) n = -n;
          float ndl = max(dot(n, uSunDir), 0.0) * 0.6 + max(uSunDir.y, 0.0) * 0.4;
          vec3 V = normalize(cameraPosition - vWP);
          float trans = pow(max(dot(-V, uSunDir), 0.0), 4.0) * 0.6 * vH;
          vec3 amb = mix(uGround, uSky, 0.5 + 0.5 * vH) * (0.45 + 0.55 * vH);
          vec3 c = vCol * (uSunColor * (ndl + trans) / 3.14159 + amb / 3.14159 * 1.0 + uFlash * vec3(0.7, 0.75, 1.0));
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  update(time, wind, sunDir, sunColor, sky, ground, flash) {
    if (!this.count) return;
    const u = this.uniforms;
    u.uTime.value = time;
    u.uWind.value.copy(wind);
    u.uSunDir.value.copy(sunDir);
    u.uSunColor.value.copy(sunColor);
    u.uSky.value.copy(sky);
    u.uGround.value.copy(ground);
    u.uFlash.value = flash;
  }
}
