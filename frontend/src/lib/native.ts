/**
 * Thin bridge to native features when Parallel runs inside the Capacitor shell (Android / iOS).
 * On the web every function is a safe no-op, so pages can call them unconditionally.
 */
import { Capacitor } from '@capacitor/core'

export const isNative = () => Capacitor.isNativePlatform()
export const platform = () => Capacitor.getPlatform() // 'web' | 'android' | 'ios'

export async function initNative() {
  if (!isNative()) return
  const { StatusBar, Style } = await import('@capacitor/status-bar')
  await StatusBar.setStyle({ style: Style.Dark }).catch(() => {})
  await StatusBar.setBackgroundColor({ color: '#18191b' }).catch(() => {})
  const { App } = await import('@capacitor/app')
  App.addListener('backButton', ({ canGoBack }) => (canGoBack ? window.history.back() : App.exitApp()))
}

export async function haptic(kind: 'light' | 'success' | 'warning' = 'light') {
  if (!isNative()) return
  const { Haptics, ImpactStyle, NotificationType } = await import('@capacitor/haptics')
  if (kind === 'light') await Haptics.impact({ style: ImpactStyle.Light }).catch(() => {})
  else await Haptics.notification({ type: kind === 'success' ? NotificationType.Success : NotificationType.Warning }).catch(() => {})
}

/** Schedule gentle local reminders at the twin's "best moments to check held pings". */
export async function scheduleCheckReminders(moments: { hour: number; reason: string }[]) {
  if (!isNative()) return false
  const { LocalNotifications } = await import('@capacitor/local-notifications')
  const perm = await LocalNotifications.requestPermissions()
  if (perm.display !== 'granted') return false
  const now = new Date()
  const notifications = moments.map((m, i) => {
    const at = new Date(now)
    at.setHours(Math.floor(m.hour), Math.round((m.hour % 1) * 60), 0, 0)
    return { id: 1000 + i, title: 'Good moment to check your held pings', body: m.reason, schedule: { at } }
  }).filter((n) => n.schedule.at > now)
  await LocalNotifications.cancel({ notifications: notifications.map((n) => ({ id: n.id })) }).catch(() => {})
  if (notifications.length) await LocalNotifications.schedule({ notifications })
  return true
}
