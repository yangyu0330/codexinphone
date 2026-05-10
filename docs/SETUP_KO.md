# 설치 체크리스트

## 1. OAuth 준비

GitHub에서 OAuth App을 만들고 아래 값을 `.env`에 입력합니다.

- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`
- `GITHUB_CALLBACK_URL`
- `ALLOWED_EMAILS`
- `ALLOWED_GITHUB_LOGINS`

Callback URL 예시는 다음과 같습니다.

```text
https://your-protected-domain.example.com/auth/github/callback
```

## 2. 접속 터널 선택

권장 선택지는 Tailscale입니다.

- 노트북과 휴대폰에 Tailscale 설치
- 같은 Tailnet 로그인
- 노트북에서 `npm run start`
- 휴대폰에서 Tailnet IP와 포트로 접속

Cloudflare Tunnel을 쓸 경우 Cloudflare Access allowlist를 함께 켜세요.

## 3. Codex CLI 확인

노트북 PowerShell에서:

```powershell
codex --version
```

정상 출력이 나오면 `.env`에 다음을 둡니다.

```dotenv
CODEX_COMMAND=codex
CODEX_ARGS=
```

## 4. 자동 실행

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup-windows-task.ps1
Start-ScheduledTask -TaskName CodexInPhone
```

## 5. 휴대폰에서 확인

- OAuth 로그인
- Start 버튼으로 세션 생성
- 터미널에 Codex CLI 화면이 보이는지 확인
- 입력창 또는 터미널 터치 키보드로 명령 입력
- 위험 명령은 승인 배너가 뜨는지 확인
