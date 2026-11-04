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
      c.freq
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

  function viewNumbers() {
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

    return `<div class="view-head"><div><h2>내가 보는 숫자</h2><p>매일 직접 확인하는 숫자만 모았습니다. 경보 기준을 넘은 숫자는 붉게 표시됩니다.</p></div>
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

  APP.views.numbers = viewNumbers;
})();
