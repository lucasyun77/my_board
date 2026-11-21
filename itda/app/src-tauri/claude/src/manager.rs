//! 잇다 세션마다 클로드 코드 프로세스 하나씩을 켜 두고 관리한다.
//!  - 켤 때 연결표에 클로드 세션 번호가 있으면 `--resume` 으로 이어 간다.
//!  - 클로드 세션 번호를 받으면(started) 연결표에 적고 파일에 저장한다.
//!  - 이어 갈 대화를 클로드 코드가 찾지 못하면, 연결을 지우고 한국어 오류를 알린 뒤 새 대화로 다시 켠다.

use crate::parse::{Event, Kind};
use crate::process::{ClaudeProcess, StartOptions};
use crate::store::{Link, SessionMap};
use serde::Serialize;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex as StdMutex};
use std::time::Duration;
use tokio::sync::Mutex;

/// 사건을 받을 곳: (잇다 세션 번호, 사건)
pub type SessionSink = Arc<dyn Fn(&str, Event) + Send + Sync>;

pub const MSG_RESUME_FAILED: &str = "이전 대화를 찾지 못해 이어 가지 못했습니다. 새 대화로 시작합니다";
/// 이어가기 성공 여부를 가려내려고 기다리는 최대 시간
pub const RESUME_CHECK: Duration = Duration::from_secs(15);

/// `claude_start` 에 들어오는 값(빈 칸은 기본값)
#[derive(Debug, Clone, Default)]
pub struct StartRequest {
    pub cwd: Option<PathBuf>,
    pub model: Option<String>,
    pub permission_mode: Option<String>,
    pub program: Option<String>,
}

#[derive(Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct StartReply {
    pub claude_session_id: Option<String>,
    pub resumed: bool,
}

#[derive(Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub running: bool,
    pub claude_session_id: Option<String>,
}

pub struct Manager {
    map: Arc<StdMutex<SessionMap>>,
    procs: Mutex<HashMap<String, Arc<ClaudeProcess>>>,
    sink: SessionSink,
    /// cwd 가 없을 때 쓸 바탕 폴더(예: 문서 폴더/iSensTogether)
    work_root: PathBuf,
    /// 설정으로 바꾼 실행 파일(요청에 program 이 없을 때 씀)
    default_program: StdMutex<Option<String>>,
}

/// 잇다 세션 번호를 폴더 이름으로 쓸 수 있게 고친다(윈도우에서 못 쓰는 글자를 밑줄로).
pub fn folder_name(session_id: &str) -> String {
    let s: String = session_id
        .trim()
        .chars()
        .map(|c| if c.is_control() || "<>:\"/\\|?*".contains(c) { '_' } else { c })
        .collect();
    let s = s.trim_end_matches(['.', ' ']).to_string();
    if s.is_empty() || s == "." || s == ".." { "_".into() } else { s }
}

impl Manager {
    pub fn new(map: SessionMap, work_root: impl Into<PathBuf>, sink: SessionSink) -> Self {
        Manager {
            map: Arc::new(StdMutex::new(map)),
            procs: Mutex::new(HashMap::new()),
            sink,
            work_root: work_root.into(),
            default_program: StdMutex::new(None),
        }
    }

    pub fn set_default_program(&self, program: Option<String>) {
        *self.default_program.lock().unwrap() = program.filter(|s| !s.trim().is_empty());
    }

    /// 연결표에 적힌 클로드 세션 번호
    pub fn linked_id(&self, session_id: &str) -> Option<String> {
        self.map.lock().unwrap().get(session_id).map(|l| l.claude_session_id.clone())
    }

    /// 켠다. 이미 켜져 있으면 그대로 둔다.
    pub async fn start(&self, session_id: &str, req: StartRequest) -> Result<StartReply, String> {
        let mut procs = self.procs.lock().await;
        if let Some(p) = procs.get(session_id).filter(|p| p.is_running()) {
            return Ok(StartReply { claude_session_id: p.claude_session_id(), resumed: p.resumed });
        }
        let link = self.map.lock().unwrap().get(session_id).cloned();
        let cwd = req
            .cwd
            .clone()
            .filter(|p| !p.as_os_str().is_empty())
            .or_else(|| link.as_ref().and_then(|l| l.cwd.clone()).map(PathBuf::from))
            .unwrap_or_else(|| self.work_root.join(folder_name(session_id)));
        let program = req.program.clone().filter(|s| !s.trim().is_empty()).or_else(|| self.default_program.lock().unwrap().clone());
        let mut opts = StartOptions {
            program,
            cwd,
            model: req.model.clone(),
            permission_mode: req.permission_mode.clone(),
            resume: link.map(|l| l.claude_session_id),
        };

        let failed = Arc::new(AtomicBool::new(false));
        let mut proc = ClaudeProcess::spawn(&opts, self.process_sink(session_id, &opts, failed.clone()))?;
        if proc.resumed {
            proc.wait_ready(RESUME_CHECK).await;
            if failed.load(Ordering::SeqCst) {
                proc.stop().await;
                opts.resume = None;
                proc = ClaudeProcess::spawn(&opts, self.process_sink(session_id, &opts, Arc::new(AtomicBool::new(false))))?;
            }
        }
        let reply = StartReply { claude_session_id: proc.claude_session_id(), resumed: proc.resumed };
        procs.insert(session_id.to_string(), Arc::new(proc));
        Ok(reply)
    }

    /// 프로세스 하나의 사건을 받아 연결표를 고치고 바깥으로 넘기는 곳
    fn process_sink(&self, session_id: &str, opts: &StartOptions, failed: Arc<AtomicBool>) -> crate::process::Sink {
        let (map, sink, sid) = (self.map.clone(), self.sink.clone(), session_id.to_string());
        let cwd = opts.cwd.to_string_lossy().to_string();
        let resuming = opts.resume.is_some();
        Arc::new(move |ev: Event| {
            if ev.kind == Kind::Started {
                if let Some(id) = &ev.claude_session_id {
                    if let Err(e) = map.lock().unwrap().set(&sid, Link { claude_session_id: id.clone(), cwd: Some(cwd.clone()) }) {
                        sink(&sid, Event::error(e));
                    }
                }
            }
            let resume_missing = resuming
                && matches!(ev.kind, Kind::Error | Kind::Result)
                && ev.text.contains("No conversation found");
            if resume_missing {
                // 같은 실패가 표준 오류와 결과로 두 번 오므로 한 번만 알린다
                if !failed.swap(true, Ordering::SeqCst) {
                    let _ = map.lock().unwrap().remove(&sid);
                    sink(&sid, Event::error(MSG_RESUME_FAILED));
                }
                return;
            }
            // 이어가기에 실패한 프로세스의 나머지 사건(결과·종료)은 화면에 보내지 않는다
            if failed.load(Ordering::SeqCst) {
                return;
            }
            sink(&sid, ev);
        })
    }

    /// 메시지를 보낸다. 켜져 있지 않으면 기본값으로 먼저 켠다.
    pub async fn send(&self, session_id: &str, text: &str) -> Result<(), String> {
        let running = self.procs.lock().await.get(session_id).filter(|p| p.is_running()).cloned();
        let p = match running {
            Some(p) => p,
            None => {
                self.start(session_id, StartRequest::default()).await?;
                self.procs.lock().await.get(session_id).cloned().ok_or("클로드 코드를 켜지 못했습니다")?
            }
        };
        p.send(text).await
    }

    /// 끈다(켜져 있지 않으면 아무것도 안 함).
    pub async fn stop(&self, session_id: &str) {
        let p = self.procs.lock().await.remove(session_id);
        if let Some(p) = p {
            p.stop().await;
        }
    }

    pub async fn stop_all(&self) {
        let all: Vec<_> = self.procs.lock().await.drain().map(|(_, p)| p).collect();
        for p in all {
            p.stop().await;
        }
    }

    pub async fn status(&self, session_id: &str) -> Status {
        match self.procs.lock().await.get(session_id) {
            Some(p) if p.is_running() => Status { running: true, claude_session_id: p.claude_session_id().or_else(|| self.linked_id(session_id)) },
            _ => Status { running: false, claude_session_id: self.linked_id(session_id) },
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn 폴더_이름() {
        assert_eq!(folder_name("세션:1/2"), "세션_1_2");
        assert_eq!(folder_name(".."), "_");
        assert_eq!(folder_name("abc. "), "abc");
    }
}
