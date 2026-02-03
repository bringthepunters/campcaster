import json
import re
from pathlib import Path

import geopandas as gpd
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
INPUT = ROOT / "Camp Grounds and Parks" / "Campgrounds.shp"
OUTPUT = ROOT / "public" / "data" / "sites.json"
LGA_GEOJSON = ROOT / "data" / "lga.geojson"
LGA_TOURISM = ROOT / "LGA&TOURISM_REGIONS.csv"
FACILITIES_BY_URL = ROOT / "data" / "facilities_by_url.json"
CAMPGROUND_URLS = ROOT / "data" / "campground_urls.txt"


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


def slugify(value: str) -> str:
    value = value.lower()
    value = re.sub(r"[^a-z0-9]+", "-", value)
    return value.strip("-")


def tokenize(value: str) -> set[str]:
    value = value.lower()
    value = re.sub(r"[^a-z0-9]+", " ", value)
    return {token for token in value.split() if token and token not in STOPWORDS}


def is_marine(park_name: str) -> bool:
    return "marine" in park_name.lower()


def normalize_lga(value: str) -> str:
    value = value.lower()
    for token in [
        "city council",
        "shire council",
        "rural city council",
        "borough council",
        "city of",
        "shire of",
        "rural city of",
    ]:
        value = value.replace(token, "")
    value = re.sub(r"\b(shire|city|borough|council|rural)\b", " ", value)
    value = re.sub(r"[^a-z0-9]+", " ", value)
    return value.strip()


def load_lga_polygons() -> gpd.GeoDataFrame | None:
    if not LGA_GEOJSON.exists():
        return None
    lga_gdf = gpd.read_file(LGA_GEOJSON)
    if "state" in lga_gdf.columns:
        lga_gdf = lga_gdf[lga_gdf["state"].str.upper() == "VIC"]
    lga_gdf = lga_gdf.to_crs(4326)
    return lga_gdf


def load_tourism_map() -> dict[str, str]:
    if not LGA_TOURISM.exists():
        return {}
    df = pd.read_csv(LGA_TOURISM)
    mapping = {}
    for _, row in df.iterrows():
        lga = str(row.get("LGA", "")).strip()
        region = str(row.get("Tourism Area", "")).strip()
        if not lga or not region:
            continue
        key = normalize_lga(lga)
        if key not in mapping:
            mapping[key] = region
    return mapping


def load_facilities_by_url() -> dict:
    if not FACILITIES_BY_URL.exists():
        return {}
    return json.loads(FACILITIES_BY_URL.read_text(encoding="utf-8"))


def load_campground_urls() -> list[dict[str, str | set[str]]]:
    if not CAMPGROUND_URLS.exists():
        return []
    urls = [
        line.strip()
        for line in CAMPGROUND_URLS.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
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


def main() -> None:
    gdf = gpd.read_file(INPUT)
    gdf = gdf.to_crs(4326)
    lga_gdf = load_lga_polygons()
    tourism_map = load_tourism_map()
    facilities_by_url = load_facilities_by_url()
    url_index = load_campground_urls()

    if lga_gdf is not None:
        joined = gpd.sjoin(
            gdf,
            lga_gdf[["name", "official_name", "geometry"]],
            how="left",
            predicate="within",
        )
        joined = joined.rename(
            columns={"name": "lga_name", "official_name": "lga_official_name"}
        )
    else:
        joined = gdf.copy()
        joined["lga_name"] = None
        joined["lga_official_name"] = None

    records = []
    seen = {}

    for row in joined.itertuples():
        park_name = (row.PARK_NAME or "").strip()
        site_name = (row.SITE_NAME or "").strip()

        if not park_name or not site_name:
            continue
        if is_marine(park_name):
            continue

        lat = float(row.geometry.y)
        lng = float(row.geometry.x)
        lga_candidate = getattr(row, "lga_official_name", None)
        if not isinstance(lga_candidate, str) or not lga_candidate.strip():
            lga_candidate = getattr(row, "lga_name", None)
        lga = lga_candidate.strip() if isinstance(lga_candidate, str) else None
        tourism_region = None
        if lga:
            tourism_region = tourism_map.get(normalize_lga(lga))

        base_id = slugify(f"{park_name}-{site_name}")
        count = seen.get(base_id, 0) + 1
        seen[base_id] = count
        site_id = base_id if count == 1 else f"{base_id}-{count}"

        facilities = {
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
        }
        source_url = None
        source_url = best_url_match(site_name, park_name, url_index)
        if source_url and source_url in facilities_by_url:
            incoming = facilities_by_url[source_url]
            for key in facilities.keys():
                if key in incoming:
                    facilities[key] = incoming.get(key)

        records.append(
            {
                "id": site_id,
                "name": site_name,
                "parkName": park_name,
                "lat": lat,
                "lng": lng,
                "lga": lga,
                "tourismRegion": tourism_region,
                "facilities": facilities,
                "sourceUrl": source_url,
            }
        )

    OUTPUT.write_text(json.dumps(records, indent=2), encoding="utf-8")
    print(f"Wrote {len(records)} sites to {OUTPUT}")


if __name__ == "__main__":
    main()
