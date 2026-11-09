const T = __dirname + "/";
const { prepData, runBacktest } = require(T + "engine.js");
const asset = process.argv[2] || "tqqq";
const X = prepData(require(T + `data_${asset}.json`));
const BASE = { lag: 2, band: 0.03, vt: 0.20, invest: 0.70, ntier: 5, buy: 0.01, sell: 0.01, interest: 0, start: "19861001", end: "20991231" };
function seg(R, a, b) {
  let k0 = 0, k1 = R.eq.length - 1;
  while (X.ds[R.start + k0] < a) k0++; while (X.ds[R.start + k1] > b) k1--;
  const kb = k0 ? k0 - 1 : 0, base = R.eq[kb], yrs = (X.t[R.start + k1] - X.t[R.start + kb]) / (365.25 * 864e5);
  let pk = base, m = 0; for (let k = k0; k <= k1; k++) { pk = Math.max(pk, R.eq[k]); m = Math.min(m, R.eq[k] / pk - 1); }
  return { c: Math.pow(R.eq[k1] / base, 1 / yrs) - 1, m };
}
function run(p) {
  const o = { ...BASE, ...p }, R = runBacktest(X, o);
  const all = seg(R, "0", "9"), a = seg(R, "0", "19981231"), b = seg(R, "19990101", "9"), c = seg(R, "20100211", "9");
  return { o, all, a, b, c, eff: all.c / -all.m, sw: R.switches };
}
const f = v => (v * 100).toFixed(1).padStart(5);
const line = r => `${f(r.all.c)} /${f(r.all.m)}  eff ${r.eff.toFixed(2)} | 86-98 ${f(r.a.c)} /${f(r.a.m)} | 99- ${f(r.b.c)} /${f(r.b.m)} | 2010- ${f(r.c.c)} /${f(r.c.m)} | sw ${r.sw}`;
const mode = process.argv[3] || "oat";
if (mode === "oat") {
  console.log("BASE              ", line(run({})));
  const grid = { vt: [0.10, 0.125, 0.15, 0.175, 0.20, 0.25, 0.30], band: [0, 0.01, 0.02, 0.03, 0.05, 0.07, 0.10], lag: [1, 2],
    invest: [0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0], ntier: [1, 2, 3, 5, 7, 10], buy: [0.005, 0.01, 0.015, 0.02, 0.03], sell: [0.005, 0.01, 0.015, 0.02, 0.03] };
  for (const k in grid) { console.log("--", k); for (const v of grid[k]) console.log(`${k}=${v}`.padEnd(18), line(run({ [k]: v }))); }
} else if (mode === "grid") {
  const out = [];
  for (const vt of [0.10, 0.125, 0.15, 0.175, 0.20, 0.25]) for (const band of [0.01, 0.02, 0.03, 0.05, 0.07])
  for (const invest of [0.5, 0.6, 0.7, 0.8, 0.9, 1.0]) for (const ntier of [3, 5, 7, 10])
  for (const bs of [[0.01, 0.01], [0.015, 0.015], [0.01, 0.015], [0.015, 0.01], [0.02, 0.02]]) out.push(run({ vt, band, invest, ntier, buy: bs[0], sell: bs[1] }));
  console.log("runs", out.length);
  const key = r => `vt${r.o.vt} band${r.o.band} inv${r.o.invest} n${r.o.ntier} b${r.o.buy}/s${r.o.sell}`.padEnd(42);
  out.sort((x, y) => y.eff - x.eff); console.log("== 효율 top 15"); out.slice(0, 15).forEach(r => console.log(key(r), line(r)));
  console.log("== MDD ≥ −35% 중 CAGR top 10"); out.filter(r => r.all.m >= -0.35).sort((x, y) => y.all.c - x.all.c).slice(0, 10).forEach(r => console.log(key(r), line(r)));
  console.log("== MDD ≥ −40% 중 CAGR top 10"); out.filter(r => r.all.m >= -0.40).sort((x, y) => y.all.c - x.all.c).slice(0, 10).forEach(r => console.log(key(r), line(r)));
  // 분할표본: 86-98 효율 상위가 99- 에서도 좋은가
  const effA = r => r.a.c / -r.a.m, effB = r => r.b.c / -r.b.m;
  const rank = (arr, fn) => { const s = [...arr].sort((x, y) => fn(y) - fn(x)); const m = new Map(); s.forEach((r, i) => m.set(r, i)); return m; };
  const rA = rank(out, effA), rB = rank(out, effB); let sx = 0, n = out.length;
  for (const r of out) sx += (rA.get(r) - rB.get(r)) ** 2;
  console.log("86-98 vs 99- 효율 순위 스피어만", (1 - 6 * sx / (n * (n * n - 1))).toFixed(2));
  console.log("== 86-98 효율 top 5 → 99- 성과"); [...out].sort((x, y) => effA(y) - effA(x)).slice(0, 5).forEach(r => console.log(key(r), line(r)));
}
