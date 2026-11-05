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
  /** 탭 = 토글. 없으면 추가, 있으면 제거. 여러 마리 합사 사진은 둘 다 켜 두면 된다. */
  toggleDog: (dogId: string) => void;
  /** 토글 없이 지정 목록을 그대로 덮어쓴다 (강아지 메뉴에서 촬영 시작할 때). */
  setSelected: (dogIds: string[]) => void;
  clearSelected: () => void;
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
  toggleDog: (dogId) =>
    set((s) => ({
      selectedDogIds: s.selectedDogIds.includes(dogId)
        ? s.selectedDogIds.filter((id) => id !== dogId)
        : [...s.selectedDogIds, dogId],
    })),
  setSelected: (dogIds) => set({ selectedDogIds: dogIds }),
  clearSelected: () => set({ selectedDogIds: [] }),
  bumpShotCount: () => set((s) => ({ shotCount: s.shotCount + 1 })),
  reset: () => set({ sessionId: null, selectedDogIds: [], shotCount: 0, mode: 'photo' }),
}));
