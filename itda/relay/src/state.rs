//! 잇다 공유 상태와 처리 규칙(리듀서).
//! 모든 컴퓨터의 앱이 보낸 동작(Op)을 이 한 곳에서 적용하고, 결과를 모두에게 다시 뿌린다.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::time::{SystemTime, UNIX_EPOCH};

pub fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

pub const AGENT_ID: &str = "agent";
pub const LOG_CAP: usize = 400;

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Member {
    pub id: String,
    pub name: String,
    pub computer: String,
    #[serde(default)]
    pub role: String,
    #[serde(default)]
    pub online: bool,
    #[serde(default)]
    pub last_seen: u64,
    /// 본부장 도움 정도: 0 끔, 1 가볍게, 2 보통, 3 적극
    #[serde(default = "default_help")]
    pub help_level: u8,
}
fn default_help() -> u8 { 2 }

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: String,
    pub name: String,
    pub kind: String,
    #[serde(default)]
    pub goal: String,
    #[serde(default)]
    pub guide: String,
    pub owner_id: String,
    #[serde(default)]
    pub members: Vec<String>,
    pub created_at: u64,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    pub id: String,
    pub project_id: String,
    pub owner_id: String,
    pub title: String,
    /// 그 사람의 메인 세션인지
    #[serde(default)]
    pub is_main: bool,
    /// 프로젝트 전체를 지휘하는 팀 메인 세션인지
    #[serde(default)]
    pub is_team_main: bool,
    /// working 일하는 중 / waiting 사람 대기 / stalled 멈춤 / done 끝
    pub status: String,
    pub last_activity: u64,
    pub created_at: u64,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LogLine {
    pub ts: u64,
    /// in 입력 / out 출력 / err 오류 / sys 알림 / coach 본부장 / req 다른 세션 요청
    pub kind: String,
    pub text: String,
    #[serde(default)]
    pub from: String,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Version {
    pub v: u32,
    pub ts: u64,
    pub by: String,
    #[serde(default)]
    pub note: String,
    #[serde(default)]
    pub content: String,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Artifact {
    pub id: String,
    pub project_id: String,
    pub session_id: String,
    pub owner_id: String,
    pub name: String,
    /// 문서 / 디자인 / 코드 / 이미지 / 이메일
    pub kind: String,
    pub versions: Vec<Version>,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Channel {
    pub id: String,
    pub project_id: String,
    pub name: String,
    /// channel 채널 / dm 개인 대화
    pub kind: String,
    #[serde(default)]
    pub members: Vec<String>,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Message {
    pub id: String,
    pub channel_id: String,
    pub from: String,
    pub text: String,
    pub ts: u64,
    #[serde(default)]
    pub artifact_id: Option<String>,
    #[serde(default)]
    pub reply_to: Option<String>,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WikiPage {
    pub id: String,
    pub project_id: String,
    pub title: String,
    pub body: String,
    /// team 팀 위키 / common 공통분모 위키(다른 팀과 공유)
    pub scope: String,
    pub by: String,
    pub updated_at: u64,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanItem {
    pub id: String,
    pub project_id: String,
    pub title: String,
    #[serde(default)]
    pub owner_id: String,
    #[serde(default)]
    pub done: bool,
    #[serde(default)]
    pub artifact_id: Option<String>,
    /// 오늘 / 내일 / 이번주
    #[serde(default)]
    pub when: String,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Coach {
    pub id: String,
    pub project_id: String,
    #[serde(default)]
    pub session_id: Option<String>,
    /// info / warn / check
    pub level: String,
    pub text: String,
    pub ts: u64,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MergeRequest {
    pub id: String,
    pub project_id: String,
    pub from_session: String,
    pub to_session: String,
    #[serde(default)]
    pub artifact_id: Option<String>,
    pub note: String,
    /// 대기 / 합침 / 반려
    pub status: String,
    pub ts: u64,
}

/// 사람이 만들어 공유하는 협업 대시보드(보여 줄 판 조각 목록)
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Board {
    pub id: String,
    pub project_id: String,
    pub name: String,
    pub widgets: Vec<String>,
    pub by: String,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct State {
    pub members: Vec<Member>,
    pub projects: Vec<Project>,
    pub sessions: Vec<Session>,
    #[serde(default)]
    pub logs: HashMap<String, Vec<LogLine>>,
    pub artifacts: Vec<Artifact>,
    pub channels: Vec<Channel>,
    pub messages: Vec<Message>,
    pub wiki: Vec<WikiPage>,
    pub plan: Vec<PlanItem>,
    pub coach: Vec<Coach>,
    pub requests: Vec<MergeRequest>,
    #[serde(default)]
    pub boards: Vec<Board>,
    #[serde(default)]
    pub seq: u64,
}

/// 앱이 보내는 동작.
#[derive(Clone, Debug, Deserialize)]
#[serde(tag = "op", rename_all = "camelCase")]
pub enum Op {
    #[serde(rename_all = "camelCase")]
    CreateProject { name: String, kind: String, #[serde(default)] goal: String },
    #[serde(rename_all = "camelCase")]
    JoinProject { project_id: String },
    #[serde(rename_all = "camelCase")]
    UpdateProject { project_id: String, goal: Option<String>, guide: Option<String> },
    #[serde(rename_all = "camelCase")]
    OpenSession { project_id: String, title: String, #[serde(default)] is_main: bool },
    #[serde(rename_all = "camelCase")]
    SetSessionStatus { session_id: String, status: String },
    #[serde(rename_all = "camelCase")]
    Log { session_id: String, kind: String, text: String },
    #[serde(rename_all = "camelCase")]
    PublishArtifact {
        project_id: String,
        session_id: String,
        name: String,
        kind: String,
        #[serde(default)] content: String,
        #[serde(default)] note: String,
        artifact_id: Option<String>,
    },
    #[serde(rename_all = "camelCase")]
    SendRequest { from_session: String, to_session: String, artifact_id: Option<String>, note: String },
    #[serde(rename_all = "camelCase")]
    ResolveRequest { request_id: String, status: String },
    #[serde(rename_all = "camelCase")]
    CreateChannel { project_id: String, name: String, #[serde(default)] members: Vec<String> },
    #[serde(rename_all = "camelCase")]
    Post { channel_id: String, text: String, artifact_id: Option<String>, reply_to: Option<String> },
    #[serde(rename_all = "camelCase")]
    Wiki { project_id: String, id: Option<String>, title: String, body: String, #[serde(default = "team")] scope: String },
    #[serde(rename_all = "camelCase")]
    Plan { project_id: String, id: Option<String>, title: Option<String>, owner_id: Option<String>, done: Option<bool>, artifact_id: Option<String>, when: Option<String> },
    #[serde(rename_all = "camelCase")]
    SetHelpLevel { level: u8 },
    #[serde(rename_all = "camelCase")]
    Board { project_id: String, id: Option<String>, name: String, widgets: Vec<String> },
    /// 본부장에게 지금 점검하라고 요청
    #[serde(rename_all = "camelCase")]
    AgentReview { project_id: String },
}
fn team() -> String { "team".into() }

/// 동작을 적용한 결과: 새 로그 줄만 생겼는지, 전체 상태가 바뀌었는지.
pub enum Applied {
    /// 세션 로그 한 줄 (가볍게 뿌림)
    LogOnly(String, LogLine),
    /// 전체 상태 다시 뿌림
    Changed,
    /// 본부장 점검 요청
    Review(String),
    /// 메신저 글이 올라옴 (본부장 호출 확인용)
    Posted(Message),
    Nothing,
}

impl State {
    pub fn next_id(&mut self, prefix: &str) -> String {
        self.seq += 1;
        format!("{}{}", prefix, self.seq)
    }

    pub fn member_name(&self, id: &str) -> String {
        if id == AGENT_ID { return "AI 본부장".into(); }
        self.members.iter().find(|m| m.id == id).map(|m| m.name.clone()).unwrap_or_else(|| id.to_string())
    }

    pub fn upsert_member(&mut self, mut m: Member) {
        m.online = true;
        m.last_seen = now_ms();
        if let Some(old) = self.members.iter_mut().find(|x| x.id == m.id) {
            old.name = m.name;
            old.computer = m.computer;
            if !m.role.is_empty() { old.role = m.role; }
            old.online = true;
            old.last_seen = m.last_seen;
        } else {
            self.members.push(m);
        }
    }

    pub fn set_offline(&mut self, id: &str) {
        if let Some(m) = self.members.iter_mut().find(|x| x.id == id) {
            m.online = false;
            m.last_seen = now_ms();
        }
    }

    pub fn push_log(&mut self, session_id: &str, line: LogLine) {
        let v = self.logs.entry(session_id.to_string()).or_default();
        v.push(line);
        if v.len() > LOG_CAP {
            let cut = v.len() - LOG_CAP;
            v.drain(0..cut);
        }
    }

    pub fn add_coach(&mut self, project_id: &str, session_id: Option<String>, level: &str, text: String) {
        // 같은 내용이 최근에 있으면 되풀이하지 않는다
        if self.coach.iter().rev().take(30).any(|c| c.text == text && c.session_id == session_id) {
            return;
        }
        let id = self.next_id("c");
        self.coach.push(Coach { id, project_id: project_id.into(), session_id, level: level.into(), text, ts: now_ms() });
        if self.coach.len() > 300 { self.coach.drain(0..self.coach.len() - 300); }
    }

    pub fn agent_channel(&mut self, project_id: &str) -> String {
        if let Some(c) = self.channels.iter().find(|c| c.project_id == project_id && c.name == "본부장") {
            return c.id.clone();
        }
        let id = self.next_id("ch");
        self.channels.push(Channel { id: id.clone(), project_id: project_id.into(), name: "본부장".into(), kind: "channel".into(), members: vec![] });
        id
    }

    pub fn agent_post(&mut self, project_id: &str, text: String) {
        let ch = self.agent_channel(project_id);
        let id = self.next_id("m");
        self.messages.push(Message { id, channel_id: ch, from: AGENT_ID.into(), text, ts: now_ms(), artifact_id: None, reply_to: None });
    }

    pub fn post_as(&mut self, channel_id: &str, from: &str, text: String, reply_to: Option<String>) -> Message {
        let id = self.next_id("m");
        let m = Message { id, channel_id: channel_id.into(), from: from.into(), text, ts: now_ms(), artifact_id: None, reply_to };
        self.messages.push(m.clone());
        m
    }

    fn touch(&mut self, session_id: &str) {
        if let Some(s) = self.sessions.iter_mut().find(|s| s.id == session_id) {
            s.last_activity = now_ms();
            if s.status == "stalled" { s.status = "working".into(); }
        }
    }

    /// 동작 적용. `who` 는 보낸 사람 아이디.
    pub fn apply(&mut self, who: &str, op: Op) -> Result<Applied, String> {
        let now = now_ms();
        match op {
            Op::CreateProject { name, kind, goal } => {
                let id = self.next_id("p");
                self.projects.push(Project {
                    id: id.clone(), name: name.clone(), kind, goal, guide: String::new(),
                    owner_id: who.into(), members: vec![who.into()], created_at: now,
                });
                // 기본 채널과 팀 메인 세션
                let gen = self.next_id("ch");
                self.channels.push(Channel { id: gen, project_id: id.clone(), name: "전체".into(), kind: "channel".into(), members: vec![] });
                self.agent_channel(&id);
                let sid = self.next_id("s");
                self.sessions.push(Session {
                    id: sid, project_id: id.clone(), owner_id: who.into(), title: format!("{} 팀 메인", name),
                    is_main: true, is_team_main: true, status: "waiting".into(), last_activity: now, created_at: now,
                });
                self.agent_post(&id, format!("「{}」 프로젝트를 맡았습니다. 목표와 지침을 이 채널에서 함께 정해요. 무엇을 만들고 싶으신가요?", name));
                Ok(Applied::Changed)
            }
            Op::JoinProject { project_id } => {
                let p = self.projects.iter_mut().find(|p| p.id == project_id).ok_or("프로젝트가 없습니다")?;
                if !p.members.iter().any(|m| m == who) { p.members.push(who.into()); }
                let name = self.member_name(who);
                self.agent_post(&project_id, format!("{} 님이 합류했습니다. 메인 세션을 하나 열어 주세요.", name));
                Ok(Applied::Changed)
            }
            Op::UpdateProject { project_id, goal, guide } => {
                let p = self.projects.iter_mut().find(|p| p.id == project_id).ok_or("프로젝트가 없습니다")?;
                if let Some(g) = goal { p.goal = g; }
                if let Some(g) = guide { p.guide = g; }
                Ok(Applied::Changed)
            }
            Op::OpenSession { project_id, title, is_main } => {
                if !self.projects.iter().any(|p| p.id == project_id) { return Err("프로젝트가 없습니다".into()); }
                let id = self.next_id("s");
                self.sessions.push(Session {
                    id: id.clone(), project_id, owner_id: who.into(), title, is_main, is_team_main: false,
                    status: "working".into(), last_activity: now, created_at: now,
                });
                self.push_log(&id, LogLine { ts: now, kind: "sys".into(), text: "세션이 열렸습니다.".into(), from: who.into() });
                Ok(Applied::Changed)
            }
            Op::SetSessionStatus { session_id, status } => {
                let s = self.sessions.iter_mut().find(|s| s.id == session_id).ok_or("세션이 없습니다")?;
                s.status = status;
                s.last_activity = now;
                Ok(Applied::Changed)
            }
            Op::Log { session_id, kind, text } => {
                if !self.sessions.iter().any(|s| s.id == session_id) { return Err("세션이 없습니다".into()); }
                let line = LogLine { ts: now, kind, text, from: who.into() };
                let was_stalled = self.sessions.iter().any(|s| s.id == session_id && s.status == "stalled");
                self.touch(&session_id);
                self.push_log(&session_id, line.clone());
                if was_stalled { Ok(Applied::Changed) } else { Ok(Applied::LogOnly(session_id, line)) }
            }
            Op::PublishArtifact { project_id, session_id, name, kind, content, note, artifact_id } => {
                let existing = artifact_id.clone()
                    .or_else(|| self.artifacts.iter().find(|a| a.project_id == project_id && a.name == name).map(|a| a.id.clone()));
                let (aid, v) = if let Some(aid) = existing {
                    let a = self.artifacts.iter_mut().find(|a| a.id == aid).ok_or("산출물이 없습니다")?;
                    let v = a.versions.last().map(|x| x.v).unwrap_or(0) + 1;
                    a.versions.push(Version { v, ts: now, by: who.into(), note, content });
                    (aid, v)
                } else {
                    let aid = self.next_id("a");
                    self.artifacts.push(Artifact {
                        id: aid.clone(), project_id: project_id.clone(), session_id: session_id.clone(), owner_id: who.into(),
                        name: name.clone(), kind, versions: vec![Version { v: 1, ts: now, by: who.into(), note, content }],
                    });
                    (aid, 1)
                };
                self.touch(&session_id);
                self.push_log(&session_id, LogLine { ts: now, kind: "sys".into(), text: format!("산출물 「{}」 v{} 을 올렸습니다.", name, v), from: who.into() });
                let _ = aid;
                Ok(Applied::Changed)
            }
            Op::SendRequest { from_session, to_session, artifact_id, note } => {
                let to = self.sessions.iter().find(|s| s.id == to_session).cloned().ok_or("받는 세션이 없습니다")?;
                let from = self.sessions.iter().find(|s| s.id == from_session).cloned().ok_or("보내는 세션이 없습니다")?;
                let id = self.next_id("r");
                let art = artifact_id.as_ref().and_then(|a| self.artifacts.iter().find(|x| &x.id == a)).map(|a| format!(" 「{}」 v{}", a.name, a.versions.len())).unwrap_or_default();
                let who_name = self.member_name(who);
                self.requests.push(MergeRequest { id, project_id: to.project_id.clone(), from_session, to_session: to.id.clone(), artifact_id, note: note.clone(), status: "대기".into(), ts: now });
                self.push_log(&to.id, LogLine { ts: now, kind: "req".into(), text: format!("[{} · {}]{} 합치기 요청: {}", who_name, from.title, art, note), from: who.into() });
                self.push_log(&from.id, LogLine { ts: now, kind: "sys".into(), text: format!("「{}」 세션으로 요청을 보냈습니다.", to.title), from: who.into() });
                self.touch(&from.id);
                Ok(Applied::Changed)
            }
            Op::ResolveRequest { request_id, status } => {
                let r = self.requests.iter_mut().find(|r| r.id == request_id).ok_or("요청이 없습니다")?;
                r.status = status.clone();
                let (fs, ts) = (r.from_session.clone(), r.to_session.clone());
                self.push_log(&fs, LogLine { ts: now, kind: "sys".into(), text: format!("보낸 요청이 「{}」 처리되었습니다.", status), from: who.into() });
                self.touch(&ts);
                Ok(Applied::Changed)
            }
            Op::CreateChannel { project_id, name, members } => {
                let id = self.next_id("ch");
                let kind = if members.is_empty() { "channel" } else { "dm" };
                self.channels.push(Channel { id, project_id, name, kind: kind.into(), members });
                Ok(Applied::Changed)
            }
            Op::Post { channel_id, text, artifact_id, reply_to } => {
                if !self.channels.iter().any(|c| c.id == channel_id) { return Err("채널이 없습니다".into()); }
                let id = self.next_id("m");
                let m = Message { id, channel_id, from: who.into(), text, ts: now, artifact_id, reply_to };
                self.messages.push(m.clone());
                Ok(Applied::Posted(m))
            }
            Op::Wiki { project_id, id, title, body, scope } => {
                if let Some(page) = id.as_ref().and_then(|i| self.wiki.iter_mut().find(|w| &w.id == i)) {
                    page.title = title; page.body = body; page.scope = scope; page.by = who.into(); page.updated_at = now;
                } else {
                    let nid = self.next_id("w");
                    self.wiki.push(WikiPage { id: nid, project_id, title, body, scope, by: who.into(), updated_at: now });
                }
                Ok(Applied::Changed)
            }
            Op::Plan { project_id, id, title, owner_id, done, artifact_id, when } => {
                if let Some(item) = id.as_ref().and_then(|i| self.plan.iter_mut().find(|p| &p.id == i)) {
                    if let Some(t) = title { item.title = t; }
                    if let Some(o) = owner_id { item.owner_id = o; }
                    if let Some(d) = done { item.done = d; }
                    if artifact_id.is_some() { item.artifact_id = artifact_id; }
                    if let Some(w) = when { item.when = w; }
                } else {
                    let nid = self.next_id("t");
                    self.plan.push(PlanItem {
                        id: nid, project_id, title: title.unwrap_or_default(), owner_id: owner_id.unwrap_or_else(|| who.into()),
                        done: done.unwrap_or(false), artifact_id, when: when.unwrap_or_else(|| "오늘".into()),
                    });
                }
                Ok(Applied::Changed)
            }
            Op::SetHelpLevel { level } => {
                if let Some(m) = self.members.iter_mut().find(|m| m.id == who) { m.help_level = level.min(3); }
                Ok(Applied::Changed)
            }
            Op::Board { project_id, id, name, widgets } => {
                if let Some(b) = id.as_ref().and_then(|i| self.boards.iter_mut().find(|b| &b.id == i)) {
                    b.name = name; b.widgets = widgets;
                } else {
                    let nid = self.next_id("b");
                    self.boards.push(Board { id: nid, project_id, name, widgets, by: who.into() });
                }
                Ok(Applied::Changed)
            }
            Op::AgentReview { project_id } => Ok(Applied::Review(project_id)),
        }
    }

    /// 상태를 한 사람에게 보여 줄 모양으로: 로그는 세션별 마지막 120줄만.
    pub fn snapshot(&self) -> serde_json::Value {
        let mut v = serde_json::to_value(self).unwrap_or_default();
        if let Some(logs) = v.get_mut("logs").and_then(|l| l.as_object_mut()) {
            for (_, arr) in logs.iter_mut() {
                if let Some(a) = arr.as_array_mut() {
                    if a.len() > 120 { let cut = a.len() - 120; a.drain(0..cut); }
                }
            }
        }
        v
    }
}
