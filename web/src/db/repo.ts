import { ulid } from 'ulid';

import { db, type Dog, type MediaItem, type MediaKind, type Sex } from './db';

const now = () => new Date().toISOString();

/** 기기 로컬 날짜 YYYY-MM-DD. 등원 체크 키로 쓴다. */
export function localDate(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// ---------- 강아지 ----------

export async function listActiveDogs(): Promise<Dog[]> {
  const rows = await db.dogs.where('active').equals(1).toArray();
  return rows.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
}

export async function createDog(input: {
  name: string;
  sex: Sex;
  thumbBlob: Blob | null;
  memo: string | null;
  phones: string[];
}): Promise<string> {
  const id = ulid();
  await db.transaction('rw', db.dogs, db.guardianContacts, async () => {
    await db.dogs.add({
      id,
      name: input.name,
      sex: input.sex,
      thumbBlob: input.thumbBlob,
      memo: input.memo,
      active: 1,
      createdAt: now(),
    });
    const phones = input.phones.filter((p) => p.length > 0).slice(0, 2);
    await db.guardianContacts.bulkAdd(
      phones.map((phone, i) => ({ id: ulid(), dogId: id, phone, isPrimary: i === 0 ? 1 : 0 })),
    );
  });
  return id;
}

// ---------- 등원 체크 ----------

export async function listAttendedDogIds(date: string): Promise<string[]> {
  const rows = await db.attendance.where('date').equals(date).toArray();
  return rows.map((r) => r.dogId);
}

/** 탭 한 번에 켜고 끈다. 저장 버튼 없이 즉시 반영. */
export async function toggleAttendance(date: string, dogId: string): Promise<boolean> {
  const existing = await db.attendance.where('[date+dogId]').equals([date, dogId]).first();
  if (existing) {
    await db.attendance.delete(existing.id);
    return false;
  }
  await db.attendance.add({ id: ulid(), date, dogId, checkedAt: now() });
  return true;
}

export async function setAttendance(date: string, dogIds: string[]): Promise<void> {
  await db.transaction('rw', db.attendance, async () => {
    await db.attendance.where('date').equals(date).delete();
    await db.attendance.bulkAdd(dogIds.map((dogId) => ({ id: ulid(), date, dogId, checkedAt: now() })));
  });
}

// ---------- 폴더 검수 완료 ----------

export async function listReviewedDogIds(date: string): Promise<string[]> {
  const rows = await db.folderReviews.where('date').equals(date).toArray();
  return rows.map((r) => r.dogId);
}

export async function setFolderReviewed(date: string, dogId: string, reviewed: boolean): Promise<void> {
  await db.transaction('rw', db.folderReviews, async () => {
    await db.folderReviews.where('[date+dogId]').equals([date, dogId]).delete();
    if (reviewed) await db.folderReviews.add({ id: ulid(), date, dogId, reviewedAt: now() });
  });
}

/** 사진이 새로 들어온 강아지는 오늘 검수 완료를 푼다. 저장·배정 경로에서 호출. */
async function clearFolderReviewed(dogIds: string[]): Promise<void> {
  if (dogIds.length === 0) return;
  const date = localDate();
  for (const dogId of new Set(dogIds)) await db.folderReviews.where('[date+dogId]').equals([date, dogId]).delete();
}

// ---------- 세션 ----------

export async function getOrCreateOpenSession(): Promise<string> {
  const open = await db.shootSessions.where('status').equals('open').reverse().sortBy('startedAt');
  if (open.length > 0) return open[0].id;
  const id = ulid();
  await db.shootSessions.add({ id, startedAt: now(), closedAt: null, status: 'open' });
  return id;
}

export async function markSessionReviewing(sessionId: string): Promise<void> {
  await db.shootSessions.update(sessionId, { status: 'reviewing' });
}

// ---------- 미디어 ----------

export async function insertCapturedMedia(input: {
  sessionId: string;
  kind: MediaKind;
  blob: Blob;
  thumbBlob: Blob | null;
  mimeType: string;
  durationMs: number | null;
  dogIds: string[];
}): Promise<string> {
  const id = ulid();
  await db.media.add({
    id,
    sessionId: input.sessionId,
    kind: input.kind,
    takenAt: now(),
    blob: input.blob,
    thumbBlob: input.thumbBlob,
    mimeType: input.mimeType,
    durationMs: input.durationMs,
    sizeBytes: input.blob.size,
    dogIds: input.dogIds,
    aCutDogIds: [],
    reviewStatus: 'pending',
    uploadStatus: 'none',
    uploadAttempts: 0,
    remoteId: null,
  });
  return id;
}

/** 세션 검수용: 세션의 pending 미디어 전부 (촬영 순). */
export async function listSessionMedia(sessionId: string): Promise<MediaItem[]> {
  const rows = await db.media.where('sessionId').equals(sessionId).toArray();
  return rows.filter((m) => m.reviewStatus === 'pending').sort((a, b) => a.takenAt.localeCompare(b.takenAt));
}

/**
 * 세션 검수 저장: keptIds는 kept+queued, 나머지 pending은 deleted(원본 Blob 제거). 세션은 saved.
 * dogIdsById가 있으면 저장 직전에 강아지 배정을 덮어쓴다(검수 화면의 일괄 배정).
 */
export async function finishSessionReview(
  sessionId: string,
  keptIds: string[],
  dogIdsById: Record<string, string[]> = {},
): Promise<void> {
  await db.transaction('rw', db.media, db.shootSessions, db.folderReviews, async () => {
    const pending = (await db.media.where('sessionId').equals(sessionId).toArray()).filter(
      (m) => m.reviewStatus === 'pending',
    );
    const keptSet = new Set(keptIds);
    const touched: string[] = [];
    for (const m of pending) {
      if (keptSet.has(m.id)) {
        const dogIds = dogIdsById[m.id];
        await db.media.update(m.id, dogIds ? { reviewStatus: 'kept', uploadStatus: 'queued', dogIds } : { reviewStatus: 'kept', uploadStatus: 'queued' });
        touched.push(...(dogIds ?? m.dogIds));
      } else {
        await db.media.update(m.id, { reviewStatus: 'deleted', blob: null, thumbBlob: null });
      }
    }
    await db.shootSessions.update(sessionId, { status: 'saved', closedAt: now() });
    await clearFolderReviewed(touched);
  });
}

export type FolderSummary = {
  perDog: { dog: Dog; count: number; aCut: number; reviewed: boolean }[];
  unassigned: number;
};

/** 오늘 폴더 목록: 강아지별 kept 개수 + 미지정 개수. */
export async function listTodayFolders(dateIso: string): Promise<FolderSummary> {
  const dayPrefix = dateIso.slice(0, 10);
  const kept = (await db.media.where('reviewStatus').equals('kept').toArray()).filter((m) =>
    m.takenAt.startsWith(dayPrefix),
  );
  const unassigned = kept.filter((m) => m.dogIds.length === 0).length;
  const dogs = await listActiveDogs();
  const reviewed = new Set(await listReviewedDogIds(localDate()));
  const perDog = dogs.map((dog) => {
    const mine = kept.filter((m) => m.dogIds.includes(dog.id));
    return { dog, count: mine.length, aCut: mine.filter((m) => m.aCutDogIds.includes(dog.id)).length, reviewed: reviewed.has(dog.id) };
  });
  return { perDog, unassigned };
}

/** 미지정 폴더: 강아지 없이 저장된 사진 전부 (최근 순). */
export async function listUnassignedKept(): Promise<MediaItem[]> {
  const rows = await db.media.where('reviewStatus').equals('kept').toArray();
  return rows.filter((m) => m.dogIds.length === 0).sort((a, b) => b.takenAt.localeCompare(a.takenAt));
}

/** 폴더 검수: 선택 사진들에 강아지들을 붙인다 (이미 있으면 그대로). 합사 사진은 여러 마리. */
export async function addDogsToMedia(ids: string[], dogIds: string[]): Promise<void> {
  await db.transaction('rw', db.media, db.folderReviews, async () => {
    for (const id of ids) {
      const m = await db.media.get(id);
      if (!m) continue;
      const merged = [...m.dogIds, ...dogIds.filter((d) => !m.dogIds.includes(d))];
      if (merged.length !== m.dogIds.length) await db.media.update(id, { dogIds: merged });
    }
    await clearFolderReviewed(dogIds);
  });
}

/** 폴더 검수: 선택 사진들에서 강아지를 뗀다. 아무도 안 남으면 미지정이 된다. */
export async function removeDogFromMedia(ids: string[], dogId: string): Promise<void> {
  await db.transaction('rw', db.media, async () => {
    for (const id of ids) {
      const m = await db.media.get(id);
      if (m) await db.media.update(id, { dogIds: m.dogIds.filter((d) => d !== dogId), aCutDogIds: m.aCutDogIds.filter((d) => d !== dogId) });
    }
  });
}

/** 저장된 사진 삭제. 원본·썸네일 Blob을 비운다. */
export async function deleteMedia(ids: string[]): Promise<void> {
  await db.transaction('rw', db.media, async () => {
    for (const id of ids) await db.media.update(id, { reviewStatus: 'deleted', blob: null, thumbBlob: null });
  });
}

export async function listDogKept(dogId: string): Promise<MediaItem[]> {
  const rows = await db.media.where('dogIds').equals(dogId).toArray();
  return rows.filter((m) => m.reviewStatus === 'kept').sort((a, b) => a.takenAt.localeCompare(b.takenAt));
}
