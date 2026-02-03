# CAMPCASTER Tasks

## User Stories

### US1 (P1): Browse campgrounds with essential info
As a camper, I want a list of Victoria campgrounds with basic details (name, park, region), so I can browse options quickly.

### US2 (P1): Filter by dog-friendly and toilets
As a camper, I want to filter by dog-friendly and toilets, so I can find sites that fit my needs.

### US3 (P1): See 14-day weather forecast
As a camper, I want to view a 14-day forecast for each site, so I can plan for weather.

### US4 (P2): See rough driving time
As a camper, I want a rough driving time estimate, so I can judge trip length.

### US5 (P2): Reliable, refreshed dataset
As a maintainer, I want a weekly data refresh pipeline, so the site list stays current.

### US6 (P2): Region labels (LGA + tourism)
As a camper, I want region labels, so I can understand where a site is within Victoria.

### US7 (P3): Fire ban status
As a camper, I want fire ban information for the relevant area, so I can plan safely.

### US8 (P2): Booking links
As a camper, I want a direct link to the official Parks Victoria booking page, so I can check availability.

### US9 (P2): Driving time filter
As a camper, I want to filter sites by driving time from Northcote, so I can focus on realistic trips.

## Tasks by Story

### US1 (P1): Browse campgrounds with essential info
- [ ] Initialize SPA scaffold (Vite + React + TypeScript) and configure GitHub Pages build.
- [ ] Add UnoCSS setup and base theme tokens.
- [ ] Implement list view layout (mobile-first) with card component.
- [ ] Render site name, park name, LGA, tourism region, and coordinates (if available).

### US2 (P1): Filter by dog-friendly and toilets
- [ ] Implement filter state and UI controls (dog-friendly, toilets).
- [ ] Apply filters to list dataset with deterministic logic.
- [ ] Add empty-state UI for no matches.

### US3 (P1): See 14-day weather forecast
- [ ] Implement Open-Meteo client fetch for 14-day forecast by lat/lng.
- [ ] Add forecast summary to cards (min/max temp, rain probability).
- [ ] Cache forecasts per session (optional localStorage TTL).
- add icon for any forecast including rain or snow
- add heat icon for any day with tem exceeding 31 degrees celcius


### US4 (P2): See rough driving time
- [ ] Implement Haversine distance helper.
- [ ] Estimate drive time with fixed average speed and 10am departure assumption.
- [ ] Render approximate time in list card.

### US5 (P2): Reliable, refreshed dataset
- [ ] Add data ingestion script to fetch Vic recreation sites dataset (GeoJSON) and exclude marine marks.
- [ ] Normalize fields into merged dataset schema.
- [ ] Generate a static `public/data/sites.json` committed to the repo.
- [ ] Document manual refresh steps (no scheduled job in v1).

### US6 (P2): Region labels (LGA + tourism)
- [ ] Add boundary datasets (LGA + tourism regions) to ingestion pipeline.
- [ ] Implement spatial join to derive LGA and tourism region.
- [ ] Store region labels in merged dataset.

### US7 (P3): Fire ban status
- [ ] Identify official fire ban data source and update spec with link and cadence.
- [ ] Add ingestion or API lookup strategy for fire bans.
- [ ] Display fire ban status in the list UI with a clear safety label.

### US8 (P2): Booking links
- [ ] Identify Parks Victoria booking URL patterns or sources for each site.
- [ ] Add booking URL field to the dataset schema and populate when available.
- [ ] Display a booking link on each site card.

### US9 (P2): Driving time filter
- [ ] Add a slider control for maximum drive time (minutes or hours).
- [ ] Filter the list based on estimated drive time from Northcote.
- [ ] Add tests to verify filtering behavior.

## Notes
- Scraping for facilities must only run after explicit user approval.
- Weather API calls must be keyless (Open-Meteo) and rate-aware.
- No map in v1; list-first only.
- No park boundary polygons; region labels only.
