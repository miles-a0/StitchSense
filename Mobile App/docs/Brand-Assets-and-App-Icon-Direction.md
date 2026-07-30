# Brand Assets and App Icon Direction

## Source of Truth

The mobile app should use the same brand language as the web version.

Current web brand references:

- Logo asset: `assets/stitchsense-logo_new.png`
- Higher-resolution mobile brand source: `Mobile App/Logo.png`
- Shared design tokens: `shared/design-tokens/stitchsense.tokens.json`
- Web CSS palette: `assets/stitchsense-hub-pro.css`

## Confirmed Mobile Direction

- Use the existing StitchSense logo from the web project as the app brand mark.
- Use `Mobile App/Logo.png` as the current in-app brand image source where a larger asset is needed.
- Keep the warm cream background and brown/terracotta palette already defined in the shared tokens.
- Avoid introducing a new icon style family that would make mobile feel like a different product.

## iOS Asset Setup

Added to the iOS project:

- `ios/StitchSensePro/Assets.xcassets/BrandMark.imageset`
- `ios/StitchSensePro/Assets.xcassets/AppIcon.appiconset`
- `ios/StitchSensePro/Assets.xcassets/AccentColor.colorset`

The auth screen now uses `Image("BrandMark")` so the app visibly carries the web branding.

Current note:

- `Mobile App/Logo.png` is now square at `1246x1246`, so it is strong enough to act as the master source for in-app branding and final app-icon export work.
- The asset catalog is now using this square logo for the in-app brand mark and the current marketing-icon source image.

## App Icon Recommendation

Short term:

- Use the existing web logo as the base mark.
- Place it on a warm light background pulled from the web palette.
- Keep the icon visually simple and centered so it survives at small sizes.

Recommended production icon treatment:

1. warm cream background `#fff7ef`
2. centered StitchSense logo mark
3. subtle brown/terracotta framing if needed, but no tiny text
4. export the full iOS icon set from a single 1024x1024 master

## Remaining Work

- Generate the final multi-size iOS icon raster set from the approved 1024x1024 master.
- Mirror the same icon direction for Android adaptive icon assets.
- Capture store screenshots using the branded auth and library surfaces.
