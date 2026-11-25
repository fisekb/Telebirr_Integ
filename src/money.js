const SMS_PATTERN = /^Dear [^.()]{0,80}? You have received ETB ([\d,]+\.\d{2}) from ([^()]{1,100}?)\s?\(\d{4}\*+(\d{4})\) on (\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2})\. Your transaction number is ([A-Z0-9]{10})\./;

function parseAmountToSantim(amount) {
  if (typeof amount !== 'string' || !/^(?:\d+|\d{1,3}(?:,\d{3})+)\.\d{2}$/.test(amount)) {
    return null;
  }
  const [whole, fraction] = amount.replace(/,/g, '').split('.');
  const santim = BigInt(whole) * 100n + BigInt(fraction);
  if (santim < 1n || santim > 2147483647n) {
    return null;
  }
  return Number(santim);
}

function formatSantim(value) {
  const santim = BigInt(value);
  const birr = santim / 100n;
  const fraction = String(santim % 100n).padStart(2, '0');
  return `${birr}.${fraction}`;
}

function parsePaidAt(day, month, year, hour, minute, second) {
  const values = [day, month, year, hour, minute, second].map(Number);
  const [d, m, y, h, min, s] = values;
  if (m < 1 || m > 12 || d < 1 || d > 31 || h > 23 || min > 59 || s > 59) {
    return null;
  }
  const localDate = new Date(Date.UTC(y, m - 1, d, h, min, s));
  if (
    localDate.getUTCFullYear() !== y ||
    localDate.getUTCMonth() !== m - 1 ||
    localDate.getUTCDate() !== d
  ) {
    return null;
  }
  return new Date(Date.UTC(y, m - 1, d, h - 3, min, s));
}

function normalizeName(name) {
  return name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en');
}

function parseSms(text) {
  if (typeof text !== 'string') return null;
  const normalized = text.replace(/\s+/g, ' ').trim();
  const match = SMS_PATTERN.exec(normalized);
  if (!match) return null;

  const amountSantim = parseAmountToSantim(match[1]);
  const payerName = match[2].trim().replace(/\s+/g, ' ');
  const paidAt = parsePaidAt(match[4], match[5], match[6], match[7], match[8], match[9]);
  if (!amountSantim || !payerName || payerName.length > 120 || !paidAt) {
    return null;
  }

  return {
    amountSantim,
    payerName,
    payerLast4: match[3],
    paidAt,
    txId: match[10]
  };
}

function parseAdminAmount(amount) {
  return parseAmountToSantim(amount);
}

module.exports = { formatSantim, normalizeName, parseAdminAmount, parseAmountToSantim, parseSms };
