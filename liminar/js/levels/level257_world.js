// Nível 257 — o lado de fora: um vale de floresta ao pôr do sol, com um rio
// transparente correndo ao longo de todo o corredor, e o céu laranja.
import * as THREE from 'three';
import { makeSky } from './outdoor.js';
import { clamp, hash3, lerp, mulberry32, smoothstep, TAU } from '../util.js';

export const SUN = new THREE.Vector3(-0.82, 0.24, -0.52).normalize();

export const riverX = (z) => -78 + 16 * Math.sin(z * 0.0055) + 6 * Math.sin(z * 0.017 + 2);
const RW = 9; // meia largura do rio

export function groundH(x, z) {
  const rx = riverX(z);
  const d = x - rx; // < 0 = margem de lá
  const ad = Math.abs(d);
  const n = 1.2 * Math.sin(x * 0.05 + z * 0.03) + 0.8 * Math.sin(z * 0.07 - x * 0.02) + 0.4 * Math.sin(x * 0.17 + z * 0.13);
  if (ad < RW) return -13.6 + 2.2 * smoothstep(0, RW, ad) + 0.15 * Math.sin(x * 0.9 + z * 0.7);
  if (d > 0) {
    // encosta até o prédio
    const k = smoothstep(RW, RW + 50, d);
    return lerp(-11.2, -7.5, k) + n * 0.5 * k;
  }
  const far = -d - RW;
  return -11.2 + far * 0.16 + Math.min(far * 0.002, 0.4) * far * 0.3 + n * smoothstep(0, 30, far) + 14 * smoothstep(120, 320, far) * (0.5 + 0.5 * Math.sin(z * 0.004 + far * 0.01));
}

function treeGeo(seed, detail) {
  const r = mulberry32(seed);
  const parts = [];
  const H = 7 + r() * 5;
  parts.push([new THREE.CylinderGeometry(0.18, 0.34, H, 6).translate(0, H / 2, 0).toNonIndexed(), [0.3, 0.2, 0.14]]);
  const n = detail ? 6 : 2;
  for (let k = 0; k < n; k++) {
    const R = (detail ? 1.8 : 2.8) + r() * 1.2;
    const a = r() * TAU;
    const o = k === 0 ? 0 : 1.6;
    const g = new THREE.IcosahedronGeometry(R, detail ? 1 : 0).translate(Math.cos(a) * o, H + (k === 0 ? 1.2 : r() * 1.6 - 0.4), Math.sin(a) * o);
    parts.push([g.index ? g.toNonIndexed() : g, [0.2 + r() * 0.12, 0.36 + r() * 0.1, 0.12]]);
  }
  const pos = [];
  const nor = [];
  const col = [];
  for (const [g, c] of parts) {
    const P = g.attributes.position;
    const N = g.attributes.normal;
    for (let i = 0; i < P.count; i++) {
      pos.push(P.getX(i), P.getY(i), P.getZ(i));
      nor.push(N.getX(i), N.getY(i), N.getZ(i));
      // lado virado para o sol mais quente
      const lit = clamp(N.getX(i) * SUN.x + N.getY(i) * SUN.y + N.getZ(i) * SUN.z, 0, 1);
      const k = 0.45 + 0.35 * clamp(N.getY(i) * 0.5 + 0.5, 0, 1);
      col.push(c[0] * k + lit * 0.35, c[1] * k + lit * 0.16, c[2] * k + lit * 0.04);
    }
    g.dispose();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeBoundingSphere();
  return g;
}

const WATER_VERT = /* glsl */ `varying vec3 vW; void main() { vec4 w = modelMatrix * vec4( position, 1.0 ); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const WATER_FRAG = /* glsl */ `
  uniform float uTime;
  uniform vec3 uSun;
  varying vec3 vW;
  void main() {
    vec3 v = normalize( cameraPosition - vW );
    vec2 p = vW.xz;
    vec3 n = normalize( vec3( sin( p.x * 0.6 + uTime * 0.9 ) * 0.04 + sin( p.y * 1.3 - uTime * 1.2 ) * 0.03, 1.0, cos( p.y * 0.7 + uTime * 0.8 ) * 0.04 + sin( p.x * 1.7 + p.y * 0.4 + uTime ) * 0.02 ) );
    float fr = 0.03 + 0.97 * pow( 1.0 - max( dot( n, v ), 0.0 ), 5.0 );
    vec3 r = reflect( -v, n );
    vec3 sky = mix( vec3( 1.0, 0.55, 0.28 ), vec3( 0.35, 0.3, 0.45 ), clamp( r.y * 2.0, 0.0, 1.0 ) );
    float g = pow( max( dot( r, uSun ), 0.0 ), 180.0 );
    vec3 col = sky * fr + vec3( 1.6, 1.0, 0.55 ) * g * 2.5 + vec3( 0.12, 0.28, 0.26 ) * ( 1.0 - fr ) * 0.25;
    float a = clamp( 0.18 + fr * 0.9 + g, 0.0, 0.95 );
    gl_FragColor = vec4( col, a );
  }`;

export class Outside {
  constructor(L) {
    this.L = L;
    this.scene = L.scene;
    this.geos = [];
    this.mats = [];
    const Q = L.Q;
    // terreno: faixa à esquerda do corredor, de ponta a ponta
    const x0 = -430;
    const x1 = 0;
    const z0 = 60;
    const z1 = -1080;
    const step = Q.id === 'low' ? 8 : 5;
    const nx = Math.round((x1 - x0) / step);
    const nz = Math.round((z0 - z1) / step);
    const geo = new THREE.PlaneGeometry(x1 - x0, z0 - z1, nx, nz);
    geo.rotateX(-Math.PI / 2);
    geo.translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
    const p = geo.attributes.position;
    const col = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const z = p.getZ(i);
      const y = groundH(x, z);
      p.setY(i, y);
      const ad = Math.abs(x - riverX(z));
      let c;
      if (ad < RW) c = [0.42, 0.38, 0.32];
      else if (ad < RW + 3) c = [0.62, 0.52, 0.38];
      else {
        const v = hash3(Math.floor(x / 9), Math.floor(z / 9), 3) * 0.12;
        c = [0.26 + v, 0.32 + v, 0.12];
      }
      col.set(c, i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    this.geos.push(geo);
    const gm = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
    this.mats.push(gm);
    this.ground = new THREE.Mesh(geo, gm);
    this.ground.receiveShadow = false;
    this.scene.add(this.ground);
    // pedrinhas no leito (visíveis através da água)
    const stones = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.5, 0), new THREE.MeshStandardMaterial({ color: 0x8a8070, roughness: 0.9, flatShading: true }), 1400);
    this.geos.push(stones.geometry);
    this.mats.push(stones.material);
    const r = mulberry32(257);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const v = new THREE.Vector3();
    const s3 = new THREE.Vector3();
    for (let i = 0; i < 1400; i++) {
      const z = 40 - r() * 1100;
      const x = riverX(z) + (r() - 0.5) * RW * 2;
      m.compose(v.set(x, groundH(x, z) + 0.1, z), q.setFromEuler(e.set(r() * 3, r() * 3, r() * 3)), s3.set(0.4 + r(), 0.25 + r() * 0.3, 0.4 + r()));
      stones.setMatrixAt(i, m);
    }
    stones.frustumCulled = false;
    this.scene.add(stones);
    this.stones = stones;
    // água
    this.waterU = { uTime: { value: 0 }, uSun: { value: SUN } };
    const wm = new THREE.ShaderMaterial({ uniforms: this.waterU, vertexShader: WATER_VERT, fragmentShader: WATER_FRAG, transparent: true, depthWrite: false });
    this.mats.push(wm);
    const pts = [];
    for (let z = 60; z >= -1080; z -= 6) pts.push(z);
    const wpos = [];
    const idx = [];
    pts.forEach((z, i) => {
      const x = riverX(z);
      wpos.push(x - RW - 1.5, -12.0, z, x + RW + 1.5, -12.0, z);
      if (i) idx.push(i * 2 - 2, i * 2 - 1, i * 2, i * 2 - 1, i * 2 + 1, i * 2);
    });
    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.Float32BufferAttribute(wpos, 3));
    wg.setIndex(idx);
    this.geos.push(wg);
    this.water = new THREE.Mesh(wg, wm);
    this.water.frustumCulled = false;
    this.water.renderOrder = 2;
    this.scene.add(this.water);
    // árvores
    this.trees = [];
    for (let i = 0; i < 9000 && this.trees.length < 4200; i++) {
      const z = 60 - r() * 1140;
      const x = -12 - r() * 400;
      const d = x - riverX(z);
      if (Math.abs(d) < RW + 4) continue;
      const dens = d > 0 ? 0.35 : 0.9;
      if (r() > dens) continue;
      this.trees.push({ x, z, y: groundH(x, z), s: 0.8 + r() * 0.7, rot: r() * TAU, v: Math.floor(r() * 3) });
    }
    this.near = [0, 1, 2].map((i) => treeGeo(700 + i * 31, true));
    this.far = [0, 1, 2].map((i) => treeGeo(700 + i * 31, false));
    this.geos.push(...this.near, ...this.far);
    this.treeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
    this.mats.push(this.treeMat);
    const mk = (g, n) => {
      const im = new THREE.InstancedMesh(g, this.treeMat, n);
      im.count = 0;
      im.frustumCulled = false;
      this.scene.add(im);
      return im;
    };
    this.nearM = this.near.map((g) => mk(g, 500));
    this.farM = this.far.map((g) => mk(g, 1800));
    // céu e o sol (que cresce no fim)
    this.sky = makeSky({
      zenith: [0.22, 0.2, 0.36],
      horizon: [1.0, 0.52, 0.24],
      ground: [0.25, 0.16, 0.1],
      fog: L.look.fog,
      sunDir: SUN,
      sunColor: [1.6, 0.85, 0.4],
      sunDisk: 2.0,
      cloudA: [0.55, 0.28, 0.24],
      cloudB: [1.0, 0.68, 0.42],
      cover: 0.5,
    });
    this.scene.add(this.sky);
    this.mats.push(this.sky.material);
    this.geos.push(this.sky.geometry);
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const x = c.getContext('2d');
    const gr = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,250,230,1)');
    gr.addColorStop(0.18, 'rgba(255,220,150,0.95)');
    gr.addColorStop(0.4, 'rgba(255,150,70,0.35)');
    gr.addColorStop(1, 'rgba(255,100,40,0)');
    x.fillStyle = gr;
    x.fillRect(0, 0, 128, 128);
    this.sunTex = new THREE.CanvasTexture(c);
    this.sunMat = new THREE.SpriteMaterial({ map: this.sunTex, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending });
    this.mats.push(this.sunMat);
    this.sunS = new THREE.Sprite(this.sunMat);
    this.sunS.renderOrder = -8;
    this.sunSize = 70;
    this.scene.add(this.sunS);
  }

  refresh(px, pz) {
    const nc = [0, 0, 0];
    const fc = [0, 0, 0];
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const v = new THREE.Vector3();
    const s = new THREE.Vector3();
    for (const t of this.trees) {
      const dz = Math.abs(t.z - pz);
      if (dz > 340) continue;
      const d = Math.hypot(t.x - px, t.z - pz);
      if (d > 360) continue;
      let im;
      let i;
      if (d < 110 && nc[t.v] < 500) {
        im = this.nearM[t.v];
        i = nc[t.v]++;
      } else if (fc[t.v] < 1800) {
        im = this.farM[t.v];
        i = fc[t.v]++;
      } else continue;
      m.compose(v.set(t.x, t.y - 0.2, t.z), q.setFromEuler(e.set(0, t.rot, 0)), s.setScalar(t.s));
      im.setMatrixAt(i, m);
    }
    this.nearM.forEach((im, i) => {
      im.count = nc[i];
      im.instanceMatrix.needsUpdate = true;
    });
    this.farM.forEach((im, i) => {
      im.count = fc[i];
      im.instanceMatrix.needsUpdate = true;
    });
  }

  update(t, cam) {
    this.waterU.uTime.value = t;
    this.sky.position.copy(cam);
    this.sky.material.uniforms.uTime.value = t;
    this.sunS.position.copy(cam).addScaledVector(SUN, 800);
    this.sunS.scale.setScalar(this.sunSize);
  }

  dispose() {
    for (const o of [this.ground, this.stones, this.water, this.sky, this.sunS, ...this.nearM, ...this.farM]) {
      this.scene.remove(o);
      if (o.isInstancedMesh) o.dispose();
    }
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) m.dispose();
    this.sunTex.dispose();
  }
}
