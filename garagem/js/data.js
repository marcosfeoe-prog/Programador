// Catálogo do jogo: raridades, carros (com a receita do modelo 3D usado para gerar a
// imagem recortada em assets/cars/<id>.webp) e caixas.
// Marcas e modelos são fictícios.

export const RARITIES = {
  comum: { name: 'Comum', color: '#9aa4b1', glow: 'rgba(154,164,177,0.45)', order: 0, sell: 0.5 },
  incomum: { name: 'Incomum', color: '#3fd17a', glow: 'rgba(63,209,122,0.5)', order: 1, sell: 0.5 },
  raro: { name: 'Raro', color: '#3d8bff', glow: 'rgba(61,139,255,0.55)', order: 2, sell: 0.5 },
  epico: { name: 'Épico', color: '#b25bff', glow: 'rgba(178,91,255,0.55)', order: 3, sell: 0.55 },
  lendario: { name: 'Lendário', color: '#ffa31a', glow: 'rgba(255,163,26,0.6)', order: 4, sell: 0.6 },
  mitico: { name: 'Ultra Prestígio', color: '#ff3d6e', glow: 'rgba(255,61,110,0.6)', order: 5, sell: 0.6 },
};
export const RARITY_KEYS = Object.keys(RARITIES);

// m = receita do modelo (ver tools/carmodel.js)
const C = (id, brand, model, year, rarity, value, hp, top, acc, m, extra = {}) => ({ id, brand, model, year, rarity, value, hp, top, acc, model3d: m, ...extra });

export const CARS = [
  // ---------------- Comum ----------------
  C('fiato-ponto-1998', 'Fiato', 'Ponto', 1998, 'comum', 1800, 75, 160, 13.5, { type: 'hatch', color: '#e9e9e4', finish: 'gloss', rim: 'steel', rimColor: 'silver', L: 3.85, roofAdd: 0.02 }),
  C('volkswerk-gulo-2004', 'Volkswerk', 'Gulo', 2004, 'comum', 2400, 101, 185, 11.2, { type: 'hatch', color: '#b8bec6', rim: 'spoke5', rimColor: 'silver' }),
  C('chevrole-selta-2012', 'Chevrolé', 'Selta', 2012, 'comum', 2100, 78, 165, 13.1, { type: 'hatch', color: '#b3161b', finish: 'gloss', rim: 'steel', rimColor: 'gunmetal', L: 3.9 }),
  C('tayoka-corolo-2010', 'Tayoka', 'Corolo', 2010, 'comum', 3200, 136, 195, 10.4, { type: 'sedan', color: '#a9afb7', rim: 'multi', rimColor: 'silver', L: 4.6 }),
  C('hondra-civique-2008', 'Hondra', 'Civique', 2008, 'comum', 3500, 140, 200, 9.9, { type: 'sedan', color: '#15171b', rim: 'split', rimColor: 'silver', L: 4.55 }),
  C('reno-clivo-2015', 'Renô', 'Clivo', 2015, 'comum', 2700, 90, 180, 12.0, { type: 'hatch', color: '#1f5fbf', rim: 'multi', rimColor: 'gunmetal' }),
  C('forde-fiestta-2014', 'Forde', 'Fiestta', 2014, 'comum', 2900, 120, 190, 10.8, { type: 'hatch', color: '#e8641b', rim: 'spoke5', rimColor: 'black' }),
  C('nivan-centro-2016', 'Nivan', 'Centro', 2016, 'comum', 3300, 130, 195, 10.6, { type: 'sedan', color: '#f2f2ef', finish: 'gloss', rim: 'multi', rimColor: 'silver', L: 4.65 }),
  C('hondra-fitto-2019', 'Hondra', 'Fitto', 2019, 'comum', 3800, 116, 185, 11.5, { type: 'hatch', color: '#1c8c8c', rim: 'split', rimColor: 'silver', roofAdd: 0.05 }),
  C('chevrole-onyx-2020', 'Chevrolé', 'Ônyx', 2020, 'comum', 4100, 116, 190, 10.9, { type: 'hatch', color: '#4a4f57', rim: 'turbine', rimColor: 'silver' }),
  C('jeepo-renegato-2018', 'Jeepo', 'Renegato', 2018, 'comum', 4600, 170, 185, 9.8, { type: 'suv', color: '#56702f', finish: 'gloss', rim: 'spoke5', rimColor: 'gunmetal', L: 4.25, roofAdd: -0.1, gh: { cp: 3.3, roofR: 3.95, rw: 4.18 } }),
  C('tayoka-hilaxe-2015', 'Tayoka', 'Hilaxe', 2015, 'comum', 4900, 177, 175, 10.9, { type: 'pickup', color: '#ecebe6', finish: 'gloss', rim: 'multi', rimColor: 'silver', L: 5.3 }),
  C('volkswerk-jetto-2017', 'Volkswerk', 'Jetto', 2017, 'comum', 4300, 150, 210, 8.6, { type: 'sedan', color: '#14335e', rim: 'spoke5', rimColor: 'silver', L: 4.7 }),
  C('fiato-tora-2021', 'Fiato', 'Tora', 2021, 'comum', 4800, 185, 190, 9.9, { type: 'pickup', color: '#9c1010', rim: 'split', rimColor: 'gunmetal', L: 4.95, roofAdd: -0.1 }),

  // ---------------- Incomum ----------------
  C('mazdo-miyata-1995', 'Mazdo', 'Miyata', 1995, 'incomum', 7500, 131, 200, 8.8, { type: 'jdm', color: '#c4161c', finish: 'gloss', rim: 'multi', rimColor: 'silver', L: 3.95, W: 1.68, wing: false, lights: 'slim', grille: 'none', roofAdd: -0.08, topAdd: -0.04 }),
  C('forde-mustango-2008', 'Forde', 'Mustango GT', 2008, 'incomum', 12000, 300, 250, 5.3, { type: 'muscle', color: '#f2c218', finish: 'gloss', color2: '#111111', stripes: 'twin', rim: 'spoke5', rimColor: 'black', L: 4.75, scoop: false, lights: 'round' }),
  C('hondra-civique-r-2018', 'Hondra', 'Civique Tipo R', 2018, 'incomum', 11000, 320, 272, 5.7, { type: 'hatch', color: '#f4f4f2', finish: 'gloss', rim: 'spoke5', rimColor: 'black', caliper: '#d81e1e', wing: true, wingH: 0.18, intake: 'wide', L: 4.5 }),
  C('subara-impreso-2006', 'Subara', 'Impreso WRX', 2006, 'incomum', 9500, 280, 245, 5.4, { type: 'sedan', color: '#123a8c', rim: 'multi', rimColor: 'gold', scoop: true, wing: true, wingH: 0.14, L: 4.45, roofAdd: -0.04 }),
  C('volkswerk-gulo-gti-2020', 'Volkswerk', 'Gulo GTI', 2020, 'incomum', 8200, 245, 250, 6.2, { type: 'hatch', color: '#cf1d23', finish: 'gloss', rim: 'turbine', rimColor: 'gunmetal', caliper: '#d81e1e', grille: 'mesh', roofAdd: -0.04 }),
  C('bavaro-m3-2009', 'Bavaro', 'M-3', 2009, 'incomum', 13500, 420, 280, 4.6, { type: 'sedan', color: '#2a5fa8', rim: 'split', rimColor: 'silver', L: 4.6, roofAdd: -0.05, gh: { rw: 3.85 } }),
  C('audex-a5-2017', 'Audex', 'A-5 Sportback', 2017, 'incomum', 14000, 354, 250, 4.7, { type: 'ev', color: '#5b6067', rim: 'spoke5', rimColor: 'gunmetal', grille: 'mesh', grilleW: 0.7, grilleH: 0.22, lights: 'slim', L: 4.7 }),
  C('jeepo-wrangla-2019', 'Jeepo', 'Wrangla', 2019, 'incomum', 10500, 285, 180, 7.5, { type: 'suv', color: '#e0661b', finish: 'gloss', rim: 'steel', rimColor: 'black', L: 4.35, wr: 0.44, roof: 'black', lights: 'round', lightW: 0.22, lightH: 0.22, gh: { cp: 3.6, roofR: 4.1, rw: 4.25 } }),
  C('forde-raptora-2021', 'Forde', 'Raptora', 2021, 'incomum', 16500, 450, 180, 5.8, { type: 'pickup', color: '#6b7076', finish: 'matte', rim: 'spoke5', rimColor: 'black', wr: 0.45, mirrors: 'black' }),
  C('chevrole-camarra-1969', 'Chevrolé', 'Camarra SS', 1969, 'incomum', 17500, 375, 225, 6.1, { type: 'muscle', color: '#e2581a', finish: 'gloss', color2: '#f4f4f0', stripes: 'twin', rim: 'mesh', rimColor: 'chrome', L: 4.7, lights: 'round', scoop: true }),
  C('dodje-chargin-1970', 'Dodje', 'Chargin R/T', 1970, 'incomum', 16000, 425, 240, 5.5, { type: 'muscle', color: '#0c0c0e', finish: 'gloss', rim: 'steel', rimColor: 'chrome', lights: 'none', grille: 'bars', grilleW: 1.25, grilleH: 0.26 }),
  C('tayoka-supremo-1998', 'Tayoka', 'Supremo', 1998, 'incomum', 15000, 320, 285, 4.6, { type: 'jdm', color: '#ee7a12', finish: 'gloss', rim: 'multi', rimColor: 'silver', lights: 'slim', grille: 'none', intake: 'wide', wingH: 0.22, wingColor: 'body', gh: { rw: 4.0 } }),

  // ---------------- Raro ----------------
  C('nivan-sky-r34-2000', 'Nivan', 'Sky R34', 2000, 'raro', 48000, 330, 290, 4.9, { type: 'jdm', color: '#1d4fd8', rim: 'multi', rimColor: 'bronze', caliper: '#d4a017' }),
  C('korsche-921-carrera-2019', 'Korsche', '921 Carrera', 2019, 'raro', 42000, 385, 293, 4.2, { type: 'sport', color: '#f2f2ee', finish: 'gloss', rim: 'split', rimColor: 'gunmetal', caliper: '#b5121b' }),
  C('gorlomi-testarosa-1986', 'Gorlomi', 'Testarosa', 1986, 'raro', 68000, 390, 290, 5.2, { type: 'super', color: '#d1121b', finish: 'gloss', rim: 'turbine', rimColor: 'silver', lights: 'slim', side: true, intake: 'lip', roofAdd: 0.02, W: 1.98 }),
  C('bavaro-m8-2022', 'Bavaro', 'M-8 Coupé', 2022, 'raro', 55000, 617, 305, 3.2, { type: 'gt', color: '#0f5a46', rim: 'spoke5', rimColor: 'black', caliper: '#1d4fd8', grille: 'bars', grilleW: 0.5, grilleH: 0.2 }),
  C('belvares-amg-gt-2020', 'Belvares', 'AMG-GT', 2020, 'raro', 62000, 577, 318, 3.6, { type: 'gt', color: '#9ea4ab', finish: 'matte', rim: 'turbine', rimColor: 'black', caliper: '#e1b400', grille: 'bars', gh: { ws: 2.15, roofF: 2.7 } }),
  C('ashton-morley-vantaggio-2019', 'Ashton Morley', 'Vantaggio', 2019, 'raro', 58000, 503, 314, 3.6, { type: 'gt', color: '#123f2a', rim: 'split', rimColor: 'silver', grille: 'mesh', grilleW: 0.8, grilleH: 0.2 }),
  C('lotto-esprito-1990', 'Lotto', 'Esprito', 1990, 'raro', 35000, 264, 260, 4.7, { type: 'super', color: '#f0f0ec', finish: 'gloss', rim: 'disc', rimColor: 'silver', lights: 'none', intake: 'lip', side: false, wing: false, roofAdd: 0.04, W: 1.86 }),
  C('audex-r8-2016', 'Audex', 'R-8 V10', 2016, 'raro', 72000, 610, 330, 3.2, { type: 'super', color: '#3a3d42', rim: 'split', rimColor: 'black', caliper: '#d81e1e', grille: 'mesh', grilleW: 0.55, grilleH: 0.18, intake: 'lip', roofAdd: 0.06 }),
  C('dodje-viperra-2013', 'Dodje', 'Viperra GTS', 2013, 'raro', 66000, 640, 330, 3.5, { type: 'gt', color: '#1440a0', finish: 'gloss', color2: '#f4f4f0', stripes: 'twin', rim: 'spoke5', rimColor: 'silver', L: 4.5, gh: { ws: 2.25, roofF: 2.8, roofR: 3.15, rw: 3.95 } }),
  C('chevrole-corveta-c8-2022', 'Chevrolé', 'Corveta C8', 2022, 'raro', 80000, 495, 312, 2.9, { type: 'super', color: '#f2c218', finish: 'gloss', rim: 'spoke5', rimColor: 'black', caliper: '#d81e1e', roofAdd: 0.08 }),
  C('rangeland-defensor-2021', 'Rangeland', 'Defensor', 2021, 'raro', 38000, 400, 191, 6.0, { type: 'suv', color: '#8a7f5c', finish: 'matte', rim: 'steel', rimColor: 'white', roof: 'black', L: 4.75, roofAdd: 0.08, lights: 'round', lightW: 0.2, lightH: 0.2, endF: 0.08, endR: 0.06 }),
  C('voltra-modelo-s-2022', 'Voltra', 'Modelo S', 2022, 'raro', 45000, 1020, 322, 2.1, { type: 'ev', color: '#b3121b', rim: 'turbine', rimColor: 'gunmetal' }),

  // ---------------- Épico ----------------
  C('korsche-921-turbo-s-2025', 'Korsche', '921 Turbo S', 2025, 'epico', 245000, 650, 330, 2.7, { type: 'sport', color: '#1a3fd6', rim: 'spoke5', rimColor: 'black', caliper: '#e1b400', wing: true, wingH: 0.12, wingColor: 'body', intake: 'wide' }),
  C('gorlomi-320-gtb-2025', 'Gorlomi', '320 GTB', 2025, 'epico', 340000, 830, 340, 2.9, { type: 'super', color: '#e01b1b', finish: 'gloss', rim: 'spoke5', rimColor: 'black', caliper: '#e1b400', roofAdd: 0.04 }),
  C('galvarini-murcio-sv-2010', 'Galvarini', 'Murcio SV', 2010, 'epico', 520000, 670, 342, 3.2, { type: 'super', color: '#1b1c1f', finish: 'matte', rim: 'turbine', rimColor: 'black', caliper: '#e1b400', wing: true, wingH: 0.16 }),
  C('mclaran-720s-2018', 'McLaran', '720-S', 2018, 'epico', 310000, 720, 341, 2.8, { type: 'super', color: '#ff7a1a', rim: 'split', rimColor: 'black', caliper: '#111111', roofAdd: 0.04 }),
  C('galvarini-huracao-2020', 'Galvarini', 'Huracão EVO', 2020, 'epico', 280000, 640, 325, 2.9, { type: 'super', color: '#8fd11a', finish: 'pearl', rim: 'spoke5', rimColor: 'black', caliper: '#111111' }),
  C('ashton-morley-db12-2023', 'Ashton Morley', 'DB-12', 2023, 'epico', 230000, 671, 325, 3.5, { type: 'gt', color: '#7f97ab', rim: 'multi', rimColor: 'gunmetal', grille: 'mesh', grilleW: 0.85, grilleH: 0.22 }),
  C('jaguara-tipo-e-1964', 'Jaguara', 'Tipo-E', 1964, 'epico', 190000, 265, 240, 7.0, { type: 'classic', color: '#0f3d26', rim: 'wire', rimColor: 'chrome', L: 4.45, grille: 'chrome', grilleW: 0.32, grilleH: 0.16, gh: { ws: 2.35, roofF: 2.75, roofR: 3.0, rw: 3.85 } }),
  C('mazzarati-mc20-2022', 'Mazzarati', 'MC-20', 2022, 'epico', 210000, 621, 325, 2.9, { type: 'super', color: '#f2f2ee', finish: 'pearl', rim: 'split', rimColor: 'gunmetal', caliper: '#1d4fd8', grille: 'bars', grilleW: 0.4, grilleH: 0.14 }),
  C('nivan-gtr-nismo-2024', 'Nivan', 'GT-R Nismo', 2024, 'epico', 175000, 600, 315, 2.5, { type: 'jdm', color: '#6c7178', rim: 'multi', rimColor: 'black', caliper: '#d81e1e', W: 1.9, gh: { rw: 4.1 }, lights: 'slim', grille: 'mesh' }),
  C('gorlomi-elettrica-2026', 'Gorlomi', 'Elettrica', 2026, 'epico', 450000, 1000, 310, 2.5, { type: 'ev', color: '#5a1fb8', finish: 'pearl', rim: 'turbine', rimColor: 'black', caliper: '#e1b400' }),

  // ---------------- Lendário ----------------
  C('kronberg-agira-rs-2017', 'Kronberg', 'Agira RS', 2017, 'lendario', 4800000, 1160, 447, 2.8, { type: 'hyper', color: '#1a1b1e', finish: 'carbon', rim: 'turbine', rimColor: 'black', caliper: '#ff7a1a' }),
  C('pagano-zondra-r-2009', 'Pagano', 'Zondra R', 2009, 'lendario', 3600000, 739, 350, 2.7, { type: 'hyper', color: '#e9eaec', finish: 'gloss', color2: '#1a1b1e', stripes: 'wide', rim: 'multi', rimColor: 'silver', caliper: '#d81e1e', L: 4.6 }),
  C('mclaran-f1-1994', 'McLaran', 'F-1', 1994, 'lendario', 5200000, 618, 386, 3.2, { type: 'super', color: '#c9a35a', rim: 'disc', rimColor: 'gold', L: 4.29, W: 1.82, intake: 'lip', roofAdd: 0.04 }),
  C('gorlomi-enzzo-2003', 'Gorlomi', 'Enzzo', 2003, 'lendario', 3200000, 651, 350, 3.1, { type: 'hyper', color: '#cf1018', finish: 'gloss', rim: 'spoke5', rimColor: 'silver', wing: false }),
  C('galvarini-contador-1988', 'Galvarini', 'Contador', 1988, 'lendario', 1600000, 455, 295, 4.7, { type: 'super', color: '#f4f4f0', finish: 'gloss', rim: 'disc', rimColor: 'silver', lights: 'none', wing: true, wingH: 0.2, side: true, intake: 'lip', roofAdd: 0.02 }),
  C('muratti-shirao-2018', 'Muratti', 'Shirão', 2018, 'lendario', 2800000, 1479, 420, 2.4, { type: 'hyper', color: '#123a8c', finish: 'gloss', roof: 'black', rim: 'spoke5', rimColor: 'silver', grille: 'chrome', grilleW: 0.32, grilleH: 0.22, wing: false, gh: { roofY: 1.2 } }),
  C('rimak-nevra-2022', 'Rimak', 'Nevra', 2022, 'lendario', 2100000, 1914, 412, 1.9, { type: 'hyper', color: '#7a8088', finish: 'matte', rim: 'turbine', rimColor: 'gunmetal', caliper: '#1d4fd8', wing: false }),
  C('korsche-917k-1970', 'Korsche', '917K', 1970, 'lendario', 5900000, 620, 362, 2.3, { type: 'proto', color: '#8fc3e6', finish: 'gloss', color2: '#ff7a1a', stripes: 'wide', rim: 'disc', rimColor: 'silver' }),

  // ---------------- Ultra Prestígio ----------------
  C('belvares-300slr-1955', 'Belvares', '300SLR', 1955, 'mitico', 145000000, 548, 317, 4.8, { type: 'classic', color: '#c7ccd2', finish: 'chrome', rim: 'wire', rimColor: 'chrome', grille: 'chrome', grilleW: 0.5, grilleH: 0.2, gh: { roofY: 1.2 } }),
  C('muratti-type39-1936', 'Muratti', 'Type 39', 1936, 'mitico', 40000000, 200, 200, 9.5, { type: 'classic', color: '#2b2f35', rim: 'wire', rimColor: 'chrome', whitewall: true, L: 4.6, grille: 'chrome', grilleW: 0.26, grilleH: 0.34, gh: { ws: 2.0, roofF: 2.45, roofR: 2.9, rw: 3.9, roofY: 1.33 } }),
  C('gorlomi-250-gto-1962', 'Gorlomi', '250 GTO', 1962, 'mitico', 70000000, 300, 280, 6.1, { type: 'classic', color: '#c4121a', finish: 'gloss', rim: 'wire', rimColor: 'chrome', grille: 'chrome', grilleW: 0.55, grilleH: 0.17, rs: 0.2, gh: { ws: 2.1, roofF: 2.6, roofR: 2.95, rw: 3.75 } }),
  C('muratti-noite-negra-2019', 'Muratti', 'Noite Negra', 2019, 'mitico', 18700000, 1479, 420, 2.4, { type: 'hyper', color: '#08090b', finish: 'gloss', rim: 'spoke5', rimColor: 'black', grille: 'chrome', grilleW: 0.34, grilleH: 0.24, wing: false, L: 4.9, gh: { roofY: 1.18 } }),
  C('kronberg-trevitta-2010', 'Kronberg', 'CCXR Trevitta', 2010, 'mitico', 25000000, 1004, 410, 2.9, { type: 'hyper', color: '#e8edf2', finish: 'pearl', rim: 'multi', rimColor: 'chrome', caliper: '#1d4fd8', wing: true }),
  C('ashton-morley-db5-1964', 'Ashton Morley', 'DB-5', 1964, 'mitico', 22000000, 282, 233, 7.1, { type: 'classic', color: '#b9bfc4', rim: 'wire', rimColor: 'chrome', grille: 'chrome', grilleW: 0.5, grilleH: 0.22, rs: 0.14, L: 4.57, gh: { ws: 2.05, roofF: 2.6, roofR: 3.25, rw: 3.95, roofY: 1.34 } }),

  // ---------------- Edições limitadas (só na vitrine limitada) ----------------
  C('kronberg-agira-ouro-2024', 'Kronberg', 'Agira Ouro', 2024, 'mitico', 35000000, 1600, 450, 2.5, { type: 'hyper', color: '#d4a23a', finish: 'chrome', rim: 'turbine', rimColor: 'black', caliper: '#111111' }, { limited: { supply: 500, gems: 4200 } }),
  C('gorlomi-laferrata-2017', 'Gorlomi', 'LaFerrata Aperta', 2017, 'mitico', 28000000, 950, 350, 2.4, { type: 'hyper', color: '#d1121b', finish: 'gloss', roof: 'black', rim: 'spoke5', rimColor: 'black', caliper: '#e1b400', wing: false }, { limited: { supply: 210, gems: 3600 } }),
  C('galvarini-veneno-2014', 'Galvarini', 'Veneno', 2014, 'mitico', 60000000, 750, 355, 2.8, { type: 'hyper', color: '#55595f', finish: 'matte', color2: '#7ddc1f', stripes: 'twin', rim: 'turbine', rimColor: 'black', caliper: '#7ddc1f', wingH: 0.3 }, { limited: { supply: 14, gems: 8000 } }),
  C('muratti-divo-2020', 'Muratti', 'Divo', 2020, 'mitico', 45000000, 1479, 380, 2.4, { type: 'hyper', color: '#7ec3e8', finish: 'gloss', roof: 'black', color2: '#0b0c0e', stripes: 'wide', rim: 'spoke5', rimColor: 'black', caliper: '#7ec3e8', wingH: 0.18 }, { limited: { supply: 40, gems: 6000 } }),
];

export const CAR_BY_ID = Object.fromEntries(CARS.map((c) => [c.id, c]));
export const POOL = CARS.filter((c) => !c.limited);

export const BOXES = [
  { id: 'basica', name: 'Caixa Básica', coins: 5000, gems: 8, odds: { comum: 82, incomum: 15, raro: 2.7, epico: 0.3 }, model3d: { color: '#7c858f', accent: '#c9cfd6' } },
  { id: 'entusiasta', name: 'Caixa Entusiasta', coins: 40000, gems: 30, odds: { comum: 35, incomum: 45, raro: 17, epico: 2.7, lendario: 0.3 }, model3d: { color: '#3b5f9c', accent: '#b9d3ff' } },
  { id: 'colecionador', name: 'Caixa Colecionador', coins: 220000, gems: 95, odds: { incomum: 30, raro: 48, epico: 18.5, lendario: 3.3, mitico: 0.2 }, model3d: { color: '#6a3fa8', accent: '#e3c8ff' } },
  { id: 'prestigio', name: 'Caixa Prestígio', coins: 1500000, gems: 320, odds: { raro: 40, epico: 44, lendario: 14.5, mitico: 1.5 }, model3d: { color: '#c47a12', accent: '#ffe6a8', glow: '#ff9f1a' } },
  { id: 'graal', name: 'Caixa Graal', coins: 9000000, gems: 1100, odds: { epico: 45, lendario: 47, mitico: 8 }, model3d: { color: '#18191c', accent: '#f3c34a', glow: '#ffb000', rough: 0.25, irid: true } },
];
export const BOX_BY_ID = Object.fromEntries(BOXES.map((b) => [b.id, b]));
