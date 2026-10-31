// Competições: liga por pontos corridos (turno e returno), copa em mata-mata
// (com folgas para chegar a uma potência de 2) e fase de grupos + mata-mata.
// Tudo em objetos simples (JSON) para salvar no navegador.

// Rodízio (método do círculo) — devolve as rodadas do turno; o returno inverte o mando.
export function roundRobin(ids, rng, double = true) {
  const teams = ids.slice();
  if (teams.length % 2) teams.push(null);
  rng.shuffle(teams);
  const n = teams.length;
  const rounds = [];
  const arr = teams.slice();
  for (let r = 0; r < n - 1; r++) {
    const games = [];
    for (let i = 0; i < n / 2; i++) {
      const a = arr[i];
      const b = arr[n - 1 - i];
      if (a == null || b == null) continue;
      // alterna o mando para equilibrar
      games.push(r % 2 === 0 ? [a, b] : [b, a]);
    }
    rounds.push(games);
    arr.splice(1, 0, arr.pop());
  }
  if (double) {
    const back = rounds.map((g) => g.map(([h, a]) => [a, h]));
    return rounds.concat(back);
  }
  return rounds;
}

function emptyRow() {
  return { P: 0, W: 0, D: 0, L: 0, GF: 0, GA: 0, Pts: 0, form: [] };
}

export function makeLeague(id, name, teamIds, rng, double = true) {
  const table = {};
  for (const t of teamIds) table[t] = emptyRow();
  return { id, type: 'league', name, teams: teamIds.slice(), rounds: roundRobin(teamIds, rng, double), table };
}

export function applyTable(table, res) {
  const h = table[res.home];
  const a = table[res.away];
  if (!h || !a) return;
  h.P++;
  a.P++;
  h.GF += res.hg;
  h.GA += res.ag;
  a.GF += res.ag;
  a.GA += res.hg;
  if (res.hg > res.ag) {
    h.W++;
    a.L++;
    h.Pts += 3;
    h.form.push('V');
    a.form.push('D');
  } else if (res.hg < res.ag) {
    a.W++;
    h.L++;
    a.Pts += 3;
    h.form.push('D');
    a.form.push('V');
  } else {
    h.D++;
    a.D++;
    h.Pts++;
    a.Pts++;
    h.form.push('E');
    a.form.push('E');
  }
  if (h.form.length > 5) h.form.shift();
  if (a.form.length > 5) a.form.shift();
}

export function sortedTable(table, nameOf = (x) => x) {
  return Object.entries(table)
    .map(([id, r]) => ({ id, ...r, GD: r.GF - r.GA }))
    .sort((a, b) => b.Pts - a.Pts || b.GD - a.GD || b.GF - a.GF || b.W - a.W || String(nameOf(a.id)).localeCompare(String(nameOf(b.id))));
}

export function roundName(n) {
  if (n <= 2) return 'Final';
  if (n <= 4) return 'Semifinal';
  if (n <= 8) return 'Quartas de final';
  if (n <= 16) return 'Oitavas de final';
  return 'Primeira fase';
}

// Copa: seeds = ids em ordem de força (os primeiros ganham folga se preciso).
export function makeCup(id, name, seeds, rng) {
  let size = 1;
  while (size < seeds.length) size *= 2;
  const byes = size - seeds.length;
  const byeTeams = seeds.slice(0, byes);
  const playing = rng.shuffle(seeds.slice(byes));
  const ties = [];
  for (let i = 0; i < playing.length; i += 2) ties.push({ h: playing[i], a: playing[i + 1], res: null, winner: null });
  return { id, type: 'cup', name, size, byes: byeTeams, rounds: [{ name: roundName(size), ties }], champion: null };
}

export function cupRoundDone(cup) {
  const r = cup.rounds[cup.rounds.length - 1];
  return r.ties.every((t) => t.winner);
}

export function cupNextRound(cup, rng) {
  const last = cup.rounds[cup.rounds.length - 1];
  const winners = last.ties.map((t) => t.winner);
  const pool = (cup.rounds.length === 1 && cup.byes ? cup.byes : []).concat(winners);
  if (pool.length === 1) {
    cup.champion = pool[0];
    return null;
  }
  rng.shuffle(pool);
  const ties = [];
  for (let i = 0; i < pool.length; i += 2) ties.push({ h: pool[i], a: pool[i + 1], res: null, winner: null });
  const round = { name: roundName(pool.length), ties };
  cup.rounds.push(round);
  return round;
}

export function applyCup(cup, roundIdx, tieIdx, res) {
  const t = cup.rounds[roundIdx].ties[tieIdx];
  t.res = { hg: res.hg, ag: res.ag, pens: res.pens };
  t.winner = res.winner === 0 ? t.h : t.a;
  if (res.winner == null) t.winner = res.hg >= res.ag ? t.h : t.a;
  if (cup.rounds[roundIdx].name === 'Final' && t.winner) cup.champion = t.winner;
}

// Fase de grupos (turno e returno) + semifinais e final.
export function makeGroups(id, name, seeds, nGroups, rng) {
  const groups = [];
  for (let g = 0; g < nGroups; g++) groups.push([]);
  // pote: cada grupo recebe um de cada faixa de força
  for (let i = 0; i < seeds.length; i++) {
    const pot = Math.floor(i / nGroups);
    const order = rng.shuffle([...Array(nGroups).keys()]);
    for (const g of order) {
      if (groups[g].length === pot) {
        groups[g].push(seeds[i]);
        break;
      }
    }
  }
  const letters = 'ABCDEFGH';
  return {
    id,
    type: 'groups',
    name,
    groups: groups.map((ids, i) => ({ name: 'Grupo ' + letters[i], teams: ids, rounds: roundRobin(ids, rng, true), table: Object.fromEntries(ids.map((t) => [t, emptyRow()])) })),
    knockout: null,
    champion: null,
  };
}

export function groupsDone(gc) {
  return gc.groups.every((g) => Object.values(g.table).every((r) => r.P === (g.teams.length - 1) * 2));
}

export function makeGroupKnockout(gc, nameOf) {
  const [A, B] = gc.groups.map((g) => sortedTable(g.table, nameOf).map((r) => r.id));
  gc.knockout = { rounds: [{ name: 'Semifinal', ties: [{ h: A[0], a: B[1], res: null, winner: null }, { h: B[0], a: A[1], res: null, winner: null }] }] };
  return gc.knockout.rounds[0];
}
