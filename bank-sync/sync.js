#!/usr/bin/env node
// bank-sync/sync.js — ההרצה היומית המלאה: מריץ גירוד לכל החיבורים המוגדרים
// מקומית (secrets/*.enc), בלי קשר לבקשות "סנכרון עכשיו" מהאתר (זה poll.js).
// מיועד להרצה ע"י Windows Task Scheduler (register-task.ps1) בלי אינטראקציה.

const { listConnectionIds } = require('./lib/crypto');
const { loadConfig, log, runConnection } = require('./lib/sync-core');

async function main() {
  const config = loadConfig();
  const ids = listConnectionIds();
  if (!ids.length) {
    log(['אין חיבורים מוגדרים מקומית (bank-sync/secrets ריק). להריץ node setup.js קודם.']);
    return;
  }

  for (const id of ids) {
    await runConnection(id, config);
  }
}

main().catch((e) => {
  log([`כשל כללי: ${e.message}`]);
  process.exit(1);
});
