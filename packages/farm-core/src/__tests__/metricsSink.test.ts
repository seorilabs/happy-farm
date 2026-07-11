/// <reference types="jest" />

import {
  combineTrackers,
  createHttpMetricsSink,
  sinkToTrackGameEvent,
  type MetricsEventPayload,
} from '../metricsSink';
import { createFarmAnalytics, getGameAnalyticsContext } from '../analytics';
import { createInitialState } from '../constants';

describe('metrics sink fanout seam(자체 지표 서버 대비)', () => {
  test('combineTrackers는 한 이벤트를 모든 tracker로 fanout한다', () => {
    const a = jest.fn();
    const b = jest.fn();
    const track = combineTrackers(a, b);

    track('crop_harvested', { crop: 'carrot', revenue: 20 });

    expect(a).toHaveBeenCalledWith('crop_harvested', { crop: 'carrot', revenue: 20 });
    expect(b).toHaveBeenCalledWith('crop_harvested', { crop: 'carrot', revenue: 20 });
  });

  test('null/undefined tracker는 무시한다(자체 서버 미배선 = firebase만 전송)', () => {
    const firebase = jest.fn();
    const track = combineTrackers(firebase, null, undefined);

    track('game_start', {});

    expect(firebase).toHaveBeenCalledWith('game_start', {});
  });

  test('한 sink가 throw해도 다른 sink 전송은 유실되지 않는다(격리)', () => {
    const boom = jest.fn(() => {
      throw new Error('sink down');
    });
    const healthy = jest.fn();
    const track = combineTrackers(boom, healthy);

    expect(() => track('area_unlocked', { area: 'orchard' })).not.toThrow();
    expect(healthy).toHaveBeenCalledWith('area_unlocked', { area: 'orchard' });
  });

  test('활성 tracker가 하나뿐이면 그대로 반환해 기존 동작/에러 의미를 보존한다', () => {
    const only = jest.fn(() => {
      throw new Error('propagate');
    });
    const track = combineTrackers(only, null);

    // wrapper로 감싸지 않으므로 단일 tracker의 throw는 그대로 전파된다.
    expect(() => track('x', {})).toThrow('propagate');
  });

  test('createFarmAnalytics를 fanout tracker로 배선하면 콘텐츠 이벤트가 모든 sink로 간다', () => {
    const firebase = jest.fn();
    const selfServer = jest.fn();
    const analytics = createFarmAnalytics(combineTrackers(firebase, selfServer));
    const context = getGameAnalyticsContext(
      createInitialState(),
      Date.parse('2026-05-27T03:00:00.000Z'),
      Date.parse('2026-05-27T03:00:05.000Z'),
    );

    analytics.trackCropPlanted('carrot', 'starter_field', 1, 10, context);

    for (const sink of [firebase, selfServer]) {
      expect(sink).toHaveBeenCalledWith(
        'crop_planted',
        expect.objectContaining({ crop: 'carrot', area: 'starter_field' }),
      );
    }
  });
});

describe('createHttpMetricsSink(자체 서버 HTTP sink)', () => {
  test('transport 미주입이면 완전 no-op이다(버퍼 적재조차 안 함)', () => {
    const httpSink = createHttpMetricsSink({ app: 'happy-farm', market: 'apps_in_toss' });

    sinkToTrackGameEvent(httpSink.sink)('crop_harvested', { crop: 'carrot' });
    httpSink.flush();

    expect(httpSink.size()).toBe(0);
  });

  test('배치 크기 도달 시 app/market/ts를 실어 transport로 flush한다', () => {
    const sent: MetricsEventPayload[][] = [];
    let clock = 1000;
    const httpSink = createHttpMetricsSink({
      app: 'happy-farm',
      market: 'google_play',
      batchSize: 2,
      now: () => clock++,
      transport: (batch) => sent.push(batch),
    });
    const track = sinkToTrackGameEvent(httpSink.sink);

    track('crop_planted', { crop: 'carrot' });
    expect(sent).toHaveLength(0); // 아직 배치 미도달
    track('crop_harvested', { crop: 'carrot', revenue: 20 });

    expect(sent).toHaveLength(1);
    expect(sent[0]).toEqual([
      { name: 'crop_planted', params: { app: 'happy-farm', market: 'google_play', crop: 'carrot' }, ts: 1000 },
      {
        name: 'crop_harvested',
        params: { app: 'happy-farm', market: 'google_play', crop: 'carrot', revenue: 20 },
        ts: 1001,
      },
    ]);
    expect(httpSink.size()).toBe(0);
  });

  test('flush는 배치 미만이라도 잔여 이벤트를 전송한다', () => {
    const sent: MetricsEventPayload[][] = [];
    const httpSink = createHttpMetricsSink({
      app: 'happy-farm',
      market: 'apps_in_toss',
      batchSize: 10,
      now: () => 42,
      transport: (batch) => sent.push(batch),
    });

    httpSink.sink({ name: 'area_unlocked', params: { area: 'orchard' } });
    expect(sent).toHaveLength(0);
    httpSink.flush();

    expect(sent).toHaveLength(1);
    expect(sent[0]?.[0]?.name).toBe('area_unlocked');
  });

  test('transport가 throw해도 삼켜 게임 진행을 막지 않는다', () => {
    const httpSink = createHttpMetricsSink({
      app: 'happy-farm',
      market: 'apps_in_toss',
      batchSize: 1,
      transport: () => {
        throw new Error('network down');
      },
    });

    expect(() => httpSink.sink({ name: 'crop_ready', params: { crop: 'carrot' } })).not.toThrow();
  });
});
