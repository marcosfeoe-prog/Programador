// Interface: menu de espécies, HUD de sobrevivência, bússola, minimapa,
// mapa grande, mensagens, alvo e telas de pausa/morte/configurações.
import { SPECIES, SPECIES_ORDER, growthStage } from './species.js';
import { clamp, lerp, smoothstep, TAU } from './util.js';
import { PLAY_RADIUS, WATER_Y } from './world.js';

const $ = (id) => document.getElementById(id);

export class UI {
  constructor(game) {
    this.game = game;
    this.selected = 'trex';
    this.feedEl = $('feed');
    this.bars = {
      health: $('b-health'),
      hunger: $('b-hunger'),
      thirst: $('b-thirst'),
      stamina: $('b-stamina'),
      growth: $('b-growth'),
    };
    this.vig = 0;
    this.hudVisible = true;
    this.buildCompass();
  }

  // ------------------------------------------------------------ menu
  buildMenu(onSelect) {
    const list = $('species-list');
    list.innerHTML = '';
    for (const id of SPECIES_ORDER) {
      const s = SPECIES[id];
      const b = document.createElement('button');
      b.className = 'sp-item';
      b.dataset.id = id;
      b.innerHTML = `<span><div class="n">${s.name}</div><div class="d">${s.diet === 'carnivore' ? 'Carnívoro' : 'Herbívoro'} · ${s.quadruped ? 'quadrúpede' : 'bípede'}</div></span><span>${s.diet === 'carnivore' ? '🦷' : '🌿'}</span>`;
      b.addEventListener('click', () => {
        this.select(id);
        onSelect(id);
      });
      list.appendChild(b);
    }
    this.select(this.selected);
  }

  select(id) {
    this.selected = id;
    document.querySelectorAll('.sp-item').forEach((el) => el.classList.toggle('sel', el.dataset.id === id));
    const s = SPECIES[id];
    $('sp-name').textContent = s.name;
    $('sp-sci').textContent = s.sci;
    const diet = $('sp-diet');
    diet.textContent = s.diet === 'carnivore' ? 'Carnívoro' : 'Herbívoro';
    diet.className = 'diet ' + s.diet;
    $('sp-desc').textContent = s.desc;
    const st = s.stats;
    const rows = [
      ['Vida', st.health / 1200],
      ['Ataque', st.attack / 150],
      ['Velocidade', st.run / 13.5],
      ['Agilidade', st.turn / 3.6],
      ['Tamanho', s.sizeClass / 5],
    ];
    $('sp-stats').innerHTML = rows
      .map(([n, v]) => `<div class="stat"><span>${n}</span><div class="bar"><div class="fill growth" style="width:${Math.round(clamp(v, 0.04, 1) * 100)}%"></div></div></div>`)
      .join('');
    const rec = this.game.records[id];
    $('sp-record').textContent = rec ? `Recorde: ${rec.days.toFixed(1)} dias · ${growthStage(rec.growth)} · ${rec.kills} abates` : 'Ainda sem recorde com esta espécie.';
  }

  show(id, on = true) {
    $(id).classList.toggle('hidden', !on);
  }

  // ------------------------------------------------------------ HUD
  message(text, ttl = 4) {
    const el = document.createElement('div');
    el.textContent = text;
    this.feedEl.prepend(el);
    while (this.feedEl.children.length > 5) this.feedEl.lastChild.remove();
    setTimeout(() => {
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 700);
    }, ttl * 1000);
  }

  flash(amount) {
    this.vig = Math.min(1, this.vig + amount);
  }

  buildCompass() {
    const strip = $('compass-strip');
    const dirs = ['N', '·', 'NE', '·', 'L', '·', 'SE', '·', 'S', '·', 'SO', '·', 'O', '·', 'NO', '·'];
    let html = '';
    for (let k = 0; k < 3; k++) for (const d of dirs) html += `<span class="${d.length && d !== '·' && d.length === 1 ? 'c' : ''}">${d}</span>`;
    strip.innerHTML = html;
    this.compassUnit = 50;
  }

  updateHUD(dt, c, player) {
    const g = this.game;
    const set = (el, v) => {
      el.style.width = `${Math.round(clamp(v, 0, 1) * 1000) / 10}%`;
      el.classList.toggle('low', v < 0.2);
    };
    set(this.bars.health, c.health / c.maxHealth);
    set(this.bars.hunger, c.hunger);
    set(this.bars.thirst, c.thirst);
    set(this.bars.stamina, c.stamina);
    this.bars.growth.style.width = `${c.growth * 100}%`;
    $('growth-pct').textContent = `${Math.floor(c.growth * 100)}%`;
    $('hud-name').textContent = c.spec.name;
    $('hud-stage').textContent = growthStage(c.growth);

    const icons = [];
    if (c.bleed > 0.05) icons.push(['🩸 Sangrando', true]);
    if (c.exhausted) icons.push(['Exausto', true]);
    if (c.hunger <= 0) icons.push(['Faminto', true]);
    if (c.thirst <= 0) icons.push(['Desidratado', true]);
    if (c.inWater) icons.push(['Na água', false]);
    if (c.action === 'sleep') icons.push(['Dormindo', false]);
    const key = icons.map((i) => i[0]).join('|');
    if (key !== this._iconKey) {
      this._iconKey = key;
      $('status-icons').innerHTML = icons.map(([t, bad]) => `<span class="${bad ? 'bad' : ''}">${t}</span>`).join('');
    }

    // relógio
    const h = g.hour;
    const hh = Math.floor(h);
    const mm = Math.floor((h - hh) * 60);
    $('clock-time').textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    $('clock-icon').textContent = g.sky.night > 0.5 ? '☾' : '☀';
    $('clock-day').textContent = `Dia ${g.day}`;

    // bússola: yaw da câmera (0 = +z = sul no mapa → norte é -z)
    const heading = ((Math.PI - player.camYaw) / TAU) * 16;
    const off = (((heading % 16) + 16) % 16) * this.compassUnit;
    $('compass-strip').style.transform = `translateX(${150 - this.compassUnit / 2 - off - 16 * this.compassUnit + (document.body.classList.contains('mobile') ? -50 : 0)}px)`;

    // prompt
    const pr = $('prompt');
    if (player.prompt) {
      pr.textContent = player.prompt;
      pr.classList.remove('hidden');
    } else pr.classList.add('hidden');

    // dano
    this.vig = Math.max(0, this.vig - dt * 1.2);
    const lowHp = 1 - smoothstep(0.1, 0.35, c.health / c.maxHealth);
    $('vignette').style.opacity = String(Math.max(this.vig, lowHp * (0.45 + 0.15 * Math.sin(g.time * 5))));
  }

  updateTarget(t, player) {
    const el = $('target');
    if (!t) {
      el.classList.add('hidden');
      return;
    }
    el.classList.remove('hidden');
    $('t-name').textContent = t.dead ? `Carcaça de ${t.spec.name}` : t.spec.name;
    const sub = $('t-sub');
    if (t.dead) {
      sub.textContent = `Carne: ${Math.round((t.meat / t.meatMax) * 100)}%`;
      sub.className = '';
      $('t-health').style.width = `${(t.meat / t.meatMax) * 100}%`;
      return;
    }
    const ratio = t.power / Math.max(player.power, 0.1);
    const danger = t.spec.diet === 'carnivore' && ratio > 0.8;
    let txt = `${growthStage(t.growth)} · ${t.spec.diet === 'carnivore' ? 'Carnívoro' : 'Herbívoro'}`;
    if (danger) txt += ratio > 1.5 ? ' · ⚠ MUITO PERIGOSO' : ' · ⚠ Perigoso';
    else if (ratio < 0.6 && player.spec.diet === 'carnivore') txt += ' · presa';
    sub.textContent = txt;
    sub.className = danger ? 'danger' : '';
    $('t-health').style.width = `${(t.health / t.maxHealth) * 100}%`;
  }

  // ------------------------------------------------------------ mapas
  buildMapImage(world) {
    const S = 256;
    const c = document.createElement('canvas');
    c.width = S;
    c.height = S;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(S, S);
    const R = PLAY_RADIUS + 30;
    for (let j = 0; j < S; j++) {
      for (let i = 0; i < S; i++) {
        const x = (i / S) * 2 * R - R;
        const z = (j / S) * 2 * R - R;
        const h = world.height(x, z);
        const n = world.normal(x, z);
        const shade = clamp(0.75 + (n.x * -0.6 + n.z * -0.4) * 1.4, 0.45, 1.25);
        let col;
        if (h < WATER_Y) {
          const d = clamp(-h / 3, 0, 1);
          col = [lerp(70, 30, d), lerp(130, 75, d), lerp(150, 110, d)];
        } else if (h < 1.2) col = [178, 162, 118];
        else if (n.y < 0.8) col = [120, 112, 100];
        else {
          const t = clamp(h / 30, 0, 1);
          col = [lerp(78, 120, t), lerp(110, 118, t), lerp(52, 70, t)];
        }
        const k = (j * S + i) * 4;
        img.data[k] = col[0] * (h < WATER_Y ? 1 : shade);
        img.data[k + 1] = col[1] * (h < WATER_Y ? 1 : shade);
        img.data[k + 2] = col[2] * (h < WATER_Y ? 1 : shade);
        img.data[k + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    this.mapImg = c;
    this.mapR = R;
  }

  drawMinimap(player, creatures) {
    const cv = $('minimap');
    const ctx = cv.getContext('2d');
    const S = cv.width;
    const range = 160;
    const R = this.mapR;
    const px = player.pos.x;
    const pz = player.pos.z;
    const scale = this.mapImg.width / (2 * R);
    const sx = (px + R) * scale;
    const sz = (pz + R) * scale;
    const sr = range * scale;
    ctx.clearRect(0, 0, S, S);
    ctx.save();
    ctx.beginPath();
    ctx.arc(S / 2, S / 2, S / 2, 0, TAU);
    ctx.clip();
    ctx.fillStyle = '#4a4436';
    ctx.fillRect(0, 0, S, S);
    // norte para cima: o mapa usa x → direita e z → baixo; -z é norte
    ctx.drawImage(this.mapImg, sx - sr, sz - sr, sr * 2, sr * 2, 0, 0, S, S);
    const k = S / (2 * range);
    const night = this.game.sky.night;
    ctx.fillStyle = `rgba(0,0,20,${night * 0.45})`;
    ctx.fillRect(0, 0, S, S);
    // criaturas por perto (cheiro/audição)
    const sense = player.spec.diet === 'carnivore' ? 110 : 80;
    for (const o of creatures) {
      if (o === player) continue;
      const dx = o.pos.x - px;
      const dz = o.pos.z - pz;
      const d = Math.hypot(dx, dz);
      if (d > Math.min(sense, range)) continue;
      ctx.fillStyle = o.dead ? '#8a2a20' : o.spec.diet === 'carnivore' ? '#ff5a45' : '#9be36a';
      const r = o.dead ? 2.5 : 2 + Math.min(3, o.spec.sizeClass * o.scale * 0.6);
      ctx.beginPath();
      ctx.arc(S / 2 + dx * k, S / 2 + dz * k, r, 0, TAU);
      ctx.fill();
    }
    // jogador
    ctx.translate(S / 2, S / 2);
    ctx.rotate(-player.yaw + Math.PI);
    ctx.fillStyle = '#ffd36b';
    ctx.strokeStyle = '#2a1d06';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(5.5, 6);
    ctx.lineTo(0, 3);
    ctx.lineTo(-5.5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('N', S / 2, 12);
  }

  drawBigMap(player, creatures) {
    const cv = $('bigmap-canvas');
    const ctx = cv.getContext('2d');
    const S = cv.width;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.mapImg, 0, 0, S, S);
    const k = S / (2 * this.mapR);
    const toS = (x, z) => [(x + this.mapR) * k, (z + this.mapR) * k];
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.arc(S / 2, S / 2, PLAY_RADIUS * k, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    for (const o of creatures) {
      if (o === player || o.pos.distanceTo(player.pos) > 140) continue;
      const [x, y] = toS(o.pos.x, o.pos.z);
      ctx.fillStyle = o.dead ? '#8a2a20' : o.spec.diet === 'carnivore' ? '#ff5a45' : '#9be36a';
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, TAU);
      ctx.fill();
    }
    const [x, y] = toS(player.pos.x, player.pos.z);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-player.yaw + Math.PI);
    ctx.fillStyle = '#ffd36b';
    ctx.strokeStyle = '#000';
    ctx.beginPath();
    ctx.moveTo(0, -12);
    ctx.lineTo(8, 9);
    ctx.lineTo(0, 4);
    ctx.lineTo(-8, 9);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 16px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('N', S / 2, 20);
  }
}
