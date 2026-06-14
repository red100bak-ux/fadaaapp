import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import type { SupplierCredit, Employee } from '../types';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export async function setupNotifications(): Promise<boolean> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('fadaa-default', {
      name: 'فضاء الأخوين',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#5c67f2',
      sound: 'default',
    });
  }
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

export async function sendNow(title: string, body: string) {
  try {
    await Notifications.scheduleNotificationAsync({
      content: { title, body, sound: true },
      trigger: null,
    });
  } catch (_) {}
}

async function cancelByType(type: string) {
  const all = await Notifications.getAllScheduledNotificationsAsync();
  for (const n of all) {
    if ((n.content.data as Record<string, unknown>)?.type === type) {
      await Notifications.cancelScheduledNotificationAsync(n.identifier);
    }
  }
}

export async function scheduleCheckNotifications(
  supplierCredit: Record<string, SupplierCredit>,
) {
  await cancelByType('check');
  const now = Date.now();

  for (const [, supp] of Object.entries(supplierCredit)) {
    for (const chk of supp.checks ?? []) {
      if (chk.cashed || !chk.due) continue;
      const dueMs = new Date(chk.due).getTime();
      const diffDays = Math.ceil((dueMs - now) / 86400000);
      if (diffDays > 0 && diffDays <= 7) {
        const secsUntilDue = Math.floor((dueMs - now) / 1000);
        if (secsUntilDue > 60) {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: '📋 شيك يستحق اليوم',
              body: `${supp.name ?? 'مورد'} — ${chk.amount} DH`,
              sound: true,
              data: { type: 'check' },
            },
            trigger: { seconds: secsUntilDue },
          });
        }
      }
    }
  }
}

export async function scheduleSalaryNotifications(
  employees: Record<string, Employee>,
) {
  await cancelByType('salary');
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  for (const [, emp] of Object.entries(employees)) {
    if (!emp.payday) continue;
    const salaryDate = new Date(year, month, emp.payday, 9, 0, 0);
    const secsUntil = Math.floor((salaryDate.getTime() - now.getTime()) / 1000);
    if (secsUntil > 60) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: '💰 يوم التخليص',
          body: `راتب ${emp.name}: ${emp.salary} DH`,
          sound: true,
          data: { type: 'salary' },
        },
        trigger: { seconds: secsUntil },
      });
    }
  }
}
