//! AI 본부장(진행도우미 에이전트).
//! - 멈춘 세션 찾기 → 후속 일 시키기
//! - 계획서 검수(완료라는데 산출물 없음, 오래 기다리는 합치기 요청)
//! - 당일 후속 계획 세우기, 지식위키 갱신
//! - 메신저에서 사람의 의도 묻고 기록하기 (클로드 열쇠가 있으면 클로드가 답을 쓴다)

use crate::state::*;
use serde_json::json;

#[derive(Clone)]
pub struct AgentCfg {
    /// 이 시간 동안 출력이 없으면 멈춘 세션으로 본다
    pub stall_after_ms: u64,
    /// 합치기 요청이 이 시간 넘게 대기면 팀 메인에 알린다
    pub request_wait_ms: u64,
    pub api_key: Option<String>,
    pub model: String,
}

impl Default for AgentCfg {
    fn default() -> Self {
        Self {
            stall_after_ms: 120_000,
            request_wait_ms: 300_000,
            api_key: std::env::var("ANTHROPIC_API_KEY").ok().filter(|k| !k.is_empty()),
            model: std::env::var("ITDA_MODEL").unwrap_or_else(|_| "claude-opus-5-5".into()),
        }
    }
}

/// 주기 점검. 바뀐 것이 있으면 true.
pub fn tick(st: &mut State, now: u64, cfg: &AgentCfg) -> bool {
    let mut changed = false;

    // 1) 멈춘 세션
    let stalled: Vec<Session> = st.sessions.iter()
        .filter(|s| s.status == "working" && now.saturating_sub(s.last_activity) > cfg.stall_after_ms)
        .cloned().collect();
    for s in stalled {
        if let Some(x) = st.sessions.iter_mut().find(|x| x.id == s.id) { x.status = "stalled".into(); }
        let owner = st.member_name(&s.owner_id);
        let help = st.members.iter().find(|m| m.id == s.owner_id).map(|m| m.help_level).unwrap_or(2);
        let mins = now.saturating_sub(s.last_activity) / 60_000;
        st.add_coach(&s.project_id, Some(s.id.clone()), "warn", format!("{} 님의 「{}」 세션이 {}분 넘게 멈춰 있습니다.", owner, s.title, mins.max(1)));
        if help >= 2 {
            if let Some(next) = next_task_for(st, &s.project_id, &s.owner_id) {
                let kind = if help >= 3 { "req" } else { "coach" };
                let text = if help >= 3 {
                    format!("[AI 본부장 지시] 다음 일: {} — 끝나면 산출물을 올리고 완료 표시해 주세요.", next.title)
                } else {
                    format!("[AI 본부장 제안] 쉬는 동안 이 일을 하면 좋겠습니다: {}", next.title)
                };
                st.push_log(&s.id, LogLine { ts: now, kind: kind.into(), text, from: AGENT_ID.into() });
            }
        }
        changed = true;
    }

    // 2) 오래 기다리는 합치기 요청
    let waiting: Vec<MergeRequest> = st.requests.iter()
        .filter(|r| r.status == "대기" && now.saturating_sub(r.ts) > cfg.request_wait_ms).cloned().collect();
    for r in waiting {
        let title = st.sessions.iter().find(|s| s.id == r.to_session).map(|s| s.title.clone()).unwrap_or_default();
        let before = st.coach.len();
        st.add_coach(&r.project_id, Some(r.to_session.clone()), "warn", format!("「{}」에 합치기 요청이 5분 넘게 대기 중입니다: {}", title, r.note));
        changed |= st.coach.len() != before;
    }

    // 3) 계획서 검수: 완료라는데 산출물 없음
    let missing: Vec<PlanItem> = st.plan.iter().filter(|p| p.done && p.artifact_id.is_none()).cloned().collect();
    for p in missing {
        let before = st.coach.len();
        st.add_coach(&p.project_id, None, "check", format!("검수: 「{}」는 완료 표시됐지만 연결된 산출물이 없습니다. 빠진 것이 없는지 확인해 주세요.", p.title));
        changed |= st.coach.len() != before;
    }
    changed
}

fn next_task_for(st: &State, project_id: &str, owner_id: &str) -> Option<PlanItem> {
    st.plan.iter().find(|p| p.project_id == project_id && !p.done && p.owner_id == owner_id).cloned()
        .or_else(|| st.plan.iter().find(|p| p.project_id == project_id && !p.done && p.owner_id.is_empty()).cloned())
}

/// 프로젝트 점검 보고서(당일 후속 계획 포함)를 만들고 본부장 채널에 올린다.
pub fn review(st: &mut State, project_id: &str, now: u64) -> String {
    let Some(p) = st.projects.iter().find(|p| p.id == project_id).cloned() else { return String::new(); };
    let items: Vec<PlanItem> = st.plan.iter().filter(|x| x.project_id == project_id).cloned().collect();
    let done = items.iter().filter(|x| x.done).count();
    let sessions: Vec<Session> = st.sessions.iter().filter(|s| s.project_id == project_id).cloned().collect();
    let working = sessions.iter().filter(|s| s.status == "working").count();
    let stalled: Vec<&Session> = sessions.iter().filter(|s| s.status == "stalled").collect();
    let pending = st.requests.iter().filter(|r| r.project_id == project_id && r.status == "대기").count();

    let mut out = format!("📋 「{}」 점검 보고\n· 계획 {}건 중 {}건 완료\n· 세션 {}개 중 {}개 가동, {}개 멈춤\n· 합치기 대기 {}건\n", p.name, items.len(), done, sessions.len(), working, stalled.len(), pending);
    if p.goal.trim().is_empty() {
        out.push_str("⚠ 목표가 비어 있습니다. 이 채널에 「목표: …」라고 적어 주시면 위키와 대시보드에 반영합니다.\n");
    }
    out.push_str("\n🗓 오늘 후속 계획 (노는 세션 없이)\n");
    let mut n = 0;
    for mid in p.members.iter() {
        let name = st.member_name(mid);
        let todo: Vec<&PlanItem> = items.iter().filter(|x| !x.done && &x.owner_id == mid).collect();
        let idle = sessions.iter().filter(|s| &s.owner_id == mid && s.status != "working").count();
        if todo.is_empty() {
            out.push_str(&format!("· {}: 남은 계획 없음 → 다음 일을 정해 주세요{}\n", name, if idle > 0 { format!(" (쉬는 세션 {}개)", idle) } else { String::new() }));
        } else {
            for t in todo.iter().take(3) {
                n += 1;
                out.push_str(&format!("{}. {} — {}\n", n, name, t.title));
            }
        }
    }
    let unassigned: Vec<&PlanItem> = items.iter().filter(|x| !x.done && x.owner_id.is_empty()).collect();
    if !unassigned.is_empty() {
        out.push_str(&format!("· 담당자 없는 일 {}건: {}\n", unassigned.len(), unassigned.iter().map(|x| x.title.as_str()).collect::<Vec<_>>().join(", ")));
    }
    st.agent_post(project_id, out.clone());

    // 위키에 오늘 요약을 남긴다
    let title = "오늘의 진행 요약".to_string();
    if let Some(w) = st.wiki.iter_mut().find(|w| w.project_id == project_id && w.title == title) {
        w.body = out.clone(); w.updated_at = now; w.by = AGENT_ID.into();
    } else {
        let id = st.next_id("w");
        st.wiki.push(WikiPage { id, project_id: project_id.into(), title, body: out.clone(), scope: "team".into(), by: AGENT_ID.into(), updated_at: now });
    }
    out
}

/// 메신저 글에 본부장이 반응해야 하는지
pub fn should_answer(st: &State, m: &Message) -> bool {
    if m.from == AGENT_ID { return false; }
    if m.text.contains("@본부장") { return true; }
    st.channels.iter().any(|c| c.id == m.channel_id && c.name == "본부장")
}

/// 규칙으로 바로 할 수 있는 일(목표 기록 등)을 하고, 규칙 답을 돌려준다.
pub fn rule_answer(st: &mut State, m: &Message, now: u64) -> String {
    let Some(pid) = st.channels.iter().find(|c| c.id == m.channel_id).map(|c| c.project_id.clone()) else { return String::new(); };
    let text = m.text.replace("@본부장", "").trim().to_string();
    let who = st.member_name(&m.from);

    if let Some(goal) = text.strip_prefix("목표:").or_else(|| text.strip_prefix("목표 :")) {
        let goal = goal.trim().to_string();
        if let Some(p) = st.projects.iter_mut().find(|p| p.id == pid) { p.goal = goal.clone(); }
        upsert_wiki(st, &pid, "프로젝트 목표", &goal, now);
        return format!("목표를 「{}」로 기록했습니다. 이 목표를 이루려면 오늘 무엇부터 끝나야 할까요? 한 줄씩 「할 일: …」로 적어 주세요.", goal);
    }
    if let Some(task) = text.strip_prefix("할 일:").or_else(|| text.strip_prefix("할일:")) {
        let id = st.next_id("t");
        st.plan.push(PlanItem { id, project_id: pid.clone(), title: task.trim().into(), owner_id: m.from.clone(), done: false, artifact_id: None, when: "오늘".into() });
        return format!("「{}」를 {} 님의 오늘 계획에 넣었습니다. 세션이 멈추면 이 일을 먼저 맡기겠습니다.", task.trim(), who);
    }
    if text.contains("점검") || text.contains("계획") || text.contains("현황") {
        return review(st, &pid, now);
    }
    // 의도를 위키에 기록하고 되묻는다
    let mut log = st.wiki.iter().find(|w| w.project_id == pid && w.title == "사람들의 생각 기록").map(|w| w.body.clone()).unwrap_or_default();
    log.push_str(&format!("- {}: {}\n", who, text));
    upsert_wiki(st, &pid, "사람들의 생각 기록", &log, now);
    format!("{} 님 말씀을 위키 「사람들의 생각 기록」에 남겼습니다. 이걸로 최종적으로 무엇을 만들고 싶으신지, 누가 쓰게 되는지 한 줄로 알려 주시겠어요? (「목표: …」, 「할 일: …」, 「점검」 이라고 쓰시면 바로 반영합니다)", who)
}

fn upsert_wiki(st: &mut State, pid: &str, title: &str, body: &str, now: u64) {
    if let Some(w) = st.wiki.iter_mut().find(|w| w.project_id == pid && w.title == title) {
        w.body = body.into(); w.updated_at = now; w.by = AGENT_ID.into();
    } else {
        let id = st.next_id("w");
        st.wiki.push(WikiPage { id, project_id: pid.into(), title: title.into(), body: body.into(), scope: "team".into(), by: AGENT_ID.into(), updated_at: now });
    }
}

/// 클로드에게 넘길 프로젝트 요약(위키 + 계획 + 세션 상태)
pub fn context_for(st: &State, project_id: &str) -> String {
    let p = st.projects.iter().find(|p| p.id == project_id);
    let mut s = String::new();
    if let Some(p) = p { s.push_str(&format!("프로젝트: {}\n목표: {}\n지침: {}\n", p.name, p.goal, p.guide)); }
    s.push_str("\n[지식위키]\n");
    for w in st.wiki.iter().filter(|w| w.project_id == project_id) { s.push_str(&format!("## {}\n{}\n", w.title, w.body)); }
    s.push_str("\n[계획]\n");
    for t in st.plan.iter().filter(|t| t.project_id == project_id) {
        s.push_str(&format!("- [{}] {} (담당 {})\n", if t.done { "완료" } else { "진행" }, t.title, st.member_name(&t.owner_id)));
    }
    s.push_str("\n[세션]\n");
    for x in st.sessions.iter().filter(|x| x.project_id == project_id) {
        s.push_str(&format!("- {} / {} / {}\n", st.member_name(&x.owner_id), x.title, x.status));
    }
    s
}

/// 클로드 메시지 기능을 직접 불러 본부장 답을 쓴다. 실패하면 None (규칙 답으로 대신).
pub async fn claude_answer(cfg: &AgentCfg, context: &str, who: &str, question: &str) -> Option<String> {
    let key = cfg.api_key.as_ref()?;
    let system = "너는 「잇다」 협업 앱의 AI 본부장이다. 팀의 지식위키와 계획을 바탕으로 사람의 의도를 묻고, 빠진 일을 짚고, 당일 끊김 없는 후속 계획을 제안한다. 반드시 쉬운 한국어로만, 다섯 줄 이내로 답한다. 영어 단어를 쓰지 않는다.";
    let body = json!({
        "model": cfg.model,
        "max_tokens": 2000,
        "output_config": {"effort": "low"},
        "fallbacks": "default",
        "system": system,
        "messages": [{"role": "user", "content": format!("{}\n\n[{} 님의 말]\n{}", context, who, question)}]
    });
    let client = reqwest::Client::new();
    let res = client.post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", key)
        .header("anthropic-version", "2026-10-21")
        .header("anthropic-beta", "server-side-fallback-2026-07-01")
        .header("content-type", "application/json")
        .json(&body)
        .timeout(std::time::Duration::from_secs(90))
        .send().await.ok()?;
    if !res.status().is_success() {
        eprintln!("본부장: 클로드 호출 실패 {}", res.status());
        return None;
    }
    let v: serde_json::Value = res.json().await.ok()?;
    if v.get("stop_reason").and_then(|x| x.as_str()) == Some("refusal") { return None; }
    let text: String = v.get("content")?.as_array()?.iter()
        .filter(|b| b.get("type").and_then(|t| t.as_str()) == Some("text"))
        .filter_map(|b| b.get("text").and_then(|t| t.as_str()))
        .collect::<Vec<_>>().join("\n");
    if text.trim().is_empty() { None } else { Some(text) }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn base() -> State {
        let mut st = State::default();
        st.upsert_member(Member { id: "u1".into(), name: "김디자".into(), computer: "디자인PC".into(), help_level: 3, ..Default::default() });
        st.apply("u1", Op::CreateProject { name: "신규 앱".into(), kind: "개발".into(), goal: String::new() }).ok();
        st
    }

    #[test]
    fn 멈춘_세션에_일을_시킨다() {
        let mut st = base();
        let pid = st.projects[0].id.clone();
        st.apply("u1", Op::OpenSession { project_id: pid.clone(), title: "디자인".into(), is_main: true }).ok();
        st.apply("u1", Op::Plan { project_id: pid.clone(), id: None, title: Some("로그인 화면 시안".into()), owner_id: None, done: None, artifact_id: None, when: None }).ok();
        let sid = st.sessions.iter().find(|s| s.title == "디자인").unwrap().id.clone();
        let later = now_ms() + 10 * 60_000;
        assert!(tick(&mut st, later, &AgentCfg { api_key: None, ..Default::default() }));
        let s = st.sessions.iter().find(|s| s.id == sid).unwrap();
        assert_eq!(s.status, "stalled");
        let last = st.logs[&sid].last().unwrap();
        assert_eq!(last.kind, "req");
        assert!(last.text.contains("로그인 화면 시안"));
    }

    #[test]
    fn 완료인데_산출물_없으면_검수() {
        let mut st = base();
        let pid = st.projects[0].id.clone();
        st.apply("u1", Op::Plan { project_id: pid, id: None, title: Some("요금표".into()), owner_id: None, done: Some(true), artifact_id: None, when: None }).ok();
        tick(&mut st, now_ms(), &AgentCfg { api_key: None, ..Default::default() });
        assert!(st.coach.iter().any(|c| c.level == "check" && c.text.contains("요금표")));
    }

    #[test]
    fn 메신저에서_목표와_할일을_받는다() {
        let mut st = base();
        let ch = st.channels.iter().find(|c| c.name == "본부장").unwrap().id.clone();
        let m = st.post_as(&ch, "u1", "목표: 12월에 사내 시범 출시".into(), None);
        assert!(should_answer(&st, &m));
        let a = rule_answer(&mut st, &m, now_ms());
        assert!(a.contains("12월"));
        assert_eq!(st.projects[0].goal, "12월에 사내 시범 출시");
        let m2 = st.post_as(&ch, "u1", "할 일: 아이콘 정리".into(), None);
        rule_answer(&mut st, &m2, now_ms());
        assert!(st.plan.iter().any(|p| p.title == "아이콘 정리"));
    }

    #[test]
    fn 산출물_버전이_오른다() {
        let mut st = base();
        let pid = st.projects[0].id.clone();
        let sid = st.sessions[0].id.clone();
        for _ in 0..3 {
            st.apply("u1", Op::PublishArtifact { project_id: pid.clone(), session_id: sid.clone(), name: "시안.png".into(), kind: "디자인".into(), content: String::new(), note: String::new(), artifact_id: None }).ok();
        }
        assert_eq!(st.artifacts.len(), 1);
        assert_eq!(st.artifacts[0].versions.len(), 3);
    }

    #[test]
    fn 합치기_요청이_팀메인에_도착한다() {
        let mut st = base();
        let pid = st.projects[0].id.clone();
        let team = st.sessions[0].id.clone();
        st.apply("u1", Op::OpenSession { project_id: pid, title: "디자인".into(), is_main: true }).ok();
        let mine = st.sessions[1].id.clone();
        st.apply("u1", Op::SendRequest { from_session: mine, to_session: team.clone(), artifact_id: None, note: "로그인 시안 합쳐 주세요".into() }).unwrap();
        assert_eq!(st.requests.len(), 1);
        assert!(st.logs[&team].iter().any(|l| l.kind == "req"));
    }
}
