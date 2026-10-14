// Nível 10.1 — peças do lago: forma da margem (idêntica em JS e GLSL), relevo,
// texturas (juncos e casca), material da água e geometrias procedurais
// (árvores secas, barco a remo, tubos).
import * as THREE from 'three';
import { registerTexture, TEX } from '../textures.js';
import { mulberry32 } from '../util.js';

export const LX = 1.25; // alongamento do lago no eixo x
export const DEEP = -5; // além disto (m da margem para dentro) a água é funda demais

// Raio do lago (em coordenadas "esticadas") por ângulo.
export function lakeR(a) {
  return 64 + 6 * Math.sin(2 * a + 0.7) + 4 * Math.sin(3 * a + 2.1) + 2.5 * Math.sin(5 * a + 0.3) + 1.2 * Math.sin(9 * a + 1.0);
}

export function lakeAngle(x, z) {
  return Math.atan2(z, x / LX + 1e-4);
}

// Distância aproximada (m) até a margem: negativa dentro do lago.
export function shoreDist(x, z) {
  const qx = x / LX;
  return (Math.hypot(qx, z) - lakeR(Math.atan2(z, qx + 1e-4))) * 1.1;
}

// Ponto da margem num ângulo, afastado `s` metros para fora (aprox.).
export function shorePoint(a, s = 0) {
  const r = lakeR(a) + s / 1.1;
  return { x: LX * r * Math.cos(a), z: r * Math.sin(a) };
}

function hills(x, z) {
  return (
    1.4 * Math.sin(x * 0.012 + 1.3) * Math.sin(z * 0.01 + 0.4) +
    0.6 * Math.sin(x * 0.031 + z * 0.017) +
    0.3 * Math.sin(z * 0.045 - x * 0.02 + 2.0)
  );
}

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// Relevo: barranco suave fora do lago, fundo que desce dentro dele.
export function groundAt(x, z, s) {
  if (s >= 0) return 1.5 * (1 - Math.exp(-s / 11)) + hills(x, z) * 0.7 * smooth(8, 40, s);
  return Math.max(0.11 * s - 0.3 * Math.max(0, -s - 5), -4);
}
export function groundH(x, z) {
  return groundAt(x, z, shoreDist(x, z));
}

// Faixas de árvores ao longo da margem (também usadas no reflexo falso).
export function treeBand(a) {
  return 0.5 + 0.5 * Math.sin(a * 4 + 1.3) * Math.sin(a * 7 + 0.2);
}
// Centro da trilha de pescadores (distância da margem).
export function pathC(a) {
  return 4.8 + 0.9 * Math.sin(a * 6 + 0.5) + 0.4 * Math.sin(a * 13);
}

export const LAKE_GLSL = /* glsl */ `
const float LX = ${LX.toFixed(2)};
float lakeR( float a ) {
  return 64.0 + 6.0 * sin( 2.0 * a + 0.7 ) + 4.0 * sin( 3.0 * a + 2.1 ) + 2.5 * sin( 5.0 * a + 0.3 ) + 1.2 * sin( 9.0 * a + 1.0 );
}
vec2 lakeSA( vec2 p ) {
  vec2 q = vec2( p.x / LX, p.y );
  float a = atan( q.y, q.x + 1e-4 );
  return vec2( ( length( q ) - lakeR( a ) ) * 1.1, a );
}
float hills( vec2 p ) {
  return 1.4 * sin( p.x * 0.012 + 1.3 ) * sin( p.y * 0.01 + 0.4 ) + 0.6 * sin( p.x * 0.031 + p.y * 0.017 )
       + 0.3 * sin( p.y * 0.045 - p.x * 0.02 + 2.0 );
}
float groundAt( vec2 p, float s ) {
  if ( s >= 0.0 ) return 1.5 * ( 1.0 - exp( -s / 11.0 ) ) + hills( p ) * 0.7 * smoothstep( 8.0, 40.0, s );
  return max( 0.11 * s - 0.3 * max( 0.0, -s - 5.0 ), -4.0 );
}
float groundH( vec2 p ) { return groundAt( p, lakeSA( p ).x ); }
float treeBand( float a ) { return 0.5 + 0.5 * sin( a * 4.0 + 1.3 ) * sin( a * 7.0 + 0.2 ); }
float pathC( float a ) { return 4.8 + 0.9 * sin( a * 6.0 + 0.5 ) + 0.4 * sin( a * 13.0 ); }
`;

// ------------------------------------------------------------------ texturas
// Tufo de juncos e taboas com transparência.
registerTexture('l101Reeds', (S) => {
  const cv = TEX.makeCanvas(S, S);
  const ctx = cv.getContext('2d');
  const rnd = mulberry32(1011);
  const sc = S / 256;
  const blade = (x0, top, lean, w, col) => {
    ctx.fillStyle = col;
    ctx.beginPath();
    const N = 10;
    for (let k = 0; k <= N; k++) {
      const t = k / N;
      ctx.lineTo(x0 + lean * t * t - w * (1 - t * 0.92), S - (S - top) * t);
    }
    for (let k = N; k >= 0; k--) {
      const t = k / N;
      ctx.lineTo(x0 + lean * t * t + w * (1 - t * 0.92), S - (S - top) * t);
    }
    ctx.fill();
  };
  // touceira em leque: folhas da borda mais inclinadas e mais baixas
  for (let i = 0; i < 80; i++) {
    const f = rnd() * 2 - 1;
    const sh = 0.7 + rnd() * 0.45;
    const col = `rgb(${(150 * sh) | 0},${(142 * sh) | 0},${(104 * sh) | 0})`;
    const top = S * (0.04 + Math.abs(f) * 0.45 + rnd() * 0.25);
    blade(S * (0.5 + f * 0.2), top, f * S * (0.15 + rnd() * 0.3), (1.5 + rnd() * 2.2) * sc, col);
  }
  // taboas: talo reto com a espiga escura
  for (let i = 0; i < 3; i++) {
    const x = S * (0.38 + 0.24 * rnd());
    const y = S * (0.05 + rnd() * 0.12);
    blade(x, y - 10 * sc, (rnd() - 0.5) * 6 * sc, 2.2 * sc, 'rgb(110,104,78)');
    ctx.fillStyle = `rgb(${62 + rnd() * 14},${48 + rnd() * 8},${36})`;
    ctx.beginPath();
    ctx.ellipse(x, y + 12 * sc, 3.4 * sc, 12 * sc, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  return { map: TEX.toTex(cv, { repeat: false }) };
});

// Casca de árvore morta: sulcos verticais acinzentados.
registerTexture('l101Bark', (S) => {
  const fur = TEX.noiseField(S, S, 14, 2, 3, 1021);
  const low = TEX.noiseField(S, S, 3, 3, 3, 1022);
  const fine = TEX.whiteNoise(S * S, 1023);
  const hf = new Float32Array(S * S);
  const cv = TEX.paintRGB(S, S, (x, y, i, o) => {
    const f = 1 - Math.abs(fur[i]) * 2.2;
    const k = 0.5 + Math.max(f, 0) * 0.35 + low[i] * 0.12 + fine[i] * 0.05;
    o[0] = k;
    o[1] = k * 0.98;
    o[2] = k * 0.95;
    hf[i] = Math.max(f, 0) + fine[i] * 0.04;
  });
  return { map: TEX.toTex(cv), normalMap: TEX.normalMap(hf, S, S, 2.5) };
});

// Madeira velha e acinzentada, veios ao longo de u (tábuas do píer e bancos).
registerTexture('l101Wood', (S) => {
  const grain = TEX.noiseField(S, S, 2, 48, 3, 1031);
  const low = TEX.noiseField(S, S, 2, 6, 3, 1032);
  const fine = TEX.whiteNoise(S * S, 1033);
  const hf = new Float32Array(S * S);
  const rnd = mulberry32(1034);
  const knots = Array.from({ length: 5 }, () => [rnd() * S, rnd() * S, (4 + rnd() * 6) * (S / 256)]);
  const cv = TEX.paintRGB(S, S, (x, y, i, o) => {
    let k = 0.62 + grain[i] * 0.16 + low[i] * 0.12 + fine[i] * 0.04;
    for (const [kx, ky, kr] of knots) {
      const d = Math.hypot((x - kx) * 0.5, y - ky) / kr;
      if (d < 1) k *= 0.6 + 0.4 * d;
    }
    // rachaduras finas ao longo do veio
    if (Math.abs(grain[i]) < 0.012) k *= 0.55;
    o[0] = k;
    o[1] = k * 0.97;
    o[2] = k * 0.92;
    hf[i] = k;
  });
  return { map: TEX.toTex(cv), normalMap: TEX.normalMap(hf, S, S, 2) };
});

// ------------------------------------------------------------------ água
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
uniform float uTime, uCover, uScale, uFogD, uMirror;
uniform vec3 uZenith, uHorizon, uFogC, uCloudA, uCloudB, uDeep;
uniform sampler2D tMirror;
uniform mat4 uTexMat;
varying vec3 vW;
#include <fog_pars_fragment>
${LAKE_GLSL}
float wHash( vec2 p ) { p = fract( p * vec2( 123.34, 456.21 ) ); p += dot( p, p + 45.32 ); return fract( p.x * p.y ); }
// ruído de valor com derivadas (valor, d/dx, d/dy)
vec3 noised( vec2 x ) {
  vec2 i = floor( x ); vec2 f = fract( x );
  vec2 u = f * f * ( 3.0 - 2.0 * f ); vec2 du = 6.0 * f * ( 1.0 - f );
  float a = wHash( i ), b = wHash( i + vec2( 1.0, 0.0 ) ), c = wHash( i + vec2( 0.0, 1.0 ) ), d = wHash( i + vec2( 1.0, 1.0 ) );
  return vec3( a + ( b - a ) * u.x + ( c - a ) * u.y + ( a - b - c + d ) * u.x * u.y,
               du * ( vec2( b - a, c - a ) + ( a - b - c + d ) * u.yx ) );
}
float wFbm( vec2 p ) {
  float s = 0.0; float a = 0.5;
  for ( int i = 0; i < OCT; i++ ) { s += noised( p ).x * a; p = p * 2.03 + vec2( 17.1, 3.7 ); a *= 0.5; }
  return s;
}
// mesmo céu de makeSky, simplificado
vec3 skyCol( vec3 d ) {
  float h = max( d.y, 0.0 );
  vec3 col = mix( uHorizon, uZenith, pow( h, 0.45 ) );
  vec2 cp = d.xz / max( h + 0.06, 0.02 ) * 0.35 * uScale + vec2( uTime * 0.004, uTime * 0.0017 );
  float n = wFbm( cp * 1.4 );
  float a = smoothstep( uCover, uCover + 0.3, n ) * smoothstep( 0.0, 0.12, h );
  col = mix( col, mix( uCloudA, uCloudB, clamp( n * 1.2, 0.0, 1.0 ) ), a );
  return mix( uFogC, col, smoothstep( -0.02, 0.16, h ) );
}
// Reflexo falso da margem oposta (barranco e árvores escuras perto do horizonte).
float landMask( vec2 p, vec3 R, out float D ) {
  vec2 rd = normalize( R.xz + vec2( 1e-5 ) );
  vec2 q = vec2( p.x / LX, p.y );
  vec2 qd = vec2( rd.x / LX, rd.y );
  float A = dot( qd, qd );
  float B = 2.0 * dot( q, qd );
  float rm = 66.0;
  float s = 0.0;
  for ( int i = 0; i < 2; i++ ) {
    float C = dot( q, q ) - rm * rm;
    s = ( -B + sqrt( max( B * B - 4.0 * A * C, 0.0 ) ) ) / ( 2.0 * A );
    vec2 h = q + qd * s;
    rm = lakeR( atan( h.y, h.x + 1e-4 ) );
  }
  vec2 h = q + qd * s;
  float ang = atan( h.y, h.x + 1e-4 );
  float tb = treeBand( ang );
  float H = 1.0 + tb * ( 3.5 + 3.0 * sin( ang * 37.0 ) * sin( ang * 23.0 + 1.0 ) + 1.5 * sin( ang * 151.0 ) );
  D = s;
  float slope = R.y / max( length( R.xz ), 1e-3 );
  float lim = max( H, 0.8 ) / ( s + 6.0 );
  return smoothstep( lim * 1.1, lim * 0.85, slope );
}
void main() {
  vec2 p = vW.xz;
  vec3 toC = cameraPosition - vW;
  float dist = length( toC );
  vec3 V = toC / dist;
  // manchas lisas e manchas crespas pelo vento
  float gust = smoothstep( 0.3, 0.85, noised( p * 0.03 + uTime * vec2( 0.016, 0.009 ) ).x );
  float amp = mix( 0.22, 1.0, gust ) / ( 1.0 + dist * 0.012 );
  // ondulações alongadas perpendiculares ao vento
  mat2 rot = mat2( 0.8, -0.6, 0.6, 0.8 );
  vec2 q = rot * p;
  vec2 g = noised( q * vec2( 0.3, 0.8 ) + uTime * vec2( 0.0, 0.2 ) ).yz * vec2( 0.3, 0.8 ) * 0.12;
  g += noised( q * vec2( 1.0, 2.4 ) + uTime * vec2( 0.05, 0.5 ) ).yz * vec2( 1.0, 2.4 ) * 0.03;
  #ifdef HQ
  g += noised( p * 4.3 + uTime * vec2( 0.3, -0.2 ) ).yz * 4.3 * 0.006 / ( 1.0 + dist * 0.06 );
  #endif
  g = g * rot;
  vec3 N = normalize( vec3( -g.x * amp, 1.0, -g.y * amp ) );
  float ndv = max( dot( N, V ), 0.0 );
  float F = 0.025 + 0.975 * pow( 1.0 - ndv, 5.0 );
  vec3 R = reflect( -V, N );
  R.y = abs( R.y );
  vec3 refl;
  if ( uMirror > 0.5 ) {
    vec4 tp = uTexMat * vec4( vW, 1.0 );
    refl = texture2D( tMirror, tp.xy / tp.w + N.xz * 0.18 ).rgb;
  } else {
    refl = skyCol( R );
    float D;
    float m = landMask( p, R, D );
    float fd = uFogD * ( dist + D );
    vec3 land = mix( vec3( 0.035, 0.036, 0.033 ), uFogC, 1.0 - exp( -fd * fd ) );
    refl = mix( refl, land, m );
  }
  refl *= 0.62;
  vec3 col = mix( uDeep, refl, F );
  // raso: deixa ver o fundo de lama perto da margem
  float depth = -groundH( p );
  float a = clamp( smoothstep( 0.0, 0.55, depth ) * 0.9 + F, 0.0, 1.0 );
  gl_FragColor = vec4( col, a );
  #include <fog_fragment>
}`;

export function makeWaterMaterial(o) {
  const uniforms = THREE.UniformsUtils.merge([
    THREE.UniformsLib.fog,
    {
      uTime: { value: 0 },
      uCover: { value: o.cover },
      uScale: { value: o.cloudScale || 1 },
      uFogD: { value: o.fogDensity },
      uMirror: { value: 0 },
      uZenith: { value: new THREE.Color(...o.zenith) },
      uHorizon: { value: new THREE.Color(...o.horizon) },
      uFogC: { value: new THREE.Color(...o.fog) },
      uCloudA: { value: new THREE.Color(...o.cloudA) },
      uCloudB: { value: new THREE.Color(...o.cloudB) },
      uDeep: { value: new THREE.Color(0.012, 0.014, 0.013) },
      tMirror: { value: null },
      uTexMat: { value: new THREE.Matrix4() },
    },
  ]);
  return new THREE.ShaderMaterial({
    uniforms,
    defines: o.hq ? { HQ: 1, OCT: 5 } : { OCT: 3 },
    vertexShader: WATER_VERT,
    fragmentShader: WATER_FRAG,
    transparent: true,
    fog: true,
  });
}

// Disco irregular que cobre o lago (a margem passa por baixo do barranco).
export function makeWaterGeometry() {
  const segs = 160;
  const rings = [0, 0.3, 0.55, 0.75, 0.88, 0.95, 1];
  const pos = [];
  const idx = [];
  for (const t of rings) {
    for (let k = 0; k <= segs; k++) {
      const a = (k / segs) * Math.PI * 2;
      const r = t * (lakeR(a) + 4);
      pos.push(LX * r * Math.cos(a), 0, r * Math.sin(a));
    }
  }
  const W = segs + 1;
  for (let j = 0; j < rings.length - 1; j++) {
    for (let k = 0; k < segs; k++) {
      const a = j * W + k;
      const b = a + W;
      // ordem anti-horária vista de cima (a face da frente aponta para +y)
      idx.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

// ------------------------------------------------------------------ geometria
const _t = new THREE.Vector3();
const _n1 = new THREE.Vector3();
const _n2 = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const XA = new THREE.Vector3(1, 0, 0);

// Tronco de cone entre dois pontos quaisquer (sem tampas) num GeoBuilder.
export function tube(gb, a, b, r0, r1, sides, c0, c1 = c0, vScale = 0.5) {
  _t.subVectors(b, a);
  const len = _t.length();
  if (len < 1e-4) return;
  _t.divideScalar(len);
  _n1.crossVectors(_t, Math.abs(_t.y) < 0.9 ? UP : XA).normalize();
  _n2.crossVectors(_t, _n1);
  const base = gb.n;
  for (let i = 0; i <= sides; i++) {
    const ang = (i / sides) * Math.PI * 2;
    const cs = Math.cos(ang);
    const sn = Math.sin(ang);
    const nx = _n1.x * cs + _n2.x * sn;
    const ny = _n1.y * cs + _n2.y * sn;
    const nz = _n1.z * cs + _n2.z * sn;
    gb.vert(a.x + nx * r0, a.y + ny * r0, a.z + nz * r0, nx, ny, nz, i / sides, 0, 0, 0, c0, 0);
    gb.vert(b.x + nx * r1, b.y + ny * r1, b.z + nz * r1, nx, ny, nz, i / sides, len * vScale, 0, 0, c1, 0);
  }
  for (let i = 0; i < sides; i++) {
    const o = base + i * 2;
    gb.idx.push(o, o + 2, o + 1, o + 1, o + 2, o + 3);
  }
}

// Árvore seca: tronco torto e galhos nus recursivos. Devolve o raio da base.
export function deadTree(gb, rnd, x, y, z, H, lean, o = {}) {
  const maxD = o.maxDepth ?? 4;
  const snag = !!o.snag;
  const wet = o.wet || 0;
  const r0 = H * (0.02 + rnd() * 0.008);
  const dark = [0.2, 0.19, 0.18];
  const light = [0.34, 0.33, 0.31];
  const colAt = (r) => {
    const k = Math.min(1, r / r0);
    return [light[0] + (dark[0] - light[0]) * k, light[1] + (dark[1] - light[1]) * k, light[2] + (dark[2] - light[2]) * k];
  };
  const sides = (d) => (d === 0 ? (maxD >= 4 ? 7 : 5) : d === 1 ? 5 : d === 2 ? 4 : 3);
  const tmp = new THREE.Vector3();
  const perp = new THREE.Vector3();
  const grow = (p, dir, len, r, d) => {
    let cur = p.clone();
    const dv = dir.clone();
    const n = d < 2 ? 3 : 2;
    let rr = r;
    for (let k = 0; k < n; k++) {
      dv.x += (rnd() - 0.5) * 0.4;
      dv.z += (rnd() - 0.5) * 0.4;
      dv.y += (rnd() - 0.4) * 0.2;
      dv.normalize();
      const nxt = cur.clone().addScaledVector(dv, len / n);
      const r2 = r * (1 - (0.35 * (k + 1)) / n);
      const c0 = colAt(rr);
      // mancha escura de água na base das árvores alagadas
      if (d === 0 && k === 0 && wet > 0) tube(gb, cur, nxt, rr, r2, sides(d), [0.08, 0.08, 0.075], c0);
      else tube(gb, cur, nxt, rr, r2, sides(d), c0, colAt(r2));
      rr = r2;
      // galhos laterais curtos ao longo do caminho
      if (k < n - 1 && d < maxD - 1 && rnd() < (snag ? 0.35 : 0.55)) side(nxt, dv, len * 0.45, rr * 0.6, d + 2);
      cur = nxt;
    }
    if (d >= maxD || rr < 0.01 || (snag && d >= 1)) return;
    const kids = snag ? 1 : d === 0 ? 3 + (rnd() < 0.5 ? 1 : 0) : 2 + (rnd() < 0.35 ? 1 : 0);
    for (let c = 0; c < kids; c++) side(cur, dv, len * (0.55 + rnd() * 0.22), rr * 0.72, d + 1);
  };
  const side = (p, dir, len, r, d) => {
    if (d > maxD) return;
    tmp.set(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5);
    perp.crossVectors(dir, tmp).normalize();
    const ang = 0.45 + rnd() * 0.5;
    const cd = dir.clone().multiplyScalar(Math.cos(ang)).addScaledVector(perp, Math.sin(ang));
    cd.y += 0.22;
    cd.normalize();
    grow(p, cd, len, r, d);
  };
  const dir = new THREE.Vector3(lean[0], 1, lean[1]).normalize();
  const h = snag ? H * (0.35 + rnd() * 0.25) : H * 0.42;
  grow(new THREE.Vector3(x, y - 0.3, z), dir, h, r0, 0);
  return r0;
}

// Barco a remo de madeira (casco de bordas arredondadas, popa reta, bancos e
// remos). Coordenadas locais: comprimento em z (+z = proa), largura em x.
export function buildBoat(gb) {
  const L = 3.6;
  const B = 0.66;
  const NU = 16;
  const NV = 10;
  const half = (u) =>
    u > 0.4 ? B * Math.sqrt(Math.max(0, 1 - ((u - 0.4) / 0.6) ** 2)) : B * (0.62 + 0.38 * Math.sqrt(1 - ((0.4 - u) / 0.4) ** 2));
  const sheer = (u) => 0.42 + 0.18 * u ** 3 + 0.05 * (1 - u) ** 2;
  const keel = (u) => -0.14 + 0.36 * Math.max(0, (u - 0.72) / 0.28) ** 2;
  const pt = (u, v) => {
    const t = Math.abs(v);
    const s = Math.sign(v);
    const b = half(u);
    const x = s * b * Math.sin((t * Math.PI) / 2) ** 0.75;
    const y = keel(u) + (sheer(u) - keel(u)) * (1 - Math.cos((t * Math.PI) / 2)) ** 1.1;
    return [x, y, (u - 0.5) * L];
  };
  const paint = [0.17, 0.2, 0.19];
  const worn = [0.3, 0.31, 0.29];
  const base = gb.n;
  for (let i = 0; i <= NU; i++) {
    const u = Math.min(i / NU, 0.995);
    for (let j = 0; j <= NV; j++) {
      const v = (j / NV) * 2 - 1;
      const p = pt(u, v);
      const e = 0.01;
      const pu = pt(Math.min(u + e, 0.999), v);
      const pm = pt(Math.max(u - e, 0), v);
      const pv = pt(u, Math.min(v + e, 1));
      const pw = pt(u, Math.max(v - e, -1));
      const du = new THREE.Vector3(pu[0] - pm[0], pu[1] - pm[1], pu[2] - pm[2]);
      const dv = new THREE.Vector3(pv[0] - pw[0], pv[1] - pw[1], pv[2] - pw[2]);
      const n = new THREE.Vector3().crossVectors(dv, du).normalize();
      // a normal aponta para fora do casco
      if (n.x * p[0] + n.y * (p[1] - 0.3) < 0) n.negate();
      const k = Math.abs(v) > 0.85 ? 1 : 0;
      const c = k ? worn : paint;
      gb.vert(p[0], p[1], p[2], n.x, n.y, n.z, Math.abs(v) * 1.4, u * L * 0.6, 0, 0, c, 0);
    }
  }
  const W = NV + 1;
  for (let i = 0; i < NU; i++) {
    for (let j = 0; j < NV; j++) {
      const a = base + i * W + j;
      const b = a + W;
      // escolhe a ordem que deixa a frente do triângulo para fora
      const pa = gb.pos.slice(a * 3, a * 3 + 3);
      const pb = gb.pos.slice(b * 3, b * 3 + 3);
      const pc = gb.pos.slice((a + 1) * 3, (a + 1) * 3 + 3);
      const e1 = new THREE.Vector3(pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]);
      const e2 = new THREE.Vector3(pc[0] - pa[0], pc[1] - pa[1], pc[2] - pa[2]);
      const fn = new THREE.Vector3().crossVectors(e1, e2);
      const nn = new THREE.Vector3(gb.nor[a * 3], gb.nor[a * 3 + 1], gb.nor[a * 3 + 2]);
      if (fn.dot(nn) >= 0) gb.idx.push(a, b, a + 1, a + 1, b, b + 1);
      else gb.idx.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  // espelho de popa (tábua reta)
  const st = [];
  for (let j = 0; j <= NV; j++) st.push(pt(0, (j / NV) * 2 - 1));
  const z0 = st[0][2];
  const cTop = (st[0][1] + st[NV][1]) / 2;
  const ctr = gb.vert(0, cTop, z0, 0, 0, -1, 0.5, 0.5, 0, 0, paint, 0);
  for (let j = 0; j <= NV; j++) gb.vert(st[j][0], st[j][1], z0, 0, 0, -1, st[j][0], st[j][1], 0, 0, paint, 0);
  for (let j = 0; j < NV; j++) gb.idx.push(ctr, ctr + 1 + j + 1, ctr + 1 + j);
  // amurada: friso de madeira no topo das bordas
  const rim = [0.36, 0.34, 0.3];
  for (const s of [-1, 1]) {
    for (let i = 0; i < NU; i++) {
      const p0 = pt(i / NU, s);
      const p1 = pt(Math.min((i + 1) / NU, 0.995), s);
      tubeArr(gb, p0, p1, 0.035, rim);
    }
  }
  // bancos, remos e uma poça no fundo
  const wood = [0.42, 0.4, 0.36];
  for (const u of [0.18, 0.5, 0.78]) {
    const w = half(u) * 2 * 0.94;
    gb.box(0, sheer(u) - 0.1, (u - 0.5) * L, w, 0.04, 0.24, wood, null, { ao: 0, uvScale: 0.5 });
  }
  for (const s of [-1, 1]) {
    gb.box(s * 0.28, 0.0, 0.1, 0.05, 0.035, 2.3, wood, null, { ao: 0, rot: s * 0.06 });
    gb.box(s * 0.31, 0.01, -1.0, 0.13, 0.015, 0.5, wood, null, { ao: 0, rot: s * 0.06 });
  }
  gb.box(0, keel(0.45) + 0.06, -0.2, 0.42, 0.005, 1.6, [0.03, 0.035, 0.035], null, { ao: 0, skip: 'nxpxpznzny' });
}

function tubeArr(gb, a, b, r, col) {
  tube(gb, new THREE.Vector3(...a), new THREE.Vector3(...b), r, r, 4, col);
}
