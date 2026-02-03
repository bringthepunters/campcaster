import re
import time
import xml.etree.ElementTree as ET
from pathlib import Path
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
OUTPUT_PATH = ROOT / "data" / "campground_urls.txt"
SITEMAP_URL = "https://www.parks.vic.gov.au/sitemap.xml"

REQUEST_DELAY_SECONDS = 1.0

WHERE_TO_STAY = re.compile(r"/where-to-stay/", re.I)
CAMP_KEYWORDS = re.compile(
    r"(camp|campground|camping|camp-site|campsite|camping-area)",
    re.I,
)


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


def is_camp_url(url: str) -> bool:
    if not WHERE_TO_STAY.search(url):
        return False
    return bool(CAMP_KEYWORDS.search(url))


def main() -> None:
    to_visit = [SITEMAP_URL]
    seen = set()
    urls = []

    while to_visit:
        sitemap_url = to_visit.pop(0)
        if sitemap_url in seen:
            continue
        seen.add(sitemap_url)
        xml_text = fetch_text(sitemap_url)
        found_urls, found_sitemaps = parse_sitemap(xml_text)
        to_visit.extend(found_sitemaps)
        urls.extend(found_urls)

    camp_urls = sorted({url for url in urls if is_camp_url(url)})

    existing = []
    if OUTPUT_PATH.exists():
        existing = [
            line.strip()
            for line in OUTPUT_PATH.read_text(encoding="utf-8").splitlines()
            if line.strip()
        ]

    merged = sorted(set(existing) | set(camp_urls))
    OUTPUT_PATH.write_text("\n".join(merged) + "\n", encoding="utf-8")
    print(f"Sitemaps visited: {len(seen)}")
    print(f"Camp URLs found: {len(camp_urls)}")
    print(f"Total URLs in list: {len(merged)}")


if __name__ == "__main__":
    main()
