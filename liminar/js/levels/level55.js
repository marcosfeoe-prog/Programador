// Nível 55 — "Manequins" (Classe 4). Duas seções:
//   1) uma área gigante de corredores longos de painéis amarelos esmaltados,
//      teto amarelo perfurado, granilite e escadas com corrimão de inox. Aqui
//      moram os Manequins: só se mexem quando ninguém está olhando, e um toque
//      mata na hora (o andarilho volta para o começo da seção). De tempos em
//      tempos você pisca — e eles aproveitam;
//   2) mais adiante as paredes mudam: corredores de hotel creme e azul, com
//      carpete azul e passadeiras. É mais seguro: os Manequins não chegam aqui.
import * as THREE from 'three';
import { OutdoorLevel } from './outdoor.js';
import { indoorEnvTex, TEX } from '../textures.js';
import { clamp, mulberry32 } from '../util.js';
import { standardWake } from './wake.js';
import { Map55 } from './level55_map.js';
import * as BLD from './level55_build.js';
import { Mannequins, POSES } from './level55_mannequin.js';

// ------------------------------------------------------------ base comum
class Level55Base extends OutdoorLevel {
  constructor(game, o) {
    super(game, { walkSpeed: 2.25, camFar: 160 });
    this.o = o;
    this.num = 55;
    this.indoor = true;
    this.time = 0;
    this.mats = [];
    this.geos = [];
    this.texs = [];
    this.meshes = [];
    this.M = new Map55(o.map);
    const n0 = this.M.nodes[0];
    // sai olhando para o primeiro corredor
    const l = n0.links[0];
    const yaw = Math.atan2(-(l.x - n0.x), -(l.z - n0.z));
    this.spawn = { x: n0.x, z: n0.z, yaw };
    this.exitNode = this.M.farthest(n0);
    this.makeExitStub();
    this.scene.fog = new THREE.FogExp2(new THREE.Color(...o.look.fog), o.fogD);
    this.scene.background = new THREE.Color(0, 0, 0);
    this.amb = new THREE.AmbientLight(0xffffff, o.amb);
    this.scene.add(this.amb);
  }

  // um corredor curto saindo do último salão para fora da malha, com a saída na ponta
  makeExitStub() {
    const n = this.exitNode;
    const M = this.M;
    const dirs = [
      [1, 0],
      [-1, 0],
      [0, -1],
      [0, 1],
    ].filter(([dx, dz]) => !n.links.some((m) => Math.sign(m.x - n.x) === dx && Math.sign(m.z - n.z) === dz));
    // prefere a borda da malha
    dirs.sort((a, b) => {
      const out = (d) => (n.i === 0 && d[0] < 0) || (n.i === M.o.nx - 1 && d[0] > 0) || (n.j === 0 && d[1] > 0) || (n.j === M.o.nz - 1 && d[1] < 0);
      return (out(b) ? 1 : 0) - (out(a) ? 1 : 0);
    });
    const [dx, dz] = dirs[0] || [1, 0];
    const len = 9;
    const w = this.o.exitW;
    const ex = n.x + dx * (n.hw + len);
    const ez = n.z + dz * (n.hd + len);
    if (dx) M.rect(Math.min(n.x + dx * (n.hw - 2), ex), Math.max(n.x + dx * (n.hw - 2), ex), n.z - w / 2, n.z + w / 2, () => n.y, { stub: true });
    else M.rect(n.x - w / 2, n.x + w / 2, Math.min(n.z + dz * (n.hd - 2), ez), Math.max(n.z + dz * (n.hd - 2), ez), () => n.y, { stub: true });
    M.index();
    this.exitP = { x: ex, z: ez, y: n.y, dx, dz };
    this.exit = { x: ex - dx * 0.8, z: ez - dz * 0.8 };
  }

  mat(m) {
    this.mats.push(m);
    return m;
  }

  addMesh(geo, mat, parent = this.scene) {
    const m = new THREE.Mesh(geo, mat);
    m.matrixAutoUpdate = false;
    m.updateMatrix();
    this.geos.push(geo);
    parent.add(m);
    this.meshes.push(m);
    return m;
  }

  async preload(px, pz, progress) {
    const tick = () => new Promise((r) => setTimeout(r, 0));
    const M = this.M;
    this.lamps = this.lampList();
    const bake = BLD.bakeFn(M, this.lamps, this.o.bake);
    this.bake = bake;
    const memo = new Map();
    const light = (x, y, z, nx, ny, nz) => {
      const k = `${Math.round(x * 40)},${Math.round(y * 20)},${Math.round(z * 40)},${Math.round(nx * 4)},${Math.round(ny * 4)},${Math.round(nz * 4)}`;
      let v = memo.get(k);
      if (v === undefined) {
        v = bake(x, y, z, nx, ny, nz);
        memo.set(k, v);
      }
      return v;
    };
    this.makeMaterials();
    progress(0.1);
    await tick();
    const W = BLD.buildWalls(M, light, this.o.bands);
    for (const k in W) this.addMesh(W[k].build(), this.MT[k]);
    progress(0.45);
    await tick();
    const F = BLD.buildFloorCeil(M, light, this.o.fc);
    this.addMesh(F.floor, this.MT.floor);
    this.addMesh(F.ceil, this.MT.ceil);
    if (M.stairs.length) {
      const S = BLD.buildStairs(M, light, [0.78, 0.8, 0.82]);
      if (!S.step.empty) this.addMesh(S.step.build(), this.MT.floor);
      if (!S.strip.empty) this.addMesh(S.strip.build(), this.MT.trim);
      if (!S.rail.empty) this.addMesh(S.rail.build(), this.MT.steel);
    }
    progress(0.7);
    await tick();
    this.makeFixtures(light);
    this.makeExit(light);
    this.extra(light);
    progress(0.9);
    await tick();
    this.spawnItems();
    progress(1);
  }

  lightAt(x, y, z) {
    return this.bake ? this.bake(x, y, z, 0, 1, 0) : 1;
  }

  // ------------------------------------------------------------ física
  collide(p, r) {
    for (let it = 0; it < 4; it++) {
      const d = this.M.sdf(p.x, p.z);
      if (d <= -r) break;
      const g = this.M.grad(p.x, p.z);
      p.x -= g[0] * (d + r + 0.002);
      p.z -= g[1] * (d + r + 0.002);
    }
    return p;
  }

  groundY(x, z) {
    return this.M.floorY(x, z);
  }

  los(ax, az, bx, bz) {
    return this.M.clear(ax, az, bx, bz, 0.05);
  }

  lightLevel(x, z) {
    return clamp(this.lightAt(x, this.M.floorY(x, z) + 1, z), 0.05, 1);
  }

  navTarget() {
    return this.exit;
  }

  say(id, lines, cb) {
    this._said = this._said || new Set();
    if (this._said.has(id) || this.game.hud.dlg) return false;
    this._said.add(id);
    this.game.hud.say(lines, cb);
    return true;
  }

  spawnItems() {
    const g = this.game;
    const r = mulberry32(this.o.map.seed + 7);
    const list = [];
    const nodes = this.M.nodes.filter((n) => n !== this.M.nodes[0] && n.links.length === 1);
    nodes.slice(0, 4).forEach((n, i) => list.push({ type: i % 2 ? 'water' : 'note', key: `${this.o.key}:i${i}`, x: n.x + (r() - 0.5) * 2, z: n.z + (r() - 0.5) * 2, rot: r() * 6 }));
    for (const it of list) {
      if (this.taken.has(it.key)) continue;
      g.items.spawn({ ...it, y: this.M.floorY(it.x, it.z) + 0.01, light: this.lightAt(it.x, 1, it.z) }, this.dynamic);
    }
  }

  dispose() {
    if (this.wake) this.wake.dispose();
    for (const m of this.meshes) m.removeFromParent();
    super.dispose();
    for (const x of this.geos) x.dispose();
    for (const m of this.mats) m.dispose();
    for (const t of this.texs) t.dispose();
    this.scene.remove(this.amb);
  }
}

// ------------------------------------------------------------ seção 1
export class Level55 extends Level55Base {
  constructor(game) {
    const look = {
      exposure: 0.92,
      tint: [1.02, 1.0, 0.94],
      sat: 1.1,
      contrast: 1.08,
      lift: [0.01, 0.008, 0.0],
      bloom: 0.45,
      bloomThreshold: 0.82,
      fog: [0.12, 0.1, 0.02],
      fogNear: 0.2,
      lightColor: [1, 1, 0.96],
      flashlight: false,
      ambience: 'level55',
      reverb: 2.2,
      sanityDrain: 0.06,
    };
    super(game, {
      key: '55',
      look,
      fogD: 0.012,
      amb: 1.25,
      exitW: 2.6,
      map: { nx: 6, nz: 7, sp: 26, seed: 5501, hall: 8, wide: 3.2, narrow: 2.5, stairs: true, extra: 0.22, H: 3.2 },
      bake: { amb: 0.18, fall: 0.2, gain: 0.42, reach: 12, max: 1.15 },
      bands: [{ y0: 0, y1: 'H', off: 0, mat: 'wall', col: [1, 1, 1], uv: 2.6 }, { y0: 0, y1: 0.08, off: 0.012, mat: 'trim', col: [0.55, 0.56, 0.58], uv: 1, top: true }],
      fc: { floorUV: 2.5, ceilUV: 1.2, floorCol: [1, 1, 1], ceilCol: [1, 1, 1] },
    });
    this.look = look;
    this.objectives = [
      { id: 'saida', text: 'Atravesse os corredores amarelos até a luz no fim' },
      { id: 'olhe', text: 'Não tire os olhos dos Manequins' },
    ];
    this.blinkT = 14;
    this.blink = 0;
  }

  lampList() {
    // luminárias lineares em duas fileiras, ao longo de cada corredor e salão
    const out = [];
    const M = this.M;
    for (const s of M.shapes) {
      const along = s.hx > s.hz ? 'x' : 'z';
      const L = along === 'x' ? s.hx * 2 : s.hz * 2;
      const W = along === 'x' ? s.hz * 2 : s.hx * 2;
      const n = Math.max(1, Math.round(L / 3.2));
      const rows = W > 2.2 ? [-W / 4, W / 4] : [0];
      for (let i = 0; i < n; i++) {
        const u = -L / 2 + ((i + 0.5) * L) / n;
        for (const v of rows) {
          const x = along === 'x' ? s.cx + u : s.cx + v;
          const z = along === 'x' ? s.cz + v : s.cz + u;
          if (M.sdf(x, z) > -0.4) continue;
          if (out.some((l) => Math.abs(l.x - x) < 1.2 && Math.abs(l.z - z) < 1.2)) continue;
          out.push({ x, z, y: M.floorY(x, z) + M.H - 0.05, k: 1, along });
        }
      }
    }
    return out;
  }

  makeMaterials() {
    const S = Math.min(1024, this.Q.tex);
    // reflexos das luminárias no esmalte (como na foto)
    const env = this.game.makeEnv(indoorEnvTex(['#fff8c0', '#e8c000', '#6a5400'], '#ffffff', 8));
    const wt = BLD.yellowPanelTex(Math.min(1024, S));
    const ct = BLD.perforatedTex(Math.min(512, S));
    const ft = BLD.terrazzoTex(Math.min(1024, S));
    this.texs.push(wt, ct, ft);
    const vc = (o) => this.mat(new THREE.MeshStandardMaterial({ vertexColors: true, ...o }));
    this.MT = {
      wall: vc({ map: wt, roughness: 0.12, metalness: 0.0, envMap: env, envMapIntensity: 0.9 }),
      trim: vc({ roughness: 0.35, metalness: 0.6, envMap: env, envMapIntensity: 0.6 }),
      floor: vc({ map: ft, roughness: 0.4, envMap: env, envMapIntensity: 0.35 }),
      ceil: vc({ map: ct, roughness: 0.6 }),
      steel: vc({ roughness: 0.25, metalness: 0.9, envMap: env, envMapIntensity: 1.2 }),
      glow: this.mat(new THREE.MeshBasicMaterial({ vertexColors: true })),
    };
  }

  makeFixtures() {
    const m = new BLD.Mesher();
    const W = [2.6, 2.55, 2.4];
    for (const l of this.lamps) {
      const y = l.y - 0.01;
      const [hx, hz] = l.along === 'x' ? [0.07, 0.7] : [0.7, 0.07];
      m.box(l.x - hx, l.x + hx, y - 0.03, y, l.z - hz, l.z + hz, W, null, 1, 'py');
    }
    this.addMesh(m.build(), this.MT.glow);
  }

  // a luz no fim: um vão branco que brilha
  makeExit() {
    const e = this.exitP;
    const g = new THREE.PlaneGeometry(this.o.exitW, this.M.H);
    const m = this.addMesh(g, this.mat(new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.2, 2.0) })));
    m.position.set(e.x - e.dx * 0.05, e.y + this.M.H / 2, e.z - e.dz * 0.05);
    m.rotation.y = Math.atan2(-e.dx, -e.dz);
    m.updateMatrix();
    this.exitLight = new THREE.PointLight(0xffffff, 3, 10, 1.5);
    this.exitLight.position.set(e.x - e.dx * 1.2, e.y + 1.6, e.z - e.dz * 1.2);
    this.dynamic.add(this.exitLight);
  }

  // os Manequins, em poses diferentes pelos salões e corredores
  extra() {
    const r = mulberry32(5505);
    const M = this.M;
    const n0 = M.nodes[0];
    const spots = [];
    const far = (x, z) => Math.hypot(x - n0.x, z - n0.z) > 30 && Math.hypot(x - this.exitP.x, z - this.exitP.z) > 12;
    for (const n of M.nodes) {
      if (!far(n.x, n.z) || r() < 0.35) continue;
      const k = 1 + (r() < 0.3 ? 1 : 0);
      for (let i = 0; i < k; i++) {
        const x = n.x + (r() - 0.5) * n.hw;
        const z = n.z + (r() - 0.5) * n.hd;
        if (M.sdf(x, z) > -0.6) continue;
        spots.push({ x, z, yaw: r() * Math.PI * 2, pose: POSES[Math.floor(r() * POSES.length)], awake: r() < 0.6 });
      }
    }
    for (const e of M.corr) {
      if (r() < 0.55) continue;
      const t = 0.2 + r() * 0.6;
      const u = e.p0 + (e.p1 - e.p0) * t;
      if (e.s0 !== undefined && u > Math.min(e.s0, e.s1) - 1 && u < Math.max(e.s0, e.s1) + 1) continue;
      const lean = r() < 0.4;
      const side = r() < 0.5 ? -1 : 1;
      const off = lean ? side * (e.w / 2 - 0.42) : (r() - 0.5) * (e.w - 1.2);
      const x = e.horiz ? u : e.a.x + off;
      const z = e.horiz ? e.a.z + off : u;
      if (!far(x, z) || M.sdf(x, z) > -0.35) continue;
      // encostado: de lado para a parede, com a mão nela
      const yaw = lean ? (e.horiz ? (side > 0 ? 0 : Math.PI) : side > 0 ? Math.PI / 2 : -Math.PI / 2) + Math.PI / 2 : e.horiz ? (r() < 0.5 ? Math.PI / 2 : -Math.PI / 2) : r() < 0.5 ? 0 : Math.PI;
      spots.push({ x, z, yaw, pose: lean ? 'lean' : ['stand', 'walk', 'curl', 'lie', 'crouch', 'reach'][Math.floor(r() * 6)], awake: r() < 0.65 });
    }
    this.mq = new Mannequins(this, M, spots);
  }

  update(dt, player) {
    const g = this.game;
    const p = player.pos;
    this.time += dt;
    if (this.wake === undefined) this.startWake();
    if (this.wake.active) {
      this.wake.update(dt);
      return;
    }
    if (this.dead) return;
    // piscar: de tempos em tempos tudo fica preto por um instante
    this.blinkT -= dt;
    const near = this.mq.list.some((m) => m.awake && Math.hypot(m.x - p.x, m.z - p.z) < 22);
    if (this.blinkT <= 0 && near) {
      this.blinkT = 10 + Math.random() * 9;
      this.blink = 0.2;
      if (!this.toldBlink) {
        this.toldBlink = true;
        setTimeout(() => this.game.level === this && !this.dead && this.say('blink', ['…Eu pisquei.', 'Eles se mexeram? Eles se mexeram quando eu pisquei.']), 700);
      }
    }
    let blinking = false;
    if (this.blink > 0) {
      this.blink -= dt;
      blinking = true;
      g.fade = 1;
      g.fadeTarget = this.blink > 0 ? 1 : 0;
      if (this.blink <= 0) g.fade = 0.6;
    }
    if (!g.transitioning) this.mq.update(dt, player, blinking);
    this.blur = (this.mq.fear || 0) * 0.08;
    this.talk(p);
    // a luz no fim
    const e = this.exitP;
    if (!this.done && Math.hypot(p.x - e.x, p.z - e.z) < 1.3) {
      this.done = true;
      g.completeObjective('saida', 'A luz te puxa para fora dos corredores amarelos.');
      g.post.u.uFadeColor.value.setRGB(1, 1, 1);
      this.whiteFade = true;
      g.reachExit('noclip', 0.1);
    }
  }

  talk(p) {
    if (this.game.hud.dlg || !this.mq) return;
    for (const m of this.mq.list) {
      const d = Math.hypot(m.x - p.x, m.z - p.z);
      if (d < 14 && m.seen) {
        if (this.say('first', ['Tem alguém ali… parado.', 'Não. Não é alguém. É um boneco. Amarelo. Sem rosto.', 'Por que eu tenho a impressão de que ele estava em outro lugar agora há pouco?'])) return;
        break;
      }
    }
    const st = this.M.stairAt(p.x, p.z, 0);
    if (st && this.say('stairs', ['Escadas. Esse lugar desce… e desce.'])) return;
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
        [1.0, 'Piso frio de granilite. Luz branca demais.'],
        [4.4, 'Paredes amarelas brilhando como plástico novo.'],
        [7.4, 'Silêncio total. Só o zumbido das luminárias.'],
        [10.2, ''],
      ],
      {
        sound: 'breath',
        done: () =>
          g.hud.say(
            ['Que lugar é esse? Tudo amarelo… corredores que não acabam.', 'Tenho a sensação de que tem alguém me olhando. Ou que eu preciso olhar para alguém.'],
            () => g.hud.objective('Siga pelos corredores. Se vir um Manequim, não tire os olhos dele.', 7),
          ),
      },
    );
  }

  // um Manequim encostou: morte instantânea, de volta ao começo
  kill() {
    const g = this.game;
    if (this.dead || g.transitioning) return;
    this.dead = true;
    g.transitioning = true;
    g.player.frozen = true;
    g.hud.scare(this.mq.face);
    g.audio.scare();
    g.vibrate([300, 80, 400]);
    g.damage = 1;
    g.glitch = 1;
    g.fadeTarget = 1;
    g.hud.message('Um Manequim te alcançou. Você morreu.', 3);
    this.deaths = (this.deaths || 0) + 1;
    setTimeout(() => {
      if (g.level !== this) return;
      const s = this.spawn;
      g.player.reset(s, this.M.floorY(s.x, s.z));
      g.sanity = 100;
      this.mq.reset();
      this.blinkT = 14;
      this.blink = 0;
      g.player.frozen = false;
      g.fadeTarget = 0;
      g.transitioning = false;
      this.dead = false;
      g.hud.message('Você voltou para o começo. Eles também.', 4);
      if (this.deaths === 1) setTimeout(() => g.level === this && this.say('dead', ['Eu… morri? Eu senti a mão dele no meu pescoço.', 'Não posso deixar eles chegarem perto. Nunca tirar os olhos.']), 2500);
    }, 2400);
  }

  interactable() {
    return null;
  }

  radarEntities() {
    return this.mq ? this.mq.radar() : [];
  }

  dispose() {
    if (this.mq) this.mq.dispose();
    if (this.whiteFade) this.game.post.u.uFadeColor.value.setRGB(0, 0, 0);
    super.dispose();
  }
}

// ------------------------------------------------------------ seção 2
export class Level55b extends Level55Base {
  constructor(game) {
    const look = {
      exposure: 0.95,
      tint: [1.0, 0.98, 1.02],
      sat: 0.92,
      contrast: 1.06,
      lift: [0.01, 0.012, 0.02],
      bloom: 0.3,
      bloomThreshold: 0.88,
      fog: [0.05, 0.055, 0.07],
      fogNear: 0.2,
      lightColor: [1, 0.97, 0.9],
      flashlight: true,
      ambience: 'level55_2',
      reverb: 1.3,
      sanityDrain: 0.02,
    };
    super(game, {
      key: '55.2',
      look,
      fogD: 0.03,
      amb: 1.6,
      exitW: 2.0,
      map: { nx: 3, nz: 6, sp: 30, seed: 5502, hall: 2.3, wide: 2.3, narrow: 2.1, stairs: false, extra: 0.12, H: 2.6 },
      bake: { amb: 0.14, fall: 0.3, gain: 0.9, reach: 10, max: 1.2 },
      bands: [
        { y0: 0.1, y1: 1.0, off: 0, mat: 'wain', col: [1, 1, 1], uv: 1.5 },
        { y0: 1.06, y1: 'H', off: 0, mat: 'wall', col: [1, 1, 1], uv: 1.5 },
        { y0: 1.0, y1: 1.06, off: 0, mat: 'wall', col: [1, 1, 1], uv: 1.5 },
        { y0: 0, y1: 0.1, off: 0.015, mat: 'trim', col: [0.14, 0.2, 0.34], uv: 1, top: true },
        { y0: 0.98, y1: 1.06, off: 0.03, mat: 'trim', col: [0.16, 0.22, 0.38], uv: 1, top: true },
      ],
      fc: { floorUV: 2.0, ceilUV: 1.2, floorCol: [1, 1, 1], ceilCol: [1, 1, 1] },
    });
    this.look = look;
    this.objectives = [{ id: 'saida', text: 'Encontre a porta de saída do hotel' }];
  }

  lampList() {
    const out = [];
    const M = this.M;
    for (const s of M.shapes) {
      const along = s.hx > s.hz ? 'x' : 'z';
      const L = along === 'x' ? s.hx * 2 : s.hz * 2;
      const n = Math.max(1, Math.round(L / 4.2));
      for (let i = 0; i < n; i++) {
        const u = -L / 2 + ((i + 0.5) * L) / n;
        const x = along === 'x' ? s.cx + u : s.cx;
        const z = along === 'x' ? s.cz : s.cz + u;
        if (M.sdf(x, z) > -0.4) continue;
        if (out.some((l) => Math.abs(l.x - x) < 2 && Math.abs(l.z - z) < 2)) continue;
        out.push({ x, z, y: M.H - 0.03, k: (i % 2 ? 1 : 0.85) });
      }
    }
    return out;
  }

  makeMaterials() {
    const S = Math.min(1024, this.Q.tex);
    const env = this.game.makeEnv(indoorEnvTex(['#e8e4dc', '#6a7a90', '#1a2030'], '#fffaf0'));
    const st = BLD.stuccoTex(Math.min(512, S));
    const bp = BLD.bluePaintTex(Math.min(512, S));
    const ca = BLD.blueCarpetTex(Math.min(512, S));
    const pl = BLD.plankTex(Math.min(512, S));
    this.runner = BLD.runnerTex();
    this.doorT = BLD.navyDoorTex();
    this.texs.push(st, bp, ca, pl, this.runner, this.doorT);
    const vc = (o) => this.mat(new THREE.MeshStandardMaterial({ vertexColors: true, ...o }));
    this.MT = {
      wall: vc({ map: st, roughness: 0.9 }),
      wain: vc({ map: bp, roughness: 0.6, envMap: env, envMapIntensity: 0.2 }),
      trim: vc({ roughness: 0.45, envMap: env, envMapIntensity: 0.3 }),
      floor: vc({ map: ca, roughness: 0.95 }),
      ceil: vc({ map: pl, roughness: 0.8 }),
      glow: this.mat(new THREE.MeshBasicMaterial({ vertexColors: true })),
      fix: vc({ roughness: 0.5 }),
    };
  }

  // spots redondos embutidos (aro escuro + luz) e alguns ralos de ventilação escuros
  makeFixtures(light) {
    const fix = new BLD.Mesher();
    const glow = new BLD.Mesher();
    const H = this.M.H;
    for (const l of this.lamps) {
      const L = light(l.x, H - 0.2, l.z, 0, -1, 0);
      const ring = [0.12 * L, 0.12 * L, 0.13 * L];
      fix.box(l.x - 0.13, l.x + 0.13, H - 0.012, H - 0.002, l.z - 0.13, l.z + 0.13, ring, null, 1, 'py');
      glow.box(l.x - 0.08, l.x + 0.08, H - 0.016, H - 0.012, l.z - 0.08, l.z + 0.08, [2.2 * l.k, 2.1 * l.k, 1.9 * l.k], null, 1, 'py');
    }
    this.addMesh(fix.build(), this.MT.fix);
    this.addMesh(glow.build(), this.MT.glow);
  }

  // passadeiras no meio dos corredores e portas azul-marinho nas paredes
  extra(light) {
    const M = this.M;
    const r = mulberry32(5506);
    const rg = new THREE.PlaneGeometry(1.25, 2.6);
    rg.rotateX(-Math.PI / 2);
    this.geos.push(rg);
    const rm = this.mat(new THREE.MeshStandardMaterial({ map: this.runner, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -1 }));
    const dg = new THREE.BoxGeometry(0.86, 2.15, 0.05);
    this.geos.push(dg);
    this.doors = [];
    const frame = new BLD.Mesher();
    for (const e of M.corr) {
      const len = Math.abs(e.p1 - e.p0);
      const dir = Math.sign(e.p1 - e.p0);
      const n = Math.floor(len / 4.2);
      for (let i = 0; i < n; i++) {
        const u = e.p0 + dir * (2.1 + i * 4.2);
        const x = e.horiz ? u : e.a.x;
        const z = e.horiz ? e.a.z : u;
        const L = light(x, 0.02, z, 0, 1, 0);
        const m = new THREE.Mesh(rg, rm.clone());
        this.mats.push(m.material);
        m.material.color.setRGB(L, L, L);
        m.position.set(x, 0.006, z);
        m.rotation.y = e.horiz ? Math.PI / 2 : 0;
        this.dynamic.add(m);
      }
      // portas: dos dois lados, alternadas
      for (let u = 2.5; u < len - 2; u += 3.6 + r() * 2.4) {
        const side = r() < 0.5 ? -1 : 1;
        const uu = e.p0 + dir * u;
        const hw = e.w / 2;
        const x = e.horiz ? uu : e.a.x + side * hw;
        const z = e.horiz ? e.a.z + side * hw : uu;
        const nx = e.horiz ? 0 : -side;
        const nz = e.horiz ? -side : 0;
        if (M.sdf(x + nx * 0.05, z + nz * 0.05) > 0) continue;
        const L = light(x + nx * 0.3, 1.2, z + nz * 0.3, nx, 0, nz);
        const dm = this.mat(new THREE.MeshStandardMaterial({ map: this.doorT, roughness: 0.5, color: new THREE.Color(L, L, L) }));
        const d = new THREE.Mesh(dg, dm);
        d.position.set(x + nx * 0.03, 1.075, z + nz * 0.03);
        d.rotation.y = Math.atan2(nx, nz);
        this.dynamic.add(d);
        const fc = [0.1 * L, 0.13 * L, 0.22 * L];
        const ax = Math.abs(nz);
        const az = Math.abs(nx);
        for (const s of [-1, 1]) {
          const cx = x + ax * s * 0.5 + nx * 0.04;
          const cz = z + az * s * 0.5 + nz * 0.04;
          frame.box(cx - 0.05 - nx * 0.0, cx + 0.05, 0, 2.22, cz - 0.05, cz + 0.05, fc, null, 1);
        }
        frame.box(x - ax * 0.55 - 0.05 * az, x + ax * 0.55 + 0.05 * az, 2.17, 2.27, z - az * 0.55 - 0.05 * ax, z + az * 0.55 + 0.05 * ax, fc, null, 1);
        this.doors.push({ x: x + nx * 0.6, z: z + nz * 0.6 });
      }
    }
    if (!frame.empty) this.addMesh(frame.build(), this.MT.trim);
  }

  // a porta de saída com a placa verde
  makeExit() {
    const e = this.exitP;
    const g = new THREE.Group();
    g.position.set(e.x - e.dx * 0.02, 0, e.z - e.dz * 0.02);
    g.rotation.y = Math.atan2(-e.dx, -e.dz);
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.0, 2.15, 0.06), this.mat(new THREE.MeshStandardMaterial({ map: this.doorT, roughness: 0.5 })));
    door.position.y = 1.075;
    const c = TEX.makeCanvas(256, 96);
    const x = c.getContext('2d');
    x.fillStyle = '#0a5a26';
    x.fillRect(0, 0, 256, 96);
    x.fillStyle = '#c8ffd8';
    x.font = 'bold 58px Arial, sans-serif';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText('SAÍDA', 128, 52);
    const t = TEX.toTex(c, { repeat: false });
    this.texs.push(t);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.22), this.mat(new THREE.MeshBasicMaterial({ map: t, color: new THREE.Color(1.6, 1.8, 1.6) })));
    sign.position.set(0, 2.42, 0.05);
    g.add(door, sign);
    g.traverse((o) => o.geometry && this.geos.push(o.geometry));
    this.dynamic.add(g);
    const l = new THREE.PointLight(0x40ff70, 1.2, 5, 2);
    l.position.set(e.x - e.dx * 0.6, 2.3, e.z - e.dz * 0.6);
    this.dynamic.add(l);
  }

  update(dt, player) {
    this.time += dt;
    if (this.wake === undefined) this.startWake();
    if (this.wake.active) this.wake.update(dt);
  }

  startWake() {
    const g = this.game;
    this.wake = { active: false, dispose() {} };
    g.hud.say(['As paredes… mudaram. Creme e azul. Carpete.', 'Um corredor de hotel. Nenhum boneco amarelo à vista.', 'Acho que aqui eu posso respirar.'], () =>
      g.hud.objective('Encontre a porta de saída. Aqui parece seguro.', 6),
    );
  }

  interactable(P) {
    const g = this.game;
    const e = this.exitP;
    if (this.done) return null;
    if (Math.hypot(P.pos.x - e.x, P.pos.z - e.z) < 1.6)
      return {
        label: 'Abrir a porta de saída',
        action: () => {
          this.done = true;
          g.completeObjective('saida', 'A porta abre para um corredor que você não conhece.');
          g.reachExit('door', 0.3);
        },
      };
    for (const d of this.doors || [])
      if (Math.hypot(P.pos.x - d.x, P.pos.z - d.z) < 0.9)
        return {
          label: 'Tentar abrir a porta',
          action: () => {
            g.audio.play('knock', { gain: 0.3 });
            const msgs = ['Trancada.', 'Trancada. Lá dentro, uma TV ligada.', 'Trancada. Por um segundo você jura que viu amarelo pela fresta.'];
            this.tries = (this.tries || 0) + 1;
            g.hud.message(msgs[this.tries % msgs.length], 3);
          },
        };
    return null;
  }
}
