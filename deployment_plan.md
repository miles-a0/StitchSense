# StitchSense — Deployment Plan (App Store + Play Store)

> **Goal:** A simple, plain-English, step-by-step guide for getting the finished
> StitchSense mobile app into the Apple App Store and Google Play Store as a
> production-grade app. Read it top to bottom once to understand the whole journey;
> use it as a checklist when you're actually ready to ship.

This plan is written for the **current project shape**: it's an **Expo 54 / React Native**
app (`Mobile App/stitchsense-expo`) that talks to a backend at
`https://stitchsense.zu-auto.co.uk`. Because it's an Expo app, we'll use
**EAS (Expo Application Services)** to build and submit — you do **not** need to
open Xcode or Android Studio to ship, which makes this far simpler than a raw
native project.

---

## 0. What's already done (good news)

- ✅ App name, slug, version (`0.1.0`) defined in `app.json`.
- ✅ iOS bundle identifier: `uk.co.zuauto.stitchsenseexpo`.
- ✅ Android package: `uk.co.zuauto.stitchsenseexpo`.
- ✅ Permissions are declared (camera/photos for "Stitch Vision" image analysis).
- ✅ Splash screen and icons wired up.
- ✅ Backend API URL and WordPress URL already set in `app.json` `extra`.

So the app is already "addressable" by both stores. What remains is **accounts,
signing, building, and store listing**.

---

## 1. The big picture (read this first)

Deploying a production app has **four distinct jobs**:

1. **Accounts & money** — register as a developer on both platforms (one-time, paid).
2. **Signing & credentials** — prove the app is yours (done per-platform, then reused).
3. **Build** — compile the app into a store-ready binary (EAS does this in the cloud).
4. **Submit & publish** — upload the build and fill in the store listing, then release.

Apple and Google **review every submission** and can reject it. Budget for 1–3
review cycles. Plan for a **couple of days to a week** of back-and-forth the first time.

---

## 2. One-time prerequisites (do these early, in parallel)

### Apple — Apple Developer Program
- Go to <https://developer.apple.com/programs/> and enroll in the **Apple Developer Program**.
- Cost: **$99 USD / year**. Requires a personal or organisation Apple ID.
- If you're publishing as a business, enroll as an **organisation** (needs a D-U-N-S number).
- You'll get an **App Store Connect** account at <https://appstoreconnect.apple.com>.

### Google — Google Play Console
- Go to <https://play.google.com/console/> and create a **Play Console** developer account.
- One-time fee: **$25 USD** (lifetime).
- Verify your identity / payment details when prompted.

### Tooling on your Mac (already likely fine)
- **Node + npm** (you have these).
- **EAS CLI**: `npm install -g eas-cli` (then `eas login`).
- A **paid Expo account** is *not* required for building, but EAS **production builds**
  use build credits; a free account includes some, beyond that it's a small monthly fee.
  Decide later — start free.

> 💡 Tip: Create the developer accounts **now**, even before the app is finished.
> Verification (especially Apple org enrolment) can take days.

---

## 3. Prepare the app for production (do this as you finish building)

Before the first real build, tidy these in `app.json` / `app.config.js`:

- [ ] Bump `version` to `1.0.0` for the first public release (use semver).
- [ ] Set a real **app privacy / data disclosure** plan (see §7).
- [ ] Confirm `extra.apiBaseUrl` points at the **production** backend (it already does).
- [ ] Replace placeholder icons/splash with final branded assets (the `assets/` folder).
- [ ] Make sure **no test/debug code** or fake API keys ship.
- [ ] Add a **Privacy Policy URL** and **Terms** (Apple & Google require a privacy policy URL).
- [ ] Wire and fully test native speech recognition for the standalone **Count - Row & Stitch Counter** before App Store / Play Store release. The Expo Go version intentionally keeps the microphone button as UI-only until a native/dev build can support commands: "Stitch", "Row", "Remove Stitch", "Remove Row", and "Reset".
- [ ] Decide on **app signing** approach (next section).

### Create `eas.json` (the build config)
You don't have one yet. At `Mobile App/stitchsense-expo/eas.json`:

```json
{
  "cli": { "version": ">= 16.0.0" },
  "build": {
    "development": { "developmentClient": true, "distribution": "internal" },
    "preview": { "distribution": "internal" },
    "production": {}
  },
  "submit": {
    "production": {}
  }
}
```

Then run `eas build:configure` once so EAS can set up the build profiles.

---

## 4. Signing & credentials (proves the app is yours)

### iOS
- EAS can **generate and manage the signing certificate + provisioning profile**
  for you. Run `eas credentials` (or let `eas build` prompt you).
- EAS uploads them to Apple automatically. You normally do this **once**; it's reused.
- The bundle ID `uk.co.zuauto.stitchsenseexpo` must be registered in your
  Apple Developer account (EAS handles this during submit).

### Android
- EAS creates a **Google Play upload key** and signs the app.
- The keystore is generated and stored by EAS (or you upload your own).
- Google uses an **app signing key** managed by Play; you keep the upload key.
- The package `uk.co.zuauto.stitchsenseexpo` must match what you register in Play Console.

---

## 5. Build the apps (cloud build, no Xcode/Android Studio)

From `Mobile App/stitchsense-expo`:

```bash
# iOS production build
eas build --platform ios --profile production

# Android production build (App Bundle .aab)
eas build --platform android --profile production

# Or both at once
eas build --platform all --profile production
```

- iOS output: `.ipa`. Android output: `.aab` (required by Google).
- Builds run on EAS servers; you get a link when done.
- First build is the slowest (~15–30 min). Subsequent builds are faster (cached).

---

## 6. Submit to the stores

### Submit automatically with EAS (recommended)
```bash
eas submit --platform ios --profile production
eas submit --platform android --profile production
```
EAS uploads to App Store Connect and to the Play Console for you.

### Then finish the listing in each console

**Apple — App Store Connect** (<https://appstoreconnect.apple.com>)
- Create a **new app**, set bundle ID, primary language, category (e.g. "Lifestyle"
  or "Utilities").
- Fill **App Store Info**: description, keywords, screenshots (iPhone + iPad if
  `supportsTablet` is true), app preview video (optional), promo text.
- Set **age rating** (answer the questionnaire — camera/photos use affects this).
- Add **privacy policy URL** and **privacy nutrition labels** (what data you collect).
- Choose **release mode**: manual ("Manually release this version") or automatic.
- Submit for **App Review**.

**Google — Play Console** (<https://play.google.com/console/>)
- Create an **app**, set package name, name, default language.
- Set up the **store listing**: short/long description, screenshots (phone + tablet),
  feature graphic (1024×500), icon (512×512), category.
- Complete the **Data safety form** (what data you collect & why — mirrors Apple's).
- Set **content rating** via the questionnaire.
- Target the **production track**; you can use open/closed testing first.
- Roll out gradually (e.g. 10% → 50% → 100%) to catch issues safely.
- Google's review is usually faster than Apple's.

---

## 7. Production-grade requirements (don't skip these)

These are the things that get apps **rejected** or **pulled**:

- [ ] **Privacy Policy** page hosted publicly + URL entered in both consoles.
- [ ] **Data disclosures** accurate (camera/photos used only for Stitch Vision analysis).
- [ ] **Backend is production-ready**: HTTPS, auth, rate limiting, monitoring, backups.
- [ ] **No hardcoded secrets** in the app bundle (use `expo-secure-store` / server config).
- [ ] **Crash reporting** (e.g. Sentry) so you learn about failures in the wild.
- [ ] **Analytics** (optional but recommended) to understand usage.
- [ ] **Graceful offline handling** + clear error messages.
- [ ] **Accessibility**: large-text support, screen-reader labels, sufficient contrast.
- [ ] **Test on real devices** (not just simulators) before submitting.

---

## 8. After launch (ongoing)

- Bump `version` + `android.versionCode`/`ios.buildNumber` for each update
  (EAS handles version code increments if configured).
- `eas update` can push **over-the-air (OTA) JS updates** without a full store review
  for JS-only changes — but native changes still need a store submission.
- Monitor reviews and crash reports; respond to user feedback.
- Keep the **Privacy Policy** and **data disclosures** in sync with the app.

---

## 9. Quick checklist summary

```
[ ] Apple Developer Program enrolled ($99/yr)
[ ] Google Play Console account ($25 once)
[ ] eas-cli installed + logged in
[ ] eas.json created + eas build:configure run
[ ] Production backend live & secure (HTTPS)
[ ] Privacy Policy URL ready
[ ] Icons/splash finalised
[ ] eas build --platform all --profile production  ✅
[ ] eas submit --platform ios / android            ✅
[ ] App Store Connect listing + screenshots done
[ ] Play Console listing + data safety done
[ ] Submitted for review on both
[ ] Approved & released 🚀
```

---

### Notes specific to StitchSense
- Current backend endpoint: `https://stitchsense.zu-auto.co.uk` (already configured).
- Camera/photo permissions are justified by the "Stitch Vision" feature — keep that
  wording consistent across the app, the privacy policy, and the store disclosures.
- `supportsTablet: true` means you must supply **iPad screenshots** for Apple.
- First public release version should be `1.0.0`, not `0.1.0`.
