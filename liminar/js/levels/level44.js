// Nível 44 — "Os Corredores Desfeitos": corredores vazios de loja, piso de
// lajotas bege, paredes creme e luzes que funcionam pela metade. Sem
// entidades. O problema é o tempo: depois de uns 10 minutos o nível começa a
// se desfazer — o teto cai aos pedaços, a imagem falha, a vista embaça e
// aparecem vultos que não estão lá.
// Saída: uma porta de madeira. Existem três; duas são réplicas com "falhas"
// (piscam, tremem, mudam de cor) e levam ao Vazio — escuridão total, onde o
// andarilho acorda e se vê de fora. Uma luz ao longe traz de volta ao início.
import * as THREE from 'three';
import { GridLevel, W, EH } from './grid.js';
import { getTex, indoorEnvTex } from '../textures.js';
import { panelMaterial } from '../materials.js';
import { clamp, damp, fbm, hash3, mulberry32, smoothstep, TAU } from '../util.js';
import { NPC } from './level0_1_npc.js';
import './level37_tex.js';

const mod = (a, n) => ((a % n) + n) % n;
const DECAY = 600; // segundos até o nível começar a se desfazer
const VOID = { x: 60000, z: 0 };

function woodTex() {
  const w = 128;
  const h = 256;
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const c = cv.getContext('2d');
  const rnd = mulberry32(4401);
  for (let x = 0; x < w; x += 32) {
    const k = 0.8 + rnd() * 0.25;
    c.fillStyle = `rgb(${Math.round(120 * k)},${Math.round(74 * k)},${Math.round(40 * k)})`;
    c.fillRect(x, 0, 32, h);
    c.strokeStyle = 'rgba(40,20,8,0.35)';
    for (let k2 = 0; k2 < 6; k2++) {
      c.beginPath();
      c.moveTo(x + 4 + rnd() * 24, 0);
      c.bezierCurveTo(x + rnd() * 32, h / 3, x + rnd() * 32, (2 * h) / 3, x + 4 + rnd() * 24, h);
      c.stroke();
    }
    c.fillStyle = 'rgba(20,10,4,0.7)';
    c.fillRect(x, 0, 2, h);
  }
  c.strokeStyle = 'rgba(30,15,6,0.6)';
  c.lineWidth = 4;
  c.strokeRect(16, 18, w - 32, h * 0.38);
  c.strokeRect(16, h * 0.5, w - 32, h * 0.42);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const DOOR_VERT = /* glsl */ `
  uniform float uTime;
  uniform float uGlitch;
  uniform float uSeed;
  varying vec2 vUv;
  float h(float n) { return fract(sin(n) * 43758.5453); }
  void main() {
    vUv = uv;
    vec3 p = position;
    float tick = floor(uTime * 3.0 + uSeed);
    float burst = step(0.78, h(tick * 1.7 + uSeed)) * uGlitch;
    p.x += (h(floor(p.y * 9.0) + floor(uTime * 24.0)) - 0.5) * 0.12 * burst;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }`;
const DOOR_FRAG = /* glsl */ `
  uniform sampler2D map;
  uniform float uTime;
  uniform float uGlitch;
  uniform float uSeed;
  uniform float uK;
  varying vec2 vUv;
  float h(float n) { return fract(sin(n) * 43758.5453); }
  void main() {
    vec2 uv = vUv;
    float tick = floor(uTime * 3.0 + uSeed);
    float burst = step(0.78, h(tick * 1.7 + uSeed)) * uGlitch;
    float row = floor(uv.y * 30.0);
    float fr = floor(uTime * 20.0);
    uv.x += (h(row + fr) - 0.5) * 0.25 * burst * step(0.5, h(row * 3.1 + fr));
    vec3 c = vec3(texture2D(map, uv + vec2(0.02 * burst, 0.0)).r, texture2D(map, uv).g, texture2D(map, uv - vec2(0.02 * burst, 0.0)).b);
    // blocos pretos e cores trocadas por um instante
    float blk = step(0.86, h(floor(uv.x * 6.0) * 7.0 + floor(uv.y * 12.0) * 13.0 + fr)) * burst;
    c = mix(c, vec3(0.0), blk);
    c = mix(c, c.bgr * vec3(0.6, 1.4, 1.6), burst * step(0.6, h(fr + 3.0)));
    // falha fraca constante: uma linha clara passando
    float scan = smoothstep(0.012, 0.0, abs(fract(uv.y - uTime * 0.15 + uSeed) - 0.5)) * uGlitch * 0.25;
    gl_FragColor = vec4(c * uK + scan, 1.0);
  }`;

export class Level44 extends GridLevel {
  constructor(game) {
    super(game, {
      cell: 3,
      H: 3,
      T: 0.18,
      doorW: 1.3,
      doorH: 2.3,
      chunkCells: 8,
      seed: (game.seed ^ 0x4444) >>> 0,
      lightRadius: 9,
      lightEmitPow: 1,
      bounce: 0.5,
      ambient: 0.018,
      wallUV: [1.5, 3],
      floorUV: 1.5,
      ceilUV: 1.2,
    });
    this.num = 44;
    this.surface = 'tile';
    this.panelI = 7;
    this.flickerGap = 8;
    this.deadChance = 0.08;
    const S = this.Q.tex;
    const dw = getTex('drywall', S);
    const tl = getTex('l37Tile', S);
    const ce = getTex('ceiling', S);
    const pn = getTex('panel', S);
    const gr = getTex('grime', S);
    const env = game.makeEnv(indoorEnvTex(['#6b6248', '#4a4430', '#2a2618'], '#fff4d0'));
    this.mats = {
      floor: { map: tl.map, normalMap: tl.normalMap, roughness: 0.45, color: 0xe2d6b8, dirtColor: new THREE.Color(0.6, 0.55, 0.42), dirtAmt: 0.5, wet: 0.2, envMap: env, envIntensity: 0.6 },
      wall: { map: dw.map, normalMap: dw.normalMap, roughness: 0.85, vertexColors: true, color: 0xeee0b8, envMap: env, envIntensity: 0.15 },
      ceil: { map: ce.map, normalMap: ce.normalMap, roughness: 0.95, lmIntensity: 0.4, vertexColors: true },
      prop: { map: gr.map, normalMap: gr.normalMap, vertexColors: true, roughness: 0.6, envMap: env, envIntensity: 0.4 },
    };
    this.panelMat = panelMaterial(pn.map, 0xfff4dc);
    this.look = {
      exposure: 1.02,
      tint: [1.04, 1.0, 0.9],
      sat: 0.9,
      contrast: 1.05,
      lift: [0.02, 0.018, 0.01],
      bloom: 0.18,
      fog: [0.3, 0.27, 0.18],
      fogNear: 0.35,
      lightColor: [1.0, 0.95, 0.8],
      flashlight: false,
      ambience: 'level44',
      reverb: 2.4,
      sanityDrain: 0.1,
    };
    this.objectives = [{ id: 'porta', text: 'Encontre a porta de madeira verdadeira (sem falhas)' }];
    this.age = 0;
    this.blur = 0;
    this.told = {};
    this.tiles = [];
    this.route();
  }

  // ------------------------------------------------------------ planta
  corridor(ix, iz) {
    if (mod(iz, 5) === 0 && hash3(Math.floor(ix / 9), iz, this.seed + 1) < 0.88) return true;
    if (mod(ix, 6) === 0 && hash3(ix, Math.floor(iz / 7), this.seed + 2) < 0.82) return true;
    return hash3(Math.floor(ix / 2), Math.floor(iz / 2), this.seed + 3) < 0.08;
  }

  genEdge(kind, ix, iz) {
    const a = this.corridor(ix, iz);
    const b = kind === EH ? this.corridor(ix, iz - 1) : this.corridor(ix - 1, iz);
    if (a && b) return hash3(ix * 3 + kind, iz, this.seed + 9) < 0.03 ? W.DOOR : W.NONE;
    if (a || b) return hash3(ix * 2 + kind, iz, this.seed + 11) < 0.05 ? W.DOOR : W.FULL;
    return W.NONE;
  }

  genLight(cx, cz) {
    if (!this.corridor(cx, cz) || mod(cx + cz, 2)) return null;
    const h = this.hashCell(cx, cz, 3);
    const dim = fbm(cx * 0.07 + 11, cz * 0.07, 2, this.seed + 1) < -0.2;
    let group = 0;
    if (dim) group = h < 0.7 ? 3 : 1;
    else if (h < 0.2) group = 3;
    else if (h < 0.3) group = 1;
    else if (h < 0.38) group = 2;
    return { x: cx * 3 + 1.5, z: cz * 3 + 1.5, y: this.H - 0.02, ax: (cz & 1) ? 1 : 0, len: 1.2, wid: 0.5, I: 8, group };
  }

  dirt(x, z) {
    const n = fbm(x * 0.14, z * 0.14, 3, this.seed + 11);
    return clamp((n - 0.05) / 0.35, 0, 1);
  }

  genProps(ch, cx0, cz0) {
    const N = this.chunkCells;
    for (let z = cz0; z < cz0 + N; z++)
      for (let x = cx0; x < cx0 + N; x++) {
        if (!this.corridor(x, z) || Math.abs(x) + Math.abs(z) < 3) continue;
        const h = this.hashCell(x, z, 21);
        if (h > 0.992) ch.items.push({ type: 'water', key: `44:${x}:${z}:w`, x: x * 3 + 1.5, z: z * 3 + 1.2 });
        else if (h > 0.982) ch.items.push({ type: 'note', key: `44:${x}:${z}:n`, x: x * 3 + 1.2, z: z * 3 + 1.6, rot: h * 30 });
      }
  }

  // Três portas de madeira longe do início; só uma é de verdade.
  route() {
    const rnd = mulberry32(this.seed * 7 + 1);
    const c = this.cell;
    const hT = this.T / 2;
    this.clearCell(0, 0);
    const a0 = rnd() * TAU;
    const real = Math.floor(rnd() * 3);
    this.doors = [];
    for (let k = 0; k < 3; k++) {
      const a = a0 + (k * TAU) / 3 + (rnd() - 0.5) * 0.5;
      const d = 20 + Math.floor(rnd() * 7);
      const ex = Math.round(Math.cos(a) * d);
      let ez = Math.round(Math.sin(a) * d);
      // encaixa num corredor (as linhas de z múltiplo de 5)
      ez = Math.round(ez / 5) * 5;
      this.clearCell(ex, ez);
      this.carve(0, 0, ex, ez, rnd);
      // porta na parede norte da célula
      this.setEdge(EH, ex, ez, W.EXIT);
      this.doors.push({ x: ex * c + c / 2, z: ez * c + hT + 0.01, real: k === real, seed: rnd() * 10 });
    }
    this.spawn = { x: c / 2, z: c / 2, yaw: Math.PI };
    this.exit = this.doors.find((d) => d.real);
    this.makeDoors();
  }

  makeDoors() {
    this.woodTex = woodTex();
    this.doorMats = [];
    this.doorGroups = [];
    const frameMat = new THREE.MeshBasicMaterial({ color: 0x3a2412 });
    this.doorMats.push(frameMat);
    for (const d of this.doors) {
      const g = new THREE.Group();
      const mat = new THREE.ShaderMaterial({
        uniforms: { map: { value: this.woodTex }, uTime: { value: 0 }, uGlitch: { value: d.real ? 0 : 1 }, uSeed: { value: d.seed }, uK: { value: 0.8 } },
        vertexShader: DOOR_VERT,
        fragmentShader: DOOR_FRAG,
      });
      d.mat = mat;
      this.doorMats.push(mat);
      const slab = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 2.1, 1, 24), mat);
      slab.position.set(0, 1.05, 0.03);
      g.add(slab);
      for (const s of [-1, 1]) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(0.09, 2.2, 0.08), frameMat);
        b.position.set(s * 0.545, 1.1, 0.04);
        g.add(b);
      }
      const top = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.09, 0.08), frameMat);
      top.position.set(0, 2.2, 0.04);
      g.add(top);
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), new THREE.MeshBasicMaterial({ color: 0xb08a3a }));
      knob.position.set(0.36, 1.0, 0.08);
      g.add(knob);
      this.doorMats.push(knob.material);
      g.position.set(d.x, 0, d.z);
      this.dynamic.add(g);
      this.doorGroups.push(g);
    }
  }

  onChunkBuilt() {
    for (const d of this.doors) {
      if (d.lit || !this.chunkAt(d.x, d.z + 0.6)) continue;
      d.lit = true;
      d.mat.uniforms.uK.value = clamp(this.lightLevel(d.x, d.z + 0.6) * 0.8 + 0.15, 0.15, 1.3);
    }
  }

  ambientAt() {
    return (this._amb = this._amb || new THREE.Vector3(0.45, 0.45, 0.45));
  }

  // ------------------------------------------------------------ quadro
  update(dt, player) {
    if (this.inVoid) {
      this.voidUpdate(dt, player);
      return;
    }
    // o nível decai com o tempo
    this.age += dt;
    const k = clamp((this.age - DECAY) / 240, 0, 1);
    this.flickerGap = 8 - 6.5 * k;
    this.deadChance = 0.08 + 0.4 * k;
    super.update(dt, player);
    const g = this.game;
    this.time = (this.time || 0) + dt;
    for (const d of this.doors) d.mat.uniforms.uTime.value = this.time;
    if (this.age > 300 && !this.told.t300) {
      this.told.t300 = true;
      g.hud.message('Você está aqui há tempo demais. As luzes zumbem de um jeito diferente.', 5);
    }
    if (this.age > 540 && !this.told.t540) {
      this.told.t540 = true;
      g.hud.message('O teto range. Algo no nível está se soltando. Saia logo.', 5);
      g.audio.play('creak', { gain: 0.4, rate: 0.5, wet: 1.2 });
    }
    if (this.age > DECAY && !this.told.t600) {
      this.told.t600 = true;
      g.hud.message('O nível começou a se desfazer. A vista embaça, o teto cai, a imagem falha.', 6);
      g.glitch = 1;
      g.audio.play('tvstatic', { gain: 0.3 });
    }
    this.blur = k > 0 ? (0.25 + 0.75 * k) * (0.75 + 0.25 * Math.sin(this.time * 0.9)) : 0;
    this.sanityExtra = k * 0.75;
    if (k > 0) {
      if (Math.random() < dt * (0.12 + 0.5 * k)) {
        g.glitch = Math.max(g.glitch, 0.35 + 0.5 * k);
        g.audio.play('tvstatic', { gain: 0.06 + 0.1 * k, rate: 0.8 + Math.random() * 0.4 });
      }
      if (k > 0.3 && Math.random() < dt * 0.2) g.power = 0.4 + Math.random() * 0.4;
      else g.power = damp(g.power, 1, 3, dt);
      this.fallT = (this.fallT || 3) - dt;
      if (this.fallT <= 0) {
        this.fallT = 7 - 5 * k + Math.random() * 2;
        this.dropTile(player);
      }
      this.hallucinate(dt, player, k);
    }
    this.updateTiles(dt, player);
  }

  // Um pedaço do forro despenca perto do andarilho.
  dropTile(player) {
    const c = this.cell;
    const fx = -Math.sin(player.yaw);
    const fz = -Math.cos(player.yaw);
    const d = 1 + Math.random() * 4;
    let x = player.pos.x + fx * d + (Math.random() - 0.5) * 2;
    let z = player.pos.z + fz * d + (Math.random() - 0.5) * 2;
    const cx = Math.floor(x / c);
    const cz = Math.floor(z / c);
    if (!this.corridor(cx, cz)) {
      x = player.pos.x;
      z = player.pos.z + (Math.random() - 0.5);
    }
    if (!this.tileGeo) {
      this.tileGeo = new THREE.BoxGeometry(1.2, 0.03, 0.6);
      this.tileMat = new THREE.MeshLambertMaterial({ color: 0xc8c0a8, emissive: 0x2a2820 });
      this.holeGeo = new THREE.PlaneGeometry(1.2, 0.6);
      this.holeMat = new THREE.MeshBasicMaterial({ color: 0x050403 });
    }
    let t = this.tiles.length >= 50 ? this.tiles.shift() : null;
    if (!t) {
      t = { m: new THREE.Mesh(this.tileGeo, this.tileMat), hole: new THREE.Mesh(this.holeGeo, this.holeMat) };
      t.hole.rotation.x = Math.PI / 2;
      this.dynamic.add(t.m, t.hole);
    }
    t.x = x;
    t.z = z;
    t.y = this.H - 0.05;
    t.vy = 0;
    t.rx = (Math.random() - 0.5) * 3;
    t.rz = (Math.random() - 0.5) * 3;
    t.ry = Math.random() * TAU;
    t.landed = false;
    t.m.position.set(x, t.y, z);
    t.m.rotation.set(0, t.ry, 0);
    t.hole.position.set(x, this.H - 0.012, z);
    t.hole.rotation.z = t.ry;
    this.tiles.push(t);
    this.game.audio.play('creak', { gain: 0.25, rate: 1.4 + Math.random() * 0.4 });
  }

  updateTiles(dt, player) {
    const g = this.game;
    for (const t of this.tiles) {
      if (t.landed) continue;
      t.vy -= 9.8 * dt;
      t.y += t.vy * dt;
      t.m.rotation.x += t.rx * dt;
      t.m.rotation.z += t.rz * dt;
      if (t.y <= 0.02) {
        t.y = 0.02;
        t.landed = true;
        t.m.rotation.set(0, t.ry, 0);
        g.audio.play('knock', { gain: 0.4, rate: 0.7 + Math.random() * 0.3, wet: 0.8 });
        if (Math.hypot(player.pos.x - t.x, player.pos.z - t.z) < 0.8) {
          g.damage = 1;
          g.addSanity(-6);
          g.vibrate(120);
          g.hud.message('Um pedaço do teto caiu em você!', 3);
        }
      }
      t.m.position.y = t.y;
    }
  }

  // Vultos no fim do corredor que somem quando encarados.
  hallucinate(dt, player, k) {
    if (!this.fig) {
      const fm = new THREE.MeshBasicMaterial({ color: 0x0a0806, transparent: true, opacity: 0 });
      const fig = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 1.1, 4, 8), fm);
      body.position.y = 0.95;
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), fm);
      head.position.y = 1.78;
      fig.add(body, head);
      fig.visible = false;
      this.dynamic.add(fig);
      this.fig = fig;
      this.figMat = fm;
    }
    const g = this.game;
    const P = player.pos;
    if (this.fig.visible) {
      this.figT -= dt;
      this.figMat.opacity = Math.min(0.9, this.figMat.opacity + dt * 2);
      this.fig.lookAt(P.x, 0, P.z);
      const dx = this.fig.position.x - P.x;
      const dz = this.fig.position.z - P.z;
      const d = Math.hypot(dx, dz);
      const f = (-dx * Math.sin(player.yaw) - dz * Math.cos(player.yaw)) / Math.max(d, 0.01);
      if (f > 0.95 && !this.figSeen) {
        this.figSeen = true;
        this.figT = Math.min(this.figT, 0.3);
        g.audio.sting();
        g.addSanity(-3);
      }
      if (this.figT <= 0) {
        this.fig.visible = false;
        this.figMat.opacity = 0;
      }
      return;
    }
    if (Math.random() > dt * (0.05 + 0.15 * k)) return;
    const fx = -Math.sin(player.yaw);
    const fz = -Math.cos(player.yaw);
    for (let d = 16; d >= 7; d--) {
      const x = P.x + fx * d;
      const z = P.z + fz * d;
      if (!this.los(P.x, P.z, x, z)) continue;
      this.fig.position.set(x, 0, z);
      this.fig.visible = true;
      this.figT = 1.5;
      this.figSeen = false;
      g.audio.play('whisper', { gain: 0.2, rate: 0.8, wet: 1.4 });
      break;
    }
  }

  // ------------------------------------------------------------ portas
  interactable(player) {
    if (this.inVoid) {
      if (this.cine) return null;
      const L = this.voidLight;
      if (Math.hypot(player.pos.x - L.x, player.pos.z - L.z) < 1.8) return { label: 'Atravessar a luz', action: () => this.leaveVoid() };
      return null;
    }
    const p = player.pos;
    for (const d of this.doors) {
      const dx = p.x - d.x;
      const dz = p.z - d.z;
      if (Math.abs(dx) < 0.8 && dz > 0 && dz < 1.5)
        return {
          label: 'Abrir a porta de madeira',
          action: () => {
            if (d.real) {
              this.game.completeObjective('porta', 'A porta abre sem falhar. Do outro lado, ar frio e cheiro de terra.');
              this.blur = 0;
              this.game.reachExit('door', 0.8);
            } else this.enterVoid();
          },
        };
    }
    return null;
  }

  navTarget() {
    if (this.inVoid) return this.voidLight;
    // aponta para a porta mais próxima — sem dizer qual é a verdadeira
    const p = this.game.player.pos;
    let best = this.doors[0];
    for (const d of this.doors) if (Math.hypot(d.x - p.x, d.z - p.z) < Math.hypot(best.x - p.x, best.z - p.z)) best = d;
    return best;
  }

  // ------------------------------------------------------------ o Vazio
  async enterVoid() {
    const g = this.game;
    if (this.moving) return;
    this.moving = true;
    g.player.frozen = true;
    g.audio.door();
    g.glitch = 1;
    g.audio.play('tvstatic', { gain: 0.4 });
    g.fadeTarget = 1;
    await new Promise((r) => setTimeout(r, 1100));
    if (g.level !== this) return;
    this.inVoid = true;
    this.blur = 0;
    this.sanityExtra = 0.5;
    const sc = this.scene;
    this.saved = { fog: sc.fog, bg: sc.background };
    sc.fog = new THREE.Fog(0x000000, 6, 60);
    sc.background = new THREE.Color(0, 0, 0);
    if (!this.voidGroup) this.buildVoid();
    this.voidGroup.visible = true;
    g.player.pos.set(VOID.x, 0, VOID.z);
    g.player.yaw = Math.PI;
    g.player.vel.set(0, 0, 0);
    g.power = 1;
    this.startCine();
    g.fadeTarget = 0;
    this.moving = false;
  }

  buildVoid() {
    const grp = new THREE.Group();
    this.voidGroup = grp;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.012, 0.012, 0.014) }));
    floor.rotation.x = -Math.PI / 2;
    grp.add(floor);
    this.voidFloor = floor;
    // a luz ao longe e uma porta de madeira comum embaixo dela
    this.voidLight = { x: VOID.x + 6, z: VOID.z + 42 };
    const cv = document.createElement('canvas');
    cv.width = 32;
    cv.height = 128;
    const c = cv.getContext('2d');
    const gr = c.createLinearGradient(0, 0, 32, 0);
    gr.addColorStop(0, 'rgba(255,255,255,0)');
    gr.addColorStop(0.5, 'rgba(255,255,255,1)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = gr;
    c.fillRect(0, 0, 32, 128);
    this.beamTex = new THREE.CanvasTexture(cv);
    const beam = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 40), new THREE.MeshBasicMaterial({ map: this.beamTex, color: new THREE.Color(1.6, 1.55, 1.4), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide }));
    beam.position.set(this.voidLight.x, 20, this.voidLight.z);
    grp.add(beam);
    this.beam = beam;
    const door = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 2.1), new THREE.MeshBasicMaterial({ map: this.woodTex, color: new THREE.Color(0.9, 0.85, 0.75), fog: false }));
    door.position.set(this.voidLight.x, 1.05, this.voidLight.z + 0.5);
    door.rotation.y = Math.PI;
    grp.add(door);
    const pool = new THREE.Mesh(new THREE.CircleGeometry(2.5, 24), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.25, 0.24, 0.22), transparent: true, opacity: 0.5, depthWrite: false, fog: false }));
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(this.voidLight.x, 0.01, this.voidLight.z);
    grp.add(pool);
    // um pouco de "chão" sob o andarilho, para ele não flutuar no nada
    const here = new THREE.Mesh(new THREE.CircleGeometry(1.6, 24), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.035, 0.035, 0.04), transparent: true, opacity: 0.6, depthWrite: false, fog: false }));
    here.rotation.x = -Math.PI / 2;
    here.position.set(VOID.x, 0.012, VOID.z);
    grp.add(here);
    this.scene.add(grp);
    // o próprio andarilho, para a cena de despertar
    this.me = new NPC(this, {
      id: 'eu',
      name: '',
      role: '',
      x: VOID.x,
      z: VOID.z,
      yaw: 0,
      h: 1.75,
      look: { skin: '#c8956c', hair: '#2a1c12', hairStyle: 'short', suit: '#3c4a3a', accent: '#d8c070', arms: 'down', eyes: '#2c1d12', beard: 'rgba(40,25,15,0.35)' },
    });
    this.me.tag.visible = false;
    this.me.amb.value.set(0.55, 0.55, 0.6);
    this.me.root.visible = false;
  }

  startCine() {
    const g = this.game;
    this.cine = { t: 0, subI: 0 };
    g.hud.show(false);
    const bars = document.createElement('div');
    bars.id = 'cine';
    bars.innerHTML = '<div class="cb top"></div><div class="cb bot"><div id="cine-sub"></div><div id="cine-skip">tocar / E para pular</div></div>';
    document.body.appendChild(bars);
    this.bars = bars;
    const skip = (e) => {
      e.preventDefault();
      if (this.cine) this.cine.t = Math.max(this.cine.t, 10);
    };
    bars.addEventListener('touchend', skip, { passive: false });
    bars.addEventListener('click', skip);
    this.subs = [
      [0.6, 'Escuro. Nenhum som. Nenhuma parede.'],
      [3.6, 'Você se vê de fora, deitado no nada.'],
      [6.8, 'O Vazio. Lá longe, uma luz.'],
      [10.4, ''],
    ];
    this.me.root.visible = true;
    this.me.root.position.set(VOID.x, 0.12, VOID.z);
    this.me.root.rotation.set(-Math.PI / 2, Math.PI, 0);
    g.audio.play('transition', { gain: 0.25, rate: 0.5 });
  }

  updateCine(dt) {
    const g = this.game;
    const C = this.cine;
    C.t += dt;
    const t = C.t;
    if (g.input.pressed('interact')) C.t = Math.max(C.t, 10);
    while (C.subI < this.subs.length && t >= this.subs[C.subI][0]) {
      const el = document.getElementById('cine-sub');
      if (el) el.textContent = this.subs[C.subI][1];
      C.subI++;
    }
    const me = this.me;
    // deitado → sentado → de pé
    const up = smoothstep(4.2, 7.6, t);
    me.root.rotation.x = -Math.PI / 2 * (1 - up);
    me.root.position.y = 0.12 * (1 - up);
    me.root.position.z = VOID.z + (1 - up) * 0.0;
    const br = Math.sin(t * 1.4);
    me.torso.scale.set(1 + br * 0.008, 1 + br * 0.012, 1);
    me.head.rotation.set(0, Math.sin(t * 0.8) * 0.4 * up, 0);
    for (const a of me.arms) {
      a.sh.rotation.x = -0.3 * (1 - up) * Math.sin(t * 2);
    }
    // câmera: de cima, girando; depois atrás da cabeça; por fim, os olhos
    const cam = g.camera;
    let pos;
    let look;
    if (t < 4.2) {
      const a = 0.6 + t * 0.35;
      pos = new THREE.Vector3(VOID.x + Math.sin(a) * 3.2, 4.2 - t * 0.4, VOID.z + Math.cos(a) * 3.2);
      look = new THREE.Vector3(VOID.x, 0.2, VOID.z - 0.8);
    } else if (t < 8.2) {
      const k = smoothstep(4.2, 8.2, t);
      pos = new THREE.Vector3(VOID.x + 2.6 - k * 1.6, 1.4 + k * 0.4, VOID.z - 2.2 + k * 0.6);
      look = new THREE.Vector3(VOID.x, 0.4 + up * 1.2, VOID.z);
    } else {
      const k = smoothstep(8.2, 10.6, t);
      pos = new THREE.Vector3(VOID.x + 1.0 * (1 - k), 1.8 - 0.2 * k, VOID.z - 1.6 * (1 - k));
      look = new THREE.Vector3(VOID.x, 1.6, VOID.z + 3);
      g.glitch = Math.max(g.glitch, k * 0.3);
    }
    cam.position.copy(pos);
    cam.up.set(0, 1, 0);
    cam.lookAt(look);
    if (t >= 10.8) {
      this.cine = null;
      if (this.bars) this.bars.remove();
      this.bars = null;
      me.root.visible = false;
      g.hud.show(true);
      g.player.frozen = false;
      g.player.pos.set(VOID.x, 0, VOID.z);
      g.player.yaw = Math.atan2(-(this.voidLight.x - VOID.x), -(this.voidLight.z - VOID.z));
      g.player.pitch = 0;
      g.hud.objective('O Vazio. Ande até a luz ao longe.', 6);
    }
  }

  voidUpdate(dt, player) {
    this.time = (this.time || 0) + dt;
    if (this.cine) {
      this.updateCine(dt);
      return;
    }
    this.voidFloor.position.set(player.pos.x, 0, player.pos.z);
    this.beam.lookAt(player.pos.x, 20, player.pos.z);
    this.beam.material.opacity = 0.45 + Math.sin(this.time * 1.3) * 0.1;
    this.droneT = (this.droneT || 0) - dt;
    if (this.droneT <= 0) {
      this.droneT = 6 + Math.random() * 6;
      this.game.audio.play('whisper', { gain: 0.12, rate: 0.5, wet: 2 });
    }
  }

  async leaveVoid() {
    const g = this.game;
    if (this.moving) return;
    this.moving = true;
    g.player.frozen = true;
    g.fadeTarget = 1;
    g.audio.play('transition', { gain: 0.3, rate: 0.8 });
    await new Promise((r) => setTimeout(r, 1000));
    if (g.level !== this) return;
    this.inVoid = false;
    this.voidGroup.visible = false;
    this.scene.fog = this.saved.fog;
    this.scene.background = this.saved.bg;
    this.sanityExtra = 0;
    await this.preload(this.spawn.x, this.spawn.z);
    g.player.pos.set(this.spawn.x, 0, this.spawn.z);
    g.player.yaw = this.spawn.yaw;
    g.player.vel.set(0, 0, 0);
    g.fadeTarget = 0;
    g.player.frozen = false;
    this.moving = false;
    g.hud.message('De volta ao começo dos corredores. Aquela porta tinha falhas. Procure uma que não falhe.', 5);
  }

  lightLevel(x, z) {
    if (this.inVoid) return 0.02;
    return super.lightLevel(x, z);
  }

  collide(p, r) {
    if (this.inVoid) return p;
    super.collide(p, r);
    for (const d of this.doors) pushCircle2(p, r, d.x - 0.6, d.x + 0.6, d.z - 0.02, d.z + 0.1);
    return p;
  }

  groundY() {
    return 0;
  }

  exitEmitter() {
    return { x: this.exit.x, y: 1.4, z: this.exit.z, sound: 'hum', gain: 0.12 };
  }

  dispose() {
    if (this.bars) this.bars.remove();
    if (this.saved && this.inVoid) {
      this.scene.fog = this.saved.fog;
      this.scene.background = this.saved.bg;
    }
    this.blur = 0;
    if (this.voidGroup) {
      this.scene.remove(this.voidGroup);
      this.voidGroup.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) o.material.dispose();
      });
      this.beamTex.dispose();
    }
    if (this.me) this.me.dispose();
    for (const m of this.doorMats) m.dispose();
    this.woodTex.dispose();
    if (this.tileGeo) {
      this.tileGeo.dispose();
      this.tileMat.dispose();
      this.holeGeo.dispose();
      this.holeMat.dispose();
    }
    if (this.figMat) this.figMat.dispose();
    this.panelMat.dispose();
    super.dispose();
  }
}

// Empurra um círculo para fora de um retângulo (como em grid.js).
function pushCircle2(p, r, x0, x1, z0, z1) {
  const qx = clamp(p.x, x0, x1);
  const qz = clamp(p.z, z0, z1);
  const dx = p.x - qx;
  const dz = p.z - qz;
  const d = Math.hypot(dx, dz);
  if (d >= r || d < 1e-6) return;
  p.x = qx + (dx / d) * r;
  p.z = qz + (dz / d) * r;
}
