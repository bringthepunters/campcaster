import json
from pathlib import Path
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "data" / "lga.geojson"

URL = (
    "https://opendata.maps.vic.gov.au/geoserver/wfs"
    "?service=WFS&version=2.0.0&request=GetFeature"
    "&typeName=open-data-platform:ad_lga_area_polygon"
    "&outputFormat=application/json"
)


def main() -> None:
    with urlopen(URL) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    OUTPUT.write_text(json.dumps(data), encoding="utf-8")
    print(f"Wrote {OUTPUT}")


if __name__ == "__main__":
    main()
