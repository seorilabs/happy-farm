import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const workflow = fs.readFileSync(path.join(root, '.github/workflows/deploy-google-play.yml'), 'utf8');
const cloudBuild = fs.readFileSync(path.join(root, 'cloudbuild-android.yaml'), 'utf8');
const buildScript = fs.readFileSync(path.join(root, 'scripts/build-android.sh'), 'utf8');
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

  it('현재 workflow tooling으로 기존 release tag 소스를 재현 가능하게 빌드한다', () => {
    expect(workflow).toContain('path: ci-tooling');
    expect(workflow).toContain('path: release-source');
    expect(workflow).toContain('Overlay current Cloud Build tooling');
    expect(workflow).toContain('tooling_sha');
    expect(workflow).toContain('source_sha');
  });

  it('private package token을 Cloud Build에 전달하지 않고 seed store만 사용한다', () => {
    expect(workflow).toContain('pnpm store add "$private_package@$private_version"');
    expect(workflow).toContain("private_package='@seorilabs/platform-sdk'");
    expect(workflow).toContain('NODE_AUTH_TOKEN: ${{ github.token }}');
    expect(cloudBuild).not.toContain('NODE_AUTH_TOKEN');
    expect(buildScript).toContain('pnpm install');
    expect(buildScript).not.toContain('--offline');
    expect(buildEnv).toContain('CLOUD_BUILD_PNPM_STORE=.cloudbuild-private-pnpm-store');
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
    expect(workflow).toContain('actions/download-artifact@v8');
    expect(workflow).toContain('--aab-path "${aabs[0]}"');
    expect(workflow).toContain('retention-days: 3');
  });

  it('서명·Firebase·AAB 무결성을 Cloud Build 안에서 검증한다', () => {
    expect(buildScript).toContain('EXPECTED_UPLOAD_CERT_SHA256');
    expect(buildScript).toContain('EXPECTED_FIREBASE_PROJECT');
    expect(buildScript).toContain('node scripts/check-firebase-android-config.mjs');
    expect(buildScript).toContain('pnpm check:play:release -- --json');
    expect(buildScript).toContain('jarsigner -verify -strict');
  });
});
