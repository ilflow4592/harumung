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

/** 세션 검수 저장: keptIds는 kept+queued, 나머지 pending은 deleted(원본 Blob 제거). 세션은 saved. */
export async function finishSessionReview(sessionId: string, keptIds: string[]): Promise<void> {
  await db.transaction('rw', db.media, db.shootSessions, async () => {
    const pending = (await db.media.where('sessionId').equals(sessionId).toArray()).filter(
      (m) => m.reviewStatus === 'pending',
    );
    const keptSet = new Set(keptIds);
    for (const m of pending) {
      if (keptSet.has(m.id)) {
        await db.media.update(m.id, { reviewStatus: 'kept', uploadStatus: 'queued' });
      } else {
        await db.media.update(m.id, { reviewStatus: 'deleted', blob: null, thumbBlob: null });
      }
    }
    await db.shootSessions.update(sessionId, { status: 'saved', closedAt: now() });
  });
}

export type FolderSummary = {
  perDog: { dog: Dog; count: number; aCut: number }[];
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
  const perDog = dogs.map((dog) => {
    const mine = kept.filter((m) => m.dogIds.includes(dog.id));
    return { dog, count: mine.length, aCut: mine.filter((m) => m.aCutDogIds.includes(dog.id)).length };
  });
  return { perDog, unassigned };
}

export async function listDogKept(dogId: string): Promise<MediaItem[]> {
  const rows = await db.media.where('dogIds').equals(dogId).toArray();
  return rows.filter((m) => m.reviewStatus === 'kept').sort((a, b) => a.takenAt.localeCompare(b.takenAt));
}
