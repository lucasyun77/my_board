/* 메뉴: 지시 관리 (directives) — 이 메뉴 담당 하위 세션은 이 파일만 고칩니다.
   공용 도구·상태는 window.APP에서 꺼내 씁니다. 새 버튼 동작은 APP.acts['이름'] = (el) => {...},
   새 폼은 APP.forms['이름'] = (fd, form) => {...}, 새 select 변경은 APP.changes['이름'] = (el) => {...} 로 등록합니다.
   태그 필터·저장된 보기·태그 저장/삭제 확인 이벤트(fTag, fMode, fField, fReset, saveView, loadView, delView,
   askDelTag, delTag, cancelDelTag, cancelEditTag, dirStatus, form 'tag'·'view')는 js/app.js 것을 그대로 씁니다.

   실데이터 연결(claude.ai 아티팩트로 열었을 때만):
   - Asana: 회장 커넥터로 "[지시업무] ceo 윤석범" 프로젝트를 읽고, 상태·기한·우선순위·이름 변경은 update_tasks,
     메모·결과물은 add_comment, 신규 등록은 create_tasks 로 되돌려 보냅니다.
   - 목표: 아티팩트 DB live/goals(부서현황판의 전사목표·부서목표 정의), track/<id>(진척·메모)에서 읽고 씁니다.
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
    fields: 'name,assignee.name,due_on,created_at,modified_at,completed,memberships.section.name,memberships.project.gid,permalink_url,custom_fields.name,custom_fields.display_value'
  };
  const hasClaude = !!(window.claude && typeof window.claude.use === 'function');
  const LIVE = { state: hasClaude ? 'loading' : 'off', db: null, mcp: null, people: {}, staff: [], cw: {}, goals: null, goalsAt: '', track: {}, asana: null, asanaAt: 0, asanaFrom: '', asanaErr: null, busy: false, timer: null };
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
  let pendingRender = false;
  function rerender() {
    const a = document.activeElement;
    if (a && /^(INPUT|TEXTAREA)$/.test(a.tagName) && a.closest('#view')) { pendingRender = true; return; }
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
    d.synced_fail = ''; d._pushing = true; rerender();
    try {
      const r = await LIVE.mcp.callTool(ASANA.server, 'update_tasks', { tasks: [t] });
      const p = (r && r.payload) || {};
      if (Array.isArray(p.failed) && p.failed.length) throw { code: 'tool_error', message: JSON.stringify(p.failed[0].errors || p.failed[0]).slice(0, 160) };
      d._orig = { title: d.title, due_at: d.due_at, priority: d.priority, status: d.status };
      toast(`Asana에 반영했습니다 · ${why || '변경'}`);
      try { await LIVE.mcp.invalidate(ASANA.server, 'search_tasks'); } catch (e) { /* 캐시 없음 */ }
    } catch (e) {
      d.synced_fail = errText(e);
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
    LIVE.db = db; LIVE.mcp = mcp;
    if (!db && !mcp) { LIVE.state = 'off'; rerender(); return; }
    if (db) {
      const err = () => {};
      db.doc('live/people').onSnapshot((s) => { const v = s.exists ? s.data() : null; if (v && v.map && typeof v.map === 'object') { LIVE.people = v.map; LIVE.staff = Array.isArray(v.staff) ? v.staff.filter((x) => x && x.n && x.d) : []; rebuild(); rerender(); } }, err);
      db.doc('live/goals').onSnapshot((s) => { const v = s.exists ? s.data() : null; if (v && Array.isArray(v.items)) { LIVE.goals = v.items.filter((g) => g && g.id && g.t); LIVE.goalsAt = String(v.at || '').slice(0, 10); rebuild(); } }, err);
      db.collection('cw').onSnapshot((snap) => { const m = {}; snap.docs.forEach((ds) => { const v = ds.data() || {}; if (v.title) m[ds.id] = Object.assign({}, v, { id: ds.id }); }); LIVE.cw = m; rerender(); }, err);
      db.collection('track').onSnapshot((snap) => { const m = {}; snap.docs.forEach((ds) => { m[ds.id] = ds.data() || {}; }); LIVE.track = m; rebuild(); }, err);
      db.doc('live/asana').onSnapshot((s) => {
        const v = s.exists ? s.data() : null;
        if (v && Array.isArray(v.data) && LIVE.asanaFrom !== '실시간') { LIVE.asana = v.data; LIVE.asanaAt = Date.parse(v.at) || 0; LIVE.asanaFrom = '저장본'; lastSnap = JSON.stringify(v.data); rebuild(); }
      }, err);
    }
    if (mcp) {
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
        <td data-label="지시">${srcPill(d)}${titleBtn(d)}${goalBar(d)}<div class="row dir-flags">${alerts(d)}</div>${d.memo ? `<div class="small muted dir-memo">메모 · ${esc(d.memo)}</div>` : ''}</td>
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
        <div class="row">${prioPill(d.priority)}${alerts(d)}</div>${d.tags.length ? `<div class="row">${d.tags.map(chip).join('')}</div>` : ''}${statusSelect(d)}</div>`).join('') || '<div class="small muted dir-empty-col">없음</div>'}</div>`; }).join('')}</div>`;
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

  function detailDialog() {
    const d = S.ui.dirOpen && S.directives.find((x) => x.id === S.ui.dirOpen);
    document.body.classList.toggle('dir-lock', !!d);
    if (!d) return '';
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

    return `<aside class="dir-pane" role="dialog" aria-labelledby="dlg-title" id="dir-dlg" tabindex="-1">
      <div class="dir-pane-bar">
        <button type="button" class="dir-donebtn ${done ? 'on' : ''}" data-act="dirDone" data-id="${esc(d.id)}" aria-pressed="${done}"><span aria-hidden="true">✓</span>${done ? '완료됨' : '완료로 표시'}</button>
        <span class="dir-pane-sp"></span>
        ${isAsana(d) && safeUrl(d.source_url) ? `<a class="dir-iconbtn" href="${esc(d.source_url)}" target="_blank" rel="noopener noreferrer" title="Asana에서 열기">Asana ↗</a>` : ''}
        ${isAsana(d) && LIVE.mcp ? `<button type="button" class="dir-iconbtn" data-act="dirReload" data-id="${esc(d.id)}" title="새로고침" aria-label="상세 새로고침">↻</button>` : ''}
        <button type="button" class="dir-iconbtn" data-act="dirEditToggle" aria-pressed="${!!edit}">${edit ? '편집 닫기' : '편집'}</button>
        <button type="button" class="dir-iconbtn" data-act="dirClose" aria-label="패널 닫기" title="닫기 (Esc)">→|</button>
      </div>
      <div class="dir-pane-body">
        ${done ? '<div class="dir-donebanner">이 작업은 완료되었습니다.</div>' : ''}
        <div class="row small dir-pane-kind">${srcPill(d)}${alerts(d)}${det && det.state === 'loading' ? '<span class="muted">Asana에서 불러오는 중…</span>' : ''}</div>
        <h2 class="dir-pane-title" id="dlg-title">${esc(d.title)}</h2>
        ${edit ? `<form class="form" data-form="dirEdit" data-id="${esc(d.id)}">${fieldsHtml('de', d)}<div class="row wide"><button class="btn primary">저장</button><button type="button" class="btn sm" data-act="dirEditToggle">취소</button></div></form>` : `${fields}${desc}${subs}${memo}`}
        <section class="dir-feed"><h4>${isAsana(d) ? '댓글·활동' : '활동'}</h4><ul>${feedAsana}${feedLocal}</ul></section>
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

    return `
      <div class="view-head"><div><h2>지시 관리</h2><p>${S.liveMode ? 'Asana 지시와 전사·부서 목표를 한곳에서 챙깁니다. 기한 경과와 3일 무응답은 경보로 띄웁니다.' : '회장 지시를 등록·추적합니다. 기한 경과와 3일 무응답은 경보로 띄웁니다.'}</p></div>
        <button type="button" class="btn primary" data-act="dirNewToggle" aria-expanded="${!!S.ui.dirNew}">+ 지시 등록</button></div>

      ${syncBar()}
      ${newPanel()}

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
      ${tab === 'org' ? orgPanel() : tab === 'tags' ? viewTags() : tab === 'cw' ? cwPanel() : `<div class="dir-resbar"><p class="small" style="margin:0"><b class="num">${list.length}</b>건 / 전체 ${S.directives.length}건${sumParts.length ? ` · <span class="muted">${esc(sumParts.join(' · '))}</span> <button type="button" class="dir-link" data-act="fReset">조건 지우기</button>` : ''}</p>
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
  APP.acts.dirOpen = (el) => { S.ui.dirOpen = el.dataset.id; S.ui.dirEdit = false; if (!el.closest('.dir-pane')) S.ui.dirReturn = el.dataset.id; const d = find(el.dataset.id); if (d) setTimeout(() => loadDetail(d), 0); focusLater('#dir-dlg'); };
  APP.acts.dirReload = (el) => { const d = find(el.dataset.id); if (d) setTimeout(() => loadDetail(d, true), 0); };
  APP.acts.dirDone = (el) => {
    const d = find(el.dataset.id); if (!d) return;
    const prev = d.status;
    d.status = prev === '완료' ? (d._before_done && d._before_done !== '완료' ? d._before_done : '진행') : '완료';
    if (prev !== '완료') d._before_done = prev;
    d.updated_at = S.today;
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

  /* 상세 창: Esc·바깥 누르면 닫기, 다른 메뉴로 가면 정리 */
  const closeDlg = () => { const b = document.querySelector('.dir-pane-bar [data-act="dirClose"]'); if (b) b.click(); };
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && S.ui.dirOpen) closeDlg(); });
  window.addEventListener('hashchange', () => { document.body.classList.remove('dir-lock'); S.ui.dirOpen = null; S.ui.dirEdit = false; });

  APP.views.directives = viewDirectives;
})();
