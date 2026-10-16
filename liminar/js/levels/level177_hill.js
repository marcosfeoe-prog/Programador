// Nível 177, Área 4 — campos abertos de grama baixa e uma montanha enorme no
// pôr do sol. No alto, uma fogueira acesa e uma carta sobre o aniversário do
// Mike. Depois de ler a carta, o andarilho é levado para a última área.
import * as THREE from 'three';
import { OutdoorLevel, makeSky } from './outdoor.js';
import { pushCircle } from './grid.js';
import { lerp, mulberry32, smoothstep, TAU } from '../util.js';
import { music, preloadTrack, rememberTrack, TRACK_B, dotTex, flameTex, grassTex, bladeTex, GrassTufts, Puffs, Fire } from './level177_common.js';

const TOP = { x: 12, z: -195 };
const CEN = { x: 0, z: -140 };
const R_WALK = 240;

function groundH(x, z) {
  const d = Math.hypot(x - TOP.x, z - TOP.z);
  const m = 58 * Math.exp(-((d / 78) ** 2)) + 6 * Math.exp(-((d / 30) ** 2));
  const ridge = 2.2 * Math.sin(x * 0.05 + z * 0.03) * Math.exp(-((d / 110) ** 2));
  const roll = 0.9 * Math.sin(x * 0.03 + 1) * Math.sin(z * 0.025) + 0.4 * Math.sin(x * 0.07 - z * 0.05);
  // topo levemente achatado para a fogueira
  const top = smoothstep(3, 9, d);
  const h = m + ridge + roll;
  const hTop = 58 + 6 + 0.9 * Math.sin(TOP.x * 0.03 + 1) * Math.sin(TOP.z * 0.025);
  return lerp(hTop, h, top);
}

const LETTER =
  'Mike, hoje é o seu aniversário. Subimos o morro como todo ano: acendemos a fogueira, trouxemos o bolo de chocolate, as velas e o violão. ' +
  'Esperamos você até a lenha virar brasa. Você não veio. Ninguém te viu sair de casa, ninguém sabe para onde você foi. Procuramos por meses. ' +
  'Desde aquela noite você sumiu — e nunca mais teve outro aniversário. Todo ano, nesse mesmo dia, alguém sobe aqui e acende o fogo de novo, só por garantia. ' +
  'Se um dia você ler isto: a gente ainda está esperando. Volta pra casa. — Seus amigos';

export class Level177Hill extends OutdoorLevel {
  constructor(game) {
    super(game, { P: 100, walkSpeed: 2.3, camFar: 3000 });
    this.num = 177;
    this.time = 0;
    this.colliders = [];
    this.circles = [];
    this.geos = [];
    this.mats = [];
    this.texs = [];
    this.look = {
      exposure: 1.05,
      tint: [1.06, 0.97, 0.9],
      sat: 1.1,
      contrast: 1.06,
      lift: [0.02, 0.012, 0.02],
      bloom: 0.3,
      bloomThreshold: 1.0,
      fog: [0.92, 0.6, 0.45],
      lightColor: [1, 1, 1],
      flashlight: false,
      ambience: 'level177_4',
      reverb: 0.8,
      sanityDrain: 0.02,
    };
    this.objectives = [
      { id: 'subir', text: 'Suba a montanha até a fumaça' },
      { id: 'carta', text: 'Leia a carta perto da fogueira' },
    ];
    const fogC = new THREE.Color(...this.look.fog);
    this.scene.fog = new THREE.FogExp2(fogC, 0.0028);
    this.scene.background = fogC;
    this.sunV = new THREE.Vector3(-0.82, 0.07, -0.56).normalize();
    this.sky = makeSky({
      zenith: [0.22, 0.26, 0.5],
      horizon: [1.0, 0.56, 0.32],
      ground: [0.4, 0.3, 0.25],
      fog: this.look.fog,
      sunDir: this.sunV,
      sunColor: [1.5, 0.75, 0.35],
      sunDisk: 1.6,
      cloudA: [0.55, 0.3, 0.35],
      cloudB: [1.0, 0.62, 0.45],
      cover: 0.48,
    });
    this.scene.add(this.sky);
    this.setupLights({
      sky: 0xffc8a0,
      ground: 0x50402c,
      hemi: 1.15,
      sunColor: 0xffa66a,
      sun: 2.3,
      sunDir: new THREE.Vector3(-0.8, 0.22, -0.55),
      shadowExtent: 40,
      shadowFar: 600,
    });
    this.shadowDist = 260;
    this.spawn = { x: 0, z: 0, yaw: Math.atan2(-(TOP.x - 0), -(TOP.z - 0)) };
    this.exit = { x: TOP.x, z: TOP.z + 2.5 };
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
    await preloadTrack(this.game, TRACK_B);
    progress(0.2);
    this.makeGround();
    progress(0.45);
    await new Promise((r) => setTimeout(r, 0));
    this.makeRing();
    this.makeRocks();
    this.makeCamp();
    const bl = bladeTex(60, 95, 20, 62, 41);
    this.texs.push(bl);
    this.tufts = new GrassTufts(this, bl, this.Q.id === 'low' ? 14 : 22, 0.26);
    this.tufts.refresh(px, pz, groundH, (x, z) => Math.hypot(x - TOP.x, z - TOP.z) < 4);
    this.updateSun({ x: px, z: pz });
    progress(1);
  }

  makeGround() {
    const Q = this.Q;
    const step = Q.id === 'low' ? 4 : 2.5;
    const S = 560;
    const n = Math.round(S / step);
    const geo = new THREE.PlaneGeometry(S, S, n, n);
    geo.rotateX(-Math.PI / 2);
    geo.translate(CEN.x, 0, CEN.z);
    const p = geo.attributes.position;
    const col = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const z = p.getZ(i);
      const y = groundH(x, z);
      p.setY(i, y);
      // mais rochoso e seco no alto
      const k = smoothstep(25, 55, y);
      col.set([lerp(1, 0.85, k), lerp(1, 0.78, k), lerp(1, 0.7, k)], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    this.geos.push(geo);
    const map = grassTex(Math.min(1024, Q.tex), '#5a8a34', 70, 110, 28, 52, 1774);
    map.repeat.set(S / 5, S / 5);
    this.texs.push(map);
    this.ground = new THREE.Mesh(geo, this.mat(new THREE.MeshStandardMaterial({ map, vertexColors: true, roughness: 0.95 })));
    this.ground.receiveShadow = Q.shadows;
    this.ground.castShadow = Q.shadows;
    this.scene.add(this.ground);
  }

  // Serras distantes, em silhueta contra o pôr do sol.
  makeRing() {
    const segA = 220;
    const segR = 14;
    const pos = [];
    const col = [];
    const idx = [];
    for (let j = 0; j <= segR; j++) {
      const t = j / segR;
      const r = lerp(420, 1600, t);
      for (let i = 0; i <= segA; i++) {
        const a = (i / segA) * TAU;
        const ridge = Math.abs(Math.sin(t * Math.PI * 2.4 + Math.sin(a * 4) * 0.7));
        const peak = 0.55 + 0.45 * Math.sin(a * 6 + t * 3) * Math.sin(a * 2.7 - t * 2 + 1);
        let y = (40 + 260 * t) * Math.pow(ridge, 0.8) * (0.5 + 0.5 * peak);
        if (j === 0) y = -15;
        pos.push(CEN.x + Math.cos(a) * r, y - 6, CEN.z + Math.sin(a) * r);
        const f = 0.25 + t * 0.6;
        col.push(lerp(0.32, 0.95, f), lerp(0.22, 0.6, f), lerp(0.3, 0.5, f));
      }
    }
    const W = segA + 1;
    for (let j = 0; j < segR; j++)
      for (let i = 0; i < segA; i++) {
        const a = j * W + i;
        idx.push(a, a + W, a + 1, a + 1, a + W, a + W + 1);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    this.geos.push(g);
    this.ring = new THREE.Mesh(g, this.mat(new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, fog: false })));
    this.ring.frustumCulled = false;
    this.scene.add(this.ring);
  }

  // Pedras pela encosta e montinhos de pedra marcando o caminho até o topo.
  makeRocks() {
    const r = mulberry32(4177);
    const rock = this.mat(new THREE.MeshStandardMaterial({ color: 0x8a7a6e, roughness: 0.95, flatShading: true }));
    for (let k = 0; k < 70; k++) {
      const a = r() * TAU;
      const d = 15 + r() * 90;
      const x = TOP.x + Math.cos(a) * d;
      const z = TOP.z + Math.sin(a) * d;
      const s = 0.4 + r() * 1.4;
      const m = this.mesh(new THREE.DodecahedronGeometry(s, 0), rock, x, groundH(x, z) + s * 0.3, z);
      m.rotation.set(r() * 3, r() * 3, r() * 3);
      m.scale.y = 0.6;
      this.circles.push([x, z, s * 0.8]);
    }
    for (let k = 1; k < 9; k++) {
      const t = k / 9;
      const x = lerp(0, TOP.x, t) + Math.sin(t * 9) * 6 + 3;
      const z = lerp(0, TOP.z, t);
      for (let j = 0; j < 3; j++) {
        const s = 0.32 - j * 0.08;
        this.mesh(new THREE.DodecahedronGeometry(s, 0), rock, x, groundH(x, z) + 0.2 + j * 0.38, z);
      }
      this.circles.push([x, z, 0.35]);
    }
  }

  // A fogueira no topo, pedras em volta e a carta numa pedra lisa.
  makeCamp() {
    const y = groundH(TOP.x, TOP.z);
    this.topY = y;
    const logM = this.mat(new THREE.MeshStandardMaterial({ color: 0x4a3020, roughness: 0.9 }));
    const coal = this.mat(new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 0.4, 0.1) }));
    const stone = this.mat(new THREE.MeshStandardMaterial({ color: 0x6a625c, roughness: 0.95, flatShading: true }));
    for (let k = 0; k < 4; k++) {
      const lg = this.mesh(new THREE.CylinderGeometry(0.07, 0.08, 1.0, 7), logM, TOP.x, y + 0.15, TOP.z);
      lg.rotation.set(Math.PI / 2 - 0.35, (k / 4) * TAU, 0, 'YXZ');
    }
    this.mesh(new THREE.CylinderGeometry(0.35, 0.4, 0.06, 12), coal, TOP.x, y + 0.03, TOP.z);
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * TAU;
      this.mesh(new THREE.DodecahedronGeometry(0.16, 0), stone, TOP.x + Math.cos(a) * 0.65, y + 0.08, TOP.z + Math.sin(a) * 0.65);
    }
    this.circles.push([TOP.x, TOP.z, 0.75]);
    this.dot = dotTex();
    this.flame = flameTex();
    this.texs.push(this.dot, this.flame);
    this.fire = new Fire(this.dynamic, this.flame, TOP.x, y + 0.05, TOP.z, { scale: 1.6, intensity: 10, dist: 14 });
    this.smoke = new Puffs(this.dynamic, this.dot, { n: 20, size: 0.6, grow: 2, rise: 1.6, life: 6, spread: 0.4, opacity: 0.3, color: 0x6a6460 });
    this.smoke.origin.set(TOP.x, y + 1.2, TOP.z);
    this.embers = new Puffs(this.dynamic, this.dot, { n: 14, size: 0.05, grow: 0, rise: 0.9, life: 2.2, spread: 0.6, opacity: 1, color: 0xffa040 });
    this.embers.origin.set(TOP.x, y + 0.4, TOP.z);
    for (const p of this.embers.list) p.s.material.blending = THREE.AdditiveBlending;
    // tocos para sentar e a carta
    for (const [ax, az] of [
      [-1.8, 0.6],
      [1.6, -1.2],
    ]) {
      this.mesh(new THREE.CylinderGeometry(0.25, 0.28, 0.42, 10), logM, TOP.x + ax, y + 0.21, TOP.z + az);
      this.circles.push([TOP.x + ax, TOP.z + az, 0.3]);
    }
    const lx = TOP.x + 1.5;
    const lz = TOP.z + 1.1;
    const rk = this.mesh(new THREE.CylinderGeometry(0.45, 0.55, 0.3, 9), stone, lx, groundH(lx, lz) + 0.12, lz);
    rk.scale.y = 1;
    const paper = this.mesh(new THREE.PlaneGeometry(0.22, 0.28), this.mat(new THREE.MeshStandardMaterial({ color: 0xf0e6d0, roughness: 0.9, emissive: 0x302820 })), lx, groundH(lx, lz) + 0.28, lz);
    paper.rotation.set(-Math.PI / 2, 0, 0.5);
    this.letterPos = { x: lx, z: lz };
    this.circles.push([lx, lz, 0.5]);
  }

  update(dt, player) {
    const g = this.game;
    const p = player.pos;
    this.time += dt;
    const t = this.time;
    const cam = g.camera.position;
    this.sky.position.copy(cam);
    this.sky.material.uniforms.uTime.value = t;
    this.updateSun(p);
    if (!this.lastP || Math.hypot(p.x - this.lastP.x, p.z - this.lastP.z) > 2.5) {
      this.lastP = { x: p.x, z: p.z };
      this.tufts.refresh(p.x, p.z, groundH, (x, z) => Math.hypot(x - TOP.x, z - TOP.z) < 4);
    }
    this.fire.update(t);
    this.smoke.update(dt);
    this.embers.update(dt);
    const tr = music(this, TRACK_B, 0.6);
    if (tr && !this.musSet) {
      this.musSet = true;
      tr.setRate(1, 0.1);
      tr.setFx(0, 0.1);
    }
    const dTop = Math.hypot(p.x - TOP.x, p.z - TOP.z);
    if (t > 2.5) this.say('a', ['Um pôr do sol… faz tanto tempo que eu não via o sol.', 'Lá no alto da montanha tem fumaça. Uma fogueira?']);
    if (dTop < 95) this.say('b', ['Eu conheço esse caminho. Meus pés conhecem.']);
    if (dTop < 9) {
      this.say('c', ['Era aqui. A gente subia aqui todo aniversário.', 'Tem uma carta perto do fogo.']);
      if (!g.objectiveDone('subir')) g.completeObjective('subir', 'No topo, uma fogueira acesa. Ninguém em volta.');
    }
    // depois da carta: falas e, em seguida, a última área
    if (this.reading && !g.hud.noteOpen) {
      this.reading = false;
      g.completeObjective('carta', 'Você sumiu no dia do seu aniversário.');
      g.hud.stopSay();
      g.hud.say(
        ['Eu… sumi? No dia do meu próprio aniversário?', 'Ninguém nunca mais acendeu velas pra mim.', 'Por que eu não consigo lembrar?'],
        () => g.level === this && g.enterLevel('177.5', 'none', 0.3),
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

  collide(p, r) {
    const dx = p.x - CEN.x;
    const dz = p.z - CEN.z;
    const d = Math.hypot(dx, dz);
    if (d > R_WALK) {
      p.x = CEN.x + (dx / d) * R_WALK;
      p.z = CEN.z + (dz / d) * R_WALK;
    }
    for (const c of this.circles) {
      const ex = p.x - c[0];
      const ez = p.z - c[1];
      if (Math.abs(ex) > c[2] + 1 || Math.abs(ez) > c[2] + 1) continue;
      const dd = Math.hypot(ex, ez);
      const rr = r + c[2];
      if (dd < rr && dd > 1e-4) {
        p.x = c[0] + (ex / dd) * rr;
        p.z = c[1] + (ez / dd) * rr;
      }
    }
    for (const b of this.colliders) pushCircle(p, r, b[0], b[1], b[2], b[3]);
    return p;
  }

  groundY(x, z) {
    return groundH(x, z);
  }

  surfaceAt(x, z) {
    return groundH(x, z) > 40 ? 'dirt' : 'grass';
  }

  los() {
    return true;
  }

  lightLevel() {
    return 0.9;
  }

  interactable(player) {
    const p = player.pos;
    const L = this.letterPos;
    if (!this.game.objectiveDone('carta') && !this.reading && Math.hypot(p.x - L.x, p.z - L.z) < 1.8)
      return {
        label: 'Ler a carta',
        action: () => {
          const g = this.game;
          g.audio.paper();
          if (!g.objectiveDone('subir')) g.completeObjective('subir');
          g.hud.showNote(LETTER);
          this.reading = true;
        },
      };
    return null;
  }

  navTarget() {
    return this.game.objectiveDone('subir') ? this.letterPos : this.exit;
  }

  exitEmitter() {
    return { x: TOP.x, y: this.topY + 0.5, z: TOP.z, sound: 'fire', gain: 0.35 };
  }

  dispose() {
    rememberTrack(this);
    this.fire.dispose();
    this.smoke.dispose();
    this.embers.dispose();
    this.tufts.dispose();
    super.dispose();
    for (const o of [this.sky, this.ground, this.ring]) this.scene.remove(o);
    this.sky.geometry.dispose();
    this.sky.material.dispose();
    for (const x of this.geos) x.dispose();
    for (const m of this.mats) m.dispose();
    for (const t of this.texs) t.dispose();
    this.scene.remove(this.hemi, this.sun, this.sun.target);
  }
}
