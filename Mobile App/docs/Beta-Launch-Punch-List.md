# Beta Launch Punch List

This is the short, practical punch list that should stay in front of us during
beta hardening.

It is intentionally smaller than the full build checklist.

## P0 — Must close before beta confidence

1. Validate signup and onboarding from a brand-new Expo-created account.
   - Confirm WordPress subscriber creation
   - Confirm auto-login after account creation
   - Confirm onboarding appears once for new accounts only

2. Lock down sync diagnostics truthfulness.
   - Linked accounts must not show `not configured` or `not linked`
   - Counts must reflect real shared data after re-sync

3. Finish pattern contamination matrix.
   - chat A then B
   - rewrite A then B
   - relaunch then switch pattern
   - project A then project B

4. Confirm metadata-only Ravelry imports never fabricate:
   - summaries
   - chat answers
   - rewrite output

5. Validate web-as-master deletion behavior.
   - web delete -> mobile remove on re-sync
   - mobile must not resurrect deleted web records

6. Validate Stitch Vision on live phone input.
   - photo library
   - camera capture
   - English-formatted result rendering

## P1 — Strongly recommended before public beta

1. Validate non-English source translation to English across:
   - summary
   - chat
   - rewrite

2. Run real-world Ravelry parity pass.
   - connect
   - reconnect
   - import
   - re-import
   - purchased vs metadata-only handling

3. Run reinstall / returning-user pass.
   - clear app state
   - sign back in
   - verify library, account link, and settings restoration

4. Run upload size confidence pass.
   - medium PDF
   - large PDF
   - thumbnail generation and viewer access

## P2 — Immediately after beta if needed

1. Broader project parity with web
2. Richer launch analytics and support instrumentation
3. Deeper dashboard personalization
4. More polished release-facing account screen

## Current working rule

Do not add fresh product scope while a P0 item is still reproducible.
