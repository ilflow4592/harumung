import { listPurgeCandidates, localDate, purgeOriginals } from '../db/repo';
import { getPurgeDays, markPurgeRan, purgeRanToday } from './settings';

/** 앱을 열 때 하루 한 번. 보낸 지 N일 지난 원본을 지운다. 끄기(0)면 아무것도 안 한다. */
export async function runAutoPurge(): Promise<{ count: number; freed: number } | null> {
  const days = getPurgeDays();
  const today = localDate();
  if (days <= 0 || purgeRanToday(today)) return null;
  const candidates = await listPurgeCandidates(days);
  const freed = candidates.length > 0 ? await purgeOriginals(candidates.map((m) => m.id)) : 0;
  markPurgeRan(today);
  return { count: candidates.length, freed };
}
