# 아이센스투게더 중계 서버 이미지 (다단계 빌드)
# 빌드 위치: 작업 묶음 루트(itda/) 에서
#   docker build -f deploy/Dockerfile -t itda-relay .

# 1단계: 러스트로 중계 서버 빌드
FROM rust:1-bookworm AS build
WORKDIR /src
COPY . .
RUN cargo build --release --locked -p itda-relay

# 2단계: 작은 리눅스 이미지에 실행 파일과 화면 폴더만 담기
FROM debian:bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl \
 && rm -rf /var/lib/apt/lists/* \
 && useradd --system --create-home --home-dir /app --shell /usr/sbin/nologin itda
WORKDIR /app
COPY --from=build /src/target/release/itda-relay /app/itda-relay
COPY app/ui /app/ui
USER itda
ENV TZ=Asia/Seoul
EXPOSE 7878
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://127.0.0.1:7878/health || exit 1
# 설정은 모두 환경 변수(TOGETHER_*)로 받는다. 포트와 화면 폴더만 여기서 지정.
ENTRYPOINT ["/app/itda-relay", "--port", "7878", "--ui", "/app/ui"]
