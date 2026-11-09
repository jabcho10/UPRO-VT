// UPRO 모드 변경 전략 백테스트 엔진 (bt.py와 동일 로직)
function prepData(D) {
  const n = D.d.length, t = new Array(n), days = new Float64Array(n), r = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const s = D.d[i];
    t[i] = Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8));
    days[i] = i ? (t[i] - t[i - 1]) / 864e5 : 1;
    r[i] = i ? D.u[i] / D.u[i - 1] - 1 : 0;
  }
  return { n, t, days, r, P: D.u, S: D.s, C: D.c, ds: D.d };
}

function runBacktest(X, o) {
  const FEE = 0.0007, BUY = 1 - (o.buy ?? 0.01), SELL = 1 + (o.sell ?? 0.01), lag = o.lag, inv = o.invest, NT = o.ntier, vt = o.vt, band = o.band;
  let start = 252 + lag + 1, end = X.n - 1;
  while (start < X.n && X.ds[start] < o.start) start++;
  while (end > start && X.ds[end] > o.end) end--;
  let cash = 10000, sh = 0, mode = null, tier = 0, used = 0, switches = 0, trades = 0, fees = 0;
  const N = end - start + 1, eq = new Float64Array(N), modeA = new Uint8Array(N);
  const trade = (q, p) => { if (!q) return; const c = Math.abs(q) * p * FEE; cash -= q * p + c; sh += q; trades++; fees += c; };
  for (let t = start; t <= end; t++) {
    if (o.interest) cash *= 1 + (X.C[t - 1] / 100) * X.days[t] / 365;
    const p = X.P[t], pp = X.P[t - 1];
    // sig: 1 = A 모드로, -1 = VT 모드로, 0 = 유지.  o.sig 가 있으면 외부 신호 사용
    let sig;
    if (o.sig) sig = o.sig[t];
    else { const ret12 = X.S[t - lag] / X.S[t - lag - 252] - 1; sig = ret12 < -band ? 1 : ret12 > band ? -1 : 0; }
    const old = mode;
    if (mode === null) mode = sig === 1 ? "A" : "VT";
    else if (mode === "VT" && sig === 1) mode = "A";
    else if (mode === "A" && sig === -1) mode = "VT";
    const switched = old !== null && old !== mode;
    if (switched) switches++;
    const E = cash + sh * p;
    if (mode === "VT") {
      used = 0; tier = 0;
      let m = 0; for (let k = t - 20; k < t; k++) m += X.r[k]; m /= 20;
      let v = 0; for (let k = t - 20; k < t; k++) v += (X.r[k] - m) ** 2;
      const vol = Math.sqrt(v / 19) * Math.sqrt(252);
      const w = Math.min(1, vt / vol);
      let tgt = Math.floor(E * w / p);
      if (tgt > sh) tgt = Math.min(tgt, sh + Math.floor(cash / (p * (1 + FEE))));
      trade(tgt - sh, p);
    } else {
      let pend = 0;
      if (switched) { pend = sh; used = 0; tier = 0; }
      let buy = 0, sell = 0;
      if (sh > 0 && !switched && p >= pp * SELL) sell = sh;
      else if (p <= pp * BUY && used < NT) {
        if (used === 0 && sh - pend === 0) {
          const Ec = switched ? cash + sh * p * (1 - FEE) : cash + sh * p;
          tier = Ec * inv / NT;
        }
        buy = Math.floor(tier / p); used++;
      }
      if (switched) trade(buy - pend, p);
      else {
        if (sell) { trade(-sell, p); used = 0; }
        if (buy) { buy = Math.min(buy, Math.floor(cash / (p * (1 + FEE)))); trade(buy, p); }
      }
      if (sh === 0 && !buy) used = 0;
    }
    eq[t - start] = cash + sh * p; modeA[t - start] = mode === "A" ? 1 : 0;
  }
  return { start, end, eq, modeA, switches, trades, fees };
}

function cagrMdd(X, vals, i0, i1, base) {
  // vals indexed relative; base = value before window (or vals[i0])
  const b = base ?? vals[i0];
  const yrs = (X.t[i1] - X.t[i0 - (base != null ? 1 : 0)]) / (365.25 * 864e5);
  let peak = b, mdd = 0;
  for (let i = i0; i <= i1; i++) { const v = vals[i]; if (v > peak) peak = v; const dd = v / peak - 1; if (dd < mdd) mdd = dd; }
  return { cagr: Math.pow(vals[i1] / b, 1 / yrs) - 1, mdd };
}

if (typeof module !== "undefined") module.exports = { prepData, runBacktest, cagrMdd };
