import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

type Geometry = { type: string; coordinates?: any; geometries?: Geometry[] };

const ALIASES: Record<string, string[]> = {
  "约旦河西岸": ["West Bank"],
  "加沙地带": ["Gaza Strip"],
  "戈兰高地": ["Golan Heights"],
  "克里米亚": ["Crimea"],
  "顿巴斯": ["Donbas"],
  "台湾海峡": ["Taiwan Strait"],
  "红海": ["Red Sea"],
  "波斯湾": ["Persian Gulf"],
  "霍尔木兹海峡": ["Strait of Hormuz"],
};

function clean(s: unknown) {
  return String(s || "").normalize("NFKC").replace(/\s+/g, " ").trim();
}

function pointInRing(lon: number, lat: number, ring: any[]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    let xi = Number(ring[i]?.[0]);
    const yi = Number(ring[i]?.[1]);
    let xj = Number(ring[j]?.[0]);
    const yj = Number(ring[j]?.[1]);
    if (![xi, yi, xj, yj].every(Number.isFinite)) continue;
    if (Math.abs(xi - lon) > 180) xi += xi < lon ? 360 : -360;
    if (Math.abs(xj - lon) > 180) xj += xj < lon ? 360 : -360;
    const hit = yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / ((yj - yi) || 1e-12) + xi;
    if (hit) inside = !inside;
  }
  return inside;
}

function pointInGeometry(lon: number, lat: number, g?: Geometry | null): boolean {
  if (!g?.coordinates) return false;
  if (g.type === "Polygon") return !!g.coordinates?.[0] && pointInRing(lon, lat, g.coordinates[0]);
  if (g.type === "MultiPolygon") return (g.coordinates || []).some((p: any) => p?.[0] && pointInRing(lon, lat, p[0]));
  return false;
}

function isExactGeometry(g?: Geometry | null) {
  return !!g && ["Polygon", "MultiPolygon", "LineString", "MultiLineString"].includes(g.type);
}

function nameScore(query: string, row: any) {
  const q = clean(query).toLowerCase();
  const values = [row?.name, row?.display_name, row?.namedetails?.name, row?.address?.state, row?.address?.region, row?.address?.county, row?.address?.city]
    .map((x) => clean(x).toLowerCase())
    .filter(Boolean);
  let score = 0;
  for (const v of values) {
    if (v === q) score = Math.max(score, 18);
    else if (v.includes(q) || q.includes(v)) score = Math.max(score, 12);
  }
  return score;
}

async function nominatimSearch(q: string) {
  const p = new URLSearchParams({
    q,
    format: "jsonv2",
    polygon_geojson: "1",
    addressdetails: "1",
    namedetails: "1",
    limit: "10",
  });
  const r = await fetch(`https://nominatim.openstreetmap.org/search?${p.toString()}`, {
    headers: {
      Accept: "application/json",
      "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
      "User-Agent": "KazakhBroadcastNewsGlobe/1.0 (exact region boundary lookup)",
    },
  });
  if (!r.ok) return [];
  const rows = await r.json<any[]>();
  return Array.isArray(rows) ? rows : [];
}

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const location = clean(p.get("location"));
  const region = clean(p.get("region"));
  const country = clean(p.get("country"));
  const placeType = clean(p.get("placeType") || "地区");
  const lon = Number(p.get("lon"));
  const lat = Number(p.get("lat"));

  if (!location || !Number.isFinite(lon) || !Number.isFinite(lat)) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const queries: string[] = [];
  const push = (q: string) => { q = clean(q); if (q && !queries.includes(q)) queries.push(q); };

  push(location);
  for (const a of ALIASES[location] || []) push(a);
  if (region) push(`${location}, ${region}`);
  if (country && !/[\/]/.test(country)) push(`${location}, ${country}`);
  for (const [k, vals] of Object.entries(ALIASES)) {
    if (location.includes(k)) for (const a of vals) push(a);
  }

  const candidates: { row: any; score: number; query: string }[] = [];
  for (const q of queries.slice(0, 6)) {
    try {
      const rows = await nominatimSearch(q);
      for (const row of rows) {
        if (!isExactGeometry(row?.geojson)) continue;
        let score = nameScore(location, row);
        const cls = `${row?.class || ""} ${row?.type || ""} ${row?.addresstype || ""}`.toLowerCase();
        if (/boundary|administrative|protected_area|nature_reserve|water|bay|strait|sea|region/.test(cls)) score += 5;
        if (pointInGeometry(lon, lat, row.geojson)) score += 9;
        const rl = Number(row?.lon), rt = Number(row?.lat);
        if (Number.isFinite(rl) && Number.isFinite(rt)) {
          const dist = Math.hypot((rl - lon) * Math.cos((lat * Math.PI) / 180), rt - lat);
          score += Math.max(0, 6 - dist * 1.4);
        }
        if (/地区|区域|地带|治理区|保护区|园区|开发区|自贸区|港区|矿区|灾区|战区|前线|流域|河谷|湖区|山区|海域|海峡|海湾|景区|region|area/i.test(placeType)) score += 2;
        candidates.push({ row, score, query: q });
      }
    } catch {}
  }

  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  if (!best || best.score < 8) {
    return NextResponse.json({ exact: false, geometry: null, label: location }, {
      headers: { "Cache-Control": "public, max-age=3600, s-maxage=21600" },
    });
  }

  return NextResponse.json({
    exact: true,
    geometry: best.row.geojson,
    label: best.row.name || best.row.display_name || location,
    source: "OpenStreetMap Nominatim exact geometry",
    matchedQuery: best.query,
  }, {
    headers: { "Cache-Control": "public, max-age=86400, s-maxage=604800" },
  });
}
