# QA

## 자동 확인

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm check:i18n
pnpm build
pnpm check:app-store
```

## i18n 확인

i18n 계획과 변경 체크리스트는 `docs/i18n-plan.md`를 기준으로 한다.

- 새 사용자-facing 문자열은 locale catalog에 추가한다.
- `ko-KR`과 `en-US`를 함께 갱신한다.
- crop/area label, 금액, 시간, 광고 제한 사유가 locale-aware 경로를 타는지 확인한다.
- 긴 `en-US` 문구가 버튼, 바텀시트, 하단 tool strip, 한 줄 텍스트에서 넘치지 않는지 확인한다.
- store listing, release note, screenshot text에 영향이 있으면 Play/App Store/AppsInToss 문서와 config를 함께 갱신한다.

## 기능 확인

- 앱 진입 시 `행복 농장` 화면이 바로 보인다.
- 빈 밭을 누르면 씨앗 선택 안내가 나온다.
- 씨앗을 선택하고 빈 밭을 누르면 골드가 차감되고 작물이 심어진다.
- 작물 성장 후 밭을 누르면 수확되고 골드가 증가한다.
- 상점에서 밭 개간, 새 구역 열기, 성장 속도/수익 업그레이드가 동작한다.
- 초기화 모달에서 `초기화`를 입력해야 기록이 삭제된다.
- 앱을 종료 후 다시 열어도 저장된 농장 상태가 복원된다.
- 설정에서 효과음/배경 음악을 켜면 수확 효과음과 BGM이 재생된다. (앱인토스 빌드는 `https://happy-farm-tycoon.web.app/audio/*` 호스팅 필요, `docs/apps-in-toss-registration.md` 참고)
- 미니앱이 백그라운드로 전환되면 사운드가 멈추고, 돌아오면 BGM이 다시 재생된다.
- Android에서 BGM 재생 중 수확 효과음이 나도 BGM이 끊기지 않는다.

## 샌드박스 확인

```bash
pnpm dev
# 8081이 이미 사용 중이면 아래처럼 다른 포트를 쓰고, curl URL의 포트도 같이 바꿉니다.
pnpm exec granite dev --port 8082
curl -s --max-time 5 http://127.0.0.1:8081/status
curl -sS --max-time 60 -o /tmp/happy-farm-ios.bundle -w 'ios %{http_code} %{size_download}\n' 'http://127.0.0.1:8081/index.bundle?platform=ios&dev=true&minify=false'
curl -sS --max-time 60 -o /tmp/happy-farm-android.bundle -w 'android %{http_code} %{size_download}\n' 'http://127.0.0.1:8081/index.bundle?platform=android&dev=true&minify=false'
```

앱 진입 URL:

```text
intoss://happy-farm/
```

## App Store 확인

```bash
pnpm --dir apps/mobile typecheck
pnpm --dir apps/mobile test --watchAll=false
xcodebuild -list -project apps/mobile/ios/HappyFarmMobile.xcodeproj
pnpm check:app-store
```

App Store GitHub Actions archive/upload smoke:

```bash
gh workflow run deploy-app-store.yml --ref develop -f release_tag=v1.0.0 -f upload_to_app_store=true
```

- iPhone portrait에서 앱 진입, 작물 심기, 수확, 상점, 저장 복원이 동작한다.
- iPad 지원을 유지할 경우 iPad 화면에서 레이아웃과 screenshot을 별도로 확인한다.
- TestFlight 내부 테스트에서는 BGM/SFX, 앱 background/foreground 전환, Firebase 초기화, 광고 보상 노출 여부를 확인한다.
