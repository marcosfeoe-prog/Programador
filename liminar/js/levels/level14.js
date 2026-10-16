// Nível 14 — "O Paraíso Doente": uma floresta de árvores vermelhas sob um
// brilho roxo intenso, flores que brilham no escuro e uma trilha de terra
// que leva 300 m até uma casa com a porta negra (saída para o Nível 15).
// Pelo caminho, casas abertas e totalmente vazias. Uma música toca de
// lugar nenhum — e desacelera perto da porta negra.
import * as THREE from 'three';
import { OutdoorLevel, makeSky } from './outdoor.js';
import { pushCircle } from './grid.js';
import { GeoBuilder } from '../materials.js';
import { getTex, TEX } from '../textures.js';
import { clamp, fbm, hash3, mulberry32, smoothstep, lerp, TAU } from '../util.js';

const END_Z = -300; // porta negra (a 300 m do início)
const Z0 = 34; // limites do mundo em z
const Z1 = -344;
const HALF = 80; // meia largura da floresta em torno da trilha
const H = 2.7; // altura das paredes das casas
const T = 0.16; // espessura das paredes

// Trilha sinuosa (idêntica em JS e GLSL).
export function trailX(z) {
  return 11 * Math.sin(z * 0.017) + 5 * Math.sin(z * 0.043 + 1.2);
}
const TRAIL_GLSL = /* glsl */ `
float trailX( float z ) { return 11.0 * sin( z * 0.017 ) + 5.0 * sin( z * 0.043 + 1.2 ); }
`;

function baseH(x, z) {
  const h = 0.9 * Math.sin(x * 0.045 + z * 0.021) + 0.6 * Math.sin(z * 0.061 - x * 0.033 + 1.7) + 0.3 * Math.sin(x * 0.11 + z * 0.09);
  const d = Math.abs(x - trailX(z));
  return h * lerp(0.35, 1, smoothstep(2, 10, d));
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();
const _c = new THREE.Color();

// ------------------------------------------------------------ texturas
function grassTex(S) {
  const c = TEX.makeCanvas(S, S);
  const x = c.getContext('2d');
  x.fillStyle = '#2b1038';
  x.fillRect(0, 0, S, S);
  const r = mulberry32(1414);
  const k = S / 512;
  for (let i = 0; i < 70; i++) {
    const px = r() * S;
    const py = r() * S;
    const rad = (20 + r() * 70) * k;
    const gr = x.createRadialGradient(px, py, 0, px, py, rad);
    const l = r() < 0.5 ? 'rgba(70,20,90,0.35)' : 'rgba(18,4,26,0.35)';
    gr.addColorStop(0, l);
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = gr;
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) x.fillRect(px - rad + ox, py - rad + oy, rad * 2, rad * 2);
  }
  const n = Math.floor((S * S) / 55);
  for (let i = 0; i < n; i++) {
    const px = r() * S;
    const py = r() * S;
    const len = (3 + r() * 7) * k;
    const a = -Math.PI / 2 + (r() - 0.5) * 1.1;
    const hue = 265 + r() * 55;
    x.strokeStyle = `hsl(${hue},${45 + r() * 35}%,${12 + r() * 30}%)`;
    x.lineWidth = (0.6 + r() * 1.3) * k;
    const ex = Math.cos(a) * len;
    const ey = Math.sin(a) * len;
    for (const ox of px < 12 * k ? [0, S] : px > S - 12 * k ? [0, -S] : [0])
      for (const oy of py < 12 * k ? [0, S] : py > S - 12 * k ? [0, -S] : [0]) {
        x.beginPath();
        x.moveTo(px + ox, py + oy);
        x.lineTo(px + ox + ex, py + oy + ey);
        x.stroke();
      }
  }
  // florzinhas e folhas vermelhas caídas
  for (let i = 0; i < 260 * k * k; i++) {
    const px = r() * S;
    const py = r() * S;
    x.fillStyle = r() < 0.6 ? `hsl(${345 + r() * 20},80%,${28 + r() * 18}%)` : `hsl(${290 + r() * 30},70%,${55 + r() * 20}%)`;
    x.beginPath();
    x.ellipse(px, py, (1.5 + r() * 2.5) * k, (1 + r() * 1.5) * k, r() * 3, 0, TAU);
    x.fill();
  }
  return TEX.toTex(c);
}

function bladeTex() {
  const S = 128;
  const c = TEX.makeCanvas(S, S);
  const x = c.getContext('2d');
  const r = mulberry32(77);
  for (let i = 0; i < 46; i++) {
    const bx = 8 + r() * (S - 16);
    const h = S * (0.45 + r() * 0.55);
    const lean = (r() - 0.5) * 30;
    const w = 2 + r() * 3;
    const g = x.createLinearGradient(0, S, 0, S - h);
    const hue = 270 + r() * 50;
    g.addColorStop(0, `hsl(${hue},55%,10%)`);
    g.addColorStop(1, `hsl(${hue},${60 + r() * 30}%,${35 + r() * 25}%)`);
    x.fillStyle = g;
    x.beginPath();
    x.moveTo(bx - w, S);
    x.quadraticCurveTo(bx + lean * 0.3, S - h * 0.6, bx + lean, S - h);
    x.quadraticCurveTo(bx + lean * 0.3 + w * 0.3, S - h * 0.6, bx + w, S);
    x.fill();
  }
  return TEX.toTex(c, { repeat: false });
}

function dotTex() {
  const S = 64;
  const c = TEX.makeCanvas(S, S);
  const x = c.getContext('2d');
  const g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.7)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, S, S);
  return TEX.toTex(c, { repeat: false });
}

function signTex(text) {
  const c = TEX.makeCanvas(256, 96);
  const x = c.getContext('2d');
  x.fillStyle = '#5a3a2c';
  x.fillRect(0, 0, 256, 96);
  x.fillStyle = 'rgba(0,0,0,0.25)';
  for (let i = 0; i < 6; i++) x.fillRect(0, i * 16 + 7, 256, 2);
  x.fillStyle = '#efe2d0';
  x.font = 'bold 40px Georgia, serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText(text, 128, 50);
  return TEX.toTex(c, { repeat: false });
}

// ------------------------------------------------------------ árvores vermelhas
// Tronco curvo, alguns galhos e uma copa de "nuvens" de folhas vermelhas.
function redTreeGeometry(seed, detail) {
  const r = mulberry32(seed);
  const pos = [];
  const nor = [];
  const col = [];
  const uvs = [];
  const Ht = 5.2 + r() * 2.4;
  const bend = (y) => [Math.sin(y * 0.45 + seed) * 0.18, Math.cos(y * 0.33 + seed) * 0.12];
  // tronco
  const trunk = new THREE.CylinderGeometry(0.13, 0.3, Ht, 7, 4, true).translate(0, Ht / 2, 0).toNonIndexed();
  const P = trunk.attributes.position;
  const N = trunk.attributes.normal;
  for (let i = 0; i < P.count; i++) {
    const y = P.getY(i);
    const [bx, bz] = bend(y);
    pos.push(P.getX(i) + bx, y, P.getZ(i) + bz);
    nor.push(N.getX(i), N.getY(i), N.getZ(i));
    const k = 0.6 + 0.4 * (y / Ht);
    col.push(0.11 * k, 0.05 * k, 0.065 * k);
    uvs.push(trunk.attributes.uv.getX(i) * 0.5, (y / Ht) * 2);
  }
  trunk.dispose();
  const blobs = [];
  const [tx, tz] = bend(Ht);
  blobs.push([tx, Ht + 0.7, tz, 2.0 + r() * 0.5]);
  // galhos
  const nb = 3 + Math.floor(r() * 2);
  const a0 = r() * TAU;
  for (let b = 0; b < nb; b++) {
    const a = a0 + (b / nb) * TAU + (r() - 0.5) * 0.6;
    const y0 = Ht * (0.5 + r() * 0.3);
    const el = 0.55 + r() * 0.35;
    const len = 1.8 + r() * 1.0;
    const dir = new THREE.Vector3(Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el));
    const [bx, bz] = bend(y0);
    const base = new THREE.Vector3(bx, y0, bz);
    const g = new THREE.CylinderGeometry(0.05, 0.1, len, 5, 1, true).translate(0, len / 2, 0).toNonIndexed();
    _q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    _m.compose(base, _q, _s.set(1, 1, 1));
    g.applyMatrix4(_m);
    const gp = g.attributes.position;
    const gn = g.attributes.normal;
    for (let i = 0; i < gp.count; i++) {
      pos.push(gp.getX(i), gp.getY(i), gp.getZ(i));
      nor.push(gn.getX(i), gn.getY(i), gn.getZ(i));
      col.push(0.1, 0.045, 0.06);
      uvs.push(0.5, 0.5);
    }
    g.dispose();
    const end = base.clone().addScaledVector(dir, len);
    blobs.push([end.x, end.y + 0.3, end.z, 1.35 + r() * 0.6]);
  }
  for (let b = 0; b < 2; b++) {
    const a = r() * TAU;
    blobs.push([tx + Math.cos(a) * 1.3, Ht - 0.1 + r() * 0.9, tz + Math.sin(a) * 1.3, 1.3 + r() * 0.5]);
  }
  // copa
  const ico = new THREE.IcosahedronGeometry(1, detail);
  const IP = ico.attributes.position;
  for (const [cx, cy, cz, R] of blobs) {
    const hue = r();
    const base = [lerp(0.5, 0.82, hue), lerp(0.03, 0.09, hue), lerp(0.05, 0.08, hue)];
    const ph = r() * 10;
    for (let i = 0; i < IP.count; i++) {
      _v.set(IP.getX(i), IP.getY(i), IP.getZ(i)).normalize();
      const n = Math.sin(_v.x * 4.1 + ph) * Math.sin(_v.y * 3.7 + ph * 0.7) * Math.sin(_v.z * 4.6 + ph * 1.3) + 0.35 * Math.sin(_v.x * 9.3 + ph) * Math.sin(_v.z * 8.7 - ph);
      const rr = R * (1 + n * 0.2);
      pos.push(cx + _v.x * rr, cy + _v.y * rr * 0.82, cz + _v.z * rr);
      nor.push(_v.x, _v.y, _v.z);
      uvs.push(Math.atan2(_v.z, _v.x) * R * 0.5 + ph, _v.y * R * 0.9);
      const k = 0.42 + 0.58 * clamp(_v.y * 0.5 + 0.5, 0, 1);
      col.push(base[0] * k, base[1] * k, base[2] * k);
    }
  }
  ico.dispose();
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.computeBoundingSphere();
  return g;
}

// Textura das copas: folhinhas claras e escuras (multiplica a cor do vértice).
function leafTex() {
  const S = 256;
  const c = TEX.makeCanvas(S, S);
  const x = c.getContext('2d');
  x.fillStyle = '#9a9a9a';
  x.fillRect(0, 0, S, S);
  const r = mulberry32(2024);
  for (let i = 0; i < 1500; i++) {
    const px = r() * S;
    const py = r() * S;
    const l = Math.floor(70 + r() * 185);
    x.fillStyle = `rgb(${l},${Math.floor(l * (0.85 + r() * 0.2))},${l})`;
    const rx = 3 + r() * 5;
    const ry = 1.5 + r() * 2.5;
    const a = r() * TAU;
    for (const ox of [-S, 0, S])
      for (const oy of [-S, 0, S]) {
        if (Math.abs(px + ox - S / 2) > S / 2 + 10 || Math.abs(py + oy - S / 2) > S / 2 + 10) continue;
        x.beginPath();
        x.ellipse(px + ox, py + oy, rx, ry, a, 0, TAU);
        x.fill();
      }
  }
  return TEX.toTex(c);
}

export class Level14 extends OutdoorLevel {
  constructor(game) {
    super(game, { P: 72, walkSpeed: 2.3, camFar: 900 });
    this.num = 14;
    this.seed = (game.seed ^ 0x1414) >>> 0;
    this.time = 0;
    this.sanityExtra = 0;
    this.colliders = [];
    this.visited = new Set();
    this.look = {
      exposure: 1.02,
      tint: [1.04, 0.93, 1.1],
      sat: 1.18,
      contrast: 1.08,
      lift: [0.02, 0.0, 0.03],
      bloom: 0.34,
      bloomThreshold: 1.0,
      fog: [0.34, 0.12, 0.44],
      lightColor: [1, 1, 1],
      flashlight: false,
      ambience: 'level14',
      reverb: 1.3,
      sanityDrain: 0.06,
    };
    this.objectives = [
      { id: 'trilha', text: 'Siga a trilha pela floresta (300 m)' },
      { id: 'porta', text: 'Abra a casa da porta negra' },
    ];
    const fogC = new THREE.Color(...this.look.fog);
    this.scene.fog = new THREE.FogExp2(fogC, 0.017);
    this.scene.background = fogC;
    this.sky = makeSky({
      zenith: [0.14, 0.03, 0.26],
      horizon: [0.72, 0.28, 0.82],
      ground: [0.2, 0.06, 0.24],
      fog: this.look.fog,
      sunDir: new THREE.Vector3(0.15, 0.1, -1),
      sunColor: [1.3, 0.45, 1.1],
      sunDisk: 1.6,
      cloudA: [0.28, 0.08, 0.38],
      cloudB: [0.95, 0.5, 0.92],
      cover: 0.42,
    });
    this.scene.add(this.sky);
    this.setupLights({
      sky: 0xc48cff,
      ground: 0x40102c,
      hemi: 1.55,
      sunColor: 0xff9ad6,
      sun: 1.5,
      sunDir: new THREE.Vector3(0.25, 0.4, -0.88),
      shadowExtent: 40,
    });
    // lugares
    const sx = trailX(0);
    this.spawn = { x: sx, z: 0, yaw: Math.atan2(-(trailX(-6) - sx), 6) };
    this.makeHouses();
    this.door = { x: this.exitHouse.x, z: END_Z };
    this.exit = { x: this.door.x, z: END_Z + 0.8 };
  }

  // ------------------------------------------------------------ relevo
  groundH(x, z) {
    let h = baseH(x, z);
    for (const c of this.houses) {
      const dx = Math.max(Math.abs(x - c.x) - c.hx, 0);
      const dz = Math.max(Math.abs(z - c.z) - c.hz, 0);
      if (dx > 6 || dz > 6) continue;
      h = lerp(h, c.y, 1 - smoothstep(0, 6, Math.hypot(dx, dz)));
    }
    return h;
  }

  houseAt(x, z, m = 0) {
    for (const c of this.houses) if (Math.abs(x - c.x) < c.hx - T - m && Math.abs(z - c.z) < c.hz - T - m) return c;
    return null;
  }

  // ------------------------------------------------------------ construção
  async preload(px, pz, progress) {
    const g = this.game;
    // a música (não trava o carregamento se demorar)
    if (g.audio.ready) {
      const load = g.audio.loadTrack('l14', 'assets/audio/l14_apathy.m4a');
      await Promise.race([load, new Promise((r) => setTimeout(r, 4000))]);
    }
    progress(0.1);
    this.makeGround();
    progress(0.3);
    await new Promise((r) => setTimeout(r, 0));
    this.buildHouses();
    progress(0.45);
    await new Promise((r) => setTimeout(r, 0));
    this.makeTrees();
    progress(0.75);
    await new Promise((r) => setTimeout(r, 0));
    this.makeFlowers();
    this.makeGrass();
    this.makeParticles();
    this.makeSign();
    this.spawnItems();
    this.refreshTrees(px, pz);
    this.refreshGrass(px, pz);
    this.updateSun({ x: px, z: pz });
    progress(1);
  }

  makeGround() {
    const Q = this.Q;
    const step = Q.id === 'low' ? 4 : Q.id === 'medium' ? 2.5 : 2;
    const x0 = -112;
    const x1 = 112;
    const W = x1 - x0;
    const D = Z0 + 8 - (Z1 - 8);
    const nx = Math.round(W / step);
    const nz = Math.round(D / step);
    const geo = new THREE.PlaneGeometry(W, D, nx, nz);
    geo.rotateX(-Math.PI / 2);
    geo.translate((x0 + x1) / 2, 0, (Z0 + 8 + Z1 - 8) / 2);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, this.groundH(p.getX(i), p.getZ(i)));
    geo.computeVertexNormals();
    this.grassMap = grassTex(Math.min(1024, Q.tex));
    const path = getTex('pathDirt', Q.tex);
    const mat = new THREE.MeshStandardMaterial({ map: this.grassMap, roughness: 0.95 });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uPath = { value: path.map };
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nuniform sampler2D uPath;\n' + TRAIL_GLSL)
        .replace(
          '#include <map_fragment>',
          `vec2 w = vWPos.xz;
          vec3 gC = texture2D( map, w * 0.21 ).rgb;
          float lo = texture2D( map, w * 0.023 + 0.37 ).r;
          gC *= 0.75 + lo * 1.1;
          vec3 pC = texture2D( uPath, w * 0.32 ).rgb * vec3( 0.92, 0.66, 0.86 );
          float d = abs( w.x - trailX( w.y ) );
          float edge = 1.3 + ( texture2D( map, w * 0.07 ).g - 0.2 ) * 1.4;
          float t = 1.0 - smoothstep( edge - 0.3, edge + 0.3, d );
          t *= ( 1.0 - smoothstep( 8.0, 14.0, w.y ) ) * smoothstep( ${(END_Z - 0.5).toFixed(1)}, ${(END_Z + 1.5).toFixed(1)}, w.y );
          diffuseColor.rgb *= mix( gC, pC, t );`,
        );
    };
    this.ground = new THREE.Mesh(geo, mat);
    this.ground.receiveShadow = Q.shadows;
    this.scene.add(this.ground);
  }

  // Posições das casas: oito abertas ao longo da trilha e a da porta negra no fim.
  makeHouses() {
    const r = mulberry32(this.seed + 3);
    const HZ = [-30, -64, -99, -136, -171, -207, -242, -274];
    this.houses = [];
    const pal = [
      [0.8, 0.76, 0.82],
      [0.72, 0.64, 0.74],
      [0.84, 0.8, 0.76],
      [0.66, 0.6, 0.72],
      [0.78, 0.7, 0.7],
    ];
    HZ.forEach((z, k) => {
      const side = (k + (this.seed & 1)) % 2 ? 1 : -1;
      const off = 11 + r() * 7;
      const x = trailX(z) + side * off;
      const w = 5.4 + r() * 1.6;
      const d = 6 + r() * 1.6;
      this.addHouse({ x, z, w, d, rot: side > 0 ? -Math.PI / 2 : Math.PI / 2, color: pal[Math.floor(r() * pal.length)], door: r() < 0.6, chimney: r() < 0.5, idx: k });
    });
    const w = 6.6;
    const d = 7;
    this.exitHouse = this.addHouse({ x: trailX(END_Z), z: END_Z - d / 2, w, d, rot: 0, color: [0.42, 0.36, 0.46], black: true, chimney: true });
  }

  addHouse(o) {
    const q = Math.abs(Math.sin(o.rot)) > 0.5;
    o.hx = (q ? o.d : o.w) / 2;
    o.hz = (q ? o.w : o.d) / 2;
    o.cs = Math.cos(o.rot);
    o.sn = Math.sin(o.rot);
    // chão nivelado pelo ponto mais alto da base
    let y = -Infinity;
    for (const [a, b] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
      [0, 0],
    ])
      y = Math.max(y, baseH(o.x + a * o.hx, o.z + b * o.hz));
    o.y = y;
    o.floor = y + 0.25;
    // frente da casa (porta) em coordenadas do mundo
    o.front = this.toWorld(o, 0, o.d / 2 + 0.8);
    this.houses.push(o);
    return o;
  }

  toWorld(o, lx, lz) {
    return [o.x + lx * o.cs + lz * o.sn, o.z - lx * o.sn + lz * o.cs];
  }

  buildHouses() {
    const Q = this.Q;
    const S = Q.tex;
    const pl = getTex('planks', S);
    const rf = getTex('roof', S);
    this.wallMat = new THREE.MeshStandardMaterial({ map: pl.map, normalMap: Q.normalMaps ? pl.normalMap : null, vertexColors: true, roughness: 0.9, side: THREE.DoubleSide });
    this.roofMat = new THREE.MeshStandardMaterial({ map: rf.map, vertexColors: true, roughness: 0.85, side: THREE.DoubleSide });
    const gw = new GeoBuilder();
    const gr = new GeoBuilder();
    for (const h of this.houses) this.buildHouse(gw, gr, h);
    this.houseMesh = new THREE.Mesh(gw.build(), this.wallMat);
    this.roofMesh = new THREE.Mesh(gr.build(), this.roofMat);
    for (const m of [this.houseMesh, this.roofMesh]) {
      m.castShadow = Q.shadows;
      m.receiveShadow = Q.shadows;
      this.scene.add(m);
    }
    this.makeBlackDoor();
  }

  buildHouse(gw, gr, h) {
    const { w, d } = h;
    const col = h.color;
    const wood = [0.32, 0.22, 0.2];
    const box = (gb, lx, y0, y1, lz, sx, sz, c, solid = true, us = 1.2) => {
      const [x, z] = this.toWorld(h, lx, lz);
      const sy = y1 - y0;
      gb.box(x, h.y + y0 + sy / 2, z, sx, sy, sz, c, null, { rot: h.rot, uvScale: us, ao: 0.25 });
      if (solid) {
        const q = Math.abs(h.sn) > 0.5;
        const ax = (q ? sz : sx) / 2;
        const az = (q ? sx : sz) / 2;
        this.colliders.push([x - ax, x + ax, z - az, z + az]);
      }
    };
    const fy = 0.25;
    const top = fy + H;
    // parede ao longo de x (frente/fundo) com aberturas [a, b, y0, y1]
    const wallX = (lz, holes) => {
      let a = -w / 2;
      for (const o of [...holes, [w / 2, w / 2, 0, 0]]) {
        if (o[0] > a) box(gw, (a + o[0]) / 2, fy, top, lz, o[0] - a, T, col);
        if (o[1] > o[0]) {
          if (o[2] > fy + 0.01) box(gw, (o[0] + o[1]) / 2, fy, o[2], lz, o[1] - o[0], T, col);
          box(gw, (o[0] + o[1]) / 2, o[3], top, lz, o[1] - o[0], T, col, false);
          // moldura
          box(gw, o[0] - 0.04, o[2], o[3], lz, 0.08, T + 0.04, wood, false);
          box(gw, o[1] + 0.04, o[2], o[3], lz, 0.08, T + 0.04, wood, false);
        }
        a = o[1];
      }
    };
    const wallZ = (lx, holes) => {
      let a = -d / 2 + T;
      for (const o of [...holes, [d / 2 - T, d / 2 - T, 0, 0]]) {
        if (o[0] > a) box(gw, lx, fy, top, (a + o[0]) / 2, T, o[0] - a, col);
        if (o[1] > o[0]) {
          box(gw, lx, fy, o[2], (o[0] + o[1]) / 2, T, o[1] - o[0], col);
          box(gw, lx, o[3], top, (o[0] + o[1]) / 2, T, o[1] - o[0], col, false);
          box(gw, lx, o[2] - 0.05, o[2], (o[0] + o[1]) / 2, T + 0.08, o[1] - o[0] + 0.1, wood, false);
        }
        a = o[1];
      }
    };
    const dw = 0.56;
    const dh = fy + 2.15;
    const win = h.black ? [] : [[-0.6, 0.6, fy + 0.9, fy + 1.95]];
    wallX(d / 2 - T / 2, [[-dw, dw, fy, dh]]);
    wallX(-d / 2 + T / 2, h.black ? [] : [[-w / 4 - 0.5, -w / 4 + 0.5, fy + 0.9, fy + 1.95]]);
    wallZ(-w / 2 + T / 2, win);
    wallZ(w / 2 - T / 2, win);
    // janelas da casa negra: tábuas pregadas
    if (h.black)
      for (const s of [-1, 1])
        for (let k = 0; k < 3; k++) box(gw, s * (w / 2 + 0.02), fy + 1.05 + k * 0.32, fy + 1.25 + k * 0.32, 0, 0.05, 1.4 - k * 0.1, wood, false);
    // piso e fundação
    box(gw, 0, -0.7, fy, 0, w, d, [0.42, 0.3, 0.28], false, 1);
    box(gw, 0, -0.25, 0.13, d / 2 + 0.35, 1.7, 0.7, [0.36, 0.27, 0.25], false);
    // oitões (triângulos da frente e do fundo)
    const ridge = 1.75;
    for (const lz of [d / 2 - T / 2, -d / 2 + T / 2]) {
      const n = lz > 0 ? 1 : -1;
      const p = (lx, y) => {
        const [x, z] = this.toWorld(h, lx, lz + n * (T / 2));
        return [x, h.y + y, z];
      };
      const nn = [h.sn * n, 0, h.cs * n];
      gw.quad([p(-w / 2, top), p(w / 2, top), p(0, top + ridge), p(0, top + ridge)], nn, [0, 0, w / 1.2, 0, w / 2.4, ridge / 1.2, w / 2.4, ridge / 1.2], null, [col, col, col, col]);
    }
    // telhado
    const ov = 0.45;
    const rc = h.black ? [0.25, 0.2, 0.28] : [0.55, 0.42, 0.5];
    for (const s of [-1, 1]) {
      const P = (lx, y, lz) => {
        const [x, z] = this.toWorld(h, lx, lz);
        return [x, h.y + y, z];
      };
      const ex = s * (w / 2 + ov);
      const ey = top - (ov / (w / 2)) * ridge;
      const pts = s > 0 ? [P(ex, ey, d / 2 + ov), P(ex, ey, -d / 2 - ov), P(0, top + ridge + 0.08, -d / 2 - ov), P(0, top + ridge + 0.08, d / 2 + ov)] : [P(ex, ey, -d / 2 - ov), P(ex, ey, d / 2 + ov), P(0, top + ridge + 0.08, d / 2 + ov), P(0, top + ridge + 0.08, -d / 2 - ov)];
      const slope = Math.hypot(w / 2 + ov, ridge);
      const nl = [s * ridge, w / 2, 0];
      const L = Math.hypot(...nl);
      const nw = [((nl[0] * h.cs) / L) * 1, nl[1] / L, (-nl[0] * h.sn) / L];
      gr.quad(pts, nw, [0, 0, (d + 2 * ov) / 2, 0, (d + 2 * ov) / 2, slope / 2, 0, slope / 2], null, [rc, rc, rc, rc]);
    }
    if (h.chimney) box(gr, w / 4, top + 0.5, top + ridge + 0.9, -d / 6, 0.6, 0.6, [0.4, 0.3, 0.32], false);
    // porta aberta (encostada na parede de dentro)
    if (!h.black && h.door) box(gw, -dw - 0.47, fy + 0.02, fy + 2.12, d / 2 - T - 0.05, 0.94, 0.05, [col[0] * 0.6, col[1] * 0.55, col[2] * 0.6], false);
    if (h.black) {
      // a casa negra não tem nada além do escuro (e não deixa entrar)
      const [x, z] = this.toWorld(h, 0, d / 2 - T / 2);
      this.colliders.push([x - dw, x + dw, z - T, z + T]);
      h.doorWorld = { x, z: z + T / 2 };
    }
  }

  // A porta negra: folha brilhante e preta, maçaneta escura, luz roxa em cima.
  makeBlackDoor() {
    const h = this.exitHouse;
    const g = new THREE.Group();
    const black = new THREE.MeshStandardMaterial({ color: 0x030304, roughness: 0.16, metalness: 0.3 });
    const knob = new THREE.MeshStandardMaterial({ color: 0x0c0c0e, roughness: 0.3, metalness: 0.8 });
    const voidM = new THREE.MeshBasicMaterial({ color: 0x000000, fog: false });
    const lampM = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 0.8, 3.0) });
    const pivot = new THREE.Group();
    pivot.position.set(-0.53, 0, 0);
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(1.06, 2.13, 0.06), black);
    leaf.position.set(0.53, 1.065, 0);
    const kb = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), knob);
    kb.position.set(0.95, 1.0, 0.05);
    pivot.add(leaf, kb);
    // o interior: só escuro
    const dark = new THREE.Mesh(new THREE.BoxGeometry(h.w - 2 * T - 0.04, H, h.d - 2 * T - 0.04), voidM);
    dark.position.set(0, H / 2 + 0.01, -h.d / 2 + T / 2);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.1, 0.12), lampM);
    lamp.position.set(0, 2.55, 0.12);
    g.add(pivot, dark, lamp);
    this.lampLight = new THREE.PointLight(0xc070ff, 5, 9, 1.6);
    this.lampLight.position.set(0, 2.4, 0.6);
    g.add(this.lampLight);
    g.position.set(h.doorWorld.x, h.floor, h.doorWorld.z - 0.06);
    this.dynamic.add(g);
    this.doorPivot = pivot;
    this.doorMats = [black, knob, voidM, lampM];
  }

  makeTrees() {
    const Q = this.Q;
    this.trees = [];
    const step = 5.2;
    for (let z = Z1 - 6; z < Z0 + 6; z += step)
      for (let x = -108; x < 108; x += step) {
        const px = x + (hash3(x, z, this.seed + 1) - 0.5) * step * 0.9;
        const pz = z + (hash3(x, z, this.seed + 2) - 0.5) * step * 0.9;
        const dt = Math.abs(px - trailX(pz));
        if (dt < 3.2 + hash3(px, pz, 5) * 2.5) continue;
        if (dt > HALF + 22) continue;
        const dens = fbm(px * 0.025, pz * 0.025, 3, this.seed + 7);
        if (dens < -0.28) continue; // clareiras
        if (hash3(px, pz, this.seed + 3) > 0.58 + dens * 0.5) continue;
        if (Math.hypot(px - this.spawn.x, pz - this.spawn.z) < 5) continue;
        let skip = false;
        for (const c of this.houses) if (Math.abs(px - c.x) < c.hx + 4 && Math.abs(pz - c.z) < c.hz + 4) skip = true;
        if (skip) continue;
        const s = 0.8 + hash3(px, pz, 9) * 0.55;
        this.trees.push({ x: px, z: pz, y: baseH(px, pz), s, rot: hash3(px, pz, 11) * TAU, v: Math.floor(hash3(px, pz, 13) * 4), r: 0.3 * s, hue: hash3(px, pz, 17) });
      }
    // colisão em grade de 8 m
    this.tgrid = new Map();
    for (const t of this.trees) {
      const k = Math.floor(t.x / 8) * 10000 + Math.floor(t.z / 8);
      let a = this.tgrid.get(k);
      if (!a) this.tgrid.set(k, (a = []));
      a.push(t);
    }
    const low = Q.id === 'low';
    this.nearGeo = [0, 1, 2, 3].map((i) => redTreeGeometry(140 + i * 7, low ? 1 : 2));
    this.farGeo = [0, 1, 2, 3].map((i) => redTreeGeometry(140 + i * 7, Q.id === 'high' || Q.id === 'ultra' ? 1 : 0));
    this.leafMap = leafTex();
    this.treeMat = new THREE.MeshStandardMaterial({ map: this.leafMap, vertexColors: true, roughness: 0.85, emissive: new THREE.Color(0.08, 0.004, 0.012) });
    const mk = (geo, cap, cast) => {
      const m = new THREE.InstancedMesh(geo, this.treeMat, cap);
      m.count = 0;
      m.frustumCulled = false;
      m.castShadow = cast && Q.shadows;
      m.receiveShadow = Q.shadows;
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
      this.scene.add(m);
      return m;
    };
    this.nearMeshes = this.nearGeo.map((g) => mk(g, 160, true));
    this.farMeshes = this.farGeo.map((g) => mk(g, 600, false));
    this.nearR = { low: 26, medium: 36, high: 46, ultra: 56 }[Q.id] || 36;
    this.farR = { low: 80, medium: 100, high: 115, ultra: 130 }[Q.id] || 100;
  }

  treesNear(x, z, r) {
    const out = [];
    for (let i = Math.floor((x - r) / 8); i <= Math.floor((x + r) / 8); i++)
      for (let j = Math.floor((z - r) / 8); j <= Math.floor((z + r) / 8); j++) {
        const a = this.tgrid.get(i * 10000 + j);
        if (a) for (const t of a) if (Math.abs(t.x - x) < r && Math.abs(t.z - z) < r) out.push(t);
      }
    return out;
  }

  refreshTrees(px, pz) {
    const nc = [0, 0, 0, 0];
    const fc = [0, 0, 0, 0];
    for (const t of this.trees) {
      const dx = t.x - px;
      const dz = t.z - pz;
      if (Math.abs(dx) > this.farR || Math.abs(dz) > this.farR) continue;
      const d = Math.hypot(dx, dz);
      if (d > this.farR) continue;
      let m;
      let i;
      if (d < this.nearR && nc[t.v] < 160) {
        m = this.nearMeshes[t.v];
        i = nc[t.v]++;
      } else if (fc[t.v] < 600) {
        m = this.farMeshes[t.v];
        i = fc[t.v]++;
      } else continue;
      _m.compose(_v.set(t.x, t.y - 0.1, t.z), _q.setFromEuler(_e.set(0, t.rot, 0)), _s.setScalar(t.s));
      m.setMatrixAt(i, _m);
      m.setColorAt(i, _c.setRGB(0.85 + t.hue * 0.35, 0.75 + t.hue * 0.5, 0.85 + (1 - t.hue) * 0.3));
    }
    const upd = (arr, cnt) =>
      arr.forEach((m, i) => {
        m.count = cnt[i];
        m.instanceMatrix.needsUpdate = true;
        m.instanceColor.needsUpdate = true;
      });
    upd(this.nearMeshes, nc);
    upd(this.farMeshes, fc);
  }

  // Flores que brilham: aglomerados roxos e rosa nas bordas da trilha e nas clareiras.
  makeFlowers() {
    const r = mulberry32(this.seed + 21);
    const list = [];
    for (let z = Z0; z > Z1; z -= 2.2) {
      for (const side of [-1, 1]) {
        if (r() < 0.35) continue;
        const cx = trailX(z) + side * (1.8 + r() * 4);
        const n = 2 + Math.floor(r() * 6);
        for (let k = 0; k < n; k++) list.push([cx + (r() - 0.5) * 1.6, z + (r() - 0.5) * 1.6, r()]);
      }
    }
    for (let k = 0; k < 900; k++) {
      const z = Z1 + r() * (Z0 - Z1);
      const x = trailX(z) + (r() - 0.5) * 2 * HALF;
      if (fbm(x * 0.025, z * 0.025, 3, this.seed + 7) > -0.15) continue;
      for (let j = 0; j < 6; j++) list.push([x + (r() - 0.5) * 3, z + (r() - 0.5) * 3, r()]);
    }
    const ok = list.filter(([x, z]) => !this.houseAt(x, z, -0.6) && Math.abs(x - trailX(z)) > 1.6);
    const geo = new THREE.OctahedronGeometry(0.05, 0);
    const stem = new THREE.CylinderGeometry(0.008, 0.01, 0.3, 4, 1, true).translate(0, -0.15, 0);
    this.flowerMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.stemMat = new THREE.MeshLambertMaterial({ color: 0x2a0c34 });
    const fm = new THREE.InstancedMesh(geo, this.flowerMat, ok.length);
    const sm = new THREE.InstancedMesh(stem, this.stemMat, ok.length);
    ok.forEach(([x, z, h], i) => {
      const y = this.groundH(x, z) + 0.22 + h * 0.15;
      _m.compose(_v.set(x, y, z), _q.setFromEuler(_e.set(h * 2, h * 9, 0)), _s.setScalar(0.7 + h * 0.7));
      fm.setMatrixAt(i, _m);
      _m.compose(_v.set(x, y, z), _q.identity(), _s.set(1, 0.7 + h * 0.7, 1));
      sm.setMatrixAt(i, _m);
      if (h < 0.55) _c.setRGB(1.1 + h * 0.6, 0.22, 1.6);
      else if (h < 0.85) _c.setRGB(1.6, 0.25, 0.8);
      else _c.setRGB(0.4, 0.6, 1.7);
      fm.setColorAt(i, _c);
    });
    fm.frustumCulled = sm.frustumCulled = false;
    this.scene.add(fm, sm);
    this.flowers = fm;
    this.stems = sm;
  }

  // Tufos de capim roxo em volta do jogador.
  makeGrass() {
    const Q = this.Q;
    this.bladeMap = bladeTex();
    const g = new THREE.BufferGeometry();
    const pos = [];
    const nor = [];
    const uv = [];
    for (const a of [0, Math.PI / 3, (2 * Math.PI) / 3]) {
      const cx = Math.cos(a) * 0.32;
      const cz = Math.sin(a) * 0.32;
      const P = [
        [-cx, 0, -cz],
        [cx, 0, cz],
        [cx, 0.5, cz],
        [-cx, 0, -cz],
        [cx, 0.5, cz],
        [-cx, 0.5, -cz],
      ];
      const U = [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 0],
        [1, 1],
        [0, 1],
      ];
      for (let i = 0; i < 6; i++) {
        pos.push(...P[i]);
        nor.push(0, 1, 0);
        uv.push(...U[i]);
      }
    }
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    this.grassGeo = g;
    this.grassMat = new THREE.MeshStandardMaterial({ map: this.bladeMap, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 1, color: 0xd8b8e8 });
    this.grassR = Q.id === 'low' ? 14 : Q.id === 'medium' ? 20 : 26;
    const n = Math.ceil((this.grassR * 2) / 1.5) ** 2;
    this.grass = new THREE.InstancedMesh(g, this.grassMat, n);
    this.grass.count = 0;
    this.grass.frustumCulled = false;
    this.scene.add(this.grass);
  }

  refreshGrass(px, pz) {
    const c = 1.5;
    const R = this.grassR;
    let n = 0;
    for (let i = Math.floor((px - R) / c); i <= Math.floor((px + R) / c); i++)
      for (let j = Math.floor((pz - R) / c); j <= Math.floor((pz + R) / c); j++) {
        const x = (i + hash3(i, j, 31)) * c;
        const z = (j + hash3(i, j, 32)) * c;
        if ((x - px) ** 2 + (z - pz) ** 2 > R * R) continue;
        if (Math.abs(x - trailX(z)) < 1.7 || this.houseAt(x, z, -0.8)) continue;
        if (n >= this.grass.instanceMatrix.count) break;
        const s = 0.7 + hash3(i, j, 33) * 0.8;
        _m.compose(_v.set(x, this.groundH(x, z) - 0.03, z), _q.setFromEuler(_e.set(0, hash3(i, j, 34) * TAU, 0)), _s.set(s, s * (0.8 + hash3(i, j, 35) * 0.6), s));
        this.grass.setMatrixAt(n++, _m);
      }
    this.grass.count = n;
    this.grass.instanceMatrix.needsUpdate = true;
  }

  // Pontinhos de luz roxa flutuando e folhas vermelhas caindo.
  makeParticles() {
    const r = mulberry32(this.seed + 41);
    this.dot = dotTex();
    const mk = (n, color, size, blending) => {
      const g = new THREE.BufferGeometry();
      const p = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        p[i * 3] = (r() - 0.5) * 50;
        p[i * 3 + 1] = r() * 12;
        p[i * 3 + 2] = (r() - 0.5) * 50;
      }
      g.setAttribute('position', new THREE.BufferAttribute(p, 3));
      const m = new THREE.PointsMaterial({ map: this.dot, color, size, transparent: true, depthWrite: false, blending, sizeAttenuation: true });
      const pts = new THREE.Points(g, m);
      pts.frustumCulled = false;
      this.scene.add(pts);
      return pts;
    };
    this.motes = mk(this.Q.id === 'low' ? 220 : 420, new THREE.Color(1.8, 0.7, 2.6), 0.13, THREE.AdditiveBlending);
    this.leaves = mk(this.Q.id === 'low' ? 90 : 180, new THREE.Color(0.75, 0.05, 0.07), 0.11, THREE.NormalBlending);
    this.phase = Array.from({ length: 420 }, () => r() * TAU);
  }

  updateParticles(dt, cam) {
    const t = this.time;
    const wrap = (v, c, half) => c + ((((v - c + half) % (2 * half)) + 2 * half) % (2 * half)) - half;
    const mp = this.motes.geometry.attributes.position;
    for (let i = 0; i < mp.count; i++) {
      const ph = this.phase[i % this.phase.length];
      let x = mp.getX(i) + Math.sin(t * 0.3 + ph) * dt * 0.4;
      let y = mp.getY(i) + Math.sin(t * 0.5 + ph * 2) * dt * 0.25 + dt * 0.08;
      let z = mp.getZ(i) + Math.cos(t * 0.27 + ph) * dt * 0.4;
      x = wrap(x, cam.x, 25);
      z = wrap(z, cam.z, 25);
      if (y > cam.y + 9) y -= 11;
      if (y < cam.y - 2) y += 11;
      mp.setXYZ(i, x, y, z);
    }
    mp.needsUpdate = true;
    const lp = this.leaves.geometry.attributes.position;
    for (let i = 0; i < lp.count; i++) {
      const ph = this.phase[i];
      let x = lp.getX(i) + (Math.sin(t * 1.3 + ph) * 0.5 + 0.25) * dt;
      let y = lp.getY(i) - dt * (0.45 + (ph % 1) * 0.3);
      let z = lp.getZ(i) + Math.cos(t * 1.1 + ph) * 0.4 * dt;
      x = wrap(x, cam.x, 25);
      z = wrap(z, cam.z, 25);
      if (y < this.groundH(x, z)) y += 9 + (ph % 1) * 3;
      lp.setXYZ(i, x, y, z);
    }
    lp.needsUpdate = true;
  }

  // Placa no começo da trilha.
  makeSign() {
    const x = this.spawn.x + 1.8;
    const z = this.spawn.z - 3;
    const y = this.groundH(x, z);
    this.signMap = signTex('↑  300 m');
    const wood = new THREE.MeshStandardMaterial({ color: 0x3a2620, roughness: 0.9 });
    const board = new THREE.MeshStandardMaterial({ map: this.signMap, roughness: 0.85 });
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.7, 0.1), wood);
    post.position.set(x, y + 0.85, z);
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.32, 0.04), [wood, wood, wood, wood, board, board]);
    b.position.set(x, y + 1.45, z + 0.06);
    b.rotation.y = -0.35;
    this.dynamic.add(post, b);
    this.colliders.push([x - 0.08, x + 0.08, z - 0.08, z + 0.08]);
    this.signMats = [wood, board];
  }

  spawnItems() {
    const g = this.game;
    const at = (k, z, off, type, extra = {}) => {
      const x = trailX(z) + off;
      return { type, key: 'l14:' + k, x, z, y: this.groundH(x, z) + 0.03, light: 0.6, ...extra };
    };
    const items = [
      at('n1', -14, 1.6, 'note', { rot: 0.5 }),
      at('n2', -120, -1.7, 'note', { rot: 2.2 }),
      at('n3', -228, 1.8, 'note', { rot: 1.1 }),
      at('w1', -88, -1.9, 'water'),
      at('w2', -190, 1.9, 'water'),
    ];
    for (const it of items) if (!this.taken.has(it.key)) g.items.spawn(it, this.dynamic);
  }

  // ------------------------------------------------------------ quadro
  update(dt, player) {
    const g = this.game;
    const p = player.pos;
    const cam = g.camera.position;
    this.time += dt;
    this.sky.position.copy(cam);
    this.sky.material.uniforms.uTime.value = this.time;
    this.updateSun(p);
    if (!this.lastP || Math.hypot(p.x - this.lastP.x, p.z - this.lastP.z) > 3) {
      this.lastP = { x: p.x, z: p.z };
      this.refreshTrees(p.x, p.z);
      this.refreshGrass(p.x, p.z);
    }
    this.updateParticles(dt, cam);
    // flores pulsando devagar
    const pulse = 0.85 + Math.sin(this.time * 0.9) * 0.15;
    this.flowerMat.color.setScalar(pulse);
    this.lampLight.intensity = 5 + Math.sin(this.time * 3.1) * 0.6 + Math.sin(this.time * 7.7) * 0.4;
    // música: começa assim que estiver carregada; desacelera perto da porta negra
    const a = g.audio;
    if (!this.track && a.ready) {
      if (a.B.l14) this.track = a.startTrack('l14', 0.6, 3);
      else if (!this.loading) {
        this.loading = true;
        a.loadTrack('l14', 'assets/audio/l14_apathy.m4a');
      }
    }
    const dd = Math.hypot(p.x - this.door.x, p.z - this.door.z);
    if (this.track && (this.rateT = (this.rateT || 0) + dt) > 0.3) {
      this.rateT = 0;
      const k = clamp((dd - 5) / 45, 0, 1);
      this.track.src.playbackRate.setTargetAtTime(0.8 + 0.2 * k, a.ctx.currentTime, 0.6);
    }
    // casas vazias
    const h = this.houseAt(p.x, p.z, 0.3);
    if (h && !h.black && !this.visited.has(h.idx)) {
      this.visited.add(h.idx);
      const msgs = [
        'A porta está aberta. Dentro, nada: nem móveis, nem poeira, nem marcas na parede.',
        'Outra casa vazia. O chão range, mas não tem nada para ranger embaixo.',
        'Vazia. Parece que ninguém nunca morou aqui — é só a ideia de uma casa.',
        'Vazia de novo. Lá fora, a música continua tocando de lugar nenhum.',
      ];
      g.hud.message(msgs[(this.visited.size - 1) % msgs.length], 5);
    }
    // o paraíso cansa: a sanidade cai devagar fora da trilha, mais perto da porta negra
    const offTrail = Math.abs(p.x - trailX(p.z)) > 6;
    this.sanityExtra = (offTrail ? 0.05 : 0) + (dd < 20 ? 0.12 : 0);
    if (p.z < END_Z + 45 && !g.objectiveDone('trilha')) g.completeObjective('trilha', 'No fim da trilha, uma casa escura. A porta é preta como um buraco.');
    if (!this.toldStart && this.time > 4) {
      this.toldStart = true;
      g.hud.message('O ar é doce demais. Tudo brilha em roxo, e as árvores são vermelhas como carne.', 6);
    }
    // a porta negra abrindo para dentro do escuro
    if (this.opening) {
      this.openK = Math.min(1, this.openK + dt * 0.8);
      this.doorPivot.rotation.y = smoothstep(0, 1, this.openK) * 1.7;
    }
  }

  collide(p, r) {
    p.z = clamp(p.z, Z1 + 10, Z0 - 6);
    const tx = trailX(p.z);
    p.x = clamp(p.x, tx - HALF + 6, tx + HALF - 6);
    for (let it = 0; it < 2; it++) {
      for (const t of this.treesNear(p.x, p.z, 2)) {
        const dx = p.x - t.x;
        const dz = p.z - t.z;
        const d = Math.hypot(dx, dz);
        const rr = r + t.r;
        if (d < rr && d > 1e-4) {
          p.x = t.x + (dx / d) * rr;
          p.z = t.z + (dz / d) * rr;
        }
      }
      for (const b of this.colliders) if (p.x > b[0] - 2 && p.x < b[1] + 2 && p.z > b[2] - 2 && p.z < b[3] + 2) pushCircle(p, r, b[0], b[1], b[2], b[3]);
    }
    return p;
  }

  groundY(x, z) {
    const h = this.houseAt(x, z, -0.1);
    if (h) return h.floor;
    return this.groundH(x, z);
  }

  surfaceAt(x, z) {
    if (this.houseAt(x, z, -0.1)) return 'wood';
    if (Math.abs(x - trailX(z)) < 1.5) return 'dirt';
    return 'grass';
  }

  lightLevel(x, z) {
    return this.houseAt(x, z) ? 0.4 : 0.75;
  }

  interactable(player) {
    const p = player.pos;
    const d = this.exitHouse.doorWorld;
    const dz = p.z - d.z;
    if (!this.opening && Math.abs(p.x - d.x) < 1.0 && dz > 0 && dz < 1.8) {
      return {
        label: 'Abrir a porta negra',
        action: () => {
          const g = this.game;
          this.opening = true;
          this.openK = 0;
          g.audio.play('creak', { gain: 0.35, rate: 0.55, wet: 0.6 });
          g.audio.play('whisper', { gain: 0.15, rate: 0.6, wet: 1.2 });
          if (!g.objectiveDone('trilha')) g.completeObjective('trilha');
          g.completeObjective('porta', 'A porta abre para dentro de um escuro sem fundo. Você entra.');
          g.reachExit('door', 1.6);
        },
      };
    }
    return null;
  }

  navTarget() {
    return this.exit;
  }

  exitEmitter() {
    return { x: this.door.x, y: 1.5, z: this.door.z - 1, sound: 'wind', gain: 0.25 };
  }

  dispose() {
    super.dispose();
    const objs = [this.sky, this.ground, this.houseMesh, this.roofMesh, ...this.nearMeshes, ...this.farMeshes, this.flowers, this.stems, this.grass, this.motes, this.leaves];
    for (const o of objs) {
      this.scene.remove(o);
      if (o.geometry) o.geometry.dispose();
      if (o.dispose && o.isInstancedMesh) o.dispose();
    }
    for (const g of [...this.nearGeo, ...this.farGeo]) g.dispose();
    this.dynamic.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
    });
    for (const m of [this.sky.material, this.ground.material, this.wallMat, this.roofMat, this.treeMat, this.flowerMat, this.stemMat, this.grassMat, this.motes.material, this.leaves.material, ...this.doorMats, ...this.signMats]) m.dispose();
    for (const t of [this.grassMap, this.bladeMap, this.dot, this.signMap, this.leafMap]) t.dispose();
    this.scene.remove(this.hemi, this.sun, this.sun.target);
  }
}
