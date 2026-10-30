// Worker do mundo: gera estradas, blocos de terreno e árvores sem travar o jogo.
import { runJob } from './jobs.js';

const state = {};
self.onmessage = (e) => {
  const m = e.data;
  try {
    if (m.type === 'roads') m.progress = (p) => self.postMessage({ id: m.id, progress: p });
    const { result, transfer } = runJob(state, m);
    self.postMessage({ id: m.id, ok: true, result }, transfer);
  } catch (err) {
    self.postMessage({ id: m.id, ok: false, error: String((err && err.stack) || err) });
  }
};
