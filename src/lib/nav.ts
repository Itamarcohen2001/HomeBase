import type { Router } from 'expo-router';

/**
 * חזרה בטוחה. מסך שנטען ישירות מכתובת (רענון, סימנייה, קיצור דרך ב-PWA)
 * הוא הראשון ב-Stack, ואז `router.back()` לא מטופל על ידי אף navigator
 * והמשתמש נתקע במסך. בכל מקרה כזה נופלים חזרה למסכי הטאבים.
 */
export function goBack(router: Router, fallback: string = '/(tabs)'): void {
  if (router.canGoBack()) router.back();
  else router.replace(fallback as never);
}
