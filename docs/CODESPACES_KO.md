# GitHub Codespaces로 휴대폰에서 사용하기

이 방식은 노트북을 켜두지 않고 GitHub Codespaces 안에서 Codex CLI와 Codex in Phone 서버를 실행합니다. 휴대폰은 Codespaces가 열어주는 비공개 포트 주소로 접속합니다.

## 비용 기준

- 개인 GitHub 계정의 무료 Codespaces 한도는 2-core 기준 월 약 60시간입니다.
- 비용을 아끼려면 항상 2-core machine을 사용하고, 사용하지 않을 때는 Codespace를 stop 합니다.
- GitHub Settings에서 Codespaces idle timeout을 5분으로 줄이고 spending limit을 0원 또는 최소값으로 둡니다.
- Codespace를 stop 하면 나중에 같은 주소로 다시 켤 수 있습니다. Delete 하면 환경과 URL이 새로 만들어질 수 있습니다.

## 최초 1회 설정

1. GitHub의 `yangyu0330/codexinphone` 저장소에서 Codespace를 생성합니다.
2. GitHub Settings > Codespaces > Secrets에 아래 값을 추가하고 이 저장소에 접근을 허용합니다.
   - `SESSION_SECRET`: 32자 이상 랜덤 문자열
   - `PAIRING_TOKEN`: 32자 이상 랜덤 문자열, 휴대폰 로그인에 사용
   - `OPENAI_API_KEY`: 선택 사항입니다. API key가 없으면 Codespace 터미널에서 `codex login --device-auth`로 로그인합니다.
3. Codespace 터미널에서 아래 명령을 실행합니다.

```bash
npm run codespaces:start
```

Codex가 로그인하라고 하면 새 터미널에서 아래 명령을 실행하고 브라우저 인증을 완료합니다.

```bash
codex login --device-auth
```

4. Ports 탭에서 `Codex in Phone` 또는 `8787` 포트의 forwarded address를 엽니다.
5. 휴대폰에서 같은 주소를 열고 GitHub 로그인 화면이 나오면 로그인합니다.
6. 앱 화면에서 `PAIRING_TOKEN`을 입력해 로그인합니다.
7. 휴대폰 브라우저 메뉴에서 홈 화면에 추가 또는 앱 설치를 선택합니다.

## 매번 사용할 때

1. 휴대폰이나 PC에서 `https://github.com/codespaces`로 이동합니다.
2. 기존 `codexinphone` Codespace를 Resume 합니다.
3. 터미널에서 아래 명령을 실행합니다.

```bash
npm run codespaces:start
```

4. 설치해둔 PWA 또는 Ports 탭의 `8787` URL로 접속합니다.
5. 사용이 끝나면 GitHub Codespaces 화면에서 Stop을 누릅니다.

## 운영 방식

- 코드는 작업이 끝날 때마다 commit/push 합니다.
- API key, pairing token, session secret은 GitHub Codespaces secrets에만 둡니다.
- Codespaces는 상시 서버가 아니라 필요할 때 켜는 클라우드 작업환경으로 사용합니다.
- 항상 켜진 고정 서버가 필요해지면 AWS EC2 stop/start 방식이나 Lightsail로 옮기는 것이 낫습니다.

## 문제 해결

- `Missing required environment variable`이 나오면 GitHub Codespaces secret이 저장소에 연결되어 있는지 확인합니다.
- `SESSION_SECRET`과 `PAIRING_TOKEN`은 필수이고, `OPENAI_API_KEY`는 선택 사항입니다.
- 접속 주소는 `https://<codespace-name>-8787.<domain>` 형식이어야 합니다.
- 휴대폰에서 연결이 안 되면 Codespaces Ports 탭에서 포트 visibility가 Private인지 확인하고 GitHub 로그인을 다시 합니다.
- `CODEX_COMMAND does not resolve`가 나오면 Codespace를 rebuild 하거나 `npm install -g @openai/codex`를 실행합니다.
