import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import FilterSentence from './FilterSentence'
import MapView from './MapView'
import { estimateDriveTimeMinutesFromOrigin, formatDriveTime } from './driveTime'

type Site = {
  id: string
  name: string
  parkName: string
  lat: number
  lng: number
  lga?: string | null
  tourismRegion?: string | null
  animalsFauna?: string[]
  sourceUrl?: string | null
  bookingUrl?: string | null
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
type VicLocationRecord = {
  lat: number
  lng: number
  label?: string
  lga?: string
  tourismArea?: string | null
}
type IncidentItem = {
  title: string
  link: string
  pubDate: string
  category: string
}

const FACILITY_FILTERS = [
  { key: 'dogFriendly', label: 'Dog-friendly' },
  { key: 'toilets', label: 'Toilets' },
  { key: 'showers', label: 'Showers' },
  { key: 'bbq', label: 'BBQ' },
  { key: 'firePits', label: 'Fire pits' },
  { key: 'drinkingWater', label: 'Drinking water' },
  { key: 'vehicleAccess', label: 'Vehicle access' },
] as const

const AVAILABILITY_FILTERS = [
  { key: 'available', label: 'Available' },
  { key: 'booked_out', label: 'Booked out' },
  { key: 'unbookable', label: '🎲 Just Rock up.' },
] as const

const HEAT_THRESHOLD_C = 33
const RAIN_PROB_THRESHOLD = 30
const RAIN_MM_THRESHOLD = 4
const WEATHER_CACHE_TTL_MS = 12 * 60 * 60 * 1000
const AUTO_WEATHER_FETCH_LIMIT = 30

const toTitleCase = (value: string) =>
  value
    .toLowerCase()
    .split(' ')
    .filter(Boolean)
    .map((word) => word[0]?.toUpperCase() + word.slice(1))
    .join(' ')

const formatRegion = (site: Site) => {
  const region = site.tourismRegion
  return region ? toTitleCase(region) : 'Region TBD'
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


const formatGridDate = (value: string) => {
  const date = new Date(`${value}T00:00:00`)
  return date.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric' })
}

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

const normalizeLocationText = (value: string) =>
  value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\bmt\b/g, 'mount')
    .replace(/\bst\b/g, 'saint')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(vic|victoria|australia)\b/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')

const LOCATION_ALIAS_OVERRIDES: Record<string, string> = {
  myrtleford: '3737',
}

const cleanInlineText = (value: unknown) => {
  if (Array.isArray(value)) {
    return cleanInlineText(value.join(' '))
  }
  if (typeof value !== 'string') return ''
  return value
    .replace(/[*•]/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/#+\s*/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

const cleanPolicyList = (value: unknown) => {
  if (Array.isArray(value)) {
    const items = value
      .map((entry) => cleanInlineText(entry))
      .filter(Boolean)
    return Array.from(new Set(items)).join(', ')
  }
  if (typeof value !== 'string') return ''
  const parts = value.split(/[*•]/g)
  const cleaned = parts.map((part) => cleanInlineText(part)).filter(Boolean)
  return Array.from(new Set(cleaned)).join(', ')
}

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
  const [facilityFilters, setFacilityFilters] = useState<Record<string, boolean>>(() => ({
    ...Object.fromEntries(
      FACILITY_FILTERS.map((filter) => [
        filter.key,
        ['toilets', 'firePits'].includes(filter.key),
      ]),
    ),
    flushToilets: false,
  }))
  const [availabilityFilters] = useState<
    Record<AvailabilityStatus, boolean>
  >(() => ({
    available: true,
    booked_out: false,
    unbookable: true,
    unknown: true,
  }))
  const [avoidWeather, setAvoidWeather] = useState<string[]>(['heat', 'rain'])
  const [nights, setNights] = useState(2)
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
  const [availabilityByDate, setAvailabilityByDate] = useState<
    Record<string, Record<string, AvailabilityStatus>>
  >({})
  const [availabilityUrlById, setAvailabilityUrlById] = useState<
    Record<string, string>
  >({})
  const [availabilityDate, setAvailabilityDate] = useState<string | null>(null)
  const [availabilityLoading, setAvailabilityLoading] = useState(false)
  const [maxDriveMinutes, setMaxDriveMinutes] = useState(180)
  const [selectedDate, setSelectedDate] = useState(() => {
    const today = new Date()
    const daysUntilFri = (5 - today.getDay() + 7) % 7 || 7
    const fri = new Date(today)
    fri.setDate(today.getDate() + daysUntilFri)
    return fri.toISOString().slice(0, 10)
  })
  const [incidents, setIncidents] = useState<IncidentItem[]>([])
  const [incidentsError, setIncidentsError] = useState<string | null>(null)
  const [incidentsUpdatedAt, setIncidentsUpdatedAt] = useState<string | null>(
    null,
  )
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list')
  const [selectedMapSiteId, setSelectedMapSiteId] = useState<string | null>(null)
  const [originPostcode, setOriginPostcode] = useState('3000')
  const [originCoords, setOriginCoords] = useState<{
    lat: number
    lng: number
    label: string
    postcode: string
  } | null>(null)
  const [, setOriginError] = useState<string | null>(null)
  const [vicPostcodeLookup, setVicPostcodeLookup] = useState<
    Record<string, VicLocationRecord>
  >({})
  const [driveTimesById, setDriveTimesById] = useState<Record<string, number>>(
    {},
  )
  const [driveTimesLoading, setDriveTimesLoading] = useState(false)
  const resultsRef = useRef<HTMLDivElement>(null)
  const staticIncidentText =
    'Always check emergency conditions before planning to camp anywhere.'
  const weatherMaxDate = useMemo(() => {
    const date = new Date()
    date.setDate(date.getDate() + 13)
    return date.toISOString().slice(0, 10)
  }, [])
  const selectedEndDate = useMemo(() => {
    if (!selectedDate) return ''
    if (nights <= 1) return selectedDate
    const d = new Date(`${selectedDate}T00:00:00`)
    d.setDate(d.getDate() + nights - 1)
    return d.toISOString().slice(0, 10)
  }, [selectedDate, nights])
  const selectedDates = useMemo(() => {
    if (!selectedDate) return [] as string[]
    if (!selectedEndDate || selectedEndDate < selectedDate) return [selectedDate]
    const result: string[] = []
    const cursor = new Date(`${selectedDate}T00:00:00`)
    const end = new Date(`${selectedEndDate}T00:00:00`)
    while (cursor <= end) {
      result.push(cursor.toISOString().slice(0, 10))
      cursor.setDate(cursor.getDate() + 1)
      if (result.length > 31) break
    }
    return result
  }, [selectedDate, selectedEndDate])
  const isWeatherEligible =
    selectedDates.length > 0 &&
    selectedDates.every((date) => date <= weatherMaxDate)
  const isMultiDateSelection = selectedDates.length > 1
  const originIndex = useMemo(() => {
    const aliasToPostcode = new Map<string, string>()
    const aliasEntries: Array<{ alias: string; postcode: string }> = []
    const addAlias = (alias: string, postcode: string) => {
      const normalized = normalizeLocationText(alias)
      if (!normalized) return
      if (!aliasToPostcode.has(normalized)) {
        aliasToPostcode.set(normalized, postcode)
      }
      aliasEntries.push({ alias: normalized, postcode })
    }

    Object.entries(vicPostcodeLookup).forEach(([postcode, data]) => {
      const locality = (data.label ?? '').trim()
      addAlias(postcode, postcode)
      if (locality) {
        addAlias(locality, postcode)
        addAlias(`${postcode} ${locality}`, postcode)
        addAlias(`${locality} ${postcode}`, postcode)
        if (locality.includes('Mount ')) {
          addAlias(locality.replace('Mount ', 'Mt '), postcode)
        }
        if (locality.includes('Saint ')) {
          addAlias(locality.replace('Saint ', 'St '), postcode)
        }
      }
    })

    return { aliasToPostcode, aliasEntries }
  }, [vicPostcodeLookup])

  useEffect(() => {
    weatherByKeyRef.current = weatherByKey
  }, [weatherByKey])

  useEffect(() => {
    const query = originPostcode.trim()
    if (!query) {
      setOriginCoords(null)
      setOriginError(null)
      return
    }
    const normalized = normalizeLocationText(query)
    const postcodeFromQuery = query.match(/^(\d{4})\b/)?.[1]
    let postcode =
      postcodeFromQuery ??
      LOCATION_ALIAS_OVERRIDES[normalized] ??
      originIndex.aliasToPostcode.get(normalized) ??
      null
    let match = postcode ? vicPostcodeLookup[postcode] : undefined
    if (!match && normalized) {
      const startsWith = originIndex.aliasEntries.find((entry) =>
        entry.alias.startsWith(normalized),
      )
      const contains = originIndex.aliasEntries.find((entry) =>
        entry.alias.includes(normalized),
      )
      const reverseContains = originIndex.aliasEntries.find((entry) =>
        normalized.includes(entry.alias),
      )
      const found = startsWith ?? contains ?? reverseContains
      if (found) {
        postcode = found.postcode
        match = vicPostcodeLookup[found.postcode]
      }
    }
    if (!match) {
      setOriginCoords(null)
      setOriginError('Enter a VIC postcode or locality')
      return
    }
    setOriginCoords({
      lat: match.lat,
      lng: match.lng,
      label: match.label ?? `Postcode ${postcode ?? ''}`,
      postcode: postcode ?? '',
    })
    setOriginError(null)
  }, [originIndex, originPostcode, vicPostcodeLookup])

  useEffect(() => {
    weatherLoadingRef.current = weatherLoading
  }, [weatherLoading])

  useEffect(() => {
    const load = async () => {
      setStatus('loading')
      try {
        const baseUrl = import.meta.env.BASE_URL || '/'
        const [sitesResponse, lgaResponse, postcodeResponse] = await Promise.all([
          fetch(`${baseUrl}data/sites.json`),
          fetch(`${baseUrl}data/lga_centroids.json`),
          fetch(`${baseUrl}data/vic_postcode_centroids.json`),
        ])
        if (!sitesResponse.ok) {
          throw new Error('Failed to load sites')
        }
        if (!lgaResponse.ok) {
          throw new Error('Failed to load LGA centroids')
        }
        if (!postcodeResponse.ok) {
          throw new Error('Failed to load postcode list')
        }
        const data = (await sitesResponse.json()) as Site[]
        const centroids = (await lgaResponse.json()) as LgaCentroids
        const postcodeLookup = (await postcodeResponse.json()) as Record<
          string,
          VicLocationRecord
        >
        setSites(data)
        setLgaCentroids(centroids)
        setVicPostcodeLookup(postcodeLookup)
        setStatus('idle')
      } catch (error) {
        console.error(error)
        setStatus('error')
      }
    }

    void load()
  }, [])

  useEffect(() => {
    const loadIncidents = async () => {
      try {
        setIncidentsError(null)
        const proxyBase = (import.meta.env.VITE_INCIDENT_PROXY_URL ??
          '') as string
        const url = proxyBase
          ? new URL(proxyBase)
          : new URL('https://data.emergency.vic.gov.au/Show?pageId=getIncidentRSS')
        const response = await fetch(url.toString(), { cache: 'no-store' })
        if (!response.ok) {
          throw new Error('Incident feed unavailable')
        }
        const xml = await response.text()
        const parser = new DOMParser()
        const doc = parser.parseFromString(xml, 'application/xml')
        const items = Array.from(doc.querySelectorAll('item'))
          .map((item) => {
            const title = item.querySelector('title')?.textContent?.trim() ?? ''
            const link = item.querySelector('link')?.textContent?.trim() ?? ''
            const pubDate =
              item.querySelector('pubDate')?.textContent?.trim() ?? ''
            const category =
              item.querySelector('category')?.textContent?.trim() ?? ''
            return { title, link, pubDate, category }
          })
          .filter((item) => item.title)
          .filter((item) => !/test|do not delete/i.test(item.title))
          .filter((item) => {
            if (!item.pubDate) return true
            const timestamp = Date.parse(item.pubDate)
            if (Number.isNaN(timestamp)) return true
            const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
            return timestamp >= weekAgo
          })
        setIncidents(items)
        setIncidentsUpdatedAt(new Date().toISOString())
      } catch (error) {
        console.error(error)
        setIncidentsError('Unable to load live incident feed.')
        setIncidents([])
      }
    }

    void loadIncidents()
    const interval = setInterval(loadIncidents, 10 * 60 * 1000)
    return () => clearInterval(interval)
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

  const getWeatherSummaryForDate = useCallback(
    (site: Site, date: string): WeatherSummary | null => {
      if (!date) return null
      const weatherKey = site.lga ?? site.id
      const daily = weatherByKey[weatherKey]
      if (!daily) return null
      const index = daily.time.findIndex((value) => value === date)
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
    [weatherByKey],
  )

  const getWeatherSummary = useCallback(
    (site: Site): WeatherSummary | null => {
      const primaryDate = selectedDates[0]
      if (!primaryDate) return null
      return getWeatherSummaryForDate(site, primaryDate)
    },
    [getWeatherSummaryForDate, selectedDates],
  )

  const getSiteAvailabilityStatus = useCallback(
    (siteId: string): AvailabilityStatus => {
      if (!selectedDate) return 'unknown'
      if (availabilityDate !== selectedDate) return 'unknown'
      return availabilityById[siteId] ?? 'unknown'
    },
    [availabilityById, availabilityDate, selectedDate],
  )

  const filteredSites = useMemo(() => {
    const filtered = sites.filter((site) => {
      for (const filter of FACILITY_FILTERS) {
        if (!facilityFilters[filter.key]) continue
        if (site.facilities?.[filter.key] !== true) {
          return false
        }
      }
      if (facilityFilters['flushToilets'] && site.facilities?.toiletsType !== 'flushing') return false
      if (selectedDate && isWeatherEligible && avoidWeather.length > 0) {
        const summary = getWeatherSummary(site)
        if (!summary) return true
        if (avoidWeather.includes('heat') && summary.maxTemp >= HEAT_THRESHOLD_C) return false
        if (avoidWeather.includes('rain') && summary.isRainy) return false
      }
      if (!originCoords) {
        return false
      }
      const driveMinutes = driveTimesById[site.id]
      if (maxDriveMinutes > 0 && driveMinutes !== undefined) {
        if (driveMinutes > maxDriveMinutes) {
          return false
        }
      }
      const availabilityFilterActive = AVAILABILITY_FILTERS.some(
        (filter) => availabilityFilters[filter.key],
      )
      if (
        availabilityFilterActive &&
        selectedDates.length > 0 &&
        !availabilityLoading &&
        availabilityDate !== null
      ) {
        const availabilityForDate = getSiteAvailabilityStatus(site.id)
        if (!availabilityFilters[availabilityForDate]) {
          return false
        }
      }

      return true
    })
    const availabilityRank: Record<AvailabilityStatus, number> = {
      available: 0,
      unbookable: 1,
      booked_out: 2,
      unknown: 3,
    }
    return filtered.sort((a, b) => {
      const availabilityA = getSiteAvailabilityStatus(a.id)
      const availabilityB = getSiteAvailabilityStatus(b.id)
      const availabilityDiff =
        availabilityRank[availabilityA] - availabilityRank[availabilityB]
      if (availabilityDiff !== 0) return availabilityDiff
      const driveA = driveTimesById[a.id]
      const driveB = driveTimesById[b.id]
      if (driveA === undefined && driveB === undefined) return 0
      if (driveA === undefined) return 1
      if (driveB === undefined) return -1
      return driveA - driveB
    })
  }, [
    facilityFilters,
    getWeatherSummary,
    maxDriveMinutes,
    avoidWeather,
    availabilityById,
    availabilityDate,
    getSiteAvailabilityStatus,
    availabilityFilters,
    selectedDate,
    selectedDates,
    sites,
    originCoords,
    driveTimesById,
  ])

  // Sites that match every filter except availability, but are hidden
  // because they're confirmed booked out on the selected date -- shown as
  // a count so "booked out" hiding isn't invisible (there's no filter
  // chip to disable it).
  const bookedOutHiddenCount = useMemo(() => {
    if (
      availabilityFilters.booked_out ||
      !selectedDates.length ||
      availabilityLoading ||
      availabilityDate === null
    ) {
      return 0
    }
    return sites.filter((site) => {
      for (const filter of FACILITY_FILTERS) {
        if (!facilityFilters[filter.key]) continue
        if (site.facilities?.[filter.key] !== true) return false
      }
      if (facilityFilters['flushToilets'] && site.facilities?.toiletsType !== 'flushing') return false
      if (selectedDate && isWeatherEligible && avoidWeather.length > 0) {
        const summary = getWeatherSummary(site)
        if (summary) {
          if (avoidWeather.includes('heat') && summary.maxTemp >= HEAT_THRESHOLD_C) return false
          if (avoidWeather.includes('rain') && summary.isRainy) return false
        }
      }
      if (!originCoords) return false
      const driveMinutes = driveTimesById[site.id]
      if (maxDriveMinutes > 0 && driveMinutes !== undefined && driveMinutes > maxDriveMinutes) {
        return false
      }
      return getSiteAvailabilityStatus(site.id) === 'booked_out'
    }).length
  }, [
    sites,
    facilityFilters,
    selectedDate,
    selectedDates,
    isWeatherEligible,
    avoidWeather,
    getWeatherSummary,
    originCoords,
    driveTimesById,
    maxDriveMinutes,
    availabilityFilters,
    availabilityLoading,
    availabilityDate,
    getSiteAvailabilityStatus,
  ])

  useEffect(() => {
    filteredSitesRef.current = filteredSites
  }, [filteredSites])



  const selectedMapSite = useMemo(
    () => filteredSites.find((site) => site.id === selectedMapSiteId) ?? null,
    [filteredSites, selectedMapSiteId],
  )

  useEffect(() => {
    if (!selectedDates.length || !isWeatherEligible) return
    const targets = filteredSites.slice(0, AUTO_WEATHER_FETCH_LIMIT)
    targets.forEach((site) => {
      void loadWeather(site)
    })
  }, [filteredSites, isWeatherEligible, loadWeather, selectedDates])

  useEffect(() => {
    if (viewMode !== 'map') {
      setSelectedMapSiteId(null)
      return
    }
    if (selectedMapSiteId && !filteredSites.some((site) => site.id === selectedMapSiteId)) {
      setSelectedMapSiteId(null)
    }
  }, [filteredSites, selectedMapSiteId, viewMode])

  useEffect(() => {
    if (!originCoords) {
      setDriveTimesById({})
      setDriveTimesLoading(false)
      return
    }

    const cacheKey = `driveTimes:${originCoords.postcode}:${sites.length}`
    const cached = window.localStorage.getItem(cacheKey)
    if (cached) {
      try {
        const parsed = JSON.parse(cached) as Record<string, number>
        setDriveTimesById(parsed)
        return
      } catch {
        window.localStorage.removeItem(cacheKey)
      }
    }

    const proxyBase = (import.meta.env.VITE_ROUTE_PROXY_URL ?? '') as string
    if (!proxyBase) {
      const estimates: Record<string, number> = {}
      sites.forEach((site) => {
        if (Number.isFinite(site.lat) && Number.isFinite(site.lng)) {
          estimates[site.id] = estimateDriveTimeMinutesFromOrigin(
            originCoords.lat,
            originCoords.lng,
            site.lat,
            site.lng,
          )
        }
      })
      setDriveTimesById(estimates)
      setDriveTimesLoading(false)
      return
    }

    let cancelled = false
    const loadDriveTimes = async () => {
      setDriveTimesLoading(true)
      try {
        const allSites = sites.filter(
          (site) => Number.isFinite(site.lat) && Number.isFinite(site.lng),
        )
        const batchSize = 50
        const results: Record<string, number> = {}
        for (let i = 0; i < allSites.length; i += batchSize) {
          if (cancelled) return
          const batch = allSites.slice(i, i + batchSize)
          const response = await fetch(proxyBase, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              origin: { lat: originCoords.lat, lng: originCoords.lng },
              destinations: batch.map((site) => ({
                id: site.id,
                lat: site.lat,
                lng: site.lng,
              })),
            }),
          })
          if (!response.ok) {
            throw new Error('Drive time request failed')
          }
          const payload = (await response.json()) as {
            durations?: Record<string, number>
          }
          Object.assign(results, payload.durations ?? {})
          setDriveTimesById((prev) => ({ ...prev, ...payload.durations }))
          await new Promise((resolve) => setTimeout(resolve, 300))
        }
        window.localStorage.setItem(cacheKey, JSON.stringify(results))
      } catch (error) {
        if (!cancelled) {
          console.error(error)
        }
      } finally {
        if (!cancelled) {
          setDriveTimesLoading(false)
        }
      }
    }

    void loadDriveTimes()
    return () => {
      cancelled = true
    }
  }, [originCoords, sites])

  useEffect(() => {
    if (!selectedDates.length || !isWeatherEligible) return
    const targets = filteredSitesRef.current.slice(0, AUTO_WEATHER_FETCH_LIMIT)
    if (!targets.length) return
    setWeatherByKey({})
    setWeatherErrors({})
    setWeatherLoading({})
    targets.forEach((site) => {
      void loadWeather(site, false)
    })
  }, [isWeatherEligible, loadWeather, selectedDates])

  useEffect(() => {
    if (!selectedDates.length) {
      setAvailabilityById({})
      setAvailabilityByDate({})
      setAvailabilityDate(null)
      setAvailabilityLoading(false)
      setAvailabilityUrlById({})
      return
    }

    const mapAvailabilityItems = (
      items: Array<{
        alias?: string
        OperatorName?: string
        isBookable?: boolean
        isAvailable?: boolean
        isBookableAndAvailable?: boolean
      }>,
    ) => {
      const availabilityBySlug: Record<string, AvailabilityStatus> = {}
      const availabilityItems = items.map((item) => {
        const aliasSlug = item.alias ? slugify(item.alias) : null
        const nameSlug = item.OperatorName ? slugify(item.OperatorName) : null
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
            bookingMap[site.id] = `https://bookings.parks.vic.gov.au/${directItem.alias}`
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
          bookingMap[site.id] = `https://bookings.parks.vic.gov.au/${bestAlias}`
        }
      }

      return { mapped, bookingMap }
    }

    let cancelled = false
    const loadAvailability = async () => {
      setAvailabilityLoading(true)
      try {
        const proxyBase = (import.meta.env.VITE_BOOKEASY_PROXY_URL ?? '') as string
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

        const response = await fetch(url.toString(), { cache: 'no-store' })
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
        const { mapped, bookingMap } = mapAvailabilityItems(payload.data ?? [])
        if (cancelled) return
        setAvailabilityById(mapped)
        setAvailabilityDate(selectedDate)
        setAvailabilityUrlById(bookingMap)
      } catch (err) {
        if (cancelled) return
        console.error('[availability] fetch failed:', err)
        setAvailabilityById({})
        setAvailabilityDate(null)
        setAvailabilityUrlById({})
      } finally {
        if (!cancelled) {
          setAvailabilityLoading(false)
        }
      }
    }

    void loadAvailability()
    return () => {
      cancelled = true
    }
  }, [selectedDate, sites])

  const handleReset = useCallback(() => {
    const today = new Date()
    const daysUntilFri = (5 - today.getDay() + 7) % 7 || 7
    const fri = new Date(today)
    fri.setDate(today.getDate() + daysUntilFri)
    setSelectedDate(fri.toISOString().slice(0, 10))
    setNights(2)
    setOriginPostcode('3000')
    setMaxDriveMinutes(180)
    setFacilityFilters({
      ...Object.fromEntries(
        FACILITY_FILTERS.map((f) => [f.key, ['dogFriendly', 'toilets', 'firePits'].includes(f.key)]),
      ),
      flushToilets: false,
    })
    setAvoidWeather(['heat', 'rain'])
  }, [])

  return (
    <div className="min-h-screen text-ink">

      {/* ── Incident banner ── */}
      <div
        className="incident-banner incident-banner--egg px-6 py-3 text-sm font-semibold sm:px-10"
        style={{ background: '#f1c84b', color: '#2b2b2b' }}
      >
        <div className="mx-auto max-w-6xl">
          {incidentsUpdatedAt ? (
            <div className="mb-2 text-xs font-medium uppercase tracking-[0.15em] text-ink/70">
              Feed updated {new Date(incidentsUpdatedAt).toLocaleTimeString()}
            </div>
          ) : null}
          {incidents.length > 0 ? (
            <div className="incident-marquee">
              <div className="incident-track">
                {[...incidents, ...incidents].map((incident, index) => {
                  const showStatic = (index + 1) % 4 === 0
                  return (
                    <span key={`${incident.title}-${index}`} className="incident-item">
                      <a
                        href={incident.link || 'https://www.emergency.vic.gov.au'}
                        target="_blank"
                        rel="noreferrer"
                        className="incident-link"
                      >
                        {incident.title}
                      </a>
                      {incident.category ? (
                        <span className="incident-badge">{incident.category}</span>
                      ) : null}
                      {showStatic ? (
                        <span className="incident-static">
                          {staticIncidentText}{' '}
                          <a
                            href="https://www.emergency.vic.gov.au"
                            target="_blank"
                            rel="noreferrer"
                            className="incident-link"
                          >
                            Check VicEmergency
                          </a>
                        </span>
                      ) : null}
                    </span>
                  )
                })}
              </div>
            </div>
          ) : (
            <div className="text-xs font-semibold uppercase tracking-[0.15em]">
              {staticIncidentText}{' '}
              <a
                href="https://www.emergency.vic.gov.au"
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-4 transition hover:opacity-80"
              >
                Check VicEmergency
              </a>
              {incidentsError ? ` • ${incidentsError}` : ''}
            </div>
          )}
        </div>
      </div>

      {/* ── Sentence filter ── */}
      <FilterSentence
        selectedDate={selectedDate}
        setSelectedDate={setSelectedDate}
        nights={nights}
        setNights={setNights}
        originPostcode={originPostcode}
        setOriginPostcode={setOriginPostcode}
        originLabel={originCoords?.label ?? originPostcode}
        maxDriveMinutes={maxDriveMinutes}
        setMaxDriveMinutes={setMaxDriveMinutes}
        facilityFilters={facilityFilters}
        setFacilityFilters={setFacilityFilters}
        avoidWeather={avoidWeather}
        setAvoidWeather={setAvoidWeather}
        filteredCount={filteredSites.length}
        bookedOutHiddenCount={bookedOutHiddenCount}
        isWeatherEligible={isWeatherEligible}
        incidentsUpdatedAt={incidentsUpdatedAt}
        onReset={handleReset}
        onShowSites={() => resultsRef.current?.scrollIntoView({ behavior: 'smooth' })}
      />

      {/* ── Results ── */}
      <div className="content-area" ref={resultsRef}>
        <div className="content-area__inner">
          <div className="results-bar">
            <div className="results-bar__count">
              <strong>{filteredSites.length}</strong>{' '}
              campsite{filteredSites.length !== 1 ? 's' : ''} found
              {bookedOutHiddenCount > 0 && (
                <span className="results-bar__booked-out-note">
                  {' '}
                  ({bookedOutHiddenCount} booked out hidden)
                </span>
              )}
            </div>
            <div className="view-toggle">
              <button
                type="button"
                className={`view-toggle__button ${viewMode === 'list' ? 'is-active' : ''}`}
                onClick={() => setViewMode('list')}
                aria-pressed={viewMode === 'list'}
                aria-label="List view"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M6 7h12M6 12h12M6 17h12"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
              <button
                type="button"
                className={`view-toggle__button ${viewMode === 'map' ? 'is-active' : ''}`}
                onClick={() => setViewMode('map')}
                aria-pressed={viewMode === 'map'}
                aria-label="Map view"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M4 6l6-2 5 2 5-2v14l-5 2-5-2-6 2V6z"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinejoin="round"
                  />
                  <path d="M10 4v14M15 6v14" stroke="currentColor" strokeWidth="1.8" />
                </svg>
              </button>
            </div>
          </div>

          {status === 'loading' && (
            <div className="rounded-2xl bg-white/70 p-6 text-ink/70 mt-4">
              Loading campgrounds…
            </div>
          )}
          {status === 'error' && (
            <div className="rounded-2xl bg-white/70 p-6 text-ember mt-4">
              Could not load campgrounds. Check `public/data/sites.json`.
            </div>
          )}

          {status === 'idle' && viewMode === 'list' && (
            <div className="campground-grid mt-4">
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
                    const isOk =
                      summary !== null ? !summary.isRainy && !summary.isTooHot : false
                    const bookingUrl =
                      site.bookingUrl ??
                      availabilityUrlById[site.id] ??
                      site.sourceUrl ??
                      getBookingUrl(site.sourceUrl)
                    const availabilityForDate = getSiteAvailabilityStatus(site.id)
                    const availabilityLabel = selectedDates.length === 0
                      ? 'Select a date to check'
                      : availabilityLoading
                        ? 'Checking…'
                        : availabilityForDate === 'booked_out'
                          ? 'Fully booked'
                          : availabilityForDate === 'available'
                            ? 'Available to book'
                            : availabilityForDate === 'unbookable'
                              ? 'Just rock up'
                              : 'Availability unknown'
                    const availabilityNote = availabilityForDate === 'unbookable'
                      ? 'No booking system — you\'ll need to show up in person and see.'
                      : null
                    const availabilityClass =
                      availabilityForDate === 'available'
                        ? 'availability-status availability-status--available'
                        : availabilityForDate === 'booked_out'
                          ? 'availability-status availability-status--unavailable'
                          : availabilityForDate === 'unbookable'
                            ? 'availability-status availability-status--rockup'
                            : 'availability-status availability-status--unknown'
                    const locationLabel = formatRegion(site)
                    const originLabel = originCoords?.label ?? 'Postcode'
                    const driveMinutes = driveTimesById[site.id]
                    const driveLabel =
                      originCoords && driveMinutes !== undefined
                        ? formatDriveTime(driveMinutes)
                        : driveTimesLoading
                          ? 'Calculating…'
                          : 'Unknown'
                    const originQuery = originCoords
                      ? encodeURIComponent(
                          `${originCoords.postcode} ${originCoords.label} VIC`,
                        )
                      : 'Northcote+VIC'
                    const mapsLink = `https://www.google.com/maps/dir/?api=1&origin=${originQuery}&destination=${site.lat},${site.lng}`
                    const facilities = site.facilities ?? {}
                    const dogPolicyText = facilities.dogPolicy
                      ? cleanPolicyList(facilities.dogPolicy)
                      : ''
                    const accessibilityText = facilities.accessibilityNotes
                      ? cleanInlineText(facilities.accessibilityNotes)
                      : ''
                    const facilityItems = [
                      {
                        key: 'toilets',
                        label: facilities.toiletsType
                          ? `Toilets (${facilities.toiletsType})`
                          : 'Some kind of toilet',
                        value: facilities.toilets,
                      },
                      { key: 'showers', label: 'Showers', value: facilities.showers },
                      { key: 'bbq', label: 'BBQ', value: facilities.bbq },
                      { key: 'firePits', label: 'Fire pits', value: facilities.firePits },
                      {
                        key: 'picnicTables',
                        label: 'Picnic tables',
                        value: facilities.picnicTables,
                      },
                      {
                        key: 'drinkingWater',
                        label: 'Drinking water',
                        value: facilities.drinkingWater,
                      },
                      {
                        key: 'vehicleAccess',
                        label: 'Vehicle access',
                        value: facilities.vehicleAccess,
                      },
                      {
                        key: 'dogFriendly',
                        label: 'Dog friendly',
                        value: facilities.dogFriendly,
                      },
                    ]
                    const hasFacilityDetails =
                      facilityItems.some(
                        (item) => item.value !== null && item.value !== undefined,
                      )

                    return (
                      <article
                        key={site.id}
                        className={`campground-card ${
                          isOk ? 'campground-card--good' : ''
                        }`}
                      >
                        <div className="flex flex-col gap-1">
                          <div>
                            <span className={getParkTypeClass(site.parkName)}>
                              {getParkTypeLabel(site.parkName)}
                            </span>
                            <h2 className="font-display text-xl font-semibold text-ink">
                              {site.name}
                            </h2>
                          </div>
                          <p className="campground-location">{locationLabel}</p>
                          {originCoords ? (
                            <a
                              href={mapsLink}
                              target="_blank"
                              rel="noreferrer"
                              className="distance-text"
                            >
                              🚗 {driveLabel} from {originLabel}
                            </a>
                          ) : null}
                        </div>
                        <div className="forecast-section">
                          {!selectedDates.length ? (
                            <div className="forecast-prompt">
                              Select a date to see the forecast.
                            </div>
                          ) : isMultiDateSelection ? (
                            <div className="forecast-grid">
                              <div className="forecast-grid__row">
                                <div className="forecast-grid__head">Date</div>
                                {selectedDates.map((date) => (
                                  <div key={`${site.id}-${date}-head`} className="forecast-grid__date">
                                    {formatGridDate(date)}
                                  </div>
                                ))}
                              </div>
                              <div className="forecast-grid__row">
                                <div className="forecast-grid__head">Weather</div>
                                {selectedDates.map((date) => {
                                  if (date > weatherMaxDate) {
                                    return (
                                      <div
                                        key={`${site.id}-${date}-weather`}
                                        className="forecast-grid__cell forecast-grid__icon-cell forecast-grid__icon-cell--chance"
                                        title="We don’t know what the weather will be like"
                                      >
                                        🎲
                                      </div>
                                    )
                                  }
                                  const daySummary = getWeatherSummaryForDate(site, date)
                                  if (!daySummary) {
                                    return (
                                      <div
                                        key={`${site.id}-${date}-weather`}
                                        className="forecast-grid__cell forecast-grid__icon-cell"
                                        title="Forecast pending"
                                      >
                                        -
                                      </div>
                                    )
                                  }
                                  const weatherIcon = daySummary.isRainy
                                    ? '🌧️'
                                    : daySummary.isTooHot
                                      ? '☀️'
                                      : '⛅'
                                  const weatherTitle = `${daySummary.minTemp.toFixed(
                                    0,
                                  )}°C to ${daySummary.maxTemp.toFixed(
                                    0,
                                  )}°C, rain risk up to ${daySummary.maxRain.toFixed(
                                    0,
                                  )}% (max ${daySummary.maxRainMm.toFixed(1)}mm)`
                                  return (
                                    <div
                                      key={`${site.id}-${date}-weather`}
                                      className="forecast-grid__cell forecast-grid__icon-cell"
                                      title={weatherTitle}
                                    >
                                      {weatherIcon}
                                    </div>
                                  )
                                })}
                              </div>
                              <div className="forecast-grid__row">
                                <div className="forecast-grid__head">Avail</div>
                                {selectedDates.map((date) => {
                                  const dayAvailability = availabilityByDate[date]?.[site.id] ?? 'unknown'
                                  const dayIcon =
                                    dayAvailability === 'available'
                                      ? '✓'
                                      : dayAvailability === 'booked_out'
                                        ? '✗'
                                        : dayAvailability === 'unbookable'
                                          ? '🎲'
                                          : '–'
                                  const dayTitle =
                                    dayAvailability === 'available'
                                      ? 'Available'
                                      : dayAvailability === 'booked_out'
                                        ? 'Booked out'
                                        : dayAvailability === 'unbookable'
                                          ? 'Not bookable — just rock up'
                                          : 'Unknown'
                                  return (
                                    <div
                                      key={`${site.id}-${date}-avail`}
                                      className={`forecast-grid__cell forecast-grid__icon-cell forecast-grid__avail--${dayAvailability}`}
                                      title={dayTitle}
                                    >
                                      {dayIcon}
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          ) : !isWeatherEligible ? (
                            <div className="forecast-prompt">
                              🎲 We don’t know what the weather will be like that far out.
                            </div>
                          ) : hasWeather ? (
                            <div
                              className={`weather-panel ${
                                isTooHot
                                  ? 'weather-panel--hot'
                                  : hasPrecip
                                    ? 'weather-panel--rain'
                                    : 'weather-panel--ok'
                              }`}
                            >
                              <div className="weather-panel__icon" aria-hidden="true">
                                {(rainProb ?? 0) > 5 ? '🌧️' : isTooHot ? '☀️' : '⛅'}
                              </div>
                              <div className="weather-panel__meta">
                                <span className="weather-panel__title">Forecast</span>
                                <span className={`weather-panel__chip ${
                                  isRainy || isTooHot ? 'is-risky' : 'is-ok'
                                }`}>
                                  {isRainy || isTooHot ? 'Risky' : 'OK'}
                                </span>
                              </div>
                              <div className="weather-panel__range">
                                {minTemp?.toFixed(0)}°C to {maxTemp?.toFixed(0)}°C
                              </div>
                              <div className="weather-panel__rain">
                                Rain risk up to {rainProb?.toFixed(0)}% (max {rainMm?.toFixed(1)}mm).
                              </div>
                              {(rainProb ?? 0) > 5 ? (
                                <div className="weather-panel__badge">🌧️ Rain likely</div>
                              ) : null}
                            </div>
                          ) : weatherLoading[weatherKey] ? (
                            <div>Fetching forecast…</div>
                          ) : (
                            <div>Forecast pending.</div>
                          )}
                          {!hasWeather && weatherErrors[weatherKey] ? (
                            <div className="mt-2 text-[11px] text-ember">
                              {weatherErrors[weatherKey]}
                            </div>
                          ) : null}
                        </div>
                        {hasFacilityDetails ? (
                          <div className="facilities-block flex flex-col gap-2">
                            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-ink/50">
                              Facilities
                            </div>
                            <div className="flex flex-wrap gap-2 text-[9px] uppercase tracking-[0.16em] text-ink/60">
                              {facilityItems
                                .filter(
                                  (item) =>
                                    item.value !== null &&
                                    item.value !== undefined,
                                )
                                .filter((item) => item.value === true)
                                .map((item) => (
                                  <span
                                    key={item.key}
                                    className="rounded-full bg-ink/5 px-2 py-1"
                                    title={
                                      item.key === 'dogFriendly' && dogPolicyText
                                        ? dogPolicyText
                                        : item.key === 'accessibilityNotes' &&
                                            accessibilityText
                                          ? accessibilityText
                                          : undefined
                                    }
                                  >
                                    {item.label}
                                  </span>
                                ))}
                            </div>
                          </div>
                        ) : null}
                        {selectedDates.length > 0 ? (
                          <div className="availability-section">
                            <div className="availability-label">Availability</div>
                            {availabilityLoading ? (
                              <div className="text-xs text-ink/60">
                                Checking availability…
                              </div>
                            ) : null}
                            <div className={availabilityClass}>
                              {availabilityLabel}
                            </div>
                            {availabilityNote ? (
                              <div className="text-xs" style={{ marginTop: 4, color: '#92400e', opacity: 0.85 }}>
                                {availabilityNote}
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                        {bookingUrl ? (
                          <a
                            href={bookingUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="btn btn-secondary btn-small mt-3 w-full"
                          >
                            Link to camp site
                          </a>
                        ) : null}
                      </article>
                    )
                  })}
                </div>
              )}
          {status === 'idle' && viewMode === 'map' && (
            <>
              <MapView
                sites={filteredSites}
                origin={originCoords}
                onSiteClick={(siteId) => setSelectedMapSiteId(siteId)}
              />
              {selectedMapSite ? (
                <div
                  className="map-card-overlay"
                  role="dialog"
                  aria-modal="true"
                  aria-label={selectedMapSite.name}
                >
                  <div className="map-card-overlay__backdrop" onClick={() => setSelectedMapSiteId(null)} />
                  <article className="campground-card map-card-popup">
                    <button
                      type="button"
                      className="map-card-popup__close"
                      onClick={() => setSelectedMapSiteId(null)}
                      aria-label="Close campsite details"
                    >
                      Close
                    </button>
                    {(() => {
                          const site = selectedMapSite
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
                          const availabilityForDate = getSiteAvailabilityStatus(site.id)
                          const availabilityLabel = selectedDates.length === 0
                            ? 'Select a date to check'
                            : availabilityLoading
                              ? 'Checking…'
                              : availabilityForDate === 'booked_out'
                                ? 'Fully booked'
                                : availabilityForDate === 'available'
                                  ? 'Available to book'
                                  : availabilityForDate === 'unbookable'
                                    ? 'Just rock up'
                                    : 'Availability unknown'
                          const availabilityNote = availabilityForDate === 'unbookable'
                            ? "No booking system — you'll need to show up in person and see."
                            : null
                          const availabilityClass =
                            availabilityForDate === 'available'
                              ? 'availability-status availability-status--available'
                              : availabilityForDate === 'booked_out'
                                ? 'availability-status availability-status--unavailable'
                                : availabilityForDate === 'unbookable'
                                  ? 'availability-status availability-status--rockup'
                                  : 'availability-status availability-status--unknown'
                          const driveMinutes = driveTimesById[site.id]
                          const driveLabel =
                            originCoords && driveMinutes !== undefined
                              ? formatDriveTime(driveMinutes)
                              : driveTimesLoading
                                ? 'Calculating…'
                                : 'Unknown'
                          const originQuery = originCoords
                            ? encodeURIComponent(
                                `${originCoords.postcode} ${originCoords.label} VIC`,
                              )
                            : 'Northcote+VIC'
                          const mapsLink = `https://www.google.com/maps/dir/?api=1&origin=${originQuery}&destination=${site.lat},${site.lng}`
                          const bookingUrl =
                            site.bookingUrl ??
                            availabilityUrlById[site.id] ??
                            site.sourceUrl ??
                            getBookingUrl(site.sourceUrl)
                          const facilities = site.facilities ?? {}
                          const facilityItems = [
                            {
                              key: 'toilets',
                              label: facilities.toiletsType
                                ? `Toilets (${facilities.toiletsType})`
                                : 'Some kind of toilet',
                              value: facilities.toilets,
                            },
                            { key: 'showers', label: 'Showers', value: facilities.showers },
                            { key: 'bbq', label: 'BBQ', value: facilities.bbq },
                            { key: 'firePits', label: 'Fire pits', value: facilities.firePits },
                            {
                              key: 'picnicTables',
                              label: 'Picnic tables',
                              value: facilities.picnicTables,
                            },
                            {
                              key: 'drinkingWater',
                              label: 'Drinking water',
                              value: facilities.drinkingWater,
                            },
                            {
                              key: 'vehicleAccess',
                              label: 'Vehicle access',
                              value: facilities.vehicleAccess,
                            },
                            {
                              key: 'dogFriendly',
                              label: 'Dog friendly',
                              value: facilities.dogFriendly,
                            },
                          ]
                          const hasFacilityDetails = facilityItems.some((item) => item.value === true)

                          return (
                            <>
                              <div className="flex flex-col gap-1">
                                <div>
                                  <span className={getParkTypeClass(site.parkName)}>
                                    {getParkTypeLabel(site.parkName)}
                                  </span>
                                  <h2 className="font-display text-xl font-semibold text-ink">
                                    {site.name}
                                  </h2>
                                </div>
                                <p className="campground-location">{formatRegion(site)}</p>
                                {originCoords ? (
                                  <a
                                    href={mapsLink}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="distance-text"
                                  >
                                    🚗 {driveLabel} from {originCoords.label}
                                  </a>
                                ) : null}
                              </div>
                              <div className="forecast-section">
                                {!selectedDates.length ? (
                                  <div className="forecast-prompt">Select a date to see the forecast.</div>
                                ) : isMultiDateSelection ? (
                                  <div className="forecast-grid">
                                    <div className="forecast-grid__row">
                                      <div className="forecast-grid__head">Date</div>
                                      {selectedDates.map((date) => (
                                        <div key={`${site.id}-${date}-head-popup`} className="forecast-grid__date">
                                          {formatGridDate(date)}
                                        </div>
                                      ))}
                                    </div>
                                    <div className="forecast-grid__row">
                                      <div className="forecast-grid__head">Weather</div>
                                      {selectedDates.map((date) => {
                                        if (date > weatherMaxDate) {
                                          return (
                                            <div
                                              key={`${site.id}-${date}-weather-popup`}
                                              className="forecast-grid__cell forecast-grid__icon-cell forecast-grid__icon-cell--chance"
                                              title="We don’t know what the weather will be like"
                                            >
                                              🎲
                                            </div>
                                          )
                                        }
                                        const daySummary = getWeatherSummaryForDate(site, date)
                                        if (!daySummary) {
                                          return (
                                            <div
                                              key={`${site.id}-${date}-weather-popup`}
                                              className="forecast-grid__cell forecast-grid__icon-cell"
                                              title="Forecast pending"
                                            >
                                              -
                                            </div>
                                          )
                                        }
                                        const weatherIcon = daySummary.isRainy
                                          ? '🌧️'
                                          : daySummary.isTooHot
                                            ? '☀️'
                                            : '⛅'
                                        const weatherTitle = `${daySummary.minTemp.toFixed(
                                          0,
                                        )}°C to ${daySummary.maxTemp.toFixed(
                                          0,
                                        )}°C, rain risk up to ${daySummary.maxRain.toFixed(
                                          0,
                                        )}% (max ${daySummary.maxRainMm.toFixed(1)}mm)`
                                        return (
                                          <div
                                            key={`${site.id}-${date}-weather-popup`}
                                            className="forecast-grid__cell forecast-grid__icon-cell"
                                            title={weatherTitle}
                                          >
                                            {weatherIcon}
                                          </div>
                                        )
                                      })}
                                    </div>
                                    <div className="forecast-grid__row">
                                      <div className="forecast-grid__head">Avail</div>
                                      {selectedDates.map((date) => {
                                        const dayAvailability = availabilityByDate[date]?.[site.id] ?? 'unknown'
                                        const dayIcon =
                                          dayAvailability === 'available'
                                            ? '✓'
                                            : dayAvailability === 'booked_out'
                                              ? '✗'
                                              : dayAvailability === 'unbookable'
                                                ? '🎲'
                                                : '–'
                                        const dayTitle =
                                          dayAvailability === 'available'
                                            ? 'Available'
                                            : dayAvailability === 'booked_out'
                                              ? 'Booked out'
                                              : dayAvailability === 'unbookable'
                                                ? 'Not bookable — just rock up'
                                                : 'Unknown'
                                        return (
                                          <div
                                            key={`${site.id}-${date}-avail-popup`}
                                            className={`forecast-grid__cell forecast-grid__icon-cell forecast-grid__avail--${dayAvailability}`}
                                            title={dayTitle}
                                          >
                                            {dayIcon}
                                          </div>
                                        )
                                      })}
                                    </div>
                                  </div>
                                ) : !isWeatherEligible ? (
                                  <div className="forecast-prompt">
                                    🎲 We don’t know what the weather will be like that far out.
                                  </div>
                                ) : hasWeather ? (
                                  <div
                                    className={`weather-panel ${
                                      isTooHot
                                        ? 'weather-panel--hot'
                                        : hasPrecip
                                          ? 'weather-panel--rain'
                                          : 'weather-panel--ok'
                                    }`}
                                  >
                                    <div className="weather-panel__icon" aria-hidden="true">
                                      {(rainProb ?? 0) > 5 ? '🌧️' : isTooHot ? '☀️' : '⛅'}
                                    </div>
                                    <div className="weather-panel__meta">
                                      <span className="weather-panel__title">Forecast</span>
                                      <span
                                        className={`weather-panel__chip ${
                                          isRainy || isTooHot ? 'is-risky' : 'is-ok'
                                        }`}
                                      >
                                        {isRainy || isTooHot ? 'Risky' : 'OK'}
                                      </span>
                                    </div>
                                    <div className="weather-panel__range">
                                      {minTemp?.toFixed(0)}°C to {maxTemp?.toFixed(0)}°C
                                    </div>
                                    <div className="weather-panel__rain">
                                      Rain risk up to {rainProb?.toFixed(0)}% (max {rainMm?.toFixed(1)}mm).
                                    </div>
                                  </div>
                                ) : (
                                  <div>Forecast pending.</div>
                                )}
                              </div>
                              {hasFacilityDetails ? (
                                <div className="facilities-block flex flex-col gap-2">
                                  <div className="text-xs font-semibold uppercase tracking-[0.2em] text-ink/50">
                                    Facilities
                                  </div>
                                  <div className="flex flex-wrap gap-2 text-[9px] uppercase tracking-[0.16em] text-ink/60">
                                    {facilityItems
                                      .filter((item) => item.value === true)
                                      .map((item) => (
                                        <span key={item.key} className="rounded-full bg-ink/5 px-2 py-1">
                                          {item.label}
                                        </span>
                                      ))}
                                  </div>
                                </div>
                              ) : null}
                              {selectedDates.length > 0 ? (
                                <div className="availability-section">
                                  <div className="availability-label">Availability</div>
                                  <div className={availabilityClass}>{availabilityLabel}</div>
                                  {availabilityNote ? (
                                    <div className="text-xs" style={{ marginTop: 4, color: '#92400e', opacity: 0.85 }}>
                                      {availabilityNote}
                                    </div>
                                  ) : null}
                                </div>
                              ) : null}
                              {bookingUrl ? (
                                <a
                                  href={bookingUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="btn btn-secondary btn-small mt-3 w-full"
                                >
                                  Link to camp site
                                </a>
                              ) : null}
                            </>
                          )
                    })()}
                  </article>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default App
