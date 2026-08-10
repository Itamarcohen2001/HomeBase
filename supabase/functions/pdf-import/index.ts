// Supabase Edge Function — פענוח PDF (דוח בנק/אשראי) עם Gemini.
//
// 🔴 **למה זה חייב לרוץ כאן ולא בקליינט.** src/lib/import/pdf.ts קרא ל-Gemini
//    ישירות מהדפדפן עם מפתח שהוגדר כ-EXPO_PUBLIC_GEMINI_API_KEY — כל
//    EXPO_PUBLIC_* נארז לתוך באנדל ה-JS הציבורי. כל מי שנכנס לאתר יכול לפתוח
//    DevTools, לשלוף את המפתח, ולהשתמש בו על חשבון ה-Google Cloud של המשתמש —
//    לא רק דליפת מידע, חשיפה כספית ישירה (Gemini מחויב לפי שימוש). הפונקציה
//    הזו מעבירה את הקריאה לצד השרת, בדיוק כמו market-data ל-API של הבורסה.
//
// פריסה:
//   supabase functions deploy pdf-import
//   supabase secrets set GEMINI_API_KEY=<המפתח מ-https://aistudio.google.com>
//
// קלט: { base64: string, fileName: string }  — ה-PDF כבר מקודד ב-base64
// בצד הלקוח (זה לא סוד, אין טעם לשלוח קובץ גולמי כשאפשר טקסט).
// פלט: אותה צורת ParseResult ש-src/lib/import/pdf.ts כבר בנה בעצמו קודם.

// @ts-nocheck
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const PROMPT = `
You are an expert financial data extractor. I am providing you with a PDF of a credit card or bank statement from Israel.
Extract all the transaction rows and the statement totals.

Return ONLY a valid JSON object with the following exact structure, with no markdown formatting, no code blocks, and no other text:
{
  "source": "Name of the bank or credit card company (e.g., Max, Isracard, Cal, Hapoalim)",
  "statementKind": "credit_report",
  "accountRef": { "kind": "card_last_4", "ref": "Last 4 digits of the card if found, otherwise null" },
  "statedTotal": The total amount charged or total balance specified in the document (number),
  "statementDate": "YYYY-MM-DD" of the statement or report date,
  "rows": [
    {
      "date": "YYYY-MM-DD",
      "description": "Name of the business or transaction",
      "amount": amount in ILS as a positive number,
      "isRefund": true if this is a refund/credit, false if it is a charge/expense,
      "isCardCharge": true
    }
  ]
}

Notes:
- If the document is a bank statement (עו"ש) and not a credit card, set statementKind to "bank_account" and isCardCharge to false.
- Pay attention to Israeli dates (DD/MM/YYYY or DD/MM/YY) and convert them to YYYY-MM-DD.
- If you cannot find a statedTotal, set it to null.
- Ignore summary rows or internal transfers that are not real transactions.
- Return ONLY the JSON object.
`;

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const apiKey = Deno.env.get('GEMINI_API_KEY');
    if (!apiKey) throw new Error('GEMINI_API_KEY לא מוגדר בפרויקט');

    const body = await req.json().catch(() => ({}));
    const base64String = typeof body.base64 === 'string' ? body.base64 : '';
    if (!base64String) return json({ error: 'לא צורף קובץ' }, 400);

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${apiKey}`;
    const requestBody = {
      contents: [
        {
          parts: [
            { text: PROMPT },
            { inlineData: { mimeType: 'application/pdf', data: base64String } },
          ],
        },
      ],
      generationConfig: { temperature: 0.1, responseMimeType: 'application/json' },
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini API: ${response.status} ${errText.slice(0, 300)}`);
    }

    const result = await response.json();
    const textResponse = result.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!textResponse) throw new Error('ה-AI לא החזיר תשובה קריאה');

    let parsedData;
    try {
      const cleanText = textResponse.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();
      parsedData = JSON.parse(cleanText);
    } catch {
      throw new Error('פענוח הנתונים נכשל — ה-AI החזיר פורמט לא תקין');
    }

    if (!parsedData.rows || !Array.isArray(parsedData.rows)) {
      throw new Error('ה-AI לא מצא תנועות במסמך');
    }

    const parsedTotal = parsedData.rows.reduce(
      (sum: number, r: any) => sum + (r.isRefund ? -r.amount : r.amount),
      0,
    );

    return json({
      source: parsedData.source || 'דוח אשראי',
      statementKind: parsedData.statementKind || 'credit_report',
      accountRef: parsedData.accountRef || null,
      statedTotal: parsedData.statedTotal ?? null,
      parsedTotal,
      statementDate: parsedData.statementDate || null,
      chargeDate: null,
      rows: parsedData.rows,
      notes: ['הנתונים פוענחו באמצעות AI (Gemini). מומלץ לוודא שהתאריכים והסכומים נקראו נכון.'],
    });
  } catch (e) {
    return json({ error: 'פענוח ה-PDF נכשל.', detail: String(e?.message ?? e) }, 500);
  }
});
