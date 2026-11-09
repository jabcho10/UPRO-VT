import sys, json, io, contextlib
ASSET_ARG = sys.argv[1] if len(sys.argv) > 1 else "upro"
sys.argv = ["bt.py", "2099-12-31", "interest=1", "asset=" + ASSET_ARG]
with contextlib.redirect_stdout(io.StringIO()): exec(open("bt.py", encoding="utf-8").read())
out = {
 "d": [x.strftime("%Y%m%d") for x in dates],
 "u": [float(f"{v:.9g}") for v in P],
 "s": [float(f"{v:.7g}") for v in spy],
 "c": [round(float(v) * 100, 4) for v in (rate.values - CASH_COST)],
 "real0": REAL0.strftime("%Y%m%d"),
}
json.dump(out, open(f"data_{ASSET_ARG}.json", "w"), separators=(",", ":"))
print(len(out["d"]), out["d"][0], out["d"][-1])
