import type { AnalyticsValue, TrackGameEvent } from '../../../../packages/farm-core/src';

// GA4 Measurement Protocol 전송 클라이언트.
//
// 배경: AppsInToss 빌드는 Granite React Native 런타임(브라우저 DOM 없음)에서 동작하는데,
// 기존 계측은 브라우저 전용 Firebase JS Web SDK(firebase/analytics)를 사용해 isSupported()가
// false를 반환하고 getAnalytics()가 DOM 부재로 실패 → 이벤트가 단 한 건도 GA4로 전송되지
// 않았다. 그래서 RN에서 확실히 동작하는 Measurement Protocol(HTTP fetch) 전송으로 교체한다.
//
// farm-core는 네트워크/스토리지에 접근하지 않으므로, 실제 전송(fetch)·영속(Storage)은
// 이 앱 레이어가 주입한다. 모든 외부 의존성은 옵션으로 주입 가능해 헤드리스 테스트가 쉽다.

const MP_ENDPOINT = 'https://www.google-analytics.com/mp/collect';

// GA4 client_id 영속 키(설치 단위 안정 식별자). 브라우저 gtag의 _ga 쿠키에 대응한다.
export const GA4_CLIENT_ID_STORAGE_KEY = 'ait_ga4_client_id';

// MP 1회 요청당 이벤트 상한(GA4 규격: 25개).
const MAX_EVENTS_PER_REQUEST = 25;
// 초기화(client_id 로드) 완료 전 이벤트 큐 상한. 초과 시 가장 오래된 것부터 폐기.
const MAX_PENDING_EVENTS = 200;
// track 후 배치 전송까지의 debounce(ms). 연속 이벤트를 한 요청으로 묶어 네트워크를 아낀다.
const DEFAULT_FLUSH_DELAY_MS = 1000;
// GA4가 timestamp_micros를 받아주는 상한(72시간). 이보다 오래된 이벤트는 전송해도 버려진다.
const MAX_EVENT_AGE_MS = 72 * 60 * 60 * 1000;

export type Ga4McpInitResult =
  | { status: 'ready'; isNewClient: boolean }
  | { status: 'disabled'; reason: 'no_config' }
  | { status: 'error'; reason: string };

type StorageLike = {
  getItem: (key: string) => Promise<string | null> | string | null;
  setItem: (key: string, value: string) => Promise<void> | void;
};

export type Ga4MeasurementProtocolOptions = {
  measurementId: string;
  apiSecret: string;
  storage: StorageLike;
  /** 실제 HTTP 전송. 실패는 내부에서 삼켜 게임/다른 sink에 전파하지 않는다. */
  post: (url: string, body: string) => Promise<void>;
  /** epoch ms 제공자(테스트 주입). 기본 Date.now. */
  now?: () => number;
  /** client_id 생성기(테스트 주입). 기본 uuid v4 유사 문자열. */
  generateClientId?: () => string;
  /** 배치 debounce 스케줄러(테스트 주입). 기본 setTimeout/clearTimeout. */
  scheduleFlush?: (fn: () => void, ms: number) => unknown;
  cancelFlush?: (handle: unknown) => void;
  flushDelayMs?: number;
};

export type Ga4MeasurementProtocolClient = {
  /** client_id를 로드/생성하고 전송을 준비한다. 설정이 없으면 disabled를 반환한다. */
  initialize: () => Promise<Ga4McpInitResult>;
  /** 이벤트 전송(TrackGameEvent 호환). 준비 전이면 큐잉, 수집 비활성/미설정이면 무시. */
  track: TrackGameEvent;
  /** 기존 버퍼를 비운 뒤 현재 시각을 기준으로 새 GA4 session_id를 시작한다. */
  startNewSession: () => void;
  /** 버퍼 잔여 이벤트를 즉시 전송(백그라운드 전환/종료 훅에서 호출 권장). */
  flush: () => void;
  /** 수집 on/off. off면 이후 이벤트는 버퍼에 쌓지 않고 즉시 무시한다. */
  setCollectionEnabled: (enabled: boolean) => void;
};

// occurredAtMs는 track이 불린 시각이다. MP는 이벤트에 timestamp_micros가 없으면 요청이
// 도착한 시각을 전부에 찍는데, 이 클라이언트는 이벤트를 최대 1초 debounce로 묶어 보내므로
// 한 배치의 이벤트가 GA4에서 전부 같은 시각이 된다. 그러면 이벤트 순서도, 화면 진입부터
// 첫 조작까지의 간격도 GA4·BigQuery에서 복원할 수 없다. 발생 시각을 여기서 붙잡는다.
type QueuedEvent = { name: string; params: Record<string, AnalyticsValue>; occurredAtMs: number };

function defaultGenerateClientId(): string {
  const globalCrypto = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (globalCrypto?.randomUUID) {
    return globalCrypto.randomUUID();
  }
  // crypto 미지원 폴백. 충돌 확률이 낮은 설치 식별자면 충분하다(암호학적 강도 불필요).
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const rand = Math.floor(Math.random() * 16);
    const value = char === 'x' ? rand : (rand & 0x3) | 0x8;
    return value.toString(16);
  });
}

// MP 이벤트 파라미터 값은 string 또는 number만 허용된다(boolean/NaN은 farm-core에서 이미
// 정규화되지만, 방어적으로 한 번 더 스칼라로 강제한다).
function toScalar(value: AnalyticsValue): string | number {
  if (typeof value === 'boolean') {
    return value ? 1 : 0;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }
  return value;
}

export function createGa4MeasurementProtocolClient(
  options: Ga4MeasurementProtocolOptions,
): Ga4MeasurementProtocolClient {
  const {
    measurementId,
    apiSecret,
    storage,
    post,
    now = Date.now,
    generateClientId = defaultGenerateClientId,
    scheduleFlush = (fn, ms) => setTimeout(fn, ms),
    cancelFlush = (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
    flushDelayMs = DEFAULT_FLUSH_DELAY_MS,
  } = options;

  const hasConfig = measurementId !== '' && apiSecret !== '';
  const collectUrl = `${MP_ENDPOINT}?measurement_id=${encodeURIComponent(measurementId)}&api_secret=${encodeURIComponent(apiSecret)}`;

  let clientId: string | null = null;
  let sessionId: string | null = null;
  let ready = false;
  let collectionEnabled = true;
  let flushHandle: unknown = null;
  const pending: QueuedEvent[] = [];

  function buildPayload(batch: QueuedEvent[]): string {
    return JSON.stringify({
      client_id: clientId,
      events: batch.map((event) => {
        const params: Record<string, string | number> = {
          // GA4 표준 리포트(실시간뿐 아니라 세션/집계)에 이벤트가 잡히려면 세션 식별자와
          // 참여 시간이 필요하다. 이게 없으면 DebugView에만 보이고 리포트엔 누락된다.
          session_id: sessionId ?? '0',
          engagement_time_msec: 100,
        };
        for (const [key, value] of Object.entries(event.params)) {
          params[key] = toScalar(value);
        }
        // GA4는 72시간보다 오래된 timestamp_micros를 가진 이벤트를 버린다. 큐가 오래
        // 밀렸거나 기기 시계가 과거로 틀어진 경우까지 통째로 유실시키지 않도록, 한계에
        // 걸리는 이벤트는 시각을 붙이지 않고 보낸다(서버 도착 시각으로 기록됨).
        const ageMs = now() - event.occurredAtMs;
        if (ageMs < 0 || ageMs >= MAX_EVENT_AGE_MS) {
          return { name: event.name, params };
        }
        return {
          name: event.name,
          timestamp_micros: event.occurredAtMs * 1000,
          params,
        };
      }),
    });
  }

  function sendBatch(batch: QueuedEvent[]): void {
    if (batch.length === 0) {
      return;
    }
    // best-effort. 실패해도 게임/다른 sink에 영향 없음.
    void post(collectUrl, buildPayload(batch)).catch(() => {});
  }

  function flush(): void {
    if (flushHandle != null) {
      cancelFlush(flushHandle);
      flushHandle = null;
    }
    if (!ready || pending.length === 0) {
      return;
    }
    // 25개 단위로 나눠 전송(GA4 요청당 이벤트 상한).
    while (pending.length > 0) {
      sendBatch(pending.splice(0, MAX_EVENTS_PER_REQUEST));
    }
  }

  function scheduleFlushSoon(): void {
    if (flushHandle != null) {
      return;
    }
    flushHandle = scheduleFlush(() => {
      flushHandle = null;
      flush();
    }, flushDelayMs);
  }

  function startNewSession(): void {
    // 이전 세션 이벤트가 새 session_id로 잘못 묶이지 않도록 먼저 비운다.
    if (ready) {
      flush();
    }
    sessionId = String(now());
  }

  const track: TrackGameEvent = (name, params = {}) => {
    if (!hasConfig || !collectionEnabled) {
      return;
    }
    if (pending.length >= MAX_PENDING_EVENTS) {
      // 큐 상한 초과 시 가장 오래된 이벤트부터 폐기해 메모리 무한 증가를 막는다.
      pending.shift();
    }
    pending.push({ name, params, occurredAtMs: now() });

    if (!ready) {
      return;
    }
    if (pending.length >= MAX_EVENTS_PER_REQUEST) {
      flush();
    } else {
      scheduleFlushSoon();
    }
  };

  async function initialize(): Promise<Ga4McpInitResult> {
    if (!hasConfig) {
      // 설정(비밀값) 미주입 → 전송 no-op. 로컬/개발 빌드에서 정상 상태다.
      return { status: 'disabled', reason: 'no_config' };
    }
    try {
      const stored = await storage.getItem(GA4_CLIENT_ID_STORAGE_KEY);
      const isNewClient = stored == null || stored === '';
      if (stored != null && stored !== '') {
        clientId = stored;
      } else {
        clientId = generateClientId();
        await storage.setItem(GA4_CLIENT_ID_STORAGE_KEY, clientId);
      }
      startNewSession();
      ready = true;
      // 준비 완료 시점에 큐에 쌓인 이벤트를 즉시 전송해 유실을 막는다.
      flush();
      return { status: 'ready', isNewClient };
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'unknown';
      return { status: 'error', reason };
    }
  }

  function setCollectionEnabled(enabled: boolean): void {
    collectionEnabled = enabled;
  }

  return { initialize, track, startNewSession, flush, setCollectionEnabled };
}
