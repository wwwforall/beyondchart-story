# 올라가는 차트의 구조

역사적 텐배거들의 차트 — 내러티브가 시작해서 절정을 찍고 소멸하기까지. 사례마다 독립된 차트라
드래그로 옮기고 휠로 확대해 오늘(현재가)까지 볼 수 있다.

개인이 정리한 학습용 자료이며 투자 권유가 아니다.

## 구성

| 파일 | 역할 |
|---|---|
| `index.html` · `style.css` · `story.js` | 정적 페이지. 서버 없이 `data/cases.json`만 읽는다 |
| `data/cases.json` | 사례 데이터(일봉 전체 + 내러티브 창·앵커·국면·이벤트) |
| `scripts/update_cases.py` | Yahoo Finance에서 최신 일봉을 받아 이어 붙인다 |
| `.github/workflows/update.yml` | 매일 07:30(KST) 위 스크립트를 돌려 커밋 → Pages가 다시 배포 |

- **앵커**: 처음으로 직전 120일 최고 고가(= **임계**)를 종가로 넘고, 그 뒤 120일 안에 ×1.5에 닿은 날
- **창**: 그 종목의 내러티브 구간(개인 정리). 국면 띠·이벤트는 아카이브가 있는 사례에만 있다
- 시세는 Yahoo Finance 일봉이라 국장은 하루 늦을 수 있다. 과거 구간은 이음매 비율로 오늘의 수정주가 기준에 맞춘다

원본은 개인용 데스크톱 앱 BeyondChart의 시작 2페이지다. 사례는 그쪽의 `scripts/add_intro_case.py`로 만들고
여기 `data/cases.json`으로 옮긴다(새 사례는 `scripts/update_cases.py`의 `YAHOO`에도 한 줄).

## 로컬에서 보기

```
python -m http.server 8000
```

차트: [TradingView Lightweight Charts™](https://www.tradingview.com/)
