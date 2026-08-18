import json
import sys
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(Path(__file__).resolve().parent))
import scrape_facilities as sf  # noqa: E402

CANDIDATES = ROOT / "data" / "sites_missing_candidates.json"
OUTPUT = ROOT / "data" / "sites_missing_facilities.json"

CHECKPOINT_EVERY = 20
WORKERS = 8

_lock = threading.Lock()


def scrape_one(url: str) -> tuple[str, dict]:
    try:
        text = sf.fetch_text(url)
        return url, sf.extract_facilities(text)
    except Exception as exc:
        return url, {"error": str(exc)}


def main() -> None:
    candidates = json.loads(CANDIDATES.read_text(encoding="utf-8"))
    results: dict[str, dict] = {}
    if OUTPUT.exists():
        results = json.loads(OUTPUT.read_text(encoding="utf-8"))

    remaining = [c for c in candidates if c["url"] not in results]
    print(f"{len(candidates)} candidates, {len(results)} already done, {len(remaining)} remaining")

    done_count = 0
    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        futures = {pool.submit(scrape_one, c["url"]): c["url"] for c in remaining}
        for future in as_completed(futures):
            url, facilities = future.result()
            with _lock:
                results[url] = facilities
                done_count += 1
                if facilities.get("error"):
                    print(f"  failed {url}: {facilities['error']}")
                if done_count % CHECKPOINT_EVERY == 0:
                    OUTPUT.write_text(json.dumps(results, indent=2), encoding="utf-8")
                    ok = sum(1 for v in results.values() if "error" not in v)
                    print(f"...{done_count}/{len(remaining)} done, {ok} ok so far")

    OUTPUT.write_text(json.dumps(results, indent=2), encoding="utf-8")
    ok = sum(1 for v in results.values() if "error" not in v)
    print(f"Done. {ok}/{len(results)} scraped ok.")


if __name__ == "__main__":
    main()
