import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

// Set up how notifications are handled when the app is in the foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function setupMonthlyReminder() {
  if (Platform.OS === 'web') return; // Local notifications are primarily for native devices


  // Request permissions
  const existingStatus: any = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus.granted;
  
  if (!existingStatus.granted) {
    const status: any = await Notifications.requestPermissionsAsync();
    finalStatus = status.granted;
  }
  
  if (!finalStatus) {
    console.log('Failed to get push token for push notification!');
    return;
  }

  // Check if we already scheduled the monthly reminder to avoid duplicates
  const scheduledNotifications = await Notifications.getAllScheduledNotificationsAsync();
  const hasMonthlyReminder = scheduledNotifications.some(
    n => n.content.data?.type === 'monthly_reminder'
  );

  if (!hasMonthlyReminder) {
    // Schedule for the 28th of every month at 18:00
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'הגיע הזמן לסגור חודש!',
        body: 'החודש כמעט נגמר! אל תשכחו לייבא את דוח האשראי או להזין את ההוצאות האחרונות כדי לסגור את החודש במעקב מושלם.',
        data: { type: 'monthly_reminder' },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.CALENDAR,
        day: 28,
        hour: 18,
        minute: 0,
        repeats: true,
      },
    });
    console.log('Monthly reminder scheduled for the 28th at 18:00.');
  } else {
    console.log('Monthly reminder is already scheduled.');
  }

  // For testing purposes in DEV mode, we can also schedule one for 2 seconds from now
  if (__DEV__) {
    /*
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'בדיקת התראה - הגיע הזמן לסגור חודש!',
        body: 'החודש כמעט נגמר! אל תשכחו לייבא את דוח האשראי...',
        data: { type: 'monthly_reminder_test' },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: 2,
        repeats: false
      }, 
    });
    console.log('Test notification scheduled for 2 seconds from now!');
    */
  }
}
