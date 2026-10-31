// Escudos dos clubes gerados em SVG (forma, padrão, símbolo e sigla).
import { luminance } from '../util.js';

const SHAPES = {
  escudo: 'M10 8 H90 V60 C90 90 62 106 50 114 C38 106 10 90 10 60 Z',
  redondo: 'M50 8 A52 52 0 1 1 49.9 8 Z',
  diamante: 'M50 4 L96 60 L50 116 L4 60 Z',
  flamula: 'M12 8 H88 V76 L50 114 L12 76 Z',
  coroa: 'M10 24 L24 8 L37 22 L50 4 L63 22 L76 8 L90 24 V62 C90 92 62 106 50 114 C38 106 10 92 10 62 Z',
  castelo: 'M10 18 H22 V6 H36 V18 H44 V6 H56 V18 H64 V6 H78 V18 H90 V64 C90 92 62 106 50 114 C38 106 10 92 10 64 Z',
};

// Símbolos desenhados numa caixa de ~36×36 centrada em (50, 54).
const SYMBOLS = {
  estrela: '<polygon points="50,36 55,49 69,49 58,58 62,72 50,63 38,72 42,58 31,49 45,49"/>',
  sol: '<circle cx="50" cy="54" r="9"/><g stroke-width="3.5" stroke-linecap="round" fill="none" STROKE><line x1="50" y1="36" x2="50" y2="41"/><line x1="50" y1="67" x2="50" y2="72"/><line x1="32" y1="54" x2="37" y2="54"/><line x1="63" y1="54" x2="68" y2="54"/><line x1="37" y1="41" x2="41" y2="45"/><line x1="59" y1="63" x2="63" y2="67"/><line x1="63" y1="41" x2="59" y2="45"/><line x1="41" y1="63" x2="37" y2="67"/></g>',
  coroa: '<path d="M33 66 L31 44 L41 53 L50 39 L59 53 L69 44 L67 66 Z"/><rect x="33" y="67" width="34" height="5"/>',
  cometa: '<circle cx="58" cy="48" r="8"/><path d="M52 54 L32 72 L36 64 L30 66 L44 52 Z"/>',
  montanha: '<path d="M30 70 L45 44 L52 55 L58 46 L72 70 Z"/><path d="M45 44 L49 51 L42 51 Z" fill="#fff" opacity=".85"/>',
  chama: '<path d="M50 34 C56 46 66 50 64 62 C63 70 57 74 50 74 C43 74 37 70 36 62 C35 54 42 50 44 42 C46 48 48 50 50 50 C52 46 52 40 50 34 Z"/>',
  vulcao: '<path d="M30 72 L44 50 H56 L70 72 Z"/><path d="M47 48 C45 42 49 40 47 34 C52 38 55 42 53 48 Z"/>',
  engrenagem: '<circle cx="50" cy="54" r="12"/><g><rect x="47" y="35" width="6" height="8"/><rect x="47" y="65" width="6" height="8"/><rect x="31" y="51" width="8" height="6"/><rect x="61" y="51" width="8" height="6"/><rect x="36" y="40" width="7" height="7" transform="rotate(45 39.5 43.5)"/><rect x="57" y="61" width="7" height="7" transform="rotate(45 60.5 64.5)"/><rect x="57" y="40" width="7" height="7" transform="rotate(45 60.5 43.5)"/><rect x="36" y="61" width="7" height="7" transform="rotate(45 39.5 64.5)"/></g><circle cx="50" cy="54" r="5" fill="BG"/>',
  bandeira: '<rect x="36" y="36" width="3.5" height="38"/><path d="M39.5 37 H68 L62 46 L68 55 H39.5 Z"/>',
  martelo: '<rect x="47" y="44" width="6" height="30" rx="2"/><rect x="34" y="36" width="32" height="11" rx="2"/>',
  onda: '<path d="M30 58 C36 50 42 50 48 58 C54 66 60 66 70 56 V64 C60 74 54 74 48 66 C42 58 36 58 30 66 Z"/><path d="M30 46 C36 38 42 38 48 46 C54 54 60 54 70 44 V50 C60 60 54 60 48 52 C42 44 36 44 30 52 Z"/>',
  picareta: '<path d="M32 44 C42 34 58 34 68 44 L64 46 C56 40 44 40 36 46 Z"/><rect x="47.5" y="40" width="5" height="34" rx="2"/>',
  ancora: '<circle cx="50" cy="38" r="4.5" fill="none" stroke-width="3" STROKE/><rect x="48" y="42" width="4" height="30"/><rect x="40" y="47" width="20" height="3.5"/><path d="M34 60 C36 72 46 74 50 74 C54 74 64 72 66 60 L62 62 C60 68 55 70 50 70 C45 70 40 68 38 62 Z"/>',
  espiral: '<path d="M50 54 m-3 0 a3 3 0 1 1 6 0 a6 6 0 1 1 -12 0 a9 9 0 1 1 18 0 a12 12 0 1 1 -24 0 a15 15 0 1 1 30 0" fill="none" stroke-width="3.5" STROKE/>',
  aguia: '<path d="M50 50 C44 40 34 38 28 42 C36 44 40 48 42 54 C38 52 34 54 32 58 C38 57 43 59 47 64 L50 74 L53 64 C57 59 62 57 68 58 C66 54 62 52 58 54 C60 48 64 44 72 42 C66 38 56 40 50 50 Z"/>',
  navio: '<path d="M30 62 H70 L64 72 H36 Z"/><rect x="49" y="34" width="3" height="28"/><path d="M52 36 L66 58 H52 Z"/><path d="M48 40 L36 58 H48 Z"/>',
  leao: '<circle cx="50" cy="54" r="15"/><circle cx="50" cy="56" r="9" fill="BG"/><circle cx="46.5" cy="54" r="1.6"/><circle cx="53.5" cy="54" r="1.6"/><path d="M47 59 H53 L50 62 Z"/>',
  pinheiro: '<path d="M50 32 L64 50 H56 L68 64 H54 V74 H46 V64 H32 L44 50 H36 Z"/>',
  gota: '<path d="M50 34 C56 46 64 54 64 62 C64 70 58 74 50 74 C42 74 36 70 36 62 C36 54 44 46 50 34 Z"/>',
  raio: '<path d="M54 32 L36 58 H48 L44 76 L66 48 H54 Z"/>',
  tridente: '<rect x="48" y="44" width="4" height="32"/><path d="M36 38 L38 52 C40 56 60 56 62 52 L64 38 L60 40 L59 50 H53 L50 36 L47 50 H41 L40 40 Z"/>',
  passaro: '<path d="M30 56 C38 46 46 48 50 56 C54 48 62 46 70 56 C62 52 56 54 50 62 C44 54 38 52 30 56 Z"/>',
  palmeira: '<path d="M49 50 C48 60 46 68 44 74 H52 C52 66 52 58 51 50 Z"/><path d="M50 48 C42 38 34 40 30 44 C38 42 44 44 50 48 Z M50 48 C58 38 66 40 70 44 C62 42 56 44 50 48 Z M50 48 C46 38 48 34 52 32 C50 38 52 42 50 48 Z M50 48 C40 46 34 50 32 56 C38 50 44 48 50 48 Z M50 48 C60 46 66 50 68 56 C62 50 56 48 50 48 Z"/>',
  lua: '<path d="M56 36 C44 38 38 48 40 58 C42 68 52 74 62 70 C52 70 46 62 46 54 C46 46 50 40 56 36 Z"/><circle cx="62" cy="46" r="2"/><circle cx="58" cy="58" r="1.5"/>',
  farol: '<path d="M44 74 L46 46 H54 L56 74 Z"/><rect x="43" y="40" width="14" height="6"/><path d="M45 40 L50 33 L55 40 Z"/><path d="M58 42 L72 37 V47 Z M42 42 L28 37 V47 Z" opacity=".75"/>',
};

function patternFor(pattern, s) {
  switch (pattern) {
    case 'listras':
      return [16, 32, 48, 64, 80].map((x, i) => (i % 2 === 0 ? `<rect x="${x}" y="0" width="12" height="120" fill="${s}"/>` : '')).join('');
    case 'finas':
      return [18, 30, 42, 54, 66, 78].map((x) => `<rect x="${x}" y="0" width="4" height="120" fill="${s}"/>`).join('');
    case 'aros':
      return [20, 44, 68, 92].map((y) => `<rect x="0" y="${y}" width="100" height="12" fill="${s}"/>`).join('');
    case 'faixa':
      return `<polygon points="0,30 30,0 100,90 100,120 70,120 0,46" fill="${s}"/>`;
    case 'metades':
      return `<rect x="50" y="0" width="50" height="120" fill="${s}"/>`;
    case 'quartos':
      return `<rect x="50" y="0" width="50" height="60" fill="${s}"/><rect x="0" y="60" width="50" height="60" fill="${s}"/>`;
    case 'mangas':
      return `<rect x="0" y="0" width="100" height="22" fill="${s}"/>`;
    default:
      return '';
  }
}

let uid = 0;
export function crestSVG(c, size = 64) {
  const id = 'cr' + uid++;
  const p = c.home.p;
  const s = c.home.s;
  const dark = luminance(p) < 0.45;
  const border = luminance(s) < 0.5 ? s : dark ? '#f4f1e6' : '#1b1b1b';
  const disc = dark ? '#ffffff' : luminance(s) < 0.6 ? s : '#1b1b1b';
  const sym = luminance(disc) > 0.6 ? p : '#ffffff';
  let symbol = SYMBOLS[c.crest.symbol] || SYMBOLS.estrela;
  symbol = symbol.replace(/STROKE/g, `stroke="${sym}"`).replace(/BG/g, disc);
  const shape = SHAPES[c.crest.shape] || SHAPES.escudo;
  const textCol = luminance(border) > 0.55 ? '#111' : '#fff';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 120" width="${size}" height="${Math.round(size * 1.2)}" role="img" aria-label="Escudo ${c.name}">
<defs><clipPath id="${id}"><path d="${shape}"/></clipPath></defs>
<path d="${shape}" fill="${p}"/>
<g clip-path="url(#${id})">${patternFor(c.home.pattern, s)}
<rect x="0" y="84" width="100" height="17" fill="${border}"/></g>
<circle cx="50" cy="54" r="22" fill="${disc}" stroke="${border}" stroke-width="3"/>
<g fill="${sym}">${symbol}</g>
<text x="50" y="97.5" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="13" fill="${textCol}" letter-spacing="1">${c.abbr}</text>
<path d="${shape}" fill="none" stroke="${border}" stroke-width="5"/>
</svg>`;
}

export function crestURL(c) {
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(crestSVG(c, 128));
}

// Imagem pronta para desenhar em canvas.
const imgCache = new Map();
export function crestImage(c) {
  if (imgCache.has(c.id)) return imgCache.get(c.id);
  const img = new Image();
  img.src = crestURL(c);
  imgCache.set(c.id, img);
  return img;
}
