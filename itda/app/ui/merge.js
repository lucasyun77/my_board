// 아이센스투게더 「깃허브 합치기」 화면 (설계서 docs/10-깃허브합치기설계.md 1·4·5장).
// 앱 본체(app.js)와 겹치지 않게 따로 둔 파일이다. app.js 의 「[합치기 연결]」 줄에서만 불린다.
(() => {
'use strict';
const I = window.ITDA; if (!I || !I.H) return;
const H = I.H; const { esc } = H;
const TAURI = window.__TAURI__ || null;
const inv = (name, args) => TAURI.core.invoke(name, args);
const $ = (s, r = document) => r.querySelector(s);
const LS = {
  get(k, d) { try { const v = localStorage.getItem('itda.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('itda.' + k, JSON.stringify(v)); } catch {} },
};
const st = () => H.st();
const log = (sid, kind, text) => I.send({ op: 'log', sessionId: sid, kind, text });
const short = c => String(c || '').slice(0, 7);
const hex7 = () => Array.from({ length: 7 }, () => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('');

// ───────── 모양 ─────────
const style = document.createElement('style');
style.textContent = `
.gm-bar { margin-top: 2px; font-size: 12px; color: var(--muted); }
.gm-bar b { color: var(--navy); font-weight: 700; }
.gm-box { max-height: 46vh; overflow: auto; }
.gm-item { margin-top: 8px; padding-top: 8px; border-top: 1px dashed #E5CF8E; }
.gm-item:first-of-type { margin-top: 6px; border-top: 0; padding-top: 0; }
.gm-meta { font-size: 12px; color: #8a6a1a; margin-top: 2px; }
.gm-acts { margin-top: 6px; display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
.gm-note { font-size: 12px; color: #8a6a1a; }
.gm-repo-line { margin: 6px 0 0; font-size: 12px; color: var(--muted); word-break: break-all; }
`;
document.head.appendChild(style);

// ───────── 값 ─────────
const proj = pid => st().projects.find(p => p.id === pid);
const sessOf = sid => st().sessions.find(s => s.id === sid);
const hasRepo = p => !!(p && p.repo && String(p.repo).trim());
const baseOf = p => (p && p.baseBranch) || 'main';
const clean = t => String(t || '').trim().replace(/\s+/g, '-').replace(/[^0-9A-Za-z가-힣\-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '') || '세션';
const branchFor = s => `together/${clean(H.nameOf(s.ownerId))}/${clean(s.title)}`;
const M = { dir: LS.get('gitdir', {}) || {}, stat: {}, job: LS.get('gmjob', {}) || {}, unknown: LS.get('gmunk', {}) || {}, demoChanged: {}, lastPoll: {} };
const saveJob = () => LS.set('gmjob', M.job);
const saveDir = () => LS.set('gitdir', M.dir);

// ───────── 데스크톱: 클로드를 켜기 전에 저장소 준비 ─────────
// 돌려줌: 폴더 글자 / null(저장소 프로젝트 아님) / false(실패, 켜지 않음)
async function prepare(sid) {
  const s = sessOf(sid); const p = s && proj(s.projectId);
  if (!s || !hasRepo(p) || s.ownerId !== I.S.me) return null;
  const base = baseOf(p); const branch = s.isTeamMain ? base : branchFor(s);
  try {
    const r = await inv('git_prepare', { sessionId: sid, repo: p.repo, baseBranch: base, branch });
    M.dir[sid] = r.dir; saveDir();
    log(sid, 'sys', `저장소 준비됨 · 갈래 ${r.branch}${r.created ? ' (새로 만듦)' : ''}`);
    refreshStat(sid);
    return r.dir;
  } catch (e) { log(sid, 'err', '저장소를 준비하지 못했습니다: ' + e); return false; }
}
async function refreshStat(sid) {
  if (!TAURI || !M.dir[sid]) return;
  try { const r = await inv('git_status', { dir: M.dir[sid] }); M.stat[sid] = r; paintBar(); } catch (e) { M.stat[sid] = { error: String(e) }; paintBar(); }
}

// ───────── 세션 머리: 갈래·바뀐 파일 ─────────
function barHtml(s, p) {
  const base = baseOf(p);
  if (s.isTeamMain) return `저장소 연결됨 · 기본 갈래 <b>${esc(base)}</b>${TAURI ? '' : ' (시연)'}`;
  const br = branchFor(s);
  if (TAURI) {
    const g = M.stat[s.id];
    if (g && g.error) return `갈래 <b>${esc(br)}</b> · 상태를 읽지 못했습니다`;
    if (g) return `갈래 <b>${esc(g.branch || br)}</b> · 바뀐 파일 <b>${g.changed ?? 0}개</b>${g.ahead ? ` · 올리지 않은 기록 ${g.ahead}개` : ''}`;
    return `갈래 <b>${esc(br)}</b> · 클로드를 켜면 저장소를 준비합니다`;
  }
  return `갈래 <b>${esc(br)}</b> · 바뀐 파일 <b>${M.demoChanged[s.id] || 0}개</b> (시연)`;
}
function paintBar() {
  const s = H.session(); const head = $('#sessHead'); if (!s || !head) return;
  const p = proj(s.projectId); let el = $('#gmBar');
  if (!hasRepo(p) || s.ownerId !== I.S.me) { if (el) el.remove(); return; }
  if (!el) { el = document.createElement('div'); el.id = 'gmBar'; el.className = 'gm-bar'; const holder = head.querySelector('.muted.small'); if (!holder) return; holder.insertAdjacentElement('afterend', el); }
  el.innerHTML = barHtml(s, p);
}

// ───────── 보낸 사람: 팀 메인에 합치기 요청 ─────────
// 저장소 프로젝트면 true(여기서 처리), 아니면 false(기존 방식)
function sendTeam(note) {
  const s = H.session(); if (!s) return false; const p = proj(s.projectId);
  if (!hasRepo(p)) return false;
  const tm = H.teamMain(s.projectId); if (!tm) { H.toast('팀 메인 세션이 없습니다'); return true; }
  const a = H.artifactsOf(s.projectId).filter(a => a.sessionId === s.id).sort((x, y) => H.latest(y).ts - H.latest(x).ts)[0];
  const post = (branch, commit) => {
    I.send({ op: 'sendRequest', fromSession: s.id, toSession: tm.id, artifactId: a ? a.id : null, note, branch, commit });
    M.demoChanged[s.id] = 0; refreshStat(s.id);
    H.toast('팀 메인 세션에 합치기 요청을 보냈습니다');
  };
  if (!TAURI) {
    const branch = branchFor(s), commit = hex7();
    log(s.id, 'sys', `(시연) 바뀐 것을 저장하고 깃허브에 올렸습니다 · 갈래 ${branch} · 기록 ${commit}`);
    post(branch, commit); return true;
  }
  (async () => {
    let dir = M.dir[s.id];
    if (!dir) { dir = await prepare(s.id); if (!dir) { if (dir === null) log(s.id, 'err', '이 세션의 작업 폴더를 알 수 없어 요청을 보내지 못했습니다.'); return; } }
    try {
      const r = await inv('git_save_push', { dir, message: '합치기 요청: ' + note });
      if (!r || !r.commit) throw new Error('올린 기록 번호를 받지 못했습니다');
      log(s.id, 'sys', `저장하고 깃허브에 올렸습니다 · 갈래 ${r.branch} · 기록 ${short(r.commit)}${r.nothingToCommit ? ' (바뀐 것 없이 지금 기록을 올림)' : ''}`);
      post(r.branch, r.commit);
    } catch (e) { log(s.id, 'err', '깃허브에 올리지 못해 합치기 요청을 보내지 않았습니다: ' + e); H.toast('깃허브에 올리지 못했습니다'); }
  })();
  return true;
}

// ───────── 팀 메인: 요청 카드 ─────────
const TAGS = { '대기': 'check', '합치는 중': 'check', '충돌': 'warn', '합침': 'info', '되돌림': 'info', '반려': 'info' };
function itemHtml(r, s, mine) {
  const f = sessOf(r.fromSession) || {}; const unk = M.unknown[r.id];
  const meta = [r.branch ? `갈래 ${esc(r.branch)}` : '', r.commit ? `기록 ${esc(short(r.commit))}` : '', r.resultCommit ? `합친 기록 ${esc(short(r.resultCommit))}` : ''].filter(Boolean).join(' · ');
  const b = (k, label, cls = '') => `<button class="btn sm ${cls}" data-gm="${k}" data-rid="${esc(r.id)}">${label}</button>`;
  let acts = '';
  if (mine) {
    if (r.status === '대기') acts = b('merge', '합치기 맡기기', 'primary') + b('reject', '반려');
    else if (r.status === '충돌') acts = b('merge', '다시 맡기기', 'primary') + b('reject', '반려');
    else if (r.status === '합침' && r.resultCommit) acts = b('revert', '되돌리기');
    else if (r.status === '합치는 중' && unk) acts = b('okmark', '합침으로 표시') + b('conflictmark', '충돌로 표시');
  }
  const extra = r.status === '합치는 중' ? `<div class="gm-note">${unk ? '결과를 확인해 주세요.' : '팀 메인 클로드가 합치는 중입니다…'}</div>` : (r.status === '충돌' && r.resultNote ? `<div class="gm-note">이유: ${esc(r.resultNote)}</div>` : '');
  return `<div class="gm-item"><span class="tag ${TAGS[r.status] || 'info'}">${esc(r.status)}</span>${esc(H.nameOf(f.ownerId))} «${esc(f.title)}»: ${esc(r.note)}<div class="gm-meta">${meta}</div>${extra}${acts ? `<div class="gm-acts">${acts}</div>` : ''}</div>`;
}
function paintCard() {
  const s = H.session(); const log_ = $('#log'); if (!s || !log_) return;
  const old = log_.querySelector('.card-req.pending'); const p = proj(s.projectId);
  const mine = $('#gmCard');
  if (!s.isTeamMain || !hasRepo(p)) { if (mine) mine.remove(); return; }
  if (old && !old.id) old.remove();
  const all = st().requests.filter(r => r.toSession === s.id);
  const active = all.filter(r => ['대기', '합치는 중', '충돌'].includes(r.status));
  const recent = all.filter(r => ['합침', '되돌림'].includes(r.status)).slice(-3).reverse();
  const list = active.concat(recent);
  if (!list.length) { if (mine) mine.remove(); return; }
  const ismine = s.ownerId === I.S.me;
  const html = `<b>📥 합치기 요청 ${active.length}건 대기</b> — 합치기 맡기기를 누르면 팀 메인 클로드가 갈래를 합칩니다.${TAURI ? '' : ' (시연)'}${list.map(r => itemHtml(r, s, ismine)).join('')}`;
  if (mine) { if (mine.innerHTML !== html) mine.innerHTML = html; if (log_.firstChild !== mine) log_.insertBefore(mine, log_.firstChild); return; }
  const el = document.createElement('div'); el.id = 'gmCard'; el.className = 'card-req pending gm-box'; el.innerHTML = html; log_.insertBefore(el, log_.firstChild);
}
function decorate() {
  try { paintBar(); paintCard(); const s = H.session(); if (s && TAURI && s.ownerId === I.S.me && M.dir[s.id] && Date.now() - (M.lastPoll[s.id] || 0) > 8000) { M.lastPoll[s.id] = Date.now(); refreshStat(s.id); } } catch (e) { console.error(e); }
}

// ───────── 합치기·되돌리기 지시 ─────────
function mergeText(r, from, p) {
  return `[아이센스투게더 합치기 지시]
요청 번호: ${r.id}
보낸 사람: ${H.nameOf(from.ownerId)} · 「${from.title}」
합칠 갈래: ${r.branch} (기록 ${short(r.commit)})
부탁: ${r.note}

할 일:
1. git fetch origin 후 기본 갈래(${baseOf(p)})를 최신으로 맞춘다.
2. origin/${r.branch} 을 --no-ff 로 합친다.
3. 충돌이 나면 양쪽 뜻을 살려 정리한다. 판단이 어려우면 고치지 말고 멈춘다.
4. 시험이나 빌드 명령이 있으면 돌린다.
5. 성공하면 ${baseOf(p)} 을 원격에 올린다.
6. 마지막 줄에 정확히 이렇게 쓴다:
   합치기 결과: 성공 <합친 기록 7자리>
   또는
   합치기 결과: 실패 <이유 한 줄>`;
}
function revertText(r, from, p) {
  return `[아이센스투게더 되돌리기 지시]
요청 번호: ${r.id}
보낸 사람: ${H.nameOf(from.ownerId)} · 「${from.title}」
되돌릴 합친 기록: ${r.resultCommit}

할 일:
1. git fetch origin 후 기본 갈래(${baseOf(p)})를 최신으로 맞춘다.
2. git revert -m 1 ${r.resultCommit} 로 되돌리는 기록을 만든다.
3. 충돌이 나면 고치지 말고 멈춘다.
4. 성공하면 ${baseOf(p)} 을 원격에 올린다.
5. 마지막 줄에 정확히 이렇게 쓴다:
   되돌리기 결과: 성공 <되돌린 기록 7자리>
   또는
   되돌리기 결과: 실패 <이유 한 줄>`;
}

async function startJob(kind, rid) {
  const s = H.session(); if (!s || !s.isTeamMain || s.ownerId !== I.S.me) return;
  const r = st().requests.find(x => x.id === rid); if (!r) return;
  const p = proj(s.projectId); const from = sessOf(r.fromSession) || { title: '', ownerId: '' };
  if (M.job[s.id]) { H.toast('앞선 일이 아직 끝나지 않았습니다'); return; }
  if (kind === 'merge' && !r.branch) { H.toast('이 요청에는 갈래 정보가 없어 맡길 수 없습니다'); return; }
  const job = { kind, rid, text: '', baseHead: '' };
  if (TAURI && M.dir[s.id]) { try { job.baseHead = (await inv('git_head', { dir: M.dir[s.id] })).commit || ''; } catch { /* 기록을 못 읽어도 진행 */ } }
  M.job[s.id] = job; saveJob();
  if (kind === 'merge') I.send({ op: 'resolveRequest', requestId: rid, status: '합치는 중' });
  const text = kind === 'merge' ? mergeText(r, from, p) : revertText(r, from, p);
  log(s.id, 'sys', kind === 'merge' ? `「${H.nameOf(from.ownerId)}」 님의 갈래를 합치도록 팀 메인 클로드에게 맡겼습니다 · 요청 ${r.id}${TAURI ? '' : ' (시연)'}` : `합친 기록 ${short(r.resultCommit)} 을 되돌리도록 맡겼습니다 · 요청 ${r.id}${TAURI ? '' : ' (시연)'}`);
  if (TAURI) await H.claudeSend(s.id, text);
  else demoRun(s.id, kind, r);
  I.render(true);
}
function demoRun(sid, kind, r) {
  const code = kind === 'merge' ? '1a2b3c4' : '5e6f7a8';
  const label = kind === 'merge' ? '합치기 결과' : '되돌리기 결과';
  const steps = [
    { kind: 'tool', tool: 'Bash', text: kind === 'merge' ? `git merge --no-ff origin/${r.branch}` : `git revert -m 1 ${r.resultCommit}` },
    { kind: 'text', text: `(시연) 작업을 마쳤습니다.\n${label}: 성공 ${code}` },
    { kind: 'result', costUsd: 0.01 },
  ];
  steps.forEach((p, i) => setTimeout(() => H.onClaude(Object.assign({ sessionId: sid, demo: true }, p)), 600 + i * 800));
}
const RESULT_RE = /(합치기|되돌리기) 결과:\s*(성공|실패)\s*(.*)/;
function onClaude(p) {
  if (!p || !p.sessionId) return;
  const job = M.job[p.sessionId];
  if (p.kind === 'result') { refreshStat(p.sessionId); setTimeout(() => decorate(), 50); }
  if (!job) return;
  if (p.kind === 'text' && p.text) job.text += '\n' + p.text;
  else if (p.kind === 'result') finishJob(p.sessionId);
  else if (p.kind === 'exit' || p.kind === 'error') { /* 끝 신호를 기다린다 */ }
}
async function finishJob(sid) {
  const job = M.job[sid]; if (!job) return;
  delete M.job[sid]; saveJob();
  const r = st().requests.find(x => x.id === job.rid); if (!r) return;
  const label = job.kind === 'merge' ? '합치기 결과' : '되돌리기 결과';
  const lines = job.text.split('\n').map(x => x.match(RESULT_RE)).filter(m => m && ((job.kind === 'merge') === (m[1] === '합치기')));
  const m = lines[lines.length - 1];
  let ok = null, commit = '', note = '';
  if (m) { ok = m[2] === '성공'; if (ok) commit = (m[3].match(/[0-9a-f]{7,40}/i) || [m[3].trim().slice(0, 7)])[0]; else note = m[3].trim() || '이유가 적혀 있지 않습니다'; }
  else if (TAURI && M.dir[sid]) {
    try { const h = await inv('git_head', { dir: M.dir[sid] }); if (h.commit && h.commit !== job.baseHead) { ok = true; commit = h.commit; log(sid, 'sys', `결과 줄은 없었지만 기록이 ${short(h.commit)} 로 바뀐 것을 확인했습니다`); } } catch { /* 모름 */ }
  }
  if (ok === null) {
    M.unknown[r.id] = 1; LS.set('gmunk', M.unknown);
    log(sid, 'sys', `「${label}:」 줄을 찾지 못했습니다. 결과를 확인해 주세요 · 요청 ${r.id}`);
    if (job.kind === 'revert') { /* 합침 상태 그대로 둔다 */ }
    I.render(true); return;
  }
  if (job.kind === 'merge') I.send(ok ? { op: 'resolveRequest', requestId: r.id, status: '합침', commit } : { op: 'resolveRequest', requestId: r.id, status: '충돌', note });
  else if (ok) I.send({ op: 'resolveRequest', requestId: r.id, status: '되돌림', commit });
  else log(sid, 'err', `되돌리지 못했습니다: ${note}`);
  refreshStat(sid);
}

// ───────── 시연 방식: 서버 규칙 흉내 (app.js 의 시연 처리에 덧붙임) ─────────
const origApply = I.Demo.apply;
I.Demo.apply = function (who, op) {
  const s = st();
  if (op.op === 'updateProject' && (op.repo != null || op.baseBranch != null)) {
    origApply.call(this, who, op);
    const p = proj(op.projectId); if (p) { if (op.repo != null) p.repo = String(op.repo).trim(); if (op.baseBranch != null) p.baseBranch = String(op.baseBranch).trim() || 'main'; }
    return;
  }
  if (op.op === 'sendRequest') {
    const before = s.requests.length; origApply.call(this, who, op);
    const r = s.requests[s.requests.length - 1]; if (s.requests.length > before && r) { if (op.branch) r.branch = op.branch; if (op.commit) r.commit = op.commit; }
    return;
  }
  if (op.op === 'resolveRequest') {
    const r = s.requests.find(x => x.id === op.requestId);
    if (r && (r.branch || hasRepo(proj(r.projectId)))) {
      r.status = op.status; r.statusAt = Date.now();
      if (op.status === '합침' || op.status === '되돌림') { if (op.commit) r.resultCommit = op.commit; }
      if (op.note) r.resultNote = op.note;
      if (op.status === '되돌림') r.resultCommit = r.resultCommit || op.commit;
      const tail = op.commit ? ` (기록 ${op.commit})` : (op.note ? ` (${op.note})` : '');
      this.log(r.fromSession, 'sys', `보낸 요청이 「${op.status}」 처리되었습니다${tail}`, who);
      this.log(r.toSession, 'sys', `요청 ${r.id} 을 「${op.status}」 처리했습니다${tail}`, who);
      return;
    }
  }
  return origApply.call(this, who, op);
};

// ───────── 저장소 연결 대화상자 (협업 대시보드의 목표 칸 아래 단추) ─────────
function decorateBoard() {
  const p = H.project(); const goal = $('#pane [data-editgoal]'); if (!p || !goal || $('#pane [data-gm="repo"]')) return;
  const line = document.createElement('p'); line.className = 'gm-repo-line';
  line.innerHTML = hasRepo(p) ? `🔗 저장소 <b>${esc(p.repo)}</b> · 기본 갈래 <b>${esc(baseOf(p))}</b>` : '🔗 저장소가 연결되어 있지 않습니다.';
  const btn = document.createElement('button'); btn.className = 'btn sm'; btn.dataset.gm = 'repo'; btn.textContent = '저장소 연결'; btn.style.marginLeft = '6px';
  goal.insertAdjacentElement('afterend', btn); btn.insertAdjacentElement('afterend', line);
}
function repoDialog() {
  const p = H.project(); if (!p) return;
  H.modal(`<h3>저장소 연결</h3><p class="small muted">회사 깃허브 저장소를 연결하면 세션마다 작업 갈래가 만들어지고, 합치기 요청이 그 갈래를 팀 메인에 합칩니다. 깃허브를 몰라도 앱이 뒤에서 처리합니다.</p>
    <label>저장소 주소</label><input id="gmRepo" value="${esc(p.repo || '')}" placeholder="예: https://github.com/회사/앱.git">
    <label>기본 갈래</label><input id="gmBase" value="${esc(p.baseBranch || 'main')}" placeholder="main">
    <div class="acts"><button class="btn" data-close>취소</button><button class="btn primary" id="gmSave">저장</button></div>`);
  $('#gmSave').onclick = () => {
    I.send({ op: 'updateProject', projectId: p.id, repo: $('#gmRepo').value.trim(), baseBranch: $('#gmBase').value.trim() || 'main' });
    H.closeModal(); H.toast('저장소 연결을 저장했습니다');
  };
}

// ───────── 단추 ─────────
document.addEventListener('click', e => {
  const t = e.target.closest('[data-gm]'); if (!t) return;
  const k = t.dataset.gm, rid = t.dataset.rid;
  if (k === 'repo') repoDialog();
  else if (k === 'merge') startJob('merge', rid);
  else if (k === 'revert') startJob('revert', rid);
  else if (k === 'reject') I.send({ op: 'resolveRequest', requestId: rid, status: '반려' });
  else if (k === 'okmark' || k === 'conflictmark') {
    const r = st().requests.find(x => x.id === rid); delete M.unknown[rid]; LS.set('gmunk', M.unknown);
    I.send(k === 'okmark' ? { op: 'resolveRequest', requestId: rid, status: '합침', commit: r && r.resultCommit || undefined } : { op: 'resolveRequest', requestId: rid, status: '충돌', note: '직접 확인 후 충돌로 표시' });
  }
  setTimeout(() => I.render(true), 30);
});

window.ITDAMerge = { prepare, sendTeam, decorate, decorateBoard, onClaude };
I.render();
})();
