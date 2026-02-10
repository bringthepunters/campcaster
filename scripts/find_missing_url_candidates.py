import json
import re
import time
from pathlib import Path
from urllib.parse import urljoin, urlparse
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
MISSING_PATH = ROOT / "data" / "missing_campground_urls.json"
OUTPUT_PATH = ROOT / "data" / "campground_urls.txt"
STATE_PATH = ROOT / "data" / "missing_url_candidate_state.json"

REQUEST_DELAY_SECONDS = 2.3  # ~26/min

NOT_FOUND_MARKERS = re.compile(r"(page not found|404|we couldn't find)", re.I)


def slugify(value: str) -> str:
    value = value.lower()
    value = re.sub(r"[^a-z0-9]+", "-", value)
    return value.strip("-")


def fetch_text_jina(url: str) -> str:
    time.sleep(REQUEST_DELAY_SECONDS)
    jina_url = f"https://r.jina.ai/http://{url.replace('http://', '').replace('https://', '')}"
    req = Request(jina_url, headers={"User-Agent": "campcaster/0.1"})
    with urlopen(req, timeout=30) as resp:
        return resp.read().decode("utf-8", errors="ignore")


def candidate_exists(url: str) -> bool:
    try:
        text = fetch_text_jina(url)
    except Exception:
        return False
    if NOT_FOUND_MARKERS.search(text):
        return False
    return True


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


def build_candidates(park_name: str, site_id: str) -> list[str]:
    park_slug = slugify(park_name)
    return [
        f"https://www.parks.vic.gov.au/places-to-see/parks/{park_slug}/{site_id}",
        f"https://www.parks.vic.gov.au/places-to-see/parks/{park_slug}/where-to-stay/{site_id}",
    ]


def main() -> None:
    if not MISSING_PATH.exists():
        raise FileNotFoundError("missing_campground_urls.json not found.")
    missing = json.loads(MISSING_PATH.read_text(encoding="utf-8"))
    existing = load_existing_urls()
    state = load_state()
    start_index = int(state.get("last_index", 0))
    discovered = set(state.get("discovered", [])) | set(existing)

    for idx, site in enumerate(missing, start=1):
        if idx <= start_index:
            continue
        found = False
        for candidate in build_candidates(site["parkName"], site["id"]):
            if candidate in discovered:
                found = True
                break
            if candidate_exists(candidate):
                discovered.add(candidate)
                found = True
                break
        if (idx % 5) == 0:
            save_state({"last_index": idx, "discovered": sorted(discovered)})
            print(f"[{idx}/{len(missing)}] URLs: {len(discovered)}")

    save_state({"last_index": len(missing), "discovered": sorted(discovered)})
    OUTPUT_PATH.write_text("\n".join(sorted(discovered)) + "\n", encoding="utf-8")
    print(f"Total URLs in list: {len(discovered)}")


if __name__ == "__main__":
    main()
