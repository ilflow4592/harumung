import { create } from 'zustand';

type CaptureMode = 'photo' | 'video';

type CaptureState = {
  sessionId: string | null;
  mode: CaptureMode;
  /** 지정된 강아지. 비어 있으면 미지정 모드. 다중 선택이면 여러 개. */
  selectedDogIds: string[];
  shotCount: number;
  setSession: (id: string) => void;
  setMode: (mode: CaptureMode) => void;
  selectDog: (dogId: string) => void;
  /** 토글 없이 지정 목록을 그대로 덮어쓴다 (강아지 메뉴에서 촬영 시작할 때). */
  setSelected: (dogIds: string[]) => void;
  toggleMultiDog: (dogId: string) => void;
  bumpShotCount: () => void;
  reset: () => void;
};

export const useCaptureStore = create<CaptureState>((set) => ({
  sessionId: null,
  mode: 'photo',
  selectedDogIds: [],
  shotCount: 0,
  setSession: (id) => set({ sessionId: id }),
  setMode: (mode) => set({ mode }),
  // 썸네일 1탭: 같은 강아지를 다시 탭하면 해제, 아니면 단일 선택
  selectDog: (dogId) =>
    set((s) => ({
      selectedDogIds: s.selectedDogIds.length === 1 && s.selectedDogIds[0] === dogId ? [] : [dogId],
    })),
  setSelected: (dogIds) => set({ selectedDogIds: dogIds }),
  // 길게 누르기: 다중 선택 토글
  toggleMultiDog: (dogId) =>
    set((s) => ({
      selectedDogIds: s.selectedDogIds.includes(dogId)
        ? s.selectedDogIds.filter((id) => id !== dogId)
        : [...s.selectedDogIds, dogId],
    })),
  bumpShotCount: () => set((s) => ({ shotCount: s.shotCount + 1 })),
  reset: () => set({ sessionId: null, selectedDogIds: [], shotCount: 0, mode: 'photo' }),
}));
