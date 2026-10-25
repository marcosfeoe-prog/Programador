// Camada de interface em baixa resolução (desenhada pixel a pixel, sem girar com a câmera).
import { rgba } from './util.js';
import { drawText, textWidth, LINE_H } from './font.js';

export const C = {
  white: rgba(236, 232, 214),
  dim: rgba(150, 144, 120),
  dark: rgba(80, 76, 64),
  yellow: rgba(236, 208, 96),
  orange: rgba(232, 150, 60),
  red: rgba(220, 52, 40),
  green: rgba(110, 210, 120),
  cyan: rgba(90, 220, 230),
  shadow: rgba(0, 0, 0, 200),
  panel: rgba(0, 0, 0, 150),
  black: rgba(0, 0, 0),
};

const GLITCH = '#%*?!/<>=+_[]';

export class Hud {
  constructor(W, H, buffer) {
    this.W = W;
    this.H = H;
    this.data = new Uint32Array(buffer);
    this.buf = { w: W, h: H, data: this.data };
    this.glitch = 0;
  }
  clear() { this.data.fill(0); }
  fill(col) { this.data.fill(col); }
  rect(x, y, w, h, col) {
    x = Math.round(x); y = Math.round(y);
    for (let j = Math.max(0, y); j < Math.min(this.H, y + h); j++)
      for (let i = Math.max(0, x); i < Math.min(this.W, x + w); i++) this.data[j * this.W + i] = col;
  }
  frame(x, y, w, h, col) {
    this.rect(x, y, w, 1, col); this.rect(x, y + h - 1, w, 1, col);
    this.rect(x, y, 1, h, col); this.rect(x + w - 1, y, 1, h, col);
  }
  ring(cx, cy, r, col) {
    for (let a = 0; a < 64; a++) {
      const x = Math.round(cx + Math.cos((a / 64) * Math.PI * 2) * r), y = Math.round(cy + Math.sin((a / 64) * Math.PI * 2) * r);
      if (x >= 0 && y >= 0 && x < this.W && y < this.H) this.data[y * this.W + x] = col;
    }
  }
  // Texto com sombra; com sanidade baixa as letras se embaralham.
  text(str, x, y, col = C.white, s = 1, align = 'left', shadow = C.shadow) {
    str = String(str);
    if (this.glitch > 0) {
      let out = '';
      for (const ch of str) out += ch !== ' ' && Math.random() < this.glitch * 0.08 ? GLITCH[(Math.random() * GLITCH.length) | 0] : ch;
      str = out;
    }
    drawText(this.buf, str, x, y, col, s, shadow, align);
  }
  width(str, s = 1) { return textWidth(str, s); }
  get lineH() { return LINE_H; }

  bar(x, y, w, h, v, col, back = C.panel) {
    this.rect(x - 1, y - 1, w + 2, h + 2, back);
    this.rect(x, y, Math.round(w * Math.max(0, Math.min(1, v))), h, col);
  }
}
