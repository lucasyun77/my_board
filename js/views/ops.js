/* 메뉴: 경영 현황 (ops) — 이 메뉴 담당 하위 세션은 이 파일만 고칩니다.
   공용 도구·상태는 window.APP에서 꺼내 씁니다. 새 버튼 동작은 APP.acts['이름'] = (el) => {...},
   새 폼은 APP.forms['이름'] = (fd, form) => {...}, 새 select 변경은 APP.changes['이름'] = (el) => {...} 로 등록합니다. */
(function () {
  'use strict';
  const { clone, S, save, RATE, HOUR_VALUE, LEVEL_COST, STATUSES, STAGES, F_TYPES, L_TABLE, $, esc, won, kwon, days, md, BADGE, badge, tagById, chip, uid, shuffle, toast, isOpen, isOverdue, isStale, Lof, Sof, evaluate, sumConfirmed, dayStr, guide, currentFilter, applyFilter, prioPill, statPill, statusSelect, qById, reviewSet } = window.APP;
  function viewOps() {
    const wl = S.waiting.slice().sort((a, b) => a.since.localeCompare(b.since));
    return `<div class="view-head"><div><h2>경영 현황</h2><p>직원이 회장님을 기다리는 건부터 봅니다.</p></div></div>
      <div class="grid2">
        <section class="panel"><h3>회장 대기함 ${badge('측정')}</h3><div class="tbl-wrap"><table><thead><tr><th>건</th><th>요청 조직</th><th class="r">대기</th></tr></thead><tbody>${wl.map((w) => { const d = days(w.since, S.today); return `<tr><td>${esc(w.title)}</td><td class="small">${w.from}</td><td class="r num" style="${d >= 5 ? 'color:var(--crit)' : ''}">${d}일</td></tr>`; }).join('')}</tbody></table></div><p class="small muted" style="margin:8px 0 0">Asana 회장 담당 + 미완료 기준</p></section>
        <section class="panel"><h3>부서 신호등 ${badge('미확인')}</h3><div class="tbl-wrap"><table><thead><tr><th>부서</th><th>현황판 등록</th><th class="r">지연 과제</th></tr></thead><tbody>${S.depts.map((d) => { const c = !d.registered || d.delayed >= 3 ? 'r' : d.delayed ? 'y' : 'g'; return `<tr><td><span class="sig ${c}" aria-label="${{ g: '양호', y: '주의', r: '위험' }[c]}"></span>${d.name}</td><td>${d.registered ? '등록' : '<span style="color:var(--crit)">미등록</span>'}</td><td class="r num">${d.delayed}</td></tr>`; }).join('')}</tbody></table></div><p class="small muted" style="margin:8px 0 0">수훈보드 연동 방법 확인 전 샘플값</p></section>
      </div>
      <section class="panel"><h3>브랜드 핵심 지표</h3><div class="grid3" style="margin-top:8px">${['블랙라벨', '벌툰', '생전포차'].map((b) => `<div><div style="font-weight:900;font-size:18px">${b}</div><div class="small">월 매출 — ${badge('미확인')}</div><div class="small">가맹점 수 — ${badge('미확인')}</div><div class="small">전월 대비 — ${badge('미확인')}</div></div>`).join('')}</div><p class="small muted" style="margin:8px 0 0">데이터 원천이 정해질 때까지 수치를 비워 둡니다.</p></section>
      <div class="grid2">
        <section class="panel"><h3>이슈·분쟁 추적 ${badge('수기')}</h3><div class="tbl-wrap"><table><thead><tr><th>건</th><th>다음 조치</th><th class="r">기한</th></tr></thead><tbody>${S.issues.map((i) => `<tr><td>${esc(i.title)}<div class="small muted">${i.owner}</div></td><td class="small">${esc(i.next)}</td><td class="r num">${md(i.due)}</td></tr>`).join('')}</tbody></table></div></section>
        <section class="panel"><h3>오늘 일정 ${badge('측정')}</h3><div class="tl">${S.calendar.map((c) => `<div class="tl-row"><span class="d">${c.time}</span><span>${esc(c.title)}</span></div>`).join('')}</div><p class="small muted" style="margin:8px 0 0">Google Calendar 연동 예정(목업 샘플)</p></section>
      </div>`;
  }
  APP.views.ops = viewOps;
})();
