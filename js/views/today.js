/* 메뉴: 오늘 할 일 (today) — 이 메뉴 담당 하위 세션은 이 파일만 고칩니다.
   공용 도구·상태는 window.APP에서 꺼내 씁니다. 새 버튼 동작은 APP.acts['이름'] = (el) => {...},
   새 폼은 APP.forms['이름'] = (fd, form) => {...}, 새 select 변경은 APP.changes['이름'] = (el) => {...} 로 등록합니다. */
(function () {
  'use strict';
  const { clone, S, save, RATE, HOUR_VALUE, LEVEL_COST, STATUSES, STAGES, F_TYPES, L_TABLE, $, esc, won, kwon, days, md, BADGE, badge, tagById, chip, uid, shuffle, toast, isOpen, isOverdue, isStale, Lof, Sof, evaluate, sumConfirmed, dayStr, guide, currentFilter, applyFilter, prioPill, statPill, statusSelect, qById, reviewSet } = window.APP;
  function tasksBlock() {
    const tasks = S.dailyTasks.filter((t) => t.date === S.today);
    const comp = S.ui.completing ? S.dailyTasks.find((t) => t.id === S.ui.completing) : null;
    return `      <section class="panel"><h3>내 할 일 <span class="small muted" style="font-weight:500">시작·종료를 누르면 소요시간이 측정됩니다</span></h3>
        <div class="tbl-wrap"><table><thead><tr><th>업무</th><th class="r">예상 E</th><th class="r">예상 가치</th><th class="r">실제 T</th><th></th></tr></thead><tbody>
        ${tasks.map((t) => `<tr><td>${esc(t.title)}</td><td class="r num">${t.est_minutes}분 ${badge('추정')}</td><td class="r num">${kwon(t.est_value)}천원 ${badge('추정')}</td>
          <td class="r num">${t.actual_minutes != null ? `${t.actual_minutes}분 ${badge(t.time_source)}` : t.started_at ? '<span style="color:var(--accent-ink)">진행 중</span>' : '-'}</td>
          <td><div class="row">${t.done ? '<span class="pill st-done">평가 요청됨</span>' : !t.started_at ? `<button type="button" class="btn sm" data-act="tStart" data-id="${t.id}">시작</button>` : t.actual_minutes == null ? `<button type="button" class="btn sm" data-act="tStop" data-id="${t.id}">종료</button>` : `<button type="button" class="btn primary sm" data-act="tComplete" data-id="${t.id}">완료 입력</button>`}
          ${!t.done && t.actual_minutes == null ? `<button type="button" class="btn sm" data-act="tManual" data-id="${t.id}">수기 입력</button>` : ''}</div></td></tr>`).join('')}
        </tbody></table></div>
        ${S.ui.manual ? `<form class="form" data-form="manual" style="margin-top:10px"><label class="f">실제 소요(분)<input type="number" id="mn-min" name="min" min="1" value="60"></label><div class="row"><button class="btn primary sm">저장(수기)</button><button type="button" class="btn sm" data-act="cancelManual">취소</button></div></form>` : ''}
        <form class="form" data-form="task" style="margin-top:12px"><label class="f wide">오늘 할 일 추가<input type="text" id="nt-title" name="title" required placeholder="예: 가맹 투자 미팅 준비"></label>
          <label class="f">예상 소요(분)<input type="number" id="nt-min" name="est" min="5" value="60"></label><div><button class="btn primary sm">확정 → 예상치 산정</button></div></form>
      </section>

      ${comp ? `<section class="panel" aria-labelledby="h-comp"><h3 id="h-comp">완료 입력 — ${esc(comp.title)}</h3>
        <form class="form" data-form="complete">
          <label class="f wide">산출물 링크<input type="url" id="cp-url" name="output_url" placeholder="https://"></label>
          <label class="f">산출물 형태<select id="cp-type" name="output_type">${Object.entries(F_TYPES).map(([k, v]) => `<option value="${k}">${v[0]} (${v[1].toFixed(1)})</option>`).join('')}</select></label>
          <label class="f">영향 인원(명)<input type="number" id="cp-head" name="headcount" min="1" value="1"></label>
          <label class="f">에이전트 수행<select id="cp-agent" name="by_agent"><option value="0">직접</option><option value="1">에이전트</option></select></label>
          <label class="f">1인 월 절감시간(시간)<input type="number" id="cp-hours" name="saved_hours" min="0" step="0.5" value="1"></label>
          <label class="f">유효개월(최대 12)<input type="number" id="cp-months" name="months" min="1" max="12" value="12"></label>
          <label class="f">월 매출·이익 기여(원)<input type="number" id="cp-rev" name="monthly_revenue" min="0" value="0"></label>
          <label class="f">월 비용절감(원)<input type="number" id="cp-cost" name="monthly_cost" min="0" value="0"></label>
          <label class="f"><span>1회성 산출물</span><select id="cp-once" name="one_off"><option value="0">아니오</option><option value="1">예(1개월분만)</option></select></label>
          <p class="small muted wide" style="margin:0">B는 반드시 1인 기준으로 적습니다. 영향 인원은 L로만 반영합니다(이중 반영 방지).</p>
          <div class="row"><button class="btn primary">Claude 최종 평가 요청</button><button type="button" class="btn sm" data-act="cancelComplete">취소</button></div>
        </form></section>` : ''}

`;
  }

  function viewToday() {
    const due = S.directives.filter((d) => isOpen(d) && d.due_at <= S.today).sort((x, y) => x.due_at.localeCompare(y.due_at));
    const soon = S.directives.filter((d) => isOpen(d) && d.due_at > S.today && d.due_at <= dayStr(3)).sort((x, y) => x.due_at.localeCompare(y.due_at));
    const wl = S.waiting.slice().sort((x, y) => x.since.localeCompare(y.since));
    const dRow = (d) => `<tr class="${isOverdue(d) ? 'overdue' : ''}"><td><b>${esc(d.title)}</b><div class="small muted">${esc(d.org)} · ${esc(d.assignee)}</div></td><td class="num">${isOverdue(d) ? `<span style="color:var(--crit);font-weight:700">D+${days(d.due_at, S.today)}</span>` : d.due_at === S.today ? '<b>오늘</b>' : md(d.due_at)}</td><td>${statusSelect(d)}</td></tr>`;
    return `<div class="view-head"><div><h2>오늘 할 일</h2><p>내가 할 일, 오늘 챙길 지시, 결재 대기, 일정을 한 화면에서 처리합니다.</p></div></div>
      ${tasksBlock()}
      <div class="grid2">
        <section class="panel"><h3>오늘 챙길 지시 ${badge('측정')}</h3>
          <div class="tbl-wrap"><table><thead><tr><th>지시</th><th>기한</th><th>상태</th></tr></thead><tbody>${due.map(dRow).join('') || '<tr><td colspan="3" class="muted">오늘까지 기한인 지시가 없습니다.</td></tr>'}
          ${soon.length ? `<tr><td colspan="3" class="small muted" style="padding-top:16px;border-bottom:0">3일 안에 기한</td></tr>${soon.map(dRow).join('')}` : ''}</tbody></table></div>
        </section>
        <div style="display:flex;flex-direction:column;gap:16px;min-width:0">
          <section class="panel"><h3>결재·답변 대기 ${badge('측정')}</h3><div class="tl">${wl.map((w) => { const d = days(w.since, S.today); return `<div class="tl-row"><span class="d" style="${d >= 5 ? 'color:var(--crit)' : ''}">${d}일째</span><span>${esc(w.title)} <span class="small muted">${w.from}</span></span></div>`; }).join('')}</div></section>
          <section class="panel"><h3>오늘 일정 ${badge('측정')}</h3><div class="tl">${S.calendar.map((c) => `<div class="tl-row"><span class="d">${c.time}</span><span>${esc(c.title)}</span></div>`).join('')}</div></section>
        </div>
      </div>`;
  }
  APP.views.today = viewToday;
})();
