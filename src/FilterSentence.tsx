import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'

// ─── Data ────────────────────────────────────────────────────────────────
const FEATURES = [
  { id: 'dog',         label: 'dog-friendly',   facilityKey: 'dogFriendly' },
  { id: 'toilet',      label: 'toilets',        facilityKey: 'toilets' },
  { id: 'flushToilet', label: 'flush toilets',  facilityKey: 'flushToilets' },
  { id: 'shower',      label: 'showers',        facilityKey: 'showers' },
  { id: 'bbq',         label: 'a BBQ',          facilityKey: 'bbq' },
  { id: 'fire',        label: 'fire pits',      facilityKey: 'firePits' },
  { id: 'water',       label: 'drinking water', facilityKey: 'drinkingWater' },
  { id: 'car',         label: 'vehicle access', facilityKey: 'vehicleAccess' },
] as const

// VIC public holiday long weekends — camping start Fridays
// Source: business.vic.gov.au/business-information/public-holidays
const VIC_LONG_WEEKENDS = [
  { name: 'Anzac Day',        campFri: new Date(2026, 3, 24) },  // Mon 27 Apr sub PH
  { name: "King's Birthday",  campFri: new Date(2026, 5, 5) },   // Mon 8 Jun PH
  { name: 'AFL Grand Final',  campFri: new Date(2026, 8, 25) },  // Fri 25 Sep PH (approx)
  { name: 'Christmas',        campFri: new Date(2026, 11, 25) }, // Fri 25 Dec + Mon 28 Dec
  { name: "New Year's",       campFri: new Date(2027, 0, 1) },   // Fri 1 Jan PH
  { name: 'Australia Day',    campFri: new Date(2027, 0, 22) },  // Fri 22 Jan → Mon 25 Jan obs.
  { name: 'Labour Day',       campFri: new Date(2027, 2, 5) },   // Mon 8 Mar PH
  { name: 'Easter',           campFri: new Date(2027, 2, 26) },  // Good Fri 26 Mar + Mon 29 Mar
  { name: 'Anzac Day',        campFri: new Date(2027, 3, 23) },  // Mon 26 Apr sub PH
]

const WEATHER_AVOID = [
  { id: 'heat',   label: 'hot' },
  { id: 'rain',   label: 'rainy' },
  { id: 'storms', label: 'stormy' },
  { id: 'wind',   label: 'windy' },
  { id: 'cold',   label: 'cold' },
  { id: 'humid',  label: 'humid' },
  { id: 'fire',   label: 'fire-risk' },
] as const

const DAYS_OPTS = [1, 2, 3, 4, 5, 7, 10, 14]
const HOURS_OPTS = [1, 2, 3, 4, 5, 6, 8]
const CITY_OPTS = ['Melbourne', 'Geelong', 'Ballarat', 'Bendigo', 'Mornington', 'Traralgon']
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DOW = ['M','T','W','T','F','S','S']

// ─── Palette ─────────────────────────────────────────────────────────────
const P = {
  pageBg: '#efe7d6',
  pageInk: '#2b2216',
  accent: '#c0572b',
  accentInk: '#fff9ec',
  mute: 'rgba(43,34,22,0.55)',
  sentenceFont: '"Source Serif 4", "Source Serif Pro", Georgia, serif',
  smallFont: '"IBM Plex Mono", ui-monospace, Menlo, monospace',
  popBg: '#fff9ec',
  popText: '#2b2216',
  popBorder: 'rgba(43,34,22,0.2)',
  popRadius: 4 as number,
  popShadow: '0 10px 30px rgba(43,34,22,0.18)',
}

// ─── Helpers ─────────────────────────────────────────────────────────────
const nightsLabel = (n: number) => n === 1 ? '1 night' : `${n} nights`
const hoursLabel  = (h: number) => h === 1 ? '1 hour'  : `${h} hours`

function joinList(items: string[], conj = 'and') {
  if (!items.length) return ''
  if (items.length === 1) return items[0]
  if (items.length === 2) return `${items[0]} ${conj} ${items[1]}`
  return `${items.slice(0, -1).join(', ')}, ${conj} ${items[items.length - 1]}`
}

function compactList(
  ids: string[],
  source: readonly { id: string; label: string }[],
  emptyLabel: string,
  unit: string,
) {
  if (!ids.length) return emptyLabel
  if (ids.length <= 2)
    return joinList(ids.map(id => source.find(x => x.id === id)?.label ?? '').filter(Boolean))
  return `${ids.length} ${unit}`
}

function fmtArriveDate(dateStr: string) {
  if (!dateStr) return 'pick a date'
  const d = new Date(`${dateStr}T00:00:00`)
  return d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })
}

// Mulberry32 prng — deterministic per-day calendar decoration
function rand(seed: number) {
  let t = seed + 0x6D2B79F5
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate()
}

function addDays(d: Date, n: number) {
  const r = new Date(d); r.setDate(d.getDate() + n); return r
}

// ─── Chip ─────────────────────────────────────────────────────────────────
function Chip({ children, onClick, muted }: {
  children: ReactNode
  onClick?: () => void
  muted?: boolean
}) {
  return (
    <span
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && onClick?.()}
      style={{
        display: 'inline-block',
        cursor: 'pointer',
        padding: '0 2px',
        color: muted ? P.mute : P.accent,
        borderBottom: `2px solid ${muted ? 'transparent' : P.accent}`,
        fontWeight: 600,
        fontStyle: 'italic',
        whiteSpace: 'nowrap',
        lineHeight: 1.25,
      }}
    >
      {children}
    </span>
  )
}

// ─── Popover ─────────────────────────────────────────────────────────────
function Popover({ trigger, panel, maxWidth = 360 }: {
  trigger: (onClick: () => void) => ReactNode
  panel: (close: () => void) => ReactNode
  maxWidth?: number
}) {
  const [open, setOpen] = useState(false)
  const hostRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (hostRef.current && !hostRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <span ref={hostRef} style={{ position: 'relative', display: 'inline-block', whiteSpace: 'nowrap' }}>
      {trigger(() => setOpen(v => !v))}
      {open && (
        <div
          onMouseDown={e => e.stopPropagation()}
          style={{
            position: 'absolute',
            top: 'calc(100% + 10px)',
            left: 0,
            zIndex: 30,
            minWidth: 240,
            maxWidth,
            background: P.popBg,
            color: P.popText,
            border: `1px solid ${P.popBorder}`,
            borderRadius: P.popRadius,
            boxShadow: P.popShadow,
            padding: 12,
            fontSize: 14,
            lineHeight: 1.4,
            fontFamily: P.sentenceFont,
          }}
        >
          {panel(() => setOpen(false))}
        </div>
      )}
    </span>
  )
}

// ─── PopRow ──────────────────────────────────────────────────────────────
function PopRow({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 10 }}>
      {label && (
        <div style={{
          fontFamily: P.smallFont,
          fontSize: 11,
          textTransform: 'uppercase',
          letterSpacing: 1.2,
          opacity: 0.6,
          marginBottom: 6,
        }}>
          {label}
        </div>
      )}
      {children}
    </div>
  )
}

// ─── PopPill ─────────────────────────────────────────────────────────────
function PopPill({ active, onClick, children }: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        border: `1px solid ${active ? P.accent : P.popBorder}`,
        background: active ? P.accent : 'transparent',
        color: active ? P.accentInk : P.popText,
        borderRadius: 999,
        padding: '5px 11px',
        fontSize: 13,
        cursor: 'pointer',
        marginRight: 6,
        marginBottom: 6,
        fontFamily: 'inherit',
        transition: 'all .12s ease',
      }}
    >
      {children}
    </button>
  )
}

// ─── DatePanel ───────────────────────────────────────────────────────────
function DatePanel({ selectedDate, setSelectedDate, nights, setNights }: {
  selectedDate: string
  setSelectedDate: (v: string) => void
  nights: number
  setNights: (v: number) => void
}) {
  const today = useMemo(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0); return d
  }, [])
  const weatherHorizon = useMemo(() => addDays(today, 14), [today])
  const maxBookable = useMemo(() => {
    const d = new Date(today); d.setFullYear(d.getFullYear() + 1); return d
  }, [today])

  const [viewYM, setViewYM] = useState(() => ({ y: today.getFullYear(), m: today.getMonth() }))

  const selected = useMemo(
    () => selectedDate ? new Date(`${selectedDate}T00:00:00`) : today,
    [selectedDate, today],
  )

  const cells = useMemo(() => {
    const first = new Date(viewYM.y, viewYM.m, 1)
    const firstDow = (first.getDay() + 6) % 7
    const daysInMonth = new Date(viewYM.y, viewYM.m + 1, 0).getDate()
    const result: (Date | null)[] = []
    for (let i = 0; i < firstDow; i++) result.push(null)
    for (let d = 1; d <= daysInMonth; d++) result.push(new Date(viewYM.y, viewYM.m, d))
    while (result.length % 7) result.push(null)
    return result
  }, [viewYM])

  const stepMonth = (delta: number) => {
    let { m, y } = viewYM
    m += delta
    if (m < 0) { m = 11; y -= 1 }
    if (m > 11) { m = 0; y += 1 }
    const min = today.getFullYear() * 12 + today.getMonth()
    const max = maxBookable.getFullYear() * 12 + maxBookable.getMonth()
    if (y * 12 + m < min || y * 12 + m > max) return
    setViewYM({ y, m })
  }

  const pickDate = (d: Date) => {
    setSelectedDate(d.toISOString().slice(0, 10))
    setViewYM({ y: d.getFullYear(), m: d.getMonth() })
  }

  const quickPicks = useMemo(() => {
    const daysUntilFri = (5 - today.getDay() + 7) % 7 || 7
    const nextLW = VIC_LONG_WEEKENDS.find(lw => lw.campFri >= today)
    return [
      { label: 'This weekend',  date: addDays(today, daysUntilFri) },
      { label: 'Next weekend',  date: addDays(today, daysUntilFri + 7) },
      ...(nextLW ? [{ label: `Long w/e: ${nextLW.name}`, date: nextLW.campFri }] : []),
    ]
  }, [today])

  const beyondHorizon = !!selectedDate && selectedDate > weatherHorizon.toISOString().slice(0, 10)

  return (
    <div style={{ minWidth: 320 }}>
      <PopRow label="Quick picks">
        <div style={{ display: 'flex', flexWrap: 'wrap' }}>
          {quickPicks.map(q => (
            <PopPill key={q.label} active={sameDay(selected, q.date)} onClick={() => pickDate(q.date)}>
              {q.label}
            </PopPill>
          ))}
        </div>
      </PopRow>

      <PopRow label={`${MONTH_NAMES[viewYM.m]} ${viewYM.y}`}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <button type="button" onClick={() => stepMonth(-1)}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: P.popText, fontSize: 18, padding: '2px 8px' }}>‹</button>
          <div style={{ fontSize: 13, fontWeight: 600, fontFamily: P.smallFont }}>{MONTH_NAMES[viewYM.m]} {viewYM.y}</div>
          <button type="button" onClick={() => stepMonth(1)}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: P.popText, fontSize: 18, padding: '2px 8px' }}>›</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, fontSize: 11 }}>
          {DOW.map((d, i) => (
            <div key={i} style={{ textAlign: 'center', opacity: 0.5, fontFamily: P.smallFont, letterSpacing: 0.5, padding: '2px 0' }}>
              {d}
            </div>
          ))}
          {cells.map((d, i) => {
            if (!d) return <div key={i} />
            const past    = d < today
            const beyond  = d > maxBookable
            const hasFx   = d >= today && d <= weatherHorizon
            const isSel   = sameDay(d, selected)
            const seed    = d.getFullYear() * 372 + d.getMonth() * 31 + d.getDate()
            const avail   = rand(seed)
            const wGlyph  = ['☀','⛅','☁','☔'][Math.floor(rand(seed + 7) * 4)]
            const disabled = past || beyond
            return (
              <button key={i} type="button" disabled={disabled} onClick={() => !disabled && pickDate(d)}
                style={{
                  position: 'relative',
                  aspectRatio: '1 / 1',
                  border: isSel ? `1.5px solid ${P.accent}` : '1px solid transparent',
                  background: isSel ? P.accent : disabled ? 'transparent' : 'rgba(0,0,0,0.03)',
                  color: isSel ? P.accentInk : disabled ? 'rgba(0,0,0,0.25)' : P.popText,
                  borderRadius: P.popRadius,
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: disabled ? 'default' : 'pointer',
                  fontFamily: 'inherit',
                  padding: 0,
                  opacity: avail < 0.15 && !disabled && !isSel ? 0.35 : 1,
                  textDecoration: avail < 0.15 && !disabled && !isSel ? 'line-through' : 'none',
                }}
              >
                <span>{d.getDate()}</span>
                {hasFx && !isSel && (
                  <span style={{ position: 'absolute', top: 1, right: 2, fontSize: 7, opacity: 0.7 }}>{wGlyph}</span>
                )}
                {!disabled && !isSel && (
                  <span style={{
                    position: 'absolute', bottom: 3, left: '50%', transform: 'translateX(-50%)',
                    width: 14, height: 2, borderRadius: 1,
                    background: avail < 0.15 ? 'transparent' : avail < 0.4 ? P.accent : 'rgba(0,0,0,0.2)',
                    opacity: avail < 0.4 ? 1 : 0.4,
                  }} />
                )}
              </button>
            )
          })}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 11, marginTop: 10, color: P.mute, fontFamily: P.smallFont, letterSpacing: 0.3 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 10 }}>☀</span> forecast (next 14d)
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 10, height: 2, background: P.accent, display: 'inline-block' }} /> limited avail.
          </span>
        </div>
      </PopRow>

      <PopRow label="Stay">
        <div style={{ display: 'flex', flexWrap: 'wrap' }}>
          {DAYS_OPTS.map(n => (
            <PopPill key={n} active={nights === n} onClick={() => setNights(n)}>
              {nightsLabel(n)}
            </PopPill>
          ))}
        </div>
      </PopRow>

      {beyondHorizon && (
        <div style={{
          fontSize: 12, padding: '8px 10px', marginTop: 2,
          background: 'rgba(0,0,0,0.04)', border: `1px dashed ${P.popBorder}`,
          borderRadius: P.popRadius, color: P.mute, fontFamily: P.smallFont,
          letterSpacing: 0.3, lineHeight: 1.4,
        }}>
          Heads up — that's past the 14-day forecast window. Availability is shown, but we'll skip weather filters for this search.
        </div>
      )}
    </div>
  )
}

// ─── FromPanel ───────────────────────────────────────────────────────────
function FromPanel({ originPostcode, setOriginPostcode, originLabel }: {
  originPostcode: string
  setOriginPostcode: (v: string) => void
  originLabel: string
}) {
  const [val, setVal] = useState(() => originLabel || originPostcode)
  const commit = (v: string) => { if (v.trim()) setOriginPostcode(v.trim()) }

  return (
    <div>
      <PopRow label="Starting from">
        <input
          value={val}
          onChange={e => setVal(e.target.value)}
          onBlur={e => commit(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') commit(val) }}
          placeholder="Suburb or postcode"
          style={{
            width: '100%', boxSizing: 'border-box',
            padding: '8px 10px', border: `1px solid ${P.popBorder}`,
            borderRadius: P.popRadius, fontSize: 14,
            background: 'transparent', color: P.popText,
            fontFamily: 'inherit', outline: 'none',
          }}
        />
      </PopRow>
      <PopRow label="Or pick one">
        <div style={{ display: 'flex', flexWrap: 'wrap' }}>
          {CITY_OPTS.map(city => (
            <PopPill
              key={city}
              active={originLabel.toLowerCase() === city.toLowerCase() || originPostcode.toLowerCase() === city.toLowerCase()}
              onClick={() => { setVal(city); setOriginPostcode(city) }}
            >
              {city}
            </PopPill>
          ))}
        </div>
      </PopRow>
    </div>
  )
}

// ─── HoursPanel ──────────────────────────────────────────────────────────
function HoursPanel({ maxDriveMinutes, setMaxDriveMinutes, originLabel }: {
  maxDriveMinutes: number
  setMaxDriveMinutes: (v: number) => void
  originLabel: string
}) {
  return (
    <div>
      <PopRow label="Max drive time">
        <div style={{ display: 'flex', flexWrap: 'wrap' }}>
          {HOURS_OPTS.map(h => (
            <PopPill key={h} active={maxDriveMinutes === h * 60} onClick={() => setMaxDriveMinutes(h * 60)}>
              {hoursLabel(h)}
            </PopPill>
          ))}
        </div>
      </PopRow>
      <div style={{ fontSize: 12, opacity: 0.6 }}>
        Straight-line estimate from {originLabel || 'your location'}.
      </div>
    </div>
  )
}

// ─── FeaturesPanel ───────────────────────────────────────────────────────
function FeaturesPanel({ facilityFilters, setFacilityFilters }: {
  facilityFilters: Record<string, boolean>
  setFacilityFilters: React.Dispatch<React.SetStateAction<Record<string, boolean>>>
}) {
  return (
    <div style={{ minWidth: 280 }}>
      <PopRow label="Must have">
        <div style={{ display: 'flex', flexWrap: 'wrap' }}>
          {FEATURES.map(f => (
            <PopPill
              key={f.id}
              active={!!facilityFilters[f.facilityKey]}
              onClick={() => setFacilityFilters(prev => ({ ...prev, [f.facilityKey]: !prev[f.facilityKey] }))}
            >
              {f.label}
            </PopPill>
          ))}
        </div>
      </PopRow>
    </div>
  )
}

// ─── WeatherPanel ─────────────────────────────────────────────────────────
function WeatherPanel({ avoidWeather, setAvoidWeather }: {
  avoidWeather: string[]
  setAvoidWeather: (ids: string[]) => void
}) {
  const toggle = (id: string) =>
    setAvoidWeather(avoidWeather.includes(id) ? avoidWeather.filter(x => x !== id) : [...avoidWeather, id])

  return (
    <div style={{ minWidth: 260 }}>
      <PopRow label="Skip campsites likely to be">
        <div style={{ display: 'flex', flexWrap: 'wrap' }}>
          {WEATHER_AVOID.map(w => (
            <PopPill key={w.id} active={avoidWeather.includes(w.id)} onClick={() => toggle(w.id)}>
              {w.label}
            </PopPill>
          ))}
        </div>
      </PopRow>
      <div style={{ fontSize: 12, opacity: 0.65, lineHeight: 1.4 }}>
        We'll hide sites whose 14-day forecast hits any of these. Long-range trips ignore weather automatically.
      </div>
    </div>
  )
}

// ─── Props ────────────────────────────────────────────────────────────────
export interface FilterSentenceProps {
  selectedDate: string
  setSelectedDate: (v: string) => void
  nights: number
  setNights: (v: number) => void
  originPostcode: string
  setOriginPostcode: (v: string) => void
  originLabel: string
  maxDriveMinutes: number
  setMaxDriveMinutes: (v: number) => void
  facilityFilters: Record<string, boolean>
  setFacilityFilters: React.Dispatch<React.SetStateAction<Record<string, boolean>>>
  avoidWeather: string[]
  setAvoidWeather: (ids: string[]) => void
  filteredCount: number
  isWeatherEligible: boolean
  incidentsUpdatedAt: string | null
  onReset: () => void
  onShowSites?: () => void
}

// ─── FilterSentence ───────────────────────────────────────────────────────
export default function FilterSentence(props: FilterSentenceProps) {
  const {
    selectedDate, setSelectedDate,
    nights, setNights,
    originPostcode, setOriginPostcode,
    originLabel,
    maxDriveMinutes, setMaxDriveMinutes,
    facilityFilters, setFacilityFilters,
    avoidWeather, setAvoidWeather,
    filteredCount, isWeatherEligible,
    incidentsUpdatedAt,
    onReset, onShowSites,
  } = props

  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768)
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  const arriveLabel = fmtArriveDate(selectedDate)

  const featureText = useMemo(() => {
    const activeIds = FEATURES.filter(f => facilityFilters[f.facilityKey]).map(f => f.id)
    return compactList(activeIds, FEATURES, 'anything', 'must-haves')
  }, [facilityFilters])

  const avoidText = useMemo(() => {
    if (!avoidWeather.length) return 'any'
    if (avoidWeather.length === 2) {
      const labels = avoidWeather.map(id => WEATHER_AVOID.find(w => w.id === id)?.label ?? '').filter(Boolean)
      return joinList(labels, 'or')
    }
    if (avoidWeather.length === 1) return WEATHER_AVOID.find(w => w.id === avoidWeather[0])?.label ?? '1 kind'
    return `${avoidWeather.length} kinds of`
  }, [avoidWeather])

  const hoursVal = HOURS_OPTS.find(h => h * 60 === maxDriveMinutes) ?? Math.max(1, Math.round(maxDriveMinutes / 60))
  const hasWeatherFilter = avoidWeather.length > 0

  const updatedTime = incidentsUpdatedAt
    ? new Date(incidentsUpdatedAt).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })
    : null

  const datePanel = () => (
    <DatePanel
      selectedDate={selectedDate}
      setSelectedDate={setSelectedDate}
      nights={nights}
      setNights={setNights}
    />
  )
  const fromPanel = () => (
    <FromPanel originPostcode={originPostcode} setOriginPostcode={setOriginPostcode} originLabel={originLabel} />
  )
  const hoursPanel = () => (
    <HoursPanel maxDriveMinutes={maxDriveMinutes} setMaxDriveMinutes={setMaxDriveMinutes} originLabel={originLabel} />
  )
  const featuresPanel = () => (
    <FeaturesPanel facilityFilters={facilityFilters} setFacilityFilters={setFacilityFilters} />
  )
  const weatherPanel = () => (
    <WeatherPanel avoidWeather={avoidWeather} setAvoidWeather={setAvoidWeather} />
  )

  const footer = (fullWidth = false) => (
    <div style={{
      marginTop: 36,
      display: 'flex',
      flexDirection: fullWidth ? 'column' : 'row',
      alignItems: fullWidth ? 'stretch' : 'center',
      gap: fullWidth ? 12 : 16,
      fontFamily: P.smallFont,
      fontSize: 12,
      letterSpacing: 1.2,
      textTransform: 'uppercase',
      color: P.mute,
    }}>
      {!fullWidth && (
        <>
          <span>
            <strong style={{ color: P.pageInk, fontWeight: 700 }}>{filteredCount}</strong> sites match
          </span>
          <span>·</span>
          <button type="button" onClick={onReset} style={{
            background: 'transparent', border: 'none', color: P.mute, cursor: 'pointer',
            fontFamily: 'inherit', fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase',
            padding: 0, textDecoration: 'underline', textUnderlineOffset: 3,
          }}>
            Reset
          </button>
          <span style={{ flex: 1 }} />
        </>
      )}
      <button type="button" onClick={onShowSites} style={{
        background: P.accent, color: P.accentInk, border: 'none',
        padding: '10px 18px', borderRadius: P.popRadius,
        fontFamily: P.smallFont, fontSize: 12, letterSpacing: 1.4,
        textTransform: 'uppercase', fontWeight: 700, cursor: 'pointer',
      }}>
        {fullWidth ? `Show ${filteredCount} sites →` : 'Show me the sites →'}
      </button>
    </div>
  )

  if (isMobile) {
    return (
      <div style={{ background: P.pageBg, color: P.pageInk, padding: '28px 22px', fontFamily: P.sentenceFont }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18,
          fontFamily: P.smallFont, fontSize: 10, letterSpacing: 1.5,
          textTransform: 'uppercase', color: P.mute,
        }}>
          <span style={{ fontFamily: P.sentenceFont, fontSize: 18, color: P.accent, textTransform: 'none', letterSpacing: -0.3, fontStyle: 'italic', fontWeight: 600 }}>
            Campcaster
          </span>
          <span style={{ flex: 1 }} />
          <span>VIC</span>
        </div>

        <div style={{ fontSize: 22, lineHeight: 1.45, letterSpacing: -0.2 }}>
          <div style={{ marginBottom: 6 }}>
            {'Camp '}
            <Popover trigger={onClick => <Chip onClick={onClick}>{arriveLabel} for {nightsLabel(nights)}</Chip>} panel={datePanel} maxWidth={340} />
            {'.'}
          </div>
          <div style={{ marginBottom: 6 }}>
            {'Within '}
            <Popover trigger={onClick => <Chip onClick={onClick}>{hoursLabel(hoursVal)}</Chip>} panel={hoursPanel} />
            {' of '}
            <Popover trigger={onClick => <Chip onClick={onClick}>{originLabel || 'Melbourne'}</Chip>} panel={fromPanel} />
            {'.'}
          </div>
          <div style={{ marginBottom: 6 }}>
            {'With '}
            <Popover trigger={onClick => <Chip onClick={onClick}>{featureText}</Chip>} panel={featuresPanel} />
            {'.'}
          </div>
          {hasWeatherFilter && (
            <div>{`I'd rather not camp in `}<Popover trigger={onClick => <Chip onClick={onClick} muted={!isWeatherEligible}>{avoidText}</Chip>} panel={weatherPanel} />{' weather.'}</div>
          )}
          {!hasWeatherFilter && (
            <div style={{ color: P.mute }}><Popover trigger={onClick => <Chip onClick={onClick} muted>{`I'm fine with any weather`}</Chip>} panel={weatherPanel} />{'.'}</div>
          )}
        </div>

        {footer(true)}
      </div>
    )
  }

  return (
    <div style={{
      background: P.pageBg, color: P.pageInk, padding: '48px 60px 56px',
      fontFamily: P.sentenceFont, position: 'relative', overflow: 'visible',
    }}>
      {/* Header strip */}
      <div style={{
        display: 'flex', alignItems: 'baseline', gap: 16, marginBottom: 28,
        fontFamily: P.smallFont, fontSize: 11, letterSpacing: 1.6,
        textTransform: 'uppercase', color: P.mute,
      }}>
        <span style={{
          fontFamily: P.sentenceFont, fontStyle: 'italic', fontSize: 28,
          color: P.accent, letterSpacing: -0.5, textTransform: 'none',
        }}>
          Campcaster
        </span>
        <span style={{ flex: 1, borderBottom: `1px dashed ${P.mute}`, transform: 'translateY(-4px)' }} />
        {updatedTime && <span>Feed updated {updatedTime}</span>}
        {updatedTime && <span>·</span>}
        <span>14-day outlook</span>
      </div>

      {/* Sentence */}
      <div style={{
        fontFamily: P.sentenceFont, color: P.pageInk,
        fontSize: 38, lineHeight: 1.45, letterSpacing: -0.3,
        maxWidth: 1100, wordSpacing: '0.02em', overflowWrap: 'break-word',
      }}>
        <span>I want to camp </span>
        <Popover trigger={onClick => <Chip onClick={onClick}>{arriveLabel} for {nightsLabel(nights)}</Chip>} panel={datePanel} maxWidth={340} />
        <span>, within </span>
        <Popover trigger={onClick => <Chip onClick={onClick}>{hoursLabel(hoursVal)}</Chip>} panel={hoursPanel} />
        <span> of </span>
        <Popover trigger={onClick => <Chip onClick={onClick}>{originLabel || 'Melbourne'}</Chip>} panel={fromPanel} />
        <span>, somewhere with </span>
        <Popover trigger={onClick => <Chip onClick={onClick}>{featureText}</Chip>} panel={featuresPanel} />
        {hasWeatherFilter && (
          <>
            <span>. I&rsquo;d rather not camp in </span>
            <Popover trigger={onClick => <Chip onClick={onClick} muted={!isWeatherEligible}>{avoidText}</Chip>} panel={weatherPanel} />
            <span> weather</span>
            <span style={{ color: P.mute }}>.</span>
          </>
        )}
        {!hasWeatherFilter && (
          <>
            <span style={{ color: P.mute }}>. </span>
            <Popover trigger={onClick => <Chip onClick={onClick} muted>{`I'm fine with any weather`}</Chip>} panel={weatherPanel} />
            <span style={{ color: P.mute }}>.</span>
          </>
        )}
      </div>

      {footer()}
    </div>
  )
}
