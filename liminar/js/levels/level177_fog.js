// Nível 177, Área 5 — uma única rua sem fim no meio de uma neblina fortíssima.
// A vista embaça; depois de 265 m aparece uma casa desolada: uma cama, uma mesa
// com um bilhete que conta a história do Mike e um fogão com a chaleira no fogo.
// O Mike se deita para esquecer tudo — e acorda numa floresta viva ao pôr do
// sol, encontra a casa onde cresceu e entende que voltou para a Terra (as
// Frontrooms). Primeiro final do jogo.
import * as THREE from 'three';
import { OutdoorLevel, makeSky } from './outdoor.js';
import { pushCircle } from './grid.js';
import { getTex } from '../textures.js';
import { clamp, lerp, mulberry32, smoothstep, TAU } from '../util.js';
import {
  music,
  preloadTrack,
  rememberTrack,
  TRACK_B,
  dotTex,
  flameTex,
  grassTex,
  Puffs,
  Fire,
  kettle,
  buildHouse,
  makeMike,
  walkPose,
  CineBars,
  subsAt,
} from './level177_common.js';

const HOUSE_Z = -265;
const F = { x: 4000, z: 0 }; // a floresta do final (longe de tudo)
const HOME = { x: F.x + 3, z: F.z - 30 };

const STORY =
  'Para quem encontrar esta casa. O nome dele era Mike. Sempre foi um cara quieto — daqueles que sentam no fundo da sala e ouvem mais do que falam. ' +
  'Tinha dificuldade com as pessoas: amizades que não duravam, relacionamentos que terminavam em silêncio, portas que ele mesmo fechava. ' +
  'Aos dezessete anos, perdeu o pai e a mãe num acidente de carro, numa estrada coberta de neblina, igual a esta rua. Depois disso, foi se apagando. ' +
  'Parou de atender o telefone. Parou de sair. No dia do aniversário dele, os amigos acenderam a fogueira no alto do morro e esperaram. Ele nunca chegou. ' +
  'Dizem que ele saiu andando pela neblina e caiu para fora da realidade — num lugar de corredores, carpetes e luzes que zumbem, onde cada nível era uma lembrança que ele tentava esquecer. ' +
  'Esta casa é o fim do caminho. A chaleira está no fogo. A cama está feita. Descanse, Mike.';

const ENDING =
  'Mike acordou numa floresta de verdade, com pássaros de verdade, e encontrou a casa onde cresceu. Lá fora, o mundo de cá — as Frontrooms — continuava igual: ' +
  'contas para pagar, o telefone tocando, gente que ainda se lembrava dele. Ele acendeu a luz da varanda e, pela primeira vez em anos, não teve medo do silêncio. ' +
  'Não sabe se vai conseguir. Mas vai tentar viver uma vida nova.';

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();

function forestTree(seed) {
  const r = mulberry32(seed);
  const parts = [];
  const H = 5 + r() * 3;
  parts.push([new THREE.CylinderGeometry(0.15, 0.3, H, 7).translate(0, H / 2, 0).toNonIndexed(), [0.32, 0.22, 0.16]]);
  for (let k = 0; k < 6; k++) {
    const R = 1.4 + r() * 1.0;
    const a = r() * TAU;
    const o = k === 0 ? 0 : 1.2;
    const warm = r();
    parts.push([new THREE.IcosahedronGeometry(R, 1).translate(Math.cos(a) * o, H + (k === 0 ? 0.9 : r() * 1.0 - 0.2), Math.sin(a) * o), [0.25 + warm * 0.25, 0.42 + warm * 0.1, 0.12]]);
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
      const k = 0.5 + 0.5 * clamp(N.getY(i) * 0.5 + 0.5, 0, 1);
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

export class Level177Fog extends OutdoorLevel {
  constructor(game) {
    super(game, { P: 100, walkSpeed: 2.1, camFar: 1500 });
    this.num = 177;
    this.time = 0;
    this.blur = 0.5;
    this.colliders = [];
    this.geos = [];
    this.mats = [];
    this.texs = [];
    this.look = {
      exposure: 1.0,
      tint: [0.98, 1.0, 1.02],
      sat: 0.55,
      contrast: 0.95,
      lift: [0.04, 0.042, 0.045],
      bloom: 0.25,
      bloomThreshold: 0.9,
      fog: [0.6, 0.62, 0.64],
      lightColor: [1, 1, 1],
      flashlight: false,
      ambience: 'level177_5',
      reverb: 1.6,
      sanityDrain: 0.03,
    };
    this.objectives = [
      { id: 'casa', text: 'Siga pela rua até encontrar uma casa (265 m)' },
      { id: 'bilhete', text: 'Leia o bilhete na mesa' },
      { id: 'cama', text: 'Deite na cama' },
    ];
    this.fogC = new THREE.Color(...this.look.fog);
    this.scene.fog = new THREE.FogExp2(this.fogC.clone(), 0.11);
    this.scene.background = this.fogC.clone();
    this.setupLights({
      sky: 0xd0d6dc,
      ground: 0x50504c,
      hemi: 1.4,
      sunColor: 0xe8ecf0,
      sun: 0.5,
      sunDir: new THREE.Vector3(0.3, 0.8, -0.4),
      shadowExtent: 20,
    });
    this.spawn = { x: 0, z: 0, yaw: 0 };
    this.house = { x: 11.5, z: HOUSE_Z, w: 5.2, d: 6.2, rot: -Math.PI / 2, y: 0, color: [0.55, 0.55, 0.56], roof: [0.25, 0.24, 0.26], lit: false, chimney: true };
    this.exit = { x: 7.5, z: HOUSE_Z };
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

  async preload(px, pz, progress) {
    await preloadTrack(this.game, TRACK_B);
    progress(0.2);
    this.dot = dotTex();
    this.flame = flameTex();
    this.texs.push(this.dot, this.flame);
    this.makeStreet();
    progress(0.4);
    this.makeHouse();
    progress(0.6);
    await new Promise((r) => setTimeout(r, 0));
    this.makeForest();
    this.me = makeMike(this);
    progress(1);
  }

  // ------------------------------------------------------------ a rua
  makeStreet() {
    const S = this.Q.tex;
    const as = getTex('asphalt', S);
    const sw = getTex('sidewalk', S);
    const road = as.map.clone();
    road.needsUpdate = true;
    road.repeat.set(1, 240 / 7);
    const walk = sw.map.clone();
    walk.needsUpdate = true;
    walk.repeat.set(1, 120);
    this.texs.push(road, walk);
    const rg = new THREE.PlaneGeometry(7, 240);
    rg.rotateX(-Math.PI / 2);
    const sg = new THREE.PlaneGeometry(2.2, 240);
    sg.rotateX(-Math.PI / 2);
    const gg = new THREE.PlaneGeometry(120, 240);
    gg.rotateX(-Math.PI / 2);
    this.geos.push(rg, sg, gg);
    this.street = new THREE.Group();
    this.street.add(new THREE.Mesh(rg, this.mat(new THREE.MeshStandardMaterial({ map: road, roughness: 0.9, color: 0x9a9a9a }))));
    for (const s of [-1, 1]) {
      const m = new THREE.Mesh(sg, this.mat(new THREE.MeshStandardMaterial({ map: walk, roughness: 0.9 })));
      m.position.set(s * 4.6, 0.12, 0);
      this.street.add(m);
      const curb = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.14, 240), this.mat(new THREE.MeshStandardMaterial({ color: 0x8a8a88, roughness: 0.9 })));
      curb.position.set(s * 3.5, 0.06, 0);
      this.geos.push(curb.geometry);
      this.street.add(curb);
    }
    const ground = new THREE.Mesh(gg, this.mat(new THREE.MeshStandardMaterial({ color: 0x4a4c44, roughness: 1 })));
    ground.position.y = -0.02;
    this.street.add(ground);
    this.scene.add(this.street);
    // faixas do meio
    const dg = new THREE.BoxGeometry(0.14, 0.012, 1.6);
    this.geos.push(dg);
    this.dashes = new THREE.InstancedMesh(dg, this.mat(new THREE.MeshStandardMaterial({ color: 0xd8d0a0, roughness: 0.8 })), 40);
    this.dashes.frustumCulled = false;
    this.scene.add(this.dashes);
    // postes (um a cada 30 m, alternando os lados)
    const post = this.mat(new THREE.MeshStandardMaterial({ color: 0x3a3c40, roughness: 0.6 }));
    this.bulbMat = this.mat(new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.7, 1.0) }));
    this.glowMat = this.mat(new THREE.SpriteMaterial({ map: this.dot, color: new THREE.Color(1.0, 0.8, 0.5), transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.posts = [];
    for (let k = 0; k < 8; k++) {
      const g = new THREE.Group();
      this.mesh(new THREE.CylinderGeometry(0.07, 0.09, 5, 8), post, 0, 2.5, 0, g);
      this.mesh(new THREE.BoxGeometry(1.2, 0.06, 0.06), post, -0.55, 4.95, 0, g);
      this.mesh(new THREE.SphereGeometry(0.14, 10, 8), this.bulbMat, -1.1, 4.85, 0, g);
      const sp = new THREE.Sprite(this.glowMat);
      sp.scale.set(5, 5, 1);
      sp.position.set(-1.1, 4.8, 0);
      g.add(sp);
      this.scene.add(g);
      this.posts.push(g);
    }
    this.placeStreet(0);
  }

  placeStreet(pz) {
    const sz = Math.round(pz / 14) * 14;
    this.street.position.z = sz - 60;
    let n = 0;
    const base = Math.round(pz / 4) * 4;
    for (let k = -20; k < 20; k++) {
      _m.compose(_v.set(0, 0.006, base + k * 4), _q.identity(), _s.set(1, 1, 1));
      this.dashes.setMatrixAt(n++, _m);
    }
    this.dashes.count = n;
    this.dashes.instanceMatrix.needsUpdate = true;
    const pb = Math.round(pz / 30);
    this.posts.forEach((g, i) => {
      const k = pb + i - 4;
      const side = k % 2 ? 1 : -1;
      g.position.set(side * 4.9, 0, k * 30);
      g.rotation.y = side > 0 ? 0 : Math.PI;
      g.visible = Math.abs(k * 30 - HOUSE_Z) > 6;
    });
  }

  // ------------------------------------------------------------ a casa desolada
  makeHouse() {
    const h = buildHouse(this.house, this.colliders, this.Q.tex);
    this.dynamic.add(h.group);
    const inner = new THREE.Group();
    inner.position.set(h.x, h.floor, h.z);
    inner.rotation.y = h.rot;
    this.dynamic.add(inner);
    this.inner = inner;
    const wood = this.mat(new THREE.MeshStandardMaterial({ color: 0x5a4030, roughness: 0.85 }));
    const sheet = this.mat(new THREE.MeshStandardMaterial({ color: 0xd8d2c8, roughness: 0.95 }));
    const blanket = this.mat(new THREE.MeshStandardMaterial({ color: 0x5a6a80, roughness: 0.95 }));
    const iron = this.mat(new THREE.MeshStandardMaterial({ color: 0x252528, roughness: 0.5, metalness: 0.5 }));
    // coordenadas locais: porta em +z
    const solid = (lx, lz, sx, sz) => {
      _v.set(lx, 0, lz).applyAxisAngle(new THREE.Vector3(0, 1, 0), h.rot);
      const q = Math.abs(Math.sin(h.rot)) > 0.5;
      const ax = (q ? sz : sx) / 2;
      const az = (q ? sx : sz) / 2;
      this.colliders.push([h.x + _v.x - ax, h.x + _v.x + ax, h.z + _v.z - az, h.z + _v.z + az]);
    };
    // cama
    const bx = -1.35;
    const bz = -1.55;
    this.bed = { lx: bx, lz: bz };
    this.mesh(new THREE.BoxGeometry(1.1, 0.3, 2.1), wood, bx, 0.25, bz, inner);
    this.mesh(new THREE.BoxGeometry(1.0, 0.18, 2.0), sheet, bx, 0.48, bz, inner);
    this.mesh(new THREE.BoxGeometry(1.04, 0.06, 1.3), blanket, bx, 0.58, bz + 0.35, inner);
    this.mesh(new THREE.BoxGeometry(0.6, 0.12, 0.35), sheet, bx, 0.62, bz - 0.75, inner);
    this.mesh(new THREE.BoxGeometry(1.1, 0.9, 0.08), wood, bx, 0.45, bz - 1.05, inner);
    solid(bx, bz, 1.1, 2.1);
    // mesa, cadeira e o bilhete
    const tx = 1.2;
    const tz = 0.4;
    this.mesh(new THREE.BoxGeometry(1.0, 0.05, 0.7), wood, tx, 0.75, tz, inner);
    for (const [ax, az] of [
      [-0.45, -0.3],
      [0.45, -0.3],
      [-0.45, 0.3],
      [0.45, 0.3],
    ])
      this.mesh(new THREE.BoxGeometry(0.05, 0.75, 0.05), wood, tx + ax, 0.375, tz + az, inner);
    this.mesh(new THREE.BoxGeometry(0.42, 0.04, 0.42), wood, tx - 0.75, 0.45, tz, inner);
    this.mesh(new THREE.BoxGeometry(0.04, 0.5, 0.42), wood, tx - 0.95, 0.7, tz, inner);
    const note = this.mesh(new THREE.PlaneGeometry(0.2, 0.26), this.mat(new THREE.MeshStandardMaterial({ color: 0xf0e8d6, roughness: 0.9, emissive: 0x2a2620 })), tx + 0.1, 0.781, tz, inner);
    note.rotation.set(-Math.PI / 2, 0, 0.3);
    solid(tx, tz, 1.0, 0.7);
    // fogão a lenha com fogo e chaleira
    const sx = 1.4;
    const sz = -2.25;
    this.mesh(new THREE.BoxGeometry(0.8, 0.75, 0.6), iron, sx, 0.375, sz, inner);
    this.mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.2, 8), iron, sx + 0.2, 1.85, sz - 0.1, inner);
    const grate = this.mesh(new THREE.PlaneGeometry(0.46, 0.3), this.mat(new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 0.8, 0.25) })), sx, 0.3, sz + 0.302, inner);
    grate.renderOrder = 1;
    this.fire = new Fire(inner, this.flame, sx, 0.16, sz + 0.34, { scale: 0.42, intensity: 9, dist: 9 });
    this.fire.light.position.set(0, 0.6, 0.6);
    const k = kettle(inner, sx - 0.1, 0.75, sz);
    this.mats.push(...k.userData.mats);
    solid(sx, sz, 0.8, 0.6);
    this.steam = new Puffs(inner, this.dot, { n: 12, size: 0.07, grow: 1.0, rise: 0.35, life: 2.4, spread: 0.03, opacity: 0.55, color: 0xf4f6ff });
    this.steam.origin.set(sx - 0.1 + 0.22, 0.75 + 0.24, sz);
    // posições no mundo
    const toW = (lx, lz) => {
      _v.set(lx, 0, lz).applyAxisAngle(new THREE.Vector3(0, 1, 0), h.rot);
      return { x: h.x + _v.x, z: h.z + _v.z };
    };
    this.notePos = toW(tx, tz);
    this.bedPos = toW(bx, bz + 0.6);
    this.smoke = new Puffs(this.dynamic, this.dot, { n: 14, size: 0.4, grow: 1.4, rise: 0.7, life: 5, spread: 0.3, opacity: 0.3, color: 0x707274 });
    this.smoke.origin.copy(h.chimneyTop);
  }

  // ------------------------------------------------------------ a floresta do final
  makeForest() {
    const g = new THREE.Group();
    g.visible = false;
    this.forest = g;
    this.scene.add(g);
    const Q = this.Q;
    const gm = grassTex(Math.min(1024, Q.tex), '#5a7a30', 70, 110, 28, 50, 1775);
    gm.repeat.set(60, 60);
    this.texs.push(gm);
    const gr = new THREE.PlaneGeometry(300, 300);
    gr.rotateX(-Math.PI / 2);
    this.geos.push(gr);
    const ground = new THREE.Mesh(gr, this.mat(new THREE.MeshStandardMaterial({ map: gm, roughness: 0.95 })));
    ground.position.set(F.x, 0, F.z - 20);
    ground.receiveShadow = Q.shadows;
    g.add(ground);
    // trilha de terra até a casa
    const dirt = getTex('pathDirt', Q.tex).map.clone();
    dirt.needsUpdate = true;
    dirt.repeat.set(1, 12);
    this.texs.push(dirt);
    const pg = new THREE.PlaneGeometry(1.6, 34);
    pg.rotateX(-Math.PI / 2);
    this.geos.push(pg);
    const path = new THREE.Mesh(pg, this.mat(new THREE.MeshStandardMaterial({ map: dirt, roughness: 1, color: 0x8a7e70 })));
    path.position.set((F.x + HOME.x) / 2, 0.01, (F.z + HOME.z) / 2 + 3);
    path.rotation.y = Math.atan2(HOME.x - F.x, HOME.z - F.z);
    g.add(path);
    // árvores
    const r = mulberry32(9177);
    const geos = [0, 1, 2].map((i) => forestTree(700 + i * 13));
    this.geos.push(...geos);
    const tm = this.mat(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }));
    const lists = [[], [], []];
    for (let k = 0; k < 900 && lists.flat().length < 330; k++) {
      const x = F.x + (r() - 0.5) * 140;
      const z = F.z + 25 - r() * 120;
      const t = clamp((F.z - z) / (F.z - HOME.z), 0, 1);
      const px = lerp(F.x, HOME.x, t);
      if (Math.abs(x - px) < 4 && z < F.z + 6 && z > HOME.z - 2) continue;
      if (Math.hypot(x - HOME.x, z - HOME.z) < 11) continue;
      lists[Math.floor(r() * 3)].push({ x, z, s: 0.8 + r() * 0.5, rot: r() * TAU });
    }
    lists.forEach((L, i) => {
      const m = new THREE.InstancedMesh(geos[i], tm, Math.max(1, L.length));
      L.forEach((t, k) => {
        _m.compose(_v.set(t.x, -0.1, t.z), _q.setFromEuler(_e.set(0, t.rot, 0)), _s.setScalar(t.s));
        m.setMatrixAt(k, _m);
      });
      m.count = L.length;
      m.castShadow = Q.shadows;
      m.receiveShadow = Q.shadows;
      g.add(m);
    });
    // a casa de verdade: luz acesa, varanda, fumaça na chaminé
    this.home = buildHouse({ x: HOME.x, z: HOME.z, w: 7, d: 6.5, rot: 0, y: 0, color: [0.92, 0.88, 0.8], roof: [0.38, 0.2, 0.18], lit: true }, [], Q.tex);
    g.add(this.home.group);
    const porch = new THREE.PointLight(0xffc070, 6, 9, 1.5);
    porch.position.set(HOME.x, 2.6, HOME.z + 3.9);
    g.add(porch);
    const inside = new THREE.PointLight(0xffb060, 10, 10, 1.4);
    inside.position.set(HOME.x, 2.0, HOME.z);
    g.add(inside);
    this.homeSmoke = new Puffs(g, this.dot, { n: 14, size: 0.45, grow: 1.5, rise: 0.8, life: 5, spread: 0.3, opacity: 0.3, color: 0x9a9088 });
    this.homeSmoke.origin.copy(this.home.chimneyTop);
    // caixa de correio
    const mb = this.mat(new THREE.MeshStandardMaterial({ color: 0x2a4a7a, roughness: 0.5 }));
    this.mesh(new THREE.BoxGeometry(0.3, 0.25, 0.45), mb, HOME.x + 2.2, 1.1, HOME.z + 5.6, g);
    this.mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.0, 6), this.mat(new THREE.MeshStandardMaterial({ color: 0x5a4030 })), HOME.x + 2.2, 0.5, HOME.z + 5.6, g);
    // céu do pôr do sol
    this.forestSky = makeSky({
      zenith: [0.3, 0.38, 0.62],
      horizon: [1.0, 0.62, 0.36],
      ground: [0.3, 0.25, 0.2],
      fog: [0.95, 0.72, 0.52],
      sunDir: new THREE.Vector3(0.75, 0.12, -0.65),
      sunColor: [1.4, 0.8, 0.4],
      sunDisk: 1.5,
      cloudA: [0.6, 0.38, 0.4],
      cloudB: [1.0, 0.7, 0.5],
      cover: 0.45,
    });
    this.forestSky.visible = false;
    this.scene.add(this.forestSky);
  }

  // ------------------------------------------------------------ quadro
  update(dt, player) {
    const g = this.game;
    const p = player.pos;
    this.time += dt;
    const t = this.time;
    music(this, TRACK_B, 0.6);
    if (this.cine) {
      this.updateCine(dt);
      return;
    }
    this.updateSun(p);
    if (!this.lastZ || Math.abs(p.z - this.lastZ) > 3) {
      this.lastZ = p.z;
      this.placeStreet(p.z);
    }
    this.fire.update(t);
    this.steam.update(dt);
    this.smoke.update(dt);
    // a neblina e a vista embaçada só cedem perto da casa
    const dh = Math.hypot(p.x - this.house.x, p.z - this.house.z);
    const near = 1 - smoothstep(12, 40, dh);
    const inside = this.house.inside(p.x, p.z, 0.2);
    this.blur = inside ? 0 : lerp(0.55, 0.08, near) + Math.sin(t * 0.7) * 0.05 * (1 - near);
    this.scene.fog.density = inside ? 0.05 : lerp(0.11, 0.07, near);
    const walked = -p.z;
    if (t > 2.5) this.say('a', ['Neblina. Não dá pra ver quase nada.', 'Uma rua… igual àquela estrada. Eu conheço essa neblina.']);
    if (walked > 120) this.say('b', ['Eu continuo andando sem saber por quê.', 'É como se alguém tivesse deixado a luz acesa pra mim.']);
    if (dh < 18) {
      this.say('c', ['Uma casa. Tem fogo lá dentro.']);
      if (!g.objectiveDone('casa')) g.completeObjective('casa', 'Uma casa desolada na beira da rua. A porta está aberta.');
    }
    if (inside) this.say('d', ['Uma cama. Uma mesa. Um bilhete… e a chaleira no fogo.']);
    if (this.reading && !g.hud.noteOpen) {
      this.reading = false;
      g.completeObjective('bilhete', 'A história do Mike. A sua história.');
      g.hud.stopSay();
      g.hud.say(
        [
          'Então é isso. Essa é a minha história.',
          'Meu pai, minha mãe… a estrada com neblina. Eu lembro agora.',
          'Eu não quero mais lembrar. De nada disso.',
          'Só quero dormir. Um sono profundo… e esquecer tudo.',
        ],
        () => g.level === this && g.hud.objective('Deite na cama.', 5),
        'MIKE',
      );
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
    g.hud.say(lines, null, 'MIKE');
    return true;
  }

  // ------------------------------------------------------------ o final
  startCine() {
    const g = this.game;
    this.cine = { t: 0, s: { i: 0 }, forest: false };
    g.player.frozen = true;
    g.input.enabled = false;
    g.hud.stopSay();
    g.hud.show(false);
    g.completeObjective('cama', 'Mike se deita.');
    this.bars = new CineBars(() => {
      if (this.cine && this.cine.t < 44) {
        this.cine.t = 44;
        this.cine.s.i = this.subs.length;
      }
    });
    this.subs = [
      [0.6, 'Mike se deita na cama. As molas rangem.'],
      [3.6, 'O fogo estala. A chaleira chia baixinho.'],
      [6.2, 'Pela primeira vez em muito tempo, ele dorme sem medo.'],
      [9.0, '…'],
      [11.2, 'Pássaros. Pássaros de verdade, cantando.'],
      [14.2, 'Uma floresta viva, aconchegante. O sol se pondo entre as árvores.'],
      [17.4, 'MIKE: Onde… onde eu tô?'],
      [20.0, 'Ele anda sem saber para onde. Tudo parece familiar demais.'],
      [24.4, 'MIKE: Isso aqui… parece a Terra.'],
      [28.4, 'Entre as árvores, uma casa com a luz acesa.'],
      [32.6, 'MIKE: Essa casa… é a minha casa. A casa de verdade.'],
      [36.2, 'MIKE: Eu voltei. Eu tô na Terra… nas Frontrooms.'],
      [39.6, 'MIKE: Acabou. O pesadelo acabou.'],
      [42.6, 'MIKE: Agora eu vou tentar viver de novo. Uma vida nova.'],
      [46.0, ''],
    ];
    const me = this.me;
    me.root.visible = true;
    this.inner.add(me.root);
    me.root.position.set(this.bed.lx, 0.6, this.bed.lz + 0.95);
    me.root.rotation.set(-Math.PI / 2, 0, 0);
    g.audio.play('creak', { gain: 0.25, rate: 0.7, wet: 0.6 });
  }

  toForest() {
    const g = this.game;
    const C = this.cine;
    C.forest = true;
    this.street.visible = false;
    this.dashes.visible = false;
    for (const p of this.posts) p.visible = false;
    this.forest.visible = true;
    this.forestSky.visible = true;
    this.blur = 0;
    const fc = new THREE.Color(0.95, 0.72, 0.52);
    this.scene.fog = new THREE.FogExp2(fc, 0.012);
    this.scene.background = fc;
    this.hemi.color.set(0xffd8b0);
    this.hemi.groundColor.set(0x40502a);
    this.hemi.intensity = 1.3;
    this.sun.color.set(0xffb070);
    this.sun.intensity = 2.4;
    this.sunDir.set(0.75, 0.3, -0.6).normalize();
    this.updateSun({ x: F.x, z: F.z - 15 });
    g.camera.far = 1500;
    g.camera.updateProjectionMatrix();
    const u = g.post.u;
    u.uTint.value.setRGB(1.06, 0.98, 0.9);
    u.uSat.value = 1.1;
    u.uContrast.value = 1.05;
    u.uLift.value.setRGB(0.02, 0.015, 0.01);
    u.uBloom.value = 0.3;
    // o Mike deitado na grama
    const me = this.me;
    this.dynamic.add(me.root);
    me.root.position.set(F.x, 0.05, F.z);
    me.root.rotation.set(-Math.PI / 2, 0, 0);
    me.root.scale.setScalar(1);
    g.player.pos.set(F.x, 0, F.z);
    this.birds = g.audio.ready ? g.audio.loop('birds', 0.22, { wet: 0.4 }) : null;
    this.birds2 = g.audio.ready ? g.audio.loop('birds', 0.12, { rate: 0.85, wet: 0.6 }) : null;
  }

  updateCine(dt) {
    const g = this.game;
    const C = this.cine;
    C.t += dt;
    const t = C.t;
    const s = subsAt(this.subs, t, C.s);
    if (s !== null) this.bars.sub(s);
    const me = this.me;
    const cam = g.camera;
    const br = Math.sin(t * 1.3);
    me.torso.scale.set(1 + br * 0.01, 1 + br * 0.015, 1);
    if (!C.forest) {
      // dormindo: a câmera gira devagar sobre a cama, o fogo diminui
      this.fire.update(this.time);
      this.steam.update(dt);
      const a = 0.6 + t * 0.08;
      _v.set(this.bed.lx + Math.sin(a) * 2.2, 1.9 - t * 0.05, this.bed.lz + 0.4 + Math.cos(a) * 2.2);
      this.inner.localToWorld(_v);
      _w.set(this.bed.lx, 0.6, this.bed.lz - 0.2);
      this.inner.localToWorld(_w);
      cam.position.copy(_v);
      cam.up.set(0, 1, 0);
      cam.lookAt(_w);
      me.head.rotation.set(0, Math.sin(t * 0.3) * 0.1, 0);
      if (t > 7.2) g.fadeTarget = 1;
      if (t > 9.6) {
        g.fade = 1;
        this.toForest();
      }
      return;
    }
    // floresta
    if (t < 10.6) g.fade = 1;
    g.fadeTarget = t < 10.6 ? 1 : 0;
    this.homeSmoke.update(dt);
    const S = { x: F.x, z: F.z };
    const P1 = { x: F.x + 2.5, z: F.z - 13 };
    const P2 = { x: HOME.x, z: HOME.z + 8.5 };
    const P3 = { x: HOME.x, z: HOME.z + 4.4 };
    let pos;
    let yaw;
    let walking = 0;
    // acordando (11–17 s): deitado → sentado → de pé
    const up = smoothstep(13.2, 17, t);
    me.root.rotation.x = (-Math.PI / 2) * (1 - up);
    me.root.position.y = 0.05 * (1 - up);
    if (t < 19) {
      pos = S;
      yaw = Math.PI;
      me.head.rotation.set(0, Math.sin(t * 0.8) * 0.5 * up, 0);
    } else if (t < 33) {
      // andando, perdido (para no meio e olha em volta)
      const k1 = smoothstep(19, 24, t);
      const k2 = smoothstep(26.5, 32.5, t);
      const a = k1 < 1 ? { x: lerp(S.x, P1.x, k1), z: lerp(S.z, P1.z, k1) } : { x: lerp(P1.x, P2.x, k2), z: lerp(P1.z, P2.z, k2) };
      pos = a;
      const tgt = k1 < 1 ? P1 : P2;
      yaw = Math.atan2(tgt.x - pos.x, tgt.z - pos.z);
      walking = t < 24 || t > 26.5 ? 1 : 0;
      me.head.rotation.set(0, walking ? Math.sin(t * 0.9) * 0.25 : Math.sin((t - 24) * 2.2) * 0.9, 0);
    } else if (t < 44) {
      pos = P2;
      yaw = Math.PI;
      me.head.rotation.set(-0.12, 0, 0);
    } else {
      const k = smoothstep(44, 48, t);
      pos = { x: P2.x, z: lerp(P2.z, P3.z, k) };
      yaw = Math.PI;
      walking = k < 1 ? 1 : 0;
    }
    C.ph = (C.ph || 0) + dt * walking * 6;
    if (walking) walkPose(me, C.ph, 1);
    else walkPose(me, 0, 0);
    me.root.position.x = pos.x;
    me.root.position.z = pos.z;
    me.root.rotation.y = yaw;
    // câmera
    if (t < 19) {
      const k = smoothstep(11, 18, t);
      cam.position.set(S.x + lerp(1.2, 2.8, k), lerp(0.7, 1.9, k), S.z + lerp(0.6, 3.2, k));
      _w.set(S.x, lerp(0.25, 1.2, up), S.z - lerp(0.6, 0, up));
    } else if (t < 33) {
      _v.set(pos.x + 2.6, 2.0, pos.z + 4.2);
      cam.position.lerp(_v, 1 - Math.exp(-dt * 2));
      _w.set(pos.x, 1.4, pos.z - 1.5);
    } else if (t < 44) {
      const k = smoothstep(33, 38, t);
      const k2 = smoothstep(39, 43, t);
      _v.set(lerp(P2.x + 1.5, P2.x - 2.2, k) + k2 * 0.8, lerp(1.7, 1.55, k), lerp(P2.z + 3.5, P2.z - 2.2, k) - k2 * 0.6);
      cam.position.lerp(_v, 1 - Math.exp(-dt * 2.5));
      _w.set(lerp(HOME.x, P2.x, k), lerp(2.2, 1.6, k), lerp(HOME.z, P2.z, k));
    } else {
      _v.set(P2.x + 3, 2.4, P2.z + 6);
      cam.position.lerp(_v, 1 - Math.exp(-dt * 1.5));
      _w.set(HOME.x, 2, HOME.z);
    }
    cam.up.set(0, 1, 0);
    cam.lookAt(_w);
    this.forestSky.position.copy(cam.position);
    this.forestSky.material.uniforms.uTime.value = t;
    if (t > 46 && !C.done) {
      C.done = true;
      if (this.bars) this.bars.dispose();
      this.bars = null;
      g.finish({ title: 'Fim — O Despertar', text: ENDING });
    }
  }

  // ------------------------------------------------------------ física e interação
  collide(p, r) {
    if (this.cine) return p;
    const h = this.house;
    const yard = p.x > 3 && p.x < h.x + h.hx + 0.5 && Math.abs(p.z - h.z) < h.hz + 0.6;
    if (!yard) p.x = clamp(p.x, -5.6, 5.6);
    p.z = Math.min(p.z, 18);
    for (let it = 0; it < 2; it++) for (const b of this.colliders) if (p.x > b[0] - 2 && p.x < b[1] + 2 && p.z > b[2] - 2 && p.z < b[3] + 2) pushCircle(p, r, b[0], b[1], b[2], b[3]);
    return p;
  }

  groundY(x, z) {
    if (this.house.inside && this.house.inside(x, z, -0.1)) return this.house.floor;
    return Math.abs(x) > 3.5 && Math.abs(x) < 5.8 ? 0.12 : 0;
  }

  surfaceAt(x, z) {
    if (this.house.inside && this.house.inside(x, z, -0.1)) return 'wood';
    return 'concrete';
  }

  los() {
    return true;
  }

  lightLevel(x, z) {
    return this.house.inside && this.house.inside(x, z) ? 0.6 : 0.7;
  }

  interactable(player) {
    if (this.cine) return null;
    const g = this.game;
    const p = player.pos;
    if (!this.house.inside(p.x, p.z)) return null;
    const n = this.notePos;
    const b = this.bedPos;
    if (!g.objectiveDone('bilhete') && Math.hypot(p.x - n.x, p.z - n.z) < 1.6)
      return {
        label: 'Ler o bilhete',
        action: () => {
          g.audio.paper();
          if (!g.objectiveDone('casa')) g.completeObjective('casa');
          g.hud.showNote(STORY);
          this.reading = true;
        },
      };
    if (Math.hypot(p.x - b.x, p.z - b.z) < 1.8) {
      if (!g.objectiveDone('bilhete')) return { label: 'Cama', action: () => g.hud.message('Ainda não. Tem um bilhete na mesa.', 3) };
      return { label: 'Deitar e dormir', action: () => this.startCine() };
    }
    return null;
  }

  navTarget() {
    const g = this.game;
    if (!g.objectiveDone('casa')) return this.exit;
    if (!g.objectiveDone('bilhete')) return this.notePos;
    return this.bedPos;
  }

  exitEmitter() {
    return { x: this.house.x, y: 1, z: this.house.z, sound: 'fire', gain: 0.25 };
  }

  dispose() {
    rememberTrack(this);
    if (this.bars) this.bars.dispose();
    this.fire.dispose();
    this.steam.dispose();
    this.smoke.dispose();
    this.homeSmoke.dispose();
    this.me.dispose();
    this.house.dispose();
    this.home.dispose();
    super.dispose();
    this.scene.remove(this.street, this.dashes, this.forest, this.forestSky, ...this.posts);
    this.dashes.dispose();
    this.forest.traverse((o) => o.isInstancedMesh && o.dispose());
    this.forestSky.geometry.dispose();
    this.forestSky.material.dispose();
    for (const x of this.geos) x.dispose();
    for (const m of this.mats) m.dispose();
    for (const t of this.texs) t.dispose();
    this.scene.remove(this.hemi, this.sun, this.sun.target);
  }
}
