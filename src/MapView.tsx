import { useEffect, useRef } from 'react'

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
  origin: { lat: number; lng: number; label: string } | null
  onSiteClick: (siteId: string) => void
}

type MapLibreMap = {
  remove: () => void
  setCenter: (center: [number, number]) => void
  setZoom: (zoom: number) => void
  fitBounds: (bounds: [[number, number], [number, number]], options?: {
    padding?: number
  }) => void
}

type MapLibreMarker = {
  remove: () => void
  setLngLat: (coords: [number, number]) => MapLibreMarker
  addTo: (map: MapLibreMap) => MapLibreMarker
  setPopup: (popup: unknown) => MapLibreMarker
}

type MapLibre = {
  Map: new (options: Record<string, unknown>) => MapLibreMap
  Marker: new (options?: Record<string, unknown>) => MapLibreMarker
  Popup: new (options?: Record<string, unknown>) => {
    setHTML: (html: string) => unknown
  }
}

const MapView = ({ sites, origin, onSiteClick }: MapViewProps) => {
  const validSites = sites.filter(
    (site) => Number.isFinite(site.lat) && Number.isFinite(site.lng),
  )
  const mapRef = useRef<HTMLDivElement | null>(null)
  const mapInstance = useRef<MapLibreMap | null>(null)
  const markersRef = useRef<MapLibreMarker[]>([])

  useEffect(() => {
    const maplibre = (window as unknown as { maplibregl?: MapLibre })
      .maplibregl
    if (!maplibre || !mapRef.current) return

    if (mapInstance.current) {
      mapInstance.current.remove()
      mapInstance.current = null
    }

    const map = new maplibre.Map({
      container: mapRef.current,
      style: {
        version: 8,
        sources: {
          'carto-light': {
            type: 'raster',
            tiles: [
              'https://basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png',
            ],
            tileSize: 256,
            attribution:
              '© OpenStreetMap contributors © CARTO',
          },
        },
        layers: [
          {
            id: 'base',
            type: 'raster',
            source: 'carto-light',
          },
        ],
      },
      center: [144.9631, -37.8136],
      zoom: 6,
    })

    mapInstance.current = map

    markersRef.current.forEach((marker) => marker.remove())
    markersRef.current = []

    const allPoints = [
      ...validSites.map((site) => ({ lat: site.lat, lng: site.lng })),
      ...(origin ? [{ lat: origin.lat, lng: origin.lng }] : []),
    ]
    if (!allPoints.length) return

    const lngs = allPoints.map((point) => point.lng)
    const lats = allPoints.map((point) => point.lat)
    const minLng = Math.min(...lngs)
    const maxLng = Math.max(...lngs)
    const minLat = Math.min(...lats)
    const maxLat = Math.max(...lats)

    if (allPoints.length === 1) {
      map.setCenter([allPoints[0].lng, allPoints[0].lat])
      map.setZoom(8)
    } else {
      map.fitBounds(
        [
          [minLng, minLat],
          [maxLng, maxLat],
        ],
        { padding: 40 },
      )
    }

    if (origin) {
      const originPopup = new maplibre.Popup({ offset: 16 }).setHTML(
        `<strong>Starting point</strong><br/>${origin.label}`,
      )
      const originMarker = new maplibre.Marker({ color: '#dc2626' })
        .setLngLat([origin.lng, origin.lat])
        .setPopup(originPopup)
        .addTo(map)
      markersRef.current.push(originMarker)
    }

    validSites.forEach((site) => {
      const markerEl = document.createElement('button')
      markerEl.type = 'button'
      markerEl.className = 'map-site-marker'
      markerEl.setAttribute('aria-label', `Open ${site.name}`)
      markerEl.addEventListener('click', () => onSiteClick(site.id))

      const originQuery = origin
        ? encodeURIComponent(`${origin.label} VIC`)
        : 'Melbourne+VIC'
      const link = `https://www.google.com/maps/dir/?api=1&origin=${originQuery}&destination=${site.lat},${site.lng}`
      const popup = new maplibre.Popup({ offset: 16 }).setHTML(
        `<strong>${site.name}</strong><br/>${site.parkName}<br/><a href="${link}" target="_blank" rel="noreferrer">Directions</a>`,
      )
      const marker = new maplibre.Marker({ element: markerEl })
        .setLngLat([site.lng, site.lat])
        .setPopup(popup)
        .addTo(map)
      markersRef.current.push(marker)
    })

    return () => {
      markersRef.current.forEach((marker) => marker.remove())
      markersRef.current = []
      map.remove()
      mapInstance.current = null
    }
  }, [origin, onSiteClick, validSites])

  return (
    <div className="map-panel">
      <div className="map-panel__title">Map view (schematic)</div>
      <div
        ref={mapRef}
        className="map-canvas"
        role="img"
        aria-label="Campcaster map view"
      />
      <div className="map-panel__hint">
        Click a marker for details and directions.
      </div>
    </div>
  )
}

export default MapView
