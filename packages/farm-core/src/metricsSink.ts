import type { AnalyticsValue, TrackGameEvent } from './analytics';

// 지표 전송 seam(자체 지표 서버 대비). 현재 이벤트는 Firebase(GA4)로만 전송되지만,
// 자체 지표 서버가 준비되면 "이벤트별 로그"를 같은 계약으로 함께 보낼 수 있도록
// 플랫폼 중립 fanout 레이어를 farm-core에 둔다. farm-core는 네트워크/타이머를
// import하지 않으므로, 실제 전송(fetch 등)은 앱 레이어가 transport로 주입한다.
//
// 배선 방식:
//   createFarmAnalytics(combineTrackers(firebaseTracker, selfServerTracker))
// selfServerTracker가 null이면(엔드포인트 미설정) firebase만 전송 → 현 동작과 동일.

/** 이벤트 1건(이름 + 파라미터). track(name, params) 호출을 객체로 표현. */
export type AnalyticsEvent = {
  name: string;
  params: Record<string, AnalyticsValue>;
};

/** 이벤트 sink 1개(자체 서버 전송 등). 실패는 sink 내부에서 삼켜 다른 sink에 전파 금지. */
export type MetricsSink = (event: AnalyticsEvent) => void;

/** sink(이벤트 객체) → TrackGameEvent(name, params) 호출 형태로 어댑트. */
export function sinkToTrackGameEvent(sink: MetricsSink): TrackGameEvent {
  return (name, params = {}) => sink({ name, params });
}

/**
 * 여러 tracker로 한 이벤트를 fanout한다. null/undefined tracker는 무시하므로
 * "자체 서버 미배선"이면 firebase tracker만 남아 현 동작과 완전히 동일해진다.
 * 각 tracker 호출은 격리되어, 한 sink가 throw해도 나머지 sink 전송이 유실되지 않는다.
 */
export function combineTrackers(
  ...trackers: (TrackGameEvent | null | undefined)[]
): TrackGameEvent {
  const active = trackers.filter((t): t is TrackGameEvent => typeof t === 'function');
  if (active.length === 0) {
    return (_name, _params = {}) => {
      void _name;
      void _params;
    };
  }
  // 단일 tracker면 wrapper 없이 그대로 반환 → 기존 firebase-only 동작/에러 의미 보존.
  const [first] = active;
  if (active.length === 1 && first) {
    return first;
  }
  return (name, params = {}) => {
    for (const track of active) {
      try {
        track(name, params);
      } catch {
        // 한 sink 실패를 다른 sink로 전파하지 않고 계속 진행한다.
      }
    }
  };
}

// ── 자체 지표 서버용 HTTP sink(주입 transport) ───────────────────────────────

/** 자체 서버로 보내는 이벤트 페이로드(발생 시각 포함 → 서버가 일자 버킷팅). */
export type MetricsEventPayload = {
  name: string;
  params: Record<string, AnalyticsValue>;
  /** 이벤트 발생 시각(epoch ms). */
  ts: number;
};

/** 실제 배치 전송 구현(앱 레이어가 주입: fetch POST 등). farm-core는 네트워크 미접근. */
export type MetricsTransport = (batch: MetricsEventPayload[]) => void;

export type HttpMetricsSinkOptions = {
  /** 앱 식별자(자체 서버가 앱별 콘텐츠 지표를 분리하는 키). */
  app: string;
  /** 시장/플랫폼 식별자(apps_in_toss / google_play / app_store 등). */
  market: string;
  /** 전송 구현. 미주입(null/undefined)이면 sink는 완전 no-op. */
  transport?: MetricsTransport | null;
  /** epoch ms 제공자(테스트 주입). 기본 Date.now. */
  now?: () => number;
  /** 배치 최대 크기. 도달 시 자동 flush. 기본 20. */
  batchSize?: number;
};

export type HttpMetricsSink = {
  /** 이벤트를 버퍼에 적재(배치 크기 도달 시 자동 flush). */
  sink: MetricsSink;
  /** 버퍼 잔여 이벤트를 즉시 전송. 백그라운드 전환/종료 훅에서 호출 권장. */
  flush: () => void;
  /** 현재 버퍼 길이(진단/테스트용). */
  size: () => number;
};

/**
 * 자체 지표 서버로 이벤트를 배치 전송하는 sink를 만든다. transport 미주입 시 완전
 * no-op이라, 서버가 준비되기 전에는 오버헤드 없이 배선만 해둘 수 있다(drop-in seam).
 * app/market은 모든 페이로드 params에 주입되어 서버가 앱·시장 단위로 분해할 수 있다.
 */
export function createHttpMetricsSink(options: HttpMetricsSinkOptions): HttpMetricsSink {
  const { app, market, transport, now = Date.now, batchSize = 20 } = options;
  const buffer: MetricsEventPayload[] = [];

  const flush = () => {
    if (!transport || buffer.length === 0) {
      // transport 미배선이면 버퍼를 비워 메모리 누수를 막는다(자체 서버 미연결 상태).
      buffer.length = 0;
      return;
    }
    const batch = buffer.splice(0, buffer.length);
    try {
      transport(batch);
    } catch {
      // 전송 실패는 게임 진행을 막지 않는다(best-effort). 실패 배치는 폐기.
    }
  };

  const sink: MetricsSink = (event) => {
    if (!transport) return; // 자체 서버 미배선: 즉시 반환(버퍼 적재조차 안 함)
    buffer.push({
      name: event.name,
      params: { app, market, ...event.params },
      ts: now(),
    });
    if (buffer.length >= batchSize) {
      flush();
    }
  };

  return { sink, flush, size: () => buffer.length };
}
