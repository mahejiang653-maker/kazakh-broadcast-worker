"""Rebuild the bundled WGS84 reference route from the publisher's trail JSON.

Usage: python3 scripts/package-r6-duku-route.py /path/to/ridetrail-3631.json
Source: https://map.giant.com.cn/index.php/index/ridetrail.html?id=3631
Requires shapely. This riding reference includes stops, not a surveyed road axis.
"""
import json
import pathlib
import sys
from shapely.geometry import LineString

raw = json.loads(pathlib.Path(sys.argv[1]).read_text())
coordinates = []
for section in raw['data']['trail']:
    for pair in section.get('path', '').split(';'):
        if pair.strip():
            p = [float(x) for x in pair.split(',')]
            if len(p) != 2 or abs(p[0]) > 180 or abs(p[1]) > 90:
                raise ValueError('Invalid reference coordinate')
            coordinates.append(p)
if len(coordinates) < 100:
    raise ValueError('Incomplete reference route')
line = LineString(coordinates).simplify(.0007, preserve_topology=False)
root = pathlib.Path(__file__).resolve().parents[1]
target = root / 'public/news-globe-geography-v1.json'
catalog = json.loads(target.read_text())
catalog['features']['duku-highway']['geometry'] = {
    'type': 'LineString',
    'coordinates': [[round(x, 6), round(y, 6)] for x, y in line.coords],
}
target.write_text(json.dumps(catalog, ensure_ascii=False, separators=(',', ':')) + '\n')
print(json.dumps({'route': 'duku-highway', 'vertices': len(line.coords)}))
