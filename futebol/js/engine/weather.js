// Climas e horários: definem a física do ambiente (densidade do ar, vento,
// atrito e quique do gramado, tração dos jogadores, desgaste físico).
import { RNG, clamp } from '../util.js';
import { PITCH } from './constants.js';

export const WEATHERS = {
  sol: { name: 'Ensolarado', icon: '☀️', cloud: 0.08, rain: 0, snow: 0, fog: 0, wind: [0, 4], temp: [22, 30] },
  nublado: { name: 'Nublado', icon: '☁️', cloud: 0.85, rain: 0, snow: 0, fog: 0.08, wind: [1, 6], temp: [14, 23] },
  chuva: { name: 'Chuva', icon: '🌧️', cloud: 0.95, rain: 0.55, snow: 0, fog: 0.2, wind: [2, 7], temp: [13, 23] },
  tempestade: { name: 'Tempestade', icon: '⛈️', cloud: 1, rain: 1, snow: 0, fog: 0.3, wind: [7, 13], temp: [16, 25], lightning: true, puddles: true },
  neve: { name: 'Neve', icon: '❄️', cloud: 0.95, rain: 0, snow: 1, fog: 0.35, wind: [1, 6], temp: [-7, 0] },
  neblina: { name: 'Neblina', icon: '🌫️', cloud: 0.8, rain: 0, snow: 0, fog: 1, wind: [0, 2], temp: [5, 13] },
  vento: { name: 'Ventania', icon: '🌬️', cloud: 0.45, rain: 0, snow: 0, fog: 0, wind: [11, 17], temp: [12, 21] },
  calor: { name: 'Calor intenso', icon: '🥵', cloud: 0, rain: 0, snow: 0, fog: 0, wind: [0, 3], temp: [33, 39] },
};
export const WEATHER_KEYS = Object.keys(WEATHERS);

export const TIMES = {
  tarde: { name: 'Tarde (16h)', hour: 16 },
  entardecer: { name: 'Pôr do sol (18h)', hour: 18.1 },
  noite: { name: 'Noite (21h30)', hour: 21.5 },
};
export const TIME_KEYS = Object.keys(TIMES);

export const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

// Pesos de cada clima por tipo de região. Estações do hemisfério sul:
// verão dez–fev, inverno jun–ago.
function seasonOf(month) {
  if (month === 11 || month <= 1) return 'verao';
  if (month >= 5 && month <= 7) return 'inverno';
  return 'meia';
}

export function weatherWeights(climate, month, flags = {}) {
  const s = seasonOf(month);
  const V = s === 'verao';
  const I = s === 'inverno';
  let w;
  switch (climate) {
    case 'tropical':
      w = { sol: 3, nublado: 2, chuva: V ? 4 : 2.5, tempestade: V ? 2.5 : 0.8, calor: V ? 2.5 : 1, neblina: 0.2, vento: 0.4, neve: 0 };
      break;
    case 'litoral':
      w = { sol: 3, nublado: 2.5, chuva: 2, tempestade: 0.6, vento: 2, neblina: I ? 1 : 0.4, calor: V ? 0.8 : 0, neve: 0 };
      break;
    case 'temperado':
      w = { sol: 3, nublado: 3, chuva: 2, tempestade: 0.6, neblina: I ? 1.6 : 0.6, vento: 0.8, calor: V ? 0.8 : 0, neve: I ? 0.2 : 0 };
      break;
    case 'frio':
      w = { sol: 2, nublado: 3, chuva: 2, tempestade: 0.3, neblina: 1.2, vento: 1, calor: 0, neve: I ? 3.5 : s === 'meia' ? 0.5 : 0 };
      break;
    case 'montanha':
      w = { sol: 3, nublado: 2, chuva: 1.5, tempestade: 0.6, neblina: 1.4, vento: 1.2, calor: 0, neve: I ? 2 : s === 'meia' ? 0.3 : 0 };
      break;
    case 'semiarido':
      w = { sol: 5, calor: V ? 5 : 2.5, vento: 1.2, nublado: 1, chuva: 0.4, tempestade: 0.2, neblina: 0, neve: 0 };
      break;
    case 'umido':
      w = { neblina: 3, nublado: 3, chuva: 2.5, sol: 1, tempestade: 0.5, vento: 0.4, calor: 0, neve: I ? 0.3 : 0 };
      break;
    default:
      w = { sol: 3, nublado: 2, chuva: 1.5, tempestade: 0.4, neblina: 0.5, vento: 0.5, calor: 0.3, neve: 0 };
  }
  if (flags.stormy) w.tempestade *= 3;
  if (flags.windy) w.vento *= 3;
  return w;
}

export function randomWeather(climate, month, rng, flags) {
  const w = weatherWeights(climate, month, flags);
  const keys = Object.keys(w);
  return rng.weighted(
    keys,
    keys.map((k) => w[k])
  );
}

export function randomTime(rng) {
  return rng.weighted(['tarde', 'entardecer', 'noite'], [0.35, 0.2, 0.45]);
}

// Monta o ambiente físico da partida.
export function makeEnv({ weather = 'sol', time = 'tarde', altitude = 0, seed = 1 } = {}) {
  const W = WEATHERS[weather] || WEATHERS.sol;
  const rng = new RNG(seed * 31 + 7);
  let temp = rng.float(W.temp[0], W.temp[1]) - (altitude / 1000) * 4.5;
  if (time === 'noite') temp -= 3;
  if (weather === 'neve') temp = Math.min(temp, -0.5);
  const rho = 1.225 * Math.exp(-altitude / 8434) * (288.15 / (273.15 + temp));
  const windSpeed = rng.float(W.wind[0], W.wind[1]);
  const windDir = rng.float(0, Math.PI * 2);

  const env = {
    weather,
    time,
    altitude,
    temp,
    rho,
    windSpeed,
    windDir,
    windX: Math.cos(windDir) * windSpeed,
    windZ: Math.sin(windDir) * windSpeed,
    gust: weather === 'vento' || weather === 'tempestade' ? 0.45 : 0.25,
    // gramado seco (padrão)
    restitution: 0.66,
    rollMu: 0.045,
    rollLin: 0.07,
    slideMu: 0.42,
    bounceKeep: 0.88,
    traction: 1,
    speedMul: 1,
    staminaMul: 1,
    ballWet: 0,
    visibility: 1,
    puddles: [],
    rain: W.rain,
    snow: W.snow,
    fog: W.fog,
    cloud: W.cloud,
    lightning: !!W.lightning,
    ballColor: 'branca',
  };
  if (W.rain > 0) {
    // gramado molhado: a bola desliza mais e quica menos; chuteiras escorregam
    env.restitution = 0.6 - W.rain * 0.05;
    env.rollMu = 0.036;
    env.rollLin = 0.05;
    env.slideMu = 0.26 - W.rain * 0.06;
    env.bounceKeep = 0.94;
    env.traction = 0.86 - W.rain * 0.1;
    env.ballWet = W.rain;
  }
  if (W.puddles) {
    // poças: a bola rasteira freia de repente
    for (let i = 0; i < 9; i++) {
      env.puddles.push({
        x: rng.float(-PITCH.HL + 6, PITCH.HL - 6),
        z: rng.float(-PITCH.HW + 4, PITCH.HW - 4),
        r: rng.float(1.6, 3.6),
        sx: rng.float(0.6, 1.4),
      });
    }
  }
  if (W.snow > 0) {
    env.restitution = 0.36;
    env.rollMu = 0.11;
    env.rollLin = 0.32;
    env.slideMu = 0.55;
    env.bounceKeep = 0.62;
    env.traction = 0.72;
    env.speedMul = 0.93;
    env.ballColor = 'laranja';
  }
  if (W.fog > 0.5) env.visibility = 0.55;
  // calor e altitude cansam mais
  if (temp > 28) env.staminaMul += (temp - 28) * 0.045;
  if (altitude > 1200) env.staminaMul += ((altitude - 1200) / 1000) * 0.18;
  if (temp < 2) env.staminaMul += 0.05;
  env.staminaMul = clamp(env.staminaMul, 1, 1.8);
  return env;
}

export function puddleAt(env, x, z) {
  for (const p of env.puddles) {
    const dx = (x - p.x) / (p.r * p.sx);
    const dz = (z - p.z) / p.r;
    const d = dx * dx + dz * dz;
    if (d < 1) return 1 - d;
  }
  return 0;
}

export function describeEnv(env) {
  const W = WEATHERS[env.weather];
  const parts = [`${W.icon} ${W.name}`, `${Math.round(env.temp)}°C`];
  if (env.windSpeed > 3) parts.push(`vento ${Math.round(env.windSpeed * 3.6)} km/h`);
  if (env.altitude > 1000) parts.push(`altitude ${env.altitude} m`);
  return parts.join(' · ');
}
