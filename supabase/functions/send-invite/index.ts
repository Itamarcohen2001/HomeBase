// Supabase Edge Function — שליחת מייל הזמנה לבן/בת זוג
//
// פריסה:
//   supabase functions deploy send-invite
//   supabase secrets set RESEND_API_KEY=... INVITE_FROM="HomeBase <noreply@yourdomain.com>"
//
// אם הפונקציה לא נפרסה, האפליקציה תציע לשתף את ההזמנה ידנית.

// @ts-nocheck
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const { email, household_name, inviter_name } = await req.json();
    const apiKey = Deno.env.get('RESEND_API_KEY');
    if (!apiKey) throw new Error('RESEND_API_KEY is not configured');

    const html = `
      <div dir="rtl" style="font-family:Arial,Helvetica,sans-serif;color:#12211B">
        <h2>הוזמנת ל-HomeBase</h2>
        <p>${inviter_name || 'בן/בת הזוג שלך'} הזמין אותך להצטרף למשק הבית
        <strong>${household_name}</strong> באפליקציית HomeBase — מעקב הוצאות משק בית משותף.</p>
        <p>כדי להצטרף: הורידו את האפליקציה, הירשמו עם כתובת המייל הזו (${email}),
        וההזמנה תחכה לכם במסך הפתיחה.</p>
        <p style="color:#6B7A73;font-size:13px">אם לא ציפית להזמנה הזו אפשר להתעלם מהמייל.</p>
      </div>`;

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: Deno.env.get('INVITE_FROM') ?? 'HomeBase <onboarding@resend.dev>',
        to: [email],
        subject: `הוזמנת למשק הבית "${household_name}" ב-HomeBase`,
        html,
      }),
    });

    if (!res.ok) throw new Error(await res.text());

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 400,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
