//! 클로드 코드 프로세스 하나: 찾기, 켜기, 메시지 보내기, 사건 받기, 끄기.
//!
//! 켜는 모양
//! `claude -p --input-format stream-json --output-format stream-json --verbose [--model 모델] [--permission-mode 권한방식] [--resume 클로드세션번호]`
//!
//! 윈도우
//!  - `claude.exe`(설치 프로그램)는 바로 켜고, `claude.cmd`(npm 설치)는 `cmd /D /S /C "…"` 로 켠다.
//!  - 둘 다 검은 창을 띄우지 않는다(CREATE_NO_WINDOW).
//!  - 끌 때는 `taskkill /T /F` 로 딸린 프로세스(node)까지 함께 끈다. cmd 만 끄면 node 가 남는다.
//!  - 표준 출력은 바이트로 읽어 UTF-8 로 푼다(클로드 코드는 창 글자표와 상관없이 UTF-8 로 쓴다).

use crate::parse::{parse_line, Event, Kind};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex as StdMutex};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, Command};
use tokio::sync::{oneshot, watch, Mutex};

pub const NOT_INSTALLED: &str = "클로드 코드가 설치되어 있지 않습니다. 설치 후 다시 시도하세요";
pub const DEFAULT_PERMISSION_MODE: &str = "acceptEdits";
/// 윈도우 명령창이 「명령을 찾을 수 없음」일 때 돌려주는 종료 코드
pub const CMD_NOT_FOUND_CODE: i32 = 9009;

/// 사건을 받을 곳
pub type Sink = Arc<dyn Fn(Event) + Send + Sync>;

#[derive(Debug, Clone, Default)]
pub struct StartOptions {
    /// 클로드 코드 실행 파일(없으면 찾아서 씀)
    pub program: Option<String>,
    pub cwd: PathBuf,
    pub model: Option<String>,
    /// 없으면 `acceptEdits`
    pub permission_mode: Option<String>,
    /// 이어 갈 클로드 세션 번호
    pub resume: Option<String>,
}

/// 명령줄 인자(프로그램 이름 뺀 나머지)
pub fn build_args(o: &StartOptions) -> Vec<String> {
    let mut a: Vec<String> = ["-p", "--input-format", "stream-json", "--output-format", "stream-json", "--verbose"]
        .iter()
        .map(|s| s.to_string())
        .collect();
    if let Some(m) = o.model.as_deref().filter(|s| !s.trim().is_empty()) {
        a.extend(["--model".into(), m.trim().into()]);
    }
    let pm = o.permission_mode.as_deref().filter(|s| !s.trim().is_empty()).unwrap_or(DEFAULT_PERMISSION_MODE);
    a.extend(["--permission-mode".into(), pm.trim().into()]);
    if let Some(r) = o.resume.as_deref().filter(|s| !s.trim().is_empty()) {
        a.extend(["--resume".into(), r.trim().into()]);
    }
    a
}

/// 표준 입력에 쓸 메시지 한 줄(줄바꿈 포함)
pub fn user_message_line(text: &str) -> String {
    let v = serde_json::json!({"type": "user", "message": {"role": "user", "content": text}});
    format!("{v}\n")
}

fn exe_names() -> &'static [&'static str] {
    if cfg!(windows) {
        &["claude.exe", "claude.cmd", "claude.bat"]
    } else {
        &["claude"]
    }
}

fn is_file(p: &Path) -> bool {
    p.is_file()
}

/// 클로드 코드 실행 파일을 찾는다.
///  - `program` 을 주면: 경로면 그 파일, 이름만이면 길(PATH)에서 찾는다.
///  - 안 주면: 길(PATH)에서 `claude` 를 찾고, 없으면 흔한 설치 위치를 본다.
pub fn find_claude(program: Option<&str>) -> Result<PathBuf, String> {
    if let Some(p) = program.map(str::trim).filter(|s| !s.is_empty()) {
        let path = PathBuf::from(p);
        if path.components().count() > 1 || path.is_absolute() {
            return if is_file(&path) {
                Ok(path)
            } else {
                Err(format!("{NOT_INSTALLED} (지정한 실행 파일이 없습니다: {p})"))
            };
        }
        return search_path(&[p]).ok_or_else(|| NOT_INSTALLED.to_string());
    }
    if let Some(p) = search_path(exe_names()) {
        return Ok(p);
    }
    // 바탕화면 앱은 터미널과 길(PATH)이 다를 수 있어 흔한 설치 위치를 더 본다
    let mut extra: Vec<PathBuf> = Vec::new();
    let home = std::env::var_os("USERPROFILE").or_else(|| std::env::var_os("HOME")).map(PathBuf::from);
    if let Some(h) = &home {
        extra.push(h.join(".local").join("bin").join(if cfg!(windows) { "claude.exe" } else { "claude" }));
        extra.push(h.join(".claude").join("local").join(if cfg!(windows) { "claude.cmd" } else { "claude" }));
    }
    if let Some(appdata) = std::env::var_os("APPDATA").map(PathBuf::from) {
        extra.push(appdata.join("npm").join("claude.cmd"));
    }
    extra.into_iter().find(|p| is_file(p)).ok_or_else(|| NOT_INSTALLED.to_string())
}

fn search_path(names: &[&str]) -> Option<PathBuf> {
    let paths = std::env::var_os("PATH")?;
    for dir in std::env::split_paths(&paths) {
        for n in names {
            let cand = dir.join(n);
            if is_file(&cand) {
                return Some(cand);
            }
            // 윈도우에서 확장자 없이 이름만 준 경우
            if cfg!(windows) && Path::new(n).extension().is_none() {
                for ext in ["exe", "cmd", "bat"] {
                    let c = dir.join(format!("{n}.{ext}"));
                    if is_file(&c) {
                        return Some(c);
                    }
                }
            }
        }
    }
    None
}

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

#[cfg(windows)]
fn quote_for_cmd(s: &str) -> String {
    if s.is_empty() || s.chars().any(|c| c.is_whitespace() || "&|<>^()%!\"".contains(c)) {
        format!("\"{}\"", s.replace('"', "\"\""))
    } else {
        s.to_string()
    }
}

fn build_command(prog: &Path, args: &[String]) -> Command {
    #[cfg(windows)]
    {
        let ext = prog.extension().and_then(|e| e.to_str()).unwrap_or("").to_ascii_lowercase();
        let mut c = if ext == "exe" {
            let mut c = Command::new(prog);
            c.args(args);
            c
        } else {
            // npm 설치본(claude.cmd)은 명령창을 거쳐야 켜진다
            let mut line = quote_for_cmd(&prog.to_string_lossy());
            for a in args {
                line.push(' ');
                line.push_str(&quote_for_cmd(a));
            }
            let mut c = Command::new("cmd");
            c.raw_arg(format!("/D /S /C \"{line}\""));
            c
        };
        c.creation_flags(CREATE_NO_WINDOW);
        c
    }
    #[cfg(not(windows))]
    {
        let mut c = Command::new(prog);
        c.args(args);
        c
    }
}

/// 켜져 있는 클로드 코드 프로세스 하나
pub struct ClaudeProcess {
    stdin: Mutex<Option<ChildStdin>>,
    claude_session_id: Arc<StdMutex<Option<String>>>,
    running: Arc<AtomicBool>,
    kill_tx: StdMutex<Option<oneshot::Sender<()>>>,
    exited: watch::Receiver<bool>,
    first_output: watch::Receiver<bool>,
    pub resumed: bool,
}

impl ClaudeProcess {
    /// 켠다. 사건은 `sink` 로 들어온다(마지막은 언제나 `exit`).
    pub fn spawn(opts: &StartOptions, sink: Sink) -> Result<ClaudeProcess, String> {
        let prog = find_claude(opts.program.as_deref())?;
        std::fs::create_dir_all(&opts.cwd).map_err(|e| format!("작업 폴더를 만들 수 없습니다({}): {e}", opts.cwd.display()))?;
        let mut cmd = build_command(&prog, &build_args(opts));
        cmd.current_dir(&opts.cwd)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            // 앱이 클로드 코드 안에서 켜졌을 때 「안에서 또 켬」으로 막히지 않게
            .env_remove("CLAUDECODE")
            .kill_on_drop(true);
        let mut child = cmd.spawn().map_err(|e| {
            if e.kind() == std::io::ErrorKind::NotFound {
                NOT_INSTALLED.to_string()
            } else {
                format!("클로드 코드를 켤 수 없습니다: {e}")
            }
        })?;

        let stdin = child.stdin.take();
        let stdout = child.stdout.take().expect("표준 출력");
        let stderr = child.stderr.take().expect("표준 오류");
        let claude_session_id = Arc::new(StdMutex::new(opts.resume.clone()));
        let running = Arc::new(AtomicBool::new(true));
        let (kill_tx, kill_rx) = oneshot::channel();
        let (exited_tx, exited) = watch::channel(false);
        let (first_tx, first_output) = watch::channel(false);

        // 표준 출력: 신호 해석
        let (s1, id1) = (sink.clone(), claude_session_id.clone());
        let t_out = tokio::spawn(async move {
            let mut announced = false;
            let mut r = BufReader::new(stdout).split(b'\n');
            while let Ok(Some(line)) = r.next_segment().await {
                for ev in parse_line(&String::from_utf8_lossy(&line)) {
                    if ev.kind == Kind::Started {
                        let new_id = ev.claude_session_id.clone();
                        let mut cur = id1.lock().unwrap();
                        // 한 프로세스에서 처음 받을 때와 번호가 바뀌었을 때만 알린다
                        if announced && *cur == new_id {
                            continue;
                        }
                        announced = true;
                        *cur = new_id;
                    }
                    s1(ev);
                }
                // 이 줄의 사건을 다 넘긴 뒤에 「첫 출력」을 알린다
                let _ = first_tx.send_if_modified(|v| !std::mem::replace(v, true));
            }
        });
        // 표준 오류: 줄마다 error
        let s2 = sink.clone();
        let t_err = tokio::spawn(async move {
            let mut r = BufReader::new(stderr).split(b'\n');
            while let Ok(Some(line)) = r.next_segment().await {
                let t = String::from_utf8_lossy(&line).trim().to_string();
                if !t.is_empty() {
                    s2(Event::error(t));
                }
            }
        });
        // 끝나기 기다림
        let (s3, run3) = (sink, running.clone());
        tokio::spawn(async move {
            let status = wait_or_kill(&mut child, kill_rx).await;
            let _ = t_out.await;
            let _ = t_err.await;
            run3.store(false, Ordering::SeqCst);
            let code = status.as_ref().ok().and_then(|s| s.code());
            if cfg!(windows) && code == Some(CMD_NOT_FOUND_CODE) {
                s3(Event::error(NOT_INSTALLED));
            }
            let text = match (&status, code) {
                (Ok(_), Some(c)) => c.to_string(),
                (Ok(_), None) => "강제 종료".to_string(),
                (Err(e), _) => format!("알 수 없음({e})"),
            };
            s3(Event::new(Kind::Exit, text));
            let _ = exited_tx.send(true);
        });

        Ok(ClaudeProcess {
            stdin: Mutex::new(stdin),
            claude_session_id,
            running,
            kill_tx: StdMutex::new(Some(kill_tx)),
            exited,
            first_output,
            resumed: opts.resume.is_some(),
        })
    }

    pub fn is_running(&self) -> bool {
        self.running.load(Ordering::SeqCst)
    }

    pub fn claude_session_id(&self) -> Option<String> {
        self.claude_session_id.lock().unwrap().clone()
    }

    /// 메시지 한 건을 보낸다.
    pub async fn send(&self, text: &str) -> Result<(), String> {
        if !self.is_running() {
            return Err("클로드 코드가 꺼져 있습니다".into());
        }
        let mut g = self.stdin.lock().await;
        let w = g.as_mut().ok_or("클로드 코드가 꺼지는 중입니다")?;
        let line = user_message_line(text);
        w.write_all(line.as_bytes()).await.map_err(|e| format!("클로드 코드에 메시지를 보내지 못했습니다: {e}"))?;
        w.flush().await.map_err(|e| format!("클로드 코드에 메시지를 보내지 못했습니다: {e}"))
    }

    /// 끈다. 끝날 때까지(최대 5초) 기다린다.
    pub async fn stop(&self) {
        // 입력을 닫고 강제로 끈다
        self.stdin.lock().await.take();
        if let Some(tx) = self.kill_tx.lock().unwrap().take() {
            let _ = tx.send(());
        }
        self.wait_exit(std::time::Duration::from_secs(5)).await;
    }

    /// 프로세스가 끝나기를 기다린다(끝났으면 참).
    pub async fn wait_exit(&self, limit: std::time::Duration) -> bool {
        let mut rx = self.exited.clone();
        let done = tokio::time::timeout(limit, async { rx.wait_for(|v| *v).await.is_ok() }).await;
        done.unwrap_or(false)
    }

    /// 첫 출력 줄이나 종료 중 먼저 오는 것을 기다린다(시간 안에 왔으면 참).
    /// 클로드 코드는 정상이면 입력 전에 곧바로 몇 줄을 내보내고, 이어 갈 대화가 없으면 오류를 내고 바로 끝난다.
    pub async fn wait_ready(&self, limit: std::time::Duration) -> bool {
        let (mut a, mut b) = (self.first_output.clone(), self.exited.clone());
        tokio::time::timeout(limit, async {
            tokio::select! {
                _ = a.wait_for(|v| *v) => {},
                _ = b.wait_for(|v| *v) => {},
            }
        })
        .await
        .is_ok()
    }
}

async fn wait_or_kill(child: &mut Child, kill_rx: oneshot::Receiver<()>) -> std::io::Result<std::process::ExitStatus> {
    tokio::select! {
        s = child.wait() => s,
        r = kill_rx => {
            if r.is_ok() {
                kill_tree(child).await;
            }
            child.wait().await
        }
    }
}

async fn kill_tree(child: &mut Child) {
    #[cfg(windows)]
    if let Some(pid) = child.id() {
        // cmd 아래에 뜬 node 까지 함께 끈다
        let _ = Command::new("taskkill")
            .args(["/T", "/F", "/PID", &pid.to_string()])
            .creation_flags(CREATE_NO_WINDOW)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .await;
    }
    let _ = child.kill().await;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn 인자_모양() {
        let a = build_args(&StartOptions { model: Some("claude-haiku-5-5".into()), resume: Some("abc".into()), ..Default::default() });
        assert_eq!(
            a.join(" "),
            "-p --input-format stream-json --output-format stream-json --verbose --model claude-haiku-5-5 --permission-mode acceptEdits --resume abc"
        );
    }

    #[test]
    fn 메시지_한_줄() {
        let l = user_message_line("안녕\n둘째 줄");
        assert!(l.ends_with('\n') && l.matches('\n').count() == 1);
        let v: serde_json::Value = serde_json::from_str(l.trim_end()).unwrap();
        assert_eq!(v, serde_json::json!({"type":"user","message":{"role":"user","content":"안녕\n둘째 줄"}}));
    }

    #[test]
    fn 없는_실행_파일은_한국어_오류() {
        let e = find_claude(Some("/없는/폴더/claude")).unwrap_err();
        assert!(e.starts_with(NOT_INSTALLED));
        let e = find_claude(Some("이런-프로그램-없음-itda")).unwrap_err();
        assert_eq!(e, NOT_INSTALLED);
    }
}
