// Teclado, controle (gamepad) e botões de toque.
export class Input {
  constructor() {
    this.keys = new Set();
    this.pressed = new Set();
    this.touch = { left: false, right: false, gas: false, brake: false, hand: false };
    this.steerSmooth = 0;
    addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
  }

  bindTouch(root) {
    root.querySelectorAll('[data-touch]').forEach((el) => {
      const k = el.dataset.touch;
      const on = (e) => {
        e.preventDefault();
        this.touch[k] = true;
        el.classList.add('on');
      };
      const off = (e) => {
        e.preventDefault();
        this.touch[k] = false;
        el.classList.remove('on');
      };
      el.addEventListener('pointerdown', on);
      el.addEventListener('pointerup', off);
      el.addEventListener('pointercancel', off);
      el.addEventListener('pointerleave', off);
    });
  }

  // consome teclas "apertadas neste quadro"
  take(code) {
    const had = this.pressed.has(code);
    this.pressed.delete(code);
    return had;
  }
  endFrame() {
    this.pressed.clear();
  }

  controls() {
    const k = this.keys;
    let throttle = k.has('ArrowUp') || k.has('KeyW') || this.touch.gas ? 1 : 0;
    let brake = k.has('ArrowDown') || k.has('KeyS') || this.touch.brake ? 1 : 0;
    let steer = 0;
    if (k.has('ArrowLeft') || k.has('KeyA') || this.touch.left) steer -= 1;
    if (k.has('ArrowRight') || k.has('KeyD') || this.touch.right) steer += 1;
    let handbrake = k.has('Space') || this.touch.hand;
    let analog = false;
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (!p) continue;
      const ax = p.axes[0] || 0;
      if (Math.abs(ax) > 0.12) {
        steer = Math.sign(ax) * ((Math.abs(ax) - 0.12) / 0.88);
        analog = true;
      }
      const rt = p.buttons[7] ? p.buttons[7].value : 0;
      const lt = p.buttons[6] ? p.buttons[6].value : 0;
      throttle = Math.max(throttle, rt, p.buttons[0] && p.buttons[0].pressed ? 1 : 0);
      brake = Math.max(brake, lt, p.buttons[2] && p.buttons[2].pressed ? 1 : 0);
      handbrake = handbrake || (p.buttons[1] && p.buttons[1].pressed);
    }
    return { throttle, brake, steer, handbrake, analog };
  }
}
