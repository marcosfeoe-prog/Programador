// Cenários dos seis mundos: céu (shader), nuvens, chão/mar/lava e objetos
// espalhados em volta da pista sem atravessá-la.
import * as THREE from 'three';
import { RNG, mergeGeometries, paintGeometry, fbm, clamp } from './util.js';
import { DS } from './track.js';
import { cloudTexture, glowTexture, groundTexture, strataTexture, windowsTexture } from './textures.js';

// ------------------------------------------------------------------ céu
const SKY_VS = `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const SKY_FS = `
uniform vec3 top; uniform vec3 horizon; uniform vec3 bottom; uniform vec3 sunColor; uniform vec3 sunDir;
uniform float sunSize; uniform float stars; uniform float aurora; uniform float nebula; uniform float time;
varying vec3 vDir;
float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float noise(vec3 x) {
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm(vec3 p) { float s = 0.0; float a = 0.5; for (int i = 0; i < 5; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; } return s; }
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = h > 0.0 ? mix(horizon, top, pow(clamp(h, 0.0, 1.0), 0.55)) : mix(horizon, bottom, pow(clamp(-h, 0.0, 1.0), 0.45));
  float sd = max(dot(d, normalize(sunDir)), 0.0);
  col += sunColor * (pow(sd, 6.0) * 0.35 + pow(sd, 64.0) * 0.6);
  col = mix(col, sunColor * 1.6, smoothstep(1.0 - sunSize, 1.0 - sunSize * 0.6, sd));
  if (stars > 0.0) {
    vec3 q = d * 380.0;
    float st = hash(floor(q));
    float tw = 0.6 + 0.4 * sin(time * 2.0 + st * 60.0);
    float m = smoothstep(0.9965, 1.0, st) * tw;
    col += vec3(m) * stars * smoothstep(-0.1, 0.25, h + 0.2);
  }
  if (nebula > 0.0) {
    float n = fbm(d * 2.4 + vec3(3.0));
    float n2 = fbm(d * 4.0 + vec3(9.0, 1.0, 4.0));
    vec3 neb = mix(vec3(0.35, 0.08, 0.55), vec3(0.05, 0.35, 0.7), n2);
    col += neb * smoothstep(0.45, 0.85, n) * nebula;
    col += vec3(0.9, 0.3, 0.6) * smoothstep(0.62, 0.9, n2 * n * 1.6) * nebula * 0.5;
  }
  if (aurora > 0.0 && h > 0.02) {
    float a = 0.0;
    for (int i = 0; i < 3; i++) {
      float fi = float(i);
      float band = sin(d.x * (3.0 + fi) + d.z * 2.0 + time * (0.12 + fi * 0.05) + fbm(d * 3.0 + vec3(time * 0.05)) * 3.0);
      float y = 0.28 + fi * 0.09 + band * 0.06;
      a += smoothstep(0.08, 0.0, abs(h - y)) * (0.55 + 0.45 * noise(d * 30.0 + vec3(0.0, time * 0.4, 0.0)));
    }
    col += mix(vec3(0.1, 1.0, 0.55), vec3(0.3, 0.6, 1.0), smoothstep(0.25, 0.5, h)) * a * aurora;
  }
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

function makeSky(o) {
  const mat = new THREE.ShaderMaterial({
    vertexShader: SKY_VS,
    fragmentShader: SKY_FS,
    uniforms: {
      top: { value: new THREE.Color(o.top) },
      horizon: { value: new THREE.Color(o.horizon) },
      bottom: { value: new THREE.Color(o.bottom ?? o.horizon) },
      sunColor: { value: new THREE.Color(o.sunColor ?? '#fff3d0') },
      sunDir: { value: o.sunDir.clone() },
      sunSize: { value: o.sunSize ?? 0.0025 },
      stars: { value: o.stars ?? 0 },
      aurora: { value: o.aurora ?? 0 },
      nebula: { value: o.nebula ?? 0 },
      time: { value: 0 },
    },
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(1500, 32, 16), mat);
  m.renderOrder = -10;
  m.frustumCulled = false;
  m.name = 'ceu';
  return m;
}

// ----------------------------------------------------- mar e lava (shader)
const FLUID_VS = `
#include <fog_pars_vertex>
varying vec3 vW;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  vec4 mvPosition = viewMatrix * w;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const FLUID_FS = `
#include <common>
#include <fog_pars_fragment>
uniform float time; uniform vec3 deep; uniform vec3 shallow; uniform vec3 foam; uniform vec3 sunDir; uniform float lava;
varying vec3 vW;
float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n2(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h2(i), h2(i + vec2(1, 0)), f.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), f.x), f.y); }
float fb(vec2 p) { float s = 0.0; float a = 0.5; for (int i = 0; i < 4; i++) { s += a * n2(p); p = p * 2.07 + vec2(1.7, 9.2); a *= 0.5; } return s; }
void main() {
  vec2 p = vW.xz * 0.02;
  float t = time;
  vec3 col;
  if (lava > 0.5) {
    float n = fb(p * 1.3 + vec2(t * 0.02, t * 0.015));
    float c = fb(p * 3.0 - vec2(t * 0.03, 0.0));
    float crust = smoothstep(0.42, 0.6, n + c * 0.25);
    vec3 hot = mix(shallow, foam, smoothstep(0.3, 0.0, abs(n - 0.45)) * 0.8);
    col = mix(hot * (1.2 + 0.3 * sin(t * 2.0 + n * 10.0)), deep, crust);
  } else {
    float n = fb(p + vec2(t * 0.03, t * 0.02));
    float n2v = fb(p * 2.5 - vec2(t * 0.04, -t * 0.03));
    col = mix(deep, shallow, smoothstep(0.35, 0.75, n * 0.7 + n2v * 0.5));
    float f = smoothstep(0.62, 0.7, n2v) * 0.5;
    col = mix(col, foam, f);
    vec3 v = normalize(cameraPosition - vW);
    vec3 nrm = normalize(vec3((n - 0.5) * 0.6, 1.0, (n2v - 0.5) * 0.6));
    float sp = pow(max(dot(reflect(-normalize(sunDir), nrm), v), 0.0), 60.0);
    col += vec3(1.0, 0.95, 0.8) * sp * 1.4;
  }
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

function makeFluid(o, y, size) {
  const mat = new THREE.ShaderMaterial({
    vertexShader: FLUID_VS,
    fragmentShader: FLUID_FS,
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        time: { value: 0 },
        deep: { value: new THREE.Color(o.deep) },
        shallow: { value: new THREE.Color(o.shallow) },
        foam: { value: new THREE.Color(o.foam) },
        sunDir: { value: o.sunDir.clone() },
        lava: { value: o.lava ? 1 : 0 },
      },
    ]),
    fog: true,
  });
  const g = new THREE.PlaneGeometry(size, size, 1, 1);
  g.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(g, mat);
  m.position.y = y;
  return m;
}

// --------------------------------------------- folga entre objetos e pista
class Clearance {
  constructor(track, cell = 12) {
    this.cell = cell;
    this.map = new Map();
    const P = track.P;
    const r = 2;
    for (let i = 0; i < track.count; i += 6) {
      const x = P[i * 3];
      const y = P[i * 3 + 1];
      const z = P[i * 3 + 2];
      const cx = Math.floor(x / cell);
      const cz = Math.floor(z / cell);
      for (let a = -r; a <= r; a++)
        for (let b = -r; b <= r; b++) {
          const k = (cx + a) * 100000 + (cz + b);
          const lim = y - 9;
          const cur = this.map.get(k);
          if (cur === undefined || lim < cur) this.map.set(k, lim);
        }
    }
  }
  // Altura máxima permitida para o topo de um objeto de raio r em (x, z).
  maxTop(x, z, rad = 0) {
    const c = this.cell;
    const r = Math.ceil(rad / c);
    const cx = Math.floor(x / c);
    const cz = Math.floor(z / c);
    let m = Infinity;
    for (let a = -r; a <= r; a++)
      for (let b = -r; b <= r; b++) {
        const v = this.map.get((cx + a) * 100000 + (cz + b));
        if (v !== undefined && v < m) m = v;
      }
    return m;
  }
  near(x, z) {
    return this.map.has(Math.floor(x / this.cell) * 100000 + Math.floor(z / this.cell));
  }
}

// ---------------------------------------------------------------- nuvens
function addClouds(group, rng, box, n, yMin, yMax, opts = {}, clr = null) {
  const mats = [1, 2, 3].map(
    (k) =>
      new THREE.SpriteMaterial({
        map: cloudTexture(k),
        color: opts.color ?? 0xffffff,
        transparent: true,
        depthWrite: false,
        opacity: opts.opacity ?? 0.95,
        fog: true,
      }),
  );
  let made = 0;
  for (let i = 0; i < n * 4 && made < n; i++) {
    const w = rng.float(60, 160) * (opts.scale ?? 1);
    const x = rng.float(box.min.x - 500, box.max.x + 500);
    const y = rng.float(yMin, yMax);
    const z = rng.float(box.min.z - 500, box.max.z + 500);
    // nuvens perto da pista só por baixo dela (não tapam a câmera)
    if (clr) {
      const lim = clr.maxTop(x, z, w * 0.6 + 40);
      if (lim !== Infinity && y + w * 0.3 > lim - 25) continue;
    }
    const s = new THREE.Sprite(mats[made % 3]);
    s.scale.set(w, w * 0.55, 1);
    s.position.set(x, y, z);
    group.add(s);
    made++;
  }
}

// ---------------------------------------------------- objetos instanciados
function instanced(geo, mat, list, shadow = false) {
  if (!list.length) return null;
  const m = new THREE.InstancedMesh(geo, mat, list.length);
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const M = new THREE.Matrix4();
  list.forEach((it, i) => {
    e.set(it.rx || 0, it.ry || 0, it.rz || 0);
    q.setFromEuler(e);
    M.compose(new THREE.Vector3(it.x, it.y, it.z), q, new THREE.Vector3(it.sx ?? it.s, it.sy ?? it.s, it.sz ?? it.s));
    m.setMatrixAt(i, M);
  });
  m.castShadow = shadow;
  m.receiveShadow = false;
  return m;
}

function vcolor() {
  return new THREE.MeshLambertMaterial({ vertexColors: true });
}

// Palmeira: tronco curvo + folhas (vértices coloridos).
function palmGeometry() {
  const parts = [];
  const segs = 6;
  for (let i = 0; i < segs; i++) {
    const g = new THREE.CylinderGeometry(0.32 - i * 0.03, 0.36 - i * 0.03, 1.4, 7);
    g.translate(i * i * 0.05, 0.7 + i * 1.35, 0);
    parts.push(paintGeometry(g.toNonIndexed(), i % 2 ? 0x8a6238 : 0x9c7244));
  }
  const top = new THREE.Vector3(segs * segs * 0.05, segs * 1.35 + 0.2, 0);
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2;
    const leaf = new THREE.BufferGeometry();
    const L = 4.2;
    const pts = [0, 0, 0, L * 0.5, 0.5, 0.9, L, -1.2, 0, L * 0.5, 0.5, -0.9];
    leaf.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    leaf.setIndex([0, 1, 2, 0, 2, 3, 0, 2, 1, 0, 3, 2]);
    leaf.rotateY(a);
    leaf.translate(top.x, top.y, top.z);
    const lg = leaf.toNonIndexed();
    lg.computeVertexNormals();
    parts.push(paintGeometry(lg, k % 2 ? 0x2fa83a : 0x3cc046));
  }
  const coco = new THREE.SphereGeometry(0.35, 6, 5);
  coco.translate(top.x + 0.3, top.y - 0.4, 0.2);
  parts.push(paintGeometry(coco.toNonIndexed(), 0x5a3a1a));
  return mergeGeometries(parts);
}

function pineGeometry(snow = false) {
  const parts = [];
  const trunk = new THREE.CylinderGeometry(0.3, 0.4, 2, 6);
  trunk.translate(0, 1, 0);
  parts.push(paintGeometry(trunk.toNonIndexed(), 0x5a3a22));
  for (let i = 0; i < 3; i++) {
    const c = new THREE.ConeGeometry(2.6 - i * 0.6, 3.2, 8);
    c.translate(0, 2.8 + i * 1.9, 0);
    parts.push(paintGeometry(c.toNonIndexed(), 0x1f5a3a));
    if (snow) {
      const s = new THREE.ConeGeometry(1.5 - i * 0.35, 1.3, 8);
      s.translate(0, 3.9 + i * 1.9, 0);
      parts.push(paintGeometry(s.toNonIndexed(), 0xf2f7ff));
    }
  }
  return mergeGeometries(parts);
}

function cactusGeometry() {
  const parts = [];
  const col = 0x3f8f3a;
  const t = new THREE.CylinderGeometry(0.55, 0.6, 6, 8);
  t.translate(0, 3, 0);
  parts.push(paintGeometry(t.toNonIndexed(), col));
  const cap = new THREE.SphereGeometry(0.55, 8, 6);
  cap.translate(0, 6, 0);
  parts.push(paintGeometry(cap.toNonIndexed(), col));
  for (const [sx, y, h] of [
    [1, 2.6, 2.2],
    [-1, 3.4, 1.6],
  ]) {
    const a = new THREE.CylinderGeometry(0.38, 0.38, 1.4, 8);
    a.rotateZ(Math.PI / 2);
    a.translate(sx * 0.9, y, 0);
    parts.push(paintGeometry(a.toNonIndexed(), col));
    const b = new THREE.CylinderGeometry(0.38, 0.38, h, 8);
    b.translate(sx * 1.55, y + h / 2, 0);
    parts.push(paintGeometry(b.toNonIndexed(), col));
    const c = new THREE.SphereGeometry(0.38, 8, 6);
    c.translate(sx * 1.55, y + h, 0);
    parts.push(paintGeometry(c.toNonIndexed(), col));
  }
  return mergeGeometries(parts);
}

// Rocha/ilha: icosaedro deformado com ruído e cores por altura.
function blobGeometry(seed, detail, colorFn, flat = 1) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const ng = g.index ? g.toNonIndexed() : g;
  const pos = ng.attributes.position;
  const v = new THREE.Vector3();
  const cache = new Map();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const key = `${v.x.toFixed(4)},${v.y.toFixed(4)},${v.z.toFixed(4)}`;
    let k = cache.get(key);
    if (k === undefined) {
      k = 1 + fbm(v.x * 1.7 + seed, v.z * 1.7 + v.y * 1.3, 3, seed) * 0.35;
      cache.set(key, k);
    }
    v.multiplyScalar(k);
    v.y *= flat;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  ng.computeVertexNormals();
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i += 3) {
    const y = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3;
    colorFn(y, c, i);
    for (let k = 0; k < 3; k++) {
      colors[(i + k) * 3] = c.r;
      colors[(i + k) * 3 + 1] = c.g;
      colors[(i + k) * 3 + 2] = c.b;
    }
  }
  ng.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return ng;
}

// Pontos aleatórios em volta da pista (mais densos perto dela).
function scatter(rng, track, clr, n, { minDist = 20, maxDist = 400, height = 10, radius = 4, groundY = 0 } = {}) {
  const out = [];
  const P = track.P;
  let tries = 0;
  while (out.length < n && tries++ < n * 12) {
    const i = Math.floor(rng.float(0, track.count / 3)) * 3;
    const a = rng.float(0, Math.PI * 2);
    const r = minDist + Math.pow(rng.next(), 1.6) * (maxDist - minDist);
    const x = P[i * 3] + Math.cos(a) * r;
    const z = P[i * 3 + 2] + Math.sin(a) * r;
    if (clr.maxTop(x, z, radius) < groundY + height) continue;
    out.push({ x, z });
  }
  return out;
}

// ------------------------------------------------------------- os mundos
export function buildWorld(world, track, quality, rng = new RNG(track.info.seed + 77)) {
  const group = new THREE.Group();
  group.name = 'cenario';
  const clr = new Clearance(track);
  const box = track.bbox.clone();
  const cx = (box.min.x + box.max.x) / 2;
  const cz = (box.min.z + box.max.z) / 2;
  const density = quality.props;
  const updaters = [];
  let env;

  const W = {};
  W.arquipelago = () => {
    const sunDir = new THREE.Vector3(0.45, 0.75, 0.35).normalize();
    env = { sunDir, sky: '#3f9bff', fog: '#cfeaff', fogNear: 250, fogFar: 1500, hemiSky: '#cfe8ff', hemiGround: '#5fb0d0', hemi: 1.6, sun: 2.4, sunColor: '#fff4e0' };
    group.add(makeSky({ top: '#2a7cff', horizon: '#cfeaff', bottom: '#9fd8ff', sunDir, sunSize: 0.004 }));
    const sea = makeFluid({ deep: '#0a6bc4', shallow: '#22c2d8', foam: '#e9fbff', sunDir }, world.ground, 8000);
    sea.position.x = cx;
    sea.position.z = cz;
    group.add(sea);
    updaters.push((t) => (sea.material.uniforms.time.value = t));
    // ilhas
    const islandMat = vcolor();
    const n = Math.round(16 * density) + 4;
    const spots = scatter(rng, track, clr, n, { minDist: 60, maxDist: 700, height: 22, radius: 70, groundY: world.ground });
    const palms = [];
    const pgeo = palmGeometry();
    spots.forEach((p, k) => {
      const R = rng.float(30, 75);
      const H = rng.float(8, 22);
      const g = blobGeometry(k * 3.1, 3, (y, c) => {
        if (y < 0.08) c.set('#f2d49a');
        else if (y < 0.2) c.set('#e7c98a').lerp(new THREE.Color('#58b947'), (y - 0.08) / 0.12);
        else c.set(y > 0.6 ? '#3a9a3a' : '#4cae40');
      });
      const m = new THREE.Mesh(g, islandMat);
      m.scale.set(R, H, R * rng.float(0.7, 1.2));
      m.position.set(p.x, world.ground - H * 0.15, p.z);
      m.rotation.y = rng.float(0, 6);
      group.add(m);
      // anel de água rasa
      const ring = new THREE.Mesh(new THREE.CircleGeometry(R * 1.45, 32), new THREE.MeshBasicMaterial({ map: glowTexture('rgba(80,230,220,0.9)', 'rgba(80,230,220,0)'), transparent: true, depthWrite: false, fog: true }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(p.x, world.ground + 0.15, p.z);
      group.add(ring);
      const np = Math.round(rng.int(3, 9) * density);
      for (let i = 0; i < np; i++) {
        const a = rng.float(0, 6.28);
        const r = rng.float(0.1, 0.65) * R;
        const x = p.x + Math.cos(a) * r;
        const z = p.z + Math.sin(a) * r;
        const top = world.ground + H * 0.85 * (1 - (r / R) ** 2);
        if (clr.maxTop(x, z, 3) < top + 12) continue;
        palms.push({ x, y: top - 0.5, z, s: rng.float(0.8, 1.3), ry: rng.float(0, 6), rz: rng.float(-0.15, 0.15) });
      }
    });
    const pm = instanced(pgeo, vcolor(), palms, true);
    if (pm) group.add(pm);
    // barquinhos
    const hull = new THREE.BoxGeometry(2.4, 1, 6);
    const sail = new THREE.BufferGeometry();
    sail.setAttribute('position', new THREE.Float32BufferAttribute([0, 1, -2, 0, 8, 0.5, 0, 1, 2], 3));
    sail.computeVertexNormals();
    const boats = [];
    for (let i = 0; i < 10 * density; i++) {
      const p = scatter(rng, track, clr, 1, { minDist: 40, maxDist: 500, height: 10, radius: 6, groundY: world.ground })[0];
      if (p) boats.push({ x: p.x, y: world.ground + 0.3, z: p.z, s: 1, ry: rng.float(0, 6) });
    }
    const hm = instanced(hull, new THREE.MeshLambertMaterial({ color: 0xffffff }), boats);
    const sm = instanced(sail, new THREE.MeshLambertMaterial({ color: 0xff5a4a, side: THREE.DoubleSide }), boats);
    if (hm) group.add(hm, sm);
    addClouds(group, rng, box, Math.round(60 * density) + 10, world.ground + 10, world.altitude + 120, {}, clr);
  };

  W.canion = () => {
    const sunDir = new THREE.Vector3(-0.7, 0.22, -0.45).normalize();
    env = { sunDir, sky: '#ff9a5a', fog: '#f0a070', fogNear: 220, fogFar: 1400, hemiSky: '#ffd0a0', hemiGround: '#a0502a', hemi: 1.5, sun: 2.6, sunColor: '#ffc890' };
    group.add(makeSky({ top: '#3a4ba8', horizon: '#ffb070', bottom: '#d07a50', sunColor: '#ffb060', sunDir, sunSize: 0.006 }));
    const gtex = groundTexture('desert');
    gtex.repeat.set(400, 400);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(8000, 8000).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: gtex }));
    ground.position.set(cx, world.ground, cz);
    ground.receiveShadow = true;
    group.add(ground);
    // mesas de pedra
    const st = strataTexture(3);
    const mesaMat = new THREE.MeshLambertMaterial({ map: st });
    const topMat = new THREE.MeshLambertMaterial({ color: 0xc8743c });
    const nm = Math.round(40 * density) + 10;
    const spots = scatter(rng, track, clr, nm, { minDist: 50, maxDist: 900, height: 20, radius: 40, groundY: world.ground });
    const sides = [];
    const tops = [];
    for (const p of spots) {
      const R = rng.float(16, 60);
      const lim = clr.maxTop(p.x, p.z, R);
      let H = rng.float(25, 110);
      if (lim < H) H = Math.max(10, lim - 4);
      if (H < 10) continue;
      const n = rng.int(7, 11);
      const pts = [];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const r = R * rng.float(0.7, 1.1);
        pts.push(new THREE.Vector2(p.x + Math.cos(a) * r, p.z + Math.sin(a) * r));
      }
      // paredes com leve recuo no topo
      const pos = [];
      const uv = [];
      for (let i = 0; i < n; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % n];
        const k = 0.9;
        const at = new THREE.Vector2(p.x + (a.x - p.x) * k, p.z + (a.y - p.z) * k);
        const bt = new THREE.Vector2(p.x + (b.x - p.x) * k, p.z + (b.y - p.z) * k);
        const y0 = world.ground;
        const y1 = world.ground + H;
        const ua = i * 0.6;
        const ub = (i + 1) * 0.6;
        pos.push(a.x, y0, a.y, bt.x, y1, bt.y, b.x, y0, b.y, a.x, y0, a.y, at.x, y1, at.y, bt.x, y1, bt.y);
        uv.push(ua, 0, ub, H / 70, ub, 0, ua, 0, ua, H / 70, ub, H / 70);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.computeVertexNormals();
      sides.push(g);
      const shape = new THREE.Shape(pts.map((q) => new THREE.Vector2(p.x + (q.x - p.x) * 0.9, -(p.z + (q.y - p.z) * 0.9))));
      const tg = new THREE.ShapeGeometry(shape);
      tg.rotateX(-Math.PI / 2);
      tg.translate(0, world.ground + H, 0);
      tops.push(tg.toNonIndexed());
    }
    if (sides.length) {
      const sm = new THREE.Mesh(mergeGeometries(sides), mesaMat);
      sm.receiveShadow = true;
      group.add(sm);
      const tg = mergeGeometries(tops.map((g) => (g.deleteAttribute('uv'), g)));
      group.add(new THREE.Mesh(tg, topMat));
    }
    const cac = scatter(rng, track, clr, Math.round(260 * density), { minDist: 15, maxDist: 450, height: 8, radius: 3, groundY: world.ground }).map((p) => ({ x: p.x, y: world.ground, z: p.z, s: rng.float(0.7, 1.5), ry: rng.float(0, 6) }));
    const cm = instanced(cactusGeometry(), vcolor(), cac, true);
    if (cm) group.add(cm);
    const rocks = scatter(rng, track, clr, Math.round(160 * density), { minDist: 10, maxDist: 500, height: 6, radius: 4, groundY: world.ground }).map((p) => ({ x: p.x, y: world.ground, z: p.z, s: rng.float(1, 5), ry: rng.float(0, 6) }));
    const rg = blobGeometry(5, 1, (y, c) => c.set(y > 0.3 ? '#c06a3a' : '#a85a30'), 0.7);
    const rm = instanced(rg, vcolor(), rocks);
    if (rm) group.add(rm);
    addClouds(group, rng, box, Math.round(20 * density) + 4, world.altitude + 60, world.altitude + 200, { color: 0xffd0b0, scale: 1.6, opacity: 0.8 }, clr);
  };

  W.metropole = () => {
    const sunDir = new THREE.Vector3(0.3, 0.12, -0.9).normalize();
    env = { sunDir, sky: '#2a1a50', fog: '#5a3a7a', fogNear: 200, fogFar: 1300, hemiSky: '#a88cff', hemiGround: '#301a40', hemi: 1.5, sun: 1.6, sunColor: '#ffb0d0' };
    group.add(makeSky({ top: '#120c38', horizon: '#ff6f8f', bottom: '#2a1a40', sunColor: '#ff8a70', sunDir, sunSize: 0.005, stars: 0.6 }));
    // chão com quarteirões
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#23222c';
    ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = '#3a3946';
    ctx.fillRect(18, 18, 220, 220);
    ctx.fillStyle = 'rgba(255,214,90,0.6)';
    for (let i = 0; i < 256; i += 32) ctx.fillRect(i, 7, 14, 3);
    for (let i = 0; i < 256; i += 32) ctx.fillRect(7, i, 3, 14);
    const gt = new THREE.CanvasTexture(c);
    gt.colorSpace = THREE.SRGBColorSpace;
    gt.wrapS = gt.wrapT = THREE.RepeatWrapping;
    gt.repeat.set(8000 / 60, 8000 / 60);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(8000, 8000).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: gt }));
    ground.position.set(0, world.ground, 0);
    ground.receiveShadow = true;
    group.add(ground);
    // prédios alinhados à grade de 60 m
    const lits = ['#ffd98a', '#9fe6ff', '#ffb0e0', '#c9b6ff'];
    const walls = ['#1d2030', '#2a2236', '#1a2a36', '#30283a'];
    const buckets = lits.map(() => []);
    const span = 900;
    const roofLights = [];
    for (let gx = Math.floor((box.min.x - span) / 60); gx <= Math.floor((box.max.x + span) / 60); gx++)
      for (let gz = Math.floor((box.min.z - span) / 60); gz <= Math.floor((box.max.z + span) / 60); gz++) {
        const x = gx * 60 + 30;
        const z = gz * 60 + 30;
        const dist = Math.hypot(x - cx, z - cz);
        if (rng.next() > density * (dist < 700 ? 0.9 : 0.5)) continue;
        const w = rng.float(16, 34);
        const d = rng.float(16, 34);
        const lim = clr.maxTop(x, z, Math.max(w, d) / 2 + 4);
        let h = rng.float(18, 60) * (dist < 900 ? 1 : 1.8) + (rng.chance(0.12) ? rng.float(40, 90) : 0);
        if (lim < h) h = lim - 4;
        if (h < 8) continue;
        const k = rng.int(0, 3);
        const g = new THREE.BoxGeometry(w, h, d);
        const uv = g.attributes.uv;
        const nrm = g.attributes.normal;
        for (let i = 0; i < uv.count; i++) {
          const top = Math.abs(nrm.getY(i)) > 0.5;
          const across = Math.abs(nrm.getX(i)) > 0.5 ? d : w;
          uv.setXY(i, top ? 0.02 : (uv.getX(i) * across) / 16, top ? 0.02 : (uv.getY(i) * h) / 32);
        }
        g.translate(x, world.ground + h / 2, z);
        buckets[k].push(g.toNonIndexed());
        if (h > 50 && rng.chance(0.5)) roofLights.push({ x, y: world.ground + h + 3, z, s: 1 });
      }
    buckets.forEach((list, k) => {
      if (!list.length) return;
      const tex = windowsTexture(k + 1, lits[k], walls[k]);
      const em = windowsTexture(k + 1, lits[k], '#000000');
      const mat = new THREE.MeshLambertMaterial({ map: tex, emissiveMap: em, emissive: 0xffffff, emissiveIntensity: 1.0 });
      group.add(new THREE.Mesh(mergeGeometries(list), mat));
    });
    // luzes de topo (piscam)
    const lamp = new THREE.MeshBasicMaterial({ color: 0xff2a2a });
    const lm = instanced(new THREE.SphereGeometry(0.9, 8, 6), lamp, roofLights);
    if (lm) {
      group.add(lm);
      updaters.push((t) => lamp.color.setRGB(0.4 + 0.6 * (Math.sin(t * 3) > 0 ? 1 : 0.2), 0.08, 0.08));
    }
    addClouds(group, rng, box, Math.round(18 * density) + 4, world.altitude + 50, world.altitude + 160, { color: 0xc090d0, scale: 1.5, opacity: 0.6 }, clr);
  };

  W.glacial = () => {
    const sunDir = new THREE.Vector3(-0.35, 0.5, 0.6).normalize();
    env = { sunDir, sky: '#0a1838', fog: '#1d3a66', fogNear: 220, fogFar: 1400, hemiSky: '#9cc8ff', hemiGround: '#38507a', hemi: 1.7, sun: 1.7, sunColor: '#cfe2ff' };
    group.add(makeSky({ top: '#040b24', horizon: '#2a5a8c', bottom: '#1a3050', sunColor: '#e8f0ff', sunDir, sunSize: 0.0035, stars: 1, aurora: 0.9 }));
    const gtex = groundTexture('snow');
    gtex.repeat.set(500, 500);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(8000, 8000).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: gtex, color: 0xdfe9ff }));
    ground.position.set(cx, world.ground, cz);
    ground.receiveShadow = true;
    group.add(ground);
    const mountMat = vcolor();
    const peaks = scatter(rng, track, clr, Math.round(30 * density) + 10, { minDist: 120, maxDist: 1200, height: 60, radius: 80, groundY: world.ground });
    peaks.forEach((p, k) => {
      const R = rng.float(60, 160);
      const H = Math.min(rng.float(80, 260), clr.maxTop(p.x, p.z, R) - 5);
      if (H < 30) return;
      const g = blobGeometry(k * 1.7, 2, (y, c) => c.set(y > 0.45 ? '#f4f8ff' : y > 0.15 ? '#a8c8e8' : '#7a9cc4'), 1);
      const pos = g.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i);
        const f = 1 - clamp((y + 1) / 2, 0, 1) * 0.92;
        pos.setX(i, pos.getX(i) * f * 1.8);
        pos.setZ(i, pos.getZ(i) * f * 1.8);
      }
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, mountMat);
      m.scale.set(R / 1.8, H / 2, R / 1.8);
      m.position.set(p.x, world.ground + H / 2 - 4, p.z);
      group.add(m);
    });
    const pines = scatter(rng, track, clr, Math.round(500 * density), { minDist: 14, maxDist: 500, height: 12, radius: 3, groundY: world.ground }).map((p) => ({ x: p.x, y: world.ground, z: p.z, s: rng.float(0.8, 1.6), ry: rng.float(0, 6) }));
    const pm = instanced(pineGeometry(true), vcolor(), pines, true);
    if (pm) group.add(pm);
    // cristais de gelo
    const crystals = scatter(rng, track, clr, Math.round(80 * density), { minDist: 10, maxDist: 300, height: 10, radius: 3, groundY: world.ground }).map((p) => ({ x: p.x, y: world.ground + 2, z: p.z, s: rng.float(1.5, 4), sy: rng.float(3, 7), rz: rng.float(-0.3, 0.3), ry: rng.float(0, 6) }));
    const cm = instanced(new THREE.OctahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ color: 0x7fe8ff, emissive: 0x1a6a9a, transparent: true, opacity: 0.85 }), crystals);
    if (cm) group.add(cm);
    // neve caindo em volta da câmera
    const n = Math.round(1500 * quality.particles);
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = rng.float(-80, 80);
      pos[i * 3 + 1] = rng.float(-40, 60);
      pos[i * 3 + 2] = rng.float(-80, 80);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const snow = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 0.35, transparent: true, opacity: 0.85, depthWrite: false, map: glowTexture(), alphaTest: 0.05 }));
    snow.frustumCulled = false;
    group.add(snow);
    updaters.push((t, cam) => {
      snow.position.set(Math.round(cam.x / 160) * 160, cam.y, Math.round(cam.z / 160) * 160);
      const a = sg.attributes.position;
      for (let i = 0; i < n; i++) {
        let y = a.array[i * 3 + 1] - 0.06;
        if (y < -40) y += 100;
        a.array[i * 3 + 1] = y;
      }
      a.needsUpdate = true;
    });
  };

  W.vulcao = () => {
    const sunDir = new THREE.Vector3(0.5, 0.35, -0.6).normalize();
    env = { sunDir, sky: '#3a0e0a', fog: '#5a1a10', fogNear: 180, fogFar: 1200, hemiSky: '#ff9a6a', hemiGround: '#ff4a10', hemi: 1.4, sun: 2.1, sunColor: '#ffb080' };
    group.add(makeSky({ top: '#1a0606', horizon: '#ff5a20', bottom: '#4a1008', sunColor: '#ff7a30', sunDir, sunSize: 0.008 }));
    const lava = makeFluid({ deep: '#241010', shallow: '#ff4a08', foam: '#ffd23a', sunDir, lava: true }, world.ground, 8000);
    lava.position.set(cx, world.ground, cz);
    group.add(lava);
    updaters.push((t) => (lava.material.uniforms.time.value = t));
    // ilhas e colunas de basalto
    const rockMat = vcolor();
    const spots = scatter(rng, track, clr, Math.round(50 * density) + 8, { minDist: 30, maxDist: 800, height: 16, radius: 30, groundY: world.ground });
    spots.forEach((p, k) => {
      const R = rng.float(10, 40);
      const H = Math.min(rng.float(12, 70), clr.maxTop(p.x, p.z, R) - 4);
      if (H < 8) return;
      const g = blobGeometry(k * 2.3, 2, (y, c) => c.set(y > 0.6 ? '#4a3a36' : y > -0.4 ? '#2c2422' : '#ff6a20'), 1);
      const m = new THREE.Mesh(g, rockMat);
      m.scale.set(R, H, R);
      m.position.set(p.x, world.ground + H * 0.3, p.z);
      group.add(m);
    });
    // vulcão ao fundo
    const vg = new THREE.CylinderGeometry(70, 420, 380, 24, 6, true);
    const vp = vg.attributes.position;
    for (let i = 0; i < vp.count; i++) {
      const x = vp.getX(i);
      const z = vp.getZ(i);
      const n = fbm(x * 0.01, z * 0.01, 3, 4) * 0.18;
      vp.setX(i, x * (1 + n));
      vp.setZ(i, z * (1 + n));
    }
    vg.computeVertexNormals();
    const volcano = new THREE.Mesh(vg, new THREE.MeshLambertMaterial({ color: 0x2a1e1c }));
    const vdir = new THREE.Vector3(-sunDir.x, 0, -sunDir.z).normalize();
    const vpos = new THREE.Vector3(cx, world.ground + 186, cz).addScaledVector(vdir, Math.max(box.max.x - box.min.x, box.max.z - box.min.z) * 0.5 + 900);
    volcano.position.copy(vpos);
    group.add(volcano);
    const crater = new THREE.Mesh(new THREE.CircleGeometry(68, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff7a20 }));
    crater.position.copy(vpos).y += 186;
    group.add(crater);
    // fumaça
    const smokeMat = new THREE.SpriteMaterial({ map: cloudTexture(2), color: 0x3a2a28, transparent: true, depthWrite: false, opacity: 0.85, fog: true });
    const smokes = [];
    for (let i = 0; i < 14; i++) {
      const s = new THREE.Sprite(smokeMat);
      group.add(s);
      smokes.push({ s, k: i / 14 });
    }
    updaters.push((t) => {
      for (const o of smokes) {
        const f = (o.k + t * 0.02) % 1;
        o.s.position.set(vpos.x + Math.sin(f * 7 + o.k * 20) * 30 + f * 120, vpos.y + 190 + f * 500, vpos.z + Math.cos(o.k * 13) * 30);
        const sc = 120 + f * 360;
        o.s.scale.set(sc, sc * 0.7, 1);
        o.s.material.opacity = 0.85;
      }
    });
    // brasas subindo
    const n = Math.round(700 * quality.particles);
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = rng.float(-90, 90);
      pos[i * 3 + 1] = rng.float(-50, 50);
      pos[i * 3 + 2] = rng.float(-90, 90);
    }
    const eg = new THREE.BufferGeometry();
    eg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const embers = new THREE.Points(eg, new THREE.PointsMaterial({ color: 0xff8a2a, size: 0.5, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, map: glowTexture() }));
    embers.frustumCulled = false;
    group.add(embers);
    updaters.push((t, cam) => {
      embers.position.set(Math.round(cam.x / 180) * 180, cam.y, Math.round(cam.z / 180) * 180);
      const a = eg.attributes.position;
      for (let i = 0; i < n; i++) {
        let y = a.array[i * 3 + 1] + 0.05;
        if (y > 50) y -= 100;
        a.array[i * 3 + 1] = y;
      }
      a.needsUpdate = true;
    });
  };

  W.orbita = () => {
    const sunDir = new THREE.Vector3(0.6, 0.45, -0.4).normalize();
    env = { sunDir, sky: '#05030f', fog: '#1a0f3a', fogNear: 400, fogFar: 2200, hemiSky: '#b8a8ff', hemiGround: '#3a2a7a', hemi: 1.6, sun: 2.6, sunColor: '#ffffff' };
    group.add(makeSky({ top: '#03020a', horizon: '#1a0f3a', bottom: '#05030f', sunColor: '#fff0e0', sunDir, sunSize: 0.003, stars: 1.2, nebula: 1 }));
    // planeta com anéis
    const pc = document.createElement('canvas');
    pc.width = 64;
    pc.height = 256;
    const pctx = pc.getContext('2d');
    for (let y = 0; y < 256; y++) {
      const t = y / 256;
      const v = Math.sin(t * 40 + Math.sin(t * 13) * 3) * 0.5 + 0.5;
      const r = Math.round(200 + v * 50);
      const g = Math.round(120 + v * 60 - t * 40);
      const b = Math.round(170 + v * 60);
      pctx.fillStyle = `rgb(${r},${g},${b})`;
      pctx.fillRect(0, y, 64, 1);
    }
    const ptex = new THREE.CanvasTexture(pc);
    ptex.colorSpace = THREE.SRGBColorSpace;
    const planet = new THREE.Mesh(new THREE.SphereGeometry(420, 48, 32), new THREE.MeshLambertMaterial({ map: ptex }));
    const pdir = new THREE.Vector3(-0.6, 0.25, -0.75).normalize();
    planet.position.set(cx, 0, cz).addScaledVector(pdir, 2400);
    planet.rotation.z = 0.35;
    group.add(planet);
    const rc = document.createElement('canvas');
    rc.width = 256;
    rc.height = 4;
    const rctx = rc.getContext('2d');
    for (let x = 0; x < 256; x++) {
      const a = (Math.sin(x * 0.3) * 0.3 + 0.6) * (x > 30 && x < 240 ? 1 : 0) * (x > 120 && x < 136 ? 0.2 : 1);
      rctx.fillStyle = `rgba(230,210,255,${a})`;
      rctx.fillRect(x, 0, 1, 4);
    }
    const rtex = new THREE.CanvasTexture(rc);
    rtex.colorSpace = THREE.SRGBColorSpace;
    const rg = new THREE.RingGeometry(520, 900, 96, 1);
    const ruv = rg.attributes.uv;
    const rpos = rg.attributes.position;
    for (let i = 0; i < ruv.count; i++) {
      const r = Math.hypot(rpos.getX(i), rpos.getY(i));
      ruv.setXY(i, (r - 520) / 380, 0.5);
    }
    const ring = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ map: rtex, transparent: true, side: THREE.DoubleSide, depthWrite: false, fog: false }));
    ring.position.copy(planet.position);
    ring.rotation.x = -Math.PI / 2 + 0.35;
    ring.rotation.y = 0.2;
    group.add(ring);
    // lua
    const moon = new THREE.Mesh(new THREE.SphereGeometry(90, 32, 20), new THREE.MeshLambertMaterial({ color: 0xcfd6e8 }));
    moon.position.set(cx, 300, cz).addScaledVector(new THREE.Vector3(0.7, 0, 0.6).normalize(), 1500);
    group.add(moon);
    // asteroides
    const ast = [];
    const nA = Math.round(260 * density);
    for (let i = 0; i < nA * 3 && ast.length < nA; i++) {
      const x = rng.float(box.min.x - 600, box.max.x + 600);
      const z = rng.float(box.min.z - 600, box.max.z + 600);
      const y = rng.float(track.minY - 200, box.max.y + 200);
      const s = rng.float(2, 22);
      // longe da pista em 3D
      const lim = clr.maxTop(x, z, s * 2);
      if (lim !== Infinity && y + s > lim - 6 && y - s < box.max.y + 30) continue;
      ast.push({ x, y, z, s, rx: rng.float(0, 6), ry: rng.float(0, 6) });
    }
    const ag = blobGeometry(9, 1, (y, c, i) => c.set(i % 9 === 0 ? '#8a7ab0' : '#5a5270'), 0.8);
    const am = instanced(ag, vcolor(), ast);
    if (am) group.add(am);
    // cristais flutuando
    const cr = [];
    for (let i = 0; i < 60 * density; i++) {
      const x = rng.float(box.min.x - 200, box.max.x + 200);
      const z = rng.float(box.min.z - 200, box.max.z + 200);
      const y = rng.float(track.minY - 80, box.max.y + 60);
      if (clr.near(x, z) && Math.abs(y - (box.min.y + box.max.y) / 2) < 70) continue;
      cr.push({ x, y, z, s: rng.float(2, 6), sy: rng.float(5, 14), ry: rng.float(0, 6), rz: rng.float(-0.4, 0.4) });
    }
    const cm = instanced(new THREE.OctahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ color: 0x5ff0ff, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }), cr);
    if (cm) group.add(cm);
    updaters.push((t) => {
      planet.rotation.y = t * 0.01;
      if (am) am.rotation.y = Math.sin(t * 0.02) * 0.01;
    });
  };

  (W[world.id] || W.arquipelago)();
  const sky = group.getObjectByName('ceu');
  return {
    group,
    env,
    update(t, camPos) {
      sky.position.copy(camPos);
      sky.material.uniforms.time.value = t;
      for (const u of updaters) u(t, camPos);
    },
  };
}

export { Clearance };
export const SAMPLE_DS = DS;
