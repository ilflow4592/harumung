import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseSync } from 'expo-sqlite';

import * as schema from './schema';

const sqlite = openDatabaseSync('harumung.db', { enableChangeListener: true });
sqlite.execSync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

export const db = drizzle(sqlite, { schema });

/**
 * MVP 단계의 스키마 생성. drizzle-kit 마이그레이션은 서버 스키마가 안정된 뒤 붙인다.
 * 테이블이 이미 있으면 아무것도 하지 않는다.
 */
export function ensureSchema(): void {
  sqlite.execSync(`
    CREATE TABLE IF NOT EXISTS dogs (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, sex TEXT NOT NULL,
      thumbnail_path TEXT, memo TEXT, active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL, synced_at TEXT
    );
    CREATE TABLE IF NOT EXISTS guardian_contacts (
      id TEXT PRIMARY KEY,
      dog_id TEXT NOT NULL REFERENCES dogs(id) ON DELETE CASCADE,
      phone TEXT NOT NULL, is_primary INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS shoot_sessions (
      id TEXT PRIMARY KEY, started_at TEXT NOT NULL, closed_at TEXT,
      status TEXT NOT NULL DEFAULT 'open'
    );
    CREATE TABLE IF NOT EXISTS media (
      id TEXT PRIMARY KEY, session_id TEXT REFERENCES shoot_sessions(id),
      kind TEXT NOT NULL, taken_at TEXT NOT NULL, local_path TEXT NOT NULL, thumb_path TEXT,
      duration_ms INTEGER, size_bytes INTEGER, edited_from_id TEXT,
      hidden INTEGER NOT NULL DEFAULT 0, assign_source TEXT NOT NULL,
      review_status TEXT NOT NULL DEFAULT 'pending',
      upload_status TEXT NOT NULL DEFAULT 'none', upload_attempts INTEGER NOT NULL DEFAULT 0,
      remote_id TEXT
    );
    CREATE INDEX IF NOT EXISTS ix_media_session ON media(session_id);
    CREATE INDEX IF NOT EXISTS ix_media_taken ON media(taken_at);
    CREATE TABLE IF NOT EXISTS media_dogs (
      media_id TEXT NOT NULL REFERENCES media(id) ON DELETE CASCADE,
      dog_id TEXT NOT NULL REFERENCES dogs(id) ON DELETE CASCADE,
      a_cut INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (media_id, dog_id)
    );
    CREATE INDEX IF NOT EXISTS ix_media_dogs_dog ON media_dogs(dog_id);
  `);
}
