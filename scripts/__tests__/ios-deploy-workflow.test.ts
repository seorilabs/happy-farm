import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const workflow = fs.readFileSync(path.join(root, '.github/workflows/deploy-app-store.yml'), 'utf8');
const exportOptions = fs.readFileSync(path.join(root, 'app-store/exportOptions.plist'), 'utf8');

describe('App Store 배포 계약', () => {
  it('Firebase 복원 스크립트를 빈 값으로 명시한다', () => {
    // 이 입력의 중앙 기본값은 빈 값이 아니라 scripts/restore-mobile-firebase-config.mjs 다.
    // Android 쪽 중앙 워크플로는 스크립트가 없으면 base64 fallback 으로 넘어가지만 iOS 쪽은
    // 그대로 죽는다. 생략하면 없는 파일을 찾다가 실패한다(검증 실행 35446435100).
    expect(workflow).toMatch(/firebase_restore_script:\s*''/);
  });

  it('GoogleService-Info.plist 가 저장소에 있어 복원이 필요 없다', () => {
    // 위 계약의 근거다. 이 파일이 추적에서 빠지면 복원 경로를 다시 설계해야 한다.
    expect(fs.existsSync(path.join(root, 'apps/mobile/ios/HappyFarmMobile/GoogleService-Info.plist'))).toBe(true);
  });

  it('export 가 곧 업로드다', () => {
    // 중앙에 별도 altool 단계가 없다. destination 이 upload 가 아니면 업로드되지 않는데도
    // 워크플로는 성공으로 끝나 조용히 아무것도 안 올라간다.
    expect(exportOptions).toContain('<key>destination</key>');
    expect(exportOptions).toMatch(/<key>destination<\/key>\s*<string>upload<\/string>/);
    expect(exportOptions).toMatch(/<key>method<\/key>\s*<string>app-store-connect<\/string>/);
  });

  it('배포 서명을 export 단계에 맡긴다', () => {
    // 중앙은 archive 를 CODE_SIGN_STYLE=Automatic 으로 뜬다. 여기에 manual 을 적으면
    // archive 서명과 어긋난다.
    expect(exportOptions).toMatch(/<key>signingStyle<\/key>\s*<string>automatic<\/string>/);
  });

  it('Xcode 가 빌드번호를 임의로 올리지 못하게 한다', () => {
    // 버전 정본은 릴리즈 태그다. Xcode 가 올리면 태그 파생값 readback 과 어긋나 업로드 전에
    // fail-closed 된다.
    expect(exportOptions).toMatch(/<key>manageAppVersionAndBuildNumber<\/key>\s*<false\/>/);
  });
});
