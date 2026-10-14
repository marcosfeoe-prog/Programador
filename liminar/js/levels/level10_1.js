// Subnível 10.1 — "Lago dos Cadáveres": um lago artificial escuro no meio do
// trigo do Nível 10. Margem de lama e juncos, árvores secas, formas boiando ao
// longe e um píer comprido com um barco a remo amarrado no fim.
// Sem entidades: o perigo é a água gelada (rasa deixa lento e drena a sanidade;
// funda não deixa passar).
import * as THREE from 'three';
import { OutdoorLevel, makeSky } from './outdoor.js';
import { pushCircle } from './grid.js';
import { GeoBuilder } from '../materials.js';
import { getTex, signTex } from '../textures.js';
import { hash3, mulberry32, vnoise, clamp, damp } from '../util.js';
import {
  LAKE_GLSL,
  DEEP,
  shoreDist,
  groundH,
  lakeAngle,
  shorePoint,
  treeBand,
  pathC,
  makeWaterMaterial,
  makeWaterGeometry,
  tube,
  deadTree,
  buildBoat,
} from './level10_1_lake.js';

const PIER_L = 34; // comprimento do píer
const PIER_W = 1.8; // largura do deck
const DECK_Y = 0.62; // altura do deck sobre a água
const A_SPAWN = 2.45; // ângulo da margem onde o jogador chega
const A_PIER = 0.88; // ângulo da margem onde começa o píer

const SKY = {
  zenith: [0.2, 0.215, 0.24],
  horizon: [0.47, 0.49, 0.5],
  ground: [0.2, 0.19, 0.16],
  sunDir: new THREE.Vector3(-0.55, 0.32, -0.6),
  sunColor: [0.2, 0.2, 0.19],
  cloudA: [0.13, 0.14, 0.155],
  cloudB: [0.62, 0.63, 0.645],
  cover: -0.02,
  cloudScale: 0.75,
};

const _v = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _f = new THREE.Vector3();
const _u = new THREE.Vector3();
const _size = new THREE.Vector2();

export class Level10_1 extends OutdoorLevel {
  constructor(game) {
    super(game, { walkSpeed: 2.3 });
    this.num = 10.1;
    this.seed = (game.seed ^ 0x10a1) >>> 0;
    const Q = this.Q;
    this.look = {
      exposure: 0.86,
      tint: [0.97, 0.99, 1.02],
      sat: 0.3,
      contrast: 1.16,
      lift: [0.018, 0.019, 0.021],
      bloom: 0.04,
      bloomThreshold: 2.5,
      fog: [0.45, 0.47, 0.48],
      lightColor: [1, 1, 1],
      flashlight: false,
      ambience: 'level10_1',
      reverb: 0.7,
      sanityDrain: 0.1,
    };
    this.objectives = [
      { id: 'pier', text: 'Siga a margem até o píer' },
      { id: 'boat', text: 'Entre no barco' },
    ];
    this.time = 0;
    this.cold = 0;
    this.sanityExtra = 0;
    this.baseWalk = this.walkSpeed;
    this.warnT = 0;
    this.toldWater = false;
    this.toldCold = false;
    this.boarding = null;
    this.wasOnDeck = false;
    this.staticCol = [];

    const fogC = new THREE.Color(...this.look.fog);
    this.fogDensity = 1.6 / Q.outdoorView;
    this.scene.fog = new THREE.FogExp2(fogC, this.fogDensity);
    this.scene.background = fogC;
    this.sky = makeSky({ ...SKY, fog: this.look.fog });
    this.scene.add(this.sky);
    this.setupLights({
      sky: 0xc9cdd3,
      ground: 0x4a453a,
      hemi: 2.0,
      sunColor: 0xe8e8e4,
      sun: 0.55,
      sunDir: new THREE.Vector3(-0.4, 0.8, -0.45),
      shadowExtent: 45,
    });

    this.layout();
    this.makeMaterials();
    this.makeGround();
    this.makeGrass();
    this.makeWater();
    this.makePier();
    this.makeBoat();
    this.makeFloaters();
  }

  // ------------------------------------------------------------ disposição
  layout() {
    // píer: começa na trilha e avança em direção ao centro do lago
    const b = shorePoint(A_PIER, 0);
    const d = Math.hypot(b.x, b.z);
    this.pd = { x: -b.x / d, z: -b.z / d }; // direção do píer
    this.pl = { x: this.pd.z, z: -this.pd.x }; // lateral
    const st = shorePoint(A_PIER, pathC(A_PIER) - 0.3);
    this.po = { x: st.x, z: st.z }; // início (em terra)
    this.pierRot = Math.atan2(this.pd.x, this.pd.z);
    this.pierStart = { x: this.po.x + this.pd.x * 1.2, z: this.po.z + this.pd.z * 1.2 };
    // barco amarrado ao lado do fim do píer
    const bu = PIER_L - 2.2;
    const bv = PIER_W / 2 + 0.78;
    this.boatPos = { x: this.po.x + this.pd.x * bu + this.pl.x * bv, z: this.po.z + this.pd.z * bu + this.pl.z * bv };
    this.exit = { x: this.boatPos.x, z: this.boatPos.z };
    // chegada: na trilha, olhando pela margem na direção do píer
    const sp = shorePoint(A_SPAWN, pathC(A_SPAWN));
    const look = shorePoint(A_SPAWN - 0.42, -14);
    this.spawn = { x: sp.x, z: sp.z, yaw: Math.atan2(-(look.x - sp.x), -(look.z - sp.z)) };
    // bancos ao longo da trilha, virados para a água
    this.benches = [2.1, 1.62, 1.18].map((a) => {
      const p = shorePoint(a, pathC(a) + 1.7);
      return { x: p.x, z: p.z, rot: Math.atan2(p.x, p.z) };
    });
    // áreas sem capim/trigo (vec3: x, z, raio)
    this.clears = [[this.po.x, this.po.z, 3.2], [sp.x, sp.z, 2.5], ...this.benches.map((bb) => [bb.x, bb.z, 1.8])];
  }

  pierLocal(x, z) {
    const dx = x - this.po.x;
    const dz = z - this.po.z;
    return { u: dx * this.pd.x + dz * this.pd.z, v: dx * this.pl.x + dz * this.pl.z };
  }
  pierWorld(u, v) {
    return { x: this.po.x + this.pd.x * u + this.pl.x * v, z: this.po.z + this.pd.z * u + this.pl.z * v };
  }
  onDeck(u, v) {
    return u > -0.4 && u < PIER_L && Math.abs(v) < PIER_W / 2 + 0.05;
  }

  // ------------------------------------------------------------ materiais
  makeMaterials() {
    const Q = this.Q;
    const S = Q.tex;
    const std = (o) =>
      Q.lambert
        ? new THREE.MeshLambertMaterial({ map: o.map, vertexColors: true, side: o.side || THREE.FrontSide })
        : new THREE.MeshStandardMaterial({
            map: o.map,
            normalMap: Q.normalMaps ? o.normalMap || null : null,
            vertexColors: true,
            roughness: o.roughness ?? 0.9,
            side: o.side || THREE.FrontSide,
          });
    const pl = getTex('planks', S);
    const wd = getTex('l101Wood', S);
    const bk = getTex('l101Bark', S);
    const gr = getTex('grime', S);
    this.woodMat = std({ map: wd.map, normalMap: wd.normalMap, roughness: 0.88 });
    this.boatMat = std({ map: pl.map, normalMap: pl.normalMap, roughness: 0.75, side: THREE.DoubleSide });
    this.barkMat = std({ map: bk.map, normalMap: bk.normalMap, roughness: 0.95 });
    this.miscMat = std({ map: gr.map, roughness: 0.8 });
    // juncos: folhas com transparência balançando ao vento
    this.reedU = { uTime: { value: 0 } };
    this.reedMat = new THREE.MeshLambertMaterial({
      map: getTex('l101Reeds', Math.min(512, S * 2)).map,
      alphaTest: 0.4,
      side: THREE.DoubleSide,
      vertexColors: true,
    });
    this.reedMat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.reedU);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3( 0.0, 1.0, 0.0 );')
        .replace(
          '#include <begin_vertex>',
          `vec3 transformed = position;
          float bend = uv.y * uv.y;
          float w = sin( uTime * 1.3 + position.x * 0.3 + position.z * 0.2 ) * 0.6 + sin( uTime * 0.45 + position.x * 0.05 ) * 0.8 + 0.3;
          transformed.xz += vec2( 0.8, 0.6 ) * w * bend * 0.12;`,
        );
      sh.fragmentShader = sh.fragmentShader.replace(
        '#include <normal_fragment_begin>',
        '#include <normal_fragment_begin>\nnormal = normalize( vNormal );',
      );
    };
    this.reedMat.customProgramCacheKey = () => 'l101-reeds';
  }

  // ------------------------------------------------------------ chão
  makeGround() {
    const Q = this.Q;
    const size = Q.outdoorView * 2 + 40;
    const seg = Math.min(360, Math.ceil(size / (Q.id === 'low' ? 2.4 : Q.id === 'medium' ? 2.0 : 1.8)));
    this.groundStep = size / seg;
    const g = new THREE.PlaneGeometry(size, size, seg, seg);
    g.rotateX(-Math.PI / 2);
    const soil = getTex('soil', Q.tex);
    const path = getTex('pathDirt', Q.tex);
    const mat = new THREE.MeshStandardMaterial({ map: soil.map, roughness: 1 });
    const uniforms = { uPath: { value: path.map }, uWheatR: { value: Q.wheatRadius } };
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, uniforms);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nuniform float uWheatR;\n' + LAKE_GLSL)
        .replace(
          '#include <beginnormal_vertex>',
          `vec2 gxz = ( modelMatrix * vec4( position, 1.0 ) ).xz;
          float e = 0.6;
          float hx = groundH( gxz + vec2( e, 0.0 ) ) - groundH( gxz - vec2( e, 0.0 ) );
          float hz = groundH( gxz + vec2( 0.0, e ) ) - groundH( gxz - vec2( 0.0, e ) );
          vec3 objectNormal = normalize( vec3( -hx / ( 2.0 * e ), 1.0, -hz / ( 2.0 * e ) ) );`,
        )
        .replace(
          '#include <begin_vertex>',
          `vec2 gsa = lakeSA( gxz );
          // ao longe o chão do campo sobe até a altura do trigo
          float fieldV = smoothstep( 24.0, 32.0, gsa.x );
          float farV = smoothstep( uWheatR * 0.5, uWheatR * 0.72, distance( gxz, cameraPosition.xz ) );
          vec3 transformed = vec3( position.x, groundAt( gxz, gsa.x ) + 0.92 * fieldV * farV, position.z );`,
        )
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;');
      sh.fragmentShader = sh.fragmentShader
        .replace(
          '#include <common>',
          '#include <common>\nvarying vec3 vWPos;\nuniform sampler2D uPath;\nuniform float uWheatR;\n' + LAKE_GLSL,
        )
        .replace(
          '#include <map_fragment>',
          `vec2 w = vWPos.xz;
          vec2 sa = lakeSA( w );
          float s = sa.x;
          vec3 soilC = texture2D( map, w * 0.25 ).rgb;
          vec3 dirtC = texture2D( uPath, w * 0.3 ).rgb;
          float nz = texture2D( map, w * 0.013 ).r;
          float nz2 = texture2D( map, w * 0.047 + 0.31 ).r;
          // lama molhada da margem e lodo no fundo
          float lum = dot( soilC, vec3( 0.333 ) );
          vec3 mud = vec3( 0.36, 0.33, 0.27 ) * ( lum * 1.4 + 0.25 ) * ( 0.75 + nz2 * 0.5 );
          vec3 silt = vec3( 0.2, 0.19, 0.15 ) * ( 0.7 + nz * 0.6 );
          // capim seco e ralo
          vec3 grassC = mix( soilC * vec3( 0.9, 0.88, 0.75 ), vec3( 0.3, 0.29, 0.21 ) * ( 0.65 + nz * 0.5 + nz2 * 0.3 ), 0.7 );
          // trilha de pescadores ao redor do lago
          float pd = abs( s - pathC( sa.y ) ) + ( nz2 - 0.45 ) * 0.9;
          float onPath = 1.0 - smoothstep( 0.6, 1.25, pd );
          // trigo ao longe (o trigo instanciado acaba no raio)
          float df = distance( w, cameraPosition.xz );
          float streak = texture2D( map, vec2( w.x * 0.9, w.y * 0.07 ) ).r * 0.6 + texture2D( map, w * 0.11 ).r * 0.6;
          vec3 wheatFar = vec3( 0.56, 0.43, 0.22 ) * ( 0.62 + nz * 0.35 + streak * 0.45 );
          float fieldF = smoothstep( 24.0, 32.0, s + ( nz - 0.4 ) * 8.0 );
          vec3 land = mix( grassC, mix( soilC * vec3( 0.95, 0.9, 0.75 ), wheatFar, smoothstep( uWheatR * 0.45, uWheatR * 0.7, df ) ), fieldF );
          land = mix( land, dirtC * vec3( 0.8, 0.78, 0.74 ), onPath * ( 1.0 - fieldF ) );
          vec3 bank = mix( mud, land, smoothstep( 1.4, 3.4, s + ( nz2 - 0.5 ) * 1.5 ) );
          vec3 col = mix( silt, bank, smoothstep( -1.2, 0.2, s ) );
          // faixa escura encharcada junto da água
          col *= 1.0 - 0.35 * smoothstep( 1.2, 0.0, abs( s - 0.15 ) );
          diffuseColor.rgb *= col;
          float lakeS = s;`,
        )
        .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = mix( 0.45, 1.0, smoothstep( -0.2, 2.2, lakeS ) );');
    };
    mat.customProgramCacheKey = () => 'l101-ground';
    this.ground = new THREE.Mesh(g, mat);
    this.ground.receiveShadow = Q.shadows;
    this.ground.frustumCulled = false;
    this.scene.add(this.ground);
  }

  // Capim baixo perto da margem e trigo mais longe: grade fixa que "dá a volta"
  // ao redor da câmera no shader (mesma técnica do Nível 10).
  makeGrass() {
    const Q = this.Q;
    const R = Q.wheatRadius;
    const N = Math.round((2 * R) / Q.wheatSpacing);
    const sp = (2 * R) / N;
    const base = new THREE.BufferGeometry();
    const pos = [];
    const uv = [];
    const nor = [];
    const idx = [];
    const W = 0.55;
    const H = 1.18;
    for (let k = 0; k < 3; k++) {
      const a = (k * Math.PI) / 3;
      const cx = Math.cos(a) * W;
      const cz = Math.sin(a) * W;
      const b = pos.length / 3;
      for (let r = 0; r <= 2; r++) {
        const y = (r / 2) * H;
        pos.push(-cx, y, -cz, cx, y, cz);
        uv.push(0, r / 2, 1, r / 2);
        nor.push(0, 1, 0, 0, 1, 0);
      }
      for (let r = 0; r < 2; r++) {
        const o = b + r * 2;
        idx.push(o, o + 1, o + 3, o, o + 3, o + 2);
      }
    }
    base.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    base.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    base.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    base.setIndex(idx);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index;
    geo.attributes = base.attributes;
    const off = new Float32Array(N * N * 2);
    const rnd = new Float32Array(N * N * 3);
    const rr = mulberry32(this.seed + 99);
    let n = 0;
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        off[n * 2] = (i + 0.15 + rr() * 0.7) * sp - R;
        off[n * 2 + 1] = (j + 0.15 + rr() * 0.7) * sp - R;
        rnd[n * 3] = rr();
        rnd[n * 3 + 1] = rr();
        rnd[n * 3 + 2] = rr();
        n++;
      }
    }
    geo.setAttribute('aOff', new THREE.InstancedBufferAttribute(off, 2));
    geo.setAttribute('aRnd', new THREE.InstancedBufferAttribute(rnd, 3));
    geo.instanceCount = N * N;
    const mat = new THREE.MeshLambertMaterial({
      map: getTex('wheat', Math.min(512, Q.tex * 2)).map,
      alphaTest: 0.45,
      side: THREE.DoubleSide,
      alphaToCoverage: Q.msaa > 0,
    });
    this.grassU = {
      uCam: { value: new THREE.Vector3() },
      uR: { value: R },
      uTime: { value: 0 },
      uClear: { value: Array.from({ length: 8 }, (_, k) => new THREE.Vector3(...(this.clears[k] || [1e6, 1e6, 0]))) },
    };
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.grassU);
      sh.vertexShader = sh.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
          attribute vec2 aOff;
          attribute vec3 aRnd;
          uniform vec3 uCam;
          uniform float uR;
          uniform float uTime;
          uniform vec3 uClear[8];
          varying float vTint;
          varying float vMeadow;
          ${LAKE_GLSL}`,
        )
        .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3( 0.0, 1.0, 0.0 );')
        .replace(
          '#include <begin_vertex>',
          `vec2 cc = uCam.xz;
          vec2 wp = cc + mod( aOff - cc + uR, 2.0 * uR ) - uR;
          float dd = length( wp - cc );
          float s = mix( 1.0, 0.6, smoothstep( uR * 0.74, uR, dd ) ) * step( dd, uR ) * ( 0.78 + aRnd.y * 0.4 );
          vec2 sa = lakeSA( wp );
          // trigo no campo, capim ralo e baixo entre a lama e o campo, nada na trilha
          float field = smoothstep( 22.0, 30.0, sa.x + ( aRnd.y - 0.5 ) * 6.0 );
          float meadow = smoothstep( 1.8, 3.2, sa.x ) * smoothstep( 0.9, 1.6, abs( sa.x - pathC( sa.y ) ) ) * step( aRnd.x, 0.6 );
          s *= mix( meadow * ( 0.32 + aRnd.z * 0.2 ), 1.0, field );
          for ( int i = 0; i < 8; i++ ) {
            vec3 c = uClear[ i ];
            if ( distance( wp, c.xy ) < c.z ) s = 0.0;
          }
          vMeadow = 1.0 - field;
          float a = aRnd.x * 6.2831;
          vec3 p = position;
          p.xz = mat2( cos( a ), -sin( a ), sin( a ), cos( a ) ) * p.xz;
          float bend = uv.y * uv.y;
          float gust = sin( uTime * 0.5 + wp.x * 0.025 + wp.y * 0.01 );
          float w = sin( uTime * 1.9 + wp.x * 0.21 + wp.y * 0.17 + aRnd.z * 6.0 ) * 0.35 + gust * 0.9 + 0.4;
          p.xz += vec2( 0.8, 0.45 ) * w * bend * 0.22;
          p.y -= abs( w ) * bend * 0.06;
          p *= s;
          vec3 transformed = vec3( wp.x + p.x, groundAt( wp, sa.x ) + p.y, wp.y + p.z );
          vTint = ( 0.85 + aRnd.z * 0.25 ) * ( 0.82 + 0.18 * uv.y );`,
        );
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vTint;\nvarying float vMeadow;')
        .replace(
          '#include <map_fragment>',
          `#include <map_fragment>
          diffuseColor.rgb *= vTint;
          diffuseColor.rgb = mix( diffuseColor.rgb, vec3( dot( diffuseColor.rgb, vec3( 0.33 ) ) ) * vec3( 0.42, 0.43, 0.36 ), vMeadow * 0.85 );`,
        )
        .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nnormal = normalize( vNormal );');
    };
    mat.customProgramCacheKey = () => 'l101-grass';
    this.grass = new THREE.Mesh(geo, mat);
    this.grass.frustumCulled = false;
    this.grass.receiveShadow = Q.shadows;
    this.scene.add(this.grass);
  }

  // ------------------------------------------------------------ água
  makeWater() {
    const Q = this.Q;
    this.waterMat = makeWaterMaterial({ ...SKY, fog: this.look.fog, fogDensity: this.fogDensity, hq: !Q.lambert });
    this.waterU = this.waterMat.uniforms;
    this.water = new THREE.Mesh(makeWaterGeometry(), this.waterMat);
    this.water.renderOrder = 1;
    this.scene.add(this.water);
    // reflexo planar de verdade (árvores, píer, barco) só nas qualidades altas
    if (Q.id === 'high' || Q.id === 'ultra') {
      this.mirrorCam = new THREE.PerspectiveCamera();
      this.mirrorRT = new THREE.WebGLRenderTarget(4, 4, { type: this.game.post.type });
      this.waterU.tMirror.value = this.mirrorRT.texture;
      this.waterU.uMirror.value = 1;
      this.clipPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 1e6);
      this.game.renderer.clippingPlanes = [this.clipPlane];
    }
  }

  // Renderiza a cena vista de baixo d'água (câmera espelhada no plano y = 0).
  // O corte do que fica abaixo da superfície usa um plano de recorte global que
  // fica sempre ligado (longe demais para cortar algo no passe normal), para
  // não trocar de programa de shader a cada quadro.
  renderMirror() {
    const r = this.game.renderer;
    const cam = this.game.camera;
    r.getDrawingBufferSize(_size);
    const w = Math.max(4, Math.floor(_size.x * 0.5));
    const h = Math.max(4, Math.floor(_size.y * 0.5));
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
    const autoShadow = r.shadowMap.autoUpdate;
    r.shadowMap.autoUpdate = false;
    // o capim instanciado quase não aparece no reflexo e é a malha mais pesada
    this.water.visible = this.grass.visible = false;
    this.clipPlane.constant = 0.02;
    r.setRenderTarget(this.mirrorRT);
    r.clear();
    r.render(this.scene, mc);
    r.setRenderTarget(old);
    this.clipPlane.constant = 1e6;
    r.shadowMap.autoUpdate = autoShadow;
    this.water.visible = this.grass.visible = true;
  }

  // ------------------------------------------------------------ píer, bancos e placas
  makePier() {
    const wood = new GeoBuilder();
    const misc = new GeoBuilder();
    const rnd = mulberry32(this.seed + 7);
    const rot = this.pierRot;
    const W = (u, v) => this.pierWorld(u, v);
    const grey = (k) => [0.36 * k, 0.35 * k, 0.33 * k];
    // tábuas do deck (algumas faltando, outras tortas)
    const missing = new Set([38, 39, 97, 131]);
    let k = 0;
    for (let u = -0.3; u < PIER_L - 0.1; u += 0.215, k++) {
      if (missing.has(k)) continue;
      const p = W(u + 0.1, (rnd() - 0.5) * 0.04);
      const sh = 0.7 + rnd() * 0.4;
      const n0 = wood.n;
      wood.box(p.x, DECK_Y - 0.03 + (rnd() - 0.5) * 0.012, p.z, PIER_W + (rnd() - 0.5) * 0.1, 0.045, 0.2, grey(sh), null, {
        rot: rot + (rnd() - 0.5) * 0.03,
        ao: 0,
        uvScale: 1.9,
      });
      // cada tábua usa um trecho diferente da textura
      const du = rnd();
      const dv = rnd();
      for (let q = n0; q < wood.n; q++) {
        wood.uv[q * 2] += du;
        wood.uv[q * 2 + 1] += dv;
      }
    }
    // vigas longitudinais
    for (const v of [-0.7, 0, 0.7]) {
      const p = W(PIER_L / 2 - 0.2, v);
      wood.box(p.x, DECK_Y - 0.13, p.z, 0.12, 0.16, PIER_L, grey(0.55), null, { rot, ao: 0, uvScale: 2 });
    }
    // estacas: parte molhada escura até a linha d'água
    const post = (u, v, top) => {
      const p = W(u, v);
      const g = groundH(p.x, p.z);
      const bot = Math.min(g, -0.2) - 0.3;
      if (top < g + 0.05) return;
      const wl = Math.max(0.22, g + 0.05);
      if (wl > bot) wood.cylinder(p.x, (bot + wl) / 2, p.z, 0.12, wl - bot, [0.11, 0.11, 0.1], null, { sides: 7, caps: false });
      wood.cylinder(p.x, (wl + top) / 2, p.z, 0.115, top - wl, grey(0.62), null, { sides: 7 });
      // 5º campo: estaca abaixo do deck (não atrapalha quem anda em cima dele)
      this.staticCol.push([p.x - 0.13, p.x + 0.13, p.z - 0.13, p.z + 0.13, top < DECK_Y]);
    };
    for (let u = 2.2; u < PIER_L; u += 2.8) {
      for (const v of [-0.95, 0.95]) post(u, v, DECK_Y - 0.06);
      // travessa em X abaixo do deck
      const a = W(u, -0.95);
      const b = W(u, 0.95);
      tube(wood, _v.set(a.x, 0.05, a.z), new THREE.Vector3(b.x, DECK_Y - 0.2, b.z), 0.05, 0.05, 4, grey(0.5));
    }
    // postes de amarração no fim e no começo
    for (const v of [-0.95, 0.95]) {
      post(PIER_L - 0.15, v, DECK_Y + 0.75);
      post(0.15, v, DECK_Y + 0.55);
    }
    // corda do poste até a proa do barco
    const pp = W(PIER_L - 0.15, 0.95);
    const bow = W(PIER_L - 2.2 + 1.7, PIER_W / 2 + 0.78);
    const mid = W(PIER_L - 0.6, PIER_W / 2 + 0.5);
    const rope = [0.42, 0.4, 0.34];
    tube(misc, new THREE.Vector3(pp.x, DECK_Y + 0.6, pp.z), new THREE.Vector3(mid.x, 0.28, mid.z), 0.018, 0.018, 4, rope);
    tube(misc, new THREE.Vector3(mid.x, 0.28, mid.z), new THREE.Vector3(bow.x, 0.5, bow.z), 0.018, 0.018, 4, rope);
    // bancos de praça velhos ao longo da trilha
    for (const b of this.benches) {
      const y = groundH(b.x, b.z);
      const f = { x: -Math.sin(b.rot), z: -Math.cos(b.rot) }; // frente (para a água)
      const at = (fw, side) => ({ x: b.x + f.x * fw + Math.cos(b.rot) * side, z: b.z + f.z * fw - Math.sin(b.rot) * side });
      for (const fw of [-0.12, 0.02, 0.16]) {
        const p = at(fw, 0);
        wood.box(p.x, y + 0.45, p.z, 1.7, 0.035, 0.11, grey(0.75 + rnd() * 0.2), null, { rot: b.rot, ao: 0 });
      }
      for (const hy of [0.62, 0.8]) {
        const p = at(-0.24, 0);
        wood.box(p.x, y + hy, p.z, 1.7, 0.11, 0.035, grey(0.7), null, { rot: b.rot - 0.0, ao: 0 });
      }
      for (const sd of [-0.7, 0.7]) {
        const p = at(-0.04, sd);
        misc.box(p.x, y + 0.22, p.z, 0.05, 0.45, 0.5, [0.12, 0.12, 0.11], null, { rot: b.rot });
        const q = at(-0.25, sd);
        misc.box(q.x, y + 0.6, q.z, 0.05, 0.5, 0.05, [0.12, 0.12, 0.11], null, { rot: b.rot, ao: 0 });
      }
      this.staticCol.push(boxAround(b.x, b.z, 1.7, 0.6, b.rot));
    }
    // placa "PROIBIDO NADAR" ao lado do início do píer
    const sg = W(0.6, -PIER_W / 2 - 1.1);
    const sy = groundH(sg.x, sg.z);
    wood.box(sg.x, sy + 0.8, sg.z, 0.09, 1.9, 0.09, grey(0.5), null, { rot });
    wood.box(sg.x - this.pd.x * 0.06, sy + 1.6, sg.z - this.pd.z * 0.06, 1.02, 0.26, 0.03, grey(0.6), null, { rot, ao: 0 });
    this.staticCol.push([sg.x - 0.1, sg.x + 0.1, sg.z - 0.1, sg.z + 0.1]);
    const tex = signTex('PROIBIDO NADAR', '#cfcac0', '#5a1e18', 512, 96);
    this.signMat = this.Q.lambert
      ? new THREE.MeshLambertMaterial({ map: tex })
      : new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 });
    this.signMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.96, 0.18), this.signMat);
    this.signMesh.position.set(sg.x - this.pd.x * 0.08, sy + 1.6, sg.z - this.pd.z * 0.08);
    this.signMesh.rotation.y = rot + Math.PI;
    this.signMesh.matrixAutoUpdate = false;
    this.signMesh.updateMatrix();
    this.scene.add(this.signMesh);
    // boia salva-vidas desbotada pendurada num poste
    const bp = W(0.4, PIER_W / 2 + 1.2);
    const by = groundH(bp.x, bp.z);
    wood.box(bp.x, by + 0.75, bp.z, 0.1, 1.7, 0.1, grey(0.5), null, { rot });
    this.staticCol.push([bp.x - 0.1, bp.x + 0.1, bp.z - 0.1, bp.z + 0.1]);
    for (let q = 0; q < 4; q++) {
      const tg = new THREE.TorusGeometry(0.3, 0.07, 6, 6, Math.PI / 2);
      tg.rotateZ((q * Math.PI) / 2);
      _m.compose(_v.set(bp.x - this.pd.x * 0.1, by + 1.2, bp.z - this.pd.z * 0.1), _q.setFromEuler(_e.set(0, rot, 0)), _s.set(1, 1, 1));
      misc.addGeometry(tg, _m, q % 2 ? [0.55, 0.53, 0.5] : [0.42, 0.16, 0.12]);
      tg.dispose();
    }
    this.pierMesh = this.addStatic(wood.build(), this.woodMat);
    this.pierMisc = this.addStatic(misc.build(), this.miscMat);
  }

  addStatic(geo, mat) {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = m.receiveShadow = this.Q.shadows;
    m.matrixAutoUpdate = false;
    this.scene.add(m);
    return m;
  }

  makeBoat() {
    const gb = new GeoBuilder();
    buildBoat(gb);
    this.boat = new THREE.Mesh(gb.build(), this.boatMat);
    this.boat.castShadow = this.boat.receiveShadow = this.Q.shadows;
    this.boat.rotation.order = 'YXZ';
    this.boatYaw = this.pierRot + 0.07;
    this.boatOff = new THREE.Vector3();
    this.scene.add(this.boat);
  }

  // Formas escuras boiando: troncos e volumes cobertos, imóveis demais.
  makeFloaters() {
    const rnd = mulberry32(this.seed + 31);
    const list = [];
    // algumas perto do píer, visíveis do deck
    for (const [u, v] of [
      [16, 6.5],
      [24, -7.5],
      [30, 9],
    ])
      list.push({ ...this.pierWorld(u, v), type: list.length % 2 });
    while (list.length < 13) {
      const a = rnd() * Math.PI * 2;
      const p = shorePoint(a, -12 - rnd() * 40);
      if (shoreDist(p.x, p.z) > -10) continue;
      const lp = this.pierLocal(p.x, p.z);
      if (lp.u > -3 && lp.u < PIER_L + 4 && Math.abs(lp.v) < 4) continue;
      list.push({ x: p.x, z: p.z, type: rnd() < 0.55 ? 0 : 1 });
    }
    for (const f of list) {
      f.yaw = rnd() * Math.PI * 2;
      f.ph = rnd() * 10;
      f.sc = 0.85 + rnd() * 0.35;
      f.drift = (rnd() - 0.5) * 0.02;
    }
    this.floaters = list;
    // volume coberto: elipsoide irregular achatado
    const bundle = new THREE.SphereGeometry(1, 14, 9);
    const pa = bundle.attributes.position;
    for (let i = 0; i < pa.count; i++) {
      _v.fromBufferAttribute(pa, i);
      const n = 1 + 0.08 * Math.sin(_v.x * 5 + _v.z * 3) + 0.06 * Math.sin(_v.z * 9 + 1.3);
      pa.setXYZ(i, _v.x * 0.4 * n, _v.y * 0.24 * n, _v.z * 0.95 * (1 + 0.05 * Math.sin(_v.x * 7)));
    }
    bundle.computeVertexNormals();
    // tronco caído com pontas quebradas
    const log = new THREE.CylinderGeometry(0.17, 0.21, 2.8, 8, 3);
    log.rotateX(Math.PI / 2);
    const la = log.attributes.position;
    for (let i = 0; i < la.count; i++) {
      _v.fromBufferAttribute(la, i);
      la.setXYZ(i, _v.x * (1 + 0.1 * Math.sin(_v.z * 4)), _v.y, _v.z + (Math.abs(_v.z) > 1.3 ? Math.sin(_v.x * 30) * 0.12 : 0));
    }
    log.computeVertexNormals();
    const mat = this.Q.lambert
      ? new THREE.MeshLambertMaterial({ color: 0x1d1c1a })
      : new THREE.MeshStandardMaterial({ color: 0x1f1e1b, roughness: 0.5 });
    this.floatMat = mat;
    this.floatMeshes = [bundle, log].map((g, t) => {
      const n = list.filter((f) => f.type === t).length;
      const im = new THREE.InstancedMesh(g, mat, Math.max(1, n));
      im.count = n;
      im.frustumCulled = false;
      im.castShadow = this.Q.shadows;
      this.scene.add(im);
      return im;
    });
    this.updateFloaters(0);
  }

  updateFloaters(t) {
    const idx = [0, 0];
    for (const f of this.floaters) {
      const im = this.floatMeshes[f.type];
      const y = -0.07 + Math.sin(t * 0.6 + f.ph) * 0.025;
      _q.setFromEuler(_e.set(Math.sin(t * 0.5 + f.ph) * 0.03, f.yaw + t * f.drift, Math.sin(t * 0.43 + f.ph * 2) * 0.04, 'YXZ'));
      _m.compose(_v.set(f.x, y, f.z), _q, _s.set(f.sc, f.sc, f.sc));
      im.setMatrixAt(idx[f.type]++, _m);
    }
    for (const im of this.floatMeshes) im.instanceMatrix.needsUpdate = true;
  }

  updateBoat(t, dt) {
    const b = this.boatPos;
    if (this.boarding) {
      // a corda se solta e o barco se afasta devagar
      this.boatOff.x += this.pl.x * dt * 0.35;
      this.boatOff.z += this.pl.z * dt * 0.35;
    }
    this.boat.position.set(b.x + this.boatOff.x, Math.sin(t * 0.8) * 0.025 - 0.02, b.z + this.boatOff.z);
    this.boat.rotation.set(Math.sin(t * 0.7 + 1) * 0.015, this.boatYaw + Math.sin(t * 0.23) * 0.03, Math.sin(t * 0.9) * 0.03);
  }

  // ------------------------------------------------------------ blocos
  *genChunk(ch) {
    const { i, j, x0, z0 } = ch;
    const P = this.P;
    const Q = this.Q;
    const cs = shoreDist(x0 + P / 2, z0 + P / 2);
    const bark = new GeoBuilder();
    const reeds = new GeoBuilder();
    const stones = new GeoBuilder();
    const rnd = mulberry32((hash3(i, j, this.seed) * 4294967296) >>> 0);
    const maxDepth = Q.props < 0.8 ? 3 : 4;
    const sp = this.spawn;
    const nearPier = (x, z, pad) => {
      const l = this.pierLocal(x, z);
      return l.u > -pad - 2 && l.u < PIER_L + pad && Math.abs(l.v) < PIER_W / 2 + pad;
    };
    const busy = (x, z, r) => {
      if (Math.hypot(x - sp.x, z - sp.z) < r + 2) return true;
      for (const b of this.benches) if (Math.hypot(x - b.x, z - b.z) < r + 1.5) return true;
      return false;
    };
    // árvores secas: concentradas em faixas junto da margem
    const step = 6;
    for (let gz = z0; gz < z0 + P; gz += step) {
      for (let gx = x0; gx < x0 + P; gx += step) {
        const x = gx + rnd() * step;
        const z = gz + rnd() * step;
        const s = shoreDist(x, z);
        const a = lakeAngle(x, z);
        const band = treeBand(a);
        const pc = pathC(a);
        let pr = 0;
        if (s < -3.2) pr = 0;
        else if (s < 0.4) pr = 0.06 * band;
        else if (s < 2.8) pr = 0.2 * band;
        else if (Math.abs(s - pc) < 2.3) pr = 0;
        else if (s < 24) pr = 0.32 * (0.25 + band);
        else if (s < 60) pr = 0.025;
        else pr = 0.006;
        pr *= 0.75 + 0.25 * Q.props;
        if (rnd() > pr) continue;
        if (nearPier(x, z, 3.5) || busy(x, z, 3)) continue;
        const y = groundH(x, z);
        // árvores da beira se inclinam sobre a água
        let lx = (rnd() - 0.5) * 0.12;
        let lz = (rnd() - 0.5) * 0.12;
        if (s < 3) {
          const k = 0.12 + rnd() * 0.3;
          lx += (-x / Math.hypot(x, z)) * k;
          lz += (-z / Math.hypot(x, z)) * k;
        }
        const H = 6 + rnd() * 5.5;
        const r0 = deadTree(bark, rnd, x, y, z, H, [lx, lz], { maxDepth, snag: rnd() < 0.16, wet: s < 0.4 ? 1 : 0 });
        ch.colliders.push([x - r0 - 0.05, x + r0 + 0.05, z - r0 - 0.05, z + r0 + 0.05]);
      }
    }
    yield;
    if (Math.abs(cs) < 60) {
      // juncos em touceiras na beira da água
      const rs = 0.85;
      for (let gz = z0; gz < z0 + P; gz += rs) {
        for (let gx = x0; gx < x0 + P; gx += rs) {
          const x = gx + rnd() * rs;
          const z = gz + rnd() * rs;
          const s = shoreDist(x, z);
          if (s < -3.6 || s > 2.2) continue;
          const clump = vnoise(x * 0.09, z * 0.09, 17);
          const edge = 1 - Math.abs(s + 0.7) / 3;
          if (rnd() > clamp((clump + 0.2) * 1.5, 0, 1) * edge * (0.55 + 0.45 * Q.props)) continue;
          if (nearPier(x, z, 1.6) || busy(x, z, 2.5)) continue;
          const y = Math.min(groundH(x, z), 0.15) - 0.05;
          const h = 1.1 + rnd() * 1.1 + clamp(-s, 0, 2) * 0.15;
          const w = 0.8 + rnd() * 0.6;
          const a0 = rnd() * Math.PI;
          const sh = 0.75 + rnd() * 0.4;
          const top = [1.0 * sh, 0.97 * sh, 0.85 * sh];
          const bot = [0.42, 0.41, 0.36];
          for (let q = 0; q < 2; q++) {
            const a = a0 + q * 1.57;
            const dx = (Math.cos(a) * w) / 2;
            const dz = (Math.sin(a) * w) / 2;
            reeds.quad(
              [
                [x - dx, y, z - dz],
                [x + dx, y, z + dz],
                [x + dx, y + h, z + dz],
                [x - dx, y + h, z - dz],
              ],
              [0, 1, 0],
              [0, 0, 1, 0, 1, 1, 0, 1],
              null,
              [bot, bot, top, top],
            );
          }
        }
      }
      yield;
      // pedras meio enterradas e galhos trazidos pela água na lama
      const n = Math.round(14 * Q.props);
      for (let k = 0; k < n * 3 && k < 60; k++) {
        const x = x0 + rnd() * P;
        const z = z0 + rnd() * P;
        const s = shoreDist(x, z);
        if (s < -1.5 || s > 3.2 || nearPier(x, z, 1) || busy(x, z, 1)) continue;
        const y = groundH(x, z);
        if (rnd() < 0.55) {
          const g = new THREE.IcosahedronGeometry(0.25 + rnd() * 0.35, 0);
          const sc = 0.5 + rnd() * 0.25;
          _m.compose(_v.set(x, y - 0.06, z), _q.setFromEuler(_e.set(rnd(), rnd() * 6, rnd())), _s.set(1, sc, 0.8 + rnd() * 0.4));
          const c = 0.3 + rnd() * 0.12;
          stones.addGeometry(g, _m, [c, c * 0.98, c * 0.94]);
          g.dispose();
        } else {
          const a = rnd() * Math.PI;
          const l = 1.2 + rnd() * 2.2;
          const ax = Math.cos(a) * l * 0.5;
          const az = Math.sin(a) * l * 0.5;
          const r = 0.05 + rnd() * 0.07;
          tube(
            bark,
            _v.set(x - ax, groundH(x - ax, z - az) + r * 0.5, z - az),
            new THREE.Vector3(x + ax, groundH(x + ax, z + az) + r * 0.6, z + az),
            r,
            r * 0.7,
            5,
            [0.3, 0.29, 0.27],
          );
        }
      }
    }
    // bilhetes nos bancos e no começo do píer; Água de Amêndoa perto da trilha
    const inChunk = (x, z) => x >= x0 && x < x0 + P && z >= z0 && z < z0 + P;
    this.benches.forEach((b, k) => {
      if (inChunk(b.x, b.z))
        ch.items.push({ type: 'note', key: `l101n${k}`, x: b.x, z: b.z, y: groundH(b.x, b.z) + 0.47, rot: b.rot + 0.4 });
    });
    const pn = this.pierWorld(1.4, -0.35);
    if (inChunk(pn.x, pn.z)) ch.items.push({ type: 'note', key: 'l101n3', x: pn.x, z: pn.z, y: DECK_Y, rot: this.pierRot + 2.1 });
    for (const [k, a] of [
      [0, 2.25],
      [1, 1.35],
    ]) {
      const w = shorePoint(a, pathC(a) + 1.4);
      if (inChunk(w.x, w.z)) ch.items.push({ type: 'water', key: `l101w${k}`, x: w.x, z: w.z, y: groundH(w.x, w.z) });
    }
    yield;
    if (!bark.empty) this.addMesh(ch, bark.build(), this.barkMat);
    if (!reeds.empty) this.addMesh(ch, reeds.build(), this.reedMat, { cast: false });
    if (!stones.empty) this.addMesh(ch, stones.build(), this.miscMat);
  }

  // ------------------------------------------------------------ física e regras
  groundY(x, z) {
    if (this.boarding) return this.boarding.y;
    const g = groundH(x, z);
    const l = this.pierLocal(x, z);
    if (this.onDeck(l.u, l.v)) return Math.max(g, DECK_Y);
    return g;
  }

  surfaceAt(x, z) {
    const l = this.pierLocal(x, z);
    if (this.onDeck(l.u, l.v)) return 'wood';
    const s = shoreDist(x, z);
    if (s < 2.4) return 'mud';
    if (Math.abs(s - pathC(lakeAngle(x, z))) < 1.0) return 'dirt';
    return 'grass';
  }

  collide(p, r) {
    super.collide(p, r);
    if (this.boarding) return p;
    const wasDeck = this.wasOnDeck;
    for (const b of this.staticCol) {
      // as estacas abaixo do deck não atrapalham quem anda em cima dele
      if (wasDeck && b[4]) continue;
      if (Math.abs((b[0] + b[1]) / 2 - p.x) < 4 && Math.abs((b[2] + b[3]) / 2 - p.z) < 4) pushCircle(p, r, b[0], b[1], b[2], b[3]);
    }
    let l = this.pierLocal(p.x, p.z);
    // a borda do deck é alta demais para subir de dentro d'água ou da lama:
    // só se sobe no píer pelo começo, onde ele quase encosta na trilha
    if (!wasDeck && this.onDeck(l.u, l.v) && DECK_Y - groundH(p.x, p.z) > 0.45) {
      const w = this.pierWorld(l.u, (l.v < 0 ? -1 : 1) * (PIER_W / 2 + 0.06));
      p.x = w.x;
      p.z = w.z;
      l = this.pierLocal(p.x, p.z);
    }
    const s = shoreDist(p.x, p.z);
    this.wasOnDeck = this.onDeck(l.u, l.v);
    // em cima do deck sempre é válido; saindo dele sobre o fundo, volta para o deck
    if (s >= DEEP || this.wasOnDeck) return p;
    let moved = 0;
    if (wasDeck && l.u > -1 && l.u < PIER_L + 2 && Math.abs(l.v) < PIER_W / 2 + 2) {
      // sobre a água funda só dá para ficar em cima do deck
      const v = clamp(l.v, -PIER_W / 2 + 0.12, PIER_W / 2 - 0.12);
      const u = Math.min(l.u, PIER_L - 0.2);
      const w = this.pierWorld(u, v);
      moved = Math.hypot(w.x - p.x, w.z - p.z);
      p.x = w.x;
      p.z = w.z;
      this.wasOnDeck = true;
    } else {
      // empurra de volta para o raso pelo gradiente da distância à margem
      for (let k = 0; k < 2; k++) {
        const sk = shoreDist(p.x, p.z);
        if (sk >= DEEP) break;
        const e = 0.3;
        const gx = (shoreDist(p.x + e, p.z) - shoreDist(p.x - e, p.z)) / (2 * e);
        const gz = (shoreDist(p.x, p.z + e) - shoreDist(p.x, p.z - e)) / (2 * e);
        const gl = Math.hypot(gx, gz) || 1;
        const d = (DEEP - sk + 0.01) / gl;
        p.x += (gx / gl) * d;
        p.z += (gz / gl) * d;
        moved += d;
      }
    }
    if (moved > 0.002 && this.warnT <= 0) {
      this.warnT = 6;
      this.game.hud.message('A água é funda e gelada demais.', 3);
    }
    return p;
  }

  // Água rasa: lento, frio e sanidade escorrendo; roupas molhadas demoram a secar.
  updateHazard(dt, p) {
    this.warnT -= dt;
    const l = this.pierLocal(p.x, p.z);
    const deck = this.onDeck(l.u, l.v);
    const depth = deck || this.boarding ? 0 : Math.max(0, -groundH(p.x, p.z));
    const k = clamp(depth / 0.55, 0, 1);
    this.walkSpeed = damp(this.walkSpeed, this.baseWalk * (1 - 0.6 * Math.sqrt(k)), 6, dt);
    if (k > 0.02) this.cold = Math.min(1, this.cold + dt * (0.03 + 0.07 * k));
    else this.cold = Math.max(0, this.cold - dt * 0.012);
    this.sanityExtra = (k > 0.02 ? 0.6 + 2.2 * k : 0) + this.cold * 0.5;
    if (k > 0.05 && !this.toldWater) {
      this.toldWater = true;
      this.game.hud.message('A água está gelada. A lama do fundo prende os pés.', 4);
      this.game.audio.play('drip', { gain: 0.25, rate: 0.45 });
    }
    if (k < 0.02 && this.cold > 0.45 && !this.toldCold) {
      this.toldCold = true;
      this.game.hud.message('As roupas encharcadas pesam. O frio não vai embora.', 4);
    }
    // perto do fundo: o coração acelera
    const s = shoreDist(p.x, p.z);
    if (!deck && s < -2.5) this.game.st.fear = Math.max(this.game.st.fear, clamp((-s - 2.5) / 2.5, 0, 1) * 0.6);
  }

  update(dt, player) {
    const p = player.pos;
    this.time += dt;
    const t = this.time;
    this.updateChunks(p.x, p.z);
    const cam = this.game.camera.position;
    this.sky.position.copy(cam);
    this.sky.material.uniforms.uTime.value += dt;
    this.grassU.uCam.value.copy(cam);
    this.grassU.uTime.value = t;
    this.reedU.uTime.value = t;
    this.waterU.uTime.value = t;
    const st = this.groundStep;
    this.ground.position.set(Math.round(cam.x / st) * st, 0, Math.round(cam.z / st) * st);
    this.updateSun(p);
    this.updateFloaters(t);
    this.updateBoat(t, dt);
    this.updateHazard(dt, p);
    if (this.mirrorRT) this.renderMirror();
    if (this.boarding) {
      // desce do píer para o banco do barco
      const b = this.boarding;
      b.t = Math.min(1, b.t + dt / 1.3);
      const e = b.t * b.t * (3 - 2 * b.t);
      const tx = this.boat.position.x;
      const tz = this.boat.position.z;
      p.x = b.x0 + (tx - b.x0) * e;
      p.z = b.z0 + (tz - b.z0) * e;
      b.y = DECK_Y + (0.05 - DECK_Y) * e + Math.sin(e * Math.PI) * 0.12;
    } else if (!this.game.objectiveDone('pier') && Math.hypot(p.x - this.pierStart.x, p.z - this.pierStart.z) < 4) {
      this.game.completeObjective('pier', 'O píer. Há um barco amarrado lá no fim.');
    }
  }

  board() {
    if (this.boarding) return;
    const g = this.game;
    const p = g.player.pos;
    g.completeObjective('pier');
    g.completeObjective('boat', 'Você desce para o barco. A corda se solta sozinha.');
    g.audio.play('creak', { gain: 0.9, rate: 0.75 });
    g.audio.play('drip', { gain: 0.3, rate: 0.4 });
    this.boarding = { t: 0, x0: p.x, z0: p.z, y: DECK_Y };
    g.reachExit('boat', 2.4);
  }

  interactable(player) {
    if (this.boarding) return null;
    const l = this.pierLocal(player.pos.x, player.pos.z);
    if (l.u > PIER_L - 4.5 && l.u < PIER_L + 0.5 && Math.abs(l.v) < PIER_W / 2 + 0.3) {
      return { label: 'Entrar no barco', action: () => this.board() };
    }
    return null;
  }

  navTarget() {
    return this.game.objectiveDone('pier') ? this.boatPos : this.pierStart;
  }

  exitEmitter() {
    return { x: this.boatPos.x, y: 0.5, z: this.boatPos.z, sound: 'creak' };
  }

  onCollapse() {
    this.boarding = null;
    this.cold = 0;
    this.walkSpeed = this.baseWalk;
  }

  dispose() {
    super.dispose();
    for (const m of [this.ground, this.grass, this.water, this.pierMesh, this.pierMisc, this.boat, this.signMesh, ...this.floatMeshes]) {
      m.geometry.dispose();
    }
    for (const m of [this.waterMat, this.signMat, this.floatMat, this.woodMat, this.boatMat, this.barkMat, this.miscMat, this.reedMat])
      m.dispose();
    this.signMat.map.dispose();
    for (const im of this.floatMeshes) im.dispose();
    this.grass.material.dispose();
    this.ground.material.dispose();
    if (this.mirrorRT) {
      this.mirrorRT.dispose();
      this.game.renderer.clippingPlanes = [];
    }
    this.sky.geometry.dispose();
    this.sky.material.dispose();
  }
}

// AABB que envolve um retângulo girado em Y.
function boxAround(x, z, sx, sz, rot) {
  const c = Math.abs(Math.cos(rot));
  const s = Math.abs(Math.sin(rot));
  const hx = (sx * c + sz * s) / 2;
  const hz = (sx * s + sz * c) / 2;
  return [x - hx, x + hx, z - hz, z + hz];
}
