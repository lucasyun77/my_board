//! 잇다 윈도우 데스크톱 앱.
//! 화면(app/ui)을 창에 띄우고, 화면이 부탁하면
//!  1) 이 컴퓨터에서 명령(터미널 방식) 또는 AI 명령(쉬운 채팅 방식, 기본 `claude -p`)을 실행해 출력을 돌려주고,
//!  2) 원하면 이 컴퓨터를 팀의 중계 서버로 켠다(팀장 컴퓨터 하나만 켜면 됨).
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::Serialize;
use std::process::Stdio;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::{AsyncBufReadExt, BufReader};

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Out {
    session_id: String,
    kind: String,
    text: String,
}

fn emit(app: &AppHandle, sid: &str, kind: &str, text: String) {
    let _ = app.emit("itda-out", Out { session_id: sid.into(), kind: kind.into(), text });
}

/// 명령 실행. 출력은 한 줄씩 "itda-out" 이벤트로 화면에 보낸다.
#[tauri::command]
async fn run_command(app: AppHandle, session_id: String, command: String) -> Result<(), String> {
    #[cfg(windows)]
    let mut cmd = {
        // 한국어 윈도우의 명령창 글자를 깨지지 않게 UTF-8 로 바꾼 뒤 실행
        let mut c = tokio::process::Command::new("cmd");
        c.args(["/C", &format!("chcp 65001>nul & {}", command)]);
        c.creation_flags(0x0800_0000); // 검은 창을 띄우지 않음
        c
    };
    #[cfg(not(windows))]
    let mut cmd = {
        let mut c = tokio::process::Command::new("sh");
        c.args(["-c", &command]);
        c
    };
    let mut child = cmd
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .stdin(Stdio::null())
        .spawn()
        .map_err(|e| format!("실행할 수 없습니다: {e}"))?;

    let out = child.stdout.take().unwrap();
    let err = child.stderr.take().unwrap();
    let (a1, s1) = (app.clone(), session_id.clone());
    let t1 = tokio::spawn(async move {
        let mut r = BufReader::new(out).split(b'\n');
        while let Ok(Some(line)) = r.next_segment().await {
            emit(&a1, &s1, "out", String::from_utf8_lossy(&line).trim_end().to_string());
        }
    });
    let (a2, s2) = (app.clone(), session_id.clone());
    let t2 = tokio::spawn(async move {
        let mut r = BufReader::new(err).split(b'\n');
        while let Ok(Some(line)) = r.next_segment().await {
            emit(&a2, &s2, "err", String::from_utf8_lossy(&line).trim_end().to_string());
        }
    });
    let status = child.wait().await.map_err(|e| e.to_string())?;
    let _ = t1.await;
    let _ = t2.await;
    emit(&app, &session_id, "sys", format!("끝남 (코드 {})", status.code().unwrap_or(-1)));
    Ok(())
}

#[derive(Serialize)]
struct Info {
    computer: String,
    user: String,
    lan_ip: String,
}

/// 이 컴퓨터 이름·사용자 이름·사내망 주소
#[tauri::command]
fn machine_info() -> Info {
    let computer = std::env::var("COMPUTERNAME").or_else(|_| std::env::var("HOSTNAME")).unwrap_or_else(|_| "내 컴퓨터".into());
    let user = std::env::var("USERNAME").or_else(|_| std::env::var("USER")).unwrap_or_default();
    // 바깥으로 실제 보내지 않고, 어떤 주소로 나가는지만 알아낸다
    let lan_ip = std::net::UdpSocket::bind("0.0.0.0:0")
        .and_then(|s| { s.connect("10.255.255.255:1")?; s.local_addr() })
        .map(|a| a.ip().to_string())
        .unwrap_or_else(|_| "127.0.0.1".into());
    Info { computer, user, lan_ip }
}

struct RelayState(Mutex<Option<u16>>);

/// 이 컴퓨터를 팀 중계 서버로 켠다. 이미 켜져 있으면 그 포트를 돌려준다.
#[tauri::command]
async fn start_relay(app: AppHandle, port: u16, key: String) -> Result<u16, String> {
    let st = app.state::<RelayState>();
    if let Some(p) = *st.0.lock().unwrap() { return Ok(p); }
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let data = dir.join("itda-data.json");
    let state = itda_relay::load_state(&data);
    let hub = itda_relay::Hub::new(state, itda_relay::agent::AgentCfg::default(), Some(data), key);
    itda_relay::spawn_background(hub.clone());
    let router = itda_relay::router(hub, dir.join("ui"));
    let listener = tokio::net::TcpListener::bind(("0.0.0.0", port)).await.map_err(|e| format!("포트 {port}를 열 수 없습니다: {e}"))?;
    tauri::async_runtime::spawn(async move { let _ = itda_relay_serve(listener, router).await; });
    *st.0.lock().unwrap() = Some(port);
    Ok(port)
}

async fn itda_relay_serve(listener: tokio::net::TcpListener, router: itda_relay::RouterType) -> std::io::Result<()> {
    itda_relay::serve(listener, router).await
}

fn main() {
    tauri::Builder::default()
        .manage(RelayState(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![run_command, machine_info, start_relay])
        .run(tauri::generate_context!())
        .expect("잇다를 시작하지 못했습니다");
}
