// 아이센스투게더 화면. 빌드 없이 도는 순수 자바스크립트.
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
  id: 'u-' + rid(), name: '', computer: '', relay: '', key: '', aiCmd: 'claude -p', theme: 'auto', incoming: 'ask',
}, LS.get('cfg', {}));
if (!cfg.relay && servedByRelay && location.port) cfg.relay = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';

// ───────── 상태 ─────────
const S = { state: null, me: 'u-choi', live: false, ws: null, claude: false, version: '', stop: false, gen: 0 };

// ───────── 오류 보고 ─────────
// 연결 중이면 바로 서버로, 아니면 localStorage 에 최대 20건 모았다가 다음 연결 때 보낸다. 같은 오류는 1분에 한 번만.
const ERR = { sent: {} };
function reportError(message, detail) {
  try {
    message = String(message || '알 수 없는 오류').slice(0, 500); detail = String(detail || '').slice(0, 4000);
    const key = message + '|' + detail.split('\n')[0];
    const t = Date.now();
    if (ERR.sent[key] && t - ERR.sent[key] < 60000) return;
    ERR.sent[key] = t;
    const item = { message, detail, version: S.version || '화면' };
    if (S.live && S.ws && S.ws.readyState === 1) S.ws.send(JSON.stringify(Object.assign({ op: 'report' }, item)));
    else { const q = LS.get('errq', []); q.push(item); LS.set('errq', q.slice(-20)); }
  } catch {}
}
function flushErrors() {
  try {
    const q = LS.get('errq', []); if (!q.length || !(S.ws && S.ws.readyState === 1)) return;
    LS.set('errq', []);
    q.forEach(it => S.ws.send(JSON.stringify(Object.assign({ op: 'report' }, it))));
  } catch {}
}
window.addEventListener('error', e => reportError(e.message, (e.error && e.error.stack) || `${e.filename || ''}:${e.lineno || ''}:${e.colno || ''}`));
window.addEventListener('unhandledrejection', e => { const r = e.reason; reportError('처리되지 않은 약속 오류: ' + ((r && r.message) || r), (r && r.stack) || ''); });
// 로그인·관리 상태. mode: 'open'(모임 암호 또는 무암호) | 'google'(회사 구글 계정)
const A = { mode: null, google: null, needLogin: false, email: '', admin: false, audit: null, auditState: 'idle', auditMsg: '' };

// ───────── 로그인 토큰 보관 ─────────
// 나중에 운영체제 보관소(윈도우 자격 증명 관리자 등)로 옮길 것.
// 지금은 편의상 localStorage 에 둔다. 토큰이 새어 나가지 않도록 화면에 찍거나 서버 오류 보고에 싣지 않는다.
const Tok = {
  get() { return LS.get('auth', null); },
  set(v) { LS.set('auth', v); },
  clear() { try { localStorage.removeItem('itda.auth'); } catch {} },
};
const nowSec = () => Math.floor(Date.now() / 1000);
// 쓸 수 있는 토큰을 돌려준다. 만료가 5분 안이면 새로 받고, 안 되면 null.
async function ensureToken() {
  const a = Tok.get();
  if (!a || !a.idToken) return null;
  if ((a.expiresAt || 0) - nowSec() > 300) return a;
  if (!TAURI || !a.refreshToken || !A.google) return null;
  try {
    const r = await TAURI.core.invoke('google_refresh', { clientId: A.google.clientId, clientSecret: A.google.clientSecret, refreshToken: a.refreshToken });
    const n = Object.assign({}, a, { idToken: r.idToken, expiresAt: r.expiresAt });
    Tok.set(n); return n;
  } catch { return null; }
}
const httpBase = relay => { try { return new URL(relay.replace(/^ws/i, 'http')).origin; } catch { return ''; } };

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
const member = id => id === AGENT ? { id: AGENT, name: 'AI 본부장', computer: '아이센스투게더 중계 서버' } : (st().members.find(m => m.id === id) || { id, name: id, computer: '' });
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
  if (S.live && S.ws && S.ws.readyState === 1) { S.ws.send(JSON.stringify(op)); return { ok: true }; }
  let r = { ok: true };
  try { Demo.apply(S.me, op); } catch (e) { r = { ok: false, error: e.message || String(e) }; toast(r.error); }
  render();
  return r;
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
      case 'shareExtension': {
        const e = op.ext || {}; const c = cleanExt(e, e.files);
        s.extensions = s.extensions || [];
        const ent = Object.assign({}, c.manifest, { files: c.files, status: '대기', by: who, at: t });
        const i = s.extensions.findIndex(x => x.id === c.manifest.id);
        if (i >= 0) s.extensions[i] = ent; else s.extensions.push(ent);
        break;
      }
      case 'approveExtension': { const x = (s.extensions || []).find(x => x.id === op.id); if (!x) throw new Error('확장을 찾을 수 없습니다'); x.status = '승인'; break; }
      case 'removeExtension': { const x = (s.extensions || []).find(x => x.id === op.id); if (!x) throw new Error('확장을 찾을 수 없습니다'); s.extensions = s.extensions.filter(y => y !== x); break; }
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
async function connect() {
  const gen = ++S.gen;
  S.stop = false;
  if (S.ws) { try { S.ws.onclose = null; S.ws.close(); } catch {} S.ws = null; }
  S.live = false;
  if (!cfg.relay) { A.mode = null; A.needLogin = false; setAdmin(false, ''); startDemo(); return; }
  setConn('연결 중…');
  // 1) 서버가 어떤 로그인 방식인지 먼저 묻는다(옛 서버라 답이 없으면 모임 암호 방식으로 본다)
  let conf = { mode: 'open', needKey: !!cfg.key };
  try {
    const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 5000);
    const r = await fetch(httpBase(cfg.relay) + '/auth-config', { signal: ctl.signal }); clearTimeout(to);
    if (r.ok) conf = await r.json();
  } catch {}
  if (gen !== S.gen) return;
  A.mode = conf.mode === 'google' ? 'google' : 'open';
  let token = null;
  if (A.mode === 'google') {
    A.google = { clientId: conf.clientId || '', clientSecret: conf.clientSecret || '', domain: conf.domain || '' };
    if (!TAURI) {
      // 브라우저에서는 구글 로그인 창을 열 수 없다
      A.needLogin = false; if (!st()) startDemo();
      setConn('회사 계정 로그인은 데스크톱 앱에서 됩니다'); browserNotice(); return;
    }
    token = await ensureToken();
    if (gen !== S.gen) return;
    if (!token) { A.needLogin = true; if (!st()) startDemo(); setConn('로그인이 필요합니다'); loginDialog(); return; }
  }
  A.needLogin = false;
  openSocket(gen, token);
}
function openSocket(gen, token) {
  let ws;
  try { ws = new WebSocket(cfg.relay); } catch (e) { setConn('주소 오류'); startDemo(); return; }
  S.ws = ws;
  ws.onopen = () => {
    const hello = { op: 'hello', member: { id: cfg.id, name: cfg.name || '이름 없음', computer: cfg.computer || '내 컴퓨터', role: cfg.role || '', helpLevel: 2 } };
    if (token) hello.token = token.idToken; else hello.key = cfg.key;
    ws.send(JSON.stringify(hello));
  };
  ws.onmessage = ev => {
    let m; try { m = JSON.parse(ev.data); } catch { return; }
    if (m.t === 'welcome') {
      S.live = true; S.me = m.memberId; S.claude = m.claude; S.version = m.version || '';
      setAdmin(!!m.admin, m.email || ''); setConn('연결됨'); flushErrors();
    }
    else if (m.t === 'snapshot') { S.state = m.state; ensureSelection(); render(); }
    else if (m.t === 'log') { if (!S.state) return; (S.state.logs[m.sessionId] = S.state.logs[m.sessionId] || []).push(m.line); const s = S.state.sessions.find(x => x.id === m.sessionId); if (s) s.lastActivity = m.line.ts; render(true); }
    else if (m.t === 'error') onServerError(m);
  };
  ws.onclose = () => {
    S.live = false; setAdmin(false, A.email);
    if (S.stop) return;
    setConn('끊김 — 5초 뒤 다시 연결'); setTimeout(() => { if (S.ws === ws && !S.stop) connect(); }, 5000);
  };
}
function onServerError(m) {
  if (m.code === 'auth') {
    S.stop = true; Tok.clear();
    if (A.mode === 'google') { A.needLogin = true; setConn('로그인이 필요합니다'); loginDialog(m.msg); }
    else { setConn('모임 암호가 맞지 않습니다'); toast(m.msg); settingsDialog(); }
  } else if (m.code === 'blocked') {
    S.stop = true; setConn('차단된 계정입니다'); blockedDialog(m.msg);
  } else toast(m.msg);
}
function setAdmin(on, email) {
  A.admin = on; A.email = email || '';
  renderTabs();
  if (!on && ui.tab === 'admin') { ui.tab = 'map'; if (st()) renderRight(); }
  renderMe();
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
  autoReqs();
  extPushAll();
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
  renderFixerNode();
}
function sessNode(s, pre = '') {
  return `<div class="node ${s.id === ui.sessionId && !ui.fixer ? 'on' : ''}" data-sess="${s.id}" title="${esc(STATUS[s.status] || s.status)}"><span class="dot ${s.status}"></span><span class="t">${pre}${esc(s.title)}</span>${s.isMain && !s.isTeamMain ? '<span class="muted small">메인</span>' : ''}</div>`;
}

function renderMe() {
  const m = st() ? member(S.me) : { name: cfg.name };
  const email = A.email || '';
  const btns = `<button class="btn sm" id="btnSettings">설정</button>${A.mode === 'google' && (email || Tok.get()) ? '<button class="btn sm" data-a="logout">로그아웃</button>' : ''}${A.needLogin && TAURI ? '<button class="btn sm primary" data-a="login">로그인</button>' : ''}`;
  $('#meBox').innerHTML = `${st() ? avatar(S.me) : ''}<div style="flex:1;min-width:0"><b>${esc(m.name || '이름 없음')}</b>${email ? `<div class="muted" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(email)}">${esc(email)}</div>` : ''}<div class="muted">${esc(S.connText || '')}${S.live && S.claude ? ' · 클로드 본부장' : ''}</div></div><div style="display:flex;flex-direction:column;gap:4px">${btns}</div>`;
}

function renderCenter(light) {
  if (ui.fixer) { renderFixer(light); return; }
  const s = session(); const head = $('#sessHead'); const log = $('#log');
  if (!s) { head.innerHTML = '<h2>세션을 고르세요</h2>'; log.innerHTML = ''; $('#coachStrip').innerHTML = ''; return; }
  const mine = s.ownerId === S.me; const owner = member(s.ownerId);
  if (!light) {
    head.innerHTML = `${avatar(s.ownerId, 30)}<div><h2>${s.isTeamMain ? '🎼 ' : ''}${esc(s.title)}</h2><div class="muted small">🖥 ${esc(owner.name)} · ${esc(owner.computer)} · <span class="dot ${s.status}" style="display:inline-block"></span> ${STATUS[s.status] || s.status}</div></div>
      <div class="grow"></div>
      <div class="seg" role="group" aria-label="보기 방식"><button data-mode="term" class="${ui.mode === 'term' ? 'on' : ''}">터미널</button><button data-mode="chat" class="${ui.mode === 'chat' ? 'on' : ''}">쉬운 채팅</button></div>
      ${mine ? `<button class="btn sm" id="btnPublish">산출물 올리기</button>${!s.isTeamMain ? '<button class="btn sm" id="btnSendTeam">팀 메인에 합치기 요청</button>' : ''}
      <select class="btn sm" id="selStatus">${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${k === s.status ? 'selected' : ''}>${v}</option>`).join('')}</select>` : `<button class="btn sm" id="btnAsk">이 세션에 요청 보내기</button>`}<div id="claudeBar"></div>`;
  }
  renderClaudeBar(s, mine);
  const lines = (st().logs[s.id] || []);
  const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 60;
  log.className = 'log' + (ui.mode === 'term' ? ' term' : '');
  const pend = s.isTeamMain ? st().requests.filter(r => r.toSession === s.id && r.status === '대기') : [];
  const reqBox = pend.length ? `<div class="card-req pending"><b>📥 합치기 대기 ${pend.length}건</b> — 팀 메인이 순서대로 정리합니다.\n${pend.map(r => { const f = st().sessions.find(x => x.id === r.fromSession) || {}; return `· ${esc(nameOf(f.ownerId))} «${esc(f.title)}»: ${esc(r.note)} <button class="btn sm" data-resolve="${r.id}" data-st="합침">합침</button> <button class="btn sm" data-resolve="${r.id}" data-st="반려">반려</button>`; }).join('\n')}</div>` : '';
  if (ui.mode === 'term') {
    log.innerHTML = reqBox + lines.map(l => `<div class="l ${l.kind}"><span class="ts">${hhmm(l.ts)}</span>${l.from && l.from !== s.ownerId ? `[${esc(nameOf(l.from))}] ` : ''}${esc(l.text)}</div>${l.kind === 'req' ? reqButtons(s, l, mine) : ''}`).join('');
  } else {
    log.innerHTML = reqBox + lines.map(l => {
      if (l.kind === 'sys') return `<div class="sysline">${esc(l.text)} · ${hhmm(l.ts)}</div>`;
      if (l.kind === 'req') return `<div class="card-req">📨 ${esc(l.text)}${reqButtons(s, l, mine)}</div>`;
      if (l.kind === 'tool') { const [nm, ...rest] = String(l.text).split(' · '); return `<div class="card-tool"><b>${esc(nm)}</b>${rest.length ? ` <span class="sum">${esc(rest.join(' · '))}</span>` : ''}</div>`; }
      if (l.kind === 'denied') return `<div class="card-req denied">⚠️ ${esc(l.text)}</div>`;
      if (l.kind === 'result') return `<div class="resline">${esc(l.text)}</div>`;
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
  const u = $('#unread'); if (u) u.textContent = n ? n : '';
}
const unreadOf = cid => st().messages.filter(m => m.channelId === cid && m.from !== S.me && m.ts > (ui.lastRead[cid] || 0)).length;

function renderRight(light) {
  const vis = tabList().map(t => t.id); if (A.admin) vis.push('admin');
  if (!vis.includes(ui.tab)) ui.tab = vis[0] || '';
  $$('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === ui.tab));
  const pane = $('#pane');
  if (!ui.tab) { pane.dataset.ext = ''; pane.innerHTML = '<p class="pad muted">모든 탭이 숨겨져 있습니다. 「🛠 앱 고치기」에서 「지식위키 탭 다시 보여 줘」처럼 말하거나 「배치 처음대로」를 누르세요.</p>'; return; }
  if (ui.tab.startsWith('ext:')) { renderExtTab(ui.tab); return; }
  pane.dataset.ext = '';
  if (light && ui.tab === 'chat') { const box = $('.msgs', pane); if (box) { renderChat(); return; } }
  if (light && ui.tab === 'map') { renderMap(); return; }
  if (ui.tab === 'admin' && !A.admin) ui.tab = 'map';
  ({ map: renderMap, board: renderBoard, chat: renderChat, wiki: renderWiki, agent: renderAgent, admin: renderAdmin })[ui.tab]();
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
  $('#pane').innerHTML = `<div class="chat${LAY.channelListSide === 'right' ? ' right' : ''}"><div class="chlist"><div class="sec">채널</div>${chs.filter(c => c.kind === 'channel').map(listItem).join('')}<div class="ch muted" data-newch>＋ 채널 만들기</div>
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

// ───────── 이어지는 클로드 세션 ─────────
// 세션별 설정(모델·권한 방식)과 처리한 요청 기록은 이 컴퓨터의 저장소에 둔다.
const CL = { running: {}, cid: {}, checked: {}, boot: now() - 5000, lastBar: '' };
const MODELS = [['', '기본 (클로드 코드 설정)'], ['claude-opus-5-5', '오퍼스 5.5'], ['claude-sonnet-5-5', '소넷 5.5'], ['claude-haiku-5-5', '하이쿠 5.5']];
const PERMS = [['acceptEdits', '편집은 묻지 않음'], ['default', '매번 확인'], ['plan', '계획만 세움']];
const INCOMING = [['ask', '묻고 실행'], ['auto', '자동 실행'], ['none', '받지 않음']];
const csOf = sid => Object.assign({ model: '', perm: 'acceptEdits' }, (LS.get('cs', {}) || {})[sid]);
function csSet(sid, patch) { const all = LS.get('cs', {}) || {}; all[sid] = Object.assign(csOf(sid), patch); LS.set('cs', all); }
const reqKey = (s, l) => `${s.id}|${l.ts}|${String(l.text).length}`;
const reqDone = () => LS.get('reqDone', {}) || {};
const oneLine = (t, n = 120) => { const x = String(t ?? '').replace(/\s+/g, ' ').trim(); return x.length > n ? x.slice(0, n) + '…' : x; };

function renderClaudeBar(s, mine) {
  const box = $('#claudeBar'); if (!box) return;
  if (!mine) { box.innerHTML = ''; box.style.display = 'none'; CL.lastBar = ''; return; }
  const on = !!CL.running[s.id]; const c = csOf(s.id);
  if (TAURI && !CL.checked[s.id]) {
    CL.checked[s.id] = true;
    TAURI.core.invoke('claude_status', { sessionId: s.id }).then(r => { CL.running[s.id] = !!(r && r.running); if (r && r.claudeSessionId) CL.cid[s.id] = r.claudeSessionId; const cur = session(); if (cur && cur.id === s.id) renderClaudeBar(s, true); }).catch(() => {});
  }
  const opts = (list, cur) => list.map(([v, n]) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${n}</option>`).join('');
  const html = `<span class="cstat ${on ? 'on' : ''}"><i></i>클로드 ${on ? '연결됨' : '꺼짐'}${TAURI ? '' : ' (시연)'}</span>
    <button class="btn sm" data-claude="${on ? 'stop' : 'start'}">${on ? '끄기' : '켜기'}</button>
    <label class="muted small">모델 <select class="btn sm" id="selModel" title="다음에 켤 때 적용됩니다">${opts(MODELS, c.model)}</select></label>
    <label class="muted small">권한 <select class="btn sm" id="selPerm" title="다음에 켤 때 적용됩니다">${opts(PERMS, c.perm)}</select></label>`;
  const key = s.id + '|' + html;
  if (key === CL.lastBar && box.innerHTML) return;
  CL.lastBar = key; box.style.display = ''; box.innerHTML = html;
}
async function claudeStart(sid) {
  const c = csOf(sid); const args = { sessionId: sid, permissionMode: c.perm }; if (c.model) args.model = c.model;
  if (!TAURI) {
    CL.running[sid] = true;
    send({ op: 'log', sessionId: sid, kind: 'sys', text: `(시연) 클로드 연결됨 · 모델 ${(MODELS.find(m => m[0] === c.model) || MODELS[0])[1]} · 권한 ${(PERMS.find(m => m[0] === c.perm) || PERMS[0])[1]}` });
    return;
  }
  try { const r = await TAURI.core.invoke('claude_start', args); CL.running[sid] = true; if (r && r.claudeSessionId) CL.cid[sid] = r.claudeSessionId; }
  catch (e) { send({ op: 'log', sessionId: sid, kind: 'err', text: '클로드를 켜지 못했습니다: ' + e }); }
}
async function claudeStop(sid) {
  if (!TAURI) { CL.running[sid] = false; send({ op: 'log', sessionId: sid, kind: 'sys', text: '(시연) 클로드가 꺼졌습니다' }); return; }
  try { await TAURI.core.invoke('claude_stop', { sessionId: sid }); CL.running[sid] = false; }
  catch (e) { send({ op: 'log', sessionId: sid, kind: 'err', text: '클로드를 끄지 못했습니다: ' + e }); }
}
async function claudeSend(sid, text) {
  if (!CL.running[sid]) await claudeStart(sid);
  if (!CL.running[sid]) return;
  try { await TAURI.core.invoke('claude_send', { sessionId: sid, text }); }
  catch (e) { send({ op: 'log', sessionId: sid, kind: 'err', text: '보내지 못했습니다: ' + e }); }
}
// 데스크톱 앱 사건 → 세션 줄 (중계 서버로 올림)
function onClaude(p) {
  if (!p || !p.sessionId) return;
  const sid = p.sessionId; const lg = (kind, text) => send({ op: 'log', sessionId: sid, kind, text });
  const demo = p.demo ? ' (시연)' : '';
  if (p.claudeSessionId) CL.cid[sid] = p.claudeSessionId;
  switch (p.kind) {
    case 'started': CL.running[sid] = true; if (CL.cost) CL.cost[sid] = 0; lg('sys', `클로드 연결됨${p.resumed ? ' (이전 대화를 이어서)' : ''}`); break;
    case 'text': lg('out', p.text); break;
    case 'tool': lg('tool', `${p.tool || '도구'} · ${oneLine(p.text)}${demo}`); break;
    case 'tool_result': if (p.isError) lg('err', oneLine(p.text, 300)); break;
    case 'denied': lg('denied', `허락이 필요한 동작이 막혔습니다: ${p.tool || '도구'} · ${oneLine(p.text)}${demo}`); break;
    case 'result': {
      // 클로드가 주는 비용은 켜 둔 동안의 누적값일 수 있어, 이번 차례에 늘어난 몫만 보인다
      CL.cost = CL.cost || {};
      let c = '';
      if (typeof p.costUsd === 'number') { const prev = CL.cost[sid] || 0; const d = p.costUsd >= prev ? p.costUsd - prev : p.costUsd; CL.cost[sid] = p.costUsd; c = ` · 약 ${d.toFixed(3)}달러`; }
      lg('result', `끝${c}${demo}`); break;
    }
    case 'exit': CL.running[sid] = false; if (CL.cost) CL.cost[sid] = 0; lg('sys', '클로드가 꺼졌습니다'); break;
    case 'error': lg('err', p.text || '클로드 오류'); break;
  }
}
// 시연: 견본과 비슷한 가짜 사건 순서 (서버·데스크톱 앱 없음)
function demoClaudeRun(sid, t) {
  CL.running[sid] = true;
  const steps = [
    { kind: 'tool', tool: 'Bash', text: '폴더를 옮겨 파일을 만드는 명령' },
    { kind: 'denied', tool: 'Bash', text: '폴더를 바꾸고 파일에 쓰는 명령은 확인이 필요합니다' },
    { kind: 'tool', tool: 'Write', text: 'hello.txt 파일 만들기' },
    { kind: 'text', text: `(시연) 알겠습니다. 「${t.slice(0, 40)}」 일을 마쳤습니다. 실제 답은 데스크톱 앱에서 진짜 클로드 코드가 합니다.` },
    { kind: 'result', costUsd: 0.01 },
  ];
  steps.forEach((p, i) => setTimeout(() => onClaude(Object.assign({ sessionId: sid, demo: true }, p)), 500 + i * 700));
}
// 다른 사람·본부장이 보낸 일의 허락 단계
function reqButtons(s, l, mine) {
  if (!mine || l.from === S.me) return '';
  const done = reqDone()[reqKey(s, l)];
  if (done) return `<div class="reqdone">${done === 'ok' ? '맡김' : '거절함'}</div>`;
  if (cfg.incoming === 'none') return '<div class="reqdone">받지 않음 설정</div>';
  if (cfg.incoming === 'auto') return '<div class="reqdone">자동 실행</div>';
  return `<div class="reqacts"><button class="btn sm primary" data-reqok="${esc(reqKey(s, l))}">이 세션에 맡기기</button> <button class="btn sm" data-reqno="${esc(reqKey(s, l))}">거절</button></div>`;
}
function reqMark(key, v) { const d = reqDone(); d[key] = v; LS.set('reqDone', d); }
async function reqHandle(key, accept) {
  const s = session(); if (!s) return;
  const l = (st().logs[s.id] || []).find(x => x.kind === 'req' && reqKey(s, x) === key); if (!l || reqDone()[key]) return;
  reqMark(key, accept ? 'ok' : 'no');
  const who = nameOf(l.from);
  if (!accept) { send({ op: 'log', sessionId: s.id, kind: 'sys', text: `${who} 님의 요청을 거절했습니다` }); return; }
  send({ op: 'log', sessionId: s.id, kind: 'sys', text: `${who} 님의 요청을 맡겼습니다` });
  if (TAURI) await claudeSend(s.id, l.text); else demoClaudeRun(s.id, l.text);
}
// 자동 실행 설정이면 새로 온 요청을 바로 맡긴다 (이 화면을 연 뒤에 온 것만)
function autoReqs() {
  if (cfg.incoming !== 'auto' || !st()) return;
  const s = session(); if (!s || s.ownerId !== S.me) return;
  (st().logs[s.id] || []).forEach(l => { if (l.kind === 'req' && l.from !== S.me && l.ts >= CL.boot) { const k = reqKey(s, l); if (!reqDone()[k]) reqHandle(k, true); } });
}

// ───────── 세션 입력 처리 ─────────
async function submitInput(text) {
  if (ui.fixer) { if (text.trim()) fxSubmit(text.trim()); return; }
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
    if (ui.mode === 'term') {
      try { await TAURI.core.invoke('run_command', { sessionId: s.id, command: t }); }
      catch (e) { send({ op: 'log', sessionId: s.id, kind: 'err', text: '실행 실패: ' + e }); }
    } else await claudeSend(s.id, t);
  } else if (!S.live && ui.mode === 'chat') {
    demoClaudeRun(s.id, t);
  } else if (!S.live) {
    setTimeout(() => {
      const reply = ui.mode === 'term' ? `(시연) 「${t}」 명령을 실행한 것처럼 보여 줍니다. 실제 실행은 아이센스투게더 데스크톱 앱에서 됩니다.` : `(시연) 알겠습니다. 「${t.slice(0, 40)}」 작업을 시작합니다. 끝나면 산출물로 올리고 팀 메인에 합치기 요청을 보낼까요?`;
      send({ op: 'log', sessionId: s.id, kind: 'out', text: reply });
    }, 600);
  } else {
    send({ op: 'log', sessionId: s.id, kind: 'sys', text: '이 화면은 웹 보기입니다. 명령을 실제로 실행하려면 아이센스투게더 데스크톱 앱을 쓰세요.' });
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
    <label>다른 사람이 보낸 일 (합치기 요청·본부장 지시)</label><select id="cIncoming">${INCOMING.map(([v, n]) => `<option value="${v}" ${v === cfg.incoming ? 'selected' : ''}>${n}</option>`).join('')}</select>
    <label>화면 밝기</label><select id="cTheme"><option value="auto">컴퓨터 설정 따름</option><option value="light" ${cfg.theme === 'light' ? 'selected' : ''}>밝게</option><option value="dark" ${cfg.theme === 'dark' ? 'selected' : ''}>어둡게</option></select>
    ${TAURI ? `<label>이 컴퓨터를 팀 중계 서버로 (팀에서 한 사람만)</label><button class="btn" id="cHost">이 컴퓨터에서 중계 서버 켜기 (포트 7878)</button><p class="muted small" id="cHostMsg"></p>` : ''}
    <label>확장 (탭·띠 더하기)</label><button class="btn" data-exta="open">🧩 확장 관리</button>
    <p class="muted small">내 아이디: ${esc(cfg.id)} (다른 컴퓨터에서 같은 사람으로 보이려면 이 값을 옮기세요)</p>
    <div class="acts"><button class="btn" data-close>취소</button><button class="btn primary" id="cSave">저장하고 다시 연결</button></div>`);
  $('#cSave').onclick = () => {
    Object.assign(cfg, { name: $('#cName').value.trim(), computer: $('#cComp').value.trim(), relay: $('#cRelay').value.trim(), key: $('#cKey').value, aiCmd: $('#cAi').value.trim() || 'claude -p', theme: $('#cTheme').value, incoming: $('#cIncoming').value });
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
// ───────── 로그인 대화상자 ─────────
function loginDialog(msg) {
  modal(`<h3>회사 구글 계정으로 로그인</h3>
    <p>${esc(msg || '아이센스투게더는 회사 구글 계정으로 들어옵니다.')}</p>
    ${A.google && A.google.domain ? `<p class="muted small">회사 계정(@${esc(A.google.domain)})만 들어올 수 있습니다.</p>` : ''}
    <p class="muted small" id="loginMsg"></p>
    <div class="acts"><button class="btn" data-close>나중에</button><button class="btn primary" id="loginBtn">회사 구글 계정으로 로그인</button></div>`);
  $('#loginBtn').onclick = async () => {
    const b = $('#loginBtn'); b.disabled = true; $('#loginMsg').textContent = '브라우저에서 로그인 창이 열립니다. 로그인을 마치면 자동으로 돌아옵니다…';
    try {
      const r = await TAURI.core.invoke('google_sign_in', { clientId: A.google.clientId, clientSecret: A.google.clientSecret, domain: A.google.domain });
      Tok.set({ idToken: r.idToken, refreshToken: r.refreshToken, expiresAt: r.expiresAt, email: r.email, name: r.name });
      closeModal(); connect();
    } catch (e) { b.disabled = false; $('#loginMsg').textContent = '로그인하지 못했습니다: ' + e; }
  };
}
function browserNotice() {
  modal(`<h3>회사 계정 로그인은 데스크톱 앱에서 됩니다</h3>
    <p>이 서버는 회사 구글 계정으로만 들어올 수 있습니다. 인터넷 브라우저에서는 로그인 창을 열 수 없으니, 아이센스투게더 데스크톱 앱을 설치해 쓰세요.</p>
    <p class="muted small">지금 보이는 화면은 시연 방식입니다(실제 팀 자료가 아닙니다).</p>
    <div class="acts"><button class="btn primary" data-close>확인</button></div>`);
}
function blockedDialog(msg) {
  modal(`<h3>접속이 차단되었습니다</h3><p>${esc(msg || '이 계정은 들어올 수 없습니다.')}</p><p class="muted small">관리자에게 문의하세요. 다시 연결하지 않습니다.</p>
    <div class="acts"><button class="btn primary" data-close>확인</button></div>`);
}
function logout() {
  Tok.clear(); S.stop = true; S.gen++;
  if (S.ws) { try { S.ws.onclose = null; S.ws.close(); } catch {} S.ws = null; }
  S.live = false; setAdmin(false, ''); A.needLogin = true; A.audit = null;
  startDemo(); setConn('로그아웃했습니다');
  if (TAURI) loginDialog('로그아웃했습니다. 다시 들어오려면 로그인하세요.');
}

// ── 관리 탭(관리자만) ──
const opSummary = op => {
  if (!op || typeof op !== 'object') return String(op ?? '');
  const { op: name, ...rest } = op; const keys = Object.keys(rest).filter(k => !['token', 'key', 'content', 'body'].includes(k));
  const detail = keys.map(k => `${k}=${typeof rest[k] === 'object' ? JSON.stringify(rest[k]) : rest[k]}`).join(' ');
  return (name || '') + (detail ? ' ' + (detail.length > 90 ? detail.slice(0, 89) + '…' : detail) : '');
};
const fmtAt = at => { const d = new Date(typeof at === 'number' && at < 1e11 ? at * 1000 : at); return isNaN(d) ? String(at ?? '') : `${d.getMonth() + 1}/${d.getDate()} ${hhmm(d.getTime())}`; };
async function loadAudit() {
  if (A.mode !== 'google') { A.auditState = 'error'; A.auditMsg = '감사 기록은 회사 계정 로그인 방식에서만 볼 수 있습니다.'; if (ui.tab === 'admin') renderAdmin(); return; }
  A.auditState = 'loading'; if (ui.tab === 'admin') renderAdmin();
  try {
    const tk = await ensureToken(); if (!tk) throw new Error('로그인이 만료되었습니다. 다시 로그인하세요.');
    const r = await fetch(httpBase(cfg.relay) + '/admin/audit?limit=100', { headers: { Authorization: 'Bearer ' + tk.idToken } });
    const j = await r.json(); if (!r.ok) throw new Error(j.error || r.status);
    A.audit = j.audit || []; A.auditState = 'ok';
  } catch (e) { A.auditState = 'error'; A.auditMsg = '불러오지 못했습니다: ' + (e.message || e); }
  if (ui.tab === 'admin') renderAdmin();
}
function renderAdmin() {
  const pane = $('#pane'); if (!A.admin || !st()) { pane.innerHTML = '<p class="pad muted">관리자만 볼 수 있습니다.</p>'; return; }
  const blocked = st().blocked || [];
  const members = st().members || [];
  const row = m => { const em = (m.email || '').toLowerCase(); const isMe = m.id === S.me; const bl = em && blocked.includes(em);
    return `<tr style="border-top:1px solid var(--line)"><td style="padding:6px 0">${esc(m.name)}</td><td>${em ? esc(em) : '<span class="muted">—</span>'}</td><td><span class="dot ${m.online ? 'on' : 'off'}" style="display:inline-block"></span> ${m.online ? '접속 중' : '접속 안 함'}</td>
      <td style="text-align:right">${!em || isMe ? '' : bl ? `<button class="btn sm" data-a="unblock" data-email="${esc(em)}">차단 풀기</button>` : `<button class="btn sm" data-a="block" data-email="${esc(em)}">차단</button>`}</td></tr>`; };
  const nameById = id => (members.find(x => x.id === id) || {}).name || id;
  pane.innerHTML = `<div class="grid">
    <div class="card" style="grid-column:1/-1"><h4>👥 회원 ${members.length}명</h4>
      <table style="width:100%;border-collapse:collapse;font-size:13px"><tr class="muted small"><td>이름</td><td>이메일</td><td>접속</td><td></td></tr>${members.map(row).join('') || '<tr><td class="muted">없음</td></tr>'}</table></div>
    <div class="card" style="grid-column:1/-1"><h4>⛔ 차단 목록 ${blocked.length}명</h4>
      ${blocked.map(e => `<div class="coachitem">${esc(e)} <button class="btn sm" data-a="unblock" data-email="${esc(e)}">차단 풀기</button></div>`).join('') || '<p class="muted small">차단한 계정이 없습니다.</p>'}
      <div class="row" style="display:flex;gap:6px;margin-top:8px"><input id="blockEmail" placeholder="차단할 이메일" style="flex:1;border:1px solid var(--line);border-radius:8px;padding:5px 8px;background:var(--bg)"><button class="btn sm" data-a="blocknew">차단</button></div></div>
    <div class="card" style="grid-column:1/-1"><h4>📜 최근 감사 기록 <button class="btn sm" data-a="audit" style="margin-left:8px">새로 고침</button></h4>
      ${A.auditState === 'loading' ? '<p class="muted small">불러오는 중…</p>' : A.auditState === 'error' ? `<p class="small" style="color:var(--red)">${esc(A.auditMsg)}</p>` :
        A.audit ? `<div style="max-height:360px;overflow:auto"><table style="width:100%;border-collapse:collapse;font-size:12px"><tr class="muted small"><td>번호</td><td>시각</td><td>누가</td><td>동작</td></tr>${A.audit.map(a => `<tr style="border-top:1px solid var(--line)"><td style="padding:4px 6px 4px 0">${esc(a.seq)}</td><td style="white-space:nowrap;padding-right:8px">${esc(fmtAt(a.at))}</td><td style="padding-right:8px">${esc(nameById(a.who))}</td><td style="word-break:break-all">${esc(opSummary(a.op))}</td></tr>`).join('') || '<tr><td class="muted">기록 없음</td></tr>'}</table></div>` : '<p class="muted small">「새로 고침」을 누르면 불러옵니다.</p>'}</div>
  </div>`;
}
document.addEventListener('click', e => {
  const t = e.target.closest('[data-a]'); if (!t) return; const a = t.dataset.a;
  if (a === 'logout') logout();
  else if (a === 'login') loginDialog();
  else if (a === 'audit') loadAudit();
  else if (a === 'block' || a === 'unblock') send({ op: a === 'block' ? 'blockUser' : 'unblockUser', email: t.dataset.email });
  else if (a === 'blocknew') { const v = ($('#blockEmail').value || '').trim().toLowerCase(); if (v) send({ op: 'blockUser', email: v }); }
});

// ═════════ 배치 설정 (layout.json, 설계서 4장) ═════════
const BASE_TABS = [['map', '연결 지도'], ['board', '협업 대시보드'], ['chat', '메신저'], ['wiki', '지식위키'], ['agent', 'AI 본부장']];
const LAYOUT_DEFAULT = { channelListSide: 'left', tabOrder: BASE_TABS.map(t => t[0]), hiddenTabs: [], accent: '#FF7A45', fontScale: 1, sideWidth: 260 };
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
// 모르는 칸은 버리고, 범위 밖 값은 가장 가까운 허용값으로 맞춘다
function normLayout(raw) {
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const L = JSON.parse(JSON.stringify(LAYOUT_DEFAULT));
  if (o.channelListSide === 'left' || o.channelListSide === 'right') L.channelListSide = o.channelListSide;
  const okTab = x => typeof x === 'string' && x.length > 0 && x.length <= 120;
  if (Array.isArray(o.tabOrder)) L.tabOrder = [...new Set(o.tabOrder.filter(okTab))];
  if (Array.isArray(o.hiddenTabs)) L.hiddenTabs = [...new Set(o.hiddenTabs.filter(okTab))];
  if (typeof o.accent === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(o.accent.trim())) L.accent = o.accent.trim().toUpperCase();
  const num = v => typeof v === 'number' ? v : (typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN);
  if (isFinite(num(o.fontScale))) L.fontScale = Math.round(clamp(num(o.fontScale), 0.85, 1.3) * 100) / 100;
  if (isFinite(num(o.sideWidth))) L.sideWidth = Math.round(clamp(num(o.sideWidth), 200, 360));
  return L;
}
let LAY = normLayout(null);
function applyLayout(raw, persist = true) {
  LAY = normLayout(raw);
  if (persist) LS.set('layout', LAY);
  const r = document.documentElement.style;
  r.setProperty('--accent', LAY.accent);
  if (LAY.accent === LAYOUT_DEFAULT.accent) r.removeProperty('--accent-soft');
  else r.setProperty('--accent-soft', `color-mix(in srgb, ${LAY.accent} 18%, var(--paper))`);
  r.setProperty('--fs', String(LAY.fontScale));
  r.setProperty('--side-w', LAY.sideWidth + 'px');
  renderTabs();
  if (st()) renderRight();
  return LAY;
}
const tabTitle = id => { const t = BASE_TABS.find(x => x[0] === id); if (t) return t[1]; const e = extTabs().find(x => x.id === id); return e ? e.title : id; };
function layoutDiff(a, b) {
  const out = [];
  if (a.channelListSide !== b.channelListSide) out.push(`메신저 채널 목록 ${b.channelListSide === 'right' ? '오른쪽' : '왼쪽'}`);
  if (JSON.stringify(a.tabOrder) !== JSON.stringify(b.tabOrder)) out.push('탭 순서');
  if (JSON.stringify(a.hiddenTabs) !== JSON.stringify(b.hiddenTabs)) out.push(b.hiddenTabs.length ? `숨긴 탭 ${b.hiddenTabs.map(tabTitle).join('·')}` : '숨긴 탭 없음');
  if (a.accent !== b.accent) out.push(`강조색 ${b.accent}`);
  if (a.fontScale !== b.fontScale) out.push(`글자 크기 ${b.fontScale}배`);
  if (a.sideWidth !== b.sideWidth) out.push(`사이드 폭 ${b.sideWidth}`);
  return out.join(', ') || '바뀐 것 없음';
}

// ── 탭 줄: 기본 탭 + 켜 둔 확장 탭, 순서·숨기기 적용 ──
function extTabs() {
  return extEnabled().flatMap(r => r.manifest.tabs.map(t => ({ id: `ext:${r.manifest.id}:${t.id}`, title: t.title, ext: r.manifest.id, name: r.manifest.name })));
}
function tabList() {
  const all = BASE_TABS.map(([id, title]) => ({ id, title })).concat(extTabs());
  const byId = Object.fromEntries(all.map(t => [t.id, t]));
  const ordered = LAY.tabOrder.filter(id => byId[id]).map(id => byId[id]).concat(all.filter(t => !LAY.tabOrder.includes(t.id)));
  return ordered.filter(t => !LAY.hiddenTabs.includes(t.id));
}
function renderTabs() {
  const nav = $('#tabs'); if (!nav) return;
  nav.innerHTML = tabList().map(t => `<button data-tab="${esc(t.id)}" class="${t.id === ui.tab ? 'on' : ''}${t.ext ? ' ext' : ''}"${t.ext ? ` title="확장 「${esc(t.name)}」"` : ''}>${esc(t.title)}${t.id === 'chat' ? ' <i id="unread"></i>' : ''}</button>`).join('')
    + `<button data-tab="admin" id="tabAdmin" class="${A.admin ? '' : 'hidden'}${ui.tab === 'admin' ? ' on' : ''}">관리</button>`;
  if (st()) renderUnread();
}

// ═════════ 확장 (설계서 5~7장) ═════════
const PERM_DESC = {
  'read:project': '프로젝트 이름·목표·지침 보기',
  'read:sessions': '세션 목록과 상태 보기',
  'read:plan': '계획(할 일) 보기',
  'read:artifacts': '산출물 목록·버전 보기(내용 제외)',
  'read:messages': '메신저 글 보기',
  'read:wiki': '지식위키 보기',
  'read:members': '팀원 이름·컴퓨터·접속 여부 보기(이메일 제외)',
  'op:post': '메신저에 글 쓰기',
  'op:plan': '계획(할 일) 더하기·고치기',
  'op:wiki': '지식위키 쓰기',
  'op:board': '협업 대시보드 만들기·고치기',
};
const OP_PERM = { post: 'op:post', plan: 'op:plan', wiki: 'op:wiki', board: 'op:board' };
const EXT_MAX_FILE = 200 * 1024, EXT_MAX_ALL = 1024 * 1024, EXT_HIST = 5, EXT_STORE_MAX = 256 * 1024;
const EXT_CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:";
const FIXER = 'app-fixer';
const byteLen = s => new TextEncoder().encode(String(s)).length;
const knownPerms = list => (list || []).filter(p => PERM_DESC[p]);
function lsTry(k, v) { try { localStorage.setItem('itda.' + k, JSON.stringify(v)); return true; } catch { return false; } }
const inst = () => LS.get('ext.installed', {}) || {};
const pend = () => LS.get('ext.pending', {}) || {};
const hist = () => LS.get('ext.hist', {}) || {};
const extEnabled = () => Object.values(inst()).filter(r => r.enabled && !X.blocked[r.manifest.id]);
const X = { blocked: {} };
let FR = [];   // 떠 있는 확장 창들: { iframe, extId, target, hash, loaded, last, lastAt, timer, ops }

// manifest 와 파일 묶음을 검사해 깨끗한 모양으로 돌려준다(틀리면 오류)
function cleanExt(m, files) {
  if (!m || typeof m !== 'object') throw new Error('manifest.json 이 비었거나 모양이 틀립니다');
  const id = String(m.id || '');
  if (!/^[a-z0-9-]{3,40}$/.test(id)) throw new Error(`확장 아이디 「${id}」가 규칙(영문 소문자·숫자·하이픈 3~40자)에 맞지 않습니다`);
  const F = {}; let total = 0;
  Object.entries(files && typeof files === 'object' ? files : {}).forEach(([k, v]) => {
    if (typeof v !== 'string' || k.length > 120) return;
    const n = byteLen(v); if (n > EXT_MAX_FILE) throw new Error(`「${id}」의 파일 「${k}」가 200KB를 넘습니다`);
    total += n; F[k] = v;
  });
  if (total > EXT_MAX_ALL) throw new Error(`「${id}」 확장이 1MB를 넘습니다`);
  const str = (v, n) => String(v ?? '').slice(0, n);
  const okPart = v => typeof v === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(v);
  const tabs = (Array.isArray(m.tabs) ? m.tabs : []).filter(t => t && okPart(t.id) && typeof t.file === 'string' && F[t.file] != null).slice(0, 8)
    .map(t => ({ id: t.id, title: str(t.title || m.name || id, 30), file: t.file }));
  const bands = (Array.isArray(m.bands) ? m.bands : []).filter(b => b && okPart(b.id) && typeof b.file === 'string' && F[b.file] != null).slice(0, 4)
    .map(b => ({ id: b.id, file: b.file, height: Math.round(clamp(Number(b.height) || 36, 24, 120)) }));
  if (!tabs.length && !bands.length) throw new Error(`「${id}」 확장에 탭이나 띠가 없습니다(파일 이름을 확인하세요)`);
  const permissions = [...new Set((Array.isArray(m.permissions) ? m.permissions : []).map(String))].slice(0, 30);
  return { manifest: { id, name: str(m.name || id, 40), version: str(m.version || '1.0.0', 20), description: str(m.description, 300), permissions, tabs, bands }, files: F };
}
function extHash(c) {
  const j = JSON.stringify([c.manifest, Object.keys(c.files).sort().map(k => [k, c.files[k]])]);
  let h = 2166136261; for (let i = 0; i < j.length; i++) { h ^= j.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36) + j.length.toString(36);
}
const toOffer = (c, source) => Object.assign({ manifest: c.manifest, files: c.files }, { hash: extHash(c), source });
function saveInst(all) { if (!lsTry('ext.installed', all)) toast('저장 공간이 모자라 확장을 저장하지 못했습니다'); }
function pushHist(rec) {
  const H = hist(); const list = (H[rec.manifest.id] || []).filter(e => e.hash !== rec.hash);
  list.push({ manifest: rec.manifest, files: rec.files, hash: rec.hash, at: now() });
  H[rec.manifest.id] = list.slice(-EXT_HIST);
  // 저장 공간이 모자라면 오래된 판부터 버린다
  while (!lsTry('ext.hist', H)) { const k = Object.keys(H).find(k => H[k].length) ; if (!k) break; H[k].shift(); }
}
// 켜기: 이전 판은 되돌리기용으로 보관
function extInstall(offer, granted) {
  const all = inst(); const id = offer.manifest.id; const cur = all[id];
  if (cur && cur.hash !== offer.hash) pushHist(cur);
  all[id] = { manifest: offer.manifest, files: offer.files, hash: offer.hash, source: offer.source || 'local', enabled: true, granted: knownPerms(granted), at: now() };
  saveInst(all);
  const P = pend(); if (P[id] && P[id].hash === offer.hash) { delete P[id]; LS.set('ext.pending', P); }
  delete X.blocked[id];
  extRefresh();
  return all[id];
}
function extRemove(id) {
  const all = inst(); delete all[id]; saveInst(all);
  const H = hist(); delete H[id]; LS.set('ext.hist', H);
  try { localStorage.removeItem('itda.ext.store.' + id); } catch {}
  extRefresh();
}
function extRollback(id, hash) {
  const H = hist(); const e = (H[id] || []).find(x => x.hash === hash); const rec = inst()[id];
  if (!e || !rec) return;
  H[id] = H[id].filter(x => x !== e); LS.set('ext.hist', H);
  const offer = { manifest: e.manifest, files: e.files, hash: e.hash, source: rec.source };
  const more = knownPerms(e.manifest.permissions).filter(p => !rec.granted.includes(p));
  if (more.length) permDialog(offer);
  else { extInstall(offer, rec.granted.filter(p => e.manifest.permissions.includes(p))); toast(`「${e.manifest.name}」 v${e.manifest.version} 으로 되돌렸습니다`); }
}
function extRefresh() {
  renderTabs(); renderBands();
  if (st()) { renderRight(); renderFixerNode(); if (ui.fixer) renderCenter(true); }
}

// ── 확장 창 만들기: 콘텐츠 보안 정책 + 도우미 itda 를 맨 앞에 넣는다 ──
// 이 함수는 글자로 바뀌어 격리 창 안에 들어간다(바깥 변수를 쓰면 안 됨)
function itdaHelper() {
  var P = window.parent, ctx = null, last = null, seq = 0, wait = {}, readyF = [], stateF = [];
  function call(f, v) { try { f(v); } catch (e) { setTimeout(function () { throw e; }); } }
  function post(m) { P.postMessage(m, '*'); }
  function req(m) { return new Promise(function (res) { var id = 'q' + (++seq); wait[id] = res; m.reqId = id; post(m); }); }
  window.addEventListener('message', function (e) {
    if (e.source !== P) return;
    var m = e.data; if (!m || typeof m !== 'object') return;
    if (m.type === 'init') { ctx = { extId: m.extId, target: m.target, theme: m.theme }; readyF.forEach(function (f) { call(f, ctx); }); }
    else if (m.type === 'state') { last = m.state; stateF.forEach(function (f) { call(f, last); }); }
    else if ((m.type === 'opResult' || m.type === 'storeResult') && wait[m.reqId]) { var w = wait[m.reqId]; delete wait[m.reqId]; w(m); }
  });
  var itda = {
    ready: function (f) { if (typeof f === 'function') { readyF.push(f); if (ctx) call(f, ctx); } },
    onState: function (f) { if (typeof f === 'function') { stateF.push(f); if (last) call(f, last); } },
    op: function (o) { return req({ type: 'op', op: o }).then(function (m) { return m.ok ? { ok: true } : { ok: false, error: m.error || '실패했습니다' }; }); },
    store: Object.freeze({
      get: function (k) { return req({ type: 'store.get', key: String(k) }).then(function (m) { return m.value === undefined ? null : m.value; }); },
      set: function (k, v) { return req({ type: 'store.set', key: String(k), value: v }).then(function (m) { if (m.error) throw new Error(m.error); return m.value; }); }
    }),
    toast: function (t) { post({ type: 'toast', text: String(t) }); },
    resize: function (h) { post({ type: 'resize', height: Number(h) || 0 }); }
  };
  window.itda = Object.freeze(itda);
}
const HELPER_SRC = '(' + itdaHelper.toString() + ')();';
function buildSrcdoc(html) {
  const body = String(html || '').replace(/^﻿?\s*<!doctype[^>]*>/i, '');
  return `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${EXT_CSP}"><script>${HELPER_SRC}<\/script>` + body;
}
const isDark = () => cfg.theme === 'dark' || (cfg.theme !== 'light' && !!(window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches));
function makeFrame(rec, target, html) {
  FR = FR.filter(f => f.iframe.isConnected);
  const f = document.createElement('iframe');
  f.setAttribute('sandbox', 'allow-scripts');
  f.setAttribute('title', `확장 「${rec.manifest.name}」`);
  f.dataset.ext = rec.manifest.id; f.dataset.target = target;
  const fr = { iframe: f, extId: rec.manifest.id, target, hash: rec.hash, loaded: false, last: '', lastAt: 0, timer: null, ops: [] };
  f.addEventListener('load', () => {
    if (fr.loaded) {
      // 두 번째로 불러졌다 = 확장이 스스로 다른 곳으로 옮겨 감. 막고 닫는다.
      X.blocked[fr.extId] = true; f.remove(); FR = FR.filter(x => x !== fr);
      toast(`「${rec.manifest.name}」 확장이 다른 곳으로 이동하려 해 멈췄습니다`); extRefresh(); return;
    }
    fr.loaded = true;
    try { f.contentWindow.postMessage({ type: 'init', extId: fr.extId, target, theme: { accent: LAY.accent, dark: isDark() } }, '*'); } catch {}
    extPush(fr);
  });
  f.srcdoc = buildSrcdoc(html);
  FR.push(fr);
  return f;
}
function renderExtTab(tabId) {
  const pane = $('#pane');
  const [, extId, tid] = tabId.split(':');
  const rec = inst()[extId]; const t = rec && rec.enabled && rec.manifest.tabs.find(x => x.id === tid);
  if (!t || X.blocked[extId]) { pane.dataset.ext = ''; pane.innerHTML = '<p class="pad muted">이 확장은 꺼져 있습니다.</p>'; return; }
  const key = tabId + '|' + rec.hash;
  const cur = $('iframe', pane);
  if (pane.dataset.ext === key && cur && cur.isConnected) return;   // 이미 떠 있으면 그대로(상태 유지)
  pane.innerHTML = ''; pane.dataset.ext = key;
  const f = makeFrame(rec, 'tab:' + tid, rec.files[t.file]); f.className = 'extframe';
  pane.appendChild(f);
}
function renderBands() {
  const box = $('#bands'); if (!box) return;
  const list = extEnabled().flatMap(r => r.manifest.bands.map(b => ({ r, b })));
  const key = list.map(x => `${x.r.manifest.id}:${x.b.id}:${x.r.hash}`).join('|');
  if (box.dataset.key === key) return;
  box.dataset.key = key; box.innerHTML = '';
  list.forEach(({ r, b }) => { const f = makeFrame(r, 'band:' + b.id, r.files[b.file]); f.style.height = b.height + 'px'; box.appendChild(f); });
}

// ── 확장에 주는 자료: 허락받은 것만, 정해진 칸만 옮겨 담는다(이메일·차단 목록·감사 기록은 없음) ──
function extState(granted) {
  const g = new Set(granted || []); const p = st() && project(); const me = st() ? member(S.me) : { name: cfg.name };
  const out = { me: { id: S.me, name: me.name || '' } };
  if (!p) return out;
  out.project = { id: p.id };
  if (g.has('read:project')) Object.assign(out.project, { name: p.name, kind: p.kind, goal: p.goal || '', guide: p.guide || '' });
  if (g.has('read:sessions')) out.sessions = sessionsOf(p.id).map(s => ({ id: s.id, ownerId: s.ownerId, title: s.title, status: s.status, isMain: !!s.isMain, isTeamMain: !!s.isTeamMain }));
  if (g.has('read:plan')) out.plan = st().plan.filter(x => x.projectId === p.id).map(x => ({ id: x.id, title: x.title, ownerId: x.ownerId || '', done: !!x.done, when: x.when || '', artifactId: x.artifactId || null }));
  if (g.has('read:artifacts')) out.artifacts = artifactsOf(p.id).map(a => ({ id: a.id, name: a.name, kind: a.kind, ownerId: a.ownerId, versions: a.versions.map(v => ({ v: v.v, ts: v.ts, by: v.by, note: v.note || '' })) }));
  if (g.has('read:messages')) {
    const chs = new Set(st().channels.filter(c => c.projectId === p.id && (c.kind === 'channel' || (c.members || []).includes(S.me))).map(c => c.id));
    out.messages = st().messages.filter(m => chs.has(m.channelId)).slice(-300).map(m => ({ id: m.id, channelId: m.channelId, from: m.from, text: m.text, ts: m.ts }));
  }
  if (g.has('read:wiki')) out.wiki = st().wiki.filter(w => w.projectId === p.id).map(w => ({ id: w.id, title: w.title, body: w.body, scope: w.scope }));
  if (g.has('read:members')) out.members = p.members.map(id => member(id)).map(m => ({ id: m.id, name: m.name, computer: m.computer || '', online: !!m.online }));
  return out;
}
// 바뀐 자료를 보낸다. 창마다 초당 최대 2번.
function extPush(fr) {
  if (!fr.loaded || !fr.iframe.isConnected || !st()) return;
  const rec = inst()[fr.extId]; if (!rec || !rec.enabled) return;
  const wait = 500 - (now() - fr.lastAt);
  if (wait > 0) { if (!fr.timer) fr.timer = setTimeout(() => { fr.timer = null; extPush(fr); }, wait); return; }
  const data = extState(rec.granted); const j = JSON.stringify(data);
  if (j === fr.last) return;
  fr.last = j; fr.lastAt = now();
  try { fr.iframe.contentWindow.postMessage({ type: 'state', state: data }, '*'); } catch {}
}
function extPushAll() { FR = FR.filter(f => f.iframe.isConnected); FR.forEach(extPush); }

// ── 확장이 보낸 동작: 허락 목록 확인 → 모양을 다시 만들어 기존 send() 로 ──
function extOp(rec, o, fr) {
  const deny = { ok: false, error: '허락되지 않은 동작' };
  const err = m => ({ ok: false, error: m });
  if (!o || typeof o !== 'object' || typeof o.op !== 'string') return deny;
  const need = OP_PERM[o.op];
  if (!need || !rec.granted.includes(need)) return deny;
  const t = now(); fr.ops = fr.ops.filter(x => t - x < 10000);
  if (fr.ops.length >= 20) return err('너무 자주 보냅니다. 잠시 뒤 다시 하세요');
  fr.ops.push(t);
  const p = project(); if (!p) return err('열린 프로젝트가 없습니다');
  const str = (v, n) => String(v ?? '').slice(0, n);
  let op;
  if (o.op === 'post') {
    const chs = st().channels.filter(c => c.projectId === p.id && (c.kind === 'channel' || (c.members || []).includes(S.me)));
    const ch = o.channelId ? chs.find(c => c.id === o.channelId) : (chs.find(c => c.name === '전체') || chs[0]);
    if (!ch) return err('이 프로젝트에 없는 채널입니다');
    const text = str(o.text, 4000).trim(); if (!text) return err('글이 비었습니다');
    op = { op: 'post', channelId: ch.id, text, artifactId: artifactsOf(p.id).some(a => a.id === o.artifactId) ? o.artifactId : null, replyTo: st().messages.some(m => m.id === o.replyTo && m.channelId === ch.id) ? o.replyTo : null };
  } else if (o.op === 'plan') {
    const it = o.id != null ? st().plan.find(x => x.id === o.id && x.projectId === p.id) : null;
    if (o.id != null && !it) return err('이 프로젝트에 없는 계획 항목입니다');
    if (!it && !str(o.title, 200).trim()) return err('할 일 제목이 비었습니다');
    op = { op: 'plan', projectId: p.id, id: it ? it.id : null };
    if (o.title != null) op.title = str(o.title, 200).trim();
    if (o.ownerId != null) { if (o.ownerId !== '' && !p.members.includes(o.ownerId)) return err('이 프로젝트에 없는 사람입니다'); op.ownerId = o.ownerId; }
    if (o.done != null) op.done = !!o.done;
    if (o.when != null) op.when = str(o.when, 20);
    if (o.artifactId != null) { if (!artifactsOf(p.id).some(a => a.id === o.artifactId)) return err('이 프로젝트에 없는 산출물입니다'); op.artifactId = o.artifactId; }
  } else if (o.op === 'wiki') {
    const w = o.id != null ? st().wiki.find(x => x.id === o.id && x.projectId === p.id) : null;
    if (o.id != null && !w) return err('이 프로젝트에 없는 위키 문서입니다');
    op = { op: 'wiki', projectId: p.id, id: w ? w.id : null, title: str(o.title ?? (w && w.title), 100).trim() || '제목 없음', body: str(o.body ?? (w && w.body), 20000), scope: o.scope === 'common' ? 'common' : 'team' };
  } else if (o.op === 'board') {
    const b = o.id != null ? st().boards.find(x => x.id === o.id && x.projectId === p.id) : null;
    if (o.id != null && !b) return err('이 프로젝트에 없는 대시보드입니다');
    const widgets = (Array.isArray(o.widgets) ? o.widgets : []).filter(k => WIDGETS[k]);
    if (!widgets.length) return err('보여 줄 조각이 없습니다');
    op = { op: 'board', projectId: p.id, id: b ? b.id : null, name: str(o.name, 40).trim() || '이름 없는 판', widgets };
  }
  return send(op);
}
function extStore(id) { return LS.get('ext.store.' + id, {}) || {}; }
window.addEventListener('message', e => {
  // 내가 띄운 확장 창이 보낸 것만 받는다(다른 창의 메시지는 무시)
  const fr = FR.find(f => f.iframe.isConnected && f.iframe.contentWindow === e.source);
  if (!fr) return;
  const m = e.data; if (!m || typeof m !== 'object' || typeof m.type !== 'string') return;
  const rec = inst()[fr.extId]; if (!rec || !rec.enabled || X.blocked[fr.extId]) return;
  const reply = o => { try { e.source.postMessage(o, '*'); } catch {} };
  const reqId = typeof m.reqId === 'string' ? m.reqId.slice(0, 40) : '';
  switch (m.type) {
    case 'op': { const r = extOp(rec, m.op, fr) || { ok: true }; reply(Object.assign({ type: 'opResult', reqId, ok: !!r.ok }, r.ok ? {} : { error: r.error || '실패했습니다' })); break; }
    case 'store.get': { const v = extStore(fr.extId)[String(m.key).slice(0, 100)]; reply({ type: 'storeResult', reqId, value: v === undefined ? null : v }); break; }
    case 'store.set': {
      const all = extStore(fr.extId); const k = String(m.key).slice(0, 100);
      let j; try { j = JSON.stringify(m.value === undefined ? null : m.value); } catch { reply({ type: 'storeResult', reqId, value: false, error: '저장할 수 없는 값입니다' }); break; }
      all[k] = JSON.parse(j);
      if (byteLen(JSON.stringify(all)) > EXT_STORE_MAX || !lsTry('ext.store.' + fr.extId, all)) { reply({ type: 'storeResult', reqId, value: false, error: '확장 저장소가 가득 찼습니다' }); break; }
      reply({ type: 'storeResult', reqId, value: true }); break;
    }
    case 'toast': { const t = String(m.text ?? '').slice(0, 200); if (t) toast(`${rec.manifest.name}: ${t}`); break; }
    case 'resize': if (fr.target.startsWith('band:')) fr.iframe.style.height = Math.round(clamp(Number(m.height) || 0, 24, 120)) + 'px'; break;
  }
});

// ── 허락 목록 그리기 ──
function permList(perms, prev) {
  const list = perms || [];
  if (!list.length) return '<ul class="perm"><li>허락이 필요 없습니다(화면만 그림)</li></ul>';
  return `<ul class="perm">${list.map(p => PERM_DESC[p]
    ? `<li${prev && !prev.includes(p) ? ' class="new"' : ''}>${esc(PERM_DESC[p])} <span class="muted small">${esc(p)}</span>${prev && !prev.includes(p) ? ' · 새로 요청' : ''}</li>`
    : `<li class="bad">알 수 없는 허락 「${esc(p)}」 — 주지 않습니다</li>`).join('')}</ul>`;
}
const extWhat = m => [m.tabs.length ? `탭 ${m.tabs.map(t => `「${esc(t.title)}」`).join(' ')}` : '', m.bands.length ? `세션 창 위 띠 ${m.bands.length}개` : ''].filter(Boolean).join(' · ');
const SRC_NAME = { fixer: '앱 고치기', team: '팀', local: '내 컴퓨터' };
function permDialog(offer) {
  const rec = inst()[offer.manifest.id]; const m = offer.manifest;
  modal(`<h3>🧩 「${esc(m.name)}」 v${esc(m.version)} 켜기</h3><p>${esc(m.description || '')}</p><p class="small">${extWhat(m)}</p>
    <label>허락 목록 — 「켜기」를 누르면 아래를 허락한 것으로 봅니다</label>${permList(m.permissions, rec ? rec.granted : null)}
    <p class="muted small">확장은 격리된 작은 창에서만 돌고, 외부 서버에 접속할 수 없습니다. 회원 이메일은 주지 않습니다.</p>
    <div class="acts"><button class="btn" data-close>나중에</button><button class="btn primary" id="permOk">켜기</button></div>`);
  $('#permOk').onclick = () => { closeModal(); extOn(offer); };
}
function extOn(offer) {
  const r = extInstall(offer, offer.manifest.permissions);
  const t = r.manifest.tabs[0];
  if (t) { ui.tab = `ext:${r.manifest.id}:${t.id}`; if (st()) renderRight(); }
  toast(`「${r.manifest.name}」 확장을 켰습니다`);
  if (ui.fixer || offer.source === 'fixer') fxLog('sys', `「${r.manifest.name}」 v${r.manifest.version} 확장을 켰습니다${t ? ` — 오른쪽 「${t.title}」 탭` : ''}${r.manifest.bands.length ? ' · 세션 창 위 띠' : ''}`);
}

// ── 확장 관리 대화상자 ──
function extDialog(confirmDel) {
  const I = inst(), P = pend(), H = hist();
  const team = (st() && st().extensions) || [];
  const canAdmin = A.admin || !S.live;
  const mine = Object.values(I).map(r => {
    const m = r.manifest; const h = (H[m.id] || []).slice().reverse();
    return `<div class="card" style="margin:8px 0"><div><b>${esc(m.name)}</b> <span class="muted small">v${esc(m.version)} · ${esc(SRC_NAME[r.source] || r.source)} · ${esc(m.id)}</span> <span class="tag ${r.enabled ? 'info' : 'check'}">${r.enabled ? (X.blocked[m.id] ? '멈춤' : '켜짐') : '꺼짐'}</span></div>
      <div class="small">${esc(m.description || '')}</div><div class="small muted">${extWhat(m)}</div>
      <details><summary class="small">허락 목록 ${m.permissions.length}개</summary>${permList(m.permissions)}</details>
      <div class="reqacts" style="flex-wrap:wrap;align-items:center">
        <button class="btn sm ${r.enabled ? '' : 'primary'}" data-exta="toggle" data-id="${esc(m.id)}">${r.enabled ? '끄기' : '켜기'}</button>
        ${h.length ? `<select class="btn sm" data-histsel="${esc(m.id)}">${h.map(e => `<option value="${esc(e.hash)}">v${esc(e.manifest.version)} · ${esc(fmtAt(e.at))}</option>`).join('')}</select><button class="btn sm" data-exta="rollback" data-id="${esc(m.id)}">이 판으로 되돌리기</button>` : '<span class="muted small">이전 판 없음</span>'}
        <button class="btn sm" data-exta="share" data-id="${esc(m.id)}">팀에 공유</button>
        ${confirmDel === m.id ? `<b class="small" style="color:var(--red)">정말 지울까요?</b><button class="btn sm" data-exta="delyes" data-id="${esc(m.id)}">지우기</button><button class="btn sm" data-exta="open">취소</button>` : `<button class="btn sm" data-exta="del" data-id="${esc(m.id)}">지우기</button>`}
      </div></div>`;
  }).join('') || '<p class="muted small">켜 둔 확장이 없습니다. 「🛠 앱 고치기」에 「오늘 할 일 탭 만들어 줘」처럼 말해 보세요.</p>';
  const waiting = Object.values(P).map(o => `<div class="card" style="margin:8px 0"><b>${esc(o.manifest.name)}</b> <span class="muted small">v${esc(o.manifest.version)} · ${esc(SRC_NAME[o.source] || o.source)}</span><div class="small muted">${extWhat(o.manifest)}</div>
      <div class="reqacts"><button class="btn sm primary" data-exta="penon" data-id="${esc(o.manifest.id)}">허락 목록 보고 켜기</button><button class="btn sm" data-exta="pendrop" data-id="${esc(o.manifest.id)}">버리기</button></div></div>`).join('');
  const teamRows = team.map(x => {
    let on = false; try { const c = cleanExt(x, x.files); on = !!(I[x.id] && I[x.id].hash === extHash(c)); } catch {}
    const mayRemove = canAdmin || x.by === S.me;
    return `<div class="card" style="margin:8px 0"><div><b>${esc(x.name || x.id)}</b> <span class="muted small">v${esc(x.version || '')} · 올린 사람 ${esc(nameOf(x.by))}</span> <span class="tag ${x.status === '승인' ? 'info' : 'check'}">${esc(x.status || '대기')}</span></div>
      <div class="small">${esc(x.description || '')}</div>
      <div class="reqacts">${x.status === '승인' ? (on ? '<span class="muted small">켜져 있음</span>' : `<button class="btn sm primary" data-exta="teamon" data-id="${esc(x.id)}">허락 목록 보고 켜기</button>`) : '<span class="muted small">관리자 승인을 기다리는 중</span>'}
        ${canAdmin && x.status !== '승인' ? `<button class="btn sm" data-exta="approve" data-id="${esc(x.id)}">승인${S.live ? '' : ' (시연)'}</button>` : ''}
        ${mayRemove ? `<button class="btn sm" data-exta="tremove" data-id="${esc(x.id)}">팀 목록에서 지우기</button>` : ''}</div></div>`;
  }).join('') || '<p class="muted small">팀에 공유된 확장이 없습니다.</p>';
  modal(`<h3>🧩 확장 관리</h3><p class="muted small">확장은 격리된 작은 창 안에서만 돌고, 허락한 자료와 동작만 씁니다. 이전 판은 확장마다 최근 ${EXT_HIST}개를 이 컴퓨터에 보관합니다.</p>
    <label>내 확장</label>${mine}
    ${waiting ? `<label>켜기를 기다리는 확장</label>${waiting}` : ''}
    <label>팀 확장 ${S.live ? '' : '(시연)'}</label>${teamRows}
    <p class="muted small">사내 지침: 확장을 회사 밖에 공개 배포하려면 전략실 승인번호가 필요합니다(앱 안 팀 공유는 해당 없음).</p>
    <div class="acts"><button class="btn primary" data-close>닫기</button></div>`);
}
document.addEventListener('click', e => {
  const t = e.target.closest('[data-exta]'); if (!t) return;
  const a = t.dataset.exta, id = t.dataset.id;
  if (a === 'open') extDialog();
  else if (a === 'toggle') { const all = inst(); if (all[id]) { all[id].enabled = !all[id].enabled; if (all[id].enabled) delete X.blocked[id]; saveInst(all); extRefresh(); } extDialog(); }
  else if (a === 'rollback') { const sel = $(`[data-histsel="${id}"]`); if (sel) { extRollback(id, sel.value); if (!$('#permOk')) extDialog(); } }
  else if (a === 'del') extDialog(id);
  else if (a === 'delyes') { extRemove(id); toast('확장을 지웠습니다'); extDialog(); }
  else if (a === 'penon') { const o = pend()[id]; if (o) permDialog(o); }
  else if (a === 'pendrop') { const P = pend(); delete P[id]; LS.set('ext.pending', P); renderFixerNode(); if (ui.fixer) renderCenter(true); extDialog(); }
  else if (a === 'share') {
    const r = inst()[id]; if (!r) return;
    const m = r.manifest;
    const res = send({ op: 'shareExtension', ext: { id: m.id, name: m.name, version: m.version, description: m.description, permissions: m.permissions, tabs: m.tabs, bands: m.bands, files: r.files } });
    if (res && res.ok) toast(`「${m.name}」을 팀에 올렸습니다. 관리자가 승인하면 팀원이 켤 수 있습니다`);
    extDialog();
  }
  else if (a === 'teamon') {
    const x = ((st() && st().extensions) || []).find(y => y.id === id); if (!x) return;
    try { permDialog(toOffer(cleanExt(x, x.files), 'team')); } catch (er) { toast(er.message); }
  }
  else if (a === 'approve') { send({ op: 'approveExtension', id }); extDialog(); }
  else if (a === 'tremove') { send({ op: 'removeExtension', id }); extDialog(); }
});

// ═════════ 「앱 고치기」 세션 (설계서 8장) ═════════
// 내 컴퓨터 전용: 줄은 localStorage 에만 두고 중계 서버로 올리지 않는다.
const FX = { running: false, dir: '', log: LS.get('fixer.log', []) || [], lastHtml: '', cost: 0 };
function fxLog(kind, text, extra) {
  FX.log.push(Object.assign({ ts: now(), kind, text }, extra || {}));
  if (FX.log.length > 300) FX.log.splice(0, FX.log.length - 300);
  LS.set('fixer.log', FX.log);
  if (ui.fixer) renderCenter(true);
}
function renderFixerNode() {
  const n = $('#fixerNode'); if (!n) return;
  n.classList.toggle('on', !!ui.fixer);
  const waiting = Object.keys(pend()).length;
  n.innerHTML = `<span>🛠</span><span class="t">앱 고치기</span>${waiting ? `<span class="n" title="켜기를 기다리는 확장">${waiting}</span>` : ''}`;
}
function extCard(l) {
  const P = pend()[l.extId]; const rec = inst()[l.extId];
  const live = P && P.hash === l.hash;
  let acts;
  if (rec && rec.hash === l.hash) acts = '<div class="reqdone">켰습니다</div>';
  else if (live) acts = `<div class="reqacts"><button class="btn sm primary" data-fxon="${esc(l.extId)}">켜기</button>${l.status === 'later' ? '<span class="muted small">나중에로 미뤄 둠 — 확장 관리에서도 켤 수 있습니다</span>' : `<button class="btn sm" data-fxlater="${esc(l.hash)}">나중에</button>`}</div>`;
  else acts = '<div class="reqdone">이 판은 지나갔습니다(확장 관리에서 확인하세요)</div>';
  const m = live ? P.manifest : null;
  return `<div class="card fxcard"><b>🧩 ${l.update ? '새 판' : '새 확장'} 「${esc(l.name)}」 v${esc(l.version)}</b>${l.demo ? ' <span class="muted small">(시연)</span>' : ''}
    ${m ? `<div class="small">${esc(m.description || '')}</div><div class="small muted">${extWhat(m)}</div><div class="small" style="margin-top:6px"><b>허락 목록</b> — 「켜기」를 누르면 허락한 것으로 봅니다</div>${permList(m.permissions, rec ? rec.granted : null)}` : ''}${acts}</div>`;
}
function renderFixer(light) {
  const head = $('#sessHead'), log = $('#log');
  if (!light || !head.querySelector('[data-fxhead]')) {
    head.innerHTML = `<span class="avatar" style="background:var(--navy);width:30px;height:30px">🛠</span><div data-fxhead><h2>🛠 앱 고치기</h2><div class="muted small">내 컴퓨터 전용 · 중계 서버에 올리지 않음 · ${TAURI ? (FX.running ? '<span class="dot working" style="display:inline-block"></span> 클로드 연결됨' : '클로드 꺼짐') : '시연 방식'}</div></div>
      <div class="grow"></div><button class="btn sm" data-exta="open">🧩 확장 관리</button><button class="btn sm" data-fx="reset">배치 처음대로</button><button class="btn sm" data-fx="clear">기록 지우기</button>${TAURI ? `<button class="btn sm" data-fx="${FX.running ? 'stop' : 'start'}">${FX.running ? '끄기' : '켜기'}</button>` : ''}`;
  }
  log.className = 'log';
  const lines = FX.log.length ? FX.log : [{ ts: now(), kind: 'out', text: '앱을 바꾸고 싶은 점을 평소 말로 적어 주세요.\n예: 「오늘 할 일 탭 만들어 줘」 「메신저 채널 목록 오른쪽으로」 「지식위키 탭 숨겨 줘」 「강조색 파랑으로」\n새 탭·띠(확장)는 허락 목록을 보여 드리고 「켜기」를 누르셔야 동작합니다.' }];
  const html = lines.map(l => {
    if (l.kind === 'sys') return `<div class="sysline">${esc(l.text)} · ${hhmm(l.ts)}</div>`;
    if (l.kind === 'tool') { const [nm, ...rest] = String(l.text).split(' · '); return `<div class="card-tool"><b>${esc(nm)}</b>${rest.length ? ` <span class="sum">${esc(rest.join(' · '))}</span>` : ''}</div>`; }
    if (l.kind === 'denied') return `<div class="card-req denied">⚠️ ${esc(l.text)}</div>`;
    if (l.kind === 'result') return `<div class="resline">${esc(l.text)}</div>`;
    if (l.kind === 'ext') return extCard(l);
    const isIn = l.kind === 'in';
    return `<div class="bub ${isIn ? 'in' : 'out'}">${isIn ? avatar(S.me, 26) : '<span class="avatar" style="background:#1F2A44;width:26px;height:26px">AI</span>'}<div><div class="who">${esc(isIn ? nameOf(S.me) : '앱 고치기')} · ${hhmm(l.ts)}</div><div class="body" ${l.kind === 'err' ? 'style="color:var(--red)"' : ''}>${esc(l.text)}</div></div></div>`;
  }).join('');
  if (light && html === FX.lastHtml && log.dataset.fixer === '1') return;
  const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 60;
  FX.lastHtml = html; log.dataset.fixer = '1'; log.innerHTML = html;
  if (atBottom || !light) log.scrollTop = log.scrollHeight;
  $('#coachStrip').innerHTML = `<span>🛠</span><span class="txt muted">이 세션은 앱 화면만 바꿉니다. 배치 설정은 바로 적용되고, 새 탭·띠는 허락 카드에서 「켜기」를 눌러야 동작합니다.</span>`;
  $('#inputHint').innerHTML = TAURI
    ? `앱 고치기: 클로드 코드가 <code>문서/iSensTogether/앱고치기</code> 폴더의 파일만 고칩니다. ${FX.dir ? `(${esc(FX.dir)})` : ''}`
    : '앱 고치기 <b>시연</b>: 답은 흉내만 냅니다. 데스크톱 앱에서는 클로드가 직접 만듭니다.';
  $('#input').placeholder = '예: 오늘 할 일 탭 만들어 줘';
}
// 작업 폴더 내용({ layout, extensions })을 화면에 반영
function fxProcess(ws, opts = {}) {
  if (!ws || typeof ws !== 'object') return;
  const sfx = opts.demo ? ' (시연)' : '';
  if (ws.layout && typeof ws.layout === 'object') {
    const next = normLayout(ws.layout); const j = JSON.stringify(next);
    // 같은 파일 내용은 한 번만 적용한다(「배치 처음대로」를 누른 뒤 다시 덮어쓰지 않게)
    if (LS.get('layout.seen', '') !== j) {
      LS.set('layout.seen', j);
      if (JSON.stringify(LAY) !== j) {
        const d = layoutDiff(LAY, next); applyLayout(next);
        if (!opts.quiet) fxLog('sys', `배치 설정을 적용했습니다 — ${d}${sfx}`); else toast('앱 고치기: 배치 설정을 적용했습니다');
      }
    }
  }
  const seen = LS.get('ext.seen', {}) || {};
  (Array.isArray(ws.extensions) ? ws.extensions : []).forEach(x => {
    let c;
    try { c = cleanExt(x && x.manifest, x && x.files); }
    catch (e) {
      const k = 'bad:' + extHash({ manifest: (x && x.manifest) || {}, files: {} });
      if (!seen[k]) { seen[k] = 1; fxLog('err', `확장을 읽지 못했습니다: ${e.message}`); }
      return;
    }
    const o = toOffer(c, 'fixer'); const id = c.manifest.id;
    if (seen[id] === o.hash) return;
    seen[id] = o.hash;
    const rec = inst()[id]; if (rec && rec.hash === o.hash) return;
    fxOffer(o, opts.demo);
  });
  LS.set('ext.seen', seen);
}
function fxOffer(o, demo) {
  const P = pend(); P[o.manifest.id] = Object.assign({ at: now() }, o);
  if (!lsTry('ext.pending', P)) { fxLog('err', '저장 공간이 모자라 확장을 보관하지 못했습니다'); return; }
  const rec = inst()[o.manifest.id];
  fxLog('ext', '', { extId: o.manifest.id, hash: o.hash, name: o.manifest.name, version: o.manifest.version, update: !!rec, status: 'ask', demo: !!demo });
  renderFixerNode();
  if (!ui.fixer) toast(`앱 고치기: 「${o.manifest.name}」 확장이 켜기를 기다립니다`);
}
async function fxRescan(quiet) {
  if (!TAURI) return;
  try { const ws = await TAURI.core.invoke('ext_workspace'); FX.dir = (ws && ws.dir) || FX.dir; fxProcess(ws, { quiet }); }
  catch (e) { if (!quiet) fxLog('err', '앱 고치기 폴더를 읽지 못했습니다: ' + e); }
}
async function fxEnsure() {
  if (FX.running) return true;
  try {
    const ws = await TAURI.core.invoke('ext_workspace'); FX.dir = (ws && ws.dir) || '';
    fxProcess(ws);
    const args = { sessionId: FIXER }; if (FX.dir) args.cwd = FX.dir;
    await TAURI.core.invoke('claude_start', args);
    FX.running = true; if (ui.fixer) renderFixer(false);
    return true;
  } catch (e) { fxLog('err', '앱 고치기 세션을 켜지 못했습니다: ' + e); return false; }
}
async function fxSubmit(t) {
  fxLog('in', t);
  if (!TAURI) { fxDemo(t); return; }
  if (!await fxEnsure()) return;
  try { await TAURI.core.invoke('claude_send', { sessionId: FIXER, text: t }); }
  catch (e) { fxLog('err', '보내지 못했습니다: ' + e); }
}
// 데스크톱 앱 사건 → 앱 고치기 창(서버로 올리지 않음)
function fxEvent(p) {
  switch (p.kind) {
    case 'started': FX.running = true; FX.cost = 0; fxLog('sys', `클로드 연결됨${p.resumed ? ' (이전 대화를 이어서)' : ''}`); if (ui.fixer) renderFixer(false); break;
    case 'text': fxLog('out', p.text); break;
    case 'tool': fxLog('tool', `${p.tool || '도구'} · ${oneLine(p.text)}`); break;
    case 'tool_result': if (p.isError) fxLog('err', oneLine(p.text, 300)); break;
    case 'denied': fxLog('denied', `허락이 필요한 동작이 막혔습니다: ${p.tool || '도구'} · ${oneLine(p.text)}`); break;
    case 'result': {
      let c = '';
      if (typeof p.costUsd === 'number') { const d = p.costUsd >= FX.cost ? p.costUsd - FX.cost : p.costUsd; FX.cost = p.costUsd; c = ` · 약 ${d.toFixed(3)}달러`; }
      fxLog('result', `끝${c}`);
      fxRescan(false);
      break;
    }
    case 'exit': FX.running = false; FX.cost = 0; fxLog('sys', '클로드가 꺼졌습니다'); if (ui.fixer) renderFixer(false); break;
    case 'error': fxLog('err', p.text || '클로드 오류'); break;
  }
}

// ── 시연 방식: 정해 둔 말에만 흉내로 답한다 ──
const SAMPLE_TODAY = {
  manifest: { id: 'today-tab', name: '오늘 할 일', version: '1.0.0', description: '오늘 계획 중 내 일을 모아 보여 줍니다', permissions: ['read:plan', 'read:members'], tabs: [{ id: 'main', title: '오늘 할 일', file: 'tab.html' }], bands: [] },
  files: { 'tab.html': `<!doctype html><meta charset="utf-8">
<style>
  body { margin: 0; padding: 12px; font: 14px "Malgun Gothic", sans-serif; color: #1F2A44; background: #FFFDF8; }
  li { margin: 4px 0; }
</style>
<h3>오늘 할 일</h3>
<ul id="list"></ul>
<script>
  itda.ready(ctx => { /* ctx.extId, ctx.target, ctx.theme.accent, ctx.theme.dark */ });
  itda.onState(state => {
    // state: { project, sessions, plan, artifacts, messages, wiki, members, me } 중 허락받은 것만
    const mine = (state.plan || []).filter(p => !p.done && p.ownerId === state.me.id);
    document.getElementById('list').innerHTML = mine.map(p => \`<li>\${p.title}</li>\`).join('') || '<li>오늘 남은 일이 없습니다</li>';
  });
</script>
` },
};
const COLOR_WORDS = [[/파랑|파란|푸른|하늘/, '#3B6FE0'], [/초록|녹색|연두/, '#2BB673'], [/빨강|빨간|붉은/, '#E5484D'], [/보라/, '#8B5CF6'], [/분홍|핑크/, '#E0569B'], [/남색|곤색/, '#2E3A87'], [/노랑|노란/, '#E8A33D'], [/주황|원래|기본/, '#FF7A45']];
function fxDemo(t) {
  const ws = LS.get('fixer.demows', null) || { layout: JSON.parse(JSON.stringify(LAY)), extensions: [] };
  const L = Object.assign({}, ws.layout || LAY);
  const steps = []; const tool = text => steps.push({ kind: 'tool', text: text + ' (시연)' }); const say = text => steps.push({ kind: 'out', text: '(시연) ' + text });
  const tabs = BASE_TABS.map(([id, title]) => ({ id, names: [title, ...({ board: ['대시보드'], wiki: ['위키'], agent: ['본부장'], map: ['지도'] }[id] || [])] }))
    .concat(extTabs().map(x => ({ id: x.id, names: [x.title] })));
  const hit = tabs.find(x => x.names.some(n => t.includes(n)));
  if (/숨겨|숨기/.test(t)) {
    if (hit) { L.hiddenTabs = [...new Set([...(L.hiddenTabs || []), hit.id])]; tool(`파일 고치기 · layout.json — hiddenTabs 에 "${hit.id}" 추가`); say(`「${tabTitle(hit.id)}」 탭을 숨겼습니다. 다시 보이게 하려면 「${tabTitle(hit.id)} 탭 다시 보여 줘」라고 하세요.`); }
    else say('어느 탭을 숨길까요? 탭 이름을 함께 적어 주세요(예: 지식위키 탭 숨겨 줘).');
  } else if (/보여|보이게/.test(t) && hit && (L.hiddenTabs || []).includes(hit.id)) {
    L.hiddenTabs = L.hiddenTabs.filter(x => x !== hit.id); tool(`파일 고치기 · layout.json — hiddenTabs 에서 "${hit.id}" 뺌`); say(`「${tabTitle(hit.id)}」 탭을 다시 보이게 했습니다.`);
  } else if (/채널|오른쪽/.test(t)) {
    L.channelListSide = /왼쪽/.test(t) ? 'left' : 'right';
    tool(`파일 고치기 · layout.json — channelListSide "${L.channelListSide}"`); say(`메신저 채널 목록을 ${L.channelListSide === 'right' ? '오른쪽' : '왼쪽'}으로 옮겼습니다. 메신저 탭에서 확인해 보세요.`);
  } else if (/(강조|주)색|색깔|색상|색을|색으로|색\s*바꿔/.test(t)) {
    const hex = (t.match(/#[0-9a-f]{6}\b|#[0-9a-f]{3}\b/i) || [])[0];
    const word = COLOR_WORDS.find(([re]) => re.test(t));
    const cycle = ['#3B6FE0', '#2BB673', '#8B5CF6', '#FF7A45'];
    L.accent = hex || (word ? word[1] : cycle[(cycle.indexOf(String(L.accent).toUpperCase()) + 1) % cycle.length]);
    tool(`파일 고치기 · layout.json — accent "${L.accent}"`); say(`강조색을 ${L.accent} 로 바꿨습니다. 원래대로 하려면 「강조색 원래대로」라고 하세요.`);
  } else if (/탭|할\s*일/.test(t)) {
    const rec = inst()['today-tab'];
    const sample = toOffer(cleanExt(SAMPLE_TODAY.manifest, SAMPLE_TODAY.files), 'fixer');
    if (rec && rec.hash === sample.hash) say('「오늘 할 일」 탭은 이미 켜져 있습니다. 오른쪽 탭 줄에서 확인하세요.');
    else {
      ws.extensions = (ws.extensions || []).filter(x => x.manifest.id !== 'today-tab').concat([JSON.parse(JSON.stringify(SAMPLE_TODAY))]);
      const seen = LS.get('ext.seen', {}) || {}; if (!(pend()['today-tab'] && pend()['today-tab'].hash === sample.hash)) { delete seen['today-tab']; LS.set('ext.seen', seen); }
      tool('파일 만들기 · extensions/today-tab/manifest.json'); tool('파일 만들기 · extensions/today-tab/tab.html');
      say('「오늘 할 일」 탭 확장을 만들었습니다. 아래 카드에서 허락 목록을 보고 「켜기」를 누르면 오른쪽에 탭이 생깁니다.');
    }
  } else {
    say('데스크톱 앱에서는 클로드가 직접 만듭니다. 시연에서는 「오늘 할 일 탭 만들어 줘」 「채널 목록 오른쪽으로」 「지식위키 탭 숨겨 줘」 「강조색 파랑으로」만 흉내 냅니다.');
  }
  ws.layout = L;
  LS.set('fixer.demows', ws);
  steps.push({ kind: 'result', text: '끝 (시연)' });
  steps.forEach((s, i) => setTimeout(() => {
    if (s.kind === 'result') fxProcess(ws, { demo: true });
    fxLog(s.kind, s.text);
  }, 400 + i * 350));
}
document.addEventListener('click', e => {
  const t = e.target.closest('#fixerNode,[data-fx],[data-fxon],[data-fxlater]'); if (!t) return;
  const d = t.dataset;
  if (t.id === 'fixerNode') { ui.fixer = true; renderTree(); renderCenter(); return; }
  if (d.fxon) { const o = pend()[d.fxon]; if (o) extOn(o); }
  else if (d.fxlater) { FX.log.forEach(l => { if (l.kind === 'ext' && l.hash === d.fxlater) l.status = 'later'; }); LS.set('fixer.log', FX.log); renderCenter(true); }
  else if (d.fx === 'clear') { FX.log.length = 0; LS.set('fixer.log', FX.log); renderCenter(); }
  else if (d.fx === 'reset') {
    const before = LAY; applyLayout(LAYOUT_DEFAULT);
    const ws = LS.get('fixer.demows', null); if (ws) { ws.layout = JSON.parse(JSON.stringify(LAYOUT_DEFAULT)); LS.set('fixer.demows', ws); }
    fxLog('sys', `배치를 처음대로 되돌렸습니다 — ${layoutDiff(before, LAY)}${TAURI ? ' (폴더의 layout.json 은 그대로이며, 클로드가 그 파일을 다시 고치면 그때 적용됩니다)' : ''}`);
  }
  else if (d.fx === 'start') fxEnsure();
  else if (d.fx === 'stop') TAURI.core.invoke('claude_stop', { sessionId: FIXER }).then(() => { FX.running = false; renderFixer(false); }).catch(er => fxLog('err', '끄지 못했습니다: ' + er));
});


function applyTheme() { if (cfg.theme === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.dataset.theme = cfg.theme; }

// ───────── 이벤트 ─────────
document.addEventListener('click', e => {
  const t = e.target.closest('[data-proj],[data-sess],[data-add],[data-mode],[data-tab],[data-art],[data-close],[data-share],[data-ch],[data-newch],[data-newdm],[data-reply],[data-noreply],[data-wiki],[data-newwiki],[data-editwiki],[data-board],[data-newboard],[data-editboard],[data-editgoal],[data-addplan],[data-review],[data-help],[data-nudge],[data-clone],[data-resolve],[data-mapf],[data-claude],[data-reqok],[data-reqno],#btnNewProject,#btnSettings,#btnPublish,#btnSendTeam,#btnAsk,#modal');
  if (!t) return;
  const d = t.dataset;
  if (t.id === 'modal') { if (e.target === t) closeModal(); return; }
  if (d.proj || d.sess) ui.fixer = false;
  if (d.proj) { if (ui.projectId === d.proj) { ui.open[d.proj] = ui.open[d.proj] === false; LS.set('open', ui.open); } ui.projectId = d.proj; ui.sessionId = null; ui.channelId = null; ensureSelection(); render(); }
  else if (d.sess) { const s = st().sessions.find(x => x.id === d.sess); ui.sessionId = s.id; if (s.projectId !== ui.projectId) { ui.projectId = s.projectId; ui.channelId = null; ensureSelection(); } render(); }
  else if (d.add) { modal(`<h3>내 세션 열기</h3><label>세션 이름</label><input id="sTitle" placeholder="예: 로그인 화면 시안"><label class="check" style="color:var(--text)"><input type="checkbox" id="sMain" ${myMain(d.add) ? '' : 'checked'} style="width:auto"> 내 메인 세션 (하위 세션들을 대표)</label><div class="acts"><button class="btn" data-close>취소</button><button class="btn primary" id="sSave">열기</button></div>`);
    $('#sSave').onclick = () => { send({ op: 'openSession', projectId: d.add, title: $('#sTitle').value.trim() || '새 세션', isMain: $('#sMain').checked }); closeModal(); }; }
  else if (d.mode) { ui.mode = d.mode; LS.set('mode', ui.mode); renderCenter(); }
  else if (d.tab) { ui.tab = d.tab; renderRight(); if (d.tab === 'admin' && A.auditState === 'idle') loadAudit(); }
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
  else if (d.claude) { const s = session(); if (s) (d.claude === 'start' ? claudeStart(s.id) : claudeStop(s.id)).then(() => renderClaudeBar(s, true)); }
  else if (d.reqok) reqHandle(d.reqok, true);
  else if (d.reqno) reqHandle(d.reqno, false);
  else if (d.mapf) { ui.mapFilter = d.mapf; renderMap(); }
  else if (t.id === 'btnNewProject') { modal(`<h3>새 프로젝트 (메인 채팅)</h3><label>이름</label><input id="pName" placeholder="예: 진정 크림 라인"><label>종류</label><select id="pKind"><option>개발</option><option>사업</option></select><label>목표 (나중에 본부장과 정해도 됩니다)</label><input id="pGoal"><div class="acts"><button class="btn" data-close>취소</button><button class="btn primary" id="pSave">만들기</button></div>`); $('#pSave').onclick = () => { send({ op: 'createProject', name: $('#pName').value.trim() || '새 프로젝트', kind: $('#pKind').value, goal: $('#pGoal').value.trim() }); closeModal(); }; }
  else if (t.id === 'btnSettings') settingsDialog();
  else if (t.id === 'btnPublish') { modal(`<h3>산출물 올리기</h3><label>이름 (같은 이름이면 버전이 올라갑니다)</label><input id="aName" list="aList"><datalist id="aList">${artifactsOf(ui.projectId).map(a => `<option value="${esc(a.name)}">`).join('')}</datalist><label>종류</label><select id="aKind"><option>문서</option><option>디자인</option><option>코드</option><option>이미지</option><option>이메일</option></select><label>바뀐 점</label><input id="aNote"><label>내용 (글, 또는 &lt;svg&gt; 그림)</label><textarea id="aBody" rows="6"></textarea><div class="acts"><button class="btn" data-close>취소</button><button class="btn primary" id="aSave">올리기</button></div>`); $('#aSave').onclick = () => { publish($('#aName').value.trim() || '이름 없는 산출물', $('#aBody').value, $('#aKind').value, $('#aNote').value); closeModal(); }; }
  else if (t.id === 'btnSendTeam') { modal(`<h3>팀 메인 세션에 합치기 요청</h3><p class="small muted">이 세션의 가장 최근 산출물이 함께 갑니다. 팀 메인이 다른 사람 작업과 겹치지 않게 순서를 정해 합칩니다.</p><label>부탁할 말</label><textarea id="rNote" rows="3" placeholder="예: 로그인 시안 v3 앱에 반영해 주세요"></textarea><div class="acts"><button class="btn" data-close>취소</button><button class="btn primary" id="rSave">보내기</button></div>`); $('#rSave').onclick = () => { sendTeam($('#rNote').value.trim() || '합쳐 주세요'); closeModal(); }; }
  else if (t.id === 'btnAsk') { $('#input').focus(); }
});
document.addEventListener('change', e => {
  if (e.target.id === 'selStatus') send({ op: 'setSessionStatus', sessionId: ui.sessionId, status: e.target.value });
  if (e.target.id === 'selModel' && ui.sessionId) csSet(ui.sessionId, { model: e.target.value });
  if (e.target.id === 'selPerm' && ui.sessionId) csSet(ui.sessionId, { perm: e.target.value });
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
  TAURI.event.listen('itda-claude', ev => { const p = ev.payload; if (p && p.sessionId === FIXER) fxEvent(p); else onClaude(p); });
  TAURI.event.listen('itda-out', ev => { const { sessionId, kind, text } = ev.payload; send({ op: 'log', sessionId, kind, text }); });
  TAURI.core.invoke('machine_info').then(info => { let ch = false; if (!cfg.computer) { cfg.computer = info.computer; ch = true; } if (!cfg.name) { cfg.name = info.user; ch = true; } if (ch) { LS.set('cfg', cfg); if (S.live) connect(); } }).catch(() => {});
}

// 시작
applyTheme();
applyLayout(LS.get('layout', {}), false);
renderBands();
connect();
if (TAURI) fxRescan(true);
setInterval(() => { if (!S.live && st()) { Demo.tick(); render(true); } }, 15000);
setInterval(simulate, 5000);
window.ITDA = { S, ui, A, send, Demo, render, applyLayout, layout: () => LAY, ext: { installed: inst, pending: pend, frames: () => FR }, FX };
})();
