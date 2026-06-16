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

3. **On your Android phone** — **Settings → About phone → tap Build number 7 times**,
   then **Settings → Developer options → USB debugging** on.

4. **In the project folder**, install dependencies:

```bash
cd ~/Desktop/Cursor/hex-realms
npm install
```

5. **Open the Android project in Android Studio** (first time):

```bash
cd ~/Desktop/Cursor/hex-realms
npm run cap:open
```

Wait for Gradle sync. If **Run ▶** is missing, set it up once:

- Top toolbar → dropdown next to ▶ → **Edit Configurations…**
- **+** → **Android App** → Module: **app** → OK
- **View → Tool Windows → Device Manager** — create an emulator or plug in your phone via USB

> Open the **`android`** folder in Android Studio, not the parent `hex-realms` folder.

---

## Day-to-day loop (change game → phone updates)

After editing `js/`, `css/`, or `index.html`:

```bash
cd ~/Desktop/Cursor/hex-realms
npm run cap:sync
```

Then either:

### A — Android Studio (green ▶)

1. Phone plugged in via USB (or emulator running).
2. Select your device in the toolbar dropdown.
3. Click the green **Run ▶** button.

Android Studio rebuilds and installs directly — **no Google Drive, no manual APK**.

### B — Terminal only (same result, one command)

```bash
cd ~/Desktop/Cursor/hex-realms
npm run cap:run
```

This runs `cap:sync` then builds + installs over USB. Pick your phone if prompted.

---

## Why `cap:sync`?

The game code lives in `js/` at the project root. The Android app reads a **copy**
in `android/app/src/main/assets/public/`. `npm run cap:sync` rebuilds `www/` and
copies it into the Android project. **Assemble Project** alone only repackages
whatever is already there — it does not pick up your latest JS changes.

**Always run `cap:sync` before Run ▶ or `cap:run`.**

---

## Manual APK install (fallback only)

If USB debugging isn't working, you can still copy the APK by hand:

1. `npm run cap:sync`
2. Android Studio → **Build → Assemble Project**
3. Open the output folder:

```bash
open ~/Desktop/Cursor/hex-realms/android/app/build/outputs/apk/debug
```

4. Copy `app-debug.apk` to your phone (Drive, email, etc.) and install.

---

## Play Store (later)

The debug APK is for personal use. For Google Play you'd run **Build → Generate Signed Bundle / APK** in Android Studio with a release keystore. Same `cap:sync` workflow — only the signing step changes.

---

## Troubleshooting

| Problem | Fix |
|--------|-----|
| `npx cap` not found | Run `npm install` in the project folder |
| Gradle sync failed | Open Android Studio, install suggested SDK packages |
| Phone not listed | Enable USB debugging; try a different cable; unlock phone |
| Old version on phone | Run `npm run cap:sync` then Run ▶ (not just Assemble) |
| No Run ▶ button | Edit Configurations → + → Android App → module **app** |
| No vibration | Check phone isn't in silent/DND; haptics only fire on native APK |
