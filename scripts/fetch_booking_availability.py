import argparse
import json
import re
import time
from datetime import datetime
from pathlib import Path
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
SITES_PATH = ROOT / "public" / "data" / "sites.json"
OUTPUT_PATH = ROOT / "public" / "data" / "availability.json"

BOOKEASY_API = (
    "https://webapi.bookeasy.com.au/api/getProductAvailabilityPreview"
)
REQUESTS_PER_MINUTE = 30
MIN_SECONDS_BETWEEN_REQUESTS = 60 / REQUESTS_PER_MINUTE


def get_booking_url(source_url: str | None) -> str | None:
    if not source_url:
        return None
    try:
        slug = source_url.rstrip("/").split("/")[-1]
    except Exception:
        return None
    if not slug or slug == "camping":
        return None
    return f"https://bookings.parks.vic.gov.au/{slug}"


def throttle(last_request_at: float) -> float:
    now = time.time()
    delta = now - last_request_at
    if delta < MIN_SECONDS_BETWEEN_REQUESTS:
        time.sleep(MIN_SECONDS_BETWEEN_REQUESTS - delta)
    return time.time()


def fetch_text(url: str, last_request_at: float) -> tuple[str, float]:
    last_request_at = throttle(last_request_at)
    req = Request(url, headers={"User-Agent": "campcaster/0.1"})
    with urlopen(req, timeout=30) as resp:
        html = resp.read().decode("utf-8", errors="ignore")
    return html, last_request_at


def fetch_json(url: str, last_request_at: float) -> tuple[dict, float]:
    last_request_at = throttle(last_request_at)
    req = Request(url, headers={"User-Agent": "campcaster/0.1"}, method="POST")
    with urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    return data, last_request_at


def extract_ids(html: str) -> tuple[str | None, str | None]:
    operator_match = re.search(r'operatorId\"\\s*:\\s*(\\d+)', html)
    control_match = re.search(r'controlId\"\\s*:\\s*(\\d+)', html)
    operator_id = operator_match.group(1) if operator_match else None
    control_id = control_match.group(1) if control_match else None
    return operator_id, control_id


def availability_from_preview(data: dict, date: str) -> str:
    preview = data.get("ProductAvailabilityPreview", {})
    rows = preview.get("Rows", [])
    if not rows:
        return "unknown"

    any_available = False
    for row in rows:
        for entry in row.get("Dates", []):
            entry_date = str(entry.get("Date", ""))[:10]
            if entry_date != date:
                continue
            qty = entry.get("QtyAvailableForReservation", 0) or 0
            highlighted = bool(entry.get("HighlightAsAvailableToSelect"))
            if qty > 0 or highlighted:
                any_available = True
                break
        if any_available:
            break

    return "available" if any_available else "heavily_booked"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--date", required=True, help="YYYY-MM-DD")
    args = parser.parse_args()

    try:
        datetime.strptime(args.date, "%Y-%m-%d")
    except ValueError:
        raise SystemExit("Invalid --date, expected YYYY-MM-DD")

    sites = json.loads(SITES_PATH.read_text(encoding="utf-8"))
    results: dict[str, str] = {}
    last_request_at = 0.0

    for site in sites:
        booking_url = get_booking_url(site.get("sourceUrl"))
        if not booking_url:
            continue
        try:
            html, last_request_at = fetch_text(booking_url, last_request_at)
            operator_id, control_id = extract_ids(html)
            if not operator_id or not control_id:
                results[site["id"]] = "unknown"
                continue

            api_url = (
                f"{BOOKEASY_API}?operatorId={operator_id}"
                f"&controlId={control_id}"
                f"&type=accom"
                f"&queryStartDate={args.date}"
                f"&qtyOfDates=14"
                f"&includeInternalProducts=false"
            )
            data, last_request_at = fetch_json(api_url, last_request_at)
            results[site["id"]] = availability_from_preview(data, args.date)
        except Exception:
            results[site["id"]] = "unknown"

    payload = {
        "date": args.date,
        "generatedAt": datetime.utcnow().isoformat(timespec="seconds") + "Z",
        "items": results,
    }

    OUTPUT_PATH.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"Wrote availability for {len(results)} sites to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
