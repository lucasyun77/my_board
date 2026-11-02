/* 메뉴: 지시 관리 (directives) — 이 메뉴 담당 하위 세션은 이 파일만 고칩니다.
   공용 도구·상태는 window.APP에서 꺼내 씁니다. 새 버튼 동작은 APP.acts['이름'] = (el) => {...},
   새 폼은 APP.forms['이름'] = (fd, form) => {...}, 새 select 변경은 APP.changes['이름'] = (el) => {...} 로 등록합니다. */
(function () {
  'use strict';
  const { clone, S, save, RATE, HOUR_VALUE, LEVEL_COST, STATUSES, STAGES, F_TYPES, L_TABLE, $, esc, won, kwon, days, md, BADGE, badge, tagById, chip, uid, shuffle, toast, isOpen, isOverdue, isStale, Lof, Sof, evaluate, sumConfirmed, dayStr, guide, currentFilter, applyFilter, prioPill, statPill, statusSelect, qById, reviewSet } = window.APP;
  function viewDirectives() {
    const f = currentFilter();
    const list = applyFilter(S.directives, f).sort((a, b) => a.due_at.localeCompare(b.due_at));
    const mode = S.ui.dirView || '목록';
    let body = '';
    if (mode === '목록') {
      body = `<div class="tbl-wrap"><table><thead><tr><th>지시 내용</th><th>담당</th><th>지시일</th><th>기한</th><th>우선</th><th>상태</th><th>태그</th><th>Asana</th></tr></thead><tbody>
        ${list.map((d) => `<tr class="${isOverdue(d) ? 'overdue' : ''}"><td><b>${esc(d.title)}</b>${d.memo ? `<div class="small muted">${esc(d.memo)}</div>` : ''}${isStale(d) ? `<div class="small" style="color:var(--warn)">${days(d.updated_at, S.today)}일째 갱신 없음</div>` : ''}</td>
        <td>${esc(d.org)}<div class="small muted">${esc(d.assignee)}</div></td><td class="num">${md(d.issued_at)}</td>
        <td class="num" style="${isOverdue(d) ? 'color:var(--crit)' : ''}">${md(d.due_at)}${isOverdue(d) ? `<div class="small">D+${days(d.due_at, S.today)}</div>` : ''}</td>
        <td>${prioPill(d.priority)}</td><td>${statusSelect(d)}</td><td><div class="row">${d.tags.map(chip).join('')}</div></td>
        <td class="small muted">${d.asana_gid ? '동기화됨' : '-'}</td></tr>`).join('') || '<tr><td colspan="8" class="muted">조건에 맞는 지시가 없습니다. 필터를 줄여 보세요.</td></tr>'}
        </tbody></table></div>`;
    } else if (mode === '칸반') {
      body = `<div class="kanban">${STATUSES.map((s) => { const c = list.filter((d) => d.status === s); return `<div class="col"><header><span>${s}</span><span class="num muted">${c.length}</span></header>
        ${c.map((d) => `<div class="card ${isOverdue(d) ? 'overdue' : ''}"><div class="t">${esc(d.title)}</div><div class="row small muted">${esc(d.org)} · 기한 ${md(d.due_at)}</div><div class="row">${prioPill(d.priority)}${d.tags.map(chip).join('')}</div>${statusSelect(d)}</div>`).join('') || '<div class="small muted">없음</div>'}</div>`; }).join('')}</div>`;
    } else {
      const open = list.filter(isOpen);
      const before = open.filter((d) => d.due_at < S.today), after = open.filter((d) => d.due_at >= S.today);
      const row = (d) => `<div class="tl-row"><span class="d">${d.due_at.slice(5).replace('-', '/')}</span><span>${prioPill(d.priority)} <b>${esc(d.title)}</b> <span class="small muted">${esc(d.org)} · ${d.status}</span></span></div>`;
      body = `<div class="tl">${before.map(row).join('')}<div class="tl-today">오늘 ${md(S.today)}</div>${after.map(row).join('')}</div>`;
    }
    const orgRows = MOCK.ORGS.map((o) => { const all = S.directives.filter((d) => d.org === o && d.status !== '보류'); const done = all.filter((d) => d.status === '완료').length; return { o, all: all.length, pct: all.length ? Math.round(100 * done / all.length) : 0 }; }).filter((r) => r.all);
    return `
      <div class="view-head"><div><h2>지시 관리</h2><p>등록하면 Asana "회장 지시" 프로젝트에 태스크가 함께 생성되고 1시간마다 상태가 맞춰집니다. <span class="small">(목업: Asana 연동 표시만)</span></p></div>
        <div class="seg" role="group" aria-label="보기 방식">${['목록', '칸반', '타임라인'].map((m) => `<button type="button" data-act="dirView" data-v="${m}" aria-pressed="${m === mode}">${m}</button>`).join('')}</div></div>
      <section class="panel" aria-label="필터">
        <div class="row" style="justify-content:space-between"><h3>태그 필터</h3>
          <div class="seg" role="group" aria-label="태그 조건">${['OR', 'AND'].map((m) => `<button type="button" data-act="fMode" data-v="${m}" aria-pressed="${f.mode === m}">${m === 'OR' ? '하나라도(OR)' : '모두(AND)'}</button>`).join('')}</div></div>
        <div class="row" style="margin:10px 0">${S.tags.slice().sort((a, b) => a.sort - b.sort).map((t) => `<button type="button" class="chip" data-act="fTag" data-id="${t.id}" aria-pressed="${f.tags.includes(t.id)}" style="cursor:pointer;${f.tags.includes(t.id) ? `border-color:${esc(t.color)};box-shadow:inset 0 0 0 1px ${esc(t.color)}` : ''}"><span class="dot" style="background:${esc(t.color)}"></span>${esc(t.name)}</button>`).join('')}</div>
        <div class="form">
          <label class="f">상태<select id="f-status" data-act="fField" data-k="status"><option value="all">전체</option><option value="open" ${f.status === 'open' ? 'selected' : ''}>미완료 전체</option>${STATUSES.map((s) => `<option ${f.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
          <label class="f">조직<select id="f-org" data-act="fField" data-k="org"><option value="">전체</option>${MOCK.ORGS.map((o) => `<option ${f.org === o ? 'selected' : ''}>${o}</option>`).join('')}</select></label>
          <label class="f">기한<select id="f-due" data-act="fField" data-k="due"><option value="">전체</option><option value="overdue" ${f.due === 'overdue' ? 'selected' : ''}>기한 경과</option><option value="week" ${f.due === 'week' ? 'selected' : ''}>7일 이내</option></select></label>
          <div class="row"><button type="button" class="btn sm" data-act="fReset">초기화</button><button type="button" class="btn sm" data-act="saveView">현재 조건 저장</button></div>
        </div>
        <div class="row small" style="margin-top:10px"><span class="muted">저장된 보기</span>${S.savedViews.map((v) => `<button type="button" class="btn sm" data-act="loadView" data-id="${v.id}">${esc(v.name)}</button><button type="button" class="btn sm" data-act="delView" data-id="${v.id}" aria-label="${esc(v.name)} 삭제">×</button>`).join('')}</div>
        <div id="saveViewBox"></div>
      </section>
      <p class="small muted" style="margin:0">${list.length}건 표시 / 전체 ${S.directives.length}건</p>
      ${body}
      <div class="grid2">
        <section class="panel"><h3>조직별 이행률 ${badge('측정')}</h3><div class="tl" style="gap:8px;margin-top:8px">${orgRows.map((r) => `<div class="barrow"><span>${r.o}</span><div class="bar"><i style="width:${r.pct}%"></i></div><span class="num r">${r.pct}%</span></div>`).join('')}</div><p class="small muted" style="margin:8px 0 0">완료 ÷ (전체 − 보류)</p></section>
        <section class="panel"><details class="adder"><summary class="btn primary">+ 지시 등록</summary>
          <form class="form" data-form="directive">
            <label class="f wide">지시 내용<input type="text" id="nd-title" name="title" required placeholder="예: 가맹점 고정비 절감안 보고"></label>
            <label class="f">담당 조직<select id="nd-org" name="org">${MOCK.ORGS.map((o) => `<option>${o}</option>`).join('')}</select></label>
            <label class="f">담당자<input type="text" id="nd-assignee" name="assignee" placeholder="담당자"></label>
            <label class="f">기한<input type="date" id="nd-due" name="due_at" value="${dayStr(7)}"></label>
            <label class="f">우선순위<select id="nd-prio" name="priority"><option>보통</option><option>높음</option><option>긴급</option></select></label>
            <fieldset class="wide" style="border:0;padding:0;margin:0"><legend class="small muted">태그</legend><div class="row">${S.tags.map((t) => `<label class="chip"><input type="checkbox" name="tags" value="${t.id}"> ${esc(t.name)}</label>`).join('')}</div></fieldset>
            <label class="f wide">원문 링크<input type="url" id="nd-src" name="source_url" placeholder="https://"></label>
            <div><button class="btn primary">등록 + Asana 생성</button></div>
          </form></details></section>
      </div>
      ${viewTags()}`;
  }

  function viewTags() {
    const ed = S.ui.editTag ? tagById(S.ui.editTag) : null;
    const del = S.ui.delTag ? tagById(S.ui.delTag) : null;
    return `<section class="panel" aria-labelledby="h-tags"><h3 id="h-tags">태그 관리 <span class="small muted" style="font-family:var(--sans);font-weight:400">지시·신사업 공용</span></h3>
      <div class="tbl-wrap"><table><thead><tr><th>순서</th><th>태그</th><th>설명</th><th class="r">지시</th><th class="r">신사업</th><th></th></tr></thead><tbody>
      ${S.tags.slice().sort((a, b) => a.sort - b.sort).map((t) => `<tr><td class="num">${t.sort}</td><td>${chip(t.id)}</td><td class="muted">${esc(t.description)}</td><td class="num r">${S.directives.filter((d) => d.tags.includes(t.id)).length}</td><td class="num r">${S.ideas.filter((i) => i.tags.includes(t.id)).length}</td>
      <td><div class="row"><button type="button" class="btn sm" data-act="tagUp" data-id="${t.id}" aria-label="위로">↑</button><button type="button" class="btn sm" data-act="editTag" data-id="${t.id}">수정</button><button type="button" class="btn sm" data-act="askDelTag" data-id="${t.id}">삭제</button></div></td></tr>`).join('')}
      </tbody></table></div>
      ${del ? `<div class="explain" role="alert" style="margin-top:10px">"${esc(del.name)}" 태그를 삭제하면 지시 ${S.directives.filter((d) => d.tags.includes(del.id)).length}건, 신사업 ${S.ideas.filter((i) => i.tags.includes(del.id)).length}건에서 연결이 해제됩니다. <div class="row" style="margin-top:8px"><button type="button" class="btn primary sm" data-act="delTag" data-id="${del.id}">연결 해제하고 삭제</button><button type="button" class="btn sm" data-act="cancelDelTag">취소</button></div></div>` : ''}
      <form class="form" data-form="tag" style="margin-top:12px">
        <label class="f">이름<input type="text" id="tg-name" name="name" required value="${esc(ed ? ed.name : '')}"></label>
        <label class="f">색상<input type="text" id="tg-color" name="color" value="${esc(ed ? ed.color : '#F29801')}" placeholder="#RRGGBB"></label>
        <label class="f">설명<input type="text" id="tg-desc" name="description" value="${esc(ed ? ed.description : '')}"></label>
        <div class="row"><button class="btn primary sm">${ed ? '수정 저장' : '+ 태그 추가'}</button>${ed ? '<button type="button" class="btn sm" data-act="cancelEditTag">취소</button>' : ''}</div>
      </form></section>`;
  }
  APP.views.directives = viewDirectives;
})();
