const path = require('node:path');
require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });

function required(name) {
  const value = process.env[name];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${name} is required`);
  }
  return value;
}

function localDatabaseUrl() {
  const host = required('DB_HOST');
  const port = required('DB_PORT');
  const name = required('DB_NAME');
  const user = required('DB_USER');
  const password = required('DB_PASSWORD');
  if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
    throw new Error('DB_PORT must be an integer between 1 and 65535');
  }
  const url = new URL('postgres://localhost');
  url.hostname = host;
  url.port = port;
  url.username = user;
  url.password = password;
  url.pathname = `/${name}`;
  return url.toString();
}

const isTest = process.env.NODE_ENV === 'test';
const isProduction = process.env.NODE_ENV === 'production';
const sessionSecret = required('SESSION_SECRET');
const smsSecret = required('SMS_SECRET');

if (Array.from(sessionSecret).length < 32) {
  throw new Error('SESSION_SECRET must be at least 32 characters');
}
if (Array.from(smsSecret).length < 32) {
  throw new Error('SMS_SECRET must be at least 32 characters');
}

const portText = required('PORT');
if (!/^\d+$/.test(portText) || Number(portText) < 1 || Number(portText) > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535');
}

const databaseUrl = isTest
  ? required('TEST_DATABASE_URL')
  : (process.env.DATABASE_URL || (isProduction ? required('DATABASE_URL') : localDatabaseUrl()));
const adminPassword = required('ADMIN_PASSWORD');
if (Array.from(adminPassword).length < 12) {
  throw new Error('ADMIN_PASSWORD must be at least 12 characters');
}

module.exports = Object.freeze({
  port: Number(portText),
  databaseUrl,
  sessionSecret,
  smsSecret,
  adminPassword,
  telebirrNumber: required('TELEBIRR_NUMBER'),
  telebirrAccountName: required('TELEBIRR_ACCOUNT_NAME'),
  isProduction
});
