//! 아이센스투게더 중계 서버 본체.
//! 각 컴퓨터의 아이센스투게더 앱은 이 서버로 "밖으로 나가는 연결(웹소켓)"만 맺는다.
//! 그래서 공유기·방화벽 설정 없이 서로 다른 컴퓨터·계정의 세션이 이어진다.
//! 기반 단계(0.2): 회사 구글 계정 확인, 데이터베이스 저장, 감사 기록, 오류 보고, 암호화 연결.

pub mod agent;
pub mod auth;
pub mod state;
pub mod store;

use agent::AgentCfg;
use auth::AuthMode;
use axum::{
    extract::ws::{Message as WsMsg, WebSocket, WebSocketUpgrade},
    extract::{Query, State as AxState},
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
    routing::get,
    Json, Router,
};
use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
use state::*;
use std::{path::PathBuf, sync::Arc};
use store::Store;
use tokio::sync::{broadcast, mpsc, Mutex};

pub const VERSION: &str = env!("CARGO_PKG_VERSION");

pub struct Hub {
    pub state: Mutex<State>,
    pub tx: broadcast::Sender<String>,
    pub cfg: AgentCfg,
    pub store: Store,
    pub dirty: Mutex<bool>,
    pub auth: AuthMode,
    /// 관리자 이메일(계정 차단·감사 기록 열람)
    pub admins: Vec<String>,
}

impl Hub {
    pub fn new(state: State, cfg: AgentCfg, store: Store, auth: AuthMode, admins: Vec<String>) -> Arc<Self> {
        let (tx, _) = broadcast::channel(512);
        let admins = admins.into_iter().map(|a| a.trim().to_lowercase()).filter(|a| !a.is_empty()).collect();
        Arc::new(Self { state: Mutex::new(state), tx, cfg, store, dirty: Mutex::new(false), auth, admins })
    }

    pub async fn broadcast_snapshot(&self) {
        let snap = { self.state.lock().await.snapshot() };
        let _ = self.tx.send(json!({"t": "snapshot", "state": snap}).to_string());
        *self.dirty.lock().await = true;
    }

    /// 바뀐 것이 있으면 저장소에 스냅숏을 남긴다(잠금은 복사하는 동안만)
    pub async fn save(&self) {
        {
            let d = self.dirty.lock().await;
            if !*d { return; }
        }
        let copy = { self.state.lock().await.clone() };
        match self.store.snapshot(&copy).await {
            Ok(()) => *self.dirty.lock().await = false,
            Err(e) => eprintln!("저장 실패(다음 주기에 다시 시도): {e}"),
        }
    }

    pub fn is_admin(&self, email: &str) -> bool {
        !email.is_empty() && self.admins.iter().any(|a| a == &email.to_lowercase())
    }
}

/// 파일 하나에서 상태 읽기(데스크톱 앱 내장 서버·시험용)
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
    // 화면(데스크톱 앱·브라우저)이 다른 주소에서 상태·로그인 설정을 물을 수 있게 허용
    let cors = tower_http::cors::CorsLayer::new()
        .allow_origin(tower_http::cors::Any)
        .allow_methods([axum::http::Method::GET])
        .allow_headers([axum::http::header::AUTHORIZATION]);
    Router::new()
        .route("/ws", get(ws_handler))
        .route("/health", get(health))
        .route("/auth-config", get(auth_config))
        .route("/admin/audit", get(admin_audit))
        .layer(cors)
        .fallback_service(tower_http::services::ServeDir::new(ui_dir))
        .with_state(hub)
}

async fn health(AxState(hub): AxState<Arc<Hub>>) -> impl IntoResponse {
    let st = hub.state.lock().await;
    Json(json!({
        "ok": true,
        "version": VERSION,
        "auth": hub.auth.label(),
        "store": hub.store.label(),
        "members": st.members.len(),
        "online": st.members.iter().filter(|m| m.online).count(),
        "projects": st.projects.len(),
        "sessions": st.sessions.len(),
        "claude": hub.cfg.api_key.is_some(),
    }))
}

/// 앱이 로그인 창을 열 때 필요한 값(공개 정보만)
async fn auth_config(AxState(hub): AxState<Arc<Hub>>) -> impl IntoResponse {
    match &hub.auth {
        AuthMode::Open { team_key } => Json(json!({"mode": "open", "needKey": !team_key.is_empty()})),
        AuthMode::Google(g) => Json(json!({
            "mode": "google",
            "clientId": g.client_ids.first().cloned().unwrap_or_default(),
            "clientSecret": g.client_secret,
            "domain": g.allowed_domains.first().cloned().unwrap_or_default(),
        })),
    }
}

/// 관리자: 최근 감사 기록. 머리글 Authorization: Bearer <구글 신분증>
async fn admin_audit(AxState(hub): AxState<Arc<Hub>>, headers: HeaderMap, Query(q): Query<std::collections::HashMap<String, String>>) -> impl IntoResponse {
    let AuthMode::Google(g) = &hub.auth else { return (StatusCode::FORBIDDEN, Json(json!({"error": "회사 계정 로그인 방식에서만 쓸 수 있습니다"}))); };
    let token = headers.get("authorization").and_then(|h| h.to_str().ok()).and_then(|h| h.strip_prefix("Bearer ")).unwrap_or("");
    match g.verify(token).await {
        Ok(id) if hub.is_admin(&id.email) => {
            let limit = q.get("limit").and_then(|l| l.parse().ok()).unwrap_or(100i64).clamp(1, 1000);
            (StatusCode::OK, Json(json!({"audit": hub.store.recent_audit(limit).await})))
        }
        Ok(_) => (StatusCode::FORBIDDEN, Json(json!({"error": "관리자만 볼 수 있습니다"}))),
        Err(e) => (StatusCode::UNAUTHORIZED, Json(json!({"error": e}))),
    }
}

async fn ws_handler(ws: WebSocketUpgrade, AxState(hub): AxState<Arc<Hub>>) -> impl IntoResponse {
    ws.on_upgrade(move |sock| client(sock, hub))
}

fn err(code: &str, msg: impl Into<String>) -> String {
    json!({"t": "error", "code": code, "msg": msg.into()}).to_string()
}

/// 첫 인사 확인 → 회원 정보
async fn greet(hub: &Hub, v: &Value) -> Result<Member, (String, String)> {
    let given: Member = serde_json::from_value(v["member"].clone()).map_err(|_| ("hello".to_string(), "인사 형식이 틀렸습니다.".to_string()))?;
    let m = match &hub.auth {
        AuthMode::Open { team_key } => {
            if !team_key.is_empty() && v.get("key").and_then(|k| k.as_str()) != Some(team_key.as_str()) {
                return Err(("auth".into(), "모임 암호가 맞지 않습니다.".into()));
            }
            Member { email: String::new(), ..given }
        }
        AuthMode::Google(g) => {
            let token = v.get("token").and_then(|t| t.as_str()).unwrap_or("");
            if token.is_empty() { return Err(("auth".into(), "회사 구글 계정으로 로그인해 주세요.".into())); }
            let id = g.verify(token).await.map_err(|e| ("auth".to_string(), e))?;
            Member { id: id.id, name: id.name, email: id.email, ..given }
        }
    };
    if !m.email.is_empty() && hub.state.lock().await.blocked.contains(&m.email) {
        return Err(("blocked".into(), "이 계정은 들어올 수 없습니다. 관리자에게 문의하세요.".into()));
    }
    Ok(m)
}

async fn client(sock: WebSocket, hub: Arc<Hub>) {
    let (mut sink, mut stream) = sock.split();
    let (direct_tx, mut direct_rx) = mpsc::unbounded_channel::<String>();
    let mut rx = hub.tx.subscribe();

    // 보내기 담당: 모두에게 뿌리는 것 + 나에게만 보내는 것
    let writer = tokio::spawn(async move {
        loop {
            tokio::select! {
                d = direct_rx.recv() => match d {
                    Some(m) => { if sink.send(WsMsg::Text(m.into())).await.is_err() { break; } }
                    None => { let _ = sink.close().await; break; } // 끊기 전 안내를 다 보낸 뒤 닫음
                },
                r = rx.recv() => match r {
                    Ok(m) => { if sink.send(WsMsg::Text(m.into())).await.is_err() { break; } }
                    Err(broadcast::error::RecvError::Lagged(_)) => continue,
                    Err(_) => break,
                }
            }
        }
    });

    let mut me: Option<(String, String)> = None; // (아이디, 이메일)
    while let Some(Ok(msg)) = stream.next().await {
        let WsMsg::Text(text) = msg else { continue };
        let Ok(v) = serde_json::from_str::<Value>(&text) else { continue };

        // 첫 인사: {"op":"hello","member":{...},"token":"구글 신분증" 또는 "key":"모임 암호"}
        if v.get("op").and_then(|o| o.as_str()) == Some("hello") {
            match greet(&hub, &v).await {
                Err((code, msg)) => {
                    let _ = direct_tx.send(err(&code, msg));
                    if code != "hello" { break; } else { continue; }
                }
                Ok(m) => {
                    hub.store.audit(&m.id, &json!({"op": "hello", "computer": m.computer, "email": m.email})).await;
                    me = Some((m.id.clone(), m.email.clone()));
                    let admin = hub.is_admin(&m.email);
                    hub.state.lock().await.upsert_member(m.clone());
                    let _ = direct_tx.send(json!({"t":"welcome","memberId": m.id, "name": m.name, "email": m.email, "admin": admin, "claude": hub.cfg.api_key.is_some(), "version": VERSION}).to_string());
                    hub.broadcast_snapshot().await;
                }
            }
            continue;
        }
        let Some((who, email)) = me.clone() else {
            let _ = direct_tx.send(err("hello", "먼저 인사(hello)를 보내 주세요."));
            continue;
        };
        // 도중에 차단된 계정은 바로 끊는다
        if !email.is_empty() && hub.state.lock().await.blocked.contains(&email) {
            let _ = direct_tx.send(err("blocked", "이 계정은 차단되었습니다."));
            break;
        }
        let op: Op = match serde_json::from_value(v.clone()) {
            Ok(op) => op,
            Err(e) => { let _ = direct_tx.send(err("op", format!("알 수 없는 동작: {e}"))); continue; }
        };
        match &op {
            Op::Report { .. } => { hub.store.report(&who, &v).await; continue; }
            Op::RemoveExtension { id } if !hub.is_admin(&email) && !hub.state.lock().await.extensions.iter().any(|e| &e.id == id && e.by == who) => {
                let _ = direct_tx.send(err("admin", "관리자나 올린 사람만 지울 수 있습니다."));
                continue;
            }
            Op::BlockUser { .. } | Op::UnblockUser { .. } | Op::ApproveExtension { .. } if !hub.is_admin(&email) => {
                let _ = direct_tx.send(err("admin", "관리자만 할 수 있습니다."));
                continue;
            }
            _ => {}
        }
        hub.store.audit(&who, &v).await;
        handle_op(&hub, &who, op, Some(&direct_tx)).await;
    }

    if let Some((id, _)) = me {
        hub.state.lock().await.set_offline(&id);
        hub.broadcast_snapshot().await;
    }
    drop(direct_tx);
    if tokio::time::timeout(std::time::Duration::from_secs(1), writer).await.is_err() { /* 1초 안에 못 보내면 그냥 닫음 */ }
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

/// 암호화 연결(https·wss)로 띄운다. 인증서·열쇠는 PEM 파일.
pub async fn serve_tls(addr: std::net::SocketAddr, router: Router, cert: PathBuf, key: PathBuf) -> std::io::Result<()> {
    let _ = rustls::crypto::ring::default_provider().install_default();
    let cfg = axum_server::tls_rustls::RustlsConfig::from_pem_file(cert, key).await?;
    axum_server::bind_rustls(addr, cfg).serve(router.into_make_service()).await
}
