"""Yahoo Finance + Google Finance 시세를 받아 data/prices.json 으로 저장합니다.

GitHub Actions(.github/workflows/prices.yml)에서 주기적으로 실행됩니다. 표준 라이브러리만 사용.
- Yahoo: 일봉 2년치 (close = 실제 종가, adj = 배당·분할 조정 종가) + 현재가
- Google: 현재가, 전일 종가, 최근 며칠의 일별 종가 → Yahoo 종가와 날짜별 대조
"""
import datetime as dt
import json
import os
import re
import sys
import time
import urllib.request

SYMBOLS = {"UPRO": "NYSEARCA", "TQQQ": "NASDAQ", "SPY": "NYSEARCA", "QQQ": "NASDAQ"}
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "prices.json")
TOL = 0.005  # Yahoo·Google 종가 차이 허용 0.5%


def get(url, tries=3):
    last = None
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "en-US,en;q=0.9"})
            with urllib.request.urlopen(req, timeout=30) as r:
                return r.read().decode("utf-8", "replace")
        except Exception as e:  # noqa: BLE001
            last = e
            time.sleep(3 * (i + 1))
    raise last


def yahoo(sym):
    for host in ("query1", "query2"):
        try:
            j = json.loads(get(f"https://{host}.finance.yahoo.com/v8/finance/chart/{sym}?range=2y&interval=1d&includeAdjustedClose=true"))
            res = j["chart"]["result"][0]
            break
        except Exception as e:  # noqa: BLE001
            err = e
    else:
        raise err
    m = res["meta"]; off = m.get("gmtoffset", -18000)
    q = res["indicators"]["quote"][0]; adj = res["indicators"]["adjclose"][0]["adjclose"]
    dates, close, adjc = [], [], []
    for ts, c, a in zip(res["timestamp"], q["close"], adj):
        if c is None or a is None:
            continue
        d = dt.datetime.fromtimestamp(ts + off, dt.timezone.utc).strftime("%Y-%m-%d")
        if dates and dates[-1] == d:
            dates.pop(); close.pop(); adjc.pop()
        dates.append(d); close.append(round(c, 4)); adjc.append(round(a, 6))
    # 마지막 봉이 장중(미확정)인지: 정규장 종료 전이면 미확정
    reg = m.get("currentTradingPeriod", {}).get("regular", {})
    now = time.time()
    today_et = dt.datetime.fromtimestamp(now + off, dt.timezone.utc).strftime("%Y-%m-%d")
    final = not (dates and dates[-1] == today_et and reg.get("start", 0) <= now < reg.get("end", 0) + 600)
    return {
        "dates": dates, "close": close, "adj": adjc, "lastFinal": final,
        "price": m.get("regularMarketPrice"),
        "priceTime": dt.datetime.fromtimestamp(m.get("regularMarketTime", 0), dt.timezone.utc).isoformat(),
    }


def google(sym, exch):
    h = get(f"https://www.google.com/finance/quote/{sym}:{exch}?hl=en")
    m = re.search(r'\["%s","%s"\],"[^"]*",\d+,"[A-Z]+",\[([-\d.]+),[^\]]*\],null,([-\d.]+),"[^"]*","[^"]*","[^"]*",\[(\d+)\]' % (sym, exch), h)
    if not m:
        raise ValueError("Google 페이지에서 시세를 찾지 못함 (페이지 구조 변경 가능)")
    price, prev, ts = float(m.group(1)), float(m.group(2)), int(m.group(3))
    # 일봉 종가: [[YYYY,M,D,16,null,null,null,[off]],[close,...]
    closes = {}
    for y, mo, d, c in re.findall(r"\[\[(\d{4}),(\d{1,2}),(\d{1,2}),16,null,null,null,\[-?\d+\]\],\[([-\d.]+),", h):
        closes[f"{int(y):04d}-{int(mo):02d}-{int(d):02d}"] = float(c)
    return {"price": price, "prevClose": prev, "time": dt.datetime.fromtimestamp(ts, dt.timezone.utc).isoformat(),
            "closes": dict(sorted(closes.items()))}


def main():
    try:
        old = json.load(open(OUT, encoding="utf-8"))
    except Exception:  # noqa: BLE001
        old = {"symbols": {}}
    out = {"updated": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"), "symbols": {}}
    errors = []
    for sym, exch in SYMBOLS.items():
        rec = {"exchange": exch}
        try:
            rec["yahoo"] = yahoo(sym)
        except Exception as e:  # noqa: BLE001
            errors.append(f"{sym} yahoo: {e}")
            rec["yahoo"] = old.get("symbols", {}).get(sym, {}).get("yahoo")  # 실패하면 이전 값 유지
            rec["yahooError"] = str(e)
        try:
            rec["google"] = google(sym, exch)
        except Exception as e:  # noqa: BLE001
            errors.append(f"{sym} google: {e}")
            rec["google"] = None
            rec["googleError"] = str(e)
        # 날짜별 대조 (Yahoo 확정 종가 vs Google 일별 종가)
        chk = []
        y, g = rec.get("yahoo"), rec.get("google")
        if y and g:
            yc = dict(zip(y["dates"], y["close"]))
            if not y.get("lastFinal"):
                yc.pop(y["dates"][-1], None)
            for d, gc in g["closes"].items():
                if d in yc:
                    diff = gc / yc[d] - 1
                    chk.append({"date": d, "yahoo": yc[d], "google": gc, "diff": round(diff, 6), "ok": abs(diff) <= TOL})
        rec["check"] = chk
        out["symbols"][sym] = rec
        time.sleep(1)
    out["errors"] = errors
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    for sym, r in out["symbols"].items():
        y = r.get("yahoo") or {}
        bad = [c for c in r["check"] if not c["ok"]]
        print(f"{sym}: yahoo {y.get('dates', ['-'])[-1]} {y.get('close', ['-'])[-1]} final={y.get('lastFinal')} | "
              f"google {r['google'] and r['google']['price']} | 대조 {len(r['check'])}일, 불일치 {len(bad)}")
    if errors:
        print("오류:", *errors, sep="\n  ")
    # Yahoo 가 전부 실패하면 실패 처리 (Google 은 보조)
    if all(not r.get("yahoo") for r in out["symbols"].values()):
        sys.exit(1)


if __name__ == "__main__":
    main()
