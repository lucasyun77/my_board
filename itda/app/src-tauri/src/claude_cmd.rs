//! 진짜 클로드 코드 세션 — 화면이 부르는 타우리 명령 네 개와 사건 하나.
//! 실제 일은 타우리와 무관한 `itda_claude` 묶음이 한다(리눅스에서 시험 가능).
//!
//! 화면과 맺은 약속
//!  - `claude_start({ sessionId, cwd?, model?, permissionMode?, program? })`
//!      → `{ claudeSessionId: string|null, resumed: bool }`
//!      이미 켜져 있으면 그대로 둔다. cwd 가 없으면 `문서 폴더/iSensTogether/<sessionId>`.
//!      permissionMode 기본값은 "acceptEdits". program 은 클로드 코드 실행 파일 경로(없으면 찾아서 씀).
//!  - `claude_send({ sessionId, text })` → `()`  (켜져 있지 않으면 기본값으로 먼저 켠다)
//!  - `claude_stop({ sessionId })` → `()`
//!  - `claude_status({ sessionId })` → `{ running: bool, claudeSessionId: string|null }`
//!  - 사건 "itda-claude": `{ sessionId, kind, text, tool?, costUsd?, claudeSessionId?, isError? }`
//!      kind = started | text | tool | tool_result | denied | result | exit | error
//!  - 오류는 한국어 문장(문자열)으로 돌려준다.
//!
//! 잇다 세션 번호 → 클로드 세션 번호 연결표는 앱 자료 폴더의 `claude-sessions.json` 에 둔다.

use itda_claude::{Event, Manager, SessionMap, StartReply, StartRequest, Status};
use serde::Serialize;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager as _, State};

pub const EVENT_NAME: &str = "itda-claude";

pub struct ClaudeState(pub Arc<Manager>);

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Payload {
    session_id: String,
    #[serde(flatten)]
    event: Event,
}

/// 앱이 켜질 때 한 번 만든다.
pub fn create_state(app: &AppHandle) -> ClaudeState {
    let data_dir = app.path().app_data_dir().unwrap_or_else(|_| std::env::temp_dir().join("iSensTogether"));
    let docs = app
        .path()
        .document_dir()
        .or_else(|_| app.path().home_dir())
        .unwrap_or_else(|_| std::env::temp_dir());
    let handle = app.clone();
    let sink = Arc::new(move |sid: &str, event: Event| {
        let _ = handle.emit(EVENT_NAME, Payload { session_id: sid.to_string(), event });
    });
    ClaudeState(Arc::new(Manager::new(
        SessionMap::load(data_dir.join("claude-sessions.json")),
        docs.join("iSensTogether"),
        sink,
    )))
}

fn non_empty(s: Option<String>) -> Option<String> {
    s.map(|v| v.trim().to_string()).filter(|v| !v.is_empty())
}

#[tauri::command]
pub async fn claude_start(
    state: State<'_, ClaudeState>,
    session_id: String,
    cwd: Option<String>,
    model: Option<String>,
    permission_mode: Option<String>,
    program: Option<String>,
) -> Result<StartReply, String> {
    let req = StartRequest {
        cwd: non_empty(cwd).map(PathBuf::from),
        model: non_empty(model),
        permission_mode: non_empty(permission_mode),
        program: non_empty(program),
    };
    // 여기서 정한 실행 파일은 나중에 claude_send 가 저절로 켤 때도 쓴다
    if req.program.is_some() {
        state.0.set_default_program(req.program.clone());
    }
    state.0.start(&session_id, req).await
}

#[tauri::command]
pub async fn claude_send(state: State<'_, ClaudeState>, session_id: String, text: String) -> Result<(), String> {
    state.0.send(&session_id, &text).await
}

#[tauri::command]
pub async fn claude_stop(state: State<'_, ClaudeState>, session_id: String) -> Result<(), String> {
    state.0.stop(&session_id).await;
    Ok(())
}

#[tauri::command]
pub async fn claude_status(state: State<'_, ClaudeState>, session_id: String) -> Result<Status, String> {
    Ok(state.0.status(&session_id).await)
}

/// 앱이 꺼질 때 켜 둔 클로드 코드를 모두 끈다(윈도우에서 node 가 남지 않게).
pub fn stop_all(app: &AppHandle) {
    if let Some(st) = app.try_state::<ClaudeState>() {
        let m = st.0.clone();
        tauri::async_runtime::block_on(async move { m.stop_all().await });
    }
}
