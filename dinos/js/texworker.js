// Web Worker: gera peles de dinossauro fora da thread principal.
import { genSkin } from './skingen.js';

self.onmessage = (e) => {
  const r = genSkin(e.data);
  self.postMessage(r, [r.color.buffer, r.normal.buffer, r.rough.buffer]);
};
