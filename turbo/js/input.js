// Controles: segure e arraste (toque ou mouse) para acelerar e virar, ou
// teclado (setas/WASD, Espaço/Shift = nitro). Soltar o dedo desacelera.

export class RaceInput {
  constructor(surface, settings) {
    this.surface = surface;
    this.settings = settings;
    this.keys = new Set();
    this.pointer = null; // { id, anchor }
    this.touchSteer = 0;
    this.keySteer = 0;
    this.nitroHeld = false;
    this.enabled = false;
    this.onPause = null;
    this.usedTouch = false;

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      if ((e.code === 'Escape' || e.code === 'KeyP') && this.enabled && this.onPause) this.onPause();
      this.keys.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code) && this.enabled) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.pointer = null;
    });

    surface.addEventListener('pointerdown', (e) => {
      if (!this.enabled || this.pointer) return;
      this.pointer = { id: e.pointerId, anchor: e.clientX, x: e.clientX };
      this.usedTouch = e.pointerType !== 'mouse';
      try {
        surface.setPointerCapture(e.pointerId);
      } catch (err) {
        // alguns navegadores não deixam capturar; segue sem captura
      }
    });
    surface.addEventListener('pointermove', (e) => {
      const p = this.pointer;
      if (!p || p.id !== e.pointerId) return;
      p.x = e.clientX;
      const range = Math.max(40, window.innerWidth * 0.14) / (this.settings.sensitivity || 1);
      let dx = p.x - p.anchor;
      // a âncora acompanha o dedo quando passa do limite (fácil voltar ao centro)
      if (dx > range) p.anchor = p.x - range;
      if (dx < -range) p.anchor = p.x + range;
      dx = p.x - p.anchor;
      this.touchSteer = Math.max(-1, Math.min(1, dx / range));
    });
    const end = (e) => {
      if (this.pointer && this.pointer.id === e.pointerId) {
        this.pointer = null;
        this.touchSteer = 0;
      }
    };
    surface.addEventListener('pointerup', end);
    surface.addEventListener('pointercancel', end);
  }

  bindNitro(btn) {
    const on = (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.nitroHeld = true;
    };
    const off = () => (this.nitroHeld = false);
    btn.addEventListener('pointerdown', on);
    btn.addEventListener('pointerup', off);
    btn.addEventListener('pointerleave', off);
    btn.addEventListener('pointercancel', off);
  }

  reset() {
    this.pointer = null;
    this.touchSteer = 0;
    this.keySteer = 0;
    this.nitroHeld = false;
  }

  read(dt) {
    const k = this.keys;
    const left = k.has('ArrowLeft') || k.has('KeyA');
    const right = k.has('ArrowRight') || k.has('KeyD');
    const target = (right ? 1 : 0) - (left ? 1 : 0);
    const rate = target === 0 ? 10 : 5;
    this.keySteer += Math.max(-rate * dt, Math.min(rate * dt, target - this.keySteer));
    const gasKey = k.has('ArrowUp') || k.has('KeyW');
    const brake = k.has('ArrowDown') || k.has('KeyS');
    const nitro = this.nitroHeld || k.has('Space') || k.has('ShiftLeft') || k.has('ShiftRight');
    const touching = !!this.pointer;
    return {
      throttle: gasKey || touching || (nitro && !brake) ? 1 : 0,
      brake: brake && !touching,
      steer: Math.max(-1, Math.min(1, this.keySteer + this.touchSteer)),
      nitro,
    };
  }
}
