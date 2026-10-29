'use strict';
// Constantes e tabelas de balanceamento.

const CELL = 48;                 // tamanho de uma célula da grade (px do mundo)
const WORLD_CELLS = 200;         // o mundo tem 200×200 células
const WORLD = CELL * WORLD_CELLS;
const MAX_TIER = 8;
const BUILD_RANGE = 900;         // raio de construção em volta do Cofre de Ouro
const DAY_LEN = 80;              // segundos de dia
const NIGHT_LEN = 50;            // segundos de noite (onda)
const PLAYER_SPEED = 250;
const PLAYER_HP = 100;
const BOSS_EVERY = 8;            // um chefão a cada 8 ondas

const TIER_ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];
const GOLD_TABLE = [0, 100, 300, 800, 2000, 4500, 9000, 18000];
const HP_MULT = [1, 1.35, 1.8, 2.4, 3.2, 4.2, 5.5, 7.2];
const DMG_MULT = [1, 1.4, 1.9, 2.6, 3.5, 4.7, 6.3, 8.5];
const RES_MULT = [1, 2, 4, 8, 16, 30, 50, 80]; // madeira/pedra para melhorar

const BUILDINGS = {
  stash: {
    name: 'Cofre de Ouro', size: 2, cost: {}, goldF: 3, hp: 1500, limit: 1,
    desc: 'O coração da sua base. Se ele cair, você perde. Melhore-o para liberar níveis maiores nas outras construções.',
  },
  wall: {
    name: 'Parede', size: 1, cost: { wood: 2 }, goldF: 0.05, hp: 150, limit: 250,
    desc: 'Bloqueia o caminho dos zumbis. Segure o botão e arraste para construir várias.',
  },
  door: {
    name: 'Porta', size: 1, cost: { wood: 5, stone: 5 }, goldF: 0.1, hp: 150, limit: 40,
    desc: 'Você passa por ela, os zumbis não.',
  },
  slowtrap: {
    name: 'Armadilha Lenta', size: 1, cost: { wood: 5, stone: 5 }, goldF: 0.2, hp: 150, limit: 12,
    slow: [0.5, 0.45, 0.4, 0.36, 0.32, 0.28, 0.24, 0.2],
    desc: 'Gosma que deixa os zumbis lentos enquanto passam por cima.',
  },
  arrow: {
    name: 'Torre de Flechas', size: 2, cost: { wood: 5, stone: 5 }, goldF: 1, hp: 150, limit: 6, tower: true,
    dmg: 10, rate: 0.45, range: 560, proj: 'arrow', speed: 1000,
    desc: 'Atira flechas rápidas em um alvo de cada vez. Alcance longo.',
  },
  cannon: {
    name: 'Torre Canhão', size: 2, cost: { wood: 15, stone: 15 }, goldF: 1, hp: 200, limit: 6, tower: true,
    dmg: 22, rate: 1.0, range: 480, proj: 'ball', speed: 760, splash: 55,
    desc: 'Balas de canhão com dano em área pequena.',
  },
  melee: {
    name: 'Torre de Soco', size: 2, cost: { wood: 10, stone: 10 }, goldF: 1, hp: 260, limit: 6, tower: true,
    dmg: 48, rate: 0.6, range: 170,
    desc: 'Alcance curto, dano altíssimo. Ótima perto das paredes.',
  },
  bomb: {
    name: 'Torre de Bombas', size: 2, cost: { wood: 10, stone: 10 }, goldF: 1, hp: 150, limit: 6, tower: true,
    dmg: 34, rate: 1.7, range: 620, proj: 'bomb', splash: 115,
    desc: 'Lança bombas de longe com grande dano em área. Lenta.',
  },
  mage: {
    name: 'Torre Mágica', size: 2, cost: { wood: 20, stone: 20 }, goldF: 1, hp: 150, limit: 6, tower: true,
    dmg: 9, rate: 0.85, range: 400, proj: 'orb', speed: 720, shots: 3,
    desc: 'Dispara um leque de três orbes mágicos.',
  },
  goldmine: {
    name: 'Mina de Ouro', size: 2, cost: { wood: 5, stone: 5 }, goldF: 0.7, hp: 150, limit: 8,
    income: [2, 3, 4.5, 6.5, 9, 12, 16, 21],
    desc: 'Gera ouro sem parar. Proteja-as!',
  },
  harvester: {
    name: 'Coletor', size: 2, cost: { wood: 5, stone: 5 }, goldF: 0.6, hp: 150, limit: 4,
    rate: [1, 1.5, 2.1, 2.8, 3.6, 4.6, 6, 8], radius: 300,
    desc: 'Coleta madeira e pedra das árvores e rochas próximas. Gasta um pouco de ouro.',
  },
};

const TOOLBAR = ['wall', 'door', 'slowtrap', 'arrow', 'cannon', 'melee', 'bomb', 'mage', 'goldmine', 'harvester'];

const ZOMBIE_TIERS = [
  { name: 'Verde',    color: '#6a9a4a', dark: '#476e30', hp: 40,   dmg: 6,   speed: 82 },
  { name: 'Azul',     color: '#4f86c6', dark: '#335f96', hp: 100,  dmg: 10,  speed: 86 },
  { name: 'Vermelho', color: '#d04848', dark: '#962c2c', hp: 230,  dmg: 16,  speed: 90 },
  { name: 'Amarelo',  color: '#d9bb3d', dark: '#a38a20', hp: 470,  dmg: 25,  speed: 94 },
  { name: 'Roxo',     color: '#8d55c6', dark: '#633592', hp: 920,  dmg: 38,  speed: 98 },
  { name: 'Laranja',  color: '#e27d32', dark: '#a8581c', hp: 1750, dmg: 55,  speed: 102 },
  { name: 'Rosa',     color: '#e25fa8', dark: '#a83d79', hp: 3100, dmg: 80,  speed: 106 },
  { name: 'Sombrio',  color: '#454a52', dark: '#24272c', hp: 5400, dmg: 110, speed: 110 },
];

const WEAPONS = {
  pickaxe: {
    name: 'Picareta', costs: [0, 400, 1200, 3500, 8000, 16000, 32000],
    dmg: [10, 14, 19, 25, 33, 43, 56], gather: [1, 2, 3, 4, 5, 7, 9], rate: 0.42, range: 64,
    desc: 'Coleta madeira e pedra. Cada nível coleta mais.',
  },
  spear: {
    name: 'Lança', costs: [1200, 2500, 5000, 10000, 18000, 30000, 50000],
    dmg: [24, 34, 48, 66, 90, 122, 168], rate: 0.5, range: 105,
    desc: 'Arma corpo a corpo de alto dano. Não coleta recursos.',
  },
  bow: {
    name: 'Arco', costs: [1000, 2200, 4500, 9000, 16000, 27000, 45000],
    dmg: [14, 20, 28, 40, 55, 75, 100], rate: 0.55, range: 620,
    desc: 'Atira flechas de longe.',
  },
  bomb: {
    name: 'Bomba', costs: [2500, 5000, 9000, 15000, 24000, 36000, 55000],
    dmg: [45, 65, 90, 125, 170, 230, 310], rate: 1.1, range: 420, splash: 95,
    desc: 'Arremessa bombas com dano em área.',
  },
};
const WEAPON_ORDER = ['pickaxe', 'spear', 'bow', 'bomb'];

const SHIELD = {
  name: 'Escudo Zumbi', costs: [1000, 2500, 5000, 9000, 15000, 24000, 38000],
  hp: [40, 70, 110, 160, 230, 320, 440],
  desc: 'Absorve dano antes da sua vida. Recarrega após alguns segundos sem levar golpes.',
};
const POTION_COST = 100;
