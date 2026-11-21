//! itda-claude 시험
//!  - 견본 신호 해석 순서
//!  - 가짜 `claude` 대본으로 켜기·보내기·사건 수신·끄기·연결표 저장·이어가기
//!  - 「실제」 시험: 환경 변수 ITDA_REAL_CLAUDE=1 일 때만 진짜 클로드 코드로 돈다

use itda_claude::*;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::Duration;

fn fixture() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../fixtures/claude-stream-sample.jsonl")
}

const SAMPLE_ID: &str = "f3dd7940-4fb4-4f1a-ac55-71da5f24e05c";

#[test]
fn 견본_해석_순서() {
    let body = std::fs::read_to_string(fixture()).unwrap();
    let evs: Vec<Event> = body.lines().flat_map(parse_line).collect();
    let kinds: Vec<(Kind, Option<&str>)> = evs.iter().map(|e| (e.kind, e.tool.as_deref())).collect();
    assert_eq!(
        kinds,
        vec![
            (Kind::Started, None),
            (Kind::Tool, Some("Bash")),
            (Kind::Denied, Some("Bash")),
            (Kind::ToolResult, None),
            (Kind::Tool, Some("Write")),
            (Kind::ToolResult, None),
            (Kind::Text, None),
            (Kind::Result, None),
        ]
    );
    assert_eq!(evs[0].claude_session_id.as_deref(), Some(SAMPLE_ID));
    assert!(evs[1].text.starts_with("cd C:/work/demo"));
    assert!(evs[1].text.chars().count() <= 200);
    assert!(evs[2].text.starts_with("Compound command contains cd"));
    assert_eq!(evs[3].is_error, Some(true));
    assert!(evs[3].text.chars().count() <= 300);
    assert_eq!(evs[4].text, "C:/work/demo/hello.txt");
    assert_eq!(evs[5].is_error, Some(false));
    assert!(evs[6].text.contains("안녕"));
    assert_eq!(evs[7].text, "끝");
    assert_eq!(evs[7].is_error, Some(false));
    assert!((evs[7].cost_usd.unwrap() - 0.01193765).abs() < 1e-9);
    // 화면에 가는 모양
    assert_eq!(
        serde_json::to_value(&evs[2]).unwrap(),
        serde_json::json!({"kind":"denied","tool":"Bash","text":evs[2].text})
    );
}

// ───────────── 가짜 클로드 ─────────────

struct Fake {
    dir: PathBuf,
    script: PathBuf,
}

/// 견본을 그대로 내보내는 가짜 `claude` 대본을 만든다.
///  - 켜지면 받은 인자를 작업 폴더의 args.txt 에 적고, 곧바로 한 줄을 내보낸다(진짜처럼).
///  - 표준 입력 한 줄마다 received.txt 에 적고 견본 전체를 내보낸다.
///  - `--resume 없는대화` 이면 진짜처럼 오류를 내고 바로 끝난다.
fn fake(name: &str) -> Fake {
    use std::os::unix::fs::PermissionsExt;
    let dir = std::env::temp_dir().join(format!("itda-claude-test-{}-{}", name, std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    let script = dir.join("claude");
    let body = format!(
        r#"#!/bin/sh
printf '%s\n' "$*" >> args.txt
case "$*" in *"--resume 없는대화"*)
  echo "No conversation found with session ID: 없는대화" >&2
  echo '{{"type":"result","subtype":"error_during_execution","is_error":true,"total_cost_usd":0,"errors":["No conversation found with session ID: 없는대화"]}}'
  exit 1;;
esac
echo '{{"type":"active_goal","value":null}}'
echo "가짜 클로드 표준 오류" >&2
while IFS= read -r line; do
  printf '%s\n' "$line" >> received.txt
  cat '{}'
done
exit 0
"#,
        fixture().canonicalize().unwrap().display()
    );
    std::fs::write(&script, body).unwrap();
    std::fs::set_permissions(&script, std::fs::Permissions::from_mode(0o755)).unwrap();
    Fake { dir, script }
}

type Log = Arc<Mutex<Vec<(String, Event)>>>;

fn manager(f: &Fake) -> (Manager, Log) {
    let log: Log = Arc::new(Mutex::new(vec![]));
    let l2 = log.clone();
    let m = Manager::new(
        SessionMap::load(f.dir.join("claude-sessions.json")),
        f.dir.join("작업"),
        Arc::new(move |sid: &str, ev: Event| l2.lock().unwrap().push((sid.to_string(), ev))),
    );
    m.set_default_program(Some(f.script.to_string_lossy().into()));
    (m, log)
}

async fn wait_for(log: &Log, kind: Kind, count: usize) -> Vec<Event> {
    for _ in 0..200 {
        {
            let l = log.lock().unwrap();
            if l.iter().filter(|(_, e)| e.kind == kind).count() >= count {
                return l.iter().map(|(_, e)| e.clone()).collect();
            }
        }
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
    panic!("기다린 사건이 오지 않았습니다: {:?} {}개, 받은 것: {:?}", kind, count, log.lock().unwrap());
}

fn screen_kinds(evs: &[Event]) -> Vec<Kind> {
    evs.iter().map(|e| e.kind).filter(|k| *k != Kind::Error).collect()
}

#[tokio::test(flavor = "multi_thread")]
async fn 가짜_클로드로_켜기_보내기_끄기_이어가기() {
    let f = fake("main");
    let (m, log) = manager(&f);

    // 켜기: 작업 폴더를 만들고, 새 대화이므로 번호는 아직 없다
    let r = m.start("세션1", StartRequest::default()).await.unwrap();
    assert_eq!(r, StartReply { claude_session_id: None, resumed: false });
    let cwd = f.dir.join("작업").join("세션1");
    assert!(cwd.is_dir());
    // 이미 켜져 있으면 그대로
    assert_eq!(m.start("세션1", StartRequest::default()).await.unwrap(), r);
    assert!(m.status("세션1").await.running);

    // 보내기 → 사건 수신
    m.send("세션1", "안녕\n여러 줄").await.unwrap();
    let evs = wait_for(&log, Kind::Result, 1).await;
    assert_eq!(
        screen_kinds(&evs),
        vec![Kind::Started, Kind::Tool, Kind::Denied, Kind::ToolResult, Kind::Tool, Kind::ToolResult, Kind::Text, Kind::Result]
    );
    assert!(log.lock().unwrap().iter().all(|(s, _)| s == "세션1"));
    assert!(evs.iter().any(|e| e.kind == Kind::Error && e.text == "가짜 클로드 표준 오류"));
    let st = m.status("세션1").await;
    assert_eq!(st, Status { running: true, claude_session_id: Some(SAMPLE_ID.into()) });

    // 연결표 저장
    let map = SessionMap::load(f.dir.join("claude-sessions.json"));
    assert_eq!(map.get("세션1").unwrap().claude_session_id, SAMPLE_ID);
    assert_eq!(map.get("세션1").unwrap().cwd.as_deref(), Some(cwd.to_str().unwrap()));

    // 두 번째 메시지: 같은 번호이므로 started 는 다시 오지 않는다
    m.send("세션1", "둘째").await.unwrap();
    let evs = wait_for(&log, Kind::Result, 2).await;
    assert_eq!(evs.iter().filter(|e| e.kind == Kind::Started).count(), 1);
    let received = std::fs::read_to_string(cwd.join("received.txt")).unwrap();
    let lines: Vec<serde_json::Value> = received.lines().map(|l| serde_json::from_str(l).unwrap()).collect();
    assert_eq!(lines.len(), 2);
    assert_eq!(lines[0]["message"]["content"], "안녕\n여러 줄");
    assert_eq!(lines[0]["type"], "user");

    // 끄기 → exit
    m.stop("세션1").await;
    let evs = wait_for(&log, Kind::Exit, 1).await;
    assert_eq!(evs.last().unwrap().kind, Kind::Exit);
    assert_eq!(m.status("세션1").await, Status { running: false, claude_session_id: Some(SAMPLE_ID.into()) });

    // 앱을 다시 켠 셈: 연결표를 불러 --resume 으로 이어 간다
    let (m2, _log2) = manager(&f);
    let r = m2.start("세션1", StartRequest { model: Some("claude-haiku-5-5".into()), ..Default::default() }).await.unwrap();
    assert_eq!(r, StartReply { claude_session_id: Some(SAMPLE_ID.into()), resumed: true });
    let args = std::fs::read_to_string(cwd.join("args.txt")).unwrap();
    let last = args.lines().last().unwrap();
    assert_eq!(
        last,
        format!("-p --input-format stream-json --output-format stream-json --verbose --model claude-haiku-5-5 --permission-mode acceptEdits --resume {SAMPLE_ID}")
    );
    m2.stop_all().await;
    let _ = std::fs::remove_dir_all(&f.dir);
}

#[tokio::test(flavor = "multi_thread")]
async fn 이어갈_대화가_없으면_새로_시작() {
    let f = fake("resume");
    let mut map = SessionMap::load(f.dir.join("claude-sessions.json"));
    map.set("세션2", Link { claude_session_id: "없는대화".into(), cwd: None }).unwrap();
    let (m, log) = manager(&f);
    let r = m.start("세션2", StartRequest { permission_mode: Some("default".into()), ..Default::default() }).await.unwrap();
    assert_eq!(r, StartReply { claude_session_id: None, resumed: false });
    assert!(m.status("세션2").await.running);
    let evs: Vec<Event> = log.lock().unwrap().iter().map(|(_, e)| e.clone()).collect();
    // 실패한 프로세스의 결과·종료는 화면에 가지 않고, 한국어 안내 하나만 간다
    assert_eq!(evs.iter().filter(|e| e.text == MSG_RESUME_FAILED).count(), 1);
    assert!(!evs.iter().any(|e| matches!(e.kind, Kind::Result | Kind::Exit)));
    assert!(SessionMap::load(f.dir.join("claude-sessions.json")).get("세션2").is_none());
    // 새 대화로 켜졌으니 메시지를 보내면 새 번호가 적힌다
    m.send("세션2", "새로").await.unwrap();
    wait_for(&log, Kind::Result, 1).await;
    assert_eq!(m.linked_id("세션2").as_deref(), Some(SAMPLE_ID));
    m.stop_all().await;
    let _ = std::fs::remove_dir_all(&f.dir);
}

#[tokio::test(flavor = "multi_thread")]
async fn 켜지_않았으면_보낼_때_켠다_그리고_설치_안됨_오류() {
    let f = fake("auto");
    let (m, log) = manager(&f);
    m.send("세션3", "바로 보냄").await.unwrap();
    wait_for(&log, Kind::Result, 1).await;
    m.stop("세션3").await;
    m.stop("없는세션").await; // 아무 일 없음

    let (m2, _) = manager(&f);
    m2.set_default_program(None);
    let e = m2.start("세션4", StartRequest { program: Some("/없는/폴더/claude".into()), ..Default::default() }).await.unwrap_err();
    assert!(e.starts_with(NOT_INSTALLED), "{e}");
    let _ = std::fs::remove_dir_all(&f.dir);
}

/// 실제 시험: ITDA_REAL_CLAUDE=1 cargo test -p itda-claude 실제 -- --nocapture
#[tokio::test(flavor = "multi_thread")]
async fn 실제_클로드_코드로_묻고_이어가기() {
    if std::env::var("ITDA_REAL_CLAUDE").as_deref() != Ok("1") {
        eprintln!("ITDA_REAL_CLAUDE=1 이 아니어서 건너뜀");
        return;
    }
    let dir = std::env::temp_dir().join(format!("itda-claude-real-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    let new_manager = |log: Log| {
        Manager::new(
            SessionMap::load(dir.join("claude-sessions.json")),
            dir.join("작업"),
            Arc::new(move |sid: &str, ev: Event| {
                println!("[{sid}] {}", serde_json::to_string(&ev).unwrap());
                log.lock().unwrap().push((sid.to_string(), ev));
            }),
        )
    };
    let req = || StartRequest { model: Some("claude-haiku-5-5".into()), ..Default::default() };

    let log: Log = Arc::new(Mutex::new(vec![]));
    let m = new_manager(log.clone());
    let r = m.start("실제", req()).await.unwrap();
    assert!(!r.resumed);
    m.send("실제", "내가 정한 암호는 「사과나무」야. 도구를 쓰지 말고 「알겠습니다」라고만 답해.").await.unwrap();
    let evs = wait_real(&log, 1).await;
    let id = m.linked_id("실제").expect("클로드 세션 번호를 받아야 함");
    assert!(evs.iter().any(|e| e.kind == Kind::Started));
    assert!(evs.iter().any(|e| e.kind == Kind::Text));
    m.stop("실제").await;

    // 다시 켜서 이어 가기
    let log2: Log = Arc::new(Mutex::new(vec![]));
    let m2 = new_manager(log2.clone());
    let r = m2.start("실제", req()).await.unwrap();
    assert_eq!(r, StartReply { claude_session_id: Some(id.clone()), resumed: true });
    m2.send("실제", "내가 정한 암호가 뭐였지? 도구를 쓰지 말고 암호만 답해.").await.unwrap();
    let evs = wait_real(&log2, 1).await;
    let answer: String = evs.iter().filter(|e| e.kind == Kind::Text).map(|e| e.text.clone()).collect();
    println!("이어간 대답: {answer} / 이어간 뒤 번호: {:?} (처음 번호 {id})", m2.linked_id("실제"));
    assert!(answer.contains("사과나무"), "이어 가기 실패: {answer}");
    m2.stop_all().await;
    let _ = std::fs::remove_dir_all(&dir);
}

async fn wait_real(log: &Log, count: usize) -> Vec<Event> {
    for _ in 0..1200 {
        {
            let l = log.lock().unwrap();
            if l.iter().filter(|(_, e)| matches!(e.kind, Kind::Result | Kind::Exit)).count() >= count {
                return l.iter().map(|(_, e)| e.clone()).collect();
            }
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
    panic!("실제 클로드 코드가 2분 안에 끝나지 않았습니다");
}
