// Interface: HUD de sobrevivência, alvo, dicas, avisos, minimapa e mapa grande.
import { clamp } from './util.js';
import { HALF } from './world.js';

const $ = (id) => document.getElementById(id);

export class HUD {
  constructor(game) {
    this.game = game;
    this.el = $('hud');
    this.stats = {
      hp: $('st-hp'),
      food: $('st-food'),
      water: $('st-water'),
      stam: $('st-stam'),
    };
    this.vig = $('vignette');
    this.hurt = 0;
    this.mini = $('minimap').getContext('2d');
    this.big = $('bigmap-c').getContext('2d');
    this.mapImg = null;
    this.t = 0;
    this.lastChips = '';
  }

  show(on) {
    this.el.classList.toggle('hidden', !on);
  }

  toggleHidden() {
    this.el.classList.toggle('off');
  }

  toast(text, kind = '') {
    const box = $('toasts');
    // evita repetir a mesma mensagem em sequência
    if (box.lastElementChild && box.lastElementChild.textContent === text) return;
    const d = document.createElement('div');
    d.className = 'toast ' + kind;
    d.textContent = text;
    box.appendChild(d);
    while (box.children.length > 4) box.firstChild.remove();
    setTimeout(() => d.remove(), 4000);
  }

  flash(amount) {
    this.hurt = Math.min(1, this.hurt + amount);
  }

  setBar(el, v, max = 100) {
    const p = clamp(v / max, 0, 1);
    el.querySelector('i').style.width = (p * 100).toFixed(1) + '%';
    el.querySelector('b').textContent = Math.round(p * 100);
    el.classList.toggle('low', p < 0.2);
  }

  // imagem do terreno para o mapa (gerada uma vez)
  buildMap(world) {
    const S = 256;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(S, S);
    for (let j = 0; j < S; j++)
      for (let i = 0; i < S; i++) {
        const x = -HALF + ((i + 0.5) / S) * HALF * 2;
        const z = -HALF + ((j + 0.5) / S) * HALF * 2;
        const h = world.height(x, z);
        const sl = world.slope(x, z);
        let r;
        let g;
        let b;
        if (h < 0) {
          const d = clamp(-h / 5, 0, 1);
          r = 40 - 20 * d;
          g = 100 - 40 * d;
          b = 130 - 30 * d;
        } else if (h < 1.4) {
          r = 180;
          g = 165;
          b = 120;
        } else if (sl > 0.6 || h > 32) {
          const k = clamp(h / 70, 0.4, 1);
          r = 120 * k + 40;
          g = 115 * k + 35;
          b = 105 * k + 30;
        } else {
          const k = 0.75 + h / 60;
          r = 70 * k;
          g = 105 * k;
          b = 50 * k;
        }
        // relevo sombreado
        const sh = clamp(1 + (world.height(x - 4, z - 4) - h) * 0.06, 0.7, 1.25);
        const o = (j * S + i) * 4;
        img.data[o] = r * sh;
        img.data[o + 1] = g * sh;
        img.data[o + 2] = b * sh;
        img.data[o + 3] = 255;
      }
    ctx.putImageData(img, 0, 0);
    this.mapImg = c;
  }

  drawMap(ctx, size, cx, cz, range, round) {
    const g = this.game;
    ctx.save();
    ctx.clearRect(0, 0, size, size);
    if (round) {
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
      ctx.clip();
    }
    const k = size / (range * 2);
    const toPx = (x, z) => [(x - cx) * k + size / 2, (z - cz) * k + size / 2];
    if (this.mapImg) {
      const S = this.mapImg.width;
      const m = S / (HALF * 2);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(this.mapImg, (cx - range + HALF) * m, (cz - range + HALF) * m, range * 2 * m, range * 2 * m, 0, 0, size, size);
    }
    const p = g.player;
    for (const c of g.creatures) {
      if (c === p) continue;
      const [x, y] = toPx(c.pos.x, c.pos.z);
      if (x < -5 || y < -5 || x > size + 5 || y > size + 5) continue;
      // no minimapa só aparecem animais próximos (o "faro" do jogador)
      if (round && p && c.pos.distanceTo(p.pos) > range * 0.95) continue;
      ctx.fillStyle = c.dead ? '#8a7a6a' : c.spec.diet === 'carnivoro' ? '#ff4a3a' : '#9aff6a';
      const r = c.dead ? 2 : 2 + c.scale * (c.spec.id === 'brachio' ? 3.5 : 2);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    if (p) {
      const [x, y] = toPx(p.pos.x, p.pos.z);
      ctx.translate(x, y);
      // yaw: 0 = +z (para baixo no mapa)
      ctx.rotate(-p.yaw);
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, 8);
      ctx.lineTo(5, -5);
      ctx.lineTo(0, -2);
      ctx.lineTo(-5, -5);
      ctx.closePath();
      ctx.stroke();
      ctx.fill();
    }
    ctx.restore();
  }

  update(dt) {
    const g = this.game;
    const c = g.player;
    this.t += dt;
    this.hurt = Math.max(0, this.hurt - dt * 0.9);
    const lowHp = c && !c.dead ? clamp(1 - c.hp / c.maxHp / 0.3, 0, 1) * (0.35 + 0.15 * Math.sin(this.t * 5)) : 0;
    this.vig.style.opacity = Math.max(this.hurt, lowHp).toFixed(2);
    if (!c) return;
    $('sp-name').textContent = c.spec.name;
    $('sp-stage').textContent = `${c.stage} · ${Math.round(c.growth * 100)}% · ${(c.L.length * c.scale).toFixed(1)} m`;
    $('grow-fill').style.width = (c.growth * 100).toFixed(1) + '%';
    const w = g.world;
    $('clock-time').textContent = w.timeString();
    $('clock-day').textContent = 'Dia ' + w.day;
    $('clock-icon').textContent = w.isNight ? '☾' : '☀';
    this.setBar(this.stats.hp, c.hp, c.maxHp);
    this.setBar(this.stats.food, c.hunger);
    this.setBar(this.stats.water, c.thirst);
    this.setBar(this.stats.stam, c.stamina);

    const chips = [];
    if (c.bleed > 0.3) chips.push(['Sangrando', 'bad']);
    if (c.hunger <= 0) chips.push(['Faminto', 'bad']);
    else if (c.hunger < 20) chips.push(['Com fome', 'bad']);
    if (c.thirst <= 0) chips.push(['Desidratado', 'bad']);
    else if (c.thirst < 20) chips.push(['Com sede', 'bad']);
    if (c.exhausted) chips.push(['Exausto', 'bad']);
    if (c.resting) chips.push(['Descansando', 'good']);
    if (c.swim) chips.push(['Nadando', '']);
    if (c.growth < 1 && c.hunger > 40 && c.thirst > 40) chips.push(['Crescendo', 'good']);
    const key = chips.map((x) => x.join()).join('|');
    if (key !== this.lastChips) {
      this.lastChips = key;
      $('chips').innerHTML = chips.map(([t, k]) => `<span class="chip ${k}">${t}</span>`).join('');
    }

    // dica de interação
    const h = g.controller.interactHint();
    const he = $('hint');
    if (h && !c.dead) {
      he.classList.remove('hidden');
      he.classList.toggle('active', !!h.active);
      he.querySelector('kbd').textContent = g.settings.mobile ? '🍖' : h.key;
      he.querySelector('span').textContent = h.text;
    } else he.classList.add('hidden');

    // alvo: criatura mais próxima à frente
    this.updateTarget(c);

    // minimapa (a ~10 Hz)
    this.mapT = (this.mapT || 0) - dt;
    if (this.mapT <= 0) {
      this.mapT = 0.1;
      this.drawMap(this.mini, 180, c.pos.x, c.pos.z, 110, true);
      if (!$('bigmap').classList.contains('hidden')) this.drawMap(this.big, 640, 0, 0, HALF, false);
    }
  }

  updateTarget(c) {
    const g = this.game;
    const f = c.forward;
    let best = null;
    let bs = 0;
    for (const o of g.creatures) {
      if (o === c) continue;
      const dx = o.pos.x - c.pos.x;
      const dz = o.pos.z - c.pos.z;
      const d = Math.hypot(dx, dz);
      const range = 14 + o.radius * 3 + c.radius * 3;
      if (d > range) continue;
      const dot = (dx * f.x + dz * f.z) / (d || 1);
      const s = (dot + 0.6) / (d + 2);
      if (dot > -0.2 && s > bs) {
        bs = s;
        best = o;
      }
    }
    const el = $('target');
    if (!best) {
      el.classList.add('hidden');
      return;
    }
    el.classList.remove('hidden');
    el.classList.toggle('carcass', best.dead);
    $('tg-name').textContent = best.dead ? `Carcaça de ${best.spec.short}` : best.spec.name;
    if (best.dead) {
      $('tg-sub').textContent = best.meat > 0 ? `Carne: ${Math.round((best.meat / best.maxMeat) * 100)}%` : 'Só ossos';
      $('tg-fill').style.width = ((best.meat / (best.maxMeat || 1)) * 100).toFixed(0) + '%';
    } else {
      const rel = best.power / (c.power + 1);
      const danger = best.spec.diet === 'carnivoro' ? (rel > 1.3 ? ' · PERIGO' : rel > 0.7 ? ' · rival' : '') : rel > 2 ? ' · muito forte' : '';
      $('tg-sub').textContent = `${best.stage} · ${best.spec.diet === 'carnivoro' ? 'carnívoro' : 'herbívoro'}${danger}`;
      $('tg-fill').style.width = ((best.hp / best.maxHp) * 100).toFixed(0) + '%';
    }
  }
}
