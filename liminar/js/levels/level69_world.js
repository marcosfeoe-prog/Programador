// Nível 69 — o mundo: ilhas flutuantes (forma, chão, pontes), texturas de
// azulejo, céu de pôr do sol dreamcore, mar de nuvens lá embaixo e as ilhas
// enfeitadas que boiam ao longe.
import * as THREE from 'three';
import { SKY_GLSL } from './outdoor.js';
import { TEX } from '../textures.js';
import { clamp, lerp, mulberry32, TAU } from '../util.js';

export const SUN = new THREE.Vector3(0.62, 0.14, -0.77).normalize();

// Ilhas onde dá para andar. y = altura do gramado.
export const ISLANDS = [
  { id: 'A', x: 0, z: 0, r: 46, y: 0, s: 1.3 },
  { id: 'B', x: -40, z: -96, r: 25, y: 1.8, s: 2.7 },
  { id: 'C', x: 20, z: -164, r: 21, y: 3.6, s: 4.1 },
  { id: 'D', x: -8, z: -236, r: 18, y: 5.4, s: 5.9 },
];

export const BRIDGE_HW = 1.3;

function edgePoint(a, b, inset) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const d = Math.hypot(dx, dz);
  const ux = dx / d;
  const uz = dz / d;
  const th = Math.atan2(uz, ux);
  const R = islandR(a, th) - inset;
  return { x: a.x + ux * R, z: a.z + uz * R };
}

// Pontes entre as ilhas (começam e terminam alguns metros dentro de cada uma).
export const BRIDGES = [];
function makeBridges() {
  for (let i = 0; i < ISLANDS.length - 1; i++) {
    const a = ISLANDS[i];
    const b = ISLANDS[i + 1];
    const p0 = edgePoint(a, b, 3.5);
    const p1 = edgePoint(b, a, 3.5);
    const dx = p1.x - p0.x;
    const dz = p1.z - p0.z;
    const len = Math.hypot(dx, dz);
    BRIDGES.push({ x0: p0.x, z0: p0.z, x1: p1.x, z1: p1.z, y0: a.y, y1: b.y, len, ux: dx / len, uz: dz / len });
  }
}

// Contorno irregular de cada ilha.
export function islandR(I, th) {
  const s = I.s;
  return I.r * (1 + 0.09 * Math.sin(3 * th + s) + 0.05 * Math.sin(5 * th + s * 2.1) + 0.025 * Math.sin(11 * th + s * 3.3));
}

makeBridges();

// Ponto numa ponte? Devolve { b, t, lat, y } ou null.
export function onBridge(x, z, margin = 0) {
  for (const b of BRIDGES) {
    const px = x - b.x0;
    const pz = z - b.z0;
    const along = px * b.ux + pz * b.uz;
    const t = along / b.len;
    if (t < 0 || t > 1) continue;
    const lat = -px * b.uz + pz * b.ux;
    if (Math.abs(lat) > BRIDGE_HW + margin) continue;
    return { b, t, lat, y: bridgeY(b, t) };
  }
  return null;
}

export function bridgeY(b, t) {
  return lerp(b.y0, b.y1, t) + Math.sin(Math.PI * t) * 0.9;
}

// Em qual ilha (com margem até a borda)?
export function onIsland(x, z, margin = 0.4) {
  for (const I of ISLANDS) {
    const dx = x - I.x;
    const dz = z - I.z;
    const d = Math.hypot(dx, dz);
    if (d > I.r * 1.2) continue;
    if (d < islandR(I, Math.atan2(dz, dx)) - margin) return I;
  }
  return null;
}

// Distância até a borda da ilha (positiva = dentro).
export function edgeDist(I, x, z) {
  const dx = x - I.x;
  const dz = z - I.z;
  return islandR(I, Math.atan2(dz, dx)) - Math.hypot(dx, dz);
}

// ------------------------------------------------------------ texturas
// Azulejo quadrado com rejunte (como na foto): base, cor do rejunte, nº por lado.
export function tileTex(S, base, grout, n = 8, seed = 69) {
  const c = TEX.makeCanvas(S, S);
  const x = c.getContext('2d');
  const r = mulberry32(seed);
  x.fillStyle = grout;
  x.fillRect(0, 0, S, S);
  const t = S / n;
  const gw = Math.max(1.5, S / 256);
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      const v = (r() - 0.5) * 10;
      const g = x.createLinearGradient(i * t, j * t, i * t + t, j * t + t);
      g.addColorStop(0, shade(base, v + 4));
      g.addColorStop(1, shade(base, v - 3));
      x.fillStyle = g;
      x.fillRect(i * t + gw, j * t + gw, t - gw * 2, t - gw * 2);
      // brilho do esmalte
      x.fillStyle = 'rgba(255,255,255,0.06)';
      x.fillRect(i * t + gw * 2, j * t + gw * 2, t * 0.5, t * 0.18);
    }
  return TEX.toTex(c);
}

function shade(hex, v) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c) => clamp(Math.round(c + v), 0, 255);
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

export function grassTex(S) {
  const c = TEX.makeCanvas(S, S);
  const x = c.getContext('2d');
  x.fillStyle = '#8cbc72';
  x.fillRect(0, 0, S, S);
  const r = mulberry32(6969);
  const k = S / 512;
  const n = Math.floor((S * S) / 70);
  for (let i = 0; i < n; i++) {
    const px = r() * S;
    const py = r() * S;
    const len = (3 + r() * 6) * k;
    const a = -Math.PI / 2 + (r() - 0.5) * 1.2;
    x.strokeStyle = `hsl(${88 + r() * 40},${32 + r() * 25}%,${38 + r() * 26}%)`;
    x.lineWidth = (0.7 + r() * 1.1) * k;
    x.beginPath();
    x.moveTo(px, py);
    x.lineTo(px + Math.cos(a) * len, py + Math.sin(a) * len);
    x.stroke();
  }
  for (let i = 0; i < 70 * k * k; i++) {
    x.fillStyle = r() < 0.5 ? '#fff4fa' : r() < 0.6 ? '#ffc4e0' : '#fff2b0';
    x.beginPath();
    x.arc(r() * S, r() * S, (0.9 + r() * 1.3) * k, 0, TAU);
    x.fill();
  }
  return TEX.toTex(c);
}

export function rockTex(S) {
  const c = TEX.makeCanvas(S, S);
  const x = c.getContext('2d');
  x.fillStyle = '#8a7a80';
  x.fillRect(0, 0, S, S);
  const r = mulberry32(691);
  for (let i = 0; i < 900; i++) {
    const w = (6 + r() * 40) * (S / 512);
    const h = w * (0.2 + r() * 0.4);
    x.fillStyle = `rgba(${90 + r() * 70},${70 + r() * 60},${80 + r() * 60},${0.15 + r() * 0.25})`;
    x.fillRect(r() * S, r() * S, w, h);
  }
  for (let i = 0; i < 60; i++) {
    x.strokeStyle = `rgba(40,25,40,${0.15 + r() * 0.2})`;
    x.lineWidth = 1 + r() * 2;
    x.beginPath();
    const y = r() * S;
    x.moveTo(0, y);
    for (let k = 0; k <= 8; k++) x.lineTo((k / 8) * S, y + (r() - 0.5) * 18);
    x.stroke();
  }
  return TEX.toTex(c);
}

export function bladeTex() {
  const S = 128;
  const c = TEX.makeCanvas(S, S);
  const x = c.getContext('2d');
  const r = mulberry32(692);
  for (let i = 0; i < 36; i++) {
    const bx = 8 + r() * (S - 16);
    const h = S * (0.35 + r() * 0.6);
    const lean = (r() - 0.5) * 28;
    const w = 2 + r() * 3;
    const g = x.createLinearGradient(0, S, 0, S - h);
    const hue = 85 + r() * 40;
    g.addColorStop(0, `hsl(${hue},38%,26%)`);
    g.addColorStop(1, `hsl(${hue},${40 + r() * 25}%,${52 + r() * 18}%)`);
    x.fillStyle = g;
    x.beginPath();
    x.moveTo(bx - w, S);
    x.quadraticCurveTo(bx + lean * 0.3, S - h * 0.6, bx + lean, S - h);
    x.quadraticCurveTo(bx + lean * 0.3 + w * 0.3, S - h * 0.6, bx + w, S);
    x.fill();
  }
  return TEX.toTex(c, { repeat: false });
}

export function glowTex() {
  const S = 128;
  const c = TEX.makeCanvas(S, S);
  const x = c.getContext('2d');
  const g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,240,220,0.55)');
  g.addColorStop(1, 'rgba(255,220,200,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, S, S);
  return TEX.toTex(c, { repeat: false });
}

// ------------------------------------------------------------ geometria das ilhas
// Topo (gramado) e o corpo de pedra que afina para baixo, como um pião.
export function islandGeos(I, seg = 96, rings = 9) {
  const r = mulberry32(Math.floor(I.s * 1000));
  // topo
  const top = new THREE.BufferGeometry();
  const tp = [];
  const tu = [];
  const ti = [];
  tp.push(I.x, I.y, I.z);
  tu.push(I.x / 4, I.z / 4);
  for (let k = 1; k <= rings; k++) {
    const f = k / rings;
    for (let i = 0; i < seg; i++) {
      const th = (i / seg) * TAU;
      const R = islandR(I, th) * f;
      const x = I.x + Math.cos(th) * R;
      const z = I.z + Math.sin(th) * R;
      // a borda desce um pouquinho (arredondada)
      const y = I.y - (f > 0.97 ? 0.12 : 0);
      tp.push(x, y, z);
      tu.push(x / 4, z / 4);
    }
  }
  for (let i = 0; i < seg; i++) ti.push(0, 1 + ((i + 1) % seg), 1 + i);
  for (let k = 1; k < rings; k++) {
    const a0 = 1 + (k - 1) * seg;
    const b0 = 1 + k * seg;
    for (let i = 0; i < seg; i++) {
      const i1 = (i + 1) % seg;
      ti.push(a0 + i, a0 + i1, b0 + i1, a0 + i, b0 + i1, b0 + i);
    }
  }
  top.setAttribute('position', new THREE.Float32BufferAttribute(tp, 3));
  top.setAttribute('uv', new THREE.Float32BufferAttribute(tu, 2));
  top.setIndex(ti);
  top.computeVertexNormals();
  // corpo de pedra
  const body = new THREE.BufferGeometry();
  const bp = [];
  const bu = [];
  const bc = [];
  const bi = [];
  const depth = I.r * (0.95 + r() * 0.4);
  const levels = 14;
  const jit = [];
  for (let i = 0; i < seg; i++) jit.push(r());
  for (let L = 0; L <= levels; L++) {
    for (let i = 0; i <= seg; i++) {
      const ii = i % seg;
      const th = (ii / seg) * TAU;
      let R = islandR(I, th);
      let y;
      if (L === 0) y = I.y - 0.12;
      else if (L === 1) {
        R *= 1.012;
        y = I.y - 0.7;
      } else {
        const v = (L - 1) / (levels - 1);
        const prof = Math.pow(1 - v, 1.25) * (0.92 + 0.08 * Math.sin(th * 7 + L));
        const spike = 1 + (jit[ii] - 0.5) * 0.35 * v;
        R *= prof * (1 - 0.15 * v * jit[(ii + 7) % seg]);
        y = I.y - 0.7 - v * depth * spike;
      }
      const x = I.x + Math.cos(th) * R;
      const z = I.z + Math.sin(th) * R;
      bp.push(x, y, z);
      bu.push((i / seg) * I.r * 0.6, (y - I.y) / 4);
      // terra marrom no alto, lavanda no fundo (luz do céu)
      const k = clamp((I.y - y) / depth, 0, 1);
      const c = L === 0 ? [0.42, 0.52, 0.3] : [lerp(0.78, 0.62, k), lerp(0.6, 0.52, k), lerp(0.55, 0.78, k)];
      bc.push(...c);
    }
  }
  const W = seg + 1;
  for (let L = 0; L < levels; L++)
    for (let i = 0; i < seg; i++) {
      const a = L * W + i;
      const b = (L + 1) * W + i;
      bi.push(a, a + 1, b, a + 1, b + 1, b);
    }
  body.setAttribute('position', new THREE.Float32BufferAttribute(bp, 3));
  body.setAttribute('uv', new THREE.Float32BufferAttribute(bu, 2));
  body.setAttribute('color', new THREE.Float32BufferAttribute(bc, 3));
  body.setIndex(bi);
  body.computeVertexNormals();
  return { top, body };
}

// ------------------------------------------------------------ céu
const SKY_VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = position;
    vec4 p = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
    gl_Position = p.xyww;
  }`;
const SKY_FRAG = /* glsl */ `
  uniform vec3 uSun;
  uniform float uTime, uGlow;
  varying vec3 vDir;
  ${SKY_GLSL}
  void main() {
    vec3 d = normalize( vDir );
    float h = d.y;
    float hp = clamp( h, 0.0, 1.0 );
    // lavanda no alto, rosa no meio, pêssego no horizonte
    vec3 zen = vec3( 0.46, 0.37, 0.74 );
    vec3 mid = vec3( 0.9, 0.52, 0.72 );
    vec3 hor = vec3( 1.0, 0.64, 0.48 );
    vec3 col = mix( hor, mid, smoothstep( 0.0, 0.2, hp ) );
    col = mix( col, zen, smoothstep( 0.16, 0.75, hp ) );
    float sd = max( dot( d, uSun ), 0.0 );
    // sol baixo, enorme e macio
    col += vec3( 1.0, 0.62, 0.34 ) * pow( sd, 5.0 ) * 0.42 * uGlow;
    col += vec3( 1.0, 0.8, 0.55 ) * pow( sd, 60.0 ) * 0.9;
    col += vec3( 1.2, 1.0, 0.82 ) * smoothstep( 0.9988, 0.9994, sd ) * 1.6;
    // fiapos de nuvem cor-de-rosa
    vec2 cp = d.xz / max( h + 0.08, 0.03 ) * 0.4 + vec2( uTime * 0.003, uTime * 0.001 );
    float n = sFbm( cp * vec2( 0.7, 2.2 ) );
    float a = smoothstep( 0.55, 0.8, n ) * smoothstep( 0.02, 0.14, h ) * ( 1.0 - smoothstep( 0.45, 0.8, h ) );
    vec3 cc = mix( vec3( 0.98, 0.7, 0.8 ), vec3( 1.1, 0.86, 0.7 ), pow( sd, 2.0 ) );
    col = mix( col, cc, a * 0.75 );
    // abaixo do horizonte: a névoa sobre o mar de nuvens
    col = mix( col, vec3( 0.88, 0.6, 0.7 ), smoothstep( 0.0, -0.12, h ) );
    gl_FragColor = vec4( col, 1.0 );
  }`;

export function makeSky() {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uSun: { value: SUN.clone() }, uTime: { value: 0 }, uGlow: { value: 1 } },
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(3000, 32, 16), mat);
  m.frustumCulled = false;
  m.renderOrder = -10;
  return m;
}

// Mar de nuvens bem abaixo das ilhas.
const SEA_VERT = /* glsl */ `
  varying vec3 vW;
  void main() {
    vec4 w = modelMatrix * vec4( position, 1.0 );
    vW = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }`;
const SEA_FRAG = /* glsl */ `
  uniform vec3 uSun, uCam;
  uniform float uTime;
  varying vec3 vW;
  ${SKY_GLSL}
  void main() {
    vec2 p = vW.xz * 0.006 + vec2( uTime * 0.004, uTime * 0.002 );
    float n = sFbm( p );
    float n2 = sFbm( p * 3.1 + 7.0 );
    float puff = smoothstep( 0.25, 0.85, n + n2 * 0.25 );
    vec3 v = normalize( vW - uCam );
    float sd = max( dot( normalize( vec3( uSun.x, 0.0, uSun.z ) ), normalize( vec3( v.x, 0.0, v.z ) ) ), 0.0 );
    vec3 shadow = vec3( 0.66, 0.5, 0.74 );
    vec3 lit = vec3( 1.0, 0.8, 0.82 );
    vec3 col = mix( shadow, lit, puff );
    col += vec3( 1.0, 0.6, 0.35 ) * pow( sd, 6.0 ) * 0.35 * puff;
    float dist = length( vW.xz - uCam.xz );
    col = mix( col, vec3( 0.88, 0.6, 0.7 ), smoothstep( 600.0, 2600.0, dist ) );
    gl_FragColor = vec4( col, 1.0 );
  }`;

export function makeSea() {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uSun: { value: SUN.clone() }, uCam: { value: new THREE.Vector3() }, uTime: { value: 0 } },
    vertexShader: SEA_VERT,
    fragmentShader: SEA_FRAG,
    fog: false,
  });
  const g = new THREE.PlaneGeometry(6000, 6000, 1, 1);
  g.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(g, mat);
  m.position.y = -90;
  m.frustumCulled = false;
  m.renderOrder = -9;
  return m;
}

// Ilhas que boiam ao longe (não dá para chegar nelas).
export function farIslands(seed) {
  const r = mulberry32(seed);
  const list = [];
  let tries = 0;
  while (list.length < 20 && tries++ < 400) {
    const a = r() * TAU;
    const d = 110 + r() * 520;
    const x = Math.cos(a) * d;
    const z = -110 + Math.sin(a) * d;
    const rad = 6 + r() * 26 * (d / 600 + 0.4);
    // não pode cobrir o caminho entre as ilhas de verdade
    const near = ISLANDS.some((I) => Math.hypot(I.x - x, I.z - z) < I.r + rad + 40);
    if (near || list.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + rad + 25)) continue;
    list.push({ x, z, r: rad, y: -40 + r() * 75, s: r() * 10, houses: r() < 0.6 ? 1 + Math.floor(r() * 3) : 0, trees: Math.floor(r() * 4), ph: r() * TAU });
  }
  return list;
}
