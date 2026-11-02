/* 메뉴: 보상 기준 (rules) — 이 메뉴 담당 하위 세션은 이 파일만 고칩니다.
   공용 도구·상태는 window.APP에서 꺼내 씁니다. 새 버튼 동작은 APP.acts['이름'] = (el) => {...},
   새 폼은 APP.forms['이름'] = (fd, form) => {...}, 새 select 변경은 APP.changes['이름'] = (el) => {...} 로 등록합니다. */
(function () {
  'use strict';
  const { clone, S, save, RATE, HOUR_VALUE, LEVEL_COST, STATUSES, STAGES, F_TYPES, L_TABLE, $, esc, won, kwon, days, md, BADGE, badge, tagById, chip, uid, shuffle, toast, isOpen, isOverdue, isStale, Lof, Sof, evaluate, sumConfirmed, dayStr, guide, currentFilter, applyFilter, prioPill, statPill, statusSelect, qById, reviewSet } = window.APP;
  function viewRules() {
    const negos = S.achievements.flatMap((a) => a.negotiations.map((n) => ({ ...n, title: a.title })));
    return `<div class="view-head"><div><h2>보상 기준</h2><p>계수를 바꾸면 적용일과 사유를 남기고, 과거 확정분은 소급하지 않습니다.</p></div></div>
      <section class="panel"><h3>산정 공식</h3><div class="formula" style="margin-top:8px">수익가치 V = B × L × F × S × A × N   (천원 단위 반올림)</div>
        <div class="tbl-wrap" style="margin-top:12px"><table><thead><tr><th>기호</th><th>항목</th><th>기준</th></tr></thead><tbody>
          <tr><td><b>B</b></td><td>기본 예상가치</td><td><b>1인 기준</b> 월 효과 × 유효개월(상한 12). 월 효과 = 절감시간 × ${won(HOUR_VALUE)}원/시간 + 월 매출·이익 기여 + 월 비용절감. 1회성은 1회 효과만.</td></tr>
          <tr><td><b>L</b></td><td>레버리지(영향 인원)</td><td>${L_TABLE.map((r) => `${r[2]} ${r[1].toFixed(1)}`).join(' / ')}</td></tr>
          <tr><td><b>F</b></td><td>산출물 형태</td><td>${Object.values(F_TYPES).map((v) => `${v[0]} ${v[1].toFixed(1)}`).join(' / ')} (상한)</td></tr>
          <tr><td><b>S</b></td><td>속도 보상</td><td><code>1 + 0.5 × max(0, (E − T) / E)</code>, 최대 1.5. 늦어도 감점 없음.</td></tr>
          <tr><td><b>A</b></td><td>에이전트 수행</td><td>에이전트로 완료 1.2 / 직접 1.0</td></tr>
          <tr><td><b>N</b></td><td>협상계수</td><td>기본 1.0, 협상으로 최대 1.3. 상향만 가능.</td></tr>
        </tbody></table></div>
        <p class="small" style="margin:10px 0 0"><b>이중 반영 방지</b> · 영향 인원의 효과는 L로만 반영합니다. B에 전원 절감시간을 넣고 L을 또 곱하지 않습니다.</p>
        <p class="small muted" style="margin:6px 0 0">산정 예시: 본사 100명 × 1인 월 1시간 절감 AI 자동화 프로그램, 예상 4시간 → 에이전트로 2시간. B 360,000원 × L 8.0 × F 2.0 × S 1.25 × A 1.2 = 8,640천원</p></section>
      <div class="grid2">
        <section class="panel"><h3>협상 규칙</h3><ul style="margin:8px 0 0;padding-left:18px"><li>근거(실측 데이터, 영향 인원 증빙, 재사용 가능성)를 내면 Claude가 수용 / 부분수용 / 거절과 사유를 답합니다.</li><li>건당 3회, N 상한 1.3.</li><li>근거 없이 올리지 않으며, 판단 기준을 매번 적습니다.</li><li>운영 2주 후 산정값 분포를 보고 계수를 1회 보정합니다.</li></ul></section>
        <section class="panel"><h3>변경 이력</h3><div class="tbl-wrap"><table><thead><tr><th>버전</th><th>적용일</th><th>사유</th></tr></thead><tbody>${S.rewardRules.map((r) => `<tr><td>${r.version}</td><td class="num">${r.effective_from}</td><td>${esc(r.reason)}</td></tr>`).join('')}</tbody></table></div></section>
      </div>
      <section class="panel"><h3>협상 로그 전문</h3>${negos.length ? negos.map((n) => `<div class="nego" style="margin-top:8px"><span class="small muted">${esc(n.title)} · ${n.round}차</span><span><b>회장</b> ${esc(n.chairman_msg)}</span><span><b>Claude</b> [${n.verdict}] ${esc(n.claude_reply)} (N → ${n.n_after.toFixed(2)})</span></div>`).join('') : guide('folder', '협상 기록 없음', '성과·레벨 메뉴에서 평가 건에 이의를 제기하시면 대화 전문을 이곳에 남깁니다.')}</section>`;
  }
  APP.views.rules = viewRules;
})();
