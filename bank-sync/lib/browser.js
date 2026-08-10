// פרופיל דפדפן קבוע לכל חיבור — לא זורקים את הדפדפן אחרי כל ריצה.
//
// 🎯 חלק מהבנקים (נמדד: הפועלים) שולחים קוד אימות SMS כשההתחברות מגיעה
//    ממכשיר "לא מוכר". גירוד headless, בברירת מחדל, פותח דפדפן חדש-לגמרי
//    (בלי עוגיות/טביעת-אצבע) בכל הרצה — כלומר תמיד "מכשיר חדש" מבחינת הבנק.
//    userDataDir קבוע פותר את זה חלקית: אותו פרופיל בין ריצות, ולכן סיכוי
//    שהבנק "יזכור" את המכשיר אחרי login.js אחד עם קוד אימות ידני.
// ⚠️ לא מובטח — תלוי בדיוק איך כל בנק מזהה מכשיר. אם ההרצה האוטומטית עדיין
//    נתקעת ב-timeout על אותו בנק, כנראה שהוא דורש קוד בכל התחברות ואין דרך
//    לעקוף את זה בלי תמיכת OTP בספרייה עצמה (ראו bank-sync/README.md).

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const PROFILES_DIR = path.join(__dirname, '..', 'profiles');

function profileDir(connectionId) {
  return path.join(PROFILES_DIR, connectionId);
}

/** headless=false לצורך login.js (רואים את מסך הבנק כדי להזין קוד ידנית). */
async function launchPersistentBrowser(connectionId, headless) {
  const dir = profileDir(connectionId);
  fs.mkdirSync(dir, { recursive: true });
  return puppeteer.launch({ headless, userDataDir: dir });
}

module.exports = { launchPersistentBrowser, profileDir };
