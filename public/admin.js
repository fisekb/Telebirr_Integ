const adminMessage = document.getElementById('admin-message');
const loginForm = document.getElementById('admin-login');
const dataSection = document.getElementById('admin-data');

function showAdminMessage(text) {
  adminMessage.textContent = text || '';
}

async function adminRequest(url, options) {
  const response = await fetch(url, options);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Request failed');
  return body;
}

function addText(list, text) {
  const item = document.createElement('li');
  item.textContent = text;
  list.append(item);
  return item;
}

async function loadAdminData() {
  const data = await adminRequest('/api/admin/data');
  const requests = document.getElementById('pending-requests');
  requests.replaceChildren();
  for (const entry of data.requests) {
    const item = document.createElement('li');
    const summary = document.createElement('p');
    summary.textContent =
      `${entry.txId} — ${entry.user.fullName} (${entry.user.username}, ${entry.user.phone})`;
    item.append(summary);
    if (entry.payment) {
      const payment = document.createElement('p');
      payment.textContent = `Payment received: ${entry.payment.amount}; credited: ${entry.payment.userId ? 'yes' : 'no'}`;
      item.append(payment);
    } else {
      const label = document.createElement('label');
      label.textContent = 'Verified amount in birr (e.g. 5.00) ';
      const amount = document.createElement('input');
      amount.inputMode = 'decimal';
      amount.placeholder = '5.00';
      label.append(amount);
      item.append(label);
      item.amountInput = amount;
    }
    const approve = document.createElement('button');
    approve.type = 'button';
    approve.textContent = 'Approve';
    approve.addEventListener('click', async () => {
      try {
        const payload = {};
        if (!entry.payment) payload.amountBirr = item.amountInput.value;
        await adminRequest(`/api/admin/requests/${encodeURIComponent(entry.id)}/approve`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        showAdminMessage('Request approved');
        await loadAdminData();
      } catch (error) {
        showAdminMessage(error.message);
      }
    });
    const reject = document.createElement('button');
    reject.type = 'button';
    reject.textContent = 'Reject';
    reject.addEventListener('click', async () => {
      try {
        await adminRequest(`/api/admin/requests/${encodeURIComponent(entry.id)}/reject`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}'
        });
        showAdminMessage('Request rejected');
        await loadAdminData();
      } catch (error) {
        showAdminMessage(error.message);
      }
    });
    item.append(approve, reject);
    requests.append(item);
  }

  const uncredited = document.getElementById('uncredited');
  uncredited.replaceChildren();
  for (const payment of data.uncreditedPayments) {
    addText(uncredited, `${payment.txId} — ${payment.amount} birr — ${payment.payerName || 'manual'}`);
  }
  const unparsed = document.getElementById('unparsed');
  unparsed.replaceChildren();
  for (const entry of data.unparsedSms) {
    addText(unparsed, `${new Date(entry.receivedAt).toLocaleString()} — ${entry.body}`);
  }

  loginForm.hidden = true;
  dataSection.hidden = false;
}

loginForm.addEventListener('submit', async event => {
  event.preventDefault();
  const password = new FormData(loginForm).get('password');
  try {
    await adminRequest('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });
    loginForm.reset();
    showAdminMessage('');
    await loadAdminData();
  } catch (error) {
    showAdminMessage(error.message);
  }
});

document.getElementById('admin-logout').addEventListener('click', async () => {
  try {
    await adminRequest('/api/admin/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}'
    });
    dataSection.hidden = true;
    loginForm.hidden = false;
    showAdminMessage('Logged out');
  } catch (error) {
    showAdminMessage(error.message);
  }
});
