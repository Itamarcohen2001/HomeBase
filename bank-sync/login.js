#!/usr/bin/env node
// bank-sync/login.js — התחברות חד-פעמית עם דפדפן גלוי, לבנקים שדורשים קוד
// אימות SMS ("מכשיר לא מוכר"). אחרי הרצה מוצלחת אחת כאן, npm run sync
// (headless) עשוי להפסיק להיתקל באתגר הזה — כי משתמשים באותו פרופיל דפדפן
// (userDataDir) גם שם. לא מובטח: תלוי איך הבנק בפועל מזהה "מכשיר מוכר".
//
// שימוש:
//   node login.js <connection_id>
//
// חלון דפדפן ייפתח. אם הבנק מבקש קוד מה-SMS — מזינים אותו שם, ידנית,
// בדיוק כמו באתר הבנק הרגיל. אחרי שההתחברות מסתיימת (הצלחה או כישלון),
// הסקריפט סוגר את הדפדפן לבד.

const { createScraper } = require('israeli-bank-scrapers');
const { loadCredentials } = require('./lib/crypto');
const { launchPersistentBrowser } = require('./lib/browser');
const { startDate } = require('./lib/dates');

async function main() {
  const connectionId = process.argv[2];
  if (!connectionId) {
    console.log('שימוש: node login.js <connection_id>');
    process.exit(1);
    return;
  }

  const { institution, credentials } = loadCredentials(connectionId);
  console.log(`פותח דפדפן להתחברות ידנית ל-${institution}. אם מבקשים קוד מה-SMS — להזין אותו בחלון שנפתח.`);

  const browser = await launchPersistentBrowser(connectionId, /* headless */ false);
  try {
    const scraper = createScraper({
      companyId: institution,
      startDate: startDate(),
      combineInstallments: false,
      browser,
      skipCloseBrowser: true, // סוגרים בעצמנו למטה — לא הספרייה
    });

    const result = await scraper.scrape(credentials);
    if (result.success) {
      console.log(`\n✅ ההתחברות הצליחה (${result.accounts?.length ?? 0} חשבון/ות). אפשר להריץ npm run sync כרגיל עכשיו.`);
    } else {
      console.log(`\n❌ ההתחברות נכשלה: ${result.errorType || 'UNKNOWN_ERROR'} — ${result.errorMessage || ''}`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error('שגיאה:', e.message);
  process.exit(1);
});
