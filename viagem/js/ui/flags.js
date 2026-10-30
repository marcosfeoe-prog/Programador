// Bandeiras desenhadas em canvas (sem emoji: funcionam em qualquer aparelho).
export function drawFlag(ctx, id, x, y, w, h) {
  ctx.save();
  ctx.translate(x, y);
  const r = (c, a, b, cw, ch) => {
    ctx.fillStyle = c;
    ctx.fillRect(a, b, cw, ch);
  };
  switch (id) {
    case 'no': {
      r('#ba0c2f', 0, 0, w, h);
      const u = h / 16;
      r('#fff', w * 0.3125 - 2 * u, 0, 4 * u, h);
      r('#fff', 0, h / 2 - 2 * u, w, 4 * u);
      r('#00205b', w * 0.3125 - u, 0, 2 * u, h);
      r('#00205b', 0, h / 2 - u, w, 2 * u);
      break;
    }
    case 'ch': {
      // a suíça é quadrada: centraliza
      r('#da291c', 0, 0, w, h);
      const s = h * 0.62;
      const a = s / 5;
      r('#fff', w / 2 - a / 2 - 0.5, h / 2 - s / 2, a + 1, s);
      r('#fff', w / 2 - s / 2, h / 2 - a / 2 - 0.5, s, a + 1);
      break;
    }
    case 'jp':
      r('#fff', 0, 0, w, h);
      ctx.fillStyle = '#bc002d';
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, h * 0.3, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'mx':
      r('#006847', 0, 0, w / 3, h);
      r('#fff', w / 3, 0, w / 3 + 0.5, h);
      r('#ce1126', (2 * w) / 3, 0, w / 3, h);
      ctx.fillStyle = '#8c5a2b';
      ctx.beginPath();
      ctx.ellipse(w / 2, h / 2, w * 0.07, h * 0.15, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#2f7d32';
      ctx.lineWidth = Math.max(1, h * 0.04);
      ctx.beginPath();
      ctx.arc(w / 2, h / 2 + h * 0.04, h * 0.17, 0.2, Math.PI - 0.2);
      ctx.stroke();
      break;
    case 'it':
      r('#008c45', 0, 0, w / 3, h);
      r('#f4f5f0', w / 3, 0, w / 3 + 0.5, h);
      r('#cd212a', (2 * w) / 3, 0, w / 3, h);
      break;
    case 'br': {
      r('#009c3b', 0, 0, w, h);
      ctx.fillStyle = '#ffdf00';
      ctx.beginPath();
      ctx.moveTo(w * 0.085, h / 2);
      ctx.lineTo(w / 2, h * 0.085);
      ctx.lineTo(w * 0.915, h / 2);
      ctx.lineTo(w / 2, h * 0.915);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#002776';
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, h * 0.25, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = Math.max(1, h * 0.035);
      ctx.beginPath();
      ctx.arc(w / 2 - h * 0.05, h * 0.95, h * 0.55, -Math.PI * 0.62, -Math.PI * 0.33);
      ctx.stroke();
      break;
    }
  }
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
  ctx.restore();
}

export function flagCanvas(id, w = 48, h = 32) {
  const c = document.createElement('canvas');
  c.width = w * 2;
  c.height = h * 2;
  c.style.width = w + 'px';
  c.style.height = h + 'px';
  drawFlag(c.getContext('2d'), id, 0, 0, w * 2, h * 2);
  return c;
}
