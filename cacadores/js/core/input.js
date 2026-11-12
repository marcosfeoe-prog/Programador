// Entrada: teclado, mouse e toque (joystick virtual, pedais e botões de ação).

export const KEYMAP = {
  camera: ['KeyC'],
  photo: ['KeyF'],
  radar: ['KeyR'],
  map: ['KeyM'],
  menu: ['Escape'],
  probe: ['KeyP'],
  scan: ['KeyN'],
  report: ['KeyG'],
  horn: ['KeyH'],
  lights: ['KeyL'],
  warp: ['KeyT'],
  info: ['KeyI'],
  hud: ['KeyU'],
  forecast: ['KeyO'],
  interact: ['KeyE'],
  anchor: ['KeyX'],
  zoomRadar: ['KeyZ'],
  fly: ['KeyV'],
};

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.down = new Set();
    this.hit = new Set();
    this.actions = new Set();
    this.lookX = 0;
    this.lookY = 0;
    this.zoom = 0;
    this.touch = { steer: 0, fwd: 0, throttle: 0, brake: 0, active: false };
    this.enabled = true;
    this.dragging = false;
    this.lastX = 0;
    this.lastY = 0;
    this.lookPointer = null;
    this.joyPointer = null;
    this.usingTouch = false;

    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA')) return;
      if (!this.down.has(e.code)) this.hit.add(e.code);
      this.down.add(e.code);
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab'].includes(e.code)) e.preventDefault();
      for (const [action, codes] of Object.entries(KEYMAP)) if (codes.includes(e.code) && !e.repeat) this.actions.add(action);
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => this.down.clear());

    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') {
        this.usingTouch = true;
        if (this.lookPointer === null) {
          this.lookPointer = e.pointerId;
          this.lastX = e.clientX;
          this.lastY = e.clientY;
        }
        return;
      }
      this.dragging = true;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      canvas.setPointerCapture?.(e.pointerId);
    });
    window.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') {
        if (e.pointerId === this.lookPointer) {
          this.lookX += (e.clientX - this.lastX) * 1.4;
          this.lookY += (e.clientY - this.lastY) * 1.4;
          this.lastX = e.clientX;
          this.lastY = e.clientY;
        }
        return;
      }
      if (document.pointerLockElement === canvas) {
        this.lookX += e.movementX;
        this.lookY += e.movementY;
      } else if (this.dragging) {
        this.lookX += e.clientX - this.lastX;
        this.lookY += e.clientY - this.lastY;
        this.lastX = e.clientX;
        this.lastY = e.clientY;
      }
    });
    const end = (e) => {
      if (e.pointerType === 'touch') {
        if (e.pointerId === this.lookPointer) this.lookPointer = null;
        return;
      }
      this.dragging = false;
    };
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    canvas.addEventListener(
      'wheel',
      (e) => {
        this.zoom += Math.sign(e.deltaY);
        e.preventDefault();
      },
      { passive: false },
    );
  }

  // Liga o joystick, os pedais e os botões de toque (elementos do HTML).
  bindTouch(root) {
    const joy = root.querySelector('#joy');
    const knob = root.querySelector('#joy-knob');
    if (joy) {
      const setFromEvent = (e) => {
        const r = joy.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        let dx = (e.clientX - cx) / (r.width / 2);
        let dy = (e.clientY - cy) / (r.height / 2);
        const l = Math.hypot(dx, dy);
        if (l > 1) {
          dx /= l;
          dy /= l;
        }
        this.touch.steer = dx;
        this.touch.fwd = -dy;
        knob.style.transform = `translate(${dx * r.width * 0.32}px, ${dy * r.height * 0.32}px)`;
      };
      joy.addEventListener('pointerdown', (e) => {
        this.usingTouch = true;
        this.joyPointer = e.pointerId;
        joy.setPointerCapture?.(e.pointerId);
        setFromEvent(e);
        e.stopPropagation();
      });
      joy.addEventListener('pointermove', (e) => {
        if (e.pointerId === this.joyPointer) setFromEvent(e);
      });
      const release = (e) => {
        if (e.pointerId !== this.joyPointer) return;
        this.joyPointer = null;
        this.touch.steer = 0;
        this.touch.fwd = 0;
        knob.style.transform = '';
      };
      joy.addEventListener('pointerup', release);
      joy.addEventListener('pointercancel', release);
    }
    const pedal = (id, key) => {
      const el = root.querySelector(id);
      if (!el) return;
      el.addEventListener('pointerdown', (e) => {
        this.usingTouch = true;
        this.touch[key] = 1;
        el.classList.add('on');
        el.setPointerCapture?.(e.pointerId);
        e.stopPropagation();
      });
      const off = () => {
        this.touch[key] = 0;
        el.classList.remove('on');
      };
      el.addEventListener('pointerup', off);
      el.addEventListener('pointercancel', off);
    };
    pedal('#pedal-gas', 'throttle');
    pedal('#pedal-brake', 'brake');
    root.querySelectorAll('[data-action]').forEach((el) => {
      el.addEventListener('pointerdown', (e) => {
        this.usingTouch = true;
        this.actions.add(el.dataset.action);
        e.stopPropagation();
        e.preventDefault();
      });
    });
  }

  key(code) {
    return this.down.has(code);
  }

  // Eixos de direção combinando teclado e toque.
  driveAxes() {
    const k = this.down;
    let steer = 0;
    if (k.has('KeyA') || k.has('ArrowLeft')) steer -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) steer += 1;
    let throttle = k.has('KeyW') || k.has('ArrowUp') ? 1 : 0;
    let brake = k.has('KeyS') || k.has('ArrowDown') ? 1 : 0;
    steer += this.touch.steer;
    throttle = Math.max(throttle, this.touch.throttle);
    brake = Math.max(brake, this.touch.brake);
    return {
      steer: Math.max(-1, Math.min(1, steer)),
      throttle,
      brake,
      handbrake: k.has('Space'),
      boost: k.has('ShiftLeft') || k.has('ShiftRight'),
    };
  }

  // Eixos do sobrevoo: frente/trás, lados, subir (Espaço) e descer (Shift).
  // No toque: o joystick move e os pedais sobem/descem.
  flyAxes() {
    const k = this.down;
    let fwd = 0;
    let strafe = 0;
    let up = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) fwd += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) fwd -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) strafe += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) strafe -= 1;
    if (k.has('Space') || k.has('PageUp')) up += 1;
    if (k.has('ShiftLeft') || k.has('ShiftRight') || k.has('PageDown')) up -= 1;
    fwd += this.touch.fwd;
    strafe += this.touch.steer;
    up += this.touch.throttle - this.touch.brake;
    const c = (v) => Math.max(-1, Math.min(1, v));
    return { fwd: c(fwd), strafe: c(strafe), up: c(up) };
  }

  consumeAction(name) {
    if (this.actions.has(name)) {
      this.actions.delete(name);
      return true;
    }
    return false;
  }

  consumeLook() {
    const r = { x: this.lookX, y: this.lookY, zoom: this.zoom };
    this.lookX = 0;
    this.lookY = 0;
    this.zoom = 0;
    return r;
  }

  endFrame() {
    this.hit.clear();
  }

  clearActions() {
    this.actions.clear();
  }
}
