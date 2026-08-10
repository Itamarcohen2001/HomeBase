#!/usr/bin/env node
// bank-sync/setup.js — הגדרה חד-פעמית לחיבור בנק אחד.
//
// שומר את פרטי ההתחברות מוצפנים במחשב הזה (DPAPI, ראו lib/crypto.js).
// הפרטים לא נשלחים לשום מקום כאן — רק sync.js, בהרצה מאוחרת יותר, משתמש
// בהם כדי להתחבר לבנק ולשלוח את התנועות (לא את הסיסמה) ל-Edge Function.
//
// שימוש:
//   node setup.js <connection_id> <institution>   — הגדרה/עדכון חיבור
//   node setup.js remove <connection_id>            — מחיקת קרדנצ'לס מקומיים
//   node setup.js list                              — מזהים שיש להם קרדנצ'לס מקומיים
//
// את connection_id ואת institution מקבלים ממסך "חיבור בנקים" באפליקציה —
// שם נוצר החיבור ומוצגת הפקודה המדויקת להעתקה.

const readline = require('readline');
const institutions = require('./lib/institutions');
const { saveCredentials, removeCredentials, listConnectionIds } = require('./lib/crypto');

// קודי מקלדת גולמיים לפי מספר (לא לפי תו) — כך נמנעים מתווי בקרה בלתי
// נראים בקוד המקור עצמו. ENTER=13/10, EOF(Ctrl+D)=4, ETX(Ctrl+C)=3,
// BACKSPACE=8, DEL=127.
const KEY = { ENTER_CR: 13, ENTER_LF: 10, EOF: 4, CTRL_C: 3, BACKSPACE: 8, DEL: 127 };

function ask(rl, question, { hidden = false } = {}) {
  if (!hidden) {
    return new Promise((resolve) => rl.question(question, resolve));
  }
  // הסתרת קלט (סיסמה): אין תמיכה מובנית ב-readline, אז קוראים תווים גולמיים
  // ומציגים * במקומם. עובד רק בטרמינל אינטראקטיבי אמיתי (לא בצנרת/CI).
  return new Promise((resolve) => {
    const stdin = process.stdin;
    let input = '';
    process.stdout.write(question);
    const onData = (chunk) => {
      const code = chunk[0];
      if (code === KEY.ENTER_CR || code === KEY.ENTER_LF || code === KEY.EOF) {
        stdin.removeListener('data', onData);
        stdin.setRawMode?.(false);
        process.stdout.write('\n');
        resolve(input);
        return;
      }
      if (code === KEY.CTRL_C) process.exit(1);
      if (code === KEY.BACKSPACE || code === KEY.DEL) {
        input = input.slice(0, -1);
        return;
      }
      input += chunk.toString('utf8');
      process.stdout.write('*');
    };
    stdin.setRawMode?.(true);
    stdin.resume();
    stdin.on('data', onData);
  });
}

async function main() {
  const [, , cmd, arg2] = process.argv;

  if (cmd === 'list') {
    const ids = listConnectionIds();
    console.log(ids.length ? ids.join('\n') : 'אין חיבורים מוגדרים מקומית.');
    return;
  }

  if (cmd === 'remove') {
    if (!arg2) throw new Error('שימוש: node setup.js remove <connection_id>');
    removeCredentials(arg2);
    console.log(`נמחקו פרטי ההתחברות המקומיים של ${arg2}.`);
    return;
  }

  const connectionId = cmd;
  const institution = arg2;
  if (!connectionId || !institution) {
    console.log('שימוש: node setup.js <connection_id> <institution>');
    console.log('מוסדות נתמכים:', Object.keys(institutions).join(', '));
    process.exit(1);
    return;
  }

  const meta = institutions[institution];
  if (!meta) {
    console.log(`מוסד לא מוכר: ${institution}`);
    console.log('נתמכים:', Object.keys(institutions).join(', '));
    process.exit(1);
    return;
  }

  console.log(`מגדירים חיבור ל${meta.label} (connection_id=${connectionId}).`);
  console.log('הפרטים נשמרים מוצפנים במחשב הזה בלבד, קשורים למשתמש הנוכחי.\n');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const credentials = {};
  for (const field of meta.fields) {
    const label = institutions.FIELD_LABELS[field] || field;
    credentials[field] = await ask(rl, `${label}: `, { hidden: field === 'password' });
  }
  rl.close();

  saveCredentials(connectionId, institution, credentials);
  console.log('\n✅ נשמר. עכשיו אפשר להריץ `npm run sync` (ידני), או לרשום הרצה יומית עם register-task.ps1.');
}

main().catch((e) => {
  console.error('שגיאה:', e.message);
  process.exit(1);
});
