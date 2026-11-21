//! 아이센스투게더 중계 서버 실행 파일.
//!
//! 시험용(사내망):
//!   itda-relay --port 7878 --data 자료.json [--demo] [--key 모임암호]
//! 본제품(회사 계정 + 데이터베이스 + 암호화):
//!   itda-relay --port 443 --db postgres://… --tls-cert cert.pem --tls-key key.pem
//!              --google-client-id … --allowed-domain 회사도메인 --admin 관리자이메일
//! 같은 값을 환경 변수로도 줄 수 있다(TOGETHER_DATABASE_URL, TOGETHER_GOOGLE_CLIENT_ID,
//! TOGETHER_GOOGLE_CLIENT_SECRET, TOGETHER_ALLOWED_DOMAIN, TOGETHER_ADMINS, ITDA_TEAM_KEY).

use itda_relay::{agent::AgentCfg, auth::{AuthMode, GoogleAuth}, load_demo, router, serve_tls, spawn_background, store::Store, Hub, VERSION};
use std::path::PathBuf;

#[tokio::main]
async fn main() {
    let args: Vec<String> = std::env::args().collect();
    let get = |name: &str| args.iter().position(|a| a == name).and_then(|i| args.get(i + 1)).cloned();
    let all = |name: &str| -> Vec<String> { args.windows(2).filter(|w| w[0] == name).map(|w| w[1].clone()).collect() };
    let env = |k: &str| std::env::var(k).ok().filter(|v| !v.is_empty());
    let list = |s: Option<String>| -> Vec<String> { s.map(|s| s.split(',').map(|x| x.trim().to_string()).filter(|x| !x.is_empty()).collect()).unwrap_or_default() };

    let port: u16 = get("--port").and_then(|p| p.parse().ok()).unwrap_or(7878);
    let ui = PathBuf::from(get("--ui").unwrap_or_else(|| {
        let near = std::env::current_exe().ok().and_then(|p| p.parent().map(|d| d.join("ui")));
        match near { Some(p) if p.exists() => p.to_string_lossy().into(), _ => "app/ui".into() }
    }));

    // 저장소: 데이터베이스 주소가 있으면 포스트그레스, 없으면 파일
    let store = match get("--db").or_else(|| env("TOGETHER_DATABASE_URL")) {
        Some(url) => match Store::postgres(&url).await {
            Ok(s) => s,
            Err(e) => { eprintln!("{e}"); std::process::exit(1); }
        },
        None => Store::File(PathBuf::from(get("--data").unwrap_or_else(|| "itda-data.json".into()))),
    };

    // 로그인 방식: 구글 앱 번호가 있으면 회사 계정, 없으면 시험용 모임 암호
    let client_ids = { let mut v = all("--google-client-id"); v.extend(list(env("TOGETHER_GOOGLE_CLIENT_ID"))); v };
    let auth = if client_ids.is_empty() {
        AuthMode::Open { team_key: get("--key").or_else(|| env("ITDA_TEAM_KEY")).unwrap_or_default() }
    } else {
        let mut domains = all("--allowed-domain");
        domains.extend(list(env("TOGETHER_ALLOWED_DOMAIN")));
        AuthMode::Google(GoogleAuth::new(client_ids, domains, get("--google-client-secret").or_else(|| env("TOGETHER_GOOGLE_CLIENT_SECRET")).unwrap_or_default()))
    };
    let mut admins = all("--admin");
    admins.extend(list(env("TOGETHER_ADMINS")));

    let mut state = store.load().await.unwrap_or_default();
    for m in state.members.iter_mut() { m.online = false; } // 다시 켜면 모두 접속 안 함에서 시작
    if args.iter().any(|a| a == "--demo") && state.projects.is_empty() {
        if let Some(d) = load_demo(&ui) { state = d; println!("시연 자료를 불러왔습니다."); }
    }
    let cfg = AgentCfg::default();
    let tls = match (get("--tls-cert"), get("--tls-key")) { (Some(c), Some(k)) => Some((PathBuf::from(c), PathBuf::from(k))), _ => None };

    println!("아이센스투게더 중계 서버 {VERSION} 시작: 포트 {port}, 저장 {}, 로그인 {}, 암호화 {}", store.label(), auth.label(), if tls.is_some() { "켜짐" } else { "꺼짐" });
    println!("AI 본부장 클로드 연결: {}", if cfg.api_key.is_some() { "켜짐" } else { "꺼짐(규칙으로 답함)" });
    if let AuthMode::Open { team_key } = &auth {
        println!("주의: 회사 계정 로그인이 꺼져 있습니다{}. 사내망 시험용으로만 쓰세요.", if team_key.is_empty() { "(모임 암호도 없음)" } else { "" });
    }
    if tls.is_none() { println!("주의: 암호화가 꺼져 있습니다. 회사 밖에서 접속하게 하려면 --tls-cert / --tls-key 를 주세요."); }

    let hub = Hub::new(state, cfg, store, auth, admins);
    spawn_background(hub.clone());
    let app = router(hub, ui);
    let addr = std::net::SocketAddr::from(([0, 0, 0, 0], port));
    let res = match tls {
        Some((c, k)) => serve_tls(addr, app, c, k).await,
        None => {
            let listener = tokio::net::TcpListener::bind(addr).await.expect("포트를 열 수 없습니다");
            axum::serve(listener, app).await
        }
    };
    if let Err(e) = res { eprintln!("중계 서버가 멈췄습니다: {e}"); std::process::exit(1); }
}
