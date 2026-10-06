# V52 A1 R6: reference-guided overlay optimization

Baseline: `a734db6` (latest daily R6, including the 2026-10-07 locked news).
Reference studied: [bilawalsidhu/gods-eye-view](https://github.com/bilawalsidhu/gods-eye-view),
commit `e685449a52550775a5279cef1b9090ef24d507a2`.

Relevant reference modules:

| Reference module | Useful principle | R6 application |
| --- | --- | --- |
| `src/annotations/screenAnnotationRenderer.js` | Maintain active annotation records; release the postRender listener and caches | Index only point/label entities via Cesium collectionChanged; release the index and listeners on teardown |
| `src/overlays/worldOverlay.js` | Defer inactive overlay work; own listeners and cleanup | Skip hidden-page work and skip projections when all labels have already settled |
| `src/app/application.js` | Resources and cancellation have explicit owners | One cancellable batch of overview-cleanup timers; navigation serial rejects stale callbacks |
| `src/renderGovernor.js` | Continuous rendering must be owned by every animation | Deferred: R6 still has legacy CallbackProperty effects whose render ownership is not fully declared |

This is an independent, small implementation of those principles. No reference
code, third-party datasets, imagery, models, API keys, or dependencies were copied.

## Scope

- Preserve the existing candidate offsets, co-located-marker exception, label lock,
  country boundaries, animation timing, camera calculations, 16:9 viewport, news
  schema and current daily news.
- Hidden point graphics do not participate as collision obstacles.
- Collection changes update the small point/label index, including graphics assigned
  after entity creation. Border-only entities are inspected once when added.
- Settled labels do not trigger further world-to-screen projections. Equal offsets
  are not assigned repeatedly, avoiding needless Cesium property-change events.
- Only the latest overview batch retains the existing nine cleanup delays.
  Entering a story cancels that batch. A saved callback also checks navSerial.
- Preserve bfcache listeners; remove collision listeners on a final pagehide.
- Give the two changed scripts new cache keys; preserve all 31 script identities
  and their order. Earlier Y1 release assets remain isolated.

## Verification

Local `npm test`: production build and 51 tests passed, including 10 new overlay
lifecycle regressions. The 8,000-border test confirms a single initial collection
read and no further projections after a label settles; this measures work avoided,
not an Android frame-rate improvement.

The production verifier additionally checks exact index membership after every
story, 40 rapid prev/next clicks, four viewport sizes, eight repeated overview
clicks followed immediately by a story, and final cleanup. It saves report.json
and unmodified screenshots in the corresponding GitHub Actions artifact.

Cloud Browser currently cannot initialize WebGL. Production rendering is checked
using the existing GitHub Actions Chromium defaults, without forced GPU backends
or security flags. Android hardware performance and long-duration GPU disposal
remain outside this regression's coverage.
