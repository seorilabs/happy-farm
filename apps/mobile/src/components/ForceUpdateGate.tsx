import React, { useEffect, useRef, useState } from 'react';
import { Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { detectRuntimeLocale, getFarmMessages } from '../../../../packages/farm-ui/src';
import { mobileFarmAnalytics } from '../firebase';
import { recordNonFatalError } from '../firebase/crashlytics';
import { evaluateForceUpdateGate, type ForceUpdateGateEvaluation } from '../firebase/updateGate';

// #428: 최소지원버전 게이트 UI. 게이트가 발동하면(구버전) 스토어로 유도하는 차단형
// 모달을 덮는다. 게임 화면(FarmGame) 위 앱 셸 레이어에 위치하는 팝업이라 상단 HUD를
// 건드리지 않는다. 닫기 수단이 없는 강제 안내이며, force_update_url(또는 플랫폼 폴백)
// 스토어 링크만 제공한다.

// 게이트 평가를 주입할 수 있게 열어 둔다(테스트에서 결정적으로 제어).
export type ForceUpdateGateProps = {
  // Remote Config fetchAndActivate가 끝난 뒤에만 평가한다. 활성화 이전에 평가하면
  // 아직 기본값(1)이라 항상 게이트가 닫혀 오탐이 없지만, 활성화된 최소버전을 반영하려면
  // 이 신호가 켜진 뒤 재평가해야 한다.
  remoteConfigReady: boolean;
  evaluate?: () => ForceUpdateGateEvaluation;
};

export function ForceUpdateGate({ remoteConfigReady, evaluate = evaluateForceUpdateGate }: ForceUpdateGateProps) {
  const [gate, setGate] = useState<ForceUpdateGateEvaluation | null>(null);
  const shownTrackedRef = useRef(false);
  const messages = getFarmMessages(detectRuntimeLocale());

  useEffect(() => {
    if (!remoteConfigReady) {
      return;
    }
    setGate(evaluate());
  }, [remoteConfigReady, evaluate]);

  useEffect(() => {
    if (gate == null || !gate.shouldPrompt || shownTrackedRef.current) {
      return;
    }
    shownTrackedRef.current = true;
    mobileFarmAnalytics.trackUpdateGateShown({
      buildNumber: gate.buildNumber,
      minimumSupportedVersionCode: gate.minimumSupportedVersionCode,
      platform: gate.platform,
    });
  }, [gate]);

  if (gate == null || !gate.shouldPrompt) {
    return null;
  }

  const handleOpenStore = () => {
    mobileFarmAnalytics.trackUpdateGateStoreClick({
      buildNumber: gate.buildNumber,
      minimumSupportedVersionCode: gate.minimumSupportedVersionCode,
      platform: gate.platform,
    });
    void Linking.openURL(gate.storeUrl).catch((error: unknown) => {
      recordNonFatalError(error, 'update_gate:open_store');
    });
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => undefined}>
      <View style={styles.backdrop}>
        <View style={styles.card} testID="force-update-card">
          <Text style={styles.title}>{messages.forceUpdateTitle}</Text>
          <Text style={styles.message}>{messages.forceUpdateMessage}</Text>
          <Pressable
            accessibilityRole="button"
            style={styles.button}
            onPress={handleOpenStore}
            testID="force-update-store-button"
          >
            <Text style={styles.buttonLabel}>{messages.forceUpdateStoreAction}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1f2937',
    textAlign: 'center',
    marginBottom: 12,
  },
  message: {
    fontSize: 15,
    lineHeight: 22,
    color: '#4b5563',
    textAlign: 'center',
    marginBottom: 24,
  },
  button: {
    width: '100%',
    backgroundColor: '#4caf6a',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
  },
});
