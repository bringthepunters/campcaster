import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  estimateDriveTimeLabel,
  estimateDriveTimeMinutesFromOrigin,
} from './driveTime'

type Site = {
  id: string
  name: string
  parkName: string
  lat: number
  lng: number
  lga?: string | null
  tourismRegion?: string | null
  landscapeTags?: string[]
  animalsFauna?: string[]
  sourceUrl?: string | null
  facilities?: {
    dogFriendly?: boolean | null
    toilets?: boolean | null
    toiletsType?: string | null
    showers?: boolean | null
    bbq?: boolean | null
    firePits?: boolean | null
    picnicTables?: boolean | null
    drinkingWater?: boolean | null
    vehicleAccess?: boolean | null
    accessibilityNotes?: string | null
    dogPolicy?: string | null
  }
}

type WeatherSummary = {
  minTemp: number
  maxTemp: number
  maxRain: number
  maxRainMm: number
  isTooHot: boolean
  isRainy: boolean
}

type WeatherDaily = {
  time: string[]
  maxTemps: number[]
  minTemps: number[]
  rainProb: number[]
  rainMm: number[]
}

type LgaCentroids = Record<string, { lat: number; lng: number }>
type AvailabilityStatus = 'available' | 'booked_out' | 'unbookable' | 'unknown'

const FACILITY_FILTERS = [
  { key: 'dogFriendly', label: 'Dog-friendly' },
  { key: 'toilets', label: 'Toilets' },
  { key: 'showers', label: 'Showers' },
  { key: 'bbq', label: 'BBQ' },
  { key: 'firePits', label: 'Fire pits' },
  { key: 'picnicTables', label: 'Picnic tables' },
  { key: 'drinkingWater', label: 'Drinking water' },
  { key: 'vehicleAccess', label: 'Vehicle access' },
] as const

const AVAILABILITY_FILTERS = [
  { key: 'available', label: 'Available' },
  { key: 'booked_out', label: 'Booked out' },
  { key: 'unbookable', label: 'Unbookable' },
] as const

const HEAT_THRESHOLD_C = 33
const HEAT_ICON_THRESHOLD_C = 31
const RAIN_PROB_THRESHOLD = 30
const RAIN_MM_THRESHOLD = 4
const WEATHER_CACHE_TTL_MS = 12 * 60 * 60 * 1000
const AUTO_WEATHER_FETCH_LIMIT = 30
const DEFAULT_MAX_DRIVE_MINUTES = 240

const formatRegion = (site: Site) => {
  const region = site.tourismRegion ?? site.lga
  return region || 'Region TBD'
}

const getParkTypeLabel = (parkName: string) => {
  const name = parkName.toLowerCase()
  if (name.includes('national park')) return 'National Park'
  if (name.includes('state park')) return 'State Park'
  if (name.includes('heritage')) return 'Heritage'
  if (name.includes('regional park')) return 'Regional Park'
  return 'Park'
}

const getParkTypeClass = (parkName: string) => {
  const name = parkName.toLowerCase()
  if (name.includes('national park')) return 'park-type park-type--national'
  if (name.includes('state park')) return 'park-type park-type--state'
  if (name.includes('heritage')) return 'park-type park-type--heritage'
  return 'park-type'
}

const getBookingUrl = (sourceUrl?: string | null) => {
  if (!sourceUrl) return null
  try {
    const url = new URL(sourceUrl)
    const parts = url.pathname.split('/').filter(Boolean)
    const slug = parts.at(-1)
    if (!slug || slug === 'camping') return null
    return `https://bookings.parks.vic.gov.au/${slug}`
  } catch {
    return null
  }
}

const formatMinutesAsHours = (minutes: number) => {
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  if (hours <= 0) return `${mins}m`
  if (mins === 0) return `${hours}h`
  return `${hours}h ${mins}m`
}

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

const normalizeTokens = (value: string) =>
  value
    .toLowerCase()
    .replace(/[-_,/()]/g, ' ')
    .replace(
      /\b(campground|camping|camp|camping area|area|national|state|regional|park)\b/g,
      ' ',
    )
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)

function App() {
  const [sites, setSites] = useState<Site[]>([])
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [facilityFilters, setFacilityFilters] = useState<Record<string, boolean>>(
    () =>
      Object.fromEntries(
        FACILITY_FILTERS.map((filter) => [filter.key, false]),
      ),
  )
  const [availabilityFilters, setAvailabilityFilters] = useState<
    Record<AvailabilityStatus, boolean>
  >(() => ({
    available: true,
    booked_out: false,
    unbookable: true,
    unknown: false,
  }))
  const [allowHeat, setAllowHeat] = useState(false)
  const [allowRain, setAllowRain] = useState(false)
  const [lgaCentroids, setLgaCentroids] = useState<LgaCentroids>({})
  const [weatherByKey, setWeatherByKey] = useState<Record<string, WeatherDaily>>(
    {},
  )
  const [weatherLoading, setWeatherLoading] = useState<Record<string, boolean>>({})
  const [weatherErrors, setWeatherErrors] = useState<Record<string, string>>({})
  const weatherByKeyRef = useRef<Record<string, WeatherDaily>>({})
  const weatherLoadingRef = useRef<Record<string, boolean>>({})
  const weatherInFlight = useRef(new Set<string>())
  const filteredSitesRef = useRef<Site[]>([])
  const [availabilityById, setAvailabilityById] = useState<
    Record<string, AvailabilityStatus>
  >({})
  const [availabilityUrlById, setAvailabilityUrlById] = useState<
    Record<string, string>
  >({})
  const [availabilityDate, setAvailabilityDate] = useState<string | null>(null)
  const [availabilityLoading, setAvailabilityLoading] = useState(false)
  const [maxDriveMinutes, setMaxDriveMinutes] = useState(
    DEFAULT_MAX_DRIVE_MINUTES,
  )
  const [selectedDate, setSelectedDate] = useState('')

  useEffect(() => {
    weatherByKeyRef.current = weatherByKey
  }, [weatherByKey])

  useEffect(() => {
    weatherLoadingRef.current = weatherLoading
  }, [weatherLoading])

  useEffect(() => {
    const load = async () => {
      setStatus('loading')
      try {
        const baseUrl = new URL(document.baseURI).toString()
        const [sitesResponse, lgaResponse] = await Promise.all([
          fetch(new URL('data/sites.json', baseUrl)),
          fetch(new URL('data/lga_centroids.json', baseUrl)),
        ])
        if (!sitesResponse.ok) {
          throw new Error('Failed to load sites')
        }
        if (!lgaResponse.ok) {
          throw new Error('Failed to load LGA centroids')
        }
        const data = (await sitesResponse.json()) as Site[]
        const centroids = (await lgaResponse.json()) as LgaCentroids
        setSites(data)
        setLgaCentroids(centroids)
        setStatus('idle')
      } catch (error) {
        console.error(error)
        setStatus('error')
      }
    }

    void load()
  }, [])

  const loadWeather = useCallback(
    async (site: Site, allowCache = true) => {
      const weatherKey = site.lga ?? site.id
      const currentWeather = weatherByKeyRef.current[weatherKey]
      const isLoading = weatherLoadingRef.current[weatherKey]
      if (
        (allowCache && currentWeather) ||
        isLoading ||
        weatherInFlight.current.has(weatherKey)
      ) {
        return
      }
      weatherInFlight.current.add(weatherKey)

      if (allowCache) {
        try {
          const cacheRaw = localStorage.getItem('campcaster-weather-lga-v1')
          if (cacheRaw) {
            const cache = JSON.parse(cacheRaw) as Record<
              string,
              { ts: number; daily: WeatherDaily }
            >
            const cached = cache[weatherKey]
            if (cached && Date.now() - cached.ts < WEATHER_CACHE_TTL_MS) {
              setWeatherByKey((prev) => ({ ...prev, [weatherKey]: cached.daily }))
              weatherInFlight.current.delete(weatherKey)
              return
            }
          }
        } catch {
          // Ignore cache errors.
        }
      }

      setWeatherLoading((prev) => ({ ...prev, [weatherKey]: true }))
      setWeatherErrors((prev) => ({ ...prev, [weatherKey]: '' }))

      try {
        const centroid = site.lga ? lgaCentroids[site.lga] : undefined
        const lat = centroid?.lat ?? site.lat
        const lng = centroid?.lng ?? site.lng

        const url = new URL('https://api.open-meteo.com/v1/forecast')
        url.searchParams.set('latitude', lat.toString())
        url.searchParams.set('longitude', lng.toString())
        url.searchParams.set(
          'daily',
          'temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum',
        )
        url.searchParams.set('forecast_days', '14')
        url.searchParams.set('timezone', 'Australia/Melbourne')

        const response = await fetch(url.toString())
        if (!response.ok) {
          throw new Error('Failed to load weather')
        }
        const data = (await response.json()) as {
          daily?: {
            time?: string[]
            temperature_2m_max?: number[]
            temperature_2m_min?: number[]
            precipitation_probability_max?: number[]
            precipitation_sum?: number[]
          }
        }
        const times = data.daily?.time ?? []
        const maxTemps = data.daily?.temperature_2m_max ?? []
        const minTemps = data.daily?.temperature_2m_min ?? []
        const rainProb = data.daily?.precipitation_probability_max ?? []
        const rainSum = data.daily?.precipitation_sum ?? []

        if (!maxTemps.length || !minTemps.length || !times.length) {
          throw new Error('Weather data unavailable')
        }

        const daily = {
          time: times,
          maxTemps,
          minTemps,
          rainProb,
          rainMm: rainSum,
        }

        setWeatherByKey((prev) => ({ ...prev, [weatherKey]: daily }))

        if (allowCache) {
          try {
            const cacheRaw = localStorage.getItem('campcaster-weather-lga-v1')
            const cache = cacheRaw
              ? (JSON.parse(cacheRaw) as Record<
                  string,
                  { ts: number; daily: WeatherDaily }
                >)
              : {}
            cache[weatherKey] = { ts: Date.now(), daily }
            localStorage.setItem(
              'campcaster-weather-lga-v1',
              JSON.stringify(cache),
            )
          } catch {
            // Ignore cache errors.
          }
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Weather unavailable'
        setWeatherErrors((prev) => ({ ...prev, [weatherKey]: message }))
      } finally {
        setWeatherLoading((prev) => ({ ...prev, [weatherKey]: false }))
        weatherInFlight.current.delete(weatherKey)
      }
    },
    [lgaCentroids],
  )

  const getWeatherSummary = useCallback(
    (site: Site): WeatherSummary | null => {
      if (!selectedDate) return null
      const weatherKey = site.lga ?? site.id
      const daily = weatherByKey[weatherKey]
      if (!daily) return null
      const index = daily.time.findIndex((value) => value === selectedDate)
      if (index < 0) return null
      const minTemp = daily.minTemps[index]
      const maxTemp = daily.maxTemps[index]
      const maxRain = daily.rainProb[index] ?? 0
      const maxRainMm = daily.rainMm[index] ?? 0
      const isTooHot = maxTemp >= HEAT_THRESHOLD_C
      const isRainy =
        maxRain >= RAIN_PROB_THRESHOLD || maxRainMm >= RAIN_MM_THRESHOLD
      return {
        minTemp,
        maxTemp,
        maxRain,
        maxRainMm,
        isTooHot,
        isRainy,
      }
    },
    [selectedDate, weatherByKey],
  )

  const filteredSites = useMemo(() => {
    return sites.filter((site) => {
      for (const filter of FACILITY_FILTERS) {
        if (!facilityFilters[filter.key]) continue
        if (site.facilities?.[filter.key] !== true) {
          return false
        }
      }
      if (selectedDate && (!allowHeat || !allowRain)) {
        const summary = getWeatherSummary(site)
        if (!summary) return false
        if (!allowHeat && summary.maxTemp >= HEAT_THRESHOLD_C) {
          return false
        }
        if (!allowRain && summary.isRainy) {
          return false
        }
      }
      if (
        maxDriveMinutes > 0 &&
        estimateDriveTimeMinutesFromOrigin(site.lat, site.lng) >
          maxDriveMinutes
      ) {
        return false
      }
      const availabilityFilterActive = AVAILABILITY_FILTERS.some(
        (filter) => availabilityFilters[filter.key],
      )
      if (availabilityFilterActive && selectedDate) {
        const availabilityForDate =
          availabilityDate === selectedDate
            ? availabilityById[site.id] ?? 'unknown'
            : 'unknown'
        if (!availabilityFilters[availabilityForDate]) {
          return false
        }
      }

      return true
    })
  }, [
    facilityFilters,
    getWeatherSummary,
    maxDriveMinutes,
    allowHeat,
    allowRain,
    availabilityById,
    availabilityDate,
    availabilityFilters,
    selectedDate,
    sites,
    allowHeat,
    allowRain,
  ])

  useEffect(() => {
    filteredSitesRef.current = filteredSites
  }, [filteredSites])

  const maxAvailableDriveMinutes = useMemo(() => {
    if (!sites.length) return DEFAULT_MAX_DRIVE_MINUTES
    const maxMinutes = Math.max(
      ...sites.map((site) =>
        estimateDriveTimeMinutesFromOrigin(site.lat, site.lng),
      ),
    )
    return Math.max(DEFAULT_MAX_DRIVE_MINUTES, maxMinutes)
  }, [sites])

  const driveMarks = useMemo(() => {
    const marks = new Set<number>()
    marks.add(30)
    const maxMinutes = maxAvailableDriveMinutes
    for (let value = 60; value <= maxMinutes; value += 60) {
      marks.add(value)
    }
    marks.add(maxMinutes)
    return Array.from(marks).sort((a, b) => a - b)
  }, [maxAvailableDriveMinutes])

  useEffect(() => {
    if (!selectedDate) return
    const targets = filteredSites.slice(0, AUTO_WEATHER_FETCH_LIMIT)
    targets.forEach((site) => {
      void loadWeather(site)
    })
  }, [filteredSites, loadWeather])

  useEffect(() => {
    if (!selectedDate) return
    const targets = filteredSitesRef.current.slice(0, AUTO_WEATHER_FETCH_LIMIT)
    if (!targets.length) return
    setWeatherByKey({})
    setWeatherErrors({})
    setWeatherLoading({})
    targets.forEach((site) => {
      void loadWeather(site, false)
    })
  }, [loadWeather, selectedDate])

  useEffect(() => {
    if (!selectedDate) {
      setAvailabilityById({})
      setAvailabilityDate(null)
      setAvailabilityLoading(false)
      setAvailabilityUrlById({})
      return
    }

    const loadAvailability = async () => {
      setAvailabilityLoading(true)
      try {
        const proxyBase = (import.meta.env.VITE_BOOKEASY_PROXY_URL ??
          '') as string
        const url = proxyBase
          ? new URL(proxyBase)
          : new URL('https://bookings.parks.vic.gov.au/book')
        if (proxyBase) {
          url.searchParams.set('date', selectedDate)
        } else {
          url.searchParams.set('format', 'json')
          url.searchParams.set('q', '114')
          url.searchParams.set('pagenumber', '1')
          url.searchParams.set('date', selectedDate)
          url.searchParams.set('period', '1')
        }

        const response = await fetch(url.toString(), {
          cache: 'no-store',
        })
        if (!response.ok) {
          throw new Error('Availability unavailable')
        }

        const payload = (await response.json()) as {
          data?: Array<{
            alias?: string
            OperatorName?: string
            isBookable?: boolean
            isAvailable?: boolean
            isBookableAndAvailable?: boolean
          }>
        }

        const items = payload.data ?? []
        const availabilityBySlug: Record<string, AvailabilityStatus> = {}
        const availabilityItems = items.map((item) => {
          const aliasSlug = item.alias ? slugify(item.alias) : null
          const nameSlug = item.OperatorName
            ? slugify(item.OperatorName)
            : null
          const aliasOriginal = item.alias ?? null
          const tokens = [
            ...(item.alias ? normalizeTokens(item.alias) : []),
            ...(item.OperatorName ? normalizeTokens(item.OperatorName) : []),
          ]
          const isAvailable = Boolean(item.isBookableAndAvailable)
          const isBookable = Boolean(item.isBookable)
          const status: AvailabilityStatus = isAvailable
            ? 'available'
            : isBookable
              ? 'booked_out'
              : 'unbookable'
          if (aliasSlug) availabilityBySlug[aliasSlug] = status
          if (nameSlug && !availabilityBySlug[nameSlug]) {
            availabilityBySlug[nameSlug] = status
          }
          return {
            status,
            tokens: Array.from(new Set(tokens)),
            alias: aliasOriginal,
            aliasSlug,
            nameSlug,
          }
        })

        const mapped: Record<string, AvailabilityStatus> = {}
        const bookingMap: Record<string, string> = {}
        for (const site of sites) {
          const siteSlug = slugify(site.name)
          const direct = availabilityBySlug[siteSlug]
          if (direct) {
            mapped[site.id] = direct
            const directItem = availabilityItems.find(
              (item) => item.aliasSlug === siteSlug || item.nameSlug === siteSlug,
            )
            if (directItem?.alias) {
              bookingMap[site.id] =
                `https://bookings.parks.vic.gov.au/${directItem.alias}`
            }
            continue
          }
          const siteTokens = new Set(normalizeTokens(site.name))
          let best: AvailabilityStatus | null = null
          let bestTokenCount = 0
          let bestAlias: string | null = null
          for (const item of availabilityItems) {
            if (!item.tokens.length) continue
            const tokenSet = new Set(item.tokens)
            const isSubset =
              item.tokens.every((token) => siteTokens.has(token)) ||
              Array.from(siteTokens).every((token) => tokenSet.has(token))
            if (!isSubset) continue
            if (item.tokens.length > bestTokenCount) {
              bestTokenCount = item.tokens.length
              best = item.status
              bestAlias = item.alias ?? null
            }
          }
          mapped[site.id] = best ?? 'unbookable'
          if (bestAlias) {
            bookingMap[site.id] =
              `https://bookings.parks.vic.gov.au/${bestAlias}`
          }
        }

        setAvailabilityById(mapped)
        setAvailabilityDate(selectedDate)
        setAvailabilityUrlById(bookingMap)
      } catch {
        setAvailabilityById({})
        setAvailabilityDate(null)
        setAvailabilityUrlById({})
      } finally {
        setAvailabilityLoading(false)
      }
    }

    void loadAvailability()
  }, [selectedDate, sites])

  return (
    <div className="min-h-screen text-ink">
      <header className="px-6 pb-10 pt-12 sm:px-10">
        <div className="mx-auto flex max-w-6xl flex-col gap-6">
          <div className="flex flex-col gap-3">
            <h1 className="font-sans text-3xl font-semibold uppercase tracking-[0.35em] text-ink sm:text-4xl">
              CAMPCASTER
            </h1>
          </div>
          <div className="filter-panel flex flex-col gap-6">
            <div>
              <p className="campground-count-label">
                Campgrounds shown: {filteredSites.length}
              </p>
              <p className="mt-2 text-sm text-ink/60">
                First, choose the date.
              </p>
            </div>
            <div className="filter-grid">
              <div className="filter-row">
                {FACILITY_FILTERS.map((filter) => (
                  <label key={filter.key} className="checkbox-item">
                    <input
                      type="checkbox"
                      checked={facilityFilters[filter.key] ?? false}
                      onChange={(event) =>
                        setFacilityFilters((prev) => ({
                          ...prev,
                          [filter.key]: event.target.checked,
                        }))
                      }
                      className="accent-fern"
                    />
                    {filter.label}
                  </label>
                ))}
                <label className="checkbox-item">
                  <input
                    type="checkbox"
                    checked={allowHeat}
                    onChange={(event) => setAllowHeat(event.target.checked)}
                    className="accent-fern"
                    disabled={!selectedDate}
                  />
                  I dont mind the heat
                </label>
                <label className="checkbox-item">
                  <input
                    type="checkbox"
                    checked={allowRain}
                    onChange={(event) => setAllowRain(event.target.checked)}
                    className="accent-fern"
                    disabled={!selectedDate}
                  />
                  I dont mind rain
                </label>
              </div>
              <p className="text-xs text-ink/50">
                Weather thresholds: under 33C and rain under 30% + 4mm.
              </p>
              <div className="filter-row">
                {AVAILABILITY_FILTERS.map((filter) => (
                  <label key={filter.key} className="checkbox-item">
                    <input
                      type="checkbox"
                      checked={availabilityFilters[filter.key] ?? false}
                      onChange={(event) =>
                        setAvailabilityFilters((current) => ({
                          ...current,
                          [filter.key]: event.target.checked,
                        }))
                      }
                      className="accent-fern"
                      disabled={!selectedDate}
                      aria-label={`Availability ${filter.label}`}
                    />
                    {filter.label}
                  </label>
                ))}
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:items-end">
              <div className="flex flex-col gap-2">
                <label htmlFor="drive-time" className="section-heading">
                  Max drive time
                </label>
                <div className="flex items-center gap-3">
                  <input
                    id="drive-time"
                    type="range"
                    min={30}
                    max={maxAvailableDriveMinutes}
                    step={30}
                    value={maxDriveMinutes}
                    onChange={(event) =>
                      setMaxDriveMinutes(Number(event.target.value))
                    }
                    list="drive-time-marks"
                    className="w-full accent-fern"
                  />
                  <span className="text-sm text-ink/70">
                    {formatMinutesAsHours(maxDriveMinutes)}
                  </span>
                </div>
                <datalist id="drive-time-marks">
                  {driveMarks.map((value) => (
                    <option
                      key={value}
                      value={value}
                      label={formatMinutesAsHours(value)}
                    />
                  ))}
                </datalist>
              </div>
              <div className="flex flex-col gap-2">
                <label htmlFor="forecast-date" className="section-heading">
                  Forecast date
                </label>
                <input
                  id="forecast-date"
                  type="date"
                  value={selectedDate}
                  min={new Date().toISOString().slice(0, 10)}
                  max={new Date(Date.now() + 13 * 24 * 60 * 60 * 1000)
                    .toISOString()
                    .slice(0, 10)}
                  onChange={(event) => setSelectedDate(event.target.value)}
                  className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm text-ink shadow-sm outline-none transition focus:border-fern/60 focus:ring-2 focus:ring-fern/20"
                />
                <p className="text-xs text-ink/50">
                  Select a date to load weather and availability.
                </p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="px-6 pb-16 sm:px-10">
        <div className="mx-auto max-w-6xl">
          {status === 'loading' && (
            <div className="rounded-2xl bg-white/70 p-6 text-ink/70">
              Loading campgrounds…
            </div>
          )}
          {status === 'error' && (
            <div className="rounded-2xl bg-white/70 p-6 text-ember">
              Could not load campgrounds. Check `public/data/sites.json`.
            </div>
          )}
          {status === 'idle' && (
            <div className="campground-grid">
              {filteredSites.map((site) => {
                const weatherKey = site.lga ?? site.id
                const summary = getWeatherSummary(site)
                const hasWeather = summary !== null
                const minTemp = summary?.minTemp ?? null
                const maxTemp = summary?.maxTemp ?? null
                const rainProb = summary?.maxRain ?? null
                const rainMm = summary?.maxRainMm ?? null
                const isRainy = summary?.isRainy ?? false
                const isTooHot = summary?.isTooHot ?? false
                const hasPrecip =
                  rainProb !== null &&
                  rainMm !== null &&
                  (rainProb > 0 || rainMm > 0)
                const isSnowy =
                  maxTemp !== null && rainMm !== null && maxTemp <= 1 && rainMm > 0
                const isHeatIcon =
                  maxTemp !== null && maxTemp > HEAT_ICON_THRESHOLD_C
                const isOk =
                  summary !== null ? !summary.isRainy && !summary.isTooHot : false
                const bookingUrl =
                  availabilityUrlById[site.id] ?? getBookingUrl(site.sourceUrl)
                const availabilityForDate =
                  selectedDate && availabilityDate === selectedDate
                    ? availabilityById[site.id] ?? 'unknown'
                    : 'unknown'
                const availabilityLabel = !selectedDate
                  ? 'Select a date'
                  : availabilityLoading
                    ? 'Checking…'
                    : availabilityForDate === 'booked_out'
                      ? 'Booked out'
                      : availabilityForDate === 'available'
                        ? 'Available'
                        : availabilityForDate === 'unbookable'
                          ? 'Unbookable - just rock up'
                          : 'Unknown'
                const availabilityClass =
                  availabilityForDate === 'available'
                    ? 'availability-status availability-status--available'
                    : availabilityForDate === 'booked_out'
                      ? 'availability-status availability-status--unavailable'
                      : 'availability-status availability-status--unknown'
                const locationLabel = formatRegion(site)

                return (
                  <article
                    key={site.id}
                    className={`campground-card ${
                      isOk ? 'campground-card--good' : ''
                    }`}
                  >
                    <div className="flex flex-col gap-3">
                      <div>
                        <span className={getParkTypeClass(site.parkName)}>
                          {getParkTypeLabel(site.parkName)}
                        </span>
                        <h2 className="font-display text-xl font-semibold text-ink">
                          {site.name}
                        </h2>
                      </div>
                      <p className="campground-location">{locationLabel}</p>
                    </div>
                  <div className="forecast-section">
                    {!selectedDate ? (
                      <div className="forecast-prompt">
                        Select a date to see the forecast.
                      </div>
                    ) : hasWeather ? (
                      <div>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-semibold text-ink">
                              LGA forecast
                            </span>
                            <span className="rounded-full bg-ink/5 px-2 py-1 text-[11px] uppercase tracking-[0.2em] text-ink/70">
                              {isRainy || isTooHot ? 'Risky' : 'OK'}
                            </span>
                          </div>
                        <div>
                          {minTemp?.toFixed(0)}°C to {maxTemp?.toFixed(0)}°C,
                          rain risk up to {rainProb?.toFixed(0)}% (max{' '}
                          {rainMm?.toFixed(1)}mm).
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {hasPrecip ? (
                            <span
                              className="inline-flex items-center gap-1 rounded-full bg-ink/5 px-2 py-1 text-[10px] uppercase tracking-[0.2em] text-ink/60"
                              aria-label="Rain expected"
                            >
                              <svg
                                aria-hidden="true"
                                viewBox="0 0 24 24"
                                className="h-3 w-3"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <path d="M16 16a4 4 0 0 0-8 0" />
                                <path d="M6 16v3" />
                                <path d="M10 16v3" />
                                <path d="M14 16v3" />
                                <path d="M18 16v3" />
                              </svg>
                              Rain
                            </span>
                          ) : null}
                          {isSnowy ? (
                            <span
                              className="inline-flex items-center gap-1 rounded-full bg-ink/5 px-2 py-1 text-[10px] uppercase tracking-[0.2em] text-ink/60"
                              aria-label="Snow possible"
                            >
                              <svg
                                aria-hidden="true"
                                viewBox="0 0 24 24"
                                className="h-3 w-3"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <path d="M12 2v20" />
                                <path d="M4 6l16 12" />
                                <path d="M20 6L4 18" />
                              </svg>
                              Snow
                            </span>
                          ) : null}
                          {isHeatIcon ? (
                            <span
                              className="inline-flex items-center gap-1 rounded-full bg-ink/5 px-2 py-1 text-[10px] uppercase tracking-[0.2em] text-ink/60"
                              aria-label="Heat expected"
                            >
                              <svg
                                aria-hidden="true"
                                viewBox="0 0 24 24"
                                className="h-3 w-3"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <path d="M10 14a4 4 0 1 0 4 0V5a2 2 0 1 0-4 0v9z" />
                              </svg>
                              Heat
                            </span>
                          ) : null}
                        </div>
                      </div>
                    ) : weatherLoading[weatherKey] ? (
                      <div>Fetching forecast…</div>
                    ) : (
                      <div>Forecast pending.</div>
                    )}
                      {weatherErrors[weatherKey] ? (
                        <div className="mt-2 text-[11px] text-ember">
                          {weatherErrors[weatherKey]}
                        </div>
                    ) : null}
                  </div>
                    <div className="distance-badge">
                      {estimateDriveTimeLabel(site.lat, site.lng)} from Northcote
                    </div>
                    {(site.landscapeTags?.length || site.animalsFauna?.length) ? (
                      <div className="mt-2 flex flex-col gap-2">
                        {site.landscapeTags?.length ? (
                          <div className="flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.2em] text-ink/60">
                            {site.landscapeTags.map((tag) => (
                              <span
                                key={tag}
                                className="rounded-full bg-ink/5 px-2 py-1"
                              >
                                {tag.replace(/_/g, ' ')}
                              </span>
                            ))}
                          </div>
                        ) : null}
                        {site.animalsFauna?.length ? (
                          <div className="text-sm text-ink/70">
                            Wildlife: {site.animalsFauna.slice(0, 3).join(', ')}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                    {selectedDate ? (
                      <div className="availability-section">
                        <div className="availability-label">Availability</div>
                        <div className={availabilityClass}>
                          {availabilityLabel}
                        </div>
                      </div>
                    ) : null}
                    {bookingUrl ? (
                      <a
                        href={bookingUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="btn btn-secondary mt-3 w-full"
                      >
                        Availability
                      </a>
                    ) : null}
                  </article>
                )
              })}
            </div>
          )}
          {status === 'idle' && filteredSites.length === 0 && (
            <div className="rounded-2xl bg-white/70 p-6 text-ink/70">
              No matching campsites. Try a different search.
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

export default App
