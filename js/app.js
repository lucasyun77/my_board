/* 회장 개인현황판 — 목업 앱 (바닐라 JS). 상태는 브라우저 localStorage에만 저장된다. */
(function () {
  'use strict';
  const KEY = 'myboard.mock.v1';
  const clone = (o) => JSON.parse(JSON.stringify(o));
  let S;
  try { S = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { S = null; }
  if (!S || S.today !== MOCK.today) S = Object.assign(clone(MOCK), { savedViews: [{ id: 'v1', name: 'AI전환 미완료', filter: { tags: ['t1'], mode: 'OR', status: 'open', org: '', due: '' } }], wrong: ['q4', 'q13', 'q5', 'q14'], levelUps: [], ui: {} });
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* 저장 불가 환경 */ } };

  const RATE = 1400; // USD→KRW 가정 환율
  const HOUR_VALUE = 30000;
  const LEVEL_COST = 1000000;
  const STATUSES = ['지시', '진행', '보고대기', '완료', '보류'];
  const STAGES = ['아이디어', '검증', 'PoC', '론칭', '보류', '폐기'];
  const F_TYPES = { doc: ['일반 문서·의사결정', 1.0], ai: ['AI로 업무 고도화(스킬·자동화)', 1.5], code: ['코드로 만든 프로그램', 1.8], ai_code: ['AI 고도화 + 코드', 2.0] };
  const L_TABLE = [[1, 1, '1명'], [9, 2, '2~9명'], [29, 4, '10~29명'], [99, 6, '30~99명'], [299, 8, '100~299명'], [Infinity, 10, '300명 이상·가맹점망 전체']];

  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const won = (n) => Math.round(n).toLocaleString('ko-KR');
  const kwon = (n) => Math.round(n / 1000).toLocaleString('ko-KR');
  const days = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);
  const md = (d) => { const x = new Date(d); return (x.getMonth() + 1) + '/' + x.getDate(); };
  const BADGE = { '측정': 'm', '수기': 'h', '추정': 'e', '미확인': 'u' };
  const badge = (t) => `<span class="b ${BADGE[t]}" title="${t}: ${{ '측정': '시스템 집계', '수기': '직접 입력', '추정': 'Claude 산정', '미확인': '수집 경로 없음' }[t]}">${t}</span>`;
  const tagById = (id) => S.tags.find((t) => t.id === id);
  const chip = (id) => { const t = tagById(id); return t ? `<span class="chip"><span class="dot" style="background:${esc(t.color)}"></span>${esc(t.name)}</span>` : ''; };
  const uid = (p) => p + Math.random().toString(36).slice(2, 8);
  const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  function toast(msg) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 2200); }

  /* ---------- 계산 ---------- */
  const isOpen = (d) => !['완료', '보류'].includes(d.status);
  const isOverdue = (d) => isOpen(d) && d.due_at < S.today;
  const isStale = (d) => isOpen(d) && days(d.updated_at, S.today) >= 3;
  const Lof = (n) => L_TABLE.find((r) => n <= r[0])[1];
  const Sof = (E, T) => (E > 0 && T != null ? Math.min(1.5, 1 + 0.5 * Math.max(0, (E - T) / E)) : 1);
  function evaluate(a) {
    const months = a.one_off ? 1 : Math.min(12, Math.max(1, +a.months || 1));
    const monthly = (+a.saved_hours || 0) * HOUR_VALUE + (+a.monthly_revenue || 0) + (+a.monthly_cost || 0);
    const B = monthly * months;
    const L = Lof(+a.headcount || 1);
    const F = F_TYPES[a.output_type][1];
    const Sv = +Sof(+a.est_minutes, a.actual_minutes).toFixed(3);
    const A = a.by_agent ? 1.2 : 1.0;
    const N = a.N || 1.0;
    const value = Math.round((B * L * F * Sv * A * N) / 1000) * 1000;
    const rationale = [
      `B: 1인 기준 월 ${a.saved_hours || 0}시간 × ${won(HOUR_VALUE)}원` + ((+a.monthly_revenue || 0) ? ` + 월 매출·이익 ${won(a.monthly_revenue)}원` : '') + ((+a.monthly_cost || 0) ? ` + 월 비용절감 ${won(a.monthly_cost)}원` : '') + ` × ${months}개월${a.one_off ? '(1회성)' : ''} = ${won(B)}원`,
      `L: 영향 ${a.headcount}명 → ${L.toFixed(1)}`,
      `F: ${F_TYPES[a.output_type][0]} → ${F.toFixed(1)}`,
      `S: 예상 ${a.est_minutes}분, 실제 ${a.actual_minutes ?? '-'}분 → ${Sv.toFixed(2)}`,
      `A: ${a.by_agent ? '에이전트 수행 → 1.2' : '직접 수행 → 1.0'}`,
      `N: 협상계수 ${N.toFixed(2)}`
    ];
    return Object.assign(a, { B, L, F, S: Sv, A, N, value_won: value, rationale });
  }
  const sumConfirmed = (from) => S.achievements.filter((a) => a.status === '확정' && a.confirmed_at >= from).reduce((s, a) => s + a.value_won, 0);
  const dayStr = (n) => MOCK.D(n);

  /* ---------- 상단 ---------- */
  function renderTop() {
    const overdue = S.directives.filter(isOverdue);
    const dueToday = S.directives.filter((d) => isOpen(d) && d.due_at === S.today);
    const stale = S.directives.filter((d) => isStale(d) && !isOverdue(d));
    const todayVal = sumConfirmed(S.today);
    const yVal = S.achievements.filter((a) => a.status === '확정' && a.confirmed_at === dayStr(-1)).reduce((s, a) => s + a.value_won, 0);
    const recentAttempts = S.attempts.filter((a) => a.at.slice(0, 10) >= dayStr(-6)).length;
    const bt = S.ui.briefTab || '일';
    const brief = {
      '일': [
        `기한 지난 지시 <b>${overdue.length}건</b>` + (overdue[0] ? ` — 가장 급한 건: ${esc(overdue[0].title)} (${esc(overdue[0].org)}, D+${days(overdue[0].due_at, S.today)})` : ''),
        `오늘 기한 <b>${dueToday.length}건</b>, 3일 이상 갱신 없는 지시 <b>${stale.length}건</b>`,
        `회장 대기함 <b>${S.waiting.length}건</b> — 최장 ${Math.max(...S.waiting.map((w) => days(w.since, S.today)))}일 대기`,
        `어제 확정 수익가치 <b>${kwon(yVal)}천원</b>, 최근 7일 학습 <b>${recentAttempts}문제</b>`
      ],
      '주': [`이번 주 확정 수익가치 <b>${kwon(sumConfirmed(dayStr(-6)))}천원</b>`, `완료된 지시 ${S.directives.filter((d) => d.status === '완료' && d.updated_at >= dayStr(-6)).length}건 / 신규 지시 ${S.directives.filter((d) => d.issued_at >= dayStr(-6)).length}건`, `PoC 단계 신사업 ${S.ideas.filter((i) => i.stage === 'PoC').length}건`],
      '월': [`이번 달 확정 수익가치 <b>${kwon(sumConfirmed(dayStr(-29)))}천원</b>`, `지시 이행률 ${Math.round(100 * S.directives.filter((d) => d.status === '완료').length / S.directives.length)}%`, `누적 학습 XP ${S.xp}`]
    }[bt];
    const one = S.ui.oneThing || { title: overdue[0] ? overdue[0].title : '신사업 파이프라인 점검', done: '담당자 보고를 받고 다음 기한을 확정한다' };
    const todayTxt = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
    const focusN = overdue.length + dueToday.length + S.waiting.length;
    $('#top').innerHTML = `
      <div class="hello">
        <div><div class="date">${todayTxt}</div>
          <h1>회장님, 오늘 챙길 일은 <em>${focusN}건</em>입니다</h1>
          <p class="hsub">기한 경과 ${overdue.length} · 오늘 기한 ${dueToday.length} · 결재 대기 ${S.waiting.length}</p></div>
        <div class="lvbadge"><div class="lv num">Lv.${S.wallet.level}</div><small>잔액 ${kwon(S.wallet.balance_won)}천원</small></div>
      </div>
      <div class="brief">
        <section class="panel" aria-labelledby="h-brief">
          <h3 id="h-brief">오늘의 브리핑 ${badge('추정')}<span class="tabs-mini seg">${['일', '주', '월'].map((x) => `<button type="button" data-act="briefTab" data-v="${x}" aria-pressed="${x === bt}">${x}</button>`).join('')}</span></h3>
          <ul>${brief.map((l) => `<li>${l}</li>`).join('')}</ul>
          <p class="small muted" style="margin:8px 0 0">매일 08:00 자동 생성 예정 · 목업은 화면 데이터로 즉석 생성</p>
        </section>
        <section class="panel one-thing" aria-labelledby="h-one">
          <h3 id="h-one">오늘의 한 가지</h3>
          <div class="title">${esc(one.title)}</div>
          <div class="small"><span class="muted">완료 조건</span> · ${esc(one.done)}</div>
          <details class="adder" style="margin-top:10px"><summary class="btn sm">바꾸기</summary>
            <form class="form" data-form="oneThing">
              <label class="f wide">가장 중요한 일<input type="text" id="one-title" name="title" value="${esc(one.title)}"></label>
              <label class="f wide">완료 조건<input type="text" id="one-done" name="done" value="${esc(one.done)}"></label>
              <div><button class="btn primary sm">저장</button></div>
            </form></details>
        </section>
      </div>
      <div class="kpis" role="list">
        <div class="kpi ${overdue.length ? 'alert' : ''}" role="listitem"><span class="label">경보 · 기한 경과 ${badge('측정')}</span><span class="value num">${overdue.length}<small>건</small></span><span class="small muted">무응답 3일+ ${stale.length}건</span></div>
        <div class="kpi" role="listitem"><span class="label">오늘 기한 지시 ${badge('측정')}</span><span class="value num">${dueToday.length}<small>건</small></span><span class="small muted">미완료 ${S.directives.filter(isOpen).length}건 중</span></div>
        <div class="kpi" role="listitem"><span class="label">회장 대기함 ${badge('측정')}</span><span class="value num">${S.waiting.length}<small>건</small></span><span class="small muted">Asana 회장 담당·미완료</span></div>
        <div class="kpi" role="listitem"><span class="label">오늘 수익가치 ${badge('추정')}</span><span class="value num">${kwon(todayVal)}<small>천원</small></span><span class="small muted">어제 ${kwon(yVal)}천원</span></div>
        <div class="kpi" role="listitem"><span class="label">이번 주 수익가치 ${badge('추정')}</span><span class="value num">${kwon(sumConfirmed(dayStr(-6)))}<small>천원</small></span><span class="small muted">최근 7일 확정분</span></div>
      </div>`;
  }

  /* ---------- ① 지시 관리 + 태그 ---------- */
  function currentFilter() { return S.ui.filter || { tags: [], mode: 'OR', status: 'all', org: '', due: '' }; }
  function applyFilter(list, f) {
    return list.filter((d) => {
      if (f.tags.length) {
        const hit = f.mode === 'AND' ? f.tags.every((t) => d.tags.includes(t)) : f.tags.some((t) => d.tags.includes(t));
        if (!hit) return false;
      }
      if (f.status === 'open' && !isOpen(d)) return false;
      if (STATUSES.includes(f.status) && d.status !== f.status) return false;
      if (f.org && d.org !== f.org) return false;
      if (f.due === 'overdue' && !isOverdue(d)) return false;
      if (f.due === 'week' && !(isOpen(d) && d.due_at >= S.today && d.due_at <= dayStr(7))) return false;
      return true;
    });
  }
  const prioPill = (p) => `<span class="pill ${p === '긴급' ? 'p-urgent' : p === '높음' ? 'p-high' : ''}">${p}</span>`;
  const statPill = (s) => `<span class="pill ${s === '완료' ? 'st-done' : s === '보류' ? 'st-hold' : s === '보고대기' ? 'st-wait' : ''}">${s}</span>`;
  const statusSelect = (d) => `<select aria-label="상태 변경" data-act="dirStatus" data-id="${d.id}" style="width:auto">${STATUSES.map((s) => `<option ${s === d.status ? 'selected' : ''}>${s}</option>`).join('')}</select>`;

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
        <section class="panel"><h3>상태별 현황 ${badge('측정')}</h3>${donut(S.directives)}</section>
        <section class="panel"><h3>조직별 이행률 ${badge('측정')}</h3><div class="tl" style="gap:8px;margin-top:8px">${orgRows.map((r) => `<div class="barrow"><span>${r.o}</span><div class="bar"><i style="width:${r.pct}%"></i></div><span class="num r">${r.pct}%</span></div>`).join('')}</div><p class="small muted" style="margin:8px 0 0">완료 ÷ (전체 − 보류)</p></section>
      </div>
      <div>
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
  const ST_COLOR = { '지시': '#1F8FD8', '진행': '#F2C94C', '보고대기': '#F07A22', '완료': '#2ED993', '보류': '#C7CBD3' };
  function donut(list) {
    const n = list.length || 1; let acc = 0;
    const stops = STATUSES.map((st) => { const c = list.filter((d) => d.status === st).length; const a = acc; acc += 360 * c / n; return `${ST_COLOR[st]} ${a}deg ${acc}deg`; }).join(', ');
    const done = list.filter((d) => d.status === '완료').length;
    return `<div class="donut-wrap"><div class="donut" style="background:conic-gradient(${stops})" role="img" aria-label="상태별 지시 비율"><div class="c num">${Math.round(100 * done / n)}%<small>완료</small></div></div>
      <div class="dlegend">${STATUSES.map((st) => `<div><span style="background:${ST_COLOR[st]}"></span>${st} <b class="num">${list.filter((d) => d.status === st).length}</b></div>`).join('')}</div></div>`;
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

  /* ---------- ② 신사업 ---------- */
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

  /* ---------- ③ 성과·레벨 ---------- */
  function viewValue() {
    const w = S.wallet;
    const tasks = S.dailyTasks.filter((t) => t.date === S.today);
    const comp = S.ui.completing ? S.dailyTasks.find((t) => t.id === S.ui.completing) : null;
    const periods = [['당일', S.today], ['주간', dayStr(-6)], ['월간', dayStr(-29)], ['분기', dayStr(-89)], ['누적', '0000']];
    const ach = S.achievements.slice().reverse();
    return `<div class="view-head"><div><h2>성과 수익가치 · 레벨</h2><p>V = B × L × F × S × A × N, 천원 단위 반올림. 목업에서는 Claude 평가 자리를 규칙 계산으로 대신합니다.</p></div></div>
      <section class="panel"><div class="levelbox">
        <div><div class="small muted">현재 레벨 ${badge('추정')}</div><div class="big num">Lv.${w.level}</div></div>
        <div><div class="small muted">사용 가능 잔액</div><div class="num" style="font-weight:900;font-size:24px">${kwon(w.balance_won)}<span class="small muted">천원</span></div></div>
        <div><div class="small muted">누적 수익가치</div><div class="num" style="font-weight:900;font-size:24px">${kwon(w.total_won)}<span class="small muted">천원</span></div></div>
        <div style="flex:1;min-width:200px"><div class="small muted">다음 레벨까지 ${w.balance_won >= LEVEL_COST ? '— 지금 올릴 수 있습니다' : kwon(LEVEL_COST - w.balance_won) + '천원'}</div><div class="bar est" style="margin:6px 0"><i style="width:${Math.min(100, 100 * w.balance_won / LEVEL_COST)}%"></i></div>
          <button type="button" class="btn primary" data-act="levelUp" ${w.balance_won >= LEVEL_COST ? '' : 'disabled'}>1,000천원 사용해 레벨업</button></div>
      </div>
      <div class="tbl-wrap" style="margin-top:14px"><table><thead><tr>${periods.map((p) => `<th class="r">${p[0]}</th>`).join('')}</tr></thead><tbody><tr>${periods.map((p) => `<td class="r num">${kwon(sumConfirmed(p[1]))}천원</td>`).join('')}</tr></tbody></table></div>
      ${S.levelUps.length ? `<p class="small muted" style="margin:8px 0 0">레벨업 이력: ${S.levelUps.map((l) => `Lv.${l.level_after} (${md(l.at)})`).join(', ')}</p>` : ''}</section>

      <section class="panel"><h3>오늘 할 일</h3>
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

  /* ---------- ④ 경영학습 ---------- */
  const qById = (id) => S.questions.find((q) => q.id === id);
  function reviewSet(n = 10) {
    const half = Math.floor(n / 2);
    const since = dayStr(-6);
    const uniq = (arr) => [...new Set(arr)];
    const recent = uniq(S.attempts.filter((a) => a.at.slice(0, 10) >= since).map((a) => a.question_id));
    const all = uniq(S.attempts.map((a) => a.question_id));
    const pickR = shuffle(recent).slice(0, half);
    const pickA = shuffle(all.filter((id) => !pickR.includes(id))).slice(0, n - pickR.length);
    let set = [...pickR.map((id) => ({ qid: id, origin: 'recent' })), ...pickA.map((id) => ({ qid: id, origin: 'random' }))];
    if (set.length < n) set = set.concat(shuffle(S.questions.map((q) => q.id).filter((id) => !set.some((s) => s.qid === id))).slice(0, n - set.length).map((id) => ({ qid: id, origin: 'new' })));
    return shuffle(set);
  }
  function viewLearn() {
    const qz = S.ui.quiz;
    const learnedToday = S.attempts.filter((a) => a.at.slice(0, 10) === S.today).length;
    const head = `<div class="view-head"><div><h2>경영학습</h2><p>날짜에 묶이지 않고 원하는 만큼 풉니다. 정답 여부와 관계없이 한 문제당 XP +1.</p></div>
      <div class="row"><span class="pill num">XP ${S.xp} ${badge('측정')}</span><span class="pill num">오늘 ${learnedToday}문제</span></div></div>`;
    if (qz) {
      const item = qz.list[qz.idx]; const q = qById(item.qid); const ans = qz.answers[qz.idx];
      const originLabel = { recent: '최근 학습', random: '전체 이력 랜덤', new: '새 문제', study: q.subject }[item.origin];
      return head + `<section class="panel">
        <div class="row" style="justify-content:space-between"><b>${qz.mode === 'review' ? '오늘의 복습 도전' : esc(q.subject)} · ${qz.idx + 1}/${qz.list.length}</b><button type="button" class="btn sm" data-act="quitQuiz">그만하기</button></div>
        <div class="progress" style="margin:10px 0" aria-hidden="true">${qz.list.map((it, k) => `<span class="${qz.answers[k] != null ? 'done' : ''} ${qz.mode === 'review' && it.origin === 'recent' ? 'recent' : ''}"></span>`).join('')}</div>
        <div class="small muted">${esc(q.unit)} · <span class="chip">${originLabel}</span></div>
        <div class="q-stem">${esc(q.stem)}</div>
        <div class="choices">${q.choices.map((c, k) => `<button type="button" class="choice ${ans != null ? (k === q.answer ? 'right' : k === ans ? 'wrong' : '') : ''}" data-act="answer" data-k="${k}" ${ans != null ? 'disabled' : ''}>${'①②③④'[k]} ${esc(c)}</button>`).join('')}</div>
        ${ans != null ? `<div class="explain"><b>${ans === q.answer ? '정답' : '오답 — 다시 보기 목록에 추가'}</b> · XP +1<p style="margin:6px 0">${esc(q.explanation)}</p><div class="row small muted">${q.explanation_ai ? '<span class="b e">AI 생성 해설</span>' : ''}<span>출처: ${esc(q.source)} · 라이선스: ${esc(q.license)}</span></div></div>
          <div class="row" style="margin-top:12px">${qz.idx + 1 < qz.list.length ? '<button type="button" class="btn primary" data-act="nextQ">다음 문제</button>' : '<button type="button" class="btn primary" data-act="quitQuiz">결과 보고 마치기</button>'}</div>` : ''}
      </section>`;
    }
    const last = S.ui.lastResult;
    const recentN = new Set(S.attempts.filter((a) => a.at.slice(0, 10) >= dayStr(-6)).map((a) => a.question_id)).size;
    return head + `
      ${last ? `<div class="explain" role="status">방금 ${last.n}문제 · 정답 ${last.c}개 · XP +${last.n}${last.mode === 'review' ? ` · 구성: 최근 ${last.r} / 랜덤 ${last.a}${last.nw ? ` / 새 문제 ${last.nw}` : ''}` : ''}</div>` : ''}
      <section class="panel"><div class="row" style="justify-content:space-between"><div><h3>오늘의 복습 도전</h3><p class="small muted" style="margin:4px 0 0">10문제 = 최근 7일 학습 50% + 전체 학습 이력 랜덤 50%. 하루 여러 번 도전할 수 있습니다. (최근 7일 풀이 ${recentN}문항)</p></div><button type="button" class="btn primary" data-act="startReview">도전 시작</button></div></section>
      <section><h3 style="margin-bottom:10px">과목 선택</h3><div class="subjects">${S.SUBJECTS.map((s) => { const qs = S.questions.filter((q) => q.subject === s); const done = new Set(S.attempts.filter((a) => qs.some((q) => q.id === a.question_id)).map((a) => a.question_id)).size; return `<button type="button" class="subject" data-act="startSubject" data-v="${s}"><span class="n">${s}</span><span class="small muted num">${qs.length}문항 · 푼 문항 ${done}</span><div class="bar" style="width:100%"><i style="width:${qs.length ? 100 * done / qs.length : 0}%"></i></div></button>`; }).join('')}</div>
        <p class="small muted">목업 문항은 Claude가 쓴 샘플 27개입니다. 승인 후 아래 공개 데이터로 교체합니다.</p></section>
      <section class="panel"><div class="row" style="justify-content:space-between"><h3>다시 보기 (오답 ${S.wrong.length})</h3>${S.wrong.length ? '<button type="button" class="btn sm" data-act="startWrong">오답만 풀기</button>' : ''}</div>
        <ul style="margin:8px 0 0;padding-left:18px">${S.wrong.map((id) => { const q = qById(id); return `<li><span class="muted small">${esc(q.subject)}</span> ${esc(q.stem)}</li>`; }).join('') || '<li class="muted">오답이 없습니다.</li>'}</ul></section>
      ${viewSources()}`;
  }
  function viewSources() {
    const rows = [
      ['승인', 'Global-MMLU 한국어(ko) — CohereLabs', '한국어(전문 번역·검수)', 'MMLU 57과목 중 management, marketing, business_ethics, professional_accounting, 거시·미시경제, econometrics 등', 'Apache-2.0', '수입 권장. 상업 이용·수정·해설 추가 가능. 출처 표기.', 'https://huggingface.co/datasets/CohereLabs/Global-MMLU'],
      ['승인', 'OpenStax 경영 교재 (Principles of Management, Marketing, Introduction to Business, Organizational Behavior, Entrepreneurship, Principles of Economics)', '영어', '개념 읽기 본문 + 장별 복습 문제. "읽기" 단계 소재', 'CC BY 4.0 (교재별 확인)', '수입 권장. 번역·요약 허용, 출처 표기. Principles of Accounting은 CC BY-NC-SA라 제외 또는 비상업 조건 준수', 'https://openstax.org/subjects/business'],
      ['2순위', 'MMLU 원본 (cais/mmlu)', '영어', '위와 같은 과목, 영어 원문', 'MIT', '한국어판(Global-MMLU)이 있어 원문 대조용으로만', 'https://huggingface.co/datasets/cais/mmlu'],
      ['미사용', 'KMMLU (HAERAE-HUB)', '한국어(국가자격시험 기반)', 'Accounting, Management, Marketing, Economics, Taxation 등', 'CC BY-ND 4.0', '승인안에서 제외(변경 금지 라이선스)', 'https://huggingface.co/datasets/HAERAE-HUB/KMMLU'],
      ['보류', 'KMMLU-Redux / KMMLU-Pro (LGAI-EXAONE)', '한국어(전문자격)', '정제 2,587문항 / 전문자격 2,822문항', 'CC BY-NC-ND 4.0, 접근 동의 필요', '비상업·변경 금지. 사내 학습용이라도 법무 확인 전 사용 보류', 'https://huggingface.co/datasets/LGAI-EXAONE/KMMLU-Redux'],
      ['확인 필요', 'Virginia Tech "Strategic Management" 공개 교재', '영어', '전략경영 개념·문항', '교재 페이지에서 확인', '착수 시 라이선스 재확인', ''],
      ['제외', '큐넷 등 시험 기출 원문', '한국어', '-', '저작권 별도', '무단 수입 금지', '']
    ];
    return `<section class="panel" aria-labelledby="h-src"><h3 id="h-src">문제은행 공개 자료 (Claude 추천 · 회장 승인)</h3>
      <p class="small muted" style="margin:4px 0 10px">2026-11-02 조사. 라이선스는 수입 직전 각 데이터 카드에서 다시 확인합니다. 모든 문항에 source·license·원문 ID를 보존합니다.</p>
      <div class="tbl-wrap"><table><thead><tr><th>판단</th><th>자료</th><th>언어</th><th>범위</th><th>라이선스</th><th>쓰는 방법</th></tr></thead><tbody>
      ${rows.map((r) => `<tr><td><span class="pill ${r[0] === '승인' ? 'st-done' : r[0] === '제외' || r[0] === '보류' || r[0] === '미사용' ? 'st-hold' : ''}">${r[0]}</span></td><td>${r[6] ? `<a href="${r[6]}" target="_blank" rel="noopener">${esc(r[1])}</a>` : esc(r[1])}</td><td>${r[2]}</td><td class="small">${r[3]}</td><td class="small">${r[4]}</td><td class="small">${r[5]}</td></tr>`).join('')}
      </tbody></table></div>
      <p class="small" style="margin:10px 0 0"><b>추천 조합</b> · 문제는 Global-MMLU 한국어판, 개념 읽기는 OpenStax 요약, 해설이 없는 문항만 AI 해설(표시 필수). 과목 9개를 이 자료 범위에 맞춰 확정합니다.</p></section>`;
  }

  /* ---------- ⑤ AI 사용 ---------- */
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

  /* ---------- ⑥ 경영 현황 ---------- */
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

  /* ---------- ⑦ 보상 기준 ---------- */
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
      <section class="panel"><h3>협상 로그 전문</h3>${negos.length ? negos.map((n) => `<div class="nego" style="margin-top:8px"><span class="small muted">${esc(n.title)} · ${n.round}차</span><span><b>회장</b> ${esc(n.chairman_msg)}</span><span><b>Claude</b> [${n.verdict}] ${esc(n.claude_reply)} (N → ${n.n_after.toFixed(2)})</span></div>`).join('') : '<p class="muted small" style="margin:6px 0 0">아직 협상 기록이 없습니다. ③ 성과·레벨에서 평가 건에 이의를 제기하면 여기에 남습니다.</p>'}</section>`;
  }

  /* ---------- 라우팅 ---------- */
  const IC = {
    directives: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 3h6v3H9zM8.5 11h7M8.5 15h4.5"/>',
    ideas: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9V16h7v-2.1A6 6 0 0 0 12 3z"/>',
    ops: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
    value: '<path d="M4 17l5-5 4 3 7-8"/><path d="M15 7h5v5"/>',
    rules: '<circle cx="12" cy="12" r="8"/><path d="M9 12h6M12 9v6"/>',
    learn: '<path d="M4 5h6a2 2 0 0 1 2 2v13a2 2 0 0 0-2-2H4zM20 5h-6a2 2 0 0 0-2 2v13a2 2 0 0 1 2-2h6z"/>',
    ai: '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/>'
  };
  const icon = (id) => `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[id]}</svg>`;
  const TABS = [['directives', '지시 관리', viewDirectives, '업무'], ['ideas', '신사업', viewIdeas, '업무'], ['ops', '경영 현황', viewOps, '업무'], ['value', '성과·레벨', viewValue, '성과'], ['rules', '보상 기준', viewRules, '성과'], ['learn', '경영학습', viewLearn, '학습·AI'], ['ai', 'AI 사용', viewAI, '학습·AI']];
  /* 테마: 시스템 설정을 따르되, 버튼으로 바꾸면 이 브라우저에 기억 */
  const isDark = () => { const t = document.documentElement.dataset.theme; return t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches; };
  try { const t = localStorage.getItem('myboard.theme'); if (t) document.documentElement.dataset.theme = t; } catch (e) { /* */ }
  function syncThemeBtn() { const b = document.getElementById('themeBtn'); if (b) b.textContent = isDark() ? '밝게 보기' : '어둡게 보기'; }
  const curTab = () => { const h = location.hash.slice(1); return TABS.some((t) => t[0] === h) ? h : 'directives'; };
  function render() {
    renderTop();
    const tab = curTab();
    $('#tabbar').innerHTML = TABS.map(([id, label, , group], k) => (k === 0 || TABS[k - 1][3] !== group ? `<div class="side-label">${group}</div>` : '') + `<button type="button" role="tab" aria-selected="${id === tab}" data-act="tab" data-v="${id}">${icon(id)}${label}</button>`).join('');
    syncThemeBtn();
    $('#view').innerHTML = TABS.find((t) => t[0] === tab)[2]();
    save();
  }
  window.addEventListener('hashchange', render);

  /* ---------- 이벤트 ---------- */
  const setFilter = (patch) => { S.ui.filter = Object.assign({}, currentFilter(), patch); };
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]'); if (!el || el.tagName === 'SELECT') return;
    const { act, id, v, k } = el.dataset;
    const task = id && S.dailyTasks.find((t) => t.id === id);
    switch (act) {
      case 'tab': location.hash = v; return;
      case 'briefTab': S.ui.briefTab = v; break;
      case 'dirView': S.ui.dirView = v; break;
      case 'fMode': setFilter({ mode: v }); break;
      case 'fTag': { const f = currentFilter(); setFilter({ tags: f.tags.includes(id) ? f.tags.filter((x) => x !== id) : [...f.tags, id] }); break; }
      case 'fReset': S.ui.filter = null; break;
      case 'saveView': $('#saveViewBox').innerHTML = `<form class="form" data-form="view" style="margin-top:10px"><label class="f">보기 이름<input type="text" id="sv-name" name="name" required placeholder="예: 이번 주 긴급"></label><div><button class="btn primary sm">저장</button></div></form>`; $('#sv-name').focus(); return;
      case 'loadView': S.ui.filter = clone(S.savedViews.find((x) => x.id === id).filter); break;
      case 'delView': S.savedViews = S.savedViews.filter((x) => x.id !== id); break;
      case 'editTag': S.ui.editTag = id; break;
      case 'cancelEditTag': S.ui.editTag = null; break;
      case 'askDelTag': S.ui.delTag = id; break;
      case 'cancelDelTag': S.ui.delTag = null; break;
      case 'delTag': S.tags = S.tags.filter((t) => t.id !== id); S.directives.forEach((d) => d.tags = d.tags.filter((x) => x !== id)); S.ideas.forEach((i) => i.tags = i.tags.filter((x) => x !== id)); S.ui.delTag = null; if (S.ui.filter) S.ui.filter.tags = S.ui.filter.tags.filter((x) => x !== id); toast('태그를 삭제했습니다'); break;
      case 'tagUp': { const sorted = S.tags.slice().sort((a, b) => a.sort - b.sort); const i = sorted.findIndex((t) => t.id === id); if (i > 0) { const s = sorted[i].sort; sorted[i].sort = sorted[i - 1].sort; sorted[i - 1].sort = s; } break; }
      case 'tStart': task.started_at = Date.now(); break;
      case 'tStop': task.ended_at = Date.now(); task.actual_minutes = Math.max(1, Math.round((task.ended_at - task.started_at) / 60000)); task.time_source = '측정'; break;
      case 'tManual': S.ui.manual = id; break;
      case 'cancelManual': S.ui.manual = null; break;
      case 'tComplete': S.ui.completing = id; break;
      case 'cancelComplete': S.ui.completing = null; break;
      case 'confirm': { const a = S.achievements.find((x) => x.id === id); a.status = '확정'; a.confirmed_at = S.today; S.wallet.balance_won += a.value_won; S.wallet.total_won += a.value_won; toast(`${kwon(a.value_won)}천원을 적립했습니다`); break; }
      case 'levelUp': if (S.wallet.balance_won >= LEVEL_COST) { S.wallet.balance_won -= LEVEL_COST; S.wallet.level += 1; S.levelUps.push({ id: uid('lu'), spent_won: LEVEL_COST, level_after: S.wallet.level, at: S.today }); toast(`Lv.${S.wallet.level} 달성`); } break;
      case 'startReview': S.ui.quiz = { mode: 'review', list: reviewSet(10), idx: 0, answers: {} }; S.ui.lastResult = null; break;
      case 'startSubject': S.ui.quiz = { mode: 'study', list: shuffle(S.questions.filter((q) => q.subject === v)).map((q) => ({ qid: q.id, origin: 'study' })), idx: 0, answers: {} }; S.ui.lastResult = null; break;
      case 'startWrong': S.ui.quiz = { mode: 'wrong', list: S.wrong.map((qid) => ({ qid, origin: 'study' })), idx: 0, answers: {} }; S.ui.lastResult = null; break;
      case 'answer': {
        const qz = S.ui.quiz; const it = qz.list[qz.idx]; const q = qById(it.qid); const ch = +k;
        qz.answers[qz.idx] = ch; const ok = ch === q.answer;
        S.attempts.push({ id: uid('at'), question_id: q.id, chosen: ch, correct: ok, mode: qz.mode === 'review' ? '복습도전' : '학습', at: new Date().toISOString() });
        S.xp += 1;
        if (!ok && !S.wrong.includes(q.id)) S.wrong.push(q.id);
        if (ok && qz.mode === 'wrong') S.wrong = S.wrong.filter((x) => x !== q.id);
        break;
      }
      case 'nextQ': S.ui.quiz.idx += 1; break;
      case 'quitQuiz': {
        const qz = S.ui.quiz; const idxs = Object.keys(qz.answers).map(Number);
        S.ui.lastResult = idxs.length ? { mode: qz.mode, n: idxs.length, c: idxs.filter((i) => qz.answers[i] === qById(qz.list[i].qid).answer).length, r: qz.list.filter((x) => x.origin === 'recent').length, a: qz.list.filter((x) => x.origin === 'random').length, nw: qz.list.filter((x) => x.origin === 'new').length } : null;
        S.ui.quiz = null; break;
      }
      case 'copyMd': copyMarkdown(); return;
      case 'theme': { const t = isDark() ? 'light' : 'dark'; document.documentElement.dataset.theme = t; try { localStorage.setItem('myboard.theme', t); } catch (er) { /* */ } syncThemeBtn(); return; }
      case 'reset': try { localStorage.removeItem(KEY); } catch (er) { /* */ } location.reload(); return;
      default: return;
    }
    render();
  });
  document.addEventListener('change', (e) => {
    const el = e.target; const act = el.dataset.act; if (!act) return;
    if (act === 'dirStatus') { const d = S.directives.find((x) => x.id === el.dataset.id); d.status = el.value; d.updated_at = S.today; toast(`상태 변경 → ${el.value} (Asana 반영 예정)`); }
    else if (act === 'ideaStage') { S.ideas.find((x) => x.id === el.dataset.id).stage = el.value; }
    else if (act === 'fField') { setFilter({ [el.dataset.k]: el.value }); }
    else return;
    render();
  });
  document.addEventListener('submit', (e) => {
    const form = e.target; const kind = form.dataset.form; if (!kind) return;
    e.preventDefault();
    const fd = new FormData(form); const g = (n) => (fd.get(n) || '').toString().trim();
    switch (kind) {
      case 'oneThing': S.ui.oneThing = { title: g('title'), done: g('done') }; break;
      case 'directive': S.directives.push({ id: uid('d'), title: g('title'), body: '', org: g('org'), assignee: g('assignee') || '미지정', issued_at: S.today, due_at: g('due_at') || dayStr(7), priority: g('priority'), status: '지시', tags: fd.getAll('tags'), source_url: g('source_url'), result_url: '', memo: '', updated_at: S.today, asana_gid: uid('mock-') }); toast('지시를 등록했습니다 (Asana 태스크 생성은 목업 표시)'); break;
      case 'view': S.savedViews.push({ id: uid('v'), name: g('name'), filter: clone(currentFilter()) }); toast('보기를 저장했습니다'); break;
      case 'tag': {
        const color = /^#[0-9a-fA-F]{6}$/.test(g('color')) ? g('color') : '#F29801';
        if (S.ui.editTag) { Object.assign(tagById(S.ui.editTag), { name: g('name'), color, description: g('description') }); S.ui.editTag = null; }
        else S.tags.push({ id: uid('t'), name: g('name'), color, description: g('description'), sort: Math.max(0, ...S.tags.map((t) => t.sort)) + 1 });
        break;
      }
      case 'idea': S.ideas.push({ id: uid('i'), title: g('title'), summary: g('summary'), stage: '아이디어', owner: g('owner') || '담당 미정', s: [0, 1, 2, 3].map((k) => +g('s' + k)), next_action: g('next_action'), next_due: g('next_due') || dayStr(7), tags: fd.getAll('tags'), links: '', notes: [] }); break;
      case 'task': { const est = Math.max(5, +g('est') || 60); S.dailyTasks.push({ id: uid('k'), date: S.today, title: g('title'), est_minutes: est, est_value: Math.round(est / 60 * HOUR_VALUE * 3 / 1000) * 1000, started_at: null, ended_at: null, actual_minutes: null, time_source: null, done: false }); toast('예상 소요·가치를 산정했습니다(목업 규칙)'); break; }
      case 'manual': { const t = S.dailyTasks.find((x) => x.id === S.ui.manual); t.actual_minutes = Math.max(1, +g('min') || 1); t.time_source = '수기'; t.started_at = t.started_at || Date.now(); S.ui.manual = null; break; }
      case 'complete': {
        const t = S.dailyTasks.find((x) => x.id === S.ui.completing);
        const a = evaluate({ id: uid('a'), title: t.title, date: S.today, output_url: g('output_url'), output_type: g('output_type'), headcount: Math.max(1, +g('headcount') || 1), by_agent: g('by_agent') === '1', saved_hours: +g('saved_hours') || 0, months: +g('months') || 1, monthly_revenue: +g('monthly_revenue') || 0, monthly_cost: +g('monthly_cost') || 0, one_off: g('one_off') === '1', est_minutes: t.est_minutes, actual_minutes: t.actual_minutes, N: 1, status: '평가중', negotiations: [] });
        S.achievements.push(a); t.done = true; S.ui.completing = null; toast(`평가 완료: ${kwon(a.value_won)}천원`); break;
      }
      case 'nego': {
        const a = S.achievements.find((x) => x.id === form.dataset.id); const msg = g('msg'); if (!msg) return;
        const hasNum = /\d/.test(msg); const long = msg.length >= 25;
        let verdict, inc, reply;
        if (hasNum && long) { verdict = '수용'; inc = 0.1; reply = '수치 근거가 있어 반영합니다. 실측값은 확정 후 2주 내 증빙을 붙여 주세요.'; }
        else if (long || hasNum) { verdict = '부분수용'; inc = 0.05; reply = '방향은 타당하나 증빙이 부족해 일부만 반영합니다. 실측 수치나 영향 인원 증빙이 있으면 다시 제시해 주세요.'; }
        else { verdict = '거절'; inc = 0; reply = '근거가 없어 반영하지 않습니다. 기준: 실측 데이터·영향 인원 증빙·재사용 가능성.'; }
        const nAfter = Math.min(1.3, +(a.N + inc).toFixed(2));
        a.negotiations.push({ round: a.negotiations.length + 1, chairman_msg: msg, claude_reply: reply + ' (목업 규칙 심사)', verdict, n_after: nAfter, created_at: S.today });
        a.N = nAfter; a.status = '협상중'; evaluate(a); break;
      }
      default: return;
    }
    render();
  });

  function copyMarkdown() {
    const lines = [`# 회장 개인현황판 — ${S.today}`, '', '## 지시 현황', ...S.directives.filter(isOpen).map((d) => `- [${d.status}] ${d.title} · ${d.org} · 기한 ${d.due_at}${isOverdue(d) ? ' ⚠ 기한 경과' : ''}`), '', '## 신사업', ...S.ideas.map((i) => `- ${i.title} (${i.stage}) — 다음: ${i.next_action} ~${i.next_due}`), '', `## 수익가치·레벨`, `- Lv.${S.wallet.level} · 잔액 ${kwon(S.wallet.balance_won)}천원 · 누적 ${kwon(S.wallet.total_won)}천원`, `- 학습 XP ${S.xp}`];
    const text = lines.join('\n');
    const fallback = () => { const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); toast('Markdown을 복사했습니다'); } catch (er) { toast('복사가 막혀 있습니다'); } ta.remove(); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(() => toast('Markdown을 복사했습니다(옵시디언에 붙여넣기)'), fallback); else fallback();
  }

  render();
})();
