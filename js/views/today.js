/* 메뉴: 오늘 할 일 (today) — 이 메뉴 담당 하위 세션은 이 파일만 고칩니다.
   공용 도구·상태는 window.APP에서 꺼내 씁니다. 새 버튼 동작은 APP.acts['이름'] = (el) => {...},
   새 폼은 APP.forms['이름'] = (fd, form) => {...}, 새 select 변경은 APP.changes['이름'] = (el) => {...} 로 등록합니다.

   할 일(S.dailyTasks) 필드
   - date: 'YYYY-MM-DD' (내일로 미루면 내일 날짜), prio: 긴급/높음/보통, order: 등록 순서
   - est_minutes·est_value + est_source(추정=Claude 산정 / 수기=직접 지정), est_why: 산정 근거
   - run_at: 측정 중이면 시작 시각(ms), acc_ms: 누적 측정 시간 → actual_minutes, time_source(측정/수기)
   - done: 끝냄(체크), evaluated: 성과 평가로 넘김(완료 입력 끝) */
(function () {
  'use strict';
  const { S, HOUR_VALUE, F_TYPES, $, esc, kwon, days, md, badge, uid, toast, isOpen, isOverdue, evaluate, dayStr, prioPill, statusSelect } = window.APP;

  const PRIOS = ['긴급', '높음', '보통'];
  const PRIO_RANK = { '긴급': 0, '높음': 1, '보통': 2 };
  const SORTS = [['prio', '우선순위'], ['short', '짧은 일 먼저'], ['value', '가치 높은 순'], ['order', '등록순']];

  /* ---------- 샘플 보강(하루 1회) ---------- */
  S.todayExtra = S.todayExtra || [
    { id: 'k3', date: dayStr(-1), title: '블랙라벨 원가표 검토', prio: '높음', est_minutes: 30, est_value: 90000, est_source: '추정', est_why: '"검토" → 30분 · 사업 판단 ×3' },
    { id: 'k4', date: dayStr(0), title: '벌툰 가맹계약서 개정안 결재 전 검토', prio: '긴급', est_minutes: 30, est_value: 150000, est_source: '추정', est_why: '"검토" → 30분 · 가맹 ×5' },
    { id: 'k5', date: dayStr(1), title: '생전포차 해외 후보 도시 비교표 읽기', prio: '보통', est_minutes: 30, est_value: 75000, est_source: '추정', est_why: '"읽기" → 30분 · 해외 ×5' }
  ];
  if (!S.ui.todaySeeded) {
    S.todayExtra.forEach((x) => { if (!S.dailyTasks.some((t) => t.id === x.id)) S.dailyTasks.push(Object.assign({ started_at: null, ended_at: null, actual_minutes: null, time_source: null, done: false }, x)); });
    const k1 = S.dailyTasks.find((t) => t.id === 'k1'); if (k1 && !k1.prio) k1.prio = '높음';
    S.ui.todaySeeded = true;
  }
  /* 예전 형식 할 일에 새 필드 채우기 */
  S.dailyTasks.forEach((t, i) => {
    if (!t.prio) t.prio = '보통';
    if (t.order == null) t.order = i;
    if (!t.est_source) t.est_source = '추정';
    if (t.acc_ms == null) t.acc_ms = t.actual_minutes != null && t.time_source === '측정' ? t.actual_minutes * 60000 : 0;
    if (t.evaluated == null) t.evaluated = !!t.done && S.achievements.some((a) => a.title === t.title && a.date === t.date);
  });
  S.waitingDone = S.waitingDone || [];
  S.waiting.forEach((w) => { if (!w.id) w.id = uid('w'); });

  /* ---------- Claude 예상치 산정(목업 규칙) ---------- */
  const MIN_RULES = [
    [/결재|서명|승인|확인/, 15], [/검토|리뷰|읽기|피드백/, 30], [/점검|체크/, 45], [/회의|미팅|면담|통화|인터뷰/, 60],
    [/보고서|기획|작성|정리|준비|비교/, 90], [/개발|자동화|스킬|프로그램|구축/, 120]
  ];
  const LEVER_RULES = [[/신사업|투자|가맹|전략|해외|M&A|법인/, 5, '사업 확장'], [/AI|자동화|스킬|프로그램/, 4, 'AI·자동화'], [/원가|비용|예산|계약|결재/, 3, '사업 판단'], [/학습|복습|공부/, 1, '자기 학습']];
  function claudeEstimate(title) {
    const m = MIN_RULES.find(([re]) => re.test(title));
    const lv = LEVER_RULES.find(([re]) => re.test(title));
    const min = m ? m[1] : 45;
    const lever = lv ? lv[1] : 2;
    const kw = m ? (title.match(m[0]) || [''])[0] : '';
    return { min, value: Math.round((min / 60) * HOUR_VALUE * lever / 1000) * 1000, why: `${kw ? `"${kw}"` : '기본'} → ${min}분 · ${lv ? lv[2] : '일반 업무'} ×${lever}` };
  }

  /* ---------- 도우미 ---------- */
  const task = (id) => S.dailyTasks.find((t) => t.id === id);
  const hm = (min) => { min = Math.round(min); const h = Math.floor(min / 60); const m = min % 60; return h ? `${h}시간${m ? ` ${m}분` : ''}` : `${m}분`; };
  const liveMin = (t) => Math.max(0, Math.round(((t.acc_ms || 0) + (t.run_at ? Date.now() - t.run_at : 0)) / 60000));
  function stopRun(t) {
    if (!t.run_at) return;
    t.acc_ms = (t.acc_ms || 0) + (Date.now() - t.run_at);
    t.run_at = null; t.ended_at = Date.now();
    t.actual_minutes = Math.max(1, Math.round(t.acc_ms / 60000)); t.time_source = '측정';
  }
  function sorter(mode) {
    const by = {
      prio: (a, b) => PRIO_RANK[a.prio] - PRIO_RANK[b.prio] || a.order - b.order,
      short: (a, b) => a.est_minutes - b.est_minutes || PRIO_RANK[a.prio] - PRIO_RANK[b.prio],
      value: (a, b) => b.est_value - a.est_value || a.order - b.order,
      order: (a, b) => a.order - b.order
    }[mode] || ((a, b) => a.order - b.order);
    return by;
  }
  const nowHM = () => { const d = new Date(); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };

  /* ---------- 내 할 일 ---------- */
  function taskItem(t) {
    const open = S.ui.tdOpen && S.ui.tdOpen.id === t.id ? S.ui.tdOpen.kind : null;
    const running = !!t.run_at;
    const tCell = running
      ? `<span class="td-live" data-td-live="${t.id}">측정 중 ${liveMin(t)}분</span>`
      : t.actual_minutes != null ? `<span class="num">${hm(t.actual_minutes)}</span> ${badge(t.time_source)}` : '<span class="muted">-</span>';
    let actions = '';
    if (t.evaluated) actions = '<span class="pill st-done">성과 평가로 넘김</span>';
    else if (t.done) actions = `<button type="button" class="btn primary sm" data-act="tdOpen" data-k="complete" data-id="${t.id}">완료 입력 → 성과 평가</button>`;
    else {
      actions = running
        ? `<button type="button" class="btn sm td-stop" data-act="tdStop" data-id="${t.id}">■ 종료</button>`
        : `<button type="button" class="btn sm" data-act="tdStart" data-id="${t.id}">▶ ${t.acc_ms ? '이어서' : '시작'}</button>`;
      actions += `<button type="button" class="btn sm" data-act="tdOpen" data-k="manual" data-id="${t.id}">시간 수기 입력</button>`;
      actions += `<button type="button" class="btn sm" data-act="tdTomorrow" data-id="${t.id}">내일로</button>`;
    }
    if (!t.evaluated) actions += `<button type="button" class="btn sm td-del" data-act="tdDel" data-id="${t.id}" aria-label="${esc(t.title)} 삭제">${S.ui.tdDelAsk === t.id ? '정말 삭제' : '삭제'}</button>`;

    let panel = '';
    if (open === 'manual') panel = `<form class="form td-sub" data-form="tdManual" data-id="${t.id}">
        <label class="f">실제 소요(분)<input type="number" name="min" min="1" value="${t.actual_minutes || t.est_minutes}" required></label>
        <div class="row"><button class="btn primary sm">저장(수기)</button><button type="button" class="btn sm" data-act="tdClose">취소</button></div></form>`;
    if (open === 'complete') panel = `<form class="form td-sub" data-form="tdComplete" data-id="${t.id}">
        <p class="wide small muted" style="margin:0">예상 E ${t.est_minutes}분 · 실제 T ${t.actual_minutes != null ? t.actual_minutes + '분' : '미측정(속도계수 S=1.0)'} — 아래를 채우면 성과·레벨의 평가로 넘어갑니다.</p>
        <label class="f wide">산출물 링크<input type="url" name="output_url" placeholder="https://"></label>
        <label class="f">산출물 형태<select name="output_type">${Object.entries(F_TYPES).map(([k, v]) => `<option value="${k}">${v[0]} (${v[1].toFixed(1)})</option>`).join('')}</select></label>
        <label class="f">영향 인원(명)<input type="number" name="headcount" min="1" value="1"></label>
        <label class="f">수행 방식<select name="by_agent"><option value="0">직접</option><option value="1">에이전트</option></select></label>
        <label class="f">1인 월 절감시간(시간)<input type="number" name="saved_hours" min="0" step="0.5" value="1"></label>
        <label class="f">유효개월(최대 12)<input type="number" name="months" min="1" max="12" value="12"></label>
        <label class="f">월 매출·이익 기여(원)<input type="number" name="monthly_revenue" min="0" value="0"></label>
        <label class="f">월 비용절감(원)<input type="number" name="monthly_cost" min="0" value="0"></label>
        <label class="f">1회성 산출물<select name="one_off"><option value="0">아니오</option><option value="1">예(1개월분만)</option></select></label>
        <p class="small muted wide" style="margin:0">B는 1인 기준으로 적습니다. 영향 인원은 L로만 반영합니다(이중 반영 방지).</p>
        <div class="row wide"><button class="btn primary sm">Claude 최종 평가 요청</button><button type="button" class="btn sm" data-act="tdClose">취소</button></div></form>`;

    return `<li class="td-item${t.done ? ' is-done' : ''}${running ? ' is-run' : ''}">
      <label class="td-chk"><input type="checkbox" data-act="tdCheck" data-id="${t.id}" ${t.done ? 'checked' : ''} ${t.evaluated ? 'disabled' : ''}><span class="sr">${esc(t.title)} 끝냄</span></label>
      <div class="td-body">
        <div class="td-title">${esc(t.title)}</div>
        <div class="td-meta">
          ${t.done ? prioPill(t.prio) : `<select class="td-prio" aria-label="우선순위" data-act="tdPrio" data-id="${t.id}">${PRIOS.map((p) => `<option ${p === t.prio ? 'selected' : ''}>${p}</option>`).join('')}</select>`}
          <span title="${esc(t.est_why || '')}">예상 E <b class="num">${hm(t.est_minutes)}</b> ${badge(t.est_source)}</span>
          <span>예상 가치 <b class="num">${kwon(t.est_value)}천원</b> ${badge('추정')}</span>
          <span>실제 T ${tCell}</span>
        </div>
        <div class="row td-acts">${actions}</div>
        ${panel}
      </div>
    </li>`;
  }

  function tasksBlock() {
    const mode = S.ui.tdSort || 'prio';
    const all = S.dailyTasks.filter((t) => t.date === S.today);
    const todo = all.filter((t) => !t.done).sort(sorter(mode));
    const done = all.filter((t) => t.done).sort((a, b) => a.order - b.order);
    const carry = S.dailyTasks.filter((t) => t.date < S.today && !t.done);
    const later = S.dailyTasks.filter((t) => t.date > S.today);
    const leftMin = todo.reduce((s, t) => s + Math.max(0, t.est_minutes - (t.actual_minutes || 0)), 0);
    const spent = all.reduce((s, t) => s + (t.run_at ? liveMin(t) : (t.actual_minutes || 0)), 0);
    const pct = all.length ? Math.round((100 * done.length) / all.length) : 0;
    const showDone = S.ui.tdShowDone !== false;

    return `<section class="panel td-panel" aria-labelledby="h-td">
      <div class="td-head"><h3 id="h-td">내 할 일</h3>
        <div class="seg td-sort" role="group" aria-label="정렬">${SORTS.map(([k, l]) => `<button type="button" data-act="tdSort" data-v="${k}" aria-pressed="${k === mode}">${l}</button>`).join('')}</div></div>
      <div class="td-prog">
        <div class="bar" aria-hidden="true"><i style="width:${pct}%"></i></div>
        <div class="td-prog-txt small"><span>끝냄 <b class="num">${done.length}/${all.length}</b> ${badge('측정')}</span><span>남은 예상 <b class="num">${hm(leftMin)}</b> ${badge('추정')}</span><span>오늘 쓴 시간 <b class="num">${hm(spent)}</b> ${badge('측정')}</span></div>
      </div>

      ${carry.length ? `<div class="td-carry"><span><b>어제까지 못 끝낸 일 ${carry.length}건</b> — ${carry.map((t) => esc(t.title)).join(', ')}</span>
        <button type="button" class="btn sm" data-act="tdCarry">오늘로 가져오기</button></div>` : ''}

      <form class="td-add" data-form="tdAdd">
        <label class="f td-add-title">할 일 추가<input type="text" name="title" required maxlength="80" placeholder="예: 가맹 투자 미팅 준비" autocomplete="off"></label>
        <label class="f">우선순위<select name="prio">${PRIOS.map((p) => `<option ${p === '보통' ? 'selected' : ''}>${p}</option>`).join('')}</select></label>
        <label class="f">예상 소요(분, 선택)<input type="number" name="est" min="5" step="5" placeholder="비우면 Claude 산정"></label>
        <button class="btn primary">추가</button>
      </form>

      <ul class="td-list">${todo.map(taskItem).join('') || `<li class="td-empty">${all.length ? '오늘 할 일을 모두 끝냈습니다. 수고하셨습니다.' : '아직 등록한 할 일이 없습니다. 위에서 추가해 주세요.'}</li>`}</ul>

      ${done.length ? `<button type="button" class="td-fold" data-act="tdShowDone" aria-expanded="${showDone}">${showDone ? '▾' : '▸'} 끝낸 일 ${done.length}건${done.some((t) => !t.evaluated) ? ` · 완료 입력 대기 ${done.filter((t) => !t.evaluated).length}건` : ''}</button>
        ${showDone ? `<ul class="td-list">${done.map(taskItem).join('')}</ul>` : ''}` : ''}

      ${later.length ? `<details class="td-later"><summary>내일 이후로 미룬 일 ${later.length}건</summary>
        <ul>${later.sort((a, b) => a.date.localeCompare(b.date)).map((t) => `<li><span>${esc(t.title)} <span class="small muted">${md(t.date)} · ${hm(t.est_minutes)}</span></span><button type="button" class="btn sm" data-act="tdBack" data-id="${t.id}">오늘로</button></li>`).join('')}</ul></details>` : ''}
    </section>`;
  }

  /* ---------- 오늘 챙길 지시 ---------- */
  function dirBlock() {
    const open = S.directives.filter(isOpen);
    const byDue = (x, y) => x.due_at.localeCompare(y.due_at);
    const groups = [
      ['기한 경과', open.filter(isOverdue).sort(byDue), 'crit'],
      ['오늘 기한', open.filter((d) => d.due_at === S.today), 'gold'],
      ['3일 안에', open.filter((d) => d.due_at > S.today && d.due_at <= dayStr(3)).sort(byDue), '']
    ];
    const total = groups.reduce((s, g) => s + g[1].length, 0);
    const item = (d) => `<li class="td-dir${isOverdue(d) ? ' overdue' : ''}">
      <div class="td-dir-main"><b>${esc(d.title)}</b><div class="small muted">${esc(d.org)} · ${esc(d.assignee)} ${prioPill(d.priority)}</div></div>
      <div class="td-dir-side"><span class="td-due num">${isOverdue(d) ? `D+${days(d.due_at, S.today)}` : d.due_at === S.today ? '오늘' : `${md(d.due_at)} (D-${days(S.today, d.due_at)})`}</span>${statusSelect(d)}</div></li>`;
    return `<section class="panel" aria-labelledby="h-dir">
      <div class="td-head"><h3 id="h-dir">오늘 챙길 지시 ${badge('측정')} <span class="pill">${total}건</span></h3><button type="button" class="btn sm" data-act="tab" data-v="directives">지시 관리 →</button></div>
      ${total ? groups.filter((g) => g[1].length).map(([label, list, tone]) => `<div class="td-grp ${tone}">${label} <span class="num">${list.length}</span></div><ul class="td-dirs">${list.map(item).join('')}</ul>`).join('')
        : '<p class="muted" style="margin:0">3일 안에 기한인 지시가 없습니다.</p>'}
    </section>`;
  }

  /* ---------- 결재·답변 대기 ---------- */
  function waitBlock() {
    const wl = S.waiting.slice().sort((x, y) => days(y.since, S.today) - days(x.since, S.today));
    const doneToday = S.waitingDone.filter((w) => w.done_at === S.today);
    return `<section class="panel" aria-labelledby="h-wait">
      <h3 id="h-wait">결재·답변 대기 ${badge('측정')} <span class="pill">${wl.length}건</span></h3>
      <p class="small muted" style="margin:0 0 8px">오래 기다린 순서입니다.</p>
      ${wl.length ? `<ul class="td-wait">${wl.map((w) => { const d = days(w.since, S.today); return `<li class="${d >= 5 ? 'late' : d >= 3 ? 'mid' : ''}">
        <span class="td-days num">${d}일째</span><span class="td-wait-t">${esc(w.title)}<span class="small muted">${esc(w.from)} · ${md(w.since)} 요청</span></span>
        <span class="row td-wait-acts"><button type="button" class="btn sm primary" data-act="tdWait" data-k="결재" data-id="${w.id}">처리</button><button type="button" class="btn sm" data-act="tdWaitTask" data-id="${w.id}">할 일로</button></span></li>`; }).join('')}</ul>`
        : '<p class="muted" style="margin:0">기다리는 결재·답변이 없습니다.</p>'}
      ${doneToday.length ? `<p class="small muted" style="margin:10px 0 0">오늘 처리 ${doneToday.length}건: ${doneToday.map((w) => esc(w.title)).join(', ')} <button type="button" class="btn sm" data-act="tdWaitUndo">되돌리기</button></p>` : ''}
    </section>`;
  }

  /* ---------- 오늘 일정 ---------- */
  function calBlock() {
    const now = nowHM();
    const cal = S.calendar.slice().sort((a, b) => a.time.localeCompare(b.time));
    const nextIdx = cal.findIndex((c) => c.time >= now);
    return `<section class="panel" aria-labelledby="h-cal">
      <h3 id="h-cal">오늘 일정 ${badge('측정')}</h3>
      <ul class="td-cal">${cal.map((c, i) => `<li class="${i === nextIdx ? 'next' : c.time < now ? 'past' : ''}"><span class="num td-time">${esc(c.time)}</span><span>${esc(c.title)}${i === nextIdx ? ' <span class="pill p-high">다음</span>' : ''}${c.mine ? ` ${badge('수기')}` : ''}</span></li>`).join('') || '<li class="muted">일정이 없습니다.</li>'}</ul>
      <details class="adder" style="margin-top:10px"><summary class="btn sm">일정 추가</summary>
        <form class="form" data-form="tdCal"><label class="f">시각<input type="time" name="time" required value="${now}"></label><label class="f">내용<input type="text" name="title" required maxlength="60" placeholder="예: 점주 간담회"></label><div><button class="btn primary sm">추가</button></div></form></details>
      <p class="small muted" style="margin:8px 0 0">Google Calendar 연동 예정(목업 샘플)</p>
    </section>`;
  }

  function viewToday() {
    return `<div class="view-head"><div><h2>오늘 할 일</h2><p>${new Date(S.today + 'T00:00').toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' })} · 할 일, 챙길 지시, 결재 대기, 일정을 한 화면에서 처리합니다.</p></div></div>
      ${tasksBlock()}
      <div class="grid2 td-grid">
        ${dirBlock()}
        <div class="td-col">${waitBlock()}${calBlock()}</div>
      </div>`;
  }
  APP.views.today = viewToday;

  /* ---------- 동작 ---------- */
  const close = () => { S.ui.tdOpen = null; };
  Object.assign(APP.acts, {
    tdSort: (el) => { S.ui.tdSort = el.dataset.v; },
    tdShowDone: () => { S.ui.tdShowDone = S.ui.tdShowDone === false; },
    tdStart: (el) => { const t = task(el.dataset.id); t.run_at = Date.now(); t.started_at = t.started_at || t.run_at; close(); },
    tdStop: (el) => { const t = task(el.dataset.id); stopRun(t); toast(`측정 ${t.actual_minutes}분 기록`); },
    tdOpen: (el) => { const cur = S.ui.tdOpen; S.ui.tdOpen = cur && cur.id === el.dataset.id && cur.kind === el.dataset.k ? null : { id: el.dataset.id, kind: el.dataset.k }; },
    tdClose: close,
    tdTomorrow: (el) => { const t = task(el.dataset.id); stopRun(t); t.date = dayStr(1); close(); toast(`"${t.title}" 내일로 미뤘습니다`); },
    tdBack: (el) => { const t = task(el.dataset.id); t.date = S.today; toast('오늘 할 일로 되돌렸습니다'); },
    tdCarry: () => { const n = S.dailyTasks.filter((t) => t.date < S.today && !t.done).map((t) => { t.date = S.today; return t; }).length; toast(`${n}건을 오늘로 가져왔습니다`); },
    tdDel: (el) => {
      const t = task(el.dataset.id);
      // 화면 안 2단계 확인(공유 페이지에서는 브라우저 확인창이 뜨지 않음)
      if (S.ui.tdDelAsk !== t.id) { S.ui.tdDelAsk = t.id; toast('한 번 더 누르면 지웁니다'); return; }
      S.ui.tdDelAsk = null;
      S.dailyTasks = S.dailyTasks.filter((x) => x !== t); close(); toast('할 일을 지웠습니다');
    },
    tdWait: (el) => {
      const w = S.waiting.find((x) => x.id === el.dataset.id); if (!w) return;
      S.waiting = S.waiting.filter((x) => x !== w); S.waitingDone.push(Object.assign({}, w, { done_at: S.today }));
      toast(`처리 완료: ${w.title} (Asana 반영 예정)`);
    },
    tdWaitUndo: () => { const w = S.waitingDone.pop(); if (w) { delete w.done_at; S.waiting.push(w); toast('대기 목록으로 되돌렸습니다'); } },
    tdWaitTask: (el) => {
      const w = S.waiting.find((x) => x.id === el.dataset.id); if (!w) return;
      if (S.dailyTasks.some((t) => t.date === S.today && t.title === w.title)) { toast('이미 오늘 할 일에 있습니다'); return; }
      addTask(w.title, days(w.since, S.today) >= 5 ? '긴급' : '높음', 0);
    }
  });
  /* 체크박스는 click으로 받는다(라벨 클릭 포함) */
  APP.acts.tdCheck = (el) => {
    const t = task(el.dataset.id); if (t.evaluated) return;
    if (!t.done) { stopRun(t); t.done = true; S.ui.tdOpen = { id: t.id, kind: 'complete' }; toast('끝냈습니다 — 완료 입력을 채우면 성과 평가로 넘어갑니다'); }
    else { t.done = false; close(); }
  };
  APP.changes.tdPrio = (el) => { task(el.dataset.id).prio = el.value; };

  function addTask(title, prio, est) {
    const e = claudeEstimate(title);
    const manual = est > 0;
    const min = manual ? Math.max(5, est) : e.min;
    const value = manual ? Math.round(e.value / e.min * min / 1000) * 1000 : e.value;
    S.dailyTasks.push({ id: uid('k'), date: S.today, title, prio, order: Math.max(0, ...S.dailyTasks.map((t) => t.order || 0)) + 1,
      est_minutes: min, est_value: value, est_source: manual ? '수기' : '추정', est_why: e.why,
      started_at: null, ended_at: null, run_at: null, acc_ms: 0, actual_minutes: null, time_source: null, done: false, evaluated: false });
    toast(`Claude 산정: ${hm(min)} · ${kwon(value)}천원 (${e.why})`);
  }
  Object.assign(APP.forms, {
    tdAdd: (fd) => { const g = (n) => (fd.get(n) || '').toString().trim(); if (!g('title')) return; addTask(g('title'), g('prio') || '보통', +g('est') || 0); },
    tdManual: (fd, form) => { const t = task(form.dataset.id); t.run_at = null; t.actual_minutes = Math.max(1, +fd.get('min') || 1); t.acc_ms = t.actual_minutes * 60000; t.time_source = '수기'; t.started_at = t.started_at || Date.now(); close(); },
    tdComplete: (fd, form) => {
      const t = task(form.dataset.id); const g = (n) => (fd.get(n) || '').toString().trim();
      const a = evaluate({ id: uid('a'), title: t.title, date: S.today, output_url: g('output_url'), output_type: g('output_type'), headcount: Math.max(1, +g('headcount') || 1), by_agent: g('by_agent') === '1', saved_hours: +g('saved_hours') || 0, months: +g('months') || 1, monthly_revenue: +g('monthly_revenue') || 0, monthly_cost: +g('monthly_cost') || 0, one_off: g('one_off') === '1', est_minutes: t.est_minutes, actual_minutes: t.actual_minutes, N: 1, status: '평가중', negotiations: [] });
      S.achievements.push(a); t.done = true; t.evaluated = true; close();
      toast(`성과 평가로 넘겼습니다: ${kwon(a.value_won)}천원 (성과·레벨에서 확인)`);
    },
    tdCal: (fd) => { const time = (fd.get('time') || '').toString(); const title = (fd.get('title') || '').toString().trim(); if (!time || !title) return; S.calendar.push({ time, title, mine: true }); toast('일정을 추가했습니다'); }
  });

  /* 측정 중 표시를 30초마다 갱신(다시 그리지 않고 글자만 바꿈) */
  setInterval(() => {
    document.querySelectorAll('[data-td-live]').forEach((el) => { const t = task(el.dataset.tdLive); if (t && t.run_at) el.textContent = `측정 중 ${liveMin(t)}분`; });
  }, 30000);
})();
