// Frontrooms — "A Terra": o ponto de partida. Uma casa simples no meio de uma
// floresta, numa tarde comum: pássaros, sol baixo, móveis, uma TV desligada.
// Dentro da casa, numa das paredes, uma falha — um rasgo tremulando que mostra
// papel de parede amarelo por trás. Atravessá-la leva ao Nível 0.
import * as THREE from 'three';
import { OutdoorLevel, makeSky } from './outdoor.js';
import { pushCircle } from './grid.js';
import { getTex } from '../textures.js';
import { clamp, mulberry32, TAU } from '../util.js';
import { buildHouse, dotTex, grassTex, bladeTex, GrassTufts, Puffs } from './level177_common.js';
import { forestTree } from './level177_fog.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();

function groundH(x, z) {
  const d = Math.hypot(x, z + 4);
  const k = clamp((d - 9) / 14, 0, 1);
  return k * (0.5 * Math.sin(x * 0.08 + 1) * Math.sin(z * 0.07) + 0.25 * Math.sin(x * 0.17 - z * 0.13));
}

// Rasgo na parede: ruído, faixas e o amarelo dos bastidores aparecendo.
const RIFT_FRAG = /* glsl */ `
  uniform float uTime;
  uniform sampler2D uMap;
  varying vec2 vUv;
  float h( vec2 p ) { return fract( sin( dot( p, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 ); }
  void main() {
    vec2 uv = vUv;
    float t = floor( uTime * 14.0 );
    // borda irregular e tremida
    float y = floor( uv.y * 40.0 );
    float shift = ( h( vec2( y, t ) ) - 0.5 ) * 0.12;
    vec2 c = uv - 0.5;
    float edge = 0.42 + 0.06 * sin( uv.y * 31.0 + uTime * 3.0 ) + shift;
    float r = abs( c.x ) * 1.6 + abs( c.y ) * 0.55;
    if ( r > edge ) discard;
    vec3 wp = texture2D( uMap, vec2( uv.x * 1.5 + shift, uv.y * 2.0 ) ).rgb * vec3( 1.25, 1.18, 0.8 );
    float n = h( floor( uv * vec2( 60.0, 90.0 ) ) + t );
    float band = step( 0.85, h( vec2( y, t * 0.37 ) ) );
    vec3 col = mix( wp, vec3( n ), band * 0.8 );
    col = mix( col, vec3( 0.0 ), smoothstep( edge - 0.05, edge, r ) * 0.7 );
    col.r += step( 0.92, h( vec2( y + 3.0, t ) ) ) * 0.6;
    col.b += step( 0.94, h( vec2( y + 7.0, t ) ) ) * 0.6;
    gl_FragColor = vec4( col * 1.4, 1.0 );
  }`;

export class LevelFR extends OutdoorLevel {
  constructor(game) {
    super(game, { P: 100, walkSpeed: 2.1, camFar: 1500 });
    this.num = 0;
    this.time = 0;
    this.colliders = [];
    this.circles = [];
    this.geos = [];
    this.mats = [];
    this.texs = [];
    this.look = {
      exposure: 1.02,
      tint: [1.04, 1.0, 0.94],
      sat: 1.05,
      contrast: 1.04,
      lift: [0.015, 0.012, 0.01],
      bloom: 0.22,
      bloomThreshold: 1.0,
      fog: [0.88, 0.8, 0.68],
      lightColor: [1, 1, 1],
      flashlight: false,
      ambience: 'levelFR',
      reverb: 0.7,
      sanityDrain: 0,
    };
    this.objectives = [
      { id: 'casa', text: 'Entre em casa' },
      { id: 'falha', text: 'Investigue a parede' },
    ];
    const fogC = new THREE.Color(...this.look.fog);
    this.scene.fog = new THREE.FogExp2(fogC, 0.014);
    this.scene.background = fogC;
    this.sky = makeSky({
      zenith: [0.36, 0.52, 0.8],
      horizon: [0.98, 0.82, 0.62],
      ground: [0.3, 0.26, 0.2],
      fog: this.look.fog,
      sunDir: new THREE.Vector3(0.7, 0.25, -0.65),
      sunColor: [1.4, 1.05, 0.7],
      sunDisk: 1.5,
      cloudA: [0.75, 0.62, 0.6],
      cloudB: [1.0, 0.92, 0.82],
      cover: 0.5,
    });
    this.scene.add(this.sky);
    this.setupLights({
      sky: 0xffe8cc,
      ground: 0x485a30,
      hemi: 1.35,
      sunColor: 0xffd0a0,
      sun: 2.2,
      sunDir: new THREE.Vector3(0.7, 0.45, -0.55),
      shadowExtent: 30,
    });
    this.house = { x: 0, z: -12, w: 7.5, d: 7, rot: 0, y: 0, color: [0.9, 0.86, 0.78], roof: [0.42, 0.24, 0.2], lit: true, chimney: true };
    this.spawn = { x: 1.5, z: 6, yaw: 0.05 };
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

  async preload(px, pz, progress) {
    progress(0.2);
    this.makeGround();
    this.makeHouse();
    progress(0.5);
    await new Promise((r) => setTimeout(r, 0));
    this.makeForest();
    const bl = bladeTex(70, 110, 22, 55, 77);
    this.texs.push(bl);
    this.tufts = new GrassTufts(this, bl, this.Q.id === 'low' ? 14 : 20, 0.36);
    this.refreshTufts(px, pz);
    this.updateSun({ x: px, z: pz });
    progress(1);
  }

  refreshTufts(px, pz) {
    const h = this.house;
    this.tufts.refresh(px, pz, groundH, (x, z) => (Math.abs(x - h.x) < h.hx + 0.6 && Math.abs(z - h.z) < h.hz + 1.4) || (Math.abs(x) < 0.8 && z > h.z && z < 9));
  }

  makeGround() {
    const Q = this.Q;
    const geo = new THREE.PlaneGeometry(260, 260, 90, 90);
    geo.rotateX(-Math.PI / 2);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, groundH(p.getX(i), p.getZ(i)));
    geo.computeVertexNormals();
    this.geos.push(geo);
    const map = grassTex(Math.min(1024, Q.tex), '#5a7a30', 70, 110, 28, 50, 2001);
    map.repeat.set(52, 52);
    this.texs.push(map);
    this.ground = new THREE.Mesh(geo, this.mat(new THREE.MeshStandardMaterial({ map, roughness: 0.95 })));
    this.ground.receiveShadow = Q.shadows;
    this.scene.add(this.ground);
    // caminho de terra até a porta
    const dirt = getTex('pathDirt', Q.tex).map.clone();
    dirt.needsUpdate = true;
    dirt.repeat.set(1, 6);
    this.texs.push(dirt);
    const pg = new THREE.PlaneGeometry(1.4, 14);
    pg.rotateX(-Math.PI / 2);
    this.geos.push(pg);
    const path = new THREE.Mesh(pg, this.mat(new THREE.MeshStandardMaterial({ map: dirt, roughness: 1, color: 0x9a8a76 })));
    path.position.set(0, 0.02, 1.2);
    path.receiveShadow = Q.shadows;
    this.scene.add(path);
    this.path = path;
  }

  makeHouse() {
    const h = buildHouse(this.house, this.colliders, this.Q.tex);
    h.mesh.castShadow = h.mesh.receiveShadow = this.Q.shadows;
    h.roofMesh.castShadow = this.Q.shadows;
    this.dynamic.add(h.group);
    const f = h.floor;
    const wood = this.mat(new THREE.MeshStandardMaterial({ color: 0x6a4a34, roughness: 0.8 }));
    const fabric = this.mat(new THREE.MeshStandardMaterial({ color: 0x6a7a5a, roughness: 0.95 }));
    const rugM = this.mat(new THREE.MeshStandardMaterial({ color: 0x8a3a2e, roughness: 1 }));
    const dark = this.mat(new THREE.MeshStandardMaterial({ color: 0x1a1a1c, roughness: 0.4 }));
    const solid = (x, z, hx, hz) => this.colliders.push([x - hx, x + hx, z - hz, z + hz]);
    const X = h.x;
    const Z = h.z;
    // tapete, sofá, mesinha, estante com TV, mesa de jantar e um abajur
    const rug = this.mesh(new THREE.BoxGeometry(2.6, 0.01, 1.8), rugM, X - 0.6, f + 0.005, Z + 0.6);
    rug.castShadow = false;
    this.mesh(new THREE.BoxGeometry(2.2, 0.42, 0.85), fabric, X - 0.6, f + 0.21, Z + 2.25);
    this.mesh(new THREE.BoxGeometry(2.2, 0.55, 0.2), fabric, X - 0.6, f + 0.6, Z + 2.62);
    for (const s of [-1, 1]) this.mesh(new THREE.BoxGeometry(0.2, 0.6, 0.85), fabric, X - 0.6 + s * 1.1, f + 0.3, Z + 2.25);
    solid(X - 0.6, Z + 2.3, 1.2, 0.48);
    this.mesh(new THREE.BoxGeometry(1.0, 0.4, 0.55), wood, X - 0.6, f + 0.2, Z + 0.9);
    solid(X - 0.6, Z + 0.9, 0.5, 0.28);
    this.mesh(new THREE.BoxGeometry(1.6, 0.55, 0.45), wood, X - 0.6, f + 0.28, Z - 0.9);
    this.mesh(new THREE.BoxGeometry(1.05, 0.65, 0.08), dark, X - 0.6, f + 0.9, Z - 0.9);
    solid(X - 0.6, Z - 0.9, 0.8, 0.23);
    // mesa de jantar
    const tx = X + 2.2;
    const tz = Z + 1.2;
    this.mesh(new THREE.BoxGeometry(1.1, 0.05, 1.6), wood, tx, f + 0.75, tz);
    for (const [ax, az] of [
      [-0.5, -0.75],
      [0.5, -0.75],
      [-0.5, 0.75],
      [0.5, 0.75],
    ])
      this.mesh(new THREE.BoxGeometry(0.05, 0.75, 0.05), wood, tx + ax, f + 0.375, tz + az);
    this.mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.1, 10), this.mat(new THREE.MeshStandardMaterial({ color: 0xf2eee6 })), tx - 0.2, f + 0.82, tz + 0.3);
    solid(tx, tz, 0.58, 0.82);
    // abajur aceso
    this.mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.4, 6), dark, X - 2.9, f + 0.7, Z + 2.6);
    this.mesh(new THREE.CylinderGeometry(0.16, 0.24, 0.3, 14, 1, true), this.mat(new THREE.MeshBasicMaterial({ color: new THREE.Color(1.8, 1.4, 0.9), side: THREE.DoubleSide })), X - 2.9, f + 1.45, Z + 2.6);
    const lamp = new THREE.PointLight(0xffc080, 8, 9, 1.4);
    lamp.position.set(X - 2.9, f + 1.4, Z + 2.4);
    this.dynamic.add(lamp);
    const ceil = new THREE.PointLight(0xfff0d8, 6, 10, 1.5);
    ceil.position.set(X + 1, f + 2.4, Z);
    this.dynamic.add(ceil);
    // quadro na parede (uma foto de família, desbotada)
    this.mesh(new THREE.BoxGeometry(0.7, 0.5, 0.03), this.mat(new THREE.MeshStandardMaterial({ color: 0xb8a890, roughness: 0.6 })), X + 2.2, f + 1.6, Z - h.d / 2 + h.T + 0.02);
    // a falha: parede do fundo, à direita
    const wp = getTex('wallpaper', this.Q.tex);
    this.riftMat = this.mat(
      new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uMap: { value: wp.map } },
        vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }',
        fragmentShader: RIFT_FRAG,
        side: THREE.DoubleSide,
      }),
    );
    const rx = X - h.w / 2 + h.T + 0.02;
    const rz = Z - 1.2;
    const rift = this.mesh(new THREE.PlaneGeometry(1.0, 1.9), this.riftMat, rx, f + 1.05, rz);
    rift.rotation.y = Math.PI / 2;
    rift.castShadow = rift.receiveShadow = false;
    this.rift = { x: rx, z: rz, mesh: rift };
    this.riftLight = new THREE.PointLight(0xffe070, 3, 4, 1.6);
    this.riftLight.position.set(rx + 0.4, f + 1.1, rz);
    this.dynamic.add(this.riftLight);
    // fumaça da chaminé
    this.dot = dotTex();
    this.texs.push(this.dot);
    this.smoke = new Puffs(this.dynamic, this.dot, { n: 14, size: 0.45, grow: 1.5, rise: 0.8, life: 5, spread: 0.3, opacity: 0.28, color: 0x9a9088 });
    this.smoke.origin.copy(h.chimneyTop);
    // caixa de correio
    const mb = this.mat(new THREE.MeshStandardMaterial({ color: 0x2a4a7a, roughness: 0.5 }));
    this.mesh(new THREE.BoxGeometry(0.3, 0.25, 0.45), mb, 2.4, 1.1, 2);
    this.mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.0, 6), wood, 2.4, 0.5, 2);
    this.circles.push([2.4, 2, 0.25]);
  }

  makeForest() {
    const r = mulberry32(2026);
    const geos = [0, 1, 2].map((i) => forestTree(800 + i * 13));
    this.geos.push(...geos);
    const tm = this.mat(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }));
    const lists = [[], [], []];
    for (let k = 0; k < 1200 && lists.flat().length < 380; k++) {
      const x = (r() - 0.5) * 240;
      const z = (r() - 0.5) * 240 - 10;
      if (Math.hypot(x, z + 6) < 17) continue;
      lists[Math.floor(r() * 3)].push({ x, z, s: 0.8 + r() * 0.5, rot: r() * TAU });
    }
    this.trees = [];
    lists.forEach((L, i) => {
      const m = new THREE.InstancedMesh(geos[i], tm, Math.max(1, L.length));
      L.forEach((t, k) => {
        _m.compose(_v.set(t.x, groundH(t.x, t.z) - 0.1, t.z), _q.setFromEuler(_e.set(0, t.rot, 0)), _s.setScalar(t.s));
        m.setMatrixAt(k, _m);
        this.circles.push([t.x, t.z, 0.25 * t.s]);
      });
      m.count = L.length;
      m.castShadow = this.Q.shadows;
      m.receiveShadow = this.Q.shadows;
      this.scene.add(m);
      this.trees.push(m);
    });
  }

  // ------------------------------------------------------------ quadro
  update(dt, player) {
    const g = this.game;
    const p = player.pos;
    this.time += dt;
    const t = this.time;
    this.sky.position.copy(g.camera.position);
    this.sky.material.uniforms.uTime.value = t;
    this.updateSun(p);
    if (!this.lastP || Math.hypot(p.x - this.lastP.x, p.z - this.lastP.z) > 2.5) {
      this.lastP = { x: p.x, z: p.z };
      this.refreshTufts(p.x, p.z);
    }
    this.smoke.update(dt);
    this.riftMat.uniforms.uTime.value = t;
    this.riftLight.intensity = 2.5 + Math.sin(t * 23) * 1.2 * (Math.sin(t * 3.1) > 0.3 ? 1 : 0.2);
    const h = this.house;
    const inside = h.inside(p.x, p.z);
    const dr = Math.hypot(p.x - this.rift.x, p.z - this.rift.z);
    if (t > 2.5) this.say('a', ['Mais um fim de tarde. Os pássaros, o vento nas árvores…', 'Tudo normal. Melhor entrar.']);
    if (inside && !g.objectiveDone('casa')) g.completeObjective('casa', 'A casa de sempre. O zumbido da geladeira, o cheiro de madeira.');
    if (inside && this.said.has('a')) this.say('b', ['Que barulho é esse? Parece… um zumbido de lâmpada.', 'Vem daquela parede.']);
    if (dr < 3.2) {
      if (this.say('c', ['A parede… tá falhando. Como uma imagem com defeito.', 'Tem alguma coisa amarela do outro lado.'])) g.glitch = Math.max(g.glitch, 0.35);
      if (Math.random() < dt * 2) g.glitch = Math.max(g.glitch, 0.15 + (3.2 - dr) * 0.1);
      g.audio.setMuffle(clamp((3.2 - dr) / 3, 0, 0.6));
    } else if (this.muffled !== false) {
      this.muffled = false;
      g.audio.setMuffle(0);
    }
    if (dr < 3.2) this.muffled = true;
    if (dr < 0.75 && !this.leaving) this.enterRift();
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

  enterRift() {
    const g = this.game;
    this.leaving = true;
    g.hud.stopSay();
    g.completeObjective('falha', 'Você encosta na falha. A parede não está mais ali — e o chão também não.');
    g.glitch = 1;
    g.audio.play('rift', { gain: 0.4 });
    g.reachExit('noclip', 0.2);
  }

  collide(p, r) {
    p.x = clamp(p.x, -60, 60);
    p.z = clamp(p.z, -70, 50);
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
    return p;
  }

  groundY(x, z) {
    if (this.house.inside && this.house.inside(x, z, -0.1)) return this.house.floor;
    return groundH(x, z);
  }

  surfaceAt(x, z) {
    if (this.house.inside && this.house.inside(x, z, -0.1)) return 'wood';
    if (Math.abs(x) < 0.8 && z > -8 && z < 9) return 'dirt';
    return 'grass';
  }

  los() {
    return true;
  }

  lightLevel() {
    return 1;
  }

  interactable(player) {
    const p = player.pos;
    if (!this.leaving && Math.hypot(p.x - this.rift.x, p.z - this.rift.z) < 1.8) return { label: 'Tocar a falha', action: () => this.enterRift() };
    return null;
  }

  navTarget() {
    return this.game.objectiveDone('casa') ? { x: this.rift.x + 0.6, z: this.rift.z } : { x: this.house.front.x, z: this.house.front.z };
  }

  exitEmitter() {
    return { x: this.rift.x, y: 1.3, z: this.rift.z, sound: 'hum', gain: 0.25 };
  }

  dispose() {
    this.game.audio.setMuffle(0);
    this.smoke.dispose();
    this.tufts.dispose();
    this.house.dispose();
    super.dispose();
    for (const o of [this.sky, this.ground, this.path, ...this.trees]) {
      this.scene.remove(o);
      if (o.isInstancedMesh) o.dispose();
    }
    this.sky.geometry.dispose();
    this.sky.material.dispose();
    for (const x of this.geos) x.dispose();
    for (const m of this.mats) m.dispose();
    for (const t of this.texs) t.dispose();
    this.scene.remove(this.hemi, this.sun, this.sun.target);
  }
}
