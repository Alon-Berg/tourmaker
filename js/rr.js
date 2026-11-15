/* Tourmaker - round robin (FIDE Berger tables) and knockout brackets. Pure logic, no DOM. */
(function (root) {
  'use strict';
  const HTM = root.HTM = root.HTM || {};

  // ---------------------------------------------------------------------------------------------- round robin
  // The rounds of one cycle for players 1..n; a pair is [white, black]. With an odd n the dummy player n+1 stands for the round off.
  HTM.bergerRounds = function (n) {
    if (n < 2) return [];
    const m = n % 2 ? n + 1 : n;
    const rounds = [];
    for (let r = 0; r < m - 1; r++) {
      const p = ((r * (m / 2)) % (m - 1)) + 1;                  // the partner of the fixed player m
      const pairs = [r % 2 === 0 ? [p, m] : [m, p]];
      const L = [];                                              // the other players in cyclic order after p; the earlier of a pair has White
      for (let t = 1; t <= m - 2; t++) L.push(((p - 1 + t) % (m - 1)) + 1);
      for (let i = 0; i < L.length / 2; i++) pairs.push([L[i], L[L.length - 1 - i]]);
      rounds.push(pairs);
    }
    return rounds;
  };

  HTM.createRoundRobin = function (T) {
    const ps = HTM.playersByNo(T), n = ps.length;
    if (n < 2) throw new Error('Enter at least two players.');
    const base = HTM.bergerRounds(n);
    T.rounds = [];
    for (let c = 0; c < (T.opts.doubleRR ? 2 : 1); c++) {
      for (const pairs of base) {
        const games = [], byes = [];
        for (const [a, b] of pairs) {
          const w = c % 2 === 0 ? a : b, bl = c % 2 === 0 ? b : a;      // the second cycle has the colours reversed
          if (w > n || bl > n) byes.push({ p: ps[(w > n ? bl : w) - 1].id, kind: 'rest' });
          else games.push({ w: ps[w - 1].id, b: ps[bl - 1].id, res: null });
        }
        T.rounds.push({ n: T.rounds.length + 1, games, byes });
      }
    }
    T.started = true;
    return T;
  };

  // A player who leaves a round robin loses all games not yet played by forfeit.
  HTM.rrWithdraw = function (T, pid) {
    let n = 0;
    for (const rd of T.rounds) for (const g of rd.games) {
      if (g.res) continue;
      if (g.w === pid) { g.res = '-+'; n++; } else if (g.b === pid) { g.res = '+-'; n++; }
    }
    return n;
  };

  // ---------------------------------------------------------------------------------------------- knockout
  HTM.koSeedOrder = function (size) {                            // 8 -> 1 8 4 5 2 7 3 6 (adjacent seeds meet in round 1)
    let a = [1];
    while (a.length < size) { const s = a.length * 2, b = []; for (const x of a) b.push(x, s + 1 - x); a = b; }
    return a;
  };
  HTM.koRoundName = function (size, r) {
    const left = size / Math.pow(2, r);
    return left === 2 ? 'Final' : left === 4 ? 'Semi-finals' : left === 8 ? 'Quarter-finals' : 'Round of ' + left;
  };

  HTM.createKnockout = function (T) {
    const ps = HTM.playersByNo(T), n = ps.length;
    if (n < 2) throw new Error('Enter at least two players.');
    let size = 2;
    while (size < n) size *= 2;
    const G = Math.max(1, T.opts.koGames || 1);
    const mk = (a, b) => ({ a, b, games: new Array(G).fill(null), tb: null, bye: false });
    const order = HTM.koSeedOrder(size);
    const first = [];
    for (let i = 0; i < size; i += 2) {
      const sa = order[i], sb = order[i + 1];
      const m = mk(sa <= n ? ps[sa - 1].id : null, sb <= n ? ps[sb - 1].id : null);
      m.sa = sa; m.sb = sb; m.bye = !m.a || !m.b;
      first.push(m);
    }
    const rounds = [first];
    for (let s = size / 2; s > 1; s /= 2) { const arr = []; for (let i = 0; i < s / 2; i++) arr.push(mk(null, null)); rounds.push(arr); }
    T.ko = { size, rounds };
    T.started = true;
    HTM.koAdvance(T);
    return T;
  };

  HTM.koScore = function (m) {                                   // scores in the match so far; game i: a has White when i is even
    let a = 0, b = 0, done = 0;
    m.games.forEach((res, i) => {
      if (!res) return;
      done++;
      const aw = i % 2 === 0;
      if (res === '1/2') { a += 0.5; b += 0.5; } else if (res === '1-0' || res === '+-') { if (aw) a++; else b++; } else if (res === '0-1' || res === '-+') { if (aw) b++; else a++; }
    });
    return { a, b, done, left: m.games.length - done };
  };
  HTM.koWinner = function (m) {                                  // 'a' | 'b' | null while undecided
    if (m.bye) return m.a ? 'a' : m.b ? 'b' : null;
    if (!m.a || !m.b) return null;
    const s = HTM.koScore(m);
    if (s.a > s.b + s.left) return 'a';
    if (s.b > s.a + s.left) return 'b';
    if (s.left === 0) return s.a > s.b ? 'a' : s.b > s.a ? 'b' : (m.tb === 'a' || m.tb === 'b' ? m.tb : null);
    return null;
  };
  HTM.koWinnerId = function (m) { const w = HTM.koWinner(m); return w === 'a' ? m.a : w === 'b' ? m.b : null; };

  HTM.koAdvance = function (T) {                                 // winners move to the next round; a changed slot clears that match
    const rounds = T.ko.rounds;
    for (let r = 1; r < rounds.length; r++) {
      rounds[r].forEach((m, j) => {
        const a = HTM.koWinnerId(rounds[r - 1][2 * j]), b = HTM.koWinnerId(rounds[r - 1][2 * j + 1]);
        if (m.a !== a || m.b !== b) { m.a = a; m.b = b; m.games = new Array(m.games.length).fill(null); m.tb = null; }
      });
    }
    return T;
  };

  HTM.koWithdraw = function (T, pid) {                           // the player loses the games not yet played in the open match by forfeit
    for (const rd of T.ko.rounds) for (const m of rd) {
      if ((m.a !== pid && m.b !== pid) || HTM.koWinner(m)) continue;
      m.games = m.games.map((res, i) => res || (m.a === pid ? (i % 2 === 0 ? '-+' : '+-') : (i % 2 === 0 ? '+-' : '-+')));
    }
    HTM.koAdvance(T);
  };

  HTM.koStandings = function (T) {
    const rounds = T.ko.rounds, last = rounds.length - 1;
    const info = new Map(T.players.map((p) => [p.id, { p, lastRound: -1, out: false, champion: false, won: 0, lost: 0 }]));
    rounds.forEach((rd, r) => rd.forEach((m) => {
      for (const id of [m.a, m.b]) if (id && info.has(id)) info.get(id).lastRound = Math.max(info.get(id).lastRound, r);
      const w = HTM.koWinner(m);
      if (m.a && m.b && w) {
        const win = info.get(w === 'a' ? m.a : m.b), lose = info.get(w === 'a' ? m.b : m.a);
        win.won++; lose.lost++; lose.out = true;
        if (r === last) win.champion = true;
      }
    }));
    const all = Array.from(info.values());
    const better = (x, y) => (x.champion ? 3 : x.out ? 1 : 2) - (y.champion ? 3 : y.out ? 1 : 2) || x.lastRound - y.lastRound;
    all.sort((x, y) => -better(x, y) || x.p.no - y.p.no);
    const out = [];
    for (let i = 0; i < all.length;) {
      let j = i + 1;
      while (j < all.length && !better(all[i], all[j]) && all[i].out === all[j].out && all[i].champion === all[j].champion) j++;
      const grp = all.slice(i, j), alive = !grp[0].out && !grp[0].champion;
      for (const x of grp) out.push({ p: x.p, rank: i + 1, label: alive ? '' : (grp.length > 1 ? (i + 1) + '-' + (i + grp.length) : String(i + 1)), champion: x.champion, out: x.out, alive, lastRound: x.lastRound, won: x.won, lost: x.lost });
      i = j;
    }
    return out;
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = HTM;
})(typeof globalThis !== 'undefined' ? globalThis : this);
