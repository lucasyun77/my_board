/* 메뉴: 지시 관리 (directives) — 이 메뉴 담당 하위 세션은 이 파일만 고칩니다.
   공용 도구·상태는 window.APP에서 꺼내 씁니다. 새 버튼 동작은 APP.acts['이름'] = (el) => {...},
   새 폼은 APP.forms['이름'] = (fd, form) => {...}, 새 select 변경은 APP.changes['이름'] = (el) => {...} 로 등록합니다.
   태그 필터·저장된 보기·태그 저장/삭제 확인 이벤트(fTag, fMode, fField, fReset, saveView, loadView, delView,
   askDelTag, delTag, cancelDelTag, cancelEditTag, dirStatus, form 'tag'·'view')는 js/app.js 것을 그대로 씁니다.

   실데이터 연결(클로드 웹 화면으로 열었을 때만):
   - 아사나: 회장 커넥터로 "[지시업무] ceo 윤석범" 프로젝트를 읽고, 상태·기한·우선순위·이름 변경은 update_tasks,
     메모·결과물은 add_comment, 신규 등록은 create_tasks 로 되돌려 보냅니다.
   - 목표: 아티팩트 DB live/goals(부서현황판의 전사목표·부서목표 정의), track/<id>(진척·메모)에서 읽고 씁니다.
   - 화면 규칙: 화면 글은 영어를 쓰지 않는다(회장님 지시, 2026-11-07. 제품 이름 아사나·슬랙·클로드 등은 예외). 인공지능에게 주는 지침에도 '한국어로만'을 넣는다.
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

  /* ================= 실데이터 연결 (아사나 커넥터 + 아티팩트 DB) ================= */
  const ASANA = {
    server: 'Asana', project: '1215561846717757',
    sec: { '지시': '1215612428940530', '진행': '1215612428940532', '보고대기': '1215612428940534', '완료': '1215612428940536', '보류': '1215612428940538' },
    secName: { '지시할일후보': '지시', '수행 중': '진행', '대기': '보고대기', '완료': '완료', '보류중': '보류', '취소': '보류' },
    prioField: '1215612528697109', prioOpt: { '높음': '1215612528697112', '중간': '1215612528697111', '낮음': '1215612528697110' },
    brandField: '1215612428940515',
    fields: 'name,assignee.name,assignee.email,completed_at,due_on,created_at,modified_at,completed,memberships.section.name,memberships.project.gid,permalink_url,custom_fields.name,custom_fields.display_value'
  };
  const hasClaude = !!(window.claude && typeof window.claude.use === 'function');
  const OVR = {}; /* 화면에서 바꾼 값: 아사나가 따라올 때까지(최대 10분) 유지 */
  const LIVE = { state: hasClaude ? 'loading' : 'off', db: null, mcp: null, people: {}, staff: [], cw: {}, cfg: null, reps: {}, plan: null, prog: {}, goals: null, goalsAt: '', track: {}, asana: null, asanaAt: 0, asanaFrom: '', asanaErr: null, busy: false, timer: null };
  const LIVE_TAGS = [
    ['lb-PC', '아이센스PC', '#2F6E4E', '아사나 브랜드 필드'], ['lb-BT', '벌툰', '#C0392B', '아사나 브랜드 필드'], ['lb-KK', '꼬치의품격', '#B7791F', '아사나 브랜드 필드'], ['lb-SJ', '생전포차', '#D45D8C', '아사나 브랜드 필드'],
    ['lk-지시', '업무지시', '#5B6FB8', '제목 머리말 [업무지시]'], ['lk-기획', '기획지시', '#2F8C7A', '제목 머리말 [기획지시]'], ['lk-보고', '보고요청', '#8C6A4F', '제목 머리말 [보고요청]'], ['lk-회장', '회장 할일', '#3D1E0F', '제목 머리말 [회장 할일]'],
    ['th-T1', '가맹 성장', '#E9A400', '전사목표 테마'], ['th-T2', '기존점 매출', '#3D7A4E', '전사목표 테마'], ['th-T3', '생전포차·신사업', '#B4412F', '전사목표 테마'], ['th-T4', '인공지능·업무혁신', '#F29801', '전사목표 테마'], ['th-T5', '조직·문화', '#4A6A8A', '전사목표 테마'], ['th-T6', '브랜드·마케팅', '#8A5A9A', '전사목표 테마']
  ];
  const SRC_LABEL = { asana: '아사나 지시', goal_c: '전사목표', goal_d: '부서목표' };
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
    if (sec === '취소') d.log.unshift({ at: d.updated_at, text: '아사나에서 취소 구역에 있음' });
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
    if (c === 'needs_reauth') return '아사나 연결이 만료됐습니다. 클로드 설정 → 커넥터에서 아사나를 다시 연결해 주세요.';
    if (c === 'server_not_connected' || c === 'server_not_found') return '아사나 커넥터가 없습니다. 클로드 설정 → 커넥터에서 아사나를 추가해 주세요.';
    if (c === 'selection_required') return '아사나 커넥터가 여러 개입니다. 화면 위 안내에서 하나를 골라 주세요.';
    if (c === 'not_in_manifest' || c === 'approval_required' || c === 'consent_required') return '이 페이지에서 아사나 사용이 아직 허용되지 않았습니다.';
    if (c === 'blocked_by_policy') return '조직 정책으로 이 페이지에서 아사나를 쓸 수 없습니다.';
    if (c === 'server_unavailable' || c === 'upstream_error' || c === 'cancelled') return '아사나 응답이 늦습니다. 저장된 마지막 목록을 보여 드립니다.';
    if (c === 'tool_error') return '아사나가 요청을 거절했습니다: ' + String(e.message || '').slice(0, 120);
    if (c === 'not_granted' || c === 'capability_disabled' || c === 'capability_removed') return '이 보기에서는 아사나를 부를 수 없어 저장된 목록을 보여 드립니다.';
    return '아사나를 불러오지 못했습니다(' + (c || '알 수 없음') + ').';
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

  /* 회장 계정(편집 권한)일 때만 최신 아사나 목록을 DB에 저장본으로 남긴다 — 바뀐 경우에만 */
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
    if (!LIVE.mcp) { d.synced_fail = '아사나 연결 없음'; rerender(); return; }
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
      toast(`아사나에 반영했습니다 · ${why || '변경'}`);
      try { await LIVE.mcp.invalidate(ASANA.server, 'search_tasks'); } catch (e) { /* 캐시 없음 */ }
      clearTimeout(LIVE.refetchT); LIVE.refetchT = setTimeout(() => fetchAsana(true), 4000);
    } catch (e) {
      d.synced_fail = errText(e); if (OVR[d.id]) OVR[d.id].fail = d.synced_fail;
      toast('아사나 반영 실패 — ' + d.synced_fail);
    }
    d._pushing = false; rerender();
  }

  async function commentAsana(d, text) {
    if (!LIVE.mcp) return false;
    try { await LIVE.mcp.callTool(ASANA.server, 'add_comment', { task_id: d.asana_gid, text }); return true; } catch (e) { toast('아사나 댓글 실패 — ' + errText(e)); return false; }
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
      db.collection('idearecs').onSnapshot((snap) => { const m = {}; snap.docs.forEach((ds) => { const v = ds.data() || {}; if (v.key && Array.isArray(v.batches)) m[v.key] = v; }); LIVE.recHist = m; rerender(); }, err);
      db.collection('staffinfo').onSnapshot((snap) => { const m = {}; snap.docs.forEach((ds) => { const v = ds.data() || {}; if (v.key) m[v.key] = v; }); LIVE.staffinfo = m; rerender(); }, err);
      db.collection('memos').onSnapshot((snap) => { const m = {}; snap.docs.forEach((ds) => { const v = ds.data() || {}; if (v.key && Array.isArray(v.items)) m[v.key] = v; }); LIVE.memos = m; rerender(); }, err);
      db.collection('profiles').onSnapshot((snap) => { const m = {}; snap.docs.forEach((ds) => { const v = ds.data() || {}; if (v.key && v.text) m[v.key] = v; }); LIVE.profiles = m; rerender(); }, err);
      db.collection('tpls').onSnapshot((snap) => { const m = {}; snap.docs.forEach((ds) => { const v = ds.data() || {}; if (v.name) m[ds.id] = Object.assign({}, v, { id: ds.id }); }); LIVE.tpls = m; rerender(); }, err);
      db.collection('ogoals').onSnapshot((snap) => { const m = {}; snap.docs.forEach((ds) => { const v = ds.data() || {}; if (v.title != null) m[ds.id] = Object.assign({}, v, { id: ds.id }); }); if (stableStr(m) === stableStr(LIVE.ogoals || null)) return; LIVE.ogoals = m; rerender(); }, err);
      db.collection('retro').onSnapshot((snap) => { const m = {}; snap.docs.forEach((ds) => { m[ds.id] = ds.data() || {}; }); LIVE.retro = m; }, err);
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
    pend.forEach((d) => { d.synced_sig = sig(d); addLog(d, '아사나로 변경 보냄'); });
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
      if (!d.log) d.log = d.src ? [] : [{ at: d.issued_at, text: '지시 등록 · 아사나 "회장 지시" 태스크 생성' }];
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
  const dLabel = (d) => { if (noDue(d)) return '기한 없음'; const n = days(S.today, d.due_at); return n < 0 ? `${-n}일 지남` : n === 0 ? '오늘 마감' : `${n}일 남음`; };
  const dueCls = (d) => (isOverdue(d) ? 'is-over' : isOpen(d) && d.due_at <= dayStr(3) ? 'is-soon' : '');
  const quiet = (d) => days(d.updated_at, S.today);
  const titleBtn = (d) => `<button type="button" class="dir-title" data-act="dirOpen" data-id="${esc(d.id)}">${esc(d.title)}</button>`;
  const alerts = (d) => [isOverdue(d) ? `<span class="dir-flag crit">기한 ${dLabel(d)}</span>` : '', stl(d) ? `<span class="dir-flag warn">${quiet(d)}일 무응답</span>` : '', d.synced_fail ? '<span class="dir-flag crit">아사나 반영 실패</span>' : ''].join('');
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
    return `<div class="tbl-wrap"><table class="dir-tbl"><thead><tr><th>지시·목표</th><th>담당</th><th>지시일</th><th>기한</th><th>우선</th><th>상태</th><th>태그</th><th>아사나</th></tr></thead><tbody>
      ${list.map((d) => `<tr class="${isOverdue(d) ? 'overdue' : ''} ${S.ui.dirOpen === d.id ? 'dir-sel' : ''}">
        <td data-label="지시">${srcPill(d)}${titleBtn(d)}${goalBar(d)}<div class="row dir-flags">${alerts(d)}</div>${d.memo ? `<div class="small muted dir-memo">메모 · ${esc(d.memo)}</div>` : ''}${repLine(d)}</td>
        <td data-label="담당">${esc(d.org)}${d.assignee && d.assignee !== d.org ? `<div class="small muted">${esc(d.assignee)}</div>` : ''}</td>
        <td data-label="지시일" class="num">${md(d.issued_at)}</td>
        <td data-label="기한" class="num ${dueCls(d)}">${dueMd(d)}${isOpen(d) && !noDue(d) ? `<div class="small">${dLabel(d)}</div>` : ''}</td>
        <td data-label="우선">${prioPill(d.priority)}</td>
        <td data-label="상태">${statusSelect(d)}</td>
        <td data-label="태그"><div class="row">${d.tags.map(chip).join('') || '<span class="small muted">-</span>'}</div></td>
        <td data-label="아사나" class="small">${syncCell(d)}</td></tr>`).join('')}
      </tbody></table></div>`;
  }
  const syncCell = (d) => {
    if (isGoal(d)) return '<span class="dir-sync na">목표(DB 저장)</span>';
    if (isAsana(d)) return d._pushing ? '<span class="dir-sync pend">보내는 중</span>' : d.synced_fail ? '<span class="dir-sync bad">반영 실패</span>' : isPending(d) ? '<span class="dir-sync pend">보낼 변경</span>' : '<span class="dir-sync ok">아사나 연결</span>';
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
        <span class="small muted m">완료 ${r.done}/${r.n}${r.gAvg != null ? ` · 목표 ${r.gN}개 평균 진척 ${r.gAvg}%` : ''}${r.over ? ` · <span class="dir-crit">기한 경과 ${r.over}</span>` : ''}${r.stale ? ` · <span class="dir-warn">무응답 ${r.stale}</span>` : ''}</span></button>`).join('') || '<p class="small muted">아직 항목이 없습니다.</p>'}</div></section>`;
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
      ${lockAsana ? '<p class="small muted wide" style="margin:0">담당자·태그·원문은 아사나에서 바꿉니다. 여기서 바꾼 이름·기한·우선순위·상태는 바로 아사나에 반영됩니다.</p>' : ''}`;
  }
  function newPanel() {
    if (!S.ui.dirNew) return '';
    const live = S.liveMode && LIVE.mcp;
    return `<section class="panel dir-new" aria-labelledby="h-dnew"><div class="row" style="justify-content:space-between"><h3 id="h-dnew">지시 등록</h3><button type="button" class="btn sm" data-act="dirNewToggle">닫기</button></div>
      <form class="form" data-form="dirNew">${fieldsHtml('dn', S.ui.dirDraft || null)}
        <p class="small muted wide" style="margin:0">${live ? '등록하면 아사나 "[지시업무] ceo 윤석범" 프로젝트의 "지시할일후보"에 태스크가 바로 만들어집니다. 담당자는 아사나에서 지정해 주세요(이름은 설명에 적어 둡니다).' : '등록하면 아사나 "회장 지시" 프로젝트에 태스크가 함께 만들어집니다(목업: 화면 표시만).'}</p>
        <div class="row wide"><button class="btn primary">${live ? '등록 + 아사나 태스크 만들기' : '등록 + 아사나 태스크 생성'}</button><button type="button" class="btn sm" data-act="dirNewToggle">취소</button></div></form></section>`;
  }

  /* ---------- 상세 패널 (오른쪽, 아사나 작업 상세처럼) ---------- */
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
      ${!isGoal(d) ? fld('지시 품질', (() => { const q = taskQ(d); return `${qPill(q)} <span class="small muted">${q.miss.length ? '빠진 것: ' + esc(q.miss.map((m) => m[1]).join(' · ')) : '빠진 것 없음'}</span> ${badge('추정')}`; })()) : ''}
      ${isGoal(d) ? `${fld('지표', esc(d.metric) || '<span class="muted">—</span>')}${fld('현재 → 목표', `${esc(d.cur) || '—'} → ${esc(d.target) || '—'}`)}${fld('진척', goalBar(d) || '—')}${fld('합의', `<span class="small">${d.agree}/4 단계 (회장·C레벨·본부·부서)</span>`)}${upGoal ? fld('상위 목표', `<button type="button" class="dir-link" data-act="dirOpen" data-id="${esc(upGoal.id)}">${esc(upGoal.code)} ${esc(upGoal.title)}</button>`) : ''}` : ''}
      ${fld(isGoal(d) ? '등록 기준일' : '만든 날', `<span class="num">${esc(d.issued_at)}</span>${t && t.created_by && t.created_by.name ? ` <span class="small muted">· ${esc(t.created_by.name)}</span>` : ''}`)}
      ${fld('결과물', linkOut(d.result_url, '결과물 열기'))}
      ${!isAsana(d) && !isGoal(d) ? fld('원문', linkOut(d.source_url, '원문 열기')) : ''}
      ${d.synced_fail ? fld('아사나 반영', `<span class="small dir-crit">${esc(d.synced_fail)}</span> <button type="button" class="dir-link" data-act="dirRepush" data-id="${esc(d.id)}">다시 보내기</button>`) : ''}
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
    }).join('') : `<li class="muted small">${det && det.state === 'loading' ? '아사나 활동을 불러오는 중…' : det && det.state === 'err' ? esc(errText(det.err)) : !LIVE.mcp ? '아사나에 연결된 보기에서만 활동이 보입니다.' : '아직 활동이 없습니다.'}</li>`) : '';
    const feedLocal = (d.log || []).map((l) => `<li class="dir-st s"><span class="dir-dot local" aria-hidden="true"></span><div class="small">${esc(l.text)} <span class="muted">· ${md(l.at)} · 현황판</span></div></li>`).join('');

    const enter = PANE.shown !== d.id; PANE.shown = d.id;
    queueMicrotask(restorePaneScroll);
    return `<aside class="dir-pane${enter ? ' enter' : ''}" role="dialog" aria-labelledby="dlg-title" id="dir-dlg" tabindex="-1">
      <div class="dir-pane-bar">
        <button type="button" class="dir-donebtn ${done ? 'on' : ''}" data-act="dirDone" data-id="${esc(d.id)}" aria-pressed="${done}"><span aria-hidden="true">✓</span>${done ? '완료됨' : '완료로 표시'}</button>
        ${!isGoal(d) ? `<button type="button" class="dir-iconbtn danger" data-act="dirAskDel" data-id="${esc(d.id)}" title="태스크 삭제">삭제</button>` : ''}
        <span class="dir-pane-sp"></span>
        ${isAsana(d) && safeUrl(d.source_url) ? `<a class="dir-iconbtn" href="${esc(d.source_url)}" target="_blank" rel="noopener noreferrer" title="아사나에서 열기">아사나 ↗</a>` : ''}
        ${isAsana(d) && LIVE.mcp ? `<button type="button" class="dir-iconbtn" data-act="dirReload" data-id="${esc(d.id)}" title="새로고침" aria-label="상세 새로고침">↻</button>` : ''}
        <button type="button" class="dir-iconbtn" data-act="dirEditToggle" aria-pressed="${!!edit}">${edit ? '편집 닫기' : '편집'}</button>
        <button type="button" class="dir-iconbtn" data-act="dirClose" aria-label="패널 닫기" title="닫기">→|</button>
      </div>
      <div class="dir-pane-body">
        ${done ? `<div class="dir-donebanner">${valueBtn(d, true) ? `<span class="dir-donevalue">${valueBtn(d, true)}</span>` : ''}이 작업은 완료되었습니다.${isPendingAck(d) ? ' 위쪽 「완료 알림」에서 확인하면 목록에서 정리되고 칭찬이 갑니다.' : d.ack && d.ack !== 'before' ? ' 확인 ' + esc(when(d.ack)) : ''}</div>` : ''}
        <div class="row small dir-pane-kind">${srcPill(d)}${alerts(d)}${det && det.state === 'loading' ? '<span class="muted">아사나에서 불러오는 중…</span>' : ''}</div>
        <h2 class="dir-pane-title" id="dlg-title">${esc(d.title)}</h2>
        ${S.ui.dirDelAsk === d.id ? `<div class="explain dir-delask" role="alert"><b>${isAsana(d) ? '아사나에서 이 태스크를 삭제합니다.' : '목록에서 삭제합니다.'}</b> ${isAsana(d) ? '하위 작업도 함께 지워지고 되돌리기 어렵습니다.' : ''}<div class="row" style="margin-top:8px">${S.ui.dirDelBusy ? '<span class="small"><span class="dir-spin sm" aria-hidden="true"></span>지우는 중…</span>' : `<button type="button" class="btn sm dir-dangerbtn" data-act="dirDel" data-id="${esc(d.id)}">삭제</button><button type="button" class="btn sm" data-act="dirCancelDel">취소</button>`}</div></div>` : ''}
        <div class="dir-panetabs" role="tablist">${[['detail', '상세'], ['rep', `인공지능 리포트 ${repsOf(d).length}`], ['prog', `진행 기록 ${progOf(d).length}`]].map(([v, l]) => `<button type="button" role="tab" data-act="paneTab" data-v="${v}" aria-selected="${(S.ui.paneTab || 'detail') === v}">${l}</button>`).join('')}</div>
        ${S.ui.paneTab === 'prog' ? progTab(d) : S.ui.paneTab === 'rep' ? repTab(d) : edit ? `<form class="form" data-form="dirEdit" data-id="${esc(d.id)}">${fieldsHtml('de', d)}<div class="row wide"><button class="btn primary">저장</button><button type="button" class="btn sm" data-act="dirEditToggle">취소</button></div></form>` : `${fields}${desc}${subs}${memo}`}
        ${S.ui.paneTab === 'rep' || S.ui.paneTab === 'prog' ? '' : `<section class="dir-feed"><h4>${isAsana(d) ? '댓글·활동' : '활동'}</h4><ul>${feedAsana}${feedLocal}</ul></section>`}
      </div>
      <form class="dir-composer" data-form="dirComment" data-id="${esc(d.id)}">
        ${avatar('윤')}<textarea id="dc-text" name="text" rows="2" placeholder="${isAsana(d) ? '댓글 추가 (아사나에 남습니다)' : '기록 추가'}" aria-label="댓글">${esc(S.ui.dirCmt && S.ui.dirCmt.id === d.id ? S.ui.dirCmt.text : '')}</textarea>
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
      ${del ? `<div class="explain dir-delbox" role="alert">"${esc(del.name)}" 태그를 삭제하면 지시 ${S.directives.filter((d) => d.tags.includes(del.id)).length}건, 신사업 ${S.ideas.filter((i) => i.tags.includes(del.id)).length}건에서 연결이 해제됩니다. 지시·신사업 자체는 남습니다.${String(del.id).startsWith('l') || String(del.id).startsWith('th-') ? ' (아사나·목표에서 자동으로 붙는 태그라 다시 불러오면 돌아옵니다.)' : ''}<div class="row" style="margin-top:8px"><button type="button" class="btn primary sm" data-act="delTag" data-id="${esc(del.id)}">연결 해제하고 삭제</button><button type="button" class="btn sm" data-act="cancelDelTag">취소</button></div></div>` : ''}
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
        <span><b>아사나 "회장 지시"</b> 양방향 동기화 · 1시간마다</span>
        <span class="small muted">마지막 ${hm(S.dirSync.last)}${syncLast ? ` (보냄 ${syncLast.sent} · 받음 ${syncLast.recv})` : ''} · 다음 ${hm(nextAt)}</span>
        ${pend ? `<span class="dir-sync pend">보낼 변경 ${pend}건</span>` : '<span class="dir-sync ok">모두 맞춰짐</span>'}
        <button type="button" class="btn sm" data-act="dirSync">지금 동기화</button>
        <span class="small muted dir-mock">목업: 실제 아사나 연결 없음 · 클로드 웹 화면으로 열면 실데이터를 불러옵니다</span></div>`;
    }
    const nA = S.directives.filter(isAsana).length, nC = S.directives.filter((d) => d.src === 'goal_c').length, nD = S.directives.filter((d) => d.src === 'goal_d').length;
    const pend = S.directives.filter((d) => isAsana(d) && isPending(d)).length;
    const e = LIVE.asanaErr;
    const when = LIVE.asanaAt ? `${md(new Date(LIVE.asanaAt))} ${hm(LIVE.asanaAt)}` : '—';
    return `<div class="dir-syncbar live" role="status"><span class="dir-asana" aria-hidden="true"></span>
      <span><b>실데이터</b> · 아사나 지시 ${nA}건 · 전사목표 ${nC}건 · 부서목표 ${nD}건</span>
      <span class="small muted">아사나 ${LIVE.busy ? '불러오는 중…' : `${esc(LIVE.asanaFrom || '없음')} · ${when} 기준`} · 1시간마다 새로고침</span>
      ${pend ? `<span class="dir-sync pend">보낼 변경 ${pend}건</span>` : nA ? '<span class="dir-sync ok">아사나와 맞춰짐</span>' : ''}
      <button type="button" class="btn sm" data-act="dirSync" ${LIVE.busy || !LIVE.mcp ? 'disabled' : ''}>${pend ? '보내고 새로고침' : '지금 새로고침'}</button>
      ${LIVE.mcp ? `<span class="small dir-aistat ${LIVE.inhouse ? 'ok' : ''}">기본 인공지능 ${esc(aiName(utilAi()))}${utilAi() === 'inhouse' ? (LIVE.inhouse ? ' · 연결됨' : LIVE.inhouse === false ? ' · 연결 안 됨(회사 PC의 데스크톱 앱에서만)' : ' · 확인 중') : ''}${NIGHT.state === 'running' ? ` · 밤 리포트 ${NIGHT.done}/${NIGHT.total}` : ''}</span>` : ''}
      ${LIVE.db && LIVE.mcp ? `<span class="small muted dir-progstat">진행 기록 ${PROGRUN.state === 'running' ? `모으는 중 ${PROGRUN.done}/${PROGRUN.total}` : PROGRUN.state === 'done' ? '오늘 모음' : kstHour() >= COLLECT_HOUR ? '오늘 자동 조사 대기' : '오늘 22:00 이후 자동 조사'} <button type="button" class="dir-link" data-act="progAll" ${PROGRUN.state === 'running' ? 'disabled' : ''}>지금 모으기</button></span>` : ''}
      ${e ? `<span class="small dir-err">${esc(errText(e))}${needsAllow(e) ? ' <button type="button" class="dir-link" data-act="dirAllow">허용하고 불러오기</button>' : ''}</span>` : ''}
      ${!LIVE.mcp ? '<span class="small muted dir-mock">이 보기에서는 아사나를 부를 수 없어 저장본을 보여 드립니다.</span>' : ''}</div>`;
  }

  /* ---------- 메인 화면 ---------- */
  function viewDirectives() {
    normalize();
    if (LIVE.state === 'loading' && !S.liveMode) {
      return `<div class="view-head"><div><h2>지시 관리</h2><p>아사나 지시와 전사·부서 목표를 불러오고 있습니다.</p></div></div>
        <div class="panel dir-loading" role="status"><span class="dir-spin" aria-hidden="true"></span><div><b>아사나 "[지시업무] ceo 윤석범"과 목표를 불러오는 중…</b><p class="small muted" style="margin:4px 0 0">아사나 사용을 묻는 창이 뜨면 허용해 주세요. 아사나 응답이 늦으면 1분 가까이 걸릴 수 있습니다.</p></div></div>`;
    }
    if (LIVE.state === 'error' && !S.liveMode) {
      const e = LIVE.asanaErr;
      return `<div class="view-head"><div><h2>지시 관리</h2></div></div>
        <div class="panel dir-loading" role="alert"><div><b>${esc(errText(e))}</b><div class="row" style="margin-top:8px">${needsAllow(e) ? '<button type="button" class="btn primary sm" data-act="dirAllow">허용하고 불러오기</button>' : '<button type="button" class="btn sm" data-act="dirSync">다시 불러오기</button>'}</div></div></div>`;
    }
    const main = S.ui.dirMain || 'task';
    const mainTabs = `<div class="dir-maintabs" role="tablist" aria-label="지시 메뉴">${[['task', '태스크 관리', '지금 돌아가는 일'], ['dev', '지시 개발', '시킬 일을 다듬기'], ['mgr', '지시 관리', '지시한 것의 성과']].map(([v, l, h]) => `<button type="button" role="tab" data-act="dirMain" data-v="${v}" aria-selected="${main === v}"><b>${l}</b><small>${h}</small></button>`).join('')}</div>`;
    if (main === 'dev') {
      return `${mainTabs}${inboxBox()}<div class="view-head"><div><h2>지시 개발</h2><p>누구에게 무엇을 시킬지 정하고, 다듬어서 아사나·슬랙으로 보냅니다.</p></div></div>
        ${devPanel()}${detailDialog()}${ideaPane()}${ideaModal()}`;
    }
    if (main === 'mgr') {
      return `${mainTabs}${inboxBox()}<div class="view-head"><div><h2>지시 관리</h2><p>지시한 일의 진행과 사람별 이행 지표를 한눈에 봅니다.</p></div></div>
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

    return `${mainTabs}${inboxBox()}
      <div class="view-head"><div><h2>태스크 관리</h2><p>${S.liveMode ? '아사나 지시와 전사·부서 목표를 한곳에서 챙깁니다. 기한 경과와 3일 무응답은 경보로 띄웁니다.' : '회장 지시를 등록·추적합니다. 기한 경과와 3일 무응답은 경보로 띄웁니다.'}</p></div>
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

      ${S.liveMode ? `<div class="seg dir-srcseg" role="group" aria-label="종류">${[['', '전체'], ['asana', '아사나 지시'], ['goal_c', '전사목표'], ['goal_d', '부서목표']].map(([v, l]) => `<button type="button" data-act="dirSrc" data-v="${v}" aria-pressed="${f.src === v}">${l} <span class="num">${v ? S.directives.filter((d) => d.src === v).length : S.directives.length}</span></button>`).join('')}</div>` : ''}

      <section class="panel dir-filter" aria-labelledby="h-filter">
        <div class="row" style="justify-content:space-between"><h3 id="h-filter">필터</h3>
          <div class="seg" role="group" aria-label="태그 조건">${['OR', 'AND'].map((m) => `<button type="button" data-act="fMode" data-v="${m}" aria-pressed="${f.mode === m}">${m === 'OR' ? '하나라도' : '모두'}</button>`).join('')}</div></div>
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
      commentAsana(d, text).then((ok) => { if (ok) { S.ui.dirCmt = null; toast('아사나에 댓글을 남겼습니다'); loadDetail(d, true); } else rerender(); });
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
      if (!LIVE.mcp) { toast('이 보기에서는 아사나를 부를 수 없습니다'); return; }
      const pend = S.directives.filter((d) => isAsana(d) && isPending(d));
      (async () => { for (const d of pend) await pushAsana(d, '보낼 변경'); fetchAsana(true); })();
      return;
    }
    const n = runSync(false); toast(n ? `아사나로 ${n}건 보내고 0건 받았습니다(목업)` : '아사나와 이미 맞춰져 있습니다(목업)');
  };
  APP.acts.dirRepush = (el) => { const d = find(el.dataset.id); if (d) pushAsana(d, '다시 보내기'); };
  APP.acts.dirNudge = (el) => {
    const d = find(el.dataset.id); if (!d) return;
    if (isAsana(d)) {
      const msg = `[회장 현황판] 진행 상황을 알려 주세요.${isOverdue(d) ? ` 기한(${d.due_at})이 지났습니다.` : ` ${quiet(d)}일째 갱신이 없습니다.`}`;
      commentAsana(d, msg).then((ok) => { if (ok) { writeTrack(d, {}, '담당자에게 확인 요청(아사나 댓글)'); toast(`${d.assignee}에게 아사나 댓글로 확인 요청을 남겼습니다`); } });
      return;
    }
    addLog(d, '담당자에게 확인 요청(아사나 댓글·목업)'); toast(`${d.assignee}에게 확인 요청을 보냈습니다(목업)`);
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

  /* 상태 select 변경: app.js가 값을 바꾼 뒤 실데이터면 아사나·DB로 보낸다 */
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
      toast('아사나에 태스크를 만드는 중…');
      LIVE.mcp.callTool(ASANA.server, 'create_tasks', { default_project: ASANA.project, tasks: [task] }).then((r) => {
        const p = (r && r.payload) || {};
        if (Array.isArray(p.failed) && p.failed.length) throw { code: 'tool_error', message: JSON.stringify(p.failed[0].errors || p.failed[0]).slice(0, 160) };
        S.ui.dirDraft = null; S.ui.dirNew = false;
        toast('아사나에 지시를 만들었습니다');
        fetchAsana(true);
      }).catch((e) => { toast('아사나 등록 실패 — ' + errText(e) + ' 입력한 내용은 남겨 두었습니다.'); S.ui.dirNew = true; rerender(); });
      return;
    }
    const n = 1000 + S.directives.length + 1;
    const d = Object.assign({ id: uid('d'), status: '지시', result_url: '', updated_at: S.today, asana_gid: 'mock-' + n }, readFields(fd, g));
    d.log = [{ at: S.today, text: `지시 등록 · 아사나 "회장 지시" 태스크 ${d.asana_gid} 생성(목업)` }];
    d.synced_sig = sig(d); d._st = d.status;
    S.directives.push(d); S.ui.dirNew = false;
    toast(`등록 완료 · 아사나 태스크 ${d.asana_gid} 생성(목업)`);
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
    if (sig(d) !== before) { d.updated_at = S.today; if (d._st === d.status) addLog(d, '내용 수정'); toast('저장했습니다 · 다음 동기화 때 아사나에 반영'); }
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
        commentAsana(d, text).then((c) => toast(changed.join('·') + (c ? ' 저장 · 아사나 댓글로도 남겼습니다' : ' 저장(댓글은 실패)')));
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
    toast(changed.join('·') + ' 저장 · 다음 동기화 때 아사나에 반영');
  };

  /* ================= 인공지능 리포트 (태스크별 도움 보고서) ================= */
  const AI_DEFAULT = [{ id: 'claude', name: '클로드', on: true }, { id: 'gemini', name: '재미나이', on: false }, { id: 'gpt', name: '지피티', on: false }, { id: 'inhouse', name: '사내 서버', on: false }];
  const REPGEN = {};
  const allAi = () => { const c = LIVE.cfg; return c && Array.isArray(c.providers) && c.providers.length ? c.providers.filter((p) => p && p.id) : AI_DEFAULT; };
  const aiList = () => { const c = LIVE.cfg; const menu = c && c.menus && c.menus.directives; const p = allAi(); return Array.isArray(menu) && menu.length ? p.filter((x) => menu.includes(x.id)) : p; };
  const aiOf = (d) => (LIVE.track[d.id] || {}).ai || (S.dirAi && S.dirAi[d.id]) || (LIVE.cfg && LIVE.cfg.defaultAi) || 'claude';
  const KO_NAME = [[/claude/i, '클로드'], [/chatgpt|gpt/i, '지피티'], [/gemini/i, '재미나이'], [/qwen/i, '큐웬'], [/\bAI\b/g, '인공지능'], [/inhouse/i, '사내 인공지능']];
  const aiName = (id) => { let n = String((allAi().concat(AI_DEFAULT).find((x) => x.id === id) || { name: id }).name || ''); KO_NAME.forEach(([re, ko]) => { n = n.replace(re, ko); }); return n.replace(/사내 인공지능 \(큐웬\)/, '사내 인공지능(큐웬)'); };
  /* 사내 인공지능(큐웬): 회장 PC의 로컬 커넥터(host:isens-ai, tools/isens-ai-mcp)를 클로드 데스크톱 앱이 연결했을 때만 쓸 수 있다 */
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
  /* 클로드 sample과 같은 모양(함수 + .json)으로 돌려준다. 쓸 수 없으면 null */
  /* 회장이 직접 누른 요청: 지정 인공지능을 못 쓰면 클로드로 대신한다(자동 작업은 대신하지 않음) */
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
      f.label = '사내 인공지능'; return f;
    }
    if (id === 'claude') {
      const smp = hasClaude ? await window.claude.use('sample') : null; if (!smp) return null;
      const f = (p, o) => smp(p, o); f.json = (p, o) => smp.json(p, o); f.label = '클로드'; return f;
    }
    return null;
  }
  const repsOf = (d) => (LIVE.reps[d.id] || (S.dirReps && S.dirReps[d.id]) || []);
  const planOf = (d) => { const p = LIVE.plan; return p && Array.isArray(p.items) ? p.items.find((x) => x.task_id === d.id) : null; };
  function repLine(d) {
    const n = repsOf(d).length; const pl = planOf(d);
    return `<div class="dir-repline"><button type="button" class="dir-repbtn ${n ? 'has' : ''}" data-act="repOpen" data-id="${esc(d.id)}">인공지능 리포트 <b class="num">${n}</b></button><button type="button" class="dir-repbtn ${progOf(d).length ? 'has prog' : ''}" data-act="progOpen" data-id="${esc(d.id)}">진행 기록 <b class="num">${progOf(d).length}</b>${progOf(d)[0] && progOf(d)[0].signal && progOf(d)[0].signal !== '정보 없음' ? ` · ${esc(progOf(d)[0].signal)}` : ''}</button><span class="small muted">${esc(aiName(aiOf(d)))}${pl ? ` · 오늘 ${esc(pl.kind || '리포트')} ${esc(pl.status || '예정')}` : ''}</span></div>`;
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
최근 진행 기록(인공지능 자동 조사):
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
        const prompt = `아이센스그룹 윤석범 회장이 아래 업무에 대해 인공지능에게 맡길 수 있는 보고서·자료 5가지를 추천하세요. 이 업무를 끝까지 해내는 데 실제로 도움이 되는 것만 고르고, 서로 겹치지 않게 하세요. 특히 '최근 진행 기록'에 드러난 막힌 점·위험·빈틈을 먼저 해결하는 자료를 고르세요.${fresh && old.length ? `\n이미 보여 준 추천과는 다른 것으로 고르세요: ${old.map((x) => x.title).join(', ')}` : ''}
각 항목: title(20자 이내 명사형), why(40자 이내, 왜 도움이 되는지), prompt(인공지능에게 보낼 구체적인 요청문 3~6문장. 무엇을 어떤 형식으로 만들지 적을 것).
JSON 배열만 출력: [{"title":"","why":"","prompt":""}, ...]

${ctx}`;
        const v = await sample.json(prompt, { modelTier: 'quick', cache: false });
        const arr = Array.isArray(v) ? v : v && Array.isArray(v.items) ? v.items : null;
        if (arr) items = arr.filter((x) => x && x.title && x.prompt).slice(0, 5).map((x) => ({ title: String(x.title).slice(0, 40), why: String(x.why || '').slice(0, 80), prompt: String(x.prompt).slice(0, 1500) }));
      } else note = `${aiName(utilAi())}를 지금 쓸 수 없어 기본 추천을 보여 드립니다`;
    } catch (e) { note = e && e.code === 'not_granted' ? '인공지능 사용이 허용되지 않아 기본 추천을 보여 드립니다' : '추천을 새로 만들지 못해 기본 추천을 보여 드립니다'; }
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
      if (!llm) throw { code: 'no_llm', message: ai === 'inhouse' ? '사내 인공지능도 클로드도 이 화면에서 부를 수 없습니다(클로드 웹에서 연 현황판에서만 됩니다).' : '이 화면에서는 인공지능을 부를 수 없습니다(클로드 웹에서 연 현황판에서만 됩니다).' };
      G.note = fallback ? '사내 인공지능이 연결 전이라 클로드로 만듭니다.' : '';
      G.stage = '업무 내용·댓글·진행 기록을 모으는 중…'; rerender();
      const ctx = await taskContext(d);
      const prompt = `당신은 아이센스그룹 윤석범 회장의 업무 보좌 인공지능입니다. 회장의 요청에 따라 아래 업무에 대한 자료를 만드세요.
회장의 요청: ${promptText}
${REP_RULES}
출력 형식: 첫 줄 "# (제목)", 이어서 마크다운 본문(## 소제목, - 목록, 필요하면 표).

${ctx}`;
      G.stage = used === 'inhouse' ? '사내 인공지능이 쓰는 중… (업무시간에는 차례를 기다릴 수 있습니다)' : '클로드가 쓰는 중… (처음 한 번은 사용 허용 창이 뜹니다)'; rerender();
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
        : c === 'not_granted' || c === 'sampling_disabled' ? '이 현황판에서 클로드 사용이 허용되지 않았습니다. 현황판 위쪽 권한 메뉴에서 클로드 사용을 허용한 뒤 다시 눌러 주세요.'
        : c === 'rate_limited' ? '요청이 많거나 사용 한도에 걸렸습니다. 잠시 뒤에 다시 눌러 주세요.'
        : c === 'session_expired' ? '클로드 로그인이 만료됐습니다. 다시 로그인한 뒤 눌러 주세요.'
        : c === 'refused' ? '인공지능이 이 요청을 거절했습니다. 요청 문장을 바꿔 다시 눌러 주세요.'
        : c === 'empty_completion' ? '인공지능이 빈 답을 보냈습니다. 요청을 조금 줄여 다시 눌러 주세요.'
        : c === 'prompt_too_large' ? '요청이 너무 깁니다. 요청 문장을 줄여 주세요.'
        : c === 'tool_error' ? '사내 인공지능이 거절했습니다: ' + String(e.message || '').slice(0, 120)
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
          <button type="button" class="btn sm" data-act="visSlack" data-id="${esc(r.id)}" data-task="${esc(d.id)}" ${REPSEND[r.id + 'v'] || !d.assignee || d.assignee === '미지정' || isGoal(d) ? 'disabled' : ''}>${REPSEND[r.id + 'v'] ? '보내는 중…' : r.visual_slack_at ? '비주얼 링크 다시 보내기' : `슬랙으로 ${esc(d.assignee && d.assignee !== '미지정' && !isGoal(d) ? d.assignee + '님께 ' : '')}링크 보내기`}</button>
          <button type="button" class="dir-link" data-act="visCopy" data-v="${esc(r.visual_id)}">링크 복사</button>` : ''}
          ${(VISGEN[r.id] || {}).err ? `<p class="small dir-err" style="margin:0;flex-basis:100%">${esc(VISGEN[r.id].err)}</p>` : ''}
        </div>
        <div class="row dir-repsend">
          ${isAsana(d) ? `<button type="button" class="btn sm" data-act="repAsana" data-id="${esc(r.id)}" data-task="${esc(d.id)}" ${REPSEND[r.id + 'a'] ? 'disabled' : ''}>${REPSEND[r.id + 'a'] ? '다는 중…' : r.asana_at ? '아사나 댓글 다시 달기' : '아사나 댓글로 달기'}</button>` : ''}
          <button type="button" class="btn sm" data-act="repSlack" data-id="${esc(r.id)}" data-task="${esc(d.id)}" ${REPSEND[r.id + 's'] || !d.assignee || d.assignee === '미지정' || isGoal(d) ? 'disabled' : ''} title="${isGoal(d) ? '목표는 담당이 부서라 개인 슬랙으로 보낼 수 없습니다' : ''}">${REPSEND[r.id + 's'] ? '보내는 중…' : r.slack_at ? '슬랙 다시 보내기' : `슬랙으로 ${esc(d.assignee && d.assignee !== '미지정' && !isGoal(d) ? d.assignee + '님께' : '')} 보내기`}</button>
          <span class="small muted">${[r.asana_at ? '아사나 댓글 ' + esc(when(r.asana_at)) : '', r.slack_at ? '슬랙 ' + esc(when(r.slack_at)) : ''].filter(Boolean).join(' · ')}</span>
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
        <div class="dir-f"><span class="k">담당 인공지능</span><div class="v"><select class="dir-inline" aria-label="담당 인공지능" data-act="dirAi" data-id="${esc(d.id)}">${aiList().map((p) => `<option value="${esc(p.id)}" ${p.id === ai ? 'selected' : ''}>${esc(p.name)}${aiReady(p.id) ? '' : ' (연결 필요)'}</option>`).join('')}</select></div></div>
        <div class="dir-f"><span class="k">세컨드브레인</span><div class="v small">${sb ? esc(sb) : '<span class="muted">지정 안 됨 · 관리자 메뉴에서 지정</span>'}</div></div>
      </div>

      <section class="dir-repsec"><h4>인공지능이 판단해 만든 리포트 <span class="num muted">${auto.length}</span></h4>
        ${pl ? `<p class="small muted" style="margin:0 0 6px">오늘 계획: ${esc(pl.kind || '리포트')} · ${esc(pl.status || '예정')}</p>` : ''}
        <div class="dir-replist">${auto.map((r) => repItem(d, r)).join('') || '<p class="muted small" style="margin:0">매일 18:00에 인공지능이 이 태스크에 필요하다고 판단하면 여기에 올라옵니다.</p>'}</div></section>

      <section class="dir-repsec"><div class="row" style="justify-content:space-between"><h4 style="margin:0">${esc(aiName(ai))}가 만들어 드릴 수 있는 것</h4><button type="button" class="btn sm" data-act="recReset" data-id="${esc(d.id)}" ${rc.busy ? 'disabled' : ''}>${rc.busy ? '추천 만드는 중…' : '추천 리스트 바꾸기'}</button></div>
        ${rc.note ? `<p class="small muted" style="margin:4px 0 0">${esc(rc.note)}</p>` : ''}
        ${aiReady(ai) ? '' : `<p class="small muted" style="margin:4px 0 0">${esc(aiName(ai))}가 아직 연결되지 않았습니다. 직접 요청하시면 클로드로 만들고, 밤 자동 작성은 연결된 뒤에 시작합니다.</p>`}
        <div class="dir-recs">${recs ? recs.map((x, i) => `<div class="dir-rec ${sel === i ? 'on' : ''}">
            <button type="button" class="dir-rec-h" data-act="recPick" data-id="${esc(d.id)}" data-v="${i}" aria-expanded="${sel === i}"><b>${esc(x.title)}</b><span class="small muted">${esc(x.why)}</span></button>
            ${sel === i ? `<div class="dir-rec-body"><label class="f">세부 요청(고쳐서 보낼 수 있습니다)<textarea id="rec-prompt" rows="5">${esc(x.prompt)}</textarea></label>
              <div class="row"><button type="button" class="btn primary sm" data-act="recRun" data-id="${esc(d.id)}" data-v="${i}" ${gen.busy ? 'disabled' : ''}>${gen.busy ? `만드는 중… <span data-elapsed="${esc(d.id)}">${Math.round((Date.now() - (gen.start || Date.now())) / 1000)}초</span>` : aiReady(ai) ? esc(aiName(ai)) + '에게 요청' : '클로드로 요청'}</button><button type="button" class="btn sm" data-act="recPick" data-id="${esc(d.id)}" data-v="${i}">접기</button></div>
              ${!aiReady(ai) && !gen.busy ? `<p class="small muted" style="margin:0">${esc(aiName(ai))}가 아직 연결되지 않아 이 요청은 클로드로 만듭니다.</p>` : ''}
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
    if (d.src && LIVE.db) writeTrack(d, { ai: el.value }, '담당 인공지능 → ' + aiName(el.value));
    else { S.dirAi = S.dirAi || {}; S.dirAi[d.id] = el.value; }
  };

  const REPSEND = {}; const REPOPEN = {};
  document.addEventListener('toggle', (e) => { const t = e.target; if (t && t.classList && t.classList.contains('dir-repitem')) REPOPEN[t.dataset.rid] = t.open; }, true);
  const repText = (d, r, max) => { const t = `[회장 현황판 인공지능 리포트] ${r.kind || '리포트'} — ${r.title || ''}\n업무: ${d.title}\n\n${r.body || ''}\n\n(${aiName(r.ai || 'claude')} 작성 · ${when(r.created)})`; return t.length > max ? t.slice(0, max - 20) + '\n…(이하 생략)' : t; };
  async function repMark(d, r, patch) {
    Object.assign(r, patch);
    if (LIVE.db && LIVE.reps[d.id]) { try { await LIVE.db.doc('reports/' + r.id).update(patch); } catch (e) { /* 표시만 */ } }
  }
  APP.acts.repAsana = (el) => {
    const d = find(el.dataset.task); const r = d && repsOf(d).find((x) => x.id === el.dataset.id); if (!d || !r || !isAsana(d)) return;
    if (!LIVE.mcp) { toast('아사나에 연결된 보기에서만 댓글을 달 수 있습니다'); return; }
    REPSEND[r.id + 'a'] = true;
    setTimeout(async () => {
      const ok = await commentAsana(d, repText(d, r, 9000));
      REPSEND[r.id + 'a'] = false;
      if (ok) { await repMark(d, r, { asana_at: new Date().toISOString() }); toast('리포트를 아사나 댓글로 달았습니다'); if (DET[d.asana_gid]) loadDetail(d, true); }
      rerender();
    }, 0);
  };
  APP.acts.repSlack = (el) => {
    const d = find(el.dataset.task); const r = d && repsOf(d).find((x) => x.id === el.dataset.id); if (!d || !r) return;
    if (!LIVE.mcp) { toast('슬랙에 연결된 보기에서만 보낼 수 있습니다'); return; }
    REPSEND[r.id + 's'] = true;
    setTimeout(async () => {
      try {
        const who = await findSlackId(d);
        if (!who) { toast(`슬랙에서 ${d.assignee}님을 찾지 못했습니다`); }
        else {
          await LIVE.mcp.callTool('Slack', 'slack_send_message', { channel_id: who.id, message: repText(d, r, 3900) });
          await repMark(d, r, { slack_at: new Date().toISOString(), slack_to: who.label });
          if (d.src && !(LIVE.track[d.id] || {}).slack_id) writeTrack(d, { slack_id: who.id, slack_label: who.label });
          toast(`${d.assignee}님께 슬랙으로 리포트를 보냈습니다`);
        }
      } catch (e) {
        const c = e && e.code;
        toast(c === 'server_unavailable' || c === 'upstream_error' ? '슬랙 응답이 없습니다. 메시지가 갔는지 슬랙에서 확인한 뒤 다시 보내 주세요.' : c === 'needs_reauth' ? '슬랙 연결이 만료됐습니다. 클로드 설정 → 커넥터에서 다시 연결해 주세요.' : ['not_in_manifest', 'approval_required', 'consent_required'].includes(c) ? '이 페이지에서 슬랙 사용이 아직 허용되지 않았습니다. 다시 누르면 허용 창이 뜹니다.' : '슬랙으로 보내지 못했습니다(' + (c || '오류') + ').');
      }
      REPSEND[r.id + 's'] = false; rerender();
    }, 0);
  };

  /* ================= 진행 기록 (슬랙·회의록·산출물·아사나를 날짜별로 자동 정리, 하루 1회) ================= */
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
          if (txt && !/\(0 results\)|No results/i.test(txt)) found.push(`[슬랙 검색: ${q}]\n${txt.slice(0, 2500)}`);
        } catch (e) { if (e && ['not_in_manifest', 'approval_required', 'consent_required', 'needs_reauth', 'server_not_connected'].includes(e.code)) throw e; }
      }
    }
    if (isAsana(d)) {
      try {
        const r = await LIVE.mcp.callTool(ASANA.server, 'get_task_stories', { task_id: d.asana_gid, created_after: new Date(Date.now() - 2 * 86400000).toISOString().replace(/\.\d+Z$/, 'Z'), limit: 30 });
        const p = r && r.payload; const st = Array.isArray(p) ? p : p && Array.isArray(p.data) ? p.data : [];
        if (st.length) found.push('[아사나 활동]\n' + st.map((s) => `- ${s.created_at ? s.created_at.slice(0, 16) : ''} ${(s.created_by && s.created_by.name) || ''}: ${String(s.text || '').slice(0, 300)}`).join('\n'));
      } catch (e) { /* 아사나 활동 없이 진행 */ }
    }
    const tr = LIVE.track[d.id] || {};
    if (safeUrl(d.result_url)) found.push(`[산출물 링크] ${d.result_url}`);
    if (tr.updated && tr.updated >= since && Array.isArray(tr.log) && tr.log.length) found.push('[현황판 기록]\n' + tr.log.slice(0, 5).map((l) => `- ${l.at} ${l.text}`).join('\n'));
    let entry;
    if (!found.length) entry = { summary: ['최근 2일 동안 슬랙(공개 채널)·아사나·산출물에서 관련 기록을 찾지 못했습니다.'], signal: '정보 없음', sources: [] };
    else if (!sample) entry = { summary: ['관련 기록 ' + found.length + '묶음을 찾았습니다(요약은 인공지능 연결 시 표시).'], signal: '정보 없음', sources: [], raw: found.join('\n\n').slice(0, 4000) };
    else {
      const v = await sample.json(`아래는 회장 지시 업무와 관련해 최근 2일 동안 슬랙 공개 채널·회의록·아사나·산출물에서 찾은 기록입니다. 이 업무의 진행 상황을 날짜 기준으로 정리하세요.
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
        if (e && ['not_in_manifest', 'approval_required', 'consent_required', 'needs_reauth', 'server_not_connected'].includes(e.code)) { PROGRUN.err = e.code === 'needs_reauth' ? '슬랙 연결이 만료됐습니다. 클로드 설정 → 커넥터에서 다시 연결해 주세요.' : e.code === 'server_not_connected' ? '슬랙 커넥터가 없습니다.' : '슬랙 검색이 이 페이지에서 아직 허용되지 않았습니다. 「지금 수집」을 누르면 허용 창이 뜹니다.'; break; }
      }
      PROGRUN.done++; rerender();
    }
    if (!onlyId) { try { await LIVE.db.doc('progress_meta/' + date).set({ date, state: PROGRUN.err ? 'error' : 'done', finished: new Date().toISOString(), total: targets.length, count: n, err: PROGRUN.err || '' }); } catch (e) { /* 표시만 */ } }
    PROGRUN.state = PROGRUN.err ? 'error' : 'done'; if (onlyId) PROGRUN.one[onlyId] = false;
    if (!PROGRUN.err) toast(onlyId ? '진행 기록을 새로 모았습니다' : `오늘 진행 기록 ${n}건을 모았습니다`);
    rerender();
    if (!onlyId && !force) setTimeout(() => nightReports(false), 2000);
  }
  const srcLabel = { slack: '슬랙', meeting: '회의록', asana: 'Asana', output: '산출물' };
  function progTab(d) {
    const list = progOf(d);
    const busy = PROGRUN.one[d.id] || (PROGRUN.state === 'running');
    return `<div class="dir-prog">
      <div class="row" style="justify-content:space-between"><p class="small muted" style="margin:0">인공지능이 매일 22:00 이후 한 번 슬랙 공개 채널·회의록·산출물·아사나 활동에서 이 업무의 그날 진행을 찾아 날짜별로 올립니다. 인공지능 리포트 추천은 이 기록을 보고 고릅니다.</p>
        <button type="button" class="btn sm" data-act="progOne" data-id="${esc(d.id)}" ${busy || !LIVE.mcp || !LIVE.db ? 'disabled' : ''}>${PROGRUN.one[d.id] ? '모으는 중…' : '이 업무만 지금 모으기'}</button></div>
      ${PROGRUN.err ? `<p class="small dir-err" style="margin:0">${esc(PROGRUN.err)}</p>` : ''}
      <div class="dir-progboard">${list.map((p) => `<article class="dir-progday">
          <header><b class="num">${esc(p.date)}</b><span class="pill ${SIGNAL[p.signal] || ''}">${esc(p.signal || '정보 없음')}</span><span class="small muted">${p.by === 'auto' ? '인공지능 자동 조사' : '직접'} · ${esc(when(p.created))}</span></header>
          <ul>${(p.summary || []).map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
          ${(p.sources || []).length ? `<details><summary class="small">근거 ${p.sources.length}건</summary><ul class="dir-progsrc">${p.sources.map((x) => `<li><span class="pill">${esc(srcLabel[x.type] || x.type || '기록')}</span> <span class="small">${esc(x.where)}${x.who ? ' · ' + esc(x.who) : ''}${x.when ? ' · ' + esc(x.when) : ''}</span><div class="small muted">${esc(x.gist)}</div></li>`).join('')}</ul></details>` : ''}
        </article>`).join('') || `<p class="muted small" style="margin:0">${LIVE.db ? '아직 모은 기록이 없습니다. 매일 22:00 이후 현황판이 열려 있으면 자동으로 모읍니다.' : '클로드 웹 화면으로 열었을 때만 동작합니다.'}</p>`}</div>
    </div>`;
  }
  APP.acts.progOne = (el) => { const d = find(el.dataset.id); if (d) setTimeout(() => dailyCollect(true, d.id), 0); };
  APP.acts.progAll = () => { setTimeout(() => dailyCollect(true), 0); };

  /* 밤 정기 리포트: 22시 진행 기록을 모은 뒤, 기본 인공지능(사내 인공지능)로 필요한 태스크에 리포트를 쓴다 */
  const NIGHT = { state: '', done: 0, total: 0 };
  async function nightReports(force) {
    if (!LIVE.db || NIGHT.state === 'running') return;
    const ai = utilAi();
    if (ai !== 'inhouse' && !(LIVE.cfg && LIVE.cfg.schedule && LIVE.cfg.schedule.nightly_with_claude)) return; /* 클로드 사용량 아끼기: 사내 인공지능일 때만 자동 */
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
        const r = await llm(`당신은 아이센스그룹 윤석범 회장의 업무 보좌 인공지능입니다. 아래 업무의 최근 진행 기록을 보고, 지금 이 업무를 끝까지 해내는 데 가장 도움이 되는 보고서 하나를 쓰세요. 유형은 조언·진행 지휘·계획 세우기·시장 조사·위험 점검 중에서 고르세요(진행 기록에 드러난 막힌 점·위험·빈틈을 우선).
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

  /* ================= 비주얼 리포트 (youtube-visual-manual · output-upgrade 지침을 담아 클로드가 한 장짜리 웹페이지로) ================= */
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
합니다체. "인공지능·도구가 자동으로 해 주는 것 → 사람은 이것만 하면 됩니다 → 그래서 이 불편이 사라집니다" 화법. 어려운 말과 영어 직역은 쉽게 고치고, 용어는 하나로 통일하고 회사 업무에 빗댄 비유를 붙입니다. 단축키는 Windows 먼저, Mac 함께. 사실을 지어내지 말고 추정은 "(추정)". 연봉·임금 정보는 다루지 않습니다. 이해에 도움이 되면 충분히 길게 씁니다.

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
      if (!llm) throw { code: 'no_llm', message: '이 화면에서는 클로드를 부를 수 없습니다(클로드 웹에서 연 현황판에서만 됩니다).' };
      G.stage = '업무 맥락을 모으는 중…'; rerender();
      const ctx = await taskContext(d);
      G.stage = '클로드가 비주얼 페이지를 만드는 중… (1~3분 걸릴 수 있습니다)'; rerender();
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
      const msg = c === 'no_llm' || c === 'no_db' ? (e.message || '클로드 웹에서 연 현황판에서만 만들 수 있습니다.')
        : c === 'truncated' ? '페이지가 너무 길어 중간에 끊겼습니다. 다시 눌러 주세요.'
        : c === 'too_big' ? '페이지가 너무 커서 저장하지 못했습니다. 다시 눌러 주세요.'
        : c === 'not_granted' || c === 'sampling_disabled' ? '이 현황판에서 클로드 사용이 허용되지 않았습니다.'
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
    if (!db) { box.querySelector('.dir-visual-msg').textContent = '클로드 웹에서 연 링크에서만 볼 수 있습니다.'; return; }
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
    if (!LIVE.mcp) { toast('슬랙에 연결된 보기에서만 보낼 수 있습니다'); return; }
    REPSEND[r.id + 'v'] = true;
    setTimeout(async () => {
      try {
        const who = await findSlackId(d);
        if (!who) toast(`슬랙에서 ${d.assignee}님을 찾지 못했습니다`);
        else {
          const lead = String(r.body || '').split('\n').map((x) => x.replace(/^[#\-*\s]+/, '').trim()).filter(Boolean).slice(0, 2).join(' ');
          const msg = `[회장 현황판] ${d.assignee}님, "${r.title || d.title}" 비주얼 리포트를 보냅니다.\n업무: ${d.title}\n${lead ? '요약: ' + lead.slice(0, 200) + '\n' : ''}👉 <${visualLink(r.visual_id)}|비주얼 리포트 열기>`;
          await LIVE.mcp.callTool('Slack', 'slack_send_message', { channel_id: who.id, message: msg });
          await repMark(d, r, { visual_slack_at: new Date().toISOString() });
          toast(`${d.assignee}님께 비주얼 리포트 링크를 보냈습니다`);
        }
      } catch (e) {
        const c = e && e.code;
        toast(c === 'server_unavailable' || c === 'upstream_error' ? '슬랙 응답이 없습니다. 메시지가 갔는지 확인한 뒤 다시 보내 주세요.' : c === 'needs_reauth' ? '슬랙 연결이 만료됐습니다. 클로드 설정 → 커넥터에서 다시 연결해 주세요.' : '슬랙으로 보내지 못했습니다(' + (c || '오류') + ').');
      }
      REPSEND[r.id + 'v'] = false; rerender();
    }, 0);
  };

  /* ================= 태스크 삭제 ================= */
  async function deleteTask(d) {
    if (isAsana(d)) {
      if (!LIVE.mcp) { toast('아사나에 연결된 보기에서만 지울 수 있습니다'); return; }
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
    toast(isAsana(d) ? '아사나에서 태스크를 지웠습니다' : '목록에서 지웠습니다(목업)');
    rerender();
  }
  APP.acts.dirAskDel = (el) => { S.ui.dirDelAsk = el.dataset.id; };
  APP.acts.dirCancelDel = () => { S.ui.dirDelAsk = null; };
  APP.acts.dirDel = (el) => { const d = find(el.dataset.id); if (d && !S.ui.dirDelBusy) setTimeout(() => deleteTask(d), 0); };

  /* ================= 완료 알림 → 확인 → 슬랙 칭찬 ================= */
  const ACK_LAUNCH = '2026-11-03T00:00:00Z'; /* 이 기능 이전에 끝난 일은 조용히 정리된 것으로 본다 */
  const PR = {}; const ACKBUSY = {};
  const isPendingAck = (d) => d.status === '완료' && !d.ack && (isAsana(d) || (!d.src && d.pendingAck));
  const isAcked = (d) => d.status === '완료' && !!d.ack;
  /* 칭찬 초안 글쓰기 지침: 회장이 화면에서 고칠 수 있고(config/praise), 모든 초안에 같이 쓴다 */
  const PRAISE_GUIDE_DEFAULT = `윤석범 회장이 슬랙에서 직원에게 직접 툭 보내는 짧은 칭찬 메시지를 씁니다. 받는 사람이 "회장님이 직접 쓰셨구나" 하고 느껴야 합니다. 인공지능이 쓴 티가 나면 안 됩니다.

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
- 서명("— 윤석범"): 회장 본인 슬랙 계정에서 보내므로 붙이지 않습니다
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
      } else note = `${aiName(utilAi())}를 지금 쓸 수 없어 기본 문구를 넣었습니다 · 「초안 다시 쓰기」를 누르면 클로드로 씁니다`;
    } catch (e) { note = e && e.code === 'not_granted' ? '인공지능 사용이 허용되지 않아 기본 문구를 넣었습니다' : '인공지능 초안 실패 — 기본 문구를 넣었습니다'; }
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
    ACKBUSY[d.id] = send ? '슬랙 보내는 중…' : '정리하는 중…'; rerender();
    let slack = null;
    try {
      if (send) {
        if (!text.trim()) { toast('칭찬 내용을 적어 주세요'); ACKBUSY[d.id] = null; rerender(); return; }
        slack = await findSlackId(d);
        if (!slack) { toast(`슬랙에서 ${d.assignee}님을 찾지 못했습니다. "보내지 않고 확인"을 눌러 정리할 수 있습니다.`); ACKBUSY[d.id] = null; rerender(); return; }
        await LIVE.mcp.callTool('Slack', 'slack_send_message', { channel_id: slack.id, message: text.trim() });
      }
    } catch (e) {
      ACKBUSY[d.id] = null;
      const c = e && e.code;
      const msg = c === 'needs_reauth' ? '슬랙 연결이 만료됐습니다. 클로드 설정 → 커넥터에서 다시 연결해 주세요.'
        : c === 'server_not_connected' ? '슬랙 커넥터가 없습니다. 클로드 설정 → 커넥터에서 추가해 주세요.'
        : ['not_in_manifest', 'approval_required', 'consent_required'].includes(c) ? '이 페이지에서 슬랙 사용이 허용되지 않았습니다. 다시 누르면 허용 창이 뜹니다.'
        : c === 'server_unavailable' || c === 'upstream_error' ? '슬랙 응답이 없습니다. 메시지가 갔는지 슬랙에서 확인한 뒤, 안 갔으면 다시 보내 주세요.'
        : c === 'tool_error' ? '슬랙이 거절했습니다: ' + String(e.message || '').slice(0, 100)
        : '슬랙으로 보내지 못했습니다(' + (c || '오류') + ').';
      PR[d.id] = Object.assign({}, PR[d.id] || {}, { err: msg });
      toast(msg); rerender(); return;
    }
    const at = new Date().toISOString();
    d.ack = at; d.pendingAck = false;
    logAct(send ? 'praise_sent' : 'ack', send ? `${d.assignee}님께 완료 칭찬 보냄 — ${shortT(d)}` : `완료 확인 — ${shortT(d)}`, d.id);
    if (d.src) await writeTrack(d, Object.assign({ ack: at, praise_sent: send ? text.trim() : '' }, slack ? { slack_id: slack.id, slack_label: slack.label } : {}), send ? '슬랙 칭찬 보냄 · 완료 확인' : '완료 확인(칭찬 안 보냄)');
    else addLog(d, send ? '슬랙 칭찬 보냄(목업) · 완료 확인' : '완료 확인');
    ACKBUSY[d.id] = null;
    toast(send ? `${d.assignee}님에게 슬랙으로 칭찬을 보냈고 목록에서 정리했습니다` : '확인하고 목록에서 정리했습니다');
    rerender();
  }

  function ackPanel(list) {
    if (!list.length) return '';
    setTimeout(() => list.slice(0, 3).forEach((d) => draftPraise(d)), 0);
    return `<section class="panel dir-acks" aria-labelledby="h-acks"><div class="row" style="justify-content:space-between"><h3 id="h-acks">완료 알림 <span class="num">${list.length}</span>건</h3><span class="small muted">확인을 누르면 목록에서 정리되고, 담당자에게 슬랙으로 칭찬이 갑니다.</span></div>
      <div class="dir-ack-list">${list.map((d) => {
        const pr = PR[d.id]; const busy = ACKBUSY[d.id]; const noOne = !d.assignee || d.assignee === '미지정';
        const doneAt = d.completed_at ? when(d.completed_at) : '';
        return `<div class="dir-ack" data-id="${esc(d.id)}">
          <div class="dir-ack-h"><span class="dir-ack-ck" aria-hidden="true">✓</span><div style="min-width:0"><button type="button" class="dir-title" data-act="dirOpen" data-id="${esc(d.id)}">${esc(d.title)}</button>
            <div class="small muted"><span class="dir-who">${avatar(d.assignee)}${esc(d.assignee)}${d.org && d.org !== d.assignee ? ' · ' + esc(d.org) : ''}</span>${doneAt ? ' · 완료 ' + esc(doneAt) : ''}${isAsana(d) ? ' · 아사나' : ''}</div></div></div>
          ${noOne ? '<p class="small muted" style="margin:0">담당자가 지정되지 않아 칭찬을 보낼 사람이 없습니다.</p>' : `<label class="f">슬랙 칭찬 <span class="small muted">${pr && pr.state === 'loading' ? '· 인공지능이 초안을 쓰는 중…' : pr && pr.by ? '· ' + esc(pr.by) + ' · 고쳐서 보낼 수 있습니다' : ''}</span><textarea id="pr-${esc(d.id)}" rows="3" ${pr && pr.state === 'loading' ? 'placeholder="초안을 쓰는 중…"' : ''}>${esc(pr && pr.text ? pr.text : pr && pr.state === 'loading' ? '' : fallbackPraise(d))}</textarea></label>`}
          ${pr && pr.err ? `<p class="small dir-err" style="margin:0">${esc(pr.err)}</p>` : ''}
          <div class="row">${busy ? `<span class="small"><span class="dir-spin sm" aria-hidden="true"></span>${esc(busy)}</span>` : `
            ${noOne ? '' : `<button type="button" class="btn primary sm" data-act="ackSend" data-id="${esc(d.id)}" ${pr && pr.state === 'loading' ? 'disabled' : ''}>확인 · 칭찬 보내기</button>`}
            <button type="button" class="btn sm" data-act="ackOnly" data-id="${esc(d.id)}">${noOne ? '확인' : '보내지 않고 확인'}</button>
            ${valueBtn(d, true)}
            ${noOne ? '' : `<button type="button" class="btn sm ${S.ui.prGuide === d.id ? 'on' : ''}" data-act="ackRedraft" data-id="${esc(d.id)}" aria-expanded="${S.ui.prGuide === d.id}">초안 다시 쓰기</button>`}`}</div>
          ${S.ui.prGuide === d.id && !noOne ? `<div class="pr-guide"><div class="row" style="justify-content:space-between"><b>인공지능에게 주는 글쓰기 지침</b><span class="small muted">고치면 저장되어 앞으로 모든 칭찬 초안에 쓰입니다</span></div>
            <textarea id="prg-${esc(d.id)}" class="pr-guide-ta" rows="12" aria-label="칭찬 글쓰기 지침">${esc(S.ui.prGuideText != null ? S.ui.prGuideText : praiseGuide())}</textarea>
            <div class="row"><button type="button" class="btn primary sm" data-act="prRun" data-id="${esc(d.id)}" ${pr && pr.state === 'loading' ? 'disabled' : ''}>${pr && pr.state === 'loading' ? '쓰는 중…' : '이 지침으로 초안 다시 쓰기'}</button><button type="button" class="btn sm" data-act="prReset">기본 지침으로 되돌리기</button><button type="button" class="dir-link" data-act="prClose">지침 닫기</button></div></div>` : ''}
        </div>`;
      }).join('')}</div></section>`;
  }
  const ackText = (el) => { const box = el.closest('.dir-ack'); const ta = box && box.querySelector('textarea'); return ta ? ta.value : ''; };
  APP.acts.ackSend = (el) => { const d = find(el.dataset.id); if (!d) return; const t = ackText(el); PR[d.id] = Object.assign({}, PR[d.id] || {}, { text: t, err: '' }); if (!d.src) { if (!LIVE.mcp) { ackDone(d, t, false).then(() => toast('목업이라 슬랙은 보내지 않고 정리했습니다')); return; } } setTimeout(() => ackDone(d, t, true), 0); };
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

  /* ================= 전사 지시 (전 직원에게 같은 지시 → 개인별 아사나 하위 작업·진행 표시) ================= */
  const CW = { sending: null, confirm: null, delAsk: null, err: {}, busy: {} };
  const CW_ST = { done: ['완료', 'st-done'], doing: ['진행 중', 'st-wait'], todo: ['미착수', ''], none: ['아사나 계정 없음', 'st-hold'], fail: ['생성 실패', 'p-urgent'], draft: ['보내기 전', 'st-hold'] };
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
    if (!LIVE.mcp || !LIVE.db) { toast('아사나·저장소가 연결된 보기에서만 보낼 수 있습니다'); return; }
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
        toast('상위 태스크를 만들지 못했습니다 — ' + errText(e) + (e && (e.code === 'server_unavailable' || e.code === 'upstream_error') ? ' 아사나에 이미 생겼는지 확인한 뒤 다시 보내 주세요.' : ''));
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
    toast(failed.length ? `${todo.length - failed.length}명에게 보냈고 ${failed.length}명은 실패했습니다${unknown ? '(일부는 생겼을 수 있어 다시 보내기 전에 확인합니다)' : ''}` : `${todo.length}명에게 아사나 지시를 보냈습니다`);
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
      <div class="row wide"><button class="btn primary">${c.id ? '초안 저장' : '초안으로 만들기'}</button><button type="button" class="btn sm" data-act="cwCancelForm">취소</button><span class="small muted">초안은 아사나로 보내기 전까지 아무에게도 가지 않습니다.</span></div>
    </form>`;
  }

  function cwPanel() {
    if (!LIVE.db) return `<section class="panel"><h3>전사 지시</h3><p class="muted" style="margin:6px 0 0">전 직원에게 같은 지시를 아사나 하위 작업으로 나눠 보내고 개인별 진행을 보는 화면입니다. 클로드 웹 화면으로 열었을 때만 동작합니다(직원 명단·아사나 연결 필요).</p></section>`;
    const list = cwList();
    const ui = S.ui.cw || {};
    const sel = list.find((c) => c.id === ui.sel) || list[0];
    const head = `<div class="row" style="justify-content:space-between"><div><h3 style="margin:0">전사 지시 ${badge('측정')}</h3><p class="small muted" style="margin:2px 0 0">등록하면 아사나에 상위 태스크 1건과 직원별 하위 작업을 만들어 각자에게 배정합니다. 진행은 직원이 하위 작업을 완료로 표시한 것으로 셉니다.</p></div><button type="button" class="btn primary sm" data-act="cwNew">+ 전사 지시 만들기</button></div>`;
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
    const actions = sending ? `<span class="small"><span class="dir-spin sm" aria-hidden="true"></span> 아사나에 만드는 중 ${sending.done}/${sending.total}명 — 창을 닫지 마세요</span>`
      : draft ? `<button type="button" class="btn primary sm" data-act="cwAskSend" data-id="${esc(c.id)}" ${LIVE.mcp ? '' : 'disabled'}>아사나로 보내기</button><button type="button" class="btn sm" data-act="cwEdit" data-id="${esc(c.id)}">초안 수정</button><button type="button" class="btn sm" data-act="cwAskDel" data-id="${esc(c.id)}">초안 삭제</button>`
      : `<button type="button" class="btn sm" data-act="cwRefresh" data-id="${esc(c.id)}" ${CW.busy[c.id] || !LIVE.mcp ? 'disabled' : ''}>${CW.busy[c.id] ? '불러오는 중…' : '진행 새로고침'}</button>${c.status === 'partial' ? `<button type="button" class="btn primary sm" data-act="cwAskSend" data-id="${esc(c.id)}">실패한 ${(c.failed || []).length}명 다시 보내기</button>` : ''}${parentUrl ? `<a class="btn sm" href="${esc(parentUrl)}" target="_blank" rel="noopener noreferrer">아사나에서 열기 ↗</a>` : ''}`;
    const confirm = CW.confirm === c.id ? `<div class="explain cw-confirm" role="alert"><b>${draft ? `${st.n}명` : `${(c.failed || []).length}명`}에게 아사나 하위 작업을 만듭니다.</b> 각 직원에게 아사나 알림이 갑니다. 보낸 뒤 되돌리려면 아사나에서 직접 지워야 합니다.${st.other ? ` 아사나 계정이 없는 ${rows.filter((r) => r.st === 'none').length}명은 빠집니다.` : ''}${c.due ? '' : ' 기한이 비어 있습니다.'}
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
        <div><span class="small muted">미착수</span><b class="num dir-warn">${draft ? '—' : st.todo}<small>${draft ? '' : '명'}</small></b></div>
        <div><span class="small muted">완료율</span><b class="num">${draft ? '—' : st.pct + '%'}</b></div>
      </div>
      ${draft ? '' : `<details class="cw-depts" ${ui.deptOpen ? 'open' : ''}><summary class="small">부서별 완료율 ${byDept.length}개 부서</summary><div class="dir-org">${byDept.map((r) => `<button type="button" class="dir-org-row" data-act="cwDept" data-v="${esc(r.d)}"><span class="o">${esc(r.d)}</span><span class="bar"><i style="width:${r.pct}%"></i></span><span class="num p">${r.pct}%</span><span class="small muted m">완료 ${r.done}/${r.n}</span></button>`).join('')}</div></details>`}
      <div class="form cw-filters">
        <label class="f">이름·직급 검색<input type="text" id="cwf-q" data-act="cwF" data-k="q" value="${esc(f.q)}" placeholder="예: 김, 팀장"></label>
        <label class="f">부서<select id="cwf-d" data-act="cwF" data-k="d"><option value="">전체</option>${cwDepts().map((d) => `<option ${f.d === d ? 'selected' : ''}>${esc(d)}</option>`).join('')}</select></label>
        <label class="f">상태<select id="cwf-st" data-act="cwF" data-k="st"><option value="">전체</option>${[['notdone', '미완료 전체'], ['done', '완료'], ['doing', '진행 중'], ['todo', '미착수'], ['fail', '생성 실패'], ['none', '아사나 계정 없음']].map(([v, l]) => `<option value="${v}" ${f.st === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="f">정렬<select id="cwf-sort" data-act="cwF" data-k="sort">${[['dept', '부서순'], ['status', '안 한 사람 먼저'], ['name', '이름순'], ['recent', '최근 갱신순']].map(([v, l]) => `<option value="${v}" ${f.sort === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      </div>
      <p class="small muted" style="margin:8px 0 4px">${shown.length}명 표시 / 명단 ${rows.length}명${rows.some((r) => r.st === 'none') ? ` (아사나 계정 없음 ${rows.filter((r) => r.st === 'none').length}명 포함)` : ''}${f.q || f.d || f.st ? ' · <button type="button" class="dir-link" data-act="cwFReset">조건 지우기</button>' : ''}</p>
      <div class="tbl-wrap"><table class="dir-tbl cw-tbl"><thead><tr><th>이름</th><th>부서</th><th>상태</th><th>완료일·최근 갱신</th><th>아사나</th></tr></thead><tbody>
        ${shown.map((r) => `<tr><td data-label="이름"><span class="dir-who">${avatar(r.n)}<span>${esc(r.n)}<small>${esc([r.g, r.p].filter(Boolean).join(' · '))}</small></span></span></td>
          <td data-label="부서">${esc(r.d)}</td>
          <td data-label="상태"><span class="pill ${CW_ST[r.st][1]}">${CW_ST[r.st][0]}</span></td>
          <td data-label="갱신" class="num small">${r.done_at ? '완료 ' + esc(when(r.done_at)) : r.mod ? '갱신 ' + esc(when(r.mod)) : '—'}</td>
          <td data-label="아사나" class="small">${r.url && safeUrl(r.url) ? `<a href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">열기 ↗</a>` : r.task ? `<a href="https://app.asana.com/0/0/${esc(r.task)}" target="_blank" rel="noopener noreferrer">열기 ↗</a>` : '—'}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">조건에 맞는 직원이 없습니다.</td></tr>'}
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
    cwSave(nid, Object.assign(data, { id: nid, code, status: 'draft', created: new Date().toISOString() }), true).then((ok) => { if (ok) { toast('초안을 만들었습니다 — 확인 후 아사나로 보내 주세요'); cwUi({ sel: nid }); rerender(); } });
    cwUi({ form: null });
  };

  /* ================= 지시 개발: 지시 후보를 다듬어 아사나·슬랙으로 지시 ================= */
  const ID_CARDS = [
    ['why', '왜 하는가', '이 일을 해야 하는 이유와 배경'],
    ['goal', '달성 목표', '숫자나 상태로 말하는 목표'],
    ['result', '내야 할 결과', '끝났을 때 손에 쥐는 산출물'],
    ['process', '진행 프로세스', '단계별 진행 순서'],
    ['brand', '브랜딩 기여', '브랜드에 어떻게 보탬이 되는가'],
    ['upgrade', '초고도화', '지금보다 한 차원 높게 하는 방법'],
    ['produce', '초생산', '같은 시간에 몇 배로 만들어 내는 방법'],
    ['agent', '에이전트 위임', '인공지능 에이전트에게 맡길 수 있는 부분']
  ];
  const ID_LABEL = Object.assign({ title: '지시 제목', body: '업무 설명', subs: '아사나 하위 태스크' }, Object.fromEntries(ID_CARDS.map((c) => [c[0], c[1]])));
  const APPS = [['claude', '클로드', 'https://claude.ai/new?q='], ['gpt', '지피티', 'https://chatgpt.com/?q='], ['gemini', '재미나이', 'https://gemini.google.com/app?q=']];
  const IDEA = { local: null, recs: null, modal: null, fill: {}, send: {}, confirm: null, shown: null, scroll: {}, delAsk: null };
  const stableStr = (v) => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.keys(x).sort().reduce((o, kk) => { o[kk] = x[kk]; return o; }, {}) : x));
  function ideasMap() {
    if (LIVE.db) return LIVE.ideas || {};
    if (!IDEA.local) {
      const now = new Date().toISOString();
      IDEA.local = {
        i1: { id: 'i1', title: '블랙라벨 신규 가맹점 오픈 체크리스트 표준화', dept: '블랙라벨사업부', assignee: '담당 I', due: dayStr(14), body: '오픈 2주 전부터 당일까지 해야 할 일을 하나의 체크리스트로 정리한다', cards: { why: '오픈 때마다 빠지는 항목이 달라 초기 매출이 흔들림', goal: '오픈 첫 달 매출 편차 30% 축소' }, subs: [{ t: '최근 오픈 5개점 누락 항목 조사' }, { t: '체크리스트 초안 작성' }], status: 'idea', created: now, updated: now },
        i2: { id: 'i2', title: '벌툰 소셜 리뷰 자동 수집 보고', dept: '벌툰사업부', assignee: '담당 J', due: '', body: '', cards: {}, subs: [], status: 'idea', created: now, updated: now }
      };
    }
    return IDEA.local;
  }
  /* 사람 명단: 아사나 직원 명단이 있으면 그것, 없으면 지시 담당자에서 */
  /* 회장 본인도 담당자로 고를 수 있게 맨 앞에 둔다(아사나에는 'me'로 배정) */
  const ME_STAFF = { n: '윤석범', d: '회장', g: '', p: '본인', gid: 'me', me: true };
  let STAFF_C = { src: null, n: -1, list: [] };
  function staffList() {
    const src = LIVE.staff && LIVE.staff.length ? LIVE.staff : null;
    if (src && STAFF_C.src === src) return STAFF_C.list;
    let base;
    if (src) base = src.filter((s) => !s.leave);
    else { const m = new Map(); S.directives.filter((d) => !isGoal(d) && d.assignee && d.assignee !== '미지정').forEach((d) => { if (!m.has(d.assignee)) m.set(d.assignee, { n: d.assignee, d: d.org || '미지정', g: '', p: '', gid: '' }); }); base = [...m.values()]; }
    const me = base.find((s) => s.n === ME_STAFF.n);
    const list = [Object.assign({}, ME_STAFF, me ? { gid: me.gid || 'me' } : {}, { d: '회장', me: true })].concat(base.filter((s) => s.n !== ME_STAFF.n));
    if (src) STAFF_C = { src, list };
    return list;
  }
  const deptsAll = () => [...new Set(staffList().map((s) => s.d).concat(S.directives.filter(isGoal).map((d) => d.org)).filter((x) => x && x !== '미지정'))].sort((a, b) => (b === '회장') - (a === '회장') || a.localeCompare(b, 'ko'));
  const staffOf = (n) => staffList().find((s) => s.n === n);
  /* ---------- 사람 고르기: 입력해서 찾는 칸 (이름·부서·직급·초성, ↑↓·Enter·Esc) ---------- */
  const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
  const cho = (s) => String(s || '').replace(/[가-힣]/g, (c) => CHO[Math.floor((c.charCodeAt(0) - 0xAC00) / 588)]);
  const PP = {};
  function picker(o) {
    PP[o.key] = { list: o.list, empty: o.empty || '', act: o.act || '', data: o.data || {}, load: !!o.load, pri: o.pri || '', none: o.none || '', unit: o.unit || '' };
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
    scored.sort((a, b) => a[1] - b[1] || (!q ? (b[0].me ? 1 : 0) - (a[0].me ? 1 : 0) : 0) || (reg.pri ? (b[0].d === reg.pri) - (a[0].d === reg.pri) : 0) || a[0].n.localeCompare(b[0].n, 'ko'));
    return scored.map((x) => x[0]);
  }
  function ppOpen(inp, q) {
    const reg = PP[inp.dataset.ppk]; if (!reg) return;
    const ul = inp.parentNode.querySelector('.pp-list');
    const all = ppMatches(reg, q); const hits = all.slice(0, 60);
    ul.innerHTML = (reg.empty && !String(q || '').trim() ? `<li role="option" data-v="" class="pp-empty">${esc(reg.empty)}</li>` : '')
      + hits.map((s) => `<li role="option" data-v="${esc(s.n)}"${s.me ? ' class="pp-me"' : ''}><b>${esc(s.n)}${s.me ? ' <small>(나)</small>' : ''}</b><span class="small muted">${esc([s.d, s.g].filter(Boolean).join(' · '))}</span>${reg.load ? loadPill(s.n) : ''}</li>`).join('')
      + (all.length > hits.length ? `<li class="pp-more small muted" aria-disabled="true">${all.length - hits.length}${reg.unit || '명'} 더 있습니다 — 더 입력해 좁혀 주세요</li>` : '')
      + (!hits.length ? `<li class="pp-more small muted" aria-disabled="true">${esc(reg.none || '맞는 사람이 없습니다')}</li>` : '');
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
  document.addEventListener('scroll', (e) => { const t = e.target; if (t && t.classList && t.classList.contains('dir-pane-body') && S.ui.idOpen) IDEA.scroll[S.ui.idOpen + '|' + ((IDEA.step || {})[S.ui.idOpen] || 1)] = t.scrollTop; }, true);

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
아래 지시의 「${ID_LABEL[k]}」 칸에 들어갈 새 제안 3가지를 서로 다른 방향으로 써 주세요.${k === 'subs' ? ' 각 제안은 아사나 하위 태스크 3~7개 목록입니다(각 30자 이내, 동사로 끝냄).' : ' 각 제안은 2~5문장 또는 짧은 목록입니다.'} 지금 칸에 있는 내용과 겹치지 않게 하세요.

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
  const aiErr = (e) => (e && e.code === 'no_llm' ? '이 화면에서는 인공지능을 부를 수 없습니다(클로드 웹에서 연 현황판에서만 됩니다). 아래 앱 단추로 이어서 이야기할 수 있습니다.' : e && e.code === 'not_granted' ? '인공지능 사용이 허용되지 않았습니다. 허용 창에서 허용한 뒤 다시 눌러 주세요.' : '제안을 만들지 못했습니다(' + ((e && e.code) || '오류') + '). 다시 눌러 주세요.');

  async function ideaFill(id) {
    const x = ideasMap()[id]; if (!x || IDEA.fill[id]) return;
    IDEA.fill[id] = { busy: true }; rerender();
    try {
      const { llm } = await manualLLM(utilAi());
      if (!llm) throw { code: 'no_llm' };
      const empty = ID_CARDS.filter(([k]) => !String((x.cards || {})[k] || '').trim()).map((c) => c[0]);
      const v = await llm.json(`${ID_RULES}
아래 지시의 빈 칸을 채워 주세요. 이미 채워진 칸은 그대로 두고 그 내용과 맞게 씁니다.
채울 칸: ${empty.map((k) => k + '(' + ID_LABEL[k] + ')').join(', ')}${String(x.body || '').trim() ? '' : ', body(업무 설명: 담당자가 읽고 바로 시작할 수 있게 4~8문장)'}${(x.subs || []).length ? '' : ', subs(아사나 하위 태스크 3~6개, 각 30자 이내)'}
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

  async function ideaRecs(dept, who) {
    if (IDEA.recGen && IDEA.recGen.busy) return;
    const G = IDEA.recGen = { busy: true, err: '', start: Date.now() }; rerender();
    const hk = recKey(dept || '', who || ''); const prof = profileOf(hk);
    try {
      const { llm, used } = await manualLLM(utilAi());
      if (!llm) throw { code: 'no_llm' };
      const st = who ? staffOf(who) : null; if (st && !dept) dept = st.d;
      const line = (d) => `- ${shortT(d)} (${d.assignee}, ${d.status}${noDue(d) ? '' : ', 기한 ' + d.due_at})`;
      const goalsOf = (dp) => S.directives.filter((d) => isGoal(d) && isOpen(d) && (!dp || d.org === dp)).slice(0, 30).map((d) => `- [${d.org}] ${d.title} (진척 ${d.pct}% / 계획 ${d.plan}%)`).join('\n');
      let target, ctx;
      if (who) {
        const l = loadOf(who);
        target = `${who}${st && st.g ? ' ' + st.g : ''}님(${dept || '부서 미정'}) 한 사람에게 맡길 새 지시 아이디어 5가지를 추천하세요. 이 사람의 부서 목표를 앞당기고 지금 하는 일과 겹치지 않는 것을 고르세요. 업무 부하가 ${l.label}(진행 중 ${l.tasks.length}건)이니 ${l.lv === 'hi' ? '가볍고 짧게 끝낼 수 있는 것 위주로' : '알맞은 크기로'} 고르세요. dept는 "${dept || ''}", who는 "${who}"로 적으세요.`;
        ctx = `${who}님이 지금 하는 지시:\n${l.tasks.map(line).join('\n') || '(없음)'}\n${dept || ''} 부서 목표:\n${goalsOf(dept) || '(없음)'}`;
      } else if (dept) {
        const ppl = staffList().filter((s) => s.d === dept);
        target = `${dept}에 맡길 새 지시 아이디어 5가지를 추천하세요. 부서 목표 중 늦은 것을 앞당기거나 아무도 맡지 않은 빈틈을 메우는 것을 먼저 고르세요. 담당은 아래 명단에서 일이 덜 몰린 사람으로 고르세요. dept는 "${dept}"로 적으세요.`;
        ctx = `${dept} 부서 목표:\n${goalsOf(dept) || '(없음)'}\n${dept} 진행 중 지시:\n${S.directives.filter((d) => !isGoal(d) && isOpen(d) && d.org === dept).slice(0, 20).map(line).join('\n') || '(없음)'}\n${dept} 명단과 부하:\n${ppl.map((s) => `- ${s.n}${s.g ? ' ' + s.g : ''}: ${loadOf(s.n).label}(진행 중 ${loadOf(s.n).tasks.length}건)`).join('\n') || '(명단 없음)'}`;
      } else {
        target = '회장이 지금 각 부서·사람에게 내리면 좋을 새 지시 아이디어 5가지를 추천하세요. 전사·부서 목표 중 늦은 것을 앞당기거나 아무도 맡지 않은 빈틈을 메우는 것을 먼저 고르고, 일이 몰린 부서·사람은 피하세요.';
        ctx = `전사·부서 목표:\n${goalsOf('') || '(없음)'}\n진행 중 지시:\n${S.directives.filter((d) => !isGoal(d) && isOpen(d)).slice(0, 30).map(line).join('\n') || '(없음)'}\n부서별 부하:\n${deptsAll().map((dp) => { const ppl = staffList().filter((s) => s.d === dp); return `${dp}: 인원 ${ppl.length}명, 진행 중 지시 ${ppl.reduce((a, s) => a + loadOf(s.n).tasks.length, 0)}건`; }).join('\n') || '(없음)'}`;
      }
      const have = Object.values(ideasMap()).filter((x) => (!dept || x.dept === dept)).map((x) => x.title).join(', ');
      const prev = ((recHist(hk) || {}).batches || []).flatMap((b) => b.items.map((r) => r.title)).slice(0, 40).join(', ');
      const memos = memosOf(hk).concat(who && dept ? memosOf(recKey(dept, '')) : []);
      if (memos.length) { target += ' 아래 「회장 메모」는 회장이 이 대상에게 시키고 싶어 직접 적어 둔 것입니다. 메모를 가장 먼저 구체적인 지시로 만들고(메모 하나당 하나), 남는 자리는 메모와 다른 방향으로 채우세요.'; ctx = `회장 메모(직접 등록):\n${memos.slice(0, 15).map((m) => '- ' + String(m.text).replace(/\n+/g, ' ').slice(0, 300)).join('\n')}\n` + ctx; }
      if (prof) { target += ' 아래 「최근 정보 요약」에 나온 요즘 하는 일·막힌 점·잘하는 것·맡기면 좋을 일에 맞춰 고르세요.'; ctx += `\n최근 정보 요약(${String(prof.at).slice(0, 10)} 모음):\n${String(prof.text).slice(0, 2500)}`; }
      const v = await llm.json(`${ID_RULES}
${target} 영어를 쓰지 말고 한국어로만 쓰세요.${have ? `\n이미 후보에 있는 것과 겹치지 않게: ${have}` : ''}${prev ? `\n전에 추천한 것과도 다르게: ${prev}` : ''}
각 항목: title(30자 이내), dept(부서 이름), who(담당 추천, 모르면 빈칸), why(왜 지금 필요한가 60자 이내), first(담당자가 첫 주에 할 일 40자 이내).
JSON 배열만 출력: [{"title":"","dept":"","who":"","why":"","first":""}, ...]

${ctx}`, { modelTier: 'quick', cache: false });
      const arr = (Array.isArray(v) ? v : v && Array.isArray(v.items) ? v.items : []).filter((o) => o && o.title).slice(0, 5).map((o) => ({ title: String(o.title).slice(0, 60), dept: String(o.dept || dept || '').slice(0, 30), who: String(o.who || who || '').slice(0, 20), why: String(o.why || '').slice(0, 120), first: String(o.first || '').slice(0, 80) }));
      if (!arr.length) throw { code: 'empty_completion' };
      const h = recHist(hk) || { key: hk, dept: dept || '', who: who || '', batches: [] };
      recHistSave(hk, Object.assign({}, h, { key: hk, batches: [{ at: new Date().toISOString(), ai: used, prof: !!prof, memo: memos.length, items: arr }].concat(h.batches || []).slice(0, 15) }));
      IDEA.lastTarget = { dept: dept || '', who: who || '' }; S.ui.recTab = 'new';
      logAct('idea_recs', `${who ? who + '님' : dept || '전체'} 인공지능 추천 아이디어 5개 뽑음`, hk);
    } catch (e) { G.err = aiErr(e); }
    G.busy = false; rerender();
  }
  /* ---------- 추천 이력·부서/사람 정보 (대상별로 모아 둠: idearecs/<키>, profiles/<키>) ---------- */
  const recKey = (dept, who) => (who ? 'p:' + who : dept ? 'd:' + dept : 'all');
  const keyId = (k) => { let h = 5381; for (const c of k) h = ((h * 33) ^ c.codePointAt(0)) >>> 0; return 'k' + h.toString(36) + k.length; };
  const recHist = (k) => (LIVE.db ? (LIVE.recHist || {})[k] : (S.dirRecHist || {})[k]) || null;
  function recHistSave(k, doc) {
    if (LIVE.db) { LIVE.recHist = Object.assign({}, LIVE.recHist || {}, { [k]: doc }); LIVE.db.doc('idearecs/' + keyId(k)).set(doc).catch((e) => toast('추천 이력을 저장하지 못했습니다(' + ((e && e.code) || '오류') + ')')); }
    else S.dirRecHist = Object.assign({}, S.dirRecHist || {}, { [k]: doc });
  }
  const profileOf = (k) => (k && k !== 'all' ? (LIVE.db ? (LIVE.profiles || {})[k] : (S.dirProfiles || {})[k]) : null) || null;
  function profSave(k, doc) {
    if (LIVE.db) { LIVE.profiles = Object.assign({}, LIVE.profiles || {}, { [k]: doc }); LIVE.db.doc('profiles/' + keyId(k)).set(doc).catch((e) => toast('정보를 저장하지 못했습니다(' + ((e && e.code) || '오류') + ')')); }
    else S.dirProfiles = Object.assign({}, S.dirProfiles || {}, { [k]: doc });
  }
  const PROF = {};
  const doneRecent = (l) => l.filter((d) => d.status === '완료' && String(d.completed_at || d.updated_at || '').slice(0, 10) >= dayStr(-30));
  function profileRule(kind, name) {
    const mine = S.directives.filter((d) => !isGoal(d) && (kind === 'p' ? d.assignee === name : d.org === name));
    const open = mine.filter(isOpen); const done = doneRecent(mine);
    const goals = kind === 'd' ? S.directives.filter((d) => isGoal(d) && d.org === name && isOpen(d)) : [];
    return `## 요즘 하는 일\n${open.slice(0, 5).map((d) => `- ${shortT(d)} (${d.status}${noDue(d) ? '' : ', 기한 ' + md(d.due_at)})`).join('\n') || '- 기록 없음'}
## 최근 성과\n${done.slice(0, 4).map((d) => `- ${shortT(d)} 완료`).join('\n') || '- 최근 30일 완료 기록 없음'}
## 막힌 점·걱정되는 점\n${open.filter((d) => blockReasons(d).length).slice(0, 3).map((d) => `- ${shortT(d)}: ${blockReasons(d).map((r) => r.t).join(', ')}`).join('\n') || '- 크게 막힌 지시 없음'}
${goals.length ? `## 부서 목표\n${goals.slice(0, 5).map((d) => `- ${d.title} (진척 ${d.pct}%)`).join('\n')}\n` : ''}## 잘하는 것·강점\n- 기록만으로는 판단하기 어렵습니다(최근 정보 모아오기를 인공지능으로 하면 채워집니다)`;
  }
  /* 부서현황판(직원 개인 현황판)에서 가져온 나의 스토리·RnR·목표·루틴업무 — staffinfo/<키> */
  const staffInfo = (n) => (LIVE.staffinfo || {})['p:' + n] || null;
  function staffInfoText(n, short) {
    const si = staffInfo(n); if (!si) return '';
    const L = [`[부서현황판 개인 현황판 — ${n} (${String(si.at).slice(0, 10)} 가져옴)]`];
    if (si.story && si.story.length) L.push('나의 스토리(최근):\n' + si.story.slice(0, short ? 1 : 3).map((p) => `- ${p.date} ${p.title}: ${String(p.text).slice(0, short ? 200 : 700)}`).join('\n'));
    if (si.rnr) L.push(`RnR: ${si.rnr.job || ''}${si.rnr.purpose ? ' / 목적: ' + si.rnr.purpose : ''}\n` + (si.rnr.resp || []).map((r) => `- ${r.area}(${r.w}%)${short ? '' : ': ' + r.detail}`).join('\n'));
    if (si.goals && si.goals.length) L.push('목표:\n' + si.goals.map((g) => `- ${g.id} ${g.name} · 진척 ${g.pct}% / 계획 ${g.plan}%${g.due && g.due !== '—' ? ' · 기한 ' + g.due : ''}${short || !g.why ? '' : ' · 왜: ' + g.why}`).join('\n'));
    if (si.routines && si.routines.length) L.push('루틴업무:\n' + si.routines.slice(0, short ? 6 : 20).map((r) => `- [${r.cyc}] ${r.name}${r.when ? ' (' + r.when + ')' : ''}`).join('\n'));
    return L.join('\n');
  }
  async function collectProfile(kind, name) {
    const k = (kind === 'p' ? 'p:' : 'd:') + name;
    if (PROF[k] && PROF[k].busy) return;
    const P = PROF[k] = { busy: true, err: '', stage: '현황판 기록을 모으는 중…' }; rerender();
    try {
      const since = kstDay(-14);
      const st = kind === 'p' ? staffOf(name) : null;
      const mine = S.directives.filter((d) => !isGoal(d) && (kind === 'p' ? d.assignee === name : d.org === name));
      const found = [];
      if (mine.length) found.push('[현황판 지시]\n' + mine.slice(0, 25).map((d) => `- ${shortT(d)} | ${d.assignee} | ${d.status} | 기한 ${dueFull(d)}${d.memo ? ' | 메모: ' + d.memo.slice(0, 80) : ''}`).join('\n'));
      if (kind === 'd') { const g = S.directives.filter((d) => isGoal(d) && d.org === name); if (g.length) found.push('[부서 목표]\n' + g.slice(0, 12).map((d) => `- ${d.code || ''} ${d.title} (진척 ${d.pct}% / 계획 ${d.plan}%)`).join('\n')); }
      const prog = mine.flatMap((d) => (LIVE.prog[d.id] || []).slice(0, 2).map((p) => `- ${p.date} ${shortT(d)} [${p.signal}]: ${(p.summary || []).join(' / ')}`));
      if (prog.length) found.push('[진행 기록(자동 조사)]\n' + prog.slice(0, 20).join('\n'));
      if (kind === 'p') { const t = staffInfoText(name); if (t) found.push(t); }
      else { const txt = staffList().filter((s) => s.d === name && staffInfo(s.n)).slice(0, 8).map((s) => staffInfoText(s.n, true)).join('\n\n'); if (txt) found.push(txt); }
      const ideas = Object.values(ideasMap()).filter((x) => (kind === 'p' ? x.assignee === name : x.dept === name));
      if (ideas.length) found.push('[보내기 전 지시 후보]\n' + ideas.slice(0, 10).map((x) => `- ${x.title}`).join('\n'));
      let slackN = 0; let note = '';
      if (LIVE.mcp) {
        P.stage = '슬랙 공개 채널에서 최근 2주 기록을 찾는 중…'; rerender();
        const qs = kind === 'p' ? [`from:${name} after:${since}`, `${name} after:${since}`] : [`${name} after:${since}`].concat(staffList().filter((s) => s.d === name).sort((a, b) => loadOf(b.n).score - loadOf(a.n).score).slice(0, 3).map((s) => `from:${s.n} after:${since}`));
        for (const q of qs) {
          try {
            const r = await LIVE.mcp.callTool('Slack', 'slack_search_public', { query: q, response_format: 'concise', limit: 10, sort: 'timestamp' });
            const p = r && r.payload; const txt = typeof p === 'string' ? p : p && typeof p.results === 'string' ? p.results : '';
            if (txt && !/\(0 results\)|No results/i.test(txt)) { found.push(`[슬랙 공개 채널: ${q}]\n${txt.slice(0, 2500)}`); slackN++; }
          } catch (e) { note = '슬랙 검색은 하지 못했습니다(' + ((e && e.code) || '오류') + ')'; if (e && ['not_in_manifest', 'approval_required', 'consent_required'].includes(e.code)) break; }
        }
      } else note = '슬랙에 연결된 보기가 아니라 현황판 기록만 모았습니다';
      P.stage = '인공지능이 정리하는 중…'; rerender();
      const { llm, used } = await manualLLM(utilAi());
      let text = ''; let ai = '기본 정리';
      if (llm && found.length) {
        const who = kind === 'p' ? `${name}님(${st ? st.d : ''}${st && st.g ? ' ' + st.g : ''})` : `${name} 부서`;
        const r = await llm(`아래는 아이센스그룹 ${who}에 관한 최근 기록(부서현황판의 나의 스토리·RnR·목표·루틴업무, 현황판 지시·부서 목표·진행 기록·슬랙 공개 채널)입니다. 회장이 다음 지시를 정할 때 참고하도록 정리하세요.
형식(이 머리말 그대로, 각 1~4줄 목록):
## 요즘 하는 일
## 최근 성과
## 막힌 점·걱정되는 점
## 잘하는 것·강점
## 다음에 맡기면 좋을 일
규칙: 기록에 있는 사실만 쓰고 추측은 "(추정)". 기록이 없으면 "기록 없음". 업무와 관계없는 사생활, 연봉·임금, 인사 처우는 적지 않음. 영어를 쓰지 말고 한국어로만. 짧은 메모 말투.

${found.join('\n\n').slice(0, 9000)}`, { modelTier: 'quick', cache: false });
        text = String((r && r.text) || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim(); ai = aiName(used);
      }
      if (!text) text = profileRule(kind, name);
      profSave(k, { key: k, kind, name, text, at: new Date().toISOString(), n: found.length, slack: slackN, ai, note });
      logAct('profile_collect', `${kind === 'p' ? name + '님' : name} 최근 정보 모아옴`, k);
      toast(`${kind === 'p' ? name + '님' : name} 최근 정보를 모아 정리했습니다`);
    } catch (e) { P.err = aiErr(e); }
    P.busy = false; rerender();
  }
  function infoPanel(kind, name) {
    const k = (kind === 'p' ? 'p:' : 'd:') + name; const pf = profileOf(k); const P = PROF[k] || {};
    const mine = S.directives.filter((d) => !isGoal(d) && (kind === 'p' ? d.assignee === name : d.org === name));
    const open = mine.filter(isOpen); const done = doneRecent(mine);
    const ideas = Object.values(ideasMap()).filter((x) => (kind === 'p' ? x.assignee === name : x.dept === name) && x.status !== 'sent');
    const li = (d) => `<li><button type="button" class="dir-link" data-act="dirOpen" data-id="${esc(d.id)}">${esc(shortT(d))}</button> <span class="small muted">${kind === 'd' ? esc(d.assignee) + ' · ' : ''}${esc(d.status)}${isOpen(d) && !noDue(d) ? ' · ' + dLabel(d) : ''}</span></li>`;
    let head;
    if (kind === 'p') {
      const st = staffOf(name) || {}; const l = loadOf(name);
      const praised = mine.filter((d) => (LIVE.track[d.id] || {}).praise_sent).length;
      head = `<div class="row" style="justify-content:space-between"><div class="dir-who">${avatar(name, true)}<span><b>${esc(name)}</b><small>${esc([st.d, st.g].filter(Boolean).join(' · '))}</small></span></div>${loadPill(name)}</div>
        <div class="id-infokpi"><span>진행 중 <b class="num">${open.length}</b></span><span>기한 지남 <b class="num">${l.over}</b></span><span>최근 30일 완료 <b class="num">${done.length}</b></span><span>보내기 전 후보 <b class="num">${ideas.length}</b></span><span>받은 칭찬 <b class="num">${praised}</b></span> ${badge('측정')}</div>`;
    } else {
      const ppl = staffList().filter((s) => s.d === name).sort((a, b) => loadOf(b.n).score - loadOf(a.n).score);
      const goals = S.directives.filter((d) => isGoal(d) && d.org === name && isOpen(d));
      head = `<div class="row" style="justify-content:space-between"><b class="id-infoname">${esc(name)}</b><span class="small muted">${ppl.length}명</span></div>
        <div class="id-infokpi"><span>진행 중 지시 <b class="num">${open.length}</b></span><span>최근 30일 완료 <b class="num">${done.length}</b></span><span>부서 목표 <b class="num">${goals.length}</b></span><span>보내기 전 후보 <b class="num">${ideas.length}</b></span> ${badge('측정')}</div>
        ${ppl.length ? `<div class="id-pchips">${ppl.map((s) => `<button type="button" class="id-pchip" data-act="tgtSet" data-who="${esc(s.n)}" title="${esc(s.n)}님으로 좁히기">${esc(s.n)}${s.g ? `<small>${esc(s.g)}</small>` : ''}${loadPill(s.n)}</button>`).join('')}</div>` : ''}
        ${goals.length ? `<p class="small" style="margin:8px 0 2px"><b>부서 목표</b></p><ul class="id-infol">${goals.slice(0, 6).map((d) => `<li>${esc(d.code || '')} ${esc(d.title)} <span class="small muted num">${d.pct}%</span></li>`).join('')}</ul>` : ''}`;
    }
    const memoN = memosOf(k).length;
    const actions = `<div class="row id-infoact"><button type="button" class="btn sm" data-act="profCollect" data-kind="${kind}" data-v="${esc(name)}" ${P.busy ? 'disabled' : ''}>${P.busy ? '모으는 중…' : pf ? '↻ 최근 정보 다시 모아오기' : '↻ 최근 정보 모아오기'}</button><button type="button" class="btn primary sm" data-act="idRecRun">${pf || memoN ? `이 정보${memoN ? '·메모' : ''}로 아이디어 5개 뽑기` : '아이디어 5개 뽑기'}</button></div>`;
    const siN = kind === 'p' ? (staffInfo(name) ? 1 : 0) : staffList().filter((s) => s.d === name && staffInfo(s.n)).length;
    const siLine = kind === 'p' && staffInfo(name) ? (() => { const si = staffInfo(name); return `<p class="small muted id-siline">부서현황판: 나의 스토리 ${(si.story || []).length}편 · 목표 ${(si.goals || []).length} · 루틴 ${(si.routines || []).length} · RnR ${si.rnr ? (si.rnr.resp || []).length : 0} <span>(${esc(md(String(si.at).slice(0, 10)))} 가져옴 · 「최근 정보 모아오기」에 함께 들어갑니다)</span></p>`; })()
      : kind === 'd' && siN ? `<p class="small muted id-siline">부서현황판: 이 부서 ${siN}명의 나의 스토리·RnR·목표·루틴이 「최근 정보 모아오기」에 함께 들어갑니다.</p>` : '';
    return `<div class="id-info" role="region" aria-label="${esc(name)} 정보"><div class="id-infohead">${head}</div>${siLine}${actions}
      <div class="id-infogrid"><div class="id-infocols"><div><p class="small"><b>지금 하는 일</b></p><ul class="id-infol">${open.slice(0, 6).map(li).join('') || '<li class="small muted">없음</li>'}</ul></div>
        <div><p class="small"><b>최근 끝낸 일</b></p><ul class="id-infol">${done.slice(0, 5).map(li).join('') || '<li class="small muted">최근 30일 없음</li>'}</ul></div></div>
      <div class="id-prof"><div class="row" style="justify-content:space-between"><b>최근 정보 요약</b>${pf ? `<span class="small muted">${esc(when(pf.at))} 모음 · 근거 ${pf.n}묶음${pf.slack ? `(슬랙 ${pf.slack})` : ''} · ${esc(pf.ai || '')}</span>` : ''}</div>
        ${P.busy ? `<p class="small"><span class="dir-spin sm" aria-hidden="true"></span> ${esc(P.stage || '모으는 중…')}</p>` : pf ? `<div class="dir-repdoc">${mdHtml(pf.text)}</div>${pf.note ? `<p class="small muted" style="margin:4px 0 0">${esc(pf.note)}</p>` : ''}` : '<p class="small muted" style="margin:4px 0">아직 모아 온 정보가 없습니다. 위의 「최근 정보 모아오기」를 누르면 부서현황판의 나의 스토리·RnR·목표·루틴, 현황판 지시·진행 기록·슬랙 공개 채널(최근 2주)을 모아 인공지능이 정리합니다.</p>'}
        ${P.err ? `<p class="small dir-err" style="margin:4px 0 0">${esc(P.err)}</p>` : ''}</div></div>
    </div>`;
  }
  const recItem = (r, b, i, k) => `<li><b>${esc(r.title)}</b><span class="small muted">${esc(r.dept || '부서 미정')}${r.who ? ' · ' + esc(r.who) + ' ' + loadPill(staffOf(r.who) ? r.who : '') : ''}</span><p class="small" style="margin:4px 0">${esc(r.why)}</p>${r.first ? `<p class="small muted" style="margin:0">첫 주: ${esc(r.first)}</p>` : ''}
    <div class="row" style="margin-top:6px">${r.added && ideasMap()[r.added] ? `<span class="pill st-done">✓ 지시 후보에 등록됨</span><button type="button" class="btn sm" data-act="idRecGo" data-id="${esc(r.added)}">열어서 다듬기</button>` : `<button type="button" class="btn primary sm" data-act="idRecAdd" data-k="${esc(k)}" data-b="${b}" data-i="${i}">후보로 등록</button>`}${appLinks(recPrompt(r), ['claude'])}</div></li>`;
  const recPrompt = (r) => `아이센스그룹 회장으로서 ${r.dept || '부서'}${r.who ? ' ' + r.who : ''}에게 「${r.title}」를 지시하려 합니다. 이유: ${r.why}. 이 지시를 어떻게 구체화하면 좋을지(목표·결과물·진행 순서·위험) 같이 생각해 주세요.`;

  async function ideaAsana(x) {
    if (!LIVE.mcp) { toast('아사나에 연결된 화면에서만 보낼 수 있습니다'); return false; }
    const st = staffOf(x.assignee); let ok = false;
    IDEA.send[x.id] = 'asana'; IDEA.confirm = null; rerender();
    try {
      const notes = [String(x.body || '').trim(), '', ...ID_CARDS.filter(([k]) => String((x.cards || {})[k] || '').trim()).map(([k, lab]) => `■ ${lab}\n${String(x.cards[k]).trim()}`), '', '회장 현황판 「지시 개발」에서 보낸 지시입니다. 진행하면서 댓글로 결과를 남기고, 끝나면 완료로 표시해 주세요.'].join('\n').replace(/\n{3,}/g, '\n\n').trim();
      const task = { name: st && st.me ? `[회장 할일] ${x.title}` : `[업무지시] ${x.title} — ${x.assignee}${st && st.g ? ' ' + st.g : ''}`, project_id: ASANA.project, section_id: ASANA.sec['진행'], notes };
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
      logAct('directive_asana', `「${x.title}」 아사나로 지시(${x.assignee || '미배정'})`, gid);
      toast(`아사나에 지시를 만들었습니다${subs.length ? ` · 하위 태스크 ${subOk}/${subs.length}개` : ''}${st && st.gid ? '' : ' (담당자 아사나 계정을 못 찾아 미배정)'}`);
      fetchAsana(true); ok = true;
    } catch (e) { toast('아사나로 보내지 못했습니다 — ' + errText(e)); }
    IDEA.send[x.id] = null; rerender(); return ok;
  }
  const slackDraft = (x) => {
    const c = x.cards || {}; const line = (lab, v) => (String(v || '').trim() ? `\n• ${lab}: ${String(v).trim().replace(/\n+/g, ' ').slice(0, 220)}` : '');
    return `[회장 지시] ${x.assignee}님, 새 업무를 부탁드립니다.\n*${x.title}*${line('왜', c.why)}${line('목표', c.goal)}${line('결과물', c.result)}${x.due ? `\n• 기한: ${x.due}` : ''}${x.sent && x.sent.asana_gid ? `\n👉 아사나: https://app.asana.com/0/${ASANA.project}/${x.sent.asana_gid}` : ''}\n궁금한 점은 편하게 물어봐 주세요.`;
  };
  async function ideaSlack(x, msg) {
    if (!LIVE.mcp) { toast('슬랙에 연결된 보기에서만 보낼 수 있습니다'); return; }
    IDEA.send[x.id] = 'slack'; IDEA.confirm = null; rerender();
    try {
      const who = await findSlackId({ id: 'i' + x.id, assignee: x.assignee });
      if (!who) toast(`슬랙에서 ${x.assignee}님을 찾지 못했습니다`);
      else { await LIVE.mcp.callTool('Slack', 'slack_send_message', { channel_id: who.id, message: msg }); await ideaSave(x.id, { sent: Object.assign({}, (ideasMap()[x.id] || x).sent || {}, { slack_at: new Date().toISOString() }) }); logAct('directive_slack', `「${x.title}」 슬랙으로 지시(${x.assignee})`, x.id); toast(`${x.assignee}님께 슬랙으로 지시를 보냈습니다`); }
    } catch (e) { toast('슬랙으로 보내지 못했습니다(' + ((e && e.code) || '오류') + ')'); }
    IDEA.send[x.id] = null; rerender();
  }

  const statCls = (d) => ({ '완료': 'st-done', '보고대기': 'st-wait', '보류': 'st-hold' }[d.status] || 'st-doing');

  /* ================= 지시 개발 화면 (새 설계: ① 대상 고르기 → 왼쪽 정보 · 오른쪽 ② 아이디어 얻기 / ③ 지시 후보 / 보낸 지시) ================= */
  const tgtOf = () => { const t = Object.assign({ dept: '', who: '' }, S.ui.tgt || {}); return t; };
  function setTgt(t) {
    t = { dept: t.dept || '', who: t.who || '' };
    if (t.who && staffOf(t.who)) t.dept = staffOf(t.who).d;
    S.ui.tgt = t; S.ui.recOld = false; S.ui.ideaWay = S.ui.ideaWay || 'rec';
    if (t.dept || t.who) { const r = (S.ui.tgtRecent || []).filter((x) => !(x.dept === t.dept && x.who === t.who)); r.unshift(t); S.ui.tgtRecent = r.slice(0, 4); }
  }
  const tgtName = (t) => (t.who ? (t.who === ME_STAFF.n ? '나(윤석범)' : t.who + '님') : t.dept || '전체');
  const inTgt = (x, t) => (t.who ? x.assignee === t.who : t.dept ? x.dept === t.dept : true);
  function overallInfo() {
    const all = Object.values(ideasMap());
    const rows = deptsAll().map((dp) => ({ dp, n: S.directives.filter((d) => !isGoal(d) && isOpen(d) && d.org === dp).length, c: all.filter((x) => x.dept === dp && x.status !== 'sent').length })).filter((r) => r.n || r.c).sort((a, b) => b.n - a.n).slice(0, 12);
    return `<div class="id-info"><b class="id-infoname">전체</b>
      <div class="id-infokpi"><span>진행 중 지시 <b class="num">${S.directives.filter((d) => !isGoal(d) && isOpen(d)).length}</b></span><span>보내기 전 후보 <b class="num">${all.filter((x) => x.status !== 'sent').length}</b></span><span>보낸 지시 <b class="num">${all.filter((x) => x.status === 'sent').length}</b></span> ${badge('측정')}</div>
      <p class="small muted" style="margin:0">위에서 부서나 사람을 고르면, 그 대상이 지금 하는 일과 최근 정보가 여기 나오고 추천도 그 대상에 맞춰 뽑습니다.</p>
      ${rows.length ? `<p class="small" style="margin:6px 0 2px"><b>부서 바로 고르기</b> <span class="muted">· 진행 중 지시 많은 순</span></p><div class="id-pchips">${rows.map((r) => `<button type="button" class="id-pchip" data-act="tgtSet" data-dept="${esc(r.dp)}">${esc(r.dp)}<small>지시 ${r.n}${r.c ? ' · 후보 ' + r.c : ''}</small></button>`).join('')}</div>` : ''}</div>`;
  }
  function targetBar(t) {
    const recent = (S.ui.tgtRecent || []).filter((r) => !(r.who === ME_STAFF.n));
    const on = (d, w) => t.dept === d && t.who === w;
    return `<section class="panel id-target" aria-labelledby="h-tgt">
      <div class="row" style="align-items:baseline;gap:6px 10px"><span class="id-step">1</span><h3 id="h-tgt" style="margin:0">누구에게 지시할까요?</h3><span class="small muted">여기서 고른 대상이 아래 정보·추천·후보 목록에 모두 똑같이 적용됩니다</span></div>
      <div class="id-chips"><button type="button" class="id-tchip me ${on('회장', ME_STAFF.n) ? 'on' : ''}" data-act="tgtSet" data-who="${ME_STAFF.n}" aria-pressed="${on('회장', ME_STAFF.n)}">⭐ 나 (윤석범)</button><button type="button" class="id-tchip ${on('', '') ? 'on' : ''}" data-act="tgtSet" aria-pressed="${on('', '')}">전체</button>${recent.map((r) => `<button type="button" class="id-tchip ${on(r.dept, r.who) ? 'on' : ''}" data-act="tgtSet" data-dept="${esc(r.dept)}" data-who="${esc(r.who)}" aria-pressed="${on(r.dept, r.who)}">${esc(r.who || r.dept)}</button>`).join('')}${recent.length ? '<span class="small muted id-chiphint">← 최근 고른 대상</span>' : ''}</div>
      <div class="form id-tgtf"><label class="f">부서<select id="tg-dept" data-act="tgtF" data-k="dept"><option value="">전체 부서</option>${deptsAll().map((d) => `<option ${t.dept === d ? 'selected' : ''}>${esc(d)}</option>`).join('')}</select></label>
        <label class="f">사람${picker({ key: 'tgt', id: 'tg-who', list: staffList(), pri: t.dept || '', value: t.who || '', empty: t.dept ? '부서 안 누구나' : '누구나', act: 'tgtF', data: { k: 'who' }, load: true, label: '지시할 사람' })}</label></div>
    </section>`;
  }
  /* 직접 등록: 대상(부서·사람·전체)별로 시킬 일을 메모해 두고, 추천이 이 메모를 먼저 참고한다 — memos/<키> */
  const memosOf = (k) => (((LIVE.db ? (LIVE.memos || {})[k] : (S.dirMemos || {})[k]) || {}).items || []);
  function memoSave(k, items) {
    const doc = { key: k, items, at: new Date().toISOString() };
    if (LIVE.db) { LIVE.memos = Object.assign({}, LIVE.memos || {}, { [k]: doc }); LIVE.db.doc('memos/' + keyId(k)).set(doc).catch((e) => toast('메모를 저장하지 못했습니다(' + ((e && e.code) || '오류') + ')')); }
    else S.dirMemos = Object.assign({}, S.dirMemos || {}, { [k]: doc });
  }
  function memoBox(t) {
    const k = recKey(t.dept, t.who); const items = memosOf(k);
    return `<p class="small muted" style="margin:0 0 8px">${esc(tgtName(t))}에게 시킬 일을 생각날 때 메모로 적어 두세요. 「추천받기」가 이 메모를 <b>가장 먼저</b> 참고해서 5개를 구체화합니다. 메모를 바로 지시 후보로 만들 수도 있습니다.</p>
      <div class="id-memoin"><textarea id="memo-in" rows="3" placeholder="예: 상권 분석을 매장별 매출과 같이 보게 하고 싶다 / 다음 달 신규 가맹 상담 대본 손보기" aria-label="${esc(tgtName(t))}에게 시킬 일 메모">${esc(S.ui.memoDraft || '')}</textarea><button type="button" class="btn primary" data-act="memoAdd">메모 등록</button></div>
      ${items.length ? `<ul class="id-memos">${items.map((m) => `<li><div class="t"><span class="id-memotext">${esc(m.text)}</span><span class="small muted">${esc(when(m.at))}${m.made && ideasMap()[m.made] ? ' · 후보로 만듦' : ''}</span></div>
        <div class="row">${S.ui.memoDel === m.id ? `<span class="small">지울까요?</span><button type="button" class="btn sm dir-dangerbtn" data-act="memoDelGo" data-id="${esc(m.id)}">지우기</button><button type="button" class="btn sm" data-act="memoDel" data-id="">취소</button>` : `${m.made && ideasMap()[m.made] ? `<button type="button" class="btn sm" data-act="idRecGo" data-id="${esc(m.made)}">후보 열기</button>` : `<button type="button" class="btn sm" data-act="memoToIdea" data-id="${esc(m.id)}">후보로 만들기</button>`}<button type="button" class="dir-link" data-act="memoDel" data-id="${esc(m.id)}">지우기</button>`}</div></li>`).join('')}</ul>
        <div class="row" style="margin-top:10px"><button type="button" class="btn primary" data-act="idRecRun">메모 ${items.length}개를 참고해 5개 뽑기</button><span class="small muted">결과는 「추천받기」에 나옵니다.</span></div>` : `<p class="small muted" style="margin:10px 0 0">아직 ${esc(tgtName(t))}에게 적어 둔 메모가 없습니다.</p>`}`;
  }
  APP.acts.memoAdd = () => {
    const ta = document.getElementById('memo-in'); const text = (ta ? ta.value : '').trim();
    if (!text) { toast('메모 내용을 적어 주세요'); return; }
    const t = tgtOf(); const k = recKey(t.dept, t.who);
    memoSave(k, [{ id: 'm' + Date.now().toString(36), text: text.slice(0, 1000), at: new Date().toISOString() }].concat(memosOf(k)).slice(0, 50));
    S.ui.memoDraft = ''; logAct('memo_add', `${tgtName(t)}에게 시킬 일 메모 등록`, k); toast('메모를 등록했습니다 — 추천받기가 이 메모를 먼저 참고합니다');
  };
  document.addEventListener('input', (e) => { if (e.target && e.target.id === 'memo-in') S.ui.memoDraft = e.target.value; });
  APP.acts.memoDel = (el) => { S.ui.memoDel = el.dataset.id || null; };
  APP.acts.memoDelGo = (el) => { const t = tgtOf(); const k = recKey(t.dept, t.who); memoSave(k, memosOf(k).filter((m) => m.id !== el.dataset.id)); S.ui.memoDel = null; toast('메모를 지웠습니다'); };
  APP.acts.memoToIdea = (el) => {
    const t = tgtOf(); const k = recKey(t.dept, t.who); const m = memosOf(k).find((x) => x.id === el.dataset.id); if (!m) return;
    const st = staffOf(t.who); const id = 'i' + Date.now().toString(36);
    const first = m.text.split('\n')[0].trim();
    ideaSave(id, { title: first.slice(0, 80), dept: st ? st.d : (t.dept || ''), assignee: st ? st.n : '', due: '', body: m.text, cards: {}, subs: [], status: 'idea', from: 'memo' }, true).then(() => rerender());
    memoSave(k, memosOf(k).map((x) => (x.id === m.id ? Object.assign({}, x, { made: id }) : x)));
    logAct('idea_from_memo', `메모로 지시 후보 「${first.slice(0, 40)}」 만듦`, id);
    S.ui.devTab = 'cand'; S.ui.dirOpen = null; S.ui.idOpen = id; toast('메모로 지시 후보를 만들었습니다 — 오른쪽에서 다듬어 주세요');
  };

  function ideaWays(t) {
    const way = S.ui.ideaWay || 'rec';
    const G = IDEA.recGen || {};
    const k = recKey(t.dept, t.who); const H = recHist(k) || { batches: [] };
    const latest = H.batches[0]; const olds = H.batches.slice(1); const oldN = olds.reduce((a, b) => a + b.items.length, 0);
    const prof = profileOf(k);
    const card = (v, ic, ti, de) => `<button type="button" class="id-way ${way === v ? 'on' : ''}" data-act="ideaWay" data-v="${v}" aria-pressed="${way === v}"><span class="ic" aria-hidden="true">${ic}</span><b>${ti}</b><span class="small muted">${de}</span></button>`;
    let body = '';
    if (way === 'rec') {
      body = `<div class="row id-recrun"><button type="button" class="btn primary" data-act="idRecRun" ${G.busy ? 'disabled' : ''}>${G.busy ? '뽑는 중…' : latest ? '새로 5개 더 뽑기' : `${esc(tgtName(t))}에게 맞는 5개 뽑기`}</button>
          <span class="small muted">${memosOf(k).length ? `<b>직접 등록한 메모 ${memosOf(k).length}개</b>, ` : ''}${t.who ? '지금 하는 일·부하·부서 목표' : t.dept ? '부서 목표·진행 중 지시·사람별 부하' : '전사 목표·진행 중 지시·부서별 부하'}${prof ? `와 <b>${esc(when(prof.at))}에 모은 최근 정보</b>` : ''}를 보고, 지난 추천과 겹치지 않게 고릅니다.</span></div>
        ${G.busy ? '<p class="small" style="margin:8px 0 0"><span class="dir-spin sm" aria-hidden="true"></span> 고르는 중… (10~30초)</p>' : ''}${G.err ? `<p class="small dir-err" style="margin:8px 0 0">${esc(G.err)}</p>` : ''}
        ${latest ? `<div class="row" style="justify-content:space-between;margin:12px 0 4px"><b>추천 ${latest.items.length}개 · ${esc(when(latest.at))}</b><span class="small muted">${esc(aiName(latest.ai || 'claude'))}${latest.memo ? ` · 메모 ${latest.memo}개 반영` : ''}${latest.prof ? ' · 최근 정보 반영' : ''}</span></div><ol class="id-recs">${latest.items.map((r, i) => recItem(r, 0, i, k)).join('')}</ol>` : `<p class="small muted" style="margin:10px 0 0">아직 ${esc(tgtName(t))}에게 뽑은 추천이 없습니다.</p>`}
        ${olds.length ? `<button type="button" class="dir-link" data-act="recOldT" style="margin-top:8px" aria-expanded="${!!S.ui.recOld}">${S.ui.recOld ? '지난 추천 접기' : `지난 추천 ${oldN}개 보기 ›`}</button>${S.ui.recOld ? olds.map((b, bi) => `<p class="small id-recday"><b>${esc(when(b.at))}</b> <span class="muted">· 담음 ${b.items.filter((r) => r.added).length}/${b.items.length}${b.prof ? ' · 최근 정보 반영' : ''}</span></p><ol class="id-recs">${b.items.map((r, i) => recItem(r, bi + 1, i, k)).join('')}</ol>`).join('') : ''}` : ''}`;
    } else if (way === 'tpl') {
      body = `<p class="small muted" style="margin:0 0 8px">틀을 고르면 카드·하위 태스크가 채워진 새 후보가 ${esc(tgtName(t))} 앞으로 만들어집니다. 쓰던 후보는 오른쪽 패널의 「서식으로 저장」으로 여기에 모을 수 있습니다.</p>
        <div class="id-tpls">${tplList().map((tp) => `<div class="id-tpl"><b>${esc(tp.name)}</b>${tp.id.startsWith('tb-') ? '<span class="pill st-hold small">기본</span>' : '<span class="pill st-done small">내 서식</span>'}<span class="small muted">${esc(tp.desc || tp.title || '')}</span>
          <div class="row">${TPL.ask === tp.id ? `<span class="small">지울까요?</span><button type="button" class="btn sm dir-dangerbtn" data-act="tplDel" data-id="${esc(tp.id)}">지우기</button><button type="button" class="btn sm" data-act="tplCancel">취소</button>` : `<button type="button" class="btn primary sm" data-act="tplUse" data-id="${esc(tp.id)}">이 틀로 시작</button>${tp.id.startsWith('tb-') ? '' : `<button type="button" class="dir-link" data-act="tplAskDel" data-id="${esc(tp.id)}">지우기</button>`}`}</div></div>`).join('')}</div>`;
    } else {
      body = memoBox(t);
    }
    return `<div class="id-ways">${card('rec', '🎲', '추천받기', '대상 정보를 보고 맞는 일 5개')}${card('tpl', '📋', '서식에서 시작', '현황 보고·매장 점검 같은 틀')}${card('memo', '✏️', `직접 등록${memosOf(k).length ? ' ' + memosOf(k).length : ''}`, '시킬 일을 메모로 적어 두기')}</div><div class="id-waybody">${body}</div>
      ${way === 'rec' && latest ? `<div class="row" style="margin-top:10px">${appLinks(`아이센스그룹(외식·여가 프랜차이즈 본사) 회장입니다. ${tgtName(t) === '전체' ? '각 부서' : tgtName(t)}에게 내리면 좋을 새 지시를 같이 생각해 주세요. 추천받은 것: ${latest.items.map((r) => r.title).join(', ')}`)}</div>` : ''}`;
  }
  function ideaList(list, sent) {
    const f = S.ui.idf = Object.assign({ sort: 'recent', q: '' }, S.ui.idf || {});
    let l = list.filter((x) => !f.q || [x.title, x.body, x.dept, x.assignee].join(' ').includes(f.q));
    l = l.sort((a, b) => f.sort === 'dept' ? String(a.dept || '힣').localeCompare(String(b.dept || '힣'), 'ko') || String(a.assignee || '').localeCompare(String(b.assignee || ''), 'ko')
      : f.sort === 'who' ? String(a.assignee || '힣').localeCompare(String(b.assignee || '힣'), 'ko')
        : f.sort === 'quality' ? ideaQ(a).score - ideaQ(b).score
          : String(b.updated || '').localeCompare(String(a.updated || '')));
    const nextHint = (x) => { if (sent) return x.sent && x.sent.at ? '아사나 ' + when(x.sent.at) : x.sent && x.sent.slack_at ? '슬랙 ' + when(x.sent.slack_at) : ''; const q = ideaQ(x); return q.miss.length ? '다음: ' + q.miss[0][1] + ' 채우기' : '보낼 준비 됨'; };
    return `<div class="row id-listtools"><label class="small">정렬 <select id="idf-sort" data-act="idF" data-k="sort">${[['recent', '최근 고친 순'], ['quality', '품질 낮은 것 먼저'], ['dept', '부서순'], ['who', '담당자순']].map(([v, lab]) => `<option value="${v}" ${f.sort === v ? 'selected' : ''}>${lab}</option>`).join('')}</select></label><input type="text" id="idf-q" class="id-q" data-act="idF" data-k="q" value="${esc(f.q)}" placeholder="제목·설명 찾기" aria-label="후보 찾기"></div>
      <div class="id-list">${l.map((x) => `<button type="button" class="id-row ${S.ui.idOpen === x.id ? 'on' : ''}" data-act="idOpen" data-id="${esc(x.id)}">
        <span class="t"><b>${esc(x.title)}</b><span class="small muted">${esc(x.assignee ? (x.assignee === ME_STAFF.n ? '나' : x.assignee) : '담당 미정')} · ${esc(x.dept || '부서 미정')}${x.due ? ' · 기한 ' + esc(md(x.due)) : ' · 기한 없음'}</span></span>
        <span class="m">${qPill(ideaQ(x))}<span class="small ${sent ? 'muted' : ideaQ(x).miss.length ? 'dir-warn' : 'ok-t'}">${esc(nextHint(x))}</span><span class="id-go" aria-hidden="true">다듬기 ›</span></span></button>`).join('') || `<p class="muted">${sent ? '아직 보낸 지시가 없습니다.' : '후보가 없습니다. 「아이디어 얻기」에서 추천받거나 서식·직접 등록으로 만들어 보세요.'}</p>`}</div>`;
  }
  function devPanel() {
    const t = tgtOf();
    const all = Object.values(ideasMap()).filter((x) => inTgt(x, t));
    const cand = all.filter((x) => x.status !== 'sent'); const sent = all.filter((x) => x.status === 'sent');
    const tab = S.ui.devTab || 'idea';
    const left = t.who ? infoPanel('p', t.who) : t.dept ? infoPanel('d', t.dept) : overallInfo();
    return `${targetBar(t)}
    <div class="id-cols ${S.ui.infoWide ? 'wide' : ''}">
      <aside class="panel id-left ${S.ui.infoOpen ? 'open' : ''} ${S.ui.infoWide ? 'wide' : ''}" aria-label="${esc(tgtName(t))} 정보"><button type="button" class="id-widebtn" data-act="infoWide" aria-pressed="${!!S.ui.infoWide}" title="${S.ui.infoWide ? '원래 크기로' : '화면 가로 전체로 넓게 보기'}">${S.ui.infoWide ? '⤡ 좁게 보기' : '⤢ 넓게 보기'}</button><button type="button" class="id-infotoggle" data-act="infoT" aria-expanded="${!!S.ui.infoOpen}"><b>${esc(tgtName(t))} 정보</b><span class="small muted">${S.ui.infoOpen ? '접기 ▴' : '펼치기 ▾'}</span></button>${left}</aside>
      <section class="panel id-right">
        <div class="dir-panetabs id-maintab" role="tablist">
          <button type="button" role="tab" data-act="devTab" data-v="idea" aria-selected="${tab === 'idea'}"><span class="id-step sm">2</span>아이디어 얻기</button>
          <button type="button" role="tab" data-act="devTab" data-v="cand" aria-selected="${tab === 'cand'}"><span class="id-step sm">3</span>지시 후보 <span class="num">${cand.length}</span></button>
          <button type="button" role="tab" data-act="devTab" data-v="sent" aria-selected="${tab === 'sent'}">보낸 지시 <span class="num">${sent.length}</span></button>
        </div>
        ${tab === 'idea' ? ideaWays(t) : ideaList(tab === 'sent' ? sent : cand, tab === 'sent')}
      </section>
    </div>`;
  }
  APP.acts.tgtSet = (el) => { setTgt({ dept: el.dataset.dept || '', who: el.dataset.who || '' }); };
  APP.changes.tgtF = (el) => { const t = tgtOf(); if (el.dataset.k === 'dept') setTgt({ dept: el.value, who: t.who && staffOf(t.who) && staffOf(t.who).d === el.value ? t.who : '' }); else setTgt({ dept: t.dept, who: el.value }); };
  APP.acts.devTab = (el) => { S.ui.devTab = el.dataset.v; };
  APP.acts.infoT = () => { S.ui.infoOpen = !S.ui.infoOpen; };
  APP.acts.infoWide = () => { S.ui.infoWide = !S.ui.infoWide; };
  APP.acts.ideaWay = (el) => { S.ui.ideaWay = el.dataset.v; TPL.ask = null; S.ui.memoDel = null; if (el.dataset.v === 'memo') focusLater('#memo-in'); };
  APP.acts.recOldT = () => { S.ui.recOld = !S.ui.recOld; };

  /* ---------- 오른쪽 패널: ① 기본 → ② 다듬기 → ③ 보내기 ---------- */
  const STEP_N = ['', '기본', '다듬기', '보내기'];
  const Q_JUMP = { who: [1, '#id-dlg .id-who .pp-in'], due: [1, '#id-due'], title: [1, '#id-title'], done: [2, '[data-idk="cards.goal"]'], out: [2, '[data-idk="cards.result"]'], why: [2, '[data-idk="cards.why"]'] };
  const stepOf = (x) => (IDEA.step || {})[x.id] || 1;
  const destOf = (x) => { IDEA.dest = IDEA.dest || {}; const st = staffOf(x.assignee); return IDEA.dest[x.id] || (IDEA.dest[x.id] = { asana: true, slack: !!(x.assignee && !(st && st.me)) }); };
  function ideaPane() {
    const x = S.ui.idOpen && ideasMap()[S.ui.idOpen];
    if (!x) { IDEA.shown = null; return ''; }
    document.body.classList.add('dir-lock');
    const enter = IDEA.shown !== x.id; IDEA.shown = x.id;
    const step = stepOf(x);
    queueMicrotask(() => { const b = document.querySelector('.dir-pane-body'); const v = IDEA.scroll[x.id + '|' + step]; if (b) b.scrollTop = v || 0; });
    const wl = x.assignee ? loadOf(x.assignee) : null;
    const dice = (k) => `<button type="button" class="id-dice" data-act="idDice" data-id="${esc(x.id)}" data-k="${k}" title="주사위: 새 제안 3개" aria-label="${esc(ID_LABEL[k])} 새 제안 받기">🎲</button>`;
    const card = ([k, lab, hint]) => `<div class="id-card"><div class="h"><b>${lab}</b><span class="id-saved small" aria-live="polite"></span>${dice(k)}</div><textarea rows="3" data-idk="cards.${k}" data-id="${esc(x.id)}" placeholder="${esc(hint)}" aria-label="${esc(lab)}">${esc((x.cards || {})[k] || '')}</textarea></div>`;
    const sending = IDEA.send[x.id]; const fill = IDEA.fill[x.id] || {};
    const sent = x.sent || {}; const subs = x.subs || []; const subsOk = subs.filter((s) => String(s.t || '').trim());
    const q = ideaQ(x); const st = staffOf(x.assignee); const me = !!(st && st.me);
    const dest = destOf(x);
    let body = '';
    if (step === 1) {
      body = `<div class="id-head"><textarea class="id-title" id="id-title" rows="2" data-idk="title" data-id="${esc(x.id)}" aria-label="지시 제목">${esc(x.title)}</textarea>${dice('title')}<span class="id-saved small" aria-live="polite"></span></div>
        <div class="dir-fields">
          <div class="dir-f id-who"><span class="k">담당</span><div class="v">${picker({ key: 'as-' + x.id, cls: 'dir-inline', list: staffList(), pri: x.dept || '', value: x.assignee || '', empty: '미정', act: 'idSet', data: { id: x.id, k: 'assignee' }, load: true, label: '담당자' })}</div></div>
          <div class="dir-f"><span class="k">업무 부하</span><div class="v">${wl ? `${loadPill(x.assignee)} <span class="small muted">진행 중 ${wl.tasks.length} · 기한 지남 ${wl.over} · 대기 후보 ${wl.ideas}</span>` : '<span class="small muted">담당을 정하면 보입니다</span>'}</div></div>
          <div class="dir-f"><span class="k">부서</span><div class="v"><select class="dir-inline" data-act="idSet" data-id="${esc(x.id)}" data-k="dept" aria-label="부서"><option value="">미정</option>${deptsAll().map((d) => `<option ${x.dept === d ? 'selected' : ''}>${esc(d)}</option>`).join('')}</select></div></div>
          <div class="dir-f"><span class="k">기한</span><div class="v"><input type="date" id="id-due" class="dir-inline" data-act="idSet" data-id="${esc(x.id)}" data-k="due" value="${esc(x.due || '')}" aria-label="기한"></div></div>
        </div>`;
    } else if (step === 2) {
      const moreFilled = ID_CARDS.slice(4).some(([k]) => String((x.cards || {})[k] || '').trim());
      body = `<div class="row" style="justify-content:space-between;margin-bottom:8px"><b>핵심 4장</b>${fill.busy ? '<span class="small"><span class="dir-spin sm" aria-hidden="true"></span>빈 칸을 채우는 중…</span>' : `<button type="button" class="btn sm id-dicebtn" data-act="idFill" data-id="${esc(x.id)}">🎲 빈 칸 한 번에 채우기</button>`}</div>
        ${fill.err ? `<p class="small dir-err" style="margin:0 0 6px">${esc(fill.err)}</p>` : ''}
        <div class="id-cards">${ID_CARDS.slice(0, 4).map(card).join('')}</div>
        <details class="id-more" ${moreFilled || S.ui.idMore ? 'open' : ''}><summary data-act="idMoreT">더 다듬기 4장 (브랜딩 기여 · 초고도화 · 초생산 · 에이전트 위임)</summary><div class="id-cards" style="margin-top:8px">${ID_CARDS.slice(4).map(card).join('')}</div></details>
        <section class="dir-sec"><div class="id-sech"><h4>업무 설명</h4><span class="id-saved small" aria-live="polite"></span>${dice('body')}</div><textarea class="id-body" rows="5" data-idk="body" data-id="${esc(x.id)}" placeholder="담당자가 읽고 바로 시작할 수 있게">${esc(x.body || '')}</textarea></section>`;
    } else {
      const ready = LIVE.mcp && x.title;
      body = `<section class="dir-sec" style="margin-top:0"><div class="id-sech"><h4>아사나 하위 태스크 <span class="num muted">${subs.length}</span></h4><span class="id-saved small" aria-live="polite"></span>${dice('subs')}</div>
          <ul class="id-subs">${subs.map((s, i) => `<li><span class="dir-chk" aria-hidden="true"></span><input type="text" data-idk="sub.${i}.t" data-id="${esc(x.id)}" value="${esc(s.t || '')}" aria-label="하위 태스크 ${i + 1}">${picker({ key: 'sub-' + x.id + '-' + i, list: staffList().filter((p) => p.n !== x.assignee), pri: x.dept || '', value: s.who || '', empty: (x.assignee === ME_STAFF.n ? '나' : x.assignee || '담당') + '와 같음', act: 'idSubWho', data: { id: x.id, i: String(i) }, label: '하위 태스크 ' + (i + 1) + ' 담당' })}<button type="button" class="dir-iconbtn" data-act="idSubDel" data-id="${esc(x.id)}" data-i="${i}" aria-label="하위 태스크 ${i + 1} 지우기">×</button></li>`).join('')}</ul>
          <button type="button" class="dir-link" data-act="idSubAdd" data-id="${esc(x.id)}">＋ 하위 태스크 추가</button></section>
        <section class="dir-sec"><h4>미리 보기</h4><div class="id-preview"><b>${esc(me ? `[회장 할일] ${x.title}` : `[업무지시] ${x.title} — ${x.assignee || '담당 미정'}${st && st.g ? ' ' + st.g : ''}`)}</b><span class="small muted">담당 ${esc(me ? '나' : x.assignee || '미정')} · 기한 ${esc(x.due || '없음')} · 하위 ${subsOk.length}개 · 품질 ${q.score}</span>${q.miss.length ? `<span class="small dir-warn">빠진 것: ${esc(q.miss.map((m) => m[1]).join(', '))} — 그대로 보내도 되지만 채우면 덜 헤맵니다</span>` : ''}</div></section>
        <section class="dir-sec id-dest"><h4>어디로 보낼까요?</h4>
          <div class="row"><label class="id-check ${dest.asana ? 'on' : ''}"><input type="checkbox" data-act="destT" data-id="${esc(x.id)}" data-k="asana" ${dest.asana ? 'checked' : ''}> 아사나에 등록</label><label class="id-check ${dest.slack ? 'on' : ''}"><input type="checkbox" data-act="destT" data-id="${esc(x.id)}" data-k="slack" ${dest.slack ? 'checked' : ''} ${x.assignee ? '' : 'disabled'}> 슬랙으로도 알리기</label></div>
          <p class="small muted" style="margin:6px 0 0">${me ? '나에게 보내는 지시는 슬랙 없이 아사나 「내 작업」에만 넣는 것이 기본입니다.' : x.assignee ? `${esc(x.assignee)}님께 아사나 알림이 가고, 슬랙을 고르면 개인 메시지도 갑니다.` : '담당을 정하지 않으면 아사나에 미배정으로 만듭니다.'}${sent.asana_gid ? ' 이미 아사나로 보낸 적이 있어 또 만들면 중복됩니다.' : ''}</p>
          ${dest.slack && x.assignee ? `<label class="f" style="margin-top:8px">슬랙 메시지 <span class="small muted">보내기 전에 고칠 수 있습니다</span><textarea id="id-slackmsg" class="id-msg" rows="6" data-id="${esc(x.id)}">${esc((IDEA.msg || {})[x.id] != null ? IDEA.msg[x.id] : slackDraft(x))}</textarea></label>` : ''}
          ${ready ? '' : '<p class="small dir-warn" style="margin:6px 0 0">아사나·슬랙에 연결된 화면(클로드 웹에서 연 현황판)에서만 보낼 수 있습니다.</p>'}</section>`;
    }
    const conf = IDEA.confirm && IDEA.confirm.id === x.id && IDEA.confirm.kind === 'send';
    const foot = sending ? `<span class="small"><span class="dir-spin sm" aria-hidden="true"></span>${sending === 'asana' ? '아사나에 만드는 중…' : '슬랙으로 보내는 중…'}</span>`
      : conf ? `<div class="id-sendconf" role="alert"><b>지금 보냅니다: ${[dest.asana ? `아사나 지시 1건${subsOk.length ? `(하위 ${subsOk.length}개)` : ''}` : '', dest.slack && x.assignee ? `슬랙 메시지 1건` : ''].filter(Boolean).join(' + ') || '보낼 곳이 없습니다'}</b><span class="small">보낸 뒤에는 아사나·슬랙에서 직접 지워야 합니다.</span><div class="row"><button type="button" class="btn primary" data-act="sendGo" data-id="${esc(x.id)}" ${dest.asana || (dest.slack && x.assignee) ? '' : 'disabled'}>보내기</button><button type="button" class="btn sm" data-act="idCancel">취소</button></div></div>`
        : `${step > 1 ? `<button type="button" class="btn sm" data-act="idStep" data-id="${esc(x.id)}" data-v="${step - 1}">← 이전</button>` : '<span></span>'}<span class="dir-pane-sp"></span>${step < 3 ? `<button type="button" class="btn primary" data-act="idStep" data-id="${esc(x.id)}" data-v="${step + 1}">다음: ${step + 1} ${STEP_N[step + 1]} →</button>` : `<button type="button" class="btn primary" data-act="sendAsk" data-id="${esc(x.id)}" ${LIVE.mcp && x.title && (dest.asana || (dest.slack && x.assignee)) ? '' : 'disabled'}>${sent.asana_gid || sent.slack_at ? '확인하고 다시 보내기' : '확인하고 보내기'}</button>`}`;
    return `<aside class="dir-pane id-pane${enter ? ' enter' : ''}" role="dialog" aria-label="지시 후보 다듬기" id="id-dlg" tabindex="-1">
      <div class="dir-pane-bar"><b class="id-panetitle">${esc(x.title || '제목 없음')}</b><span class="dir-pane-sp"></span>
        ${sent.asana_gid ? `<a class="dir-iconbtn" href="https://app.asana.com/0/${ASANA.project}/${esc(sent.asana_gid)}" target="_blank" rel="noopener noreferrer">아사나에서 열기 ↗</a>` : ''}
        <button type="button" class="dir-iconbtn" data-act="tplAskSave" data-id="${esc(x.id)}" aria-expanded="${TPL.saveFor === x.id}">서식으로 저장</button>
        <button type="button" class="dir-iconbtn danger" data-act="idAskDel" data-id="${esc(x.id)}">삭제</button>
        <button type="button" class="dir-iconbtn" data-act="idClose" aria-label="패널 닫기" title="닫기">닫기 →|</button></div>
      <div class="id-stepper" role="tablist" aria-label="단계">${[1, 2, 3].map((n) => `<button type="button" role="tab" class="${n === step ? 'on' : n < step ? 'done' : ''}" data-act="idStep" data-id="${esc(x.id)}" data-v="${n}" aria-selected="${n === step}">${n < step ? '✓ ' : ''}${n} ${STEP_N[n]}</button>`).join('')}</div>
      <div class="dir-pane-body">
        ${TPL.saveFor === x.id ? `<div class="explain id-tplsave"><b>이 후보를 서식으로 저장</b><span class="small muted">담당·기한은 빼고 제목·카드·설명·하위 태스크만 저장합니다.</span><div class="row"><input type="text" id="tpl-name" maxlength="40" placeholder="서식 이름(예: 상권 분석 요청)" aria-label="서식 이름"><button type="button" class="btn primary sm" data-act="tplSaveGo" data-id="${esc(x.id)}">저장</button><button type="button" class="btn sm" data-act="tplAskSave" data-id="${esc(x.id)}">취소</button></div></div>` : ''}
        ${IDEA.delAsk === x.id ? `<div class="explain dir-delask" role="alert"><b>이 지시 후보를 지웁니다.</b>${sent.asana_gid ? ' 아사나에 이미 만든 지시는 그대로 남습니다.' : ''}<div class="row" style="margin-top:8px"><button type="button" class="btn sm dir-dangerbtn" data-act="idDel" data-id="${esc(x.id)}">삭제</button><button type="button" class="btn sm" data-act="idCancel">취소</button></div></div>` : ''}
        <div class="row small dir-pane-kind"><span class="pill ${x.status === 'sent' ? 'st-done' : 'st-hold'}">${x.status === 'sent' ? '보낸 지시' : '지시 후보'}</span>${sent.at ? `<span class="muted">아사나 ${esc(when(sent.at))}</span>` : ''}${sent.slack_at ? `<span class="muted">슬랙 ${esc(when(sent.slack_at))}</span>` : ''}</div>
        <div class="dq-bar ${q.lv}"><span class="dq-score num">${q.score}</span><div><b>지시 품질 ${q.label}</b> ${badge('추정')}<div class="row" style="margin-top:4px;gap:6px">${q.miss.length ? `<span class="small muted">빠진 것:</span>${q.miss.map(([k, lab]) => `<button type="button" class="dq-fix" data-act="qGo" data-id="${esc(x.id)}" data-k="${k}">${lab} 채우기 ›</button>`).join('')}` : '<span class="small">담당·기한·완료 조건·산출물이 모두 들어 있습니다</span>'}</div></div></div>
        ${body}
      </div>
      <div class="id-pfoot">${foot}</div>
    </aside>`;
  }
  APP.acts.idStep = (el) => { IDEA.step = IDEA.step || {}; IDEA.step[el.dataset.id] = Math.max(1, Math.min(3, +el.dataset.v)); IDEA.confirm = null; };
  APP.acts.qGo = (el) => { const j = Q_JUMP[el.dataset.k]; if (!j) return; IDEA.step = IDEA.step || {}; IDEA.step[el.dataset.id] = j[0]; IDEA.confirm = null; setTimeout(() => { const e = document.querySelector(j[1]); if (e) { e.scrollIntoView({ block: 'center' }); e.focus(); } }, 30); };
  APP.acts.idMoreT = () => { S.ui.idMore = !S.ui.idMore; };
  APP.acts.destT = (el) => { const x = ideasMap()[el.dataset.id]; if (!x) return; const d = destOf(x); d[el.dataset.k] = el.checked; };
  document.addEventListener('input', (e) => { const t = e.target; if (t && t.id === 'id-slackmsg') { IDEA.msg = IDEA.msg || {}; IDEA.msg[t.dataset.id] = t.value; } });
  APP.acts.sendAsk = (el) => { IDEA.confirm = { id: el.dataset.id, kind: 'send' }; IDEA.delAsk = null; };
  APP.acts.sendGo = (el) => {
    const x = ideasMap()[el.dataset.id]; if (!x || IDEA.send[x.id]) return;
    const d = destOf(x); const edited = (IDEA.msg || {})[x.id];
    IDEA.confirm = null;
    setTimeout(async () => {
      let ok = true;
      if (d.asana) ok = await ideaAsana(x);
      if (ok && d.slack && x.assignee) { const cur = ideasMap()[x.id] || x; await ideaSlack(cur, edited != null && edited.trim() ? edited.trim() : slackDraft(cur)); }
      if (ok) { if (IDEA.msg) delete IDEA.msg[x.id]; S.ui.devTab = 'sent'; rerender(); }
    }, 0);
  };

  function ideaModal() {
    const M = IDEA.modal; if (!M) return '';
    let body = '';
    {
      const x = ideasMap()[M.id];
      body = `<div class="dir-modal-h"><b>🎲 「${esc(ID_LABEL[M.k])}」 새 제안 3개</b><button type="button" class="dir-iconbtn" data-act="idModalClose" aria-label="닫기">×</button></div>
        ${M.busy ? '<p class="small"><span class="dir-spin sm" aria-hidden="true"></span> 제안을 만드는 중…</p>' : ''}${M.err ? `<p class="small dir-err">${esc(M.err)}</p>` : ''}
        ${M.items ? `<ol class="id-recs">${M.items.map((o, i) => `<li>${o.note ? `<span class="small muted">${esc(o.note)}</span>` : ''}${M.k === 'subs' ? `<ul class="small">${o.items.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>` : `<div class="id-sugg">${esc(o.text).replace(/\n/g, '<br>')}</div>`}
          <div class="row" style="margin-top:6px"><button type="button" class="btn primary sm" data-act="idDiceUse" data-i="${i}" data-mode="set">이걸로 바꾸기</button>${M.k === 'title' ? '' : `<button type="button" class="btn sm" data-act="idDiceUse" data-i="${i}" data-mode="add">아래에 덧붙이기</button>`}</div></li>`).join('')}</ol>` : ''}
        <div class="id-chat"><span class="small muted">클로드 앱에서 이어서 이야기하기 — 아래 글이 미리 채워져 열립니다</span><textarea id="id-chatp" rows="3" readonly>${esc(M.prompt || '')}</textarea>
        <div class="row">${appLinks(M.prompt || '')}<button type="button" class="dir-link" data-act="idCopyP">글 복사</button></div></div>
        <div class="row dir-modal-foot"><button type="button" class="btn sm" data-act="idDice" data-id="${esc(M.id)}" data-k="${esc(M.k)}" ${M.busy || !x ? 'disabled' : ''}>🎲 다시 굴리기</button></div>`;
    }
    return `<div class="dir-modal" role="dialog" aria-modal="true"><div class="dir-modal-bg" data-act="idModalClose"></div><div class="dir-modal-box">${body}</div></div>`;
  }

  const idf = (patch) => { S.ui.idf = Object.assign({}, S.ui.idf || {}, patch); };
  APP.acts.dirMain = (el) => { S.ui.dirMain = el.dataset.v; S.ui.dirOpen = null; S.ui.idOpen = null; IDEA.modal = null; window.scrollTo(0, 0); };
  APP.changes.idNewDept = (el) => { const keep = (id) => { const e = document.getElementById(id); return e ? e.value : ''; }; const w = keep('idn-who'); const ws = staffOf(w); S.ui.idNew = { title: keep('idn-title'), body: keep('idn-body'), due: keep('idn-due'), dept: el.value, who: ws && ws.d === el.value ? w : '' }; };
  APP.forms.idNew = (fd) => {
    const g = (n) => (fd.get(n) || '').toString().trim();
    const who = g('who'); const st = staffOf(who);
    const id = 'i' + Date.now().toString(36);
    ideaSave(id, { title: g('title'), dept: st ? st.d : g('dept'), assignee: who, due: /^\d{4}-\d{2}-\d{2}$/.test(g('due')) ? g('due') : '', body: g('body'), cards: {}, subs: [], status: 'idea' }, true).then(() => rerender());
    logAct('idea_new', `지시 후보 「${g('title')}」 등록`, id);
    S.ui.idNew = null; S.ui.devTab = 'cand'; S.ui.dirOpen = null; S.ui.idOpen = id; toast('지시 후보를 등록했습니다 — 오른쪽 카드에서 다듬어 보세요');
  };
  APP.changes.idF = (el) => { idf({ [el.dataset.k]: el.value.trim() }); };
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
  APP.acts.profCollect = (el) => { const kind = el.dataset.kind; const v = el.dataset.v; setTimeout(() => collectProfile(kind, v), 0); };
  APP.acts.idRecRun = () => { const t = tgtOf(); S.ui.devTab = 'idea'; S.ui.ideaWay = 'rec'; setTimeout(() => ideaRecs(t.dept, t.who), 0); };
  APP.acts.idModalClose = () => { IDEA.modal = null; };
  APP.acts.idCopyP = () => { const t = (IDEA.modal || {}).prompt || ''; try { navigator.clipboard.writeText(t).then(() => toast('글을 복사했습니다 — 앱에 붙여 넣으세요'), () => { const a = document.getElementById('id-chatp'); if (a) a.select(); toast('글을 선택했습니다 — 복사 단축키로 복사하세요'); }); } catch (e) { toast('복사하지 못했습니다'); } };
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
    const k = el.dataset.k; const H = recHist(k); const bt = H && H.batches[+el.dataset.b]; const r = bt && bt.items[+el.dataset.i]; if (!r) return;
    const st = staffOf(H.who) || staffOf(r.who); const id = 'i' + Date.now().toString(36);
    ideaSave(id, { title: r.title, dept: st ? st.d : deptsAll().includes(r.dept) ? r.dept : (H.dept || ''), assignee: st ? st.n : '', due: '', body: '', cards: { why: r.why || '' }, subs: r.first ? [{ t: r.first }] : [], status: 'idea', from: 'ai' }, true).then(() => rerender());
    logAct('idea_from_ai', `인공지능 추천 「${r.title}」을 지시 후보로 등록`, id);
    const batches = H.batches.map((b2, bi) => (bi === +el.dataset.b ? Object.assign({}, b2, { items: b2.items.map((x, xi) => (xi === +el.dataset.i ? Object.assign({}, x, { added: id }) : x)) }) : b2));
    recHistSave(k, Object.assign({}, H, { batches }));
    S.ui.idf = Object.assign({}, S.ui.idf || {}, { st: 'idea' });
    toast(`「${r.title}」을 지시 후보 목록에 등록했습니다`);
  };
  APP.acts.idRecGo = (el) => { if (!ideasMap()[el.dataset.id]) return; S.ui.dirOpen = null; S.ui.idOpen = el.dataset.id; focusLater('#id-dlg'); };
  APP.acts.idCancel = () => { IDEA.confirm = null; IDEA.delAsk = null; };
  APP.acts.idAskDel = (el) => { IDEA.delAsk = el.dataset.id; IDEA.confirm = null; };
  APP.acts.idDel = (el) => {
    const id = el.dataset.id; IDEA.delAsk = null; S.ui.idOpen = null;
    if (LIVE.db) LIVE.db.doc('ideas/' + id).delete().then(() => toast('지시 후보를 지웠습니다')).catch((e) => toast('지우지 못했습니다(' + (e && e.code || '오류') + ')'));
    else { delete ideasMap()[id]; toast('지시 후보를 지웠습니다'); }
  };

  /* ================= 메뉴 연결 약속: 활동 기록·받은 항목 (공용 파일 수정 없이 S에 둠) ================= */
  S.activity = S.activity || []; S.inbox = S.inbox || [];
  function logAct(type, text, ref) {
    S.activity.unshift({ id: 'ac' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), at: new Date().toISOString(), menu: 'directives', type, text: String(text).slice(0, 200), ref: ref || '' });
    if (S.activity.length > 300) S.activity.length = 300;
  }

  /* ================= P1-1 지시 품질 점검기 ================= */
  const Q_DONE = /(까지|완료|기준|목표|달성|확정|마감|\d+\s*(%|건|개|명|곳|점|회|원|시간|일))/;
  const Q_OUT = /(보고서|보고|문서|표|시트|엑셀|슬라이드|PPT|발표|링크|페이지|체크리스트|목록|리스트|계획서|기획서|초안|영상|이미지|노션|대시보드|매뉴얼|한 장|1장|캡처|사진)/i;
  const Q_ITEMS = [
    ['who', '담당자', 25, '담당자를 정해 주세요.'],
    ['due', '기한', 20, '언제까지인지 날짜를 넣어 주세요.'],
    ['done', '완료 조건', 20, '무엇이 되면 끝인지 숫자나 상태로 적어 주세요(예: 30곳 점검 완료).'],
    ['out', '산출물 형식', 15, '무엇으로 받을지 적어 주세요(예: 1장 보고서, 시트 링크).'],
    ['why', '이유', 10, '왜 하는지 한 줄 적으면 담당자가 스스로 판단하기 쉽습니다.'],
    ['title', '제목 구체성', 10, '제목을 "무엇을 + 어떻게"로 조금 더 구체적으로 써 주세요.']
  ];
  /* o: {title, who, due, done, out, why} — 글자만 보고 판단하므로 '추정' */
  function quality(o) {
    const t = String(o.title || '').replace(/^\[[^\]]+\]\s*/, '').replace(/\s+—\s+[^—]+$/, '').trim();
    const ok = {
      who: !!(o.who && o.who !== '미지정'), due: !!o.due,
      done: Q_DONE.test(String(o.done || '')), out: Q_OUT.test(String(o.out || '')),
      why: String(o.why || '').trim().length >= 8, title: t.length >= 10
    };
    const score = Q_ITEMS.reduce((a, [k, , w]) => a + (ok[k] ? w : 0), 0);
    return { score, ok, miss: Q_ITEMS.filter(([k]) => !ok[k]), lv: score >= 80 ? 'good' : score >= 60 ? 'mid' : 'low', label: score >= 80 ? '좋음' : score >= 60 ? '보완' : '부족' };
  }
  const ideaQ = (x) => { const c = x.cards || {}; const subs = (x.subs || []).map((s) => s.t).join(' '); return quality({ title: x.title, who: x.assignee, due: x.due, done: [c.goal, c.result, x.body].join(' '), out: [c.result, x.body, subs].join(' '), why: c.why || '' }); };
  const taskQ = (d) => { const det = isAsana(d) ? DET[d.asana_gid] : null; const notes = String((det && det.task && det.task.notes) || d.body || ''); const subs = det && det.task && Array.isArray(det.task.subtasks) ? det.task.subtasks.map((s) => s.name).join(' ') : ''; return quality({ title: d.title, who: d.assignee, due: noDue(d) ? '' : d.due_at, done: [d.title, notes, d.memo].join(' '), out: [d.title, notes, subs].join(' '), why: notes }); };
  const qPill = (q) => `<span class="dq-pill ${q.lv}" title="지시 품질 ${q.score}점 — ${q.miss.length ? '빠진 것: ' + q.miss.map((m) => m[1]).join(', ') : '빠진 것 없음'}">품질 <b class="num">${q.score}</b></span>`;
  function qBox(q, open) {
    return `<details class="dq-box ${q.lv}" ${open ? 'open' : ''}><summary><span class="dq-score num">${q.score}</span><span><b>지시 품질 ${q.label}</b> ${badge('추정')}<small>${q.miss.length ? '빠진 것: ' + esc(q.miss.map((m) => m[1]).join(' · ')) : '담당·기한·완료 조건·산출물이 모두 들어 있습니다'}</small></span></summary>
      <ul>${Q_ITEMS.map(([k, lab, w, hint]) => `<li class="${q.ok[k] ? 'ok' : 'no'}"><span aria-hidden="true">${q.ok[k] ? '✓' : '!'}</span><b>${lab}</b><span class="small muted">${q.ok[k] ? w + '점' : esc(hint)}</span></li>`).join('')}</ul>
      <p class="small muted" style="margin:6px 0 0">글자를 보고 판단한 참고 점수입니다. 담당 25 · 기한 20 · 완료 조건 20 · 산출물 15 · 이유 10 · 제목 10.</p></details>`;
  }

  /* ================= P1-2 지시 서식 모음 (자주 쓰는 지시 틀) ================= */
  const TPL_BASE = [
    { id: 'tb-report', name: '현황 보고 요청', desc: '판단에 필요한 현황을 한 장으로 받기', title: '○○ 현황 1장 보고', body: '현황·문제·제안을 한 장에 정리해 보고해 주세요.', cards: { why: '판단에 필요한 현황을 한눈에 보고 바로 결정하기 위해', goal: '현황·문제·제안이 한 장에 정리되어 바로 결정할 수 있는 상태', result: '1장 보고서(현황 표 + 문제 3가지 + 제안 3가지)', process: '자료 모으기 → 초안 → 팀장 검토 → 회장 보고' }, subs: ['자료 모으기', '보고서 초안 쓰기', '팀장 검토 받기', '회장 보고'] },
    { id: 'tb-check', name: '매장 점검', desc: '매장 운영 수준을 맞추는 점검', title: '○○ 매장 운영 점검', body: '정해진 점검표로 대상 매장을 점검하고 문제 항목의 조치 계획까지 정해 주세요.', cards: { why: '매장마다 다른 운영 수준을 맞추기 위해', goal: '대상 매장 전부 점검 완료, 문제 항목마다 조치 담당·기한 확정', result: '매장별 점검표(시트 링크)와 사진 증빙', process: '점검표 만들기 → 방문 점검 → 문제 정리 → 조치 계획 공유' }, subs: ['점검표 만들기', '매장 방문 점검', '문제 항목 정리', '조치 계획 공유'] },
    { id: 'tb-plan', name: '신규 기획', desc: '실행 여부를 정할 기획안', title: '○○ 기획안 작성', body: '실행할지 결정할 수 있게 목적·대상·일정·위험을 담은 기획안을 만들어 주세요.', cards: { why: '새 기회를 빨리 검토해 실행 여부를 정하기 위해', goal: '실행 여부를 결정할 수 있는 기획안 확정', result: '기획서(목적·대상·예산 추정·일정·위험)', process: '조사 → 초안 → 관련 부서 의견 → 회장 보고' }, subs: ['시장·사례 조사', '기획서 초안', '관련 부서 의견 받기', '회장 보고'] },
    { id: 'tb-data', name: '데이터 정리', desc: '흩어진 자료를 하나의 시트로', title: '○○ 자료 시트로 정리', body: '흩어진 자료를 최신 기준으로 하나의 시트에 정리하고 요약을 붙여 주세요.', cards: { why: '같은 숫자를 여러 곳에서 다르게 보지 않기 위해', goal: '빠진 값 없이 최신 기준으로 정리 완료', result: '정리된 시트 링크 + 요약 3줄', process: '원천 확인 → 정리 → 검증 → 공유' }, subs: ['원천 자료 확인', '시트로 정리', '숫자 검증', '공유와 요약'] },
    { id: 'tb-edu', name: '교육·전파', desc: '새 방식을 모두에게 알리기', title: '○○ 교육 진행', body: '대상 인원이 새 방식을 이해하고 쓸 수 있게 교육해 주세요.', cards: { why: '새 방식을 모두가 같은 수준으로 쓰기 위해', goal: '대상 인원 전원 이수, 간단한 확인 문제로 이해도 확인', result: '교육 자료와 참석 명단', process: '자료 만들기 → 일정 공지 → 교육 → 이해도 확인' }, subs: ['교육 자료 만들기', '일정 공지', '교육 진행', '이해도 확인'] },
    { id: 'tb-ai', name: '인공지능 자동화 위임', desc: '반복 업무를 인공지능에 맡기기', title: '○○ 반복 업무 인공지능 자동화', body: '매주 반복하는 일을 골라 클로드 스킬이나 예약 작업으로 넘겨 주세요.', cards: { why: '반복 업무에 쓰는 시간을 줄이고 결과를 늘 같은 형식으로 받기 위해', goal: '고른 반복 업무가 사람 손 없이 매주 돌아가는 상태', result: '자동화 설정 화면 캡처와 사용 설명 1장', process: '반복 업무 목록 → 자동화할 것 고르기 → 만들기 → 1주 시범 운영', agent: '자료 모으기·정리·초안 쓰기는 인공지능 에이전트에게, 확인과 판단은 사람이' }, subs: ['반복 업무 목록 만들기', '자동화할 것 고르기', '스킬·예약 작업 만들기', '1주 시범 운영 후 보고'] }
  ];
  const TPL = { ask: null };
  const tplList = () => TPL_BASE.concat(Object.values(LIVE.db ? (LIVE.tpls || {}) : (S.dirTpls || {})).sort((a, b) => String(b.created || '').localeCompare(String(a.created || ''))));
  async function tplSave(t) {
    if (LIVE.db) { LIVE.tpls = Object.assign({}, LIVE.tpls || {}, { [t.id]: t }); try { await LIVE.db.doc('tpls/' + t.id).set(t); return true; } catch (e) { toast('서식을 저장하지 못했습니다(' + ((e && e.code) || '오류') + ')'); return false; } }
    S.dirTpls = Object.assign({}, S.dirTpls || {}, { [t.id]: t }); return true;
  }
  APP.acts.tplUse = (el) => {
    const t = tplList().find((x) => x.id === el.dataset.id); if (!t) return;
    const f = tgtOf(); const st = staffOf(f.who);
    const id = 'i' + Date.now().toString(36);
    ideaSave(id, { title: t.title, dept: st ? st.d : (f.dept || ''), assignee: st ? st.n : '', due: '', body: t.body || '', cards: Object.assign({}, t.cards || {}), subs: (t.subs || []).map((x) => ({ t: x })), status: 'idea', from: 'tpl:' + t.id }, true).then(() => rerender());
    logAct('idea_from_tpl', `서식 「${t.name}」로 지시 후보 만듦`, id);
    S.ui.devTab = 'cand'; S.ui.dirOpen = null; S.ui.idOpen = id; toast(`「${t.name}」 서식으로 새 후보를 만들었습니다 — 제목의 ○○를 바꿔 주세요`); focusLater('#id-title');
  };
  APP.acts.tplAskDel = (el) => { TPL.ask = el.dataset.id; };
  APP.acts.tplCancel = () => { TPL.ask = null; };
  APP.acts.tplDel = (el) => {
    const id = el.dataset.id; TPL.ask = null; if (id.startsWith('tb-')) return;
    if (LIVE.db) { const m = Object.assign({}, LIVE.tpls || {}); delete m[id]; LIVE.tpls = m; LIVE.db.doc('tpls/' + id).delete().catch(() => toast('지우지 못했습니다')); } else { const m = Object.assign({}, S.dirTpls || {}); delete m[id]; S.dirTpls = m; }
    toast('서식을 지웠습니다');
  };
  APP.acts.tplAskSave = (el) => { TPL.saveFor = TPL.saveFor === el.dataset.id ? null : el.dataset.id; focusLater('#tpl-name'); };
  APP.acts.tplSaveGo = (el) => {
    const x = ideasMap()[el.dataset.id]; const inp = document.getElementById('tpl-name'); const name = (inp ? inp.value : '').trim();
    if (!x) return; if (!name) { toast('서식 이름을 적어 주세요'); return; }
    const t = { id: 'tu' + Date.now().toString(36), name: name.slice(0, 40), desc: String(x.title || '').slice(0, 60), title: x.title, body: x.body || '', cards: Object.assign({}, x.cards || {}), subs: (x.subs || []).map((s) => s.t).filter(Boolean), created: new Date().toISOString() };
    TPL.saveFor = null;
    tplSave(t).then((ok) => { if (ok) { toast(`「${t.name}」 서식으로 저장했습니다 — 지시 후보 위 「서식 모음」에서 쓸 수 있습니다`); logAct('tpl_save', `지시 서식 「${t.name}」 저장`, t.id); rerender(); } });
  };

  /* ================= P2-1 막힌 곳(병목) 감지 ================= */
  const overDays = (d) => (isOverdue(d) ? days(d.due_at, S.today) : 0);
  function pushCount(d) {
    let n = (d.log || []).filter((l) => /마감일|기한/.test(l.text || '') && /→|변경|미룸|연기/.test(l.text || '')).length;
    const det = isAsana(d) ? DET[d.asana_gid] : null;
    if (det && Array.isArray(det.stories)) n = Math.max(n, det.stories.filter((s) => s.resource_subtype === 'due_date_changed').length);
    return n;
  }
  function blockReasons(d) {
    const r = [];
    if (d.status === '보고대기' && quiet(d) >= 3) r.push({ k: 'wait', w: 3, t: `보고대기 ${quiet(d)}일째` });
    const pc = pushCount(d); if (pc >= 2) r.push({ k: 'push', w: 2 + pc, t: `기한 ${pc}번 미룸` });
    const od = overDays(d); if (od >= 7) r.push({ k: 'over', w: 3 + Math.min(5, Math.floor(od / 7)), t: `기한 ${od}일 지남` });
    else if (od > 0) r.push({ k: 'over', w: 1, t: `기한 ${od}일 지남` });
    if (quiet(d) >= 7 && d.status !== '보고대기') r.push({ k: 'quiet', w: 2 + Math.min(4, Math.floor(quiet(d) / 7)), t: `${quiet(d)}일째 소식 없음` });
    return r;
  }
  const NUDGE = {};
  function nudgeBase(d, rs) {
    const who = d.assignee && d.assignee !== '미지정' ? d.assignee + '님' : '담당자님';
    const k = (rs[0] || {}).k;
    const why = k === 'wait' ? `보고대기로 넘어온 지 ${quiet(d)}일 됐는데 아직 못 봤네요.` : k === 'push' ? '기한이 몇 번 밀렸던데, 걸리는 게 있는 것 같아서요.' : k === 'over' ? `기한이 ${overDays(d)}일 지났어요.` : `${quiet(d)}일째 소식이 없어서요.`;
    return `${who}, ${shortT(d).replace(/\s*\([^)]*\)/g, '')} 어떻게 되고 있어요? ${why} 지금 어디까지 왔는지, 막힌 게 있으면 뭔지 오늘 안에 짧게 알려 줄래요? 도울 게 있으면 바로 말해 주세요.`;
  }
  async function nudgeAI(d, rs) {
    const N = NUDGE[d.id] = Object.assign({}, NUDGE[d.id] || {}, { busy: true, err: '' }); rerender();
    try {
      const { llm, used } = await manualLLM(utilAi());
      if (!llm) throw { code: 'no_llm' };
      const r = await llm(`윤석범 회장이 슬랙에서 직원에게 직접 보내는 짧은 확인 메시지를 씁니다. 인공지능이 쓴 티가 나면 안 됩니다.
- 2~3문장, 120자 안팎. "OO님,"으로 시작.
- 다그치지 말고 담백하게. 무엇이 걸리는지 묻고, 도울 게 있으면 말하라고.
- 언제까지 답을 달라는 말 하나(예: 오늘 안에, 내일 오전까지).
- 상투어("노고", "귀하", "확인 부탁드립니다만"), 느낌표 여러 개, 영어, 서명은 쓰지 않음. 기록에 없는 일은 지어내지 않음.

받는 사람: ${d.assignee} (${d.org})
업무: ${d.title}
상태: ${d.status} · 기한 ${dueFull(d)}
막힌 신호: ${rs.map((x) => x.t).join(', ')}
현황판 메모: ${d.memo || '(없음)'}

메시지 본문만 출력하세요.`, { modelTier: 'quick', cache: false });
      const t = String((r && r.text) || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim().replace(/^["“'`]+|["”'`]+$/g, '').trim();
      if (!t) throw { code: 'empty_completion' };
      Object.assign(N, { text: t, by: aiName(used) + ' 초안' });
    } catch (e) { N.err = e && e.code === 'no_llm' ? '이 화면에서는 인공지능을 부를 수 없어 기본 문구를 그대로 둡니다(클로드 웹에서 연 현황판에서는 인공지능으로 다듬을 수 있습니다).' : aiErr(e); }
    N.busy = false; rerender();
  }
  function blockPanel(list) {
    const items = list.filter(isOpen).map((d) => ({ d, rs: blockReasons(d) })).filter((x) => x.rs.length).map((x) => Object.assign(x, { w: x.rs.reduce((a, r) => a + r.w, 0) })).sort((a, b) => b.w - a.w);
    const cnt = (k) => items.filter((x) => x.rs.some((r) => r.k === k)).length;
    const all = S.ui.blkAll; const shown = all ? items : items.slice(0, 6);
    return `<section class="panel mg-block" aria-labelledby="h-blk"><div class="row" style="justify-content:space-between;align-items:flex-start"><div><h3 id="h-blk" style="margin:0">막힌 곳 먼저 보기 ${badge('측정')}</h3><p class="small muted" style="margin:2px 0 0">보고대기 3일 이상 · 기한 2번 이상 미룸 · 기한 지남 · 7일 넘게 소식 없음. 많이 막힌 순서입니다.</p></div>
      <div class="row mg-blkcnt">${[['wait', '보고대기 장기'], ['push', '반복 연기'], ['over', '기한 지남'], ['quiet', '오래 무소식']].map(([k, l]) => `<span class="pill ${cnt(k) ? 'p-urgent' : 'st-hold'}">${l} <b class="num">${cnt(k)}</b></span>`).join('')}</div></div>
      ${items.length ? `<ul class="mg-blk">${shown.map(({ d, rs }) => { const N = NUDGE[d.id]; const open = N && N.open; return `<li><div class="t"><button type="button" class="dir-title" data-act="dirOpen" data-id="${esc(d.id)}">${esc(shortT(d))}</button><span class="small muted">${esc(d.assignee)} · ${esc(d.org)} · ${esc(d.status)}</span><span class="row mg-flags">${rs.map((r) => `<span class="dir-flag ${r.k === 'quiet' || r.k === 'wait' ? 'warn' : 'crit'}">${esc(r.t)}</span>`).join('')}</span></div>
          <button type="button" class="btn sm ${open ? 'on' : ''}" data-act="nudgeOpen" data-id="${esc(d.id)}" aria-expanded="${!!open}">독촉 문구 초안</button>
          ${open ? `<div class="mg-nudge"><p class="small muted" style="margin:0">이 화면에서는 보내지 않습니다. 고친 뒤 복사해서 슬랙이나 아사나 댓글에 붙여 넣으세요. <span class="pill st-hold">${esc(N.by || '기본 문구')}</span></p>
            <textarea id="ng-${esc(d.id)}" class="mg-nudge-ta" rows="4" aria-label="독촉 문구">${esc(N.text || nudgeBase(d, rs))}</textarea>${N.err ? `<p class="small dir-err" style="margin:0">${esc(N.err)}</p>` : ''}
            <div class="row"><button type="button" class="btn primary sm" data-act="nudgeCopy" data-id="${esc(d.id)}">복사</button><button type="button" class="btn sm" data-act="nudgeAI" data-id="${esc(d.id)}" ${N.busy ? 'disabled' : ''}>${N.busy ? '인공지능이 다듬는 중…' : '인공지능으로 다듬기'}</button>${safeUrl(d.source_url) ? `<a class="btn sm" href="${esc(d.source_url)}" target="_blank" rel="noopener noreferrer">아사나에서 열기 ↗</a>` : ''}</div></div>` : ''}</li>`; }).join('')}</ul>
        ${items.length > 6 ? `<button type="button" class="dir-link" data-act="blkAll">${all ? '6개만 보기' : `모두 보기 (${items.length}건)`}</button>` : ''}` : '<p class="small muted" style="margin:8px 0 0">지금 조건에서 막힌 지시가 없습니다.</p>'}</section>`;
  }
  APP.acts.blkAll = () => { S.ui.blkAll = !S.ui.blkAll; };
  APP.acts.nudgeOpen = (el) => { const N = NUDGE[el.dataset.id] = NUDGE[el.dataset.id] || {}; N.open = !N.open; };
  document.addEventListener('input', (e) => { const t = e.target; if (t && t.classList && t.classList.contains('mg-nudge-ta')) { const id = t.id.slice(3); NUDGE[id] = Object.assign(NUDGE[id] || {}, { text: t.value }); } });
  APP.acts.nudgeAI = (el) => { const d = find(el.dataset.id); if (d) setTimeout(() => nudgeAI(d, blockReasons(d)), 0); };
  APP.acts.nudgeCopy = (el) => {
    const d = find(el.dataset.id); const ta = document.getElementById('ng-' + el.dataset.id); const t = ta ? ta.value : '';
    const done = () => { toast('독촉 문구를 복사했습니다 — 붙여 넣어 보내 주세요'); if (d) logAct('nudge_copy', `독촉 문구 복사 — ${d.assignee} · ${shortT(d)}`, d.id); };
    try { navigator.clipboard.writeText(t).then(done, () => { if (ta) { ta.select(); } toast('글을 선택했습니다 — 복사 단축키로 복사하세요'); }); } catch (e) { if (ta) ta.select(); toast('글을 선택했습니다 — 복사 단축키로 복사하세요'); }
  };

  /* ================= P2-2 담당자별 업무량 지도 (사람 × 주) ================= */
  function loadMap(base) {
    const mon = (t) => { const x = new Date(t + 'T00:00:00'); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x.toISOString().slice(0, 10); };
    const w0 = mon(S.today); const weeks = [0, 1, 2, 3, 4, 5].map((i) => { const x = new Date(w0 + 'T00:00:00'); x.setDate(x.getDate() + 7 * i); return x.toISOString().slice(0, 10); });
    const open = base.filter(isOpen);
    const people = [...new Set(open.map((d) => d.assignee))];
    const col = (d) => (noDue(d) ? 'none' : d.due_at < S.today ? 'past' : weeks.indexOf(mon(d.due_at)) >= 0 ? 'w' + weeks.indexOf(mon(d.due_at)) : 'later');
    const cols = [['past', '지난 기한'], ...weeks.map((w, i) => ['w' + i, i === 0 ? '이번 주' : `${+w.slice(5, 7)}/${+w.slice(8)}주`]), ['later', '그 뒤'], ['none', '기한 없음']];
    const rows = people.map((n) => { const m = {}; open.filter((d) => d.assignee === n).forEach((d) => { const c = col(d); m[c] = (m[c] || 0) + 1; }); return { n, m, tot: open.filter((d) => d.assignee === n).length, peak: Math.max(0, ...weeks.map((w, i) => m['w' + i] || 0)) }; }).sort((a, b) => b.tot - a.tot || a.n.localeCompare(b.n, 'ko'));
    const hot = rows.filter((r) => r.peak >= 3 || (r.m.past || 0) >= 2).length;
    const lv = (v) => (!v ? '' : v >= 3 ? 'h3' : v === 2 ? 'h2' : 'h1');
    return `<details class="panel mg-map" ${S.ui.mapOpen ? 'open' : ''}><summary data-act="mapT"><b>담당자별 업무량 지도</b> <span class="small muted">사람 × 주 · 기한 기준 진행 중 지시 ${open.length}건 · 몰린 사람 ${hot}명</span> ${badge('측정')}</summary>
      <p class="small muted" style="margin:8px 0">칸의 숫자는 그 주에 기한이 돌아오는 진행 중 지시 수입니다. 한 주에 3건 이상이거나 지난 기한이 2건 이상이면 몰린 사람으로 봅니다. 이름을 누르면 그 사람만 봅니다.</p>
      ${rows.length ? `<div class="tbl-wrap"><table class="mg-heat"><thead><tr><th scope="col">담당자</th>${cols.map(([, l]) => `<th scope="col">${l}</th>`).join('')}<th scope="col">합계</th></tr></thead><tbody>
        ${rows.map((r) => `<tr><th scope="row"><button type="button" class="dir-link" data-act="mgWho" data-v="${esc(r.n)}">${esc(r.n)}</button></th>${cols.map(([k]) => `<td class="${lv(r.m[k])}${k === 'past' && r.m[k] ? ' past' : ''}">${r.m[k] || ''}</td>`).join('')}<td class="num"><b>${r.tot}</b></td></tr>`).join('')}</tbody></table></div>` : '<p class="small muted">진행 중인 지시가 없습니다.</p>'}</details>`;
  }
  APP.acts.mapT = () => { S.ui.mapOpen = !S.ui.mapOpen; };

  /* ================= P3-1 완료 지시 → 성과 평가 후보로 보내기 (S.inbox to:'value') ================= */
  const valueSent = (d) => S.inbox.find((i) => i.to === 'value' && i.from === 'directives' && i.payload && i.payload.directive_id === d.id);
  function sendToValue(d) {
    if (valueSent(d) || d.status !== '완료' || isGoal(d)) return;
    const done = String(d.completed_at || d.updated_at || S.today).slice(0, 10);
    S.inbox.unshift({ id: 'ib' + Date.now().toString(36), at: new Date().toISOString(), from: 'directives', to: 'value', kind: 'achievement', title: shortT(d), done: false,
      /* 성과·레벨 약속: est_minutes·actual_minutes·by_agent·output_type·headcount·saved_hours·months 는 모르는 값이라 비워 둠(지어내지 않음) */
      payload: { directive_id: d.id, title: shortT(d), date: done, output_url: safeUrl(d.result_url) || '', source_url: safeUrl(d.source_url) || '', assignee: d.assignee, org: d.org, issued_at: d.issued_at, due_at: noDue(d) ? '' : d.due_at, on_time: noDue(d) ? null : done <= d.due_at, memo: d.memo || '' } });
    logAct('value_candidate', `성과 평가 후보로 보냄 — ${d.assignee} · ${shortT(d)}`, d.id);
    toast(`「${shortT(d)}」을 성과·레벨 메뉴의 평가 후보로 보냈습니다`);
  }
  const valueBtn = (d, sm) => (isGoal(d) || d.status !== '완료' ? '' : valueSent(d) ? `<span class="pill st-done small" title="${esc(when(valueSent(d).at))}">✓ 성과 평가 후보로 보냄</span>` : `<button type="button" class="btn sm${sm ? ' dir-mini' : ''}" data-act="toValue" data-id="${esc(d.id)}">성과 평가 후보로 보내기</button>`);
  APP.acts.toValue = (el) => { const d = find(el.dataset.id); if (d) sendToValue(d); };

  /* ================= P3-2 받은 항목 (S.inbox to:'directives') ================= */
  const MENU_NAME = { ideabank: '아이디어뱅크', today: '오늘 할 일', ideas: '신사업', value: '성과·레벨', ops: '경영 현황', numbers: '내가 보는 숫자', ai: '인공지능 사용', learn: '경영학습' };
  function inboxBox() {
    const items = S.inbox.filter((i) => i.to === 'directives' && !i.done);
    if (!items.length) return '';
    const txt = (i) => { const p = i.payload || {}; return String(p.body || p.summary || p.text || p.desc || '').trim(); };
    return `<section class="panel dir-inbox" aria-labelledby="h-inbox"><div class="row" style="justify-content:space-between"><h3 id="h-inbox" style="margin:0">받은 항목 <span class="num">${items.length}</span>건</h3><span class="small muted">다른 메뉴에서 보낸 지시 초안입니다. 지시 후보로 만들면 지시 개발 탭에서 다듬어 보낼 수 있습니다.</span></div>
      <ul class="dir-inlist">${items.map((i) => `<li><div class="t"><span class="small muted">${esc(MENU_NAME[i.from] || i.from || '다른 메뉴')}에서 · ${esc(when(i.at))}</span><b>${esc(i.title || '(제목 없음)')}</b>${txt(i) ? `<span class="small">${esc(txt(i).slice(0, 160))}${txt(i).length > 160 ? '…' : ''}</span>` : ''}</div>
        <div class="row">${S.ui.inSkip === i.id ? `<span class="small">처리한 것으로 넘길까요?</span><button type="button" class="btn sm" data-act="inSkipGo" data-id="${esc(i.id)}">넘기기</button><button type="button" class="dir-link" data-act="inSkip" data-id="">취소</button>` : `<button type="button" class="btn primary sm" data-act="inToIdea" data-id="${esc(i.id)}">지시 후보로 만들기</button><button type="button" class="btn sm" data-act="inSkip" data-id="${esc(i.id)}">넘기기</button>`}</div></li>`).join('')}</ul></section>`;
  }
  APP.acts.inToIdea = (el) => {
    const i = S.inbox.find((x) => x.id === el.dataset.id); if (!i) return;
    const p = i.payload || {}; const st = staffOf(p.assignee || p.who || '');
    const id = 'i' + Date.now().toString(36);
    ideaSave(id, { title: String(i.title || p.title || '받은 지시 초안').slice(0, 120), dept: st ? st.d : (p.dept || ''), assignee: st ? st.n : '', due: /^\d{4}-\d{2}-\d{2}$/.test(p.due || '') ? p.due : '', body: String(p.body || p.summary || p.text || p.desc || '').slice(0, 2000), cards: Object.assign({}, p.cards || {}, p.why ? { why: String(p.why) } : {}), subs: Array.isArray(p.subs) ? p.subs.slice(0, 8).map((t) => ({ t: String(t.t || t) })) : [], status: 'idea', from: 'inbox:' + (i.from || '') }, true).then(() => rerender());
    i.done = true; i.done_at = new Date().toISOString(); i.result = id;
    logAct('inbox_to_idea', `받은 항목 「${i.title}」을 지시 후보로 만듦`, id);
    S.ui.dirMain = 'dev'; S.ui.dirOpen = null; S.ui.idOpen = id; toast('지시 후보로 만들었습니다 — 오른쪽에서 다듬어 주세요');
  };
  APP.acts.inSkip = (el) => { S.ui.inSkip = el.dataset.id || null; };
  APP.acts.inSkipGo = (el) => { const i = S.inbox.find((x) => x.id === el.dataset.id); S.ui.inSkip = null; if (!i) return; i.done = true; i.done_at = new Date().toISOString(); logAct('inbox_skip', `받은 항목 「${i.title}」 넘김`, i.id); toast('넘겼습니다'); };

  /* ================= P3-3 주간 지시 회고 ================= */
  const RETRO = { busy: false, err: '' };
  const monOf = (t) => { const x = new Date(t + 'T00:00:00'); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x.toISOString().slice(0, 10); };
  const addD = (t, n) => { const x = new Date(t + 'T00:00:00'); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
  const retroMemo = (w) => (LIVE.db ? ((LIVE.retro || {})[w] || {}).memo : ((S.dirRetro || {})[w] || {}).memo) || '';
  function retroSave(w, memo) {
    if (LIVE.db) { LIVE.retro = Object.assign({}, LIVE.retro || {}, { [w]: { memo, at: new Date().toISOString() } }); LIVE.db.doc('retro/' + w).set({ memo, at: new Date().toISOString() }).catch((e) => toast('회고 메모를 저장하지 못했습니다(' + ((e && e.code) || '오류') + ')')); }
    else S.dirRetro = Object.assign({}, S.dirRetro || {}, { [w]: { memo, at: new Date().toISOString() } });
  }
  function retroStats(w) {
    const end = addD(w, 6); const inW = (t) => { t = String(t || '').slice(0, 10); return t >= w && t <= end; };
    const all = S.directives.filter(isOrder);
    const made = all.filter((d) => inW(d.issued_at));
    const done = all.filter((d) => d.status === '완료' && inW(d.completed_at || d.updated_at));
    const onTime = done.filter((d) => !noDue(d) && String(d.completed_at || d.updated_at).slice(0, 10) <= d.due_at).length;
    const acts = S.activity.filter((a) => a.menu === 'directives' && inW(a.at));
    const ac = (t) => acts.filter((a) => a.type === t).length;
    const blocked = all.filter(isOpen).map((d) => ({ d, rs: blockReasons(d) })).filter((x) => x.rs.length).sort((a, b) => b.rs.reduce((s, r) => s + r.w, 0) - a.rs.reduce((s, r) => s + r.w, 0)).slice(0, 3);
    const ideasNew = Object.values(ideasMap()).filter((x) => inW(x.created)).length;
    return { w, end, made, done, onTime, over: all.filter(isOverdue).length, praise: ac('praise_sent'), sentA: ac('directive_asana'), sentS: ac('directive_slack'), ideasNew, blocked };
  }
  function retroBase(st) {
    return `잘된 점: 완료 ${st.done.length}건${st.done.length ? `(기한 안 ${st.onTime}건)` : ''}${st.praise ? `, 칭찬 ${st.praise}번 보냄` : ''}.
아쉬운 점: ${st.blocked.length ? st.blocked.map((x) => `${x.d.assignee} — ${shortT(x.d)}(${x.rs[0].t})`).join(', ') : '크게 막힌 지시 없음'}${st.over ? `, 기한 지난 지시 ${st.over}건` : ''}.
다음 주에 할 것: `;
  }
  async function retroAI(st) {
    RETRO.busy = true; RETRO.err = ''; rerender();
    try {
      const { llm, used } = await manualLLM(utilAi());
      if (!llm) throw { code: 'no_llm' };
      const r = await llm(`윤석범 회장의 한 주 지시 회고 메모를 회장 본인이 쓰는 것처럼 짧게 정리하세요. "잘된 점", "아쉬운 점", "다음 주에 할 것" 세 줄 머리에 각 1~3개 짧은 문장. 아래 기록에 있는 사실만 쓰고, 숫자를 지어내지 마세요. 연봉·임금은 다루지 않습니다. 한국어, 평어체 메모 말투.

기간: ${st.w} ~ ${st.end}
새 지시 ${st.made.length}건, 완료 ${st.done.length}건(기한 안 ${st.onTime}건), 지금 기한 지난 지시 ${st.over}건
지시 후보 새로 ${st.ideasNew}건, 아사나로 지시 ${st.sentA}건, 슬랙으로 지시 ${st.sentS}건, 완료 칭찬 ${st.praise}번
완료한 지시: ${st.done.map((d) => `${d.assignee}·${shortT(d)}`).join(' / ') || '(없음)'}
막힌 지시: ${st.blocked.map((x) => `${x.d.assignee}·${shortT(x.d)}(${x.rs.map((r) => r.t).join(', ')})`).join(' / ') || '(없음)'}`, { modelTier: 'quick', cache: false });
      const t = String((r && r.text) || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
      if (!t) throw { code: 'empty_completion' };
      const cur = retroMemo(st.w).trim();
      retroSave(st.w, cur ? cur + '\n\n' + t : t); RETRO.by = aiName(used) + ' 초안';
    } catch (e) { RETRO.err = e && e.code === 'no_llm' ? '이 화면에서는 인공지능을 부를 수 없습니다. 「기록으로 채우기」로 숫자를 넣고 직접 적어 주세요.' : aiErr(e); }
    RETRO.busy = false; rerender();
  }
  function retroPanel() {
    const w = S.ui.retroW || monOf(S.today); const st = retroStats(w);
    const cur = monOf(S.today); const memo = retroMemo(w);
    const kp = (l, v, cls) => `<div><span class="small muted">${l}</span><b class="num ${cls || ''}">${v}</b></div>`;
    return `<section class="panel mg-retro" aria-labelledby="h-retro"><div class="row" style="justify-content:space-between;align-items:flex-start"><div><h3 id="h-retro" style="margin:0">주간 지시 회고 ${badge('측정')}</h3><p class="small muted" style="margin:2px 0 0">${esc(md(w))} ~ ${esc(md(st.end))} · 이 현황판에서 한 일과 아사나 기록으로 셉니다.</p></div>
      <div class="seg" role="group" aria-label="주 고르기"><button type="button" data-act="retroW" data-v="${addD(w, -7)}">← 이전 주</button><button type="button" data-act="retroW" data-v="${cur}" aria-pressed="${w === cur}">이번 주</button><button type="button" data-act="retroW" data-v="${addD(w, 7)}" ${w >= cur ? 'disabled' : ''}>다음 주 →</button></div></div>
      <div class="cw-kpis mg-kpis">${kp('새 지시', st.made.length + '<small>건</small>')}${kp('완료', st.done.length + '<small>건</small>', 'ok')}${kp('기한 안 완료', st.done.length ? st.onTime + '<small>건</small>' : '—')}${kp('지금 기한 지남', st.over + '<small>건</small>', st.over ? 'dir-crit' : '')}${kp('새 지시 후보', st.ideasNew + '<small>건</small>')}${kp('완료 칭찬', st.praise + '<small>번</small>')}</div>
      ${st.blocked.length ? `<p class="small" style="margin:10px 0 4px"><b>가장 막힌 지시</b></p><ul class="mg-retrolist">${st.blocked.map((x) => `<li><button type="button" class="dir-link" data-act="dirOpen" data-id="${esc(x.d.id)}">${esc(shortT(x.d))}</button> <span class="small muted">${esc(x.d.assignee)} · ${esc(x.rs.map((r) => r.t).join(', '))}</span></li>`).join('')}</ul>` : ''}
      ${st.done.length ? `<details class="mg-retrodone"><summary class="small">이 주에 끝난 지시 ${st.done.length}건</summary><ul class="mg-retrolist">${st.done.map((d) => `<li><button type="button" class="dir-link" data-act="dirOpen" data-id="${esc(d.id)}">${esc(shortT(d))}</button> <span class="small muted">${esc(d.assignee)}</span> ${valueBtn(d, true)}</li>`).join('')}</ul></details>` : ''}
      <label class="f" style="margin-top:10px">회고 메모 <span class="small muted">${RETRO.by ? '· ' + esc(RETRO.by) + ' · ' : ''}칸을 벗어나면 저장됩니다</span><textarea class="retro-ta" data-w="${esc(w)}" rows="6" placeholder="잘된 점 / 아쉬운 점 / 다음 주에 할 것">${esc(memo)}</textarea></label>
      ${RETRO.err ? `<p class="small dir-err" style="margin:4px 0 0">${esc(RETRO.err)}</p>` : ''}
      <div class="row" style="margin-top:8px"><button type="button" class="btn sm" data-act="retroBase" data-w="${esc(w)}">기록으로 채우기</button><button type="button" class="btn sm" data-act="retroAI" data-w="${esc(w)}" ${RETRO.busy ? 'disabled' : ''}>${RETRO.busy ? '인공지능이 정리하는 중…' : '인공지능 회고 초안'}</button></div></section>`;
  }
  document.addEventListener('change', (e) => { const t = e.target; if (t && t.classList && t.classList.contains('retro-ta')) { retroSave(t.dataset.w, t.value); logAct('retro_memo', `${t.dataset.w} 주 지시 회고 메모 저장`, t.dataset.w); } });
  APP.acts.retroW = (el) => { S.ui.retroW = el.dataset.v; RETRO.err = ''; RETRO.by = ''; };
  APP.acts.retroBase = (el) => { const w = el.dataset.w; const cur = retroMemo(w).trim(); retroSave(w, (cur ? cur + '\n\n' : '') + retroBase(retroStats(w))); RETRO.by = '기록으로 채움'; };
  APP.acts.retroAI = (el) => { const st = retroStats(el.dataset.w); setTimeout(() => retroAI(st), 0); };

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
    return `<section class="panel mg-top"><div class="row" style="justify-content:space-between;align-items:flex-start"><div><h3 style="margin:0">지시한 것들 한눈에 ${badge('측정')}</h3><p class="small muted" style="margin:2px 0 0">아사나로 내린 지시(회장 할일 제외)를 사람·부서별로 모아 진행과 이행 지표를 봅니다. 평가 점수는 기록으로 계산한 참고값입니다.</p></div></div>
      <div class="form mg-filters">
        <label class="f">기간<select id="mgf-period" data-act="mgF" data-k="period">${[['30', '최근 30일'], ['90', '최근 90일'], ['180', '최근 6개월'], ['all', '전체']].map(([v, l]) => `<option value="${v}" ${f.period === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="f">부서<select id="mgf-dept" data-act="mgF" data-k="dept"><option value="">전체</option>${depts.map((d) => `<option ${f.dept === d ? 'selected' : ''}>${esc(d)}</option>`).join('')}</select></label>
        <label class="f">담당자${picker({ key: 'mgf', id: 'mgf-who', list: names.map((n) => staffOf(n) || { n, d: (byDept.find((d) => d.assignee === n) || {}).org || '' }), value: f.who, empty: '전체', act: 'mgF', data: { k: 'who' }, load: true, label: '담당자 필터' })}</label>
        <label class="f">상태<select id="mgf-st" data-act="mgF" data-k="st"><option value="">전체</option>${[['open', '미완료'], ['alert', '경보(경과·무응답)'], ...STATUSES.map((s) => [s, s])].map(([v, l]) => `<option value="${esc(v)}" ${f.st === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
      </div>
      ${f.dept || f.who || f.st || f.period !== '90' ? '<p class="small" style="margin:6px 0 0"><button type="button" class="dir-link" data-act="mgFReset">조건 지우기</button></p>' : ''}
      <div class="cw-kpis mg-kpis">
        ${kpi('지시', all.n + '<small>건</small>')}${kpi('진행 중', all.open + '<small>건</small>')}${kpi('완료율', pctTxt(all.rate), 'ok')}${kpi('기한 준수율', pctTxt(all.ontime))}${kpi('평균 처리', all.lead == null ? '—' : all.lead + '<small>일</small>')}${kpi('기한 경과', all.over + '<small>건</small>', all.over ? 'dir-crit' : '')}${kpi('3일 무응답', all.stale + '<small>건</small>', all.stale ? 'dir-warn' : '')}
      </div>
      <div class="mg-graphs">${weekChart(list)}${statusBar(list)}</div>
    </section>
    ${f.who ? '' : blockPanel(list)}
    ${f.who ? '' : retroPanel()}
    ${sel ? `<section class="panel mg-person"><div class="row" style="justify-content:space-between"><div class="dir-who">${avatar(sel.n, true)}<span><b>${esc(sel.n)}</b><small>${esc(sel.d)}${(staffOf(sel.n) || {}).g ? ' · ' + esc(staffOf(sel.n).g) : ''}</small></span></div><div class="row"><span class="mg-grade g${sel.s.grade}">${sel.s.grade}</span><span class="num">${sel.s.score == null ? '—' : sel.s.score + '점'}</span>${badge('추정')}<button type="button" class="dir-iconbtn" data-act="mgWho" data-v="" aria-label="사람 선택 해제">×</button></div></div>
      <div class="mg-meters">${[['성과(완료율)', sel.s.rate], ['성실도(기한 준수)', sel.s.ontime], ['응답성(최근 갱신)', sel.s.resp]].map(([l, v]) => `<div><span class="small">${l}</span><span class="bar"><i style="width:${v || 0}%"></i></span><b class="num small">${pctTxt(v)}</b></div>`).join('')}<div><span class="small">업무 부하</span>${loadPill(sel.n)}<span class="small muted">진행 중 ${sel.load.tasks.length} · 경과 ${sel.load.over}</span></div></div>
      ${sel.s.few ? '<p class="small muted" style="margin:6px 0 0">지시가 3건보다 적어 점수는 참고만 해 주세요.</p>' : ''}
      <div class="mg-eval">${ev.busy ? '<p class="small"><span class="dir-spin sm" aria-hidden="true"></span> 평가 의견을 쓰는 중…</p>' : ev.text ? `<div class="dir-repdoc">${mdHtml(ev.text)}</div><p class="small muted">${esc(aiName(ev.ai || 'claude'))} · ${esc(when(ev.at))} · 기록만 보고 쓴 의견입니다</p>` : ''}${ev.err ? `<p class="small dir-err">${esc(ev.err)}</p>` : ''}
        <button type="button" class="btn sm" data-act="mgEval" data-v="${esc(sel.n)}" ${ev.busy ? 'disabled' : ''}>${ev.text ? '인공지능 평가 의견 다시 받기' : '인공지능 평가 의견 받기'}</button></div></section>` : ''}
    <section class="panel"><div class="row" style="justify-content:space-between"><h3 style="margin:0">사람별 경영지표 · 평가</h3><label class="small">정렬 <select id="mgf-sort" data-act="mgF" data-k="sort">${[['score', '종합 점수'], ['load', '부하 큰 사람'], ['rate', '완료율'], ['name', '이름']].map(([v, l]) => `<option value="${v}" ${f.sort === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>
      <p class="small muted" style="margin:4px 0 8px">종합 = 완료율 40% + 기한 준수율 35% + 응답성 25%(진행 중 지시의 최근 갱신, 하루 늦을 때마다 10점 감점). A 85점 이상 · B 70 · C 55 · D 그 아래. 이름을 누르면 그 사람만 봅니다.</p>
      <div class="tbl-wrap"><table class="dir-tbl mg-tbl"><thead><tr><th>이름</th><th>부하</th><th>지시·완료</th><th>완료율</th><th>기한 준수</th><th>평균 처리</th><th>무응답</th><th>평가</th></tr></thead><tbody>
      ${ppl.map((p) => `<tr class="${f.who === p.n ? 'on' : ''}"><td data-label="이름"><button type="button" class="dir-link dir-who" data-act="mgWho" data-v="${esc(p.n)}">${avatar(p.n)}<span>${esc(p.n)}<small>${esc(p.d)}</small></span></button></td>
        <td data-label="부하">${loadPill(p.n)}</td><td data-label="지시·완료" class="num">${p.s.done}/${p.s.n}</td><td data-label="완료율" class="num">${pctTxt(p.s.rate)}</td><td data-label="기한 준수" class="num">${pctTxt(p.s.ontime)}</td><td data-label="평균 처리" class="num">${p.s.lead == null ? '—' : p.s.lead + '일'}</td><td data-label="무응답" class="num ${p.s.stale ? 'dir-warn' : ''}">${p.s.stale}</td>
        <td data-label="평가"><span class="mg-grade g${p.s.grade}">${p.s.grade}</span> <span class="num small">${p.s.score == null ? '' : p.s.score}</span>${p.s.few ? ' <span class="small muted">표본 적음</span>' : ''}</td></tr>`).join('') || '<tr><td colspan="8" class="muted">조건에 맞는 지시가 없습니다.</td></tr>'}</tbody></table></div></section>
    ${f.who ? '' : loadMap(byDept)}
    ${cws.length && !f.who ? `<section class="panel"><h3 style="margin:0 0 6px">전사 지시 진행</h3><div class="dir-org">${cws.map((c) => { const st = cwStat(cwRows(c)); return `<button type="button" class="dir-org-row" data-act="mgCw" data-v="${esc(c.id)}"><span class="o">${esc(c.title)}</span><span class="bar"><i style="width:${st.pct}%"></i></span><span class="num p">${st.pct}%</span><span class="small muted m">완료 ${st.done}/${st.n}</span></button>`; }).join('')}</div></section>` : ''}
    <section class="panel"><h3 style="margin:0 0 6px">지시 목록 <span class="num muted">${list.length}</span></h3>
      <ul class="mg-list">${list.slice().sort((a, b) => (isOpen(b) - isOpen(a)) || a.due_at.localeCompare(b.due_at)).map((d) => `<li><div class="t"><button type="button" class="dir-title" data-act="dirOpen" data-id="${esc(d.id)}">${esc(shortT(d))}</button><span class="small muted">${esc(d.assignee)} · ${esc(d.org)} · 지시 ${esc(md(d.issued_at))}</span>${alerts(d) ? `<span class="row mg-flags">${alerts(d)}</span>` : ''}</div>
        <div class="p"><span class="bar ${d.status === '완료' ? 'done' : isOverdue(d) ? 'over' : ''}"><i style="width:${STEP[d.status] ?? 10}%"></i></span><span class="small"><span class="pill ${statCls(d)}">${esc(d.status)}</span> <span class="num ${dueCls(d)}">${isOpen(d) ? dLabel(d) : d.completed_at ? '완료 ' + esc(md(String(d.completed_at).slice(0, 10))) : ''}</span></span>${valueBtn(d, true)}</div></li>`).join('') || '<li class="muted">조건에 맞는 지시가 없습니다.</li>'}</ul></section>`;
  }
  APP.changes.mgF = (el) => { const p = { [el.dataset.k]: el.value }; if (el.dataset.k === 'dept') p.who = ''; S.ui.mgf = Object.assign({}, S.ui.mgf || {}, p); };
  APP.acts.mgFReset = () => { S.ui.mgf = { sort: (S.ui.mgf || {}).sort || 'score' }; };
  APP.acts.mgWho = (el) => { S.ui.mgf = Object.assign({}, S.ui.mgf || {}, { who: (S.ui.mgf || {}).who === el.dataset.v ? '' : el.dataset.v }); if (el.dataset.v) setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 0); };
  APP.acts.mgEval = (el) => { const n = el.dataset.v; const f = S.ui.mgf || {}; const since = f.period === 'all' || !f.period ? '' : dayStr(-(+f.period)); const l = S.directives.filter(isOrder).filter((d) => d.assignee === n && (!since || d.issued_at >= since || isOpen(d))); setTimeout(() => personEval(n, personStats(l), l), 0); };
  APP.acts.mgCw = (el) => { S.ui.dirMain = 'task'; S.ui.dirTab = 'cw'; cwUi({ sel: el.dataset.v }); window.scrollTo(0, 0); };

  /* ================= 새 「지시 관리」 메뉴 (orders) — 기획서 「단계 탭 반영본」(11/8 회장 확인) =================
     사람(부서)마다 탭 4개: ① 정보 ② 목표 후보(후보 | 목표 리스트) ③ 목표 관리 ④ 지시.
     목표는 ogoals/<아이디>에 저장(회장만 읽기). 상태: cand(후보) → list(목표 리스트). */
  const OG = { busy: {}, err: {}, chat: {}, send: {}, sync: {}, pm: {}, chg: {}, loc: {}, res: {}, sec: {}, link: {}, msgDraft: {}, linkDraft: {}, proj: { list: null, busy: false, err: '', p: null } };
  const OG_TABS = [['info', '① 정보', '①정보'], ['cand', '② 목표 후보', '②후보'], ['mng', '③ 목표 관리', '③관리'], ['dir', '④ 지시', '④지시']];
  const OG_LAB = { title: '제목', metric: '지표', cur: '지금 값', target: '목표 값', due: '기한', up: '상위 목표', why: '왜', subs: '하위 작업' };
  const nowIso = () => new Date().toISOString();
  const todayKST = () => new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
  const friday = () => { const d = new Date(Date.now() + 9 * 3600000); d.setUTCDate(d.getUTCDate() + ((5 - d.getUTCDay() + 7) % 7 || 7)); return d.toISOString().slice(0, 10); };
  const isMeN = (n) => !!n && n === ME_STAFF.n;
  const ogAll = () => Object.values(LIVE.db ? (LIVE.ogoals || {}) : (S.dirOgoals || {}));
  const ogOf = (id) => (LIVE.db ? (LIVE.ogoals || {})[id] : (S.dirOgoals || {})[id]) || null;
  async function ogSave(id, patch, create) {
    const now = nowIso();
    const cur = ogOf(id) || {};
    const next = create ? Object.assign({ id, created: now }, patch, { updated: now }) : Object.assign({}, cur, patch, { updated: now });
    if (LIVE.db) { LIVE.ogoals = Object.assign({}, LIVE.ogoals || {}, { [id]: next }); try { await LIVE.db.doc('ogoals/' + id).set(next); return true; } catch (e) { toast('저장하지 못했습니다(' + ((e && e.code) || '오류') + ')'); return false; } }
    S.dirOgoals = Object.assign({}, S.dirOgoals || {}, { [id]: next }); return true;
  }
  function ogDel(id) {
    if (LIVE.db) { const m = Object.assign({}, LIVE.ogoals || {}); delete m[id]; LIVE.ogoals = m; LIVE.db.doc('ogoals/' + id).delete().catch(() => toast('지우지 못했습니다')); }
    else { const m = Object.assign({}, S.dirOgoals || {}); delete m[id]; S.dirOgoals = m; }
  }
  /* 활동 기록(패널 아래) */
  const ogLogPatch = (g, t) => ({ log: ((g && g.log) || []).concat([{ at: nowIso(), t }]).slice(-40) });
  const ogUi = () => (S.ui.og = Object.assign({ sel: null, open: null, act: null, del: null, tq: '', tab: 'cand', mtab: 'body', focus: null }, S.ui.og || {}));
  const byCreated = (a, b) => String(a.created || '').localeCompare(String(b.created || ''));
  const ogFor = (sel) => ogAll().filter((g) => (sel.kind === 'p' ? g.who === sel.name : g.scope === 'd' && !g.who && g.dept === sel.name)).sort(byCreated);
  const ogScopeAll = (sel) => ogAll().filter((g) => (sel.kind === 'p' ? g.who === sel.name : g.dept === sel.name)).sort(byCreated);
  const ogNo = (g) => ogAll().filter((x) => x.who === g.who && x.dept === g.dept && x.status === g.status).sort(byCreated).findIndex((x) => x.id === g.id) + 1;
  /* 진척: 계획(시간 기준) − 진척. 15%p 이상 뒤처짐(빨강), 5%p 이상 조금 늦음(주황) */
  const ogPlan = (g) => { const due = Date.parse(g.due || ''); const st = Date.parse(g.listed_at || g.created || ''); if (!due || !st || due <= st) return null; return Math.max(0, Math.min(100, Math.round(100 * (Date.now() - st) / (due - st)))); };
  const ogPct = (g) => Math.max(0, Math.min(100, +((g.progress || {}).pct) || 0));
  const ogGap = (g) => { const p = ogPlan(g); return p == null ? 0 : p - ogPct(g); };
  const ogLvl = (g) => { const d = ogGap(g); return d >= 15 ? 'c' : d >= 5 ? 'w' : ''; };
  const ogHasInfo = (sel) => (sel.kind === 'p' ? !!(staffInfo(sel.name) || profileOf('p:' + sel.name)) : !!profileOf('d:' + sel.name) || staffList().some((s) => s.d === sel.name && staffInfo(s.n)));
  function personStage(n) {
    const gs = ogAll().filter((g) => g.who === n);
    if (gs.some((g) => g.status === 'list')) return gs.some((g) => g.status === 'list' && ogLvl(g) === 'c') ? ['뒤처짐', 's0'] : ['관리 중', 's2'];
    if (gs.length) return ['후보 있음', 's1'];
    if (!staffInfo(n) && !profileOf('p:' + n)) return ['정보 부족', 's0'];
    return ['목표 없음', 's0'];
  }
  const ogUpText = (dept) => S.directives.filter((d) => isGoal(d) && (d.org === dept || d.src === 'goal_c') && isOpen(d)).slice(0, 8).map((d) => `- ${d.src === 'goal_c' ? '전사' : '부서'} ${d.code || ''} ${d.title} (진척 ${d.pct}%)`).join('\n');
  const goalLines = (g) => [`목표: ${g.title}`, g.metric ? `지표: ${g.metric}` : '', g.cur || g.target ? `지금 → 목표: ${g.cur || '측정 필요'} → ${g.target || '—'}` : '', g.due ? `기한: ${g.due}` : '', g.up ? `상위 목표: ${g.up}` : '', g.why ? `왜: ${g.why}` : ''].filter(Boolean);

  /* ---------- 아사나 프로젝트 · 섹션 ---------- */
  function ogProjects() {
    if (OG.proj.list || !LIVE.mcp) return Promise.resolve();
    if (OG.proj.p) return OG.proj.p;
    OG.proj.busy = true; OG.proj.err = '';
    OG.proj.p = (async () => {
      try {
        let all = []; let offset = '';
        for (let i = 0; i < 6; i++) {
          const r = await LIVE.mcp.callTool(ASANA.server, 'get_projects', Object.assign({ limit: 100, opt_fields: 'name' }, offset ? { offset } : {}), { cache: { staleTime: 600000 } });
          const p = (r && r.payload) || {}; const data = Array.isArray(p.data) ? p.data : Array.isArray(p) ? p : [];
          all = all.concat(data.filter((x) => x && x.gid && x.name).map((x) => ({ gid: String(x.gid), name: String(x.name) })));
          offset = p.next_page && p.next_page.offset; if (!offset) break;
        }
        OG.proj.list = all;
      } catch (e) { OG.proj.err = errText(e); OG.proj.p = null; }
      OG.proj.busy = false; rerender();
    })();
    return OG.proj.p;
  }
  /* 사람 이름이 들어간 「[목표]」 프로젝트 — 분기가 여럿이면 가장 최근 이름 */
  const ogRecProj = (who) => { if (!who || isMeN(who)) return null; const L = (OG.proj.list || []).filter((p) => /^\[목표\]/.test(p.name) && p.name.includes(who)); return L.sort((a, b) => b.name.localeCompare(a.name, 'ko'))[0] || null; };
  function ogSections(gid) {
    if (!gid || !LIVE.mcp) return Promise.resolve();
    if (OG.sec[gid]) return OG.sec[gid].p || Promise.resolve();
    const S2 = OG.sec[gid] = { state: 'loading', list: [] };
    S2.p = LIVE.mcp.callTool(ASANA.server, 'get_project', { project_id: gid, include_sections: true, opt_fields: 'name' }, { cache: { staleTime: 600000 } })
      .then((r) => { const p = (r && r.payload) || {}; const d = p.data || p; S2.state = 'ok'; S2.list = (Array.isArray(d.sections) ? d.sections : []).filter((s) => s && s.gid && s.name).map((s) => ({ gid: String(s.gid), name: String(s.name) })); rerender(); },
        (e) => { S2.state = 'err'; S2.err = errText(e); rerender(); });
    return S2.p;
  }
  const ogDefSec = (gid) => { const L = (OG.sec[gid] || {}).list || []; return L.find((s) => s.name === '개별 목표') || L.find((s) => /개별/.test(s.name)) || null; };
  /* 사람의 아사나 목표 프로젝트(이미 있는 목표 = 섹션) */
  function ogAproj(who) {
    if (!who || isMeN(who) || !LIVE.mcp) return null;
    if (!OG.proj.list) { ogProjects(); return { state: OG.proj.err ? 'err' : 'loading' }; }
    const p = ogRecProj(who); if (!p) return { state: 'none' };
    ogSections(p.gid); const s = OG.sec[p.gid] || { state: 'loading', list: [] };
    return { state: s.state, gid: p.gid, name: p.name, sections: s.list.filter((x) => x.name !== '취소') };
  }
  /* 보내기 창의 받는 사람 · 위치 · 체크 (메신저와 아사나가 같이 씀) */
  function ogLocOf(g) {
    const L = OG.loc[g.id] = OG.loc[g.id] || { who: g.who || '', due: g.due || '', project: '', pname: '', section: '', sname: '', auto: true, secAuto: true, subs: true, follow: true, toList: true };
    if (L.auto && OG.proj.list) { const p = ogRecProj(L.who); if (p && L.project !== p.gid) { L.project = p.gid; L.pname = p.name; L.section = ''; L.sname = ''; L.secAuto = true; } else if (!p && L.project) { L.project = ''; L.pname = ''; L.section = ''; L.sname = ''; } }
    if (L.project) { ogSections(L.project); if (!L.section && L.secAuto) { const s = ogDefSec(L.project); if (s) { L.section = s.gid; L.sname = s.name; } } }
    return L;
  }
  const ogWhere = (L) => [L.pname || '프로젝트 없음(담당자 내 작업)', L.pname ? (L.sname || '섹션 없음') : ''].filter(Boolean).join(' › ');

  /* ---------- 인공지능으로 목표 후보 만들기 (근거 있는 정보만으로) ---------- */
  async function ogGen(sel) {
    const key = sel.kind + ':' + sel.name; if (OG.busy[key]) return;
    OG.busy[key] = '정보를 모으는 중…'; OG.err[key] = ''; rerender();
    try {
      const { llm, used } = await manualLLM(utilAi());
      if (!llm) throw { code: 'no_llm' };
      const st = sel.kind === 'p' ? staffOf(sel.name) : null;
      const dept = sel.kind === 'p' ? (st ? st.d : '') : sel.name;
      const tasks = S.directives.filter((d) => !isGoal(d) && isOpen(d) && (sel.kind === 'p' ? d.assignee === sel.name : d.org === sel.name)).slice(0, 12).map((d) => `- ${shortT(d)} (${d.status}${noDue(d) ? '' : ', 기한 ' + d.due_at})`).join('\n');
      const prof = profileOf(sel.kind + ':' + sel.name);
      const memos = memosOf(recKey(sel.kind === 'd' ? sel.name : dept, sel.kind === 'p' ? sel.name : '')).map((m) => '- ' + String(m.text).replace(/\n+/g, ' ').slice(0, 300)).join('\n');
      const have = ogScopeAll(sel).map((g) => g.title).join(', ');
      const info = sel.kind === 'p' ? staffInfoText(sel.name) : staffList().filter((s) => s.d === sel.name && staffInfo(s.n)).slice(0, 8).map((s) => staffInfoText(s.n, true)).join('\n\n');
      let aproj = '';
      if (sel.kind === 'p' && LIVE.mcp) { try { await ogProjects(); const p = ogRecProj(sel.name); if (p) { await ogSections(p.gid); aproj = `${p.name} · 이미 있는 목표(섹션): ${((OG.sec[p.gid] || {}).list || []).map((s) => s.name).filter((n) => n !== '취소').join(' / ') || '없음'}`; } } catch (e) { aproj = ''; } }
      OG.busy[key] = '인공지능이 목표 후보를 만드는 중… (10~40초)'; rerender();
      const v = await llm.json(`아이센스그룹 윤석범 회장이 ${sel.kind === 'p' ? `${sel.name}${st && st.g ? ' ' + st.g : ''}님(${dept})` : `${sel.name} 부서`}에게 맡길 목표 후보 3개를 만드세요.
규칙:
- 아래 근거(직무 정보·지금 하는 일·상위 목표·아사나에 이미 있는 목표·회장 메모)에서만 출발하세요. 근거 없는 목표는 만들지 마세요.
- 아사나에 이미 있는 목표와 겹치지 말고, 그것을 이어 가거나 빈 곳을 채우세요.
- 목표마다 숫자로 잴 수 있는 지표와 목표 값, 기한(YYYY-MM-DD)을 넣으세요. 지금 값을 모르면 cur에 "측정 필요"라고 쓰세요.
- 이어지는 상위 목표(부서 목표·전사 목표)가 있으면 up에 「부서목표 「…」」 또는 「전사 「…」」처럼 적으세요.
- why에는 "왜 이 사람(부서)에게"를 근거와 함께 한두 문장으로.
- subs는 이 목표를 이루는 하위 작업 3~5개(각 30자 이내).
- 연봉·임금·인사 처우는 다루지 마세요. 영어를 쓰지 말고 한국어로만.${have ? `\n- 이미 만든 목표와 겹치지 않게: ${have}` : ''}
JSON 배열만 출력: [{"title":"","metric":"","cur":"","target":"","due":"","up":"","why":"","subs":["",""]}, ...]

[직무 정보]
${info || '(부서현황판 정보 없음)'}
[아사나 목표 프로젝트]
${aproj || '(없음)'}
[최근 정보 요약]
${prof ? String(prof.text).slice(0, 2000) : '(아직 모으지 않음)'}
[지금 하는 일]
${tasks || '(없음)'}
[상위 목표]
${ogUpText(dept) || '(없음)'}
[회장 메모]
${memos || '(없음)'}`, { modelTier: 'default', cache: false });
      const arr = (Array.isArray(v) ? v : v && Array.isArray(v.items) ? v.items : []).filter((o) => o && o.title).slice(0, 5);
      if (!arr.length) throw { code: 'empty_completion' };
      for (const o of arr) {
        const id = 'og' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
        await ogSave(id, { scope: sel.kind, who: sel.kind === 'p' ? sel.name : '', dept, title: String(o.title).slice(0, 100), metric: String(o.metric || '').slice(0, 120), cur: String(o.cur || '측정 필요').slice(0, 60), target: String(o.target || '').slice(0, 60), due: /^\d{4}-\d{2}-\d{2}$/.test(o.due || '') ? o.due : '', up: String(o.up || '').slice(0, 120), why: String(o.why || '').slice(0, 400), subs: (Array.isArray(o.subs) ? o.subs : []).slice(0, 8).map((s) => String(s).slice(0, 60)), status: 'cand', from: 'ai', ai: used, chat: [], log: [{ at: nowIso(), t: `인공지능(${aiName(used || 'claude')})이 후보로 만듦` }] }, true);
      }
      logAct('goal_gen', `${sel.kind === 'p' ? sel.name + '님' : sel.name} 목표 후보 ${arr.length}개 만듦`, key);
      toast(`목표 후보 ${arr.length}개를 만들었습니다 — 눌러서 고치고 보내세요`);
    } catch (e) { OG.err[key] = aiErr(e); }
    OG.busy[key] = null; rerender();
  }

  /* ---------- 메신저로 지시: 받은 사람이 클로드에 붙여 넣고 "아사나에 등록해 줘" 한마디로 끝나게 ---------- */
  const CIRC = '①②③④⑤⑥⑦⑧⑨⑩';
  function ogMsg(g, L) {
    const who = L.who || g.who || g.dept; const subs = (g.subs || []).filter(Boolean); const due = L.due || g.due || '없음';
    return `[회장 지시 · 목표] ${who}님, 아래 목표를 맡아 주세요.
■ 목표: ${g.title}
${g.metric ? `■ 지표: ${g.metric} (지금 ${g.cur || '측정 필요'} → 목표 ${g.target || '—'})\n` : ''}■ 기한: ${due}
${g.up ? `■ 상위 목표: ${g.up}\n` : ''}${g.why ? `■ 왜: ${g.why}\n` : ''}${subs.length ? `■ 하위 작업: ${subs.map((s, i) => (CIRC[i] || (i + 1) + ')') + ' ' + s).join(' ')}\n` : ''}
👉 아래 〔아사나 등록 요청〕을 통째로 복사해 클로드에 붙여 넣고 "아사나에 등록해 줘"라고 하세요.
〔아사나 등록 요청〕
· 프로젝트: ${L.pname || '없음(담당자 내 작업에 등록)'}
· 섹션: ${L.pname ? (L.sname || '없음') : '없음'}
· 작업 이름: [목표] ${g.title}
· 담당자: ${who} · 기한: ${due}
· 설명: 위 지표 · 상위 목표 · 왜
· 하위 작업 ${subs.length}개: ${subs.length ? `위 ${CIRC[0]}~${CIRC[subs.length - 1] || subs.length} (담당 · 기한 같음)` : '없음'}
· 등록이 끝나면 이 메시지에 아사나 링크를 답장해 주세요.`;
  }
  /* 위치를 바꾸면 이미 고친 글에서도 프로젝트 · 섹션 줄만 바꾼다 */
  function ogMsgLoc(g, L) {
    const d = OG.msgDraft[g.id]; if (!d) return;
    OG.msgDraft[g.id] = d.replace(/^· 프로젝트: .*$/m, `· 프로젝트: ${L.pname || '없음(담당자 내 작업에 등록)'}`).replace(/^· 섹션: .*$/m, `· 섹션: ${L.pname ? (L.sname || '없음') : '없음'}`);
  }
  function ogToListPatch(cur, L, p) {
    if (!L.toList || cur.status === 'list') return p;
    p.status = 'list'; p.listed_at = nowIso(); p.progress = cur.progress || { pct: 0 };
    p.log = (p.log || cur.log || []).concat([{ at: nowIso(), t: '목표 리스트로 옮김' }]);
    return p;
  }
  async function ogSendMsg(g, msg, L) {
    if (!LIVE.mcp) { toast('슬랙에 연결된 화면에서만 보낼 수 있습니다 — 「글 복사」로 보내 주세요'); return; }
    const to = L.who || g.who; if (!to) { toast('담당을 먼저 정해 주세요'); return; }
    OG.send[g.id] = '슬랙으로 보내는 중…'; rerender();
    try {
      const who = await findSlackId({ id: 'og' + g.id, assignee: to });
      if (!who) throw { code: 'not_found', message: `슬랙에서 ${to}님을 찾지 못했습니다` };
      await LIVE.mcp.callTool('Slack', 'slack_send_message', { channel_id: who.id, message: msg });
      const cur = ogOf(g.id) || g; const st = staffOf(to);
      const p = Object.assign({ who: to, sent: Object.assign({}, cur.sent || {}, { msg_at: nowIso(), msg_loc: ogWhere(L), wait_link: !(cur.sent || {}).asana_gid }) }, ogLogPatch(cur, `메신저로 ${to}님께 지시 (${ogWhere(L)})`));
      if (st && st.d) p.dept = st.d;
      await ogSave(g.id, ogToListPatch(cur, L, p));
      logAct('goal_msg', `${to}님께 목표 「${g.title}」 메신저로 지시`, g.id);
      toast(`${to}님께 슬랙으로 보냈습니다${L.toList && cur.status !== 'list' ? ' · 목표 리스트로 옮김' : ''}`);
      ogUi().act = null; delete OG.msgDraft[g.id];
    } catch (e) { toast('슬랙으로 보내지 못했습니다 — ' + ((e && e.message) || errText(e))); }
    OG.send[g.id] = null; rerender();
  }
  /* ---------- 아사나로 보내기: 프로젝트 › 섹션 · 담당자 · 기한 · 체크 3개 ---------- */
  async function ogSendAsana(g, L) {
    if (!LIVE.mcp) { toast('아사나에 연결된 화면에서만 보낼 수 있습니다'); return; }
    const to = L.who || ''; const me = !to || isMeN(to); const st = to ? staffOf(to) : null;
    const assignee = me ? 'me' : (st && st.gid) || '';
    if (!assignee) { toast(`아사나에서 ${to}님을 찾지 못했습니다 — 담당자를 다시 골라 주세요`); return; }
    OG.send[g.id] = '아사나에 만드는 중…'; rerender();
    try {
      const due = /^\d{4}-\d{2}-\d{2}$/.test(L.due || '') ? L.due : '';
      const notes = goalLines(Object.assign({}, g, { due: due || g.due })).join('\n') + '\n\n회장 현황판 「지시 관리」에서 보낸 목표입니다. 진행하면서 댓글로 결과를 남겨 주세요.';
      const task = { name: `[목표] ${g.title}`, notes, assignee };
      if (due) task.due_on = due;
      if (L.project) { task.project_id = L.project; if (L.section) task.section_id = L.section; }
      if (L.follow && !me) task.followers = 'me';
      const args = L.project ? { default_project: L.project, tasks: [task] } : { default_assignee: assignee, tasks: [task] };
      const r = await LIVE.mcp.callTool(ASANA.server, 'create_tasks', args);
      const p0 = (r && r.payload) || {}; const gid = gidOf((p0.succeeded || [])[0]);
      if (!gid) throw { code: 'tool_error', message: JSON.stringify((p0.failed || [])[0] || p0).slice(0, 160) };
      const subs = L.subs ? (g.subs || []).filter((s) => String(s).trim()) : []; let ok = 0; let subGids = [];
      if (subs.length) {
        try {
          const r2 = await LIVE.mcp.callTool(ASANA.server, 'create_tasks', { tasks: subs.map((s) => { const t = { name: s, parent: gid, assignee }; if (due) t.due_on = due; return t; }) });
          subGids = (((r2 && r2.payload) || {}).succeeded || []).map(gidOf).filter(Boolean); ok = subGids.length;
        } catch (e) { ok = 0; }
      }
      const cur = ogOf(g.id) || g;
      const p = Object.assign({ who: me ? ME_STAFF.n : to, due: due || cur.due, sent: Object.assign({}, cur.sent || {}, { asana_gid: gid, sub_gids: subGids, asana_at: nowIso(), project: L.pname || '내 작업', section: L.sname || '', wait_link: false }) }, ogLogPatch(cur, `아사나에 등록 — ${ogWhere(L)}${subs.length ? ` · 하위 작업 ${ok}/${subs.length}` : ''}`));
      if (st && st.d) p.dept = st.d;
      await ogSave(g.id, ogToListPatch(cur, L, p));
      OG.res[g.id] = { gid, ok, n: subs.length, at: nowIso() }; OG.sync[g.id] = null;
      logAct('goal_asana', `목표 「${g.title}」 아사나로 보냄(${me ? '나' : to})`, gid);
      toast(`아사나에 등록했습니다${subs.length ? ` · 하위 작업 ${ok}/${subs.length}개` : ''}${L.toList && cur.status !== 'list' ? ' · 목표 리스트로 옮김' : ''}`);
    } catch (e) { toast('아사나로 보내지 못했습니다 — ' + ((e && e.message) || errText(e))); }
    OG.send[g.id] = null; rerender();
  }
  /* 메신저로 보낸 뒤 받은 아사나 링크를 붙이면 그 작업 · 하위 작업으로 진척을 잇는다 */
  async function ogLinkAsana(g, url) {
    const m = String(url || '').match(/\d{10,}/g); const gid = m && m[m.length - 1];
    if (!gid) { toast('아사나 작업 링크를 붙여 주세요'); return; }
    if (!LIVE.mcp) { toast('아사나에 연결된 화면에서만 확인할 수 있습니다'); return; }
    OG.link[g.id] = '아사나에서 확인하는 중…'; rerender();
    try {
      const r = await LIVE.mcp.callTool(ASANA.server, 'get_task', { task_id: gid, include_comments: false, opt_fields: 'name,completed,due_on' });
      const p = (r && r.payload) || {}; const t = p.data || p;
      if (!t || !t.name) throw { code: 'not_found', message: '그 링크의 작업을 찾지 못했습니다' };
      const subs = (Array.isArray(t.subtasks) ? t.subtasks : []).map(gidOf).filter(Boolean);
      const cur = ogOf(g.id) || g;
      await ogSave(g.id, Object.assign({ sent: Object.assign({}, cur.sent || {}, { asana_gid: gid, sub_gids: subs, asana_at: (cur.sent || {}).asana_at || nowIso(), wait_link: false, linked: true }) }, ogLogPatch(cur, `아사나 링크 붙임 — 「${t.name}」 하위 작업 ${subs.length}개`)));
      delete OG.linkDraft[g.id]; OG.sync[g.id] = null;
      const g2 = ogOf(g.id); if (g2) setTimeout(() => ogSync(g2), 0);
      toast(`아사나 작업 「${String(t.name).slice(0, 30)}」에 이었습니다`);
    } catch (e) { toast('아사나 링크를 잇지 못했습니다 — ' + ((e && e.message) || errText(e))); }
    OG.link[g.id] = null; rerender();
  }
  /* 아사나 진척 가져오기: 작업 완료면 100%, 아니면 하위 작업 완료 비율 (수기로 고친 진척은 덮어쓰지 않음) */
  async function ogSync(g) {
    const s = g.sent || {}; if (!s.asana_gid || !LIVE.mcp || OG.sync[g.id]) return;
    OG.sync[g.id] = 'busy';
    try {
      const opt = { include_comments: false, include_subtasks: false, opt_fields: 'name,completed,due_on' };
      const ids = [s.asana_gid].concat(s.sub_gids || []);
      const rs = await Promise.allSettled(ids.map((id) => LIVE.mcp.callTool(ASANA.server, 'get_task', Object.assign({ task_id: id }, opt), { cache: { staleTime: 300000, gcTime: 600000 } })));
      const vals = rs.map((r) => { if (r.status !== 'fulfilled') return null; const p = (r.value && r.value.payload) || {}; return p.data || p; });
      const main = vals[0]; const subs = vals.slice(1).filter((x) => x && x.name);
      if (main && main.name) {
        const cur = ogOf(g.id) || g; const done = subs.filter((x) => x.completed).length;
        const patch = { link: { total: subs.length, done, main_done: !!main.completed, items: subs.map((x) => ({ name: String(x.name), done: !!x.completed, due: x.due_on || '' })), at: nowIso() } };
        if (!(cur.progress && cur.progress.manual)) { const pct = main.completed ? 100 : subs.length ? Math.round(100 * done / subs.length) : null; if (pct != null) patch.progress = { pct, at: nowIso(), src: 'asana' }; }
        await ogSave(g.id, patch);
      }
      OG.sync[g.id] = 'ok';
    } catch (e) { OG.sync[g.id] = 'err'; }
    rerender();
  }
  /* ---------- 패널 왼쪽 채팅: 인공지능과 대화해 목표 내용을 고친다 ---------- */
  async function ogChat(g, text) {
    if (OG.chat[g.id]) return;
    const cur0 = ogOf(g.id) || g;
    const hist = (cur0.chat || []).concat([{ role: 'user', text, at: nowIso() }]);
    await ogSave(g.id, { chat: hist }); OG.chat[g.id] = true; rerender();
    try {
      const { llm } = await manualLLM(utilAi());
      if (!llm) throw { code: 'no_llm' };
      const fields = { title: cur0.title, metric: cur0.metric, cur: cur0.cur, target: cur0.target, due: cur0.due, up: cur0.up, why: cur0.why, subs: cur0.subs || [] };
      const v = await llm.json(`아이센스그룹 회장이 목표 카드를 고치고 있습니다. 회장의 요청대로 고친 필드만 돌려주세요. 바꾸지 않는 필드는 넣지 마세요. 기한은 YYYY-MM-DD(오늘 ${todayKST()}). 영어를 쓰지 말고 한국어로만. 연봉·임금은 다루지 않습니다.
지금 목표 카드: ${JSON.stringify(fields)}
대상: ${cur0.who ? cur0.who + '님' : cur0.dept}
지금까지 대화:
${hist.slice(-8).map((m) => (m.role === 'user' ? '회장: ' : '인공지능: ') + m.text).join('\n')}
JSON 하나만 출력: {"patch":{"title":"…"}, "reply":"무엇을 어떻게 고쳤는지 한두 문장"}`, { modelTier: 'quick', cache: false });
      const patch = {}; const P = (v && v.patch) || {};
      ['title', 'metric', 'cur', 'target', 'up', 'why'].forEach((k) => { if (typeof P[k] === 'string' && P[k].trim() && P[k] !== cur0[k]) patch[k] = P[k].slice(0, 400); });
      if (/^\d{4}-\d{2}-\d{2}$/.test(P.due || '') && P.due !== cur0.due) patch.due = P.due;
      if (Array.isArray(P.subs) && JSON.stringify(P.subs) !== JSON.stringify(cur0.subs || [])) patch.subs = P.subs.slice(0, 8).map((s) => String(s).slice(0, 60));
      const keys = Object.keys(patch); const prev = {}; keys.forEach((k) => { prev[k] = cur0[k] === undefined ? (k === 'subs' ? [] : '') : cur0[k]; });
      const names = keys.map((k) => OG_LAB[k]);
      const reply = String((v && v.reply) || (keys.length ? '고쳤습니다.' : '바꿀 곳을 찾지 못했습니다.')).slice(0, 400);
      const cur = ogOf(g.id) || cur0;
      await ogSave(g.id, Object.assign(patch, { chat: hist.concat([{ role: 'ai', text: reply, at: nowIso(), keys, prev }]) }, keys.length ? ogLogPatch(cur, `채팅으로 ${names.join(' · ')} 바꿈`) : {}));
      OG.chg[g.id] = keys;
    } catch (e) { await ogSave(g.id, { chat: hist.concat([{ role: 'ai', text: aiErr(e), at: nowIso(), err: true }]) }); }
    OG.chat[g.id] = false; rerender();
  }

  /* ---------- ④ 지시: 뒤처진 목표 → 근거 → 지시서 ---------- */
  function ogWhyLate(g) {
    const t = todayKST(); const r = [];
    ((g.link || {}).items || []).filter((x) => !x.done && x.due && x.due < t).slice(0, 2).forEach((x) => r.push(`연결 작업 「${x.name}」 기한 ${Math.round((Date.parse(t) - Date.parse(x.due)) / 86400000)}일 지남`));
    if (g.who) S.directives.filter((d) => !isGoal(d) && d.assignee === g.who && isOpen(d) && isOverdue(d)).slice(0, 1).forEach((d) => r.push(`기한 지난 일 「${shortT(d)}」`));
    const si = g.who ? staffInfo(g.who) : null;
    if (si && si.story && si.story[0]) r.push(`나의 스토리 「${String(si.story[0].title || '').slice(0, 40)}」`);
    if (g.link && g.link.total) r.push(`연결 작업 ${g.link.total}건 중 ${g.link.done}건 완료`);
    return r.length ? r.join(' · ') : '아사나 연결 작업이 없어 진척은 수기 입력 기준입니다';
  }
  const DIR_KINDS = { prio: '우선순위 조정 지시', help: '도울 사람 붙이기', tool: '자동화 도구 지원', ask: '먼저 물어보기' };
  function ogDirText(g, k) {
    const who = g.who ? g.who + '님' : g.dept; const fr = friday();
    const head = `[회장 지시] ${who}, 목표 「${g.title}」이 계획보다 ${ogGap(g)}%p 늦습니다(진척 ${ogPct(g)}% · 계획 ${ogPlan(g)}%).\n근거: ${ogWhyLate(g)}`;
    const body = {
      prio: `지시: 이번 주는 이 목표를 가장 먼저 해 주세요. 덜 급한 일은 미루고, 미루기 어려운 일은 저에게 말해 주세요.\n완료 조건: ${md(fr)}(금)까지 진척 ${Math.min(100, ogPlan(g))}%에 닿거나, 못 닿으면 이유와 새 계획을 보고.`,
      help: `지시: 이 목표에 도울 사람을 붙이려 합니다. 어떤 일을 누구에게 나누면 좋을지 정해 주세요.\n완료 조건: ${md(fr)}(금)까지 나눌 일 목록과 도울 사람 이름을 보고.`,
      tool: `지시: 반복되는 일 가운데 인공지능·자동화 도구로 줄일 수 있는 것을 3가지 골라 주세요. 필요한 도구는 지원하겠습니다.\n완료 조건: ${md(fr)}(금)까지 3가지와 줄어드는 시간(주당)을 보고.`,
      ask: `지금 무엇이 걸리는지, 제가 도울 일이 있는지 오늘 안에 짧게 알려 줄래요?\n완료 조건: 오늘 안에 답장.`
    }[k];
    return head + '\n' + body;
  }
  /* 보낼 글 상자 (지시서 · 1:1 점검 질문 · 주간 보고 요청) */
  function ogPmBox(sel) {
    const key = sel.kind + ':' + sel.name; const b = OG.pm[key]; if (!b) return '';
    const g = b.gid ? ogOf(b.gid) : null; const to = g ? g.who : sel.kind === 'p' ? sel.name : '';
    const st = to ? staffOf(to) : null;
    return `<div class="og-actbox og-pm" role="region" aria-label="${esc(b.title)}"><div class="og-to">받는 사람: ${to ? esc(to + (st && st.g ? ' ' + st.g : '') + (st && st.d ? ' · ' + st.d : '')) : '담당자 없음'}</div><span class="small muted">${esc(b.title)} · 보내기 전에 고칠 수 있습니다</span>
      ${b.busy ? `<span class="small"><span class="dir-spin sm" aria-hidden="true"></span>${esc(b.busy)}</span>` : `<textarea id="og-pm" rows="9" aria-label="보낼 글">${esc(b.text)}</textarea>
      <div class="row"><button type="button" class="btn primary sm" data-act="ogPmSlack" data-v="${esc(key)}" ${to && LIVE.mcp ? '' : 'disabled'}>슬랙으로 보내기</button>${b.kind === 'dir' ? `<button type="button" class="btn sm" data-act="ogPmAsana" data-v="${esc(key)}" ${to && LIVE.mcp ? '' : 'disabled'}>아사나에 지시로 등록</button>` : ''}<button type="button" class="btn sm" data-act="ogPmCopy">글 복사</button><button type="button" class="dir-link" data-act="ogPmClose" data-v="${esc(key)}">닫기</button></div>
      ${to ? '' : '<p class="small dir-warn" style="margin:0">담당자가 정해진 목표만 보낼 수 있습니다.</p>'}${LIVE.mcp ? '' : '<p class="small dir-warn" style="margin:0">슬랙·아사나에 연결된 화면에서만 보낼 수 있습니다. 「글 복사」로 직접 보내셔도 됩니다.</p>'}`}</div>`;
  }
  async function ogQs(sel) {
    const key = sel.kind + ':' + sel.name;
    const gs = ogScopeAll(sel).filter((g) => g.status === 'list');
    OG.pm[key] = { kind: 'qs', title: '1:1 점검 질문', busy: '인공지능이 질문을 만드는 중…', text: '' }; rerender();
    try {
      const { llm } = await manualLLM(utilAi()); if (!llm) throw { code: 'no_llm' };
      const v = await llm.json(`아이센스그룹 윤석범 회장이 ${sel.name}님과 1:1 점검을 합니다. 아래 목표마다 진척을 확인하고 막힌 곳을 찾는 질문을 모두 합쳐 4~6개 만드세요. 회장이 직접 말하듯 자연스럽고 짧게, 한국어로만. 연봉·임금은 다루지 않습니다.
${gs.map((g) => `- ${g.title} · 진척 ${ogPct(g)}% / 계획 ${ogPlan(g) == null ? '—' : ogPlan(g) + '%'} · 근거: ${ogWhyLate(g)}`).join('\n') || '(목표 없음)'}
JSON 하나만 출력: {"questions":["",""]}`, { modelTier: 'quick', cache: false });
      const qs = ((v && v.questions) || []).filter(Boolean).slice(0, 8);
      if (!qs.length) throw { code: 'empty_completion' };
      OG.pm[key] = { kind: 'qs', title: '1:1 점검 질문', text: `[회장 1:1 점검] ${sel.name}님, 다음 1:1 때 아래를 같이 보려고 해요. 미리 짧게 생각해 와 주세요.\n` + qs.map((q, i) => `${i + 1}. ${q}`).join('\n') };
    } catch (e) { OG.pm[key] = { kind: 'qs', title: '1:1 점검 질문', text: aiErr(e) }; }
    rerender();
  }
  const ogWeekly = (sel) => { const gs = ogScopeAll(sel).filter((g) => g.status === 'list'); return `[회장 요청 · 주간 보고] ${sel.name}님, 매주 금요일에 아래 목표 진척을 짧게 알려 주세요.\n${gs.map((g) => `■ ${g.title} (지금 진척 ${ogPct(g)}%)`).join('\n')}\n\n적을 것: 1) 이번 주 한 일  2) 진척(%)  3) 막힌 것·도움이 필요한 것\n👉 아사나 등록: 이 메시지를 클로드에 붙여 넣고 "매주 금요일 반복 작업으로 아사나에 등록해 줘"라고 하면 됩니다.`; };
  async function ogPmSend(key, via) {
    const b = OG.pm[key]; if (!b || b.busy) return;
    const i = key.indexOf(':'); const sel = { kind: key.slice(0, i), name: key.slice(i + 1) };
    const t = document.getElementById('og-pm'); const text = (t ? t.value : b.text).trim(); if (!text) return;
    const g = b.gid ? ogOf(b.gid) : null; const to = g ? g.who : sel.kind === 'p' ? sel.name : '';
    if (!to || !LIVE.mcp) return;
    b.text = text; b.busy = via === 'slack' ? '슬랙으로 보내는 중…' : '아사나에 지시로 만드는 중…'; rerender();
    try {
      if (via === 'slack') {
        const who = await findSlackId({ id: 'ogpm' + key, assignee: to });
        if (!who) throw { code: 'not_found', message: `슬랙에서 ${to}님을 찾지 못했습니다` };
        await LIVE.mcp.callTool('Slack', 'slack_send_message', { channel_id: who.id, message: text });
      } else {
        const st = staffOf(to); const task = { name: `[지시] ${g ? g.title : to} — ${DIR_KINDS[b.k] || '지시'}`, notes: text + '\n\n회장 현황판 「지시 관리」에서 보낸 지시입니다.', due_on: friday(), section_id: ASANA.sec['지시'] };
        if (st && st.gid) task.assignee = st.gid;
        const r = await LIVE.mcp.callTool(ASANA.server, 'create_tasks', { default_project: ASANA.project, tasks: [task] });
        if (!gidOf((((r && r.payload) || {}).succeeded || [])[0])) throw { code: 'tool_error', message: JSON.stringify((((r && r.payload) || {}).failed || [])[0] || '').slice(0, 160) };
      }
      if (g && b.kind === 'dir' && !b.logged) { b.logged = true; const cur = ogOf(g.id) || g; await ogSave(g.id, Object.assign({ dirs: (cur.dirs || []).concat([{ k: b.k, at: nowIso(), via, pct: ogPct(cur) }]) }, ogLogPatch(cur, `지시 — ${DIR_KINDS[b.k]} (${via === 'slack' ? '슬랙' : '아사나'})`))); }
      logAct('goal_dir', `${to}님께 ${b.title} (${via === 'slack' ? '슬랙' : '아사나'})`, g ? g.id : key);
      toast(`${to}님께 ${via === 'slack' ? '슬랙으로 보냈습니다' : '아사나 지시로 만들었습니다'}`);
      if (via === 'slack' || b.kind !== 'dir') delete OG.pm[key]; else b.busy = null;
    } catch (e) { b.busy = null; toast('보내지 못했습니다 — ' + ((e && e.message) || errText(e))); }
    rerender();
  }

  /* ---------- 화면 조각 ---------- */
  const SRC_CLS = { '알앤알': 's-rnr', '아사나': 's-asana', '나의 스토리': 's-story', '상위 목표': 's-goal', '슬랙': 's-slack', '부서현황판': 's-rnr' };
  const ogSentBadges = (g) => { const s = g.sent || {}; const b = `${s.msg_at ? `<span class="pill st-done small">메신저 ${esc(md(s.msg_at.slice(0, 10)))}</span>` : ''}${s.asana_gid ? `<span class="pill st-done small">아사나 등록${s.section ? ' · ' + esc(s.section) : ''}</span>` : ''}${s.wait_link && !s.asana_gid ? '<span class="pill st-hold small">아사나 링크 기다리는 중</span>' : ''}`; return b ? `<span class="og-badges">${b}</span>` : ''; };
  const ogSendBtns = (g) => `${isMeN(g.who) ? '' : `<button type="button" class="btn sm" data-act="ogAct" data-id="${esc(g.id)}" data-v="msg">메신저로 지시</button>`}<button type="button" class="btn sm" data-act="ogAct" data-id="${esc(g.id)}" data-v="asana">아사나로 보내기</button>`;
  function ogCard(g) {
    const ui = ogUi(); const isList = g.status === 'list'; const ai = g.from === 'ai' && !isList; const lv = isList ? ogLvl(g) : '';
    return `<div class="og-card ${ai ? 'ai' : ''} ${ui.open === g.id ? 'on' : ''}">
      <button type="button" class="og-cardmain" data-act="ogOpen" data-id="${esc(g.id)}"><h5>목표 ${ogNo(g)} · ${esc(g.title)}</h5>
        ${g.up ? `<span class="og-up">↑ ${esc(g.up)}에 연결</span>` : '<span class="og-up none">↑ 이어지는 상위 목표 없음</span>'}
        <span class="small"><b>지표</b> ${esc(g.metric || '—')} · <b>지금</b> ${esc(g.cur || '측정 필요')} · <b>목표</b> ${esc(g.target || '—')} · <b>기한</b> ${esc(g.due ? md(g.due) : '없음')}${isList ? ` · 진척 ${ogPct(g)}%${lv === 'c' ? ' <b class="dir-crit">뒤처짐</b>' : lv === 'w' ? ' <b class="og-wtx">조금 늦음</b>' : ''}` : ''}</span>
        ${!isList && g.why ? `<span class="small"><b>왜 ${g.who ? '이 사람' : '이 부서'}에게:</b> ${esc(g.why)}</span>` : ''}
        ${ogSentBadges(g)}</button>
      <div class="og-acts"><div class="row">${ogSendBtns(g)}${isList ? `<span class="og-sp"></span><button type="button" class="dir-link small" data-act="ogToCand" data-id="${esc(g.id)}">후보로 되돌리기</button>` : ''}</div>
        ${isList ? '' : `<button type="button" class="btn primary sm og-tolist" data-act="ogToList" data-id="${esc(g.id)}">리스트로 보내기 →</button>`}</div>
    </div>`;
  }
  function ogHead(sel) {
    const key = sel.kind + ':' + sel.name; const P = PROF[key] || {}; const pf = profileOf(key);
    const st = sel.kind === 'p' ? staffOf(sel.name) : null; const si = sel.kind === 'p' ? staffInfo(sel.name) : null;
    const n = sel.kind === 'd' ? staffList().filter((s) => s.d === sel.name).length : 0;
    const subline = sel.kind === 'p' ? [st ? st.d : '', si && si.rnr && si.rnr.job ? si.rnr.job : ''].filter(Boolean).join(' · ') : `부서 · ${n}명`;
    return `<div class="og-head"><div class="og-hname"><h2>${esc(sel.name)}${st && st.g ? ` <small>${esc(st.g)}</small>` : ''}</h2><span class="small muted">${esc(subline)}</span></div>
      <div class="row"><button type="button" class="btn sm" data-act="profCollect" data-kind="${sel.kind}" data-v="${esc(sel.name)}" ${P.busy ? 'disabled' : ''}>${P.busy ? esc(P.stage || '모으는 중…') : '↻ 최근 정보 모아오기'}</button><span class="small muted">${pf ? esc(md(String(pf.at).slice(0, 10))) + ' 모음' : si ? esc(md(String(si.at).slice(0, 10))) + ' 사본' : '아직 안 모음'}</span></div></div>`;
  }
  function ogTabsHtml(sel) {
    const ui = ogUi(); const gs = ogScopeAll(sel); const list = gs.filter((g) => g.status === 'list');
    const candN = ogFor(sel).filter((g) => g.status !== 'list').length;
    const late = list.filter((g) => ogLvl(g)).length; const need = list.filter((g) => ogLvl(g) === 'c' && !isMeN(g.who)).length;
    const info = ogHasInfo(sel);
    const bd = { info: info ? '' : '<span class="og-bd o"><span class="og-tl">부족</span><span class="og-ts">!</span></span>', cand: candN ? `<span class="og-bd">${candN}</span>` : '', mng: late ? `<span class="og-bd o"><span class="og-tl">늦음 </span>${late}</span>` : list.length ? `<span class="og-bd">${list.length}</span>` : '', dir: need ? `<span class="og-bd r">${need}</span>` : '' };
    return `<div class="og-tabs" role="tablist" aria-label="단계">${OG_TABS.map(([id, l, s]) => { const on = ui.tab === id; const done = id === 'info' && info; return `<button type="button" role="tab" id="og-tab-${id}" aria-selected="${on}" tabindex="${on ? 0 : -1}" class="og-tb ${on ? 'sel' : ''} ${done ? 'done' : ''}" data-act="ogTab" data-v="${id}"><span class="og-tl">${l}${done ? ' ✓' : ''}</span><span class="og-ts">${s}${done ? '✓' : ''}</span>${bd[id]}</button>`; }).join('')}</div>`;
  }
  /* ① 정보 탭 */
  function ogInfoTab(sel) {
    const key = sel.kind + ':' + sel.name; const pf = profileOf(key);
    const si = sel.kind === 'p' ? staffInfo(sel.name) : null;
    const st = sel.kind === 'p' ? staffOf(sel.name) : null;
    const tasks = S.directives.filter((d) => !isGoal(d) && isOpen(d) && (sel.kind === 'p' ? d.assignee === sel.name : d.org === sel.name));
    const dept = sel.kind === 'p' ? (st ? st.d : '') : sel.name;
    const upD = S.directives.filter((d) => d.src === 'goal_d' && d.org === dept && isOpen(d));
    const upC = S.directives.filter((d) => d.src === 'goal_c' && isOpen(d));
    const over = tasks.filter(isOverdue).length;
    const kv = (src, lab, body, cls) => `<div class="og-kv ${cls || ''}">${src ? `<span class="og-src ${SRC_CLS[src] || ''}">${src}</span>` : ''}<b>${lab}</b><div class="small">${body}</div></div>`;
    const rout = si && si.routines ? si.routines : [];
    const ap = sel.kind === 'p' ? ogAproj(sel.name) : null;
    const apBody = !LIVE.mcp ? '<span class="muted">아사나에 연결된 화면에서 읽어 옵니다</span>' : !ap ? '<span class="muted">회장님 본인은 해당 없음</span>' : ap.state === 'loading' ? '<span class="dir-spin sm" aria-hidden="true"></span> 아사나에서 읽는 중…' : ap.state === 'none' ? '<span class="muted">이름이 들어간 「[목표]」 프로젝트가 없습니다</span>' : ap.state === 'err' ? '<span class="dir-err">읽지 못했습니다</span>' : `「${esc(ap.name)}」 · 섹션 ${ap.sections.length}개: ${esc(ap.sections.slice(0, 5).map((s) => s.name).join(' · '))}`;
    const members = sel.kind === 'd' ? staffList().filter((s) => s.d === sel.name) : [];
    return `${si || sel.kind === 'd' ? '' : '<p class="small dir-warn" style="margin:0">부서현황판에 이 사람의 개인 현황판 정보가 없습니다. 위 「최근 정보 모아오기」(아사나·슬랙)로 보충해 주세요.</p>'}
      <div class="row"><b>직무 정보</b><span class="small muted">인공지능이 아래를 읽고 목표 후보를 만듭니다</span></div>
      <div class="og-kvs">
        ${sel.kind === 'p' ? kv('알앤알', si && si.rnr ? `맡은 일 ${(si.rnr.resp || []).length}가지` : '맡은 일', si && si.rnr ? esc((si.rnr.resp || []).map((r) => `${r.area} ${r.w}%`).join(' · ')) : '<span class="muted">부서현황판 알앤알 없음</span>') : kv('', '부서 인원', `${members.length}명 · 정보 있는 사람 ${members.filter((s) => staffInfo(s.n)).length}명`)}
        ${kv('아사나', `지금 하는 일 ${tasks.length}건`, esc(tasks.slice(0, 3).map((d) => shortT(d) + (noDue(d) ? '' : `(${md(d.due_at)})`)).join(' · ') || '없음') + (over ? ` · <span class="dir-crit">기한 지남 ${over}건</span>` : ''))}
        ${sel.kind === 'p' ? kv('나의 스토리', si && si.story && si.story.length ? `최근 ${Math.min(3, si.story.length)}편 요지` : '나의 스토리', si && si.story && si.story.length ? esc(si.story.slice(0, 3).map((x) => `"${String(x.title || x.text).slice(0, 34)}"`).join(' · ')) : '<span class="muted">없음</span>') : ''}
        ${kv('상위 목표', '연결될 목표', esc([upD[0] ? `부서목표 「${upD[0].title}」` : '', upC[0] ? `전사 「${upC[0].title}」` : ''].filter(Boolean).join(' · ') || '연결할 상위 목표가 없습니다'))}
        ${sel.kind === 'p' ? kv('아사나', '목표 프로젝트', apBody, 'ap') : ''}
        ${sel.kind === 'p' ? kv('부서현황판', si && si.goals && si.goals.length ? `목표 ${si.goals.length}개(사본)` : '부서현황판 목표', si && si.goals && si.goals.length ? esc(si.goals.slice(0, 3).map((x) => x.name).join(' · ')) : '<span class="muted">없음</span>') : ''}
        ${kv('슬랙', '공개 채널', pf ? `「최근 정보 모아오기」 요약에 들어 있음(${esc(md(String(pf.at).slice(0, 10)))})` : '<span class="muted">아직 모으지 않았습니다 — 위 「최근 정보 모아오기」</span>')}
        ${sel.kind === 'p' ? kv('', '업무 부하', `${loadPill(sel.name)} 진행 중 ${loadOf(sel.name).tasks.length}건${rout.length ? ` · 루틴 ${rout.length}개(일간 ${rout.filter((r) => /일/.test(r.cyc || '')).length})` : ''}`) : ''}
      </div>
      ${pf ? `<details class="og-pf"><summary class="small">최근 정보 요약 보기</summary><div class="dir-repdoc">${mdHtml(pf.text)}</div></details>` : ''}
      ${members.length ? `<div><b>부서원</b> <span class="small muted">누르면 그 사람으로</span><div class="id-pchips" style="margin-top:8px">${members.map((s) => { const [lab, cls] = personStage(s.n); return `<button type="button" class="id-pchip" data-act="ogSel" data-kind="p" data-v="${esc(s.n)}">${esc(s.n)}${s.g ? `<small>${esc(s.g)}</small>` : ''}<span class="st ${cls}">${esc(lab)}</span></button>`; }).join('')}</div></div>` : ''}`;
  }
  /* ② 목표 후보 탭: 근거 한 줄 + 후보 | 목표 리스트 */
  function ogCandTab(sel) {
    const key = sel.kind + ':' + sel.name; const gs = ogFor(sel);
    const cand = gs.filter((g) => g.status !== 'list'); const list = gs.filter((g) => g.status === 'list');
    const si = sel.kind === 'p' ? staffInfo(sel.name) : null;
    const st = sel.kind === 'p' ? staffOf(sel.name) : null; const dept = sel.kind === 'p' ? (st ? st.d : '') : sel.name;
    const tasks = S.directives.filter((d) => !isGoal(d) && isOpen(d) && (sel.kind === 'p' ? d.assignee === sel.name : d.org === sel.name));
    const upD = S.directives.find((d) => d.src === 'goal_d' && d.org === dept && isOpen(d));
    const top = si && si.rnr ? (si.rnr.resp || []).slice().sort((a, b) => (+b.w || 0) - (+a.w || 0))[0] : null;
    const chip = (src, t) => `<span class="og-src ${SRC_CLS[src] || ''}">${src}</span><span>${esc(t)}</span>`;
    const basis = [top ? chip('알앤알', `${top.area} ${top.w}%`) : '', chip('아사나', `하는 일 ${tasks.length}건${tasks.filter(isOverdue).length ? ' · 기한 지남 ' + tasks.filter(isOverdue).length : ''}`), si && si.story && si.story[0] ? chip('나의 스토리', String(si.story[0].title || '').slice(0, 24)) : '', upD ? chip('상위 목표', String(upD.title).slice(0, 24)) : ''].filter(Boolean).join('');
    return `<div class="og-basis"><b>근거</b>${basis}<span class="og-sp"></span><button type="button" class="btn sm" data-act="ogTab" data-v="info">① 정보 탭에서 자세히</button></div>
      <div class="og-cols">
        <section class="og-col" aria-label="목표 후보"><div class="og-colhead"><div><b>목표 후보</b> <span class="num muted">${cand.length}</span></div>
            <div class="row">${OG.busy[key] ? `<span class="small"><span class="dir-spin sm" aria-hidden="true"></span>${esc(OG.busy[key])}</span>` : `<button type="button" class="btn ${cand.length ? '' : 'primary'} sm" data-act="ogGen" data-kind="${sel.kind}" data-v="${esc(sel.name)}">${cand.length ? '🎲 다른 제안' : '인공지능 제안 3개 받기'}</button>`}<button type="button" class="btn sm" data-act="ogNew" data-kind="${sel.kind}" data-v="${esc(sel.name)}">+ 직접 추가</button></div></div>
          ${OG.err[key] ? `<p class="small dir-err">${esc(OG.err[key])}</p>` : ''}
          <p class="small muted" style="margin:0">후보를 누르면 사이드 패널에서 고칩니다. 정해지면 「리스트로 보내기」.</p>
          <div class="og-list">${cand.map(ogCard).join('') || '<p class="small muted">아직 후보가 없습니다. 위 단추로 인공지능 제안을 받거나 직접 추가하세요.</p>'}</div></section>
        <section class="og-col" aria-label="목표 리스트"><div class="og-colhead"><div><b>목표 리스트</b> <span class="num muted">${list.length}</span></div><span class="small muted">후보에서 보낸 목표가 쌓입니다</span></div>
          <div class="og-list">${list.map(ogCard).join('') || '<p class="small muted">아직 리스트에 보낸 목표가 없습니다. 후보의 「리스트로 보내기」를 누르면 여기에 쌓입니다.</p>'}</div></section>
      </div>
      ${isMeN(sel.name) ? '<p class="small muted" style="margin:0">⭐ 회장님 본인 목표에는 「메신저로 지시」가 없고, 아사나 담당은 「나」로 들어갑니다.</p>' : ''}`;
  }
  /* ③ 목표 관리 탭 */
  function ogMngTab(sel) {
    const key = sel.kind + ':' + sel.name;
    const list = ogScopeAll(sel).filter((g) => g.status === 'list');
    list.forEach((g) => { if ((g.sent || {}).asana_gid && !OG.sync[g.id]) setTimeout(() => ogSync(g), 0); });
    const row = (g) => { const lv = ogLvl(g); const plan = ogPlan(g); const pct = ogPct(g); const s = g.sent || {}; const pr = g.progress || {};
      const src = g.link && g.link.total ? `연결 작업 ${g.link.total}건 중 ${g.link.done}건 완료${pr.manual ? ' · 진척은 수기' : ''}<br><span class="muted">${esc(md(String(g.link.at).slice(0, 10)))} 아사나에서 가져옴</span>` : s.asana_gid ? (OG.sync[g.id] === 'busy' ? '아사나 진척 가져오는 중…' : g.link && g.link.main_done ? '아사나 작업 완료' : `아사나 연결 · 하위 작업 없음${pr.manual ? ' · 수기' : ''}`) : `수기 입력 ${pct}%`;
      return `<div class="og-mrow ${lv === 'c' ? 'late' : lv === 'w' ? 'w' : ''}"><button type="button" class="og-mgt" data-act="ogOpen" data-id="${esc(g.id)}"><b>목표 ${ogNo(g)} · ${esc(g.title)}${sel.kind === 'd' && g.who ? ` <small>${esc(g.who)}</small>` : ''}</b><span class="small muted">${g.up ? '↑ ' + esc(g.up) : '↑ 상위 목표 없음'}</span></button>
        <div class="og-mbar"><span class="og-bar ${lv}"><i style="width:${pct}%"></i>${plan != null ? `<s style="left:${plan}%"></s>` : ''}</span><span class="small">진척 ${pct}% · 계획 ${plan == null ? '— (기한 없음)' : plan + '%'} · ${lv === 'c' ? `<b class="dir-crit">${ogGap(g)}%p 뒤처짐</b>` : lv === 'w' ? '<b class="og-wtx">조금 늦음</b>' : '<b class="og-oktx">순조</b>'}</span></div>
        <div class="og-msrc small">${src}${lv === 'c' ? `<br><button type="button" class="dir-link og-todir" data-act="ogToDir" data-id="${esc(g.id)}">④ 지시 탭으로 →</button>` : !s.asana_gid ? ` <button type="button" class="btn sm og-mini" data-act="ogOpen" data-id="${esc(g.id)}">고치기</button>` : ''}</div></div>`; };
    return `<div class="og-colhead"><div><b>목표 관리</b> <span class="small muted">진척은 아사나 연결 작업과 수기 입력으로</span></div>
        <div class="row">${sel.kind === 'p' && !isMeN(sel.name) ? `<button type="button" class="btn sm" data-act="ogQs" data-v="${esc(key)}" ${list.length ? '' : 'disabled'}>1:1 점검 질문 만들기</button><button type="button" class="btn sm" data-act="ogWeekly" data-v="${esc(key)}" ${list.length ? '' : 'disabled'}>주간 보고 받기</button>` : ''}</div></div>
      ${list.length ? `<div class="og-mlist">${list.map(row).join('')}</div>` : `<p class="small muted" style="margin:0">목표 리스트에 보낸 목표가 생기면 여기서 진척을 관리합니다.</p><button type="button" class="btn sm" style="align-self:flex-start" data-act="ogTab" data-v="cand">② 목표 후보 탭으로</button>`}
      ${OG.pm[key] && OG.pm[key].kind !== 'dir' ? ogPmBox(sel) : ''}`;
  }
  /* ④ 지시 탭 */
  function ogDirTab(sel) {
    const key = sel.kind + ':' + sel.name; const ui = ogUi();
    const all = ogScopeAll(sel);
    let late = all.filter((g) => g.status === 'list' && ogLvl(g) === 'c');
    if (ui.focus) late = late.sort((a, b) => (b.id === ui.focus) - (a.id === ui.focus));
    const wait = S.directives.filter((d) => !isGoal(d) && d.status === '보고대기' && (sel.kind === 'p' ? d.assignee === sel.name : d.org === sel.name));
    const sent = [].concat(...all.map((g) => (g.dirs || []).map((d) => ({ g, d })))).sort((a, b) => String(b.d.at).localeCompare(String(a.d.at))).slice(0, 8);
    const box = OG.pm[key] && OG.pm[key].kind === 'dir' ? ogPmBox(sel) : '<div class="og-pmempty small muted">왼쪽에서 지시를 고르면 여기에 지시서가 근거 · 완료 조건과 함께 써집니다.</div>';
    return `<div class="og-colhead"><div><b>필요한 지시</b> <span class="small muted">뒤처진 목표(계획보다 15%p 이상)에서만 올라옵니다</span></div></div>
      <div class="og-cols">
        <div class="og-list">
          ${late.map((g) => `<div class="og-dir ${ui.focus === g.id ? 'focus' : ''}"><b>목표 ${ogNo(g)}${sel.kind === 'd' && g.who ? `(${esc(g.who)})` : ''} · ${esc(g.title)}이 ${ogGap(g)}%p 뒤처짐 → 무엇이 필요할까요?</b>
            <div class="small" style="margin:4px 0">근거: ${esc(ogWhyLate(g))}</div>
            ${isMeN(g.who) ? '<div class="small muted">회장님 본인 목표입니다 — 일정을 직접 조정하세요.</div>' : `<div class="row">${Object.entries(DIR_KINDS).map(([k, t], i) => `<button type="button" class="btn sm ${i ? '' : 'primary'}" data-act="ogDir" data-id="${esc(g.id)}" data-k="${k}" data-v="${esc(key)}">${t}</button>`).join('')}</div>`}</div>`).join('')}
          ${wait.length ? `<div class="og-dir w"><b>회장님 확인 대기 ${wait.length}건</b><div class="small" style="margin:4px 0">이건 지시가 아니라 <b>회장님이 할 일</b>입니다 · ${esc(wait.slice(0, 3).map(shortT).join(' · '))}</div><button type="button" class="btn sm" data-act="ogGoWait">이전 지시 관리에서 확인하기 →</button></div>` : ''}
          ${!late.length && !wait.length ? '<p class="small muted" style="margin:0">지금은 뒤처진 목표가 없습니다. 목표가 계획보다 15%p 이상 늦으면 여기에 근거와 함께 올라옵니다.</p>' : ''}
          ${sent.length ? `<div class="og-sent"><b>보낸 지시</b>${sent.map(({ g, d }) => { const diff = ogPct(g) - (+d.pct || 0); return `<div class="small">${esc(md(String(d.at).slice(0, 10)))} · 목표 「${esc(g.title)}」 ${esc(DIR_KINDS[d.k] || '지시')}(${d.via === 'slack' ? '슬랙' : '아사나'}) → 그 뒤 진척 <b class="${diff > 0 ? 'og-oktx' : ''}">${diff >= 0 ? '+' : ''}${diff}%p</b></div>`; }).join('')}</div>` : ''}
        </div>
        <div>${box}</div>
      </div>`;
  }
  const OG_WARN = `<div class="og-warnbox"><b>⛔ 주의 — 의도대로 안 되는 부분</b><br>1) 「나의 스토리·알앤알·루틴」은 부서현황판 자료라서 지금은 <b>11월 7일 사본</b>입니다. 연결 도구(또는 구글 시트 원본)가 생겨야 매일 최신이 됩니다.<br>2) 여기서 정한 목표를 <b>부서현황판에 써 넣을 수는 없습니다.</b> 회장 현황판에 저장하고, 아사나로 보낼 수 있습니다.<br>3) 「메신저로 지시」로 보낸 목표는 <b>받은 사람이 직접 아사나에 등록</b>합니다. 받은 링크를 패널의 「아사나 링크 붙이기」에 붙이면 진척이 이어집니다.</div>`;
  function ogPerson(sel) {
    const ui = ogUi(); const tab = OG_TABS.some((t) => t[0] === ui.tab) ? ui.tab : 'cand';
    const body = tab === 'info' ? ogInfoTab(sel) : tab === 'mng' ? ogMngTab(sel) : tab === 'dir' ? ogDirTab(sel) : ogCandTab(sel);
    return `${ogHead(sel)}${ogTabsHtml(sel)}<div class="og-tabbody" role="tabpanel" aria-labelledby="og-tab-${tab}">${body}</div>${OG_WARN}`;
  }
  function ogOverview() {
    const all = ogAll(); const ppl = staffList();
    const rows = deptsAll().filter((dp) => dp !== '회장').map((dp) => { const ms = ppl.filter((s) => s.d === dp); const gs = all.filter((g) => g.dept === dp); const listed = gs.filter((g) => g.status === 'list'); return { dp, n: ms.length, info: ms.filter((s) => staffInfo(s.n) || profileOf('p:' + s.n)).length, withGoal: ms.filter((s) => listed.some((g) => g.who === s.n)).length, waitP: ms.filter((s) => !listed.some((g) => g.who === s.n) && gs.some((g) => g.who === s.n)).length, behind: listed.filter((g) => ogLvl(g) === 'c').length, need: listed.filter((g) => ogLvl(g) === 'c' && !(g.dirs || []).length).length, sentD: gs.reduce((a, g) => a + (g.dirs || []).length, 0), avg: listed.length ? Math.round(listed.reduce((a, g) => a + ogPct(g), 0) / listed.length) : null }; }).filter((r) => r.n);
    const sum = (k) => rows.reduce((a, r) => a + r[k], 0);
    const go = (r, v, cls) => (v ? `<button type="button" class="dir-link og-numlink ${cls || ''}" data-act="ogSelTab" data-kind="d" data-v="${esc(r.dp)}" data-tab="dir" title="${esc(r.dp)} ④ 지시 탭 열기">${v} ↘</button>` : (v === 0 ? '0' : '—'));
    const btn = (r) => (!r.info ? `<button type="button" class="btn sm" data-act="ogInfoGo" data-v="${esc(r.dp)}">정보 모으기</button>` : !r.withGoal ? `<button type="button" class="btn primary sm" data-act="ogSelTab" data-kind="d" data-v="${esc(r.dp)}" data-tab="cand">목표 후보 만들기</button>` : `<button type="button" class="btn sm" data-act="ogSel" data-kind="d" data-v="${esc(r.dp)}">열기</button>`);
    const n = ppl.filter((s) => !s.me).length;
    return `<section class="panel"><div class="row" style="justify-content:space-between"><b style="font-size:17px">전사 진행 현황</b><span class="small muted">${n}명 · ${esc(md(todayKST()))} 기준</span></div>
      <div class="og-steps" style="margin-top:10px"><div class="og-stp ${sum('info') ? 'done' : 'on'}"><b>① 정보</b><span class="small">${sum('info')}명 있음 · ${n - sum('info')}명 부족</span></div><div class="og-stp on"><b>② 목표 후보</b><span class="small">후보만 있는 사람 ${sum('waitP')}명</span></div><div class="og-stp ${sum('behind') ? 'on' : ''}"><b>③ 목표 관리</b><span class="small">목표 있는 사람 ${sum('withGoal')}명 · 뒤처짐 ${sum('behind')}개</span></div><div class="og-stp ${sum('need') ? 'on' : ''}"><b>④ 지시</b><span class="small">필요 ${sum('need')}건 · 보낸 지시 ${sum('sentD')}건</span></div></div>
      <div class="tbl-wrap"><table class="dir-tbl og-tbl"><thead><tr><th>부서</th><th>인원</th><th>정보</th><th>목표 있는 사람</th><th>평균 진척</th><th>뒤처진 목표</th><th>필요한 지시</th><th></th></tr></thead><tbody>
      ${rows.map((r) => `<tr><td data-label="부서"><button type="button" class="dir-link" data-act="ogSel" data-kind="d" data-v="${esc(r.dp)}">${esc(r.dp)}</button></td><td class="num" data-label="인원">${r.n}</td><td class="num ${r.info ? '' : 'dir-crit'}" data-label="정보">${r.info}/${r.n}</td><td class="num" data-label="목표 있는 사람">${r.withGoal}/${r.n}</td><td class="num" data-label="평균 진척">${r.avg == null ? '—' : r.avg + '%'}</td><td class="num ${r.behind ? 'dir-crit' : ''}" data-label="뒤처진 목표">${go(r, r.behind, 'crit')}</td><td class="num" data-label="필요한 지시">${r.need ? go(r, r.need) : '—'}</td><td>${btn(r)}</td></tr>`).join('')}</tbody></table></div>
      <p class="small muted" style="margin:8px 0 0">「뒤처진 목표」 · 「필요한 지시」 숫자를 누르면 그 부서의 ④ 지시 탭이 바로 열립니다. 왼쪽 조직도에서 부서·사람을 골라도 됩니다.</p></section>${OG_WARN}`;
  }
  function ogTree(sel) {
    const ui = ogUi(); const q = ui.tq.trim(); const ppl = staffList();
    const qm = (s) => !q || [s.n, s.d, s.g].join(' ').includes(q) || cho(s.n).includes(q);
    const depts = deptsAll().filter((dp) => dp !== '회장' && ppl.some((s) => s.d === dp) && (!q || dp.includes(q) || ppl.some((s) => s.d === dp && qm(s))));
    const dcls = (x, y) => (y && x === y ? 's2' : y && x / y >= 0.3 ? 's1' : 's0');
    const meSt = personStage(ME_STAFF.n);
    return `<aside class="panel og-tree" aria-label="조직도"><h4>조직</h4><input type="text" id="og-tq" class="og-tq" placeholder="부서·이름·초성 찾기" value="${esc(ui.tq)}" data-ogq="1" aria-label="조직도에서 찾기">
      <button type="button" class="og-dep ${!sel ? 'on' : ''}" data-act="ogSel" data-kind="" data-v="">전체 현황</button>
      ${depts.map((dp) => { const allm = ppl.filter((s) => s.d === dp); const ms = allm.filter(qm); const open = q || (sel && (sel.name === dp || (sel.kind === 'p' && (staffOf(sel.name) || {}).d === dp))); const x = allm.filter((s) => ogAll().some((g) => g.who === s.n && g.status === 'list')).length; return `<button type="button" class="og-dep ${sel && sel.kind === 'd' && sel.name === dp ? 'on' : ''}" data-act="ogSel" data-kind="d" data-v="${esc(dp)}"><span>${open ? '▾' : '▸'} ${esc(dp)}</span><span class="st ${dcls(x, allm.length)}">목표 ${x}/${allm.length}</span></button>${open ? ms.map((s) => { const [lab, cls] = personStage(s.n); return `<button type="button" class="og-per ${sel && sel.kind === 'p' && sel.name === s.n ? 'on' : ''}" data-act="ogSel" data-kind="p" data-v="${esc(s.n)}"><span>${esc(s.n)}${s.g ? ` <small>${esc(s.g)}</small>` : ''}</span><span class="st ${cls}">${esc(lab)}</span></button>`; }).join('') : ''}`; }).join('')}
      <button type="button" class="og-dep me ${sel && sel.kind === 'p' && sel.name === ME_STAFF.n ? 'on' : ''}" data-act="ogSel" data-kind="p" data-v="${ME_STAFF.n}"><span>⭐ 나(윤석범)</span><span class="st ${meSt[1]}">${meSt[0]}</span></button>
    </aside>`;
  }
  /* ---------- 사이드 패널 (아사나처럼): 왼쪽 채팅 · 오른쪽 내용 ---------- */
  function ogActBox(g) {
    const ui = ogUi(); const act = ui.act; if (!act) return '';
    const L = ogLocOf(g); const busy = OG.send[g.id]; const sent = g.sent || {};
    const to = act === 'asana' ? (L.who || ME_STAFF.n) : (L.who || g.who); const st = to ? staffOf(to) : null;
    const toLine = `<div class="og-to">받는 사람: ${to ? esc(to + (st && st.g ? ' ' + st.g : '') + (st && st.d && !st.me ? ' · ' + st.d : '')) : '담당을 먼저 정해 주세요'}${act === 'msg' ? ' <small>(슬랙 개인 메시지)</small>' : ''}</div>`;
    const rec = ogRecProj(L.who); const projItems = (OG.proj.list || []).map((p) => ({ n: p.name, d: rec && rec.gid === p.gid ? '추천' : '', g: '' }));
    const secs = L.project ? ((OG.sec[L.project] || {}).list || []) : [];
    const secState = L.project ? (OG.sec[L.project] || {}).state : '';
    const projField = `<div class="og-f"><span>아사나 프로젝트</span>${!LIVE.mcp ? '<span class="small muted">아사나에 연결된 화면에서 고를 수 있습니다</span>' : OG.proj.busy && !OG.proj.list ? '<span class="small"><span class="dir-spin sm" aria-hidden="true"></span>프로젝트 목록을 불러오는 중…</span>' : picker({ key: 'og-pj-' + g.id, list: projItems, pri: '추천', value: L.pname, empty: '프로젝트 없이 담당자 「내 작업」에만', act: 'ogLoc', data: { id: g.id, k: 'project' }, label: '아사나 프로젝트', none: '맞는 프로젝트가 없습니다', unit: '개' })}${OG.proj.err ? `<span class="small dir-err">${esc(OG.proj.err)}</span>` : ''}</div>`;
    const secField = L.project ? `<div class="og-f"><span>섹션</span>${secState === 'loading' ? '<span class="small"><span class="dir-spin sm" aria-hidden="true"></span>섹션을 불러오는 중…</span>' : picker({ key: 'og-sc-' + g.id, list: secs.filter((s) => s.name !== '취소').map((s) => ({ n: s.name, d: s.name === '개별 목표' ? '추천' : '', g: '' })), pri: '추천', value: L.sname, empty: '섹션 없이', act: 'ogLoc', data: { id: g.id, k: 'section' }, label: '아사나 섹션', none: '맞는 섹션이 없습니다', unit: '개' })}</div>` : '';
    const chk = (k, t, on) => `<label class="og-chk"><input type="checkbox" data-act="ogLocChk" data-id="${esc(g.id)}" data-k="${k}" ${on ? 'checked' : ''}> ${t}</label>`;
    if (act === 'msg') {
      const text = OG.msgDraft[g.id] || ogMsg(g, L);
      return `<div class="og-actbox" role="region" aria-label="메신저로 지시">${toLine}
        <div class="og-grid">${projField}${secField}</div>
        <span class="small muted">받은 사람이 아래 글을 클로드에 붙여 넣고 "아사나에 등록해 줘"라고 하면 바로 등록되게 썼습니다. 보내기 전에 고칠 수 있습니다.</span>
        <textarea id="og-msg" rows="14" aria-label="보낼 글">${esc(text)}</textarea>
        ${g.status !== 'list' ? chk('toList', '보내면서 목표 리스트로도 옮기기', L.toList) : ''}
        <div class="row">${busy ? `<span class="small"><span class="dir-spin sm" aria-hidden="true"></span>${esc(busy)}</span>` : `<button type="button" class="btn primary sm" data-act="ogMsgGo" data-id="${esc(g.id)}" ${to && LIVE.mcp ? '' : 'disabled'}>슬랙으로 보내기</button><button type="button" class="btn sm" data-act="ogCopyMsg" data-id="${esc(g.id)}">글 복사</button><button type="button" class="dir-link" data-act="ogAct" data-id="${esc(g.id)}" data-v="">닫기</button>`}</div>
        ${LIVE.mcp ? '' : '<p class="small dir-warn" style="margin:0">슬랙에 연결된 화면(클로드 웹에서 연 현황판)에서만 보낼 수 있습니다. 「글 복사」로 직접 붙여 넣으셔도 됩니다.</p>'}</div>`;
    }
    const res = OG.res[g.id];
    const nSub = (g.subs || []).filter(Boolean).length;
    return `<div class="og-actbox" role="region" aria-label="아사나로 보내기">${toLine}
      <div class="og-f"><span>담당자</span>${picker({ key: 'og-aw-' + g.id, list: staffList(), value: isMeN(L.who) ? '' : L.who, empty: '나(윤석범)', act: 'ogLoc', data: { id: g.id, k: 'who' }, load: true, label: '아사나 담당자' })}</div>
      <div class="og-grid">${projField}${secField}</div>
      <label class="og-f" style="max-width:220px"><span>기한</span><input type="date" id="og-adue-${esc(g.id)}" data-act="ogLoc" data-id="${esc(g.id)}" data-k="due" value="${esc(L.due)}"></label>
      <div class="og-chks">${chk('subs', `하위 작업 ${nSub}개 함께 만들기`, L.subs && nSub)}${isMeN(L.who) || !L.who ? '' : chk('follow', '나(회장)도 팔로워로 넣기 — 진행 소식 받기', L.follow)}${g.status !== 'list' ? chk('toList', '보내면서 목표 리스트로도 옮기기', L.toList) : ''}</div>
      ${sent.asana_gid && !res ? `<p class="small dir-warn" style="margin:0">이 목표는 ${esc(md(String(sent.asana_at || '').slice(0, 10)))}에 아사나로 보낸 적이 있습니다. 또 만들면 중복됩니다.</p>` : ''}
      <div class="row">${busy ? `<span class="small"><span class="dir-spin sm" aria-hidden="true"></span>${esc(busy)}</span>` : res ? `<span class="small"><b class="og-oktx">등록됨</b> · <a href="https://app.asana.com/0/0/${esc(res.gid)}" target="_blank" rel="noopener noreferrer">아사나에서 열기 ↗</a>${res.n ? ` · 하위 작업 ${res.ok}/${res.n}` : ''}</span><button type="button" class="dir-link" data-act="ogAct" data-id="${esc(g.id)}" data-v="">닫기</button>` : `<button type="button" class="btn primary sm" data-act="ogAsanaGo" data-id="${esc(g.id)}" ${LIVE.mcp ? '' : 'disabled'}>확인하고 아사나에 등록</button><button type="button" class="dir-link" data-act="ogAct" data-id="${esc(g.id)}" data-v="">닫기</button>`}</div>
      ${LIVE.mcp ? '' : '<p class="small dir-warn" style="margin:0">아사나에 연결된 화면(클로드 웹에서 연 현황판)에서만 등록할 수 있습니다.</p>'}</div>`;
  }
  const OG_CHIPS = ['지표를 숫자로 더 분명하게', '기한을 한 달 당겨 줘', '왜 이 사람인지 근거를 보강해 줘', '하위 작업을 5개로 나눠 줘'];
  function ogPane() {
    const ui = ogUi(); const g = ui.open && ogOf(ui.open); if (!g) return '';
    const sent = g.sent || {}; const chg = OG.chg[g.id] || []; const C = (k) => (chg.includes(k) ? ' og-chg' : '');
    const isList = g.status === 'list';
    const fld = (k, ph, ta) => (ta ? `<textarea rows="3" class="${C(k)}" data-ogk="${k}" data-id="${esc(g.id)}" placeholder="${esc(ph || '')}" aria-label="${esc(OG_LAB[k] || k)}">${esc(g[k] || '')}</textarea>` : `<input type="text" class="${C(k)}" data-ogk="${k}" data-id="${esc(g.id)}" value="${esc(g[k] || '')}" placeholder="${esc(ph || '')}" aria-label="${esc(OG_LAB[k] || k)}">`);
    const chat = g.chat || [];
    const link = g.link || {};
    const asanaRow = sent.asana_gid
      ? `<span class="small"><a href="https://app.asana.com/0/0/${esc(sent.asana_gid)}" target="_blank" rel="noopener noreferrer">아사나 작업 열기 ↗</a>${sent.project ? ` · ${esc(sent.project)}${sent.section ? ' › ' + esc(sent.section) : ''}` : ''}${link.total ? ` · 하위 작업 ${link.done}/${link.total} 완료` : ''}</span>`
      : `<div class="og-linkin">${OG.link[g.id] ? `<span class="small"><span class="dir-spin sm" aria-hidden="true"></span>${esc(OG.link[g.id])}</span>` : `<input type="text" id="og-link-${esc(g.id)}" data-oglink="${esc(g.id)}" placeholder="${sent.wait_link ? '받은 아사나 링크를 붙여 넣으세요' : '아직 안 보냄 · 아사나 링크가 있으면 붙여 넣기'}" value="${esc(OG.linkDraft[g.id] || '')}" aria-label="아사나 링크 붙이기"><button type="button" class="btn sm" data-act="ogLinkGo" data-id="${esc(g.id)}">붙이기</button>`}</div>`;
    const log = (g.log || []).slice().reverse().slice(0, 12);
    return `<aside class="dir-pane og-pane" role="dialog" aria-label="목표 고치기" id="og-dlg" tabindex="-1">
      <div class="dir-pane-bar"><span class="st ${isList ? 's2' : 's1'}">${isList ? '목표 리스트' : '목표 후보'}</span><b class="id-panetitle">${esc(g.who || g.dept)}</b>
        ${isList ? `<button type="button" class="btn sm" data-act="ogToCand" data-id="${esc(g.id)}">후보로 되돌리기</button>` : `<button type="button" class="btn primary sm" data-act="ogToList" data-id="${esc(g.id)}">리스트로 보내기 →</button>`}
        <span class="dir-pane-sp"></span>
        ${sent.asana_gid ? `<a class="dir-iconbtn" href="https://app.asana.com/0/0/${esc(sent.asana_gid)}" target="_blank" rel="noopener noreferrer">아사나에서 열기 ↗</a>` : ''}
        ${ui.del === g.id ? `<span class="small">지울까요?</span><button type="button" class="btn sm dir-dangerbtn" data-act="ogDelGo" data-id="${esc(g.id)}">지우기</button><button type="button" class="btn sm" data-act="ogDel" data-id="">취소</button>` : `<button type="button" class="dir-iconbtn danger" data-act="ogDel" data-id="${esc(g.id)}">삭제</button>`}
        <button type="button" class="dir-iconbtn" data-act="ogClose">닫기 →|</button></div>
      <div class="og-mtabs" role="tablist" aria-label="패널 보기"><button type="button" role="tab" aria-selected="${ui.mtab !== 'chat'}" class="${ui.mtab !== 'chat' ? 'on' : ''}" data-act="ogMtab" data-v="body">내용</button><button type="button" role="tab" aria-selected="${ui.mtab === 'chat'}" class="${ui.mtab === 'chat' ? 'on' : ''}" data-act="ogMtab" data-v="chat">인공지능과 고치기</button></div>
      <div class="og-panebody" data-m="${ui.mtab === 'chat' ? 'chat' : 'body'}">
        <section class="og-chat" aria-label="인공지능과 고치기"><b>인공지능과 고치기</b><span class="small muted">말하면 오른쪽 내용이 바뀝니다. 바뀐 칸은 노랗게 표시됩니다.</span>
          <div class="og-msgs">${chat.length ? chat.map((m, i) => `<div class="og-m ${m.role === 'user' ? 'u' : 'a'}${m.err ? ' err' : ''}"><b>${m.role === 'user' ? '회장님' : '인공지능'}</b><p>${esc(m.text)}</p>${m.keys && m.keys.length ? `<span class="small muted">바뀐 칸: ${esc(m.keys.map((k) => OG_LAB[k]).join(' · '))}</span>${m.undone ? ' <span class="small muted">· 되돌림</span>' : ` <button type="button" class="btn sm og-mini" data-act="ogUndo" data-id="${esc(g.id)}" data-i="${i}">되돌리기</button>`}` : ''}</div>`).join('') : '<p class="small muted">아직 대화가 없습니다. 아래 단추를 눌러 바로 시작해도 됩니다.</p>'}${OG.chat[g.id] ? '<div class="og-m a"><span class="dir-spin sm" aria-hidden="true"></span> 고치는 중…</div>' : ''}</div>
          <div class="og-chips">${OG_CHIPS.map((c) => `<button type="button" class="og-chip" data-act="ogChip" data-id="${esc(g.id)}" data-v="${esc(c)}" ${OG.chat[g.id] ? 'disabled' : ''}>${esc(c)}</button>`).join('')}</div>
          <div class="og-chatin"><textarea id="og-chatin" rows="3" placeholder="어떻게 고칠까요?" aria-label="인공지능에게 고칠 내용 말하기">${esc(OG.chatDraft || '')}</textarea><button type="button" class="btn primary sm" data-act="ogChatGo" data-id="${esc(g.id)}" ${OG.chat[g.id] ? 'disabled' : ''}>보내기</button></div></section>
        <section class="og-detail" aria-label="목표 내용">
          <textarea rows="2" class="og-title${C('title')}" data-ogk="title" data-id="${esc(g.id)}" aria-label="목표">${esc(g.title)}</textarea>
          <div class="row og-panebtns">${isMeN(g.who) ? '' : `<button type="button" class="btn sm ${ui.act === 'msg' ? 'on' : ''}" data-act="ogAct" data-id="${esc(g.id)}" data-v="msg">메신저로 지시</button>`}<button type="button" class="btn sm ${ui.act === 'asana' ? 'on' : ''}" data-act="ogAct" data-id="${esc(g.id)}" data-v="asana">아사나로 보내기</button></div>
          ${ogActBox(g)}
          <div class="og-rows">
            <div class="og-r"><span>담당</span>${picker({ key: 'og-who-' + g.id, list: staffList(), pri: g.dept || '', value: g.who || '', empty: g.scope === 'd' ? '부서 전체' : '미정', act: 'ogSet', data: { id: g.id, k: 'who' }, load: true, label: '목표 담당' })}</div>
            <div class="og-r"><span>기한</span><input type="date" class="${C('due')}" data-ogk="due" data-id="${esc(g.id)}" value="${esc(g.due || '')}" aria-label="기한"></div>
            <div class="og-r"><span>상위 목표</span>${fld('up', '이어지는 부서·전사 목표')}</div>
            <div class="og-r"><span>아사나</span>${asanaRow}</div>
          </div>
          <div class="og-grid3"><label class="og-f"><span>지표</span>${fld('metric', '무엇으로 재나')}</label><label class="og-f"><span>지금 값</span>${fld('cur', '측정 필요')}</label><label class="og-f"><span>목표 값</span>${fld('target', '예: 95%')}</label></div>
          <label class="og-f"><span>설명 · 왜 ${g.who ? '이 사람' : '이 부서'}에게</span>${fld('why', '근거', true)}</label>
          <label class="og-f"><span>하위 작업 <small class="muted">한 줄에 하나씩</small></span><textarea rows="4" class="${C('subs')}" data-ogk="subs" data-id="${esc(g.id)}" aria-label="하위 작업">${esc((g.subs || []).join('\n'))}</textarea></label>
          ${link.items && link.items.length ? `<div class="og-linkitems small">${link.items.map((x) => `<span>${x.done ? '☑' : '☐'} ${esc(x.name)}${x.due ? ` <span class="muted">(${esc(md(x.due))})</span>` : ''}</span>`).join('')}</div>` : ''}
          ${isList ? `<div class="og-grid"><label class="og-f"><span>진척(%) <small class="muted">${(g.progress || {}).manual ? '수기' : (g.progress || {}).src === 'asana' ? '아사나에서' : '수기'}</small></span><input type="number" min="0" max="100" data-ogk="pct" data-id="${esc(g.id)}" value="${ogPct(g)}"></label><div class="og-f"><span>계획</span><div class="small">${ogPlan(g) == null ? '기한을 넣으면 계산됩니다' : ogPlan(g) + '% (리스트에 넣은 날부터 기한까지 지난 비율)'}</div></div></div>` : ''}
          <div class="og-log"><b>활동</b>${log.length ? log.map((x) => `<span class="small muted">${esc(when(x.at))} ${esc(x.t)}</span>`).join('') : '<span class="small muted">기록 없음</span>'}</div>
          <p class="small muted" style="margin:0">칸을 고치고 다른 곳을 누르면 저장됩니다. Esc나 패널 바깥을 누르면 닫힙니다.</p>
        </section>
      </div>
    </aside>`;
  }
  function viewOrders() {
    normalize();
    const ui = ogUi(); const sel = ui.sel;
    document.body.classList.toggle('dir-lock', !!(ui.open && ogOf(ui.open)));
    if (LIVE.state === 'loading' && !S.liveMode) return `<div class="view-head"><div><h2>지시 관리</h2><p>직원 정보와 목표를 불러오고 있습니다.</p></div></div><div class="panel dir-loading" role="status"><span class="dir-spin" aria-hidden="true"></span><b>불러오는 중…</b></div>`;
    return `<div class="view-head"><div><h2>지시 관리</h2><p>부서·직원마다 정보를 모아 목표를 만들고, 목표를 관리하면서 필요한 지시를 내립니다.</p></div></div>
      <div class="og-wrap">${ogTree(sel)}<div class="og-main">${sel ? ogPerson(sel) : ogOverview()}</div></div>${ogPane()}`;
  }
  APP.views.orders = viewOrders;

  /* ---------- 동작 ---------- */
  const ogOpenPane = (id, act) => { const ui = ogUi(); if (ui.open !== id) { OG.chg[ui.open] = null; ui.mtab = 'body'; } ui.open = id; ui.act = act || null; ui.del = null; S.ui.dirOpen = null; if (act === 'asana' || act === 'msg') setTimeout(ogProjects, 0); };
  APP.acts.ogSel = (el) => { const k = el.dataset.kind; const v = el.dataset.v; const ui = ogUi(); ui.sel = k ? { kind: k, name: v } : null; ui.open = null; ui.act = null; ui.focus = null; window.scrollTo(0, 0); };
  APP.acts.ogSelTab = (el) => { const ui = ogUi(); ui.sel = { kind: el.dataset.kind, name: el.dataset.v }; ui.tab = el.dataset.tab; ui.open = null; ui.act = null; ui.focus = null; window.scrollTo(0, 0); };
  APP.acts.ogTab = (el) => { const ui = ogUi(); ui.tab = el.dataset.v; ui.focus = null; focusLater('#og-tab-' + ui.tab); };
  APP.acts.ogMtab = (el) => { ogUi().mtab = el.dataset.v; };
  APP.acts.ogToDir = (el) => { const ui = ogUi(); ui.tab = 'dir'; ui.focus = el.dataset.id; };
  APP.acts.ogGen = (el) => { const sel = { kind: el.dataset.kind, name: el.dataset.v }; setTimeout(() => ogGen(sel), 0); };
  APP.acts.ogNew = (el) => { const kind = el.dataset.kind; const name = el.dataset.v; const st = kind === 'p' ? staffOf(name) : null; const id = 'og' + Date.now().toString(36); ogSave(id, { scope: kind, who: kind === 'p' ? name : '', dept: kind === 'p' ? (st ? st.d : '') : name, title: '새 목표', metric: '', cur: '측정 필요', target: '', due: '', up: '', why: '', subs: [], status: 'cand', from: 'manual', chat: [], log: [{ at: nowIso(), t: '직접 추가' }] }, true).then(() => rerender()); ogOpenPane(id); focusLater('#og-dlg .og-title'); };
  APP.acts.ogOpen = (el) => { const id = el.dataset.id; if (!id) return; const ui = ogUi(); if (ui.open === id && !ui.act) { ui.open = null; return; } ogOpenPane(id); };
  APP.acts.ogClose = () => { const ui = ogUi(); OG.chg[ui.open] = null; ui.open = null; ui.act = null; ui.del = null; };
  APP.acts.ogAct = (el) => { const v = el.dataset.v || null; const g = ogOf(el.dataset.id); if (!g) return; if (v && OG.loc[g.id] && OG.loc[g.id].who !== (g.who || '')) delete OG.loc[g.id]; if (v === 'asana') delete OG.res[g.id]; ogOpenPane(g.id, v); };
  APP.acts.ogToList = (el) => { const g = ogOf(el.dataset.id); if (!g) return; ogSave(g.id, Object.assign({ status: 'list', listed_at: nowIso(), progress: g.progress || { pct: 0 } }, ogLogPatch(g, '목표 리스트로 옮김'))); logAct('goal_list', `목표 「${g.title}」을 리스트로 보냄`, g.id); toast('목표 리스트로 보냈습니다 — ③ 목표 관리 탭에서 진척을 봅니다'); };
  APP.acts.ogToCand = (el) => { const g = ogOf(el.dataset.id); if (g) ogSave(g.id, Object.assign({ status: 'cand' }, ogLogPatch(g, '후보로 되돌림'))); };
  APP.acts.ogDel = (el) => { ogUi().del = el.dataset.id || null; };
  APP.acts.ogDelGo = (el) => { const ui = ogUi(); ogDel(el.dataset.id); ui.open = null; ui.del = null; ui.act = null; toast('목표를 지웠습니다'); };
  APP.acts.ogCopyMsg = () => { const t = document.getElementById('og-msg'); const v = t ? t.value : ''; try { navigator.clipboard.writeText(v).then(() => toast('글을 복사했습니다'), () => { if (t) t.select(); toast('글을 선택했습니다 — 복사 단축키로 복사하세요'); }); } catch (e) { if (t) t.select(); } };
  APP.acts.ogMsgGo = (el) => { const g = ogOf(el.dataset.id); const t = document.getElementById('og-msg'); const msg = (t ? t.value : '').trim(); if (!g || !msg) return; const L = ogLocOf(g); setTimeout(() => ogSendMsg(g, msg, L), 0); };
  APP.acts.ogAsanaGo = (el) => { const g = ogOf(el.dataset.id); if (!g) return; const L = Object.assign({}, ogLocOf(g)); setTimeout(() => ogSendAsana(g, L), 0); };
  APP.acts.ogLocChk = (el) => { const g = ogOf(el.dataset.id); if (!g) return; const L = ogLocOf(g); L[el.dataset.k] = !!el.checked; };
  APP.changes.ogLoc = (el) => {
    const g = ogOf(el.dataset.id); if (!g) return; const L = ogLocOf(g); const k = el.dataset.k; const v = el.value;
    if (k === 'project') { const p = (OG.proj.list || []).find((x) => x.name === v); L.auto = false; L.project = p ? p.gid : ''; L.pname = p ? p.name : ''; L.section = ''; L.sname = ''; L.secAuto = true; if (p) ogSections(p.gid); }
    else if (k === 'section') { const s = ((OG.sec[L.project] || {}).list || []).find((x) => x.name === v); L.section = s ? s.gid : ''; L.sname = s ? s.name : ''; L.secAuto = false; }
    else if (k === 'who') { L.who = v || ''; if (L.auto) { L.project = ''; L.pname = ''; L.section = ''; L.sname = ''; } }
    else if (k === 'due') { L.due = v; }
    ogLocOf(g); ogMsgLoc(g, L);
  };
  APP.changes.ogSet = (el) => { const g = ogOf(el.dataset.id); if (!g) return; const p = { [el.dataset.k]: el.value }; if (el.dataset.k === 'who' && el.value && staffOf(el.value)) p.dept = staffOf(el.value).d; delete OG.loc[g.id]; ogSave(g.id, Object.assign(p, ogLogPatch(g, `담당을 ${el.value || '미정'}(으)로 바꿈`))); };
  APP.acts.ogChatGo = (el) => { const g = ogOf(el.dataset.id); const t = document.getElementById('og-chatin'); const text = (t ? t.value : '').trim(); if (!g || !text) return; OG.chatDraft = ''; setTimeout(() => ogChat(g, text), 0); };
  APP.acts.ogChip = (el) => { const g = ogOf(el.dataset.id); if (!g) return; const text = el.dataset.v; setTimeout(() => ogChat(g, text), 0); };
  APP.acts.ogUndo = (el) => { const g = ogOf(el.dataset.id); const i = +el.dataset.i; const m = g && (g.chat || [])[i]; if (!m || !m.prev || m.undone) return; const chat = g.chat.map((x, j) => (j === i ? Object.assign({}, x, { undone: true }) : x)); ogSave(g.id, Object.assign({}, m.prev, { chat }, ogLogPatch(g, '채팅으로 바꾼 것 되돌림'))); OG.chg[g.id] = Object.keys(m.prev); toast('되돌렸습니다'); };
  APP.acts.ogLinkGo = (el) => { const g = ogOf(el.dataset.id); const t = document.getElementById('og-link-' + el.dataset.id); if (!g) return; const v = (t ? t.value : OG.linkDraft[g.id] || '').trim(); setTimeout(() => ogLinkAsana(g, v), 0); };
  APP.acts.ogQs = (el) => { const v = el.dataset.v; const i = v.indexOf(':'); const sel = { kind: v.slice(0, i), name: v.slice(i + 1) }; setTimeout(() => ogQs(sel), 0); };
  APP.acts.ogWeekly = (el) => { const v = el.dataset.v; const i = v.indexOf(':'); OG.pm[v] = { kind: 'wk', title: '주간 보고 요청', text: ogWeekly({ kind: v.slice(0, i), name: v.slice(i + 1) }) }; };
  APP.acts.ogDir = (el) => { const g = ogOf(el.dataset.id); if (!g) return; OG.pm[el.dataset.v] = { kind: 'dir', k: el.dataset.k, gid: g.id, title: '지시서 — ' + DIR_KINDS[el.dataset.k], text: ogDirText(g, el.dataset.k) }; ogUi().focus = g.id; focusLater('#og-pm'); };
  APP.acts.ogPmClose = (el) => { delete OG.pm[el.dataset.v]; };
  APP.acts.ogPmCopy = () => { const t = document.getElementById('og-pm'); const v = t ? t.value : ''; try { navigator.clipboard.writeText(v).then(() => toast('글을 복사했습니다'), () => { if (t) t.select(); toast('글을 선택했습니다 — 복사 단축키로 복사하세요'); }); } catch (e) { if (t) t.select(); } };
  APP.acts.ogPmSlack = (el) => { const k = el.dataset.v; setTimeout(() => ogPmSend(k, 'slack'), 0); };
  APP.acts.ogPmAsana = (el) => { const k = el.dataset.v; setTimeout(() => ogPmSend(k, 'asana'), 0); };
  APP.acts.ogGoWait = () => { S.ui.dirMain = 'task'; location.hash = 'directives'; };
  APP.acts.ogInfoGo = (el) => { const v = el.dataset.v; const ui = ogUi(); ui.sel = { kind: 'd', name: v }; ui.tab = 'info'; window.scrollTo(0, 0); setTimeout(() => collectProfile('d', v), 0); };
  document.addEventListener('input', (e) => {
    const t = e.target; if (!t) return;
    if (t.id === 'og-chatin') OG.chatDraft = t.value;
    else if (t.id === 'og-msg') { const id = ogUi().open; if (id) OG.msgDraft[id] = t.value; }
    else if (t.id === 'og-pm') { const k = Object.keys(OG.pm).find((x) => OG.pm[x] && !OG.pm[x].busy && document.querySelector(`[data-act="ogPmClose"][data-v="${CSS.escape(x)}"]`)); if (k) OG.pm[k].text = t.value; }
    else if (t.dataset && t.dataset.oglink) OG.linkDraft[t.dataset.oglink] = t.value;
    else if (t.dataset && t.dataset.ogq) { ogUi().tq = t.value; clearTimeout(OG.tqT); OG.tqT = setTimeout(() => { const pos = t.selectionStart; rerender(); setTimeout(() => { const n = document.getElementById('og-tq'); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (er) { /* */ } } }, 0); }, 250); }
  });
  document.addEventListener('change', (e) => {
    const t = e.target; if (!t || !t.dataset || !t.dataset.ogk) return; const g = ogOf(t.dataset.id); if (!g) return;
    const k = t.dataset.ogk; let v = t.value;
    if (k === 'subs') v = v.split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 12);
    if (k === 'pct') { ogSave(g.id, Object.assign({ progress: { pct: Math.max(0, Math.min(100, Math.round(+v || 0))), at: nowIso(), manual: true } }, ogLogPatch(g, `진척을 ${Math.round(+v || 0)}%로 고침`))).then(() => rerender()); return; }
    if (k === 'due' && v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) { toast('기한은 2026-12-31 처럼 적어 주세요'); return; }
    if (OG.chg[g.id]) OG.chg[g.id] = OG.chg[g.id].filter((x) => x !== k);
    if (OG.loc[g.id] && k === 'due') OG.loc[g.id].due = v;
    ogSave(g.id, Object.assign({ [k]: k === 'title' ? (v.trim() || g.title) : v }, ogLogPatch(g, `${OG_LAB[k] || k} 고침`))).then(() => rerender());
  });
  document.addEventListener('keydown', (e) => {
    const t = e.target;
    if (t && t.classList && t.classList.contains('og-tb') && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) { const ids = OG_TABS.map((x) => x[0]); const i = ids.indexOf(t.dataset.v); const n = ids[(i + (e.key === 'ArrowRight' ? 1 : ids.length - 1)) % ids.length]; ogUi().tab = n; rerender(); focusLater('#og-tab-' + n); e.preventDefault(); return; }
    if (e.key === 'Enter' && t && t.dataset && t.dataset.oglink) { e.preventDefault(); const g = ogOf(t.dataset.oglink); if (g) setTimeout(() => ogLinkAsana(g, t.value.trim()), 0); return; }
    if (e.key === 'Escape' && ogUi().open && !document.body.classList.contains('dir-vis-open') && !(t && t.dataset && t.dataset.ppk)) { const ui = ogUi(); OG.chg[ui.open] = null; ui.open = null; ui.act = null; rerender(); }
  });
  /* 목표 패널 밖을 누르면 닫는다 — 다른 목표 카드를 누르면 그 목표로 바뀐다 */
  document.addEventListener('click', (e) => {
    if (!e.isTrusted || !ogUi().open || !document.querySelector('.og-pane')) return;
    const t = e.target;
    if (!t || !t.closest || !document.contains(t)) return;
    if (t.closest('.og-pane') || t.closest('.og-card') || t.closest('.og-mrow') || t.closest('[data-act="ogNew"]') || t.closest('.toast') || t.closest('.pp-list')) return;
    const ui = ogUi(); OG.chg[ui.open] = null; ui.open = null; ui.act = null; ui.del = null; rerender();
  }, true);
  window.addEventListener('hashchange', () => { const ui = ogUi(); ui.open = null; ui.act = null; ui.del = null; });

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
