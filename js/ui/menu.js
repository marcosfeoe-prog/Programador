// Menu principal / pausa, configurações e "laboratório da tempestade".
import { saveSettings } from '../config.js';

const $ = (id) => document.getElementById(id);

export class Menu {
  constructor(settings, hooks) {
    this.settings = settings;
    this.hooks = hooks;
    this.root = $('menu');
    this.pages = ['menu-main', 'menu-settings', 'menu-sandbox', 'menu-help'];
    this.open = true;
    const tap = (el, fn) => {
      el.addEventListener('click', fn);
    };
    tap($('btn-play'), () => hooks.play());
    tap($('btn-settings'), () => this.page('menu-settings'));
    tap($('btn-sandbox'), () => this.page('menu-sandbox'));
    tap($('btn-help'), () => this.page('menu-help'));
    for (const b of this.root.querySelectorAll('.back')) tap(b, () => this.page('menu-main'));

    const q = $('set-quality');
    q.value = settings.quality;
    q.addEventListener('change', () => {
      settings.quality = q.value;
      saveSettings(settings);
      const u = new URL(location.href);
      u.searchParams.delete('quality');
      location.href = u.toString();
    });
    const risk = $('set-risk');
    risk.value = settings.risk;
    risk.addEventListener('change', () => {
      settings.risk = risk.value;
      saveSettings(settings);
      hooks.riskChanged();
    });
    const sens = $('set-sens');
    sens.value = settings.sensitivity;
    sens.addEventListener('input', () => {
      settings.sensitivity = parseFloat(sens.value);
      saveSettings(settings);
    });
    const vol = $('set-vol');
    vol.value = settings.volume;
    vol.addEventListener('input', () => {
      settings.volume = parseFloat(vol.value);
      saveSettings(settings);
      hooks.volume(settings.volume);
    });
    const inv = $('set-invert');
    inv.checked = settings.invertY;
    inv.addEventListener('change', () => {
      settings.invertY = inv.checked;
      saveSettings(settings);
    });
    const fps = $('set-fps');
    fps.checked = settings.showFps;
    fps.addEventListener('change', () => {
      settings.showFps = fps.checked;
      saveSettings(settings);
      hooks.fps(fps.checked);
    });

    tap($('sb-force'), () => hooks.forceStorm());
    tap($('sb-skip'), () => hooks.skipPhase());
    $('sb-shape').addEventListener('change', (e) => hooks.shape(e.target.value || null));
    $('sb-speed').addEventListener('change', (e) => hooks.speed(parseFloat(e.target.value)));
    $('sb-color').addEventListener('change', (e) => hooks.color(e.target.value || null));
    $('sb-duration').addEventListener('change', (e) => hooks.duration(e.target.value ? parseFloat(e.target.value) : null));
    $('sb-auto').addEventListener('change', (e) => hooks.auto(e.target.checked));
    tap($('sb-day'), () => hooks.setHour(13));
    tap($('sb-night'), () => hooks.setHour(20));
  }

  page(id) {
    for (const p of this.pages) $(p).classList.toggle('hidden', p !== id);
  }

  ready() {
    const b = $('btn-play');
    b.disabled = false;
    b.textContent = 'Jogar';
    $('loading').classList.add('hidden');
  }

  progress(f, text) {
    $('load-bar').style.width = `${Math.round(f * 100)}%`;
    $('load-text').textContent = text;
  }

  show(paused) {
    this.open = true;
    this.page('menu-main');
    $('btn-play').textContent = paused ? 'Continuar' : 'Jogar';
    this.root.classList.remove('hidden');
  }

  hide() {
    this.open = false;
    this.root.classList.add('hidden');
  }

  setSpeed(v) {
    $('sb-speed').value = String(v);
  }
}
