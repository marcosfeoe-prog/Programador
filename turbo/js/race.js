// Uma corrida: monta pista, cenário, obstáculos e carros; roda a física em
// passo fixo, a IA, as colisões, turbo, moedas, colocações e chegada.
import * as THREE from 'three';
import { CARS, WORLDS, N_RACERS, AI_NAMES, carStats, levelInfo } from './config.js';
import { Track, DS, F_LOOP, F_MAGNET } from './track.js';
import { buildTrackMesh } from './trackmesh.js';
import { buildWorld } from './worlds.js';
import { Obstacles } from './obstacles.js';
import { CarSim, collideCars } from './physics.js';
import { AIDriver } from './ai.js';
import { buildCar } from './cars.js';
import { ChaseCam } from './camera.js';
import { tagCanvas, drawTag } from './textures.js';
import { RNG, clamp } from './util.js';

const STEP = 1 / 120;
const AI_PAINTS = ['vermelho', 'azul', 'verde', 'roxo', 'laranja', 'rosa', 'ciano', 'branco', 'preto', 'menta'];
const TAG_COLORS = ['#ffd21a', '#c9d3e0', '#e08a3a', '#5fb0ff', '#5fb0ff', '#5fb0ff'];

export class Race {
  constructor(game, levelIdx) {
    this.game = game;
    this.info = levelInfo(levelIdx);
    this.world = WORLDS[this.info.world];
    this.scene = new THREE.Scene();
    this.state = 'intro';
    this.t = 0;
    this.stateT = 0;
    this.raceTime = 0;
    this.acc = 0;
    this.finishCount = 0;
    this.coins = 0;
    this.rng = new RNG(this.info.seed + 5);
    this.build();
  }

  build() {
    const g = this.game;
    const q = g.quality;
    const world = this.world;
    const track = (this.track = new Track(this.info, world));
    const tm = (this.trackMesh = buildTrackMesh(track, world, q));
    this.scene.add(tm.group);
    const w = (this.env = buildWorld(world, track, q));
    this.scene.add(w.group);
    const env = w.env;
    this.scene.fog = new THREE.Fog(env.fog, env.fogNear, env.fogFar);
    this.scene.background = new THREE.Color(env.fog);
    // luzes
    const hemi = new THREE.HemisphereLight(env.hemiSky, env.hemiGround, env.hemi);
    this.scene.add(hemi);
    const sun = (this.sun = new THREE.DirectionalLight(env.sunColor, env.sun));
    this.sunDir = env.sunDir.clone();
    if (q.shadows) {
      sun.castShadow = true;
      sun.shadow.mapSize.set(q.shadows, q.shadows);
      const c = sun.shadow.camera;
      c.left = c.bottom = -32;
      c.right = c.top = 32;
      c.near = 1;
      c.far = 260;
      sun.shadow.bias = -0.0008;
      sun.shadow.normalBias = 0.12;
    }
    this.scene.add(sun, sun.target);
    // reflexos dos carros
    this.envMap = g.makeEnvMap(w.group.getObjectByName('ceu'));
    this.scene.environment = this.envMap;

    this.obstacles = new Obstacles(track, world, this.scene);

    // carros
    const save = g.save.data;
    const pid = save.car;
    const pcar = CARS.find((c) => c.id === pid);
    const ps = save.cars[pid];
    this.cars = [];
    const aiCars = CARS.filter((c) => c.id !== pid);
    const names = [...AI_NAMES].sort(() => this.rng.next() - 0.5);
    const playerSlot = N_RACERS - 1; // o jogador larga por último
    for (let k = 0; k < N_RACERS; k++) {
      const isPlayer = k === playerSlot;
      let def;
      let look;
      let stats;
      if (isPlayer) {
        def = pcar;
        look = { paint: ps.paint, rim: ps.rim, neon: ps.neon };
        stats = carStats(pcar, ps.upgrade);
      } else {
        def = aiCars[(k * 3 + this.info.idx) % aiCars.length];
        look = { paint: AI_PAINTS[(k * 7 + this.info.idx) % AI_PAINTS.length], rim: this.rng.pick(['cinco', 'malha', 'turbina', 'raios']), neon: 'nenhum' };
        // o mais rápido larga na frente
        const f = 1.02 - k * 0.022 + this.rng.float(-0.01, 0.01);
        stats = { vmax: this.info.aiSpeed * f, accel: 17 + this.info.idx * 0.35, handling: 11 + this.info.difficulty * 3, nitro: 1.05 };
      }
      const sim = new CarSim(track, stats);
      const row = Math.floor(k / 2);
      const col = k % 2;
      sim.placeAt(track.startS - 6 - row * 9 - col * 3, col ? 2.6 : -2.6);
      const model = buildCar(def.id, look);
      this.scene.add(model.group);
      const r = {
        sim,
        model,
        def,
        isPlayer,
        name: isPlayer ? 'Você' : names[k % names.length],
        pos: k + 1,
        ai: null,
        tag: null,
        coins: 0,
      };
      // o jogador também tem um piloto automático (usado depois da chegada)
      r.ai = new AIDriver(sim, track, this.obstacles, { skill: isPlayer ? 1 : 0.55 + this.info.difficulty * 0.4 + this.rng.float(-0.1, 0.1), lane: [-3.8, 0, 3.8][k % 3], rng: new RNG(this.info.seed + k * 13) });
      if (!isPlayer) {
        const canvas = tagCanvas();
        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, depthWrite: false, transparent: true }));
        sp.renderOrder = 10;
        sp.center.set(0.16, 0);
        this.scene.add(sp);
        r.tag = { sp, canvas, tex, last: '' };
      }
      this.cars.push(r);
    }
    this.player = this.cars[playerSlot];
    this.sims = this.cars.map((c) => c.sim);

    // câmera
    this.camera = g.camera;
    this.chase = new ChaseCam(this.camera);
    this.startCenter = new THREE.Vector3();
    track.frame(track.startS - 20, this.player.sim.fr);
    this.startCenter.copy(this.player.sim.fr.P);
    this.player.sim.updatePose(0);
    this.updateVisuals(0);

    // partículas
    this.scene.add(g.fx.sparks.points, g.fx.smoke.points);
    g.fx.sparks.clear();
    g.fx.smoke.clear();
    this.startLamp = tm.group.userData.startLamp;
  }

  // ------------------------------------------------------------ atualizar
  update(dt) {
    const g = this.game;
    this.t += dt;
    this.stateT += dt;
    const input = g.input.read(dt);
    if (this.state === 'intro') {
      this.chase.intro(Math.min(1, this.stateT / 2.6), this.player.sim, this.startCenter);
      if (this.stateT > 2.6) this.setState('countdown');
    } else if (this.state === 'countdown') {
      const n = 3 - Math.floor(this.stateT);
      if (n !== this.lastCount && n > 0) {
        this.lastCount = n;
        g.hud.count(String(n));
        g.audio.play('beep');
      }
      if (input.throttle && !this.gasAt) this.gasAt = this.stateT;
      if (!input.throttle) this.gasAt = 0;
      if (this.stateT >= 3) {
        this.setState('race');
        g.hud.count('VAI!', true);
        g.audio.play('go');
        if (this.startLamp) this.startLamp.color.set(0x30ff60);
        if (input.throttle && this.gasAt > 2.2) {
          this.player.sim.boostT = 1.3;
          g.hud.toast('LARGADA PERFEITA!', 'gold');
          g.audio.play('boost');
        }
        for (const c of this.cars) if (!c.isPlayer && this.rng.chance(0.4)) c.sim.boostT = this.rng.float(0.4, 1.0);
      }
      this.chase.update(dt, this.player.sim, 0, 0);
    } else {
      this.acc += Math.min(dt, 0.1);
      while (this.acc >= STEP) {
        this.acc -= STEP;
        this.step(STEP, input);
      }
      const ps = this.player.sim;
      const boost = ps.boostT > 0 || ps.nitroOn ? 1 : 0;
      this.chase.update(dt, ps, ps.speed / ps.stats.vmax, boost);
      if (this.state === 'finished' && this.stateT > 3.2 && !this.resultsShown) {
        this.resultsShown = true;
        g.showResults(this.results());
      }
    }
    this.obstacles.update(this.state === 'intro' || this.state === 'countdown' ? 0 : this.raceTime, dt);
    this.trackMesh.boost.update(dt);
    this.trackMesh.coins.update(this.t);
    this.env.update(this.t, this.camera.position);
    this.updateVisuals(dt);
    this.updateHud(dt, input);
    // sombra acompanha o jogador
    const p = this.player.sim.pos;
    this.sun.target.position.copy(p);
    this.sun.position.copy(p).addScaledVector(this.sunDir, 120);
    g.fx.sparks.update(dt);
    g.fx.smoke.update(dt);
  }

  setState(s) {
    this.state = s;
    this.stateT = 0;
  }

  step(dt, input) {
    const g = this.game;
    this.raceTime += dt;
    const track = this.track;
    const lead = Math.max(...this.sims.map((s) => s.progress));
    const pp = this.player.sim.progress;
    for (const c of this.cars) {
      const s = c.sim;
      let inp;
      if (c.isPlayer && !s.finished && !g.autopilot) inp = input;
      else inp = c.ai.input(dt, this.raceTime, this.sims);
      // elástico: a IA não some na frente nem fica muito para trás
      if (!c.isPlayer) {
        const gap = (pp - s.progress) / 300;
        s.vmaxMul = 1 + clamp(gap, -0.07, 0.09) * (s.finished ? 0 : 1);
      }
      s.update(dt, inp);
      if (!s.finished && s.progress >= track.finishS) {
        s.finished = true;
        s.finishTime = this.raceTime;
        c.finishPos = ++this.finishCount;
        if (c.isPlayer) this.onPlayerFinish(c);
      }
    }
    this.obstacles.collide(this.sims, this.raceTime);
    collideCars(this.sims);
    // placas de turbo
    for (const c of this.cars) {
      const s = c.sim;
      if (s.air || s.boostT > 1.1) continue;
      for (const b of track.boosts) {
        if (Math.abs(b.s - s.s) < 3.6 && Math.abs(b.d - s.d) < 2.4) {
          s.boostT = 1.5;
          s.nitro = Math.min(1, s.nitro + 0.08);
          if (c.isPlayer) {
            g.audio.play('boost');
            g.hud.toast('TURBO!', 'blue');
          }
        }
      }
    }
    // moedas
    const ps = this.player.sim;
    if (!ps.air) {
      const n = this.trackMesh.coins.collect(ps.s, ps.d);
      if (n) {
        this.coins += n;
        ps.nitro = Math.min(1, ps.nitro + 0.035 * n);
        g.audio.play('coin');
        g.hud.coin(this.coins);
      }
    } else ps.nitro = Math.min(1, ps.nitro + dt * 0.12);
    // trechos especiais concluídos
    const f = track.flagsAt(ps.s);
    const pf = this.lastFlags || 0;
    if (!ps.air && pf & F_LOOP && !(f & F_LOOP)) {
      g.hud.toast('LOOP!', 'pink');
      ps.nitro = Math.min(1, ps.nitro + 0.15);
    }
    if (!ps.air && pf & F_MAGNET && !(f & F_MAGNET)) {
      g.hud.toast('PARAFUSO!', 'pink');
      ps.nitro = Math.min(1, ps.nitro + 0.15);
    }
    this.lastFlags = ps.air ? pf : f;
    this.handleEvents();
    this.rank();
  }

  onPlayerFinish(c) {
    const g = this.game;
    this.setState('finished');
    g.audio.play(c.finishPos <= 3 ? 'win' : 'finish');
    g.hud.finish(c.finishPos);
  }

  rank() {
    const order = [...this.cars].sort((a, b) => {
      if (a.sim.finished && b.sim.finished) return a.finishPos - b.finishPos;
      if (a.sim.finished) return -1;
      if (b.sim.finished) return 1;
      return b.sim.progress - a.sim.progress;
    });
    order.forEach((c, i) => {
      if (c.isPlayer && this.state === 'race' && i + 1 < (this.bestPos ?? 99) && this.raceTime > 2 && this.raceTime - (this.overtakeT ?? -9) > 3) {
        this.game.hud.toast('ULTRAPASSAGEM!', 'green', 0.9);
        this.overtakeT = this.raceTime;
      }
      if (c.isPlayer) this.bestPos = Math.min(this.bestPos ?? 99, i + 1);
      c.pos = i + 1;
    });
    this.order = order;
  }

  handleEvents() {
    const g = this.game;
    const fx = g.fx;
    const v = new THREE.Vector3();
    const p = new THREE.Vector3();
    for (const c of this.cars) {
      const s = c.sim;
      const mine = c.isPlayer;
      for (const e of s.events) {
        switch (e.type) {
          case 'land':
            if (e.power > 6) {
              for (let i = 0; i < 10; i++) {
                p.copy(s.pos).addScaledVector(s.right, (Math.random() - 0.5) * 2.4);
                v.copy(s.up).multiplyScalar(2 + Math.random() * 2).addScaledVector(s.right, (Math.random() - 0.5) * 6).addScaledVector(s.fwd, -s.v * 0.2);
                fx.smoke.emit(p, v, this.world.id === 'glacial' ? '#ffffff' : '#d8d0c8', 1.6 + Math.random(), 0.8, { drag: 2, grow: 3, alpha: 0.5 });
              }
            }
            if (mine) {
              g.audio.play('land', e.power);
              this.chase.shake = Math.min(1, e.power / 25);
              if (e.airTime > 0.9) {
                g.hud.toast(e.airTime > 1.6 ? 'SUPER SALTO!' : 'SALTO!', 'gold');
                s.nitro = Math.min(1, s.nitro + 0.1);
              }
            }
            break;
          case 'hit':
            for (let i = 0; i < 24; i++) {
              p.copy(s.pos).addScaledVector(s.up, 0.8);
              v.set(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).multiplyScalar(18);
              fx.sparks.emit(p, v, i % 3 ? '#ffd060' : '#ffffff', 0.18 + Math.random() * 0.18, 0.5 + Math.random() * 0.3, { drag: 1.5, grav: 20 });
            }
            if (mine) {
              g.audio.play('hit', e.power);
              this.chase.shake = 1;
              g.vibrate(60);
            }
            break;
          case 'bump':
          case 'rub':
            if (mine) {
              g.audio.play('bump', e.power);
              this.chase.shake = Math.max(this.chase.shake, 0.3);
            }
            for (let i = 0; i < 6; i++) {
              p.copy(s.pos).addScaledVector(s.up, 0.5);
              v.set(Math.random() - 0.5, Math.random(), Math.random() - 0.5).multiplyScalar(8);
              fx.sparks.emit(p, v, '#ffe080', 0.16, 0.35, { drag: 2, grav: 15 });
            }
            break;
          case 'crate':
            for (let i = 0; i < 14; i++) {
              p.copy(s.pos).addScaledVector(s.fwd, 2).addScaledVector(s.up, 1);
              v.set(Math.random() - 0.5, Math.random(), Math.random() - 0.5).multiplyScalar(10).addScaledVector(s.fwd, s.v * 0.5);
              fx.smoke.emit(p, v, i % 2 ? '#b57934' : '#8a5a2a', 0.35, 0.9, { drag: 1, grav: 18, alpha: 1 });
            }
            if (mine) {
              g.audio.play('crate');
              this.chase.shake = 0.5;
            }
            break;
          case 'jump':
            if (mine) g.audio.play('jump');
            break;
          case 'fall':
            if (mine) {
              g.audio.play('fall');
              g.hud.fade(true);
            }
            break;
          case 'respawn':
            if (mine) {
              g.hud.fade(false);
              g.audio.play('whoosh');
            }
            break;
          case 'loopFail':
            if (mine) g.hud.toast('Mais velocidade no loop!', 'red', 1.6);
            break;
          case 'offEdge':
            if (mine) g.hud.toast('Cuidado com a borda!', 'red', 1.2);
            break;
        }
      }
      s.events.length = 0;
      // faíscas raspando a defensa
      if (s.scraping && Math.random() < 0.7) {
        p.copy(s.pos).addScaledVector(s.right, s.scraping * 1.0).addScaledVector(s.up, 0.4);
        v.copy(s.fwd).multiplyScalar(-s.v * 0.3).addScaledVector(s.up, 3 + Math.random() * 3).addScaledVector(s.right, -s.scraping * 2);
        fx.sparks.emit(p, v, '#ffd060', 0.15, 0.3, { drag: 2, grav: 18 });
      }
    }
  }

  // -------------------------------------------------------------- visual
  updateVisuals(dt) {
    const cam = this.camera.position;
    for (const c of this.cars) {
      const s = c.sim;
      const g = c.model.group;
      g.position.copy(s.pos);
      g.quaternion.copy(s.quat);
      const boost = s.nitroOn ? 1 : s.boostT > 0 ? 0.7 : 0;
      c.model.animate(dt, s.v, s.steer, boost);
      // pisca durante a invencibilidade depois de reaparecer
      g.visible = !(s.ghostT > 0 && Math.floor(this.t * 12) % 2 === 0) && !(s.respawnT > 0 && s.respawnT < 0.3);
      if (c.tag) {
        const sp = c.tag.sp;
        sp.visible = g.visible && this.state !== 'intro';
        sp.position.copy(s.pos).addScaledVector(s.up, 1.9);
        // tamanho constante na tela; some quando o carro está colado na câmera
        const dist = cam.distanceTo(s.pos);
        const sc = clamp(dist * 0.05, 0.3, 6);
        sp.scale.set(sc * 2, sc, 1);
        sp.material.opacity = clamp((dist - 7) / 6, 0, 1);
        const key = c.pos + c.name;
        if (key !== c.tag.last) {
          c.tag.last = key;
          drawTag(c.tag.canvas, `${c.pos}º`, c.name, TAG_COLORS[c.pos - 1] || '#5fb0ff');
          c.tag.tex.needsUpdate = true;
        }
      }
      // fumaça de nitro do jogador
      if (boost > 0 && c.isPlayer && Math.random() < 0.5) {
        const p = s.pos.clone().addScaledVector(s.fwd, -2.4).addScaledVector(s.up, 0.5);
        const v = s.fwd.clone().multiplyScalar(-4).addScaledVector(s.up, 1);
        this.game.fx.sparks.emit(p, v, s.nitroOn ? '#5fd8ff' : '#ff9a3a', 0.35, 0.25, { drag: 3, alpha: 0.7 });
      }
    }
  }

  updateHud(dt, input) {
    const g = this.game;
    const ps = this.player.sim;
    g.hud.update({
      pos: this.player.pos,
      total: this.cars.length,
      time: this.raceTime,
      speed: ps.speed,
      nitro: ps.nitro,
      nitroOn: ps.nitroOn,
      progress: this.cars.map((c) => ({ p: clamp((c.sim.progress - this.track.startS) / (this.track.finishS - this.track.startS), 0, 1), me: c.isPlayer, pos: c.pos })),
      boost: ps.boostT > 0 || ps.nitroOn,
      speedRatio: ps.speed / ps.stats.vmax,
      dt,
    });
  }

  results() {
    const order = this.order || this.cars;
    const list = order.map((c, i) => ({
      name: c.name,
      car: c.def.name,
      me: c.isPlayer,
      pos: i + 1,
      time: c.sim.finished ? c.sim.finishTime : null,
    }));
    const pos = this.player.pos;
    return { level: this.info, pos, list, coins: this.coins, reward: this.info.reward[pos - 1] ?? 50, time: this.player.sim.finishTime };
  }

  dispose() {
    const g = this.game;
    this.scene.remove(g.fx.sparks.points, g.fx.smoke.points);
    this.scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) m.dispose();
      }
    });
    for (const c of this.cars) c.model.dispose();
    if (this.envMap) this.envMap.dispose();
  }
}
