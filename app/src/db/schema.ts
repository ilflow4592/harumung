import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/** 로컬 DB 스키마. 서버 DDL(dev-spec 5장)과 이름을 맞춘다. 시간은 ISO 8601 UTC 문자열. */

export const dogs = sqliteTable('dogs', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  sex: text('sex', { enum: ['MALE', 'FEMALE'] }).notNull(),
  thumbnailPath: text('thumbnail_path'),
  memo: text('memo'),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  createdAt: text('created_at').notNull(),
  syncedAt: text('synced_at'),
});

export const guardianContacts = sqliteTable('guardian_contacts', {
  id: text('id').primaryKey(),
  dogId: text('dog_id').notNull().references(() => dogs.id, { onDelete: 'cascade' }),
  phone: text('phone').notNull(),
  isPrimary: integer('is_primary', { mode: 'boolean' }).notNull().default(false),
});

export const shootSessions = sqliteTable('shoot_sessions', {
  id: text('id').primaryKey(),
  startedAt: text('started_at').notNull(),
  closedAt: text('closed_at'),
  status: text('status', { enum: ['open', 'reviewing', 'saved'] }).notNull().default('open'),
});

export const media = sqliteTable(
  'media',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id').references(() => shootSessions.id),
    kind: text('kind', { enum: ['PHOTO', 'VIDEO'] }).notNull(),
    takenAt: text('taken_at').notNull(),
    localPath: text('local_path').notNull(),
    thumbPath: text('thumb_path'),
    durationMs: integer('duration_ms'),
    sizeBytes: integer('size_bytes'),
    editedFromId: text('edited_from_id'),
    hidden: integer('hidden', { mode: 'boolean' }).notNull().default(false),
    assignSource: text('assign_source', { enum: ['MANUAL_SHOT', 'MANUAL_REVIEW', 'AUTO'] }).notNull(),
    reviewStatus: text('review_status', { enum: ['pending', 'kept', 'deleted'] }).notNull().default('pending'),
    uploadStatus: text('upload_status', { enum: ['none', 'queued', 'uploading', 'done', 'failed'] })
      .notNull()
      .default('none'),
    uploadAttempts: integer('upload_attempts').notNull().default(0),
    remoteId: text('remote_id'),
  },
  (t) => [index('ix_media_session').on(t.sessionId), index('ix_media_taken').on(t.takenAt)],
);

/** 미디어 ↔ 강아지. 행이 없으면 미지정. 다중 선택 촬영은 행 여러 개. */
export const mediaDogs = sqliteTable(
  'media_dogs',
  {
    mediaId: text('media_id').notNull().references(() => media.id, { onDelete: 'cascade' }),
    dogId: text('dog_id').notNull().references(() => dogs.id, { onDelete: 'cascade' }),
    aCut: integer('a_cut', { mode: 'boolean' }).notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.mediaId, t.dogId] }), index('ix_media_dogs_dog').on(t.dogId)],
);

export type Dog = typeof dogs.$inferSelect;
export type NewDog = typeof dogs.$inferInsert;
export type Media = typeof media.$inferSelect;
export type NewMedia = typeof media.$inferInsert;
export type ShootSession = typeof shootSessions.$inferSelect;
