import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

const CHINA_BASE =
  "https://raw.githubusercontent.com/JayMuShui/chinese-global-compliant-geodata/main/src/geojson/countries/as/chn/global";

const CHINA_LEVEL_URL: Record<number, string> = {
  1: `${CHINA_BASE}/chn-level-1.json`,
  2: `${CHINA_BASE}/chn-level-2.json`,
  3: `${CHINA_BASE}/chn-level-3.json`,
};

type Geometry = {
  type: string;
  coordinates?: any;
  geometries?: Geometry[];
};

type Feature = {
  type: "Feature";
  properties?: Record<string, any>;
  geometry?: Geometry | null;
};

function pointInRing(lon: number, lat: number, ring: any[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    let xi = Number(ring[i]?.[0]);
    const yi = Number(ring[i]?.[1]);
    let xj = Number(ring[j]?.[0]);
    const yj = Number(ring[j]?.[1]);
    if (![xi, yi, xj, yj].every(Number.isFinite)) continue;
    if (Math.abs(xi - lon) > 180) xi += xi < lon ? 360 : -360;
    if (Math.abs(xj - lon) > 180) xj += xj < lon ? 360 : -360;
    const hit =
      yi > lat !== yj > lat &&
      lon < ((xj - xi) * (lat - yi)) / ((yj - yi) || 1e-12) + xi;
    if (hit) inside = !inside;
  }
  return inside;
}

function pointInGeometry(lon: number, lat: number, g?: Geometry | null): boolean {
  if (!g?.coordinates) return false;
  if (g.type === "Polygon") {
    const p = g.coordinates as any[];
    return !!p[0] && pointInRing(lon, lat, p[0]);
  }
  if (g.type === "MultiPolygon") {
    return (g.coordinates as any[]).some((p) => p?.[0] && pointInRing(lon, lat, p[0]));
  }
  return false;
}

function chinaLevel(placeType: string, location: string): number | null {
  // Explicit placeType always wins. This prevents parent names such as
  // “台湾省新北市” or “新疆维吾尔自治区石河子市” from being mistaken for level-1.
  const t = String(placeType || "");
  if (/省|自治区|特别行政区|直辖市|province|state/i.test(t)) return 1;
  if (/自治州|地区|盟|城市|市|city|prefecture/i.test(t)) return 2;
  if (/县|区|旗|county|district/i.test(t)) return 3;
  if (/区域|region|area/i.test(t)) return 3;

  const l = String(location || "");
  if (/特别行政区|自治区|省|直辖市|province|state/i.test(l)) return 1;
  if (/自治州|地区|盟|城市|市|city|prefecture/i.test(l)) return 2;
  if (/县|区|旗|county|district/i.test(l)) return 3;
  return null;
}

function cleanName(s: unknown): string {
  return String(s || "")
    .normalize("NFKC")
    .replace(/[，,、.。·'\-()（）]/g, "")
    .replace(/\s+/g, "")
    .replace(/特别行政区|维吾尔自治区|壮族自治区|回族自治区|自治区|自治州|自治县|地区|省|市|县|区|旗|盟|共和国|联邦|州|邦|首都大区/g, "")
    .replace(/province|state|city|county|district|region|municipality|capitalregion|capital/gi, "")
    .toLowerCase();
}

function scoreNameMatch(q: string, values: unknown[]): number {
  const qq = cleanName(q);
  if (!qq) return 0;
  let best = 0;
  for (const v of values) {
    const x = cleanName(v);
    if (!x) continue;
    if (x === qq) best = Math.max(best, 16);
    else if (x.includes(qq) || qq.includes(x)) best = Math.max(best, 11);
  }
  return best;
}

async function resolveChinaAdmin(
  location: string,
  placeType: string,
  lon: number,
  lat: number,
) {
  const level = chinaLevel(placeType, location);
  if (!level) return null;
  const r = await fetch(CHINA_LEVEL_URL[level], {
    headers: { Accept: "application/geo+json,application/json" },
  });
  if (!r.ok) return null;
  const fc = await r.json<any>();
  const features: Feature[] = Array.isArray(fc?.features) ? fc.features : [];
  const q = cleanName(location);

  const named = features.filter((f) => {
    const p = f.properties || {};
    const names = [p.full_name, p.name, p.city, p.province].map(cleanName).filter(Boolean);
    return names.some((n) => q.includes(n) || n.includes(q));
  });

  // Never silently jump to some other same-level area just because the final
  // story coordinate happens to be inside it. Name match comes first, then coordinate validation.
  let chosen = named.find((f) => pointInGeometry(lon, lat, f.geometry));
  if (!chosen && named.length === 1) chosen = named[0];
  if (!chosen?.geometry) return null;

  return {
    geometry: chosen.geometry,
    label: chosen.properties?.full_name || chosen.properties?.name || location,
    source: `天地图源中国行政区 level-${level}`,
    approximate: false,
  };
}

function radiusKmFor(placeType: string): number {
  const t = placeType.toLowerCase();
  if (/国家|country/.test(t)) return 260;
  if (/省|州|state|province/.test(t)) return 150;
  if (/县|区|county|district/.test(t)) return 55;
  if (/城市|city/.test(t)) return 28;
  if (/海|海域|海峡|湾|ocean|sea|strait|gulf/.test(t)) return 170;
  if (/河|江|river/.test(t)) return 55;
  if (/山|峰|mountain|peak/.test(t)) return 35;
  if (/湖|lake/.test(t)) return 65;
  return 85;
}

async function resolveNominatim(
  location: string,
  country: string,
  countryIso3: string,
  placeType: string,
  lon: number,
  lat: number,
) {
  const q = [location, country].filter(Boolean).join(", ");
  const params = new URLSearchParams({
    q,
    format: "jsonv2",
    polygon_geojson: "1",
    addressdetails: "1",
    limit: "8",
  });
  const r = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
    headers: {
      Accept: "application/json",
      "User-Agent": "KazakhBroadcastNewsGlobe/1.0 (news globe geographic highlight)",
      "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.6",
    },
  });
  if (!r.ok) return null;
  const rows = await r.json<any[]>();
  if (!Array.isArray(rows) || !rows.length) return null;

  const typeText = placeType.toLowerCase();
  const scored = rows
    .map((row) => {
      let score = 0;
      const d = String(row.display_name || "");
      const cls = `${row.class || ""} ${row.type || ""} ${row.addresstype || ""}`.toLowerCase();
      score += scoreNameMatch(location, [d, row.name, row.namedetails?.name, row.address?.state, row.address?.province, row.address?.city, row.address?.county, row.address?.municipality, row.address?.region, row.address?.suburb]);
      score += scoreNameMatch(country, [d, row.address?.country]);
      if (countryIso3 && String(row.address?.ISO3166_1_alpha3 || "").toUpperCase() === countryIso3) score += 6;
      if (/city|town|village|municipality/.test(cls) && /城市|市|city/.test(typeText)) score += 4;
      if (/state|province|region/.test(cls) && /省|州|区域|state|province|region/.test(typeText)) score += 4;
      if (/river|waterway/.test(cls) && /河|江|river/.test(typeText)) score += 4;
      if (/sea|ocean|strait|gulf|bay/.test(cls) && /海|湾|海峡|sea|strait|gulf/.test(typeText)) score += 4;
      if (/peak|mountain|ridge/.test(cls) && /山|峰|mountain|peak/.test(typeText)) score += 4;
      const rl = Number(row.lon), rt = Number(row.lat);
      if (Number.isFinite(rl) && Number.isFinite(rt)) {
        const dist = Math.hypot((rl - lon) * Math.cos((lat * Math.PI) / 180), rt - lat);
        score += Math.max(0, 7 - dist * 2);
      }
      if (row.geojson && pointInGeometry(lon, lat, row.geojson)) score += 10;
      if (/administrative|boundary/.test(cls) && /省|州|区域|地区|state|province|region|市|县|区|city|county|district/.test(typeText)) score += 5;
      if (/country/.test(cls) && /国家|country/.test(typeText)) score += 5;
      return { row, score };
    })
    .sort((a, b) => b.score - a.score);

  const row = scored[0]?.row;
  if (!row) return null;
  const g = row.geojson;
  if (g && ["Polygon", "MultiPolygon", "LineString", "MultiLineString"].includes(g.type)) {
    return {
      geometry: g,
      label: row.display_name || location,
      source: "OpenStreetMap Nominatim",
      approximate: false,
    };
  }
  return {
    geometry: { type: "Point", coordinates: [lon, lat] },
    label: row.display_name || location,
    source: "OpenStreetMap Nominatim",
    approximate: true,
    radiusKm: radiusKmFor(placeType),
  };
}

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const location = String(p.get("location") || "").trim();
  const placeType = String(p.get("placeType") || "地区").trim();
  const country = String(p.get("country") || "").trim();
  const countryIso3 = String(p.get("countryIso3") || "").trim().toUpperCase();
  const lon = Number(p.get("lon"));
  const lat = Number(p.get("lat"));

  if (!location || !Number.isFinite(lon) || !Number.isFinite(lat)) {
    return NextResponse.json({ error: "invalid location/lon/lat" }, { status: 400 });
  }

  try {
    // Force a real administrative boundary for the West Bank instead of an approximate box.
    if (/约旦河西岸|west\s*bank/i.test(location)) {
      const wb = await resolveNominatim("West Bank", "Palestine", "PSE", "地区", 35.25, 31.95);
      if (wb?.geometry && !wb.approximate) {
        return NextResponse.json({ ...wb, label: "约旦河西岸" }, {
          headers: { "Cache-Control": "public, max-age=86400, s-maxage=604800" },
        });
      }
    }

    if (countryIso3 === "CHN" && chinaLevel(placeType, location)) {
      const china = await resolveChinaAdmin(location, placeType, lon, lat);
      if (china) {
        return NextResponse.json(china, {
          headers: { "Cache-Control": "public, max-age=86400, s-maxage=604800" },
        });
      }
    }

    const result = await resolveNominatim(location, country, countryIso3, placeType, lon, lat);
    if (result) {
      return NextResponse.json(result, {
        headers: { "Cache-Control": "public, max-age=86400, s-maxage=604800" },
      });
    }
  } catch (error) {
    console.error("geo-highlight lookup failed", error);
  }

  return NextResponse.json({
    geometry: { type: "Point", coordinates: [lon, lat] },
    label: location,
    source: "fallback",
    approximate: true,
    radiusKm: radiusKmFor(placeType),
  });
}
