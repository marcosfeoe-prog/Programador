// Entrada: teclado, mouse (com trava do ponteiro e modo alternativo sem trava) e toque.
import { IS_TOUCH } from './config.js';

const KEYMAP = {
  KeyW: 'fwd',
  ArrowUp: 'fwd',
  KeyS: 'back',
  ArrowDown: 'back',
  KeyA: 'left',
  KeyD: 'right',
  ArrowLeft: 'turnL',
  ArrowRight: 'turnR',
  ShiftLeft: 'run',
  ShiftRight: 'run',
  KeyE: 'act',
  KeyF: 'act',
  Space: 'act',
  KeyR: 'reload',
  KeyQ: 'turn180',
  KeyG: 'grenade',
  KeyH: 'heal',
  KeyC: 'knife',
  KeyV: 'knife',
  Digit1: 'w1',
  Digit2: 'w2',
  Tab: 'inv',
  KeyI: 'inv',
  Escape: 'menu',
  KeyP: 'menu',
  Enter: 'enter',
  KeyX: 'aimKey',
};

const PREVENT = new Set(['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

export class Input {
  constructor(canvas, settings) {
    this.canvas = canvas;
    this.settings = settings;
    this.held = new Set();
    this.pressedSet = new Set();
    this.dx = 0;
    this.dy = 0;
    this.locked = false;
    this.lockFailed = false;
    this.lastLockTry = -1e9;
    this.lastUnlock = -1e9;
    this.cursorX = 0.5;
    this.cursorIn = false;
    this.wheel = 0;
    this.joy = { x: 0, y: 0 };
    this.touchMode = IS_TOUCH;
    this.touchAim = false;
    this.touchRun = false;
    this.enabled = false;
    this.onUnlock = null;
    this.onTouchDetected = null;
    this.anyKey = false;

    window.addEventListener('keydown', (e) => {
      this.anyKey = true;
      const a = KEYMAP[e.code];
      if (PREVENT.has(e.code)) e.preventDefault();
      if (!a) return;
      if (a === 'menu' && performance.now() - this.lastUnlock < 350) return;
      if (!e.repeat || !this.held.has(a)) this.pressedSet.add(a);
      this.held.add(a);
    });
    window.addEventListener('keyup', (e) => {
      const a = KEYMAP[e.code];
      if (a) this.held.delete(a);
    });
    window.addEventListener('blur', () => this.releaseAll());

    canvas.addEventListener('mousedown', (e) => {
      this.anyKey = true;
      if (!this.enabled || this.touchMode) return;
      const firstLock = !this.locked;
      if (!this.locked) this.lock();
      const a = e.button === 0 ? 'fire' : e.button === 2 ? 'aim' : e.button === 1 ? 'knife' : null;
      if (!a) return;
      // o clique que captura o mouse não dispara a arma
      if (firstLock && a === 'fire' && !this.lockFailed) {
        e.preventDefault();
        return;
      }
      if (!this.held.has(a)) this.pressedSet.add(a);
      this.held.add(a);
      e.preventDefault();
    });
    window.addEventListener('mouseup', (e) => {
      const a = e.button === 0 ? 'fire' : e.button === 2 ? 'aim' : e.button === 1 ? 'knife' : null;
      if (a) this.held.delete(a);
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener(
      'wheel',
      (e) => {
        if (this.enabled) this.wheel += Math.sign(e.deltaY);
      },
      { passive: true },
    );
    document.addEventListener('mousemove', (e) => {
      if (this.touchMode) return;
      this.cursorX = e.clientX / Math.max(1, window.innerWidth);
      this.cursorIn = true;
      if (!this.enabled) return;
      const mx = e.movementX || 0,
        my = e.movementY || 0;
      if (Math.abs(mx) > 300 || Math.abs(my) > 300) return; // salto falso ao travar
      if (this.locked || this.lockFailed) {
        this.dx += mx;
        this.dy += my;
      }
    });
    document.addEventListener('mouseleave', () => (this.cursorIn = false));
    document.addEventListener('pointerlockchange', () => {
      const was = this.locked;
      this.locked = document.pointerLockElement === canvas;
      if (this.locked) this.lockFailed = false;
      if (was && !this.locked) {
        this.lastUnlock = performance.now();
        this.releaseAll();
        if (this.onUnlock) this.onUnlock();
      }
    });
    document.addEventListener('pointerlockerror', () => {
      this.lockFailed = true;
    });
    this.setupTouch();
  }

  lock() {
    if (this.touchMode || this.locked) return;
    const now = performance.now();
    if (now - this.lastLockTry < 1200) return;
    this.lastLockTry = now;
    const el = this.canvas;
    if (!el.requestPointerLock) {
      this.lockFailed = true;
      return;
    }
    try {
      const p = el.requestPointerLock();
      if (p && typeof p.catch === 'function') p.catch(() => (this.lockFailed = true));
    } catch (e) {
      this.lockFailed = true;
    }
  }

  unlock() {
    try {
      if (document.pointerLockElement) document.exitPointerLock();
    } catch (e) {
      /* ignora */
    }
  }

  releaseAll() {
    this.held.clear();
    this.joy.x = this.joy.y = 0;
    if (this.joyEl) this.joyEl.classList.remove('on');
    this.touches = {};
    if (this.root) for (const b of this.root.querySelectorAll('.tbtn.held')) b.classList.remove('held');
  }

  isHeld(a) {
    if (a === 'aim') return this.held.has('aim') || this.held.has('aimKey') || (this.touchMode && this.touchAim);
    if (a === 'run') return this.held.has('run') || (this.touchMode && this.touchRun);
    return this.held.has(a);
  }

  pressed(a) {
    return this.pressedSet.has(a);
  }

  consume(a) {
    const had = this.pressedSet.has(a);
    this.pressedSet.delete(a);
    return had;
  }

  // Deltas de olhar (pixels) desde o último quadro, incluindo o giro pelas bordas sem trava.
  consumeLook(dt) {
    let x = this.dx,
      y = this.dy;
    this.dx = this.dy = 0;
    if (!this.touchMode && !this.locked && this.lockFailed && this.cursorIn && this.enabled) {
      const e = 0.07;
      if (this.cursorX < e) x -= ((e - this.cursorX) / e) * 900 * dt;
      else if (this.cursorX > 1 - e) x += ((this.cursorX - (1 - e)) / e) * 900 * dt;
    }
    return { x, y };
  }

  endFrame() {
    this.pressedSet.clear();
    this.wheel = 0;
  }

  setEnabled(v) {
    this.enabled = v;
    if (!v) {
      this.releaseAll();
      this.dx = this.dy = 0;
    }
  }

  // ------------------------------------------------------------------ toque
  setupTouch() {
    const root = (this.root = document.getElementById('touch'));
    if (!root) return;
    this.joyEl = document.getElementById('t-joy');
    this.knobEl = this.joyEl ? this.joyEl.querySelector('.knob') : null;
    this.touches = {};
    const R = 56;
    const setTouchMode = () => {
      if (!this.touchMode) {
        this.touchMode = true;
        this.unlock();
        if (this.onTouchDetected) this.onTouchDetected();
      }
    };
    window.addEventListener('touchstart', setTouchMode, { passive: true });

    const btnOf = (el) => (el && el.closest ? el.closest('.tbtn') : null);
    const onStart = (e) => {
      if (!this.enabled) return;
      e.preventDefault();
      for (const t of e.changedTouches) {
        const b = btnOf(document.elementFromPoint(t.clientX, t.clientY)) || btnOf(t.target);
        if (b && root.contains(b)) {
          const a = b.dataset.act;
          this.touches[t.identifier] = { kind: 'btn', a, el: b };
          b.classList.add('held');
          if (a === 'aim') {
            this.touchAim = !this.touchAim;
            b.classList.toggle('on', this.touchAim);
          } else if (a === 'run') {
            this.touchRun = !this.touchRun;
            b.classList.toggle('on', this.touchRun);
          } else {
            this.pressedSet.add(a);
            this.held.add(a);
          }
          continue;
        }
        const w = window.innerWidth;
        if (t.clientX < w * 0.42 && !Object.values(this.touches).some((v) => v.kind === 'joy')) {
          this.touches[t.identifier] = { kind: 'joy', ox: t.clientX, oy: t.clientY };
          if (this.joyEl) {
            this.joyEl.style.left = t.clientX + 'px';
            this.joyEl.style.top = t.clientY + 'px';
            this.joyEl.classList.add('on');
          }
        } else {
          this.touches[t.identifier] = { kind: 'look', x: t.clientX, y: t.clientY };
        }
      }
    };
    const onMove = (e) => {
      if (!this.enabled) return;
      e.preventDefault();
      for (const t of e.changedTouches) {
        const s = this.touches[t.identifier];
        if (!s) continue;
        if (s.kind === 'joy') {
          let dx = (t.clientX - s.ox) / R,
            dy = (t.clientY - s.oy) / R;
          const l = Math.hypot(dx, dy);
          if (l > 1) {
            dx /= l;
            dy /= l;
          }
          this.joy.x = dx;
          this.joy.y = -dy;
          if (this.knobEl) this.knobEl.style.transform = `translate(${dx * R}px, ${dy * R}px)`;
        } else if (s.kind === 'look') {
          const k = 1.6 * this.settings.touchSens;
          this.dx += (t.clientX - s.x) * k;
          this.dy += (t.clientY - s.y) * k;
          s.x = t.clientX;
          s.y = t.clientY;
        }
      }
    };
    const onEnd = (e) => {
      for (const t of e.changedTouches) {
        const s = this.touches[t.identifier];
        if (!s) continue;
        if (s.kind === 'joy') {
          this.joy.x = this.joy.y = 0;
          if (this.joyEl) this.joyEl.classList.remove('on');
          if (this.knobEl) this.knobEl.style.transform = '';
        } else if (s.kind === 'btn') {
          s.el.classList.remove('held');
          if (s.a !== 'aim' && s.a !== 'run') this.held.delete(s.a);
        }
        delete this.touches[t.identifier];
      }
    };
    root.addEventListener('touchstart', onStart, { passive: false });
    root.addEventListener('touchmove', onMove, { passive: false });
    root.addEventListener('touchend', onEnd, { passive: false });
    root.addEventListener('touchcancel', onEnd, { passive: false });
  }

  setTouchAim(v) {
    this.touchAim = v;
    const b = this.root && this.root.querySelector('[data-act="aim"]');
    if (b) b.classList.toggle('on', v);
  }

  setTouchRun(v) {
    this.touchRun = v;
    const b = this.root && this.root.querySelector('[data-act="run"]');
    if (b) b.classList.toggle('on', v);
  }
}
