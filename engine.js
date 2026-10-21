// ChargeFlow engine: scheduling + power allocation + minute-step simulation.
// Pure functions, no DOM. Runs in the browser (window.CF) and in Node (tests).
(function (root) {
  const rng = s => () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };

  function makeScenario(seed, n = 20) {
    const r = rng(seed + 1), pick = a => a[Math.floor(r() * a.length)], ri = (a, b) => a + Math.floor(r() * (b - a + 1));
    return Array.from({ length: n }, (_, i) => {
      const arr = ri(0, 240), cap = pick([30, 40, 50, 60]), s = ri(15, 55), t = pick([80, 90, 100]);
      return { id: 'EV-' + String(i + 1).padStart(2, '0'), arr, dep: arr + ri(60, 360), cap, s, t, rate: pick([7.4, 11, 11, 22]) };
    });
  }

  // Input validation: returns a list of human-readable errors (empty = valid).
  function validate(v) {
    const e = [];
    if (!(v.cap > 0)) e.push('Battery capacity must be > 0 kWh');
    if (!(v.s >= 0 && v.s < 100)) e.push('Current charge must be 0–99 %');
    if (!(v.t > v.s && v.t <= 100)) e.push('Target charge must be above current and ≤ 100 %');
    if (!(v.rate > 0)) e.push('Max charging power must be > 0 kW');
    if (!(v.dep > v.arr)) e.push('Departure must be after arrival');
    return e;
  }

  const DEF = { points: 6, pmax: 22, base: 50, dropFrom: 240, dropTo: 360, dropFactor: 0.5, T: 720 };

  function run(list, mode, cfg) {
    cfg = Object.assign({}, DEF, cfg);
    const V = list.map(v => Object.assign({}, v, { E: v.cap * (v.t - v.s) / 100, rem: 0, got: 0, start: null, done: false }));
    V.forEach(v => v.rem = v.E);
    const busy = new Set(), series = [], snaps = [];
    let energy = 0, util = 0, peak = 0, violations = 0;
    const lim = v => Math.min(v.rate, cfg.pmax);
    for (let t = 0; t < cfg.T; t++) {
      const P = cfg.base * (t >= cfg.dropFrom && t < cfg.dropTo ? cfg.dropFactor : 1);
      V.forEach(v => { if (v.dep === t) busy.delete(v.id); });
      const present = V.filter(v => v.arr <= t && t < v.dep && !v.done);
      present.forEach(v => { if (v.rem <= 1e-9) { v.done = true; busy.delete(v.id); } });
      const slack = v => (v.dep - t) / 60 - v.rem / lim(v);
      // rank: feasible first; urgent (slack<=1h) by least slack; the rest shortest-job-first
      const key = v => { const sl = slack(v); return [sl < 0 ? 1 : 0, sl > 1 ? 1 : 0, sl > 1 ? v.rem / lim(v) : sl]; };
      const cmp = (a, b) => { const x = key(a), y = key(b); return x[0] - y[0] || x[1] - y[1] || x[2] - y[2]; };
      const rank = mode === 'fcfs' ? (a, b) => a.arr - b.arr : cmp;
      const queue = present.filter(v => !v.done && !busy.has(v.id)).sort(rank);
      while (busy.size < cfg.points && queue.length) { const v = queue.shift(); busy.add(v.id); if (v.start === null) v.start = t; }
      const charging = present.filter(v => !v.done && busy.has(v.id)).sort(rank);
      let left = P, tot = 0; const alloc = {}, why = {};
      for (const v of charging) {                          // greedy in rank order; every cap enforced
        const a = Math.max(0, Math.min(lim(v), left, v.rem * 60)); alloc[v.id] = a; left -= a;
        const sl = slack(v);
        why[v.id] = a < Math.min(lim(v), v.rem * 60) - 1e-9 ? `Reduced: station limit ${P} kW reached`
          : sl < 0 ? 'Target unreachable before departure; charging what is possible'
          : mode !== 'fcfs' && sl <= 1 ? `Urgent: slack ${sl.toFixed(1)} h, full rate`
          : a >= v.rate - 1e-9 ? 'At vehicle max rate' : 'At charging point limit';
      }
      charging.forEach(v => { const e = Math.min(alloc[v.id] / 60, v.rem); v.rem -= e; v.got += e; energy += e; tot += alloc[v.id]; });
      if (tot > P + 1e-6) violations++;
      peak = Math.max(peak, tot); util += charging.length / cfg.points; series.push({ t, kw: tot, limit: P });
      const qrank = {}; queue.forEach((v, i) => qrank[v.id] = i + 1);
      snaps.push(V.map(v => {
        let st, why2 = '';
        if (t < v.arr) st = 'Not arrived';
        else if (v.done) st = 'Completed';
        else if (t >= v.dep) st = 'Departed';
        else if (busy.has(v.id)) { const full = alloc[v.id] >= Math.min(lim(v), v.rem * 60) - 1e-9; st = full ? 'Charging' : 'Power-reduced'; why2 = why[v.id] || ''; }
        else { st = 'Waiting'; why2 = slack(v) < 0 ? 'Target unreachable before departure; ranked last' : `Queue position ${qrank[v.id]}`; }
        return { st, kw: alloc[v.id] || 0, soc: v.s + (v.E - v.rem) / v.cap * 100, why: why2 };
      }));
    }
    const n = V.length, wait = V.map(v => (v.start === null ? v.dep : v.start) - v.arr);
    return { vehicles: V, series, snaps, cfg, metrics: {
      done: V.filter(v => v.rem <= 1e-6).length / n * 100, wait: wait.reduce((a, b) => a + b, 0) / n,
      util: util / cfg.T * 100, energy, peak, served: V.filter(v => v.start !== null).length, violations } };
  }

  function benchmark(runs = 50, n = 20, cfg) {
    const m = { fcfs: 0, smart: 0, fw: 0, sw: 0 };
    for (let s = 0; s < runs; s++) {
      const L = makeScenario(s, n), a = run(L, 'fcfs', cfg).metrics, b = run(L, 'smart', cfg).metrics;
      m.fcfs += a.done / runs; m.smart += b.done / runs; m.fw += a.wait / runs; m.sw += b.wait / runs;
    }
    return m;
  }
  const api = { makeScenario, validate, run, benchmark, DEF };
  if (typeof module !== 'undefined') module.exports = api; else root.CF = api;
})(this);
