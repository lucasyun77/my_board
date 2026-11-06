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
        `회장 대기함 <b>${S.waiting.length}건</b>` + (S.waiting.length ? ` — 최장 ${Math.max(...S.waiting.map((w) => days(w.since, S.today)))}일 대기` : ' — 모두 처리됨'),
        `어제 확정 수익가치 <b>${kwon(yVal)}천원</b>, 최근 7일 학습 <b>${recentAttempts}문제</b>`
      ],
      '주': [`이번 주 확정 수익가치 <b>${kwon(sumConfirmed(dayStr(-6)))}천원</b>`, `완료된 지시 ${S.directives.filter((d) => d.status === '완료' && d.updated_at >= dayStr(-6)).length}건 / 신규 지시 ${S.directives.filter((d) => d.issued_at >= dayStr(-6)).length}건`, `PoC 단계 신사업 ${S.ideas.filter((i) => i.stage === 'PoC').length}건`],
      '월': [`이번 달 확정 수익가치 <b>${kwon(sumConfirmed(dayStr(-29)))}천원</b>`, `지시 이행률 ${Math.round(100 * S.directives.filter((d) => d.status === '완료').length / S.directives.length)}%`, `누적 학습 XP ${S.xp}`]
    }[bt];
    const one = S.ui.oneThing || { title: overdue[0] ? overdue[0].title : '신사업 파이프라인 점검', done: '담당자 보고를 받고 다음 기한을 확정한다' };
    const todayTxt = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
    const focusN = overdue.length + dueToday.length + S.waiting.length;
    $('#top').innerHTML = `
      <div class="hello" style="--hero-img:url('${new URL(ASSETS.heroBg, location.href).href}')">
        <div><div class="date">${todayTxt}</div>
          <h1>회장님, 오늘 챙길 일은 <em>${focusN}건</em>입니다</h1>
          <p class="hsub">기한 경과 ${overdue.length} · 오늘 기한 ${dueToday.length} · 결재 대기 ${S.waiting.length}</p></div>
        <div class="lvbadge"><div class="lv num">Lv.${S.wallet.level}</div><small>잔액 ${kwon(S.wallet.balance_won)}천원</small></div>
        <div class="hero-char"><div class="caption"><small>비서실장 서하</small>${overdue.length ? `“기한 지난 건부터<br>보고드리겠습니다.”` : `“오늘 일정은<br>순조롭습니다.”`}</div><div class="portrait-frame"><img src="${ASSETS.profile}" alt="서하 실장" width="150" height="173"></div></div>
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

  const guide = (pose, title, text) => `<div class="guide">${ART.mascot(pose, 108)}<p><b>${title}</b><br>${text}</p></div>`;

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
  /* 메뉴 파일(js/views/*.js)에 공용 도구를 넘긴다 */
  window.APP = { clone, S, save, RATE, HOUR_VALUE, LEVEL_COST, STATUSES, STAGES, F_TYPES, L_TABLE, $, esc, won, kwon, days, md, BADGE, badge, tagById, chip, uid, shuffle, toast, isOpen, isOverdue, isStale, Lof, Sof, evaluate, sumConfirmed, dayStr, guide, currentFilter, applyFilter, prioPill, statPill, statusSelect, qById, reviewSet, views: {}, acts: {}, forms: {}, changes: {} };


  /* ---------- ② 신사업 ---------- */

  /* ---------- 메인 대시보드 (회장 현황판 로고) ---------- */
  function viewHome() {
    const tasks = S.dailyTasks.filter((t) => t.date === S.today);
    const doneT = tasks.filter((t) => t.done).length;
    const due = S.directives.filter((d) => isOpen(d) && d.due_at <= S.today);
    const stages = ['아이디어', '검증', 'PoC', '론칭'].map((st) => [st, S.ideas.filter((i) => i.stage === st).length]);
    const u = S.usage[S.usage.length - 1];
    const recent = S.attempts.filter((a) => a.at.slice(0, 10) >= dayStr(-6)).length;
    const card = (tab, title, body) => `<section class="panel"><div class="row" style="justify-content:space-between;margin-bottom:8px"><h3>${title}</h3><button type="button" class="btn sm" data-act="tab" data-v="${tab}">열기 →</button></div>${body}</section>`;
    return `<div class="grid2">
      ${card('today', '오늘 할 일', `<div class="small muted">내 할 일 ${doneT}/${tasks.length} 완료 · 오늘까지 기한 지시 ${due.length}건</div><ul style="margin:8px 0 0;padding-left:18px">${[...due.map((d) => `<li>${esc(d.title)} <span class="small muted">${esc(d.org)}</span></li>`), ...tasks.filter((t) => !t.done).map((t) => `<li>${esc(t.title)} <span class="small muted">내 할 일</span></li>`)].slice(0, 4).join('') || '<li class="muted">남은 일이 없습니다.</li>'}</ul>`)}
      ${card('ideas', '신사업 파이프라인', `<div class="row" style="gap:10px">${stages.map(([st, n]) => `<div style="flex:1;min-width:70px;background:var(--paper2);border-radius:12px;padding:10px;text-align:center"><div class="small muted">${st}</div><div class="num" style="font-size:22px;font-weight:900">${n}</div></div>`).join('')}</div>`)}
      ${card('ai', 'AI 사용 · 오늘', `<div class="row" style="gap:24px"><div><div class="small muted">토큰 ${badge('측정')}</div><div class="num" style="font-size:22px;font-weight:900">${((u.input_tokens + u.output_tokens) / 1e6).toFixed(2)}M</div></div><div><div class="small muted">비용 ${badge('측정')}</div><div class="num" style="font-size:22px;font-weight:900">${won(u.cost_usd * RATE)}원</div></div><div><div class="small muted">ChatGPT·Gemini</div><div>${badge('미확인')}</div></div></div>`)}
      ${card('learn', '경영학습', `<div class="row" style="gap:24px"><div><div class="small muted">누적 XP ${badge('측정')}</div><div class="num" style="font-size:22px;font-weight:900">${S.xp}</div></div><div><div class="small muted">최근 7일 풀이</div><div class="num" style="font-size:22px;font-weight:900">${recent}문제</div></div><div><div class="small muted">다시 보기</div><div class="num" style="font-size:22px;font-weight:900">${S.wrong.length}문제</div></div></div>`)}
    </div>`;
  }

  /* ---------- 오늘 할 일 ---------- */

  /* ---------- ③ 성과·레벨 ---------- */

  /* ---------- ④ 경영학습 ---------- */


  /* ---------- ⑤ AI 사용 ---------- */

  /* ---------- ⑥ 경영 현황 ---------- */

  /* ---------- ⑦ 보상 기준 ---------- */

  /* ---------- 라우팅 ---------- */
  const TABS = [['today', '오늘 할 일', null, '#3D1E0F'], ['numbers', '내가 보는 숫자', null, '#1F2A4D'], ['directives', '지시 관리', null, '#E9A400'], ['ideas', '신사업', null, '#E46F8C'], ['value', '성과·레벨', null, '#2E8B57'], ['learn', '경영학습', null, '#5B6FB8'], ['ai', 'AI 사용', null, '#2F8C7A'], ['ops', '경영 현황', null, '#8C6A4F'], ['ideabank', '아이디어뱅크', null, '#C0392B']];
  // 사이드 메뉴에는 없지만 링크로 여는 화면(보상 기준은 성과·레벨의 버튼으로 연다). 값 = 사이드에서 켜 둘 메뉴
  const SUB_ROUTES = { rules: 'value' };
  /* 테마: 시스템 설정을 따르되, 버튼으로 바꾸면 이 브라우저에 기억 */
  const isDark = () => { const t = document.documentElement.dataset.theme; return t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches; };
  try { const t = localStorage.getItem('myboard.theme'); if (t) document.documentElement.dataset.theme = t; } catch (e) { /* */ }
  function syncThemeBtn() { const b = document.getElementById('themeBtn'); if (b) b.textContent = isDark() ? '밝게 보기' : '어둡게 보기'; }
  const curTab = () => { const h = location.hash.slice(1); return TABS.some((t) => t[0] === h) || SUB_ROUTES[h] ? h : 'home'; };
  function render() {
    const tab = curTab();
    const isHome = tab === 'home';
    const bf = document.getElementById('brandFace'); if (bf && !bf.firstChild) bf.innerHTML = ART.face(44);
    if (isHome) renderTop(); else $('#top').innerHTML = '';
    $('#tabbar').innerHTML = TABS.map(([id, label, , color]) => `<button type="button" role="tab" aria-selected="${id === tab || id === SUB_ROUTES[tab]}" data-act="tab" data-v="${id}"><span class="ico" style="background:${color}"></span>${label}</button>`).join('');
    syncThemeBtn();
    $('#view').innerHTML = isHome ? viewHome() : (APP.views[tab] ? APP.views[tab]() : '<p class="muted">이 메뉴 파일을 불러오지 못했습니다.</p>');
    save();
  }
  window.addEventListener('hashchange', () => { render(); window.scrollTo(0, 0); });

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
      default: if (APP.acts[act]) { APP.acts[act](el); break; } return;
    }
    render();
  });
  document.addEventListener('change', (e) => {
    const el = e.target; const act = el.dataset.act; if (!act) return;
    if (act === 'dirStatus') { const d = S.directives.find((x) => x.id === el.dataset.id); d.status = el.value; d.updated_at = S.today; toast(`상태 변경 → ${el.value} (Asana 반영 예정)`); }
    else if (act === 'ideaStage') { S.ideas.find((x) => x.id === el.dataset.id).stage = el.value; }
    else if (act === 'fField') { setFilter({ [el.dataset.k]: el.value }); }
    else if (APP.changes[act]) { APP.changes[act](el); }
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
      default: if (APP.forms[kind]) { APP.forms[kind](fd, form); break; } return;
    }
    render();
  });

  function copyMarkdown() {
    const lines = [`# 회장 개인현황판 — ${S.today}`, '', '## 지시 현황', ...S.directives.filter(isOpen).map((d) => `- [${d.status}] ${d.title} · ${d.org} · 기한 ${d.due_at}${isOverdue(d) ? ' ⚠ 기한 경과' : ''}`), '', '## 신사업', ...S.ideas.map((i) => `- ${i.title} (${i.stage}) — 다음: ${i.next_action} ~${i.next_due}`), '', `## 수익가치·레벨`, `- Lv.${S.wallet.level} · 잔액 ${kwon(S.wallet.balance_won)}천원 · 누적 ${kwon(S.wallet.total_won)}천원`, `- 학습 XP ${S.xp}`];
    const text = lines.join('\n');
    const fallback = () => { const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); toast('Markdown을 복사했습니다'); } catch (er) { toast('복사가 막혀 있습니다'); } ta.remove(); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(() => toast('Markdown을 복사했습니다(옵시디언에 붙여넣기)'), fallback); else fallback();
  }

  /* 메뉴 파일이 모두 읽힌 뒤 그린다 */
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render); else setTimeout(render, 0);
})();
