// Desenho procedural dos carros em SVG (vista lateral, frente para a direita).

const F = {
  hatch: {
    w: [52, 150], r: 13, door: 84, hl: [181, 47], tl: [17, 44],
    body: 'M16,64 L16,44 Q17,38 22,36 L40,19 Q44,15 54,15 L112,15 Q122,15 130,22 L150,38 L176,43 Q186,45 186,54 L186,62 Q186,66 181,66 L21,66 Q16,66 16,64 Z',
    win: 'M44,21 L108,21 Q116,21 122,26 L138,38 L30,38 Z',
  },
  sedan: {
    w: [50, 152], r: 13, door: 96, hl: [184, 47], tl: [13, 45],
    body: 'M12,64 L12,46 Q13,40 22,38 L46,36 L66,20 Q70,16 80,16 L116,16 Q126,16 132,22 L150,37 L180,42 Q189,44 189,54 L189,62 Q189,66 184,66 L17,66 Q12,66 12,64 Z',
    win: 'M70,21 L114,21 Q121,21 126,25 L141,37 L54,37 Z',
  },
  suv: {
    w: [50, 152], r: 15, door: 84, hl: [183, 42], tl: [15, 34],
    body: 'M14,62 L14,34 Q14,28 20,24 L34,12 Q38,9 46,9 L116,9 Q126,9 132,16 L148,32 L178,36 Q188,38 188,48 L188,60 Q188,64 183,64 L19,64 Q14,64 14,62 Z',
    win: 'M40,15 L114,15 Q120,15 125,20 L138,32 L26,32 L26,28 Z',
  },
  picape: {
    w: [48, 154], r: 15, door: 112, hl: [185, 43], tl: [11, 41],
    body: 'M10,62 L10,36 L84,36 L84,16 Q84,11 90,11 L122,11 Q130,11 135,17 L148,33 L180,37 Q190,39 190,48 L190,60 Q190,64 185,64 L15,64 Q10,64 10,62 Z',
    win: 'M90,17 L120,17 Q126,17 130,22 L139,33 L90,33 Z',
    extra: '<path d="M84,36 L84,64" stroke="#0006" stroke-width="1.5"/><path d="M12,42 L82,42" stroke="#0004" stroke-width="1.5"/>',
  },
  cupe: {
    w: [50, 152], r: 13, door: 104, hl: [184, 49], tl: [13, 47],
    body: 'M12,64 L12,48 Q13,42 24,40 L52,36 L84,21 Q92,18 104,18 L116,18 Q126,18 134,25 L150,39 L180,44 Q189,46 189,55 L189,62 Q189,66 184,66 L17,66 Q12,66 12,64 Z',
    win: 'M88,24 Q94,22 104,22 L115,22 Q122,22 128,27 L141,39 L62,38 Z',
  },
  super: {
    w: [48, 154], r: 13, door: 106, hl: [182, 54], tl: [11, 46],
    body: 'M10,64 L10,46 Q12,40 24,38 L60,34 L86,24 Q94,21 104,22 L118,24 Q128,26 140,36 L182,50 Q190,52 190,58 L190,62 Q190,66 185,66 L15,66 Q10,66 10,64 Z',
    win: 'M90,28 Q96,26 104,26 L116,28 Q124,30 133,37 L72,36 Z',
    extra: '<path d="M6,28 L36,28 L36,32 L6,32 Z M18,32 L24,32 L26,40 L20,40 Z" fill="#111319"/><path d="M62,44 L80,42 L78,52 L64,52 Z" fill="#0008"/>',
  },
  classico: {
    w: [48, 156], r: 13, door: 90, hl: [184, 50], tl: [13, 50], branco: true,
    body: 'M12,64 L12,50 Q12,40 26,38 Q40,36 56,26 Q70,16 92,16 Q112,16 122,28 L130,38 Q160,38 176,44 Q190,48 190,58 L190,62 Q190,66 185,66 L17,66 Q12,66 12,64 Z',
    win: 'M66,26 Q76,20 92,20 Q108,20 116,30 L121,38 L52,38 Q58,32 66,26 Z',
    extra: '<path d="M8,62 L22,62 M180,62 L194,62" stroke="#d8dde6" stroke-width="3" stroke-linecap="round"/>',
  },
  roadster: {
    w: [50, 152], r: 13, door: 104, hl: [184, 50], tl: [13, 47],
    body: 'M12,64 L12,48 Q13,42 24,41 L88,39 L120,39 L150,41 L180,45 Q189,47 189,55 L189,62 Q189,66 184,66 L17,66 Q12,66 12,64 Z',
    win: 'M118,39 L129,24 L133,24 L127,39 Z',
    extra: '<path d="M82,39 Q82,29 91,29 Q99,29 99,39 Z" fill="#14161c"/>',
    semColuna: true,
  },
};

function mix(hex, t) {
  const n = parseInt(hex.slice(1), 16);
  const alvo = t < 0 ? 0 : 255;
  const k = Math.abs(t);
  const c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.round(v + (alvo - v) * k));
  return `rgb(${c.join(',')})`;
}

function roda(x, r, branco) {
  const cy = 77 - r;
  let raios = '';
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
    raios += `<line x1="${x}" y1="${cy}" x2="${(x + Math.cos(a) * r * 0.55).toFixed(1)}" y2="${(cy + Math.sin(a) * r * 0.55).toFixed(1)}" stroke="#70788a" stroke-width="2"/>`;
  }
  return `<circle cx="${x}" cy="${cy}" r="${r + 3}" fill="#080b14"/>
    <circle cx="${x}" cy="${cy}" r="${r}" fill="#101116"/>
    ${branco ? `<circle cx="${x}" cy="${cy}" r="${r * 0.8}" fill="#ece8dc"/>` : ''}
    <circle cx="${x}" cy="${cy}" r="${r * 0.62}" fill="#c9ced6"/>${raios}
    <circle cx="${x}" cy="${cy}" r="${r * 0.18}" fill="#3a3f4b"/>`;
}

let uid = 0;
export function carSVG(car) {
  const f = F[car.tipo];
  const id = 'c' + uid++;
  return `<svg class="car" viewBox="0 0 200 84" xmlns="http://www.w3.org/2000/svg" aria-label="${car.nome}">
    <defs>
      <linearGradient id="${id}b" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${mix(car.cor, 0.3)}"/><stop offset=".45" stop-color="${car.cor}"/><stop offset="1" stop-color="${mix(car.cor, -0.45)}"/>
      </linearGradient>
      <linearGradient id="${id}w" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#9fd0ea"/><stop offset=".5" stop-color="#28405c"/><stop offset="1" stop-color="#101a2a"/>
      </linearGradient>
      <clipPath id="${id}c"><path d="${f.win}"/></clipPath>
    </defs>
    <ellipse cx="100" cy="78" rx="88" ry="4.5" fill="#000" opacity=".45"/>
    <path d="${f.body}" fill="url(#${id}b)" stroke="${mix(car.cor, -0.6)}" stroke-width="1"/>
    <path d="${f.win}" fill="url(#${id}w)"/>
    ${f.semColuna ? '' : `<path d="M${f.door},5 L${f.door},40" stroke="${mix(car.cor, -0.3)}" stroke-width="3" clip-path="url(#${id}c)"/>`}
    <path d="M${f.door},40 L${f.door},63" stroke="#0005" stroke-width="1"/>
    ${f.extra || ''}
    <rect x="${f.hl[0] - 5}" y="${f.hl[1] - 2}" width="8" height="5" rx="2" fill="#fff6c9"/>
    <rect x="${f.tl[0]}" y="${f.tl[1] - 2}" width="5" height="5" rx="1.5" fill="#ff3b3b"/>
    ${roda(f.w[0], f.r, f.branco)}${roda(f.w[1], f.r, f.branco)}
  </svg>`;
}
