"""데이터를 다시 뽑아 ../index.html (UPRO) 과 ../tqqq.html (TQQQ) 을 생성합니다.  사용: python tools/build.py"""
import os, subprocess, sys
H = os.path.dirname(os.path.abspath(__file__))
r = lambda f: open(os.path.join(H, f), encoding="utf-8").read()

PAGES = {
    "upro": dict(file="index.html", LEV="UPRO", BASE="SPY", IDX="S&amp;P500",
                 SYN="3 × SPX 일간수익률 − 2 × 금리 − 보수 0.91% − 2 × 스왑스프레드 0.61%, 연율",
                 NTIER=5, BUY=1, SELL=1, NOTE="문서 최종 설정 (5분할 · −1%/+1%)",
                 DESC="UPRO 모드 변경 전략(VT/A 모드) 백테스트. SPY 12개월 수익률로 모드를 바꿉니다."),
    "tqqq": dict(file="tqqq.html", LEV="TQQQ", BASE="QQQ", IDX="Nasdaq-100",
                 SYN="3 × NDX 일간수익률 − 2 × 금리 − 보수 0.95% − 2 × 스왑스프레드 0.61%, 연율",
                 NTIER=7, BUY=2, SELL=2, NOTE="TQQQ 전체 기간(1986–) 탐색 추천 (7분할 · −2%/+2%)",
                 DESC="TQQQ 모드 변경 전략(VT/A 모드) 백테스트. QQQ 12개월 수익률로 모드를 바꿉니다."),
}
HEAD = """<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="description" content="{DESC}">
<style>:root{{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}}body{{margin:0}}img{{max-width:100%}}[hidden]{{display:none!important}}</style>
"""
for key, c in PAGES.items():
    subprocess.run([sys.executable, "export.py", key], cwd=H, check=True)
    dj = os.path.join(H, f"data_{key}.json"); data = open(dj, encoding="utf-8").read(); os.remove(dj)
    import json; real0 = json.loads(data)["real0"]
    cur = ' aria-current="page"'
    nav = "".join('<a href="%s"%s>%s</a>' % (p["file"], cur if k == key else "", p["LEV"]) for k, p in PAGES.items())
    note = (f"{c['LEV']} {real0[:4]}-{real0[4:6]}-{real0[6:]} 이후는 실제 종가, 이전은 합성 가격({c['SYN']}). "
            f"합성 구간은 지수 배당이 빠져 실제보다 낮게 나옵니다. {c['BASE']}는 배당 제외 가격.")
    body = r("template.html")
    for k, v in {"{{LEV}}": c["LEV"], "{{BASE}}": c["BASE"], "{{IDX}}": c["IDX"], "{{NAV}}": nav, "{{SYN_NOTE}}": note,
                 "{{REAL0}}": real0, "{{DEF_NTIER}}": str(c["NTIER"]), "{{DEF_BUY}}": str(c["BUY"]), "{{DEF_SELL}}": str(c["SELL"]), "{{DEF_NOTE}}": c["NOTE"], "{{REAL0_Y}}": real0[:4]}.items():
        body = body.replace(k, v)
    body = body.replace("/*DATA*/", data).replace("/*ENGINE*/", r("engine.js"))
    i = body.index('<div class="wrap">')
    html = HEAD.format(DESC=c["DESC"]) + body[:i] + "</head>\n<body>\n" + body[i:] + "\n</body>\n</html>\n"
    open(os.path.join(H, "..", c["file"]), "w", encoding="utf-8").write(html)
    print(c["file"], len(html), "bytes")
