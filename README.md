# HomeBase 🏠

אפליקציית מעקב הוצאות למשק בית משותף — Expo + React Native + TypeScript + Supabase.
ממשק בעברית מלאה (RTL) עם שקלים (₪).

## מה יש באפליקציה

- **מסך בית** — כמה נשאר לי החודש (המספר הגדול), התקדמות לפי קטגוריות, כפתור גדול להוספת הוצאה
- **הוספה מהירה** — סכום + קטגוריה בלבד. תאריך = היום, "מי" = המשתמש המחובר. הערה ותאריך מותאם מתחת ל"עוד"
- **משק בית משותף** — כל ההוצאות בקופה אחת, עם תווית מי רשם כל תנועה
- **הזמנת בן/בת זוג** לפי כתובת מייל
- **אימות** — מייל+סיסמה וגם Google
- **קטגוריות** — seed בעברית עם אייקון וצבע, ניתנות להוספה/עריכה/מחיקה
- **יעדים** — יעד לכל קטגוריה + יעד כללי לחודש, מתגלגלים אוטומטית לחודש הבא
- **הכנסות** — יתרה חודשית ואחוז חיסכון
- **הוצאות קבועות** — נרשמות אוטומטית כל חודש ביום שנבחר, עם אפשרות לכבות
- **היסטוריה** — כל התנועות לפי חודש, עם עריכה ומחיקה
- **חיבור בנקים** — סנכרון אוטומטי מהבנק דרך סוכן מקומי (`bank-sync/`,
  ראו שם README נפרד), עם תור אישור למסך "חיבור בנקים" לפני שתנועה
  שנגרדה נכנסת להיסטוריה. הסיסמאות לא עוזבות את המחשב המקומי

## הרצה

```bash
npm install
cp .env.example .env    # ומלאו את המפתחות (ראו למטה)
npx expo start
```

סורקים את ה-QR עם אפליקציית **Expo Go** ב-iOS או Android.

## הגדרת Supabase

1. פותחים פרויקט חדש ב-[supabase.com](https://supabase.com).
2. **SQL Editor → New query** → מדביקים את **כל** התוכן של `supabase/setup.sql` ולוחצים **Run**.
   (הקובץ מאחד את שלוש המיגרציות שב-`supabase/migrations/` ובטוח להרצה חוזרת.)
   אפשר גם להריץ את הקבצים בנפרד לפי הסדר:
   - `0001_schema.sql` — טבלאות
   - `0002_rls.sql` — RLS, פוליסי ופונקציות עזר (security definer, למניעת רקורסיה)
   - `0003_functions.sql` — RPC: יצירת משק בית, seed קטגוריות, הזמנות, גלגול יעדים, הרצת קבועות
3. **Project Settings → API** → מעתיקים את `Project URL` ואת המפתח הציבורי לקובץ `.env`:

   ```
   EXPO_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...
   ```

   > עובד גם עם מפתח מהדור החדש (`sb_publishable_...`) וגם עם `anon key` ישן בפורמט `eyJ...`.

4. מפעילים מחדש את השרת: `npx expo start -c`

### אימות מייל

כברירת מחדל Supabase דורש אישור כתובת מייל לפני התחברות ראשונה.
לפיתוח נוח אפשר לכבות זאת ב-**Authentication → Sign In / Providers → Email → Confirm email**.

### התחברות עם Google

**Authentication → Providers → Google** — מפעילים ומזינים Client ID / Secret מ-Google Cloud Console.
תחת **URL Configuration → Redirect URLs** מוסיפים את הסכמה של האפליקציה:

```
homebase://auth-callback
exp://127.0.0.1:8081/--/auth-callback
```

(בזמן פיתוח ב-Expo Go, הכתובת השנייה משתנה לפי ה-IP שמוצג בטרמינל.)

### שליחת מייל הזמנה (אופציונלי)

הזמנות נשמרות תמיד בדאטהבייס וממתינות למוזמן בהתחברות הראשונה.
לשליחת מייל בפועל פורסים את ה-Edge Function:

```bash
supabase functions deploy send-invite
supabase secrets set RESEND_API_KEY=...
```

אם הפונקציה לא פרוסה — האפליקציה תציע לשתף את ההזמנה ידנית (WhatsApp וכו').

### חיבור בנקים (אופציונלי)

כדי שמסך "חיבור בנקים" יעבוד צריך לפרוס עוד Edge Function ולהגדיר סוד:

```bash
supabase functions deploy bank-sync-ingest
supabase secrets set BANK_SYNC_INGEST_SECRET=<ערך אקראי ארוך משלכם>
```

הגירוד בפועל (חיבור לאתר הבנק) רץ מחוץ ל-Supabase, בסוכן מקומי נפרד —
ראו `bank-sync/README.md` להתקנה והגדרה מלאה.

## מבנה הפרויקט

```
app/                    מסכים (expo-router)
  (auth)/               התחברות והרשמה
  (tabs)/               בית, תנועות, יעדים, עוד
  add.tsx               הוספה מהירה
  categories.tsx        ניהול קטגוריות
  recurring.tsx         הוצאות קבועות
  members.tsx           בני הבית והזמנות
  settings.tsx          הגדרות
  setup.tsx             יצירה/הצטרפות למשק בית
  connect-bank.tsx       חיבורי בנק + תור אישור לתנועות שנגרדו
src/
  theme.ts              ערכת עיצוב (צבעים, מרווחים, צללים, RTL)
  ui/                   רכיבים משותפים
  lib/                  supabase, טיפוסים, פורמט, שכבת גישה לנתונים
  context/              auth + משק בית
  hooks/                טעינת נתוני חודש
supabase/
  setup.sql             כל ה-SQL בקובץ אחד להדבקה בדשבורד
  migrations/           SQL כולל RLS ו-seed
  functions/send-invite       Edge Function לשליחת הזמנות
  functions/bank-sync-ingest  Edge Function שקולטת תנועות מהסוכן המקומי
bank-sync/              סוכן מקומי (Node, לא חלק מהאתר) — ראו README נפרד
```

## הערות טכניות

- כל הסכומים נשמרים כמספרים שלמים **באגורות** (`bigint`) — אין שימוש ב-float.
- RLS פעיל על כל טבלה; משתמש רואה רק נתונים של משקי הבית שהוא חבר בהם.
- הפוליסי של `household_members` משתמש בפונקציית `security definer` כדי למנוע רקורסיה אינסופית.
- Multi-tenant אמיתי — כל משתמש עם משק הבית שלו, וניתן להיות חבר בכמה.
- אין תמיכת offline ואין התראות push בשלב הזה.
