const fs = require('fs');
console.log('SERVER: loading server/index.js');
const path = require('path');
const https = require('https');
const express = require('express');
const bodyParser = require('body-parser');
const selfsigned = require('selfsigned');
const WebSocket = require('ws');

const db = require('./db');
const ddns = require('./ddns');
const crypto = require('crypto');

const CONFIG_PATH = path.join(__dirname, '..', 'config.json');
let config = {};
if (fs.existsSync(CONFIG_PATH)) {
  config = JSON.parse(fs.readFileSync(CONFIG_PATH));
} else {
  const example = path.join(__dirname, '..', 'config.example.json');
  config = JSON.parse(fs.readFileSync(example));
}

const PORT = config.port || 3001;

// ensure certs
const certDir = path.join(__dirname, '..', 'certs');
if (!fs.existsSync(certDir)) fs.mkdirSync(certDir, { recursive: true });
const keyPath = config.ssl?.keyPath || path.join(certDir, 'key.pem');
const certPath = config.ssl?.certPath || path.join(certDir, 'cert.pem');

if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
  console.log('Generating self-signed certs...');
  const attrs = [{ name: 'commonName', value: 'localhost' }];
  try {
    const pems = selfsigned.generate(attrs, { days: 3650 });
    if (pems && pems.private && pems.cert) {
      fs.writeFileSync(keyPath, pems.private);
      fs.writeFileSync(certPath, pems.cert);
    } else {
      throw new Error('selfsigned returned invalid data');
    }
  } catch (e) {
    console.error('selfsigned generation failed, falling back to openssl:', e.message);
    try {
      const { spawnSync } = require('child_process');
      // generate a temporary self-signed cert via openssl
      const subj = '/CN=localhost';
      const res = spawnSync('openssl', ['req', '-x509', '-nodes', '-days', '3650', '-newkey', 'rsa:2048', '-keyout', keyPath, '-out', certPath, '-subj', subj], { stdio: 'inherit' });
      if (res.error) throw res.error;
    } catch (e2) {
      console.error('OpenSSL fallback failed:', e2.message);
      throw e2;
    }
  }
}

const app = express();
app.use(bodyParser.json());

app.use(express.static(path.join(__dirname, '..', 'public')));

// web-push (VAPID) disabled - push subscriptions removed

app.get('/health', (req, res) => {
  // quick DB check
  db.get('SELECT 1 as ok', [], (err) => {
    if (err) return res.status(500).json({ ok: false, error: err.message });
    res.json({ ok: true });
  });
});

// Cars
app.get('/api/cars', (req, res) => {
  db.all('SELECT * FROM cars', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/cars', requireSession, (req, res) => {
  const { modello, descrizione, color, size, price_per_day, plate, insurance_expiry_iso } = req.body;
  // check for duplicates (modello or plate)
  const plateVal = plate ? plate : null;
  db.get('SELECT id FROM cars WHERE modello = ? OR (plate IS NOT NULL AND plate = ?) LIMIT 1', [modello, plateVal], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (row) return res.status(409).json({ error: 'duplicate', message: 'Car modello or plate already exists' });
    db.run(
      'INSERT INTO cars (modello,descrizione,color,size,price_per_day,plate,insurance_expiry_iso) VALUES (?,?,?,?,?,?,?)',
      [modello, descrizione, color, size, price_per_day || null, plateVal, insurance_expiry_iso || null],
      function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID });
      }
    );
  });
});

// update car
app.put('/api/cars/:id', requireSession, (req, res) => {
  const id = req.params.id;
  const { modello, descrizione, color, size, price_per_day, plate, insurance_expiry_iso } = req.body;
  const plateVal = plate ? plate : null;
  // check duplicates excluding this id
  db.get('SELECT id FROM cars WHERE (modello = ? OR (plate IS NOT NULL AND plate = ?)) AND id != ? LIMIT 1', [modello, plateVal, id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (row) return res.status(409).json({ error: 'duplicate', message: 'Car modello or plate already exists' });
    db.run(
      'UPDATE cars SET modello=?, descrizione=?, color=?, size=?, price_per_day=?, plate=?, insurance_expiry_iso=? WHERE id=?',
      [modello, descrizione, color, size, price_per_day || null, plateVal, insurance_expiry_iso || null, id],
      function (err) {
        if (err) return res.status(500).json({ error: err.message });
        // clear any previous insurance notification so we restart the reminder cycle
        db.run('DELETE FROM insurance_notifications WHERE car_id = ?', [id], function (e) {});
        res.json({ changed: this.changes });
      }
    );
  });
});

// delete car
app.delete('/api/cars/:id', requireSession, (req, res) => {
  const id = req.params.id;
  db.run('DELETE FROM cars WHERE id=?', [id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ deleted: this.changes });
  });
});

// Bookings
app.get('/api/bookings', (req, res) => {
  db.all('SELECT * FROM bookings', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

function overlaps(car_id, start_iso, end_iso, cb) {
  db.get(
    `SELECT id FROM bookings WHERE car_id = ? AND NOT (end_iso <= ? OR start_iso >= ?) LIMIT 1`,
    [car_id, start_iso, end_iso],
    (err, row) => {
      if (err) return cb(err);
      cb(null, !!row);
    }
  );
}

// Booking creation is handled below with device approval enforcement.

// allow running plain HTTP behind a TLS terminator (set USE_HTTP=1)
const usePlainHttp = process.env.USE_HTTP === '1' || config.usePlainHttp;
let server;
if (usePlainHttp) {
  server = require('http').createServer(app);
  console.log('Starting plain HTTP server (USE_HTTP=1)');
} else {
  const options = {
    key: fs.readFileSync(keyPath),
    cert: fs.readFileSync(certPath)
  };
  server = https.createServer(options, app);
}

// optionally start an HTTP redirector to HTTPS when running in HTTPS mode
const http = require('http');
const HTTP_PORT = config.httpPort || 3000;
if (!usePlainHttp) {
  http.createServer((req, res) => {
    const host = req.headers.host ? req.headers.host.split(':')[0] : 'localhost';
    const redirectPort = PORT;
    res.writeHead(301, { Location: `https://${host}:${redirectPort}${req.url}` });
    res.end();
  }).listen(HTTP_PORT, () => { console.log(`HTTP redirector listening on port ${HTTP_PORT} -> https:${PORT}`); }).on('error', (e)=>{ console.log('HTTP redirector error', e.message); });
} else {
  console.log('usePlainHttp is true; HTTP->HTTPS redirector disabled');
}

// WebSocket server for push notifications
const wss = new WebSocket.Server({ server });

function broadcast(obj) {
  const msg = JSON.stringify(obj);
  wss.clients.forEach((c) => {
    if (c.readyState === WebSocket.OPEN) c.send(msg);
  });
}

// Insurance expiry reminder: check cars daily and notify when expiry within 10 days.
async function checkInsuranceExpiries(){
  try{
    db.all('SELECT * FROM cars WHERE insurance_expiry_iso IS NOT NULL', [], (err, rows) => {
      if(err || !rows) return;
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      rows.forEach(car=>{
        try{
          const iso = car.insurance_expiry_iso;
          if(!iso) return;
          // accept date formats like YYYY-MM-DD or full ISO
          const exp = new Date((iso.length===10)? (iso + 'T00:00:00Z') : iso);
          if(isNaN(exp)) return;
          const diffMs = exp.getTime() - today.getTime();
          const daysLeft = Math.ceil(diffMs / 86400000);
          if(daysLeft <= 10 && daysLeft >= 0){
            // check last notification
            db.get('SELECT last_notified FROM insurance_notifications WHERE car_id = ?', [car.id], (err2, row2)=>{
              const nowIso = new Date().toISOString();
              let shouldNotify = false;
              if(err2) shouldNotify = true;
              else if(!row2 || !row2.last_notified) shouldNotify = true;
              else {
                const last = new Date(row2.last_notified);
                if(isNaN(last)) shouldNotify = true;
                else {
                  const diffDays = Math.floor((now.getTime() - last.getTime()) / 86400000);
                  if(diffDays >= 2) shouldNotify = true;
                }
              }
              if(shouldNotify){
                broadcast({ type:'insurance_alert', car: { id: car.id, name: car.name, plate: car.plate, insurance_expiry_iso: car.insurance_expiry_iso }, days_left: daysLeft });
                db.run('INSERT OR REPLACE INTO insurance_notifications (car_id,last_notified) VALUES (?,?)', [car.id, nowIso], function(e){});
              }
            });
          }
        }catch(e){}
      });
    });
  }catch(e){ console.error('insurance check error', e); }
}

// run at startup and every 12 hours
setTimeout(checkInsuranceExpiries, 1000 * 5);
setInterval(checkInsuranceExpiries, 1000 * 60 * 60 * 12);

// simple in-memory session store for passcode logins
const sessions = new Map(); // token -> { id, name, created }

function hashPassword(password) {
  const salt = crypto.randomBytes(12).toString('hex');
  const iters = 100000;
  const derived = crypto.pbkdf2Sync(password, salt, iters, 64, 'sha256').toString('hex');
  return `${iters}$${salt}$${derived}`;
}

function verifyPassword(password, stored) {
  if (!stored) return false;
  const parts = stored.split('$');
  if (parts.length !== 3) return false;
  const [itersStr, salt, hash] = parts;
  const iters = parseInt(itersStr, 10) || 100000;
  try {
    const derived = crypto.pbkdf2Sync(password, salt, iters, 64, 'sha256').toString('hex');
    return derived === hash;
  } catch (e) {
    return false;
  }
}

function createSession(passcodeRow) {
  const token = crypto.randomBytes(18).toString('hex');
  sessions.set(token, { id: passcodeRow.id, name: passcodeRow.name, created: Date.now() });
  // expire after 24h
  setTimeout(() => sessions.delete(token), 24 * 60 * 60 * 1000);
  return token;
}

// ensure a default passcode exists on first run
function ensureDefaultPasscode() {
  db.get('SELECT COUNT(*) AS c FROM passcodes', [], (err, row) => {
    if (err) { console.error('check default passcode error', err.message); return; }
    const count = row && row.c ? row.c : 0;
    if (count === 0) {
        const defaultName = 'admin';
        const defaultPass = 'admin';
        const passhash = hashPassword(defaultPass);
        // use INSERT OR IGNORE in case another process inserts concurrently
        db.run('INSERT OR IGNORE INTO passcodes (name, passhash, created_at) VALUES (?,?,?)', [defaultName, passhash, new Date().toISOString()], function (err) {
          if (err) console.error('failed creating default passcode', err.message);
          else if (this.changes && this.changes > 0) console.log('Created default passcode "admin" (password: admin) with id', this.lastID);
        });
    } else {
      // existing passcodes found
    }
  });
}

// require a valid passcode session (Bearer token)
function requireSession(req, res, next){
  const auth = (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || null;
  if (!auth || !sessions.has(auth)) return res.status(403).json({ error: 'forbidden: passcode required' });
  req.session = sessions.get(auth);
  next();
}

// ensure default admin passcode exists, then start server
ensureDefaultPasscode();
server.listen(PORT, () => {
  console.log(`${usePlainHttp ? 'HTTP' : 'HTTPS'} server listening on port ${PORT}`);
});

// start DDNS updater only if configured
try {
  if (config.ddns && config.ddns.provider) ddns.startDDNS(config);
} catch (e) { console.error('DDNS start error', e.message); }

// export for electron control
module.exports = { server, shutdown: () => server.close() };

// Web Push (VAPID) disabled — push notifications removed for this deployment

// devices management
// devices system removed: access restricted to passcode sessions only

// Passcodes management (admin via approved device or existing session)
app.get('/api/passcodes', requireSession, (req, res) => {
  db.all('SELECT id, name, created_at FROM passcodes', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/passcodes', requireSession, (req, res) => {
  const { name, password } = req.body || {};
  if (!name || !password) return res.status(400).json({ error: 'missing name or password' });
  const passhash = hashPassword(password);
  db.run('INSERT INTO passcodes (name, passhash, created_at) VALUES (?,?,?)', [name, passhash, new Date().toISOString()], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: this.lastID });
  });
});

app.delete('/api/passcodes/:id', requireSession, (req, res) => {
  const id = req.params.id;
  db.run('DELETE FROM passcodes WHERE id=?', [id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ deleted: this.changes });
  });
});

// login with a passcode password -> returns a short-lived token
app.post('/api/login', (req, res) => {
  const { password } = req.body || {};
  if (!password) return res.status(400).json({ error: 'missing password' });
  db.all('SELECT id, name, passhash FROM passcodes', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!rows || rows.length === 0) return res.status(401).json({ error: 'no passcodes configured' });
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (verifyPassword(password, r.passhash)) {
        const token = createSession(r);
        return res.json({ token, id: r.id, name: r.name });
      }
    }
    return res.status(401).json({ error: 'invalid password' });
  });
});

// Admin: reboot the machine (requires passcode session)
app.post('/api/admin/reboot', requireSession, (req, res) => {
  const { spawn } = require('child_process');
  // IMPORTANT: ensure the service user can run shutdown/reboot without password via sudoers
  try {
    const child = spawn('sudo', ['/sbin/shutdown', '-r', 'now'], { detached: true, stdio: 'ignore' });
    child.unref();
    res.json({ ok: true, msg: 'rebooting' });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// override booking creation to require passcode session
app.post('/api/bookings', (req, res) => {
  const { car_id, start_iso, end_iso, title, client_name, description } = req.body;
  if (!car_id || !start_iso || !end_iso) return res.status(400).json({ error: 'missing fields' });

  // Determine auth: either passcode session (Bearer token) or approved device
  const auth = (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || null;
  let session = null;
  if (auth && sessions.has(auth)) session = sessions.get(auth);

  function doInsert(creator_name_val) {
    overlaps(car_id, start_iso, end_iso, (err, hasOverlap) => {
      if (err) return res.status(500).json({ error: err.message });
      const force = !!req.body.force;
      const proceedInsert = () => {
        db.run(
          'INSERT INTO bookings (car_id,start_iso,end_iso,title,client_name,creator_name,description) VALUES (?,?,?,?,?,?,?)',
          [car_id, start_iso, end_iso, title || null, client_name || null, creator_name_val || null, description || null],
          function (err) {
            if (err) return res.status(500).json({ error: err.message });
            const booking = { id: this.lastID, car_id, start_iso, end_iso, title, client_name: client_name || null, creator_name: creator_name_val || null, description: description || null };
            broadcast({ type: 'booking_created', booking });
            // web-push notifications disabled; only broadcast via WebSocket
            res.json(booking);
          }
        );
      };

      if (hasOverlap && force) {
        db.run('DELETE FROM bookings WHERE car_id=? AND NOT (end_iso <= ? OR start_iso >= ?)', [car_id, start_iso, end_iso], function (err) {
          if (err) return res.status(500).json({ error: err.message });
          proceedInsert();
        });
      } else {
        if (hasOverlap) return res.status(409).json({ error: 'overlap' });
        proceedInsert();
      }
    });
  }

  if (session) {
    // authenticated via passcode session
    return doInsert(session.name);
  }
  // require session only
  return res.status(403).json({ error: 'forbidden: passcode required' });
});

// update booking (allow passcode session or approved device)
app.put('/api/bookings/:id', (req, res) => {
  const id = req.params.id;
  const { car_id, start_iso, end_iso, title, client_name, description } = req.body;
  const auth = (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || null;
  if (!auth || !sessions.has(auth)) return res.status(403).json({ error: 'forbidden: passcode required' });
  // check overlap excluding this booking id
  db.get('SELECT id FROM bookings WHERE car_id = ? AND id != ? AND NOT (end_iso <= ? OR start_iso >= ?) LIMIT 1', [car_id, id, start_iso, end_iso], (err, overlapRow) => {
    if (err) return res.status(500).json({ error: err.message });
    if (overlapRow) return res.status(409).json({ error: 'overlap' });
    db.run('UPDATE bookings SET car_id=?, start_iso=?, end_iso=?, title=?, client_name=?, description=? WHERE id=?', [car_id, start_iso, end_iso, title || null, client_name || null, description || null, id], function (err) {
      if (err) return res.status(500).json({ error: err.message });
      broadcast({ type: 'booking_updated', booking: { id, car_id, start_iso, end_iso, title, client_name } });
      res.json({ changed: this.changes });
    });
  });
});

// delete booking (allow passcode session or approved device)
app.delete('/api/bookings/:id', (req, res) => {
  const id = req.params.id;
  const auth = (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || null;
  if (!auth || !sessions.has(auth)) return res.status(403).json({ error: 'forbidden: passcode required' });
  const session = sessions.get(auth);
  // get booking before deleting so we can broadcast full info
  db.get('SELECT * FROM bookings WHERE id=?', [id], (err, bookingRow) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!bookingRow) return res.status(404).json({ error: 'not found' });
    // insert into archive first
    const deletedAt = new Date().toISOString();
    db.run(
      'INSERT INTO bookings_archive (original_id, car_id, start_iso, end_iso, title, client_name, creator_name, description, deleted_by, deleted_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
      [bookingRow.id, bookingRow.car_id, bookingRow.start_iso, bookingRow.end_iso, bookingRow.title || null, bookingRow.client_name || null, bookingRow.creator_name || null, bookingRow.description || null, session ? session.name : null, deletedAt],
      function (err) {
        if (err) return res.status(500).json({ error: err.message });
        // now delete original
        db.run('DELETE FROM bookings WHERE id=?', [id], function (err) {
          if (err) return res.status(500).json({ error: err.message });
          const payload = { id: bookingRow.id, car_id: bookingRow.car_id, start_iso: bookingRow.start_iso, end_iso: bookingRow.end_iso, title: bookingRow.title, client_name: bookingRow.client_name, creator_name: bookingRow.creator_name, description: bookingRow.description, deleted_by: session ? session.name : null, deleted_at: deletedAt };
          broadcast({ type: 'booking_deleted', booking: payload });
          res.json({ deleted: this.changes });
        });
      }
    );
  });
});

// check overlap endpoint
app.post('/api/bookings/check', (req, res) => {
  const { car_id, start_iso, end_iso } = req.body;
  const excludeId = req.body.exclude_id || null;
  if (!car_id || !start_iso || !end_iso) return res.status(400).json({ error: 'missing fields' });
  let sql = `SELECT * FROM bookings WHERE car_id = ? AND NOT (end_iso <= ? OR start_iso >= ?)`;
  const params = [car_id, start_iso, end_iso];
  if (excludeId) { sql += ' AND id != ?'; params.push(excludeId); }
  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ overlap: rows.length > 0, rows });
  });
});

// archived bookings endpoint
app.get('/api/bookings/archive', (req, res) => {
  // optional filter by name via query ?name=...
  const name = req.query.name || null;
  let sql = 'SELECT * FROM bookings_archive';
  const params = [];
  if (name) { sql += ' WHERE client_name = ? OR creator_name = ?'; params.push(name, name); }
  sql += ' ORDER BY deleted_at DESC';
  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

// check whether the current Authorization token grants write permission for bookings
app.get('/api/auth/can_write', (req, res) => {
  const auth = (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || null;
  if (auth && sessions.has(auth)) {
    const s = sessions.get(auth);
    return res.json({ can_write: true, name: s.name });
  }
  return res.status(403).json({ can_write: false });
});

// internal notify endpoint: accepts requests from localhost only and broadcasts a toast to all WS clients
app.post('/internal/notify', express.json(), (req, res) => {
  const ip = (req.ip || '').replace('::ffff:', '');
  if (ip !== '127.0.0.1' && ip !== '::1') return res.status(403).json({ error: 'forbidden' });
  const msg = (req.body && req.body.message) ? String(req.body.message) : 'Server updated';
  try {
    broadcast({ type: 'toast', message: msg, level: 'info' });
    return res.json({ ok: true });
  } catch (e) {
    console.error('internal notify error', e.message);
    return res.status(500).json({ error: e.message });
  }
});

// --- cert renewal: regenerate if older than 90 days ---
function setupCertRenewal(checkDays = 90) {
  const ms = 24 * 60 * 60 * 1000;
  async function checkAndRenew() {
    try {
      const stat = fs.statSync(keyPath);
      const ageDays = (Date.now() - stat.mtimeMs) / ms;
      if (ageDays > checkDays) {
        console.log('Regenerating self-signed certs (age', Math.floor(ageDays), 'days)');
        const attrs = [{ name: 'commonName', value: 'localhost' }];
        const pems = selfsigned.generate(attrs, { days: 3650 });
        fs.writeFileSync(keyPath, pems.private);
        fs.writeFileSync(certPath, pems.cert);
      }
    } catch (e) {
      console.error('Cert renewal check error', e.message);
    }
  }
  checkAndRenew();
  setInterval(checkAndRenew, 24 * 60 * 60 * 1000); // check daily
}
setupCertRenewal(90);

// --- DB backups every 6 hours ---
function setupBackups(intervalHours = 6) {
  const backupsDir = path.join(__dirname, '..', 'backups');
  if (!fs.existsSync(backupsDir)) fs.mkdirSync(backupsDir, { recursive: true });
  async function doBackup() {
    try {
      const src = path.join(__dirname, '..', 'data', 'app.db');
      if (!fs.existsSync(src)) return;
      const dest = path.join(backupsDir, `app-${new Date().toISOString().replace(/[:.]/g,'-')}.db`);
      fs.copyFileSync(src, dest);
      console.log('DB backup saved to', dest);
      // enforce max 5 backups: remove oldest beyond 5
      try{
        const files = fs.readdirSync(backupsDir).filter(f=>f.startsWith('app-') && f.endsWith('.db'))
          .map(f=>({ name:f, path:path.join(backupsDir,f), mtime: fs.statSync(path.join(backupsDir,f)).mtimeMs }))
          .sort((a,b)=>b.mtime - a.mtime);
        const keep = 5;
        if(files.length > keep){
          const toRemove = files.slice(keep);
          toRemove.forEach(it=>{ try{ fs.unlinkSync(it.path); console.log('Removed old backup', it.path); }catch(e){ console.error('Failed remove old backup', it.path, e.message); } });
        }
      }catch(e){ console.error('Prune backups error', e.message); }
    } catch (e) { console.error('Backup error', e.message); }
  }
  doBackup();
  setInterval(doBackup, intervalHours * 60 * 60 * 1000);
}
setupBackups(6);

// ensure a default passcode exists on first run (password: 'admin')
// (defined earlier and invoked; duplicate definition removed)
