// Ilustração procedural de tornado (canvas), usada quando um artigo
// ainda não tem imagem gerada por IA.

function rng(seed) {
  let s = 0;
  for (const c of String(seed)) s = (s * 31 + c.charCodeAt(0)) >>> 0;
  s = s || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

const CEUS = {
  branco: ['#6f8fb8', '#b9cde3', '#e9d9b0'],
  cinza: ['#2b3138', '#55606b', '#8a8f86'],
  poeira: ['#5a4030', '#9b6a45', '#d39a62'],
  chuva: ['#1d2621', '#3a4a42', '#5d6b60'],
  noite: ['#05070c', '#0e1424', '#1b2235'],
};

const FUNIS = {
  branco: 'rgba(240,244,248,0.92)',
  cinza: 'rgba(70,74,80,0.95)',
  poeira: 'rgba(140,90,55,0.95)',
  chuva: 'rgba(18,22,20,0.95)',
  noite: 'rgba(170,180,215,0.85)',
};

// Largura (fração da largura da imagem) no topo e na base, por formato.
const PERFIS = {
  corda: [0.05, 0.012],
  cone: [0.2, 0.03],
  cilindro: [0.16, 0.13],
  cunha: [0.55, 0.42],
  multivortice: [0.36, 0.28],
  tromba: [0.07, 0.035],
};

export function desenharTornado(canvas, { formato = 'cone', aparencia = 'cinza', semente = 'x' } = {}) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const r = rng(semente + formato + aparencia);
  const ceu = CEUS[aparencia] || CEUS.cinza;

  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, ceu[0]);
  g.addColorStop(0.55, ceu[1]);
  g.addColorStop(1, ceu[2]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  const solo = H * 0.8;
  const base = H * 0.24;

  // Nuvem parede / base da supercélula.
  for (let i = 0; i < 60; i++) {
    const x = r() * W;
    const y = base - r() * H * 0.2;
    const rad = W * (0.06 + r() * 0.12);
    ctx.fillStyle = `rgba(${aparencia === 'noite' ? '20,24,36' : '40,44,50'},${0.25 + r() * 0.3})`;
    ctx.beginPath();
    ctx.ellipse(x, y, rad, rad * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Funil.
  const [topo, pe] = PERFIS[formato] || PERFIS.cone;
  const cx = W * (0.42 + r() * 0.16);
  const curva = formato === 'corda' ? W * 0.12 : W * 0.03;
  const fase = r() * Math.PI * 2;
  const pontos = 40;
  const esq = [];
  const dir = [];
  for (let i = 0; i <= pontos; i++) {
    const t = i / pontos;
    const y = base + (solo - base) * t;
    const larg = (topo + (pe - topo) * Math.pow(t, 0.7)) * W * 0.5;
    const x = cx + Math.sin(t * 3 + fase) * curva * t;
    const ruido = (r() - 0.5) * larg * 0.12;
    esq.push([x - larg + ruido, y]);
    dir.push([x + larg + ruido, y]);
  }
  const grad = ctx.createLinearGradient(cx - W * topo * 0.5, 0, cx + W * topo * 0.5, 0);
  grad.addColorStop(0, FUNIS[aparencia]);
  grad.addColorStop(0.5, FUNIS[aparencia].replace(/[\d.]+\)$/, '0.7)'));
  grad.addColorStop(1, FUNIS[aparencia]);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(...esq[0]);
  for (const p of esq) ctx.lineTo(...p);
  for (const p of dir.reverse()) ctx.lineTo(...p);
  ctx.closePath();
  ctx.fill();

  // Faixas de rotação.
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 14; i++) {
    const t = r();
    const y = base + (solo - base) * t;
    const larg = (topo + (pe - topo) * Math.pow(t, 0.7)) * W * 0.5;
    const x = cx + Math.sin(t * 3 + fase) * curva * t;
    ctx.beginPath();
    ctx.ellipse(x, y, larg, larg * 0.08, -0.05, 0.2, Math.PI - 0.2);
    ctx.stroke();
  }

  // Sub-vórtices.
  if (formato === 'multivortice') {
    for (let k = 0; k < 4; k++) {
      const off = (r() - 0.5) * W * 0.5;
      ctx.fillStyle = 'rgba(60,62,66,0.6)';
      ctx.beginPath();
      ctx.moveTo(cx + off - 6, solo - H * 0.3);
      ctx.lineTo(cx + off + 6, solo - H * 0.3);
      ctx.lineTo(cx + off + 12, solo);
      ctx.lineTo(cx + off - 12, solo);
      ctx.fill();
    }
  }

  // Solo.
  ctx.fillStyle = aparencia === 'noite' ? '#07090d' : aparencia === 'poeira' ? '#6b3e22' : '#2d3a24';
  ctx.fillRect(0, solo, W, H - solo);
  if (formato === 'tromba') {
    ctx.fillStyle = 'rgba(60,90,110,0.9)';
    ctx.fillRect(0, solo, W, H - solo);
  }

  // Nuvem de detritos / spray.
  const xPe = cx + Math.sin(3 + fase) * curva;
  for (let i = 0; i < 45; i++) {
    const rad = W * pe * (0.4 + r() * 0.8);
    ctx.fillStyle =
      formato === 'tromba'
        ? `rgba(230,240,245,${0.1 + r() * 0.15})`
        : aparencia === 'poeira'
        ? `rgba(150,95,55,${0.15 + r() * 0.2})`
        : `rgba(90,85,75,${0.12 + r() * 0.18})`;
    ctx.beginPath();
    ctx.ellipse(xPe + (r() - 0.5) * rad * 2, solo - r() * H * 0.07, rad, rad * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Chuva.
  if (aparencia === 'chuva' || aparencia === 'cinza') {
    ctx.strokeStyle = aparencia === 'chuva' ? 'rgba(160,175,170,0.25)' : 'rgba(160,170,180,0.1)';
    ctx.lineWidth = 1;
    const n = aparencia === 'chuva' ? 500 : 120;
    for (let i = 0; i < n; i++) {
      const x = r() * W;
      const y = base + r() * (solo - base);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - 4, y + 14);
      ctx.stroke();
    }
  }

  // Relâmpago.
  if (aparencia === 'noite' || r() > 0.7) {
    let x = W * (0.1 + r() * 0.25);
    let y = base - H * 0.05;
    ctx.strokeStyle = 'rgba(230,235,255,0.9)';
    ctx.lineWidth = 2;
    ctx.shadowColor = '#c8d4ff';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.moveTo(x, y);
    while (y < solo) {
      x += (r() - 0.5) * 30;
      y += 10 + r() * 20;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
  }
}
