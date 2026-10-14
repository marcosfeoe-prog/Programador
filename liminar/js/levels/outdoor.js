// Base dos níveis abertos (10 e 11): blocos gerados ao redor do jogador,
// céu procedural, sol com sombras que acompanham o jogador e colisão por AABB.
import * as THREE from 'three';
import { pushCircle } from './grid.js';

const now = () => performance.now();

export const SKY_GLSL = /* glsl */ `
float sHash( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
float sNoise( vec2 p ) {
  vec2 i = floor( p ); vec2 f = fract( p );
  f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( sHash( i ), sHash( i + vec2( 1.0, 0.0 ) ), f.x ), mix( sHash( i + vec2( 0.0, 1.0 ) ), sHash( i + vec2( 1.0, 1.0 ) ), f.x ), f.y );
}
float sFbm( vec2 p ) {
  float s = 0.0; float a = 0.5;
  for ( int i = 0; i < 5; i++ ) { s += sNoise( p ) * a; p = p * 2.03 + vec2( 17.1, 3.7 ); a *= 0.5; }
  return s;
}
`;

// Céu: gradiente, sol, nuvens em fBm projetadas num plano e horizonte na cor da neblina.
export function makeSky(o) {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uZenith: { value: new THREE.Color(...o.zenith) },
      uHorizon: { value: new THREE.Color(...o.horizon) },
      uGround: { value: new THREE.Color(...o.ground) },
      uFog: { value: new THREE.Color(...o.fog) },
      uSunDir: { value: o.sunDir.clone().normalize() },
      uSunColor: { value: new THREE.Color(...o.sunColor) },
      uSunDisk: { value: o.sunDisk || 0 },
      uCloudA: { value: new THREE.Color(...o.cloudA) },
      uCloudB: { value: new THREE.Color(...o.cloudB) },
      uCover: { value: o.cover },
      uTime: { value: 0 },
      uScale: { value: o.cloudScale || 1 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        vec4 p = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
        gl_Position = p.xyww;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uZenith, uHorizon, uGround, uFog, uSunDir, uSunColor, uCloudA, uCloudB;
      uniform float uSunDisk, uCover, uTime, uScale;
      varying vec3 vDir;
      ${SKY_GLSL}
      void main() {
        vec3 d = normalize( vDir );
        float h = d.y;
        vec3 col = mix( uHorizon, uZenith, pow( clamp( h, 0.0, 1.0 ), 0.45 ) );
        float sd = max( dot( d, uSunDir ), 0.0 );
        col += uSunColor * ( pow( sd, 6.0 ) * 0.35 + pow( sd, 48.0 ) * 0.8 );
        col += uSunColor * smoothstep( 0.99965, 0.99985, sd ) * uSunDisk;
        // nuvens
        vec2 cp = d.xz / max( h + 0.06, 0.02 ) * 0.35 * uScale + vec2( uTime * 0.004, uTime * 0.0017 );
        float n = sFbm( cp * 1.4 );
        float n2 = sFbm( cp * 4.0 + 3.0 );
        float a = smoothstep( uCover, uCover + 0.3, n + n2 * 0.18 ) * smoothstep( 0.0, 0.12, h );
        vec3 cc = mix( uCloudA, uCloudB, clamp( n2 * 1.2 + pow( sd, 3.0 ) * 0.8, 0.0, 1.0 ) );
        col = mix( col, cc, a );
        col = mix( uFog, col, smoothstep( -0.02, 0.16, h ) );
        col = mix( col, uGround, smoothstep( -0.02, -0.2, h ) );
        gl_FragColor = vec4( col, 1.0 );
      }`,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1000, 32, 16), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return mesh;
}

export class OutdoorLevel {
  constructor(game, cfg) {
    this.game = game;
    this.Q = game.Q;
    this.scene = game.scene;
    this.indoor = false;
    this.P = 72;
    this.camFar = 1800;
    this.walkSpeed = 2.4;
    this.flashIntensity = 10;
    Object.assign(this, cfg);
    this.chunks = new Map();
    this.building = null;
    this.taken = new Set();
    this.dynamic = new THREE.Group();
    this.scene.add(this.dynamic);
  }

  // Luz do céu + sol com sombras.
  setupLights(o) {
    this.hemi = new THREE.HemisphereLight(o.sky, o.ground, o.hemi);
    this.sun = new THREE.DirectionalLight(o.sunColor, o.sun);
    this.sunDir = o.sunDir.clone().normalize();
    const Q = this.Q;
    if (Q.shadows) {
      this.sun.castShadow = true;
      this.sun.shadow.mapSize.set(Q.shadowSize, Q.shadowSize);
      const e = o.shadowExtent || 50;
      const c = this.sun.shadow.camera;
      c.left = -e;
      c.right = e;
      c.top = e;
      c.bottom = -e;
      c.near = 1;
      c.far = o.shadowFar || 400;
      this.sun.shadow.bias = -0.0005;
      this.sun.shadow.normalBias = 0.04;
      this.sun.shadow.radius = 3;
      this.shadowExtent = e;
    }
    this.scene.add(this.hemi, this.sun, this.sun.target);
  }

  // O sol acompanha o jogador (alinhado aos texels do mapa de sombra).
  updateSun(p) {
    const d = this.shadowDist || 200;
    let x = p.x;
    let z = p.z;
    if (this.sun.castShadow) {
      const step = (this.shadowExtent * 2) / this.Q.shadowSize;
      x = Math.round(x / step) * step;
      z = Math.round(z / step) * step;
    }
    this.sun.target.position.set(x, 0, z);
    this.sun.position.set(x + this.sunDir.x * d, this.sunDir.y * d, z + this.sunDir.z * d);
    this.sun.target.updateMatrixWorld();
  }

  chunkKey(i, j) {
    return i * 100000 + j;
  }

  wantedChunks(px, pz) {
    const P = this.P;
    const view = this.Q.outdoorView;
    const R = Math.ceil(view / P);
    const pi = Math.floor(px / P);
    const pj = Math.floor(pz / P);
    const list = [];
    for (let dj = -R; dj <= R; dj++) {
      for (let di = -R; di <= R; di++) {
        const x0 = (pi + di) * P;
        const z0 = (pj + dj) * P;
        const dx = Math.max(x0 - px, 0, px - (x0 + P));
        const dz = Math.max(z0 - pz, 0, pz - (z0 + P));
        const d = Math.hypot(dx, dz);
        if (d <= view) list.push({ i: pi + di, j: pj + dj, d });
      }
    }
    list.sort((a, b) => a.d - b.d);
    return list;
  }

  async preload(px, pz, progress) {
    const list = this.wantedChunks(px, pz);
    let n = 0;
    for (const w of list) {
      if (!this.chunks.has(this.chunkKey(w.i, w.j))) {
        const g = this.buildChunk(w.i, w.j);
        let r = g.next();
        while (!r.done) r = g.next();
      }
      n++;
      if (progress) progress(n / list.length);
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  updateChunks(px, pz) {
    const list = this.wantedChunks(px, pz);
    const keep = new Set(list.map((w) => this.chunkKey(w.i, w.j)));
    for (const [k, ch] of this.chunks) {
      if (keep.has(k)) continue;
      const cx = (ch.i + 0.5) * this.P;
      const cz = (ch.j + 0.5) * this.P;
      if (Math.hypot(cx - px, cz - pz) > this.Q.outdoorView + this.P * 1.2) this.disposeChunk(ch);
    }
    const t0 = now();
    const budget = this.game.settings.mobile ? 5 : 8;
    while (now() - t0 < budget) {
      if (!this.building) {
        const next = list.find((w) => !this.chunks.has(this.chunkKey(w.i, w.j)));
        if (!next) break;
        this.building = this.buildChunk(next.i, next.j);
      }
      const r = this.building.next();
      if (r.done) this.building = null;
    }
  }

  *buildChunk(i, j) {
    const ch = { i, j, x0: i * this.P, z0: j * this.P, meshes: [], colliders: [], clears: [], items: [] };
    yield* this.genChunk(ch);
    // itens coletáveis definidos pelo nível (pilhas, bilhetes, água…)
    for (const it of ch.items) {
      if (this.taken.has(it.key)) continue;
      this.game.items.spawn(it, this.dynamic);
    }
    this.chunks.set(this.chunkKey(i, j), ch);
    if (this.onChunkBuilt) this.onChunkBuilt(ch);
  }

  addMesh(ch, geo, mat, { cast = true, receive = true } = {}) {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = cast && this.Q.shadows;
    m.receiveShadow = receive && this.Q.shadows;
    m.matrixAutoUpdate = false;
    m.updateMatrix();
    this.scene.add(m);
    ch.meshes.push(m);
    return m;
  }

  disposeChunk(ch) {
    for (const m of ch.meshes) {
      this.scene.remove(m);
      m.geometry.dispose();
    }
    for (const it of ch.items) {
      it.dead = true;
      if (it.mesh) this.dynamic.remove(it.mesh);
    }
    this.chunks.delete(this.chunkKey(ch.i, ch.j));
    if (this.onChunkDisposed) this.onChunkDisposed(ch);
  }

  dispose() {
    for (const ch of [...this.chunks.values()]) this.disposeChunk(ch);
    this.scene.remove(this.dynamic);
  }

  collide(p, r) {
    const P = this.P;
    const i0 = Math.floor((p.x - 3) / P);
    const i1 = Math.floor((p.x + 3) / P);
    const j0 = Math.floor((p.z - 3) / P);
    const j1 = Math.floor((p.z + 3) / P);
    for (let it = 0; it < 2; it++) {
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const ch = this.chunks.get(this.chunkKey(i, j));
          if (!ch) continue;
          for (const b of ch.colliders) pushCircle(p, r, b[0], b[1], b[2], b[3]);
        }
      }
    }
    return p;
  }

  los() {
    return true;
  }

  lightLevel() {
    return 1;
  }
}
