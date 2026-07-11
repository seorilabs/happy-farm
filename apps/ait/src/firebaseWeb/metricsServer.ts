import {
  createHttpMetricsSink,
  sinkToTrackGameEvent,
  type MetricsEventPayload,
  type TrackGameEvent,
} from '../../../../packages/farm-core/src';

// 자체 지표 서버 전송 seam(AppsInToss/웹). 현재 엔드포인트가 비어 있어 tracker는
// null → Firebase(GA4)로만 전송되며 기존 동작과 동일하다. 자체 지표 서버가 준비되면
// SELF_METRICS_ENDPOINT만 채우면 별도 리팩터 없이 이벤트가 함께 전송된다.
// (: string 명시로 상수 폴딩/도달불가 코드 경고를 피한다.)
const SELF_METRICS_ENDPOINT: string = '';

function postEvents(batch: MetricsEventPayload[]): void {
  // best-effort. 실패해도 게임/파이어베이스 전송에 영향 없음.
  void fetch(SELF_METRICS_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ events: batch }),
    keepalive: true,
  }).catch(() => {});
}

/** 자체 서버 tracker(미설정이면 null). combineTrackers에 넘겨 firebase와 함께 fanout. */
export function createAppsInTossSelfServerTracker(): TrackGameEvent | null {
  if (!SELF_METRICS_ENDPOINT) {
    return null;
  }
  const { sink } = createHttpMetricsSink({
    app: 'happy-farm',
    market: 'apps_in_toss',
    transport: postEvents,
  });
  return sinkToTrackGameEvent(sink);
}
