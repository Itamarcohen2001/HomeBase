// Supabase Edge Function — בדיקה קלה: "יש בקשת סנכרון ממתינה?"
//
// 🎯 האתר לא יכול להריץ גירוד ישירות (ראו bank-sync-ingest להסבר המלא).
// הפונקציה הזו היא הצד השני של כפתור "סנכרון עכשיו" בחיבור בנקים: המחשב
// המקומי (poll.js) קורא לה כל כמה דקות עם רשימת ה-connection_id שהוא
// מכיר (יש להם קרדנצ'לס מוצפנים מקומית), והיא מחזירה אילו מהם ביקשו
// סנכרון (sync_requested_at לא null) — בלי לגעת בסיסמאות, בלי לחשוף כלום
// חוץ מ"יש/אין בקשה" לכל מזהה שהמחשב עצמו כבר שלח.
//
// אותו מודל אבטחה בדיוק כמו bank-sync-ingest: הסוד השיתופי הוא ההרשאה
// האמיתית, לא מפתח service role.
//
// פריסה:
//   supabase functions deploy bank-sync-poll
//   (משתמשת באותו BANK_SYNC_INGEST_SECRET שכבר מוגדר ל-bank-sync-ingest)
//
// קלט:  { secret: string, connection_ids: string[] }
// פלט:  { pending: string[] }  — תת-קבוצה של connection_ids

// @ts-nocheck
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

function admin() {
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } },
  );
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const body = await req.json().catch(() => ({}));
    const secret = String(body.secret ?? '');
    const connectionIds = Array.isArray(body.connection_ids)
      ? body.connection_ids.filter((x: unknown) => typeof x === 'string')
      : [];

    const expected = Deno.env.get('BANK_SYNC_INGEST_SECRET');
    if (!expected) throw new Error('BANK_SYNC_INGEST_SECRET לא מוגדר בפרויקט');
    if (!timingSafeEqual(secret, expected)) return json({ error: 'סוד לא תקין' }, 401);
    if (!connectionIds.length) return json({ pending: [] });

    const db = admin();
    const { data, error } = await db
      .from('bank_connections')
      .select('id')
      .in('id', connectionIds)
      .not('sync_requested_at', 'is', null);
    if (error) throw new Error(error.message);

    return json({ pending: (data ?? []).map((r: { id: string }) => r.id) });
  } catch (e) {
    return json({ error: 'בדיקת בקשות הסנכרון נכשלה.', detail: String(e?.message ?? e) }, 500);
  }
});
