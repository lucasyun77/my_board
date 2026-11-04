#!/usr/bin/env node
/* 아이센스 사내 AI(Qwen) 로컬 커넥터 — Claude 데스크톱 앱용 MCP 서버(stdio, 외부 라이브러리 없음, Node 18+)
   회사 네트워크 안의 PC에서만 동작합니다(사내 AI 서버가 회사 네트워크에서만 열리기 때문).
   환경변수
     ISENS_AI_KEY   : 조상준 과장에게 받은 본인 API 키 (필수, 파일·저장소에 적지 말 것)
     ISENS_AI_URL   : API 주소. 기본 https://isens-1544.asuscomm.com/v1/chat/completions (OpenAI 호환 형식 가정)
     ISENS_AI_MODEL : 모델 이름. 기본 Qwen3.8-Flash-Next
     ISENS_AI_TIMEOUT_MS : 응답 대기 한도. 기본 240000 (업무시간에는 차례를 기다릴 수 있음) */
import { createInterface } from 'node:readline';

const URL_ = process.env.ISENS_AI_URL || 'https://isens-1544.asuscomm.com/v1/chat/completions';
const KEY = process.env.ISENS_AI_KEY || '';
const MODEL = process.env.ISENS_AI_MODEL || 'Qwen3.8-Flash-Next';
const TIMEOUT = +process.env.ISENS_AI_TIMEOUT_MS || 240000;

const TOOLS = [
  {
    name: 'generate',
    description: '아이센스 사내 AI(Qwen)에게 글을 쓰게 합니다. prompt를 보내면 답 text를 돌려줍니다. json=true면 JSON만 답하도록 요청합니다.',
    inputSchema: { type: 'object', properties: { prompt: { type: 'string' }, system: { type: 'string' }, max_tokens: { type: 'integer' }, temperature: { type: 'number' }, json: { type: 'boolean' } }, required: ['prompt'] },
    annotations: { readOnlyHint: true }
  },
  {
    name: 'ping',
    description: '사내 AI 서버에 닿는지 확인합니다(짧은 질문 1건).',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true }
  }
];

const send = (msg) => process.stdout.write(JSON.stringify(msg) + '\n');
const ok = (id, result) => send({ jsonrpc: '2.0', id, result });
const fail = (id, code, message) => send({ jsonrpc: '2.0', id, error: { code, message } });
const toolText = (text, extra, isError) => ({ content: [{ type: 'text', text }], structuredContent: Object.assign({ text }, extra || {}), isError: !!isError });

const clean = (t) => String(t || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();

async function chat({ prompt, system, max_tokens, temperature, json }) {
  if (!KEY) throw new Error('ISENS_AI_KEY 환경변수가 없습니다. 조상준 과장에게 받은 API 키를 설정해 주세요.');
  const messages = [];
  const sys = [system || '당신은 아이센스그룹 업무를 돕는 AI입니다. 한국어로 답합니다.', json ? '반드시 JSON만 출력하세요. 설명이나 코드블록 표시는 쓰지 마세요.' : ''].filter(Boolean).join('\n');
  messages.push({ role: 'system', content: sys });
  messages.push({ role: 'user', content: String(prompt) });
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), TIMEOUT);
  try {
    const res = await fetch(URL_, {
      method: 'POST', signal: ctl.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
      body: JSON.stringify({ model: MODEL, messages, max_tokens: max_tokens || 2000, temperature: temperature ?? 0.3, stream: false })
    });
    const body = await res.text();
    if (!res.ok) throw new Error(`사내 AI 서버 응답 ${res.status}: ${body.slice(0, 300)}`);
    let data; try { data = JSON.parse(body); } catch (e) { throw new Error('사내 AI 응답을 읽지 못했습니다(OpenAI 호환 형식이 아닐 수 있음): ' + body.slice(0, 200)); }
    const text = clean(data && data.choices && data.choices[0] && (data.choices[0].message ? data.choices[0].message.content : data.choices[0].text));
    return { text, model: data.model || MODEL, usage: data.usage || null };
  } catch (e) {
    if (e && e.name === 'AbortError') throw new Error(`사내 AI가 ${Math.round(TIMEOUT / 1000)}초 안에 답하지 않았습니다(업무시간에는 차례 대기 중일 수 있음).`);
    if (e && e.cause && /ENOTFOUND|ECONNREFUSED|ETIMEDOUT|EHOSTUNREACH/.test(String(e.cause.code || e.cause))) throw new Error('사내 AI 서버에 닿지 않습니다. 회사 네트워크에 연결된 PC인지 확인해 주세요.');
    throw e;
  } finally { clearTimeout(t); }
}

async function handle(msg) {
  const { id, method, params } = msg;
  if (method === 'initialize') return ok(id, { protocolVersion: (params && params.protocolVersion) || '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'isens-ai', version: '0.1.0' } });
  if (method === 'notifications/initialized' || (method && method.startsWith('notifications/'))) return;
  if (method === 'ping') return ok(id, {});
  if (method === 'tools/list') return ok(id, { tools: TOOLS });
  if (method === 'tools/call') {
    const name = params && params.name; const args = (params && params.arguments) || {};
    try {
      if (name === 'generate') { if (!args.prompt) return ok(id, toolText('prompt가 비어 있습니다.', {}, true)); const r = await chat(args); return ok(id, toolText(r.text, { model: r.model, usage: r.usage })); }
      if (name === 'ping') { const r = await chat({ prompt: '"ok" 한 단어로만 답하세요.', max_tokens: 10 }); return ok(id, toolText(r.text, { model: r.model })); }
      return fail(id, -32602, '모르는 도구: ' + name);
    } catch (e) { return ok(id, toolText(String(e && e.message || e), {}, true)); }
  }
  if (id !== undefined) fail(id, -32601, '지원하지 않는 요청: ' + method);
}

createInterface({ input: process.stdin }).on('line', (line) => {
  if (!line.trim()) return;
  let msg; try { msg = JSON.parse(line); } catch (e) { return; }
  handle(msg).catch((e) => { if (msg && msg.id !== undefined) fail(msg.id, -32603, String(e && e.message || e)); });
});
