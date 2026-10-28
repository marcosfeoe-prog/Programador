// Nível 62, seção 3 — a suíte da cobertura: hall de mármore, sala de estar com
// lareira acesa, janela panorâmica, quarto e banheiro. Pela janela, o hotel
// continua — janelas acesas até o horizonte, em todas as direções.
import * as THREE from 'three';
import { HotelLevel, Props, damaskTex, carpetTex, parquetTex } from './level62_kit.js';
import { Fire, flameTex } from './level177_common.js';
import { clamp } from '../util.js';

const WIN = { x: 8, z0: -9, z1: -1, y0: 1.08, y1: 3.15 };
const PHONE = { x: -1.65, z: -18.55 };

const CITY_VERT = /* glsl */ `varying vec3 vW; void main() { vec4 w = modelMatrix * vec4( position, 1.0 ); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const CITY_FRAG = /* glsl */ `
  uniform float uTime;
  varying vec3 vW;
  float h( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
  void main() {
    vec3 ro = cameraPosition;
    vec3 rd = normalize( vW - ro );
    vec3 fogC = vec3( 0.05, 0.04, 0.06 );
    float sy = clamp( rd.y * 2.0 + 0.3, 0.0, 1.0 );
    vec3 col = mix( vec3( 0.08, 0.06, 0.07 ), vec3( 0.01, 0.012, 0.03 ), sy );
    col += vec3( 0.25, 0.22, 0.2 ) * pow( max( dot( rd, normalize( vec3( 1.0, 0.45, -0.4 ) ) ), 0.0 ), 400.0 ) * 6.0;
    for ( int k = 0; k < 4; k++ ) {
      float D = k == 0 ? 14.0 : k == 1 ? 45.0 : k == 2 ? 100.0 : 190.0;
      float t = ( ${WIN.x.toFixed(1)} + D - ro.x ) / max( rd.x, 1e-4 );
      vec3 p = ro + rd * t;
      float bw = 34.0;
      float bi = floor( p.z / bw );
      float fz = p.z - bi * bw;
      if ( fz > 28.0 ) continue;
      float top = 18.0 + h( vec2( bi, float( k ) ) ) * 70.0;
      if ( p.y > top ) continue;
      vec2 cell = vec2( floor( p.z / 2.4 ), floor( p.y / 3.2 ) );
      vec2 f = vec2( fract( p.z / 2.4 ), fract( p.y / 3.2 ) );
      float win = step( 0.18, f.x ) * step( f.x, 0.82 ) * step( 0.22, f.y ) * step( f.y, 0.8 );
      float r = h( cell + float( k ) * 13.0 );
      float lit = step( 0.5, r ) * step( 0.02, fract( r * 7.0 + floor( uTime * 0.05 + r * 9.0 ) * 0.13 ) );
      vec3 wall = vec3( 0.07, 0.055, 0.045 ) * ( 0.8 + 0.4 * h( vec2( bi, 3.0 ) ) );
      vec3 warm = mix( vec3( 1.5, 1.05, 0.55 ), vec3( 1.2, 1.15, 0.95 ), h( cell + 5.0 ) );
      vec3 c = mix( wall, mix( vec3( 0.03, 0.03, 0.04 ), warm, lit ), win );
      // cornija no topo de cada prédio
      c = mix( c, wall * 1.6, step( top - 0.6, p.y ) );
      col = mix( fogC, c, exp( -t * 0.012 ) );
      break;
    }
    gl_FragColor = vec4( col, 1.0 );
  }`;

export class Level62Suite extends HotelLevel {
  constructor(game) {
    super(game, {
      bounds: [-8, -20, 9, 5],
      look: {
        exposure: 1.0,
        tint: [1.05, 0.99, 0.9],
        sat: 0.95,
        contrast: 1.08,
        lift: [0.012, 0.009, 0.006],
        bloom: 0.45,
        bloomThreshold: 0.85,
        fog: [0.08, 0.06, 0.05],
        lightColor: [1, 1, 1],
        flashlight: false,
        ambience: 'level62_3',
        reverb: 1.2,
        sanityDrain: 0.02,
      },
      fog: 0.02,
      hemi: 0.45,
    });
    this.objectives = [{ id: 'telefone', text: 'Explore a suíte' }];
    this.spawn = { x: 0, z: 3, yaw: 0 };
    this.exit = { x: PHONE.x + 0.6, z: PHONE.z + 0.9 };
    this.ringing = false;
  }

  async preload(px, pz, progress) {
    const M = this.materials();
    const S = Math.min(1024, this.Q.tex);
    M.wall.damask3 = this.mat(new THREE.MeshStandardMaterial({ map: this.tex(damaskTex(Math.min(512, S), '#c9b896', 'rgba(255,248,225,0.3)', 'rgba(80,64,40,0.12)')), vertexColors: true, roughness: 0.62, envMap: this.env, envMapIntensity: 0.15 }));
    M.floor.parquet = this.mat(new THREE.MeshStandardMaterial({ map: this.tex(parquetTex(Math.min(512, S))), roughness: 0.2, envMap: this.env, envMapIntensity: 0.7 }));
    M.floor.carpet = this.mat(new THREE.MeshStandardMaterial({ map: this.tex(carpetTex(Math.min(512, S), '#8a7658', 'rgba(250,232,190,0.28)')), roughness: 0.95 }));
    progress(0.3);
    this.buildWorld();
    progress(0.8);
    this.updateLights({ x: px, z: pz }, true);
    progress(1);
  }

  buildWorld() {
    const P = this.plan;
    const props = new Props(this);
    const foyer = P.zone({ H: 3.2, ceil: [0.96, 0.92, 0.84] });
    const dw = P.zone({ H: 2.4, trim: false, paper: 'plain' });
    const living = P.zone({ H: 3.6, floor: 'parquet', paper: 'damask3', ceil: [0.97, 0.94, 0.87], floorUV: 1.6 });
    const bed = P.zone({ H: 3.4, floor: 'carpet', paper: 'damask3', ceil: [0.97, 0.94, 0.87], floorUV: 1.8 });
    const bath = P.zone({ H: 3.0, floor: 'marble', paper: 'marble', trim: false, ceil: [0.98, 0.97, 0.95] });
    const dwc = P.zone({ H: 2.4, trim: false, paper: 'plain', floor: 'parquet' });
    P.rect(-1.5, 0.5, 1.5, 4.5, foyer);
    P.rect(-0.5, 0, 0.5, 0.5, dw);
    P.rect(-7, -10, 8, 0, living);
    P.rect(-7, -19, 1, -10.5, bed);
    P.rect(1.5, -16, 8, -10.5, bath);
    P.rect(-3.5, -10.5, -2.5, -10, dwc);
    P.rect(4, -10.5, 5, -10, dwc);
    // batentes das passagens
    const trim = [0.86, 0.78, 0.62];
    const casing = (x, z, nx, nz) => {
      const o = { x, z, rot: Math.atan2(nx, nz) };
      props.box('wood', o, -0.56, 1.2, 0.03, 0.12, 2.4, 0.06, trim);
      props.box('wood', o, 0.56, 1.2, 0.03, 0.12, 2.4, 0.06, trim);
      props.box('wood', o, 0, 2.46, 0.03, 1.24, 0.12, 0.06, trim);
    };
    casing(0, 0, 0, -1);
    casing(0, 0.5, 0, 1);
    casing(-3, -10, 0, 1);
    casing(-3, -10.5, 0, -1);
    casing(4.5, -10, 0, 1);
    casing(4.5, -10.5, 0, -1);
    // hall: a porta dupla por onde você entrou, um console e um espelho
    const fd = { x: 0, z: 4.5, rot: Math.PI };
    for (const s of [-1, 1]) {
      props.box('wood', fd, s * 0.45, 1.15, 0.06, 0.88, 2.3, 0.05, [0.3, 0.18, 0.1]);
      props.box('brass', fd, s * 0.08, 1.05, 0.1, 0.03, 0.4, 0.03, [0.95, 0.78, 0.42]);
    }
    props.box('wood', fd, 0, 2.38, 0.04, 2.0, 0.14, 0.08, trim);
    props.sconce(-1.5, 2.5, 1, 0, 1.9);
    props.sconce(1.5, 2.5, -1, 0, 1.9);
    // ---- sala de estar
    this.buildLiving(props);
    // ---- quarto
    this.buildBedroom(props);
    // ---- banheiro
    this.buildBath(props);
    this.finishBuild(props);
    this.makeWindow();
    this.makeFire();
  }

  buildLiving(props) {
    const P = this.plan;
    // lareira na parede da esquerda
    const fp = { x: -7, z: -5, rot: Math.PI / 2 };
    props.box('stone', fp, 0, 0.65, 0.2, 2.2, 1.3, 0.4, [1, 0.98, 0.95]);
    props.box('dark', fp, 0, 0.42, 0.25, 0.95, 0.75, 0.32, [0.02, 0.015, 0.012]);
    props.box('wood', fp, 0, 1.36, 0.24, 2.5, 0.08, 0.5, [0.4, 0.25, 0.15]);
    props.box('stone', fp, 0, 0.03, 0.55, 2.4, 0.06, 0.6, [0.9, 0.88, 0.85]);
    props.box('dark', fp, 0, 0.06, 0.3, 0.8, 0.04, 0.3, [0.1, 0.06, 0.04]);
    // lenha
    for (let k = 0; k < 3; k++) props.cyl('wood', { x: -6.7, z: -5 + (k - 1) * 0.18, rot: 0 }, 0, 0.12 + (k % 2) * 0.06, 0, 0.06, 0.6, [0.3, 0.18, 0.1], { axis: 'z', sides: 8 });
    props.painting(-7, 2.3, -5, 1, 0, 1.4, 0.95, [[0.18, 0.2, 0.16], [0.6, 0.5, 0.3], [0.3, 0.12, 0.1], [0.8, 0.72, 0.5]]);
    P.hole('z', -7, -6.4, -3.6);
    this.colliders.push([-7, -6.4, -6.2, -3.8]);
    this.firePos = { x: -6.72, y: 0.12, z: -5 };
    // estar
    props.rug(-4.6, -5, 3.6, 4.2, 0, 'paint', [0.28, 0.2, 0.14]);
    props.sofa(-3.4, -5, -Math.PI / 2, [0.62, 0.55, 0.44], 2.4);
    props.coffeeTable(-5.0, -5, Math.PI / 2, 1.2, 0.6);
    props.armchair(-5.2, -2.4, Math.PI, [0.36, 0.22, 0.18]);
    props.armchair(-5.2, -7.6, 0, [0.36, 0.22, 0.18]);
    // luminária de pé
    const fl = { x: -2.6, z: -7.2, rot: 0 };
    props.cyl('brass', fl, 0, 0.8, 0, 0.02, 1.6, [0.9, 0.72, 0.38]);
    props.cyl('brass', fl, 0, 0.02, 0, 0.18, 0.04, [0.9, 0.72, 0.38]);
    props.cyl('glow', fl, 0, 1.68, 0, 0.24, 0.3, [2.0, 1.6, 1.1], { r2: 0.16, caps: false });
    this.addLamp(-2.6, 1.6, -7.2, 0xffc080, 2.6, 5, 0.6);
    this.circles.push([-2.6, -7.2, 0.2]);
    // jantar perto da janela
    const dt = { x: 5.2, z: -6.8, rot: 0 };
    props.box('wood', dt, 0, 0.76, 0, 1.0, 0.05, 1.9, [0.36, 0.22, 0.13]);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) props.box('wood', dt, sx * 0.42, 0.37, sz * 0.85, 0.06, 0.74, 0.06, [0.3, 0.18, 0.1], 0.3);
    props.cyl('glow', dt, 0, 0.9, 0, 0.02, 0.2, [2.4, 1.9, 1.2], { sides: 6 });
    props.cyl('brass', dt, 0, 0.8, 0, 0.06, 0.04, [0.9, 0.72, 0.38]);
    for (const [cx, cz, r] of [
      [-0.8, -0.45, Math.PI / 2],
      [-0.8, 0.45, Math.PI / 2],
      [0.8, -0.45, -Math.PI / 2],
      [0.8, 0.45, -Math.PI / 2],
    ]) {
      const c = { x: dt.x + cx, z: dt.z + cz, rot: r };
      props.box('fabric', c, 0, 0.47, 0, 0.45, 0.08, 0.45, [0.6, 0.52, 0.4]);
      props.box('wood', c, 0, 0.85, -0.2, 0.45, 0.7, 0.05, [0.32, 0.2, 0.11]);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) props.box('wood', c, sx * 0.19, 0.22, sz * 0.19, 0.04, 0.44, 0.04, [0.3, 0.18, 0.1], 0.3);
    }
    this.colliders.push([dt.x - 1.0, dt.x + 1.0, dt.z - 1.0, dt.z + 1.0]);
    this.addLamp(dt.x, 1.0, dt.z, 0xffb060, 1.4, 3.5, 0.4);
    // aparador com garrafas (parede do hall) e estante
    const sb = { x: 4.2, z: 0, rot: Math.PI };
    props.box('wood', sb, 0, 0.45, 0.25, 1.8, 0.9, 0.5, [0.34, 0.2, 0.12], 0.4);
    for (let k = 0; k < 5; k++) props.cyl('glow', { x: 3.6 + k * 0.28, z: -0.25, rot: 0 }, 0, 1.05, 0, 0.04, 0.28 + (k % 2) * 0.06, k % 2 ? [0.5, 0.3, 0.1] : [0.2, 0.4, 0.2], { sides: 8 });
    this.colliders.push([3.3, 5.1, -0.5, 0]);
    const bs = { x: -4.4, z: 0, rot: Math.PI };
    props.box('wood', bs, 0, 1.1, 0.2, 2.0, 2.2, 0.4, [0.32, 0.19, 0.11], 0.4);
    for (let r = 0; r < 4; r++) {
      props.box('wood', bs, 0, 0.35 + r * 0.5, 0.25, 1.9, 0.03, 0.36, [0.4, 0.25, 0.15]);
      for (let k = 0; k < 14; k++) props.box('paint', bs, -0.85 + k * 0.125, 0.5 + r * 0.5, 0.25, 0.08, 0.24 + ((k * 7 + r) % 4) * 0.02, 0.24, [[0.4, 0.1, 0.08], [0.1, 0.2, 0.3], [0.5, 0.42, 0.2], [0.15, 0.25, 0.12]][(k + r) % 4]);
    }
    this.colliders.push([-5.4, -3.4, -0.4, 0]);
    P.hole('x', 0, -5.6, -3.2);
    P.hole('x', 0, 3.2, 5.4);
    props.chandelier(0.5, 3.6, -5, 1.1, 6);
    for (const x of [-6, 1.5, 7]) props.sconce(x, -10, 0, 1, 2.1);
    // cortinas da janela
    for (const z of [WIN.z0 - 0.35, WIN.z1 + 0.35]) props.box('fabric', { x: 7.85, z, rot: 0 }, 0, 1.75, 0, 0.18, 3.3, 0.7, [0.5, 0.14, 0.12]);
    props.box('brass', { x: 7.8, z: (WIN.z0 + WIN.z1) / 2, rot: 0 }, 0, 3.42, 0, 0.05, 0.05, WIN.z1 - WIN.z0 + 2, [0.9, 0.72, 0.38]);
    P.hole('z', 8, WIN.z0 - 0.8, WIN.z1 + 0.8);
  }

  buildBedroom(props) {
    const P = this.plan;
    const b = { x: -3, z: -17.8, rot: 0 };
    // cabeceira capitonê na parede
    props.box('fabric', { x: -3, z: -19, rot: 0 }, 0, 1.25, 0.06, 2.6, 1.7, 0.12, [0.55, 0.46, 0.34]);
    for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++) props.box('fabric', { x: -3, z: -19, rot: 0 }, -1.05 + i * 0.42, 0.6 + j * 0.4, 0.13, 0.4, 0.38, 0.05, [0.6, 0.5, 0.37]);
    props.box('wood', b, 0, 0.2, 0, 2.2, 0.4, 2.3, [0.32, 0.2, 0.12], 0.4);
    props.box('cloth', b, 0, 0.52, 0.02, 2.1, 0.24, 2.2, [0.96, 0.94, 0.9]);
    props.box('fabric', b, 0, 0.66, 0.4, 2.16, 0.06, 1.5, [0.42, 0.1, 0.1]);
    props.box('fabric', b, 0, 0.67, 0.85, 2.18, 0.06, 0.4, [0.62, 0.5, 0.3]);
    for (const sx of [-0.52, 0.52]) props.box('cloth', b, sx, 0.75, -0.82, 0.8, 0.18, 0.42, [0.98, 0.97, 0.94]);
    this.colliders.push([-4.15, -1.85, -19, -16.6]);
    props.box('fabric', { x: -3, z: -16.15, rot: 0 }, 0, 0.25, 0, 1.6, 0.5, 0.45, [0.5, 0.36, 0.24]);
    this.colliders.push([-3.8, -2.2, -16.4, -15.9]);
    // criados-mudos com abajur; telefone no da direita
    for (const sx of [-1, 1]) {
      const n = { x: -3 + sx * 1.42, z: -18.6, rot: 0 };
      props.box('wood', n, 0, 0.3, 0, 0.5, 0.6, 0.45, [0.32, 0.2, 0.12], 0.4);
      props.box('brass', n, 0, 0.42, 0.23, 0.12, 0.02, 0.02, [0.95, 0.78, 0.42]);
      if (sx < 0) {
        props.cyl('brass', n, 0, 0.75, 0, 0.05, 0.3, [0.9, 0.72, 0.38]);
        props.cyl('glow', n, 0, 1.0, 0, 0.16, 0.2, [2.0, 1.55, 1.0], { r2: 0.11, caps: false });
        this.addLamp(n.x, 1.0, n.z + 0.2, 0xffc080, 2.4, 4.5, 0.5);
      }
      this.colliders.push([n.x - 0.25, n.x + 0.25, n.z - 0.23, n.z + 0.23]);
    }
    // o telefone (antigo, de disco)
    const ph = { x: PHONE.x, z: PHONE.z, rot: -0.3 };
    props.box('dark', ph, 0, 0.65, 0, 0.24, 0.1, 0.2, [0.06, 0.05, 0.04]);
    props.cyl('brass', ph, 0, 0.705, 0.02, 0.07, 0.01, [0.9, 0.75, 0.4], { sides: 16 });
    this.handset = { ...ph };
    props.box('dark', ph, 0, 0.74, -0.07, 0.26, 0.05, 0.06, [0.06, 0.05, 0.04]);
    for (const sx of [-1, 1]) props.box('dark', ph, sx * 0.12, 0.73, -0.07, 0.06, 0.08, 0.08, [0.06, 0.05, 0.04]);
    this.addLamp(PHONE.x + 0.3, 1.0, PHONE.z + 0.3, 0xffc080, 1.2, 3, 0);
    // guarda-roupa
    const wr = { x: -7, z: -13.8, rot: Math.PI / 2 };
    props.box('wood', wr, 0, 1.15, 0.33, 2.0, 2.3, 0.62, [0.36, 0.22, 0.13], 0.4);
    for (const sx of [-0.5, 0.5]) {
      props.box('wood', wr, sx, 1.15, 0.65, 0.9, 2.1, 0.02, [0.42, 0.27, 0.16]);
      props.box('brass', wr, sx * 0.12, 1.15, 0.67, 0.02, 0.3, 0.02, [0.95, 0.78, 0.42]);
    }
    this.colliders.push([-7, -6.3, -14.85, -12.75]);
    P.hole('z', -7, -15, -12.6);
    props.painting(1, 1.85, -14.5, -1, 0, 1.2, 0.85, [[0.5, 0.48, 0.42], [0.2, 0.22, 0.3], [0.6, 0.5, 0.35]]);
    props.rug(-3, -15.2, 3.2, 2.2, 0, 'paint', [0.3, 0.22, 0.16]);
    props.chandelier(-3, 3.4, -14.5, 0.8, 4);
    props.sconce(-7, -17.2, 1, 0, 2.0);
    props.sconce(1, -12.2, -1, 0, 2.0);
  }

  buildBath(props) {
    const P = this.plan;
    // banheira de mármore
    const tb = { x: 6.2, z: -14.6, rot: 0 };
    props.box('stone', tb, 0, 0.3, 0, 1.9, 0.6, 0.95, [1, 1, 1]);
    props.box('cloth', tb, 0, 0.58, 0, 1.6, 0.04, 0.68, [0.92, 0.95, 0.96]);
    props.box('brass', tb, -0.88, 0.75, 0, 0.05, 0.3, 0.05, [0.95, 0.78, 0.42]);
    props.box('brass', tb, -0.78, 0.88, 0, 0.22, 0.04, 0.04, [0.95, 0.78, 0.42]);
    this.colliders.push([5.25, 7.15, -15.1, -14.1]);
    // bancada com duas cubas e espelho
    const vn = { x: 8, z: -12.3, rot: -Math.PI / 2 };
    props.box('wood', vn, 0, 0.42, 0.28, 2.0, 0.84, 0.56, [0.3, 0.18, 0.1], 0.4);
    props.box('stone', vn, 0, 0.87, 0.28, 2.1, 0.06, 0.6, [1, 1, 1]);
    for (const sx of [-0.5, 0.5]) {
      props.cyl('cloth', vn, sx, 0.92, 0.3, 0.2, 0.06, [0.98, 0.98, 0.98], { sides: 18 });
      props.box('brass', vn, sx, 1.05, 0.06, 0.03, 0.24, 0.03, [0.95, 0.78, 0.42]);
      props.box('brass', vn, sx, 1.16, 0.14, 0.03, 0.03, 0.16, [0.95, 0.78, 0.42]);
    }
    props.box('brass', vn, 0, 1.9, 0.02, 1.9, 1.1, 0.04, [0.9, 0.72, 0.38]);
    props.box('mirror', vn, 0, 1.9, 0.045, 1.8, 1.0, 0.01, [0.95, 0.95, 0.95]);
    this.colliders.push([7.4, 8, -13.35, -11.25]);
    P.hole('z', 8, -13.5, -11.1);
    // toalheiro
    const tw = { x: 3.5, z: -16, rot: 0 };
    props.box('brass', tw, 0, 1.2, 0.08, 0.9, 0.03, 0.03, [0.95, 0.78, 0.42]);
    props.box('cloth', tw, -0.2, 0.95, 0.1, 0.35, 0.55, 0.05, [0.96, 0.95, 0.92]);
    props.box('cloth', tw, 0.22, 1.0, 0.1, 0.3, 0.45, 0.05, [0.85, 0.82, 0.76]);
    props.plant(2.1, -15.4, 1.0);
    props.sconce(8, -14.2, -1, 0, 1.95);
    props.sconce(8, -10.9, -1, 0, 1.95);
    this.addLamp(4.5, 2.7, -13, 0xfff0d8, 3, 6, 0);
  }

  makeWindow() {
    this.cityMat = this.mat(new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 } }, vertexShader: CITY_VERT, fragmentShader: CITY_FRAG }));
    const w = WIN.z1 - WIN.z0;
    const h = WIN.y1 - WIN.y0;
    const geo = new THREE.PlaneGeometry(w, h);
    this.geos.push(geo);
    const m = new THREE.Mesh(geo, this.cityMat);
    m.position.set(WIN.x - 0.012, (WIN.y0 + WIN.y1) / 2, (WIN.z0 + WIN.z1) / 2);
    m.rotation.y = -Math.PI / 2;
    this.dynamic.add(m);
    // caixilhos
    const fr = new THREE.MeshStandardMaterial({ color: 0x2a1c12, roughness: 0.5 });
    this.mats.push(fr);
    const bar = (sx, sy, sz, x, y, z) => {
      const g = new THREE.BoxGeometry(sx, sy, sz);
      this.geos.push(g);
      const b = new THREE.Mesh(g, fr);
      b.position.set(x, y, z);
      this.dynamic.add(b);
    };
    const xm = WIN.x - 0.04;
    bar(0.08, 0.1, w + 0.16, xm, WIN.y0, (WIN.z0 + WIN.z1) / 2);
    bar(0.08, 0.1, w + 0.16, xm, WIN.y1, (WIN.z0 + WIN.z1) / 2);
    
    for (let k = 0; k <= 4; k++) bar(0.08, h, 0.08, xm, (WIN.y0 + WIN.y1) / 2, WIN.z0 + (k * w) / 4);
    bar(0.3, 0.06, w + 0.3, WIN.x - 0.15, WIN.y0 - 0.03, (WIN.z0 + WIN.z1) / 2);
    this.colliders.push([WIN.x - 0.3, WIN.x, WIN.z0, WIN.z1]);
  }

  makeFire() {
    this.flame = this.tex(flameTex());
    this.fire = new Fire(this.dynamic, this.flame, this.firePos.x, this.firePos.y, this.firePos.z, { scale: 0.75, intensity: 7, dist: 9 });
  }

  // ------------------------------------------------------------ quadro
  update(dt, player) {
    const g = this.game;
    const p = player.pos;
    this.time += dt;
    const t = this.time;
    this.updateLights(p);
    this.lightPower(1);
    this.cityMat.uniforms.uTime.value = t;
    this.fire.update(t);
    if (t > 3 && !this.toldStart) {
      this.toldStart = true;
      g.hud.message('Uma suíte. Lareira acesa, cheiro de madeira e de perfume caro. Alguém esteve aqui agora há pouco.', 6);
    }
    if (p.x > 5 && p.z > WIN.z0 && p.z < WIN.z1 && !this.toldWindow) {
      this.toldWindow = true;
      g.hud.message('Pela janela: o hotel. Janelas acesas até o horizonte, em todas as direções. Não há rua. Não há chão.', 6);
      setTimeout(() => g.level === this && this.say('win', ['Não tem cidade lá fora… é só hotel.', 'Quantos quartos… quantas pessoas presas em cada um?']), 6500);
    }
    // o telefone toca
    const inBed = p.z < -10.5 && p.x < 1;
    if (!this.ringing && !this.answered && (inBed || t > 45)) {
      this.ringing = true;
      this.ringT = 0;
      g.hud.message('O telefone ao lado da cama está tocando.', 4);
      g.setObjectiveText('telefone', 'Atenda o telefone');
    }
    if (this.ringing) {
      this.ringT -= dt;
      if (this.ringT <= 0) {
        this.ringT = 3;
        const d = Math.hypot(p.x - PHONE.x, p.z - PHONE.z);
        g.audio.play('phone', { gain: clamp(0.55 - d / 30, 0.1, 0.55), rate: 1, wet: 0.6 });
      }
    }
  }

  interactable(player) {
    const g = this.game;
    const p = player.pos;
    if (this.ringing && Math.hypot(p.x - PHONE.x, p.z - PHONE.z) < 1.5)
      return {
        label: 'Atender o telefone',
        action: () => {
          this.ringing = false;
          this.answered = true;
          g.audio.play('click', { gain: 0.4 });
          g.hud.say(
            [
              'Boa noite. Aqui é a recepção.',
              'Esperamos que a sua estadia tenha sido… confortável.',
              'Infelizmente, não podemos estender a sua reserva. Há outros hóspedes esperando por este quarto.',
              'O seu check-out já foi feito. Por favor, não leve nada com você.',
              'Tenha uma boa viagem. E volte sempre. Todos voltam.',
            ],
            () => {
              if (g.level !== this) return;
              g.completeObjective('telefone', 'A linha fica muda. As luzes da suíte se apagam uma por uma.');
              g.reachExit('noclip', 1.5);
            },
            'RECEPÇÃO',
          );
        },
      };
    if (Math.hypot(p.x, p.z - 4) < 1.1) return { label: 'Abrir a porta', action: () => g.hud.message('Trancada por fora.', 2.5) };
    if (Math.hypot(p.x - (this.firePos.x + 0.6), p.z - this.firePos.z) < 1.3) return { label: 'Aquecer as mãos', action: () => (g.addSanity(5), g.hud.message('O calor é de verdade. Por um instante, você se sente em casa.', 3)) };
    return null;
  }

  navTarget() {
    return this.ringing ? { x: PHONE.x + 0.4, z: PHONE.z + 0.9 } : { x: -3, z: -12 };
  }

  exitEmitter() {
    return { x: this.firePos.x, y: 0.5, z: this.firePos.z, sound: 'fire', gain: 0.35 };
  }

  dispose() {
    if (this.fire) this.fire.dispose();
    super.dispose();
  }
}
