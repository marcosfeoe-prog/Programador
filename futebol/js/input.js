// Entrada unificada: teclado, controle (Gamepad API) e toque (joystick
// virtual + botões). Ações de chute/passe carregam força enquanto seguradas
// e disparam ao soltar.

const KEYS = {
  KeyW: 'up',
  ArrowUp: 'up',
  KeyS: 'down',
  ArrowDown: 'down',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
  ShiftLeft: 'sprint',
  ShiftRight: 'sprint',
  KeyJ: 'pass',
  KeyZ: 'pass',
  KeyK: 'shoot',
  KeyX: 'shoot',
  KeyL: 'lob',
  KeyC: 'lob',
  KeyI: 'through',
  KeyV: 'through',
  KeyQ: 'finesse',
  KeyE: 'chip',
  Space: 'knock',
  Tab: 'switch',
  KeyB: 'camera',
  Escape: 'pause',
  KeyP: 'pause',
  KeyR: 'replay',
  Enter: 'confirm',
};
const CHARGE = new Set(['pass', 'shoot', 'lob', 'through']);
const CHARGE_TIME = 1.0;

export class Input {
  constructor() {
    this.keys = new Set();
    this.pressedQ = new Set();
    this.releasedQ = new Map();
    this.holdStart = new Map();
    this.enabled = false;
    this.joy = { x: 0, y: 0, active: false };
    this.touchHeld = new Set();
    this.padPrev = [];
    this.finesseToggle = false;
    this.lastDevice = 'teclado';
    window.addEventListener('keydown', (e) => {
      const a = KEYS[e.code];
      if (!a) return;
      if (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
      if (e.repeat) return;
      this.lastDevice = 'teclado';
      this.down(a);
    });
    window.addEventListener('keyup', (e) => {
      const a = KEYS[e.code];
      if (a) this.up(a);
    });
    window.addEventListener('blur', () => {
      for (const a of [...this.keys]) this.up(a, true);
    });
  }

  down(a) {
    if (this.keys.has(a)) return;
    this.keys.add(a);
    this.pressedQ.add(a);
    if (CHARGE.has(a)) this.holdStart.set(a, performance.now());
    if (a === 'knock') this.keys.add('contain');
  }

  up(a, silent = false) {
    if (!this.keys.has(a)) return;
    this.keys.delete(a);
    if (a === 'knock') this.keys.delete('contain');
    if (CHARGE.has(a) && !silent) {
      const t0 = this.holdStart.get(a) || performance.now();
      const p = Math.min(1, Math.max(0.06, (performance.now() - t0) / 1000 / CHARGE_TIME));
      this.releasedQ.set(a, p);
    }
    this.holdStart.delete(a);
  }

  // Barra de força da ação sendo carregada (0..1) ou null.
  charge() {
    for (const a of CHARGE) {
      if (this.keys.has(a)) {
        const t0 = this.holdStart.get(a);
        return { action: a, power: Math.min(1, (performance.now() - t0) / 1000 / CHARGE_TIME) };
      }
    }
    return null;
  }

  pollPad() {
    // a API de controle pode estar bloqueada (por exemplo, dentro de um iframe)
    let pads = [];
    try {
      pads = navigator.getGamepads ? navigator.getGamepads() || [] : [];
    } catch (e) {
      pads = [];
    }
    let pad = null;
    for (const p of pads) if (p && p.connected) {
      pad = p;
      break;
    }
    if (!pad) return null;
    const map = { 0: 'pass', 1: 'shoot', 2: 'through', 3: 'lob', 4: 'switch', 5: 'finesse', 6: 'chip', 7: 'sprint', 8: 'camera', 9: 'pause', 10: 'knock', 12: 'up', 13: 'down', 14: 'left', 15: 'right' };
    for (const k in map) {
      const b = pad.buttons[k];
      const on = b && (b.pressed || b.value > 0.5);
      const was = this.padPrev[k];
      if (on && !was) {
        this.lastDevice = 'controle';
        this.down(map[k]);
      } else if (!on && was) this.up(map[k]);
      this.padPrev[k] = on;
    }
    // LT também é "conter" na defesa
    if (pad.buttons[6] && pad.buttons[6].pressed) this.keys.add('contain');
    const ax = pad.axes[0] || 0;
    const ay = pad.axes[1] || 0;
    const m = Math.hypot(ax, ay);
    if (m > 0.18) {
      this.lastDevice = 'controle';
      return { x: ax, y: -ay };
    }
    return { x: 0, y: 0 };
  }

  // Lê e limpa as ações do quadro. Devolve o estado em coordenadas de tela.
  frame() {
    const pad = this.pollPad();
    let x = 0;
    let y = 0;
    if (this.keys.has('right')) x += 1;
    if (this.keys.has('left')) x -= 1;
    if (this.keys.has('up')) y += 1;
    if (this.keys.has('down')) y -= 1;
    if (x && y) {
      x *= Math.SQRT1_2;
      y *= Math.SQRT1_2;
    }
    if (pad && (pad.x || pad.y)) {
      x = pad.x;
      y = pad.y;
    }
    if (this.joy.active) {
      x = this.joy.x;
      y = this.joy.y;
    }
    const held = new Set(this.keys);
    for (const a of this.touchHeld) held.add(a);
    if (this.finesseToggle) held.add('finesse');
    const out = {
      x,
      y,
      sprint: held.has('sprint') || Math.hypot(this.joy.x, this.joy.y) > 0.98,
      pressed: this.pressedQ,
      released: this.releasedQ,
      held,
    };
    this.pressedQ = new Set();
    this.releasedQ = new Map();
    if (out.released.has('shoot') && this.finesseToggle) {
      this.finesseToggle = false;
      this.onFinesseOff && this.onFinesseOff();
    }
    return out;
  }

  clear() {
    this.keys.clear();
    this.pressedQ.clear();
    this.releasedQ.clear();
    this.holdStart.clear();
    this.touchHeld.clear();
    this.joy.x = this.joy.y = 0;
    this.joy.active = false;
  }

  // ------------------------------------------------------------ toque

  setupTouch(root) {
    const stick = root.querySelector('#t-stick');
    const knob = root.querySelector('#t-knob');
    let sid = null;
    let cx = 0;
    let cy = 0;
    const R = 56;
    const move = (t) => {
      let dx = t.clientX - cx;
      let dy = t.clientY - cy;
      const d = Math.hypot(dx, dy);
      if (d > R) {
        dx *= R / d;
        dy *= R / d;
      }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      const mag = Math.min(1.05, d / R);
      this.joy.x = (dx / R) * (mag > 1 ? 1 : 1);
      this.joy.y = -(dy / R);
      if (d > R * 1.05) {
        this.joy.x *= 1.02;
        this.joy.y *= 1.02;
      }
    };
    const zone = root.querySelector('#t-left');
    zone.addEventListener(
      'touchstart',
      (e) => {
        e.preventDefault();
        if (sid != null) return;
        const t = e.changedTouches[0];
        sid = t.identifier;
        const r = zone.getBoundingClientRect();
        cx = Math.min(Math.max(t.clientX, r.left + 70), r.right - 70);
        cy = Math.min(Math.max(t.clientY, r.top + 70), r.bottom - 70);
        stick.style.left = cx - r.left + 'px';
        stick.style.top = cy - r.top + 'px';
        stick.classList.add('on');
        this.joy.active = true;
        this.lastDevice = 'toque';
        move(t);
      },
      { passive: false }
    );
    const end = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === sid) {
          sid = null;
          this.joy.active = false;
          this.joy.x = this.joy.y = 0;
          knob.style.transform = '';
          stick.classList.remove('on');
        }
      }
    };
    zone.addEventListener(
      'touchmove',
      (e) => {
        e.preventDefault();
        for (const t of e.changedTouches) if (t.identifier === sid) move(t);
      },
      { passive: false }
    );
    zone.addEventListener('touchend', end);
    zone.addEventListener('touchcancel', end);
    // botões
    for (const b of root.querySelectorAll('[data-act]')) {
      const a = b.dataset.act;
      b.addEventListener(
        'touchstart',
        (e) => {
          e.preventDefault();
          this.lastDevice = 'toque';
          if (a === 'finesse') {
            this.finesseToggle = !this.finesseToggle;
            b.classList.toggle('lit', this.finesseToggle);
            return;
          }
          b.classList.add('down');
          if (a === 'sprint') this.touchHeld.add('sprint');
          else this.down(a);
        },
        { passive: false }
      );
      const up = (e) => {
        e.preventDefault();
        b.classList.remove('down');
        if (a === 'sprint') this.touchHeld.delete('sprint');
        else if (a !== 'finesse') this.up(a);
      };
      b.addEventListener('touchend', up, { passive: false });
      b.addEventListener('touchcancel', up, { passive: false });
      // também funciona com mouse (testes no PC)
      b.addEventListener('mousedown', (e) => {
        if (a === 'finesse') {
          this.finesseToggle = !this.finesseToggle;
          b.classList.toggle('lit', this.finesseToggle);
          return;
        }
        if (a === 'sprint') this.touchHeld.add('sprint');
        else this.down(a);
      });
      b.addEventListener('mouseup', () => {
        if (a === 'sprint') this.touchHeld.delete('sprint');
        else if (a !== 'finesse') this.up(a);
      });
    }
  }
}
