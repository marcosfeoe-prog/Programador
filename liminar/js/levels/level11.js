// Nível 11 — "Cidade Sem Fim": metrópole deserta ao entardecer. Quarteirões
// gerados ao redor do jogador com prédios de vidro, concreto e tijolo, ruas com
// faixas pintadas, postes acesos, semáforos funcionando e carros abandonados.
// Saída: um orelhão tocando.
import * as THREE from 'three';
import { OutdoorLevel, makeSky } from './outdoor.js';
import { GeoBuilder } from '../materials.js';
import { getTex, textCanvasTex, signTex } from '../textures.js';
import { fbm, mulberry32, clamp } from '../util.js';

const fl = (v) => v.toFixed(3);
const P = 80; // passo dos quarteirões
const RW = 6; // meia largura do asfalto
const SW = 10; // fim da calçada (a partir do eixo da rua)
const CURB = 0.15;

const MARKINGS_GLSL = /* glsl */ `
float cityPaint( vec2 p, float n ) {
  vec2 q = mod( p + ${P / 2}.0, ${P}.0 ) - ${P / 2}.0;
  vec2 a = abs( q );
  float paint = 0.0;
  // rua norte-sul (x perto do eixo) fora do cruzamento
  if ( a.x < ${RW}.0 && a.y > ${SW}.0 ) {
    paint = max( paint, step( 0.1, a.x ) * step( a.x, 0.24 ) * 2.0 );
    paint = max( paint, step( abs( a.x - 3.0 ), 0.07 ) * step( fract( p.y / 6.0 ), 0.5 ) );
    paint = max( paint, step( abs( a.x - 5.6 ), 0.07 ) );
    paint = max( paint, step( abs( a.y - ${fl(SW + 0.7)} ), 0.25 ) * step( a.x, 3.0 ) * step( 0.0, q.x * sign( q.y ) ) );
  }
  if ( a.y < ${RW}.0 && a.x > ${SW}.0 ) {
    paint = max( paint, step( 0.1, a.y ) * step( a.y, 0.24 ) * 2.0 );
    paint = max( paint, step( abs( a.y - 3.0 ), 0.07 ) * step( fract( p.x / 6.0 ), 0.5 ) );
    paint = max( paint, step( abs( a.y - 5.6 ), 0.07 ) );
    paint = max( paint, step( abs( a.x - ${fl(SW + 0.7)} ), 0.25 ) * step( a.y, 3.0 ) * step( 0.0, -q.y * sign( q.x ) ) );
  }
  // faixas de pedestre
  if ( a.x < ${RW}.0 && a.y > ${fl(RW + 0.6)} && a.y < ${fl(SW - 0.4)} ) paint = max( paint, step( fract( q.x / 1.2 ), 0.55 ) );
  if ( a.y < ${RW}.0 && a.x > ${fl(RW + 0.6)} && a.x < ${fl(SW - 0.4)} ) paint = max( paint, step( fract( q.y / 1.2 ), 0.55 ) );
  return paint * smoothstep( 0.15, 0.55, n );
}
`;

export class Level11 extends OutdoorLevel {
  constructor(game) {
    super(game, { P, walkSpeed: 2.5, camFar: 2200, shadowDist: 400 });
    this.num = 11;
    this.seed = (game.seed ^ 0x1111a) >>> 0;
    const Q = this.Q;
    this.look = {
      exposure: 0.9,
      tint: [1.04, 0.98, 0.96],
      sat: 1.0,
      contrast: 1.06,
      lift: [0.02, 0.015, 0.03],
      bloom: 0.11,
      bloomThreshold: 1.6,
      fog: [0.46, 0.36, 0.36],
      lightColor: [1, 1, 1],
      flashlight: false,
      ambience: 'level11',
      reverb: 2,
      sanityDrain: 0.04,
    };
    const fogC = new THREE.Color(...this.look.fog);
    this.scene.fog = new THREE.FogExp2(fogC, 1.75 / Q.outdoorView);
    this.scene.background = fogC;
    const sunDir = new THREE.Vector3(-0.75, 0.13, -0.62).normalize();
    this.sky = makeSky({
      zenith: [0.1, 0.16, 0.36],
      horizon: [0.75, 0.42, 0.3],
      ground: [0.12, 0.1, 0.1],
      fog: this.look.fog,
      sunDir,
      sunColor: [3.2, 1.5, 0.6],
      sunDisk: 14,
      cloudA: [0.24, 0.2, 0.3],
      cloudB: [1.3, 0.62, 0.38],
      cover: 0.42,
      cloudScale: 0.7,
    });
    this.scene.add(this.sky);
    this.setupLights({
      sky: 0x7d86b8,
      ground: 0x4a3c36,
      hemi: 1.3,
      sunColor: 0xffa060,
      sun: 3.0,
      sunDir,
      shadowExtent: 70,
      shadowFar: 800,
    });
    // reflexos: mapa de ambiente a partir do próprio céu
    let env = null;
    if (Q.envMap) {
      const sc = new THREE.Scene();
      const sk = makeSky({ ...this.skyOpts(sunDir) });
      sc.add(sk);
      const rt = game.pmrem.fromScene(sc, 0, 0.1, 1500);
      game.envs.push(rt);
      env = rt.texture;
      sk.geometry.dispose();
      sk.material.dispose();
    }
    this.env = env;
    const S = Q.tex;
    const mkFacade = (name, rough) => {
      const t = getTex(name, S);
      return new THREE.MeshStandardMaterial({
        map: t.map,
        emissiveMap: t.emissiveMap,
        emissive: 0xffffff,
        emissiveIntensity: 1.25,
        roughnessMap: t.roughnessMap,
        roughness: rough,
        metalness: 0.05,
        envMap: env,
        envMapIntensity: 1.2,
      });
    };
    this.facadeMats = [mkFacade('facadeGlass', 1), mkFacade('facadeConcrete', 1), mkFacade('facadeBrick', 1)];
    const roof = getTex('roof', S);
    this.roofMat = new THREE.MeshStandardMaterial({ map: roof.map, roughness: 0.95 });
    const sw = getTex('sidewalk', S);
    this.walkMat = new THREE.MeshStandardMaterial({
      map: sw.map,
      normalMap: Q.normalMaps ? sw.normalMap : null,
      roughness: 0.9,
      vertexColors: true,
    });
    const gr = getTex('grime', S);
    this.miscMat = new THREE.MeshStandardMaterial({
      map: gr.map,
      vertexColors: true,
      roughness: 0.6,
      metalness: 0.2,
      envMap: env,
      envMapIntensity: 0.6,
    });
    this.carMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.32,
      metalness: 0.55,
      envMap: env,
      envMapIntensity: 1.3,
    });
    this.lampMat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uI: { value: [5, 0, 0, 0, 0, 0, 0] } }]),
      vertexShader: /* glsl */ `
        attribute float aGroup;
        varying vec3 vCol;
        varying float vG;
        #include <fog_pars_vertex>
        void main() {
          vCol = color;
          vG = aGroup;
          vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */ `
        uniform float uI[ 7 ];
        varying vec3 vCol;
        varying float vG;
        #include <fog_pars_fragment>
        void main() {
          int g = int( vG + 0.5 );
          float k = uI[ 0 ];
          for ( int i = 1; i < 7; i++ ) if ( i == g ) k = uI[ i ];
          gl_FragColor = vec4( vCol * ( k + 0.03 ), 1.0 );
          #include <fog_fragment>
        }`,
      vertexColors: true,
      fog: true,
    });
    const pool = textCanvasTex(128, 128, (c, w, h) => {
      const g = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.35, 'rgba(255,255,255,0.45)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
    });
    this.poolMat = new THREE.MeshBasicMaterial({
      map: pool,
      color: new THREE.Color(0.42, 0.28, 0.14),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: true,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
    this.foliageGeo = new THREE.IcosahedronGeometry(1, 1);
    this.hoodGeo = new THREE.SphereGeometry(0.66, 20, 12, Math.PI * 0.36, Math.PI * 1.28, 0, Math.PI * 0.74);
    this.makeGround();
    this.route();
    this.signal = 0;
  }

  skyOpts(sunDir) {
    return {
      zenith: [0.1, 0.16, 0.36],
      horizon: [0.75, 0.42, 0.3],
      ground: [0.12, 0.1, 0.1],
      fog: this.look.fog,
      sunDir,
      sunColor: [3.2, 1.5, 0.6],
      sunDisk: 14,
      cloudA: [0.24, 0.2, 0.3],
      cloudB: [1.3, 0.62, 0.38],
      cover: 0.42,
      cloudScale: 0.7,
    };
  }

  makeGround() {
    const Q = this.Q;
    const size = Q.outdoorView * 2 + P * 2;
    const g = new THREE.PlaneGeometry(size, size, 1, 1);
    g.rotateX(-Math.PI / 2);
    const as = getTex('asphalt', Q.tex);
    const mat = new THREE.MeshStandardMaterial({
      map: as.map,
      normalMap: Q.normalMaps ? as.normalMap : null,
      roughness: 0.85,
      envMap: this.env,
      envMapIntensity: 0.5,
    });
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;')
        .replace(
          '#include <uv_vertex>',
          '#include <uv_vertex>\n#ifdef USE_MAP\nvMapUv = ( modelMatrix * vec4( position, 1.0 ) ).xz * 0.25;\n#endif\n#ifdef USE_NORMALMAP\nvNormalMapUv = ( modelMatrix * vec4( position, 1.0 ) ).xz * 0.25;\n#endif',
        );
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\n' + MARKINGS_GLSL)
        .replace(
          '#include <map_fragment>',
          `#include <map_fragment>
          float wn = texture2D( map, vWPos.xz * 0.031 ).r * 3.0;
          float pnt = cityPaint( vWPos.xz, wn );
          vec3 pc = pnt > 1.5 ? vec3( 0.75, 0.55, 0.12 ) : vec3( 0.78 );
          diffuseColor.rgb = mix( diffuseColor.rgb, pc, min( pnt, 1.0 ) * 0.85 );`,
        );
    };
    mat.customProgramCacheKey = () => 'l11-ground';
    this.ground = new THREE.Mesh(g, mat);
    this.ground.receiveShadow = Q.shadows;
    this.ground.frustumCulled = false;
    this.scene.add(this.ground);
  }

  // Altura do centro (0..1): define o "centro" com arranha-céus.
  district(i, j) {
    return clamp(0.5 + fbm(i * 0.13 + 3.3, j * 0.13 - 1.7, 3, this.seed) * 1.4, 0, 1);
  }

  *genChunk(ch) {
    const { i, j, x0, z0 } = ch;
    const rnd = mulberry32(((i * 73856093) ^ (j * 19349663) ^ this.seed) >>> 0);
    const walk = new GeoBuilder();
    const roofs = new GeoBuilder();
    const fac = [new GeoBuilder(), new GeoBuilder(), new GeoBuilder()];
    const misc = new GeoBuilder();
    const cars = new GeoBuilder();
    const lamps = new GeoBuilder();
    const pools = new GeoBuilder();
    // laje da calçada / quarteirão
    const a = x0 + SW - 4;
    const b = x0 + P - SW + 4;
    const c = z0 + SW - 4;
    const d = z0 + P - SW + 4;
    walk.box((a + b) / 2, CURB / 2, (c + d) / 2, b - a, CURB, d - c, [0.92, 0.92, 0.9], null, { uvScale: 3, ao: 0, skip: 'ny' });
    ch.slab = [a, b, c, d];
    // lotes
    const L0 = x0 + SW + 1;
    const L1 = x0 + P - SW - 1;
    const M0 = z0 + SW + 1;
    const M1 = z0 + P - SW - 1;
    const dist = this.district(i, j);
    const lots = [];
    const split = rnd();
    if (split < 0.25 || dist > 0.82) lots.push([L0, L1, M0, M1]);
    else if (split < 0.55) {
      const m = (L0 + L1) / 2 + (rnd() - 0.5) * 12;
      lots.push([L0, m - 1, M0, M1], [m + 1, L1, M0, M1]);
    } else if (split < 0.75) {
      const m = (M0 + M1) / 2 + (rnd() - 0.5) * 12;
      lots.push([L0, L1, M0, m - 1], [L0, L1, m + 1, M1]);
    } else {
      const mx = (L0 + L1) / 2;
      const mz = (M0 + M1) / 2;
      lots.push([L0, mx - 1, M0, mz - 1], [mx + 1, L1, M0, mz - 1], [L0, mx - 1, mz + 1, M1], [mx + 1, L1, mz + 1, M1]);
    }
    const exitBlock = this.isExitChunk(i, j);
    for (const lot of lots) {
      const r = rnd();
      if (r < 0.07 && lots.length > 1) {
        this.parking(misc, cars, lot, rnd);
        continue;
      }
      if (r < 0.12 && lots.length > 1) {
        this.plaza(misc, lot, rnd);
        continue;
      }
      this.makeBuilding(fac, roofs, misc, ch, lot, dist, rnd);
    }
    yield;
    // mobiliário urbano nas quatro calçadas
    this.streetSide(ch, misc, cars, lamps, pools, rnd, x0, z0);
    if (exitBlock) this.payphone(misc, ch);
    yield;
    this.addMesh(ch, walk.build(), this.walkMat, { cast: false });
    fac.forEach((g, k) => {
      if (!g.empty) this.addMesh(ch, g.build(), this.facadeMats[k]);
    });
    if (!roofs.empty) this.addMesh(ch, roofs.build(), this.roofMat);
    if (!misc.empty) this.addMesh(ch, misc.build(), this.miscMat);
    if (!cars.empty) this.addMesh(ch, cars.build(), this.carMat);
    if (!lamps.empty) this.addMesh(ch, lamps.build(), this.lampMat, { cast: false, receive: false });
    if (!pools.empty) {
      const m = this.addMesh(ch, pools.build(), this.poolMat, { cast: false, receive: false });
      m.renderOrder = 1;
    }
  }

  makeBuilding(fac, roofs, misc, ch, lot, dist, rnd) {
    const [x0, x1, z0, z1] = lot;
    const set = rnd() * 1.2;
    let bx0 = x0 + set;
    let bx1 = x1 - set;
    let bz0 = z0 + set;
    let bz1 = z1 - set;
    const tall = dist > 0.55;
    const FL = 3.5;
    let floors = tall ? 10 + Math.floor(rnd() * rnd() * 36 * dist) : 3 + Math.floor(rnd() * 8);
    const style = tall ? (rnd() < 0.6 ? 0 : 1) : rnd() < 0.55 ? 2 : 1;
    let y0 = CURB;
    const uo = Math.floor(rnd() * 8) / 8;
    const vo = Math.floor(rnd() * 8) / 8;
    ch.colliders.push([bx0, bx1, bz0, bz1]);
    // torre com recuos escalonados
    for (let tier = 0; tier < 3; tier++) {
      const h = floors * FL;
      this.blockBox(fac[style], bx0, bx1, bz0, bz1, y0, y0 + h, uo, vo);
      const top = y0 + h;
      // cobertura com platibanda
      roofs.box((bx0 + bx1) / 2, top + 0.01, (bz0 + bz1) / 2, bx1 - bx0, 0.02, bz1 - bz0, [1, 1, 1], null, {
        uvScale: 4,
        ao: 0,
        skip: 'ny',
      });
      const pc = style === 2 ? [0.5, 0.26, 0.2] : [0.55, 0.54, 0.52];
      misc.box((bx0 + bx1) / 2, top + 0.5, bz0 + 0.15, bx1 - bx0, 1, 0.3, pc, null, { ao: 0 });
      misc.box((bx0 + bx1) / 2, top + 0.5, bz1 - 0.15, bx1 - bx0, 1, 0.3, pc, null, { ao: 0 });
      misc.box(bx0 + 0.15, top + 0.5, (bz0 + bz1) / 2, 0.3, 1, bz1 - bz0 - 0.6, pc, null, { ao: 0 });
      misc.box(bx1 - 0.15, top + 0.5, (bz0 + bz1) / 2, 0.3, 1, bz1 - bz0 - 0.6, pc, null, { ao: 0 });
      const w = bx1 - bx0;
      const dd = bz1 - bz0;
      if (!tall || tier === 2 || rnd() < 0.5 || w < 16 || dd < 16) {
        // casas de máquinas e caixa d'água
        const n = 1 + Math.floor(rnd() * 3);
        for (let k = 0; k < n; k++) {
          const sx = 2 + rnd() * 4;
          const sz = 2 + rnd() * 4;
          const cx = bx0 + 2 + sx / 2 + rnd() * Math.max(0, w - sx - 4);
          const cz = bz0 + 2 + sz / 2 + rnd() * Math.max(0, dd - sz - 4);
          misc.box(cx, top + 1.2, cz, sx, 2.4, sz, [0.5, 0.5, 0.5], null, { ao: 0.3, floorY: top });
        }
        if (style === 2 && rnd() < 0.6) {
          const cx = bx0 + w * 0.7;
          const cz = bz0 + dd * 0.3;
          for (const o of [
            [-1, -1],
            [1, -1],
            [-1, 1],
            [1, 1],
          ])
            misc.box(cx + o[0] * 1.1, top + 1.2, cz + o[1] * 1.1, 0.15, 2.4, 0.15, [0.3, 0.25, 0.2], null, { ao: 0 });
          misc.cylinder(cx, top + 3.6, cz, 1.6, 2.6, [0.45, 0.33, 0.24], null, { sides: 14 });
        }
        break;
      }
      // próximo recuo
      const inset = 3 + rnd() * 3;
      bx0 += inset;
      bx1 -= inset;
      bz0 += inset;
      bz1 -= inset;
      y0 = top;
      floors = Math.max(4, Math.floor(floors * (0.4 + rnd() * 0.4)));
    }
  }

  // Quatro fachadas com UV em vãos (12 m) e andares (14 m).
  blockBox(gb, x0, x1, z0, z1, y0, y1, uo, vo) {
    const U = 24;
    const V = 28;
    const v0 = (y0 - CURB) / V + vo;
    const v1 = (y1 - CURB) / V + vo;
    const W = [1, 1, 1];
    const cols = [W, W, W, W];
    const face = (ax, az, bx, bz, n, len) => {
      gb.quad(
        [
          [ax, y0, az],
          [bx, y0, bz],
          [bx, y1, bz],
          [ax, y1, az],
        ],
        n,
        [uo, v0, uo + len / U, v0, uo + len / U, v1, uo, v1],
        null,
        cols,
      );
    };
    face(x0, z1, x1, z1, [0, 0, 1], x1 - x0);
    face(x1, z0, x0, z0, [0, 0, -1], x1 - x0);
    face(x1, z1, x1, z0, [1, 0, 0], z1 - z0);
    face(x0, z0, x0, z1, [-1, 0, 0], z1 - z0);
  }

  parking(misc, cars, lot, rnd) {
    const [x0, x1, z0, z1] = lot;
    misc.box((x0 + x1) / 2, CURB + 0.01, (z0 + z1) / 2, x1 - x0, 0.02, z1 - z0, [0.22, 0.22, 0.23], null, { ao: 0, uvScale: 4 });
    for (let x = x0 + 2.5; x < x1 - 2; x += 2.7) {
      misc.box(x, CURB + 0.025, z0 + 3, 0.1, 0.01, 5, [0.8, 0.8, 0.78], null, { ao: 0 });
      if (rnd() < 0.3) this.car(cars, x + 1.35, z0 + 3, Math.PI / 2, rnd);
    }
  }

  plaza(misc, lot, rnd) {
    const [x0, x1, z0, z1] = lot;
    misc.box((x0 + x1) / 2, CURB + 0.06, (z0 + z1) / 2, x1 - x0 - 4, 0.12, z1 - z0 - 4, [0.3, 0.38, 0.2], null, { ao: 0, uvScale: 4 });
    for (let k = 0; k < 4; k++) this.tree(misc, x0 + 4 + rnd() * (x1 - x0 - 8), z0 + 4 + rnd() * (z1 - z0 - 8), rnd);
  }

  tree(misc, x, z, rnd) {
    const h = 3 + rnd() * 2;
    misc.cylinder(x, CURB + h / 2, z, 0.14, h, [0.3, 0.25, 0.2], null, { sides: 7 });
    const m = new THREE.Matrix4();
    const g = [0.16 + rnd() * 0.06, 0.24 + rnd() * 0.06, 0.12];
    for (let k = 0; k < 3; k++) {
      const s = 1.4 + rnd() * 0.8;
      m.makeScale(s, s * 0.85, s).setPosition(x + (rnd() - 0.5) * 1.4, CURB + h + 0.4 + rnd() * 0.8, z + (rnd() - 0.5) * 1.4);
      misc.addGeometry(this.foliageGeo, m, g);
    }
  }

  car(cars, x, z, rot, rnd) {
    const palette = [
      [0.55, 0.05, 0.04],
      [0.08, 0.1, 0.16],
      [0.75, 0.75, 0.73],
      [0.05, 0.05, 0.05],
      [0.2, 0.3, 0.45],
      [0.6, 0.6, 0.62],
      [0.3, 0.35, 0.25],
    ];
    const col = palette[Math.floor(rnd() * palette.length)];
    const ux = Math.cos(rot);
    const uz = -Math.sin(rot);
    cars.box(x, 0.62, z, 4.3, 0.75, 1.8, col, null, { rot, ao: 0 });
    cars.box(x - ux * 0.3, 1.25, z - uz * 0.3, 2.2, 0.55, 1.62, [0.04, 0.05, 0.06], null, { rot, ao: 0 });
    cars.box(x - ux * 0.3, 1.54, z - uz * 0.3, 2.0, 0.05, 1.56, col, null, { rot, ao: 0 });
    for (const s of [-1.35, 1.35]) {
      for (const t of [-0.82, 0.82]) {
        const cx = x + ux * s - uz * t;
        const cz = z + uz * s + ux * t;
        cars.cylinder(cx, 0.34, cz, 0.34, 0.24, [0.04, 0.04, 0.04], null, { axis: Math.abs(ux) > 0.5 ? 'z' : 'x', sides: 10 });
      }
    }
    return [
      x - Math.abs(ux) * 2.2 - Math.abs(uz) * 0.95,
      x + Math.abs(ux) * 2.2 + Math.abs(uz) * 0.95,
      z - Math.abs(uz) * 2.2 - Math.abs(ux) * 0.95,
      z + Math.abs(uz) * 2.2 + Math.abs(ux) * 0.95,
    ];
  }

  // Postes, semáforos, árvores, lixeiras e carros estacionados ao longo do quarteirão.
  streetSide(ch, misc, cars, lamps, pools, rnd, x0, z0) {
    const sides = [
      // [ponto inicial, direção ao longo, normal para a rua]
      { ax: x0 + SW, az: z0 + SW - 0.6, dx: 1, dz: 0, nx: 0, nz: -1 },
      { ax: x0 + SW, az: z0 + P - SW + 0.6, dx: 1, dz: 0, nx: 0, nz: 1 },
      { ax: x0 + SW - 0.6, az: z0 + SW, dx: 0, dz: 1, nx: -1, nz: 0 },
      { ax: x0 + P - SW + 0.6, az: z0 + SW, dx: 0, dz: 1, nx: 1, nz: 0 },
    ];
    const len = P - 2 * SW;
    const warm = [1.0, 0.72, 0.42];
    for (const s of sides) {
      // postes de iluminação
      for (let t = 6; t < len; t += 20) {
        const x = s.ax + s.dx * t;
        const z = s.az + s.dz * t;
        misc.cylinder(x, CURB + 4, z, 0.09, 8, [0.22, 0.23, 0.24], null, { sides: 8 });
        misc.box(x + s.nx * 0.9, CURB + 7.9, z + s.nz * 0.9, s.nx ? 1.8 : 0.1, 0.1, s.nz ? 1.8 : 0.1, [0.22, 0.23, 0.24], null, { ao: 0 });
        lamps.box(x + s.nx * 1.7, CURB + 7.8, z + s.nz * 1.7, 0.5, 0.08, 0.3, warm, null, {
          ao: 0,
          rot: s.nx ? 0 : Math.PI / 2,
          skip: 'py',
        });
        misc.box(x + s.nx * 1.7, CURB + 7.89, z + s.nz * 1.7, s.nx ? 0.6 : 0.36, 0.1, s.nx ? 0.36 : 0.6, [0.2, 0.2, 0.21], null, { ao: 0 });
        ch.colliders.push([x - 0.15, x + 0.15, z - 0.15, z + 0.15]);
        // poça de luz no chão
        const px = x + s.nx * 1.7;
        const pz = z + s.nz * 1.7;
        const R = 5.5;
        pools.quad(
          [
            [px - R, 0.03, pz + R],
            [px + R, 0.03, pz + R],
            [px + R, 0.03, pz - R],
            [px - R, 0.03, pz - R],
          ],
          [0, 1, 0],
          [0, 0, 1, 0, 1, 1, 0, 1],
          null,
          null,
        );
      }
      // árvores na calçada
      if (rnd() < 0.55) {
        for (let t = 16; t < len - 4; t += 20) this.tree(misc, s.ax + s.dx * t - s.nx * 1.2, s.az + s.dz * t - s.nz * 1.2, rnd);
      }
      // lixeira / hidrante / banco
      const t = 10 + rnd() * (len - 20);
      const x = s.ax + s.dx * t - s.nx * 0.2;
      const z = s.az + s.dz * t - s.nz * 0.2;
      const k = rnd();
      if (k < 0.35) {
        misc.cylinder(x, CURB + 0.45, z, 0.28, 0.9, [0.15, 0.25, 0.18], null, { sides: 10 });
        ch.colliders.push([x - 0.3, x + 0.3, z - 0.3, z + 0.3]);
      } else if (k < 0.55) {
        misc.cylinder(x, CURB + 0.35, z, 0.14, 0.7, [0.7, 0.12, 0.08], null, { sides: 8 });
        misc.cylinder(x, CURB + 0.75, z, 0.1, 0.12, [0.7, 0.12, 0.08], null, { sides: 8 });
      } else if (k < 0.8) {
        const bx = x - s.nx * 1.4;
        const bz = z - s.nz * 1.4;
        misc.box(bx, CURB + 0.45, bz, s.nx ? 0.5 : 1.8, 0.08, s.nx ? 1.8 : 0.5, [0.4, 0.3, 0.2], null, { ao: 0 });
        misc.box(bx - s.nx * 0.22, CURB + 0.75, bz - s.nz * 0.22, s.nx ? 0.06 : 1.8, 0.5, s.nx ? 1.8 : 0.06, [0.4, 0.3, 0.2], null, {
          ao: 0,
        });
        misc.box(bx, CURB + 0.22, bz, s.nx ? 0.4 : 1.6, 0.44, s.nx ? 1.6 : 0.4, [0.15, 0.15, 0.16], null, { ao: 0 });
      }
      // carros estacionados junto ao meio-fio
      for (let tc = 8; tc < len - 6; tc += 6.5) {
        if (rnd() > 0.22) continue;
        const cx = s.ax + s.dx * tc + s.nx * 5.0;
        const cz = s.az + s.dz * tc + s.nz * 5.0;
        const box = this.car(cars, cx, cz, s.dx ? 0 : Math.PI / 2, rnd);
        ch.colliders.push(box);
        tc += 2;
      }
    }
    // semáforos nos quatro cantos
    const corners = [
      [x0 + SW - 0.8, z0 + SW - 0.8, -1, -1],
      [x0 + P - SW + 0.8, z0 + SW - 0.8, 1, -1],
      [x0 + SW - 0.8, z0 + P - SW + 0.8, -1, 1],
      [x0 + P - SW + 0.8, z0 + P - SW + 0.8, 1, 1],
    ];
    for (const [x, z, sx, sz] of corners) {
      misc.cylinder(x, CURB + 2.9, z, 0.1, 5.8, [0.18, 0.19, 0.18], null, { sides: 8 });
      ch.colliders.push([x - 0.15, x + 0.15, z - 0.15, z + 0.15]);
      // braço sobre a rua (direção x) e cabeça do semáforo para o tráfego norte-sul
      const ax = x + sx * 3.2;
      misc.box(x + sx * 1.8, CURB + 5.6, z, 3.6, 0.1, 0.1, [0.18, 0.19, 0.18], null, { ao: 0 });
      misc.box(ax, CURB + 5.05, z, 0.35, 1.0, 0.3, [0.08, 0.08, 0.07], null, { ao: 0 });
      const face = z + sz * 0.16;
      const lights = [
        [CURB + 5.36, [1.0, 0.08, 0.04], 1],
        [CURB + 5.05, [1.0, 0.6, 0.05], 2],
        [CURB + 4.74, [0.1, 1.0, 0.45], 3],
      ];
      for (const [ly, col, g] of lights) lamps.box(ax, ly, face, 0.18, 0.18, 0.02, col, null, { ao: 0, group: g });
      // cabeça baixa no próprio poste para o tráfego leste-oeste
      misc.box(x, CURB + 3.2, z + sz * 0.2, 0.3, 0.9, 0.3, [0.08, 0.08, 0.07], null, { ao: 0 });
      const fx = x + sx * 0.16;
      const l2 = [
        [CURB + 3.48, [1.0, 0.08, 0.04], 4],
        [CURB + 3.2, [1.0, 0.6, 0.05], 5],
        [CURB + 2.92, [0.1, 1.0, 0.45], 6],
      ];
      for (const [ly, col, g] of l2) lamps.box(fx, ly, z + sz * 0.2, 0.02, 0.16, 0.16, col, null, { ao: 0, group: g });
    }
  }

  isExitChunk(i, j) {
    return this.exitChunk && i === this.exitChunk[0] && j === this.exitChunk[1];
  }

  // Orelhão (telefone público brasileiro): concha laranja aberta para a frente.
  payphone(misc, ch) {
    const e = this.exit;
    const [ox, oz] = e.dir;
    const hx = e.x - ox * 0.2;
    const hz = e.z - oz * 0.2;
    // poste atrás da concha
    misc.cylinder(e.x - ox * 0.78, CURB + 1.25, e.z - oz * 0.78, 0.06, 2.5, [0.5, 0.5, 0.5], null, { sides: 8 });
    misc.box(e.x - ox * 0.7, CURB + 2.35, e.z - oz * 0.7, 0.1, 0.1, 0.1, [0.4, 0.4, 0.4], null, { ao: 0 });
    const m = new THREE.Matrix4()
      .makeRotationY(e.face)
      .scale(new THREE.Vector3(1, 1.2, 1))
      .setPosition(hx, CURB + 1.62, hz);
    const hood = this.hoodGeo.clone().toNonIndexed();
    misc.addGeometry(hood, m, [0.95, 0.48, 0.06]);
    // parte interna (faces invertidas para ser vista por dentro)
    const inner = hood.clone();
    const p = inner.attributes.position;
    for (let k = 0; k < p.count; k += 3) {
      for (let c = 0; c < 3; c++) {
        const t = p.getComponent(k + 1, c);
        p.setComponent(k + 1, c, p.getComponent(k + 2, c));
        p.setComponent(k + 2, c, t);
      }
    }
    const nn = inner.attributes.normal;
    for (let k = 0; k < nn.count; k++) nn.setXYZ(k, -nn.getX(k), -nn.getY(k), -nn.getZ(k));
    misc.addGeometry(inner, m.clone().multiply(new THREE.Matrix4().makeScale(0.97, 0.97, 0.97)), [0.8, 0.42, 0.08]);
    hood.dispose();
    inner.dispose();
    // aparelho preso ao fundo da concha
    misc.box(e.x - ox * 0.62, CURB + 1.42, e.z - oz * 0.62, 0.3, 0.46, 0.3, [0.32, 0.34, 0.36], null, { rot: e.face, ao: 0 });
    misc.box(e.x - ox * 0.46, CURB + 1.5, e.z - oz * 0.46, 0.22, 0.07, 0.07, [0.08, 0.08, 0.08], null, { rot: e.face, ao: 0 });
    misc.box(e.x - ox * 0.47, CURB + 1.32, e.z - oz * 0.47, 0.12, 0.14, 0.02, [0.7, 0.7, 0.66], null, { rot: e.face, ao: 0 });
    ch.colliders.push([e.x - ox * 0.6 - 0.3, e.x - ox * 0.6 + 0.3, e.z - oz * 0.6 - 0.3, e.z - oz * 0.6 + 0.3]);
  }

  route() {
    const rnd = mulberry32(this.seed * 7 + 3);
    const bi = (rnd() < 0.5 ? -1 : 1) * (1 + Math.floor(rnd() * 2));
    const bj = (rnd() < 0.5 ? -1 : 1) * (2 + Math.floor(rnd() * 2));
    this.exitChunk = [bi, bj];
    // na calçada sul do quarteirão, de frente para a rua
    const x = bi * P + P / 2 + (rnd() - 0.5) * 30;
    const z = bj * P + SW - 2.2;
    // abertura do orelhão voltada para a rua (-z)
    const dir = [0, -1];
    this.exit = { x, z, dir, face: Math.atan2(dir[1], -dir[0]) };
    this.spawn = { x: SW - 2, z: SW - 2, yaw: Math.atan2(-(x - SW), -(z - SW)) };
    // placa "TELEFONE" acima do orelhão
    const t = signTex('TELEFONE PÚBLICO', '#0f2c6b', '#f2f2f2', 256, 48);
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(0.9, 0.17),
      new THREE.MeshBasicMaterial({ map: t, color: new THREE.Color(1.6, 1.6, 1.6), side: THREE.DoubleSide }),
    );
    sign.position.set(x - dir[0] * 0.2, CURB + 2.52, z - dir[1] * 0.2);
    sign.rotation.y = Math.atan2(dir[0], dir[1]);
    this.dynamic.add(sign);
    this.ringLight = new THREE.Mesh(
      new THREE.SphereGeometry(0.035, 8, 6),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 0.4, 0.2) }),
    );
    this.ringLight.position.set(x - dir[0] * 0.46, CURB + 1.72, z - dir[1] * 0.46);
    this.dynamic.add(this.ringLight);
  }

  groundY(x, z) {
    const q = (v) => Math.abs(((((v + P / 2) % P) + P) % P) - P / 2);
    return q(x) > SW - 4 && q(z) > SW - 4 ? CURB : 0;
  }

  surfaceAt(x, z) {
    return this.groundY(x, z) > 0 ? 'concrete' : 'asphalt';
  }

  update(dt, player) {
    const p = player.pos;
    this.updateChunks(p.x, p.z);
    const cam = this.game.camera.position;
    this.sky.position.copy(cam);
    this.sky.material.uniforms.uTime.value += dt;
    this.ground.position.set(Math.round(cam.x / 8) * 8, 0, Math.round(cam.z / 8) * 8);
    this.updateSun(p);
    // ciclo dos semáforos: NS verde 12 s, amarelo 3 s, vermelho; depois EW
    this.signal = (this.signal + dt) % 30;
    const t = this.signal;
    const I = 7;
    const nsG = t < 12;
    const nsY = t >= 12 && t < 15;
    const ewG = t >= 15 && t < 27;
    const ewY = t >= 27;
    const u = this.lampMat.uniforms.uI.value;
    u[0] = 5;
    u[1] = nsG || nsY ? 0 : I;
    u[2] = nsY ? I : 0;
    u[3] = nsG ? I : 0;
    u[4] = ewG || ewY ? 0 : I;
    u[5] = ewY ? I : 0;
    u[6] = ewG ? I : 0;
    // luz do orelhão pisca enquanto toca
    const ring = this.game.time % 6 < 2.8;
    this.ringLight.visible = ring && Math.sin(this.game.time * 20) > 0;
  }

  interactable(player) {
    const e = this.exit;
    if (Math.hypot(player.pos.x - e.x, player.pos.z - e.z) < 1.6) {
      return {
        label: 'Atender o telefone',
        action: () => {
          this.game.audio.stopAll();
          this.game.hud.message('Uma voz chiada: “Você ainda está aí? Siga pelos corredores brancos.”', 5);
          this.game.reachExit('phone', 2.4);
        },
      };
    }
    return null;
  }

  exitEmitter() {
    return { x: this.exit.x, y: CURB + 1.6, z: this.exit.z, sound: 'phone' };
  }

  dispose() {
    super.dispose();
    this.ground.geometry.dispose();
  }
}
