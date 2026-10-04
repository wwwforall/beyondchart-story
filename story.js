// BeyondChart — 올라가는 차트의 구조 (공개판)
// 원본: desktop-chart-widget의 chart-intro.js(buildStory 계산) + chart-story-charts.js(행 차트).
// 공개판은 서버가 없다 — 데이터(data/cases.json)는 GitHub Actions가 매일 갱신한다(scripts/update_cases.py).
(function () {
    'use strict';

    function movingAverage(c, period) {
        const out = new Array(c.length);
        let sum = 0;
        for (let j = 0; j < c.length; j++) {
            sum += c[j];
            if (j >= period) sum -= c[j - period];
            out[j] = j >= period - 1 ? sum / period : null;
        }
        return out;
    }

    function bollinger(c, period, k) {
        const mid = movingAverage(c, period);
        const up = new Array(c.length), lo = new Array(c.length);
        for (let j = 0; j < c.length; j++) {
            if (mid[j] === null) { up[j] = lo[j] = null; continue; }
            let ss = 0;
            for (let i = j - period + 1; i <= j; i++) ss += (c[i] - mid[j]) ** 2;
            const sd = Math.sqrt(ss / period);
            up[j] = mid[j] + k * sd; lo[j] = mid[j] - k * sd;
        }
        return { up, lo };
    }

    function rsiWilder(c, n) {
        const out = new Array(c.length).fill(null);
        if (c.length <= n) return out;
        let au = 0, ad = 0;
        for (let i = 1; i <= n; i++) { const d = c[i] - c[i - 1]; if (d > 0) au += d; else ad -= d; }
        au /= n; ad /= n;
        out[n] = 100 - 100 / (1 + au / (ad || 1e-9));
        for (let i = n + 1; i < c.length; i++) {
            const d = c[i] - c[i - 1];
            au = (au * (n - 1) + (d > 0 ? d : 0)) / n;
            ad = (ad * (n - 1) + (d < 0 ? -d : 0)) / n;
            out[i] = 100 - 100 / (1 + au / (ad || 1e-9));
        }
        return out;
    }

    function argExt(arr, from, to, isMax) {
        let best = from;
        for (let i = from; i < to; i++) if (isMax ? arr[i] > arr[best] : arr[i] < arr[best]) best = i;
        return best;
    }

    function buildStory(full) {
        // 파일엔 창 앞에 `lead`봉이 더 실려 있다(200일선을 첫날부터 그리려고). 이평은 전체로
        // 계산하고, 화면에 쓰는 배열은 창만큼 잘라 쓴다.
        const lead = full.lead || 0;
        const cut = (arr) => arr.slice(lead);
        const raw = Object.assign({}, full, { t: cut(full.t), o: cut(full.o), h: cut(full.h), l: cut(full.l), c: cut(full.c), v: cut(full.v) });
        const n = raw.c.length;
        const idx = (day) => { const i = raw.t.findIndex(d => d >= day); return i < 0 ? n : i; };
        // 아카이브 국면(발아·발화·성장·과열·균열·붕괴) — 있으면 띠로 깐다
        const phases = (raw.phases || []).map(p => ({ name: p.name, a: idx(p.frm), b: Math.min(n, idx(p.to)) })).filter(p => p.b > p.a);
        const events = (raw.events || []).map(e => ({ label: e.label, i: idx(e.date) })).filter(e => e.i < n);
        // 이평 — 앱과 같은 색 규칙: 20 노랑 · 50 초록 · 200 빨강
        const ma = cut(movingAverage(full.c, 20));
        const ma50 = cut(movingAverage(full.c, 50));
        const ma200 = cut(movingAverage(full.c, 200));
        const bbFull = bollinger(full.c, 20, 2);
        const bb = { up: cut(bbFull.up), lo: cut(bbFull.lo) };
        const rsi = cut(rsiWilder(full.c, 14));
        let vmax = 0;
        for (let j = 0; j < n; j++) if (raw.v[j] > vmax) vmax = raw.v[j];
        // RSI 다이버전스 — structure.py 와 같은 규칙.
        //   강세: 앵커 전 120일을 반으로 갈라 각 저점을 비교, 가격은 더 낮은데 RSI는 3 이상 높다
        //   약세: 앵커 뒤 120일 고점과 그 전 10~60일 사이 고점 비교, 가격은 더 높은데 RSI는 3 이상 낮다
        const bi = idx(raw.breakDay);
        const fullB = bi + lead, H = full.h, Lo = full.l, R = rsiWilder(full.c, 14);
        let bullDiv = null, bearDiv = null;
        if (fullB - 120 >= 0) {
            const i1 = argExt(Lo, fullB - 120, fullB - 60, false), i2 = argExt(Lo, fullB - 60, fullB, false);
            bullDiv = { yes: Lo[i2] < Lo[i1] && R[i2] > R[i1] + 3, a: i1 - lead, b: i2 - lead };
        }
        const pk = argExt(H, fullB + 1, Math.min(full.c.length, fullB + 121), true);
        if (pk - 60 >= 0) {
            const j = argExt(H, pk - 60, pk - 10, true);
            bearDiv = { yes: H[pk] > H[j] && R[pk] < R[j] - 3, a: j - lead, b: pk - lead };
        }
        // 내러티브 창 안의 저점→고점(텐배거 배수). 데이터는 전체 히스토리, 창은 표시용 경계
        const winA = raw.winA ? idx(raw.winA) : 0, winB = raw.winB ? Math.min(n - 1, idx(raw.winB)) : n - 1;
        let loI = winA, hiI = winA;
        for (let j = winA; j <= winB; j++) { if (raw.c[j] < raw.c[loI]) loI = j; }
        for (let j = loI; j <= winB; j++) { if (raw.c[j] > raw.c[hiI]) hiI = j; }
        return {
            raw, n, ma, ma50, ma200, bb, rsi, bullDiv, bearDiv, phases, events, vmax,
            breakIdx: bi, threshold: raw.threshold, loI, hiI, winA, winB,
            // 임계 대비 로그 수익률의 범위 — 세로 스케일(배수당 px)이 모든 행에서 같다
            lnLo: Math.log(Math.min(...raw.l) / raw.threshold), lnHi: Math.log(Math.max(...raw.h) / raw.threshold),
        };
    }


    'use strict';

    const PHASE_COLORS = { '발아': '#8b949e', '발화': '#3fb950', '성장': '#4493f8', '과열': '#e3b341', '균열': '#ff9f43', '붕괴': '#f85149' };
    function phaseColor(name, fallback) {
        for (const k of Object.keys(PHASE_COLORS)) if (name.includes(k)) return PHASE_COLORS[k];
        return fallback;
    }
    function cssVar(name, fallback) {
        const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
        return v || fallback;
    }
    function alpha(hex, a) {
        const m = /^#([0-9a-f]{6})$/i.exec(hex);
        if (!m) return hex;
        const n = parseInt(m[1], 16);
        return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`;
    }
    function fmtPrice(p) {
        if (p === null || p === undefined || !isFinite(p)) return '';
        const a = Math.abs(p);
        return p.toLocaleString('ko-KR', { maximumFractionDigits: a >= 1000 ? 0 : a >= 10 ? 1 : 2 });
    }
    function esc(s) {
        return String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    }

    function colors() {
        return {
            bg: cssVar('--bg', '#0d1117'), text: cssVar('--text-3', '#8b949e'), grid: cssVar('--chart-grid', 'rgba(139,148,158,.08)'),
            border: cssVar('--border', '#30363d'),
            bull: cssVar('--candle-up', '#3fb950'), bear: cssVar('--candle-down', '#f85149'),
            ma20: cssVar('--ma-20', '#e3b341'), ma50: cssVar('--ma-50', '#3fb950'), ma200: cssVar('--ma-200', '#f85149'),
            warn: cssVar('--warn', '#e3b341'), accent: cssVar('--accent', '#4493f8'), dim: cssVar('--text-4', '#8b949e'),
            text2: cssVar('--text-2', '#c9d1d9'),
        };
    }

    // 한 사례 → 시리즈 데이터. 배열 인덱스 j ↔ 날짜 raw.t[j] ('YYYY-MM-DD', 일봉이라 business day 문자열)
    function seriesData(s, col) {
        const { raw } = s;
        const T = raw.t;
        const line = (arr, positive) => {
            const out = [];
            for (let j = 0; j < s.n; j++) {
                const v = arr[j];
                out.push(v === null || v === undefined || (positive && !(v > 0)) ? { time: T[j] } : { time: T[j], value: v });
            }
            return out;
        };
        const candles = [], vol = [], phase = [];
        const phaseAt = new Array(s.n).fill(null);
        for (const p of s.phases) for (let j = p.a; j < p.b && j < s.n; j++) phaseAt[j] = p.name;
        for (let j = 0; j < s.n; j++) {
            candles.push({ time: T[j], open: raw.o[j], high: raw.h[j], low: raw.l[j], close: raw.c[j] });
            const up = raw.c[j] >= raw.o[j];
            vol.push({ time: T[j], value: raw.v[j] || 0,
                       color: j === s.breakIdx ? col.warn : alpha(up ? col.bull : col.bear, 0.35) });
            // 국면 띠 — 화면 높이를 꽉 채우는 옅은 막대(값 1, 축은 숨김)
            phase.push(phaseAt[j] ? { time: T[j], value: 1, color: alpha(phaseColor(phaseAt[j], col.dim), 0.07) } : { time: T[j] });
        }
        // 표시 — 시간순이어야 한다
        const mk = [];
        for (const p of s.phases) if (p.a < s.n) mk.push({ time: T[p.a], position: 'aboveBar', shape: 'square', size: 0.6, color: phaseColor(p.name, col.dim), text: p.name });
        for (const e of s.events) mk.push({ time: T[e.i], position: 'aboveBar', shape: 'circle', size: 0.6, color: col.text2, text: e.label });
        if (s.breakIdx < s.n) mk.push({ time: T[s.breakIdx], position: 'belowBar', shape: 'arrowUp', color: col.warn, text: '앵커' });
        mk.push({ time: T[s.loI], position: 'belowBar', shape: 'circle', color: col.bull, text: '창 저점' });
        mk.push({ time: T[s.hiI], position: 'aboveBar', shape: 'circle', color: col.bear, text: '창 고점' });
        mk.sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0));
        // 다이버전스 — 가격과 RSI 양쪽에 두 점짜리 선
        const divs = [];
        for (const [dv, color, series] of [[s.bullDiv, col.bull, raw.l], [s.bearDiv, col.bear, raw.h]]) {
            if (!dv || !dv.yes || dv.a < 0 || dv.b >= s.n || dv.a >= dv.b) continue;
            divs.push({ color, price: [{ time: T[dv.a], value: series[dv.a] }, { time: T[dv.b], value: series[dv.b] }],
                        rsi: [{ time: T[dv.a], value: s.rsi[dv.a] }, { time: T[dv.b], value: s.rsi[dv.b] }] });
        }
        return { candles, vol, phase, mk, divs,
                 ma20: line(s.ma, true), ma50: line(s.ma50, true), ma200: line(s.ma200, true),
                 bbUp: line(s.bb.up, true), bbLo: line(s.bb.lo, true), rsi: line(s.rsi) };
    }

    function headHtml(s) {
        const { raw } = s;
        const mult = raw.c[s.hiI] / raw.c[s.loI], months = (s.hiI - s.loI) / 21;
        return `<span class="story-row-title" style="color:${esc(raw.color || 'var(--text-2)')}">${esc(raw.title)}</span>
            <span class="story-row-sub">${esc(raw.sub || '')}</span>
            <span class="story-row-mult">창 저점→고점 ×${mult >= 10 ? mult.toFixed(0) : mult.toFixed(1)} · ${months.toFixed(0)}개월</span>
            <span class="story-row-last">${esc(raw.t[s.n - 1])} 종가 ${fmtPrice(raw.c[s.n - 1])}</span>
            <span class="story-row-hover"></span>
            <span class="story-row-btns">
                <button type="button" data-view="win" title="내러티브 창(시작→절정→소멸)으로">창</button>
                <button type="button" data-view="all" title="전 기간">전체</button>
                <button type="button" data-view="now" title="최근 2년 — 오늘(현재가)까지">현재가</button>
            </span>`;
    }

    function makeRow(container, s, col) {
        const LC = window.LightweightCharts;
        const row = document.createElement('section');
        row.className = 'story-row';
        row.id = `story-row-${s.raw.id}`;
        const head = document.createElement('div');
        head.className = 'story-row-head';
        const box = document.createElement('div');
        box.className = 'story-row-chart';
        row.appendChild(head);
        row.appendChild(box);
        container.appendChild(row);

        const chart = LC.createChart(box, {
            autoSize: true,
            layout: { background: { type: 'solid', color: col.bg }, textColor: col.text, fontSize: 11, attributionLogo: true,
                      panes: { separatorColor: col.border, separatorHoverColor: col.border } },
            grid: { vertLines: { color: col.grid }, horzLines: { color: col.grid } },
            rightPriceScale: { mode: LC.PriceScaleMode.Logarithmic, borderVisible: false, scaleMargins: { top: 0.12, bottom: 0.2 } },
            timeScale: { borderVisible: false, rightOffset: 6, minBarSpacing: 0.05,
                         // 날짜 눈금 — 해가 바뀌면 연도, 아니면 '월' (일봉 문자열 시간)
                         tickMarkFormatter: (time, type) => {
                             const d = typeof time === 'string' ? time : `${time.year}-${String(time.month).padStart(2, '0')}-${String(time.day).padStart(2, '0')}`;
                             if (type === 0) return d.slice(0, 4);
                             if (type === 1) return `${+d.slice(5, 7)}월`;
                             return d.slice(5).replace('-', '.');
                         } },
            crosshair: { mode: 0 },
            localization: { locale: 'ko-KR', priceFormatter: fmtPrice },
            // 휠 = 확대·축소(사용자: "스크롤로 차트 확대 축소가 안돼?"). 휠로 가로 이동은 안 한다 —
            // 세로 휠이 이동과 확대를 둘 다 하면 어느 쪽인지 예측이 안 된다. 이동은 드래그·Shift+휠
            handleScroll: { mouseWheel: false, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
            handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: true, axisDoubleClickReset: true },
        });
        const opt = { priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false };
        const phaseS = chart.addSeries(LC.HistogramSeries, { ...opt, priceScaleId: 'phase', base: 0 });
        chart.priceScale('phase').applyOptions({ visible: false, scaleMargins: { top: 0, bottom: 0 } });
        const volS = chart.addSeries(LC.HistogramSeries, { ...opt, priceScaleId: 'vol', priceFormat: { type: 'volume' } });
        chart.priceScale('vol').applyOptions({ visible: false, scaleMargins: { top: 0.84, bottom: 0 } });
        const bbUp = chart.addSeries(LC.LineSeries, { ...opt, color: alpha(col.dim, 0.5), lineWidth: 1, lineStyle: 2 });
        const bbLo = chart.addSeries(LC.LineSeries, { ...opt, color: alpha(col.dim, 0.5), lineWidth: 1, lineStyle: 2 });
        const ma200 = chart.addSeries(LC.LineSeries, { ...opt, color: col.ma200, lineWidth: 1 });
        const ma50 = chart.addSeries(LC.LineSeries, { ...opt, color: col.ma50, lineWidth: 1 });
        const ma20 = chart.addSeries(LC.LineSeries, { ...opt, color: col.ma20, lineWidth: 1 });
        const candle = chart.addSeries(LC.CandlestickSeries, {
            upColor: col.bull, downColor: col.bear, borderVisible: false, wickUpColor: col.bull, wickDownColor: col.bear,
            priceLineVisible: false,
        });
        candle.createPriceLine({ price: s.threshold, color: col.warn, lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: '임계' });
        const markers = LC.createSeriesMarkers(candle, []);
        // RSI(14) — 아래 페인
        const rsi = chart.addSeries(LC.LineSeries, { ...opt, color: col.accent, lineWidth: 1,
            autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: 100 } }) }, 1);
        // 로그 축 설정(rightPriceScale)이 아래 페인 축에도 걸린다 — RSI는 0이 있어 로그면 축이 깨진다
        rsi.priceScale().applyOptions({ mode: LC.PriceScaleMode.Normal, scaleMargins: { top: 0.08, bottom: 0.08 } });
        rsi.createPriceLine({ price: 70, color: alpha(col.dim, 0.4), lineWidth: 1, lineStyle: 2, axisLabelVisible: false });
        rsi.createPriceLine({ price: 30, color: alpha(col.dim, 0.4), lineWidth: 1, lineStyle: 2, axisLabelVisible: false });
        const panes = chart.panes();
        if (panes[0] && panes[0].setStretchFactor) panes[0].setStretchFactor(4);
        if (panes[1] && panes[1].setStretchFactor) panes[1].setStretchFactor(1);
        let divSeries = [];

        let cur = s;
        function setData(story, keepRange) {
            cur = story;
            const range = keepRange ? chart.timeScale().getVisibleLogicalRange() : null;
            const d = seriesData(story, col);
            phaseS.setData(d.phase); volS.setData(d.vol);
            bbUp.setData(d.bbUp); bbLo.setData(d.bbLo);
            ma200.setData(d.ma200); ma50.setData(d.ma50); ma20.setData(d.ma20);
            candle.setData(d.candles); rsi.setData(d.rsi);
            markers.setMarkers(d.mk);
            for (const x of divSeries) chart.removeSeries(x);
            divSeries = [];
            for (const dv of d.divs) {
                const a = chart.addSeries(LC.LineSeries, { ...opt, color: dv.color, lineWidth: 2 });
                a.setData(dv.price);
                const b = chart.addSeries(LC.LineSeries, { ...opt, color: dv.color, lineWidth: 2 }, 1);
                b.setData(dv.rsi);
                divSeries.push(a, b);
            }
            head.innerHTML = headHtml(story);
            if (range) chart.timeScale().setVisibleLogicalRange(range);
        }
        function view(kind) {
            const ts = chart.timeScale(), n = cur.n;
            if (kind === 'all') { ts.fitContent(); return; }
            if (kind === 'now') { ts.setVisibleLogicalRange({ from: n - 1 - 500, to: n - 1 + 6 }); return; }
            const pad = Math.max(10, Math.round((cur.winB - cur.winA) * 0.06));
            ts.setVisibleLogicalRange({ from: cur.winA - pad, to: cur.winB + pad });
        }
        head.addEventListener('click', (e) => {
            const b = e.target.closest('button[data-view]');
            if (b) view(b.dataset.view);
        });
        // 십자선 위치의 날짜·종가·RSI를 머리줄에 — 날짜 축만으로는 정확한 날을 읽기 어렵다
        chart.subscribeCrosshairMove((p) => {
            const el = head.querySelector('.story-row-hover');
            if (!el) return;
            if (!p || !p.time || !p.seriesData) { el.textContent = ''; return; }
            const c = p.seriesData.get(candle), r = p.seriesData.get(rsi);
            const t = typeof p.time === 'string' ? p.time : '';
            el.textContent = c ? `${t} · 시 ${fmtPrice(c.open)} 고 ${fmtPrice(c.high)} 저 ${fmtPrice(c.low)} 종 ${fmtPrice(c.close)}${r && r.value !== undefined ? ` · RSI ${r.value.toFixed(0)}` : ''}` : t;
        });
        // 휠 = 확대·축소(라이브러리 기본, 커서 기준). Shift+휠만 가로 이동으로 가로챈다 — 캡처 단계에서
        // 막아야 라이브러리의 확대 처리까지 안 간다. 페이지 스크롤은 차트 바깥(좌우 여백·행 사이·머리줄)에서
        box.addEventListener('wheel', (e) => {
            if (!e.shiftKey) return;
            e.preventDefault();
            e.stopPropagation();
            const ts = chart.timeScale();
            const r = ts.getVisibleLogicalRange();
            if (!r) return;
            const span = r.to - r.from;
            const d = (e.deltaY || e.deltaX) > 0 ? span * 0.15 : -span * 0.15;
            ts.setVisibleLogicalRange({ from: r.from + d, to: r.to + d });
        }, { passive: false, capture: true });

        setData(s, false);
        view('win');
        return { row, setData, view, remove: () => chart.remove() };
    }

    // stories = chart-intro.js의 buildStory 결과 배열. 반환: { update(i, story), rowOf(i), destroy() }
    window.mountStoryCharts = function (container, stories) {
        if (!container || !window.LightweightCharts || typeof window.LightweightCharts.createChart !== 'function') return null;
        const col = colors();
        container.innerHTML = '';
        const rows = stories.map(s => makeRow(container, s, col));
        return {
            update(i, story) { if (rows[i]) rows[i].setData(story, true); },
            rowOf(i) { return rows[i] ? rows[i].row : null; },
            destroy() { for (const r of rows) r.remove(); container.innerHTML = ''; },
        };
    };


    // ── 페이지 ─────────────────────────────────────────────────────────────
    const rowsEl = document.getElementById('story-rows');
    const nav = document.getElementById('story-nav');
    const stamp = document.getElementById('story-stamp');
    fetch('data/cases.json', { cache: 'no-cache' }).then(r => r.json()).then(list => {
        const stories = list.filter(x => x && x.c && x.c.length > 50).map(buildStory);
        const charts = window.mountStoryCharts(rowsEl, stories);
        let last = '';
        stories.forEach((s, r) => {
            if (s.raw.t[s.n - 1] > last) last = s.raw.t[s.n - 1];
            const chip = document.createElement('span');
            chip.className = 'story-chip';
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.innerHTML = `<i style="background:${s.raw.color || 'var(--text-3)'}"></i>${s.raw.title}`;
            btn.title = s.raw.sub || '';
            btn.addEventListener('click', () => {
                const row = charts && charts.rowOf(r);
                const top = document.querySelector('.story-top');
                if (row) window.scrollTo({ top: Math.max(0, row.offsetTop - (top ? top.offsetHeight + 12 : 96)) });
            });
            chip.appendChild(btn);
            nav.appendChild(chip);
        });
        if (stamp) stamp.textContent = `데이터 기준 ${last} · 사례 ${stories.length}편`;
    }).catch(e => {
        rowsEl.innerHTML = `<p class="story-err">데이터를 못 불러왔습니다: ${String(e)}</p>`;
    });
})();
