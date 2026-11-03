/* 메뉴: AI 사용 (ai) — 이 메뉴 담당 하위 세션은 이 파일만 고칩니다.
   공용 도구·상태는 window.APP에서 꺼내 씁니다. 새 버튼 동작은 APP.acts['이름'] = (el) => {...},
   새 폼은 APP.forms['이름'] = (fd, form) => {...}, 새 select 변경은 APP.changes['이름'] = (el) => {...} 로 등록합니다.

   원칙: 수집 경로가 없는 값(ChatGPT·Gemini 토큰·비용, claude.ai 구독 채팅 토큰)은 0으로 채우지 않고 '미확인'으로 둔다. */
(function () {
  'use strict';
  const { S, RATE, esc, won, md, badge, guide, toast } = window.APP;

  /* ---------- 설정 ---------- */
  const RUN_HOURS = [0, ...Array.from({ length: 16 }, (_, i) => i + 8)]; // 0,8~23시 = 하루 17회
  const CRON = 'CRON_TZ=Asia/Seoul 0 0,8-23 * * *';
  const PERIODS = {
    day: { label: '일', kpi: '오늘', prev: '어제', days: 1, trend: '최근 14일', skillBase: 1 },
    week: { label: '주', kpi: '최근 7일', prev: '직전 7일', days: 7, trend: '최근 8주', skillBase: 7 },
    month: { label: '월', kpi: '최근 30일', prev: '직전 30일', days: 30, trend: '최근 6개월', skillBase: 30 }
  };
  const PROVIDERS = [
    { key: 'claude', name: 'Claude', sub: 'Claude Code·API', measured: true },
    { key: 'chatgpt', name: 'ChatGPT', sub: '구독·API', measured: false, why: '관리자(API) 키 확인 전 — 개인 구독은 토큰이 노출되지 않음' },
    { key: 'gemini', name: 'Gemini', sub: 'AI Studio·Cloud', measured: false, why: '관리자 키 보유 여부 확인 전(§8-4)' }
  ];
  const FEATURE_KEYS = [['채팅', 'chat'], ['코드(Claude Code)', 'code'], ['스킬', 'skill'], ['커넥터', 'connector'], ['에이전트', 'agent']];

  /* ---------- 추가 샘플: 200일 일별 시계열(최근 14일은 S.usage 그대로) ---------- */
  const isoDay = (d) => { const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 10); };
  function buildDaily() {
    const t0 = new Date(); t0.setHours(0, 0, 0, 0);
    const byDate = Object.fromEntries((S.usage || []).map((u) => [u.date, u]));
    const out = [];
    for (let i = 199; i >= 0; i--) {
      const d = new Date(t0); d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10); // data.js의 D()와 같은 방식
      if (byDate[key]) { out.push(Object.assign({}, byDate[key], { date: key })); continue; }
      const base = [0, 6].includes(d.getDay()) ? 0.45 : 1;
      const wave = 0.75 + 0.5 * Math.abs(Math.sin(i * 1.7));
      const grow = Math.max(0.35, 1 - i * 0.0035); // 과거일수록 사용량 적음(도입 확산 가정)
      const k = base * wave * grow;
      out.push({ date: key, provider: 'Claude', input_tokens: Math.round(2100000 * k), output_tokens: Math.round(380000 * k), cost_usd: +(14.2 * k).toFixed(2), calls: Math.round(210 * k), data_source: '측정' });
    }
    return out;
  }
  const ensureExtra = () => {
    const today = S.today || isoDay(new Date());
    if (!S.aiExtra || S.aiExtra.today !== today) S.aiExtra = { today, daily: buildDaily() };
    return S.aiExtra;
  };

  /* ---------- 집계 도구 ---------- */
  const sum = (rows) => rows.reduce((a, x) => ({ in: a.in + x.input_tokens, out: a.out + x.output_tokens, usd: a.usd + x.cost_usd, calls: a.calls + x.calls }), { in: 0, out: 0, usd: 0, calls: 0 });
  const M = (n, dp = 2) => (n / 1e6).toFixed(n >= 1e8 ? 0 : n >= 1e7 ? 1 : dp);
  const hash = (s) => { let h = 7; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
  const monthKey = (iso) => iso.slice(0, 7);

  function buckets(daily, period) {
    if (period === 'day') return daily.slice(-14).map((r) => ({ label: md(r.date), full: r.date, ...sum([r]) }));
    if (period === 'week') {
      const out = [];
      for (let w = 7; w >= 0; w--) {
        const rows = daily.slice(daily.length - (w + 1) * 7, daily.length - w * 7);
        out.push({ label: md(rows[0].date) + '~', full: `${rows[0].date} ~ ${rows[rows.length - 1].date}`, ...sum(rows) });
      }
      return out;
    }
    const keys = [...new Set(daily.map((r) => monthKey(r.date)))].slice(-6);
    const cur = monthKey(daily[daily.length - 1].date);
    return keys.map((k) => ({ label: +k.slice(5) + '월' + (k === cur ? '*' : ''), full: k === cur ? `${k} (진행 중)` : k, partial: k === cur, ...sum(daily.filter((r) => monthKey(r.date) === k)) }));
  }

  function topSkills(period) {
    const scale = PERIODS[period].skillBase / 14; // 샘플 Top10은 14일 기준 횟수
    return (S.topSkills || []).map(([name, n]) => {
      const jit = 0.8 + (hash(name + period) % 41) / 100; // 0.8~1.2 고정 흔들림
      return [name, Math.round(n * scale * jit)];
    }).sort((a, b) => b[1] - a[1]).slice(0, 10);
  }

  const delta = (cur, prev) => {
    if (!prev) return '';
    const p = Math.round(((cur - prev) / prev) * 100);
    const cls = p > 0 ? 'up' : p < 0 ? 'down' : '';
    return `<span class="ai-delta ${cls}">${p > 0 ? '▲' : p < 0 ? '▼' : '−'} ${Math.abs(p)}%</span>`;
  };

  /* ---------- 전송 데이터 예시(JSON) ---------- */
  function samplePayload(last) {
    const now = new Date(); const h = RUN_HOURS.filter((x) => x <= now.getHours()).pop() ?? 0;
    const to = new Date(now); to.setHours(h, 0, 0, 0);
    const from = new Date(to); from.setHours(h === 8 ? 0 : h - 1); // 08시 보고는 00~08시를 한 번에, 00시 보고는 전날 23~24시
    const kst = (x) => `${isoDay(x)}T${String(x.getHours()).padStart(2, '0')}:00:00+09:00`;
    const r = (n) => Math.round(n / 17); // 하루치를 17회로 나눈 1회분(목업)
    return {
      schema: 'ai-usage-report/0.1',
      sent_at: kst(to).replace(':00:00+', ':00:05+'),
      window: { from: kst(from), to: kst(to) },
      reporter: { skill: 'ai-usage-report', version: '0.1', schedule: CRON },
      fx: { usd_krw: RATE, source: '가정 환율' },
      providers: [
        { provider: 'claude', source: 'admin_api+claude_code_logs', data_source: '측정', input_tokens: r(last.input_tokens), output_tokens: r(last.output_tokens), cost_usd: +(last.cost_usd / 17).toFixed(2), calls: r(last.calls) },
        { provider: 'chatgpt', source: null, data_source: '미확인', input_tokens: null, output_tokens: null, cost_usd: null, calls: null, reason: 'no_admin_key' },
        { provider: 'gemini', source: null, data_source: '미확인', input_tokens: null, output_tokens: null, cost_usd: null, calls: null, reason: 'no_admin_key' }
      ],
      features: { data_source: '추정', chat: 5, code: 4, skill: 2, connector: 1, agent: 1 },
      skills: [{ name: 'isens-file-naming', count: 2 }, { name: 'morning', count: 1 }]
    };
  }
  const FIELD_DOCS = [
    ['schema', '문자열', '형식 버전. 현재 ai-usage-report/0.1'],
    ['window.from / to', 'ISO 시각(+09:00)', '이번 보고가 덮는 구간. 08시 보고는 00~08시(쉬는 시간 포함)를 한 번에 보냄'],
    ['providers[].provider', 'claude | chatgpt | gemini', 'AI 종류'],
    ['providers[].input_tokens / output_tokens', '정수 | null', '구간 합계. 수집 경로가 없으면 null(=미확인). 0으로 채우지 않음'],
    ['providers[].cost_usd', '숫자 | null', '달러 원가. 원화는 서버가 fx.usd_krw로 환산해 저장'],
    ['providers[].data_source', '측정 | 수기 | 추정 | 미확인', '화면 배지와 같은 값'],
    ['features', '정수(횟수)', '채팅·코드·스킬·커넥터·에이전트 호출 수. 도구 호출 유형으로 분류한 추정치'],
    ['skills[]', '{name, count}', '구간 내 스킬 실행 횟수. 서버가 일·주·월로 합산해 Top10 산출']
  ];
  const highlight = (json) => esc(json)
    .replace(/(&quot;[^&]*?&quot;)(\s*:)/g, '<span class="k">$1</span>$2')
    .replace(/:\s(&quot;.*?&quot;)/g, ': <span class="s">$1</span>')
    .replace(/:\s(-?\d+(?:\.\d+)?)/g, ': <span class="n">$1</span>')
    .replace(/:\s(null)/g, ': <span class="z">$1</span>');

  /* ---------- 화면 ---------- */
  function viewAI() {
    const X = ensureExtra();
    const daily = X.daily;
    const period = PERIODS[S.ui.aiPeriod] ? S.ui.aiPeriod : 'day';
    const P = PERIODS[period];
    const curRows = daily.slice(-P.days), prevRows = daily.slice(-P.days * 2, -P.days);
    const cur = sum(curRows), prev = sum(prevRows);
    const tot = cur.in + cur.out;

    const now = new Date(); const nowH = now.getHours();
    const received = RUN_HOURS.filter((h) => h <= nowH);
    const next = RUN_HOURS.find((h) => h > nowH);
    const nextTxt = next === undefined ? '내일 00:00' : String(next).padStart(2, '0') + ':00';

    const bk = buckets(daily, period);
    const pick = Math.min(S.ui.aiPick ?? bk.length - 1, bk.length - 1);
    const sel = bk[pick];
    const maxT = Math.max(...bk.map((b) => b.in + b.out));
    const skills = topSkills(period);
    const skMax = skills[0] ? skills[0][1] : 1;
    const fShare = S.features || [];

    const seg = `<div class="seg ai-seg" role="group" aria-label="기간 선택">${Object.entries(PERIODS).map(([k, p]) => `<button type="button" data-act="aiPeriod" data-v="${k}" aria-pressed="${k === period}">${p.label}</button>`).join('')}</div>`;
    const payload = JSON.stringify(samplePayload(daily[daily.length - 1]), null, 2);

    return `<div class="view-head"><div><h2>AI 사용 모니터링</h2><p>보고 스킬 <code>ai-usage-report</code> v0.1이 매시 정각 수집해 <code>POST /api/ai-usage</code>로 보냅니다. 수집 경로가 없는 항목은 <b>미확인</b>으로 두고 숫자를 지어내지 않습니다.</p></div>${seg}</div>
      ${guide('watch', `오늘 수집 ${received.length}/17회 · 다음 ${nextTxt}`, '01시~07시에는 수집하지 않고 08시 보고에 묶어 보냅니다. 위 일·주·월 버튼으로 기간을 바꾸면 아래 숫자가 모두 함께 바뀝니다.')}

      <div class="ai-kpis">
        <section class="panel ai-kpi"><div class="small muted">${P.kpi} 토큰 · Claude ${badge('측정')}</div><div class="v num">${M(tot)}<small>M</small></div><div class="small muted">입력 ${M(cur.in)}M · 출력 ${M(cur.out)}M ${delta(tot, prev.in + prev.out)}</div></section>
        <section class="panel ai-kpi"><div class="small muted">${P.kpi} 비용 · Claude ${badge('측정')}</div><div class="v num">${won(cur.usd * RATE)}<small>원</small></div><div class="small muted">$${cur.usd.toFixed(2)} × ${won(RATE)}원 ${delta(cur.usd, prev.usd)}</div></section>
        <section class="panel ai-kpi"><div class="small muted">${P.kpi} 호출 · Claude ${badge('측정')}</div><div class="v num">${won(cur.calls)}<small>회</small></div><div class="small muted">${P.prev} ${won(prev.calls)}회 ${delta(cur.calls, prev.calls)}</div></section>
        <section class="panel ai-kpi"><div class="small muted">ChatGPT · Gemini ${badge('미확인')}</div><div class="v num">—</div><div class="small muted">관리자 키 확인 전(§8-4)</div></section>
      </div>

      <section class="panel"><h3>AI별 사용량 · ${P.kpi}</h3>
        <div class="tbl-wrap"><table class="ai-prov"><thead><tr><th>AI</th><th class="r">입력 토큰</th><th class="r">출력 토큰</th><th class="r">비용(원)</th><th>근거</th></tr></thead><tbody>
          ${PROVIDERS.map((p) => p.measured
            ? `<tr><td data-l="AI"><b>${p.name}</b><div class="small muted">${p.sub}</div></td><td data-l="입력" class="r num">${M(cur.in)}M</td><td data-l="출력" class="r num">${M(cur.out)}M</td><td data-l="비용" class="r num">${won(cur.usd * RATE)}원<div class="small muted">$${cur.usd.toFixed(2)}</div></td><td data-l="근거">${badge('측정')}</td></tr>`
            : `<tr class="unk"><td data-l="AI"><b>${p.name}</b><div class="small muted">${p.sub}</div></td><td data-l="입력" class="r num muted">—</td><td data-l="출력" class="r num muted">—</td><td data-l="비용" class="r num muted">—</td><td data-l="근거">${badge('미확인')}<div class="small muted">${p.why}</div></td></tr>`).join('')}
        </tbody></table></div>
        <p class="small muted ai-note">claude.ai 구독 채팅 토큰은 화면에 노출되지 않아 위 Claude 수치에 포함하지 않았습니다(미확인). 원화는 가정 환율 ${won(RATE)}원/$ 기준.</p>
      </section>

      <section class="panel"><h3>토큰 추이 · ${P.trend} · Claude ${badge('측정')}<span class="ai-legend"><i class="li"></i>입력<i class="lo"></i>출력</span></h3>
        <div class="ai-chart ${bk.length > 10 ? 'dense' : ''}" role="group" aria-label="${P.trend} 토큰 추이, 막대를 누르면 자세히">
          <div class="ai-yaxis num"><span>${M(maxT, 1)}M</span><span>${M(maxT / 2, 1)}M</span><span>0</span></div>
          <div class="ai-cols">${bk.map((b, i) => {
            const t = b.in + b.out; const h = (t / maxT) * 100; const ho = (b.out / t) * 100;
            return `<button type="button" class="ai-col ${i === pick ? 'on' : ''} ${b.partial ? 'partial' : ''}" data-act="aiPick" data-v="${i}" aria-pressed="${i === pick}" aria-label="${esc(b.full)} 합계 ${M(t)}M 토큰" title="${esc(b.full)} · ${M(t)}M"><span class="stack" style="height:${h.toFixed(1)}%"><span class="o" style="height:${ho.toFixed(1)}%"></span></span><span class="lb">${esc(b.label)}</span></button>`;
          }).join('')}</div>
        </div>
        <div class="ai-pick"><b>${esc(sel.full)}</b><span>입력 <b class="num">${M(sel.in)}M</b></span><span>출력 <b class="num">${M(sel.out)}M</b></span><span>비용 <b class="num">${won(sel.usd * RATE)}원</b> <span class="muted">($${sel.usd.toFixed(2)})</span></span><span>호출 <b class="num">${won(sel.calls)}회</b></span></div>
        ${period === 'month' ? '<p class="small muted ai-note">* 이번 달은 진행 중이라 합계가 작게 보입니다.</p>' : ''}
      </section>

      <div class="grid2">
        <section class="panel"><h3>기능별 사용 빈도 · ${P.kpi} ${badge('추정')}</h3>
          <div class="ai-feat">${fShare.map((f) => {
            const n = Math.round(cur.calls * f.share / 100);
            return `<div class="barrow"><span>${esc(f.name)}</span><div class="bar est"><i style="width:${Math.min(100, f.share / Math.max(...fShare.map((x) => x.share)) * 100).toFixed(0)}%"></i></div><span class="num r">${won(n)}회</span></div>`;
          }).join('')}</div>
          <p class="small muted ai-note">Claude 호출 ${won(cur.calls)}회를 도구 호출 유형(스킬·커넥터·채팅·코드·에이전트)으로 나눈 추정치. ChatGPT·Gemini 기능별 빈도는 ${badge('미확인')}</p>
        </section>
        <section class="panel"><h3>수집 스케줄 · 오늘</h3>
          <p class="small muted ai-note" style="margin-top:0"><code>${CRON}</code> · 하루 17회 · 01:00~07:59 실행 안 함</p>
          <div class="ai-hours" aria-label="시간대별 실행 여부">${Array.from({ length: 24 }, (_, h) => {
            const run = RUN_HOURS.includes(h); const done = run && h <= nowH;
            const st = !run ? '쉼' : done ? '수신' : '예정';
            return `<div class="${!run ? 'off' : done ? 'done' : 'plan'}" title="${h}시 ${st}"><b>${h}</b><span>${st}</span></div>`;
          }).join('')}</div>
          <div class="ai-legend2 small"><span><i class="done"></i>수신(목업)</span><span><i class="plan"></i>예정</span><span><i class="off"></i>쉼</span></div>
        </section>
      </div>

      <div class="grid2">
        <section class="panel"><h3>상위 스킬 Top 10 · ${P.kpi} ${badge('측정')}</h3>
          <ol class="ai-skills">${skills.map(([name, n], i) => `<li><span class="rk num">${i + 1}</span><span class="nm">${esc(name)}</span><span class="bar"><i style="width:${(skMax ? n / skMax * 100 : 0).toFixed(0)}%"></i></span><span class="num r">${won(n)}회</span></li>`).join('')}</ol>
        </section>
        <section class="panel"><h3>수집 경로 점검</h3>
          <ul class="ai-paths">${(S.providers || []).map((p) => `<li><div class="row" style="justify-content:space-between"><b>${esc(p.name)}</b>${badge(p.status)}</div><div class="small">${esc(p.path)}</div><div class="small muted">${esc(p.note)}</div></li>`).join('')}</ul>
        </section>
      </div>

      <details class="panel ai-dev" id="aiDev" ${S.ui.aiDev ? 'open' : ''}>
        <summary><span><b>개발자용</b> · 보고 스킬 전송 데이터 형식 (ai-usage-report v0.1)</span><span class="small muted ai-dev-hint">눌러서 펼치기</span></summary>
        <div class="ai-dev-body">
          <p class="small">요청: <code>POST /api/ai-usage</code> · 헤더 <code>Authorization: Bearer &lt;INGEST_TOKEN&gt;</code> · <code>Content-Type: application/json</code><br>응답: <code>202 {"ok":true}</code> · 토큰 불일치 <code>401</code> · 형식 오류 <code>422</code>. 같은 <code>window.to</code>로 다시 보내면 덮어씀(중복 방지).</p>
          <div class="row ai-dev-bar"><span class="small muted">JSON 예시 — 값은 목업이며 실제 키·토큰은 넣지 않습니다.</span><button type="button" class="btn sm" data-act="aiCopyJson">JSON 복사</button></div>
          <pre class="ai-json"><code>${highlight(payload)}</code></pre>
          <div class="tbl-wrap"><table class="ai-fields"><thead><tr><th>필드</th><th>형식</th><th>설명</th></tr></thead><tbody>${FIELD_DOCS.map((f) => `<tr><td data-l="필드"><code>${esc(f[0])}</code></td><td data-l="형식" class="small">${esc(f[1])}</td><td data-l="설명" class="small">${esc(f[2])}</td></tr>`).join('')}</tbody></table></div>
        </div>
      </details>`;
  }

  /* ---------- 동작 ---------- */
  APP.acts.aiPeriod = (el) => { S.ui.aiPeriod = el.dataset.v; S.ui.aiPick = null; };
  APP.acts.aiPick = (el) => { S.ui.aiPick = +el.dataset.v; };
  const selectJson = () => setTimeout(() => { const el = document.querySelector('.ai-json'); if (!el) return; const r = document.createRange(); r.selectNodeContents(el); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); }, 0);
  APP.acts.aiCopyJson = () => {
    const txt = JSON.stringify(samplePayload(ensureExtra().daily.slice(-1)[0]), null, 2);
    const ok = () => toast('JSON 예시를 복사했습니다');
    try {
      if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(txt).then(ok, () => (toast('복사하지 못했습니다. 선택해 둔 JSON을 Ctrl+C로 복사해 주세요'), selectJson()));
      else {
        const ta = document.createElement('textarea'); ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select(); const r = document.execCommand('copy'); ta.remove();
        r ? ok() : (toast('복사하지 못했습니다. 선택해 둔 JSON을 Ctrl+C로 복사해 주세요'), selectJson());
      }
    } catch (e) { (toast('복사하지 못했습니다. 선택해 둔 JSON을 Ctrl+C로 복사해 주세요'), selectJson()); }
  };
  // 개발자 영역 펼침 상태 기억(다시 그려도 유지). toggle은 버블링되지 않아 캡처로 받는다.
  document.addEventListener('toggle', (e) => { if (e.target && e.target.id === 'aiDev') { S.ui.aiDev = e.target.open; APP.save(); } }, true);

  APP.views.ai = viewAI;
})();
