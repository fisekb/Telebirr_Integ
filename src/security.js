const crypto = require('node:crypto');

function secretMatches(candidate, expected) {
  const key = Buffer.from(expected, 'utf8');
  const actualHash = crypto.createHmac('sha256', key)
    .update(typeof candidate === 'string' ? candidate : '')
    .digest();
  const expectedHash = crypto.createHmac('sha256', key)
    .update(expected)
    .digest();
  return crypto.timingSafeEqual(actualHash, expectedHash);
}

function requireJson(req, res, next) {
  if (!req.is('application/json')) {
    return res.status(415).json({ error: 'Content-Type must be application/json' });
  }
  return next();
}

function validTxId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9]{10}$/.test(value);
}

function normalizePhone(value) {
  if (typeof value !== 'string') return null;
  let phone = value.replace(/[\s()-]/g, '');
  if (phone.startsWith('+')) phone = phone.slice(1);
  if (/^0[79]\d{8}$/.test(phone)) phone = `251${phone.slice(1)}`;
  if (/^251[79]\d{8}$/.test(phone)) return phone;
  return null;
}

module.exports = { normalizePhone, requireJson, secretMatches, validTxId };
