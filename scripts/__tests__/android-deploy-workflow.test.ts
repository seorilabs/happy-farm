import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const workflow = fs.readFileSync(path.join(root, '.github/workflows/deploy-google-play.yml'), 'utf8');
const deployAll = fs.readFileSync(path.join(root, '.github/workflows/deploy-all.yml'), 'utf8');
const buildEnv = fs.readFileSync(path.join(root, 'build.env'), 'utf8');

describe('Android 배포 계약', () => {
  it('빌드를 Cloud Build 가 아니라 조직 공통 워크플로에 맡긴다', () => {
    // 저장소가 public 이 되면서 ubuntu-latest(4 vCPU/16GB)가 무료로 열렸다. Cloud Build 는
    // 기본 e2-standard-2(2 vCPU)라 더 느리면서 과금까지 됐고, 그동안 러너는 대기만 했다.
    expect(workflow).toContain('uses: seorilabs/.github/.github/workflows/rn-deploy-google-play.yml@main');
    expect(workflow).not.toContain('gcloud builds submit');
    expect(workflow).not.toContain('cloudbuild-android.yaml');
  });

  it('public 저장소라 self-hosted 러너를 쓰지 않는다', () => {
    // org 의 ARC 러너 그룹은 모두 allows_public_repositories=false 라,
    // self-hosted 로 보내면 job 이 실패하지 않고 영원히 queued 로 남는다.
    expect(workflow).not.toContain('seorilabs-rpi-arm64');
    expect(workflow).not.toContain('seorilabs-x64');
    expect(workflow).toContain('runs-on: ubuntu-latest');
    // hosted 러너는 x64 다. arm64 를 고정하면 Python 설치가 깨진다.
    expect(workflow).not.toMatch(/^\s*architecture:\s*arm64/m);
  });

  it('빌드 전에 AdMob·Analytics 계약을 검사한다', () => {
    // Cloud Build 단계가 하던 검사다. 옮기면서 빠지면 광고 단위가 깨진 채로 스토어에 간다.
    expect(workflow).toContain('node scripts/check-admob-analytics-contract.mjs');
  });

  it('업로드 키 지문을 빌드 전에 대조한다', () => {
    // 중앙 워크플로는 keystore 를 복원해 쓰기만 하고 그 키가 우리 것인지 보지 않는다.
    // 틀린 키는 Play 가 업로드 때 거부하지만, 긴 빌드를 태우기 전에 끊어야 한다.
    expect(workflow).toContain('preflight:');
    expect(workflow).toContain('EXPECTED_UPLOAD_CERT_SHA256');
    expect(workflow).toContain('keytool -list -v');
    // 빌드 job 이 이 검증에 의존해야 순서가 보장된다.
    expect(workflow).toMatch(/needs:\s*preflight/);
    // 대조 기준값은 build.env 가 정본이다.
    expect(buildEnv).toMatch(/^EXPECTED_UPLOAD_CERT_SHA256=[0-9A-F]{64}$/m);
  });

  it('업로드 대상은 internal 트랙으로 고정한다', () => {
    // production 승격은 promote-google-play.yml 이 별도로 한다. 배포가 곧 공개가 되면 안 된다.
    expect(workflow).toContain('track: internal');
    expect(workflow).not.toContain('track: production');
  });

  it('버전을 호출부에서 넘기지 않는다', () => {
    // versionCode/versionName 의 정본은 릴리즈 태그 하나뿐이고 중앙이 태그에서 받는다.
    // 호출부가 값을 넘기면 정본이 둘이 된다.
    expect(workflow).not.toMatch(/version_code:/);
    expect(workflow).not.toMatch(/version_name:/);
    expect(workflow).toContain('release_tag: ${{ inputs.release_tag }}');
  });

  it('deploy-all 이 서명 secret 을 호출부에 넘긴다', () => {
    // 로컬 재사용 워크플로는 secret 을 자동 상속하지 않는다. 빠지면 keystore 복원이 빈 값으로
    // 죽는다.
    for (const name of [
      'FIREBASE_ANDROID_GOOGLE_SERVICES_JSON_BASE64',
      'GOOGLE_PLAY_UPLOAD_KEYSTORE_BASE64',
      'GOOGLE_PLAY_UPLOAD_KEYSTORE_PASSWORD',
      'GOOGLE_PLAY_UPLOAD_KEY_PASSWORD',
    ]) {
      expect(deployAll).toContain(`${name}: \${{ secrets.${name} }}`);
      expect(workflow).toContain(`${name}:`);
    }
  });
});
