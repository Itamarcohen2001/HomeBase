// Supabase Edge Function — קליטת תנועות מסוכן הסנכרון המקומי (bank-sync/).
//
// 🔴 גירוד מסך מול אתר בנק (israeli-bank-scrapers) חייב Node.js+דפדפן אמיתי,
//    ו-Deno Edge Functions לא יכולות להריץ את זה — לכן הגירוד עצמו קורה
//    במחשב הבית (ראו bank-sync/README.md), והפונקציה הזו רק **מקבלת**
//    תנועות מוכנות ומכניסה אותן לתור אישור. סיסמת הבנק לא מגיעה לכאן בשום
//    שלב — הסוכן המקומי שולח רק תנועות (תאריך/סכום/תיאור), לא אישורים.
//
// אבטחה: זו לא פונקציה שנקראת מהאפליקציה/מהדפדפן, אלא משרת-לשרת מהמחשב
// המקומי. ה-Authorization header (anon key) עובר את שער ה-JWT של Supabase;
// ההרשאה **האמיתית** היא BANK_SYNC_INGEST_SECRET — סוד שיתופי, לא מפתח
// service role עצמו, כדי שדליפה מהמחשב המקומי לא תיתן גישה מלאה ל-DB.
//
// פריסה:
//   supabase functions deploy bank-sync-ingest
//   supabase secrets set BANK_SYNC_INGEST_SECRET=<ערך אקראי ארוך>
//
// קלט:
//   {
//     connection_id: string,
//     secret: string,
//     transactions: Array<{
//       external_id: string,       // מזהה/hash יציב מהספרייה, למניעת דדופ
//       occurred_on: string,       // yyyy-mm-dd
//       amount_agorot: number,     // תמיד חיובי
//       kind: 'expense' | 'income',
//       description: string | null,
//     }>
//   }

// @ts-nocheck
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ── דדופ + התאמת קטגוריה ─────────────────────────────────────────────────────
// פורט טהור (בלי תלויות React Native) של src/lib/import/shared.ts (norm/
// normKey) ו-src/lib/import/draft.ts (signature, matchCategory). מוטמע כאן
// במקום קובץ _shared נפרד, כדי שהפונקציה תישאר קובץ אחד עצמאי — ניתן להדביק
// ישירות בעורך הפונקציות של ה-Dashboard בלי תלות בייבוא בין-תיקייתי. אם
// הלוגיקה במקור משתנה, לעדכן גם כאן ידנית.

/** ⚠️ ראו src/lib/import/shared.ts:norm להסבר על המרכאות והתווים הנסתרים. */
function norm(value: unknown): string {
  return String(value ?? '')
    .replace(/''/g, '"')
    .replace(new RegExp('[‎‏‪-‮]', 'g'), '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** מפתח להשוואת תיאורים: ללא סימני פיסוק, אותיות קטנות, רווחים מכווצים. */
function normKey(value: unknown): string {
  return norm(value)
    .toLowerCase()
    .replace(/["'`,.()\[\]{}]/g, '')
    .replace(/[-–—_/\\]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** חתימת כפילות: תאריך + סכום + תיאור מנורמל — ראו import/draft.ts:signature. */
function signature(date: string, amountAgorot: number, description: string): string {
  return `${date}|${amountAgorot}|${normKey(description)}`;
}

/**
 * ⚠️ **לא מוחקים תנועה חשודה ככפילות — רק מסמנים.** בקובץ אמיתי כבר נמדדו
 * שתי תנועות זהות לגמרי באותו יום (ראו import/draft.ts) שהן שתי עסקאות
 * אמיתיות. גם כאן: אם החתימה כבר קיימת ב-transactions לפחות באותה כמות
 * מופעים, מוסיפים תווית אזהרה לתיאור — המשתמש מכריע בתור האישור, לא אנחנו.
 */
function countSignatures(rows: { occurred_on: string; amount_agorot: number; description: string | null }[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const key = signature(r.occurred_on, r.amount_agorot, r.description ?? '');
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

const POSSIBLE_DUPLICATE_PREFIX = '⚠️ ייתכן שכבר קיימת · ';

/**
 * התאמת קטגוריה מול import_rules — התבנית הארוכה ביותר שמתאימה מנצחת,
 * ורק בין קטגוריות מאותו kind (הוצאה/הכנסה). ראו import/draft.ts:matchCategory.
 * ⚠️ אין כאן את שכבת המילון המובנה (merchants.ts) — רק כללים שהמשתמש כבר
 * לימד את המערכת דרך ייבוא ידני. תנועה בלי כלל תואם נכנסת בלי קטגוריה
 * מוצעת, והמשתמש בוחר בתור האישור.
 */
function matchCategoryByRule(
  description: string,
  kind: 'expense' | 'income',
  rules: { pattern: string; category_id: string }[],
  categoryKindById: Map<string, 'expense' | 'income'>,
): string | null {
  const key = normKey(description);
  const hit = rules
    .filter((r) => r.pattern && key.includes(r.pattern) && categoryKindById.get(r.category_id) === kind)
    .sort((a, b) => b.pattern.length - a.pattern.length)[0];
  return hit ? hit.category_id : null;
}

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

type IncomingTx = {
  external_id: string;
  occurred_on: string;
  amount_agorot: number;
  kind: 'expense' | 'income';
  description: string | null;
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const startedAt = new Date().toISOString();
  let connectionId: string | null = null;
  let householdId: string | null = null;
  const db = admin();

  try {
    const body = await req.json().catch(() => ({}));
    connectionId = typeof body.connection_id === 'string' ? body.connection_id : null;
    const secret = String(body.secret ?? '');
    const txs = Array.isArray(body.transactions) ? (body.transactions as IncomingTx[]) : [];

    const expected = Deno.env.get('BANK_SYNC_INGEST_SECRET');
    if (!expected) throw new Error('BANK_SYNC_INGEST_SECRET לא מוגדר בפרויקט');
    if (secret !== expected) return json({ error: 'סוד לא תקין' }, 401);
    if (!connectionId) return json({ error: 'connection_id חסר' }, 400);

    const { data: conn, error: connErr } = await db
      .from('bank_connections')
      .select('id, household_id')
      .eq('id', connectionId)
      .maybeSingle();
    if (connErr) throw new Error(connErr.message);
    if (!conn) return json({ error: 'החיבור לא נמצא' }, 404);

    householdId = conn.household_id as string;

    // ── דדופ מול תנועות קיימות (הצלבה בלבד — לא מוחקים, רק מסמנים) ──────────
    const dates = txs.map((t) => t.occurred_on).filter(Boolean).sort();
    let existingCounts = new Map<string, number>();
    if (dates.length) {
      const { data: existing } = await db
        .from('transactions')
        .select('occurred_on, amount_agorot, note')
        .eq('household_id', householdId)
        .gte('occurred_on', dates[0])
        .lte('occurred_on', dates[dates.length - 1]);
      existingCounts = countSignatures(
        (existing ?? []).map((r) => ({ occurred_on: r.occurred_on, amount_agorot: Number(r.amount_agorot), description: r.note })),
      );
    }

    // ── קטגוריה מוצעת: import_rules הקיים של אותו משק בית ────────────────────
    const [{ data: categories }, { data: rules }] = await Promise.all([
      db.from('categories').select('id, kind').eq('household_id', householdId),
      db.from('import_rules').select('pattern, category_id').eq('household_id', householdId),
    ]);
    const categoryKindById = new Map((categories ?? []).map((c) => [c.id as string, c.kind as 'expense' | 'income']));

    const rows = txs
      .filter((t) => t.external_id && t.occurred_on && Number.isFinite(t.amount_agorot) && t.amount_agorot > 0)
      .map((t) => {
        const key = signature(t.occurred_on, t.amount_agorot, t.description ?? '');
        const possibleDuplicate = (existingCounts.get(key) ?? 0) > 0;
        const suggestedCategoryId = matchCategoryByRule(
          t.description ?? '', t.kind, rules ?? [], categoryKindById,
        );
        return {
          household_id: householdId,
          connection_id: connectionId,
          external_id: t.external_id,
          occurred_on: t.occurred_on,
          amount_agorot: Math.round(t.amount_agorot),
          kind: t.kind === 'income' ? 'income' : 'expense',
          description: possibleDuplicate ? `${POSSIBLE_DUPLICATE_PREFIX}${t.description ?? ''}` : t.description,
          suggested_category_id: suggestedCategoryId,
        };
      });

    let insertedCount = 0;
    if (rows.length) {
      // 🎯 upsert עם onConflict(connection_id, external_id) + ignoreDuplicates:
      //    ריצה חופפת (אותו טווח תאריכים נסרק פעמיים) לא יוצרת pending כפול.
      const { data: inserted, error: insErr } = await db
        .from('bank_sync_pending')
        .upsert(rows, { onConflict: 'connection_id,external_id', ignoreDuplicates: true })
        .select('id');
      if (insErr) throw new Error(insErr.message);
      insertedCount = inserted?.length ?? 0;
    }

    await db.from('bank_sync_runs').insert({
      connection_id: connectionId,
      household_id: householdId,
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      status: 'ok',
      found_count: txs.length,
      inserted_count: insertedCount,
    });

    await db.from('bank_connections').update({
      status: 'ok',
      last_synced_at: new Date().toISOString(),
      last_error: null,
    }).eq('id', connectionId);

    return json({ ok: true, found: txs.length, inserted: insertedCount });
  } catch (e) {
    const message = String(e?.message ?? e);
    // 🎯 שורת ריצה נכשלת נכתבת רק אם כבר זיהינו את משק הבית — בלי זה
    //    household_id (not null) היה נכשל בשקט ומסתיר את השגיאה האמיתית.
    if (connectionId && householdId) {
      await db.from('bank_sync_runs').insert({
        connection_id: connectionId,
        household_id: householdId,
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        status: 'error',
        error_message: message,
      });
      await db.from('bank_connections').update({ status: 'error', last_error: message }).eq('id', connectionId);
    }
    return json({ error: 'סנכרון הבנק נכשל.', detail: message }, 500);
  }
});
