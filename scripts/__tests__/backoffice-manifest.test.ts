import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// @ts-expect-error — 저장소 품질 게이트용 CommonJS 검증 모듈의 런타임 계약을 검증한다.
import { validateBackofficeManifest } from '../lib/backoffice-manifest.js';

const root = path.join(__dirname, '..', '..');

type TestOption = { value: string; label: string };
type TestInput = { key: string; options?: TestOption[] };
type TestOperation = {
  id: string;
  confirmation?: string;
  inputs?: TestInput[];
};
type TestTool = {
  runbook?: string;
  operations: TestOperation[];
};
type TestPredicate = { param: string; op: string; value?: string | number };
type TestMetric = {
  key?: string;
  event: string | string[];
  where?: TestPredicate[];
};
type TestManifest = {
  tools: TestTool[];
  analytics: {
    content: {
      metrics: TestMetric[];
      groups: Array<{ key: string; param: string; metrics: TestMetric[] }>;
    };
  };
};

function required<T>(value: T | undefined, label: string): T {
  if (value == null) throw new Error(`테스트 fixture 누락: ${label}`);
  return value;
}

function withManifestMutation(mutate: (manifest: TestManifest) => void, assertion: (failures: string[]) => void) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'happy-farm-backoffice-'));
  try {
    for (const relativePath of [
      '.seorilabs/backoffice.json',
      'packages/farm-core/src/analytics.ts',
      'packages/farm-core/src/ads.ts',
      'docs/04-work/backoffice-operations.md',
    ]) {
      const source = path.join(root, relativePath);
      const target = path.join(tempRoot, relativePath);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(source, target);
    }
    const manifestPath = path.join(tempRoot, '.seorilabs/backoffice.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as TestManifest;
    mutate(manifest);
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    assertion(validateBackofficeManifest(tempRoot).failures);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

describe('행복한 농장 전용 백오피스 manifest', () => {
  it('현재 manifest가 게임의 이벤트·placement 계약과 일치한다', () => {
    expect(validateBackofficeManifest(root).failures).toEqual([]);
  });

  it('게임에 없는 이벤트와 그룹 파라미터를 거부한다', () => {
    withManifestMutation(
      (manifest) => {
        manifest.analytics.content.metrics[0].event = 'invented_event';
        required(
          manifest.analytics.content.groups.find((group) => group.key === 'workshop'),
          'workshop group'
        ).param = 'invented_recipe';
      },
      (failures) => {
        expect(failures).toEqual(
          expect.arrayContaining([
            expect.stringContaining('analytics.ts에 없는 이벤트 invented_event'),
            expect.stringContaining('craft_started에 없는 파라미터 invented_recipe'),
          ])
        );
      }
    );
  });

  it('새 광고 placement가 전용 조회 도구에서 빠지면 실패한다', () => {
    withManifestMutation(
      (manifest) => {
        const placementInput = required(
          manifest.tools
            .flatMap((tool) => tool.operations)
            .flatMap((operation) => operation.inputs ?? [])
            .find((input) => input.key === 'placement'),
          'placement input'
        );
        placementInput.options = required(placementInput.options, 'placement options').filter(
          (option) => option.value !== 'wheel_bonus_spin'
        );
      },
      (failures) => {
        expect(failures).toContain('광고 placement 누락: wheel_bonus_spin');
      }
    );
  });

  it('ne_or_unset은 일부 이벤트의 파라미터 누락만 허용하고 전체 오타는 거부한다', () => {
    withManifestMutation(
      (manifest) => {
        const harvesters = required(
          required(
            manifest.analytics.content.groups.find((group) => group.key === 'crop'),
            'crop group'
          ).metrics.find((metric) => metric.key === 'harvesters'),
          'harvesters metric'
        );
        required(harvesters.where, 'harvesters where')[0].param = 'invented_source';
      },
      (failures) => {
        expect(failures).toContain(
          'analytics.content.groups[0].metrics[4].where: 모든 이벤트에 없는 파라미터 invented_source입니다.'
        );
      }
    );
  });

  it('확인 절차가 없는 변경 오퍼레이션을 거부한다', () => {
    // 원격 설정을 걷어낸 뒤 현재 manifest에는 변경 오퍼레이션이 없다. 앞으로 다시
    // 생겼을 때 확인 절차 없이 통과하지 않도록 규칙 자체는 유지한다.
    withManifestMutation(
      (manifest) => {
        const tool = required(manifest.tools[0], 'first tool');
        tool.operations.push({
          id: 'unsafe-mutate',
          label: '확인 없는 변경',
          intent: 'mutate',
          risk: 'high',
        });
      },
      (failures) => {
        expect(failures).toEqual(
          expect.arrayContaining([expect.stringContaining('변경에는 reason 또는 typed 확인이 필요합니다')])
        );
      }
    );
  });

  it('runbook 파일이 없으면 manifest를 불완전으로 판정한다', () => {
    withManifestMutation(
      (manifest) => {
        manifest.tools[0].runbook = 'docs/04-work/missing-backoffice-runbook.md';
      },
      (failures) => {
        expect(failures).toContain(
          'manifest.tools[0].runbook: 파일이 존재하지 않습니다(docs/04-work/missing-backoffice-runbook.md).'
        );
      }
    );
  });

  it('runbook이 세이브 권위·직접 수정 금지·D-1 지연·실행 경계를 명시한다', () => {
    const runbook = fs.readFileSync(path.join(root, 'docs/04-work/backoffice-operations.md'), 'utf8');

    expect(runbook).toContain('로컬 세이브가 유일한 저장소다');
    expect(runbook).toContain('Firebase와 Firestore를 직접 변경하지 않는다');
    expect(runbook).toContain('일별 export의 확정 구간(D-1)');
    expect(runbook).toContain('실제 변경 실행기는 아직 연결되지 않았다');
  });
});
