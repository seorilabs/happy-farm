import { ABSOLUTE_FILL } from './absoluteFill';
import { StyleSheet } from 'react-native';

import {
  MAIN_CONTENT_TOP_PADDING,
  MAIN_HORIZONTAL_PADDING,
  ONBOARDING_MAIN_CONTENT_TOP_PADDING,
  PLOT_GAP,
  SHEET_CONTENT_BASE_PADDING_BOTTOM,
  SHEET_DRAG_HIT_TARGET_HEIGHT,
} from './farmGameLayout';

// FarmGame 컴포넌트의 StyleSheet 정의를 분리한 모듈. 동작/스타일 변경 없이 단일 파일
// LOC를 줄이기 위해 통째로 추출했다. 컴포넌트와 공유하는 레이아웃 치수만 farmGameLayout에서 가져온다.
export const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#f1f8e9',
  },
  viewportPageContent: { flex: 1 },
  scrollablePageContent: { flexGrow: 1 },
  productivityBasis: { marginTop: 3, color: '#6b4a22', fontSize: 11, textAlign: 'right' },
  header: {
    paddingHorizontal: 12,
    paddingBottom: 8,
    backgroundColor: '#f7ecd4',
    borderBottomWidth: 3,
    borderBottomColor: '#d8bd8c',
  },
  // #606 B안 헤더: 재화 칩 줄과 목표 칩 줄.
  hudRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  goldChipPressable: {
    flex: 1,
    minWidth: 0,
  },
  hudChipFallback: {
    borderRadius: 26,
    borderWidth: 2,
    borderColor: '#e0c48a',
    borderBottomWidth: 4,
    borderBottomColor: '#c9a253',
    backgroundColor: '#fffaf0',
  },
  goldChipContent: {
    justifyContent: 'space-between',
    paddingLeft: 8,
    paddingRight: 16,
    paddingBottom: 3,
  },
  goldChipPulse: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    // 금액은 줄이지 않고, 좁으면 시간당 수입 쪽이 말줄임된다.
    flexShrink: 0,
  },
  hudNumber: {
    color: '#5c3a16',
    fontSize: 24,
    fontWeight: '900',
  },
  hudIncome: {
    minWidth: 0,
    marginLeft: 6,
    color: '#3f7d23',
    fontSize: 12,
    fontWeight: '800',
    flexShrink: 1,
  },
  starChip: {
    minWidth: 84,
  },
  starChipContent: {
    gap: 4,
    paddingHorizontal: 12,
    paddingBottom: 3,
  },
  goalRow: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  goalSlot: {
    flex: 1,
    minWidth: 0,
  },
  main: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  farmStage: {
    position: 'relative',
    flex: 1,
    overflow: 'hidden',
  },
  mainContent: {
    paddingHorizontal: MAIN_HORIZONTAL_PADDING,
    paddingTop: MAIN_CONTENT_TOP_PADDING,
    paddingBottom: 16,
  },
  mainContentOnboarding: {
    paddingTop: ONBOARDING_MAIN_CONTENT_TOP_PADDING,
  },
  plotGridContainer: {
    position: 'relative',
  },
  plotGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: PLOT_GAP,
  },
  // Fixed decoration grid below the plot container. It never overlays the plot
  // hit area; empty cells keep saved slot coordinates visually stable.
  decorationGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 6,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(120, 87, 46, 0.25)',
  },
  decorationGridSlot: {
    width: '18%',
    aspectRatio: 1.35,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
  },
  decorationGridSlotFilled: {
    backgroundColor: 'rgba(255, 247, 214, 0.5)',
  },
  decorationGridIcon: {
    fontSize: 26,
  },
  // 소유 동물 스트립(#360): 장식 스트립과 같은 레이어·같은 상단 구분선. 전체가 하나의
  // 탭 타깃(Pressable)이라 아이콘을 여유 있게 배치한다.
  animalStrip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(120, 87, 46, 0.25)',
  },
  animalStripItem: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // 수확 준비(ready) 강조: 은은한 글로우 링.
  animalStripItemReady: {
    borderRadius: 17,
    backgroundColor: 'rgba(94, 179, 92, 0.18)',
  },
  animalStripIcon: {
    fontSize: 26,
  },
  // 수확 준비 뱃지: 아이콘 우상단 초록 점.
  animalStripReadyBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#4caf50',
    borderWidth: 1.5,
    borderColor: '#ffffff',
  },
  harvestPop: {
    position: 'absolute',
    zIndex: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  harvestBurst: {
    ...ABSOLUTE_FILL,
  },
  harvestParticle: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: 8,
    height: 8,
    marginLeft: -4,
    marginTop: -4,
  },
  harvestParticleCoin: {
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#fff1a3',
    backgroundColor: '#f6b91e',
  },
  harvestParticleSpark: {
    width: 7,
    height: 7,
    marginLeft: -3.5,
    marginTop: -3.5,
    borderRadius: 1,
    backgroundColor: '#fff7c2',
  },
  harvestPopText: {
    color: '#f7b733',
    fontSize: 18,
    fontWeight: '900',
    textShadowColor: 'rgba(31, 41, 55, 0.85)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  harvestPopTextSpecial: {
    color: '#ffd23f',
    fontSize: 22,
    textShadowColor: 'rgba(180, 83, 9, 0.95)',
    textShadowRadius: 4,
  },
  harvestPopTextGolden: {
    color: '#fbbf24',
    fontSize: 30,
    textShadowColor: 'rgba(180, 83, 9, 0.95)',
    textShadowRadius: 8,
  },
  harvestPopTextRainbow: {
    color: '#c084fc',
    fontSize: 38,
    textShadowColor: 'rgba(109, 40, 217, 0.95)',
    textShadowRadius: 10,
  },
  harvestPopTextGiant: {
    color: '#fb923c',
    fontSize: 43,
    textShadowColor: 'rgba(154, 52, 18, 0.95)',
    textShadowRadius: 12,
  },
  harvestPopTextPrism: {
    color: '#67e8f9',
    fontSize: 48,
    textShadowColor: 'rgba(91, 33, 182, 0.95)',
    textShadowRadius: 14,
  },
  mutationFlash: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 8,
  },
  discoveryBanner: {
    position: 'absolute',
    // bottom 오프셋은 하단 safe-area 인셋을 반영해 런타임에 적용한다(#236). 시스템
    // 내비/제스처 바와 겹치지 않도록 bottomSafeInset 기반으로 계산.
    left: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: 'rgba(92, 58, 22, 0.96)',
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 14,
    zIndex: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
  discoveryBannerIcon: {
    fontSize: 44,
  },
  discoveryBannerTitle: {
    color: '#c9f29a',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 1,
  },
  discoveryBannerName: {
    color: '#fff6df',
    fontSize: 20,
    fontWeight: '900',
    lineHeight: 24,
  },
  discoveryBannerSubtitle: {
    color: 'rgba(255, 246, 223, 0.78)',
    fontSize: 13,
    fontWeight: '500',
    marginTop: 2,
  },
  toast: {
    position: 'absolute',
    left: 18,
    right: 18,
    zIndex: 20,
    alignItems: 'center',
  },
  toastText: {
    maxWidth: '100%',
    overflow: 'hidden',
    borderRadius: 8,
    backgroundColor: 'rgba(92, 58, 22, 0.96)',
    color: '#fff6df',
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
    textAlign: 'center',
    borderBottomWidth: 3,
    borderBottomColor: '#3e260d',
  },
  plotTile: {
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  lockedPlot: {
    opacity: 0.62,
    borderColor: '#c7d0d9',
    backgroundColor: '#e9eef2',
  },
  lockIcon: {
    fontSize: 25,
    lineHeight: 30,
  },
  emptyPlot: {
    borderWidth: 2,
    borderColor: '#a98249',
    backgroundColor: '#efe2c9',
  },
  emptyPlotAffordance: {
    position: 'relative',
    width: 38,
    height: 28,
    marginBottom: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyPlotSeed: {
    width: 13,
    height: 20,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#795431',
    backgroundColor: '#b98249',
    transform: [{ rotate: '-22deg' }],
  },
  emptyPlotPlusBadge: {
    position: 'absolute',
    top: 0,
    right: 2,
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#fff8e8',
    backgroundColor: '#5f8d3e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyPlotPlusGlyph: {
    color: '#ffffff',
    fontSize: 14,
    lineHeight: 15,
    fontWeight: '900',
  },
  emptyPlotText: {
    color: '#6b5d48',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '900',
  },
  growingPlot: {
    borderColor: '#5e4631',
    backgroundColor: '#7c5e42',
    // A lighter top edge and a thick dark bottom edge read as a tilled soil ridge
    // (furrow), so a growing plot is clearly distinct from the flat tan empty plot
    // even before its crop icon appears.
    borderTopColor: '#8d6c4d',
    borderBottomWidth: 4,
    borderBottomColor: '#4a3526',
  },
  readyPlot: {
    borderColor: '#73b76e',
    backgroundColor: '#dff1df',
  },
  harvestBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: '#e5484d',
  },
  harvestBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '900',
  },
  growthTimer: {
    position: 'absolute',
    top: 5,
    left: 5,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 7,
    backgroundColor: 'rgba(0, 0, 0, 0.42)',
  },
  growthTimerText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '800',
  },
  progressTrack: {
    position: 'absolute',
    left: 8,
    right: 8,
    bottom: 8,
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
    backgroundColor: 'rgba(0, 0, 0, 0.22)',
  },
  progressFill: {
    width: '100%',
    height: '100%',
    backgroundColor: '#76d275',
    transformOrigin: 'left center',
  },
  cropIcon: {
    fontSize: 28,
    lineHeight: 32,
  },
  // 생성 아트 경로: 이모지 글리프(fontSize)와 같은 시각적 크기로 맞춘 정사각 이미지.
  cropImage: {
    width: 30,
    height: 30,
  },
  readyCropIcon: {
    fontSize: 32,
    lineHeight: 36,
  },
  readyCropImage: {
    width: 34,
    height: 34,
  },
  toolStrip: {
    paddingTop: 10,
    paddingBottom: 8,
    paddingHorizontal: 12,
    borderTopWidth: 3,
    borderTopColor: '#d8bd8c',
    backgroundColor: '#f3e6c9',
  },
  // #606 B안 하단: 구역 선택 칩과 일괄 행동 한 줄.
  ctaRow: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  areaPickerChip: {
    position: 'relative',
    flexShrink: 0,
  },
  areaPickerPressable: {
    width: 120,
  },
  areaPickerContent: {
    paddingHorizontal: 12,
    paddingBottom: 4,
  },
  // 정렬 버튼(오른쪽 6pt, 폭 26pt) 자리를 비워 이름 뒤 ▾가 그 아래에 가려지지 않게 한다(1회차 확인).
  areaPickerContentWithSort: {
    paddingLeft: 10,
    paddingRight: 34,
  },
  areaPickerLabel: {
    flexShrink: 1,
    fontSize: 14,
  },
  areaPickerCaret: {
    flexShrink: 0,
    marginLeft: 3,
    fontSize: 12,
  },
  areaSortButton: {
    position: 'absolute',
    top: 10,
    right: 6,
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ead8b0',
  },
  areaSortButtonText: {
    color: '#6b4a22',
    fontSize: 14,
    fontWeight: '900',
  },
  areaPickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 52,
    marginBottom: 8,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#e4d3ae',
    borderBottomWidth: 4,
    borderBottomColor: '#dcc189',
    backgroundColor: '#fffaf0',
  },
  areaPickerRowActive: {
    borderColor: '#9fd36a',
    borderBottomColor: '#4d8a22',
    backgroundColor: '#f4fbe9',
  },
  areaPickerRowLocked: {
    opacity: 0.72,
  },
  areaPickerName: {
    color: '#5c3a16',
    fontSize: 16,
    fontWeight: '900',
  },
  areaPickerNameActive: {
    color: '#2f6f1c',
  },
  areaPickerCount: {
    color: '#8a6a3c',
    fontSize: 13,
    fontWeight: '800',
  },
  batchPrimaryAction: {
    flex: 1,
    minWidth: 0,
  },
  batchSecondaryAction: {
    flexShrink: 1,
    minWidth: 0,
    maxWidth: 150,
  },
  batchIconAction: {
    flexShrink: 0,
  },
  batchIconFrame: {
    width: 58,
  },
  batchSecondaryFallback: {
    borderRadius: 26,
    borderWidth: 2,
    borderColor: '#e0c48a',
    borderBottomWidth: 4,
    borderBottomColor: '#c9a253',
    backgroundColor: '#fffaf0',
  },
  batchActionContent: {
    gap: 6,
    paddingHorizontal: 14,
    paddingBottom: 4,
  },
  // 글자가 오른쪽 끝 곡선(끝 조각 폭 약 29pt)에 닿지 않게 오른쪽을 더 비운다. 왼쪽은 둥근 아이콘이
  // 곡선 안에 들어가도 어색하지 않아 그만큼 줄여 글자 폭을 지킨다(2회차 N8).
  batchActionContentLabeled: {
    gap: 4,
    paddingLeft: 10,
    paddingRight: 20,
  },
  batchActionEmoji: {
    fontSize: 22,
  },
  harvestAllButton: {
    minHeight: 34,
    justifyContent: 'center',
    borderRadius: 999,
    paddingHorizontal: 16,
    backgroundColor: '#68b035',
    shadowColor: '#2c6b1a',
    shadowOpacity: 0.32,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  harvestAllButtonText: {
    // 글자색은 GameText tone(초록 위 흰색, 크림 위 갈색)이 정한다.
    fontSize: 18,
    fontWeight: '900',
  },
  harvestAllButtonTextCompact: {
    fontSize: 14,
  },
  // Upgrade purchase delight (#289): card-local only, so frequent purchases
  // get tactile progress feedback without occupying the full screen.
  upgradeCardHost: {
    position: 'relative',
  },
  // #426: 업그레이드 카드 내부의 배치(일괄) 구매 버튼 행. 카드 밀도를 해치지 않도록
  // 단일 구매 카드 아래에 작게 배치한다(상단 HUD/navRow 무변경).
  upgradeBatchRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  upgradeBatchButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: '#eef4ee',
    borderWidth: 1,
    borderColor: '#cfe0d2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  upgradeBatchButtonDisabled: {
    opacity: 0.4,
  },
  upgradeBatchLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2f8747',
  },
  upgradeBatchSub: {
    fontSize: 11,
    color: '#5f6f63',
    marginTop: 1,
  },
  upgradeBurstOverlay: {
    ...ABSOLUTE_FILL,
    zIndex: 4,
  },
  upgradeBurstCenter: {
    position: 'absolute',
    // ShopCard has a 72px minimum height. A fixed center avoids percentage
    // positioning drift inside the iOS Modal/ScrollView layout.
    top: 36,
    right: 42,
    width: 0,
    height: 0,
  },
  upgradeBurstRing: {
    position: 'absolute',
    left: -29,
    top: -29,
    width: 58,
    height: 58,
    borderRadius: 29,
    borderWidth: 3,
  },
  upgradeBurstRingSpeed: {
    borderColor: '#4da3ff',
  },
  upgradeBurstRingProfit: {
    borderColor: '#f4b942',
  },
  upgradeBurstSpark: {
    position: 'absolute',
    left: -4,
    top: -4,
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  upgradeBurstSparkSpeed: {
    backgroundColor: '#76b9ff',
  },
  upgradeBurstSparkProfit: {
    backgroundColor: '#ffd166',
  },
  upgradeBurstIcon: {
    position: 'absolute',
    left: -16,
    top: -14,
    width: 32,
    height: 28,
    textAlign: 'center',
    fontSize: 24,
    lineHeight: 28,
    fontWeight: '900',
  },
  toolScroll: {
    gap: 10,
    paddingTop: 8,
    paddingBottom: 4,
  },
  // 씨앗 카드(1회차 #8). 시안 B처럼 두꺼운 나무 테두리 카드에 큰 작물 그림과 굵은 이름을 둔다.
  toolButton: {
    width: 84,
    minHeight: 100,
    borderRadius: 16,
    borderWidth: 3,
    borderColor: '#d39a55',
    // overflow:'hidden'이라 그림자가 잘리므로, 두꺼운 아래 테두리로 같은
    // 입체감을 낸다. 상단 버튼들의 오프셋 그림자와 방향을 맞춘다.
    borderBottomWidth: 6,
    borderBottomColor: '#a8692a',
    backgroundColor: '#fff6e2',
    alignItems: 'center',
    justifyContent: 'center',
    // 아이콘/이름/가격 주변 여백 확보 + 작물 이모지가 박스 밖으로 튀어나오지
    // 않도록 클리핑(#237). 배지는 절대 배치라 padding 영향 없이 모서리에 유지.
    paddingHorizontal: 6,
    paddingVertical: 6,
    overflow: 'hidden',
    gap: 2,
  },
  activeToolButton: {
    borderColor: '#6fb43c',
    borderBottomColor: '#4d8a22',
    backgroundColor: '#e9f7d6',
  },
  // toolButton은 그림자 대신 두꺼운 아래 테두리로 입체감을 내므로, 눌림도
  // 테두리를 얇게 만들고 그만큼 내려 높이를 유지한다.
  toolButtonPressed: {
    transform: [{ translateY: 3 }],
    borderBottomWidth: 3,
    marginBottom: 3,
  },
  toolIcon: {
    // lineHeight를 fontSize에 맞춰 명시해 이모지 글리프가 세로로 넘쳐 박스
    // 경계를 침범하지 않도록 한정한다(#237).
    fontSize: 22,
    lineHeight: 26,
    textAlign: 'center',
  },
  toolName: {
    maxWidth: '100%',
    fontSize: 14,
    textAlign: 'center',
  },
  toolCost: {
    color: '#c07a12',
    fontSize: 12,
    fontWeight: '900',
  },
  toolCostRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  toolCostUnaffordable: {
    color: '#b42318',
  },
  toolRoi: {
    color: '#2f8a4a',
    fontSize: 11,
    fontWeight: '900',
  },
  toolMasteryBadge: {
    position: 'absolute',
    top: 3,
    right: 4,
  },
  toolMasteryBadgeText: {
    fontSize: 11,
    lineHeight: 14,
  },
  toolNewBadge: {
    position: 'absolute',
    top: 4,
    left: 4,
    borderRadius: 4,
    backgroundColor: '#16a34a',
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  // 판매 보너스 배지 행(#226): 아이콘/이름/가격/ROI 아래 인라인으로 배치해
  // 상단의 마스터리·NEW 배지(절대 배치)와 겹치지 않게 한다.
  toolBonusBadgeRow: {
    flexDirection: 'row',
    // 배수와 배지 둘이 다 붙어 폭이 모자라면 다음 줄로 넘긴다.
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  toolBonusBadge: {
    borderRadius: 4,
    backgroundColor: '#fff4e5',
    borderWidth: 1,
    borderColor: '#f5a524',
    paddingHorizontal: 3,
    paddingVertical: 1,
  },
  toolBonusBadgeText: {
    color: '#8f5c00',
    fontSize: 8,
    fontWeight: '900',
    lineHeight: 11,
  },
  toolNewBadgeText: {
    color: '#ffffff',
    fontSize: 8,
    fontWeight: '900',
    lineHeight: 11,
    letterSpacing: 0.3,
  },
  lockedNotice: {
    width: 260,
    minHeight: 76,
    justifyContent: 'center',
    gap: 4,
    borderWidth: 2,
    borderColor: '#dcc189',
    borderStyle: 'dashed',
    borderRadius: 14,
    paddingHorizontal: 12,
    backgroundColor: '#fffdf5',
  },
  lockedNoticeTitle: {
    color: '#6b4a22',
    fontSize: 13,
    fontWeight: '900',
  },
  lockedNoticeDesc: {
    color: '#a98a4e',
    fontSize: 11,
    fontWeight: '700',
  },
  // dim은 Modal 루트가 직접 칠한다. 백드롭 전용 absolute View에 opacity를 걸었을
  // 때는 Android Modal 안에서 dim이 전혀 나타나지 않았고, 배경 탭으로 닫히지도
  // 않았다(실기기 재현). 루트 배경은 시트가 뜨는 즉시 확실히 적용된다.
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  // 시트 위 오버레이(토스트, 보상 연출). iOS 실행 화면에서 zIndex가 없는 자식이 시트 뒤로 그려져 보이지
  // 않았다(#606). 시트보다 위에 쌓는다.
  // 출석 보상(1회차 #6). 큰 코인과 받은 금액.
  dailyRewardHero: {
    alignItems: 'center',
    gap: 2,
    paddingVertical: 12,
    marginBottom: 8,
  },
  dailyRewardAmount: {
    color: '#d98a12',
    fontSize: 34,
  },
  dailyRewardStreak: {
    fontSize: 15,
  },
  sheetOverlay: {
    ...ABSOLUTE_FILL,
    zIndex: 30,
    elevation: 30,
  },
  // 시트 딤 루트(#606). 배경색은 FarmGame의 Sheet가 열림 정도에 맞춰 바꾼다.
  sheetDimRoot: {
    flex: 1,
  },
  sheetBackdropFill: {
    flex: 1,
  },
  sheetFixedHeight: {
    height: '86%',
  },
  sheet: {
    maxHeight: '86%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 3,
    borderTopColor: '#d8bd8c',
    paddingTop: 0,
    paddingHorizontal: 20,
    backgroundColor: '#fffdf5',
  },
  sheetDragArea: {
    marginHorizontal: -20,
    height: SHEET_DRAG_HIT_TARGET_HEIGHT,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 10,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#d8bd8c',
  },
  sheetTitleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  sheetTitle: {
    flexShrink: 1,
    maxWidth: '100%',
    color: '#6b4a22',
    fontSize: 21,
    fontWeight: '900',
  },
  sheetGold: {
    flexShrink: 0,
    maxWidth: '100%',
    overflow: 'hidden',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 2,
    borderColor: '#e8c976',
    backgroundColor: '#fff9e8',
    color: '#c07a12',
    fontSize: 15,
    fontWeight: '900',
  },
  sheetDescription: {
    marginTop: 4,
    color: '#a98a4e',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  },
  sheetContent: {
    paddingTop: 14,
    // 기본 하단 여백. 실제 렌더 시 하단 safe-area 인셋을 더해 override 한다(#236).
    paddingBottom: SHEET_CONTENT_BASE_PADDING_BOTTOM,
  },
  sheetSectionTitle: {
    marginTop: 12,
    marginBottom: 8,
    color: '#a98a4e',
    fontSize: 13,
    fontWeight: '900',
  },
  // #372 상점 시트 상단 탭 바. 시트 내부에만 존재하는 뎁스 분리 UI로, 상단 상시
  // HUD/navRow에는 아무것도 추가하지 않는다.
  shopTabBar: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 4,
    padding: 4,
    borderRadius: 14,
    backgroundColor: '#f0e4c4',
  },
  shopTabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    minHeight: 36,
    paddingHorizontal: 8,
    borderRadius: 9,
    backgroundColor: 'transparent',
  },
  shopTabButtonActive: {
    backgroundColor: '#fffdf5',
    borderWidth: 2,
    borderColor: '#7fb844',
  },
  shopTabButtonText: {
    color: '#8a6a34',
    fontSize: 12,
    fontWeight: '800',
  },
  shopTabButtonTextActive: {
    color: '#33660f',
  },
  shopTabBadge: {
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e5484d',
  },
  shopTabBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '900',
  },
  // 지원 로케일이 8개라 한 행에 flex:1로 나누면 칸 폭이 endonym보다 좁아져 글자가
  // 세로로 쪼개졌다("한국어"→"국/어", "English"→"gl/is/h"). 줄바꿈을 허용하고 칩마다
  // 최소 폭을 줘, 언어 수가 늘어도 레이아웃이 깨지지 않게 한다.
  languageOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  languageOption: {
    flexGrow: 1,
    minWidth: 96,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#e4d3ae',
    borderBottomWidth: 4,
    borderBottomColor: '#dcc189',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#fffaf0',
  },
  activeLanguageOption: {
    borderColor: '#4d8a22',
    borderBottomColor: '#3f7a1c',
    backgroundColor: '#eaf6df',
  },
  languageOptionText: {
    color: '#6b4a22',
    fontSize: 14,
    fontWeight: '900',
  },
  activeLanguageOptionText: {
    color: '#3f7a1c',
  },
  researchSummary: {
    marginTop: -2,
    marginBottom: 10,
    color: '#344054',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800',
  },
  resetWarning: {
    marginBottom: 12,
    padding: 12,
    borderRadius: 8,
    color: '#b42318',
    backgroundColor: '#fff1f0',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
  },
  welcomeBackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#f3faf1',
    borderWidth: 1,
    borderColor: '#d6ecd0',
  },
  welcomeBackRowPressed: {
    opacity: 0.72,
  },
  welcomeBackIcon: {
    fontSize: 28,
    marginRight: 14,
  },
  welcomeBackRowText: {
    flex: 1,
  },
  welcomeBackRowLabel: {
    color: '#5b6b58',
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 2,
  },
  welcomeBackRowValue: {
    color: '#1f7a3d',
    fontSize: 20,
    fontWeight: '900',
  },
  welcomeBackRowChevron: {
    marginLeft: 8,
    color: '#5b6b58',
    fontSize: 28,
    fontWeight: '900',
  },
  resetInput: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: '#d0d5dd',
    borderRadius: 8,
    paddingHorizontal: 14,
    color: '#253126',
    backgroundColor: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  // '더보기' 시트 안의 항목 목록(#241): navRow에서 묶어 내린 진입점을 전폭 행으로 쌓는다.
  moreMenu: {
    gap: 8,
  },
  // 성격별 섹션 그룹(#270): 소제목 아래 관련 항목을 모아 스캔 비용을 낮춘다.
  moreMenuSection: {
    gap: 8,
  },
  // 두 번째 섹션부터는 얕은 구분선과 여백으로 위 섹션과 경계를 준다.
  moreMenuSectionDivided: {
    marginTop: 6,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e4e7ec',
  },
  moreMenuSectionTitle: {
    color: '#667085',
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 2,
  },
  moreMenuButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
    borderRadius: 10,
    paddingHorizontal: 14,
    borderWidth: 2,
    borderColor: '#e4d3ae',
    borderBottomWidth: 4,
    borderBottomColor: '#dcc189',
    backgroundColor: '#fffaf0',
  },
  moreMenuButtonText: {
    color: '#6b4a22',
    fontSize: 15,
    fontWeight: '800',
  },
  moreMenuBadge: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    borderRadius: 10,
    backgroundColor: '#e5484d',
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreMenuBadgeText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '900',
  },
  comboOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    // Shift above true center so the combo sits over the plot grid,
    // not the tool strip. paddingBottom lifts the visual center upward.
    paddingBottom: 120,
    zIndex: 9,
  },
  comboDisplay: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 24,
    backgroundColor: 'rgba(92, 58, 22, 0.9)',
  },
  comboDisplayGreat: {
    backgroundColor: 'rgba(154, 52, 18, 0.92)',
  },
  comboDisplayLegendary: {
    backgroundColor: 'rgba(120, 70, 0, 0.95)',
  },
  comboText: {
    color: '#f7b733',
    fontSize: 24,
    fontWeight: '900',
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  comboTextGreat: {
    color: '#ff8c42',
    fontSize: 28,
  },
  comboTextLegendary: {
    color: '#ffd23f',
    fontSize: 32,
  },
  nextGoalBar: {
    // 다음 목표 칩의 스킨 대체 스타일(#606).
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#e8c976',
    borderBottomWidth: 4,
    borderBottomColor: '#c9a253',
    backgroundColor: '#fff9e8',
  },
  // Soft emphasis ring for the larger onboarding targets (the plot grid and the
  // seed strip): a light border plus a faint tint so it reads as a highlight
  // without the heavy outline clashing with the body design.
  onboardingHighlight: {
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#a6dcb8',
    backgroundColor: 'rgba(76, 175, 106, 0.08)',
  },
  // Plot geometry is calculated to fit four exact columns. Keep the onboarding
  // ring out of layout so its border never steals width and wraps column four.
  onboardingPlotTint: {
    borderRadius: 14,
    backgroundColor: 'rgba(76, 175, 106, 0.08)',
  },
  onboardingPlotHighlight: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#a6dcb8',
  },
  // Pulsing overlay ring stacked on the seed strip during the selectSeed step.
  // A louder green than the static highlight; its opacity is animated so it
  // breathes to catch a new player's eye. pointerEvents none keeps taps flowing
  // through to the seed buttons.
  onboardingSeedPulseRing: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#2e9e54',
  },
  // One-shot emphasis ring for the stall/unaffordable nudge (#362): a brighter,
  // thicker gold-green flash layered over the ambient pulse. Its opacity/scale is
  // animated as a single burst. pointerEvents none keeps taps flowing through.
  onboardingSeedNudgeRing: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 14,
    borderWidth: 3,
    borderColor: '#ffb300',
  },
  nextGoalLabel: {
    color: '#6b4a22',
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 5,
  },
  nextGoalReadyText: {
    color: '#2f6f1c',
    fontSize: 13,
    fontWeight: '900',
  },
  nextGoalTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ead8b0',
    overflow: 'hidden',
  },
  nextGoalFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: '#68b035',
  },
  nextGoalBarReady: {
    borderColor: '#9fd36a',
    borderBottomColor: '#4d8a22',
    backgroundColor: '#f4fbe9',
  },
  nextGoalBody: {
    flex: 1,
    minWidth: 0,
  },
  nextGoalInner: {
    justifyContent: 'flex-start',
    gap: 8,
    paddingLeft: 10,
    paddingRight: 10,
    paddingBottom: 3,
  },
  nextGoalGoWrap: {
    position: 'relative',
  },
  nextGoalGoFrame: {
    minWidth: 64,
  },
  nextGoalGo: {
    borderRadius: 18,
    backgroundColor: '#68b035',
    borderBottomWidth: 3,
    borderBottomColor: '#4d8a22',
  },
  nextGoalGoText: {
    fontSize: 15,
  },
  masteryBackdrop: {
    ...ABSOLUTE_FILL,
    backgroundColor: 'rgba(46, 28, 8, 0.6)',
  },
  masteryCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 80,
  },
  masteryCard: {
    width: 268,
    paddingHorizontal: 28,
    paddingVertical: 28,
    borderRadius: 20,
    backgroundColor: '#fff9e8',
    alignItems: 'center',
    gap: 6,
    shadowColor: '#5c3a16',
    shadowOpacity: 0.28,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 10 },
    elevation: 14,
    borderWidth: 3,
    borderColor: '#e8c976',
    borderBottomWidth: 6,
    borderBottomColor: '#c9a253',
  },
  masteryTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: '#a98a4e',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  masteryCropIcon: {
    fontSize: 68,
    lineHeight: 76,
    marginVertical: 2,
  },
  masteryRankBadge: {
    fontSize: 30,
    fontWeight: '900',
  },
  masteryCropName: {
    fontSize: 16,
    fontWeight: '900',
    color: '#6b4a22',
    marginTop: 4,
  },
  prestigeBackdrop: {
    ...ABSOLUTE_FILL,
    backgroundColor: 'rgba(46, 28, 8, 0.68)',
  },
  prestigeCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 80,
  },
  prestigeCard: {
    width: 288,
    paddingHorizontal: 32,
    paddingVertical: 32,
    borderRadius: 24,
    backgroundColor: '#fff9e8',
    alignItems: 'center',
    gap: 6,
    shadowColor: '#5c3a16',
    shadowOpacity: 0.32,
    shadowRadius: 36,
    shadowOffset: { width: 0, height: 14 },
    elevation: 18,
    borderWidth: 3,
    borderColor: '#e8c976',
    borderBottomWidth: 6,
    borderBottomColor: '#c9a253',
  },
  prestigeTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: '#a98a4e',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  prestigeRegionIcon: {
    fontSize: 80,
    lineHeight: 88,
    marginVertical: 4,
  },
  prestigeRegionName: {
    fontSize: 20,
    fontWeight: '900',
    color: '#344054',
  },
  prestigeStarsBadge: {
    fontSize: 34,
    fontWeight: '900',
    color: '#c07a12',
    marginTop: 6,
  },
  notificationPromptBackdrop: {
    // flex:1 (not absoluteFill) so the backdrop fills the Modal host: as a direct
    // Modal child under Fabric, absoluteFillObject collapses to the card height,
    // pinning the card to the top and dimming only that strip.
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    backgroundColor: 'rgba(46, 28, 8, 0.5)',
  },
  notificationPromptCard: {
    width: '100%',
    maxWidth: 320,
    paddingHorizontal: 24,
    paddingVertical: 24,
    borderRadius: 20,
    backgroundColor: '#fff9e8',
    borderWidth: 2,
    borderColor: '#e8c976',
    alignItems: 'center',
    gap: 8,
    shadowColor: '#5c3a16',
    shadowOpacity: 0.22,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
    borderBottomWidth: 6,
    borderBottomColor: '#c9a253',
  },
  notificationPromptIcon: {
    fontSize: 44,
    lineHeight: 52,
  },
  notificationPromptTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: '#6b4a22',
    textAlign: 'center',
  },
  notificationPromptDesc: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8a6a3c',
    lineHeight: 18,
    textAlign: 'center',
  },
  notificationPromptActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
    alignSelf: 'stretch',
  },
  notificationPromptButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notificationPromptDeclineButton: {
    backgroundColor: '#f3e6c9',
  },
  notificationPromptDeclineText: {
    color: '#6b4a22',
    fontSize: 14,
    fontWeight: '800',
  },
  notificationPromptAcceptButton: {
    backgroundColor: '#68b035',
  },
  notificationPromptAcceptText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '900',
  },
  // #367 딥 기능 코치마크: 카드 상단 '새 기능' 에이브로우(아이콘·제목 위 소제목).
  featureCoachmarkEyebrow: {
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.4,
    color: '#c07a12',
    textAlign: 'center',
    textTransform: 'uppercase',
  },
});
