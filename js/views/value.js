/* 메뉴: 성과·레벨 (value) — 이 메뉴 담당 하위 세션은 이 파일만 고칩니다.
   공용 도구·상태는 window.APP에서 꺼내 씁니다. 새 버튼 동작은 APP.acts['이름'] = (el) => {...},
   새 폼은 APP.forms['이름'] = (fd, form) => {...}, 새 select 변경은 APP.changes['이름'] = (el) => {...} 로 등록합니다.
   할 일 등록·시간 측정·완료 입력은 '오늘 할 일' 메뉴 담당. 이 메뉴는 평가 이후(협상 → 확정 → 적립 → 레벨업)만 다룹니다. */
(function () {
  'use strict';
  const { S, LEVEL_COST, F_TYPES, L_TABLE, esc, won, kwon, md, badge, uid, toast, evaluate, dayStr, guide } = window.APP;

  const N_MAX = 1.3;
  const NEGO_MAX = 3;
  const PERIODS = [['당일', 0, '오늘'], ['주간', -6, '최근 7일'], ['월간', -29, '최근 30일'], ['분기', -89, '최근 90일'], ['누적', null, '전체']];
  const periodFrom = (name) => { const p = PERIODS.find((x) => x[0] === name); return !p || p[1] == null ? '0000' : dayStr(p[1]); };
  const isDone = (a) => a.status === '확정';
  const vOf = (a, N) => Math.round((a.B * a.L * a.F * a.S * a.A * N) / 1000) * 1000;
  const ui = () => (S.ui.value = Object.assign({ period: '누적', status: 'all', type: '', sort: 'open', ask: null, askLv: false, tab: 'list', evalOpen: null }, S.ui.value || {}));

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

  if (S.ui.value) S.ui.value.celebrate = null; // 축하 카드는 새로 열 때 남지 않게

  /* ---------- 메뉴 연결 약속: 활동 기록·받은 항목 ---------- */
  S.activity = S.activity || [];
  S.inbox = S.inbox || [];
  function logAct(type, text, ref) {
    S.activity.push({ id: uid('ac'), at: new Date().toISOString(), menu: 'value', type, text, ref: ref || null });
    if (S.activity.length > 300) S.activity.splice(0, S.activity.length - 300);
  }
  if (!S.valueInboxSeeded) {
    const seedAt = (d, h) => dayStr(d) + `T0${h}:00:00.000Z`;
    [{ id: 'vib1', at: seedAt(0, 1), from: 'today', to: 'value', kind: '할 일 완료', title: '[예시] 가맹점 주간 매출 요약 자동 메일', payload: { est_minutes: 90, actual_minutes: 70, by_agent: true, output_type: 'ai' }, done: false },
      { id: 'vib2', at: seedAt(-1, 8), from: 'directives', to: 'value', kind: '지시 완료', title: '[예시] 분기 비용 집행 현황 1장 요약', payload: { est_minutes: 60, actual_minutes: null, output_type: 'doc', ref: 'd7' }, done: false }]
      .forEach((x) => { if (!S.inbox.some((y) => y.id === x.id)) S.inbox.push(x); });
    S.valueInboxSeeded = true;
  }
  const FROM_NAME = { today: '오늘 할 일', directives: '지시 관리', ideas: '신사업', learn: '경영학습', ops: '경영 현황', ai: 'AI 사용', ideabank: '아이디어뱅크', numbers: '내가 보는 숫자' };
  const myInbox = () => S.inbox.filter((x) => x.to === 'value' && !x.done);

  /* ---------- 커리어 게임: 칭호·연속 기록·업적 배지 ---------- */
  const TITLES = [[1, '첫걸음 경영인'], [2, '실행하는 리더'], [4, '현장 지휘관'], [6, '성과 설계자'], [9, '전략 사령관'], [13, '그룹 아키텍트'], [20, '전설의 경영자']];
  const titleOf = (lv) => TITLES.filter((t) => lv >= t[0]).pop()[1];
  const nextTitle = (lv) => TITLES.find((t) => t[0] > lv);
  const addDays = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  function streakInfo() {
    const set = new Set(S.achievements.filter(isDone).map((a) => a.confirmed_at));
    let d = set.has(S.today) ? S.today : addDays(S.today, -1);
    let cur = 0; while (set.has(d)) { cur += 1; d = addDays(d, -1); }
    const dates = [...set].sort(); let best = 0; let run = 0; let prev = null;
    dates.forEach((x) => { run = prev && addDays(prev, 1) === x ? run + 1 : 1; best = Math.max(best, run); prev = x; });
    const last14 = Array.from({ length: 14 }, (_, i) => addDays(S.today, i - 13)).map((x) => [x, set.has(x)]);
    return { cur, best, today: set.has(S.today), last14 };
  }
  const maxRun = (dates) => { let best = 0; let run = 0; let prev = null; [...new Set(dates)].sort().forEach((x) => { run = prev && addDays(prev, 1) === x ? run + 1 : 1; best = Math.max(best, run); prev = x; }); return best; };
  const weekMax = (list) => Math.max(0, ...list.map((a) => list.filter((b) => b.confirmed_at <= a.confirmed_at && b.confirmed_at >= addDays(a.confirmed_at, -6)).reduce((s, b) => s + b.value_won, 0)));
  // 각 배지: [id, 이름, 설명, 기호, 조건(st) → [현재, 목표]]
  const BADGES = [
    ['first', '첫 확정', '평가 건을 처음 확정', '1', (st) => [Math.min(1, st.done.length), 1]],
    ['agent', '첫 에이전트 작업', '에이전트로 수행한 일을 확정', 'A', (st) => [st.done.some((a) => a.by_agent) ? 1 : 0, 1]],
    ['nego', '협상 성공', '협상에서 수용 판정을 받음', 'N', (st) => [st.negos.some((n) => n.verdict === '수용') ? 1 : 0, 1]],
    ['week10', '주간 10,000천원 돌파', '7일 안에 확정 합계 10,000천원 이상', 'W', (st) => [Math.min(10000, Math.floor(weekMax(st.done) / 1000)), 10000]],
    ['big', '한 방 5,000천원', '한 건으로 5,000천원 이상 확정', '5', (st) => [Math.min(5000, Math.floor(Math.max(0, ...st.done.map((a) => a.value_won)) / 1000)), 5000]],
    ['wide', '전사 확산', '영향 100명 이상(L 8.0+) 건 확정', 'L', (st) => [st.done.some((a) => a.L >= 8) ? 1 : 0, 1]],
    ['code3', '코드 장인', '코드 산출물(F 1.8+) 3건 확정', 'C', (st) => [Math.min(3, st.done.filter((a) => a.F >= 1.8).length), 3]],
    ['speed', '속도 보너스', '예상보다 빨리 끝내 S 1.25 이상', 'S', (st) => [st.done.some((a) => a.S >= 1.25) ? 1 : 0, 1]],
    ['streak3', '3일 연속 확정', '사흘 연이어 하루 1건 이상 확정', '3', (st) => [Math.min(3, maxRun(st.done.map((a) => a.confirmed_at))), 3]],
    ['ten', '확정 10건', '평가 건 10건 확정', '10', (st) => [Math.min(10, st.done.length), 10]],
    ['lv5', 'Lv.5 도달', '레벨 5에 오름', 'Ⅴ', (st) => [Math.min(5, st.level), 5]],
    ['lv10', 'Lv.10 도달', '레벨 10에 오름', 'Ⅹ', (st) => [Math.min(10, st.level), 10]]
  ];
  function badgeState() {
    const negosAll = S.achievements.flatMap((a) => a.negotiations);
    const dates = [...new Set([...S.achievements.filter(isDone).map((a) => a.confirmed_at), ...S.levelUps.map((l) => l.at), ...negosAll.map((n) => n.created_at)])].filter(Boolean).sort();
    const at = (d) => ({ done: S.achievements.filter((a) => isDone(a) && a.confirmed_at <= d), negos: negosAll.filter((n) => (n.created_at || '') <= d), level: 1 + S.levelUps.filter((l) => l.at <= d).length });
    const states = dates.map((d) => [d, at(d)]);
    const now = { done: S.achievements.filter(isDone), negos: negosAll, level: S.wallet.level };
    return BADGES.map(([id, name, desc, sym, fn]) => {
      const [cur, goal] = fn(now);
      const hit = states.find(([, st]) => { const [c, g] = fn(st); return c >= g; });
      return { id, name, desc, sym, cur, goal, got: cur >= goal, at: cur >= goal ? (hit ? hit[0] : S.today) : null };
    });
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
            <div class="val-title">${esc(titleOf(w.level))}</div>
            <div class="small muted">${(() => { const n = nextTitle(w.level); return n ? `Lv.${n[0]}에 「${esc(n[1])}」` : '최고 칭호입니다'; })()}</div></div></div>
        <div class="val-stat"><div class="small muted">사용 가능 잔액 ${badge('추정')}</div><div class="val-mid num">${kwon(w.balance_won)}<small>천원</small></div></div>
        <div class="val-stat"><div class="small muted">누적 확정 ${badge('추정')}</div><div class="val-mid num">${kwon(w.total_won)}<small>천원</small></div></div>
        <div class="val-stat"><div class="small muted">확정 대기 ${pend.length}건 ${badge('추정')}</div><div class="val-mid num">${kwon(pendSum)}<small>천원</small></div></div>
      </div>
      ${(() => { const st = streakInfo(); return `<div class="val-streak" aria-label="연속 확정 기록">
        <div><div class="small muted">연속 확정 ${badge('측정')}</div><div class="val-mid num">${st.cur}<small>일</small></div><div class="small muted">최고 ${st.best}일${st.today ? '' : st.cur ? ' · 오늘 확정하면 이어집니다' : ' · 오늘 확정하면 새로 시작'}</div></div>
        <ol class="val-dots" aria-label="최근 14일 확정 여부">${st.last14.map(([d, on]) => `<li class="${on ? 'on' : ''}${d === S.today ? ' today' : ''}" title="${md(d)} ${on ? '확정 있음' : '없음'}"><span class="val-sr">${md(d)} ${on ? '확정' : '없음'}</span></li>`).join('')}</ol>
      </div>`; })()}
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
      ${coachBox(a)}
    </form>`;
  }

  /* ---------- 협상 코치(목업 AI): 약한 근거를 짚고, 쓰는 중인 문장을 바로 심사해 봄 ---------- */
  const aiBadge = () => '<span class="b val-ai" title="목업 AI: 실서비스에서는 Claude가 판단">목업 AI</span>';
  function coachTips(a) {
    const tips = [];
    const last = a.negotiations[a.negotiations.length - 1];
    if (last && last.verdict !== '수용') { const m = /부족: ([^.]+)\./.exec(last.claude_reply); if (m) tips.push(`지난 ${last.round}차는 <b>${esc(m[1])}</b> 근거가 부족해 ${last.verdict}되었습니다. 이번에는 그 부분부터 채우세요.`); }
    if (a.L <= 2) tips.push(`적용 범위가 좁습니다(영향 ${a.headcount}명, L ${a.L.toFixed(1)}). 다른 부서·매장에서 다시 쓸 계획이 있으면 <b>인원·매장 수</b>로 적으세요.`);
    if ((+a.saved_hours || 0) <= 1 && !(+a.monthly_revenue) && !(+a.monthly_cost)) tips.push(`효과가 1인 월 ${a.saved_hours || 0}시간 절감뿐입니다. 전후 비교한 <b>실측 시간·로그</b>를 붙이면 수용 가능성이 높아집니다.`);
    if (a.actual_minutes != null && a.est_minutes && a.actual_minutes > a.est_minutes) tips.push('예상보다 오래 걸렸지만 감점은 없습니다(S 1.00). 걸린 시간은 협상 근거가 되지 않습니다.');
    if (!a.by_agent) tips.push('직접 수행이라 A는 1.0입니다. A는 협상으로 바뀌지 않으니, 다음 비슷한 일은 에이전트에 맡기면 1.2배가 됩니다.');
    if (!tips.length) tips.push('계수가 고르게 잡혀 있습니다. 숫자 하나와 증빙 자료 이름만 붙여도 근거로 충분합니다.');
    return tips.slice(0, 3);
  }
  function coachLive(msg) {
    const t = (msg || '').trim();
    const checks = [['수치', /\d/.test(t)], ['증빙', /실측|측정|로그|증빙|데이터|자료|기록/.test(t)], ['적용 범위', /명|인원|가맹|매장|재사용|확산|부서|본사/.test(t)], ['20자 이상', t.length >= 20]];
    const guess = t ? judge(t, 0.1).verdict : null;
    return `<ul class="val-checks">${checks.map(([k, ok]) => `<li class="${ok ? 'ok' : ''}"><span aria-hidden="true">${ok ? '✓' : '·'}</span>${k}<span class="val-sr">${ok ? ' 충족' : ' 부족'}</span></li>`).join('')}</ul>
      <span class="small">${guess ? `지금 보내면 <span class="val-vd ${verdictCls[guess]}">${guess}</span> 예상` : '근거를 쓰면 바로 심사해 봅니다.'}</span>`;
  }
  const coachBox = (a) => `<details class="wide val-coach" ${a.negotiations.length ? 'open' : ''}><summary>협상 코치 ${aiBadge()}</summary>
      <ul class="val-tips">${coachTips(a).map((t) => `<li>${t}</li>`).join('')}</ul>
      <div class="val-live" data-coach-live aria-live="polite">${coachLive('')}</div>
    </details>`;

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
    const idx = (a) => S.achievements.indexOf(a);
    list = list.slice().sort((a, b) => (sorts[u.sort] || sorts.new)(a, b) || idx(b) - idx(a));
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

  function inboxPanel() {
    const list = myInbox(); const u = ui();
    if (!list.length) return '';
    return `<section class="panel val-inbox" aria-labelledby="h-vin"><h3 id="h-vin">받은 항목 <span class="pill st-wait">${list.length}</span><span class="small muted val-hint">다른 메뉴에서 넘어온 완료분입니다. 평가를 시작하면 아래 평가 건으로 들어갑니다.</span></h3>
      ${list.map((x) => `<div class="val-inrow">
        <div class="val-ititle"><b>${esc(x.title)}</b><div class="small muted">${esc(FROM_NAME[x.from] || x.from)} · ${esc(x.kind || '')} · ${md(x.at.slice(0, 10))}${x.payload && x.payload.est_minutes ? ` · 예상 ${x.payload.est_minutes}분 / 실제 ${x.payload.actual_minutes ?? '-'}분` : ''}</div></div>
        ${u.evalOpen === x.id ? '' : u.skip === x.id
          ? `<div class="val-ask"><span>평가하지 않고 받은 항목에서 뺍니다.</span><span class="row"><button type="button" class="btn sm" data-act="vInSkip" data-id="${x.id}">빼기</button><button type="button" class="btn sm" data-act="vInAskSkip" data-id="">취소</button></span></div>`
          : `<div class="row"><button type="button" class="btn primary sm" data-act="vInOpen" data-id="${x.id}">바로 평가 시작</button><button type="button" class="btn sm" data-act="vInAskSkip" data-id="${x.id}">평가 안 함</button></div>`}
        ${u.evalOpen === x.id ? evalForm(x) : ''}
      </div>`).join('')}</section>`;
  }
  function evalForm(x) {
    const p = x.payload || {};
    const sel = (n, opts, v) => `<select name="${n}">${opts.map(([k, l]) => `<option value="${k}" ${String(v) === String(k) ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
    return `<form class="form val-evalform" data-form="vEvalNew" data-id="${x.id}">
      <label class="f">산출물 형태${sel('output_type', Object.entries(F_TYPES).map(([k, v]) => [k, `${v[0]} (F ${v[1].toFixed(1)})`]), p.output_type || 'doc')}</label>
      <label class="f">영향 인원(명)<input type="number" name="headcount" min="1" value="${p.headcount || 1}" inputmode="numeric"></label>
      <label class="f">수행 방식${sel('by_agent', [['1', '에이전트 수행 (A 1.2)'], ['0', '직접 수행 (A 1.0)']], p.by_agent ? '1' : '0')}</label>
      <label class="f">1인 월 절감시간(시간)<input type="number" name="saved_hours" min="0" step="0.5" value="${p.saved_hours ?? 1}"></label>
      <label class="f">유효개월(1~12)<input type="number" name="months" min="1" max="12" value="${p.months || 12}"></label>
      <label class="f">월 매출·이익 기여(원)<input type="number" name="monthly_revenue" min="0" step="10000" value="${p.monthly_revenue || 0}"></label>
      <label class="f">월 비용절감(원)<input type="number" name="monthly_cost" min="0" step="10000" value="${p.monthly_cost || 0}"></label>
      <label class="f">예상 E(분)<input type="number" name="est" min="1" value="${p.est_minutes || 60}"></label>
      <label class="f">실제 T(분, 모르면 비움)<input type="number" name="act" min="1" value="${p.actual_minutes ?? ''}"></label>
      <label class="f val-check"><span><input type="checkbox" name="one_off" value="1"> 1회성(1개월만 반영)</span></label>
      <div class="wide val-preview" data-preview>${previewHtml(evalInput(new FormData(document.createElement('form')), x, true))}</div>
      <div class="wide row"><button class="btn primary">평가 등록</button><button type="button" class="btn" data-act="vInOpen" data-id="">닫기</button></div>
    </form>`;
  }
  function evalInput(fd, x, fromPayload) {
    const p = x.payload || {}; const g = (n, d) => (fromPayload ? d : (fd.get(n) ?? '').toString().trim());
    const num = (v, d) => (v === '' || v == null || isNaN(+v) ? d : +v);
    return { id: uid('a'), title: x.title, date: S.today, output_url: p.output_url || '', output_type: F_TYPES[g('output_type', p.output_type)] ? g('output_type', p.output_type) : 'doc', headcount: Math.max(1, num(g('headcount', p.headcount), 1)), by_agent: fromPayload ? !!p.by_agent : g('by_agent') === '1', saved_hours: Math.max(0, num(g('saved_hours', p.saved_hours), 1)), months: Math.min(12, Math.max(1, num(g('months', p.months), 12))), monthly_revenue: Math.max(0, num(g('monthly_revenue', p.monthly_revenue), 0)), monthly_cost: Math.max(0, num(g('monthly_cost', p.monthly_cost), 0)), one_off: fromPayload ? false : g('one_off') === '1', est_minutes: Math.max(1, num(g('est', p.est_minutes), 60)), actual_minutes: num(g('act', p.actual_minutes), null), N: 1, status: '평가중', negotiations: [], from_inbox: x.id, source_menu: x.from };
  }
  const previewHtml = (inp) => { const a = evaluate(Object.assign({}, inp)); return `<span class="small muted">예상 수익가치 ${badge('추정')}</span> <b class="val-mid num">${kwon(a.value_won)}<small>천원</small></b> <span class="small muted">B ${won(a.B)}원 × L ${a.L.toFixed(1)} × F ${a.F.toFixed(1)} × S ${a.S.toFixed(2)} × A ${a.A.toFixed(1)} × N 1.00</span>`; };

  function gamePanel() {
    const bs = badgeState(); const got = bs.filter((b) => b.got);
    const acts = S.activity.filter((a) => a.menu === 'value').slice(-8).reverse();
    return `<section class="panel" aria-labelledby="h-vbadge"><h3 id="h-vbadge">업적 배지 <span class="muted small">${got.length}/${bs.length} 획득</span> ${badge('측정')}</h3>
      <ul class="val-badges">${bs.map((b) => `<li class="val-bd ${b.got ? 'got' : ''}">
        <span class="val-medal" aria-hidden="true">${b.sym}</span>
        <span class="val-bdtxt"><b>${esc(b.name)}</b><span class="small muted">${esc(b.desc)}</span>
          ${b.got ? `<span class="small val-gotat">획득 ${md(b.at)}</span>` : `<span class="bar val-bdbar" role="progressbar" aria-label="${esc(b.name)} 진행" aria-valuenow="${b.cur}" aria-valuemin="0" aria-valuemax="${b.goal}"><i style="width:${Math.round(100 * b.cur / b.goal)}%"></i></span><span class="small muted num">${b.cur.toLocaleString('ko-KR')} / ${b.goal.toLocaleString('ko-KR')}</span>`}</span>
      </li>`).join('')}</ul></section>
      <section class="panel" aria-labelledby="h-vtitles"><h3 id="h-vtitles">레벨별 칭호</h3>
        <ol class="val-titles">${TITLES.map(([lv, t]) => `<li class="${S.wallet.level >= lv ? 'on' : ''}${titleOf(S.wallet.level) === t ? ' cur' : ''}"><span class="num">Lv.${lv}+</span><b>${esc(t)}</b></li>`).join('')}</ol></section>
      <section class="panel" aria-labelledby="h-vact"><h3 id="h-vact">최근 기록</h3>
        ${acts.length ? `<ul class="val-acts">${acts.map((a) => `<li><span class="small muted num">${md(a.at.slice(0, 10))} ${a.at.slice(11, 16)}</span> ${esc(a.text)}</li>`).join('')}</ul>` : '<p class="small muted">이 메뉴에서 협상·확정·레벨업을 하면 여기에 남습니다.</p>'}</section>`;
  }

  /* ---------- 가치 분석: 어디에 시간을 쓰면 가치가 큰가 ---------- */
  const hoursOf = (a) => Math.max(1, a.actual_minutes ?? a.est_minutes ?? 60) / 60;
  const L_LABEL = (a) => (L_TABLE.find((r) => (a.headcount || 1) <= r[0]) || L_TABLE[L_TABLE.length - 1])[2];
  const DIMS = [
    ['type', '산출물 형태', (a) => (F_TYPES[a.output_type] || ['기타'])[0], Object.values(F_TYPES).map((v) => v[0])],
    ['reach', '영향 인원', L_LABEL, L_TABLE.map((r) => r[2])],
    ['agent', '수행 방식', (a) => (a.by_agent ? '에이전트 수행' : '직접 수행'), ['에이전트 수행', '직접 수행']]
  ];
  const METRICS = [['perHour', '시간당 가치'], ['sum', '합계'], ['avg', '건당 평균']];
  function groupBy(list, dim) {
    const d = DIMS.find((x) => x[0] === dim);
    return d[3].map((name) => {
      const g = list.filter((a) => d[2](a) === name);
      const sum = g.reduce((s, a) => s + a.value_won, 0); const hrs = g.reduce((s, a) => s + hoursOf(a), 0);
      return { name, n: g.length, sum, avg: g.length ? sum / g.length : 0, perHour: hrs ? sum / hrs : 0, hrs };
    }).filter((r) => r.n);
  }
  function recommend(list) {
    const out = [];
    DIMS.forEach(([dim, label]) => {
      const rows = groupBy(list, dim).sort((a, b) => b.perHour - a.perHour);
      if (rows.length < 2) return;
      const top = rows[0]; const low = rows[rows.length - 1];
      const x = low.perHour ? top.perHour / low.perHour : 0;
      out.push(`<b>${label}</b> · ${esc(top.name)} 쪽이 시간당 <b class="num">${kwon(top.perHour)}천원</b>으로 ${esc(low.name)}(${kwon(low.perHour)}천원)의 <b class="num">${x >= 10 ? Math.round(x) : x.toFixed(1)}배</b>입니다.`);
    });
    const agent = list.filter((a) => a.by_agent); const share = list.length ? agent.reduce((s, a) => s + a.value_won, 0) / Math.max(1, list.reduce((s, a) => s + a.value_won, 0)) : 0;
    if (list.length) out.push(`<b>에이전트 비중</b> · 가치의 <b class="num">${Math.round(share * 100)}%</b>가 에이전트 수행 건에서 나왔습니다. ${share < 0.5 ? '반복 작업은 에이전트에 맡겨 A 1.2를 받으세요.' : '지금 방식을 유지하세요.'}`);
    out.push('<b>공식으로 본 지렛대</b> · 같은 1시간이라도 영향 인원을 9명 → 10명 이상으로 넓히면 L이 2.0 → 4.0(2배), 문서를 AI+코드로 만들면 F가 1.0 → 2.0(2배)이 됩니다.');
    return out;
  }
  function analysisPanel() {
    const u = ui(); const scope = u.aScope || 'done'; const metric = u.aMetric || 'perHour';
    const list = S.achievements.filter((a) => (scope === 'done' ? isDone(a) : true));
    const fmt = (r) => (metric === 'perHour' ? `${kwon(r.perHour)}천원/시간` : metric === 'sum' ? `${kwon(r.sum)}천원` : `${kwon(r.avg)}천원`);
    const agentSum = list.filter((a) => a.by_agent).reduce((s, a) => s + a.value_won, 0); const all = list.reduce((s, a) => s + a.value_won, 0);
    const hrs = list.reduce((s, a) => s + hoursOf(a), 0);
    return `<section class="panel" aria-labelledby="h-van"><div class="val-lhead"><h3 id="h-van">가치 분석 ${badge('추정')}</h3>
        <span class="seg" role="group" aria-label="분석 범위">${[['done', '확정만'], ['all', '평가 전체']].map(([k, l]) => `<button type="button" data-act="vAn" data-k="aScope" data-v="${k}" aria-pressed="${scope === k}">${l}</button>`).join('')}</span></div>
      <div class="val-antiles">
        <div class="val-stat"><div class="small muted">분석 대상 ${badge('측정')}</div><div class="val-mid num">${list.length}<small>건</small></div></div>
        <div class="val-stat"><div class="small muted">들인 시간 ${badge(list.some((a) => a.actual_minutes == null) ? '추정' : '측정')}</div><div class="val-mid num">${hrs.toFixed(1)}<small>시간</small></div></div>
        <div class="val-stat"><div class="small muted">시간당 가치 ${badge('추정')}</div><div class="val-mid num">${kwon(hrs ? all / hrs : 0)}<small>천원</small></div></div>
        <div class="val-stat"><div class="small muted">에이전트 비중 ${badge('추정')}</div><div class="val-mid num">${all ? Math.round(100 * agentSum / all) : 0}<small>%</small></div></div>
      </div>
      <div class="val-filters"><span class="seg" role="group" aria-label="막대 기준">${METRICS.map(([k, l]) => `<button type="button" data-act="vAn" data-k="aMetric" data-v="${k}" aria-pressed="${metric === k}">${l}</button>`).join('')}</span>
        <span class="small muted">시간은 실제 T(없으면 예상 E) 기준 · 자세한 수치는 아래 '표로 보기'</span></div>
      ${list.length ? `<div class="val-angrid">${DIMS.map(([dim, label]) => { const rows = groupBy(list, dim); const max = Math.max(1, ...rows.map((r) => r[metric])); return `<figure class="val-chart"><figcaption>${label}별 ${METRICS.find((m) => m[0] === metric)[1]}</figcaption>
          ${rows.map((r) => `<div class="val-brow" tabindex="0" title="${esc(r.name)} · ${r.n}건 · 합계 ${kwon(r.sum)}천원 · 건당 ${kwon(r.avg)}천원 · ${r.hrs.toFixed(1)}시간 · 시간당 ${kwon(r.perHour)}천원"><span class="val-blabel">${esc(r.name)} <span class="muted">${r.n}건</span></span><span class="val-btrack"><i style="width:${Math.max(2, 100 * r[metric] / max)}%"></i></span><span class="val-bval num">${fmt(r)}</span></div>`).join('')}
        </figure>`; }).join('')}</div>
      <details class="val-hist"><summary>표로 보기</summary><div class="tbl-wrap"><table><thead><tr><th>구분</th><th>항목</th><th class="r">건수</th><th class="r">합계</th><th class="r">건당</th><th class="r">시간</th><th class="r">시간당</th></tr></thead><tbody>
        ${DIMS.map(([dim, label]) => groupBy(list, dim).map((r) => `<tr><td>${label}</td><td>${esc(r.name)}</td><td class="r num">${r.n}</td><td class="r num">${kwon(r.sum)}</td><td class="r num">${kwon(r.avg)}</td><td class="r num">${r.hrs.toFixed(1)}</td><td class="r num">${kwon(r.perHour)}</td></tr>`).join('')).join('')}
      </tbody></table></div><p class="small muted">단위: 천원·시간</p></details>` : guide('folder', '분석할 평가 건이 없습니다', '평가 건을 확정하면 산출물 형태·영향 인원·수행 방식별로 가치를 비교해 드립니다.')}
    </section>
    <section class="panel val-reco" aria-labelledby="h-vreco"><h3 id="h-vreco">어디에 시간을 쓰면 가치가 큰가 ${aiBadge()}</h3>
      ${list.length ? `<ul class="val-tips">${recommend(list).map((t) => `<li>${t}</li>`).join('')}</ul>` : ''}
      <p class="small muted">표본 ${list.length}건으로 낸 참고용 의견입니다. 건수가 쌓이면 더 정확해집니다. 공식과 계수는 바꾸지 않습니다.</p></section>`;
  }

  /* ---------- 월간 성과 리포트 ---------- */
  const monthOf = (k) => { const [y, m] = S.today.slice(0, 7).split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + k, 1)); return d.toISOString().slice(0, 7); };
  const monthEnd = (ym) => { const [y, m] = ym.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); };
  const ymLabel = (ym) => `${ym.slice(0, 4)}년 ${+ym.slice(5)}월`;
  function monthData(ym) {
    const start = ym + '-01'; const end = monthEnd(ym);
    const done = S.achievements.filter((a) => isDone(a) && a.confirmed_at >= start && a.confirmed_at <= end);
    const sum = done.reduce((t, a) => t + a.value_won, 0);
    const lvStart = 1 + S.levelUps.filter((l) => l.at < start).length; const lvEnd = 1 + S.levelUps.filter((l) => l.at <= end).length;
    const negos = S.achievements.flatMap((a) => a.negotiations).filter((n) => n.created_at >= start && n.created_at <= end);
    const nv = { '수용': 0, '부분수용': 0, '거절': 0 }; negos.forEach((n) => { nv[n.verdict] = (nv[n.verdict] || 0) + 1; });
    const badges = badgeState().filter((b) => b.got && b.at >= start && b.at <= end);
    return { ym, start, end, done, sum, top: done.slice().sort((a, b) => b.value_won - a.value_won).slice(0, 5), lvStart, lvEnd, negos: negos.length, nv, badges, agent: done.filter((a) => a.by_agent).length };
  }
  function reportMd(d, prev) {
    const diff = d.sum - prev.sum;
    return [`# 월간 성과 리포트 — ${ymLabel(d.ym)}`, '', `- 확정 수익가치: ${kwon(d.sum)}천원 (${d.done.length}건, 전월 대비 ${diff >= 0 ? '+' : '−'}${kwon(Math.abs(diff))}천원) [추정]`,
      `- 레벨: Lv.${d.lvStart} → Lv.${d.lvEnd} (${titleOf(d.lvEnd)})`, `- 협상: ${d.negos}회 (수용 ${d.nv['수용']} · 부분수용 ${d.nv['부분수용']} · 거절 ${d.nv['거절']})`, `- 에이전트 수행 확정: ${d.agent}건`,
      `- 새 업적: ${d.badges.length ? d.badges.map((b) => b.name).join(', ') : '없음'}`, '', '## 확정 Top 5', '', '| 순위 | 성과 | 확정일 | 수익가치(천원) |', '|---|---|---|---|',
      ...(d.top.length ? d.top.map((a, i) => `| ${i + 1} | ${a.title.replace(/\|/g, '/')} | ${a.confirmed_at} | ${kwon(a.value_won)} |`) : ['| - | 확정 건 없음 | - | - |']), '', `_목업 데이터 · V = B×L×F×S×A×N · ${S.today} 생성_`].join('\n');
  }
  function reportPanel() {
    const u = ui(); const k = Math.min(0, Math.max(-2, +(u.rMonth || 0)));
    const d = monthData(monthOf(k)); const prev = monthData(monthOf(k - 1)); const diff = d.sum - prev.sum;
    return `<section class="panel" aria-labelledby="h-vrep"><div class="val-lhead"><h3 id="h-vrep">월간 성과 리포트 <span class="muted small">${ymLabel(d.ym)}</span></h3>
        <span class="row"><span class="seg" role="group" aria-label="월 선택">${[0, -1, -2].map((x) => `<button type="button" data-act="vAn" data-k="rMonth" data-v="${x}" aria-pressed="${k === x}">${x === 0 ? '이번 달' : ymLabel(monthOf(x)).slice(6)}</button>`).join('')}</span>
        <button type="button" class="btn sm" data-act="vCopyMd">Markdown 복사</button></span></div>
      <div class="val-antiles">
        <div class="val-stat"><div class="small muted">확정 수익가치 ${badge('추정')}</div><div class="val-mid num">${kwon(d.sum)}<small>천원</small></div><div class="small ${diff >= 0 ? 'val-up' : 'val-down'}">전월 대비 ${diff >= 0 ? '▲' : '▼'} ${kwon(Math.abs(diff))}천원</div></div>
        <div class="val-stat"><div class="small muted">확정 건수 ${badge('측정')}</div><div class="val-mid num">${d.done.length}<small>건</small></div><div class="small muted">에이전트 ${d.agent}건</div></div>
        <div class="val-stat"><div class="small muted">레벨 변화 ${badge('측정')}</div><div class="val-mid num">Lv.${d.lvStart}${d.lvEnd !== d.lvStart ? ` → ${d.lvEnd}` : ''}</div><div class="small muted">${esc(titleOf(d.lvEnd))}</div></div>
        <div class="val-stat"><div class="small muted">협상 ${badge('측정')}</div><div class="val-mid num">${d.negos}<small>회</small></div><div class="small muted">수용 ${d.nv['수용']} · 부분 ${d.nv['부분수용']} · 거절 ${d.nv['거절']}</div></div>
      </div>
      <h4 class="val-h4">확정 Top 5</h4>
      ${d.top.length ? `<ol class="val-top">${d.top.map((a, i) => `<li><span class="val-rank num">${i + 1}</span><span class="val-ititle"><b>${esc(a.title)}</b><span class="small muted">확정 ${md(a.confirmed_at)} · ${esc((F_TYPES[a.output_type] || [''])[0])}${a.by_agent ? ' · 에이전트' : ''}</span></span><span class="val-mid num">${kwon(a.value_won)}<small>천원</small></span></li>`).join('')}</ol>` : '<p class="small muted">이 달에는 확정한 건이 없습니다.</p>'}
      <h4 class="val-h4">이 달에 얻은 업적</h4>
      ${d.badges.length ? `<ul class="val-titles">${d.badges.map((b) => `<li class="on cur"><span aria-hidden="true">${b.sym}</span><b>${esc(b.name)}</b><span class="small muted">${md(b.at)}</span></li>`).join('')}</ul>` : '<p class="small muted">이 달에 새로 얻은 업적이 없습니다.</p>'}
      <details class="val-hist"><summary>Markdown 미리보기</summary><pre class="val-md">${esc(reportMd(d, prev))}</pre></details>
    </section>`;
  }
  function copyText(text) {
    const fallback = () => { const ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); let ok = false; try { ok = document.execCommand('copy'); } catch (er) { ok = false; } ta.remove(); toast(ok ? '리포트를 Markdown으로 복사했습니다' : '복사가 막혀 있습니다. 미리보기에서 직접 선택해 복사하세요'); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(() => toast('리포트를 Markdown으로 복사했습니다'), fallback); else fallback();
  }

  /* ---------- 레벨업 축하 카드(움직임 줄이기 설정이면 정지 화면) ---------- */
  function celebCard() {
    const c = ui().celebrate; if (!c) return '';
    const newTitle = titleOf(c.to) !== titleOf(c.from);
    return `<div class="val-celeb-bg" data-act="vCelebClose" aria-hidden="true"></div>
      <div class="val-celeb" role="dialog" aria-modal="true" aria-labelledby="h-celeb">
        <div class="val-confetti" aria-hidden="true">${Array.from({ length: 14 }, (_, i) => `<i style="--i:${i}"></i>`).join('')}</div>
        <div class="small muted">레벨업</div>
        <div id="h-celeb" class="val-celeb-lv num">Lv.${c.from} → Lv.${c.to}</div>
        <div class="val-title">${newTitle ? `새 칭호 「${esc(titleOf(c.to))}」` : esc(titleOf(c.to))}</div>
        <p>${kwon(LEVEL_COST * (c.to - c.from))}천원을 써서 ${c.to - c.from}단계 올랐습니다. 남은 잔액 <b class="num">${kwon(S.wallet.balance_won)}천원</b>.</p>
        <div class="row"><button type="button" class="btn primary" data-act="vCelebClose">확인</button><button type="button" class="btn" data-act="vCelebClose" data-v="game">업적 보기</button></div>
      </div>`;
  }

  const SUBTABS = [['list', '평가·확정'], ['game', '업적·기록'], ['analysis', '가치 분석'], ['report', '월간 리포트']];
  function viewValue() {
    const u = ui();
    if (!SUBTABS.some((t) => t[0] === u.tab)) u.tab = 'list';
    const pend = S.achievements.filter((a) => !isDone(a)).length;
    return `<div class="view-head"><div><h2>성과 수익가치 · 레벨</h2><p>V = B × L × F × S × A × N (천원 단위 반올림) · 평가 → 협상 → 확정 → 잔액 적립 → ${kwon(LEVEL_COST)}천원마다 레벨업</p></div>
        <button type="button" class="btn sm" data-act="tab" data-v="rules">보상 기준 보기 →</button></div>
      ${inboxPanel()}${levelPanel()}
      <div class="seg val-tabs" role="tablist" aria-label="성과·레벨 보기">${SUBTABS.map(([k, l]) => `<button type="button" role="tab" data-act="vTab" data-v="${k}" aria-selected="${u.tab === k}" aria-pressed="${u.tab === k}">${l}${k === 'list' && pend ? ` <span class="val-cnt">${pend}</span>` : ''}${k === 'game' ? ` <span class="val-cnt">${badgeState().filter((b) => b.got).length}</span>` : ''}</button>`).join('')}</div>
      ${u.tab === 'game' ? gamePanel() : u.tab === 'analysis' ? analysisPanel() : u.tab === 'report' ? reportPanel() : periodPanel() + listPanel()}${celebCard()}`;
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
    logAct('confirm', `확정 · ${a.title} ${kwon(a.value_won)}천원 적립`, a.id);
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
    ui().askLv = false; ui().celebrate = { from, to: w.level };
    setTimeout(() => { const b = document.querySelector('.val-celeb .btn.primary'); if (b) b.focus(); }, 0);
    logAct('levelup', `레벨업 · Lv.${from} → Lv.${w.level} (${titleOf(w.level)})`, null);
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
    logAct('nego', `협상 ${a.negotiations.length}차 ${j.verdict} · ${a.title} N ${a.N.toFixed(2)}`, a.id);
    toast(`${j.verdict}: ${kwon(before)} → ${kwon(a.value_won)}천원`);
  };

  APP.acts.vTab = (el) => { ui().tab = el.dataset.v; };
  APP.acts.vAn = (el) => { ui()[el.dataset.k] = el.dataset.v; };
  APP.acts.vCopyMd = () => { const k = Math.min(0, Math.max(-2, +(ui().rMonth || 0))); copyText(reportMd(monthData(monthOf(k)), monthData(monthOf(k - 1)))); };
  APP.acts.vCelebClose = (el) => { const u = ui(); u.celebrate = null; if (el.dataset.v) u.tab = el.dataset.v; };
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !document.querySelector('.val-celeb')) return;
    const b = document.querySelector('.val-celeb [data-act="vCelebClose"]'); if (b) b.click();
  });
  APP.acts.vInOpen = (el) => { const u = ui(); u.evalOpen = el.dataset.id || null; u.skip = null; };
  APP.acts.vInAskSkip = (el) => { ui().skip = el.dataset.id || null; };
  APP.acts.vInSkip = (el) => {
    const x = S.inbox.find((y) => y.id === el.dataset.id); if (!x) return;
    x.done = true; x.done_at = new Date().toISOString(); x.result = 'skipped'; ui().skip = null;
    logAct('inbox_skip', `받은 항목 평가 안 함 · ${x.title}`, x.id);
    toast('받은 항목에서 뺐습니다');
  };
  APP.forms.vEvalNew = (fd, form) => {
    const x = S.inbox.find((y) => y.id === form.dataset.id); if (!x || x.done) return;
    const a = evaluate(evalInput(fd, x, false));
    S.achievements.push(a);
    x.done = true; x.done_at = new Date().toISOString(); x.result = a.id;
    const u = ui(); u.evalOpen = null; u.tab = 'list'; u.status = 'all'; u.period = '누적'; u.sort = 'open';
    logAct('evaluate', `평가 시작 · ${a.title} ${kwon(a.value_won)}천원(${FROM_NAME[x.from] || x.from}에서 받음)`, a.id);
    toast(`평가 등록: ${kwon(a.value_won)}천원 — 협상하거나 확정하세요`);
  };
  /* 평가 입력 중 예상 금액을 바로 보여 줌(이 메뉴 폼에만 반응) */
  document.addEventListener('input', (e) => {
    const form = e.target.closest && e.target.closest('form[data-form="vEvalNew"]'); if (!form) return;
    const x = S.inbox.find((y) => y.id === form.dataset.id); const box = form.querySelector('[data-preview]');
    if (x && box) box.innerHTML = previewHtml(evalInput(new FormData(form), x, false));
  });
  document.addEventListener('input', (e) => {
    if (e.target.name !== 'msg') return;
    const form = e.target.closest('form[data-form="vNego"]'); const box = form && form.querySelector('[data-coach-live]');
    if (box) box.innerHTML = coachLive(e.target.value);
  });

  APP.views.value = viewValue;
})();
