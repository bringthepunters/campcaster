# CAMPCASTER Specification

## 1. Overview
**Project Name:** CAMPCASTER  
**Purpose:** Single-page application for exploring Victoria’s campgrounds and recreation sites. The app will provide users with facilities, weather forecasts, popularity trends, and booking information for selected dates. Users can filter and select sites based on specific needs to plan trips efficiently.  

---

## 2. Intended Users
- Weekend campers from Melbourne, Geelong, and surrounding areas  
- Family campers seeking specific facilities (toilets, picnic tables, dog-friendly)  
- Outdoor enthusiasts looking for weather-aware trip planning  
- People interested in understanding typical busyness/trends before booking  

**User Motivation:** Plan trips efficiently, avoid fully booked or unsuitable sites, and select campgrounds based on specific needs.  

---

## 3. Key Goals
- Discover campgrounds and recreation sites across Victoria  
- Provide structured information about facilities and amenities  
- Support dog-friendly filters and policies  
- Present weather forecasts for selected dates  
- Provide current fire ban information  
- Show approximate popularity/busyness trends  
- Provide links to official Parks Victoria booking pages  
- Enable filtering and searching by facilities, policies, weather, and popularity  

---

## 4. Features

### 4.1 Campground Listings
- Display all Victoria campgrounds and recreation sites
- Include canonical site name, park name, and coordinates

### 4.2 Site Metadata
- Name, latitude/longitude, park name, postcode
- Unique identifiers to merge with descriptive facility data

### 4.3 Facilities & Attributes
- Structured facilities per site
- Examples:
  - Toilets
  - Showers
  - BBQ
  - Fire Pits
  - Picnic Tables
  - Drinking Water
  - Vehicle Access
  - Dog Friendly
  - Dog Policy (e.g., on-lead rules)
  - Accessibility Notes

### 4.4 Weather
- Provide date-range forecasts for each site
- Include:
  - Max/min temperatures
  - Rain probability
  - Wind
  - Any warnings or alerts

### 4.5 Availability
- Initially: link to official Parks Victoria booking pages
- Optionally: approximate busyness/occupancy trends for weekends and peak periods
- Include booking type:
  - Bookable online
  - First-come
  - Mixed

### 4.6 Filters
- Filter by facilities, dog-friendly status, weather conditions, and popularity/trend indicators

### 4.7 Booking Links
- Direct links to official Parks Victoria booking pages
- Include optional metadata such as booking type

### 4.8 Popularity / Busyness Indicator
- High / Medium / Low typical busyness
- Weekend / holiday trends
- Not real-time; trend-based

---

## 5. Data Sources

| Name | Type | Description | URL / Example |
|------|------|-------------|---------------|
| Vic Recreation Sites Dataset | Geospatial / Spatial | Canonical campground metadata including site names, coordinates, park names, type/access | [https://data.gov.au/data/dataset/recreation-sites?utm_source=chatgpt.com](https://data.gov.au/data/dataset/recreation-sites?utm_source=chatgpt.com) |
| Parks Victoria Campground / Park Info Pages | Descriptive / Facility Info | Facilities and attributes not present in spatial dataset, including dog-friendly policies | Example: [Lake Elizabeth info page](https://www.parks.vic.gov.au/places-to-see/parks/great-otway-national-park/where-to-stay/lake-elizabeth-campground) |
| Parks Victoria Booking Pages | Availability / Booking | Live booking functionality; shows booking type and links to reservation system | Example: [Lake Elizabeth booking page](https://bookings.parks.vic.gov.au/lake-elizabeth-campground) |
| Weather Data | External / Forecast | Historical and forecasted weather for site coordinates and date ranges | N/A (to be sourced) |
| Optional Popularity / Trend Data | Derived / Aggregate | Approximate busyness trends over time | N/A (derived from usage or historical patterns) |

---

## 6. Context & Notes
- Dog-friendly status can have conditions (e.g., on-lead rules). Include policy text.  
- Facilities information varies; only include verified data.  
- Availability initially linked only; trend indicators may be added later.  
- Merge spatial dataset and park info pages using site name, park name, and coordinates to maintain alignment.  
- Maintain last-checked timestamps for facilities and dataset versions to detect changes.  
- Include descriptive attributes such as accessibility notes, vehicle access, and other key amenities.  
- Filters allow users to query by facilities, dog policies, weather conditions, and popularity/trends.  
- Target users value planning efficiency and actionable information.  

### Clarifications (MVP Decisions)
- MVP scope: list of Victoria parks with weather conditions for the next 14 days; booking links later.  
- Platform: web-only SPA (no PWA/offline).  
- Data sources: open datasets (including Vic recreation sites). Minimal scraping allowed via Jina AI; do not hammer sites and explicitly notify before any scraping begins.  
- Primary dataset for v1: local static shapefile `Camp Grounds and Parks/Campgrounds.shp`.  
- Exclude marine marks from the dataset and UI.  
- Update cadence: static for at least a year; refresh only when needed.  
- Weather: provider TBD; must support 13+ day forecasts.  
- Weather provider: Open-Meteo (keyless).  
- Availability: initially only links to booking pages; later indicate how early booked/out.  
- Popularity/trends: defer until real usage data exists.  
- Driving times: rough estimates; assume departures around 10am.  
- Essential filters for v1: dog-friendly and toilets.  
- Data model: no raw source record storage required.  
- UX: list-first (no map in v1); show region.  
- Region definition: no explicit region field in the recreation sites dataset; derive both LGA and tourism region via spatial join against Vic admin boundary datasets.  
- National park boundaries are not required; parks/camping areas change slowly and can be treated as static.  
- Auth: no accounts or saved trips.  
- Performance: dataset size unknown; plan for all Victoria sites.  

---

## 7. Example Data Model (Merged)
Example (JSON):

```json
{
  "id": "wye-river-camp",
  "name": "Wye River Campground",
  "parkName": "Great Otway National Park",
  "lat": -38.637,
  "lng": 143.885,
  "postcode": 3235,
  "source": {
    "geoDatasetVersion": "2026-01",
    "facilitiesLastChecked": "2026-02-02"
  },
  "facilities": {
    "toilets": true,
    "showers": false,
    "bbq": true,
    "firePits": true,
    "picnicTables": true,
    "drinkingWater": false,
    "vehicleAccess": false,
    "dogFriendly": true,
    "dogPolicy": "on leash"
  },
  "availability": {
    "bookingType": "bookable",
    "typicalBusyness": "medium",
    "weekendPressure": "high"
  }
}
```
