// HUD: placar e tempo, vida/colete, munição, dinheiro, radar, feed de mortes,
// mira dinâmica, marcador de acerto, indicador de dano, menu de compra e placar.
import { WEAPONS, EQUIP, BUY_MENU } from './weapons.js';
import { drawMapImage, CELL } from './map.js';
import { fmtTime } from './util.js';

const $ = (id) => document.getElementById(id);

export class HUD {
  constructor() {
    this.el = {
      hud: $('hud'), timer: $('timer'), round: $('round-no'), scoreCT: $('score-ct'), scoreT: $('score-t'),
      aliveCT: $('alive-ct'), aliveT: $('alive-t'), money: $('money-v'), buyzone: $('buyzone'), delta: $('money-delta'),
      hp: $('hp'), armor: $('armor'), armorIco: $('armor-ico'), mag: $('ammo-mag'), res: $('ammo-res'), wname: $('wname'),
      inv: $('inv'), kill: $('killfeed'), radio: $('radio'), xh: $('crosshair'), hit: $('hitmarker'),
      cm: $('center-msg'), cmT: $('cm-title'), cmS: $('cm-sub'), hint: $('hint'), prog: $('progress'),
      progL: $('progress-label'), progF: $('progress-fill'), flash: $('flash'), scope: $('scope'), dmg: $('dmg-ind'),
      buy: $('buy'), buyGrid: $('buy-grid'), buyMoney: $('buy-money'), buyTime: $('buy-time'), sb: $('scoreboard'),
      radar: $('radar'), place: $('place'), bomb: $('bomb-ico'), spec: $('spectate'),
    };
    this.rctx = this.el.radar.getContext('2d');
    this.mapImg = null;
    this.cmUntil = 0;
    this.hintText = '';
    this.hitT = 0;
    this.buyOpen = false;
    this.invKey = '';
    this.aliveKey = '';
  }

  setMap(map) {
    this.mapImg = drawMapImage(map, 6);
  }

  show(on) {
    this.el.hud.classList.toggle('hidden', !on);
  }

  // ------------------------------------------------------------ por quadro
  update(g, p, time, view) {
    const e = this.el;
    // tempo da rodada / bomba
    let t = g.timeLeft();
    e.timer.className = '';
    if (g.bomb.state === 'planted' && g.mode === 'defuse') {
      e.timer.textContent = '💣';
      e.timer.className = 'bomb';
    } else {
      e.timer.textContent = g.phase === 'freeze' ? fmtTime(g.freezeLeft()) : fmtTime(t);
      if (t < 10 && g.phase === 'live') e.timer.className = 'red';
    }
    e.round.textContent = g.roundLabel();
    const ctSquad = g.squadOf('CT');
    e.scoreCT.textContent = g.score[ctSquad];
    e.scoreT.textContent = g.score[1 - ctSquad];
    const key = g.actors.map((a) => a.team + (a.alive ? 1 : 0)).join('');
    if (key !== this.aliveKey) {
      this.aliveKey = key;
      const mk = (team) => g.actors.filter((a) => a.team === team).map((a) => `<i class="${a.alive ? '' : 'dead'}"></i>`).join('');
      e.aliveCT.innerHTML = mk('CT');
      e.aliveT.innerHTML = mk('T');
    }
    e.money.textContent = g.mode === 'defuse' ? '$' + p.money : g.mode === 'dm' ? `${p.kills} abates` : 'Treino';
    e.buyzone.style.visibility = g.canBuy(p) ? 'visible' : 'hidden';

    const v = view; // ator que a câmera segue (jogador ou espectado)
    e.hp.textContent = v.alive ? Math.ceil(v.health) : 0;
    e.hp.parentElement.classList.toggle('low', v.health <= 25);
    e.armor.textContent = Math.ceil(v.armor);
    e.armorIco.textContent = v.helmet ? '⛑' : '⛨';
    const w = v.weapon;
    if (w && w.def.mag) {
      e.mag.textContent = w.mag;
      e.mag.classList.toggle('low', w.mag <= Math.ceil(w.def.mag * 0.2));
      e.res.textContent = '/ ' + w.reserve;
    } else if (w && w.def.type === 'grenade') {
      e.mag.textContent = v.grenades.filter((x) => x === w.id).length;
      e.mag.classList.remove('low');
      e.res.textContent = '';
    } else {
      e.mag.textContent = '—';
      e.mag.classList.remove('low');
      e.res.textContent = '';
    }
    e.wname.textContent = w ? w.def.name : '';
    const ik = v.inv.map((x) => x?.id).join() + v.slot + v.grenades.join() + v.nadeIdx;
    if (ik !== this.invKey) {
      this.invKey = ik;
      const rows = [];
      const nm = (s, label) => rows.push(`<div class="${v.slot === s ? 'cur' : ''}"><b>${s + 1}</b>${label}</div>`);
      if (v.inv[0]) nm(0, v.inv[0].def.name);
      if (v.inv[1]) nm(1, v.inv[1].def.name);
      nm(2, 'Faca');
      if (v.grenades.length) nm(3, v.grenades.map((x) => WEAPONS[x].name.replace('Granada ', '')).join(' · '));
      if (v.inv[4]) nm(4, 'C4');
      e.inv.innerHTML = rows.join('');
    }
    e.bomb.classList.toggle('hidden', !v.hasBomb);
    e.place.textContent = g.map.calloutAt(v.pos);

    // mira dinâmica
    const dyn = g.settings.dynamic;
    const inacc = v.alive ? v.inaccuracy() : 0;
    const gap = dyn ? 3 + Math.min(60, (inacc * innerHeight) / (2 * Math.tan((view.fovNow || 74) * Math.PI / 360))) : 4;
    const xs = e.xh.children;
    xs[0].style.left = -(gap + 7) + 'px';
    xs[1].style.left = gap + 'px';
    xs[2].style.top = -(gap + 7) + 'px';
    xs[3].style.top = gap + 'px';
    const scoped = v.scope > 0 && w?.def.type === 'sniper';
    e.xh.style.display = scoped || !v.alive || (w?.def.type === 'sniper' && !scoped && !g.settings.sniperXhair) ? 'none' : '';
    e.scope.classList.toggle('hidden', !scoped);

    // cegueira
    e.flash.style.opacity = v.alive ? v.flashAmount(time) : 0;

    if (this.hitT > 0) {
      this.hitT -= 1 / 60;
      e.hit.style.opacity = Math.max(0, this.hitT / 0.25);
    }
    if (time > this.cmUntil) e.cm.classList.remove('show');

    // barra de progresso (plantar/desarmar)
    if (p.planting) {
      e.prog.classList.remove('hidden');
      e.progL.textContent = 'Plantando a bomba…';
      e.progF.style.width = Math.min(100, (p.planting / 3.2) * 100) + '%';
    } else if (p.defusing) {
      e.prog.classList.remove('hidden');
      const dur = p.kit ? 5 : 10;
      e.progL.textContent = `Desarmando${p.kit ? ' (kit)' : ''}… ${Math.max(0, dur - p.defusing).toFixed(1)} s`;
      e.progF.style.width = Math.min(100, (p.defusing / dur) * 100) + '%';
    } else e.prog.classList.add('hidden');

    this.drawRadar(g, v, time);
    if (this.buyOpen) this.refreshBuy(g, p);
  }

  hint(text) {
    if (text === this.hintText) return;
    this.hintText = text;
    this.el.hint.textContent = text;
    this.el.hint.classList.toggle('show', !!text);
  }

  spectate(text) {
    this.el.spec.classList.toggle('hidden', !text);
    if (text) this.el.spec.innerHTML = text;
  }

  message(title, sub = '', color = '#fff', dur = 4, time = 0) {
    this.el.cmT.textContent = title;
    this.el.cmT.style.color = color;
    this.el.cmS.textContent = sub;
    this.el.cm.classList.add('show');
    this.cmUntil = time + dur;
  }

  hitmarker(head) {
    this.hitT = 0.25;
    this.el.hit.classList.toggle('hs', !!head);
  }

  damageFrom(angle) {
    const d = document.createElement('div');
    d.style.transform = `rotate(${angle}rad)`;
    this.el.dmg.appendChild(d);
    setTimeout(() => d.remove(), 1300);
  }

  moneyDelta(amount, reason) {
    const d = document.createElement('div');
    d.className = amount >= 0 ? 'plus' : 'minus';
    d.textContent = `${amount >= 0 ? '+' : '-'}$${Math.abs(amount)}  ${reason}`;
    this.el.delta.appendChild(d);
    setTimeout(() => d.remove(), 3000);
    while (this.el.delta.children.length > 4) this.el.delta.firstChild.remove();
  }

  killfeed(killer, victim, weaponName, head, wall, mine) {
    const d = document.createElement('div');
    d.className = 'kf' + (mine ? ' me' : '');
    const kn = killer ? `<span class="c-${killer.team}">${esc(killer.name)}</span>` : '';
    d.innerHTML = `${kn}<span class="w">${esc(weaponName)}</span>${wall ? '<span class="hs">⟂</span>' : ''}${head ? '<span class="hs">⌖ HS</span>' : ''}<span class="c-${victim.team}">${esc(victim.name)}</span>`;
    this.el.kill.appendChild(d);
    setTimeout(() => {
      d.style.opacity = 0;
      setTimeout(() => d.remove(), 700);
    }, 6000);
    while (this.el.kill.children.length > 6) this.el.kill.firstChild.remove();
  }

  radio(actor, text) {
    const d = document.createElement('div');
    d.innerHTML = `<span class="c-${actor.team}">${esc(actor.name)}</span> (rádio): ${esc(text)}`;
    this.el.radio.appendChild(d);
    setTimeout(() => d.remove(), 5000);
    while (this.el.radio.children.length > 5) this.el.radio.firstChild.remove();
  }

  clearFeeds() {
    this.el.kill.innerHTML = '';
    this.el.radio.innerHTML = '';
    this.el.delta.innerHTML = '';
    this.el.dmg.innerHTML = '';
  }

  // ------------------------------------------------------------ radar
  drawRadar(g, v, time) {
    const c = this.rctx;
    const S = 220;
    const scale = 2.6; // px por metro
    c.clearRect(0, 0, S, S);
    c.save();
    c.beginPath();
    c.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2);
    c.clip();
    c.translate(S / 2, S / 2);
    c.rotate(v.yaw);
    c.translate(-v.pos.x * scale, -v.pos.z * scale);
    if (this.mapImg) {
      c.globalAlpha = 0.85;
      c.drawImage(this.mapImg, 0, 0, g.map.W * CELL * scale, g.map.H * CELL * scale);
      c.globalAlpha = 1;
    }
    // bomba
    const b = g.bomb;
    if (g.mode === 'defuse' && b.state !== 'none' && (v.team === 'T' || b.state === 'planted' || b.seenByCT)) {
      const bp = b.state === 'carried' && b.carrier ? b.carrier.pos : b.pos;
      if (b.state !== 'carried' || v.team === 'T') {
        c.fillStyle = b.state === 'planted' ? (Math.sin(time * 10) > 0 ? '#ff3a2a' : '#ffaa00') : '#ff3a2a';
        c.fillRect(bp.x * scale - 4, bp.z * scale - 4, 8, 8);
      }
    }
    for (const a of g.actors) {
      const mate = a.team === v.team;
      const spotted = !mate && time - (a.spottedAt || -10) < 1.5;
      if (!mate && !spotted) continue;
      if (!a.alive && !mate) continue;
      const x = a.pos.x * scale;
      const z = a.pos.z * scale;
      if (!a.alive) {
        c.strokeStyle = 'rgba(255,255,255,0.4)';
        c.lineWidth = 2;
        c.beginPath();
        c.moveTo(x - 3, z - 3);
        c.lineTo(x + 3, z + 3);
        c.moveTo(x + 3, z - 3);
        c.lineTo(x - 3, z + 3);
        c.stroke();
        continue;
      }
      c.fillStyle = mate ? (a === v ? '#ffffff' : a.team === 'CT' ? '#6ea8ff' : '#f0b440') : '#ff3a2a';
      c.beginPath();
      c.arc(x, z, a === v ? 4.5 : 4, 0, Math.PI * 2);
      c.fill();
      if (mate) {
        // direção do olhar
        c.strokeStyle = c.fillStyle;
        c.lineWidth = 1.5;
        c.beginPath();
        c.moveTo(x, z);
        c.lineTo(x - Math.sin(a.yaw) * 9, z - Math.cos(a.yaw) * 9);
        c.stroke();
      }
    }
    c.restore();
    // campo de visão
    c.strokeStyle = 'rgba(255,255,255,0.25)';
    c.beginPath();
    c.moveTo(S / 2, S / 2);
    c.lineTo(S / 2 - 40, S / 2 - 60);
    c.moveTo(S / 2, S / 2);
    c.lineTo(S / 2 + 40, S / 2 - 60);
    c.stroke();
  }

  // ------------------------------------------------------------ compra
  openBuy(g, p, open) {
    this.buyOpen = open;
    this.el.buy.classList.toggle('hidden', !open);
    if (open) this.buildBuy(g, p);
  }

  buildBuy(g, p) {
    const grid = this.el.buyGrid;
    grid.innerHTML = '';
    BUY_MENU.forEach((cat, ci) => {
      const col = document.createElement('div');
      col.className = 'bcat';
      col.innerHTML = `<h4><span>${ci + 1}</span>${cat.name}</h4>`;
      let n = 0;
      for (const id of cat.items) {
        const item = WEAPONS[id] || EQUIP[id];
        const team = item.team || 'any';
        if (team !== 'any' && team !== p.team) continue;
        n++;
        const b = document.createElement('button');
        b.className = 'bitem';
        b.dataset.id = id;
        b.innerHTML = `<span><kbd>${n}</kbd>${item.name}</span><span class="p">$${item.price}</span>`;
        b.addEventListener('click', (ev) => {
          ev.stopPropagation();
          g.playerBuy(id);
        });
        col.appendChild(b);
      }
      grid.appendChild(col);
    });
    this.refreshBuy(g, p);
  }

  refreshBuy(g, p) {
    this.el.buyMoney.textContent = g.mode === 'defuse' ? '$' + p.money : 'Grátis';
    const left = g.buyTimeLeft();
    this.el.buyTime.textContent = g.mode === 'defuse' ? (left > 0 ? `Tempo de compra: ${Math.ceil(left)} s` : 'Tempo de compra esgotado') : '';
    for (const b of this.el.buyGrid.querySelectorAll('.bitem')) {
      const id = b.dataset.id;
      const r = g.buyCheck(p, id);
      b.classList.toggle('no', !r.ok && !r.owned);
      b.classList.toggle('owned', !!r.owned);
    }
  }

  // ------------------------------------------------------------ placar
  showScore(g, on) {
    this.el.sb.classList.toggle('hidden', !on);
    if (!on) return;
    const ctSquad = g.squadOf('CT');
    const table = (team) => {
      const rows = g.actors
        .filter((a) => a.team === team)
        .sort((a, b) => b.score - a.score)
        .map(
          (a) => `<tr class="${a.alive ? '' : 'dead'} ${a.isPlayer ? 'me' : ''}"><td>${esc(a.name)}${a.hasBomb && (team === 'T' || !a.alive) ? ' 💣' : ''}</td><td>${g.mode === 'defuse' ? '$' + a.money : ''}</td><td>${a.kills}</td><td>${a.assists}</td><td>${a.deaths}</td><td>${a.mvps ? '★' + a.mvps : ''}</td><td>${a.score}</td></tr>`,
        )
        .join('');
      return `<table class="sb-${team.toLowerCase()}"><tr><th>${team === 'CT' ? 'Contra-Terroristas' : 'Terroristas'}</th><th>Dinheiro</th><th>A</th><th>As</th><th>M</th><th>MVP</th><th>Pontos</th></tr>${rows}</table>`;
    };
    this.el.sb.innerHTML = `<h3><span class="c-CT">CT ${g.score[ctSquad]}</span><span>Poeira · ${g.modeLabel()}</span><span class="c-T">${g.score[1 - ctSquad]} T</span></h3>${table('CT')}${table('T')}<div class="meta">${g.roundLabel()}</div>`;
  }
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}
