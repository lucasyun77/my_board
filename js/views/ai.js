/* 메뉴: AI 사용 (ai) — 이 메뉴 담당 하위 세션은 이 파일만 고칩니다.
   공용 도구·상태는 window.APP에서 꺼내 씁니다. 새 버튼 동작은 APP.acts['이름'] = (el) => {...},
   새 폼은 APP.forms['이름'] = (fd, form) => {...}, 새 select 변경은 APP.changes['이름'] = (el) => {...} 로 등록합니다. */
(function () {
  'use strict';
  const { clone, S, save, RATE, HOUR_VALUE, LEVEL_COST, STATUSES, STAGES, F_TYPES, L_TABLE, $, esc, won, kwon, days, md, BADGE, badge, tagById, chip, uid, shuffle, toast, isOpen, isOverdue, isStale, Lof, Sof, evaluate, sumConfirmed, dayStr, guide, currentFilter, applyFilter, prioPill, statPill, statusSelect, qById, reviewSet } = window.APP;
  function viewAI() {
    const u = S.usage;
    const last = u[u.length - 1];
    const wk = u.slice(-7).reduce((s, x) => s + x.cost_usd, 0);
    const all = u.reduce((s, x) => s + x.cost_usd, 0);
    const W = 640, H = 140, P = { l: 44, r: 10, t: 10, b: 22 };
    const vals = u.map((x) => (x.input_tokens + x.output_tokens) / 1e6);
    const max = Math.ceil(Math.max(...vals));
    const X = (i) => P.l + (i * (W - P.l - P.r)) / (u.length - 1);
    const Y = (v) => H - P.b - (v / max) * (H - P.t - P.b);
    const line = vals.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join('');
    const area = `${line}L${X(u.length - 1)},${H - P.b}L${X(0)},${H - P.b}Z`;
    const ticks = [0, max / 2, max];
    const runHours = [0, ...Array.from({ length: 16 }, (_, i) => i + 8)];
    const nowH = new Date().getHours();
    const ranToday = runHours.filter((h) => h <= nowH);
    return `<div class="view-head"><div><h2>AI 사용 모니터링</h2><p>보고 스킬 <code>ai-usage-report</code> v0.1이 매시 정각 수집해 <code>POST /api/ai-usage</code>로 보냅니다. 수집 경로가 없는 항목은 미확인으로 둡니다.</p></div></div>
      ${guide('watch', '수집 시간 안내', '01시~07시에는 수집하지 않고, 그 외에는 매시 정각에 기록합니다.')}
      <div class="grid3">
        <section class="panel"><div class="small muted">오늘 토큰 (Claude) ${badge('측정')}</div><div class="num" style="font-weight:900;font-size:26px">${((last.input_tokens + last.output_tokens) / 1e6).toFixed(2)}<span class="small muted">M</span></div><div class="small muted">입력 ${(last.input_tokens / 1e6).toFixed(2)}M · 출력 ${(last.output_tokens / 1e6).toFixed(2)}M</div></section>
        <section class="panel"><div class="small muted">최근 7일 비용 ${badge('측정')}</div><div class="num" style="font-weight:900;font-size:26px">${won(wk * RATE)}<span class="small muted">원</span></div><div class="small muted">$${wk.toFixed(2)} × ${won(RATE)}원(가정 환율)</div></section>
        <section class="panel"><div class="small muted">ChatGPT · Gemini 비용 ${badge('미확인')}</div><div class="num" style="font-weight:900;font-size:26px">—</div><div class="small muted">관리자 키 확인 전(§8-4)</div></section>
      </div>
      <section class="panel"><h3>일별 토큰 추이 · 14일 (Claude) ${badge('측정')}</h3>
        <svg class="spark" viewBox="0 0 ${W} ${H}" role="img" aria-label="14일 토큰 추이">
          ${ticks.map((t) => `<line x1="${P.l}" x2="${W - P.r}" y1="${Y(t)}" y2="${Y(t)}" stroke="var(--line)" stroke-width=".5"/><text x="${P.l - 6}" y="${Y(t) + 4}" text-anchor="end" font-size="11" fill="var(--ink-2)">${t.toFixed(1)}M</text>`).join('')}
          <path d="${area}" fill="var(--stripe)"/><path d="${line}" fill="none" stroke="var(--accent)" stroke-width="2"/>
          <circle cx="${X(u.length - 1)}" cy="${Y(vals[vals.length - 1])}" r="4" fill="var(--accent)"/>
          ${u.map((x, i) => (i % 3 === 1 || i === u.length - 1) ? `<text x="${X(i)}" y="${H - 6}" text-anchor="middle" font-size="11" fill="var(--ink-2)">${md(x.date)}</text>` : '').join('')}
        </svg><p class="small muted" style="margin:4px 0 0">14일 누적 비용 ${won(all * RATE)}원 ($${all.toFixed(2)})</p></section>
      <div class="grid2">
        <section class="panel"><h3>기능별 사용 빈도 ${badge('추정')}</h3><div class="tl" style="gap:8px;margin-top:8px">${S.features.map((f) => `<div class="barrow"><span>${f.name}</span><div class="bar est"><i style="width:${f.share * 2.2}%"></i></div><span class="num r">${f.share}%</span></div>`).join('')}</div><p class="small muted" style="margin:8px 0 0">세션 로그의 도구 호출 유형으로 분류(착수 시 확인)</p></section>
        <section class="panel"><h3>상위 스킬 Top 10 ${badge('측정')}</h3><div class="tbl-wrap"><table><tbody>${S.topSkills.map((s, i) => `<tr><td class="num muted">${i + 1}</td><td>${s[0]}</td><td class="r num">${s[1]}회</td></tr>`).join('')}</tbody></table></div></section>
      </div>
      <section class="panel"><h3>수집 경로 점검</h3><div class="tbl-wrap"><table><thead><tr><th>AI·계정</th><th>수집 경로</th><th>상태</th><th>비고</th></tr></thead><tbody>${S.providers.map((p) => `<tr><td>${p.name}</td><td class="small">${p.path}</td><td>${badge(p.status)}</td><td class="small muted">${p.note}</td></tr>`).join('')}</tbody></table></div></section>
      <section class="panel"><h3>수집 스케줄</h3><p class="small muted" style="margin:4px 0 10px"><code>CRON_TZ=Asia/Seoul 0 0,8-23 * * *</code> · 하루 17회 · 01:00~07:59 실행 안 함 · Cowork 예약 작업으로 등록</p>
        <div class="hours" aria-label="시간대별 실행 여부">${Array.from({ length: 24 }, (_, h) => `<div class="${runHours.includes(h) ? 'on' : ''}" title="${h}시 ${runHours.includes(h) ? '실행' : '쉼'}">${h}</div>`).join('')}</div>
        <p class="small" style="margin:10px 0 0">오늘 수신 로그(목업): ${ranToday.map((h) => String(h).padStart(2, '0') + ':00').join(', ') || '아직 없음'} — 01~07시 기록 없음 확인</p></section>`;
  }
  APP.views.ai = viewAI;
})();
