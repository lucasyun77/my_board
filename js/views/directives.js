/* 메뉴: 지시 관리 (directives) — 이 메뉴 담당 하위 세션은 이 파일만 고칩니다.
   공용 도구·상태는 window.APP에서 꺼내 씁니다. 새 버튼 동작은 APP.acts['이름'] = (el) => {...},
   새 폼은 APP.forms['이름'] = (fd, form) => {...}, 새 select 변경은 APP.changes['이름'] = (el) => {...} 로 등록합니다.
   태그 필터·저장된 보기·태그 저장/삭제 확인 이벤트(fTag, fMode, fField, fReset, saveView, loadView, delView,
   askDelTag, delTag, cancelDelTag, cancelEditTag, dirStatus, form 'tag'·'view')는 js/app.js 것을 그대로 씁니다. */
(function () {
  'use strict';
  const { S, STATUSES, $, esc, days, md, badge, tagById, chip, uid, toast, isOpen, isOverdue, isStale, dayStr, currentFilter, applyFilter, prioPill, statPill, statusSelect } = window.APP;
  const PRIOS = ['긴급', '높음', '보통'];
  const PRIO_RANK = { '긴급': 0, '높음': 1, '보통': 2 };

  /* ---------- 추가 샘플 데이터 (data.js는 건드리지 않음) ---------- */
  if (!S.dirExtraAdded) {
    const D = dayStr;
    S.directives.push(
      { id: 'd9', title: '블랙라벨 매장 위생 점검표 디지털화', body: '종이 점검표를 태블릿 체크리스트로 바꾸고 사진 증빙을 남긴다', org: '블랙라벨사업부', assignee: '담당 I', issued_at: D(-8), due_at: D(2), priority: '높음', status: '진행', tags: ['t1', 't4'], source_url: '#', result_url: '', memo: '', updated_at: D(-4), asana_gid: 'mock-1009' },
      { id: 'd10', title: '벌툰 신규 가맹 상담 스크립트 개정', body: '상담 단계별 질문·답변 표준안', org: '벌툰사업부', assignee: '담당 J', issued_at: D(-5), due_at: D(6), priority: '보통', status: '보고대기', tags: ['t3'], source_url: '#', result_url: '#', memo: '초안 제출, 회장 검토 대기', updated_at: D(-3), asana_gid: 'mock-1010' },
      { id: 'd11', title: '생전포차 해외 상표 출원 현황 점검', body: '진출 후보국 상표 출원·등록 상태 확인', org: '생전포차사업부', assignee: '담당 K', issued_at: D(-14), due_at: D(-1), priority: '긴급', status: '진행', tags: ['t6', 't4'], source_url: '#', result_url: '', memo: '2개국 회신 대기', updated_at: D(-2), asana_gid: 'mock-1011' },
      { id: 'd12', title: '결재 라인 간소화안', body: '3단계 이상 결재를 2단계로 줄이는 안', org: '경영지원본부', assignee: '담당 L', issued_at: D(-18), due_at: D(-4), priority: '보통', status: '완료', tags: ['t2'], source_url: '#', result_url: '#', memo: '', updated_at: D(-5), asana_gid: 'mock-1012' }
    );
    if (!S.savedViews.some((v) => v.id === 'v2')) S.savedViews.push({ id: 'v2', name: '긴급·기한 경과', filter: { tags: [], mode: 'OR', status: 'open', org: '', due: 'overdue', prio: '', q: '' } });
    S.dirExtraAdded = true;
  }

  /* ---------- Asana 동기화(목업) ---------- */
  const SIG_KEYS = ['title', 'body', 'org', 'assignee', 'issued_at', 'due_at', 'priority', 'status', 'tags', 'source_url', 'result_url', 'memo'];
  const sig = (d) => JSON.stringify(SIG_KEYS.map((k) => d[k]));
  const isPending = (d) => d.synced_sig !== sig(d);
  const hourFloor = () => { const n = new Date(); n.setMinutes(0, 0, 0); return n.toISOString(); };
  const hm = (iso) => { const x = new Date(iso); return String(x.getHours()).padStart(2, '0') + ':' + String(x.getMinutes()).padStart(2, '0'); };
  const addLog = (d, text) => { d.log = d.log || []; d.log.unshift({ at: S.today, text }); d.log = d.log.slice(0, 12); };

  function runSync(auto) {
    const pend = S.directives.filter(isPending);
    pend.forEach((d) => { d.synced_sig = sig(d); addLog(d, 'Asana로 변경 보냄'); });
    S.dirSync.last = auto ? hourFloor() : new Date().toISOString();
    S.dirSync.log.unshift({ at: S.dirSync.last, sent: pend.length, recv: 0, auto: !!auto });
    S.dirSync.log = S.dirSync.log.slice(0, 5);
    return pend.length;
  }

  /* 화면을 그리기 전에 빈 필드 보정·상태 변경 이력·정시 자동 동기화 */
  function normalize() {
    S.dirSync = S.dirSync || { last: hourFloor(), log: [] };
    let gidN = 1000 + S.directives.length;
    S.directives.forEach((d) => {
      d.tags = d.tags || []; d.memo = d.memo || ''; d.body = d.body || ''; d.result_url = d.result_url || '';
      if (!d.asana_gid) d.asana_gid = 'mock-' + (++gidN);
      if (!d.log) d.log = [{ at: d.issued_at, text: '지시 등록 · Asana "회장 지시" 태스크 생성' }];
      if (d.synced_sig == null) d.synced_sig = sig(d);
      if (d._st && d._st !== d.status) addLog(d, `상태 ${d._st} → ${d.status}`);
      d._st = d.status;
    });
    if (Date.now() - new Date(S.dirSync.last).getTime() >= 3600000) runSync(true);
  }

  /* ---------- 도구 ---------- */
  const safeUrl = (u) => (/^https?:\/\//i.test(u || '') ? u : '');
  const linkOut = (u, label) => (safeUrl(u) ? `<a href="${esc(u)}" target="_blank" rel="noopener">${label}</a>` : u === '#' ? `<span class="muted">${label}(샘플)</span>` : '<span class="muted">없음</span>');
  const dLabel = (d) => { const n = days(S.today, d.due_at); return n < 0 ? `D+${-n}` : n === 0 ? 'D-day' : `D-${n}`; };
  const dueCls = (d) => (isOverdue(d) ? 'is-over' : isOpen(d) && d.due_at <= dayStr(3) ? 'is-soon' : '');
  const quiet = (d) => days(d.updated_at, S.today);
  const titleBtn = (d) => `<button type="button" class="dir-title" data-act="dirOpen" data-id="${d.id}">${esc(d.title)}</button>`;
  const alerts = (d) => [isOverdue(d) ? `<span class="dir-flag crit">기한 ${dLabel(d)}</span>` : '', isStale(d) ? `<span class="dir-flag warn">${quiet(d)}일 무응답</span>` : ''].join('');
  const fullFilter = () => Object.assign({ tags: [], mode: 'OR', status: 'all', org: '', due: '', prio: '', q: '' }, currentFilter());

  function filtered(f) {
    let list = applyFilter(S.directives, f);
    if (f.due === 'today') list = list.filter((d) => isOpen(d) && d.due_at === S.today);
    if (f.due === 'd3') list = list.filter((d) => isOpen(d) && d.due_at >= S.today && d.due_at <= dayStr(3));
    if (f.due === 'stale') list = list.filter(isStale);
    if (f.due === 'alert') list = list.filter((d) => isOverdue(d) || isStale(d));
    if (f.prio) list = list.filter((d) => d.priority === f.prio);
    if (f.q) { const q = f.q.toLowerCase(); list = list.filter((d) => [d.title, d.body, d.memo, d.assignee, d.org].join(' ').toLowerCase().includes(q)); }
    return list.sort((a, b) => (isOpen(b) - isOpen(a)) || a.due_at.localeCompare(b.due_at) || PRIO_RANK[a.priority] - PRIO_RANK[b.priority]);
  }
  function filterSummary(f) {
    const p = [];
    if (f.tags.length) p.push('태그 ' + f.tags.map((t) => (tagById(t) || {}).name).filter(Boolean).join(f.mode === 'AND' ? ' 그리고 ' : ' 또는 '));
    if (f.status !== 'all') p.push(f.status === 'open' ? '미완료' : '상태 ' + f.status);
    if (f.org) p.push(f.org);
    if (f.due) p.push({ overdue: '기한 경과', week: '7일 이내', today: '오늘 기한', d3: '3일 이내', stale: '3일 무응답', alert: '경보 전체' }[f.due]);
    if (f.prio) p.push('우선 ' + f.prio);
    if (f.q) p.push(`"${f.q}" 포함`);
    return p;
  }
  const sameFilter = (a, b) => { const n = (x) => JSON.stringify(Object.assign({ tags: [], mode: 'OR', status: 'all', org: '', due: '', prio: '', q: '' }, x, { tags: (x.tags || []).slice().sort() })); return n(a) === n(b); };

  /* ---------- 보기: 목록 / 칸반 / 타임라인 ---------- */
  function listView(list) {
    if (!list.length) return emptyMsg();
    return `<div class="tbl-wrap"><table class="dir-tbl"><thead><tr><th>지시 내용</th><th>담당</th><th>지시일</th><th>기한</th><th>우선</th><th>상태</th><th>태그</th><th>Asana</th></tr></thead><tbody>
      ${list.map((d) => `<tr class="${isOverdue(d) ? 'overdue' : ''}">
        <td data-label="지시">${titleBtn(d)}<div class="row dir-flags">${alerts(d)}</div>${d.memo ? `<div class="small muted dir-memo">메모 · ${esc(d.memo)}</div>` : ''}</td>
        <td data-label="담당">${esc(d.org)}<div class="small muted">${esc(d.assignee)}</div></td>
        <td data-label="지시일" class="num">${md(d.issued_at)}</td>
        <td data-label="기한" class="num ${dueCls(d)}">${md(d.due_at)}${isOpen(d) ? `<div class="small">${dLabel(d)}</div>` : ''}</td>
        <td data-label="우선">${prioPill(d.priority)}</td>
        <td data-label="상태">${statusSelect(d)}</td>
        <td data-label="태그"><div class="row">${d.tags.map(chip).join('') || '<span class="small muted">-</span>'}</div></td>
        <td data-label="Asana" class="small">${syncCell(d)}</td></tr>`).join('')}
      </tbody></table></div>`;
  }
  const syncCell = (d) => (isPending(d) ? '<span class="dir-sync pend">보낼 변경</span>' : '<span class="dir-sync ok">동기화됨</span>');

  function kanbanView(list) {
    return `<div class="kanban dir-kanban">${STATUSES.map((s) => { const c = list.filter((d) => d.status === s); return `<div class="col"><header><span>${s}</span><span class="num muted">${c.length}</span></header>
      ${c.map((d) => `<div class="card ${isOverdue(d) ? 'overdue' : ''}">${titleBtn(d)}<div class="small muted">${esc(d.org)} · ${esc(d.assignee)}</div>
        <div class="row small"><span class="num ${dueCls(d)}">기한 ${md(d.due_at)}${isOpen(d) ? ' · ' + dLabel(d) : ''}</span></div>
        <div class="row">${prioPill(d.priority)}${alerts(d)}</div>${d.tags.length ? `<div class="row">${d.tags.map(chip).join('')}</div>` : ''}${statusSelect(d)}</div>`).join('') || '<div class="small muted dir-empty-col">없음</div>'}</div>`; }).join('')}</div>`;
  }

  function timelineView(list) {
    const open = list.filter(isOpen);
    const closedN = list.length - open.length;
    const groups = [
      ['기한 경과', (d) => d.due_at < S.today, 'crit'],
      ['오늘', (d) => d.due_at === S.today, 'today'],
      ['3일 이내', (d) => d.due_at > S.today && d.due_at <= dayStr(3), ''],
      ['7일 이내', (d) => d.due_at > dayStr(3) && d.due_at <= dayStr(7), ''],
      ['그 이후', (d) => d.due_at > dayStr(7), '']
    ];
    if (!open.length) return emptyMsg('기한이 남은 미완료 지시가 없습니다.');
    return `<div class="dir-tl">${groups.map(([name, fn, cls]) => { const g = open.filter(fn); if (!g.length) return ''; return `<div class="dir-tl-group ${cls}"><div class="dir-tl-head"><span>${name}</span><span class="num muted">${g.length}건</span></div>
      ${g.map((d) => `<div class="dir-tl-row"><div class="dir-tl-date num ${dueCls(d)}"><b>${md(d.due_at)}</b><span>${dLabel(d)}</span></div>
        <div class="dir-tl-body">${titleBtn(d)}<div class="row small"><span class="muted">${esc(d.org)} · ${esc(d.assignee)}</span>${prioPill(d.priority)}${statPill(d.status)}${isStale(d) ? `<span class="dir-flag warn">${quiet(d)}일 무응답</span>` : ''}</div></div></div>`).join('')}</div>`; }).join('')}
      ${closedN ? `<p class="small muted" style="margin:4px 0 0">완료·보류 ${closedN}건은 타임라인에서 뺐습니다.</p>` : ''}</div>`;
  }
  const emptyMsg = (t) => `<div class="panel dir-empty"><p>${t || '조건에 맞는 지시가 없습니다.'}</p><button type="button" class="btn sm" data-act="fReset">필터 초기화</button></div>`;

  /* ---------- 조직별 이행률 ---------- */
  function orgPanel() {
    const rows = MOCK.ORGS.map((o) => {
      const all = S.directives.filter((d) => d.org === o);
      const target = all.filter((d) => d.status !== '보류');
      const done = target.filter((d) => d.status === '완료').length;
      return { o, n: target.length, done, over: all.filter(isOverdue).length, stale: all.filter((d) => isStale(d) && !isOverdue(d)).length, pct: target.length ? Math.round(100 * done / target.length) : 0 };
    }).filter((r) => r.n).sort((a, b) => b.over - a.over || a.pct - b.pct);
    const tot = S.directives.filter((d) => d.status !== '보류'); const totPct = tot.length ? Math.round(100 * tot.filter((d) => d.status === '완료').length / tot.length) : 0;
    return `<section class="panel" aria-labelledby="h-org"><div class="row" style="justify-content:space-between"><h3 id="h-org">조직별 이행률 ${badge('측정')}</h3><span class="small muted">전체 <b class="num">${totPct}%</b> · 완료 ÷ (전체 − 보류)</span></div>
      <div class="dir-org">${rows.map((r) => `<button type="button" class="dir-org-row" data-act="dirOrg" data-v="${esc(r.o)}" title="${esc(r.o)} 지시만 보기">
        <span class="o">${esc(r.o)}</span><span class="bar"><i style="width:${r.pct}%"></i></span><span class="num p">${r.pct}%</span>
        <span class="small muted m">완료 ${r.done}/${r.n}${r.over ? ` · <span class="crit">기한 경과 ${r.over}</span>` : ''}${r.stale ? ` · <span class="warn">무응답 ${r.stale}</span>` : ''}</span></button>`).join('')}</div></section>`;
  }

  /* ---------- 등록 폼 ---------- */
  const tagChecks = (sel) => S.tags.slice().sort((a, b) => a.sort - b.sort).map((t) => `<label class="chip dir-tagcheck"><input type="checkbox" name="tags" value="${t.id}" ${sel.includes(t.id) ? 'checked' : ''}><span class="dot" style="background:${esc(t.color)}"></span>${esc(t.name)}</label>`).join('');
  function fieldsHtml(p, d) {
    d = d || { title: '', body: '', org: MOCK.ORGS[0], assignee: '', issued_at: S.today, due_at: dayStr(7), priority: '보통', status: '지시', tags: [], source_url: '', result_url: '', memo: '' };
    return `<label class="f wide">지시 내용<input type="text" id="${p}-title" name="title" required value="${esc(d.title)}" placeholder="예: 가맹점 고정비 절감안 보고"></label>
      <label class="f wide">상세 설명<textarea id="${p}-body" name="body" rows="2" placeholder="배경·기대 결과">${esc(d.body)}</textarea></label>
      <label class="f">담당 조직<select id="${p}-org" name="org">${MOCK.ORGS.map((o) => `<option ${o === d.org ? 'selected' : ''}>${o}</option>`).join('')}</select></label>
      <label class="f">담당자<input type="text" id="${p}-assignee" name="assignee" value="${esc(d.assignee === '미지정' ? '' : d.assignee)}" placeholder="이름"></label>
      <label class="f">지시일<input type="date" id="${p}-issued" name="issued_at" value="${esc(d.issued_at)}"></label>
      <label class="f">기한<input type="date" id="${p}-due" name="due_at" value="${esc(d.due_at)}" required></label>
      <label class="f">우선순위<select id="${p}-prio" name="priority">${PRIOS.map((x) => `<option ${x === d.priority ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
      ${p === 'de' ? `<label class="f">상태<select id="${p}-status" name="status">${STATUSES.map((x) => `<option ${x === d.status ? 'selected' : ''}>${x}</option>`).join('')}</select></label>` : ''}
      <fieldset class="wide dir-fs"><legend class="small muted">태그(여러 개 선택)</legend><div class="row">${tagChecks(d.tags)}</div></fieldset>
      <label class="f wide">원문 링크<input type="url" id="${p}-src" name="source_url" value="${esc(safeUrl(d.source_url))}" placeholder="https:// (슬랙·메일 원문)"></label>
      ${p === 'de' ? `<label class="f wide">결과물 링크<input type="url" id="${p}-res" name="result_url" value="${esc(safeUrl(d.result_url))}" placeholder="https://"></label>` : ''}
      <label class="f wide">메모<textarea id="${p}-memo" name="memo" rows="2">${esc(d.memo)}</textarea></label>`;
  }
  function newPanel() {
    if (!S.ui.dirNew) return '';
    return `<section class="panel dir-new" aria-labelledby="h-dnew"><div class="row" style="justify-content:space-between"><h3 id="h-dnew">지시 등록</h3><button type="button" class="btn sm" data-act="dirNewToggle">닫기</button></div>
      <form class="form" data-form="dirNew">${fieldsHtml('dn')}
        <p class="small muted wide" style="margin:0">등록하면 Asana "회장 지시" 프로젝트에 태스크가 함께 만들어집니다(목업: 화면 표시만).</p>
        <div class="row wide"><button class="btn primary">등록 + Asana 태스크 생성</button><button type="button" class="btn sm" data-act="dirNewToggle">취소</button></div></form></section>`;
  }

  /* ---------- 상세 보기·편집 ---------- */
  function detailDialog() {
    const d = S.ui.dirOpen && S.directives.find((x) => x.id === S.ui.dirOpen);
    document.body.classList.toggle('dir-lock', !!d);
    if (!d) return '';
    const edit = S.ui.dirEdit;
    const row = (k, v) => `<div class="dir-kv"><span class="k">${k}</span><span class="v">${v}</span></div>`;
    return `<div class="dir-dlg-back"><div class="dir-dlg" role="dialog" aria-modal="true" aria-labelledby="dlg-title" id="dir-dlg" tabindex="-1">
      <div class="dir-dlg-head"><div style="min-width:0"><div class="row small">${prioPill(d.priority)}${statPill(d.status)}${alerts(d)}</div><h3 id="dlg-title">${esc(d.title)}</h3></div>
        <button type="button" class="btn sm" data-act="dirClose" aria-label="닫기">닫기 ✕</button></div>
      ${edit ? `<form class="form" data-form="dirEdit" data-id="${d.id}">${fieldsHtml('de', d)}<div class="row wide"><button class="btn primary">저장</button><button type="button" class="btn sm" data-act="dirEditToggle">취소</button></div></form>` : `
      ${d.body ? `<p class="dir-body">${esc(d.body)}</p>` : ''}
      <div class="dir-kvs">
        ${row('담당', `${esc(d.org)} · ${esc(d.assignee)}`)}
        ${row('지시일', `<span class="num">${d.issued_at}</span>`)}
        ${row('기한', `<span class="num ${dueCls(d)}">${d.due_at}${isOpen(d) ? ' · ' + dLabel(d) : ''}</span>`)}
        ${row('상태', statusSelect(d))}
        ${row('마지막 갱신', `<span class="num">${d.updated_at}</span> <span class="small muted">(${quiet(d)}일 전)</span>`)}
        ${row('태그', `<span class="row">${d.tags.map(chip).join('') || '<span class="muted">없음</span>'}</span>`)}
        ${row('원문', linkOut(d.source_url, '원문 열기'))}
        ${row('결과물', linkOut(d.result_url, '결과물 열기'))}
        ${row('Asana', `<span class="small">태스크 ${esc(d.asana_gid)} · ${syncCell(d)}</span>`)}
      </div>
      <form class="form dir-quick" data-form="dirMemo" data-id="${d.id}">
        <label class="f wide">메모<textarea id="dm-memo" name="memo" rows="3" placeholder="진행 상황·다음 확인 사항">${esc(d.memo)}</textarea></label>
        <label class="f wide">결과물 링크<input type="url" id="dm-res" name="result_url" value="${esc(safeUrl(d.result_url))}" placeholder="https://"></label>
        <div class="row wide"><button class="btn primary sm">메모·결과물 저장</button>
          <button type="button" class="btn sm" data-act="dirEditToggle">전체 편집</button>
          ${isOpen(d) && (isStale(d) || isOverdue(d)) ? `<button type="button" class="btn sm" data-act="dirNudge" data-id="${d.id}">담당자에게 확인 요청</button>` : ''}</div>
      </form>
      <div class="dir-log"><div class="small muted" style="font-weight:700">이력</div><ul>${(d.log || []).map((l) => `<li><span class="num muted">${md(l.at)}</span> ${esc(l.text)}</li>`).join('')}</ul></div>`}
    </div></div>`;
  }

  /* ---------- 태그 관리 ---------- */
  function viewTags() {
    const ed = S.ui.editTag ? tagById(S.ui.editTag) : null;
    const del = S.ui.delTag ? tagById(S.ui.delTag) : null;
    const sorted = S.tags.slice().sort((a, b) => a.sort - b.sort);
    return `<section class="panel" aria-labelledby="h-tags"><h3 id="h-tags">태그 관리 <span class="small muted" style="font-family:var(--sans);font-weight:400">지시·신사업 공용 · ${S.tags.length}개</span></h3>
      ${del ? `<div class="explain dir-delbox" role="alert">"${esc(del.name)}" 태그를 삭제하면 지시 ${S.directives.filter((d) => d.tags.includes(del.id)).length}건, 신사업 ${S.ideas.filter((i) => i.tags.includes(del.id)).length}건에서 연결이 해제됩니다. 지시·신사업 자체는 남습니다.<div class="row" style="margin-top:8px"><button type="button" class="btn primary sm" data-act="delTag" data-id="${del.id}">연결 해제하고 삭제</button><button type="button" class="btn sm" data-act="cancelDelTag">취소</button></div></div>` : ''}
      <div class="tbl-wrap"><table class="dir-tbl dir-tagtbl"><thead><tr><th>순서</th><th>태그</th><th>설명</th><th class="r">지시</th><th class="r">신사업</th><th>관리</th></tr></thead><tbody>
      ${sorted.map((t, i) => `<tr class="${ed && ed.id === t.id ? 'dir-editing' : ''}"><td data-label="순서" class="num">${i + 1}</td><td data-label="태그">${chip(t.id)}</td><td data-label="설명" class="muted">${esc(t.description) || '-'}</td>
        <td data-label="지시" class="num r">${S.directives.filter((d) => d.tags.includes(t.id)).length}</td><td data-label="신사업" class="num r">${S.ideas.filter((x) => x.tags.includes(t.id)).length}</td>
        <td data-label="관리"><div class="row dir-tagbtns"><button type="button" class="btn sm" data-act="tagMove" data-id="${t.id}" data-v="-1" aria-label="${esc(t.name)} 위로" ${i === 0 ? 'disabled' : ''}>↑</button><button type="button" class="btn sm" data-act="tagMove" data-id="${t.id}" data-v="1" aria-label="${esc(t.name)} 아래로" ${i === sorted.length - 1 ? 'disabled' : ''}>↓</button><button type="button" class="btn sm" data-act="tagEdit" data-id="${t.id}">수정</button><button type="button" class="btn sm" data-act="askDelTag" data-id="${t.id}">삭제</button></div></td></tr>`).join('')}
      </tbody></table></div>
      <form class="form dir-tagform" data-form="tag" id="dir-tagform">
        <label class="f">${ed ? `"${esc(ed.name)}" 이름` : '새 태그 이름'}<input type="text" id="tg-name" name="name" required maxlength="20" value="${esc(ed ? ed.name : '')}"></label>
        <label class="f">색상<span class="dir-color"><input type="color" id="tg-color" name="color" value="${esc(ed ? ed.color : '#F29801')}" aria-label="태그 색상"><span class="small muted">눌러서 고르기</span></span></label>
        <label class="f">설명<input type="text" id="tg-desc" name="description" value="${esc(ed ? ed.description : '')}" placeholder="어떤 지시에 붙이는지"></label>
        <div class="row"><button class="btn primary sm">${ed ? '수정 저장' : '+ 태그 추가'}</button>${ed ? '<button type="button" class="btn sm" data-act="cancelEditTag">취소</button>' : ''}</div>
      </form></section>`;
  }

  /* ---------- 메인 화면 ---------- */
  function viewDirectives() {
    normalize();
    const f = fullFilter();
    const list = filtered(f);
    const mode = S.ui.dirView || '목록';
    const open = S.directives.filter(isOpen);
    const over = S.directives.filter(isOverdue), stale = S.directives.filter(isStale);
    const wait = S.directives.filter((d) => d.status === '보고대기');
    const pend = S.directives.filter(isPending).length;
    const sumParts = filterSummary(f);
    const sorted = S.tags.slice().sort((a, b) => a.sort - b.sort);
    const stat = (v, label, n, cls, on) => `<button type="button" class="dir-stat ${cls} ${on ? 'on' : ''}" data-act="dirQuick" data-v="${v}" aria-pressed="${on}"><span class="l">${label} ${badge('측정')}</span><span class="n num">${n}<small>건</small></span></button>`;
    const syncLast = S.dirSync.log[0];
    const nextAt = new Date(new Date(S.dirSync.last).getTime() + 3600000).toISOString();
    const body = mode === '칸반' ? kanbanView(list) : mode === '타임라인' ? timelineView(list) : listView(list);

    return `
      <div class="view-head"><div><h2>지시 관리</h2><p>회장 지시를 등록·추적합니다. 기한 경과와 3일 무응답은 경보로 띄웁니다.</p></div>
        <button type="button" class="btn primary" data-act="dirNewToggle" aria-expanded="${!!S.ui.dirNew}">+ 지시 등록</button></div>

      <div class="dir-syncbar" role="status"><span class="dir-asana" aria-hidden="true"></span>
        <span><b>Asana "회장 지시"</b> 양방향 동기화 · 1시간마다</span>
        <span class="small muted">마지막 ${hm(S.dirSync.last)}${syncLast ? ` (보냄 ${syncLast.sent} · 받음 ${syncLast.recv})` : ''} · 다음 ${hm(nextAt)}</span>
        ${pend ? `<span class="dir-sync pend">보낼 변경 ${pend}건</span>` : '<span class="dir-sync ok">모두 맞춰짐</span>'}
        <button type="button" class="btn sm" data-act="dirSync">지금 동기화</button>
        <span class="small muted dir-mock">목업: 실제 Asana 연결 없음</span></div>

      ${newPanel()}

      <div class="dir-stats" role="group" aria-label="경보·현황 (누르면 필터)">
        ${stat('overdue', '기한 경과', over.length, 'crit', f.due === 'overdue')}
        ${stat('stale', '3일 무응답', stale.length, 'warn', f.due === 'stale')}
        ${stat('wait', '보고대기', wait.length, 'info', f.status === '보고대기')}
        ${stat('open', '미완료', open.length, '', f.status === 'open' && !f.due)}
      </div>

      <section class="panel dir-filter" aria-labelledby="h-filter">
        <div class="row" style="justify-content:space-between"><h3 id="h-filter">필터</h3>
          <div class="seg" role="group" aria-label="태그 조건">${['OR', 'AND'].map((m) => `<button type="button" data-act="fMode" data-v="${m}" aria-pressed="${f.mode === m}">${m === 'OR' ? '하나라도(OR)' : '모두(AND)'}</button>`).join('')}</div></div>
        <div class="row dir-tagrow" role="group" aria-label="태그 선택">${sorted.map((t) => { const on = f.tags.includes(t.id); return `<button type="button" class="chip dir-ftag ${on ? 'on' : ''}" data-act="fTag" data-id="${t.id}" aria-pressed="${on}" style="${on ? `border-color:${esc(t.color)};box-shadow:inset 0 0 0 1px ${esc(t.color)}` : ''}"><span class="dot" style="background:${esc(t.color)}"></span>${esc(t.name)}<span class="num muted">${S.directives.filter((d) => d.tags.includes(t.id)).length}</span></button>`; }).join('')}</div>
        <div class="form dir-fform">
          <label class="f">검색<input type="text" id="f-q" data-act="fField" data-k="q" value="${esc(f.q)}" placeholder="내용·담당자·메모"></label>
          <label class="f">상태<select id="f-status" data-act="fField" data-k="status"><option value="all">전체</option><option value="open" ${f.status === 'open' ? 'selected' : ''}>미완료 전체</option>${STATUSES.map((s) => `<option ${f.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
          <label class="f">조직<select id="f-org" data-act="fField" data-k="org"><option value="">전체</option>${MOCK.ORGS.map((o) => `<option ${f.org === o ? 'selected' : ''}>${o}</option>`).join('')}</select></label>
          <label class="f">기한<select id="f-due" data-act="fField" data-k="due"><option value="">전체</option>${[['alert', '경보 전체(경과·무응답)'], ['overdue', '기한 경과'], ['stale', '3일 무응답'], ['today', '오늘 기한'], ['d3', '3일 이내'], ['week', '7일 이내']].map(([v, l]) => `<option value="${v}" ${f.due === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          <label class="f">우선순위<select id="f-prio" data-act="fField" data-k="prio"><option value="">전체</option>${PRIOS.map((p) => `<option ${f.prio === p ? 'selected' : ''}>${p}</option>`).join('')}</select></label>
        </div>
        <div class="dir-saved"><span class="small muted">저장된 보기</span>
          ${S.savedViews.map((v) => `<span class="dir-sv ${sameFilter(v.filter, f) ? 'on' : ''}"><button type="button" data-act="loadView" data-id="${v.id}" aria-pressed="${sameFilter(v.filter, f)}">${esc(v.name)}</button><button type="button" data-act="delView" data-id="${v.id}" aria-label="${esc(v.name)} 보기 삭제" title="삭제">×</button></span>`).join('') || '<span class="small muted">없음</span>'}
          <button type="button" class="btn sm" data-act="saveView" ${sumParts.length ? '' : 'disabled title="조건을 하나 이상 고르면 저장할 수 있습니다"'}>+ 현재 조건 저장</button>
        </div>
        <div id="saveViewBox"></div>
      </section>

      <div class="dir-resbar"><p class="small" style="margin:0"><b class="num">${list.length}</b>건 / 전체 ${S.directives.length}건${sumParts.length ? ` · <span class="muted">${esc(sumParts.join(' · '))}</span> <button type="button" class="dir-link" data-act="fReset">조건 지우기</button>` : ''}</p>
        <div class="seg" role="group" aria-label="보기 방식">${['목록', '칸반', '타임라인'].map((m) => `<button type="button" data-act="dirView" data-v="${m}" aria-pressed="${m === mode}">${m}</button>`).join('')}</div></div>
      ${body}
      ${orgPanel()}
      ${viewTags()}
      ${detailDialog()}`;
  }

  /* ---------- 동작 ---------- */
  const find = (id) => S.directives.find((x) => x.id === id);
  const focusLater = (sel) => setTimeout(() => { const el = document.querySelector(sel); if (el) el.focus(); }, 0);
  const setF = (patch) => { S.ui.filter = Object.assign({}, fullFilter(), patch); };

  APP.acts.dirNewToggle = () => { S.ui.dirNew = !S.ui.dirNew; if (S.ui.dirNew) focusLater('#dn-title'); };
  APP.acts.dirOpen = (el) => { S.ui.dirOpen = el.dataset.id; S.ui.dirEdit = false; S.ui.dirReturn = el.dataset.id; focusLater('#dir-dlg'); };
  APP.acts.dirClose = () => {
    S.ui.dirOpen = null; S.ui.dirEdit = false;
    if (S.ui.dirReturn) focusLater(`[data-act="dirOpen"][data-id="${S.ui.dirReturn}"]`);
  };
  APP.acts.dirEditToggle = () => { S.ui.dirEdit = !S.ui.dirEdit; focusLater(S.ui.dirEdit ? '#de-title' : '#dir-dlg'); };
  APP.acts.dirSync = () => { const n = runSync(false); toast(n ? `Asana로 ${n}건 보내고 0건 받았습니다(목업)` : 'Asana와 이미 맞춰져 있습니다(목업)'); };
  APP.acts.dirNudge = (el) => { const d = find(el.dataset.id); addLog(d, '담당자에게 확인 요청(Asana 댓글·목업)'); toast(`${d.assignee}에게 확인 요청을 보냈습니다(목업)`); };
  APP.acts.dirQuick = (el) => {
    const v = el.dataset.v; const f = fullFilter();
    const patch = { overdue: { due: 'overdue', status: 'all' }, stale: { due: 'stale', status: 'all' }, wait: { status: '보고대기', due: '' }, open: { status: 'open', due: '' } }[v];
    const on = v === 'wait' ? f.status === '보고대기' : v === 'open' ? f.status === 'open' && !f.due : f.due === v;
    setF(on ? { status: 'all', due: '' } : patch);
  };
  APP.acts.dirOrg = (el) => { const f = fullFilter(); setF({ org: f.org === el.dataset.v ? '' : el.dataset.v }); setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 0); };
  APP.acts.tagEdit = (el) => { S.ui.editTag = el.dataset.id; S.ui.delTag = null; focusLater('#tg-name'); setTimeout(() => { const fm = $('#dir-tagform'); if (fm) fm.scrollIntoView({ block: 'center' }); }, 0); };
  APP.acts.tagMove = (el) => {
    const sorted = S.tags.slice().sort((a, b) => a.sort - b.sort);
    const i = sorted.findIndex((t) => t.id === el.dataset.id); const j = i + (+el.dataset.v);
    if (j < 0 || j >= sorted.length) return;
    [sorted[i], sorted[j]] = [sorted[j], sorted[i]];
    sorted.forEach((t, k) => { t.sort = k + 1; });
    focusLater(`[data-act="tagMove"][data-id="${el.dataset.id}"][data-v="${el.dataset.v}"]`);
  };

  const readFields = (fd, g, old) => {
    const keepSample = (n) => g(n) || (old && old[n] === '#' ? '#' : '');
    return { title: g('title'), body: g('body'), org: g('org'), assignee: g('assignee') || '미지정', issued_at: g('issued_at') || S.today, due_at: g('due_at') || dayStr(7), priority: PRIOS.includes(g('priority')) ? g('priority') : '보통', tags: fd.getAll('tags'), source_url: keepSample('source_url'), memo: g('memo') };
  };
  const gOf = (fd) => (n) => (fd.get(n) || '').toString().trim();
  APP.forms.dirNew = (fd) => {
    const g = gOf(fd);
    const n = 1000 + S.directives.length + 1;
    const d = Object.assign({ id: uid('d'), status: '지시', result_url: '', updated_at: S.today, asana_gid: 'mock-' + n }, readFields(fd, g));
    d.log = [{ at: S.today, text: `지시 등록 · Asana "회장 지시" 태스크 ${d.asana_gid} 생성(목업)` }];
    d.synced_sig = sig(d); d._st = d.status;
    S.directives.push(d); S.ui.dirNew = false;
    toast(`등록 완료 · Asana 태스크 ${d.asana_gid} 생성(목업)`);
  };
  APP.forms.dirEdit = (fd, form) => {
    const d = find(form.dataset.id); const g = gOf(fd);
    const before = sig(d);
    Object.assign(d, readFields(fd, g, d), { status: STATUSES.includes(g('status')) ? g('status') : d.status, result_url: g('result_url') || (d.result_url === '#' ? '#' : '') });
    if (sig(d) !== before) { d.updated_at = S.today; if (d._st === d.status) addLog(d, '내용 수정'); toast('저장했습니다 · 다음 동기화 때 Asana에 반영'); }
    S.ui.dirEdit = false; focusLater('#dir-dlg');
  };
  APP.forms.dirMemo = (fd, form) => {
    const d = find(form.dataset.id); const g = gOf(fd);
    const memo = g('memo'); const res = g('result_url') || (d.result_url === '#' ? '#' : '');
    const changed = [];
    if (memo !== d.memo) changed.push('메모');
    if (res !== d.result_url) changed.push('결과물 링크');
    if (!changed.length) { toast('바뀐 내용이 없습니다'); return; }
    d.memo = memo; d.result_url = res; d.updated_at = S.today;
    addLog(d, changed.join('·') + ' 수정');
    toast(changed.join('·') + ' 저장 · 다음 동기화 때 Asana에 반영');
  };

  /* 상세 창: Esc·바깥 누르면 닫기, 다른 메뉴로 가면 정리 */
  const closeDlg = () => { const b = document.querySelector('.dir-dlg-head [data-act="dirClose"]'); if (b) b.click(); };
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && S.ui.dirOpen) closeDlg(); });
  document.addEventListener('click', (e) => { if (e.target.classList && e.target.classList.contains('dir-dlg-back')) closeDlg(); });
  window.addEventListener('hashchange', () => { document.body.classList.remove('dir-lock'); S.ui.dirOpen = null; S.ui.dirEdit = false; });

  APP.views.directives = viewDirectives;
})();
