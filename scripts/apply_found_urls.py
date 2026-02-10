import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SITES_PATH = ROOT / "public" / "data" / "sites.json"
URLS_PATH = ROOT / "data" / "campground_urls.txt"

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


def tokenize(value: str) -> set[str]:
    value = value.lower()
    value = re.sub(r"[^a-z0-9]+", " ", value)
    return {token for token in value.split() if token and token not in STOPWORDS}


def build_url_index(urls: list[str]) -> list[dict[str, object]]:
    index = []
    for url in urls:
        path = url.replace("http://", "").replace("https://", "")
        tokens = tokenize(path)
        index.append({"url": url, "tokens": tokens})
    return index


def best_url_match(site_name: str, park_name: str, url_index: list[dict[str, object]]) -> str | None:
    site_tokens = tokenize(site_name)
    park_tokens = tokenize(park_name)
    if not site_tokens:
        return None
    combined_tokens = site_tokens | park_tokens
    best_url = None
    best_score = 0
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


def main() -> None:
    if not SITES_PATH.exists() or not URLS_PATH.exists():
        raise FileNotFoundError("Missing sites.json or campground_urls.txt")
    sites = json.loads(SITES_PATH.read_text(encoding="utf-8"))
    urls = [
        line.strip()
        for line in URLS_PATH.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
    url_index = build_url_index(urls)
    updated = 0

    for site in sites:
        if site.get("sourceUrl"):
            continue
        match = best_url_match(site["name"], site["parkName"], url_index)
        if match:
            site["sourceUrl"] = match
            updated += 1

    SITES_PATH.write_text(json.dumps(sites, indent=2), encoding="utf-8")
    print(f"Updated {updated} sites with sourceUrl")


if __name__ == "__main__":
    main()
