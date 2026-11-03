/* 메뉴: 보상 기준 (rules) — 이 메뉴 담당 하위 세션은 이 파일만 고칩니다.
   공용 도구·상태는 window.APP에서 꺼내 씁니다. 새 버튼 동작은 APP.acts['이름'] = (el) => {...},
   새 폼은 APP.forms['이름'] = (fd, form) => {...}, 새 select 변경은 APP.changes['이름'] = (el) => {...} 로 등록합니다. */
(function () {
  'use strict';
  const { clone, S, HOUR_VALUE, F_TYPES, L_TABLE, $, esc, won, kwon, days, md, badge, toast, evaluate, dayStr, guide } = window.APP;

  /* ---------- 기본값 · 샘플 ---------- */
  // 공식 예시(인계문서 §M5): 본사 100명 · 1인 월 1시간 · AI+코드 · 예상 240분 → 실제 120분 · 에이전트 = 8,640천원
  const EXAMPLE = { saved_hours: 1, monthly_revenue: 0, monthly_cost: 0, months: 12, one_off: false, headcount: 100, output_type: 'ai_code', est_minutes: 240, actual_minutes: 120, by_agent: true, N: 1 };
  const EXAMPLE_WON = 8640000;
  const BASE = { hour: HOUR_VALUE, cap: 12, slope: 0.5, smax: 1.5, agent: 1.2, nmax: 1.3, L: L_TABLE.map((r) => r[1]), F: Object.fromEntries(Object.entries(F_TYPES).map(([k, v]) => [k, v[1]])) };
  const VERDICTS = ['수용', '부분수용', '거절'];

  // 협상 로그 예시(실제 평가 건과 별개, 화면 이해용 샘플). 메뉴 파일 안에서만 S에 붙인다.
  S.rulesExtra = S.rulesExtra || {
    negoSamples: [
      { title: '[샘플] 가맹점 발주 자동화 스킬', created_at: dayStr(-9), n_before: 1.0, round: 1, verdict: '거절', n_after: 1.0,
        chairman_msg: '이건 가맹점 전체가 쓰니까 더 쳐줘야지.',
        claude_reply: '영향 범위는 이미 L(300명 이상 10.0)로 반영돼 있어 N으로 다시 올리면 이중 반영입니다. 추가 근거(실측 절감시간 등)가 있으면 다시 제시해 주세요.' },
      { title: '[샘플] 가맹점 발주 자동화 스킬', created_at: dayStr(-8), n_before: 1.0, round: 2, verdict: '수용', n_after: 1.1,
        chairman_msg: '시범 매장 12곳 실측 결과 점주 1인당 월 1.6시간 절감, 예상치 1시간보다 높게 나왔다. 측정표 첨부.',
        claude_reply: '실측 수치와 측정 대상이 명확해 수용합니다. B는 예상치 기준을 유지하고 초과분을 N +0.10으로 반영합니다.' },
      { title: '[샘플] 주간 매출 보고 템플릿', created_at: dayStr(-6), n_before: 1.0, round: 1, verdict: '부분수용', n_after: 1.05,
        chairman_msg: '다른 브랜드도 이 템플릿을 그대로 재사용할 예정이다.',
        claude_reply: '재사용 가능성은 타당하나 적용 일정·대상이 정해지지 않아 일부만 반영합니다(N +0.05). 적용 브랜드와 날짜가 정해지면 다시 제시해 주세요.' }
    ]
  };
  S.ui.rulesSim = S.ui.rulesSim || clone(EXAMPLE);
  S.ui.rulesDraft = S.ui.rulesDraft || clone(BASE);

  /* ---------- 계산 ---------- */
  const tierIdx = (n) => L_TABLE.findIndex((r) => n <= r[0]);
  const current = (inp) => evaluate(clone(inp));
  // 변경안 계수로 다시 계산(목업 시뮬레이션 — 실제 평가에는 반영되지 않음)
  function draftCalc(inp, c) {
    const months = inp.one_off ? 1 : Math.min(c.cap, Math.max(1, +inp.months || 1));
    const B = ((+inp.saved_hours || 0) * c.hour + (+inp.monthly_revenue || 0) + (+inp.monthly_cost || 0)) * months;
    const L = c.L[tierIdx(+inp.headcount || 1)];
    const F = c.F[inp.output_type];
    const E = +inp.est_minutes; const T = inp.actual_minutes;
    const Sv = E > 0 && T != null ? Math.min(c.smax, 1 + c.slope * Math.max(0, (E - T) / E)) : 1;
    const A = inp.by_agent ? c.agent : 1;
    const N = Math.min(c.nmax, inp.N || 1);
    return { B, L, F, S: +Sv.toFixed(3), A, N, value_won: Math.round((B * L * F * Sv * A * N) / 1000) * 1000 };
  }
  const draftDiff = (d) => {
    const out = [];
    if (d.hour !== BASE.hour) out.push(`시간가치 ${won(BASE.hour)}→${won(d.hour)}원`);
    if (d.cap !== BASE.cap) out.push(`유효개월 상한 ${BASE.cap}→${d.cap}`);
    d.L.forEach((v, i) => { if (v !== BASE.L[i]) out.push(`L(${L_TABLE[i][2]}) ${BASE.L[i]}→${v}`); });
    Object.keys(BASE.F).forEach((k) => { if (d.F[k] !== BASE.F[k]) out.push(`F(${F_TYPES[k][0]}) ${BASE.F[k]}→${d.F[k]}`); });
    if (d.slope !== BASE.slope) out.push(`S 기울기 ${BASE.slope}→${d.slope}`);
    if (d.smax !== BASE.smax) out.push(`S 상한 ${BASE.smax}→${d.smax}`);
    if (d.agent !== BASE.agent) out.push(`A ${BASE.agent}→${d.agent}`);
    if (d.nmax !== BASE.nmax) out.push(`N 상한 ${BASE.nmax}→${d.nmax}`);
    return out;
  };
  const exampleOk = () => current(EXAMPLE).value_won === EXAMPLE_WON;

  /* ---------- 화면 조각 ---------- */

  function simResult() {
    const inp = S.ui.rulesSim; const r = current(inp); const d = S.ui.rulesDraft;
    const changed = draftDiff(d); const dr = changed.length ? draftCalc(inp, d) : null;
    const isEx = JSON.stringify(inp) === JSON.stringify(EXAMPLE);
    const pct = dr && r.value_won ? Math.round(100 * (dr.value_won - r.value_won) / r.value_won) : 0;
    return `<div class="rl-out">
        <div class="rl-v"><span class="rl-lab">현재 기준 V ${badge('추정')}</span><span class="num rl-big">${kwon(r.value_won)}<small>천원</small></span>
          ${isEx ? `<span class="pill ${r.value_won === EXAMPLE_WON ? 'st-done' : 'p-urgent'}">${r.value_won === EXAMPLE_WON ? '공식 예시 8,640천원 재현 ✓' : '공식 예시와 불일치'}</span>` : ''}</div>
        ${dr ? `<div class="rl-v rl-draft"><span class="rl-lab">변경안 적용 시 V</span><span class="num rl-big">${kwon(dr.value_won)}<small>천원</small></span><span class="pill ${pct > 0 ? 'st-wait' : pct < 0 ? 'p-high' : ''}">${pct > 0 ? '+' : ''}${pct}%</span></div>` : ''}
      </div>
      <div class="coef" style="margin-top:10px">${[['B', won(r.B) + '원', dr && won(dr.B) + '원'], ['L', r.L.toFixed(1), dr && dr.L.toFixed(1)], ['F', r.F.toFixed(1), dr && dr.F.toFixed(1)], ['S', r.S.toFixed(2), dr && dr.S.toFixed(2)], ['A', r.A.toFixed(1), dr && dr.A.toFixed(1)], ['N', r.N.toFixed(2), dr && dr.N.toFixed(2)]]
        .map(([k, v, dv]) => `<div><div class="k">${k}</div><div class="v num">${v}</div>${dv && dv !== v ? `<div class="rl-dv num">→ ${dv}</div>` : ''}</div>`).join('')}</div>
      <ul class="rationale rl-why">${r.rationale.map((x) => `<li>${esc(x)}</li>`).join('')}<li>V: ${won(r.B)} × ${r.L.toFixed(1)} × ${r.F.toFixed(1)} × ${r.S.toFixed(2)} × ${r.A.toFixed(1)} × ${r.N.toFixed(2)} = ${won(r.B * r.L * r.F * r.S * r.A * r.N)}원 → 천원 반올림 <b>${kwon(r.value_won)}천원</b></li></ul>
      ${dr ? `<p class="rl-note">변경안: ${changed.map(esc).join(' · ')}</p>` : ''}`;
  }

  function simPanel() {
    const s = S.ui.rulesSim; const d = S.ui.rulesDraft; const ti = tierIdx(+s.headcount || 1);
    const n = (name, label, val, attrs = '') => `<label class="f">${label}<input type="number" inputmode="decimal" name="${name}" value="${val ?? ''}" ${attrs}></label>`;
    const changed = draftDiff(d);
    return `<section class="panel" id="rl-sim" aria-labelledby="h-rl-sim">
      <h3 id="h-rl-sim">계수 변경 시뮬레이터 <span class="pill">목업</span></h3>
      <p class="rl-p">값을 넣으면 V와 계수별 근거가 바로 바뀝니다. 아래 ‘계수 바꿔 보기’에서 변경안을 넣으면 현재 기준과 나란히 비교합니다. 실제 평가에는 반영되지 않습니다.</p>
      <div class="row rl-btns"><button type="button" class="btn sm" data-act="rulesExample">공식 예시 넣기</button><button type="button" class="btn sm" data-act="rulesClear">빈 값으로</button></div>
      <form class="form rl-form" data-rl="sim" onsubmit="return false">
        <fieldset class="rl-fs wide"><legend>B · 1인 기준 월 효과</legend><div class="form">
          ${n('saved_hours', '1인 월 절감시간(시간)', s.saved_hours, 'min="0" step="0.5"')}
          ${n('monthly_revenue', '월 매출·이익 기여(원)', s.monthly_revenue, 'min="0" step="10000"')}
          ${n('monthly_cost', '월 비용절감(원)', s.monthly_cost, 'min="0" step="10000"')}
          ${n('months', '유효개월(최대 12)', s.months, 'min="1" max="12" step="1"' + (s.one_off ? ' disabled' : ''))}
          <label class="f rl-check"><span><input type="checkbox" name="one_off" ${s.one_off ? 'checked' : ''}> 1회성(1개월분만)</span></label>
        </div></fieldset>
        ${n('headcount', `영향 인원(명) → L ${L_TABLE[ti][1].toFixed(1)}`, s.headcount, 'min="1" step="1"')}
        <label class="f">산출물 형태 → F<select name="output_type">${Object.entries(F_TYPES).map(([k, v]) => `<option value="${k}" ${k === s.output_type ? 'selected' : ''}>${v[0]} (${v[1].toFixed(1)})</option>`).join('')}</select></label>
        ${n('est_minutes', '예상 소요 E(분)', s.est_minutes, 'min="0" step="10"')}
        ${n('actual_minutes', '실제 소요 T(분, 비우면 S=1)', s.actual_minutes, 'min="0" step="10"')}
        <label class="f">수행 방식 → A<select name="by_agent"><option value="1" ${s.by_agent ? 'selected' : ''}>에이전트로 완료 (1.2)</option><option value="0" ${s.by_agent ? '' : 'selected'}>직접 수행 (1.0)</option></select></label>
        ${n('N', '협상계수 N(1.0~1.3)', s.N, 'min="1" max="1.3" step="0.05"')}
      </form>
      <div id="rl-result" aria-live="polite">${simResult()}</div>
      <details class="rl-draft-box" ${changed.length || S.ui.rulesDraftOpen ? 'open' : ''}><summary>계수 바꿔 보기 (변경안) ${changed.length ? `<span class="pill st-wait">${changed.length}개 변경</span>` : ''}</summary>
        <form class="form rl-form" data-rl="draft" onsubmit="return false" style="margin-top:10px">
          ${n('hour', '표준 시간가치(원/시간)', d.hour, 'min="0" step="1000"')}
          ${n('cap', '유효개월 상한', d.cap, 'min="1" max="36" step="1"')}
          ${n('L', `L · ${L_TABLE[ti][2]} 구간`, d.L[ti], 'min="0" step="0.5"')}
          ${n('F', `F · ${F_TYPES[s.output_type][0]}`, d.F[s.output_type], 'min="0" step="0.1"')}
          ${n('slope', 'S 기울기(기본 0.5)', d.slope, 'min="0" step="0.1"')}
          ${n('smax', 'S 상한(기본 1.5)', d.smax, 'min="1" step="0.1"')}
          ${n('agent', 'A 에이전트(기본 1.2)', d.agent, 'min="1" step="0.05"')}
          ${n('nmax', 'N 상한(기본 1.3)', d.nmax, 'min="1" step="0.05"')}
        </form>
        <p class="rl-note">L·F 칸은 위에서 고른 인원 구간·산출물 형태의 값만 바꿉니다. 다른 구간을 바꾸려면 위 값을 먼저 바꾸세요.</p>
        <div class="row rl-btns"><button type="button" class="btn sm" data-act="rulesDraftReset" ${changed.length ? '' : 'disabled'}>변경안 되돌리기</button></div>
        ${changeForm(changed)}
      </details>
    </section>`;
  }

  function changeForm(changed) {
    const calibDone = S.rewardRules.some((r) => r.kind === '보정');
    return `<form class="form rl-change" data-form="rulesChange" style="margin-top:12px">
      <p class="rl-p wide" style="margin:0"><b>변경안을 이력에 기록</b> — 적용일은 내일 이후만 고를 수 있습니다(과거 확정분 소급 없음).</p>
      <label class="f">구분<select name="kind"><option value="보정" ${calibDone ? 'disabled' : ''}>운영 2주 후 1회 보정${calibDone ? ' (완료)' : ''}</option><option value="변경" ${calibDone ? 'selected' : ''}>일반 변경</option></select></label>
      <label class="f">적용일<input type="date" name="effective_from" min="${dayStr(1)}" value="${dayStr(1)}" required></label>
      <label class="f wide">사유<input type="text" name="reason" required placeholder="예: 2주 운영 결과 F(코드) 산정값이 과대해 1.8→1.6"></label>
      <div class="wide"><button class="btn primary sm" ${changed.length ? '' : 'disabled'}>변경 이력에 기록</button>${changed.length ? '' : ' <span class="rl-note">계수를 하나 이상 바꾸면 기록할 수 있습니다.</span>'}</div>
    </form>`;
  }

  function calibPanel() {
    const start = S.rewardRules[0].effective_from; const due = MOCK.D(days(S.today, start) + 14);
    const left = days(S.today, due); const done = S.rewardRules.find((r) => r.kind === '보정');
    const ach = S.achievements; const negos = ach.flatMap((a) => a.negotiations);
    const avg = ach.length ? ach.reduce((t, a) => t + a.value_won, 0) / ach.length : 0;
    const acc = negos.length ? Math.round(100 * negos.filter((x) => x.verdict !== '거절').length / negos.length) : null;
    return `<section class="panel rl-calib ${done ? 'is-done' : ''}" aria-labelledby="h-rl-calib">
      <h3 id="h-rl-calib">운영 2주 후 1회 보정 ${done ? '<span class="pill st-done">기록됨</span>' : `<span class="pill ${left <= 3 ? 'p-high' : ''}">${left > 0 ? 'D-' + left : left === 0 ? '오늘' : 'D+' + -left}</span>`}</h3>
      <p class="rl-p">${done ? `${esc(done.version)} 보정을 ${md(done.effective_from)}부터 적용합니다. 보정은 1회만 하며, 이후 변경은 ‘일반 변경’으로 기록합니다.` : `기준 시작일 ${md(start)} → 보정 예정일 <b>${md(due)}</b>. 그날까지 쌓인 산정값 분포를 보고 계수를 한 번만 조정합니다.`}</p>
      <div class="rl-stats">
        <div><span class="rl-lab">평가 건수 ${badge('측정')}</span><b class="num">${ach.length}건</b></div>
        <div><span class="rl-lab">평균 V ${badge('추정')}</span><b class="num">${kwon(avg)}천원</b></div>
        <div><span class="rl-lab">협상 수용률 ${badge('측정')}</span><b class="num">${acc == null ? '-' : acc + '%'}</b></div>
      </div>
      <p class="rl-note">점검 항목: 계수별 이상치(특정 F·L에 몰림), 협상 수용률, 회장 체감과의 차이. 시뮬레이터에서 변경안을 넣어 효과를 확인한 뒤 기록합니다.</p>
    </section>`;
  }

  function coefTables() {
    return `<div class="grid2 rl-tables">
      <div><h4>L · 레버리지(영향 인원)</h4><div class="tbl-wrap"><table><thead><tr><th>영향 인원</th><th class="r">L</th></tr></thead><tbody>${L_TABLE.map((r) => `<tr><td>${r[2]}</td><td class="r num">${r[1].toFixed(1)}</td></tr>`).join('')}</tbody></table></div></div>
      <div><h4>F · 산출물 형태 <span class="rl-note">(여러 형태면 높은 쪽)</span></h4><div class="tbl-wrap"><table><thead><tr><th>형태</th><th class="r">F</th></tr></thead><tbody>${Object.values(F_TYPES).map((v) => `<tr><td>${v[0]}</td><td class="r num">${v[1].toFixed(1)}</td></tr>`).join('')}</tbody></table></div></div>
      <div><h4>S · 속도 보상</h4><div class="tbl-wrap"><table><thead><tr><th>실제 T ÷ 예상 E</th><th class="r">S</th></tr></thead><tbody>${[[1, '같거나 늦음'], [0.75, '75%'], [0.5, '50%'], [0.25, '25%'], [0, '0%(상한)']].map(([p, l]) => `<tr><td>${l}</td><td class="r num">${(Math.min(1.5, 1 + 0.5 * (1 - p))).toFixed(3).replace(/0+$/, '').replace(/\.$/, '.0')}</td></tr>`).join('')}</tbody></table></div></div>
      <div><h4>A · N · B 상한</h4><div class="tbl-wrap"><table><tbody>
        <tr><td>A 에이전트로 완료</td><td class="r num">1.2</td></tr><tr><td>A 직접 수행</td><td class="r num">1.0</td></tr>
        <tr><td>N 협상계수</td><td class="r num">1.0~1.3</td></tr><tr><td>표준 시간가치</td><td class="r num">${won(HOUR_VALUE)}원/h</td></tr><tr><td>유효개월 상한</td><td class="r num">12개월</td></tr>
      </tbody></table></div></div>
    </div>`;
  }

  function negoPanel() {
    const f = S.ui.rulesNegoF || '전체';
    const real = S.achievements.flatMap((a) => a.negotiations.map((n, i, arr) => ({ ...n, title: a.title, n_before: i ? arr[i - 1].n_after : 1.0, sample: false })));
    const all = [...real, ...S.rulesExtra.negoSamples.map((n) => ({ ...n, sample: true }))];
    const list = all.filter((n) => f === '전체' || n.verdict === f).sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));
    const cnt = (v) => all.filter((n) => n.verdict === v).length;
    const vp = (v) => `<span class="pill ${v === '수용' ? 'st-done' : v === '부분수용' ? 'st-wait' : 'p-urgent'}">${v}</span>`;
    return `<section class="panel" id="rl-log" aria-labelledby="h-rl-log">
      <h3 id="h-rl-log">협상 로그 전문 <span class="rl-note">총 ${all.length}건 · 수용 ${cnt('수용')} · 부분수용 ${cnt('부분수용')} · 거절 ${cnt('거절')}</span></h3>
      <div class="seg rl-seg" role="group" aria-label="판정 필터">${['전체', ...VERDICTS].map((v) => `<button type="button" data-act="rulesNegoF" data-v="${v}" aria-pressed="${v === f}">${v}</button>`).join('')}</div>
      ${list.length ? list.map((n) => `<article class="nego rl-nego">
          <div class="rl-nego-h"><b>${esc(n.title)}</b><span class="row">${n.sample ? '<span class="pill">샘플</span>' : ''}${vp(n.verdict)}<span class="rl-note num">${n.round}차 · ${md(n.created_at)} · N ${(+n.n_before).toFixed(2)} → ${n.n_after.toFixed(2)}</span></span></div>
          <p><span class="rl-who">회장</span>${esc(n.chairman_msg)}</p>
          <p><span class="rl-who ai">Claude</span>${esc(n.claude_reply)}</p>
        </article>`).join('') : guide('folder', '해당 판정의 협상 기록 없음', '성과·레벨 메뉴에서 평가 건에 이의를 제기하시면 대화 전문을 이곳에 남깁니다.')}
      ${real.length ? '' : '<p class="rl-note" style="margin-top:8px">실제 협상 기록이 아직 없어 이해를 돕는 샘플만 보입니다.</p>'}
    </section>`;
  }

  function viewRules() {
    const cur = S.rewardRules.filter((r) => r.effective_from <= S.today).slice(-1)[0] || S.rewardRules[0];
    const hist = S.rewardRules.slice().sort((a, b) => (a.effective_from < b.effective_from ? 1 : -1));
    const ok = exampleOk();
    return `<div class="view-head"><div><h2>보상 기준</h2><p>계수를 바꾸면 적용일과 사유를 남기고, 과거 확정분은 소급하지 않습니다.</p></div>
        <div class="row"><span class="pill st-done">현재 ${esc(cur.version)}</span><span class="pill ${ok ? 'st-done' : 'p-urgent'}">${ok ? '공식 예시 재현 ✓' : '공식 예시 불일치'}</span></div></div>
      <nav class="rl-jump" aria-label="이 화면 바로가기">${[['rl-formula', '공식·계수표'], ['rl-sim', '시뮬레이터'], ['rl-rule', '협상 규칙'], ['rl-hist', '변경 이력'], ['rl-log', '협상 로그']].map(([id, l]) => `<button type="button" class="btn sm" data-act="rulesJump" data-v="${id}">${l}</button>`).join('')}</nav>
      <section class="panel" id="rl-formula" aria-labelledby="h-rl-f"><h3 id="h-rl-f">산정 공식</h3><div class="formula">수익가치 V = B × L × F × S × A × N   (천원 단위 반올림)</div>
        <dl class="rl-dl">
          <div><dt>B</dt><dd><b>기본 예상가치</b> — <b>1인 기준</b> 월 효과 × 유효개월(상한 12). 월 효과 = 절감시간 × ${won(HOUR_VALUE)}원/시간 + 월 매출·이익 기여 + 월 비용절감. 1회성은 1개월분만.</dd></div>
          <div><dt>L</dt><dd><b>레버리지</b> — 영향 인원 구간별 1.0~10.0</dd></div>
          <div><dt>F</dt><dd><b>산출물 형태</b> — 문서 1.0 ~ AI 고도화+코드 2.0</dd></div>
          <div><dt>S</dt><dd><b>속도 보상</b> — <code>1 + 0.5 × max(0, (E − T) / E)</code>, 최대 1.5. 늦어도 감점 없음.</dd></div>
          <div><dt>A</dt><dd><b>에이전트 수행</b> — 에이전트로 완료 1.2 / 직접 1.0</dd></div>
          <div><dt>N</dt><dd><b>협상계수</b> — 기본 1.0, 협상으로 최대 1.3. 상향만 가능.</dd></div>
        </dl>
        <p class="rl-p"><b>이중 반영 방지</b> · 영향 인원의 효과는 L로만 반영합니다. B에 전원 절감시간을 넣고 L을 또 곱하지 않습니다.</p>
        <div class="rl-example"><b>산정 예시</b> 본사 100명 × 1인 월 1시간 절감 AI+코드 프로그램, 예상 240분 → 에이전트로 120분<br><span class="num">B 360,000원 × L 8.0 × F 2.0 × S 1.25 × A 1.2 × N 1.0 = <b>8,640천원</b></span> ${ok ? '<span class="pill st-done">계산기 재현 ✓</span>' : '<span class="pill p-urgent">계산기 불일치</span>'}</div>
        <h3 style="margin-top:18px">계수표</h3>
        ${coefTables()}
      </section>
      ${simPanel()}
      <div class="grid2">
        <section class="panel" id="rl-rule" aria-labelledby="h-rl-r"><h3 id="h-rl-r">협상 규칙</h3><ol class="rl-ol">
          <li>회장이 근거(실측 데이터, 영향 인원 증빙, 재사용 가능성)를 내면 Claude가 <b>수용 / 부분수용 / 거절</b>과 사유를 답합니다.</li>
          <li>건당 <b>3회</b>까지, N 상한 <b>1.3</b>. 상향만 가능합니다.</li>
          <li>근거 없이 올리지 않으며, 판단 기준을 매번 적습니다.</li>
          <li>L·F로 이미 반영된 내용은 N으로 다시 올리지 않습니다(이중 반영 금지).</li>
          <li>확정 후에는 협상할 수 없고, 계수가 바뀌어도 확정분은 다시 계산하지 않습니다.</li>
        </ol></section>
        ${calibPanel()}
      </div>
      <section class="panel" id="rl-hist" aria-labelledby="h-rl-h"><h3 id="h-rl-h">변경 이력 <span class="rl-note">과거 확정분 소급 없음</span></h3>
        <div class="tbl-wrap"><table class="rl-hist"><thead><tr><th>버전</th><th>적용일</th><th>구분</th><th>바뀐 계수</th><th>사유</th></tr></thead><tbody>${hist.map((r) => `<tr><td><b>${esc(r.version)}</b> ${r.effective_from > S.today ? '<span class="pill st-wait">예정</span>' : r === cur ? '<span class="pill st-done">적용 중</span>' : ''}</td><td class="num">${esc(r.effective_from)}</td><td>${esc(r.kind || '최초')}</td><td>${r.changes && r.changes.length ? r.changes.map(esc).join('<br>') : '-'}</td><td>${esc(r.reason)}</td></tr>`).join('')}</tbody></table></div>
        ${S.rewardRules.length > 1 ? '<div class="row rl-btns"><button type="button" class="btn sm" data-act="rulesUndo">마지막 기록 취소(목업)</button></div>' : ''}
      </section>
      ${negoPanel()}`;
  }
  APP.views.rules = viewRules;

  /* ---------- 동작 ---------- */
  APP.acts.rulesExample = () => { S.ui.rulesSim = clone(EXAMPLE); toast('공식 예시 값을 넣었습니다'); };
  APP.acts.rulesClear = () => { S.ui.rulesSim = { saved_hours: 0, monthly_revenue: 0, monthly_cost: 0, months: 1, one_off: false, headcount: 1, output_type: 'doc', est_minutes: 60, actual_minutes: null, by_agent: false, N: 1 }; };
  APP.acts.rulesDraftReset = () => { S.ui.rulesDraft = clone(BASE); S.ui.rulesDraftOpen = true; };
  APP.acts.rulesNegoF = (el) => { S.ui.rulesNegoF = el.dataset.v; };
  APP.acts.rulesJump = (el) => { setTimeout(() => { const t = document.getElementById(el.dataset.v); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 0); };
  APP.acts.rulesUndo = () => { const r = S.rewardRules.pop(); toast(`${r.version} 기록을 취소했습니다`); };
  APP.forms.rulesChange = (fd) => {
    const g = (k) => (fd.get(k) || '').toString().trim();
    const eff = g('effective_from'); const changes = draftDiff(S.ui.rulesDraft);
    if (!changes.length) { toast('바뀐 계수가 없습니다'); return; }
    if (!eff || eff <= S.today) { toast('적용일은 내일 이후여야 합니다(소급 없음)'); return; }
    const kind = g('kind') === '보정' && !S.rewardRules.some((r) => r.kind === '보정') ? '보정' : '변경';
    const last = S.rewardRules[S.rewardRules.length - 1].version.replace('v', '').split('.').map(Number);
    const version = `v${last[0]}.${last[1] + 1}`;
    S.rewardRules.push({ version, effective_from: eff, reason: g('reason'), kind, changes, draft: clone(S.ui.rulesDraft) });
    S.ui.rulesDraft = clone(BASE); S.ui.rulesDraftOpen = false;
    toast(`${version} 기록 — ${md(eff)}부터 적용 예정(목업)`);
  };

  /* 시뮬레이터: 입력할 때마다 결과 영역만 다시 그린다(입력 칸 포커스 유지) */
  const numOrNull = (v) => (v === '' || v == null ? null : +v);
  function readSim(form) {
    const fd = new FormData(form); const s = S.ui.rulesSim;
    s.saved_hours = Math.max(0, +fd.get('saved_hours') || 0);
    s.monthly_revenue = Math.max(0, +fd.get('monthly_revenue') || 0);
    s.monthly_cost = Math.max(0, +fd.get('monthly_cost') || 0);
    s.one_off = fd.get('one_off') != null;
    if (fd.has('months')) s.months = Math.min(12, Math.max(1, Math.round(+fd.get('months') || 1)));
    s.headcount = Math.max(1, Math.round(+fd.get('headcount') || 1));
    s.output_type = fd.get('output_type');
    s.est_minutes = Math.max(0, +fd.get('est_minutes') || 0);
    const t = numOrNull(fd.get('actual_minutes')); s.actual_minutes = t == null ? null : Math.max(0, t);
    s.by_agent = fd.get('by_agent') === '1';
    s.N = Math.min(1.3, Math.max(1, +fd.get('N') || 1));
  }
  function readDraft(form) {
    const fd = new FormData(form); const d = S.ui.rulesDraft; const s = S.ui.rulesSim;
    const pos = (k, min, def) => { const v = numOrNull(fd.get(k)); return v == null || isNaN(v) ? def : Math.max(min, v); };
    d.hour = pos('hour', 0, BASE.hour); d.cap = Math.round(pos('cap', 1, BASE.cap));
    d.L[tierIdx(+s.headcount || 1)] = pos('L', 0, BASE.L[tierIdx(+s.headcount || 1)]);
    d.F[s.output_type] = pos('F', 0, BASE.F[s.output_type]);
    d.slope = pos('slope', 0, BASE.slope); d.smax = pos('smax', 1, BASE.smax); d.agent = pos('agent', 1, BASE.agent); d.nmax = pos('nmax', 1, BASE.nmax);
  }
  function refresh(form) {
    const box = $('#rl-result'); if (box) box.innerHTML = simResult();
    // 구간·형태 이름이 바뀌는 라벨, 1회성 시 유효개월 비활성, 변경안 기록 버튼 상태를 맞춘다
    const view = form.closest('#rl-sim'); if (!view) return;
    const s = S.ui.rulesSim; const ti = tierIdx(+s.headcount || 1); const d = S.ui.rulesDraft;
    const m = view.querySelector('[name=months]'); if (m) m.disabled = s.one_off;
    const hc = view.querySelector('[name=headcount]'); if (hc) hc.parentElement.firstChild.textContent = `영향 인원(명) → L ${L_TABLE[ti][1].toFixed(1)}`;
    const dl = view.querySelector('[data-rl=draft] [name=L]'); if (dl && form.dataset.rl === 'sim') { dl.parentElement.firstChild.textContent = `L · ${L_TABLE[ti][2]} 구간`; dl.value = d.L[ti]; }
    const df = view.querySelector('[data-rl=draft] [name=F]'); if (df && form.dataset.rl === 'sim') { df.parentElement.firstChild.textContent = `F · ${F_TYPES[s.output_type][0]}`; df.value = d.F[s.output_type]; }
    const n = draftDiff(d).length;
    const sum = view.querySelector('.rl-draft-box > summary'); if (sum) sum.innerHTML = `계수 바꿔 보기 (변경안) ${n ? `<span class="pill st-wait">${n}개 변경</span>` : ''}`;
    view.querySelectorAll('[data-act=rulesDraftReset], .rl-change button').forEach((b) => { b.disabled = !n; });
    const hint = view.querySelector('.rl-change .rl-note'); if (hint) hint.hidden = !!n;
    APP.save();
  }
  document.addEventListener('input', (e) => {
    const form = e.target.closest && e.target.closest('form[data-rl]'); if (!form) return;
    if (form.dataset.rl === 'sim') readSim(form); else readDraft(form);
    refresh(form);
  });
  document.addEventListener('toggle', (e) => { if (e.target.classList && e.target.classList.contains('rl-draft-box')) S.ui.rulesDraftOpen = e.target.open; }, true);
})();
