// Teclado, mouse (com trava do ponteiro) e toque (analógico virtual + arrastar para olhar).

export class Input {
  constructor(canvas, toLogical) {
    this.canvas = canvas;
    this.toLogical = toLogical;
    this.keys = new Set();
    this.pressed = new Set();
    this.mdx = 0; this.mdy = 0;
    this.clicks = [];
    this.pointer = { x: -1, y: -1, moved: false };
    this.locked = false;
    this.touch = false;
    this.buttons = [];        // definidos pelo jogo: { id, x, y, w, h }
    this.held = new Set();    // botões de toque segurados
    this.stick = null;        // { id, ox, oy, x, y }
    this.lookTouch = null;
    this.wantLock = false;

    addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab'].includes(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.held.clear(); });

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (!this.locked && this.onUnlock) this.onUnlock();
    });
    addEventListener('mousemove', (e) => {
      if (this.locked) { this.mdx += e.movementX; this.mdy += e.movementY; }
      else {
        // sem trava do ponteiro (ex.: dentro de um iframe), arrastar também gira a câmera
        if (e.buttons & 1) { this.mdx += e.movementX || 0; this.mdy += e.movementY || 0; }
        const p = this.toLogical(e.clientX, e.clientY);
        this.pointer.x = p.x; this.pointer.y = p.y; this.pointer.moved = true;
      }
    });
    canvas.addEventListener('mousedown', (e) => {
      if (this.touch) return;
      if (this.locked) {
        if (e.button === 2) this.pressed.add('Mouse2');
        else this.pressed.add('Mouse0');
        return;
      }
      const p = this.toLogical(e.clientX, e.clientY);
      this.clicks.push(p);
      if (this.wantLock && canvas.requestPointerLock) {
        try { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (_) { /* sem trava */ }
      }
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    const opts = { passive: false };
    canvas.addEventListener('touchstart', (e) => { e.preventDefault(); this.touch = true; for (const t of e.changedTouches) this.touchStart(t); }, opts);
    canvas.addEventListener('touchmove', (e) => { e.preventDefault(); for (const t of e.changedTouches) this.touchMove(t); }, opts);
    const end = (e) => { e.preventDefault(); for (const t of e.changedTouches) this.touchEnd(t); };
    canvas.addEventListener('touchend', end, opts);
    canvas.addEventListener('touchcancel', end, opts);
  }

  requestLock() {
    if (this.touch || this.locked || !this.canvas.requestPointerLock) return;
    try { const r = this.canvas.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (_) { /* ignorado */ }
  }
  releaseLock() { if (this.locked && document.exitPointerLock) document.exitPointerLock(); }

  touchStart(t) {
    const p = this.toLogical(t.clientX, t.clientY);
    this.clicks.push(p);
    for (const b of this.buttons) {
      if (p.x >= b.x && p.y >= b.y && p.x < b.x + b.w && p.y < b.y + b.h) {
        this.pressed.add('T_' + b.id);
        this.held.add('T_' + b.id);
        (this.btnTouches ||= new Map()).set(t.identifier, 'T_' + b.id);
        return;
      }
    }
    if (p.x < 130 && !this.stick) this.stick = { id: t.identifier, ox: p.x, oy: p.y, x: p.x, y: p.y };
    else if (!this.lookTouch) this.lookTouch = { id: t.identifier, x: t.clientX, y: t.clientY };
  }
  touchMove(t) {
    if (this.stick && t.identifier === this.stick.id) {
      const p = this.toLogical(t.clientX, t.clientY);
      this.stick.x = p.x; this.stick.y = p.y;
    } else if (this.lookTouch && t.identifier === this.lookTouch.id) {
      const k = 900 / Math.max(innerWidth, 1);
      this.mdx += (t.clientX - this.lookTouch.x) * k * 1.4;
      this.mdy += (t.clientY - this.lookTouch.y) * k * 1.4;
      this.lookTouch.x = t.clientX; this.lookTouch.y = t.clientY;
    }
  }
  touchEnd(t) {
    if (this.stick && t.identifier === this.stick.id) this.stick = null;
    if (this.lookTouch && t.identifier === this.lookTouch.id) this.lookTouch = null;
    const b = this.btnTouches && this.btnTouches.get(t.identifier);
    if (b) { this.held.delete(b); this.btnTouches.delete(t.identifier); }
  }

  down(...codes) { return codes.some((c) => this.keys.has(c) || this.held.has(c)); }
  hit(...codes) { return codes.some((c) => this.pressed.has(c)); }

  // Vetor de movimento: x = lateral, y = frente.
  move() {
    let x = 0, y = 0;
    if (this.down('KeyW', 'ArrowUp')) y += 1;
    if (this.down('KeyS', 'ArrowDown')) y -= 1;
    if (this.down('KeyD')) x += 1;
    if (this.down('KeyA')) x -= 1;
    if (this.stick) {
      const dx = (this.stick.x - this.stick.ox) / 22, dy = (this.stick.y - this.stick.oy) / 22;
      const m = Math.hypot(dx, dy);
      if (m > 0.15) { const k = Math.min(1, m) / m; x += dx * k; y -= dy * k; }
    }
    const m = Math.hypot(x, y);
    if (m > 1) { x /= m; y /= m; }
    return { x, y };
  }

  // Setas esquerda/direita também giram a câmera (sem mouse).
  look() {
    let dx = this.mdx, dy = this.mdy;
    this.mdx = 0; this.mdy = 0;
    return { dx, dy };
  }

  endFrame() { this.pressed.clear(); this.clicks.length = 0; this.pointer.moved = false; }
}
