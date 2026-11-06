import { ulid } from 'ulid';

import { db, type Dog, type GuardianContact, type MediaItem, type MediaKind, type Sex } from './db';

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

export async function getDog(id: string): Promise<(Dog & { phones: string[] }) | null> {
  const dog = await db.dogs.get(id);
  if (!dog) return null;
  const contacts = await db.guardianContacts.where('dogId').equals(id).toArray();
  const phones = contacts.sort((a, b) => b.isPrimary - a.isPrimary).map((c) => c.phone);
  return { ...dog, phones };
}

export async function updateDog(id: string, input: {
  name: string;
  sex: Sex;
  thumbBlob: Blob | null;
  memo: string | null;
  phones: string[];
}): Promise<void> {
  await db.transaction('rw', db.dogs, db.guardianContacts, async () => {
    await db.dogs.update(id, { name: input.name, sex: input.sex, thumbBlob: input.thumbBlob, memo: input.memo });
    await db.guardianContacts.where('dogId').equals(id).delete();
    const phones = input.phones.filter((p) => p.length > 0).slice(0, 2);
    await db.guardianContacts.bulkAdd(phones.map((phone, i) => ({ id: ulid(), dogId: id, phone, isPrimary: i === 0 ? 1 : 0 })));
  });
}

/** 퇴원: 목록·카메라에서 숨긴다. 사진은 그대로 남는다. */
export async function setDogActive(id: string, active: boolean): Promise<void> {
  await db.dogs.update(id, { active: active ? 1 : 0 });
}

export async function listInactiveDogs(): Promise<Dog[]> {
  const rows = await db.dogs.where('active').equals(0).toArray();
  return rows.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
}

/** 완전 삭제. 사진이 한 장도 없을 때만 허용. 있으면 false. */
export async function deleteDogIfEmpty(id: string): Promise<boolean> {
  const count = await db.media.where('dogIds').equals(id).count();
  if (count > 0) return false;
  await db.transaction('rw', db.dogs, db.guardianContacts, db.attendance, db.folderReviews, db.sendLogs, async () => {
    await db.guardianContacts.where('dogId').equals(id).delete();
    await db.attendance.where('dogId').equals(id).delete();
    await db.folderReviews.where('dogId').equals(id).delete();
    await db.sendLogs.where('dogId').equals(id).delete();
    await db.dogs.delete(id);
  });
  return true;
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

// ---------- 발송 ----------

export async function listSentDogIds(date: string): Promise<string[]> {
  const rows = await db.sendLogs.where('date').equals(date).toArray();
  return rows.map((r) => r.dogId);
}

export async function markSent(date: string, dogId: string, mediaCount: number): Promise<void> {
  await db.transaction('rw', db.sendLogs, async () => {
    await db.sendLogs.where('[date+dogId]').equals([date, dogId]).delete();
    await db.sendLogs.add({ id: ulid(), date, dogId, sentAt: now(), mediaCount });
  });
}

export async function listContacts(dogId: string): Promise<GuardianContact[]> {
  return db.guardianContacts.where('dogId').equals(dogId).toArray();
}

/** 강아지의 오늘(로컬 날짜) 저장 사진·영상. 발송 묶음. */
export async function listDogKeptOn(dogId: string, date: string): Promise<MediaItem[]> {
  const all = await listDogKept(dogId);
  return all.filter((m) => localDate(new Date(m.takenAt)) === date);
}

export async function saveCompressedVideo(id: string, blob: Blob): Promise<void> {
  await db.media.update(id, { compressedBlob: blob });
}

// ---------- 저장공간 ----------

export type StorageStats = {
  photoBytes: number; photoCount: number;
  videoBytes: number; videoCount: number;
  compressedBytes: number;
  thumbBytes: number;
  purgedCount: number;
  trashCount: number;
  totalBytes: number;
  quotaBytes: number | null;
  usageBytes: number | null;
};

export async function storageStats(): Promise<StorageStats> {
  const rows = await db.media.toArray();
  const st: StorageStats = { photoBytes: 0, photoCount: 0, videoBytes: 0, videoCount: 0, compressedBytes: 0, thumbBytes: 0, purgedCount: 0, trashCount: 0, totalBytes: 0, quotaBytes: null, usageBytes: null };
  for (const m of rows) {
    if (m.reviewStatus === 'deleted') { st.trashCount++; continue; }
    if (m.purgedAt) st.purgedCount++;
    const size = m.blob?.size ?? 0;
    if (m.kind === 'PHOTO') { st.photoBytes += size; if (size) st.photoCount++; }
    else { st.videoBytes += size; if (size) st.videoCount++; }
    st.compressedBytes += m.compressedBlob?.size ?? 0;
    st.thumbBytes += m.thumbBlob?.size ?? 0;
  }
  st.totalBytes = st.photoBytes + st.videoBytes + st.compressedBytes + st.thumbBytes;
  try {
    const est = await navigator.storage?.estimate?.();
    st.quotaBytes = est?.quota ?? null;
    st.usageBytes = est?.usage ?? null;
  } catch { /* 미지원 */ }
  return st;
}

/** 보낸 지 days일 넘은 사진·영상의 원본 후보. 모든 지정 강아지에게 그 날짜 발송 기록이 있어야 한다. 미지정·미발송은 제외. */
export async function listPurgeCandidates(days: number): Promise<MediaItem[]> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const kept = await db.media.where('reviewStatus').equals('kept').toArray();
  const logs = await db.sendLogs.toArray();
  const sentKeys = new Set(logs.map((l) => `${l.date}|${l.dogId}`));
  return kept.filter((m) => {
    if (m.purgedAt || (!m.blob && !m.compressedBlob)) return false;
    if (m.dogIds.length === 0) return false;
    const date = localDate(new Date(m.takenAt));
    if (!m.dogIds.every((d) => sentKeys.has(`${date}|${d}`))) return false;
    // 보낸 날짜 기준이 아니라 촬영 날짜 기준. 보낸 날은 촬영 당일이 대부분.
    return new Date(m.takenAt) < cutoff;
  });
}

/** 원본·변환본을 지우고 썸네일만 남긴다. 되돌릴 수 없다. */
export async function purgeOriginals(ids: string[]): Promise<number> {
  let freed = 0;
  await db.transaction('rw', db.media, async () => {
    for (const id of ids) {
      const m = await db.media.get(id);
      if (!m) continue;
      freed += (m.blob?.size ?? 0) + (m.compressedBlob?.size ?? 0);
      await db.media.update(id, { blob: null, compressedBlob: null, purgedAt: now() });
    }
  });
  return freed;
}

/** 삭제 처리된 레코드(원본은 이미 비움)와 닫힌 세션을 완전히 지운다. */
export async function emptyTrash(): Promise<number> {
  const ids = (await db.media.where('reviewStatus').equals('deleted').primaryKeys()) as string[];
  await db.media.bulkDelete(ids);
  return ids.length;
}

/** 전체 초기화. 테스트 기기용. */
export async function wipeAll(): Promise<void> {
  await db.transaction('rw', db.tables, async () => {
    for (const t of db.tables) await t.clear();
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
  perDog: { dog: Dog; count: number; aCut: number; reviewed: boolean; sent: boolean }[];
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
  const sent = new Set(await listSentDogIds(localDate()));
  const perDog = dogs.map((dog) => {
    const mine = kept.filter((m) => m.dogIds.includes(dog.id));
    return { dog, count: mine.length, aCut: mine.filter((m) => m.aCutDogIds.includes(dog.id)).length, reviewed: reviewed.has(dog.id), sent: sent.has(dog.id) };
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
