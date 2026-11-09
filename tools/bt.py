import sys, math
import numpy as np, pandas as pd

import os
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..") + os.sep
END = sys.argv[1] if len(sys.argv) > 1 else "2026-08-11"
OPT = dict(a.split("=") for a in sys.argv[2:])
INVEST = float(OPT.get("invest", 0.70)); NTIER = int(OPT.get("ntier", 5))
VT_TGT = float(OPT.get("vt", 0.20)); BAND = float(OPT.get("band", 0.03))
LAG = int(OPT.get("lag", 2)); NETTING = OPT.get("net", "1") == "1"
FEE = 0.0007; CASH_COST = 0.001

# ---------- data ----------
ASSET = OPT.get("asset", "upro")  # upro: SPY 신호/SPX 합성, tqqq: QQQ 신호/NDX 합성
XL = ROOT + "TQQQ-QLD-NDX-SPX_데이터_1985-2026.xlsx"
x = pd.read_excel(XL, sheet_name=0)
BASE_COL, IDX_COL = ("SPY 종가", "SPX 종가") if ASSET == "upro" else ("QQQ 종가", "NDX 종가")
d = x[["날짜", BASE_COL, IDX_COL, "DFF_Average_Pct"]].dropna(subset=["날짜"])
d.columns = ["date", "spy", "spx", "dff"]   # spy = 신호 기준 ETF, spx = 합성용 지수
d = d.set_index("date").sort_index()
d["dff"] = d["dff"].ffill()
if ASSET == "upro":
    u = pd.read_csv(ROOT + "upro_us_d_2.csv", parse_dates=["Date"]).set_index("Date")["Close"]
    ER = 0.0091
else:
    # 실제 TQQQ: '실제 주가' 시트(소수 4자리) + 그 이후는 '260812수정' 시트로 이어 붙임
    yf = pd.read_excel(XL, sheet_name="실제 주가").set_index("날짜")["TQQQ (Yahoo Finance)"].dropna()
    s0 = x.set_index("날짜")["TQQQ 종가"].dropna()
    tail = s0[s0.index > yf.index[-1]] * (yf.iloc[-1] / s0.loc[yf.index[-1]])
    u = pd.concat([yf, tail])
    ER = 0.0095
REAL0 = u.index[0]
d = d[d.index <= END]
miss = d.index[(d.index >= REAL0) & ~d.index.isin(u.index)]
if len(miss): print("WARN real price missing on", len(miss), "days:", list(miss[:5]))

# rate: daily DFF before 2010, yearly mean from 2010
rate = d["dff"].copy() / 100
yr = d.index.year
ym = rate.groupby(yr).transform("mean")
rate[yr >= 2010] = ym[yr >= 2010]

days = d.index.to_series().diff().dt.days.fillna(1).values
rspx = d["spx"].pct_change().fillna(0).values
r_prev = rate.shift(1).bfill().values
syn_r = 3 * rspx - (2 * r_prev + ER + 2 * 0.0061) * days / 360
real_r = u.reindex(d.index).ffill().pct_change().values
upr = np.where(d.index > REAL0, real_r, syn_r); upr[0] = 0
upro = np.cumprod(1 + upr)
# scale so real segment equals actual prices
k = u.loc[REAL0] / upro[d.index.get_loc(REAL0)]
upro = upro * k
d["upro"] = upro; d["upr"] = upr
spy = d["spy"].values; P = upro; N = len(d); dates = d.index
cash_r = (rate.values - CASH_COST)  # annual
if OPT.get("interest", "0") != "1": cash_r = np.zeros(N)  # 기본: 현금 이자 없음

# ---------- backtest ----------
start = 252 + LAG + 1
while dates[start] < pd.Timestamp("1986-10-01"): start += 1
cash = 10000.0; sh = 0; mode = None
cyc_tier = 0.0; tiers_used = 0
eq = np.full(N, np.nan); modes = np.empty(N, dtype=object)
switches = 0; trades = 0; fees = 0.0

def trade(qty, p):
    global cash, sh, trades, fees
    if qty == 0: return
    c = abs(qty) * p * FEE
    cash -= qty * p + c; sh += qty; trades += 1; fees += c

for t in range(start, N):
    cash *= 1 + cash_r[t - 1] * days[t] / 365
    p = P[t]; pp = P[t - 1]
    ret12 = spy[t - LAG] / spy[t - LAG - 252] - 1
    old = mode
    if mode is None: mode = "A" if ret12 < -BAND else "VT"
    elif mode == "VT" and ret12 < -BAND: mode = "A"
    elif mode == "A" and ret12 > BAND: mode = "VT"
    switched = old is not None and old != mode
    if switched: switches += 1
    E = cash + sh * p
    if mode == "VT":
        tiers_used = 0; cyc_tier = 0
        vol = np.std(upr[t - 20:t], ddof=1) * math.sqrt(252)
        w = min(1.0, VT_TGT / vol)
        tgt = math.floor(E * w / p)
        if tgt > sh:  # cash check
            tgt = min(tgt, sh + math.floor(cash / (p * (1 + FEE))))
        trade(tgt - sh, p)
    else:
        if switched:  # liquidate VT holdings, start fresh A cycle
            pend_sell = sh
            tiers_used = 0; cyc_tier = 0
        else:
            pend_sell = 0
        buy = 0; sell = 0
        if sh > 0 and not switched and p >= pp * 1.01:
            sell = sh
        elif p <= pp * 0.99 and tiers_used < NTIER:
            if tiers_used == 0 and (sh - pend_sell) == 0:
                Ec = cash + sh * p if not switched else cash + sh * p * (1 - FEE)
                cyc_tier = Ec * INVEST / NTIER
            buy = math.floor(cyc_tier / p)
            tiers_used += 1
        if switched:
            net = buy - pend_sell
            if NETTING: trade(net, p)
            else: trade(-pend_sell, p); trade(buy, p)
            if buy == 0 and tiers_used == 0: pass
        else:
            if sell: trade(-sell, p); tiers_used = 0
            if buy:
                buy = min(buy, math.floor(cash / (p * (1 + FEE))))
                trade(buy, p)
        if sh == 0 and not buy: tiers_used = 0
    eq[t] = cash + sh * p; modes[t] = mode

s = pd.Series(eq[start:], dates[start:]); m = pd.Series(modes[start:], dates[start:])

def stats(v):
    v = v.dropna(); yrs = (v.index[-1] - v.index[0]).days / 365.25
    cagr = (v.iloc[-1] / v.iloc[0]) ** (1 / yrs) - 1
    mdd = (v / v.cummax() - 1).min()
    return cagr, mdd

bu = pd.Series(P[start:], dates[start:]); bs = pd.Series(spy[start:], dates[start:])
print(f"기간 {s.index[0].date()} ~ {s.index[-1].date()}  invest={INVEST} ntier={NTIER} vt={VT_TGT} band={BAND} lag={LAG}")
print(f"최종자산 ${s.iloc[-1]:,.0f}  모드전환 {switches}회 (연 {switches/((s.index[-1]-s.index[0]).days/365.25):.2f})  A모드 비중 {(m=='A').mean():.1%}  거래 {trades}  수수료 ${fees:,.0f}")
segs = [("1986~ 전체", None, None), ("1986~1998", None, "1998-12-31"), ("1999~", "1999-01-01", None),
        ("2000~2015", "2000-01-01", "2015-12-31"), ("2009~ (실제UPRO)", "2009-06-25", None), ("2016~", "2016-01-01", None)]
print(f"\n{'구간':<16}{'전략':>18}{'UPRO':>18}{'SPY':>18}")
for name, a, b in segs:
    row = []
    for ser in (s, bu, bs):
        q = ser.loc[a:b]
        if a: q = pd.concat([ser.loc[:a].iloc[-2:-1], q]) if len(ser.loc[:a]) > 1 else q
        c, dd = stats(q); row.append(f"{c*100:6.1f}% /{dd*100:6.1f}%")
    print(f"{name:<16}" + "".join(f"{r:>18}" for r in row))

print("\n연도별: 전략 / 연중MDD / UPRO / SPY  (%)")
lose = 0
for y in range(s.index[0].year, s.index[-1].year + 1):
    def yret(ser):
        prev = ser[ser.index.year < y]; cur = ser[ser.index.year == y]
        base = prev.iloc[-1] if len(prev) else cur.iloc[0]
        return cur.iloc[-1] / base - 1, cur
    r, cur = yret(s); ru, _ = yret(bu); rs, _ = yret(bs)
    prev = s[s.index.year < y]
    path = pd.concat([prev.iloc[-1:], cur]) if len(prev) else cur
    ymdd = (path / path.cummax() - 1).min()
    lose += r < 0
    print(f"{y} {r*100:+5.0f} {ymdd*100:5.0f} {ru*100:+5.0f} {rs*100:+5.0f}")
print("손실연도", lose)

# top drawdowns
dd = s / s.cummax() - 1
out = []; i = 0; v = dd.values; idx = s.index
while i < len(v):
    if v[i] < 0:
        j = i
        while j < len(v) and v[j] < 0: j += 1
        seg = dd.iloc[i:j]; tr = seg.idxmin()
        out.append((seg.min(), idx[i - 1].date(), tr.date(), idx[j].date() if j < len(v) else None, m.loc[tr]))
        i = j
    else: i += 1
print("\n주요 낙폭")
for o in sorted(out)[:5]: print(f"{o[0]*100:6.1f}%  고점 {o[1]} → 저점 {o[2]}  회복 {o[3]}  모드 {o[4]}")
print(f"\n평균 현금이자율 {np.mean(cash_r[start:])*100:.2f}%")
