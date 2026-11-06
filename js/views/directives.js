/* 메뉴: 지시 관리 (directives) — 이 메뉴 담당 하위 세션은 이 파일만 고칩니다.
   공용 도구·상태는 window.APP에서 꺼내 씁니다. 새 버튼 동작은 APP.acts['이름'] = (el) => {...},
   새 폼은 APP.forms['이름'] = (fd, form) => {...}, 새 select 변경은 APP.changes['이름'] = (el) => {...} 로 등록합니다.
   태그 필터·저장된 보기·태그 저장/삭제 확인 이벤트(fTag, fMode, fField, fReset, saveView, loadView, delView,
   askDelTag, delTag, cancelDelTag, cancelEditTag, dirStatus, form 'tag'·'view')는 js/app.js 것을 그대로 씁니다.

   실데이터 연결(claude.ai 아티팩트로 열었을 때만):
   - Asana: 회장 커넥터로 "[지시업무] ceo 윤석범" 프로젝트를 읽고, 상태·기한·우선순위·이름 변경은 update_tasks,
     메모·결과물은 add_comment, 신규 등록은 create_tasks 로 되돌려 보냅니다.
   - 목표: 아티팩트 DB live/goals(부서현황판의 전사목표·부서목표 정의), track/<id>(진척·메모)에서 읽고 씁니다.
   - 화면 규칙: 고를 항목이 많은 칸(사람 등)은 select 대신 입력해서 찾는 칸(picker: 이름·부서·초성, ↑↓·Enter·Esc)을 씁니다.
   - 실데이터는 저장소에 넣지 않습니다. 로컬 파일로 열면 기존 목업 그대로 동작합니다. */
(function () {
  'use strict';
  const { S, STATUSES, $, esc, days, md, badge, tagById, chip, uid, toast, isOpen, isOverdue, isStale, dayStr, currentFilter, applyFilter, prioPill, statPill, statusSelect } = window.APP;
  const PRIOS = ['긴급', '높음', '보통'];
  const PRIO_RANK = { '긴급': 0, '높음': 1, '보통': 2 };
  const NONE_DUE = '2099-12-31';

  /* ---------- 추가 샘플 데이터 (data.js는 건드리지 않음) ---------- */
  if (!S.dirExtraAdded) {
    const D = dayStr;
    S.directives.push(
      { id: 'd9', title: '블랙라벨 매장 위생 점검표 디지털화', body: '종이 점검표를 태블릿 체크리스트로 바꾸고 사진 증빙을 남긴다', org: '블랙라벨사업부', assignee: '담당 I', issued_at: D(-8), due_at: D(2), priority: '높음', status: '진행', tags: ['t1', 't4'], source_url: '#', result_url: '', memo: '', updated_at: D(-4), asana_gid: 'mock-1009' },
      { id: 'd10', title: '벌툰 신규 가맹 상담 스크립트 개정', body: '상담 단계별 질문·답변 표준안', org: '벌툰사업부', assignee: '담당 J', issued_at: D(-5), due_at: D(6), priority: '보통', status: '보고대기', tags: ['t3'], source_url: '#', result_url: '#', memo: '초안 제출, 회장 검토 대기', updated_at: D(-3), asana_gid: 'mock-1010' },
      { id: 'd11', title: '생전포차 해외 상표 출원 현황 점검', body: '진출 후보국 상표 출원·등록 상태 확인', org: '생전포차사업부', assignee: '담당 K', issued_at: D(-14), due_at: D(-1), priority: '긴급', status: '진행', tags: ['t6', 't4'], source_url: '#', result_url: '', memo: '2개국 회신 대기', updated_at: D(-2), asana_gid: 'mock-1011' },
      { id: 'd12', title: '결재 라인 간소화안', body: '3단계 이상 결재를 2단계로 줄이는 안', org: '경영지원본부', assignee: '담당 L', issued_at: D(-18), due_at: D(-4), priority: '보통', status: '완료', tags: ['t2'], source_url: '#', result_url: '#', memo: '', updated_at: D(-5), asana_gid: 'mock-1012' }
    );
    if (!S.savedViews.some((v) => v.id === 'v2')) S.savedViews.push({ id: 'v2', name: '긴급·기한 경과', filter: { tags: [], mode: 'OR', status: 'open', org: '', due: 'overdue', prio: '', q: '' } });
    S.dirExtraAdded = true;
  }

  /* ================= 실데이터 연결 (Asana 커넥터 + 아티팩트 DB) ================= */
  const ASANA = {
    server: 'Asana', project: '1215561846717757',
    sec: { '지시': '1215612428940530', '진행': '1215612428940532', '보고대기': '1215612428940534', '완료': '1215612428940536', '보류': '1215612428940538' },
    secName: { '지시할일후보': '지시', '수행 중': '진행', '대기': '보고대기', '완료': '완료', '보류중': '보류', '취소': '보류' },
    prioField: '1215612528697109', prioOpt: { '높음': '1215612528697112', '중간': '1215612528697111', '낮음': '1215612528697110' },
    brandField: '1215612428940515',
    fields: 'name,assignee.name,assignee.email,completed_at,due_on,created_at,modified_at,completed,memberships.section.name,memberships.project.gid,permalink_url,custom_fields.name,custom_fields.display_value'
  };
  const hasClaude = !!(window.claude && typeof window.claude.use === 'function');
  const OVR = {}; /* 화면에서 바꾼 값: Asana가 따라올 때까지(최대 10분) 유지 */
  const LIVE = { state: hasClaude ? 'loading' : 'off', db: null, mcp: null, people: {}, staff: [], cw: {}, cfg: null, reps: {}, plan: null, prog: {}, goals: null, goalsAt: '', track: {}, asana: null, asanaAt: 0, asanaFrom: '', asanaErr: null, busy: false, timer: null };
  const LIVE_TAGS = [
    ['lb-PC', '아이센스PC', '#2F6E4E', 'Asana 브랜드 필드'], ['lb-BT', '벌툰', '#C0392B', 'Asana 브랜드 필드'], ['lb-KK', '꼬치의품격', '#B7791F', 'Asana 브랜드 필드'], ['lb-SJ', '생전포차', '#D45D8C', 'Asana 브랜드 필드'],
    ['lk-지시', '업무지시', '#5B6FB8', '제목 머리말 [업무지시]'], ['lk-기획', '기획지시', '#2F8C7A', '제목 머리말 [기획지시]'], ['lk-보고', '보고요청', '#8C6A4F', '제목 머리말 [보고요청]'], ['lk-회장', '회장 할일', '#3D1E0F', '제목 머리말 [회장 할일]'],
    ['th-T1', '가맹 성장', '#E9A400', '전사목표 테마'], ['th-T2', '기존점 매출', '#3D7A4E', '전사목표 테마'], ['th-T3', '생전포차·신사업', '#B4412F', '전사목표 테마'], ['th-T4', 'AI·업무혁신', '#F29801', '전사목표 테마'], ['th-T5', '조직·문화', '#4A6A8A', '전사목표 테마'], ['th-T6', '브랜드·마케팅', '#8A5A9A', '전사목표 테마']
  ];
  const SRC_LABEL = { asana: 'Asana 지시', goal_c: '전사목표', goal_d: '부서목표' };
  const isGoal = (d) => d.src === 'goal_c' || d.src === 'goal_d';
  const isAsana = (d) => d.src === 'asana';
  const stl = (d) => !isGoal(d) && isStale(d);

  /* 데이터가 들어오면 다시 그린다 — 입력 중이면 포커스가 빠질 때까지 미룬다 */
  let pendingRender = false; let lastTyped = 0;
  document.addEventListener('input', () => { lastTyped = Date.now(); }, true);
  function rerender() {
    const a = document.activeElement;
    if (a && /^(INPUT|TEXTAREA)$/.test(a.tagName) && a.closest('#view') && Date.now() - lastTyped < 3000) { pendingRender = true; clearTimeout(LIVE.rrT); LIVE.rrT = setTimeout(rerender, 3200); return; }
    const b = document.createElement('button'); b.type = 'button'; b.dataset.act = 'dirRefresh'; b.hidden = true;
    document.body.appendChild(b); b.click(); b.remove();
  }
  document.addEventListener('focusout', () => { if (pendingRender) { pendingRender = false; setTimeout(rerender, 0); } });

  function fromAsana(t) {
    const mem = (t.memberships || []).find((m) => m && m.project && m.project.gid === ASANA.project);
    const sec = mem && mem.section ? mem.section.name : '';
    let status = ASANA.secName[sec] || '지시';
    if (t.completed) status = '완료';
    const cf = (gid, name) => { const f = (t.custom_fields || []).find((x) => (x.gid === gid || x.name === name) && x.display_value); return f ? String(f.display_value) : ''; };
    const p = cf(ASANA.prioField, '우선순위');
    const priority = p === '높음' ? '높음' : '보통';
    const tags = [];
    cf(ASANA.brandField, '브랜드').split(',').map((s) => s.trim()).forEach((b) => { const tg = LIVE_TAGS.find((x) => x[1] === b); if (tg) tags.push(tg[0]); });
    const name = String(t.name || '').trim();
    const km = name.match(/^\[(업무지시|기획지시|보고요청|회장 할일)\]/); if (km) tags.push({ '업무지시': 'lk-지시', '기획지시': 'lk-기획', '보고요청': 'lk-보고', '회장 할일': 'lk-회장' }[km[1]]);
    const who = t.assignee && t.assignee.name ? String(t.assignee.name) : '';
    const org = who === '윤석범' ? '회장' : (LIVE.people[who] || (/전직원/.test(name) ? '전사' : '미지정'));
    const tr = LIVE.track['a' + t.gid] || {};
    const d = {
      id: 'a' + t.gid, src: 'asana', title: name, body: '', org, assignee: who || '미지정',
      issued_at: String(t.created_at || '').slice(0, 10) || S.today, due_at: t.due_on || NONE_DUE,
      priority: tr.priority === '긴급' && priority === '높음' ? '긴급' : priority, status, tags,
      source_url: t.permalink_url || '', result_url: tr.result_url || '', memo: tr.memo || '',
      updated_at: String(t.modified_at || '').slice(0, 10) || S.today, asana_gid: String(t.gid), section: sec,
      completed_at: t.completed_at || '', assignee_email: t.assignee && t.assignee.email ? String(t.assignee.email) : '',
      ack: tr.ack || (status === '완료' && ((t.completed_at && t.completed_at < ACK_LAUNCH) || (!t.completed_at && String(t.modified_at || '') < ACK_LAUNCH)) ? 'before' : ''),
      log: Array.isArray(tr.log) ? tr.log.slice() : []
    };
    if (sec === '취소') d.log.unshift({ at: d.updated_at, text: 'Asana에서 취소 구역에 있음' });
    d._orig = { title: d.title, due_at: d.due_at, priority: d.priority, status: d.status };
    return d;
  }

  function fromGoal(g) {
    const tr = LIVE.track['g' + g.id] || {};
    const pct = tr.pct != null ? +tr.pct : +g.pct || 0;
    const plan = +g.plan || 0;
    const autoStatus = pct >= 100 ? '완료' : pct > 0 ? '진행' : '지시';
    const gap = pct - plan;
    const autoPrio = (pct > 0 || plan > 0) && gap <= -15 ? '긴급' : (pct > 0 || plan > 0) && gap <= -5 ? '높음' : '보통';
    const dueOk = /^\d{4}-\d{2}-\d{2}$/.test(g.due || '');
    return {
      id: 'g' + g.id, src: g.lv === 'C' ? 'goal_c' : 'goal_d', code: g.id, title: g.t, body: g.why || '',
      org: g.org || '미지정', assignee: g.owner || g.org || '미지정', issued_at: LIVE.goalsAt || S.today,
      due_at: dueOk ? g.due : NONE_DUE, due_label: dueOk ? '' : (g.due || '기한 미정'),
      priority: PRIOS.includes(tr.priority) ? tr.priority : autoPrio, status: STATUSES.includes(tr.status) ? tr.status : autoStatus,
      tags: g.theme ? ['th-' + g.theme] : [], source_url: '', result_url: tr.result_url || '', memo: tr.memo || '',
      updated_at: S.today, track_at: tr.updated || '', asana_gid: '',
      metric: g.metric || '', cur: tr.cur != null ? tr.cur : (g.cur || ''), target: g.target || '', pct, plan, up: g.up || '', agree: g.agree || 0,
      log: Array.isArray(tr.log) ? tr.log.slice() : []
    };
  }

  /* 실데이터로 지시 목록을 바꿔 끼운다 (app.js의 상태 변경·다른 메뉴가 S.directives를 쓰므로 같은 배열을 교체) */
  function rebuild() {
    if (!LIVE.asana && !LIVE.goals) return;
    LIVE_TAGS.forEach(([id, name, color, description], i) => { if (!tagById(id)) S.tags.push({ id, name, color, description, sort: 100 + i }); });
    const list = [];
    (LIVE.asana || []).filter((t) => (t.memberships || []).some((m) => m && m.project && m.project.gid === ASANA.project)).forEach((t) => list.push(fromAsana(t)));
    (LIVE.goals || []).forEach((g) => list.push(fromGoal(g)));
    list.forEach((d) => {
      const o = OVR[d.id]; if (!o) return;
      if (['title', 'due_at', 'priority', 'status'].every((k) => d[k] === o[k])) { if (o.completed_at && !d.completed_at) d.completed_at = o.completed_at; delete OVR[d.id]; return; }
      if (Date.now() - o.at > 600000) { delete OVR[d.id]; return; }
      ['title', 'due_at', 'priority', 'status'].forEach((k) => { d[k] = o[k]; });
      if (o.completed_at) d.completed_at = o.completed_at;
      if (d.status === '완료' && !(LIVE.track[d.id] || {}).ack) d.ack = '';
      if (o.fail) d.synced_fail = o.fail;
    });
    const keep = new Map(S.directives.filter((d) => d.src).map((d) => [d.id, d]));
    list.forEach((d) => { const old = keep.get(d.id); if (old) { d._st = d.status; if (old.synced_fail) d.synced_fail = old.synced_fail; } else d._st = d.status; });
    S.directives.splice(0, S.directives.length, ...list);
    S.liveMode = true; LIVE.state = 'on';
    rerender();
  }

  const errText = (e) => {
    const c = e && e.code;
    if (c === 'needs_reauth') return 'Asana 연결이 만료됐습니다. claude.ai 설정 → 커넥터에서 Asana를 다시 연결해 주세요.';
    if (c === 'server_not_connected' || c === 'server_not_found') return 'Asana 커넥터가 없습니다. claude.ai 설정 → 커넥터에서 Asana를 추가해 주세요.';
    if (c === 'selection_required') return 'Asana 커넥터가 여러 개입니다. 화면 위 안내에서 하나를 골라 주세요.';
    if (c === 'not_in_manifest' || c === 'approval_required' || c === 'consent_required') return '이 페이지에서 Asana 사용이 아직 허용되지 않았습니다.';
    if (c === 'blocked_by_policy') return '조직 정책으로 이 페이지에서 Asana를 쓸 수 없습니다.';
    if (c === 'server_unavailable' || c === 'upstream_error' || c === 'cancelled') return 'Asana 응답이 늦습니다. 저장된 마지막 목록을 보여 드립니다.';
    if (c === 'tool_error') return 'Asana가 요청을 거절했습니다: ' + String(e.message || '').slice(0, 120);
    if (c === 'not_granted' || c === 'capability_disabled' || c === 'capability_removed') return '이 보기에서는 Asana를 부를 수 없어 저장된 목록을 보여 드립니다.';
    return 'Asana를 불러오지 못했습니다(' + (c || '알 수 없음') + ').';
  };
  const needsAllow = (e) => e && ['not_in_manifest', 'approval_required', 'consent_required'].includes(e.code);

  async function fetchAsana(fresh, retried) {
    if (!LIVE.mcp || LIVE.busy) return;
    LIVE.busy = true; rerender();
    try {
      const r = await LIVE.mcp.callTool(ASANA.server, 'search_tasks', { projects_any: ASANA.project, limit: 100, opt_fields: ASANA.fields }, { cache: fresh ? { staleTime: 0, gcTime: 3600000, refresh: true } : { staleTime: 600000, gcTime: 3600000 } });
      const p = r && r.payload;
      const data = p && Array.isArray(p.data) ? p.data : Array.isArray(p) ? p : null;
      if (!data) throw { code: 'tool_error', message: '응답 형식을 읽지 못했습니다' };
      LIVE.asana = data; LIVE.asanaAt = r.cache && r.cache.storedAt ? r.cache.storedAt : Date.now(); LIVE.asanaFrom = '실시간'; LIVE.asanaErr = null;
      saveSnapshot(data);
      rebuild();
      if (!LIVE.collectTried) { LIVE.collectTried = true; scheduleCollect(); }
    } catch (e) {
      LIVE.asanaErr = e;
      if (e && e.retryable && !retried) { LIVE.busy = false; setTimeout(() => fetchAsana(fresh, true), Math.min(60000, e.retryAfterMs || 1500 + Math.random() * 2000)); return; }
      if (!LIVE.asana && !LIVE.goals && LIVE.state === 'loading') LIVE.state = 'error';
      rebuild();
    }
    LIVE.busy = false; rerender();
  }

  /* 회장 계정(편집 권한)일 때만 최신 Asana 목록을 DB에 저장본으로 남긴다 — 바뀐 경우에만 */
  let lastSnap = '';
  async function saveSnapshot(data) {
    if (!LIVE.db) return;
    const slim = data.filter((t) => (t.memberships || []).some((m) => m && m.project && m.project.gid === ASANA.project));
    const body = JSON.stringify(slim);
    if (body === lastSnap) return;
    lastSnap = body;
    try { await LIVE.db.doc('live/asana').set({ at: new Date().toISOString(), data: slim }); } catch (e) { /* 보기 전용이면 저장 안 함 */ }
  }

  async function writeTrack(d, patch, logText) {
    const id = d.id;
    const cur = Object.assign({}, LIVE.track[id] || {});
    const log = Array.isArray(cur.log) ? cur.log.slice() : [];
    if (logText) log.unshift({ at: S.today, text: logText });
    const next = Object.assign(cur, patch, { updated: S.today, log: log.slice(0, 20) });
    LIVE.track[id] = next;
    if (!LIVE.db) { toast('저장할 곳이 없어 이 화면에만 반영했습니다'); return false; }
    try { await LIVE.db.doc('track/' + id).set(next); return true; } catch (e) { toast('저장하지 못했습니다(' + (e && e.code || '오류') + ') — 편집 권한을 확인해 주세요'); return false; }
  }

  async function pushAsana(d, why) {
    if (!LIVE.mcp) { d.synced_fail = 'Asana 연결 없음'; rerender(); return; }
    const o = d._orig || {};
    const t = { task: d.asana_gid };
    if (d.title !== o.title) t.name = d.title;
    if (d.due_at !== o.due_at) t.due_on = d.due_at === NONE_DUE ? null : d.due_at;
    if (d.status !== o.status) { t.completed = d.status === '완료'; t.add_projects = [{ project_id: ASANA.project, section_id: ASANA.sec[d.status] }]; }
    if (d.priority !== o.priority) {
      const want = d.priority === '보통' ? '중간' : '높음';
      t.custom_fields = { [ASANA.prioField]: ASANA.prioOpt[want] };
      if (d.priority === '긴급' || o.priority === '긴급') writeTrack(d, { priority: d.priority });
    }
    if (Object.keys(t).length === 1) return;
    OVR[d.id] = { title: d.title, due_at: d.due_at, priority: d.priority, status: d.status, completed_at: d.completed_at || '', at: Date.now() };
    d.synced_fail = ''; d._pushing = true; rerender();
    try {
      const r = await LIVE.mcp.callTool(ASANA.server, 'update_tasks', { tasks: [t] });
      const p = (r && r.payload) || {};
      if (Array.isArray(p.failed) && p.failed.length) throw { code: 'tool_error', message: JSON.stringify(p.failed[0].errors || p.failed[0]).slice(0, 160) };
      d._orig = { title: d.title, due_at: d.due_at, priority: d.priority, status: d.status };
      toast(`Asana에 반영했습니다 · ${why || '변경'}`);
      try { await LIVE.mcp.invalidate(ASANA.server, 'search_tasks'); } catch (e) { /* 캐시 없음 */ }
      clearTimeout(LIVE.refetchT); LIVE.refetchT = setTimeout(() => fetchAsana(true), 4000);
    } catch (e) {
      d.synced_fail = errText(e); if (OVR[d.id]) OVR[d.id].fail = d.synced_fail;
      toast('Asana 반영 실패 — ' + d.synced_fail);
    }
    d._pushing = false; rerender();
  }

  async function commentAsana(d, text) {
    if (!LIVE.mcp) return false;
    try { await LIVE.mcp.callTool(ASANA.server, 'add_comment', { task_id: d.asana_gid, text }); return true; } catch (e) { toast('Asana 댓글 실패 — ' + errText(e)); return false; }
  }

  async function startLive() {
    if (!hasClaude) return;
    /* 75초 안에 아무것도 못 받으면 목업으로 돌아간다(받는 즉시 실데이터로 바뀜) */
    setTimeout(() => { if (LIVE.state === 'loading' && !LIVE.asana && !LIVE.goals) { LIVE.state = 'off'; rerender(); } }, 75000);
    let db = null, mcp = null;
    try { [db, mcp] = await Promise.all([window.claude.use('db').catch(() => null), window.claude.use('mcp').catch(() => null)]); } catch (e) { /* 없음 */ }
    try { const u = await window.claude.use('user'); LIVE.owner = u ? !!u.isOwner() : true; } catch (e) { LIVE.owner = true; }
    if (LIVE.owner === false) { LIVE.db = db; LIVE.state = 'off'; rerender(); return; } /* 회장이 아닌 사람: 실데이터를 불러오지 않음(받은 비주얼 링크만 볼 수 있음) */
    LIVE.db = db; LIVE.mcp = mcp;
    if (!db && !mcp) { LIVE.state = 'off'; rerender(); return; }
    if (db) {
      const err = () => {};
      db.doc('live/people').onSnapshot((s) => { const v = s.exists ? s.data() : null; if (v && v.map && typeof v.map === 'object') { LIVE.people = v.map; LIVE.staff = Array.isArray(v.staff) ? v.staff.filter((x) => x && x.n && x.d) : []; rebuild(); rerender(); } }, err);
      db.doc('live/goals').onSnapshot((s) => { const v = s.exists ? s.data() : null; if (v && Array.isArray(v.items)) { LIVE.goals = v.items.filter((g) => g && g.id && g.t); LIVE.goalsAt = String(v.at || '').slice(0, 10); rebuild(); } }, err);
      db.doc('config/ai').onSnapshot((s) => { LIVE.cfg = s.exists ? s.data() : null; rerender(); }, err);
      db.doc('config/praise').onSnapshot((s) => { LIVE.praiseCfg = s.exists ? s.data() : null; }, err);
      db.collection('progress').onSnapshot((snap) => { const m = {}; snap.docs.forEach((ds) => { const v = ds.data() || {}; if (v.task_id) (m[v.task_id] = m[v.task_id] || []).push(Object.assign({}, v, { id: ds.id })); }); Object.values(m).forEach((a) => a.sort((x, y) => String(y.date || '').localeCompare(String(x.date || '')) || String(y.created || '').localeCompare(String(x.created || '')))); LIVE.prog = m; rerender(); }, err);
      db.collection('reports').onSnapshot((snap) => { const m = {}; snap.docs.forEach((ds) => { const v = ds.data() || {}; if (v.task_id) (m[v.task_id] = m[v.task_id] || []).push(Object.assign({}, v, { id: ds.id })); }); Object.values(m).forEach((a) => a.sort((x, y) => String(y.created || '').localeCompare(String(x.created || '')))); LIVE.reps = m; rerender(); }, err);
      db.doc('plans/' + new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10)).onSnapshot((s) => { LIVE.plan = s.exists ? s.data() : null; rerender(); }, err);
      db.collection('ideas').onSnapshot((snap) => { const m = {}; snap.docs.forEach((ds) => { const v = ds.data() || {}; if (v.title != null) m[ds.id] = Object.assign({}, v, { id: ds.id }); }); if (stableStr(m) === stableStr(LIVE.ideas || null)) return; LIVE.ideas = m; rerender(); }, err);
      db.doc('idearecs/latest').onSnapshot((s) => { const v = s.exists ? s.data() : null; if (v && Array.isArray(v.items) && !(IDEA.recs && IDEA.recs.at > v.at)) { IDEA.recs = v; } }, err);
      db.collection('cw').onSnapshot((snap) => { const m = {}; snap.docs.forEach((ds) => { const v = ds.data() || {}; if (v.title) m[ds.id] = Object.assign({}, v, { id: ds.id }); }); LIVE.cw = m; rerender(); }, err);
      db.collection('track').onSnapshot((snap) => { const m = {}; snap.docs.forEach((ds) => { m[ds.id] = ds.data() || {}; }); LIVE.track = m; rebuild(); }, err);
      db.doc('live/asana').onSnapshot((s) => {
        const v = s.exists ? s.data() : null;
        if (v && Array.isArray(v.data) && LIVE.asanaFrom !== '실시간') { LIVE.asana = v.data; LIVE.asanaAt = Date.parse(v.at) || 0; LIVE.asanaFrom = '저장본'; lastSnap = JSON.stringify(v.data); rebuild(); }
      }, err);
    }
    if (mcp) {
      checkInhouse();
      fetchAsana(false);
      LIVE.timer = setInterval(() => { if (!document.hidden) fetchAsana(true); }, 3600000);
    }
    rerender();
  }
  setTimeout(startLive, 0);

  /* ================= 목업 동기화 표시 (실데이터가 없을 때) ================= */
  const SIG_KEYS = ['title', 'body', 'org', 'assignee', 'issued_at', 'due_at', 'priority', 'status', 'tags', 'source_url', 'result_url', 'memo'];
  const sig = (d) => JSON.stringify(SIG_KEYS.map((k) => d[k]));
  const isPending = (d) => {
    if (isAsana(d)) { const o = d._orig || {}; return !!d.synced_fail || ['title', 'due_at', 'priority', 'status'].some((k) => d[k] !== o[k]); }
    if (isGoal(d)) return false;
    return d.synced_sig !== sig(d);
  };
  const hourFloor = () => { const n = new Date(); n.setMinutes(0, 0, 0); return n.toISOString(); };
  const hm = (t) => { const x = new Date(t); return String(x.getHours()).padStart(2, '0') + ':' + String(x.getMinutes()).padStart(2, '0'); };
  const addLog = (d, text) => { d.log = d.log || []; d.log.unshift({ at: S.today, text }); d.log = d.log.slice(0, 12); };

  function runSync(auto) {
    const pend = S.directives.filter(isPending);
    pend.forEach((d) => { d.synced_sig = sig(d); addLog(d, 'Asana로 변경 보냄'); });
    S.dirSync.last = auto ? hourFloor() : new Date().toISOString();
    S.dirSync.log.unshift({ at: S.dirSync.last, sent: pend.length, recv: 0, auto: !!auto });
    S.dirSync.log = S.dirSync.log.slice(0, 5);
    return pend.length;
  }

  /* 화면을 그리기 전에 빈 필드 보정·상태 변경 이력·정시 자동 동기화(목업) */
  function normalize() {
    S.dirSync = S.dirSync || { last: hourFloor(), log: [] };
    let gidN = 1000 + S.directives.length;
    S.directives.forEach((d) => {
      d.tags = d.tags || []; d.memo = d.memo || ''; d.body = d.body || ''; d.result_url = d.result_url || '';
      if (!d.src && !d.asana_gid) d.asana_gid = 'mock-' + (++gidN);
      if (!d.log) d.log = d.src ? [] : [{ at: d.issued_at, text: '지시 등록 · Asana "회장 지시" 태스크 생성' }];
      if (!d.src && d.synced_sig == null) d.synced_sig = sig(d);
      if (d._st && d._st !== d.status) addLog(d, `상태 ${d._st} → ${d.status}`);
      d._st = d.status;
    });
    if (!S.liveMode && Date.now() - new Date(S.dirSync.last).getTime() >= 3600000) runSync(true);
  }

  /* ---------- 도구 ---------- */
  const safeUrl = (u) => (/^https?:\/\//i.test(u || '') ? u : '');
  const linkOut = (u, label) => (safeUrl(u) ? `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${label}</a>` : u === '#' ? `<span class="muted">${label}(샘플)</span>` : '<span class="muted">없음</span>');
  const noDue = (d) => d.due_at === NONE_DUE;
  const dueMd = (d) => (noDue(d) ? (d.due_label ? '합의 필요' : '없음') : md(d.due_at));
  const dueFull = (d) => (noDue(d) ? (d.due_label || '기한 없음') : d.due_at);
  const dLabel = (d) => { if (noDue(d)) return '기한 없음'; const n = days(S.today, d.due_at); return n < 0 ? `D+${-n}` : n === 0 ? 'D-day' : `D-${n}`; };
  const dueCls = (d) => (isOverdue(d) ? 'is-over' : isOpen(d) && d.due_at <= dayStr(3) ? 'is-soon' : '');
  const quiet = (d) => days(d.updated_at, S.today);
  const titleBtn = (d) => `<button type="button" class="dir-title" data-act="dirOpen" data-id="${esc(d.id)}">${esc(d.title)}</button>`;
  const alerts = (d) => [isOverdue(d) ? `<span class="dir-flag crit">기한 ${dLabel(d)}</span>` : '', stl(d) ? `<span class="dir-flag warn">${quiet(d)}일 무응답</span>` : '', d.synced_fail ? '<span class="dir-flag crit">Asana 반영 실패</span>' : ''].join('');
  const srcPill = (d) => (d.src ? `<span class="dir-src ${d.src}">${SRC_LABEL[d.src]}${d.code ? ' ' + esc(d.code) : ''}</span>` : '');
  const goalBar = (d) => {
    if (!isGoal(d)) return '';
    const gap = d.pct - d.plan; const cls = (d.pct > 0 || d.plan > 0) && gap <= -15 ? 'bad' : (d.pct > 0 || d.plan > 0) && gap <= -5 ? 'warn' : '';
    return `<div class="dir-gbar ${cls}"><span class="bar"><i style="width:${Math.max(0, Math.min(100, d.pct))}%"></i>${d.plan ? `<b style="left:${Math.min(100, d.plan)}%"></b>` : ''}</span><span class="small num">진척 ${d.pct}%${d.plan ? ` · 계획 ${d.plan}%` : ''} ${badge('수기')}</span></div>`;
  };
  const fullFilter = () => Object.assign({ tags: [], mode: 'OR', status: 'all', org: '', due: '', prio: '', q: '', src: '' }, currentFilter());
  const orgList = () => (S.liveMode ? [...new Set(S.directives.map((d) => d.org).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ko')) : MOCK.ORGS.slice());

  function filtered(f) {
    let list = applyFilter(S.directives, f);
    if (f.status !== '완료') list = list.filter((d) => !isAcked(d));
    if (f.due === 'today') list = list.filter((d) => isOpen(d) && d.due_at === S.today);
    if (f.due === 'd3') list = list.filter((d) => isOpen(d) && d.due_at >= S.today && d.due_at <= dayStr(3));
    if (f.due === 'stale') list = list.filter(stl);
    if (f.due === 'alert') list = list.filter((d) => isOverdue(d) || stl(d));
    if (f.due === 'none') list = list.filter(noDue);
    if (f.prio) list = list.filter((d) => d.priority === f.prio);
    if (f.src === 'goal') list = list.filter(isGoal); else if (f.src) list = list.filter((d) => d.src === f.src);
    if (f.q) { const q = f.q.toLowerCase(); list = list.filter((d) => [d.title, d.body, d.memo, d.assignee, d.org, d.metric, d.code].join(' ').toLowerCase().includes(q)); }
    return list.sort((a, b) => (isOpen(b) - isOpen(a)) || a.due_at.localeCompare(b.due_at) || PRIO_RANK[a.priority] - PRIO_RANK[b.priority]);
  }
  function filterSummary(f) {
    const p = [];
    if (f.src) p.push(f.src === 'goal' ? '목표 전체' : SRC_LABEL[f.src]);
    if (f.tags.length) p.push('태그 ' + f.tags.map((t) => (tagById(t) || {}).name).filter(Boolean).join(f.mode === 'AND' ? ' 그리고 ' : ' 또는 '));
    if (f.status !== 'all') p.push(f.status === 'open' ? '미완료' : '상태 ' + f.status);
    if (f.org) p.push(f.org);
    if (f.due) p.push({ overdue: '기한 경과', week: '7일 이내', today: '오늘 기한', d3: '3일 이내', stale: '3일 무응답', alert: '경보 전체', none: '기한 없음' }[f.due]);
    if (f.prio) p.push('우선 ' + f.prio);
    if (f.q) p.push(`"${f.q}" 포함`);
    return p;
  }
  const sameFilter = (a, b) => { const n = (x) => JSON.stringify(Object.assign({ tags: [], mode: 'OR', status: 'all', org: '', due: '', prio: '', q: '', src: '' }, x, { tags: (x.tags || []).slice().sort() })); return n(a) === n(b); };

  /* ---------- 보기: 목록 / 칸반 / 타임라인 ---------- */
  function listView(list) {
    if (!list.length) return emptyMsg();
    return `<div class="tbl-wrap"><table class="dir-tbl"><thead><tr><th>지시·목표</th><th>담당</th><th>지시일</th><th>기한</th><th>우선</th><th>상태</th><th>태그</th><th>Asana</th></tr></thead><tbody>
      ${list.map((d) => `<tr class="${isOverdue(d) ? 'overdue' : ''} ${S.ui.dirOpen === d.id ? 'dir-sel' : ''}">
        <td data-label="지시">${srcPill(d)}${titleBtn(d)}${goalBar(d)}<div class="row dir-flags">${alerts(d)}</div>${d.memo ? `<div class="small muted dir-memo">메모 · ${esc(d.memo)}</div>` : ''}${repLine(d)}</td>
        <td data-label="담당">${esc(d.org)}${d.assignee && d.assignee !== d.org ? `<div class="small muted">${esc(d.assignee)}</div>` : ''}</td>
        <td data-label="지시일" class="num">${md(d.issued_at)}</td>
        <td data-label="기한" class="num ${dueCls(d)}">${dueMd(d)}${isOpen(d) && !noDue(d) ? `<div class="small">${dLabel(d)}</div>` : ''}</td>
        <td data-label="우선">${prioPill(d.priority)}</td>
        <td data-label="상태">${statusSelect(d)}</td>
        <td data-label="태그"><div class="row">${d.tags.map(chip).join('') || '<span class="small muted">-</span>'}</div></td>
        <td data-label="Asana" class="small">${syncCell(d)}</td></tr>`).join('')}
      </tbody></table></div>`;
  }
  const syncCell = (d) => {
    if (isGoal(d)) return '<span class="dir-sync na">목표(DB 저장)</span>';
    if (isAsana(d)) return d._pushing ? '<span class="dir-sync pend">보내는 중</span>' : d.synced_fail ? '<span class="dir-sync bad">반영 실패</span>' : isPending(d) ? '<span class="dir-sync pend">보낼 변경</span>' : '<span class="dir-sync ok">Asana 연결</span>';
    return isPending(d) ? '<span class="dir-sync pend">보낼 변경</span>' : '<span class="dir-sync ok">동기화됨(목업)</span>';
  };

  function kanbanView(list) {
    return `<div class="kanban dir-kanban">${STATUSES.map((s) => { const c = list.filter((d) => d.status === s); return `<div class="col"><header><span>${s}</span><span class="num muted">${c.length}</span></header>
      ${c.map((d) => `<div class="card ${isOverdue(d) ? 'overdue' : ''} ${S.ui.dirOpen === d.id ? 'dir-sel' : ''}">${srcPill(d)}${titleBtn(d)}<div class="small muted">${esc(d.org)}${d.assignee && d.assignee !== d.org ? ' · ' + esc(d.assignee) : ''}</div>${goalBar(d)}
        <div class="row small"><span class="num ${dueCls(d)}">기한 ${dueMd(d)}${isOpen(d) && !noDue(d) ? ' · ' + dLabel(d) : ''}</span></div>
        <div class="row">${prioPill(d.priority)}${alerts(d)}</div>${repLine(d)}${d.tags.length ? `<div class="row">${d.tags.map(chip).join('')}</div>` : ''}${statusSelect(d)}</div>`).join('') || '<div class="small muted dir-empty-col">없음</div>'}</div>`; }).join('')}</div>`;
  }

  function timelineView(list) {
    const open = list.filter(isOpen);
    const closedN = list.length - open.length;
    const groups = [
      ['기한 경과', (d) => d.due_at < S.today, 'crit'],
      ['오늘', (d) => d.due_at === S.today, 'today'],
      ['3일 이내', (d) => d.due_at > S.today && d.due_at <= dayStr(3), ''],
      ['7일 이내', (d) => d.due_at > dayStr(3) && d.due_at <= dayStr(7), ''],
      ['그 이후', (d) => d.due_at > dayStr(7) && !noDue(d), ''],
      ['기한 없음·합의 필요', noDue, 'none']
    ];
    if (!open.length) return emptyMsg('기한이 남은 미완료 항목이 없습니다.');
    return `<div class="dir-tl">${groups.map(([name, fn, cls]) => { const g = open.filter(fn); if (!g.length) return ''; return `<div class="dir-tl-group ${cls}"><div class="dir-tl-head"><span>${name}</span><span class="num muted">${g.length}건</span></div>
      ${g.map((d) => `<div class="dir-tl-row"><div class="dir-tl-date num ${dueCls(d)}"><b>${dueMd(d)}</b><span>${noDue(d) ? '' : dLabel(d)}</span></div>
        <div class="dir-tl-body">${srcPill(d)}${titleBtn(d)}<div class="row small"><span class="muted">${esc(d.org)}${d.assignee && d.assignee !== d.org ? ' · ' + esc(d.assignee) : ''}</span>${prioPill(d.priority)}${statPill(d.status)}${stl(d) ? `<span class="dir-flag warn">${quiet(d)}일 무응답</span>` : ''}</div>${goalBar(d)}</div></div>`).join('')}</div>`; }).join('')}
      ${closedN ? `<p class="small muted" style="margin:4px 0 0">완료·보류 ${closedN}건은 타임라인에서 뺐습니다.</p>` : ''}</div>`;
  }
  const emptyMsg = (t) => `<div class="panel dir-empty"><p>${t || '조건에 맞는 항목이 없습니다.'}</p><button type="button" class="btn sm" data-act="fReset">필터 초기화</button></div>`;

  /* ---------- 조직별 이행률 ---------- */
  function orgPanel() {
    const rows = orgList().map((o) => {
      const all = S.directives.filter((d) => d.org === o);
      const target = all.filter((d) => d.status !== '보류');
      const done = target.filter((d) => d.status === '완료').length;
      const goals = all.filter(isGoal);
      return { o, n: target.length, done, over: all.filter(isOverdue).length, stale: all.filter((d) => stl(d) && !isOverdue(d)).length, pct: target.length ? Math.round(100 * done / target.length) : 0, gN: goals.length, gAvg: goals.length ? Math.round(goals.reduce((s, d) => s + d.pct, 0) / goals.length) : null };
    }).filter((r) => r.n).sort((a, b) => b.over - a.over || a.pct - b.pct);
    const tot = S.directives.filter((d) => d.status !== '보류'); const totPct = tot.length ? Math.round(100 * tot.filter((d) => d.status === '완료').length / tot.length) : 0;
    return `<section class="panel" aria-labelledby="h-org"><div class="row" style="justify-content:space-between"><h3 id="h-org">조직별 이행률 ${badge('측정')}</h3><span class="small muted">전체 <b class="num">${totPct}%</b> · 완료 ÷ (전체 − 보류)</span></div>
      <div class="dir-org">${rows.map((r) => `<button type="button" class="dir-org-row" data-act="dirOrg" data-v="${esc(r.o)}" title="${esc(r.o)} 항목만 보기">
        <span class="o">${esc(r.o)}</span><span class="bar"><i style="width:${r.pct}%"></i></span><span class="num p">${r.pct}%</span>
        <span class="small muted m">완료 ${r.done}/${r.n}${r.gAvg != null ? ` · 목표 ${r.gN}개 평균 진척 ${r.gAvg}%` : ''}${r.over ? ` · <span class="crit">기한 경과 ${r.over}</span>` : ''}${r.stale ? ` · <span class="warn">무응답 ${r.stale}</span>` : ''}</span></button>`).join('') || '<p class="small muted">아직 항목이 없습니다.</p>'}</div></section>`;
  }

  /* ---------- 등록 폼 ---------- */
  const tagChecks = (sel) => S.tags.slice().sort((a, b) => a.sort - b.sort).map((t) => `<label class="chip dir-tagcheck"><input type="checkbox" name="tags" value="${esc(t.id)}" ${sel.includes(t.id) ? 'checked' : ''}><span class="dot" style="background:${esc(t.color)}"></span>${esc(t.name)}</label>`).join('');
  function fieldsHtml(p, d) {
    const orgs = orgList();
    d = d || { title: '', body: '', org: orgs[0] || '', assignee: '', issued_at: S.today, due_at: dayStr(7), priority: '보통', status: '지시', tags: [], source_url: '', result_url: '', memo: '' };
    const lockAsana = p === 'de' && isAsana(d);
    const goal = p === 'de' && isGoal(d);
    if (d.org && !orgs.includes(d.org)) orgs.unshift(d.org);
    return `<label class="f wide">${goal ? '목표' : '지시 내용'}<input type="text" id="${p}-title" name="title" required value="${esc(d.title)}" placeholder="예: 가맹점 고정비 절감안 보고" ${goal ? 'readonly' : ''}></label>
      ${lockAsana ? '' : `<label class="f wide">상세 설명<textarea id="${p}-body" name="body" rows="2" placeholder="배경·기대 결과" ${goal ? 'readonly' : ''}>${esc(d.body)}</textarea></label>`}
      ${lockAsana || goal ? '' : `<label class="f">담당 조직<select id="${p}-org" name="org">${orgs.map((o) => `<option ${o === d.org ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></label>
      <label class="f">담당자<input type="text" id="${p}-assignee" name="assignee" value="${esc(d.assignee === '미지정' ? '' : d.assignee)}" placeholder="이름"></label>
      <label class="f">지시일<input type="date" id="${p}-issued" name="issued_at" value="${esc(d.issued_at)}"></label>`}
      ${goal ? '' : `<label class="f">기한<input type="date" id="${p}-due" name="due_at" value="${esc(noDue(d) ? '' : d.due_at)}" ${lockAsana ? '' : 'required'}></label>`}
      <label class="f">우선순위<select id="${p}-prio" name="priority">${PRIOS.map((x) => `<option ${x === d.priority ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
      ${p === 'de' ? `<label class="f">상태<select id="${p}-status" name="status">${STATUSES.map((x) => `<option ${x === d.status ? 'selected' : ''}>${x}</option>`).join('')}</select></label>` : ''}
      ${lockAsana || goal ? '' : `<fieldset class="wide dir-fs"><legend class="small muted">태그(여러 개 선택)</legend><div class="row">${tagChecks(d.tags)}</div></fieldset>
      <label class="f wide">원문 링크<input type="url" id="${p}-src" name="source_url" value="${esc(safeUrl(d.source_url))}" placeholder="https:// (슬랙·메일 원문)"></label>`}
      ${p === 'de' ? `<label class="f wide">결과물 링크<input type="url" id="${p}-res" name="result_url" value="${esc(safeUrl(d.result_url))}" placeholder="https://"></label>` : ''}
      <label class="f wide">메모<textarea id="${p}-memo" name="memo" rows="2">${esc(d.memo)}</textarea></label>
      ${lockAsana ? '<p class="small muted wide" style="margin:0">담당자·태그·원문은 Asana에서 바꿉니다. 여기서 바꾼 이름·기한·우선순위·상태는 바로 Asana에 반영됩니다.</p>' : ''}`;
  }
  function newPanel() {
    if (!S.ui.dirNew) return '';
    const live = S.liveMode && LIVE.mcp;
    return `<section class="panel dir-new" aria-labelledby="h-dnew"><div class="row" style="justify-content:space-between"><h3 id="h-dnew">지시 등록</h3><button type="button" class="btn sm" data-act="dirNewToggle">닫기</button></div>
      <form class="form" data-form="dirNew">${fieldsHtml('dn', S.ui.dirDraft || null)}
        <p class="small muted wide" style="margin:0">${live ? '등록하면 Asana "[지시업무] ceo 윤석범" 프로젝트의 "지시할일후보"에 태스크가 바로 만들어집니다. 담당자는 Asana에서 지정해 주세요(이름은 설명에 적어 둡니다).' : '등록하면 Asana "회장 지시" 프로젝트에 태스크가 함께 만들어집니다(목업: 화면 표시만).'}</p>
        <div class="row wide"><button class="btn primary">${live ? '등록 + Asana 태스크 만들기' : '등록 + Asana 태스크 생성'}</button><button type="button" class="btn sm" data-act="dirNewToggle">취소</button></div></form></section>`;
  }

  /* ---------- 상세 패널 (오른쪽, Asana 작업 상세처럼) ---------- */
  const DET = {};
  const DET_FIELDS = 'name,notes,assignee.name,due_on,completed,created_at,created_by.name,followers.name,memberships.project.name,memberships.section.name,permalink_url';
  async function loadDetail(d, force) {
    if (!d || !isAsana(d) || !LIVE.mcp) return;
    const k = d.asana_gid; const cur = DET[k];
    if (cur && cur.state === 'loading') return;
    if (cur && cur.state === 'ok' && !force && Date.now() - cur.at < 300000) return;
    DET[k] = Object.assign({}, cur || {}, { state: 'loading' }); rerender();
    const [a, b] = await Promise.allSettled([
      LIVE.mcp.callTool(ASANA.server, 'get_task', { task_id: k, include_comments: false, opt_fields: DET_FIELDS }, { cache: force ? { staleTime: 0, gcTime: 600000, refresh: true } : { staleTime: 120000, gcTime: 600000 } }),
      LIVE.mcp.callTool(ASANA.server, 'get_task_stories', { task_id: k, limit: 50, sort_ascending: true }, { cache: force ? { staleTime: 0, gcTime: 600000, refresh: true } : { staleTime: 120000, gcTime: 600000 } })
    ]);
    const next = { state: 'ok', at: Date.now(), task: (cur && cur.task) || null, stories: (cur && cur.stories) || null, err: null };
    if (a.status === 'fulfilled') { const p = a.value && a.value.payload; next.task = p && p.data ? p.data : p; } else next.err = a.reason;
    if (b.status === 'fulfilled') { const p = b.value && b.value.payload; next.stories = Array.isArray(p) ? p : p && Array.isArray(p.data) ? p.data : []; } else next.err = next.err || b.reason;
    if (a.status === 'rejected' && b.status === 'rejected') next.state = 'err';
    DET[k] = next; rerender();
  }
  const initial = (n) => (String(n || '?').trim()[0] || '?');
  const ME = ['윤석범', '윤', '회장'];
  const avatar = (n, big) => (ME.includes(String(n || '').trim()) && window.ASSETS && window.ASSETS.profile
    ? `<span class="dir-av photo ${big ? 'lg' : ''}" aria-hidden="true"><img src="${esc(window.ASSETS.profile)}" alt="" width="28" height="28"></span>`
    : `<span class="dir-av ${big ? 'lg' : ''}" aria-hidden="true">${esc(initial(n))}</span>`);
  const when = (iso) => { const x = new Date(iso); if (isNaN(x)) return ''; return `${x.getMonth() + 1}/${x.getDate()} ${String(x.getHours()).padStart(2, '0')}:${String(x.getMinutes()).padStart(2, '0')}`; };
  function storyText(s) {
    let t = String(s.text || '');
    const who = s.created_by && s.created_by.name ? String(s.created_by.name) : '';
    if (who && t.startsWith(who + ' ')) t = t.slice(who.length + 1);
    let m;
    if ((m = t.match(/^moved this task from "(.+)" to "(.+)" in (.+)$/))) return `${m[3]}에서 "${m[1]}" → "${m[2]}"(으)로 옮김`;
    if ((m = t.match(/^added this task to (.+)$/))) return `${m[1]}에 추가함`;
    if ((m = t.match(/^assigned (?:this task )?to (.+)$/))) return `${m[1]}에게 배정함`;
    if ((m = t.match(/^changed the due date to (.+)$/))) return `마감일을 ${m[1]}(으)로 바꿈`;
    if (/^marked this task complete$/.test(t)) return '완료로 표시함';
    if (/^marked incomplete$|^marked this task incomplete$/.test(t)) return '완료 취소함';
    if (/^created this task$/.test(t)) return '이 작업을 만듦';
    return t;
  }
  const linkify = (s) => esc(s).replace(/https?:\/\/[^\s<>"']+/g, (u) => `<a href="${u}" target="_blank" rel="noopener noreferrer">${u.length > 60 ? u.slice(0, 57) + '…' : u}</a>`);
  const prioSelect = (d) => `<select class="dir-inline" aria-label="우선순위" data-act="dirPrio" data-id="${esc(d.id)}">${PRIOS.map((x) => `<option ${x === d.priority ? 'selected' : ''}>${x}</option>`).join('')}</select>`;

  /* 패널을 다시 그려도 흔들리지 않게: 처음 열 때만 움직임, 스크롤 위치 유지 */
  const PANE = { shown: null, scroll: {} };
  document.addEventListener('scroll', (e) => { const t = e.target; if (t && t.classList && t.classList.contains('dir-pane-body') && S.ui.dirOpen) PANE.scroll[S.ui.dirOpen + '|' + (S.ui.paneTab || 'detail')] = t.scrollTop; }, true);
  function restorePaneScroll() {
    const b = document.querySelector('.dir-pane-body'); if (!b || !S.ui.dirOpen) return;
    const v = PANE.scroll[S.ui.dirOpen + '|' + (S.ui.paneTab || 'detail')]; if (v) b.scrollTop = v;
  }
  function detailDialog() {
    const d = S.ui.dirOpen && S.directives.find((x) => x.id === S.ui.dirOpen);
    document.body.classList.toggle('dir-lock', !!d);
    if (!d) { PANE.shown = null; return ''; }
    const edit = S.ui.dirEdit;
    const det = isAsana(d) ? DET[d.asana_gid] : null;
    const t = det && det.task ? det.task : null;
    const fld = (k, v) => `<div class="dir-f"><span class="k">${k}</span><div class="v">${v}</div></div>`;
    const upGoal = isGoal(d) && d.up ? S.directives.find((x) => x.id === 'g' + d.up) : null;
    const done = d.status === '완료';
    const project = isAsana(d) ? ((t && t.memberships || []).find((m) => m.project && m.project.gid === ASANA.project) || {}) : null;
    const followers = t && Array.isArray(t.followers) ? t.followers : [];
    const subtasks = t && Array.isArray(t.subtasks) ? t.subtasks : [];
    const notes = t && typeof t.notes === 'string' ? t.notes : d.body;
    const stories = det && Array.isArray(det.stories) ? det.stories : [];

    const fields = `<div class="dir-fields">
      ${fld('담당자', `<span class="dir-who">${avatar(d.assignee)}<span>${esc(d.assignee)}${d.org && d.org !== d.assignee ? `<small>${esc(d.org)}</small>` : ''}</span></span>`)}
      ${fld('마감일', isGoal(d) ? `<span class="num ${dueCls(d)}">${esc(dueFull(d))}${isOpen(d) && !noDue(d) ? ' · ' + dLabel(d) : ''}</span>` : `<span class="dir-due"><input type="date" class="dir-inline" aria-label="마감일" data-act="dirDue" data-id="${esc(d.id)}" value="${noDue(d) ? '' : esc(d.due_at)}"><span class="small num ${dueCls(d)}">${isOpen(d) ? dLabel(d) : ''}</span></span>`)}
      ${fld(isGoal(d) ? '구분' : '프로젝트', isAsana(d) ? `<span class="dir-proj"><span class="dir-proj-name">${esc((project && project.project && project.project.name) || '[지시업무] ceo 윤석범')}</span>${statusSelect(d)}</span>` : isGoal(d) ? `${srcPill(d)}<span class="small muted">아이센스 부서현황판</span>` : `<span class="dir-proj"><span class="dir-proj-name">회장 지시(목업)</span>${statusSelect(d)}</span>`)}
      ${isGoal(d) ? fld('상태', statusSelect(d)) : ''}
      ${fld('우선순위', prioSelect(d))}
      ${fld('태그', `<span class="row">${d.tags.map(chip).join('') || '<span class="muted small">없음</span>'}</span>`)}
      ${isGoal(d) ? `${fld('지표', esc(d.metric) || '<span class="muted">—</span>')}${fld('현재 → 목표', `${esc(d.cur) || '—'} → ${esc(d.target) || '—'}`)}${fld('진척', goalBar(d) || '—')}${fld('합의', `<span class="small">${d.agree}/4 단계 (회장·C레벨·본부·부서)</span>`)}${upGoal ? fld('상위 목표', `<button type="button" class="dir-link" data-act="dirOpen" data-id="${esc(upGoal.id)}">${esc(upGoal.code)} ${esc(upGoal.title)}</button>`) : ''}` : ''}
      ${fld(isGoal(d) ? '등록 기준일' : '만든 날', `<span class="num">${esc(d.issued_at)}</span>${t && t.created_by && t.created_by.name ? ` <span class="small muted">· ${esc(t.created_by.name)}</span>` : ''}`)}
      ${fld('결과물', linkOut(d.result_url, '결과물 열기'))}
      ${!isAsana(d) && !isGoal(d) ? fld('원문', linkOut(d.source_url, '원문 열기')) : ''}
      ${d.synced_fail ? fld('Asana 반영', `<span class="small crit">${esc(d.synced_fail)}</span> <button type="button" class="dir-link" data-act="dirRepush" data-id="${esc(d.id)}">다시 보내기</button>`) : ''}
    </div>`;

    const desc = `<section class="dir-sec"><h4>설명</h4>${notes ? `<div class="dir-notes">${linkify(notes)}</div>` : `<p class="muted small" style="margin:0">${det && det.state === 'loading' ? '불러오는 중…' : '설명이 없습니다.'}</p>`}</section>`;
    const subs = isAsana(d) && subtasks.length ? `<section class="dir-sec"><h4>하위 작업 <span class="num muted">${subtasks.length}</span></h4><ul class="dir-subs">${subtasks.map((s) => `<li class="${s.completed ? 'done' : ''}"><span class="dir-chk" aria-hidden="true">${s.completed ? '✓' : ''}</span>${esc(s.name || '')}${s.assignee && s.assignee.name ? `<small>${esc(s.assignee.name)}</small>` : ''}</li>`).join('')}</ul></section>` : '';
    const memo = `<section class="dir-sec"><h4>${isGoal(d) ? '진척 기록' : '현황판 메모'}</h4>
      <form class="form dir-quick" data-form="dirMemo" data-id="${esc(d.id)}">
        ${isGoal(d) ? `<label class="f">진척률(%)<input type="number" id="dm-pct" name="pct" min="0" max="100" step="1" value="${d.pct}"></label><label class="f">현재값<input type="text" id="dm-cur" name="cur" value="${esc(d.cur)}" placeholder="예: 27개"></label>` : ''}
        <label class="f wide">메모<textarea id="dm-memo" name="memo" rows="2" placeholder="진행 상황·다음 확인 사항">${esc(d.memo)}</textarea></label>
        <label class="f wide">결과물 링크<input type="url" id="dm-res" name="result_url" value="${esc(safeUrl(d.result_url))}" placeholder="https://"></label>
        <div class="row wide"><button class="btn primary sm">${isGoal(d) ? '진척·메모 저장' : '메모·결과물 저장'}</button>
          ${isOpen(d) && !isGoal(d) && (stl(d) || isOverdue(d)) ? `<button type="button" class="btn sm" data-act="dirNudge" data-id="${esc(d.id)}">담당자에게 확인 요청</button>` : ''}</div>
      </form></section>`;

    const feedAsana = isAsana(d) ? (stories.length ? stories.map((s) => {
      const isC = s.type === 'comment' || s.resource_subtype === 'comment_added';
      const nm = s.created_by && s.created_by.name ? s.created_by.name : 'Asana';
      return isC ? `<li class="dir-st c">${avatar(nm)}<div><div class="h"><b>${esc(nm)}</b><span class="small muted">${when(s.created_at)}</span></div><div class="t">${linkify(s.text || '')}</div></div></li>`
        : `<li class="dir-st s"><span class="dir-dot" aria-hidden="true"></span><div class="small"><b>${esc(nm)}</b> ${esc(storyText(s))} <span class="muted">· ${when(s.created_at)}</span></div></li>`;
    }).join('') : `<li class="muted small">${det && det.state === 'loading' ? 'Asana 활동을 불러오는 중…' : det && det.state === 'err' ? esc(errText(det.err)) : !LIVE.mcp ? 'Asana에 연결된 보기에서만 활동이 보입니다.' : '아직 활동이 없습니다.'}</li>`) : '';
    const feedLocal = (d.log || []).map((l) => `<li class="dir-st s"><span class="dir-dot local" aria-hidden="true"></span><div class="small">${esc(l.text)} <span class="muted">· ${md(l.at)} · 현황판</span></div></li>`).join('');

    const enter = PANE.shown !== d.id; PANE.shown = d.id;
    queueMicrotask(restorePaneScroll);
    return `<aside class="dir-pane${enter ? ' enter' : ''}" role="dialog" aria-labelledby="dlg-title" id="dir-dlg" tabindex="-1">
      <div class="dir-pane-bar">
        <button type="button" class="dir-donebtn ${done ? 'on' : ''}" data-act="dirDone" data-id="${esc(d.id)}" aria-pressed="${done}"><span aria-hidden="true">✓</span>${done ? '완료됨' : '완료로 표시'}</button>
        ${!isGoal(d) ? `<button type="button" class="dir-iconbtn danger" data-act="dirAskDel" data-id="${esc(d.id)}" title="태스크 삭제">삭제</button>` : ''}
        <span class="dir-pane-sp"></span>
        ${isAsana(d) && safeUrl(d.source_url) ? `<a class="dir-iconbtn" href="${esc(d.source_url)}" target="_blank" rel="noopener noreferrer" title="Asana에서 열기">Asana ↗</a>` : ''}
        ${isAsana(d) && LIVE.mcp ? `<button type="button" class="dir-iconbtn" data-act="dirReload" data-id="${esc(d.id)}" title="새로고침" aria-label="상세 새로고침">↻</button>` : ''}
        <button type="button" class="dir-iconbtn" data-act="dirEditToggle" aria-pressed="${!!edit}">${edit ? '편집 닫기' : '편집'}</button>
        <button type="button" class="dir-iconbtn" data-act="dirClose" aria-label="패널 닫기" title="닫기 (Esc)">→|</button>
      </div>
      <div class="dir-pane-body">
        ${done ? `<div class="dir-donebanner">이 작업은 완료되었습니다.${isPendingAck(d) ? ' 위쪽 「완료 알림」에서 확인하면 목록에서 정리되고 칭찬이 갑니다.' : d.ack && d.ack !== 'before' ? ' 확인 ' + esc(when(d.ack)) : ''}</div>` : ''}
        <div class="row small dir-pane-kind">${srcPill(d)}${alerts(d)}${det && det.state === 'loading' ? '<span class="muted">Asana에서 불러오는 중…</span>' : ''}</div>
        <h2 class="dir-pane-title" id="dlg-title">${esc(d.title)}</h2>
        ${S.ui.dirDelAsk === d.id ? `<div class="explain dir-delask" role="alert"><b>${isAsana(d) ? 'Asana에서 이 태스크를 삭제합니다.' : '목록에서 삭제합니다.'}</b> ${isAsana(d) ? '하위 작업도 함께 지워지고 되돌리기 어렵습니다.' : ''}<div class="row" style="margin-top:8px">${S.ui.dirDelBusy ? '<span class="small"><span class="dir-spin sm" aria-hidden="true"></span>지우는 중…</span>' : `<button type="button" class="btn sm dir-dangerbtn" data-act="dirDel" data-id="${esc(d.id)}">삭제</button><button type="button" class="btn sm" data-act="dirCancelDel">취소</button>`}</div></div>` : ''}
        <div class="dir-panetabs" role="tablist">${[['detail', '상세'], ['rep', `AI 리포트 ${repsOf(d).length}`], ['prog', `진행 기록 ${progOf(d).length}`]].map(([v, l]) => `<button type="button" role="tab" data-act="paneTab" data-v="${v}" aria-selected="${(S.ui.paneTab || 'detail') === v}">${l}</button>`).join('')}</div>
        ${S.ui.paneTab === 'prog' ? progTab(d) : S.ui.paneTab === 'rep' ? repTab(d) : edit ? `<form class="form" data-form="dirEdit" data-id="${esc(d.id)}">${fieldsHtml('de', d)}<div class="row wide"><button class="btn primary">저장</button><button type="button" class="btn sm" data-act="dirEditToggle">취소</button></div></form>` : `${fields}${desc}${subs}${memo}`}
        ${S.ui.paneTab === 'rep' || S.ui.paneTab === 'prog' ? '' : `<section class="dir-feed"><h4>${isAsana(d) ? '댓글·활동' : '활동'}</h4><ul>${feedAsana}${feedLocal}</ul></section>`}
      </div>
      <form class="dir-composer" data-form="dirComment" data-id="${esc(d.id)}">
        ${avatar('윤')}<textarea id="dc-text" name="text" rows="2" placeholder="${isAsana(d) ? '댓글 추가 (Asana에 남습니다)' : '기록 추가'}" aria-label="댓글">${esc(S.ui.dirCmt && S.ui.dirCmt.id === d.id ? S.ui.dirCmt.text : '')}</textarea>
        <div class="dir-composer-foot"><span class="small muted">${followers.length ? '공동 작업자 ' + followers.map((f) => avatar(f.name)).join('') : ''}</span><button class="btn primary sm">댓글</button></div>
      </form>
    </aside>`;
  }

  /* ---------- 태그 관리 ---------- */
  function viewTags() {
    const ed = S.ui.editTag ? tagById(S.ui.editTag) : null;
    const del = S.ui.delTag ? tagById(S.ui.delTag) : null;
    const sorted = S.tags.slice().sort((a, b) => a.sort - b.sort);
    return `<section class="panel" aria-labelledby="h-tags"><h3 id="h-tags">태그 관리 <span class="small muted" style="font-family:var(--sans);font-weight:400">지시·신사업 공용 · ${S.tags.length}개</span></h3>
      ${del ? `<div class="explain dir-delbox" role="alert">"${esc(del.name)}" 태그를 삭제하면 지시 ${S.directives.filter((d) => d.tags.includes(del.id)).length}건, 신사업 ${S.ideas.filter((i) => i.tags.includes(del.id)).length}건에서 연결이 해제됩니다. 지시·신사업 자체는 남습니다.${String(del.id).startsWith('l') || String(del.id).startsWith('th-') ? ' (Asana·목표에서 자동으로 붙는 태그라 다시 불러오면 돌아옵니다.)' : ''}<div class="row" style="margin-top:8px"><button type="button" class="btn primary sm" data-act="delTag" data-id="${esc(del.id)}">연결 해제하고 삭제</button><button type="button" class="btn sm" data-act="cancelDelTag">취소</button></div></div>` : ''}
      <div class="tbl-wrap"><table class="dir-tbl dir-tagtbl"><thead><tr><th>순서</th><th>태그</th><th>설명</th><th class="r">지시</th><th class="r">신사업</th><th>관리</th></tr></thead><tbody>
      ${sorted.map((t, i) => `<tr class="${ed && ed.id === t.id ? 'dir-editing' : ''}"><td data-label="순서" class="num">${i + 1}</td><td data-label="태그">${chip(t.id)}</td><td data-label="설명" class="muted">${esc(t.description) || '-'}</td>
        <td data-label="지시" class="num r">${S.directives.filter((d) => d.tags.includes(t.id)).length}</td><td data-label="신사업" class="num r">${S.ideas.filter((x) => x.tags.includes(t.id)).length}</td>
        <td data-label="관리"><div class="row dir-tagbtns"><button type="button" class="btn sm" data-act="tagMove" data-id="${esc(t.id)}" data-v="-1" aria-label="${esc(t.name)} 위로" ${i === 0 ? 'disabled' : ''}>↑</button><button type="button" class="btn sm" data-act="tagMove" data-id="${esc(t.id)}" data-v="1" aria-label="${esc(t.name)} 아래로" ${i === sorted.length - 1 ? 'disabled' : ''}>↓</button><button type="button" class="btn sm" data-act="tagEdit" data-id="${esc(t.id)}">수정</button><button type="button" class="btn sm" data-act="askDelTag" data-id="${esc(t.id)}">삭제</button></div></td></tr>`).join('')}
      </tbody></table></div>
      <form class="form dir-tagform" data-form="tag" id="dir-tagform">
        <label class="f">${ed ? `"${esc(ed.name)}" 이름` : '새 태그 이름'}<input type="text" id="tg-name" name="name" required maxlength="20" value="${esc(ed ? ed.name : '')}"></label>
        <label class="f">색상<span class="dir-color"><input type="color" id="tg-color" name="color" value="${esc(ed ? ed.color : '#F29801')}" aria-label="태그 색상"><span class="small muted">눌러서 고르기</span></span></label>
        <label class="f">설명<input type="text" id="tg-desc" name="description" value="${esc(ed ? ed.description : '')}" placeholder="어떤 지시에 붙이는지"></label>
        <div class="row"><button class="btn primary sm">${ed ? '수정 저장' : '+ 태그 추가'}</button>${ed ? '<button type="button" class="btn sm" data-act="cancelEditTag">취소</button>' : ''}</div>
      </form></section>`;
  }

  /* ---------- 연결 상태 띠 ---------- */
  function syncBar() {
    if (!S.liveMode && LIVE.state === 'off') {
      const syncLast = S.dirSync.log[0];
      const nextAt = new Date(new Date(S.dirSync.last).getTime() + 3600000).toISOString();
      const pend = S.directives.filter(isPending).length;
      return `<div class="dir-syncbar" role="status"><span class="dir-asana" aria-hidden="true"></span>
        <span><b>Asana "회장 지시"</b> 양방향 동기화 · 1시간마다</span>
        <span class="small muted">마지막 ${hm(S.dirSync.last)}${syncLast ? ` (보냄 ${syncLast.sent} · 받음 ${syncLast.recv})` : ''} · 다음 ${hm(nextAt)}</span>
        ${pend ? `<span class="dir-sync pend">보낼 변경 ${pend}건</span>` : '<span class="dir-sync ok">모두 맞춰짐</span>'}
        <button type="button" class="btn sm" data-act="dirSync">지금 동기화</button>
        <span class="small muted dir-mock">목업: 실제 Asana 연결 없음 · claude.ai 아티팩트로 열면 실데이터를 불러옵니다</span></div>`;
    }
    const nA = S.directives.filter(isAsana).length, nC = S.directives.filter((d) => d.src === 'goal_c').length, nD = S.directives.filter((d) => d.src === 'goal_d').length;
    const pend = S.directives.filter((d) => isAsana(d) && isPending(d)).length;
    const e = LIVE.asanaErr;
    const when = LIVE.asanaAt ? `${md(new Date(LIVE.asanaAt))} ${hm(LIVE.asanaAt)}` : '—';
    return `<div class="dir-syncbar live" role="status"><span class="dir-asana" aria-hidden="true"></span>
      <span><b>실데이터</b> · Asana 지시 ${nA}건 · 전사목표 ${nC}건 · 부서목표 ${nD}건</span>
      <span class="small muted">Asana ${LIVE.busy ? '불러오는 중…' : `${esc(LIVE.asanaFrom || '없음')} · ${when} 기준`} · 1시간마다 새로고침</span>
      ${pend ? `<span class="dir-sync pend">보낼 변경 ${pend}건</span>` : nA ? '<span class="dir-sync ok">Asana와 맞춰짐</span>' : ''}
      <button type="button" class="btn sm" data-act="dirSync" ${LIVE.busy || !LIVE.mcp ? 'disabled' : ''}>${pend ? '보내고 새로고침' : '지금 새로고침'}</button>
      ${LIVE.mcp ? `<span class="small dir-aistat ${LIVE.inhouse ? 'ok' : ''}">기본 AI ${esc(aiName(utilAi()))}${utilAi() === 'inhouse' ? (LIVE.inhouse ? ' · 연결됨' : LIVE.inhouse === false ? ' · 연결 안 됨(회사 PC의 데스크톱 앱에서만)' : ' · 확인 중') : ''}${NIGHT.state === 'running' ? ` · 밤 리포트 ${NIGHT.done}/${NIGHT.total}` : ''}</span>` : ''}
      ${LIVE.db && LIVE.mcp ? `<span class="small muted dir-progstat">진행 기록 ${PROGRUN.state === 'running' ? `모으는 중 ${PROGRUN.done}/${PROGRUN.total}` : PROGRUN.state === 'done' ? '오늘 모음' : kstHour() >= COLLECT_HOUR ? '오늘 자동 조사 대기' : '오늘 22:00 이후 자동 조사'} <button type="button" class="dir-link" data-act="progAll" ${PROGRUN.state === 'running' ? 'disabled' : ''}>지금 모으기</button></span>` : ''}
      ${e ? `<span class="small dir-err">${esc(errText(e))}${needsAllow(e) ? ' <button type="button" class="dir-link" data-act="dirAllow">허용하고 불러오기</button>' : ''}</span>` : ''}
      ${!LIVE.mcp ? '<span class="small muted dir-mock">이 보기에서는 Asana를 부를 수 없어 저장본을 보여 드립니다.</span>' : ''}</div>`;
  }

  /* ---------- 메인 화면 ---------- */
  function viewDirectives() {
    normalize();
    if (LIVE.state === 'loading' && !S.liveMode) {
      return `<div class="view-head"><div><h2>지시 관리</h2><p>Asana 지시와 전사·부서 목표를 불러오고 있습니다.</p></div></div>
        <div class="panel dir-loading" role="status"><span class="dir-spin" aria-hidden="true"></span><div><b>Asana "[지시업무] ceo 윤석범"과 목표를 불러오는 중…</b><p class="small muted" style="margin:4px 0 0">Asana 사용을 묻는 창이 뜨면 허용해 주세요. Asana 응답이 늦으면 1분 가까이 걸릴 수 있습니다.</p></div></div>`;
    }
    if (LIVE.state === 'error' && !S.liveMode) {
      const e = LIVE.asanaErr;
      return `<div class="view-head"><div><h2>지시 관리</h2></div></div>
        <div class="panel dir-loading" role="alert"><div><b>${esc(errText(e))}</b><div class="row" style="margin-top:8px">${needsAllow(e) ? '<button type="button" class="btn primary sm" data-act="dirAllow">허용하고 불러오기</button>' : '<button type="button" class="btn sm" data-act="dirSync">다시 불러오기</button>'}</div></div></div>`;
    }
    const main = S.ui.dirMain || 'task';
    const mainTabs = `<div class="dir-maintabs" role="tablist" aria-label="지시 메뉴">${[['task', '태스크 관리', '지금 돌아가는 일'], ['dev', '지시 개발', '시킬 일을 다듬기'], ['mgr', '지시 관리', '지시한 것의 성과']].map(([v, l, h]) => `<button type="button" role="tab" data-act="dirMain" data-v="${v}" aria-selected="${main === v}"><b>${l}</b><small>${h}</small></button>`).join('')}</div>`;
    if (main === 'dev') {
      return `${mainTabs}<div class="view-head"><div><h2>지시 개발</h2><p>시킬 일을 후보로 모아 두고, 카드로 다듬어 Asana·Slack으로 지시합니다.</p></div></div>
        ${devPanel()}${detailDialog()}${ideaPane()}${ideaModal()}`;
    }
    if (main === 'mgr') {
      return `${mainTabs}<div class="view-head"><div><h2>지시 관리</h2><p>지시한 일의 진행과 사람별 이행 지표를 한눈에 봅니다.</p></div></div>
        ${syncBar()}${mgrPanel()}${detailDialog()}`;
    }
    const f = fullFilter();
    const list = filtered(f);
    const mode = S.ui.dirView || '목록';
    const tab = S.ui.dirTab || 'task';
    const open = S.directives.filter(isOpen);
    const over = S.directives.filter(isOverdue), stale = S.directives.filter(stl);
    const wait = S.directives.filter((d) => d.status === '보고대기');
    const sumParts = filterSummary(f);
    const sorted = S.tags.slice().sort((a, b) => a.sort - b.sort);
    const stat = (v, label, n, cls, on) => `<button type="button" class="dir-stat ${cls} ${on ? 'on' : ''}" data-act="dirQuick" data-v="${v}" aria-pressed="${on}"><span class="l">${label} ${badge('측정')}</span><span class="n num">${n}<small>건</small></span></button>`;
    const body = mode === '칸반' ? kanbanView(list) : mode === '타임라인' ? timelineView(list) : listView(list);
    const tagCount = (id) => S.directives.filter((d) => d.tags.includes(id)).length;

    return `${mainTabs}
      <div class="view-head"><div><h2>태스크 관리</h2><p>${S.liveMode ? 'Asana 지시와 전사·부서 목표를 한곳에서 챙깁니다. 기한 경과와 3일 무응답은 경보로 띄웁니다.' : '회장 지시를 등록·추적합니다. 기한 경과와 3일 무응답은 경보로 띄웁니다.'}</p></div>
        <button type="button" class="btn primary" data-act="dirNewToggle" aria-expanded="${!!S.ui.dirNew}">+ 지시 등록</button></div>

      ${syncBar()}
      ${newPanel()}
      ${ackPanel(S.directives.filter(isPendingAck))}

      <div class="dir-stats" role="group" aria-label="경보·현황 (누르면 필터)">
        ${stat('overdue', '기한 경과', over.length, 'crit', f.due === 'overdue')}
        ${stat('stale', '3일 무응답', stale.length, 'warn', f.due === 'stale')}
        ${stat('wait', '보고대기', wait.length, 'info', f.status === '보고대기')}
        ${stat('open', '미완료', open.length, '', f.status === 'open' && !f.due)}
      </div>

      ${S.liveMode ? `<div class="seg dir-srcseg" role="group" aria-label="종류">${[['', '전체'], ['asana', 'Asana 지시'], ['goal_c', '전사목표'], ['goal_d', '부서목표']].map(([v, l]) => `<button type="button" data-act="dirSrc" data-v="${v}" aria-pressed="${f.src === v}">${l} <span class="num">${v ? S.directives.filter((d) => d.src === v).length : S.directives.length}</span></button>`).join('')}</div>` : ''}

      <section class="panel dir-filter" aria-labelledby="h-filter">
        <div class="row" style="justify-content:space-between"><h3 id="h-filter">필터</h3>
          <div class="seg" role="group" aria-label="태그 조건">${['OR', 'AND'].map((m) => `<button type="button" data-act="fMode" data-v="${m}" aria-pressed="${f.mode === m}">${m === 'OR' ? '하나라도(OR)' : '모두(AND)'}</button>`).join('')}</div></div>
        <div class="row dir-tagrow" role="group" aria-label="태그 선택">${sorted.filter((t) => !S.liveMode || tagCount(t.id) || f.tags.includes(t.id)).map((t) => { const on = f.tags.includes(t.id); return `<button type="button" class="chip dir-ftag ${on ? 'on' : ''}" data-act="fTag" data-id="${esc(t.id)}" aria-pressed="${on}" style="${on ? `border-color:${esc(t.color)};box-shadow:inset 0 0 0 1px ${esc(t.color)}` : ''}"><span class="dot" style="background:${esc(t.color)}"></span>${esc(t.name)}<span class="num muted">${tagCount(t.id)}</span></button>`; }).join('')}</div>
        <div class="form dir-fform">
          <label class="f">검색<input type="text" id="f-q" data-act="fField" data-k="q" value="${esc(f.q)}" placeholder="내용·담당자·메모"></label>
          <label class="f">상태<select id="f-status" data-act="fField" data-k="status"><option value="all">전체</option><option value="open" ${f.status === 'open' ? 'selected' : ''}>미완료 전체</option>${STATUSES.map((s) => `<option ${f.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
          <label class="f">조직<select id="f-org" data-act="fField" data-k="org"><option value="">전체</option>${orgList().map((o) => `<option ${f.org === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></label>
          <label class="f">기한<select id="f-due" data-act="fField" data-k="due"><option value="">전체</option>${[['alert', '경보 전체(경과·무응답)'], ['overdue', '기한 경과'], ['stale', '3일 무응답'], ['today', '오늘 기한'], ['d3', '3일 이내'], ['week', '7일 이내'], ['none', '기한 없음']].map(([v, l]) => `<option value="${v}" ${f.due === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          <label class="f">우선순위<select id="f-prio" data-act="fField" data-k="prio"><option value="">전체</option>${PRIOS.map((p) => `<option ${f.prio === p ? 'selected' : ''}>${p}</option>`).join('')}</select></label>
        </div>
        <div class="dir-saved"><span class="small muted">저장된 보기</span>
          ${S.savedViews.map((v) => `<span class="dir-sv ${sameFilter(v.filter, f) ? 'on' : ''}"><button type="button" data-act="loadView" data-id="${esc(v.id)}" aria-pressed="${sameFilter(v.filter, f)}">${esc(v.name)}</button><button type="button" data-act="delView" data-id="${esc(v.id)}" aria-label="${esc(v.name)} 보기 삭제" title="삭제">×</button></span>`).join('') || '<span class="small muted">없음</span>'}
          <button type="button" class="btn sm" data-act="saveView" ${sumParts.length ? '' : 'disabled title="조건을 하나 이상 고르면 저장할 수 있습니다"'}>+ 현재 조건 저장</button>
        </div>
        <div id="saveViewBox"></div>
      </section>

      <div class="dir-tabs" role="tablist" aria-label="지시 관리 화면">${[['task', '태스크', list.length], ['org', '조직별 이행률', null], ['tags', '태그 관리', S.tags.length], ['cw', '전사 지시', Object.keys(LIVE.cw || {}).length || null]].map(([v, l, n]) => `<button type="button" role="tab" data-act="dirTab" data-v="${v}" aria-selected="${tab === v}">${l}${n != null ? ` <span class="num">${n}</span>` : ''}</button>`).join('')}</div>
      ${tab === 'org' ? orgPanel() : tab === 'tags' ? viewTags() : tab === 'cw' ? cwPanel() : `<div class="dir-resbar"><p class="small" style="margin:0"><b class="num">${list.length}</b>건 / 전체 ${S.directives.length}건${f.status !== '완료' && S.directives.some(isAcked) ? ` · <button type="button" class="dir-link" data-act="dirShowDone">확인 끝난 완료 ${S.directives.filter(isAcked).length}건 보기</button>` : ''}${sumParts.length ? ` · <span class="muted">${esc(sumParts.join(' · '))}</span> <button type="button" class="dir-link" data-act="fReset">조건 지우기</button>` : ''}</p>
        <div class="seg" role="group" aria-label="보기 방식">${['목록', '칸반', '타임라인'].map((m) => `<button type="button" data-act="dirView" data-v="${m}" aria-pressed="${m === mode}">${m}</button>`).join('')}</div></div>
      ${body}`}
      ${detailDialog()}`;
  }

  /* ---------- 동작 ---------- */
  const find = (id) => S.directives.find((x) => x.id === id);
  const focusLater = (sel) => setTimeout(() => { const el = document.querySelector(sel); if (el) el.focus(); }, 0);
  const setF = (patch) => { S.ui.filter = Object.assign({}, fullFilter(), patch); };

  APP.acts.dirRefresh = () => {};
  APP.acts.dirNewToggle = () => { S.ui.dirNew = !S.ui.dirNew; if (!S.ui.dirNew) S.ui.dirDraft = null; if (S.ui.dirNew) focusLater('#dn-title'); };
  APP.acts.dirOpen = (el) => {
    if (S.ui.dirOpen === el.dataset.id && !el.closest('.dir-pane')) { S.ui.dirOpen = null; S.ui.dirEdit = false; return; }
    S.ui.idOpen = null; S.ui.dirOpen = el.dataset.id; S.ui.dirEdit = false; if (!el.closest('.dir-pane')) S.ui.dirReturn = el.dataset.id; const d = find(el.dataset.id); if (d) setTimeout(() => loadDetail(d), 0); focusLater('#dir-dlg'); };
  APP.acts.dirReload = (el) => { const d = find(el.dataset.id); if (d) setTimeout(() => loadDetail(d, true), 0); };
  APP.acts.dirDone = (el) => {
    const d = find(el.dataset.id); if (!d) return;
    const prev = d.status;
    d.status = prev === '완료' ? (d._before_done && d._before_done !== '완료' ? d._before_done : '진행') : '완료';
    if (prev !== '완료') d._before_done = prev;
    d.updated_at = S.today;
    if (d.status === '완료') { d.completed_at = new Date().toISOString(); d.ack = ''; d.pendingAck = true; delete PR[d.id]; }
    if (isAsana(d)) pushAsana(d, d.status === '완료' ? '완료로 표시' : '완료 취소');
    else if (isGoal(d)) writeTrack(d, { status: d.status }, '상태 → ' + d.status);
    else toast(d.status === '완료' ? '완료로 표시했습니다' : '완료를 취소했습니다');
  };
  APP.changes.dirDue = (el) => {
    const d = find(el.dataset.id); if (!d || isGoal(d)) return;
    d.due_at = el.value || (isAsana(d) ? NONE_DUE : d.due_at); d.updated_at = S.today;
    if (isAsana(d)) pushAsana(d, '마감일 ' + (el.value || '없음')); else addLog(d, '마감일 → ' + d.due_at);
  };
  APP.changes.dirPrio = (el) => {
    const d = find(el.dataset.id); if (!d || !PRIOS.includes(el.value)) return;
    d.priority = el.value;
    if (isAsana(d)) pushAsana(d, '우선순위 ' + el.value);
    else if (isGoal(d)) writeTrack(d, { priority: el.value }, '우선순위 → ' + el.value);
    else addLog(d, '우선순위 → ' + el.value);
  };
  APP.forms.dirComment = (fd, form) => {
    const d = find(form.dataset.id); if (!d) return;
    const text = (fd.get('text') || '').toString().trim();
    if (!text) { toast('댓글 내용을 적어 주세요'); return; }
    if (isAsana(d)) {
      S.ui.dirCmt = { id: d.id, text };
      commentAsana(d, text).then((ok) => { if (ok) { S.ui.dirCmt = null; toast('Asana에 댓글을 남겼습니다'); loadDetail(d, true); } else rerender(); });
      return;
    }
    if (isGoal(d)) { writeTrack(d, {}, '댓글: ' + text); addLog(d, '댓글: ' + text); toast('기록을 남겼습니다'); return; }
    addLog(d, '댓글: ' + text); toast('기록을 남겼습니다');
  };
  APP.acts.dirClose = () => {
    S.ui.dirOpen = null; S.ui.dirEdit = false;
    if (S.ui.dirReturn) focusLater(`[data-act="dirOpen"][data-id="${S.ui.dirReturn}"]`);
  };
  APP.acts.dirEditToggle = () => { S.ui.dirEdit = !S.ui.dirEdit; focusLater(S.ui.dirEdit ? '#de-title' : '#dir-dlg'); };
  APP.acts.dirShowDone = () => { setF({ status: '완료' }); };
  APP.acts.dirTab = (el) => { S.ui.dirTab = el.dataset.v; };
  APP.acts.dirSrc = (el) => { setF({ src: el.dataset.v }); };
  APP.acts.dirAllow = () => { LIVE.asanaErr = null; fetchAsana(true, true); };
  APP.acts.dirSync = () => {
    if (S.liveMode || LIVE.state !== 'off') {
      if (!LIVE.mcp) { toast('이 보기에서는 Asana를 부를 수 없습니다'); return; }
      const pend = S.directives.filter((d) => isAsana(d) && isPending(d));
      (async () => { for (const d of pend) await pushAsana(d, '보낼 변경'); fetchAsana(true); })();
      return;
    }
    const n = runSync(false); toast(n ? `Asana로 ${n}건 보내고 0건 받았습니다(목업)` : 'Asana와 이미 맞춰져 있습니다(목업)');
  };
  APP.acts.dirRepush = (el) => { const d = find(el.dataset.id); if (d) pushAsana(d, '다시 보내기'); };
  APP.acts.dirNudge = (el) => {
    const d = find(el.dataset.id); if (!d) return;
    if (isAsana(d)) {
      const msg = `[회장 현황판] 진행 상황을 알려 주세요.${isOverdue(d) ? ` 기한(${d.due_at})이 지났습니다.` : ` ${quiet(d)}일째 갱신이 없습니다.`}`;
      commentAsana(d, msg).then((ok) => { if (ok) { writeTrack(d, {}, '담당자에게 확인 요청(Asana 댓글)'); toast(`${d.assignee}에게 Asana 댓글로 확인 요청을 남겼습니다`); } });
      return;
    }
    addLog(d, '담당자에게 확인 요청(Asana 댓글·목업)'); toast(`${d.assignee}에게 확인 요청을 보냈습니다(목업)`);
  };
  APP.acts.dirQuick = (el) => {
    const v = el.dataset.v; const f = fullFilter();
    const patch = { overdue: { due: 'overdue', status: 'all' }, stale: { due: 'stale', status: 'all' }, wait: { status: '보고대기', due: '' }, open: { status: 'open', due: '' } }[v];
    const on = v === 'wait' ? f.status === '보고대기' : v === 'open' ? f.status === 'open' && !f.due : f.due === v;
    setF(on ? { status: 'all', due: '' } : patch); S.ui.dirTab = 'task';
  };
  APP.acts.dirOrg = (el) => { const f = fullFilter(); setF({ org: f.org === el.dataset.v ? '' : el.dataset.v }); S.ui.dirTab = 'task'; setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 0); };
  APP.acts.tagEdit = (el) => { S.ui.editTag = el.dataset.id; S.ui.delTag = null; focusLater('#tg-name'); setTimeout(() => { const fm = $('#dir-tagform'); if (fm) fm.scrollIntoView({ block: 'center' }); }, 0); };
  APP.acts.tagMove = (el) => {
    const sorted = S.tags.slice().sort((a, b) => a.sort - b.sort);
    const i = sorted.findIndex((t) => t.id === el.dataset.id); const j = i + (+el.dataset.v);
    if (j < 0 || j >= sorted.length) return;
    [sorted[i], sorted[j]] = [sorted[j], sorted[i]];
    sorted.forEach((t, k) => { t.sort = k + 1; });
    focusLater(`[data-act="tagMove"][data-id="${el.dataset.id}"][data-v="${el.dataset.v}"]`);
  };

  /* 상태 select 변경: app.js가 값을 바꾼 뒤 실데이터면 Asana·DB로 보낸다 */
  document.addEventListener('change', (e) => {
    const el = e.target; if (!el || el.dataset.act !== 'dirStatus') return;
    const d = find(el.dataset.id); if (!d) return;
    if (d.status === '완료' && !d.ack) { d.completed_at = new Date().toISOString(); d.pendingAck = true; delete PR[d.id]; }
    if (isAsana(d)) pushAsana(d, '상태 ' + d.status);
    else if (isGoal(d)) writeTrack(d, { status: d.status }, '상태 → ' + d.status).then(() => toast('목표 상태를 저장했습니다'));
  });

  const readFields = (fd, g, old) => {
    const keepSample = (n) => g(n) || (old && old[n] === '#' ? '#' : '');
    return { title: g('title'), body: g('body'), org: g('org'), assignee: g('assignee') || '미지정', issued_at: g('issued_at') || S.today, due_at: g('due_at') || dayStr(7), priority: PRIOS.includes(g('priority')) ? g('priority') : '보통', tags: fd.getAll('tags'), source_url: keepSample('source_url'), memo: g('memo') };
  };
  const gOf = (fd) => (n) => (fd.get(n) || '').toString().trim();

  APP.forms.dirNew = (fd) => {
    const g = gOf(fd);
    if (S.liveMode && LIVE.mcp) {
      const v = readFields(fd, g);
      S.ui.dirDraft = Object.assign({ status: '지시', result_url: '' }, v);
      const notes = [v.body, v.assignee !== '미지정' ? '담당: ' + v.org + ' ' + v.assignee : '담당 조직: ' + v.org, v.source_url && v.source_url !== '#' ? '원문: ' + v.source_url : '', v.memo ? '메모: ' + v.memo : '', '(회장 현황판에서 등록)'].filter(Boolean).join('\n');
      const task = { name: v.title, project_id: ASANA.project, section_id: ASANA.sec['지시'], notes };
      if (v.due_at) task.due_on = v.due_at;
      if (v.priority !== '보통') task.custom_fields = JSON.stringify({ [ASANA.prioField]: ASANA.prioOpt['높음'] });
      toast('Asana에 태스크를 만드는 중…');
      LIVE.mcp.callTool(ASANA.server, 'create_tasks', { default_project: ASANA.project, tasks: [task] }).then((r) => {
        const p = (r && r.payload) || {};
        if (Array.isArray(p.failed) && p.failed.length) throw { code: 'tool_error', message: JSON.stringify(p.failed[0].errors || p.failed[0]).slice(0, 160) };
        S.ui.dirDraft = null; S.ui.dirNew = false;
        toast('Asana에 지시를 만들었습니다');
        fetchAsana(true);
      }).catch((e) => { toast('Asana 등록 실패 — ' + errText(e) + ' 입력한 내용은 남겨 두었습니다.'); S.ui.dirNew = true; rerender(); });
      return;
    }
    const n = 1000 + S.directives.length + 1;
    const d = Object.assign({ id: uid('d'), status: '지시', result_url: '', updated_at: S.today, asana_gid: 'mock-' + n }, readFields(fd, g));
    d.log = [{ at: S.today, text: `지시 등록 · Asana "회장 지시" 태스크 ${d.asana_gid} 생성(목업)` }];
    d.synced_sig = sig(d); d._st = d.status;
    S.directives.push(d); S.ui.dirNew = false;
    toast(`등록 완료 · Asana 태스크 ${d.asana_gid} 생성(목업)`);
  };

  APP.forms.dirEdit = (fd, form) => {
    const d = find(form.dataset.id); if (!d) return; const g = gOf(fd);
    if (isAsana(d) || isGoal(d)) {
      const prio = PRIOS.includes(g('priority')) ? g('priority') : d.priority;
      const status = STATUSES.includes(g('status')) ? g('status') : d.status;
      const memo = g('memo'); const res = g('result_url');
      if (isAsana(d)) {
        d.title = g('title') || d.title; d.due_at = g('due_at') || NONE_DUE; d.priority = prio; d.status = status;
        pushAsana(d, '편집');
      } else {
        const before = d.status;
        d.priority = prio; d.status = status;
        writeTrack(d, { priority: prio, status }, before !== status ? '상태 → ' + status : '우선순위·내용 수정');
      }
      if (memo !== d.memo || res !== d.result_url) saveMemo(d, memo, res, null);
      S.ui.dirEdit = false; focusLater('#dir-dlg'); return;
    }
    const before = sig(d);
    Object.assign(d, readFields(fd, g, d), { status: STATUSES.includes(g('status')) ? g('status') : d.status, result_url: g('result_url') || (d.result_url === '#' ? '#' : '') });
    if (sig(d) !== before) { d.updated_at = S.today; if (d._st === d.status) addLog(d, '내용 수정'); toast('저장했습니다 · 다음 동기화 때 Asana에 반영'); }
    S.ui.dirEdit = false; focusLater('#dir-dlg');
  };

  function saveMemo(d, memo, res, goalPatch) {
    const changed = [];
    if (memo !== d.memo) changed.push('메모');
    if (res !== d.result_url) changed.push('결과물 링크');
    if (goalPatch && goalPatch.pct !== d.pct) changed.push(`진척 ${d.pct}% → ${goalPatch.pct}%`);
    if (goalPatch && goalPatch.cur !== d.cur) changed.push('현재값');
    if (!changed.length) { toast('바뀐 내용이 없습니다'); return; }
    d.memo = memo; d.result_url = res;
    if (goalPatch) { d.pct = goalPatch.pct; d.cur = goalPatch.cur; }
    const patch = Object.assign({ memo, result_url: res }, goalPatch || {});
    writeTrack(d, patch, changed.join('·') + ' 수정').then((ok) => {
      if (!ok) return;
      if (isAsana(d)) {
        const text = ['[회장 현황판 메모]', memo, res ? '결과물: ' + res : ''].filter(Boolean).join('\n');
        commentAsana(d, text).then((c) => toast(changed.join('·') + (c ? ' 저장 · Asana 댓글로도 남겼습니다' : ' 저장(댓글은 실패)')));
      } else toast(changed.join('·') + ' 저장했습니다');
    });
  }

  APP.forms.dirMemo = (fd, form) => {
    const d = find(form.dataset.id); if (!d) return; const g = gOf(fd);
    const memo = g('memo');
    if (d.src) {
      const res = g('result_url');
      const gp = isGoal(d) ? { pct: Math.max(0, Math.min(100, Math.round(+g('pct') || 0))), cur: g('cur') } : null;
      saveMemo(d, memo, res, gp);
      return;
    }
    const res = g('result_url') || (d.result_url === '#' ? '#' : '');
    const changed = [];
    if (memo !== d.memo) changed.push('메모');
    if (res !== d.result_url) changed.push('결과물 링크');
    if (!changed.length) { toast('바뀐 내용이 없습니다'); return; }
    d.memo = memo; d.result_url = res; d.updated_at = S.today;
    addLog(d, changed.join('·') + ' 수정');
    toast(changed.join('·') + ' 저장 · 다음 동기화 때 Asana에 반영');
  };

  /* ================= AI 리포트 (태스크별 도움 보고서) ================= */
  const AI_DEFAULT = [{ id: 'claude', name: 'Claude', on: true }, { id: 'gemini', name: 'Gemini', on: false }, { id: 'gpt', name: 'ChatGPT', on: false }, { id: 'inhouse', name: '사내 서버', on: false }];
  const REPGEN = {};
  const allAi = () => { const c = LIVE.cfg; return c && Array.isArray(c.providers) && c.providers.length ? c.providers.filter((p) => p && p.id) : AI_DEFAULT; };
  const aiList = () => { const c = LIVE.cfg; const menu = c && c.menus && c.menus.directives; const p = allAi(); return Array.isArray(menu) && menu.length ? p.filter((x) => menu.includes(x.id)) : p; };
  const aiOf = (d) => (LIVE.track[d.id] || {}).ai || (S.dirAi && S.dirAi[d.id]) || (LIVE.cfg && LIVE.cfg.defaultAi) || 'claude';
  const aiName = (id) => (allAi().concat(AI_DEFAULT).find((x) => x.id === id) || { name: id }).name;
  /* 사내 AI(Qwen): 회장 PC의 로컬 커넥터(host:isens-ai, tools/isens-ai-mcp)를 Claude 데스크톱 앱이 연결했을 때만 쓸 수 있다 */
  const INHOUSE = 'host:isens-ai';
  const aiReady = (id) => { const p = allAi().concat(AI_DEFAULT).find((x) => x.id === id); if (!(p && p.on)) return false; return id === 'claude' ? true : id === 'inhouse' ? LIVE.inhouse === true : false; };
  const utilAi = () => (LIVE.cfg && LIVE.cfg.defaultAi) || 'claude';
  async function checkInhouse() {
    if (!LIVE.mcp) { LIVE.inhouse = false; return false; }
    try { const r = await LIVE.mcp.listTools(INHOUSE); LIVE.inhouse = !!(r && Array.isArray(r.servers) && r.servers.some((x) => x.server === INHOUSE && (x.tools || []).length)); } catch (e) { LIVE.inhouse = false; }
    rerender(); return LIVE.inhouse;
  }
  const looseJson = (t) => {
    t = String(t || '').replace(/<think>[\s\S]*?<\/think>/g, '').replace(/```(?:json)?/g, '').trim();
    const a = Math.min(...['[', '{'].map((c) => { const i = t.indexOf(c); return i < 0 ? Infinity : i; }));
    const b = Math.max(t.lastIndexOf(']'), t.lastIndexOf('}'));
    if (a === Infinity || b < a) throw { code: 'bad_json', message: 'JSON을 읽지 못했습니다' };
    return JSON.parse(t.slice(a, b + 1));
  };
  /* Claude sample과 같은 모양(함수 + .json)으로 돌려준다. 쓸 수 없으면 null */
  /* 회장이 직접 누른 요청: 지정 AI를 못 쓰면 Claude로 대신한다(자동 작업은 대신하지 않음) */
  async function manualLLM(id) {
    let llm = null; try { llm = await getLLM(id); } catch (e) { llm = null; }
    if (llm) return { llm, used: id, fallback: false };
    if (id !== 'claude') { let c = null; try { c = await getLLM('claude'); } catch (e) { c = null; } if (c) return { llm: c, used: 'claude', fallback: true }; }
    return { llm: null, used: id, fallback: false };
  }
  const withTimeout = (pr, ms) => Promise.race([pr, new Promise((r) => setTimeout(r, ms))]);
  async function getLLM(id) {
    if (id === 'inhouse') {
      if (!LIVE.mcp) return null;
      if (LIVE.inhouse === undefined) await checkInhouse();
      if (!LIVE.inhouse) return null;
      const call = async (prompt, o) => {
        const r = await LIVE.mcp.callTool(INHOUSE, 'generate', { prompt: String(prompt), max_tokens: (o && o.max) || 2500, temperature: 0.3, json: !!(o && o.json) });
        const p = r && r.payload; const text = typeof p === 'string' ? p : p && typeof p.text === 'string' ? p.text : '';
        return text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
      };
      const f = async (prompt, o) => { const text = await call(prompt, o); if (o && o.onText) o.onText({ text, delta: text }); return { text, truncated: false }; };
      f.json = async (prompt, o) => looseJson(await call(prompt, Object.assign({}, o || {}, { json: true, max: 1800 })));
      f.label = '사내 AI'; return f;
    }
    if (id === 'claude') {
      const smp = hasClaude ? await window.claude.use('sample') : null; if (!smp) return null;
      const f = (p, o) => smp(p, o); f.json = (p, o) => smp.json(p, o); f.label = 'Claude'; return f;
    }
    return null;
  }
  const repsOf = (d) => (LIVE.reps[d.id] || (S.dirReps && S.dirReps[d.id]) || []);
  const planOf = (d) => { const p = LIVE.plan; return p && Array.isArray(p.items) ? p.items.find((x) => x.task_id === d.id) : null; };
  function repLine(d) {
    const n = repsOf(d).length; const pl = planOf(d);
    return `<div class="dir-repline"><button type="button" class="dir-repbtn ${n ? 'has' : ''}" data-act="repOpen" data-id="${esc(d.id)}">AI 리포트 <b class="num">${n}</b></button><button type="button" class="dir-repbtn ${progOf(d).length ? 'has prog' : ''}" data-act="progOpen" data-id="${esc(d.id)}">진행 기록 <b class="num">${progOf(d).length}</b>${progOf(d)[0] && progOf(d)[0].signal && progOf(d)[0].signal !== '정보 없음' ? ` · ${esc(progOf(d)[0].signal)}` : ''}</button><span class="small muted">${esc(aiName(aiOf(d)))}${pl ? ` · 오늘 ${esc(pl.kind || '리포트')} ${esc(pl.status || '예정')}` : ''}</span></div>`;
  }
  /* 아주 작은 마크다운 표시기 (제목·목록·굵게·문단) */
  function mdHtml(src) {
    const lines = String(src || '').split('\n'); let out = ''; let inList = false;
    const inline = (t) => esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
    lines.forEach((l) => {
      const m = l.match(/^\s*[-*]\s+(.*)$/) || l.match(/^\s*\d+[.)]\s+(.*)$/);
      if (m) { if (!inList) { out += '<ul>'; inList = true; } out += `<li>${inline(m[1])}</li>`; return; }
      if (inList) { out += '</ul>'; inList = false; }
      const h = l.match(/^(#{1,4})\s+(.*)$/);
      if (h) out += `<h5>${inline(h[2])}</h5>`; else if (l.trim()) out += `<p>${inline(l)}</p>`;
    });
    if (inList) out += '</ul>';
    return out;
  }
  /* 태스크 맥락 (리포트·추천 공통) */
  async function taskContext(d) {
    if (isAsana(d) && LIVE.mcp) { try { await withTimeout(loadDetail(d), 15000); } catch (e) { /* 상세 없이 진행 */ } }
    const det = isAsana(d) ? DET[d.asana_gid] : null;
    const notes = String((det && det.task && det.task.notes) || d.body || '').slice(0, 1500);
    const cmts = ((det && det.stories) || []).filter((s) => s.type === 'comment' || s.resource_subtype === 'comment_added').slice(-8).map((s) => `- ${(s.created_by && s.created_by.name) || ''}: ${String(s.text || '').slice(0, 300)}`).join('\n');
    const prev = repsOf(d).slice(0, 5).map((r) => `- ${r.created ? r.created.slice(0, 10) : ''} ${r.kind}: ${r.title}`).join('\n');
    const sb = LIVE.cfg && LIVE.cfg.secondBrain && LIVE.cfg.secondBrain.name ? `\n세컨드브레인: ${LIVE.cfg.secondBrain.name} (이 화면에서는 내용을 직접 읽지 못합니다. 참고하면 좋을 항목은 '세컨드브레인에서 확인'으로 적어 주세요)` : '';
    return `업무: ${d.title}
종류: ${SRC_LABEL[d.src] || '지시'} · 상태 ${d.status} · 우선 ${d.priority} · 기한 ${dueFull(d)} · 담당 ${d.org}${d.assignee !== d.org ? ' ' + d.assignee : ''}
${isGoal(d) ? `지표: ${d.metric} · 현재 ${d.cur} → 목표 ${d.target} · 진척 ${d.pct}% / 계획 ${d.plan}%\n` : ''}설명: ${notes || '(없음)'}
최근 댓글:
${cmts || '(없음)'}
현황판 메모: ${d.memo || '(없음)'}
이미 만든 리포트:
${prev || '(없음)'}
최근 진행 기록(AI 자동 조사):
${progOf(d).slice(0, 5).map((p) => `- ${p.date} [${p.signal}] ${(p.summary || []).join(' / ')}`).join('\n') || '(없음)'}${sb}`;
  }
  const REP_RULES = '규칙: 사실을 지어내지 말 것. 수치·사례를 추정하면 "(추정)"을 붙이고, 모르는 것은 "확인 필요"로 적을 것. 회장이 바로 쓸 수 있게 구체적인 다음 행동(누가·무엇을·언제)을 넣을 것. 연봉·임금 정보는 다루지 말 것. 한국어.';
  const shortT = (d) => d.title.replace(/^\[[^\]]+\]\s*/, '').replace(/\s+—\s+[^—]+$/, '');
  const defaultRecs = (d) => [
    { title: '진행 점검과 다음 행동', why: '지금 어디까지 왔고 무엇이 막혔는지', prompt: `"${shortT(d)}"의 현재 진행 상황을 점검해 주세요. 끝난 것·남은 것·막힌 것을 나누고, 이번 주 안에 할 다음 행동 3가지를 담당자와 날짜까지 정해 주세요.` },
    { title: '주차별 실행 계획서', why: '기한까지 무엇을 언제 할지', prompt: `"${shortT(d)}"를 기한 안에 끝내기 위한 주차별 실행 계획서를 만들어 주세요. 주차마다 목표·산출물·담당·완료 기준을 표로 정리해 주세요.` },
    { title: '관련 시장·사례 조사', why: '판단에 필요한 바깥 정보', prompt: `"${shortT(d)}"와 관련해 참고할 시장 동향·경쟁사·국내외 사례를 정리해 주세요. 확실하지 않은 내용은 "확인 필요"로 표시하고, 우리 회사에 주는 시사점 3가지로 마무리해 주세요.` },
    { title: '위험 요소와 대응책', why: '늦어지거나 틀어질 가능성', prompt: `"${shortT(d)}"가 늦어지거나 실패할 수 있는 위험 요소를 찾아 가능성·영향을 평가하고, 위험마다 미리 할 대응책과 담당을 정해 주세요.` },
    { title: '담당자에게 보낼 지휘 메시지', why: '회장 이름으로 바로 보낼 초안', prompt: `"${shortT(d)}" 담당자(${d.assignee})에게 회장이 보낼 지휘 메시지 초안을 써 주세요. 기대하는 결과·기한·중간 보고 시점을 분명히 하고, 존중하는 말투로 5문장 안에 써 주세요.` }
  ];
  const REC = {}; const RECSEL = {};
  const recsOf = (d) => (REC[d.id] && REC[d.id].items) || ((LIVE.track[d.id] || {}).recs && (LIVE.track[d.id] || {}).recs.items) || null;
  async function loadRecs(d, fresh) {
    if (REC[d.id] && REC[d.id].busy) return;
    if (!fresh && recsOf(d)) return;
    const old = recsOf(d) || [];
    REC[d.id] = { busy: true, items: fresh ? null : old.length ? old : null }; RECSEL[d.id] = null; rerender();
    let items = null; let note = '';
    try {
      const sample = fresh ? (await manualLLM(utilAi())).llm : await getLLM(utilAi());
      if (sample) {
        const ctx = await taskContext(d);
        const prompt = `아이센스그룹 윤석범 회장이 아래 업무에 대해 AI에게 맡길 수 있는 보고서·자료 5가지를 추천하세요. 이 업무를 끝까지 해내는 데 실제로 도움이 되는 것만 고르고, 서로 겹치지 않게 하세요. 특히 '최근 진행 기록'에 드러난 막힌 점·위험·빈틈을 먼저 해결하는 자료를 고르세요.${fresh && old.length ? `\n이미 보여 준 추천과는 다른 것으로 고르세요: ${old.map((x) => x.title).join(', ')}` : ''}
각 항목: title(20자 이내 명사형), why(40자 이내, 왜 도움이 되는지), prompt(AI에게 보낼 구체적인 요청문 3~6문장. 무엇을 어떤 형식으로 만들지 적을 것).
JSON 배열만 출력: [{"title":"","why":"","prompt":""}, ...]

${ctx}`;
        const v = await sample.json(prompt, { modelTier: 'quick', cache: false });
        const arr = Array.isArray(v) ? v : v && Array.isArray(v.items) ? v.items : null;
        if (arr) items = arr.filter((x) => x && x.title && x.prompt).slice(0, 5).map((x) => ({ title: String(x.title).slice(0, 40), why: String(x.why || '').slice(0, 80), prompt: String(x.prompt).slice(0, 1500) }));
      } else note = `${aiName(utilAi())}를 지금 쓸 수 없어 기본 추천을 보여 드립니다`;
    } catch (e) { note = e && e.code === 'not_granted' ? 'AI 사용이 허용되지 않아 기본 추천을 보여 드립니다' : '추천을 새로 만들지 못해 기본 추천을 보여 드립니다'; }
    if (!items || items.length < 3) items = defaultRecs(d);
    REC[d.id] = { busy: false, items, note };
    if (d.src && LIVE.db && !note) writeTrack(d, { recs: { at: new Date().toISOString(), items } });
    rerender();
  }
  async function makeReport(d, rec, promptText) {
    const ai = aiOf(d);
    if (REPGEN[d.id] && REPGEN[d.id].busy) return;
    const G = REPGEN[d.id] = { busy: true, text: '', start: Date.now(), stage: '요청을 준비하는 중…' };
    clearInterval(G.tick); G.tick = setInterval(() => { if (REPGEN[d.id] !== G || !G.busy) { clearInterval(G.tick); return; } const el = document.querySelector(`[data-elapsed="${CSS.escape(d.id)}"]`); if (el) el.textContent = Math.round((Date.now() - G.start) / 1000) + '초'; }, 1000);
    rerender();
    try {
      const { llm, used, fallback } = await manualLLM(ai);
      if (!llm) throw { code: 'no_llm', message: ai === 'inhouse' ? '사내 AI도 Claude도 이 화면에서 부를 수 없습니다(claude.ai에서 연 현황판에서만 됩니다).' : '이 화면에서는 AI를 부를 수 없습니다(claude.ai에서 연 현황판에서만 됩니다).' };
      G.note = fallback ? '사내 AI가 연결 전이라 Claude로 만듭니다.' : '';
      G.stage = '업무 내용·댓글·진행 기록을 모으는 중…'; rerender();
      const ctx = await taskContext(d);
      const prompt = `당신은 아이센스그룹 윤석범 회장의 업무 보좌 AI입니다. 회장의 요청에 따라 아래 업무에 대한 자료를 만드세요.
회장의 요청: ${promptText}
${REP_RULES}
출력 형식: 첫 줄 "# (제목)", 이어서 마크다운 본문(## 소제목, - 목록, 필요하면 표).

${ctx}`;
      G.stage = used === 'inhouse' ? '사내 AI가 쓰는 중… (업무시간에는 차례를 기다릴 수 있습니다)' : 'Claude가 쓰는 중… (처음 한 번은 사용 허용 창이 뜹니다)'; rerender();
      let last = 0;
      const r = await llm(prompt, { modelTier: 'quick', cache: false, onText: ({ text }) => { G.text = text; if (Date.now() - last > 400) { last = Date.now(); const box = document.querySelector(`[data-live="${CSS.escape(d.id)}"]`); if (box) box.innerHTML = mdHtml(text); else rerender(); } } });
      const text = String((r && r.text) || '').trim();
      if (!text) throw { code: 'empty_completion' };
      const tm = text.match(/^#\s+(.+)$/m);
      const body = text.replace(/^#\s+.+$/m, '').trim();
      const rep = { id: 'r' + Date.now().toString(36), task_id: d.id, kind: rec ? rec.title : '직접 요청', title: tm ? tm[1].trim() : (rec ? rec.title : d.title), body, prompt: promptText, ai: used, by: 'manual', created: new Date().toISOString() };
      if (LIVE.db) { await LIVE.db.doc('reports/' + rep.id).set(rep); } else { S.dirReps = S.dirReps || {}; (S.dirReps[d.id] = S.dirReps[d.id] || []).unshift(rep); }
      REPGEN[d.id] = { busy: false, open: rep.id }; RECSEL[d.id] = null;
      toast(`리포트를 만들었습니다(${aiName(used)}) — 아래 「지난 요청」에 쌓였습니다`);
    } catch (e) {
      const c = e && e.code;
      const msg = c === 'no_llm' ? e.message
        : c === 'not_granted' || c === 'sampling_disabled' ? '이 현황판에서 Claude 사용이 허용되지 않았습니다. 현황판 위쪽 권한 메뉴에서 Claude 사용을 허용한 뒤 다시 눌러 주세요.'
        : c === 'rate_limited' ? '요청이 많거나 사용 한도에 걸렸습니다. 잠시 뒤에 다시 눌러 주세요.'
        : c === 'session_expired' ? 'claude.ai 로그인이 만료됐습니다. 다시 로그인한 뒤 눌러 주세요.'
        : c === 'refused' ? 'AI가 이 요청을 거절했습니다. 요청 문장을 바꿔 다시 눌러 주세요.'
        : c === 'empty_completion' ? 'AI가 빈 답을 보냈습니다. 요청을 조금 줄여 다시 눌러 주세요.'
        : c === 'prompt_too_large' ? '요청이 너무 깁니다. 요청 문장을 줄여 주세요.'
        : c === 'tool_error' ? '사내 AI가 거절했습니다: ' + String(e.message || '').slice(0, 120)
        : '리포트를 만들지 못했습니다(' + (c || (e && e.message) || '알 수 없는 오류') + '). 다시 눌러 주세요.';
      REPGEN[d.id] = { busy: false, err: msg, partial: e && e.text ? String(e.text) : '' };
      toast(msg);
    } finally {
      clearInterval(G.tick);
      if (REPGEN[d.id] === G) G.busy = false;
    }
    rerender();
  }
  function repItem(d, r) {
    return `<details class="dir-repitem" data-rid="${esc(r.id)}" ${(REPGEN[d.id] || {}).open === r.id || REPOPEN[r.id] ? 'open' : ''}><summary><span class="pill">${esc(r.kind || '리포트')}</span><b>${esc(r.title || '')}</b><span class="small muted">${esc(aiName(r.ai || 'claude'))} · ${esc(when(r.created))}</span></summary>
        ${r.prompt ? `<p class="small muted dir-repprompt">요청: ${esc(r.prompt)}</p>` : ''}
        <div class="dir-repdoc">${mdHtml(r.body)}</div>
        <div class="row dir-visrow">
          ${(VISGEN[r.id] || {}).busy ? `<span class="small"><span class="dir-spin sm" aria-hidden="true"></span>${esc(VISGEN[r.id].stage || '만드는 중…')} <span data-velapsed="${esc(r.id)}">${Math.round((Date.now() - VISGEN[r.id].start) / 1000)}초</span></span>`
            : `<button type="button" class="btn sm dir-visbtn" data-act="visMake" data-id="${esc(r.id)}" data-task="${esc(d.id)}">${r.visual_id ? '비주얼 다시 만들기' : '비주얼로 만들기'}</button>`}
          ${r.visual_id ? `<button type="button" class="btn sm" data-act="visOpen" data-v="${esc(r.visual_id)}">비주얼 보기</button>
          <button type="button" class="btn sm" data-act="visSlack" data-id="${esc(r.id)}" data-task="${esc(d.id)}" ${REPSEND[r.id + 'v'] || !d.assignee || d.assignee === '미지정' || isGoal(d) ? 'disabled' : ''}>${REPSEND[r.id + 'v'] ? '보내는 중…' : r.visual_slack_at ? '비주얼 링크 다시 보내기' : `Slack으로 ${esc(d.assignee && d.assignee !== '미지정' && !isGoal(d) ? d.assignee + '님께 ' : '')}링크 보내기`}</button>
          <button type="button" class="dir-link" data-act="visCopy" data-v="${esc(r.visual_id)}">링크 복사</button>` : ''}
          ${(VISGEN[r.id] || {}).err ? `<p class="small dir-err" style="margin:0;flex-basis:100%">${esc(VISGEN[r.id].err)}</p>` : ''}
        </div>
        <div class="row dir-repsend">
          ${isAsana(d) ? `<button type="button" class="btn sm" data-act="repAsana" data-id="${esc(r.id)}" data-task="${esc(d.id)}" ${REPSEND[r.id + 'a'] ? 'disabled' : ''}>${REPSEND[r.id + 'a'] ? '다는 중…' : r.asana_at ? 'Asana 댓글 다시 달기' : 'Asana 댓글로 달기'}</button>` : ''}
          <button type="button" class="btn sm" data-act="repSlack" data-id="${esc(r.id)}" data-task="${esc(d.id)}" ${REPSEND[r.id + 's'] || !d.assignee || d.assignee === '미지정' || isGoal(d) ? 'disabled' : ''} title="${isGoal(d) ? '목표는 담당이 부서라 개인 Slack으로 보낼 수 없습니다' : ''}">${REPSEND[r.id + 's'] ? '보내는 중…' : r.slack_at ? 'Slack 다시 보내기' : `Slack으로 ${esc(d.assignee && d.assignee !== '미지정' && !isGoal(d) ? d.assignee + '님께' : '')} 보내기`}</button>
          <span class="small muted">${[r.asana_at ? 'Asana 댓글 ' + esc(when(r.asana_at)) : '', r.slack_at ? 'Slack ' + esc(when(r.slack_at)) : ''].filter(Boolean).join(' · ')}</span>
          <button type="button" class="dir-link" data-act="repDel" data-id="${esc(r.id)}" data-task="${esc(d.id)}">이 리포트 지우기</button></div></details>`;
  }
  function repTab(d) {
    const reps = repsOf(d); const gen = REPGEN[d.id] || {}; const ai = aiOf(d); const pl = planOf(d);
    const auto = reps.filter((r) => r.by === 'schedule'); const mine = reps.filter((r) => r.by !== 'schedule');
    const sb = LIVE.cfg && LIVE.cfg.secondBrain && LIVE.cfg.secondBrain.name ? LIVE.cfg.secondBrain.name : '';
    const rc = REC[d.id] || {}; const recs = recsOf(d); const sel = RECSEL[d.id];
    if (!recs && !rc.busy) setTimeout(() => loadRecs(d), 0);
    return `<div class="dir-rep">
      <div class="dir-fields">
        <div class="dir-f"><span class="k">담당 AI</span><div class="v"><select class="dir-inline" aria-label="담당 AI" data-act="dirAi" data-id="${esc(d.id)}">${aiList().map((p) => `<option value="${esc(p.id)}" ${p.id === ai ? 'selected' : ''}>${esc(p.name)}${aiReady(p.id) ? '' : ' (연결 필요)'}</option>`).join('')}</select></div></div>
        <div class="dir-f"><span class="k">세컨드브레인</span><div class="v small">${sb ? esc(sb) : '<span class="muted">지정 안 됨 · 관리자 메뉴에서 지정</span>'}</div></div>
      </div>

      <section class="dir-repsec"><h4>AI가 판단해 만든 리포트 <span class="num muted">${auto.length}</span></h4>
        ${pl ? `<p class="small muted" style="margin:0 0 6px">오늘 계획: ${esc(pl.kind || '리포트')} · ${esc(pl.status || '예정')}</p>` : ''}
        <div class="dir-replist">${auto.map((r) => repItem(d, r)).join('') || '<p class="muted small" style="margin:0">매일 18:00에 AI가 이 태스크에 필요하다고 판단하면 여기에 올라옵니다.</p>'}</div></section>

      <section class="dir-repsec"><div class="row" style="justify-content:space-between"><h4 style="margin:0">${esc(aiName(ai))}가 만들어 드릴 수 있는 것</h4><button type="button" class="btn sm" data-act="recReset" data-id="${esc(d.id)}" ${rc.busy ? 'disabled' : ''}>${rc.busy ? '추천 만드는 중…' : '추천 리스트 바꾸기'}</button></div>
        ${rc.note ? `<p class="small muted" style="margin:4px 0 0">${esc(rc.note)}</p>` : ''}
        ${aiReady(ai) ? '' : `<p class="small muted" style="margin:4px 0 0">${esc(aiName(ai))}가 아직 연결되지 않았습니다. 직접 요청하시면 Claude로 만들고, 밤 자동 작성은 연결된 뒤에 시작합니다.</p>`}
        <div class="dir-recs">${recs ? recs.map((x, i) => `<div class="dir-rec ${sel === i ? 'on' : ''}">
            <button type="button" class="dir-rec-h" data-act="recPick" data-id="${esc(d.id)}" data-v="${i}" aria-expanded="${sel === i}"><b>${esc(x.title)}</b><span class="small muted">${esc(x.why)}</span></button>
            ${sel === i ? `<div class="dir-rec-body"><label class="f">세부 요청(고쳐서 보낼 수 있습니다)<textarea id="rec-prompt" rows="5">${esc(x.prompt)}</textarea></label>
              <div class="row"><button type="button" class="btn primary sm" data-act="recRun" data-id="${esc(d.id)}" data-v="${i}" ${gen.busy ? 'disabled' : ''}>${gen.busy ? `만드는 중… <span data-elapsed="${esc(d.id)}">${Math.round((Date.now() - (gen.start || Date.now())) / 1000)}초</span>` : aiReady(ai) ? esc(aiName(ai)) + '에게 요청' : 'Claude로 요청'}</button><button type="button" class="btn sm" data-act="recPick" data-id="${esc(d.id)}" data-v="${i}">접기</button></div>
              ${!aiReady(ai) && !gen.busy ? `<p class="small muted" style="margin:0">${esc(aiName(ai))}가 아직 연결되지 않아 이 요청은 Claude로 만듭니다.</p>` : ''}
              ${gen.note ? `<p class="small muted" style="margin:0">${esc(gen.note)}</p>` : ''}
              ${gen.err ? `<p class="small dir-err" style="margin:0" role="alert">${esc(gen.err)}</p>` : ''}
              ${gen.busy ? `<div class="dir-repdoc live" data-live="${esc(d.id)}">${gen.text ? mdHtml(gen.text) : `<p class="muted">${esc(gen.stage || '작성 중…')}</p>`}</div>` : ''}
              ${!gen.busy && gen.partial ? `<div class="dir-repdoc">${mdHtml(gen.partial)}</div>` : ''}</div>` : ''}
          </div>`).join('') : `<p class="small muted" style="margin:0"><span class="dir-spin sm" aria-hidden="true"></span>이 태스크에 맞는 추천을 고르는 중…</p>`}</div>
        ${gen.err && RECSEL[d.id] == null ? `<p class="small dir-err" style="margin:6px 0 0" role="alert">${esc(gen.err)}</p>` : ''}
        ${gen.busy && RECSEL[d.id] == null ? `<div class="dir-repdoc live" style="margin-top:8px">${gen.text ? mdHtml(gen.text) : '<p class="muted">작성 중…</p>'}</div>` : ''}
      </section>

      <section class="dir-repsec"><h4>지난 요청 리포트 <span class="num muted">${mine.length}</span></h4>
        <div class="dir-replist">${mine.map((r) => repItem(d, r)).join('') || '<p class="muted small" style="margin:0">아직 요청해서 만든 리포트가 없습니다.</p>'}</div></section>
    </div>`;
  }
  APP.acts.repOpen = (el) => { S.ui.dirOpen = el.dataset.id; S.ui.dirEdit = false; S.ui.paneTab = 'rep'; if (!el.closest('.dir-pane')) S.ui.dirReturn = el.dataset.id; focusLater('#dir-dlg'); };
  APP.acts.paneTab = (el) => { S.ui.paneTab = el.dataset.v; };
  APP.acts.progOpen = (el) => { S.ui.dirOpen = el.dataset.id; S.ui.dirEdit = false; S.ui.paneTab = 'prog'; if (!el.closest('.dir-pane')) S.ui.dirReturn = el.dataset.id; focusLater('#dir-dlg'); };
  APP.acts.recPick = (el) => { const i = +el.dataset.v; RECSEL[el.dataset.id] = RECSEL[el.dataset.id] === i ? null : i; if (RECSEL[el.dataset.id] != null) focusLater('#rec-prompt'); };
  APP.acts.recReset = (el) => { const d = find(el.dataset.id); if (d) setTimeout(() => loadRecs(d, true), 0); };
  APP.acts.recRun = (el) => {
    const d = find(el.dataset.id); const recs = d && recsOf(d); const rec = recs && recs[+el.dataset.v];
    const ta = document.getElementById('rec-prompt'); const text = (ta ? ta.value : rec && rec.prompt || '').trim();
    if (!d || !text) { toast('요청 내용을 적어 주세요'); return; }
    if (rec) rec.prompt = text;
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    setTimeout(() => makeReport(d, rec, text), 0);
  };
  APP.acts.repDel = (el) => {
    const id = el.dataset.id; const tid = el.dataset.task;
    if (LIVE.db) LIVE.db.doc('reports/' + id).delete().then(() => toast('리포트를 지웠습니다')).catch((e) => toast('지우지 못했습니다(' + (e && e.code || '오류') + ')'));
    else if (S.dirReps && S.dirReps[tid]) S.dirReps[tid] = S.dirReps[tid].filter((r) => r.id !== id);
  };
  APP.changes.dirAi = (el) => {
    const d = find(el.dataset.id); if (!d) return;
    if (d.src && LIVE.db) writeTrack(d, { ai: el.value }, '담당 AI → ' + aiName(el.value));
    else { S.dirAi = S.dirAi || {}; S.dirAi[d.id] = el.value; }
  };

  const REPSEND = {}; const REPOPEN = {};
  document.addEventListener('toggle', (e) => { const t = e.target; if (t && t.classList && t.classList.contains('dir-repitem')) REPOPEN[t.dataset.rid] = t.open; }, true);
  const repText = (d, r, max) => { const t = `[회장 현황판 AI 리포트] ${r.kind || '리포트'} — ${r.title || ''}\n업무: ${d.title}\n\n${r.body || ''}\n\n(${aiName(r.ai || 'claude')} 작성 · ${when(r.created)})`; return t.length > max ? t.slice(0, max - 20) + '\n…(이하 생략)' : t; };
  async function repMark(d, r, patch) {
    Object.assign(r, patch);
    if (LIVE.db && LIVE.reps[d.id]) { try { await LIVE.db.doc('reports/' + r.id).update(patch); } catch (e) { /* 표시만 */ } }
  }
  APP.acts.repAsana = (el) => {
    const d = find(el.dataset.task); const r = d && repsOf(d).find((x) => x.id === el.dataset.id); if (!d || !r || !isAsana(d)) return;
    if (!LIVE.mcp) { toast('Asana에 연결된 보기에서만 댓글을 달 수 있습니다'); return; }
    REPSEND[r.id + 'a'] = true;
    setTimeout(async () => {
      const ok = await commentAsana(d, repText(d, r, 9000));
      REPSEND[r.id + 'a'] = false;
      if (ok) { await repMark(d, r, { asana_at: new Date().toISOString() }); toast('리포트를 Asana 댓글로 달았습니다'); if (DET[d.asana_gid]) loadDetail(d, true); }
      rerender();
    }, 0);
  };
  APP.acts.repSlack = (el) => {
    const d = find(el.dataset.task); const r = d && repsOf(d).find((x) => x.id === el.dataset.id); if (!d || !r) return;
    if (!LIVE.mcp) { toast('Slack에 연결된 보기에서만 보낼 수 있습니다'); return; }
    REPSEND[r.id + 's'] = true;
    setTimeout(async () => {
      try {
        const who = await findSlackId(d);
        if (!who) { toast(`Slack에서 ${d.assignee}님을 찾지 못했습니다`); }
        else {
          await LIVE.mcp.callTool('Slack', 'slack_send_message', { channel_id: who.id, message: repText(d, r, 3900) });
          await repMark(d, r, { slack_at: new Date().toISOString(), slack_to: who.label });
          if (d.src && !(LIVE.track[d.id] || {}).slack_id) writeTrack(d, { slack_id: who.id, slack_label: who.label });
          toast(`${d.assignee}님께 Slack으로 리포트를 보냈습니다`);
        }
      } catch (e) {
        const c = e && e.code;
        toast(c === 'server_unavailable' || c === 'upstream_error' ? 'Slack 응답이 없습니다. 메시지가 갔는지 Slack에서 확인한 뒤 다시 보내 주세요.' : c === 'needs_reauth' ? 'Slack 연결이 만료됐습니다. claude.ai 설정 → 커넥터에서 다시 연결해 주세요.' : ['not_in_manifest', 'approval_required', 'consent_required'].includes(c) ? '이 페이지에서 Slack 사용이 아직 허용되지 않았습니다. 다시 누르면 허용 창이 뜹니다.' : 'Slack으로 보내지 못했습니다(' + (c || '오류') + ').');
      }
      REPSEND[r.id + 's'] = false; rerender();
    }, 0);
  };

  /* ================= 진행 기록 (Slack·회의록·산출물·Asana를 날짜별로 자동 정리, 하루 1회) ================= */
  const kstDay = (offset) => new Date(Date.now() + 9 * 3600000 + (offset || 0) * 86400000).toISOString().slice(0, 10);
  const progOf = (d) => LIVE.prog[d.id] || [];
  const COLLECT_HOUR = 22; /* 자동 조사는 그날 22시(한국 시간) 이후 */
  const kstHour = () => new Date(Date.now() + 9 * 3600000).getUTCHours();
  function scheduleCollect() {
    const h = (LIVE.cfg && LIVE.cfg.schedule && Number.isFinite(+LIVE.cfg.schedule.progress_hour)) ? +LIVE.cfg.schedule.progress_hour : COLLECT_HOUR;
    if (kstHour() >= h) { setTimeout(() => dailyCollect(false), 4000); return; }
    const now = new Date(Date.now() + 9 * 3600000); const at = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), h, 0, 30) - 9 * 3600000;
    clearTimeout(LIVE.collectT); LIVE.collectT = setTimeout(() => dailyCollect(false), Math.max(5000, at - Date.now()));
  }
  const PROGRUN = { state: '', done: 0, total: 0, one: {} };
  const SIGNAL = { '진전': 'st-done', '정체': 'st-hold', '위험': 'p-urgent', '정보 없음': '' };
  function keywords(d) {
    const t = d.title.replace(/^\[[^\]]+\]\s*/, '').replace(/\s+—\s+.*$/, '').replace(/[()（）\[\]·,/·:]/g, ' ');
    const stop = ['및', '등', '후', '각자', '본인', '위한', '대한', '관련', '보고', '진행', '하기', '하세요', '만들기'];
    return t.split(/\s+/).filter((w) => w.length >= 2 && !stop.includes(w) && !/^\d+$/.test(w)).slice(0, 3);
  }
  async function collectOne(d, sample) {
    const date = kstDay(0); const since = kstDay(-2);
    const kw = keywords(d);
    const found = [];
    if (kw.length) {
      for (const q of [`${kw.join(' ')} after:${since}`, `회의록 ${kw[0]} after:${since}`, d.assignee && d.assignee !== '미지정' && !isGoal(d) ? `from:${d.assignee} ${kw[0]} after:${since}` : '']) {
        if (!q) continue;
        try {
          const r = await LIVE.mcp.callTool('Slack', 'slack_search_public', { query: q, response_format: 'concise', limit: 8, sort: 'timestamp' });
          const p = r && r.payload; const txt = typeof p === 'string' ? p : p && typeof p.results === 'string' ? p.results : '';
          if (txt && !/\(0 results\)|No results/i.test(txt)) found.push(`[Slack 검색: ${q}]\n${txt.slice(0, 2500)}`);
        } catch (e) { if (e && ['not_in_manifest', 'approval_required', 'consent_required', 'needs_reauth', 'server_not_connected'].includes(e.code)) throw e; }
      }
    }
    if (isAsana(d)) {
      try {
        const r = await LIVE.mcp.callTool(ASANA.server, 'get_task_stories', { task_id: d.asana_gid, created_after: new Date(Date.now() - 2 * 86400000).toISOString().replace(/\.\d+Z$/, 'Z'), limit: 30 });
        const p = r && r.payload; const st = Array.isArray(p) ? p : p && Array.isArray(p.data) ? p.data : [];
        if (st.length) found.push('[Asana 활동]\n' + st.map((s) => `- ${s.created_at ? s.created_at.slice(0, 16) : ''} ${(s.created_by && s.created_by.name) || ''}: ${String(s.text || '').slice(0, 300)}`).join('\n'));
      } catch (e) { /* Asana 활동 없이 진행 */ }
    }
    const tr = LIVE.track[d.id] || {};
    if (safeUrl(d.result_url)) found.push(`[산출물 링크] ${d.result_url}`);
    if (tr.updated && tr.updated >= since && Array.isArray(tr.log) && tr.log.length) found.push('[현황판 기록]\n' + tr.log.slice(0, 5).map((l) => `- ${l.at} ${l.text}`).join('\n'));
    let entry;
    if (!found.length) entry = { summary: ['최근 2일 동안 Slack(공개 채널)·Asana·산출물에서 관련 기록을 찾지 못했습니다.'], signal: '정보 없음', sources: [] };
    else if (!sample) entry = { summary: ['관련 기록 ' + found.length + '묶음을 찾았습니다(요약은 AI 연결 시 표시).'], signal: '정보 없음', sources: [], raw: found.join('\n\n').slice(0, 4000) };
    else {
      const v = await sample.json(`아래는 회장 지시 업무와 관련해 최근 2일 동안 Slack 공개 채널·회의록·Asana·산출물에서 찾은 기록입니다. 이 업무의 진행 상황을 날짜 기준으로 정리하세요.
업무: ${d.title} (담당 ${d.org} ${d.assignee !== d.org ? d.assignee : ''}, 기한 ${dueFull(d)}, 상태 ${d.status})
규칙: 이 업무와 관련 없는 메시지는 버리세요. 사실만 적고 추측은 "(추정)". 연봉·임금 정보는 적지 마세요.
JSON 하나만 출력: {"summary":["진행 내용 한 줄", ...최대 5개], "signal":"진전|정체|위험|정보 없음", "sources":[{"type":"slack|meeting|asana|output","where":"채널·문서 이름","who":"작성자","when":"YYYY-MM-DD HH:MM","gist":"한 줄 요지"}]}
관련 기록이 하나도 없으면 summary에 "관련 기록 없음" 한 줄, signal "정보 없음".

${found.join('\n\n').slice(0, 9000)}`, { modelTier: 'quick', cache: false });
      entry = { summary: Array.isArray(v && v.summary) ? v.summary.map(String).slice(0, 5) : ['요약을 읽지 못했습니다'], signal: v && SIGNAL[v.signal] !== undefined ? v.signal : '정보 없음', sources: Array.isArray(v && v.sources) ? v.sources.slice(0, 10).map((x) => ({ type: String(x.type || ''), where: String(x.where || ''), who: String(x.who || ''), when: String(x.when || ''), gist: String(x.gist || '') })) : [] };
    }
    const doc = Object.assign({ id: d.id.replace(/[^A-Za-z0-9_-]/g, '') + '_' + date, task_id: d.id, date, by: 'auto', created: new Date().toISOString(), keywords: kw }, entry);
    await LIVE.db.doc('progress/' + doc.id).set(doc);
    return doc;
  }
  async function dailyCollect(force, onlyId) {
    if (!LIVE.db || !LIVE.mcp || PROGRUN.state === 'running') return;
    const date = kstDay(0);
    if (!onlyId && !force) {
      try { const m = await LIVE.db.doc('progress_meta/' + date).get(); if (m.exists) { const v = m.data() || {}; if (v.state === 'done' || (v.state === 'running' && Date.now() - Date.parse(v.started || 0) < 30 * 60000)) return; } } catch (e) { return; }
    }
    const pr = { '긴급': 0, '높음': 1, '보통': 2 };
    const targets = onlyId ? S.directives.filter((d) => d.id === onlyId)
      : S.directives.filter((d) => isAsana(d) && isOpen(d)).sort((a, b) => (isOverdue(b) - isOverdue(a)) || (stl(b) - stl(a)) || pr[a.priority] - pr[b.priority] || a.due_at.localeCompare(b.due_at)).slice(0, (LIVE.cfg && LIVE.cfg.schedule && +LIVE.cfg.schedule.progress_per_day) || 12);
    if (!targets.length) return;
    let sample = null; try { sample = await getLLM(utilAi()); } catch (e) { sample = null; }
    PROGRUN.state = 'running'; PROGRUN.done = 0; PROGRUN.total = targets.length; PROGRUN.err = '';
    if (onlyId) PROGRUN.one[onlyId] = true;
    if (!onlyId) { try { await LIVE.db.doc('progress_meta/' + date).set({ date, state: 'running', started: new Date().toISOString(), total: targets.length }); } catch (e) { PROGRUN.state = ''; return; } }
    rerender();
    let n = 0;
    for (const d of targets) {
      try { await collectOne(d, sample); n++; } catch (e) {
        if (e && ['not_in_manifest', 'approval_required', 'consent_required', 'needs_reauth', 'server_not_connected'].includes(e.code)) { PROGRUN.err = e.code === 'needs_reauth' ? 'Slack 연결이 만료됐습니다. claude.ai 설정 → 커넥터에서 다시 연결해 주세요.' : e.code === 'server_not_connected' ? 'Slack 커넥터가 없습니다.' : 'Slack 검색이 이 페이지에서 아직 허용되지 않았습니다. 「지금 수집」을 누르면 허용 창이 뜹니다.'; break; }
      }
      PROGRUN.done++; rerender();
    }
    if (!onlyId) { try { await LIVE.db.doc('progress_meta/' + date).set({ date, state: PROGRUN.err ? 'error' : 'done', finished: new Date().toISOString(), total: targets.length, count: n, err: PROGRUN.err || '' }); } catch (e) { /* 표시만 */ } }
    PROGRUN.state = PROGRUN.err ? 'error' : 'done'; if (onlyId) PROGRUN.one[onlyId] = false;
    if (!PROGRUN.err) toast(onlyId ? '진행 기록을 새로 모았습니다' : `오늘 진행 기록 ${n}건을 모았습니다`);
    rerender();
    if (!onlyId && !force) setTimeout(() => nightReports(false), 2000);
  }
  const srcLabel = { slack: 'Slack', meeting: '회의록', asana: 'Asana', output: '산출물' };
  function progTab(d) {
    const list = progOf(d);
    const busy = PROGRUN.one[d.id] || (PROGRUN.state === 'running');
    return `<div class="dir-prog">
      <div class="row" style="justify-content:space-between"><p class="small muted" style="margin:0">AI가 매일 22:00 이후 한 번 Slack 공개 채널·회의록·산출물·Asana 활동에서 이 업무의 그날 진행을 찾아 날짜별로 올립니다. AI 리포트 추천은 이 기록을 보고 고릅니다.</p>
        <button type="button" class="btn sm" data-act="progOne" data-id="${esc(d.id)}" ${busy || !LIVE.mcp || !LIVE.db ? 'disabled' : ''}>${PROGRUN.one[d.id] ? '모으는 중…' : '이 업무만 지금 모으기'}</button></div>
      ${PROGRUN.err ? `<p class="small dir-err" style="margin:0">${esc(PROGRUN.err)}</p>` : ''}
      <div class="dir-progboard">${list.map((p) => `<article class="dir-progday">
          <header><b class="num">${esc(p.date)}</b><span class="pill ${SIGNAL[p.signal] || ''}">${esc(p.signal || '정보 없음')}</span><span class="small muted">${p.by === 'auto' ? 'AI 자동 조사' : '직접'} · ${esc(when(p.created))}</span></header>
          <ul>${(p.summary || []).map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
          ${(p.sources || []).length ? `<details><summary class="small">근거 ${p.sources.length}건</summary><ul class="dir-progsrc">${p.sources.map((x) => `<li><span class="pill">${esc(srcLabel[x.type] || x.type || '기록')}</span> <span class="small">${esc(x.where)}${x.who ? ' · ' + esc(x.who) : ''}${x.when ? ' · ' + esc(x.when) : ''}</span><div class="small muted">${esc(x.gist)}</div></li>`).join('')}</ul></details>` : ''}
        </article>`).join('') || `<p class="muted small" style="margin:0">${LIVE.db ? '아직 모은 기록이 없습니다. 매일 22:00 이후 현황판이 열려 있으면 자동으로 모읍니다.' : 'claude.ai 아티팩트로 열었을 때만 동작합니다.'}</p>`}</div>
    </div>`;
  }
  APP.acts.progOne = (el) => { const d = find(el.dataset.id); if (d) setTimeout(() => dailyCollect(true, d.id), 0); };
  APP.acts.progAll = () => { setTimeout(() => dailyCollect(true), 0); };

  /* 밤 정기 리포트: 22시 진행 기록을 모은 뒤, 기본 AI(사내 AI)로 필요한 태스크에 리포트를 쓴다 */
  const NIGHT = { state: '', done: 0, total: 0 };
  async function nightReports(force) {
    if (!LIVE.db || NIGHT.state === 'running') return;
    const ai = utilAi();
    if (ai !== 'inhouse' && !(LIVE.cfg && LIVE.cfg.schedule && LIVE.cfg.schedule.nightly_with_claude)) return; /* Claude 사용량 아끼기: 사내 AI일 때만 자동 */
    const llm = await getLLM(ai); if (!llm) { NIGHT.state = 'skip'; rerender(); return; }
    const date = kstDay(0);
    try { const m = await LIVE.db.doc('plans/' + date).get(); if (m.exists && !force) { const v = m.data() || {}; if (v.by === 'page' && (v.state === 'done' || (v.state === 'running' && Date.now() - Date.parse(v.made_at || 0) < 60 * 60000))) return; } } catch (e) { return; }
    const pr = { '긴급': 0, '높음': 1, '보통': 2 }; const sig = { '위험': 0, '정체': 1 };
    const lastSig = (d) => { const p = progOf(d)[0]; return p && sig[p.signal] !== undefined ? sig[p.signal] : 2; };
    const doneToday = (d) => repsOf(d).some((r) => r.by === 'schedule' && String(r.created || '').slice(0, 10) >= kstDay(-1) && r.plan_date === date);
    const max = (LIVE.cfg && LIVE.cfg.schedule && +LIVE.cfg.schedule.max_per_day) || 8;
    const targets = S.directives.filter((d) => isAsana(d) && isOpen(d) && aiOf(d) === ai && !doneToday(d))
      .sort((a, b) => lastSig(a) - lastSig(b) || (isOverdue(b) - isOverdue(a)) || (stl(b) - stl(a)) || pr[a.priority] - pr[b.priority] || a.due_at.localeCompare(b.due_at)).slice(0, max);
    if (!targets.length) return;
    const plan = { date, made_at: new Date().toISOString(), by: 'page', ai, state: 'running', items: targets.map((d) => ({ task_id: d.id, title: d.title, kind: '판단 중', ai, reason: (progOf(d)[0] ? `진행 기록 ${progOf(d)[0].date} ${progOf(d)[0].signal}` : '진행 기록 없음') + (isOverdue(d) ? ' · 기한 경과' : '') + (stl(d) ? ' · 무응답' : ''), status: '예정' })) };
    try { await LIVE.db.doc('plans/' + date).set(plan); } catch (e) { return; }
    NIGHT.state = 'running'; NIGHT.done = 0; NIGHT.total = targets.length; rerender();
    let n = 0;
    for (let i = 0; i < targets.length; i++) {
      const d = targets[i];
      try {
        const ctx = await taskContext(d);
        const r = await llm(`당신은 아이센스그룹 윤석범 회장의 업무 보좌 AI입니다. 아래 업무의 최근 진행 기록을 보고, 지금 이 업무를 끝까지 해내는 데 가장 도움이 되는 보고서 하나를 쓰세요. 유형은 조언·진행 지휘·계획 세우기·시장 조사·위험 점검 중에서 고르세요(진행 기록에 드러난 막힌 점·위험·빈틈을 우선).
${REP_RULES} 900자 안팎.
출력 형식: 첫 줄 "유형: (유형)", 둘째 줄 "# (제목)", 이어서 마크다운 본문(## 소제목, - 목록).

${ctx}`, { modelTier: 'default', cache: false });
        const text = String((r && r.text) || '').trim();
        const km = text.match(/^\s*유형\s*[:：]\s*(.+)$/m); const tm = text.match(/^#\s+(.+)$/m);
        const body = text.replace(/^\s*유형\s*[:：].*$/m, '').replace(/^#\s+.+$/m, '').trim();
        if (body) {
          const rep = { id: 's' + date.replace(/-/g, '') + '-' + (i + 1) + '-' + Date.now().toString(36).slice(-3), task_id: d.id, kind: km ? km[1].trim().slice(0, 20) : '조언', title: tm ? tm[1].trim() : d.title, body, ai, by: 'schedule', created: new Date().toISOString(), plan_date: date };
          await LIVE.db.doc('reports/' + rep.id).set(rep);
          plan.items[i].kind = rep.kind; plan.items[i].status = '완료'; n++;
        } else plan.items[i].status = '실패';
      } catch (e) { plan.items[i].status = '실패'; plan.items[i].reason += ' · ' + String((e && e.message) || (e && e.code) || '오류').slice(0, 60); }
      NIGHT.done = i + 1;
      try { await LIVE.db.doc('plans/' + date).set(plan); } catch (e) { /* 다음 건 계속 */ }
      rerender();
    }
    plan.state = 'done'; plan.finished = new Date().toISOString();
    try { await LIVE.db.doc('plans/' + date).set(plan); } catch (e) { /* 표시만 */ }
    NIGHT.state = 'done'; toast(`밤 정기 리포트 ${n}건을 ${aiName(ai)}로 썼습니다`); rerender();
  }
  APP.acts.nightRun = () => { setTimeout(() => nightReports(true), 0); };

  /* ================= 비주얼 리포트 (youtube-visual-manual · output-upgrade 지침을 담아 Claude가 한 장짜리 웹페이지로) ================= */
  const BOARD_URL = 'https://claude.ai/artifact/RPfJCRcnbFSMvob3odPFW9';
  const VISUAL_GUIDE = `당신은 아이센스그룹의 비주얼 설명서 제작자입니다. 아래 리포트를, 처음 보는 직원도 한 번에 이해하고 바로 행동할 수 있는 한 장짜리 인터랙티브 웹페이지로 다시 기획해 만드세요. 원 리포트의 순서를 그대로 따르지 말고 읽는 사람이 이해하는 순서로 다시 짭니다.

[기획]
1. 맨 앞 "이 리포트는 무엇을 말하려 하나" 칸: 누구를 위한 것인지, 보고 나서 무엇을 알게 되고 무엇을 해야 하는지 3~4줄.
2. 바로 아래 전체를 한눈에 보는 지도: 요약표나 흐름도 하나.
3. 차례: 지휘·의사결정용이면 결론 → 근거 → 선택지 비교 → 실행 계획. 방법·교육용이면 왜 필요한가 → 전체 그림 → 단계별 따라하기 → 자주 하는 실수 → 오늘 할 것. 서로 다른 것이 섞이거나 같은 것이 흩어지지 않게 묶습니다.
4. 글로만 설명하면 머릿속에 그림이 안 그려지는 곳은 비주얼로 바꿉니다: 단계별로 움직이는 SVG 흐름도(재생·다음 단계 버튼), 나란히 놓은 비교 도식, 일정·진행 타임라인, 눌러서 체크하는 체크리스트, 필요하면 SVG 막대 차트. 화려함이 아니라 이해를 위해서만.
5. 섹션마다 "아이센스 적용" 예시 1개: 블랙라벨(PC방)·벌툰(만화카페)·생전포차(한식 포차)·본사 업무(가맹 모집, 상권 분석, 점주 소통, 보고) 중 맞는 것. 바로 쓰는 문구나 프롬프트는 복사 버튼(navigator.clipboard, 실패하면 글자 선택)과 함께.
6. 섹션마다 "조심할 점". 확인이 필요한 주장에는 "확인 필요" 표시.
7. 맨 끝: "오늘 바로 해볼 것" 2~3개(누가·무엇을·언제), 그리고 "원 리포트 대비 달라진 점"을 짧게.

[문장]
합니다체. "AI·도구가 자동으로 해 주는 것 → 사람은 이것만 하면 됩니다 → 그래서 이 불편이 사라집니다" 화법. 어려운 말과 영어 직역은 쉽게 고치고, 용어는 하나로 통일하고 회사 업무에 빗댄 비유를 붙입니다. 단축키는 Windows 먼저, Mac 함께. 사실을 지어내지 말고 추정은 "(추정)". 연봉·임금 정보는 다루지 않습니다. 이해에 도움이 되면 충분히 길게 씁니다.

[기술]
- 완전한 HTML 문서 하나만 출력합니다(<!doctype html>로 시작, </html>로 끝). 설명 문장이나 코드블록 표시는 쓰지 않습니다.
- 외부 파일·이미지·스크립트·글꼴을 부르지 않습니다. CSS·JS·SVG는 모두 문서 안에. 30KB 안쪽으로 간결하게.
- 라이트·다크 모두: :root에 색 토큰, @media (prefers-color-scheme: dark)에서 토큰만 바꿈, body 배경을 토큰으로 지정.
- 색: 베이지 바탕(#F1E9DE)·흰 종이 카드·짙은 갈색 글씨(#3D1E0F)·골드 포인트(#FABF1A), 다크는 짙은 갈색 바탕에 밝은 글씨. 본문 16px 이상, 제목은 굵게.
- 폭 390px 휴대폰에서 가로 스크롤 없음(표·도식은 자기 상자 안에서만 가로 스크롤). 좌우 여백 16px 이상.
- 모든 움직임은 prefers-reduced-motion을 존중하고, 멈춘 상태에서도 내용이 다 보여야 합니다. alert·confirm·외부 링크 이동 금지.`;
  const VISGEN = {};
  async function makeVisual(d, r) {
    if (VISGEN[r.id] && VISGEN[r.id].busy) return;
    const G = VISGEN[r.id] = { busy: true, start: Date.now(), stage: '비주얼 기획을 준비하는 중…' };
    clearInterval(G.tick); G.tick = setInterval(() => { if (VISGEN[r.id] !== G || !G.busy) { clearInterval(G.tick); return; } const el = document.querySelector(`[data-velapsed="${CSS.escape(r.id)}"]`); if (el) el.textContent = Math.round((Date.now() - G.start) / 1000) + '초'; }, 1000);
    rerender();
    try {
      const { llm } = await manualLLM('claude');
      if (!llm) throw { code: 'no_llm', message: '이 화면에서는 Claude를 부를 수 없습니다(claude.ai에서 연 현황판에서만 됩니다).' };
      G.stage = '업무 맥락을 모으는 중…'; rerender();
      const ctx = await taskContext(d);
      G.stage = 'Claude가 비주얼 페이지를 만드는 중… (1~3분 걸릴 수 있습니다)'; rerender();
      const out = await llm(`${VISUAL_GUIDE}

[원 리포트]
유형: ${r.kind || '리포트'}
제목: ${r.title || ''}
${r.body || ''}

[업무 맥락]
${ctx}`, { modelTier: 'default', cache: false });
      let html = String((out && out.text) || '').replace(/^```(?:html)?\s*/i, '').replace(/```\s*$/, '').trim();
      const a = html.search(/<!doctype html|<html/i); if (a > 0) html = html.slice(a);
      if (!/<\/html>\s*$/i.test(html)) { if (out && out.truncated) throw { code: 'truncated' }; if (!/<html/i.test(html)) throw { code: 'empty_completion' }; }
      if (html.length > 240000) throw { code: 'too_big' };
      const vid = 'v' + Date.now().toString(36);
      const doc = { id: vid, task_id: d.id, report_id: r.id, title: r.title || d.title, task_title: d.title, assignee: d.assignee || '', html, created: new Date().toISOString(), by: 'claude' };
      if (!LIVE.db) throw { code: 'no_db' };
      await LIVE.db.doc('visuals/' + vid).set(doc);
      await repMark(d, r, { visual_id: vid, visual_at: doc.created });
      VISGEN[r.id] = { busy: false };
      toast('비주얼 리포트를 만들었습니다');
      openVisual(vid);
    } catch (e) {
      const c = e && e.code;
      const msg = c === 'no_llm' || c === 'no_db' ? (e.message || 'claude.ai에서 연 현황판에서만 만들 수 있습니다.')
        : c === 'truncated' ? '페이지가 너무 길어 중간에 끊겼습니다. 다시 눌러 주세요.'
        : c === 'too_big' ? '페이지가 너무 커서 저장하지 못했습니다. 다시 눌러 주세요.'
        : c === 'not_granted' || c === 'sampling_disabled' ? '이 현황판에서 Claude 사용이 허용되지 않았습니다.'
        : c === 'rate_limited' ? '요청이 많거나 사용 한도에 걸렸습니다. 잠시 뒤에 다시 눌러 주세요.'
        : '비주얼을 만들지 못했습니다(' + (c || (e && e.message) || '알 수 없는 오류') + '). 다시 눌러 주세요.';
      VISGEN[r.id] = { busy: false, err: msg }; toast(msg);
    } finally { clearInterval(G.tick); if (VISGEN[r.id] === G) G.busy = false; }
    rerender();
  }
  const visualLink = (vid) => `${BOARD_URL}#v-${vid}`;

  /* 화면 가득 보는 비주얼 뷰어 — 받은 링크(#v-아이디)로 열면 이것만 보인다 */
  async function openVisual(vid) {
    let box = document.getElementById('dir-visual');
    if (!box) { box = document.createElement('div'); box.id = 'dir-visual'; box.className = 'dir-visual'; document.body.appendChild(box); }
    box.hidden = false; document.body.classList.add('dir-vis-open');
    box.innerHTML = '<div class="dir-visual-bar"><b>비주얼 리포트</b><span class="dir-visual-sp"></span><button type="button" class="btn sm" id="dir-visual-close">닫기</button></div><div class="dir-visual-msg">불러오는 중…</div>';
    box.querySelector('#dir-visual-close').onclick = closeVisual;
    let db = LIVE.db;
    if (!db && hasClaude) { try { db = await window.claude.use('db'); } catch (e) { db = null; } }
    if (!db) { box.querySelector('.dir-visual-msg').textContent = 'claude.ai에서 연 링크에서만 볼 수 있습니다.'; return; }
    try {
      const s = await db.doc('visuals/' + vid).get();
      const v = s.exists ? s.data() : null;
      if (!v || !v.html) { box.querySelector('.dir-visual-msg').textContent = '이 비주얼 리포트를 찾지 못했습니다. 지워졌거나 볼 권한이 없습니다.'; return; }
      box.querySelector('.dir-visual-bar b').textContent = v.title || '비주얼 리포트';
      const f = document.createElement('iframe');
      f.className = 'dir-visual-frame'; f.setAttribute('sandbox', 'allow-scripts'); f.setAttribute('title', v.title || '비주얼 리포트'); f.srcdoc = v.html;
      box.querySelector('.dir-visual-msg').replaceWith(f);
    } catch (e) { box.querySelector('.dir-visual-msg').textContent = '불러오지 못했습니다(' + ((e && e.code) || '오류') + '). 볼 권한이 없을 수 있습니다.'; }
  }
  function closeVisual() {
    const box = document.getElementById('dir-visual'); if (box) { box.hidden = true; box.innerHTML = ''; }
    document.body.classList.remove('dir-vis-open');
    if (/^#v-/.test(location.hash)) { try { location.replace(location.pathname + location.search + '#directives'); } catch (e) { location.hash = 'directives'; } }
    if (/^#v-/.test(location.hash)) location.hash = LIVE.owner === false ? '' : 'directives';
  }
  function routeVisual() { const m = location.hash.match(/^#v-([A-Za-z0-9-]+)$/); if (m) openVisual(m[1]); }
  window.addEventListener('hashchange', routeVisual);
  setTimeout(routeVisual, 0);

  APP.acts.visMake = (el) => { const d = find(el.dataset.task); const r = d && repsOf(d).find((x) => x.id === el.dataset.id); if (d && r) setTimeout(() => makeVisual(d, r), 0); };
  APP.acts.visOpen = (el) => { setTimeout(() => openVisual(el.dataset.v), 0); };
  APP.acts.visCopy = (el) => { const u = visualLink(el.dataset.v); const done = () => toast('비주얼 링크를 복사했습니다'); try { navigator.clipboard.writeText(u).then(done, () => toast(u)); } catch (e) { toast(u); } };
  APP.acts.visSlack = (el) => {
    const d = find(el.dataset.task); const r = d && repsOf(d).find((x) => x.id === el.dataset.id); if (!d || !r || !r.visual_id) return;
    if (!LIVE.mcp) { toast('Slack에 연결된 보기에서만 보낼 수 있습니다'); return; }
    REPSEND[r.id + 'v'] = true;
    setTimeout(async () => {
      try {
        const who = await findSlackId(d);
        if (!who) toast(`Slack에서 ${d.assignee}님을 찾지 못했습니다`);
        else {
          const lead = String(r.body || '').split('\n').map((x) => x.replace(/^[#\-*\s]+/, '').trim()).filter(Boolean).slice(0, 2).join(' ');
          const msg = `[회장 현황판] ${d.assignee}님, "${r.title || d.title}" 비주얼 리포트를 보냅니다.\n업무: ${d.title}\n${lead ? '요약: ' + lead.slice(0, 200) + '\n' : ''}👉 <${visualLink(r.visual_id)}|비주얼 리포트 열기>`;
          await LIVE.mcp.callTool('Slack', 'slack_send_message', { channel_id: who.id, message: msg });
          await repMark(d, r, { visual_slack_at: new Date().toISOString() });
          toast(`${d.assignee}님께 비주얼 리포트 링크를 보냈습니다`);
        }
      } catch (e) {
        const c = e && e.code;
        toast(c === 'server_unavailable' || c === 'upstream_error' ? 'Slack 응답이 없습니다. 메시지가 갔는지 확인한 뒤 다시 보내 주세요.' : c === 'needs_reauth' ? 'Slack 연결이 만료됐습니다. claude.ai 설정 → 커넥터에서 다시 연결해 주세요.' : 'Slack으로 보내지 못했습니다(' + (c || '오류') + ').');
      }
      REPSEND[r.id + 'v'] = false; rerender();
    }, 0);
  };

  /* ================= 태스크 삭제 ================= */
  async function deleteTask(d) {
    if (isAsana(d)) {
      if (!LIVE.mcp) { toast('Asana에 연결된 보기에서만 지울 수 있습니다'); return; }
      S.ui.dirDelBusy = true; rerender();
      try {
        await LIVE.mcp.callTool(ASANA.server, 'delete_task', { task: d.asana_gid });
      } catch (e) {
        S.ui.dirDelBusy = false;
        toast('삭제하지 못했습니다 — ' + errText(e) + (e && (e.code === 'server_unavailable' || e.code === 'upstream_error') ? ' 지워졌는지 새로고침으로 확인해 주세요.' : ''));
        rerender(); return;
      }
      LIVE.asana = (LIVE.asana || []).filter((t) => String(t.gid) !== d.asana_gid);
      delete OVR[d.id];
      saveSnapshot(LIVE.asana);
    }
    const i = S.directives.findIndex((x) => x.id === d.id); if (i >= 0) S.directives.splice(i, 1);
    S.ui.dirOpen = null; S.ui.dirDelAsk = null; S.ui.dirDelBusy = false;
    toast(isAsana(d) ? 'Asana에서 태스크를 지웠습니다' : '목록에서 지웠습니다(목업)');
    rerender();
  }
  APP.acts.dirAskDel = (el) => { S.ui.dirDelAsk = el.dataset.id; };
  APP.acts.dirCancelDel = () => { S.ui.dirDelAsk = null; };
  APP.acts.dirDel = (el) => { const d = find(el.dataset.id); if (d && !S.ui.dirDelBusy) setTimeout(() => deleteTask(d), 0); };

  /* ================= 완료 알림 → 확인 → Slack 칭찬 ================= */
  const ACK_LAUNCH = '2026-11-03T00:00:00Z'; /* 이 기능 이전에 끝난 일은 조용히 정리된 것으로 본다 */
  const PR = {}; const ACKBUSY = {};
  const isPendingAck = (d) => d.status === '완료' && !d.ack && (isAsana(d) || (!d.src && d.pendingAck));
  const isAcked = (d) => d.status === '완료' && !!d.ack;
  /* 칭찬 초안 글쓰기 지침: 회장이 화면에서 고칠 수 있고(config/praise), 모든 초안에 같이 쓴다 */
  const PRAISE_GUIDE_DEFAULT = `윤석범 회장이 Slack에서 직원에게 직접 툭 보내는 짧은 칭찬 메시지를 씁니다. 받는 사람이 "회장님이 직접 쓰셨구나" 하고 느껴야 합니다. AI가 쓴 티가 나면 안 됩니다.

[이렇게 씁니다]
- 2~3문장, 100자 안팎. 짧고 담백하게.
- "OO님," 처럼 이름으로 부르며 시작합니다. 직급을 알면 "OO 과장님,"도 좋습니다.
- 그 사람이 실제로 한 일 하나를 콕 집어 말합니다. 업무 제목을 따옴표로 그대로 옮기지 말고, 말하듯이 풀어서 씁니다.
- 그 일 덕분에 무엇이 좋아졌는지(매장·고객·팀·회사) 한마디 붙입니다.
- 평소 회장이 말하는 것처럼 존댓말이되 딱딱하지 않게: "~해 줘서 고마워요", "~덕분에 한시름 놨습니다", "역시 OO님이네요", "수고했어요" 같은 말투.
- 기록에 없는 일은 지어내지 않습니다. 자세한 내용을 모르면 끝낸 일만 자연스럽게 짚습니다.

[쓰지 않습니다]
- "노고에 깊이 감사드립니다", "귀하", "탁월한", "헌신", "진심으로 감사", "앞으로도 많은 활약 기대합니다", "덕분에 한 걸음 나아갔습니다" 같은 인사말 상투어
- 과장된 칭찬, 느낌표 여러 개, 해시태그, 목록·제목·굵은 글씨, 영어 단어
- 서명("— 윤석범"): 회장 본인 Slack 계정에서 보내므로 붙이지 않습니다
- 이모지는 안 쓰거나 맨 끝에 하나만(👍 정도)`;
  const praiseGuide = () => (LIVE.praiseCfg && LIVE.praiseCfg.guide) || S.dirPraiseGuide || PRAISE_GUIDE_DEFAULT;
  const fallbackPraise = (d) => `${d.assignee && d.assignee !== '미지정' ? d.assignee + '님' : '여러분'}, ${d.title.replace(/^\[[^\]]+\]\s*/, '').replace(/\s+—\s+[^—]+$/, '').replace(/\s*\([^)]*\)/g, '').trim()} 마무리해 줘서 고마워요. 끝까지 챙겨 준 덕분에 한시름 놨습니다. 수고했어요.`;

  async function draftPraise(d, manual) {
    if (PR[d.id] && !manual) return;
    const saved = (LIVE.track[d.id] || {}).praise_draft;
    if (saved && !manual) { PR[d.id] = { state: 'ok', text: saved, by: '저장된 초안' }; return; }
    PR[d.id] = { state: 'loading' }; rerender();
    let text = ''; let note = ''; let used = utilAi();
    try {
      let sample = null;
      if (manual) { const m = await manualLLM(utilAi()); sample = m.llm; used = m.used; } else sample = await getLLM(utilAi());
      if (sample) {
        if (isAsana(d) && LIVE.mcp) { try { await withTimeout(loadDetail(d), 15000); } catch (e) { /* 상세 없이 */ } }
        const det = isAsana(d) ? DET[d.asana_gid] : null;
        const notes = String((det && det.task && det.task.notes) || d.body || '').slice(0, 700);
        const cmts = ((det && det.stories) || []).filter((s) => s.type === 'comment' || s.resource_subtype === 'comment_added').slice(-5).map((s) => `- ${(s.created_by && s.created_by.name) || ''}: ${String(s.text || '').slice(0, 200)}`).join('\n');
        const st = staffOf(d.assignee) || {};
        const prompt = `${praiseGuide()}

[이번 메시지 재료]
받는 사람: ${d.assignee}${st.g ? ' ' + st.g : ''} (${d.org})
끝낸 일: ${d.title}
설명: ${notes || '(없음)'}
최근 댓글:
${cmts || '(없음)'}
결과물 링크: ${safeUrl(d.result_url) || '(없음)'}
현황판 메모: ${d.memo || '(없음)'}

메시지 본문만 출력하세요. 설명·따옴표·제목 없이.`;
        const r = await sample(prompt, { modelTier: 'quick', cache: false });
        text = String((r && r.text) || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim().replace(/^["“'`]+|["”'`]+$/g, '').trim();
      } else note = `${aiName(utilAi())}를 지금 쓸 수 없어 기본 문구를 넣었습니다 · 「초안 다시 쓰기」를 누르면 Claude로 씁니다`;
    } catch (e) { note = e && e.code === 'not_granted' ? 'AI 사용이 허용되지 않아 기본 문구를 넣었습니다' : 'AI 초안 실패 — 기본 문구를 넣었습니다'; }
    PR[d.id] = { state: 'ok', text: text || fallbackPraise(d), by: text ? `${aiName(used)} 초안` : note || '기본 문구' };
    if (text && LIVE.db && d.src) writeTrack(d, { praise_draft: text });
    rerender();
  }

  async function findSlackId(d) {
    const tr = LIVE.track[d.id] || {};
    if (tr.slack_id) return { id: tr.slack_id, label: tr.slack_label || d.assignee };
    if (!LIVE.mcp) throw { code: 'not_granted' };
    const q = d.assignee_email || d.assignee;
    if (!q || q === '미지정') return null;
    const r = await LIVE.mcp.callTool('Slack', 'slack_search_users', { query: q, response_format: 'concise', limit: 5 });
    const p = r && r.payload;
    const txt = typeof p === 'string' ? p : p && typeof p.results === 'string' ? p.results : JSON.stringify(p || '');
    const hits = [...txt.matchAll(/\d+\.\s*([^\n]*?)\s+-\s+(U[A-Z0-9]{6,})\s+-/g)].map((m) => ({ label: m[1].trim(), id: m[2] }));
    if (hits.length === 1 || (hits.length > 1 && d.assignee_email)) return hits[0];
    const exact = hits.filter((h) => h.label.startsWith(d.assignee));
    return exact.length === 1 ? exact[0] : null;
  }

  async function ackDone(d, text, send) {
    if (ACKBUSY[d.id]) return;
    ACKBUSY[d.id] = send ? 'Slack 보내는 중…' : '정리하는 중…'; rerender();
    let slack = null;
    try {
      if (send) {
        if (!text.trim()) { toast('칭찬 내용을 적어 주세요'); ACKBUSY[d.id] = null; rerender(); return; }
        slack = await findSlackId(d);
        if (!slack) { toast(`Slack에서 ${d.assignee}님을 찾지 못했습니다. "보내지 않고 확인"을 눌러 정리할 수 있습니다.`); ACKBUSY[d.id] = null; rerender(); return; }
        await LIVE.mcp.callTool('Slack', 'slack_send_message', { channel_id: slack.id, message: text.trim() });
      }
    } catch (e) {
      ACKBUSY[d.id] = null;
      const c = e && e.code;
      const msg = c === 'needs_reauth' ? 'Slack 연결이 만료됐습니다. claude.ai 설정 → 커넥터에서 다시 연결해 주세요.'
        : c === 'server_not_connected' ? 'Slack 커넥터가 없습니다. claude.ai 설정 → 커넥터에서 추가해 주세요.'
        : ['not_in_manifest', 'approval_required', 'consent_required'].includes(c) ? '이 페이지에서 Slack 사용이 허용되지 않았습니다. 다시 누르면 허용 창이 뜹니다.'
        : c === 'server_unavailable' || c === 'upstream_error' ? 'Slack 응답이 없습니다. 메시지가 갔는지 Slack에서 확인한 뒤, 안 갔으면 다시 보내 주세요.'
        : c === 'tool_error' ? 'Slack이 거절했습니다: ' + String(e.message || '').slice(0, 100)
        : 'Slack으로 보내지 못했습니다(' + (c || '오류') + ').';
      PR[d.id] = Object.assign({}, PR[d.id] || {}, { err: msg });
      toast(msg); rerender(); return;
    }
    const at = new Date().toISOString();
    d.ack = at; d.pendingAck = false;
    if (d.src) await writeTrack(d, Object.assign({ ack: at, praise_sent: send ? text.trim() : '' }, slack ? { slack_id: slack.id, slack_label: slack.label } : {}), send ? 'Slack 칭찬 보냄 · 완료 확인' : '완료 확인(칭찬 안 보냄)');
    else addLog(d, send ? 'Slack 칭찬 보냄(목업) · 완료 확인' : '완료 확인');
    ACKBUSY[d.id] = null;
    toast(send ? `${d.assignee}님에게 Slack으로 칭찬을 보냈고 목록에서 정리했습니다` : '확인하고 목록에서 정리했습니다');
    rerender();
  }

  function ackPanel(list) {
    if (!list.length) return '';
    setTimeout(() => list.slice(0, 3).forEach((d) => draftPraise(d)), 0);
    return `<section class="panel dir-acks" aria-labelledby="h-acks"><div class="row" style="justify-content:space-between"><h3 id="h-acks">완료 알림 <span class="num">${list.length}</span>건</h3><span class="small muted">확인을 누르면 목록에서 정리되고, 담당자에게 Slack으로 칭찬이 갑니다.</span></div>
      <div class="dir-ack-list">${list.map((d) => {
        const pr = PR[d.id]; const busy = ACKBUSY[d.id]; const noOne = !d.assignee || d.assignee === '미지정';
        const doneAt = d.completed_at ? when(d.completed_at) : '';
        return `<div class="dir-ack" data-id="${esc(d.id)}">
          <div class="dir-ack-h"><span class="dir-ack-ck" aria-hidden="true">✓</span><div style="min-width:0"><button type="button" class="dir-title" data-act="dirOpen" data-id="${esc(d.id)}">${esc(d.title)}</button>
            <div class="small muted"><span class="dir-who">${avatar(d.assignee)}${esc(d.assignee)}${d.org && d.org !== d.assignee ? ' · ' + esc(d.org) : ''}</span>${doneAt ? ' · 완료 ' + esc(doneAt) : ''}${isAsana(d) ? ' · Asana' : ''}</div></div></div>
          ${noOne ? '<p class="small muted" style="margin:0">담당자가 지정되지 않아 칭찬을 보낼 사람이 없습니다.</p>' : `<label class="f">Slack 칭찬 <span class="small muted">${pr && pr.state === 'loading' ? '· AI가 초안을 쓰는 중…' : pr && pr.by ? '· ' + esc(pr.by) + ' · 고쳐서 보낼 수 있습니다' : ''}</span><textarea id="pr-${esc(d.id)}" rows="3" ${pr && pr.state === 'loading' ? 'placeholder="초안을 쓰는 중…"' : ''}>${esc(pr && pr.text ? pr.text : pr && pr.state === 'loading' ? '' : fallbackPraise(d))}</textarea></label>`}
          ${pr && pr.err ? `<p class="small dir-err" style="margin:0">${esc(pr.err)}</p>` : ''}
          <div class="row">${busy ? `<span class="small"><span class="dir-spin sm" aria-hidden="true"></span>${esc(busy)}</span>` : `
            ${noOne ? '' : `<button type="button" class="btn primary sm" data-act="ackSend" data-id="${esc(d.id)}" ${pr && pr.state === 'loading' ? 'disabled' : ''}>확인 · 칭찬 보내기</button>`}
            <button type="button" class="btn sm" data-act="ackOnly" data-id="${esc(d.id)}">${noOne ? '확인' : '보내지 않고 확인'}</button>
            ${noOne ? '' : `<button type="button" class="btn sm ${S.ui.prGuide === d.id ? 'on' : ''}" data-act="ackRedraft" data-id="${esc(d.id)}" aria-expanded="${S.ui.prGuide === d.id}">초안 다시 쓰기</button>`}`}</div>
          ${S.ui.prGuide === d.id && !noOne ? `<div class="pr-guide"><div class="row" style="justify-content:space-between"><b>AI에게 주는 글쓰기 지침</b><span class="small muted">고치면 저장되어 앞으로 모든 칭찬 초안에 쓰입니다</span></div>
            <textarea id="prg-${esc(d.id)}" class="pr-guide-ta" rows="12" aria-label="칭찬 글쓰기 지침">${esc(S.ui.prGuideText != null ? S.ui.prGuideText : praiseGuide())}</textarea>
            <div class="row"><button type="button" class="btn primary sm" data-act="prRun" data-id="${esc(d.id)}" ${pr && pr.state === 'loading' ? 'disabled' : ''}>${pr && pr.state === 'loading' ? '쓰는 중…' : '이 지침으로 초안 다시 쓰기'}</button><button type="button" class="btn sm" data-act="prReset">기본 지침으로 되돌리기</button><button type="button" class="dir-link" data-act="prClose">지침 닫기</button></div></div>` : ''}
        </div>`;
      }).join('')}</div></section>`;
  }
  const ackText = (el) => { const box = el.closest('.dir-ack'); const ta = box && box.querySelector('textarea'); return ta ? ta.value : ''; };
  APP.acts.ackSend = (el) => { const d = find(el.dataset.id); if (!d) return; const t = ackText(el); PR[d.id] = Object.assign({}, PR[d.id] || {}, { text: t, err: '' }); if (!d.src) { if (!LIVE.mcp) { ackDone(d, t, false).then(() => toast('목업이라 Slack은 보내지 않고 정리했습니다')); return; } } setTimeout(() => ackDone(d, t, true), 0); };
  APP.acts.ackOnly = (el) => { const d = find(el.dataset.id); if (d) setTimeout(() => ackDone(d, '', false), 0); };
  APP.acts.ackRedraft = (el) => { S.ui.prGuide = S.ui.prGuide === el.dataset.id ? null : el.dataset.id; S.ui.prGuideText = null; if (S.ui.prGuide) focusLater('#prg-' + CSS.escape(el.dataset.id)); };
  APP.acts.prClose = () => { S.ui.prGuide = null; S.ui.prGuideText = null; };
  APP.acts.prReset = () => { S.ui.prGuideText = PRAISE_GUIDE_DEFAULT; toast('기본 지침을 넣었습니다 — 「이 지침으로 초안 다시 쓰기」를 누르면 저장·적용됩니다'); };
  document.addEventListener('input', (e) => { if (e.target && e.target.classList && e.target.classList.contains('pr-guide-ta')) S.ui.prGuideText = e.target.value; });
  APP.acts.prRun = (el) => {
    const d = find(el.dataset.id); if (!d) return;
    const ta = document.getElementById('prg-' + d.id); const g = (ta ? ta.value : praiseGuide()).trim();
    if (!g) { toast('지침이 비어 있습니다'); return; }
    if (g !== praiseGuide()) {
      if (LIVE.db) { LIVE.praiseCfg = { guide: g, at: new Date().toISOString() }; LIVE.db.doc('config/praise').set(LIVE.praiseCfg).then(() => toast('지침을 저장했습니다'), (e) => toast('지침 저장 실패(' + ((e && e.code) || '오류') + ') — 이번 초안에는 적용합니다')); } else { S.dirPraiseGuide = g; }
    }
    S.ui.prGuideText = null;
    if (LIVE.track[d.id]) LIVE.track[d.id].praise_draft = '';
    setTimeout(() => draftPraise(d, true), 0);
  };

  /* ================= 전사 지시 (전 직원에게 같은 지시 → 개인별 Asana 하위 작업·진행 표시) ================= */
  const CW = { sending: null, confirm: null, delAsk: null, err: {}, busy: {} };
  const CW_ST = { done: ['완료', 'st-done'], doing: ['진행 중', 'st-wait'], todo: ['미착수', ''], none: ['Asana 계정 없음', 'st-hold'], fail: ['생성 실패', 'p-urgent'], draft: ['보내기 전', 'st-hold'] };
  const cwList = () => Object.values(LIVE.cw || {}).sort((a, b) => String(b.created || '').localeCompare(String(a.created || '')));
  const cwTargets = (c) => (LIVE.staff || []).filter((s) => !s.leave && (c.scope !== 'depts' || (c.depts || []).includes(s.d)));
  const cwDepts = () => [...new Set((LIVE.staff || []).map((s) => s.d))];
  const gidOf = (t) => (t && (t.gid || (t.task && t.task.gid) || (t.data && t.data.gid))) || '';
  const nameOf = (t) => String((t && (t.name || (t.task && t.task.name) || (t.data && t.data.name))) || '');
  const whoFromName = (nm) => { const m = String(nm).match(/^.* — ([^·—]+?)\s*·\s*\S+\s*$/); return m ? m[1].trim() : ''; };
  function cwRows(c) {
    const prog = (c.prog && c.prog.rows) || {};
    const sent = c.sent || {};
    const list = c.status === 'draft' ? cwTargets(c) : (Array.isArray(c.targets) && c.targets.length ? c.targets : cwTargets(c));
    const sentAt = Date.parse(c.sent_at || '') || 0;
    return list.map((s) => {
      const p = prog[s.n] || {};
      let st;
      if (!s.gid) st = 'none';
      else if (c.status === 'draft') st = 'draft';
      else if (p.done) st = 'done';
      else if (p.task || sent[s.n]) st = p.mod && sentAt && Date.parse(p.mod) > sentAt + 15 * 60000 ? 'doing' : 'todo';
      else st = c.status === 'sending' ? 'todo' : 'fail';
      return Object.assign({}, s, { st, task: p.task || sent[s.n] || '', url: p.url || '', done_at: p.done_at || '', mod: p.mod || '' });
    });
  }
  const cwStat = (rows) => { const r = { n: 0, done: 0, doing: 0, todo: 0, other: 0 }; rows.forEach((x) => { if (x.st === 'none') { r.other++; return; } r.n++; if (x.st === 'done') r.done++; else if (x.st === 'doing') r.doing++; else if (x.st === 'todo' || x.st === 'draft') r.todo++; else r.other++; }); r.pct = r.n ? Math.round(100 * r.done / r.n) : 0; return r; };

  async function cwSave(id, patch, create) {
    if (!LIVE.db) { toast('저장할 곳이 없습니다(아티팩트에서만 동작)'); return false; }
    try { if (create) await LIVE.db.doc('cw/' + id).set(patch); else await LIVE.db.doc('cw/' + id).update(patch); return true; } catch (e) { toast('저장 실패(' + (e && e.code || '오류') + ') — 편집 권한을 확인해 주세요'); return false; }
  }

  async function cwRefresh(c, quiet) {
    if (!LIVE.mcp || !c || !c.code || c.status === 'draft') return null;
    CW.busy[c.id] = true; CW.err[c.id] = null; rerender();
    const gids = (c.targets || []).map((s) => s.gid).filter(Boolean);
    const rows = {};
    let ok = true;
    for (let i = 0; i < gids.length; i += 50) {
      try {
        const r = await LIVE.mcp.callTool(ASANA.server, 'search_tasks', { text: c.code, is_subtask: true, assignee_any: gids.slice(i, i + 50).join(','), limit: 100, opt_fields: 'name,assignee.name,completed,completed_at,modified_at,permalink_url,parent.gid' }, { cache: { staleTime: 0, gcTime: 600000, refresh: true } });
        const p = r && r.payload; const data = p && Array.isArray(p.data) ? p.data : Array.isArray(p) ? p : [];
        data.forEach((t) => {
          if (c.parent_gid && t.parent && t.parent.gid && t.parent.gid !== c.parent_gid) return;
          const who = (t.assignee && t.assignee.name) || whoFromName(t.name);
          const staff = (c.targets || []).find((s) => s.n === whoFromName(t.name)) || (c.targets || []).find((s) => s.n === who);
          if (!staff) return;
          rows[staff.n] = { task: String(t.gid), done: !!t.completed, done_at: t.completed_at || '', mod: t.modified_at || '', url: t.permalink_url || '' };
        });
      } catch (e) { ok = false; CW.err[c.id] = e; }
    }
    CW.busy[c.id] = false;
    if (ok) { await cwSave(c.id, { prog: { at: new Date().toISOString(), rows } }); if (!quiet) toast('개인별 진행을 새로 불러왔습니다'); }
    rerender();
    return ok ? rows : null;
  }

  async function cwSend(c) {
    if (!LIVE.mcp || !LIVE.db) { toast('Asana·저장소가 연결된 보기에서만 보낼 수 있습니다'); return; }
    let sent = Object.assign({}, c.sent || {});
    if (c.status !== 'draft') { const rows = await cwRefresh(c, true); if (rows) Object.entries(rows).forEach(([n, r]) => { sent[n] = r.task; }); }
    const targets = (c.status === 'draft' ? cwTargets(c) : (c.targets || cwTargets(c))).map((s) => ({ n: s.n, d: s.d, g: s.g || '', p: s.p || '', gid: s.gid || '' }));
    const todo = targets.filter((s) => s.gid && !sent[s.n]);
    CW.sending = { id: c.id, done: 0, total: todo.length }; CW.confirm = null; rerender();
    const code = c.code;
    const notes = [c.body, c.due ? '기한: ' + c.due : '', '', '회장 현황판 전사 지시 · 진행하면서 이 작업에 댓글로 결과를 남기고, 끝나면 완료로 표시해 주세요.', '식별 코드: ' + code].filter((x) => x !== undefined).join('\n').trim();
    let parent = c.parent_gid || '';
    await cwSave(c.id, { status: 'sending', targets, code });
    if (!parent) {
      try {
        const task = { name: `[전사지시] ${c.title}`, project_id: ASANA.project, section_id: ASANA.sec['진행'], notes: notes + `\n대상: ${c.scope === 'depts' ? (c.depts || []).join('·') : '전 직원'} ${targets.filter((s) => s.gid).length}명 (개인별 하위 작업)` };
        if (c.due) task.due_on = c.due;
        const r = await LIVE.mcp.callTool(ASANA.server, 'create_tasks', { default_project: ASANA.project, tasks: [task] });
        const p = (r && r.payload) || {};
        parent = gidOf((p.succeeded || [])[0]);
        if (!parent) throw { code: 'tool_error', message: JSON.stringify((p.failed || [])[0] || p).slice(0, 160) };
        await cwSave(c.id, { parent_gid: parent });
      } catch (e) {
        CW.sending = null;
        await cwSave(c.id, { status: c.status === 'draft' ? 'draft' : 'partial' });
        toast('상위 태스크를 만들지 못했습니다 — ' + errText(e) + (e && (e.code === 'server_unavailable' || e.code === 'upstream_error') ? ' Asana에 이미 생겼는지 확인한 뒤 다시 보내 주세요.' : ''));
        rerender(); return;
      }
    }
    const failed = [];
    let unknown = false;
    for (let i = 0; i < todo.length; i += 50) {
      const chunk = todo.slice(i, i + 50);
      try {
        const r = await LIVE.mcp.callTool(ASANA.server, 'create_tasks', { tasks: chunk.map((s) => { const t = { name: `[전사지시] ${c.title} — ${s.n} · ${code}`, parent, assignee: s.gid, notes }; if (c.due) t.due_on = c.due; return t; }) });
        const p = (r && r.payload) || {};
        (p.succeeded || []).forEach((t) => { const nm = whoFromName(nameOf(t)); const s = chunk.find((x) => x.n === nm); if (s && gidOf(t)) sent[s.n] = gidOf(t); });
        chunk.filter((s) => !sent[s.n]).forEach((s) => failed.push(s.n));
      } catch (e) { unknown = unknown || !e || e.code !== 'tool_error'; chunk.forEach((s) => failed.push(s.n)); }
      CW.sending.done = Math.min(todo.length, i + chunk.length);
      await cwSave(c.id, { sent });
      rerender();
    }
    CW.sending = null;
    await cwSave(c.id, { status: failed.length ? 'partial' : 'sent', sent, failed, sent_at: c.sent_at || new Date().toISOString() });
    toast(failed.length ? `${todo.length - failed.length}명에게 보냈고 ${failed.length}명은 실패했습니다${unknown ? '(일부는 생겼을 수 있어 다시 보내기 전에 확인합니다)' : ''}` : `${todo.length}명에게 Asana 지시를 보냈습니다`);
    rerender();
  }

  function cwForm(c) {
    const depts = cwDepts();
    c = c || { title: '', body: '', due: '', scope: 'all', depts: [] };
    return `<form class="form cw-form" data-form="cwSave" data-id="${esc(c.id || '')}">
      <label class="f wide">지시 내용<input type="text" id="cw-title" name="title" required maxlength="120" value="${esc(c.title)}" placeholder="예: 세컨드브레인을 만드세요"></label>
      <label class="f wide">설명·완료 기준<textarea id="cw-body" name="body" rows="3" placeholder="무엇을, 어디까지 하면 완료인지">${esc(c.body)}</textarea></label>
      <label class="f">기한<input type="date" id="cw-due" name="due" value="${esc(c.due || '')}"></label>
      <fieldset class="f dir-fs"><legend class="small muted">대상</legend><div class="row"><label class="chip"><input type="radio" name="scope" value="all" ${c.scope !== 'depts' ? 'checked' : ''}> 전 직원</label><label class="chip"><input type="radio" name="scope" value="depts" ${c.scope === 'depts' ? 'checked' : ''}> 부서 선택</label></div></fieldset>
      <fieldset class="wide dir-fs"><legend class="small muted">부서 선택일 때 대상 부서</legend><div class="row">${depts.map((d) => `<label class="chip dir-tagcheck"><input type="checkbox" name="depts" value="${esc(d)}" ${(c.depts || []).includes(d) ? 'checked' : ''}>${esc(d)}</label>`).join('')}</div></fieldset>
      <div class="row wide"><button class="btn primary">${c.id ? '초안 저장' : '초안으로 만들기'}</button><button type="button" class="btn sm" data-act="cwCancelForm">취소</button><span class="small muted">초안은 Asana로 보내기 전까지 아무에게도 가지 않습니다.</span></div>
    </form>`;
  }

  function cwPanel() {
    if (!LIVE.db) return `<section class="panel"><h3>전사 지시</h3><p class="muted" style="margin:6px 0 0">전 직원에게 같은 지시를 Asana 하위 작업으로 나눠 보내고 개인별 진행을 보는 화면입니다. claude.ai 아티팩트로 열었을 때만 동작합니다(직원 명단·Asana 연결 필요).</p></section>`;
    const list = cwList();
    const ui = S.ui.cw || {};
    const sel = list.find((c) => c.id === ui.sel) || list[0];
    const head = `<div class="row" style="justify-content:space-between"><div><h3 style="margin:0">전사 지시 ${badge('측정')}</h3><p class="small muted" style="margin:2px 0 0">등록하면 Asana에 상위 태스크 1건과 직원별 하위 작업을 만들어 각자에게 배정합니다. 진행은 직원이 하위 작업을 완료로 표시한 것으로 셉니다.</p></div><button type="button" class="btn primary sm" data-act="cwNew">+ 전사 지시 만들기</button></div>`;
    const form = ui.form ? `<section class="panel cw-new"><h3>${ui.form === 'new' ? '새 전사 지시' : '초안 수정'}</h3>${cwForm(ui.form === 'new' ? null : list.find((c) => c.id === ui.form))}</section>` : '';
    const cards = `<div class="cw-cards">${list.map((c) => {
      const st = cwStat(cwRows(c));
      const label = { draft: ['초안', 'st-hold'], sending: ['보내는 중', 'st-wait'], sent: ['보냄', 'st-done'], partial: ['일부 실패', 'p-urgent'] }[c.status] || ['초안', 'st-hold'];
      return `<button type="button" class="cw-card ${sel && sel.id === c.id ? 'on' : ''}" data-act="cwSel" data-id="${esc(c.id)}" aria-pressed="${!!(sel && sel.id === c.id)}">
        <span class="row small"><span class="pill ${label[1]}">${label[0]}</span>${c.due ? `<span class="muted num">기한 ${md(c.due)}</span>` : '<span class="muted">기한 미정</span>'}</span>
        <b>${esc(c.title)}</b>
        <span class="bar"><i style="width:${c.status === 'draft' ? 0 : st.pct}%"></i></span>
        <span class="small muted num">${c.status === 'draft' ? `대상 ${st.n}명 · 아직 보내지 않음` : `완료 ${st.done}/${st.n} (${st.pct}%) · 진행 ${st.doing} · 미착수 ${st.todo}`}</span></button>`;
    }).join('') || '<p class="muted">전사 지시가 없습니다.</p>'}</div>`;
    return `<section class="panel cw-wrap">${head}</section>${form}${cards}${sel ? cwDetail(sel) : ''}`;
  }

  function cwDetail(c) {
    const ui = S.ui.cw || {};
    const f = Object.assign({ q: '', d: '', st: '', sort: 'dept' }, ui.f || {});
    const rows = cwRows(c);
    const st = cwStat(rows);
    let shown = rows.filter((r) => (!f.d || r.d === f.d) && (!f.st || r.st === f.st || (f.st === 'notdone' && ['todo', 'doing', 'fail'].includes(r.st))) && (!f.q || (r.n + ' ' + r.d + ' ' + (r.g || '') + ' ' + (r.p || '')).includes(f.q)));
    const ord = { fail: 0, todo: 1, doing: 2, done: 3, none: 4, draft: 1 };
    shown = shown.sort((a, b) => f.sort === 'name' ? a.n.localeCompare(b.n, 'ko') : f.sort === 'status' ? ord[a.st] - ord[b.st] || a.d.localeCompare(b.d, 'ko') : f.sort === 'recent' ? String(b.mod || b.done_at).localeCompare(String(a.mod || a.done_at)) : a.d.localeCompare(b.d, 'ko') || a.n.localeCompare(b.n, 'ko'));
    const byDept = cwDepts().map((d) => { const r = rows.filter((x) => x.d === d && x.st !== 'none'); const done = r.filter((x) => x.st === 'done').length; return { d, n: r.length, done, pct: r.length ? Math.round(100 * done / r.length) : 0 }; }).filter((x) => x.n).sort((a, b) => b.pct - a.pct || b.n - a.n);
    const sending = CW.sending && CW.sending.id === c.id ? CW.sending : null;
    const draft = c.status === 'draft';
    const parentUrl = c.parent_gid ? `https://app.asana.com/0/${ASANA.project}/${c.parent_gid}` : '';
    const err = CW.err[c.id];
    const progAt = c.prog && c.prog.at ? `${md(new Date(c.prog.at))} ${hm(c.prog.at)} 기준` : '아직 안 불러옴';
    const actions = sending ? `<span class="small"><span class="dir-spin sm" aria-hidden="true"></span> Asana에 만드는 중 ${sending.done}/${sending.total}명 — 창을 닫지 마세요</span>`
      : draft ? `<button type="button" class="btn primary sm" data-act="cwAskSend" data-id="${esc(c.id)}" ${LIVE.mcp ? '' : 'disabled'}>Asana로 보내기</button><button type="button" class="btn sm" data-act="cwEdit" data-id="${esc(c.id)}">초안 수정</button><button type="button" class="btn sm" data-act="cwAskDel" data-id="${esc(c.id)}">초안 삭제</button>`
      : `<button type="button" class="btn sm" data-act="cwRefresh" data-id="${esc(c.id)}" ${CW.busy[c.id] || !LIVE.mcp ? 'disabled' : ''}>${CW.busy[c.id] ? '불러오는 중…' : '진행 새로고침'}</button>${c.status === 'partial' ? `<button type="button" class="btn primary sm" data-act="cwAskSend" data-id="${esc(c.id)}">실패한 ${(c.failed || []).length}명 다시 보내기</button>` : ''}${parentUrl ? `<a class="btn sm" href="${esc(parentUrl)}" target="_blank" rel="noopener noreferrer">Asana에서 열기 ↗</a>` : ''}`;
    const confirm = CW.confirm === c.id ? `<div class="explain cw-confirm" role="alert"><b>${draft ? `${st.n}명` : `${(c.failed || []).length}명`}에게 Asana 하위 작업을 만듭니다.</b> 각 직원에게 Asana 알림이 갑니다. 보낸 뒤 되돌리려면 Asana에서 직접 지워야 합니다.${st.other ? ` Asana 계정이 없는 ${rows.filter((r) => r.st === 'none').length}명은 빠집니다.` : ''}${c.due ? '' : ' 기한이 비어 있습니다.'}
      <div class="row" style="margin-top:8px"><button type="button" class="btn primary sm" data-act="cwSend" data-id="${esc(c.id)}">보내기</button><button type="button" class="btn sm" data-act="cwCancelSend">취소</button></div></div>` : '';
    const delAsk = CW.delAsk === c.id ? `<div class="explain cw-confirm" role="alert">"${esc(c.title)}" 초안을 지웁니다. <div class="row" style="margin-top:8px"><button type="button" class="btn primary sm" data-act="cwDel" data-id="${esc(c.id)}">초안 삭제</button><button type="button" class="btn sm" data-act="cwCancelSend">취소</button></div></div>` : '';
    return `<section class="panel cw-detail" aria-labelledby="cw-h">
      <div class="cw-dhead"><div style="min-width:0"><h3 id="cw-h">${esc(c.title)}</h3><p class="small muted" style="margin:2px 0 0">${c.scope === 'depts' ? '대상 부서: ' + esc((c.depts || []).join('·')) : '대상: 전 직원'} · ${c.due ? '기한 ' + esc(c.due) : '기한 미정'}${draft ? '' : ' · 진행 ' + progAt}</p></div><div class="row">${actions}</div></div>
      ${c.body ? `<p class="dir-notes" style="margin:10px 0 0">${linkify(c.body)}</p>` : ''}
      ${confirm}${delAsk}
      ${err ? `<p class="small dir-err" style="margin:8px 0 0">${esc(errText(err))}</p>` : ''}
      <div class="cw-kpis">
        <div><span class="small muted">대상</span><b class="num">${st.n}<small>명</small></b></div>
        <div><span class="small muted">완료</span><b class="num ok">${draft ? '—' : st.done}<small>${draft ? '' : '명'}</small></b></div>
        <div><span class="small muted">진행 중</span><b class="num">${draft ? '—' : st.doing}<small>${draft ? '' : '명'}</small></b></div>
        <div><span class="small muted">미착수</span><b class="num warn">${draft ? '—' : st.todo}<small>${draft ? '' : '명'}</small></b></div>
        <div><span class="small muted">완료율</span><b class="num">${draft ? '—' : st.pct + '%'}</b></div>
      </div>
      ${draft ? '' : `<details class="cw-depts" ${ui.deptOpen ? 'open' : ''}><summary class="small">부서별 완료율 ${byDept.length}개 부서</summary><div class="dir-org">${byDept.map((r) => `<button type="button" class="dir-org-row" data-act="cwDept" data-v="${esc(r.d)}"><span class="o">${esc(r.d)}</span><span class="bar"><i style="width:${r.pct}%"></i></span><span class="num p">${r.pct}%</span><span class="small muted m">완료 ${r.done}/${r.n}</span></button>`).join('')}</div></details>`}
      <div class="form cw-filters">
        <label class="f">이름·직급 검색<input type="text" id="cwf-q" data-act="cwF" data-k="q" value="${esc(f.q)}" placeholder="예: 김, 팀장"></label>
        <label class="f">부서<select id="cwf-d" data-act="cwF" data-k="d"><option value="">전체</option>${cwDepts().map((d) => `<option ${f.d === d ? 'selected' : ''}>${esc(d)}</option>`).join('')}</select></label>
        <label class="f">상태<select id="cwf-st" data-act="cwF" data-k="st"><option value="">전체</option>${[['notdone', '미완료 전체'], ['done', '완료'], ['doing', '진행 중'], ['todo', '미착수'], ['fail', '생성 실패'], ['none', 'Asana 계정 없음']].map(([v, l]) => `<option value="${v}" ${f.st === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="f">정렬<select id="cwf-sort" data-act="cwF" data-k="sort">${[['dept', '부서순'], ['status', '안 한 사람 먼저'], ['name', '이름순'], ['recent', '최근 갱신순']].map(([v, l]) => `<option value="${v}" ${f.sort === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      </div>
      <p class="small muted" style="margin:8px 0 4px">${shown.length}명 표시 / 명단 ${rows.length}명${rows.some((r) => r.st === 'none') ? ` (Asana 계정 없음 ${rows.filter((r) => r.st === 'none').length}명 포함)` : ''}${f.q || f.d || f.st ? ' · <button type="button" class="dir-link" data-act="cwFReset">조건 지우기</button>' : ''}</p>
      <div class="tbl-wrap"><table class="dir-tbl cw-tbl"><thead><tr><th>이름</th><th>부서</th><th>상태</th><th>완료일·최근 갱신</th><th>Asana</th></tr></thead><tbody>
        ${shown.map((r) => `<tr><td data-label="이름"><span class="dir-who">${avatar(r.n)}<span>${esc(r.n)}<small>${esc([r.g, r.p].filter(Boolean).join(' · '))}</small></span></span></td>
          <td data-label="부서">${esc(r.d)}</td>
          <td data-label="상태"><span class="pill ${CW_ST[r.st][1]}">${CW_ST[r.st][0]}</span></td>
          <td data-label="갱신" class="num small">${r.done_at ? '완료 ' + esc(when(r.done_at)) : r.mod ? '갱신 ' + esc(when(r.mod)) : '—'}</td>
          <td data-label="Asana" class="small">${r.url && safeUrl(r.url) ? `<a href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">열기 ↗</a>` : r.task ? `<a href="https://app.asana.com/0/0/${esc(r.task)}" target="_blank" rel="noopener noreferrer">열기 ↗</a>` : '—'}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">조건에 맞는 직원이 없습니다.</td></tr>'}
      </tbody></table></div>
    </section>`;
  }

  const cwUi = (patch) => { S.ui.cw = Object.assign({}, S.ui.cw || {}, patch); };
  const cwFind = (id) => (LIVE.cw || {})[id];
  APP.acts.cwNew = () => { cwUi({ form: 'new' }); focusLater('#cw-title'); };
  APP.acts.cwEdit = (el) => { cwUi({ form: el.dataset.id }); focusLater('#cw-title'); };
  APP.acts.cwCancelForm = () => { cwUi({ form: null }); };
  APP.acts.cwSel = (el) => { cwUi({ sel: el.dataset.id, f: { q: '', d: '', st: '', sort: 'dept' } }); CW.confirm = null; CW.delAsk = null; const c = cwFind(el.dataset.id); if (c && c.status !== 'draft' && (!c.prog || Date.now() - Date.parse(c.prog.at) > 600000)) setTimeout(() => cwRefresh(c, true), 0); };
  APP.acts.cwAskSend = (el) => { CW.confirm = el.dataset.id; CW.delAsk = null; };
  APP.acts.cwAskDel = (el) => { CW.delAsk = el.dataset.id; CW.confirm = null; };
  APP.acts.cwCancelSend = () => { CW.confirm = null; CW.delAsk = null; };
  APP.acts.cwSend = (el) => { const c = cwFind(el.dataset.id); if (c && !CW.sending) setTimeout(() => cwSend(c), 0); };
  APP.acts.cwRefresh = (el) => { const c = cwFind(el.dataset.id); if (c) setTimeout(() => cwRefresh(c), 0); };
  APP.acts.cwDel = (el) => { const c = cwFind(el.dataset.id); CW.delAsk = null; if (!c || c.status !== 'draft' || !LIVE.db) return; LIVE.db.doc('cw/' + c.id).delete().then(() => toast('초안을 지웠습니다')).catch((e) => toast('삭제 실패(' + (e && e.code || '오류') + ')')); };
  APP.acts.cwDept = (el) => { const ui = S.ui.cw || {}; const f = Object.assign({ q: '', d: '', st: '', sort: 'dept' }, ui.f || {}); f.d = f.d === el.dataset.v ? '' : el.dataset.v; cwUi({ f, deptOpen: true }); };
  APP.acts.cwFReset = () => { cwUi({ f: { q: '', d: '', st: '', sort: 'dept' } }); };
  APP.changes.cwF = (el) => { const ui = S.ui.cw || {}; const f = Object.assign({ q: '', d: '', st: '', sort: 'dept' }, ui.f || {}); f[el.dataset.k] = el.value.trim(); cwUi({ f }); };
  APP.forms.cwSave = (fd, form) => {
    const g = (n) => (fd.get(n) || '').toString().trim();
    const scope = g('scope') === 'depts' ? 'depts' : 'all';
    const depts = fd.getAll('depts').map(String);
    if (scope === 'depts' && !depts.length) { toast('대상 부서를 하나 이상 골라 주세요'); return; }
    const data = { title: g('title'), body: g('body'), due: /^\d{4}-\d{2}-\d{2}$/.test(g('due')) ? g('due') : '', scope, depts: scope === 'depts' ? depts : [] };
    const id = form.dataset.id;
    if (id) { const c = cwFind(id); if (!c || c.status !== 'draft') { toast('보낸 지시는 여기서 고칠 수 없습니다'); return; } cwSave(id, data).then((ok) => ok && toast('초안을 저장했습니다')); cwUi({ form: null }); return; }
    const nid = 'cw' + Date.now().toString(36);
    const code = 'CW' + Math.random().toString(36).slice(2, 8).toUpperCase();
    cwSave(nid, Object.assign(data, { id: nid, code, status: 'draft', created: new Date().toISOString() }), true).then((ok) => { if (ok) { toast('초안을 만들었습니다 — 확인 후 Asana로 보내 주세요'); cwUi({ sel: nid }); rerender(); } });
    cwUi({ form: null });
  };

  /* ================= 지시 개발: 지시 후보를 다듬어 Asana·Slack으로 지시 ================= */
  const ID_CARDS = [
    ['why', '왜 하는가', '이 일을 해야 하는 이유와 배경'],
    ['goal', '달성 목표', '숫자나 상태로 말하는 목표'],
    ['result', '내야 할 결과', '끝났을 때 손에 쥐는 산출물'],
    ['process', '진행 프로세스', '단계별 진행 순서'],
    ['brand', '브랜딩 기여', '브랜드에 어떻게 보탬이 되는가'],
    ['upgrade', '초고도화', '지금보다 한 차원 높게 하는 방법'],
    ['produce', '초생산', '같은 시간에 몇 배로 만들어 내는 방법'],
    ['agent', '에이전트 위임', 'AI 에이전트에게 맡길 수 있는 부분']
  ];
  const ID_LABEL = Object.assign({ title: '지시 제목', body: '업무 설명', subs: 'Asana 하위 태스크' }, Object.fromEntries(ID_CARDS.map((c) => [c[0], c[1]])));
  const APPS = [['claude', 'Claude', 'https://claude.ai/new?q='], ['gpt', 'ChatGPT', 'https://chatgpt.com/?q='], ['gemini', 'Gemini', 'https://gemini.google.com/app?q=']];
  const IDEA = { local: null, recs: null, modal: null, fill: {}, send: {}, confirm: null, shown: null, scroll: {}, delAsk: null };
  const stableStr = (v) => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.keys(x).sort().reduce((o, kk) => { o[kk] = x[kk]; return o; }, {}) : x));
  function ideasMap() {
    if (LIVE.db) return LIVE.ideas || {};
    if (!IDEA.local) {
      const now = new Date().toISOString();
      IDEA.local = {
        i1: { id: 'i1', title: '블랙라벨 신규 가맹점 오픈 체크리스트 표준화', dept: '블랙라벨사업부', assignee: '담당 I', due: dayStr(14), body: '오픈 2주 전부터 당일까지 해야 할 일을 하나의 체크리스트로 정리한다', cards: { why: '오픈 때마다 빠지는 항목이 달라 초기 매출이 흔들림', goal: '오픈 첫 달 매출 편차 30% 축소' }, subs: [{ t: '최근 오픈 5개점 누락 항목 조사' }, { t: '체크리스트 초안 작성' }], status: 'idea', created: now, updated: now },
        i2: { id: 'i2', title: '벌툰 SNS 리뷰 자동 수집 보고', dept: '벌툰사업부', assignee: '담당 J', due: '', body: '', cards: {}, subs: [], status: 'idea', created: now, updated: now }
      };
    }
    return IDEA.local;
  }
  /* 사람 명단: Asana 직원 명단이 있으면 그것, 없으면 지시 담당자에서 */
  function staffList() {
    if (LIVE.staff && LIVE.staff.length) return LIVE.staff.filter((s) => !s.leave);
    const m = new Map(); S.directives.filter((d) => !isGoal(d) && d.assignee && d.assignee !== '미지정').forEach((d) => { if (!m.has(d.assignee)) m.set(d.assignee, { n: d.assignee, d: d.org || '미지정', g: '', p: '', gid: '' }); });
    return [...m.values()];
  }
  const deptsAll = () => [...new Set(staffList().map((s) => s.d).concat(S.directives.filter(isGoal).map((d) => d.org)).filter((x) => x && x !== '미지정' && x !== '회장'))].sort((a, b) => a.localeCompare(b, 'ko'));
  const staffOf = (n) => staffList().find((s) => s.n === n);
  /* ---------- 사람 고르기: 입력해서 찾는 칸 (이름·부서·직급·초성, ↑↓·Enter·Esc) ---------- */
  const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
  const cho = (s) => String(s || '').replace(/[가-힣]/g, (c) => CHO[Math.floor((c.charCodeAt(0) - 0xAC00) / 588)]);
  const PP = {};
  function picker(o) {
    PP[o.key] = { list: o.list, empty: o.empty || '', act: o.act || '', data: o.data || {}, load: !!o.load, pri: o.pri || '' };
    const v = o.value || '';
    return `<span class="pp" data-pp="${esc(o.key)}"><input type="text" class="pp-in${o.cls ? ' ' + o.cls : ''}" ${o.id ? `id="${esc(o.id)}"` : ''} role="combobox" aria-expanded="false" aria-autocomplete="list" aria-controls="ppl-${esc(o.key)}" aria-label="${esc(o.label || '사람 찾기')}" autocomplete="off" spellcheck="false" data-ppk="${esc(o.key)}" data-prev="${esc(v)}" value="${esc(v)}" placeholder="${esc((o.empty ? o.empty + ' · ' : '') + '이름·초성')}" title="이름·부서·직급·초성(예: ㄱㅁㅇ)으로 찾기">${o.name ? `<input type="hidden" name="${esc(o.name)}" value="${esc(v)}">` : ''}${v ? `<button type="button" class="pp-x" data-ppx="${esc(o.key)}" tabindex="-1" aria-label="지우기" title="지우기">×</button>` : ''}<ul class="pp-list" id="ppl-${esc(o.key)}" role="listbox" hidden></ul></span>`;
  }
  function ppMatches(reg, q) {
    q = String(q || '').trim().toLowerCase();
    const onlyCho = q && /^[ㄱ-ㅎ\s]+$/.test(q);
    const scored = reg.list.map((s) => {
      if (!q) return [s, 0];
      const n = s.n.toLowerCase(); const hay = [s.n, s.d, s.g, s.p].filter(Boolean).join(' ').toLowerCase();
      if (onlyCho) { const c = cho(s.n); return [s, c.startsWith(q) ? 1 : c.includes(q) ? 2 : cho(hay).includes(q) ? 3 : -1]; }
      return [s, n.startsWith(q) ? 1 : n.includes(q) ? 2 : hay.includes(q) ? 3 : -1];
    }).filter((x) => x[1] >= 0);
    scored.sort((a, b) => a[1] - b[1] || (reg.pri ? (b[0].d === reg.pri) - (a[0].d === reg.pri) : 0) || a[0].n.localeCompare(b[0].n, 'ko'));
    return scored.map((x) => x[0]);
  }
  function ppOpen(inp, q) {
    const reg = PP[inp.dataset.ppk]; if (!reg) return;
    const ul = inp.parentNode.querySelector('.pp-list');
    const all = ppMatches(reg, q); const hits = all.slice(0, 60);
    ul.innerHTML = (reg.empty && !String(q || '').trim() ? `<li role="option" data-v="" class="pp-empty">${esc(reg.empty)}</li>` : '')
      + hits.map((s) => `<li role="option" data-v="${esc(s.n)}"><b>${esc(s.n)}</b><span class="small muted">${esc([s.d, s.g].filter(Boolean).join(' · '))}</span>${reg.load ? loadPill(s.n) : ''}</li>`).join('')
      + (all.length > hits.length ? `<li class="pp-more small muted" aria-disabled="true">${all.length - hits.length}명 더 있습니다 — 더 입력해 좁혀 주세요</li>` : '')
      + (!hits.length ? '<li class="pp-more small muted" aria-disabled="true">맞는 사람이 없습니다</li>' : '');
    ul.hidden = false; inp.setAttribute('aria-expanded', 'true');
    const first = ul.querySelector('li[data-v]' + (String(q || '').trim() ? ':not(.pp-empty)' : '')); ppActive(inp, first || null);
  }
  function ppActive(inp, li) {
    const ul = inp.parentNode.querySelector('.pp-list');
    ul.querySelectorAll('li.on').forEach((x) => x.classList.remove('on'));
    if (li) { li.classList.add('on'); li.id = li.id || 'ppo-' + Math.random().toString(36).slice(2, 8); inp.setAttribute('aria-activedescendant', li.id); const t = li.offsetTop, b = t + li.offsetHeight; if (t < ul.scrollTop) ul.scrollTop = t; else if (b > ul.scrollTop + ul.clientHeight) ul.scrollTop = b - ul.clientHeight; } else inp.removeAttribute('aria-activedescendant');
  }
  function ppClose(inp) { const ul = inp.parentNode && inp.parentNode.querySelector('.pp-list'); if (ul) ul.hidden = true; inp.setAttribute('aria-expanded', 'false'); }
  function ppPick(inp, v) {
    const reg = PP[inp.dataset.ppk]; if (!reg) return;
    inp.value = v; inp.dataset.prev = v; ppClose(inp);
    const h = inp.parentNode.querySelector('input[type="hidden"]'); if (h) h.value = v;
    if (reg.act && APP.changes[reg.act]) {
      APP.changes[reg.act]({ dataset: Object.assign({}, reg.data), value: v });
      inp.dataset.picked = '1'; inp.blur(); rerender();
    }
  }
  document.addEventListener('focusin', (e) => { const t = e.target; if (t && t.dataset && t.dataset.ppk) { t.select(); ppOpen(t, ''); } });
  document.addEventListener('input', (e) => { const t = e.target; if (t && t.dataset && t.dataset.ppk) ppOpen(t, t.value); });
  document.addEventListener('focusout', (e) => {
    const t = e.target; if (!t || !t.dataset || !t.dataset.ppk) return;
    if (t.dataset.picked) { delete t.dataset.picked; ppClose(t); return; }
    const reg = PP[t.dataset.ppk]; ppClose(t); if (!reg) return;
    const typed = t.value.trim();
    if (typed === t.dataset.prev) return;
    if (!typed) { ppPick(t, ''); return; }
    const exact = reg.list.find((s) => s.n === typed) || (ppMatches(reg, typed).length === 1 ? ppMatches(reg, typed)[0] : null);
    if (exact) ppPick(t, exact.n); else t.value = t.dataset.prev;
  });
  window.addEventListener('keydown', (e) => {
    const t = e.target; if (!t || !t.dataset || !t.dataset.ppk) return;
    const ul = t.parentNode.querySelector('.pp-list');
    const opts = [...ul.querySelectorAll('li[data-v]')]; const cur = ul.querySelector('li.on'); const i = opts.indexOf(cur);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (ul.hidden) { ppOpen(t, ''); return; } const n = e.key === 'ArrowDown' ? Math.min(opts.length - 1, i + 1) : Math.max(0, i - 1); ppActive(t, opts[n] || null); }
    else if (e.key === 'Enter') { e.preventDefault(); if (!ul.hidden && cur) ppPick(t, cur.dataset.v); }
    else if (e.key === 'Escape' && !ul.hidden) { e.preventDefault(); e.stopImmediatePropagation(); t.value = t.dataset.prev; ppClose(t); }
  }, true);
  document.addEventListener('mousedown', (e) => {
    const t = e.target; if (!t || !t.closest) return;
    const li = t.closest('.pp-list li[data-v]');
    if (li) { e.preventDefault(); const inp = li.closest('.pp').querySelector('.pp-in'); ppPick(inp, li.dataset.v); return; }
    if (t.closest('.pp-list')) { e.preventDefault(); return; }
    const x = t.closest('[data-ppx]');
    if (x) { e.preventDefault(); const inp = x.closest('.pp').querySelector('.pp-in'); ppPick(inp, ''); if (!PP[inp.dataset.ppk].act) { x.remove(); inp.focus(); } }
  });

  /* 업무 부하(추정): 진행 중 지시 + 기한 경과 + 전사 지시 미완료 + 보내기 전 지시 후보 */
  const LOADCACHE = { key: '', map: {} };
  function loadOf(name) {
    const key = S.directives.length + '|' + Object.keys(LIVE.cw || {}).length + '|' + Object.keys(ideasMap()).length + '|' + (LIVE.asanaAt || 0);
    if (LOADCACHE.key !== key) { LOADCACHE.key = key; LOADCACHE.map = {}; }
    if (LOADCACHE.map[name]) return LOADCACHE.map[name];
    const tasks = S.directives.filter((d) => !isGoal(d) && d.assignee === name && isOpen(d));
    const over = tasks.filter(isOverdue).length;
    const cwN = Object.values(LIVE.cw || {}).filter((c) => c.status !== 'draft' && cwRows(c).some((r) => r.n === name && (r.st === 'todo' || r.st === 'doing'))).length;
    const ideas = Object.values(ideasMap()).filter((x) => x.assignee === name && x.status !== 'sent').length;
    const score = tasks.length + over + cwN * 0.5 + ideas * 0.5;
    const lv = score >= 7 ? 'hi' : score >= 4 ? 'mid' : 'lo';
    return (LOADCACHE.map[name] = { tasks, over, cwN, ideas, score, lv, label: { hi: '과부하', mid: '보통', lo: '여유' }[lv] });
  }
  const loadPill = (name) => { if (!name) return ''; const l = loadOf(name); return `<span class="id-load ${l.lv}" title="진행 중 지시 ${l.tasks.length} · 기한 경과 ${l.over} · 전사 지시 ${l.cwN} · 대기 후보 ${l.ideas}">${l.label} <b class="num">${l.tasks.length}</b></span>`; };
  const cardsFilled = (x) => ID_CARDS.filter(([k]) => String((x.cards || {})[k] || '').trim()).length;

  async function ideaSave(id, patch, create) {
    const m = ideasMap(); const now = new Date().toISOString();
    const cur = m[id] || {};
    const next = create ? Object.assign({ id, created: now }, patch, { updated: now }) : Object.assign({}, cur, patch, { updated: now });
    m[id] = next; /* 화면 값은 바로 바꾸고, 저장 알림이 와도 다시 그리지 않는다 */
    if (!LIVE.db) return true;
    try { if (create) await LIVE.db.doc('ideas/' + id).set(next); else await LIVE.db.doc('ideas/' + id).update(Object.assign({}, patch, { updated: now })); return true; } catch (e) { toast('저장하지 못했습니다(' + (e && e.code || '오류') + ')'); return false; }
  }
  const setPath = (x, k, v) => {
    if (k.startsWith('cards.')) return { cards: Object.assign({}, x.cards || {}, { [k.slice(6)]: v }) };
    if (k.startsWith('sub.')) { const [, i, f] = k.split('.'); const subs = (x.subs || []).map((s) => Object.assign({}, s)); if (subs[+i]) subs[+i][f] = v; return { subs }; }
    return { [k]: v };
  };
  const getPath = (x, k) => (ID_CARDS.some((c) => c[0] === k) ? String((x.cards || {})[k] || '') : k === 'subs' ? (x.subs || []).map((s) => s.t).join('\n') : String(x[k] || ''));
  /* 글자 칸: 포커스가 빠지면 조용히 저장(화면을 다시 그리지 않아 누르던 단추가 사라지지 않음) */
  document.addEventListener('change', (e) => {
    const el = e.target; if (!el || !el.dataset || !el.dataset.idk) return;
    const x = ideasMap()[el.dataset.id]; if (!x) return;
    const v = el.value; if (getPath(x, el.dataset.idk) === v && !el.dataset.idk.startsWith('sub.')) return;
    ideaSave(x.id, setPath(x, el.dataset.idk, el.dataset.idk === 'title' ? v.trim() || x.title : v));
    const st = el.closest('.id-card, .dir-sec, .id-head'); const mark = st && st.querySelector('.id-saved'); if (mark) { mark.textContent = '저장됨'; setTimeout(() => { if (mark.isConnected) mark.textContent = ''; }, 1500); }
  });
  document.addEventListener('scroll', (e) => { const t = e.target; if (t && t.classList && t.classList.contains('dir-pane-body') && S.ui.idOpen) IDEA.scroll[S.ui.idOpen] = t.scrollTop; }, true);

  function ideaContext(x) {
    const l = x.assignee ? loadOf(x.assignee) : null;
    const goals = S.directives.filter((d) => isGoal(d) && x.dept && d.org === x.dept).slice(0, 6).map((d) => `- ${d.code} ${d.title} (진척 ${d.pct}%)`).join('\n');
    return `지시 제목: ${x.title}
부서: ${x.dept || '미정'} · 담당: ${x.assignee || '미정'}${l ? ` (업무 부하 ${l.label}: 진행 중 지시 ${l.tasks.length}건, 기한 경과 ${l.over}건)` : ''} · 기한: ${x.due || '미정'}
${ID_CARDS.map(([k, lab]) => `${lab}: ${String((x.cards || {})[k] || '').trim() || '(비어 있음)'}`).join('\n')}
업무 설명: ${String(x.body || '').trim() || '(비어 있음)'}
하위 태스크: ${(x.subs || []).map((s) => s.t).filter(Boolean).join(' / ') || '(없음)'}
이 부서의 현재 목표:
${goals || '(없음)'}`;
  }
  const ID_RULES = '아이센스그룹(블랙라벨 PC방·벌툰 만화카페·생전포차 한식 포차·꼬치의품격 등 외식·여가 프랜차이즈 본사) 윤석범 회장의 지시를 다듬는 일입니다. 사실을 지어내지 말고 추정은 "(추정)"으로 표시합니다. 연봉·임금은 다루지 않습니다. 짧고 구체적인 한국어, 합니다체.';
  const dicePrompt = (x, k) => `${ID_RULES}
아래 지시의 「${ID_LABEL[k]}」 칸에 들어갈 새 제안 3가지를 서로 다른 방향으로 써 주세요.${k === 'subs' ? ' 각 제안은 Asana 하위 태스크 3~7개 목록입니다(각 30자 이내, 동사로 끝냄).' : ' 각 제안은 2~5문장 또는 짧은 목록입니다.'} 지금 칸에 있는 내용과 겹치지 않게 하세요.

${ideaContext(x)}`;
  const chatPrompt = (x, k) => `아이센스그룹 회장의 지시 「${x.title}」의 「${ID_LABEL[k]}」를 함께 다듬고 싶습니다. 지금 내용은 이렇습니다.\n${getPath(x, k) || '(비어 있음)'}\n부서 ${x.dept || '미정'}, 담당 ${x.assignee || '미정'}${x.cards && x.cards.why ? `, 이유: ${x.cards.why}` : ''}. 더 좋은 방향을 같이 생각해 주세요.`;
  const appLinks = (prompt, only) => APPS.filter((a) => !only || only.includes(a[0])).map(([k, l, u]) => `<a class="btn sm id-app ${k}" href="${esc(u + encodeURIComponent(prompt.slice(0, 700)))}" target="_blank" rel="noopener noreferrer">${l} 앱에서 이야기 ↗</a>`).join('');

  async function ideaDice(id, k) {
    const x = ideasMap()[id]; if (!x) return;
    const M = IDEA.modal = { kind: 'dice', id, k, busy: true, items: null, err: '', prompt: chatPrompt(x, k) }; rerender();
    try {
      const { llm, used } = await manualLLM(utilAi());
      if (!llm) throw { code: 'no_llm' };
      const v = await llm.json(dicePrompt(x, k) + `\nJSON 배열만 출력: ${k === 'subs' ? '[{"items":["",""],"note":"이 묶음의 특징 한 줄"}, ...]' : '[{"text":"","note":"이 제안의 방향 한 줄"}, ...]'}`, { modelTier: 'quick', cache: false });
      const arr = (Array.isArray(v) ? v : v && Array.isArray(v.items) ? v.items : []).filter((o) => o && (k === 'subs' ? Array.isArray(o.items) && o.items.length : o.text)).slice(0, 3);
      if (!arr.length) throw { code: 'empty_completion' };
      M.items = arr.map((o) => (k === 'subs' ? { items: o.items.map((s) => String(s).slice(0, 80)).slice(0, 8), note: String(o.note || '').slice(0, 80) } : { text: String(o.text).slice(0, 1200), note: String(o.note || '').slice(0, 80) }));
      M.ai = used;
    } catch (e) { M.err = aiErr(e); }
    M.busy = false; if (IDEA.modal === M) rerender();
  }
  const aiErr = (e) => (e && e.code === 'no_llm' ? '이 화면에서는 AI를 부를 수 없습니다(claude.ai에서 연 현황판에서만 됩니다). 아래 앱 단추로 이어서 이야기할 수 있습니다.' : e && e.code === 'not_granted' ? 'AI 사용이 허용되지 않았습니다. 허용 창에서 허용한 뒤 다시 눌러 주세요.' : '제안을 만들지 못했습니다(' + ((e && e.code) || '오류') + '). 다시 눌러 주세요.');

  async function ideaFill(id) {
    const x = ideasMap()[id]; if (!x || IDEA.fill[id]) return;
    IDEA.fill[id] = { busy: true }; rerender();
    try {
      const { llm } = await manualLLM(utilAi());
      if (!llm) throw { code: 'no_llm' };
      const empty = ID_CARDS.filter(([k]) => !String((x.cards || {})[k] || '').trim()).map((c) => c[0]);
      const v = await llm.json(`${ID_RULES}
아래 지시의 빈 칸을 채워 주세요. 이미 채워진 칸은 그대로 두고 그 내용과 맞게 씁니다.
채울 칸: ${empty.map((k) => k + '(' + ID_LABEL[k] + ')').join(', ')}${String(x.body || '').trim() ? '' : ', body(업무 설명: 담당자가 읽고 바로 시작할 수 있게 4~8문장)'}${(x.subs || []).length ? '' : ', subs(Asana 하위 태스크 3~6개, 각 30자 이내)'}
각 칸은 2~4문장 또는 짧은 목록.

${ideaContext(x)}
JSON 객체만 출력: {"why":"", ..., "body":"", "subs":["",""]}`, { modelTier: 'quick', cache: false });
      const cur = ideasMap()[id] || x; const cards = Object.assign({}, cur.cards || {});
      empty.forEach((k) => { if (v && v[k] && !String(cards[k] || '').trim()) cards[k] = String(v[k]).slice(0, 1200); });
      const patch = { cards };
      if (!String(cur.body || '').trim() && v && v.body) patch.body = String(v.body).slice(0, 2000);
      if (!(cur.subs || []).length && v && Array.isArray(v.subs)) patch.subs = v.subs.slice(0, 8).map((s) => ({ t: String(s).slice(0, 80) }));
      await ideaSave(id, patch);
      IDEA.fill[id] = null; toast('빈 칸을 채웠습니다 — 고칠 곳은 바로 고쳐 쓰시면 됩니다');
    } catch (e) { IDEA.fill[id] = { err: aiErr(e) }; }
    rerender();
  }

  async function ideaRecs() {
    const M = IDEA.modal = { kind: 'recs', busy: true, err: '' }; rerender();
    try {
      const { llm, used } = await manualLLM(utilAi());
      if (!llm) throw { code: 'no_llm' };
      const goals = S.directives.filter(isGoal).filter(isOpen).slice(0, 30).map((d) => `- [${d.org}] ${d.title} (진척 ${d.pct}% / 계획 ${d.plan}%)`).join('\n');
      const tasks = S.directives.filter((d) => !isGoal(d) && isOpen(d)).slice(0, 30).map((d) => `- ${shortT(d)} (${d.assignee}, ${d.status})`).join('\n');
      const loads = deptsAll().map((dp) => { const ppl = staffList().filter((s) => s.d === dp); const n = ppl.reduce((a, s) => a + loadOf(s.n).tasks.length, 0); return `${dp}: 인원 ${ppl.length}명, 진행 중 지시 ${n}건`; }).join('\n');
      const have = Object.values(ideasMap()).map((x) => x.title).join(', ');
      const v = await llm.json(`${ID_RULES}
회장이 지금 각 부서·사람에게 내리면 좋을 새 지시 아이디어 5가지를 추천하세요. 전사·부서 목표 중 늦은 것을 앞당기거나, 아무도 맡지 않은 빈틈을 메우는 것을 먼저 고르세요. 일이 몰린 부서·사람은 피하고 여유 있는 곳에 배정하세요.${have ? `\n이미 후보에 있는 것과 겹치지 않게: ${have}` : ''}${IDEA.recs && IDEA.recs.items ? `\n직전에 추천한 것과도 다르게: ${IDEA.recs.items.map((r) => r.title).join(', ')}` : ''}
각 항목: title(30자 이내), dept(아래 부서 이름 중 하나), who(담당 추천, 모르면 빈칸), why(왜 지금 필요한가 60자 이내), first(담당자가 첫 주에 할 일 40자 이내).
JSON 배열만 출력: [{"title":"","dept":"","who":"","why":"","first":""}, ...]

전사·부서 목표:
${goals || '(없음)'}
진행 중 지시:
${tasks || '(없음)'}
부서별 부하:
${loads || '(없음)'}`, { modelTier: 'quick', cache: false });
      const arr = (Array.isArray(v) ? v : v && Array.isArray(v.items) ? v.items : []).filter((o) => o && o.title).slice(0, 5).map((o) => ({ title: String(o.title).slice(0, 60), dept: String(o.dept || '').slice(0, 30), who: String(o.who || '').slice(0, 20), why: String(o.why || '').slice(0, 120), first: String(o.first || '').slice(0, 80) }));
      if (!arr.length) throw { code: 'empty_completion' };
      IDEA.recs = { at: new Date().toISOString(), items: arr, ai: used };
      if (LIVE.db) LIVE.db.doc('idearecs/latest').set(IDEA.recs).catch(() => {});
    } catch (e) { M.err = aiErr(e); }
    M.busy = false; if (IDEA.modal === M) rerender();
  }
  const recPrompt = (r) => `아이센스그룹 회장으로서 ${r.dept || '부서'}${r.who ? ' ' + r.who : ''}에게 「${r.title}」를 지시하려 합니다. 이유: ${r.why}. 이 지시를 어떻게 구체화하면 좋을지(목표·결과물·진행 순서·위험) 같이 생각해 주세요.`;

  async function ideaAsana(x) {
    if (!LIVE.mcp) { toast('Asana에 연결된 보기에서만 보낼 수 있습니다'); return; }
    const st = staffOf(x.assignee);
    IDEA.send[x.id] = 'asana'; IDEA.confirm = null; rerender();
    try {
      const notes = [String(x.body || '').trim(), '', ...ID_CARDS.filter(([k]) => String((x.cards || {})[k] || '').trim()).map(([k, lab]) => `■ ${lab}\n${String(x.cards[k]).trim()}`), '', '회장 현황판 「지시 개발」에서 보낸 지시입니다. 진행하면서 댓글로 결과를 남기고, 끝나면 완료로 표시해 주세요.'].join('\n').replace(/\n{3,}/g, '\n\n').trim();
      const task = { name: `[업무지시] ${x.title} — ${x.assignee}${st && st.g ? ' ' + st.g : ''}`, project_id: ASANA.project, section_id: ASANA.sec['진행'], notes };
      if (st && st.gid) task.assignee = st.gid;
      if (/^\d{4}-\d{2}-\d{2}$/.test(x.due || '')) task.due_on = x.due;
      const r = await LIVE.mcp.callTool(ASANA.server, 'create_tasks', { default_project: ASANA.project, tasks: [task] });
      const p = (r && r.payload) || {};
      const gid = gidOf((p.succeeded || [])[0]);
      if (!gid) throw { code: 'tool_error', message: JSON.stringify((p.failed || [])[0] || p).slice(0, 160) };
      await ideaSave(x.id, { status: 'sent', sent: Object.assign({}, x.sent || {}, { asana_gid: gid, at: new Date().toISOString() }) });
      const subs = (x.subs || []).filter((s) => String(s.t || '').trim());
      let subOk = 0;
      if (subs.length) {
        try {
          const r2 = await LIVE.mcp.callTool(ASANA.server, 'create_tasks', { tasks: subs.map((s) => { const who = staffOf(s.who || '') || st; const t = { name: String(s.t).trim(), parent: gid }; if (who && who.gid) t.assignee = who.gid; if (task.due_on) t.due_on = task.due_on; return t; }) });
          subOk = (((r2 && r2.payload) || {}).succeeded || []).length;
        } catch (e) { subOk = 0; }
      }
      toast(`Asana에 지시를 만들었습니다${subs.length ? ` · 하위 태스크 ${subOk}/${subs.length}개` : ''}${st && st.gid ? '' : ' (담당자 Asana 계정을 못 찾아 미배정)'}`);
      fetchAsana(true);
    } catch (e) { toast('Asana로 보내지 못했습니다 — ' + errText(e)); }
    IDEA.send[x.id] = null; rerender();
  }
  const slackDraft = (x) => {
    const c = x.cards || {}; const line = (lab, v) => (String(v || '').trim() ? `\n• ${lab}: ${String(v).trim().replace(/\n+/g, ' ').slice(0, 220)}` : '');
    return `[회장 지시] ${x.assignee}님, 새 업무를 부탁드립니다.\n*${x.title}*${line('왜', c.why)}${line('목표', c.goal)}${line('결과물', c.result)}${x.due ? `\n• 기한: ${x.due}` : ''}${x.sent && x.sent.asana_gid ? `\n👉 Asana: https://app.asana.com/0/${ASANA.project}/${x.sent.asana_gid}` : ''}\n궁금한 점은 편하게 물어봐 주세요.`;
  };
  async function ideaSlack(x, msg) {
    if (!LIVE.mcp) { toast('Slack에 연결된 보기에서만 보낼 수 있습니다'); return; }
    IDEA.send[x.id] = 'slack'; IDEA.confirm = null; rerender();
    try {
      const who = await findSlackId({ id: 'i' + x.id, assignee: x.assignee });
      if (!who) toast(`Slack에서 ${x.assignee}님을 찾지 못했습니다`);
      else { await LIVE.mcp.callTool('Slack', 'slack_send_message', { channel_id: who.id, message: msg }); await ideaSave(x.id, { sent: Object.assign({}, (ideasMap()[x.id] || x).sent || {}, { slack_at: new Date().toISOString() }) }); toast(`${x.assignee}님께 Slack으로 지시를 보냈습니다`); }
    } catch (e) { toast('Slack으로 보내지 못했습니다(' + ((e && e.code) || '오류') + ')'); }
    IDEA.send[x.id] = null; rerender();
  }

  const statCls = (d) => ({ '완료': 'st-done', '보고대기': 'st-wait', '보류': 'st-hold' }[d.status] || 'st-doing');

  function devPanel() {
    const f = S.ui.idf = Object.assign({ dept: '', who: '', sort: 'recent', q: '', st: 'idea' }, S.ui.idf || {});
    const all = Object.values(ideasMap());
    let list = all.filter((x) => (!f.dept || x.dept === f.dept) && (!f.who || x.assignee === f.who) && (f.st === 'all' || (f.st === 'sent' ? x.status === 'sent' : x.status !== 'sent')) && (!f.q || [x.title, x.body, x.dept, x.assignee].join(' ').includes(f.q)));
    list = list.sort((a, b) => f.sort === 'dept' ? String(a.dept || '힣').localeCompare(String(b.dept || '힣'), 'ko') || String(a.assignee || '').localeCompare(String(b.assignee || ''), 'ko')
      : f.sort === 'who' ? String(a.assignee || '힣').localeCompare(String(b.assignee || '힣'), 'ko')
        : f.sort === 'load' ? (b.assignee ? loadOf(b.assignee).score : -1) - (a.assignee ? loadOf(a.assignee).score : -1)
          : String(b.updated || '').localeCompare(String(a.updated || '')));
    const who = staffList().filter((s) => !f.dept || s.d === f.dept).sort((a, b) => a.n.localeCompare(b.n, 'ko'));
    const nf = S.ui.idNew;
    const form = nf ? `<section class="panel"><h3>새 지시 후보</h3><form class="form" data-form="idNew">
        <label class="f wide">무엇을 시킬까요<input type="text" id="idn-title" name="title" required maxlength="120" value="${esc(nf.title || '')}" placeholder="예: 생전포차 점심 메뉴 시범 운영"></label>
        <label class="f">부서<select id="idn-dept" name="dept" data-act="idNewDept"><option value="">미정</option>${deptsAll().map((d) => `<option ${nf.dept === d ? 'selected' : ''}>${esc(d)}</option>`).join('')}</select></label>
        <label class="f">담당자${picker({ key: 'new', id: 'idn-who', name: 'who', list: staffList(), pri: nf.dept || '', value: nf.who || '', empty: '미정', load: true, label: '담당자' })}</label>
        <label class="f">기한<input type="date" id="idn-due" name="due" value="${esc(nf.due || '')}"></label>
        <label class="f wide">메모(업무 설명)<textarea id="idn-body" name="body" rows="2" placeholder="생각난 것을 짧게 적어 두면 나중에 AI로 다듬을 수 있습니다">${esc(nf.body || '')}</textarea></label>
        <div class="row wide"><button class="btn primary">후보로 등록</button><button type="button" class="btn sm" data-act="idNewToggle">취소</button><span class="small muted">등록만 해 두면 아무에게도 가지 않습니다.</span></div></form></section>` : '';
    return `<section class="panel id-top"><div class="row" style="justify-content:space-between;align-items:flex-start"><div><h3 style="margin:0">지시 후보</h3><p class="small muted" style="margin:2px 0 0">생각날 때 적어 두고, 카드로 다듬은 뒤 Asana·Slack으로 지시합니다. 담당자를 찾을 때 사람마다 업무 부하(여유·보통·과부하)가 함께 보입니다.</p></div>
        <div class="row"><button type="button" class="btn sm id-dicebtn" data-act="idRecs">🎲 AI 추천 아이디어 5개</button><button type="button" class="btn primary sm" data-act="idNewToggle" aria-expanded="${!!nf}">+ 지시 후보 등록</button></div></div>
      <div class="form id-filters">
        <label class="f">부서<select id="idf-dept" data-act="idF" data-k="dept"><option value="">전체</option>${deptsAll().map((d) => `<option ${f.dept === d ? 'selected' : ''}>${esc(d)}</option>`).join('')}</select></label>
        <label class="f">담당자${picker({ key: 'idf', id: 'idf-who', list: who, value: f.who, empty: '전체', act: 'idF', data: { k: 'who' }, load: true, label: '담당자 필터' })}</label>
        <label class="f">상태<select id="idf-st" data-act="idF" data-k="st">${[['idea', '보내기 전'], ['sent', '보낸 지시'], ['all', '전체']].map(([v, l]) => `<option value="${v}" ${f.st === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="f">정렬<select id="idf-sort" data-act="idF" data-k="sort">${[['recent', '최근 고친 순'], ['dept', '부서순'], ['who', '담당자순'], ['load', '부하 큰 사람 먼저']].map(([v, l]) => `<option value="${v}" ${f.sort === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="f">검색<input type="text" id="idf-q" data-act="idF" data-k="q" value="${esc(f.q)}" placeholder="제목·설명"></label>
      </div>
      ${f.dept || f.who || f.q || f.st !== 'idea' ? '<p class="small" style="margin:8px 0 0"><button type="button" class="dir-link" data-act="idFReset">조건 지우기</button></p>' : ''}
    </section>
    ${form}
    <p class="small" style="margin:12px 2px 6px"><b class="num">${list.length}</b>건 / 후보 전체 ${all.length}건</p>
    <div class="id-list">${list.map((x) => `<button type="button" class="id-row ${S.ui.idOpen === x.id ? 'on' : ''}" data-act="idOpen" data-id="${esc(x.id)}">
        <span class="t"><b>${esc(x.title)}</b><span class="small muted">${esc(x.dept || '부서 미정')} · ${esc(x.assignee || '담당 미정')}${x.due ? ' · 기한 ' + esc(md(x.due)) : ''}</span></span>
        <span class="m">${x.assignee ? loadPill(x.assignee) : ''}<span class="pill ${x.status === 'sent' ? 'st-done' : 'st-hold'}">${x.status === 'sent' ? '보냄' : '후보'}</span><span class="small muted num">카드 ${cardsFilled(x)}/8 · 하위 ${(x.subs || []).length}</span></span></button>`).join('') || '<p class="muted">조건에 맞는 지시 후보가 없습니다. 「+ 지시 후보 등록」이나 「AI 추천 아이디어」로 시작해 보세요.</p>'}</div>`;
  }

  function ideaPane() {
    const x = S.ui.idOpen && ideasMap()[S.ui.idOpen];
    if (!x) { IDEA.shown = null; return ''; }
    document.body.classList.add('dir-lock');
    const enter = IDEA.shown !== x.id; IDEA.shown = x.id;
    queueMicrotask(() => { const b = document.querySelector('.dir-pane-body'); const v = IDEA.scroll[x.id]; if (b && v) b.scrollTop = v; });
    const wl = x.assignee ? loadOf(x.assignee) : null;
    const dice = (k) => `<button type="button" class="id-dice" data-act="idDice" data-id="${esc(x.id)}" data-k="${k}" title="AI 주사위: 새 제안 3개" aria-label="${esc(ID_LABEL[k])} AI 주사위">🎲</button>`;
    const sending = IDEA.send[x.id]; const fill = IDEA.fill[x.id] || {};
    const sent = x.sent || {};
    const conf = IDEA.confirm && IDEA.confirm.id === x.id ? IDEA.confirm : null;
    const subs = x.subs || [];
    const confirmBox = !conf ? '' : conf.kind === 'asana'
      ? `<div class="explain cw-confirm" role="alert"><b>Asana "[지시업무] ceo 윤석범"에 지시 1건${subs.filter((s) => String(s.t || '').trim()).length ? `과 하위 태스크 ${subs.filter((s) => String(s.t || '').trim()).length}개` : ''}를 만듭니다.</b> 담당 ${esc(x.assignee || '미정')}${staffOf(x.assignee) && staffOf(x.assignee).gid ? '에게 Asana 알림이 갑니다.' : ' — Asana 계정을 찾지 못해 미배정으로 만듭니다.'}${x.due ? '' : ' 기한이 비어 있습니다.'}${sent.asana_gid ? ' 이미 한 번 보냈습니다. 또 만들면 중복됩니다.' : ''}
        <div class="row" style="margin-top:8px"><button type="button" class="btn primary sm" data-act="idAsanaGo" data-id="${esc(x.id)}">보내기</button><button type="button" class="btn sm" data-act="idCancel">취소</button></div></div>`
      : `<div class="explain cw-confirm" role="alert"><b>${esc(x.assignee)}님께 Slack 개인 메시지로 보냅니다.</b> 보내기 전에 고칠 수 있습니다.
        <textarea id="id-slackmsg" rows="8" class="id-msg">${esc(conf.msg)}</textarea>
        <div class="row" style="margin-top:8px"><button type="button" class="btn primary sm" data-act="idSlackGo" data-id="${esc(x.id)}">보내기</button><button type="button" class="btn sm" data-act="idCancel">취소</button></div></div>`;
    return `<aside class="dir-pane id-pane${enter ? ' enter' : ''}" role="dialog" aria-labelledby="id-title" id="id-dlg" tabindex="-1">
      <div class="dir-pane-bar">
        ${sending ? `<span class="small"><span class="dir-spin sm" aria-hidden="true"></span>${sending === 'asana' ? 'Asana에 만드는 중…' : 'Slack으로 보내는 중…'}</span>` : `<button type="button" class="btn primary sm" data-act="idAskAsana" data-id="${esc(x.id)}" ${LIVE.mcp && x.title ? '' : 'disabled title="Asana에 연결된 보기에서만 보낼 수 있습니다"'}>${sent.asana_gid ? 'Asana로 다시 지시' : 'Asana로 지시'}</button>
        <button type="button" class="btn sm" data-act="idAskSlack" data-id="${esc(x.id)}" ${LIVE.mcp && x.assignee ? '' : `disabled title="${x.assignee ? 'Slack에 연결된 보기에서만 보낼 수 있습니다' : '담당자를 먼저 정해 주세요'}"`}>${sent.slack_at ? 'Slack 다시 보내기' : 'Slack으로 지시'}</button>`}
        <span class="dir-pane-sp"></span>
        ${sent.asana_gid ? `<a class="dir-iconbtn" href="https://app.asana.com/0/${ASANA.project}/${esc(sent.asana_gid)}" target="_blank" rel="noopener noreferrer">Asana ↗</a>` : ''}
        <button type="button" class="dir-iconbtn danger" data-act="idAskDel" data-id="${esc(x.id)}">삭제</button>
        <button type="button" class="dir-iconbtn" data-act="idClose" aria-label="패널 닫기" title="닫기 (Esc)">→|</button>
      </div>
      <div class="dir-pane-body">
        ${confirmBox}
        ${IDEA.delAsk === x.id ? `<div class="explain dir-delask" role="alert"><b>이 지시 후보를 지웁니다.</b>${sent.asana_gid ? ' Asana에 이미 만든 지시는 그대로 남습니다.' : ''}<div class="row" style="margin-top:8px"><button type="button" class="btn sm dir-dangerbtn" data-act="idDel" data-id="${esc(x.id)}">삭제</button><button type="button" class="btn sm" data-act="idCancel">취소</button></div></div>` : ''}
        <div class="row small dir-pane-kind"><span class="pill ${x.status === 'sent' ? 'st-done' : 'st-hold'}">${x.status === 'sent' ? '보낸 지시' : '지시 후보'}</span>${sent.at ? `<span class="muted">Asana ${esc(when(sent.at))}</span>` : ''}${sent.slack_at ? `<span class="muted">Slack ${esc(when(sent.slack_at))}</span>` : ''}</div>
        <div class="id-head"><textarea class="id-title" id="id-title" rows="2" data-idk="title" data-id="${esc(x.id)}" aria-label="지시 제목">${esc(x.title)}</textarea>${dice('title')}<span class="id-saved small" aria-live="polite"></span></div>
        <div class="dir-fields">
          <div class="dir-f"><span class="k">부서</span><div class="v"><select class="dir-inline" data-act="idSet" data-id="${esc(x.id)}" data-k="dept" aria-label="부서"><option value="">미정</option>${deptsAll().map((d) => `<option ${x.dept === d ? 'selected' : ''}>${esc(d)}</option>`).join('')}</select></div></div>
          <div class="dir-f"><span class="k">담당자</span><div class="v">${picker({ key: 'as-' + x.id, cls: 'dir-inline', list: staffList(), pri: x.dept || '', value: x.assignee || '', empty: '미정', act: 'idSet', data: { id: x.id, k: 'assignee' }, load: true, label: '담당자' })}</div></div>
          <div class="dir-f"><span class="k">업무 부하</span><div class="v">${wl ? `${loadPill(x.assignee)} <span class="small muted">진행 중 ${wl.tasks.length} · 기한 경과 ${wl.over} · 전사 지시 ${wl.cwN} · 대기 후보 ${wl.ideas}</span>` : '<span class="small muted">담당자를 정하면 보입니다</span>'}</div></div>
          <div class="dir-f"><span class="k">기한</span><div class="v"><input type="date" class="dir-inline" data-act="idSet" data-id="${esc(x.id)}" data-k="due" value="${esc(x.due || '')}" aria-label="기한"></div></div>
        </div>
        <div class="row id-fillrow"><span class="small muted">각 칸은 바로 고쳐 쓰면 저장됩니다. 🎲를 누르면 AI가 새 제안 3개를 냅니다.</span>${fill.busy ? '<span class="small"><span class="dir-spin sm" aria-hidden="true"></span>빈 칸을 채우는 중…</span>' : `<button type="button" class="btn sm id-dicebtn" data-act="idFill" data-id="${esc(x.id)}">빈 칸 AI로 채우기</button>`}${fill.err ? `<p class="small dir-err" style="margin:0;flex-basis:100%">${esc(fill.err)}</p>` : ''}</div>
        <div class="id-cards">${ID_CARDS.map(([k, lab, hint]) => `<div class="id-card"><div class="h"><b>${lab}</b><span class="id-saved small" aria-live="polite"></span>${dice(k)}</div><textarea rows="3" data-idk="cards.${k}" data-id="${esc(x.id)}" placeholder="${esc(hint)}" aria-label="${esc(lab)}">${esc((x.cards || {})[k] || '')}</textarea></div>`).join('')}</div>
        <section class="dir-sec"><div class="id-sech"><h4>업무 설명</h4><span class="id-saved small" aria-live="polite"></span>${dice('body')}</div><textarea class="id-body" rows="5" data-idk="body" data-id="${esc(x.id)}" placeholder="담당자가 읽고 바로 시작할 수 있게">${esc(x.body || '')}</textarea></section>
        <section class="dir-sec"><div class="id-sech"><h4>Asana 하위 태스크로 등록할 것 <span class="num muted">${subs.length}</span></h4><span class="id-saved small" aria-live="polite"></span>${dice('subs')}</div>
          <ul class="id-subs">${subs.map((s, i) => `<li><span class="dir-chk" aria-hidden="true"></span><input type="text" data-idk="sub.${i}.t" data-id="${esc(x.id)}" value="${esc(s.t || '')}" aria-label="하위 태스크 ${i + 1}">${picker({ key: 'sub-' + x.id + '-' + i, list: staffList().filter((p) => p.n !== x.assignee), pri: x.dept || '', value: s.who || '', empty: (x.assignee || '담당') + '와 같음', act: 'idSubWho', data: { id: x.id, i: String(i) }, label: '하위 태스크 ' + (i + 1) + ' 담당' })}<button type="button" class="dir-iconbtn" data-act="idSubDel" data-id="${esc(x.id)}" data-i="${i}" aria-label="하위 태스크 ${i + 1} 지우기">×</button></li>`).join('')}</ul>
          <button type="button" class="dir-link" data-act="idSubAdd" data-id="${esc(x.id)}">+ 하위 태스크 추가</button></section>
      </div>
    </aside>`;
  }

  function ideaModal() {
    const M = IDEA.modal; if (!M) return '';
    let body = '';
    if (M.kind === 'recs') {
      const R = IDEA.recs;
      body = `<div class="dir-modal-h"><b>🎲 AI가 추천하는 지시 아이디어</b><button type="button" class="dir-iconbtn" data-act="idModalClose" aria-label="닫기">×</button></div>
        <p class="small muted id-where">「후보로 등록」을 누르면 이 창은 그대로 두고, 뒤쪽 <b>지시 개발 탭의 「지시 후보」 목록</b>에 추가됩니다(아직 아무에게도 가지 않음). 여러 개를 골라 등록한 뒤 창을 닫고 목록에서 하나씩 다듬어 지시하시면 됩니다.</p>
        ${M.busy ? '<p class="small"><span class="dir-spin sm" aria-hidden="true"></span> 목표·진행 중 지시·부서별 부하를 보고 고르는 중…</p>' : ''}${M.err ? `<p class="small dir-err">${esc(M.err)}</p>` : ''}
        ${R && R.items ? `<ol class="id-recs">${R.items.map((r, i) => `<li><b>${esc(r.title)}</b><span class="small muted">${esc(r.dept || '부서 미정')}${r.who ? ' · ' + esc(r.who) + loadPill(staffOf(r.who) ? r.who : '') : ''}</span><p class="small" style="margin:4px 0">${esc(r.why)}</p>${r.first ? `<p class="small muted" style="margin:0">첫 주: ${esc(r.first)}</p>` : ''}
          <div class="row" style="margin-top:6px">${r.added && ideasMap()[r.added] ? `<span class="pill st-done">✓ 지시 후보에 등록됨</span><button type="button" class="btn sm" data-act="idRecGo" data-id="${esc(r.added)}">열어서 다듬기</button>` : `<button type="button" class="btn primary sm" data-act="idRecAdd" data-i="${i}">후보로 등록</button>`}${appLinks(recPrompt(r), ['claude'])}</div></li>`).join('')}</ol><p class="small muted">${esc(aiName(R.ai || 'claude'))} · ${esc(when(R.at))}</p>` : ''}
        <div class="row dir-modal-foot"><button type="button" class="btn sm" data-act="idRecs" ${M.busy ? 'disabled' : ''}>다시 뽑기</button><span class="dir-pane-sp"></span>${appLinks('아이센스그룹(외식·여가 프랜차이즈 본사) 회장입니다. 지금 각 부서에 내리면 좋을 새 지시 아이디어를 같이 생각해 주세요.' + (R && R.items ? ' AI가 추천한 것: ' + R.items.map((r) => r.title).join(', ') : ''))}</div>`;
    } else {
      const x = ideasMap()[M.id];
      body = `<div class="dir-modal-h"><b>🎲 「${esc(ID_LABEL[M.k])}」 새 제안 3개</b><button type="button" class="dir-iconbtn" data-act="idModalClose" aria-label="닫기">×</button></div>
        ${M.busy ? '<p class="small"><span class="dir-spin sm" aria-hidden="true"></span> 제안을 만드는 중…</p>' : ''}${M.err ? `<p class="small dir-err">${esc(M.err)}</p>` : ''}
        ${M.items ? `<ol class="id-recs">${M.items.map((o, i) => `<li>${o.note ? `<span class="small muted">${esc(o.note)}</span>` : ''}${M.k === 'subs' ? `<ul class="small">${o.items.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>` : `<div class="id-sugg">${esc(o.text).replace(/\n/g, '<br>')}</div>`}
          <div class="row" style="margin-top:6px"><button type="button" class="btn primary sm" data-act="idDiceUse" data-i="${i}" data-mode="set">이걸로 바꾸기</button>${M.k === 'title' ? '' : `<button type="button" class="btn sm" data-act="idDiceUse" data-i="${i}" data-mode="add">아래에 덧붙이기</button>`}</div></li>`).join('')}</ol>` : ''}
        <div class="id-chat"><span class="small muted">Claude 앱에서 이어서 이야기하기 — 아래 글이 미리 채워져 열립니다</span><textarea id="id-chatp" rows="3" readonly>${esc(M.prompt || '')}</textarea>
        <div class="row">${appLinks(M.prompt || '')}<button type="button" class="dir-link" data-act="idCopyP">글 복사</button></div></div>
        <div class="row dir-modal-foot"><button type="button" class="btn sm" data-act="idDice" data-id="${esc(M.id)}" data-k="${esc(M.k)}" ${M.busy || !x ? 'disabled' : ''}>🎲 다시 굴리기</button></div>`;
    }
    return `<div class="dir-modal" role="dialog" aria-modal="true"><div class="dir-modal-bg" data-act="idModalClose"></div><div class="dir-modal-box">${body}</div></div>`;
  }

  const idf = (patch) => { S.ui.idf = Object.assign({}, S.ui.idf || {}, patch); };
  APP.acts.dirMain = (el) => { S.ui.dirMain = el.dataset.v; S.ui.dirOpen = null; S.ui.idOpen = null; IDEA.modal = null; window.scrollTo(0, 0); };
  APP.acts.idNewToggle = () => { S.ui.idNew = S.ui.idNew ? null : { dept: (S.ui.idf || {}).dept || '', who: (S.ui.idf || {}).who || '' }; if (S.ui.idNew) focusLater('#idn-title'); };
  APP.changes.idNewDept = (el) => { const keep = (id) => { const e = document.getElementById(id); return e ? e.value : ''; }; const w = keep('idn-who'); const ws = staffOf(w); S.ui.idNew = { title: keep('idn-title'), body: keep('idn-body'), due: keep('idn-due'), dept: el.value, who: ws && ws.d === el.value ? w : '' }; };
  APP.forms.idNew = (fd) => {
    const g = (n) => (fd.get(n) || '').toString().trim();
    const who = g('who'); const st = staffOf(who);
    const id = 'i' + Date.now().toString(36);
    ideaSave(id, { title: g('title'), dept: st ? st.d : g('dept'), assignee: who, due: /^\d{4}-\d{2}-\d{2}$/.test(g('due')) ? g('due') : '', body: g('body'), cards: {}, subs: [], status: 'idea' }, true).then(() => rerender());
    S.ui.idNew = null; S.ui.idOpen = id; toast('지시 후보를 등록했습니다 — 오른쪽 카드에서 다듬어 보세요');
  };
  APP.changes.idF = (el) => { const p = { [el.dataset.k]: el.value.trim() }; if (el.dataset.k === 'dept') p.who = ''; idf(p); };
  APP.acts.idFReset = () => { S.ui.idf = {}; };
  APP.acts.idOpen = (el) => { if (S.ui.idOpen === el.dataset.id) { S.ui.idOpen = null; return; } S.ui.dirOpen = null; S.ui.idOpen = el.dataset.id; IDEA.confirm = null; IDEA.delAsk = null; focusLater('#id-dlg'); };
  APP.acts.idClose = () => { S.ui.idOpen = null; IDEA.confirm = null; IDEA.delAsk = null; };
  APP.changes.idSet = (el) => {
    const x = ideasMap()[el.dataset.id]; if (!x) return;
    const k = el.dataset.k; const v = el.value; const p = { [k]: k === 'due' && !/^\d{4}-\d{2}-\d{2}$/.test(v) ? '' : v };
    if (k === 'dept' && x.assignee && staffOf(x.assignee) && staffOf(x.assignee).d !== v) p.assignee = '';
    if (k === 'assignee' && v && staffOf(v)) p.dept = staffOf(v).d;
    ideaSave(x.id, p);
  };
  APP.changes.idSubWho = (el) => { const x = ideasMap()[el.dataset.id]; if (x) ideaSave(x.id, setPath(x, 'sub.' + el.dataset.i + '.who', el.value)); };
  APP.acts.idSubAdd = (el) => { const x = ideasMap()[el.dataset.id]; if (!x) return; ideaSave(x.id, { subs: (x.subs || []).concat([{ t: '' }]) }); setTimeout(() => { const a = document.querySelectorAll('.id-subs input'); if (a.length) a[a.length - 1].focus(); }, 0); };
  APP.acts.idSubDel = (el) => { const x = ideasMap()[el.dataset.id]; if (!x) return; ideaSave(x.id, { subs: (x.subs || []).filter((_, i) => i !== +el.dataset.i) }); };
  APP.acts.idDice = (el) => { setTimeout(() => ideaDice(el.dataset.id, el.dataset.k), 0); };
  APP.acts.idFill = (el) => { setTimeout(() => ideaFill(el.dataset.id), 0); };
  APP.acts.idRecs = () => { if (IDEA.modal && IDEA.modal.kind === 'recs' && IDEA.modal.busy) return; setTimeout(ideaRecs, 0); };
  APP.acts.idModalClose = () => { IDEA.modal = null; };
  APP.acts.idCopyP = () => { const t = (IDEA.modal || {}).prompt || ''; try { navigator.clipboard.writeText(t).then(() => toast('글을 복사했습니다 — 앱에 붙여 넣으세요'), () => { const a = document.getElementById('id-chatp'); if (a) a.select(); toast('글을 선택했습니다 — Ctrl+C(맥은 ⌘+C)로 복사하세요'); }); } catch (e) { toast('복사하지 못했습니다'); } };
  APP.acts.idDiceUse = (el) => {
    const M = IDEA.modal; const x = M && ideasMap()[M.id]; const o = M && M.items && M.items[+el.dataset.i]; if (!x || !o) return;
    const add = el.dataset.mode === 'add';
    let p;
    if (M.k === 'subs') p = { subs: (add ? (x.subs || []) : []).concat(o.items.map((t) => ({ t }))) };
    else if (M.k === 'title') p = { title: o.text.split('\n')[0].slice(0, 120) };
    else { const cur = getPath(x, M.k).trim(); p = setPath(x, ID_CARDS.some((c) => c[0] === M.k) ? 'cards.' + M.k : M.k, add && cur ? cur + '\n' + o.text : o.text); }
    ideaSave(x.id, p); IDEA.modal = null; toast(add ? '제안을 덧붙였습니다' : '제안으로 바꿨습니다');
  };
  APP.acts.idRecAdd = (el) => {
    const r = IDEA.recs && IDEA.recs.items[+el.dataset.i]; if (!r) return;
    const st = staffOf(r.who); const id = 'i' + Date.now().toString(36);
    ideaSave(id, { title: r.title, dept: deptsAll().includes(r.dept) ? r.dept : (st ? st.d : ''), assignee: st ? st.n : '', due: '', body: '', cards: { why: r.why || '' }, subs: r.first ? [{ t: r.first }] : [], status: 'idea', from: 'ai' }, true).then(() => rerender());
    r.added = id; if (LIVE.db) LIVE.db.doc('idearecs/latest').set(IDEA.recs).catch(() => {});
    S.ui.idf = Object.assign({}, S.ui.idf || {}, { st: 'idea' });
    toast(`「${r.title}」을 지시 후보 목록에 등록했습니다`);
  };
  APP.acts.idRecGo = (el) => { if (!ideasMap()[el.dataset.id]) return; IDEA.modal = null; S.ui.dirOpen = null; S.ui.idOpen = el.dataset.id; focusLater('#id-dlg'); };
  APP.acts.idAskAsana = (el) => { IDEA.confirm = { id: el.dataset.id, kind: 'asana' }; IDEA.delAsk = null; };
  APP.acts.idAskSlack = (el) => { const x = ideasMap()[el.dataset.id]; if (!x) return; IDEA.confirm = { id: x.id, kind: 'slack', msg: slackDraft(x) }; IDEA.delAsk = null; focusLater('#id-slackmsg'); };
  APP.acts.idCancel = () => { IDEA.confirm = null; IDEA.delAsk = null; };
  APP.acts.idAsanaGo = (el) => { const x = ideasMap()[el.dataset.id]; if (x && !IDEA.send[x.id]) setTimeout(() => ideaAsana(x), 0); };
  APP.acts.idSlackGo = (el) => { const x = ideasMap()[el.dataset.id]; const t = document.getElementById('id-slackmsg'); const msg = (t ? t.value : '').trim(); if (!x || !msg) { toast('보낼 내용을 적어 주세요'); return; } if (!IDEA.send[x.id]) setTimeout(() => ideaSlack(x, msg), 0); };
  APP.acts.idAskDel = (el) => { IDEA.delAsk = el.dataset.id; IDEA.confirm = null; };
  APP.acts.idDel = (el) => {
    const id = el.dataset.id; IDEA.delAsk = null; S.ui.idOpen = null;
    if (LIVE.db) LIVE.db.doc('ideas/' + id).delete().then(() => toast('지시 후보를 지웠습니다')).catch((e) => toast('지우지 못했습니다(' + (e && e.code || '오류') + ')'));
    else { delete ideasMap()[id]; toast('지시 후보를 지웠습니다'); }
  };

  /* ================= 지시 관리: 지시한 것들의 진행과 경영지표·직원 평가 ================= */
  const MGR = { eval: {} };
  const STEP = { '지시': 10, '진행': 50, '보고대기': 85, '완료': 100, '보류': 0 };
  const isOrder = (d) => !isGoal(d) && d.assignee && d.assignee !== '윤석범' && d.assignee !== '미지정' && !(d.tags || []).includes('lk-회장');
  const dDays = (a, b) => Math.max(0, Math.round((Date.parse(b) - Date.parse(a)) / 86400000));
  function personStats(list) {
    const done = list.filter((d) => d.status === '완료');
    const target = list.filter((d) => d.status !== '보류');
    const withDue = done.filter((d) => !noDue(d));
    const onTime = withDue.filter((d) => String(d.completed_at || d.updated_at).slice(0, 10) <= d.due_at).length;
    const open = list.filter(isOpen);
    const lead = done.map((d) => dDays(d.issued_at, String(d.completed_at || d.updated_at).slice(0, 10))).filter((n) => !isNaN(n));
    const quietAvg = open.length ? open.reduce((a, d) => a + quiet(d), 0) / open.length : 0;
    const rate = target.length ? Math.round(100 * done.length / target.length) : null;
    const ontime = withDue.length ? Math.round(100 * onTime / withDue.length) : null;
    const resp = open.length ? Math.max(0, Math.round(100 - quietAvg * 10)) : null;
    const parts = [[rate, 40], [ontime, 35], [resp, 25]].filter((p) => p[0] != null);
    const score = parts.length ? Math.round(parts.reduce((a, p) => a + p[0] * p[1], 0) / parts.reduce((a, p) => a + p[1], 0)) : null;
    return { n: list.length, done: done.length, open: open.length, over: list.filter(isOverdue).length, stale: list.filter(stl).length, rate, ontime, resp, lead: lead.length ? Math.round(lead.reduce((a, b) => a + b, 0) / lead.length) : null, score, grade: score == null || list.length < 3 ? '—' : score >= 85 ? 'A' : score >= 70 ? 'B' : score >= 55 ? 'C' : 'D', few: list.length < 3 };
  }
  const pctTxt = (v) => (v == null ? '—' : v + '%');
  function weekChart(list) {
    const W = 8; const mon = (t) => { const x = new Date(t + 'T00:00:00'); const k = (x.getDay() + 6) % 7; x.setDate(x.getDate() - k); return x.toISOString().slice(0, 10); };
    const cur = mon(S.today); const weeks = [];
    for (let i = W - 1; i >= 0; i--) { const x = new Date(cur + 'T00:00:00'); x.setDate(x.getDate() - 7 * i); weeks.push(x.toISOString().slice(0, 10)); }
    const cnt = weeks.map((w) => ({ w, a: list.filter((d) => mon(d.issued_at) === w).length, b: list.filter((d) => d.status === '완료' && mon(String(d.completed_at || d.updated_at).slice(0, 10)) === w).length }));
    const max = Math.max(1, ...cnt.map((c) => Math.max(c.a, c.b)));
    const H = 120, bw = 14, gap = 44, T = 16;
    const bars = cnt.map((c, i) => { const x = 30 + i * gap; const ha = Math.round(H * c.a / max), hb = Math.round(H * c.b / max); return `<g><rect class="mg-a" x="${x}" y="${H - ha + 10 + T}" width="${bw}" height="${ha}" rx="2"><title>${c.w.slice(5)} 주 지시 ${c.a}건</title></rect><rect class="mg-b" x="${x + bw + 2}" y="${H - hb + 10 + T}" width="${bw}" height="${hb}" rx="2"><title>${c.w.slice(5)} 주 완료 ${c.b}건</title></rect>${c.a ? `<text class="mg-v" x="${x + bw / 2}" y="${H - ha + 6 + T}">${c.a}</text>` : ''}${c.b ? `<text class="mg-v" x="${x + bw * 1.5 + 2}" y="${H - hb + 6 + T}">${c.b}</text>` : ''}<text class="mg-x" x="${x + bw}" y="${H + 26 + T}">${+c.w.slice(5, 7)}/${+c.w.slice(8)}</text></g>`; }).join('');
    return `<div class="mg-chart"><div class="row small" style="justify-content:space-between"><b>주별 지시·완료 (최근 8주)</b><span class="mg-legend"><i class="mg-a"></i>지시 <i class="mg-b"></i>완료</span></div>
      <svg viewBox="0 0 ${30 + W * gap} ${H + 34 + T}" role="img" aria-label="주별 지시 건수와 완료 건수"><line class="mg-axis" x1="24" x2="${24 + W * gap}" y1="${H + 10 + T}" y2="${H + 10 + T}"></line>${bars}</svg></div>`;
  }
  function statusBar(list) {
    const order = ['지시', '진행', '보고대기', '완료', '보류']; const n = list.length || 1;
    return `<div class="mg-stack"><div class="row small" style="justify-content:space-between"><b>상태 분포</b><span class="muted">${list.length}건</span></div><div class="mg-sbar">${order.map((s) => { const c = list.filter((d) => d.status === s).length; return c ? `<span class="mg-s s${order.indexOf(s)}" style="width:${100 * c / n}%" title="${s} ${c}건"></span>` : ''; }).join('')}</div>
      <div class="row small mg-sleg">${order.map((s) => `<span><i class="mg-s s${order.indexOf(s)}"></i>${s} <b class="num">${list.filter((d) => d.status === s).length}</b></span>`).join('')}</div></div>`;
  }
  async function personEval(name, s, list) {
    MGR.eval[name] = { busy: true }; rerender();
    try {
      const { llm, used } = await manualLLM(utilAi());
      if (!llm) throw { code: 'no_llm' };
      const r = await llm(`아이센스그룹 윤석범 회장이 ${name}님의 지시 이행을 돌아보려 합니다. 아래 기록만 근거로 짧은 평가 의견을 써 주세요.
형식: "## 잘하는 점" 2개, "## 아쉬운 점" 2개, "## 회장이 해 줄 일" 2개(코칭·업무 조정·칭찬 등). 각 1~2문장.
규칙: 기록에 없는 일을 지어내지 말 것. 표본이 적으면 그렇다고 말할 것. 연봉·임금·인사 처우는 다루지 말 것. 존중하는 말투, 한국어 합니다체.

지표(추정): 지시 ${s.n}건 · 완료 ${s.done} · 완료율 ${pctTxt(s.rate)} · 기한 준수율 ${pctTxt(s.ontime)} · 평균 처리 ${s.lead == null ? '—' : s.lead + '일'} · 진행 중 ${s.open} · 기한 경과 ${s.over} · 3일 무응답 ${s.stale} · 종합 ${s.score == null ? '—' : s.score + '점(' + s.grade + ')'}
지시 목록:
${list.slice(0, 25).map((d) => `- ${shortT(d)} | ${d.status} | 지시 ${d.issued_at} | 기한 ${dueFull(d)}${d.completed_at ? ' | 완료 ' + String(d.completed_at).slice(0, 10) : ''}`).join('\n')}`, { modelTier: 'quick', cache: false });
      MGR.eval[name] = { text: String((r && r.text) || '').trim(), ai: used, at: new Date().toISOString() };
    } catch (e) { MGR.eval[name] = { err: aiErr(e) }; }
    rerender();
  }

  function mgrPanel() {
    const f = S.ui.mgf = Object.assign({ dept: '', who: '', period: '90', st: '', sort: 'score' }, S.ui.mgf || {});
    const since = f.period === 'all' ? '' : dayStr(-(+f.period));
    const base = S.directives.filter(isOrder).filter((d) => !since || d.issued_at >= since || isOpen(d));
    const byDept = base.filter((d) => !f.dept || d.org === f.dept);
    const list = byDept.filter((d) => (!f.who || d.assignee === f.who) && (!f.st || (f.st === 'open' ? isOpen(d) : f.st === 'alert' ? isOverdue(d) || stl(d) : d.status === f.st)));
    const all = personStats(list);
    const names = [...new Set(byDept.map((d) => d.assignee))];
    const ppl = names.map((n) => { const l = byDept.filter((d) => d.assignee === n); return { n, d: (staffOf(n) || {}).d || l[0].org, s: personStats(l), load: loadOf(n), list: l }; })
      .sort((a, b) => f.sort === 'load' ? b.load.score - a.load.score : f.sort === 'rate' ? (b.s.rate ?? -1) - (a.s.rate ?? -1) : f.sort === 'name' ? a.n.localeCompare(b.n, 'ko') : (a.s.few - b.s.few) || (b.s.score ?? -1) - (a.s.score ?? -1));
    const depts = [...new Set(base.map((d) => d.org).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ko'));
    const sel = f.who ? ppl.find((p) => p.n === f.who) : null;
    const ev = sel ? MGR.eval[sel.n] || {} : null;
    const cws = Object.values(LIVE.cw || {}).filter((c) => c.status !== 'draft');
    const kpi = (l, v, cls, sub) => `<div><span class="small muted">${l}</span><b class="num ${cls || ''}">${v}</b>${sub ? `<span class="small muted">${sub}</span>` : ''}</div>`;
    return `<section class="panel mg-top"><div class="row" style="justify-content:space-between;align-items:flex-start"><div><h3 style="margin:0">지시한 것들 한눈에 ${badge('측정')}</h3><p class="small muted" style="margin:2px 0 0">Asana로 내린 지시(회장 할일 제외)를 사람·부서별로 모아 진행과 이행 지표를 봅니다. 평가 점수는 기록으로 계산한 참고값입니다.</p></div></div>
      <div class="form mg-filters">
        <label class="f">기간<select id="mgf-period" data-act="mgF" data-k="period">${[['30', '최근 30일'], ['90', '최근 90일'], ['180', '최근 6개월'], ['all', '전체']].map(([v, l]) => `<option value="${v}" ${f.period === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="f">부서<select id="mgf-dept" data-act="mgF" data-k="dept"><option value="">전체</option>${depts.map((d) => `<option ${f.dept === d ? 'selected' : ''}>${esc(d)}</option>`).join('')}</select></label>
        <label class="f">담당자${picker({ key: 'mgf', id: 'mgf-who', list: names.map((n) => staffOf(n) || { n, d: (byDept.find((d) => d.assignee === n) || {}).org || '' }), value: f.who, empty: '전체', act: 'mgF', data: { k: 'who' }, load: true, label: '담당자 필터' })}</label>
        <label class="f">상태<select id="mgf-st" data-act="mgF" data-k="st"><option value="">전체</option>${[['open', '미완료'], ['alert', '경보(경과·무응답)'], ...STATUSES.map((s) => [s, s])].map(([v, l]) => `<option value="${esc(v)}" ${f.st === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
      </div>
      ${f.dept || f.who || f.st || f.period !== '90' ? '<p class="small" style="margin:6px 0 0"><button type="button" class="dir-link" data-act="mgFReset">조건 지우기</button></p>' : ''}
      <div class="cw-kpis mg-kpis">
        ${kpi('지시', all.n + '<small>건</small>')}${kpi('진행 중', all.open + '<small>건</small>')}${kpi('완료율', pctTxt(all.rate), 'ok')}${kpi('기한 준수율', pctTxt(all.ontime))}${kpi('평균 처리', all.lead == null ? '—' : all.lead + '<small>일</small>')}${kpi('기한 경과', all.over + '<small>건</small>', all.over ? 'crit' : '')}${kpi('3일 무응답', all.stale + '<small>건</small>', all.stale ? 'warn' : '')}
      </div>
      <div class="mg-graphs">${weekChart(list)}${statusBar(list)}</div>
    </section>
    ${sel ? `<section class="panel mg-person"><div class="row" style="justify-content:space-between"><div class="dir-who">${avatar(sel.n, true)}<span><b>${esc(sel.n)}</b><small>${esc(sel.d)}${(staffOf(sel.n) || {}).g ? ' · ' + esc(staffOf(sel.n).g) : ''}</small></span></div><div class="row"><span class="mg-grade g${sel.s.grade}">${sel.s.grade}</span><span class="num">${sel.s.score == null ? '—' : sel.s.score + '점'}</span>${badge('추정')}<button type="button" class="dir-iconbtn" data-act="mgWho" data-v="" aria-label="사람 선택 해제">×</button></div></div>
      <div class="mg-meters">${[['성과(완료율)', sel.s.rate], ['성실도(기한 준수)', sel.s.ontime], ['응답성(최근 갱신)', sel.s.resp]].map(([l, v]) => `<div><span class="small">${l}</span><span class="bar"><i style="width:${v || 0}%"></i></span><b class="num small">${pctTxt(v)}</b></div>`).join('')}<div><span class="small">업무 부하</span>${loadPill(sel.n)}<span class="small muted">진행 중 ${sel.load.tasks.length} · 경과 ${sel.load.over}</span></div></div>
      ${sel.s.few ? '<p class="small muted" style="margin:6px 0 0">지시가 3건보다 적어 점수는 참고만 해 주세요.</p>' : ''}
      <div class="mg-eval">${ev.busy ? '<p class="small"><span class="dir-spin sm" aria-hidden="true"></span> 평가 의견을 쓰는 중…</p>' : ev.text ? `<div class="dir-repdoc">${mdHtml(ev.text)}</div><p class="small muted">${esc(aiName(ev.ai || 'claude'))} · ${esc(when(ev.at))} · 기록만 보고 쓴 의견입니다</p>` : ''}${ev.err ? `<p class="small dir-err">${esc(ev.err)}</p>` : ''}
        <button type="button" class="btn sm" data-act="mgEval" data-v="${esc(sel.n)}" ${ev.busy ? 'disabled' : ''}>${ev.text ? 'AI 평가 의견 다시 받기' : 'AI 평가 의견 받기'}</button></div></section>` : ''}
    <section class="panel"><div class="row" style="justify-content:space-between"><h3 style="margin:0">사람별 경영지표 · 평가</h3><label class="small">정렬 <select id="mgf-sort" data-act="mgF" data-k="sort">${[['score', '종합 점수'], ['load', '부하 큰 사람'], ['rate', '완료율'], ['name', '이름']].map(([v, l]) => `<option value="${v}" ${f.sort === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>
      <p class="small muted" style="margin:4px 0 8px">종합 = 완료율 40% + 기한 준수율 35% + 응답성 25%(진행 중 지시의 최근 갱신, 하루 늦을 때마다 10점 감점). A 85점 이상 · B 70 · C 55 · D 그 아래. 이름을 누르면 그 사람만 봅니다.</p>
      <div class="tbl-wrap"><table class="dir-tbl mg-tbl"><thead><tr><th>이름</th><th>부하</th><th>지시·완료</th><th>완료율</th><th>기한 준수</th><th>평균 처리</th><th>무응답</th><th>평가</th></tr></thead><tbody>
      ${ppl.map((p) => `<tr class="${f.who === p.n ? 'on' : ''}"><td data-label="이름"><button type="button" class="dir-link dir-who" data-act="mgWho" data-v="${esc(p.n)}">${avatar(p.n)}<span>${esc(p.n)}<small>${esc(p.d)}</small></span></button></td>
        <td data-label="부하">${loadPill(p.n)}</td><td data-label="지시·완료" class="num">${p.s.done}/${p.s.n}</td><td data-label="완료율" class="num">${pctTxt(p.s.rate)}</td><td data-label="기한 준수" class="num">${pctTxt(p.s.ontime)}</td><td data-label="평균 처리" class="num">${p.s.lead == null ? '—' : p.s.lead + '일'}</td><td data-label="무응답" class="num ${p.s.stale ? 'warn' : ''}">${p.s.stale}</td>
        <td data-label="평가"><span class="mg-grade g${p.s.grade}">${p.s.grade}</span> <span class="num small">${p.s.score == null ? '' : p.s.score}</span>${p.s.few ? ' <span class="small muted">표본 적음</span>' : ''}</td></tr>`).join('') || '<tr><td colspan="8" class="muted">조건에 맞는 지시가 없습니다.</td></tr>'}</tbody></table></div></section>
    ${cws.length && !f.who ? `<section class="panel"><h3 style="margin:0 0 6px">전사 지시 진행</h3><div class="dir-org">${cws.map((c) => { const st = cwStat(cwRows(c)); return `<button type="button" class="dir-org-row" data-act="mgCw" data-v="${esc(c.id)}"><span class="o">${esc(c.title)}</span><span class="bar"><i style="width:${st.pct}%"></i></span><span class="num p">${st.pct}%</span><span class="small muted m">완료 ${st.done}/${st.n}</span></button>`; }).join('')}</div></section>` : ''}
    <section class="panel"><h3 style="margin:0 0 6px">지시 목록 <span class="num muted">${list.length}</span></h3>
      <ul class="mg-list">${list.slice().sort((a, b) => (isOpen(b) - isOpen(a)) || a.due_at.localeCompare(b.due_at)).map((d) => `<li><div class="t"><button type="button" class="dir-title" data-act="dirOpen" data-id="${esc(d.id)}">${esc(shortT(d))}</button><span class="small muted">${esc(d.assignee)} · ${esc(d.org)} · 지시 ${esc(md(d.issued_at))}</span>${alerts(d) ? `<span class="row mg-flags">${alerts(d)}</span>` : ''}</div>
        <div class="p"><span class="bar ${d.status === '완료' ? 'done' : isOverdue(d) ? 'over' : ''}"><i style="width:${STEP[d.status] ?? 10}%"></i></span><span class="small"><span class="pill ${statCls(d)}">${esc(d.status)}</span> <span class="num ${dueCls(d)}">${isOpen(d) ? dLabel(d) : d.completed_at ? '완료 ' + esc(md(String(d.completed_at).slice(0, 10))) : ''}</span></span></div></li>`).join('') || '<li class="muted">조건에 맞는 지시가 없습니다.</li>'}</ul></section>`;
  }
  APP.changes.mgF = (el) => { const p = { [el.dataset.k]: el.value }; if (el.dataset.k === 'dept') p.who = ''; S.ui.mgf = Object.assign({}, S.ui.mgf || {}, p); };
  APP.acts.mgFReset = () => { S.ui.mgf = { sort: (S.ui.mgf || {}).sort || 'score' }; };
  APP.acts.mgWho = (el) => { S.ui.mgf = Object.assign({}, S.ui.mgf || {}, { who: (S.ui.mgf || {}).who === el.dataset.v ? '' : el.dataset.v }); if (el.dataset.v) setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 0); };
  APP.acts.mgEval = (el) => { const n = el.dataset.v; const f = S.ui.mgf || {}; const since = f.period === 'all' || !f.period ? '' : dayStr(-(+f.period)); const l = S.directives.filter(isOrder).filter((d) => d.assignee === n && (!since || d.issued_at >= since || isOpen(d))); setTimeout(() => personEval(n, personStats(l), l), 0); };
  APP.acts.mgCw = (el) => { S.ui.dirMain = 'task'; S.ui.dirTab = 'cw'; cwUi({ sel: el.dataset.v }); window.scrollTo(0, 0); };

  /* 상세 창: Esc·바깥 누르면 닫기, 다른 메뉴로 가면 정리 */
  const closeDlg = () => { const b = document.querySelector('.dir-pane-bar [data-act="dirClose"]'); if (b) b.click(); };
  document.addEventListener('keydown', (e) => { if (e.key !== 'Escape') return; if (document.body.classList.contains('dir-vis-open')) { closeVisual(); return; } if (IDEA.modal) { IDEA.modal = null; rerender(); return; } if (S.ui.dirOpen) closeDlg(); else if (S.ui.idOpen) { S.ui.idOpen = null; IDEA.confirm = null; rerender(); } });
  /* 패널 밖을 누르면 닫는다 — 다른 항목 제목을 누르면 그 항목으로 바뀐다 */
  document.addEventListener('click', (e) => {
    if (!e.isTrusted || !(S.ui.dirOpen || S.ui.idOpen) || !document.querySelector('.dir-pane')) return;
    const t = e.target;
    if (!t || !t.closest || !document.contains(t)) return;
    if (t.closest('.dir-pane') || t.closest('[data-act="dirOpen"]') || t.closest('[data-act="repOpen"]') || t.closest('[data-act="progOpen"]') || t.closest('[data-act="idOpen"]') || t.closest('.dir-modal') || t.closest('.toast') || t.closest('#dir-visual')) return;
    if (S.ui.dirOpen) closeDlg(); else { S.ui.idOpen = null; IDEA.confirm = null; rerender(); }
  }, true);
  window.addEventListener('hashchange', () => { document.body.classList.remove('dir-lock'); S.ui.dirOpen = null; S.ui.dirEdit = false; S.ui.idOpen = null; IDEA.modal = null; });

  APP.views.directives = viewDirectives;
})();
