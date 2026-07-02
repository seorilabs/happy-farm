import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';

import {
  WHEEL_SLOTS,
  formatMoney,
  formatRemainingTime,
  getRewardedGoldAmount,
  getWheelSlotGold,
  getWheelStatus,
  type GameState,
  type SupportedLocale,
  type WheelReward,
} from '../../../farm-core/src';

import type { FarmMessages } from '../i18n';
import { SheetAction } from './SheetParts';

// 데일리 룰렛 시트(#208).
//
// 핵심 계약: 보상 확정과 연출은 분리된다. 스핀을 누르는 즉시 onSpin(호출부의
// spinWheel + 골드 반영)이 실행돼 보상이 확정되고, 이후 1.5~2.5초의 슬롯 순회-감속
// 하이라이트는 순수 코스메틱이다. 연출 중 시트가 닫히거나 언마운트돼도 보상은 이미
// 지급된 상태라 유실/이중 지급이 없다(타이머만 정리).
//
// 감속 스텝은 easeOutCubic 누적 시각의 차분으로 만들어 앞은 빠르고 끝은 느리게
// 슬롯을 순회하며, 마지막 스텝이 당첨 슬롯에서 멈춘다. 하이라이트 셀의 펄스는
// 기존 패턴(ReadyCropIcon/HarvestPopText)과 동일하게 Animated + useNativeDriver를
// 쓰므로 JS 스레드의 250ms 게임 틱과 간섭하지 않는다.

// 전체 연출 길이. 스텝 수(당첨 슬롯 위치에 따라 2바퀴 + α)와 무관하게 총 시간을
// 고정해 어떤 슬롯이 나와도 체감이 같다.
const SPIN_TOTAL_MS = 2000;
// 순회 바퀴 수(감속 전 충분한 기대감을 주는 최소 회전).
const SPIN_FULL_CYCLES = 2;

// easeOutCubic 누적 시각의 차분 → 스텝별 지연(ms). 합은 totalMs.
function buildStepDelays(stepCount: number, totalMs: number): number[] {
  const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
  return Array.from(
    { length: stepCount },
    (_, index) => totalMs * (easeOut((index + 1) / stepCount) - easeOut(index / stepCount))
  );
}

type SpinPlayback = {
  // 당첨 슬롯 인덱스(연출이 멈출 위치).
  winnerIndex: number;
  // 확정된 보상 골드(연출 종료 후 결과 카드/토스트에 사용).
  gold: number;
};

export function WheelSheet({
  gameState,
  locale,
  messages,
  now,
  onSpin,
  onRevealed,
}: {
  gameState: GameState;
  locale: SupportedLocale;
  messages: FarmMessages;
  now: number;
  // 스핀 커밋(보상 확정 + 골드 반영)을 수행하고 확정 보상을 돌려준다. 스핀 불가면 null.
  onSpin: () => WheelReward | null;
  // 연출 종료(당첨 슬롯 정지) 시 1회 호출 — 호출부에서 토스트/골드 펄스에 사용.
  onRevealed?: (gold: number) => void;
}) {
  // 비정상 now(NaN 등) 방어: 상태 판정과 카운트다운이 같은 기준 시각을 쓰게 정규화한다.
  // getWheelStatus는 같은 safeNow로 nextSpinAt을 산출하므로, 쿨다운 중 잔여 시간은
  // 항상 (0, 24h] 범위다(시계 점프에도 음수/과대 표시가 나오지 않는다).
  const safeNow = Number.isFinite(now) ? now : Date.now();
  const status = getWheelStatus(gameState.wheelState, safeNow);
  const adRewardGold = getRewardedGoldAmount(gameState);

  // 연출 진행 상태(진행 중이면 non-null). 보상 자체는 이미 확정돼 있다.
  const [playback, setPlayback] = useState<SpinPlayback | null>(null);
  // 현재 하이라이트 중인 슬롯 인덱스(연출 중에만 유효).
  const [highlightIndex, setHighlightIndex] = useState<number | null>(null);
  // 연출 종료 후 결과 카드에 표시할 확정 보상(당첨 슬롯 강조 유지용 인덱스 포함).
  const [result, setResult] = useState<SpinPlayback | null>(null);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const spinningRef = useRef(false);
  // 하이라이트 셀 펄스(0→1 반복). useNativeDriver로 게임 틱과 간섭하지 않는다.
  const pulseAnim = useRef(new Animated.Value(0)).current;
  // 실행 중인 펄스 루프 핸들. 재스핀(자정 롤오버 후) 시 이전 루프를 명시적으로 stop해
  // Animated.loop가 누적되지 않게 하고, 언마운트 정리에도 같은 핸들을 쓴다.
  const pulseLoopRef = useRef<Animated.CompositeAnimation | null>(null);

  function stopPulseLoop() {
    pulseLoopRef.current?.stop();
    pulseLoopRef.current = null;
    pulseAnim.stopAnimation();
    pulseAnim.setValue(0);
  }

  // 언마운트 시 타이머/애니메이션만 정리한다. 보상은 스핀 시점에 이미 확정·지급됐으므로
  // 연출이 중단돼도 유실되지 않는다(이 계약은 sheets.test.tsx에서 고정).
  useEffect(() => {
    return () => {
      if (timerRef.current != null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      stopPulseLoop();
    };
    // stopPulseLoop는 렌더마다 새로 만들어지지만 ref/Animated.Value만 만지는 안정 로직이다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function startSpin() {
    // 연출 중 재탭 가드(보상 커밋은 호출부에서도 이중 방지되지만, 연출 중복 시작도 막는다).
    if (spinningRef.current) {
      return;
    }
    const reward = onSpin();
    if (reward == null) {
      return;
    }
    const winnerIndex = Math.max(
      0,
      WHEEL_SLOTS.findIndex((slot) => slot.key === reward.slotKey)
    );
    spinningRef.current = true;
    setResult(null);
    setPlayback({ winnerIndex, gold: reward.gold });
    setHighlightIndex(0);

    // 재스핀 경로(자정 롤오버 후) 대비: 이전 루프를 먼저 정리해 누적을 막는다.
    stopPulseLoop();
    pulseLoopRef.current = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 160, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0, duration: 160, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      ])
    );
    pulseLoopRef.current.start();

    // 마지막 스텝 인덱스가 당첨 슬롯과 합동이 되도록 스텝 수를 정한다:
    // (stepCount - 1) % 슬롯수 === winnerIndex.
    const stepCount = SPIN_FULL_CYCLES * WHEEL_SLOTS.length + winnerIndex + 1;
    const delays = buildStepDelays(stepCount, SPIN_TOTAL_MS);
    const runStep = (step: number) => {
      timerRef.current = setTimeout(() => {
        setHighlightIndex(step % WHEEL_SLOTS.length);
        if (step + 1 < stepCount) {
          runStep(step + 1);
          return;
        }
        // 연출 종료: 당첨 슬롯에 정지. 결과 카드 노출 + 호출부 알림(토스트/펄스).
        // 마지막 타이머는 소진됐으므로 ref를 비워 cleanup이 항상 유효한 대상만 가리키게 한다.
        timerRef.current = null;
        spinningRef.current = false;
        stopPulseLoop();
        setPlayback(null);
        setHighlightIndex(null);
        setResult({ winnerIndex, gold: reward.gold });
        onRevealed?.(reward.gold);
      }, delays[step] ?? 0);
    };
    runStep(0);
  }

  const highlightScale = pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] });
  // 결과 강조(연출 종료 후) 또는 연출 중 하이라이트 인덱스.
  const emphasizedIndex = playback != null ? highlightIndex : (result?.winnerIndex ?? null);

  return (
    <View testID="wheel-sheet">
      {/* 슬롯 릴: 무엇을 얻을 수 있는지 항상 노출(스핀 동기 부여). 보상은 진행도
          스케일된 광고 보상 × 슬롯 배수로, 상점/수령 경로와 같은 기준 금액이다. */}
      <Text style={styles.reelTitle}>{messages.wheelSlotsTitle}</Text>
      <View style={styles.reelRow}>
        {WHEEL_SLOTS.map((slot, index) => {
          const active = emphasizedIndex === index;
          const spinningActive = active && playback != null;
          return (
            <Animated.View
              key={slot.key}
              testID={`wheel-slot-${slot.key}`}
              style={[
                styles.reelCell,
                active ? styles.reelCellActive : null,
                spinningActive ? { transform: [{ scale: highlightScale }] } : null,
              ]}
            >
              <Text style={styles.reelIcon}>{slot.icon}</Text>
              <Text style={[styles.reelGold, active ? styles.reelGoldActive : null]} numberOfLines={1}>
                {formatMoney(getWheelSlotGold(slot, adRewardGold), locale)}G
              </Text>
            </Animated.View>
          );
        })}
      </View>

      <View style={styles.statusRow}>
        <Text style={styles.statusIcon}>{result != null ? '🎉' : '🎰'}</Text>
        <View style={styles.statusText}>
          {playback != null ? (
            <Text style={styles.statusLabel}>{messages.wheelSpinningLabel}</Text>
          ) : result != null ? (
            <>
              <Text style={styles.statusLabel}>
                {messages.wheelRewardToast(formatMoney(result.gold, locale))}
              </Text>
              <Text style={styles.statusValue} testID="wheel-result">
                +{formatMoney(result.gold, locale)}G
              </Text>
            </>
          ) : (
            <Text style={styles.statusLabel}>
              {status.canSpin
                ? messages.wheelReadyLabel
                : messages.wheelNextSpinLabel(
                    formatRemainingTime(Math.max(0, status.nextSpinAt - safeNow), locale)
                  )}
            </Text>
          )}
        </View>
      </View>

      {/* 결과 카드가 떠 있어도 자정 롤오버로 canSpin이 다시 열리면 재스핀을 허용한다
          (startSpin이 이전 결과/펄스 루프를 정리하고 새 연출을 시작). */}
      {status.canSpin && playback == null ? (
        <SheetAction label={messages.wheelSpinAction} onPress={startSpin} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  reelTitle: {
    marginBottom: 8,
    color: '#667085',
    fontSize: 12,
    fontWeight: '700',
  },
  reelRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 14,
  },
  reelCell: {
    minWidth: 52,
    flexGrow: 1,
    flexBasis: '14%',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderWidth: 1,
    borderColor: '#d0d5dd',
    borderRadius: 8,
    backgroundColor: '#ffffff',
  },
  reelCellActive: {
    borderColor: '#bf7a00',
    backgroundColor: '#fff7e6',
  },
  reelIcon: {
    fontSize: 20,
  },
  reelGold: {
    marginTop: 4,
    color: '#667085',
    fontSize: 10,
    fontWeight: '800',
  },
  reelGoldActive: {
    color: '#bf7a00',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  statusIcon: {
    fontSize: 28,
  },
  statusText: {
    minWidth: 0,
    flexShrink: 1,
  },
  statusLabel: {
    color: '#253126',
    fontSize: 14,
    fontWeight: '800',
  },
  statusValue: {
    marginTop: 2,
    color: '#bf7a00',
    fontSize: 16,
    fontWeight: '900',
  },
});
