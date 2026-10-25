/*
 * Global Bank Enterprise System — HW2 frontend
 *
 * Start in DEMO mode so the UI can be tested before the backend is ready.
 * When your Express API is running, set DEMO_MODE to false.
 *
 * Expected API:
 *   POST http://localhost:3000/simulate-transaction
 *   GET  http://localhost:3000/company-records
 */
const API_BASE_URL = "http://localhost:3000";
const DEMO_MODE = true; // Change to false to use the real Express/PostgreSQL API.

const initialAccounts = [
  { k1: 1, a: "10.00", b: 1 },
  { k1: 2, a: "20.00", b: 123 },
  { k1: 3, a: "20.00", b: 123 },
  { k1: 4, a: "40.00", b: 77 },
  { k1: 5, a: "40.00", b: 77 }
];

let demoAccounts = initialAccounts.map(account => ({ ...account }));
let demoTransactions = [];
let nextDemoTxId = 1;

const elements = {
  customerTab: document.getElementById("customerTab"),
  companyTab: document.getElementById("companyTab"),
  customerPortal: document.getElementById("customerPortal"),
  companyPortal: document.getElementById("companyPortal"),
  transferForm: document.getElementById("transferForm"),
  fromAccount: document.getElementById("fromAccount"),
  toAccount: document.getElementById("toAccount"),
  amount: document.getElementById("amount"),
  transferButton: document.getElementById("transferButton"),
  transferMessage: document.getElementById("transferMessage"),
  refreshButton: document.getElementById("refreshButton"),
  dashboardMessage: document.getElementById("dashboardMessage"),
  accountsBody: document.getElementById("accountsBody"),
  transactionsBody: document.getElementById("transactionsBody"),
  accountCount: document.getElementById("accountCount"),
  transactionCount: document.getElementById("transactionCount"),
  connectionStatus: document.getElementById("connectionStatus"),
  connectionDot: document.getElementById("connectionDot"),
  modeBadge: document.getElementById("modeBadge")
};

function money(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format(number);
}

function showMessage(element, message, type = "info") {
  element.textContent = message;
  element.className = `message ${type}`;
  element.hidden = false;
}

function clearMessage(element) {
  element.textContent = "";
  element.hidden = true;
  element.className = "message";
}

function switchTab(tab) {
  const showCustomer = tab === "customer";
  elements.customerPortal.hidden = !showCustomer;
  elements.companyPortal.hidden = showCustomer;
  elements.customerTab.classList.toggle("active", showCustomer);
  elements.companyTab.classList.toggle("active", !showCustomer);
  elements.customerTab.setAttribute("aria-selected", String(showCustomer));
  elements.companyTab.setAttribute("aria-selected", String(!showCustomer));

  if (!showCustomer) loadCompanyRecords();
}

elements.customerTab.addEventListener("click", () => switchTab("customer"));
elements.companyTab.addEventListener("click", () => switchTab("company"));

function setConnectionStatus(message, connected = false) {
  elements.connectionStatus.textContent = message;
  elements.connectionDot.classList.toggle("connected", connected);
}

function renderAccounts(accounts) {
  elements.accountsBody.replaceChildren();
  elements.accountCount.textContent = `${accounts.length} account${accounts.length === 1 ? "" : "s"}`;

  if (!accounts.length) {
    const row = document.createElement("tr");
    row.innerHTML = '<td colspan="3" class="empty-state">No accounts found.</td>';
    elements.accountsBody.appendChild(row);
    return;
  }

  for (const account of accounts) {
    const row = document.createElement("tr");
    const idCell = document.createElement("td");
    const balanceCell = document.createElement("td");
    const dataCell = document.createElement("td");

    idCell.textContent = String(account.k1 ?? account.account_id ?? "—");
    balanceCell.textContent = money(account.a ?? account.balance);
    balanceCell.className = "balance";
    dataCell.textContent = String(account.b ?? account.data ?? "—");

    row.append(idCell, balanceCell, dataCell);
    elements.accountsBody.appendChild(row);
  }
}

function formatTimestamp(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

function renderTransactions(transactions) {
  elements.transactionsBody.replaceChildren();
  elements.transactionCount.textContent = `${transactions.length} record${transactions.length === 1 ? "" : "s"}`;

  if (!transactions.length) {
    const row = document.createElement("tr");
    row.innerHTML = '<td colspan="5" class="empty-state">No transaction records yet.</td>';
    elements.transactionsBody.appendChild(row);
    return;
  }

  for (const transaction of transactions) {
    const row = document.createElement("tr");
    const values = [
      transaction.tx_id ?? transaction.id ?? "—",
      transaction.account_id ?? transaction.accountId ?? "—",
      money(transaction.amount),
      transaction.tx_type ?? transaction.type ?? "—",
      formatTimestamp(transaction.tx_timestamp ?? transaction.timestamp)
    ];

    values.forEach((value, index) => {
      const cell = document.createElement("td");
      if (index === 3) {
        const pill = document.createElement("span");
        const normalizedType = String(value).toUpperCase();
        pill.className = `type-pill ${normalizedType === "DEPOSIT" ? "deposit" : normalizedType === "WITHDRAWAL" ? "withdrawal" : ""}`;
        pill.textContent = normalizedType;
        cell.appendChild(pill);
      } else {
        cell.textContent = String(value);
      }
      row.appendChild(cell);
    });
    elements.transactionsBody.appendChild(row);
  }
}

function getDemoRecords() {
  return {
    success: true,
    accounts: demoAccounts.map(account => ({ ...account })),
    transactions: [...demoTransactions]
  };
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  let result;

  try {
    result = await response.json();
  } catch {
    throw new Error(`The server returned an unreadable response (HTTP ${response.status}).`);
  }

  if (!response.ok || result.success === false) {
    throw new Error(result.message || `Request failed (HTTP ${response.status}).`);
  }
  return result;
}

async function loadCompanyRecords() {
  clearMessage(elements.dashboardMessage);
  elements.refreshButton.disabled = true;
  elements.refreshButton.querySelector("span").textContent = "Refreshing…";

  try {
    let result;
    if (DEMO_MODE) {
      result = getDemoRecords();
      setConnectionStatus("Demo data — not connected to PostgreSQL", false);
    } else {
      result = await requestJson(`${API_BASE_URL}/company-records`);
      setConnectionStatus("Connected to backend API", true);
    }

    renderAccounts(Array.isArray(result.accounts) ? result.accounts : []);
    renderTransactions(Array.isArray(result.transactions) ? result.transactions : []);
  } catch (error) {
    setConnectionStatus("Backend connection failed", false);
    showMessage(
      elements.dashboardMessage,
      `${error.message} Make sure the Node.js API is running and API_BASE_URL is correct.`,
      "error"
    );
    elements.accountsBody.innerHTML = '<tr><td colspan="3" class="empty-state">Could not load accounts.</td></tr>';
    elements.transactionsBody.innerHTML = '<tr><td colspan="5" class="empty-state">Could not load transactions.</td></tr>';
  } finally {
    elements.refreshButton.disabled = false;
    elements.refreshButton.querySelector("span").textContent = "Refresh Database Records";
  }
}

function validateTransfer(fromId, toId, amount) {
  if (!Number.isInteger(fromId) || !Number.isInteger(toId)) {
    return "Choose valid source and destination accounts.";
  }
  if (fromId === toId) {
    return "The source and destination accounts must be different.";
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return "Enter an amount greater than $0.00.";
  }
  if (Math.abs(amount * 100 - Math.round(amount * 100)) > 1e-7) {
    return "Enter an amount with no more than two decimal places.";
  }
  return null;
}

function performDemoTransfer(fromId, toId, amount) {
  const source = demoAccounts.find(account => account.k1 === fromId);
  const destination = demoAccounts.find(account => account.k1 === toId);

  if (!source || !destination) throw new Error("One or both accounts do not exist.");
  if (Number(source.a) < amount) throw new Error("Insufficient funds. No transfer was made.");

  source.a = (Number(source.a) - amount).toFixed(2);
  destination.a = (Number(destination.a) + amount).toFixed(2);
  const timestamp = new Date().toISOString();

  demoTransactions.unshift({
    tx_id: nextDemoTxId++,
    account_id: fromId,
    amount: amount.toFixed(2),
    tx_type: "WITHDRAWAL",
    tx_timestamp: timestamp
  });
  demoTransactions.unshift({
    tx_id: nextDemoTxId++,
    account_id: toId,
    amount: amount.toFixed(2),
    tx_type: "DEPOSIT",
    tx_timestamp: timestamp
  });

  return { success: true, message: `Demo transfer completed: ${money(amount)} from Account ${fromId} to Account ${toId}.` };
}

elements.transferForm.addEventListener("submit", async event => {
  event.preventDefault();
  clearMessage(elements.transferMessage);

  const fromId = Number(elements.fromAccount.value);
  const toId = Number(elements.toAccount.value);
  const amount = Number(elements.amount.value);
  const validationError = validateTransfer(fromId, toId, amount);

  if (validationError) {
    showMessage(elements.transferMessage, validationError, "error");
    return;
  }

  elements.transferButton.disabled = true;
  elements.transferButton.querySelector("span").textContent = "Processing…";

  try {
    let result;
    if (DEMO_MODE) {
      // Demo mode updates in-memory browser data only; it does not call PostgreSQL.
      result = performDemoTransfer(fromId, toId, amount);
    } else {
      result = await requestJson(`${API_BASE_URL}/simulate-transaction`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromAccountId: fromId,
          toAccountId: toId,
          amountString: amount.toFixed(2)
        })
      });
    }

    showMessage(elements.transferMessage, result.message || "Transfer completed.", "success");
    elements.amount.value = "";
    if (!DEMO_MODE) {
      // Fetch the committed database state after a successful transfer.
      const records = await requestJson(`${API_BASE_URL}/company-records`);
      renderAccounts(Array.isArray(records.accounts) ? records.accounts : []);
      renderTransactions(Array.isArray(records.transactions) ? records.transactions : []);
    } else {
      const records = getDemoRecords();
      renderAccounts(records.accounts);
      renderTransactions(records.transactions);
    }
  } catch (error) {
    showMessage(elements.transferMessage, error.message || "Transfer failed.", "error");
  } finally {
    elements.transferButton.disabled = false;
    elements.transferButton.querySelector("span").textContent = "Initiate Transfer";
  }
});

elements.refreshButton.addEventListener("click", loadCompanyRecords);

function initialize() {
  elements.modeBadge.textContent = DEMO_MODE ? "DEMO MODE" : "LIVE API";
  setConnectionStatus(
    DEMO_MODE ? "Demo data — not connected to PostgreSQL" : "Connecting to backend API…",
    false
  );
  loadCompanyRecords();
}

initialize();
