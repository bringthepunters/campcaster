import re
import time
import json
from pathlib import Path
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "data" / "sites_directory_index.json"
BASE = "https://www.parks.vic.gov.au/places-to-see/sites/"
DELAY = 1.5

LINK_RE = re.compile(
    r'<a[^>]+href="(https://www\.parks\.vic\.gov\.au/places-to-see/sites/[^"?]+)"[^>]*>\s*([^<]+?)\s*</a>',
    re.I,
)
TOTAL_RE = re.compile(r'([\d,]+)\s+results found', re.I)


def fetch(url: str) -> str:
    req = Request(url, headers={"User-Agent": "campcaster-research/0.1 (+contact: local dev)"})
    with urlopen(req, timeout=30) as resp:
        return resp.read().decode("utf-8", errors="ignore")


def main() -> None:
    first = fetch(BASE)
    m = TOTAL_RE.search(first)
    total = int(m.group(1).replace(",", "")) if m else None
    per_page = 50
    pages = (total + per_page - 1) // per_page if total else 1
    print(f"total={total} pages={pages}")

    seen = {}
    def collect(html: str):
        for url, name in LINK_RE.findall(html):
            name = name.strip()
            if not name:
                continue
            seen[url] = name

    collect(first)
    for page in range(2, pages + 1):
        time.sleep(DELAY)
        html = fetch(f"{BASE}?search=&page={page}")
        collect(html)
        if page % 10 == 0:
            print(f"...page {page}/{pages}, {len(seen)} unique so far")

    records = [{"url": u, "name": n} for u, n in seen.items()]
    OUTPUT.write_text(json.dumps(records, indent=2), encoding="utf-8")
    print(f"Wrote {len(records)} entries to {OUTPUT}")


if __name__ == "__main__":
    main()
