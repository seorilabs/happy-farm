# happy-farm

AppsInToss Granite React Native 버전의 `행복 농장 타이쿤`입니다.

## 구현 범위

- `farm-game`의 WebView 게임을 React Native 화면으로 재작성했습니다.
- 원본의 `balance.json`, 작물/구역/광고 제한/업그레이드 경제 로직을 유지했습니다.
- AppsInToss 네이티브 `Storage`로 저장/불러오기/초기화를 처리합니다.
- 전면/보상형 광고 호출은 `loadFullScreenAd`/`showFullScreenAd` 흐름으로 포팅했지만, 실제 광고 그룹 ID는 아직 비워 두었습니다.

## 명령어

```bash
pnpm dev
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## 브랜치/배포 전략

- `develop`: 기본 작업 브랜치입니다. `main`을 제외한 push에서 CI가 `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`를 실행합니다.
- `main`: 릴리스/배포 브랜치입니다. `develop -> main` PR 병합으로 push가 발생하면 AppsInToss 배포 워크플로가 실행됩니다.
- 배포 워크플로는 동일한 검증을 다시 실행한 뒤 `.ait` 파일을 업로드하고 `pnpm deploy`를 실행합니다.
- 배포에는 GitHub Actions secret `APPS_IN_TOSS_API_KEY`가 필요합니다.
- 배포 성공 후 `happy-farm-release-<run-number>` 형식의 릴리즈 태그를 생성합니다. 수동 실행 시 태그 생성을 끌 수 있습니다.

## 샌드박스 URL

```text
intoss://happy-farm/
```

## 출시 전 차단 사항

- `granite.config.ts`의 `brand.icon`은 임시 HTTPS placeholder입니다. 콘솔 등록용 600x600 최종 아이콘 URL로 교체해야 합니다.
- 보상형/전면형 광고 그룹 ID를 `src/farm/FarmGame.tsx`에 연결해야 광고 보상이 활성화됩니다.
- 콘솔 등록 기본 정보, 고객지원 정보, 스크린샷/썸네일은 확정 필요입니다.
