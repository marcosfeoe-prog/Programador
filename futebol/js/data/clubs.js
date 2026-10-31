// Os 30 clubes do jogo (todos fictícios), com cidade, estádio, cores,
// uniformes, clima, altitude e estilo de jogo. Os elencos são gerados de forma
// determinística a partir do id do clube (os mesmos jogadores toda vez).
import { RNG, clamp } from '../util.js';

// pattern: solido | listras | finas | aros | faixa | metades | mangas | quartos
// clima: tropical | litoral | temperado | frio | montanha | semiarido | umido
// estilo: posse | pressao | contra | direto | equilibrado
export const CLUBS = [
  { id: 'poc', name: 'Sport Clube Porto Celeste', short: 'Porto Celeste', abbr: 'POC', nick: 'Celeste', city: 'Porto Celeste', stadium: 'Arena do Farol', capacity: 62000, founded: 1903, rating: 85, style: 'posse', formation: '4-3-3', climate: 'litoral', altitude: 15,
    home: { p: '#62b6e8', s: '#ffffff', pattern: 'listras', shorts: '#ffffff', socks: '#62b6e8' }, away: { p: '#13325e', s: '#62b6e8', pattern: 'solido', shorts: '#13325e', socks: '#13325e' }, crest: { shape: 'escudo', symbol: 'farol' } },
  { id: 'aur', name: 'Aurora Futebol Clube', short: 'Aurora', abbr: 'AUR', nick: 'Alvirrubro', city: 'Vila Aurora', stadium: 'Estádio Sol Nascente', capacity: 58000, founded: 1909, rating: 84, style: 'pressao', formation: '4-2-3-1', climate: 'temperado', altitude: 620,
    home: { p: '#c8102e', s: '#ffffff', pattern: 'mangas', shorts: '#ffffff', socks: '#c8102e' }, away: { p: '#ffffff', s: '#c8102e', pattern: 'faixa', shorts: '#c8102e', socks: '#ffffff' }, crest: { shape: 'redondo', symbol: 'sol' } },
  { id: 'rvv', name: 'Real Vale Verde', short: 'Vale Verde', abbr: 'RVV', nick: 'Esmeralda', city: 'Vale Verde', stadium: 'Arena Esmeralda', capacity: 52000, founded: 1915, rating: 82, style: 'posse', formation: '4-3-3', climate: 'tropical', altitude: 300,
    home: { p: '#0a7d3b', s: '#ffffff', pattern: 'aros', shorts: '#ffffff', socks: '#0a7d3b' }, away: { p: '#f4f1e6', s: '#0a7d3b', pattern: 'solido', shorts: '#f4f1e6', socks: '#0a7d3b' }, crest: { shape: 'coroa', symbol: 'coroa' } },
  { id: 'com', name: 'Cometa Esporte Clube', short: 'Cometa', abbr: 'COM', nick: 'Cometa', city: "Estrela d'Alva", stadium: 'Arena Cometa', capacity: 44000, founded: 1960, rating: 81, style: 'contra', formation: '4-3-3', climate: 'temperado', altitude: 500,
    home: { p: '#ff6f00', s: '#0e1e3d', pattern: 'faixa', shorts: '#0e1e3d', socks: '#ff6f00' }, away: { p: '#0e1e3d', s: '#ff6f00', pattern: 'solido', shorts: '#0e1e3d', socks: '#0e1e3d' }, crest: { shape: 'diamante', symbol: 'cometa' } },
  { id: 'asd', name: 'Atlético Serra Dourada', short: 'Serra Dourada', abbr: 'ASD', nick: 'Leão da Serra', city: 'Serra Dourada', stadium: 'Estádio do Pico', capacity: 41000, founded: 1921, rating: 80, style: 'direto', formation: '4-4-2', climate: 'montanha', altitude: 2650,
    home: { p: '#f2c300', s: '#111111', pattern: 'listras', shorts: '#111111', socks: '#f2c300' }, away: { p: '#111111', s: '#f2c300', pattern: 'solido', shorts: '#111111', socks: '#111111' }, crest: { shape: 'escudo', symbol: 'montanha' } },
  { id: 'fen', name: 'Fênix Esporte Clube', short: 'Fênix', abbr: 'FEN', nick: 'Fênix', city: 'Cinzas Altas', stadium: 'Estádio Renascer', capacity: 38000, founded: 1946, rating: 79, style: 'contra', formation: '4-3-3', climate: 'semiarido', altitude: 900,
    home: { p: '#d72d1c', s: '#f5a300', pattern: 'faixa', shorts: '#d72d1c', socks: '#f5a300' }, away: { p: '#f5a300', s: '#d72d1c', pattern: 'solido', shorts: '#f5a300', socks: '#f5a300' }, crest: { shape: 'flamula', symbol: 'chama' } },
  { id: 'vul', name: 'Vulcano Atlético', short: 'Vulcano', abbr: 'VUL', nick: 'Lava', city: 'Vulcano', stadium: 'Estádio da Cratera', capacity: 32000, founded: 1927, rating: 78, style: 'pressao', formation: '4-2-3-1', climate: 'montanha', altitude: 2900,
    home: { p: '#a50000', s: '#111111', pattern: 'metades', shorts: '#111111', socks: '#a50000' }, away: { p: '#e9e4d8', s: '#a50000', pattern: 'solido', shorts: '#e9e4d8', socks: '#e9e4d8' }, crest: { shape: 'escudo', symbol: 'vulcao' } },
  { id: 'ufe', name: 'União Ferroviária', short: 'Ferroviária', abbr: 'UFE', nick: 'Locomotiva', city: 'Ferrópolis', stadium: 'Estádio da Estação', capacity: 36000, founded: 1912, rating: 78, style: 'equilibrado', formation: '4-4-2', climate: 'temperado', altitude: 450,
    home: { p: '#111111', s: '#ffffff', pattern: 'listras', shorts: '#111111', socks: '#111111' }, away: { p: '#ffffff', s: '#111111', pattern: 'solido', shorts: '#ffffff', socks: '#ffffff' }, crest: { shape: 'redondo', symbol: 'engrenagem' } },
  { id: 'eno', name: 'Estrela do Norte FC', short: 'Estrela do Norte', abbr: 'ENO', nick: 'Estrela', city: 'Boreal', stadium: 'Arena Polar', capacity: 34000, founded: 1922, rating: 77, style: 'equilibrado', formation: '4-1-4-1', climate: 'frio', altitude: 700,
    home: { p: '#0e1e3d', s: '#e3c35a', pattern: 'solido', shorts: '#ffffff', socks: '#0e1e3d' }, away: { p: '#ffffff', s: '#0e1e3d', pattern: 'finas', shorts: '#0e1e3d', socks: '#ffffff' }, crest: { shape: 'escudo', symbol: 'estrela' } },
  { id: 'bco', name: 'Bandeirante da Colina', short: 'Bandeirante', abbr: 'BCO', nick: 'Bandeira', city: 'Colina Alta', stadium: 'Estádio do Bandeirante', capacity: 35000, founded: 1910, rating: 77, style: 'equilibrado', formation: '4-4-2', climate: 'temperado', altitude: 760,
    home: { p: '#1d3f8f', s: '#ffffff', pattern: 'metades', shorts: '#ffffff', socks: '#1d3f8f' }, away: { p: '#c8102e', s: '#ffffff', pattern: 'solido', shorts: '#c8102e', socks: '#c8102e' }, crest: { shape: 'flamula', symbol: 'bandeira' } },
  { id: 'onf', name: 'Operário de Nova Forja', short: 'Operário', abbr: 'ONF', nick: 'Fornalha', city: 'Nova Forja', stadium: 'Estádio da Fundição', capacity: 33000, founded: 1919, rating: 76, style: 'pressao', formation: '4-4-2', climate: 'temperado', altitude: 800,
    home: { p: '#e05a00', s: '#222222', pattern: 'solido', shorts: '#222222', socks: '#e05a00' }, away: { p: '#222222', s: '#e05a00', pattern: 'aros', shorts: '#222222', socks: '#222222' }, crest: { shape: 'castelo', symbol: 'martelo' } },
  { id: 'gls', name: 'Grêmio Lago Sereno', short: 'Lago Sereno', abbr: 'GLS', nick: 'Cisne', city: 'Lago Sereno', stadium: 'Estádio do Lago', capacity: 30000, founded: 1928, rating: 75, style: 'posse', formation: '4-3-3', climate: 'frio', altitude: 950,
    home: { p: '#ffffff', s: '#0b2a5c', pattern: 'faixa', shorts: '#0b2a5c', socks: '#ffffff' }, away: { p: '#0b2a5c', s: '#ffffff', pattern: 'solido', shorts: '#0b2a5c', socks: '#0b2a5c' }, crest: { shape: 'redondo', symbol: 'onda' } },
  { id: 'min', name: 'Mineração Esporte Clube', short: 'Mineração', abbr: 'MIN', nick: 'Picareta', city: 'Ouro Fundo', stadium: 'Estádio da Mina', capacity: 29000, founded: 1918, rating: 75, style: 'direto', formation: '5-3-2', climate: 'montanha', altitude: 1250,
    home: { p: '#2b2b2b', s: '#d4a017', pattern: 'listras', shorts: '#2b2b2b', socks: '#d4a017' }, away: { p: '#d4a017', s: '#2b2b2b', pattern: 'solido', shorts: '#d4a017', socks: '#d4a017' }, crest: { shape: 'castelo', symbol: 'picareta' } },
  { id: 'nbf', name: 'Náutico Baía Funda', short: 'Náutico', abbr: 'NBF', nick: 'Timoneiro', city: 'Baía Funda', stadium: 'Estádio do Cais', capacity: 31000, founded: 1907, rating: 74, style: 'equilibrado', formation: '4-2-3-1', climate: 'litoral', altitude: 10,
    home: { p: '#ffffff', s: '#c8102e', pattern: 'aros', shorts: '#ffffff', socks: '#c8102e' }, away: { p: '#c8102e', s: '#ffffff', pattern: 'solido', shorts: '#c8102e', socks: '#c8102e' }, crest: { shape: 'redondo', symbol: 'ancora' } },
  { id: 'ven', name: 'Esporte Clube Ventania', short: 'Ventania', abbr: 'VEN', nick: 'Furacão', city: 'Ventania', stadium: 'Estádio dos Ventos', capacity: 28000, founded: 1931, rating: 74, style: 'contra', formation: '4-4-2', climate: 'litoral', altitude: 5, windy: true,
    home: { p: '#0047ab', s: '#ffd200', pattern: 'faixa', shorts: '#0047ab', socks: '#ffd200' }, away: { p: '#ffd200', s: '#0047ab', pattern: 'solido', shorts: '#ffd200', socks: '#ffd200' }, crest: { shape: 'diamante', symbol: 'espiral' } },
  { id: 'amc', name: 'Atlética Monte Claro', short: 'Monte Claro', abbr: 'AMC', nick: 'Águia', city: 'Monte Claro', stadium: 'Estádio do Mirante', capacity: 26000, founded: 1933, rating: 73, style: 'direto', formation: '4-2-3-1', climate: 'montanha', altitude: 1850,
    home: { p: '#7a1f2b', s: '#e8d7a6', pattern: 'solido', shorts: '#e8d7a6', socks: '#7a1f2b' }, away: { p: '#e8d7a6', s: '#7a1f2b', pattern: 'quartos', shorts: '#e8d7a6', socks: '#e8d7a6' }, crest: { shape: 'escudo', symbol: 'aguia' } },
  { id: 'ipa', name: 'Independente de Pedra Azul', short: 'Pedra Azul', abbr: 'IPA', nick: 'Rochedo', city: 'Pedra Azul', stadium: 'Estádio da Rocha', capacity: 24000, founded: 1925, rating: 72, style: 'equilibrado', formation: '3-5-2', climate: 'montanha', altitude: 1400,
    home: { p: '#1c2f6e', s: '#9fc3ff', pattern: 'metades', shorts: '#1c2f6e', socks: '#1c2f6e' }, away: { p: '#9fc3ff', s: '#1c2f6e', pattern: 'solido', shorts: '#9fc3ff', socks: '#9fc3ff' }, crest: { shape: 'diamante', symbol: 'montanha' } },
  { id: 'car', name: 'Caravela Sport', short: 'Caravela', abbr: 'CAR', nick: 'Navegante', city: 'Caravelas do Sul', stadium: 'Estádio da Caravela', capacity: 26000, founded: 1904, rating: 72, style: 'posse', formation: '4-1-4-1', climate: 'litoral', altitude: 12,
    home: { p: '#002a5c', s: '#ffffff', pattern: 'aros', shorts: '#002a5c', socks: '#002a5c' }, away: { p: '#ffffff', s: '#002a5c', pattern: 'mangas', shorts: '#ffffff', socks: '#ffffff' }, crest: { shape: 'escudo', symbol: 'navio' } },
  { id: 'lsa', name: 'Leões da Savana', short: 'Savana', abbr: 'LSA', nick: 'Juba', city: 'Savana Grande', stadium: 'Estádio da Juba', capacity: 27000, founded: 1937, rating: 71, style: 'direto', formation: '4-4-2', climate: 'semiarido', altitude: 600,
    home: { p: '#c99a2e', s: '#4a2c10', pattern: 'solido', shorts: '#4a2c10', socks: '#c99a2e' }, away: { p: '#4a2c10', s: '#c99a2e', pattern: 'solido', shorts: '#4a2c10', socks: '#4a2c10' }, crest: { shape: 'escudo', symbol: 'leao' } },
  { id: 'pin', name: 'Pinheiral Futebol Clube', short: 'Pinheiral', abbr: 'PIN', nick: 'Pinha', city: 'Pinheiral', stadium: 'Estádio das Araucárias', capacity: 22000, founded: 1935, rating: 70, style: 'pressao', formation: '4-4-2', climate: 'frio', altitude: 1100,
    home: { p: '#1f5132', s: '#d9c27a', pattern: 'listras', shorts: '#1f5132', socks: '#1f5132' }, away: { p: '#d9c27a', s: '#1f5132', pattern: 'solido', shorts: '#d9c27a', socks: '#d9c27a' }, crest: { shape: 'flamula', symbol: 'pinheiro' } },
  { id: 'pce', name: 'Princesa do Cerrado', short: 'Princesa', abbr: 'PCE', nick: 'Princesa', city: 'Cerradópolis', stadium: 'Estádio do Ipê', capacity: 25000, founded: 1958, rating: 70, style: 'posse', formation: '4-3-3', climate: 'tropical', altitude: 1050,
    home: { p: '#5b2a86', s: '#f2e6ff', pattern: 'solido', shorts: '#f2e6ff', socks: '#5b2a86' }, away: { p: '#f2e6ff', s: '#5b2a86', pattern: 'faixa', shorts: '#f2e6ff', socks: '#f2e6ff' }, crest: { shape: 'coroa', symbol: 'coroa' } },
  { id: 'mdu', name: 'Marítimo das Dunas', short: 'Marítimo', abbr: 'MDU', nick: 'Tubarão', city: 'Dunas Brancas', stadium: 'Estádio da Maré', capacity: 21000, founded: 1940, rating: 69, style: 'contra', formation: '4-4-2', climate: 'semiarido', altitude: 20,
    home: { p: '#00a3a3', s: '#ffffff', pattern: 'finas', shorts: '#ffffff', socks: '#00a3a3' }, away: { p: '#ffffff', s: '#00a3a3', pattern: 'solido', shorts: '#00a3a3', socks: '#ffffff' }, crest: { shape: 'redondo', symbol: 'onda' } },
  { id: 'rea', name: 'Rio Escuro Atlético', short: 'Rio Escuro', abbr: 'REA', nick: 'Correnteza', city: 'Rio Escuro', stadium: 'Estádio da Correnteza', capacity: 23000, founded: 1930, rating: 68, style: 'contra', formation: '5-3-2', climate: 'umido', altitude: 200,
    home: { p: '#004d40', s: '#0a0a0a', pattern: 'listras', shorts: '#0a0a0a', socks: '#004d40' }, away: { p: '#b2dfdb', s: '#004d40', pattern: 'solido', shorts: '#b2dfdb', socks: '#b2dfdb' }, crest: { shape: 'escudo', symbol: 'gota' } },
  { id: 'tem', name: 'Tempestade Futebol Clube', short: 'Tempestade', abbr: 'TEM', nick: 'Raio', city: 'Trovoada', stadium: 'Estádio do Trovão', capacity: 20000, founded: 1963, rating: 67, style: 'pressao', formation: '4-3-3', climate: 'tropical', altitude: 120, stormy: true,
    home: { p: '#3a3f47', s: '#ffe600', pattern: 'faixa', shorts: '#3a3f47', socks: '#ffe600' }, away: { p: '#ffe600', s: '#3a3f47', pattern: 'solido', shorts: '#ffe600', socks: '#ffe600' }, crest: { shape: 'diamante', symbol: 'raio' } },
  { id: 'tri', name: 'Tritão Atlético', short: 'Tritão', abbr: 'TRI', nick: 'Tridente', city: 'Ilha do Tritão', stadium: 'Estádio do Atol', capacity: 18000, founded: 1951, rating: 66, style: 'posse', formation: '4-3-3', climate: 'tropical', altitude: 3,
    home: { p: '#0b6e99', s: '#7fe0d4', pattern: 'aros', shorts: '#0b6e99', socks: '#7fe0d4' }, away: { p: '#7fe0d4', s: '#0b6e99', pattern: 'solido', shorts: '#7fe0d4', socks: '#7fe0d4' }, crest: { shape: 'redondo', symbol: 'tridente' } },
  { id: 'sbr', name: 'Santa Brisa Esporte Clube', short: 'Santa Brisa', abbr: 'SBR', nick: 'Brisa', city: 'Santa Brisa', stadium: 'Estádio da Brisa', capacity: 19000, founded: 1948, rating: 65, style: 'posse', formation: '4-2-3-1', climate: 'litoral', altitude: 40,
    home: { p: '#8fd3f4', s: '#003366', pattern: 'solido', shorts: '#003366', socks: '#8fd3f4' }, away: { p: '#003366', s: '#8fd3f4', pattern: 'finas', shorts: '#003366', socks: '#003366' }, crest: { shape: 'flamula', symbol: 'passaro' } },
  { id: 'coq', name: 'Coqueiral Futebol Clube', short: 'Coqueiral', abbr: 'COQ', nick: 'Coqueiro', city: 'Coqueiral', stadium: 'Estádio dos Coqueiros', capacity: 17000, founded: 1955, rating: 63, style: 'contra', formation: '4-4-2', climate: 'tropical', altitude: 8,
    home: { p: '#ffd400', s: '#0a7d3b', pattern: 'solido', shorts: '#0a7d3b', socks: '#ffd400' }, away: { p: '#0a7d3b', s: '#ffd400', pattern: 'mangas', shorts: '#0a7d3b', socks: '#0a7d3b' }, crest: { shape: 'escudo', symbol: 'palmeira' } },
  { id: 'neb', name: 'Neblina Esporte Clube', short: 'Neblina', abbr: 'NEB', nick: 'Fantasma', city: 'Vale da Neblina', stadium: 'Estádio do Nevoeiro', capacity: 16000, founded: 1950, rating: 62, style: 'contra', formation: '4-1-4-1', climate: 'umido', altitude: 1500,
    home: { p: '#d9d9d9', s: '#4b0082', pattern: 'solido', shorts: '#4b0082', socks: '#d9d9d9' }, away: { p: '#4b0082', s: '#d9d9d9', pattern: 'aros', shorts: '#4b0082', socks: '#4b0082' }, crest: { shape: 'redondo', symbol: 'lua' } },
  { id: 'gra', name: 'Granito Futebol Clube', short: 'Granito', abbr: 'GRA', nick: 'Pedreira', city: 'Granitópolis', stadium: 'Estádio da Pedreira', capacity: 15000, founded: 1939, rating: 61, style: 'direto', formation: '5-3-2', climate: 'frio', altitude: 1300,
    home: { p: '#8e8e8e', s: '#1a1a1a', pattern: 'listras', shorts: '#1a1a1a', socks: '#8e8e8e' }, away: { p: '#1a1a1a', s: '#8e8e8e', pattern: 'solido', shorts: '#1a1a1a', socks: '#1a1a1a' }, crest: { shape: 'castelo', symbol: 'picareta' } },
  { id: 'sab', name: 'Sabiá Futebol Clube', short: 'Sabiá', abbr: 'SAB', nick: 'Sabiá', city: 'Sabiá', stadium: 'Estádio do Canto', capacity: 14000, founded: 1966, rating: 60, style: 'equilibrado', formation: '4-4-2', climate: 'temperado', altitude: 350,
    home: { p: '#6b8e23', s: '#ffffff', pattern: 'solido', shorts: '#ffffff', socks: '#6b8e23' }, away: { p: '#ffffff', s: '#6b8e23', pattern: 'aros', shorts: '#6b8e23', socks: '#ffffff' }, crest: { shape: 'flamula', symbol: 'passaro' } },
];

export const CLUB_BY_ID = Object.fromEntries(CLUBS.map((c) => [c.id, c]));
export const club = (id) => CLUB_BY_ID[id];

export const STYLE_NAMES = {
  posse: 'Posse de bola',
  pressao: 'Pressão alta',
  contra: 'Contra-ataque',
  direto: 'Jogo direto',
  equilibrado: 'Equilibrado',
};

export const CLIMATE_NAMES = {
  tropical: 'Tropical (calor e pancadas de chuva)',
  litoral: 'Litorâneo (brisa e vento)',
  temperado: 'Temperado',
  frio: 'Frio (neve no inverno)',
  montanha: 'Montanha (ar rarefeito)',
  semiarido: 'Semiárido (calor seco)',
  umido: 'Úmido (neblina frequente)',
};

// ---------------------------------------------------------------- elencos

const FIRST = [
  'Lucas', 'Gabriel', 'Mateus', 'Rafael', 'Bruno', 'Thiago', 'Felipe', 'Diego', 'Rodrigo', 'Gustavo', 'Vinícius', 'Caio',
  'Leonardo', 'André', 'Danilo', 'Eduardo', 'Henrique', 'Igor', 'João', 'Júlio', 'Marcelo', 'Murilo', 'Otávio', 'Paulo',
  'Renan', 'Samuel', 'Túlio', 'Vitor', 'Wesley', 'Yuri', 'Alan', 'Arthur', 'Breno', 'Davi', 'Enzo', 'Fábio', 'Hugo',
  'Ícaro', 'Kauã', 'Luan', 'Marcos', 'Nícolas', 'Pedro', 'Ramon', 'Saulo', 'Tales', 'Ulisses', 'Valter', 'Wagner',
  'Elias', 'Cauê', 'Alex', 'Douglas', 'Everton', 'Fernando', 'Gil', 'Heitor', 'Ivan', 'Jefferson', 'Kléber', 'Lauro',
  'Moisés', 'Nathan', 'Orlando', 'Patrick', 'Ronaldo', 'Sérgio', 'Teo', 'Ubiratan', 'Wellington', 'Zeca', 'Bento',
];
const LAST = [
  'Silva', 'Souza', 'Oliveira', 'Santos', 'Lima', 'Pereira', 'Costa', 'Rodrigues', 'Almeida', 'Nascimento', 'Carvalho',
  'Araújo', 'Ribeiro', 'Gomes', 'Martins', 'Rocha', 'Barbosa', 'Moreira', 'Cardoso', 'Teixeira', 'Correia', 'Mendes',
  'Freitas', 'Barros', 'Pinto', 'Monteiro', 'Vieira', 'Batista', 'Moura', 'Dias', 'Nogueira', 'Fonseca', 'Siqueira',
  'Prado', 'Queiroz', 'Rezende', 'Tavares', 'Viana', 'Xavier', 'Bezerra', 'Campos', 'Duarte', 'Esteves', 'Falcão',
  'Guimarães', 'Leite', 'Macedo', 'Neves', 'Pacheco', 'Quintana', 'Ramos', 'Sampaio', 'Torres', 'Valença', 'Brandão',
  'Coelho', 'Dantas', 'Ferraz', 'Galvão', 'Holanda', 'Jardim', 'Lacerda', 'Matos', 'Paiva', 'Sales', 'Bastos', 'Cunha',
];
const NICK_BASE = [
  'Tico', 'Dudu', 'Juninho', 'Netinho', 'Pipo', 'Biel', 'Dinho', 'Tuca', 'Léo', 'Gui', 'Rafinha', 'Didi', 'Zé Lucas',
  'Bebeto', 'Cacá', 'Nino', 'Tatá', 'Lelê', 'Pedrinho', 'Paulinho', 'Marquinhos', 'Felipão', 'Bruninho', 'Toninho',
  'Serginho', 'Lucão', 'Chicão', 'Mineiro', 'Baiano', 'Gaúcho', 'Tchê', 'Fumaça', 'Pelado', 'Careca', 'Bolinha',
];

// Posições do elenco (22 jogadores).
const SQUAD_POS = ['GK', 'GK', 'CB', 'CB', 'CB', 'CB', 'LB', 'LB', 'RB', 'RB', 'DM', 'DM', 'CM', 'CM', 'CM', 'AM', 'LW', 'RW', 'ST', 'ST', 'ST', 'CM'];
const FIRST_NUM = { GK: [1, 12], CB: [3, 4, 14, 15], LB: [6, 16], RB: [2, 13], DM: [5, 17], CM: [8, 18, 20, 21], AM: [10], LW: [11], RW: [7], ST: [9, 19, 22] };

export const POS_NAMES = { GK: 'GOL', CB: 'ZAG', LB: 'LE', RB: 'LD', DM: 'VOL', CM: 'MC', AM: 'MEI', LW: 'PE', RW: 'PD', ST: 'ATA' };
export const POS_LINE = { GK: 'gk', CB: 'def', LB: 'def', RB: 'def', DM: 'mid', CM: 'mid', AM: 'mid', LW: 'att', RW: 'att', ST: 'att' };

// Peso de cada atributo por posição para o "geral".
// pac velocidade, acc aceleração, sta resistência, str força, pas passe,
// sho finalização, pow potência, dri drible, con domínio, tac desarme,
// hea cabeceio, vis visão/posicionamento, ref reflexos, han manejo, dive elasticidade.
const PROFILE = {
  GK: { ref: 3, han: 2.5, dive: 2.5, vis: 1.5, pas: 0.5, str: 0.5 },
  CB: { tac: 3, hea: 2, str: 2, vis: 1.5, pac: 1, pas: 0.6, con: 0.5 },
  LB: { pac: 2, acc: 1.5, tac: 2, sta: 1.5, pas: 1.2, dri: 0.8, con: 0.6 },
  RB: { pac: 2, acc: 1.5, tac: 2, sta: 1.5, pas: 1.2, dri: 0.8, con: 0.6 },
  DM: { tac: 2.4, vis: 1.8, pas: 1.8, sta: 1.4, str: 1.3, con: 1 },
  CM: { pas: 2.5, vis: 2, con: 1.6, sta: 1.4, dri: 1, tac: 0.8, sho: 0.6 },
  AM: { pas: 2.2, dri: 2, vis: 2, con: 1.8, sho: 1.4, acc: 0.8 },
  LW: { pac: 2.2, acc: 1.8, dri: 2.2, con: 1.2, sho: 1, pas: 1 },
  RW: { pac: 2.2, acc: 1.8, dri: 2.2, con: 1.2, sho: 1, pas: 1 },
  ST: { sho: 3, pow: 1.4, hea: 1.4, con: 1.4, acc: 1.2, pac: 1.2, dri: 1, str: 0.8 },
};
export const ATTR_KEYS = ['pac', 'acc', 'sta', 'str', 'pas', 'sho', 'pow', 'dri', 'con', 'tac', 'hea', 'vis', 'ref', 'han', 'dive'];
export const ATTR_NAMES = {
  pac: 'Velocidade', acc: 'Aceleração', sta: 'Resistência', str: 'Força', pas: 'Passe', sho: 'Finalização', pow: 'Potência',
  dri: 'Drible', con: 'Domínio', tac: 'Desarme', hea: 'Cabeceio', vis: 'Visão', ref: 'Reflexos', han: 'Manejo', dive: 'Elasticidade',
};

export function overallFor(attr, pos) {
  const prof = PROFILE[pos];
  let s = 0;
  let w = 0;
  for (const k in prof) {
    s += attr[k] * prof[k];
    w += prof[k];
  }
  return Math.round(s / w);
}

const SKIN = ['#f1c9a5', '#e0ac85', '#c68e64', '#a5704a', '#7d5136', '#5b3a26', '#3f281b'];
const HAIR = ['#141110', '#2a1d14', '#4a3020', '#6b4a2a', '#a8763e', '#d8b46a', '#1e1e1e', '#8a3b1a'];

const cache = new Map();

export function getSquad(clubId) {
  if (cache.has(clubId)) return cache.get(clubId);
  const c = CLUB_BY_ID[clubId];
  const rng = new RNG('elenco-' + clubId);
  const usedNames = new Set();
  const usedNums = new Set();
  const players = SQUAD_POS.map((pos, i) => {
    // os primeiros de cada posição são titulares, mais fortes
    const starterBonus = [0, 2, 3, 6, 8, 10, 12, 13, 15, 16, 17, 18].includes(i) ? 2.5 : -3;
    const base = c.rating + starterBonus + rng.gauss(0, 3);
    const attr = {};
    for (const k of ATTR_KEYS) {
      let v = base - 14 + rng.gauss(0, 7);
      if (pos !== 'GK' && (k === 'ref' || k === 'han' || k === 'dive')) v = 18 + rng.float(0, 18);
      attr[k] = v;
    }
    // reforça os atributos que importam para a posição
    const prof = PROFILE[pos];
    for (const k in prof) attr[k] += prof[k] * 4 + rng.gauss(0, 3);
    if (pos === 'GK') {
      attr.pac -= 18;
      attr.dri -= 25;
      attr.sho -= 30;
      attr.tac -= 30;
    }
    if (pos === 'CB') {
      attr.dri -= 8;
      attr.sho -= 12;
    }
    for (const k of ATTR_KEYS) attr[k] = Math.round(clamp(attr[k], 20, 97));
    // ajusta o geral para ficar perto do alvo
    const target = clamp(Math.round(base), 45, 93);
    const ov = overallFor(attr, pos);
    const diff = target - ov;
    for (const k in prof) attr[k] = Math.round(clamp(attr[k] + diff, 20, 97));

    let name;
    for (let tries = 0; tries < 20; tries++) {
      const r = rng.next();
      const first = rng.pick(FIRST);
      const last = rng.pick(LAST);
      let shirt;
      if (r < 0.52) shirt = last;
      else if (r < 0.8) shirt = first;
      else shirt = rng.pick(NICK_BASE);
      name = { full: `${first} ${last}`, shirt };
      if (!usedNames.has(shirt)) break;
    }
    usedNames.add(name.shirt);

    let num = (FIRST_NUM[pos] || []).find((n) => !usedNums.has(n));
    if (!num) {
      do num = rng.int(23, 40);
      while (usedNums.has(num));
    }
    usedNums.add(num);

    const tall = pos === 'GK' || pos === 'CB' ? 0.07 : pos === 'ST' ? 0.03 : 0;
    const height = Math.round((1.68 + tall + rng.float(0, 0.2) + (attr.hea - 60) * 0.001) * 100) / 100;
    return {
      id: `${clubId}-${i}`,
      club: clubId,
      name: name.full,
      shirt: name.shirt,
      num,
      pos,
      age: rng.int(18, 35),
      foot: rng.chance(0.24) ? 'E' : 'D',
      height,
      attr,
      ovr: overallFor(attr, pos),
      look: {
        skin: rng.pick(SKIN),
        hair: rng.pick(HAIR),
        hairStyle: rng.int(0, 4),
        beard: rng.chance(0.3),
      },
    };
  });
  cache.set(clubId, players);
  return players;
}

// Força média do time (titulares) por setor — usada na simulação rápida.
export function clubStrength(clubId) {
  const sq = getSquad(clubId);
  const best = (line, n) =>
    sq
      .filter((p) => POS_LINE[p.pos] === line)
      .map((p) => p.ovr)
      .sort((a, b) => b - a)
      .slice(0, n);
  const avg = (a) => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);
  const gk = avg(best('gk', 1));
  const def = avg(best('def', 4));
  const mid = avg(best('mid', 4));
  const att = avg(best('att', 3));
  return { gk, def, mid, att, ovr: (gk + def * 4 + mid * 4 + att * 2) / 11 };
}
