// Leitura de arquivos STL (binário ou ASCII) e preparação da malha:
// solda de vértices repetidos, conversão de eixos e normais suaves.

// Lê o STL e devolve a "sopa" de triângulos (9 floats por triângulo).
export function parseSTL(buffer) {
  const dv = new DataView(buffer);
  if (buffer.byteLength >= 84) {
    const n = dv.getUint32(80, true);
    if (84 + n * 50 === buffer.byteLength) {
      const out = new Float32Array(n * 9);
      let o = 84;
      for (let t = 0; t < n; t++) {
        o += 12; // normal da face (recalculada depois)
        for (let k = 0; k < 9; k++) {
          out[t * 9 + k] = dv.getFloat32(o, true);
          o += 4;
        }
        o += 2;
      }
      return out;
    }
  }
  // ASCII
  const text = new TextDecoder().decode(buffer);
  const re = /vertex\s+([-+\d.eE]+)\s+([-+\d.eE]+)\s+([-+\d.eE]+)/g;
  const vals = [];
  let m;
  while ((m = re.exec(text))) vals.push(+m[1], +m[2], +m[3]);
  return new Float32Array(vals);
}

// Solda vértices iguais e converte do sistema do STL (X lateral, Y comprimento com a
// cabeça em -Y, Z para cima) para o do jogo (x lateral, y para cima, z para a frente).
// `toGame(x, y, z, out)` faz a conversão (escala e origem).
export function weldAndConvert(soup, toGame) {
  const nV = soup.length / 3;
  const map = new Map();
  const index = new Uint32Array(nV);
  const pos = [];
  const src = [];
  const tmp = [0, 0, 0];
  for (let i = 0; i < nV; i++) {
    const x = soup[i * 3];
    const y = soup[i * 3 + 1];
    const z = soup[i * 3 + 2];
    const key = Math.round(x * 2000) + ',' + Math.round(y * 2000) + ',' + Math.round(z * 2000);
    let id = map.get(key);
    if (id === undefined) {
      id = pos.length / 3;
      map.set(key, id);
      toGame(x, y, z, tmp);
      pos.push(tmp[0], tmp[1], tmp[2]);
      src.push(x, y, z);
    }
    index[i] = id;
  }
  // remove triângulos degenerados
  const tris = [];
  for (let t = 0; t < index.length; t += 3) {
    const a = index[t];
    const b = index[t + 1];
    const c = index[t + 2];
    if (a !== b && b !== c && a !== c) tris.push(a, b, c);
  }
  const count = pos.length / 3;
  const idx = count < 65536 ? new Uint16Array(tris) : new Uint32Array(tris);
  return { position: new Float32Array(pos), source: new Float32Array(src), index: idx, count };
}

export function computeNormals(position, index) {
  const n = new Float32Array(position.length);
  for (let t = 0; t < index.length; t += 3) {
    const a = index[t] * 3;
    const b = index[t + 1] * 3;
    const c = index[t + 2] * 3;
    const ux = position[b] - position[a];
    const uy = position[b + 1] - position[a + 1];
    const uz = position[b + 2] - position[a + 2];
    const vx = position[c] - position[a];
    const vy = position[c + 1] - position[a + 1];
    const vz = position[c + 2] - position[a + 2];
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    for (const i of [a, b, c]) {
      n[i] += nx;
      n[i + 1] += ny;
      n[i + 2] += nz;
    }
  }
  for (let i = 0; i < n.length; i += 3) {
    const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1;
    n[i] /= l;
    n[i + 1] /= l;
    n[i + 2] /= l;
  }
  return n;
}

// Lista de vizinhos de cada vértice (formato CSR) para suavizar os pesos pela superfície.
export function buildAdjacency(index, count) {
  const deg = new Uint32Array(count);
  for (let t = 0; t < index.length; t += 3) {
    deg[index[t]] += 2;
    deg[index[t + 1]] += 2;
    deg[index[t + 2]] += 2;
  }
  const start = new Uint32Array(count + 1);
  for (let i = 0; i < count; i++) start[i + 1] = start[i] + deg[i];
  const fill = start.slice(0, count);
  const nb = new Uint32Array(start[count]);
  for (let t = 0; t < index.length; t += 3) {
    const a = index[t];
    const b = index[t + 1];
    const c = index[t + 2];
    nb[fill[a]++] = b;
    nb[fill[a]++] = c;
    nb[fill[b]++] = a;
    nb[fill[b]++] = c;
    nb[fill[c]++] = a;
    nb[fill[c]++] = b;
  }
  return { start, nb };
}
