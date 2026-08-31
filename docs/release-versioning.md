# Release Versioning

Happy Farm의 세 마켓 버전 정본은 exact source commit을 가리키는 GitHub stable SemVer tag
`vMAJOR.MINOR.PATCH` 하나뿐이다. 앱 저장소의 `package.json`, Gradle, Xcode, 마켓 JSON과 런타임
`releaseInfo.ts`는 버전을 결정하지 않는다.

계산과 검증은 `seorilabs/.github`의 불변 commit
`8a11a145fed35479a4a89ebc7ca97edd0a0f05fd`에 있는
`release-version-authority-v1`이 담당한다. 각 workflow는 중앙 reusable workflow의 결과를 받은 뒤
`scripts/write-release-info.mjs`로 런타임 파일에 확정값만 기록한다.

## 파생 규칙

| 값 | 규칙 | `v1.2.3` |
|---|---|---|
| 표시 버전 | 태그에서 `v` 제거 | `1.2.3` |
| Android `versionCode` | `1,000,000,000 + major * 1,000,000 + minor * 1,000 + patch` | `1001002003` |
| Apple build number | `major * 1,000,000 + minor * 1,000 + patch` | `1002003` |

Android의 10억 epoch는 기존 Play build 번호보다 항상 높은 조직 공통 이관 경계다. 앱별 offset이나
로컬 계산식은 두지 않는다.

## 태그 생성과 배포

GitHub Actions의 `Create Release Tag`를 실행한다. 직접 태그를 지정하거나 `patch`, `minor`, `major`
증가를 선택할 수 있으며, 중앙 workflow가 선택한 exact commit에 annotated tag와 binding receipt를
남긴다. 빈 marker commit은 만들지 않는다.

배포 workflow에서 `release_tag`를 비우면 수동 실행에서 최신 stable tag를 선택하고, 값을 넣으면 그
exact tag만 빌드한다. branch source를 릴리즈로 추측하지 않는다.

```bash
gh workflow run release-tag.yml -f target_ref=main -f bump=patch
gh workflow run deploy-all.yml -f release_tag=v1.2.3
```

런타임 metadata를 로컬에서 임의 계산하는 명령은 없다. build-only 또는 재현 검증이 필요하면 중앙
resolver가 만든 `SEORI_RELEASE_TAG`, `SEORI_RELEASE_VERSION`, `SEORI_RELEASE_VERSION_CODE`,
`SEORI_RELEASE_SOURCE_SHA` 네 값을 그대로 전달한다.
