// Utility functions extracted from index.js
const crypto = require('crypto');

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

// In-memory session store
const sessions = new Map();

function requireSession(req, res, next){
  const auth = (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || null;
  if (!auth || !sessions.has(auth)) return res.status(403).json({ error: 'forbidden: passcode required' });
  req.session = sessions.get(auth);
  next();
}

function createSession(passcodeRow) {
  const token = crypto.randomBytes(18).toString('hex');
  sessions.set(token, { id: passcodeRow.id, name: passcodeRow.name, created: Date.now() });
  setTimeout(() => sessions.delete(token), 24 * 60 * 60 * 1000);
  return token;
}

function overlaps(car_id, start_iso, end_iso, cb) {
  const db = require('./db');
  db.get(
    `SELECT id FROM bookings WHERE car_id = ? AND NOT (end_iso <= ? OR start_iso >= ?) LIMIT 1`,
    [car_id, start_iso, end_iso],
    (err, row) => {
      if (err) return cb(err);
      cb(null, !!row);
    }
  );
}

let broadcast = () => {};
function setBroadcast(fn) { broadcast = fn; }

module.exports = {
  hashPassword,
  verifyPassword,
  requireSession,
  createSession,
  overlaps,
  sessions,
  setBroadcast,
  broadcast: (...args) => broadcast(...args)
};
