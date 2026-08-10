// הצפנה/פענוח מקומיים של פרטי ההתחברות לבנק, עם DPAPI (Windows).
//
// 🎯 scope='CurrentUser': ההצפנה קשורה למשתמש ה-Windows שהריץ setup.js —
//    אין סיסמת-מאסטר לזכור (Windows עצמו הוא המפתח), וקובץ .enc שהועתק
//    למחשב/משתמש אחר לא ניתן לפענוח שם. זו הסיבה שהתיקייה secrets/ יכולה
//    להישאר בדיסק בלי חשש נוסף מעבר להגנה הרגילה על חשבון המשתמש.

const fs = require('fs');
const path = require('path');
const { Dpapi, isPlatformSupported } = require('@primno/dpapi');

const SECRETS_DIR = path.join(__dirname, '..', 'secrets');

function assertSupported() {
  if (!isPlatformSupported) {
    throw new Error('DPAPI זמין רק ב-Windows (x64/ARM64). הסוכן הזה מיועד להרצה על מחשב Windows בלבד.');
  }
}

function ensureDir() {
  if (!fs.existsSync(SECRETS_DIR)) fs.mkdirSync(SECRETS_DIR, { recursive: true });
}

function secretPath(connectionId) {
  return path.join(SECRETS_DIR, `${connectionId}.enc`);
}

function saveCredentials(connectionId, institution, credentials) {
  assertSupported();
  ensureDir();
  const payload = Buffer.from(JSON.stringify({ institution, credentials }), 'utf-8');
  const encrypted = Dpapi.protectData(payload, null, 'CurrentUser');
  fs.writeFileSync(secretPath(connectionId), encrypted);
}

function loadCredentials(connectionId) {
  assertSupported();
  const encrypted = fs.readFileSync(secretPath(connectionId));
  const decrypted = Dpapi.unprotectData(encrypted, null, 'CurrentUser');
  return JSON.parse(decrypted.toString('utf-8'));
}

function listConnectionIds() {
  ensureDir();
  return fs
    .readdirSync(SECRETS_DIR)
    .filter((f) => f.endsWith('.enc'))
    .map((f) => f.slice(0, -4));
}

function removeCredentials(connectionId) {
  const p = secretPath(connectionId);
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

module.exports = { saveCredentials, loadCredentials, listConnectionIds, removeCredentials, SECRETS_DIR };
