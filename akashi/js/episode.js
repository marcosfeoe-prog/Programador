// Roteiro do Episódio 1 — "O Delinquente de Kōyō" (9:50 = 590 s).
// Cada cena tem tomadas (o que a câmera mostra), falas (legendas) e efeitos
// sonoros, todos com tempo relativo ao início da cena.
import sc01 from './scenes/sc01_cold.js';
import sc02 from './scenes/sc02_op.js';
import sc03 from './scenes/sc03_hall.js';
import sc04 from './scenes/sc04_class.js';
import sc05 from './scenes/sc05_roof.js';
import sc06, { eyecatch } from './scenes/sc06_gym.js';
import sc07 from './scenes/sc07_street.js';
import sc08 from './scenes/sc08_alley.js';
import sc09 from './scenes/sc09_battle.js';
import { aftermath, ending } from './scenes/sc10_end.js';

export const DURATION = 590;

export const EPISODE = [sc01, sc02, sc03, sc04, sc05, eyecatch, sc06, sc07, sc08, sc09, aftermath, ending];

export const CHAPTERS = EPISODE.map((s) => ({ t: s.start, name: s.name }));

// Confere se as cenas cobrem o episódio inteiro, sem buracos.
let t = 0;
for (const s of EPISODE) {
  if (Math.abs(s.start - t) > 1e-6) console.warn('Buraco/sobreposição no roteiro em', t, s.name);
  t = s.start + s.dur;
}
if (Math.abs(t - DURATION) > 1e-6) console.warn('Duração do roteiro:', t);
