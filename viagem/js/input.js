// Entrada: teclado, mouse, controle (Gamepad API) e controles de toque.
import { clamp } from './util.js';

const KEYS = {
  KeyW: 'up',
  ArrowUp: 'up',
  KeyS: 'down',
  ArrowDown: 'down',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
  Space: 'handbrake',
  KeyC: 'camera',
  KeyV: 'cameraBack',
  KeyL: 'lights',
  KeyR: 'radio',
  KeyM: 'map',
  KeyT: 'trips',
  KeyP: 'photo',
  KeyH: 'horn',
  KeyI: 'hud',
  KeyK: 'cruise',
  KeyO: 'autopilot',
  KeyE: 'shiftUp',
  KeyQ: 'shiftDown',
  Backspace: 'reset',
  KeyF: 'fullscreen',
  Escape: 'menu',
  Enter: 'confirm',
  Tab: 'trips',
  KeyB: 'lookBack',
};

export class Input {
  constructor(canvas, settings) {
    this.canvas = canvas;
    this.settings = settings;
    this.held = new Set();
    this.pressedSet = new Set();
    this.look = { x: 0, y: 0 };
    this.lookActive = false;
    this.touch = { steer: 0, gas: 0, brake: 0, handbrake: false };
    this.analog = false;
    this.gp = null;
    this.gpPrev = [];
    this.enabled = true;
    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
      const a = KEYS[e.code];
      if (!a) return;
      if (!this.held.has(a)) this.pressedSet.add(a);
      this.held.add(a);
      if (e.code === 'Space' || e.code.startsWith('Arrow') || e.code === 'Tab' || e.code === 'Backspace') e.preventDefault();
    });
    window.addEventListener('keyup', (e) => {
      const a = KEYS[e.code];
      if (a) this.held.delete(a);
    });
    window.addEventListener('blur', () => this.held.clear());
    // olhar em volta: arrastar com o mouse
    let drag = null;
    canvas.addEventListener('mousedown', (e) => {
      drag = { x: e.clientX, y: e.clientY };
      this.lookActive = true;
    });
    window.addEventListener('mouseup', () => {
      drag = null;
      this.lookActive = false;
    });
    window.addEventListener('mousemove', (e) => {
      if (!drag) return;
      this.look.x += (e.clientX - drag.x) * 0.005 * settings.sensitivity;
      this.look.y += (e.clientY - drag.y) * 0.005 * settings.sensitivity * (settings.invertY ? -1 : 1);
      drag.x = e.clientX;
      drag.y = e.clientY;
    });
    canvas.addEventListener('wheel', (e) => {
      this.zoom = (this.zoom || 0) + Math.sign(e.deltaY);
    }, { passive: true });
    this.setupTouch();
  }

  setupTouch() {
    const root = document.getElementById('touch');
    if (!root) return;
    if (this.settings.mobile) root.classList.add('on');
    const wheel = root.querySelector('.steer-zone');
    const knob = root.querySelector('.steer-knob');
    let sid = null;
    let sx0 = 0;
    const W = 110;
    wheel.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      sid = t.identifier;
      sx0 = t.clientX;
      this.touch.steer = 0;
    }, { passive: false });
    wheel.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (t.identifier !== sid) continue;
        const d = clamp((t.clientX - sx0) / W, -1, 1);
        this.touch.steer = d;
        knob.style.transform = `translateX(${d * W}px)`;
      }
    }, { passive: false });
    const end = (e) => {
      for (const t of e.changedTouches)
        if (t.identifier === sid) {
          sid = null;
          this.touch.steer = 0;
          knob.style.transform = '';
        }
    };
    wheel.addEventListener('touchend', end);
    wheel.addEventListener('touchcancel', end);
    for (const btn of root.querySelectorAll('[data-pedal]')) {
      const k = btn.dataset.pedal;
      const dn = (e) => {
        e.preventDefault();
        this.touch[k] = k === 'handbrake' ? true : 1;
        btn.classList.add('active');
      };
      const up = (e) => {
        e.preventDefault();
        this.touch[k] = k === 'handbrake' ? false : 0;
        btn.classList.remove('active');
      };
      btn.addEventListener('touchstart', dn, { passive: false });
      btn.addEventListener('touchend', up, { passive: false });
      btn.addEventListener('touchcancel', up, { passive: false });
      btn.addEventListener('mousedown', dn);
      btn.addEventListener('mouseup', up);
      btn.addEventListener('mouseleave', up);
    }
    for (const btn of root.querySelectorAll('[data-act]')) {
      const a = btn.dataset.act;
      const fire = (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.pressedSet.add(a);
      };
      btn.addEventListener('touchstart', fire, { passive: false });
      btn.addEventListener('click', fire);
    }
    // arrastar no meio da tela: olhar em volta
    const lz = root.querySelector('.look-zone');
    let lid = null;
    let lp = null;
    lz.addEventListener('touchstart', (e) => {
      const t = e.changedTouches[0];
      lid = t.identifier;
      lp = { x: t.clientX, y: t.clientY };
      this.lookActive = true;
    }, { passive: true });
    lz.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== lid) continue;
        this.look.x += (t.clientX - lp.x) * 0.008;
        this.look.y += (t.clientY - lp.y) * 0.008;
        lp = { x: t.clientX, y: t.clientY };
      }
    }, { passive: true });
    lz.addEventListener('touchend', () => {
      lid = null;
      this.lookActive = false;
    });
  }

  pollGamepad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let gp = null;
    for (const p of pads) if (p && p.connected) gp = p;
    this.gp = gp;
    if (!gp) return;
    const map = { 0: 'handbrake', 1: 'cameraBack', 2: 'horn', 3: 'camera', 4: 'lights', 5: 'radio', 8: 'map', 9: 'menu', 12: 'cruise', 13: 'autopilot', 14: 'shiftDown', 15: 'shiftUp' };
    gp.buttons.forEach((b, i) => {
      const was = this.gpPrev[i];
      const now = b.pressed;
      const a = map[i];
      if (a) {
        if (now && !was) this.pressedSet.add(a);
        if (now) this.held.add('gp_' + a);
        else this.held.delete('gp_' + a);
      }
      this.gpPrev[i] = now;
    });
    const rx = gp.axes[2] || 0;
    const ry = gp.axes[3] || 0;
    if (Math.abs(rx) > 0.15 || Math.abs(ry) > 0.15) {
      this.look.x += rx * 0.05;
      this.look.y += ry * 0.03;
      this.lookActive = true;
      this.gpLook = true;
    } else if (this.gpLook) {
      this.gpLook = false;
      this.lookActive = false;
    }
  }

  // controles do carro
  drive() {
    const k = this.held;
    let thr = k.has('up') ? 1 : 0;
    let brk = k.has('down') ? 1 : 0;
    let steer = (k.has('right') ? 1 : 0) - (k.has('left') ? 1 : 0);
    let analog = false;
    if (this.touch.gas) thr = 1;
    if (this.touch.brake) brk = 1;
    if (Math.abs(this.touch.steer) > 0.02) {
      steer = this.touch.steer;
      analog = true;
    }
    const gp = this.gp;
    if (gp) {
      const ax = gp.axes[0] || 0;
      if (Math.abs(ax) > 0.08) {
        steer = Math.sign(ax) * ((Math.abs(ax) - 0.08) / 0.92) ** 1.4;
        analog = true;
      }
      const rt = gp.buttons[7] ? gp.buttons[7].value : 0;
      const lt = gp.buttons[6] ? gp.buttons[6].value : 0;
      if (rt > 0.05) thr = Math.max(thr, rt);
      if (lt > 0.05) brk = Math.max(brk, lt);
    }
    return { throttle: thr, brake: brk, steer, analog, handbrake: k.has('handbrake') || k.has('gp_handbrake') || this.touch.handbrake };
  }

  isHeld(a) {
    return this.held.has(a) || this.held.has('gp_' + a);
  }

  pressed(a) {
    if (this.pressedSet.has(a)) {
      this.pressedSet.delete(a);
      return true;
    }
    return false;
  }

  consumeLook() {
    const l = { x: this.look.x, y: this.look.y };
    this.look.x = 0;
    this.look.y = 0;
    return l;
  }

  endFrame() {
    this.pressedSet.clear();
    this.zoom = 0;
  }
}
