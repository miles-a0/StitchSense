# StitchSense Pro: Product and Market Research Brief

**Document purpose:** Give a research model enough accurate product context to conduct a deep, current investigation of the knitting/crochet software market, competitors, customer needs, positioning, pricing, launch strategy, and App Store/Google Play opportunity.

**Product stage:** Pre-release, feature-rich beta / launch-hardening build

**Primary launch platforms:** iOS and Android through an Expo/React Native application, supported by an existing WordPress/web product and a shared cloud backend

**Market focus:** Initially UK-oriented, with support for metric/imperial units and UK/US terminology

**Important research rule:** Treat the capabilities labelled **Current** below as present in the codebase. Treat items labelled **Validation required** or **Not yet release-ready** as launch risks, not marketable finished capabilities.

---

## 1. Executive product summary

StitchSense Pro is an AI-assisted making workspace for knitters and crocheters. It brings patterns, active works-in-progress, yarn/tool inventory, practical calculations, reference information, pattern-aware AI help, image analysis, and cross-device history into one product.

It is not only an AI chatbot and not only a pattern library. Its intended value is continuity across the whole making journey:

1. Find, import, or upload a pattern.
2. Understand the pattern and assess difficulty, sizing, gauge, yarn, and tools.
3. Create an active project from that pattern.
4. Match supplies already held in the user's stash.
5. Read the private pattern file and save the current page/row/section.
6. Count rows, rounds, repeats, motifs, or sections.
7. Ask contextual questions or simplify confusing instructions.
8. Record progress, notes, time, photos, and project decisions.
9. Diagnose visible problems from a photo.
10. Finish, care for, and retain a history of the completed make.

The central product promise is: **less friction, confusion, and lost context while knitting or crocheting**.

---

## 2. Product identity and positioning hypothesis

### Working name

**StitchSense Pro**

### Current description

An AI assistant and connected project workspace for knitters and crocheters, combining:

- Pattern library and secure file access
- Project/WIP management
- Yarn, needle, hook, and tool stash tracking
- Pattern-aware AI chat
- Pattern rewriting and simplification
- Photo-based stitch and mistake assistance
- Gauge, sizing, terminology, and technique tools
- Ravelry discovery/import integration
- Web/mobile account and data synchronisation

### Positioning hypothesis to test

StitchSense may occupy the intersection of several existing categories rather than fitting neatly into one:

- Knitting/crochet project tracker
- Pattern library/reader
- Row counter
- Yarn stash manager
- Ravelry companion
- Craft calculator/reference toolkit
- AI pattern explainer
- AI image assistant
- Cross-device maker workspace

Research should determine whether this breadth is a defensible advantage or whether the launch proposition should focus on one high-intent wedge, such as “AI help for patterns while you make,” with the broader workspace supporting retention.

---

## 3. Intended users

### Primary users

- Knitters and crocheters who work from PDF, document, image, web, or Ravelry patterns
- Beginners who struggle with abbreviations, terminology, gauge, sizing, and knowing what to do next
- Intermediate makers who want faster pattern interpretation, project organisation, and yarn substitution help
- Experienced makers managing multiple WIPs, patterns, supplies, modifications, deadlines, and historical notes
- Mobile-first makers who need help while physically working away from a desktop
- Existing StitchSense website users who want the same library and saved work on mobile

### Particularly relevant need states

- “I do not understand this row or instruction.”
- “Is this UK or US crochet terminology?”
- “Which size should I make, and how much ease will it have?”
- “My gauge is wrong; which needle or hook should I change to?”
- “Can I use this yarn instead?”
- “Where did I stop last time?”
- “How many rows/rounds/repeats have I completed?”
- “What yarn and tools do I already own?”
- “What can I make with this stash yarn?”
- “Have I made a visible mistake, and how can I recover?”
- “Can this instruction be explained in plain English?”
- “How can I plan this project around a gift deadline?”

### Skill and regional adaptation

During onboarding, users can set:

- Skill level: beginner, intermediate, or advanced
- Measurement preference: metric or imperial
- Language/terminology style: UK or US

These settings are intended to influence the way assistance is explained.

---

## 4. Current app structure

The visible primary tab bar contains:

1. **Home** – overview, counts, active projects, quick starts, and navigation
2. **Library** – saved/imported pattern collection
3. **Projects** – active and planned making workspaces
4. **Chat** – general AI chat and contextual help
5. **Stash** – yarn, needles/hooks, and other supplies

Additional screens are reached contextually from Home, pattern/project screens, Chat, Account, and tool links:

- Pattern detail
- Pattern viewer
- Pattern chat
- Pattern rewrite
- Pattern upload
- Project creation and project detail
- Stitch Vision/camera
- Gauge Calculator
- Stitch Dictionary
- Quick Row & Stitch Counter
- Smart Assistants/tools catalogue
- Ravelry connection/search/import
- Account, preferences, sync, privacy/data controls
- Subscription/paywall
- Onboarding, registration, login, and password recovery

---

## 5. Detailed feature inventory

## 5.1 Account creation, access, and onboarding — Current

- Register a new StitchSense account.
- Sign in using StitchSense email/password credentials.
- Sign in or register through the existing WordPress account bridge.
- Securely store access and refresh tokens on the device.
- Restore sessions and refresh expired access tokens.
- Request and confirm password resets using a one-time code.
- Sign out with confirmation.
- Guided onboarding explains the product and introduces patterns, projects, stash, and chat.
- Onboarding collects skill, units, and UK/US terminology preferences.
- Optional Ravelry connection is presented during setup.
- Users can start from Library, Ravelry, Stash, Chat, or Home after setup.

## 5.2 Home dashboard — Current

- Personalised welcome screen.
- At-a-glance counts for patterns, projects, and stash items.
- Current/active project cards with progress and recency.
- Direct navigation into core product areas.
- Quick-start paths for adding patterns, adding yarn, resolving a stuck moment, or continuing a WIP.
- Focused shortcuts for Gauge, Stitch Dictionary, Stitch Vision, and the standalone counter.
- Account/settings access.

## 5.3 Pattern library — Current

- Maintain a private, account-linked collection of patterns.
- Load synced patterns from the shared StitchSense platform.
- Cache pattern metadata locally so useful information can remain visible while refreshing or when connectivity is weak.
- Upload a new pattern from the device.
- Store title, craft type, filename, source URL, file metadata, summary, source, timestamps, and activity counts.
- Search across title, filename, summary, and craft information.
- Filter by craft/source/archive/rewrite/Ravelry-related states.
- Sort the library using supported sort modes.
- Pull to refresh.
- Explicitly re-sync with the existing WordPress/web account.
- Show chat and rewrite activity counts.
- Edit pattern metadata.
- Archive/unarchive a pattern.
- Delete a pattern.
- Open a detailed pattern workspace.
- Start a project from a library pattern.

### Pattern sources

Patterns may enter the library through:

- Direct mobile upload
- Existing StitchSense web/WordPress data
- Ravelry import
- Synced/migrated platform records

## 5.4 Pattern upload and AI summary — Current

- Select a pattern document or image from the device.
- Provide a title, craft type, and optional source URL.
- Upload through the shared API rather than exposing workflow credentials to the app.
- Store the private file in S3-compatible object storage.
- Generate or refresh an AI-derived pattern summary through a server-side workflow.
- Surface summary information in pattern detail.
- Use available summary/metadata to identify possible gauge, yarn, tool, sizing, or readiness clues.

The AI summary is assistance, not a guaranteed complete or authoritative extraction. Research and launch messaging must avoid implying perfect pattern understanding.

## 5.5 Pattern detail and readiness — Current

- Show title, craft, source, filename, archive status, dates, and source-specific metadata.
- Display an expandable summary.
- Refresh the AI summary.
- Present a “what do you want to do?” action area.
- Open the pattern file.
- Open pattern-specific AI chat.
- Open pattern rewrite.
- Start a project.
- Open the Gauge Calculator with clues from the selected pattern.
- Review project setup/readiness tasks.
- Show possible matching supplies from the user's stash.
- Ask an AI readiness-check question.
- Show recent chats and rewrites tied to that pattern.
- Edit metadata, archive, or delete.
- Identify active projects cloned/created from the same pattern.
- For Ravelry imports, show designer, availability, gauge, sizes, yardage, and other available metadata.
- Refresh eligible imported data from Ravelry.

## 5.6 Secure pattern viewer and making position — Current

- Retrieve private files through short-lived/signed access rather than public URLs.
- Open supported files in an in-app WebView-based viewer.
- Fall back to the operating system viewer when an in-app preview is unsupported.
- Show loading and file-access failure states.
- Associate viewer activity with a project when opened from a project.
- Save a resume point.
- Save bookmarks and annotations.
- Record page number, row/section label, and a note.
- Edit or remove saved markers.
- Surface marker counts and the current making position.

## 5.7 Pattern-aware AI chat — Current

- Create a chat associated with a specific pattern.
- Load the latest or previous saved chat sessions.
- Preserve chat history in the shared backend.
- Automatically send the active pattern as the relevant context.
- Adapt to skill/terminology preferences where supported by the workflow.
- Show staged progress while the assistant is working.
- Render headings, paragraphs, bold text, and lists clearly in responses.
- Copy responses as clean plain text without Markdown or HTML tags.
- Recover from failed sends without losing the user's prompt.
- Reopen chats from pattern detail.

Typical uses include:

- Explain a row, round, chart note, abbreviation, or construction step.
- Translate an instruction into plain English.
- Clarify UK/US terminology.
- Create a step-by-step guide from an owned/uploaded pattern.
- Ask about gauge, yarn, tools, sizing, or tricky sections.
- Ask what to do next from a saved position.

## 5.8 General chat and helper chat — Current

- Ask general knitting and crochet questions without first opening a pattern.
- Start a fresh helper conversation or continue recent prompt context.
- Configure the conversation context.
- Use suggested prompts.
- Move from advice into related parts of the app, including Library, Stash, Projects, and Gauge.
- Use focused tool modes so the assistant responds to a narrower task rather than acting as an entirely generic chatbot.

## 5.9 Pattern rewrite and simplification — Current

- Open a rewrite flow for a selected pattern.
- Choose a guided rewrite goal.
- Use quick prompt suggestions or provide a freeform goal.
- Submit the request through an entitlement-controlled backend workflow.
- Render long-form formatted output.
- Show key changes and warnings when returned.
- Save rewrite history to the account.
- Reopen previous rewrites.
- Retain the original pattern/summary as context.
- Enforce a purchase/ownership warning where a metadata-only pattern does not include usable owned pattern content.

Potential uses include:

- Simplifying confusing instructions
- Converting terminology
- Explaining construction differently
- Resizing or adapting instructions, subject to AI accuracy limitations
- Considering yarn substitution or other requested modifications

AI rewrites must be positioned as drafts that require human checking, especially for stitch counts, shaping, grading, fit, yardage, and safety-critical details.

## 5.10 Projects / works-in-progress — Current

Projects turn a saved pattern into an active making workspace. Users can:

- Create a project from a library pattern.
- Give the project its own name.
- Set status: planned, active/started, paused, completed, or archived.
- Record a stage label.
- Favourite/pin a project.
- Track percentage progress.
- Use flexible progress modes including rows, rounds, motifs, or sections.
- Record recipient, gift status, occasion, deadline, and notes.
- Carry yarn and needle/hook details into the project.
- Choose a pattern size or record a custom size/measurement.
- Capture body/garment measurements, ease intentions, length choices, and customisations during setup.
- View projects by active, ready, needs setup, planned, paused, quiet, completed, or due-soon states.
- Search projects, people/recipients, and notes.
- Sort by activity, deadline, title, or progress.
- See progress, stage, linked pattern, cover/latest photo, and last-worked information on cards.
- Receive deadline urgency indicators.
- Delete or complete a project.

## 5.11 Project counters — Current

Within each project, users can:

- Create multiple counters.
- Count rows, rounds, repeats, sections, motifs, or a custom unit.
- Set current value, optional target, and step size.
- Increment, decrement, reset, edit, reorder, or remove counters.
- Use quick counter presets.
- See the most relevant counter on project cards where available.

## 5.12 Work log, notes, time, and milestones — Current

- Add project notes, progress entries, session logs, or milestones.
- Give entries a title and descriptive body.
- Record progress percentage and minutes spent where applicable.
- Use quick entry types such as session, checkpoint, or fix note.
- Review historical work notes.
- Calculate/display total minutes logged.
- Use recency to help restart inactive projects.

## 5.13 Project photos — Current

- Attach photos to a project timeline.
- Add captions and timestamps.
- Use the latest photo as project imagery where appropriate.
- Store photos behind authenticated API access.
- Review visual progress over time.

## 5.14 Integrated project making assistant — Current

- Open an assistant from within a project without losing project context.
- See the saved current position.
- Open the linked pattern alongside the project.
- Request a step-by-step guide.
- Request a making-session plan.
- Ask what comes next or clarify a cuff, sleeve, row, or section.
- Save assistant conversation messages in the relevant context.

## 5.15 Stash inventory — Current

- Track yarn, needles/hooks, and other tools.
- Create, edit, and delete stash entries.
- Use quick-fill presets for common yarn balls/skeins and tools.
- For yarn, record name, quantity/unit, brand/dyer, weight, fibre, colour, dye lot, storage location, notes, and an image where available.
- For needles/hooks/tools, record size, material/type, location, notes, and image where available.
- Reserve a stash item for a project.
- Clear reservations.
- Filter by category, reserved/available status, missing detail, or low stock.
- Search by yarn, colour, fibre, hook/needle size, and related fields.
- See stash health indicators such as items missing detail or running low.
- Ask the assistant about an item.
- Generate likely project-search ideas from stash details.
- Use stash context when matching supplies to a pattern or starting a project.

## 5.16 Ravelry integration — Current, external validation required

- View Ravelry connection status.
- Start connect/reconnect flows through the existing StitchSense/WordPress bridge.
- Save a Ravelry username.
- Load saved-library information.
- Search Ravelry with supported filters.
- Preview search results and metadata.
- Open or buy a pattern on Ravelry.
- Import eligible pattern information into the StitchSense library.
- Refresh an imported record.
- Use imported gauge, size, yardage, designer, availability, and source data when present.

Important boundary:

- A metadata-only import does not give StitchSense the full paid pattern instructions.
- Pattern-specific chat or rewrite must not fabricate access to unavailable content.
- Real-world connect, reconnect, import, re-import, purchase status, and cross-device parity remain launch validation tasks.

## 5.17 Gauge Calculator — Current

- Compare pattern gauge with the user's swatch.
- Record stitch and row counts.
- Choose the measurement span and units.
- Support metric and imperial inputs.
- Record current needle or hook size and craft type.
- Calculate whether the swatch is a close match, has too many stitches, or has too few stitches.
- Explain the likely sizing/fabric effect.
- Recommend a direction for needle/hook adjustment.
- Support optional block/motif-size checking when a pattern gives finished motif dimensions rather than stitch gauge.
- Offer tolerance controls in advanced mode.
- Autofill clues from a selected uploaded/imported pattern.
- Include quick examples and a needle/hook reference.
- Send a result into AI help for a plain-language explanation.
- Reset and recalculate.

## 5.18 Stitch Dictionary — Current

- Built-in knitting and crochet reference library.
- Search names, symbols, abbreviations, alternative names, descriptions, notes, and UK/US terms.
- Filter by knitting, crochet, or all.
- Filter by category.
- Sort A–Z, Z–A, by difficulty, or by category.
- Use quick searches such as “dc,” “treble,” “yarn over,” “increase,” “decrease,” and “gauge.”
- Read mobile-friendly reference cards.
- Open relevant external learning links where provided.

## 5.19 Quick Row & Stitch Counter — Current, voice is a placeholder

- Standalone counter not tied to a saved project or pattern.
- Switch between row and stitch counting.
- Maintain separate row and stitch totals.
- Add, subtract, and reset.
- Display visual marks and emphasise each tenth mark.
- Clamp values to a safe supported range.
- Includes voice-command UI and simulated command buttons.

**Not yet release-ready:** The current microphone control says voice input is ready for a future native build; it does not provide live speech recognition. It must not be advertised as hands-free voice counting at launch unless implemented and device-tested.

## 5.20 Stitch Vision photo assistance — Current, live-device validation required

- Take a new photo or choose one from the photo library.
- Preview the selected image.
- Upload it securely to the backend.
- Ask an image-capable workflow to analyse the visible stitches/fabric/problem.
- Render a formatted explanation.
- Show staged loading, error, and retry states.
- Retain resumable/saved result behaviour where supported.

Potential uses:

- Identify a stitch or technique.
- Ask about visible fabric characteristics.
- Investigate a possible mistake.
- Ask for likely next/recovery steps.

This is assistance rather than guaranteed visual diagnosis. Camera and photo-library flows still require final testing on release devices.

## 5.21 Smart Assistants catalogue — Current

The Tools surface contains focused assistants grouped into Pattern setup, Yarn & stash, Making help, and Finishing:

1. Gauge Assistant
2. Pattern Size Assistant
3. Fit & Ease Assistant
4. Yarn Assistant
5. Stash Assistant
6. Project Planner
7. Pattern Progress Assistant
8. Mistake Recovery Assistant
9. Technique Coach
10. Pattern Translator
11. Needle & Hook Assistant
12. Pattern Difficulty Predictor
13. Project Time Estimator
14. Finishing Assistant
15. Yarn Care Assistant
16. Stitch Vision

These focused modes are intended to give users task-specific guidance and better prompts than an unstructured general AI conversation.

## 5.22 Account, privacy, and data controls — Current

- Show identity and account status.
- Display entitlement source and subscription/trial state.
- Load and save skill, measurement, language, and other preferences.
- Refresh entitlement status.
- Show WordPress/web link and synchronisation diagnostics.
- Show synced record counts.
- Trigger a WordPress re-sync.
- Open subscription management where supported.
- Request an account data export summary.
- Delete synced user data with confirmation.
- Sign out.

## 5.23 Subscription and entitlement model — Partially current

Current proposed/displayed offer:

- Monthly: **£10 per month**
- Annual: **£96 per year** (displayed as saving £24 against monthly)
- Standard free trial/introductory access is supported by the entitlement model.
- Manual lifetime, beta/extended trial, and courtesy access can be granted separately from paid subscriptions.

Pro feature flags include:

- Pattern uploads
- AI chat
- Rewrite
- Stitch Vision
- Ravelry import

The paywall currently presents Pattern-aware AI chat, PDF library/project clones, Ravelry search/import, rewrite/simplification, Stitch Vision, stash-aware suggestions, counters/notes/markers, and web/mobile sync.

### Billing readiness caveat

- Stripe web checkout and billing portal paths exist.
- The backend models Stripe, Apple, Google, standard trial, manual lifetime, timed/manual, and courtesy entitlement sources.
- RevenueCat plumbing exists in the wider platform work.
- The iOS UI explicitly indicates that App Store subscriptions are “coming soon” and disables Stripe checkout on iPhone for store-compliance reasons.
- StoreKit/App Store and Google Play purchase flows must be fully built, configured, restored, receipt/webhook tested, and reviewed before claiming in-app subscription readiness.

Research must verify current Apple and Google rules rather than assuming web checkout can be promoted inside either app.

---

## 6. Cross-platform and technical model

### Client surfaces

- Expo/React Native mobile app intended for iOS and Android
- Existing WordPress/web StitchSense product
- Legacy native iOS and Android shells exist in the repository but the Expo app is the active mobile direction

### Shared platform

- Node.js/Fastify API
- PostgreSQL database
- S3-compatible private object storage
- Server-side n8n AI workflows
- WordPress bridge for account/data interoperability
- Ravelry functionality proxied through the shared platform/WordPress bridge
- Stripe for web billing
- RevenueCat/store-provider entitlement integration foundations for mobile

### Security and privacy design

- Mobile does not call n8n directly or contain workflow secrets.
- AI routes check backend entitlements before invoking workflows.
- Tokens are held in secure device storage.
- Access tokens can be refreshed using rotating refresh tokens.
- Pattern files and project photos are private and accessed through authenticated or signed URLs.
- Manual access grants are modelled separately from paid subscriptions.
- Users have export and deletion controls.
- The service processes user-uploaded patterns, images, prompts, project notes, and account data, so privacy, data retention, subprocessors, and AI training/use disclosures require careful launch review.

### Synchronisation intent

The shared backend is intended to be the single account-level source of truth for:

- Users and preferences
- Entitlements
- Patterns and private files
- Chats and messages
- Rewrites
- Projects, counters, work logs, photos, and pattern marks
- Stash records
- Ravelry-linked metadata

The product aims to let a user upload on the web, continue on mobile, and see the same work across devices.

---

## 7. What differentiates StitchSense in theory

These are hypotheses for research, not proven market claims:

1. **End-to-end making continuity:** pattern discovery/storage, preparation, making, troubleshooting, tracking, and finishing in one system.
2. **Pattern-aware rather than generic AI:** conversations and rewrites can use an owned pattern and its saved context.
3. **Project state connected to help:** AI can sit beside current position, project notes, progress, and linked pattern.
4. **Pattern + project + stash relationship:** the app can match likely supplies and carry details into project setup.
5. **Both knitting and crochet:** one product supports both crafts and UK/US terminology differences.
6. **Broad practical toolset:** gauge, counters, dictionary, visual help, Ravelry, stash, and AI assistants are integrated.
7. **Cross-platform continuity:** a shared account across web and mobile rather than a device-only utility.
8. **Beginner-friendly explanations with experienced-user utility:** onboarding preferences and focused assistants can change the depth and framing of help.
9. **Private library and history:** patterns, project notes, photos, chats, and rewrites remain tied to the user's account.

Research should test whether users perceive this as a coherent “making workspace” or as too many loosely connected tools.

---

## 8. Current limitations and release risks

The following must be considered in competitive and launch analysis:

### Product validation risks

- Core web/mobile sync scenarios still need end-to-end validation with real user data.
- Chat and rewrite visibility across web and mobile require final verification.
- Ravelry connection/import parity requires real-world testing.
- Pattern isolation must be tested carefully to prevent one pattern's content from influencing another pattern's chat or rewrite.
- Metadata-only Ravelry records must never be treated as if full paid pattern content is available.
- Camera and photo selection need final physical-device tests.
- Large PDFs, thumbnails, signed viewer access, and failure recovery need device/network testing.
- New-account registration, onboarding, reinstall, returning-user, and session-expiry paths require final release testing.
- Poor-network and timeout behaviour needs structured testing.
- Accessibility requires VoiceOver/TalkBack, dynamic type, contrast, keyboard, and tap-target audits.

### Commercial/store risks

- Apple and Google in-app purchase implementation is not yet fully release-ready.
- Store pricing, trials, renewal wording, restore purchases, and account deletion must match current store policy.
- The value proposition may be too broad for a short store listing; research must identify the strongest acquisition hook.
- AI and infrastructure usage can create variable cost exposure, especially if marketed as unlimited.
- £10/month and £96/year are hypotheses requiring willingness-to-pay testing.

### Trust, accuracy, and legal risks

- AI output can be inaccurate, incomplete, or overconfident.
- Incorrect stitch counts, sizing, grading, yarn quantity, gauge, or construction advice can waste time and materials.
- Image analysis can misidentify stitches or mistakes.
- Pattern rewriting raises copyright, licence, and designer-relationship questions.
- Storing/importing paid patterns requires clear ownership and acceptable-use boundaries.
- Ravelry trademark, API, OAuth, data use, and attribution requirements need verification.
- Privacy disclosures must cover uploaded patterns/photos and third-party AI/workflow processing.
- Marketing must not imply affiliation with Ravelry or pattern designers unless authorised.

### Explicit non-capabilities

- The app is not a marketplace for selling patterns.
- It does not confer rights to paid patterns through metadata imports.
- It is not a replacement for checking the original pattern.
- AI output is not guaranteed accurate.
- The standalone counter does not yet offer functioning live voice recognition.
- Offline support is not a complete offline-first replica of all workflows; AI, sync, signed files, and most account actions require connectivity.

---

## 9. Requested deep-dive research assignment

Use this document as the factual product baseline. Conduct current web research and produce an evidence-backed report with direct source links, dates, territories, and clearly labelled inference.

### 9.1 Market definition and size

Research:

- Size and trajectory of the global knitting and crochet market
- UK, US, Canadian, Australian, and relevant European participation
- Number/demographics of active knitters and crocheters
- Craft app, pattern app, project tracker, and AI craft-assistance segments
- Spending on yarn, patterns, tools, subscriptions, classes, and digital services
- Post-pandemic participation and retention trends
- Age, gender, income, device, and platform patterns, while avoiding unsupported stereotypes
- Beginner influx versus experienced-maker needs

Separate reliable market data from weak SEO estimates.

### 9.2 Customer problem research

Find evidence for the frequency and severity of:

- Pattern comprehension problems
- UK/US crochet terminology confusion
- Gauge and sizing mistakes
- Yarn substitution and quantity uncertainty
- Lost row/round position
- WIP abandonment and restart friction
- Stash visibility/overbuying
- Difficulty organising patterns across sources
- Need for mobile help while hands are occupied
- Frustration with existing counters, trackers, PDF readers, and Ravelry UX
- Trust concerns about AI-generated craft advice

Use app reviews, forums, Reddit, Ravelry discussions where accessible, YouTube comments, surveys, and credible craft publications. Distinguish anecdote from representative evidence.

### 9.3 Competitor landscape

Identify direct and adjacent competitors across:

- Pattern libraries/readers
- Row counters and project trackers
- Yarn stash tools
- Ravelry companions
- Knitting/crochet calculators
- Stitch dictionaries/tutorial apps
- Photo/stitch recognition
- AI pattern chat/explanation/rewrite products
- General AI tools used for knitting/crochet
- Creator/designer pattern tools

At minimum investigate current relevance of products/services such as Ravelry, Ribblr, LoveCrafts, KnitCompanion, My Row Counter, Pocket Crochet, Crochet.land, Row Counter, YarnBuddy, Knitrino, Making Things, Bellish, Patternum, Wooltasia-type tools where relevant, and any newer AI-native entrants found during research. Do not assume this seed list is current or exhaustive.

For each significant competitor capture:

- Platforms and territories
- Target user
- Core proposition
- Feature set
- Pricing/trial/IAP model
- Download/ranking/review evidence where available
- Review themes and recurring complaints
- Pattern format/storage model
- Project, stash, counter, PDF, Ravelry, community, marketplace, and AI capabilities
- Privacy and AI positioning
- Strengths, weaknesses, and likely moat
- Overlap with StitchSense
- Gaps StitchSense could credibly own

Create a feature comparison matrix based on verified capabilities, not marketing assumptions.

### 9.4 Positioning and launch wedge

Evaluate at least these candidate positions:

1. “AI pattern help in your pocket”
2. “Your complete knitting and crochet project workspace”
3. “Understand any owned pattern and know what to do next”
4. “Patterns, projects, stash, and help—all connected”
5. “The Ravelry companion for making, not just finding”
6. Beginner-first pattern confidence
7. WIP/project continuity for committed makers

Recommend:

- Primary launch segment
- Core job-to-be-done
- One-sentence positioning
- App Store subtitle/short description
- Three strongest proof points
- Features to lead with
- Features to keep as retention/supporting value
- Claims to avoid
- Whether “Pro” helps or harms early positioning
- Whether knitting and crochet should be marketed together or segmented

### 9.5 Pricing and monetisation

Assess:

- Competitive monthly, annual, lifetime, and freemium pricing
- Willingness-to-pay signals in reviews/discussions
- Suitability of £10/month and £96/year
- Need for a free tier, usage allowance, time-limited trial, or feature-gated trial
- AI usage caps/fair-use policy
- App Store/Google Play commissions and current rules
- Regional price localisation
- Annual-plan discount norms
- Founder/beta pricing
- Family sharing or household use
- Whether a one-time purchase could work for non-AI tools with AI as subscription
- Likely unit-economics risks from AI, storage, and image analysis

Provide 2–3 recommended packaging models with trade-offs.

### 9.6 Store launch and discovery

Research current App Store and Google Play requirements relevant to:

- AI-generated content and disclosures
- User-generated uploads
- Digital subscriptions and external purchase links
- Restore purchases
- Account creation and in-app account deletion
- Privacy labels/data safety forms
- Camera/photo/file permissions
- Sign in with Apple requirements, if applicable
- Ravelry references/trademarks
- Copyright and pattern storage
- Subscription trials and renewal language

Also provide:

- ASO keyword research for the UK and US
- Competitor keyword gaps
- Recommended title/subtitle/short description options
- Screenshot story and order
- Preview-video concept
- Category choice
- Review/rating acquisition plan compliant with store policy
- Launch checklist separated into Apple, Google, product, legal, analytics, and support

### 9.7 Go-to-market and partnerships

Assess practical channels:

- Existing StitchSense/WordPress users
- Ravelry forums/groups, within platform rules
- Knitting/crochet Reddit communities, within community rules
- Facebook groups
- YouTube/TikTok/Instagram craft educators
- Yarn shops and yarn dyers
- Pattern designers and tech editors
- Guilds, clubs, classes, and craft events
- Affiliate and ambassador programmes
- SEO content around gauge, terminology, yarn substitution, and pattern help
- App review sites and craft press

Identify partnership benefits and likely objections, especially designer concerns about copyright or AI rewriting.

### 9.8 Retention and product metrics

Recommend a measurement framework covering:

- Registration and onboarding completion
- First pattern uploaded/imported
- First project created
- First stash item added
- First useful AI answer
- First saved marker/counter/work log
- Weekly active makers
- Active projects per user
- Pattern-to-project conversion
- WIP restart and completion rates
- Chat/rewrite/Stitch Vision usage and success signals
- Trial-to-paid conversion
- AI cost per active/paid user
- Subscription retention and churn reasons
- Cross-device adoption
- Safety/error feedback rate

Define an activation event and north-star metric suitable for this product.

### 9.9 Product prioritisation

Based on evidence, recommend:

- Must-have fixes before store submission
- Features that matter most for first release
- Features that can be hidden/deferred to simplify the launch story
- Highest-value missing capabilities
- Whether community/social features are necessary
- Whether deeper PDF annotation, offline access, chart tools, voice control, Apple Watch/Wear OS, or designer integrations matter
- A 30-day, 90-day, and 12-month roadmap

---

## 10. Required research output format

The final research report should contain:

1. Executive recommendation
2. Market definition and evidence quality notes
3. Audience/persona and jobs-to-be-done analysis
4. Customer pain-point evidence
5. Direct and adjacent competitor map
6. Verified feature/pricing matrix
7. Review-mining findings
8. SWOT and defensibility assessment
9. Recommended launch segment and positioning
10. Pricing/package recommendations
11. App Store and Google Play compliance/readiness analysis
12. ASO and launch creative recommendations
13. Go-to-market plan
14. Product analytics framework
15. Prioritised pre-launch risk register
16. 30-day, 90-day, and 12-month roadmap
17. Source appendix with direct links and access dates

For every recommendation, state:

- Evidence
- Confidence level
- Assumptions
- Expected impact
- Effort/risk
- How StitchSense could test it cheaply before committing

---

## 11. Suggested prompt to accompany this brief

> Read the attached StitchSense Pro product brief in full. Act as a senior market researcher, mobile subscription strategist, craft-industry analyst, and App Store/Google Play launch adviser. Conduct current, source-linked research into the knitting and crochet market, customer problems, direct and adjacent competitors, pricing, positioning, store requirements, ASO, and launch strategy. Treat the brief's current capabilities and limitations as the factual product baseline. Do not repeat the brief back to me. Verify competitor capabilities, prices, reviews, and store policies from current primary sources wherever possible. Separate fact from inference, rate evidence quality, identify contradictions, and give decisive recommendations. Produce the output in the structure requested in Section 10, including a feature/pricing matrix, prioritised risk register, and 30/90/365-day roadmap.

---

## 12. Short product description for researchers

StitchSense Pro is a pre-release iOS/Android and web-connected workspace for knitters and crocheters. It combines a private pattern library and reader, Ravelry-assisted imports, AI pattern summaries/chat/rewrites, project and WIP tracking, counters, saved reading positions, annotations, work logs, photos, deadlines, yarn/tool stash management, gauge calculations, a stitch dictionary, photo-based Stitch Vision assistance, and focused helpers for sizing, ease, yarn substitution, mistakes, finishing, and care. It aims to reduce confusion and preserve context from choosing a pattern through completing a project. The planned consumer subscription is currently shown as £10/month or £96/year, but mobile store billing and several end-to-end release validations remain unfinished.
