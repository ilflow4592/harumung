import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { ulid } from 'ulid';

import { db } from './client';
import { dogs, guardianContacts, media, mediaDogs, shootSessions, type Dog, type Media } from './schema';

const now = () => new Date().toISOString();

// ---------- 강아지 ----------

export async function listActiveDogs(): Promise<Dog[]> {
  return db.select().from(dogs).where(eq(dogs.active, true)).orderBy(dogs.name);
}

export async function createDog(input: {
  name: string;
  sex: 'MALE' | 'FEMALE';
  thumbnailPath: string | null;
  memo: string | null;
  phones: string[];
}): Promise<string> {
  const id = ulid();
  await db.transaction(async (tx) => {
    await tx.insert(dogs).values({
      id,
      name: input.name,
      sex: input.sex,
      thumbnailPath: input.thumbnailPath,
      memo: input.memo,
      createdAt: now(),
    });
    const phones = input.phones.filter((p) => p.length > 0).slice(0, 2);
    if (phones.length > 0) {
      await tx.insert(guardianContacts).values(
        phones.map((phone, i) => ({ id: ulid(), dogId: id, phone, isPrimary: i === 0 })),
      );
    }
  });
  return id;
}

// ---------- 세션 ----------

export async function getOrCreateOpenSession(): Promise<string> {
  const open = await db
    .select()
    .from(shootSessions)
    .where(eq(shootSessions.status, 'open'))
    .orderBy(desc(shootSessions.startedAt))
    .limit(1);
  if (open.length > 0) return open[0].id;
  const id = ulid();
  await db.insert(shootSessions).values({ id, startedAt: now(), status: 'open' });
  return id;
}

export async function markSessionReviewing(sessionId: string): Promise<void> {
  await db.update(shootSessions).set({ status: 'reviewing' }).where(eq(shootSessions.id, sessionId));
}

// ---------- 미디어 ----------

export async function insertCapturedMedia(input: {
  sessionId: string;
  kind: 'PHOTO' | 'VIDEO';
  localPath: string;
  thumbPath: string | null;
  durationMs: number | null;
  sizeBytes: number | null;
  dogIds: string[];
}): Promise<string> {
  const id = ulid();
  await db.transaction(async (tx) => {
    await tx.insert(media).values({
      id,
      sessionId: input.sessionId,
      kind: input.kind,
      takenAt: now(),
      localPath: input.localPath,
      thumbPath: input.thumbPath,
      durationMs: input.durationMs,
      sizeBytes: input.sizeBytes,
      assignSource: 'MANUAL_SHOT',
      reviewStatus: 'pending',
    });
    if (input.dogIds.length > 0) {
      await tx.insert(mediaDogs).values(input.dogIds.map((dogId) => ({ mediaId: id, dogId })));
    }
  });
  return id;
}

export type SessionMediaRow = Media & { dogIds: string[] };

/** 세션 검수용: 세션의 pending 미디어 전부와 각 미디어의 강아지 id 목록. */
export async function listSessionMedia(sessionId: string): Promise<SessionMediaRow[]> {
  const rows = await db
    .select()
    .from(media)
    .where(and(eq(media.sessionId, sessionId), eq(media.reviewStatus, 'pending')))
    .orderBy(media.takenAt);
  if (rows.length === 0) return [];
  const links = await db
    .select()
    .from(mediaDogs)
    .where(inArray(mediaDogs.mediaId, rows.map((r) => r.id)));
  const byMedia = new Map<string, string[]>();
  for (const l of links) {
    const list = byMedia.get(l.mediaId) ?? [];
    list.push(l.dogId);
    byMedia.set(l.mediaId, list);
  }
  return rows.map((r) => ({ ...r, dogIds: byMedia.get(r.id) ?? [] }));
}

/** 세션 검수 저장: keptIds는 kept+queued, 나머지 pending은 deleted. 세션은 saved. */
export async function finishSessionReview(sessionId: string, keptIds: string[]): Promise<void> {
  await db.transaction(async (tx) => {
    const pending = await tx
      .select({ id: media.id })
      .from(media)
      .where(and(eq(media.sessionId, sessionId), eq(media.reviewStatus, 'pending')));
    const keptSet = new Set(keptIds);
    const deletedIds = pending.map((p) => p.id).filter((id) => !keptSet.has(id));
    if (keptIds.length > 0) {
      await tx
        .update(media)
        .set({ reviewStatus: 'kept', uploadStatus: 'queued' })
        .where(inArray(media.id, keptIds));
    }
    if (deletedIds.length > 0) {
      await tx.update(media).set({ reviewStatus: 'deleted' }).where(inArray(media.id, deletedIds));
    }
    await tx
      .update(shootSessions)
      .set({ status: 'saved', closedAt: now() })
      .where(eq(shootSessions.id, sessionId));
  });
}

/** 오늘 폴더 목록: 강아지별 kept 개수 + 미지정 개수. */
export async function listTodayFolders(dateIso: string): Promise<{
  perDog: { dog: Dog; count: number; aCut: number }[];
  unassigned: number;
}> {
  const dayPrefix = dateIso.slice(0, 10);
  const kept = await db
    .select()
    .from(media)
    .where(and(eq(media.reviewStatus, 'kept'), eq(media.hidden, false)));
  const todays = kept.filter((m) => m.takenAt.startsWith(dayPrefix));
  const ids = todays.map((m) => m.id);
  const links = ids.length > 0 ? await db.select().from(mediaDogs).where(inArray(mediaDogs.mediaId, ids)) : [];
  const linked = new Set(links.map((l) => l.mediaId));
  const unassigned = todays.filter((m) => !linked.has(m.id)).length;
  const allDogs = await listActiveDogs();
  const perDog = allDogs.map((dog) => {
    const mine = links.filter((l) => l.dogId === dog.id);
    return { dog, count: mine.length, aCut: mine.filter((l) => l.aCut).length };
  });
  return { perDog, unassigned };
}

export async function listUnassignedKept(): Promise<Media[]> {
  const rows = await db
    .select({ m: media, link: mediaDogs.mediaId })
    .from(media)
    .leftJoin(mediaDogs, eq(mediaDogs.mediaId, media.id))
    .where(and(eq(media.reviewStatus, 'kept'), isNull(mediaDogs.mediaId)));
  return rows.map((r) => r.m);
}
