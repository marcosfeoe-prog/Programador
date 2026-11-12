// Ordem dos níveis do sonho.
import { Level1, META as M1 } from './l1_caminho.js';
import { Level2, META as M2 } from './l2_deserto.js';
import { Level3, META as M3 } from './l3_cogumelos.js';
import { Level4, META as M4 } from './l4_suburbio.js';
import { Level5, META as M5 } from './l5_posto.js';

export const LEVELS = [
  { cls: Level1, meta: M1 },
  { cls: Level2, meta: M2 },
  { cls: Level3, meta: M3 },
  { cls: Level4, meta: M4 },
  { cls: Level5, meta: M5 },
];
