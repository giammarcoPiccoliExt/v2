const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'app.db');

function ensureDbDir() {
  const fs = require('fs');
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

ensureDbDir();

const db = new sqlite3.Database(DB_PATH);

db.serialize(() => {
  db.run(
    `CREATE TABLE IF NOT EXISTS cars (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      color TEXT,
      size TEXT,
      price_per_day REAL,
      plate TEXT
    )`
  );

  // prevent creating duplicate cars by name or plate
  db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_cars_name ON cars(name)`);
  db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_cars_plate ON cars(plate)`);

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
});

module.exports = db;
