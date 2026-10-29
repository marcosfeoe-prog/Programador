// Nível 57 — o computador do chão: uma tela de computador antigo, de verdade
// (HTML por cima do jogo). Liga com a tela da BIOS, mostra uma área de trabalho
// com pastas e arquivos que contam os segredos do nível, abre textos e imagens,
// tem um "cameras.exe" sem sinal e um .bat que derruba o disjuntor geral.
import { TAU } from '../util.js';

const CSS = `
#pc57{position:fixed;inset:0;z-index:60;background:#050505;color:#000;display:flex;align-items:center;justify-content:center;font-family:'Tahoma','Verdana',sans-serif;user-select:none;-webkit-user-select:none;touch-action:none}
#pc57 .bezel{position:relative;width:min(96vw,150vh);height:min(72vw,90vh);background:#c8c0a8;border-radius:22px;box-shadow:inset 0 0 0 6px #a89f86,inset 0 0 40px #6a6250,0 0 60px #000;padding:min(3.2vw,4.5vh)}
#pc57 .screen{position:relative;width:100%;height:100%;border-radius:18px/14px;overflow:hidden;background:#000;box-shadow:inset 0 0 50px rgba(0,0,0,.9)}
#pc57 .scan{position:absolute;inset:0;pointer-events:none;background:repeating-linear-gradient(0deg,rgba(0,0,0,.18) 0,rgba(0,0,0,.18) 1px,transparent 2px,transparent 3px);z-index:50}
#pc57 .vig{position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse at center,transparent 60%,rgba(0,0,0,.55) 100%);z-index:51;animation:pc57f 0.12s infinite}
@keyframes pc57f{0%{opacity:.95}50%{opacity:1}100%{opacity:.97}}
#pc57 .bios{position:absolute;inset:0;color:#c8c8c8;font:clamp(10px,1.6vh,15px)/1.35 'Courier New',monospace;padding:2.2%;white-space:pre;background:#000}
#pc57 .desk{position:absolute;inset:0;background:#0f7a78;display:none}
#pc57 .icons{position:absolute;left:1.5%;top:2%;display:flex;flex-direction:column;flex-wrap:wrap;height:86%;gap:1.4vh 1vw}
#pc57 .ic{width:clamp(56px,8vh,86px);text-align:center;color:#fff;font-size:clamp(9px,1.45vh,13px);cursor:pointer;padding:3px}
#pc57 .ic .g{width:clamp(30px,5vh,46px);height:clamp(26px,4.2vh,40px);margin:0 auto 4px;position:relative}
#pc57 .ic.sel span{background:#000080;outline:1px dotted #fff}
#pc57 .g.folder{background:#e8c84a;border-radius:2px 6px 2px 2px;box-shadow:inset 0 -6px 0 #c8a030}
#pc57 .g.folder:before{content:'';position:absolute;left:0;top:-5px;width:45%;height:6px;background:#e8c84a;border-radius:3px 3px 0 0}
#pc57 .g.txt{background:#fff;width:70%!important;box-shadow:inset 0 0 0 1px #888}
#pc57 .g.txt:after{content:'';position:absolute;left:15%;right:15%;top:25%;height:50%;background:repeating-linear-gradient(0deg,#888 0,#888 1px,transparent 1px,transparent 5px)}
#pc57 .g.img{background:linear-gradient(#2a3a5a,#0a0a14);box-shadow:inset 0 0 0 2px #ddd}
#pc57 .g.img:after{content:'';position:absolute;left:30%;top:40%;width:8px;height:8px;border-radius:50%;background:#f22;box-shadow:12px 0 0 #f22}
#pc57 .g.exe{background:#c0c0c0;box-shadow:inset 0 0 0 2px #fff,inset -2px -2px 0 2px #808080}
#pc57 .g.exe:after{content:'';position:absolute;left:20%;top:30%;width:60%;height:40%;background:#000080}
#pc57 .g.bat{background:#1a1a1a;box-shadow:inset 0 0 0 2px #ccc}
#pc57 .g.bat:after{content:'C:\\\\>';position:absolute;left:4px;top:6px;color:#ccc;font:9px monospace}
#pc57 .g.bin{background:linear-gradient(90deg,#9aa,#dee,#9aa);border-radius:0 0 6px 6px;width:60%!important}
#pc57 .bar{color:#000;position:absolute;left:0;right:0;bottom:0;height:clamp(24px,4.4vh,36px);background:#c0c0c0;box-shadow:inset 0 2px 0 #fff;display:flex;align-items:center;padding:0 4px;gap:6px;z-index:40}
#pc57 .btn{background:#c0c0c0;box-shadow:inset -1px -1px 0 #000,inset 1px 1px 0 #fff,inset -2px -2px 0 #808080;padding:2px 10px;font-weight:bold;font-size:clamp(10px,1.6vh,14px);cursor:pointer}
#pc57 .btn:active{box-shadow:inset 1px 1px 0 #000,inset -1px -1px 0 #fff}
#pc57 .clock{margin-left:auto;box-shadow:inset 1px 1px 0 #808080,inset -1px -1px 0 #fff;padding:2px 10px;font-size:clamp(10px,1.5vh,13px)}
#pc57 .menu{position:absolute;left:2px;bottom:clamp(24px,4.4vh,36px);background:#c0c0c0;box-shadow:inset -1px -1px 0 #000,inset 1px 1px 0 #fff;display:none;z-index:45;min-width:200px}
#pc57 .menu div{padding:8px 16px;font-size:clamp(11px,1.7vh,15px);cursor:pointer}
#pc57 .menu div:hover{background:#000080;color:#fff}
#pc57 .win{position:absolute;background:#c0c0c0;box-shadow:inset -1px -1px 0 #000,inset 1px 1px 0 #dfdfdf,inset -2px -2px 0 #808080,inset 2px 2px 0 #fff,4px 4px 0 rgba(0,0,0,.35);padding:3px;display:flex;flex-direction:column;z-index:20}
#pc57 .tt{background:linear-gradient(90deg,#000080,#1084d0);color:#fff;font-weight:bold;font-size:clamp(10px,1.6vh,14px);padding:3px 4px;display:flex;align-items:center}
#pc57 .tt .x{margin-left:auto;background:#c0c0c0;color:#000;width:18px;height:16px;line-height:14px;text-align:center;box-shadow:inset -1px -1px 0 #000,inset 1px 1px 0 #fff;cursor:pointer;font-size:12px}
#pc57 .body{flex:1;background:#fff;color:#000;margin-top:3px;box-shadow:inset 1px 1px 0 #808080,inset -1px -1px 0 #fff;overflow:auto;padding:8px;font-size:clamp(11px,1.7vh,15px)}
#pc57 .body.mono{font-family:'Courier New',monospace;white-space:pre-wrap;line-height:1.4}
#pc57 .body.dark{background:#000;color:#c0c0c0}
#pc57 .list{display:flex;flex-wrap:wrap;gap:10px;align-content:flex-start}
#pc57 .list .ic{color:#000}
#pc57 canvas{width:100%;height:100%;display:block;background:#000}
#pc57 .hint{position:absolute;right:1.2%;top:1%;color:rgba(255,255,255,.75);font-size:clamp(9px,1.4vh,12px);z-index:30;text-shadow:1px 1px 0 #000}
`;

// os arquivos (texto em português, ninguém assina)
const FS = {
  name: 'C:',
  kids: [
    {
      name: 'LEIA-ME.txt',
      t: 'txt',
      id: 'leiame',
      text: `Se você está lendo isso, você também ficou preso no shopping.

Ele nunca fecha. As luzes ficam acesas, a música toca, as escadas funcionam.
Só não tem ninguém. Nunca teve.

Eu deixei tudo o que descobri nessas pastas.
Leia tudo antes de sair desta sala.

E não se assuste com os passos. Eles sempre vêm de trás.`,
    },
    {
      name: 'Segurança',
      t: 'dir',
      kids: [
        {
          name: 'relatorio_017.txt',
          t: 'txt',
          id: 'gigante',
          text: `RELATÓRIO DE SEGURANÇA Nº 017 — "O GIGANTE"

Altura estimada: 3,5 metros. Totalmente negro. Não reflete luz nenhuma.
Só os olhos aparecem: dois pontos vermelhos, brilhantes, sempre parados.

Ele fica no escuro. Dentro das lojas apagadas, no fim dos corredores,
atrás das grades. Não se mexe. Só OLHA. O tempo todo.

Ele não ataca. Testamos: chegamos perto com a lanterna.
Ele recuou. Devagar, de costas, até sumir no escuro.
Como se tivesse medo da gente.

Ninguém sabe do que ele tem medo. Ou de quem.`,
        },
        {
          name: 'passos.txt',
          t: 'txt',
          id: 'passos',
          text: `Os passos.

Quando você anda pelo corredor principal, às vezes escuta passos atrás.
No mesmo ritmo que os seus. Um pouco atrasados.

Se você para, eles param.
Se você se vira, não tem ninguém.

Já contei 31 vezes. Nunca vi o dono.`,
        },
        { name: 'camera_04.jpg', t: 'img', id: 'foto', img: 'eyes' },
        { name: 'cameras.exe', t: 'exe', id: 'cameras', app: 'cameras' },
      ],
    },
    {
      name: 'Manutenção',
      t: 'dir',
      kids: [
        {
          name: 'apagao.txt',
          t: 'txt',
          id: 'apagao',
          text: `EVENTO DE APAGÃO (procedimento interno)

Às vezes o disjuntor geral cai sozinho. Quando isso acontece,
TODAS as luzes do nível 57 se apagam. Todas. Ao mesmo tempo.

O apagão dura exatamente 2 minutos (120 segundos).
Depois a energia volta sozinha, piscando.

Durante o apagão:
 - fique parado ou ande com a lanterna;
 - não se assuste com os olhos. Eles aparecem em todo lugar no escuro;
 - não corra para o corredor de serviço.

O disjuntor pode ser testado pelo arquivo testar_disjuntor.bat.
NÃO EXECUTE se você não estiver preparado.`,
        },
        {
          name: 'disjuntor.log',
          t: 'txt',
          id: 'log',
          text: `03/11  02:14  QUEDA DO DISJUNTOR GERAL — 120 s
07/11  19:40  QUEDA DO DISJUNTOR GERAL — 120 s
07/11  19:43  movimento detectado: praça de alimentação (sem imagem)
12/11  11:02  QUEDA DO DISJUNTOR GERAL — 120 s
12/11  11:04  movimento detectado: corredor de serviço (sem imagem)
13/11  --:--  QUEDA DO DISJUNTOR GERAL — 120 s
13/11  --:--  QUEDA DO DISJUNTOR GERAL — 120 s
13/11  --:--  QUEDA DO DISJUNTOR GERAL — 120 s
??/??  --:--  ele estava parado na frente da câmera 4 o apagão inteiro`,
        },
        { name: 'testar_disjuntor.bat', t: 'bat', id: 'bat', app: 'bat' },
      ],
    },
    {
      name: 'Saídas',
      t: 'dir',
      kids: [
        {
          name: 'dutos.txt',
          t: 'txt',
          id: 'dutos',
          text: `SAÍDA ALTERNATIVA — DUTO DE VENTILAÇÃO

Atrás da praça de alimentação, num nicho no fundo, tem uma grade de
ventilação na altura do chão. Ela solta com um puxão.

O duto é apertado e desce. Do outro lado: um lugar de paredes amarelas,
carpete úmido e zumbido de lâmpada. Uma versão menor do Saguão.
(nível 0.1)`,
        },
        {
          name: 'corredor_funcionarios.txt',
          t: 'txt',
          id: 'corredor',
          text: `SAÍDA — CORREDOR DE SERVIÇO

Na praça de alimentação, na parede oeste, tem uma porta:
"SOMENTE FUNCIONÁRIOS". Ela não está trancada.

Atrás dela começa um corredor de serviço. Sem luz nenhuma.
São 150 metros em linha reta. Leve a lanterna. Não pare no meio.

No fim tem uma porta de metal, fria. Do outro lado se ouve água e
grilos. Um lago. Uma floresta à noite. (nível 88)`,
        },
      ],
    },
    {
      name: 'Lixeira',
      t: 'dir',
      bin: true,
      kids: [
        {
          name: 'NAO_ABRA.txt',
          t: 'txt',
          id: 'naoabra',
          text: `ele não tem medo de você

ele tem medo do que anda atrás de você`,
        },
        { name: 'foto_antiga.jpg', t: 'img', id: 'antiga', img: 'mall' },
      ],
    },
  ],
};

const TYPE = { dir: 'folder', txt: 'txt', img: 'img', exe: 'exe', bat: 'bat' };

export class Computer {
  // cb: { onClose, onRead(id), onBat() }
  constructor(cb) {
    this.cb = cb;
    this.read = new Set();
    this.z = 20;
  }

  open() {
    if (this.el) return;
    if (!document.getElementById('pc57css')) {
      const st = document.createElement('style');
      st.id = 'pc57css';
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    const el = document.createElement('div');
    el.id = 'pc57';
    el.innerHTML = `<div class="bezel"><div class="screen"><div class="bios"></div><div class="desk"><div class="icons"></div><div class="menu"><div data-a="off">Desligar o computador…</div></div><div class="bar"><div class="btn start">Iniciar</div><div class="clock"></div></div></div><div class="hint">Esc / botão Iniciar → Desligar para sair</div><div class="scan"></div><div class="vig"></div></div></div>`;
    document.body.appendChild(el);
    this.el = el;
    this.screen = el.querySelector('.screen');
    this.desk = el.querySelector('.desk');
    this.key = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        this.close();
      }
    };
    window.addEventListener('keydown', this.key);
    this.boot();
  }

  boot() {
    const b = this.el.querySelector('.bios');
    const lines = [
      'Award Modular BIOS v4.51PG, An Energy Star Ally',
      'Copyright (C) 1984-97, Award Software, Inc.',
      '',
      'PENTIUM-MMX CPU at 200MHz',
      'Memory Test :  32768K OK',
      '',
      'Detecting IDE Primary Master  ... SHOPPING_57',
      'Detecting IDE Primary Slave   ... None',
      '',
      'Verificando NVRAM..',
      'AVISO: a hora do sistema parou em 13/11 --:--',
      '',
      'Iniciando o Windows...',
    ];
    let i = 0;
    const step = () => {
      if (!this.el) return;
      if (i < lines.length) {
        b.textContent += lines[i++] + '\n';
        this.timer = setTimeout(step, i === 5 || i === 13 ? 420 : 120);
      } else this.timer = setTimeout(() => this.showDesk(), 700);
    };
    step();
  }

  showDesk() {
    if (!this.el) return;
    this.el.querySelector('.bios').style.display = 'none';
    this.desk.style.display = 'block';
    const icons = this.desk.querySelector('.icons');
    for (const f of FS.kids) icons.appendChild(this.icon(f));
    const start = this.desk.querySelector('.start');
    const menu = this.desk.querySelector('.menu');
    start.addEventListener('click', (e) => {
      e.stopPropagation();
      menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
    });
    menu.querySelector('[data-a=off]').addEventListener('click', () => this.close());
    this.desk.addEventListener('click', () => (menu.style.display = 'none'));
    const clock = this.desk.querySelector('.clock');
    const tick = () => {
      if (!this.el) return;
      // o relógio anda, mas os minutos nunca passam de 13:13
      const s = Math.floor(performance.now() / 1000) % 60;
      clock.textContent = `13:13:${String(s).padStart(2, '0')}`;
      this.clockT = setTimeout(tick, 1000);
    };
    tick();
    this.openFile(FS.kids[0]);
  }

  icon(f) {
    const d = document.createElement('div');
    d.className = 'ic';
    d.innerHTML = `<div class="g ${f.bin ? 'bin' : TYPE[f.t]}"></div><span>${f.name}</span>`;
    d.addEventListener('click', (e) => {
      e.stopPropagation();
      this.openFile(f);
    });
    return d;
  }

  win(title, w, h, cls = '') {
    const W = document.createElement('div');
    W.className = 'win';
    const n = this.desk.querySelectorAll('.win').length;
    W.style.cssText = `left:${10 + ((n * 4) % 30)}%;top:${4 + ((n * 5) % 24)}%;width:${w}%;height:${h}%;z-index:${++this.z}`;
    W.innerHTML = `<div class="tt"><span>${title}</span><div class="x">×</div></div><div class="body ${cls}"></div>`;
    W.querySelector('.x').addEventListener('click', (e) => {
      e.stopPropagation();
      W.remove();
      if (W._stop) W._stop();
    });
    W.addEventListener('pointerdown', () => (W.style.zIndex = ++this.z));
    // arrastar pela barra de título
    const tt = W.querySelector('.tt');
    tt.addEventListener('pointerdown', (e) => {
      const r = this.desk.getBoundingClientRect();
      const ox = e.clientX - W.offsetLeft;
      const oy = e.clientY - W.offsetTop;
      const mv = (ev) => {
        W.style.left = Math.max(0, Math.min(r.width - 60, ev.clientX - ox)) + 'px';
        W.style.top = Math.max(0, Math.min(r.height - 40, ev.clientY - oy)) + 'px';
      };
      const up = () => {
        window.removeEventListener('pointermove', mv);
        window.removeEventListener('pointerup', up);
      };
      window.addEventListener('pointermove', mv);
      window.addEventListener('pointerup', up);
    });
    this.desk.appendChild(W);
    return W;
  }

  openFile(f) {
    if (f.id) {
      this.read.add(f.id);
      if (this.cb.onRead) this.cb.onRead(f.id, this.read);
    }
    if (f.t === 'dir') {
      const W = this.win(f.name, 46, 50);
      const body = W.querySelector('.body');
      body.classList.add('list');
      if (!f.kids.length) body.textContent = '(vazio)';
      for (const k of f.kids) body.appendChild(this.icon(k));
    } else if (f.t === 'txt') {
      const W = this.win(f.name + ' - Bloco de Notas', 56, 66, 'mono');
      W.querySelector('.body').textContent = f.text;
    } else if (f.t === 'img') {
      const W = this.win(f.name, 50, 60);
      const body = W.querySelector('.body');
      body.style.padding = '0';
      const c = document.createElement('canvas');
      c.width = 480;
      c.height = 360;
      body.appendChild(c);
      if (f.img === 'eyes') drawEyes(c);
      else drawMall(c);
    } else if (f.t === 'exe') {
      const W = this.win('Câmeras de Segurança', 58, 62);
      const body = W.querySelector('.body');
      body.style.padding = '0';
      const c = document.createElement('canvas');
      c.width = 320;
      c.height = 240;
      body.appendChild(c);
      let t = 0;
      let on = true;
      const loop = () => {
        if (!on || !this.el) return;
        t++;
        noise(c, t);
        requestAnimationFrame(loop);
      };
      W._stop = () => (on = false);
      loop();
    } else if (f.t === 'bat') {
      const W = this.win('C:\\MANUTENCAO\\testar_disjuntor.bat', 54, 46, 'mono dark');
      const body = W.querySelector('.body');
      const L = [
        'C:\\MANUTENCAO> testar_disjuntor.bat',
        '',
        'Conectando ao quadro geral.......... OK',
        'Disjuntor geral: LIGADO',
        'Agendando desligamento de teste...',
        '',
        'AVISO: TODAS AS LUZES SERÃO DESLIGADAS',
        'Duração: 120 segundos.',
        'O desligamento começa alguns segundos depois que este computador for desligado.',
        '',
        'Pressione qualquer tecla para continuar . . .',
      ];
      let i = 0;
      const step = () => {
        if (!this.el || i >= L.length) return;
        body.textContent += L[i++] + '\n';
        setTimeout(step, 220);
      };
      step();
      if (this.cb.onBat) this.cb.onBat();
    }
  }

  close() {
    if (!this.el) return;
    window.clearTimeout(this.timer);
    window.clearTimeout(this.clockT);
    for (const w of this.el.querySelectorAll('.win')) if (w._stop) w._stop();
    window.removeEventListener('keydown', this.key);
    this.el.remove();
    this.el = null;
    if (this.cb.onClose) this.cb.onClose(this.read);
  }
}

// ------------------------------------------------------------ imagens
function drawEyes(c) {
  const x = c.getContext('2d');
  const W = c.width;
  const H = c.height;
  x.fillStyle = '#05060a';
  x.fillRect(0, 0, W, H);
  // um corredor escuro em perspectiva (câmera 4)
  x.strokeStyle = 'rgba(80,90,110,0.35)';
  x.lineWidth = 2;
  for (const [a, b] of [
    [0, 0.85],
    [1, 0.85],
  ]) {
    x.beginPath();
    x.moveTo(a * W, H);
    x.lineTo(W * 0.5 + (a - 0.5) * 70, H * 0.5);
    x.stroke();
    void b;
  }
  for (let i = 0; i < 6; i++) {
    x.fillStyle = `rgba(140,150,160,${0.15 - i * 0.02})`;
    x.fillRect(W * 0.5 - 60 + i * 8, 40 + i * 14, 120 - i * 16, 4);
  }
  // a silhueta (quase invisível) e os olhos
  x.fillStyle = 'rgba(0,0,0,0.9)';
  x.beginPath();
  x.ellipse(W * 0.53, H * 0.52, 30, 120, 0, 0, TAU);
  x.fill();
  for (const s of [-1, 1]) {
    const g = x.createRadialGradient(W * 0.53 + s * 11, H * 0.24, 0, W * 0.53 + s * 11, H * 0.24, 14);
    g.addColorStop(0, '#fff0f0');
    g.addColorStop(0.25, '#ff2020');
    g.addColorStop(1, 'rgba(255,0,0,0)');
    x.fillStyle = g;
    x.fillRect(W * 0.53 + s * 11 - 14, H * 0.24 - 14, 28, 28);
  }
  // ruído e carimbo de câmera
  noise(c, 3, 0.25);
  x.fillStyle = '#e8e8e8';
  x.font = '14px monospace';
  x.fillText('CAM 04  13/11  --:--:--', 10, 20);
  x.fillText('● REC', W - 70, 20);
}

function drawMall(c) {
  const x = c.getContext('2d');
  const W = c.width;
  const H = c.height;
  const g = x.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#d8d0b8');
  g.addColorStop(1, '#8a7a5a');
  x.fillStyle = g;
  x.fillRect(0, 0, W, H);
  // gente desfocada numa foto velha do shopping cheio
  for (let i = 0; i < 26; i++) {
    const px = Math.random() * W;
    const py = H * 0.55 + Math.random() * H * 0.25;
    const s = 0.5 + (py / H) * 0.9;
    x.fillStyle = `rgba(${60 + Math.random() * 60},${40 + Math.random() * 40},${30},0.55)`;
    x.beginPath();
    x.ellipse(px, py, 9 * s, 30 * s, 0, 0, TAU);
    x.fill();
    x.beginPath();
    x.arc(px, py - 36 * s, 7 * s, 0, TAU);
    x.fill();
  }
  // e uma figura alta, preta, no fundo
  x.fillStyle = '#000';
  x.beginPath();
  x.ellipse(W * 0.82, H * 0.42, 10, 62, 0, 0, TAU);
  x.fill();
  x.fillStyle = '#ff2a2a';
  x.fillRect(W * 0.82 - 5, H * 0.29, 3, 2);
  x.fillRect(W * 0.82 + 2, H * 0.29, 3, 2);
  // sépia e manchas
  x.fillStyle = 'rgba(120,80,30,0.25)';
  x.fillRect(0, 0, W, H);
  x.fillStyle = '#222';
  x.font = 'italic 16px Georgia';
  x.fillText('inauguração — 1989', 14, H - 14);
}

function noise(c, t, a = 1) {
  const x = c.getContext('2d');
  const W = c.width;
  const H = c.height;
  const img = x.getImageData(0, 0, W, H);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const v = Math.random() * 255;
    d[i] = d[i] * (1 - a) + v * a;
    d[i + 1] = d[i + 1] * (1 - a) + v * a;
    d[i + 2] = d[i + 2] * (1 - a) + v * a;
  }
  x.putImageData(img, 0, 0);
  if (a >= 1) {
    x.fillStyle = 'rgba(0,0,0,0.6)';
    x.fillRect(W / 2 - 70, H / 2 - 16, 140, 32);
    x.fillStyle = '#fff';
    x.font = 'bold 18px monospace';
    x.textAlign = 'center';
    x.fillText(t % 60 < 40 ? 'SEM SINAL' : 'CAM ' + String(1 + (Math.floor(t / 60) % 6)).padStart(2, '0'), W / 2, H / 2 + 6);
    x.textAlign = 'left';
  }
}
