// Nível 69 — "Vilarejo Flutuante". Ilhas de grama boiando num céu de pôr do
// sol dreamcore, lavanda e pêssego. Na ilha maior, um vilarejo vazio de casas
// de azulejo branco com telhados de duas águas e alpendres em arco, praças de
// piso esmaltado que refletem o céu, piscinas paradas como vidro e um paredão
// amarelo com uma passagem. Pontes ligam as ilhas: o jardim dos arcos e o
// balanço, a escada para o nada e a porta sozinha e, por fim, o grande paredão
// amarelo com uma passagem de luz — a saída. Lá embaixo, só um mar de nuvens.
// Quem cai acorda de novo no último lugar seguro, como num sonho.
import * as THREE from 'three';
import { OutdoorLevel } from './outdoor.js';
import { pushCircle } from './grid.js';
import { indoorEnvTex, TEX } from '../textures.js';
import { hash3, mulberry32, smoothstep, TAU } from '../util.js';
import { standardWake } from './wake.js';
import { GeoBuilder } from '../materials.js';
import { SUN, ISLANDS, BRIDGES, BRIDGE_HW, onBridge, onIsland, edgeDist, islandGeos, tileTex, grassTex, rockTex, bladeTex, glowTex, makeSky, makeSea, farIslands } from './level69_world.js';
import { Builder, buildVillage, disposeBuildCache } from './level69_build.js';

const D = ISLANDS[3];
const _q = { x: 0, z: 0 };

function signTex(text) {
  const c = TEX.makeCanvas(512, 160);
  const x = c.getContext('2d');
  x.fillStyle = '#fbf4f8';
  x.fillRect(0, 0, 512, 160);
  x.strokeStyle = '#d9b8cc';
  x.lineWidth = 8;
  x.strokeRect(8, 8, 496, 144);
  x.fillStyle = '#7a5a8a';
  x.font = 'italic 44px Georgia, serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText(text, 256, 84);
  return TEX.toTex(c, { repeat: false });
}

export class Level69 extends OutdoorLevel {
  constructor(game) {
    super(game, { P: 100, walkSpeed: 2.3, camFar: 4000 });
    this.num = 69;
    this.time = 0;
    this.blur = 0.05;
    this.mats = [];
    this.geos = [];
    this.texs = [];
    this.meshes = [];
    this.colliders = [];
    this.circles = [];
    this.fall = null;
    this.look = {
      exposure: 0.96,
      tint: [1.04, 0.97, 1.03],
      sat: 1.14,
      contrast: 1.06,
      lift: [0.03, 0.015, 0.04],
      bloom: 0.3,
      bloomThreshold: 0.9,
      fog: [0.88, 0.6, 0.7],
      lightColor: [1, 1, 1],
      flashlight: false,
      ambience: 'level69',
      reverb: 1.0,
      sanityDrain: 0,
    };
    this.objectives = [
      { id: 'vila', text: 'Explore o vilarejo flutuante' },
      { id: 'pontes', text: 'Atravesse as pontes até a última ilha' },
      { id: 'porta', text: 'Entre na passagem de luz do paredão amarelo' },
    ];
    this.scene.fog = new THREE.FogExp2(new THREE.Color(...this.look.fog), 0.0011);
    this.scene.background = new THREE.Color(...this.look.fog);
    this.setupLights({
      sky: 0xffc8e4,
      ground: 0x8a9a74,
      hemi: 0.85,
      sunColor: 0xffc286,
      sun: 3.3,
      sunDir: SUN,
      shadowExtent: 42,
      shadowFar: 300,
    });
    this.shadowDist = 140;
    this.spawn = { x: 0, z: 36, yaw: 0 };
    this.exit = { x: D.x, z: D.z - 4 };
    this.safe = { x: 0, z: 36 };
  }

  mat(m) {
    this.mats.push(m);
    return m;
  }

  addMesh(geo, mat, cast = true, receive = true, parent = this.scene) {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = cast && this.Q.shadows;
    m.receiveShadow = receive && this.Q.shadows;
    m.matrixAutoUpdate = false;
    m.updateMatrix();
    this.geos.push(geo);
    parent.add(m);
    this.meshes.push(m);
    return m;
  }

  // ------------------------------------------------------------ construção
  async preload(px, pz, progress) {
    const tick = () => new Promise((r) => setTimeout(r, 0));
    this.makeMaterials();
    progress(0.15);
    this.sky = makeSky();
    this.sea = makeSea();
    this.mats.push(this.sky.material, this.sea.material);
    this.geos.push(this.sky.geometry, this.sea.geometry);
    this.scene.add(this.sky, this.sea);
    this.makeIslands();
    progress(0.35);
    await tick();
    const { B, exit } = buildVillage();
    this.B = B;
    this.exitWall = exit;
    for (const k in B.G) if (!B.G[k].empty) this.addMesh(B.G[k].build(), this.M[k], k !== 'glow' && k !== 'poolTile', k !== 'glow');
    this.colliders.push(...B.colliders);
    this.circles.push(...B.circles);
    this.makePools();
    this.makeSigns();
    this.makeSwings();
    this.makeExitLight();
    progress(0.6);
    await tick();
    this.makeFar();
    progress(0.8);
    await tick();
    this.makeGrass();
    this.makeMotes();
    this.spawnItems();
    this.refreshGrass(px, pz);
    this.updateSun({ x: px, z: pz });
    progress(1);
  }

  makeMaterials() {
    const S = Math.min(1024, this.Q.tex);
    const env = this.game.makeEnv(indoorEnvTex(['#9a84cc', '#f0a4c0', '#ffc896'], '#fff2e6', 0));
    this.env = env;
    const t = (base, grout, n, seed) => {
      const tx = tileTex(Math.min(512, S), base, grout, n, seed);
      this.texs.push(tx);
      return tx;
    };
    const vc = (o) => this.mat(new THREE.MeshStandardMaterial({ vertexColors: true, ...o }));
    const grass = grassTex(Math.min(1024, S));
    const rock = rockTex(Math.min(512, S));
    this.texs.push(grass, rock);
    this.M = {
      tileW: vc({ map: t('#f3eef2', '#a89eb2', 8, 1), roughness: 0.42, envMap: env, envMapIntensity: 0.35 }),
      tileY: vc({ map: t('#f7d06a', '#c8923e', 8, 2), roughness: 0.48, envMap: env, envMapIntensity: 0.3 }),
      floor: vc({ map: t('#eadcec', '#b4a2be', 6, 3), roughness: 0.16, envMap: env, envMapIntensity: 0.9 }),
      poolTile: vc({ map: t('#94d6e2', '#5c9eac', 8, 4), roughness: 0.3 }),
      roof: vc({ map: t('#a8a0b8', '#857c98', 10, 5), roughness: 0.75, side: THREE.DoubleSide }),
      paint: vc({ roughness: 0.6, side: THREE.DoubleSide }),
      door: vc({ roughness: 0.45, envMap: env, envMapIntensity: 0.3 }),
      glass: vc({ roughness: 0.08, metalness: 0.4, envMap: env, envMapIntensity: 1.2 }),
      leaf: vc({ roughness: 0.9, flatShading: true }),
      rail: vc({ roughness: 0.4, side: THREE.DoubleSide }),
      glow: this.mat(new THREE.MeshBasicMaterial({ vertexColors: true })),
      grass: this.mat(new THREE.MeshStandardMaterial({ map: grass, roughness: 0.95, color: 0xe8f0d8 })),
      rock: vc({ map: rock, roughness: 0.92 }),
      far: vc({ map: rock, roughness: 0.9 }),
    };
    this.M.grass.polygonOffset = true;
    this.M.grass.polygonOffsetFactor = 1;
    this.M.grass.polygonOffsetUnits = 1;
    grass.repeat.set(1, 1);
  }

  makeIslands() {
    const seg = this.Q.id === 'low' ? 64 : 96;
    for (const I of ISLANDS) {
      const { top, body } = islandGeos(I, seg, 9);
      this.addMesh(top, this.M.grass, false, true);
      this.addMesh(body, this.M.rock, true, false);
    }
    // pedrinhas soltas boiando em volta
    const r = mulberry32(6901);
    const gb = new GeoBuilder();
    const ico = new THREE.IcosahedronGeometry(1, 0);
    this.geos.push(ico);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const sc = new THREE.Vector3();
    const v = new THREE.Vector3();
    for (const I of ISLANDS)
      for (let i = 0; i < 9; i++) {
        const a = r() * TAU;
        const d = I.r * (1.15 + r() * 0.7);
        const s = 0.4 + r() * 1.8;
        v.set(I.x + Math.cos(a) * d, I.y - 3 - r() * 18, I.z + Math.sin(a) * d);
        e.set(r() * 3, r() * 3, r() * 3);
        sc.set(s, s * (0.6 + r() * 0.6), s);
        m.compose(v, q.setFromEuler(e), sc);
        gb.addGeometry(ico, m, [0.86, 0.72, 0.76]);
      }
    this.addMesh(gb.build(), this.M.far, false, false);
  }

  makePools() {
    const water = this.mat(
      new THREE.MeshStandardMaterial({ color: 0xc8eef4, roughness: 0.02, metalness: 0.35, transparent: true, opacity: 0.82, envMap: this.env, envMapIntensity: 1.4 }),
    );
    this.water = water;
    for (const p of this.B.pools) {
      const g = new THREE.PlaneGeometry(p.w, p.d);
      g.rotateX(-Math.PI / 2);
      const m = this.addMesh(g, water, false, true);
      m.position.set(p.x, p.y, p.z);
      m.rotation.y = p.rot;
      m.updateMatrix();
    }
  }

  makeSigns() {
    for (const sg of this.B.signs) {
      const tex = signTex(sg.text);
      this.texs.push(tex);
      const mat = this.mat(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7, side: THREE.DoubleSide }));
      const g = new THREE.BoxGeometry(1.5, 0.47, 0.04);
      const m = this.addMesh(g, mat, true, true);
      m.position.set(sg.x, sg.y, sg.z);
      m.rotation.y = sg.rot;
      m.updateMatrix();
    }
  }

  makeSwings() {
    this.swingObjs = [];
    const mat = this.mat(new THREE.MeshStandardMaterial({ color: 0xfff0f6, roughness: 0.6 }));
    const rope = new THREE.BoxGeometry(0.025, 2.0, 0.025);
    const seat = new THREE.BoxGeometry(0.62, 0.05, 0.26);
    this.geos.push(rope, seat);
    for (const s of this.B.swings) {
      const piv = new THREE.Group();
      piv.position.set(s.x, s.y, s.z);
      piv.rotation.y = s.rot;
      const arm = new THREE.Group();
      piv.add(arm);
      for (const sx of [-0.28, 0.28]) {
        const r = new THREE.Mesh(rope, mat);
        r.position.set(sx, -1.0, 0);
        arm.add(r);
      }
      const st = new THREE.Mesh(seat, mat);
      st.position.y = -2.0;
      st.castShadow = this.Q.shadows;
      arm.add(st);
      this.dynamic.add(piv);
      this.swingObjs.push(arm);
    }
  }

  // A passagem de luz no grande paredão amarelo.
  makeExitLight() {
    const w = this.exitWall;
    const glow = glowTex();
    this.texs.push(glow);
    const cur = this.mat(new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.45, 1.35), side: THREE.DoubleSide }));
    const g = new THREE.PlaneGeometry(w.dw, w.dh);
    const m = this.addMesh(g, cur, false, false);
    m.position.set(w.f.x + w.dx, w.f.y + w.dh / 2, w.f.z - 0.2);
    m.updateMatrix();
    const halo = this.mat(new THREE.SpriteMaterial({ map: glow, color: 0xfff0e0, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.halo = new THREE.Sprite(halo);
    this.halo.position.set(w.f.x + w.dx, w.f.y + w.dh / 2, w.f.z + w.T / 2 + 0.4);
    this.halo.scale.set(7, 8, 1);
    this.dynamic.add(this.halo);
    this.exitLight = new THREE.PointLight(0xfff0e0, 6, 14, 1.6);
    this.exitLight.position.set(w.f.x + w.dx, w.f.y + 2.2, w.f.z + w.T / 2 + 1.2);
    this.dynamic.add(this.exitLight);
  }

  // Ilhas enfeitadas boiando ao longe (tudo numa malha só, por material).
  makeFar() {
    const list = farIslands(6969);
    const top = new GeoBuilder();
    const body = new GeoBuilder();
    const FB = new Builder();
    const m = new THREE.Matrix4();
    for (const o of list) {
      const I = { x: o.x, z: o.z, r: o.r, y: o.y, s: o.s };
      const { top: t, body: b } = islandGeos(I, 40, 4);
      m.identity();
      top.addGeometry(t, m, [0.62, 0.78, 0.52]);
      body.addGeometry(b, m, [0.86, 0.68, 0.76]);
      t.dispose();
      b.dispose();
      const r = mulberry32(Math.floor(o.s * 977));
      for (let i = 0; i < o.houses; i++) {
        const a = r() * TAU;
        const d = r() * o.r * 0.45;
        FB.house(o.x + Math.cos(a) * d, o.z + Math.sin(a) * d, r() * TAU, I, { w: 5 + r() * 3, d: 5 + r() * 2, h: 2.8 + r(), porch: r() < 0.4 });
      }
      for (let i = 0; i < o.trees; i++) {
        const a = r() * TAU;
        const d = (0.3 + r() * 0.5) * o.r;
        FB.tree(o.x + Math.cos(a) * d, o.z + Math.sin(a) * d, I, i);
      }
    }
    this.addMesh(top.build(), this.M.grass, false, false);
    this.addMesh(body.build(), this.M.far, false, false);
    for (const k in FB.G) if (!FB.G[k].empty) this.addMesh(FB.G[k].build(), this.M[k], false, false);
  }

  makeGrass() {
    const Q = this.Q;
    const map = bladeTex();
    this.texs.push(map);
    const g = new THREE.BufferGeometry();
    const pos = [];
    const nor = [];
    const uv = [];
    for (const a of [0, Math.PI / 3, (2 * Math.PI) / 3]) {
      const cx = Math.cos(a) * 0.28;
      const cz = Math.sin(a) * 0.28;
      const P = [
        [-cx, 0, -cz],
        [cx, 0, cz],
        [cx, 0.36, cz],
        [-cx, 0, -cz],
        [cx, 0.36, cz],
        [-cx, 0.36, -cz],
      ];
      const U = [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 0],
        [1, 1],
        [0, 1],
      ];
      for (let i = 0; i < 6; i++) {
        pos.push(...P[i]);
        nor.push(0, 1, 0);
        uv.push(...U[i]);
      }
    }
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    this.geos.push(g);
    const m = this.mat(new THREE.MeshStandardMaterial({ map, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 1, color: 0xf4ffe4, emissive: 0x1c2814 }));
    this.grassR = Q.id === 'low' ? 13 : Q.id === 'medium' ? 19 : 25;
    const n = Math.ceil((this.grassR * 2) / 1.3) ** 2;
    this.grass = new THREE.InstancedMesh(g, m, n);
    this.grass.count = 0;
    this.grass.frustumCulled = false;
    this.scene.add(this.grass);
  }

  refreshGrass(px, pz) {
    const c = 1.3;
    const R = this.grassR;
    const mtx = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const v = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    let n = 0;
    const cols = this.colliders.filter((b) => b.x1 > px - R && b.x0 < px + R && b.z1 > pz - R && b.z0 < pz + R);
    for (let i = Math.floor((px - R) / c); i <= Math.floor((px + R) / c); i++)
      for (let j = Math.floor((pz - R) / c); j <= Math.floor((pz + R) / c); j++) {
        const x = (i + hash3(i, j, 691)) * c;
        const z = (j + hash3(i, j, 692)) * c;
        if ((x - px) ** 2 + (z - pz) ** 2 > R * R) continue;
        const I = onIsland(x, z, 0.8);
        if (!I || this.B.isPaved(x, z)) continue;
        if (cols.some((b) => Math.abs((x - b.x) * b.c - (z - b.z) * b.s) < b.hx + 0.2 && Math.abs((x - b.x) * b.s + (z - b.z) * b.c) < b.hz + 0.2)) continue;
        const k = 0.7 + hash3(i, j, 693) * 0.7;
        v.set(x, I.y - 0.02, z);
        q.setFromAxisAngle(up, hash3(i, j, 694) * TAU);
        s.set(k, k * (0.8 + hash3(i, j, 695) * 0.5), k);
        this.grass.setMatrixAt(n++, mtx.compose(v, q, s));
        if (n >= this.grass.instanceMatrix.count) break;
      }
    this.grass.count = n;
    this.grass.instanceMatrix.needsUpdate = true;
    this.grassAt = { x: px, z: pz };
  }

  // Poeira dourada flutuando no ar.
  makeMotes() {
    const n = this.Q.id === 'low' ? 120 : 260;
    const r = mulberry32(6902);
    const p = new Float32Array(n * 3);
    for (let i = 0; i < n * 3; i++) p[i] = (r() - 0.5) * 40;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    this.geos.push(g);
    const tex = glowTex();
    this.texs.push(tex);
    const m = this.mat(new THREE.PointsMaterial({ map: tex, size: 0.14, color: 0xffe2c8, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.motes = new THREE.Points(g, m);
    this.motes.frustumCulled = false;
    this.scene.add(this.motes);
    this.moteBase = p.slice();
  }

  spawnItems() {
    const g = this.game;
    const list = [
      { type: 'note', key: '69:n1', x: -6, z: 2.0, rot: 0.4 },
      { type: 'note', key: '69:n2', x: ISLANDS[1].x + 6, z: ISLANDS[1].z - 3, rot: 1.2 },
      { type: 'note', key: '69:n3', x: ISLANDS[2].x - 6, z: ISLANDS[2].z - 1, rot: 2.1 },
      { type: 'water', key: '69:w1', x: 7, z: 4, rot: 0 },
    ];
    for (const it of list) {
      if (this.taken.has(it.key)) continue;
      const I = onIsland(it.x, it.z, 0) || ISLANDS[0];
      g.items.spawn({ ...it, y: I.y + 0.02, light: 1 }, this.dynamic);
    }
  }

  // ------------------------------------------------------------ quadro
  update(dt, player) {
    const g = this.game;
    const p = player.pos;
    this.time += dt;
    const t = this.time;
    if (this.wake === undefined) this.startWake();
    if (this.wake.active) this.wake.update(dt);
    const cam = g.camera.position;
    this.sky.position.copy(cam);
    this.sky.material.uniforms.uTime.value = t;
    this.sea.material.uniforms.uTime.value = t;
    this.sea.material.uniforms.uCam.value.copy(cam);
    this.sea.position.x = cam.x;
    this.sea.position.z = cam.z;
    this.sea.updateMatrix();
    this.updateSun(p);
    // balanço se mexendo sozinho
    for (let i = 0; i < this.swingObjs.length; i++) this.swingObjs[i].rotation.x = Math.sin(t * 1.3 + i) * 0.38;
    // poeira dourada em volta do jogador
    const mp = this.motes.geometry.attributes.position;
    for (let i = 0; i < mp.count; i++) {
      const bx = this.moteBase[i * 3];
      const by = this.moteBase[i * 3 + 1];
      const bz = this.moteBase[i * 3 + 2];
      const y = ((((by + t * 0.25 + 20) % 40) + 40) % 40) - 20;
      mp.setXYZ(i, bx + Math.sin(t * 0.3 + i) * 0.6, y * 0.3 + 1.5, bz + Math.cos(t * 0.27 + i * 1.7) * 0.6);
    }
    mp.needsUpdate = true;
    this.motes.position.set(Math.round(p.x / 40) * 40, p.y, Math.round(p.z / 40) * 40);
    this.halo.material.opacity = 0.55 + Math.sin(t * 1.7) * 0.15;
    if (Math.hypot(p.x - this.grassAt.x, p.z - this.grassAt.z) > 4) this.refreshGrass(p.x, p.z);
    // névoa dos sonhos: um leve desfoque que respira
    this.blur = 0.05 + Math.sin(t * 0.4) * 0.02;
    if (this.wake.active || this.done) return;
    this.updateFall(dt, p);
    this.talk(p);
    this.checkExit(p);
  }

  startWake() {
    const g = this.game;
    const s = this.spawn;
    this.wake = standardWake(
      this,
      s.x,
      s.z,
      s.yaw,
      [
        [1.0, 'Grama morna. Um céu lilás, cor-de-rosa, pêssego.'],
        [4.4, 'O sol está se pondo… e parece que nunca termina de se pôr.'],
        [7.4, 'Silêncio. Só o vento. E nenhum chão lá embaixo.'],
        [10.2, ''],
      ],
      {
        sound: 'breath',
        done: () =>
          g.hud.say(
            [
              'Uma ilha… flutuando no céu?',
              'Casas de azulejo, tão limpinhas. Ninguém mora aqui, dá pra sentir.',
              'Esse pôr do sol parece uma lembrança de quando eu era criança.',
            ],
            () => g.hud.objective('Explore o vilarejo flutuante. Cuidado com as bordas.', 6),
          ),
      },
    );
  }

  talk(p) {
    const g = this.game;
    if (g.hud.dlg) return;
    const I = onIsland(p.x, p.z, -1);
    const br = onBridge(p.x, p.z, 0.5);
    const near = (x, z, d) => Math.hypot(p.x - x, p.z - z) < d;
    const say = (id, lines, cb) => {
      if (this.said(id)) return false;
      g.hud.say(lines, cb);
      return true;
    };
    if (near(-5.5, -4, 7) && say('pool', ['A água não tem uma onda sequer. Parece vidro.', 'Dá pra ver o céu inteiro refletido nela.'])) return;
    if (near(12, 20, 7) && say('wall', ['Um paredão amarelo no meio da grama… com uma passagem.', 'Do outro lado é só mais grama. Pra que serve isso?'])) return;
    if (I && edgeDist(I, p.x, p.z) < 4 && say('edge', ['Lá embaixo só tem nuvens. Não dá pra ver o chão.', 'Talvez não exista chão.'])) return;
    if (br && say('bridge', ['Uma ponte para a outra ilha.', 'Não olhe pra baixo. Não olhe pra baixo.'], () => g.completeObjective('vila', 'O vilarejo está vazio. Todas as portas trancadas.'))) return;
    if (I === ISLANDS[1] && say('swing', ['Um balanço… se mexendo sozinho.', 'Eu juro que já brinquei num desses. Num quintal que eu não lembro mais.'])) return;
    if (I === ISLANDS[2] && say('stairs', ['Uma escada que não leva a lugar nenhum.', 'E uma porta… sem parede nenhuma em volta.'])) return;
    if (I === D) {
      g.completeObjective('pontes', 'A última ilha. O paredão amarelo brilha.');
      if (say('end', ['Aquele paredão… igual ao do vilarejo, só que enorme.', 'E tem luz do outro lado da passagem. Uma luz quente.'])) return;
    }
  }

  said(id) {
    this._said = this._said || new Set();
    if (this._said.has(id)) return true;
    this._said.add(id);
    return false;
  }

  checkExit(p) {
    const w = this.exitWall;
    if (this.done) return;
    if (Math.abs(p.x - (w.f.x + w.dx)) < w.dw / 2 && p.z < w.f.z + 0.2 && p.z > w.f.z - w.T) {
      this.done = true;
      const g = this.game;
      g.completeObjective('porta', 'A luz te envolve.');
      g.post.u.uFadeColor.value.setRGB(1, 0.95, 0.92);
      this.whiteFade = true;
      g.reachExit('noclip', 0.1);
    }
  }

  // ------------------------------------------------------------ queda
  updateFall(dt, p) {
    const g = this.game;
    const F = this.fall;
    if (!F) {
      // depois de acordar, o fade volta a ser preto quando a tela clareia
      if (this.fadeBack && g.fade < 0.02) {
        this.fadeBack = false;
        g.post.u.uFadeColor.value.setRGB(0, 0, 0);
      }
      const I = onIsland(p.x, p.z, 0.3);
      if ((I && edgeDist(I, p.x, p.z) > 2.5) || onBridge(p.x, p.z, -0.6)) {
        this.safe.x = p.x;
        this.safe.z = p.z;
      }
      return;
    }
    F.t += dt;
    if (F.t > 0.15 && !F.sound) {
      F.sound = true;
      g.audio.play('transition', { gain: 0.2, rate: 0.7 });
      g.hud.message('…', 2);
    }
    // a tela clareia, como quem acorda
    g.post.u.uFadeColor.value.setRGB(1, 0.93, 0.95);
    g.fadeTarget = smoothstep(0.9, 2.0, F.t);
    g.fade = Math.max(g.fade, g.fadeTarget);
    if (F.t > 2.3) {
      this.fall = null;
      const P = g.player;
      P.pos.set(this.safe.x, onIsland(this.safe.x, this.safe.z, -2) ? onIsland(this.safe.x, this.safe.z, -2).y : 0, this.safe.z);
      P.vel.set(0, 0, 0);
      g.fade = 1;
      g.fadeTarget = 0;
      this.fadeBack = true;
      g.sanity = Math.max(0, g.sanity - 4);
      g.hud.message('Você acorda de novo no mesmo lugar. Como num sonho.', 4);
      this.falls = (this.falls || 0) + 1;
      if (this.falls === 1) setTimeout(() => this.game.level === this && !this.game.hud.dlg && this.game.hud.say(['Eu caí… e voltei. Nada aqui é de verdade.', 'Ou tudo é, e eu é que não sou.']), 2200);
    }
  }

  // ------------------------------------------------------------ física
  collide(p, r) {
    if (this.fall || (this.wake && this.wake.active)) return p;
    for (let it = 0; it < 2; it++) {
      for (const b of this.colliders) {
        if (p.x < b.x0 - 1 || p.x > b.x1 + 1 || p.z < b.z0 - 1 || p.z > b.z1 + 1) continue;
        // para o espaço da caixa (local = mundo girado de volta)
        const dx = p.x - b.x;
        const dz = p.z - b.z;
        _q.x = dx * b.c - dz * b.s;
        _q.z = dx * b.s + dz * b.c;
        pushCircle(_q, r, -b.hx, b.hx, -b.hz, b.hz);
        p.x = b.x + _q.x * b.c + _q.z * b.s;
        p.z = b.z - _q.x * b.s + _q.z * b.c;
      }
      for (const q of this.circles) {
        const dx = p.x - q[0];
        const dz = p.z - q[1];
        const d = Math.hypot(dx, dz);
        const rr = r + q[2];
        if (d < rr && d > 1e-4) {
          p.x = q[0] + (dx / d) * rr;
          p.z = q[1] + (dz / d) * rr;
        }
      }
    }
    if (onIsland(p.x, p.z, 0.3)) return p;
    // nas pontes, o guarda-corpo segura
    const br = onBridge(p.x, p.z, 1.2);
    if (br) {
      const lim = BRIDGE_HW - r - 0.1;
      if (Math.abs(br.lat) > lim) {
        const b = br.b;
        const d = Math.sign(br.lat) * (Math.abs(br.lat) - lim);
        p.x -= -b.uz * d;
        p.z -= b.ux * d;
      }
      return p;
    }
    // fora de tudo: cai
    this.fall = { t: 0, y0: this.game.player.pos.y };
    return p;
  }

  groundY(x, z) {
    if (this.fall) return this.fall.y0 - 9 * this.fall.t * this.fall.t - 2 * this.fall.t;
    const br = onBridge(x, z, 0.4);
    const I = onIsland(x, z, -1.5);
    if (br && (!I || br.y > I.y)) return br.y;
    if (I) return I.y;
    return this.game.player.pos.y;
  }

  surfaceAt(x, z) {
    if (onBridge(x, z, 0.2) || this.B.isPaved(x, z)) return 'tile';
    return 'grass';
  }

  los() {
    return true;
  }

  lightLevel() {
    return 1;
  }

  interactable(P) {
    if (this.fall || this.done) return null;
    const g = this.game;
    for (const d of this.B.doors) {
      if (Math.hypot(P.pos.x - d.x, P.pos.z - d.z) > 1.4) continue;
      if (d.kind === 'lone')
        return {
          label: 'Abrir a porta',
          action: () => {
            g.audio.door();
            g.hud.message('A porta abre… do outro lado, só a mesma grama e o mesmo céu. Você fecha de novo.', 5);
          },
        };
      return {
        label: 'Bater na porta',
        action: () => {
          g.audio.play('knock', { gain: 0.4 });
          const msgs = ['Ninguém responde. Lá dentro, uma TV chia baixinho.', 'Trancada. Pela fresta, cheiro de bolo assando.', 'Silêncio. Você tem certeza de que alguém riu.', 'Trancada. Tem um desenho seu colado na janela? Não pode ser.'];
          this.knocks = (this.knocks || 0) + 1;
          g.hud.message(msgs[this.knocks % msgs.length], 4);
        },
      };
    }
    return null;
  }

  navTarget() {
    const p = this.game.player.pos;
    const br = onBridge(p.x, p.z, 1);
    if (br && br.t > 0.02) return { x: br.b.x1, z: br.b.z1 };
    const I = onIsland(p.x, p.z, -2);
    const idx = I ? ISLANDS.indexOf(I) : -1;
    if (idx >= 0 && idx < BRIDGES.length) {
      const b = BRIDGES[idx];
      if (Math.hypot(p.x - b.x0, p.z - b.z0) > 2.5) return { x: b.x0, z: b.z0 };
      return { x: b.x1, z: b.z1 };
    }
    return this.exit;
  }

  exitEmitter() {
    return { x: this.exit.x, y: D.y + 2, z: this.exit.z };
  }

  dispose() {
    if (this.wake) this.wake.dispose();
    if (this.whiteFade || this.fadeBack || this.fall) this.game.post.u.uFadeColor.value.setRGB(0, 0, 0);
    for (const m of this.meshes) m.removeFromParent();
    this.scene.remove(this.grass, this.motes);
    super.dispose();
    for (const x of this.geos) x.dispose();
    for (const m of this.mats) m.dispose();
    for (const t of this.texs) t.dispose();
    disposeBuildCache();
    this.scene.remove(this.hemi, this.sun, this.sun.target);
  }
}

