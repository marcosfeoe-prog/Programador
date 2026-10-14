// Nível 0 — "O Saguão": papel de parede amarelo, carpete úmido e luminárias
// fluorescentes em salas irregulares que nunca terminam.
// Saída: uma parede que falha ("fenda"); atravessá-la leva ao Nível 1.
import * as THREE from 'three';
import { GridLevel, W, EH, EV } from './grid.js';
import { getTex, indoorEnvTex } from '../textures.js';
import { panelMaterial } from '../materials.js';
import { fbm, hash3, mulberry32, TAU } from '../util.js';

export class Level0 extends GridLevel {
  constructor(game) {
    super(game, {
      cell: 2.4,
      H: 2.7,
      T: 0.14,
      doorW: 1.05,
      doorH: 2.15,
      chunkCells: 8,
      seed: (game.seed ^ 0x5151) >>> 0,
      lightRadius: 9.5,
      lightEmitPow: 1,
      bounce: 0.5,
      ambient: 0.025,
      wallUV: [1.2, 2.7],
      floorUV: 2,
      ceilUV: 1.2,
    });
    this.num = 0;
    this.surface = 'carpet';
    this.panelI = 7;
    this.flickerGap = 8;
    const S = this.Q.tex;
    const wp = getTex('wallpaper', S);
    const cp = getTex('carpet', S);
    const ce = getTex('ceiling', S);
    const pn = getTex('panel', S);
    const gr = getTex('grime', S);
    const env = game.makeEnv(indoorEnvTex(['#6b5f3a', '#4a4128', '#3a3220'], '#fff6d8'));
    this.mats = {
      floor: {
        map: cp.map,
        normalMap: cp.normalMap,
        normalScale: 0.8,
        roughness: 0.92,
        dirtColor: new THREE.Color(0.7, 0.62, 0.48),
        dirtAmt: 0.6,
        wet: 0.55,
        envMap: env,
        envIntensity: 0.6,
      },
      wall: { map: wp.map, normalMap: wp.normalMap, normalScale: 0.5, roughness: 0.82, vertexColors: true, envMap: env, envIntensity: 0.25 },
      ceil: { map: ce.map, normalMap: ce.normalMap, roughness: 0.95, lmIntensity: 0.4, vertexColors: true },
      prop: { map: gr.map, normalMap: gr.normalMap, vertexColors: true, roughness: 0.6, envMap: env, envIntensity: 0.4 },
    };
    this.panelMat = panelMaterial(pn.map, 0xfff1d0);
    this.look = {
      exposure: 1.05,
      tint: [1.04, 1.0, 0.88],
      sat: 0.92,
      contrast: 1.04,
      lift: [0.025, 0.02, 0.008],
      bloom: 0.16,
      fog: [0.36, 0.31, 0.17],
      fogNear: 0.4,
      lightColor: [1.0, 0.93, 0.74],
      flashlight: false,
      ambience: 'level0',
      reverb: 2.2,
      sanityDrain: 0.22,
      watcher: { near: 11, far: 20, first: 50, gap: 80 },
    };
    this.route();
  }

  region(x, z) {
    return fbm(x * 0.06, z * 0.06, 3, this.seed);
  }

  // Paredes longas e paralelas formam corredores; o resto é aleatório por região.
  genEdge(kind, ix, iz) {
    const r = this.region(ix, iz);
    let p = 0.3;
    if (r > 0.2) p = 0.06;
    else if (r < -0.22) p = 0.46;
    const lineId = kind === EH ? iz : ix;
    const along = kind === EH ? ix : iz;
    const line = hash3(lineId, kind, this.seed + 5);
    if (line < 0.16 && r < 0.2) {
      // parede de corredor com segmentos e aberturas
      const seg = Math.floor(along / (3 + Math.floor(line * 40)));
      if (hash3(seg, lineId * 3 + kind, this.seed + 9) < 0.82) p = 0.88;
    }
    const h = hash3(ix * 2 + kind, iz, this.seed);
    if (h >= p) return W.NONE;
    const t = hash3(ix, iz * 3 + kind, this.seed + 7);
    if (t < 0.27) return W.DOOR;
    if (t < 0.35) return W.HALF_A;
    if (t < 0.42) return W.HALF_B;
    return W.FULL;
  }

  pillar(ix, iz) {
    if (this.region(ix, iz) < 0.2) return 0;
    if ((ix & 1) || (iz & 1)) return 0;
    return 0.46;
  }

  genLight(cx, cz) {
    if ((cx & 1) || (cz & 1)) return null;
    const c = this.cell;
    const h = this.hashCell(cx, cz, 3);
    const dim = fbm(cx * 0.04 + 30, cz * 0.04, 2, this.seed + 1);
    let group = 0;
    const off = dim < -0.32 ? 0.45 : 0.06;
    if (h < off) group = 3;
    else if (h < off + 0.045) group = 1;
    else if (h < off + 0.09) group = 2;
    const ax = fbm(cx * 0.05 + 9, cz * 0.05, 2, this.seed + 2) > 0 ? 1 : 0;
    return {
      x: cx * c + (ax === 1 ? 0.9 : 1.2),
      z: cz * c + (ax === 1 ? 1.2 : 0.9),
      y: this.H - 0.02,
      ax,
      len: 1.2,
      wid: 0.6,
      I: 9,
      group,
    };
  }

  dirt(x, z) {
    const n = fbm(x * 0.16, z * 0.16, 3, this.seed + 11);
    const t = (n - 0.12) / 0.3;
    return t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t);
  }

  genProps(ch, cx0, cz0) {
    const N = this.chunkCells;
    const c = this.cell;
    for (let z = cz0; z < cz0 + N; z++) {
      for (let x = cx0; x < cx0 + N; x++) {
        if (Math.abs(x) + Math.abs(z) < 2) continue;
        const h = this.hashCell(x, z, 21);
        if (h < 0.014) {
          ch.items.push({
            type: 'water',
            key: `0:${x}:${z}:w`,
            x: x * c + 0.6 + this.hashCell(x, z, 22) * 1.2,
            z: z * c + 0.6 + this.hashCell(x, z, 23) * 1.2,
          });
        }
      }
    }
    if (hash3(ch.cx, ch.cz, this.seed + 31) < 0.3) {
      const x = cx0 + Math.floor(hash3(ch.cx, ch.cz, this.seed + 32) * N);
      const z = cz0 + Math.floor(hash3(ch.cx, ch.cz, this.seed + 33) * N);
      ch.items.push({ type: 'note', key: `0:${ch.cx}:${ch.cz}:n`, x: x * c + 1.2, z: z * c + 1.0, rot: hash3(x, z, 5) * TAU });
    }
  }

  // Sorteia a parede que falha (~80 m) e garante uma rota até ela.
  route() {
    const rnd = mulberry32(this.seed * 7 + 3);
    const a = rnd() * TAU;
    const d = 30 + Math.floor(rnd() * 6);
    const ex = Math.round(Math.cos(a) * d);
    const ez = Math.round(Math.sin(a) * d);
    const c = this.cell;
    const hT = this.T / 2;
    // a fenda fica do lado oposto ao de chegada
    const iz = ez >= 0 ? ez + 1 : ez;
    this.setEdge(EH, ex, iz, W.EXIT);
    this.clearCell(0, 0);
    this.clearCell(ex, ez);
    this.carve(0, 0, ex, ez, rnd);
    const nz = ez >= 0 ? -1 : 1;
    this.exit = { x: ex * c + c / 2, z: iz * c + nz * (hT + 0.01), nz };
    this.spawn = { x: c / 2, z: c / 2, yaw: Math.atan2(-(this.exit.x - c / 2), -(this.exit.z - c / 2)) + (rnd() - 0.5) * 2 };
    // malha animada da fenda
    const wp = getTex('wallpaper', this.Q.tex);
    this.riftMat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        { map: { value: wp.map }, uTime: { value: 0 }, uLight: { value: new THREE.Color(1, 1, 1) }, uRep: { value: (c - 0.2) / 1.2 } },
      ]),
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        #include <fog_pars_vertex>
        void main() {
          vUv = uv;
          vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D map;
        uniform float uTime;
        uniform vec3 uLight;
        uniform float uRep;
        varying vec2 vUv;
        #include <fog_pars_fragment>
        float h( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
        void main() {
          vec2 uv = vUv;
          float t = uTime;
          float tick = floor( t * 14.0 );
          float row = floor( uv.y * 46.0 );
          float g = step( 0.62, h( vec2( row, tick ) ) );
          uv.x += ( h( vec2( row, tick + 1.0 ) ) - 0.5 ) * 0.3 * g;
          vec3 wp = texture2D( map, vec2( uv.x * uRep, uv.y ) ).rgb * uLight;
          float cx = 0.5 + ( h( vec2( floor( uv.y * 26.0 ), floor( t * 5.0 ) ) ) - 0.5 ) * 0.07;
          float w = 0.035 + 0.02 * sin( uv.y * 17.0 + t * 2.3 );
          float slit = smoothstep( 0.05, 0.0, abs( uv.x - cx ) - w );
          vec3 col = mix( wp, vec3( 0.0 ), slit * 0.97 );
          col += vec3( h( vec2( row, t ) ), h( vec2( row + 3.0, t ) ), h( vec2( row + 7.0, t ) ) ) * g * 0.45 * uLight;
          col *= 0.85 + 0.3 * h( vec2( tick, 9.0 ) );
          float e = min( min( vUv.x, 1.0 - vUv.x ), min( vUv.y, 1.0 - vUv.y ) );
          gl_FragColor = vec4( col, smoothstep( 0.0, 0.07, e ) );
          #include <fog_fragment>
        }`,
      transparent: true,
      depthWrite: false,
      fog: true,
    });
    const geo = new THREE.PlaneGeometry(c - 0.2, this.H - 0.06);
    this.rift = new THREE.Mesh(geo, this.riftMat);
    this.rift.position.set(this.exit.x, this.H / 2, this.exit.z + nz * 0.004);
    this.rift.rotation.y = nz > 0 ? 0 : Math.PI;
    this.rift.renderOrder = 3;
    this.dynamic.add(this.rift);
  }

  onChunkBuilt() {
    if (this.riftLit) return;
    const ch = this.chunkAt(this.exit.x, this.exit.z + this.exit.nz * 0.5);
    if (!ch) return;
    const L = this.lightLevel(this.exit.x, this.exit.z + this.exit.nz * 0.5);
    this.riftMat.uniforms.uLight.value.setRGB(1, 0.93, 0.74).multiplyScalar(Math.min(2, L * 0.9 + 0.1));
    this.riftLit = true;
  }

  tick(dt, player) {
    this.riftMat.uniforms.uTime.value += dt;
    const dx = player.pos.x - this.exit.x;
    const dz = (player.pos.z - this.exit.z) * this.exit.nz;
    if (Math.abs(dx) < this.cell / 2 - 0.2 && dz > 0 && dz < 0.62) this.game.reachExit();
  }

  exitEmitter() {
    return { x: this.exit.x, y: 1.4, z: this.exit.z, sound: 'rift' };
  }
}
