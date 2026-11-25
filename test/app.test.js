const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { before, after, beforeEach, test } = require('node:test');
const assert = require('node:assert/strict');

require('dotenv').config();
process.env.NODE_ENV = 'test';
process.env.PORT = process.env.PORT || '3000';
process.env.SESSION_SECRET = 'test-session-secret-0123456789-abcdefgh';
process.env.SMS_SECRET = 'test-sms-secret-0123456789-abcdefgh';
process.env.ADMIN_PASSWORD = 'test-admin-password-strong';
process.env.TELEBIRR_NUMBER = '251911223344';
process.env.TELEBIRR_ACCOUNT_NAME = 'Telebirr Test Account';

if (!process.env.TEST_DATABASE_URL) {
  throw new Error('Set TEST_DATABASE_URL to a disposable PostgreSQL test database before running tests');
}
const dbPartsAvailable = ['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD']
  .every(name => process.env[name]);
let applicationDatabaseUrl = process.env.DATABASE_URL;
if (!applicationDatabaseUrl && dbPartsAvailable) {
  const url = new URL('postgres://localhost');
  url.hostname = process.env.DB_HOST;
  url.port = process.env.DB_PORT;
  url.username = process.env.DB_USER;
  url.password = process.env.DB_PASSWORD;
  url.pathname = `/${process.env.DB_NAME}`;
  applicationDatabaseUrl = url.toString();
}
if (applicationDatabaseUrl) {
  const testDatabase = new URL(process.env.TEST_DATABASE_URL);
  const applicationDatabase = new URL(applicationDatabaseUrl);
  if (
    testDatabase.protocol === applicationDatabase.protocol &&
    testDatabase.hostname === applicationDatabase.hostname &&
    (testDatabase.port || '5432') === (applicationDatabase.port || '5432') &&
    decodeURIComponent(testDatabase.pathname) === decodeURIComponent(applicationDatabase.pathname)
  ) {
    throw new Error('TEST_DATABASE_URL must point to a database separate from DATABASE_URL');
  }
}

const config = {
  databaseUrl: process.env.TEST_DATABASE_URL,
  sessionSecret: process.env.SESSION_SECRET,
  smsSecret: process.env.SMS_SECRET,
  adminPassword: process.env.ADMIN_PASSWORD,
  telebirrNumber: process.env.TELEBIRR_NUMBER,
  telebirrAccountName: process.env.TELEBIRR_ACCOUNT_NAME,
  isProduction: false
};
const { createDatabase } = require('../src/db');
const { createApp } = require('../src/app');
const { sequelize, models } = createDatabase(config);
const app = createApp({ config, sequelize, models });
let server;
let baseUrl;

const sampleSms = `Dear TEST
You have received ETB 5.00 from Abebe Kebede(2519****0217)  on 19/10/2026 15:54:53. Your transaction number is DJJ928K0V3. Your current E-Money Account balance is ETB 5.00.
Thank you for using telebirr
Ethio telecom`;

function cookieFrom(response) {
  const cookies = response.headers.getSetCookie();
  return cookies.map(cookie => cookie.split(';', 1)[0]).join('; ');
}

async function post(route, body, cookie, headers = {}) {
  return fetch(`${baseUrl}${route}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(cookie ? { Cookie: cookie } : {}),
      ...headers
    },
    body: JSON.stringify(body)
  });
}

async function signUp({ username = 'abebe', fullName = 'Abebe Kebede', phone = '0912340217' } = {}) {
  const response = await post('/api/signup', {
    username,
    password: 'a-strong-password',
    fullName,
    phone
  });
  assert.equal(response.status, 201);
  return cookieFrom(response);
}

async function adminCookie() {
  const response = await post('/api/admin/login', { password: config.adminPassword });
  assert.equal(response.status, 200);
  return cookieFrom(response);
}

async function sendSms(text = sampleSms, from = '127') {
  return post('/api/telebirr/sms', { from, text }, null, { 'x-sms-secret': config.smsSecret });
}

async function points(cookie) {
  const response = await fetch(`${baseUrl}/api/dashboard`, { headers: { Cookie: cookie } });
  assert.equal(response.status, 200);
  return (await response.json()).points;
}

async function submitRequest(cookie, txId) {
  const response = await post('/api/manual-requests', { txId }, cookie);
  assert.ok(response.status === 201 || response.status === 200);
  return response;
}

before(async () => {
  execFileSync(process.execPath, [path.resolve(__dirname, '..', 'node_modules', 'sequelize-cli', 'lib', 'sequelize'), 'db:migrate'], {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, NODE_ENV: 'test' },
    stdio: 'inherit'
  });
  await sequelize.authenticate();
  server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  await sequelize.close();
});

beforeEach(async () => {
  await models.ManualRequest.destroy({ where: {}, truncate: true, cascade: true });
  await models.Payment.destroy({ where: {}, truncate: true, cascade: true });
  await models.SmsLog.destroy({ where: {}, truncate: true, cascade: true });
  await models.User.destroy({ where: {}, truncate: true, cascade: true });
});

test('rejects a wrong secret and ignores a non-127 sender without logging it', async () => {
  const unauthorized = await post('/api/telebirr/sms', { from: '127', text: sampleSms }, null, {
    'x-sms-secret': 'incorrect'
  });
  assert.equal(unauthorized.status, 401);

  const ignored = await sendSms(sampleSms, '123');
  assert.equal(ignored.status, 200);
  assert.equal(await models.SmsLog.count(), 0);

  const accepted = await sendSms('not a payment');
  assert.equal(accepted.status, 200);
  assert.equal(await models.SmsLog.count(), 1);
  assert.equal(await models.SmsLog.count({ where: { parsed: false } }), 1);
});

test('credits an exact unique name and phone match once, including duplicate SMS', async () => {
  const cookie = await signUp({ fullName: '  ABEBE   KEBEDE ', phone: '251912340217' });
  assert.equal((await sendSms()).status, 200);
  assert.equal((await sendSms()).status, 200);
  assert.equal(await points(cookie), '5.00');
  assert.equal(await models.Payment.count(), 1);
});

test('leaves payments uncredited when there are no matching users or multiple matches', async () => {
  await signUp({ username: 'other', fullName: 'Other Person', phone: '0912340217' });
  const noMatchSms = sampleSms.replace('DJJ928K0V3', 'NOPE123456');
  await sendSms(noMatchSms);

  await signUp({ username: 'abebe', fullName: 'Abebe Kebede', phone: '0911110217' });
  await signUp({ username: 'abebe2', fullName: '  ABEBE    KEBEDE ', phone: '0912220217' });
  const ambiguousSms = sampleSms.replace('DJJ928K0V3', 'AMBIG12345');
  await sendSms(ambiguousSms);

  assert.equal(await models.Payment.count({ where: { userId: null } }), 2);
});

test('submitting a transaction ID creates a pending request but no points', async () => {
  const cookie = await signUp();
  const response = await submitRequest(cookie, 'abcd123456');
  assert.equal(response.status, 201);
  assert.equal(await points(cookie), '0.00');
  assert.equal(await models.ManualRequest.count({ where: { status: 'pending', txId: 'ABCD123456' } }), 1);
});

test('approval credits once under concurrency and rejects the second approval', async () => {
  const cookie = await signUp();
  const submission = await submitRequest(cookie, 'MANUAL1234');
  assert.equal(submission.status, 201);
  const admin = await adminCookie();
  const dataResponse = await fetch(`${baseUrl}/api/admin/data`, { headers: { Cookie: admin } });
  const { requests } = await dataResponse.json();
  const requestId = requests[0].id;
  const approve = () => post(`/api/admin/requests/${requestId}/approve`, { amountBirr: '3.50' }, admin);
  const results = await Promise.all([approve(), approve()]);
  assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
  assert.equal(await points(cookie), '3.50');
  assert.equal(await models.Payment.count(), 1);
});

test('a late SMS cannot duplicate a manually approved payment', async () => {
  const cookie = await signUp();
  await submitRequest(cookie, 'DJJ928K0V3');
  const admin = await adminCookie();
  const dataResponse = await fetch(`${baseUrl}/api/admin/data`, { headers: { Cookie: admin } });
  const { requests } = await dataResponse.json();
  const approval = await post(
    `/api/admin/requests/${requests[0].id}/approve`,
    { amountBirr: '5.00' },
    admin
  );
  assert.equal(approval.status, 200);

  const lateSms = await sendSms();
  assert.equal(lateSms.status, 200);
  assert.equal(await points(cookie), '5.00');
  assert.equal(await models.Payment.count(), 1);
});
