# Hex Realms — Android (offline APK)

The Android app is a **Capacitor** shell around the same HTML/JS game you play
on Mac. All assets ship inside the APK — **no internet required** after install.

Haptic feedback uses the Capacitor Haptics plugin (captures feel heavy, starve
warns, builds/turns tap lightly).

---

## One-time setup (on your Mac)

1. **Node.js** — install from [nodejs.org](https://nodejs.org/) if you don't have it.

2. **Android Studio** — install from [developer.android.com/studio](https://developer.android.com/studio).
   During setup, install the Android SDK and accept licenses.

3. **In the project folder**, install dependencies:

```bash
cd ~/Desktop/Cursor/hex-realms
npm install
```

4. **Add the Android platform** (first time only):

```bash
npm run build
npx cap add android
npx cap sync android
```

---

## Build & install on your phone

### Option A — USB debugging (fastest for testing)

1. On your Android phone: **Settings → About phone → tap Build number 7 times** to enable Developer options, then **Settings → Developer options → USB debugging** on.

2. Connect the phone to your Mac with USB.

3. Run:

```bash
cd ~/Desktop/Cursor/hex-realms
npm run cap:run
```

Select your device when prompted. Android Studio / Gradle builds the APK and installs it.

### Option B — Android Studio

```bash
cd ~/Desktop/Cursor/hex-realms
npm run cap:open
```

In Android Studio:

1. Wait for Gradle sync to finish.
2. **Build → Build Bundle(s) / APK(s) → Build APK(s)**  
   APK path: `android/app/build/outputs/apk/debug/app-debug.apk`
3. Copy the APK to your phone (AirDrop, email, Google Drive) and open it to install.  
   You may need **Settings → Install unknown apps** allowed for your file app.

---

## After you change the game (Mac ↔ Android stay in sync)

Every time you improve the game on Mac, push the same files to Android:

```bash
cd ~/Desktop/Cursor/hex-realms
# edit js/, css/, index.html as usual — test with Hex Realms.command on Mac
npm run cap:sync          # copies web files → www/ → android project
npm run cap:run           # reinstall on phone, OR rebuild APK in Android Studio
```

That is the whole loop: **one codebase**, Mac browser for quick iteration, `cap:sync` + rebuild to refresh the phone.

---

## Play Store (later)

The debug APK is for personal use. For Google Play you'd run **Build → Generate Signed Bundle / APK** in Android Studio with a release keystore. Same `cap:sync` workflow — only the signing step changes.

---

## Troubleshooting

| Problem | Fix |
|--------|-----|
| `npx cap` not found | Run `npm install` in the project folder |
| Gradle sync failed | Open Android Studio, install suggested SDK packages |
| Phone not listed | Enable USB debugging; try a different cable |
| Old version on phone | Run `npm run cap:sync` then rebuild/reinstall |
| No vibration | Check phone isn't in silent/DND; haptics only fire on native APK |
