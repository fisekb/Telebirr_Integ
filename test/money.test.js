const { test } = require('node:test');
const assert = require('node:assert/strict');
const { formatSantim, parseAmountToSantim, parseSms } = require('../src/money');

const sampleSms = `Dear TEST
You have received ETB 5.00 from Abebe Kebede(2519****0217)  on 19/10/2026 15:54:53. Your transaction number is DJJ928K0V3. Your current E-Money Account balance is ETB 5.00.
Thank you for using telebirr
Ethio telecom`;

test('parses the sample SMS and converts Ethiopia time to UTC', () => {
  const parsed = parseSms(sampleSms);
  assert.equal(parsed.amountSantim, 500);
  assert.equal(parsed.payerName, 'Abebe Kebede');
  assert.equal(parsed.payerLast4, '0217');
  assert.equal(parsed.txId, 'DJJ928K0V3');
  assert.equal(parsed.paidAt.toISOString(), '2026-10-19T12:54:53.000Z');
});

test('rejects invalid grouped amounts and calendar dates without float conversion', () => {
  assert.equal(parseAmountToSantim('1,234.56'), 123456);
  assert.equal(parseAmountToSantim('12,34.56'), null);
  assert.equal(formatSantim(150), '1.50');
  assert.equal(
    parseSms(sampleSms.replace('19/10/2026', '31/02/2026')),
    null
  );
});
