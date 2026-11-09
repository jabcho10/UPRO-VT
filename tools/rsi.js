// 주간 RSI 꼭지 모드 전환 테스트: RSI ≥ hi → A 모드, RSI ≤ lo → VT 모드
const { prepData, runBacktest } = require(__dirname + "/engine.js");
const X = prepData(require(__dirname + "/data_tqqq.json"));
const wk = new Int32Array(X.n);  // 주 번호 (월요일 기준)
for (let i = 0; i < X.n; i++) { const d = new Date(X.t[i]); wk[i] = Math.floor((X.t[i] / 864e5 + 3) / 7); }  // 1970-01-01=목 → +3 은 월요일 시작
function weeklyRSI(price, N = 14) {
  // 완성된 주의 종가로 Wilder RSI. 일별 배열: 그날 이전에 끝난 마지막 주의 RSI
  const closes = [], lastIdx = [];
  for (let i = 0; i < X.n; i++) { if (i === X.n - 1 || wk[i + 1] !== wk[i]) { closes.push(price[i]); lastIdx.push(i); } }
  const rsiW = new Float64Array(closes.length).fill(NaN); let ag = 0, al = 0;
  for (let k = 1; k < closes.length; k++) {
    const ch = closes[k] - closes[k - 1], g = Math.max(ch, 0), l = Math.max(-ch, 0);
    if (k <= N) { ag += g / N; al += l / N; if (k === N) rsiW[k] = al === 0 ? 100 : 100 - 100 / (1 + ag / al); }
    else { ag = (ag * (N - 1) + g) / N; al = (al * (N - 1) + l) / N; rsiW[k] = al === 0 ? 100 : 100 - 100 / (1 + ag / al); }
  }
  const out = new Float64Array(X.n).fill(NaN); let k = -1;
  for (let i = 0; i < X.n; i++) { while (k + 1 < lastIdx.length && lastIdx[k + 1] < i) k++; if (k >= 0) out[i] = rsiW[k]; }
  return out;
}
const rsiT = weeklyRSI(X.P), rsiQ = weeklyRSI(X.S);
function ret12(t, lag = 2) { return X.S[t - lag] / X.S[t - lag - 252] - 1; }
function mkSig(kind, hi, lo, rsi) {
  const s = new Int8Array(X.n);
  for (let t = 300; t < X.n; t++) {
    const r = rsi[t], m = ret12(t);
    if (kind === "rsi") s[t] = r >= hi ? 1 : r <= lo ? -1 : 0;
    else if (kind === "combo") s[t] = (r >= hi || m < -0.03) ? 1 : (r <= lo && m > 0.03) ? -1 : 0;  // 꼭지 or 약세장 → A, 둘 다 풀리면 VT
  }
  return s;
}
const seg = (R, a, b) => { let k0 = 0, k1 = R.eq.length - 1; while (X.ds[R.start + k0] < a) k0++; while (X.ds[R.start + k1] > b) k1--;
  const kb = k0 ? k0 - 1 : 0, base = R.eq[kb], yrs = (X.t[R.start + k1] - X.t[R.start + kb]) / (365.25 * 864e5);
  let pk = base, m = 0; for (let k = k0; k <= k1; k++) { pk = Math.max(pk, R.eq[k]); m = Math.min(m, R.eq[k] / pk - 1); } return { c: Math.pow(R.eq[k1] / base, 1 / yrs) - 1, m }; };
const f = s => `${(s.c * 100).toFixed(1).padStart(5)} /${(s.m * 100).toFixed(1).padStart(6)}`;
const A_SETS = { "5분할±1": { ntier: 5, buy: 0.01, sell: 0.01 }, "7분할±2": { ntier: 7, buy: 0.02, sell: 0.02 } };
console.log("규칙".padEnd(30) + "A설정     전체(1986–)       eff  | 1986–98          1999–            2010–            2016–          | A비중 전환/년");
function row(name, sig, aset) {
  const R = runBacktest(X, { lag: 2, band: 0.03, vt: 0.2, invest: 0.7, interest: 0, start: "19861001", end: "20991231", ...A_SETS[aset], sig });
  const all = seg(R, "0", "9"); let a = 0; for (const v of R.modeA) a += v;
  const yrs = (X.t[R.end] - X.t[R.start]) / (365.25 * 864e5);
  console.log(name.padEnd(30) + aset.padEnd(9) + f(all) + `  ${(all.c / -all.m).toFixed(2)} | ` + [["0", "19981231"], ["19990101", "9"], ["20100211", "9"], ["20160101", "9"]].map(([x, y]) => f(seg(R, x, y))).join("  ") +
    ` | ${(a / R.eq.length * 100).toFixed(0).padStart(3)}%  ${(R.switches / yrs).toFixed(1)}`);
}
for (const aset of Object.keys(A_SETS)) {
  row("기존: QQQ 12개월 ±3%", null, aset);
  for (const [hi, lo] of [[70, 50], [75, 50], [80, 60], [70, 40], [80, 50], [85, 60]]) row(`TQQQ 주간RSI ≥${hi} / ≤${lo}`, mkSig("rsi", hi, lo, rsiT), aset);
  for (const [hi, lo] of [[70, 50], [75, 50]]) row(`QQQ 주간RSI ≥${hi} / ≤${lo}`, mkSig("rsi", hi, lo, rsiQ), aset);
  for (const [hi, lo] of [[70, 50], [80, 60]]) row(`조합: RSI≥${hi} or 12m<−3%`, mkSig("combo", hi, lo, rsiT), aset);
  console.log("");
}
// RSI 분포 참고
const w = []; for (let i = 300; i < X.n; i++) if (wk[i] !== wk[i - 1]) w.push(rsiT[i]);
console.log("TQQQ 주간 RSI ≥70 인 주 비율", (w.filter(v => v >= 70).length / w.length * 100).toFixed(1) + "%", " ≤50:", (w.filter(v => v <= 50).length / w.length * 100).toFixed(1) + "%");
if (process.argv[2] === "dd") {
  for (const [nm, sig] of [["RSI70/50", mkSig("rsi", 70, 50, rsiT)], ["combo80/60", mkSig("combo", 80, 60, rsiT)]]) {
    const R = runBacktest(X, { lag: 2, band: 0.03, vt: 0.2, invest: 0.7, interest: 0, start: "19861001", end: "20991231", ntier: 7, buy: 0.02, sell: 0.02, sig });
    const e = R.eq; let pk = 0, pki = 0, eps = [], cur = null;
    for (let k = 0; k < e.length; k++) { if (e[k] >= pk) { if (cur) eps.push(cur), cur = null; pk = e[k]; pki = k; } else { const d = e[k] / pk - 1; if (!cur || d < cur.d) cur = { d, pk: pki, tr: k }; } }
    if (cur) eps.push(cur);
    eps.sort((a, b) => a.d - b.d); console.log(nm);
    for (const x of eps.slice(0, 4)) { let a = 0; for (let k = x.pk; k <= x.tr; k++) a += R.modeA[k];
      console.log(`  ${(x.d * 100).toFixed(1)}%  ${X.ds[R.start + x.pk]} → ${X.ds[R.start + x.tr]}  하락 중 A 모드 ${(a / (x.tr - x.pk + 1) * 100).toFixed(0)}%`); }
  }
}
