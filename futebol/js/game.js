// Chutebol — futebol de discos com física (vista de cima).
// Simulação em passo fixo de 60 Hz; tudo desenhado em canvas 2D.

const RED = 0, BLUE = 1;
const TEAM_COLOR = ['#e5564b', '#4f86e8'];
const TEAM_NAME = ['Vermelho', 'Azul'];

// ---------------------------------------------------------------- física
const PHYS = {
  playerRadius: 15,
  playerInvMass: 0.5,
  playerDamping: 0.96,
  playerBounce: 0.5,
  accel: 0.1,
  kickingAccel: 0.07,
  kickStrength: 5,
  kickReach: 4,
  ballRadius: 10,
  ballInvMass: 1,
  ballDamping: 0.99,
  ballBounce: 0.5,
};

const STADIUMS = {
  small:   { W: 300, H: 135, goal: 60, depth: 26, circle: 65, margin: 50 },
  classic: { W: 370, H: 170, goal: 64, depth: 30, circle: 75, margin: 60 },
  big:     { W: 550, H: 240, goal: 80, depth: 34, circle: 90, margin: 70 },
};

const BOT_NAMES = ['Tico', 'Bola7', 'Zé', 'Rafa', 'Nando', 'Lulu', 'Pedrão', 'Kaká', 'Juba',
  'Dudu', 'Mel', 'Tuca', 'Biel', 'Lia', 'Caju', 'Fumaça'];

function disc(x, y, r, invMass, damping, bounce) {
  return { x, y, vx: 0, vy: 0, r, invMass, damping, bounce };
}

function buildStadium(s) {
  const { W, H, goal, depth } = s;
  const ballSegs = [];   // só a bola colide (linhas do campo)
  const allSegs = [];    // bola e jogadores (redes)
  const seg = (ax, ay, bx, by, bounce) => ({ ax, ay, bx, by, bounce });
  ballSegs.push(seg(-W, -H, W, -H, 1), seg(-W, H, W, H, 1));
  for (const sx of [-1, 1]) {
    ballSegs.push(seg(sx * W, -H, sx * W, -goal, 1), seg(sx * W, goal, sx * W, H, 1));
    // Rede curva (meia elipse) atrás de cada gol
    const n = 14;
    let px = sx * W, py = -goal;
    for (let i = 1; i <= n; i++) {
      const a = -Math.PI / 2 + (Math.PI * i) / n;
      const x = sx * (W + depth * Math.cos(a)), y = goal * Math.sin(a);
      allSegs.push(seg(px, py, x, y, 0.1));
      px = x; py = y;
    }
  }
  const posts = [];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    const p = disc(sx * W, sy * goal, 8, 0, 0, 0.5);
    p.team = sx < 0 ? RED : BLUE;
    posts.push(p);
  }
  return { ...s, ballSegs, allSegs, posts };
}

function collideDiscs(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const rr = a.r + b.r;
  const d2 = dx * dx + dy * dy;
  if (d2 >= rr * rr || d2 === 0) return false;
  const d = Math.sqrt(d2);
  const nx = dx / d, ny = dy / d;
  const tot = a.invMass + b.invMass;
  if (tot === 0) return false;
  const over = rr - d;
  a.x -= nx * over * a.invMass / tot; a.y -= ny * over * a.invMass / tot;
  b.x += nx * over * b.invMass / tot; b.y += ny * over * b.invMass / tot;
  const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
  if (vn < 0) {
    const j = (1 + a.bounce * b.bounce) * vn / tot;
    a.vx += nx * j * a.invMass; a.vy += ny * j * a.invMass;
    b.vx -= nx * j * b.invMass; b.vy -= ny * j * b.invMass;
  }
  return true;
}

function collideSeg(d, s) {
  const ex = s.bx - s.ax, ey = s.by - s.ay;
  const len2 = ex * ex + ey * ey;
  let t = ((d.x - s.ax) * ex + (d.y - s.ay) * ey) / len2;
  t = Math.max(0, Math.min(1, t));
  const px = s.ax + ex * t, py = s.ay + ey * t;
  const dx = d.x - px, dy = d.y - py;
  const d2 = dx * dx + dy * dy;
  if (d2 >= d.r * d.r || d2 === 0) return false;
  const dist = Math.sqrt(d2);
  const nx = dx / dist, ny = dy / dist;
  d.x = px + nx * d.r; d.y = py + ny * d.r;
  const vn = d.vx * nx + d.vy * ny;
  if (vn < 0) {
    const k = (1 + d.bounce * s.bounce) * vn;
    d.vx -= nx * k; d.vy -= ny * k;
  }
  return true;
}

// ---------------------------------------------------------------- áudio
const Audio = {
  ctx: null, on: true, crowd: null,
  init() {
    if (this.ctx || !this.on) return;
    try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { this.on = false; }
  },
  noise(dur) {
    const c = this.ctx, b = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const s = c.createBufferSource(); s.buffer = b; return s;
  },
  kick(power = 1) {
    if (!this.on || !this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(180, t); o.frequency.exponentialRampToValueAtTime(55, t + 0.12);
    g.gain.setValueAtTime(0.5 * power, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    o.connect(g).connect(c.destination); o.start(t); o.stop(t + 0.16);
    const n = this.noise(0.05), f = c.createBiquadFilter(), g2 = c.createGain();
    f.type = 'highpass'; f.frequency.value = 1500;
    g2.gain.setValueAtTime(0.18 * power, t); g2.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    n.connect(f).connect(g2).connect(c.destination); n.start(t);
  },
  bump(v) {
    if (!this.on || !this.ctx || v < 0.6) return;
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'triangle'; o.frequency.setValueAtTime(120, t);
    g.gain.setValueAtTime(Math.min(0.12, v * 0.03), t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    o.connect(g).connect(c.destination); o.start(t); o.stop(t + 0.08);
  },
  whistle(len = 0.35, times = 1) {
    if (!this.on || !this.ctx) return;
    const c = this.ctx;
    for (let k = 0; k < times; k++) {
      const t = c.currentTime + k * (len + 0.12);
      const o = c.createOscillator(), lfo = c.createOscillator(), lg = c.createGain(), g = c.createGain();
      o.type = 'square'; o.frequency.value = 2650;
      lfo.frequency.value = 38; lg.gain.value = 120;
      lfo.connect(lg).connect(o.frequency);
      const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2700; f.Q.value = 3;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.09, t + 0.02);
      g.gain.setValueAtTime(0.09, t + len - 0.04); g.gain.linearRampToValueAtTime(0, t + len);
      o.connect(f).connect(g).connect(c.destination);
      o.start(t); lfo.start(t); o.stop(t + len); lfo.stop(t + len);
    }
  },
  cheer() {
    if (!this.on || !this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const n = this.noise(3), f = c.createBiquadFilter(), g = c.createGain();
    f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 0.6;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.35, t + 0.3);
    g.gain.exponentialRampToValueAtTime(0.001, t + 3);
    n.connect(f).connect(g).connect(c.destination); n.start(t);
  },
};

// ---------------------------------------------------------------- entrada
const keys = new Set();
addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement) return;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  if (e.code === 'Escape' || e.code === 'KeyP') { if (!e.repeat) togglePause(); return; }
  keys.add(e.code);
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());

const KEYMAPS = {
  solo: { up: ['ArrowUp', 'KeyW'], down: ['ArrowDown', 'KeyS'], left: ['ArrowLeft', 'KeyA'], right: ['ArrowRight', 'KeyD'], kick: ['Space', 'KeyX', 'Enter'] },
  p1: { up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'], kick: ['Space'] },
  p2: { up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'], kick: ['Enter', 'NumpadEnter', 'KeyL', 'Numpad0'] },
};
const anyKey = (list) => list.some((k) => keys.has(k));

const touch = { x: 0, y: 0, kick: false, active: false };
function setupTouch() {
  const stick = document.getElementById('stick'), knob = document.getElementById('knob');
  const kickBtn = document.getElementById('kick-btn');
  let id = null;
  const move = (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier !== id) continue;
      const r = stick.getBoundingClientRect();
      let dx = t.clientX - (r.left + r.width / 2), dy = t.clientY - (r.top + r.height / 2);
      const max = r.width / 2, len = Math.hypot(dx, dy);
      if (len > max) { dx *= max / len; dy *= max / len; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      const m = Math.hypot(dx, dy) / max;
      touch.x = m < 0.2 ? 0 : dx / max; touch.y = m < 0.2 ? 0 : dy / max;
    }
    e.preventDefault();
  };
  stick.addEventListener('touchstart', (e) => { id = e.changedTouches[0].identifier; touch.active = true; move(e); }, { passive: false });
  stick.addEventListener('touchmove', move, { passive: false });
  const end = (e) => {
    for (const t of e.changedTouches) if (t.identifier === id) {
      id = null; touch.x = touch.y = 0; knob.style.transform = '';
    }
  };
  stick.addEventListener('touchend', end); stick.addEventListener('touchcancel', end);
  kickBtn.addEventListener('touchstart', (e) => { touch.kick = true; touch.active = true; kickBtn.classList.add('on'); e.preventDefault(); }, { passive: false });
  const kEnd = () => { touch.kick = false; kickBtn.classList.remove('on'); };
  kickBtn.addEventListener('touchend', kEnd); kickBtn.addEventListener('touchcancel', kEnd);
}

function humanInput(map, useTouch) {
  let x = (anyKey(map.right) ? 1 : 0) - (anyKey(map.left) ? 1 : 0);
  let y = (anyKey(map.down) ? 1 : 0) - (anyKey(map.up) ? 1 : 0);
  let kick = anyKey(map.kick);
  if (useTouch && (touch.x || touch.y)) { x = touch.x; y = touch.y; }
  if (useTouch && touch.kick) kick = true;
  const l = Math.hypot(x, y);
  if (l > 1) { x /= l; y /= l; }
  return { x, y, kick };
}

// ---------------------------------------------------------------- jogo
const $ = (id) => document.getElementById(id);
const canvas = $('game');
const ctx = canvas.getContext('2d');

let game = null;
let paused = false;

function readOptions() {
  return {
    name: $('opt-name').value.trim() || 'Jogador',
    avatar: $('opt-avatar').value.trim().slice(0, 2),
    mode: $('opt-mode').value,
    team: +$('opt-team').value,
    size: +$('opt-size').value,
    diff: +$('opt-diff').value,
    stadium: $('opt-stadium').value,
    time: +$('opt-time').value * 60,
    goals: +$('opt-goals').value,
    sound: $('opt-sound').value === '1',
  };
}

function newGame(opt) {
  const st = buildStadium(STADIUMS[opt.stadium]);
  const players = [];
  const names = BOT_NAMES.slice().sort(() => Math.random() - 0.5);
  let botN = 0;
  const addPlayer = (team, name, avatar, control) => {
    const p = disc(0, 0, PHYS.playerRadius, PHYS.playerInvMass, PHYS.playerDamping, PHYS.playerBounce);
    Object.assign(p, { team, name, avatar, control, kickReady: true, kicking: false, input: { x: 0, y: 0, kick: false }, brain: { t: 0 } });
    players.push(p);
    return p;
  };
  const humans = [];
  if (opt.mode === 'solo') humans.push([opt.team, opt.name, opt.avatar, 'solo']);
  else {
    const t2 = opt.mode === 'duo-vs' ? 1 - opt.team : opt.team;
    humans.push([opt.team, opt.name, opt.avatar || '1', 'p1']);
    humans.push([t2, 'Jogador 2', '2', 'p2']);
  }
  for (const team of [RED, BLUE]) {
    const hs = humans.filter((h) => h[0] === team);
    for (const h of hs) addPlayer(...h);
    const need = Math.max(opt.size, hs.length) - hs.length;
    for (let i = 0; i < need; i++) addPlayer(team, names[botN++ % names.length], String(botN), 'bot');
  }
  const ball = disc(0, 0, PHYS.ballRadius, PHYS.ballInvMass, PHYS.ballDamping, PHYS.ballBounce);
  game = {
    opt, st, players, ball,
    score: [0, 0], ticks: 0, state: 'kickoff', kickoffTeam: Math.random() < 0.5 ? RED : BLUE,
    timer: 0, overtime: false, lastTouch: null, prevTouch: null, flash: 0, over: false,
  };
  Audio.on = opt.sound; Audio.init();
  resetPositions();
  Audio.whistle(0.45);
  $('menu').classList.add('hidden');
  $('overlay').classList.add('hidden');
  $('hud').classList.remove('hidden');
  if (matchMedia('(pointer: coarse)').matches || touch.active) $('touch').classList.remove('hidden');
  paused = false;
  updateHud();
}

function formation(n, idx) {
  // posições relativas (fração do meio-campo), do ataque para a defesa
  const f = {
    1: [[0.45, 0]],
    2: [[0.35, 0], [0.7, 0.25]],
    3: [[0.3, 0], [0.6, -0.45], [0.6, 0.45]],
    4: [[0.28, 0], [0.55, -0.5], [0.55, 0.5], [0.82, 0]],
  };
  const list = f[Math.min(n, 4)];
  if (idx < list.length) return list[idx];
  return [0.5 + 0.1 * (idx % 3), ((idx % 2) ? 1 : -1) * 0.7];
}

function resetPositions() {
  const { st, players, ball } = game;
  ball.x = ball.y = ball.vx = ball.vy = 0;
  for (const team of [RED, BLUE]) {
    const list = players.filter((p) => p.team === team);
    const side = team === RED ? -1 : 1;
    list.forEach((p, i) => {
      const [fx, fy] = formation(list.length, i);
      p.x = side * fx * st.W; p.y = fy * st.H;
      if (i === 0 && team === game.kickoffTeam) p.x = side * (st.circle * 0.5);
      p.vx = p.vy = 0; p.kickReady = true;
    });
  }
  game.state = 'kickoff';
  game.lastTouch = game.prevTouch = null;
}

function inputFor(p) {
  if (p.control === 'bot') return botThink(p);
  const map = KEYMAPS[p.control];
  return humanInput(map, p.control === 'solo' || p.control === 'p1');
}

function step() {
  const g = game, { st, players, ball } = g;
  g.ticks++;
  if (g.state === 'goal' || g.state === 'over') {
    g.flash--;
    if (g.state === 'goal' && g.flash <= 0) {
      if (g.over) return endMatch();
      resetPositions();
      Audio.whistle(0.3);
      hideBanner();
    }
  }
  // entradas e chute
  for (const p of players) {
    const inp = g.state === 'over' ? { x: 0, y: 0, kick: false } : inputFor(p);
    p.input = inp;
    if (!inp.kick) p.kickReady = true;
    p.kicking = inp.kick && p.kickReady;
    const a = p.kicking ? PHYS.kickingAccel : PHYS.accel;
    p.vx += inp.x * a; p.vy += inp.y * a;
    if (p.kicking) {
      const dx = ball.x - p.x, dy = ball.y - p.y, d = Math.hypot(dx, dy);
      if (d - p.r - ball.r < PHYS.kickReach && d > 0) {
        ball.vx += (dx / d) * PHYS.kickStrength * ball.invMass;
        ball.vy += (dy / d) * PHYS.kickStrength * ball.invMass;
        p.kickReady = false; p.kicking = false;
        touchBall(p);
        Audio.kick();
      }
    }
  }
  // integração
  for (const d of [...players, ball]) {
    d.x += d.vx; d.y += d.vy;
    d.vx *= d.damping; d.vy *= d.damping;
  }
  // colisões entre discos
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) collideDiscs(players[i], players[j]);
    const p = players[i];
    const rel = Math.hypot(ball.vx - p.vx, ball.vy - p.vy);
    if (collideDiscs(p, ball)) { touchBall(p); Audio.bump(rel); }
  }
  // traves e redes
  for (const d of [...players, ball]) {
    for (const post of st.posts) {
      const v = Math.hypot(d.vx, d.vy);
      if (collideDiscs(post, d) && d === ball) Audio.bump(v);
    }
    for (const s of st.allSegs) collideSeg(d, s);
  }
  for (const s of st.ballSegs) collideSeg(ball, s);
  // limites dos jogadores
  const LX = st.W + st.margin, LY = st.H + st.margin;
  for (const p of players) {
    if (p.x < -LX + p.r) { p.x = -LX + p.r; p.vx = Math.abs(p.vx) * 0.1; }
    if (p.x > LX - p.r) { p.x = LX - p.r; p.vx = -Math.abs(p.vx) * 0.1; }
    if (p.y < -LY + p.r) { p.y = -LY + p.r; p.vy = Math.abs(p.vy) * 0.1; }
    if (p.y > LY - p.r) { p.y = LY - p.r; p.vy = -Math.abs(p.vy) * 0.1; }
    if (g.state === 'kickoff') kickoffBarrier(p);
  }
  // saída de bola
  if (g.state === 'kickoff' && (Math.abs(ball.vx) > 0.01 || Math.abs(ball.vy) > 0.01)) g.state = 'play';
  if (g.state === 'play') {
    g.timer++;
    if (Math.abs(ball.x) > st.W + ball.r * 0 && Math.abs(ball.y) < st.goal) {
      const scorer = ball.x > 0 ? RED : BLUE;
      goal(scorer);
    } else if (g.opt.time && g.timer >= g.opt.time * 60 && !g.overtime) {
      if (g.score[0] !== g.score[1]) finish();
      else { g.overtime = true; showBanner('PRORROGAÇÃO', 'gol de ouro', ''); g.bannerT = 150; Audio.whistle(0.25, 2); }
    }
  }
  if (g.bannerT > 0 && --g.bannerT === 0) hideBanner();
}

function touchBall(p) {
  if (game.lastTouch !== p) { game.prevTouch = game.lastTouch; game.lastTouch = p; }
}

function kickoffBarrier(p) {
  const { st } = game;
  const side = p.team === RED ? -1 : 1;
  const R = st.circle;
  const dc = Math.hypot(p.x, p.y);
  if (p.team === game.kickoffTeam) {
    // pode entrar no círculo central, mas não no campo adversário fora dele
    if (side * p.x < p.r && dc > R) {
      const toLine = p.r - side * p.x;
      const toCircle = dc - R;
      if (toLine <= toCircle || dc === 0) { p.x = side * p.r; if (side * p.vx < 0) p.vx = 0; }
      else { p.x *= R / dc; p.y *= R / dc; }
    }
  } else {
    if (side * p.x < p.r) { p.x = side * p.r; if (side * p.vx < 0) p.vx = 0; }
    const d = Math.hypot(p.x, p.y), min = R + p.r;
    if (d < min) {
      const nx = d ? p.x / d : side, ny = d ? p.y / d : 0;
      p.x = nx * min; p.y = ny * min;
      const vn = p.vx * nx + p.vy * ny;
      if (vn < 0) { p.vx -= nx * vn; p.vy -= ny * vn; }
    }
  }
}

function goal(team) {
  const g = game;
  g.score[team]++;
  g.state = 'goal'; g.flash = 180;
  g.kickoffTeam = 1 - team;
  const lt = g.lastTouch;
  let sub = '';
  if (lt) sub = lt.team === team ? `${lt.name}` : `gol contra de ${lt.name}`;
  if (lt && lt.team === team && g.prevTouch && g.prevTouch.team === team && g.prevTouch !== lt) sub += ` (assist. ${g.prevTouch.name})`;
  showBanner('GOL!', sub, team === RED ? 'red' : 'blue');
  Audio.cheer(); Audio.whistle(0.2);
  updateHud();
  const limit = g.opt.goals;
  if ((limit && g.score[team] >= limit) || g.overtime) g.over = true;
}

function finish() {
  game.state = 'goal'; game.flash = 120; game.over = true;
  Audio.whistle(0.4, 3);
  showBanner('FIM DE JOGO', `${game.score[0]} x ${game.score[1]}`, '');
}

function endMatch() {
  const g = game;
  g.state = 'over';
  hideBanner();
  const [r, b] = g.score;
  const w = r === b ? null : (r > b ? RED : BLUE);
  $('ov-title').textContent = w === null ? 'Empate' : `Vitória do ${TEAM_NAME[w]}!`;
  $('ov-sub').textContent = `Vermelho ${r} x ${b} Azul`;
  $('btn-resume').classList.add('hidden');
  $('overlay').classList.remove('hidden');
}

// ---------------------------------------------------------------- bots
const DIFF = [
  { speed: 0.7, think: 14, aim: 0.55, error: 30 },
  { speed: 0.9, think: 6, aim: 0.75, error: 14 },
  { speed: 1.0, think: 2, aim: 0.85, error: 4 },
];

function botThink(p) {
  const g = game, { st, ball, players } = g;
  const cfg = DIFF[g.opt.diff];
  const b = p.brain;
  if (g.state === 'goal') return { x: 0, y: 0, kick: false };
  // na saída de bola, o time que não sai espera
  if (g.state === 'kickoff' && p.team !== g.kickoffTeam) return seek(p, p.x, p.y, 0);

  const attackX = p.team === RED ? st.W : -st.W;
  const ownX = -attackX;
  const mates = players.filter((q) => q.team === p.team);
  const dist = (q) => Math.hypot(q.x - ball.x, q.y - ball.y);
  const order = mates.slice().sort((a, c) => dist(a) - dist(c));
  const rank = order.indexOf(p);

  // pensa de tempos em tempos (reação)
  if (--b.t <= 0) {
    b.t = cfg.think + ((Math.random() * 4) | 0);
    b.err = (Math.random() - 0.5) * cfg.error;
  }

  // bola prevista um pouco à frente
  const lead = g.opt.diff === 2 ? 10 : 5;
  const bx = ball.x + ball.vx * lead, by = ball.y + ball.vy * lead;

  const keeper = mates.length >= 3 && rank === mates.length - 1;
  if (keeper && Math.abs(ball.x - ownX) > st.W * 0.6) {
    // goleiro: fica entre a bola e o gol
    const gx = ownX - Math.sign(ownX) * 40, gy = Math.max(-st.goal, Math.min(st.goal, by * 0.4));
    return seek(p, gx, gy, 0);
  }

  if (rank === 0 || (rank === 1 && mates.length >= 4 && dist(p) < 120)) {
    // atacante: posiciona atrás da bola na direção do gol
    const aimY = Math.max(-st.goal * 0.6, Math.min(st.goal * 0.6, by * 0.3)) + (b.err || 0);
    let dx = attackX - bx, dy = aimY - by;
    const dl = Math.hypot(dx, dy); dx /= dl; dy /= dl;
    const behind = (p.x - bx) * dx + (p.y - by) * dy; // < 0 = atrás da bola (bom)
    const reach = p.r + ball.r;
    let tx, ty;
    if (behind > -reach * 0.6) {
      // está na frente da bola: contorna pelo lado em que está
      const px = -dy, py = dx;
      const sideS = ((p.x - bx) * px + (p.y - by) * py) >= 0 ? 1 : -1;
      tx = bx - dx * (reach + 14) + px * sideS * (reach + 12);
      ty = by - dy * (reach + 14) + py * sideS * (reach + 12);
    } else {
      tx = bx - dx * (reach - 2); ty = by - dy * (reach - 2);
    }
    const tb = Math.hypot(ball.x - p.x, ball.y - p.y);
    const nx = (ball.x - p.x) / tb, ny = (ball.y - p.y) / tb;
    const aligned = nx * dx + ny * dy;
    const near = tb - reach < PHYS.kickReach + 1;
    // chuta se alinhado com o gol, ou afasta o perigo perto do próprio gol
    const danger = Math.abs(ball.x - ownX) < st.W * 0.45 && nx * Math.sign(ownX) < 0.2;
    const distGoal = Math.abs(attackX - ball.x);
    const shoot = aligned > cfg.aim && (distGoal < st.W * 1.1 || Math.random() < 0.04);
    const kick = near && (shoot || danger) && p.kickReady;
    return seek(p, tx, ty, 1, kick);
  }

  // apoio: abre espaço entre a bola e o próprio gol
  const lane = [0, -0.55, 0.55, 0][rank % 4] * st.H;
  const sx = ownX + (bx - ownX) * (rank === 1 ? 0.45 : 0.65);
  return seek(p, sx, lane + by * 0.3, 0);
}

function seek(p, tx, ty, eager, kick = false) {
  const cfg = DIFF[game.opt.diff];
  let dx = tx - p.x, dy = ty - p.y;
  const d = Math.hypot(dx, dy);
  if (d < 3) return { x: 0, y: 0, kick };
  // desacelera ao chegar, para não passar do ponto
  const speed = Math.hypot(p.vx, p.vy);
  const brake = d < speed * 14 && !eager ? 0.3 : 1;
  dx /= d; dy /= d;
  // corrige a velocidade lateral
  const want = cfg.speed * brake;
  let ix = dx * want - p.vx * 0.15, iy = dy * want - p.vy * 0.15;
  const il = Math.hypot(ix, iy);
  if (il > 1) { ix /= il; iy /= il; }
  return { x: ix, y: iy, kick };
}

// ---------------------------------------------------------------- HUD
function updateHud() {
  $('score-red').textContent = game.score[0];
  $('score-blue').textContent = game.score[1];
  const t = Math.floor(game.timer / 60);
  const c = $('clock');
  c.textContent = `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
  c.classList.toggle('ot', game.overtime);
}
let bannerTimer = 0;
function showBanner(text, sub, cls) {
  const b = $('banner');
  b.className = cls || '';
  b.innerHTML = '';
  b.append(text);
  if (sub) { const s = document.createElement('small'); s.textContent = sub; b.append(s); }
  b.style.animation = 'none'; void b.offsetWidth; b.style.animation = '';
  clearTimeout(bannerTimer);
}
function hideBanner() { $('banner').classList.add('hidden'); }

function togglePause() {
  if (!game || game.state === 'over') return;
  paused = !paused;
  $('ov-title').textContent = 'Pausado';
  $('ov-sub').textContent = `Vermelho ${game.score[0]} x ${game.score[1]} Azul`;
  $('btn-resume').classList.remove('hidden');
  $('overlay').classList.toggle('hidden', !paused);
  keys.clear();
}

// ---------------------------------------------------------------- desenho
let view = { s: 1, ox: 0, oy: 0, dpr: 1 };
function resize() {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.width = innerWidth * dpr; canvas.height = innerHeight * dpr;
  view.dpr = dpr;
}
addEventListener('resize', resize);

let pattern = null, patternFor = null;
function grassPattern(s) {
  // listras verticais de grama cortada, com leve textura
  if (patternFor === s) return pattern;
  const w = Math.max(8, Math.round(64 * s)), c = document.createElement('canvas');
  c.width = w * 2; c.height = w * 2;
  const g = c.getContext('2d');
  g.fillStyle = '#6f9d5c'; g.fillRect(0, 0, w * 2, w * 2);
  g.fillStyle = '#78a764'; g.fillRect(0, 0, w, w * 2);
  for (let i = 0; i < w * 3; i++) {
    g.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,.025)' : 'rgba(0,0,0,.03)';
    g.fillRect(Math.random() * w * 2, Math.random() * w * 2, 1.5, 1.5);
  }
  pattern = ctx.createPattern(c, 'repeat'); patternFor = s;
  return pattern;
}

function draw() {
  const W = canvas.width, H = canvas.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#3f5a36'; ctx.fillRect(0, 0, W, H);
  if (!game) return drawIdle();
  const { st, players, ball } = game;
  const fw = (st.W + st.margin) * 2, fh = (st.H + st.margin) * 2;
  const s = Math.min(W / fw, (H - 50 * view.dpr) / fh) * 0.98;
  ctx.setTransform(s, 0, 0, s, W / 2, H / 2 + 18 * view.dpr);

  // campo
  ctx.save();
  ctx.translate(-st.W, 0);
  ctx.fillStyle = grassPattern(1);
  ctx.fillRect(0, -st.H, st.W * 2, st.H * 2);
  ctx.restore();

  ctx.strokeStyle = '#d2e8c6'; ctx.lineWidth = 3;
  ctx.strokeRect(-st.W, -st.H, st.W * 2, st.H * 2);
  ctx.beginPath(); ctx.moveTo(0, -st.H); ctx.lineTo(0, st.H); ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 0, st.circle, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = '#d2e8c6';
  ctx.beginPath(); ctx.arc(0, 0, 3, 0, Math.PI * 2); ctx.fill();
  // áreas
  for (const sx of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(sx * st.W, 0, st.goal + 55, sx < 0 ? -Math.PI / 2 : Math.PI / 2, sx < 0 ? Math.PI / 2 : Math.PI * 1.5);
    ctx.stroke();
  }
  // barreira da saída de bola
  if (game.state === 'kickoff') {
    const side = game.kickoffTeam === RED ? 1 : -1;
    ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.setLineDash([6, 6]);
    ctx.beginPath(); ctx.arc(0, 0, st.circle, side > 0 ? -Math.PI / 2 : Math.PI / 2, side > 0 ? Math.PI / 2 : Math.PI * 1.5);
    ctx.stroke(); ctx.setLineDash([]);
  }
  // redes
  ctx.strokeStyle = '#111'; ctx.lineWidth = 3; ctx.lineCap = 'round';
  for (const sx of [-1, 1]) {
    ctx.beginPath();
    for (const sg of st.allSegs) if (Math.sign(sg.ax) === sx) { ctx.moveTo(sg.ax, sg.ay); ctx.lineTo(sg.bx, sg.by); }
    ctx.stroke();
  }
  // traves
  for (const p of st.posts) {
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fillStyle = p.team === RED ? '#f3b4ae' : '#c7cdfb'; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = '#111'; ctx.stroke();
  }

  // jogadores
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const p of players) {
    if (p.control !== 'bot') {
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 9, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,255,255,.28)'; ctx.lineWidth = 2; ctx.stroke();
    }
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fillStyle = TEAM_COLOR[p.team]; ctx.fill();
    const holding = p.input.kick && p.kickReady;
    ctx.lineWidth = holding ? 3 : 2;
    ctx.strokeStyle = holding ? '#fff' : '#111'; ctx.stroke();
    if (p.avatar) {
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${p.avatar.length > 1 ? 13 : 15}px system-ui, sans-serif`;
      ctx.fillText(p.avatar, p.x, p.y + 1);
    }
    ctx.font = '600 11px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,.88)';
    ctx.fillText(p.name, p.x, p.y + p.r + 12);
  }
  // bola
  ctx.beginPath(); ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
  ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#111'; ctx.stroke();
}

function drawIdle() {
  // fundo do menu: campo parado
  const W = canvas.width, H = canvas.height;
  ctx.fillStyle = grassPattern(1);
  ctx.fillRect(0, 0, W, H);
}

// ---------------------------------------------------------------- laço
let acc = 0, last = performance.now();
function frame(now) {
  const dt = Math.min(100, now - last); last = now;
  if (game && !paused && game.state !== 'over') {
    acc += dt;
    while (acc >= 1000 / 60) { step(); acc -= 1000 / 60; if (game.state === 'over') break; }
    if (game.ticks % 6 === 0) updateHud();
  } else acc = 0;
  draw();
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------- menu
function loadPrefs() {
  try {
    const p = JSON.parse(localStorage.getItem('chutebol') || '{}');
    for (const [k, v] of Object.entries(p)) { const el = $(k); if (el) el.value = v; }
  } catch { /* sem armazenamento */ }
}
function savePrefs() {
  try {
    const ids = ['opt-name', 'opt-avatar', 'opt-mode', 'opt-team', 'opt-size', 'opt-diff', 'opt-stadium', 'opt-time', 'opt-goals', 'opt-sound'];
    localStorage.setItem('chutebol', JSON.stringify(Object.fromEntries(ids.map((i) => [i, $(i).value]))));
  } catch { /* sem armazenamento */ }
}

$('btn-start').addEventListener('click', () => { savePrefs(); newGame(readOptions()); });
$('btn-resume').addEventListener('click', togglePause);
$('btn-pause').addEventListener('click', togglePause);
$('btn-restart').addEventListener('click', () => newGame(game.opt));
$('btn-menu').addEventListener('click', () => {
  game = null; paused = false;
  $('overlay').classList.add('hidden'); $('hud').classList.add('hidden');
  $('touch').classList.add('hidden'); hideBanner();
  $('menu').classList.remove('hidden');
});
addEventListener('touchstart', () => { touch.active = true; }, { once: true, passive: true });

loadPrefs();
setupTouch();
resize();
requestAnimationFrame(frame);

// para testes automatizados
window.__chutebol = { get game() { return game; }, step: () => step() };
