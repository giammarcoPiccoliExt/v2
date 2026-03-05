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
const notifiche = require('./notifiche');
const crypto = require('crypto');
const { requireSession, createSession, getSessions } = require('./auth');

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

// web-push (VAPID) disabled - push subscriptions removed

const app = express();
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// Importa e usa il router
const routes = require('./routes');
app.use(routes);


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
const broadcast = notifiche.createBroadcaster(wss, db);


// Notifiche assicurazione: endpoint, websocket e controllo periodico
// Notifiche assicurazione: endpoint, websocket e controllo periodico
notifiche.setupInsuranceNotificationEndpoints(app, db, broadcast);
notifiche.setupInsuranceWsNotifications(wss, db);
notifiche.setupNotificationDismissEndpoint(app, db);
notifiche.setupNotificationListEndpoint(app, db);
function periodicInsuranceCheck() {
  notifiche.checkInsuranceExpiries(db, broadcast);
}
setTimeout(periodicInsuranceCheck, 1000 * 5);
setInterval(periodicInsuranceCheck, 1000 * 60 * 60 * 12);

// simple in-memory session store for passcode logins is now in auth.js

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
  const sessions = getSessions();
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
  const sessions = getSessions();
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
  const sessions = getSessions();
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
  const sessions = getSessions();
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

// --- cert renewal and backup utilities ---
const { setupCertRenewal, setupBackups } = require('./utils');
setupCertRenewal(keyPath, certPath, 90);

const dataDir = path.join(__dirname, '..', 'data');
const backupsDir = path.join(__dirname, '..', 'backups');
setupBackups(dataDir, backupsDir, 6);

// ensure a default passcode exists on first run (password: 'admin')
// (defined earlier and invoked; duplicate definition removed)
