const assert = require('assert'), CF = require('./engine.js');
let n = 0; const ok = (c, m) => { assert(c, m); n++; console.log('PASS', m); };
for (const mode of ['fcfs', 'smart']) {
  let bad = 0, over = 0;
  for (let s = 0; s < 50; s++) { const r = CF.run(CF.makeScenario(s), mode); bad += r.metrics.violations; over += r.series.filter(p => p.kw > p.limit + 1e-6).length;
    r.vehicles.forEach(v => assert(v.got <= v.E + 1e-6, 'energy over-delivered')); }
  ok(bad === 0 && over === 0, `${mode}: station limit never exceeded (50 scenarios x 720 min)`);
}
ok(CF.validate({ cap: 50, s: 80, t: 60, rate: 7, arr: 0, dep: 60 }).length > 0, 'rejects target below current charge');
ok(CF.validate({ cap: 50, s: 20, t: 80, rate: 7, arr: 100, dep: 50 }).length > 0, 'rejects departure before arrival');
ok(CF.validate({ cap: 50, s: 20, t: 80, rate: 7, arr: 0, dep: 120 }).length === 0, 'accepts valid request');
const b = CF.benchmark(50);
console.log(`benchmark: FCFS ${b.fcfs.toFixed(1)}% vs ChargeFlow ${b.smart.toFixed(1)}% on time; wait ${b.fw.toFixed(1)} vs ${b.sw.toFixed(1)} min`);
ok(b.smart > b.fcfs, 'ChargeFlow completes more vehicles on time than FCFS (mean of 50 scenarios)');
console.log(n + ' tests passed');
