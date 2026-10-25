# Mobile app (Android & iOS)

Parallel ships to phones from the **same React codebase**, in two ways:

| Way | What you get | How |
|---|---|---|
| **PWA** | Install from Chrome/Safari ("Add to Home screen"), offline app shell, app icon, shortcuts | Already on: `public/site.webmanifest` + `public/sw.js` (registered in production builds) |
| **Native shell (Capacitor 8)** | A real `.apk` / `.ipa`, status bar, haptics, local reminders, store-ready projects | `frontend/android/` and `frontend/ios/` are generated and committed |

## Turn it into an app: three paths, easiest first

### Path 1: on your phone in 2 minutes (no installs)
1. Make sure your laptop and phone are on the same Wi-Fi.
2. Start the API so the phone can reach it:
   ```bash
   cd backend && python -m uvicorn app.main:app --host 0.0.0.0 --port 8787
   ```
3. Start the web app so the phone can reach it:
   ```bash
   cd frontend && npm run dev -- --host --port 5180
   ```
4. Find your laptop's IP: `ipconfig getifaddr en0` on Mac, or `ipconfig` on Windows. Then open `http://<that-IP>:5180` in Chrome (Android) or Safari (iPhone).
5. Tap **⋮ → Add to Home screen** (Android) or **Share → Add to Home Screen** (iPhone). Parallel now opens full-screen with its own icon.

A fully installable, offline PWA needs HTTPS, so deploy it (Path 3) for a store-like install.

### Path 2: a real Android APK (Android Studio)
1. Install [Android Studio](https://developer.android.com/studio). It bundles Java (JDK 17) and the Android SDK.
2. Tell the app where the API lives, then build and open the native project:
   ```bash
   cd frontend
   echo "VITE_API_URL=http://<your-laptop-IP>:8787" > .env.production.local
   npm install
   npm run android
   ```
3. In Android Studio:
   - wait for Gradle sync
   - plug in your phone with USB debugging on, and press **▶ Run**
   - or use **Build → Build App Bundle(s) / APK(s) → Build APK(s)** to get `app-debug.apk`, which you can share or install on any Android phone
4. For the Play Store: **Build → Generate Signed App Bundle**, then upload it to the Play Console.

### Path 3: deploy, then everyone can install it
- **API:** deploy `backend/` to Render, Railway or Fly.io. Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`. Run `python -m ml.dataset && python -m ml.train` once.
- **Web/PWA:** deploy `frontend/` to Vercel or Netlify with `VITE_API_URL=https://<your-api>`. `public/_redirects` and `vercel.json` are already set up.
- Now anyone can install the PWA from the HTTPS URL, and the Android/iOS builds can point at the same URL.

### iPhone app (needs a Mac with Xcode)
Run `cd frontend && npm run ios`. In Xcode, choose your Apple ID team under *Signing & Capabilities* and run it on your iPhone. App Store release needs an Apple Developer account.

## The app UI on phones
- **Bottom tab bar:** Today, Multiverse, Smart inbox, Coach, More. **More** opens a sheet with every other page.
- **Notched phones:** safe-area padding (`env(safe-area-inset-*)`) and `viewport-fit=cover`.
- **Native touches:**
  - haptic feedback on every confirmation toast
  - local reminders at your "best moments to check held pings" (Today page, native only)
  - the Android back button navigates back

## Build the Android app
Prerequisites: Android Studio (with an SDK) and JDK 17+.

```bash
cd frontend
# 1. Point the app at your API. On a phone, "localhost" is the phone itself, so use your computer's LAN IP or a deployed URL
echo "VITE_API_URL=http://192.168.1.10:8787" > .env.production.local
# 2. Build the web app, copy it into the native project, and open Android Studio
npm run android
```
In Android Studio, press ▶ to run it on a device or emulator, or use *Build → Build APK(s)*. Start the backend with `--host 0.0.0.0` so the phone can reach it:

```bash
python -m uvicorn app.main:app --host 0.0.0.0 --port 8787
```

## Build the iOS app (macOS only)
Prerequisites: Xcode 15+.

```bash
cd frontend
npm run ios      # builds, syncs and opens Xcode
```
In Xcode, pick your team under *Signing & Capabilities*, then run it on a simulator or device.

## Live reload while developing
In `capacitor.config.ts`, uncomment `server.url` and set it to `http://<your-LAN-IP>:5180`. Run `npm run dev -- --host` and then `npx cap sync`. The app on the phone now hot-reloads from your laptop.

## What each platform can really do
| Capability | Android | iOS | Web/PWA |
|---|---|---|---|
| Read other apps' notifications | ✅ with `NotificationListenerService` (user grants access) | ❌ not allowed by iOS | ❌ |
| Hold or suppress notifications | ✅ (cancel and re-post later from the listener) | ⚠️ only via Focus filters / Screen Time APIs | ❌ |
| App usage timeline | ✅ `UsageStatsManager` | ⚠️ aggregate Screen Time only | Tab only |
| Local reminders | ✅ | ✅ | ⚠️ |

The API reports the same matrix at `GET /api/platform/capabilities`.

## Next step: Android notification listener plugin
This is the one native piece that makes the twin act on real notifications. Outline:
1. Create a Capacitor plugin `ParallelListener` with a Java class extending `NotificationListenerService`.
2. In `onNotificationPosted(sbn)`:
   - map `sbn.packageName` and `sbn.notification.category` to a Parallel category
   - **drop the message text**
   - call the twin: `POST /api/simulations`, or decide locally from a cached policy
3. If the decision is `delay`, call `cancelNotification(sbn.key)` and add the item to the deferred queue. Re-post it at the next check moment through Capacitor Local Notifications.
4. Add these to `AndroidManifest.xml`:
   - the service, with `android.permission.BIND_NOTIFICATION_LISTENER_SERVICE`
   - an onboarding screen that opens *Settings → Notification access*

On desktop, the equivalent is ActivityWatch. Send its events to `POST /api/ingest/activitywatch?tz_offset_min=330` (330 = IST; ActivityWatch timestamps are UTC).
