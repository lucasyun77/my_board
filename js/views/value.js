/* 메뉴: 성과·레벨 (value) — 이 메뉴 담당 하위 세션은 이 파일만 고칩니다.
   공용 도구·상태는 window.APP에서 꺼내 씁니다. 새 버튼 동작은 APP.acts['이름'] = (el) => {...},
   새 폼은 APP.forms['이름'] = (fd, form) => {...}, 새 select 변경은 APP.changes['이름'] = (el) => {...} 로 등록합니다.
   할 일 등록·시간 측정·완료 입력은 '오늘 할 일' 메뉴 담당. 이 메뉴는 평가 이후(협상 → 확정 → 적립 → 레벨업)만 다룹니다. */
(function () {
  'use strict';
  const { S, LEVEL_COST, F_TYPES, esc, won, kwon, md, badge, uid, toast, evaluate, dayStr, guide } = window.APP;

  const N_MAX = 1.3;
  const NEGO_MAX = 3;
  const PERIODS = [['당일', 0, '오늘'], ['주간', -6, '최근 7일'], ['월간', -29, '최근 30일'], ['분기', -89, '최근 90일'], ['누적', null, '전체']];
  const periodFrom = (name) => { const p = PERIODS.find((x) => x[0] === name); return !p || p[1] == null ? '0000' : dayStr(p[1]); };
  const isDone = (a) => a.status === '확정';
  const vOf = (a, N) => Math.round((a.B * a.L * a.F * a.S * a.A * N) / 1000) * 1000;
  const ui = () => (S.ui.value = Object.assign({ period: '누적', status: 'all', type: '', sort: 'open', ask: null, askLv: false }, S.ui.value || {}));

  /* ---------- 추가 샘플(한 번만) : 기간별 합계·필터·레벨업 이력이 살아 보이도록 ---------- */
  if (!S.valueSeeded) {
    const mk = (o) => evaluate(Object.assign({ output_url: '#', monthly_revenue: 0, monthly_cost: 0, one_off: false, N: 1, negotiations: [], status: '평가중' }, o));
    const extra = [
      mk({ id: 'va1', title: '[예시] 가맹점 발주 엑셀 자동 집계 스킬', date: dayStr(0), output_type: 'ai', headcount: 6, by_agent: false, saved_hours: 2, months: 6, est_minutes: 90, actual_minutes: 60, status: '확정', confirmed_at: dayStr(0) }),
      mk({ id: 'va2', title: '[예시] 벌툰 가맹 상담 FAQ 문서', date: dayStr(-5), output_type: 'doc', headcount: 12, by_agent: false, saved_hours: 0.5, months: 12, est_minutes: 60, actual_minutes: 60, N: 1.1, status: '확정', confirmed_at: dayStr(-4),
        negotiations: [{ round: 1, chairman_msg: '상담팀 12명이 실측으로 1인당 월 40분 줄었고, 가맹 상담 매장 30곳에서도 재사용합니다.', claude_reply: '충족: 수치·증빙·적용 범위. 근거가 갖춰져 요청을 그대로 반영합니다. 확정 후 2주 안에 실측 자료를 붙여 주세요. (목업 규칙 심사)', verdict: '수용', requested: 0.1, n_after: 1.1, created_at: dayStr(-5) }] }),
      mk({ id: 'va3', title: '[예시] 분기 비용 리포트 자동화 코드', date: dayStr(-21), output_type: 'code', headcount: 3, by_agent: true, saved_hours: 3, months: 12, est_minutes: 180, actual_minutes: 120, status: '확정', confirmed_at: dayStr(-20) }),
      mk({ id: 'va4', title: '[예시] 생전포차 원가표 정리', date: dayStr(-61), output_type: 'doc', headcount: 1, by_agent: false, saved_hours: 2, months: 6, est_minutes: 120, actual_minutes: 150, status: '확정', confirmed_at: dayStr(-60) }),
      mk({ id: 'va5', title: '[예시] 신규 점주 교육 영상 대본', date: dayStr(-152), output_type: 'ai', headcount: 40, by_agent: true, saved_hours: 1, months: 3, est_minutes: 240, actual_minutes: 240, status: '확정', confirmed_at: dayStr(-150) }),
      mk({ id: 'vp1', title: '[예시] 경영회의 안건 자동 정리 스킬', date: dayStr(0), output_type: 'ai', headcount: 15, by_agent: true, saved_hours: 1, months: 12, est_minutes: 120, actual_minutes: 90 }),
      mk({ id: 'vp2', title: '[예시] 블랙라벨 메뉴 원가 시뮬레이터', date: dayStr(-2), output_type: 'ai_code', headcount: 8, by_agent: false, saved_hours: 0.5, monthly_cost: 200000, months: 6, est_minutes: 240, actual_minutes: 300, N: 1.05, status: '협상중',
        negotiations: [{ round: 1, chairman_msg: '원가 계산이 빨라져서 효과가 더 큽니다.', claude_reply: '충족: 적용 범위. 부족: 수치·증빙. 방향은 타당하나 근거가 부족해 일부만 반영합니다. 실측 수치를 붙여 다시 요청해 주세요. (목업 규칙 심사)', verdict: '부분수용', requested: 0.1, n_after: 1.05, created_at: dayStr(-2) }] })
    ];
    S.achievements.push(...extra.filter((a) => !S.achievements.some((x) => x.id === a.id)));
    const total = S.achievements.filter(isDone).reduce((s, a) => s + a.value_won, 0);
    const past = [['va4', -58], ['va3', -19], ['va3', -10]];
    let run = 0; let bal = 0;
    const seeded = past.map(([, d], i) => {
      const at = dayStr(d);
      bal = S.achievements.filter((a) => isDone(a) && a.confirmed_at <= at).reduce((s, a) => s + a.value_won, 0) - run - LEVEL_COST;
      run += LEVEL_COST;
      return { id: 'vlu' + i, spent_won: LEVEL_COST, level_after: i + 2, at, balance_after: bal };
    });
    const mine = (S.levelUps || []).filter((l) => !String(l.id).startsWith('vlu'));
    S.levelUps = [...seeded, ...mine.map((l, i) => Object.assign(l, { level_after: seeded.length + 2 + i }))];
    S.wallet.total_won = total;
    S.wallet.level = 1 + S.levelUps.length;
    S.wallet.balance_won = total - LEVEL_COST * S.levelUps.length;
    S.valueSeeded = true;
  }

  /* ---------- 협상 심사(목업 규칙). 실서비스에서는 Claude 평가 API로 바뀝니다 ---------- */
  function judge(msg, requested) {
    const crit = [['수치', /\d/.test(msg)], ['증빙', /실측|측정|로그|증빙|데이터|자료|기록/.test(msg)], ['적용 범위', /명|인원|가맹|매장|재사용|확산|부서|본사/.test(msg)]];
    const met = crit.filter((c) => c[1]).map((c) => c[0]);
    const miss = crit.filter((c) => !c[1]).map((c) => c[0]);
    const score = met.length + (msg.length >= 20 ? 1 : 0);
    const head = (met.length ? `충족: ${met.join('·')}. ` : '') + (miss.length ? `부족: ${miss.join('·')}. ` : '');
    if (score >= 3 && met.length >= 2) return { verdict: '수용', inc: requested, reply: head + '근거가 갖춰져 요청을 그대로 반영합니다. 확정 후 2주 안에 실측 자료를 붙여 주세요.' };
    if (score >= 2) return { verdict: '부분수용', inc: Math.max(0.05, Math.floor(requested / 2 / 0.05) * 0.05), reply: head + '방향은 타당하나 근거가 부족해 일부만 반영합니다. 부족한 근거를 붙여 다시 요청해 주세요.' };
    return { verdict: '거절', inc: 0, reply: head + '근거가 없어 반영하지 않습니다. 기준: 실측 수치·증빙 자료·적용 범위(인원·매장·재사용).' };
  }

  /* ---------- 화면 조각 ---------- */
  const statusPill = (s) => `<span class="pill ${s === '확정' ? 'st-done' : s === '협상중' ? 'p-high' : 'st-wait'}">${s}</span>`;
  const verdictCls = { '수용': 'ok', '부분수용': 'part', '거절': 'no' };

  function levelPanel() {
    const w = S.wallet; const u = ui();
    const can = Math.floor(w.balance_won / LEVEL_COST);
    const pct = Math.min(100, 100 * (w.balance_won % LEVEL_COST) / LEVEL_COST);
    const pend = S.achievements.filter((a) => !isDone(a));
    const pendSum = pend.reduce((s, a) => s + a.value_won, 0);
    const hist = S.levelUps.slice().reverse();
    return `<section class="panel val-level" aria-labelledby="h-vlv">
      <h3 id="h-vlv" class="val-sr">레벨과 잔액</h3>
      <div class="val-lvgrid">
        <div class="val-lvmain">${ART.mascot(can ? 'key' : 'stand', 104)}
          <div><div class="small muted">현재 레벨 ${badge('추정')}</div><div class="val-big num">Lv.${w.level}</div>
            <div class="small muted">레벨업 ${S.levelUps.length}회 · 1회 ${kwon(LEVEL_COST)}천원</div></div></div>
        <div class="val-stat"><div class="small muted">사용 가능 잔액 ${badge('추정')}</div><div class="val-mid num">${kwon(w.balance_won)}<small>천원</small></div></div>
        <div class="val-stat"><div class="small muted">누적 확정 ${badge('추정')}</div><div class="val-mid num">${kwon(w.total_won)}<small>천원</small></div></div>
        <div class="val-stat"><div class="small muted">확정 대기 ${pend.length}건 ${badge('추정')}</div><div class="val-mid num">${kwon(pendSum)}<small>천원</small></div></div>
      </div>
      <div class="val-next">
        <div class="small">${can ? `<b>지금 ${can}회 레벨업할 수 있습니다.</b> 다음 레벨까지는 잔액 ${kwon(LEVEL_COST)}천원이 필요합니다.` : `다음 레벨까지 <b class="num">${kwon(LEVEL_COST - w.balance_won)}천원</b> 남았습니다.`}</div>
        <div class="bar est" role="progressbar" aria-label="다음 레벨 진행률" aria-valuenow="${Math.round(can ? 100 : pct)}" aria-valuemin="0" aria-valuemax="100"><i style="width:${can ? 100 : pct}%"></i></div>
        ${u.askLv ? `<div class="val-ask" role="alert"><span>${kwon(LEVEL_COST)}천원을 써서 Lv.${w.level + 1}로 올립니다. 잔액 ${kwon(w.balance_won)} → ${kwon(w.balance_won - LEVEL_COST)}천원.</span>
            <span class="row"><button type="button" class="btn primary sm" data-act="vLevelUp">레벨업</button>${can > 1 ? `<button type="button" class="btn sm" data-act="vLevelUp" data-v="all">${can}회 모두 (Lv.${w.level + can})</button>` : ''}<button type="button" class="btn sm" data-act="vAskLv" data-v="0">취소</button></span></div>`
          : `<div class="row"><button type="button" class="btn primary" data-act="vAskLv" data-v="1" ${can ? '' : 'disabled'}>${kwon(LEVEL_COST)}천원 사용해 레벨업</button></div>`}
      </div>
      <details class="val-hist"><summary>레벨업 이력 ${S.levelUps.length}건</summary>
        ${hist.length ? `<div class="tbl-wrap"><table><thead><tr><th>레벨</th><th>일자</th><th class="r">사용</th><th class="r">사용 후 잔액</th></tr></thead><tbody>
          ${hist.map((l) => `<tr><td><b>Lv.${l.level_after}</b></td><td class="num">${l.at}</td><td class="r num">${kwon(l.spent_won)}천원</td><td class="r num">${l.balance_after != null ? kwon(l.balance_after) + '천원' : '-'}</td></tr>`).join('')}
        </tbody></table></div>` : '<p class="small muted">아직 레벨업 기록이 없습니다.</p>'}
      </details>
    </section>`;
  }

  function periodPanel() {
    const u = ui();
    return `<section class="panel" aria-labelledby="h-vper"><h3 id="h-vper">기간별 확정 수익가치 ${badge('추정')}<span class="small muted val-hint">누르면 아래 목록이 그 기간으로 걸러집니다</span></h3>
      <div class="val-periods">${PERIODS.map(([name, , sub]) => {
        const from = periodFrom(name);
        const list = S.achievements.filter((a) => isDone(a) && a.confirmed_at >= from);
        const sum = list.reduce((s, a) => s + a.value_won, 0);
        return `<button type="button" class="val-per" data-act="vPeriod" data-v="${name}" aria-pressed="${u.period === name}">
          <span class="small"><b>${name}</b> <span class="muted">${sub}</span></span>
          <span class="val-mid num">${kwon(sum)}<small>천원</small></span>
          <span class="small muted">확정 ${list.length}건</span></button>`;
      }).join('')}</div></section>`;
  }

  function negoForm(a) {
    const used = a.negotiations.length;
    const room = +(N_MAX - a.N).toFixed(2);
    if (used >= NEGO_MAX || room <= 0) return `<p class="small muted val-note">${used >= NEGO_MAX ? '협상 3회를 모두 썼습니다.' : 'N이 상한 1.3에 도달했습니다.'} 확정만 남았습니다.</p>`;
    const opts = [0.05, 0.1, 0.15, 0.2, 0.3].filter((x) => x <= room + 1e-9);
    return `<form class="form val-nego" data-form="vNego" data-id="${a.id}">
      <label class="f wide">이의 제기 근거 <span class="muted">(${used}/${NEGO_MAX}회 사용 · N은 올리기만 가능, 상한 ${N_MAX.toFixed(1)})</span>
        <textarea name="msg" id="vn-${a.id}" rows="2" required placeholder="예: 실측 결과 1인당 월 1.5시간 절감, 가맹점 30곳 재사용 예정"></textarea></label>
      <label class="f">요청 N
        <select name="inc">${opts.map((x, i) => `<option value="${x}" ${i === Math.min(1, opts.length - 1) ? 'selected' : ''}>N ${(a.N + x).toFixed(2)} (+${x.toFixed(2)}) → ${kwon(vOf(a, a.N + x))}천원</option>`).join('')}</select></label>
      <div><button class="btn">협상 요청</button></div>
    </form>`;
  }

  function item(a) {
    const u = ui();
    const done = isDone(a);
    const coef = [['B', won(a.B) + '원', '기본가치'], ['L', a.L.toFixed(1), '영향 인원'], ['F', a.F.toFixed(1), '산출물'], ['S', a.S.toFixed(2), '속도'], ['A', a.A.toFixed(1), '에이전트'], ['N', a.N.toFixed(2), '협상']];
    const meta = [a.date ? `평가 ${md(a.date)}` : '', F_TYPES[a.output_type] ? F_TYPES[a.output_type][0] : '', a.headcount ? `영향 ${a.headcount}명` : '', a.est_minutes ? `예상 ${a.est_minutes}분 / 실제 ${a.actual_minutes ?? '-'}분` : ''].filter(Boolean);
    return `<article class="val-item ${done ? 'is-done' : ''}" aria-label="${esc(a.title)}">
      <div class="val-ihead">
        <div class="val-ititle"><b>${esc(a.title)}</b><div class="small muted">${meta.map(esc).join(' · ')}</div></div>
        <div class="val-ival">${statusPill(a.status)}<span class="val-mid num">${kwon(a.value_won)}<small>천원</small></span>${badge('추정')}</div>
      </div>
      <div class="coef">${coef.map(([k, v, t]) => `<div title="${t}"><div class="k">${k} <span class="val-kt">${t}</span></div><div class="v">${v}</div></div>`).join('')}</div>
      <details class="val-why" ${done ? '' : 'open'}><summary>산정 근거</summary><ul class="rationale">${a.rationale.map((r) => `<li>${esc(r)}</li>`).join('')}</ul></details>
      ${a.negotiations.length ? `<div class="val-log">${a.negotiations.map((n) => `<div class="nego"><span><b>회장 ${n.round}차</b>${n.requested ? ` <span class="muted small">(N +${n.requested.toFixed(2)} 요청)</span>` : ''} ${esc(n.chairman_msg)}</span>
        <span><b>Claude</b> <span class="val-vd ${verdictCls[n.verdict] || ''}">${n.verdict}</span> ${esc(n.claude_reply)} <b class="num">→ N ${n.n_after.toFixed(2)}</b></span></div>`).join('')}</div>` : ''}
      ${done ? `<p class="small muted val-note">확정 ${md(a.confirmed_at)} · 잔액에 ${kwon(a.value_won)}천원 적립됨 · 확정 후에는 협상할 수 없습니다.</p>`
        : `${negoForm(a)}
        <div class="val-confirm">${u.ask === a.id
          ? `<div class="val-ask" role="alert"><span><b>${kwon(a.value_won)}천원</b>으로 확정하고 잔액에 적립합니다. 확정 후에는 협상할 수 없습니다.</span><span class="row"><button type="button" class="btn primary sm" data-act="vConfirm" data-id="${a.id}">확정</button><button type="button" class="btn sm" data-act="vAsk" data-id="">취소</button></span></div>`
          : `<button type="button" class="btn primary" data-act="vAsk" data-id="${a.id}">이 금액으로 확정 → 잔액 적립</button>`}</div>`}
    </article>`;
  }

  function listPanel() {
    const u = ui();
    const from = periodFrom(u.period);
    const inPeriod = (a) => (isDone(a) ? a.confirmed_at : a.date || '9999') >= from;
    let list = S.achievements.filter(inPeriod);
    const cnt = { all: list.length, open: list.filter((a) => !isDone(a)).length, done: list.filter(isDone).length };
    if (u.status === 'open') list = list.filter((a) => !isDone(a));
    if (u.status === 'done') list = list.filter(isDone);
    if (u.type) list = list.filter((a) => a.output_type === u.type);
    const key = (a) => (isDone(a) ? a.confirmed_at : a.date) || '';
    const sorts = { new: (a, b) => key(b).localeCompare(key(a)), old: (a, b) => key(a).localeCompare(key(b)), high: (a, b) => b.value_won - a.value_won, low: (a, b) => a.value_won - b.value_won, open: (a, b) => (isDone(a) - isDone(b)) || key(b).localeCompare(key(a)) };
    list = list.slice().sort(sorts[u.sort] || sorts.new);
    const sum = list.reduce((s, a) => s + a.value_won, 0);
    const seg = [['all', '전체'], ['open', '확정 대기'], ['done', '확정']];
    return `<section class="panel" aria-labelledby="h-vlist">
      <div class="val-lhead"><h3 id="h-vlist">평가 건 <span class="muted small">${u.period === '누적' ? '전체 기간' : `${u.period}(${PERIODS.find((p) => p[0] === u.period)[2]})`}</span></h3>
        <button type="button" class="btn sm" data-act="tab" data-v="today">새 평가는 오늘 할 일에서 →</button></div>
      <div class="val-filters">
        <span class="seg" role="group" aria-label="상태">${seg.map(([k, l]) => `<button type="button" data-act="vFilt" data-k="status" data-v="${k}" aria-pressed="${u.status === k}">${l} ${cnt[k]}</button>`).join('')}</span>
        <label class="val-sel"><span class="val-sr">산출물 형태</span><select data-act="vSel" data-k="type" aria-label="산출물 형태"><option value="">모든 산출물</option>${Object.entries(F_TYPES).map(([k, v]) => `<option value="${k}" ${u.type === k ? 'selected' : ''}>${v[0]} (F ${v[1].toFixed(1)})</option>`).join('')}</select></label>
        <label class="val-sel"><span class="val-sr">정렬</span><select data-act="vSel" data-k="sort" aria-label="정렬">${[['new', '최근순'], ['old', '오래된순'], ['high', '금액 높은순'], ['low', '금액 낮은순'], ['open', '확정 대기 먼저']].map(([k, l]) => `<option value="${k}" ${u.sort === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        ${u.status !== 'all' || u.type || u.period !== '누적' || u.sort !== 'open' ? '<button type="button" class="btn sm" data-act="vReset">조건 지우기</button>' : ''}
      </div>
      <p class="small muted val-sum">${list.length}건 · 합계 <b class="num">${kwon(sum)}천원</b> ${badge('추정')} <span>· 목업은 Claude 평가 자리를 규칙 계산으로 대신합니다.</span></p>
      ${list.length ? list.map(item).join('') : guide('folder', '조건에 맞는 평가 건이 없습니다', '기간이나 상태 조건을 바꾸거나, 오늘 할 일에서 완료 입력을 하시면 이곳에 평가 건이 생깁니다.')}
    </section>`;
  }

  function viewValue() {
    ui();
    return `<div class="view-head"><div><h2>성과 수익가치 · 레벨</h2><p>V = B × L × F × S × A × N (천원 단위 반올림) · 평가 → 협상 → 확정 → 잔액 적립 → ${kwon(LEVEL_COST)}천원마다 레벨업</p></div>
        <button type="button" class="btn sm" data-act="tab" data-v="rules">보상 기준 보기 →</button></div>
      ${levelPanel()}${periodPanel()}${listPanel()}`;
  }

  /* ---------- 동작 ---------- */
  APP.acts.vPeriod = (el) => { const u = ui(); u.period = el.dataset.v; };
  APP.acts.vFilt = (el) => { ui()[el.dataset.k] = el.dataset.v; };
  APP.changes.vSel = (el) => { ui()[el.dataset.k] = el.value; };
  APP.acts.vReset = () => { Object.assign(ui(), { period: '누적', status: 'all', type: '', sort: 'open' }); };
  APP.acts.vAsk = (el) => { ui().ask = el.dataset.id || null; };
  APP.acts.vAskLv = (el) => { ui().askLv = el.dataset.v === '1'; };
  APP.acts.vConfirm = (el) => {
    const a = S.achievements.find((x) => x.id === el.dataset.id); if (!a || isDone(a)) return;
    a.status = '확정'; a.confirmed_at = S.today;
    S.wallet.balance_won += a.value_won; S.wallet.total_won += a.value_won;
    ui().ask = null;
    toast(`${kwon(a.value_won)}천원을 잔액에 적립했습니다`);
  };
  APP.acts.vLevelUp = (el) => {
    const w = S.wallet; let n = el.dataset.v === 'all' ? Math.floor(w.balance_won / LEVEL_COST) : 1;
    if (w.balance_won < LEVEL_COST) return;
    const from = w.level;
    while (n-- > 0 && w.balance_won >= LEVEL_COST) {
      w.balance_won -= LEVEL_COST; w.level += 1;
      S.levelUps.push({ id: uid('lu'), spent_won: LEVEL_COST, level_after: w.level, at: S.today, balance_after: w.balance_won });
    }
    ui().askLv = false;
    toast(w.level - from > 1 ? `Lv.${from} → Lv.${w.level} 달성` : `Lv.${w.level} 달성`);
  };
  APP.forms.vNego = (fd, form) => {
    const a = S.achievements.find((x) => x.id === form.dataset.id);
    const msg = (fd.get('msg') || '').toString().trim();
    if (!a || isDone(a) || !msg || a.negotiations.length >= NEGO_MAX) return;
    const room = +(N_MAX - a.N).toFixed(2);
    const req = Math.min(room, Math.max(0.05, +fd.get('inc') || 0.05));
    const j = judge(msg, req);
    const before = a.value_won;
    const nAfter = Math.min(N_MAX, +(a.N + Math.min(j.inc, room)).toFixed(2));
    a.negotiations.push({ round: a.negotiations.length + 1, chairman_msg: msg, claude_reply: j.reply + ' (목업 규칙 심사)', verdict: j.verdict, requested: req, n_after: nAfter, created_at: S.today });
    a.N = nAfter; a.status = '협상중'; evaluate(a);
    toast(`${j.verdict}: ${kwon(before)} → ${kwon(a.value_won)}천원`);
  };

  APP.views.value = viewValue;
})();
