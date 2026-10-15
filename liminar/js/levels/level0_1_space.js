// Subnível 0.1 — o espaço lá fora: céu estrelado com nebulosa, a estrela que
// nunca se põe e os planetas exóticos vistos pelas janelas gigantes:
//   Orfeu       gigante gasoso âmbar com anéis (oeste, pelo Mirante)
//   Tétis Rubra planeta rochoso vermelho (norte, pela Sala dos Geradores)
//   Vésper      lua de gelo rachada (leste, Refeitório e Controle)
//   Nix         luazinha cinzenta (sul, pela baía do hangar)
import * as THREE from 'three';
import { TEX } from '../textures.js';
import { SKY_GLSL } from './outdoor.js';
import { clamp, mulberry32, TAU } from '../util.js';

export const SUN_DIR = new THREE.Vector3(-0.55, 0.5, 0.67).normalize();

// ------------------------------------------------------------ céu
export function makeSpaceSky() {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uSun: { value: SUN_DIR.clone() }, uTime: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        vec4 p = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
        gl_Position = p.xyww;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uSun;
      uniform float uTime;
      varying vec3 vDir;
      ${SKY_GLSL}
      float h31( vec3 p ) { p = fract( p * 0.1031 ); p += dot( p, p.yzx + 33.33 ); return fract( ( p.x + p.y ) * p.z ); }
      vec3 stars( vec3 d, float scale, float dens ) {
        vec3 p = d * scale;
        vec3 c = floor( p );
        vec3 f = fract( p ) - 0.5;
        float h = h31( c );
        if ( h > dens ) return vec3( 0.0 );
        vec3 o = vec3( h31( c + 1.7 ), h31( c + 4.3 ), h31( c + 9.1 ) ) - 0.5;
        float r = length( f - o * 0.7 );
        float b = pow( h31( c + 2.9 ), 6.0 );
        float tw = 0.75 + 0.25 * sin( uTime * ( 1.0 + h * 9.0 ) + h * 60.0 );
        float s = smoothstep( 0.09, 0.0, r ) * ( 0.25 + b * 5.0 ) * tw;
        vec3 col = mix( vec3( 1.0, 0.8, 0.6 ), vec3( 0.7, 0.85, 1.0 ), h31( c + 5.5 ) );
        return col * s;
      }
      void main() {
        vec3 d = normalize( vDir );
        // faixa galáctica inclinada
        vec3 gN = normalize( vec3( 0.25, 0.9, 0.35 ) );
        float band = exp( -pow( dot( d, gN ) * 3.2, 2.0 ) );
        vec2 q = vec2( atan( d.z, d.x ), asin( clamp( d.y, -1.0, 1.0 ) ) ) * 2.2;
        float n1 = sFbm( q * 1.3 + 4.0 );
        float n2 = sFbm( q * 2.9 - 7.0 );
        vec3 col = vec3( 0.002, 0.003, 0.008 );
        // nebulosa: roxo, verde-água e um toque de rosa
        float neb = smoothstep( 0.35, 0.85, n1 ) * ( 0.35 + band * 0.9 );
        col += mix( vec3( 0.11, 0.03, 0.16 ), vec3( 0.02, 0.12, 0.14 ), n2 ) * neb * 0.9;
        col += vec3( 0.16, 0.05, 0.08 ) * smoothstep( 0.55, 0.95, n2 ) * neb * 0.6;
        col += vec3( 0.05, 0.05, 0.06 ) * band * ( 0.4 + n2 * 0.6 );
        // poeira escura cortando a faixa
        col *= 1.0 - smoothstep( 0.55, 0.8, sFbm( q * 4.0 + 11.0 ) ) * band * 0.7;
        col += stars( d, 140.0, 0.12 );
        col += stars( d, 320.0, 0.2 ) * 0.6;
        col += stars( d, 60.0, 0.03 ) * ( 1.0 + band );
        // a estrela: disco, coroa e brilho largo
        float sd = max( dot( d, uSun ), 0.0 );
        col += vec3( 1.0, 0.92, 0.8 ) * ( pow( sd, 900.0 ) * 40.0 + pow( sd, 90.0 ) * 1.2 + pow( sd, 12.0 ) * 0.12 );
        gl_FragColor = vec4( col, 1.0 );
      }`,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(2400, 48, 24), mat);
  m.frustumCulled = false;
  m.renderOrder = -10;
  return m;
}

// ------------------------------------------------------------ texturas dos planetas
function gasGiantTex(W) {
  const H = W >> 1;
  const n = TEX.noiseField(W, H, 8, 4, 5, 901);
  const turb = TEX.noiseField(W, H, 16, 8, 4, 902);
  const cols = [
    [0.93, 0.78, 0.52],
    [0.78, 0.5, 0.26],
    [0.96, 0.88, 0.7],
    [0.62, 0.36, 0.18],
    [0.88, 0.66, 0.4],
    [0.98, 0.9, 0.76],
    [0.7, 0.44, 0.24],
  ];
  const cv = TEX.paintRGB(W, H, (x, y, i, o) => {
    const v = y / H + (turb[i] - 0.5) * 0.05 + Math.sin((x / W) * TAU * 3 + y * 0.05) * 0.004;
    const b = v * 22;
    const k = Math.floor(b);
    const f = b - k;
    const a = cols[((k % 7) + 7) % 7];
    const c = cols[(((k + 1) % 7) + 7) % 7];
    const t = f * f * (3 - 2 * f);
    let r = a[0] + (c[0] - a[0]) * t;
    let g = a[1] + (c[1] - a[1]) * t;
    let bl = a[2] + (c[2] - a[2]) * t;
    const s = 0.85 + n[i] * 0.3;
    r *= s;
    g *= s;
    bl *= s;
    // tempestade oval
    const dx = (x / W - 0.62) * 3.2;
    const dy = (y / H - 0.64) * 7;
    const e = dx * dx + dy * dy;
    if (e < 1) {
      const sw = Math.sin(Math.atan2(dy, dx) * 2 + e * 9) * 0.5 + 0.5;
      const k2 = (1 - e) * 0.85;
      r = r * (1 - k2) + (0.85 + sw * 0.1) * k2;
      g = g * (1 - k2) + (0.4 + sw * 0.1) * k2;
      bl = bl * (1 - k2) + 0.22 * k2;
    }
    o[0] = r;
    o[1] = g;
    o[2] = bl;
  });
  return TEX.toTex(cv);
}

function rockyTex(W, seed, pal) {
  const H = W >> 1;
  const n = TEX.noiseField(W, H, 8, 4, 6, seed);
  const m = TEX.noiseField(W, H, 4, 2, 4, seed + 1);
  const r = mulberry32(seed + 2);
  const craters = Array.from({ length: 70 }, () => [r() * W, H * 0.1 + r() * H * 0.8, 2 + Math.pow(r(), 3) * W * 0.04]);
  const cv = TEX.paintRGB(W, H, (x, y, i, o) => {
    let k = 0.7 + n[i] * 0.45;
    const mar = m[i] > 0.58 ? 1 : 0;
    let c = mar ? pal.dark : pal.base;
    for (const [cx, cy, cr] of craters) {
      let dx = Math.abs(x - cx);
      dx = Math.min(dx, W - dx);
      const d = Math.hypot(dx, (y - cy) * 1.0) / cr;
      if (d < 1.25) {
        if (d < 0.85) k *= 0.82 + d * 0.1;
        else if (d < 1.1) k *= 1.18;
      }
    }
    // calotas polares (ou faixas de gelo)
    const lat = Math.abs(y / H - 0.5) * 2;
    if (pal.ice && lat > 0.78 + n[i] * 0.1) c = pal.ice;
    o[0] = c[0] * k;
    o[1] = c[1] * k;
    o[2] = c[2] * k;
  });
  // rachaduras (lua de gelo)
  if (pal.cracks) {
    const c = cv.getContext('2d');
    c.strokeStyle = pal.cracks;
    c.lineWidth = Math.max(1, W / 400);
    for (let k = 0; k < 40; k++) {
      let x = r() * W;
      let y = r() * H;
      c.beginPath();
      c.moveTo(x, y);
      for (let s = 0; s < 14; s++) {
        x += (r() - 0.3) * W * 0.03;
        y += (r() - 0.5) * H * 0.04;
        c.lineTo(x, y);
      }
      c.stroke();
    }
  }
  return TEX.toTex(cv);
}

function ringTex() {
  const W = 512;
  const cv = TEX.makeCanvas(W, 4);
  const c = cv.getContext('2d');
  const img = c.createImageData(W, 4);
  const r = mulberry32(911);
  let band = 0.5;
  for (let x = 0; x < W; x++) {
    if (r() < 0.08) band = r();
    const t = x / W;
    const gap = Math.abs(t - 0.62) < 0.025 ? 0.05 : 1;
    const a = clamp((0.25 + band * 0.75) * gap * Math.min(1, t * 6) * Math.min(1, (1 - t) * 8), 0, 1);
    for (let y = 0; y < 4; y++) {
      const p = (y * W + x) * 4;
      img.data[p] = 225 - band * 40;
      img.data[p + 1] = 196 - band * 50;
      img.data[p + 2] = 150 - band * 50;
      img.data[p + 3] = a * 230;
    }
  }
  c.putImageData(img, 0, 0);
  return TEX.toTex(cv, { repeat: false });
}

// ------------------------------------------------------------ planetas
function planetMaterial(map, atmo, o = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      map: { value: map },
      uSun: { value: SUN_DIR.clone() },
      uAtmo: { value: new THREE.Color(...atmo) },
      uAtmoK: { value: o.atmoK || 1 },
      uNight: { value: new THREE.Color(...(o.night || [0, 0, 0])) },
      uRot: { value: 0 },
      uRingN: { value: o.ringN ? o.ringN.clone() : new THREE.Vector3(0, 1, 0) },
      uRingR: { value: new THREE.Vector2(o.ringR ? o.ringR[0] : 0, o.ringR ? o.ringR[1] : 0) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vN;
      varying vec3 vW;
      varying vec3 vL;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vN = normalize( mat3( modelMatrix ) * normal );
        vL = position;
        vec4 w = modelMatrix * vec4( position, 1.0 );
        vW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D map;
      uniform vec3 uSun, uAtmo, uNight, uRingN;
      uniform float uAtmoK, uRot;
      uniform vec2 uRingR;
      varying vec3 vN;
      varying vec3 vW;
      varying vec3 vL;
      varying vec2 vUv;
      void main() {
        vec3 n = normalize( vN );
        vec3 v = normalize( cameraPosition - vW );
        float ndl = dot( n, uSun );
        vec3 alb = texture2D( map, vec2( vUv.x + uRot, vUv.y ) ).rgb;
        float day = smoothstep( -0.08, 0.25, ndl );
        vec3 col = alb * ( max( ndl, 0.0 ) * 1.6 + 0.012 ) + uNight * ( 1.0 - day );
        // sombra dos anéis no planeta
        if ( uRingR.y > 0.0 ) {
          vec3 p = normalize( vL );
          float t = -dot( p, uRingN ) / dot( uSun, uRingN );
          if ( t > 0.0 ) {
            float r = length( p + uSun * t );
            float sh = smoothstep( uRingR.x, uRingR.x + 0.05, r ) * smoothstep( uRingR.y, uRingR.y - 0.1, r );
            col *= 1.0 - sh * 0.6;
          }
        }
        // atmosfera: borda iluminada e terminador avermelhado
        float rim = pow( 1.0 - max( dot( n, v ), 0.0 ), 3.0 );
        float lit = smoothstep( -0.25, 0.4, ndl );
        col += uAtmo * rim * lit * 1.4 * uAtmoK;
        col += uAtmo * 0.25 * smoothstep( 0.25, 0.0, abs( ndl - 0.02 ) ) * uAtmoK;
        gl_FragColor = vec4( col, 1.0 );
      }`,
    fog: false,
  });
}

export class Space {
  constructor(lvl) {
    this.lvl = lvl;
    const Q = lvl.Q;
    const T = Q.id === 'low' ? 512 : Q.id === 'medium' ? 1024 : 2048;
    const seg = Q.id === 'low' ? 48 : 72;
    this.group = new THREE.Group();
    this.sky = makeSpaceSky();
    lvl.scene.add(this.sky);
    this.planets = [];
    const add = (mat, pos, R, tilt = 0) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(R, seg, seg >> 1), mat);
      m.position.copy(pos);
      m.rotation.z = tilt;
      m.renderOrder = -9;
      this.group.add(m);
      this.planets.push(m);
      return m;
    };
    // Orfeu
    const orfeuPos = new THREE.Vector3(-1440, 190, -670);
    const ringN = new THREE.Vector3(0.18, 1, 0.32).normalize();
    this.orfeu = add(
      planetMaterial(gasGiantTex(T), [1.0, 0.72, 0.4], { ringN, ringR: [1.35, 2.3], night: [0.006, 0.003, 0.002] }),
      orfeuPos,
      470,
      0.12,
    );
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(470 * 1.35, 470 * 2.3, 128, 1),
      new THREE.ShaderMaterial({
        uniforms: { map: { value: ringTex() }, uSun: { value: SUN_DIR.clone() }, uC: { value: orfeuPos.clone() }, uR: { value: 470 } },
        vertexShader: /* glsl */ `
          varying vec3 vW;
          varying float vR;
          void main() {
            vR = length( position.xy );
            vec4 w = modelMatrix * vec4( position, 1.0 );
            vW = w.xyz;
            gl_Position = projectionMatrix * viewMatrix * w;
          }`,
        fragmentShader: /* glsl */ `
          uniform sampler2D map;
          uniform vec3 uSun, uC;
          uniform float uR;
          varying vec3 vW;
          varying float vR;
          void main() {
            float t = ( vR / uR - 1.35 ) / ( 2.3 - 1.35 );
            vec4 c = texture2D( map, vec2( t, 0.5 ) );
            // sombra do planeta sobre os anéis
            vec3 rel = vW - uC;
            float along = dot( rel, uSun );
            float perp = length( rel - uSun * along );
            float sh = along < 0.0 ? smoothstep( uR * 0.97, uR * 1.03, perp ) : 1.0;
            gl_FragColor = vec4( c.rgb * ( 0.08 + 1.1 * sh ), c.a );
          }`,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        fog: false,
      }),
    );
    ring.position.copy(orfeuPos);
    ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), ringN);
    ring.renderOrder = -8;
    this.group.add(ring);
    // Tétis Rubra
    this.tetis = add(
      planetMaterial(rockyTex(T, 931, { base: [0.62, 0.22, 0.12], dark: [0.34, 0.1, 0.07], ice: [0.85, 0.8, 0.76] }), [1.0, 0.45, 0.25], {
        atmoK: 0.7,
      }),
      new THREE.Vector3(330, -30, -1620),
      360,
      0.3,
    );
    // Vésper
    this.vesper = add(
      planetMaterial(
        rockyTex(T >> 1, 951, { base: [0.82, 0.88, 0.92], dark: [0.6, 0.72, 0.8], cracks: 'rgba(90,140,170,0.6)' }),
        [0.55, 0.8, 1.0],
        { atmoK: 0.35 },
      ),
      new THREE.Vector3(1250, 30, -330),
      150,
    );
    // Nix
    this.nix = add(
      planetMaterial(rockyTex(T >> 2, 971, { base: [0.5, 0.48, 0.46], dark: [0.3, 0.29, 0.28] }), [0.6, 0.6, 0.6], { atmoK: 0.05 }),
      new THREE.Vector3(-520, -140, 1300),
      70,
    );
    lvl.scene.add(this.group);
    // pontinhos de naves distantes cruzando o céu
    this.ships = [];
    const sg = new THREE.SphereGeometry(1.6, 6, 4);
    for (let i = 0; i < 3; i++) {
      const s = new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ color: i === 1 ? 0xff7766 : 0xbfe4ff, fog: false }));
      s.userData = { a: i * 2.1, r: 900 + i * 180, y: 120 + i * 60, sp: 0.004 + i * 0.002 };
      this.group.add(s);
      this.ships.push(s);
    }
  }

  update(dt, cam) {
    this.sky.position.copy(cam.position);
    this.sky.material.uniforms.uTime.value += dt;
    this.orfeu.material.uniforms.uRot.value += dt * 0.0012;
    this.tetis.material.uniforms.uRot.value += dt * 0.0006;
    for (const s of this.ships) {
      const u = s.userData;
      u.a += dt * u.sp;
      s.position.set(Math.cos(u.a) * u.r, u.y, Math.sin(u.a) * u.r - 300);
      s.visible = Math.sin(this.sky.material.uniforms.uTime.value * 6 + u.r) > -0.2;
    }
  }

  dispose() {
    this.lvl.scene.remove(this.sky, this.group);
    this.sky.geometry.dispose();
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        if (o.material.uniforms && o.material.uniforms.map) o.material.uniforms.map.value.dispose();
        o.material.dispose();
      }
    });
  }
}
