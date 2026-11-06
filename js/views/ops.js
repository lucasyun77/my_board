/* 메뉴: 경영 현황 (ops) — 이 메뉴 담당 하위 세션은 이 파일만 고칩니다.
   공용 도구·상태는 window.APP에서 꺼내 씁니다. 새 버튼 동작은 APP.acts['이름'] = (el) => {...},
   새 폼은 APP.forms['이름'] = (fd, form) => {...}, 새 select 변경은 APP.changes['이름'] = (el) => {...} 로 등록합니다.
   ※ 임직원 연봉·임금 정보는 이 화면에 어떤 형태로도 넣지 않습니다. */
(function () {
  'use strict';
  const { S, esc, days, md, badge, uid, toast, dayStr } = window.APP;

  /* ---------- 샘플 데이터 보강(메뉴 파일 안에서만) ---------- */
  const ISSUE_STATUS = ['접수', '대응 중', '합의·조정', '종결'];
  const ISSUE_KIND = ['분쟁', '이슈'];
  const ORGS = (window.MOCK && MOCK.ORGS) || ['경영지원본부'];
  // 회장 대기함: 처리 완료는 S.waiting에서 빼서 S.waitingDone으로 옮긴다(홈·오늘 할 일 숫자와 맞추기 위해)
  S.waiting.forEach((w, i) => { if (!w.id) w.id = 'w' + (i + 1); });
  S.waitingDone = S.waitingDone || []; // 오늘 할 일 메뉴와 같은 처리 완료 목록을 함께 씀
  // 부서별 지연 과제 이름(수훈보드 연동 전 샘플)
  S.opsDeptTasks = S.opsDeptTasks || {
    '벌툰사업부': ['가맹점 오픈 체크리스트 개정'],
    '생전포차사업부': ['해외 메뉴 현지화 시안', '점포 위생 점검표 정비'],
    'AI전략실': ['부서별 AI 자동화 사례 취합', '회의록 요약 품질 점검', '사내 AI 교육 일정 공지'],
    '마케팅실': ['벌툰 표기 통일 점검 1차 보고']
  };
  // 이슈: id·분류·상태·기록 필드 보강
  S.issues.forEach((it, i) => {
    if (!it.id) it.id = 'is' + (i + 1);
    if (!it.kind) it.kind = /분쟁/.test(it.title) ? '분쟁' : '이슈';
    if (!it.status) it.status = '대응 중';
    if (!it.opened) it.opened = dayStr(-(5 + i * 3));
    if (!it.log) it.log = [];
    if (!it.impact) it.impact = it.kind === '분쟁' ? 3 : 2;      // 영향 1~3 (수기)
    if (!it.likely) it.likely = it.kind === '분쟁' ? 2 : 3;      // 가능성 1~3 (수기)
    if (!it.decisions) it.decisions = [];
  });
  // 부서 신호등 지난주 값(수훈보드 연동 전 샘플) — 추이 비교용
  S.opsDeptPrev = S.opsDeptPrev || {
    '경영지원본부': { registered: true, delayed: 1 }, '벌툰사업부': { registered: true, delayed: 1 }, '블랙라벨사업부': { registered: true, delayed: 2 },
    '생전포차사업부': { registered: false, delayed: 1 }, 'AI전략실': { registered: true, delayed: 2 }, '마케팅실': { registered: true, delayed: 0 }
  };
  // 메뉴 연결 약속
  S.activity = S.activity || [];
  S.inbox = S.inbox || [];
  const log = (type, text, ref) => { S.activity.push({ id: uid('ac'), at: new Date().toISOString(), menu: 'ops', type, text, ref: ref || '' }); if (S.activity.length > 300) S.activity.splice(0, S.activity.length - 300); };

  const ui = () => { const o = (S.ui.ops = S.ui.ops || {}); return Object.assign(o, Object.assign({ tab: 'board', issueFilter: 'open', editIssue: null, sigFilter: 'all', cell: null, focus: null }, o)); };
  const LV = ['', '낮음', '보통', '높음'];
  const riskOf = (it) => it.impact * it.likely;
  const riskCls = (n) => (n >= 6 ? 'r' : n >= 3 ? 'y' : 'g');

  /* ---------- 계산 ---------- */
  const sigOf = (d) => (!d.registered || d.delayed >= 3 ? 'r' : d.delayed ? 'y' : 'g');
  const SIG_TXT = { g: '양호', y: '주의', r: '위험' };
  const dueTxt = (due) => {
    const n = days(S.today, due);
    if (n < 0) return `<span class="ops-due over">D+${-n}</span>`;
    if (n === 0) return '<span class="ops-due over">오늘</span>';
    return `<span class="ops-due ${n <= 3 ? 'near' : ''}">D-${n}</span>`;
  };
  const SIG_RANK = { g: 0, y: 1, r: 2 };
  function trendOf(d) {
    const p = S.opsDeptPrev[d.name]; if (!p) return { k: 'same', txt: '— 비교 없음', prevTxt: '없음' };
    const a = sigOf(d), b = sigOf(p);
    const k = SIG_RANK[a] < SIG_RANK[b] || (a === b && d.delayed < p.delayed) ? 'up' : SIG_RANK[a] > SIG_RANK[b] || (a === b && d.delayed > p.delayed) ? 'down' : 'same';
    const diff = d.delayed - p.delayed;
    return { k, txt: k === 'up' ? `▲ 좋아짐${diff ? ` (지연 ${diff})` : ''}` : k === 'down' ? `▼ 나빠짐${diff ? ` (지연 +${diff})` : ''}` : '— 같음', prevTxt: `${SIG_TXT[b]} · 지연 ${p.delayed}건${p.registered ? '' : ' · 미등록'}` };
  }
  const nowHM = () => { const d = new Date(); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };

  /* ---------- ① 회장 대기함 ---------- */
  function waitingBlock() {
    const wl = S.waiting.slice().sort((a, b) => a.since.localeCompare(b.since));
    const done = S.waitingDone.filter((x) => x.done_at === S.today);
    const rows = wl.map((w) => {
      const d = days(w.since, S.today);
      const lv = d >= 5 ? 'crit' : d >= 3 ? 'warn' : '';
      return `<li class="ops-wait ${lv}">
        <div class="ops-wait-days num"><b>${d}</b><small>일째</small></div>
        <div class="ops-wait-body"><div class="ops-title">${esc(w.title)}</div><div class="ops-meta">${esc(w.from)} · ${md(w.since)} 요청</div></div>
        <button type="button" class="btn sm" data-act="opsWaitDone" data-id="${esc(w.id)}" aria-label="${esc(w.title)} 처리 완료">처리 완료</button>
      </li>`;
    }).join('');
    return `<section class="panel" aria-labelledby="h-ops-wait">
      <h3 id="h-ops-wait">회장 대기함 ${badge('측정')}<span class="ops-count">${wl.length}건</span></h3>
      <p class="ops-note">Asana에서 회장 담당·미완료인 건을 오래 기다린 순으로 보여 줍니다.</p>
      ${wl.length ? `<ul class="ops-list">${rows}</ul>` : '<p class="ops-empty">기다리는 건이 없습니다. 모두 처리했습니다.</p>'}
      ${done.length ? `<details class="ops-done"><summary>오늘 처리한 건 ${done.length}건</summary><ul class="ops-list">${done.map((w) => `<li class="ops-wait done"><div class="ops-wait-body"><div class="ops-title">${esc(w.title)}</div><div class="ops-meta">${esc(w.from)} · ${days(w.since, S.today)}일 대기 후 처리</div></div><button type="button" class="btn sm" data-act="opsWaitUndo" data-id="${esc(w.id)}">되돌리기</button></li>`).join('')}</ul></details>` : ''}
    </section>`;
  }

  /* ---------- ② 부서 신호등 ---------- */
  function deptBlock() {
    const f = ui().sigFilter;
    const all = S.depts.slice().sort((a, b) => 'rgy'.indexOf(sigOf(a)) - 'rgy'.indexOf(sigOf(b)) || b.delayed - a.delayed);
    const list = f === 'warn' ? all.filter((d) => sigOf(d) !== 'g') : all;
    const cnt = { g: 0, y: 0, r: 0 }; S.depts.forEach((d) => cnt[sigOf(d)]++);
    const tr = { up: 0, down: 0 }; S.depts.forEach((d) => { const t = trendOf(d); if (t.k !== 'same') tr[t.k]++; });
    return `<section class="panel" aria-labelledby="h-ops-sig">
      <h3 id="h-ops-sig">부서 신호등 ${badge('미확인')}
        <span class="seg ops-seg">${[['all', '전체'], ['warn', '주의·위험만']].map(([k, l]) => `<button type="button" data-act="opsSigFilter" data-v="${k}" aria-pressed="${f === k}">${l}</button>`).join('')}</span></h3>
      <div class="ops-sigsum">${['r', 'y', 'g'].map((c) => `<span><span class="sig ${c}"></span>${SIG_TXT[c]} <b class="num">${cnt[c]}</b></span>`).join('')}<span class="ops-trsum">지난주 대비 <b class="ops-tr up">좋아짐 ${tr.up}</b> · <b class="ops-tr down">나빠짐 ${tr.down}</b></span></div>
      <ul class="ops-list">${list.map((d) => {
        const c = sigOf(d); const tasks = S.opsDeptTasks[d.name] || []; const t = trendOf(d);
        const why = !d.registered ? '수훈보드 현황판 미등록' : d.delayed ? `지연 과제 ${d.delayed}건` : '지연 없음';
        return `<li class="ops-dept ${c}">
          <div class="ops-dept-head"><span class="ops-light ${c}">${SIG_TXT[c]}</span><b>${esc(d.name)}</b><span class="ops-tr ${t.k}" title="지난주: ${t.prevTxt}">${t.txt}</span>
            <span class="ops-meta">${d.registered ? '현황판 등록' : '<span class="ops-bad">현황판 미등록</span>'} · 지연 <b class="num">${d.delayed}</b>건</span></div>
          ${tasks.length ? `<details><summary>${esc(why)} — 과제 보기</summary><ul class="ops-sub">${tasks.slice(0, d.delayed || tasks.length).map((t) => `<li>${esc(t)}</li>`).join('')}</ul></details>` : `<div class="ops-meta">${esc(why)}</div>`}
        </li>`;
      }).join('') || '<li class="ops-empty">주의·위험 부서가 없습니다.</li>'}</ul>
      <p class="ops-note">기준: 미등록 또는 지연 3건 이상 = 위험, 지연 1~2건 = 주의. 추이는 지난주 신호·지연 건수와 비교합니다. 수훈보드 연동 방법 확인 전이라 샘플값입니다.</p>
    </section>`;
  }

  /* ---------- ③ 브랜드 핵심 지표 ---------- */
  function brandBlock() {
    const brands = [['블랙라벨', 'bl'], ['벌툰', 'bt'], ['생전포차', 'sp']];
    const metrics = ['월 매출', '가맹점 수', '전월 대비 매출', '점포당 평균 매출'];
    return `<section class="panel" aria-labelledby="h-ops-brand">
      <h3 id="h-ops-brand">브랜드 핵심 지표</h3>
      <div class="ops-brands">${brands.map(([b, k]) => `<div class="ops-brand ${k}"><div class="ops-brand-name">${b}</div>
        <dl>${metrics.map((m) => `<div><dt>${m}</dt><dd>— ${badge('미확인')}</dd></div>`).join('')}</dl></div>`).join('')}</div>
      <p class="ops-note">데이터 원천(POS·가맹 관리 시스템 등)이 확정될 때까지 숫자를 비워 둡니다. 임의의 숫자를 넣지 않습니다.</p>
    </section>`;
  }

  /* ---------- ④ 이슈·분쟁 추적 ---------- */
  function issueForm(it) {
    const v = it || { title: '', kind: '분쟁', owner: ORGS[0], next: '', due: dayStr(7) };
    return `<form class="form ops-form" data-form="${it ? 'opsIssueEdit' : 'opsIssue'}" ${it ? `data-id="${esc(it.id)}"` : ''}>
      ${it ? '' : `<label class="f wide">건 이름<input type="text" name="title" required placeholder="예: 가맹점 B 계약 해지 통보"></label>
      <label class="f">분류<select name="kind">${ISSUE_KIND.map((k) => `<option ${k === v.kind ? 'selected' : ''}>${k}</option>`).join('')}</select></label>`}
      <label class="f">담당${picker({ key: it ? 'own-' + it.id : 'own-new', name: 'owner', list: ownerList(), value: v.owner, label: '담당 부서·사람 찾기' })}</label>
      <label class="f">영향<select name="impact">${[3, 2, 1].map((n) => `<option value="${n}" ${n === (v.impact || 2) ? 'selected' : ''}>${LV[n]}</option>`).join('')}</select></label>
      <label class="f">가능성<select name="likely">${[3, 2, 1].map((n) => `<option value="${n}" ${n === (v.likely || 2) ? 'selected' : ''}>${LV[n]}</option>`).join('')}</select></label>
      <label class="f">기한<input type="date" name="due" required value="${esc(v.due)}"></label>
      <label class="f wide">다음 조치<input type="text" name="next" required value="${esc(v.next)}" placeholder="예: 법무 검토 의견 받기"></label>
      <div class="row"><button class="btn primary sm">${it ? '저장' : '등록'}</button>${it ? '<button type="button" class="btn sm" data-act="opsIssueCancel">취소</button>' : ''}</div>
    </form>`;
  }
  function issueBlock() {
    const o = ui();
    const open = S.issues.filter((i) => i.status !== '종결');
    const list = (o.issueFilter === 'open' ? open : S.issues.slice()).sort((a, b) => (a.status === '종결') - (b.status === '종결') || a.due.localeCompare(b.due));
    const near = open.filter((i) => days(S.today, i.due) <= 3).length;
    return `<section class="panel" aria-labelledby="h-ops-issue">
      <h3 id="h-ops-issue">이슈·분쟁 추적 ${badge('수기')}<span class="ops-count">진행 ${open.length}건${near ? ` · 기한 임박 ${near}` : ''}</span>
        <span class="seg ops-seg">${[['open', '진행 중'], ['all', '전체']].map(([k, l]) => `<button type="button" data-act="opsIssueFilter" data-v="${k}" aria-pressed="${o.issueFilter === k}">${l}</button>`).join('')}</span></h3>
      <ul class="ops-list">${list.map((it) => {
        const closed = it.status === '종결';
        if (o.editIssue === it.id) return `<li class="ops-issue editing"><div class="ops-title">${esc(it.title)}</div>${issueForm(it)}</li>`;
        const rk = riskOf(it);
        return `<li class="ops-issue ${closed ? 'closed' : ''} ${o.focus === it.id ? 'focus' : ''}" id="ops-is-${esc(it.id)}">
          <div class="ops-issue-top"><span class="pill ${it.kind === '분쟁' ? 'p-urgent' : 'p-high'}">${esc(it.kind)}</span><span class="ops-title">${esc(it.title)}</span>${closed ? '' : dueTxt(it.due)}</div>
          <div class="ops-issue-next"><span class="muted">다음 조치</span> ${esc(it.next)}</div>
          <div class="ops-meta"><span class="ops-risk ${riskCls(rk)}">위험 ${rk}</span> 영향 ${LV[it.impact]} × 가능성 ${LV[it.likely]}</div>
          <div class="ops-issue-foot"><span class="ops-meta">${esc(it.owner)} · 기한 ${md(it.due)} · 등록 ${md(it.opened)}</span>
            <span class="row"><select aria-label="${esc(it.title)} 상태" data-act="opsIssueStatus" data-id="${esc(it.id)}">${ISSUE_STATUS.map((s) => `<option ${s === it.status ? 'selected' : ''}>${s}</option>`).join('')}</select>
            ${closed ? '' : `<button type="button" class="btn sm" data-act="opsIssueEdit" data-id="${esc(it.id)}">고치기</button>`}</span></div>
          ${it.log.length ? `<details class="ops-log"><summary>기록 ${it.log.length}건</summary><ul class="ops-sub">${it.log.slice().reverse().map((l) => `<li><span class="num">${md(l.at)}</span> ${esc(l.text)}</li>`).join('')}</ul></details>` : ''}
        </li>`;
      }).join('') || '<li class="ops-empty">진행 중인 이슈·분쟁이 없습니다.</li>'}</ul>
      <details class="adder"><summary class="btn sm">＋ 이슈·분쟁 등록</summary>${issueForm(null)}</details>
    </section>`;
  }

  /* ---------- ⑤ 오늘 일정 ---------- */
  function calBlock() {
    const now = nowHM();
    const cal = S.calendar.slice().sort((a, b) => a.time.localeCompare(b.time));
    const nextIdx = cal.findIndex((c) => c.time >= now);
    return `<section class="panel" aria-labelledby="h-ops-cal">
      <h3 id="h-ops-cal">오늘 일정 ${badge('측정')}<span class="ops-count">${cal.length}건</span></h3>
      <div class="tl">${cal.map((c, i) => {
        const st = nextIdx === -1 || i < nextIdx ? 'past' : i === nextIdx ? 'next' : '';
        return `<div class="tl-row ops-cal ${st}"><span class="d">${esc(c.time)}</span><span>${esc(c.title)}${st === 'next' ? ' <span class="pill st-wait">다음</span>' : ''}</span></div>`;
      }).join('') || '<p class="ops-empty">오늘 일정이 없습니다.</p>'}</div>
      <p class="ops-note">Google Calendar 연동 예정(목업 샘플). 지난 일정은 흐리게 표시합니다.</p>
    </section>`;
  }

  /* ---------- 위험 관리표(영향 × 가능성) ---------- */
  function riskBlock() {
    const o = ui();
    const open = S.issues.filter((i) => i.status !== '종결');
    const at = (im, lk) => open.filter((i) => i.impact === im && i.likely === lk);
    const sel = o.cell ? o.cell.split('-').map(Number) : null;
    const picked = sel ? at(sel[0], sel[1]) : [];
    const top = open.slice().sort((a, b) => riskOf(b) - riskOf(a) || a.due.localeCompare(b.due));
    return `<section class="panel" aria-labelledby="h-ops-risk">
      <h3 id="h-ops-risk">위험 관리표 ${badge('수기')}<span class="ops-count">진행 이슈 ${open.length}건</span></h3>
      <p class="ops-note" style="margin-top:0">칸을 누르면 그 칸의 이슈가 아래에 나옵니다. 오른쪽 위로 갈수록 먼저 챙길 건입니다.</p>
      <div class="ops-matrix" role="grid" aria-label="영향과 가능성으로 놓은 위험 관리표">
        <div class="ops-mx-row ops-mx-x" aria-hidden="true"><span class="ops-mx-lab">영향</span><span></span><span></span><span></span></div>
        ${[3, 2, 1].map((im) => `<div class="ops-mx-row" role="row"><span class="ops-mx-lab" role="rowheader">${LV[im]}</span>${[1, 2, 3].map((lk) => {
          const list = at(im, lk); const k = im + '-' + lk; const on = o.cell === k;
          return `<button type="button" role="gridcell" class="ops-cell ${riskCls(im * lk)} ${list.length ? 'has' : ''} ${on ? 'on' : ''}" data-act="opsCell" data-v="${k}" aria-pressed="${on}" aria-label="영향 ${LV[im]}, 가능성 ${LV[lk]}: ${list.length}건">
            <b class="num">${list.length || ''}</b><span class="ops-cell-t">${list.slice(0, 2).map((i) => esc(i.title.replace(/^\[예시\]\s*/, ''))).join('<br>')}</span></button>`;
        }).join('')}</div>`).join('')}
        <div class="ops-mx-row ops-mx-x" aria-hidden="true"><span class="ops-mx-lab"></span><span>낮음</span><span>보통</span><span>높음</span></div>
        <div class="ops-mx-xt" aria-hidden="true">가능성 →</div>
      </div>
      ${sel ? `<div class="ops-cellpick"><div class="ops-meta">영향 ${LV[sel[0]]} × 가능성 ${LV[sel[1]]} — ${picked.length}건 <button type="button" class="btn sm" data-act="opsCell" data-v="">닫기</button></div>
        ${picked.length ? `<ul class="ops-list">${picked.map((i) => `<li class="ops-issue"><div class="ops-issue-top"><span class="ops-title">${esc(i.title)}</span>${dueTxt(i.due)}</div><div class="ops-issue-next"><span class="muted">다음 조치</span> ${esc(i.next)}</div><div class="row"><span class="ops-meta">${esc(i.owner)}</span><button type="button" class="btn sm" data-act="opsGoIssue" data-id="${esc(i.id)}">이슈 보기 →</button></div></li>`).join('')}</ul>` : '<p class="ops-empty">이 칸에는 이슈가 없습니다.</p>'}</div>`
      : top.length ? `<p class="ops-meta" style="margin:10px 0 0">가장 높은 위험: <b>${esc(top[0].title)}</b> (위험 ${riskOf(top[0])})</p>` : ''}
    </section>`;
  }

  /* ---------- 받은 항목(다른 메뉴가 보낸 것) ---------- */
  function inboxBlock() {
    const items = S.inbox.filter((x) => x.to === 'ops' && !x.done);
    if (!items.length) return '';
    return `<section class="panel ops-inbox" aria-labelledby="h-ops-inbox">
      <h3 id="h-ops-inbox">받은 항목<span class="ops-count">${items.length}건</span></h3>
      <ul class="ops-list">${items.map((x) => `<li class="ops-wait"><div class="ops-wait-body" style="grid-column:1 / 3"><div class="ops-title">${esc(x.title)}</div><div class="ops-meta">${esc(x.from || '다른 메뉴')}에서 · ${esc(x.kind || '')} · ${md(x.at)}</div></div>
        <span class="row"><button type="button" class="btn sm" data-act="opsInboxIssue" data-id="${esc(x.id)}">이슈로 등록</button><button type="button" class="btn sm" data-act="opsInboxDone" data-id="${esc(x.id)}">확인 완료</button></span></li>`).join('')}</ul>
    </section>`;
  }

  /* ---------- 담당 고르기: 입력해서 찾는 칸 (이름·부서·초성, ↑↓·Enter·Esc·×) ---------- */
  const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
  const cho = (s) => String(s || '').replace(/[가-힣]/g, (c) => CHO[Math.floor((c.charCodeAt(0) - 0xAC00) / 588)]);
  function ownerList() {
    const m = new Map();
    [...ORGS, ...S.depts.map((d) => d.name)].forEach((n) => { if (n && !m.has(n)) m.set(n, { n, d: '부서' }); });
    S.directives.forEach((d) => { if (d.assignee && d.assignee !== '미지정' && !m.has(d.assignee)) m.set(d.assignee, { n: d.assignee, d: d.org || '' }); });
    return [...m.values()];
  }
  const deptList = () => S.depts.map((d) => ({ n: d.name, d: '신호 ' + SIG_TXT[sigOf(d)] }));
  const PK = {};
  function picker(o) {
    PK[o.key] = { list: o.list, act: o.act || '' };
    const v = o.value || '';
    return `<span class="ops-pk"><input type="text" class="ops-pk-in" role="combobox" aria-expanded="false" aria-autocomplete="list" aria-controls="opl-${esc(o.key)}" aria-label="${esc(o.label || '찾기')}" autocomplete="off" spellcheck="false" data-opk="${esc(o.key)}" data-prev="${esc(v)}" value="${esc(v)}" placeholder="이름·부서·초성(예: ㄱㅇ)">${o.name ? `<input type="hidden" name="${esc(o.name)}" value="${esc(v)}">` : ''}<button type="button" class="ops-pk-x" data-opx="${esc(o.key)}" tabindex="-1" aria-label="지우기" ${v ? '' : 'hidden'}>×</button><ul class="ops-pk-list" id="opl-${esc(o.key)}" role="listbox" hidden></ul></span>`;
  }
  function pkMatch(list, q) {
    q = String(q || '').trim().toLowerCase(); if (!q) return list;
    const onlyCho = /^[ㄱ-ㅎ\s]+$/.test(q);
    return list.map((s) => { const n = s.n.toLowerCase(); const hay = (s.n + ' ' + s.d).toLowerCase();
      const r = onlyCho ? (cho(s.n).startsWith(q) ? 1 : cho(hay).includes(q) ? 2 : -1) : (n.startsWith(q) ? 1 : n.includes(q) ? 2 : hay.includes(q) ? 3 : -1); return [s, r]; })
      .filter((x) => x[1] > 0).sort((a, b) => a[1] - b[1]).map((x) => x[0]);
  }
  function pkOpen(inp, q) {
    const reg = PK[inp.dataset.opk]; if (!reg) return;
    const ul = inp.parentNode.querySelector('.ops-pk-list'); const hits = pkMatch(reg.list, q);
    ul.innerHTML = hits.map((s, i) => `<li role="option" id="opo-${esc(inp.dataset.opk)}-${i}" data-v="${esc(s.n)}"><b>${esc(s.n)}</b><span>${esc(s.d)}</span></li>`).join('') || '<li class="none" aria-disabled="true">맞는 항목이 없습니다</li>';
    ul.hidden = false; inp.setAttribute('aria-expanded', 'true'); pkActive(inp, ul.querySelector('li[data-v]'));
  }
  function pkActive(inp, li) {
    const ul = inp.parentNode.querySelector('.ops-pk-list'); ul.querySelectorAll('li.on').forEach((x) => x.classList.remove('on'));
    if (li) { li.classList.add('on'); inp.setAttribute('aria-activedescendant', li.id); li.scrollIntoView({ block: 'nearest' }); } else inp.removeAttribute('aria-activedescendant');
  }
  function pkClose(inp) { const ul = inp.parentNode && inp.parentNode.querySelector('.ops-pk-list'); if (ul) ul.hidden = true; inp.setAttribute('aria-expanded', 'false'); }
  function pkPick(inp, v) {
    const reg = PK[inp.dataset.opk]; inp.value = v; inp.dataset.prev = v; pkClose(inp);
    const h = inp.parentNode.querySelector('input[type="hidden"]'); if (h) h.value = v;
    const x = inp.parentNode.querySelector('.ops-pk-x'); if (x) x.hidden = !v;
    if (reg && reg.act && APP.changes[reg.act]) { inp.dataset.picked = '1'; APP.changes[reg.act]({ dataset: {}, value: v }); APP.rerenderOps(); }
  }
  document.addEventListener('focusin', (e) => { const t = e.target; if (t && t.dataset && t.dataset.opk) { t.select(); pkOpen(t, ''); } });
  document.addEventListener('input', (e) => { const t = e.target; if (t && t.dataset && t.dataset.opk) pkOpen(t, t.value); });
  document.addEventListener('focusout', (e) => {
    const t = e.target; if (!t || !t.dataset || !t.dataset.opk) return;
    if (t.dataset.picked) { delete t.dataset.picked; return; }
    pkClose(t); const reg = PK[t.dataset.opk]; const typed = t.value.trim(); if (!reg || typed === t.dataset.prev) return;
    const hits = pkMatch(reg.list, typed); const exact = reg.list.find((s) => s.n === typed) || (hits.length === 1 ? hits[0] : null);
    if (exact && typed) pkPick(t, exact.n); else t.value = t.dataset.prev; // 없는 값은 원래 값으로
  });
  window.addEventListener('keydown', (e) => {
    const t = e.target; if (!t || !t.dataset || !t.dataset.opk) return;
    const ul = t.parentNode.querySelector('.ops-pk-list'); const opts = [...ul.querySelectorAll('li[data-v]')]; const cur = ul.querySelector('li.on'); const i = opts.indexOf(cur);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (ul.hidden) { pkOpen(t, ''); return; } pkActive(t, opts[e.key === 'ArrowDown' ? Math.min(opts.length - 1, i + 1) : Math.max(0, i - 1)] || null); }
    else if (e.key === 'Enter') { e.preventDefault(); if (!ul.hidden && cur) pkPick(t, cur.dataset.v); }
    else if (e.key === 'Escape' && !ul.hidden) { e.preventDefault(); e.stopImmediatePropagation(); t.value = t.dataset.prev; pkClose(t); }
  }, true);
  document.addEventListener('mousedown', (e) => {
    const t = e.target; if (!t || !t.closest) return;
    const li = t.closest('.ops-pk-list li[data-v]');
    if (li) { e.preventDefault(); pkPick(li.closest('.ops-pk').querySelector('.ops-pk-in'), li.dataset.v); return; }
    if (t.closest('.ops-pk-list')) { e.preventDefault(); return; }
    const x = t.closest('[data-opx]'); if (x) { e.preventDefault(); const inp = x.closest('.ops-pk').querySelector('.ops-pk-in'); inp.value = ''; inp.focus(); pkOpen(inp, ''); }
  });
  // 고른 값으로 화면을 다시 그릴 때(필터형 picker) — 공용 render를 부르기 위해 숨은 버튼 클릭을 흉내 낸다
  APP.rerenderOps = () => { const b = document.createElement('button'); b.type = 'button'; b.dataset.act = 'opsNoop'; b.hidden = true; document.body.appendChild(b); b.click(); b.remove(); };
  APP.acts.opsNoop = () => {};

  /* ---------- 화면 ---------- */
  const TABS_OPS = [['board', '상황판'], ['issues', '이슈·위험']];
  function viewOps() {
    const o = ui();
    if (!TABS_OPS.some((t) => t[0] === o.tab)) o.tab = 'board';
    const wl = S.waiting;
    const maxWait = wl.length ? Math.max(...wl.map((w) => days(w.since, S.today))) : 0;
    const red = S.depts.filter((d) => sigOf(d) === 'r').length;
    const openIss = S.issues.filter((i) => i.status !== '종결');
    const overIss = openIss.filter((i) => i.due < S.today).length;
    const hiRisk = openIss.filter((i) => riskOf(i) >= 6).length;
    const body = {
      board: () => `<div class="grid2 ops-grid">${waitingBlock()}${deptBlock()}</div>${brandBlock()}${calBlock()}`,
      issues: () => `<div class="grid2 ops-grid ops-grid-issue">${riskBlock()}${issueBlock()}</div>`
    }[o.tab]();
    return `<div class="view-head"><div><h2>경영 현황</h2><p>위험과 결재 지연을 먼저 봅니다.</p></div></div>
      ${inboxBlock()}
      <div class="ops-strip" role="list">
        <button type="button" role="listitem" data-act="opsJump" data-tab="board" data-v="h-ops-wait" class="${maxWait >= 5 ? 'alert' : ''}">대기 <b class="num">${wl.length}</b>건${wl.length ? ` · 최장 ${maxWait}일` : ''}</button>
        <button type="button" role="listitem" data-act="opsJump" data-tab="board" data-v="h-ops-sig" class="${red ? 'alert' : ''}">위험 부서 <b class="num">${red}</b>곳</button>
        <button type="button" role="listitem" data-act="opsJump" data-tab="issues" data-v="h-ops-risk" class="${hiRisk || overIss ? 'alert' : ''}">진행 이슈 <b class="num">${openIss.length}</b>건${hiRisk ? ` · 고위험 ${hiRisk}` : ''}${overIss ? ` · 기한 경과 ${overIss}` : ''}</button>
      </div>
      <div class="seg ops-tabs" role="tablist" aria-label="경영 현황 보기">${TABS_OPS.map(([k, l]) => `<button type="button" role="tab" data-act="opsTab" data-v="${k}" aria-pressed="${o.tab === k}" aria-selected="${o.tab === k}">${l}</button>`).join('')}</div>
      ${body}`;
  }
  APP.views.ops = viewOps;

  /* ---------- 동작 ---------- */
  APP.acts.opsWaitDone = (el) => {
    const i = S.waiting.findIndex((w) => w.id === el.dataset.id); if (i < 0) return;
    const [w] = S.waiting.splice(i, 1);
    S.waitingDone.push(Object.assign(w, { done_at: S.today }));
    log('waiting-done', `대기함 처리 완료: ${w.title}`, w.id);
    toast('처리 완료로 표시했습니다 (Asana 완료 처리는 목업 표시)');
  };
  APP.acts.opsWaitUndo = (el) => {
    const i = S.waitingDone.findIndex((w) => w.id === el.dataset.id); if (i < 0) return;
    const [w] = S.waitingDone.splice(i, 1); delete w.done_at;
    S.waiting.push(w);
    toast('대기함으로 되돌렸습니다');
  };
  const scrollTo = (id) => setTimeout(() => { const t = document.getElementById(id); if (t) (t.closest('section, li') || t).scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 0);
  APP.acts.opsTab = (el) => { const o = ui(); o.tab = el.dataset.v; o.focus = null; };
  APP.acts.opsCell = (el) => { const o = ui(); o.cell = el.dataset.v && o.cell !== el.dataset.v ? el.dataset.v : null; };
  APP.acts.opsGoIssue = (el) => { const o = ui(); o.tab = 'issues'; o.focus = el.dataset.id; o.issueFilter = 'all'; scrollTo('ops-is-' + el.dataset.id); };
  APP.acts.opsInboxDone = (el) => { const x = S.inbox.find((i) => i.id === el.dataset.id); if (!x) return; x.done = true; log('inbox-done', `받은 항목 확인: ${x.title}`, x.id); toast('확인 완료로 표시했습니다'); };
  APP.acts.opsInboxIssue = (el) => {
    const x = S.inbox.find((i) => i.id === el.dataset.id); if (!x) return;
    const p = x.payload || {};
    const it = { id: uid('is'), title: x.title, kind: p.kind === '분쟁' ? '분쟁' : '이슈', owner: p.org || p.owner || ORGS[0], next: p.next || '담당 확인 후 다음 조치 정하기', due: p.due || dayStr(7), status: '접수', opened: S.today, impact: 2, likely: 2, decisions: [], log: [{ at: S.today, text: `${x.from || '다른 메뉴'}에서 받아 등록` }] };
    S.issues.push(it); x.done = true;
    const o = ui(); o.tab = 'issues'; o.focus = it.id; o.issueFilter = 'open';
    log('issue-add', `받은 항목을 이슈로 등록: ${it.title}`, it.id); toast('이슈로 등록했습니다 — 영향·가능성을 정해 주세요'); scrollTo('ops-is-' + it.id);
  };
  APP.acts.opsJump = (el) => { const id = el.dataset.v; if (el.dataset.tab) ui().tab = el.dataset.tab; setTimeout(() => { const t = document.getElementById(id); if (t) t.closest('section').scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 30); };
  APP.acts.opsSigFilter = (el) => { ui().sigFilter = el.dataset.v; };
  APP.acts.opsIssueFilter = (el) => { ui().issueFilter = el.dataset.v; };
  APP.acts.opsIssueEdit = (el) => { ui().editIssue = el.dataset.id; };
  APP.acts.opsIssueCancel = () => { ui().editIssue = null; };
  APP.changes.opsIssueStatus = (el) => {
    const it = S.issues.find((x) => x.id === el.dataset.id); if (!it || it.status === el.value) return;
    it.log.push({ at: S.today, text: `상태 ${it.status} → ${el.value}` });
    log('issue-status', `${it.title}: ${it.status} → ${el.value}`, it.id);
    it.status = el.value;
    toast(`상태 변경 → ${el.value}`);
  };
  APP.forms.opsIssue = (fd) => {
    const g = (n) => (fd.get(n) || '').toString().trim();
    if (!g('title')) return;
    const it = { id: uid('is'), title: g('title'), kind: g('kind') || '이슈', owner: g('owner') || ORGS[0], next: g('next'), due: g('due') || dayStr(7), status: '접수', opened: S.today, impact: +g('impact') || 2, likely: +g('likely') || 2, decisions: [], log: [{ at: S.today, text: '등록' }] };
    S.issues.push(it);
    ui().issueFilter = 'open';
    log('issue-add', `이슈·분쟁 등록: ${it.title}`, it.id);
    toast('이슈·분쟁을 등록했습니다');
  };
  APP.forms.opsIssueEdit = (fd, form) => {
    const g = (n) => (fd.get(n) || '').toString().trim();
    const it = S.issues.find((x) => x.id === form.dataset.id); if (!it) return;
    const ch = [];
    if (g('next') && g('next') !== it.next) ch.push(`다음 조치: ${g('next')}`);
    if (g('due') && g('due') !== it.due) ch.push(`기한 ${md(it.due)} → ${md(g('due'))}`);
    if (g('owner') && g('owner') !== it.owner) ch.push(`담당 ${it.owner} → ${g('owner')}`);
    if (+g('impact') && +g('impact') !== it.impact) ch.push(`영향 ${LV[it.impact]} → ${LV[+g('impact')]}`);
    if (+g('likely') && +g('likely') !== it.likely) ch.push(`가능성 ${LV[it.likely]} → ${LV[+g('likely')]}`);
    Object.assign(it, { next: g('next') || it.next, due: g('due') || it.due, owner: g('owner') || it.owner, impact: +g('impact') || it.impact, likely: +g('likely') || it.likely });
    if (ch.length) log('issue-edit', `${it.title}: ${ch.join(' · ')}`, it.id);
    if (ch.length) it.log.push({ at: S.today, text: ch.join(' · ') });
    ui().editIssue = null;
    toast('저장했습니다');
  };
})();
