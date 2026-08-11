// bank-sync/lib/sync-core.js — הליבה המשותפת לגירוד+שליחה, בשימוש גם ע"י
// sync.js (הרצה יומית מלאה על כל החיבורים) וגם ע"י poll.js (בדיקה תכופה,
// מריצה גירוד רק לחיבורים שבאמת ביקשו "סנכרון עכשיו" מהאתר).

const fs = require('fs');
const path = require('path');
const { createScraper } = require('israeli-bank-scrapers');
const { loadCredentials } = require('./crypto');
const { launchPersistentBrowser } = require('./browser');
const { startDate } = require('./dates');

const CONFIG_PATH = path.join(__dirname, '..', 'config.json');
const LOG_DIR = path.join(__dirname, '..', 'logs');

// ראו sync.js להיסטוריה של המספר הזה — נמדד קריסה שלקחה איתה batch שלם.
const SCRAPE_TIMEOUT_MS = 90_000;

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

/** מזהה יציב לתנועה, למניעת דדופ. לא כל המוסדות מספקים identifier. */
function toExternalId(accountNumber, txn) {
  const acc = accountNumber || 'na';
  if (txn.identifier !== undefined && txn.identifier !== null && txn.identifier !== '') {
    return `${acc}:${txn.identifier}`;
  }
  return `${acc}:${txn.date}:${txn.chargedAmount}:${txn.description}`;
}

async function scrapeOne(connectionId, browser) {
  const { institution, credentials } = loadCredentials(connectionId);

  const scraper = createScraper({
    companyId: institution,
    startDate: startDate(),
    combineInstallments: false,
    browser,
    skipCloseBrowser: true,
  });
  const result = await scraper.scrape(credentials);

  if (!result.success) {
    const hint = /timeout/i.test(result.errorType || '')
      ? ' (ייתכן שהבנק מבקש קוד אימות SMS — נסה/י node login.js ' + connectionId + ' עם דפדפן גלוי)'
      : '';
    throw new Error(`${result.errorType || 'UNKNOWN_ERROR'}: ${result.errorMessage || ''}${hint}`);
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

/**
 * חיבור אחד, מבודד מהשאר: דפדפן משלו, טיימאאוט משלו. אם זה נתקע — הורגים
 * את תהליך ה-Chromium ברמת ה-OS (לא רק browser.close(), שיכול להיתקע בעצמו
 * אם התהליך כבר קפוא), מה שגורם ל-scraper.scrape() התלוי לדחות, וממשיכים
 * הלאה. שום דבר כאן לא זורק החוצה.
 */
async function runConnection(id, config) {
  const browser = await launchPersistentBrowser(id, /* headless */ true);
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    try {
      browser.process()?.kill('SIGKILL');
    } catch {
      /* כבר מת/נסגר — לא נורא */
    }
  }, SCRAPE_TIMEOUT_MS);

  try {
    const transactions = await scrapeOne(id, browser);
    const result = await ingest(config, id, transactions);
    log([`${id}: הצלחה — נמצאו ${result.found}, נוספו ${result.inserted} חדשות לתור האישור.`]);
  } catch (e) {
    const prefix = timedOut ? `TIMEOUT אחרי ${SCRAPE_TIMEOUT_MS / 1000} שניות — ` : '';
    log([`${id}: שגיאה — ${prefix}${e.message}`]);
  } finally {
    clearTimeout(timer);
    if (!timedOut) {
      try {
        await browser.close();
      } catch {
        /* לא קריטי — הריצה הבאה תפתח דפדפן חדש בכל מקרה */
      }
    }
  }
}

module.exports = { loadConfig, log, runConnection };
