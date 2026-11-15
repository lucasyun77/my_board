//! 잇다 중계 서버 본체.
//! 각 컴퓨터의 잇다 앱은 이 서버로 "밖으로 나가는 연결(웹소켓)"만 맺는다.
//! 그래서 공유기·방화벽 설정 없이 서로 다른 컴퓨터·계정의 세션이 이어진다.

pub mod agent;
pub mod state;

use agent::AgentCfg;
use axum::{
    extract::ws::{Message as WsMsg, WebSocket, WebSocketUpgrade},
    extract::State as AxState,
    response::IntoResponse,
    routing::get,
    Json, Router,
};
use futures_util::{SinkExt, StreamExt};
use serde_json::json;
use state::*;
use std::{path::PathBuf, sync::Arc};
use tokio::sync::{broadcast, mpsc, Mutex};

pub struct Hub {
    pub state: Mutex<State>,
    pub tx: broadcast::Sender<String>,
    pub cfg: AgentCfg,
    pub data_path: Option<PathBuf>,
    pub dirty: Mutex<bool>,
    /// 모임 암호. 비어 있으면 누구나 들어온다(시제품 기본값).
    pub team_key: String,
}

impl Hub {
    pub fn new(state: State, cfg: AgentCfg, data_path: Option<PathBuf>, team_key: String) -> Arc<Self> {
        let (tx, _) = broadcast::channel(512);
        Arc::new(Self { state: Mutex::new(state), tx, cfg, data_path, dirty: Mutex::new(false), team_key })
    }

    pub async fn broadcast_snapshot(&self) {
        let snap = { self.state.lock().await.snapshot() };
        let _ = self.tx.send(json!({"t": "snapshot", "state": snap}).to_string());
        *self.dirty.lock().await = true;
    }

    pub async fn save(&self) {
        let Some(p) = &self.data_path else { return };
        let mut d = self.dirty.lock().await;
        if !*d { return; }
        let body = { serde_json::to_string_pretty(&*self.state.lock().await).unwrap_or_default() };
        let tmp = p.with_extension("tmp");
        if tokio::fs::write(&tmp, body).await.is_ok() {
            let _ = tokio::fs::rename(&tmp, p).await;
            *d = false;
        }
    }
}

pub fn load_state(path: &PathBuf) -> State {
    std::fs::read_to_string(path).ok().and_then(|s| serde_json::from_str(&s).ok()).unwrap_or_default()
}

/// 화면 폴더의 demo-data.js(`window.ITDA_DEMO = {...};`)를 읽어 시연용 상태로 쓴다.
pub fn load_demo(ui_dir: &PathBuf) -> Option<State> {
    let raw = std::fs::read_to_string(ui_dir.join("demo-data.js")).ok()?;
    let start = raw.find('{')?;
    let end = raw.rfind('}')?;
    let mut st: State = serde_json::from_str(&raw[start..=end]).map_err(|e| eprintln!("시연 자료 읽기 실패: {e}")).ok()?;
    // 시연 자료의 시각은 "지금으로부터 몇 분 전"(음수)으로 적혀 있으므로 실제 시각으로 바꾼다
    let now = now_ms() as i64;
    let fix = |t: u64| -> u64 { let x = t as i64; if x < 10_000_000_000 { (now - x.abs() * 60_000).max(0) as u64 } else { t } };
    for s in st.sessions.iter_mut() { s.last_activity = fix(s.last_activity); s.created_at = fix(s.created_at); }
    for m in st.messages.iter_mut() { m.ts = fix(m.ts); }
    for a in st.artifacts.iter_mut() { for v in a.versions.iter_mut() { v.ts = fix(v.ts); } }
    for c in st.coach.iter_mut() { c.ts = fix(c.ts); }
    for r in st.requests.iter_mut() { r.ts = fix(r.ts); }
    for w in st.wiki.iter_mut() { w.updated_at = fix(w.updated_at); }
    for (_, v) in st.logs.iter_mut() { for l in v.iter_mut() { l.ts = fix(l.ts); } }
    for m in st.members.iter_mut() { m.online = false; }
    Some(st)
}

pub fn router(hub: Arc<Hub>, ui_dir: PathBuf) -> Router {
    Router::new()
        .route("/ws", get(ws_handler))
        .route("/health", get(health))
        .fallback_service(tower_http::services::ServeDir::new(ui_dir))
        .with_state(hub)
}

async fn health(AxState(hub): AxState<Arc<Hub>>) -> impl IntoResponse {
    let st = hub.state.lock().await;
    Json(json!({
        "ok": true,
        "members": st.members.len(),
        "online": st.members.iter().filter(|m| m.online).count(),
        "projects": st.projects.len(),
        "sessions": st.sessions.len(),
        "claude": hub.cfg.api_key.is_some(),
    }))
}

async fn ws_handler(ws: WebSocketUpgrade, AxState(hub): AxState<Arc<Hub>>) -> impl IntoResponse {
    ws.on_upgrade(move |sock| client(sock, hub))
}

async fn client(sock: WebSocket, hub: Arc<Hub>) {
    let (mut sink, mut stream) = sock.split();
    let (direct_tx, mut direct_rx) = mpsc::unbounded_channel::<String>();
    let mut rx = hub.tx.subscribe();

    // 보내기 담당: 모두에게 뿌리는 것 + 나에게만 보내는 것
    let writer = tokio::spawn(async move {
        loop {
            tokio::select! {
                Some(m) = direct_rx.recv() => { if sink.send(WsMsg::Text(m.into())).await.is_err() { break; } }
                r = rx.recv() => match r {
                    Ok(m) => { if sink.send(WsMsg::Text(m.into())).await.is_err() { break; } }
                    Err(broadcast::error::RecvError::Lagged(_)) => continue,
                    Err(_) => break,
                }
            }
        }
    });

    let mut me: Option<String> = None;
    while let Some(Ok(msg)) = stream.next().await {
        let WsMsg::Text(text) = msg else { continue };
        let Ok(v) = serde_json::from_str::<serde_json::Value>(&text) else { continue };

        // 첫 인사: {"op":"hello","member":{...},"key":"모임 암호"}
        if v.get("op").and_then(|o| o.as_str()) == Some("hello") {
            if !hub.team_key.is_empty() && v.get("key").and_then(|k| k.as_str()) != Some(hub.team_key.as_str()) {
                let _ = direct_tx.send(json!({"t":"error","msg":"모임 암호가 맞지 않습니다."}).to_string());
                break;
            }
            let Ok(m) = serde_json::from_value::<Member>(v["member"].clone()) else {
                let _ = direct_tx.send(json!({"t":"error","msg":"인사 형식이 틀렸습니다."}).to_string());
                continue;
            };
            me = Some(m.id.clone());
            hub.state.lock().await.upsert_member(m.clone());
            let _ = direct_tx.send(json!({"t":"welcome","memberId": m.id, "claude": hub.cfg.api_key.is_some()}).to_string());
            hub.broadcast_snapshot().await;
            continue;
        }
        let Some(who) = me.clone() else {
            let _ = direct_tx.send(json!({"t":"error","msg":"먼저 인사(hello)를 보내 주세요."}).to_string());
            continue;
        };
        let op: Op = match serde_json::from_value(v) {
            Ok(op) => op,
            Err(e) => { let _ = direct_tx.send(json!({"t":"error","msg": format!("알 수 없는 동작: {e}")}).to_string()); continue; }
        };
        handle_op(&hub, &who, op, Some(&direct_tx)).await;
    }

    if let Some(id) = me {
        hub.state.lock().await.set_offline(&id);
        hub.broadcast_snapshot().await;
    }
    writer.abort();
}

/// 동작 하나 처리(시험에서도 쓴다).
pub async fn handle_op(hub: &Arc<Hub>, who: &str, op: Op, direct: Option<&mpsc::UnboundedSender<String>>) {
    let res = { hub.state.lock().await.apply(who, op) };
    match res {
        Err(e) => { if let Some(d) = direct { let _ = d.send(json!({"t":"error","msg": e}).to_string()); } }
        Ok(Applied::Nothing) => {}
        Ok(Applied::Changed) => hub.broadcast_snapshot().await,
        Ok(Applied::LogOnly(sid, line)) => {
            let _ = hub.tx.send(json!({"t":"log","sessionId": sid, "line": line}).to_string());
            *hub.dirty.lock().await = true;
        }
        Ok(Applied::Review(pid)) => {
            { let mut st = hub.state.lock().await; agent::review(&mut st, &pid, now_ms()); }
            hub.broadcast_snapshot().await;
        }
        Ok(Applied::Posted(m)) => {
            hub.broadcast_snapshot().await;
            let answer = { agent::should_answer(&*hub.state.lock().await, &m) };
            if answer {
                let hub2 = hub.clone();
                tokio::spawn(async move { answer_message(hub2, m).await });
            }
        }
    }
}

async fn answer_message(hub: Arc<Hub>, m: Message) {
    let (pid, who, ctx) = {
        let st = hub.state.lock().await;
        let pid = st.channels.iter().find(|c| c.id == m.channel_id).map(|c| c.project_id.clone()).unwrap_or_default();
        (pid.clone(), st.member_name(&m.from), agent::context_for(&st, &pid))
    };
    let _ = pid;
    // 목표·할 일·점검 같은 정해진 말은 규칙으로 바로 처리
    let t = m.text.replace("@본부장", "");
    let t = t.trim();
    let is_command = t.starts_with("목표") || t.starts_with("할 일") || t.starts_with("할일") || t.contains("점검");
    let reply = if !is_command && hub.cfg.api_key.is_some() {
        agent::claude_answer(&hub.cfg, &ctx, &who, t).await
    } else { None };
    {
        let mut st = hub.state.lock().await;
        let text = match reply {
            Some(r) => r,
            None => agent::rule_answer(&mut st, &m, now_ms()),
        };
        if !text.is_empty() && !text.starts_with("📋") {
            st.post_as(&m.channel_id, AGENT_ID, text, Some(m.id.clone()));
        }
    }
    hub.broadcast_snapshot().await;
}

/// 본부장 주기 점검과 저장을 돌린다.
pub fn spawn_background(hub: Arc<Hub>) {
    let h = hub.clone();
    tokio::spawn(async move {
        let mut iv = tokio::time::interval(std::time::Duration::from_secs(15));
        loop {
            iv.tick().await;
            let changed = { let mut st = h.state.lock().await; agent::tick(&mut st, now_ms(), &h.cfg) };
            if changed { h.broadcast_snapshot().await; }
        }
    });
    tokio::spawn(async move {
        let mut iv = tokio::time::interval(std::time::Duration::from_secs(3));
        loop { iv.tick().await; hub.save().await; }
    });
}

/// 데스크톱 앱이 중계 서버를 품을 때 쓰는 꼴
pub type RouterType = Router;

pub async fn serve(listener: tokio::net::TcpListener, router: Router) -> std::io::Result<()> {
    axum::serve(listener, router).await
}
