//! 회사 구글 계정 로그인(구글 「데스크톱 앱」 방식, 설치형 앱용).
//!
//! 순서
//!  1) 이 컴퓨터 안(127.0.0.1)의 빈 포트에 잠깐 받는 주소를 연다.
//!  2) 코드 확인 값(PKCE, S256)과 보안 확인 값(state)을 만든다.
//!  3) 기본 브라우저로 구글 로그인 창을 연다.
//!  4) 브라우저가 받는 주소로 돌아오면 code 와 state 를 확인하고 안내 페이지를 보여 준다.
//!  5) code 를 구글 토큰 창구에 보내 신분증(ID 토큰)과 새로 고침 토큰으로 바꾼다.
//!
//! 이 묶음은 타우리에 기대지 않는다. 그래서 웹뷰 라이브러리가 없는 리눅스에서도 `cargo test` 로 시험할 수 있다.
//! 신분증의 서명 검사는 중계 서버가 한다. 여기서는 화면에 보여 줄 이메일·이름만 읽는다.

use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::mpsc;

pub const AUTH_URL: &str = "https://accounts.google.com/o/oauth2/v2/auth";
pub const TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
pub const SCOPE: &str = "openid email profile";
/// 브라우저에서 이 시간 안에 돌아오지 않으면 로그인을 그만둔다
pub const LOGIN_TIMEOUT: Duration = Duration::from_secs(5 * 60);

pub const MSG_TIMEOUT: &str = "로그인 시간이 지났습니다. 다시 시도해 주세요.";
pub const MSG_STATE: &str = "보안 확인 값이 맞지 않아 로그인을 거부했습니다. 다시 시도해 주세요.";

/// 로그인 결과(화면에 그대로 넘긴다)
///
/// 주의: 새로 고침 토큰은 지금은 화면이 들고 있는다.
/// 나중에 윈도우 자격 증명 보관소로 옮겨야 함(화면·파일에 남기지 않도록).
#[derive(Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SignIn {
    pub id_token: String,
    /// 구글은 처음 동의할 때만 새로 고침 토큰을 준다. 받지 못하면 빈 문자열이다.
    pub refresh_token: String,
    /// 신분증 만료 시각(초 단위 유닉스 시각)
    pub expires_at: u64,
    pub email: String,
    pub name: String,
}

/// 새로 고침 결과
#[derive(Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Refreshed {
    pub id_token: String,
    pub expires_at: u64,
}

// ───────────── 코드 확인 값(PKCE)·보안 확인 값(state) ─────────────

#[derive(Debug, Clone)]
pub struct Pkce {
    /// 우리만 아는 원래 값(토큰 교환 때 보냄)
    pub verifier: String,
    /// 원래 값의 SHA-256 을 base64(주소용, 채움 없음)로 바꾼 값(로그인 창 주소에 실음)
    pub challenge: String,
}

fn random_text(n_bytes: usize) -> String {
    let mut buf = vec![0u8; n_bytes];
    getrandom::getrandom(&mut buf).expect("운영체제 난수를 얻지 못했습니다");
    URL_SAFE_NO_PAD.encode(buf)
}

pub fn challenge_for(verifier: &str) -> String {
    URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()))
}

/// 32바이트 난수 → 43글자 원래 값(규격 범위 43~128글자, 주소에 써도 되는 글자만)
pub fn new_pkce() -> Pkce {
    let verifier = random_text(32);
    let challenge = challenge_for(&verifier);
    Pkce { verifier, challenge }
}

pub fn new_state() -> String {
    random_text(24)
}

/// 구글 로그인 창 주소
pub fn auth_url(client_id: &str, redirect_uri: &str, challenge: &str, state: &str, domain: &str) -> String {
    let mut params = vec![
        ("client_id", client_id),
        ("redirect_uri", redirect_uri),
        ("response_type", "code"),
        ("scope", SCOPE),
        ("code_challenge", challenge),
        ("code_challenge_method", "S256"),
        ("state", state),
        ("access_type", "offline"),
        // 로그인 창은 새로 고침 토큰이 없을 때만 열리므로 매번 동의를 받아 새로 고침 토큰을 확실히 받는다
        ("prompt", "select_account consent"),
    ];
    let domain = domain.trim();
    if !domain.is_empty() {
        params.push(("hd", domain));
    }
    url::Url::parse_with_params(AUTH_URL, &params).expect("고정 주소").to_string()
}

// ───────────── 브라우저가 돌아온 요청 읽기 ─────────────

/// 받는 주소로 들어온 요청 한 줄(예: `GET /?code=..&state=.. HTTP/1.1`)을 해석한다.
/// - `Ok(Some(code))`: 정상
/// - `Ok(None)`: 로그인과 상관없는 요청(아이콘 요청 등) — 무시하고 계속 기다린다
/// - `Err(..)`: 보안 확인 값 불일치, 사용자가 취소함 등 — 로그인 실패
pub fn parse_callback(request_line: &str, expected_state: &str) -> Result<Option<String>, String> {
    let mut parts = request_line.split_whitespace();
    let (Some(method), Some(target)) = (parts.next(), parts.next()) else { return Ok(None) };
    if method != "GET" {
        return Ok(None);
    }
    let (path, query) = target.split_once('?').unwrap_or((target, ""));
    if path != "/" {
        return Ok(None);
    }
    let (mut code, mut state, mut error) = (None, None, None);
    for (k, v) in url::form_urlencoded::parse(query.as_bytes()) {
        match k.as_ref() {
            "code" => code = Some(v.into_owned()),
            "state" => state = Some(v.into_owned()),
            "error" => error = Some(v.into_owned()),
            _ => {}
        }
    }
    if code.is_none() && error.is_none() {
        return Ok(None);
    }
    // 우리가 만든 로그인 창에서 돌아온 것이 맞는지 먼저 확인(다른 곳에서 꾸민 요청 거부)
    if state.as_deref() != Some(expected_state) {
        return Err(MSG_STATE.into());
    }
    if let Some(e) = error {
        return Err(if e == "access_denied" {
            "로그인을 취소했습니다.".into()
        } else {
            format!("구글 로그인에 실패했습니다(사유: {e}).")
        });
    }
    match code {
        Some(c) if !c.is_empty() => Ok(Some(c)),
        _ => Err("구글이 로그인 확인 값을 보내지 않았습니다.".into()),
    }
}

fn page(title: &str, body: &str) -> String {
    format!(
        "<!doctype html><html lang=\"ko\"><head><meta charset=\"utf-8\"><title>아이센스투게더</title>\
<style>body{{font-family:'Malgun Gothic',sans-serif;background:#f6f7f9;color:#222;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}}\
div{{background:#fff;border-radius:12px;padding:32px 40px;box-shadow:0 2px 12px rgba(0,0,0,.08);text-align:center}}\
h1{{font-size:20px;margin:0 0 12px}}p{{margin:0;color:#555}}</style></head>\
<body><div><h1>{title}</h1><p>{body}</p></div></body></html>"
    )
}

pub fn success_page() -> String {
    page("로그인되었습니다", "이 창을 닫고 아이센스투게더로 돌아가세요.")
}

fn fail_page(reason: &str) -> String {
    page("로그인하지 못했습니다", &format!("{reason} 이 창을 닫고 아이센스투게더에서 다시 시도해 주세요."))
}

fn http_response(status: &str, html: &str) -> String {
    format!(
        "HTTP/1.1 {status}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n{html}",
        html.len()
    )
}

/// 연결 하나를 읽고 답한다. 로그인과 상관없는 요청이면 `None`.
async fn handle_conn(mut sock: TcpStream, state: &str) -> Option<Result<String, String>> {
    let mut buf = Vec::with_capacity(2048);
    let mut chunk = [0u8; 2048];
    // 브라우저가 미리 열어 두고 아무것도 보내지 않는 연결이 있으므로 연결마다 따로 시간 제한
    let read = tokio::time::timeout(Duration::from_secs(30), async {
        loop {
            let n = sock.read(&mut chunk).await.ok()?;
            if n == 0 {
                break;
            }
            buf.extend_from_slice(&chunk[..n]);
            if buf.windows(4).any(|w| w == b"\r\n\r\n") || buf.len() > 16 * 1024 {
                break;
            }
        }
        Some(())
    })
    .await;
    if !matches!(read, Ok(Some(()))) {
        return None;
    }
    let text = String::from_utf8_lossy(&buf);
    let first = text.lines().next().unwrap_or("");
    let result = parse_callback(first, state);
    let reply = match &result {
        Ok(Some(_)) => http_response("200 OK", &success_page()),
        Ok(None) => http_response("404 Not Found", &page("찾을 수 없음", "")),
        Err(e) => http_response("400 Bad Request", &fail_page(e)),
    };
    let _ = sock.write_all(reply.as_bytes()).await;
    let _ = sock.shutdown().await;
    match result {
        Ok(None) => None,
        Ok(Some(c)) => Some(Ok(c)),
        Err(e) => Some(Err(e)),
    }
}

/// 받는 주소에서 브라우저가 돌아오기를 기다린다(시간 제한은 부르는 쪽이 건다).
pub async fn wait_for_code(listener: TcpListener, state: String) -> Result<String, String> {
    let (tx, mut rx) = mpsc::channel::<Result<String, String>>(1);
    let state = std::sync::Arc::new(state);
    loop {
        tokio::select! {
            got = rx.recv() => {
                return got.unwrap_or_else(|| Err("받는 주소가 닫혔습니다.".into()));
            }
            acc = listener.accept() => {
                let (sock, _) = acc.map_err(|e| format!("받는 주소에서 오류가 났습니다: {e}"))?;
                let (tx, state) = (tx.clone(), state.clone());
                tokio::spawn(async move {
                    if let Some(r) = handle_conn(sock, &state).await {
                        let _ = tx.send(r).await;
                    }
                });
            }
        }
    }
}

// ───────────── 토큰 창구 응답·신분증 본문 ─────────────

#[derive(Deserialize, Debug, Default)]
pub struct TokenResponse {
    #[serde(default)]
    pub id_token: Option<String>,
    #[serde(default)]
    pub refresh_token: Option<String>,
    #[serde(default)]
    pub expires_in: Option<u64>,
    #[serde(default)]
    pub error: Option<String>,
    #[serde(default)]
    pub error_description: Option<String>,
}

/// 구글 토큰 창구의 응답 본문을 해석한다. 신분증이 없거나 오류면 한국어 오류 문장.
pub fn parse_token_response(body: &str) -> Result<TokenResponse, String> {
    let r: TokenResponse = serde_json::from_str(body)
        .map_err(|_| format!("구글 토큰 응답을 읽지 못했습니다: {}", body.chars().take(200).collect::<String>()))?;
    if let Some(e) = &r.error {
        let why = match e.as_str() {
            "invalid_grant" => "로그인 확인 값이 만료되었거나 이미 쓰였습니다(새로 고침 토큰이면 다시 로그인해야 합니다)",
            "invalid_client" | "unauthorized_client" => "앱 번호나 앱 비밀 값이 맞지 않습니다(관리자에게 문의)",
            _ => "구글이 요청을 거절했습니다",
        };
        let desc = r.error_description.as_deref().unwrap_or("");
        return Err(format!("{why}. (구글 사유: {e} {desc})").replace(" )", ")"));
    }
    match &r.id_token {
        Some(t) if !t.is_empty() => Ok(r),
        _ => Err("구글 응답에 신분증(ID 토큰)이 없습니다.".into()),
    }
}

/// 신분증 본문 중 표시에 쓰는 것만
#[derive(Deserialize, Debug, Default, PartialEq)]
pub struct IdClaims {
    #[serde(default)]
    pub email: String,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub exp: u64,
    #[serde(default)]
    pub hd: Option<String>,
}

/// 신분증(점으로 나뉜 세 덩어리) 가운데 본문을 base64 로 풀어 읽는다. 서명은 검사하지 않는다(서버가 함).
pub fn read_id_token(id_token: &str) -> Result<IdClaims, String> {
    let body = id_token.split('.').nth(1).ok_or("신분증 형식이 아닙니다.")?;
    let raw = URL_SAFE_NO_PAD
        .decode(body.trim_end_matches('='))
        .map_err(|_| "신분증 본문을 풀지 못했습니다.".to_string())?;
    serde_json::from_slice(&raw).map_err(|_| "신분증 본문을 읽지 못했습니다.".to_string())
}

fn now_secs() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

/// 만료 시각: 신분증의 exp 를 우선, 없으면 지금 + expires_in(그것도 없으면 1시간)
pub fn expires_at(claims: &IdClaims, expires_in: Option<u64>) -> u64 {
    if claims.exp > 0 {
        claims.exp
    } else {
        now_secs() + expires_in.unwrap_or(3600)
    }
}

async fn post_token(form: &[(&str, &str)]) -> Result<TokenResponse, String> {
    let resp = reqwest::Client::new()
        .post(TOKEN_URL)
        .form(form)
        .timeout(Duration::from_secs(20))
        .send()
        .await
        .map_err(|e| format!("구글 토큰 창구에 연결하지 못했습니다(인터넷 연결을 확인해 주세요): {e}"))?;
    let body = resp.text().await.map_err(|e| format!("구글 토큰 응답을 받지 못했습니다: {e}"))?;
    parse_token_response(&body)
}

// ───────────── 바깥에 내놓는 두 기능 ─────────────

/// 로그인 전체 과정. `open` 은 주소를 기본 브라우저로 여는 함수(보통 [`open_browser`]).
pub async fn sign_in(
    client_id: &str,
    client_secret: &str,
    domain: &str,
    open: impl FnOnce(&str) -> Result<(), String>,
) -> Result<SignIn, String> {
    if client_id.trim().is_empty() {
        return Err("앱 번호(클라이언트 아이디)가 비어 있습니다. 중계 서버 설정을 확인해 주세요.".into());
    }
    let listener = TcpListener::bind(("127.0.0.1", 0))
        .await
        .map_err(|e| format!("로그인용 받는 주소를 열지 못했습니다: {e}"))?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    let redirect_uri = format!("http://127.0.0.1:{port}");
    let pkce = new_pkce();
    let state = new_state();
    open(&auth_url(client_id, &redirect_uri, &pkce.challenge, &state, domain))?;

    let code = tokio::time::timeout(LOGIN_TIMEOUT, wait_for_code(listener, state))
        .await
        .map_err(|_| MSG_TIMEOUT.to_string())??;

    let tr = post_token(&[
        ("grant_type", "authorization_code"),
        ("code", &code),
        ("client_id", client_id),
        ("client_secret", client_secret),
        ("redirect_uri", &redirect_uri),
        ("code_verifier", &pkce.verifier),
    ])
    .await?;
    let id_token = tr.id_token.clone().unwrap_or_default();
    let claims = read_id_token(&id_token)?;
    let domain = domain.trim();
    if !domain.is_empty() && !claims.hd.as_deref().is_some_and(|h| h.eq_ignore_ascii_case(domain)) {
        return Err(format!("회사 계정({domain})이 아닙니다. 회사 구글 계정으로 다시 로그인해 주세요."));
    }
    Ok(SignIn {
        expires_at: expires_at(&claims, tr.expires_in),
        refresh_token: tr.refresh_token.unwrap_or_default(),
        email: claims.email,
        name: claims.name,
        id_token,
    })
}

/// 새로 고침 토큰으로 새 신분증을 받는다.
pub async fn refresh(client_id: &str, client_secret: &str, refresh_token: &str) -> Result<Refreshed, String> {
    if refresh_token.trim().is_empty() {
        return Err("새로 고침 토큰이 없습니다. 다시 로그인해 주세요.".into());
    }
    let tr = post_token(&[
        ("grant_type", "refresh_token"),
        ("refresh_token", refresh_token),
        ("client_id", client_id),
        ("client_secret", client_secret),
    ])
    .await?;
    let id_token = tr.id_token.clone().unwrap_or_default();
    let claims = read_id_token(&id_token)?;
    Ok(Refreshed { expires_at: expires_at(&claims, tr.expires_in), id_token })
}

/// 주소를 시스템 기본 브라우저로 연다(부품을 더 들이지 않고 운영체제 기능을 쓴다).
pub fn open_browser(url: &str) -> Result<(), String> {
    #[cfg(windows)]
    let r = {
        use std::os::windows::process::CommandExt;
        // 명령창(cmd)을 거치지 않으므로 주소 속 & 기호가 깨지지 않는다
        std::process::Command::new("rundll32")
            .args(["url.dll,FileProtocolHandler", url])
            .creation_flags(0x0800_0000) // 검은 창을 띄우지 않음
            .spawn()
    };
    #[cfg(target_os = "macos")]
    let r = std::process::Command::new("open").arg(url).spawn();
    #[cfg(all(unix, not(target_os = "macos")))]
    let r = std::process::Command::new("xdg-open").arg(url).spawn();
    r.map(|_| ()).map_err(|e| format!("브라우저를 열지 못했습니다: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pkce_규격_예시와_같다() {
        // 규격 문서(RFC 7636 부록 B)의 예시 값
        assert_eq!(
            challenge_for("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
            "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
        );
    }

    #[test]
    fn pkce_새_값은_규격_범위이고_매번_다르다() {
        let a = new_pkce();
        let b = new_pkce();
        assert!(a.verifier.len() >= 43 && a.verifier.len() <= 128);
        assert!(a.verifier.chars().all(|c| c.is_ascii_alphanumeric() || "-._~".contains(c)));
        assert_eq!(a.challenge, challenge_for(&a.verifier));
        assert_ne!(a.verifier, b.verifier);
        assert_ne!(new_state(), new_state());
    }

    #[test]
    fn 로그인_창_주소에_필요한_값이_다_있다() {
        let u = auth_url("앱번호.apps", "http://127.0.0.1:5555", "도전값", "상태값", "isens.camp");
        let parsed = url::Url::parse(&u).unwrap();
        assert_eq!(parsed.host_str(), Some("accounts.google.com"));
        let q: std::collections::HashMap<_, _> = parsed.query_pairs().into_owned().collect();
        assert_eq!(q["client_id"], "앱번호.apps");
        assert_eq!(q["redirect_uri"], "http://127.0.0.1:5555");
        assert_eq!(q["response_type"], "code");
        assert_eq!(q["scope"], "openid email profile");
        assert_eq!(q["code_challenge"], "도전값");
        assert_eq!(q["code_challenge_method"], "S256");
        assert_eq!(q["state"], "상태값");
        assert_eq!(q["access_type"], "offline");
        assert_eq!(q["prompt"], "select_account consent");
        assert_eq!(q["hd"], "isens.camp");
        // 도메인이 비면 hd 를 싣지 않는다
        let u2 = auth_url("a", "http://127.0.0.1:1", "c", "s", " ");
        assert!(!u2.contains("hd="));
    }

    #[test]
    fn 받는_주소에서_code_와_state_를_읽는다() {
        let r = parse_callback("GET /?state=abc&code=4%2F0Adeu5B&scope=email+openid HTTP/1.1", "abc");
        assert_eq!(r, Ok(Some("4/0Adeu5B".into())));
    }

    #[test]
    fn 상관없는_요청은_무시한다() {
        assert_eq!(parse_callback("GET /favicon.ico HTTP/1.1", "abc"), Ok(None));
        assert_eq!(parse_callback("GET / HTTP/1.1", "abc"), Ok(None));
        assert_eq!(parse_callback("POST /?code=x&state=abc HTTP/1.1", "abc"), Ok(None));
        assert_eq!(parse_callback("", "abc"), Ok(None));
    }

    #[test]
    fn state_가_다르거나_없으면_거부한다() {
        assert_eq!(parse_callback("GET /?code=x&state=evil HTTP/1.1", "abc"), Err(MSG_STATE.into()));
        assert_eq!(parse_callback("GET /?code=x HTTP/1.1", "abc"), Err(MSG_STATE.into()));
        // 취소 응답이라도 state 가 다르면 같은 거부
        assert_eq!(parse_callback("GET /?error=access_denied&state=evil HTTP/1.1", "abc"), Err(MSG_STATE.into()));
    }

    #[test]
    fn 사용자가_취소하면_알린다() {
        let r = parse_callback("GET /?error=access_denied&state=abc HTTP/1.1", "abc");
        assert_eq!(r, Err("로그인을 취소했습니다.".into()));
    }

    fn fake_id_token(body: &str) -> String {
        format!("eyJhbGciOiJSUzI1NiJ9.{}.서명", URL_SAFE_NO_PAD.encode(body))
    }

    #[test]
    fn 토큰_응답을_해석한다() {
        let idt = fake_id_token(r#"{"email":"hong@isens.camp","name":"홍길동","exp":1800000000,"hd":"isens.camp"}"#);
        let body = format!(
            r#"{{"access_token":"ya29.x","expires_in":3599,"refresh_token":"1//rt","scope":"openid email","token_type":"Bearer","id_token":"{idt}"}}"#
        );
        let r = parse_token_response(&body).unwrap();
        assert_eq!(r.id_token.as_deref(), Some(idt.as_str()));
        assert_eq!(r.refresh_token.as_deref(), Some("1//rt"));
        assert_eq!(r.expires_in, Some(3599));
        let c = read_id_token(&idt).unwrap();
        assert_eq!(c.email, "hong@isens.camp");
        assert_eq!(c.name, "홍길동");
        assert_eq!(c.hd.as_deref(), Some("isens.camp"));
        assert_eq!(expires_at(&c, Some(3599)), 1_800_000_000);
        // exp 가 없으면 지금 + expires_in
        let c2 = IdClaims::default();
        let at = expires_at(&c2, Some(100));
        assert!(at >= now_secs() + 99 && at <= now_secs() + 101);
    }

    #[test]
    fn 토큰_오류_응답은_한국어_오류() {
        let e = parse_token_response(r#"{"error":"invalid_grant","error_description":"Bad Request"}"#).unwrap_err();
        assert!(e.contains("만료") && e.contains("invalid_grant"), "{e}");
        let e = parse_token_response(r#"{"access_token":"x"}"#).unwrap_err();
        assert!(e.contains("신분증"), "{e}");
        assert!(parse_token_response("<html>").is_err());
        assert!(read_id_token("점이없는값").is_err());
    }

    #[tokio::test]
    async fn 받는_주소가_브라우저_요청에_답하고_code_를_돌려준다() {
        let l = TcpListener::bind(("127.0.0.1", 0)).await.unwrap();
        let port = l.local_addr().unwrap().port();
        let task = tokio::spawn(wait_for_code(l, "abc".into()));

        // 아무것도 보내지 않는 미리 열린 연결이 있어도 막히지 않아야 한다
        let _idle = TcpStream::connect(("127.0.0.1", port)).await.unwrap();
        // 아이콘 요청은 404
        let mut s = TcpStream::connect(("127.0.0.1", port)).await.unwrap();
        s.write_all(b"GET /favicon.ico HTTP/1.1\r\nHost: x\r\n\r\n").await.unwrap();
        let mut out = String::new();
        s.read_to_string(&mut out).await.unwrap();
        assert!(out.starts_with("HTTP/1.1 404"));

        let mut s = TcpStream::connect(("127.0.0.1", port)).await.unwrap();
        s.write_all(b"GET /?code=abc123&state=abc HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n").await.unwrap();
        let mut out = String::new();
        s.read_to_string(&mut out).await.unwrap();
        assert!(out.starts_with("HTTP/1.1 200"));
        assert!(out.contains("로그인되었습니다") && out.contains("이 창을 닫고 아이센스투게더로 돌아가세요"));

        let code = tokio::time::timeout(Duration::from_secs(5), task).await.unwrap().unwrap();
        assert_eq!(code, Ok("abc123".into()));
    }

    #[tokio::test]
    async fn 받는_주소가_state_불일치를_거부한다() {
        let l = TcpListener::bind(("127.0.0.1", 0)).await.unwrap();
        let port = l.local_addr().unwrap().port();
        let task = tokio::spawn(wait_for_code(l, "abc".into()));
        let mut s = TcpStream::connect(("127.0.0.1", port)).await.unwrap();
        s.write_all(b"GET /?code=abc123&state=evil HTTP/1.1\r\n\r\n").await.unwrap();
        let mut out = String::new();
        s.read_to_string(&mut out).await.unwrap();
        assert!(out.starts_with("HTTP/1.1 400") && out.contains("로그인하지 못했습니다"));
        let r = tokio::time::timeout(Duration::from_secs(5), task).await.unwrap().unwrap();
        assert_eq!(r, Err(MSG_STATE.into()));
    }

    #[tokio::test(start_paused = true)]
    async fn 오분_안에_돌아오지_않으면_시간_초과() {
        // 브라우저 여는 함수는 아무것도 하지 않는다(실제 구글 접속 없음). 시계를 멈춘 채 5분을 건너뛴다.
        let r = sign_in("앱번호", "비밀", "", |_| Ok(())).await;
        assert_eq!(r, Err(MSG_TIMEOUT.into()));
    }
}
