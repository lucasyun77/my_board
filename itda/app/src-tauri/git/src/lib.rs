//! 이 컴퓨터에 설치된 `git` 명령을 불러 쓰는 작은 묶음.
//! 설계서 `itda/docs/10-깃허브합치기설계.md` 3장의 다섯 가지(check, prepare, status, save_push, head)와
//! 작업 갈래 이름 만들기(`branch_name`)를 한다. 오류는 모두 한국어 문장으로 돌려준다.

use serde::Serialize;
use std::path::{Path, PathBuf};
use std::process::Command;

/// 사용자 이름·이메일이 설정되어 있지 않을 때 쓰는 기본값
pub const 기본_이름: &str = "아이센스투게더";
pub const 기본_이메일: &str = "together@localhost";

const 오류_깃없음: &str = "깃이 설치되어 있지 않습니다. 윈도우용 깃을 설치해 주세요";
const 오류_로그인: &str = "깃허브 로그인이 필요합니다";
const 오류_접근: &str = "저장소에 접근할 수 없습니다";
const 오류_앞섬: &str = "다른 사람이 먼저 올렸습니다. 받아서 다시 시도합니다";

// ---------- 돌려주는 모양(화면과 맺은 약속: 낙타 표기) ----------

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct CheckResult {
    pub installed: bool,
    pub version: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct Prepared {
    pub dir: String,
    pub branch: String,
    pub created: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct Status {
    pub branch: String,
    pub changed: u32,
    pub ahead: u32,
    pub behind: u32,
    pub head: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SavePushed {
    pub branch: String,
    pub commit: String,
    pub pushed: bool,
    pub nothing_to_commit: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct Head {
    pub branch: String,
    pub commit: String,
}

// ---------- 깃 실행 ----------

struct 결과 {
    ok: bool,
    out: String,
    err: String,
}

fn 깃_실행(dir: Option<&Path>, extra: &[&str], args: &[&str]) -> Result<결과, String> {
    let mut c = Command::new("git");
    c.args(["-c", "core.quotepath=false"]);
    c.args(extra);
    c.args(args);
    if let Some(d) = dir {
        c.current_dir(d);
    }
    // 입력을 기다리며 멈추지 않게 한다(로그인 창은 자격 증명 관리자가 띄운다)
    c.env("GIT_TERMINAL_PROMPT", "0");
    c.env("LC_ALL", "C");
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        c.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    let o = c.output().map_err(|e| {
        if e.kind() == std::io::ErrorKind::NotFound {
            오류_깃없음.to_string()
        } else {
            format!("깃을 실행하지 못했습니다: {e}")
        }
    })?;
    Ok(결과 {
        ok: o.status.success(),
        out: String::from_utf8_lossy(&o.stdout).trim().to_string(),
        err: String::from_utf8_lossy(&o.stderr).trim().to_string(),
    })
}

/// 깃이 낸 오류 글을 사람이 알아듣는 한국어로 바꾼다
fn 오류_한글(err: &str) -> String {
    let e = err.to_lowercase();
    if e.contains("authentication failed")
        || e.contains("could not read username")
        || e.contains("could not read password")
        || e.contains("terminal prompts disabled")
        || e.contains("invalid username or password")
    {
        return 오류_로그인.into();
    }
    if e.contains("repository not found")
        || e.contains("not found")
        || e.contains("permission denied")
        || e.contains("access denied")
        || e.contains("returned error: 403")
        || e.contains("could not resolve host")
        || e.contains("does not appear to be a git repository")
        || e.contains("does not exist")
        || e.contains("unable to access")
    {
        return 오류_접근.into();
    }
    if 원격이_앞섬(&e) {
        return 오류_앞섬.into();
    }
    let 첫줄 = err.lines().find(|l| !l.trim().is_empty()).unwrap_or("알 수 없는 오류");
    format!("깃 작업에 실패했습니다: {첫줄}")
}

fn 원격이_앞섬(e_소문자: &str) -> bool {
    e_소문자.contains("non-fast-forward")
        || e_소문자.contains("fetch first")
        || e_소문자.contains("[rejected]")
        || e_소문자.contains("failed to push some refs")
}

fn 성공만(r: 결과) -> Result<String, String> {
    if r.ok {
        Ok(r.out)
    } else {
        Err(오류_한글(&r.err))
    }
}

fn 실행(dir: &Path, args: &[&str]) -> Result<String, String> {
    성공만(깃_실행(Some(dir), &[], args)?)
}

// ---------- 갈래 이름 ----------

fn 허용_글자(c: char) -> bool {
    c.is_ascii_alphanumeric()
        || ('\u{AC00}'..='\u{D7A3}').contains(&c)
        || ('\u{3131}'..='\u{318E}').contains(&c)
}

fn 이름_조각(s: &str, 비었을때: &str) -> String {
    let mut 줄임 = String::new();
    for c in s.trim().chars() {
        let 글자 = if 허용_글자(c) {
            c
        } else if c.is_whitespace() || c == '-' {
            '-'
        } else {
            continue; // 점·밑줄·~^:?*[\ 등은 버린다
        };
        if 글자 == '-' && 줄임.ends_with('-') {
            continue;
        }
        줄임.push(글자);
    }
    let 자름: String = 줄임.trim_matches('-').chars().take(50).collect();
    let 자름 = 자름.trim_matches('-').to_string();
    if 자름.is_empty() {
        비었을때.to_string()
    } else {
        자름
    }
}

/// `together/<사람>/<세션>` — 영문·숫자·한글·하이픈만 남긴다.
pub fn branch_name(person: &str, session_title: &str) -> String {
    format!(
        "together/{}/{}",
        이름_조각(person, "사람"),
        이름_조각(session_title, "세션")
    )
}

// ---------- 다섯 가지 ----------

pub fn check() -> CheckResult {
    match 깃_실행(None, &[], &["--version"]) {
        Ok(r) if r.ok => CheckResult {
            installed: true,
            version: r.out.trim_start_matches("git version ").to_string(),
        },
        _ => CheckResult { installed: false, version: String::new() },
    }
}

/// `repo` 는 `소유자/이름` 또는 주소 전체
fn 복제_주소(repo: &str) -> String {
    let r = repo.trim();
    if r.contains("://") || r.starts_with("git@") || Path::new(r).is_absolute() {
        r.to_string()
    } else {
        format!("https://github.com/{}.git", r.trim_end_matches(".git"))
    }
}

/// 저장소 이름(소유자·확장자 뺀 마지막 조각)
pub fn repo_name(repo: &str) -> String {
    let r = repo.trim().trim_end_matches('/').trim_end_matches(".git");
    let last = r.rsplit(['/', ':', '\\']).next().unwrap_or(r);
    이름_조각(last, "저장소")
}

/// 폴더 이름에 쓸 수 있게: 글자·숫자·하이픈·밑줄만 남기고 나머지는 하이픈
fn 폴더_조각(s: &str) -> String {
    let t: String = s.trim().chars().map(|c| if 허용_글자(c) || c == '-' || c == '_' { c } else { '-' }).collect();
    if t.is_empty() { "세션".into() } else { t }
}

/// 폴더를 비워 두면 쓰는 기본 위치 `<문서>/iSensTogether/저장소/<저장소이름>-<sessionId>`
pub fn default_dir(documents: &Path, repo: &str, session_id: &str) -> PathBuf {
    documents
        .join("iSensTogether")
        .join("저장소")
        .join(format!("{}-{}", repo_name(repo), 폴더_조각(session_id)))
}

pub struct PrepareArgs<'a> {
    pub repo: &'a str,
    pub base_branch: &'a str,
    /// 비어 있거나 기본 갈래와 같으면 기본 갈래 그대로 쓴다(팀 메인 세션)
    pub branch: &'a str,
    pub dir: &'a Path,
}

pub fn prepare(a: &PrepareArgs) -> Result<Prepared, String> {
    let dir = a.dir;
    let base = a.base_branch.trim();
    if base.is_empty() {
        return Err("기본 갈래 이름이 비어 있습니다".into());
    }
    if !dir.join(".git").exists() {
        if let Some(p) = dir.parent() {
            std::fs::create_dir_all(p).map_err(|e| format!("폴더를 만들지 못했습니다: {e}"))?;
        }
        let d = dir.to_string_lossy().to_string();
        성공만(깃_실행(None, &[], &["clone", &복제_주소(a.repo), &d])?)?;
    }
    // 원격 소식 받기(작업 갈래는 아직 원격에 없을 수 있다)
    실행(dir, &["fetch", "origin", "--prune"])?;
    let base_원격 = format!("origin/{base}");
    if !갈래_있음(dir, &format!("refs/remotes/{base_원격}")) {
        return Err(format!("기본 갈래 「{base}」 를 원격에서 찾을 수 없습니다"));
    }

    let br = a.branch.trim();
    if br.is_empty() || br == base {
        // 기본 갈래 그대로, 최신으로
        if 갈래_있음(dir, &format!("refs/heads/{base}")) {
            실행(dir, &["checkout", base])?;
            실행(dir, &["merge", "--ff-only", &base_원격]).map_err(|_| {
                format!("기본 갈래 「{base}」 를 최신으로 맞추지 못했습니다(이 컴퓨터에 따로 저장한 기록이 있습니다)")
            })?;
        } else {
            실행(dir, &["checkout", "-b", base, "--track", &base_원격])?;
        }
        return Ok(Prepared { dir: 경로글(dir), branch: base.into(), created: false });
    }

    if 갈래_있음(dir, &format!("refs/heads/{br}")) {
        실행(dir, &["checkout", br])?;
        return Ok(Prepared { dir: 경로글(dir), branch: br.into(), created: false });
    }
    let br_원격 = format!("origin/{br}");
    if 갈래_있음(dir, &format!("refs/remotes/{br_원격}")) {
        실행(dir, &["checkout", "-b", br, "--track", &br_원격])?;
        return Ok(Prepared { dir: 경로글(dir), branch: br.into(), created: false });
    }
    // 기본 갈래에서 새로 만든다(추적은 처음 올릴 때 -u 로 맺는다)
    실행(dir, &["checkout", "-b", br, "--no-track", &base_원격])?;
    Ok(Prepared { dir: 경로글(dir), branch: br.into(), created: true })
}

fn 경로글(p: &Path) -> String {
    p.to_string_lossy().to_string()
}

fn 갈래_있음(dir: &Path, 전체이름: &str) -> bool {
    matches!(깃_실행(Some(dir), &[], &["show-ref", "--verify", "--quiet", 전체이름]), Ok(r) if r.ok)
}

fn 지금_갈래(dir: &Path) -> Result<String, String> {
    let b = 실행(dir, &["rev-parse", "--abbrev-ref", "HEAD"])?;
    if b == "HEAD" {
        return Err("지금 어느 갈래에도 있지 않습니다(옮겨 다니는 상태)".into());
    }
    Ok(b)
}

fn 지금_기록(dir: &Path) -> String {
    match 깃_실행(Some(dir), &[], &["rev-parse", "HEAD"]) {
        Ok(r) if r.ok => r.out,
        _ => String::new(),
    }
}

pub fn head(dir: &Path) -> Result<Head, String> {
    Ok(Head { branch: 지금_갈래(dir)?, commit: 지금_기록(dir) })
}

fn 바뀐_수(dir: &Path) -> Result<u32, String> {
    let s = 실행(dir, &["status", "--porcelain", "-uall"])?;
    Ok(s.lines().filter(|l| !l.trim().is_empty()).count() as u32)
}

pub fn status(dir: &Path) -> Result<Status, String> {
    let branch = 지금_갈래(dir)?;
    let changed = 바뀐_수(dir)?;
    // 원격 소식은 받을 수 있을 때만 받는다(실패해도 상태는 보여 준다)
    let _ = 깃_실행(Some(dir), &[], &["fetch", "origin", "--quiet"]);
    let (mut ahead, mut behind) = (0u32, 0u32);
    let 추적 = 깃_실행(Some(dir), &[], &["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"])?;
    if 추적.ok {
        let lr = 실행(dir, &["rev-list", "--left-right", "--count", "HEAD...@{u}"])?;
        let mut it = lr.split_whitespace();
        ahead = it.next().and_then(|v| v.parse().ok()).unwrap_or(0);
        behind = it.next().and_then(|v| v.parse().ok()).unwrap_or(0);
    } else if !지금_기록(dir).is_empty() {
        // 아직 올린 적 없는 갈래: 어느 원격에도 없는 기록 수
        let n = 실행(dir, &["rev-list", "--count", "HEAD", "--not", "--remotes"])?;
        ahead = n.trim().parse().unwrap_or(0);
    }
    Ok(Status { branch, changed, ahead, behind, head: 지금_기록(dir) })
}

fn 사용자_설정_있음(dir: &Path, 키: &str) -> bool {
    matches!(깃_실행(Some(dir), &[], &["config", 키]), Ok(r) if r.ok && !r.out.is_empty())
}

/// 바뀐 것을 모두 저장하고 원격에 올린다. 이름·이메일이 설정되어 있지 않으면 인자나 기본값을 쓴다.
pub fn save_push(
    dir: &Path,
    message: &str,
    user_name: Option<&str>,
    user_email: Option<&str>,
) -> Result<SavePushed, String> {
    let branch = 지금_갈래(dir)?;
    실행(dir, &["add", "-A"])?;
    let nothing = 바뀐_수(dir)? == 0;
    // 저장·받아서 얹기 모두 저장자 정보가 필요하다
    let extra: Vec<String> = {
        let mut extra: Vec<String> = Vec::new();
        if !사용자_설정_있음(dir, "user.name") {
            extra.push("-c".into());
            extra.push(format!(
                "user.name={}",
                user_name.filter(|s| !s.trim().is_empty()).unwrap_or(기본_이름)
            ));
        }
        if !사용자_설정_있음(dir, "user.email") {
            extra.push("-c".into());
            extra.push(format!(
                "user.email={}",
                user_email.filter(|s| !s.trim().is_empty()).unwrap_or(기본_이메일)
            ));
        }
        extra
    };
    let extra_ref: Vec<&str> = extra.iter().map(|s| s.as_str()).collect();
    if !nothing {
        let msg = if message.trim().is_empty() { "아이센스투게더 자동 저장" } else { message };
        성공만(깃_실행(Some(dir), &extra_ref, &["commit", "-m", msg])?)?;
    }
    올리기(dir, &branch, &extra_ref)?;
    Ok(SavePushed { branch, commit: 지금_기록(dir), pushed: true, nothing_to_commit: nothing })
}

fn 올리기(dir: &Path, branch: &str, extra: &[&str]) -> Result<(), String> {
    let r = 깃_실행(Some(dir), &[], &["push", "-u", "origin", branch])?;
    if r.ok {
        return Ok(());
    }
    if !원격이_앞섬(&r.err.to_lowercase()) {
        return Err(오류_한글(&r.err));
    }
    // 다른 사람이 먼저 올렸다: 받아서 얹고 한 번만 다시 시도한다
    let p = 깃_실행(Some(dir), extra, &["pull", "--rebase", "origin", branch])?;
    if !p.ok {
        let _ = 깃_실행(Some(dir), &[], &["rebase", "--abort"]);
        return Err(format!("{오류_앞섬}. 그런데 같은 곳을 함께 고쳐서 자동으로 합치지 못했습니다"));
    }
    성공만(깃_실행(Some(dir), &[], &["push", "-u", "origin", branch])?)?;
    Ok(())
}

#[cfg(test)]
mod 단위시험 {
    use super::*;

    #[test]
    fn 이름_규칙() {
        assert_eq!(branch_name("홍 길동", "로그인 고치기"), "together/홍-길동/로그인-고치기");
        assert_eq!(branch_name("a..b", "x.lock"), "together/ab/xlock");
        assert_eq!(branch_name("~^:?*[\\", "  "), "together/사람/세션");
        assert_eq!(branch_name("Kim", "fix--bug  now!"), "together/Kim/fix-bug-now");
    }

    #[test]
    fn 저장소_이름() {
        assert_eq!(repo_name("isens/my-app.git"), "my-app");
        assert_eq!(repo_name("https://github.com/isens/my-app/"), "my-app");
    }
}
