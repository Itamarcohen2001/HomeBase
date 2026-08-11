#!/usr/bin/env node
// bank-sync/poll.js — בדיקה קלה שרצה תכופות (כל כמה דקות, ראו
// register-poll-task.ps1): שואל את bank-sync-poll "יש בקשת סנכרון
// ממתינה?", ואם כן — מריץ גירוד אמיתי רק לחיבורים שביקשו, לא לכולם.
//
// 🎯 שקט בכוונה: אם אין בקשות ממתינות, שום דבר לא נכתב ללוג — אחרת קובץ
// הלוג היה מתמלא ב"אין כלום" מדי כמה דקות, כל היום. sync.js (ההרצה
// היומית המלאה) ממשיכה לכתוב תמיד, ללא קשר לסקריפט הזה.

const { listConnectionIds } = require('./lib/crypto');
const { loadConfig, log, runConnection } = require('./lib/sync-core');

async function fetchPending(config, connectionIds) {
  const res = await fetch(`${config.supabaseUrl}/functions/v1/bank-sync-poll`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.supabaseAnonKey}`,
      apikey: config.supabaseAnonKey,
    },
    body: JSON.stringify({ secret: config.ingestSecret, connection_ids: connectionIds }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.error) {
    throw new Error(body.detail || body.error || `HTTP ${res.status}`);
  }
  return body.pending || [];
}

async function main() {
  const config = loadConfig();
  const ids = listConnectionIds();
  if (!ids.length) return; // אין חיבורים מוגדרים — שקט, לא מצב שגיאה

  const pending = await fetchPending(config, ids);
  if (!pending.length) return; // אין בקשות — שקט, זו הריצה הרגילה

  log([`בקשת "סנכרון עכשיו" התקבלה עבור: ${pending.join(', ')}`]);
  for (const id of pending) {
    await runConnection(id, config);
  }
}

main().catch((e) => {
  // שגיאת רשת/תצורה בבדיקה עצמה — לא מפילים תהליך, רק רושמים ומנסים שוב
  // בפעם הבאה שהמשימה המתוזמנת תריץ אותנו (כל כמה דקות ממילא).
  log([`poll.js: שגיאה בבדיקת בקשות — ${e.message}`]);
});
