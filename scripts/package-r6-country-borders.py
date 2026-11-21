"""Package the pinned Natural Earth 10m country outlines for V52.

Run with ne_10m_admin_0_countries.geojson from the URL below. The output is
display geometry only; China's outline and existing country fills are separate.
Each arc contains original vertices (rounded to 1e-6 degrees). Shared frontiers
have the same arc ID in each owner's file, including reversed source rings.
"""

import base64
from collections import defaultdict
import hashlib
import json
from pathlib import Path
import re
import sys


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/news-globe-country-borders-v2'
SOURCE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_10m_admin_0_countries.geojson'
SHA256 = '239eec57ac17f100a11e2536cffc56752c318b50ae765b0918ff7aab4ce8f255'
SCALE = 1_000_000
MAX_ARC_VERTICES = 384
MAX_PART_CHARS = 70_000
ISO = re.compile(r'^[A-Z]{3}$')


def dump(x):
    return json.dumps(x, ensure_ascii=False, separators=(',', ':'))


def country_code(p):
    return p['ISO_A3'] if ISO.fullmatch(p['ISO_A3']) else {
        'France': 'FRA', 'Norway': 'NOR', 'Kosovo': 'XKX',
    }.get(p['NAME'])


def countries(source):
    for f in source['features']:
        p, g = f['properties'], f['geometry']
        iso = country_code(p)
        if not iso:
            continue
        polygons = g['coordinates'] if g['type'] == 'MultiPolygon' else [g['coordinates']]
        if iso == 'FRA':
            # Same metropolitan scope as the production country camera/fill.
            polygons = [poly for poly in polygons if all(-7 <= x <= 11 and 40 <= y <= 52.5 for x, y in poly[0])]
        yield iso, p, polygons


def chain_edges(edges):
    graph = defaultdict(list)
    for a, b in edges:
        graph[a].append(b)
        graph[b].append(a)
    left = set(edges)

    def walk(a, b):
        path = [a, b]
        left.remove(tuple(sorted((a, b))))
        while len(graph[b]) == 2:
            c = next(x for x in graph[b] if x != a)
            key = tuple(sorted((b, c)))
            if key not in left:
                break
            left.remove(key)
            path.append(c)
            a, b = b, c
        return path

    for a in sorted(x for x in graph if len(graph[x]) != 2):
        for b in sorted(graph[a]):
            if tuple(sorted((a, b))) in left:
                yield walk(a, b)
    for a, b in sorted(left):
        if (a, b) in left:
            yield walk(a, b)


def encode(path):
    out = bytearray()
    x, y = 0, 0
    for a, b in path:
        for delta in (a - x, b - y):
            n = 2 * delta if delta >= 0 else -2 * delta - 1
            while n >= 128:
                out.append(128 | (n & 127))
                n >>= 7
            out.append(n)
        x, y = a, b
    return base64.b64encode(out).decode('ascii')


def main(source_path):
    raw = source_path.read_bytes()
    assert hashlib.sha256(raw).hexdigest() == SHA256, 'Unexpected Natural Earth source version'
    source = list(countries(json.loads(raw)))
    coarse = json.loads((ROOT / 'tests/fixtures/r6-world-borders-20261007.geojson').read_text())
    baseline = {f['properties']['iso_a3'] for f in coarse['features']} | {'FRA', 'NOR', 'SGP'}
    edges = defaultdict(set)
    extras = {}
    for iso, p, polygons in source:
        for poly in polygons:
            for ring in poly:
                points = [(round(x*SCALE), round(y*SCALE)) for x, y in ring]
                for a, b in zip(points, points[1:]):
                    # The outer rings on both sides of ±180 include artificial
                    # closure edges along the dateline. A seam is not a border.
                    if a == b or (abs(a[0]) == abs(b[0]) == 180*SCALE):
                        continue
                    edges[tuple(sorted((a, b)))].add(iso)
        if iso not in baseline:
            # Add only a small, real camera/lookup feature for countries absent
            # in the 110m base map. The visible outline still comes from its pack.
            poly = max(polygons, key=lambda q: len(q[0]))
            ring = poly[0]
            step = max(1, (len(ring)-1)//96)
            extras[iso] = [p['NAME_ZH'] or p['NAME'], p['ISO_A2'], ring[:-1:step]+[ring[0]]]

    by_owners = defaultdict(list)
    for edge, owners in edges.items():
        by_owners[tuple(sorted(owners))].append(edge)
    by_iso = defaultdict(list)
    arc_id = 0
    for owners in sorted(by_owners):
        if owners == ('CHN',):
            continue  # Retain the existing authoritative outline exactly.
        for chain in chain_edges(by_owners[owners]):
            for i in range(0, len(chain)-1, MAX_ARC_VERTICES-1):
                line = chain[i:i+MAX_ARC_VERTICES]
                arc_id += 1
                record = [arc_id, ''.join(owners), encode(line)]
                for iso in owners:
                    if iso != 'CHN':
                        by_iso[iso].append((dump(record), len(line)-1))

    OUT.mkdir(exist_ok=True)
    packs = {}
    for old in OUT.glob('*.json'):
        old.unlink()
    for iso, lines in sorted(by_iso.items()):
        size, parts, items = 0, [], []

        def write_part():
            name = f'{iso}-{len(parts)}.json'
            (OUT / name).write_text('['+','.join(items)+']\n')
            parts.append(name)

        for line, _ in lines:
            if items and size+len(line)+1 > MAX_PART_CHARS:
                write_part()
                size, items = 0, []
            items.append(line)
            size += len(line)+1
        if items:
            write_part()
        packs[iso] = [sum(count for _, count in lines), parts]

    index = {'version': 2, 'source': 'Natural Earth 1:10m Admin 0 Countries',
             'sourceURL': SOURCE, 'sourceSHA256': SHA256, 'license': 'public domain',
             'packs': packs, 'extras': {k:v for k,v in sorted(extras.items()) if k in packs}}
    (OUT/'index.json').write_text(dump(index)+'\n', encoding='utf8')
    print(dump({'codes':len(packs), 'arcs':arc_id, 'extraCountries':len(index['extras']),
                'segments':sum(sum(n for _,n in lines) for lines in by_iso.values()),
                'files':len(list(OUT.glob('*.json'))), 'bytes':sum(p.stat().st_size for p in OUT.glob('*.json'))}))


if __name__ == '__main__':
    main(Path(sys.argv[1]))
