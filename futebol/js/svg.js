// Ilustrações vetoriais: escudos, camisas, troféus e placares.
import { esc } from './text.js';

function lum(hex) {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  return 0.299 * r + 0.587 * g + 0.114 * b;
}
export function textOn(bg) {
  return lum(bg) > 0.6 ? '#111' : '#fff';
}

let n = 0;
export function crest(team, size = 40) {
  if (!team) return '';
  const [c1, c2] = team.colors;
  const id = `cr${n++}`;
  const shapes = {
    stripes: `<g clip-path="url(#${id})">${[0, 1, 2, 3, 4].map((i) => `<rect x="${8 + i * 9.6}" y="0" width="4.8" height="64" fill="${c2}"/>`).join('')}</g>`,
    hoops: `<g clip-path="url(#${id})">${[0, 1, 2, 3].map((i) => `<rect x="0" y="${14 + i * 12}" width="64" height="6" fill="${c2}"/>`).join('')}</g>`,
    half: `<g clip-path="url(#${id})"><rect x="32" y="0" width="32" height="64" fill="${c2}"/></g>`,
    sash: `<g clip-path="url(#${id})"><path d="M4 8 L18 4 L60 58 L46 62Z" fill="${c2}"/></g>`,
    chevron: `<g clip-path="url(#${id})"><path d="M6 20 L32 36 L58 20 L58 28 L32 44 L6 28Z" fill="${c2}"/></g>`,
    band: `<g clip-path="url(#${id})"><rect x="0" y="26" width="64" height="12" fill="${c2}"/></g>`,
    sleeves: `<g clip-path="url(#${id})"><rect x="0" y="0" width="64" height="12" fill="${c2}"/></g>`,
  };
  const path = 'M32 3 L58 10 L56 36 Q52 52 32 61 Q12 52 8 36 L6 10 Z';
  return `<svg class="crest" width="${size}" height="${size}" viewBox="0 0 64 64" aria-hidden="true"><defs><clipPath id="${id}"><path d="${path}"/></clipPath></defs><path d="${path}" fill="${c1}"/>${shapes[team.pattern] || ''}<path d="${path}" fill="none" stroke="${lum(c1) > 0.85 ? c2 : '#fff'}" stroke-opacity=".9" stroke-width="2.5"/><rect x="14" y="27" width="36" height="14" rx="3" fill="rgba(0,0,0,.55)"/><text x="32" y="38" text-anchor="middle" font-family="Arial Black,Arial" font-weight="900" font-size="11" fill="#fff">${esc(team.short)}</text></svg>`;
}

export function shirtIcon(c1, c2, pattern, size = 48) {
  const id = `sh${n++}`;
  const body = 'M18 6 L26 4 Q32 9 38 4 L46 6 L58 16 L52 26 L46 22 L46 58 L18 58 L18 22 L12 26 L6 16 Z';
  const pat = {
    stripes: [0, 1, 2, 3].map((i) => `<rect x="${20 + i * 7}" y="0" width="3.5" height="64" fill="${c2}"/>`).join(''),
    hoops: [0, 1, 2, 3].map((i) => `<rect x="0" y="${14 + i * 11}" width="64" height="5" fill="${c2}"/>`).join(''),
    half: `<rect x="32" y="0" width="32" height="64" fill="${c2}"/>`,
    sash: `<path d="M14 8 L22 4 L54 60 L44 62Z" fill="${c2}"/>`,
    chevron: `<path d="M10 18 L32 32 L54 18 L54 25 L32 39 L10 25Z" fill="${c2}"/>`,
    band: `<rect x="0" y="28" width="64" height="9" fill="${c2}"/>`,
    sleeves: `<path d="M6 16 L18 6 L18 22 L12 26Z M58 16 L46 6 L46 22 L52 26Z" fill="${c2}"/>`,
  }[pattern] || '';
  return `<svg width="${size}" height="${size}" viewBox="0 0 64 64" aria-hidden="true"><defs><clipPath id="${id}"><path d="${body}"/></clipPath></defs><path d="${body}" fill="${c1}"/><g clip-path="url(#${id})">${pat}</g><path d="M26 4 Q32 9 38 4" fill="none" stroke="${c2}" stroke-width="2"/><path d="${body}" fill="none" stroke="rgba(0,0,0,.35)" stroke-width="1.2"/></svg>`;
}

export function trophySVG(stars = 3, color) {
  const col = color || ['#9ca3af', '#cd7f32', '#c0c0c0', '#e5c04b', '#f5d76e', '#ffd700'][stars] || '#e5c04b';
  return `<svg viewBox="0 0 120 120" class="trophy" aria-hidden="true"><defs><linearGradient id="tg${stars}" x1="0" x2="1"><stop offset="0" stop-color="${col}" stop-opacity=".75"/><stop offset=".5" stop-color="#fff8d6"/><stop offset="1" stop-color="${col}"/></linearGradient></defs>
  <path d="M36 18 H84 V40 Q84 70 60 76 Q36 70 36 40 Z" fill="url(#tg${stars})"/>
  <path d="M36 24 Q16 24 20 42 Q24 56 40 56" fill="none" stroke="${col}" stroke-width="6"/>
  <path d="M84 24 Q104 24 100 42 Q96 56 80 56" fill="none" stroke="${col}" stroke-width="6"/>
  <rect x="54" y="76" width="12" height="16" fill="${col}"/><rect x="40" y="92" width="40" height="10" rx="2" fill="${col}"/><rect x="34" y="102" width="52" height="8" rx="2" fill="#3b2f1e"/>
  ${Array.from({ length: stars }, (_, i) => `<text x="${60 + (i - (stars - 1) / 2) * 11}" y="50" font-size="11" text-anchor="middle" fill="#7a5a00">★</text>`).join('')}</svg>`;
}

export function stars(nr, cls = '') {
  return `<span class="stars ${cls}" title="${nr} estrela(s)">${'★'.repeat(nr)}<span class="off">${'★'.repeat(5 - nr)}</span></span>`;
}
