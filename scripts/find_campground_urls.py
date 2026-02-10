import json
import re
import time
from pathlib import Path
from urllib.parse import quote_plus, urljoin, urlparse
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
SITES_PATH = ROOT / "public" / "data" / "sites.json"
OUTPUT_PATH = ROOT / "data" / "campground_urls.txt"
STATE_PATH = ROOT / "data" / "campground_url_search_state.json"

REQUEST_DELAY_SECONDS = 2.3  # ~26/min

SEARCH_ENDPOINTS = [
  "https://www.parks.vic.gov.au/search?query={query}",
  "https://www.parks.vic.gov.au/search?search={query}",
  "https://www.parks.vic.gov.au/search?q={query}",
]

WHERE_TO_STAY = re.compile(r"/where-to-stay/", re.I)
HREF_PATTERN = re.compile(r'href=[\"\\\']([^\"\\\']+)[\"\\\']', re.I)
NOT_FOUND_MARKERS = re.compile(r"(page not found|404|we couldn't find)", re.I)


def slugify(value: str) -> str:
    value = value.lower()
    value = re.sub(r"[^a-z0-9]+", "-", value)
    return value.strip("-")


def fetch_text(url: str) -> str:
    time.sleep(REQUEST_DELAY_SECONDS)
    req = Request(url, headers={"User-Agent": "campcaster/0.1"})
    with urlopen(req, timeout=30) as resp:
        return resp.read().decode("utf-8", errors="ignore")


def fetch_text_jina(url: str) -> str:
    time.sleep(REQUEST_DELAY_SECONDS)
    jina_url = f"https://r.jina.ai/http://{url.replace('http://', '').replace('https://', '')}"
    req = Request(jina_url, headers={"User-Agent": "campcaster/0.1"})
    with urlopen(req, timeout=30) as resp:
        return resp.read().decode("utf-8", errors="ignore")


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


def load_existing_urls() -> set[str]:
    if not OUTPUT_PATH.exists():
        return set()
    return {
        line.strip()
        for line in OUTPUT_PATH.read_text(encoding="utf-8").splitlines()
        if line.strip()
    }


def candidate_urls(site_name: str, park_name: str) -> list[str]:
    park_slug = slugify(park_name)
    site_slug = slugify(site_name)
    return [
        f"https://www.parks.vic.gov.au/places-to-see/parks/{park_slug}/where-to-stay/{site_slug}",
    ]


def candidate_exists(url: str) -> bool:
    try:
        text = fetch_text_jina(url)
    except Exception:
        return False
    if NOT_FOUND_MARKERS.search(text):
        return False
    return True


def main() -> None:
    sites = json.loads(SITES_PATH.read_text(encoding="utf-8"))
    existing = load_existing_urls()
    state = load_state()
    start_index = int(state.get("last_index", 0))
    discovered = set(state.get("discovered", [])) | set(existing)

    for idx, site in enumerate(sites, start=1):
        if idx <= start_index:
            continue
        query = f"{site['name']} {site['parkName']} campground"
        found = False
        for candidate in candidate_urls(site["name"], site["parkName"]):
            if candidate in discovered:
                found = True
                break
            if candidate_exists(candidate):
                discovered.add(candidate)
                found = True
                break
        if found:
            if (idx % 5) == 0:
                save_state({"last_index": idx, "discovered": sorted(discovered)})
                print(f"[{idx}/{len(sites)}] URLs: {len(discovered)}")
            continue
        found = False

        for template in SEARCH_ENDPOINTS:
            url = template.format(query=quote_plus(query))
            try:
                html = fetch_text(url)
            except Exception as err:
                print(f"Failed search {url}: {err}")
                continue
            for href in HREF_PATTERN.findall(html):
                link = normalize_url(url, href)
                if not link:
                    continue
                if WHERE_TO_STAY.search(link):
                    discovered.add(link)
                    found = True
            if found:
                break

        if (idx % 5) == 0:
            save_state({"last_index": idx, "discovered": sorted(discovered)})
            print(f"[{idx}/{len(sites)}] URLs: {len(discovered)}")

    save_state({"last_index": len(sites), "discovered": sorted(discovered)})
    OUTPUT_PATH.write_text("\n".join(sorted(discovered)) + "\n", encoding="utf-8")
    print(f"Total URLs in list: {len(discovered)}")


if __name__ == "__main__":
    main()
