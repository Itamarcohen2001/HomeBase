-- 0019 — סנכרון בנק "עכשיו" מהאתר, לא רק בתזמון היומי
--
-- 🎯 האתר לא יכול להריץ גירוד ישירות (Puppeteer חייב לרוץ אצל המשתמש —
--    ראו כל ההיסטוריה של bank-sync/). הפתרון: כפתור באתר רק **מבקש**
--    (כותב sync_requested_at, כתיבה רגילה שכבר מכוסה ע"י bank_connections_update
--    הקיימת — אין צורך ב-RLS/RPC חדש בשביל זה), והמחשב המקומי בודק לעיתים
--    תכופות (poll.js, כל כמה דקות) אם יש בקשה ממתינה ומבצע בפועל.

alter table public.bank_connections
  add column if not exists sync_requested_at timestamptz;

comment on column public.bank_connections.sync_requested_at is
  'המשתמש לחץ "סנכרון עכשיו" באתר. poll.js המקומי בודק את זה כל כמה דקות ומאפס אחרי סנכרון מוצלח (bank-sync-ingest).';
