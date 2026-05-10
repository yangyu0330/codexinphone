# 외출 모드 사용법

노트북을 켜두고 밖에서 휴대폰으로 Codex 답변을 확인하고 프롬프트를 입력하려면, 떠나기 전에 아래 순서로 준비합니다.

## 1. 원격 접속 수단 준비

둘 중 하나를 사용하세요.

- Tailscale: 노트북과 휴대폰을 같은 Tailnet에 로그인
- Cloudflare Tunnel + Access: 외부 HTTPS 주소와 로그인 allowlist 구성

공유기 포트포워딩으로 `8787` 포트를 직접 열지 마세요.

설치 도우미:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install-remote-access.ps1 -Provider tailscale
```

또는:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install-remote-access.ps1 -Provider cloudflared
```

설치 과정은 Windows 보안/UAC 확인이 필요할 수 있으므로 사용자가 직접 완료해야 합니다.

## 2. `.env` 채우기

```powershell
copy .env.example .env
notepad .env
```

외출 전 최소 필수값:

- `AUTH_MODE=github`
- `SESSION_SECRET`: 32자 이상 랜덤 문자열
- `PUBLIC_ORIGIN`: 휴대폰에서 접속할 HTTPS 주소
- `COOKIE_SECURE=true`
- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`
- `GITHUB_CALLBACK_URL`
- `ALLOWED_EMAILS` 또는 `ALLOWED_GITHUB_LOGINS`
- `CODEX_COMMAND=codex`
- 필요한 AI API 키

## 3. 외출 전 점검

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\away-preflight.ps1
```

작업 스케줄러 등록과 절전 방지를 함께 켜려면:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\away-preflight.ps1 -RegisterTask -KeepAwake
```

등록된 작업을 바로 시작하려면:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\away-preflight.ps1 -StartTask
```

`KeepAwake`는 Codex in Phone 작업이 실행되는 동안 Windows가 절전으로 들어가지 않도록 요청합니다.

## 임시 빠른 외출 모드

OAuth와 고정 터널을 아직 만들지 않았지만 잠깐 밖에서 써야 한다면 Cloudflare quick tunnel과 pairing token 모드를 사용할 수 있습니다.

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install-remote-access.ps1 -Provider cloudflared
powershell -ExecutionPolicy Bypass -File .\scripts\start-away-quick-tunnel.ps1
```

스크립트가 휴대폰 URL과 pairing token을 출력합니다. 이 방식은 임시 공개 URL을 사용하므로 장기 운영은 GitHub OAuth + Cloudflare Access 또는 Tailscale을 쓰세요.

## 4. 휴대폰에서 사용

휴대폰 브라우저에서 `PUBLIC_ORIGIN` 주소를 열고 GitHub OAuth로 로그인합니다.

화면에서 할 수 있는 일:

- Codex CLI 세션 시작
- 답변 실시간 확인
- 프롬프트 입력
- 이전 세션 로그 재확인
- 위험 명령 승인 또는 거부
- 노트북 작업 디렉터리 지정

## 5. 떠나기 직전 최종 확인

```powershell
npm run ci
powershell -ExecutionPolicy Bypass -File .\scripts\away-preflight.ps1 -StartTask
```

`Failures: 0`이면 구현 측면에서는 외출 모드 준비가 끝난 상태입니다. 경고가 남아 있으면 원격 접속 주소나 터널 설정을 다시 확인하세요.
