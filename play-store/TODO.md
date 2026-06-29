# Hex Realms — Play Store & launch checklist

Reference this when asking “what do I still need to do?”

## Done

- [x] Core game, Android app, lifecycle fixes
- [x] Docs + MIT license synced with rules
- [x] World (Lite) removed for v1
- [x] Custom app icon (Android + `play-store/icon-512.png`)
- [x] Store listing copy (`LISTING.md`)
- [x] Feature graphic (`feature-graphic-1024x500.png`)
- [x] Privacy policy (`privacy.html` → GitHub Pages)
- [x] Published to GitHub

## You still need to do

### Friend / beta testing (optional before full launch)

- [ ] Take 4–6 phone screenshots → `play-store/screenshots/`
- [ ] Share with friends (see README or ask agent: “friend beta options”)

### Play Store upload (required for store)

- [ ] **Signed release AAB** — Android Studio → Build → Generate Signed App Bundle; back up keystore + passwords
- [ ] `npm run cap:sync` before each release build
- [ ] Create app in [Google Play Console](https://play.google.com/console) ($25 one-time dev fee)
- [ ] Upload AAB to **Internal testing** or **Closed testing** first (recommended)
- [ ] Paste short + full description from `LISTING.md`
- [ ] Upload `icon-512.png`, `feature-graphic-1024x500.png`, screenshots
- [ ] Privacy policy URL: https://newdawn333.github.io/hex-realms/privacy.html
- [ ] **Content rating** questionnaire (Play Console → App content)
- [ ] Review **Pre-launch report**; fix crashes if any
- [ ] Promote to Production when happy

### iOS (optional, separate track)

- [ ] Mac + Xcode + Apple Developer ($99/year)
- [ ] `npx cap add ios` + `npm run cap:sync` + open in Xcode
- [ ] TestFlight for friend betas on iPhone

## Quick commands

```bash
cd ~/Desktop/Cursor/hex-realms
npm run cap:sync          # after code changes
npm run store:assets      # regenerate Play Store PNGs from icon.svg
```

## Repo

https://github.com/NewDawn333/hex-realms
