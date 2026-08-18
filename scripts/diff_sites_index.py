import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INDEX = ROOT / "data" / "sites_directory_index.json"
SITES_JSON = ROOT / "public" / "data" / "sites.json"
OUTPUT = ROOT / "data" / "sites_missing_candidates.json"

# Broad net: match "camp" as a whole word/segment so we don't miss "Camp",
# "Camping", "Campground", "Camps" etc, while avoiding accidental substring
# hits inside unrelated words (handled by splitting on non-alnum first).
CAMP_TOKEN_RE = re.compile(r"camp")

# Same stopword list build_sites_json.py uses, so name comparisons ignore
# generic words like "campground"/"national park" that would otherwise
# suppress the token overlap between two names for the same place.
STOPWORDS = {
    "campground",
    "campgrounds",
    "camping",
    "camp",
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


def slugify(value: str) -> str:
    value = value.lower()
    value = re.sub(r"[^a-z0-9]+", "-", value)
    return value.strip("-")


def tokenize(value: str) -> set[str]:
    value = value.lower()
    value = re.sub(r"[^a-z0-9]+", " ", value)
    return {t for t in value.split() if t and t not in STOPWORDS}


def is_camp_related(name: str, url: str) -> bool:
    slug = url.rstrip("/").split("/")[-1]
    # Only look at the site's own name, stripping any trailing "(Park Name)"
    # qualifier — otherwise a park name like "Port Campbell National Park"
    # falsely matches "camp" inside "Campbell" for an unrelated Day Visitor
    # Area.
    own_name = re.sub(r"\s*\([^)]*\)\s*$", "", name)
    haystack = f"{own_name} {slug}".lower()
    return bool(CAMP_TOKEN_RE.search(haystack))


def main() -> None:
    index = json.loads(INDEX.read_text(encoding="utf-8"))
    sites = json.loads(SITES_JSON.read_text(encoding="utf-8"))

    print(f"directory index: {len(index)} total entries")

    camp_entries = [e for e in index if is_camp_related(e["name"], e["url"])]
    print(f"camp-related entries: {len(camp_entries)}")

    # Build a lookup of existing site name/slug tokens for fuzzy matching.
    # Combine name + parkName tokens (like build_sites_json.py's
    # best_url_match does) since some existing entries embed the park in
    # the name field ("Bear Gully, Cape Liptrap Coastal Park") and others
    # keep it purely in the separate parkName field ("Aire Crossing
    # Campground" / "Great Otway National Park").
    existing_slugs = set()
    existing_sourceurl_slugs = set()
    existing_name_tokens = []
    for s in sites:
        existing_slugs.add(slugify(s["name"]))
        existing_slugs.add(slugify(s["parkName"] + "-" + s["name"]))
        source_url = s.get("sourceUrl") or ""
        if "/places-to-see/sites/" in source_url:
            existing_sourceurl_slugs.add(source_url.rstrip("/").split("/")[-1])
        combined = tokenize(s["name"]) | tokenize(s["parkName"])
        existing_name_tokens.append((s["id"], combined))

    def already_have(name: str, url: str) -> bool:
        slug = url.rstrip("/").split("/")[-1]
        if (
            slug in existing_slugs
            or slugify(name) in existing_slugs
            or slug in existing_sourceurl_slugs
        ):
            return True
        name_tokens = tokenize(name)
        if not name_tokens:
            return False
        for _id, tokens in existing_name_tokens:
            if not tokens:
                continue
            # Same subset-or-superset rule the app itself uses at runtime to
            # fuzzy-match site names against the booking API (src/App.tsx),
            # proven there to correctly match "Boar Gully Camping Area,
            # Brisbane Ranges National Park" <-> "Boar Gully Campground".
            is_subset = name_tokens <= tokens or tokens <= name_tokens
            if is_subset:
                return True
        return False

    missing = [e for e in camp_entries if not already_have(e["name"], e["url"])]
    matched = [e for e in camp_entries if already_have(e["name"], e["url"])]

    print(f"already represented in sites.json: {len(matched)}")
    print(f"genuinely missing candidates: {len(missing)}")

    OUTPUT.write_text(json.dumps(missing, indent=2), encoding="utf-8")
    print(f"Wrote {len(missing)} candidates to {OUTPUT}")


if __name__ == "__main__":
    main()
