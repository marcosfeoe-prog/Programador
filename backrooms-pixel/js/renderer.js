// Raycaster com texturas, chão/teto projetados, mapa de luz, lanterna,
// sprites com profundidade e pós-processamento pixelado (pontilhado Bayer).
import { wrap, wdelta, clamp } from './util.js';
import { LM_Q } from './levels.js';

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const PLANE = 0.72;

export class Renderer {
  constructor(W, H) {
    this.W = W;
    this.H = H;
    this.f = W / 2 / PLANE;
    this.rgb = new Float32Array(W * H * 3);
    this.zbuf = new Float32Array(W);
    // tabela de quantização com pontilhado: 8 níveis por canal
    const step = 255 / 7;
    this.dlut = new Uint8Array(16 * 256);
    for (let b = 0; b < 16; b++)
      for (let v = 0; v < 256; v++) {
        const q = Math.round((v + ((b + 0.5) / 16 - 0.5) * step) / step) * step;
        this.dlut[b * 256 + v] = clamp(Math.round(q), 0, 255);
      }
    this.vig = new Float32Array(W * H);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const dx = (x - W / 2) / (W / 2), dy = (y - H / 2) / (H / 2);
        this.vig[y * W + x] = clamp(dx * dx * 0.55 + dy * dy * 0.75, 0, 1.4);
      }
    this.seed = 12345;
  }

  rand() {
    let s = this.seed;
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    this.seed = s;
    return (s >>> 0) / 4294967296;
  }

  // v: { x, y, a, pitch, eyeZ, power, flash: {on, pow, x, y}, time }
  render(L, v, sprites) {
    const { W, H, f, rgb, zbuf } = this;
    const S = L.S, grid = L.grid, lm = L.lm, owner = L.owner, lights = L.lights, decal = L.decal, lampAt = L.lampAt;
    const M = S * LM_Q;
    const amb = L.ambient, lc = L.lampColor, fogC = L.fog, fogD = L.fogDensity, maxD = L.maxDist;
    const power = v.power;
    const tex = L.tex;
    const exitTex = tex.exit[Math.floor(v.time * 14) % tex.exit.length];
    const floorT = tex.floor, ceilT = tex.ceil, lampT = tex.lamp;
    const px = v.x, py = v.y;
    const dirX = Math.cos(v.a), dirY = Math.sin(v.a);
    const planeX = -dirY * PLANE, planeY = dirX * PLANE;
    const horizon = H / 2 + v.pitch;
    const eyeZ = v.eyeZ;
    const fl = v.flash;
    const flPow = fl.on ? fl.pow : 0;
    const flX = fl.x, flY = fl.y, invR = 1 / (W * 0.5);
    const fr = 1.0, fg = 0.93, fb = 0.78;

    const lightAt = (wx, wy) => {
      let ix = Math.floor(wx * LM_Q) % M; if (ix < 0) ix += M;
      let iy = Math.floor(wy * LM_Q) % M; if (iy < 0) iy += M;
      const i = iy * M + ix, o = owner[i];
      return o < 0 ? 0 : lm[i] * lights[o].cur * power;
    };
    const flashAt = (x, y, d) => {
      if (flPow <= 0) return 0;
      const dx = x - flX, dy = y - flY;
      const r = Math.sqrt(dx * dx + dy * dy) * invR;
      let spot = (0.45 - r) / 0.27;
      spot = spot <= 0 ? 0 : spot >= 1 ? 1 : spot * spot;
      const spill = r < 1.15 ? (1 - r / 1.15) * 0.26 : 0;
      return (flPow * (spot * 1.3 + spill)) / (1 + d * d * 0.045);
    };

    const write = (i, tr, tg, tb, e, lv, flv, d) => {
      let r = tr * (amb[0] + lc[0] * lv + fr * flv) + e * lc[0];
      let g = tg * (amb[1] + lc[1] * lv + fg * flv) + e * lc[1];
      let b = tb * (amb[2] + lc[2] * lv + fb * flv) + e * lc[2];
      const fo = d >= maxD ? 1 : 1 - Math.exp(-d * fogD);
      const k = i * 3;
      rgb[k] = r + (fogC[0] - r) * fo;
      rgb[k + 1] = g + (fogC[1] - g) * fo;
      rgb[k + 2] = b + (fogC[2] - b) * fo;
    };

    for (let x = 0; x < W; x++) {
      const camX = (2 * x) / W - 1;
      const rdx = dirX + planeX * camX, rdy = dirY + planeY * camX;
      let mapX = Math.floor(px), mapY = Math.floor(py);
      const ddx = Math.abs(1 / rdx), ddy = Math.abs(1 / rdy);
      let stepX, stepY, sdx, sdy;
      if (rdx < 0) { stepX = -1; sdx = (px - mapX) * ddx; } else { stepX = 1; sdx = (mapX + 1 - px) * ddx; }
      if (rdy < 0) { stepY = -1; sdy = (py - mapY) * ddy; } else { stepY = 1; sdy = (mapY + 1 - py) * ddy; }
      let side = 0, tile = 0, perp = maxD;
      for (let n = 0; n < 64; n++) {
        if (sdx < sdy) { sdx += ddx; mapX += stepX; side = 0; } else { sdy += ddy; mapY += stepY; side = 1; }
        const t = grid[wrap(mapY, S) * S + wrap(mapX, S)];
        if (t) { tile = t; break; }
        if (Math.min(sdx, sdy) > maxD) break;
      }
      if (tile) perp = side === 0 ? sdx - ddx : sdy - ddy;
      if (perp < 0.0001) perp = 0.0001;
      zbuf[x] = perp;

      const top = horizon - ((1 - eyeZ) * f) / perp;
      const bot = horizon + (eyeZ * f) / perp;
      const yTop = Math.max(0, Math.ceil(top)), yBot = Math.min(H, Math.ceil(bot));

      // parede
      if (tile && perp < maxD) {
        const T = tile === 9 ? exitTex : tex.walls[tile] || tex.walls[1];
        let wallX = side === 0 ? py + perp * rdy : px + perp * rdx;
        wallX -= Math.floor(wallX);
        let tx = Math.floor(wallX * T.w);
        if ((side === 0 && rdx > 0) || (side === 1 && rdy < 0)) tx = T.w - tx - 1;
        const hx = px + rdx * perp, hy = py + rdy * perp;
        const lv0 = lightAt(side === 0 ? hx - stepX * 0.08 : hx, side === 1 ? hy - stepY * 0.08 : hy);
        const shade = side === 1 ? 0.8 : 1;
        const span = bot - top;
        for (let y = yTop; y < yBot; y++) {
          const vv = (y + 0.5 - top) / span;
          const ty = Math.min(T.h - 1, Math.floor(vv * T.h));
          const ti = ty * T.w + tx;
          const c = T.data[ti];
          const lv = lv0 * (0.62 + 0.55 * (1 - vv)) * shade;
          const e = T.em[ti] * (tile === 9 ? 1 : power) * 0.004;
          write(y * W + x, (c & 255) * shade, ((c >> 8) & 255) * shade, ((c >> 16) & 255) * shade, e * 255, lv, flashAt(x, y, perp) * shade, perp);
        }
      } else if (perp >= maxD) {
        for (let y = yTop; y < yBot; y++) { const k = (y * W + x) * 3; rgb[k] = fogC[0]; rgb[k + 1] = fogC[1]; rgb[k + 2] = fogC[2]; }
      }

      // chão
      for (let y = yBot; y < H; y++) {
        const rd = (eyeZ * f) / (y + 0.5 - horizon);
        if (rd > maxD || rd <= 0) { const k = (y * W + x) * 3; rgb[k] = fogC[0]; rgb[k + 1] = fogC[1]; rgb[k + 2] = fogC[2]; continue; }
        const wx = px + rdx * rd, wy = py + rdy * rd;
        const cx = Math.floor(wx), cy = Math.floor(wy);
        const tx = Math.floor((wx - cx) * 32), ty = Math.floor((wy - cy) * 32);
        const ti = ty * 32 + tx;
        let c = floorT.data[ti], e = 0;
        const dc = decal[wrap(cy, S) * S + wrap(cx, S)];
        if (dc) {
          const D = tex.decals[dc];
          if (D) { const dd = D.data[ti]; if (dd >>> 24) { c = dd; e = D.em[ti]; } }
        }
        write(y * W + x, c & 255, (c >> 8) & 255, (c >> 16) & 255, e * 0.004 * 255 * 0.3, lightAt(wx, wy), flashAt(x, y, rd), rd);
      }

      // teto
      for (let y = 0; y < yTop; y++) {
        const rd = ((1 - eyeZ) * f) / (horizon - y - 0.5);
        if (rd > maxD || rd <= 0) { const k = (y * W + x) * 3; rgb[k] = fogC[0]; rgb[k + 1] = fogC[1]; rgb[k + 2] = fogC[2]; continue; }
        const wx = px + rdx * rd, wy = py + rdy * rd;
        const cx = Math.floor(wx), cy = Math.floor(wy);
        const tx = Math.floor((wx - cx) * 32), ty = Math.floor((wy - cy) * 32);
        const ti = ty * 32 + tx;
        const li = lampAt[wrap(cy, S) * S + wrap(cx, S)];
        let c, e = 0;
        if (li >= 0) {
          c = lampT.data[ti];
          e = lampT.em[ti] * lights[li].cur * power * 0.004 * 255;
        } else c = ceilT.data[ti];
        write(y * W + x, c & 255, (c >> 8) & 255, (c >> 16) & 255, e, lightAt(wx, wy) * 0.8, flashAt(x, y, rd) * 0.8, rd);
      }
    }

    this.drawSprites(L, v, sprites, { dirX, dirY, planeX, planeY, horizon, eyeZ, lightAt, flashAt });
  }

  // sprite: { x, y, z, w, h, tex, alpha, glow, ghost }
  drawSprites(L, v, list, c) {
    const { W, H, f, rgb, zbuf } = this;
    const S = L.S, amb = L.ambient, lc = L.lampColor, fogC = L.fog, fogD = L.fogDensity;
    const invDet = 1 / (c.planeX * c.dirY - c.dirX * c.planeY);
    const vis = [];
    for (const s of list) {
      const dx = wdelta(s.x - v.x, S), dy = wdelta(s.y - v.y, S);
      const tX = invDet * (c.dirY * dx - c.dirX * dy);
      const tY = invDet * (-c.planeY * dx + c.planeX * dy);
      if (tY < 0.12 || tY > L.maxDist) continue;
      vis.push({ s, tX, tY });
    }
    vis.sort((a, b) => b.tY - a.tY);
    for (const { s, tX, tY } of vis) {
      const T = s.tex;
      const sx = (W / 2) * (1 + tX / tY);
      const sh = (s.h * f) / tY, sw = (s.w * f) / tY;
      const bot = c.horizon + ((c.eyeZ - s.z) * f) / tY;
      const top = bot - sh;
      const x0 = sx - sw / 2;
      const xa = Math.max(0, Math.floor(x0)), xb = Math.min(W, Math.ceil(x0 + sw));
      const ya = Math.max(0, Math.floor(top)), yb = Math.min(H, Math.ceil(bot));
      if (xa >= xb || ya >= yb) continue;
      const lv = s.ghost ? 0.2 : c.lightAt(s.x, s.y);
      const fo = 1 - Math.exp(-tY * fogD);
      const alpha = s.alpha ?? 1;
      for (let x = xa; x < xb; x++) {
        if (tY >= zbuf[x]) continue;
        const tx = Math.min(T.w - 1, Math.floor(((x + 0.5 - x0) / sw) * T.w));
        for (let y = ya; y < yb; y++) {
          const ty = Math.min(T.h - 1, Math.floor(((y + 0.5 - top) / sh) * T.h));
          const ti = ty * T.w + tx;
          const col = T.data[ti];
          let a = (col >>> 24) / 255;
          if (a === 0) continue;
          a *= alpha;
          const flv = s.ghost ? 0 : c.flashAt(x, y, tY);
          const e = T.em[ti] / 255;
          const lr = amb[0] + lc[0] * lv + flv + (s.glow || 0);
          const lg = amb[1] + lc[1] * lv + flv * 0.93 + (s.glow || 0);
          const lb = amb[2] + lc[2] * lv + flv * 0.78 + (s.glow || 0);
          let r = (col & 255) * lr + e * 255;
          let g = ((col >> 8) & 255) * lg + e * 255;
          let b = ((col >> 16) & 255) * lb + e * 255;
          const fe = e > 0.5 ? fo * 0.3 : fo;
          r += (fogC[0] - r) * fe; g += (fogC[1] - g) * fe; b += (fogC[2] - b) * fe;
          const k = (y * W + x) * 3;
          rgb[k] += (r - rgb[k]) * a;
          rgb[k + 1] += (g - rgb[k + 1]) * a;
          rgb[k + 2] += (b - rgb[k + 2]) * a;
        }
      }
    }
  }

  // Desenha uma textura em espaço de tela (mão, susto).
  overlay(T, x0, y0, scale, light, emMul = 1, alpha = 1) {
    const { W, H, rgb } = this;
    const w = T.w * scale, h = T.h * scale;
    const xa = Math.max(0, Math.floor(x0)), xb = Math.min(W, Math.ceil(x0 + w));
    const ya = Math.max(0, Math.floor(y0)), yb = Math.min(H, Math.ceil(y0 + h));
    for (let y = ya; y < yb; y++) {
      const ty = Math.min(T.h - 1, Math.floor((y - y0) / scale));
      for (let x = xa; x < xb; x++) {
        const tx = Math.min(T.w - 1, Math.floor((x - x0) / scale));
        const ti = ty * T.w + tx, col = T.data[ti];
        const a = ((col >>> 24) / 255) * alpha;
        if (!a) continue;
        const e = (T.em[ti] / 255) * emMul * 255;
        const k = (y * W + x) * 3;
        rgb[k] += ((col & 255) * light[0] + e - rgb[k]) * a;
        rgb[k + 1] += (((col >> 8) & 255) * light[1] + e - rgb[k + 1]) * a;
        rgb[k + 2] += (((col >> 16) & 255) * light[2] + e - rgb[k + 2]) * a;
      }
    }
  }

  addPixel(x, y, r, g, b) {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= this.W || y >= this.H) return;
    const k = (y * this.W + x) * 3;
    this.rgb[k] += r; this.rgb[k + 1] += g; this.rgb[k + 2] += b;
  }

  fillRGB(r, g, b) {
    const rgb = this.rgb;
    for (let i = 0; i < rgb.length; i += 3) { rgb[i] = r; rgb[i + 1] = g; rgb[i + 2] = b; }
  }

  // fx: { wave, ca, desat, vig, grain, fade, tint, time, stat, flashW, red }
  post(out, fx) {
    const { W, H, rgb, dlut, vig } = this;
    const t = fx.time;
    const tint = fx.tint || [1, 1, 1];
    const fade = fx.fade ?? 1;
    const ca = Math.round(fx.ca || 0);
    for (let y = 0; y < H; y++) {
      let off = 0;
      if (fx.wave) off = Math.sin(y * 0.19 + t * 4.2) * fx.wave + Math.sin(y * 0.047 - t * 1.3) * fx.wave * 0.7;
      if (fx.stat && this.rand() < fx.stat * 0.25) off += (this.rand() - 0.5) * 40 * fx.stat;
      off = Math.round(off);
      for (let x = 0; x < W; x++) {
        const sx = clamp(x + off, 0, W - 1);
        const row = y * W;
        let r = rgb[(row + clamp(sx + ca, 0, W - 1)) * 3];
        let g = rgb[(row + sx) * 3 + 1];
        let b = rgb[(row + clamp(sx - ca, 0, W - 1)) * 3 + 2];
        if (fx.desat) {
          const l = r * 0.3 + g * 0.59 + b * 0.11;
          r += (l - r) * fx.desat; g += (l - g) * fx.desat; b += (l - b) * fx.desat;
        }
        r *= tint[0]; g *= tint[1]; b *= tint[2];
        const vm = 1 - vig[row + x] * fx.vig;
        r *= vm; g *= vm; b *= vm;
        if (fx.red) { const rv = vig[row + x] * fx.red; r += 90 * rv; g -= 20 * rv; b -= 20 * rv; }
        if (fx.grain) { const n = (this.rand() - 0.5) * fx.grain; r += n; g += n; b += n; }
        if (fx.stat) {
          const s = this.rand() * 255;
          r += (s - r) * fx.stat; g += (s - g) * fx.stat; b += (s - b) * fx.stat;
        }
        if (fx.flashW) { r += (255 - r) * fx.flashW; g += (255 - g) * fx.flashW; b += (255 - b) * fx.flashW; }
        r *= fade; g *= fade; b *= fade;
        const bi = BAYER[((y & 3) << 2) | (x & 3)] << 8;
        const o = (row + x) * 4;
        out[o] = dlut[bi + (r < 0 ? 0 : r > 255 ? 255 : r | 0)];
        out[o + 1] = dlut[bi + (g < 0 ? 0 : g > 255 ? 255 : g | 0)];
        out[o + 2] = dlut[bi + (b < 0 ? 0 : b > 255 ? 255 : b | 0)];
        out[o + 3] = 255;
      }
    }
  }
}
