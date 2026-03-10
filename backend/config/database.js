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

  -- Seed initial dummy users --
  INSERT OR IGNORE INTO users (id, role, name, phone) VALUES 
    ('sys-user-1', 'citizen', 'System Reporter 1', '555-0001'),
    ('sys-user-2', 'citizen', 'System Reporter 2', '555-0002');
`);

// Re-seed requests every restart so images and descriptions are always fresh
try {
  db.prepare("DELETE FROM rescue_requests WHERE id LIKE 'req-seed-%'").run();
  
  const insertReq = db.prepare(`INSERT INTO rescue_requests (id, citizen_id, lat, lng, description, severity, status, photos) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);

  insertReq.run('req-seed-01', 'sys-user-1', 12.9810, 77.6000,
    'URGENT: Stray dog struck by a speeding vehicle near the Main Park South Gate. The animal is conscious but unable to move its hind legs. Bleeding heavily from the right paw. Needs immediate medical transport to prevent further trauma and shock.',
    'critical', 'pending',
    '["https://images.unsplash.com/photo-1596707328574-eeb086eeb1e7?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80"]');

  insertReq.run('req-seed-02', 'sys-user-2', 12.9600, 77.5800,
    'Small kitten trapped approximately 6 feet down in a storm drainage pipe. The meowing has been getting weaker over the last 2 hours. Cannot reach by hand. Requires a rescuer with proper extraction equipment such as tongs or a net pole.',
    'moderate', 'pending',
    '["https://images.unsplash.com/photo-1513245543132-31f507417b26?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80"]');

  insertReq.run('req-seed-03', 'sys-user-1', 12.9750, 77.6100,
    'Pigeon with visibly drooping right wing found sitting on the sidewalk near the bus stop. Unable to fly when approached. Not bleeding, but vulnerable to predators. Needs transport to an avian rehabilitation center.',
    'stable', 'pending',
    '["https://images.unsplash.com/photo-1512916194211-3f2b7f5f7f1a?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80"]');
    
  console.log('[DB] Default rescue requests seeded with images.');
} catch(err) {
  console.error('[DB] Seed error:', err.message);
}

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
