const authSection = document.getElementById('auth');
const dashboardSection = document.getElementById('dashboard');
const message = document.getElementById('message');
const depositPanel = document.getElementById('deposit-panel');
let refreshTimer;

function showMessage(text) {
  message.textContent = text || '';
}

async function request(url, options) {
  const response = await fetch(url, options);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Request failed');
  return body;
}

function appendListItem(list, text) {
  const item = document.createElement('li');
  item.textContent = text;
  list.append(item);
}

async function refreshDashboard() {
  const data = await request('/api/dashboard');
  document.getElementById('username').textContent = data.username;
  document.getElementById('points').textContent = data.points;
  document.getElementById('telebirr-number').textContent = data.telebirr.number;
  document.getElementById('telebirr-name').textContent = data.telebirr.accountName;

  const payments = document.getElementById('payments');
  payments.replaceChildren();
  for (const payment of data.payments) {
    appendListItem(payments, `${payment.txId} — ${payment.amount} points`);
  }
  const requests = document.getElementById('requests');
  requests.replaceChildren();
  for (const entry of data.manualRequests) {
    appendListItem(requests, `${entry.txId} — ${entry.status}`);
  }
}

async function enterDashboard() {
  await refreshDashboard();
  authSection.hidden = true;
  dashboardSection.hidden = false;
  clearInterval(refreshTimer);
  refreshTimer = setInterval(() => {
    refreshDashboard().catch(error => showMessage(error.message));
  }, 5000);
}

for (const formId of ['login-form', 'signup-form']) {
  document.getElementById(formId).addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    try {
      await request(formId === 'login-form' ? '/api/login' : '/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      form.reset();
      showMessage('');
      await enterDashboard();
    } catch (error) {
      showMessage(error.message);
    }
  });
}

document.getElementById('deposit-button').addEventListener('click', () => {
  depositPanel.hidden = false;
});

document.getElementById('withdraw-button').addEventListener('click', () => {
  showMessage('Coming soon');
});

document.getElementById('logout-button').addEventListener('click', async () => {
  try {
    await request('/api/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}'
    });
    clearInterval(refreshTimer);
    dashboardSection.hidden = true;
    depositPanel.hidden = true;
    authSection.hidden = false;
    showMessage('Logged out');
  } catch (error) {
    showMessage(error.message);
  }
});

document.getElementById('manual-form').addEventListener('submit', async event => {
  event.preventDefault();
  const txId = new FormData(event.currentTarget).get('txId');
  try {
    const result = await request('/api/manual-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ txId })
    });
    showMessage(result.message);
    event.currentTarget.reset();
    await refreshDashboard();
  } catch (error) {
    showMessage(error.message);
  }
});

refreshDashboard()
  .then(() => enterDashboard())
  .catch(() => {
    authSection.hidden = false;
    dashboardSection.hidden = true;
  });
