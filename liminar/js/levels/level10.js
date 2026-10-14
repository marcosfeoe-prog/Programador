// Nível 10 — "A Plantação": trigo infinito sob céu nublado, estradas de terra
// em grade, postes com fios, cercas, celeiros, fardos de feno e espantalhos.
// Saída: uma porta solitária de pé no meio do trigo.
import * as THREE from 'three';
import { OutdoorLevel, makeSky } from './outdoor.js';
import { GeoBuilder } from '../materials.js';
import { getTex } from '../textures.js';
import { hash3, mulberry32 } from '../util.js';

const fl = (v) => v.toFixed(3);
const P = 72; // espaçamento das estradas
const ROAD = 1.7; // meia largura da estrada

// Relevo suave (idêntico em JS e GLSL).
export function terrainH(x, z) {
  return (
    1.6 * Math.sin(x * 0.012 + 1.3) * Math.sin(z * 0.01 + 0.4) +
    0.7 * Math.sin(x * 0.031 + z * 0.017) +
    0.35 * Math.sin(z * 0.045 - x * 0.02 + 2.0)
  );
}
const TERRAIN_GLSL = /* glsl */ `
float terrainH( vec2 p ) {
  return 1.6 * sin( p.x * 0.012 + 1.3 ) * sin( p.y * 0.01 + 0.4 )
       + 0.7 * sin( p.x * 0.031 + p.y * 0.017 )
       + 0.35 * sin( p.y * 0.045 - p.x * 0.02 + 2.0 );
}
float roadDist( vec2 p ) {
  vec2 q = abs( mod( p + ${P / 2}.0, ${P}.0 ) - ${P / 2}.0 );
  return min( q.x, q.y );
}
`;

function roadDist(x, z) {
  const m = (v) => Math.abs(((((v + P / 2) % P) + P) % P) - P / 2);
  return Math.min(m(x), m(z));
}

export class Level10 extends OutdoorLevel {
  constructor(game) {
    super(game, { P, walkSpeed: 2.5 });
    this.num = 10;
    this.seed = (game.seed ^ 0x1010) >>> 0;
    const Q = this.Q;
    this.look = {
      exposure: 0.95,
      tint: [1.0, 0.99, 0.95],
      sat: 0.82,
      contrast: 1.06,
      lift: [0.02, 0.02, 0.022],
      bloom: 0.05,
      bloomThreshold: 2.5,
      fog: [0.62, 0.64, 0.64],
      lightColor: [1, 1, 1],
      flashlight: false,
      ambience: 'level10',
      reverb: 0.6,
      sanityDrain: 0.09,
      watcher: { near: 32, far: 70, first: 30, gap: 55 },
    };
    const fogC = new THREE.Color(...this.look.fog);
    this.scene.fog = new THREE.FogExp2(fogC, 2.1 / Q.outdoorView);
    this.scene.background = fogC;
    this.sky = makeSky({
      zenith: [0.5, 0.53, 0.57],
      horizon: [0.66, 0.67, 0.67],
      ground: [0.3, 0.27, 0.2],
      fog: this.look.fog,
      sunDir: new THREE.Vector3(0.3, 0.8, -0.4),
      sunColor: [0.12, 0.12, 0.11],
      cloudA: [0.42, 0.44, 0.46],
      cloudB: [0.7, 0.71, 0.72],
      cover: 0.2,
    });
    this.scene.add(this.sky);
    this.setupLights({
      sky: 0xd6dadf,
      ground: 0x6d5c40,
      hemi: 2.1,
      sunColor: 0xf3f1ea,
      sun: 0.9,
      sunDir: new THREE.Vector3(0.35, 0.85, -0.3),
      shadowExtent: 45,
    });
    this.makeGround();
    this.makeWheat();
    // materiais dos objetos
    const S = Q.tex;
    const pl = getTex('planks', S);
    const gr = getTex('grime', S);
    this.woodMat = new THREE.MeshStandardMaterial({
      map: pl.map,
      normalMap: Q.normalMaps ? pl.normalMap : null,
      vertexColors: true,
      roughness: 0.92,
    });
    this.miscMat = new THREE.MeshStandardMaterial({ map: gr.map, vertexColors: true, roughness: 0.85 });
    this.wireMat = new THREE.LineBasicMaterial({ color: 0x1a1a1a, fog: true });
    this.route();
  }

  makeGround() {
    const Q = this.Q;
    const size = Q.outdoorView * 2 + 40;
    const seg = Q.id === 'low' ? 90 : Q.id === 'medium' ? 140 : 200;
    const g = new THREE.PlaneGeometry(size, size, seg, seg);
    g.rotateX(-Math.PI / 2);
    const soil = getTex('soil', Q.tex);
    const path = getTex('pathDirt', Q.tex);
    const mat = new THREE.MeshStandardMaterial({ map: soil.map, roughness: 1 });
    const uniforms = { uPath: { value: path.map }, uWheatR: { value: Q.wheatRadius } };
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, uniforms);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nuniform float uWheatR;\n' + TERRAIN_GLSL)
        .replace(
          '#include <beginnormal_vertex>',
          `vec2 gxz = ( modelMatrix * vec4( position, 1.0 ) ).xz;
          float e = 0.5;
          float hx = terrainH( gxz + vec2( e, 0.0 ) ) - terrainH( gxz - vec2( e, 0.0 ) );
          float hz = terrainH( gxz + vec2( 0.0, e ) ) - terrainH( gxz - vec2( 0.0, e ) );
          vec3 objectNormal = normalize( vec3( -hx / ( 2.0 * e ), 1.0, -hz / ( 2.0 * e ) ) );`,
        )
        .replace(
          '#include <begin_vertex>',
          `float field = smoothstep( ${fl(ROAD + 0.2)}, ${fl(ROAD + 1.6)}, roadDist( gxz ) );
          float far = smoothstep( uWheatR * 0.5, uWheatR * 0.72, distance( gxz, cameraPosition.xz ) );
          vec3 transformed = vec3( position.x, terrainH( gxz ) + 0.92 * field * far, position.z );`,
        )
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;');
      sh.fragmentShader = sh.fragmentShader
        .replace(
          '#include <common>',
          '#include <common>\nvarying vec3 vWPos;\nuniform sampler2D uPath;\nuniform float uWheatR;\n' + TERRAIN_GLSL,
        )
        .replace(
          '#include <map_fragment>',
          `vec2 w = vWPos.xz;
          vec3 soilC = texture2D( map, w * 0.25 ).rgb;
          vec3 dirtC = texture2D( uPath, w * 0.25 ).rgb;
          float nz = texture2D( map, w * 0.013 ).r;
          float rd = roadDist( w ) + ( nz - 0.4 ) * 0.9;
          float onRoad = 1.0 - smoothstep( ${fl(ROAD - 0.3)}, ${fl(ROAD + 0.3)}, rd );
          // sulcos dos pneus e capim no meio da estrada
          vec2 q = mod( w + ${P / 2}.0, ${P}.0 ) - ${P / 2}.0;
          float across = abs( q.x ) < abs( q.y ) ? q.x : q.y;
          float track = smoothstep( 0.28, 0.08, abs( abs( across ) - 0.8 ) );
          dirtC *= 1.0 - track * 0.22;
          dirtC = mix( dirtC, vec3( 0.2, 0.19, 0.11 ), smoothstep( 0.25, 0.0, abs( across ) ) * 0.35 );
          // ao longe o chão assume a cor do trigo (o trigo instanciado acaba no raio)
          float df = distance( w, cameraPosition.xz );
          float streak = texture2D( map, vec2( w.x * 0.9, w.y * 0.07 ) ).r * 0.6 + texture2D( map, w * 0.11 ).r * 0.6;
          vec3 wheatFar = vec3( 0.56, 0.43, 0.22 ) * ( 0.62 + nz * 0.35 + streak * 0.45 );
          vec3 field = mix( soilC * vec3( 0.95, 0.9, 0.75 ), wheatFar, smoothstep( uWheatR * 0.45, uWheatR * 0.7, df ) );
          diffuseColor.rgb *= mix( field, dirtC, onRoad );`,
        );
    };
    mat.customProgramCacheKey = () => 'l10-ground';
    this.ground = new THREE.Mesh(g, mat);
    this.ground.receiveShadow = Q.shadows;
    this.ground.frustumCulled = false;
    this.scene.add(this.ground);
  }

  // Trigo instanciado: grade fixa que "dá a volta" ao redor da câmera no shader.
  makeWheat() {
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
    const tex = getTex('wheat', Math.min(512, Q.tex * 2)).map;
    const mat = new THREE.MeshLambertMaterial({
      map: tex,
      alphaTest: 0.45,
      side: THREE.DoubleSide,
      alphaToCoverage: Q.msaa > 0,
    });
    this.wheatU = {
      uCam: { value: new THREE.Vector3() },
      uR: { value: R },
      uTime: { value: 0 },
      uClear: { value: Array.from({ length: 8 }, () => new THREE.Vector4(1e6, 1e6, 1e6, 1e6)) },
    };
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.wheatU);
      sh.vertexShader = sh.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
          attribute vec2 aOff;
          attribute vec3 aRnd;
          uniform vec3 uCam;
          uniform float uR;
          uniform float uTime;
          uniform vec4 uClear[8];
          varying float vTint;
          ${TERRAIN_GLSL}`,
        )
        .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3( 0.0, 1.0, 0.0 );')
        .replace(
          '#include <begin_vertex>',
          `vec2 cc = uCam.xz;
          vec2 wp = cc + mod( aOff - cc + uR, 2.0 * uR ) - uR;
          float dd = length( wp - cc );
          float s = mix( 1.0, 0.6, smoothstep( uR * 0.74, uR, dd ) ) * step( dd, uR ) * ( 0.78 + aRnd.y * 0.4 );
          s *= smoothstep( ${fl(ROAD + 0.05)}, ${fl(ROAD + 0.9)}, roadDist( wp ) );
          for ( int i = 0; i < 8; i++ ) {
            vec4 r = uClear[ i ];
            if ( wp.x > r.x && wp.x < r.z && wp.y > r.y && wp.y < r.w ) s = 0.0;
          }
          float a = aRnd.x * 6.2831;
          vec3 p = position;
          p.xz = mat2( cos( a ), -sin( a ), sin( a ), cos( a ) ) * p.xz;
          float bend = uv.y * uv.y;
          float gust = sin( uTime * 0.5 + wp.x * 0.025 + wp.y * 0.01 );
          float w = sin( uTime * 1.9 + wp.x * 0.21 + wp.y * 0.17 + aRnd.z * 6.0 ) * 0.35 + gust * 0.9 + 0.4;
          p.xz += vec2( 0.8, 0.45 ) * w * bend * 0.22;
          p.y -= abs( w ) * bend * 0.06;
          p *= s;
          vec3 transformed = vec3( wp.x + p.x, terrainH( wp ) + p.y, wp.y + p.z );
          vTint = ( 0.85 + aRnd.z * 0.25 ) * ( 0.82 + 0.18 * uv.y );`,
        );
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vTint;')
        .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.rgb *= vTint;')
        // as duas faces usam a normal "para cima" (sem inverter no verso)
        .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nnormal = normalize( vNormal );');
    };
    mat.customProgramCacheKey = () => 'l10-wheat';
    this.wheat = new THREE.Mesh(geo, mat);
    this.wheat.frustumCulled = false;
    this.wheat.receiveShadow = Q.shadows;
    this.scene.add(this.wheat);
  }

  // ------------------------------------------------------------ geração
  hasLineX(i) {
    return (this.forceLineX && this.forceLineX.has(i)) || hash3(i, 1, this.seed) < 0.4;
  }
  hasLineZ(j) {
    return (this.forceLineZ && this.forceLineZ.has(j)) || hash3(j, 2, this.seed) < 0.3;
  }

  *genChunk(ch) {
    const { i, j, x0, z0 } = ch;
    const wood = new GeoBuilder();
    const misc = new GeoBuilder();
    const wires = [];
    const h = (k) => hash3(i * 13 + k, j * 7 - k, this.seed);
    const gy = terrainH;
    const near0 = Math.abs(i) + Math.abs(j) === 0;
    // postes ao longo da estrada vertical (x = i*P) e horizontal (z = j*P)
    const pole = (x, z) => {
      const y = gy(x, z);
      wood.cylinder(x, y + 4.6, z, 0.12, 9.2, [0.42, 0.33, 0.24], null, { sides: 7, r2: 0.1 });
      ch.colliders.push([x - 0.15, x + 0.15, z - 0.15, z + 0.15]);
      return y;
    };
    if (this.hasLineX(i)) {
      const x = x0 - 2.7;
      for (let k = 0; k < 3; k++) {
        const z = z0 + 6 + k * 24;
        const y = pole(x, z);
        wood.box(x, y + 8.5, z, 0.1, 0.12, 2.3, [0.38, 0.3, 0.22], null, { ao: 0 });
        for (const o of [-0.95, 0, 0.95]) {
          misc.cylinder(x, y + 8.66, z + o, 0.04, 0.2, [0.55, 0.6, 0.55], null, { sides: 6 });
          const zn = z + 24;
          wires.push([x, y + 8.7, z + o, x, gy(x, zn) + 8.7, zn + o]);
        }
      }
    }
    if (this.hasLineZ(j)) {
      const z = z0 - 2.7;
      for (let k = 0; k < 3; k++) {
        const x = x0 + 18 + k * 24;
        const y = pole(x, z);
        wood.box(x, y + 8.5, z, 2.3, 0.12, 0.1, [0.38, 0.3, 0.22], null, { ao: 0 });
        for (const o of [-0.95, 0, 0.95]) {
          misc.cylinder(x + o, y + 8.66, z, 0.04, 0.2, [0.55, 0.6, 0.55], null, { sides: 6 });
          const xn = x + 24;
          wires.push([x + o, y + 8.7, z, xn + o, gy(xn, z) + 8.7, z]);
        }
      }
    }
    yield;
    // cerca ao longo da estrada
    if (h(1) < 0.35) {
      const z = z0 + ROAD + 1.0;
      const start = x0 + 6 + h(2) * 20;
      const len = 18 + h(3) * 30;
      for (let x = start; x < Math.min(x0 + P - 4, start + len); x += 2.6) {
        const y = gy(x, z);
        wood.box(x, y + 0.6, z, 0.12, 1.2, 0.12, [0.48, 0.42, 0.34], null, {});
        if (x + 2.6 < start + len) {
          for (const ry of [0.45, 0.95]) wood.box(x + 1.3, y + ry, z, 2.6, 0.1, 0.05, [0.5, 0.44, 0.35], null, { ao: 0 });
        }
      }
    }
    // celeiro
    if (h(4) < 0.14 && !near0 && !this.isExitChunk(i, j)) {
      const bx = x0 + 20 + h(5) * 20;
      const bz = z0 + 14 + h(6) * 20;
      this.barn(wood, misc, ch, bx, bz, h(7) < 0.5 ? 0 : Math.PI / 2);
    }
    // fardos de feno
    if (h(8) < 0.3) {
      const bx = x0 + P - 8 - h(9) * 10;
      const bz = z0 + ROAD + 3.5;
      ch.clears.push([bx - 4, bz - 2, bx + 4, bz + 3]);
      for (let k = 0; k < 3; k++) {
        const x = bx - 2.5 + k * 2.4;
        const z = bz + (k % 2) * 0.8;
        misc.cylinder(x, gy(x, z) + 0.72, z, 0.72, 1.2, [0.66, 0.55, 0.32], null, { axis: 'z', sides: 14 });
        ch.colliders.push([x - 0.75, x + 0.75, z - 0.6, z + 0.6]);
      }
    }
    // árvore seca solitária
    if (h(10) < 0.22) {
      const x = x0 + 12 + h(11) * 48;
      const z = z0 + 12 + h(12) * 48;
      const y = gy(x, z);
      wood.cylinder(x, y + 2.4, z, 0.22, 4.8, [0.3, 0.26, 0.22], null, { sides: 8, r2: 0.12 });
      for (let k = 0; k < 5; k++) {
        const a = k * 1.3 + h(13) * 6;
        const by = y + 2.6 + k * 0.45;
        const L = 1.8 - k * 0.2;
        wood.box(x + Math.cos(a) * L * 0.45, by + 0.4, z + Math.sin(a) * L * 0.45, L, 0.1, 0.1, [0.3, 0.26, 0.22], null, {
          rot: -a,
          ao: 0,
        });
      }
      ch.colliders.push([x - 0.25, x + 0.25, z - 0.25, z + 0.25]);
    }
    // espantalho
    if (h(14) < 0.12) {
      const x = x0 + 10 + h(15) * 50;
      const z = z0 + 10 + h(16) * 50;
      const y = gy(x, z);
      ch.clears.push([x - 0.6, z - 0.6, x + 0.6, z + 0.6]);
      wood.box(x, y + 1.25, z, 0.08, 2.5, 0.08, [0.4, 0.33, 0.25], null, {});
      wood.box(x, y + 1.85, z, 1.5, 0.07, 0.07, [0.4, 0.33, 0.25], null, { ao: 0 });
      misc.box(x, y + 1.55, z, 0.5, 0.65, 0.22, [0.28, 0.24, 0.2], null, { ao: 0 });
      misc.box(x, y + 2.05, z, 0.24, 0.26, 0.22, [0.68, 0.6, 0.42], null, { ao: 0 });
      misc.cylinder(x, y + 2.22, z, 0.28, 0.03, [0.45, 0.38, 0.22], null, { sides: 10 });
      misc.cylinder(x, y + 2.3, z, 0.13, 0.16, [0.45, 0.38, 0.22], null, { sides: 10 });
    }
    // a porta
    if (this.isExitChunk(i, j)) this.door(wood, misc, ch);
    yield;
    if (!wood.empty) this.addMesh(ch, wood.build(), this.woodMat);
    if (!misc.empty) this.addMesh(ch, misc.build(), this.miscMat);
    if (wires.length) {
      const pts = [];
      for (const w of wires) {
        const [ax, ay, az, bx, by, bz] = w;
        const seg = 10;
        for (let s = 0; s < seg; s++) {
          for (const t of [s / seg, (s + 1) / seg]) {
            const sag = 4 * t * (1 - t) * 0.9;
            pts.push(ax + (bx - ax) * t, ay + (by - ay) * t - sag, az + (bz - az) * t);
          }
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      const l = new THREE.LineSegments(g, this.wireMat);
      l.matrixAutoUpdate = false;
      this.scene.add(l);
      ch.meshes.push(l);
    }
  }

  barn(wood, misc, ch, x, z, rot) {
    const W = 12;
    const D = 16;
    const H = 6;
    const y = terrainH(x, z) - 0.2;
    const red = [0.5, 0.13, 0.09];
    const sx = rot ? D : W;
    const sz = rot ? W : D;
    wood.box(x, y + H / 2, z, W, H, D, red, null, { rot, uvScale: 3 });
    // telhado de duas águas
    const rw = W / 2 + 0.6;
    const ang = 0.6;
    const ry = y + H + Math.sin(ang) * rw * 0.5;
    for (const s of [-1, 1]) {
      const ox = Math.cos(ang) * rw * 0.5 * s;
      const pos = rot ? [x, z + ox] : [x + ox, z];
      wood.box(pos[0], ry, pos[1], rw + 0.2, 0.14, D + 0.6, [0.22, 0.2, 0.19], null, { rot: rot + (rot ? 0 : 0), ao: 0, uvScale: 3 });
      const last = wood.pos.length / 3;
      // inclina as águas: gira os 24 vértices recém-criados em torno do eixo longitudinal
      const pivot = new THREE.Vector3(pos[0], ry, pos[1]);
      const q = new THREE.Quaternion().setFromAxisAngle(
        rot ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1),
        -s * ang * (rot ? -1 : 1),
      );
      const v = new THREE.Vector3();
      for (let k = last - 24; k < last; k++) {
        v.set(wood.pos[k * 3], wood.pos[k * 3 + 1], wood.pos[k * 3 + 2])
          .sub(pivot)
          .applyQuaternion(q)
          .add(pivot);
        wood.pos[k * 3] = v.x;
        wood.pos[k * 3 + 1] = v.y;
        wood.pos[k * 3 + 2] = v.z;
        v.set(wood.nor[k * 3], wood.nor[k * 3 + 1], wood.nor[k * 3 + 2]).applyQuaternion(q);
        wood.nor[k * 3] = v.x;
        wood.nor[k * 3 + 1] = v.y;
        wood.nor[k * 3 + 2] = v.z;
      }
    }
    // empena triangular aproximada por caixas escalonadas
    for (let k = 0; k < 4; k++) {
      const hh = (Math.sin(ang) * rw) / 4;
      const w = Math.max(0.5, 2 * (W / 2 - (hh * (k + 1)) / Math.tan(ang)) - 0.2);
      if (rot) wood.box(x, y + H + hh * (k + 0.5), z, D - 0.05, hh, w, red, null, { ao: 0, uvScale: 3 });
      else wood.box(x, y + H + hh * (k + 0.5), z, w, hh, D - 0.05, red, null, { ao: 0, uvScale: 3 });
    }
    // portão escuro e frisos brancos
    const fz = rot ? 0 : D / 2 + 0.03;
    const fx = rot ? D / 2 + 0.03 : 0;
    misc.box(x + fx, y + 2.1, z + fz, rot ? 0.05 : 4, 4.2, rot ? 4 : 0.05, [0.03, 0.025, 0.02], null, { ao: 0 });
    misc.box(x + fx * 1.01, y + 2.1, z + fz * 1.01, rot ? 0.06 : 4.3, 0.2, rot ? 4.3 : 0.06, [0.85, 0.83, 0.78], null, { ao: 0 });
    ch.colliders.push([x - sx / 2, x + sx / 2, z - sz / 2, z + sz / 2]);
    ch.clears.push([x - sx / 2 - 2, z - sz / 2 - 2, x + sx / 2 + 2, z + sz / 2 + 2]);
  }

  isExitChunk(i, j) {
    return this.exitChunk && i === this.exitChunk[0] && j === this.exitChunk[1];
  }

  door(wood, misc, ch) {
    const e = this.exit;
    const y = terrainH(e.x, e.z);
    const white = [0.86, 0.85, 0.8];
    // batente e folha (a porta "olha" para a estrada, -x)
    wood.box(e.x, y + 1.06, e.z - 0.5, 0.14, 2.12, 0.1, white, null, {});
    wood.box(e.x, y + 1.06, e.z + 0.5, 0.14, 2.12, 0.1, white, null, {});
    wood.box(e.x, y + 2.16, e.z, 0.14, 0.1, 1.1, white, null, { ao: 0 });
    wood.box(e.x, y + 1.03, e.z, 0.05, 2.04, 0.9, [0.8, 0.78, 0.72], null, { uvScale: 0.9 });
    for (const py of [0.55, 1.45]) misc.box(e.x - 0.03, y + py, e.z, 0.012, 0.6, 0.66, [0.74, 0.72, 0.66], null, { ao: 0 });
    misc.box(e.x - 0.05, y + 1.0, e.z + 0.33, 0.06, 0.06, 0.06, [0.7, 0.6, 0.3], null, { ao: 0 });
    misc.box(e.x, y + 0.02, e.z, 0.3, 0.04, 1.2, [0.5, 0.46, 0.4], null, {});
    ch.colliders.push([e.x - 0.1, e.x + 0.1, e.z - 0.6, e.z + 0.6]);
  }

  route() {
    const rnd = mulberry32(this.seed * 7 + 3);
    const di = (rnd() < 0.5 ? -1 : 1) * (1 + Math.floor(rnd() * 2));
    const dj = (rnd() < 0.5 ? -1 : 1) * (1 + Math.floor(rnd() * 2));
    // linhas de energia forçadas no caminho: estrada z=0 e estrada x=di*P
    this.forceLineZ = new Set([0, 1]);
    this.forceLineX = new Set([di, di + 1]);
    const ex = di * P + 6;
    const ez = dj * P + P / 2 + (rnd() - 0.5) * 20;
    this.exitChunk = [Math.floor(ex / P), Math.floor(ez / P)];
    this.exit = { x: ex, z: ez };
    this.clearDoor = [ex - 2.5, ez - 2.2, ex + 2.5, ez + 2.2];
    this.spawn = { x: 0.6, z: 4, yaw: di > 0 ? -Math.PI / 2 : Math.PI / 2 };
  }

  groundY(x, z) {
    return terrainH(x, z);
  }

  surfaceAt(x, z) {
    return roadDist(x, z) < ROAD + 0.2 ? 'dirt' : 'grass';
  }

  // Áreas sem trigo próximas do jogador (celeiros, fardos, porta).
  onChunkBuilt() {
    this.refreshClears = true;
  }
  onChunkDisposed() {
    this.refreshClears = true;
  }

  updateClears(p) {
    const all = [this.clearDoor];
    for (const ch of this.chunks.values()) for (const c of ch.clears) all.push(c);
    const d = (c) => Math.hypot((c[0] + c[2]) / 2 - p.x, (c[1] + c[3]) / 2 - p.z);
    all.sort((a, b) => d(a) - d(b));
    const u = this.wheatU.uClear.value;
    for (let k = 0; k < 8; k++) {
      const c = all[k];
      if (c) u[k].set(c[0], c[1], c[2], c[3]);
      else u[k].set(1e6, 1e6, 1e6, 1e6);
    }
  }

  update(dt, player) {
    const p = player.pos;
    this.updateChunks(p.x, p.z);
    if (this.refreshClears || (this.clearT = (this.clearT || 0) + dt) > 1) {
      this.refreshClears = false;
      this.clearT = 0;
      this.updateClears(p);
    }
    const cam = this.game.camera.position;
    this.sky.position.copy(cam);
    this.sky.material.uniforms.uTime.value += dt;
    this.wheatU.uCam.value.copy(cam);
    this.wheatU.uTime.value += dt;
    this.ground.position.set(Math.round(cam.x / 4) * 4, 0, Math.round(cam.z / 4) * 4);
    this.updateSun(p);
  }

  interactable(player) {
    const e = this.exit;
    const dx = player.pos.x - e.x;
    const dz = player.pos.z - e.z;
    if (Math.hypot(dx, dz) < 1.9 && Math.abs(dz) < 0.9) {
      return {
        label: 'Abrir a porta',
        action: () => {
          this.game.audio.door();
          this.game.reachExit('door', 0.8);
        },
      };
    }
    return null;
  }

  exitEmitter() {
    return { x: this.exit.x, y: 1.5, z: this.exit.z, sound: 'creak' };
  }

  dispose() {
    super.dispose();
    this.wheat.geometry.dispose();
    this.ground.geometry.dispose();
  }
}
