// Nível 88 — "Lago Silencioso": uma massa de água imóvel, gelada e sem vida
// no fundo de um vale de floresta fechada, sempre na penumbra. O lago "sifona"
// os sons: perto dele tudo fica abafado, e dentro d'água sussurros sobem pelo
// corpo. O dia é escuro; a noite, quase cega.
//
// Entidades: a Criatura (persegue quem vê; só a cabana com a porta fechada
// salva) e a Sombra (observa de longe entre as árvores e some).
// Objetivo: achar a passagem subterrânea (uma caverna no paredão a leste) e
// entrar nela. Último nível do jogo.
import * as THREE from 'three';
import { pushCircle } from './grid.js';
import { GeoBuilder, litMaterial } from '../materials.js';
import { getTex } from '../textures.js';
import { clamp, damp, hash3, mulberry32, smoothstep, TAU, fbm } from '../util.js';
import { SKY_GLSL } from './outdoor.js';
import { deadTree } from './level10_1_lake.js';
import {
  WORLD,
  CAVE,
  DEEP,
  zc,
  halfW,
  shoreS,
  trailZ,
  groundH,
  makeTerrainGeometry,
  patchTerrain,
  makeWaterGeometry,
  makeWaterMaterial,
  spruceGeometry,
  spruceFarGeometry,
  scatterTrees,
} from './level88_world.js';
import { Cabin, buildScenery, buildDock, buildCamp, buildCave, signMesh, noiseSprite } from './level88_props.js';
import { Creature, Shade } from './level88_creature.js';

const yieldFrame = () => new Promise((r) => setTimeout(r, 0));
const CYCLE = 420; // segundos de um dia inteiro
const SUN = new THREE.Vector3(0.35, 0.55, -0.75).normalize();

const ENDING =
  'A passagem desce em espiral pela rocha fria. Lá em cima, o lago guarda tudo o que você não disse. ' +
  'Depois de muito tempo no escuro, um som: seus próprios passos — finalmente audíveis. E então outro, logo atrás, no mesmo ritmo. ' +
  'Você não se vira. A fotografia no bolso está quente. Quando a luz aparece no fim do túnel, ela tem a cor de uma manhã comum, ' +
  'com cheiro de chuva e asfalto molhado. Pela primeira vez desde o carpete amarelo, o silêncio não é do lago. É só silêncio.';

const _v = new THREE.Vector3();
const _f = new THREE.Vector3();
const _u = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();
const _size = new THREE.Vector2();
const _c1 = new THREE.Color();

// cores dia → noite
const DAY = {
  fog: new THREE.Color(0.15, 0.165, 0.18),
  top: new THREE.Color(0.15, 0.165, 0.185),
  hor: new THREE.Color(0.22, 0.235, 0.25),
  hemi: 2.6,
  dir: 1.0,
  fogD: 0.0105,
  exp: 1.2,
};
const NIGHT = {
  fog: new THREE.Color(0.008, 0.01, 0.013),
  top: new THREE.Color(0.003, 0.004, 0.006),
  hor: new THREE.Color(0.01, 0.012, 0.015),
  hemi: 0.1,
  dir: 0.0,
  fogD: 0.026,
  exp: 1.15,
};

export class Level88 {
  constructor(game) {
    this.game = game;
    this.Q = game.Q;
    this.scene = game.scene;
    this.indoor = false;
    this.num = 88;
    this.camFar = 700;
    this.walkSpeed = 2.2;
    this.baseWalk = 2.2;
    this.flashIntensity = 26;
    this.taken = new Set();
    this.colliders = [];
    this.circles = [];
    this.dynamic = new THREE.Group();
    this.scene.add(this.dynamic);
    this.time = 0;
    this.clock = CYCLE * 0.06;
    this.dayK = 1;
    this.safeT = 40;
    this.sanityExtra = 0;
    this.look = {
      exposure: 1.0,
      tint: [0.96, 1.0, 1.04],
      sat: 0.55,
      contrast: 1.1,
      lift: [0.004, 0.005, 0.006],
      bloom: 0.08,
      bloomThreshold: 1.6,
      fog: [DAY.fog.r, DAY.fog.g, DAY.fog.b],
      lightColor: [1, 1, 1],
      flashlight: false,
      ambience: 'level88',
      reverb: 1.6,
      sanityDrain: 0.08,
    };
    this.objectives = [
      { id: 'cave', text: 'Encontre a passagem subterrânea' },
      { id: 'enter', text: 'Entre na caverna' },
    ];
    // lugares
    const sx = -214;
    this.spawn = { x: sx, z: trailZ(sx) - 0.5, yaw: -Math.PI / 2 - 0.15 };
    this.exit = { x: CAVE.x + 1, z: CAVE.z };
    const cx = -38;
    this.cabin = new Cabin(this, cx, trailZ(cx) + 8.5);
    this.campPos = { x: 96, z: trailZ(96) + 5.5 };
    this.dockX = cx + 4;
    // cena
    this.fog = new THREE.FogExp2(DAY.fog.clone(), DAY.fogD);
    this.scene.fog = this.fog;
    this.scene.background = DAY.fog.clone();
    this.hemi = new THREE.HemisphereLight(0x8a96a4, 0x1c1a14, DAY.hemi);
    this.sun = new THREE.DirectionalLight(0x9eaab8, DAY.dir);
    this.sun.position.copy(SUN).multiplyScalar(100);
    this.scene.add(this.hemi, this.sun);
    this.makeSky();
  }

  trailZ(x) {
    return trailZ(x);
  }

  // ------------------------------------------------------------ céu
  makeSky() {
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTop: { value: DAY.top.clone() },
        uHor: { value: DAY.hor.clone() },
        uFog: { value: DAY.fog.clone() },
        uSun: { value: SUN.clone() },
        uDay: { value: 1 },
        uTime: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = position;
          vec4 p = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
          gl_Position = p.xyww;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uTop, uHor, uFog, uSun;
        uniform float uDay, uTime;
        varying vec3 vDir;
        ${SKY_GLSL}
        float h31( vec3 p ) { p = fract( p * 0.1031 ); p += dot( p, p.yzx + 33.33 ); return fract( ( p.x + p.y ) * p.z ); }
        void main() {
          vec3 d = normalize( vDir );
          float h = d.y;
          vec3 col = mix( uHor, uTop, smoothstep( 0.0, 0.6, h ) );
          // nuvens baixas e pesadas
          vec2 cp = d.xz / max( h + 0.08, 0.03 ) * 0.5 + vec2( uTime * 0.002, uTime * 0.001 );
          float n = sFbm( cp * 1.2 );
          float n2 = sFbm( cp * 3.5 + 7.0 );
          col *= 0.75 + n * 0.5 + n2 * 0.12;
          // o sol escondido atrás das nuvens (só um clarão)
          float sd = max( dot( d, uSun ), 0.0 );
          col += vec3( 0.06, 0.065, 0.07 ) * pow( sd, 8.0 ) * uDay * ( 0.6 + n * 0.6 );
          // à noite, poucas estrelas nas brechas
          vec3 sp = d * 220.0;
          vec3 cc = floor( sp );
          float st = step( 0.985, h31( cc ) ) * smoothstep( 0.1, 0.0, length( fract( sp ) - 0.5 ) - 0.02 );
          col += vec3( 0.5 ) * st * ( 1.0 - uDay ) * smoothstep( 0.62, 0.42, n ) * smoothstep( 0.05, 0.3, h );
          col = mix( uFog, col, smoothstep( -0.02, 0.22, h ) );
          gl_FragColor = vec4( col, 1.0 );
        }`,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(600, 32, 16), mat);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
    this.scene.add(this.sky);
  }

  // ------------------------------------------------------------ construção
  async preload(px, pz, progress) {
    const Q = this.Q;
    const S = Q.tex;
    let step = 0;
    const STEPS = 9;
    const tick = async () => {
      step++;
      if (progress) progress(Math.min(1, step / STEPS));
      await yieldFrame();
    };
    const fl = getTex('l88Floor', S);
    const mud = getTex('l88Mud', S);
    const rock = getTex('l88Rock', S);
    const bark = getTex('l88Bark', Math.min(S, 512));
    const needles = getTex('l88Needles', Math.min(S, 512));
    const far = getTex('l88SpruceFar', Math.min(S, 512));
    const fern = getTex('l88Fern', Math.min(S, 512));
    const logs = getTex('l88Logs', Math.min(S, 512));
    const planks = getTex('planks', Math.min(S, 512));
    const M = {
      terrain: litMaterial(Q, { map: fl.map, normalMap: fl.normalMap, normalScale: 1.2, roughness: 0.95 }),
      bark: litMaterial(Q, { map: bark.map, normalMap: bark.normalMap, roughness: 0.95 }),
      needles: litMaterial(Q, { map: needles.map, roughness: 0.85, side: THREE.DoubleSide, color: 0xe0ecd8 }),
      core: litMaterial(Q, { color: 0x16241a, roughness: 1 }),
      far: litMaterial(Q, { map: far.map, roughness: 0.9, side: THREE.DoubleSide, color: 0xc0c8bc }),
      fern: litMaterial(Q, { map: fern.map, roughness: 0.85, side: THREE.DoubleSide }),
      dead: litMaterial(Q, { map: bark.map, vertexColors: true, roughness: 0.95 }),
      rock: litMaterial(Q, { map: rock.map, normalMap: rock.normalMap, vertexColors: true, roughness: 0.85 }),
      logs: litMaterial(Q, { map: logs.map, normalMap: logs.normalMap, vertexColors: true, roughness: 0.9 }),
      wood: litMaterial(Q, { map: planks.map, normalMap: planks.normalMap, vertexColors: true, roughness: 0.85, side: THREE.DoubleSide }),
      tunnel: litMaterial(Q, { map: rock.map, normalMap: rock.normalMap, vertexColors: true, roughness: 0.7, side: THREE.DoubleSide }),
      reeds: litMaterial(Q, { map: getTex('l101Reeds', Math.min(S, 512)).map, roughness: 0.9, side: THREE.DoubleSide, color: 0x8a8a78 }),
    };
    for (const k of ['needles', 'far', 'fern', 'reeds']) {
      M[k].alphaTest = 0.45;
      // folhagem: os dois lados recebem a mesma luz (sem inverter a normal)
      M[k].onBeforeCompile = (sh) => {
        sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nnormal = normalize( vNormal );');
      };
      M[k].customProgramCacheKey = () => 'l88-foliage';
    }
    this.M = M;
    patchTerrain(M.terrain, { mud: mud.map, rock: rock.map });
    // terreno
    const tStep = Q.id === 'low' ? 3.0 : Q.id === 'medium' ? 2.2 : 1.7;
    this.terrain = new THREE.Mesh(makeTerrainGeometry(tStep), M.terrain);
    this.terrain.matrixAutoUpdate = false;
    this.scene.add(this.terrain);
    await tick();
    // água
    this.makeWater();
    await tick();
    // árvores
    const avoid = [
      { x: this.cabin.x, z: this.cabin.z, r: 9 },
      { x: this.campPos.x, z: this.campPos.z, r: 7 },
      { x: this.spawn.x, z: this.spawn.z, r: 5 },
      { x: CAVE.x, z: CAVE.z, r: 12 },
      { x: this.dockX, z: zc(this.dockX) + halfW(this.dockX), r: 6 },
    ];
    this.trees = scatterTrees(avoid);
    this.makeTrees();
    await tick();
    // pedras, troncos, cabana, píer, acampamento, caverna
    const gb = new GeoBuilder();
    const gbLog = new GeoBuilder();
    const gbRock = new GeoBuilder();
    const gbTun = new GeoBuilder();
    const sc = buildScenery(this, gb, gbLog, gbRock);
    this.circles.push(...sc.circles);
    this.cabin.build(gb, gbLog, M);
    this.cabin.colliders(this.colliders);
    this.dock = buildDock(gb, this.dockX, zc(this.dockX) + halfW(this.dockX) + 2.5, -1);
    const camp = buildCamp(gb, gbLog, gbRock, this.campPos.x, this.campPos.z, this.circles);
    buildCave(gbRock, gbTun, this.circles);
    await tick();
    const add = (b, mat) => {
      const m = new THREE.Mesh(b.build(), mat);
      m.matrixAutoUpdate = false;
      this.dynamic.add(m);
      return m;
    };
    add(gb, M.wood);
    add(gbLog, M.logs);
    add(gbRock, M.rock);
    add(gbTun, M.tunnel);
    this.cabin.dynamic(M, this.dynamic);
    this.makeSigns();
    this.makeReeds();
    this.makeFerns();
    this.makeMist();
    await tick();
    // itens: carta, águas e bilhetes
    this.spawnItems(camp);
    // entidades
    this.creature = new Creature(this);
    this.shade = new Shade(this);
    await tick();
    this.refreshTrees(px, pz, true);
    this.refreshFerns(px, pz);
    await tick();
    this.lastP = { x: px, z: pz };
    await tick();
  }

  // ------------------------------------------------------------ água e espelho
  makeWater() {
    const Q = this.Q;
    this.waterMat = makeWaterMaterial(!Q.lambert);
    this.waterU = this.waterMat.uniforms;
    this.water = new THREE.Mesh(makeWaterGeometry(Q.id === 'low'), this.waterMat);
    this.water.renderOrder = 1;
    this.water.frustumCulled = false;
    this.scene.add(this.water);
    this.mirrorScale = { low: 0.28, medium: 0.4, high: 0.5, ultra: 0.6 }[Q.id] || 0.4;
    this.mirrorCam = new THREE.PerspectiveCamera();
    this.mirrorRT = new THREE.WebGLRenderTarget(4, 4, { type: this.game.post.type });
    this.waterU.tMirror.value = this.mirrorRT.texture;
    this.waterU.uMirror.value = 1;
    this.clipPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 1e6);
    this.game.renderer.clippingPlanes = [this.clipPlane];
    this.rings = this.waterU.uRings.value;
    this.ringI = 0;
  }

  renderMirror() {
    const r = this.game.renderer;
    const cam = this.game.camera;
    // pula o reflexo quando a água está fora de vista ou longe
    const p = this.game.player.pos;
    if (Math.abs(shoreS(p.x, p.z)) > 140) return;
    r.getDrawingBufferSize(_size);
    const w = Math.max(4, Math.floor(_size.x * this.mirrorScale));
    const h = Math.max(4, Math.floor(_size.y * this.mirrorScale));
    if (this.mirrorRT.width !== w || this.mirrorRT.height !== h) this.mirrorRT.setSize(w, h);
    const mc = this.mirrorCam;
    mc.position.set(cam.position.x, -cam.position.y, cam.position.z);
    _f.set(0, 0, -1).applyQuaternion(cam.quaternion);
    _f.y = -_f.y;
    _u.set(0, 1, 0).applyQuaternion(cam.quaternion);
    _u.y = -_u.y;
    mc.up.copy(_u);
    mc.lookAt(_v.copy(mc.position).add(_f));
    mc.updateMatrixWorld();
    mc.projectionMatrix.copy(cam.projectionMatrix);
    this.waterU.uTexMat.value
      .set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1)
      .multiply(mc.projectionMatrix)
      .multiply(mc.matrixWorldInverse);
    const old = r.getRenderTarget();
    this.water.visible = false;
    if (this.fernMesh) this.fernMesh.visible = false;
    if (this.mist) this.mist.visible = false;
    if (this.breath) this.breath.visible = false;
    this.clipPlane.constant = 0.03;
    r.setRenderTarget(this.mirrorRT);
    r.clear();
    r.render(this.scene, mc);
    r.setRenderTarget(old);
    this.clipPlane.constant = 1e6;
    this.water.visible = true;
    if (this.fernMesh) this.fernMesh.visible = true;
    if (this.mist) this.mist.visible = true;
    if (this.breath) this.breath.visible = true;
  }

  // ------------------------------------------------------------ árvores
  makeTrees() {
    const Q = this.Q;
    const M = this.M;
    const tiers = Q.id === 'low' ? 9 : 12;
    this.spruceH = [13, 16.5, 20];
    this.nearGeo = this.spruceH.map((H, i) => spruceGeometry(H, 50 + i, tiers));
    this.farGeo = spruceFarGeometry(1);
    const mats = [M.bark, M.needles, M.core];
    const cap = Q.id === 'low' ? 160 : 320;
    this.nearMeshes = this.nearGeo.map((g) => {
      const m = new THREE.InstancedMesh(g, mats, cap);
      m.count = 0;
      m.frustumCulled = false;
      this.scene.add(m);
      return m;
    });
    const spruces = this.trees.filter((t) => t.kind === 'spruce');
    this.farMesh = new THREE.InstancedMesh(this.farGeo, M.far, spruces.length + 10);
    this.farMesh.count = 0;
    this.farMesh.frustumCulled = false;
    this.scene.add(this.farMesh);
    // árvores mortas (galhos nus)
    this.deadGeo = [0, 1, 2].map((i) => {
      const gb = new GeoBuilder();
      deadTree(gb, mulberry32(880 + i), 0, 0, 0, 11 + i * 3, [(i - 1) * 0.08, 0.05], { maxDepth: Q.id === 'low' ? 2 : 3 });
      return gb.build();
    });
    this.deadMeshes = this.deadGeo.map((g) => {
      const m = new THREE.InstancedMesh(g, M.dead, 120);
      m.count = 0;
      m.frustumCulled = false;
      this.scene.add(m);
      return m;
    });
    // colisão: grade de 8 m
    this.tgrid = new Map();
    for (const t of this.trees) {
      t.r = t.kind === 'spruce' ? 0.22 * t.s + 0.08 : 0.28 * t.s;
      const k = Math.floor(t.x / 8) * 10000 + Math.floor(t.z / 8);
      let a = this.tgrid.get(k);
      if (!a) this.tgrid.set(k, (a = []));
      a.push(t);
    }
    this.nearR = { low: 26, medium: 36, high: 46, ultra: 58 }[Q.id] || 36;
  }

  treesNear(x, z, r) {
    const out = [];
    const i0 = Math.floor((x - r) / 8);
    const i1 = Math.floor((x + r) / 8);
    const j0 = Math.floor((z - r) / 8);
    const j1 = Math.floor((z + r) / 8);
    for (let i = i0; i <= i1; i++)
      for (let j = j0; j <= j1; j++) {
        const a = this.tgrid.get(i * 10000 + j);
        if (!a) continue;
        for (const t of a) if (Math.abs(t.x - x) < r && Math.abs(t.z - z) < r) out.push(t);
      }
    out.sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z));
    return out;
  }

  // Redistribui as instâncias perto (detalhadas) / longe (silhuetas).
  refreshTrees(px, pz) {
    const nearR = this.nearR;
    const farR = 60 + this.dayK * 110;
    const counts = [0, 0, 0];
    const dcounts = [0, 0, 0];
    let fc = 0;
    for (const t of this.trees) {
      const d = Math.hypot(t.x - px, t.z - pz);
      if (d > farR) continue;
      if (t.kind === 'dead') {
        if (d > nearR * 1.6) continue;
        const m = this.deadMeshes[t.v];
        if (dcounts[t.v] >= 120) continue;
        _m.compose(_v.set(t.x, t.y - 0.1, t.z), _q.setFromEuler(_e.set(0, t.rot, 0)), _s.setScalar(t.s));
        m.setMatrixAt(dcounts[t.v]++, _m);
        continue;
      }
      const H = this.spruceH[t.v] * t.s;
      if (d < nearR && counts[t.v] < this.nearMeshes[t.v].instanceMatrix.count) {
        _m.compose(_v.set(t.x, t.y - 0.15, t.z), _q.setFromEuler(_e.set(0, t.rot, 0)), _s.setScalar(t.s));
        this.nearMeshes[t.v].setMatrixAt(counts[t.v]++, _m);
      } else {
        _m.compose(_v.set(t.x, t.y - 0.15, t.z), _q.setFromEuler(_e.set(0, t.rot, 0)), _s.set(H, H, H));
        this.farMesh.setMatrixAt(fc++, _m);
      }
    }
    this.nearMeshes.forEach((m, i) => {
      m.count = counts[i];
      m.instanceMatrix.needsUpdate = true;
    });
    this.deadMeshes.forEach((m, i) => {
      m.count = dcounts[i];
      m.instanceMatrix.needsUpdate = true;
    });
    this.farMesh.count = fc;
    this.farMesh.instanceMatrix.needsUpdate = true;
  }

  // ------------------------------------------------------------ vegetação baixa
  makeFerns() {
    const Q = this.Q;
    const g = new THREE.BufferGeometry();
    const pos = [];
    const uv = [];
    const nor = [];
    for (const a of [0, Math.PI / 2]) {
      const cx = Math.cos(a) * 0.5;
      const cz = Math.sin(a) * 0.5;
      const P = [
        [-cx, 0, -cz],
        [cx, 0, cz],
        [cx, 1, cz],
        [-cx, 0, -cz],
        [cx, 1, cz],
        [-cx, 1, -cz],
      ];
      const T = [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 0],
        [1, 1],
        [0, 1],
      ];
      for (let i = 0; i < 6; i++) {
        pos.push(...P[i]);
        uv.push(...T[i]);
        nor.push(0, 1, 0);
      }
    }
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    this.fernR = { low: 16, medium: 24, high: 30, ultra: 36 }[Q.id] || 24;
    const cap = Math.ceil(this.fernR * this.fernR * 0.6);
    this.fernMesh = new THREE.InstancedMesh(g, this.M.fern, cap);
    this.fernMesh.count = 0;
    this.fernMesh.frustumCulled = false;
    this.scene.add(this.fernMesh);
    // posições (grade com variação), guardadas por células de 8 m
    this.fgrid = new Map();
    const stp = Q.id === 'low' ? 2.6 : 1.9;
    for (let x = WORLD.x0 + 3; x < WORLD.x1 - 3; x += stp) {
      for (let zr = -100; zr < 100; zr += stp) {
        const fx = x + (hash3(x, zr, 31) - 0.5) * stp;
        const fz = zc(fx) + zr + (hash3(x, zr, 32) - 0.5) * stp;
        const s = shoreS(fx, fz);
        if (s < 3) continue;
        if (Math.abs(fz - trailZ(fx)) < 1.6) continue;
        if (fbm(fx * 0.05, fz * 0.05, 2, 41) + hash3(fx, fz, 33) * 0.6 < 0.25) continue;
        if (this.cabin.inside(fx, fz, 1.5)) continue;
        if (Math.hypot(fx - this.campPos.x, fz - this.campPos.z) < 3.5) continue;
        const k = Math.floor(fx / 8) * 10000 + Math.floor(fz / 8);
        let a = this.fgrid.get(k);
        if (!a) this.fgrid.set(k, (a = []));
        a.push(fx, groundH(fx, fz) - 0.05, fz, 0.5 + hash3(fx, fz, 34) * 0.7, hash3(fx, fz, 35) * TAU);
      }
    }
  }

  refreshFerns(px, pz) {
    const R = this.fernR;
    const m = this.fernMesh;
    const cap = m.instanceMatrix.count;
    let n = 0;
    const i0 = Math.floor((px - R) / 8);
    const i1 = Math.floor((px + R) / 8);
    const j0 = Math.floor((pz - R) / 8);
    const j1 = Math.floor((pz + R) / 8);
    for (let i = i0; i <= i1 && n < cap; i++)
      for (let j = j0; j <= j1 && n < cap; j++) {
        const a = this.fgrid.get(i * 10000 + j);
        if (!a) continue;
        for (let k = 0; k < a.length && n < cap; k += 5) {
          const dx = a[k] - px;
          const dz = a[k + 2] - pz;
          if (dx * dx + dz * dz > R * R) continue;
          const s = a[k + 3];
          _m.compose(_v.set(a[k], a[k + 1], a[k + 2]), _q.setFromEuler(_e.set(0, a[k + 4], 0)), _s.set(s * 1.3, s, s * 1.3));
          m.setMatrixAt(n++, _m);
        }
      }
    m.count = n;
    m.instanceMatrix.needsUpdate = true;
  }

  // Juncos na beira d'água (as duas margens).
  makeReeds() {
    const g = this.fernMesh ? this.fernMesh.geometry : null;
    const list = [];
    for (let x = WORLD.x0 + 2; x < 212; x += 1.3) {
      for (const side of [-1, 1]) {
        if (hash3(x, side, 51) < 0.45) continue;
        const off = halfW(x) + (hash3(x, side, 52) - 0.75) * 3.5;
        const z = zc(x) + side * off;
        if (Math.abs(x - this.dockX) < 2.5 && side > 0) continue;
        const y = groundH(x, z);
        if (y < -0.5 || y > 0.5) continue;
        list.push([x, y - 0.05, z, 0.8 + hash3(x, side, 53) * 0.9]);
      }
    }
    this.reedList = list;
    this.reedGeoPending = !g;
  }

  makeReedMesh() {
    const list = this.reedList;
    const m = new THREE.InstancedMesh(this.fernMesh.geometry, this.M.reeds, list.length);
    list.forEach((r, i) => {
      _m.compose(_v.set(r[0], r[1], r[2]), _q.setFromEuler(_e.set(0, hash3(r[0], r[2], 54) * TAU, 0)), _s.set(r[3] * 1.4, r[3] * 1.5, r[3] * 1.4));
      m.setMatrixAt(i, _m);
    });
    m.frustumCulled = false;
    this.scene.add(m);
    this.reedMesh = m;
  }

  // Névoa baixa sobre a água e o "bafo" do frio perto do lago.
  makeMist() {
    const tex = noiseSprite();
    this.mistTex = tex;
    const g = new THREE.Group();
    this.mistSprites = [];
    const nMist = this.Q.id === 'low' ? 12 : 22;
    for (let i = 0; i < nMist; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0x8a949c, transparent: true, opacity: 0, depthWrite: false, fog: true }));
      s.userData = { life: Math.random(), sp: 0.2 + Math.random() * 0.3, a: Math.random() * TAU };
      g.add(s);
      this.mistSprites.push(s);
    }
    this.scene.add(g);
    this.mist = g;
    this.breath = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0xb8c0c8, transparent: true, opacity: 0, depthWrite: false, fog: false }));
    this.breath.scale.setScalar(0.35);
    this.scene.add(this.breath);
    this.breathT = 3;
    if (this.reedGeoPending) this.makeReedMesh();
  }

  updateMist(dt, p, cam) {
    const k = 0.25 + (1 - this.dayK) * 0.75;
    for (const s of this.mistSprites) {
      const u = s.userData;
      u.life += dt * 0.04;
      if (u.life > 1 || !u.placed) {
        // reaparece sobre a água perto do jogador
        for (let tries = 0; tries < 6; tries++) {
          const x = p.x + (Math.random() - 0.5) * 120;
          const z = zc(x) + (Math.random() - 0.5) * 2 * halfW(x) * 0.9;
          if (x > 210 || shoreS(x, z) > -3) continue;
          s.position.set(x, 0.4 + Math.random() * 1.4, z);
          u.placed = true;
          break;
        }
        u.life = 0;
        const sc = 9 + Math.random() * 12;
        s.scale.set(sc, sc * 0.35, 1);
      }
      s.position.x += Math.cos(u.a) * u.sp * dt;
      s.position.z += Math.sin(u.a) * u.sp * dt;
      s.material.opacity = Math.sin(u.life * Math.PI) * 0.22 * k;
    }
    // respiração visível no frio perto do lago
    const near = clamp((10 - shoreS(p.x, p.z)) / 10, 0, 1);
    this.breathT -= dt;
    if (this.breathT <= 0) this.breathT = 3.4 + Math.random();
    const b = this.breathT > 2.6 ? Math.sin(((3.4 - this.breathT) / 0.8) * Math.PI) : 0;
    this.game.player.forward(_f);
    this.breath.position.copy(cam.position).addScaledVector(_f, 0.55 + (1 - b) * 0.3);
    this.breath.position.y -= 0.12;
    this.breath.material.opacity = Math.max(0, b) * 0.18 * near * (0.6 + this.dayK * 0.4);
  }

  // ------------------------------------------------------------ placas e itens
  makeSigns() {
    this.signMeshes = [];
    for (const [x, text] of [
      [-200, 'CABANA →'],
      [-75, 'CABANA →'],
      [10, '← CABANA'],
      [150, 'CAVERNA →'],
    ]) {
      const z = trailZ(x) + 1.9;
      const y = groundH(x, z);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 1.6, 7), this.M.logs);
      post.position.set(x, y + 0.75, z);
      const s = signMesh(text, this.M.wood);
      s.position.set(x, y + 1.35, z - 0.08);
      s.rotation.y = Math.PI + (Math.random() - 0.5) * 0.2;
      s.rotation.z = (Math.random() - 0.5) * 0.08;
      this.dynamic.add(post, s);
      this.signMeshes.push(s);
      this.circles.push([x, z, 0.2]);
    }
    // placa torta na boca da caverna
    {
      const x = CAVE.x - 2.2;
      const z = CAVE.z - 3.4;
      const y = groundH(x, z);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 1.6, 7), this.M.logs);
      post.position.set(x, y + 0.75, z);
      post.rotation.z = 0.12;
      const s = signMesh('PASSAGEM ↓', this.M.wood);
      s.position.set(x - 0.08, y + 1.35, z);
      s.rotation.y = -Math.PI / 2 + 0.3;
      s.rotation.z = 0.1;
      // lampião velho pendurado, ainda aceso (fraco)
      const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.18, 8), new THREE.MeshBasicMaterial({ color: 0xffa040 }));
      lamp.material.color.multiplyScalar(1.6);
      lamp.position.set(x - 0.05, y + 1.05, z + 0.32);
      this.caveLamp = lamp;
      this.dynamic.add(post, s, lamp);
      this.signMeshes.push(s);
      this.circles.push([x, z, 0.2]);
    }
  }

  spawnItems(camp) {
    const g = this.game;
    const c = this.cabin;
    const items = [
      { type: 'water', key: 'l88:w1', x: c.x - 1.0, z: c.z + 1.5, y: c.floorY + 0.77, light: 0.6 },
      { type: 'water', key: 'l88:w2', x: this.campPos.x + 2.0, z: this.campPos.z + 1.0, y: groundH(this.campPos.x + 2, this.campPos.z + 1) + 0.02, light: 0.4 },
      { type: 'water', key: 'l88:w3', x: 160, z: trailZ(160) + 1.4, y: groundH(160, trailZ(160) + 1.4) + 0.02, light: 0.4 },
      { type: 'note', key: 'l88:n1', x: this.spawn.x + 2.5, z: this.spawn.z + 1.2, y: groundH(this.spawn.x + 2.5, this.spawn.z + 1.2) + 0.03, rot: 0.4, light: 0.6 },
      { type: 'note', key: 'l88:n2', x: c.x - 1.5, z: c.z + 1.75, y: c.floorY + 0.78, rot: 1.2, light: 0.6 },
      { type: 'note', key: 'l88:n3', x: this.dockX + 0.2, z: this.dock.z1 + 0.5, y: this.dock.top + 0.03, rot: 2.1, light: 0.5 },
      { type: 'note', key: 'l88:n4', x: CAVE.x - 4, z: CAVE.z + 2, y: groundH(CAVE.x - 4, CAVE.z + 2) + 0.03, rot: 0.9, light: 0.4 },
    ];
    for (const it of items) if (!this.taken.has(it.key)) g.items.spawn(it, this.dynamic);
    // a carta com a foto em branco
    const L = camp.letter;
    if (!g.inventory.has('carta'))
      g.items.spawn(
        {
          type: 'letter',
          key: 'l88:carta',
          x: L.x,
          z: L.z,
          y: L.y,
          label: 'Pegar a carta',
          makeMesh: (it) => {
            const grp = new THREE.Group();
            const paper = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.26), new THREE.MeshLambertMaterial({ color: 0xcfc6ad, emissive: 0x3a3428 }));
            paper.rotation.x = -Math.PI / 2;
            const photo = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.12), new THREE.MeshLambertMaterial({ color: 0xf6f5f0, emissive: 0x505050 }));
            photo.rotation.x = -Math.PI / 2;
            photo.rotation.z = 0.4;
            photo.position.set(0.05, 0.004, 0.03);
            grp.add(paper, photo);
            grp.position.set(it.x, it.y, it.z);
            grp.rotation.y = 0.7;
            this.dynamic.add(grp);
            return grp;
          },
          onUse: (game) => {
            game.inventory.add('carta');
            game.audio.paper();
            game.hud.message('Carta guardada na mochila. Segurá-la acalma: a sanidade volta sozinha.', 5);
            game.hud.showLetter(
              'Se você encontrou isto, sente-se um pouco. O lago não vai a lugar nenhum, e a criatura não gosta da cabana. Guardei esta foto porque era a única coisa que eu tinha de casa. Um dia ela mostrava alguém — juro que mostrava. Agora está em branco, mas segurá-la ainda acalma. Leve com você. Siga a margem até as pedras grandes: atrás delas existe uma passagem que desce para debaixo da terra. Não grite perto da água. Ela guarda as vozes.',
            );
            this.spawn = { x: this.campPos.x - 1, z: this.campPos.z - 3, yaw: -Math.PI / 2 };
          },
        },
        this.dynamic,
      );
  }

  // ------------------------------------------------------------ quadro
  updateDayNight(dt) {
    this.clock = (this.clock + dt) % CYCLE;
    const ph = this.clock / CYCLE;
    // 0–0.52 dia, 0.52–0.6 anoitecer, 0.6–0.9 noite, 0.9–1 amanhecer
    let k;
    if (ph < 0.52) k = 1;
    else if (ph < 0.6) k = 1 - smoothstep(0.52, 0.6, ph);
    else if (ph < 0.9) k = 0;
    else k = smoothstep(0.9, 1.0, ph);
    this.dayK = k;
    const phase = ph < 0.52 ? 'dia' : ph < 0.6 ? 'tarde' : ph < 0.9 ? 'noite' : 'aurora';
    if (phase !== this.phaseName) {
      const first = this.phaseName === undefined;
      this.phaseName = phase;
      const g = this.game;
      const tag = document.getElementById('lvl-tag');
      if (tag) tag.textContent = 'NÍVEL 88 · ' + (phase === 'noite' ? 'NOITE' : phase === 'tarde' ? 'ANOITECER' : phase === 'aurora' ? 'AMANHECER' : 'DIA');
      if (!first) {
        if (phase === 'tarde') g.hud.message('Está escurecendo. O pouco de luz que havia vai embora.', 5);
        if (phase === 'noite') g.hud.message(`A noite caiu. Mal dá para ver as próprias mãos. ${g.settings.mobile ? 'Toque em 🔦' : 'Aperte F'} para a lanterna.`, 6);
        if (phase === 'aurora') g.hud.message('O céu clareia um pouco. Aqui, o dia é só uma noite menos escura.', 5);
      }
    }
    _c1.copy(NIGHT.fog).lerp(DAY.fog, k);
    this.fog.color.copy(_c1);
    this.scene.background.copy(_c1);
    this.fog.density = NIGHT.fogD + (DAY.fogD - NIGHT.fogD) * k;
    this.hemi.intensity = NIGHT.hemi + (DAY.hemi - NIGHT.hemi) * k;
    this.sun.intensity = NIGHT.dir + (DAY.dir - NIGHT.dir) * k;
    const su = this.sky.material.uniforms;
    su.uTop.value.copy(NIGHT.top).lerp(DAY.top, k);
    su.uHor.value.copy(NIGHT.hor).lerp(DAY.hor, k);
    su.uFog.value.copy(_c1);
    su.uDay.value = k;
    const wu = this.waterU;
    wu.uSkyTop.value.copy(su.uTop.value);
    wu.uSkyHor.value.copy(su.uHor.value);
    wu.uFogC.value.copy(_c1);
    wu.uFogD.value = this.fog.density;
    wu.uMist.value = 1 - k;
    this.game.post.u.uExposure.value = NIGHT.exp + (DAY.exp - NIGHT.exp) * k;
  }

  update(dt, player) {
    const g = this.game;
    const p = player.pos;
    const cam = g.camera;
    this.time += dt;
    const t = this.time;
    this.safeT = Math.max(0, this.safeT - dt);
    this.updateDayNight(dt);
    this.sky.position.copy(cam.position);
    this.sky.material.uniforms.uTime.value = t;
    // instâncias perto do jogador
    if (Math.hypot(p.x - this.lastP.x, p.z - this.lastP.z) > 2.5 || (this.treeT = (this.treeT || 0) + dt) > 1.5) {
      this.treeT = 0;
      this.lastP = { x: p.x, z: p.z };
      this.refreshTrees(p.x, p.z);
      this.refreshFerns(p.x, p.z);
    }
    // água: tempo, lanterna, anéis ao andar dentro d'água
    const wu = this.waterU;
    wu.uTime.value = t;
    wu.uFlashP.value.copy(cam.position);
    player.forward(_f);
    wu.uFlashD.value.copy(_f);
    wu.uFlash.value = player.flashLevel || 0;
    const depth = Math.max(0, -groundH(p.x, p.z));
    const moved = Math.hypot(p.x - (this.prevX ?? p.x), p.z - (this.prevZ ?? p.z));
    this.prevX = p.x;
    this.prevZ = p.z;
    if (depth > 0.03) {
      this.wade = (this.wade || 0) + moved;
      if (this.wade > 0.75) {
        this.wade = 0;
        const R = this.rings[this.ringI++ % 4];
        R.set(p.x, p.z, t, clamp(0.6 + depth, 0.6, 1.4));
        g.audio.play('water', { gain: 0.08 + depth * 0.1, rate: 1.4 + Math.random() * 0.3, wet: 0.2 });
      }
    }
    // andar na água: lento e gelado
    const wk = clamp(depth / 0.9, 0, 1);
    this.walkSpeed = damp(this.walkSpeed, this.baseWalk * (1 - 0.55 * Math.sqrt(wk)), 6, dt);
    // o silêncio do lago
    const s = shoreS(p.x, p.z);
    const muff = clamp((14 - s) / 16, 0, 1) * 0.9;
    g.audio.setMuffle(muff);
    if (muff > 0.5 && !this.toldSilence) {
      this.toldSilence = true;
      g.hud.message('O som some. Seus passos, sua respiração… tudo afunda no lago.', 5);
    } else if (muff > 0.7 && this.toldSilence && !this.toldVoice && t > 30) {
      this.toldVoice = true;
      setTimeout(() => g.running && g.level === this && g.hud.message('Você tenta dizer algo em voz alta. Nenhum som sai.', 4), 6000);
    }
    // dentro d'água: sussurros que sobem pelo corpo (mais altos rumo ao centro)
    if (depth > 0.15) {
      if (!this.toldWater) {
        this.toldWater = true;
        g.hud.message('A água é gelada e tem cheiro de metal. Algo vibra sob a superfície.', 5);
      }
      this.whisperT = (this.whisperT || 0) - dt;
      if (this.whisperT <= 0) {
        this.whisperT = 1.5 + Math.random() * 2;
        const center = clamp(-s / (halfW(p.x) || 1), 0, 1);
        g.audio.play('whisper', { gain: 0.05 + center * 0.25 + depth * 0.1, rate: 0.7 + Math.random() * 0.5, wet: 1.4, pan: Math.random() * 2 - 1 });
        g.vibrate(30);
      }
      g.st.fear = Math.max(g.st.fear, wk * 0.5);
    }
    // sanidade: frio da água, escuro sem lanterna, calor do lampião
    const lamp = this.cabin.inside(p.x, p.z, 0.6);
    this.sanityExtra = wk * 1.6 + (1 - this.dayK) * (player.flashOn ? 0.08 : 0.3) - (lamp ? 0.6 : 0);
    if (lamp && !this.cabinVisited) {
      this.cabinVisited = true;
      this.spawn = { x: this.cabin.x, z: this.cabin.z + 0.5, yaw: 0 };
      g.hud.message('Uma cabana com um lampião aceso. A porta tem tranca por dentro.', 4.5);
    }
    // cabana, névoa, entidades
    this.cabin.update(dt, t);
    if (this.caveLamp) this.caveLamp.material.color.setRGB(1, 0.62, 0.25).multiplyScalar(1.2 + Math.sin(t * 7.3) * 0.15 + Math.sin(t * 17.1) * 0.1);
    this.updateMist(dt, p, cam);
    this.creature.update(dt, t, player);
    this.shade.update(dt, t, player);
    // caverna
    const dc = Math.hypot(p.x - CAVE.x, p.z - CAVE.z);
    if (dc < 24 && !g.objectiveDone('cave')) g.completeObjective('cave', 'Pedras grandes, e entre elas uma abertura que desce para dentro da terra.');
    if (p.x > CAVE.x + 7 && Math.abs(p.z - CAVE.z) < 2.5 && !this.ending) this.end();
    // reflexo
    this.renderMirror();
  }

  end() {
    this.ending = true;
    const g = this.game;
    if (!g.objectiveDone('cave')) g.completeObjective('cave');
    g.completeObjective('enter', 'Você desce para dentro da terra.');
    g.audio.setMuffle(0);
    // a passagem não termina aqui: leva ao Nível 177 (o primeiro final do jogo)
    g.hud.message(ENDING.split('. ')[0] + '.', 5);
    setTimeout(() => g.level === this && g.reachExit('noclip', 0.2), 2600);
  }

  onCollapse() {
    this.dead = false;
    this.safeT = 20;
    this.creature.reset(false);
    this.cabin.openTarget = 1;
  }

  // ------------------------------------------------------------ física e interação
  collide(p, r) {
    // borda do mundo
    p.x = clamp(p.x, WORLD.x0 + 4, CAVE.x + 16);
    const rel = p.z - zc(p.x);
    if (rel > WORLD.half - 8) p.z = zc(p.x) + WORLD.half - 8;
    if (rel < -WORLD.half + 8) p.z = zc(p.x) - WORLD.half + 8;
    // dentro do túnel: paredes laterais
    if (p.x > CAVE.x + 1.2) {
      const w = 1.4;
      p.z = clamp(p.z, CAVE.z - w, CAVE.z + w);
    }
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
      for (const c of this.circles) {
        const dx = p.x - c[0];
        const dz = p.z - c[1];
        if (Math.abs(dx) > c[2] + 1 || Math.abs(dz) > c[2] + 1) continue;
        const d = Math.hypot(dx, dz);
        const rr = r + c[2];
        if (d < rr && d > 1e-4) {
          p.x = c[0] + (dx / d) * rr;
          p.z = c[1] + (dz / d) * rr;
        }
      }
      for (const b of this.colliders) pushCircle(p, r, b[0], b[1], b[2], b[3]);
      const dc = this.cabin.doorCollider();
      if (dc) pushCircle(p, r, dc[0], dc[1], dc[2], dc[3]);
    }
    // água funda não deixa passar (volta pela margem)
    if (groundH(p.x, p.z) < DEEP && !this.onDock(p.x, p.z)) {
      const o = this.okP || this.spawn;
      if (groundH(p.x, o.z) >= DEEP) p.z = o.z;
      else if (groundH(o.x, p.z) >= DEEP) p.x = o.x;
      else {
        p.x = o.x;
        p.z = o.z;
      }
    }
    this.okP = { x: p.x, z: p.z };
    return p;
  }

  onDock(x, z) {
    const d = this.dock;
    return d && Math.abs(x - d.x) < 0.8 && z <= Math.max(d.z0, d.z1) + 0.2 && z >= Math.min(d.z0, d.z1) - 0.2;
  }

  groundY(x, z) {
    if (this.cabin.inside(x, z, 0.1)) return this.cabin.floorY;
    if (this.onDock(x, z)) return this.dock.top + 0.03;
    if (x > CAVE.x + 1) return CAVE.y - (x - CAVE.x - 1) * 0.135;
    return Math.max(groundH(x, z), DEEP);
  }

  surfaceAt(x, z) {
    if (this.cabin.inside(x, z, 0.1) || this.onDock(x, z)) return 'wood';
    const s = shoreS(x, z);
    if (s < 1.5) return 'mud';
    if (Math.abs(z - trailZ(x)) < 1.5) return 'dirt';
    return 'grass';
  }

  los() {
    return true;
  }

  lightLevel(x, z) {
    const lamp = Math.hypot(x - this.cabin.x, z - this.cabin.z) < 4 ? 0.6 : 0;
    return 0.12 + this.dayK * 0.5 + lamp;
  }

  interactable(player) {
    const p = player.pos;
    const c = this.cabin;
    const fx = c.doorX;
    const fz = c.z - c.D / 2;
    if (Math.hypot(p.x - fx, p.z - fz) < 1.7) {
      const open = c.openTarget > 0.5;
      return {
        label: open ? 'Fechar a porta' : 'Abrir a porta',
        action: () => {
          c.toggle();
          if (!c.openTarget && c.inside(p.x, p.z)) this.game.hud.message('Porta fechada. Fique quieto.', 2.5);
        },
      };
    }
    if (Math.hypot(p.x - CAVE.x, p.z - CAVE.z) < 3.2) {
      return { label: 'Descer pela caverna', action: () => this.end() };
    }
    return null;
  }

  navTarget() {
    const st = this.creature && this.creature.state;
    if ((st === 'chase' || st === 'alert') && !this.cabin.inside(this.game.player.pos.x, this.game.player.pos.z))
      return { x: this.cabin.doorX, z: this.cabin.z - this.cabin.D / 2 - 1 };
    return { x: CAVE.x, z: CAVE.z };
  }

  exitEmitter() {
    return { x: CAVE.x + 4, y: 1.5, z: CAVE.z, sound: 'wind', gain: 0.35 };
  }

  dispose() {
    const g = this.game;
    g.renderer.clippingPlanes = [];
    g.audio.setMuffle(0);
    this.mirrorRT.dispose();
    this.creature.dispose();
    this.shade.dispose();
    const all = [this.terrain, this.water, this.sky, ...this.nearMeshes, this.farMesh, ...this.deadMeshes, this.fernMesh, this.reedMesh, this.mist, this.breath];
    for (const o of all) if (o) this.scene.remove(o);
    this.terrain.geometry.dispose();
    this.water.geometry.dispose();
    this.waterMat.dispose();
    this.sky.geometry.dispose();
    this.sky.material.dispose();
    for (const gg of [...this.nearGeo, this.farGeo, ...this.deadGeo, this.fernMesh.geometry]) gg.dispose();
    for (const m of [...this.nearMeshes, this.farMesh, ...this.deadMeshes, this.fernMesh, this.reedMesh]) if (m && m.dispose) m.dispose();
    for (const s of this.mistSprites) s.material.dispose();
    this.breath.material.dispose();
    this.mistTex.dispose();
    this.dynamic.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
    });
    if (this.caveLamp) this.caveLamp.material.dispose();
    for (const s of this.signMeshes) {
      s.material.map.dispose();
      s.material.dispose();
    }
    for (const k in this.M) this.M[k].dispose();
    this.scene.remove(this.dynamic, this.hemi, this.sun);
  }
}
