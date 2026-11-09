const { prepData, runBacktest } = require(__dirname + "/engine.js");
const asset = process.argv[2] || "tqqq";
const X = prepData(require(__dirname + `/data_${asset}.json`));
const stat = R => { const e = R.eq, yrs = (X.t[R.end] - X.t[R.start]) / (365.25 * 864e5); let pk = 0, m = 0;
  for (const v of e) { pk = Math.max(pk, v); m = Math.min(m, v / pk - 1); } const c = Math.pow(e[e.length - 1] / e[0], 1 / yrs) - 1; return { c, m, eff: c / -m }; };
const go = (p, start, end = "20991231") => stat(runBacktest(X, { lag: 2, interest: 0, start, end, ...p }));
const f = s => `${(s.c * 100).toFixed(1).padStart(5)} /${(s.m * 100).toFixed(1).padStart(6)} (${s.eff.toFixed(2)})`;
const out = [];
for (const vt of [0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.5]) for (const band of [0.01, 0.03, 0.05])
for (const invest of [0.5, 0.7, 0.9, 1.0]) for (const ntier of [3, 5, 7, 10])
for (const [buy, sell] of [[0.01, 0.01], [0.015, 0.015], [0.02, 0.02], [0.01, 0.02], [0.02, 0.01], [0.03, 0.03]]) {
  const p = { vt, band, invest, ntier, buy, sell }; out.push({ p, r: go(p, "20160101") });
}
const key = p => `vt${p.vt} band${p.band} inv${p.invest} n${p.ntier} ±${p.buy * 100}/${p.sell * 100}`.padEnd(38);
const show = (title, arr) => { console.log("\n== " + title + "\n" + "설정".padEnd(36) + "2016– (최적화 구간)     |  1986–2015 (검증)       2000–2015 (검증)");
  arr.forEach(o => console.log(key(o.p), f(o.r), "|", f(go(o.p, "19861001", "20151231")), " ", f(go(o.p, "20000101", "20151231")))); };
console.log("runs", out.length);
const ref = [{ p: { vt: 0.2, band: 0.03, invest: 0.7, ntier: 5, buy: 0.01, sell: 0.01 }, n: "현재" }, { p: { vt: 0.2, band: 0.03, invest: 0.7, ntier: 7, buy: 0.02, sell: 0.02 }, n: "전체기간 추천" }];
show("기준", ref.map(o => ({ p: o.p, r: go(o.p, "20160101") })));
show("2016– 효율 top 10", [...out].sort((a, b) => b.r.eff - a.r.eff).slice(0, 10));
show("2016– CAGR top 5", [...out].sort((a, b) => b.r.c - a.r.c).slice(0, 5));
show("2016– MDD ≥ −30% 중 CAGR top 5", out.filter(o => o.r.m >= -0.30).sort((a, b) => b.r.c - a.r.c).slice(0, 5));
