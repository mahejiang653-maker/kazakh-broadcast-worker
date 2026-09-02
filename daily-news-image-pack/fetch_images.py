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

API = "https://commons.wikimedia.org/w/api.php"
UA = "daily-news-image-pack/1.1 (news image collection; contact via GitHub repository)"
MIN_W = int(os.getenv("MIN_WIDTH", "1600"))
MIN_H = int(os.getenv("MIN_HEIGHT", "900"))
IMAGES_PER_NEWS = int(os.getenv("IMAGES_PER_NEWS", "3"))
SEARCH_LIMIT = int(os.getenv("SEARCH_LIMIT", "50"))
TIMEOUT = 35

ROOT = Path(__file__).resolve().parent
INPUT = ROOT / "news.json"
OUT = ROOT / "output"
IMG_DIR = OUT / "images"

REJECT_WORDS = {
    "map", "diagram", "chart", "graph", "scheme", "schematic", "illustration",
    "drawing", "painting", "poster", "logo", "icon", "render", "rendering",
    "infographic", "animation", "cartoon", "collage", "coat of arms", "seal",
    "flag map", "locator map", "route map", "svg"
}
LEADER_WORDS = {
    "president", "prime minister", "king", "queen", "trump", "putin", "zelensky",
    "khamenei", "xi jinping", "biden", "macron", "modi", "erdogan"
}
POSITIVE_WORDS = {
    "photograph", "photo", "photography", "aerial", "satellite", "facility", "ship",
    "tanker", "building", "infrastructure", "station", "terminal", "port", "tower",
    "worker", "server", "data center", "cityscape", "landscape", "construction",
    "solar", "rail", "freight", "cargo", "substation", "power line"
}
ALLOWED_LICENSE_MARKERS = (
    "cc by", "cc-by", "cc0", "public domain", "pd-", "creative commons",
)

session = requests.Session()
session.headers.update({"User-Agent": UA})


def strip_html(text: str) -> str:
    return re.sub(r"<[^>]+>", " ", text or "")


def ext_value(ext: dict[str, Any], key: str) -> str:
    return strip_html((ext.get(key) or {}).get("value", "")).strip()


def text_blob(page: dict[str, Any]) -> str:
    ii = (page.get("imageinfo") or [{}])[0]
    ext = ii.get("extmetadata") or {}
    fields = []
    for k in ("ImageDescription", "Categories", "ObjectName", "Credit", "Artist", "LicenseShortName", "UsageTerms"):
        fields.append(ext_value(ext, k))
    fields.append(page.get("title", ""))
    return " ".join(fields).lower()


def has_reusable_license(page: dict[str, Any]) -> bool:
    ii = (page.get("imageinfo") or [{}])[0]
    ext = ii.get("extmetadata") or {}
    blob = " ".join([
        ext_value(ext, "LicenseShortName"),
        ext_value(ext, "License"),
        ext_value(ext, "UsageTerms"),
        ext_value(ext, "Copyrighted"),
    ]).lower()
    if any(x in blob for x in ALLOWED_LICENSE_MARKERS):
        return True
    return ext_value(ext, "Copyrighted").lower() in {"false", "no"}


def candidate_score(page: dict[str, Any]) -> int:
    ii = (page.get("imageinfo") or [{}])[0]
    mime = (ii.get("mime") or "").lower()
    if mime not in {"image/jpeg", "image/png", "image/webp"}:
        return -999
    w, h = int(ii.get("width") or 0), int(ii.get("height") or 0)
    if w < MIN_W or h < MIN_H:
        return -999
    blob = text_blob(page)
    if any(word in blob for word in REJECT_WORDS):
        return -999
    if any(word in blob for word in LEADER_WORDS):
        return -999
    if not has_reusable_license(page):
        return -999
    score = 0
    score += min(w * h // 1_000_000, 20)
    ratio = w / h if h else 0
    if 1.45 <= ratio <= 2.0:
        score += 10
    elif ratio >= 1.2:
        score += 5
    score += sum(2 for word in POSITIVE_WORDS if word in blob)
    if any(x in blob for x in ("2026", "2025", "2024")):
        score += 5
    if "public domain" in blob or "cc0" in blob:
        score += 3
    elif "cc by" in blob or "cc-by" in blob:
        score += 2
    return score


def commons_search(query: str) -> list[dict[str, Any]]:
    params = {
        "action": "query",
        "format": "json",
        "generator": "search",
        "gsrsearch": query,
        "gsrnamespace": 6,
        "gsrlimit": SEARCH_LIMIT,
        "prop": "imageinfo",
        "iiprop": "url|size|mime|mediatype|extmetadata",
        "iiurlwidth": 3840,
        "redirects": 1,
    }
    r = session.get(API, params=params, timeout=TIMEOUT)
    r.raise_for_status()
    pages = list((r.json().get("query", {}).get("pages", {}) or {}).values())
    pages.sort(key=candidate_score, reverse=True)
    return [p for p in pages if candidate_score(p) > -999]


def normalize_query(query: str) -> str:
    q = re.sub(r"\b20\d{2}\b", " ", query)
    q = re.sub(r"\s+", " ", q).strip()
    return q


def query_variants(query: str, title: str) -> list[tuple[str, str]]:
    """Return (tier, query), from direct/recent to broad fallback."""
    base = query.strip()
    no_year = normalize_query(base)
    variants: list[tuple[str, str]] = []
    if base:
        variants.append(("A-direct", base))
    if no_year and no_year != base:
        variants.append(("B-related", no_year))
    # Search recent years as a preference, never a hard requirement.
    for year in ("2026", "2025", "2024"):
        if no_year and year not in no_year:
            variants.append(("A-recent", f"{no_year} {year}"))
    # Add photo-oriented terms that Commons indexes well.
    if no_year:
        variants.append(("B-photo", f"{no_year} photograph"))
        variants.append(("B-file", f"intitle:{no_year}"))
    title_no_year = normalize_query(title)
    if title_no_year and title_no_year.lower() not in {v[1].lower() for v in variants}:
        variants.append(("C-topic", title_no_year))

    seen: set[str] = set()
    out: list[tuple[str, str]] = []
    for tier, q in variants:
        key = q.lower().strip()
        if key and key not in seen:
            seen.add(key)
            out.append((tier, q.strip()))
    return out


def safe_ext(mime: str) -> str:
    return {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}.get(mime, ".jpg")


def license_info(ext: dict[str, Any]) -> dict[str, str]:
    return {
        "license": ext_value(ext, "LicenseShortName"),
        "license_url": ext_value(ext, "LicenseUrl"),
        "artist": ext_value(ext, "Artist"),
        "credit": ext_value(ext, "Credit"),
        "date_time_original": ext_value(ext, "DateTimeOriginal") or ext_value(ext, "DateTime"),
    }


def download_candidate(page: dict[str, Any], path: Path) -> dict[str, Any] | None:
    ii = (page.get("imageinfo") or [{}])[0]
    url = ii.get("thumburl") or ii.get("url")
    if not url:
        return None
    r = session.get(url, timeout=TIMEOUT)
    r.raise_for_status()
    data = r.content
    try:
        im = Image.open(io.BytesIO(data))
        im.verify()
        im = Image.open(io.BytesIO(data))
        w, h = im.size
    except Exception:
        return None
    if w < MIN_W or h < MIN_H:
        return None
    path.write_bytes(data)
    ext = ii.get("extmetadata") or {}
    meta = license_info(ext)
    return {
        "file": path.name,
        "width": w,
        "height": h,
        "mime": ii.get("mime", ""),
        "commons_title": page.get("title", ""),
        "source": "Wikimedia Commons",
        "source_page": ii.get("descriptionurl", ""),
        "download_url": url,
        **meta,
    }


def main() -> int:
    if not INPUT.exists():
        print(f"Missing input: {INPUT}", file=sys.stderr)
        return 2
    news = json.loads(INPUT.read_text(encoding="utf-8"))
    if len(news) != 13:
        raise ValueError("news.json must contain exactly 13 news items")
    ids = [int(n["id"]) for n in news]
    if ids != list(range(1, 14)):
        raise ValueError("news ids must be exactly 1..13 in order")

    shutil.rmtree(OUT, ignore_errors=True)
    IMG_DIR.mkdir(parents=True, exist_ok=True)
    manifest: dict[str, Any] = {
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "rules": {
            "news_count": 13,
            "images_per_news": IMAGES_PER_NEWS,
            "target_images": 13 * IMAGES_PER_NEWS,
            "min_width": MIN_W,
            "min_height": MIN_H,
            "real_images_only": True,
            "ai_generated_images": False,
            "programmatic_diagrams": False,
            "reusable_license_required": True,
            "fallback_order": ["recent/direct", "same place/facility/topic", "related real photography"],
        },
        "items": [],
    }

    used_titles: set[str] = set()
    total = 0
    for item in news:
        nid = int(item["id"])
        title = str(item["title"])
        raw_queries = item.get("queries") or [title]
        expanded: list[tuple[str, str]] = []
        seen_q: set[str] = set()
        for q in raw_queries:
            for tier, v in query_variants(str(q), title):
                k = v.lower()
                if k not in seen_q:
                    seen_q.add(k)
                    expanded.append((tier, v))

        record = {"id": nid, "title": title, "queries": raw_queries, "expanded_queries": expanded, "images": [], "missing": 0}
        print(f"\n[{nid:02d}] {title}")

        for tier, query in expanded:
            if len(record["images"]) >= IMAGES_PER_NEWS:
                break
            print(f"  {tier}: {query}")
            try:
                candidates = commons_search(query)
            except Exception as e:
                print(f"  search failed: {e}")
                continue
            for page in candidates:
                if len(record["images"]) >= IMAGES_PER_NEWS:
                    break
                commons_title = page.get("title", "")
                if commons_title in used_titles:
                    continue
                ii = (page.get("imageinfo") or [{}])[0]
                ext = safe_ext((ii.get("mime") or "").lower())
                idx = len(record["images"]) + 1
                path = IMG_DIR / f"{nid:02d}_{idx}{ext}"
                try:
                    meta = download_candidate(page, path)
                except Exception as e:
                    print(f"    download failed: {commons_title}: {e}")
                    continue
                if meta:
                    meta["search_tier"] = tier
                    meta["search_query"] = query
                    used_titles.add(commons_title)
                    record["images"].append(meta)
                    total += 1
                    print(f"    + {path.name} {meta['width']}x{meta['height']} | {commons_title}")
            time.sleep(0.15)

        record["missing"] = max(0, IMAGES_PER_NEWS - len(record["images"]))
        manifest["items"].append(record)

    manifest["downloaded_images"] = total
    manifest["missing_images"] = 13 * IMAGES_PER_NEWS - total
    (OUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")

    readme_lines = [
        "每日新闻相关图片包",
        "",
        f"实际下载：{total} 张；目标：{13 * IMAGES_PER_NEWS} 张。",
        "图片来源为 Wikimedia Commons 可再利用授权或公共领域素材，详细许可与来源见 manifest.json。",
        "搜索顺序：近期直接相关 → 同地点/设施/主题 → 相关真实摄影。",
        "未找到合格图片的新闻不会以AI图、程序示意图或低分辨率图片补齐。",
        "",
    ]
    for r in manifest["items"]:
        readme_lines.append(f"{r['id']:02d}. {r['title']} — {len(r['images'])}/{IMAGES_PER_NEWS} 张")
    (OUT / "README_来源与许可.txt").write_text("\n".join(readme_lines), encoding="utf-8")

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
