import json
import re
import time
from pathlib import Path
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
HTML_PATH = ROOT / "Gunbower National Park.html"
SITES_PATH = ROOT / "public" / "data" / "sites.json"
STATE_PATH = ROOT / "data" / "gunbower_add_state.json"

REQUEST_DELAY_SECONDS = 1.15
MAX_RETRIES = 2
URL_TIMEOUT_SECONDS = 12


def fetch_text_jina(url: str) -> str:
    jina_url = f"https://r.jina.ai/http://{url.replace('http://', '').replace('https://', '')}"
    req = Request(jina_url, headers={"User-Agent": "campcaster/0.1"})
    for attempt in range(MAX_RETRIES + 1):
        try:
            time.sleep(REQUEST_DELAY_SECONDS)
            with urlopen(req, timeout=URL_TIMEOUT_SECONDS) as resp:
                return resp.read().decode("utf-8", errors="ignore")
        except Exception:
            if attempt >= MAX_RETRIES:
                raise
            time.sleep(2 + attempt * 2)


def parse_gunbower_links(html: str) -> list[dict[str, str]]:
    links = re.findall(r'<a[^>]+href=[\"\\\"]([^\"\\\"]+)[\"\\\"][^>]*>(.*?)</a>', html, flags=re.I | re.S)
    items = []
    for href, text in links:
        text = re.sub(r"<[^>]+>", "", text)
        text = " ".join(text.split())
        if not text:
            continue
        if "camp" not in text.lower():
            continue
        if not href.startswith("/places-to-see/sites/"):
            continue
        items.append({"name": text, "href": href})
    # dedupe by href
    seen = set()
    unique = []
    for item in items:
        if item["href"] in seen:
            continue
        seen.add(item["href"])
        unique.append(item)
    return unique


def clean_name(name: str) -> str:
    return re.sub(r"\s*\\([^\\)]*\\)", "", name).strip()


def extract_lat_lng(text: str) -> tuple[float | None, float | None]:
    # Look for Google Maps query or lat/lng pairs
    map_match = re.search(r"query=\\s*(-?\\d+\\.\\d+)\\s*,\\s*(-?\\d+\\.\\d+)", text)
    if map_match:
        return float(map_match.group(1)), float(map_match.group(2))
    lat_match = re.search(r"lat(?:itude)?\"?\\s*[:=]\\s*(-?\\d+\\.\\d+)", text, re.I)
    lng_match = re.search(r"lng|lon|longitude\"?\\s*[:=]\\s*(-?\\d+\\.\\d+)", text, re.I)
    if lat_match and lng_match:
        return float(lat_match.group(1)), float(lng_match.group(1))
    map_match = re.search(r"(-?\\d+\\.\\d+)\\s*,\\s*(-?\\d+\\.\\d+)", text)
    if map_match:
        return float(map_match.group(1)), float(map_match.group(2))
    return None, None


def main() -> None:
    if not HTML_PATH.exists():
        raise FileNotFoundError("Gunbower National Park.html not found")
    html = HTML_PATH.read_text(encoding="utf-8", errors="ignore")
    items = parse_gunbower_links(html)
    sites = json.loads(SITES_PATH.read_text(encoding="utf-8"))

    # remove existing Gunbower NP entries
    sites = [s for s in sites if s["parkName"] != "Gunbower National Park"]

    state = {}
    if STATE_PATH.exists():
        try:
            state = json.loads(STATE_PATH.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            state = {}
    start_index = int(state.get("last_index", 0))

    added = 0
    missing_coords = state.get("missing_coords", [])
    for idx, item in enumerate(items, start=1):
        if idx <= start_index:
            continue
        name = clean_name(item["name"])
        url = f"https://www.parks.vic.gov.au{item['href']}"
        lat = None
        lng = None
        try:
            text = fetch_text_jina(url)
            lat, lng = extract_lat_lng(text)
        except Exception:
            lat, lng = None, None
        if lat is None or lng is None:
            missing_coords.append({"name": name, "url": url})
        else:
            site = {
                "id": re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-"),
                "name": name,
                "parkName": "Gunbower National Park",
                "lat": lat,
                "lng": lng,
                "lga": None,
                "tourismRegion": None,
                "facilities": {
                    "dogFriendly": None,
                    "toilets": None,
                    "toiletsType": None,
                    "showers": None,
                    "bbq": None,
                    "firePits": None,
                    "picnicTables": None,
                    "drinkingWater": None,
                    "vehicleAccess": None,
                    "accessibilityNotes": None,
                    "dogPolicy": None,
                },
                "sourceUrl": url,
                "bookingUrl": None,
            }
            sites.append(site)
            added += 1

        SITES_PATH.write_text(json.dumps(sites, indent=2), encoding="utf-8")
        STATE_PATH.write_text(
            json.dumps(
                {"last_index": idx, "missing_coords": missing_coords}, indent=2
            ),
            encoding="utf-8",
        )
        if (idx % 5) == 0:
            print(f"[{idx}/{len(items)}] added: {added}")

    SITES_PATH.write_text(json.dumps(sites, indent=2), encoding="utf-8")
    if missing_coords:
        Path("data/gunbower_missing_coords.json").write_text(
            json.dumps(missing_coords, indent=2), encoding="utf-8"
        )
    STATE_PATH.write_text(
        json.dumps({"last_index": len(items), "missing_coords": missing_coords}, indent=2),
        encoding="utf-8",
    )
    print(f"Added {added} Gunbower sites")
    print(f"Missing coords for {len(missing_coords)} sites")


if __name__ == "__main__":
    main()
