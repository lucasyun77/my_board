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
  });

  const ui = () => (S.ui.ops = S.ui.ops || { issueFilter: 'open', editIssue: null, sigFilter: 'all' });

  /* ---------- 계산 ---------- */
  const sigOf = (d) => (!d.registered || d.delayed >= 3 ? 'r' : d.delayed ? 'y' : 'g');
  const SIG_TXT = { g: '양호', y: '주의', r: '위험' };
  const dueTxt = (due) => {
    const n = days(S.today, due);
    if (n < 0) return `<span class="ops-due over">D+${-n}</span>`;
    if (n === 0) return '<span class="ops-due over">오늘</span>';
    return `<span class="ops-due ${n <= 3 ? 'near' : ''}">D-${n}</span>`;
  };
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
    return `<section class="panel" aria-labelledby="h-ops-sig">
      <h3 id="h-ops-sig">부서 신호등 ${badge('미확인')}
        <span class="seg ops-seg">${[['all', '전체'], ['warn', '주의·위험만']].map(([k, l]) => `<button type="button" data-act="opsSigFilter" data-v="${k}" aria-pressed="${f === k}">${l}</button>`).join('')}</span></h3>
      <div class="ops-sigsum">${['r', 'y', 'g'].map((c) => `<span><span class="sig ${c}"></span>${SIG_TXT[c]} <b class="num">${cnt[c]}</b></span>`).join('')}</div>
      <ul class="ops-list">${list.map((d) => {
        const c = sigOf(d); const tasks = S.opsDeptTasks[d.name] || [];
        const why = !d.registered ? '수훈보드 현황판 미등록' : d.delayed ? `지연 과제 ${d.delayed}건` : '지연 없음';
        return `<li class="ops-dept ${c}">
          <div class="ops-dept-head"><span class="ops-light ${c}">${SIG_TXT[c]}</span><b>${esc(d.name)}</b>
            <span class="ops-meta">${d.registered ? '현황판 등록' : '<span class="ops-bad">현황판 미등록</span>'} · 지연 <b class="num">${d.delayed}</b>건</span></div>
          ${tasks.length ? `<details><summary>${esc(why)} — 과제 보기</summary><ul class="ops-sub">${tasks.slice(0, d.delayed || tasks.length).map((t) => `<li>${esc(t)}</li>`).join('')}</ul></details>` : `<div class="ops-meta">${esc(why)}</div>`}
        </li>`;
      }).join('') || '<li class="ops-empty">주의·위험 부서가 없습니다.</li>'}</ul>
      <p class="ops-note">기준: 미등록 또는 지연 3건 이상 = 위험, 지연 1~2건 = 주의. 수훈보드 연동 방법 확인 전이라 샘플값입니다.</p>
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
      <label class="f">담당<select name="owner">${ORGS.map((o) => `<option ${o === v.owner ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></label>
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
        return `<li class="ops-issue ${closed ? 'closed' : ''}">
          <div class="ops-issue-top"><span class="pill ${it.kind === '분쟁' ? 'p-urgent' : 'p-high'}">${esc(it.kind)}</span><span class="ops-title">${esc(it.title)}</span>${closed ? '' : dueTxt(it.due)}</div>
          <div class="ops-issue-next"><span class="muted">다음 조치</span> ${esc(it.next)}</div>
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

  /* ---------- 화면 ---------- */
  function viewOps() {
    const wl = S.waiting;
    const maxWait = wl.length ? Math.max(...wl.map((w) => days(w.since, S.today))) : 0;
    const red = S.depts.filter((d) => sigOf(d) === 'r').length;
    const openIss = S.issues.filter((i) => i.status !== '종결');
    const overIss = openIss.filter((i) => i.due < S.today).length;
    return `<div class="view-head"><div><h2>경영 현황</h2><p>직원이 회장님을 기다리는 건부터 봅니다.</p></div></div>
      <div class="ops-strip" role="list">
        <button type="button" role="listitem" data-act="opsJump" data-v="h-ops-wait" class="${maxWait >= 5 ? 'alert' : ''}">대기 <b class="num">${wl.length}</b>건${wl.length ? ` · 최장 ${maxWait}일` : ''}</button>
        <button type="button" role="listitem" data-act="opsJump" data-v="h-ops-sig" class="${red ? 'alert' : ''}">위험 부서 <b class="num">${red}</b>곳</button>
        <button type="button" role="listitem" data-act="opsJump" data-v="h-ops-issue" class="${overIss ? 'alert' : ''}">진행 이슈 <b class="num">${openIss.length}</b>건${overIss ? ` · 기한 경과 ${overIss}` : ''}</button>
      </div>
      <div class="grid2 ops-grid">${waitingBlock()}${deptBlock()}</div>
      ${brandBlock()}
      <div class="grid2 ops-grid">${issueBlock()}${calBlock()}</div>`;
  }
  APP.views.ops = viewOps;

  /* ---------- 동작 ---------- */
  APP.acts.opsWaitDone = (el) => {
    const i = S.waiting.findIndex((w) => w.id === el.dataset.id); if (i < 0) return;
    const [w] = S.waiting.splice(i, 1);
    S.waitingDone.push(Object.assign(w, { done_at: S.today }));
    toast('처리 완료로 표시했습니다 (Asana 완료 처리는 목업 표시)');
  };
  APP.acts.opsWaitUndo = (el) => {
    const i = S.waitingDone.findIndex((w) => w.id === el.dataset.id); if (i < 0) return;
    const [w] = S.waitingDone.splice(i, 1); delete w.done_at;
    S.waiting.push(w);
    toast('대기함으로 되돌렸습니다');
  };
  APP.acts.opsJump = (el) => { const id = el.dataset.v; setTimeout(() => { const t = document.getElementById(id); if (t) t.closest('section').scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 0); };
  APP.acts.opsSigFilter = (el) => { ui().sigFilter = el.dataset.v; };
  APP.acts.opsIssueFilter = (el) => { ui().issueFilter = el.dataset.v; };
  APP.acts.opsIssueEdit = (el) => { ui().editIssue = el.dataset.id; };
  APP.acts.opsIssueCancel = () => { ui().editIssue = null; };
  APP.changes.opsIssueStatus = (el) => {
    const it = S.issues.find((x) => x.id === el.dataset.id); if (!it || it.status === el.value) return;
    it.log.push({ at: S.today, text: `상태 ${it.status} → ${el.value}` });
    it.status = el.value;
    toast(`상태 변경 → ${el.value}`);
  };
  APP.forms.opsIssue = (fd) => {
    const g = (n) => (fd.get(n) || '').toString().trim();
    if (!g('title')) return;
    S.issues.push({ id: uid('is'), title: g('title'), kind: g('kind') || '이슈', owner: g('owner'), next: g('next'), due: g('due') || dayStr(7), status: '접수', opened: S.today, log: [{ at: S.today, text: '등록' }] });
    ui().issueFilter = 'open';
    toast('이슈·분쟁을 등록했습니다');
  };
  APP.forms.opsIssueEdit = (fd, form) => {
    const g = (n) => (fd.get(n) || '').toString().trim();
    const it = S.issues.find((x) => x.id === form.dataset.id); if (!it) return;
    const ch = [];
    if (g('next') && g('next') !== it.next) ch.push(`다음 조치: ${g('next')}`);
    if (g('due') && g('due') !== it.due) ch.push(`기한 ${md(it.due)} → ${md(g('due'))}`);
    if (g('owner') && g('owner') !== it.owner) ch.push(`담당 ${it.owner} → ${g('owner')}`);
    Object.assign(it, { next: g('next') || it.next, due: g('due') || it.due, owner: g('owner') || it.owner });
    if (ch.length) it.log.push({ at: S.today, text: ch.join(' · ') });
    ui().editIssue = null;
    toast('저장했습니다');
  };
})();
