// Nível 16 — "Mundo Dreamcore": campos abertos e macios sob um céu pastel,
// montanhas cor-de-rosa que não acabam nunca e coisas que não deveriam estar
// ali (uma porta sozinha, uma piscina de azulejos, uma escada para o nada,
// um balanço, uma TV chiando). Conforme o andarilho avança, o nível muda:
//   0–250 m   o brilho rosa fica cada vez mais forte e começam as alucinações;
//   250–400 m a vista embaça e a tela falha;
//   400–499 m tudo clareia: o céu fica rosa-choque, estrelas piscam, um
//             planeta roxo enorme aparece e a música fica lenta e distorcida;
//   499 m     tudo volta ao normal.
// A saída é a única árvore do nível, rosa e brilhante demais, com falhas —
// ela puxa o andarilho para dentro de si.
import * as THREE from 'three';
import { OutdoorLevel, SKY_GLSL } from './outdoor.js';
import { pushCircle } from './grid.js';
import { TEX } from '../textures.js';
import { clamp, damp, hash3, lerp, mulberry32, smoothstep, TAU } from '../util.js';
import { standardWake } from './wake.js';
import { NPC } from './level0_1_npc.js';

const TREE = { x: 16, z: -526 };
const CEN = { x: 0, z: -260 }; // centro do mundo
const R_WALK = 640;

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();
const _c = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);

function baseH(x, z) {
  return 2.2 * Math.sin(x * 0.011 + 0.5) * Math.sin(z * 0.009) + 1.2 * Math.sin(x * 0.023 - z * 0.017 + 1) + 0.5 * Math.sin(x * 0.05 + z * 0.043);
}
function groundH(x, z) {
  const d = Math.hypot(x - TREE.x, z - TREE.z);
  return lerp(baseH(TREE.x, TREE.z), baseH(x, z), smoothstep(6, 18, d));
}

// ------------------------------------------------------------ texturas
function grassTex(S) {
  const c = TEX.makeCanvas(S, S);
  const x = c.getContext('2d');
  x.fillStyle = '#86c47e';
  x.fillRect(0, 0, S, S);
  const r = mulberry32(1616);
  const k = S / 512;
  const n = Math.floor((S * S) / 60);
  for (let i = 0; i < n; i++) {
    const px = r() * S;
    const py = r() * S;
    const len = (3 + r() * 6) * k;
    const a = -Math.PI / 2 + (r() - 0.5) * 1.2;
    x.strokeStyle = `hsl(${85 + r() * 50},${40 + r() * 30}%,${42 + r() * 30}%)`;
    x.lineWidth = (0.7 + r() * 1.2) * k;
    for (const ox of px < 10 * k ? [0, S] : px > S - 10 * k ? [0, -S] : [0])
      for (const oy of py < 10 * k ? [0, S] : py > S - 10 * k ? [0, -S] : [0]) {
        x.beginPath();
        x.moveTo(px + ox, py + oy);
        x.lineTo(px + ox + Math.cos(a) * len, py + oy + Math.sin(a) * len);
        x.stroke();
      }
  }
  for (let i = 0; i < 180 * k * k; i++) {
    x.fillStyle = r() < 0.5 ? '#fff6fb' : r() < 0.6 ? '#ffb3d9' : '#fff0a0';
    x.beginPath();
    x.arc(r() * S, r() * S, (1 + r() * 1.6) * k, 0, TAU);
    x.fill();
  }
  return TEX.toTex(c);
}

function bladeTex() {
  const S = 128;
  const c = TEX.makeCanvas(S, S);
  const x = c.getContext('2d');
  const r = mulberry32(161);
  for (let i = 0; i < 40; i++) {
    const bx = 8 + r() * (S - 16);
    const h = S * (0.4 + r() * 0.6);
    const lean = (r() - 0.5) * 30;
    const w = 2 + r() * 3;
    const g = x.createLinearGradient(0, S, 0, S - h);
    const hue = 90 + r() * 45;
    g.addColorStop(0, `hsl(${hue},45%,28%)`);
    g.addColorStop(1, `hsl(${hue},${50 + r() * 30}%,${55 + r() * 20}%)`);
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
  g.addColorStop(0.3, 'rgba(255,255,255,0.6)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, S, S);
  return TEX.toTex(c, { repeat: false });
}

function checkerTex() {
  const c = TEX.makeCanvas(256, 256);
  const x = c.getContext('2d');
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 4; j++) {
      x.fillStyle = (i + j) % 2 ? '#f6c6dc' : '#fbf7f2';
      x.fillRect(i * 64, j * 64, 64, 64);
    }
  x.strokeStyle = 'rgba(120,80,100,0.25)';
  for (let i = 0; i <= 4; i++) {
    x.strokeRect(i * 64, 0, 0.5, 256);
    x.strokeRect(0, i * 64, 256, 0.5);
  }
  return TEX.toTex(c);
}

function signTex(text) {
  const c = TEX.makeCanvas(512, 160);
  const x = c.getContext('2d');
  x.fillStyle = '#fdf6fa';
  x.fillRect(0, 0, 512, 160);
  x.strokeStyle = '#f2a7c9';
  x.lineWidth = 10;
  x.strokeRect(10, 10, 492, 140);
  x.fillStyle = '#5b4a8a';
  x.font = 'bold 44px "Comic Sans MS", "Trebuchet MS", sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText(text, 256, 82);
  return TEX.toTex(c, { repeat: false });
}

function smileyTex() {
  const c = TEX.makeCanvas(256, 256);
  const x = c.getContext('2d');
  x.fillStyle = '#ffe25a';
  x.beginPath();
  x.arc(128, 128, 120, 0, TAU);
  x.fill();
  x.fillStyle = '#1a1208';
  x.beginPath();
  x.ellipse(88, 98, 12, 26, 0, 0, TAU);
  x.ellipse(168, 98, 12, 26, 0, 0, TAU);
  x.fill();
  x.strokeStyle = '#1a1208';
  x.lineWidth = 12;
  x.beginPath();
  x.arc(128, 128, 76, 0.2, Math.PI - 0.2);
  x.stroke();
  return TEX.toTex(c, { repeat: false });
}

// ------------------------------------------------------------ céu e planeta
const SKY_VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = position;
    vec4 p = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
    gl_Position = p.xyww;
  }`;
const SKY_FRAG = /* glsl */ `
  uniform float uPink, uStars, uTime;
  uniform vec3 uSun, uFog;
  varying vec3 vDir;
  ${SKY_GLSL}
  void main() {
    vec3 d = normalize( vDir );
    float h = d.y;
    vec3 col = mix( vec3( 0.99, 0.86, 0.91 ), vec3( 0.36, 0.6, 0.98 ), pow( clamp( h, 0.0, 1.0 ), 0.38 ) );
    float sd = max( dot( d, uSun ), 0.0 );
    col += vec3( 1.0, 0.92, 0.8 ) * ( pow( sd, 8.0 ) * 0.3 + smoothstep( 0.9996, 0.9999, sd ) * 2.0 );
    // nuvens fofas
    vec2 cp = d.xz / max( h + 0.08, 0.03 ) * 0.45 + vec2( uTime * 0.005, uTime * 0.002 );
    float n = sFbm( cp * 1.3 );
    float a = smoothstep( 0.52, 0.72, n ) * smoothstep( 0.0, 0.15, h );
    vec3 cc = mix( vec3( 1.0, 0.86, 0.94 ), vec3( 1.05 ), smoothstep( 0.55, 0.85, n ) );
    col = mix( col, cc, a * 0.92 );
    // céu rosa-choque
    vec3 pink = mix( vec3( 1.25, 0.62, 1.0 ), vec3( 1.2, 0.18, 0.72 ), pow( clamp( h, 0.0, 1.0 ), 0.6 ) );
    pink = mix( pink, vec3( 1.5, 0.85, 1.3 ), a * 0.6 );
    col = mix( col, pink, uPink );
    // estrelas que piscam
    vec2 sc = vec2( atan( d.z, d.x ) * 70.0, asin( clamp( h, -1.0, 1.0 ) ) * 70.0 );
    vec2 ci = floor( sc );
    float st = sHash( ci );
    if ( st > 0.975 ) {
      vec2 f = fract( sc ) - 0.5;
      float tw = 0.35 + 0.65 * pow( 0.5 + 0.5 * sin( uTime * ( 1.5 + fract( st * 91.0 ) * 6.0 ) + st * 300.0 ), 3.0 );
      col += vec3( 1.0, 0.95, 1.0 ) * smoothstep( 0.3, 0.0, length( f ) ) * tw * 4.0 * uStars * smoothstep( 0.02, 0.15, h );
    }
    col = mix( uFog, col, smoothstep( -0.02, 0.12, h ) );
    gl_FragColor = vec4( col, 1.0 );
  }`;

const PLANET_VERT = /* glsl */ `
  varying vec3 vN;
  varying vec3 vP;
  void main() {
    vN = normalize( normalMatrix * normal );
    vP = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
  }`;
const PLANET_FRAG = /* glsl */ `
  uniform float uA, uTime;
  uniform vec3 uL;
  varying vec3 vN;
  varying vec3 vP;
  ${SKY_GLSL}
  void main() {
    float lat = vP.y;
    float w = sFbm( vec2( atan( vP.z, vP.x ) * 1.5 + uTime * 0.01, lat * 3.0 ) );
    float b = sin( lat * 16.0 + w * 5.0 );
    vec3 c = mix( vec3( 0.16, 0.04, 0.5 ), vec3( 0.42, 0.16, 0.95 ), 0.5 + 0.5 * b );
    c = mix( c, vec3( 0.62, 0.45, 1.0 ), smoothstep( 0.75, 1.0, w ) * 0.6 );
    float l = clamp( dot( normalize( vN ), uL ), 0.0, 1.0 );
    c *= 0.25 + 0.95 * l;
    float rim = pow( 1.0 - abs( normalize( vN ).z ), 3.0 );
    c += vec3( 0.5, 0.3, 1.2 ) * rim * 0.9;
    gl_FragColor = vec4( c * 1.2, uA );
  }`;

export class Level16 extends OutdoorLevel {
  constructor(game) {
    super(game, { P: 100, walkSpeed: 2.3, camFar: 4000 });
    this.num = 16;
    this.seed = (game.seed ^ 0x1616) >>> 0;
    this.time = 0;
    this.walked = 0;
    this.stage = 0;
    this.blur = 0;
    this.sanityExtra = -0.25;
    this.colliders = [];
    this.circles = [[TREE.x, TREE.z, 0.65]];
    this.mats = [];
    this.geos = [];
    this.texs = [];
    this.anims = [];
    this.k = { pink: 0, sky: 0, stars: 0, planet: 0, blur: 0, fx: 0, rate: 1 };
    this.base = {
      exposure: 1.04,
      tint: [1.02, 0.98, 1.03],
      sat: 1.05,
      contrast: 1.02,
      lift: [0.03, 0.025, 0.035],
      bloom: 0.22,
      bloomThreshold: 1.0,
      fog: [0.98, 0.86, 0.91],
    };
    this.look = {
      ...this.base,
      lightColor: [1, 1, 1],
      flashlight: false,
      ambience: 'level16',
      reverb: 0.9,
      sanityDrain: 0.02,
    };
    this.objectives = [
      { id: 'campos', text: 'Atravesse os campos (500 m)' },
      { id: 'arvore', text: 'Encontre a árvore que brilha' },
    ];
    this.fogBase = new THREE.Color(...this.base.fog);
    this.fogPink = new THREE.Color(1.0, 0.55, 0.82);
    this.scene.fog = new THREE.FogExp2(this.fogBase.clone(), 0.0009);
    this.scene.background = this.fogBase.clone();
    this.setupLights({
      sky: 0xfff0f6,
      ground: 0x8aa878,
      hemi: 1.7,
      sunColor: 0xfff2e6,
      sun: 1.6,
      sunDir: new THREE.Vector3(-0.35, 0.6, -0.7),
      shadowExtent: 40,
    });
    const yaw = Math.atan2(-(TREE.x - 0), -(TREE.z - 0));
    this.spawn = { x: 0, z: 0, yaw };
    this.exit = { x: TREE.x, z: TREE.z + 2.2 };
  }

  mat(m) {
    this.mats.push(m);
    return m;
  }

  mesh(geo, mat, x, y, z, parent = this.dynamic) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    this.geos.push(geo);
    parent.add(m);
    return m;
  }

  // ------------------------------------------------------------ construção
  async preload(px, pz, progress) {
    const g = this.game;
    if (g.audio.ready) {
      const load = g.audio.loadTrack('l16', 'assets/audio/l16_lullaby.m4a');
      await Promise.race([load, new Promise((r) => setTimeout(r, 4000))]);
    }
    progress(0.1);
    this.makeSky();
    this.makeGround();
    progress(0.35);
    await new Promise((r) => setTimeout(r, 0));
    this.makeMountains();
    progress(0.55);
    await new Promise((r) => setTimeout(r, 0));
    this.makeGrass();
    this.makeFlowers();
    this.makeFeatures();
    this.makeTree();
    this.makeHallucinations();
    this.makeSparkles();
    this.makeMe();
    this.spawnItems();
    this.refreshGrass(px, pz);
    this.updateSun({ x: px, z: pz });
    progress(1);
  }

  makeSky() {
    this.sunV = new THREE.Vector3(-0.35, 0.45, -0.82).normalize();
    this.skyMat = this.mat(
      new THREE.ShaderMaterial({
        uniforms: { uPink: { value: 0 }, uStars: { value: 0 }, uTime: { value: 0 }, uSun: { value: this.sunV }, uFog: { value: this.scene.fog.color } },
        vertexShader: SKY_VERT,
        fragmentShader: SKY_FRAG,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
      }),
    );
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(3000, 32, 16), this.skyMat);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
    this.geos.push(this.sky.geometry);
    this.scene.add(this.sky);
    // o planeta roxo (só aparece entre 400 e 499 m)
    this.planetMat = this.mat(
      new THREE.ShaderMaterial({
        uniforms: { uA: { value: 0 }, uTime: { value: 0 }, uL: { value: new THREE.Vector3(-0.6, 0.4, 0.7).normalize() } },
        vertexShader: PLANET_VERT,
        fragmentShader: PLANET_FRAG,
        transparent: true,
        depthWrite: false,
        fog: false,
      }),
    );
    const pg = new THREE.Group();
    const ball = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), this.planetMat);
    this.ringMat = this.mat(new THREE.MeshBasicMaterial({ color: new THREE.Color(0.55, 0.35, 1.2), transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, fog: false }));
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.45, 2.25, 96), this.ringMat);
    ring.rotation.set(-1.2, 0.25, 0.3);
    this.geos.push(ball.geometry, ring.geometry);
    pg.add(ball, ring);
    pg.visible = false;
    pg.renderOrder = -9;
    ball.renderOrder = ring.renderOrder = -9;
    pg.frustumCulled = false;
    this.planet = pg;
    this.scene.add(pg);
  }

  makeGround() {
    const Q = this.Q;
    const n = Q.id === 'low' ? 140 : 220;
    const S = 1600;
    const geo = new THREE.PlaneGeometry(S, S, n, n);
    geo.rotateX(-Math.PI / 2);
    geo.translate(CEN.x, 0, CEN.z);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, groundH(p.getX(i), p.getZ(i)));
    geo.computeVertexNormals();
    const map = grassTex(Math.min(1024, Q.tex));
    map.repeat.set(S / 5, S / 5);
    this.texs.push(map);
    const mat = this.mat(new THREE.MeshStandardMaterial({ map, roughness: 0.95 }));
    this.ground = new THREE.Mesh(geo, mat);
    this.ground.receiveShadow = Q.shadows;
    this.geos.push(geo);
    this.scene.add(this.ground);
  }

  // Cordilheiras rosadas em volta de tudo, em camadas, até o horizonte.
  makeMountains() {
    const segA = this.Q.id === 'low' ? 200 : 320;
    const segR = 30;
    const pos = [];
    const col = [];
    const idx = [];
    const deep = [0.86, 0.33, 0.6];
    const pale = [1.0, 0.84, 0.92];
    for (let j = 0; j <= segR; j++) {
      const t = j / segR;
      const r = lerp(900, 2700, t);
      for (let i = 0; i <= segA; i++) {
        const a = (i / segA) * TAU;
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        const ridge = Math.abs(Math.sin(t * Math.PI * 3.2 + Math.sin(a * 3) * 0.8));
        const peak = 0.55 + 0.45 * Math.sin(a * 7 + t * 4) * Math.sin(a * 3.3 - t * 2 + 1);
        const fine = 0.5 + 0.5 * Math.sin(a * 41 + t * 30) * Math.sin(a * 23 - t * 17);
        let y = (170 + 620 * t) * Math.pow(ridge, 0.7) * (0.55 + 0.45 * peak) * (0.85 + 0.15 * fine);
        if (j === 0) y = -20;
        pos.push(CEN.x + ca * r, y - 10, CEN.z + sa * r);
        const k = clamp(y / (260 + 480 * t), 0, 1);
        const fade = 0.12 + t * 0.4;
        for (let c = 0; c < 3; c++) col.push(lerp(lerp(deep[c], pale[c], k * k), pale[c], fade));
      }
    }
    const W = segA + 1;
    for (let j = 0; j < segR; j++)
      for (let i = 0; i < segA; i++) {
        const a = j * W + i;
        idx.push(a, a + W, a + 1, a + 1, a + W, a + W + 1);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    this.geos.push(g);
    this.mountMat = this.mat(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, fog: false, emissive: 0x3a1a2a }));
    this.mountains = new THREE.Mesh(g, this.mountMat);
    this.mountains.frustumCulled = false;
    this.scene.add(this.mountains);
  }

  makeGrass() {
    const Q = this.Q;
    this.bladeMap = bladeTex();
    this.texs.push(this.bladeMap);
    const g = new THREE.BufferGeometry();
    const pos = [];
    const nor = [];
    const uv = [];
    for (const a of [0, Math.PI / 3, (2 * Math.PI) / 3]) {
      const cx = Math.cos(a) * 0.3;
      const cz = Math.sin(a) * 0.3;
      const P = [
        [-cx, 0, -cz],
        [cx, 0, cz],
        [cx, 0.42, cz],
        [-cx, 0, -cz],
        [cx, 0.42, cz],
        [-cx, 0.42, -cz],
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
    this.geos.push(g);
    const m = this.mat(new THREE.MeshStandardMaterial({ map: this.bladeMap, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 1 }));
    this.grassR = Q.id === 'low' ? 14 : Q.id === 'medium' ? 20 : 26;
    const n = Math.ceil((this.grassR * 2) / 1.4) ** 2;
    this.grass = new THREE.InstancedMesh(g, m, n);
    this.grass.count = 0;
    this.grass.frustumCulled = false;
    this.scene.add(this.grass);
  }

  refreshGrass(px, pz) {
    const c = 1.4;
    const R = this.grassR;
    let n = 0;
    for (let i = Math.floor((px - R) / c); i <= Math.floor((px + R) / c); i++)
      for (let j = Math.floor((pz - R) / c); j <= Math.floor((pz + R) / c); j++) {
        const x = (i + hash3(i, j, 61)) * c;
        const z = (j + hash3(i, j, 62)) * c;
        if ((x - px) ** 2 + (z - pz) ** 2 > R * R) continue;
        if (n >= this.grass.instanceMatrix.count) break;
        const s = 0.7 + hash3(i, j, 63) * 0.8;
        _m.compose(_v.set(x, groundH(x, z) - 0.03, z), _q.setFromEuler(_e.set(0, hash3(i, j, 64) * TAU, 0)), _s.set(s, s * (0.8 + hash3(i, j, 65) * 0.6), s));
        this.grass.setMatrixAt(n++, _m);
      }
    this.grass.count = n;
    this.grass.instanceMatrix.needsUpdate = true;
  }

  // Florzinhas brancas, rosa e amarelas espalhadas pelos campos.
  makeFlowers() {
    const r = mulberry32(this.seed + 7);
    const N = this.Q.id === 'low' ? 2500 : 5000;
    const geo = new THREE.OctahedronGeometry(0.06, 0);
    geo.scale(1, 0.5, 1);
    this.geos.push(geo);
    const m = this.mat(new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x302028 }));
    const fm = new THREE.InstancedMesh(geo, m, N);
    let n = 0;
    for (let k = 0; k < N / 6; k++) {
      // aglomerados ao longo do caminho até a árvore (e um pouco além)
      const t = r() * 1.15;
      const cx = TREE.x * t + (r() - 0.5) * 260;
      const cz = TREE.z * t + (r() - 0.5) * 120;
      const hue = r();
      for (let j = 0; j < 6 && n < N; j++) {
        const x = cx + (r() - 0.5) * 4;
        const z = cz + (r() - 0.5) * 4;
        _m.compose(_v.set(x, groundH(x, z) + 0.18 + r() * 0.12, z), _q.setFromEuler(_e.set(0, r() * 3, 0)), _s.setScalar(0.8 + r() * 0.8));
        fm.setMatrixAt(n, _m);
        if (hue < 0.45) _c.setRGB(1, 1, 1);
        else if (hue < 0.8) _c.setRGB(1, 0.55, 0.78);
        else _c.setRGB(1, 0.9, 0.35);
        fm.setColorAt(n++, _c);
      }
    }
    fm.count = n;
    fm.frustumCulled = false;
    this.flowers = fm;
    this.scene.add(fm);
  }

  // ------------------------------------------------------------ coisas dreamcore
  makeFeatures() {
    const white = this.mat(new THREE.MeshStandardMaterial({ color: 0xfbf6f2, roughness: 0.6, emissive: 0x201818 }));
    const pinkM = this.mat(new THREE.MeshStandardMaterial({ color: 0xf4a6c8, roughness: 0.5, emissive: 0x2a1018 }));
    const frame = this.mat(new THREE.MeshStandardMaterial({ color: 0xe9e2f0, roughness: 0.5 }));
    const dark = this.mat(new THREE.MeshStandardMaterial({ color: 0x2a2630, roughness: 0.6 }));
    const box = (sx, sy, sz) => new THREE.BoxGeometry(sx, sy, sz);
    const solid = (x, z, hx, hz) => this.colliders.push([x - hx, x + hx, z - hz, z + hz]);
    const Y = (x, z) => groundH(x, z);
    // 1) uma porta branca sozinha no meio do campo
    {
      const x = 7;
      const z = -45;
      const y = Y(x, z);
      this.mesh(box(1.0, 2.1, 0.07), white, x, y + 1.05, z);
      for (const s of [-1, 1]) this.mesh(box(0.1, 2.2, 0.14), frame, x + s * 0.55, y + 1.1, z);
      this.mesh(box(1.2, 0.1, 0.14), frame, x, y + 2.2, z);
      this.mesh(new THREE.SphereGeometry(0.035, 8, 6), dark, x + 0.38, y + 1.0, z + 0.06);
      solid(x, z, 0.65, 0.1);
    }
    // 2) piscina de azulejos com colunas
    {
      const x = -17;
      const z = -96;
      const y = Y(x, z) + 0.03;
      const ct = checkerTex();
      ct.repeat.set(3, 3);
      this.texs.push(ct);
      const tile = this.mat(new THREE.MeshStandardMaterial({ map: ct, roughness: 0.25 }));
      const floor = this.mesh(new THREE.PlaneGeometry(12, 12), tile, x, y, z);
      floor.rotation.x = -Math.PI / 2;
      const water = this.mat(new THREE.MeshStandardMaterial({ color: 0x7fe0e8, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.75, emissive: 0x0a3036 }));
      const wv = this.mesh(new THREE.PlaneGeometry(5, 5), water, x, y + 0.02, z);
      wv.rotation.x = -Math.PI / 2;
      this.water = water;
      for (const [ax, az] of [
        [-5, -5],
        [5, -5],
        [-5, 5],
        [5, 5],
      ]) {
        this.mesh(new THREE.CylinderGeometry(0.28, 0.32, 4, 14), white, x + ax, y + 2, z + az);
        solid(x + ax, z + az, 0.32, 0.32);
      }
      for (const s of [-1, 1]) {
        this.mesh(box(10.8, 0.35, 0.6), white, x, y + 4.15, z + s * 5);
        this.mesh(box(0.6, 0.35, 10.8), white, x + s * 5, y + 4.15, z);
      }
    }
    // 3) escada para o nada
    {
      const x = 12;
      const z = -150;
      const y = Y(x, z);
      for (let k = 0; k < 16; k++) this.mesh(box(1.3, 0.22, 0.42), white, x, y + 0.11 + k * 0.26, z - k * 0.4);
      for (let k = 0; k < 16; k += 3) this.mesh(box(0.08, 0.26 * k + 0.1, 0.08), frame, x + 0.6, y + (0.26 * k + 0.1) / 2, z - k * 0.4);
      solid(x, z - 3.1, 0.7, 3.4);
    }
    // 4) balanço que balança sozinho
    {
      const x = -9;
      const z = -206;
      const y = Y(x, z);
      for (const s of [-1, 1])
        for (const f of [-1, 1]) {
          const leg = this.mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.9, 8), pinkM, x + s * 1.5 + f * 0, y + 1.35, z + f * 0.55);
          leg.rotation.x = f * 0.36;
          solid(x + s * 1.5, z, 0.1, 0.6);
        }
      const top = this.mesh(new THREE.CylinderGeometry(0.06, 0.06, 3.2, 8), pinkM, x, y + 2.7, z);
      top.rotation.z = Math.PI / 2;
      for (const s of [-0.65, 0.65]) {
        const piv = new THREE.Group();
        piv.position.set(x + s, y + 2.7, z);
        this.dynamic.add(piv);
        for (const r of [-0.22, 0.22]) this.mesh(new THREE.CylinderGeometry(0.012, 0.012, 2.1, 4), dark, r, -1.05, 0, piv);
        this.mesh(box(0.55, 0.05, 0.25), white, 0, -2.1, 0, piv);
        this.anims.push((t) => (piv.rotation.x = Math.sin(t * 1.3 + s * 2) * 0.45));
      }
    }
    // 5) TV de tubo chiando no meio da grama
    {
      const x = 9;
      const z = -266;
      const y = Y(x, z);
      this.mesh(box(0.8, 0.62, 0.62), this.mat(new THREE.MeshStandardMaterial({ color: 0x8a7f74, roughness: 0.7 })), x, y + 0.31, z);
      const cv = TEX.makeCanvas(64, 48);
      this.tvCanvas = cv;
      this.tvTex = TEX.toTex(cv, { repeat: false, mips: false });
      this.texs.push(this.tvTex);
      const scr = this.mat(new THREE.MeshBasicMaterial({ map: this.tvTex, color: new THREE.Color(1.4, 1.4, 1.4) }));
      const s = this.mesh(new THREE.PlaneGeometry(0.6, 0.46), scr, x, y + 0.33, z + 0.315);
      s.rotation.y = 0;
      solid(x, z, 0.42, 0.33);
    }
    // 6) arcos brancos em fila
    for (let k = 0; k < 3; k++) {
      const x = -11;
      const z = -322 - k * 7;
      const y = Y(x, z);
      for (const s of [-1, 1]) {
        this.mesh(box(0.5, 3.4, 0.5), white, x + s * 1.6, y + 1.7, z);
        solid(x + s * 1.6, z, 0.25, 0.25);
      }
      const arch = this.mesh(new THREE.TorusGeometry(1.6, 0.25, 8, 24, Math.PI), white, x, y + 3.4, z);
      arch.rotation.z = 0;
    }
    // 7) balões presos no chão
    {
      const x = 10;
      const z = -386;
      const y = Y(x, z);
      const cols = [0xff8fc4, 0x9fd8ff, 0xfff08a, 0xc9a7ff, 0xffffff];
      for (let k = 0; k < 7; k++) {
        const bm = this.mat(new THREE.MeshStandardMaterial({ color: cols[k % cols.length], roughness: 0.25, emissive: cols[k % cols.length], emissiveIntensity: 0.15 }));
        const bx = x + Math.cos(k * 2.4) * 0.8;
        const bz = z + Math.sin(k * 2.4) * 0.8;
        const h = 4 + (k % 3) * 0.7;
        const b = this.mesh(new THREE.SphereGeometry(0.45, 16, 12), bm, bx, y + h, bz);
        b.scale.y = 1.2;
        const str = this.mesh(new THREE.CylinderGeometry(0.006, 0.006, h - 0.45, 3), dark, (bx + x) / 2, y + (h - 0.45) / 2, (bz + z) / 2);
        str.lookAt(bx, y + h, bz);
        str.rotateX(Math.PI / 2);
        this.anims.push((t) => (b.position.y = y + h + Math.sin(t * 0.8 + k) * 0.15));
      }
    }
    // 8) placas
    const signs = [
      [-4, -22, 'você está seguro aqui'],
      [5, -176, 'não acorde'],
      [-5, -298, 'está tudo bem'],
      [6, -470, 'quase lá :)'],
    ];
    for (const [x, z, text] of signs) {
      const y = Y(x, z);
      const t = signTex(text);
      this.texs.push(t);
      const face = this.mat(new THREE.MeshStandardMaterial({ map: t, roughness: 0.7 }));
      const b = this.mesh(box(1.5, 0.48, 0.05), [frame, frame, frame, frame, face, frame], x, y + 1.6, z);
      b.rotation.y = Math.atan2(-x, 6) * 0.6;
      this.mesh(box(0.08, 1.4, 0.08), frame, x, y + 0.7, z - 0.04);
      solid(x, z, 0.1, 0.1);
    }
    // nuvens baixas flutuando
    const cloud = this.mat(new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x4a3a44 }));
    const r = mulberry32(this.seed + 31);
    this.clouds = [];
    for (let k = 0; k < 10; k++) {
      const grp = new THREE.Group();
      const n = 5 + Math.floor(r() * 4);
      for (let j = 0; j < n; j++) {
        const s = 2 + r() * 3;
        const m = this.mesh(new THREE.IcosahedronGeometry(1, 2), cloud, (j - n / 2) * 2.2 + r(), r() * 1.2, (r() - 0.5) * 2.5, grp);
        m.scale.set(s, s * 0.7, s);
      }
      grp.position.set((r() - 0.5) * 300, 26 + r() * 30, -r() * 560);
      this.dynamic.add(grp);
      this.clouds.push({ g: grp, v: 0.6 + r() * 0.8 });
    }
  }

  // ------------------------------------------------------------ a árvore
  makeTree() {
    const y = groundH(TREE.x, TREE.z);
    const g = new THREE.Group();
    g.position.set(TREE.x, y, TREE.z);
    this.treeGroup = g;
    this.treeY = y;
    this.barkMat = this.mat(new THREE.MeshStandardMaterial({ color: 0xf6c6dc, emissive: new THREE.Color(0.55, 0.18, 0.4), roughness: 0.4 }));
    this.leafMat = this.mat(new THREE.MeshStandardMaterial({ color: 0xff5aac, emissive: new THREE.Color(0.85, 0.08, 0.42), roughness: 0.45 }));
    this.glitchMat = this.mat(new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 2.2, 2.4) }));
    this.voidMat = this.mat(new THREE.MeshBasicMaterial({ color: 0x000000 }));
    const trunk = this.mesh(new THREE.CylinderGeometry(0.32, 0.62, 5.2, 12, 4), this.barkMat, 0, 2.6, 0, g);
    const tp = trunk.geometry.attributes.position;
    for (let i = 0; i < tp.count; i++) tp.setX(i, tp.getX(i) + Math.sin(tp.getY(i) * 0.6) * 0.15);
    trunk.geometry.computeVertexNormals();
    const r = mulberry32(5150);
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * TAU + r() * 0.5;
      const len = 2.2 + r();
      const br = this.mesh(new THREE.CylinderGeometry(0.08, 0.16, len, 7), this.barkMat, 0, 0, 0, g);
      const dir = new THREE.Vector3(Math.cos(a), 0.9 + r() * 0.4, Math.sin(a)).normalize();
      br.quaternion.setFromUnitVectors(UP, dir);
      br.position.set(dir.x * len * 0.5, 4.2 + r() * 0.8 + dir.y * len * 0.5, dir.z * len * 0.5);
    }
    this.blobs = [];
    const bp = [
      [0, 7.6, 0, 2.9],
      [2.2, 6.6, 0.6, 2.2],
      [-2.1, 6.8, -0.4, 2.3],
      [0.5, 6.5, 2.1, 2.1],
      [-0.6, 6.7, -2.2, 2.2],
      [1.6, 8.4, -1.2, 1.8],
      [-1.5, 8.5, 1.3, 1.8],
      [0, 9.4, 0.2, 1.6],
      [2.6, 7.6, -1.8, 1.4],
      [-2.7, 7.5, 1.7, 1.4],
    ];
    for (const [x, yy, z, R] of bp) {
      const m = this.mesh(new THREE.IcosahedronGeometry(R, 2), this.leafMat, x, yy, z, g);
      m.scale.y = 0.85;
      this.blobs.push({ m, x, y: yy, z });
    }
    // halo e luz
    this.dot = dotTex();
    this.texs.push(this.dot);
    this.haloMat = this.mat(new THREE.SpriteMaterial({ map: this.dot, color: new THREE.Color(1.0, 0.45, 0.8), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
    const halo = new THREE.Sprite(this.haloMat);
    halo.scale.set(20, 20, 1);
    halo.position.set(0, 7.2, 0);
    g.add(halo);
    this.halo = halo;
    this.treeLight = new THREE.PointLight(0xff7ac8, 30, 34, 1.4);
    this.treeLight.position.set(0, 5, 0);
    g.add(this.treeLight);
    // galhos que vão puxar o andarilho (cena de saída)
    this.tendrils = [];
    for (let k = 0; k < 4; k++) {
      const tg = new THREE.CylinderGeometry(0.035, 0.09, 1, 6).translate(0, 0.5, 0);
      const t = this.mesh(tg, this.leafMat, 0, 0, 0, g);
      t.visible = false;
      this.tendrils.push({ m: t, from: new THREE.Vector3(Math.cos(k * 1.7) * 1.2, 5.6 + k * 0.35, Math.sin(k * 1.7) * 1.2) });
    }
    this.dynamic.add(g);
  }

  // Falhas da árvore: pedaços que pulam, piscam em ciano ou somem por um instante.
  glitchTree(dt) {
    this.gT = (this.gT || 0) - dt;
    for (const b of this.blobs) {
      if (b.hold > 0) {
        b.hold -= dt;
        if (b.hold <= 0) {
          b.m.position.set(b.x, b.y, b.z);
          b.m.material = this.leafMat;
          b.m.visible = true;
        }
      }
    }
    if (this.gT > 0) return;
    this.gT = 0.08 + Math.random() * 0.5;
    const b = this.blobs[Math.floor(Math.random() * this.blobs.length)];
    const r = Math.random();
    b.hold = 0.05 + Math.random() * 0.18;
    if (r < 0.45) b.m.position.set(b.x + (Math.random() - 0.5) * 2.4, b.y + (Math.random() - 0.5) * 0.8, b.z + (Math.random() - 0.5) * 2.4);
    else if (r < 0.75) b.m.material = this.glitchMat;
    else if (r < 0.9) b.m.material = this.voidMat;
    else b.m.visible = false;
  }

  // ------------------------------------------------------------ alucinações
  makeHallucinations() {
    const H = [];
    const fade = (o) => {
      const m = this.mat(new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, ...o }));
      return m;
    };
    // figura alta e escura
    {
      const g = new THREE.Group();
      const m = fade({ color: 0x06040a });
      this.mesh(new THREE.CylinderGeometry(0.16, 0.24, 2.6, 8), m, 0, 1.3, 0, g);
      this.mesh(new THREE.SphereGeometry(0.22, 12, 8), m, 0, 2.8, 0, g);
      for (const s of [-1, 1]) {
        const a = this.mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.8, 6), m, s * 0.28, 1.6, 0, g);
        a.rotation.z = s * 0.08;
      }
      H.push({ g, mats: [m], y: 0, scale: 1.3 });
    }
    // olho enorme flutuando
    {
      const g = new THREE.Group();
      const w = fade({ color: 0xf6f2f0 });
      const iris = fade({ color: 0x4a7bd8 });
      const pup = fade({ color: 0x050505 });
      this.mesh(new THREE.SphereGeometry(1.6, 24, 16), w, 0, 0, 0, g);
      const ir = this.mesh(new THREE.CircleGeometry(0.75, 24), iris, 0, 0, 1.61, g);
      ir.position.z = 1.58;
      this.mesh(new THREE.CircleGeometry(0.34, 20), pup, 0, 0, 1.6, g);
      H.push({ g, mats: [w, iris, pup], y: 7, face: true, scale: 1 });
    }
    // porta flutuando
    {
      const g = new THREE.Group();
      const d = fade({ color: 0xfbf3f6 });
      const f = fade({ color: 0xd4c4e0 });
      this.mesh(new THREE.BoxGeometry(1, 2.1, 0.07), d, 0, 0, 0, g);
      this.mesh(new THREE.BoxGeometry(1.2, 2.3, 0.04), f, 0, 0, -0.04, g);
      H.push({ g, mats: [d, f], y: 3.5, face: true, scale: 1.5 });
    }
    // rosto sorridente no céu
    {
      const t = smileyTex();
      this.texs.push(t);
      const m = this.mat(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, opacity: 0 }));
      const g = new THREE.Sprite(m);
      g.scale.set(9, 9, 1);
      H.push({ g, mats: [m], y: 14, sprite: true, scale: 1 });
    }
    // bolhas coloridas
    {
      const g = new THREE.Group();
      const ms = [0xff9ad0, 0x9ad8ff, 0xfff38a, 0xc9a2ff].map((c) => fade({ color: c }));
      for (let k = 0; k < 9; k++) this.mesh(new THREE.SphereGeometry(0.3 + (k % 3) * 0.2, 14, 10), ms[k % 4], Math.cos(k) * 2, 1 + (k % 4) * 0.9, Math.sin(k * 1.3) * 2, g);
      H.push({ g, mats: ms, y: 1.5, scale: 1 });
    }
    for (const h of H) {
      h.g.visible = false;
      h.a = 0;
      this.dynamic.add(h.g);
    }
    this.halls = H;
    this.hallT = 6;
  }

  spawnHallucination(player) {
    const free = this.halls.filter((h) => !h.on);
    if (!free.length) return;
    const h = free[Math.floor(Math.random() * free.length)];
    const side = Math.random() < 0.5 ? -1 : 1;
    const ang = player.yaw + side * (0.35 + Math.random() * 0.7);
    const d = 22 + Math.random() * 30;
    const x = player.pos.x - Math.sin(ang) * d;
    const z = player.pos.z - Math.cos(ang) * d;
    h.g.position.set(x, groundH(x, z) + h.y, z);
    h.g.scale.setScalar(h.scale);
    h.g.visible = true;
    h.on = true;
    h.t = 0;
    h.life = 2.5 + Math.random() * 3;
  }

  updateHallucinations(dt, player) {
    const cam = this.game.camera;
    for (const h of this.halls) {
      if (!h.on) continue;
      h.t += dt;
      // olhar direto faz sumir
      _v.copy(h.g.position).sub(cam.position);
      const d = _v.length();
      player.forward(_v2);
      const look = _v.normalize().dot(_v2);
      if (look > 0.985 && h.t > 0.6 && !h.caught) {
        h.caught = true;
        h.life = Math.min(h.life, h.t + 0.12);
        this.game.glitch = Math.max(this.game.glitch, 0.35);
        this.game.audio.play('crackle', { gain: 0.08, rate: 1.6 });
      }
      const a = smoothstep(0, 1.2, h.t) * (1 - smoothstep(h.life - 0.8, h.life, h.t));
      for (const m of h.mats) m.opacity = a * (h.sprite ? 1 : 0.92);
      if (h.face) h.g.lookAt(cam.position.x, h.g.position.y, cam.position.z);
      h.g.position.y += Math.sin(this.time * 1.5) * dt * 0.2;
      if (h.t >= h.life || d < 6) {
        h.on = false;
        h.caught = false;
        h.g.visible = false;
      }
    }
  }

  // Brilhinhos rosa no ar.
  makeSparkles() {
    const r = mulberry32(this.seed + 51);
    const n = this.Q.id === 'low' ? 200 : 380;
    const g = new THREE.BufferGeometry();
    const p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      p[i * 3] = (r() - 0.5) * 60;
      p[i * 3 + 1] = r() * 10;
      p[i * 3 + 2] = (r() - 0.5) * 60;
    }
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    this.geos.push(g);
    this.sparkMat = this.mat(new THREE.PointsMaterial({ map: this.dot, color: new THREE.Color(1.6, 0.8, 1.4), size: 0.12, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.sparks = new THREE.Points(g, this.sparkMat);
    this.sparks.frustumCulled = false;
    this.scene.add(this.sparks);
    this.sparkPh = Array.from({ length: n }, () => r() * TAU);
  }

  updateSparkles(dt, cam) {
    const t = this.time;
    const sp = this.sparks.geometry.attributes.position;
    const wrap = (v, c) => c + ((((v - c + 30) % 60) + 60) % 60) - 30;
    for (let i = 0; i < sp.count; i++) {
      const ph = this.sparkPh[i];
      let y = sp.getY(i) + dt * (0.15 + Math.sin(t + ph) * 0.1);
      if (y > cam.y + 8) y -= 10;
      if (y < cam.y - 2) y += 10;
      sp.setXYZ(i, wrap(sp.getX(i) + Math.sin(t * 0.4 + ph) * dt * 0.3, cam.x), y, wrap(sp.getZ(i), cam.z));
    }
    sp.needsUpdate = true;
  }

  // O próprio andarilho (cena de saída).
  makeMe() {
    this.me = new NPC(this, {
      id: 'eu',
      name: '',
      role: '',
      x: 0,
      z: 0,
      yaw: 0,
      h: 1.75,
      look: { skin: '#c8956c', hair: '#2a1c12', hairStyle: 'short', suit: '#3c4a3a', accent: '#d8c070', arms: 'down', eyes: '#2c1d12', beard: 'rgba(40,25,15,0.35)' },
    });
    this.me.tag.visible = false;
    this.me.amb.value.set(0.75, 0.6, 0.7);
    this.me.root.visible = false;
  }

  spawnItems() {
    const g = this.game;
    const items = [
      { type: 'note', key: 'l16:n1', x: 2.2, z: -12, rot: 0.6 },
      { type: 'note', key: 'l16:n2', x: -13, z: -92, rot: 1.4 },
      { type: 'note', key: 'l16:n3', x: 8, z: -262, rot: 2.6 },
      { type: 'water', key: 'l16:w1', x: 6, z: -148 },
    ];
    for (const it of items) {
      if (this.taken.has(it.key)) continue;
      it.y = groundH(it.x, it.z) + 0.03;
      it.light = 0.7;
      g.items.spawn(it, this.dynamic);
    }
  }

  // ------------------------------------------------------------ quadro
  update(dt, player) {
    const g = this.game;
    const p = player.pos;
    this.time += dt;
    const t = this.time;
    if (this.wake === undefined) this.startWake();
    if (this.wake.active) this.wake.update(dt);
    if (this.cine) this.updateCine(dt);
    const cam = g.camera.position;
    this.sky.position.copy(cam);
    this.skyMat.uniforms.uTime.value = t;
    this.updateSun(p);
    if (!this.lastP || Math.hypot(p.x - this.lastP.x, p.z - this.lastP.z) > 2.5) {
      this.lastP = { x: p.x, z: p.z };
      this.refreshGrass(p.x, p.z);
    }
    for (const a of this.anims) a(t);
    for (const c of this.clouds) {
      c.g.position.x += c.v * dt;
      if (c.g.position.x > 200) c.g.position.x -= 400;
    }
    this.updateTV(dt);
    this.updateSparkles(dt, cam);
    this.glitchTree(dt);
    const pulse = 0.5 + 0.5 * Math.sin(t * 1.7);
    this.leafMat.emissiveIntensity = 0.85 + pulse * 0.35 + (this.cineFlash || 0);
    this.haloMat.opacity = 0.25 + pulse * 0.15;
    this.treeLight.intensity = 26 + pulse * 10;
    this.updateMusic();
    if (this.wake.active || this.cine) {
      this.applyStage(dt);
      return;
    }
    // o quanto o andarilho já avançou
    this.walked = Math.max(this.walked, Math.hypot(p.x - this.spawn.x, p.z - this.spawn.z));
    const w = this.walked;
    const st = w < 250 ? 0 : w < 400 ? 1 : w < 499 ? 2 : 3;
    if (st !== this.stage) this.onStage(st);
    this.applyStage(dt);
    // alucinações
    if (st < 2 && w > 70) {
      this.hallT -= dt;
      if (this.hallT <= 0) {
        this.hallT = st === 0 ? 10 + Math.random() * 10 : 4 + Math.random() * 5;
        this.spawnHallucination(player);
      }
    }
    this.updateHallucinations(dt, player);
    // falhas na tela (250–400 m)
    if (st === 1 && Math.random() < dt * 0.7) g.glitch = Math.max(g.glitch, 0.25 + Math.random() * 0.55);
    // falas pelo caminho
    this.talk(w, p);
  }

  startWake() {
    const g = this.game;
    const s = this.spawn;
    this.wake = standardWake(
      this,
      s.x,
      s.z,
      s.yaw,
      [
        [1.0, 'Grama macia nas costas. Um céu azul-claro, com nuvens de algodão.'],
        [4.4, 'Montanhas cor-de-rosa até onde a vista alcança.'],
        [7.4, 'Nenhum zumbido. Nenhuma lâmpada. Só vento morno.'],
        [10.2, ''],
      ],
      {
        sound: 'breath',
        done: () =>
          g.hud.say(
            [
              'Que lugar é esse…? É lindo.',
              'O vento é morno. Tem cheiro de grama e de algodão-doce.',
              'Pela primeira vez desde que tudo começou… eu não tô com medo.',
              'É tão relaxante. Acho que eu podia ficar aqui pra sempre.',
            ],
            () => g.hud.objective('Atravesse os campos. A saída fica a mais de 500 metros.', 6),
          ),
      },
    );
  }

  // Falas do andarilho conforme ele avança (uma de cada vez).
  talk(w, p) {
    const g = this.game;
    if (g.hud.dlg) return;
    const lines = [
      [120, 'a', ['Essas montanhas… elas não acabam nunca. Parecem pintadas à mão.', 'É tão calmo. Dá vontade de deitar na grama e esquecer de tudo.']],
      [260, 'b', ['Minha vista… tá embaçando. Tudo bem. Tudo bem. É só cansaço.', 'Eu vi alguma coisa ali. Ou não vi. Tanto faz. Aqui é seguro.']],
      [402, 'c', ['O céu… ficou todo rosa. E aquelas estrelas, de dia…', 'Olha o tamanho daquele planeta. Isso é magnífico.', 'Eu nunca vi nada tão bonito na minha vida inteira.']],
      [500, 'd', ['…Voltou ao normal. Como se nada tivesse acontecido.', 'Ali. Uma árvore. A única árvore daqui. Ela brilha.']],
    ];
    this.said = this.said || new Set();
    for (const [d, id, l] of lines)
      if (w >= d && !this.said.has(id)) {
        this.said.add(id);
        g.hud.say(l);
        return;
      }
    if (this.said.has('d') && !this.said.has('e') && Math.hypot(p.x - TREE.x, p.z - TREE.z) < 14) {
      this.said.add('e');
      g.hud.say(['Ela tá falhando, como uma imagem com defeito…', 'Mas é linda. Parece que ela tá me chamando.']);
    }
  }

  onStage(st) {
    const g = this.game;
    const prev = this.stage;
    this.stage = st;
    if (st === 1) g.hud.message('A vista começa a embaçar. As bordas do mundo tremem.', 4);
    if (st === 2) {
      g.glitch = 0.6;
      this.planet.visible = true;
      this.planetRise = 0;
      for (const h of this.halls) {
        h.on = false;
        h.g.visible = false;
      }
      g.hud.message('Tudo clareia de uma vez. O céu inteiro fica rosa.', 4);
    }
    if (st === 3 && prev !== 3) {
      g.glitch = 1;
      g.audio.play('transition', { gain: 0.2, rate: 1.4 });
      g.completeObjective('campos', 'De repente, tudo volta ao normal. À frente, uma árvore brilhando.');
    }
  }

  // Aproxima os valores visuais/sonoros do estágio atual.
  applyStage(dt) {
    const g = this.game;
    const w = this.walked;
    const st = this.stage;
    const K = this.k;
    const pinkT = st === 0 ? smoothstep(20, 250, w) * 0.5 : st === 1 ? 0.5 + 0.3 * smoothstep(250, 400, w) : st === 2 ? 1 : 0;
    const blurT = st === 1 ? 0.25 + 0.45 * smoothstep(250, 330, w) + Math.sin(this.time * 0.9) * 0.12 : 0;
    const on2 = st === 2 ? 1 : 0;
    K.pink = damp(K.pink, pinkT, 1.2, dt);
    K.blur = damp(K.blur, blurT, st === 1 ? 1 : 4, dt);
    K.sky = damp(K.sky, on2, on2 ? 0.8 : 3, dt);
    K.stars = damp(K.stars, on2, on2 ? 0.5 : 3, dt);
    K.planet = damp(K.planet, on2, on2 ? 0.35 : 2.5, dt);
    K.fx = damp(K.fx, on2, on2 ? 0.6 : 3, dt);
    K.rate = damp(K.rate, on2 ? 0.72 : 1, on2 ? 0.5 : 3, dt);
    this.blur = K.blur;
    const u = g.post.u;
    const B = this.base;
    const pk = Math.max(K.pink, K.sky);
    u.uExposure.value = B.exposure + pk * 0.12;
    u.uTint.value.setRGB(lerp(B.tint[0], 1.18, pk), lerp(B.tint[1], 0.86, pk), lerp(B.tint[2], 1.12, pk));
    u.uSat.value = B.sat + pk * 0.3;
    u.uBloom.value = B.bloom + pk * 0.4;
    g.post.preMat.uniforms.uThreshold.value = B.bloomThreshold - pk * 0.25;
    this.scene.fog.color.copy(this.fogBase).lerp(this.fogPink, Math.max(K.pink * 0.5, K.sky));
    this.scene.background.copy(this.scene.fog.color);
    this.skyMat.uniforms.uPink.value = Math.max(K.sky, K.pink * 0.22);
    this.skyMat.uniforms.uStars.value = K.stars;
    this.hemi.color.setRGB(1, lerp(0.94, 0.75, pk), lerp(0.97, 0.9, pk));
    this.sparkMat.opacity = 0.35 + pk * 0.65;
    // planeta subindo atrás das montanhas
    const pl = this.planet;
    if (pl.visible) {
      this.planetRise = Math.min(1, (this.planetRise || 0) + dt * 0.08);
      const el = 0.18 + 0.2 * smoothstep(0, 1, this.planetRise);
      _v.set(Math.sin(0.5) * Math.cos(el), Math.sin(el), -Math.cos(0.5) * Math.cos(el)).multiplyScalar(2300);
      pl.position.copy(g.camera.position).add(_v);
      pl.scale.setScalar(420);
      pl.rotation.y = this.time * 0.01;
      this.planetMat.uniforms.uA.value = K.planet;
      this.planetMat.uniforms.uTime.value = this.time;
      this.ringMat.opacity = K.planet * 0.55;
      if (K.planet < 0.01 && st !== 2) pl.visible = false;
    }
  }

  updateMusic() {
    const a = this.game.audio;
    if (!a.ready) return;
    if (!this.track) {
      if (a.B.l16) this.track = a.startTrack('l16', 0.6, 3);
      else if (!this.loading) {
        this.loading = true;
        a.loadTrack('l16', 'assets/audio/l16_lullaby.m4a');
      }
      return;
    }
    this.musT = (this.musT || 0) + 1;
    if (this.musT % 10) return;
    this.track.setRate(this.k.rate, 0.4);
    this.track.setFx(this.k.fx, 0.4);
  }

  updateTV(dt) {
    this.tvT = (this.tvT || 0) - dt;
    if (this.tvT > 0) return;
    this.tvT = 0.08;
    const c = this.tvCanvas.getContext('2d');
    const img = c.createImageData(64, 48);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random() * 255;
      img.data[i] = v;
      img.data[i + 1] = v * 0.92;
      img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    c.putImageData(img, 0, 0);
    this.tvTex.needsUpdate = true;
  }

  // ------------------------------------------------------------ cena de saída
  startCine() {
    const g = this.game;
    const P = g.player;
    this.cine = { t: 0, subI: 0, x0: P.pos.x, z0: P.pos.z };
    P.frozen = true;
    g.input.enabled = false;
    g.hud.show(false);
    g.hud.stopSay();
    const bars = document.createElement('div');
    bars.id = 'cine';
    bars.innerHTML = '<div class="cb top"></div><div class="cb bot"><div id="cine-sub"></div></div>';
    document.body.appendChild(bars);
    this.bars = bars;
    this.cineSubs = [
      [0.3, 'A árvore se inclina na sua direção.'],
      [2.0, 'Os galhos te envolvem. Não dói. É quente.'],
      [4.0, 'Ela te puxa para dentro dela.'],
      [5.6, ''],
    ];
    const me = this.me;
    me.root.visible = true;
    g.completeObjective('arvore', 'A árvore te puxa para dentro.');
    g.audio.play('whisper', { gain: 0.2, rate: 0.8, wet: 1.2 });
    g.audio.play('creak', { gain: 0.25, rate: 0.6, wet: 0.8 });
  }

  updateCine(dt) {
    const g = this.game;
    const C = this.cine;
    C.t += dt;
    const t = C.t;
    while (C.subI < this.cineSubs.length && t >= this.cineSubs[C.subI][0]) {
      const el = document.getElementById('cine-sub');
      if (el) el.textContent = this.cineSubs[C.subI][1];
      C.subI++;
    }
    const me = this.me;
    const ty = this.treeY;
    // direção até o tronco
    const dx = TREE.x - C.x0;
    const dz = TREE.z - C.z0;
    const D = Math.hypot(dx, dz) || 1;
    const ux = dx / D;
    const uz = dz / D;
    const pull = smoothstep(1.4, 4.4, t);
    const into = smoothstep(3.8, 4.9, t);
    const cx = C.x0 + ux * (D - 0.2) * pull;
    const cz = C.z0 + uz * (D - 0.2) * pull;
    const cy = groundH(cx, cz) + Math.sin(pull * Math.PI) * 0.9 + into * 1.6;
    me.root.position.set(cx, cy, cz);
    me.root.rotation.set(-pull * 0.5, Math.atan2(dx, dz), 0);
    me.root.scale.setScalar(1 - into * 0.92);
    const reach = smoothstep(0.3, 1.4, t);
    for (const a of me.arms) {
      a.sh.rotation.x = -reach * 1.5;
      a.sh.rotation.z = a.sx * 0.15;
      a.el.rotation.x = -reach * 0.25;
    }
    // galhos crescendo até o peito
    const grow = smoothstep(0.6, 2.2, t) * (1 - into);
    _v.set(cx - TREE.x, cy - ty + 1.2, cz - TREE.z);
    for (const td of this.tendrils) {
      td.m.visible = grow > 0.01;
      _v2.copy(_v).sub(td.from);
      const L = _v2.length();
      td.m.position.copy(td.from);
      td.m.quaternion.setFromUnitVectors(UP, _v2.normalize());
      td.m.scale.set(1, Math.max(0.01, L * grow), 1);
    }
    this.cineFlash = into * 3 + smoothstep(4.6, 5.0, t) * 2;
    if (t > 3.9 && !C.glitched) {
      C.glitched = true;
      g.glitch = 0.8;
      g.audio.play('transition', { gain: 0.3, rate: 0.6 });
    }
    // câmera ao lado, afastando devagar
    const sx = -uz;
    const sz = ux;
    const midx = (C.x0 + TREE.x) / 2;
    const midz = (C.z0 + TREE.z) / 2;
    const back = 3 + smoothstep(0, 6, t) * 3;
    const cam = g.camera;
    cam.position.set(midx + sx * (5.5 + back) - ux * 2.5, groundH(midx, midz) + 2.6 + back * 0.5, midz + sz * (5.5 + back) - uz * 2.5);
    cam.up.set(0, 1, 0);
    cam.lookAt(lerp(cx, TREE.x, 0.5), ty + 3.6 + pull * 1.2, lerp(cz, TREE.z, 0.5));
    // tela preta e o próximo nível
    if (t > 4.7) {
      g.fadeTarget = 1;
      g.post.u.uFadeColor.value.setRGB(0, 0, 0);
    }
    if (t > 6.6 && !C.done) {
      C.done = true;
      g.fade = 1;
      const n = g.nextLevelIndex();
      if (n >= 0) g.loadLevel(n);
    }
  }

  // ------------------------------------------------------------ física e interação
  collide(p, r) {
    const dx = p.x - CEN.x;
    const dz = p.z - CEN.z;
    const d = Math.hypot(dx, dz);
    if (d > R_WALK) {
      p.x = CEN.x + (dx / d) * R_WALK;
      p.z = CEN.z + (dz / d) * R_WALK;
      if (!this.toldEdge) {
        this.toldEdge = true;
        this.game.hud.message('Por mais que você ande, as montanhas continuam no mesmo lugar.', 4);
      }
    }
    for (const c of this.circles) {
      const ex = p.x - c[0];
      const ez = p.z - c[1];
      const dd = Math.hypot(ex, ez);
      const rr = r + c[2];
      if (dd < rr && dd > 1e-4) {
        p.x = c[0] + (ex / dd) * rr;
        p.z = c[1] + (ez / dd) * rr;
      }
    }
    for (const b of this.colliders) if (p.x > b[0] - 2 && p.x < b[1] + 2 && p.z > b[2] - 2 && p.z < b[3] + 2) pushCircle(p, r, b[0], b[1], b[2], b[3]);
    return p;
  }

  groundY(x, z) {
    return groundH(x, z);
  }

  surfaceAt() {
    return 'grass';
  }

  los() {
    return true;
  }

  lightLevel() {
    return 1;
  }

  interactable(player) {
    if (this.cine || (this.wake && this.wake.active)) return null;
    const p = player.pos;
    if (Math.hypot(p.x - TREE.x, p.z - TREE.z) < 3.4) return { label: 'Tocar a árvore', action: () => this.startCine() };
    return null;
  }

  navTarget() {
    return this.exit;
  }

  dispose() {
    if (this.wake) this.wake.dispose();
    if (this.bars) this.bars.remove();
    this.bars = null;
    const g = this.game;
    g.post.u.uFadeColor.value.setRGB(0, 0, 0);
    this.me.dispose();
    super.dispose();
    for (const o of [this.sky, this.planet, this.ground, this.mountains, this.grass, this.flowers, this.sparks]) {
      this.scene.remove(o);
      if (o.isInstancedMesh) o.dispose();
    }
    for (const x of this.geos) x.dispose();
    for (const m of this.mats) m.dispose();
    for (const t of this.texs) t.dispose();
    this.scene.remove(this.hemi, this.sun, this.sun.target);
  }
}
