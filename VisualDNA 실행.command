#!/bin/bash
# VisualDNA Studio 런처 — Finder 에서 더블클릭으로 실행
# 실행 전 전제조건을 점검한 뒤 개발 서버를 띄우고 브라우저를 연다.

cd "$(dirname "$0")" || exit 1

BOLD=$'\033[1m'; DIM=$'\033[2m'; RED=$'\033[31m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'; OFF=$'\033[0m'
PORT="${PORT:-3000}"

say()  { printf '%s\n' "$1"; }
ok()   { printf '  %s✓%s %s\n' "$GREEN" "$OFF" "$1"; }
warn() { printf '  %s!%s %s\n' "$YELLOW" "$OFF" "$1"; }
bad()  { printf '  %s✗%s %s\n' "$RED" "$OFF" "$1"; }

die() {
  printf '\n%s실행할 수 없습니다.%s %s\n\n' "$RED$BOLD" "$OFF" "$1"
  printf '%s창을 닫으려면 아무 키나 누르세요.%s\n' "$DIM" "$OFF"
  read -r -n 1 -s
  exit 1
}

clear
say ""
say "${BOLD}VisualDNA Studio${OFF}"
say "${DIM}AI 웹 디자인 디렉터 — 참고 사이트로 디자인을 만들고, 고치고, 평가합니다${OFF}"
say ""
say "전제조건 확인"

# --- Node.js ---
# Finder 에서 실행하면 로그인 셸의 PATH 가 안 잡힐 수 있으므로 nvm 을 직접 읽는다
if ! command -v node >/dev/null 2>&1; then
  for profile in "$HOME/.zshrc" "$HOME/.bash_profile" "$HOME/.profile"; do
    [ -f "$profile" ] && . "$profile" >/dev/null 2>&1
  done
fi
if ! command -v node >/dev/null 2>&1 && [ -s "$HOME/.nvm/nvm.sh" ]; then
  . "$HOME/.nvm/nvm.sh" >/dev/null 2>&1
fi
command -v node >/dev/null 2>&1 || die "Node.js 를 찾지 못했습니다. https://nodejs.org 에서 설치하세요."

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null)"
if [ -z "$NODE_MAJOR" ] || [ "$NODE_MAJOR" -lt 20 ]; then
  die "Node.js 20 이상이 필요합니다. 현재 $(node -v)"
fi
ok "Node.js $(node -v)"

# --- AI 백엔드 CLI ---
ENGINE="${VDNA_ENGINE:-claude}"
if command -v "$ENGINE" >/dev/null 2>&1; then
  ok "$ENGINE CLI ($(command -v "$ENGINE"))"
else
  die "$ENGINE CLI 를 찾지 못했습니다.
     이 앱은 API 키가 아니라 로컬 CLI 를 호출합니다.
     claude CLI 를 설치·로그인한 뒤 다시 실행하세요.
     codex 를 쓰려면 VDNA_ENGINE=codex 로 실행하세요."
fi

# --- 의존성 ---
if [ ! -d node_modules ]; then
  warn "의존성이 없습니다. 지금 설치합니다 (몇 분 걸립니다)"
  npm install || die "npm install 실패"
  ok "의존성 설치 완료"
else
  ok "의존성 준비됨"
fi

# --- Playwright Chromium (스크린샷 캡처용) ---
if ! ls "$HOME/Library/Caches/ms-playwright"/chromium-* >/dev/null 2>&1; then
  warn "Chromium 이 없습니다. 지금 설치합니다"
  npx playwright install chromium || die "Chromium 설치 실패"
  ok "Chromium 설치 완료"
else
  ok "Chromium 준비됨"
fi

# --- 포트 ---
while lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; do
  warn "포트 $PORT 사용 중 — $((PORT + 1)) 로 옮깁니다"
  PORT=$((PORT + 1))
done
ok "포트 $PORT"

URL="http://localhost:$PORT"
say ""
say "${BOLD}$URL${OFF} 에서 실행합니다."
say "${DIM}브라우저가 곧 열립니다. 이 창을 닫거나 Ctrl+C 를 누르면 서버가 멈춥니다.${OFF}"
say "${DIM}AI 호출은 한 번에 수 분 걸립니다 — 생성·평가 중에는 기다려 주세요.${OFF}"
say ""

# 서버가 실제로 응답한 뒤에 브라우저를 연다
(
  for _ in $(seq 1 60); do
    if curl -sf -o /dev/null "$URL"; then open "$URL"; exit 0; fi
    sleep 1
  done
) &

exec npm run dev -- --port "$PORT"
