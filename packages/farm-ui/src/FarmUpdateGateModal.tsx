import React, { useEffect, useLayoutEffect, useState } from 'react';
import { Modal, Platform } from 'react-native';
import type { FarmUpdateGatePresentation } from './updateGate';

type Slot = {
  stage: 'idle' | 'opening' | 'shown' | 'closing';
  held: FarmUpdateGatePresentation | null;
  id: number;
};

// iOS는 표시 중 취소와 닫히는 중 재표시를 처리하지 못하므로 네이티브 전환을 마친다.
export function FarmUpdateGateModal({ presentation, testID, onScreenChange }: {
  presentation: FarmUpdateGatePresentation | null;
  testID: string;
  onScreenChange?: (onScreen: boolean) => void;
}) {
  const [slot, setSlot] = useState<Slot>({ stage: 'idle', held: null, id: 0 });
  if (slot.stage === 'idle' && presentation != null) {
    setSlot({ stage: 'opening', held: presentation, id: slot.id + 1 });
  } else if (slot.stage === 'shown' && presentation == null) {
    setSlot({ ...slot, stage: 'closing' });
  } else if ((slot.stage === 'opening' || slot.stage === 'shown') && presentation != null && presentation !== slot.held) {
    setSlot({ ...slot, held: presentation });
  }

  const onScreen = slot.stage !== 'idle';
  useLayoutEffect(() => { onScreenChange?.(onScreen); }, [onScreen, onScreenChange]);
  useEffect(() => {
    if (slot.stage === 'closing' && Platform.OS !== 'ios') {
      setSlot((current) => current.id === slot.id ? { stage: 'idle', held: null, id: current.id } : current);
      return;
    }
    if (slot.stage !== 'opening' && slot.stage !== 'closing') return;
    const stage = slot.stage;
    const timer = setTimeout(() => {
      setSlot((current) => current.id !== slot.id || current.stage !== stage ? current
        : stage === 'opening' ? { ...current, stage: 'shown' }
          : { stage: 'idle', held: null, id: current.id });
    }, 1000);
    return () => clearTimeout(timer);
  }, [slot.stage, slot.id]);

  if (!onScreen) return null;
  return (
    <Modal key={slot.id} testID={testID} transparent visible={slot.stage !== 'closing'} animationType="fade"
      onRequestClose={slot.held?.onRequestClose}
      onShow={() => setSlot((current) => current.id === slot.id && current.stage === 'opening' ? { ...current, stage: 'shown' } : current)}
      onDismiss={() => setSlot((current) => current.id === slot.id && current.stage === 'closing' ? { stage: 'idle', held: null, id: current.id } : current)}>
      {slot.held?.node}
    </Modal>
  );
}
