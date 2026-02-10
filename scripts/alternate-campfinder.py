import argparse
import json
import re
import time
from pathlib import Path
from urllib.parse import urljoin, urlparse
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
MISSING_PATH = ROOT / "data" / "missing_campground_urls.json"
MISSING_CSV_PATH = ROOT / "data" / "missing_campground_urls_unique.csv"
OUTPUT_PATH = ROOT / "data" / "campground_urls.txt"
STATE_PATH = ROOT / "data" / "missing_url_candidate_state.json"

REQUEST_DELAY_SECONDS = 1.15  # ~52/min

NOT_FOUND_MARKERS = re.compile(r"(page not found|404|we couldn't find)", re.I)


def slugify(value: str) -> str:
    value = value.lower()
    value = re.sub(r"[^a-z0-9]+", "-", value)
    return value.strip("-")


def extract_site_slug(site_id: str, park_name: str) -> str:
    """Extract the clean site slug from the id."""
    # Remove common suffixes from park name for matching
    park_lower = park_name.lower()
    park_words = park_lower.split()
    
    # Remove park name from beginning and end of id
    id_lower = site_id.lower()
    
    # Try to remove park name from start (with variations)
    park_patterns = [
        re.escape(park_lower.replace(" ", "-")),
        re.escape(park_lower.replace(" ", "-").replace("national-park", "national park")),
        re.escape("-".join(park_words)),
    ]
    
    for pattern in park_patterns:
        # Remove from start
        id_clean = re.sub(f"^{pattern}-", "", id_lower)
        # Remove from end
        id_clean = re.sub(f"-{pattern}$", "", id_clean)
        
        if id_clean != id_lower and len(id_clean) > 3:
            return id_clean
    
    # Fallback: remove common park suffixes
    for suffix in ["-national-park", "-state-park", "-r-p", "-h-a", "-s-r", "-s-p", "-l-r", "-f-r", "-w-r"]:
        if site_id.endswith(suffix):
            # Find where the actual site name ends
            parts = site_id.split("-")
            # Find index where suffix might start
            for i in range(len(parts)-1, 0, -1):
                if "-".join(parts[i:]) == suffix.lstrip("-"):
                    return "-".join(parts[:i])
    
    # Last resort: use the middle part of the id
    parts = site_id.split("-")
    if len(parts) > 4:
        return "-".join(parts[2:-2])
    
    return site_id


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
    """Build multiple candidate URLs to test."""
    park_slug = slugify(park_name)
    site_slug = extract_site_slug(site_id, park_name)
    
    candidates = []
    
    # Pattern 1: /places-to-see/sites/{site-slug}
    candidates.append(f"https://www.parks.vic.gov.au/places-to-see/sites/{site_slug}")
    
    # Pattern 2: /places-to-see/parks/{park-slug}/where-to-stay/{site-slug}
    candidates.append(f"https://www.parks.vic.gov.au/places-to-see/parks/{park_slug}/where-to-stay/{site_slug}")
    
    # Pattern 3: /places-to-see/parks/{park-slug}/{site-slug}
    candidates.append(f"https://www.parks.vic.gov.au/places-to-see/parks/{park_slug}/{site_slug}")
    
    # Pattern 4: /places-to-see/campgrounds/{site-slug}
    candidates.append(f"https://www.parks.vic.gov.au/places-to-see/campgrounds/{site_slug}")
    
    # For alpine national park specifically (based on your example)
    if "alpine-national-park" in park_slug:
        candidates.append(f"https://www.parks.vic.gov.au/places-to-see/parks/alpine-national-park/camping/{site_slug}")
    
    return candidates


def slug_from_name(name: str) -> str:
    return slugify(name.replace(",", " "))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=0)
    args = parser.parse_args()

    if MISSING_PATH.exists():
        missing = json.loads(MISSING_PATH.read_text(encoding="utf-8"))
    elif MISSING_CSV_PATH.exists():
        import csv

        with MISSING_CSV_PATH.open(newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            missing = list(reader)
    else:
        raise FileNotFoundError("missing campground list not found.")
    existing = load_existing_urls()
    state = load_state()
    start_index = int(state.get("last_index", 0))
    discovered = set(state.get("discovered", [])) | set(existing)

    processed = 0
    for idx, site in enumerate(missing, start=1):
        if idx <= start_index:
            continue
        
        site_id = site["id"]
        park_name = site["parkName"]
        site_name = site["name"]
        
        if not re.search(r"\b(camp|campground|camping area|camping)\b", site_name, re.I):
            if idx % 5 == 0:
                save_state({"last_index": idx, "discovered": sorted(discovered)})
                print(f"[{idx}/{len(missing)}] URLs: {len(discovered)}")
            continue

        print(f"\n[{idx}/{len(missing)}] Testing: {site_id}")
        print(f"Park: {park_name}")

        found = False
        candidates = build_candidates(park_name, site_id)
        name_slug = slug_from_name(site_name)
        name_candidate = (
            f"https://www.parks.vic.gov.au/places-to-see/sites/{name_slug}"
        )
        candidates = [name_candidate] + candidates
        
        for i, candidate in enumerate(candidates, 1):
            if candidate in discovered:
                print(f"  ✓ Already discovered: {candidate}")
                found = True
                break
                
            print(f"  Trying pattern {i}: {candidate}")
            if candidate_exists(candidate):
                discovered.add(candidate)
                print(f"  ✓ Found: {candidate}")
                found = True
                break
            else:
                print(f"  ✗ Not found")
        
        if not found:
            print(f"  ✗ No pattern worked")
        
        # Save state every 3 sites
        if idx % 3 == 0:
            save_state({"last_index": idx, "discovered": sorted(discovered)})
            print(f"\nProgress: {idx}/{len(missing)}, Found: {len(discovered)}")

        processed += 1
        if args.limit and processed >= args.limit:
            save_state({"last_index": idx, "discovered": sorted(discovered)})
            OUTPUT_PATH.write_text("\n".join(sorted(discovered)) + "\n", encoding="utf-8")
            print(f"\nStopped after {processed} sites. Total URLs found: {len(discovered)}")
            return

    save_state({"last_index": len(missing), "discovered": sorted(discovered)})
    OUTPUT_PATH.write_text("\n".join(sorted(discovered)) + "\n", encoding="utf-8")
    print(f"\nDone! Total URLs found: {len(discovered)}")


if __name__ == "__main__":
    main()
