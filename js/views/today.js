/* 메뉴: 오늘 할 일 (today) — 이 메뉴 담당 하위 세션은 이 파일만 고칩니다.
   공용 도구·상태는 window.APP에서 꺼내 씁니다. 새 버튼 동작은 APP.acts['이름'] = (el) => {...},
   새 폼은 APP.forms['이름'] = (fd, form) => {...}, 새 select 변경은 APP.changes['이름'] = (el) => {...} 로 등록합니다.

   화면 구성(회장님 지시 2026-11-02)
   - 맨 위: 오늘의 회의·일정 작은 카드(시간순, 한 줄 8개, 넘치면 ◀ ▶). 누르면 크게 팝업.
     원천: Google Calendar + Slack 태그·DM의 미팅 요청(목업 샘플)
   - 왼쪽: 할 일만 길게. 분류 탭 전체·슬랙·아사나·결재·직접. 오늘 할 일 아래로 오늘 이후 할 일을 순서대로.
   - 오른쪽: 완료한 일만 길게(할 일과 같은 분류 탭, 날짜별 묶음). 지시 추적은 '지시 관리' 메뉴에서 봄

   할 일(S.dailyTasks) 필드
   - src: mine(직접)·slack·asana·approval(결재), date: 할 날짜(아사나는 기한), prio: 긴급/높음/보통, order
   - est_minutes·est_value + est_source(추정/수기), est_why: Claude 산정 근거
   - run_at·acc_ms → actual_minutes, time_source(측정/수기)
   - done·done_at, evaluated(성과 평가로 넘김), slack{kind,ch,from,at,text}, asana{project,why}, ref(결재 원본 id) */
(function () {
  'use strict';
  const { S, HOUR_VALUE, F_TYPES, esc, kwon, days, md, badge, uid, toast, evaluate, dayStr } = window.APP;

  const PRIOS = ['긴급', '높음', '보통'];
  const PRIO_RANK = { '긴급': 0, '높음': 1, '보통': 2 };
  const SRC = { slack: '슬랙', asana: '아사나', approval: '결재', mine: '직접' };
  const CATS = [['all', '전체'], ['slack', '슬랙'], ['asana', '아사나'], ['approval', '결재'], ['mine', '직접']];
  const SORTS = [['claude', 'Claude 추천순'], ['short', '짧은 일 먼저'], ['value', '가치 높은 순']];

  /* ---------- Claude 예상치 산정(목업 규칙) ---------- */
  const MIN_RULES = [
    [/결재|서명|승인|확인|답변|회신/, 15], [/검토|리뷰|읽기|피드백|코멘트/, 30], [/점검|체크/, 45], [/회의|미팅|면담|통화|인터뷰/, 60],
    [/보고서|기획|작성|정리|준비|비교|계획/, 90], [/개발|자동화|스킬|프로그램|구축/, 120]
  ];
  const LEVER_RULES = [[/신사업|투자|가맹|전략|해외|M&A|법인|사업계획|IR/, 5, '사업 확장'], [/AI|자동화|스킬|프로그램|센스톡/, 4, 'AI·자동화'], [/원가|비용|예산|계약|결재|실적/, 3, '사업 판단'], [/학습|복습|공부/, 1, '자기 학습']];
  function claudeEstimate(title) {
    const m = MIN_RULES.find(([re]) => re.test(title));
    const lv = LEVER_RULES.find(([re]) => re.test(title));
    const min = m ? m[1] : 45;
    const lever = lv ? lv[1] : 2;
    const kw = m ? (title.match(m[0]) || [''])[0] : '';
    return { min, value: Math.round((min / 60) * HOUR_VALUE * lever / 1000) * 1000, why: `${kw ? `"${kw}"` : '기본'} → ${min}분 · ${lv ? lv[2] : '일반 업무'} ×${lever}` };
  }
  const newTask = (o) => {
    const e = claudeEstimate(o.title);
    return Object.assign({ id: uid('k'), date: S.today, prio: '보통', src: 'mine', order: Math.max(0, ...S.dailyTasks.map((t) => t.order || 0)) + 1,
      est_minutes: e.min, est_value: e.value, est_source: '추정', est_why: e.why,
      started_at: null, ended_at: null, run_at: null, acc_ms: 0, actual_minutes: null, time_source: null, done: false, evaluated: false }, o);
  };

  /* ---------- 샘플 데이터(하루 1회 심기) ---------- */
  if (!S.todayExtra || Array.isArray(S.todayExtra)) S.todayExtra = null;
  if (!S.todayExtra) {
    S.todayExtra = {
      slackScanAt: '07:50',
      asanaSyncAt: '08:00',
      /* '새 톡 확인'을 누르면 마지막 조사 이후 올라온 톡으로 하나씩 들어옴 */
      slackPool: [
        { title: '답변: 블랙라벨 신메뉴 가격 2안 중 선택', prio: '높음', slack: { kind: '태그', ch: '#블랙라벨-상품', from: '블랙라벨사업부장', at: '10:41', text: '@회장님 신메뉴 가격 12,900원 / 13,900원 두 안 중 선택 부탁드립니다.' } },
        { title: '답변: 경영지원본부 연말 행사 장소 확인', prio: '보통', slack: { kind: 'DM', ch: 'DM', from: '경영지원본부장', at: '11:20', text: '회장님, 연말 행사 장소 후보 2곳 보내드렸습니다. 편하실 때 확인 부탁드립니다.' } }
      ],
      meetings: [
        { id: 'm1', time: '08:30', end: '09:20', title: '조찬: 가맹 투자사 대표', place: '본사 앞 한식당', who: '투자사 대표, 경영지원본부장', src: '캘린더', status: '확정' },
        { id: 'm2', time: '09:30', end: '10:30', title: '주간 경영회의', place: '본사 3층 대회의실', who: '본부장 전원', src: '캘린더', status: '확정' },
        { id: 'm3', time: '11:00', end: '11:10', title: '센스톡 PoC 매장 교체 통화', place: '전화', who: 'AI전략실장', src: '슬랙 DM', status: '요청', msg: '회장님, 11시에 10분만 통화 가능하실까요? PoC 매장 1곳 교체 건입니다.' },
        { id: 'm4', time: '13:00', end: '13:40', title: '센스톡 PoC 점검', place: '화상(Google Meet)', who: 'AI전략실', src: '캘린더', status: '확정' },
        { id: 'm5', time: '14:00', end: '14:30', title: '강남점 리뉴얼 분담 협의', place: '본사 2층 소회의실', who: '가맹지원팀장, 강남점 점주', src: '슬랙 태그', status: '요청', msg: '#벌툰-가맹 @회장님 오후 2시에 점주님과 30분 협의 자리 잡아도 될까요?' },
        { id: 'm6', time: '15:00', end: '15:40', title: '블랙라벨 신메뉴 시식', place: '본사 테스트 키친', who: '블랙라벨사업부', src: '캘린더', status: '확정' },
        { id: 'm7', time: '16:00', end: '17:00', title: '외부 미팅(가맹 투자)', place: '여의도', who: '투자사 실무진', src: '캘린더', status: '확정' },
        { id: 'm8', time: '17:20', end: '17:50', title: '임원 1:1 — 마케팅실장', place: '회장실', who: '마케팅실장', src: '슬랙 DM', status: '확정', msg: '회장님 17시 20분 1:1 일정 캘린더에 넣어두었습니다.' },
        { id: 'm9', time: '18:30', end: '19:10', title: '생전포차 해외팀 화상회의', place: '화상(Zoom)', who: '생전포차사업부', src: '캘린더', status: '확정' },
        { id: 'm10', time: '19:30', end: '21:00', title: '가맹점주 만찬', place: '강남 벌툰 본점', who: '우수 가맹점주 6명', src: '캘린더', status: '확정' }
      ]
    };
    const seed = [
      { id: 'k3', date: dayStr(-1), title: '블랙라벨 원가표 검토', prio: '높음' },
      { id: 'k5', date: dayStr(1), title: '생전포차 해외 후보 도시 비교표 읽기' },
      { id: 's1', src: 'slack', prio: '긴급', title: '답변: 강남점 리뉴얼 비용 본사 분담 30% 안', slack: { kind: '태그', ch: '#벌툰-가맹', from: '가맹지원팀장', at: '08:42', text: '@회장님 강남점 리뉴얼 비용 본사 분담 30% 안으로 진행해도 될까요? 점주님께 오늘 회신 드려야 합니다.' } },
      { id: 's2', src: 'slack', prio: '높음', title: '답변: 센스톡 PoC 매장 1곳 교체 의견', slack: { kind: 'DM', ch: 'DM', from: 'AI전략실장', at: '09:15', text: '회장님, 시범 매장 3곳 중 역삼점 영업시간이 짧아 선릉점으로 바꾸려 합니다. 의견 부탁드립니다.' } },
      { id: 's3', src: 'slack', title: '답변: 11월 마케팅 예산 증액 회신', slack: { kind: '태그', ch: '#경영회의', from: '마케팅실장', at: '10:02', text: '@회장님 지난주 올린 예산 증액 건 오늘 중 회신 주시면 집행 준비하겠습니다.' } },
      { id: 'a1', src: 'asana', prio: '긴급', date: dayStr(0), title: '생전포차 해외 법인 설립 자문사 최종 선택', asana: { project: '회장 담당', why: '기한 오늘 · 해외 진출 일정의 선행 조건' } },
      { id: 'a2', src: 'asana', prio: '높음', date: dayStr(-1), title: '3분기 실적 리뷰 코멘트', asana: { project: '경영회의', why: '기한 하루 지남 · 본부장 5명 대기' } },
      { id: 'a3', src: 'asana', prio: '높음', date: dayStr(1), title: '센스톡 PoC 중간보고 검토', asana: { project: '신사업', why: '내일 기한 · PoC 계속 여부 결정' } },
      { id: 'a4', src: 'asana', prio: '긴급', date: dayStr(2), title: '가맹 투자 IR 자료 최종본 확인', asana: { project: '회장 담당', why: '투자 미팅 전날까지 필요' } },
      { id: 'a5', src: 'asana', date: dayStr(5), title: '2027 사업계획 초안 방향 정리', asana: { project: '경영기획', why: '영향 큼, 기한 여유 있음' } },
      { id: 'a6', src: 'asana', date: dayStr(7), title: '임원 평가 면담 일정 확정', asana: { project: '인사', why: '기한 여유 · 15분이면 끝남' } }
    ];
    seed.forEach((x) => { if (!S.dailyTasks.some((t) => t.id === x.id)) S.dailyTasks.push(newTask(x)); });
    const k1 = S.dailyTasks.find((t) => t.id === 'k1'); if (k1) k1.prio = '높음';
  }
  if (!S.ui.tdSeedDone) {
    [
      { id: 'p1', src: 'asana', date: dayStr(-1), title: '10월 경영실적 요약 확인', asana: { project: '경영회의', why: '' }, actual_minutes: 25, time_source: '측정', evaluated: true },
      { id: 'p2', src: 'slack', date: dayStr(-1), title: '답변: 벌툰 신규 가맹 상담 일정', slack: { kind: 'DM', ch: 'DM', from: '가맹지원팀장', at: '15:10', text: '' } },
      { id: 'p3', src: 'approval', date: dayStr(-1), title: '결재: 본사 사무용품 연간 계약' },
      { id: 'p4', src: 'mine', date: dayStr(-1), title: '센스톡 시범 매장 후보 검토', actual_minutes: 40, time_source: '수기' },
      { id: 'p5', src: 'asana', date: dayStr(-2), title: '블랙라벨 메뉴판 시안 피드백', asana: { project: '블랙라벨', why: '' }, actual_minutes: 20, time_source: '측정', evaluated: true },
      { id: 'p6', src: 'slack', date: dayStr(-2), title: '답변: AI 도구 교육 일정 확정', slack: { kind: '태그', ch: '#AI전략', from: 'AI전략실장', at: '11:05', text: '' } },
      { id: 'p7', src: 'mine', date: dayStr(-3), title: '가맹 투자 IR 목차 정리', actual_minutes: 70, time_source: '측정', evaluated: true }
    ].forEach((x, i) => { if (!S.dailyTasks.some((t) => t.id === x.id)) S.dailyTasks.push(newTask(Object.assign({ done: true, done_at: x.date, done_ts: i }, x))); });
    S.ui.tdSeedDone = true;
  }
  /* 예전 형식 할 일에 새 필드 채우기 */
  S.dailyTasks.forEach((t, i) => {
    if (!t.src) t.src = 'mine';
    if (!t.prio) t.prio = '보통';
    if (t.order == null) t.order = i;
    if (!t.est_source) t.est_source = '추정';
    if (t.acc_ms == null) t.acc_ms = t.actual_minutes != null && t.time_source === '측정' ? t.actual_minutes * 60000 : 0;
    if (t.evaluated == null) t.evaluated = !!t.done && S.achievements.some((a) => a.title === t.title && a.date === t.date);
  });
  S.waitingDone = S.waitingDone || [];

  /* 결재 대기(S.waiting) ↔ 결재 할 일 맞추기 */
  function syncApprovals() {
    S.waiting.forEach((w) => {
      if (!w.id) w.id = uid('w');
      if (S.dailyTasks.some((t) => t.src === 'approval' && t.ref === w.id)) return;
      const d = days(w.since, S.today);
      S.dailyTasks.push(newTask({ src: 'approval', ref: w.id, title: '결재: ' + w.title, prio: d >= 5 ? '긴급' : d >= 3 ? '높음' : '보통', from: w.from, since: w.since }));
    });
  }

  /* ---------- 도우미 ---------- */
  const task = (id) => S.dailyTasks.find((t) => t.id === id);
  const hm = (min) => { min = Math.round(min); const h = Math.floor(min / 60); const m = min % 60; return h ? `${h}시간${m ? ` ${m}분` : ''}` : `${m}분`; };
  const liveMin = (t) => Math.max(0, Math.round(((t.acc_ms || 0) + (t.run_at ? Date.now() - t.run_at : 0)) / 60000));
  const nowHM = () => { const d = new Date(); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
  const srcChip = (s) => `<span class="td-src s-${s}">${SRC[s]}</span>`;
  const canMeasure = (t) => t.src === 'mine' || t.src === 'asana';
  function stopRun(t) {
    if (!t.run_at) return;
    t.acc_ms = (t.acc_ms || 0) + (Date.now() - t.run_at);
    t.run_at = null; t.ended_at = Date.now();
    t.actual_minutes = Math.max(1, Math.round(t.acc_ms / 60000)); t.time_source = '측정';
  }
  const sorter = (mode) => ({
    claude: (a, b) => PRIO_RANK[a.prio] - PRIO_RANK[b.prio] || a.date.localeCompare(b.date) || a.order - b.order,
    short: (a, b) => a.est_minutes - b.est_minutes || PRIO_RANK[a.prio] - PRIO_RANK[b.prio],
    value: (a, b) => b.est_value - a.est_value || a.order - b.order
  }[mode] || ((a, b) => a.order - b.order));
  const inCat = (cat) => (t) => cat === 'all' || t.src === cat;
  const catTabs = (key, list) => {
    const cur = S.ui[key] || 'all';
    return `<div class="td-cats" role="tablist">${CATS.map(([k, l]) => { const n = list.filter(inCat(k)).length; return `<button type="button" role="tab" data-act="tdCat" data-k="${key}" data-v="${k}" aria-selected="${k === cur}">${l} <span class="num">${n}</span></button>`; }).join('')}</div>`;
  };

  /* ---------- 맨 위: 오늘의 회의·일정 ---------- */
  function meetBlock() {
    const now = nowHM();
    const list = S.todayExtra.meetings.slice().sort((a, b) => a.time.localeCompare(b.time));
    const nextIdx = list.findIndex((m) => m.time > now && !(m.time <= now && now < m.end));
    const req = list.filter((m) => m.status === '요청').length;
    return `<section class="td-meet-wrap" aria-labelledby="h-meet">
      <div class="td-head"><h3 id="h-meet">오늘의 회의·일정 <span class="pill">${list.length}건</span>${req ? ` <span class="pill p-high">확정 대기 ${req}</span>` : ''}</h3>
        <span class="small muted">Google Calendar + 슬랙 미팅 요청 · 목업 샘플</span></div>
      <div class="td-meet-strip">
        <button type="button" class="td-arrow" data-td-scroll="-1" aria-label="이전 일정">◀</button>
        <ol class="td-meets" id="tdMeets">${list.map((m, i) => {
          const live = m.time <= now && now < m.end;
          const cls = live ? 'live' : i === nextIdx ? 'next' : m.end <= now ? 'past' : '';
          return `<li><button type="button" class="td-meet ${cls}${m.status === '요청' ? ' req' : ''}" data-td-meet="${m.id}">
            <span class="td-meet-time num">${m.time}</span><span class="td-meet-title">${esc(m.title)}</span>
            <span class="td-meet-foot"><span class="td-meet-src">${m.src}</span>${live ? '<b>진행 중</b>' : i === nextIdx ? '<b>다음</b>' : m.status === '요청' ? '<b>요청</b>' : ''}</span></button></li>`;
        }).join('')}</ol>
        <button type="button" class="td-arrow" data-td-scroll="1" aria-label="다음 일정">▶</button>
      </div></section>`;
  }
  function openMeet(id) {
    const m = S.todayExtra.meetings.find((x) => x.id === id); if (!m) return;
    closeMeet();
    const box = document.createElement('div');
    box.className = 'td-modal'; box.id = 'tdModal';
    box.innerHTML = `<div class="td-modal-card" role="dialog" aria-modal="true" aria-labelledby="tdModalT">
      <button type="button" class="td-x" data-td-close aria-label="닫기">✕</button>
      <div class="td-modal-time num">${m.time} – ${m.end}</div>
      <h3 id="tdModalT">${esc(m.title)}</h3>
      <dl class="td-dl"><dt>장소</dt><dd>${esc(m.place)}</dd><dt>참석</dt><dd>${esc(m.who)}</dd><dt>출처</dt><dd>${m.src} · ${m.status === '요청' ? '<b class="td-warn">요청 받음(아직 캘린더 미등록)</b>' : '캘린더 확정'}</dd></dl>
      ${m.msg ? `<blockquote class="td-quote">${esc(m.msg)}</blockquote>` : ''}
      <div class="row" style="margin-top:14px">${m.status === '요청' ? `<button type="button" class="btn primary" data-act="tdMeetOk" data-id="${m.id}">수락 → 캘린더 등록</button>` : ''}
        <button type="button" class="btn" data-act="tdMeetTask" data-id="${m.id}">준비할 일로 추가</button><button type="button" class="btn" data-td-close>닫기</button></div>
    </div>`;
    document.body.appendChild(box);
    box.querySelector('.td-x').focus();
  }
  function closeMeet() { const b = document.getElementById('tdModal'); if (b) b.remove(); }

  /* ---------- 왼쪽: 할 일 ---------- */
  function taskItem(t) {
    const open = S.ui.tdOpen && S.ui.tdOpen.id === t.id ? S.ui.tdOpen.kind : null;
    const running = !!t.run_at;
    const late = !t.done && t.date < S.today ? days(t.date, S.today) : 0;
    let acts = '';
    if (!t.done) {
      if (canMeasure(t)) acts += running
        ? `<button type="button" class="btn sm td-stop" data-act="tdStop" data-id="${t.id}">■ 종료</button>`
        : `<button type="button" class="btn sm" data-act="tdStart" data-id="${t.id}">▶ ${t.acc_ms ? '이어서' : '시작'}</button>`;
      if (canMeasure(t)) acts += `<button type="button" class="btn sm" data-act="tdOpen" data-k="manual" data-id="${t.id}">시간 수기</button>`;
      if (t.date <= S.today) acts += `<button type="button" class="btn sm" data-act="tdTomorrow" data-id="${t.id}">내일로</button>`;
      else acts += `<button type="button" class="btn sm" data-act="tdBack" data-id="${t.id}">오늘로</button>`;
      if (t.src === 'mine') acts += `<button type="button" class="btn sm td-del" data-act="tdDel" data-id="${t.id}" aria-label="${esc(t.title)} 삭제">${S.ui.tdDelAsk === t.id ? '정말 삭제' : '삭제'}</button>`;
    }
    const manual = open === 'manual' ? `<form class="form td-sub" data-form="tdManual" data-id="${t.id}">
        <label class="f">실제 소요(분)<input type="number" name="min" min="1" value="${t.actual_minutes || t.est_minutes}" required></label>
        <div class="row"><button class="btn primary sm">저장(수기)</button><button type="button" class="btn sm" data-act="tdClose">취소</button></div></form>` : '';
    const src = t.src === 'slack' && t.slack ? `<blockquote class="td-quote"><span class="small muted">${esc(t.slack.ch)} · ${esc(t.slack.from)} · ${esc(t.slack.at)}</span><br>${esc(t.slack.text)}</blockquote>`
      : t.src === 'asana' && t.asana ? `<div class="small td-why">Claude 판단: ${esc(t.asana.why)} <span class="muted">· ${esc(t.asana.project)}</span></div>`
      : t.src === 'approval' ? `<div class="small muted">${esc(t.from || '')} · ${t.since ? `${days(t.since, S.today)}일째 대기` : ''}</div>` : '';
    return `<li class="td-item${running ? ' is-run' : ''}${late ? ' is-late' : ''}" id="td-${t.id}">
      <label class="td-chk"><input type="checkbox" data-act="tdCheck" data-id="${t.id}"><span class="sr">${esc(t.title)} 완료</span></label>
      <div class="td-body">
        <div class="td-title">${srcChip(t.src)} ${esc(t.title)}${late ? ` <span class="td-late num">D+${late}</span>` : ''}</div>
        ${src}
        <div class="td-meta">
          <select class="td-prio" aria-label="우선순위" data-act="tdPrio" data-id="${t.id}">${PRIOS.map((p) => `<option ${p === t.prio ? 'selected' : ''}>${p}</option>`).join('')}</select>
          <span title="${esc(t.est_why || '')}">E <b class="num">${hm(t.est_minutes)}</b> ${badge(t.est_source)}</span>
          <span>가치 <b class="num">${kwon(t.est_value)}천원</b> ${badge('추정')}</span>
          ${canMeasure(t) ? `<span>T ${running ? `<span class="td-live" data-td-live="${t.id}">측정 중 ${liveMin(t)}분</span>` : t.actual_minutes != null ? `<b class="num">${hm(t.actual_minutes)}</b> ${badge(t.time_source)}` : '<span class="muted">-</span>'}</span>` : ''}
        </div>
        ${acts ? `<div class="row td-acts">${acts}</div>` : ''}
        ${manual}
      </div></li>`;
  }

  function todoBlock() {
    const cat = S.ui.tdCat || 'all';
    const mode = S.ui.tdSort || 'claude';
    const open = S.dailyTasks.filter((t) => !t.done);
    const shown = open.filter(inCat(cat));
    const now = shown.filter((t) => t.date <= S.today).sort(sorter(mode));
    const later = shown.filter((t) => t.date > S.today).sort((a, b) => a.date.localeCompare(b.date) || PRIO_RANK[a.prio] - PRIO_RANK[b.prio]);
    const todayAll = S.dailyTasks.filter((t) => t.date <= S.today || (t.done && t.done_at === S.today));
    const doneToday = S.dailyTasks.filter((t) => t.done && t.done_at === S.today).length;
    const pct = todayAll.length ? Math.round((100 * doneToday) / todayAll.length) : 0;
    const leftMin = now.reduce((s, t) => s + Math.max(0, t.est_minutes - (t.actual_minutes || 0)), 0);
    const ex = S.todayExtra;
    const groupLater = later.reduce((g, t) => { (g[t.date] = g[t.date] || []).push(t); return g; }, {});

    return `<section class="panel td-todo" aria-labelledby="h-todo">
      <div class="td-head"><h3 id="h-todo">할 일</h3>
        <div class="seg td-sort" role="group" aria-label="정렬">${SORTS.map(([k, l]) => `<button type="button" data-act="tdSort" data-v="${k}" aria-pressed="${k === mode}">${l}</button>`).join('')}</div></div>
      ${catTabs('tdCat', open)}
      <div class="td-prog"><div class="bar" aria-hidden="true"><i style="width:${pct}%"></i></div>
        <div class="td-prog-txt small"><span>오늘 완료 <b class="num">${doneToday}/${todayAll.length}</b> ${badge('측정')}</span><span>남은 예상 <b class="num">${hm(leftMin)}</b> ${badge('추정')}</span></div></div>

      ${cat === 'slack' || cat === 'all' ? `<div class="td-sync small"><span>슬랙: 나를 태그했거나 DM 중 내가 답할 것 · 마지막 조사 <b class="num">${ex.slackScanAt}</b></span><button type="button" class="btn sm" data-act="tdSlackScan">새 톡 확인</button></div>` : ''}
      ${cat === 'asana' || cat === 'all' ? `<div class="td-sync small"><span>아사나: 우선순위는 Claude가 판단 · 완료하면 아사나에도 완료 · 아사나에서 완료되면 여기도 자동 완료(마지막 수신 <b class="num">${ex.asanaSyncAt}</b>)</span><button type="button" class="btn sm" data-act="tdAsanaPull">아사나 수신</button></div>` : ''}

      ${cat === 'mine' || cat === 'all' ? `<form class="td-add" data-form="tdAdd">
        <label class="f td-add-title">직접 할 일 추가<input type="text" name="title" required maxlength="80" placeholder="예: 가맹 투자 미팅 준비" autocomplete="off"></label>
        <label class="f">우선순위<select name="prio">${PRIOS.map((p) => `<option ${p === '보통' ? 'selected' : ''}>${p}</option>`).join('')}</select></label>
        <label class="f">예상(분, 선택)<input type="number" name="est" min="5" step="5" placeholder="Claude 산정"></label>
        <button class="btn primary">추가</button></form>` : ''}

      <div class="td-sec">오늘 <span class="num">${now.length}</span></div>
      <ul class="td-list">${now.map(taskItem).join('') || '<li class="td-empty">오늘 할 일을 모두 끝냈습니다. 아래 다음 할 일을 이어서 하시면 됩니다.</li>'}</ul>
      ${Object.keys(groupLater).map((d) => `<div class="td-sec later">${md(d)} (${['일', '월', '화', '수', '목', '금', '토'][new Date(d + 'T00:00').getDay()]}) · ${days(S.today, d)}일 뒤 <span class="num">${groupLater[d].length}</span></div>
        <ul class="td-list">${groupLater[d].map(taskItem).join('')}</ul>`).join('')}
    </section>`;
  }

  /* ---------- 오른쪽: 완료한 일 ---------- */
  function doneBlock() {
    const cat = S.ui.tdDoneCat || 'all';
    const all = S.dailyTasks.filter((t) => t.done);
    const list = all.filter(inCat(cat)).sort((a, b) => (b.done_at || b.date).localeCompare(a.done_at || a.date) || (b.done_ts || 0) - (a.done_ts || 0));
    const todayList = list.filter((t) => t.done_at === S.today);
    const sum = todayList.reduce((s, t) => s + t.est_value, 0);
    const spent = todayList.reduce((s, t) => s + (t.actual_minutes || 0), 0);
    const groups = list.reduce((g, t) => { const d = t.done_at || t.date; (g[d] = g[d] || []).push(t); return g; }, {});
    const open = S.ui.tdOpen;
    const label = (d) => d === S.today ? '오늘' : d === dayStr(-1) ? `어제 · ${md(d)}` : `${md(d)} (${['일', '월', '화', '수', '목', '금', '토'][new Date(d + 'T00:00').getDay()]})`;
    const row = (t) => {
      const form = open && open.id === t.id && open.kind === 'complete';
      return `<li id="td-${t.id}"><div class="td-done-row">
          <label class="td-chk sm"><input type="checkbox" checked data-act="tdCheck" data-id="${t.id}" ${t.evaluated ? 'disabled' : ''}><span class="sr">${esc(t.title)} 완료 취소</span></label>
          <div class="td-done-main"><div>${srcChip(t.src)} <span class="td-done-t">${esc(t.title)}</span></div>
            <div class="small muted">${t.actual_minutes != null ? `T ${hm(t.actual_minutes)} ${badge(t.time_source)} · ` : ''}가치 ${kwon(t.est_value)}천원${t.src === 'asana' ? ` · ${t.asana_from ? '아사나에서 완료됨' : '아사나 반영됨'}` : t.src === 'slack' ? ' · 답변함' : t.src === 'approval' ? ' · 처리함' : ''}</div></div>
          <div class="td-done-side">${t.evaluated ? '<span class="pill st-done">평가로 넘김</span>' : canMeasure(t) ? `<button type="button" class="btn sm primary" data-act="tdOpen" data-k="complete" data-id="${t.id}">성과 평가</button>` : ''}</div></div>
          ${form ? completeForm(t) : ''}</li>`;
    };
    return `<section class="panel td-donep" aria-labelledby="h-done" id="tdDone">
      <div class="td-head"><h3 id="h-done">완료한 일</h3></div>
      ${catTabs('tdDoneCat', all)}
      <div class="td-done-sum"><span>오늘 <b class="num">${todayList.length}건</b> ${badge('측정')}</span><span>쓴 시간 <b class="num">${hm(spent)}</b> ${badge('측정')}</span><span>예상 가치 <b class="num">${kwon(sum)}천원</b> ${badge('추정')}</span></div>
      ${Object.keys(groups).length ? Object.keys(groups).map((d) => `<div class="td-sec${d === S.today ? '' : ' later'}">${label(d)} <span class="num">${groups[d].length}</span></div>
        <ul class="td-done">${groups[d].map(row).join('')}</ul>`).join('') : '<p class="td-empty">아직 완료한 일이 없습니다.</p>'}
    </section>`;
  }
  const completeForm = (t) => `<form class="form td-sub" data-form="tdComplete" data-id="${t.id}">
      <p class="wide small muted" style="margin:0">예상 E ${t.est_minutes}분 · 실제 T ${t.actual_minutes != null ? t.actual_minutes + '분' : '미측정(S=1.0)'} — 채우면 성과·레벨 평가로 넘어갑니다.</p>
      <label class="f wide">산출물 링크<input type="url" name="output_url" placeholder="https://"></label>
      <label class="f">산출물 형태<select name="output_type">${Object.entries(F_TYPES).map(([k, v]) => `<option value="${k}">${v[0]} (${v[1].toFixed(1)})</option>`).join('')}</select></label>
      <label class="f">영향 인원(명)<input type="number" name="headcount" min="1" value="1"></label>
      <label class="f">수행 방식<select name="by_agent"><option value="0">직접</option><option value="1">에이전트</option></select></label>
      <label class="f">1인 월 절감시간<input type="number" name="saved_hours" min="0" step="0.5" value="1"></label>
      <label class="f">유효개월(≤12)<input type="number" name="months" min="1" max="12" value="12"></label>
      <label class="f">월 매출·이익 기여(원)<input type="number" name="monthly_revenue" min="0" value="0"></label>
      <label class="f">월 비용절감(원)<input type="number" name="monthly_cost" min="0" value="0"></label>
      <label class="f">1회성<select name="one_off"><option value="0">아니오</option><option value="1">예(1개월분)</option></select></label>
      <div class="row wide"><button class="btn primary sm">Claude 최종 평가 요청</button><button type="button" class="btn sm" data-act="tdClose">나중에</button></div></form>`;

  function viewToday() {
    syncApprovals();
    /* 그린 뒤 진행 중·다음 일정이 보이도록 일정 띠를 옮김 */
    setTimeout(() => { const box = document.getElementById('tdMeets'); const el = box && box.querySelector('.td-meet.live, .td-meet.next'); if (el) box.scrollLeft = Math.max(0, el.parentElement.offsetLeft - box.offsetLeft - el.offsetWidth - 8); }, 0);
    return `<div class="view-head"><div><h2>오늘 할 일</h2><p>${new Date(S.today + 'T00:00').toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' })}</p></div></div>
      ${meetBlock()}
      <div class="td-layout">
        ${todoBlock()}
        <div class="td-right">${doneBlock()}</div>
      </div>`;
  }
  APP.views.today = viewToday;

  /* ---------- 동작 ---------- */
  const close = () => { S.ui.tdOpen = null; };
  const scrollTo = (id) => setTimeout(() => { const el = document.getElementById(id); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 30);
  function finish(t, from) {
    stopRun(t); t.done = true; t.done_at = S.today; t.done_ts = Date.now();
    if (t.src === 'approval') { const w = S.waiting.find((x) => x.id === t.ref); if (w) { S.waiting = S.waiting.filter((x) => x !== w); S.waitingDone.push(Object.assign({}, w, { done_at: S.today })); } }
    if (t.src === 'asana') t.asana_from = !!from;
  }
  function unfinish(t) {
    t.done = false; t.done_at = null; t.asana_from = false;
    if (t.src === 'approval') { const i = S.waitingDone.findIndex((x) => x.id === t.ref); if (i >= 0) { const w = S.waitingDone.splice(i, 1)[0]; delete w.done_at; S.waiting.push(w); } }
  }
  Object.assign(APP.acts, {
    tdCat: (el) => { S.ui[el.dataset.k] = el.dataset.v; },
    tdSort: (el) => { S.ui.tdSort = el.dataset.v; },
    tdCheck: (el) => {
      const t = task(el.dataset.id); if (t.evaluated) return;
      if (!t.done) {
        finish(t);
        const msg = { slack: '답변 완료로 표시했습니다', approval: '결재 처리했습니다(Asana 반영 예정)', asana: '완료 — 아사나에도 완료 처리합니다(목업)', mine: '완료했습니다' }[t.src];
        if (canMeasure(t)) { S.ui.tdOpen = { id: t.id, kind: 'complete' }; scrollTo('td-' + t.id); toast(msg + ' · 오른쪽에서 성과 평가를 채워 주세요'); } else toast(msg);
      } else { unfinish(t); close(); toast('할 일로 되돌렸습니다'); }
    },
    tdStart: (el) => { const t = task(el.dataset.id); t.run_at = Date.now(); t.started_at = t.started_at || t.run_at; close(); },
    tdStop: (el) => { const t = task(el.dataset.id); stopRun(t); toast(`측정 ${t.actual_minutes}분 기록`); },
    tdOpen: (el) => { const cur = S.ui.tdOpen; S.ui.tdOpen = cur && cur.id === el.dataset.id && cur.kind === el.dataset.k ? null : { id: el.dataset.id, kind: el.dataset.k }; },
    tdClose: close,
    tdTomorrow: (el) => { const t = task(el.dataset.id); stopRun(t); t.date = dayStr(1); close(); toast(`"${t.title}" 내일로 미뤘습니다${t.src === 'asana' ? '(아사나 기한도 변경 예정)' : ''}`); },
    tdBack: (el) => { task(el.dataset.id).date = S.today; toast('오늘 할 일로 당겼습니다'); },
    tdDel: (el) => {
      const t = task(el.dataset.id);
      // 화면 안 2단계 확인(공유 페이지에서는 브라우저 확인창이 뜨지 않음)
      if (S.ui.tdDelAsk !== t.id) { S.ui.tdDelAsk = t.id; toast('한 번 더 누르면 지웁니다'); return; }
      S.ui.tdDelAsk = null; S.dailyTasks = S.dailyTasks.filter((x) => x !== t); close(); toast('할 일을 지웠습니다');
    },
    tdSlackScan: () => {
      const ex = S.todayExtra; const prev = ex.slackScanAt; ex.slackScanAt = nowHM();
      const nx = ex.slackPool.shift();
      if (nx) { S.dailyTasks.push(newTask(Object.assign({ src: 'slack' }, nx))); toast(`${prev} 이후 새 톡 1건을 할 일로 올렸습니다`); } else toast(`${prev} 이후 답할 새 톡이 없습니다`);
    },
    tdAsanaPull: () => {
      const ex = S.todayExtra; ex.asanaSyncAt = nowHM();
      const t = S.dailyTasks.find((x) => x.src === 'asana' && !x.done && x.date > S.today);
      if (t) { finish(t, true); toast(`아사나에서 완료된 "${t.title}"을(를) 완료로 옮겼습니다`); } else toast('아사나에서 새로 완료된 태스크가 없습니다');
    },
    tdMeetOk: (el) => { const m = S.todayExtra.meetings.find((x) => x.id === el.dataset.id); m.status = '확정'; m.src += ' → 캘린더'; closeMeet(); toast('수락했습니다 — 캘린더 등록·슬랙 회신(목업)'); },
    tdMeetTask: (el) => { const m = S.todayExtra.meetings.find((x) => x.id === el.dataset.id); S.dailyTasks.push(newTask({ title: `준비: ${m.title}(${m.time})`, prio: '높음' })); closeMeet(); toast('준비할 일로 추가했습니다'); }
  });
  APP.changes.tdPrio = (el) => { task(el.dataset.id).prio = el.value; };
  Object.assign(APP.forms, {
    tdAdd: (fd) => {
      const title = (fd.get('title') || '').toString().trim(); if (!title) return;
      const est = +fd.get('est') || 0; const t = newTask({ title, prio: (fd.get('prio') || '보통').toString() });
      if (est > 0) { t.est_value = Math.round(t.est_value / t.est_minutes * Math.max(5, est) / 1000) * 1000; t.est_minutes = Math.max(5, est); t.est_source = '수기'; }
      S.dailyTasks.push(t); toast(`Claude 산정: ${hm(t.est_minutes)} · ${kwon(t.est_value)}천원 (${t.est_why})`);
    },
    tdManual: (fd, form) => { const t = task(form.dataset.id); t.run_at = null; t.actual_minutes = Math.max(1, +fd.get('min') || 1); t.acc_ms = t.actual_minutes * 60000; t.time_source = '수기'; t.started_at = t.started_at || Date.now(); close(); },
    tdComplete: (fd, form) => {
      const t = task(form.dataset.id); const g = (n) => (fd.get(n) || '').toString().trim();
      const a = evaluate({ id: uid('a'), title: t.title, date: S.today, output_url: g('output_url'), output_type: g('output_type'), headcount: Math.max(1, +g('headcount') || 1), by_agent: g('by_agent') === '1', saved_hours: +g('saved_hours') || 0, months: +g('months') || 1, monthly_revenue: +g('monthly_revenue') || 0, monthly_cost: +g('monthly_cost') || 0, one_off: g('one_off') === '1', est_minutes: t.est_minutes, actual_minutes: t.actual_minutes, N: 1, status: '평가중', negotiations: [] });
      S.achievements.push(a); t.evaluated = true; close();
      toast(`성과 평가로 넘겼습니다: ${kwon(a.value_won)}천원 (성과·레벨에서 확인)`);
    }
  });

  /* ---------- 다시 그리지 않는 동작: 일정 카드 좌우 이동·팝업 ---------- */
  document.addEventListener('click', (e) => {
    const sc = e.target.closest('[data-td-scroll]');
    if (sc) { const box = document.getElementById('tdMeets'); if (box) box.scrollBy({ left: +sc.dataset.tdScroll * box.clientWidth, behavior: 'smooth' }); return; }
    const mt = e.target.closest('[data-td-meet]'); if (mt) { openMeet(mt.dataset.tdMeet); return; }
    if (e.target.closest('[data-td-close]') || e.target.id === 'tdModal') closeMeet();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMeet(); });
  window.addEventListener('hashchange', closeMeet);

  /* 측정 중 표시를 30초마다 갱신(글자만 바꿈) */
  setInterval(() => {
    document.querySelectorAll('[data-td-live]').forEach((el) => { const t = task(el.dataset.tdLive); if (t && t.run_at) el.textContent = `측정 중 ${liveMin(t)}분`; });
  }, 30000);
})();
