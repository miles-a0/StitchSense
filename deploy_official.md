# StitchSense — Official Native Deployment (no EAS)

> **Goal:** Deploy StitchSense to the Apple App Store and Google Play Store by
> building **natively** with Apple's and Google's own official tooling
> (Xcode + Android Studio) instead of Expo's EAS cloud service.
>
> Plain-English, step by step, with **realistic costs** (USD + GBP) as of 2026.

`deployment_plan.md` covered the **EAS** route (Expo builds it in the cloud). This
file covers the **"do it yourself with the official tools"** route. It's the same
end result in the stores — EAS is just a paid wrapper around exactly these steps —
but here *you* run Xcode and Android Studio yourself.

---

## 0. Hardware — you're covered

You have a **second, up-to-date Mac** available for building/deploying, so the
hardware requirement is satisfied. The deploy Mac just needs to run **macOS 15
(Sequoia) + Xcode 16** to build the current **Expo 54 / React Native 0.81** app
(iOS 18 SDK). Android can be built on almost any computer.

> Note: your everyday 2016 MacBook Pro (macOS 12 / Xcode 14.2) is fine for writing
> code and running the Expo dev server, but it can't produce the iOS binary — use the
> up-to-date Mac for the §4 build/submission steps. The two files stay in sync via Git
> or by copying the `Mobile App/stitchsense-expo` folder across.

---

## 1. Big picture (the official route)

1. **Generate the native projects** from Expo: `npx expo prebuild`.
2. **iOS** → open in **Xcode**, sign, archive, validate, distribute to App Store Connect.
3. **Android** → open in **Android Studio**, build a signed **AAB**, upload to Play Console.
4. **Fill in the store listings** (same as EAS route) and submit for review.

You still need the same **developer accounts** as the EAS route.

---

## 2. One-time accounts (required, same as before)

- **Apple Developer Program** — <https://developer.apple.com/programs/> — **$99/yr**.
- **Google Play Console** — <https://play.google.com/console/> — **$25** one-time.
- A **Mac running macOS 15 + Xcode 16** (for iOS) — see §0 / §5.

Install on your (capable) machine:
- **Xcode 16** (free from the Mac App Store) + Xcode Command Line Tools.
- **Android Studio** (free from <https://developer.android.com/studio>).
- Node/npm (you have these) + the project's deps (`npm install`).

---

## 3. Step-by-step: generate the native projects

From `Mobile App/stitchsense-expo`:

```bash
# Clean any old native folders, then generate fresh iOS + Android projects
npx expo prebuild --clean

# This creates:
#   ios/      -> open ios/<App>.xcworkspace in Xcode
#   android/  -> open android/ in Android Studio
```

> Note: `prebuild` writes native code into `ios/` and `android/`. Don't hand-edit
> those unless you must; keep app logic in the JS/TS layer. Add `ios/` and `android/`
> to `.gitignore` if you'd rather regenerate them each time (common with Expo).

---

## 4. iOS — official Xcode workflow

1. Open the workspace:
   ```bash
   open ios/uk.co.zuauto.stitchsenseexpo.xcworkspace
   ```
   (the folder name is derived from your bundle ID / app name).
2. In Xcode → **Signing & Capabilities**: select your **Team** (your Apple Developer
   account). Xcode auto-creates the **signing certificate** and **provisioning profile**.
3. Set **Version** `1.0.0` and **Build** `1` in the target settings.
4. **Product → Archive** (with a real device or "Any iOS Device" selected, not a simulator).
5. When archiving finishes, **Organizer** opens → click **Validate** (catches issues early).
6. Click **Distribute App → App Store Connect → Upload**.
7. In **App Store Connect** (<https://appstoreconnect.apple.com>): create the app, fill
   the listing (description, screenshots for iPhone **and** iPad since `supportsTablet: true`,
   privacy policy URL, age rating), then **Submit for Review**.
8. Apple reviews (usually 1–2 days). On approval, release manually or automatically.

Alternative upload tool: **Transporter** (free Mac app from Apple) if you prefer not
to use Xcode's Organizer.

---

## 5. Android — official Android Studio workflow

1. Open the project:
   ```bash
   open -a "Android Studio" android
   ```
2. **Build → Generate Signed Bundle / APK → Android App Bundle (AAB)**.
3. Create/use a **signing keystore** (keep this file safe forever — losing it means you
   can never update the app under the same package name). Google then re-signs with the
   Play App Signing key.
4. Choose **release** build variant. Output: `android/app/release/app-release.aab`.
5. In **Play Console** (<https://play.google.com/console/>): create the app, upload the AAB
   to a track (internal / closed / open test, or production), complete the **store listing**
   and **Data safety** form, set content rating, then roll out.
6. Google reviews (often faster than Apple). Roll out gradually (10% → 50% → 100%).

---

## 6. Realistic costs (2026, USD + approx GBP)

All store fees are **identical** whether you use EAS or the official tools — they go to
Apple/Google, not Expo.

### Recurring / mandatory
| Item | USD | GBP (approx) | Notes |
|------|-----|--------------|-------|
| Apple Developer Program | $99 / year | ~£78 / year | Required, every year, or app is removed. |
| Google Play Console | $25 once | ~£20 once | One-time, lifetime. |
| **Subtotal (year 1)** | **$124** | **~£98** | Year 2+ just the $99 Apple fee. |

### Tooling (free)
| Item | Cost | Notes |
|------|------|-------|
| Xcode 16 | Free | Mac App Store. |
| Android Studio | Free | developer.android.com. |
| macOS / Windows / Linux for Android builds | Free | Android builds on any OS. |

### Capable Mac for iOS — already owned
You have a second, up-to-date Mac that runs macOS 15 + Xcode 16, so there is **no
extra hardware cost**. (If you ever needed one: a used M1 Mac mini ~£250–£330, new
Mac mini ~£500+, MacBook Air ~£850+; or a cloud Mac CI service ~£12–£47/mo.)

| Item | USD | GBP (approx) | Notes |
|------|-----|--------------|-------|
| Your up-to-date Mac (already have) | $0 | £0 | Runs macOS 15 + Xcode 16. |
| Developer time (your own) | — | — | The biggest hidden cost. |

### Optional but recommended for a production app
| Item | USD | GBP (approx) | Notes |
|------|-----|--------------|-------|
| Sentry (crash reporting) | Free–$26/mo | Free–£20/mo | Free tier is fine to start. |
| Privacy policy (self-written) | $0 | £0 | Just host a page. |
| Privacy policy (lawyer/service) | $50–$300 | £40–£235 | If you want it reviewed. |
| Store assets (screenshots, preview video, icon design) | $0–$500 | £0–£390 | DIY vs designer. |
| Test devices (old iPhone/Android) | $50–$200 | £40–£155 | Useful for real-device testing. |

### Bottom line
- **Software/accounts:** ~**$124 (£98)** in year 1, then ~**$99 (£78)/year**.
- **Hardware:** you already own a capable up-to-date Mac, so there's **no extra hardware
  cost** for the official route.
- With a capable Mac in hand, the official route and EAS cost about the same in year 1
  (~£98 in store fees); the choice comes down to control vs convenience. Compare the two
  files before deciding.

---

## 7. Official route vs EAS — quick comparison

| | Official (this file) | EAS (`deployment_plan.md`) |
|---|---|---|
| Builds run on | Your Mac / local | Expo's cloud Macs |
| Needs Xcode/Android Studio? | Yes (you drive them) | No |
| Needs a macOS 15 Mac? | Yes — you have one | No — EAS has the Mac |
| Store submission | Manual (Xcode/Play Console) | `eas submit` automates it |
| Control / learning | Full | Abstracted |
| Year-1 cost | ~£98 + Mac/CI cost | ~£98 + EAS plan |
| Best when | You want full control / already have a capable Mac | You want simplicity / have an old Mac |

---

## 8. Checklist (official route)

```
[ ] Apple Developer Program enrolled ($99/yr)
[ ] Google Play Console account ($25 once)
[ ] Capable Mac (macOS 15 + Xcode 16) OR cloud Mac CI service
[ ] Xcode 16 + Android Studio installed
[ ] npm install in stitchsense-expo
[ ] npx expo prebuild --clean
[ ] iOS: open workspace, sign, Archive, Validate, Distribute to App Store Connect
[ ] Android: Generate Signed Bundle (AAB), keep keystore safe
[ ] App Store Connect listing + screenshots + privacy URL + age rating
[ ] Play Console listing + Data safety + content rating
[ ] Submitted for review on both
[ ] Approved & released
```

---

### Notes specific to StitchSense
- Bundle ID / package: `uk.co.zuauto.stitchsenseexpo` (already set in `app.json`).
- First public release: set **Version 1.0.0** (currently `0.1.0`).
- `supportsTablet: true` → you must provide **iPad screenshots** for Apple.
- Camera/photo permissions are justified by "Stitch Vision" — keep that wording consistent
  across the app, privacy policy, and store disclosures.
- Backend already points at production: `https://stitchsense.zu-auto.co.uk`.
