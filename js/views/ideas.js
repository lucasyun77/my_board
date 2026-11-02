/* 메뉴: 신사업 (ideas) — 이 메뉴 담당 하위 세션은 이 파일만 고칩니다.
   공용 도구·상태는 window.APP에서 꺼내 씁니다. 새 버튼 동작은 APP.acts['이름'] = (el) => {...},
   새 폼은 APP.forms['이름'] = (fd, form) => {...}, 새 select 변경은 APP.changes['이름'] = (el) => {...} 로 등록합니다. */
(function () {
  'use strict';
  const { clone, S, save, RATE, HOUR_VALUE, LEVEL_COST, STATUSES, STAGES, F_TYPES, L_TABLE, $, esc, won, kwon, days, md, BADGE, badge, tagById, chip, uid, shuffle, toast, isOpen, isOverdue, isStale, Lof, Sof, evaluate, sumConfirmed, dayStr, guide, currentFilter, applyFilter, prioPill, statPill, statusSelect, qById, reviewSet } = window.APP;
  function viewIdeas() {
    const sc = (i) => i.s.reduce((a, b) => a + b, 0);
    const axis = ['시장성', '적합도', '필요자원', '속도'];
    return `<div class="view-head"><div><h2>신사업 파이프라인</h2><p>4축 점수(각 1~5, 필요자원은 적게 들수록 높게). 초기 5건은 회장님 확인 전 샘플입니다.</p></div></div>
      <div class="kanban">${STAGES.map((st) => { const c = S.ideas.filter((i) => i.stage === st); return `<div class="col"><header><span>${st}</span><span class="num muted">${c.length}</span></header>
        ${c.map((i) => `<div class="card"><div class="t">${esc(i.title)}</div><div class="small muted">${esc(i.summary)}</div>
          <div class="small">${axis.map((a, k) => `${a} <b class="num">${i.s[k]}</b>`).join(' · ')} <span class="muted">= ${sc(i)}/20</span> ${badge('수기')}</div>
          <div class="small"><span class="muted">다음 액션</span> ${esc(i.next_action)} <span class="num ${i.next_due < S.today ? '' : 'muted'}" style="${i.next_due < S.today ? 'color:var(--crit)' : ''}">~${md(i.next_due)}</span></div>
          <div class="row">${i.tags.map(chip).join('')}</div>
          <div class="small muted">${esc(i.owner)}${i.notes.length ? ` · 메모 ${i.notes.length}건(최근: ${esc(i.notes[i.notes.length - 1].body)})` : ''}</div>
          <select aria-label="단계 이동" data-act="ideaStage" data-id="${i.id}">${STAGES.map((s) => `<option ${s === i.stage ? 'selected' : ''}>${s}</option>`).join('')}</select></div>`).join('') || '<div class="small muted">없음</div>'}</div>`; }).join('')}</div>
      <section class="panel"><details class="adder"><summary class="btn primary">+ 아이디어 등록</summary>
        <form class="form" data-form="idea">
          <label class="f">제목<input type="text" id="ni-title" name="title" required></label>
          <label class="f wide">한 줄 설명<input type="text" id="ni-sum" name="summary"></label>
          <label class="f">담당<input type="text" id="ni-owner" name="owner"></label>
          ${axis.map((a, k) => `<label class="f">${a}<select id="ni-s${k}" name="s${k}">${[1, 2, 3, 4, 5].map((n) => `<option ${n === 3 ? 'selected' : ''}>${n}</option>`).join('')}</select></label>`).join('')}
          <label class="f wide">다음 액션<input type="text" id="ni-next" name="next_action"></label>
          <label class="f">다음 액션 기한<input type="date" id="ni-due" name="next_due" value="${dayStr(7)}"></label>
          <fieldset class="wide" style="border:0;padding:0;margin:0"><legend class="small muted">태그</legend><div class="row">${S.tags.map((t) => `<label class="chip"><input type="checkbox" name="tags" value="${t.id}"> ${esc(t.name)}</label>`).join('')}</div></fieldset>
          <div><button class="btn primary">등록</button></div>
        </form></details></section>`;
  }
  APP.views.ideas = viewIdeas;
})();
