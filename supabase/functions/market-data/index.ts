// Supabase Edge Function — מחירי שוק לחישוב שווי נטו.
//
// למה Edge Function ולא קריאה מהדפדפן: ל-API של הבורסה אין CORS, ולכן
// קריאה ישירה מהאפליקציה נחסמת. בנוסף, `security_prices` ו-`fx_rates`
// הן טבלאות גלובליות ללא פוליסי כתיבה — רק service_role יכול לכתוב אליהן.
//
// פריסה:
//   supabase functions deploy market-data
//
// רענון יומי (pg_cron + pg_net). להריץ ב-SQL Editor, עם הערכים שלכם —
// המפתח לא נשמר בקוד:
//   create extension if not exists pg_cron;
//   create extension if not exists pg_net;
//   select cron.schedule('refresh-prices', '30 16 * * 0-4', $$
//     select net.http_post(
//       url     := 'https://<PROJECT>.supabase.co/functions/v1/market-data',
//       headers := jsonb_build_object(
//                    'Content-Type','application/json',
//                    'Authorization','Bearer <SERVICE_ROLE_KEY>'),
//       body    := jsonb_build_object('action','refresh')
//     );
//   $$);
//
// פעולות:
//   { action: 'refresh' }                      — מתמחר כל נייר שמוחזק בפועל
//   { action: 'search', query: 'לאומי' }        — חיפוש בקטלוג הבורסה
//   { action: 'resolve', external_id, price_feed } — מוסיף נייר לקטלוג המקומי

// @ts-nocheck
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  fetchCatalog,
  fetchFxToIls,
  priceSecurities,
  searchCatalog,
} from '../_shared/pricing.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

// 🪤 הקטלוג הוא מעל 11,000 שורות בקריאה אחת, והפרמטר `q` שלו מתעלם.
//    שומרים אותו בזיכרון המופע ומרעננים פעם ביום.
let catalogCache: { at: number; entries: Awaited<ReturnType<typeof fetchCatalog>> } | null = null;
const CATALOG_TTL_MS = 12 * 60 * 60 * 1000;

async function getCatalog() {
  if (catalogCache && Date.now() - catalogCache.at < CATALOG_TTL_MS) return catalogCache.entries;
  const entries = await fetchCatalog(fetch);
  if (entries.length) catalogCache = { at: Date.now(), entries };
  return entries;
}

function admin() {
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } },
  );
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action ?? 'refresh';

    if (action === 'search') {
      const entries = await getCatalog();
      if (!entries.length) {
        return json({ error: 'לא הצלחנו להגיע לקטלוג הבורסה כרגע. נסו שוב בעוד רגע.' }, 502);
      }
      return json({ results: searchCatalog(entries, String(body.query ?? ''), 25) });
    }

    if (action === 'resolve') {
      const entries = await getCatalog();
      const found = entries.find(
        (e) => e.external_id === String(body.external_id ?? '') && e.price_feed === body.price_feed,
      );
      const entry = found ?? {
        external_id: String(body.external_id ?? ''),
        price_feed: body.price_feed ?? 'yahoo',
        name: String(body.name ?? body.external_id ?? ''),
        symbol: null,
        isin: null,
        category: null,
      };
      if (!entry.external_id) return json({ error: 'לא צוין מזהה נייר.' }, 400);

      const db = admin();
      const { data, error } = await db
        .from('securities')
        .upsert(
          {
            external_id: entry.external_id,
            price_feed: entry.price_feed,
            name: entry.name,
            symbol: entry.symbol,
            isin: entry.isin,
            quote_currency: entry.price_feed === 'yahoo' ? 'USD' : 'ILA',
          },
          { onConflict: 'external_id,price_feed' },
        )
        .select('id, external_id, price_feed, name, symbol')
        .single();
      if (error) throw new Error(error.message);
      return json({ security: data });
    }

    // ── refresh ────────────────────────────────────────────────────────────
    const db = admin();

    // מתמחרים רק ניירות שמוחזקים בפועל — לא את כל הקטלוג.
    const { data: held, error: heldErr } = await db
      .from('holdings')
      .select('security_id, securities!inner (id, external_id, price_feed, quote_currency)');
    if (heldErr) throw new Error(heldErr.message);

    const byId = new Map<string, { id: string; external_id: string; price_feed: string; quote_currency: string }>();
    for (const row of held ?? []) {
      const s = row.securities;
      if (s && !byId.has(s.id)) byId.set(s.id, s);
    }
    const securities = [...byId.values()];

    if (!securities.length) {
      return json({ ok: true, priced: 0, failed: 0, message: 'אין אחזקות לתמחור.' });
    }

    const result = await priceSecurities(securities, fetch);

    if (result.priced.length) {
      const idOf = new Map(securities.map((s) => [`${s.external_id}|${s.price_feed}`, s.id]));
      const rows = result.priced.map((p) => ({
        security_id: idOf.get(`${p.external_id}|${p.price_feed}`),
        price_date: p.price_date,
        stated_rate: p.stated_rate,
        stated_currency: p.stated_currency,
        ils_price_agorot: p.ils_price_agorot,
        fetched_at: new Date().toISOString(),
      }));
      const { error } = await db
        .from('security_prices')
        .upsert(rows, { onConflict: 'security_id,price_date' });
      if (error) throw new Error(error.message);
    }

    const today = new Date().toISOString().slice(0, 10);
    const fxRows = Object.entries(result.fx)
      .filter(([base]) => base !== 'ILS')
      .map(([base, rate]) => ({
        base_currency: base,
        quote_currency: 'ILS',
        rate_date: today,
        rate,
        fetched_at: new Date().toISOString(),
      }));
    if (fxRows.length) {
      const { error } = await db
        .from('fx_rates')
        .upsert(fxRows, { onConflict: 'base_currency,quote_currency,rate_date' });
      if (error) throw new Error(error.message);
    }

    // תצלום יומי — v1 לא מציג גרף, אבל ההיסטוריה נצברת מהיום הראשון
    // כדי שגרף עתידי לא ידרוש מיגרציה.
    const { data: totals } = await db
      .from('net_worth_by_account')
      .select('account_id, household_id, total_agorot');
    if (totals?.length) {
      await db.from('account_snapshots').upsert(
        totals.map((t) => ({
          household_id: t.household_id,
          account_id: t.account_id,
          captured_on: today,
          total_agorot: t.total_agorot,
        })),
        { onConflict: 'account_id,captured_on' },
      );
    }

    return json({
      ok: true,
      priced: result.priced.length,
      failed: result.failed.length,
      fx: result.fx,
    });
  } catch (e) {
    return json({ error: 'רענון המחירים נכשל.', detail: String(e) }, 500);
  }
});
