import json
from pathlib import Path
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
OUTPUT_PATH = ROOT / "data" / "campground_urls.txt"
MAPPING_PATH = ROOT / "data" / "booking_grid_mapping.json"

GRID_URL = (
    "https://bookings.parks.vic.gov.au/book"
    "?format=json&q=114&pagenumber=1&date=2026-02-03&period=1"
)


def fetch_grid() -> dict:
    req = Request(GRID_URL, headers={"User-Agent": "campcaster/0.1"})
    with urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def main() -> None:
    data = fetch_grid()
    items = data.get("data", [])
    urls = []
    mapping = []

    for item in items:
        alias = item.get("alias") or item.get("urlSuffix")
        operator_id = item.get("OperatorId")
        if not alias:
            continue
        url = f"https://bookings.parks.vic.gov.au/{alias}"
        urls.append(url)
        mapping.append(
            {
                "alias": alias,
                "operatorId": operator_id,
                "url": url,
                "name": item.get("OperatorName"),
                "productType": item.get("ProductType"),
            }
        )

    urls = sorted(set(urls))
    OUTPUT_PATH.write_text("\n".join(urls) + "\n", encoding="utf-8")
    MAPPING_PATH.write_text(json.dumps(mapping, indent=2), encoding="utf-8")

    print(f"Grid items: {len(items)}")
    print(f"URLs written: {len(urls)}")
    print(f"Mapping written: {MAPPING_PATH}")


if __name__ == "__main__":
    main()
