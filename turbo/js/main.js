// Turbo Looping — corrida arcade 3D em pistas suspensas, com loops, saltos e
// obstáculos. Orquestra renderização, telas, garagem e corridas.
import * as THREE from 'three';
import { QUALITY, TOTAL_LEVELS, WORLDS, LEVELS_PER_WORLD } from './config.js';
import { Save } from './save.js';
import { AudioFX } from './audio.js';
import { RaceInput } from './input.js';
import { Particles } from './effects.js';
import { HUD } from './hud.js';
import { Garage } from './garage.js';
import { UI } from './ui.js';
import { Race } from './race.js';
import { setAnisotropy } from './textures.js';
import { yieldFrame } from './util.js';

const TIPS = [
  'Segure o dedo na tela para acelerar e arraste para os lados para virar.',
  'Nos loops, não solte o acelerador: devagar demais você cai!',
  'Passe pelas placas azuis para ganhar turbo.',
  'Saltos, loops e moedas enchem o nitro. Use nas retas!',
  'Chegue entre os 3 primeiros para liberar o próximo nível.',
  'Melhore o carro na garagem: velocidade é tudo nos mundos finais.',
  'Os martelos pendulares podem jogar você para fora da pista.',
  'Sem defensa na borda? Cuidado para não cair!',
];

class Game {
  constructor() {
    this.canvas = document.getElementById('game');
    this.save = new Save();
    const st = this.save.data.settings;
    this.quality = QUALITY[st.quality];
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: st.quality !== 'low', powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    setAnisotropy(Math.min(8, this.renderer.capabilities.getMaxAnisotropy()));
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.3, 5000);
    this.audio = new AudioFX();
    this.audio.setVolumes(st.sound, st.music);
    this.input = new RaceInput(this.canvas, st);
    this.input.onPause = () => this.state === 'race' && this.pause(!this.paused);
    this.input.bindNitro(document.getElementById('h-nitro'));
    this.fx = { sparks: new Particles(700, { additive: true }), smoke: new Particles(500) };
    this.hud = new HUD();
    this.garage = new Garage(this);
    this.ui = new UI(this);
    this.race = null;
    this.paused = false;
    // ?auto: o carro do jogador dirige sozinho (demonstração e testes)
    this.autopilot = new URLSearchParams(location.search).has('auto');
    this.state = 'menu';
    this.applyQuality();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 200));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'race' && !this.paused) this.pause(true);
    });
    this.canvas.addEventListener('pointerdown', () => this.audio.unlock());
    this.resize();
    this.toMenu();
    this.last = performance.now();
    this.renderer.setAnimationLoop(() => this.frame());
    document.getElementById('boot').classList.add('hidden');
  }

  applyQuality() {
    const st = this.save.data.settings;
    this.quality = QUALITY[st.quality];
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.quality.pixelRatio));
    this.renderer.shadowMap.enabled = this.quality.shadows > 0;
    this.resize();
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.garage.resize(w, h);
    this.hud.resize(w, h);
    const ph = h * this.renderer.getPixelRatio();
    this.fx.sparks.setScale(ph);
    this.fx.smoke.setScale(ph);
    document.body.classList.toggle('portrait', w < h);
  }

  makeEnvMap(sky) {
    const s = new THREE.Scene();
    s.add(new THREE.Mesh(sky.geometry, sky.material));
    const pm = new THREE.PMREMGenerator(this.renderer);
    const rt = pm.fromScene(s, 0.04, 1, 4000);
    pm.dispose();
    return rt.texture;
  }

  vibrate(ms) {
    if (this.save.data.settings.vibrate && navigator.vibrate) {
      try {
        navigator.vibrate(ms);
      } catch (e) {
        // ignorado
      }
    }
  }

  // --------------------------------------------------------------- estados
  toMenu() {
    this.endRace();
    this.state = 'menu';
    this.hud.show(false);
    this.garage.active = true;
    const d = this.save.data;
    const cs = d.cars[d.car];
    this.garage.setCar(d.car, { paint: cs.paint, rim: cs.rim, neon: cs.neon });
    this.ui.openMenu();
    this.audio.musicStart(0);
  }

  endRace() {
    this.input.enabled = false;
    this.input.reset();
    this.audio.engineStop();
    if (this.race) {
      this.race.dispose();
      this.race = null;
    }
    this.paused = false;
    document.getElementById('pause').classList.add('hidden');
  }

  async startLevel(idx) {
    idx = Math.max(0, Math.min(TOTAL_LEVELS - 1, idx));
    this.audio.unlock();
    this.endRace();
    this.state = 'loading';
    this.garage.active = false;
    const w = WORLDS[Math.floor(idx / LEVELS_PER_WORLD)];
    document.getElementById('l-title').textContent = `Nível ${idx + 1}`;
    document.getElementById('l-world').textContent = w.name;
    document.getElementById('l-tip').textContent = TIPS[Math.floor(Math.random() * TIPS.length)];
    document.getElementById('loading').className = `screen w-${w.id}`;
    this.ui.show('loading');
    await yieldFrame();
    await new Promise((r) => requestAnimationFrame(r));
    try {
      this.race = new Race(this, idx);
    } catch (e) {
      console.error(e);
      alert('Não foi possível montar a pista. Tente de novo.');
      this.toMenu();
      return;
    }
    // compila os shaders antes de mostrar
    this.renderer.compile(this.race.scene, this.camera);
    this.ui.hideAll();
    this.hud.show(true, this.race.cars.length);
    this.input.enabled = true;
    this.input.reset();
    this.state = 'race';
    this.audio.engineStart();
    this.audio.musicStart(this.race.info.world);
  }

  pause(on, silent = false) {
    if (this.state !== 'race') return;
    this.paused = on;
    document.getElementById('pause').classList.toggle('hidden', !on);
    if (on) {
      this.input.reset();
      this.audio.engineUpdate(0, 1, 0, 0, 0, false);
      if (this.audio.ctx && !silent) this.audio.ctx.suspend();
    } else if (this.audio.ctx) this.audio.ctx.resume();
  }

  showResults(r) {
    const d = this.save.data;
    const idx = r.level.idx;
    const total = r.reward + r.coins * 5;
    this.save.earn(total);
    if (!d.best[idx] || r.pos < d.best[idx]) d.best[idx] = r.pos;
    r.unlockedNew = false;
    if (r.pos <= 3) {
      if (idx + 1 >= d.unlocked && idx + 1 < TOTAL_LEVELS) {
        d.unlocked = idx + 2;
        r.unlockedNew = true;
      }
      d.next = Math.min(idx + 1, TOTAL_LEVELS - 1);
    } else d.next = idx;
    this.save.write();
    this.input.enabled = false;
    this.input.reset();
    this.hud.show(false);
    this.state = 'results';
    this.ui.showResults(r);
  }

  // ------------------------------------------------------------------ laço
  frame() {
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const r = this.race;
    if (r && (this.state === 'race' || this.state === 'results')) {
      if (!this.paused) {
        r.update(dt);
        const ps = r.player.sim;
        if (this.state === 'race') this.audio.engineUpdate(ps.speed, ps.stats.vmax, ps.finished ? 1 : this.input.read(0).throttle, ps.nitroOn ? 1 : ps.boostT > 0 ? 0.6 : 0, ps.scraping, ps.air);
        else this.audio.engineUpdate(ps.speed, ps.stats.vmax, 0.5, 0, 0, false);
      }
      this.camera.clearViewOffset();
      this.renderer.render(r.scene, this.camera);
    } else {
      this.garage.update(dt, this.state === 'menu' ? 'menu' : 'garage');
      this.renderer.render(this.garage.scene, this.garage.camera);
    }
  }
}

window.addEventListener('DOMContentLoaded', () => {
  try {
    window.game = new Game();
  } catch (e) {
    console.error(e);
    const b = document.getElementById('boot');
    b.classList.remove('hidden');
    b.innerHTML = '<p>Seu navegador não conseguiu iniciar o WebGL.<br>Tente outro navegador ou ative a aceleração de hardware.</p>';
  }
});
