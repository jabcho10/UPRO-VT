const T = __dirname + "/";
const { prepData, runBacktest } = require(T + "engine.js");
for (const [asset, P] of [["tqqq", { vt: 0.2, band: 0.03, invest: 0.7, ntier: 7 }], ["tqqq", { vt: 0.2, band: 0.03, invest: 0.7, ntier: 5 }], ["upro", { vt: 0.2, band: 0.03, invest: 0.7, ntier: 5 }]]) {
  const X = prepData(require(T + `data_${asset}.json`));
  const seg = (R, a, b) => { let k0 = 0, k1 = R.eq.length - 1; while (X.ds[R.start + k0] < a) k0++; while (X.ds[R.start + k1] > b) k1--;
    const kb = k0 ? k0 - 1 : 0, base = R.eq[kb], yrs = (X.t[R.start + k1] - X.t[R.start + kb]) / (365.25 * 864e5);
    let pk = base, m = 0; for (let k = k0; k <= k1; k++) { pk = Math.max(pk, R.eq[k]); m = Math.min(m, R.eq[k] / pk - 1); } return (Math.pow(R.eq[k1] / base, 1 / yrs) - 1) / -m; };
  const th = [0.005, 0.01, 0.015, 0.02, 0.025, 0.03];
  for (const [nm, a, b] of [["전체", "0", "9"], ["86-98", "0", "19981231"], ["99-", "19990101", "9"]]) {
    console.log(`\n${asset} ${JSON.stringify(P)} 효율(CAGR/|MDD|) ${nm}   행=매수 하락폭, 열=매도 상승폭`);
    console.log("buy\sell " + th.map(v => (v * 100 + "%").padStart(6)).join(""));
    for (const buy of th) console.log(((buy * 100) + "%").padEnd(9) + th.map(sell => {
      const R = runBacktest(X, { lag: 2, interest: 0, start: "19861001", end: "20991231", ...P, buy, sell }); return seg(R, a, b).toFixed(2).padStart(6); }).join(""));
  }
}
