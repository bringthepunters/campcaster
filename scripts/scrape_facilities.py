import json
import re
import time
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError

ROOT = Path(__file__).resolve().parents[1]
URLS_PATH = ROOT / "data" / "campground_urls.txt"
OUTPUT_BY_URL = ROOT / "data" / "facilities_by_url.json"
SITES_PATH = ROOT / "public" / "data" / "sites.json"

REQUEST_DELAY_SECONDS = 2.3  # ~26 requests/minute (~35% faster)
SCRAPE_VERSION = 2

STOPWORDS = {
    "campground",
    "campgrounds",
    "camping",
    "area",
    "areas",
    "park",
    "national",
    "state",
    "regional",
    "conservation",
    "reserve",
    "the",
    "of",
    "and",
    "in",
    "at",
    "with",
    "your",
}

DOG_POSITIVE = re.compile(r"dogs?\b.*(allowed|permitted|welcome|on lead|on-lead)", re.I)
DOG_NEGATIVE = re.compile(r"(no dogs|dogs? not permitted|dogs? prohibited)", re.I)
TOILET_POSITIVE = re.compile(r"toilets?", re.I)
TOILET_NEGATIVE = re.compile(r"no toilets?|without toilets?", re.I)
TOILET_FLUSH = re.compile(r"(flush|flushing)", re.I)
TOILET_PIT = re.compile(r"(pit toilet|pit latrine|long drop|drop toilet)", re.I)
TOILET_COMPOST = re.compile(r"(compost(ing)? toilet|eco toilet)", re.I)
SHOWER_POSITIVE = re.compile(r"showers?", re.I)
SHOWER_NEGATIVE = re.compile(r"no showers?|without showers?", re.I)
BBQ_POSITIVE = re.compile(r"\b(bbq|barbecue)\b", re.I)
BBQ_NEGATIVE = re.compile(r"no bbq|no barbecue", re.I)
FIRE_POSITIVE = re.compile(r"(fire pit|firepit|campfire)", re.I)
FIRE_NEGATIVE = re.compile(r"no fires?|no campfires?", re.I)
PICNIC_POSITIVE = re.compile(r"picnic tables?", re.I)
PICNIC_NEGATIVE = re.compile(r"no picnic tables?", re.I)
WATER_POSITIVE = re.compile(r"(drinking water|potable water|water tap)", re.I)
WATER_NEGATIVE = re.compile(r"no (drinking|potable) water|no water", re.I)
VEHICLE_POSITIVE = re.compile(r"(vehicle access|2wd|4wd|car access|drive-in)", re.I)
VEHICLE_NEGATIVE = re.compile(r"(no vehicle access|walk-in only|hike-in only)", re.I)
ACCESS_POSITIVE = re.compile(r"(accessible|accessibility|wheelchair)", re.I)

LANDSCAPE_CUES = {
    "beach_coast": [
        "ocean",
        "coast",
        "beach",
        "bay",
        "surf",
        "dunes",
        "headland",
        "foreshore",
        "clifftop",
        "tidal",
    ],
    "river_creek": [
        "river",
        "creek",
        "stream",
        "riverbank",
        "banks",
        "ford",
        "estuary",
        "river mouth",
    ],
    "lake_wetland": [
        "lake",
        "lagoon",
        "wetland",
        "billabong",
        "marsh",
        "swamp",
        "floodplain",
    ],
    "forest": ["forest", "bushland", "tall trees", "canopy", "shaded"],
    "rainforest": ["rainforest", "fern gully", "mossy forest", "closed canopy"],
    "grassland_plains": ["plains", "grassland", "open country", "pasture", "downs"],
    "scrub_heath": ["heath", "scrub", "mallee", "shrubland", "low bush"],
    "desert_arid": ["desert", "arid", "semi-arid", "red sand", "saltbush", "dunes"],
    "mountains_alpine": ["mountain", "alpine", "high plains", "peaks", "ridge", "snow"],
    "valley_gorge": ["valley", "gorge", "ravine", "canyon", "gully"],
    "rocky_cliffs": ["rocky", "boulders", "granite", "outcrop", "escarpment", "cliffs"],
}

WILDLIFE_TRIGGER = re.compile(
    r"\b(wildlife|see|spot|observe|encounter|home to)\b", re.I
)
WILDLIFE_PHRASE = re.compile(
    r"(see|spot|observe|encounter|home to)\s+(.*)", re.I
)
WILDLIFE_IGNORE = re.compile(r"(url source|http|parks\.vic\.gov\.au)", re.I)


def slugify(value: str) -> str:
    value = value.lower()
    value = re.sub(r"[^a-z0-9]+", "-", value)
    return value.strip("-")


def tokenize(value: str) -> set[str]:
    value = value.lower()
    value = re.sub(r"[^a-z0-9]+", " ", value)
    return {token for token in value.split() if token and token not in STOPWORDS}


def fetch_text(url: str, retries: int = 4) -> str:
    jina_url = f"https://r.jina.ai/http://{url.replace('http://', '').replace('https://', '')}"
    req = Request(jina_url, headers={"User-Agent": "campcaster/0.1"})
    for attempt in range(retries + 1):
        try:
            with urlopen(req) as resp:
                return resp.read().decode("utf-8", errors="ignore")
        except HTTPError as err:
            if err.code in {429, 500, 502, 503} and attempt < retries:
                time.sleep(10 + attempt * 10)
                continue
            raise


def extract_facilities(text: str) -> dict:
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    dog_lines = [line for line in lines if "dog" in line.lower()]
    toilet_lines = [line for line in lines if "toilet" in line.lower()]
    shower_lines = [line for line in lines if "shower" in line.lower()]
    bbq_lines = [line for line in lines if "bbq" in line.lower() or "barbecue" in line.lower()]
    fire_lines = [line for line in lines if "fire" in line.lower()]
    picnic_lines = [line for line in lines if "picnic" in line.lower()]
    water_lines = [line for line in lines if "water" in line.lower()]
    vehicle_lines = [line for line in lines if "vehicle" in line.lower() or "2wd" in line.lower() or "4wd" in line.lower()]
    access_lines = [line for line in lines if "accessib" in line.lower() or "wheelchair" in line.lower()]

    dog_friendly = None
    for line in dog_lines:
        if DOG_NEGATIVE.search(line):
            dog_friendly = False
            break
        if DOG_POSITIVE.search(line):
            dog_friendly = True
            break

    toilets = None
    for line in toilet_lines:
        if TOILET_NEGATIVE.search(line):
            toilets = False
            break
        if TOILET_POSITIVE.search(line):
            toilets = True
            break

    toilets_type = None
    if toilet_lines:
        for line in toilet_lines:
            if TOILET_FLUSH.search(line):
                toilets_type = "flushing"
                break
            if TOILET_COMPOST.search(line):
                toilets_type = "composting"
                break
            if TOILET_PIT.search(line):
                toilets_type = "pit"
                break

    showers = None
    for line in shower_lines:
        if SHOWER_NEGATIVE.search(line):
            showers = False
            break
        if SHOWER_POSITIVE.search(line):
            showers = True
            break

    bbq = None
    for line in bbq_lines:
        if BBQ_NEGATIVE.search(line):
            bbq = False
            break
        if BBQ_POSITIVE.search(line):
            bbq = True
            break

    fire_pits = None
    for line in fire_lines:
        if FIRE_NEGATIVE.search(line):
            fire_pits = False
            break
        if FIRE_POSITIVE.search(line):
            fire_pits = True
            break

    picnic_tables = None
    for line in picnic_lines:
        if PICNIC_NEGATIVE.search(line):
            picnic_tables = False
            break
        if PICNIC_POSITIVE.search(line):
            picnic_tables = True
            break

    drinking_water = None
    for line in water_lines:
        if WATER_NEGATIVE.search(line):
            drinking_water = False
            break
        if WATER_POSITIVE.search(line):
            drinking_water = True
            break

    vehicle_access = None
    for line in vehicle_lines:
        if VEHICLE_NEGATIVE.search(line):
            vehicle_access = False
            break
        if VEHICLE_POSITIVE.search(line):
            vehicle_access = True
            break

    accessibility_notes = access_lines[:2] if access_lines else []

    landscape_scores = {key: 0 for key in LANDSCAPE_CUES}
    for line in lines:
        lower = line.lower()
        for tag, cues in LANDSCAPE_CUES.items():
            for cue in cues:
                if cue in lower:
                    landscape_scores[tag] += 1
    landscape_tags = [
        tag
        for tag, score in sorted(
            landscape_scores.items(), key=lambda item: item[1], reverse=True
        )
        if score > 0
    ][:3]

    animals_fauna = []
    for line in lines:
        if not WILDLIFE_TRIGGER.search(line):
            continue
        if WILDLIFE_IGNORE.search(line):
            continue
        match = WILDLIFE_PHRASE.search(line)
        if match:
            phrase = match.group(2)
        else:
            phrase = line
        phrase = re.sub(r"^[\-\*\u2022]+", "", phrase).strip()
        phrase = phrase.rstrip(".")
        if not phrase:
            continue
        parts = re.split(r",| and ", phrase)
        for part in parts:
            cleaned = part.strip()
            if not cleaned or cleaned.lower() == "wildlife":
                continue
            animals_fauna.append(cleaned)
    seen_animals = set()
    deduped_animals = []
    for animal in animals_fauna:
        key = animal.lower()
        if key in seen_animals:
            continue
        seen_animals.add(key)
        deduped_animals.append(animal)

    return {
        "schemaVersion": SCRAPE_VERSION,
        "dogFriendly": dog_friendly,
        "toilets": toilets,
        "toiletsType": toilets_type,
        "showers": showers,
        "bbq": bbq,
        "firePits": fire_pits,
        "picnicTables": picnic_tables,
        "drinkingWater": drinking_water,
        "vehicleAccess": vehicle_access,
        "accessibilityNotes": accessibility_notes,
        "dogPolicy": dog_lines[:2] if dog_lines else [],
        "landscapeTags": landscape_tags,
        "animalsFauna": deduped_animals,
        "evidence": {
            "dog": dog_lines[:3],
            "toilets": toilet_lines[:3],
            "showers": shower_lines[:3],
            "bbq": bbq_lines[:3],
            "fire": fire_lines[:3],
            "picnic": picnic_lines[:3],
            "water": water_lines[:3],
            "vehicle": vehicle_lines[:3],
            "access": access_lines[:3],
            "landscape": landscape_tags,
            "animals": deduped_animals[:3],
        },
    }


def load_urls() -> list[str]:
    if not URLS_PATH.exists():
        raise FileNotFoundError("Missing campground URL list. Run sitemap extraction first.")
    return [line.strip() for line in URLS_PATH.read_text(encoding="utf-8").splitlines() if line.strip()]


def build_url_lookup(urls: list[str]) -> list[dict[str, str | set[str]]]:
    index = []
    for url in urls:
        path = url.replace("http://", "").replace("https://", "")
        slug = slugify(url.rstrip("/").split("/")[-1])
        tokens = tokenize(path)
        index.append({"url": url, "slug": slug, "tokens": tokens})
    return index


def best_url_match(
    site_name: str,
    park_name: str,
    url_index: list[dict[str, str | set[str]]],
) -> str | None:
    site_tokens = tokenize(site_name)
    park_tokens = tokenize(park_name)
    if not site_tokens:
        return None
    best_url = None
    best_score = 0
    combined_tokens = site_tokens | park_tokens
    for entry in url_index:
        tokens = entry["tokens"]
        if not isinstance(tokens, set):
            continue
        if not site_tokens.intersection(tokens):
            continue
        score = len(combined_tokens.intersection(tokens))
        if score > best_score:
            best_score = score
            best_url = entry["url"]
    if best_score < 2:
        return None
    return best_url


def apply_to_sites(facilities_by_url: dict, urls: list[str]) -> None:
    sites = json.loads(SITES_PATH.read_text(encoding="utf-8"))
    url_index = build_url_lookup(urls)

    for site in sites:
        match_url = best_url_match(site["name"], site["parkName"], url_index)

        if not match_url:
            continue

        facilities = facilities_by_url.get(match_url)
        if not facilities:
            continue

        site.setdefault("facilities", {})
        site["facilities"]["dogFriendly"] = facilities.get("dogFriendly")
        site["facilities"]["toilets"] = facilities.get("toilets")
        site["facilities"]["toiletsType"] = facilities.get("toiletsType")
        site["facilities"]["showers"] = facilities.get("showers")
        site["facilities"]["bbq"] = facilities.get("bbq")
        site["facilities"]["firePits"] = facilities.get("firePits")
        site["facilities"]["picnicTables"] = facilities.get("picnicTables")
        site["facilities"]["drinkingWater"] = facilities.get("drinkingWater")
        site["facilities"]["vehicleAccess"] = facilities.get("vehicleAccess")
        site["facilities"]["accessibilityNotes"] = facilities.get("accessibilityNotes")
        site["facilities"]["dogPolicy"] = facilities.get("dogPolicy")
        site["sourceUrl"] = match_url
        site["landscapeTags"] = facilities.get("landscapeTags", [])
        site["animalsFauna"] = facilities.get("animalsFauna", [])

    SITES_PATH.write_text(json.dumps(sites, indent=2), encoding="utf-8")


def load_existing() -> dict:
    if OUTPUT_BY_URL.exists():
        return json.loads(OUTPUT_BY_URL.read_text(encoding="utf-8"))
    return {}


def save_progress(data: dict) -> None:
    OUTPUT_BY_URL.write_text(json.dumps(data, indent=2), encoding="utf-8")


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--refresh",
        action="store_true",
        help="Re-scrape all URLs even if cached.",
    )
    parser.add_argument(
        "--refresh-missing",
        action="store_true",
        help="Re-scrape only URLs missing the latest schema version.",
    )
    parser.add_argument(
        "--apply-only",
        action="store_true",
        help="Skip scraping and just apply facilities to sites.json.",
    )
    args = parser.parse_args()

    urls = load_urls()
    facilities_by_url = load_existing()
    total = len(urls)
    scraped = 0
    skipped = 0
    failed = 0

    if args.apply_only:
        apply_to_sites(facilities_by_url, urls)
        print("Applied facilities to sites.json")
        return

    for idx, url in enumerate(urls, start=1):
        if url in facilities_by_url and not args.refresh:
            if args.refresh_missing:
                existing = facilities_by_url.get(url, {})
                if existing.get("schemaVersion") == SCRAPE_VERSION:
                    skipped += 1
                    if (idx % 10) == 0:
                        print(
                            f"[{idx}/{total}] skipped (up-to-date): {skipped} | scraped: {scraped} | failed: {failed}"
                        )
                    continue
            else:
                skipped += 1
                continue
        try:
            text = fetch_text(url)
        except Exception as err:
            print(f"Failed to fetch {url}: {err}")
            failed += 1
            continue

        facilities_by_url[url] = extract_facilities(text)
        save_progress(facilities_by_url)
        scraped += 1
        if (idx % 5) == 0:
            print(
                f"[{idx}/{total}] scraped: {scraped} | skipped: {skipped} | failed: {failed}"
            )
        if idx < len(urls):
            time.sleep(REQUEST_DELAY_SECONDS)

    apply_to_sites(facilities_by_url, urls)
    print(f"Scraped {len(urls)} pages")


if __name__ == "__main__":
    main()
