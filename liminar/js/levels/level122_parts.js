// Nível 122 — peças: o rio (curva central e campo de distância), as flores
// com olho, folhas grandes, boias, texturas e shaders (água, céu pintado).
import * as THREE from 'three';
import { TEX } from '../textures.js';
import { SKY_GLSL } from './outdoor.js';
import { clamp, mulberry32, TAU } from '../util.js';

// ------------------------------------------------------------ o rio
// Curva Catmull-Rom amostrada a cada 0,2 m + grade de busca para distância.
export class River {
  constructor(points, halfW) {
    this.hw = halfW;
    const curve = new THREE.CatmullRomCurve3(
      points.map(([x, z]) => new THREE.Vector3(x, 0, z)),
      false,
      'centripetal',
    );
    const len = curve.getLength();
    const n = Math.ceil(len / 0.2);
    this.pts = curve.getSpacedPoints(n).map((v) => [v.x, v.z]);
    this.len = len;
    this.step = len / n;
    this.G = 2;
    this.grid = new Map();
    this.pts.forEach((p, i) => {
      const k = Math.floor(p[0] / this.G) * 10000 + Math.floor(p[1] / this.G);
      let a = this.grid.get(k);
      if (!a) this.grid.set(k, (a = []));
      a.push(i);
    });
  }

  // Distância até a linha central (e o índice do ponto mais perto).
  nearest(x, z, maxR = 8) {
    const G = this.G;
    const R = Math.ceil(maxR / G);
    const ci = Math.floor(x / G);
    const cj = Math.floor(z / G);
    let best = maxR * maxR;
    let bi = -1;
    for (let i = ci - R; i <= ci + R; i++)
      for (let j = cj - R; j <= cj + R; j++) {
        const a = this.grid.get(i * 10000 + j);
        if (!a) continue;
        for (const k of a) {
          const p = this.pts[k];
          const d = (p[0] - x) ** 2 + (p[1] - z) ** 2;
          if (d < best) {
            best = d;
            bi = k;
          }
        }
      }
    return { d: Math.sqrt(best), i: bi };
  }

  dist(x, z) {
    return this.nearest(x, z, 3).d;
  }

  // Ponto e direção na distância s ao longo do rio.
  at(s) {
    const i = clamp(Math.round(s / this.step), 0, this.pts.length - 1);
    const a = this.pts[Math.max(0, i - 1)];
    const b = this.pts[Math.min(this.pts.length - 1, i + 1)];
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const l = Math.hypot(dx, dz) || 1;
    return { x: this.pts[i][0], z: this.pts[i][1], tx: dx / l, tz: dz / l };
  }
}

// ------------------------------------------------------------ texturas
export function tileTex(S) {
  const c = TEX.makeCanvas(S, S);
  const x = c.getContext('2d');
  const n = 8;
  const t = S / n;
  const r = mulberry32(1220);
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      const l = 228 + r() * 20;
      x.fillStyle = `rgb(${l - 6},${l},${l})`;
      x.fillRect(i * t, j * t, t, t);
    }
  x.fillStyle = 'rgba(120,150,150,0.8)';
  const g = Math.max(1.5, S / 220);
  for (let i = 0; i <= n; i++) {
    x.fillRect(i * t - g / 2, 0, g, S);
    x.fillRect(0, i * t - g / 2, S, g);
  }
  return TEX.toTex(c);
}

export function soilTex(S) {
  const c = TEX.makeCanvas(S, S);
  const x = c.getContext('2d');
  x.fillStyle = '#2a4a1c';
  x.fillRect(0, 0, S, S);
  const r = mulberry32(1221);
  const k = S / 512;
  for (let i = 0; i < (S * S) / 40; i++) {
    const px = r() * S;
    const py = r() * S;
    x.strokeStyle = `hsl(${95 + r() * 30},${40 + r() * 25}%,${12 + r() * 22}%)`;
    x.lineWidth = (0.8 + r()) * k;
    x.beginPath();
    x.moveTo(px, py);
    x.lineTo(px + (r() - 0.5) * 5 * k, py - (4 + r() * 6) * k);
    x.stroke();
  }
  return TEX.toTex(c);
}

export function bladeTex() {
  const S = 128;
  const c = TEX.makeCanvas(S, S);
  const x = c.getContext('2d');
  const r = mulberry32(1222);
  for (let i = 0; i < 70; i++) {
    const bx = 4 + r() * (S - 8);
    const h = S * (0.45 + r() * 0.55);
    const lean = (r() - 0.5) * 22;
    const w = 1.2 + r() * 2;
    const g = x.createLinearGradient(0, S, 0, S - h);
    const hue = 95 + r() * 30;
    g.addColorStop(0, `hsl(${hue},45%,10%)`);
    g.addColorStop(0.6, `hsl(${hue},50%,${24 + r() * 10}%)`);
    g.addColorStop(1, `hsl(${hue},${55 + r() * 20}%,${40 + r() * 15}%)`);
    x.fillStyle = g;
    x.beginPath();
    x.moveTo(bx - w, S);
    x.quadraticCurveTo(bx + lean * 0.3, S - h * 0.6, bx + lean, S - h);
    x.quadraticCurveTo(bx + lean * 0.3 + w * 0.2, S - h * 0.6, bx + w, S);
    x.fill();
  }
  return TEX.toTex(c, { repeat: false });
}

export function wallTex(S) {
  const c = TEX.makeCanvas(S, S);
  const x = c.getContext('2d');
  x.fillStyle = '#a8c4c0';
  x.fillRect(0, 0, S, S);
  const r = mulberry32(1223);
  for (let i = 0; i < 900; i++) {
    const l = r() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(30,50,50,0.05)';
    x.fillStyle = l;
    const s = (2 + r() * 14) * (S / 512);
    x.fillRect(r() * S, r() * S, s, s);
  }
  // manchas de umidade descendo da parede
  for (let i = 0; i < 10; i++) {
    const px = r() * S;
    const g = x.createLinearGradient(0, S * 0.5, 0, S);
    g.addColorStop(0, 'rgba(40,70,60,0)');
    g.addColorStop(1, 'rgba(40,70,60,0.18)');
    x.fillStyle = g;
    x.fillRect(px, S * 0.5, (6 + r() * 20) * (S / 512), S * 0.5);
  }
  return TEX.toTex(c);
}

function eyeTex() {
  const W = 512;
  const H = 256;
  const c = TEX.makeCanvas(W, H);
  const x = c.getContext('2d');
  x.fillStyle = '#e8ebe2';
  x.fillRect(0, 0, W, H);
  const r = mulberry32(1224);
  // veias
  x.strokeStyle = 'rgba(170,60,60,0.35)';
  for (let k = 0; k < 40; k++) {
    let px = r() * W;
    let py = r() * H;
    x.lineWidth = 0.6 + r();
    x.beginPath();
    x.moveTo(px, py);
    for (let s = 0; s < 6; s++) {
      px += (r() - 0.5) * 30;
      py += (r() - 0.5) * 30;
      x.lineTo(px, py);
    }
    x.stroke();
  }
  // íris (frente da esfera: u = 0,25, v = 0,5)
  const cx = W * 0.25;
  const cy = H * 0.5;
  const g = x.createRadialGradient(cx, cy, 6, cx, cy, 52);
  g.addColorStop(0, '#0a0e1a');
  g.addColorStop(0.35, '#1a2a48');
  g.addColorStop(0.8, '#2a3a5a');
  g.addColorStop(1, '#0a0c12');
  x.fillStyle = g;
  x.beginPath();
  x.arc(cx, cy, 52, 0, TAU);
  x.fill();
  // fibras da íris
  for (let k = 0; k < 120; k++) {
    const a = r() * TAU;
    x.strokeStyle = `rgba(${120 + r() * 80},${160 + r() * 60},${220},${0.12 + r() * 0.25})`;
    x.lineWidth = 0.8;
    x.beginPath();
    x.moveTo(cx + Math.cos(a) * 18, cy + Math.sin(a) * 18);
    x.lineTo(cx + Math.cos(a) * (36 + r() * 14), cy + Math.sin(a) * (36 + r() * 14));
    x.stroke();
  }
  x.fillStyle = '#020204';
  x.beginPath();
  x.arc(cx, cy, 18, 0, TAU);
  x.fill();
  x.fillStyle = 'rgba(255,255,255,0.85)';
  x.beginPath();
  x.arc(cx - 12, cy - 14, 6, 0, TAU);
  x.fill();
  return TEX.toTex(c, { repeat: false });
}

function leafTex() {
  const S = 256;
  const c = TEX.makeCanvas(S, S);
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, S, 0);
  g.addColorStop(0, '#2f6a2a');
  g.addColorStop(0.5, '#4f9a3c');
  g.addColorStop(1, '#2f6a2a');
  x.fillStyle = g;
  x.fillRect(0, 0, S, S);
  x.strokeStyle = 'rgba(200,240,170,0.5)';
  x.lineWidth = 3;
  x.beginPath();
  x.moveTo(S / 2, 0);
  x.lineTo(S / 2, S);
  x.stroke();
  x.lineWidth = 1.4;
  for (let k = 1; k < 9; k++) {
    const y = (k / 9) * S;
    x.beginPath();
    x.moveTo(S / 2, y);
    x.quadraticCurveTo(S * 0.3, y - 10, 0, y - 30);
    x.moveTo(S / 2, y);
    x.quadraticCurveTo(S * 0.7, y - 10, S, y - 30);
    x.stroke();
  }
  return TEX.toTex(c, { repeat: false });
}

function buoyTex() {
  const c = TEX.makeCanvas(256, 32);
  const x = c.getContext('2d');
  for (let k = 0; k < 8; k++) {
    x.fillStyle = k % 2 ? '#f2f2ee' : '#d4371f';
    x.fillRect(k * 32, 0, 32, 32);
  }
  return TEX.toTex(c);
}

// ------------------------------------------------------------ flores e folhas
// Cria materiais e geometrias compartilhadas.
export class Botany {
  constructor() {
    this.eyeMap = eyeTex();
    this.leafMap = leafTex();
    this.buoyMap = buoyTex();
    this.petalMat = new THREE.MeshStandardMaterial({ color: 0xffe02a, emissive: 0x8a7a08, roughness: 0.2, metalness: 0.0 });
    this.stemMat = new THREE.MeshStandardMaterial({ color: 0x2b3a1e, roughness: 0.6 });
    this.eyeMat = new THREE.MeshStandardMaterial({ map: this.eyeMap, roughness: 0.12, emissive: 0x1a1c18 });
    this.lidMat = new THREE.MeshStandardMaterial({ color: 0xc8c8b4, roughness: 0.5 });
    this.leafMat = new THREE.MeshStandardMaterial({ map: this.leafMap, color: 0x9ae890, emissive: 0x0c2a10, roughness: 0.25, side: THREE.DoubleSide });
    this.tubeMat = new THREE.MeshStandardMaterial({ color: 0x5a2638, roughness: 0.35 });
    this.buoyMat = new THREE.MeshStandardMaterial({ map: this.buoyMap, roughness: 0.4 });
    // pétala: elipsoide achatada
    this.petalGeo = new THREE.SphereGeometry(1, 16, 10);
    this.petalGeo.scale(0.24, 0.05, 0.48).translate(0, 0, 0.5);
    this.eyeGeo = new THREE.SphereGeometry(0.4, 32, 20);
    this.ringGeo = new THREE.TorusGeometry(0.4, 0.07, 10, 32);
    // folha: plano curvado ao longo do comprimento
    const lg = new THREE.PlaneGeometry(0.9, 2.2, 6, 14);
    const p = lg.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const u = p.getX(i) / 0.45;
      const v = (p.getY(i) + 1.1) / 2.2;
      const w = Math.sin(Math.PI * Math.min(1, v * 1.05)) * (1 - v * 0.15);
      p.setX(i, p.getX(i) * w);
      p.setZ(i, -u * u * 0.12 + v * v * 0.55);
    }
    lg.rotateX(-Math.PI / 2 + 0.2);
    lg.translate(0, 0, -1.1);
    lg.computeVertexNormals();
    this.leafGeo = lg;
    this.tubeGeo = new THREE.TorusGeometry(0.5, 0.17, 12, 28);
    this.tubeGeo.rotateX(Math.PI / 2);
    this.buoyGeo = new THREE.TorusGeometry(0.32, 0.08, 10, 28);
    this.geos = [this.petalGeo, this.eyeGeo, this.ringGeo, this.leafGeo, this.tubeGeo, this.buoyGeo];
    this.mats = [this.petalMat, this.stemMat, this.eyeMat, this.lidMat, this.leafMat, this.tubeMat, this.buoyMat];
  }

  // Flor gigante: caule curvo, cabeça de pétalas amarelas e um olho no centro.
  flower(parent, x, y, z, height, size, seed) {
    const r = mulberry32(seed);
    const lean = [(r() - 0.5) * 0.6, (r() - 0.5) * 0.6];
    const top = new THREE.Vector3(x + lean[0] * height * 0.25, y + height, z + lean[1] * height * 0.25);
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(x, y - 0.1, z),
      new THREE.Vector3(x + lean[0] * height * 0.05, y + height * 0.35, z + lean[1] * height * 0.05),
      new THREE.Vector3(x + lean[0] * height * 0.15, y + height * 0.7, z + lean[1] * height * 0.15),
      top,
    ]);
    const stemGeo = new THREE.TubeGeometry(curve, 20, 0.045 + size * 0.025, 7, false);
    this.geos.push(stemGeo);
    const stem = new THREE.Mesh(stemGeo, this.stemMat);
    parent.add(stem);
    const head = new THREE.Group();
    head.position.copy(top);
    const tilt = new THREE.Group();
    head.add(tilt);
    const n = 9 + Math.floor(r() * 3);
    for (let layer = 0; layer < 2; layer++)
      for (let k = 0; k < n; k++) {
        const a = (k / n) * TAU + layer * (Math.PI / n);
        const pm = new THREE.Mesh(this.petalGeo, this.petalMat);
        const piv = new THREE.Group();
        piv.rotation.z = a;
        pm.rotation.set(-Math.PI / 2 + 0.25 + layer * 0.12, 0, 0);
        pm.position.z = -layer * 0.05;
        pm.scale.setScalar(1 - layer * 0.12);
        piv.add(pm);
        tilt.add(piv);
      }
    const eye = new THREE.Mesh(this.eyeGeo, this.eyeMat);
    eye.position.z = 0.1;
    const ring = new THREE.Mesh(this.ringGeo, this.lidMat);
    ring.position.z = 0.12;
    tilt.add(eye, ring);
    tilt.scale.setScalar(size);
    parent.add(head);
    // folhas no caule
    for (let k = 0; k < 2; k++) {
      const lf = new THREE.Mesh(this.leafGeo, this.leafMat);
      const pt = curve.getPoint(0.18 + k * 0.17);
      lf.position.copy(pt);
      lf.rotation.y = r() * TAU;
      lf.scale.setScalar(0.45 + r() * 0.25);
      parent.add(lf);
    }
    return { head, tilt, eye, x: top.x, y: top.y, z: top.z, base: [x, z], phase: r() * 10, blinkT: 3 + r() * 8, lag: 1.2 + r() * 1.8 };
  }

  leaf(parent, x, y, z, rot, scale, droop = 0) {
    const lf = new THREE.Mesh(this.leafGeo, this.leafMat);
    lf.position.set(x, y, z);
    lf.rotation.set(droop, rot, 0);
    lf.scale.setScalar(scale);
    parent.add(lf);
    return lf;
  }

  dispose() {
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) m.dispose();
    for (const t of [this.eyeMap, this.leafMap, this.buoyMap]) t.dispose();
  }
}

// ------------------------------------------------------------ shaders
export const WATER_VERT = /* glsl */ `
  varying vec3 vW;
  void main() {
    vec4 w = modelMatrix * vec4( position, 1.0 );
    vW = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }`;

// Água turquesa brilhante: cáusticas, borda com espuma e fresnel.
export const WATER_FRAG = /* glsl */ `
  uniform float uTime;
  uniform sampler2D uMask;
  uniform vec4 uRect; // x0, z0, largura, profundidade
  uniform float uHW;
  varying vec3 vW;
  float caust( vec2 p, float t ) {
    float c = 0.0;
    c += sin( p.x * 2.1 + sin( p.y * 1.3 + t * 0.7 ) * 1.6 + t * 0.9 );
    c += sin( p.y * 2.4 + sin( p.x * 1.7 - t * 0.6 ) * 1.4 - t * 0.8 );
    c += sin( ( p.x + p.y ) * 1.6 + t * 0.5 );
    return pow( clamp( 1.0 - abs( c ) / 3.0, 0.0, 1.0 ), 6.0 );
  }
  void main() {
    vec2 uv = ( vW.xz - uRect.xy ) / uRect.zw;
    float d = texture2D( uMask, uv ).r * 8.0;
    float e = uHW - d;
    if ( e < 0.03 ) discard;
    vec3 deep = vec3( 0.1, 0.62, 0.55 );
    vec3 shallow = vec3( 0.32, 0.85, 0.74 );
    float k = smoothstep( 0.0, 0.9, e );
    vec3 col = mix( shallow, deep, k );
    float c = caust( vW.xz * 1.3, uTime ) + caust( vW.xz * 2.3 + 4.0, uTime * 1.3 ) * 0.6;
    col += vec3( 0.45, 0.8, 0.7 ) * c * 0.35;
    // espuma clara junto à borda
    col = mix( col, vec3( 0.95, 1.05, 1.0 ), smoothstep( 0.22, 0.04, e ) * 0.6 );
    vec3 v = normalize( cameraPosition - vW );
    float fr = pow( 1.0 - max( v.y, 0.0 ), 3.0 );
    col = mix( col, vec3( 0.75, 0.95, 0.9 ), fr * 0.4 );
    gl_FragColor = vec4( col, 0.84 );
  }`;

// Teto pintado de céu: nuvens em fBm, gradiente teal e escurecimento nas bordas.
export const SKYCEIL_FRAG = /* glsl */ `
  uniform float uTime;
  uniform vec4 uRect;
  varying vec3 vW;
  ${SKY_GLSL}
  void main() {
    vec2 p = vW.xz * 0.16 + vec2( uTime * 0.004, 0.0 );
    float n = sFbm( p );
    float n2 = sFbm( p * 3.1 + 7.0 );
    vec3 sky = mix( vec3( 0.02, 0.09, 0.18 ), vec3( 0.06, 0.2, 0.3 ), sFbm( p * 0.5 + 3.0 ) );
    float cl = smoothstep( 0.4, 0.62, n + n2 * 0.25 );
    vec3 cloud = mix( vec3( 0.22, 0.4, 0.42 ), vec3( 0.5, 0.66, 0.64 ), smoothstep( 0.5, 0.9, n + n2 * 0.25 ) );
    vec3 col = mix( sky, cloud, cl );
    vec2 q = ( vW.xz - uRect.xy ) / uRect.zw;
    float edge = smoothstep( 0.0, 0.12, min( min( q.x, 1.0 - q.x ), min( q.y, 1.0 - q.y ) ) );
    col *= 0.55 + 0.45 * edge;
    gl_FragColor = vec4( col, 1.0 );
  }`;
