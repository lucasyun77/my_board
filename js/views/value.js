/* 메뉴: 성과·레벨 (value) — 이 메뉴 담당 하위 세션은 이 파일만 고칩니다.
   공용 도구·상태는 window.APP에서 꺼내 씁니다. 새 버튼 동작은 APP.acts['이름'] = (el) => {...},
   새 폼은 APP.forms['이름'] = (fd, form) => {...}, 새 select 변경은 APP.changes['이름'] = (el) => {...} 로 등록합니다. */
(function () {
  'use strict';
  const { clone, S, save, RATE, HOUR_VALUE, LEVEL_COST, STATUSES, STAGES, F_TYPES, L_TABLE, $, esc, won, kwon, days, md, BADGE, badge, tagById, chip, uid, shuffle, toast, isOpen, isOverdue, isStale, Lof, Sof, evaluate, sumConfirmed, dayStr, guide, currentFilter, applyFilter, prioPill, statPill, statusSelect, qById, reviewSet } = window.APP;
  function viewValue() {
    const w = S.wallet;
    const periods = [['당일', S.today], ['주간', dayStr(-6)], ['월간', dayStr(-29)], ['분기', dayStr(-89)], ['누적', '0000']];
    const ach = S.achievements.slice().reverse();
    return `<div class="view-head"><div><h2>성과 수익가치 · 레벨</h2><p>V = B × L × F × S × A × N, 천원 단위 반올림. 목업에서는 Claude 평가 자리를 규칙 계산으로 대신합니다.</p></div></div>
      <section class="panel"><div class="levelbox">
        ${ART.mascot(w.balance_won >= LEVEL_COST ? 'key' : 'stand', 120)}
        <div><div class="small muted">현재 레벨 ${badge('추정')}</div><div class="big num">Lv.${w.level}</div></div>
        <div><div class="small muted">사용 가능 잔액</div><div class="num" style="font-weight:900;font-size:24px">${kwon(w.balance_won)}<span class="small muted">천원</span></div></div>
        <div><div class="small muted">누적 수익가치</div><div class="num" style="font-weight:900;font-size:24px">${kwon(w.total_won)}<span class="small muted">천원</span></div></div>
        <div style="flex:1;min-width:200px"><div class="small muted">다음 레벨까지 ${w.balance_won >= LEVEL_COST ? '— 지금 올릴 수 있습니다' : kwon(LEVEL_COST - w.balance_won) + '천원'}</div><div class="bar est" style="margin:6px 0"><i style="width:${Math.min(100, 100 * w.balance_won / LEVEL_COST)}%"></i></div>
          <button type="button" class="btn primary" data-act="levelUp" ${w.balance_won >= LEVEL_COST ? '' : 'disabled'}>1,000천원 사용해 레벨업</button></div>
      </div>
      <div class="tbl-wrap" style="margin-top:14px"><table><thead><tr>${periods.map((p) => `<th class="r">${p[0]}</th>`).join('')}</tr></thead><tbody><tr>${periods.map((p) => `<td class="r num">${kwon(sumConfirmed(p[1]))}천원</td>`).join('')}</tr></tbody></table></div>
      ${S.levelUps.length ? `<p class="small muted" style="margin:8px 0 0">레벨업 이력: ${S.levelUps.map((l) => `Lv.${l.level_after} (${md(l.at)})`).join(', ')}</p>` : ''}</section>

      <section class="panel row" style="justify-content:space-between"><span>오늘 할 일 등록·시간 기록·완료 입력은 <b>오늘 할 일</b> 메뉴에서 합니다. 완료 입력하면 이곳에서 평가·협상·확정합니다.</span><button type="button" class="btn sm" data-act="tab" data-v="today">오늘 할 일로 →</button></section>

      <section class="panel"><h3>평가·협상·확정</h3>
        ${ach.map((a) => `<div style="padding:12px 0;border-bottom:var(--hair)">
          <div class="row" style="justify-content:space-between"><b>${esc(a.title)}</b><span class="row"><span class="pill ${a.status === '확정' ? 'st-done' : 'st-wait'}">${a.status}</span><span class="num" style="font-weight:900;font-size:20px">${kwon(a.value_won)}천원</span>${badge('추정')}</span></div>
          <div class="coef" style="margin-top:8px">${[['B', won(a.B) + '원'], ['L', a.L.toFixed(1)], ['F', a.F.toFixed(1)], ['S', a.S.toFixed(2)], ['A', a.A.toFixed(1)], ['N', a.N.toFixed(2)]].map(([k, v]) => `<div><div class="k">${k}</div><div class="v">${v}</div></div>`).join('')}</div>
          <ul class="rationale">${a.rationale.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>
          ${a.negotiations.map((n) => `<div class="nego" style="margin-top:8px"><span><b>회장 ${n.round}차</b> ${esc(n.chairman_msg)}</span><span><b>Claude</b> [${n.verdict}] ${esc(n.claude_reply)} → N ${n.n_after.toFixed(2)}</span></div>`).join('')}
          ${a.status !== '확정' ? `<form class="form" data-form="nego" data-id="${a.id}" style="margin-top:10px">
            <label class="f wide">이의 제기 근거 (${a.negotiations.length}/3회 사용)<textarea id="ng-${a.id}" name="msg" placeholder="예: 실측 결과 1인당 월 1.5시간 절감, 가맹점 30곳 재사용 예정" ${a.negotiations.length >= 3 ? 'disabled' : ''}></textarea></label>
            <div class="row"><button class="btn sm" ${a.negotiations.length >= 3 || a.N >= 1.3 ? 'disabled' : ''}>협상 요청</button><button type="button" class="btn primary sm" data-act="confirm" data-id="${a.id}">확정 → 잔액 적립</button></div></form>` : `<p class="small muted" style="margin:6px 0 0">확정 ${md(a.confirmed_at)} · 잔액에 적립됨</p>`}
        </div>`).join('')}
      </section>`;
  }
  APP.views.value = viewValue;
})();
