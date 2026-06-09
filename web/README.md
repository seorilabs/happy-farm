# web

Firebase Hosting(`happy-farm-tycoon` 프로젝트)으로 배포되는 정적 리소스다.

- `audio/`: 앱인토스 빌드가 스트리밍하는 BGM/효과음. Granite 런타임은 번들 로컬 리소스를
  지원하지 않아 원격 URI가 필요하다. 원본은 `apps/mobile/src/audio/assets/`와 동일한 파일이며,
  코드 참조는 `apps/ait/src/farm/platform/appsInTossAudio.tsx`의 `FARM_AUDIO_SOURCES`다.

배포:

```bash
npx firebase-tools deploy --only hosting --project happy-farm-tycoon
```
