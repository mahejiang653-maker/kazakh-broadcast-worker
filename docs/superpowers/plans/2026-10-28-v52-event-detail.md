# V52 Event Detail Implementation Plan

**Goal:** Extend the existing V52 playback with verified, precision-aware event location closeups and optional attributed images without breaking legacy data or navigation.

**Architecture:** Keep the existing V52 country and point sequence. Add a small optional detail module before the daily adapter, normalize only explicitly verified event coordinates, and invoke its cancellable flights from the existing director before scene completion. Retain one Cesium viewer and the existing Esri imagery provider. Require editorial location/image verification and metadata; skip unavailable images.

**Tech stack:** CesiumJS, browser JavaScript, Node test runner, Playwright, existing Cloudflare Worker / GitHub Actions.

## Constraints

- Base: 127d8418376c1ccb48b65ee781b57de7b55859f4; remote rollback branch `backup/v52-before-event-detail-20261028-127d841`.
- Preserve legacy Top10 imports, country outlines, flags, controls, and replay; a country-only record has no invented marker.
- Only verified `exact` or `site` coordinates permit facility-level flights; city and region never claim facility precision.
- A photo requires explicit verified location match, source, license, date, and an HTTPS URL. The metadata is an editorial attestation, not automated fact checking.
- Never simulate a real event as footage. Label historical imagery and acknowledge basemap dates are variable and not live.
- Playback, image failures, navigation and pause must be cancellable and nonblocking.

## Review focus

- Invalid or unverified site coordinates fall back to valid legacy locations.
- Missing, mismatched, failed or slow photo leaves the map visible.
- Rapid navigation/replay/overview cancels old flights and image callbacks.
- Camera bounds and optional presets remain finite and appropriate to precision.
- Country-only and two-country stories retain existing behavior.

## Tasks

1. Add failing behavioral tests for precision, coordinate normalization, camera planning, safe photo metadata, cancellation and stage order; implement the optional detail module until green.
2. Integrate normalizing into the V52 daily adapter, and call the detail sequence inside the existing director; test legacy and new JSON, navigation, pause and autoplay.
3. Wire the V52 entry and mobile performance adaptation; test script order and resource limits.
4. Add four sourced historical/site acceptance fixtures and real Chromium tests, with no fabricated news events; run full suite, browser and provenance checks.
5. Review changes, publish via existing main → CI → Worker workflow only when verification allows, and check the deployed site. Keep rollback branch intact.
