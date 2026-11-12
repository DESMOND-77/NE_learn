import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

/** Adaptateur de persistance. Le domaine ne dépend pas de SQLite. */
export function openDatabase(filename) {
  if (filename !== ':memory:') mkdirSync(dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      name TEXT NOT NULL, password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'student' CHECK(role IN ('student','teacher','admin')),
      academic_level INTEGER NOT NULL DEFAULT 1 CHECK(academic_level BETWEEN 1 AND 4),
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL, created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
    CREATE TABLE IF NOT EXISTS lesson_progress (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      course_id TEXT NOT NULL, lesson_id TEXT NOT NULL, completed_at TEXT NOT NULL,
      PRIMARY KEY(user_id, course_id, lesson_id)
    );
    CREATE TABLE IF NOT EXISTS quiz_attempts (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      quiz_id TEXT NOT NULL, score INTEGER NOT NULL, total INTEGER NOT NULL, percent INTEGER NOT NULL,
      by_topic TEXT NOT NULL, details TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS attempts_user ON quiz_attempts(user_id, created_at);
    CREATE TABLE IF NOT EXISTS lab_progress (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, lab_id TEXT NOT NULL,
      checklist TEXT NOT NULL DEFAULT '[]', completed_at TEXT,
      PRIMARY KEY(user_id, lab_id)
    );
    CREATE TABLE IF NOT EXISTS exams (
      id TEXT PRIMARY KEY, user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      question_ids TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS audit_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, event TEXT NOT NULL,
      ip TEXT, detail TEXT, created_at TEXT NOT NULL
    );
    INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES(1, datetime('now'));
  `);
  return db;
}

export function audit(db, event, { userId = null, ip = null, detail = null } = {}) {
  db.prepare('INSERT INTO audit_events(user_id,event,ip,detail,created_at) VALUES(?,?,?,?,?)')
    .run(userId, event, ip, detail, new Date().toISOString());
}
