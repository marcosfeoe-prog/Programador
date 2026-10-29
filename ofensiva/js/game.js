// Núcleo do jogo: cena, rodadas, economia, compra, disparos (com penetração em
// caixotes), dano com colete/capacete, granadas, bomba, armas no chão e modos.
import * as THREE from 'three';
import { GameMap, CELL } from './map.js';
import { Actor } from './actor.js';
import { Bot, makePlan, SKILL } from './bots.js';
import { Effects } from './effects.js';
import { WEAPONS, EQUIP, makeWeapon, DAMAGE_GROUPS } from './weapons.js';
import { applyMovement, moveActor, pushOut, eyeHeight, rayActor, PHYS } from './physics.js';
import { poseCharacter, setCharacterGun, buildGun } from './models.js';
import { clamp, rand, pick, shuffle, DEG, dirFromAngles, angDiff } from './util.js';

const FREEZE = 6;
const BUY_TIME = 25;
const ROUND_TIME = 115;
const BOMB_TIME = 40;
const PLANT_TIME = 3.2;
const END_DELAY = 6;
const DM_TIME = 600;
const MAX_MONEY = 16000;
const NADE_GRAV = 8;
const NADE_SPEED = 16.9;

const MATCH = {
  quick: { max: 8, half: 4, win: 5, label: 'Rápida' },
  short: { max: 16, half: 8, win: 9, label: 'Curta' },
  comp: { max: 24, half: 12, win: 13, label: 'Competitiva' },
};

const BOT_NAMES = [
  'Marcão', 'Juninho', 'Tatu', 'Bigode', 'Zeca', 'Pardal', 'Fumaça', 'Corujão', 'Baiano', 'Gaúcho',
  'Dentinho', 'Careca', 'Tiziu', 'Mineiro', 'Peixe', 'Brabo', 'Xerife', 'Pimenta', 'Sombra', 'Trovão',
];

const RADIO = {
  spotted: ['Inimigo avistado!', 'Contato!', 'Tem gente aqui!'],
  plant: ['Bomba plantada!'],
  go: { A: ['Vamos pro A!', 'Bomb no A, bora!'], B: ['Vamos pro B!', 'Rush B!'] },
  defusing: ['Desarmando a bomba, me cobre!'],
  dropped: ['Larguei a bomba!'],
  ok: ['Entendido.', 'Positivo.', 'Na escuta.'],
};

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _dir = new THREE.Vector3();

export class Game {
  constructor({ renderer, audio, input, hud, settings, viewmodel }) {
    this.renderer = renderer;
    this.audio = audio;
    this.input = input;
    this.hud = hud;
    this.settings = settings;
    this.vm = viewmodel;
    this.time = 0;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(74, innerWidth / innerHeight, 0.05, 400);
    this.camera.rotation.order = 'YXZ';
    this.map = new GameMap();
    this.setupScene();
    this.fx = new Effects(this.scene);
    this.actors = [];
    this.bots = [];
    this.items = [];
    this.nades = [];
    this.bomb = { state: 'none', pos: new THREE.Vector3(), carrier: null, mesh: null, plantedAt: 0, defuser: null, beepT: 0 };
    this.intel = { T: null, CT: null };
    this.score = [0, 0];
    this.lossStreak = { T: 0, CT: 0 };
    this.phase = 'idle';
    this.running = false;
    this.paused = false;
    this.radioCooldown = 0;
    hud.setMap(this.map);
  }

  // ------------------------------------------------------------ cena
  setupScene() {
    const s = this.scene;
    const skyCol = new THREE.Color(0xd8c7a6);
    s.fog = new THREE.Fog(skyCol, 70, 260);
    s.background = skyCol;
    // céu
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(300, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: { sun: { value: new THREE.Vector3(0.45, 0.62, 0.35).normalize() } },
        vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: `uniform vec3 sun; varying vec3 vP;
          void main(){
            float h = clamp(vP.y, 0.0, 1.0);
            vec3 zen = vec3(0.24,0.47,0.78);
            vec3 hor = vec3(0.85,0.78,0.65);
            vec3 c = mix(hor, zen, pow(h, 0.55));
            float d = max(dot(normalize(vP), sun), 0.0);
            c += vec3(1.0,0.85,0.6) * pow(d, 300.0) * 3.0 + vec3(1.0,0.8,0.5) * pow(d, 8.0) * 0.25;
            if (vP.y < 0.0) c = hor * 0.9;
            gl_FragColor = vec4(c, 1.0);
          }`,
      }),
    );
    sky.frustumCulled = false;
    s.add(sky);
    this.sky = sky;

    s.add(new THREE.HemisphereLight(0xc4d8ff, 0x8a6a40, 1.25));
    const sun = new THREE.DirectionalLight(0xfff0d6, 3.2);
    const cx = (this.map.W * CELL) / 2;
    const cz = (this.map.H * CELL) / 2;
    sun.position.set(cx + 45, 62, cz + 35);
    sun.target.position.set(cx, 0, cz);
    s.add(sun, sun.target);
    const sc = sun.shadow.camera;
    sc.left = -65;
    sc.right = 65;
    sc.top = 65;
    sc.bottom = -65;
    sc.near = 10;
    sc.far = 200;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.04;
    this.sun = sun;
    this.map.build(s);
    this.applyQuality();
  }

  applyQuality() {
    const q = this.settings.quality;
    const r = this.renderer;
    r.shadowMap.enabled = q !== 'low';
    this.sun.castShadow = q !== 'low';
    const size = q === 'high' ? 4096 : 2048;
    if (this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    r.setPixelRatio(Math.min(devicePixelRatio, q === 'high' ? 2 : q === 'medium' ? 1.5 : 1));
    this.scene.traverse((o) => {
      if (o.material) o.material.needsUpdate = true;
    });
  }

  // ------------------------------------------------------------ partida
  start(opts) {
    this.opts = opts;
    this.mode = opts.mode;
    this.match = MATCH[opts.length] || MATCH.short;
    this.score = [0, 0];
    this.roundNum = 0;
    this.lossStreak = { T: 1, CT: 1 };
    this.halfDone = false;
    for (const a of this.actors) if (a.model) this.scene.remove(a.model);
    this.actors = [];
    this.bots = [];
    this.clearWorld();
    this.hud.clearFeeds();
    let team = opts.team;
    if (team === 'auto') team = Math.random() < 0.5 ? 'T' : 'CT';
    const enemy = team === 'T' ? 'CT' : 'T';
    const n = opts.size;
    const names = shuffle(BOT_NAMES.slice());
    this.player = new Actor({ name: opts.playerName || 'Você', team, squad: 0, isPlayer: true });
    this.actors.push(this.player);
    const skill = this.mode === 'practice' ? null : opts.skill;
    const addBot = (t, squad) => {
      const a = new Actor({ name: 'BOT ' + names.pop(), team: t, squad });
      a.makeModel(this.scene);
      const b = new Bot(this, a, skill || 'easy');
      if (this.mode === 'practice') b.skill = { ...SKILL.easy, react: 1e9, fov: 1 };
      a.bot = b;
      this.actors.push(a);
      this.bots.push(b);
    };
    if (this.mode !== 'practice') for (let i = 0; i < n - 1; i++) addBot(team, 0);
    for (let i = 0; i < n; i++) addBot(enemy, 1);
    // um AWPer por time
    for (const t of ['T', 'CT']) {
      const tb = this.bots.filter((b) => b.a.team === t);
      if (tb.length >= 3) tb[1].awper = true;
    }
    this.player.makeModel(this.scene);
    this.player.model.visible = false;
    this.vm.setTeam(team);
    this.running = true;
    this.matchOver = false;
    this.dmEnd = this.time + DM_TIME;
    this.startRound();
  }

  stop() {
    this.running = false;
    this.phase = 'idle';
    for (const a of this.actors) if (a.model) this.scene.remove(a.model);
    this.actors = [];
    this.bots = [];
    this.clearWorld();
  }

  clearWorld() {
    for (const it of this.items) this.scene.remove(it.mesh);
    this.items = [];
    for (const n of this.nades) this.scene.remove(n.mesh);
    this.nades = [];
    if (this.bomb.mesh) this.scene.remove(this.bomb.mesh);
    this.bomb = { state: 'none', pos: new THREE.Vector3(), carrier: null, mesh: null, plantedAt: 0, defuser: null, beepT: 0 };
    this.fx.reset();
  }

  squadOf(team) {
    return this.player.team === team ? 0 : 1;
  }

  modeLabel() {
    return this.mode === 'defuse' ? `Desarme · ${this.match.label}` : this.mode === 'dm' ? 'Mata-mata' : 'Treino livre';
  }

  roundLabel() {
    if (this.mode === 'dm') return 'Mata-mata';
    if (this.mode === 'practice') return 'Treino';
    return `Rodada ${this.roundNum}/${this.match.max}`;
  }

  timeLeft() {
    if (this.mode === 'dm') return this.dmEnd - this.time;
    if (this.mode === 'practice') return 0;
    if (this.phase === 'freeze') return ROUND_TIME;
    if (this.phase === 'end' || this.phase === 'over') return this.endTimeLeft ?? 0;
    return this.roundStart + ROUND_TIME - this.time;
  }

  roundTimeLeft() {
    return this.roundStart + ROUND_TIME - this.time;
  }

  roundElapsed() {
    return this.time - this.roundStart;
  }

  freezeLeft() {
    return this.roundStart - this.time;
  }

  startRound() {
    this.clearWorld();
    this.hud.clearFeeds();
    this.roundNum++;
    this.pendingRadio = null;
    this.phase = this.mode === 'defuse' ? 'freeze' : 'live';
    this.roundStart = this.time + (this.mode === 'defuse' ? FREEZE : 0);
    this.buyStart = this.time;
    this.intel = { T: null, CT: null };
    this.plantedThisRound = false;
    this.roundDamage = new Map();
    const firstOfHalf = this.roundNum === 1 || this.roundNum === this.match.half + 1;
    for (const t of ['T', 'CT']) {
      const team = this.actors.filter((a) => a.team === t);
      const spawns = shuffle(this.map.spawnPoints(t));
      team.forEach((a, i) => {
        const p = spawns[i % spawns.length];
        a.spawn(p, t === 'T' ? 0 : Math.PI, a.alive && !firstOfHalf && this.mode === 'defuse');
        if (a.model) {
          a.model.visible = !a.isPlayer;
          a.model.rotation.set(0, 0, 0);
          a.model.position.copy(p);
        }
      });
    }
    if (this.mode === 'dm' || this.mode === 'practice') {
      for (const a of this.actors) this.respawnAnywhere(a);
      for (const b of this.bots) this.giveRandomLoadout(b.a);
      this.player.money = 16000;
    }
    if (this.mode === 'defuse') {
      // bomba para um T aleatório
      const ts = this.actors.filter((a) => a.team === 'T');
      const carrier = pick(ts);
      carrier.inv[4] = makeWeapon('c4');
      this.bomb.state = 'carried';
      this.bomb.carrier = carrier;
      // planos e compras dos bots
      for (const t of ['T', 'CT']) {
        const tb = this.bots.filter((b) => b.a.team === t);
        const plan = makePlan(t, tb);
        tb.forEach((b, i) => b.roundStart(plan, i));
        if (t === 'T' && tb.length) this.teamPlanT = plan;
      }
      const pistol = firstOfHalf;
      for (const b of this.bots) b.buy(this.roundNum, pistol);
      if (this.player.team === 'T' && this.teamPlanT) {
        const tb = this.bots.find((b) => b.a.team === 'T');
        if (tb) this.pendingRadio = { at: this.time + 1.5, a: tb.a, text: pick(RADIO.go[this.teamPlanT.site]) };
      }
      if (carrier === this.player) this.hud.message('Você está com a bomba', 'Plante no bombsite A ou B (segure E)', '#f0b440', 4, this.time);
      else this.hud.message(this.player.team === 'T' ? 'Terroristas' : 'Contra-Terroristas', this.player.team === 'T' ? 'Plante a bomba ou elimine os CTs' : 'Defenda os bombsites', this.player.team === 'T' ? '#f0b440' : '#6ea8ff', 3, this.time);
    } else {
      for (const b of this.bots) b.roundStart({ site: 'A', execAt: 0, assign: ['A', 'B', 'mid'] }, 0);
    }
    this.player.slot = this.player.bestSlot();
    this.equipView(this.player, true);
    this.spectating = null;
  }

  giveRandomLoadout(a) {
    const prim = pick(['ak47', 'm4a4', 'awp', 'famas', 'galil', 'mp9', 'ssg08', 'nova', 'mac10', 'ak47', 'm4a4']);
    a.inv[0] = makeWeapon(prim);
    a.inv[1] = makeWeapon(pick(['deagle', 'usp', 'glock', 'p250']));
    a.armor = 100;
    a.helmet = true;
    a.slot = 0;
  }

  // Ponto de renascimento longe dos inimigos (mata-mata/treino).
  respawnAnywhere(a) {
    let best = null;
    let bestD = -1;
    for (let k = 0; k < 30; k++) {
      const cx = 1 + Math.floor(Math.random() * (this.map.W - 2));
      const cz = 1 + Math.floor(Math.random() * (this.map.H - 2));
      if (!this.map.walkable(cx, cz)) continue;
      const p = this.map.cellCenter(cx, cz);
      let dmin = 999;
      for (const o of this.actors) if (o !== a && o.alive && o.team !== a.team) dmin = Math.min(dmin, o.pos.distanceTo(p));
      if (dmin > bestD) {
        bestD = dmin;
        best = p;
      }
      if (dmin > 25) break;
    }
    a.spawn(best || this.map.spawnPoints(a.team)[0], Math.random() * Math.PI * 2, false);
    a.armor = 100;
    a.helmet = true;
    if (a.model) {
      a.model.visible = !a.isPlayer;
      a.model.rotation.set(0, 0, 0);
    }
    a.protectUntil = this.time + 1.5;
  }

  endRound(winner, reason) {
    if (this.phase === 'end' || this.phase === 'over') return;
    this.phase = 'end';
    this.endAt = this.time + END_DELAY;
    const loser = winner === 'T' ? 'CT' : 'T';
    const wSquad = this.squadOf(winner);
    this.score[wSquad]++;
    // dinheiro
    const winMoney = reason === 'bomb' || reason === 'defuse' ? 3500 : 3250;
    const lossMoney = Math.min(3400, 1400 + 500 * (this.lossStreak[loser] - 1));
    for (const a of this.actors) {
      if (a.team === winner) this.addMoney(a, winMoney, 'vitória da rodada');
      else {
        let m = lossMoney;
        if (a.team === 'T' && this.plantedThisRound) m += 800;
        // T que sobreviveu sem plantar quando o tempo acaba não recebe bônus
        if (a.team === 'T' && reason === 'time' && a.alive) m = 0;
        if (m) this.addMoney(a, m, 'derrota da rodada');
      }
    }
    this.lossStreak[loser] = Math.min(5, this.lossStreak[loser] + 1);
    this.lossStreak[winner] = Math.max(1, this.lossStreak[winner] - 1);
    // MVP: quem mais matou no time vencedor (ou quem plantou/desarmou)
    let mvp = null;
    if (reason === 'defuse' && this.bomb.defuser) mvp = this.bomb.defuser;
    else if (reason === 'bomb' && this.bomb.planter) mvp = this.bomb.planter;
    else for (const a of this.actors) if (a.team === winner && (!mvp || a.roundKills > mvp.roundKills)) mvp = a;
    if (mvp) mvp.mvps++;
    const title = winner === 'T' ? 'Os Terroristas venceram' : 'Os Contra-Terroristas venceram';
    const why = {
      elim: 'Equipe adversária eliminada',
      bomb: 'O alvo foi destruído',
      defuse: 'A bomba foi desarmada',
      time: 'O tempo acabou',
    }[reason];
    this.hud.message(title, `${why}${mvp ? ` · MVP: ${mvp.name}` : ''}`, winner === 'T' ? '#f0b440' : '#6ea8ff', END_DELAY - 0.5, this.time);
    this.audio.play(winner === this.player.team ? 'win' : 'lose', null, 0.8);
    const sq = this.score;
    if (sq[0] >= this.match.win || sq[1] >= this.match.win || this.roundNum >= this.match.max) {
      this.matchOver = true;
    }
  }

  addMoney(a, amount, reason) {
    const before = a.money;
    a.money = clamp(a.money + amount, 0, MAX_MONEY);
    if (a.isPlayer && a.money !== before) this.hud.moneyDelta(a.money - before, reason);
  }

  finishMatch() {
    this.phase = 'over';
    const [a, b] = this.score;
    const title = a > b ? 'VITÓRIA!' : a < b ? 'DERROTA' : 'EMPATE';
    const col = a > b ? '#8fe36d' : a < b ? '#ff6655' : '#fff';
    let best = null;
    for (const x of this.actors) if (!best || x.score > best.score) best = x;
    this.hud.message(title, `Placar final ${a} × ${b}${best ? ` · Melhor jogador: ${best.name} (${best.kills} abates)` : ''}`, col, 9999, this.time);
    this.overAt = this.time;
    this.onMatchOver?.();
  }

  halftime() {
    for (const a of this.actors) {
      a.team = a.team === 'T' ? 'CT' : 'T';
      a.money = 800;
      a.alive = false; // força equipamento inicial
      a.inv = [null, null, makeWeapon('knife'), null, null];
      a.armor = 0;
      a.helmet = false;
      a.kit = false;
      a.grenades = [];
      if (!a.isPlayer) a.makeModel(this.scene);
      else {
        a.makeModel(this.scene);
        a.model.visible = false;
      }
    }
    this.lossStreak = { T: 1, CT: 1 };
    this.vm.setTeam(this.player.team);
    this.halfDone = true;
    this.hud.message('Troca de lados', `Agora você é ${this.player.team === 'T' ? 'Terrorista' : 'Contra-Terrorista'}`, '#fff', 4, this.time);
  }

  // ------------------------------------------------------------ compra
  canBuy(a) {
    if (!a.alive || this.phase === 'end' || this.phase === 'over') return false;
    if (this.mode !== 'defuse') return true;
    if (this.time - this.buyStart > BUY_TIME) return false;
    const sp = this.map.spawnPoints(a.team);
    const c = sp.reduce((acc, p) => acc.add(p), new THREE.Vector3()).divideScalar(sp.length);
    return Math.hypot(a.pos.x - c.x, a.pos.z - c.z) < 16;
  }

  buyTimeLeft() {
    return BUY_TIME - (this.time - this.buyStart);
  }

  teamForceBuy(team) {
    // força a compra quando o time está com o bônus de derrota alto ou é a última chance
    return this.lossStreak[team] >= 3 || Math.random() < 0.35;
  }

  priceOf(a, id) {
    if (this.mode !== 'defuse') return 0;
    if (id === 'vesthelm' && a.armor >= 100 && !a.helmet) return 350;
    return (WEAPONS[id] || EQUIP[id]).price;
  }

  buyCheck(a, id) {
    const w = WEAPONS[id];
    const e = EQUIP[id];
    const item = w || e;
    const team = item.team || 'any';
    if (team !== 'any' && team !== a.team) return { ok: false, why: 'Equipe errada' };
    if (w && w.slot <= 1 && a.inv[w.slot]?.id === id) return { ok: false, owned: true };
    if (w && w.slot === 3) {
      const count = a.grenades.filter((x) => x === id).length;
      if (a.grenades.length >= 4 || count >= (w.max || 1)) return { ok: false, owned: true };
    }
    if (id === 'vest' && a.armor >= 100) return { ok: false, owned: true };
    if (id === 'vesthelm' && a.armor >= 100 && a.helmet) return { ok: false, owned: true };
    if (id === 'kit' && a.kit) return { ok: false, owned: true };
    if (a.money < this.priceOf(a, id)) return { ok: false, why: 'Dinheiro insuficiente' };
    return { ok: true };
  }

  buy(a, id, silent = false) {
    if (!this.canBuy(a)) return false;
    const r = this.buyCheck(a, id);
    if (!r.ok) return false;
    const price = this.priceOf(a, id);
    a.money -= price;
    const w = WEAPONS[id];
    if (w) {
      if (w.slot === 3) a.grenades.push(id);
      else {
        if (a.inv[w.slot]) this.dropWeapon(a, w.slot, true);
        a.inv[w.slot] = makeWeapon(id);
        if (!a.isPlayer) a.slot = a.bestSlot();
      }
    } else if (id === 'vest') a.armor = 100;
    else if (id === 'vesthelm') {
      a.armor = 100;
      a.helmet = true;
    } else if (id === 'kit') a.kit = true;
    if (!silent || a.isPlayer) this.audio.play('buy', null, 0.6);
    return true;
  }

  playerBuy(id) {
    const p = this.player;
    if (!this.canBuy(p)) {
      this.audio.play('deny', null, 0.5);
      return;
    }
    const w = WEAPONS[id];
    if (this.buy(p, id)) {
      if (w && w.slot <= 1) {
        p.switchTo(w.slot, this.time) || (p.drawEnd = this.time + 0.6);
        this.equipView(p);
      } else if (w && w.slot === 3 && p.slot === 3) this.equipView(p);
    } else this.audio.play('deny', null, 0.5);
  }

  // ------------------------------------------------------------ armas no chão
  dropWeapon(a, slot, quiet = false) {
    const w = a.inv[slot];
    if (!w) return;
    a.inv[slot] = null;
    if (slot === 4) {
      this.dropBomb(a);
      return;
    }
    const mesh = buildGun(w.id);
    const pos = a.pos.clone();
    pos.y += eyeHeight(a) - 0.2;
    dirFromAngles(a.yaw, a.pitch, _dir);
    const vel = _dir.clone().multiplyScalar(quiet ? 2 : 5).add(a.vel);
    vel.y += 1.5;
    mesh.position.copy(pos);
    this.scene.add(mesh);
    this.items.push({ w, mesh, pos, vel, t: 0, from: a, rest: false });
    if (this.items.length > 24) {
      const old = this.items.shift();
      this.scene.remove(old.mesh);
    }
    if (a.slot === slot) {
      a.switchTo(a.bestSlot(), this.time);
      if (a.isPlayer) this.equipView(a);
    }
  }

  dropBomb(a) {
    a.inv[4] = null;
    const b = this.bomb;
    b.state = 'dropped';
    b.carrier = null;
    b.pos.copy(a.pos);
    b.pos.y = this.map.groundAt(a.pos.x, a.pos.z, 0.1, a.pos.y + 0.5);
    if (b.mesh) this.scene.remove(b.mesh);
    b.mesh = buildGun('c4');
    b.mesh.position.copy(b.pos);
    b.mesh.rotation.y = Math.random() * 6;
    this.scene.add(b.mesh);
    b.seenByCT = false;
    if (a.slot === 4) {
      a.switchTo(a.bestSlot(), this.time);
      if (a.isPlayer) this.equipView(a);
    }
    if (a.alive && !a.isPlayer) this.radio(a, pick(RADIO.dropped));
  }

  bombClaimer(a) {
    const b = this.bomb;
    let best = null;
    let bd = Infinity;
    for (const o of this.actors) {
      if (!o.alive || o.team !== 'T' || o.isPlayer) continue;
      // quem está em combate conta como mais longe
      const d = o.pos.distanceTo(b.pos) + (o.bot?.target ? 25 : 0);
      if (d < bd) {
        bd = d;
        best = o;
      }
    }
    return best === a;
  }

  updateItems(dt) {
    for (const it of this.items) {
      it.t += dt;
      if (!it.rest) {
        it.vel.y -= PHYS.gravity * dt;
        const n = _v.copy(it.pos).addScaledVector(it.vel, dt);
        const len = it.vel.length() * dt;
        if (len > 0) {
          _dir.copy(it.vel).normalize();
          const hit = this.map.raycast(it.pos, _dir, len + 0.05);
          if (hit) {
            it.pos.copy(hit.point).addScaledVector(hit.normal, 0.03);
            if (hit.normal.y > 0.5) {
              it.rest = true;
              it.mesh.rotation.set(0, Math.random() * 6, Math.PI / 2);
            } else it.vel.reflect(hit.normal).multiplyScalar(0.3);
          } else it.pos.copy(n);
        }
        it.mesh.position.copy(it.pos);
        if (!it.rest) it.mesh.rotation.y += dt * 6;
        else it.mesh.position.y += 0.03;
      }
      // pegar automaticamente (espaço vazio)
      if (it.t < 0.6) continue;
      for (const a of this.actors) {
        if (!a.alive || (it.from === a && it.t < 1.5)) continue;
        if (a.inv[it.w.def.slot]) continue;
        if (Math.hypot(a.pos.x - it.pos.x, a.pos.z - it.pos.z) < 1.1 && Math.abs(a.pos.y - it.pos.y) < 1.5) {
          this.pickup(a, it);
          break;
        }
      }
    }
    this.items = this.items.filter((it) => !it.taken);
    // bomba no chão
    const b = this.bomb;
    if (b.state === 'dropped') {
      for (const a of this.actors) {
        if (!a.alive) continue;
        if (Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z) < 1.1 && Math.abs(a.pos.y - b.pos.y) < 1.5) {
          if (a.team === 'T') {
            a.inv[4] = makeWeapon('c4');
            b.state = 'carried';
            b.carrier = a;
            this.scene.remove(b.mesh);
            b.mesh = null;
            if (a.isPlayer) this.hud.message('Você pegou a bomba', '', '#f0b440', 2, this.time);
            break;
          }
        }
      }
    }
  }

  pickup(a, it) {
    a.inv[it.w.def.slot] = it.w;
    it.taken = true;
    this.scene.remove(it.mesh);
    if (a.isPlayer) {
      this.audio.play('magin', null, 0.5);
      if (it.w.def.slot < a.slot && a.slot !== 4) {
        a.switchTo(it.w.def.slot, this.time);
        this.equipView(a);
      }
    } else a.slot = a.bestSlot();
  }

  // Item mirado pelo jogador (para trocar com E).
  lookedItem(a) {
    const eye = _v2.copy(a.pos);
    eye.y += eyeHeight(a);
    dirFromAngles(a.yaw, a.pitch, _dir);
    let best = null;
    let bd = 2.4;
    for (const it of this.items) {
      _v.subVectors(it.pos, eye);
      const t = _v.dot(_dir);
      if (t < 0 || t > bd) continue;
      const perp = _v.addScaledVector(_dir, -t).length();
      if (perp < 0.45) {
        bd = t;
        best = it;
      }
    }
    return best;
  }

  // ------------------------------------------------------------ armas
  equipView(a, instant = false) {
    if (!a.isPlayer) return;
    const w = a.weapon;
    if (!w) return;
    const t = w.def.type;
    const type = t === 'rifle' ? 'rifle' : t;
    this.vm.equip(w.id, type, instant ? 0.01 : Math.max(0.15, a.drawEnd - this.time));
  }

  tryFire(a, time, alt = false) {
    const w = a.weapon;
    if (!w) return;
    const d = w.def;
    if (time < a.nextFire || time < a.drawEnd) return;
    if (this.phase === 'freeze') return;
    if (d.type === 'knife') return this.knifeAttack(a, time, alt);
    if (d.type === 'grenade') {
      if (!a.triggerHeld) this.throwGrenade(a, !alt);
      return;
    }
    if (d.type === 'bomb') return;
    if (a.reloadEnd) {
      if (a.shellReload && w.mag > 0) a.reloadEnd = 0;
      else return;
    }
    if (w.mag <= 0) {
      if (!a.triggerHeld) {
        this.audio.play('click', a.isPlayer ? null : a.pos, 0.6);
        a.nextFire = time + 0.2;
        if (w.reserve > 0) this.reload(a, time);
      }
      return;
    }
    if (!d.auto && a.triggerHeld) return;
    w.mag--;
    a.nextFire = time + d.rate;
    const inacc = a.inaccuracy();
    const baseYaw = a.yaw + a.punch.x * 2 * DEG;
    const basePitch = a.pitch + a.punch.y * 2 * DEG;
    a.onShot(time);
    const eye = new THREE.Vector3(a.pos.x, a.pos.y + eyeHeight(a), a.pos.z);
    const pellets = d.pellets || 1;
    const muzzle = this.muzzlePos(a);
    // sementes compartilhadas por chumbo (espalhamento do cartucho)
    for (let i = 0; i < pellets; i++) {
      let r = inacc * Math.random();
      let th = Math.random() * Math.PI * 2;
      if (pellets > 1) {
        r = inacc * 0.25 * Math.random() + (d.spread / 1000) * Math.sqrt(Math.random());
        th = Math.random() * Math.PI * 2;
      }
      const yaw = baseYaw + (Math.cos(th) * r) / Math.max(0.2, Math.cos(basePitch));
      const pitch = basePitch + Math.sin(th) * r;
      dirFromAngles(yaw, pitch, _dir);
      this.traceBullet(a, eye, _dir.clone(), d, muzzle, i === 0);
    }
    // som e barulho
    const loud = d.sound !== 'silenced';
    this.audio.play(d.sound, a.isPlayer ? null : a.pos, a.isPlayer ? 0.75 : 1.0, 1 + (Math.random() - 0.5) * 0.06, loud ? 9 : 3);
    this.noise(a.pos, loud ? 45 : 14, a, 'shot');
    if (!a.isPlayer) this.fx.muzzle(muzzle);
    else {
      this.vm.kick(d.type === 'sniper' ? 2.5 : d.type === 'shotgun' ? 2 : d.type === 'pistol' ? 1.2 : 1);
      this.shake = Math.min(1, (this.shake || 0) + (d.type === 'sniper' ? 0.6 : 0.15));
    }
    if (d.type === 'sniper' && a.scope) {
      a.rescope = a.scope;
      a.scope = 0;
      a.rescopeAt = time + d.rate * 0.9;
      this.audio.play('bolt', a.isPlayer ? null : a.pos, 0.5);
    }
    if (d.type === 'shotgun') setTimeout(() => this.audio.play('bolt', a.isPlayer ? null : a.pos, 0.4, 1.3), 350);
    if (w.mag === 0 && w.reserve > 0 && !a.isPlayer) this.reload(a, time + 0.2);
  }

  reload(a, time) {
    if (a.startReload(time)) {
      const w = a.weapon;
      if (a.isPlayer) this.vm.reload(w.def.shellReload ? Math.min(2.5, w.def.reload * (w.def.mag - w.mag)) : w.def.reload);
      this.audio.play('magout', a.isPlayer ? null : a.pos, 0.6);
      if (!a.shellReload) setTimeout(() => a.reloadEnd && this.audio.play('magin', a.isPlayer ? null : a.pos, 0.6), w.def.reload * 600);
      return true;
    }
    return false;
  }

  muzzlePos(a) {
    const out = new THREE.Vector3();
    const fx = -Math.sin(a.yaw);
    const fz = -Math.cos(a.yaw);
    const cp = Math.cos(a.pitch);
    out.set(a.pos.x + fx * 0.7 * cp - fz * 0.15, a.pos.y + eyeHeight(a) - 0.18 + Math.sin(a.pitch) * 0.7, a.pos.z + fz * 0.7 * cp + fx * 0.15);
    return out;
  }

  traceBullet(a, origin, dir, d, muzzle, tracer) {
    let dmg = d.damage;
    let o = origin.clone();
    let traveled = 0;
    let range = 250;
    let wall = false;
    for (let pen = 0; pen < 3; pen++) {
      const hit = this.map.raycast(o, dir, range);
      const wt = hit ? hit.dist : range;
      // atores (sem fogo amigo)
      let bestA = null;
      let bh = null;
      for (const v of this.actors) {
        if (v === a || !v.alive || v.team === a.team) continue;
        if (this.mode === 'practice' && v.isPlayer) continue;
        const r = rayActor(o, dir, v, bh ? bh.t : wt);
        if (r) {
          bh = r;
          bestA = v;
        }
      }
      if (bestA) {
        const dist = traveled + bh.t;
        const p = o.clone().addScaledVector(dir, bh.t);
        let dd = dmg * Math.pow(d.rangeMod || 1, dist / 12.5);
        let mult = DAMAGE_GROUPS[bh.group];
        if (bh.group === 'head') mult = d.heads || 4;
        this.applyDamage(bestA, a, dd * mult, bh.group, d.armorPen || 1, d, dir, wall);
        this.fx.blood(p, dir, bh.group === 'head');
        if (tracer && (!a.isPlayer || Math.random() < 0.35)) this.fx.tracer(muzzle, p);
        return;
      }
      if (!hit) {
        if (tracer && (!a.isPlayer || Math.random() < 0.35)) this.fx.tracer(muzzle, o.clone().addScaledVector(dir, Math.min(range, 80)));
        return;
      }
      this.fx.impact(hit.point, hit.normal, hit.kind);
      if (!a.isPlayer && hit.dist + traveled > 3 && Math.random() < 0.35) this.audio.play('ric', hit.point, 0.4, rand(0.8, 1.3), 2);
      if (pen === 0 && tracer && (!a.isPlayer || Math.random() < 0.35)) this.fx.tracer(muzzle, hit.point);
      // penetração em caixotes de madeira
      if (hit.kind === 'crate' && d.type !== 'smg' && d.type !== 'shotgun' && d.armorPen >= 0.6) {
        const exit = hit.point.clone();
        let steps = 0;
        while (this.insideCrate(exit) && steps++ < 50) exit.addScaledVector(dir, 0.05);
        if (steps >= 50) return;
        const thick = exit.distanceTo(hit.point);
        dmg *= Math.max(0.15, 0.6 - thick * 0.2);
        traveled += hit.dist + thick;
        range -= hit.dist + thick;
        o = exit;
        wall = true;
        this.fx.hole(exit.clone().addScaledVector(dir, -0.02), dir.clone().negate());
        continue;
      }
      return;
    }
  }

  insideCrate(p) {
    for (const b of this.map.boxes) {
      if (p.x > b.min[0] && p.x < b.max[0] && p.y > b.min[1] && p.y < b.max[1] && p.z > b.min[2] && p.z < b.max[2]) return true;
    }
    return false;
  }

  knifeAttack(a, time, heavy) {
    a.nextFire = time + (heavy ? 1.0 : 0.45);
    if (a.isPlayer) this.vm.slash();
    this.audio.play('knife', a.isPlayer ? null : a.pos, 0.7, heavy ? 0.8 : 1.1);
    const eye = new THREE.Vector3(a.pos.x, a.pos.y + eyeHeight(a), a.pos.z);
    dirFromAngles(a.yaw, a.pitch, _dir);
    const range = heavy ? 1.6 : 2.0;
    const wall = this.map.raycast(eye, _dir, range);
    const maxT = wall ? wall.dist : range;
    let best = null;
    let bt = maxT;
    for (const v of this.actors) {
      if (v === a || !v.alive || v.team === a.team) continue;
      // tolerância maior que a bala (lâmina)
      for (const off of [0, 0.12, -0.12]) {
        const dd = _v.copy(_dir);
        dd.x += off * Math.cos(a.yaw);
        dd.z -= off * Math.sin(a.yaw);
        dd.normalize();
        const r = rayActor(eye, dd, v, bt);
        if (r && r.t < bt) {
          bt = r.t;
          best = { v, r };
        }
      }
    }
    if (best) {
      const v = best.v;
      // golpe pelas costas
      const back = Math.cos(angDiff(v.yaw, a.yaw)) > 0.5;
      const dmg = heavy ? (back ? 180 : 65) : back ? 90 : 40;
      this.applyDamage(v, a, dmg, 'chest', 0.85, WEAPONS.knife, _dir.clone(), false);
      this.fx.blood(eye.clone().addScaledVector(_dir, bt), _dir, false);
      this.audio.play('flesh', v.pos, 0.8);
    } else if (wall) {
      this.fx.impact(wall.point, wall.normal, wall.kind);
      this.audio.play('ric', wall.point, 0.4, 1.4, 2);
    }
  }

  applyDamage(v, attacker, dmg, group, armorPen, d, dir, wall) {
    if (!v.alive || this.phase === 'over') return;
    if (v.protectUntil && this.time < v.protectUntil) return;
    let hp = dmg;
    const armored = v.armor > 0 && group !== 'legs' && (group !== 'head' || v.helmet);
    if (armored) {
      hp = dmg * armorPen;
      let ad = (dmg - hp) * 0.5;
      if (ad > v.armor) {
        hp += (ad - v.armor) * 2;
        ad = v.armor;
      }
      v.armor = Math.max(0, v.armor - ad);
    }
    hp = Math.max(1, Math.floor(hp));
    const real = Math.min(v.health, hp);
    v.health -= hp;
    if (attacker) v.damageBy.set(attacker, (v.damageBy.get(attacker) || 0) + real);
    if (d.type !== 'grenade' && d.type !== 'bomb') v.slowUntil = this.time + 0.45;
    if (attacker?.bot) attacker.bot.lastHit = this.time;
    if (attacker && attacker.isPlayer && attacker !== v) {
      this.hud.hitmarker(group === 'head');
      this.audio.play(group === 'head' ? (v.helmet && armored ? 'headshot' : 'flesh') : 'hitmark', null, group === 'head' ? 0.6 : 0.4);
    }
    if (v.isPlayer) {
      const src = attacker ? attacker.pos : null;
      if (src) {
        const ang = Math.atan2(-(src.x - v.pos.x), -(src.z - v.pos.z));
        this.hud.damageFrom(-angDiff(v.yaw, ang));
      }
      this.audio.play('flesh', null, 0.5);
      this.flinch = Math.min(3, (this.flinch || 0) + hp / 25);
      if (group === 'head' && armored) this.audio.play('headshot', null, 0.5);
    } else if (v.bot && attacker && attacker.team !== v.team) {
      // sabe de onde veio o tiro
      v.bot.hear(attacker.pos, 'hit', attacker, this.time);
    }
    if (v.health <= 0) this.kill(v, attacker, d, group === 'head', wall);
  }

  kill(v, attacker, d, head, wall) {
    v.alive = false;
    v.health = 0;
    v.deaths++;
    v.deadTime = this.time;
    v.planting = v.defusing = 0;
    if (this.bomb.defuser === v) this.bomb.defuser = null;
    // larga a melhor arma e a bomba
    if (v.inv[0]) this.dropWeapon(v, 0, true);
    else if (v.inv[1] && this.mode === 'defuse') this.dropWeapon(v, 1, true);
    if (v.inv[4]) this.dropBomb(v);
    if (v.model) {
      v.model.userData.dieT = 0;
      v.model.userData.dieDir = Math.random() < 0.5 ? 1 : -1;
    }
    if (attacker && attacker !== v) {
      if (attacker.team !== v.team) {
        attacker.kills++;
        attacker.roundKills++;
        attacker.score += 2;
        if (this.mode === 'defuse') this.addMoney(attacker, d.kill ?? 300, `abate com ${d.name}`);
        if (this.mode === 'dm') this.score[attacker.squad]++;
      }
      // assistências
      for (const [o, dmg] of v.damageBy) {
        if (o !== attacker && o.team !== v.team && dmg >= 41) {
          o.assists++;
          o.score += 1;
        }
      }
    }
    this.hud.killfeed(attacker, v, d.name, head, wall, attacker?.isPlayer || v.isPlayer);
    if (v.isPlayer) {
      this.hud.message('Você morreu', attacker ? `Morto por ${attacker.name} (${d.name}${head ? ', na cabeça' : ''}) — ${attacker.health} HP restantes` : '', '#ff6655', 3, this.time);
      this.vm.visible = false;
      this.player.scope = 0;
    }
    if (this.mode !== 'defuse') v.respawnAt = this.time + (v.isPlayer ? 3 : 2.5);
  }

  // ------------------------------------------------------------ granadas
  throwGrenade(a, strong) {
    const w = a.weapon;
    if (!w || w.def.type !== 'grenade') return;
    const id = w.id;
    const idx = a.grenades.indexOf(id);
    if (idx < 0) return;
    a.grenades.splice(idx, 1);
    a.nextFire = this.time + 0.8;
    const eye = new THREE.Vector3(a.pos.x, a.pos.y + eyeHeight(a) - 0.1, a.pos.z);
    const pitch = a.pitch + (strong ? 8 : 15) * DEG * (1 - Math.abs(a.pitch) / 1.6);
    dirFromAngles(a.yaw, pitch, _dir);
    const speed = strong ? NADE_SPEED : NADE_SPEED * 0.42;
    const vel = _dir.clone().multiplyScalar(speed).addScaledVector(a.vel, 1.0);
    const mesh = buildGun(id);
    mesh.scale.setScalar(1.3);
    eye.addScaledVector(_dir, 0.4);
    mesh.position.copy(eye);
    this.scene.add(mesh);
    this.nades.push({ id, pos: eye, vel, owner: a, t: 0, mesh, still: 0 });
    this.audio.play('pin', a.isPlayer ? null : a.pos, 0.5);
    if (a.isPlayer) this.vm.throwAnim();
    // próxima arma
    setTimeout(() => {
      if (!a.alive) return;
      if (a.grenades.length && a.slot === 3) {
        a.nadeIdx = Math.min(a.nadeIdx, a.grenades.length - 1);
        a.drawEnd = this.time + 0.4;
      } else if (a.slot === 3) a.switchTo(a.bestSlot(), this.time);
      if (a.isPlayer) this.equipView(a);
    }, 450);
  }

  updateNades(dt) {
    for (let i = this.nades.length - 1; i >= 0; i--) {
      const n = this.nades[i];
      n.t += dt;
      const sub = 3;
      for (let s = 0; s < sub; s++) {
        const h = dt / sub;
        n.vel.y -= NADE_GRAV * h;
        const sp = n.vel.length();
        if (sp < 1e-3) continue;
        _dir.copy(n.vel).divideScalar(sp);
        const hit = this.map.raycast(n.pos, _dir, sp * h + 0.06);
        if (hit) {
          n.pos.copy(hit.point).addScaledVector(hit.normal, 0.07);
          const vn = n.vel.dot(hit.normal);
          n.vel.addScaledVector(hit.normal, -vn * 1.45); // restituição 0,45
          n.vel.multiplyScalar(0.75);
          if (Math.abs(vn) > 1.5) this.audio.play('bounce', n.pos, 0.5, rand(0.9, 1.1), 2);
          if (hit.normal.y > 0.7 && Math.abs(n.vel.y) < 1) {
            n.vel.y = 0;
            n.vel.multiplyScalar(Math.exp(-6 * h));
          }
        } else n.pos.addScaledVector(n.vel, h);
      }
      n.mesh.position.copy(n.pos);
      n.mesh.rotation.x += n.vel.length() * dt * 2;
      const still = n.vel.length() < 0.3;
      let boom = false;
      if (n.id === 'smoke') boom = (still && n.t > 0.6) || n.t > 6;
      else boom = n.t >= 1.6;
      if (boom) {
        this.detonate(n);
        this.scene.remove(n.mesh);
        this.nades.splice(i, 1);
      }
    }
  }

  detonate(n) {
    const p = n.pos;
    if (n.id === 'he') {
      this.fx.explosion(p, false);
      this.audio.play('he', p, 1, 1, 10);
      this.noise(p, 50, n.owner, 'boom');
      for (const a of this.actors) {
        if (!a.alive) continue;
        _v.copy(a.pos);
        _v.y += 1.0;
        const d = _v.distanceTo(p);
        if (d > 8.75) continue;
        if (!this.map.lineClear(p.clone().setY(p.y + 0.15), _v)) continue;
        const dmg = 98 * Math.pow(1 - d / 8.75, 1.4);
        if (dmg < 1) continue;
        if (a.team === n.owner.team && a !== n.owner) continue; // sem fogo amigo
        this.applyDamage(a, n.owner, dmg, 'chest', 0.5, WEAPONS.he, _v.clone().sub(p).normalize(), false);
        if (a.isPlayer) this.shake = 1;
      }
      const pl = this.player;
      if (pl.alive && pl.pos.distanceTo(p) < 10) this.audio.muffle(0.6, 1.5);
    } else if (n.id === 'flash') {
      this.fx.flashPop(p);
      this.audio.play('flashpop', p, 1, 1, 8);
      for (const a of this.actors) {
        if (!a.alive) continue;
        const eye = _v.set(a.pos.x, a.pos.y + eyeHeight(a), a.pos.z);
        const d = eye.distanceTo(p);
        if (d > 40) continue;
        if (!this.map.lineClear(p, eye)) continue;
        dirFromAngles(a.yaw, a.pitch, _dir);
        const to = _v2.subVectors(p, eye).normalize();
        const dot = _dir.dot(to);
        const angK = dot > 0.6 ? 1 : dot > 0 ? 0.65 : dot > -0.5 ? 0.35 : 0.2;
        const distK = clamp(1 - (d - 4) / 36, 0.25, 1);
        const dur = 4.8 * angK * distK;
        if (dur < 0.4) continue;
        if (this.time + dur > a.flashUntil) {
          a.flashUntil = this.time + dur;
          a.flashDur = dur;
        }
        if (a.isPlayer) {
          this.audio.play('ring', null, 0.6 * angK);
          this.audio.muffle(0.85 * angK, dur);
        }
      }
    } else if (n.id === 'smoke') {
      this.fx.smoke(p);
      this.audio.play('smokehiss', p, 0.8, 1, 5);
    }
  }

  // ------------------------------------------------------------ bomba
  updateBomb(dt) {
    const b = this.bomb;
    if (this.mode !== 'defuse') return;
    if (b.state === 'carried' && b.carrier && b.carrier.alive) b.pos.copy(b.carrier.pos);
    if (b.state === 'dropped') {
      for (const a of this.actors) {
        if (a.alive && a.team === 'CT' && !b.seenByCT) {
          _v.set(a.pos.x, a.pos.y + eyeHeight(a), a.pos.z);
          if (_v.distanceTo(b.pos) < 30 && this.map.lineClear(_v, _v2.copy(b.pos).setY(b.pos.y + 0.2))) b.seenByCT = true;
        }
      }
    }
    if (b.state !== 'planted') return;
    const left = b.plantedAt + BOMB_TIME - this.time;
    // bipes acelerando
    b.beepT -= dt;
    if (b.beepT <= 0 && left > 0) {
      const k = clamp(left / BOMB_TIME, 0, 1);
      b.beepT = 0.12 + k * 0.9;
      this.audio.play('beep', b.pos, 0.9, 1, 6);
      if (b.mesh?.userData.led) b.mesh.userData.led.material.color.setHex(0xff0000);
      setTimeout(() => b.mesh?.userData.led?.material.color.setHex(0x400000), 90);
    }
    if (left <= 0 && this.phase !== 'over') {
      b.state = 'exploded';
      this.fx.explosion(b.pos.clone().setY(1), true);
      this.audio.play('explode', b.pos, 1.5, 1, 30);
      for (const a of this.actors) {
        if (!a.alive) continue;
        const d = a.pos.distanceTo(b.pos);
        const dmg = 500 * Math.exp(-(d * d) / (2 * 14.6 * 14.6));
        if (dmg >= 1) this.applyDamage(a, null, dmg, 'chest', 0.5, { name: 'Bomba', type: 'bomb', kill: 0 }, null, false);
        if (a.isPlayer) this.shake = 1.5;
      }
      if (this.player.pos.distanceTo(b.pos) < 40) this.audio.muffle(0.9, 3);
      if (this.phase !== 'end') this.endRound('T', 'bomb');
      if (b.mesh) this.scene.remove(b.mesh);
      b.mesh = null;
    }
  }

  // Plantar (T com a bomba) e desarmar (CT perto da bomba) segurando "usar".
  processUse(a, dt) {
    const b = this.bomb;
    if (this.mode !== 'defuse') return;
    const speed = Math.hypot(a.vel.x, a.vel.z);
    if (a.team === 'T' && a.hasBomb && b.state === 'carried') {
      const site = this.map.siteAt(a.pos);
      if (a.wantUse && site && a.onGround && (this.phase === 'live') && (speed < 1.2 || a.planting > 0)) {
        if (!a.planting) {
          a.prePlantSlot = a.slot;
          a.slot = 4;
          if (a.isPlayer) this.vm.equip('c4', 'bomb', 0.2);
        }
        a.planting += dt;
        a.crouch = true;
        if (Math.floor((a.planting - dt) * 3) !== Math.floor(a.planting * 3)) this.audio.play('plantbeep', a.isPlayer ? null : a.pos, 0.6, 1, 3);
        if (a.planting >= PLANT_TIME) this.plantBomb(a, site);
      } else if (a.planting) {
        a.planting = 0;
        if (a.slot === 4) a.slot = a.prePlantSlot ?? a.bestSlot();
        if (a.isPlayer) this.equipView(a, true);
      }
    } else if (a.team === 'CT' && b.state === 'planted') {
      const near = a.pos.distanceTo(b.pos) < 1.6;
      if (a.wantUse && near && a.onGround && (!b.defuser || b.defuser === a)) {
        if (!a.defusing) {
          this.audio.play('click', b.pos, 0.6);
          if (!a.isPlayer && Math.random() < 0.6) this.radio(a, pick(RADIO.defusing));
          this.noise(b.pos, 18, a, 'defuse');
        }
        b.defuser = a;
        a.defusing += dt;
        if (a.isPlayer) this.vm.visible = false;
        const dur = a.kit ? 5 : 10;
        if (a.defusing >= dur && b.plantedAt + BOMB_TIME > this.time) {
          b.state = 'defused';
          b.defuser = a;
          a.score += 2;
          this.addMoney(a, 300, 'desarme da bomba');
          this.audio.play('buy', b.pos, 0.6, 0.7);
          if (b.mesh) b.mesh.userData.led.material.color.setHex(0x003300);
          this.endRound('CT', 'defuse');
          a.defusing = 0;
        }
      } else if (a.defusing) {
        a.defusing = 0;
        if (b.defuser === a) b.defuser = null;
        if (a.isPlayer) this.vm.visible = true;
      }
    }
  }

  plantBomb(a, site) {
    const b = this.bomb;
    a.planting = 0;
    a.inv[4] = null;
    a.slot = a.prePlantSlot ?? a.bestSlot();
    if (a.slot === 4) a.slot = a.bestSlot();
    if (a.isPlayer) this.equipView(a, true);
    b.state = 'planted';
    b.site = site;
    b.planter = a;
    b.carrier = null;
    b.plantedAt = this.time;
    b.pos.copy(a.pos);
    b.mesh = buildGun('c4');
    b.mesh.position.copy(a.pos);
    b.mesh.rotation.y = a.yaw;
    this.scene.add(b.mesh);
    b.beepT = 0;
    this.plantedThisRound = true;
    a.score += 2;
    this.addMoney(a, 300, 'bomba plantada');
    this.hud.message('A bomba foi plantada', `Bombsite ${site} · 40 segundos`, '#ff6655', 3, this.time);
    this.audio.play('beep', b.pos, 1, 0.8, 8);
    if (!a.isPlayer) this.radio(a, pick(RADIO.plant));
    this.noise(b.pos, 999, a, 'plant');
  }

  // ------------------------------------------------------------ comunicação
  noise(pos, radius, src, kind) {
    for (const b of this.bots) {
      if (!b.a.alive) continue;
      if (b.a.pos.distanceTo(pos) < radius) b.hear(pos, kind, src, this.time);
    }
  }

  reportEnemy(a, enemy) {
    enemy.spottedAt = this.time;
    const site = this.map.siteAt(enemy.pos) || (this.map.calloutAt(enemy.pos) === 'Meio' ? 'mid' : null);
    const prev = this.intel[a.team];
    if (site) this.intel[a.team] = { site, t: this.time, pos: enemy.pos.clone() };
    if ((!prev || this.time - prev.t > 10) && this.time > this.radioCooldown && a.team === this.player.team && !a.isPlayer) {
      const place = this.map.calloutAt(enemy.pos);
      this.radio(a, `${pick(RADIO.spotted)}${place ? ' ' + place : ''}`);
    }
  }

  radio(a, text) {
    if (a.team !== this.player.team) return;
    this.radioCooldown = this.time + 4;
    this.hud.radio(a, text);
  }

  // ------------------------------------------------------------ quadro
  update(dt) {
    this.time += dt;
    const time = this.time;
    if (!this.running) return;
    if (this.mode === 'defuse') {
      if (this.phase === 'freeze' && time >= this.roundStart) {
        this.phase = 'live';
        this.audio.play('beep', null, 0.3, 0.6);
      }
    }

    if (this.pendingRadio && time >= this.pendingRadio.at) {
      const r = this.pendingRadio;
      this.pendingRadio = null;
      if (r.a.alive) this.radio(r.a, r.text);
    }
    for (const b of this.bots) b.update(dt, time);

    for (const a of this.actors) this.processActor(a, dt, time);

    // empurrão entre jogadores
    const al = this.actors.filter((a) => a.alive);
    for (let i = 0; i < al.length; i++) {
      for (let j = i + 1; j < al.length; j++) {
        const a = al[i];
        const b = al[j];
        const dx = b.pos.x - a.pos.x;
        const dz = b.pos.z - a.pos.z;
        const d2 = dx * dx + dz * dz;
        const min = PHYS.radius * 2;
        if (d2 < min * min && Math.abs(a.pos.y - b.pos.y) < 1.6) {
          const d = Math.sqrt(d2) || 0.01;
          const push = (min - d) / 2;
          const nx = dx / d;
          const nz = dz / d;
          a.pos.x -= nx * push;
          a.pos.z -= nz * push;
          b.pos.x += nx * push;
          b.pos.z += nz * push;
          pushOut(this.map, a);
          pushOut(this.map, b);
        }
      }
    }

    this.updateItems(dt);
    this.updateNades(dt);
    this.updateBomb(dt);
    this.updateRound(time);
    this.fx.update(dt);

    for (const a of this.actors) this.updateModel(a, dt);
  }

  processActor(a, dt, time) {
    if (!a.alive) {
      if (a.respawnAt && time >= a.respawnAt && this.mode !== 'defuse' && this.phase !== 'over') {
        a.respawnAt = 0;
        this.respawnAnywhere(a);
        if (a.bot) this.giveRandomLoadout(a);
        else {
          a.inv[0] = a.lastPrimary ? makeWeapon(a.lastPrimary) : null;
          a.slot = a.bestSlot();
          this.vm.visible = true;
          this.equipView(a, true);
        }
      }
      return;
    }
    a.update(dt, time);
    const frozen = this.phase === 'freeze';
    let speed = frozen ? 0 : Math.min(a.wishSpeed ?? a.maxSpeed(time), a.maxSpeed(time));
    if (a.planting || a.defusing) speed = 0;
    applyMovement(a, frozen ? 0 : a.wishX || 0, frozen ? 0 : a.wishZ || 0, speed, !frozen && a.wantJump && !a.planting && !a.defusing, dt);
    moveActor(this.map, a, dt);
    // limites do mapa (segurança)
    if (a.pos.y < -5 || !isFinite(a.pos.x)) a.pos.copy(this.map.spawnPoints(a.team)[0]);

    if (a.rescopeAt && time >= a.rescopeAt) {
      a.rescopeAt = 0;
      if (a.weapon?.def.type === 'sniper' && !a.reloadEnd) a.scope = a.rescope;
    }
    if (a.wantReload) this.reload(a, time);
    if (a.wantFire && !a.planting && !a.defusing) this.tryFire(a, time, false);
    else if (a.wantAlt && !a.planting && !a.defusing) {
      const t = a.weapon?.def.type;
      if (t === 'knife' || t === 'grenade') this.tryFire(a, time, true);
    }
    a.triggerHeld = !!(a.wantFire || a.wantAlt);
    // com a C4 em mãos, o botão de tiro também planta
    if (a.weapon?.def.type === 'bomb' && a.wantFire) a.wantUse = true;
    this.processUse(a, dt);

    // passos (correndo faz barulho; andando com Shift ou agachado é silencioso)
    const sp = Math.hypot(a.vel.x, a.vel.z);
    if (a.onGround && sp > 3.1) {
      a.stepT -= dt * (sp / 5.4);
      if (a.stepT <= 0) {
        a.stepT = 0.38;
        this.audio.play('step', a.isPlayer ? null : a.pos, a.isPlayer ? 0.25 : 0.8, rand(0.85, 1.15), 2.5);
        this.noise(a.pos, 16, a, 'step');
      }
    }
    for (const e of a.events) {
      if (e === 'land') {
        this.audio.play('land', a.isPlayer ? null : a.pos, a.isPlayer ? 0.4 : 0.8, 1, 3);
        if (a.isPlayer) this.vm.landed(0.6);
      } else if (e === 'jump') {
        this.audio.play('step', a.isPlayer ? null : a.pos, 0.3, 0.8, 2);
      } else if (e === 'shell') this.audio.play('magin', a.isPlayer ? null : a.pos, 0.5, 1.4);
    }
    a.events.length = 0;
    if (a.isPlayer && a.weapon?.def.type !== 'sniper') a.scope = 0;
    if (a.inv[0]) a.lastPrimary = a.inv[0].id;
  }

  updateRound(time) {
    if (this.mode === 'dm') {
      if (time >= this.dmEnd && this.phase !== 'over') {
        this.phase = 'end';
        this.matchOver = true;
        this.endAt = time;
      }
    }
    if (this.mode === 'defuse' && this.phase === 'live') {
      const aliveT = this.actors.some((a) => a.alive && a.team === 'T');
      const aliveCT = this.actors.some((a) => a.alive && a.team === 'CT');
      const planted = this.bomb.state === 'planted';
      if (!aliveCT) this.endRound('T', 'elim');
      else if (!aliveT && !planted) this.endRound('CT', 'elim');
      else if (!planted && time >= this.roundStart + ROUND_TIME) this.endRound('CT', 'time');
    }
    if (this.phase === 'end') {
      this.endTimeLeft = this.endAt - time;
      // a bomba ainda pode explodir depois do fim por eliminação dos T
      if (time >= this.endAt) {
        if (this.matchOver) return this.finishMatch();
        if (this.roundNum === this.match.half && !this.halfDone) this.halftime();
        this.startRound();
      }
    }
  }

  updateModel(a, dt) {
    const m = a.model;
    if (!m) return;
    if (!a.alive) {
      const u = m.userData;
      if (u.dieT !== undefined && u.dieT < 1) {
        u.dieT = Math.min(1, u.dieT + dt * 2.5);
        const k = u.dieT * u.dieT;
        // cai para trás ou para a frente, no sentido em que estava olhando
        m.rotation.order = 'YXZ';
        m.rotation.set((Math.PI / 2) * 0.97 * k * u.dieDir, a.yaw, 0);
        u.body.rotation.y = 0;
        u.neck.rotation.x = 0;
        m.position.y = a.pos.y + 0.12 * k;
      }
      return;
    }
    m.rotation.order = 'XYZ';
    m.rotation.set(0, 0, 0);
    poseCharacter(m, a, dt);
    const w = a.weapon;
    setCharacterGun(m, w ? w.id : null);
  }

  // ------------------------------------------------------------ render
  render() {
    const r = this.renderer;
    r.autoClear = true;
    r.render(this.scene, this.camera);
    r.autoClear = false;
    // FOV da arma fixo, independente do FOV do mundo
    this.vm.render(r, 64, this.camera.aspect);
  }
}

export { MATCH };
