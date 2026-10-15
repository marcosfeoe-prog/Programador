// Nível 23 — "O Jardim Petrificado": um superorganismo do tamanho de um
// planetoide feito de árvores colossais petrificadas e entrelaçadas. Troncos
// trançados somem na neblina verde-acinzentada, raízes formam arcos e paredes,
// galhos viram pontes lá no alto e feixes de luz descem da copa. Musgo,
// samambaias, fungos que brilham fraco e uma gravidade estranha: o corpo
// demora a assentar e os esporos sobem devagar em vez de cair.
// Sem entidades. Objetivo: a Base Seedling, um abrigo dentro de um tronco oco.
import * as THREE from 'three';
import { OutdoorLevel, SKY_GLSL } from './outdoor.js';
import { GeoBuilder } from '../materials.js';
import { getTex } from '../textures.js';
import { hash3, mulberry32, damp } from '../util.js';
import './level23_tex.js';
import { World, WORLD_GLSL, TAU, RO, makeRocks, buildColossus, buildTree, buildLog, rock, fungi, beam, sweep } from './level23_world.js';
import { SeedlingBase } from './level23_base.js';

const P = 96; // lado do bloco (2×2 células de troncos colossais)
const SUN = new THREE.Vector3(0.32, 0.88, 0.28).normalize();
const NCLEAR = 12; // círculos sem vegetação (troncos próximos) enviados ao shader

export class Level23 extends OutdoorLevel {
  constructor(game) {
    super(game, { P, walkSpeed: 2.15 });
    this.num = 23;
    this.seed = (game.seed ^ 0x2323) >>> 0;
    const Q = this.Q;
    this.look = {
      exposure: 0.98,
      tint: [0.98, 1.0, 0.95],
      sat: 0.78,
      contrast: 1.08,
      lift: [0.018, 0.022, 0.017],
      bloom: 0.2,
      bloomThreshold: 1.35,
      fog: [0.34, 0.38, 0.32],
      lightColor: [1, 1, 1],
      flashlight: false,
      ambience: 'level23',
      reverb: 0.9,
      sanityDrain: 0.08,
    };
    this.objectives = [{ id: 'seedling', text: 'Chegue à Base Seedling' }];
    this.world = new World(this.seed);
    const W = this.world;
    // chegada: olhando ao longo do começo da trilha
    const t0 = W.trailPoint(0.05);
    this.spawn = { x: W.sx, z: W.sz, yaw: Math.atan2(-(t0.x - W.sx), -(t0.z - W.sz)) };
    this.exit = { x: W.ex, z: W.ez };
    this.time = 0;
    this.timeU = { value: 0 };
    this.sides =
      Q.id === 'low' ? { big: 10, mid: 7, small: 4 } : Q.id === 'medium' ? { big: 13, mid: 8, small: 5 } : { big: 16, mid: 10, small: 6 };

    const fogC = new THREE.Color(...this.look.fog);
    this.fogDensity = Math.max(1.6 / Q.outdoorView, 0.0095);
    this.scene.fog = new THREE.FogExp2(fogC, this.fogDensity);
    this.scene.background = fogC;
    this.setupLights({
      sky: 0xb9c6aa,
      ground: 0x4a4b36,
      hemi: 2.3,
      sunColor: 0xf3ebd0,
      sun: 1.35,
      sunDir: SUN,
      shadowExtent: 55,
      shadowFar: 500,
    });
    this.shadowDist = 260;
    this.clearU = { value: Array.from({ length: NCLEAR }, () => new THREE.Vector3(1e6, 1e6, 0)) };
    this.makeSky();
    this.makeMaterials();
    this.makeGround();
    this.makeVegetation();
    this.makeSpores();
    this.rocks = makeRocks();
    this.base = new SeedlingBase(this);
    // um bilhete esquecido sobre o caixote dentro do abrigo
    const nb = this.base.P(2.2, -2.0, 0.14 + 1.035);
    this.game.items.spawn({ type: 'note', key: 'l23n9', x: nb[0], z: nb[2], y: nb[1], rot: 0.6, light: 1.1 }, this.dynamic);
  }

  // ------------------------------------------------------------ céu e copa
  // Céu enevoado visto através da copa colossal: silhuetas de galhos e folhagem
  // projetadas num plano bem alto (com paralaxe) e brechas de luz difusa.
  makeSky() {
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uFog: { value: new THREE.Color(...this.look.fog) },
        uZenith: { value: new THREE.Color(0.62, 0.67, 0.57) },
        uCanopy: { value: new THREE.Color(0.15, 0.17, 0.13) },
        uGap: { value: new THREE.Color(0.86, 0.9, 0.76) },
        uSun: { value: SUN.clone() },
        uCam: { value: new THREE.Vector3() },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = position;
          vec4 p = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
          gl_Position = p.xyww;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uFog, uZenith, uCanopy, uGap, uSun, uCam;
        varying vec3 vDir;
        ${SKY_GLSL}
        void main() {
          vec3 d = normalize( vDir );
          float h = d.y;
          vec3 col = mix( uFog, uZenith, smoothstep( 0.0, 0.9, h ) );
          if ( h > 0.0 ) {
            vec2 cp = ( uCam.xz + d.xz / max( h, 0.06 ) * 170.0 ) * 0.011;
            float n = sFbm( cp );
            float br = 1.0 - abs( sNoise( cp * 3.1 + 5.0 ) * 2.0 - 1.0 );
            float br2 = 1.0 - abs( sNoise( cp * 7.3 - 2.0 ) * 2.0 - 1.0 );
            float leaves = smoothstep( 0.4, 0.62, n );
            float branch = max( smoothstep( 0.88, 0.97, br ), smoothstep( 0.9, 0.98, br2 ) * 0.85 );
            float cover = clamp( max( leaves, branch ), 0.0, 1.0 );
            float sd = max( dot( d, uSun ), 0.0 );
            vec3 gap = uGap * ( 1.0 + pow( sd, 10.0 ) * 1.2 );
            vec3 can = uCanopy * ( 0.7 + sFbm( cp * 4.0 ) * 0.6 );
            float haze = mix( 0.97, 0.14, smoothstep( 0.08, 0.85, h ) );
            col = mix( mix( gap, can, cover ), col, haze );
          }
          gl_FragColor = vec4( col, 1.0 );
        }`,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1000, 32, 16), mat);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
    this.scene.add(this.sky);
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
            roughness: o.roughness ?? 0.92,
            side: o.side || THREE.FrontSide,
          });
    const bk = getTex('l23Bark', S);
    const moss = getTex('l23Moss', S);
    // pedra-madeira: musgo nas faces de cima e no pé, fungos que brilham (grupo -1),
    // pedras que flutuam (grupo ≥ 10) e objetos sem musgo (grupo 2)
    this.barkMat = std({ map: bk.map, normalMap: bk.normalMap, roughness: 0.94 });
    this.barkMat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.world.uniforms, { uMoss: { value: moss.map }, uTime: this.timeU });
      sh.vertexShader = sh.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
          attribute float aGroup;
          uniform float uTime;
          varying vec3 vWPos;
          varying vec3 vWNor;
          varying float vGlow;
          varying float vNoMoss;`,
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          vGlow = aGroup < -0.5 ? 1.0 : 0.0;
          vNoMoss = ( aGroup > 1.5 && aGroup < 2.5 ) ? 1.0 : 0.0;
          if ( aGroup > 9.5 ) transformed.y += sin( uTime * 0.7 + aGroup ) * 0.2 + sin( uTime * 0.29 + aGroup * 2.3 ) * 0.12;
          vWNor = normalize( mat3( modelMatrix ) * objectNormal );
          vWPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;`,
        );
      sh.fragmentShader = sh.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          uniform sampler2D uMoss;
          varying vec3 vWPos;
          varying vec3 vWNor;
          varying float vGlow;
          varying float vNoMoss;
          ${WORLD_GLSL}`,
        )
        .replace(
          '#include <map_fragment>',
          `#include <map_fragment>
          float mn = texture2D( map, vMapUv * 0.29 + 0.17 ).g;
          float up = smoothstep( 0.5, 0.95, vWNor.y + ( mn - 0.4 ) * 0.6 );
          float foot = 1.0 - smoothstep( 0.1, 1.7, vWPos.y - terrainH( vWPos.xz ) + ( mn - 0.4 ) * 2.0 );
          float moss = max( up * 0.85, foot * 0.8 ) * ( 1.0 - vGlow ) * ( 1.0 - vNoMoss );
          vec3 mc = texture2D( uMoss, vWPos.xz * 0.4 + vec2( vWPos.y * 0.31 ) ).rgb * vec3( 1.45, 1.5, 1.25 );
          diffuseColor.rgb = mix( diffuseColor.rgb, mc, moss );`,
        )
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
          totalEmissiveRadiance += vColor * vGlow * 1.7;`,
        );
    };
    this.barkMat.customProgramCacheKey = () => 'l23-bark';
    const pl = getTex('planks', S);
    this.woodMat = std({ map: pl.map, normalMap: pl.normalMap, roughness: 0.85 });
    // musgo pendente: balança devagar
    this.drapeMat = new THREE.MeshLambertMaterial({
      map: getTex('l23Drape', Math.min(512, S * 2)).map,
      alphaTest: 0.42,
      side: THREE.DoubleSide,
      vertexColors: true,
    });
    this.drapeMat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = this.timeU;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;').replace(
        '#include <begin_vertex>',
        `vec3 transformed = position;
          float hang = ( 1.0 - uv.y ) * ( 1.0 - uv.y );
          transformed.x += sin( uTime * 0.55 + position.y * 0.4 + position.z * 0.3 ) * 0.22 * hang;
          transformed.z += sin( uTime * 0.41 + position.x * 0.3 ) * 0.18 * hang;`,
      );
      sh.fragmentShader = sh.fragmentShader.replace(
        '#include <normal_fragment_begin>',
        '#include <normal_fragment_begin>\nnormal = normalize( vNormal );',
      );
    };
    this.drapeMat.customProgramCacheKey = () => 'l23-drape';
    // feixes de luz e poças: aditivos, somem na neblina e de perto
    this.beamMat = new THREE.ShaderMaterial({
      uniforms: { uTime: this.timeU, uFogD: { value: this.fogDensity }, uTint: { value: new THREE.Color(0.9, 0.93, 0.72) } },
      vertexColors: true,
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        varying vec3 vC;
        varying vec3 vW;
        varying float vEdge;
        void main() {
          vUv = uv;
          vC = color;
          vec4 wp = modelMatrix * vec4( position, 1.0 );
          vW = wp.xyz;
          vec3 V = normalize( cameraPosition - wp.xyz );
          vec3 N = normalize( mat3( modelMatrix ) * normal );
          vEdge = color.g > 0.5 ? 1.0 : smoothstep( 0.1, 0.55, abs( dot( N, V ) ) );
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform float uFogD;
        uniform vec3 uTint;
        varying vec2 vUv;
        varying vec3 vC;
        varying vec3 vW;
        varying float vEdge;
        void main() {
          float a;
          if ( vC.g > 0.5 ) {
            float r = length( vUv - 0.5 ) * 2.0;
            a = 1.0 - smoothstep( 0.0, 1.0, r );
            a *= a;
          } else {
            float across = sin( vUv.x * 3.14159 );
            a = across * across * smoothstep( 0.0, 0.05, vUv.y ) * ( 1.0 - smoothstep( 0.45, 1.0, vUv.y ) );
            a *= 0.72 + 0.28 * sin( vUv.y * 37.0 - uTime * 0.45 + vUv.x * 3.0 );
          }
          float d = distance( cameraPosition, vW );
          float f = exp( -uFogD * uFogD * d * d * 0.55 ) * smoothstep( 1.5, 7.0, d );
          gl_FragColor = vec4( uTint * vC.r * a * vEdge * f, 1.0 );
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
  }

  // ------------------------------------------------------------ chão
  makeGround() {
    const Q = this.Q;
    const size = Q.outdoorView * 2 + 40;
    const seg = Math.min(300, Math.ceil(size / (Q.id === 'low' ? 2.6 : 1.8)));
    this.groundStep = size / seg;
    const g = new THREE.PlaneGeometry(size, size, seg, seg);
    g.rotateX(-Math.PI / 2);
    const moss = getTex('l23Moss', Q.tex);
    const soil = getTex('soil', Q.tex);
    const mat = Q.lambert
      ? new THREE.MeshLambertMaterial({ map: moss.map })
      : new THREE.MeshStandardMaterial({ map: moss.map, normalMap: Q.normalMaps ? moss.normalMap : null, roughness: 1 });
    const uniforms = { ...this.world.uniforms, uSoil: { value: soil.map }, uClear: this.clearU, uVegR: { value: Q.wheatRadius } };
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, uniforms);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\n' + WORLD_GLSL)
        .replace(
          '#include <beginnormal_vertex>',
          `vec2 gxz = ( modelMatrix * vec4( position, 1.0 ) ).xz;
          float e = 0.6;
          float hx = terrainH( gxz + vec2( e, 0.0 ) ) - terrainH( gxz - vec2( e, 0.0 ) );
          float hz = terrainH( gxz + vec2( 0.0, e ) ) - terrainH( gxz - vec2( 0.0, e ) );
          vec3 objectNormal = normalize( vec3( -hx / ( 2.0 * e ), 1.0, -hz / ( 2.0 * e ) ) );`,
        )
        .replace('#include <begin_vertex>', 'vec3 transformed = vec3( position.x, terrainH( gxz ), position.z );')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;');
      sh.fragmentShader = sh.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          varying vec3 vWPos;
          uniform sampler2D uSoil;
          uniform float uVegR;
          uniform vec3 uClear[ ${NCLEAR} ];
          ${WORLD_GLSL}`,
        )
        .replace(
          '#include <map_fragment>',
          `vec2 w = vWPos.xz;
          vec3 m1 = texture2D( map, w * 0.2 ).rgb;
          vec3 m2 = texture2D( map, w * 0.051 + 0.3 ).rgb;
          vec3 so = texture2D( uSoil, w * 0.28 ).rgb * vec3( 0.66, 0.66, 0.52 );
          float n1 = vNoise( w * 0.09 );
          float n2 = vNoise( w * 0.021 + 7.0 );
          vec3 col = mix( m1 * 1.05, m2 * 0.92, 0.4 );
          // manchas de terra e folhas secas entre o musgo
          col = mix( col, so, smoothstep( 0.62, 0.85, n1 * 0.7 + n2 * 0.5 ) * 0.8 );
          // ao longe o chão assume a cor das samambaias (a vegetação instanciada acaba no raio)
          float pn = vNoise( w * 0.06 ) * 0.65 + vNoise( w * 0.21 + 3.0 ) * 0.35;
          float vegFar = smoothstep( uVegR * 0.55, uVegR * 0.9, distance( w, cameraPosition.xz ) );
          vec3 farC = vec3( 0.12, 0.16, 0.075 ) * ( 0.75 + n1 * 0.5 );
          col = mix( col, farC, vegFar * smoothstep( 0.2, 0.5, pn ) * 0.85 );
          // trilha pisada
          float td = trailD( w ) + ( n1 - 0.5 ) * 0.9;
          col = mix( col, so * 0.95 + vec3( 0.015, 0.012, 0.0 ), ( 1.0 - smoothstep( 0.55, 1.45, td ) ) * 0.9 );
          // úmido e escuro junto dos troncos
          float ao = 1.0;
          for ( int i = 0; i < ${NCLEAR}; i++ ) {
            vec3 c = uClear[ i ];
            ao *= mix( 0.5, 1.0, smoothstep( -0.3, 6.0, distance( w, c.xy ) - c.z ) );
          }
          diffuseColor.rgb *= col * ao;`,
        );
    };
    mat.customProgramCacheKey = () => 'l23-ground';
    this.groundMat = mat;
    this.ground = new THREE.Mesh(g, mat);
    this.ground.receiveShadow = Q.shadows;
    this.ground.frustumCulled = false;
    this.scene.add(this.ground);
  }

  // ------------------------------------------------------------ vegetação
  // Samambaias e capim instanciados numa grade fixa que "dá a volta" ao redor
  // da câmera no shader (técnica do trigo do Nível 10). Cada instância é
  // samambaia ou capim; manchas de densidade por ruído; nada na trilha.
  makeVegetation() {
    const Q = this.Q;
    const R = Q.wheatRadius;
    // no máximo ~150×150 instâncias (samambaias são maiores que o trigo)
    const N = Math.min(150, Math.round((2 * R) / (Q.wheatSpacing * 1.15)));
    const sp = (2 * R) / N;
    const pos = [];
    const uv = [];
    const part = [];
    const idx = [];
    // samambaia: 5 frondes arqueadas, 3 segmentos cada
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * TAU + (k % 2) * 0.3;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const b = pos.length / 3;
      for (let r = 0; r <= 3; r++) {
        const t = r / 3;
        const L = 0.85;
        const d = L * t * 0.85;
        const y = L * (1.25 * t - 0.95 * t * t) + 0.02;
        const w = 0.2;
        pos.push(ca * d - sa * w, y, sa * d + ca * w, ca * d + sa * w, y, sa * d - ca * w);
        uv.push(0, t * 0.97, 0.5, t * 0.97);
        part.push(0, 0);
      }
      for (let r = 0; r < 3; r++) {
        const o = b + r * 2;
        idx.push(o, o + 1, o + 3, o, o + 3, o + 2);
      }
    }
    // capim: 3 planos cruzados
    for (let k = 0; k < 3; k++) {
      const a = (k * Math.PI) / 3;
      const cx = Math.cos(a) * 0.26;
      const cz = Math.sin(a) * 0.26;
      const b = pos.length / 3;
      for (let r = 0; r <= 1; r++) {
        const y = r * 0.6;
        pos.push(-cx, y, -cz, cx, y, cz);
        uv.push(0.5, r, 1, r);
        part.push(1, 1);
      }
      idx.push(b, b + 1, b + 3, b, b + 3, b + 2);
    }
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setAttribute(
      'normal',
      new THREE.Float32BufferAttribute(
        new Array(pos.length).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)),
        3,
      ),
    );
    geo.setAttribute('aPart', new THREE.Float32BufferAttribute(part, 1));
    geo.setIndex(idx);
    const off = new Float32Array(N * N * 2);
    const rnd = new Float32Array(N * N * 3);
    const rr = mulberry32(this.seed + 99);
    let n = 0;
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        off[n * 2] = (i + 0.1 + rr() * 0.8) * sp - R;
        off[n * 2 + 1] = (j + 0.1 + rr() * 0.8) * sp - R;
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
      map: getTex('l23Plants', Math.min(256, Q.tex)).map,
      alphaTest: 0.45,
      side: THREE.DoubleSide,
      alphaToCoverage: Q.msaa > 0,
    });
    this.vegU = { uCam: { value: new THREE.Vector3() }, uR: { value: R } };
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.world.uniforms, this.vegU, { uTime: this.timeU, uClear: this.clearU });
      sh.vertexShader = sh.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
          attribute vec2 aOff;
          attribute vec3 aRnd;
          attribute float aPart;
          uniform vec3 uCam;
          uniform float uR;
          uniform float uTime;
          uniform vec3 uClear[ ${NCLEAR} ];
          varying vec3 vTint;
          ${WORLD_GLSL}`,
        )
        .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3( 0.0, 1.0, 0.0 );')
        .replace(
          '#include <begin_vertex>',
          `vec2 cc = uCam.xz;
          vec2 wp = cc + mod( aOff - cc + uR, 2.0 * uR ) - uR;
          float dd = length( wp - cc );
          float s = ( 1.0 - smoothstep( uR * 0.78, uR, dd ) );
          float pn = vNoise( wp * 0.06 ) * 0.65 + vNoise( wp * 0.21 + 3.0 ) * 0.35;
          float fern = step( aRnd.z, 0.4 + pn * 0.5 );
          if ( aPart < 0.5 ) s *= fern * smoothstep( 0.22, 0.5, pn + aRnd.y * 0.2 ) * ( 0.5 + aRnd.y * 0.5 );
          else s *= ( 1.0 - fern ) * step( aRnd.y, 0.75 ) * ( 0.6 + aRnd.x * 0.6 );
          s *= smoothstep( 0.6, 1.5, trailD( wp ) + aRnd.x * 0.6 );
          for ( int i = 0; i < ${NCLEAR}; i++ ) {
            vec3 c = uClear[ i ];
            if ( distance( wp, c.xy ) < c.z ) s = 0.0;
          }
          float a = aRnd.x * 6.2831;
          vec3 p = position;
          p.xz = mat2( cos( a ), -sin( a ), sin( a ), cos( a ) ) * p.xz;
          float bend = uv.y * uv.y;
          float w = sin( uTime * 0.6 + wp.x * 0.13 + wp.y * 0.11 + aRnd.z * 6.0 ) * 0.5 + sin( uTime * 0.23 + wp.x * 0.02 ) * 0.5;
          p.xz += vec2( 0.6, 0.4 ) * w * bend * 0.08;
          p.y += abs( w ) * bend * 0.03;
          p *= s;
          vec3 transformed = vec3( wp.x + p.x, terrainH( wp ) + p.y - 0.03, wp.y + p.z );
          float lum = ( 0.8 + aRnd.z * 0.35 ) * ( 0.6 + 0.4 * uv.y );
          vTint = aPart < 0.5 ? vec3( 0.95, 1.05, 0.85 ) * lum : vec3( 1.05, 1.0, 0.82 ) * lum;`,
        );
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vTint;')
        .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.rgb *= vTint;')
        .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nnormal = normalize( vNormal );');
    };
    mat.customProgramCacheKey = () => 'l23-veg';
    this.veg = new THREE.Mesh(geo, mat);
    this.veg.frustumCulled = false;
    this.veg.receiveShadow = Q.shadows;
    this.scene.add(this.veg);
  }

  // Esporos e farelos de folha que sobem devagar (a gravidade aqui é estranha).
  makeSpores() {
    const Q = this.Q;
    const n = Q.id === 'low' ? 260 : Q.id === 'medium' ? 520 : 900;
    const R = 16;
    const H = 12;
    const pos = new Float32Array(n * 3);
    const rnd = new Float32Array(n * 3);
    const rr = mulberry32(this.seed + 5);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (rr() * 2 - 1) * R;
      pos[i * 3 + 1] = rr() * H;
      pos[i * 3 + 2] = (rr() * 2 - 1) * R;
      rnd[i * 3] = rr();
      rnd[i * 3 + 1] = rr();
      rnd[i * 3 + 2] = rr();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aRnd', new THREE.BufferAttribute(rnd, 3));
    this.sporeU = {
      uCam: { value: new THREE.Vector3() },
      uTime: this.timeU,
      uR: { value: R },
      uH: { value: H },
      uScale: { value: 400 },
      uFogD: { value: this.fogDensity },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.sporeU,
      vertexShader: /* glsl */ `
        attribute vec3 aRnd;
        uniform vec3 uCam;
        uniform float uTime, uR, uH, uScale, uFogD;
        varying float vA;
        varying float vGlow;
        void main() {
          vec2 xz = uCam.xz + mod( position.xz - uCam.xz + uR, 2.0 * uR ) - uR;
          float y = mod( position.y + uTime * ( 0.08 + aRnd.x * 0.22 ), uH );
          xz += vec2( sin( uTime * 0.31 + aRnd.y * 6.28 + y * 0.5 ), cos( uTime * 0.23 + aRnd.z * 6.28 + y * 0.4 ) ) * 0.5;
          vec3 wp = vec3( xz.x, uCam.y - uH * 0.3 + y, xz.y );
          vec4 mv = viewMatrix * vec4( wp, 1.0 );
          gl_Position = projectionMatrix * mv;
          float d = -mv.z;
          vGlow = step( 0.84, aRnd.y );
          gl_PointSize = max( 1.5, uScale * ( 0.025 + aRnd.x * 0.035 + vGlow * 0.02 ) / max( d, 0.3 ) );
          float k = y / uH;
          vA = smoothstep( 0.0, 0.12, k ) * ( 1.0 - smoothstep( 0.7, 1.0, k ) ) * exp( -uFogD * uFogD * d * d ) * smoothstep( 0.3, 1.2, d );
          vA *= 1.0 - smoothstep( uR * 0.7, uR, length( xz - uCam.xz ) );
        }`,
      fragmentShader: /* glsl */ `
        varying float vA;
        varying float vGlow;
        void main() {
          float r = length( gl_PointCoord - 0.5 ) * 2.0;
          float a = max( 0.0, 1.0 - r );
          a *= a * vA;
          vec3 c = mix( vec3( 0.55, 0.58, 0.48 ), vec3( 1.3, 1.5, 0.9 ), vGlow );
          gl_FragColor = vec4( c * a, 1.0 );
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.spores = new THREE.Points(geo, mat);
    this.spores.frustumCulled = false;
    this.scene.add(this.spores);
  }

  // ------------------------------------------------------------ geração
  *genChunk(ch) {
    const { i, j, x0, z0 } = ch;
    const W = this.world;
    const Q = this.Q;
    const bark = new GeoBuilder();
    const drape = new GeoBuilder();
    const beams = new GeoBuilder();
    ch.circles = [];
    const ctx = { W, bark, drape, beams, circles: ch.circles, clears: ch.clears, sides: this.sides, props: Q.props, rocks: this.rocks };
    const rnd = mulberry32((hash3(i, j, this.seed) * 4294967296) >>> 0);
    // troncos colossais trançados (2×2 células por bloco)
    for (let cj = 0; cj < 2; cj++) {
      for (let ci = 0; ci < 2; ci++) {
        const s = W.colossus(i * 2 + ci, j * 2 + cj);
        if (s) yield* buildColossus(ctx, s);
      }
    }
    const near = [];
    for (let cj = j * 2 - 1; cj <= j * 2 + 2; cj++) {
      for (let ci = i * 2 - 1; ci <= i * 2 + 2; ci++) {
        const s = W.colossus(ci, cj);
        if (s) near.push(s);
      }
    }
    const free = (x, z, m) => {
      for (const s of near) if (Math.hypot(x - s.x, z - s.z) < s.foot + m) return false;
      return W.baseDist(x, z) > RO + 9 + m && Math.hypot(x - W.sx, z - W.sz) > 3 + m;
    };
    // árvores petrificadas comuns
    const nt = Math.round((3 + rnd() * 4) * Q.props);
    for (let k = 0; k < nt; k++) {
      const x = x0 + rnd() * P;
      const z = z0 + rnd() * P;
      if (W.trailDist(x, z) < 3.5 || !free(x, z, 3)) continue;
      buildTree(ctx, x, z, rnd);
      if (k % 2) yield;
    }
    yield;
    // troncos caídos
    const nl = 1 + Math.floor(rnd() * 2.6);
    for (let k = 0; k < nl; k++) {
      const x = x0 + rnd() * P;
      const z = z0 + rnd() * P;
      if (free(x, z, 9)) buildLog(ctx, x, z, rnd);
    }
    // pedras e fungos soltos
    const nr = Math.round((8 + rnd() * 8) * Q.props);
    for (let k = 0; k < nr; k++) {
      const x = x0 + rnd() * P;
      const z = z0 + rnd() * P;
      if (W.trailDist(x, z) < 1.8 || !free(x, z, 1)) continue;
      const s = 0.2 + rnd() * rnd() * 1.5;
      rock(ctx, x, W.h(x, z) + s * 0.1, z, s, rnd);
      if (s > 0.45) ctx.circles.push([x, z, s * 0.85]);
      if (rnd() < 0.25) fungi(ctx, x + s * 0.9, W.h(x, z), z, rnd, 3 + Math.floor(rnd() * 4));
    }
    // feixes de luz vindos da copa
    const nb = Q.id === 'low' ? 1 : 2;
    for (let k = 0; k < nb; k++) {
      if (rnd() < 0.8) beam(ctx, x0 + rnd() * P, z0 + rnd() * P, SUN, 1.8 + rnd() * 2.2, 3.5 + rnd() * 3, 0.16 + rnd() * 0.14);
    }
    // a trilha: estacas com fitas, arcos de raiz, tocos com bilhetes
    this.trailStuff(ctx, ch);
    yield;
    if (!bark.empty) this.addMesh(ch, bark.build(), this.barkMat);
    if (!drape.empty) this.addMesh(ch, drape.build(), this.drapeMat, { cast: false });
    if (!beams.empty) this.addMesh(ch, beams.build(), this.beamMat, { cast: false, receive: false });
  }

  trailStuff(ctx, ch) {
    const W = this.world;
    const inCh = (x, z) => x >= ch.x0 && x < ch.x0 + P && z >= ch.z0 && z < ch.z0 + P;
    const rnd = mulberry32(this.seed + 404);
    // estacas de madeira com fitas laranja desbotadas
    const n = Math.floor(W.L / 11);
    for (let k = 1; k < n; k++) {
      const s = k % 2 ? 1 : -1;
      const tp = W.trailPoint(k / n);
      const x = tp.x + W.nx * 1.5 * s;
      const z = tp.z + W.nz * 1.5 * s;
      const r1 = rnd();
      const r2 = rnd();
      if (!inCh(x, z)) continue;
      const y = W.h(x, z);
      ctx.bark.box(x, y + 0.55, z, 0.07, 1.2, 0.07, [0.62, 0.5, 0.38], null, { ao: 0, rot: r1, group: 2 });
      ctx.bark.box(x, y + 1.0, z, 0.02, 0.36, 0.07, [1.5, 0.7, 0.28], null, { ao: 0, rot: r1 + 0.4 + r2, group: 2 });
    }
    // arcos de raiz por cima da trilha
    for (const t of [0.33, 0.67]) {
      const c = W.trailPoint(t);
      if (inCh(c.x, c.z)) this.trailArch(ctx, c, rnd);
    }
    // tocos com bilhetes e uma garrafa de Água de Amêndoa
    const spots = [
      [0.22, 'note', 'l23n0'],
      [0.5, 'note', 'l23n1'],
      [0.62, 'water', 'l23w0'],
      [0.8, 'note', 'l23n2'],
    ];
    for (const [t, type, key] of spots) {
      const tp = W.trailPoint(t);
      const s = t === 0.5 ? -1 : 1;
      const x = tp.x + W.nx * 1.9 * s;
      const z = tp.z + W.nz * 1.9 * s;
      if (!inCh(x, z)) continue;
      const y = W.h(x, z);
      sweep(
        ctx.bark,
        [
          [x, y - 0.3, z],
          [x, y + 0.2, z],
          [x, y + 0.55, z],
        ],
        [0.42, 0.34, 0.32],
        {
          sides: this.sides.mid,
          bump: 0.1,
          col: [0.95, 0.95, 0.88],
          capB: true,
          capCol: [1.1, 1.05, 0.9],
          uScale: 1,
          vScale: 1,
        },
      );
      ctx.circles.push([x, z, 0.36]);
      ctx.clears.push([x, z, 0.9]);
      ch.items.push({ type, key, x, z, y: y + 0.56, rot: t * 9 });
    }
  }

  // Raiz enorme em arco por cima da trilha, com um fio enrolado nela.
  trailArch(ctx, c, rnd) {
    const W = this.world;
    const nx = W.nx;
    const nz = W.nz;
    const span = 7.5;
    const n = 16;
    const col = [0.95, 0.97, 0.88];
    for (let j = 0; j < 2; j++) {
      const pts = [];
      const rad = [];
      for (let i = 0; i <= n; i++) {
        const s = (i / n) * 2 - 1;
        const tw = j ? 0.55 : 0;
        const th = s * 5 + j * Math.PI;
        const x = c.x + nx * s * span + W.ux * Math.cos(th) * tw;
        const z = c.z + nz * s * span + W.uz * Math.cos(th) * tw;
        const y = W.h(x, z) - 1.6 + 7.2 * (1 - s * s) + Math.sin(th) * tw;
        pts.push([x, y, z]);
        rad.push(j ? 0.32 : 1.05 - 0.15 * Math.abs(s));
        if (!j) {
          const yRel = y - W.h(x, z);
          const r = rad[i];
          const dy = Math.min(Math.max(yRel, 0.2), 1.7) - yRel;
          const hw = Math.sqrt(Math.max(0, r * r - dy * dy));
          if (hw > 0.15) ctx.circles.push([x, z, hw * 0.95]);
        }
      }
      sweep(ctx.bark, pts, rad, {
        sides: j ? this.sides.small + 1 : this.sides.mid + 2,
        bump: 0.12,
        seed: j + c.x,
        col,
        uScale: 2.5,
        vScale: 2.5,
      });
    }
    if (rnd() < 0.9)
      fungi(ctx, c.x + nx * span * 0.8, W.h(c.x + nx * span * 0.8, c.z + nz * span * 0.8) + 0.2, c.z + nz * span * 0.8, rnd, 6);
  }

  // ------------------------------------------------------------ mundo físico
  groundY(x, z) {
    const f = this.base.floorY(x, z);
    return f ?? this.world.h(x, z);
  }

  surfaceAt(x, z) {
    if (this.base.floorY(x, z) !== null) return 'wood';
    return this.world.trailDist(x, z) < 1.1 ? 'dirt' : 'grass';
  }

  collide(p, r) {
    super.collide(p, r);
    // círculos (troncos, raízes, pedras): as raízes avançam até ~25 m nos blocos vizinhos
    const i0 = Math.floor((p.x - 26) / P);
    const i1 = Math.floor((p.x + 26) / P);
    const j0 = Math.floor((p.z - 26) / P);
    const j1 = Math.floor((p.z + 26) / P);
    for (let it = 0; it < 2; it++) {
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const ch = this.chunks.get(this.chunkKey(i, j));
          if (!ch || !ch.circles) continue;
          for (const c of ch.circles) {
            const dx = p.x - c[0];
            const dz = p.z - c[1];
            const m = c[2] + r;
            if (dx > m || dx < -m || dz > m || dz < -m) continue;
            const d = Math.hypot(dx, dz);
            if (d < m && d > 1e-5) {
              p.x = c[0] + (dx / d) * m;
              p.z = c[1] + (dz / d) * m;
            }
          }
        }
      }
    }
    this.base.collide(p, r);
    return p;
  }

  // Círculos sem vegetação (e com chão escuro) mais próximos do jogador.
  onChunkBuilt() {
    this.refreshClears = true;
  }
  onChunkDisposed() {
    this.refreshClears = true;
  }

  updateClears(p) {
    const W = this.world;
    const all = [[W.bx, W.bz, RO + 1.2]];
    for (const ch of this.chunks.values()) for (const c of ch.clears) all.push(c);
    const d = (c) => Math.hypot(c[0] - p.x, c[1] - p.z) - c[2];
    all.sort((a, b) => d(a) - d(b));
    const u = this.clearU.value;
    for (let k = 0; k < NCLEAR; k++) {
      const c = all[k];
      if (c) u[k].set(c[0], c[1], c[2]);
      else u[k].set(1e6, 1e6, 0);
    }
  }

  // ------------------------------------------------------------ quadro
  update(dt, player) {
    const p = player.pos;
    const g = this.game;
    this.time += dt;
    const t = this.time;
    this.timeU.value = t;
    this.updateChunks(p.x, p.z);
    if (this.refreshClears || (this.clearT = (this.clearT || 0) + dt) > 0.7) {
      this.refreshClears = false;
      this.clearT = 0;
      this.updateClears(p);
    }
    // gravidade estranha: o corpo demora a assentar e flutua um pouco
    const cam = g.camera.position;
    this.floatY = this.floatY === undefined ? p.y : damp(this.floatY, p.y, 2.2, dt);
    cam.y += this.floatY - p.y + Math.sin(t * 0.5) * 0.03 + Math.sin(t * 0.21 + 1.3) * 0.02;
    this.sky.position.copy(cam);
    this.sky.material.uniforms.uCam.value.copy(cam);
    this.vegU.uCam.value.copy(cam);
    this.sporeU.uCam.value.copy(cam);
    const cm = g.camera;
    this.sporeU.uScale.value = g.renderer.domElement.height / (2 * Math.tan((cm.fov * Math.PI) / 360));
    const st = this.groundStep;
    this.ground.position.set(Math.round(cam.x / st) * st, 0, Math.round(cam.z / st) * st);
    this.updateSun(p);
    this.base.update(cam, t, this.Q.outdoorView);
    // objetivo: entrar no abrigo
    if (!this.entered && this.base.inside(p.x, p.z)) {
      this.entered = true;
      g.completeObjective('seedling', 'Base Seedling. A lamparina está acesa e o rádio chia sobre a mesa.');
      setTimeout(() => {
        if (g.level === this && !this.ending) g.hud.objective('Ouça o rádio ou descanse no catre.', 8);
      }, 4500);
    }
    // o rádio chiando dentro do abrigo
    if (!this.radioSnd && this.world.baseDist(p.x, p.z) < 50) {
      const r = this.base.radioP;
      this.radioSnd = g.audio.positional('radio', r[0], r[1], r[2], { gain: 0.2, ref: 1.5, rolloff: 1.6, wet: 0.6 });
    }
    if (!this.toldGravity && t > 8) {
      this.toldGravity = true;
      g.hud.message('O corpo está leve demais. Cada passo demora a voltar ao chão.', 5);
    }
  }

  interactable(player) {
    if (this.ending) return null;
    const p = player.pos;
    const b = this.base;
    if (!b.inside(p.x, p.z)) return null;
    if (Math.hypot(p.x - b.radio[0], p.z - b.radio[1]) < 1.5) return { label: 'Ouvir o rádio', action: () => this.end() };
    if (Math.hypot(p.x - b.cot[0], p.z - b.cot[1]) < 1.5) return { label: 'Deitar no catre e descansar', action: () => this.end() };
    return null;
  }

  // Fim do jogo: a voz do telefone, agora no rádio.
  end() {
    if (this.ending) return;
    this.ending = true;
    const g = this.game;
    this.entered = true;
    g.completeObjective('seedling', 'Base Seedling.');
    g.player.frozen = true;
    g.audio.play('radio', { gain: 0.5 });
    if (this.radioSnd) this.radioSnd.setGain(0.55, 0.5);
    g.hud.message('O rádio estala. No meio da estática, uma voz que você já ouviu…', 4);
    // não é o fim: o catre leva ao Nível 88
    this.endTimer = setTimeout(() => {
      if (g.level !== this) return;
      g.hud.message('“Você ainda está aí? Que bom. Pode parar de andar.” Você se deita no catre e fecha os olhos…', 6);
      this.endTimer = setTimeout(() => {
        if (g.level !== this) return;
        g.hud.message('…e acorda com água morna batendo nos dedos.', 4);
        g.player.frozen = false;
        g.reachExit('noclip', 1.2);
      }, 5200);
    }, 3400);
  }

  navTarget() {
    if (this.entered) return { x: this.base.radio[0], z: this.base.radio[1] };
    return this.base.doorFront;
  }

  exitEmitter() {
    const l = this.base.lantern;
    return { x: l[0], y: l[1], z: l[2], sound: 'fire', gain: 0.5 };
  }

  onCollapse() {
    this.floatY = undefined;
  }

  dispose() {
    clearTimeout(this.endTimer);
    super.dispose();
    this.base.dispose();
    for (const m of [this.ground, this.veg, this.spores, this.sky]) {
      m.geometry.dispose();
      m.material.dispose();
    }
    for (const m of [this.barkMat, this.woodMat, this.drapeMat, this.beamMat]) m.dispose();
    for (const g of this.rocks) g.dispose();
    this.scene.remove(this.hemi, this.sun, this.sun.target);
  }
}
