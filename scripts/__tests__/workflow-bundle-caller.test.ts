import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const orgContract = fs.readFileSync(path.join(root, '.github/workflows/org-contract.yml'), 'utf8');
const androidBuildOnly = fs.readFileSync(
  path.join(root, '.github/workflows/android-build-only.yml'),
  'utf8',
);

describe('WorkflowBundle v4 caller 계약', () => {
  it('정적 검사와 Android build-only가 같은 중앙 full SHA를 사용한다', () => {
    const staticRef = orgContract.match(/rn-static-checks-v2\.yml@([0-9a-f]{40})/u);
    const buildRef = androidBuildOnly.match(
      /rn-build-android-cloud-v1\.yml@([0-9a-f]{40})/u,
    );

    expect(staticRef).not.toBeNull();
    expect(buildRef).not.toBeNull();
    expect(staticRef?.[1]).toBe(buildRef?.[1]);
    expect(orgContract + androidBuildOnly).not.toMatch(
      /secrets:\s*inherit|@(main|master|latest)\b/u,
    );
  });

  it('caller는 최소 권한과 exact source SHA만 전달한다', () => {
    const sourceSha = androidBuildOnly.match(/source_sha:\s*([0-9a-f]{40})/u)?.[1];

    expect(orgContract).toContain('permissions:\n  contents: read\n  packages: read');
    expect(androidBuildOnly).toContain(
      'permissions:\n  contents: read\n  id-token: write\n  packages: read',
    );
    expect(sourceSha).toHaveLength(40);
    expect(androidBuildOnly).toContain(`android-build-${'${{ github.repository_id }}'}-${sourceSha}`);
  });
});
