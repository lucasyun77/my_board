/* 메뉴: 내가 보는 숫자 (numbers) — 이 메뉴 담당 하위 세션은 이 파일만 고칩니다.
   공용 도구·상태는 window.APP에서 꺼내 씁니다. 새 버튼 동작은 APP.acts['이름'], 폼은 APP.forms['이름'], select 변경은 APP.changes['이름']로 등록합니다.
   원칙: 현황판 안에서 계산되는 값만 '측정'. 매출·가맹·로열티처럼 원천이 정해지지 않은 숫자는 '—'와 '미확인'으로 두고 꾸며내지 않는다.
   임직원 연봉·임금은 어떤 형태로도 넣지 않는다. */
(function () {
  'use strict';
  const { S, esc, badge, md, days, dayStr, uid, toast, isOpen, RATE } = window.APP;

  const VER = 2;
  const GROUPS = ['매출', '가맹', '조직', '성과', 'AI', '학습'];
  const FREQS = ['실시간', '매일', '매주', '매월'];
  const SOURCES = ['수기', '추정', '미확인'];
  const LAST_N = 7;
  const range = () => Array.from({ length: LAST_N }, (_, i) => dayStr(i - (LAST_N - 1))); // 오래된 날 → 오늘

  /* ---------- 현황판 안에서 바로 계산하는 값 (측정) ---------- */
  const allWaiting = () => [...(S.waiting || []), ...(S.waitingDone || [])];
  const CALC = {
    dirRate: {
      label: '지시 이행률', unit: '%', group: '조직',
      at: (d) => { const issued = S.directives.filter((x) => x.issued_at <= d); const done = issued.filter((x) => x.status === '완료' && x.updated_at <= d); return issued.length ? Math.round((100 * done.length) / issued.length) : 0; },
      now: () => (S.directives.length ? Math.round((100 * S.directives.filter((x) => x.status === '완료').length) / S.directives.length) : 0)
    },
    overdue: {
      label: '기한 지난 지시', unit: '건', group: '조직',
      at: (d) => S.directives.filter((x) => x.issued_at <= d && x.due_at < d && x.status !== '보류' && !(x.status === '완료' && x.updated_at <= d)).length,
      now: () => S.directives.filter((x) => isOpen(x) && x.due_at < S.today).length
    },
    waiting: {
      label: '회장 대기함', unit: '건', group: '조직',
      at: (d) => allWaiting().filter((w) => w.since <= d && !(w.done_at && w.done_at <= d)).length,
      now: () => (S.waiting || []).length
    },
    value7: {
      label: '최근 7일 확정 수익가치', unit: '천원', group: '성과',
      at: (d) => Math.round(S.achievements.filter((a) => a.status === '확정' && a.confirmed_at <= d && a.confirmed_at > MOCKD(d, -7)).reduce((s, a) => s + a.value_won, 0) / 1000),
      now: () => Math.round(S.achievements.filter((a) => a.status === '확정' && a.confirmed_at >= dayStr(-6)).reduce((s, a) => s + a.value_won, 0) / 1000)
    },
    level: {
      label: '레벨업까지 남은 금액', unit: '천원', group: '성과',
      at: null,
      now: () => Math.max(0, Math.round((window.APP.LEVEL_COST - S.wallet.balance_won) / 1000))
    },
    xp: {
      label: '경영학습 누적 XP', unit: 'XP', group: '학습',
      at: (d) => S.xp - S.attempts.filter((a) => a.at.slice(0, 10) > d).length,
      now: () => S.xp
    },
    quizToday: {
      label: '오늘 푼 학습 문제', unit: '문제', group: '학습',
      at: (d) => S.attempts.filter((a) => a.at.slice(0, 10) === d).length,
      now: () => S.attempts.filter((a) => a.at.slice(0, 10) === S.today).length
    },
    aiTok: {
      label: 'Claude 토큰(하루)', unit: 'M', group: 'AI',
      at: (d) => { const u = S.usage.find((x) => x.date === d); return u ? +((u.input_tokens + u.output_tokens) / 1e6).toFixed(2) : null; },
      now: () => CALC.aiTok.at(S.today)
    },
    aiCost: {
      label: 'Claude 비용(하루, 원화 환산)', unit: '원', group: 'AI',
      at: (d) => { const u = S.usage.find((x) => x.date === d); return u ? Math.round(u.cost_usd * RATE) : null; },
      now: () => CALC.aiCost.at(S.today)
    }
  };
  function MOCKD(d, n) { const x = new Date(d + 'T00:00:00'); x.setDate(x.getDate() + n); const p = (k) => String(k).padStart(2, '0'); return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}`; }

  /* ---------- 샘플 카드 (수치는 넣지 않음: 측정은 계산, 나머지는 미확인) ---------- */
  const card = (o) => Object.assign({ id: uid('n'), unit: '', group: '조직', target: null, alarmDir: '', alarmV: null, source: '미확인', freq: '매일', calc: '', hist: [], hidden: false, note: '' }, o);
  function seed() {
    return {
      v: VER,
      cards: [
        card({ name: '월 매출(3개 브랜드 합계)', unit: '원', group: '매출', freq: '매월', note: '집계 원천(POS·회계) 확정 전' }),
        card({ name: '브랜드별 월 매출(블랙라벨·벌툰·생전포차)', unit: '원', group: '매출', freq: '매월', note: '집계 원천 확정 전' }),
        card({ name: '이번 달 신규 가맹 계약', unit: '건', group: '가맹', freq: '매주', note: '가맹 계약 대장 연결 전' }),
        card({ name: '로열티 납부율', unit: '%', group: '가맹', freq: '매월', alarmDir: '이하', note: '정산 원천 확정 전' }),
        card({ name: '운영 중 가맹점 수', unit: '곳', group: '가맹', freq: '매월', note: '가맹점 마스터 연결 전' }),
        card({ name: CALC.dirRate.label, unit: '%', group: '조직', calc: 'dirRate', source: '측정', freq: '실시간', target: 80, alarmDir: '이하', alarmV: 50 }),
        card({ name: CALC.overdue.label, unit: '건', group: '조직', calc: 'overdue', source: '측정', freq: '실시간', target: 0, alarmDir: '이상', alarmV: 1 }),
        card({ name: CALC.waiting.label, unit: '건', group: '조직', calc: 'waiting', source: '측정', freq: '실시간', target: 2, alarmDir: '이상', alarmV: 5 }),
        card({ name: CALC.value7.label, unit: '천원', group: '성과', calc: 'value7', source: '추정', freq: '매일', note: 'Claude 산정 후 협상·확정된 값' }),
        card({ name: CALC.aiTok.label, unit: 'M', group: 'AI', calc: 'aiTok', source: '측정', freq: '매일', note: 'ChatGPT·Gemini는 미확인' }),
        card({ name: CALC.aiCost.label, unit: '원', group: 'AI', calc: 'aiCost', source: '측정', freq: '매일', alarmDir: '이상', alarmV: 40000, note: `환율 ${RATE.toLocaleString('ko-KR')}원/USD 가정` }),
        card({ name: CALC.xp.label, unit: 'XP', group: '학습', calc: 'xp', source: '측정', freq: '실시간' }),
        card({ name: CALC.quizToday.label, unit: '문제', group: '학습', calc: 'quizToday', source: '측정', freq: '실시간', target: 10 })
      ]
    };
  }
  if (!S.numbersExtra || S.numbersExtra.v !== VER) S.numbersExtra = seed();
  const N = () => S.numbersExtra;
  const ui = () => (S.ui.num = S.ui.num || { group: '전체' });
  const byId = (id) => N().cards.find((c) => c.id === id);

  /* ---------- 값 계산 ---------- */
  function series(c) {
    if (c.calc && CALC[c.calc]) {
      const k = CALC[c.calc];
      if (!k.at) return [{ d: S.today, v: k.now() }];
      return range().map((d) => ({ d, v: d === S.today ? k.now() : k.at(d) })).filter((p) => p.v != null);
    }
    return c.hist.slice().sort((a, b) => a.d.localeCompare(b.d)).slice(-LAST_N);
  }
  const lastDate = (c) => (c.calc ? S.today : (c.hist.length ? c.hist.reduce((m, h) => (h.d > m ? h.d : m), '') : null));
  const better = (c) => (c.alarmDir === '이상' ? 'down' : 'up'); // 경보가 '이상'이면 낮을수록 좋은 숫자
  const isAlarm = (c, v) => v != null && c.alarmV != null && c.alarmDir && (c.alarmDir === '이상' ? v >= c.alarmV : v <= c.alarmV);
  function rate(c, v) {
    if (v == null || c.target == null) return null;
    if (better(c) === 'up') return c.target > 0 ? Math.round((100 * v) / c.target) : null;
    return v <= c.target ? 100 : (v > 0 ? Math.round((100 * Math.max(c.target, 0)) / v) : 100);
  }
  function stale(c) {
    if (c.calc || c.source === '미확인') return false;
    const ld = lastDate(c); if (!ld) return true;
    const lim = { 실시간: 0, 매일: 1, 매주: 7, 매월: 31 }[c.freq] ?? 1;
    return days(ld, S.today) > lim;
  }
  const fmt = (v) => (v == null ? '—' : Number(v).toLocaleString('ko-KR', { maximumFractionDigits: 2 }));
  const fmtUnit = (v, u) => (v == null ? '—' : `${fmt(v)}${u ? ' ' + u : ''}`);

  /* ---------- 그리기 ---------- */
  function trend(c, pts) {
    if (!pts.length) return `<div class="nb-trend-empty">${c.source === '미확인' ? '원천이 정해지면 추이가 쌓입니다' : '기록을 넣으면 추이가 쌓입니다'}</div>`;
    const vals = pts.map((p) => p.v);
    const max = Math.max(...vals.map(Math.abs), 1e-9);
    const est = c.source === '추정' ? ' est' : '';
    return `<div class="nb-trend" role="img" aria-label="최근 ${pts.length}개 기록 추이: ${pts.map((p) => `${md(p.d)} ${fmt(p.v)}`).join(', ')}">
      ${pts.map((p, i) => `<div class="nb-bar${i === pts.length - 1 ? ' now' : ''}${est}${isAlarm(c, p.v) ? ' bad' : ''}" title="${md(p.d)} · ${fmtUnit(p.v, c.unit)}"><div class="nb-col"><i style="height:${Math.max(4, Math.round((Math.abs(p.v) / max) * 100))}%"></i></div><span>${md(p.d)}</span></div>`).join('')}
    </div>`;
  }

  function cardHtml(c, idx, list) {
    const u = ui();
    const pts = series(c);
    const v = c.source === '미확인' && !c.calc ? null : (pts.length ? pts[pts.length - 1].v : null);
    const prev = pts.length > 1 ? pts[pts.length - 2].v : null;
    const alarm = isAlarm(c, v);
    const r = rate(c, v);
    const ld = lastDate(c);
    let delta = '<span class="muted">전기 대비 —</span>';
    if (v != null && prev != null) {
      const dv = +(v - prev).toFixed(2);
      const good = dv === 0 ? '' : ((dv > 0) === (better(c) === 'up') ? 'good' : 'bad');
      delta = `<span class="nb-delta ${good}">${dv > 0 ? '▲' : dv < 0 ? '▼' : '＝'} ${fmt(Math.abs(dv))}${esc(c.unit ? ' ' + c.unit : '')}</span><span class="muted"> 전기(${md(pts[pts.length - 2].d)}) 대비</span>`;
    }
    const meta = [
      c.target != null ? `목표 ${fmtUnit(c.target, c.unit)}${better(c) === 'down' ? ' 이하' : ''}` : '목표 없음',
      c.alarmDir && c.alarmV != null ? `경보 ${fmtUnit(c.alarmV, c.unit)} ${c.alarmDir}` : '경보 없음',
      c.freq,
      c.owner ? `담당자: ${c.owner}` : '담당자 없음'
    ];
    const first = idx === 0, last = idx === list.length - 1;
    const blank = v == null && c.source === '미확인' && !c.hist.length;
    const mode = u.edit === c.id ? 'edit' : u.del === c.id ? 'del' : u.hist === c.id ? 'hist' : u.entry === c.id ? 'entry' : '';
    return `<article class="nb-card${blank ? ' blank' : ''}${alarm ? ' alarm' : ''}${c.hidden ? ' hidden' : ''}" aria-labelledby="nb-t-${c.id}">
      <header class="nb-head">
        <div class="nb-name"><span class="nb-group">${esc(c.group)}</span><h3 id="nb-t-${c.id}">${esc(c.name)}</h3></div>
        ${badge(c.source)}
      </header>
      <div class="nb-value-row">
        <div class="nb-value num">${v == null ? '—' : fmt(v)}${v != null && c.unit ? `<small>${esc(c.unit)}</small>` : ''}</div>
        ${alarm ? `<span class="nb-alarm">경보 · ${fmtUnit(c.alarmV, c.unit)} ${c.alarmDir}</span>` : ''}
      </div>
      ${blank ? '' : `<div class="nb-sub">${delta}</div>`}
      ${r != null ? `<div class="nb-rate"><div class="bar${c.source === '추정' ? ' est' : ''}"><i style="width:${Math.min(100, r)}%;${r < 60 ? 'background:var(--crit)' : r < 100 ? 'background:var(--gold)' : ''}"></i></div><span class="num">목표 대비 ${r}%</span></div>` : ''}
      ${blank ? '' : trend(c, pts)}
      <div class="nb-meta">${blank ? `${esc(c.freq)} 확인 예정${c.note ? ' · ' + esc(c.note) : ''}` : `${meta.map(esc).join(' · ')}${c.note ? `<br>${esc(c.note)}` : ''}`}</div>
      <div class="nb-updated">${c.calc ? `마지막 갱신 오늘 ${new Date().toTimeString().slice(0, 5)} · 현황판 자동 계산` : ld ? `마지막 갱신 ${esc(ld)}${stale(c) ? ' <b class="nb-stale">갱신 늦음</b>' : ''}` : c.source === '미확인' ? '수집 경로 없음 — 값을 꾸며 넣지 않습니다. 확인되면 「값 넣기」' : '아직 기록 없음'}</div>
      <div class="nb-actions">
        ${!c.calc ? `<button type="button" class="btn sm primary" data-act="numbersEntry" data-id="${c.id}" aria-pressed="${mode === 'entry'}">값 넣기</button>` : ''}
        ${!c.calc ? `<button type="button" class="btn sm" data-act="numbersHist" data-id="${c.id}" aria-pressed="${mode === 'hist'}">기록 ${c.hist.length}</button>` : ''}
        <button type="button" class="btn sm" data-act="numbersEdit" data-id="${c.id}" aria-pressed="${mode === 'edit'}">설정</button>
        <span class="nb-move">
          <button type="button" class="btn sm" data-act="numbersMove" data-id="${c.id}" data-v="-1" ${first ? 'disabled' : ''} aria-label="앞으로">◀</button>
          <button type="button" class="btn sm" data-act="numbersMove" data-id="${c.id}" data-v="1" ${last ? 'disabled' : ''} aria-label="뒤로">▶</button>
        </span>
      </div>
      ${mode === 'entry' ? entryForm(c) : mode === 'hist' ? histBox(c) : mode === 'edit' ? editForm(c) : mode === 'del' ? delBox(c) : ''}
    </article>`;
  }

  function entryForm(c) {
    return `<form class="nb-panel form" data-form="numbersEntry" data-id="${c.id}">
      <label class="f">값${c.unit ? `(${esc(c.unit)})` : ''}<input type="number" step="any" name="v" required inputmode="decimal"></label>
      <label class="f">날짜<input type="date" name="d" value="${S.today}" max="${S.today}" required></label>
      <div class="row"><button class="btn primary sm">기록하기</button><button type="button" class="btn sm" data-act="numbersClose">닫기</button></div>
      ${c.source === '미확인' ? '<p class="small muted wide" style="margin:0">값을 넣으면 이 숫자의 원천이 「수기」로 바뀝니다.</p>' : ''}
    </form>`;
  }
  function histBox(c) {
    const u = ui();
    const h = c.hist.slice().sort((a, b) => b.d.localeCompare(a.d));
    return `<div class="nb-panel">
      ${h.length ? `<ul class="nb-hist">${h.map((x) => `<li><span class="num">${esc(x.d)}</span><b class="num">${fmtUnit(x.v, c.unit)}</b>${u.delRec === x.id ? `<span class="row"><button type="button" class="btn sm nb-danger" data-act="numbersRecDel" data-id="${c.id}" data-v="${x.id}">지우기 확인</button><button type="button" class="btn sm" data-act="numbersRecAsk" data-id="${c.id}" data-v="">취소</button></span>` : `<button type="button" class="btn sm" data-act="numbersRecAsk" data-id="${c.id}" data-v="${x.id}">지우기</button>`}</li>`).join('')}</ul>` : '<p class="muted" style="margin:0">아직 기록이 없습니다. 「값 넣기」로 첫 기록을 남기세요.</p>'}
      <div class="row" style="margin-top:8px"><button type="button" class="btn sm" data-act="numbersClose">닫기</button></div>
    </div>`;
  }
  function fields(c) {
    const o = c || {};
    const sel = (name, opts, cur) => `<select name="${name}">${opts.map((x) => `<option value="${esc(x[0])}" ${x[0] === cur ? 'selected' : ''}>${esc(x[1])}</option>`).join('')}</select>`;
    return `
      <label class="f wide">이름<input type="text" name="name" ${c ? 'required' : ''} maxlength="40" value="${esc(o.name || '')}" placeholder="${c ? '' : '예: 벌툰 신규 문의 건수 (현황판 값 연결 시 비우면 자동)'}"></label>
      <label class="f">묶음${sel('group', GROUPS.map((g) => [g, g]), o.group || (GROUPS.includes(ui().group) ? ui().group : '조직'))}</label>
      <label class="f">단위<input type="text" name="unit" maxlength="8" value="${esc(o.unit || '')}" placeholder="건, %, 원"></label>
      <label class="f">목표값<input type="number" step="any" name="target" value="${o.target ?? ''}" placeholder="없으면 비움"></label>
      <label class="f">경보 기준${sel('alarmDir', [['', '경보 없음'], ['이상', '이 값 이상이면 경보'], ['이하', '이 값 이하이면 경보']], o.alarmDir || '')}</label>
      <label class="f">경보 값<input type="number" step="any" name="alarmV" value="${o.alarmV ?? ''}"></label>
      ${o.calc ? `<label class="f">데이터 원천<input type="text" value="현황판 자동 계산 (${esc(o.source)})" disabled></label>` : `<label class="f">데이터 원천${sel('source', SOURCES.map((s) => [s, s]), o.source || '수기')}</label>`}
      <label class="f">갱신 주기${sel('freq', FREQS.map((f) => [f, f]), o.freq || '매일')}</label>
      <label class="f">담당자${picker({ key: 'f-' + (o.id || 'new'), name: 'owner', value: o.owner || '', label: '담당자 찾기' })}</label>
      <label class="f wide">메모(원천·정의)<input type="text" name="note" maxlength="80" value="${esc(o.note || '')}" placeholder="예: 가맹 계약 대장 기준, 월말 마감"></label>`;
  }
  function editForm(c) {
    return `<form class="nb-panel form" data-form="numbersEdit" data-id="${c.id}">
      ${fields(c)}
      <div class="row wide"><button class="btn primary sm">저장</button><button type="button" class="btn sm" data-act="numbersClose">닫기</button>
        <span class="nb-spacer"></span>
        <button type="button" class="btn sm" data-act="numbersHide" data-id="${c.id}">${c.hidden ? '다시 보이기' : '숨기기'}</button>
        <button type="button" class="btn sm nb-danger" data-act="numbersDelAsk" data-id="${c.id}">삭제</button></div>
    </form>`;
  }
  function delBox(c) {
    return `<div class="nb-panel nb-confirm" role="alertdialog" aria-label="삭제 확인">
      <p style="margin:0 0 8px"><b>「${esc(c.name)}」</b>을 삭제할까요? ${c.hist.length ? `수기 기록 ${c.hist.length}개도 함께 지워집니다.` : ''} 되돌릴 수 없습니다. 잠시 빼 두려면 「숨기기」를 쓰세요.</p>
      <div class="row"><button type="button" class="btn sm nb-danger" data-act="numbersDel" data-id="${c.id}">삭제 확인</button><button type="button" class="btn sm" data-act="numbersHide" data-id="${c.id}">대신 숨기기</button><button type="button" class="btn sm" data-act="numbersClose">취소</button></div>
    </div>`;
  }

  function viewCards() {
    const u = ui();
    const all = N().cards;
    const shown = all.filter((c) => !c.hidden);
    const valOf = (c) => { if (c.source === '미확인' && !c.calc) return null; const p = series(c); return p.length ? p[p.length - 1].v : null; };
    const alarms = shown.filter((c) => isAlarm(c, valOf(c)));
    const unknown = shown.filter((c) => c.source === '미확인');
    const late = shown.filter(stale);
    const hiddenN = all.length - shown.length;
    const tabs = [['전체', shown.length], ['경보', alarms.length], ...GROUPS.map((g) => [g, shown.filter((c) => c.group === g).length]).filter(([g, n]) => n || u.group === g), ...(hiddenN || u.group === '숨김' ? [['숨김', hiddenN]] : [])];
    if (!tabs.some((t) => t[0] === u.group)) u.group = '전체';
    const list = u.group === '숨김' ? all.filter((c) => c.hidden) : u.group === '경보' ? alarms : u.group === '전체' ? shown : shown.filter((c) => c.group === u.group);

    return `<div class="nb-subhead"><p>매일 직접 확인하는 숫자만 모았습니다. 경보 기준을 넘은 숫자는 붉게 표시됩니다.</p>
        <button type="button" class="btn primary" data-act="numbersAddOpen" aria-expanded="${!!u.add}">＋ 숫자 추가</button></div>
      <div class="nb-summary" role="list">
        <button type="button" role="listitem" class="nb-sum${alarms.length ? ' alert' : ''}" data-act="numbersGroup" data-v="경보"><span>경보</span><b class="num">${alarms.length}</b></button>
        <div role="listitem" class="nb-sum"><span>보는 숫자</span><b class="num">${shown.length}</b></div>
        <div role="listitem" class="nb-sum"><span>갱신 늦음</span><b class="num">${late.length}</b></div>
        <div role="listitem" class="nb-sum"><span>원천 미확인 ${badge('미확인')}</span><b class="num">${unknown.length}</b></div>
      </div>
      ${u.add ? `<section class="panel"><h3>숫자 추가</h3><form class="form" data-form="numbersAdd" style="margin-top:8px">
        <label class="f wide">값 가져오기<select name="calc"><option value="">직접 입력(수기·추정·미확인)</option>${Object.entries(CALC).map(([k, x]) => `<option value="${k}">현황판 값 연결 · ${esc(x.label)}</option>`).join('')}</select></label>
        ${fields(null)}
        <div class="row wide"><button class="btn primary">추가</button><button type="button" class="btn" data-act="numbersAddOpen">닫기</button></div>
        <p class="small muted wide" style="margin:0">원천이 아직 없는 숫자는 「미확인」으로 두면 '—'로 표시되고, 값을 넣는 순간 「수기」로 바뀝니다. 임직원 연봉·임금은 이 화면에 넣지 않습니다.</p>
      </form></section>` : ''}
      <div class="nb-tabs" role="tablist" aria-label="숫자 묶음">${tabs.map(([g, n]) => `<button type="button" role="tab" aria-selected="${g === u.group}" data-act="numbersGroup" data-v="${esc(g)}" class="${g === '경보' && n ? 'alert' : ''}">${esc(g)} <span class="num">${n}</span></button>`).join('')}</div>
      ${list.length ? `<div class="nb-grid">${list.map((c, i) => cardHtml(c, all.indexOf(c), all)).join('')}</div>` : `<div class="nb-empty">${u.group === '경보' ? '지금 경보가 울린 숫자는 없습니다.' : u.group === '숨김' ? '숨긴 숫자가 없습니다.' : '이 묶음에 숫자가 없습니다. 「＋ 숫자 추가」로 넣어 보세요.'}</div>`}
      <p class="small muted" style="margin:0">배지: ${badge('측정')} 현황판이 직접 계산 · ${badge('수기')} 직접 입력 · ${badge('추정')} Claude 산정 · ${badge('미확인')} 수집 경로 없음(값을 꾸며 넣지 않음). 순서 ◀ ▶는 전체 순서 기준입니다.</p>`;
  }

  /* ---------- 동작 ---------- */
  const closeAll = () => { const u = ui(); u.edit = u.del = u.hist = u.entry = u.delRec = null; };
  const toggle = (k, id) => { const u = ui(); const on = u[k] === id; closeAll(); if (!on) u[k] = id; };
  const A = APP.acts;
  A.numbersGroup = (el) => { ui().group = el.dataset.v; closeAll(); };
  A.numbersAddOpen = () => { const u = ui(); u.add = !u.add; };
  A.numbersEntry = (el) => { toggle('entry', el.dataset.id); setTimeout(() => { const i = document.querySelector('[data-form="numbersEntry"] input[name="v"]'); if (i) i.focus(); }, 0); };
  A.numbersHist = (el) => toggle('hist', el.dataset.id);
  A.numbersEdit = (el) => toggle('edit', el.dataset.id);
  A.numbersClose = () => closeAll();
  A.numbersDelAsk = (el) => { closeAll(); ui().del = el.dataset.id; };
  A.numbersDel = (el) => { const c = byId(el.dataset.id); N().cards = N().cards.filter((x) => x.id !== el.dataset.id); closeAll(); toast(`「${c ? c.name : ''}」을 삭제했습니다`); };
  A.numbersHide = (el) => { const c = byId(el.dataset.id); if (!c) return; c.hidden = !c.hidden; closeAll(); toast(c.hidden ? '숨겼습니다 — 「숨김」 탭에서 다시 보이게 할 수 있습니다' : '다시 보이게 했습니다'); };
  A.numbersMove = (el) => {
    const cs = N().cards; const i = cs.findIndex((x) => x.id === el.dataset.id); const j = i + (+el.dataset.v);
    if (i < 0 || j < 0 || j >= cs.length) return;
    [cs[i], cs[j]] = [cs[j], cs[i]];
  };
  A.numbersRecAsk = (el) => { ui().delRec = el.dataset.v || null; };
  A.numbersRecDel = (el) => { const c = byId(el.dataset.id); c.hist = c.hist.filter((h) => h.id !== el.dataset.v); ui().delRec = null; toast('기록을 지웠습니다'); };

  const num = (s) => { const t = (s ?? '').toString().trim(); if (t === '') return null; const n = Number(t); return Number.isFinite(n) ? n : null; };
  function readFields(fd, c) {
    const g = (n) => (fd.get(n) || '').toString().trim();
    c.name = g('name') || c.name || '이름 없는 숫자';
    c.group = GROUPS.includes(g('group')) ? g('group') : c.group;
    c.unit = g('unit');
    c.target = num(fd.get('target'));
    c.alarmDir = ['이상', '이하'].includes(g('alarmDir')) ? g('alarmDir') : '';
    c.alarmV = c.alarmDir ? num(fd.get('alarmV')) : null;
    if (!c.calc && SOURCES.includes(g('source'))) c.source = g('source');
    c.freq = FREQS.includes(g('freq')) ? g('freq') : c.freq;
    c.note = g('note');
    c.owner = people().some((p) => p.n === g('owner')) ? g('owner') : '';
    return c;
  }
  APP.forms.numbersAdd = (fd) => {
    const calc = (fd.get('calc') || '').toString();
    if (!CALC[calc] && !(fd.get('name') || '').toString().trim()) { toast('숫자 이름을 넣어 주세요'); return; }
    const c = card({ calc: CALC[calc] ? calc : '' });
    if (c.calc) { c.source = c.calc === 'value7' ? '추정' : '측정'; c.unit = CALC[calc].unit; }
    readFields(fd, c);
    if (c.calc && !(fd.get('unit') || '').toString().trim()) c.unit = CALC[calc].unit;
    if (c.calc && !(fd.get('name') || '').toString().trim()) c.name = CALC[calc].label;
    N().cards.push(c);
    const u = ui(); u.add = false; if (!['전체', c.group].includes(u.group)) u.group = '전체';
    toast(`「${c.name}」을 추가했습니다`);
  };
  APP.forms.numbersEdit = (fd, form) => { const c = byId(form.dataset.id); if (!c) return; readFields(fd, c); closeAll(); toast('설정을 저장했습니다'); };
  APP.forms.numbersEntry = (fd, form) => {
    const c = byId(form.dataset.id); if (!c) return;
    const v = num(fd.get('v')); let d = (fd.get('d') || '').toString();
    if (v == null) { toast('값을 숫자로 넣어 주세요'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || d > S.today) d = S.today;
    const same = c.hist.find((h) => h.d === d);
    if (same) same.v = v; else c.hist.push({ id: uid('r'), d, v });
    if (c.source === '미확인') c.source = '수기';
    closeAll();
    toast(same ? `${md(d)} 기록을 ${fmt(v)}${c.unit}(으)로 고쳤습니다` : `${md(d)} ${fmt(v)}${c.unit} 기록했습니다`);
  };


  /* =====================================================================
     숫자 게시판 — 보고 싶은 숫자를 글로 등록하면 Claude가 찾아 모니터링 페이지를 만든다.
     목업: Claude 응답은 화면 안 규칙으로 흉내 낸다(실서비스는 서버 함수에서 Anthropic API 호출, 키는 환경변수).
     현황판에 있는 값만 '측정'/'추정'으로 계산하고, 원천이 없는 값은 '—'·미확인. 직원 급여는 쓰지 않는다.
     ===================================================================== */
  const HV = window.APP.HOUR_VALUE;
  const sum = (a, f) => a.reduce((s, x) => s + (+f(x) || 0), 0);
  const usage14 = () => S.usage.slice(-14);
  const manualV = (pg, k) => (pg.manual && pg.manual[k] ? pg.manual[k].v : null);
  const M = {
    tok14: { label: '최근 14일 Claude 토큰', unit: 'M', f: () => ({ v: +(sum(usage14(), (u) => u.input_tokens + u.output_tokens) / 1e6).toFixed(1), s: '측정' }) },
    cost14: { label: '최근 14일 Claude 비용(원화 환산)', unit: '원', f: () => ({ v: Math.round(sum(usage14(), (u) => u.cost_usd) * RATE), s: '측정' }) },
    quota14: { label: '직원에게 지급한 토큰 한도(14일)', unit: 'M', manual: true },
    unused14: { label: '쓰지 않은 토큰', unit: 'M', need: '지급 토큰 한도', f: (pg) => { const q = manualV(pg, 'quota14'); return q == null ? null : { v: +Math.max(0, q - M.tok14.f().v).toFixed(1), s: '수기' }; } },
    useRate: { label: '토큰 사용률', unit: '%', need: '지급 토큰 한도', f: (pg) => { const q = manualV(pg, 'quota14'); return q ? { v: Math.round((100 * M.tok14.f().v) / q), s: '수기' } : null; } },
    outputs: { label: '토큰으로 만든 산출물(성과 등록)', unit: '건', f: () => ({ v: S.achievements.length, s: '측정' }) },
    outValue: { label: '산출물 추정가치(확정 합계)', unit: '원', f: () => ({ v: sum(S.achievements.filter((a) => a.status === '확정'), (a) => a.value_won), s: '추정' }) },
    valuePerM: { label: '토큰 100만당 추정가치', unit: '원', f: () => { const t = M.tok14.f().v; return t ? { v: Math.round(M.outValue.f().v / t), s: '추정' } : null; } },
    brandValue: { label: '브랜딩 가치', unit: '원', manual: true },
    realized: { label: '돈으로 실현된 가치', unit: '원', manual: true },
    savedH: { label: '월 절감시간(성과 등록 기준)', unit: '시간', f: () => ({ v: sum(S.achievements, (a) => (+a.saved_hours || 0) * (+a.headcount || 1)), s: '추정' }) },
    prodYear: { label: '생산성 향상 연 환산 가치(예측)', unit: '원', f: () => ({ v: M.savedH.f().v * HV * 12, s: '추정' }) },
    uplift: { label: '직원 생산성 향상률(도입 전후)', unit: '%', manual: true },
    aiUsers: { label: 'AI를 쓰는 직원 수', unit: '명', manual: true },
    cParticipants: { label: '콘테스트 참가 고객', unit: '명', manual: true },
    cEntries: { label: '접수 작품', unit: '건', manual: true },
    cTimeSaved: { label: '참가 고객이 아낀 시간(보고 기준)', unit: '시간', manual: true },
    cImpr: { label: '콘테스트 노출 수', unit: '회', manual: true },
    cCpm: { label: '광고 1천 회 노출 단가', unit: '원', manual: true },
    cMedia: { label: '광고 대체 가치(노출 환산)', unit: '원', need: '노출 수·1천 회 단가', f: (pg) => { const i = manualV(pg, 'cImpr'); const c = manualV(pg, 'cCpm'); return i != null && c != null ? { v: Math.round((i * c) / 1000), s: '추정' } : null; } },
    custom: { label: '요청한 숫자', unit: '', manual: true }
  };
  const mLabel = (pg, k) => (k === 'custom' && pg.customLabel ? pg.customLabel : M[k].label);
  function mval(pg, k) {
    const m = M[k]; if (!m) return { v: null, s: '미확인' };
    if (m.f) { const r = m.f(pg); if (r) return r; }
    const mv = pg.manual && pg.manual[k];
    if (m.manual && mv) return { v: mv.v, s: '수기', d: mv.d };
    return { v: null, s: '미확인' };
  }
  const shortWon = (v) => (Math.abs(v) >= 1e8 ? `${(v / 1e8).toLocaleString('ko-KR', { maximumFractionDigits: 1 })}억` : Math.abs(v) >= 1e6 ? `${Math.round(v / 1e4).toLocaleString('ko-KR')}만` : Math.round(v).toLocaleString('ko-KR'));
  const showV = (v, unit) => (v == null ? '—' : unit === '원' ? `${shortWon(v)}<small>원</small>` : `${Number(v).toLocaleString('ko-KR', { maximumFractionDigits: 1 })}${unit ? `<small>${esc(unit)}</small>` : ''}`);

  /* ---------- Claude가 요청을 읽고 페이지를 구성(목업 규칙) ---------- */
  const TPL = {
    prod: () => ({
      title: 'AI로 높아진 직원 생산성과 그 가치', head: 'prodYear', cover: 0,
      summary: '성과·레벨에 등록된 AI 산출물의 절감시간을 모아 생산성 향상분을 돈으로 환산한 예측치입니다.',
      blocks: [
        { t: 'kpis', keys: ['savedH', 'prodYear', 'outValue', 'uplift', 'aiUsers'] },
        { t: 'formula', lines: ['월 절감시간 = Σ(1인 월 절감시간 × 영향 인원) — 성과·레벨 등록 건 기준', '연 환산 가치(예측) = 월 절감시간 × 표준시간가치 30,000원 × 12개월 (표준시간가치는 급여가 아님)', '향상률은 같은 업무의 도입 전·후 소요시간을 비교해야 측정됩니다'] },
        { t: 'trend', title: 'AI 사용량 추이(Claude 토큰, 일별)' },
        { t: 'empty', title: '직원별 생산성', text: '직원별 AI 사용 로그와 업무 소요시간이 아직 연결되지 않아 비워 둡니다. 연결되면 이름 없이 조직 단위로만 보여 드리고, 급여·연봉 정보는 쓰지 않습니다.' },
        { t: 'sources', items: [['성과·레벨 등록 건', '연결됨', '현황판 안'], ['Claude 사용량', '연결됨', '사용량 수집'], ['직원별 AI 사용 로그', '미연결', 'Claude·ChatGPT·Gemini 조직 관리자 사용량'], ['업무 소요시간 전·후 비교', '미연결', '부서별 표본 업무 측정']] }
      ]
    }),
    contest: () => ({
      title: '고객 생산성 콘테스트가 만든 브랜드 가치', head: 'cMedia', cover: 1,
      summary: '고객이 AI로 생산성을 높인 사례를 콘테스트로 모으고, 그 노출이 회사 브랜드에 더한 가치를 봅니다.',
      blocks: [
        { t: 'kpis', keys: ['cParticipants', 'cEntries', 'cTimeSaved', 'cImpr', 'cCpm', 'cMedia', 'brandValue'] },
        { t: 'formula', lines: ['광고 대체 가치(추정) = 노출 수 × 광고 1천 회 노출 단가 ÷ 1,000', '고객 생산성 = 참가 고객이 보고한 절감시간 합계(수기)', '브랜드 가치는 인지도 설문·검색량 같은 원천을 정해야 측정됩니다'] },
        { t: 'empty', title: '콘테스트 회차별 추이', text: '아직 열린 콘테스트 기록이 없습니다. 회차가 쌓이면 참가·노출·가치 추이를 그립니다.' },
        { t: 'sources', items: [['콘테스트 접수 시스템', '미연결', '접수 폼·심사표'], ['SNS·언론 노출 집계', '미연결', '광고 관리자·모니터링 도구'], ['브랜드 인지도 설문', '미연결', '분기 설문']] }
      ]
    }),
    token: () => ({
      title: '직원 AI 토큰: 안 쓴 양부터 실현된 돈까지', head: 'tok14', cover: 2,
      summary: '지급한 토큰이 산출물 → 추정가치 → 브랜딩 가치 → 실제 돈으로 얼마나 이어졌는지 단계별로 봅니다.',
      blocks: [
        { t: 'funnel', keys: ['quota14', 'tok14', 'outputs', 'outValue', 'brandValue', 'realized'] },
        { t: 'kpis', keys: ['unused14', 'useRate', 'cost14', 'valuePerM'] },
        { t: 'trend', title: '토큰 사용 추이(Claude, 일별)' },
        { t: 'formula', lines: ['쓰지 않은 토큰 = 지급 한도 − 사용 토큰', '토큰 100만당 추정가치 = 산출물 추정가치 ÷ 사용 토큰(M)', '돈으로 실현된 가치는 매출·비용 장부에서 확인된 금액만 넣습니다(꾸며 넣지 않음)'] },
        { t: 'sources', items: [['Claude 사용량', '연결됨', '사용량 수집'], ['성과·레벨 산출물', '연결됨', '현황판 안'], ['직원별 지급 한도', '미연결', 'AI 도구 관리자 설정'], ['ChatGPT·Gemini 사용량', '미연결', '각 관리자 콘솔'], ['실현 금액', '미연결', '회계 장부']] }
      ]
    }),
    custom: (req) => ({
      title: req.replace(/\s+/g, ' ').trim().slice(0, 36) || '새 숫자', head: 'custom', cover: 3, customLabel: req.replace(/\s+/g, ' ').trim().slice(0, 24),
      summary: '요청을 읽었지만 현황판 안에서 이 숫자의 원천을 찾지 못했습니다. 값을 직접 넣거나 원천을 알려 주시면 연결합니다.',
      blocks: [
        { t: 'kpis', keys: ['custom'] },
        { t: 'sources', items: [['원천', '미정', '채팅으로 알려 주세요(예: “원천은 회계 장부”)']] }
      ]
    })
  };
  function pickTpl(req) {
    if (/토큰|AI\s*비용|ai\s*비용/.test(req)) return 'token';
    if (/콘테스트|공모|고객/.test(req)) return 'contest';
    if (/생산성/.test(req)) return 'prod';
    return 'custom';
  }
  function makePage(req) {
    const kind = pickTpl(req);
    const pg = Object.assign({ id: uid('pg'), req, kind, manual: {}, created: S.today, updated: S.today, ver: 1, chat: [] }, TPL[kind](req));
    pg.chat.push({ r: 'u', t: req }, { r: 'c', t: foundMsg(pg) });
    return pg;
  }
  function pageKeys(pg) { const ks = []; pg.blocks.forEach((b) => (b.keys || []).forEach((k) => { if (!ks.includes(k)) ks.push(k); })); return ks; }
  function tally(pg) { const c = { 측정: 0, 수기: 0, 추정: 0, 미확인: 0 }; pageKeys(pg).forEach((k) => { c[mval(pg, k).s] += 1; }); return c; }
  function foundMsg(pg) {
    const c = tally(pg);
    return `요청을 읽고 「${pg.title}」 페이지를 만들었습니다. 숫자 ${pageKeys(pg).length}개 중 현황판에서 바로 계산한 것 ${c.측정}개, Claude 추정 ${c.추정}개, 직접 넣은 값 ${c.수기}개, 원천이 없어 비워 둔 것 ${c.미확인}개입니다. 비워 둔 숫자는 꾸며 넣지 않았습니다.`;
  }

  const SEED_REQ = [
    'AI로 각 직원의 생산성이 향상된 정도와 그것을 가치로 연결할 수 있는 예측치',
    '고객들의 생산성을 콘테스트를 통하여 회사의 브랜드 가치를 향상시킨 가치',
    '직원들에게 제공하는 AI 비용의 토큰양 중 비사용 토큰량과, 토큰을 산출물로 만든 것과 산출물의 추정가치·브랜딩 가치·돈으로 실현된 가치 측정'
  ];
  if (!N().pages) N().pages = SEED_REQ.map(makePage);
  const pageById = (id) => N().pages.find((p) => p.id === id);

  /* ---------- 채팅 명령(목업 규칙) ---------- */
  const ADD_WORDS = [['실현', 'realized'], ['브랜딩', 'brandValue'], ['브랜드', 'brandValue'], ['비용', 'cost14'], ['토큰', 'tok14'], ['안 쓴', 'unused14'], ['비사용', 'unused14'], ['사용률', 'useRate'], ['산출물', 'outputs'], ['절감', 'savedH'], ['향상률', 'uplift'], ['노출', 'cImpr'], ['참가', 'cParticipants']];
  const BLOCK_WORDS = [['추이', 'trend'], ['그래프', 'trend'], ['막대', 'trend'], ['공식', 'formula'], ['계산', 'formula'], ['원천', 'sources'], ['단계', 'funnel'], ['깔때기', 'funnel'], ['메모', 'note']];
  const HELP = '목업에서는 이런 말을 알아듣습니다: “제목을 「…」로 바꿔”, “추이 그래프 넣어”, “실현된 가치 추가”, “공식 빼”, “메모: …”, “원천은 회계 장부”. 실서비스에서는 Claude가 자유롭게 페이지를 고칩니다.';
  function claudeEdit(pg, text) {
    const t = text.trim();
    let m = t.match(/제목[을를은는]?\s*[「“"']?(.+?)[」”"']?\s*(?:으로|로)\s*(?:바꿔|변경|해)/);
    if (m) { pg.title = m[1].trim().slice(0, 40); return `제목을 「${pg.title}」로 바꿨습니다.`; }
    m = t.match(/^(?:메모|설명)\s*[:：]\s*(.+)/);
    if (m) { pg.blocks.push({ t: 'note', text: m[1].slice(0, 200) }); return '메모를 페이지 아래에 붙였습니다.'; }
    m = t.match(/원천[은는이]?\s*(.+?)(?:이야|이에요|입니다|야|예요)?$/);
    if (m && !/빼|삭제|지워/.test(t)) {
      let src = pg.blocks.find((b) => b.t === 'sources'); if (!src) { src = { t: 'sources', items: [] }; pg.blocks.push(src); }
      src.items = src.items.filter((x) => x[1] !== '미정'); src.items.push([m[1].trim().slice(0, 40), '연결 요청', 'Claude가 연결 방법을 확인 중(목업)']);
      return `원천 「${m[1].trim()}」을 기록했습니다. 연결되기 전까지 숫자는 미확인으로 둡니다.`;
    }
    if (/빼|삭제|지워|없애/.test(t)) {
      const hit = BLOCK_WORDS.find(([w]) => t.includes(w));
      if (hit) { const before = pg.blocks.length; pg.blocks = pg.blocks.filter((b) => b.t !== hit[1]); return before !== pg.blocks.length ? `「${hit[0]}」 영역을 뺐습니다.` : `「${hit[0]}」 영역은 원래 없습니다.`; }
      const kh = ADD_WORDS.find(([w]) => t.includes(w));
      if (kh) { let n = 0; pg.blocks.forEach((b) => { if (b.keys && b.keys.includes(kh[1])) { b.keys = b.keys.filter((k) => k !== kh[1]); n++; } }); return n ? `「${M[kh[1]].label}」 숫자를 뺐습니다.` : '그 숫자는 페이지에 없습니다.'; }
    }
    if (/추이|그래프|막대/.test(t)) {
      if (pg.blocks.some((b) => b.t === 'trend')) return '추이 그래프는 이미 있습니다.';
      pg.blocks.splice(1, 0, { t: 'trend', title: 'AI 사용량 추이(Claude 토큰, 일별)' });
      return '현황판에 일별 기록이 있는 Claude 토큰 추이를 넣었습니다. 다른 숫자의 추이는 원천이 연결되면 그립니다.';
    }
    if (/추가|넣어|보여/.test(t)) {
      const kh = ADD_WORDS.find(([w]) => t.includes(w));
      if (kh) {
        if (pageKeys(pg).includes(kh[1])) return `「${M[kh[1]].label}」은 이미 페이지에 있습니다.`;
        let k = pg.blocks.find((b) => b.t === 'kpis'); if (!k) { k = { t: 'kpis', keys: [] }; pg.blocks.unshift(k); }
        k.keys.push(kh[1]); const r = mval(pg, kh[1]);
        return `「${M[kh[1]].label}」을 추가했습니다 — ${r.v == null ? '원천이 없어 미확인(—)으로 둡니다.' : `${r.s} 값입니다.`}`;
      }
    }
    return null;
  }
  function chatTurn(pg, text) {
    pg.chat.push({ r: 'u', t: text });
    const reply = claudeEdit(pg, text);
    if (reply) { pg.ver += 1; pg.updated = S.today; }
    pg.chat.push({ r: 'c', t: reply || HELP });
  }

  /* ---------- 그리기: 게시판 ---------- */
  const COVERS = ['nb-cv0', 'nb-cv1', 'nb-cv2', 'nb-cv3'];
  function boardCard(pg) {
    const h = mval(pg, pg.head);
    const c = tally(pg);
    const tot = pageKeys(pg).length;
    return `<button type="button" class="nb-news" data-act="numbersOpen" data-id="${pg.id}" aria-label="${esc(pg.title)} 열기">
      <div class="nb-cover ${COVERS[pg.cover % 4]}">
        <span class="nb-cover-k">${esc(mLabel(pg, pg.head))} ${badge(h.s)}</span>
        <span class="nb-cover-v num">${showV(h.v, M[pg.head].unit)}</span>
        ${h.v == null && M[pg.head].need ? `<span class="nb-cover-need">${esc(M[pg.head].need)} 입력 필요</span>` : ''}
      </div>
      <div class="nb-news-body">
        <h3>${esc(pg.title)}</h3>
        <p class="nb-req">“${esc(pg.req.length > 70 ? pg.req.slice(0, 70) + '…' : pg.req)}”</p>
        <div class="nb-meter" aria-label="숫자 ${tot}개 중 확인된 것 ${tot - c.미확인}개">${['측정', '추정', '수기', '미확인'].map((s) => (c[s] ? `<i class="s-${s === '측정' ? 'm' : s === '추정' ? 'e' : s === '수기' ? 'h' : 'u'}" style="flex:${c[s]}"></i>` : '')).join('')}</div>
        <div class="nb-news-foot"><span>확인 ${tot - c.미확인}/${tot} · 미확인 ${c.미확인}</span><span>v${pg.ver} · ${md(pg.updated)}</span></div>
      </div>
    </button>`;
  }
  function viewBoard() {
    const u = ui();
    const pages = N().pages;
    return `<section class="panel nb-ask">
        <form data-form="numbersAsk" class="nb-ask-form">
          <label class="f" for="nb-ask-in"><b class="nb-ask-t">보고 싶은 숫자를 글로 적어 주세요</b><span>Claude가 숫자를 찾아 카드로 올리고, 지켜보는 페이지를 만들어 드립니다.</span></label>
          <textarea id="nb-ask-in" name="req" required maxlength="300" rows="2" placeholder="예: 이번 달 AI로 줄인 보고서 작성 시간과 그 가치"></textarea>
          <div class="row"><button class="btn primary">Claude에게 찾아 달라고 하기</button><button type="button" class="btn" data-act="numbersStudio" data-id="">채팅으로 직접 만들기</button></div>
        </form>
      </section>
      ${pages.length ? `<div class="nb-board">${pages.map(boardCard).join('')}</div>` : '<div class="nb-empty">아직 등록한 숫자가 없습니다. 위에 보고 싶은 숫자를 적어 보세요.</div>'}
      <p class="small muted" style="margin:0">목업: Claude의 응답은 화면 안 규칙으로 흉내 냅니다. 실서비스에서는 서버에서 Claude가 원천을 찾고 페이지를 만듭니다. ${badge('미확인')}은 원천이 없어 비워 둔 숫자입니다.${u.lastNew ? '' : ''}</p>`;
  }

  /* ---------- 그리기: 모니터링 페이지 본문(상세·미리보기 공용) ---------- */
  function kpiTile(pg, k, inStudio) {
    const r = mval(pg, k); const m = M[k]; const u = ui();
    const editing = !inStudio && u.pgEntry === pg.id + ':' + k;
    return `<div class="nb-tile${r.v == null ? ' none' : ''}">
      <span class="nb-tile-k">${esc(mLabel(pg, k))} ${badge(r.s)}</span>
      <span class="nb-tile-v num">${showV(r.v, m.unit)}</span>
      <span class="nb-tile-n">${r.v == null ? (m.need ? `${esc(m.need)}을(를) 넣으면 계산합니다` : '원천 없음 — 꾸며 넣지 않습니다') : r.d ? `${esc(r.d)} 입력` : r.s === '측정' ? '현황판 자동 계산' : r.s === '추정' ? 'Claude 산정' : ''}</span>
      ${m.manual && !inStudio ? (editing ? `<form class="nb-tile-form" data-form="numbersPgVal" data-id="${pg.id}" data-k="${k}"><input type="number" step="any" name="v" required aria-label="${esc(mLabel(pg, k))} 값" value="${r.s === '수기' ? r.v : ''}"><button class="btn sm primary">저장</button><button type="button" class="btn sm" data-act="numbersPgEntry" data-v="">취소</button></form>` : `<button type="button" class="btn sm" data-act="numbersPgEntry" data-v="${pg.id}:${k}">${r.s === '수기' ? '값 고치기' : '값 넣기'}</button>`) : ''}
    </div>`;
  }
  function tokTrend() {
    const pts = S.usage.slice(-14).map((x) => ({ d: x.date, v: +((x.input_tokens + x.output_tokens) / 1e6).toFixed(2) }));
    const max = Math.max(...pts.map((p) => p.v), 1e-9);
    return `<div class="nb-trend nb-trend-lg" role="img" aria-label="최근 14일 Claude 토큰 추이">${pts.map((p, i) => `<div class="nb-bar${i === pts.length - 1 ? ' now' : ''}" title="${md(p.d)} · ${p.v}M"><div class="nb-col"><i style="height:${Math.max(4, Math.round((p.v / max) * 100))}%"></i></div><span>${i % 2 === pts.length % 2 ? '' : md(p.d)}</span></div>`).join('')}</div>`;
  }
  function blockHtml(pg, b, inStudio) {
    switch (b.t) {
      case 'kpis': return `<div class="nb-tiles">${b.keys.map((k) => kpiTile(pg, k, inStudio)).join('')}</div>`;
      case 'funnel': return `<section class="nb-blk"><h4>지급 토큰에서 실현된 돈까지</h4><ol class="nb-funnel">${b.keys.map((k, i) => { const r = mval(pg, k); return `<li><span class="nb-step">${i + 1}</span><span class="nb-fk">${esc(mLabel(pg, k))}</span>${badge(r.s)}<b class="num">${showV(r.v, M[k].unit)}</b></li>`; }).join('')}</ol>${inStudio ? '' : `<div class="nb-tiles nb-tiles-sm">${b.keys.filter((k) => M[k].manual).map((k) => kpiTile(pg, k, false)).join('')}</div>`}</section>`;
      case 'formula': return `<section class="nb-blk"><h4>이렇게 계산합니다</h4><ul class="nb-formula">${b.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul></section>`;
      case 'trend': return `<section class="nb-blk"><h4>${esc(b.title)} ${badge('측정')}</h4>${tokTrend()}</section>`;
      case 'empty': return `<section class="nb-blk"><h4>${esc(b.title)} ${badge('미확인')}</h4><p class="nb-blank">${esc(b.text)}</p></section>`;
      case 'sources': return `<section class="nb-blk"><h4>데이터 원천</h4><ul class="nb-src">${b.items.map(([n, st, how]) => `<li><span class="nb-src-st ${st === '연결됨' ? 'on' : ''}">${esc(st)}</span><b>${esc(n)}</b><span class="muted">${esc(how || '')}</span></li>`).join('')}</ul></section>`;
      case 'note': return `<section class="nb-blk nb-note"><p>${esc(b.text)}</p></section>`;
      default: return '';
    }
  }
  const pageBody = (pg, inStudio) => `<div class="nb-page">
      <div class="nb-page-hero ${COVERS[pg.cover % 4]}"><div><div class="nb-page-kicker">내가 보는 숫자 · v${pg.ver}</div><h3>${esc(pg.title)}</h3><p>${esc(pg.summary)}</p></div></div>
      ${pg.blocks.map((b) => blockHtml(pg, b, inStudio)).join('')}
    </div>`;

  function viewPage(pg) {
    const u = ui();
    return `<div class="nb-pagebar">
        <button type="button" class="btn" data-act="numbersBack">← 숫자 게시판</button>
        <span class="nb-spacer"></span>
        <button type="button" class="btn primary" data-act="numbersStudio" data-id="${pg.id}">Claude와 고치기</button>
        <button type="button" class="btn" data-act="numbersRefind" data-id="${pg.id}">다시 찾기</button>
        <button type="button" class="btn nb-danger" data-act="numbersPgDelAsk" data-id="${pg.id}">삭제</button>
      </div>
      ${u.pgDel === pg.id ? `<div class="nb-panel nb-confirm" role="alertdialog" aria-label="삭제 확인"><p style="margin:0 0 8px">「${esc(pg.title)}」 페이지와 넣은 값·대화 기록을 모두 지울까요? 되돌릴 수 없습니다.</p><div class="row"><button type="button" class="btn sm nb-danger" data-act="numbersPgDel" data-id="${pg.id}">삭제 확인</button><button type="button" class="btn sm" data-act="numbersPgDelAsk" data-id="">취소</button></div></div>` : ''}
      <p class="nb-req nb-req-lg">요청: “${esc(pg.req)}” <span class="muted">· ${esc(pg.created)} 등록 · 마지막 수정 ${esc(pg.updated)}</span></p>
      ${pageBody(pg, false)}`;
  }

  /* ---------- 그리기: 채팅 + 미리보기(Claude 데스크톱 앱처럼) ---------- */
  function viewStudio(pg) {
    const chat = pg ? pg.chat : [{ r: 'c', t: '어떤 숫자를 보고 싶으신가요? 글로 적어 주시면 찾아서 오른쪽에 페이지를 만들어 드립니다.' }];
    return `<div class="nb-pagebar">
        <button type="button" class="btn" data-act="${pg ? 'numbersOpen' : 'numbersBack'}" data-id="${pg ? pg.id : ''}">← ${pg ? '페이지로' : '숫자 게시판'}</button>
        <span class="nb-studio-t">${pg ? esc(pg.title) : '새 숫자 페이지'}</span>
      </div>
      <div class="nb-studio">
        <section class="nb-chat" aria-label="Claude와 대화">
          <div class="nb-chat-log" id="nbChatLog" aria-live="polite">${chat.map((m) => `<div class="nb-msg ${m.r === 'u' ? 'me' : 'cl'}">${m.r === 'c' ? '<span class="nb-who">Claude</span>' : ''}${esc(m.t)}</div>`).join('')}</div>
          <form class="nb-chat-form" data-form="numbersChat" data-id="${pg ? pg.id : ''}">
            <textarea name="msg" rows="2" required maxlength="300" aria-label="메시지" placeholder="${pg ? '예: 실현된 가치 추가 / 추이 그래프 넣어 / 제목을 「…」로 바꿔' : '예: 가맹점별 AI 활용 교육 이수율'}"></textarea>
            <button class="btn primary">보내기</button>
          </form>
          ${pg ? '' : '<p class="small muted" style="margin:0">첫 메시지가 숫자 요청이 되고, 게시판에 카드가 생깁니다.</p>'}
        </section>
        <section class="nb-artifact" aria-label="미리보기">
          <div class="nb-artifact-bar"><span>미리보기</span>${pg ? `<span class="muted">v${pg.ver}</span>` : ''}</div>
          ${pg ? pageBody(pg, true) : '<div class="nb-empty" style="margin:12px">메시지를 보내면 여기에 페이지가 나타납니다.</div>'}
        </section>
      </div>`;
  }

  /* ---------- 메뉴 화면 ---------- */
  function viewNumbers() {
    const u = ui();
    if (!u.mode) u.mode = 'dash';
    const pg = u.open ? pageById(u.open) : null;
    if (u.mode === 'page' && !pg) u.mode = 'board';
    const mode = u.mode;
    const head = `<div class="view-head"><div><h2>내가 보는 숫자</h2><p>아침에 「오늘 볼 숫자」만 보면 됩니다. 보고 싶은 숫자는 글로 적으면 Claude가 찾아 카드로 올립니다.</p></div>
      <div class="seg" role="tablist" aria-label="보기">${[['dash', '계기판'], ['board', '숫자 게시판'], ['cards', '핵심 숫자']].map(([k, l]) => `<button type="button" data-act="numbersMode" data-v="${k}" aria-pressed="${(k === 'board' ? ['board', 'page', 'studio'].includes(mode) : mode === k)}">${l}</button>`).join('')}</div></div>${inboxBox()}`;
    if (mode === 'dash') return head + viewDash();
    if (mode === 'cards') return head + viewCards();
    if (mode === 'page') return head + viewPage(pg);
    if (mode === 'studio') return head + viewStudio(pg);
    return head + viewBoard();
  }

  const top = () => setTimeout(() => window.scrollTo(0, 0), 0);
  const chatBottom = (focus) => setTimeout(() => { const l = document.getElementById('nbChatLog'); if (l) l.scrollTop = l.scrollHeight; const t = document.querySelector('[data-form="numbersChat"] textarea'); if (t && focus) t.focus({ preventScroll: true }); }, 0);
  A.numbersMode = (el) => { const u = ui(); u.mode = el.dataset.v; u.open = null; top(); };
  A.numbersBack = () => { const u = ui(); u.mode = 'board'; u.open = null; u.pgDel = null; top(); };
  A.numbersOpen = (el) => { const u = ui(); u.mode = 'page'; u.open = el.dataset.id; u.pgEntry = null; u.pgDel = null; top(); };
  A.numbersStudio = (el) => { const u = ui(); u.mode = 'studio'; u.open = el.dataset.id || null; top(); chatBottom(true); };
  A.numbersPgEntry = (el) => { ui().pgEntry = el.dataset.v || null; if (el.dataset.v) setTimeout(() => { const i = document.querySelector('.nb-tile-form input'); if (i) i.focus(); }, 0); };
  A.numbersPgDelAsk = (el) => { ui().pgDel = el.dataset.id || null; };
  A.numbersPgDel = (el) => { const p = pageById(el.dataset.id); N().pages = N().pages.filter((x) => x.id !== el.dataset.id); A.numbersBack(); toast(`「${p ? p.title : ''}」 페이지를 지웠습니다`); };
  A.numbersRefind = (el) => { const p = pageById(el.dataset.id); p.updated = S.today; p.chat.push({ r: 'u', t: '다시 찾아 줘' }, { r: 'c', t: foundMsg(p) }); toast('현황판 값을 다시 읽었습니다'); };

  APP.forms.numbersAsk = (fd) => {
    const req = (fd.get('req') || '').toString().trim(); if (!req) return;
    const pg = makePage(req); N().pages.unshift(pg);
    const u = ui(); u.mode = 'page'; u.open = pg.id; top();
    toast('Claude가 숫자를 찾아 페이지를 만들었습니다(목업)');
  };
  APP.forms.numbersChat = (fd, form) => {
    const text = (fd.get('msg') || '').toString().trim(); if (!text) return;
    let pg = pageById(form.dataset.id);
    if (!pg) { pg = makePage(text); N().pages.unshift(pg); ui().open = pg.id; }
    else chatTurn(pg, text);
    chatBottom(true);
  };
  APP.forms.numbersPgVal = (fd, form) => {
    const pg = pageById(form.dataset.id); const k = form.dataset.k; const v = num(fd.get('v'));
    if (!pg || !M[k] || !M[k].manual) return;
    if (v == null) { toast('값을 숫자로 넣어 주세요'); return; }
    pg.manual[k] = { v, d: S.today }; pg.updated = S.today; ui().pgEntry = null;
    toast(`${mLabel(pg, k)}: ${Number(v).toLocaleString('ko-KR')}${M[k].unit} 기록(수기)`);
  };


  /* =====================================================================
     회장 계기판 — 아침에 '오늘 볼 숫자 3개'만 보면 되는 화면.
     P1 숫자 분해 나무·목표 역산·담당자 / P2 이상 신호·오늘 볼 숫자·원인 가설·오늘 할 일로 보내기
     P3 시나리오 계산기·주간 숫자 리포트. 원천 없는 숫자는 '—'·미확인, 예시는 '예시값' 표시로만.
     ===================================================================== */
  S.activity = S.activity || [];
  S.inbox = S.inbox || [];
  const NX = N();
  NX.hyp = NX.hyp || {};
  NX.ex = NX.ex || { stores: 100, guests: 3000, ticket: 10000 }; // 예시값(실제 수치 아님)
  NX.treeTarget = NX.treeTarget || {};
  NX.scn = NX.scn || { ds: 5, dg: 0, dt: 3 };
  NX.cards.forEach((c) => { if (c.owner == null) c.owner = ''; });

  function logAct(type, text, ref) {
    S.activity.push({ id: uid('ac'), at: new Date().toISOString(), menu: 'numbers', type, text, ref: ref || '' });
    if (S.activity.length > 300) S.activity.splice(0, S.activity.length - 300);
  }
  const exBadge = '<span class="b nb-exb" title="예시값: 구조를 보여 주려고 넣은 가짜 값입니다. 실제 수치가 아닙니다">예시값</span>';
  const aiBadge = '<span class="b nb-aib" title="목업 AI: 화면 안 규칙으로 만든 문장입니다">목업 AI</span>';
  const curVal = (c) => { if (c.source === '미확인' && !c.calc) return null; const p = series(c); return p.length ? p[p.length - 1].v : null; };

  /* ---------- 담당자: 입력해서 찾는 칸 (이름·부서·직급·초성, ↑↓·Enter·Esc·×) ---------- */
  function people() {
    const m = new Map();
    const add = (n, d, g) => { if (n && !m.has(n)) m.set(n, { n, d, g }); };
    add('회장 직접', '회장실', '');
    (S.ORGS || []).forEach((o) => add(`${o} 책임자`, o, '부서장'));
    S.directives.forEach((d) => add(d.assignee, d.org, '담당'));
    return [...m.values()].filter((p) => p.n !== '미지정');
  }
  const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
  const cho = (s) => String(s || '').replace(/[가-힣]/g, (ch) => CHO[Math.floor((ch.charCodeAt(0) - 0xAC00) / 588)]);
  const NBP = {};
  function picker(o) {
    NBP[o.key] = { act: o.act || '', id: o.id || '' };
    const v = o.value || '';
    return `<span class="nbp"><input type="text" class="nbp-in" id="nbp-${esc(o.key)}" role="combobox" aria-expanded="false" aria-autocomplete="list" aria-controls="nbpl-${esc(o.key)}" aria-label="${esc(o.label || '담당자 찾기')}" autocomplete="off" spellcheck="false" data-nbpk="${esc(o.key)}" data-prev="${esc(v)}" value="${esc(v)}" placeholder="담당 없음 · 이름·부서·초성" title="이름·부서·직급·초성(예: ㄱㅇㅈ)으로 찾기">${o.name ? `<input type="hidden" name="${esc(o.name)}" value="${esc(v)}">` : ''}${v ? `<button type="button" class="nbp-x" data-nbpx="${esc(o.key)}" tabindex="-1" aria-label="담당자 지우기" title="지우기">×</button>` : ''}<ul class="nbp-list" id="nbpl-${esc(o.key)}" role="listbox" hidden></ul></span>`;
  }
  function nbpMatches(q) {
    q = String(q || '').trim().toLowerCase();
    const onlyCho = q && /^[ㄱ-ㅎ\s]+$/.test(q);
    return people().map((p) => {
      if (!q) return [p, 0];
      const n = p.n.toLowerCase(); const hay = [p.n, p.d, p.g].join(' ').toLowerCase();
      if (onlyCho) { const c = cho(p.n); return [p, c.startsWith(q) ? 1 : c.includes(q) ? 2 : cho(hay).includes(q) ? 3 : -1]; }
      return [p, n.startsWith(q) ? 1 : n.includes(q) ? 2 : hay.includes(q) ? 3 : -1];
    }).filter((x) => x[1] >= 0).sort((a, b) => a[1] - b[1] || a[0].n.localeCompare(b[0].n, 'ko')).map((x) => x[0]);
  }
  function nbpOpen(inp, q) {
    const ul = inp.parentNode.querySelector('.nbp-list'); const hits = nbpMatches(q);
    ul.innerHTML = (!String(q || '').trim() ? '<li role="option" data-v="" class="nbp-empty">담당 없음</li>' : '')
      + hits.map((p) => `<li role="option" data-v="${esc(p.n)}"><b>${esc(p.n)}</b><span>${esc([p.d, p.g].filter(Boolean).join(' · '))}</span></li>`).join('')
      + (!hits.length ? '<li class="nbp-none" aria-disabled="true">맞는 사람이 없습니다</li>' : '');
    ul.hidden = false; inp.setAttribute('aria-expanded', 'true');
    nbpActive(inp, ul.querySelector('li[data-v]' + (String(q || '').trim() ? ':not(.nbp-empty)' : '')));
  }
  function nbpActive(inp, li) {
    const ul = inp.parentNode.querySelector('.nbp-list');
    ul.querySelectorAll('li.on').forEach((x) => x.classList.remove('on'));
    if (li) { li.classList.add('on'); li.id = li.id || uid('nbpo'); inp.setAttribute('aria-activedescendant', li.id); li.scrollIntoView({ block: 'nearest' }); } else inp.removeAttribute('aria-activedescendant');
  }
  function nbpClose(inp) { const ul = inp.parentNode && inp.parentNode.querySelector('.nbp-list'); if (ul) ul.hidden = true; inp.setAttribute('aria-expanded', 'false'); }
  function nbpPick(inp, v) {
    const reg = NBP[inp.dataset.nbpk]; if (!reg) return;
    inp.value = v; inp.dataset.prev = v; nbpClose(inp);
    const h = inp.parentNode.querySelector('input[type="hidden"]'); if (h) h.value = v;
    if (reg.act) { inp.dataset.picked = '1'; const b = document.createElement('button'); b.type = 'button'; b.hidden = true; b.dataset.act = reg.act; b.dataset.id = reg.id; b.dataset.v = v; document.body.appendChild(b); b.click(); b.remove(); }
  }
  document.addEventListener('focusin', (e) => { const t = e.target; if (t && t.dataset && t.dataset.nbpk) { t.select(); nbpOpen(t, ''); } });
  document.addEventListener('input', (e) => { const t = e.target; if (t && t.dataset && t.dataset.nbpk) nbpOpen(t, t.value); });
  document.addEventListener('focusout', (e) => {
    const t = e.target; if (!t || !t.dataset || !t.dataset.nbpk) return;
    if (t.dataset.picked) { delete t.dataset.picked; nbpClose(t); return; }
    nbpClose(t);
    const typed = t.value.trim(); if (typed === t.dataset.prev) return;
    if (!typed) { nbpPick(t, ''); return; }
    const hits = nbpMatches(typed); const exact = hits.find((p) => p.n === typed) || (hits.length === 1 ? hits[0] : null);
    if (exact) nbpPick(t, exact.n); else t.value = t.dataset.prev; // 없는 이름은 원래 값으로
  });
  window.addEventListener('keydown', (e) => {
    const t = e.target; if (!t || !t.dataset || !t.dataset.nbpk) return;
    const ul = t.parentNode.querySelector('.nbp-list');
    const opts = [...ul.querySelectorAll('li[data-v]')]; const cur = ul.querySelector('li.on'); const i = opts.indexOf(cur);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (ul.hidden) { nbpOpen(t, ''); return; } nbpActive(t, opts[e.key === 'ArrowDown' ? Math.min(opts.length - 1, i + 1) : Math.max(0, i - 1)] || null); }
    else if (e.key === 'Enter') { e.preventDefault(); if (!ul.hidden && cur) nbpPick(t, cur.dataset.v); }
    else if (e.key === 'Escape' && !ul.hidden) { e.preventDefault(); e.stopImmediatePropagation(); t.value = t.dataset.prev; nbpClose(t); }
  }, true);
  document.addEventListener('mousedown', (e) => {
    const t = e.target; if (!t || !t.closest) return;
    const li = t.closest('.nbp-list li[data-v]');
    if (li) { e.preventDefault(); nbpPick(li.closest('.nbp').querySelector('.nbp-in'), li.dataset.v); return; }
    if (t.closest('.nbp-list')) { e.preventDefault(); return; }
    const x = t.closest('[data-nbpx]');
    if (x) { e.preventDefault(); const inp = x.closest('.nbp').querySelector('.nbp-in'); nbpPick(inp, ''); if (!NBP[inp.dataset.nbpk].act) { x.remove(); inp.focus(); } }
  });
  A.numbersOwnerSet = (el) => { const c = byId(el.dataset.id); if (!c) return; c.owner = el.dataset.v || ''; logAct('owner', `「${c.name}」 담당 → ${c.owner || '없음'}`, c.id); toast(c.owner ? `「${c.name}」 담당을 ${c.owner}(으)로 정했습니다` : '담당을 비웠습니다'); };

  /* ---------- P2 이상 신호 ---------- */
  function signals(c) {
    if (c.hidden) return [];
    const out = []; const pts = series(c); const v = curVal(c);
    if (isAlarm(c, v)) out.push({ k: 'alarm', w: 3, t: `경보 기준(${fmtUnit(c.alarmV, c.unit)} ${c.alarmDir}) 넘음` });
    const r = rate(c, v); if (r != null && r <= 80) out.push({ k: 'target', w: 2, t: `목표 대비 ${r - 100}%` });
    if (pts.length >= 4) {
      const l = pts.slice(-4).map((p) => p.v); const worse = (a, b) => (better(c) === 'up' ? b < a : b > a);
      if (worse(l[0], l[1]) && worse(l[1], l[2]) && worse(l[2], l[3])) out.push({ k: 'streak', w: 2, t: `3회 연속 ${better(c) === 'up' ? '하락' : '상승'}` });
    }
    if (stale(c)) out.push({ k: 'stale', w: 1, t: `갱신 지연(${c.freq} 주기)` });
    return out;
  }
  function flagged() {
    return NX.cards.map((c) => ({ c, s: signals(c) })).filter((x) => x.s.length)
      .map((x) => Object.assign(x, { w: x.s.reduce((a, b) => a + b.w, 0) })).sort((a, b) => b.w - a.w);
  }
  function hypo(c, sig) {
    const ks = sig.map((x) => x.k); const p = [];
    const open = S.directives.filter(isOpen);
    if (c.calc === 'overdue' || c.calc === 'dirRate') {
      const od = open.filter((d) => d.due_at < S.today).sort((a, b) => a.due_at.localeCompare(b.due_at));
      if (od[0]) p.push(`가장 오래 밀린 지시는 「${od[0].title}」(${od[0].org}, ${days(od[0].due_at, S.today)}일 경과)입니다.`);
      const by = {}; od.forEach((d) => { by[d.org] = (by[d.org] || 0) + 1; }); const top = Object.entries(by).sort((a, b) => b[1] - a[1])[0];
      if (top && top[1] > 1) p.push(`기한 경과가 ${top[0]}에 ${top[1]}건 몰려 있습니다.`);
      const wait = open.filter((d) => d.status === '보고대기').length;
      if (c.calc === 'dirRate' && wait) p.push(`보고대기 ${wait}건을 확인·완료하면 이행률이 바로 오릅니다.`);
    } else if (c.calc === 'waiting') {
      const w = (S.waiting || []).slice().sort((a, b) => a.since.localeCompare(b.since))[0];
      if (w) p.push(`가장 오래 기다린 건은 「${w.title}」(${w.from}, ${days(w.since, S.today)}일)입니다.`);
    } else if (c.calc === 'quizToday') {
      p.push('오늘 학습 기록이 아직 적습니다. 경영학습의 「오늘의 복습 도전」 10문제로 목표를 채울 수 있습니다.');
    } else if (c.calc === 'aiTok' || c.calc === 'aiCost') {
      p.push([0, 6].includes(new Date().getDay()) ? '주말에는 사용량이 줄어드는 패턴입니다.' : '평일 사용량 변동입니다. 특정 작업(대량 문서 처리 등)이 몰렸는지 확인이 필요합니다.');
    }
    if (ks.includes('stale')) p.push('수기 입력이 밀렸습니다. 담당자에게 갱신을 요청하세요.');
    if (!p.length) p.push('원인을 판단할 자료가 부족합니다. 담당자 확인이 필요합니다.');
    return p.join(' ');
  }
  function sentToday(c) { return S.inbox.some((x) => x.from === 'numbers' && x.to === 'today' && !x.done && x.payload && x.payload.cardId === c.id && x.at.slice(0, 10) === S.today); }

  function todayCard(x, i) {
    const { c, s } = x; const v = curVal(c); const u = ui();
    const memo = NX.hyp[c.id]; const editing = u.hypEdit === c.id;
    const sent = sentToday(c);
    return `<article class="nb-t3" aria-labelledby="nb-t3-${c.id}">
      <div class="nb-t3-top"><span class="nb-t3-n num">${i + 1}</span><div class="nb-t3-name"><span class="nb-group">${esc(c.group)}</span><h3 id="nb-t3-${c.id}">${esc(c.name)}</h3></div>${badge(c.source)}</div>
      <div class="nb-t3-v num">${v == null ? '—' : fmt(v)}${v != null && c.unit ? `<small>${esc(c.unit)}</small>` : ''}</div>
      <ul class="nb-sigs">${s.map((g) => `<li class="sg-${g.k}">${esc(g.t)}</li>`).join('')}</ul>
      <div class="nb-hyp">
        <div class="nb-hyp-h">원인 가설 ${memo ? `<span class="b h" title="직접 고친 메모">수기</span><span class="small muted">${esc(memo.at)}</span>` : aiBadge}</div>
        ${editing ? `<form data-form="numbersHyp" data-id="${c.id}" class="nb-hyp-form"><textarea id="nb-hyp-${c.id}" name="t" rows="3" maxlength="300" aria-label="원인 가설 메모">${esc(memo ? memo.text : hypo(c, s))}</textarea><div class="row"><button class="btn sm primary">메모 저장</button>${memo ? `<button type="button" class="btn sm" data-act="numbersHypReset" data-id="${c.id}">AI 가설로 되돌리기</button>` : ''}<button type="button" class="btn sm" data-act="numbersHypEdit" data-id="">취소</button></div></form>`
          : `<p>${esc(memo ? memo.text : hypo(c, s))}</p><button type="button" class="btn sm" data-act="numbersHypEdit" data-id="${c.id}">메모 고치기</button>`}
      </div>
      <label class="nb-own"><span>담당</span>${picker({ key: 't3-' + c.id, act: 'numbersOwnerSet', id: c.id, value: c.owner, label: `${c.name} 담당자 찾기` })}</label>
      <div class="row nb-t3-act">
        <button type="button" class="btn sm ${sent ? '' : 'primary'}" data-act="numbersSendToday" data-id="${c.id}" ${sent ? 'disabled' : ''}>${sent ? '오늘 할 일로 보냄 ✓' : '오늘 할 일로 보내기'}</button>
        <button type="button" class="btn sm" data-act="numbersGoCard" data-id="${c.id}">카드 보기</button>
      </div>
    </article>`;
  }

  /* ---------- P1 숫자 분해 나무 ---------- */
  const node = (k, label, unit, op, kids) => ({ k, label, unit, op, kids });
  const TREES = {
    sales: { title: '월 매출', root: node('sales', '월 매출(3개 브랜드)', '원', '×', [node('stores', '운영 점포 수', '곳'), node('perStore', '점당 월 매출', '원', '×', [node('guests', '점당 월 객수', '명'), node('ticket', '객단가', '원')])]) },
    dir: { title: '지시 이행률', root: node('rate', '지시 이행률', '%', '÷', [node('done', '완료한 지시', '건'), node('all', '전체 지시', '건')]) },
    tok: { title: '토큰 산출물 가치', root: node('val', '산출물 추정가치(확정)', '원', '×', [node('tok', '사용 토큰(14일)', 'M'), node('per', '토큰 100만당 가치', '원')]) }
  };
  function leaves(id) {
    if (id === 'sales') {
      if (!ui().useEx) return {};
      const e = NX.ex; return { stores: { v: e.stores, s: '예시' }, guests: { v: e.guests, s: '예시' }, ticket: { v: e.ticket, s: '예시' } };
    }
    if (id === 'dir') return { done: { v: S.directives.filter((d) => d.status === '완료').length, s: '측정' }, all: { v: S.directives.length, s: '측정' } };
    if (id === 'tok') { const pg = { manual: {} }; const t = mval(pg, 'tok14'); const p = mval(pg, 'valuePerM'); return { tok: { v: t.v, s: t.s }, per: { v: p.v, s: p.s } }; }
    return {};
  }
  const RANK = ['측정', '수기', '추정', '예시', '미확인'];
  function evalNode(n, L) {
    if (!n.kids) { const x = L[n.k]; return x && x.v != null ? { v: x.v, s: x.s } : { v: null, s: '미확인' }; }
    const vs = n.kids.map((k) => evalNode(k, L));
    const s = vs.map((x) => x.s).sort((a, b) => RANK.indexOf(b) - RANK.indexOf(a))[0];
    if (vs.some((x) => x.v == null)) return { v: null, s: '미확인' };
    if (n.op === '×') return { v: vs.reduce((a, b) => a * b.v, 1), s };
    if (n.op === '÷') return { v: vs[1].v ? (vs[0].v / vs[1].v) * (n.unit === '%' ? 100 : 1) : null, s };
    return { v: null, s: '미확인' };
  }
  function need(n, T, L, out) {
    out[n.k] = T; if (!n.kids || T == null) return;
    const vs = n.kids.map((k) => evalNode(k, L).v);
    n.kids.forEach((k, i) => {
      let r = null;
      if (n.op === '×') { const o = vs.filter((_, j) => j !== i); r = o.every((x) => x) ? T / o.reduce((a, b) => a * b, 1) : null; }
      else if (n.op === '÷') { const t = n.unit === '%' ? T / 100 : T; r = i === 0 ? (vs[1] != null ? t * vs[1] : null) : (t && vs[0] != null ? vs[0] / t : null); }
      need(k, r, L, out);
    });
  }
  const srcBadge = (s) => (s === '예시' ? exBadge : badge(s));
  const nfmt = (v, unit) => (v == null ? '—' : unit === '원' ? `${shortWon(v)}원` : `${Number(v).toLocaleString('ko-KR', { maximumFractionDigits: 1 })}${unit ? ' ' + unit : ''}`);
  function treeNode(id, n, L, req, depth) {
    const r = evalNode(n, L); const q = req[n.k];
    const gap = q != null && r.v ? Math.round(((q - r.v) / Math.abs(r.v)) * 1000) / 10 : null;
    const exIn = id === 'sales' && ui().useEx && !n.kids;
    return `<li class="nb-node${depth ? '' : ' root'}">
      <div class="nb-node-row">
        <span class="nb-node-l">${esc(n.label)}</span>
        ${exIn ? `<input type="number" id="nb-ex-${n.k}" class="nb-ex-in" min="0" step="any" value="${NX.ex[n.k]}" data-act="numbersEx" data-k="${n.k}" aria-label="${esc(n.label)} 예시값">` : `<b class="num">${nfmt(r.v, n.unit)}</b>`}
        ${srcBadge(r.s)}
        ${q != null && depth ? `<span class="nb-need${gap != null && gap > 0 ? ' up' : ''}">필요 <b class="num">${nfmt(q, n.unit)}</b>${gap != null ? ` (${gap > 0 ? '+' : ''}${gap}%)` : ''}</span>` : ''}
      </div>
      ${n.kids ? `<div class="nb-node-op">= ${n.kids.map((k) => esc(k.label)).join(n.op === '×' ? ' × ' : ' ÷ ')}${n.op === '÷' && n.unit === '%' ? ' × 100' : ''}</div><ul>${n.kids.map((k) => treeNode(id, k, L, req, depth + 1)).join('')}</ul>` : ''}
    </li>`;
  }
  function treeBox() {
    const u = ui(); const id = TREES[u.tree] ? u.tree : 'sales'; const t = TREES[id];
    const L = leaves(id); const root = evalNode(t.root, L); const T = NX.treeTarget[id];
    const req = {}; if (T != null && root.v != null) need(t.root, T, L, req);
    return `<section class="panel nb-sec" aria-labelledby="nb-h-tree">
      <div class="nb-sec-h"><h3 id="nb-h-tree">숫자 분해 나무</h3>
        <div class="seg" role="tablist" aria-label="나무 고르기">${Object.entries(TREES).map(([k, x]) => `<button type="button" data-act="numbersTree" data-v="${k}" aria-pressed="${k === id}">${esc(x.title)}</button>`).join('')}</div></div>
      ${id === 'sales' ? `<p class="nb-sec-note">매출 원천(POS·회계)이 아직 없어 실제 값은 '—'입니다. ${u.useEx ? '지금은 <b>예시값</b>으로 구조와 역산만 보여 드립니다. 칸의 숫자를 바꿔 볼 수 있습니다.' : '예시값을 켜면 구조와 목표 역산을 미리 볼 수 있습니다.'} <button type="button" class="btn sm" data-act="numbersUseEx">${u.useEx ? '예시값 끄기' : '예시값으로 보기'}</button></p>` : ''}
      <ul class="nb-tree">${treeNode(id, t.root, L, req, 0)}</ul>
      <form class="nb-target" data-form="numbersTreeTarget" data-id="${id}">
        <label class="f" for="nb-tt-${id}">목표 ${esc(t.root.label)}${t.root.unit ? `(${esc(t.root.unit)})` : ''}<input type="number" step="any" id="nb-tt-${id}" name="t" value="${T ?? ''}" placeholder="목표를 넣으면 거꾸로 계산합니다"></label>
        <div class="row"><button class="btn sm primary">역산</button>${T != null ? `<button type="button" class="btn sm" data-act="numbersTreeClear" data-id="${id}">목표 지우기</button>` : ''}</div>
      </form>
      <p class="nb-sec-note">${T == null ? '목표를 넣으면 각 칸에 「필요」 값이 나옵니다.' : root.v == null ? '현재 값이 없어 역산할 수 없습니다.' : `목표 ${nfmt(T, t.root.unit)} — 현재보다 ${Math.round(((T - root.v) / Math.abs(root.v || 1)) * 1000) / 10}%. 「필요」는 다른 칸이 그대로일 때 그 칸 하나만 바꿔서 목표에 닿는 값입니다.`}</p>
    </section>`;
  }

  /* ---------- P3 시나리오 계산기 ---------- */
  function scnCalc() {
    const e = NX.ex; const sc = NX.scn;
    const base = e.stores * e.guests * e.ticket;
    const s2 = e.stores + sc.ds; const g2 = e.guests * (1 + sc.dg / 100); const t2 = e.ticket * (1 + sc.dt / 100);
    const after = s2 * g2 * t2;
    return { base, after, rows: [['점포 수만', (s2 * e.guests * e.ticket) - base], ['객수만', (e.stores * g2 * e.ticket) - base], ['객단가만', (e.stores * e.guests * t2) - base]] };
  }
  function parseScn(t) {
    const out = {}; const num = (x) => parseFloat(String(x).replace('−', '-'));
    let m = t.match(/(점포|매장|가맹점)\s*([+\-−]?\s*\d+(?:\.\d+)?)/); if (m) out.ds = num(m[2].replace(/\s/g, ''));
    m = t.match(/(객단가|단가)\s*([+\-−]?\s*\d+(?:\.\d+)?)\s*%/); if (m) out.dt = num(m[2].replace(/\s/g, ''));
    m = t.match(/(객수|손님|방문)\s*([+\-−]?\s*\d+(?:\.\d+)?)\s*%/); if (m) out.dg = num(m[2].replace(/\s/g, ''));
    return out;
  }
  function scnBox() {
    const r = scnCalc(); const sc = NX.scn; const e = NX.ex; const d = r.after - r.base;
    const sw = (v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${shortWon(Math.abs(v))}원`;
    return `<section class="panel nb-sec" aria-labelledby="nb-h-scn">
      <div class="nb-sec-h"><h3 id="nb-h-scn">시나리오 계산기 ${exBadge}</h3></div>
      <p class="nb-sec-note">기준은 분해 나무의 예시값(점포 ${e.stores.toLocaleString('ko-KR')}곳 · 객수 ${e.guests.toLocaleString('ko-KR')}명 · 객단가 ${e.ticket.toLocaleString('ko-KR')}원)입니다. 매출 원천이 연결되면 실제 값으로 바꿔 계산합니다.</p>
      <form class="nb-scn-ask" data-form="numbersScnAsk">
        <label class="f" for="nb-scn-q">말로 물어보기<input type="text" id="nb-scn-q" name="q" maxlength="80" placeholder="예: 점포 +5, 객단가 +3%면?"></label>
        <button class="btn sm primary">계산</button>
      </form>
      <form class="nb-scn-f form" data-form="numbersScn">
        <label class="f" for="nb-scn-ds">점포 증감(곳)<input type="number" step="1" id="nb-scn-ds" name="ds" value="${sc.ds}"></label>
        <label class="f" for="nb-scn-dg">객수 증감(%)<input type="number" step="0.1" id="nb-scn-dg" name="dg" value="${sc.dg}"></label>
        <label class="f" for="nb-scn-dt">객단가 증감(%)<input type="number" step="0.1" id="nb-scn-dt" name="dt" value="${sc.dt}"></label>
        <div><button class="btn sm">다시 계산</button></div>
      </form>
      <div class="nb-scn-out">
        <div><span>지금(예시)</span><b class="num">${shortWon(r.base)}원</b></div>
        <div class="arrow" aria-hidden="true">→</div>
        <div><span>바꾼 뒤</span><b class="num">${shortWon(r.after)}원</b></div>
        <div class="${d >= 0 ? 'good' : 'bad'}"><span>차이</span><b class="num">${sw(d)} (${r.base ? (d >= 0 ? '+' : '') + Math.round((d / r.base) * 1000) / 10 : 0}%)</b></div>
      </div>
      <ul class="nb-scn-rows">${r.rows.map(([l, v]) => `<li><span>${l} 바꾸면</span><b class="num">${sw(v)}</b></li>`).join('')}<li class="muted"><span>함께 바꾸면 곱해져서 합보다 조금 커집니다</span><b class="num">${sw(d - r.rows.reduce((a, b) => a + b[1], 0))}</b></li></ul>
    </section>`;
  }

  /* ---------- P3 주간 숫자 리포트 ---------- */
  function reportText() {
    const from = dayStr(-6); const f = flagged();
    const shown = NX.cards.filter((c) => !c.hidden);
    const line = (c) => {
      const p = series(c); const v = curVal(c);
      const first = p.length > 1 ? p.find((x) => x.d >= from) : null;
      const wk = v != null && first && first.d !== p[p.length - 1].d ? ` (주초 ${md(first.d)} 대비 ${v - first.v >= 0 ? '+' : ''}${fmt(+(v - first.v).toFixed(2))}${c.unit})` : '';
      return `- ${c.name}: ${v == null ? '—' : fmt(v) + c.unit} [${c.source}]${wk}${c.owner ? ` · 담당자: ${c.owner}` : ''}`;
    };
    const L = [`# 주간 숫자 리포트 (${md(from)}~${md(S.today)})`, '', '## 오늘 볼 숫자'];
    if (f.length) f.slice(0, 3).forEach((x) => { L.push(line(x.c) + ` — ${x.s.map((g) => g.t).join(', ')}`); L.push(`  - 원인 가설: ${NX.hyp[x.c.id] ? NX.hyp[x.c.id].text : hypo(x.c, x.s) + ' (목업 AI)'}`); });
    else L.push('- 이상 신호가 있는 숫자가 없습니다.');
    L.push('', '## 핵심 숫자');
    shown.filter((c) => c.source !== '미확인' || c.hist.length).forEach((c) => L.push(line(c)));
    const unk = shown.filter((c) => c.source === '미확인' && !c.hist.length);
    if (unk.length) L.push('', '## 원천 미확인(값 없음)', `- ${unk.map((c) => c.name).join(', ')}`);
    L.push('', `_배지: 측정=현황판 계산, 수기=직접 입력, 추정=Claude 산정, 미확인=수집 경로 없음 · 생성 ${S.today}_`);
    return L.join('\n');
  }
  function reportBox() {
    return `<section class="panel nb-sec" aria-labelledby="nb-h-rep">
      <div class="nb-sec-h"><h3 id="nb-h-rep">주간 숫자 리포트</h3><button type="button" class="btn sm primary" data-act="numbersCopyReport">Markdown 복사</button></div>
      <pre class="nb-report" id="nbReport" tabindex="0">${esc(reportText())}</pre>
      <p class="nb-sec-note">복사가 막힌 화면에서는 글을 선택해 두니 길게 눌러 복사하세요.</p>
    </section>`;
  }

  /* ---------- 받은 항목 ---------- */
  function inboxBox() {
    const items = S.inbox.filter((x) => x.to === 'numbers' && !x.done);
    if (!items.length) return '';
    return `<section class="panel nb-inbox" aria-labelledby="nb-h-in"><h3 id="nb-h-in">받은 항목 <span class="num">${items.length}</span></h3>
      <ul>${items.map((x) => `<li><div><b>${esc(x.title || '제목 없음')}</b><span class="small muted">${esc(x.from || '')} · ${esc(String(x.at || '').slice(0, 10))}</span></div><button type="button" class="btn sm" data-act="numbersInboxDone" data-id="${esc(x.id)}">처리 완료</button></li>`).join('')}</ul></section>`;
  }

  /* ---------- 계기판 화면 ---------- */
  function viewDash() {
    const f = flagged(); const top3 = f.slice(0, 3); const rest = f.slice(3);
    return `<section class="nb-today" aria-labelledby="nb-h-today">
        <div class="nb-sec-h"><h3 id="nb-h-today">오늘 볼 숫자 ${top3.length}개</h3><span class="small muted">경보 · 목표 대비 −20% · 3회 연속 악화 · 갱신 지연을 점수로 골랐습니다</span></div>
        ${top3.length ? `<div class="nb-t3s">${top3.map(todayCard).join('')}</div>` : '<div class="nb-empty">오늘은 이상 신호가 있는 숫자가 없습니다.</div>'}
      </section>
      ${rest.length ? `<section class="panel nb-sec" aria-labelledby="nb-h-sig"><h3 id="nb-h-sig">그 밖의 이상 신호</h3><ul class="nb-siglist">${rest.map((x) => `<li><button type="button" class="nb-link" data-act="numbersGoCard" data-id="${x.c.id}">${esc(x.c.name)}</button><span class="num">${curVal(x.c) == null ? '—' : fmt(curVal(x.c)) + esc(x.c.unit)}</span><ul class="nb-sigs">${x.s.map((g) => `<li class="sg-${g.k}">${esc(g.t)}</li>`).join('')}</ul></li>`).join('')}</ul></section>` : ''}
      ${treeBox()}
      <div class="nb-two">${scnBox()}${reportBox()}</div>`;
  }

  /* ---------- 동작 ---------- */
  A.numbersHypEdit = (el) => { ui().hypEdit = el.dataset.id || null; if (el.dataset.id) setTimeout(() => { const t = document.getElementById('nb-hyp-' + el.dataset.id); if (t) t.focus(); }, 0); };
  A.numbersHypReset = (el) => { delete NX.hyp[el.dataset.id]; ui().hypEdit = null; toast('AI 가설로 되돌렸습니다'); };
  APP.forms.numbersHyp = (fd, form) => { const t = (fd.get('t') || '').toString().trim(); const id = form.dataset.id; if (t) NX.hyp[id] = { text: t, at: S.today }; else delete NX.hyp[id]; ui().hypEdit = null; const c = byId(id); logAct('hypothesis', `「${c ? c.name : id}」 원인 가설 메모`, id); toast('원인 가설을 저장했습니다'); };
  A.numbersSendToday = (el) => {
    const c = byId(el.dataset.id); if (!c || sentToday(c)) return;
    const s = signals(c); const v = curVal(c);
    S.inbox.push({ id: uid('ib'), at: new Date().toISOString(), from: 'numbers', to: 'today', kind: 'numberAlert', title: `[숫자 경보] ${c.name}: ${v == null ? '—' : fmt(v) + c.unit}`, payload: { cardId: c.id, value: v, unit: c.unit, source: c.source, signals: s.map((g) => g.t), owner: c.owner || '', hypothesis: NX.hyp[c.id] ? NX.hyp[c.id].text : hypo(c, s) }, done: false });
    logAct('sendToday', `「${c.name}」 경보를 오늘 할 일로 보냄`, c.id);
    toast('오늘 할 일의 받은 항목으로 보냈습니다');
  };
  A.numbersGoCard = (el) => { const c = byId(el.dataset.id); const u = ui(); u.mode = 'cards'; u.group = c && c.hidden ? '숨김' : '전체'; top(); setTimeout(() => { const a = document.getElementById('nb-t-' + el.dataset.id); if (a) { const card = a.closest('.nb-card'); card.scrollIntoView({ block: 'center' }); card.classList.add('flash'); } }, 30); };
  A.numbersTree = (el) => { ui().tree = el.dataset.v; };
  A.numbersUseEx = () => { const u = ui(); u.useEx = !u.useEx; };
  A.numbersTreeClear = (el) => { delete NX.treeTarget[el.dataset.id]; };
  APP.forms.numbersTreeTarget = (fd, form) => { const v = num(fd.get('t')); if (v == null) { delete NX.treeTarget[form.dataset.id]; return; } NX.treeTarget[form.dataset.id] = v; logAct('target', `${TREES[form.dataset.id].title} 목표 역산 ${v}`, form.dataset.id); };
  APP.changes.numbersEx = (el) => { const v = num(el.value); if (v == null || v < 0) return; NX.ex[el.dataset.k] = v; };
  APP.forms.numbersScn = (fd) => { NX.scn = { ds: num(fd.get('ds')) || 0, dg: num(fd.get('dg')) || 0, dt: num(fd.get('dt')) || 0 }; };
  APP.forms.numbersScnAsk = (fd) => {
    const q = (fd.get('q') || '').toString(); const p = parseScn(q);
    if (!Object.keys(p).length) { toast('「점포 +5, 객단가 +3%」처럼 적어 주세요'); return; }
    NX.scn = Object.assign({ ds: 0, dg: 0, dt: 0 }, p); logAct('scenario', `시나리오: ${q}`, '');
    toast('시나리오를 계산했습니다(예시값 기준)');
  };
  A.numbersCopyReport = () => {
    const text = reportText();
    const sel = () => setTimeout(() => { const pre = document.getElementById('nbReport'); if (!pre) return; const r = document.createRange(); r.selectNodeContents(pre); const s = window.getSelection(); s.removeAllRanges(); s.addRange(r); pre.focus(); toast('복사가 막혀 있어 글을 선택해 두었습니다'); }, 30);
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(() => toast('리포트를 Markdown으로 복사했습니다'), sel);
      else sel();
    } catch (e) { sel(); }
    logAct('report', '주간 숫자 리포트 복사', '');
  };
  A.numbersInboxDone = (el) => { const x = S.inbox.find((i) => i.id === el.dataset.id); if (x) { x.done = true; logAct('inboxDone', `받은 항목 처리: ${x.title || ''}`, x.id); } };

  /* 기존 동작에 활동 기록 붙이기 */
  const logWrap = (obj, name, type, text) => { const f = obj[name]; obj[name] = function (a, b) { const r = f.apply(this, arguments); try { const t = text(a, b); if (t) logAct(type, t, ''); } catch (e) { /* 기록 실패는 무시 */ } return r; }; };
  logWrap(APP.forms, 'numbersAdd', 'add', (fd) => `숫자 추가: ${(fd.get('name') || fd.get('calc') || '').toString()}`);
  logWrap(APP.forms, 'numbersEntry', 'entry', (fd, form) => { const c = byId(form.dataset.id); return c ? `「${c.name}」 값 기록 ${fd.get('v')}${c.unit}` : ''; });
  logWrap(A, 'numbersDel', 'delete', () => '숫자 카드 삭제');
  logWrap(APP.forms, 'numbersAsk', 'page', (fd) => `숫자 페이지 요청: ${(fd.get('req') || '').toString().slice(0, 40)}`);
  APP.views.numbers = viewNumbers;
})();
