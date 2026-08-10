// 🎯 חלון קבוע ולא "מאז הריצה הקודמת": ריצה שנכשלת (או מחשב כבוי כמה ימים)
//    לא אמורה ליצור חור בהיסטוריה. חפיפה בין ריצות בטוחה — bank-sync-ingest
//    מסתמך על (connection_id, external_id) ולא יוצר pending כפול.
const LOOKBACK_DAYS = 35;

function startDate() {
  const d = new Date();
  d.setDate(d.getDate() - LOOKBACK_DAYS);
  return d;
}

module.exports = { startDate, LOOKBACK_DAYS };
