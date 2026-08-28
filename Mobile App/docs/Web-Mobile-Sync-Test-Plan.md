# Web/Mobile Sync Test Plan

## Required Setup

- StitchSense API running with PostgreSQL and object storage.
- `WORDPRESS_BRIDGE_SHARED_SECRET` set on the API.
- WordPress plugin settings configured:
  - Enable shared StitchSense API sync.
  - Set Platform API base URL.
  - Set WordPress bridge shared secret to match the API.
- Same user signed into WordPress and mobile through the linked StitchSense account.

## Test 1: Web Upload Then Mobile Open

1. In WordPress, upload a pattern through the existing StitchSense web UI.
2. Confirm `POST /auth/wordpress` succeeds from WordPress.
3. Confirm WordPress `POST /library/patterns` stores the pattern through `POST /patterns`.
4. Open the mobile Library screen.
5. Confirm the new pattern appears.
6. Open the pattern detail screen and preview the file.

Expected result: the mobile app loads the pattern metadata and opens the WordPress-hosted file URL or platform signed file URL.

## Test 2: Mobile Upload Then Web Open

1. In iOS, upload a pattern.
2. Confirm the pattern appears in mobile Library.
3. Open WordPress StitchSense Library.
4. Confirm the same pattern appears through the platform-backed list route.
5. Open the pattern detail in WordPress.

Expected result: WordPress can display the mobile-created pattern and resolve a file URL for viewing.

## Test 3: Chat/Rewrite Sync

1. Create or open a pattern in mobile.
2. Ask a chat question and generate a rewrite.
3. Open the same pattern in WordPress.
4. Confirm chat sessions/messages and rewrite history are visible.
5. In WordPress, continue the same chat and run a new rewrite.
6. Re-open the same pattern in mobile.
7. Confirm the new WordPress chat messages and rewrite appear in mobile history.

Expected result: mobile-created and WordPress-created chat/rewrite history both persist through the shared platform and appear on both surfaces.

## Test 4: Projects Sync

1. In WordPress, open the StitchSense Projects tab.
2. Create a project from a saved library pattern.
3. Update its status, stage, progress, and notes from the web card.
4. Run the web card's sync validation action.
5. Open the mobile Projects tab.
6. Confirm the project appears with the same linked pattern and updated fields.
7. Edit the same project in mobile.
8. Refresh the WordPress Projects tab.
9. Confirm the mobile edits appear on web.
10. Delete the project from web or mobile and confirm it disappears from the other surface without deleting the linked pattern.

Expected result: project create, update, validation, and soft delete all round-trip through the shared platform API while the linked pattern remains intact.

## Known Gaps Before Full Pass

- PHP syntax validation still needs PHP CLI or the WordPress runtime/container.
- Android build validation needs a Gradle wrapper and JDK 17+.
- RevenueCat iOS SPM package must be added manually in Xcode while XcodeGen 1.9.0 is in use.
