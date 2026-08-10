#!/usr/bin/env node
// bank-sync/sync.js — מריץ גירוד לכל החיבורים המוגדרים מקומית (secrets/*.enc)
// ושולח את התוצאה ל-Edge Function bank-sync-ingest. מיועד להרצה ע"י
// Windows Task Scheduler (register-task.ps1) בלי אינטראקציה — כל השגיאות
// נכתבות ל-logs/, לא לקונסולה.

const fs = require('fs');
const path = require('path');
const { createScraper } = require('israeli-bank-scrapers');
const { loadCredentials, listConnectionIds } = require('./lib/crypto');

const CONFIG_PATH = path.join(__dirname, 'config.json');
const LOG_DIR = path.join(__dirname, 'logs');

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    throw new Error('config.json לא נמצא. להעתיק מ-config.example.json ולמלא (URL/מפתח/סוד).');
  }
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
  for (const key of ['supabaseUrl', 'supabaseAnonKey', 'ingestSecret']) {
    if (!config[key]) throw new Error(`config.json חסר שדה: ${key}`);
  }
  return config;
}

function log(lines) {
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
  const file = path.join(LOG_DIR, `sync-${new Date().toISOString().slice(0, 10)}.log`);
  const stamped = lines.map((l) => `[${new Date().toISOString()}] ${l}`).join('\n') + '\n';
  fs.appendFileSync(file, stamped);
  process.stdout.write(stamped);
}

// 🎯 חלון קבוע ולא "מאז הריצה הקודמת": ריצה שנכשלת (או מחשב כבוי כמה ימים)
//    לא אמורה ליצור חור בהיסטוריה. חפיפה בין ריצות בטוחה — bank-sync-ingest
//    מסתמך על (connection_id, external_id) ולא יוצר pending כפול.
const LOOKBACK_DAYS = 35;

function startDate() {
  const d = new Date();
  d.setDate(d.getDate() - LOOKBACK_DAYS);
  return d;
}

/** מזהה יציב לתנועה, למניעת דדופ. לא כל המוסדות מספקים identifier. */
function toExternalId(accountNumber, txn) {
  const acc = accountNumber || 'na';
  if (txn.identifier !== undefined && txn.identifier !== null && txn.identifier !== '') {
    return `${acc}:${txn.identifier}`;
  }
  return `${acc}:${txn.date}:${txn.chargedAmount}:${txn.description}`;
}

async function scrapeOne(connectionId) {
  const { institution, credentials } = loadCredentials(connectionId);

  const scraper = createScraper({
    companyId: institution,
    startDate: startDate(),
    combineInstallments: false,
    showBrowser: false,
  });

  const result = await scraper.scrape(credentials);
  if (!result.success) {
    throw new Error(`${result.errorType || 'UNKNOWN_ERROR'}: ${result.errorMessage || ''}`);
  }

  const transactions = [];
  for (const account of result.accounts || []) {
    for (const txn of account.txns || []) {
      // רק completed: עסקה pending עוד יכולה לזוז/להיעלם עד שהיא סופית —
      // אי אפשר להעביר לתור אישור מה שהמוסד עצמו עוד לא הבטיח.
      if (txn.status && txn.status !== 'completed') continue;
      const amount = Number(txn.chargedAmount ?? txn.originalAmount ?? 0);
      if (!Number.isFinite(amount) || amount === 0) continue;
      transactions.push({
        external_id: toExternalId(account.accountNumber, txn),
        occurred_on: String(txn.date).slice(0, 10),
        amount_agorot: Math.round(Math.abs(amount) * 100),
        kind: amount < 0 ? 'expense' : 'income',
        description: txn.description || txn.memo || null,
      });
    }
  }
  return transactions;
}

async function ingest(config, connectionId, transactions) {
  const res = await fetch(`${config.supabaseUrl}/functions/v1/bank-sync-ingest`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.supabaseAnonKey}`,
      apikey: config.supabaseAnonKey,
    },
    body: JSON.stringify({ connection_id: connectionId, secret: config.ingestSecret, transactions }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.error) {
    throw new Error(body.detail || body.error || `HTTP ${res.status}`);
  }
  return body;
}

async function main() {
  const config = loadConfig();
  const ids = listConnectionIds();
  if (!ids.length) {
    log(['אין חיבורים מוגדרים מקומית (bank-sync/secrets ריק). להריץ node setup.js קודם.']);
    return;
  }

  for (const id of ids) {
    try {
      const transactions = await scrapeOne(id);
      const result = await ingest(config, id, transactions);
      log([`${id}: הצלחה — נמצאו ${result.found}, נוספו ${result.inserted} חדשות לתור האישור.`]);
    } catch (e) {
      log([`${id}: שגיאה — ${e.message}`]);
    }
  }
}

main().catch((e) => {
  log([`כשל כללי: ${e.message}`]);
  process.exit(1);
});
