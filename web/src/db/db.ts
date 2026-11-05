import Dexie, { type EntityTable } from 'dexie';

/** 로컬 DB. 서버 DDL(dev-spec 5장)과 이름을 맞춘다. 시간은 ISO 8601 UTC 문자열. */

export type Sex = 'MALE' | 'FEMALE';
export type MediaKind = 'PHOTO' | 'VIDEO';
export type ReviewStatus = 'pending' | 'kept' | 'deleted';
export type UploadStatus = 'none' | 'queued' | 'uploading' | 'done' | 'failed';

export interface Dog {
  id: string;
  name: string;
  sex: Sex;
  thumbBlob: Blob | null;
  memo: string | null;
  active: 0 | 1;
  createdAt: string;
}

export interface GuardianContact {
  id: string;
  dogId: string;
  phone: string;
  isPrimary: 0 | 1;
}

/** 오늘 등원 체크. date는 기기 로컬 날짜 YYYY-MM-DD. */
export interface Attendance {
  id: string;
  date: string;
  dogId: string;
  checkedAt: string;
}

export interface ShootSession {
  id: string;
  startedAt: string;
  closedAt: string | null;
  status: 'open' | 'reviewing' | 'saved';
}

export interface MediaItem {
  id: string;
  sessionId: string | null;
  kind: MediaKind;
  takenAt: string;
  /** 촬영 원본. 서버 confirm 뒤 null로 비운다. */
  blob: Blob | null;
  thumbBlob: Blob | null;
  mimeType: string;
  durationMs: number | null;
  sizeBytes: number | null;
  /** 다중 선택 촬영은 여러 개. 비어 있으면 미지정. */
  dogIds: string[];
  aCutDogIds: string[];
  reviewStatus: ReviewStatus;
  uploadStatus: UploadStatus;
  uploadAttempts: number;
  remoteId: string | null;
}

class HarumungDB extends Dexie {
  dogs!: EntityTable<Dog, 'id'>;
  guardianContacts!: EntityTable<GuardianContact, 'id'>;
  shootSessions!: EntityTable<ShootSession, 'id'>;
  media!: EntityTable<MediaItem, 'id'>;
  attendance!: EntityTable<Attendance, 'id'>;

  constructor() {
    super('harumung');
    this.version(1).stores({
      dogs: 'id, name, active',
      guardianContacts: 'id, dogId',
      shootSessions: 'id, status, startedAt',
      // *dogIds: 다중 항목 인덱스 (강아지별 폴더 조회)
      media: 'id, sessionId, takenAt, reviewStatus, uploadStatus, *dogIds',
    });
    this.version(2).stores({
      attendance: 'id, date, dogId, [date+dogId]',
    });
  }
}

export const db = new HarumungDB();
