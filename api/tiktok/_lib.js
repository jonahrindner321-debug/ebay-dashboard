const crypto = require('crypto');

const TOKEN_COOKIE = 'seller_os_tiktok';
const STATE_COOKIE = 'seller_os_tiktok_state';

function getBaseUrl(req) {
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}`;
}

function getRedirectUri(req) {
  return process.env.TIKTOK_REDIRECT_URI || `${getBaseUrl(req)}/api/tiktok/callback`;
}

function getSecret() {
  return process.env.TIKTOK_TOKEN_SECRET || process.env.TOKEN_SECRET || process.env.TIKTOK_CLIENT_SECRET;
}

function cookieOptions({ maxAge = 600, httpOnly = true } = {}) {
  return [
    `Max-Age=${maxAge}`,
    'Path=/',
    'SameSite=Lax',
    'Secure',
    httpOnly ? 'HttpOnly' : '',
  ].filter(Boolean).join('; ');
}

function setCookie(res, name, value, opts) {
  const next = `${name}=${encodeURIComponent(value)}; ${cookieOptions(opts)}`;
  const current = res.getHeader('Set-Cookie');
  if (!current) res.setHeader('Set-Cookie', next);
  else res.setHeader('Set-Cookie', Array.isArray(current) ? [...current, next] : [current, next]);
}

function clearCookie(res, name) {
  setCookie(res, name, '', { maxAge: 0 });
}

function readCookies(req) {
  const raw = req.headers.cookie || '';
  return raw.split(';').reduce((acc, part) => {
    const idx = part.indexOf('=');
    if (idx < 0) return acc;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) acc[key] = decodeURIComponent(val || '');
    return acc;
  }, {});
}

function encryptJson(value) {
  const secret = getSecret();
  if (!secret) throw new Error('Missing TIKTOK_TOKEN_SECRET or TOKEN_SECRET');
  const key = crypto.createHash('sha256').update(secret).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const plaintext = Buffer.from(JSON.stringify(value), 'utf8');
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64url');
}

function encryptText(value) {
  if (!value) return null;
  return encryptJson({ value });
}

function decryptJson(value) {
  const secret = getSecret();
  if (!secret || !value) return null;
  try {
    const raw = Buffer.from(value, 'base64url');
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const encrypted = raw.subarray(28);
    const key = crypto.createHash('sha256').update(secret).digest();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return JSON.parse(decrypted.toString('utf8'));
  } catch (e) {
    return null;
  }
}

function tokenExpiry(value) {
  if (!value) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Date(n > 100000000000 ? n : n * 1000).toISOString();
}

function getTokenBundle(req) {
  const cookies = readCookies(req);
  return decryptJson(cookies[TOKEN_COOKIE]);
}

function json(res, status, body) {
  res.status(status).json(body);
}

function html(res, status, body) {
  res.status(status).setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(body);
}

function missingConfig() {
  const missing = [];
  if (!process.env.TIKTOK_CLIENT_KEY) missing.push('TIKTOK_CLIENT_KEY');
  if (!process.env.TIKTOK_CLIENT_SECRET) missing.push('TIKTOK_CLIENT_SECRET');
  if (!getSecret()) missing.push('TIKTOK_TOKEN_SECRET or TOKEN_SECRET');
  return missing;
}

module.exports = {
  TOKEN_COOKIE,
  STATE_COOKIE,
  clearCookie,
  encryptJson,
  encryptText,
  getRedirectUri,
  getTokenBundle,
  html,
  json,
  missingConfig,
  readCookies,
  setCookie,
  tokenExpiry,
};
