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

function requireSession(req, res, next){
  const sessions = require('./index').sessions;
  const auth = (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || null;
  if (!auth || !sessions.has(auth)) return res.status(403).json({ error: 'forbidden: passcode required' });
  req.session = sessions.get(auth);
  next();
}

module.exports = { hashPassword, verifyPassword, requireSession };
