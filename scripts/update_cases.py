# -*- coding: utf-8 -*-
"""data/cases.json에 최신 일봉을 이어 붙인다 — GitHub Actions가 매일 돌린다.

공개판에는 서버가 없어서, BeyondChart 앱이 페이지를 열 때마다 하던 '현재가 이어 붙이기'를
여기서 하루 한 번 한다. 소스는 Yahoo Finance 하나(국장도 .KS/.KQ) — 키가 필요 없다.

이음매: 파일의 마지막 날 종가와 Yahoo의 같은 날 종가로 비율을 구해 **과거(파일) 쪽을 오늘 기준으로**
옮긴다(앱과 같은 규칙). 분할이 생기면 이 비율이 크게 나와 과거 전체가 자동으로 맞춰진다.
마지막 날은 Yahoo 값으로 덮는다(장중에 저장됐을 수 있다). 겹치는 날이 없으면 그 사례는 건너뛴다.

    python scripts/update_cases.py            # data/cases.json 갱신
"""
import json
import math
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CASES = os.path.join(ROOT, 'data', 'cases.json')

# 사례 id → Yahoo 심볼. **사례에 `yahoo` 칸이 있으면 그게 우선**이다 — 앱의 add_intro_case.py가 적어 주므로
# 새 사례는 여기를 안 고쳐도 된다. 이 표는 그 칸이 생기기 전에 들어온 사례들 몫이다
YAHOO = {
    'saerom1999': '035610.KQ', 'hhi2003': '009540.KS', 'celltrion2015': '068270.KS',
    'shinpoong2020': '019170.KS', 'seegene2020': '096530.KQ', 'hmm2020': '011200.KS',
    'kakao2020': '035720.KS', 'ecopro2020': '086520.KQ', 'hynix2023': '000660.KS',
    'samsung2024': '005930.KS',
    'tsla2020': 'TSLA', 'mrna2020': 'MRNA', 'nvda2023': 'NVDA',
    'mu2023': 'MU', 'lly2022': 'LLY', 'aapl2007': 'AAPL', 'googl2023': 'GOOGL',
    'amzn2009': 'AMZN', 'sndk2025': 'SNDK', 'btc2017': 'BTC-USD',
}


def fetch(symbol, since):
    """{날짜: (o, h, l, c, v)} — 파일의 마지막 날 며칠 전부터. 값이 없는 행(NaN)은 버린다.
    고정 기간(한 달)으로 받으면 오래 멈춰 있던 사례가 겹치는 날을 못 찾아 영영 갱신이 안 된다."""
    import datetime as dt
    import yfinance as yf
    start = (dt.date.fromisoformat(since) - dt.timedelta(days=10)).isoformat()
    df = yf.download(symbol, start=start, interval='1d', auto_adjust=False, progress=False, multi_level_index=False)
    out = {}
    if df is None or df.empty:
        return out
    for ts, row in df.iterrows():
        vals = [float(row[k]) for k in ('Open', 'High', 'Low', 'Close')]
        if any(math.isnan(v) or v <= 0 for v in vals):
            continue
        vol = float(row['Volume']) if not math.isnan(float(row['Volume'])) else 0.0
        out[ts.strftime('%Y-%m-%d')] = (*vals, vol)
    return out


def update(case, bars):
    t = case['t']
    last = t[-1]
    if last not in bars:
        return 'skip: 겹치는 날 없음'
    k = bars[last][3] / case['c'][-1]
    if abs(k - 1) > 1e-9:
        for key in ('o', 'h', 'l', 'c'):
            case[key] = [x * k for x in case[key]]
        case['threshold'] = case['threshold'] * k
    o, h, l, c, v = bars[last]
    case['o'][-1], case['h'][-1], case['l'][-1], case['c'][-1], case['v'][-1] = o, h, l, c, v
    added = 0
    for d in sorted(x for x in bars if x > last):
        o, h, l, c, v = bars[d]
        t.append(d); case['o'].append(o); case['h'].append(h); case['l'].append(l); case['c'].append(c); case['v'].append(v)
        added += 1
    # 부제의 '데이터 YYYY~YYYY' 끝 해를 맞춘다
    case['sub'] = re.sub(r'(데이터 \d{4}~)\d{4}', lambda m: m.group(1) + t[-1][:4], case['sub'])
    return f'+{added}봉 → {t[-1]} (이음매 ×{k:.4f})'


def main():
    cases = json.load(open(CASES, encoding='utf-8'))
    changed = False
    for case in cases:
        sym = case.get('yahoo') or YAHOO.get(case['id'])
        if not sym:
            print(f"{case['id']}: Yahoo 심볼 없음 — 건너뜀")
            continue
        try:
            bars = fetch(sym, case['t'][-1])
        except Exception as e:                      # 한 종목 실패가 전체를 막지 않는다
            print(f"{case['id']} {sym}: 받기 실패 {type(e).__name__}: {e}")
            continue
        before = (case['t'][-1], case['c'][-1])
        msg = update(case, bars)
        changed |= (case['t'][-1], case['c'][-1]) != before
        print(f"{case['id']} {sym}: {msg}")
    tmp = CASES + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(cases, f, ensure_ascii=False, separators=(',', ':'))
    os.replace(tmp, CASES)
    print('변경 있음' if changed else '변경 없음')


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    main()
