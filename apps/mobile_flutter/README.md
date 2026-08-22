# Coach Scribe — Flutter mobile app

Native iOS/Android app for coaches: record a session, review the AI summary,
approve, and share — talking to the same Coach Scribe API as the web app.

> ⚠️ **Not yet verified on a device.** This code was authored without a Flutter
> SDK available in the build environment, so it has **not been compiled or run**.
> It is real, idiomatic Flutter — open it in your Flutter setup, run
> `flutter pub get`, fix any minor first-compile issues, and verify on a
> device/emulator. Treat this as a reviewed starting point, not a shipped build.

## What's here

```
lib/
  main.dart                 app entry + auth-gated routing
  config.dart               API base URL (--dart-define), chunk size
  theme.dart                brand (black / white / gold)
  api/                      models + REST client (same endpoints as the web)
  state/app_state.dart      token storage + auth (ChangeNotifier singleton)
  services/
    recorder_service.dart   native mic capture (record package) → file
    upload_queue.dart       offline-safe queue → resumable chunked upload
  screens/                  login, register, dashboard, clients,
                            new_session, recording, review, history
```

The mandatory flow is covered: register/login → dashboard → clients (list+add)
→ new session (record now **or** free text) → recording consent → live recording
→ upload/process → AI review → approve → share → history.

## Prerequisites

- Flutter SDK 3.19+ (Dart 3.3+), Android Studio / Xcode for the platform tools.
- A running Coach Scribe API (see `services/api`).

## Generate the platform scaffolding

This folder ships `lib/` + `pubspec.yaml` only. Generate the `android/`, `ios/`,
etc. wrappers (Flutter will not overwrite the existing `lib/`):

```bash
cd apps/mobile_flutter
flutter create --platforms=android,ios --org com.mobashil .
flutter pub get
```

## Add the required permissions

**Android** — in `android/app/src/main/AndroidManifest.xml`, above `<application>`:
```xml
<uses-permission android:name="android.permission.RECORD_AUDIO"/>
<uses-permission android:name="android.permission.INTERNET"/>
```

**iOS** — in `ios/Runner/Info.plist`:
```xml
<key>NSMicrophoneUsageDescription</key>
<string>The Coach Scribe records coaching sessions you choose to record.</string>
```

## Run against the API

```bash
# Android emulator (10.0.2.2 = host localhost); iOS simulator can use localhost.
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:4000
```

## Offline recording (works today, native)

Recording writes to an on-device file and is uploaded via the API's resumable
chunked-upload endpoints. If you finish while offline (airplane mode), the
recording is stored in an on-device queue (`UploadQueue`) and uploaded
automatically when connectivity returns (`connectivity_plus` listener +
dashboard flush on launch).

## Roadmap — the truly native pieces (not possible on web)

These are the reasons a native app exists and are the next work items:

1. **Auto-start recording when the phone unlocks** — a screen-unlock trigger
   (Android `USER_PRESENT` broadcast receiver; iOS is more restrictive) that
   launches straight into the recording screen.
2. **Background / foreground-service recording** — keep recording when the app
   is backgrounded or the screen is off (Android foreground service +
   `flutter_background_service`; iOS background audio mode + careful review of
   App Store rules).
3. **Chunk-as-you-record + resumable mid-recording upload** — stream chunks to
   the server during the session (the API already supports resumable chunks).
4. Push notifications (FCM/APNs), biometric lock, and store submission.

Items 1–2 are the "put it in airplane mode and have it record without bothering
me" behavior — they require the platform work above and on-device testing.
