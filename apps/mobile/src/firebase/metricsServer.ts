import { Platform } from 'react-native';

import {
  createHttpMetricsSink,
  sinkToTrackGameEvent,
  type MetricsEventPayload,
  type TrackGameEvent,
} from '../../../../packages/farm-core/src';

// 자체 지표 서버 전송 seam(모바일 Android/iOS). 엔드포인트가 비어 있어 현재 tracker는
// null → Firebase(GA4)로만 전송(기존 동작 동일). 자체 지표 서버 준비 시 엔드포인트만
// 채우면 이벤트가 함께 전송된다. market은 스토어 단위로 분리한다(app_store/google_play).
// (: string 명시로 상수 폴딩/도달불가 코드 경고를 피한다.)
const SELF_METRICS_ENDPOINT: string = '';

function postEvents(batch: MetricsEventPayload[]): void {
  // best-effort. 실패해도 게임/파이어베이스 전송에 영향 없음.
  void fetch(SELF_METRICS_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ events: batch }),
  }).catch(() => {});
}

/** 자체 서버 tracker(미설정이면 null). combineTrackers에 넘겨 firebase와 함께 fanout. */
export function createMobileSelfServerTracker(): TrackGameEvent | null {
  if (!SELF_METRICS_ENDPOINT) {
    return null;
  }
  const { sink } = createHttpMetricsSink({
    app: 'happy-farm',
    market: Platform.OS === 'ios' ? 'app_store' : 'google_play',
    transport: postEvents,
  });
  return sinkToTrackGameEvent(sink);
}
