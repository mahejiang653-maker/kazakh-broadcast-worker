from __future__ import annotations

import io
import json
import os
import re
import shutil
import sys
import time
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests
from PIL import Image

COMMONS_API = "https://commons.wikimedia.org/w/api.php"
OPENVERSE_API = "https://api.openverse.org/v1/images/"
UA = "daily-news-image-pack/3.0 (real-news-image collection; contact via GitHub repository)"
MIN_W = int(os.getenv("MIN_WIDTH", "1600"))
MIN_H = int(os.getenv("MIN_HEIGHT", "900"))
FALLBACK_MIN_W = int(os.getenv("FALLBACK_MIN_WIDTH", "1200"))
FALLBACK_MIN_H = int(os.getenv("FALLBACK_MIN_HEIGHT", "675"))
IMAGES_PER_NEWS = int(os.getenv("IMAGES_PER_NEWS", "3"))
SEARCH_LIMIT = int(os.getenv("SEARCH_LIMIT", "40"))
TIMEOUT = 35

ROOT = Path(__file__).resolve().parent
INPUT = ROOT / "news.json"
OUT = ROOT / "output"
IMG_DIR = OUT / "images"

REJECT_WORDS = {
    "map", "diagram", "chart", "graph", "scheme", "schematic", "illustration",
    "drawing", "painting", "poster", "logo", "icon", "render", "rendering",
    "infographic", "animation", "cartoon", "collage", "coat of arms", "seal",
    "locator map", "route map", "flag", "emblem", "3d model", "vector"
}
LEADER_WORDS = {
    "donald trump", "trump", "vladimir putin", "putin", "volodymyr zelensky",
    "zelensky", "ali khamenei", "khamenei", "xi jinping", "joe biden", "biden",
    "emmanuel macron", "narendra modi", "recep tayyip erdogan"
}
ALLOWED_LICENSES = {
    "cc0", "by", "by-sa", "pdm", "pdmark", "pdcert", "public domain",
    "cc by", "cc-by", "cc by-sa", "cc-by-sa"
}
STOPWORDS = {
    "the", "and", "with", "from", "photo", "photograph", "image", "images",
    "real", "recent", "latest", "news", "city", "facility", "site", "view",
    "china", "chinese", "2024", "2025", "2026"
}

session = requests.Session()
session.headers.update({"User-Agent": UA, "Accept": "application/json,text/plain,*/*"})


def strip_html(text: str) -> str:
    return re.sub(r"<[^>]+>", " ", text or "")


def norm(text: str) -> str:
    return re.sub(r"\s+", " ", strip_html(text).lower()).strip()


def significant_terms(query: str) -> list[str]:
    words = re.findall(r"[a-zA-Z][a-zA-Z0-9-]{2,}", query.lower())
    return [w for w in words if w not in STOPWORDS][:8]


def looks_visual_real(blob: str) -> bool:
    b = norm(blob)
    if any(x in b for x in REJECT_WORDS):
        return False
    if any(x in b for x in LEADER_WORDS):
        return False
    return True


def relevant_enough(blob: str, query: str) -> bool:
    terms = significant_terms(query)
    if not terms:
        return True
    b = norm(blob)
    # One strong content/place term is enough for related-photo fallback.
    return any(t in b for t in terms)


def verify_image_bytes(data: bytes, min_w: int, min_h: int) -> tuple[int, int, str] | None:
    try:
        im = Image.open(io.BytesIO(data))
        fmt = (im.format or "").upper()
        im.verify()
        im = Image.open(io.BytesIO(data))
        w, h = im.size
    except Exception:
        return None
    if w < min_w or h < min_h:
        return None
    if fmt not in {"JPEG", "PNG", "WEBP"}:
        return None
    return w, h, fmt


def fetch_bytes(url: str) -> bytes | None:
    if not url or not url.startswith(("http://", "https://")):
        return None
    try:
        r = session.get(url, timeout=TIMEOUT, allow_redirects=True)
        r.raise_for_status()
        ctype = (r.headers.get("content-type") or "").lower()
        if ctype and "image" not in ctype and "octet-stream" not in ctype:
            return None
        if len(r.content) < 20_000:
            return None
        return r.content
    except Exception:
        return None


def safe_ext_from_format(fmt: str) -> str:
    return {"JPEG": ".jpg", "PNG": ".png", "WEBP": ".webp"}.get(fmt, ".jpg")


def normalize_query(query: str) -> str:
    q = re.sub(r"\b20\d{2}\b", " ", query)
    q = re.sub(r"\s+", " ", q).strip()
    return q


def query_variants(query: str, title: str) -> list[tuple[str, str]]:
    base = query.strip()
    no_year = normalize_query(base)
    out: list[tuple[str, str]] = []
    if base:
        out.append(("A-direct", base))
    if no_year and no_year.lower() != base.lower():
        out.append(("B-related", no_year))
    if no_year:
        out.append(("B-photo", f"{no_year} photo"))
        out.append(("B-place", no_year.replace(" military ", " ").replace(" safety ", " ")))
    title_no_year = normalize_query(title)
    if title_no_year:
        out.append(("C-topic", title_no_year))
    seen: set[str] = set()
    dedup: list[tuple[str, str]] = []
    for tier, q in out:
        q = re.sub(r"\s+", " ", q).strip()
        k = q.lower()
        if q and k not in seen:
            seen.add(k)
            dedup.append((tier, q))
    return dedup


# ---------- Wikimedia Commons ----------

def commons_ext_value(ext: dict[str, Any], key: str) -> str:
    return strip_html((ext.get(key) or {}).get("value", "")).strip()


def commons_license_ok(page: dict[str, Any]) -> bool:
    ii = (page.get("imageinfo") or [{}])[0]
    ext = ii.get("extmetadata") or {}
    lic = " ".join([
        commons_ext_value(ext, "LicenseShortName"), commons_ext_value(ext, "License"),
        commons_ext_value(ext, "UsageTerms"), commons_ext_value(ext, "Copyrighted")
    ]).lower()
    if any(x in lic for x in ALLOWED_LICENSES):
        return True
    return commons_ext_value(ext, "Copyrighted").lower() in {"false", "no"}


def commons_blob(page: dict[str, Any]) -> str:
    ii = (page.get("imageinfo") or [{}])[0]
    ext = ii.get("extmetadata") or {}
    fields = [page.get("title", "")]
    for k in ("ImageDescription", "Categories", "ObjectName", "Credit", "Artist"):
        fields.append(commons_ext_value(ext, k))
    return " ".join(fields)


def commons_search(query: str, min_w: int, min_h: int) -> list[dict[str, Any]]:
    params = {
        "action": "query", "format": "json", "generator": "search",
        "gsrsearch": query, "gsrnamespace": 6, "gsrlimit": SEARCH_LIMIT,
        "prop": "imageinfo", "iiprop": "url|size|mime|mediatype|extmetadata",
        "iiurlwidth": 3840, "redirects": 1,
    }
    r = session.get(COMMONS_API, params=params, timeout=TIMEOUT)
    r.raise_for_status()
    pages = list((r.json().get("query", {}).get("pages", {}) or {}).values())
    good = []
    for p in pages:
        ii = (p.get("imageinfo") or [{}])[0]
        if (ii.get("mime") or "").lower() not in {"image/jpeg", "image/png", "image/webp"}:
            continue
        if int(ii.get("width") or 0) < min_w or int(ii.get("height") or 0) < min_h:
            continue
        blob = commons_blob(p)
        if not looks_visual_real(blob) or not relevant_enough(blob, query) or not commons_license_ok(p):
            continue
        w, h = int(ii.get("width") or 0), int(ii.get("height") or 0)
        ratio_bonus = 8 if h and 1.4 <= w / h <= 2.05 else 0
        recent_bonus = 4 if any(y in norm(blob) for y in ("2026", "2025", "2024")) else 0
        p["_score"] = min((w * h) // 1_000_000, 18) + ratio_bonus + recent_bonus
        good.append(p)
    good.sort(key=lambda p: p.get("_score", 0), reverse=True)
    return good


def commons_download(page: dict[str, Any], min_w: int, min_h: int) -> tuple[bytes, dict[str, Any]] | None:
    ii = (page.get("imageinfo") or [{}])[0]
    url = ii.get("thumburl") or ii.get("url")
    data = fetch_bytes(url)
    if not data:
        return None
    checked = verify_image_bytes(data, min_w, min_h)
    if not checked:
        return None
    w, h, fmt = checked
    ext = ii.get("extmetadata") or {}
    meta = {
        "width": w, "height": h, "format": fmt,
        "title": page.get("title", ""), "source": "Wikimedia Commons",
        "source_page": ii.get("descriptionurl", ""), "download_url": url,
        "license": commons_ext_value(ext, "LicenseShortName"),
        "license_url": commons_ext_value(ext, "LicenseUrl"),
        "artist": commons_ext_value(ext, "Artist"),
        "credit": commons_ext_value(ext, "Credit"),
        "date_time_original": commons_ext_value(ext, "DateTimeOriginal") or commons_ext_value(ext, "DateTime"),
    }
    return data, meta


# ---------- Openverse ----------

def openverse_license_ok(item: dict[str, Any]) -> bool:
    lic = str(item.get("license") or "").lower().strip()
    return lic in {"cc0", "by", "by-sa", "pdm", "pdmark", "pdcert"}


def openverse_blob(item: dict[str, Any]) -> str:
    tags = item.get("tags") or []
    tagtext = " ".join(str(t.get("name", "")) if isinstance(t, dict) else str(t) for t in tags)
    return " ".join([
        str(item.get("title") or ""), str(item.get("creator") or ""),
        str(item.get("source") or ""), str(item.get("category") or ""), tagtext
    ])


def openverse_search(query: str, min_w: int, min_h: int) -> list[dict[str, Any]]:
    params = {
        "q": query, "page_size": min(50, SEARCH_LIMIT),
        "license": "cc0,by,by-sa,pdm,pdmark,pdcert",
        "extension": "jpg,jpeg,png,webp",
    }
    r = session.get(OPENVERSE_API, params=params, timeout=TIMEOUT)
    if r.status_code == 429:
        return []
    r.raise_for_status()
    results = r.json().get("results") or []
    good = []
    for x in results:
        if not openverse_license_ok(x):
            continue
        w, h = int(x.get("width") or 0), int(x.get("height") or 0)
        if w and h and (w < min_w or h < min_h):
            continue
        blob = openverse_blob(x)
        if not looks_visual_real(blob) or not relevant_enough(blob, query):
            continue
        x["_score"] = min((w * h) // 1_000_000, 18) if w and h else 1
        if h and 1.4 <= w / h <= 2.05:
            x["_score"] += 8
        good.append(x)
    good.sort(key=lambda x: x.get("_score", 0), reverse=True)
    return good


def openverse_download(item: dict[str, Any], min_w: int, min_h: int) -> tuple[bytes, dict[str, Any]] | None:
    # Prefer original. Some hosts reject hotlinking, so try thumbnail second.
    urls = [item.get("url"), item.get("thumbnail")]
    for url in urls:
        data = fetch_bytes(str(url or ""))
        if not data:
            continue
        checked = verify_image_bytes(data, min_w, min_h)
        if not checked:
            continue
        w, h, fmt = checked
        return data, {
            "width": w, "height": h, "format": fmt,
            "title": item.get("title") or "", "source": f"Openverse/{item.get('source') or 'unknown'}",
            "source_page": item.get("foreign_landing_url") or item.get("detail_url") or "",
            "download_url": url or "", "license": item.get("license") or "",
            "license_url": item.get("license_url") or "", "artist": item.get("creator") or "",
            "credit": item.get("attribution") or "", "date_time_original": item.get("created_on") or "",
        }
    return None


def unique_key(meta: dict[str, Any]) -> str:
    return norm("|".join([str(meta.get("source", "")), str(meta.get("title", "")), str(meta.get("source_page", ""))]))


def collect_for_query(query: str, min_w: int, min_h: int) -> list[tuple[str, Any]]:
    out: list[tuple[str, Any]] = []
    try:
        out.extend(("commons", p) for p in commons_search(query, min_w, min_h))
    except Exception as e:
        print(f"    Commons search failed: {e}")
    try:
        out.extend(("openverse", x) for x in openverse_search(query, min_w, min_h))
    except Exception as e:
        print(f"    Openverse search failed: {e}")
    return out


def main() -> int:
    if not INPUT.exists():
        print(f"Missing input: {INPUT}", file=sys.stderr)
        return 2
    news = json.loads(INPUT.read_text(encoding="utf-8"))
    if len(news) != 13 or [int(n["id"]) for n in news] != list(range(1, 14)):
        raise ValueError("news.json must contain ids 1..13 in order")

    shutil.rmtree(OUT, ignore_errors=True)
    IMG_DIR.mkdir(parents=True, exist_ok=True)
    manifest: dict[str, Any] = {
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "version": "3.0",
        "rules": {
            "news_count": 13, "images_per_news": IMAGES_PER_NEWS,
            "target_images": 13 * IMAGES_PER_NEWS,
            "preferred_minimum": [MIN_W, MIN_H],
            "fallback_minimum": [FALLBACK_MIN_W, FALLBACK_MIN_H],
            "sources": ["Wikimedia Commons", "Openverse"],
            "real_images_only": True, "ai_generated_images": False,
            "programmatic_diagrams": False, "reusable_license_required": True,
            "fallback_order": ["direct/recent", "same place/facility/topic", "related real photography", "lower-resolution real photo fallback"],
        },
        "items": [],
    }

    used: set[str] = set()
    total = 0
    for item in news:
        nid = int(item["id"])
        title = str(item["title"])
        raw_queries = item.get("queries") or [title]
        expanded: list[tuple[str, str]] = []
        seen_q: set[str] = set()
        for q in raw_queries:
            for tier, v in query_variants(str(q), title):
                if v.lower() not in seen_q:
                    seen_q.add(v.lower())
                    expanded.append((tier, v))

        record = {"id": nid, "title": title, "queries": raw_queries, "images": [], "missing": 0}
        print(f"\n[{nid:02d}] {title}")

        # Two resolution passes: strict first, related-real fallback second.
        for quality, min_w, min_h in (("preferred", MIN_W, MIN_H), ("fallback", FALLBACK_MIN_W, FALLBACK_MIN_H)):
            if len(record["images"]) >= IMAGES_PER_NEWS:
                break
            for tier, query in expanded:
                if len(record["images"]) >= IMAGES_PER_NEWS:
                    break
                print(f"  {quality}/{tier}: {query}")
                candidates = collect_for_query(query, min_w, min_h)
                for source, candidate in candidates:
                    if len(record["images"]) >= IMAGES_PER_NEWS:
                        break
                    try:
                        result = commons_download(candidate, min_w, min_h) if source == "commons" else openverse_download(candidate, min_w, min_h)
                    except Exception as e:
                        print(f"    download failed: {e}")
                        continue
                    if not result:
                        continue
                    data, meta = result
                    key = unique_key(meta)
                    if not key or key in used:
                        continue
                    ext = safe_ext_from_format(str(meta.get("format") or "JPEG"))
                    idx = len(record["images"]) + 1
                    path = IMG_DIR / f"{nid:02d}_{idx}{ext}"
                    path.write_bytes(data)
                    meta["file"] = path.name
                    meta["search_query"] = query
                    meta["search_tier"] = tier
                    meta["quality_tier"] = quality
                    used.add(key)
                    record["images"].append(meta)
                    total += 1
                    print(f"    + {path.name} {meta['width']}x{meta['height']} | {meta['source']} | {meta['title']}")
                time.sleep(0.12)

        record["missing"] = max(0, IMAGES_PER_NEWS - len(record["images"]))
        manifest["items"].append(record)

    manifest["downloaded_images"] = total
    manifest["missing_images"] = 13 * IMAGES_PER_NEWS - total
    (OUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")

    lines = [
        "每日新闻相关图片包 v3", "",
        f"实际下载：{total} 张；目标：{13 * IMAGES_PER_NEWS} 张。",
        "来源：Wikimedia Commons + Openverse 聚合的可再利用真实摄影/卫星/设施图片。",
        "优先1600×900及以上；不足时允许降至1200×675的相关真实照片，绝不程序放大冒充高清。",
        "禁止AI新闻图、程序示意图、地图/图表/插画补位。详细来源、许可和检索层级见 manifest.json。", "",
    ]
    for r in manifest["items"]:
        lines.append(f"{r['id']:02d}. {r['title']} — {len(r['images'])}/{IMAGES_PER_NEWS} 张")
    (OUT / "README_来源与许可.txt").write_text("\n".join(lines), encoding="utf-8")

    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    zip_path = ROOT / f"daily-news-images-{stamp}.zip"
    if zip_path.exists():
        zip_path.unlink()
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as z:
        for p in sorted(IMG_DIR.iterdir()):
            z.write(p, arcname=p.name)
        z.write(OUT / "manifest.json", arcname="manifest.json")
        z.write(OUT / "README_来源与许可.txt", arcname="README_来源与许可.txt")
    print(f"\nZIP: {zip_path}")
    print(f"Downloaded {total}/{13 * IMAGES_PER_NEWS}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
