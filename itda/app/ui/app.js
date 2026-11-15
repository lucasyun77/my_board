// 잇다 화면. 빌드 없이 도는 순수 자바스크립트.
// 두 가지 방식으로 돈다:
//  1) 연결 방식: 중계 서버(러스트)에 웹소켓으로 붙어 여러 컴퓨터가 같은 상태를 본다.
//  2) 시연 방식: 서버 없이 이 화면 안에서 시연 자료로 돈다(아티팩트 미리보기·처음 실행).
(() => {
'use strict';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const TAURI = window.__TAURI__ || null;
const LS = {
  get(k, d) { try { const v = localStorage.getItem('itda.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('itda.' + k, JSON.stringify(v)); } catch {} },
};
const now = () => Date.now();
const rid = () => Math.random().toString(36).slice(2, 9);
const AGENT = 'agent';
const STATUS = { working: '일하는 중', waiting: '사람 대기', stalled: '멈춤', done: '끝남' };
const COLORS = ['#FF7A45', '#2BB673', '#5B7CFA', '#C455D9', '#E8A33D', '#1FA2B8'];
const HELP = ['끔', '가볍게', '보통', '적극'];
const HELP_DESC = [
  '본부장이 아무 말도 하지 않습니다.',
  '중요한 경고(멈춤·빠진 일)만 알려 줍니다.',
  '경고와 함께 다음에 할 일을 제안합니다.',
  '세션이 멈추면 다음 일을 바로 지시합니다(내 세션에 일이 들어옵니다).',
];

// ───────── 설정 ─────────
const servedByRelay = location.protocol.startsWith('http') && !/claude|artifact|usercontent/.test(location.host) && LS.get('servedHint', true);
let cfg = Object.assign({
  id: 'u-' + rid(), name: '', computer: '', relay: '', key: '', aiCmd: 'claude -p', theme: 'auto',
}, LS.get('cfg', {}));
if (!cfg.relay && servedByRelay && location.port) cfg.relay = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';

// ───────── 상태 ─────────
const S = { state: null, me: 'u-choi', live: false, ws: null, claude: false };
const ui = {
  projectId: null, sessionId: null, tab: 'map', mode: LS.get('mode', 'chat'),
  channelId: null, wikiId: null, boardId: 'base', replyTo: null, lastRead: LS.get('read', {}),
  mapFilter: 'all', open: LS.get('open', {}),
};

function fixTimes(st) {
  const t = now();
  const f = x => (typeof x === 'number' && x < 1e10) ? t - Math.abs(x) * 60000 : x;
  st.sessions.forEach(s => { s.lastActivity = f(s.lastActivity); s.createdAt = f(s.createdAt); });
  st.messages.forEach(m => m.ts = f(m.ts));
  st.artifacts.forEach(a => a.versions.forEach(v => v.ts = f(v.ts)));
  st.coach.forEach(c => c.ts = f(c.ts));
  st.requests.forEach(r => r.ts = f(r.ts));
  st.wiki.forEach(w => w.updatedAt = f(w.updatedAt));
  Object.values(st.logs).forEach(v => v.forEach(l => l.ts = f(l.ts)));
  st.members.forEach(m => m.lastSeen = f(m.lastSeen));
  return st;
}

// ───────── 조회 도우미 ─────────
const st = () => S.state;
const member = id => id === AGENT ? { id: AGENT, name: 'AI 본부장', computer: '잇다 중계 서버' } : (st().members.find(m => m.id === id) || { id, name: id, computer: '' });
const nameOf = id => member(id).name;
const colorOf = id => id === AGENT ? '#1F2A44' : COLORS[Math.abs([...id].reduce((a, c) => a * 31 + c.charCodeAt(0), 7)) % COLORS.length];
const avatar = (id, size = 28) => `<span class="avatar" style="background:${colorOf(id)};width:${size}px;height:${size}px">${id === AGENT ? '본' : esc(nameOf(id).slice(-2, -1) || nameOf(id)[0] || '?')}</span>`;
const project = () => st().projects.find(p => p.id === ui.projectId);
const session = () => st().sessions.find(s => s.id === ui.sessionId);
const sessionsOf = pid => st().sessions.filter(s => s.projectId === pid);
const teamMain = pid => sessionsOf(pid).find(s => s.isTeamMain);
const myMain = pid => sessionsOf(pid).find(s => s.ownerId === S.me && s.isMain && !s.isTeamMain) || sessionsOf(pid).find(s => s.ownerId === S.me);
const artifactsOf = pid => st().artifacts.filter(a => a.projectId === pid);
const latest = a => a.versions[a.versions.length - 1];
const ago = ts => { const m = Math.round((now() - ts) / 60000); if (m < 1) return '방금'; if (m < 60) return m + '분 전'; const h = Math.round(m / 60); if (h < 24) return h + '시간 전'; return Math.round(h / 24) + '일 전'; };
const hhmm = ts => { const d = new Date(ts); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
const kindIcon = k => ({ '디자인': '🎨', '코드': '🧩', '문서': '📄', '이미지': '🖼', '이메일': '✉️' }[k] || '📦');

function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('show'), 2200); }

// ───────── 보내기: 연결 방식은 서버로, 시연 방식은 이 안에서 ─────────
function send(op) {
  if (S.live && S.ws && S.ws.readyState === 1) { S.ws.send(JSON.stringify(op)); return; }
  try { Demo.apply(S.me, op); } catch (e) { toast(e.message || String(e)); }
  render();
}

// ───────── 시연 방식 처리 규칙(중계 서버의 규칙을 줄여 옮김) ─────────
const Demo = {
  id(p) { st().seq = (st().seq || 1000) + 1; return p + st().seq; },
  log(sid, kind, text, from) { (st().logs[sid] = st().logs[sid] || []).push({ ts: now(), kind, text, from }); const s = st().sessions.find(x => x.id === sid); if (s && from !== AGENT) { s.lastActivity = now(); if (s.status === 'stalled') s.status = 'working'; } },
  coach(pid, sid, level, text) { if (st().coach.slice(-30).some(c => c.text === text)) return; st().coach.push({ id: this.id('c'), projectId: pid, sessionId: sid || null, level, text, ts: now() }); },
  agentChannel(pid) { let c = st().channels.find(c => c.projectId === pid && c.name === '본부장'); if (!c) { c = { id: this.id('ch'), projectId: pid, name: '본부장', kind: 'channel', members: [] }; st().channels.push(c); } return c.id; },
  agentPost(pid, text, replyTo) { st().messages.push({ id: this.id('m'), channelId: this.agentChannel(pid), from: AGENT, text, ts: now(), replyTo }); },
  wiki(pid, title, body) { const w = st().wiki.find(w => w.projectId === pid && w.title === title); if (w) { w.body = body; w.updatedAt = now(); w.by = AGENT; } else st().wiki.push({ id: this.id('w'), projectId: pid, title, body, scope: 'team', by: AGENT, updatedAt: now() }); },
  apply(who, op) {
    const s = st(); const t = now();
    switch (op.op) {
      case 'createProject': {
        const id = this.id('p');
        s.projects.push({ id, name: op.name, kind: op.kind, goal: op.goal || '', guide: '', ownerId: who, members: [who], createdAt: t });
        s.channels.push({ id: this.id('ch'), projectId: id, name: '전체', kind: 'channel', members: [] });
        const sid = this.id('s');
        s.sessions.push({ id: sid, projectId: id, ownerId: who, title: op.name + ' 팀 메인', isMain: true, isTeamMain: true, status: 'waiting', lastActivity: t, createdAt: t });
        this.agentPost(id, `「${op.name}」 프로젝트를 맡았습니다. 목표와 지침을 이 채널에서 함께 정해요. 무엇을 만들고 싶으신가요?`);
        ui.projectId = id; ui.sessionId = sid; break;
      }
      case 'updateProject': { const p = s.projects.find(p => p.id === op.projectId); if (op.goal != null) p.goal = op.goal; if (op.guide != null) p.guide = op.guide; break; }
      case 'openSession': {
        const id = this.id('s');
        s.sessions.push({ id, projectId: op.projectId, ownerId: who, title: op.title, isMain: !!op.isMain, isTeamMain: false, status: 'working', lastActivity: t, createdAt: t });
        const p = s.projects.find(p => p.id === op.projectId); if (!p.members.includes(who)) p.members.push(who);
        this.log(id, 'sys', '세션이 열렸습니다.', who); ui.sessionId = id; break;
      }
      case 'setSessionStatus': { const x = s.sessions.find(x => x.id === op.sessionId); x.status = op.status; x.lastActivity = t; break; }
      case 'log': this.log(op.sessionId, op.kind, op.text, who); break;
      case 'publishArtifact': {
        let a = s.artifacts.find(a => a.id === op.artifactId) || s.artifacts.find(a => a.projectId === op.projectId && a.name === op.name);
        if (a) a.versions.push({ v: latest(a).v + 1, ts: t, by: who, note: op.note || '', content: op.content || '' });
        else { a = { id: this.id('a'), projectId: op.projectId, sessionId: op.sessionId, ownerId: who, name: op.name, kind: op.kind, versions: [{ v: 1, ts: t, by: who, note: op.note || '', content: op.content || '' }] }; s.artifacts.push(a); }
        this.log(op.sessionId, 'sys', `산출물 「${a.name}」 v${latest(a).v} 을 올렸습니다.`, who); break;
      }
      case 'sendRequest': {
        const to = s.sessions.find(x => x.id === op.toSession), from = s.sessions.find(x => x.id === op.fromSession);
        if (!to || !from) throw new Error('세션을 찾을 수 없습니다');
        const a = s.artifacts.find(a => a.id === op.artifactId);
        s.requests.push({ id: this.id('r'), projectId: to.projectId, fromSession: from.id, toSession: to.id, artifactId: op.artifactId || null, note: op.note, status: '대기', ts: t });
        this.log(to.id, 'req', `[${nameOf(who)} · ${from.title}]${a ? ` 「${a.name}」 v${latest(a).v}` : ''} 합치기 요청: ${op.note}`, who);
        this.log(from.id, 'sys', `「${to.title}」 세션으로 요청을 보냈습니다.`, who);
        // 시연: 팀 메인이 잠시 뒤 교통정리 답을 낸다
        setTimeout(() => { this.log(to.id, 'out', `요청을 받았습니다. 다른 세션 작업과 겹치는지 확인 후 순서 ${s.requests.filter(r => r.toSession === to.id && r.status === '대기').length}번으로 합치겠습니다.`, to.ownerId); render(); }, 900);
        break;
      }
      case 'resolveRequest': { const r = s.requests.find(r => r.id === op.requestId); r.status = op.status; this.log(r.fromSession, 'sys', `보낸 요청이 「${op.status}」 처리되었습니다.`, who); this.log(r.toSession, 'sys', `요청을 「${op.status}」 처리했습니다.`, who); break; }
      case 'createChannel': { const id = this.id('ch'); s.channels.push({ id, projectId: op.projectId, name: op.name, kind: op.members && op.members.length ? 'dm' : 'channel', members: op.members || [] }); ui.channelId = id; break; }
      case 'post': {
        const m = { id: this.id('m'), channelId: op.channelId, from: who, text: op.text, ts: t, artifactId: op.artifactId || null, replyTo: op.replyTo || null };
        s.messages.push(m);
        const ch = s.channels.find(c => c.id === op.channelId);
        if (op.text.includes('@본부장') || (ch && ch.name === '본부장')) setTimeout(() => { this.answer(m); render(); }, 700);
        break;
      }
      case 'wiki': {
        const w = op.id && s.wiki.find(w => w.id === op.id);
        if (w) Object.assign(w, { title: op.title, body: op.body, scope: op.scope || 'team', by: who, updatedAt: t });
        else { const id = this.id('w'); s.wiki.push({ id, projectId: op.projectId, title: op.title, body: op.body, scope: op.scope || 'team', by: who, updatedAt: t }); ui.wikiId = id; }
        break;
      }
      case 'plan': {
        const it = op.id && s.plan.find(p => p.id === op.id);
        if (it) { ['title', 'ownerId', 'done', 'artifactId', 'when'].forEach(k => { if (op[k] != null) it[k] = op[k]; }); }
        else s.plan.push({ id: this.id('t'), projectId: op.projectId, title: op.title || '', ownerId: op.ownerId ?? who, done: !!op.done, artifactId: op.artifactId || null, when: op.when || '오늘' });
        break;
      }
      case 'setHelpLevel': { const m = s.members.find(m => m.id === who); if (m) m.helpLevel = op.level; break; }
      case 'board': {
        const b = op.id && s.boards.find(b => b.id === op.id);
        if (b) { b.name = op.name; b.widgets = op.widgets; } else { const id = this.id('b'); s.boards.push({ id, projectId: op.projectId, name: op.name, widgets: op.widgets, by: who }); ui.boardId = id; }
        break;
      }
      case 'agentReview': this.review(op.projectId); break;
      default: throw new Error('알 수 없는 동작: ' + op.op);
    }
  },
  review(pid) {
    const p = st().projects.find(p => p.id === pid); if (!p) return '';
    const items = st().plan.filter(x => x.projectId === pid);
    const ss = sessionsOf(pid);
    const pending = st().requests.filter(r => r.projectId === pid && r.status === '대기').length;
    let out = `📋 「${p.name}」 점검 보고\n· 계획 ${items.length}건 중 ${items.filter(x => x.done).length}건 완료\n· 세션 ${ss.length}개 중 ${ss.filter(s => s.status === 'working').length}개 가동, ${ss.filter(s => s.status === 'stalled').length}개 멈춤\n· 합치기 대기 ${pending}건\n`;
    if (!p.goal) out += '⚠ 목표가 비어 있습니다. 이 채널에 「목표: …」라고 적어 주세요.\n';
    out += '\n🗓 오늘 후속 계획 (노는 세션 없이)\n';
    let n = 0;
    p.members.forEach(mid => {
      const todo = items.filter(x => !x.done && x.ownerId === mid);
      const idle = ss.filter(s => s.ownerId === mid && s.status !== 'working').length;
      if (!todo.length) out += `· ${nameOf(mid)}: 남은 계획 없음 → 다음 일을 정해 주세요${idle ? ` (쉬는 세션 ${idle}개)` : ''}\n`;
      todo.slice(0, 3).forEach(t => { out += `${++n}. ${nameOf(mid)} — ${t.title}\n`; });
    });
    const un = items.filter(x => !x.done && !x.ownerId);
    if (un.length) out += `· 담당자 없는 일 ${un.length}건: ${un.map(x => x.title).join(', ')}\n`;
    this.agentPost(pid, out);
    this.wiki(pid, '오늘의 진행 요약', out);
    return out;
  },
  answer(m) {
    const ch = st().channels.find(c => c.id === m.channelId); if (!ch) return;
    const pid = ch.projectId; const text = m.text.replace('@본부장', '').trim(); const who = nameOf(m.from);
    let reply;
    const g = text.match(/^목표\s*:\s*(.+)/s), td = text.match(/^할\s*일\s*:\s*(.+)/s);
    if (g) { st().projects.find(p => p.id === pid).goal = g[1].trim(); this.wiki(pid, '프로젝트 목표', g[1].trim()); reply = `목표를 「${g[1].trim()}」로 기록했습니다. 이 목표를 이루려면 오늘 무엇부터 끝나야 할까요? 한 줄씩 「할 일: …」로 적어 주세요.`; }
    else if (td) { st().plan.push({ id: this.id('t'), projectId: pid, title: td[1].trim(), ownerId: m.from, done: false, artifactId: null, when: '오늘' }); reply = `「${td[1].trim()}」를 ${who} 님의 오늘 계획에 넣었습니다. 세션이 멈추면 이 일을 먼저 맡기겠습니다.`; }
    else if (/점검|계획|현황/.test(text)) { this.review(pid); return; }
    else {
      const w = st().wiki.find(w => w.projectId === pid && w.title === '사람들의 생각 기록');
      this.wiki(pid, '사람들의 생각 기록', (w ? w.body + '\n' : '') + `- ${who}: ${text}`);
      reply = `${who} 님 말씀을 위키 「사람들의 생각 기록」에 남겼습니다. 이걸로 최종적으로 무엇을 만들고 싶으신지, 누가 쓰게 되는지 한 줄로 알려 주시겠어요? (「목표: …」, 「할 일: …」, 「점검」이라고 쓰시면 바로 반영합니다)`;
    }
    st().messages.push({ id: this.id('m'), channelId: m.channelId, from: AGENT, text: reply, ts: now(), replyTo: m.id });
  },
  tick() {
    const t = now();
    st().sessions.filter(s => s.status === 'working' && t - s.lastActivity > 120000).forEach(s => {
      s.status = 'stalled';
      const help = member(s.ownerId).helpLevel ?? 2;
      this.coach(s.projectId, s.id, 'warn', `${nameOf(s.ownerId)} 님의 「${s.title}」 세션이 ${Math.max(1, Math.round((t - s.lastActivity) / 60000))}분 넘게 멈춰 있습니다.`);
      const next = st().plan.find(p => p.projectId === s.projectId && !p.done && p.ownerId === s.ownerId);
      if (help >= 2 && next) this.log(s.id, help >= 3 ? 'req' : 'coach', help >= 3 ? `[AI 본부장 지시] 다음 일: ${next.title} — 끝나면 산출물을 올리고 완료 표시해 주세요.` : `[AI 본부장 제안] 쉬는 동안 이 일을 하면 좋겠습니다: ${next.title}`, AGENT);
    });
    st().plan.filter(p => p.done && !p.artifactId).forEach(p => this.coach(p.projectId, null, 'check', `검수: 「${p.title}」는 완료 표시됐지만 연결된 산출물이 없습니다. 빠진 것이 없는지 확인해 주세요.`));
  },
};

// 시연 방식에서 동료들이 일하는 모습(다른 컴퓨터에서 오는 출력)
const SIM = {
  's-kim-login': ['달력에서 오늘 날짜를 주황 동그라미로 표시했습니다.', '인원 고르기 버튼(1~6명)을 넣었습니다.', '예약 확인 화면 v1 거의 완성 — 확인 버튼 문구 「예약 확정하기」'],
  's-lee-api': ['test 예약_취소_후_대기자_알림 ... ok', '취소 기능 작성 끝. 시험 15개 통과.', '대기 알림 문구 자리 비워 둠 (담당자 미정)'],
  's-cos-park': ['둘째 문단: 「바르는 순간 시원하게, 오후까지 촉촉하게.」', '성분표 문안: 시카·판테놀·세라마이드·스쿠알란·글리세린'],
  's-kim-main': ['하위 세션 진행: 로그인·예약 화면(가동), 아이콘(멈춤)'],
  's-team': ['요청 대기열 확인: 이도윤 님 「취소 버튼 추가」 1건 대기 중'],
};
let simIdx = 0;
function simulate() {
  if (S.live || !st()) return;
  const keys = Object.keys(SIM).filter(k => { const s = st().sessions.find(x => x.id === k); return s && s.ownerId !== S.me && s.status !== 'done'; });
  if (!keys.length) return;
  const k = keys[simIdx++ % keys.length]; const lines = SIM[k]; const line = lines.shift(); if (!line) return; lines.push(line);
  const s = st().sessions.find(x => x.id === k);
  Demo.log(k, 'out', line, s.ownerId);
  render(true);
}

// ───────── 연결 방식 ─────────
function connect() {
  if (S.ws) { try { S.ws.onclose = null; S.ws.close(); } catch {} S.ws = null; }
  if (!cfg.relay) { startDemo(); return; }
  setConn('연결 중…');
  let ws;
  try { ws = new WebSocket(cfg.relay); } catch (e) { setConn('주소 오류'); startDemo(); return; }
  S.ws = ws;
  ws.onopen = () => {
    ws.send(JSON.stringify({ op: 'hello', key: cfg.key, member: { id: cfg.id, name: cfg.name || '이름 없음', computer: cfg.computer || '내 컴퓨터', role: cfg.role || '', helpLevel: 2 } }));
  };
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.t === 'welcome') { S.live = true; S.me = m.memberId; S.claude = m.claude; setConn('연결됨'); }
    else if (m.t === 'snapshot') { S.state = m.state; ensureSelection(); render(); }
    else if (m.t === 'log') { if (!S.state) return; (S.state.logs[m.sessionId] = S.state.logs[m.sessionId] || []).push(m.line); const s = S.state.sessions.find(x => x.id === m.sessionId); if (s) s.lastActivity = m.line.ts; render(true); }
    else if (m.t === 'error') toast(m.msg);
  };
  ws.onclose = () => { S.live = false; setConn('끊김 — 5초 뒤 다시 연결'); setTimeout(() => { if (S.ws === ws) connect(); }, 5000); };
}
function setConn(t) { S.connText = t; renderMe(); }
function startDemo() {
  S.live = false; S.me = 'u-choi';
  S.state = fixTimes(JSON.parse(JSON.stringify(window.ITDA_DEMO)));
  S.connText = '시연 방식 (서버 없음)';
  ensureSelection(); render();
}

function ensureSelection() {
  if (!st()) return;
  if (!st().projects.find(p => p.id === ui.projectId)) ui.projectId = (st().projects[0] || {}).id || null;
  if (!st().sessions.find(s => s.id === ui.sessionId && s.projectId === ui.projectId)) ui.sessionId = (teamMain(ui.projectId) || sessionsOf(ui.projectId)[0] || {}).id || null;
  const chs = st().channels.filter(c => c.projectId === ui.projectId);
  if (!chs.find(c => c.id === ui.channelId)) ui.channelId = (chs[0] || {}).id || null;
}

// ───────── 그리기 ─────────
function render(light) {
  if (!st()) return;
  renderTree(); renderCenter(light);
  if (!light || ui.tab === 'map' || ui.tab === 'chat') renderRight(light);
  renderMe(); renderUnread();
}

function renderTree() {
  const html = st().projects.map(p => {
    const on = p.id === ui.projectId;
    const open = ui.open[p.id] !== false;
    const people = p.members.map(mid => {
      const m = member(mid); const ss = sessionsOf(p.id).filter(s => s.ownerId === mid && !s.isTeamMain);
      if (!ss.length && mid !== S.me) return '';
      return `<div class="pc"><div class="who"><span title="${m.online ? '접속 중' : '접속 안 함'}">🖥</span><span class="dot ${m.online ? 'on' : 'off'}"></span>${esc(m.name)}<span class="comp">${esc(m.computer)}</span></div>
        ${ss.map(s => sessNode(s)).join('')}
        ${mid === S.me ? `<div class="addsess" data-add="${p.id}">＋ 내 세션 열기</div>` : ''}</div>`;
    }).join('');
    const tm = teamMain(p.id);
    return `<div class="proj ${on ? 'on' : ''}"><div class="pt" data-proj="${p.id}"><span>${open ? '▾' : '▸'}</span><span style="flex:1">${esc(p.name)}</span><span class="kind ${p.kind === '사업' ? 'biz' : ''}">${esc(p.kind)}</span></div>
      ${open ? `${tm ? sessNode(tm, '🎼 ') : ''}${people}` : ''}</div>`;
  }).join('');
  $('#tree').innerHTML = html || '<p class="muted pad">프로젝트가 없습니다. 위의 버튼으로 만드세요.</p>';
}
function sessNode(s, pre = '') {
  return `<div class="node ${s.id === ui.sessionId ? 'on' : ''}" data-sess="${s.id}" title="${esc(STATUS[s.status] || s.status)}"><span class="dot ${s.status}"></span><span class="t">${pre}${esc(s.title)}</span>${s.isMain && !s.isTeamMain ? '<span class="muted small">메인</span>' : ''}</div>`;
}

function renderMe() {
  const m = st() ? member(S.me) : { name: cfg.name };
  $('#meBox').innerHTML = `${st() ? avatar(S.me) : ''}<div style="flex:1;min-width:0"><b>${esc(m.name || '이름 없음')}</b><div class="muted">${esc(S.connText || '')}${S.live && S.claude ? ' · 클로드 본부장' : ''}</div></div><button class="btn sm" id="btnSettings">설정</button>`;
}

function renderCenter(light) {
  const s = session(); const head = $('#sessHead'); const log = $('#log');
  if (!s) { head.innerHTML = '<h2>세션을 고르세요</h2>'; log.innerHTML = ''; $('#coachStrip').innerHTML = ''; return; }
  const mine = s.ownerId === S.me; const owner = member(s.ownerId);
  if (!light) {
    head.innerHTML = `${avatar(s.ownerId, 30)}<div><h2>${s.isTeamMain ? '🎼 ' : ''}${esc(s.title)}</h2><div class="muted small">🖥 ${esc(owner.name)} · ${esc(owner.computer)} · <span class="dot ${s.status}" style="display:inline-block"></span> ${STATUS[s.status] || s.status}</div></div>
      <div class="grow"></div>
      <div class="seg" role="group" aria-label="보기 방식"><button data-mode="term" class="${ui.mode === 'term' ? 'on' : ''}">터미널</button><button data-mode="chat" class="${ui.mode === 'chat' ? 'on' : ''}">쉬운 채팅</button></div>
      ${mine ? `<button class="btn sm" id="btnPublish">산출물 올리기</button>${!s.isTeamMain ? '<button class="btn sm" id="btnSendTeam">팀 메인에 합치기 요청</button>' : ''}
      <select class="btn sm" id="selStatus">${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${k === s.status ? 'selected' : ''}>${v}</option>`).join('')}</select>` : `<button class="btn sm" id="btnAsk">이 세션에 요청 보내기</button>`}`;
  }
  const lines = (st().logs[s.id] || []);
  const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 60;
  log.className = 'log' + (ui.mode === 'term' ? ' term' : '');
  const pend = s.isTeamMain ? st().requests.filter(r => r.toSession === s.id && r.status === '대기') : [];
  const reqBox = pend.length ? `<div class="card-req pending"><b>📥 합치기 대기 ${pend.length}건</b> — 팀 메인이 순서대로 정리합니다.\n${pend.map(r => { const f = st().sessions.find(x => x.id === r.fromSession) || {}; return `· ${esc(nameOf(f.ownerId))} «${esc(f.title)}»: ${esc(r.note)} <button class="btn sm" data-resolve="${r.id}" data-st="합침">합침</button> <button class="btn sm" data-resolve="${r.id}" data-st="반려">반려</button>`; }).join('\n')}</div>` : '';
  if (ui.mode === 'term') {
    log.innerHTML = reqBox + lines.map(l => `<div class="l ${l.kind}"><span class="ts">${hhmm(l.ts)}</span>${l.from && l.from !== s.ownerId ? `[${esc(nameOf(l.from))}] ` : ''}${esc(l.text)}</div>`).join('');
  } else {
    log.innerHTML = reqBox + lines.map(l => {
      if (l.kind === 'sys') return `<div class="sysline">${esc(l.text)} · ${hhmm(l.ts)}</div>`;
      if (l.kind === 'req') return `<div class="card-req">📨 ${esc(l.text)}</div>`;
      if (l.kind === 'coach') return `<div class="card-coach">🧭 ${esc(l.text)}</div>`;
      const isIn = l.kind === 'in';
      const who = isIn ? nameOf(l.from) : 'AI 세션';
      return `<div class="bub ${isIn ? 'in' : 'out'}">${isIn ? avatar(l.from, 26) : '<span class="avatar" style="background:#1F2A44;width:26px;height:26px">AI</span>'}<div><div class="who">${esc(who)} · ${hhmm(l.ts)}</div><div class="body" ${l.kind === 'err' ? 'style="color:var(--red)"' : ''}>${esc(l.text)}</div></div></div>`;
    }).join('');
  }
  if (atBottom || !light) log.scrollTop = log.scrollHeight;

  // 본부장 코칭 띠
  const me = member(S.me); const lvl = me.helpLevel ?? 2;
  const c = lvl === 0 ? null : [...st().coach].reverse().find(c => c.sessionId === s.id || (!c.sessionId && c.projectId === s.projectId && lvl >= 2)) || [...st().coach].reverse().find(c => c.projectId === s.projectId && (lvl >= 2 || c.level !== 'info'));
  $('#coachStrip').innerHTML = `<span>🧭</span><span class="txt">${c ? `<span class="tag ${c.level}">${{ warn: '경고', check: '검수', info: '코칭' }[c.level] || ''}</span>${esc(c.text)}` : '<span class="muted">AI 본부장 코칭이 꺼져 있거나 지금은 할 말이 없습니다.</span>'}</span>
    <label class="muted small">도움 정도 <select id="selHelp" class="btn sm">${HELP.map((h, i) => `<option value="${i}" ${i === lvl ? 'selected' : ''}>${h}</option>`).join('')}</select></label>`;

  $('#inputHint').innerHTML = mine
    ? (ui.mode === 'term' ? `터미널 방식: ${TAURI ? '이 컴퓨터에서 명령이 실행됩니다.' : '<b>시연</b>: 명령은 흉내만 냅니다(데스크톱 앱에서 실제 실행).'} · <code>/보내기 내용</code> 팀 메인에 합치기 요청 · <code>/산출물 이름 | 내용</code> · <code>/도움</code>`
      : `쉬운 채팅: AI에게 평소 말로 부탁하세요. ${TAURI ? `(<code>${esc(cfg.aiCmd)}</code> 로 실행)` : '<b>시연</b>: 답은 흉내만 냅니다.'} · <code>/보내기</code> · <code>/산출물</code> · <code>/도움</code>`)
    : `${esc(owner.name)} 님의 세션은 볼 수만 있습니다. 여기에 쓰면 <b>이 세션으로 요청</b>이 갑니다(내 메인 세션에서 보냄).`;
  $('#input').placeholder = mine ? (ui.mode === 'term' ? '명령 입력 (예: dir, cargo test)' : '무엇을 도와드릴까요?') : `${owner.name} 님 세션에 보낼 요청`;
}

function renderUnread() {
  const n = st().channels.filter(c => c.projectId === ui.projectId).reduce((a, c) => a + unreadOf(c.id), 0);
  $('#unread').textContent = n ? n : '';
}
const unreadOf = cid => st().messages.filter(m => m.channelId === cid && m.from !== S.me && m.ts > (ui.lastRead[cid] || 0)).length;

function renderRight(light) {
  $$('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === ui.tab));
  const pane = $('#pane');
  if (light && ui.tab === 'chat') { const box = $('.msgs', pane); if (box) { renderChat(); return; } }
  if (light && ui.tab === 'map') { renderMap(); return; }
  ({ map: renderMap, board: renderBoard, chat: renderChat, wiki: renderWiki, agent: renderAgent })[ui.tab]();
}

// ── 연결 지도(마인드맵) ──
function renderMap() {
  const p = project(); if (!p) { $('#pane').innerHTML = ''; return; }
  const arts = artifactsOf(p.id);
  const people = p.members.filter(mid => ui.mapFilter === 'all' || mid === S.me);
  const W = { p: 140, m: 168, s: 178, a: 196 }, X = { p: 8, m: 170, s: 362, a: 566 }, RH = 46;
  let rows = 0; const nodes = []; const links = [];
  const totalV = arts.reduce((a, x) => a + x.versions.length, 0);
  people.forEach(mid => {
    const ss = sessionsOf(p.id).filter(s => s.ownerId === mid);
    if (!ss.length) return;
    const mStart = rows;
    ss.forEach(s => {
      const as = arts.filter(a => a.sessionId === s.id);
      const sStart = rows;
      as.forEach(a => { nodes.push({ t: 'a', a, y: rows * RH }); rows++; });
      if (!as.length) rows++;
      const sy = ((sStart + rows - 1) / 2) * RH;
      nodes.push({ t: 's', s, y: sy });
      as.forEach((a, i) => links.push([X.s + W.s, sy, X.a, (sStart + i) * RH]));
    });
    const my = ((mStart + rows - 1) / 2) * RH;
    nodes.push({ t: 'm', mid, y: my, ss });
    nodes.filter(n => n.t === 's' && n.s.ownerId === mid).forEach(n => links.push([X.m + W.m, my, X.s, n.y]));
    rows += 0.4;
  });
  const py = ((rows - 1.4) / 2) * RH;
  nodes.filter(n => n.t === 'm').forEach(n => links.push([X.p + W.p, py, X.m, n.y]));
  const H = Math.max(rows * RH + 20, 200);
  const cut = (s, n) => s.length > n ? s.slice(0, n - 1) + '…' : s;
  const maxWork = Math.max(1, ...nodes.filter(n => n.t === 'm').map(n => work(n.mid, p.id).score));
  let svg = `<svg class="map" viewBox="0 0 770 ${H}" role="img" aria-label="${esc(p.name)} 연결 지도"><g transform="translate(0,14)">`;
  links.forEach(([x1, y1, x2, y2]) => { const mx = (x1 + x2) / 2; svg += `<path class="lnk" d="M${x1} ${y1 + 17} C${mx} ${y1 + 17}, ${mx} ${y2 + 17}, ${x2} ${y2 + 17}"/>`; });
  svg += `<g class="n"><rect x="${X.p}" y="${py - 6}" width="${W.p}" height="46" rx="12" fill="var(--navy)"/><text x="${X.p + 12}" y="${py + 13}" font-size="13" font-weight="700" fill="var(--paper)" style="fill:var(--paper)">${esc(cut(p.name, 10))}</text><text x="${X.p + 12}" y="${py + 31}" font-size="10.5" style="fill:#FFB38F">${p.members.length}명 · 산출물 ${arts.length} · 버전 ${totalV}</text></g>`;
  nodes.forEach(n => {
    if (n.t === 'm') {
      const m = member(n.mid); const w = work(n.mid, p.id);
      svg += `<g class="n"><rect x="${X.m}" y="${n.y - 4}" width="${W.m}" height="42" rx="10" fill="var(--paper)"/><circle cx="${X.m + 16}" cy="${n.y + 11}" r="9" fill="${colorOf(n.mid)}"/><text x="${X.m + 31}" y="${n.y + 15}" font-size="12.5" font-weight="700">🖥 ${esc(cut(m.name, 6))}</text>
        <text x="${X.m + 10}" y="${n.y + 31}" font-size="10" style="fill:var(--muted)">세션 ${w.sessions} · 버전 ${w.versions} · 줄 ${w.lines}</text>
        <rect x="${X.m + 118}" y="${n.y + 24}" width="42" height="6" rx="3" fill="var(--bg)"/><rect x="${X.m + 118}" y="${n.y + 24}" width="${Math.max(3, 42 * w.score / maxWork)}" height="6" rx="3" fill="var(--accent)"/></g>`;
    } else if (n.t === 's') {
      const c = { working: '#2BB673', waiting: '#E8A33D', stalled: '#E5484D', done: '#9aa3b5' }[n.s.status] || '#999';
      svg += `<g class="n" data-sess="${n.s.id}" style="cursor:pointer"><rect x="${X.s}" y="${n.y}" width="${W.s}" height="34" rx="9" fill="var(--paper)"/><circle cx="${X.s + 13}" cy="${n.y + 17}" r="5" fill="${c}"/><text x="${X.s + 24}" y="${n.y + 21}" font-size="12">${n.s.isTeamMain ? '🎼 ' : ''}${esc(cut(n.s.title, 11))}</text></g>`;
    } else {
      const a = n.a; const v = latest(a).v;
      svg += `<g class="n art" data-art="${a.id}"><rect x="${X.a}" y="${n.y}" width="${W.a}" height="34" rx="9" fill="var(--bg)"/><text x="${X.a + 10}" y="${n.y + 21}" font-size="12">${kindIcon(a.kind)} ${esc(cut(a.name, 10))}</text>
        <rect x="${X.a + W.a - 40}" y="${n.y + 8}" width="32" height="18" rx="9" fill="${v >= 5 ? '#FF7A45' : v >= 3 ? '#FFB38F' : '#E3DACA'}"/><text x="${X.a + W.a - 24}" y="${n.y + 21}" font-size="11" font-weight="700" text-anchor="middle" style="fill:${v >= 3 ? '#fff' : '#1F2A44'}">v${v}</text></g>`;
    }
  });
  svg += '</g></svg>';
  $('#pane').innerHTML = `<div class="map-tools"><b>${esc(p.name)}</b><span class="muted small">사람 → 세션 → 산출물. 산출물을 누르면 열립니다.</span><div class="grow"></div>
    <span class="chip ${ui.mapFilter === 'all' ? 'on' : ''}" data-mapf="all">모두</span><span class="chip ${ui.mapFilter === 'me' ? 'on' : ''}" data-mapf="me">나만</span></div>
    <div class="legend pad" style="padding-bottom:0"><span><i class="dot working"></i>일하는 중</span><span><i class="dot waiting"></i>사람 대기</span><span><i class="dot stalled"></i>멈춤</span><span>v숫자 = 버전(진할수록 많이 고침)</span><span>주황 막대 = 업무량</span></div>
    <div class="pad">${svg}</div>`;
}
function work(mid, pid) {
  const ss = sessionsOf(pid).filter(s => s.ownerId === mid);
  const versions = artifactsOf(pid).reduce((a, x) => a + x.versions.filter(v => v.by === mid).length, 0);
  const lines = ss.reduce((a, s) => a + (st().logs[s.id] || []).filter(l => l.from === mid || l.kind === 'out').length, 0);
  return { sessions: ss.length, versions, lines, score: ss.length * 2 + versions * 3 + lines * 0.5 };
}

function openArtifact(id) {
  const a = st().artifacts.find(a => a.id === id); if (!a) return;
  let vi = a.versions.length - 1;
  const draw = () => {
    const v = a.versions[vi];
    const c = v.content || '';
    const prev = c.trim().startsWith('<svg') ? c.replace(/<script[\s\S]*?<\/script>/gi, '') : c ? `<pre>${esc(c)}</pre>` : '<p class="muted">이 버전은 내용 미리보기가 없습니다(시연 자료).</p>';
    $('#modalBox').innerHTML = `<h3>${kindIcon(a.kind)} ${esc(a.name)} <span class="muted small">${esc(a.kind)} · 만든 사람 ${esc(nameOf(a.ownerId))}</span></h3>
      <div class="vers">${a.versions.map((x, i) => `<span class="chip ${i === vi ? 'on' : ''}" data-vi="${i}">v${x.v}</span>`).join('')}</div>
      <p class="muted small">v${v.v} · ${esc(nameOf(v.by))} · ${ago(v.ts)}${v.note ? ' · ' + esc(v.note) : ''}</p>
      <div class="preview">${prev}</div>
      <div class="acts"><button class="btn" data-share="${a.id}">메신저에 공유</button><button class="btn primary" data-close>닫기</button></div>`;
    $$('[data-vi]', $('#modalBox')).forEach(b => b.onclick = () => { vi = +b.dataset.vi; draw(); });
  };
  draw(); $('#modal').classList.remove('hidden');
}

// ── 협업 대시보드 ──
const WIDGETS = { goal: '목표·지침', progress: '계획 진척·검수', uptime: '세션 가동 현황', workload: '팀원 업무량', followup: '오늘 후속 계획', coach: '본부장 코칭', requests: '합치기 요청', artifacts: '최근 산출물' };
function renderBoard() {
  const p = project(); if (!p) return;
  const boards = st().boards.filter(b => b.projectId === p.id);
  const b = boards.find(b => b.id === ui.boardId) || { id: 'base', name: '기본', widgets: Object.keys(WIDGETS) };
  const items = st().plan.filter(x => x.projectId === p.id);
  const ss = sessionsOf(p.id);
  const W = {
    goal: () => `<h4>🎯 목표·지침</h4><div style="font-weight:700;line-height:1.5">${esc(p.goal || '목표가 비어 있습니다')}</div><p class="muted small" style="white-space:pre-wrap">${esc(p.guide || '')}</p><button class="btn sm" data-editgoal>고치기</button>`,
    progress: () => { const d = items.filter(x => x.done).length; return `<h4>✅ 계획 진척 <span class="muted">${d}/${items.length}</span></h4><div class="bar g"><i style="width:${items.length ? 100 * d / items.length : 0}%"></i></div>
      <div style="margin-top:8px">${items.map(x => `<label class="check"><input type="checkbox" data-plan="${x.id}" ${x.done ? 'checked' : ''}><span class="${x.done ? 'done' : ''}">${esc(x.title)} <span class="muted small">· ${esc(x.ownerId ? nameOf(x.ownerId) : '담당 없음')}${x.done && !x.artifactId ? ' · <b style="color:var(--red)">산출물 없음</b>' : ''}</span></span></label>`).join('')}</div>
      <div class="row" style="display:flex;gap:6px;margin-top:6px"><input id="newPlan" placeholder="할 일 추가" style="flex:1;border:1px solid var(--line);border-radius:8px;padding:5px 8px;background:var(--bg)"><button class="btn sm" data-addplan>추가</button></div>`; },
    uptime: () => { const c = k => ss.filter(s => s.status === k).length; const n = ss.length || 1; return `<h4>⚙️ 세션 가동 현황</h4><div class="big">${Math.round(100 * c('working') / n)}<span style="font-size:14px">% 가동</span></div>
      <div class="stack" style="margin:8px 0"><i style="width:${100 * c('working') / n}%;background:var(--green)"></i><i style="width:${100 * c('waiting') / n}%;background:var(--yellow)"></i><i style="width:${100 * c('stalled') / n}%;background:var(--red)"></i></div>
      <div class="small muted">일하는 중 ${c('working')} · 사람 대기 ${c('waiting')} · 멈춤 ${c('stalled')} · 끝남 ${c('done')}</div>`; },
    workload: () => { const ws = p.members.map(m => [m, work(m, p.id)]); const mx = Math.max(1, ...ws.map(x => x[1].score)); return `<h4>👥 팀원 업무량</h4>${ws.map(([m, w]) => `<div class="wl"><span>${esc(nameOf(m))}</span><div class="bar"><i style="width:${100 * w.score / mx}%"></i></div><span class="muted">버전 ${w.versions}</span></div>`).join('')}<p class="muted small">세션 수·올린 버전·작업 줄 수로 계산(예시 공식)</p>`; },
    followup: () => { const todo = items.filter(x => !x.done); return `<h4>🗓 오늘 후속 계획</h4>${todo.length ? todo.map((x, i) => `<div class="check">${i + 1}. ${esc(x.title)} <span class="muted small">· ${esc(x.ownerId ? nameOf(x.ownerId) : '담당 없음')} · ${esc(x.when || '')}</span></div>`).join('') : '<p class="muted">남은 일이 없습니다. 본부장에게 다음 계획을 물어보세요.</p>'}<button class="btn sm" data-review>본부장에게 후속 계획 받기</button>`; },
    coach: () => `<h4>🧭 본부장 코칭</h4>${[...st().coach].filter(c => c.projectId === p.id).reverse().slice(0, 6).map(c => `<div class="coachitem"><span class="tag ${c.level}">${{ warn: '경고', check: '검수', info: '코칭' }[c.level]}</span>${esc(c.text)} <span class="muted small">${ago(c.ts)}</span></div>`).join('') || '<p class="muted">없음</p>'}`,
    requests: () => `<h4>📥 합치기 요청</h4>${st().requests.filter(r => r.projectId === p.id).slice().reverse().map(r => { const f = st().sessions.find(s => s.id === r.fromSession) || {}; return `<div class="coachitem"><span class="tag ${r.status === '대기' ? 'check' : 'info'}">${esc(r.status)}</span>${esc(nameOf(f.ownerId))}: ${esc(r.note)}</div>`; }).join('') || '<p class="muted">없음</p>'}`,
    artifacts: () => `<h4>📦 최근 산출물</h4>${artifactsOf(p.id).slice().sort((a, b) => latest(b).ts - latest(a).ts).slice(0, 6).map(a => `<div class="coachitem" data-art="${a.id}" style="cursor:pointer">${kindIcon(a.kind)} ${esc(a.name)} <b>v${latest(a).v}</b> <span class="muted small">${esc(nameOf(latest(a).by))} · ${ago(latest(a).ts)}</span></div>`).join('')}`,
  };
  $('#pane').innerHTML = `<div class="boards"><span class="chip ${b.id === 'base' ? 'on' : ''}" data-board="base">기본</span>${boards.map(x => `<span class="chip ${x.id === b.id ? 'on' : ''}" data-board="${x.id}">${esc(x.name)}</span>`).join('')}
    <div class="grow"></div>${b.id !== 'base' ? '<button class="btn sm" data-editboard>이 판 고치기</button>' : ''}<button class="btn sm" data-newboard>＋ 대시보드 만들기</button></div>
    <p class="muted small" style="margin:8px 14px 0">공유 대시보드: 여기서 만든 판은 프로젝트의 모든 사람에게 똑같이 보입니다.${b.by ? ` 만든 사람 ${esc(nameOf(b.by))}.` : ''}</p>
    <div class="grid">${b.widgets.filter(w => W[w]).map(w => `<div class="card">${W[w]()}</div>`).join('')}</div>`;
}
function boardDialog(b) {
  const p = project();
  modal(`<h3>${b ? '대시보드 고치기' : '새 협업 대시보드'}</h3><label>이름</label><input id="bName" value="${esc(b ? b.name : '')}" placeholder="예: 출시 준비판">
    <label>보여 줄 조각</label>${Object.entries(WIDGETS).map(([k, v]) => `<label class="check" style="color:var(--text);font-size:14px"><input type="checkbox" value="${k}" ${!b || b.widgets.includes(k) ? 'checked' : ''}> ${v}</label>`).join('')}
    <div class="acts"><button class="btn" data-close>취소</button><button class="btn primary" id="bSave">저장하고 공유</button></div>`);
  $('#bSave').onclick = () => {
    const name = $('#bName').value.trim() || '이름 없는 판';
    const widgets = $$('#modalBox input[type=checkbox]:checked').map(x => x.value);
    send({ op: 'board', projectId: p.id, id: b ? b.id : null, name, widgets }); closeModal(); toast('대시보드를 공유했습니다');
  };
}

// ── 메신저 ──
function renderChat() {
  const p = project(); if (!p) return;
  const chs = st().channels.filter(c => c.projectId === p.id && (c.kind === 'channel' || c.members.includes(S.me)));
  const ch = chs.find(c => c.id === ui.channelId) || chs[0];
  if (!ch) { $('#pane').innerHTML = '<p class="pad muted">채널이 없습니다.</p>'; return; }
  ui.channelId = ch.id;
  ui.lastRead[ch.id] = now(); LS.set('read', ui.lastRead);
  const msgs = st().messages.filter(m => m.channelId === ch.id);
  const byId = Object.fromEntries(st().messages.map(m => [m.id, m]));
  const names = st().members.map(m => m.name).concat(['본부장']);
  const hl = t => { let h = esc(t); names.forEach(n => { h = h.split('@' + esc(n)).join(`<span class="mention">@${esc(n)}</span>`); }); return h; };
  const listItem = c => `<div class="ch ${c.id === ch.id ? 'on' : ''}" data-ch="${c.id}">${c.kind === 'dm' ? '👤' : c.name === '본부장' ? '🧭' : '#'} ${esc(c.kind === 'dm' ? c.members.filter(m => m !== S.me).map(nameOf).join(', ') || c.name : c.name)}${unreadOf(c.id) && c.id !== ch.id ? `<span class="n">${unreadOf(c.id)}</span>` : ''}</div>`;
  const existing = $('.msgs', $('#pane'));
  const keepScroll = existing && existing.dataset.ch === ch.id ? existing.scrollHeight - existing.scrollTop - existing.clientHeight < 60 : true;
  const draft = $('#chatInput') ? $('#chatInput').value : '';
  const focused = document.activeElement && document.activeElement.id === 'chatInput';
  $('#pane').innerHTML = `<div class="chat"><div class="chlist"><div class="sec">채널</div>${chs.filter(c => c.kind === 'channel').map(listItem).join('')}<div class="ch muted" data-newch>＋ 채널 만들기</div>
      <div class="sec">개인 대화</div>${chs.filter(c => c.kind === 'dm').map(listItem).join('')}<div class="ch muted" data-newdm>＋ 개인 대화</div></div>
    <div class="chmain"><div class="chhead">${ch.kind === 'dm' ? '👤' : ch.name === '본부장' ? '🧭' : '#'} ${esc(ch.kind === 'dm' ? ch.members.filter(m => m !== S.me).map(nameOf).join(', ') : ch.name)}${ch.name === '본부장' ? '<span class="muted small" style="font-weight:400">AI 본부장이 여러분의 생각을 묻고 위키에 정리합니다. 「목표: …」 「할 일: …」 「점검」</span>' : ''}</div>
      <div class="msgs" data-ch="${ch.id}">${msgs.map(m => { const a = m.artifactId && st().artifacts.find(x => x.id === m.artifactId); const r = m.replyTo && byId[m.replyTo];
        return `<div class="msg ${m.from === AGENT ? 'agent' : ''}">${avatar(m.from, 30)}<div style="min-width:0;flex:1"><div class="meta"><b>${esc(nameOf(m.from))}</b>${hhmm(m.ts)}<span class="msgact" data-reply="${m.id}">답글</span></div>
        ${r ? `<div class="reply">↪ ${esc(nameOf(r.from))}: ${esc(r.text.slice(0, 60))}</div>` : ''}<div class="txt">${hl(m.text)}</div>${a ? `<div class="attach" data-art="${a.id}">${kindIcon(a.kind)} ${esc(a.name)} <b>v${latest(a).v}</b> 열기</div>` : ''}</div></div>`; }).join('') || '<p class="muted">첫 메시지를 남겨 보세요.</p>'}</div>
      ${ui.replyTo ? `<div class="reply" style="margin:0 12px">↪ 답글 다는 중: ${esc((byId[ui.replyTo] || {}).text || '').slice(0, 50)} <span class="msgact" data-noreply>취소</span></div>` : ''}
      <form class="chinput" id="chatForm"><select id="chatAttach" class="btn sm" title="산출물 붙이기"><option value="">📎 없음</option>${artifactsOf(p.id).map(a => `<option value="${a.id}">${esc(a.name)} v${latest(a).v}</option>`).join('')}</select>
        <input id="chatInput" placeholder="메시지 (@이름 으로 부르기, @본부장)" autocomplete="off"><button class="btn primary">보내기</button></form></div></div>`;
  const box = $('.msgs', $('#pane')); if (keepScroll) box.scrollTop = box.scrollHeight;
  if (draft) $('#chatInput').value = draft; if (focused) $('#chatInput').focus();
  renderUnread();
}

// ── 지식위키 ──
function renderWiki() {
  const p = project(); if (!p) return;
  const pages = st().wiki.filter(w => w.projectId === p.id);
  const w = pages.find(w => w.id === ui.wikiId) || pages[0];
  const item = x => `<div class="ch ${w && x.id === w.id ? 'on' : ''}" data-wiki="${x.id}">${x.scope === 'common' ? '🔗' : '📘'} ${esc(x.title)}</div>`;
  $('#pane').innerHTML = `<div class="wiki"><div class="wlist"><div class="sec">팀 위키</div>${pages.filter(x => x.scope !== 'common').map(item).join('')}
    <div class="sec">공통분모 위키 (여러 팀 공유)</div>${pages.filter(x => x.scope === 'common').map(item).join('') || '<div class="muted small" style="padding:4px 10px">없음</div>'}
    <div class="ch muted" data-newwiki>＋ 새 문서</div></div>
    <div class="wpage">${w ? `<h3>${w.scope === 'common' ? '🔗' : '📘'} ${esc(w.title)}</h3><p class="muted small">${w.scope === 'common' ? '공통분모 위키' : '팀 위키'} · 마지막 정리 ${esc(nameOf(w.by))} · ${ago(w.updatedAt)}</p><pre>${esc(w.body)}</pre><button class="btn sm" data-editwiki="${w.id}">고치기</button>` : '<p class="muted">위키가 비어 있습니다. AI 본부장이 대화·산출물·결정을 모아 채웁니다.</p>'}</div></div>`;
}
function wikiDialog(w) {
  const p = project();
  modal(`<h3>${w ? '위키 고치기' : '새 위키 문서'}</h3><label>제목</label><input id="wTitle" value="${esc(w ? w.title : '')}"><label>내용</label><textarea id="wBody" rows="10">${esc(w ? w.body : '')}</textarea>
    <label>범위</label><select id="wScope"><option value="team">팀 위키</option><option value="common" ${w && w.scope === 'common' ? 'selected' : ''}>공통분모 위키(다른 팀과 공유)</option></select>
    <div class="acts"><button class="btn" data-close>취소</button><button class="btn primary" id="wSave">저장</button></div>`);
  $('#wSave').onclick = () => { send({ op: 'wiki', projectId: p.id, id: w ? w.id : null, title: $('#wTitle').value.trim() || '제목 없음', body: $('#wBody').value, scope: $('#wScope').value }); closeModal(); };
}

// ── AI 본부장 ──
function renderAgent() {
  const p = project(); if (!p) return;
  const me = member(S.me); const lvl = me.helpLevel ?? 2;
  const items = st().plan.filter(x => x.projectId === p.id);
  const stalled = sessionsOf(p.id).filter(s => s.status === 'stalled');
  const common = st().wiki.filter(w => w.projectId === p.id && w.scope === 'common');
  const others = st().projects.filter(x => x.id !== p.id);
  $('#pane').innerHTML = `<div class="grid">
    <div class="card"><h4>🧭 나에 대한 도움 정도</h4><div class="seg">${HELP.map((h, i) => `<button data-help="${i}" class="${i === lvl ? 'on' : ''}">${h}</button>`).join('')}</div><p class="small" style="margin:8px 0 0">${HELP_DESC[lvl]}</p></div>
    <div class="card"><h4>📋 지금 점검</h4><p class="small">계획서 대비 빠진 일, 멈춘 세션, 대기 중 합치기를 모아 <b>당일 후속 계획</b>을 메신저 #본부장 채널과 위키에 올립니다.</p><button class="btn primary sm" data-review>점검하고 후속 계획 세우기</button>${S.live ? `<p class="muted small">${S.claude ? '클로드가 답을 씁니다.' : '중계 서버에 클로드 열쇠가 없어 규칙으로 답합니다.'}</p>` : ''}</div>
    <div class="card" style="grid-column:1/-1"><h4>✅ 계획서 검수표</h4><table style="width:100%;border-collapse:collapse;font-size:13px"><tr class="muted small"><td>할 일</td><td>담당</td><td>상태</td><td>산출물</td><td>판정</td></tr>
      ${items.map(x => { const a = x.artifactId && st().artifacts.find(y => y.id === x.artifactId); const verdict = x.done ? (a ? '<span class="tag info">통과</span>' : '<span class="tag warn">빠짐</span>') : '<span class="tag check">진행</span>';
        return `<tr style="border-top:1px solid var(--line)"><td style="padding:5px 0">${esc(x.title)}</td><td>${esc(x.ownerId ? nameOf(x.ownerId) : '—')}</td><td>${x.done ? '완료' : esc(x.when || '')}</td><td>${a ? `<span class="attach" data-art="${a.id}">${kindIcon(a.kind)} v${latest(a).v}</span>` : '—'}</td><td>${verdict}</td></tr>`; }).join('')}</table>
      <p class="muted small">정식 제품에서는 다른 AI(지피티·재미나이)에게 같은 검수를 맡겨 교차 확인합니다.</p></div>
    <div class="card"><h4>🔴 멈춘 세션 ${stalled.length}개</h4>${stalled.map(s => `<div class="coachitem">${esc(nameOf(s.ownerId))} · ${esc(s.title)} <span class="muted small">${ago(s.lastActivity)}</span><br><button class="btn sm" data-nudge="${s.id}">다음 일 시키기</button></div>`).join('') || '<p class="muted">노는 세션이 없습니다 👍</p>'}</div>
    <div class="card"><h4>🔗 복제본·허브</h4><p class="small">본부장 복제본을 다른 팀(프로젝트)에 보내 <b>공통분모 위키</b> ${common.length}개를 함께 지키게 합니다.</p>
      ${others.length ? `<select id="cloneTo" class="btn sm">${others.map(o => `<option value="${o.id}">${esc(o.name)}</option>`).join('')}</select> <button class="btn sm" data-clone>복제본 보내기</button>` : '<p class="muted small">다른 프로젝트가 없습니다.</p>'}</div>
  </div>`;
}
function nudge(sid) {
  const s = st().sessions.find(x => x.id === sid);
  const next = st().plan.find(p => p.projectId === s.projectId && !p.done && p.ownerId === s.ownerId) || st().plan.find(p => p.projectId === s.projectId && !p.done && !p.ownerId);
  const text = `[AI 본부장 지시 · ${nameOf(S.me)} 확인] 다음 일: ${next ? next.title : '오늘 계획을 다시 확인하고 남은 일을 정리해 주세요'}`;
  send({ op: 'log', sessionId: sid, kind: 'req', text });
  send({ op: 'setSessionStatus', sessionId: sid, status: 'working' });
  toast(`${nameOf(s.ownerId)} 님의 세션에 일을 보냈습니다`);
}
function cloneTo(target) {
  const p = project(); const common = st().wiki.filter(w => w.projectId === p.id && w.scope === 'common');
  common.forEach(w => send({ op: 'wiki', projectId: target, title: `${w.title.replace(/ \(.+에서 복제\)$/, '')} (${p.name}에서 복제)`, body: w.body, scope: 'common' }));
  const ch = st().channels.find(c => c.projectId === target && c.name === '본부장');
  const msg = `🔗 「${p.name}」 본부장의 복제본이 왔습니다. 공통분모 위키 ${common.length}개를 가져왔고, 이 팀이 그 원칙을 지키는지 함께 보겠습니다.`;
  if (ch) send({ op: 'post', channelId: ch.id, text: msg });
  toast(`복제본을 보냈습니다 (공통 위키 ${common.length}개)`);
}

// ───────── 세션 입력 처리 ─────────
async function submitInput(text) {
  const s = session(); if (!s || !text.trim()) return;
  const mine = s.ownerId === S.me;
  if (!mine) {
    const from = myMain(s.projectId);
    if (!from) { toast('먼저 이 프로젝트에 내 세션을 하나 여세요'); return; }
    send({ op: 'sendRequest', fromSession: from.id, toSession: s.id, artifactId: null, note: text.trim() });
    toast(`${nameOf(s.ownerId)} 님의 세션으로 요청을 보냈습니다`); return;
  }
  const t = text.trim();
  if (t === '/도움') { send({ op: 'log', sessionId: s.id, kind: 'sys', text: '명령: /보내기 내용 (팀 메인에 합치기 요청) · /산출물 이름 | 내용 · /완료 · /도움' }); return; }
  if (t === '/완료') { send({ op: 'setSessionStatus', sessionId: s.id, status: 'done' }); return; }
  if (t.startsWith('/보내기')) { sendTeam(t.replace('/보내기', '').trim() || '합쳐 주세요'); return; }
  if (t.startsWith('/산출물')) { const [name, ...rest] = t.replace('/산출물', '').split('|'); publish(name.trim() || '이름 없는 산출물', rest.join('|').trim()); return; }
  send({ op: 'log', sessionId: s.id, kind: 'in', text: t });
  if (TAURI) {
    const cmd = ui.mode === 'term' ? t : `${cfg.aiCmd} ${JSON.stringify(t)}`;
    try { await TAURI.core.invoke('run_command', { sessionId: s.id, command: cmd }); }
    catch (e) { send({ op: 'log', sessionId: s.id, kind: 'err', text: '실행 실패: ' + e }); }
  } else if (!S.live) {
    setTimeout(() => {
      const reply = ui.mode === 'term' ? `(시연) 「${t}」 명령을 실행한 것처럼 보여 줍니다. 실제 실행은 잇다 데스크톱 앱에서 됩니다.` : `(시연) 알겠습니다. 「${t.slice(0, 40)}」 작업을 시작합니다. 끝나면 산출물로 올리고 팀 메인에 합치기 요청을 보낼까요?`;
      send({ op: 'log', sessionId: s.id, kind: 'out', text: reply });
    }, 600);
  } else {
    send({ op: 'log', sessionId: s.id, kind: 'sys', text: '이 화면은 웹 보기입니다. 명령을 실제로 실행하려면 잇다 데스크톱 앱을 쓰세요.' });
  }
}
function sendTeam(note) {
  const s = session(); const tm = teamMain(s.projectId);
  if (!tm) { toast('팀 메인 세션이 없습니다'); return; }
  const a = artifactsOf(s.projectId).filter(a => a.sessionId === s.id).sort((x, y) => latest(y).ts - latest(x).ts)[0];
  send({ op: 'sendRequest', fromSession: s.id, toSession: tm.id, artifactId: a ? a.id : null, note });
  toast('팀 메인 세션에 합치기 요청을 보냈습니다');
}
function publish(name, content, kind = '문서', note = '') {
  const s = session();
  send({ op: 'publishArtifact', projectId: s.projectId, sessionId: s.id, name, kind, content, note, artifactId: null });
  toast(`산출물 「${name}」을 올렸습니다`);
}

// ───────── 대화상자 ─────────
function modal(html) { $('#modalBox').innerHTML = html; $('#modal').classList.remove('hidden'); const f = $('#modalBox input, #modalBox textarea'); if (f) f.focus(); }
function closeModal() { $('#modal').classList.add('hidden'); }

function settingsDialog() {
  modal(`<h3>설정</h3>
    <label>내 이름</label><input id="cName" value="${esc(cfg.name)}" placeholder="예: 김하늘">
    <label>이 컴퓨터 이름 (동료에게 보이는 이름)</label><input id="cComp" value="${esc(cfg.computer)}" placeholder="예: 디자인실 아이맥">
    <label>중계 서버 주소 — 비우면 시연 방식</label><input id="cRelay" value="${esc(cfg.relay)}" placeholder="예: ws://192.168.0.10:7878/ws">
    <label>모임 암호</label><input id="cKey" type="password" value="${esc(cfg.key)}">
    <label>쉬운 채팅에서 부를 AI 명령 (데스크톱 앱)</label><input id="cAi" value="${esc(cfg.aiCmd)}">
    <label>화면 밝기</label><select id="cTheme"><option value="auto">컴퓨터 설정 따름</option><option value="light" ${cfg.theme === 'light' ? 'selected' : ''}>밝게</option><option value="dark" ${cfg.theme === 'dark' ? 'selected' : ''}>어둡게</option></select>
    ${TAURI ? `<label>이 컴퓨터를 팀 중계 서버로 (팀에서 한 사람만)</label><button class="btn" id="cHost">이 컴퓨터에서 중계 서버 켜기 (포트 7878)</button><p class="muted small" id="cHostMsg"></p>` : ''}
    <p class="muted small">내 아이디: ${esc(cfg.id)} (다른 컴퓨터에서 같은 사람으로 보이려면 이 값을 옮기세요)</p>
    <div class="acts"><button class="btn" data-close>취소</button><button class="btn primary" id="cSave">저장하고 다시 연결</button></div>`);
  $('#cSave').onclick = () => {
    Object.assign(cfg, { name: $('#cName').value.trim(), computer: $('#cComp').value.trim(), relay: $('#cRelay').value.trim(), key: $('#cKey').value, aiCmd: $('#cAi').value.trim() || 'claude -p', theme: $('#cTheme').value });
    LS.set('cfg', cfg); applyTheme(); closeModal(); connect();
  };
  if ($('#cHost')) $('#cHost').onclick = async () => {
    try {
      const port = await TAURI.core.invoke('start_relay', { port: 7878, key: $('#cKey').value });
      const info = await TAURI.core.invoke('machine_info');
      $('#cRelay').value = `ws://127.0.0.1:${port}/ws`;
      $('#cHostMsg').innerHTML = `켜졌습니다. 동료들은 설정의 중계 서버 주소에 <b>ws://${esc(info.lan_ip)}:${port}/ws</b> 를 넣으면 됩니다. (윈도우 방화벽이 물으면 「허용」)`;
    } catch (e) { $('#cHostMsg').textContent = '켜지 못했습니다: ' + e; }
  };
}
function applyTheme() { if (cfg.theme === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.dataset.theme = cfg.theme; }

// ───────── 이벤트 ─────────
document.addEventListener('click', e => {
  const t = e.target.closest('[data-proj],[data-sess],[data-add],[data-mode],[data-tab],[data-art],[data-close],[data-share],[data-ch],[data-newch],[data-newdm],[data-reply],[data-noreply],[data-wiki],[data-newwiki],[data-editwiki],[data-board],[data-newboard],[data-editboard],[data-editgoal],[data-addplan],[data-review],[data-help],[data-nudge],[data-clone],[data-resolve],[data-mapf],#btnNewProject,#btnSettings,#btnPublish,#btnSendTeam,#btnAsk,#modal');
  if (!t) return;
  const d = t.dataset;
  if (t.id === 'modal') { if (e.target === t) closeModal(); return; }
  if (d.proj) { if (ui.projectId === d.proj) { ui.open[d.proj] = ui.open[d.proj] === false; LS.set('open', ui.open); } ui.projectId = d.proj; ui.sessionId = null; ui.channelId = null; ensureSelection(); render(); }
  else if (d.sess) { const s = st().sessions.find(x => x.id === d.sess); ui.sessionId = s.id; if (s.projectId !== ui.projectId) { ui.projectId = s.projectId; ui.channelId = null; ensureSelection(); } render(); }
  else if (d.add) { modal(`<h3>내 세션 열기</h3><label>세션 이름</label><input id="sTitle" placeholder="예: 로그인 화면 시안"><label class="check" style="color:var(--text)"><input type="checkbox" id="sMain" ${myMain(d.add) ? '' : 'checked'} style="width:auto"> 내 메인 세션 (하위 세션들을 대표)</label><div class="acts"><button class="btn" data-close>취소</button><button class="btn primary" id="sSave">열기</button></div>`);
    $('#sSave').onclick = () => { send({ op: 'openSession', projectId: d.add, title: $('#sTitle').value.trim() || '새 세션', isMain: $('#sMain').checked }); closeModal(); }; }
  else if (d.mode) { ui.mode = d.mode; LS.set('mode', ui.mode); renderCenter(); }
  else if (d.tab) { ui.tab = d.tab; renderRight(); }
  else if (d.art) openArtifact(d.art);
  else if (d.close !== undefined) closeModal();
  else if (d.share) { const a = st().artifacts.find(x => x.id === d.share); const ch = st().channels.find(c => c.projectId === a.projectId && c.name === '전체') || st().channels.find(c => c.projectId === a.projectId); if (ch) send({ op: 'post', channelId: ch.id, text: `「${a.name}」 v${latest(a).v} 공유합니다`, artifactId: a.id }); closeModal(); ui.tab = 'chat'; ui.channelId = ch && ch.id; renderRight(); }
  else if (d.ch) { ui.channelId = d.ch; ui.replyTo = null; renderChat(); }
  else if (d.newch !== undefined) { modal(`<h3>새 채널</h3><label>채널 이름</label><input id="nCh" placeholder="예: 출시준비"><div class="acts"><button class="btn" data-close>취소</button><button class="btn primary" id="nSave">만들기</button></div>`); $('#nSave').onclick = () => { send({ op: 'createChannel', projectId: ui.projectId, name: $('#nCh').value.trim() || '새 채널', members: [] }); closeModal(); }; }
  else if (d.newdm !== undefined) { const p = project(); modal(`<h3>개인 대화</h3><label>상대</label><select id="nDm">${p.members.filter(m => m !== S.me).map(m => `<option value="${m}">${esc(nameOf(m))}</option>`).join('')}</select><div class="acts"><button class="btn" data-close>취소</button><button class="btn primary" id="nSave">시작</button></div>`); $('#nSave').onclick = () => { const m = $('#nDm').value; const ex = st().channels.find(c => c.kind === 'dm' && c.projectId === p.id && c.members.includes(m) && c.members.includes(S.me)); if (ex) ui.channelId = ex.id; else send({ op: 'createChannel', projectId: p.id, name: nameOf(m), members: [S.me, m] }); closeModal(); renderChat(); }; }
  else if (d.reply) { ui.replyTo = d.reply; renderChat(); $('#chatInput').focus(); }
  else if (d.noreply !== undefined) { ui.replyTo = null; renderChat(); }
  else if (d.wiki) { ui.wikiId = d.wiki; renderWiki(); }
  else if (d.newwiki !== undefined) wikiDialog(null);
  else if (d.editwiki) wikiDialog(st().wiki.find(w => w.id === d.editwiki));
  else if (d.board) { ui.boardId = d.board; renderBoard(); }
  else if (d.newboard !== undefined) boardDialog(null);
  else if (d.editboard !== undefined) boardDialog(st().boards.find(b => b.id === ui.boardId));
  else if (d.editgoal !== undefined) { const p = project(); modal(`<h3>목표·지침</h3><label>목표</label><input id="gGoal" value="${esc(p.goal)}"><label>지침</label><textarea id="gGuide" rows="5">${esc(p.guide)}</textarea><div class="acts"><button class="btn" data-close>취소</button><button class="btn primary" id="gSave">저장</button></div>`); $('#gSave').onclick = () => { send({ op: 'updateProject', projectId: p.id, goal: $('#gGoal').value, guide: $('#gGuide').value }); closeModal(); }; }
  else if (d.addplan !== undefined) { const v = $('#newPlan').value.trim(); if (v) send({ op: 'plan', projectId: ui.projectId, title: v, ownerId: S.me }); }
  else if (d.review !== undefined) { send({ op: 'agentReview', projectId: ui.projectId }); ui.tab = 'chat'; ui.channelId = (st().channels.find(c => c.projectId === ui.projectId && c.name === '본부장') || {}).id; renderRight(); toast('본부장이 점검 보고를 올렸습니다'); }
  else if (d.help) { send({ op: 'setHelpLevel', level: +d.help }); }
  else if (d.nudge) nudge(d.nudge);
  else if (d.clone !== undefined) cloneTo($('#cloneTo').value);
  else if (d.resolve) send({ op: 'resolveRequest', requestId: d.resolve, status: d.st });
  else if (d.mapf) { ui.mapFilter = d.mapf; renderMap(); }
  else if (t.id === 'btnNewProject') { modal(`<h3>새 프로젝트 (메인 채팅)</h3><label>이름</label><input id="pName" placeholder="예: 진정 크림 라인"><label>종류</label><select id="pKind"><option>개발</option><option>사업</option></select><label>목표 (나중에 본부장과 정해도 됩니다)</label><input id="pGoal"><div class="acts"><button class="btn" data-close>취소</button><button class="btn primary" id="pSave">만들기</button></div>`); $('#pSave').onclick = () => { send({ op: 'createProject', name: $('#pName').value.trim() || '새 프로젝트', kind: $('#pKind').value, goal: $('#pGoal').value.trim() }); closeModal(); }; }
  else if (t.id === 'btnSettings') settingsDialog();
  else if (t.id === 'btnPublish') { modal(`<h3>산출물 올리기</h3><label>이름 (같은 이름이면 버전이 올라갑니다)</label><input id="aName" list="aList"><datalist id="aList">${artifactsOf(ui.projectId).map(a => `<option value="${esc(a.name)}">`).join('')}</datalist><label>종류</label><select id="aKind"><option>문서</option><option>디자인</option><option>코드</option><option>이미지</option><option>이메일</option></select><label>바뀐 점</label><input id="aNote"><label>내용 (글, 또는 &lt;svg&gt; 그림)</label><textarea id="aBody" rows="6"></textarea><div class="acts"><button class="btn" data-close>취소</button><button class="btn primary" id="aSave">올리기</button></div>`); $('#aSave').onclick = () => { publish($('#aName').value.trim() || '이름 없는 산출물', $('#aBody').value, $('#aKind').value, $('#aNote').value); closeModal(); }; }
  else if (t.id === 'btnSendTeam') { modal(`<h3>팀 메인 세션에 합치기 요청</h3><p class="small muted">이 세션의 가장 최근 산출물이 함께 갑니다. 팀 메인이 다른 사람 작업과 겹치지 않게 순서를 정해 합칩니다.</p><label>부탁할 말</label><textarea id="rNote" rows="3" placeholder="예: 로그인 시안 v3 앱에 반영해 주세요"></textarea><div class="acts"><button class="btn" data-close>취소</button><button class="btn primary" id="rSave">보내기</button></div>`); $('#rSave').onclick = () => { sendTeam($('#rNote').value.trim() || '합쳐 주세요'); closeModal(); }; }
  else if (t.id === 'btnAsk') { $('#input').focus(); }
});
document.addEventListener('change', e => {
  if (e.target.id === 'selStatus') send({ op: 'setSessionStatus', sessionId: ui.sessionId, status: e.target.value });
  if (e.target.id === 'selHelp') send({ op: 'setHelpLevel', level: +e.target.value });
  if (e.target.dataset.plan) send({ op: 'plan', projectId: ui.projectId, id: e.target.dataset.plan, done: e.target.checked });
});
document.addEventListener('submit', e => {
  e.preventDefault();
  if (e.target.id === 'inputBar') { const v = $('#input').value; $('#input').value = ''; submitInput(v); }
  if (e.target.id === 'chatForm') { const v = $('#chatInput').value.trim(); if (!v) return; send({ op: 'post', channelId: ui.channelId, text: v, artifactId: $('#chatAttach').value || null, replyTo: ui.replyTo }); $('#chatInput').value = ''; ui.replyTo = null; renderChat(); }
});
$('#input').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); $('#inputBar').requestSubmit(); } });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

// 가운데·오른쪽 넓이 조절
(() => { const sp = $('#splitter'); let drag = false; sp.addEventListener('mousedown', () => { drag = true; document.body.style.userSelect = 'none'; });
  window.addEventListener('mouseup', () => { drag = false; document.body.style.userSelect = ''; });
  window.addEventListener('mousemove', e => { if (!drag) return; const w = Math.min(Math.max(window.innerWidth - e.clientX, 320), window.innerWidth - 600); document.documentElement.style.setProperty('--right-w', w + 'px'); }); })();

// 데스크톱 앱: 이 컴퓨터에서 실행한 명령의 출력을 받아 중계 서버로 올린다
if (TAURI && TAURI.event) {
  TAURI.event.listen('itda-out', ev => { const { sessionId, kind, text } = ev.payload; send({ op: 'log', sessionId, kind, text }); });
  TAURI.core.invoke('machine_info').then(info => { let ch = false; if (!cfg.computer) { cfg.computer = info.computer; ch = true; } if (!cfg.name) { cfg.name = info.user; ch = true; } if (ch) { LS.set('cfg', cfg); if (S.live) connect(); } }).catch(() => {});
}

// 시작
applyTheme();
connect();
setInterval(() => { if (!S.live && st()) { Demo.tick(); render(true); } }, 15000);
setInterval(simulate, 5000);
window.ITDA = { S, ui, send, Demo, render };
})();
