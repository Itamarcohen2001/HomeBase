/**
 * מסך תיעוד ועזרה בתוך האפליקציה — לא קובץ README בגיטהאב, כדי שגם מי
 * שלא נכנס לקוד יוכל להבין איך המערכת עובדת, בעיקר את זרימת חיבור הבנקים
 * שהיא הכי לא-מובנת-מאליה (יש שם שלב שרץ במחשב, לא רק באתר).
 */
import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { goBack } from '../src/lib/nav';
import { useTheme } from '../src/context/ThemeContext';
import { Body, Card, Divider, H2, H3, Muted, PageHeader, Screen } from '../src/ui';
import { radius, rtlRow, spacing } from '../src/theme';

function Section({ title, icon, children }: { title: string; icon?: string; children: React.ReactNode }) {
  return (
    <Card>
      <H3 style={{ marginBottom: spacing.sm }}>{title}</H3>
      {children}
    </Card>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <Body style={{ marginBottom: spacing.sm }}>{children}</Body>;
}

function Bullet({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={{ ...rtlRow, gap: spacing.sm, alignItems: 'flex-start', marginBottom: spacing.xs }}>
      <Body style={{ color: colors.primary, fontWeight: '700' }}>•</Body>
      <Body style={{ flexShrink: 1 }}>{children}</Body>
    </View>
  );
}

/** בלוק פקודה — אותו עיצוב בדיוק כמו הפקודה שמוצגת ב-connect-bank.tsx. */
function Code({ children }: { children: string }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        backgroundColor: colors.bg,
        borderRadius: radius.sm,
        padding: spacing.md,
        marginBottom: spacing.sm,
      }}
    >
      <Body style={{ fontFamily: 'monospace', fontSize: 13, textAlign: 'left' }}>
        {children}
      </Body>
    </View>
  );
}

export default function Docs() {
  const router = useRouter();
  const { colors } = useTheme();

  return (
    <Screen>
      <PageHeader title="תיעוד ועזרה" onBack={() => goBack(router, '/(tabs)/more')} />

      <H2 style={{ marginBottom: spacing.md }}>איך משתמשים ב-HomeBase</H2>
      <Muted style={{ marginBottom: spacing.lg }}>
        דף אחד עם כל מה שצריך לדעת — מהיסודות ועד חיבור בנקים אוטומטי, שלב אחר שלב.
      </Muted>

      <Section title="🏠 היסודות">
        <P>כל ההוצאות וההכנסות של משק הבית נמצאות במקום אחד, גלויות לכל בני הבית.</P>
        <Bullet>מסך הבית מראה כמה נשאר החודש, לפי היעד שהגדרתם.</Bullet>
        <Bullet>"הוספה מהירה" — סכום + קטגוריה, זהו. תאריך והערה מותאמים אישית נמצאים מתחת ל"עוד" בטופס.</Bullet>
        <Bullet>כל תנועה מתויגת עם מי הוסיף אותה — כדי לדעת מי רשם מה, לא כדי להאשים אף אחד.</Bullet>
        <Bullet>"הוצאה משותפת" מקבלת פרוסה נפרדת בגרפים ("משותף") ולא נזקפת לאדם מסוים.</Bullet>
      </Section>

      <Section title="🎯 תקציבים ויעדים">
        <P>ב"עוד" ← "יעדים" — יעד לכל קטגוריה בנפרד, ויעד כללי לחודש.</P>
        <Bullet>היעדים מתגלגלים אוטומטית לחודש הבא, כל עוד לא שינית אותם ידנית.</Bullet>
        <Bullet>מוחקים יעד לחודש הנוכחי? זה נשאר מחוק — לא חוזר לבד בפעם הבאה שפותחים את האפליקציה.</Bullet>
      </Section>

      <Section title="🔁 הוצאות קבועות">
        <P>שכירות, ארנונה, מנויים — ב"עוד" ← "הוצאות קבועות".</P>
        <Bullet>נרשמות אוטומטית כל חודש, ביום שתבחרו.</Bullet>
        <Bullet>אפשר לקשר לחשבון ספציפי (מ"שווי נטו") כדי שהיתרה שלו תתעדכן אוטומטית כשההוצאה נרשמת.</Bullet>
        <Bullet>אפשר לכבות זמנית בלי למחוק — "לא פעיל" שומר את ההגדרות למקרה שתרצו להפעיל שוב.</Bullet>
      </Section>

      <Section title="👥 משק בית משותף">
        <P>ב"עוד" ← "בני הבית" — מזמינים בן/בת זוג לפי כתובת מייל.</P>
        <Bullet>מי שנרשם עם אותה כתובת מייל מצטרף אוטומטית למשק הבית.</Bullet>
        <Bullet>אפשר להיות חברים בכמה משקי בית ולעבור ביניהם.</Bullet>
      </Section>

      <Section title="💰 שווי נטו וחשבונות">
        <P>ב"עוד" ← "שווי נטו" (וגם כטאב נפרד בסרגל התחתון) — כל החשבונות שלכם (בנק, השקעות, מזומן) במקום אחד.</P>
        <Bullet>יתרת חשבון בנק/מזומן מתעדכנת <Body style={{ fontWeight: '700' }}>אוטומטית וחיה</Body> בכל תנועה שנרשמת עליו — לא צריך לעדכן ידנית שוב אחרי ההקלדה הראשונית.</Bullet>
        <Bullet>חשבון השקעות: מוסיפים ניירות ערך מתוך חיפוש בקטלוג הבורסה, או מייבאים קובץ אחזקות מהברוקר.</Bullet>
        <Bullet>לא בשימוש? "ארכוב" בעיפרון ליד שם החשבון (במסך פרטי החשבון) — לא מוחק היסטוריה, רק מסיר מהתצוגה.</Bullet>
      </Section>

      <Section title="📄 ייבוא מהבנק — קובץ">
        <P>ב"עוד" ← "ייבוא מהבנק" — מעלים קובץ Excel/CSV/PDF שהורדתם מהבנק/מהכרטיס.</P>
        <Bullet>המערכת מזהה כפילויות מול מה שכבר קיים, ומציעה קטגוריה לפי מה שלמדה מכם בעבר.</Bullet>
        <Bullet>ייבוא PDF משתמש ב-AI (Gemini) לקריאת הדוח — כדאי לבדוק שהתאריכים והסכומים נקראו נכון לפני האישור.</Bullet>
        <Bullet>שום תנועה לא נכנסת להיסטוריה בלי שתאשרו אותה במסך הסקירה.</Bullet>
      </Section>

      <Divider />

      <H2 style={{ marginBottom: spacing.sm }}>🏦 חיבור בנקים אוטומטי — המדריך המלא</H2>
      <Muted style={{ marginBottom: spacing.md }}>
        זה הפיצ'ר הכי חזק באפליקציה, וגם היחיד שדורש כמה דקות הגדרה **במחשב שלכם**, לא רק באתר.
        הסיבה: התחברות אמיתית לאתר של בנק חייבת דפדפן אמיתי — משהו שהאתר עצמו, מטבעו, לא יכול
        להריץ. לכן הסיסמה שלכם לעולם לא מגיעה לכאן, לענן, או לכל מקום חוץ מהמחשב שלכם.
      </Muted>

      <Section title="למה זה עובד ככה (ולא בלחיצת כפתור)">
        <P>שלוש עובדות שקובעות את כל התכנון:</P>
        <Bullet>חיבור לבנק ישראלי אמיתי הוא "גירוד מסך" — דפדפן שמתחבר לאתר הבנק בדיוק כמוכם.</Bullet>
        <Bullet>לאתר הזה (Expo) אין שרת שיכול להריץ דפדפן. יש רק Supabase — שגם הוא לא יכול.</Bullet>
        <Bullet>
          לכן ההתחברות בפועל קורית על <Body style={{ fontWeight: '700' }}>המחשב שלכם</Body>, בתיקיית{' '}
          <Body style={{ fontFamily: 'monospace' }}>bank-sync/</Body> בפרויקט — לא באתר.
        </Bullet>
      </Section>

      <Section title="שלב 1 — יצירת חיבור באתר">
        <Bullet>"עוד" ← "חיבור בנקים" ← "הוספת בנק"</Bullet>
        <Bullet>בוחרים מוסד (בנק או חברת אשראי) ובוחרים לאיזה חשבון (מ"שווי נטו") התנועות שלו ייזקפו — חובה, אחרת אי אפשר לאשר תנועות ממנו בהמשך.</Bullet>
        <Bullet>המסך יציג פקודה בפורמט <Body style={{ fontFamily: 'monospace' }}>node setup.js ‎&lt;מזהה&gt; ‎&lt;מוסד&gt;</Body> — זו הפקודה לשלב הבא.</Bullet>
      </Section>

      <Section title="שלב 2 — התקנה חד-פעמית במחשב">
        <P>בתיקיית הפרויקט, פותחים טרמינל בתיקיית <Body style={{ fontFamily: 'monospace' }}>bank-sync/</Body>:</P>
        <Code>{`cd bank-sync\nnpm install\ncopy config.example.json config.json`}</Code>
        <P>ואז פותחים את <Body style={{ fontFamily: 'monospace' }}>bank-sync/config.json</Body> בעורך טקסט וממלאים:</P>
        <Bullet><Body style={{ fontFamily: 'monospace' }}>supabaseUrl</Body> — אותו ערך כמו ב-.env הראשי של הפרויקט</Bullet>
        <Bullet><Body style={{ fontFamily: 'monospace' }}>supabaseAnonKey</Body> — אותו דבר, המפתח הציבורי</Bullet>
        <Bullet><Body style={{ fontFamily: 'monospace' }}>ingestSecret</Body> — הסוד שהוגדר ב-Supabase (BANK_SYNC_INGEST_SECRET)</Bullet>
        <P>שלב חד-פעמי לכל המחשב — לא חוזרים עליו לכל בנק.</P>
      </Section>

      <Section title="שלב 3 — הזנת פרטי ההתחברות לבנק">
        <P>מריצים את הפקודה המדויקת שהאתר הציג בשלב 1, למשל:</P>
        <Code>node setup.js 8ff65360-ad2b-4d40-aef6-fcab33ba1147 hapoalim</Code>
        <P>מזינים שם משתמש וסיסמה — בדיוק כמו באתר הבנק עצמו. הפרטים מוצפנים ונשמרים רק במחשב הזה (DPAPI, קשור למשתמש Windows הנוכחי) — לא נשלחים לשום מקום.</P>
      </Section>

      <Section title="שלב 4 — בדיקה ואישור">
        <Code>npm run sync</Code>
        <P>מריץ סנכרון מיידי לכל הבנקים המוגדרים. חוזרים לאתר, "חיבור בנקים" — התנועות החדשות מופיעות תחת "תנועות לאישור". בודקים כל תנועה (תאריך, סכום, קטגוריה מוצעת) ולוחצים אישור/דחייה. שום דבר לא נכנס להיסטוריה בלי אישור מפורש.</P>
      </Section>

      <Section title="שלב 5 — הפעלה אוטומטית">
        <P>כדי שזה יקרה לבד, בלי להריץ פקודות כל יום — ב-PowerShell (בתיקיית bank-sync/):</P>
        <Code>.\register-task.ps1</Code>
        <P>רושם הרצה יומית אוטומטית (06:30 כברירת מחדל). בנוסף, כפתור <Body style={{ fontWeight: '700' }}>"סנכרון עכשיו"</Body> ליד כל חיבור באתר מאפשר לבקש סנכרון מיידי — כדי שהמחשב יתפוס בקשות כאלה תוך דקות, צריך גם:</P>
        <Code>.\register-poll-task.ps1</Code>
        <P>(שני הסקריפטים דורשים PowerShell כמנהל אם כבר יש משימה קיימת עם אותו שם — "Run as Administrator".)</P>
      </Section>

      <Section title="הרצה על יותר ממחשב אחד">
        <P>
          אפשר להריץ את הסנכרון על כמה מחשבים במקביל — למשל כל בן זוג מריץ במחשב שלו. הפרטים
          המוצפנים (DPAPI) לא ניתנים להעתקה בין מחשבים, אז לכל מחשב עושים{' '}
          <Body style={{ fontFamily: 'monospace' }}>node setup.js</Body> בנפרד.
        </P>
        <Bullet>
          <Body style={{ fontWeight: '700' }}>לחלק בין המחשבים לפי חיבור, לא להריץ את אותו חיבור בשניים: </Body>
          כל מחשב מסנכרן רק את החיבורים שהרצתם עליהם{' '}
          <Body style={{ fontFamily: 'monospace' }}>setup.js</Body> באופן מקומי — אז פשוט
          מחליטים איזה בנק/כרטיס שייך לאיזה מחשב, ומריצים עליו רק את ה-setup של החיבורים שלו.
        </Bullet>
        <Bullet>
          <Body style={{ fontWeight: '700' }}>למה לא כדאי כפילות: </Body>
          תנועות כפולות לא ייכנסו פעמיים (יש זיהוי כפילות), אבל שני דפדפנים שמתחברים
          במקביל לאותו בנק מיותר ומעלה סיכוי לחסימה זמנית מהבנק.
        </Bullet>
        <Bullet>
          כפתור <Body style={{ fontWeight: '700' }}>"סנכרון עכשיו"</Body> עובד אוטומטית נכון גם
          כשיש כמה מחשבים — כל מחשב בודק רק את החיבורים שהוא אחראי עליהם, אז הבקשה תתפס
          ע"י המחשב הנכון בלבד.
        </Bullet>
      </Section>

      <Section title="בעיות נפוצות">
        <Bullet>
          <Body style={{ fontWeight: '700' }}>הבנק מבקש קוד מ-SMS: </Body>
          <Body style={{ fontFamily: 'monospace' }}>node login.js ‎&lt;מזהה&gt;</Body> פותח דפדפן גלוי להזנת הקוד ידנית פעם אחת — לפעמים זה "מלמד" את הבנק לזכור את המחשב.
        </Bullet>
        <Bullet>
          <Body style={{ fontWeight: '700' }}>הבנק דורש החלפת סיסמה: </Body>
          מחליפים סיסמה באתר הבנק הרגיל, ואז מריצים שוב <Body style={{ fontFamily: 'monospace' }}>node setup.js</Body> עם הפרטים החדשים.
        </Bullet>
        <Bullet>
          <Body style={{ fontWeight: '700' }}>מחברים גם בנק וגם כרטיס אשראי לאותו חשבון: </Body>
          דוח הבנק כולל שורת חיוב מרוכזת לכרטיס — אם הכרטיס גם מחובר, לדחות את השורה המרוכזת מהבנק בתור האישור (לא לאשר), כדי לא לספור את אותו כסף פעמיים.
        </Bullet>
      </Section>

      <Divider />

      <Section title="🔒 אבטחה, בקצרה">
        <Bullet>סיסמת בנק לעולם לא מגיעה לאתר או ל-Supabase — נשארת מוצפנת (DPAPI) על המחשב שביצע את ההגדרה.</Bullet>
        <Bullet>סיסמת ההתחברות ל-HomeBase עצמו מנוהלת לגמרי ע"י Supabase Auth — לא נשמרת בקוד של האפליקציה.</Bullet>
        <Bullet>כל תנועה שנגרדת עוברת תור אישור ידני — אף פעם לא נכנסת לתקציב לבד.</Bullet>
        <Bullet>כל טבלה מוגנת כך שמשתמש רואה רק נתונים של משקי הבית שהוא חבר בהם.</Bullet>
      </Section>

      <View style={{ height: spacing.xl }} />
    </Screen>
  );
}
