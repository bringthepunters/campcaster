import sys
from pathlib import Path

import geopandas as gpd
from shapely.geometry import Point

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_sites_json as b  # noqa: E402

import json

SITES_JSON = ROOT / "public" / "data" / "sites.json"


def main() -> None:
    sites = json.loads(SITES_JSON.read_text(encoding="utf-8"))
    lga_gdf = b.load_lga_polygons()
    tourism_map = b.load_tourism_map()
    if lga_gdf is None:
        print("No LGA polygons available (data/lga.geojson missing) — nothing to do")
        return

    name_col = "official_name" if "official_name" in lga_gdf.columns else "name"

    missing = [s for s in sites if not s.get("lga")]
    print(f"{len(missing)} sites missing LGA out of {len(sites)}")

    filled = 0
    for site in missing:
        lat, lng = site.get("lat"), site.get("lng")
        if lat is None or lng is None:
            continue
        point = Point(lng, lat)
        # Distance to each LGA's actual boundary geometry, not its centroid
        # -- a point sitting just outside a polygon (e.g. on the far bank
        # of a river forming the border) should match whichever LGA's edge
        # is physically closest, not whichever LGA happens to have the
        # nearest center point.
        distances = lga_gdf.geometry.distance(point)
        nearest_idx = distances.idxmin()
        nearest_row = lga_gdf.loc[nearest_idx]
        lga_name = nearest_row.get(name_col) or nearest_row.get("name")
        if not isinstance(lga_name, str) or not lga_name.strip():
            continue
        lga_name = lga_name.strip()
        site["lga"] = lga_name
        if not site.get("tourismRegion"):
            region = tourism_map.get(b.normalize_lga(lga_name))
            if region:
                site["tourismRegion"] = region
        filled += 1

    SITES_JSON.write_text(json.dumps(sites, indent=2), encoding="utf-8")
    print(f"Backfilled LGA (nearest-centroid) for {filled}/{len(missing)} sites")
    still_missing_region = sum(1 for s in sites if not s.get("tourismRegion"))
    print(f"Still missing tourismRegion: {still_missing_region}")


if __name__ == "__main__":
    main()
