# 2026-10-23 근거 재확인

기준 소스 fe69cd5883f7cc096f153852318db4c2e4a222f0, pnpm 11.3.0. 감사 실행은 실패이며 취약점 제거 완료가 아니다.

| advisory | package | 심각도 | 현재 취약 범위 | 감사의 수정 범위 | 대표 경로 |
|---|---|---|---|---|---|
| [GHSA-2p57-rm9w-gvfp](https://github.com/advisories/GHSA-2p57-rm9w-gvfp) | ip | high | <=2.0.1 | >=2.0.2 | .>@apps-in-toss/framework>@apps-in-toss/plugins>@apps-in-toss/plugin-compat>react-native>@react-native-community/cli>@react-native-community/cli-doctor>ip |
| [GHSA-5p2g-fcmc-qvqq](https://github.com/advisories/GHSA-5p2g-fcmc-qvqq) | image-size | high | >=1.2.0 <=2.0.2 | >=2.0.3 | .>@apps-in-toss/framework>@apps-in-toss/analytics>@granite-js/native>@granite-js/image>react-native>@react-native/community-cli-plugin>metro>image-size |
| [GHSA-w3rx-r6r6-pgpr](https://github.com/advisories/GHSA-w3rx-r6r6-pgpr) | image-size | high | >=0.6.3 <=2.0.2 | >=2.0.3 | .>@apps-in-toss/framework>@apps-in-toss/analytics>@granite-js/native>@granite-js/image>react-native>@react-native/community-cli-plugin>metro>image-size |
| [GHSA-qw65-cvwx-89v3](https://github.com/advisories/GHSA-qw65-cvwx-89v3) | fast-uri | high | >=4.0.0 <4.1.4 | >=4.1.4 | .>@apps-in-toss/framework>@apps-in-toss/analytics>@granite-js/react-native>@granite-js/cli>@granite-js/mpack>@granite-js/plugin-core>fastify>@fastify/ajv-compiler>fast-uri |
| [GHSA-qw65-cvwx-89v3](https://github.com/advisories/GHSA-qw65-cvwx-89v3) | fast-uri | high | >=3.0.0 <3.1.7 | >=3.1.7 | .>@apps-in-toss/framework>@apps-in-toss/analytics>@granite-js/react-native>@granite-js/cli>@granite-js/mpack>@granite-js/plugin-core>fastify>@fastify/ajv-compiler>ajv>fast-uri |
| [GHSA-58mr-gqgx-xq4g](https://github.com/advisories/GHSA-58mr-gqgx-xq4g) | fast-uri | high | =4.1.3 | None | .>@apps-in-toss/framework>@apps-in-toss/analytics>@granite-js/react-native>@granite-js/cli>@granite-js/mpack>@granite-js/plugin-core>fastify>@fastify/ajv-compiler>fast-uri |
| [GHSA-58mr-gqgx-xq4g](https://github.com/advisories/GHSA-58mr-gqgx-xq4g) | fast-uri | high | =3.1.6 | None | .>@apps-in-toss/framework>@apps-in-toss/analytics>@granite-js/react-native>@granite-js/cli>@granite-js/mpack>@granite-js/plugin-core>fastify>@fastify/ajv-compiler>ajv>fast-uri |
| [GHSA-qhr7-859c-m2p7](https://github.com/advisories/GHSA-qhr7-859c-m2p7) | brace-expansion | high | <1.1.20 | >=1.1.20 | .>@apps-in-toss/framework>@apps-in-toss/analytics>@granite-js/native>@granite-js/image>react-native>@react-native/community-cli-plugin>@react-native/dev-middleware>chromium-edge-launcher>rimraf>glob>minimatch>brace-expansion |
| [GHSA-qhr7-859c-m2p7](https://github.com/advisories/GHSA-qhr7-859c-m2p7) | brace-expansion | high | >=2.0.0 <2.1.6 | >=2.1.6 | .>@apps-in-toss/framework>@apps-in-toss/plugins>archiver>archiver-utils>glob>minimatch>brace-expansion |
| [GHSA-qhr7-859c-m2p7](https://github.com/advisories/GHSA-qhr7-859c-m2p7) | brace-expansion | high | >=4.0.0 <5.0.11 | >=5.0.11 | .>@apps-in-toss/framework>@apps-in-toss/analytics>@granite-js/react-native>@granite-js/brownfield-module>brick-module>brick-codegen>glob>minimatch>brace-expansion |
| [GHSA-6j4f-fj2g-mc7p](https://github.com/advisories/GHSA-6j4f-fj2g-mc7p) | brace-expansion | high | <1.1.19 | >=1.1.19 | .>@apps-in-toss/framework>@apps-in-toss/analytics>@granite-js/native>@granite-js/image>react-native>@react-native/community-cli-plugin>@react-native/dev-middleware>chromium-edge-launcher>rimraf>glob>minimatch>brace-expansion |
| [GHSA-6j4f-fj2g-mc7p](https://github.com/advisories/GHSA-6j4f-fj2g-mc7p) | brace-expansion | high | >=2.0.0 <2.1.5 | >=2.1.5 | .>@apps-in-toss/framework>@apps-in-toss/plugins>archiver>archiver-utils>glob>minimatch>brace-expansion |
| [GHSA-6j4f-fj2g-mc7p](https://github.com/advisories/GHSA-6j4f-fj2g-mc7p) | brace-expansion | high | >=4.0.0 <5.0.10 | >=5.0.10 | .>@apps-in-toss/framework>@apps-in-toss/analytics>@granite-js/react-native>@granite-js/brownfield-module>brick-module>brick-codegen>glob>minimatch>brace-expansion |
| [GHSA-m9gg-hp2v-232j](https://github.com/advisories/GHSA-m9gg-hp2v-232j) | @grpc/grpc-js | high | <1.13.6 | >=1.13.6 | apps__mobile>@react-native-firebase/analytics>@react-native-firebase/app>firebase>@firebase/firestore>@grpc/grpc-js |
| [GHSA-667r-xxjv-c9mm](https://github.com/advisories/GHSA-667r-xxjv-c9mm) | fastify | high | <5.12.2 | >=5.12.2 | .>@apps-in-toss/framework>@apps-in-toss/analytics>@granite-js/react-native>@granite-js/cli>@granite-js/mpack>@granite-js/plugin-core>fastify |
| [GHSA-p68q-wchp-6fh7](https://github.com/advisories/GHSA-p68q-wchp-6fh7) | fastify | high | >=4.0.0 <5.12.2 | >=5.12.2 | .>@apps-in-toss/framework>@apps-in-toss/analytics>@granite-js/react-native>@granite-js/cli>@granite-js/mpack>@granite-js/plugin-core>fastify |
| [GHSA-hwr6-493r-vm6h](https://github.com/advisories/GHSA-hwr6-493r-vm6h) | fastify | high | <5.12.2 | >=5.12.2 | .>@apps-in-toss/framework>@apps-in-toss/analytics>@granite-js/react-native>@granite-js/cli>@granite-js/mpack>@granite-js/plugin-core>fastify |
| [GHSA-9q9j-q6p8-xq58](https://github.com/advisories/GHSA-9q9j-q6p8-xq58) | fastify | high | <5.12.2 | >=5.12.2 | .>@apps-in-toss/framework>@apps-in-toss/analytics>@granite-js/react-native>@granite-js/cli>@granite-js/mpack>@granite-js/plugin-core>fastify |
| [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) | braces | high | <=3.0.3 | >=3.0.4 | .>@apps-in-toss/framework>@apps-in-toss/analytics>@granite-js/native>@granite-js/image>react-native>@react-native/community-cli-plugin>metro>metro-file-map>micromatch>braces |
| [GHSA-vc2v-76pw-4v95](https://github.com/advisories/GHSA-vc2v-76pw-4v95) | compression | high | <1.8.2 | >=1.8.2 | .>@apps-in-toss/framework>@apps-in-toss/analytics>@granite-js/native>@granite-js/image>react-native>@react-native/community-cli-plugin>@react-native-community/cli>@react-native-community/cli-server-api>compression |
| [GHSA-6h2x-m376-mqjq](https://github.com/advisories/GHSA-6h2x-m376-mqjq) | joi | high | >=17.2.0 <17.13.7 | >=17.13.7 | .>@apps-in-toss/framework>@apps-in-toss/analytics>@granite-js/native>@granite-js/image>react-native>@react-native/community-cli-plugin>@react-native-community/cli>@react-native-community/cli-config>joi |
| [GHSA-pqg4-j6r4-53mv](https://github.com/advisories/GHSA-pqg4-j6r4-53mv) | shell-quote | critical | >=1.8.4 <1.11.0 | >=1.11.0 | .>@apps-in-toss/framework>@apps-in-toss/analytics>@granite-js/native>@granite-js/image>react-native>@react-native/community-cli-plugin>@react-native-community/cli>@react-native-community/cli-clean>@react-native-community/cli-tools>launch-editor>shell-quote |
| [GHSA-587h-7wmj-h5pm](https://github.com/advisories/GHSA-587h-7wmj-h5pm) | launch-editor | high | <=2.14.1 | >=2.14.2 | .>@apps-in-toss/framework>@apps-in-toss/analytics>@granite-js/native>@granite-js/image>react-native>@react-native/community-cli-plugin>@react-native-community/cli>@react-native-community/cli-clean>@react-native-community/cli-tools>launch-editor |

감사에서 제시한 수정 범위가 실제 npm에 발행됐는지와 parent 범위가 허용하는지는 구현 전 공식 metadata로 재확인한다. 취약점 하나가 버전 계열별 여러 audit 항목으로 나오므로 advisory 고유 수와 audit 건수는 다를 수 있다.

## 마켓과 미실행 항목

- App Store 공개 Lookup에서 1.12.2와 2026-10-15T02:35:00Z를 확인했다. App ID 6775451733, bundleId com.seorilabs.happyfarm이다.
- #488 원래 실패와 같은 SHA의 후속 Cloud Build가 성공했다. 그 실행에서 업로드는 skipped였다.
- 제품 코드는 변경하지 않았고 새 제품 테스트, 배포, 심사, 기기 실행을 통과로 표시하지 않는다.
- 원시 근거는 NAS 검증 보존을 마친 뒤 별도 조사 결과 문서에 최종 위치와 SHA-256을 기록한다.
