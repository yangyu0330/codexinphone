# Codex in Phone 런처

폰에 설치할 고정 주소:

```text
https://yangyu0330.github.io/codexinphone/
```

이 주소는 GitHub Pages에 올라가는 작은 런처입니다. 런처는 `docs/current-url.json`을 매번 새로 읽고, 그 안에 들어 있는 최신 `https://*.lhr.life` 주소로 자동 이동합니다.

## 자동 갱신 조건

Codespace 안에서 `scripts/start-codespaces-localhostrun.sh`가 새 localhost.run 주소를 찾으면 `scripts/publish-current-url.sh`가 `docs/current-url.json`을 GitHub에 커밋합니다.

자동 갱신을 켜려면 Codespaces secret에 `CIP_GITHUB_TOKEN`이 있어야 합니다.

권장 토큰 권한:

- Repository: `yangyu0330/codexinphone`
- Contents: Read and write
- Metadata: Read

토큰이 없으면 앱 실행은 계속되지만 GitHub Pages 런처 주소 갱신만 건너뜁니다.

## 폰에서 쓰는 흐름

1. 위 GitHub Pages 주소를 폰 브라우저로 엽니다.
2. 홈 화면에 추가하거나 설치합니다.
3. 다음부터는 설치된 런처를 열면 현재 살아 있는 Codex in Phone 주소로 이동합니다.

Codespace를 완전히 끄면 실제 앱 서버도 꺼지므로 런처가 이동할 수 있는 최신 주소가 있어도 접속은 되지 않습니다. 다시 쓰려면 GitHub Codespaces에서 Codespace를 켜야 합니다.
