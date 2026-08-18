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

type LngLat = [number, number]

type GeoJSONPointFeature = {
  type: 'Feature'
  properties: Record<string, string | number>
  geometry: { type: 'Point'; coordinates: LngLat }
}

type MapLibreMap = {
  remove: () => void
  setCenter: (center: LngLat) => void
  setZoom: (zoom: number) => void
  fitBounds: (bounds: [LngLat, LngLat], options?: { padding?: number }) => void
  on: (event: string, layerOrHandler: string | (() => void), handler?: (event: {
    features?: Array<{
      properties: Record<string, string | number>
      geometry: { coordinates: LngLat }
    }>
    lngLat: { lng: number; lat: number }
  }) => void) => void
  addSource: (id: string, source: Record<string, unknown>) => void
  addLayer: (layer: Record<string, unknown>) => void
  getSource: (id: string) => GeoJSONSource | undefined
  getCanvas: () => { style: { cursor: string } }
  easeTo: (options: { center: LngLat; zoom: number }) => void
}

type GeoJSONSource = {
  getClusterExpansionZoom: (
    clusterId: number,
    callback: (error: unknown, zoom: number) => void,
  ) => void
}

type MapLibreMarker = {
  remove: () => void
  setLngLat: (coords: LngLat) => MapLibreMarker
  addTo: (map: MapLibreMap) => MapLibreMarker
  setPopup: (popup: unknown) => MapLibreMarker
}

type MapLibrePopup = {
  remove: () => void
  setLngLat: (coords: LngLat) => MapLibrePopup
  setHTML: (html: string) => MapLibrePopup
  addTo: (map: MapLibreMap) => MapLibrePopup
}

type MapLibre = {
  Map: new (options: Record<string, unknown>) => MapLibreMap
  Marker: new (options?: Record<string, unknown>) => MapLibreMarker
  Popup: new (options?: Record<string, unknown>) => MapLibrePopup
}

const SITES_SOURCE_ID = 'sites'
const CLUSTER_LAYER_ID = 'clusters'
const CLUSTER_COUNT_LAYER_ID = 'cluster-count'
const POINT_LAYER_ID = 'unclustered-point'

const MapView = ({ sites, origin, onSiteClick }: MapViewProps) => {
  const validSites = sites.filter(
    (site) => Number.isFinite(site.lat) && Number.isFinite(site.lng),
  )
  const mapRef = useRef<HTMLDivElement | null>(null)
  const mapInstance = useRef<MapLibreMap | null>(null)
  const markersRef = useRef<MapLibreMarker[]>([])
  const popupRef = useRef<MapLibrePopup | null>(null)

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
        glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
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

    const originQuery = origin
      ? encodeURIComponent(`${origin.label} VIC`)
      : 'Melbourne+VIC'

    const siteFeatures: GeoJSONPointFeature[] = validSites.map((site) => ({
      type: 'Feature',
      properties: {
        siteId: site.id,
        name: site.name,
        parkName: site.parkName,
      },
      geometry: {
        type: 'Point',
        coordinates: [site.lng, site.lat],
      },
    }))

    map.on('load', () => {
      map.addSource(SITES_SOURCE_ID, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: siteFeatures },
        cluster: true,
        clusterMaxZoom: 13,
        clusterRadius: 50,
      })

      map.addLayer({
        id: CLUSTER_LAYER_ID,
        type: 'circle',
        source: SITES_SOURCE_ID,
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': [
            'step',
            ['get', 'point_count'],
            '#4ade80',
            10,
            '#22c55e',
            50,
            '#16a34a',
            200,
            '#166534',
          ],
          'circle-radius': [
            'step',
            ['get', 'point_count'],
            16,
            10,
            20,
            50,
            26,
            200,
            32,
          ],
          'circle-stroke-width': 2,
          'circle-stroke-color': '#0f172a',
          'circle-stroke-opacity': 0.85,
        },
      })

      map.addLayer({
        id: CLUSTER_COUNT_LAYER_ID,
        type: 'symbol',
        source: SITES_SOURCE_ID,
        filter: ['has', 'point_count'],
        layout: {
          'text-field': '{point_count_abbreviated}',
          'text-size': 13,
          'text-font': ['Noto Sans Bold'],
        },
        paint: {
          'text-color': '#f8fafc',
        },
      })

      map.addLayer({
        id: POINT_LAYER_ID,
        type: 'circle',
        source: SITES_SOURCE_ID,
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': '#16a34a',
          'circle-radius': 7,
          'circle-stroke-width': 2,
          'circle-stroke-color': '#0f172a',
          'circle-stroke-opacity': 0.85,
        },
      })

      map.on('click', CLUSTER_LAYER_ID, (event) => {
        const feature = event.features?.[0]
        if (!feature) return
        const clusterId = feature.properties.cluster_id as number
        const source = map.getSource(SITES_SOURCE_ID)
        if (!source) return
        source.getClusterExpansionZoom(clusterId, (error, zoom) => {
          if (error) return
          map.easeTo({
            center: feature.geometry.coordinates,
            zoom,
          })
        })
      })

      map.on('click', POINT_LAYER_ID, (event) => {
        const feature = event.features?.[0]
        if (!feature) return
        const siteId = feature.properties.siteId as string
        const name = feature.properties.name as string
        const parkName = feature.properties.parkName as string
        const [lng, lat] = feature.geometry.coordinates

        popupRef.current?.remove?.()
        const link = `https://www.google.com/maps/dir/?api=1&origin=${originQuery}&destination=${lat},${lng}`
        popupRef.current = new maplibre.Popup({ offset: 16 })
          .setLngLat([lng, lat])
          .setHTML(
            `<strong>${name}</strong><br/>${parkName}<br/><a href="${link}" target="_blank" rel="noreferrer">Directions</a>`,
          )
          .addTo(map)

        onSiteClick(siteId)
      })

      map.on('mouseenter', CLUSTER_LAYER_ID, () => {
        map.getCanvas().style.cursor = 'pointer'
      })
      map.on('mouseleave', CLUSTER_LAYER_ID, () => {
        map.getCanvas().style.cursor = ''
      })
      map.on('mouseenter', POINT_LAYER_ID, () => {
        map.getCanvas().style.cursor = 'pointer'
      })
      map.on('mouseleave', POINT_LAYER_ID, () => {
        map.getCanvas().style.cursor = ''
      })
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
      <div className="map-panel__title">Map view</div>
      <div
        ref={mapRef}
        className="map-canvas"
        role="img"
        aria-label="Campcaster map view"
      />
      <div className="map-panel__hint">
        Click a marker for details and directions. Click a cluster to zoom
        in.
      </div>
    </div>
  )
}

export default MapView
