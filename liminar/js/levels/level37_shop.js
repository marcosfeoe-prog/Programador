// Nível 37 — a área secreta dos mercenários: uma salinha de trocas com paredes
// cinzas e piso de azulejo azul, balcão, prateleiras e um vendedor. Aqui a
// moeda é o tempo: cada minuto sobrevivido vale uma ficha, cada nível visitado
// também, e só por ter chegado ao 37 você ganha 5.
import * as THREE from 'three';
import { NPC } from './level0_1_npc.js';
import { ITEM_DEFS } from '../inventory.js';
import { textCanvasTex } from '../textures.js';
import { saveSettings } from '../config.js';
import { pushCircle } from './grid.js';
import { mulberry32 } from '../util.js';

const STOCK = ['kit', 'pilha', 'tenis', 'amuleto', 'radio'];

export class Shop {
  constructor(L, B) {
    this.L = L;
    this.game = L.game;
    const r = L.shopRoom;
    this.r = r;
    const M = L.M;
    B.setRoom(r);
    const zc = (r.z0 + r.z1) / 2;
    this.zc = zc;
    // balcão (o vendedor fica do lado oeste)
    const cx = r.x0 + 4.3;
    this.counter = [cx - 0.4, cx + 0.4, r.z0 + 1.4, r.z1 - 1.4];
    B.box(M.wood, cx, 0.5, zc, 0.8, 1.0, r.z1 - r.z0 - 2.8);
    B.box(M.grey, cx, 1.04, zc, 0.95, 0.08, r.z1 - r.z0 - 2.7);
    // prateleiras na parede oeste com mercadorias
    const rnd = mulberry32(3790);
    for (const y of [0.9, 1.6, 2.3]) {
      B.box(M.metal, r.x0 + 0.3, y, zc, 0.5, 0.05, 6.5);
      for (let k = 0; k < 12; k++) {
        const z = zc - 3 + k * 0.52 + rnd() * 0.1;
        const h = 0.15 + rnd() * 0.25;
        const mat = [M.wood, M.blue, M.metal, M.white, M.hazard][Math.floor(rnd() * 5)];
        B.box(mat, r.x0 + 0.3, y + 0.03 + h / 2, z, 0.3, h, 0.3 + rnd() * 0.15);
      }
    }
    // caixas e um barril
    for (const [x, z, s] of [
      [r.x1 - 1.0, r.z0 + 0.8, 0.9],
      [r.x1 - 2.0, r.z0 + 0.7, 0.7],
      [r.x1 - 1.0, r.z0 + 0.8 + 0.9, 0.6],
    ]) {
      B.box(M.wood, x, s / 2, z, s, s, s);
      L.colliders.push([x - s / 2, x + s / 2, z - s / 2, z + s / 2]);
    }
    B.cyl(M.dark, r.x1 - 1.0, 0.5, r.z1 - 0.8, 0.35, 1.0, { sides: 14 });
    L.colliders.push([r.x1 - 1.4, r.x1 - 0.6, r.z1 - 1.2, r.z1 - 0.4]);
    // lâmpadas penduradas
    for (const l of r.lights) if (l.dir) B.cyl(M.amber, l.x, l.y - 0.25, l.z, 0.09, 0.16, { sides: 10 });
    // vitrine no balcão: os cinco itens
    this.goods = [];
    // placa em neon
    this.signTex = textCanvasTex(512, 128, (c, w, h) => {
      c.fillStyle = '#05080c';
      c.fillRect(0, 0, w, h);
      c.shadowColor = '#4fb8ff';
      c.shadowBlur = 18;
      c.fillStyle = '#9fe0ff';
      c.font = 'bold 64px Arial, Helvetica, sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText('TROCAS', w / 2, h * 0.42);
      c.font = '26px Arial, Helvetica, sans-serif';
      c.fillStyle = '#ffd08a';
      c.shadowColor = '#ff9a40';
      c.fillText('seu tempo vale ouro', w / 2, h * 0.82);
    });
    const sm = new THREE.MeshBasicMaterial({ map: this.signTex });
    sm.color.setScalar(1.6);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 0.5), sm);
    sign.position.set(r.x0 + 0.06, 2.85, zc);
    sign.rotation.y = Math.PI / 2;
    L.dynamic.add(sign);
    this.signMat = sm;
  }

  makeNPC() {
    const r = this.r;
    this.npc = new NPC(this.L, {
      id: 'corvo',
      name: 'Corvo',
      role: 'Mercenário',
      x: r.x0 + 3.3,
      z: this.zc + 0.4,
      yaw: Math.PI / 2,
      h: 1.82,
      look: { skin: '#a8754e', hair: '#1a1410', hairStyle: 'shaved', suit: '#4a4f55', accent: '#e07a2a', arms: 'crossed', goggles: true, beard: 'rgba(30,20,12,0.7)', eyes: '#3a2a1a' },
    });
    // os cinco itens expostos no balcão (cubinhos coloridos com o ícone)
    const inv = this.game.inventory;
    STOCK.forEach((id, k) => {
      const tex = new THREE.TextureLoader().load(inv.icon(id));
      tex.colorSpace = THREE.SRGBColorSpace;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.32), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
      m.material.color.setScalar(0.9);
      m.position.set(this.counter[1] - 0.15, 1.24, this.zc - 1.6 + k * 0.8);
      m.rotation.y = Math.PI / 2;
      this.L.dynamic.add(m);
      this.goods.push(m);
    });
  }

  // ------------------------------------------------------------ fichas
  balance() {
    const s = this.game.settings;
    const mins = Math.floor((s.survival || 0) / 60);
    const visited = (s.visited || []).length;
    return mins + visited + 5 - (s.spent || 0);
  }

  say(text, choices = []) {
    const hud = this.game.hud;
    this._said = true;
    const wrapped = (choices.length ? choices : [{ text: 'Até mais.' }]).map((c) => ({
      text: c.text,
      fn: () => {
        this._said = false;
        if (c.fn) c.fn();
        if (!this._said) {
          hud.closeDialog();
          this.talking = false;
        }
      },
    }));
    hud.dialog('Corvo · Mercenário', text, wrapped, this.npc.portrait);
    this.game.audio.play('beep', { gain: 0.03, rate: 0.9 });
  }

  talk() {
    this.talking = true;
    const first = !this.met;
    this.met = true;
    const b = this.balance();
    this.say(
      (first
        ? 'Ora, ora. Achou os azulejos soltos. Pouca gente acha. Aqui a gente troca coisas úteis por tempo — o tempo que você aguentou lá fora. '
        : 'De volta, andarilho? ') + `Você tem ${b} ficha${b === 1 ? '' : 's'} de tempo.`,
      [
        { text: 'Ver as mercadorias', fn: () => this.menu() },
        { text: 'Como funcionam as fichas?', fn: () => this.explain() },
        { text: 'Quem é você?', fn: () => this.lore() },
        { text: 'Até mais.' },
      ],
    );
  }

  menu() {
    const inv = this.game.inventory;
    const b = this.balance();
    const items = STOCK.map((id) => {
      const d = ITEM_DEFS[id];
      const owned = d.passive && inv.has(id);
      return { text: `${d.name} — ${d.price} ficha${d.price === 1 ? '' : 's'}${owned ? ' (já tem)' : ''}`, fn: () => this.offer(id) };
    });
    this.say(`Fichas: ${b}. Escolha com calma.`, [...items, { text: 'Voltar', fn: () => this.talk() }]);
  }

  offer(id) {
    const d = ITEM_DEFS[id];
    const b = this.balance();
    this.say(`${d.name}. ${d.desc} Custa ${d.price}. Você tem ${b}.`, [
      { text: 'Comprar', fn: () => this.buy(id) },
      { text: 'Ver outra coisa', fn: () => this.menu() },
    ]);
  }

  buy(id) {
    const g = this.game;
    const d = ITEM_DEFS[id];
    const inv = g.inventory;
    if (d.passive && inv.has(id)) {
      this.say('Você já tem um desses. Dois não fazem efeito dobrado, acredite.', [{ text: 'Voltar', fn: () => this.menu() }]);
      return;
    }
    if (this.balance() < d.price) {
      this.say('Tempo insuficiente. Volte quando tiver sobrevivido mais um pouco. Lá fora o relógio não para.', [{ text: 'Voltar', fn: () => this.menu() }]);
      return;
    }
    if (!inv.add(id)) {
      this.say('Sua mochila está cheia. Use alguma coisa antes.', [{ text: 'Voltar', fn: () => this.menu() }]);
      return;
    }
    g.settings.spent = (g.settings.spent || 0) + d.price;
    saveSettings(g.settings);
    g.audio.play('ding', { gain: 0.3, rate: 1.3 });
    this.say(`Negócio fechado. ${d.name} está na sua mochila. Restam ${this.balance()} fichas.`, [
      { text: 'Ver mais', fn: () => this.menu() },
      { text: 'Obrigado.' },
    ]);
  }

  explain() {
    const s = this.game.settings;
    const mins = Math.floor((s.survival || 0) / 60);
    const visited = (s.visited || []).length;
    this.say(
      `Cada minuto que você sobreviveu vale uma ficha (${mins}). Cada nível diferente que você visitou vale outra (${visited}). E chegar até o 37 vale 5 de bônus. Gastou ${s.spent || 0}.`,
      [{ text: 'Voltar', fn: () => this.talk() }],
    );
  }

  lore() {
    this.say(
      'Corvo. Mercenário aposentado. Já carreguei gente do Saguão até a Estação Zênite e de volta. Aqui ninguém atira em ninguém, a água é morna e o café é ruim. Lugar perfeito para aposentar. Se for embora, use a porta futurista: a Zênite sempre precisa de mão de obra.',
      [{ text: 'Voltar', fn: () => this.talk() }],
    );
  }

  // ------------------------------------------------------------ quadro
  update(dt, player) {
    if (!this.npc) return;
    if (this.talking && !this.game.hud.dialogOpen) this.talking = false;
    this.npc.update(dt, player, this.L.time, this.talking);
    for (const [k, m] of this.goods.entries()) m.position.y = 1.24 + Math.sin(this.L.time * 1.5 + k) * 0.015;
  }

  collide(p, r) {
    const c = this.counter;
    pushCircle(p, r, c[0], c[1], c[2], c[3]);
    if (this.npc) {
      const dx = p.x - this.npc.x;
      const dz = p.z - this.npc.z;
      const d = Math.hypot(dx, dz);
      if (d < r + 0.3 && d > 1e-4) {
        p.x = this.npc.x + (dx / d) * (r + 0.3);
        p.z = this.npc.z + (dz / d) * (r + 0.3);
      }
    }
  }

  interactable(player) {
    if (!this.npc || this.talking) return null;
    const p = player.pos;
    if (p.x > this.counter[1] && p.x < this.counter[1] + 1.8 && Math.abs(p.z - this.zc) < 3.2) return { label: 'Falar com Corvo', action: () => this.talk() };
    return null;
  }

  dispose() {
    if (this.npc) this.npc.dispose();
    this.signTex.dispose();
    this.signMat.dispose();
    for (const m of this.goods) {
      m.material.map.dispose();
      m.material.dispose();
    }
  }
}
