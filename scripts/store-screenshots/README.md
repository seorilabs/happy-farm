# 스토어 스크린샷 캡처 파이프라인

Google Play와 App Store에 올리는 스크린샷을 **실제 앱 화면에서** 8개 로케일로 다시 캡처한다.
mockup이나 합성 이미지를 쓰지 않고, 결정론적인 세이브를 앱에 심은 뒤 로케일만 바꿔 가며 찍는다.

## 왜 스크립트로 두는가

스크린샷은 UI가 바뀔 때마다 조용히 낡는다. 2026-06-05 캡처본은 clay 아트 도입(`d7df7d6`)과
Warm Wood 크롬 개편(#525)을 거치며 실제 첫 화면과 눈에 띄게 달라진 채로 스토어에 남아 있었다.
장면 정의와 캡처 절차를 저장소에 두면 다음 갱신은 세 명령으로 끝난다.

## 4개 장면

| # | 키 | 화면 |
| --- | --- | --- |
| 1 | `1-initial` | 첫 밭 6칸. 수확 대기 3 + 빈 칸 3 |
| 2 | `2-harvest` | 12칸 전부 수확 대기. 모두 수확 CTA |
| 3 | `3-return` | 8시간 자리를 비운 뒤의 복귀 보상 시트 |
| 4 | `4-grown` | 24칸, 6개 구역 해금. 수확 12 + 성장 12 |

장면 3은 시트가 열린 화면인데 탭 자동화 없이 만든다. `lastSeen`을 8시간 전으로 심으면 진입과
동시에 `welcomeBack` 시트가 열리기 때문이다. iOS 시뮬레이터에는 이 환경에서 쓸 수 있는 탭
자동화가 없어(`idb`가 요구하는 `SimulatorKit.framework`가 Xcode 27에서 자리를 옮겼다), 시트가
필요한 장면은 이렇게 저장 상태만으로 띄운다.

## 실행

```bash
# 1. 장면 시드 생성 (farm-core 의 createInitialState 에서 파생)
node scripts/store-screenshots/make-seeds.mjs

# 2. 기기별 캡처
xcrun simctl boot "iPhone 17 Pro Max"
python3 scripts/store-screenshots/capture.py ios --udid <UDID> \
  --seeds build/store-screenshots/seeds --out build/store-screenshots/shots --label iphone-6.9

python3 scripts/store-screenshots/capture.py android --serial <SERIAL> \
  --seeds build/store-screenshots/seeds --out build/store-screenshots/shots --label phone

# 3. 저장소 배치 + config 갱신
python3 scripts/store-screenshots/install.py
```

## 기기 설정

| 슬롯 | 기기 | 해상도 | 비고 |
| --- | --- | --- | --- |
| `iphone-6.9` | iPhone 17 Pro Max 시뮬레이터 | 1320x2868 | 6.5형은 `install.py`가 리사이즈로 파생 |
| `ipad-13` | iPad Pro 13-inch 시뮬레이터 | 2064x2752 | |
| `phone` | Android 기기 | 1080x2160 | `wm size 1080x2160` + `wm density 432` |
| `tablet-7` | Android 태블릿 에뮬레이터 | 1440x2560 | `wm density 384`. 10형 슬롯도 같은 파일을 쓴다 |

Android는 Play의 종횡비 2:1 제한 때문에 실제 해상도 대신 override를 건다. density를 함께 맞추지
않으면 밭 격자가 한 줄만 보인다.

상태바는 iOS가 기본값(9:41)을 주고, Android는 demo mode로 맞춘다.

```bash
adb shell settings put global sysui_demo_allowed 1
adb shell am broadcast -a com.android.systemui.demo -e command enter
adb shell am broadcast -a com.android.systemui.demo -e command clock -e hhmm 0941
adb shell am broadcast -a com.android.systemui.demo -e command notifications -e visible false
```

## 주의

- Android debug 빌드는 Metro가 필요하다. `adb reverse tcp:8081 tcp:8081`이 풀리면 앱이 번들을
  잃으므로 `capture.py`가 앱을 띄울 때마다 다시 건다.
- 성장 중인 밭의 `startTime`은 시드에 **음수 오프셋**으로 적고 `capture.py`가 캡처 직전 현재
  시각으로 환산한다. 캡처가 로케일마다 수십 분에 걸쳐 돌기 때문에, 생성 시각을 굳히면 뒤쪽
  로케일에서는 밭이 전부 익어 화면이 달라진다.
- 진행률은 연구·업그레이드 배수가 적용된 실효 성장시간 기준이라, 시드는 원본 `growTime`이 아니라
  `getCropModifiers`의 `speedMultiplier`로 나눈 값을 쓴다.
- 시뮬레이터가 여럿 떠 있거나 Gradle 데몬이 도는 동안에는 렌더가 느려져 `--settle`을 늘려야 한다.
