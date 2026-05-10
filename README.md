# Codex in Phone

Windows 노트북에서 Codex CLI를 실행하고, 휴대폰 브라우저/PWA로 답변을 읽고 명령을 입력하는 모바일 컨트롤 앱입니다.

이 프로젝트는 공식 Codex 앱을 복제하지 않습니다. 노트북에 있는 Codex CLI와 파일 시스템은 그대로 두고, 인증된 휴대폰 화면에서 그 세션을 안전하게 조작합니다.

## 현재 구현

- GitHub OAuth 또는 pairing token 기반 로그인
- 휴대폰 친화 PWA UI
- WebSocket 실시간 터미널 스트리밍
- `node-pty` 사용 가능 시 PTY 실행, 실패 시 pipe fallback
- Codex CLI 실행 명령/인자/작업 디렉터리 설정
- `OPENAI_API_KEY` 등 AI API 키를 노트북 로컬 환경 변수로 주입
- 세션 재접속 시 이전 터미널 로그 다시 표시
- 위험 명령 입력 감지 후 승인 요구
- 터미널 출력과 감사 로그의 토큰/키 마스킹
- Windows 작업 스케줄러 자동 실행 스크립트
- 보안 헤더, CSP, 레이트리밋, same-origin 요청 검증
- 서명된 세션 쿠키와 사용자별 터미널 세션 격리
- GitHub Actions CI와 브라우저 E2E 검증

## 빠른 실행

```powershell
git clone https://github.com/yangyu0330/codexinphone.git
cd codexinphone
copy .env.example .env
npm ci
npm run build
npm run start
```

상용 운영 전에는 `.env`를 채운 뒤 아래 검사를 통과시킵니다.

```powershell
npm run ci
npm run check:prod-config
```

개발 중 OAuth 없이 확인하려면 `.env`에서 다음처럼 바꿉니다.

```dotenv
AUTH_MODE=dev
CODEX_COMMAND=node
CODEX_ARGS=scripts/mock-codex.js
```

그 뒤 브라우저에서 `http://127.0.0.1:8787`을 엽니다.

## 사용자가 채워야 할 값

`.env` 파일에 아래 값을 직접 입력합니다. `.env`는 git에 올라가지 않습니다.

```dotenv
AUTH_MODE=github
SESSION_SECRET=긴-랜덤-문자열-최소-32자
PUBLIC_ORIGIN=https://your-protected-domain.example.com
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
GITHUB_CALLBACK_URL=https://your-protected-domain.example.com/auth/github/callback
ALLOWED_EMAILS=your-email@example.com
ALLOWED_GITHUB_LOGINS=your-github-login
WORKSPACE_ROOTS=C:\Users\andyw;C:\Users\andyw\Desktop
DEFAULT_CWD=C:\Users\andyw
CODEX_COMMAND=codex
OPENAI_API_KEY=...
```

GitHub OAuth 앱의 callback URL은 `GITHUB_CALLBACK_URL`과 정확히 같아야 합니다.

## 휴대폰 접속 방식

권장 순서:

1. Tailscale: 노트북과 휴대폰을 같은 Tailnet에 넣고, `http://노트북-tailnet-ip:8787` 또는 Funnel/Serve를 사용합니다.
2. Cloudflare Tunnel + Access: `cloudflared tunnel` 뒤에 Google/GitHub 로그인 allowlist를 한 번 더 둡니다.
3. 같은 Wi-Fi 전용: 테스트용으로만 사용합니다.

피해야 할 방식:

- 공유기 포트포워딩으로 `8787` 포트를 인터넷에 직접 공개
- `HOST=0.0.0.0`으로 열어둔 뒤 별도 접근 제어 없이 사용
- 인증 없는 WebSocket 터미널 공개

기본값은 `HOST=127.0.0.1`입니다. 외부 접속은 VPN/터널이 담당하게 두는 것이 안전합니다.

## Windows 자동 실행

로그인 후 자동 실행:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup-windows-task.ps1
Start-ScheduledTask -TaskName CodexInPhone
```

부팅 직후 실행으로 등록하려면 관리자 PowerShell에서:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup-windows-task.ps1 -AtStartup
```

제거:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\remove-windows-task.ps1
```

로그는 `logs/`에 저장됩니다.

## 외출 모드

노트북을 켜두고 밖에서 휴대폰으로 계속 Codex를 쓰려면 [docs/AWAY_MODE_KO.md](docs/AWAY_MODE_KO.md)의 절차를 따릅니다.

떠나기 전 점검:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\away-preflight.ps1 -RegisterTask -KeepAwake
powershell -ExecutionPolicy Bypass -File .\scripts\away-preflight.ps1 -StartTask
```

`Failures: 0`이어야 밖에서 안정적으로 사용할 준비가 된 상태입니다.

## AI API 키와 프로필

가장 단순한 방식은 `.env`에 `OPENAI_API_KEY` 등 필요한 키를 넣는 것입니다. 서버는 키 존재 여부만 UI에 보여주고 실제 값은 표시하지 않습니다.

프로젝트별 키를 분리하려면 아래 형식의 JSON 파일을 `.codexinphone/env-profiles/name.json`에 둡니다.

```json
{
  "OPENAI_API_KEY": "paste-key-here",
  "CODEX_MODEL": "gpt-5.1-codex"
}
```

허용되는 키는 주요 AI provider 키와 `AI_` 접두사 변수입니다. 브라우저 localStorage에는 API 키를 저장하지 않습니다.

## 보안 정책

운영 모드(`NODE_ENV=production`)에서는 안전하지 않은 설정이면 서버가 시작되지 않습니다. 자세한 체크리스트는 [docs/PRODUCTION.md](docs/PRODUCTION.md)를 보세요.

서버는 다음 입력을 감지하면 바로 실행하지 않고 휴대폰 화면에 승인 배너를 표시합니다.

- `rm -rf`
- `Remove-Item -Recurse`
- `git push --force`
- `.env`, SSH key, token 파일 출력
- 외부 업로드로 보이는 `curl`, `wget`, `Invoke-WebRequest`
- `Set-ExecutionPolicy`

이 정책은 안전장치이지 완전한 샌드박스가 아닙니다. Codex CLI는 여전히 노트북 사용자 권한으로 실행됩니다.

## 검증

```powershell
npm run typecheck
npm test
npm run build
npm run verify:browser
```

개발용 mock CLI로 전체 흐름을 확인:

```powershell
$env:AUTH_MODE="dev"
$env:CODEX_COMMAND="node"
$env:CODEX_ARGS="scripts/mock-codex.js"
npm run dev
```

Vite 개발 서버는 `http://127.0.0.1:5173`, API 서버는 `http://127.0.0.1:8787`입니다.
