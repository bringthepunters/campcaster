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
}

type MapLibreMap = {
  remove: () => void
  fitBounds: (bounds: [[number, number], [number, number]], options?: {
    padding?: number
  }) => void
}

type MapLibreMarker = {
  remove: () => void
}

type MapLibre = {
  Map: new (options: Record<string, unknown>) => MapLibreMap
  Marker: new (options?: Record<string, unknown>) => {
    setLngLat: (coords: [number, number]) => MapLibreMarker & {
      addTo: (map: MapLibreMap) => MapLibreMarker
      setPopup: (popup: unknown) => MapLibreMarker
    }
  }
  Popup: new (options?: Record<string, unknown>) => {
    setHTML: (html: string) => unknown
  }
}

const MapView = ({ sites }: MapViewProps) => {
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
      style: 'https://demotiles.maplibre.org/style.json',
      center: [144.9631, -37.8136],
      zoom: 6,
    })

    mapInstance.current = map

    markersRef.current.forEach((marker) => marker.remove())
    markersRef.current = []

    if (!validSites.length) return

    const lngs = validSites.map((site) => site.lng)
    const lats = validSites.map((site) => site.lat)
    const minLng = Math.min(...lngs)
    const maxLng = Math.max(...lngs)
    const minLat = Math.min(...lats)
    const maxLat = Math.max(...lats)

    map.fitBounds(
      [
        [minLng, minLat],
        [maxLng, maxLat],
      ],
      { padding: 40 },
    )

    validSites.forEach((site) => {
      const link = `https://www.google.com/maps/dir/?api=1&origin=Northcote+VIC&destination=${site.lat},${site.lng}`
      const popup = new maplibre.Popup({ offset: 16 }).setHTML(
        `<strong>${site.name}</strong><br/>${site.parkName}<br/><a href="${link}" target="_blank" rel="noreferrer">Directions</a>`,
      )
      const marker = new maplibre.Marker({ color: '#16a34a' })
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
  }, [validSites])

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
