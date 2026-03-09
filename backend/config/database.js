// =================================================
// DATABASE CONFIGURATION - SQLite (local, no Docker)
// =================================================
const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'rescue.db');
const db = new Database(DB_PATH);

// Enable WAL mode for better concurrency
db.pragma('journal_mode = WAL');

// ---- Create Tables ----
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    role TEXT NOT NULL CHECK(role IN ('citizen', 'rescuer', 'ngo_admin')),
    phone TEXT UNIQUE,
    name TEXT,
    lat REAL,
    lng REAL,
    is_available INTEGER DEFAULT 0,
    last_active TEXT,
    trust_score REAL DEFAULT 1.0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS rescue_requests (
    id TEXT PRIMARY KEY,
    citizen_id TEXT REFERENCES users(id),
    lat REAL NOT NULL,
    lng REAL NOT NULL,
    description TEXT,
    photos TEXT,
    severity TEXT CHECK(severity IN ('critical', 'moderate', 'stable')),
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'accepted', 'en_route', 'rescued', 'fake_report')),
    created_at TEXT DEFAULT (datetime('now')),
    accepted_by TEXT REFERENCES users(id),
    accepted_at TEXT,
    completed_at TEXT
  );

  CREATE TABLE IF NOT EXISTS live_tracking (
    id TEXT PRIMARY KEY,
    request_id TEXT REFERENCES rescue_requests(id),
    rescuer_id TEXT REFERENCES users(id),
    lat REAL,
    lng REAL,
    timestamp TEXT DEFAULT (datetime('now')),
    estimated_arrival INTEGER
  );

  CREATE TABLE IF NOT EXISTS health_passports (
    id TEXT PRIMARY KEY,
    animal_type TEXT,
    rescue_request_id TEXT REFERENCES rescue_requests(id),
    treatment_history TEXT,
    vet_notes TEXT,
    rehab_center TEXT,
    status TEXT CHECK(status IN ('in_treatment', 'recovered', 'transferred')),
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

console.log('[DB] SQLite database ready at', DB_PATH);

// ---- Helper: generate a UUID-like id ----
function generateId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

module.exports = { db, generateId };
