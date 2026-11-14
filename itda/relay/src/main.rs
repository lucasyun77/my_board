//! 잇다 중계 서버 실행 파일.
//! 사용법: itda-relay [--port 7878] [--data 잇다자료.json] [--ui 화면폴더] [--demo] [--key 모임암호]

use itda_relay::{agent::AgentCfg, load_demo, load_state, router, spawn_background, Hub};
use std::path::PathBuf;

#[tokio::main]
async fn main() {
    let args: Vec<String> = std::env::args().collect();
    let get = |name: &str| args.iter().position(|a| a == name).and_then(|i| args.get(i + 1)).cloned();
    let port: u16 = get("--port").and_then(|p| p.parse().ok()).unwrap_or(7878);
    let data = PathBuf::from(get("--data").unwrap_or_else(|| "itda-data.json".into()));
    let ui = PathBuf::from(get("--ui").unwrap_or_else(|| {
        // 실행 파일 옆 ui 폴더 → 소스 폴더 순서로 찾는다
        let near = std::env::current_exe().ok().and_then(|p| p.parent().map(|d| d.join("ui")));
        match near { Some(p) if p.exists() => p.to_string_lossy().into(), _ => "app/ui".into() }
    }));
    let key = get("--key").or_else(|| std::env::var("ITDA_TEAM_KEY").ok()).unwrap_or_default();

    let mut state = load_state(&data);
    if args.iter().any(|a| a == "--demo") && state.projects.is_empty() {
        if let Some(d) = load_demo(&ui) { state = d; println!("시연 자료를 불러왔습니다."); }
    }
    let cfg = AgentCfg::default();
    println!("잇다 중계 서버 시작: 포트 {port}, 자료 {}, 화면 {}", data.display(), ui.display());
    println!("AI 본부장 클로드 연결: {}", if cfg.api_key.is_some() { "켜짐" } else { "꺼짐(규칙으로 답함)" });
    if key.is_empty() { println!("주의: 모임 암호가 없습니다. 사내망 시험용으로만 쓰세요(--key 로 지정)."); }

    let hub = Hub::new(state, cfg, Some(data), key);
    spawn_background(hub.clone());
    let app = router(hub, ui);
    let listener = tokio::net::TcpListener::bind(("0.0.0.0", port)).await.expect("포트를 열 수 없습니다");
    axum::serve(listener, app).await.unwrap();
}
