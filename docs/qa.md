# QA

## 자동 확인

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## 기능 확인

- 앱 진입 시 `행복 농장` 화면이 바로 보인다.
- 빈 밭을 누르면 씨앗 선택 안내가 나온다.
- 씨앗을 선택하고 빈 밭을 누르면 골드가 차감되고 작물이 심어진다.
- 작물 성장 후 밭을 누르면 수확되고 골드가 증가한다.
- 상점에서 밭 개간, 구역 해금, 성장 속도/수익 업그레이드가 동작한다.
- 초기화 모달에서 `초기화`를 입력해야 기록이 삭제된다.
- 앱을 종료 후 다시 열어도 저장된 농장 상태가 복원된다.

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
