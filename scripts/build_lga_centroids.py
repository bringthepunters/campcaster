import json
from pathlib import Path

import geopandas as gpd

ROOT = Path(__file__).resolve().parents[1]
LGA_GEOJSON = ROOT / "data" / "lga.geojson"
OUTPUT = ROOT / "public" / "data" / "lga_centroids.json"


def main() -> None:
    if not LGA_GEOJSON.exists():
        raise FileNotFoundError("Missing data/lga.geojson")
    gdf = gpd.read_file(LGA_GEOJSON)
    if "state" in gdf.columns:
        gdf = gdf[gdf["state"].str.upper() == "VIC"]
    gdf = gdf.to_crs(4326)

    centroids = {}
    for row in gdf.itertuples():
        name = (row.official_name or row.name or "").strip()
        if not name:
            continue
        centroid = row.geometry.centroid
        centroids[name] = {
            "lat": float(centroid.y),
            "lng": float(centroid.x),
        }

    OUTPUT.write_text(json.dumps(centroids, indent=2), encoding="utf-8")
    print(f"Wrote {OUTPUT}")


if __name__ == "__main__":
    main()
