// Nível 177, Área 2 — o parque: um parquinho ao ar livre na calada da noite,
// tudo em tons azulados, a lua batendo nos brinquedos. Uma trilha entre as
// árvores leva 150 m até uma única casa com a luz acesa e a chaleira no fogo.
import * as THREE from 'three';
import { OutdoorLevel, makeSky } from './outdoor.js';
import { pushCircle } from './grid.js';
import { getTex } from '../textures.js';
import { clamp, hash3, mulberry32, smoothstep, TAU } from '../util.js';
import { music, preloadTrack, rememberTrack, TRACK_A, dotTex, grassTex, bladeTex, GrassTufts, Puffs, kettle, buildHouse } from './level177_common.js';

const TRAIL_Z0 = -30; // começo da trilha
const HOUSE_Z = -183; // casa (150 m de trilha)

export function trailX(z) {
  return 7 * Math.sin(z * 0.03) + 3 * Math.sin(z * 0.07 + 1);
}
const TRAIL_GLSL = /* glsl */ `
float trailX( float z ) { return 7.0 * sin( z * 0.03 ) + 3.0 * sin( z * 0.07 + 1.0 ); }
`;

function groundH(x, z) {
  const h = 0.35 * Math.sin(x * 0.07 + z * 0.05) + 0.25 * Math.sin(z * 0.11 - x * 0.04);
  return h * smoothstep(-26, -40, z);
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();
const _c = new THREE.Color();

// Árvore escura: tronco e copa de bolhas (cor por vértice).
function treeGeometry(seed) {
  const r = mulberry32(seed);
  const parts = [];
  const H = 4.5 + r() * 2;
  const trunk = new THREE.CylinderGeometry(0.14, 0.26, H, 7).translate(0, H / 2, 0).toNonIndexed();
  parts.push([trunk, [0.12, 0.1, 0.1]]);
  for (let k = 0; k < 5; k++) {
    const R = 1.3 + r() * 0.9;
    const a = r() * TAU;
    const o = k === 0 ? 0 : 1.1;
    const g = new THREE.IcosahedronGeometry(R, 1).translate(Math.cos(a) * o, H + (k === 0 ? 0.8 : r() * 0.8 - 0.2), Math.sin(a) * o);
    parts.push([g, [0.1 + r() * 0.05, 0.2 + r() * 0.08, 0.16 + r() * 0.05]]);
  }
  const pos = [];
  const nor = [];
  const col = [];
  for (const [g, c] of parts) {
    const P = g.attributes.position;
    const N = g.attributes.normal;
    for (let i = 0; i < P.count; i++) {
      pos.push(P.getX(i), P.getY(i), P.getZ(i));
      nor.push(N.getX(i), N.getY(i), N.getZ(i));
      const k = 0.55 + 0.45 * clamp(N.getY(i) * 0.5 + 0.5, 0, 1);
      col.push(c[0] * k, c[1] * k, c[2] * k);
    }
    g.dispose();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeBoundingSphere();
  return g;
}

export class Level177Park extends OutdoorLevel {
  constructor(game) {
    super(game, { P: 100, walkSpeed: 2.2, camFar: 1500 });
    this.num = 177;
    this.seed = (game.seed ^ 0x1772) >>> 0;
    this.time = 0;
    this.colliders = [];
    this.circles = [];
    this.geos = [];
    this.mats = [];
    this.anims = [];
    this.look = {
      exposure: 1.1,
      tint: [0.88, 0.96, 1.14],
      sat: 0.85,
      contrast: 1.08,
      lift: [0.01, 0.015, 0.035],
      bloom: 0.3,
      bloomThreshold: 0.9,
      fog: [0.05, 0.08, 0.15],
      lightColor: [1, 1, 1],
      flashlight: false,
      ambience: 'level177_2',
      reverb: 1.0,
      sanityDrain: 0.04,
    };
    this.objectives = [
      { id: 'trilha', text: 'Ache a trilha e siga até o fim (150 m)' },
      { id: 'casa', text: 'Entre na casa com a luz acesa' },
    ];
    const fogC = new THREE.Color(...this.look.fog);
    this.scene.fog = new THREE.FogExp2(fogC, 0.022);
    this.scene.background = fogC;
    this.sky = makeSky({
      zenith: [0.01, 0.02, 0.06],
      horizon: [0.07, 0.11, 0.22],
      ground: [0.02, 0.03, 0.05],
      fog: this.look.fog,
      sunDir: new THREE.Vector3(-0.35, 0.42, -0.84),
      sunColor: [0.85, 0.92, 1.15],
      sunDisk: 2.4,
      cloudA: [0.03, 0.05, 0.1],
      cloudB: [0.2, 0.26, 0.38],
      cover: 0.55,
    });
    this.scene.add(this.sky);
    this.setupLights({
      sky: 0x5a78c0,
      ground: 0x0c1428,
      hemi: 0.75,
      sunColor: 0xa8c0ff,
      sun: 1.5,
      sunDir: new THREE.Vector3(-0.35, 0.5, -0.8),
      shadowExtent: 30,
    });
    this.spawn = { x: 0, z: 12, yaw: 0 };
    this.house = { x: trailX(HOUSE_Z), z: HOUSE_Z, w: 6, d: 6.5, rot: 0, y: groundH(trailX(HOUSE_Z), HOUSE_Z), color: [0.78, 0.74, 0.68], lit: true };
    this.exit = { x: this.house.x, z: HOUSE_Z + 1 };
  }

  mat(m) {
    this.mats.push(m);
    return m;
  }

  mesh(geo, mat, x, y, z, parent = this.dynamic) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = this.Q.shadows;
    m.receiveShadow = this.Q.shadows;
    this.geos.push(geo);
    parent.add(m);
    return m;
  }

  walkable(x, z) {
    if (z > TRAIL_Z0 + 2) return Math.abs(x) < 40 && z < 34;
    return Math.abs(x - trailX(z)) < 9 && z > HOUSE_Z - 8;
  }

  async preload(px, pz, progress) {
    await preloadTrack(this.game, TRACK_A);
    progress(0.2);
    this.makeGround();
    this.makeStars();
    progress(0.4);
    await new Promise((r) => setTimeout(r, 0));
    this.makePlayground();
    this.makeTrees();
    progress(0.7);
    this.makeHouse();
    const bl = bladeTex(195, 230, 8, 34, 9);
    this.tufts = new GrassTufts(this, bl, this.Q.id === 'low' ? 14 : 20, 0.38);
    this.bladeMap = bl;
    this.tufts.refresh(px, pz, groundH, (x, z) => this.onSand(x, z) || this.onTrail(x, z) || this.house.inside(x, z, -0.6));
    this.updateSun({ x: px, z: pz });
    progress(1);
  }

  onSand(x, z) {
    return Math.hypot(x, (z + 10) * 1.15) < 17;
  }

  onTrail(x, z) {
    return z < TRAIL_Z0 + 3 && z > HOUSE_Z + 2 && Math.abs(x - trailX(z)) < 1.4;
  }

  makeGround() {
    const Q = this.Q;
    const geo = new THREE.PlaneGeometry(200, 300, Q.id === 'low' ? 60 : 100, Q.id === 'low' ? 90 : 150);
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, 0, -90);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, groundH(p.getX(i), p.getZ(i)));
    geo.computeVertexNormals();
    this.geos.push(geo);
    this.grassMap = grassTex(Math.min(1024, Q.tex), '#1a2a3a', 190, 230, 10, 30, 177);
    const path = getTex('pathDirt', Q.tex);
    const mat = this.mat(new THREE.MeshStandardMaterial({ map: this.grassMap, roughness: 0.95 }));
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uPath = { value: path.map };
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nuniform sampler2D uPath;\n' + TRAIL_GLSL)
        .replace(
          '#include <map_fragment>',
          `vec2 w = vWPos.xz;
          vec3 gC = texture2D( map, w * 0.22 ).rgb;
          vec3 pC = texture2D( uPath, w * 0.3 ).rgb * vec3( 0.95, 1.0, 1.15 );
          vec3 sC = texture2D( uPath, w * 0.5 ).rgb * vec3( 1.05, 1.0, 0.95 );
          float d = abs( w.x - trailX( w.y ) );
          float edge = 1.25 + ( texture2D( map, w * 0.07 ).g - 0.15 ) * 1.2;
          float t = ( 1.0 - smoothstep( edge - 0.3, edge + 0.3, d ) ) * ( 1.0 - smoothstep( ${TRAIL_Z0 + 1}.0, ${TRAIL_Z0 + 5}.0, w.y ) );
          float sand = 1.0 - smoothstep( 16.0, 17.5, length( vec2( w.x, ( w.y + 10.0 ) * 1.15 ) ) );
          vec3 c = mix( gC, pC, t );
          c = mix( c, sC, sand );
          diffuseColor.rgb *= c;`,
        );
    };
    this.ground = new THREE.Mesh(geo, mat);
    this.ground.receiveShadow = Q.shadows;
    this.scene.add(this.ground);
  }

  makeStars() {
    const r = mulberry32(31);
    const n = 900;
    const p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = r() * TAU;
      const y = 0.08 + r() * 0.92;
      const k = Math.sqrt(1 - y * y);
      p.set([Math.cos(a) * k * 800, y * 800, Math.sin(a) * k * 800], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    this.geos.push(g);
    this.dot = dotTex();
    this.starMat = this.mat(new THREE.PointsMaterial({ map: this.dot, color: 0xdde6ff, size: 2.2, sizeAttenuation: false, transparent: true, depthWrite: false, fog: false }));
    this.stars = new THREE.Points(g, this.starMat);
    this.stars.frustumCulled = false;
    this.stars.renderOrder = -9;
    this.scene.add(this.stars);
  }

  // ------------------------------------------------------------ parquinho
  makePlayground() {
    const red = this.mat(new THREE.MeshStandardMaterial({ color: 0xb04040, roughness: 0.6, metalness: 0.2 }));
    const blue = this.mat(new THREE.MeshStandardMaterial({ color: 0x4060b0, roughness: 0.6, metalness: 0.2 }));
    const yellow = this.mat(new THREE.MeshStandardMaterial({ color: 0xc8a040, roughness: 0.6, metalness: 0.2 }));
    const metal = this.mat(new THREE.MeshStandardMaterial({ color: 0x9aa0a8, roughness: 0.4, metalness: 0.7 }));
    const wood = this.mat(new THREE.MeshStandardMaterial({ color: 0x6a4a34, roughness: 0.85 }));
    const dark = this.mat(new THREE.MeshStandardMaterial({ color: 0x202226, roughness: 0.6 }));
    const cyl = (r, h, s = 8) => new THREE.CylinderGeometry(r, r, h, s);
    const box = (a, b, c) => new THREE.BoxGeometry(a, b, c);
    const solid = (x, z, hx, hz) => this.colliders.push([x - hx, x + hx, z - hz, z + hz]);
    // balanço
    {
      const x = -8;
      const z = -6;
      for (const s of [-1, 1])
        for (const f of [-1, 1]) {
          const leg = this.mesh(cyl(0.05, 2.9), red, x + s * 1.7, 1.35, z + f * 0.5);
          leg.rotation.x = f * 0.35;
          solid(x + s * 1.7, z, 0.08, 0.6);
        }
      const top = this.mesh(cyl(0.06, 3.6), red, x, 2.72, z);
      top.rotation.z = Math.PI / 2;
      [-0.7, 0.7].forEach((sx, i) => {
        const piv = new THREE.Group();
        piv.position.set(x + sx, 2.7, z);
        this.dynamic.add(piv);
        for (const cx of [-0.22, 0.22]) this.mesh(cyl(0.01, 2.1, 4), metal, cx, -1.05, 0, piv);
        this.mesh(box(0.55, 0.05, 0.24), dark, 0, -2.1, 0, piv);
        const amp = i ? 0.06 : 0.32;
        this.anims.push((t) => (piv.rotation.x = Math.sin(t * 1.25 + i) * amp));
      });
      this.swingPos = { x, z };
    }
    // escorregador
    {
      const x = 7;
      const z = -4;
      for (const [ax, az] of [
        [-0.4, -0.4],
        [0.4, -0.4],
        [-0.4, 0.4],
        [0.4, 0.4],
      ])
        this.mesh(cyl(0.05, 2.0), yellow, x + ax, 1.0, z + az);
      this.mesh(box(1.0, 0.08, 1.0), blue, x, 2.0, z);
      for (let k = 0; k < 6; k++) this.mesh(box(0.8, 0.04, 0.06), metal, x, 0.3 + k * 0.3, z + 0.55);
      const ch = this.mesh(box(0.7, 0.05, 3.4), red, x, 1.05, z - 2.0);
      ch.rotation.x = -0.62;
      for (const s of [-1, 1]) {
        const rail = this.mesh(box(0.05, 0.18, 3.4), red, x + s * 0.36, 1.15, z - 2.0);
        rail.rotation.x = -0.62;
      }
      solid(x, z, 0.55, 0.55);
    }
    // gangorra
    {
      const x = -3;
      const z = -17;
      this.mesh(box(0.3, 0.5, 0.3), metal, x, 0.25, z);
      const plank = this.mesh(box(3.6, 0.08, 0.3), blue, x, 0.5, z);
      plank.rotation.z = 0.22;
      for (const s of [-1, 1]) {
        const hd = this.mesh(cyl(0.025, 0.4), metal, 0, 0, 0, plank);
        hd.position.set(s * 1.4, 0.2, 0);
      }
      solid(x, z, 0.25, 0.25);
    }
    // gira-gira (rodando sozinho, devagar)
    {
      const x = 9;
      const z = -17;
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      this.dynamic.add(g);
      this.mesh(cyl(1.4, 0.1, 24), red, 0, 0.3, 0, g);
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * TAU;
        const bar = this.mesh(cyl(0.025, 0.6), yellow, Math.cos(a) * 0.9, 0.62, Math.sin(a) * 0.9, g);
        bar.rotation.set(0, 0, 0);
      }
      this.mesh(cyl(0.05, 0.9), metal, 0, 0.75, 0, g);
      this.anims.push((t) => (g.rotation.y = t * 0.25));
      this.circles.push([x, z, 1.45]);
    }
    // caixa de areia com um baldinho esquecido
    {
      const x = -11;
      const z = -18;
      for (const [ax, az, sx, sz] of [
        [0, -1.5, 3.2, 0.15],
        [0, 1.5, 3.2, 0.15],
        [-1.5, 0, 0.15, 3.2],
        [1.5, 0, 0.15, 3.2],
      ])
        this.mesh(box(sx, 0.25, sz), wood, x + ax, 0.12, z + az);
      this.mesh(new THREE.CylinderGeometry(0.12, 0.09, 0.18, 12), yellow, x + 0.5, 0.09, z + 0.3);
    }
    // bancos e postes
    for (const [x, z, ry] of [
      [-16, 2, Math.PI / 2],
      [16, -8, -Math.PI / 2],
      [0, 8, Math.PI],
    ]) {
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      g.rotation.y = ry;
      this.dynamic.add(g);
      for (let k = 0; k < 3; k++) this.mesh(box(1.8, 0.04, 0.12), wood, 0, 0.45, -0.15 + k * 0.15, g);
      for (let k = 0; k < 2; k++) this.mesh(box(1.8, 0.1, 0.04), wood, 0, 0.7 + k * 0.15, 0.25, g);
      for (const s of [-1, 1]) this.mesh(box(0.06, 0.45, 0.5), metal, s * 0.8, 0.22, 0, g);
      solid(x, z, Math.abs(Math.sin(ry)) > 0.5 ? 0.35 : 0.95, Math.abs(Math.sin(ry)) > 0.5 ? 0.95 : 0.35);
    }
    this.bulbMat = this.mat(new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.7, 2.0) }));
    this.lamps = [];
    for (const [x, z, k] of [
      [-14, -12, 0],
      [14, 3, 1],
    ]) {
      this.mesh(cyl(0.06, 4.2), dark, x, 2.1, z);
      const arm = this.mesh(box(0.8, 0.05, 0.05), dark, x + 0.35, 4.15, z);
      arm.castShadow = false;
      this.mesh(new THREE.SphereGeometry(0.16, 12, 8), this.bulbMat, x + 0.7, 4.0, z);
      const l = new THREE.PointLight(0xc8d8ff, 9, 16, 1.5);
      l.position.set(x + 0.7, 3.9, z);
      this.dynamic.add(l);
      this.lamps.push({ l, k });
      solid(x, z, 0.08, 0.08);
    }
  }

  makeTrees() {
    const r = mulberry32(this.seed + 5);
    const list = [];
    for (let i = 0; i < 1400 && list.length < 520; i++) {
      const x = (r() - 0.5) * 190;
      const z = 38 - r() * 245;
      const inPark = z > TRAIL_Z0 - 4 && Math.abs(x) < 34 && z < 30;
      if (inPark) continue;
      if (z < TRAIL_Z0 && Math.abs(x - trailX(z)) < 3.5 + r() * 2) continue;
      if (Math.abs(x - this.house.x) < 9 && Math.abs(z - HOUSE_Z) < 9) continue;
      list.push({ x, z, s: 0.8 + r() * 0.5, rot: r() * TAU, v: Math.floor(r() * 3) });
    }
    this.treeList = list;
    this.treeGeo = [0, 1, 2].map((i) => treeGeometry(300 + i * 11));
    this.treeMat = this.mat(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }));
    this.treeMeshes = this.treeGeo.map((g, i) => {
      const own = list.filter((t) => t.v === i);
      const m = new THREE.InstancedMesh(g, this.treeMat, Math.max(1, own.length));
      own.forEach((t, k) => {
        _m.compose(_v.set(t.x, groundH(t.x, t.z) - 0.1, t.z), _q.setFromEuler(_e.set(0, t.rot, 0)), _s.setScalar(t.s));
        m.setMatrixAt(k, _m);
        m.setColorAt(k, _c.setRGB(0.85 + hash3(k, i, 1) * 0.3, 0.9, 0.95 + hash3(k, i, 2) * 0.2));
        this.circles.push([t.x, t.z, 0.25 * t.s]);
      });
      m.count = own.length;
      m.castShadow = this.Q.shadows;
      m.receiveShadow = this.Q.shadows;
      this.scene.add(m);
      return m;
    });
    this.geos.push(...this.treeGeo);
  }

  // A casa no fim da trilha: luz acesa, porta aberta, chaleira chiando.
  makeHouse() {
    const h = buildHouse(this.house, this.colliders, this.Q.tex);
    this.dynamic.add(h.group);
    h.mesh.castShadow = h.mesh.receiveShadow = this.Q.shadows;
    const fl = h.floor;
    const wood = this.mat(new THREE.MeshStandardMaterial({ color: 0x5a3e2c, roughness: 0.8 }));
    const iron = this.mat(new THREE.MeshStandardMaterial({ color: 0x2a2a2e, roughness: 0.5, metalness: 0.5 }));
    // fogão a lenha, mesa e cadeira
    const sx = h.x - 1.6;
    const sz = h.z - 2.2;
    this.mesh(new THREE.BoxGeometry(0.9, 0.8, 0.6), iron, sx, fl + 0.4, sz);
    this.mesh(new THREE.BoxGeometry(0.5, 0.25, 0.02), this.mat(new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 0.9, 0.3) })), sx, fl + 0.3, sz + 0.31);
    const k = kettle(this.dynamic, sx - 0.1, fl + 0.8, sz);
    this.mats.push(...k.userData.mats);
    this.mesh(new THREE.BoxGeometry(1.2, 0.05, 0.8), wood, h.x + 1.0, fl + 0.75, h.z - 0.5);
    for (const [ax, az] of [
      [-0.55, -0.35],
      [0.55, -0.35],
      [-0.55, 0.35],
      [0.55, 0.35],
    ])
      this.mesh(new THREE.BoxGeometry(0.05, 0.75, 0.05), wood, h.x + 1.0 + ax, fl + 0.375, h.z - 0.5 + az);
    this.mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.12, 10), this.mat(new THREE.MeshStandardMaterial({ color: 0xf0ece4 })), h.x + 0.8, fl + 0.83, h.z - 0.4);
    this.houseLight = new THREE.PointLight(0xffb060, 14, 12, 1.4);
    this.houseLight.position.set(h.x, fl + 2.2, h.z);
    this.dynamic.add(this.houseLight);
    const porch = new THREE.PointLight(0xffc880, 4, 7, 1.6);
    porch.position.set(h.x, fl + 2.4, h.z + h.d / 2 + 0.6);
    this.dynamic.add(porch);
    this.steam = new Puffs(this.dynamic, this.dot, { n: 12, size: 0.07, grow: 1.0, rise: 0.35, life: 2.4, spread: 0.03, opacity: 0.55, color: 0xeef2ff });
    this.steam.origin.copy(k.userData.spout);
    this.smoke = new Puffs(this.dynamic, this.dot, { n: 16, size: 0.5, grow: 1.6, rise: 0.8, life: 5, spread: 0.3, opacity: 0.35, color: 0x8890a0 });
    this.smoke.origin.copy(h.chimneyTop);
  }

  // ------------------------------------------------------------ quadro
  update(dt, player) {
    const g = this.game;
    const p = player.pos;
    this.time += dt;
    const t = this.time;
    const cam = g.camera.position;
    this.sky.position.copy(cam);
    this.sky.material.uniforms.uTime.value = t;
    this.stars.position.copy(cam);
    this.updateSun(p);
    if (!this.lastP || Math.hypot(p.x - this.lastP.x, p.z - this.lastP.z) > 2.5) {
      this.lastP = { x: p.x, z: p.z };
      this.tufts.refresh(p.x, p.z, groundH, (x, z) => this.onSand(x, z) || this.onTrail(x, z) || this.house.inside(x, z, -0.6));
    }
    for (const a of this.anims) a(t);
    for (const L of this.lamps) L.l.intensity = L.k ? (Math.sin(t * 17) > 0.6 && Math.sin(t * 2.3) > 0.4 ? 1 : 9) : 9;
    this.steam.update(dt);
    this.smoke.update(dt);
    // a música vai ficando mais lenta e distorcida pela trilha
    const tr = music(this, TRACK_A, 0.55);
    const k = clamp((8 - p.z) / 190, 0, 1);
    if (tr && (this.musT = (this.musT || 0) + dt) > 0.4) {
      this.musT = 0;
      tr.setRate(1 - 0.14 * k - 0.03, 0.8);
      tr.setFx(0.15 + 0.4 * k, 0.8);
    }
    // falas
    if (t > 2.5 && !this.said.has('a')) this.say('a', ['Esse parque… eu brincava num parque igualzinho a esse.', 'O balanço ainda range do mesmo jeito.', 'Mãe? Pai?… Não tem ninguém. Só a lua.']);
    if (Math.hypot(p.x - this.swingPos.x, p.z - this.swingPos.z) < 4) this.say('b', ['Meu pai me empurrava aqui. “Mais alto, mais alto!”', 'Por que eu lembro disso agora?']);
    if (p.z < TRAIL_Z0 + 2) {
      this.say('c', ['Uma trilha entre as árvores. E lá no fundo… uma luz acesa.']);
      if (!g.objectiveDone('trilha')) g.completeObjective('trilha', 'A trilha entra no bosque. Lá no fim, uma janela acesa.');
    }
    const h = this.house;
    const dh = Math.hypot(p.x - h.x, p.z - (h.z + h.d / 2));
    if (dh < 14) this.say('d', ['Cheiro de chá. Alguém deixou a chaleira no fogo.', 'Essa casa… eu conheço essa casa.']);
    if (h.inside(p.x, p.z, 0.3) && !this.leaving) {
      this.leaving = true;
      if (!g.objectiveDone('trilha')) g.completeObjective('trilha');
      g.completeObjective('casa', 'Lá dentro, só a chaleira chiando. Você pisca — e a casa não está mais lá.');
      g.enterLevel('177.3', 'none', 0.6);
    }
  }

  get said() {
    if (!this._said) this._said = new Set();
    return this._said;
  }

  say(id, lines) {
    const g = this.game;
    if (this.said.has(id) || g.hud.dlg) return false;
    this.said.add(id);
    g.hud.say(lines);
    return true;
  }

  collide(p, r) {
    if (!this.walkable(p.x, p.z)) {
      const o = this.okP || this.spawn;
      if (this.walkable(p.x, o.z)) p.z = o.z;
      else if (this.walkable(o.x, p.z)) p.x = o.x;
      else {
        p.x = o.x;
        p.z = o.z;
      }
    }
    for (let it = 0; it < 2; it++) {
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
      for (const b of this.colliders) if (p.x > b[0] - 2 && p.x < b[1] + 2 && p.z > b[2] - 2 && p.z < b[3] + 2) pushCircle(p, r, b[0], b[1], b[2], b[3]);
    }
    this.okP = { x: p.x, z: p.z };
    return p;
  }

  groundY(x, z) {
    if (this.house.inside && this.house.inside(x, z, -0.1)) return this.house.floor;
    return groundH(x, z);
  }

  surfaceAt(x, z) {
    if (this.house.inside && this.house.inside(x, z, -0.1)) return 'wood';
    if (this.onTrail(x, z) || this.onSand(x, z)) return 'dirt';
    return 'grass';
  }

  los() {
    return true;
  }

  lightLevel() {
    return 0.55;
  }

  interactable() {
    return null;
  }

  navTarget() {
    return this.game.objectiveDone('trilha') ? this.exit : { x: trailX(TRAIL_Z0 - 2), z: TRAIL_Z0 - 2 };
  }

  exitEmitter() {
    return { x: this.house.x, y: 1.2, z: this.house.z, sound: 'steam', gain: 0.12 };
  }

  dispose() {
    rememberTrack(this);
    this.steam.dispose();
    this.smoke.dispose();
    this.tufts.dispose();
    this.house.dispose();
    super.dispose();
    for (const o of [this.sky, this.ground, this.stars, ...this.treeMeshes]) {
      this.scene.remove(o);
      if (o.isInstancedMesh) o.dispose();
    }
    this.sky.geometry.dispose();
    this.sky.material.dispose();
    for (const x of this.geos) x.dispose();
    for (const m of this.mats) m.dispose();
    for (const t of [this.grassMap, this.bladeMap, this.dot]) t.dispose();
    this.scene.remove(this.hemi, this.sun, this.sun.target);
  }
}
