//! 아이센스투게더 데스크톱 앱 안에서 진짜 클로드 코드 세션을 잇다 세션 하나마다 하나씩 켜 두고 대화를 이어 가는 부품.
//!
//! 나눔
//!  - `parse`   : 클로드 코드 신호 한 줄 → 정규화된 사건
//!  - `process` : 프로세스 하나(찾기·켜기·보내기·끄기, 윈도우 처리)
//!  - `store`   : 잇다 세션 번호 → 클로드 세션 번호 연결표(JSON 파일)
//!  - `manager` : 잇다 세션별 프로세스 관리, 다시 켤 때 `--resume` 으로 이어 가기
//!
//! 이 묶음은 타우리에 기대지 않는다. 그래서 리눅스에서 `cargo test -p itda-claude` 로 시험할 수 있다.

pub mod manager;
pub mod parse;
pub mod process;
pub mod store;

pub use manager::{folder_name, Manager, SessionSink, StartReply, StartRequest, Status, MSG_RESUME_FAILED};
pub use parse::{parse_line, Event, Kind};
pub use process::{find_claude, ClaudeProcess, StartOptions, NOT_INSTALLED};
pub use store::{Link, SessionMap};
