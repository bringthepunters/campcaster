# CAMPCASTER Technical Plan

## 1. Architecture Summary
- Static SPA hosted on GitHub Pages.
- Data ingestion and transformation via scheduled GitHub Actions.
- No backend service in v1; all data served as static JSON.

## 2. Frontend Stack
- Vite + React for SPA structure.
- UnoCSS for styling (utility-first, minimal CSS).
- TypeScript for safety and maintainability.

## 3. Data Sources and Ingestion
### 3.1 Primary Dataset
- Local static shapefile `Camp Grounds and Parks/Campgrounds.shp` for canonical site list and coordinates.
- Exclude marine parks from ingestion and UI if they appear in the dataset.

### 3.2 Facilities and Policies
- Minimal scraping allowed, via Jina AI extraction only when needed.
- Explicit user approval required before any scraping run.
- Conservative rate limits and caching; never hammer sites.

### 3.3 Region Derivation
- The recreation sites dataset does not include region labels.
- Derive both LGA and tourism region via spatial join against Vic admin boundary datasets.
- Store both fields on each merged site record.
- Do not use park boundary polygons; region labels are sufficient.

### 3.4 Refresh Cadence
- Treat the parks/camping dataset as static for at least a year.
- No scheduled refresh in v1.
- Convert shapefile to a merged JSON bundle in the repo (e.g., `public/data/sites.json`).

## 4. Weather (Open-Meteo)
- Client-side calls to Open-Meteo (keyless) for 14+ day forecasts.
- Cache in-memory per session; optional localStorage cache with TTL to reduce calls.
- Data surfaced in list view as 14-day summary (min/max temp, rain probability).

## 5. Driving Time (Rough)
- Compute rough distance using Haversine formula.
- Estimate time via fixed average speed (configurable).
- Assume departures around 10am as a baseline.

## 6. Data Model
- Single merged site record per campground with:
  - Canonical identifiers, coordinates, and park info
  - Facilities and dog policy (if verified)
  - Source metadata (dataset version, last checked)
  - Derived LGA and tourism region labels

## 7. UI/UX
- List-first UI with filters for dog-friendly and toilets.
- Mobile-first responsive layout; works well on phone and desktop.
- Region labels shown in list cards.
- No map in v1.

## 8. Testing
- Unit tests for data transforms (merge, region derivation, filters).
- UI component tests for core list rendering and filters.

## 9. Deployment
- GitHub Pages for SPA hosting.
- GitHub Actions for weekly data refresh and build.
- Static JSON bundle committed to the repo for client consumption.
- Availability proxy (Cloudflare Worker) should be deployed under the separate account `nthorpe@gmail.com` to avoid mixing with other business accounts.
- Incident RSS proxy (Cloudflare Worker) should be deployed under the separate account `nthorpe@gmail.com` and configured as `VITE_INCIDENT_PROXY_URL`.

## 10. Risks and Mitigations
- Facilities data quality: mark verified fields and keep timestamps.
- Weather API rate limits: cache results and keep payload minimal.
- Region derivation: verify boundary dataset availability and spatial join accuracy.
