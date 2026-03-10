const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'rescue.db');
const db = new Database(DB_PATH);

console.log('Starting migration to add "denied" status...');

try {
    db.transaction(() => {
        // 1. Create new table without the restrictive CHECK constraint (or with 'denied' added)
        db.exec(`
            CREATE TABLE rescue_requests_new (
                id TEXT PRIMARY KEY,
                citizen_id TEXT REFERENCES users(id),
                lat REAL NOT NULL,
                lng REAL NOT NULL,
                description TEXT,
                photos TEXT,
                severity TEXT CHECK(severity IN ('critical', 'moderate', 'stable')),
                status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'accepted', 'en_route', 'rescued', 'fake_report', 'denied')),
                ai_report TEXT,
                ai_analysis TEXT,
                created_at TEXT DEFAULT (datetime('now')),
                accepted_by TEXT REFERENCES users(id),
                accepted_at TEXT,
                completed_at TEXT
            );
        `);

        // 2. Copy data
        db.exec(`
            INSERT INTO rescue_requests_new 
            (id, citizen_id, lat, lng, description, photos, severity, status, ai_report, ai_analysis, created_at, accepted_by, accepted_at, completed_at)
            SELECT id, citizen_id, lat, lng, description, photos, severity, status, ai_report, ai_analysis, created_at, accepted_by, accepted_at, completed_at 
            FROM rescue_requests;
        `);

        // 3. Drop old table and rename new one
        db.exec("DROP TABLE rescue_requests;");
        db.exec("ALTER TABLE rescue_requests_new RENAME TO rescue_requests;");
    })();
    console.log('Migration successful: "denied" status added to CHECK constraint.');
} catch (err) {
    console.error('Migration failed:', err.message);
} finally {
    db.close();
}
