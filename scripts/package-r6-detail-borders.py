"""Build R6's optional close-view line tiles from Natural Earth 1:10m.

Usage: python3 scripts/package-r6-detail-borders.py /path/to/ne_10m_admin_0_countries.geojson
Requires shapely. Country highlight/camera data and the existing China outline
remain separate and unchanged. This asset contains display lines only.
"""
import gzip
import hashlib
import json
import math
import pathlib
import sys
from shapely.geometry import shape, box, LineString
from shapely.ops import unary_union, linemerge

root = pathlib.Path(__file__).resolve().parents[1]
raw = pathlib.Path(sys.argv[1]).read_bytes()
source = json.loads(raw)
china = shape(json.loads((root / 'public/news-globe-china-outline-v52.geojson').read_text())['geometry'])
# Never introduce a second outline from a different dataset next to China.
protected = china.buffer(.20)
lines = []
for feature in source['features']:
    if feature['properties']['ADM0_A3'] in ('CHN', 'TWN'):
        continue
    boundary = shape(feature['geometry']).boundary
    if boundary.intersects(protected):
        boundary = boundary.difference(protected)
    lines.append(boundary)
network = unary_union(lines)
tiles = {}
def parts(geometry):
    if geometry.is_empty:
        return
    if geometry.geom_type == 'LineString':
        yield geometry
    elif hasattr(geometry, 'geoms'):
        for child in geometry.geoms:
            yield from parts(child)
for y in range(18):
    for x in range(36):
        clip = network.intersection(box(x*10-180, y*10-90, x*10-170, y*10-80))
        segments = list(parts(clip))
        if not segments:
            continue
        merged = linemerge(segments)
        tile = []
        for line in parts(merged):
            coords = [[round(a, 4), round(b, 4)] for a,b in line.simplify(.003, preserve_topology=True).coords]
            if len(coords) >= 2 and len({tuple(p) for p in coords}) >= 2:
                tile.append(coords)
        tiles[f'{x}_{y}'] = tile
result = {'source':'Natural Earth 1:10m Admin 0 Countries', 'sourceURL':'https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-admin-0-countries/', 'sourceSHA256':hashlib.sha256(raw).hexdigest(), 'license':'public domain', 'tileDegrees':10, 'simplificationDegrees':.003, 'chinaOutline':'existing R6 authoritative outline retained', 'tiles':tiles}
target = root / 'public/news-globe-detail-borders-v1'
target.mkdir(exist_ok=True)
sizes = []
for y in range(18):
    band = {**result, 'tiles':{k:v for k,v in tiles.items() if k.endswith('_'+str(y))}}
    path = target / f'{y}.json.gz'
    with gzip.GzipFile(filename=str(path), mode='wb', mtime=0) as f:
        f.write(json.dumps(band,separators=(',',':'),ensure_ascii=False).encode())
    sizes.append(path.stat().st_size)
print(json.dumps({'tiles':len(tiles),'bytes':sum(sizes),'maxBandBytes':max(sizes),'sourceSHA256':result['sourceSHA256']}))
