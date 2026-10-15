// Cena curta do andarilho acordando: faixas pretas, legendas, pálpebras que
// abrem e fecham (fade), e a câmera que sai do chão até a altura dos olhos.
// Uso: const w = new WakeCine(level, { subs, keys, blinks, x, z, done });
//      no update do nível: if (w.active) { w.update(dt); return; }
// keys: [t, altura, pitch, yaw]; blinks: [t, escuridão 0..1].
import { lerp, smoothstep } from '../util.js';

export class WakeCine {
  constructor(level, o) {
    this.L = level;
    this.game = level.game;
    this.o = o;
    this.t = 0;
    this.active = true;
    this.end = o.keys[o.keys.length - 1][0] + 0.4;
    const g = this.game;
    g.player.frozen = true;
    g.hud.show(false);
    const bars = document.createElement('div');
    bars.id = 'cine';
    bars.innerHTML = '<div class="cb top"></div><div class="cb bot"><div id="cine-sub"></div><div id="cine-skip">tocar / E para pular</div></div>';
    document.body.appendChild(bars);
    this.bars = bars;
    const skip = (e) => {
      e.preventDefault();
      this.t = Math.max(this.t, this.end - 0.6);
    };
    bars.addEventListener('touchend', skip, { passive: false });
    bars.addEventListener('click', skip);
    this.subI = 0;
    if (o.sound) g.audio.play(o.sound, { gain: 0.25, rate: 0.8 });
  }

  interp(arr, col) {
    const t = this.t;
    for (let k = 0; k < arr.length - 1; k++) {
      const a = arr[k];
      const b = arr[k + 1];
      if (t <= b[0]) return lerp(a[col], b[col], smoothstep(a[0], b[0], t));
    }
    return arr[arr.length - 1][col];
  }

  update(dt) {
    const g = this.game;
    const o = this.o;
    this.t += dt;
    if (g.input.pressed('interact')) this.t = Math.max(this.t, this.end - 0.6);
    while (this.subI < o.subs.length && this.t >= o.subs[this.subI][0]) {
      const el = document.getElementById('cine-sub');
      if (el) el.textContent = o.subs[this.subI][1];
      this.subI++;
    }
    const blink = this.interp(o.blinks, 1);
    g.fade = blink;
    g.fadeTarget = blink;
    const cam = g.camera;
    cam.position.set(o.x, this.interp(o.keys, 1), o.z);
    cam.rotation.set(this.interp(o.keys, 2), this.interp(o.keys, 3), Math.sin(this.t * 0.7) * 0.05 * (1 - smoothstep(o.keys[o.keys.length - 2][0], this.end, this.t)), 'YXZ');
    if (this.t >= this.end) this.finish();
  }

  finish() {
    if (!this.active) return;
    const g = this.game;
    const o = this.o;
    this.active = false;
    this.dispose();
    g.fade = 0;
    g.fadeTarget = 0;
    g.hud.show(true);
    g.player.frozen = false;
    g.player.pos.x = o.x;
    g.player.pos.z = o.z;
    g.player.yaw = o.keys[o.keys.length - 1][3];
    g.player.pitch = 0;
    if (o.done) o.done();
  }

  dispose() {
    if (this.bars) this.bars.remove();
    this.bars = null;
  }
}

// Despertar padrão: deitado de costas olhando o teto, pisca, vira a cabeça, senta e levanta.
export function standardWake(level, x, z, yaw, subs, extra = {}) {
  return new WakeCine(level, {
    x,
    z,
    subs,
    blinks: [
      [0, 1],
      [0.9, 0.55],
      [1.3, 1],
      [2.1, 0.3],
      [2.5, 0.85],
      [3.3, 0],
    ],
    keys: [
      [0, 0.25, 1.35, yaw + 0.6],
      [3.5, 0.25, 1.15, yaw + 0.75],
      [5.6, 0.3, -0.5, yaw + 1.3],
      [7.6, 1.0, -0.15, yaw + 0.5],
      [10.4, 1.62, 0, yaw],
    ],
    ...extra,
  });
}
