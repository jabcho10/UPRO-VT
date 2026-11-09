# UPRO / TQQQ 모드 변경 전략 백테스트

- UPRO: https://jabcho10.github.io/UPRO-VT/
- TQQQ: https://jabcho10.github.io/UPRO-VT/tqqq.html
- 오늘의 주문: https://jabcho10.github.io/UPRO-VT/order.html

장기 추세(SPY/QQQ 12개월 수익률)에 따라 변동성 타게팅(VT 모드)과 LOC 분할매매(A 모드)를 오가는 전략을 1986년부터 백테스트합니다. 페이지에서 조건을 바꾸면 브라우저에서 바로 다시 계산합니다.

## 시세 자동 업데이트

GitHub Actions(`.github/workflows/prices.yml`)가 미국 장 전·장중·장 마감 뒤에 `tools/fetch_prices.py`를 실행해
Yahoo Finance 일봉(2년)과 Google Finance 시세를 받아 `data/prices.json`에 저장합니다. 두 출처의 종가를 날짜별로 대조하고,
주문 페이지와 백테스트 페이지가 이 파일을 읽습니다. Actions 탭에서 "시세 업데이트"를 수동 실행할 수도 있습니다.

## 다시 만들기

원본 데이터(엑셀, UPRO CSV)를 저장소 루트에 둔 뒤:

```
python tools/build.py        # index.html, tqqq.html 생성
python tools/bt.py 2099-12-31 asset=tqqq   # 터미널 백테스트
node tools/sweep.js tqqq grid               # 파라미터 탐색 (먼저 python tools/export.py tqqq)
```

원본 데이터는 이 저장소에 포함되어 있지 않습니다. 세금, 호가 비용, 레버리지 ETF 조기 청산 위험은 반영하지 않았으며 투자 권유가 아닙니다.
