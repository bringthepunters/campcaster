import json
import math
import re
import sys
from pathlib import Path

import geopandas as gpd
from shapely.geometry import Point

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_sites_json as b  # noqa: E402

SCRAPED = ROOT / "data" / "sites_missing_scraped.json"
FACILITIES_SCRAPED = ROOT / "data" / "sites_missing_facilities.json"
SITES_JSON = ROOT / "public" / "data" / "sites.json"
UNRESOLVED_REPORT = ROOT / "data" / "sites_missing_unresolved_park.json"

FACILITY_KEYS = [
    "dogFriendly",
    "toilets",
    "toiletsType",
    "showers",
    "bbq",
    "firePits",
    "picnicTables",
    "drinkingWater",
    "vehicleAccess",
    "accessibilityNotes",
    "dogPolicy",
]

PARENTHETICAL_RE = re.compile(r"\(([^)]+)\)\s*$")


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlambda / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def strip_park_suffix(name: str) -> tuple[str, str | None]:
    m = PARENTHETICAL_RE.search(name)
    if not m:
        return name, None
    candidate = m.group(1).strip()
    base = name[: m.start()].strip()
    # Only treat it as a park name if it looks like one (avoid stripping
    # things like "(Piambie)" which are place qualifiers, not parks).
    if re.search(r"\b(national park|state park|regional park|reserve|heritage river|coastal park|forest)\b", candidate, re.I):
        return base, candidate
    return name, None


def resolve_park_names(entries: list[dict]) -> None:
    """Fill in missing parkName via own-name parenthetical, then nearest
    scraped sibling, then nearest existing site, all within 5km."""
    existing_sites = json.loads(SITES_JSON.read_text(encoding="utf-8"))

    for e in entries:
        if e.get("parkName"):
            continue
        base, park = strip_park_suffix(e["name"])
        if park:
            e["parkName"] = park
            e["name"] = base

    unresolved = [e for e in entries if not e.get("parkName")]
    resolved_pool = [e for e in entries if e.get("parkName")]

    def nearest_park(lat: float, lng: float, pool: list[dict], key_lat="lat", key_lng="lng", key_park="parkName", max_km=5.0):
        best = None
        best_dist = max_km
        for cand in pool:
            d = haversine_km(lat, lng, cand[key_lat], cand[key_lng])
            if d < best_dist:
                best_dist = d
                best = cand[key_park]
        return best

    still_unresolved = []
    for e in unresolved:
        park = nearest_park(e["lat"], e["lng"], resolved_pool)
        if not park:
            park = nearest_park(
                e["lat"], e["lng"], existing_sites, key_park="parkName"
            )
        if park:
            e["parkName"] = park
        else:
            still_unresolved.append(e)

    if still_unresolved:
        UNRESOLVED_REPORT.write_text(json.dumps(still_unresolved, indent=2), encoding="utf-8")
        print(f"WARNING: {len(still_unresolved)} entries have no resolvable parkName within 5km; see {UNRESOLVED_REPORT}")
        print("Using LGA-derived fallback for these.")


def main() -> None:
    entries = json.loads(SCRAPED.read_text(encoding="utf-8"))
    print(f"Loaded {len(entries)} scraped entries")

    resolve_park_names(entries)

    lga_gdf = b.load_lga_polygons()
    tourism_map = b.load_tourism_map()
    facilities_by_url = b.load_facilities_by_url()
    url_index = b.load_campground_urls()
    direct_facilities_by_url = {}
    if FACILITIES_SCRAPED.exists():
        raw = json.loads(FACILITIES_SCRAPED.read_text(encoding="utf-8"))
        direct_facilities_by_url = {k: v for k, v in raw.items() if "error" not in v}
    print(f"{len(direct_facilities_by_url)} directly-scraped facility records available")

    existing_sites = json.loads(SITES_JSON.read_text(encoding="utf-8"))
    existing_ids = {s["id"] for s in existing_sites}
    existing_slugs_seen = {}
    for sid in existing_ids:
        existing_slugs_seen[sid] = 1

    # Rename "name" -> "site_name" before the spatial join: the LGA layer
    # also has a "name" column, and gpd.sjoin silently suffixes both to
    # "name_left"/"name_right" on collision, which breaks a plain
    # getattr(row, "name") lookup afterwards.
    gdf_rows = [{**e, "site_name": e["name"]} for e in entries]
    for r in gdf_rows:
        del r["name"]
    gdf = gpd.GeoDataFrame(
        gdf_rows,
        geometry=[Point(e["lng"], e["lat"]) for e in entries],
        crs=4326,
    )
    if lga_gdf is not None:
        joined = gpd.sjoin(
            gdf,
            lga_gdf[["name", "official_name", "geometry"]],
            how="left",
            predicate="within",
        )
    else:
        joined = gdf.copy()
        joined["name"] = None
        joined["official_name"] = None

    records = []
    no_park_fallback = 0
    for row in joined.itertuples():
        name = getattr(row, "site_name")
        park_name = getattr(row, "parkName")
        park_name = park_name if isinstance(park_name, str) and park_name.strip() else None
        lat = getattr(row, "lat")
        lng = getattr(row, "lng")
        source_url = getattr(row, "sourceUrl")

        lga_official = getattr(row, "official_name", None)
        lga_plain = getattr(row, "name", None)
        lga = None
        if isinstance(lga_official, str) and lga_official.strip():
            lga = lga_official.strip()
        elif isinstance(lga_plain, str) and lga_plain.strip():
            lga = lga_plain.strip()

        if not park_name:
            park_name = f"{lga.title()} area" if lga else "Victoria"
            no_park_fallback += 1

        tourism_region = tourism_map.get(b.normalize_lga(lga)) if lga else None

        base_id = b.slugify(f"{park_name}-{name}")
        count = existing_slugs_seen.get(base_id, 0) + 1
        existing_slugs_seen[base_id] = count
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
        # Prefer facilities scraped directly from this site's own page
        # (data/sites_missing_facilities.json, keyed by the exact
        # sourceUrl) over the fuzzy best_url_match against the old
        # park-level "where-to-stay" facilities cache -- the direct scrape
        # is site-specific and doesn't depend on name/token overlap.
        direct = direct_facilities_by_url.get(source_url)
        if direct:
            for key in FACILITY_KEYS:
                if key in direct:
                    facilities[key] = direct.get(key)
        else:
            matched_url = b.best_url_match(name, park_name, url_index)
            if matched_url and matched_url in facilities_by_url:
                incoming = facilities_by_url[matched_url]
                for key in facilities.keys():
                    if key in incoming:
                        facilities[key] = incoming.get(key)

        records.append(
            {
                "id": site_id,
                "name": name,
                "parkName": park_name,
                "lat": lat,
                "lng": lng,
                "lga": lga,
                "tourismRegion": tourism_region,
                "facilities": facilities,
                "sourceUrl": source_url,
                "bookingUrl": None,
            }
        )

    print(f"{no_park_fallback} entries used LGA-name fallback for parkName")

    merged = existing_sites + records
    SITES_JSON.write_text(json.dumps(merged, indent=2), encoding="utf-8")
    print(f"Wrote {len(merged)} total sites ({len(existing_sites)} existing + {len(records)} new) to {SITES_JSON}")


if __name__ == "__main__":
    main()
