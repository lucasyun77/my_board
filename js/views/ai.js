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
  const T = (n, dp) => n >= 1e6 ? M(n, dp) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(n >= 1e5 ? 0 : 1) + 'K' : String(Math.round(n));
  const M = (n, dp = 2) => (n / 1e6).toFixed(n >= 1e8 ? 0 : n >= 1e7 ? 1 : dp);
  const hash = (s) => { let h = 7; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
  const monthKey = (iso) => iso.slice(0, 7);

  function buckets(daily, period) {
    if (period === 'day') return daily.slice(-14).map((r) => ({ label: md(r.date), full: r.date, ...sum([r]) }));
    if (period === 'week') {
      const out = [];
      if (daily.length < 7) return [{ label: md(daily[0].date) + '~', full: `${daily[0].date} ~ ${daily[daily.length - 1].date}`, ...sum(daily) }];
      for (let w = Math.min(7, Math.floor(daily.length / 7) - 1); w >= 0; w--) {
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


  /* ---------- 실데이터(Claude): Claude Code Remote 커넥터로 세션 기록을 읽어 집계 ----------
     claude.ai 아티팩트에서 열었을 때만 동작(window.claude.use('mcp')). 이 저장소의 index.html을
     그냥 열면 조사 버튼은 안내만 보여 주고 샘플 화면을 유지한다. 토큰·비용은 각 턴의
     model_usage_since_last_result(정가 기준 costUSD)를 더한 값이다. */
  const SV = 'Claude Code Remote';
  const KST = 9 * 3600e3;
  const kstDate = (ms) => new Date(ms + KST).toISOString().slice(0, 10);
  const kstStart = (ms) => Date.parse(kstDate(ms) + 'T00:00:00Z') - KST;
  if (window.AI_REAL_SNAPSHOT && (!S.aiReal || (S.aiReal.collected_at || '') < (window.AI_REAL_SNAPSHOT.collected_at || ''))) S.aiReal = JSON.parse(JSON.stringify(window.AI_REAL_SNAPSHOT));
  const realOn = () => !!(S.aiReal && Array.isArray(S.aiReal.daily) && S.aiReal.daily.length && !S.ui.aiShowMock);
  const realDaily = () => S.aiReal.daily.map((r) => ({ date: r.date, input_tokens: r.input_tokens || 0, output_tokens: r.output_tokens || 0, cost_usd: r.cost_usd || 0, calls: r.turns || 0 }));
  const unwrap = (res) => { let p = res && (res.payload !== undefined ? res.payload : res.structuredContent !== undefined ? res.structuredContent : (res.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('')); if (typeof p === 'string') { try { p = JSON.parse(p); } catch (e) { return {}; } } return (p && p.ccr) || p || {}; };
  const scanMsg = (t) => { const el = document.getElementById('aiScanMsg'); if (el) el.textContent = t; };
  const ERR = { needs_reauth: 'Claude Code Remote 커넥터를 다시 연결해 주세요(claude.ai 설정 → 커넥터).', server_not_connected: 'Claude Code Remote 커넥터가 연결돼 있지 않습니다(claude.ai 설정 → 커넥터).', not_in_manifest: '이 페이지에서 커넥터 사용을 허용하지 않았습니다. 페이지 권한 메뉴에서 허용해 주세요.', approval_required: '커넥터 사용 승인이 필요합니다. 다시 눌러 승인해 주세요.', consent_required: '커넥터 사용 승인이 필요합니다. 다시 눌러 승인해 주세요.', blocked_by_policy: '조직 정책으로 이 커넥터를 쓸 수 없습니다.', not_granted: '이 화면에서는 커넥터를 쓸 수 없습니다.', capability_disabled: '이 화면에서는 커넥터를 쓸 수 없습니다.' };
  const errText = (e) => ERR[e && e.code] || ('조사 중 오류: ' + ((e && (e.code || e.message)) || e));

  async function scanToday() {
    const mcp = window.claude && typeof window.claude.use === 'function' ? await window.claude.use('mcp') : null;
    if (!mcp) throw { code: 'no_mcp' };
    const call = async (tool, input) => { try { return unwrap(await mcp.callTool(SV, tool, input, { cache: false })); } catch (e) { if (e && e.retryable) { await new Promise((r) => setTimeout(r, (e.retryAfterMs || 1500) + Math.random() * 500)); return unwrap(await mcp.callTool(SV, tool, input, { cache: false })); } throw e; } };
    const now = Date.now(); const start = kstStart(now); const today = kstDate(now);
    scanMsg('세션 목록을 읽는 중…');
    const seen = new Map();
    const addSessions = async (base) => { let after; for (let i = 0; i < 5; i++) { const d = await call('list_sessions', Object.assign({ limit: 100 }, base, after ? { after_id: after } : {})); (d.data || []).forEach((x) => seen.set(x.id, x)); if (!d.has_more && (d.data || []).length < 100) break; after = d.last_id; if (!after) break; } };
    await addSessions({ mine: true });
    try { await addSessions({ tags: ['cowork-local', 'cowork-remote'] }); } catch (e) { /* Cowork 목록은 못 읽어도 계속 */ }
    const sessions = [...seen.values()].filter((x) => Date.parse(x.updated_at || x.created_at || 0) >= start);
    const day = { date: today, input_tokens: 0, input_uncached: 0, cache_read: 0, cache_write: 0, output_tokens: 0, cost_usd: 0, turns: 0, sessions: 0 };
    const feat = { chat: 0, code: 0, skill: 0, connector: 0, agent: 0 }; const skills = {}; const bySess = []; const byModel = {};
    const CODE = ['Bash', 'Edit', 'Write', 'Read', 'Grep', 'Glob', 'NotebookEdit', 'MultiEdit'];
    let partial = false;
    for (let si = 0; si < sessions.length; si++) {
      const ss = sessions[si]; let before; const row = { title: ss.title || '(제목 없음)', turns: 0, input_tokens: 0, output_tokens: 0, cost_usd: 0 }; const tu = new Set();
      for (let pg = 0; pg < 120; pg++) {
        scanMsg(`세션 ${si + 1}/${sessions.length} 「${row.title}」 기록 읽는 중… (${pg + 1}쪽)`);
        const d = await call('list_events', Object.assign({ session_id: ss.id, kinds: ['result', 'assistant'], limit: 100 }, before ? { before_id: before } : {}));
        let older = false;
        for (const ev of d.data || []) {
          const t = Date.parse(ev.created_at || 0); if (t < start) { older = true; continue; }
          if (ev.result) {
            const mu = (ev.result.internal_anthropic_catchall || {}).model_usage_since_last_result || {};
            row.turns++; day.turns++;
            for (const [m, u] of Object.entries(mu)) {
              const inp = (u.inputTokens || 0) + (u.cacheCreationInputTokens || 0) + (u.cacheReadInputTokens || 0);
              day.input_tokens += inp; day.input_uncached += u.inputTokens || 0; day.cache_read += u.cacheReadInputTokens || 0; day.cache_write += u.cacheCreationInputTokens || 0;
              day.output_tokens += u.outputTokens || 0; day.cost_usd += u.costUSD || 0;
              row.input_tokens += inp; row.output_tokens += u.outputTokens || 0; row.cost_usd += u.costUSD || 0;
              const bm = byModel[m] = byModel[m] || { input_tokens: 0, output_tokens: 0, cost_usd: 0 }; bm.input_tokens += inp; bm.output_tokens += u.outputTokens || 0; bm.cost_usd += u.costUSD || 0;
            }
          } else if (ev.assistant) {
            const msg = (ev.assistant.internal_anthropic_catchall || {}).message || {};
            for (const b of msg.content || []) {
              if (!b || b.type !== 'tool_use' || tu.has(b.id)) continue; tu.add(b.id);
              const n = String(b.name || '');
              if (n === 'Skill') { feat.skill++; const k = (b.input && (b.input.skill || b.input.name)) || '(이름 없음)'; skills[k] = (skills[k] || 0) + 1; }
              else if (n.startsWith('mcp__claude-code-remote__') || ['Agent', 'Task', 'Workflow'].includes(n)) feat.agent++;
              else if (n.startsWith('mcp__')) feat.connector++;
              else if (CODE.includes(n)) feat.code++;
            }
          }
        }
        if (older || !d.has_more || !d.first_id) break;
        if (pg === 119) partial = true;
        before = d.first_id;
      }
      if (row.turns) { bySess.push(row); day.sessions++; }
    }
    feat.chat = day.turns;
    day.cost_usd = +day.cost_usd.toFixed(4);
    const R = S.aiReal || { daily: [], notes: [] };
    R.daily = (R.daily || []).filter((r) => r.date !== today).concat([day]).sort((a, b) => a.date < b.date ? -1 : 1).slice(-60);
    R.collected_at = new Date(now + KST).toISOString().slice(0, 19) + '+09:00';
    R.scope = 'Claude Code 클라우드·Cowork 세션(이 계정)';
    R.sessions_scanned = sessions.length; R.today_date = today; R.today_features = feat;
    R.today_skills = Object.entries(skills).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
    R.by_session_today = bySess.sort((a, b) => b.cost_usd - a.cost_usd); R.by_model_today = byModel; R.partial = partial; R.source = '오늘 조사 버튼';
    S.aiReal = R; S.ui.aiShowMock = false;
    return day;
  }
  const rerender = () => { const v = document.getElementById('view'); if (v && location.hash === '#ai') v.innerHTML = viewAI(); APP.save(); };

  /* ---------- 화면 ---------- */
  function usageView() {
    const X = ensureExtra();
    const real = realOn() ? S.aiReal : null;
    const daily = real ? realDaily() : X.daily;
    const isToday = real && real.today_date === kstDate(Date.now());
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
    const maxT = Math.max(1, ...bk.map((b) => b.in + b.out));
    const skills = real ? (isToday ? (real.today_skills || []).slice(0, 10).map((x) => [x.name, x.count]) : []) : topSkills(period);
    const skMax = skills[0] ? skills[0][1] : 1;
    const fShare = S.features || [];
    const FNAME = { chat: '채팅(턴)', code: '코드', skill: '스킬', connector: '커넥터', agent: '에이전트' };
    const rf = real && isToday && real.today_features ? Object.entries(real.today_features).map(([k, n]) => ({ name: FNAME[k] || k, n })) : null;
    const rfMax = rf ? Math.max(1, ...rf.map((x) => x.n || 0)) : 1;
    const scan = S.ui.aiScanState || {};
    const realPanel = `<section class="panel ai-real ${real ? 'on' : ''}" aria-live="polite">
        <div class="ai-real-head"><div><h3 style="margin:0">${real ? 'Claude 실데이터 표시 중' : '지금은 샘플(목업) 데이터입니다'} ${real ? badge('측정') : badge('미확인')}</h3>
          <p class="small muted" style="margin:4px 0 0">${real ? `마지막 조사 ${esc((real.collected_at || '').replace('T', ' ').slice(0, 16))} · ${esc(real.scope || '')} · 세션 ${won(real.sessions_scanned || 0)}개 확인${real.partial ? ' · 일부 세션은 기록이 많아 앞부분만 읽음' : ''}` : '아래 숫자는 화면 구성을 보여 주는 샘플입니다. 「오늘 조사」를 누르면 회장님 계정의 Claude 사용 기록을 읽어 바꿉니다.'}</p></div>
          <div class="row"><button type="button" class="btn primary" data-act="aiScan" ${scan.running ? 'disabled' : ''}>${scan.running ? '조사 중…' : '오늘 조사'}</button>${S.aiReal ? `<button type="button" class="btn sm" data-act="aiToggleMock">${real ? '샘플 보기' : '실데이터 보기'}</button>` : ''}</div></div>
        <p class="small ai-scan-msg" id="aiScanMsg">${esc(scan.msg || '')}</p>
        ${real && isToday && (real.by_session_today || []).length ? `<details class="ai-sess"><summary class="small">오늘 세션별 내역 ${(real.by_session_today || []).length}개 보기</summary><div class="tbl-wrap"><table class="ai-prov"><thead><tr><th>세션</th><th class="r">턴</th><th class="r">입력</th><th class="r">출력</th><th class="r">비용</th></tr></thead><tbody>${real.by_session_today.map((r) => `<tr><td data-l="AI">${esc(r.title)}</td><td data-l="턴" class="r num">${won(r.turns)}</td><td data-l="입력" class="r num">${T(r.input_tokens)}</td><td data-l="출력" class="r num">${T(r.output_tokens)}</td><td data-l="비용" class="r num">${won(r.cost_usd * RATE)}원</td></tr>`).join('')}</tbody></table></div></details>` : ''}
        ${real ? '<p class="small muted ai-note">비용은 Claude 정가(API 단가) 기준 환산값이라 실제 구독 청구액과 다릅니다. 입력 토큰에는 캐시 읽기·쓰기가 포함됩니다. claude.ai 채팅·Claude Code 로컬(PC) 사용분은 이 경로로 읽을 수 없어 빠져 있습니다.</p>' : ''}
      </section>`;

    const seg = `<div class="seg ai-seg" role="group" aria-label="기간 선택">${Object.entries(PERIODS).map(([k, p]) => `<button type="button" data-act="aiPeriod" data-v="${k}" aria-pressed="${k === period}">${p.label}</button>`).join('')}</div>`;
    const payload = JSON.stringify(samplePayload(daily[daily.length - 1]), null, 2);

    return `<div class="ai-tabtop"><p class="small muted">보고 스킬 <code>ai-usage-report</code> v0.1이 매시 정각 수집해 <code>POST /api/ai-usage</code>로 보내는 구조입니다. 수집 경로가 없는 항목은 <b>미확인</b>으로 둡니다.</p>${seg}</div>
      ${realPanel}
      ${real ? '' : guide('watch', `오늘 수집 ${received.length}/17회 · 다음 ${nextTxt}`, '01시~07시에는 수집하지 않고 08시 보고에 묶어 보냅니다. 위 일·주·월 버튼으로 기간을 바꾸면 아래 숫자가 모두 함께 바뀝니다.')}

      <div class="ai-kpis">
        <section class="panel ai-kpi"><div class="small muted">${P.kpi} 토큰 · Claude ${badge('측정')}</div><div class="v num">${M(tot)}<small>M</small></div><div class="small muted">입력 ${T(cur.in)} · 출력 ${T(cur.out)} ${delta(tot, prev.in + prev.out)}</div></section>
        <section class="panel ai-kpi"><div class="small muted">${P.kpi} 비용 · Claude ${badge('측정')}</div><div class="v num">${won(cur.usd * RATE)}<small>원</small></div><div class="small muted">$${cur.usd.toFixed(2)} × ${won(RATE)}원 ${delta(cur.usd, prev.usd)}</div></section>
        <section class="panel ai-kpi"><div class="small muted">${P.kpi} ${real ? '대화 턴' : '호출'} · Claude ${badge('측정')}</div><div class="v num">${won(cur.calls)}<small>회</small></div><div class="small muted">${P.prev} ${won(prev.calls)}회 ${delta(cur.calls, prev.calls)}</div></section>
        <section class="panel ai-kpi"><div class="small muted">ChatGPT · Gemini ${badge('미확인')}</div><div class="v num">—</div><div class="small muted">관리자 키 확인 전(§8-4)</div></section>
      </div>

      <section class="panel"><h3>AI별 사용량 · ${P.kpi}</h3>
        <div class="tbl-wrap"><table class="ai-prov"><thead><tr><th>AI</th><th class="r">입력 토큰</th><th class="r">출력 토큰</th><th class="r">비용(원)</th><th>근거</th></tr></thead><tbody>
          ${PROVIDERS.map((p) => p.measured
            ? `<tr><td data-l="AI"><b>${p.name}</b><div class="small muted">${p.sub}</div></td><td data-l="입력" class="r num">${T(cur.in)}</td><td data-l="출력" class="r num">${T(cur.out)}</td><td data-l="비용" class="r num">${won(cur.usd * RATE)}원<div class="small muted">$${cur.usd.toFixed(2)}</div></td><td data-l="근거">${badge('측정')}</td></tr>`
            : `<tr class="unk"><td data-l="AI"><b>${p.name}</b><div class="small muted">${p.sub}</div></td><td data-l="입력" class="r num muted">—</td><td data-l="출력" class="r num muted">—</td><td data-l="비용" class="r num muted">—</td><td data-l="근거">${badge('미확인')}<div class="small muted">${p.why}</div></td></tr>`).join('')}
        </tbody></table></div>
        <p class="small muted ai-note">claude.ai 구독 채팅 토큰은 화면에 노출되지 않아 위 Claude 수치에 포함하지 않았습니다(미확인). 원화는 가정 환율 ${won(RATE)}원/$ 기준.${real ? ` 실데이터는 ${won(daily.length)}일치만 있어 그 이전은 비어 있습니다.` : ''}</p>
      </section>

      <section class="panel"><h3>토큰 추이 · ${P.trend} · Claude ${badge('측정')}<span class="ai-legend"><i class="li"></i>입력<i class="lo"></i>출력</span></h3>
        <div class="ai-chart ${bk.length > 10 ? 'dense' : ''}" role="group" aria-label="${P.trend} 토큰 추이, 막대를 누르면 자세히">
          <div class="ai-yaxis num"><span>${T(maxT, 1)}</span><span>${T(maxT / 2, 1)}</span><span>0</span></div>
          <div class="ai-cols">${bk.map((b, i) => {
            const t = b.in + b.out; const h = (t / maxT) * 100; const ho = t ? (b.out / t) * 100 : 0;
            return `<button type="button" class="ai-col ${i === pick ? 'on' : ''} ${b.partial ? 'partial' : ''}" data-act="aiPick" data-v="${i}" aria-pressed="${i === pick}" aria-label="${esc(b.full)} 합계 ${T(t)} 토큰" title="${esc(b.full)} · ${T(t)}"><span class="stack" style="height:${h.toFixed(1)}%"><span class="o" style="height:${ho.toFixed(1)}%"></span></span><span class="lb">${esc(b.label)}</span></button>`;
          }).join('')}</div>
        </div>
        <div class="ai-pick"><b>${esc(sel.full)}</b><span>입력 <b class="num">${T(sel.in)}</b></span><span>출력 <b class="num">${T(sel.out)}</b></span><span>비용 <b class="num">${won(sel.usd * RATE)}원</b> <span class="muted">($${sel.usd.toFixed(2)})</span></span><span>${real ? '턴' : '호출'} <b class="num">${won(sel.calls)}회</b></span></div>
        ${period === 'month' ? `<p class="small muted ai-note">* 이번 달은 진행 중이라 합계가 작게 보입니다.${real ? ' 조사 시작 전 달은 일부만 들어 있습니다.' : ''}</p>` : ''}
      </section>

      <div class="grid2">
        <section class="panel"><h3>기능별 사용 빈도 · ${real ? '오늘' : P.kpi} ${real ? (rf ? badge('측정') : badge('미확인')) : badge('추정')}</h3>
          ${real ? (rf ? `<div class="ai-feat">${rf.map((f) => f.n == null ? `<div class="barrow"><span>${esc(f.name)}</span><span class="small muted">아직 안 셈 — 「오늘 조사」를 누르면 채워짐</span><span class="r">${badge('미확인')}</span></div>` : `<div class="barrow"><span>${esc(f.name)}</span><div class="bar"><i style="width:${(f.n / rfMax * 100).toFixed(0)}%;background:var(--gold)"></i></div><span class="num r">${won(f.n)}회</span></div>`).join('')}</div><p class="small muted ai-note">오늘 세션 기록의 도구 호출을 세었습니다(채팅=대화 턴 수). 주·월 단위 기능 빈도는 아직 모으지 않았습니다 ${badge('미확인')}</p>` : '<p class="muted">오늘 조사를 누르면 채워집니다.</p>') : `
          <div class="ai-feat">${fShare.map((f) => {
            const n = Math.round(cur.calls * f.share / 100);
            return `<div class="barrow"><span>${esc(f.name)}</span><div class="bar est"><i style="width:${Math.min(100, f.share / Math.max(...fShare.map((x) => x.share)) * 100).toFixed(0)}%"></i></div><span class="num r">${won(n)}회</span></div>`;
          }).join('')}</div>
          <p class="small muted ai-note">Claude 호출 ${won(cur.calls)}회를 도구 호출 유형(스킬·커넥터·채팅·코드·에이전트)으로 나눈 추정치. ChatGPT·Gemini 기능별 빈도는 ${badge('미확인')}</p>`}
        </section>
        <section class="panel"><h3>수집 스케줄 · 오늘</h3>
          <p class="small muted ai-note" style="margin-top:0"><code>${CRON}</code> · 하루 17회 · 01:00~07:59 실행 안 함</p>
          <div class="ai-hours" aria-label="시간대별 실행 여부">${Array.from({ length: 24 }, (_, h) => {
            const run = RUN_HOURS.includes(h); const done = run && h <= nowH;
            const st = !run ? '쉼' : done ? '수신' : '예정';
            return `<div class="${!run ? 'off' : done ? 'done' : 'plan'}" title="${h}시 ${st}"><b>${h}</b><span>${st}</span></div>`;
          }).join('')}</div>
          <div class="ai-legend2 small"><span><i class="done"></i>${real ? '수신 예정 시간대(보고 스킬 설치 전)' : '수신(목업)'}</span><span><i class="plan"></i>예정</span><span><i class="off"></i>쉼</span></div>
        </section>
      </div>

      <div class="grid2">
        <section class="panel"><h3>상위 스킬 Top 10 · ${real ? '오늘' : P.kpi} ${badge('측정')}</h3>
          ${real && !skills.length ? `<p class="muted">${isToday && real.today_features && real.today_features.skill != null ? '오늘 실행된 스킬이 없습니다.' : '아직 안 셌습니다. 「오늘 조사」를 누르면 채워집니다.'}</p>` : ''}
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


  /* ======================================================================
     관제탑(고도화): 공통 상태 · 받은 항목 · 활동 기록 · 탭
     ====================================================================== */
  S.activity = S.activity || []; S.inbox = S.inbox || [];
  S.aiBudget = S.aiBudget || { limit_krw: null, warn_pct: 80, spike_pct: 50, history: [] };
  S.aiAck = S.aiAck || {};
  S.aiSkillLink = S.aiSkillLink || {};
  const nowIso = () => new Date().toISOString();
  const logAct = (type, text, ref) => { S.activity.push({ id: APP.uid('act'), at: nowIso(), menu: 'ai', type, text, ref: ref || null }); if (S.activity.length > 300) S.activity.splice(0, S.activity.length - 300); };
  const TABS_AI = [['usage', '사용량'], ['budget', '예산·경보'], ['value', '효과'], ['guide', 'AI 추천']];

  /* 표시 중인 일별 시계열(실데이터 있으면 실데이터, 없으면 목업) */
  function series() {
    const real = realOn() ? S.aiReal : null;
    return { real, daily: real ? realDaily() : ensureExtra().daily };
  }

  /* ---------- P1: 예산·월말 예상·경보 ---------- */
  function budgetCalc() {
    const { real, daily } = series();
    const last = daily[daily.length - 1];
    const mk = last.date.slice(0, 7); const y = +mk.slice(0, 4); const m = +mk.slice(5, 7);
    const dim = new Date(y, m, 0).getDate(); const dom = +last.date.slice(8, 10);
    const mtd = sum(daily.filter((r) => r.date.startsWith(mk))).usd * RATE;
    const last7 = daily.slice(-7); const avg7 = (sum(last7).usd * RATE) / Math.max(1, last7.length);
    const proj = mtd + avg7 * (dim - dom);
    const w7 = sum(daily.slice(-7)).usd * RATE; const p7 = sum(daily.slice(-14, -7)).usd * RATE;
    const today = last.cost_usd * RATE; const prevDays = daily.slice(-8, -1); const avgPrev = (sum(prevDays).usd * RATE) / Math.max(1, prevDays.length);
    const B = S.aiBudget; const limit = B.limit_krw;
    return { real, daily, last, mk, m, dim, dom, mtd, avg7, proj, w7, p7, today, avgPrev, limit, B };
  }
  function budgetAlerts(c) {
    const out = []; const { B, limit } = c;
    if (limit) {
      if (c.mtd >= limit) out.push({ id: `lim100-${c.mk}`, lv: 'crit', title: `이번 달 AI 비용이 한도를 넘었습니다`, text: `${won(c.mtd)}원 / 한도 ${won(limit)}원 (${Math.round(c.mtd / limit * 100)}%)` });
      else if (c.mtd >= limit * B.warn_pct / 100) out.push({ id: `lim${B.warn_pct}-${c.mk}`, lv: 'warn', title: `이번 달 AI 비용이 한도의 ${B.warn_pct}%를 넘었습니다`, text: `${won(c.mtd)}원 / 한도 ${won(limit)}원 (${Math.round(c.mtd / limit * 100)}%)` });
      if (c.mtd < limit && c.proj >= limit) out.push({ id: `proj-${c.mk}`, lv: 'warn', title: '이 추세면 월말에 한도를 넘습니다', text: `월말 예상 ${won(c.proj)}원 — 한도보다 ${won(c.proj - limit)}원 많음` });
    }
    if (c.p7 > 0 && (c.w7 / c.p7 - 1) * 100 >= B.spike_pct) out.push({ id: `wk-${c.last.date}`, lv: 'warn', title: `최근 7일 비용이 직전 7일보다 ${Math.round((c.w7 / c.p7 - 1) * 100)}% 늘었습니다`, text: `${won(c.p7)}원 → ${won(c.w7)}원 (기준 +${B.spike_pct}%)` });
    if (c.avgPrev > 0 && c.today >= c.avgPrev * 2) out.push({ id: `day-${c.last.date}`, lv: 'warn', title: `오늘 비용이 최근 평균의 ${(c.today / c.avgPrev).toFixed(1)}배입니다`, text: `오늘 ${won(c.today)}원 · 직전 7일 하루 평균 ${won(c.avgPrev)}원` });
    return out;
  }
  const alertRow = (a, compact) => `<li class="ai-alert ${a.lv}"><div><b>${esc(a.title)}</b><div class="small">${esc(a.text)}</div></div>${compact ? '' : `<div class="row"><button type="button" class="btn sm" data-act="aiAlertToday" data-id="${a.id}">오늘 할 일로 보내기</button><button type="button" class="btn sm" data-act="aiAck" data-id="${a.id}">확인함</button></div>`}</li>`;

  function budgetView() {
    const c = budgetCalc(); const { B, limit } = c;
    const al = budgetAlerts(c); const open = al.filter((a) => !S.aiAck[a.id]); const done = al.filter((a) => S.aiAck[a.id]);
    const scale = limit ? Math.max(limit, c.proj, c.mtd) : 1; const at = (v) => (v / scale * 100).toFixed(1); // 한도를 넘어도 막대 안에서 보이게 눈금을 늘림
    const st = !limit ? ['미설정', ''] : c.mtd >= limit ? ['한도 초과', 'crit'] : c.mtd >= limit * B.warn_pct / 100 ? ['주의', 'warn'] : c.proj >= limit ? ['초과 예상', 'warn'] : ['정상', 'ok'];
    const src = c.real ? badge('측정') : '<span class="ai-mock">목업</span>';
    const wk = c.p7 > 0 ? `${c.w7 >= c.p7 ? '▲' : '▼'} ${Math.abs(Math.round((c.w7 / c.p7 - 1) * 100))}%` : '비교 불가(직전 7일 기록 없음)';
    const edit = !limit || S.ui.aiBudgetEdit;
    return `<section class="panel ai-budget"><h3>${c.m}월 Claude 비용 · 한도 ${src}<span class="ai-st ${st[1]}">${st[0]}</span></h3>
        <div class="ai-bnums">
          <div><div class="small muted">이번 달 누적 ${src}</div><div class="v num">${won(c.mtd)}<small>원</small></div><div class="small muted">${c.dom}일 지남 / ${c.dim}일</div></div>
          <div><div class="small muted">월말 예상 ${badge('추정')}</div><div class="v num">${won(c.proj)}<small>원</small></div><div class="small muted">최근 7일 하루 평균 ${won(c.avg7)}원 × 남은 ${c.dim - c.dom}일 + 누적</div></div>
          <div><div class="small muted">월 한도 ${badge('수기')}</div><div class="v num">${limit ? won(limit) + '<small>원</small>' : '—'}</div><div class="small muted">${limit ? `경보 ${B.warn_pct}% · 100%` : '아직 정하지 않음'}</div></div>
        </div>
        ${limit ? `<div class="ai-meter" role="img" aria-label="한도 대비 누적 ${Math.round(c.mtd / limit * 100)}%, 월말 예상 ${Math.round(c.proj / limit * 100)}%"><i class="fill ${st[1]}" style="width:${at(c.mtd)}%"></i><i class="proj" style="width:${at(c.proj)}%"></i><b class="mk" style="left:${at(limit * B.warn_pct / 100)}%"></b><b class="mk lim" style="left:calc(${at(limit)}% - 2px)"></b></div>
          <div class="ai-meter-lb small muted"><span class="z">0</span>${at(limit) - at(limit * B.warn_pct / 100) >= 9 ? `<span class="c" style="left:${at(limit * B.warn_pct / 100)}%">${B.warn_pct}%</span>` : ''}<span class="c lim" style="left:${at(limit)}%">한도</span>${c.proj > limit && 100 - at(limit) >= 14 ? '<span class="e">월말 예상</span>' : ''}</div>
          <p class="small muted ai-note">진한 막대 = 지금까지, 줄무늬 = 월말 예상(추정). 실데이터 기간이 짧으면 예상이 크게 흔들립니다.</p>` : '<p class="ai-cta">월 한도를 정하면 80%·100% 도달과 월말 초과 예상을 알려 드립니다.</p>'}
        ${edit ? `<form class="form ai-bform" data-form="aiBudget">
          <label class="f">월 한도(원)<input type="number" name="limit" min="1000" step="1000" inputmode="numeric" required value="${limit || ''}" placeholder="예: 300000"></label>
          <label class="f">주의 경보(%)<input type="number" name="warn" min="30" max="99" value="${B.warn_pct}"></label>
          <label class="f">급증 기준(직전 7일 대비 +%)<input type="number" name="spike" min="10" max="500" value="${B.spike_pct}"></label>
          <div class="row"><button class="btn primary">저장</button>${limit ? '<button type="button" class="btn" data-act="aiBudgetEdit" data-v="0">취소</button>' : ''}</div></form>` : '<div class="row" style="margin-top:12px"><button type="button" class="btn" data-act="aiBudgetEdit" data-v="1">한도·경보 기준 바꾸기</button></div>'}
      </section>
      <div class="grid2 ai-top">
        <section class="panel"><h3>이상 사용 경보 ${open.length ? `<span class="ai-cnt">${open.length}</span>` : ''}</h3>
          ${open.length ? `<ul class="ai-alerts">${open.map((a) => alertRow(a)).join('')}</ul>` : '<p class="muted">지금 확인할 경보가 없습니다.</p>'}
          ${done.length ? `<details class="ai-sess"><summary class="small">확인한 경보 ${done.length}개</summary><ul class="ai-alerts">${done.map((a) => alertRow(a, true)).join('')}</ul></details>` : ''}
          <p class="small muted ai-note">기준: 한도 ${B.warn_pct}%·100% 도달, 월말 초과 예상, 최근 7일이 직전 7일보다 +${B.spike_pct}% 이상, 오늘이 최근 하루 평균의 2배 이상.</p>
        </section>
        <section class="panel"><h3>주간 비교 ${src}</h3>
          <div class="ai-wk"><div><span class="small muted">직전 7일</span><b class="num">${won(c.p7)}원</b></div><div><span class="small muted">최근 7일</span><b class="num">${won(c.w7)}원</b></div><div><span class="small muted">변화</span><b class="num">${wk}</b></div></div>
          <h4 class="ai-h4">AI별 한도</h4>
          <ul class="ai-paths"><li><div class="row" style="justify-content:space-between"><b>Claude</b>${src}</div><div class="small">위 한도가 적용됩니다.</div></li>
            <li><div class="row" style="justify-content:space-between"><b>ChatGPT</b>${badge('미확인')}</div><div class="small muted">비용 수집 경로가 없어 한도·경보를 걸 수 없습니다(관리자 키 확인 전).</div></li>
            <li><div class="row" style="justify-content:space-between"><b>Gemini</b>${badge('미확인')}</div><div class="small muted">비용 수집 경로가 없어 한도·경보를 걸 수 없습니다(관리자 키 확인 전).</div></li></ul>
          ${(B.history || []).length ? `<details class="ai-sess"><summary class="small">한도 변경 이력 ${B.history.length}건</summary><ul class="ai-hist small">${B.history.slice(-8).reverse().map((h) => `<li>${esc(h.at.slice(0, 16).replace('T', ' '))} · 한도 ${h.limit ? won(h.limit) + '원' : '—'} · 주의 ${h.warn}% · 급증 +${h.spike}%</li>`).join('')}</ul></details>` : ''}
        </section>
      </div>`;
  }


  /* ---------- P2: AI 효과 배수 · 스킬별 가치 ---------- */
  const AI_TYPES = ['ai', 'code', 'ai_code'];
  const isAiWork = (a) => AI_TYPES.includes(a.output_type) || !!a.by_agent;
  const TYPE_NAME = { doc: '문서', ai: 'AI 고도화', code: '코드', ai_code: 'AI+코드' };
  const VPER = { month: '이번 달', d30: '최근 30일', all: '누적' };
  function skillOptions() {
    const set = new Set((S.topSkills || []).map((x) => x[0]));
    ((S.aiReal && S.aiReal.today_skills) || []).forEach((x) => set.add(x.name));
    Object.values(S.aiSkillLink).forEach((n) => n && set.add(n));
    return [...set].sort();
  }
  function skillUses(name) { // 표시 중인 데이터 기준 스킬 사용 횟수(실데이터는 오늘만, 목업은 30일)
    const real = realOn() ? S.aiReal : null;
    if (real) { const f = (real.today_skills || []).find((x) => x.name === name); return f ? { n: f.count, label: '오늘' } : null; }
    const f = topSkills('month').find((x) => x[0] === name); return f ? { n: f[1], label: '30일' } : null;
  }
  function valueView() {
    const { real, daily } = series();
    const per = VPER[S.ui.aiValPer] ? S.ui.aiValPer : 'month';
    const last = daily[daily.length - 1].date;
    const from = per === 'month' ? last.slice(0, 8) + '01' : per === 'd30' ? daily[Math.max(0, daily.length - 30)].date : '0000-00-00';
    const costRows = daily.filter((r) => r.date >= from);
    const cost = sum(costRows).usd * RATE;
    const done = (S.achievements || []).filter((a) => a.status === '확정' && (a.confirmed_at || a.date || '') >= from && (a.confirmed_at || a.date || '') <= last);
    const aiDone = done.filter(isAiWork);
    const vAll = done.reduce((t, a) => t + (a.value_won || 0), 0); const vAi = aiDone.reduce((t, a) => t + (a.value_won || 0), 0);
    const mult = cost > 0 ? vAi / cost : null;
    const src = real ? badge('측정') : '<span class="ai-mock">목업</span>';
    const costNote = per === 'all' ? `비용은 데이터가 있는 ${costRows[0] ? costRows[0].date : '—'} 이후만 합산` : `${from} ~ ${last}`;
    const seg = `<div class="seg ai-seg" role="group" aria-label="효과 기간">${Object.entries(VPER).map(([k, l]) => `<button type="button" data-act="aiValPer" data-v="${k}" aria-pressed="${k === per}">${l}</button>`).join('')}</div>`;
    // 스킬별 가치
    const by = {};
    aiDone.forEach((a) => { const k = S.aiSkillLink[a.id]; if (!k) return; const r = by[k] = by[k] || { name: k, v: 0, n: 0 }; r.v += a.value_won || 0; r.n++; });
    const rank = Object.values(by).sort((x, y) => y.v - x.v);
    const rMax = rank[0] ? rank[0].v : 1;
    const unlinked = aiDone.filter((a) => !S.aiSkillLink[a.id]).length;
    const opts = skillOptions();
    const pickFor = S.ui.aiPickFor;
    const ppList = (q) => { const qq = (q || '').toLowerCase(); return opts.filter((o) => o.toLowerCase().includes(qq)).slice(0, 8); };
    const picker = (a) => `<div class="ai-pp" data-id="${esc(a.id)}"><input id="aiPP" type="text" autocomplete="off" spellcheck="false" aria-label="스킬 이름 입력" placeholder="스킬 이름 입력 · ↑↓ Enter · Esc" value="" data-id="${esc(a.id)}" aria-controls="aiPPList" aria-autocomplete="list"><button type="button" class="btn sm" data-act="aiPPClose" aria-label="닫기">×</button><ul id="aiPPList" role="listbox">${ppList('').map((o, i) => `<li role="option" class="${i === 0 ? 'on' : ''}" data-act="aiPPPick" data-id="${esc(a.id)}" data-v="${esc(o)}">${esc(o)}</li>`).join('')}</ul></div>`;
    return `<div class="ai-tabtop"><p class="small muted">성과·레벨에서 <b>확정된</b> 가치를 같은 기간 AI 비용으로 나눠 봅니다. 쓴 돈 대비 무엇을 벌었는지 보는 숫자입니다.</p>${seg}</div>
      <section class="panel ai-mult"><h3>AI 효과 배수 · ${VPER[per]} ${badge('추정')}</h3>
        <div class="ai-bnums ai-bnums4">
          <div><div class="small muted">AI 관련 확정 가치 ${badge('추정')}</div><div class="v num">${won(vAi / 1000)}<small>천원</small></div><div class="small muted">${aiDone.length}건 · 전체 확정 ${won(vAll / 1000)}천원(${done.length}건)</div></div>
          <div><div class="small muted">같은 기간 Claude 비용 ${src}</div><div class="v num">${won(cost)}<small>원</small></div><div class="small muted">${esc(costNote)}</div></div>
          <div class="hl"><div class="small muted">효과 배수 ${badge('추정')}</div><div class="v num">${mult == null ? '—' : mult >= 100 ? won(mult) : mult.toFixed(1)}<small>${mult == null ? '' : '배'}</small></div><div class="small muted">${mult == null ? (cost > 0 ? '' : '비용 기록이 없어 계산 불가') : `AI에 1만 원 쓸 때 확정 가치 ${won(mult)}만 원`}</div></div>
        </div>
        <p class="small muted ai-note">AI 관련 = 결과물 종류가 AI 고도화·코드·AI+코드이거나 에이전트로 수행한 건. 확정 가치는 최대 12개월 효과를 미리 더한 값이라 같은 달 비용과 바로 맞대면 배수가 크게 나옵니다. ChatGPT·Gemini 비용은 ${badge('미확인')}이라 빠져 있습니다.${real ? '' : ' 지금 비용은 목업입니다.'}</p>
      </section>
      <div class="grid2 ai-top">
        <section class="panel"><h3>스킬별 가치 순위 · ${VPER[per]} ${badge('추정')}</h3>
          ${rank.length ? `<ol class="ai-skills">${rank.map((r, i) => { const u = skillUses(r.name); return `<li class="ai-vr"><span class="rk num">${i + 1}</span><span class="nm">${esc(r.name)}<span class="small muted"> · ${r.n}건${u ? ` · 사용 ${won(u.n)}회(${u.label})` : ''}</span></span><span class="bar"><i style="width:${(r.v / rMax * 100).toFixed(0)}%"></i></span><span class="num r">${won(r.v / 1000)}천원</span></li>`; }).join('')}</ol>` : '<p class="ai-cta">아래 확정 건에 쓰인 스킬을 연결하면 스킬별로 번 가치가 순위로 나옵니다.</p>'}
          <p class="small muted ai-note">스킬 1회당 가치·스킬별 비용은 스킬마다 비용을 나눠 모으는 경로가 없어 ${badge('미확인')}. ${unlinked ? `연결 안 된 AI 확정 건 ${unlinked}개.` : ''}</p>
        </section>
        <section class="panel"><h3>AI 관련 확정 건 · 스킬 연결 ${badge('수기')}</h3>
          ${aiDone.length ? `<ul class="ai-ach">${aiDone.sort((x, y) => (y.value_won || 0) - (x.value_won || 0)).map((a) => `<li><div class="t"><b>${esc(a.title)}</b><div class="small muted">${esc(TYPE_NAME[a.output_type] || a.output_type || '')}${a.by_agent ? ' · 에이전트' : ''} · 확정 ${esc(a.confirmed_at || '')} · <span class="num">${won((a.value_won || 0) / 1000)}천원</span></div></div>
            <div class="sk">${pickFor === a.id ? picker(a) : S.aiSkillLink[a.id] ? `<span class="ai-chip">${esc(S.aiSkillLink[a.id])}<button type="button" data-act="aiUnlink" data-id="${esc(a.id)}" aria-label="${esc(S.aiSkillLink[a.id])} 연결 해제">×</button></span><button type="button" class="btn sm" data-act="aiPPOpen" data-id="${esc(a.id)}">바꾸기</button>` : `<button type="button" class="btn sm" data-act="aiPPOpen" data-id="${esc(a.id)}">스킬 연결</button>`}</div></li>`).join('')}</ul>` : `<p class="muted">${VPER[per]} 확정된 AI 관련 성과가 없습니다. 성과·레벨 메뉴에서 평가를 확정하면 여기에 나옵니다.</p>`}
        </section>
      </div>`;
  }


  /* ---------- P3: 작업 종류별 AI 추천표 · 직원 비교 자리 ---------- */
  // Claude 의견(추정). 회사 도입·연결 여부는 '연결' 칸에 따로 적고, 확인 안 된 것은 미확인.
  const RECO = [
    { job: '보고서·기획서 초안, 긴 문서 요약', ai: 'Claude', why: '긴 문서를 한 번에 읽고 한국어 문장으로 정리. 사내 스킬(파일명 규칙·벌툰 PPT 등)을 그대로 적용', alt: 'ChatGPT', how: '자료를 붙이고 "누가 읽는지·몇 장·결론 먼저"를 함께 적어 주세요.' },
    { job: '업무 자동화·프로그램(스킬·예약 작업·코드)', ai: 'Claude Code', why: '저장소 파일을 직접 고치고 실행·확인까지 해서 결과물이 바로 남음', alt: '—', how: '"무엇을 자동으로, 언제, 결과는 어디에"를 한 문장으로 주시면 됩니다.' },
    { job: '엑셀 정리·집계, 표 만들기', ai: 'Claude', why: 'xlsx 스킬로 실제 파일을 만들고 수식까지 넣음', alt: 'ChatGPT', how: '원본 파일과 원하는 결과 표 모양(열 이름)을 주세요.' },
    { job: '사내 자료 찾기(Slack·Asana·Drive·메일)', ai: 'Claude + 커넥터', why: '이미 연결된 커넥터로 원본을 직접 검색해 출처와 함께 답함', alt: 'Gemini(구글 문서 안에서만)', how: '"기간·채널(또는 폴더)·찾는 것"을 적어 주세요.' },
    { job: '구글 문서·시트 안에서 바로 고치기', ai: 'Gemini', why: '구글 워크스페이스 화면 안에서 바로 쓰는 용도', alt: 'Claude(구글 커넥터)', how: '회사 Gemini 도입 여부부터 확인이 필요합니다.' },
    { job: '이미지·디자인 시안, 카드뉴스', ai: 'Canva 커넥터', why: 'Claude는 그림을 직접 그리지 않음. 시안·편집은 Canva가 맞음', alt: 'ChatGPT(이미지 생성)', how: '브랜드(벌툰 등)와 크기·문구를 정해 주세요.' },
    { job: '최신 정보 조사(시장·경쟁사·법령)', ai: 'Claude(웹 검색·법령 커넥터)', why: '출처 링크를 붙여 정리. 법령은 법령 커넥터로 원문 확인', alt: 'Gemini·ChatGPT 검색', how: '"언제 기준·어느 나라·몇 개 출처"를 적어 주세요.' },
    { job: '회의 녹음 → 회의록', ai: '미확인', why: '녹음·받아쓰기 도구가 정해지지 않음. 받아쓴 글이 있으면 요약은 Claude', alt: '—', how: '녹음 도구를 정하면 추천을 채웁니다.' }
  ];
  const CONN = { claude: ['측정', 'Claude Code 세션 기록으로 사용량 확인됨'], chatgpt: ['미확인', '회사 계정·관리자 키 확인 전'], gemini: ['미확인', '회사 도입·관리자 키 확인 전'], canva: ['미확인', '이 계정에 커넥터는 있으나 사용량 경로 없음'] };
  const connOf = (ai) => /Claude/.test(ai) ? 'claude' : /ChatGPT/.test(ai) ? 'chatgpt' : /Gemini/.test(ai) ? 'gemini' : /Canva/.test(ai) ? 'canva' : null;
  function guideView() {
    const q = (S.ui.aiRecoQ || '').trim();
    const rows = RECO.filter((r) => !q || (r.job + r.ai + r.why + r.alt).toLowerCase().includes(q.toLowerCase()));
    const open = S.ui.aiRecoOpen;
    return `<div class="ai-tabtop"><p class="small muted">작업 종류마다 어떤 AI가 알맞은지 정리한 표입니다. Claude의 의견(${badge('추정')})이며, 회사에서 실제로 쓸 수 있는지는 '연결' 칸을 보세요.</p></div>
      <section class="panel"><h3>작업 종류별 알맞은 AI ${badge('추정')}</h3>
        <label class="ai-search"><span class="small muted">작업 찾기</span><input type="search" id="aiRecoQ" value="${esc(q)}" placeholder="예: 엑셀, 회의록, 디자인" autocomplete="off"></label>
        <ul class="ai-reco" id="aiRecoList">${recoRows(rows, open)}</ul>
        <p class="small muted ai-note">추천은 이 회사에 연결된 도구 기준입니다. 새 AI·커넥터가 연결되면 이 표를 고칩니다.</p>
      </section>
      <section class="panel"><h3>직원 AI 활용 비교 ${badge('미확인')}</h3>
        <div class="tbl-wrap"><table class="ai-prov"><thead><tr><th>부서·직원</th><th class="r">AI 사용</th><th class="r">AI 비용</th><th class="r">확정 가치</th><th class="r">효과 배수</th></tr></thead>
          <tbody><tr class="unk"><td data-l="AI"><b>수훈보드 연동 전</b><div class="small muted">직원 목록·사용 기록을 아직 받지 않습니다</div></td><td data-l="입력" class="r muted">—</td><td data-l="출력" class="r muted">—</td><td data-l="비용" class="r muted">—</td><td data-l="근거">${badge('미확인')}</td></tr></tbody></table></div>
        <h4 class="ai-h4">채우려면 필요한 것</h4>
        <ul class="ai-need small"><li>수훈보드 직원·부서 목록 연동(이름은 수훈보드에서 가져오고 여기서 만들지 않음)</li><li>직원별 Claude 사용 기록(팀·엔터프라이즈 관리자 사용량 보고서)</li><li>성과·레벨 확정 건에 담당 직원 표시</li><li>ChatGPT·Gemini 회사 계정의 관리자 사용량</li></ul>
        <p class="small muted ai-note">연봉·임금 정보는 이 비교에 쓰지 않습니다.</p>
      </section>`;
  }
  function recoRows(rows, open) {
    if (!rows.length) return '<li class="none muted">맞는 작업이 없습니다. 다른 말로 찾아 보세요.</li>';
    return rows.map((r) => { const k = connOf(r.ai); const c = k ? CONN[k] : ['미확인', '추천 AI가 정해지지 않음']; const on = open === r.job;
      return `<li class="${on ? 'on' : ''}"><button type="button" class="ai-reco-h" data-act="aiReco" data-v="${esc(r.job)}" aria-expanded="${on}"><span class="j">${esc(r.job)}</span><span class="a">${esc(r.ai)}</span><span class="c"><span class="small muted">연결</span> ${badge(c[0])} <span class="chev" aria-hidden="true">${on ? '▾' : '▸'}</span></span></button>
        ${on ? `<div class="ai-reco-b small"><p><b>이유</b> ${esc(r.why)}</p><p><b>대안</b> ${esc(r.alt)}</p><p><b>맡기는 법</b> ${esc(r.how)}</p><p class="muted"><b>연결</b> ${esc(c[1])}</p></div>` : ''}</li>`; }).join('');
  }

  /* 받은 항목(다른 메뉴가 ai로 보낸 것) */
  function inboxBox() {
    const items = S.inbox.filter((x) => x.to === 'ai' && !x.done);
    if (!items.length) return '';
    return `<section class="panel ai-inbox"><h3>받은 항목 <span class="ai-cnt">${items.length}</span></h3><ul class="ai-alerts">${items.map((x) => `<li class="ai-alert"><div><b>${esc(x.title || '(제목 없음)')}</b><div class="small muted">${esc(x.from || '')}에서 · ${esc(String(x.at || '').slice(0, 16).replace('T', ' '))}${x.kind ? ' · ' + esc(x.kind) : ''}</div></div><div class="row"><button type="button" class="btn sm" data-act="aiInboxDone" data-id="${esc(x.id)}">처리함</button></div></li>`).join('')}</ul></section>`;
  }
  /* 모든 탭 위에 보이는 경보 띠 */
  function alertStrip() {
    const open = budgetAlerts(budgetCalc()).filter((a) => !S.aiAck[a.id]);
    if (!open.length || S.ui.aiTab === 'budget') return '';
    return `<div class="ai-strip ${open.some((a) => a.lv === 'crit') ? 'crit' : ''}" role="status"><b>경보 ${open.length}건</b><span>${esc(open[0].title)}${open.length > 1 ? ` 외 ${open.length - 1}건` : ''}</span><button type="button" class="btn sm" data-act="aiTab" data-v="budget">확인하기</button></div>`;
  }

  function viewAI() {
    const tab = TABS_AI.some((t) => t[0] === S.ui.aiTab) ? S.ui.aiTab : 'usage';
    const body = tab === 'budget' ? budgetView() : tab === 'value' && typeof valueView === 'function' ? valueView() : tab === 'guide' && typeof guideView === 'function' ? guideView() : usageView();
    return `<div class="view-head"><div><h2>AI 비용·효과 관제탑</h2><p>얼마 쓰는지보다, 쓴 만큼 무엇을 벌었는지 봅니다. 수집 경로가 없는 숫자는 <b>미확인</b>으로 두고 지어내지 않습니다.</p></div></div>
      ${inboxBox()}${alertStrip()}
      <div class="ai-tabs" role="tablist" aria-label="AI 관제탑 보기">${TABS_AI.map(([k, l]) => `<button type="button" role="tab" data-act="aiTab" data-v="${k}" aria-selected="${k === tab}">${l}</button>`).join('')}</div>
      ${body}`;
  }

  /* ---------- 동작 ---------- */

  APP.acts.aiTab = (el) => { S.ui.aiTab = el.dataset.v; };
  APP.acts.aiBudgetEdit = (el) => { S.ui.aiBudgetEdit = el.dataset.v === '1'; };
  APP.forms.aiBudget = (fd) => {
    const n = (k, d, lo, hi) => { const v = Math.round(+fd.get(k)); return Number.isFinite(v) && v >= lo && v <= hi ? v : d; };
    const B = S.aiBudget; const lim = n('limit', B.limit_krw, 1000, 1e12);
    B.limit_krw = lim; B.warn_pct = n('warn', B.warn_pct, 30, 99); B.spike_pct = n('spike', B.spike_pct, 10, 500);
    (B.history = B.history || []).push({ at: nowIso(), limit: B.limit_krw, warn: B.warn_pct, spike: B.spike_pct });
    S.ui.aiBudgetEdit = false; logAct('budget', `AI 월 한도 ${won(B.limit_krw)}원 · 주의 ${B.warn_pct}% · 급증 +${B.spike_pct}%로 설정`);
    toast('한도·경보 기준을 저장했습니다');
  };
  const findAlert = (id) => budgetAlerts(budgetCalc()).find((a) => a.id === id);
  APP.acts.aiAck = (el) => { const a = findAlert(el.dataset.id); S.aiAck[el.dataset.id] = nowIso(); logAct('alert_ack', `경보 확인: ${a ? a.title : el.dataset.id}`, el.dataset.id); };
  APP.acts.aiAlertToday = (el) => {
    const a = findAlert(el.dataset.id); if (!a) return;
    if (S.inbox.some((x) => x.to === 'today' && x.payload && x.payload.alertId === a.id && !x.done)) { toast('이미 오늘 할 일로 보냈습니다'); return; }
    S.inbox.push({ id: APP.uid('in'), at: nowIso(), from: 'ai', to: 'today', kind: 'AI 비용 경보', title: a.title, payload: { alertId: a.id, text: a.text }, done: false });
    logAct('send', `경보를 오늘 할 일로 보냄: ${a.title}`, a.id); toast('오늘 할 일의 받은 항목으로 보냈습니다');
  };
  APP.acts.aiInboxDone = (el) => { const x = S.inbox.find((i) => i.id === el.dataset.id); if (!x) return; x.done = true; logAct('inbox_done', `받은 항목 처리: ${x.title}`, x.id); };

  APP.acts.aiValPer = (el) => { S.ui.aiValPer = el.dataset.v; S.ui.aiPickFor = null; };
  const ppFocus = () => setTimeout(() => { const i = document.getElementById('aiPP'); if (i) i.focus(); }, 0);
  APP.acts.aiPPOpen = (el) => { S.ui.aiPickFor = el.dataset.id; ppFocus(); };
  APP.acts.aiPPClose = () => { S.ui.aiPickFor = null; };
  const linkSkill = (id, name) => { const a = (S.achievements || []).find((x) => x.id === id); S.aiSkillLink[id] = name; S.ui.aiPickFor = null; logAct('skill_link', `확정 건 「${a ? a.title : id}」에 스킬 ${name} 연결`, id); };
  APP.acts.aiPPPick = (el) => linkSkill(el.dataset.id, el.dataset.v);
  APP.acts.aiUnlink = (el) => { const id = el.dataset.id; const n = S.aiSkillLink[id]; delete S.aiSkillLink[id]; logAct('skill_unlink', `스킬 ${n} 연결 해제`, id); };
  // 입력해서 찾는 칸: 타이핑은 다시 그리지 않고 목록만 바꾼다
  document.addEventListener('input', (e) => {
    if (e.target.id !== 'aiPP') return;
    const q = e.target.value.trim().toLowerCase(); const id = e.target.dataset.id;
    const list = skillOptions().filter((o) => o.toLowerCase().includes(q)).slice(0, 8);
    const ul = document.getElementById('aiPPList'); if (!ul) return;
    ul.innerHTML = list.length ? list.map((o, i) => `<li role="option" class="${i === 0 ? 'on' : ''}" data-act="aiPPPick" data-id="${esc(id)}" data-v="${esc(o)}">${esc(o)}</li>`).join('') : '<li class="none">맞는 스킬이 없습니다</li>';
  });
  document.addEventListener('keydown', (e) => {
    if (e.target.id !== 'aiPP') return;
    const ul = document.getElementById('aiPPList'); const items = ul ? [...ul.querySelectorAll('li[data-v]')] : [];
    let i = items.findIndex((x) => x.classList.contains('on'));
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault(); if (!items.length) return;
      i = e.key === 'ArrowDown' ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
      items.forEach((x, k) => x.classList.toggle('on', k === i)); items[i].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const typed = e.target.value.trim(); const exact = skillOptions().find((o) => o.toLowerCase() === typed.toLowerCase());
      const pick = exact || (items[i] && items[i].dataset.v);
      if (pick) linkSkill(e.target.dataset.id, pick);
      else { S.ui.aiPickFor = null; toast('목록에 없는 스킬이라 원래 값을 그대로 둡니다'); }
      rerender();
    } else if (e.key === 'Escape') { e.preventDefault(); S.ui.aiPickFor = null; rerender(); }
  });

  APP.acts.aiReco = (el) => { S.ui.aiRecoOpen = S.ui.aiRecoOpen === el.dataset.v ? null : el.dataset.v; };
  document.addEventListener('input', (e) => {
    if (e.target.id !== 'aiRecoQ') return;
    S.ui.aiRecoQ = e.target.value; const q = e.target.value.trim().toLowerCase();
    const ul = document.getElementById('aiRecoList'); if (ul) ul.innerHTML = recoRows(RECO.filter((r) => !q || (r.job + r.ai + r.why + r.alt).toLowerCase().includes(q)), S.ui.aiRecoOpen);
  });
  APP.acts.aiPeriod = (el) => { S.ui.aiPeriod = el.dataset.v; S.ui.aiPick = null; };
  APP.acts.aiPick = (el) => { S.ui.aiPick = +el.dataset.v; };
  APP.acts.aiToggleMock = () => { S.ui.aiShowMock = !S.ui.aiShowMock; S.ui.aiPick = null; };
  APP.acts.aiScan = () => {
    if ((S.ui.aiScanState || {}).running) return;
    const hasClaude = window.claude && typeof window.claude.use === 'function';
    if (!hasClaude) { S.ui.aiScanState = { msg: '이 화면에서는 조사할 수 없습니다. claude.ai에 올린 현황판(아티팩트)에서 눌러 주세요. 지금 숫자는 그대로 둡니다.' }; return; }
    S.ui.aiScanState = { running: true, msg: '조사를 시작합니다…' };
    const t0 = Date.now();
    scanToday().then((day) => {
      S.ui.aiScanState = { msg: `조사 완료(${Math.round((Date.now() - t0) / 1000)}초) — 오늘 ${won(day.turns)}턴 · 토큰 ${T(day.input_tokens + day.output_tokens)} · ${won(day.cost_usd * RATE)}원` };
      S.ui.aiPeriod = 'day'; S.ui.aiPick = null; logAct('scan', `오늘 Claude 사용량 조사: ${won(day.turns)}턴 · ${won(day.cost_usd * RATE)}원`); toast('오늘 Claude 사용량을 조사했습니다'); rerender();
    }).catch((e) => {
      S.ui.aiScanState = { msg: e && e.code === 'no_mcp' ? '이 화면에서는 커넥터를 쓸 수 없습니다. claude.ai에 올린 현황판(아티팩트)에서 눌러 주세요.' : errText(e) + ' 기존 숫자는 그대로 둡니다.' };
      rerender();
    });
  };
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
