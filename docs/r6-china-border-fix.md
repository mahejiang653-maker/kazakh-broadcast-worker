# R6 China boundary ownership

The original cleanup removed WORLD entities owned by CHN. In the current mixed
dataset, none of the 559 generic CHN edges have an exact endpoint match with a
neighbor. Neighbor-side frontiers therefore survived next to the detailed China
outline. The active V51 country fill also used the coarser WORLD China feature.

The R6-only pre-main ownership layer reconciles borders once after loadBorders:

- Keep the existing local China outline and all 514 of its outer rings intact.
- Build temporary spatial/ray indexes of its largest mainland polygon.
- Replace a single-owner generic edge only when BOTH endpoints are inside that
  mainland or within an 18 km bounded join tolerance of its outer boundary.
- Preserve shared foreign borders, coastal continuations with an endpoint outside
  the join, and all authoritative island rings. No new geographic line is created.
- Remove superseded entities from Cesium, borderEntities, and country references.
  The indexes are local to reconciliation; no timer, RAF, or listener is added.

The current WORLD snapshot removes 177 edges across 14 neighboring countries.
Tests pin these per-country counts and explicitly preserve the Vietnam and Korea
coastal continuations and the Russia/Korea shared border. The fixture comes from
the existing WORLD URL:
https://raw.githubusercontent.com/GIStudio/SpatialHarness/main/demo/data/ne_110m_admin_0_countries.geojson

V51 country fill uses the existing authoritative China geometry. Camera fitting
still uses its original feature; news data, camera math, UI, and trajectories are
unchanged. Only the new layer and V51 use the new R6 cache key. Frozen Y1 files are
not edited.

Local validation: production build and 57 project tests pass, including six new
border tests. The production workflow additionally checks the actual boundary
counts, China highlight fill, eight geographic screenshots, a narrow mobile China
story, all 13 stories, 40 rapid switches, and four viewport sizes. Its screenshots
must be inspected after deployment; a unit pass alone is not visual acceptance.

The existing outline's source metadata is preserved verbatim. This fix does not
introduce a new China map source or certify its legal provenance. The join handles
the current source generalization; a materially changed upstream dataset requires
the same ownership/coastline regression checks again.
