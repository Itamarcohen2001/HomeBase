import { ImportError, type ParseResult, type ParsedRow } from './shared';

export async function parsePDFWithGemini(data: ArrayBuffer | Uint8Array, fileName: string): Promise<ParseResult> {
  const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
  if (!apiKey) {
    throw new ImportError('לא הוגדר מפתח Gemini API במערכת. יש להוסיף EXPO_PUBLIC_GEMINI_API_KEY לקובץ ה-.env כדי לייבא מסמכי PDF.');
  }

  // Convert ArrayBuffer to Base64
  let base64String = '';
  const bytes = new Uint8Array(data);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    base64String += String.fromCharCode(bytes[i]);
  }
  base64String = btoa(base64String);

  // Note: We use the REST API directly to avoid dealing with specific fetch/Node polyfills in the SDK across React Native and Web.
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

  const prompt = `
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

  const requestBody = {
    contents: [
      {
        parts: [
          { text: prompt },
          {
            inlineData: {
              mimeType: 'application/pdf',
              data: base64String,
            },
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: "application/json",
    },
  };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error('Gemini API Error:', errText);
    throw new ImportError('שגיאה בתקשורת עם שרת ה-AI. יש לוודא שהמפתח תקין ויש חיבור לאינטרנט.');
  }

  const result = await response.json();
  const textResponse = result.candidates?.[0]?.content?.parts?.[0]?.text;
  
  if (!textResponse) {
    throw new ImportError('ה-AI לא החזיר תשובה קריאה.');
  }

  let parsedData: any;
  try {
    const cleanText = textResponse.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();
    parsedData = JSON.parse(cleanText);
  } catch (e) {
    console.error('Failed to parse Gemini JSON:', textResponse);
    throw new ImportError('פענוח הנתונים נכשל. ה-AI החזיר פורמט לא תקין.');
  }

  if (!parsedData.rows || !Array.isArray(parsedData.rows)) {
    throw new ImportError('ה-AI לא מצא תנועות במסמך.');
  }

  const parsedTotal = parsedData.rows.reduce((sum: number, r: any) => {
    return sum + (r.isRefund ? -r.amount : r.amount);
  }, 0);

  return {
    source: parsedData.source || 'דוח אשראי',
    statementKind: parsedData.statementKind || 'credit_report',
    accountRef: parsedData.accountRef || null,
    statedTotal: parsedData.statedTotal ?? null,
    parsedTotal: parsedTotal,
    statementDate: parsedData.statementDate || null,
    chargeDate: null,
    rows: parsedData.rows,
    notes: ['הנתונים פוענחו באמצעות AI (Gemini). מומלץ לוודא שהתאריכים והסכומים נקראו נכון.'],
  };
}
