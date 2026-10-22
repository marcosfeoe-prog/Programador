// Teclado, mouse (com pointer lock) e controles de toque.
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.mouse = [false, false, false];
    this.lookDX = 0;
    this.lookDY = 0;
    this.pending = { attack: false, use: false, jump: false, forward: false, tap: false };
    this.wheel = 0;
    this.locked = false;
    this.lockTime = 0;
    this.enabled = false; // só lê ações quando nenhuma tela está aberta
    this.onKey = null;
    this.onLockChange = null;
    this.touch = { active: false, joyX: 0, joyY: 0, attack: false, jump: false, sneak: false, sprint: false };
    this.isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

    window.addEventListener('keydown', (e) => {
      const tag = document.activeElement && document.activeElement.tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA';
      if (['F1', 'F3', 'F5', 'Tab'].includes(e.code) || (this.enabled && (e.code === 'Space' || e.code.startsWith('Arrow')))) e.preventDefault();
      if (e.ctrlKey && this.enabled && (e.code === 'KeyW' || e.code === 'KeyS' || e.code === 'KeyD')) e.preventDefault();
      if (typing && e.code !== 'Escape' && e.code !== 'Enter') return;
      if (!e.repeat) {
        if (e.code === 'Space') this.pending.jump = true;
        if (e.code === 'KeyW' || e.code === 'ArrowUp') this.pending.forward = true;
      }
      this.keys.add(e.code);
      this.onKey && this.onKey(e.code, e, e.repeat);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouse = [false, false, false];
    });

    canvas.addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      this.mouse[e.button] = true;
      if (e.button === 0) this.pending.attack = true;
      if (e.button === 2) this.pending.use = true;
      if (e.button === 1) {
        e.preventDefault();
        this.onKey && this.onKey('MiddleClick', e, false);
      }
    });
    window.addEventListener('mouseup', (e) => (this.mouse[e.button] = false));
    window.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      // o Chrome às vezes manda um salto enorme logo após travar o ponteiro
      if (performance.now() - this.lockTime < 150 || Math.abs(e.movementX) > 400 || Math.abs(e.movementY) > 400) return;
      this.lookDX += e.movementX;
      this.lookDY += e.movementY;
    });
    window.addEventListener(
      'wheel',
      (e) => {
        if (this.enabled) this.wheel += Math.sign(e.deltaY);
      },
      { passive: true },
    );
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      this.lockTime = performance.now();
      if (!this.locked) this.mouse = [false, false, false];
      this.onLockChange && this.onLockChange(this.locked);
    });
  }

  lock() {
    if (this.isTouch) return;
    try {
      const p = this.canvas.requestPointerLock();
      if (p && p.catch) p.catch(() => {});
    } catch (e) {
      /* sem pointer lock */
    }
  }
  unlock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  // ---------- toque ----------
  setupTouch(el) {
    const t = this.touch;
    const joy = el.joy, knob = el.knob;
    let joyId = null, joyCx = 0, joyCy = 0;
    const R = 55;
    joy.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const tt = e.changedTouches[0];
      joyId = tt.identifier;
      const r = joy.getBoundingClientRect();
      joyCx = r.left + r.width / 2;
      joyCy = r.top + r.height / 2;
      move(tt);
    }, { passive: false });
    const move = (tt) => {
      let dx = tt.clientX - joyCx, dy = tt.clientY - joyCy;
      const d = Math.hypot(dx, dy);
      if (d > R) { dx = (dx / d) * R; dy = (dy / d) * R; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      t.joyX = dx / R;
      t.joyY = -dy / R;
      t.sprint = d > R * 1.25 && t.joyY > 0.7;
    };
    joy.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const tt of e.changedTouches) if (tt.identifier === joyId) move(tt);
    }, { passive: false });
    const end = (e) => {
      for (const tt of e.changedTouches) if (tt.identifier === joyId) {
        joyId = null;
        t.joyX = t.joyY = 0;
        t.sprint = false;
        knob.style.transform = '';
      }
    };
    joy.addEventListener('touchend', end);
    joy.addEventListener('touchcancel', end);

    // olhar / tocar / segurar
    const look = new Map();
    this.canvas.addEventListener('touchstart', (e) => {
      if (!this.enabled) return;
      e.preventDefault();
      for (const tt of e.changedTouches) {
        const rec = { x: tt.clientX, y: tt.clientY, t: performance.now(), moved: 0, holding: false };
        rec.timer = setTimeout(() => {
          if (rec.moved < 12) {
            rec.holding = true;
            t.attack = true;
            this.pending.attack = true;
          }
        }, 280);
        look.set(tt.identifier, rec);
      }
    }, { passive: false });
    this.canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const tt of e.changedTouches) {
        const rec = look.get(tt.identifier);
        if (!rec) continue;
        const dx = tt.clientX - rec.x, dy = tt.clientY - rec.y;
        rec.moved += Math.abs(dx) + Math.abs(dy);
        rec.x = tt.clientX;
        rec.y = tt.clientY;
        this.lookDX += dx * 2.2;
        this.lookDY += dy * 2.2;
      }
    }, { passive: false });
    const lookEnd = (e) => {
      for (const tt of e.changedTouches) {
        const rec = look.get(tt.identifier);
        if (!rec) continue;
        clearTimeout(rec.timer);
        if (rec.holding) t.attack = false;
        else if (performance.now() - rec.t < 280 && rec.moved < 12) this.pending.tap = true;
        look.delete(tt.identifier);
      }
    };
    this.canvas.addEventListener('touchend', lookEnd);
    this.canvas.addEventListener('touchcancel', lookEnd);

    const hold = (btn, key) => {
      btn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        t[key] = true;
        if (key === 'jump') this.pending.jump = true;
      }, { passive: false });
      btn.addEventListener('touchend', (e) => {
        e.preventDefault();
        t[key] = false;
      });
    };
    hold(el.jump, 'jump');
    hold(el.sneak, 'sneak');
  }

  // Estado lido pelo jogador a cada tick
  state() {
    const k = this.keys, t = this.touch, on = this.enabled;
    let mx = 0, my = 0;
    if (on) {
      if (k.has('KeyW') || k.has('ArrowUp')) my += 1;
      if (k.has('KeyS') || k.has('ArrowDown')) my -= 1;
      if (k.has('KeyD') || k.has('ArrowRight')) mx += 1;
      if (k.has('KeyA') || k.has('ArrowLeft')) mx -= 1;
      if (t.joyX || t.joyY) {
        mx = Math.abs(t.joyX) > 0.25 ? t.joyX : 0;
        my = Math.abs(t.joyY) > 0.25 ? t.joyY : 0;
      }
    }
    const p = this.pending;
    const st = {
      moveX: mx,
      moveY: my,
      jump: on && (k.has('Space') || t.jump),
      sneak: on && (k.has('ShiftLeft') || k.has('ShiftRight') || t.sneak),
      sprint: on && (k.has('ControlLeft') || k.has('ControlRight') || t.sprint),
      attack: on && (this.mouse[0] || t.attack),
      use: on && this.mouse[2],
      attackPressed: on && p.attack,
      usePressed: on && p.use,
      jumpPressed: on && p.jump,
      forwardPressed: on && p.forward,
      tap: on && p.tap,
    };
    p.attack = p.use = p.jump = p.forward = p.tap = false;
    return st;
  }

  consumeLook() {
    const d = [this.lookDX, this.lookDY];
    this.lookDX = this.lookDY = 0;
    return d;
  }
  consumeWheel() {
    const w = this.wheel;
    this.wheel = 0;
    return w;
  }
}
