# bank-sync — סוכן סנכרון בנקים מקומי

תיקייה עצמאית, **לא חלק מהאפליקציה/מהאתר**. רצה במחשב הזה (Windows) בלבד,
מתחברת לבנקים שלך עם `israeli-bank-scrapers` ושולחת תנועות ל-Edge Function
`bank-sync-ingest` בפרויקט ה-Supabase. **סיסמאות הבנק לא עוזבות את המחשב
הזה** — הן מוצפנות מקומית (DPAPI, קשור למשתמש ה-Windows הנוכחי) ולעולם לא
נשלחות לשום מקום.

זרימה מלאה מתועדת בתוכנית: `app/connect-bank.tsx` באפליקציה יוצר את
ה"חיבור" (מטא-דאטה בלבד) ומציג את פקודת ההגדרה המדויקת להעתקה.

## התקנה (חד-פעמית)

דורש Node.js גרסה 22.22.2 ומעלה (`node --version` לבדיקה) — זו הדרישה של
`israeli-bank-scrapers` עצמה.

```bash
cd bank-sync
npm install
copy config.example.json config.json
```

לערוך את `config.json`:

- `supabaseUrl` — אותו ערך כמו `EXPO_PUBLIC_SUPABASE_URL` ב-`.env` הראשי.
- `supabaseAnonKey` — אותו ערך כמו `EXPO_PUBLIC_SUPABASE_ANON_KEY`. זה מפתח
  ציבורי (כבר חשוף בבאנדל של האתר) — לא סיסמה, לא service role.
- `ingestSecret` — סוד חדש, ארוך ואקראי, שאתה בוחר. חייב להיות **זהה**
  למה שהוגדר בצד Supabase עם:
  ```bash
  supabase functions deploy bank-sync-ingest
  supabase secrets set BANK_SYNC_INGEST_SECRET=<אותו ערך בדיוק>
  ```

## הוספת בנק

1. באפליקציה: "עוד" ← "חיבור בנקים" ← "הוספת בנק" ← בוחרים מוסד ויוצרים
   חיבור. המסך מציג פקודה כמו:
   ```bash
   node setup.js <connection_id> <institution>
   ```
2. מריצים אותה כאן (בתיקיית `bank-sync/`). היא שואלת שם משתמש/סיסמה (לפי
   מה שהמוסד דורש) ושומרת אותם מוצפנים ב-`secrets/<connection_id>.enc`.
   שום דבר לא נשלח לשום מקום בשלב הזה.
3. בדיקה ידנית מיידית: `npm run sync` — רץ על כל החיבורים המוגדרים, כותב
   תוצאה ל-`logs/sync-<תאריך>.log`, ושולח את התנועות ל-Edge Function.
4. באפליקציה, מתחת ל"חיבור בנקים", תופענה תנועות חדשות תחת **"תנועות
   לאישור"** — שם מאשרים/דוחים כל תנועה לפני שהיא נכנסת להיסטוריה.

## הרצה אוטומטית יומית

```powershell
.\register-task.ps1
```

רושם משימה ב-Windows Task Scheduler שמריצה `node sync.js` כל יום (ברירת
מחדל 06:30, אפשר `-Time "07:30"`), גם אם המחשב היה כבוי בשעה שנקבעה
(רצה בהפעלה הבאה). לא דורש הרשאת מנהל, ורצה רק כשאתה מחובר למחשב — בלי
לשמור את סיסמת ה-Windows במשימה עצמה.

ביטול: `Unregister-ScheduledTask -TaskName "HomeBase Bank Sync" -Confirm:$false`

## הסרת בנק

באפליקציה: מחיקת החיבור (מוחקת רק את המטא-דאטה בצד השרת — מפסיקה
סנכרון עתידי, לא מוחקת תנועות שכבר אושרו). בנוסף, כאן:

```bash
node setup.js remove <connection_id>
```

מוחק את פרטי ההתחברות המוצפנים מהמחשב הזה.

## פקודות שימושיות

```bash
node setup.js list        # אילו connection_id יש להם קרדנצ'לס מקומיים
npm run sync               # הרצה ידנית מיידית (בלי לחכות למשימה המתוזמנת)
```

## הערות אבטחה

- ה-DPAPI encryption קשור למשתמש ה-Windows **הנוכחי בלבד** — קובץ
  `.enc` שהועתק למחשב אחר, או שנקרא ע"י משתמש Windows אחר, לא ניתן
  לפענוח שם.
- `ingestSecret` הוא לא מפתח ה-service role של Supabase — הוא סוד נפרד,
  ייעודי לפונקציה הזו בלבד. דליפה שלו (למשל אם המחשב נגנב) לא נותנת גישה
  ל-DB, רק אפשרות לשלוח תנועות מזויפות לתור האישור — שעדיין עובר אישור
  ידני לפני שהוא נכנס לתקציב.
- `secrets/`, `logs/` ו-`config.json` נמצאים ב-`.gitignore` הראשי — אף
  פעם לא מגיעים ל-git.
