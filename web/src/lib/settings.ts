/** 폰에 남는 설정값. 서버가 없으므로 localStorage. */

const PURGE_DAYS_KEY = 'harumung.purgeDays';
const PURGE_LAST_KEY = 'harumung.purgeLastRun';

export const PURGE_OPTIONS = [3, 7, 14, 0] as const; // 0 = 끄기
export const DEFAULT_PURGE_DAYS = 7;

export function getPurgeDays(): number {
  try {
    const v = localStorage.getItem(PURGE_DAYS_KEY);
    return v === null ? DEFAULT_PURGE_DAYS : Number(v);
  } catch {
    return DEFAULT_PURGE_DAYS;
  }
}

export function setPurgeDays(days: number): void {
  try { localStorage.setItem(PURGE_DAYS_KEY, String(days)); } catch { /* 저장 못 해도 기본값으로 동작 */ }
}

/** 하루 한 번만 자동 정리를 돌리기 위한 마지막 실행일. */
export function purgeRanToday(today: string): boolean {
  try { return localStorage.getItem(PURGE_LAST_KEY) === today; } catch { return false; }
}
export function markPurgeRan(today: string): void {
  try { localStorage.setItem(PURGE_LAST_KEY, today); } catch { /* 무시 */ }
}

export function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}
export const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);

/** 브라우저가 저장소를 임의로 비우지 않도록 요청. 크롬은 승인하고, 사파리는 조용히 무시한다. */
export async function requestPersistentStorage(): Promise<boolean | null> {
  try {
    if (!navigator.storage?.persist) return null;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return null;
  }
}
