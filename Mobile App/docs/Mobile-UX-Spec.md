# Mobile UX Spec

## Design Principles

- Library is the home base.
- Pattern Workspace is task-focused: file, chat, rewrite, notes, tools.
- Keep AI actions close to the active pattern.
- Use warm StitchSense colours with restrained native controls.
- Prefer sheets and progressive disclosure over dense web-style panels.
- Keep every primary action reachable with one thumb.

## Navigation

Primary tabs:
- Library
- Workspace
- Camera
- Tools
- Account

Screen hierarchy:
- Library -> Pattern Detail -> Pattern Viewer / Chat / Rewrite
- Workspace -> Active Pattern actions
- Camera -> Stitch Vision result
- Tools -> Gauge calculator
- Account -> Subscription, data, Ravelry, sign out

## Library Screen

Purpose:
- Find, open, and upload patterns.

Layout:
- Navigation title: Library.
- Top-right upload button.
- Search field.
- Pattern rows with title, craft/source, filename, summary snippet.
- Empty state with upload prompt.

States:
- Loading: cached patterns display first, then refresh from API.
- Empty: “No patterns yet.”
- Error: keep cache visible and show a compact retry message.

## Pattern Detail

Purpose:
- Orient the user before opening a full workflow.

Layout:
- Title card.
- Filename/source metadata.
- Collapsed AI summary.
- Primary Open Pattern button.
- Secondary Ask StitchSense and Rewrite buttons.

## Pattern Viewer

Purpose:
- Read the uploaded pattern file securely.

Layout:
- Full-screen Quick Look/PDF preview.
- File is loaded through a signed backend URL.
- Loading state explains that the pattern file is being prepared.

## AI Chat

Purpose:
- Ask questions about the active pattern.

Layout:
- Message list.
- Bottom composer.
- Send button fixed at the trailing edge.
- Assistant errors appear inline as assistant messages.

Empty state:
- Suggested starter prompts can be added later.

## Rewrite

Purpose:
- Guide the user through pattern changes.

Layout:
- Rewrite goal picker.
- Prompt text area.
- Generate button.
- Result card.

Future refinement:
- Compare original vs rewritten tabs.
- Save rewritten child pattern.

## Stitch Vision

Purpose:
- Identify stitches, mistakes, or techniques from a photo.

Layout:
- Camera/photo picker.
- Analyse button.
- Result card with readable text.

States:
- Loading: “Analysing...”
- Error: “Stitch Vision could not analyse that photo just now.”

## Account & Paywall

Purpose:
- Make entitlement status obvious and manageable.

Status copy:
- Lifetime Pro: “You have lifetime Pro access.”
- Manual trial/courtesy: “You have extended complimentary Pro access.”
- Paid: “Your Pro subscription is active.”
- Standard trial: “Your free trial is active.”
- Expired: “Your free access has ended. Subscribe to continue.”

Primary actions:
- Manage subscription.
- Refresh subscription status.
- Export data.
- Delete data.
- Sign out.

## Empty, Loading, Error State Rules

- Never show a blank screen while loading.
- Cached data may remain visible during refresh.
- Errors should explain what failed and what the user can do next.
- Paywall errors should use subscription language, not technical HTTP codes.
- Workflow errors should preserve user-entered text where possible.

## Accessibility

- Use native Dynamic Type.
- Minimum tap target: 44pt iOS / 48dp Android.
- Text must not rely on colour alone.
- Support VoiceOver/TalkBack labels for icon-only actions.
- Keep contrast high on warm backgrounds.
- Avoid long unbroken AI text blocks; use spacing and sections.

## Visual Tokens

Use `shared/design-tokens/stitchsense.tokens.json` as source of truth:
- Background: warm off-white.
- Primary: StitchSense brown.
- Accent: terracotta.
- Surfaces: white/warm white.
- Radius: 8-16px for app surfaces.

