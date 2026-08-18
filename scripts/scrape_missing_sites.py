import html
import json
import re
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
CANDIDATES = ROOT / "data" / "sites_missing_candidates.json"
OUTPUT = ROOT / "data" / "sites_missing_scraped.json"
FAILURES = ROOT / "data" / "sites_missing_scrape_failures.json"

DELAY = 1.7
CHECKPOINT_EVERY = 25

LATLNG_RE = re.compile(
    r'"latitude"\s*:\s*"(-?\d+\.\d+)"\s*,\s*"longitude"\s*:\s*"(-?\d+\.\d+)"'
)
BREADCRUMB_RE = re.compile(
    r'<li class="breadcrumb-item\s*">\s*<a href="(/places-to-see/parks/[^"]+)">([^<]+)</a>',
    re.I,
)


def fetch(url: str) -> str | None:
    req = Request(url, headers={"User-Agent": "campcaster-research/0.1 (+contact: local dev)"})
    try:
        with urlopen(req, timeout=30) as resp:
            return resp.read().decode("utf-8", errors="ignore")
    except (HTTPError, URLError, TimeoutError) as exc:
        print(f"  fetch failed: {exc}")
        return None


def parse_site(page_html: str, name: str, url: str) -> dict | None:
    page_html = html.unescape(page_html)
    m = LATLNG_RE.search(page_html)
    if not m:
        return None
    lat, lng = float(m.group(1)), float(m.group(2))

    park_name = None
    park_url = None
    bm = BREADCRUMB_RE.search(page_html)
    if bm:
        park_url = bm.group(1)
        park_name = html.unescape(bm.group(2)).strip()

    return {
        "name": html.unescape(name).strip(),
        "sourceUrl": url,
        "lat": lat,
        "lng": lng,
        "parkName": park_name,
        "parkUrl": park_url,
    }


def main() -> None:
    candidates = json.loads(CANDIDATES.read_text(encoding="utf-8"))

    results = []
    failures = []
    if OUTPUT.exists():
        results = json.loads(OUTPUT.read_text(encoding="utf-8"))
    done_urls = {r["sourceUrl"] for r in results}
    remaining = [c for c in candidates if c["url"] not in done_urls]
    print(f"{len(candidates)} candidates, {len(results)} already done, {len(remaining)} remaining")

    for i, cand in enumerate(remaining, 1):
        time.sleep(DELAY)
        page_html = fetch(cand["url"])
        if page_html is None:
            failures.append({**cand, "reason": "fetch_error"})
            continue
        parsed = parse_site(page_html, cand["name"], cand["url"])
        if parsed is None:
            failures.append({**cand, "reason": "no_latlng"})
            continue
        results.append(parsed)

        if i % CHECKPOINT_EVERY == 0:
            OUTPUT.write_text(json.dumps(results, indent=2), encoding="utf-8")
            FAILURES.write_text(json.dumps(failures, indent=2), encoding="utf-8")
            print(f"...{i}/{len(remaining)} done, {len(results)} ok, {len(failures)} failed")

    OUTPUT.write_text(json.dumps(results, indent=2), encoding="utf-8")
    FAILURES.write_text(json.dumps(failures, indent=2), encoding="utf-8")
    print(f"Done. {len(results)} scraped ok, {len(failures)} failed.")


if __name__ == "__main__":
    main()
