// Shared authentication middleware and session store
const crypto = require('crypto');
const sessions = new Map(); // token -> { id, name, created }

function requireSession(req, res, next) {
  const auth = (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || null;
  if (!auth || !sessions.has(auth)) return res.status(403).json({ error: 'forbidden: passcode required' });
  req.session = sessions.get(auth);
  next();
}

function createSession(passcodeRow) {
  const token = crypto.randomBytes(18).toString('hex');
  sessions.set(token, { id: passcodeRow.id, name: passcodeRow.name, created: Date.now() });
  // expire after 24h
  setTimeout(() => sessions.delete(token), 24 * 60 * 60 * 1000);
  return token;
}

function getSessions() {
  return sessions;
}

module.exports = { requireSession, createSession, getSessions };
