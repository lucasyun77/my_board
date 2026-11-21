//! 실제 `git` 으로 하는 시험. 임시 폴더에 원격 역할의 빈 저장소를 만들어 쓴다.

use itda_git::*;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Once;

static 한번: Once = Once::new();
static 번호: AtomicU32 = AtomicU32::new(0);

/// 이 컴퓨터의 깃 설정(이름·이메일 등)에 시험이 영향받지 않게 한다
fn 환경_준비() {
    한번.call_once(|| {
        std::env::set_var("GIT_CONFIG_GLOBAL", "/dev/null");
        std::env::set_var("GIT_CONFIG_NOSYSTEM", "1");
    });
}

fn 임시폴더(이름: &str) -> PathBuf {
    환경_준비();
    let n = 번호.fetch_add(1, Ordering::SeqCst);
    let p = std::env::temp_dir().join(format!("itda-git-시험-{}-{}-{}", std::process::id(), 이름, n));
    let _ = std::fs::remove_dir_all(&p);
    std::fs::create_dir_all(&p).unwrap();
    p
}

fn 깃(dir: &Path, args: &[&str]) -> String {
    let o = Command::new("git")
        .args(["-c", "core.quotepath=false"])
        .args(args)
        .current_dir(dir)
        .env("GIT_AUTHOR_NAME", "시험")
        .env("GIT_AUTHOR_EMAIL", "t@t")
        .env("GIT_COMMITTER_NAME", "시험")
        .env("GIT_COMMITTER_EMAIL", "t@t")
        .output()
        .unwrap();
    assert!(o.status.success(), "깃 {:?} 실패: {}", args, String::from_utf8_lossy(&o.stderr));
    String::from_utf8_lossy(&o.stdout).trim().to_string()
}

/// 원격(빈 저장소) + 기본 갈래 main 에 첫 기록이 있는 상태를 만든다
fn 원격_만들기(이름: &str) -> (PathBuf, PathBuf) {
    let 뿌리 = 임시폴더(이름);
    let 원격 = 뿌리.join("원격.git");
    std::fs::create_dir_all(&원격).unwrap();
    깃(&원격, &["init", "--bare", "-b", "main"]);
    let 씨앗 = 뿌리.join("씨앗");
    std::fs::create_dir_all(&씨앗).unwrap();
    깃(&씨앗, &["init", "-b", "main"]);
    std::fs::write(씨앗.join("README.md"), "처음\n").unwrap();
    깃(&씨앗, &["add", "-A"]);
    깃(&씨앗, &["commit", "-m", "처음"]);
    깃(&씨앗, &["remote", "add", "origin", 원격.to_str().unwrap()]);
    깃(&씨앗, &["push", "-u", "origin", "main"]);
    (뿌리, 원격)
}

fn 준비(원격: &Path, dir: &Path, 갈래: &str) -> Prepared {
    prepare(&PrepareArgs { repo: 원격.to_str().unwrap(), base_branch: "main", branch: 갈래, dir }).unwrap()
}

#[test]
fn 깃_확인() {
    let c = check();
    assert!(c.installed);
    assert!(c.version.starts_with('2'), "버전: {}", c.version);
}

#[test]
fn 복제부터_올리기까지() {
    let (뿌리, 원격) = 원격_만들기("흐름");
    let 갈래 = branch_name("홍 길동", "로그인 고치기");
    let dir = 뿌리.join("복제A");

    let p = 준비(&원격, &dir, &갈래);
    assert_eq!(p.branch, 갈래);
    assert!(p.created);
    assert_eq!(head(&dir).unwrap().branch, 갈래);

    // 아직 아무것도 안 바꿈
    let s = status(&dir).unwrap();
    assert_eq!((s.changed, s.ahead, s.behind), (0, 0, 0));

    // 한글 파일 이름
    std::fs::write(dir.join("보고서 최종.txt"), "내용\n").unwrap();
    std::fs::write(dir.join("b.txt"), "b\n").unwrap();
    let s = status(&dir).unwrap();
    assert_eq!(s.changed, 2);

    let r = save_push(&dir, "한글 파일 추가", None, None).unwrap();
    assert!(r.pushed && !r.nothing_to_commit);
    assert_eq!(r.branch, 갈래);
    assert_eq!(r.commit, head(&dir).unwrap().commit);
    // 이름 설정이 없으니 기본값이 쓰였다
    assert_eq!(깃(&dir, &["log", "-1", "--format=%an <%ae>"]), "아이센스투게더 <together@localhost>");
    // 원격에 한글 이름 그대로
    let 목록 = 깃(&원격, &["ls-tree", "--name-only", &갈래]);
    assert!(목록.contains("보고서 최종.txt"), "원격 목록: {목록}");

    let s = status(&dir).unwrap();
    assert_eq!((s.changed, s.ahead, s.behind), (0, 0, 0));
    assert_eq!(s.head, r.commit);

    // 바뀐 게 없을 때
    let r2 = save_push(&dir, "또", None, None).unwrap();
    assert!(r2.nothing_to_commit && r2.pushed);
    assert_eq!(r2.commit, r.commit);

    // 인자로 이름을 준다
    std::fs::write(dir.join("c.txt"), "c\n").unwrap();
    save_push(&dir, "이름 지정", Some("김철수"), Some("kim@example.com")).unwrap();
    assert_eq!(깃(&dir, &["log", "-1", "--format=%an <%ae>"]), "김철수 <kim@example.com>");

    // 올리지 않은 기록 수
    std::fs::write(dir.join("d.txt"), "d\n").unwrap();
    깃(&dir, &["add", "-A"]);
    깃(&dir, &["commit", "-m", "로컬만"]);
    assert_eq!(status(&dir).unwrap().ahead, 1);

    // 이미 있는 폴더에 다시 준비 → 새로 만들지 않음, 같은 갈래
    let p2 = 준비(&원격, &dir, &갈래);
    assert!(!p2.created);
    assert_eq!(p2.branch, 갈래);
}

#[test]
fn 처음_올리는_갈래의_올리지_않은_기록수() {
    let (뿌리, 원격) = 원격_만들기("앞서");
    let dir = 뿌리.join("복제");
    준비(&원격, &dir, "together/a/b");
    std::fs::write(dir.join("x.txt"), "x").unwrap();
    깃(&dir, &["add", "-A"]);
    깃(&dir, &["commit", "-m", "x"]);
    assert_eq!(status(&dir).unwrap().ahead, 1);
}

#[test]
fn 두_사람이_같은_갈래에_올리면_한번_다시_시도한다() {
    let (뿌리, 원격) = 원격_만들기("재시도");
    let 갈래 = "together/공용/세션";
    let a = 뿌리.join("A");
    let b = 뿌리.join("B");
    assert!(준비(&원격, &a, 갈래).created);
    // 첫 사람이 갈래를 올리기 전이라 B 도 새로 만든다 → 먼저 A 가 올린다
    std::fs::write(a.join("a.txt"), "a\n").unwrap();
    save_push(&a, "A 첫 저장", None, None).unwrap();
    // B 는 이제 원격에 있는 갈래를 이어받는다
    let pb = 준비(&원격, &b, 갈래);
    assert!(!pb.created);
    // A 가 한 번 더 올린다
    std::fs::write(a.join("a2.txt"), "a2\n").unwrap();
    save_push(&a, "A 둘째 저장", None, None).unwrap();
    // B 는 모르는 채 다른 파일을 고쳐 올린다 → 거절 → 받아서 얹고 재시도
    std::fs::write(b.join("b.txt"), "b\n").unwrap();
    let r = save_push(&b, "B 저장", None, None).unwrap();
    assert!(r.pushed);
    let 원격파일 = 깃(&원격, &["ls-tree", "--name-only", 갈래]);
    for f in ["a.txt", "a2.txt", "b.txt"] {
        assert!(원격파일.contains(f), "{f} 가 원격에 없음: {원격파일}");
    }
    assert_eq!(깃(&원격, &["rev-parse", 갈래]), r.commit);
    let s = status(&b).unwrap();
    assert_eq!((s.ahead, s.behind), (0, 0));
}

#[test]
fn 같은_곳을_고치면_합치지_못했다고_알린다() {
    let (뿌리, 원격) = 원격_만들기("충돌");
    let 갈래 = "together/공용/충돌";
    let a = 뿌리.join("A");
    let b = 뿌리.join("B");
    준비(&원격, &a, 갈래);
    std::fs::write(a.join("README.md"), "A 가 고침\n").unwrap();
    save_push(&a, "A", None, None).unwrap();
    준비(&원격, &b, 갈래);
    std::fs::write(a.join("README.md"), "A 가 또 고침\n").unwrap();
    save_push(&a, "A2", None, None).unwrap();
    std::fs::write(b.join("README.md"), "B 가 고침\n").unwrap();
    let e = save_push(&b, "B", None, None).unwrap_err();
    assert!(e.contains("다른 사람이 먼저 올렸습니다"), "{e}");
    assert!(e.contains("자동으로 합치지 못했습니다"), "{e}");
    // 합치기 도중 상태로 남지 않고, 내 저장 기록은 그대로 있다
    assert!(!b.join(".git/rebase-merge").exists() && !b.join(".git/rebase-apply").exists());
    assert_eq!(head(&b).unwrap().branch, 갈래);
}

#[test]
fn 팀_메인에서_작업_갈래를_합칠_수_있다() {
    let (뿌리, 원격) = 원격_만들기("합치기");
    let 갈래 = branch_name("홍길동", "기능 추가");
    let 작업 = 뿌리.join("작업");
    준비(&원격, &작업, &갈래);
    std::fs::write(작업.join("기능.txt"), "기능\n").unwrap();
    save_push(&작업, "기능 추가", None, None).unwrap();

    // 팀 메인: 기본 갈래 그대로
    let 메인 = 뿌리.join("메인");
    let pm = 준비(&원격, &메인, "");
    assert_eq!((pm.branch.as_str(), pm.created), ("main", false));
    // 그 사이 메인에도 다른 기록이 올라가 있다고 가정(합치기 기록이 실제로 생기게)
    std::fs::write(메인.join("메인것.txt"), "m\n").unwrap();
    save_push(&메인, "메인 기록", Some("팀메인"), None).unwrap();

    // 설계서 4장의 깃 부분: 가져와서 합치고 올린다
    깃(&메인, &["fetch", "origin"]);
    깃(&메인, &["merge", "--no-ff", &format!("origin/{갈래}"), "-m", "합치기"]);
    깃(&메인, &["push", "origin", "main"]);
    let 목록 = 깃(&원격, &["ls-tree", "--name-only", "main"]);
    assert!(목록.contains("기능.txt") && 목록.contains("메인것.txt"), "{목록}");
    assert_eq!(깃(&원격, &["log", "-1", "--format=%P", "main"]).split(' ').count(), 2);

    // 메인을 다시 준비하면 최신으로 맞춰진다
    let 다른메인 = 뿌리.join("다른메인");
    준비(&원격, &다른메인, "main");
    assert_eq!(head(&다른메인).unwrap().commit, 깃(&원격, &["rev-parse", "main"]));
}

#[test]
fn 오류는_한국어로() {
    let 뿌리 = 임시폴더("오류");
    let e = prepare(&PrepareArgs {
        repo: 뿌리.join("없는저장소").to_str().unwrap(),
        base_branch: "main",
        branch: "together/a/b",
        dir: &뿌리.join("복제"),
    })
    .unwrap_err();
    assert_eq!(e, "저장소에 접근할 수 없습니다");

    let (뿌리2, 원격) = 원격_만들기("오류2");
    let e = prepare(&PrepareArgs {
        repo: 원격.to_str().unwrap(),
        base_branch: "없는갈래",
        branch: "",
        dir: &뿌리2.join("복제"),
    })
    .unwrap_err();
    assert!(e.contains("기본 갈래") && e.contains("찾을 수 없습니다"), "{e}");

    // 저장소가 아닌 폴더
    let e = status(&뿌리2).unwrap_err();
    assert!(e.contains("깃 작업에 실패했습니다"), "{e}");
}

#[test]
fn 기본_폴더_위치() {
    let p = default_dir(Path::new("/문서"), "isens/my-app.git", "ses_01");
    assert_eq!(p, Path::new("/문서/iSensTogether/저장소/my-app-ses_01"));
}
