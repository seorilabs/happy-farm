import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const workflow = fs.readFileSync(path.join(root, '.github/workflows/deploy-google-play.yml'), 'utf8');
const cloudBuild = fs.readFileSync(path.join(root, 'cloudbuild-android.yaml'), 'utf8');
const buildScript = fs.readFileSync(path.join(root, 'scripts/build-android.sh'), 'utf8');
const uploadScript = fs.readFileSync(path.join(root, 'scripts/upload-google-play-internal.py'), 'utf8');
const buildEnv = fs.readFileSync(path.join(root, 'build.env'), 'utf8');

describe('Android Cloud Build 배포 계약', () => {
  it('ARC는 Cloud Build 제출과 산출물 회수만 담당한다', () => {
    expect(workflow).toContain('runs-on: seorilabs-rpi-arm64');
    expect(workflow).toContain('gcloud builds submit .');
    expect(workflow).toContain('--config=cloudbuild-android.yaml');
    expect(workflow).toContain('--region=global');
    expect(workflow).toContain('gcloud storage cp');
    expect(workflow).not.toContain('--gcs-log-dir');
    expect(workflow).not.toContain('runs-on: ubuntu-latest');
    expect(workflow).not.toContain('./gradlew');
  });

  it('exact release tag의 source와 build tooling만 사용한다', () => {
    expect(workflow).toContain('path: release-source');
    expect(workflow).toContain('ref: ${{ needs.resolve.outputs.tag }}');
    expect(workflow).not.toContain('path: ci-tooling');
    expect(workflow).not.toContain('Overlay current Cloud Build tooling');
    expect(workflow).not.toContain('tooling_sha');
    expect(workflow).toContain('source_sha');
  });

  it('레지스트리 토큰 없이 seed store만으로 Cloud Build에 의존성을 넘긴다', () => {
    expect(workflow).toContain('pnpm store add "$private_package@$private_version"');
    expect(workflow).toContain("private_package='@seorilabs/platform-sdk'");
    expect(buildScript).toContain('pnpm install');
    expect(buildScript).not.toContain('--offline');
    expect(buildEnv).toContain('CLOUD_BUILD_PNPM_STORE=.cloudbuild-private-pnpm-store');

    // Platform #113 이후 @seorilabs/platform-sdk 는 공개 npm 패키지다. 어느 단계에서도
    // 레지스트리 토큰이 필요 없고, 넘기면 Cloud Build 로그에 남을 위험만 생긴다.
    expect(workflow).not.toContain('NODE_AUTH_TOKEN');
    expect(cloudBuild).not.toContain('NODE_AUTH_TOKEN');
  });

  it('x64 builder와 Happy Farm 전용 Secret Manager 복제본을 사용한다', () => {
    expect(cloudBuild).toContain('rn-android-builder:node24-jdk17-android36');
    expect(cloudBuild).toContain('happy-farm-firebase-google-services');
    expect(cloudBuild).toContain('happy-farm-play-keystore');
    expect(cloudBuild).toContain('logging: CLOUD_LOGGING_ONLY');
    expect(cloudBuild).toContain('machineType: E2_STANDARD_2');
    expect(buildEnv).toContain('ANDROID_PLATFORM=36');
    expect(buildEnv).toContain('ANDROID_BUILD_TOOLS=36.0.0');
    expect(buildEnv).toContain('EXPECTED_ANDROID_PACKAGE=com.seorilabs.happyfarm');
  });

  it('빌드와 Google Play internal 업로드를 분리한다', () => {
    expect(workflow).toContain('upload:');
    expect(workflow).toContain('if: ${{ inputs.send_to_google_play }}');
    expect(workflow).toContain('actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c');
    expect(workflow).toContain('--aab-path "${aabs[0]}"');
    expect(workflow).toContain('retention-days: 3');
  });

  it('버전은 exact 중앙 workflow SHA의 release binding에서만 받는다', () => {
    // 중앙 판본은 올라간다. 특정 SHA 를 박아 두면 판본을 올릴 때마다 이 테스트까지
    // 고쳐야 하고, 빠뜨리면 CI 가 빨간불로 남는다. immutable commit SHA 인지만 본다.
    expect(workflow).toMatch(
      /seorilabs\/\.github\/\.github\/workflows\/resolve-release-version\.yml@[0-9a-f]{40}/
    );
    expect(workflow).toContain('SEORI_RELEASE_VERSION_CODE: ${{ needs.resolve.outputs.android_version_code }}');
    expect(workflow).not.toContain('scripts/resolve-release-version.mjs');
    expect(buildScript).not.toContain('scripts/resolve-release-version.mjs');
  });

  it('서명·Firebase·AAB 무결성을 Cloud Build 안에서 검증한다', () => {
    expect(buildScript).toContain('EXPECTED_UPLOAD_CERT_SHA256');
    expect(buildScript).toContain('EXPECTED_FIREBASE_PROJECT');
    expect(buildScript).toContain('node scripts/check-firebase-android-config.mjs');
    expect(buildScript).toContain('pnpm check:play:release -- --json');
    expect(buildScript).toContain('jarsigner -verify -strict');
  });

  it('검증한 AAB digest와 exact tag versionCode만 업로드·승격한다', () => {
    expect(workflow).toContain('Verify AAB against the central release binding');
    expect(workflow).toContain('SEORI_EXPECTED_AAB_SHA256');
    expect(workflow).toContain('SEORI_EXPECTED_ANDROID_VERSION_CODE');
    expect(workflow).toContain('VERIFIED_PACKAGE_NAME: ${{ needs.build-aab.outputs.package_name }}');
    expect(workflow).toContain('--package-name "$VERIFIED_PACKAGE_NAME"');
    expect(workflow).toContain('.seorilabs-release-authority/scripts/release/upload-google-play-aab.py');
    expect(workflow).not.toContain('python3 scripts/upload-google-play-internal.py "${args[@]}"');
    expect(uploadScript).not.toContain('bundles().upload');
    expect(uploadScript).toContain('--promote-version-code');
    expect(uploadScript).toContain('args.promote_version_code not in version_codes');
    expect(uploadScript).not.toContain('latest = str(max(version_codes))');
  });
});
