// Nível 257 — "A Estadia do Amanhecer". O maior nível: um corredor de 1000 m,
// futurista e vazio, sempre no pôr do sol. Janelas grandes de cantos
// arredondados mostram um vale de floresta com um rio transparente. As paredes
// e o teto mudam de cor pelo caminho; a partir de 500 m as paredes crescem;
// aos 750 m o corredor vira uma estação de metrô esquecida; aos 900 m fica fino
// e cheio de curvas; aos 950 m, o fim. Uma música toca o tempo todo e fica mais
// lenta e distorcida a cada passo.
import * as THREE from 'three';
import { OutdoorLevel } from './outdoor.js';
import { pushCircle } from './grid.js';
import { getTex, indoorEnvTex, TEX } from '../textures.js';
import { clamp, lerp, mulberry32, smoothstep } from '../util.js';
import { LEN, SUB0, SUB1, cx, walkLimits, inPit } from './level257_path.js';
import { buildCorridor, buildProps } from './level257_build.js';
import { Outside, SUN } from './level257_world.js';
import { Ending, preloadFlash } from './level257_end.js';

const TRACK = { name: 'l257', url: 'assets/audio/l257_lucy.m4a' };
const TRIGGER = 952;

function panelTex(S) {
  const c = TEX.makeCanvas(S, S);
  const x = c.getContext('2d');
  x.fillStyle = '#ece6dc';
  x.fillRect(0, 0, S, S);
  const r = mulberry32(2571);
  for (let i = 0; i < (S * S) / 50; i++) {
    x.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.035)';
    x.fillRect(r() * S, r() * S, 2, 2);
  }
  // painéis com junta funda e cantos arredondados
  const n = 2;
  const t = S / n;
  x.strokeStyle = 'rgba(70,58,48,0.55)';
  x.lineWidth = S / 160;
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      const p = S / 60;
      const rr = S / 18;
      const x0 = i * t + p;
      const y0 = j * t + p;
      const w = t - 2 * p;
      x.beginPath();
      x.moveTo(x0 + rr, y0);
      x.arcTo(x0 + w, y0, x0 + w, y0 + w, rr);
      x.arcTo(x0 + w, y0 + w, x0, y0 + w, rr);
      x.arcTo(x0, y0 + w, x0, y0, rr);
      x.arcTo(x0, y0, x0 + w, y0, rr);
      x.stroke();
    }
  return TEX.toTex(c);
}

function subwayTileTex(S) {
  const c = TEX.makeCanvas(S, S);
  const x = c.getContext('2d');
  x.fillStyle = '#7a7268';
  x.fillRect(0, 0, S, S);
  const r = mulberry32(2572);
  const rows = 16;
  const cols = 8;
  const th = S / rows;
  const tw = S / cols;
  for (let j = 0; j < rows; j++) {
    const off = j % 2 ? tw / 2 : 0;
    for (let i = -1; i <= cols; i++) {
      const l = 235 + r() * 15;
      const g = x.createLinearGradient(0, j * th, 0, (j + 1) * th);
      g.addColorStop(0, `rgb(${l},${l - 6},${l - 14})`);
      g.addColorStop(1, `rgb(${l - 22},${l - 28},${l - 36})`);
      x.fillStyle = g;
      x.fillRect(i * tw + off + 1.5, j * th + 1.5, tw - 3, th - 3);
    }
  }
  // faixa de cor da estação
  x.fillStyle = 'rgba(30,110,110,0.85)';
  x.fillRect(0, S * 0.5, S, th);
  return TEX.toTex(c);
}

export class Level257 extends OutdoorLevel {
  constructor(game) {
    super(game, { P: 100, walkSpeed: 2.25, camFar: 1300 });
    this.num = 257;
    this.time = 0;
    this.walked = 0;
    this.blur = 0;
    this.sanityExtra = -0.3;
    this.geos = [];
    this.mats = [];
    this.texs = [];
    this.meshes = [];
    this.colliders = [];
    this.circles = [];
    this.lamps = [];
    this.doorOpen = 0;
    this.look = {
      exposure: 1.18,
      tint: [1.12, 0.95, 0.78],
      sat: 1.05,
      contrast: 1.1,
      lift: [0.02, 0.012, 0.004],
      bloom: 0.5,
      bloomThreshold: 0.85,
      fog: [0.62, 0.36, 0.22],
      lightColor: [1, 1, 1],
      flashlight: false,
      ambience: 'level257',
      reverb: 1.8,
      sanityDrain: 0,
    };
    this.objectives = [{ id: 'fim', text: 'Caminhe em direção ao pôr do sol (1000 m)' }];
    this.scene.fog = new THREE.FogExp2(new THREE.Color(...this.look.fog), 0.0042);
    this.scene.background = new THREE.Color(...this.look.fog);
    this.sunI = 3.4;
    this.setupLights({
      sky: 0xffb47a,
      ground: 0x4a2c1c,
      hemi: 0.95,
      sunColor: 0xffa060,
      sun: this.sunI,
      sunDir: SUN,
      shadowExtent: 34,
      shadowFar: 300,
    });
    this.shadowDist = 150;
    // luz rebatida: o sol que bate no piso e na parede volta quente para dentro
    this.fill = new THREE.DirectionalLight(0xff9860, 0.6);
    this.fill.position.set(1, 0.25, 0.35);
    this.bounce = new THREE.DirectionalLight(0xff8a50, 0.5);
    this.bounce.position.set(-0.3, -1, 0.2);
    this.scene.add(this.fill, this.bounce);
    this.spawn = { x: cx(2), z: -2, yaw: 0 };
    this.exit = { x: cx(LEN), z: -LEN + 0.8 };
  }

  mat(m) {
    this.mats.push(m);
    return m;
  }

  addLamp(x, y, z, color, I, dist) {
    this.lamps.push({ x, y, z, color, I, dist });
  }

  solid(o, w, d) {
    const cs = Math.abs(Math.cos(o.rot));
    const sn = Math.abs(Math.sin(o.rot));
    const hx = (w * cs + d * sn) / 2;
    const hz = (w * sn + d * cs) / 2;
    this.colliders.push([o.x - hx, o.x + hx, o.z - hz, o.z + hz]);
  }

  async preload(px, pz, progress) {
    const g = this.game;
    this.flashImgs = preloadFlash();
    if (g.audio.ready) await Promise.race([g.audio.loadTrack(TRACK.name, TRACK.url), new Promise((r) => setTimeout(r, 4000))]);
    progress(0.1);
    this.makeMaterials();
    const chunks = buildCorridor(this);
    progress(0.4);
    await new Promise((r) => setTimeout(r, 0));
    const props = buildProps(this);
    this.addMeshes(chunks, props);
    progress(0.6);
    await new Promise((r) => setTimeout(r, 0));
    this.outside = new Outside(this);
    this.outside.refresh(px, pz);
    progress(0.85);
    this.makeSigns(props.signs);
    this.makeDoor();
    this.makeLights();
    this.spawnItems();
    this.updateSun({ x: px, z: pz });
    progress(1);
  }

  makeMaterials() {
    const S = Math.min(1024, this.Q.tex);
    const env = this.game.makeEnv(indoorEnvTex(['#ffb880', '#a05a38', '#3a1e14'], '#ffe0b8'));
    const conc = getTex('concrete', S);
    const cf = getTex('concreteFloor', S);
    const panel = panelTex(Math.min(512, S));
    const tile = subwayTileTex(Math.min(512, S));
    this.texs.push(panel, tile);
    const side = THREE.DoubleSide;
    const wall = (o) => {
      const m = this.mat(new THREE.MeshStandardMaterial({ vertexColors: true, side, shadowSide: side, ...o }));
      return m;
    };
    this.M = {
      wall_concrete: wall({ map: conc.map, normalMap: this.Q.normalMaps ? conc.normalMap : null, roughness: 0.85, color: new THREE.Color(1.6, 1.48, 1.36) }),
      wall_panel: wall({ map: panel, roughness: 0.55, envMap: env, envMapIntensity: 0.25 }),
      wall_tile: wall({ map: tile, roughness: 0.25, envMap: env, envMapIntensity: 0.6 }),
      floor: this.mat(new THREE.MeshStandardMaterial({ map: cf.map, roughness: 0.32, color: 0xd8c4b0, envMap: env, envMapIntensity: 0.55, side })),
      floorTile: this.mat(new THREE.MeshStandardMaterial({ map: tile, vertexColors: true, roughness: 0.4, envMap: env, envMapIntensity: 0.4, side })),
      ceil: wall({ map: conc.map, roughness: 0.9, color: new THREE.Color(1.55, 1.5, 1.45) }),
      frame: wall({ roughness: 0.45, metalness: 0.55, envMap: env, envMapIntensity: 0.6 }),
      glow: this.mat(new THREE.MeshBasicMaterial({ vertexColors: true, side })),
      paint: wall({ roughness: 0.7 }),
      metal: wall({ roughness: 0.35, metalness: 0.8, envMap: env, envMapIntensity: 0.8 }),
      leather: wall({ roughness: 0.5, envMap: env, envMapIntensity: 0.3 }),
      stone: wall({ map: conc.map, roughness: 0.6, color: new THREE.Color(1.4, 1.35, 1.3) }),
    };
    // a cor geral das paredes "respira" devagar com o tempo
    this.tintable = [this.M.wall_concrete, this.M.wall_panel, this.M.ceil];
    this.baseCol = this.tintable.map((m) => m.color.clone());
  }

  addMeshes(chunks, props) {
    const sh = this.Q.shadows;
    const add = (gb, k, cast) => {
      if (gb.empty) return;
      const m = new THREE.Mesh(gb.build(), this.M[k]);
      m.castShadow = sh && cast;
      m.receiveShadow = sh && k !== 'glow';
      m.matrixAutoUpdate = false;
      this.geos.push(m.geometry);
      this.scene.add(m);
      this.meshes.push(m);
    };
    for (const ch of chunks) for (const k in ch.G) add(ch.G[k], k, k.startsWith('wall') || k === 'ceil' || k === 'frame');
    for (const k in props.G) add(props.G[k], k, true);
  }

  makeSigns(list) {
    for (const sg of list) {
      const c = TEX.makeCanvas(512, 160);
      const x = c.getContext('2d');
      if (sg.kind === 'clock') {
        x.fillStyle = '#141210';
        x.fillRect(0, 0, 512, 160);
        x.fillStyle = '#ffb060';
        x.font = 'bold 110px "Courier New", monospace';
      } else if (sg.kind === 'station') {
        x.fillStyle = '#1e6a6a';
        x.fillRect(0, 0, 512, 160);
        x.fillStyle = '#f4efe4';
        x.font = 'bold 46px "Trebuchet MS", sans-serif';
      } else {
        x.fillStyle = '#2a2420';
        x.fillRect(0, 0, 512, 160);
        x.fillStyle = '#ffd8a8';
        x.font = '300 84px "Trebuchet MS", sans-serif';
      }
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      x.fillText(sg.text, 256, 84);
      const tex = TEX.toTex(c, { repeat: false });
      this.texs.push(tex);
      const w = sg.kind === 'dist' ? 0.9 : 1.8;
      const geo = new THREE.PlaneGeometry(w, w * 0.3125);
      this.geos.push(geo);
      const m = new THREE.Mesh(geo, this.mat(new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(1.3, 1.3, 1.3) })));
      m.position.set(sg.x, sg.kind === 'dist' ? 2.0 : 3.2, sg.z);
      m.rotation.y = sg.rot;
      m.translateZ(0.02);
      this.dynamic.add(m);
    }
  }

  // A porta no fim: folha escura que abre para o nada.
  makeDoor() {
    const x = cx(LEN);
    const z = -LEN;
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    const leaf = this.mat(new THREE.MeshStandardMaterial({ color: 0x5a3a26, roughness: 0.45, metalness: 0.2 }));
    const brass = this.mat(new THREE.MeshStandardMaterial({ color: 0xd8a860, roughness: 0.3, metalness: 0.9 }));
    const voidM = this.mat(new THREE.MeshBasicMaterial({ color: 0x000000 }));
    const piv = new THREE.Group();
    piv.position.set(-0.65, 0, -0.02);
    const slab = new THREE.Mesh(new THREE.BoxGeometry(1.28, 2.48, 0.06), leaf);
    slab.position.set(0.64, 1.24, 0);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.04, 12, 8), brass);
    knob.position.set(1.15, 1.05, 0.05);
    piv.add(slab, knob);
    // o escuro do outro lado
    const dark = new THREE.Mesh(new THREE.BoxGeometry(3, 3.2, 6), voidM);
    dark.position.set(0, 1.6, -3.05);
    g.add(piv, dark);
    g.traverse((o) => o.geometry && this.geos.push(o.geometry));
    this.dynamic.add(g);
    this.doorPiv = piv;
  }

  makeLights() {
    const n = this.Q.id === 'low' ? 4 : 7;
    this.pls = [];
    for (let k = 0; k < n; k++) {
      const l = new THREE.PointLight(0xffa860, 0, 7, 1.6);
      this.dynamic.add(l);
      this.pls.push(l);
    }
  }

  updateLights(p) {
    if ((this.plT = (this.plT || 0) - 1) > 0) return;
    this.plT = 10;
    const near = this.lamps
      .filter((l) => Math.abs(l.z - p.z) < 25)
      .sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z));
    this.pls.forEach((l, i) => {
      const L = near[i];
      l.visible = !!L;
      if (!L) return;
      l.position.set(L.x, L.y, L.z);
      l.color.set(L.color);
      l.distance = L.dist;
      l.intensity = L.I;
    });
  }

  spawnItems() {
    const g = this.game;
    const list = [];
    for (const s of [60, 210, 380, 540, 690, 830, 925]) list.push({ type: 'note', key: `257:n${s}`, s, off: 0.3, rot: s });
    for (const s of [170, 470, 780]) list.push({ type: 'water', key: `257:w${s}`, s, off: -0.6 });
    for (const it of list) {
      if (this.taken.has(it.key)) continue;
      const [lo, hi] = walkLimits(it.s);
      const off = clamp(it.off, lo + 0.2, hi - 0.2);
      g.items.spawn({ type: it.type, key: it.key, x: cx(it.s) + off, z: -it.s, y: 0.01, rot: it.rot, light: 0.8 }, this.dynamic);
    }
  }

  // ------------------------------------------------------------ quadro
  update(dt, player) {
    const g = this.game;
    const p = player.pos;
    const cam = g.camera.position;
    this.time += dt;
    const t = this.time;
    if (this.ending) {
      this.ending.update(dt);
      this.outside.update(t, cam);
      this.updateSun({ x: cam.x, z: cam.z });
      this.doorPiv.rotation.y = this.doorOpen * 1.6;
      return;
    }
    const s = clamp(-p.z, 0, LEN);
    this.walked = Math.max(this.walked, s);
    const w = this.walked;
    this.updateSun(p);
    this.updateLights(p);
    this.outside.update(t, cam);
    if (!this.lastZ || Math.abs(p.z - this.lastZ) > 8) {
      this.lastZ = p.z;
      this.outside.refresh(p.x, p.z);
    }
    // a cor das paredes e do teto muda devagar com o tempo, também
    const hue = Math.sin(t * 0.05);
    this.tintable.forEach((m, i) => {
      const b = this.baseCol[i];
      m.color.setRGB(b.r * (1 + 0.04 * hue), b.g * (1 - 0.02 * hue), b.b * (1 - 0.05 * hue));
    });
    // a música: mais lenta e distorcida a cada passo
    this.music(w, dt);
    // o sol baixa um pouco mais perto do fim
    this.sun.intensity = this.sunI * (1 - 0.25 * smoothstep(750, 900, w)) * (s > SUB0 && s < SUB1 ? 0.7 : 1);
    this.hemi.intensity = lerp(0.95, 0.7, smoothstep(880, 950, w));
    this.blur = 0.12 * smoothstep(905, 950, w);
    // falas pelo caminho
    this.talk(w);
    if (s >= TRIGGER && !this.ending) {
      g.completeObjective('fim');
      this.ending = new Ending(this);
    }
  }

  music(w, dt) {
    const a = this.game.audio;
    if (!a.ready) return;
    if (!this.track) {
      if (a.B[TRACK.name]) this.track = a.startTrack(TRACK.name, 0.55, 3);
      else if (!this.loading) {
        this.loading = true;
        a.loadTrack(TRACK.name, TRACK.url);
      }
      return;
    }
    if ((this.musT = (this.musT || 0) - dt) > 0) return;
    this.musT = 0.5;
    const rate = 1 - 0.08 * smoothstep(100, 750, w) - 0.08 * smoothstep(750, 900, w) - 0.08 * smoothstep(900, 950, w);
    const fx = 0.12 * smoothstep(250, 750, w) + 0.25 * smoothstep(750, 900, w) + 0.25 * smoothstep(900, 950, w);
    this.track.setRate(rate, 1.2);
    this.track.setFx(fx, 1.2);
  }

  talk(w) {
    const g = this.game;
    if (g.hud.dlg) return;
    const L = [
      [8, 'a', ['Laranja… tudo laranja. Que lugar bonito.', 'É tão silencioso. Parece que o mundo inteiro parou pra assistir o sol se pôr.']],
      [140, 'b', ['Lá fora tem um rio. Dá pra ver as pedras no fundo, de tão limpa que é a água.']],
      [270, 'c', ['As paredes mudaram de cor… ou fui eu que mudei?', 'Eu nunca me senti tão sozinho. E, ao mesmo tempo, tão em paz.']],
      [505, 'd', ['As paredes estão crescendo. Ou eu estou ficando menor.', 'Não importa. Eu sigo em frente.']],
      [752, 'e', ['Uma estação de metrô… Quanto tempo será que esse trem tá parado aqui?', 'Ninguém vai embarcar. Ninguém vai descer.']],
      [902, 'f', ['O corredor tá apertando… e essa música, tão lenta.', 'Parece uma lembrança que eu nem sabia que tinha.']],
    ];
    for (const [d, id, lines] of L)
      if (w >= d && !this.said(id)) {
        g.hud.say(lines, null, g.mikeNamed ? 'MIKE' : 'VOCÊ');
        return;
      }
    if (w > 500 && !this.toldTall) {
      this.toldTall = true;
      g.hud.message('As paredes sobem. O teto fica cada vez mais longe.', 4);
    }
  }

  said(id) {
    this._said = this._said || new Set();
    if (this._said.has(id)) return true;
    this._said.add(id);
    return false;
  }

  // ------------------------------------------------------------ física
  collide(p, r) {
    if (this.ending) return p;
    const s = clamp(-p.z, -5.6 + r, LEN - r - 0.05);
    p.z = -s;
    const [lo, hi] = walkLimits(s);
    const c = cx(s);
    p.x = clamp(p.x, c + lo + r - 0.35, c + hi - r + 0.35);
    // pontas do poço: não dá para descer no trilho por elas
    if (inPit(s, p.x - c)) p.x = c + walkLimits(s)[0];
    for (let it = 0; it < 2; it++) {
      for (const b of this.colliders) if (Math.abs(p.z - (b[2] + b[3]) / 2) < 4) pushCircle(p, r, b[0], b[1], b[2], b[3]);
      for (const q of this.circles) {
        if (Math.abs(p.z - q[1]) > 2) continue;
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
    return p;
  }

  groundY() {
    return 0;
  }

  surfaceAt(x, z) {
    const s = -z;
    return s > SUB0 - 4 && s < SUB1 + 4 ? 'tile' : 'concrete';
  }

  los() {
    return true;
  }

  lightLevel() {
    return 1;
  }

  interactable() {
    return null;
  }

  navTarget() {
    const s = clamp(-this.game.player.pos.z + 12, 0, LEN);
    return { x: cx(s), z: -s };
  }

  dispose() {
    if (this.ending) this.ending.destroy();
    if (this.outside) this.outside.dispose();
    for (const m of this.meshes) this.scene.remove(m);
    super.dispose();
    for (const x of this.geos) x.dispose();
    for (const m of this.mats) m.dispose();
    for (const t of this.texs) t.dispose();
    this.scene.remove(this.hemi, this.sun, this.sun.target, this.fill, this.bounce);
  }
}
