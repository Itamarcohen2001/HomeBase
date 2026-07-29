import React from 'react';
import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

/**
 * מעטפת ה-HTML של גרסת הוובי.
 * כאן מוגדר ה-PWA: manifest, אייקונים ל-iOS, צבע נושא, ותצוגת מסך מלא.
 * הקובץ הזה רץ רק בזמן build של הוובי ולא משפיע על iOS/Android נייטיב.
 */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="he" dir="rtl">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />

        {/*
          viewport-fit=cover נדרש כדי שה-safe area של אייפון עם נאץ' יעבוד.
          maximum-scale=1 מונע את קפיצת הזום של iOS בלחיצה על שדה קלט,
          מה שנותן תחושה של אפליקציה ולא של אתר.
        */}
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover"
        />

        <title>HomeBase — תקציב משק הבית</title>
        <meta name="description" content="מעקב הוצאות והכנסות משותף למשק הבית, פשוט וברור." />

        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#2E9E6B" />

        {/* iOS לא קורא את ה-manifest — הוא דורש את התגיות הייעודיות האלה */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="HomeBase" />
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
        <link rel="icon" href="/icons/icon-192.png" sizes="192x192" />

        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: rootStyle }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

const rootStyle = `
  html, body, #root {
    height: 100%;
    background-color: #F7F9F8;
  }
  body {
    margin: 0;
    overscroll-behavior-y: none;
    -webkit-tap-highlight-color: transparent;
    -webkit-font-smoothing: antialiased;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  }
  /* מונע בחירת טקסט בלחיצה ארוכה, שנראית שבורה באפליקציה במסך מלא */
  body { user-select: none; -webkit-user-select: none; }
  input, textarea { user-select: text; -webkit-user-select: text; }
`;
