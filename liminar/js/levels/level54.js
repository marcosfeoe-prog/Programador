// Nível 54 — "Estreito" (Classe 2). Corredores estreitos de hotel com
// formatos errados: paredes amarelo-mostarda em ângulos que não fecham,
// rodapé vinho, moldura de cadeira, carpete preto com listras brancas em
// diagonal e plafons redondos no teto. Os corredores dobram em ângulos
// tortos, afinam, fazem zigue-zague e dão em becos. Em nove cômodos moram as
// Aracmonster, aranhas gigantes grudadas em teias no teto ou nos cantos: só
// atacam quem chega perto, mas às vezes uma desce e sai caçando. A saída é
// uma porta com a placa verde no fim do último salão.
import * as THREE from 'three';
import { OutdoorLevel } from './outdoor.js';
import { indoorEnvTex } from '../textures.js';
import { clamp, hash3 } from '../util.js';
import { standardWake } from './wake.js';
import { GeoBuilder } from '../materials.js';
import { H, sdf, grad, clear, SPAWN, EXIT, WEBS, lamps as lampList, doors as doorList } from './level54_map.js';
import { wallTex, carpetTex, ceilTex, doorTex, webTex, exitTex, plateTex, bakeFn, buildWalls, buildFloorCeil } from './level54_build.js';
import { Aracmonsters } from './level54_spider.js';

export class Level54 extends OutdoorLevel {
  constructor(game) {
    super(game, { walkSpeed: 2.2, camFar: 120 });
    this.num = 54;
    this.indoor = true;
    this.time = 0;
    this.mats = [];
    this.geos = [];
    this.texs = [];
    this.meshes = [];
    this.look = {
      exposure: 1.0,
      tint: [1.05, 1.0, 0.86],
      sat: 1.08,
      contrast: 1.1,
      lift: [0.012, 0.01, 0.004],
      bloom: 0.35,
      bloomThreshold: 0.85,
      fog: [0.08, 0.06, 0.03],
      fogNear: 0.2,
      lightColor: [1, 0.96, 0.86],
      flashlight: true,
      ambience: 'level54',
      reverb: 1.4,
      sanityDrain: 0.04,
    };
    this.objectives = [
      { id: 'saida', text: 'Encontre a porta com a placa verde de saída' },
      { id: 'teias', text: 'Não chegue perto das teias' },
    ];
    this.scene.fog = new THREE.FogExp2(new THREE.Color(...this.look.fog), 0.035);
    this.scene.background = new THREE.Color(0, 0, 0);
    // a luz das plafons já está nos vértices; aqui só uma luz ambiente branca
    this.amb = new THREE.AmbientLight(0xffffff, 2.4);
    this.scene.add(this.amb);
    this.spawn = { ...SPAWN };
    this.exit = { x: EXIT.x, z: EXIT.z + 0.6 };
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

  // ------------------------------------------------------------ construção
  async preload(px, pz, progress) {
    const tick = () => new Promise((r) => setTimeout(r, 0));
    this.lamps = lampList();
    const bake = bakeFn(this.lamps);
    // memória por posição (vértices de faixas vizinhas se repetem)
    const memo = new Map();
    this.bake = bake;
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
    const W = buildWalls(light);
    this.addMesh(W.wall, this.M.wall);
    this.addMesh(W.trim, this.M.trim);
    progress(0.45);
    await tick();
    const F = buildFloorCeil(light);
    this.addMesh(F.floor, this.M.floor);
    this.addMesh(F.ceil, this.M.ceil);
    progress(0.7);
    await tick();
    this.makeFixtures(light);
    this.makeDoors(light);
    this.makeExit();
    this.makeFlicker();
    progress(0.85);
    await tick();
    this.spiders = new Aracmonsters(this);
    this.spawnItems();
    progress(1);
  }

  makeMaterials() {
    const S = Math.min(1024, this.Q.tex);
    const env = this.game.makeEnv(indoorEnvTex(['#e8d080', '#9a7a30', '#201810'], '#fff4d8'));
    const wt = wallTex(Math.min(512, S));
    const ct = carpetTex(Math.min(1024, S));
    const cl = ceilTex(Math.min(512, S));
    this.webMap = webTex();
    this.texs.push(wt, ct, cl, this.webMap);
    const vc = (o) => this.mat(new THREE.MeshStandardMaterial({ vertexColors: true, ...o }));
    this.M = {
      wall: vc({ map: wt, roughness: 0.62, envMap: env, envMapIntensity: 0.15 }),
      trim: vc({ roughness: 0.4, envMap: env, envMapIntensity: 0.4 }),
      floor: vc({ map: ct, roughness: 0.95, color: 0xb8b4bc }),
      ceil: vc({ map: cl, roughness: 0.9 }),
      fix: vc({ roughness: 0.5 }),
      glow: this.mat(new THREE.MeshBasicMaterial({ vertexColors: true })),
      door: this.mat(new THREE.MeshStandardMaterial({ map: (this.doorMap = doorTex()), roughness: 0.55, envMap: env, envMapIntensity: 0.2 })),
    };
    this.texs.push(this.doorMap);
  }

  // Plafons redondas, detectores de fumaça e grelhas de ventilação no teto.
  makeFixtures(light) {
    const gb = new GeoBuilder();
    const glow = new GeoBuilder();
    this.lampGlow = [];
    for (const l of this.lamps) {
      const L = light(l.x, H - 0.2, l.z, 0, -1, 0);
      gb.cylinder(l.x, H - 0.03, l.z, 0.27, 0.06, [0.9 * L, 0.88 * L, 0.84 * L], null, { sides: 18 });
      const c = l.k >= 1 ? [2.4, 2.25, 1.9] : l.k > 0 ? [1.3, 1.15, 0.8] : [0.25, 0.23, 0.2];
      glow.cylinder(l.x, H - 0.075, l.z, 0.22, 0.04, c, null, { sides: 18, r2: 0.2 });
    }
    // detector de fumaça e grelhas, aqui e ali
    let n = 0;
    for (const l of this.lamps) {
      if (hash3(Math.round(l.x), Math.round(l.z), 54) < 0.45) continue;
      const g = grad(l.x, l.z);
      const ox = l.x + g[1] * 1.6;
      const oz = l.z - g[0] * 1.6;
      if (sdf(ox, oz) > -0.4) continue;
      const L = light(ox, H - 0.2, oz, 0, -1, 0);
      if (n++ % 2) gb.cylinder(ox, H - 0.025, oz, 0.07, 0.05, [0.95 * L, 0.95 * L, 0.92 * L], null, { sides: 12 });
      else gb.box(ox, H - 0.01, oz, 0.42, 0.02, 0.42, [0.82 * L, 0.8 * L, 0.76 * L], null, { ao: 0 });
    }
    this.addMesh(gb.build(), this.M.fix);
    this.addMesh(glow.build(), this.M.glow);
  }

  // Portas de quarto (trancadas), com batente e plaquinha dourada.
  makeDoors(light) {
    this.doors = doorList();
    const frame = new GeoBuilder();
    const slab = new THREE.BoxGeometry(0.92, 2.08, 0.05);
    this.geos.push(slab);
    for (const d of this.doors) {
      const rot = Math.atan2(d.nx, d.nz);
      const L = light(d.x + d.nx * 0.3, 1.2, d.z + d.nz * 0.3, d.nx, 0, d.nz);
      const m = new THREE.Mesh(slab, this.M.door);
      m.position.set(d.x + d.nx * 0.03, 1.04, d.z + d.nz * 0.03);
      m.rotation.y = rot;
      const dm = this.mat(this.M.door.clone());
      dm.color.setRGB(L * 0.9, L * 0.9, L * 0.9);
      m.material = dm;
      this.dynamic.add(m);
      const fc = [0.95 * L, 0.82 * L, 0.42 * L];
      const ax = Math.cos(rot);
      const az = -Math.sin(rot);
      for (const s of [-1, 1]) frame.box(d.x + ax * s * 0.52 + d.nx * 0.04, 1.08, d.z + az * s * 0.52 + d.nz * 0.04, 0.1, 2.16, 0.08, fc, null, { rot, ao: 0 });
      frame.box(d.x + d.nx * 0.04, 2.17, d.z + d.nz * 0.04, 1.14, 0.1, 0.08, fc, null, { rot, ao: 0 });
      // maçaneta
      frame.box(d.x + ax * 0.34 + d.nx * 0.08, 1.0, d.z + az * 0.34 + d.nz * 0.08, 0.04, 0.04, 0.08, [0.9 * L, 0.75 * L, 0.35 * L], null, { rot, ao: 0 });
      // número
      const pt = plateTex(d.num);
      this.texs.push(pt);
      const pm = this.mat(new THREE.MeshBasicMaterial({ map: pt, color: new THREE.Color(L * 0.8, L * 0.8, L * 0.8) }));
      const pg = new THREE.PlaneGeometry(0.2, 0.1);
      this.geos.push(pg);
      const p = new THREE.Mesh(pg, pm);
      p.position.set(d.x + d.nx * 0.065, 1.62, d.z + d.nz * 0.065);
      p.rotation.y = rot;
      this.dynamic.add(p);
    }
    this.addMesh(frame.build(), this.M.trim);
  }

  // A porta de saída com a placa verde acesa em cima.
  makeExit() {
    const x = EXIT.x;
    const z = EXIT.z;
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    const slab = new THREE.Mesh(new THREE.BoxGeometry(1.0, 2.1, 0.06), this.mat(new THREE.MeshStandardMaterial({ map: this.doorMap, roughness: 0.5, color: 0xd8d0c8 })));
    slab.position.set(0, 1.05, 0.03);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.06, 0.08), this.mat(new THREE.MeshStandardMaterial({ color: 0xc8c8c0, metalness: 0.8, roughness: 0.3 })));
    bar.position.set(0, 1.0, 0.1);
    const t = exitTex();
    this.texs.push(t);
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.24, 0.1), [
      this.mat(new THREE.MeshBasicMaterial({ color: 0x0a4a1e })),
      this.mat(new THREE.MeshBasicMaterial({ color: 0x0a4a1e })),
      this.mat(new THREE.MeshBasicMaterial({ color: 0x0a4a1e })),
      this.mat(new THREE.MeshBasicMaterial({ color: 0x0a4a1e })),
      this.mat(new THREE.MeshBasicMaterial({ map: t, color: new THREE.Color(1.6, 1.8, 1.6) })),
      this.mat(new THREE.MeshBasicMaterial({ map: t })),
    ]);
    sign.position.set(0, 2.42, 0.08);
    g.add(slab, bar, sign);
    g.traverse((o) => o.geometry && this.geos.push(o.geometry));
    this.dynamic.add(g);
    this.exitLight = new THREE.PointLight(0x40ff70, 1.4, 6, 2);
    this.exitLight.position.set(x, 2.3, z + 0.6);
    this.dynamic.add(this.exitLight);
  }

  // Algumas plafons perto das teias piscam (luzes de verdade, poucas e perto).
  makeFlicker() {
    this.flk = [];
    for (let i = 0; i < 3; i++) {
      const l = new THREE.PointLight(0xfff0c8, 0, 7, 2);
      this.dynamic.add(l);
      this.flk.push(l);
    }
    this.flkT = 0;
  }

  spawnItems() {
    const g = this.game;
    const list = [
      { type: 'note', key: '54:n1', x: -6.5, z: -10.5, rot: 0.3 },
      { type: 'note', key: '54:n2', x: 15, z: -194, rot: 1.1 },
      { type: 'note', key: '54:n3', x: 24, z: -129, rot: 2.4 },
      { type: 'water', key: '54:w1', x: 21, z: -112.8, rot: 0 },
      { type: 'battery', key: '54:b1', x: 26.6, z: -30, rot: 0 },
      { type: 'battery', key: '54:b2', x: 41, z: -211.6, rot: 0 },
    ];
    for (const it of list) {
      if (this.taken.has(it.key) || sdf(it.x, it.z) > -0.2) continue;
      g.items.spawn({ ...it, y: 0.01, light: this.lightAt(it.x, 0.5, it.z) }, this.dynamic);
    }
  }

  // Luz (0..1+) num ponto, usada pelas aranhas e pela sanidade.
  lightAt(x, y, z) {
    return this.bake ? this.bake(x, y, z, 0, 1, 0) : 1;
  }

  // ------------------------------------------------------------ quadro
  update(dt, player) {
    const p = player.pos;
    this.time += dt;
    if (this.wake === undefined) this.startWake();
    if (this.wake.active) {
      this.wake.update(dt);
      return;
    }
    if (!this.done) this.spiders.update(dt, player);
    this.updateFlicker(dt, p);
    this.talk(p);
    // tontura no carpete listrado quando o medo aperta
    this.blur = (this.spiderFear || 0) * 0.12;
    if (!this.done && Math.hypot(p.x - EXIT.x, p.z - EXIT.z) < 4 && clear(p.x, p.z, EXIT.x, EXIT.z + 0.4)) this.say('exit', ['Uma placa verde… SAÍDA. Finalmente.']);
  }

  updateFlicker(dt, p) {
    this.flkT -= dt;
    if (this.flkT <= 0) {
      this.flkT = 0.5;
      const near = this.lamps
        .filter((l) => l.flicker && Math.abs(l.x - p.x) < 14 && Math.abs(l.z - p.z) < 14)
        .sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z));
      this.flk.forEach((l, i) => {
        const L = near[i];
        l.userData.L = L;
        if (L) l.position.set(L.x, H - 0.25, L.z);
      });
    }
    const t = this.time;
    this.flk.forEach((l, i) => {
      const L = l.userData.L;
      if (!L) {
        l.intensity = 0;
        return;
      }
      const on = Math.sin(t * 13 + i * 7) + Math.sin(t * 31 + i) > 0.6 || Math.sin(t * 0.7 + i) > -0.2;
      l.intensity = on ? 1.6 + Math.sin(t * 50) * 0.2 : 0.1;
    });
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
        [1.0, 'Carpete áspero na bochecha. Listras brancas, pretas, brancas.'],
        [4.4, 'Paredes amarelas. Um zumbido baixo de lâmpada.'],
        [7.4, 'O corredor à frente dobra num ângulo que não faz sentido.'],
        [10.2, ''],
      ],
      {
        sound: 'breath',
        done: () =>
          g.hud.say(
            ['Um corredor de hotel… mas torto. Nada aqui fecha em ângulo reto.', 'E essas listras no chão… me dão tontura só de olhar.'],
            () => g.hud.objective('Encontre a saída. Os corredores são estreitos: ande com cuidado.', 6),
          ),
      },
    );
  }

  say(id, lines, cb) {
    this._said = this._said || new Set();
    if (this._said.has(id) || this.game.hud.dlg) return false;
    this._said.add(id);
    this.game.hud.say(lines, cb);
    return true;
  }

  talk(p) {
    if (this.game.hud.dlg) return;
    // a primeira teia à vista
    for (const w of WEBS) {
      const d = Math.hypot(p.x - w.x, p.z - w.z);
      if (d < 9 && clear(p.x, p.z, w.x, w.z, 0.05)) {
        if (this.say('web', ['Isso é… teia? Do tamanho de um lençol.', 'Tem alguma coisa nela. Alguma coisa grande, com pernas demais.', 'Não chega perto. Passa devagar pelo outro lado.'])) return;
        break;
      }
    }
    if (Math.hypot(p.x - 8, p.z - 111) < 1 && this.say('zig', ['Esquerda, direita, esquerda… quem desenhou esse lugar?'])) return;
    if (Math.abs(p.x - 37) < 1.5 && p.z < -150 && p.z > -162) this.say('narrow', ['Tá ficando apertado demais. Mal cabe um ombro.']);
  }

  onLunge() {
    this.game.hud.message('ELA PULOU!', 2);
  }

  onEscape() {
    this.say('escape', ['Ela pulou em mim! Por pouco…', 'Fica longe das teias. Longe das teias.']);
  }

  onBite() {
    this.say('bite', ['Ai… ai! Ela me mordeu!', 'Preciso passar longe das teias.']);
  }

  onHunt() {
    if (!this.toldHunt) {
      this.toldHunt = true;
      this.game.hud.message('Um chiado longo… e um tec-tec-tec no carpete. Uma delas desceu da teia.', 5);
      setTimeout(() => this.game.level === this && this.say('hunt', ['Ela saiu da teia… ela tá vindo atrás de mim!', 'Corre!']), 1500);
    }
  }

  // ------------------------------------------------------------ física
  collide(p, r) {
    for (let it = 0; it < 4; it++) {
      const d = sdf(p.x, p.z);
      if (d <= -r) break;
      const g = grad(p.x, p.z);
      p.x -= g[0] * (d + r + 0.002);
      p.z -= g[1] * (d + r + 0.002);
    }
    return p;
  }

  groundY() {
    return 0;
  }

  surfaceAt() {
    return 'carpet';
  }

  los(ax, az, bx, bz) {
    return clear(ax, az, bx, bz, 0.05);
  }

  lightLevel(x, z) {
    return clamp(this.lightAt(x, 1, z), 0.05, 1);
  }

  interactable(P) {
    if (this.done) return null;
    const g = this.game;
    const px = P.pos.x;
    const pz = P.pos.z;
    if (Math.hypot(px - EXIT.x, pz - EXIT.z) < 1.5)
      return {
        label: 'Abrir a porta de saída',
        action: () => {
          this.done = true;
          g.completeObjective('saida', 'A barra da porta cede. Ar frio do outro lado.');
          g.reachExit('door', 0.3);
        },
      };
    for (const d of this.doors) {
      if (Math.hypot(px - d.x, pz - d.z) > 1.3) continue;
      return {
        label: 'Tentar abrir o quarto ' + d.num,
        action: () => {
          g.audio.play('knock', { gain: 0.35, rate: 1.1 });
          const msgs = ['Trancada.', 'Trancada. Do outro lado, algo raspa a porta de volta.', 'Trancada. Tem fios de teia saindo pela fechadura.', 'Trancada. O número é o mesmo da porta anterior?'];
          this.tries = (this.tries || 0) + 1;
          g.hud.message(msgs[this.tries % msgs.length], 3);
        },
      };
    }
    return null;
  }

  radarEntities() {
    return this.spiders ? this.spiders.radar() : [];
  }

  navTarget() {
    return this.exit;
  }

  dispose() {
    if (this.wake) this.wake.dispose();
    if (this.spiders) this.spiders.dispose();
    for (const m of this.meshes) m.removeFromParent();
    super.dispose();
    for (const x of this.geos) x.dispose();
    for (const m of this.mats) m.dispose();
    for (const t of this.texs) t.dispose();
    this.scene.remove(this.amb);
  }
}
