// Inventário (mochila): itens guardados entre os níveis, itens de missão que
// valem só no nível atual e itens com efeito passivo (ex.: a carta do Nível 88).
import { TAU } from './util.js';

// Ícones desenhados em canvas (sem arquivos de imagem).
const ICONS = {};
function icon(kind) {
  if (ICONS[kind]) return ICONS[kind];
  const S = 96;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const c = cv.getContext('2d');
  c.lineJoin = 'round';
  const glow = (col, r = 0.4) => {
    const g = c.createRadialGradient(S / 2, S / 2, 2, S / 2, S / 2, S * r);
    g.addColorStop(0, col);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, S, S);
  };
  if (kind === 'agua') {
    glow('rgba(240,230,200,0.18)');
    c.fillStyle = '#e9e1cf';
    c.beginPath();
    c.moveTo(38, 84);
    c.lineTo(58, 84);
    c.quadraticCurveTo(62, 84, 62, 78);
    c.lineTo(62, 40);
    c.quadraticCurveTo(62, 32, 54, 28);
    c.lineTo(54, 16);
    c.lineTo(42, 16);
    c.lineTo(42, 28);
    c.quadraticCurveTo(34, 32, 34, 40);
    c.lineTo(34, 78);
    c.quadraticCurveTo(34, 84, 38, 84);
    c.fill();
    c.fillStyle = '#f7f4ec';
    c.fillRect(41, 10, 14, 7);
    c.fillStyle = '#b89a62';
    c.fillRect(34, 48, 28, 18);
    c.fillStyle = '#5a4424';
    c.font = 'bold 8px sans-serif';
    c.fillText('ALMOND', 36, 59);
  } else if (kind === 'carta') {
    glow('rgba(255,240,210,0.2)');
    c.save();
    c.translate(46, 50);
    c.rotate(-0.12);
    c.fillStyle = '#d9cfb4';
    c.fillRect(-30, -22, 60, 42);
    c.strokeStyle = '#7a6a4a';
    c.lineWidth = 1;
    for (let i = 0; i < 5; i++) {
      c.beginPath();
      c.moveTo(-24, -12 + i * 7);
      c.lineTo(10 + (i % 2) * 8, -12 + i * 7);
      c.stroke();
    }
    c.restore();
    c.save();
    c.translate(58, 44);
    c.rotate(0.18);
    c.fillStyle = '#f4f2ec';
    c.fillRect(-16, -19, 32, 38);
    c.fillStyle = '#fbfbf8';
    c.fillRect(-12, -15, 24, 24);
    c.strokeStyle = '#ccc8bc';
    c.strokeRect(-12, -15, 24, 24);
    c.restore();
  } else if (kind === 'fusivel') {
    glow('rgba(100,220,255,0.35)');
    c.fillStyle = '#b8c0c8';
    c.fillRect(38, 14, 20, 10);
    c.fillRect(38, 72, 20, 10);
    c.fillStyle = 'rgba(140,220,255,0.35)';
    c.fillRect(40, 24, 16, 48);
    c.fillStyle = '#9ef0ff';
    c.fillRect(46, 24, 4, 48);
  } else if (kind === 'chave') {
    glow('rgba(230,190,90,0.25)');
    c.strokeStyle = '#d6b45a';
    c.lineWidth = 7;
    c.beginPath();
    c.arc(34, 48, 14, 0, TAU);
    c.stroke();
    c.beginPath();
    c.moveTo(48, 48);
    c.lineTo(82, 48);
    c.moveTo(72, 48);
    c.lineTo(72, 60);
    c.moveTo(80, 48);
    c.lineTo(80, 58);
    c.stroke();
    c.fillStyle = '#8a2a20';
    c.fillRect(14, 62, 18, 24);
  } else if (kind === 'cartao') {
    glow('rgba(120,200,255,0.2)');
    c.fillStyle = '#e8edf2';
    c.fillRect(16, 28, 64, 42);
    c.fillStyle = '#2f7fd0';
    c.fillRect(16, 28, 64, 10);
    c.fillStyle = '#c9a43a';
    c.fillRect(24, 46, 14, 11);
    c.fillStyle = '#334';
    c.fillRect(44, 48, 28, 3);
    c.fillRect(44, 55, 20, 3);
  } else if (kind === 'envelope') {
    glow('rgba(240,230,200,0.15)');
    c.fillStyle = '#cdbf9c';
    c.fillRect(14, 28, 68, 42);
    c.strokeStyle = '#8a7a58';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(14, 28);
    c.lineTo(48, 52);
    c.lineTo(82, 28);
    c.stroke();
  } else {
    c.fillStyle = '#888';
    c.fillRect(30, 30, 36, 36);
  }
  ICONS[kind] = cv.toDataURL();
  return ICONS[kind];
}

export const LETTER_TEXT =
  'Se você encontrou isto, sente-se um pouco. O lago não vai a lugar nenhum, e a criatura não gosta da cabana. ' +
  'Guardei esta foto porque era a única coisa que eu tinha de casa. Um dia ela mostrava alguém — juro que mostrava. ' +
  'Agora está em branco, mas segurá-la ainda acalma. Leve com você. Siga a margem até as pedras grandes: ' +
  'atrás delas existe uma passagem que desce para debaixo da terra. Não grite perto da água. Ela guarda as vozes.';

// Definições: scope 'game' (fica entre níveis) ou 'level' (some ao trocar de nível).
export const ITEM_DEFS = {
  agua: {
    name: 'Água de Amêndoa',
    desc: 'Uma garrafa gelada. Beber recupera bastante sanidade.',
    action: 'Beber',
    scope: 'game',
    use: (g) => {
      g.addSanity(38);
      g.audio.drink();
      g.hud.message('Água de Amêndoa: a mente clareia. (+Sanidade)');
      return true;
    },
  },
  carta: {
    name: 'Carta com foto em branco',
    desc: 'Uma carta à mão e uma fotografia sem imagem. Enquanto estiver com você, a sanidade se recupera sozinha.',
    action: 'Ler',
    scope: 'game',
    passive: (g, dt) => {
      if (g.sanity < 100) g.addSanity(dt * 1.5);
    },
    use: (g) => {
      g.audio.paper();
      g.hud.showLetter(LETTER_TEXT);
      return false;
    },
  },
  fusivel: { name: 'Fusível de plasma', desc: 'Zumbe e esquenta na mão. A engenheira Vega precisa de três.', scope: 'level' },
  chave: { name: 'Chave do quarto', desc: 'Chave antiga de hotel, com etiqueta de couro vermelho.', scope: 'level' },
  cartao: { name: 'Cartão de acesso', desc: '"NÍVEL 15 — MANUTENÇÃO". Abre as salas de máquinas com terminal.', scope: 'level' },
  envelope: { name: 'Envelope úmido', desc: 'Um endereço escrito à mão.', scope: 'level', action: 'Ler', use: (g, it) => (g.hud.showNote(it.text || ''), false) },
};

export class Inventory {
  constructor(game) {
    this.game = game;
    this.max = 8;
    this.items = [];
  }

  def(id) {
    return ITEM_DEFS[id];
  }

  icon(id) {
    return icon(id);
  }

  count(id) {
    const it = this.items.find((i) => i.id === id);
    return it ? it.n : 0;
  }

  has(id) {
    return this.count(id) > 0;
  }

  // Guarda um item. extra: campos guardados junto (ex.: texto). Retorna false se a mochila está cheia.
  add(id, n = 1, extra = {}) {
    const it = this.items.find((i) => i.id === id);
    if (it) it.n += n;
    else {
      if (this.items.length >= this.max) return false;
      this.items.push({ id, n, ...extra });
    }
    this.changed();
    return true;
  }

  remove(id, n = 1) {
    const it = this.items.find((i) => i.id === id);
    if (!it) return;
    it.n -= n;
    if (it.n <= 0) this.items.splice(this.items.indexOf(it), 1);
    this.changed();
  }

  use(id) {
    const it = this.items.find((i) => i.id === id);
    const d = ITEM_DEFS[id];
    if (!it || !d || !d.use) return;
    if (d.use(this.game, it)) this.remove(id, 1);
    this.changed();
  }

  // Ao trocar de nível, itens de missão do nível anterior somem.
  onLevel() {
    const before = this.items.length;
    this.items = this.items.filter((i) => (ITEM_DEFS[i.id] || {}).scope !== 'level');
    if (this.items.length !== before) this.changed();
  }

  update(dt) {
    for (const it of this.items) {
      const d = ITEM_DEFS[it.id];
      if (d && d.passive) d.passive(this.game, dt, it);
    }
  }

  changed() {
    const h = this.game.hud;
    if (h && h.invRefresh) h.invRefresh();
  }
}
