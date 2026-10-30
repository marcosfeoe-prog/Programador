// Grupo de workers do mundo. Sem suporte a workers de módulo, cai para execução
// direta na thread principal (mais lento, mas funciona).
import { runJob } from './jobs.js';

export class WorkerPool {
  constructor(count, seed) {
    this.seed = seed;
    this.workers = [];
    this.pending = new Map();
    this.nextId = 1;
    this.busy = [];
    this.queue = [];
    this.fallback = null;
    try {
      for (let i = 0; i < count; i++) {
        const w = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
        w.onmessage = (e) => this.onMsg(i, e.data);
        w.onerror = (e) => {
          console.warn('worker falhou, usando a thread principal', e.message);
          this.useFallback();
        };
        this.workers.push(w);
        this.busy.push(0);
      }
    } catch (e) {
      console.warn('workers indisponíveis', e);
      this.useFallback();
    }
  }

  useFallback() {
    if (this.fallback) return;
    for (const w of this.workers) w.terminate();
    this.workers = [];
    this.fallback = {};
    runJob(this.fallback, { type: 'init', seed: this.seed });
    if (this.lastRoads) runJob(this.fallback, { type: 'setRoads', roads: this.lastRoads });
    // reexecuta o que estava pendente
    const pend = [...this.pending.values()];
    this.pending.clear();
    for (const p of pend) this.run(p.msg, p.onProgress).then(p.resolve, p.reject);
  }

  onMsg(wi, d) {
    const p = this.pending.get(d.id);
    if (!p) return;
    if (d.progress !== undefined) {
      if (p.onProgress) p.onProgress(d.progress);
      return;
    }
    this.pending.delete(d.id);
    this.busy[wi]--;
    if (d.ok) p.resolve(d.result);
    else p.reject(new Error(d.error));
  }

  // envia para um worker específico (ou o menos ocupado)
  run(msg, onProgress, target = -1) {
    return new Promise((resolve, reject) => {
      if (this.fallback) {
        // assíncrono para não travar em sequência
        setTimeout(() => {
          try {
            const m = { ...msg };
            if (m.type === 'init' && this.fallback.gen) return resolve({});
            if (m.type === 'setRoads') this.lastRoads = m.roads;
            if (m.type === 'roads') m.progress = onProgress;
            resolve(runJob(this.fallback, m).result);
          } catch (e) {
            reject(e);
          }
        }, 0);
        return;
      }
      const id = this.nextId++;
      let wi = target;
      if (wi < 0) {
        wi = 0;
        for (let i = 1; i < this.workers.length; i++) if (this.busy[i] < this.busy[wi]) wi = i;
      }
      this.busy[wi]++;
      this.pending.set(id, { resolve, reject, onProgress, msg });
      this.workers[wi].postMessage({ ...msg, id });
    });
  }

  broadcast(msg) {
    if (this.fallback) return this.run(msg);
    return Promise.all(this.workers.map((_, i) => this.run(msg, null, i)));
  }

  get load() {
    if (this.fallback) return 0;
    let s = 0;
    for (const b of this.busy) s += b;
    return s;
  }
}
