// Nível 43 — tanques do aquário: o volume de água atrás do vidro (azul que
// escurece com a profundidade, luz ondulando no fundo), pedras, algas e peixes
// nadando em cardumes. Tudo com material próprio (não depende das luzes do
// nível), com uma "névoa de água" que deixa o que está longe mais azul.
import * as THREE from 'three';
import { GeoBuilder } from '../materials.js';
import { mulberry32, TAU } from '../util.js';

const WATER_VERT = /* glsl */ `
  varying vec3 vW;
  varying vec3 vN;
  varying vec3 vC;
  attribute vec3 color;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz;
    vN = normalize(mat3(modelMatrix) * normal);
    vC = color;
    gl_Position = projectionMatrix * viewMatrix * w;
  }`;

const WATER_FRAG = /* glsl */ `
  uniform float uTime;
  uniform vec3 uDeep;
  uniform vec3 uShallow;
  uniform float uTop;
  uniform float uBottom;
  uniform float uSolid;
  varying vec3 vW;
  varying vec3 vN;
  varying vec3 vC;
  float caust(vec2 p) {
    float t = uTime * 0.6;
    float a = sin(p.x * 1.7 + t) + sin(p.y * 2.1 - t * 1.2) + sin((p.x + p.y) * 1.3 + t * 0.7) + sin((p.x - p.y) * 2.7 - t * 0.9);
    return pow(max(0.0, 1.0 - abs(a) * 0.55), 6.0);
  }
  void main() {
    float h = clamp((vW.y - uBottom) / (uTop - uBottom), 0.0, 1.0);
    vec3 water = mix(uDeep, uShallow, h * h);
    vec3 c;
    if (uSolid > 0.5) {
      // objetos no fundo: cor própria, luz de cima, cáusticas
      float up = clamp(vN.y * 0.5 + 0.5, 0.0, 1.0);
      c = vC * (0.2 + 0.6 * up) * mix(0.4, 1.0, h);
      c += vec3(0.4, 0.7, 0.8) * caust(vW.xz * 1.3) * up * 0.35;
    } else {
      c = water;
      float floorK = clamp(vN.y, 0.0, 1.0);
      c += vec3(0.3, 0.55, 0.6) * caust(vW.xz) * (0.15 + floorK * 0.6) * (0.3 + h);
      c = mix(c, vec3(0.6, 0.55, 0.4) * (0.3 + 0.25 * caust(vW.xz * 0.8)), floorK * 0.35);
    }
    float d = distance(vW, cameraPosition);
    c = mix(c, water * 0.85, 1.0 - exp(-d * 0.06));
    gl_FragColor = vec4(c, 1.0);
  }`;

const FISH_VERT = /* glsl */ `
  uniform float uTime;
  varying vec3 vC;
  varying vec3 vW;
  varying float vUp;
  void main() {
    vec3 p = position;
    float ph = instanceMatrix[3][0] * 1.7 + instanceMatrix[3][2] * 2.3;
    float tail = clamp(-p.z / 0.3, 0.0, 1.0);
    p.x += sin(uTime * 7.0 + ph + p.z * 9.0) * 0.06 * tail;
    vec4 w = modelMatrix * instanceMatrix * vec4(p, 1.0);
    vW = w.xyz;
    #ifdef USE_INSTANCING_COLOR
      vC = instanceColor * color;
    #else
      vC = color;
    #endif
    vUp = normalize(mat3(modelMatrix * instanceMatrix) * normal).y;
    gl_Position = projectionMatrix * viewMatrix * w;
  }`;

const FISH_FRAG = /* glsl */ `
  uniform vec3 uWater;
  varying vec3 vC;
  varying vec3 vW;
  varying float vUp;
  void main() {
    vec3 c = vC * (0.45 + 0.55 * clamp(vUp * 0.5 + 0.6, 0.0, 1.0));
    float d = distance(vW, cameraPosition);
    c = mix(c, uWater, 1.0 - exp(-d * 0.07));
    gl_FragColor = vec4(c, 1.0);
  }`;

function fishGeometry() {
  const B = new GeoBuilder();
  const m = new THREE.Matrix4();
  const sph = new THREE.SphereGeometry(1, 10, 8);
  const W = [1, 1, 1];
  m.compose(new THREE.Vector3(0, 0, 0.02), new THREE.Quaternion(), new THREE.Vector3(0.045, 0.1, 0.22));
  B.addGeometry(sph, m, W);
  // cauda e barbatanas
  m.compose(new THREE.Vector3(0, 0, -0.25), new THREE.Quaternion(), new THREE.Vector3(0.008, 0.09, 0.07));
  B.addGeometry(sph, m, [0.85, 0.85, 0.85]);
  m.compose(new THREE.Vector3(0, 0.1, 0.0), new THREE.Quaternion(), new THREE.Vector3(0.006, 0.05, 0.09));
  B.addGeometry(sph, m, [0.85, 0.85, 0.85]);
  // olhos escuros
  for (const s of [-1, 1]) {
    m.compose(new THREE.Vector3(s * 0.035, 0.025, 0.16), new THREE.Quaternion(), new THREE.Vector3(0.015, 0.015, 0.015));
    B.addGeometry(sph, m, [0.05, 0.05, 0.05]);
  }
  sph.dispose();
  return B.build();
}

// Espécies: cor, escala (x, y, z), velocidade, tamanho do cardume.
const SPECIES = {
  amarelo: { col: [1.0, 0.85, 0.15], s: [1, 1, 0.8], speed: 0.35, school: 6 },
  palhaco: { col: [1.0, 0.45, 0.1], s: [1, 0.9, 0.7], speed: 0.3, school: 4 },
  azul: { col: [0.15, 0.4, 1.0], s: [1, 1, 1], speed: 0.4, school: 5 },
  prata: { col: [0.75, 0.82, 0.88], s: [0.8, 0.7, 0.9], speed: 0.55, school: 14 },
  roxo: { col: [0.6, 0.25, 0.9], s: [1, 1.1, 0.8], speed: 0.3, school: 3 },
  arraia: { col: [0.35, 0.36, 0.38], s: [9, 0.6, 3.2], speed: 0.25, school: 1 },
  tubarao: { col: [0.4, 0.45, 0.5], s: [2.2, 3, 9], speed: 0.3, school: 1 },
  baleia: { col: [0.25, 0.32, 0.42], s: [6, 8, 26], speed: 0.12, school: 1 },
};

export class Aquarium {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.tanks = [];
    this.fish = [];
    this.uTime = { value: 0 };
    this.fishGeo = fishGeometry();
    this.geos = [this.fishGeo];
    this.mats = [];
  }

  waterMat(solid, deep, shallow, y0, y1) {
    const m = new THREE.ShaderMaterial({
      uniforms: {
        uTime: this.uTime,
        uDeep: { value: new THREE.Color(...deep) },
        uShallow: { value: new THREE.Color(...shallow) },
        uTop: { value: y1 },
        uBottom: { value: y0 },
        uSolid: { value: solid ? 1 : 0 },
      },
      vertexShader: WATER_VERT,
      fragmentShader: WATER_FRAG,
      side: solid ? THREE.FrontSide : THREE.BackSide,
    });
    this.mats.push(m);
    return m;
  }

  // Um tanque: caixa {x0,x1,z0,z1,y0,y1}; glass: {axis:'x'|'z', at, a0, a1} (só o vidro).
  addTank(t, fishList, seed, colors = {}) {
    const deep = colors.deep || [0.0, 0.06, 0.12];
    const shallow = colors.shallow || [0.03, 0.3, 0.45];
    const box = new THREE.BoxGeometry(t.x1 - t.x0, t.y1 - t.y0, t.z1 - t.z0);
    const col = new Float32Array(box.attributes.position.count * 3).fill(1);
    box.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mesh = new THREE.Mesh(box, this.waterMat(false, deep, shallow, t.y0, t.y1));
    mesh.position.set((t.x0 + t.x1) / 2, (t.y0 + t.y1) / 2, (t.z0 + t.z1) / 2);
    this.group.add(mesh);
    this.geos.push(box);
    // pedras e algas no fundo
    const rnd = mulberry32(seed);
    const B = new GeoBuilder();
    const rock = new THREE.DodecahedronGeometry(1, 0);
    const m4 = new THREE.Matrix4();
    const area = (t.x1 - t.x0) * (t.z1 - t.z0);
    const n = Math.min(40, Math.round(area / 6));
    for (let k = 0; k < n; k++) {
      const x = t.x0 + 0.5 + rnd() * (t.x1 - t.x0 - 1);
      const z = t.z0 + 0.5 + rnd() * (t.z1 - t.z0 - 1);
      const s = 0.3 + rnd() * 1.1;
      m4.compose(new THREE.Vector3(x, t.y0 + s * 0.3, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rnd(), rnd() * 6, rnd())), new THREE.Vector3(s * (1 + rnd()), s * 0.7, s));
      const g = 0.35 + rnd() * 0.25;
      B.addGeometry(rock, m4, [g, g * 0.95, g * 0.85]);
      if (rnd() < 0.6) {
        // alga: fita alta e fina
        const h = 0.8 + rnd() * 2.2;
        m4.compose(new THREE.Vector3(x + 0.3, t.y0 + h / 2, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rnd() * 6, (rnd() - 0.5) * 0.3)), new THREE.Vector3(0.12, h, 0.02));
        const bg = new THREE.BoxGeometry(1, 1, 1);
        B.addGeometry(bg, m4, [0.15 + rnd() * 0.15, 0.45 + rnd() * 0.25, 0.2]);
        bg.dispose();
      }
      if (rnd() < 0.25) {
        // coral colorido
        const cc = [
          [0.9, 0.35, 0.45],
          [0.95, 0.6, 0.25],
          [0.7, 0.4, 0.85],
        ][Math.floor(rnd() * 3)];
        m4.compose(new THREE.Vector3(x - 0.2, t.y0 + 0.25, z + 0.3), new THREE.Quaternion(), new THREE.Vector3(0.35, 0.45, 0.35));
        B.addGeometry(rock, m4, cc);
      }
    }
    rock.dispose();
    if (!B.empty) {
      const g = B.build();
      this.geos.push(g);
      this.group.add(new THREE.Mesh(g, this.waterMat(true, deep, shallow, t.y0, t.y1)));
    }
    // vidro
    if (t.glass) {
      const G = t.glass;
      const w = G.a1 - G.a0;
      const pg = new THREE.PlaneGeometry(w, t.glassH || 4);
      const gm = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 0.8, 1.0), transparent: true, opacity: 0.1, depthWrite: false, side: THREE.DoubleSide });
      const pm = new THREE.Mesh(pg, gm);
      if (G.axis === 'x') {
        pm.rotation.y = Math.PI / 2;
        pm.position.set(G.at, (t.glassH || 4) / 2, (G.a0 + G.a1) / 2);
      } else pm.position.set((G.a0 + G.a1) / 2, (t.glassH || 4) / 2, G.at);
      pm.renderOrder = 3;
      this.group.add(pm);
      this.geos.push(pg);
      this.mats.push(gm);
    }
    // peixes
    const water = new THREE.Color(...shallow).multiplyScalar(0.7);
    for (const [kind, count] of fishList) this.addSchools(t, kind, count, rnd, water);
    this.tanks.push(t);
  }

  addSchools(t, kind, count, rnd, water) {
    const sp = SPECIES[kind];
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: this.uTime, uWater: { value: water } },
      vertexShader: FISH_VERT,
      fragmentShader: FISH_FRAG,
      vertexColors: true,
    });
    this.mats.push(mat);
    const mesh = new THREE.InstancedMesh(this.fishGeo, mat, count);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    const big = sp.s[2] > 3;
    const margin = big ? Math.max(sp.s[0], sp.s[2]) * 0.25 + 0.5 : 0.6;
    const cx = (t.x0 + t.x1) / 2;
    const cz = (t.z0 + t.z1) / 2;
    const rx = Math.max(0.5, (t.x1 - t.x0) / 2 - margin);
    const rz = Math.max(0.5, (t.z1 - t.z0) / 2 - margin);
    const list = [];
    let school = null;
    for (let i = 0; i < count; i++) {
      if (!school || school.n >= sp.school) {
        school = {
          n: 0,
          ph: rnd() * TAU,
          w: (sp.speed / Math.max(rx, rz)) * (rnd() < 0.5 ? 1 : -1) * (0.8 + rnd() * 0.4),
          k: 0.4 + rnd() * 0.6,
          y: t.y0 + 0.8 + rnd() * Math.max(0.2, t.y1 - t.y0 - (big ? 4 : 1.8)) + (big ? 1.5 : 0),
          ph2: rnd() * TAU,
        };
      }
      school.n++;
      const c = new THREE.Color(...sp.col).multiplyScalar(0.8 + rnd() * 0.3);
      mesh.setColorAt(i, c);
      list.push({ sc: school, ox: (rnd() - 0.5) * 0.9, oy: (rnd() - 0.5) * 0.6, oz: (rnd() - 0.5) * 0.9, sz: 0.8 + rnd() * 0.5 });
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    this.group.add(mesh);
    this.fish.push({ mesh, list, cx, cz, rx, rz, sp, t });
  }

  update(dt, time) {
    this.uTime.value = time;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();
    for (const F of this.fish) {
      const { sp } = F;
      F.list.forEach((f, i) => {
        const sc = f.sc;
        const a = sc.ph + time * sc.w;
        const rx = F.rx * sc.k + (1 - sc.k) * F.rx * 0.6;
        const rz = F.rz * sc.k + (1 - sc.k) * F.rz * 0.6;
        const x = F.cx + Math.cos(a) * rx + f.ox;
        const z = F.cz + Math.sin(a) * rz + f.oz;
        const y = sc.y + Math.sin(a * 2 + sc.ph2) * 0.4 + f.oy;
        const tx = -Math.sin(a) * rx * sc.w;
        const tz = Math.cos(a) * rz * sc.w;
        e.set(Math.sin(a * 2 + sc.ph2) * -0.15, Math.atan2(tx, tz), 0);
        q.setFromEuler(e);
        p.set(x, y, z);
        s.set(sp.s[0] * f.sz, sp.s[1] * f.sz, sp.s[2] * f.sz);
        m.compose(p, q, s);
        F.mesh.setMatrixAt(i, m);
      });
      F.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  dispose() {
    this.scene.remove(this.group);
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) m.dispose();
  }
}
