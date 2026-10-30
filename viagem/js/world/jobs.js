// Tarefas pesadas do mundo (rodam no worker ou, sem worker, na thread principal).
import { WorldGen } from './gen.js';
import { generateRoads } from './roadgen.js';

export function runJob(state, m) {
  switch (m.type) {
    case 'init':
      state.gen = new WorldGen(m.seed);
      return { result: {}, transfer: [] };
    case 'roads': {
      const roads = generateRoads(state.gen, m.progress);
      state.gen.setRoads(roads);
      return { result: { roads }, transfer: [] };
    }
    case 'setRoads':
      state.gen.setRoads(m.roads);
      return { result: {}, transfer: [] };
    case 'grid': {
      const g = state.gen.buildGrid(m.x0, m.z0, m.nx, m.nz, m.res, m.skirt);
      return { result: g, transfer: [g.pos.buffer, g.nrm.buffer, g.col.buffer, g.wgt.buffer, g.idx.buffer] };
    }
    case 'trees': {
      const t = state.gen.scatterCell(m.cx, m.cz, m.size);
      return { result: { trees: t }, transfer: [t.buffer] };
    }
    default:
      throw new Error('tarefa desconhecida: ' + m.type);
  }
}
