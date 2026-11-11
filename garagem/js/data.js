// Catálogo do jogo: raridades, marcas fictícias, carros, caixas e missões.

export const RAR = [
  { nome: 'Comum', cor: '#93a0b8' },
  { nome: 'Incomum', cor: '#4fd17a' },
  { nome: 'Raro', cor: '#4d9bff' },
  { nome: 'Épico', cor: '#b46bff' },
  { nome: 'Lendário', cor: '#ffc531' },
  { nome: 'Mítico', cor: '#ff4f7b' },
];

const BASE_VALOR = [200, 1500, 12000, 90000, 800000, 8000000];
export const XP_RAR = [10, 25, 60, 150, 400, 1000];
export const BONUS_DESTAQUE = [0, 0.05, 0.1, 0.2, 0.35, 0.6];

// [marca, modelo, ano, tipo, raridade, cor, cv, km/h, 0-100 s]
const LINHAS = [
  ['Tupã', 'Brisa', 2012, 'hatch', 0, '#d94f4f', 75, 160, 13.8],
  ['Tupã', 'Brisa Sport', 2019, 'hatch', 1, '#f2b632', 128, 195, 9.4],
  ['Tupã', 'Litoral', 2015, 'sedan', 0, '#9aa5b1', 98, 178, 11.9],
  ['Tupã', 'Litoral GT', 2022, 'sedan', 1, '#2f6fde', 170, 220, 8.1],
  ['Tupã', 'Roça', 2010, 'picape', 0, '#f4f4f0', 88, 155, 14.5],
  ['Tupã', 'Trilha', 2021, 'suv', 1, '#3f7d4e', 150, 190, 10.2],

  ['Saíra', 'Pingo', 2008, 'hatch', 0, '#5cc8e8', 62, 148, 15.9],
  ['Saíra', 'Pingo Turbo', 2018, 'hatch', 1, '#ff7a3d', 115, 188, 9.9],
  ['Saíra', 'Urbe', 2016, 'hatch', 0, '#c9c9c9', 82, 165, 12.8],
  ['Saíra', 'Urbe Cabrio', 2020, 'roadster', 2, '#e84a8a', 140, 205, 8.6],
  ['Saíra', 'Feira', 2005, 'picape', 0, '#b8743a', 70, 140, 16.4],
  ['Saíra', 'Colibri', 2023, 'cupe', 2, '#19b89a', 190, 228, 7.2],

  ['Araucária', 'Serra', 2014, 'suv', 0, '#6b7b53', 130, 172, 12.1],
  ['Araucária', 'Serra V6', 2020, 'suv', 1, '#2b2f36', 250, 205, 8.3],
  ['Araucária', 'Tropeiro', 2011, 'picape', 0, '#a33a2c', 140, 165, 13.0],
  ['Araucária', 'Tropeiro Raid', 2022, 'picape', 2, '#e8a020', 320, 190, 6.9],
  ['Araucária', 'Pinhão', 2017, 'suv', 1, '#e6e2d6', 180, 185, 9.8],
  ['Araucária', 'Geada', 2024, 'suv', 3, '#dfe9f2', 460, 240, 4.9],

  ['Mirante', 'Avenida', 2013, 'sedan', 0, '#1f2a44', 140, 195, 10.5],
  ['Mirante', 'Avenida L', 2019, 'sedan', 1, '#7a1f2b', 210, 225, 7.9],
  ['Mirante', 'Belvedere', 2021, 'sedan', 2, '#16161b', 340, 250, 5.6],
  ['Mirante', 'Belvedere Coupé', 2022, 'cupe', 2, '#c7ccd4', 380, 255, 5.1],
  ['Mirante', 'Solar', 2018, 'sedan', 1, '#b9a37a', 185, 215, 8.6],
  ['Mirante', 'Imperial', 2025, 'sedan', 4, '#4a1568', 620, 290, 3.9],

  ['Cobalto', 'C2', 2009, 'cupe', 0, '#2a5bd7', 120, 190, 10.9],
  ['Cobalto', 'C3 S', 2017, 'cupe', 1, '#e03a3a', 230, 235, 6.8],
  ['Cobalto', 'C4 RS', 2021, 'cupe', 2, '#f5d400', 365, 265, 4.8],
  ['Cobalto', 'C5 Clubsport', 2023, 'cupe', 3, '#1c9c5a', 480, 295, 3.8],
  ['Cobalto', 'Spyder', 2019, 'roadster', 2, '#f0f0f0', 300, 255, 5.2],
  ['Cobalto', 'C7 GTR', 2025, 'super', 4, '#ff5a1f', 690, 325, 2.9],

  ['Jaguará', 'Rajada', 1998, 'cupe', 0, '#7d2a2a', 165, 200, 9.6],
  ['Jaguará', 'Rajada V8', 2015, 'cupe', 2, '#22252c', 420, 250, 5.0],
  ['Jaguará', 'Trovão', 1971, 'classico', 3, '#d9531e', 375, 215, 6.2],
  ['Jaguará', 'Trovão R', 2020, 'cupe', 3, '#3ad1c8', 650, 300, 3.7],
  ['Jaguará', 'Onça-Preta', 2024, 'super', 4, '#1a1a1f', 780, 335, 2.8],
  ['Jaguará', 'Caatinga', 2016, 'picape', 1, '#c4a25a', 280, 185, 7.8],

  ['Nimbus', 'Volt', 2020, 'hatch', 0, '#a8e05f', 110, 150, 9.9],
  ['Nimbus', 'Íon', 2022, 'sedan', 1, '#e9edf2', 280, 225, 6.0],
  ['Nimbus', 'Íon Max', 2024, 'sedan', 2, '#5b3fd6', 510, 260, 3.6],
  ['Nimbus', 'Cúmulo', 2023, 'suv', 2, '#7fb7d9', 400, 220, 4.9],
  ['Nimbus', 'Raio', 2025, 'cupe', 3, '#d6f23a', 800, 310, 2.6],
  ['Nimbus', 'Tempestade', 2026, 'super', 5, '#2de0ff', 1500, 400, 1.9],

  ['Boreal', 'Vento', 2007, 'roadster', 0, '#3fa56b', 105, 180, 10.8],
  ['Boreal', 'Vento RS', 2018, 'roadster', 1, '#d4342c', 180, 220, 7.0],
  ['Boreal', 'Aurora', 2021, 'roadster', 2, '#7d5fe8', 310, 265, 4.7],
  ['Boreal', 'Polar', 2023, 'roadster', 3, '#f7f7f7', 520, 305, 3.5],
  ['Boreal', 'Zênite', 2025, 'roadster', 4, '#ffb81f', 710, 340, 2.9],
  ['Boreal', 'Fiorde', 2014, 'cupe', 1, '#2c5f7a', 200, 228, 7.4],

  ['Vértice', 'Prisma', 2012, 'cupe', 2, '#1f44d1', 430, 290, 4.3],
  ['Vértice', 'Ápice', 2016, 'super', 2, '#e8262d', 540, 315, 3.4],
  ['Vértice', 'Ápice SV', 2019, 'super', 3, '#2ad15a', 650, 330, 3.0],
  ['Vértice', 'Vetor', 2022, 'super', 3, '#f29d1f', 720, 340, 2.8],
  ['Vértice', 'Zero', 2024, 'super', 4, '#8b8f97', 880, 355, 2.5],
  ['Vértice', 'Singular', 2026, 'super', 5, '#b01cff', 1250, 420, 2.0],

  ['Quartzo', 'Bonde', 1958, 'classico', 0, '#8fbcb0', 36, 115, 28.0],
  ['Quartzo', 'Marajó', 1962, 'classico', 1, '#f0e2b8', 54, 130, 21.0],
  ['Quartzo', 'Cristal', 1955, 'classico', 2, '#7e1e2c', 150, 180, 11.0],
  ['Quartzo', 'Granada', 1967, 'classico', 3, '#1d3b2f', 270, 240, 6.9],
  ['Quartzo', 'Ametista', 1949, 'roadster', 3, '#6a3c8f', 125, 175, 12.0],
  ['Quartzo', 'Ônix', 1938, 'classico', 4, '#2a2c33', 180, 200, 9.8],
];

const slug = (s) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-');

function arredonda(v) {
  const p = Math.pow(10, Math.max(0, Math.floor(Math.log10(v)) - 1));
  return Math.round(v / p) * p;
}

export const CARROS = LINHAS.map(([marca, modelo, ano, tipo, rar, cor, cv, vmax, acel]) => ({
  id: slug(marca + ' ' + modelo),
  marca, modelo, ano, tipo, rar, cor, cv, vmax, acel,
  nome: `${marca} ${modelo}`,
  valor: arredonda(BASE_VALOR[rar] * (0.7 + ((cv % 37) / 37) * 0.8)),
}));

export const POR_ID = Object.fromEntries(CARROS.map((c) => [c.id, c]));
export const MARCAS = [...new Set(CARROS.map((c) => c.marca))];
export const INICIAL = 'tupa-brisa';

// chances em % por raridade (índice = raridade)
export const CAIXAS = [
  { id: 'urbana', nome: 'Caixa Urbana', moedas: 400, cor: '#7f8ba6', chances: [70, 24, 5.5, 0.5, 0, 0] },
  { id: 'pista', nome: 'Caixa Pista', moedas: 6000, cor: '#4d9bff', chances: [0, 55, 33, 10, 2, 0] },
  { id: 'elite', nome: 'Caixa Elite', moedas: 80000, gemas: 45, cor: '#b46bff', chances: [0, 0, 55, 33, 10.5, 1.5] },
  { id: 'reliquia', nome: 'Caixa Relíquia', gemas: 150, cor: '#ffc531', chances: [0, 0, 0, 60, 32, 8] },
];

export const MISSOES = [
  { id: 'tap', txt: 'Toque 300 vezes no carro', meta: 300, gemas: 5 },
  { id: 'box', txt: 'Abra 3 caixas', meta: 3, gemas: 8 },
  { id: 'game', txt: 'Jogue 3 minijogos', meta: 3, gemas: 6 },
  { id: 'earn', txt: 'Ganhe 2.000 moedas', meta: 2000, gemas: 5 },
  { id: 'sell', txt: 'Venda 2 carros', meta: 2, gemas: 4 },
];
export const BONUS_MISSOES = 20;
export const PREMIO_MARCA = 30;
export const OFERTAS = [{ rar: 2, gemas: 30 }, { rar: 3, gemas: 90 }, { rar: 4, gemas: 280 }];
