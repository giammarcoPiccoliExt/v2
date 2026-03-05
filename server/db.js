const db = new sqlite3.Database(DB_PATH);
 
 
 // Tabella notifiche persistenti (booking e assicurazione)
  db.run(
    `CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL, -- 'booking' | 'insurance'
      payload TEXT NOT NULL, -- JSON.stringify(obj)
      created_at TEXT NOT NULL,
      dismissed INTEGER DEFAULT 0
    )`
  );
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'app.db');

function ensureDbDir() {
  const fs = require('fs');
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

ensureDbDir();


db.serialize(() => {

  db.run(
    `CREATE TABLE IF NOT EXISTS cars (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      modello TEXT NOT NULL,
      descrizione TEXT,
      color TEXT,
      size TEXT,
      price_per_day REAL,
      plate TEXT,
      insurance_expiry_iso TEXT
    )`
  );

  // prevent creating duplicate cars by plate only
  db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_cars_plate ON cars(plate)`);
  // Rimuovi eventuale indice unico su modello se esiste (migrazione)
  db.run(`DROP INDEX IF EXISTS idx_cars_modello`);

  // ensure modello and descrizione columns exist for older DBs
  db.all("PRAGMA table_info(cars)", [], (err, crow) => {
    if (err || !crow) return;
    const ccols = crow.map(r => r.name);
    if (!ccols.includes('modello')) db.run("ALTER TABLE cars ADD COLUMN modello TEXT");
    if (!ccols.includes('descrizione')) db.run("ALTER TABLE cars ADD COLUMN descrizione TEXT");
    if (!ccols.includes('insurance_expiry_iso')) db.run("ALTER TABLE cars ADD COLUMN insurance_expiry_iso TEXT");
  });

  // ensure insurance_expiry_iso column exists for older DBs
  db.all("PRAGMA table_info(cars)", [], (err, crow) => {
    if (err || !crow) return;
    const ccols = crow.map(r => r.name);
    if (!ccols.includes('insurance_expiry_iso')) db.run("ALTER TABLE cars ADD COLUMN insurance_expiry_iso TEXT");
  });

  db.run(
    `CREATE TABLE IF NOT EXISTS bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      car_id INTEGER NOT NULL,
      start_iso TEXT NOT NULL,
      end_iso TEXT NOT NULL,
      title TEXT,
      client_name TEXT,
      creator_name TEXT,
      description TEXT,
      FOREIGN KEY(car_id) REFERENCES cars(id)
    )`
  );

  // archived bookings (deleted) - store for history
  db.run(
    `CREATE TABLE IF NOT EXISTS bookings_archive (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      original_id INTEGER,
      car_id INTEGER NOT NULL,
      start_iso TEXT NOT NULL,
      end_iso TEXT NOT NULL,
      title TEXT,
      client_name TEXT,
      creator_name TEXT,
      description TEXT,
      deleted_by TEXT,
      deleted_at TEXT,
      FOREIGN KEY(car_id) REFERENCES cars(id)
    )`
  );

  // Ensure columns exist for older DBs
  db.all("PRAGMA table_info(bookings)", [], (err, rows) => {
    if (err || !rows) return;
    const cols = rows.map(r => r.name);
    if (!cols.includes('client_name')) db.run("ALTER TABLE bookings ADD COLUMN client_name TEXT");
    if (!cols.includes('creator_name')) db.run("ALTER TABLE bookings ADD COLUMN creator_name TEXT");
    if (!cols.includes('description')) db.run("ALTER TABLE bookings ADD COLUMN description TEXT");
  });

  // devices table removed (passcode-based auth replaces device system)

  db.run(
    `CREATE TABLE IF NOT EXISTS push_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner TEXT,
      subscription TEXT,
      created_at TEXT
    )`
  );

  db.run(
    `CREATE TABLE IF NOT EXISTS passcodes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      passhash TEXT,
      created_at TEXT
    )`
  );
  // ensure passcode names are unique to avoid duplicate default entries on race
  db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_passcodes_name ON passcodes(name)`);

  // table to record when insurance expiry notifications were last sent per car
  db.run(
    `CREATE TABLE IF NOT EXISTS insurance_notifications (
      car_id INTEGER PRIMARY KEY,
      last_notified TEXT,
      active INTEGER DEFAULT 1
    )`
  );
});

module.exports = db;
