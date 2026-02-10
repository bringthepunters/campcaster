import re
import time
import xml.etree.ElementTree as ET
from pathlib import Path
import json
from urllib.parse import urljoin, urlparse
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
OUTPUT_PATH = ROOT / "data" / "campground_urls.txt"
STATE_PATH = ROOT / "data" / "campground_url_discovery_state.json"

SITEMAP_URL = "https://www.parks.vic.gov.au/sitemap.xml"
REQUEST_DELAY_SECONDS = 2.3  # ~26 requests/minute

WHERE_TO_STAY = re.compile(r"/where-to-stay/", re.I)
PARKS_PAGE = re.compile(r"/places-to-see/parks/", re.I)
HREF_PATTERN = re.compile(r'href=[\"\\\']([^\"\\\']+)[\"\\\']', re.I)


def fetch_text(url: str) -> str:
    time.sleep(REQUEST_DELAY_SECONDS)
    req = Request(url, headers={"User-Agent": "campcaster/0.1"})
    with urlopen(req, timeout=30) as resp:
        return resp.read().decode("utf-8", errors="ignore")


def parse_sitemap(xml_text: str) -> tuple[list[str], list[str]]:
    urls = []
    sitemaps = []
    root = ET.fromstring(xml_text)
    ns = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}
    if root.tag.endswith("sitemapindex"):
        for loc in root.findall(".//sm:sitemap/sm:loc", ns):
            if loc.text:
                sitemaps.append(loc.text.strip())
    else:
        for loc in root.findall(".//sm:url/sm:loc", ns):
            if loc.text:
                urls.append(loc.text.strip())
    return urls, sitemaps


def normalize_url(base: str, href: str) -> str | None:
    if not href or href.startswith("javascript:"):
        return None
    url = urljoin(base, href)
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"}:
        return None
    return url


def load_state() -> dict:
    if not STATE_PATH.exists():
        return {}
    try:
        return json.loads(STATE_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}


def save_state(state: dict) -> None:
    STATE_PATH.write_text(json.dumps(state, indent=2), encoding="utf-8")


def main() -> None:
    to_visit = [SITEMAP_URL]
    seen_sitemaps = set()
    all_urls: list[str] = []

    while to_visit:
        sitemap_url = to_visit.pop(0)
        if sitemap_url in seen_sitemaps:
            continue
        seen_sitemaps.add(sitemap_url)
        xml_text = fetch_text(sitemap_url)
        found_urls, found_sitemaps = parse_sitemap(xml_text)
        to_visit.extend(found_sitemaps)
        all_urls.extend(found_urls)

    park_pages = sorted(
        {
            url
            for url in all_urls
            if PARKS_PAGE.search(url) and not WHERE_TO_STAY.search(url)
        }
    )
    camp_urls = sorted({url for url in all_urls if WHERE_TO_STAY.search(url)})

    state = load_state()
    discovered = set(state.get("discovered", [])) | set(camp_urls)
    start_index = int(state.get("last_index", 0))

    for idx, park_url in enumerate(park_pages, start=1):
        if idx <= start_index:
            continue
        try:
            html = fetch_text(park_url)
        except Exception as err:
            print(f"Failed to fetch park page {park_url}: {err}")
            continue
        for href in HREF_PATTERN.findall(html):
            url = normalize_url(park_url, href)
            if not url:
                continue
            if WHERE_TO_STAY.search(url):
                discovered.add(url)
        if (idx % 10) == 0:
            print(f"[{idx}/{len(park_pages)}] park pages scanned")
            save_state({"last_index": idx, "discovered": sorted(discovered)})

    save_state({"last_index": len(park_pages), "discovered": sorted(discovered)})

    existing = []
    if OUTPUT_PATH.exists():
        existing = [
            line.strip()
            for line in OUTPUT_PATH.read_text(encoding="utf-8").splitlines()
            if line.strip()
        ]

    merged = sorted(set(existing) | discovered)
    OUTPUT_PATH.write_text("\n".join(merged) + "\n", encoding="utf-8")

    print(f"Sitemaps visited: {len(seen_sitemaps)}")
    print(f"Park pages scanned: {len(park_pages)}")
    print(f"Camp URLs found: {len(discovered)}")
    print(f"Total URLs in list: {len(merged)}")


if __name__ == "__main__":
    main()
