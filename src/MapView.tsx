import type { FC } from 'react'

type Site = {
  id: string
  name: string
  parkName: string
  lat: number
  lng: number
  tourismRegion?: string | null
}

type MapViewProps = {
  sites: Site[]
}

const padBounds = (min: number, max: number, pad = 0.02) => {
  const range = max - min
  return [min - range * pad, max + range * pad]
}

const MapView: FC<MapViewProps> = ({ sites }) => {
  const validSites = sites.filter(
    (site) => Number.isFinite(site.lat) && Number.isFinite(site.lng),
  )
  if (!validSites.length) {
    return (
      <div className="rounded-2xl bg-white/70 p-6 text-ink/70">
        No campsites to plot on the map.
      </div>
    )
  }

  const lats = validSites.map((site) => site.lat)
  const lngs = validSites.map((site) => site.lng)
  const [minLat, maxLat] = padBounds(Math.min(...lats), Math.max(...lats))
  const [minLng, maxLng] = padBounds(Math.min(...lngs), Math.max(...lngs))

  const width = 1000
  const height = 600

  const project = (lat: number, lng: number) => {
    const x = ((lng - minLng) / (maxLng - minLng)) * width
    const y = ((maxLat - lat) / (maxLat - minLat)) * height
    return { x, y }
  }

  return (
    <div className="map-panel">
      <div className="map-panel__title">Map view (schematic)</div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="map-canvas"
        role="img"
        aria-label="Campcaster map view"
      >
        <rect width={width} height={height} rx="20" className="map-canvas__bg" />
        {validSites.map((site) => {
          const { x, y } = project(site.lat, site.lng)
          const link = `https://www.google.com/maps/dir/?api=1&origin=Northcote+VIC&destination=${site.lat},${site.lng}`
          return (
            <a
              key={site.id}
              href={link}
              target="_blank"
              rel="noreferrer"
            >
              <circle
                cx={x}
                cy={y}
                r={4}
                className="map-canvas__dot"
              >
                <title>
                  {site.name} · {site.parkName}
                </title>
              </circle>
            </a>
          )
        })}
      </svg>
      <div className="map-panel__hint">
        Click a dot to open Google Maps directions.
      </div>
    </div>
  )
}

export default MapView
