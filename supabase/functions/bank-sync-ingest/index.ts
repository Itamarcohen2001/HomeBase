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

// ── מילון עסקים מובנה ────────────────────────────────────────────────────────
// פורט של src/lib/import/merchants.ts — אותה תבנית "עדכן גם כאן ידנית" כמו
// שאר הפונקציה הזו. אם הרשימה שם משתנה, לעדכן גם פה.
const CATEGORY_BY_MERCHANT: Record<string, string[]> = {
  'סופר ומכולת': [
    'שופרסל', 'רמי לוי', 'ויקטורי', 'יינות ביתן', 'מגה בעיר', 'טיב טעם', 'אושר עד', 'יוחננוף',
    'סופר דוידי', 'סופר פארם', 'am pm', 'ampm', 'טיב טעים', 'קופיקס מרקט', 'מינמרקט', 'מיני מרקט',
    'שוק בכפר', 'חצי חינם', 'זול ובגדול', 'קשת טעמים', 'מכולת',
  ],
  'מסעדות וקפה': [
    'מקדונלד', 'בורגר', 'קפה', 'ארומה', 'לנדוור', 'קפית', 'רולדין', 'ביסטופ', 'שניצליה', 'תמנון',
    'כיף של בגט', 'כוורת', 'מעדניית', 'bbw', 'משקט', 'מש קר', 'פשפש', 'wolt', 'וולט', 'תן ביס',
    'מסעדה', 'פיצה', 'סושי', 'המבורגר', 'בראנץ', 'קייטרינג', 'בייקרי', 'מאפה', 'גלידה', 'שווארמה',
    'פלאפל', 'רובן',
  ],
  'תחבורה ודלק': [
    'פז', 'סונול', 'דלק', 'דור אלון', 'yellow', 'רב קו', 'רב-קו', 'רכבת ישראל', 'אגד',
    'מטרופולין', 'גט טקסי', 'gett', 'יאנגו', 'yango', 'שמשונים', 'תדלוק', 'חניון', 'פנגו',
    'סלופארק', 'עימגה',
  ],
  'חשבונות בית': [
    'חברת חשמל', 'בזק', 'הוט', 'yes', 'פרטנר', 'סלקום', 'פלאפון', 'גולן טלקום', 'רמי לוי תקשורת',
    'מי אשקלון', 'מי אביבים', 'מקורות', 'תאגיד המים', 'עירייה', 'ארנונה', 'גז', 'סופרגז', 'אמישראגז',
  ],
  'בריאות ותרופות': [
    'סופרפארם', 'ניו פארם', 'בי פארם', 'גוד פארם', 'כללית', 'מכבי', 'מאוחדת', 'לאומית', 'בית מרקחת',
    'רופא', 'מרפאה', 'שיניים',
  ],
  'ביגוד והנעלה': [
    'קסטרו', 'פוקס', 'zara', 'h&m', 'רנואר', 'גולף', 'אמריקן איגל', 'דלתא',
    'נעלי', 'טרמינל איקס', 'shein',
  ],
  'פנאי ובילויים': [
    'הטבות פיס', 'פיס פלוס', 'מועדון שלך', 'סינמה סיטי', 'יס פלאנט', 'לב סינמה', 'הבימה', 'סטימצקי',
    'צומת ספרים', 'ספורט', 'חדר כושר', 'הולמס פלייס', 'איקס פיט',
  ],
  'מנויים ודיגיטל': [
    'netflix', 'נטפליקס', 'spotify', 'ספוטיפיי', 'google', 'apple.com', 'itunes', 'microsoft',
    'openai', 'chatgpt', 'youtube', 'disney', 'amazon', 'צימר', 'איקלאוד', 'icloud',
  ],
  'ילדים וחינוך': ['גן ילדים', 'צהרון', 'בית ספר', 'חוג', 'מעון', 'ועד הורים', 'טיפת חלב'],
  'חיות מחמד': ['פטס', 'חיות', 'וטרינר', 'אולסטאר פט', 'זולו'],
  'מתנות ותרומות': ['מתנות', 'פרחים', 'תרומה', 'עמותת'],
  'ביטוח': ['הראל', 'מגדל', 'כלל ביטוח', 'הפניקס', 'מנורה מבטחים', 'ביטוח לאומי', 'איילון'],
  'שונות': ['דמי כרטיס', 'עמלה', 'עמלות', 'ש הפקות', 'פרינטר סנטר'],
};

/** ⚠️ אסור \b על עברית — ראו merchants.ts:MONEY_APP_PATTERNS להסבר המלא. */
const MONEY_APP_PATTERNS = [
  /(^|[\s֐-׿])ביט(?=$|\s)/,
  /(^|[\s֐-׿])פייבוקס(?=$|\s)/,
  /\b(bit|paybox)\b/i,
];
const GENERIC_TRANSFER_PATTERNS = ['העברה'];
const MONEY_TRANSFER_CATEGORY = 'העברות כספים';
const OTHER_INCOME_CATEGORY = 'הכנסה אחרת';

let merchantIndex: [string, string][] | null = null;
function buildMerchantIndex(): [string, string][] {
  const pairs: [string, string][] = [];
  for (const [category, merchants] of Object.entries(CATEGORY_BY_MERCHANT)) {
    for (const m of merchants) pairs.push([normKey(m), category]);
  }
  return pairs.sort((a, b) => b[0].length - a[0].length); // ארוך קודם, ראו merchants.ts
}

/** שם קטגוריה משוער מהמילון המובנה, או null — ראו merchants.ts:guessCategoryName. */
function guessCategoryName(description: string, kind: 'expense' | 'income'): string | null {
  const key = normKey(description);
  const isMoneyApp = MONEY_APP_PATTERNS.some((re) => re.test(key));
  if (isMoneyApp) return kind === 'income' ? OTHER_INCOME_CATEGORY : MONEY_TRANSFER_CATEGORY;
  if (GENERIC_TRANSFER_PATTERNS.some((p) => key.includes(p))) return null;
  if (!key) return null;
  merchantIndex ??= buildMerchantIndex();
  for (const [pattern, category] of merchantIndex) {
    if (pattern && key.includes(pattern)) return category;
  }
  return null;
}

/**
 * קטגוריה מוצעת: קודם כלל שהמשתמש לימד (import_rules), אחר כך המילון
 * המובנה — אותו סדר עדיפות כמו matchCategory בייבוא הידני.
 */
function suggestCategory(
  description: string,
  kind: 'expense' | 'income',
  rules: { pattern: string; category_id: string }[],
  categoryKindById: Map<string, 'expense' | 'income'>,
  categoryIdByName: Map<string, string>,
): string | null {
  const byRule = matchCategoryByRule(description, kind, rules, categoryKindById);
  if (byRule) return byRule;
  const guessedName = guessCategoryName(description, kind);
  if (!guessedName) return null;
  return categoryIdByName.get(normKey(guessedName)) ?? null;
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

    // ── קטגוריה מוצעת: import_rules קודם, מילון מובנה כגיבוי ─────────────────
    const [{ data: categories }, { data: rules }] = await Promise.all([
      db.from('categories').select('id, name, kind').eq('household_id', householdId),
      db.from('import_rules').select('pattern, category_id').eq('household_id', householdId),
    ]);
    const categoryKindById = new Map((categories ?? []).map((c) => [c.id as string, c.kind as 'expense' | 'income']));
    const categoryIdByName = new Map((categories ?? []).map((c) => [normKey(c.name as string), c.id as string]));

    const rows = txs
      .filter((t) => t.external_id && t.occurred_on && Number.isFinite(t.amount_agorot) && t.amount_agorot > 0)
      .map((t) => {
        const key = signature(t.occurred_on, t.amount_agorot, t.description ?? '');
        const possibleDuplicate = (existingCounts.get(key) ?? 0) > 0;
        const suggestedCategoryId = suggestCategory(
          t.description ?? '', t.kind, rules ?? [], categoryKindById, categoryIdByName,
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
