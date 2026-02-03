import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

import App from './App'

type Site = {
  id: string
  name: string
  parkName: string
  lat: number
  lng: number
  lga?: string | null
  tourismRegion?: string | null
  facilities?: {
    dogFriendly?: boolean | null
    toilets?: boolean | null
    showers?: boolean | null
    bbq?: boolean | null
  }
}

const sampleSites: Site[] = [
  {
    id: 'wilsons-prom-1',
    name: 'Tidal River Campground',
    parkName: 'Wilsons Promontory National Park',
    lat: -38.921,
    lng: 146.329,
    lga: 'South Gippsland Shire Council',
    tourismRegion: 'Gippsland',
    facilities: {
      dogFriendly: false,
      toilets: true,
      showers: true,
      bbq: false,
    },
  },
  {
    id: 'otway-1',
    name: 'Wye River Campground',
    parkName: 'Great Otway National Park',
    lat: -38.637,
    lng: 143.885,
    lga: 'South Gippsland Shire Council',
    tourismRegion: 'Great Ocean Road',
    facilities: {
      dogFriendly: true,
      toilets: false,
      showers: false,
      bbq: true,
    },
  },
  {
    id: 'eildon-1',
    name: 'Candlebark, Lake Eildon National Park',
    parkName: 'Lake Eildon National Park',
    lat: -37.2,
    lng: 145.9,
    lga: 'Murrindindi Shire',
    tourismRegion: 'High Country',
    facilities: {
      dogFriendly: true,
      toilets: true,
      showers: false,
      bbq: true,
    },
  },
]

const lgaCentroids = {
  'South Gippsland Shire Council': { lat: -38.7, lng: 146.0 },
}

const buildWeatherPayload = (today: string, tomorrow: string) => ({
  daily: {
    time: [today, tomorrow],
    temperature_2m_max: [26, 36],
    temperature_2m_min: [11, 20],
    precipitation_probability_max: [10, 45],
    precipitation_sum: [0, 6],
  },
})

describe('CAMPCASTER list view', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    localStorage.clear()
    vi.useRealTimers()
  })

  beforeEach(() => {
    const today = new Date().toISOString().slice(0, 10)
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10)
    const weatherPayload = buildWeatherPayload(today, tomorrow)
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString()
      if (url.endsWith('/data/sites.json')) {
        return { ok: true, json: async () => sampleSites }
      }
      if (url.endsWith('/data/lga_centroids.json')) {
        return { ok: true, json: async () => lgaCentroids }
      }
      if (url.startsWith('https://bookings.parks.vic.gov.au/book')) {
        return {
          ok: true,
          json: async () => ({
            data: [
              {
                alias: 'tidal-river-campground',
                OperatorName: 'Tidal River Campground',
                isBookable: true,
                isBookableAndAvailable: true,
              },
              {
                alias: 'wye-river-campground',
                OperatorName: 'Wye River Campground',
                isBookable: true,
                isBookableAndAvailable: false,
              },
              {
                alias: 'candlebark-campground',
                OperatorName: 'Candlebark Campground',
                isBookable: true,
                isBookableAndAvailable: true,
              },
            ],
          }),
        }
      }
      return { ok: true, json: async () => weatherPayload }
    })

    vi.stubGlobal('fetch', fetchMock)
  })

  it('renders campgrounds from the dataset', async () => {
    render(<App />)

    expect(
      await screen.findByText('Tidal River Campground'),
    ).toBeInTheDocument()
    expect(screen.getByText('Wye River Campground')).toBeInTheDocument()
  })

  it('filters results by search and shows empty state', async () => {
    render(<App />)

    await screen.findByText('Tidal River Campground')

    const input = screen.getAllByLabelText('Search parks or sites')[0]
    await userEvent.type(input, 'otway')

    expect(screen.getByText('Wye River Campground')).toBeInTheDocument()
    expect(screen.queryByText('Tidal River Campground')).toBeNull()

    await userEvent.clear(input)
    await userEvent.type(input, 'nope')

    expect(
      await screen.findByText('No matching campsites. Try a different search.'),
    ).toBeInTheDocument()
  })

  it('filters by dog-friendly and toilets', async () => {
    render(<App />)

    await screen.findByText('Tidal River Campground')

    const dogFriendly = screen.getByLabelText('Dog-friendly')
    const toilets = screen.getByLabelText('Toilets')

    await userEvent.click(dogFriendly)
    expect(screen.getByText('Wye River Campground')).toBeInTheDocument()
    expect(screen.queryByText('Tidal River Campground')).toBeNull()

    await userEvent.click(toilets)
    expect(
      await screen.findByText('No matching campsites. Try a different search.'),
    ).toBeInTheDocument()
  })

  it('filters by additional facility metadata', async () => {
    render(<App />)

    await screen.findByText('Tidal River Campground')

    const showers = screen.getByLabelText('Showers')
    await userEvent.click(showers)
    expect(screen.getByText('Tidal River Campground')).toBeInTheDocument()
    expect(screen.queryByText('Wye River Campground')).toBeNull()

    const bbq = screen.getByLabelText('BBQ')
    await userEvent.click(bbq)
    expect(
      await screen.findByText('No matching campsites. Try a different search.'),
    ).toBeInTheDocument()
  })

  it('loads LGA-level weather summary once per LGA', async () => {
    render(<App />)

    await screen.findByText('Tidal River Campground')

    const input = screen.getByLabelText('Forecast date')
    const today = new Date().toISOString().slice(0, 10)
    await userEvent.clear(input)
    await userEvent.type(input, today)

    const forecasts = await screen.findAllByText(/LGA forecast/i)
    expect(forecasts.length).toBeGreaterThan(0)
    const summaries = screen.getAllByText(
      /11°C to 26°C, rain risk up to 10%/i,
    )
    expect(summaries.length).toBeGreaterThan(0)
  })

  it('updates weather summary when the date changes', async () => {
    render(<App />)

    await screen.findByText('Tidal River Campground')

    const input = screen.getByLabelText('Forecast date')
    const today = new Date().toISOString().slice(0, 10)
    await userEvent.clear(input)
    await userEvent.type(input, today)

    const initialSummaries = await screen.findAllByText(
      /11°C to 26°C, rain risk up to 10%/i,
    )
    expect(initialSummaries.length).toBeGreaterThan(0)

    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10)
    await userEvent.clear(input)
    await userEvent.type(input, tomorrow)

    const summaries = await screen.findAllByText(
      /20°C to 36°C, rain risk up to 45%/i,
    )
    expect(summaries.length).toBeGreaterThan(0)
  })

  it('filters by maximum drive time', async () => {
    render(<App />)

    await screen.findByText('Tidal River Campground')

    const slider = screen.getByLabelText('Max drive time')
    fireEvent.change(slider, { target: { value: '30' } })

    expect(
      await screen.findByText('No matching campsites. Try a different search.'),
    ).toBeInTheDocument()
  })

  it('filters by weather conditions', async () => {
    render(<App />)

    await screen.findByText('Tidal River Campground')

    const input = screen.getByLabelText('Forecast date')
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10)
    await userEvent.clear(input)
    await userEvent.type(input, tomorrow)

    await screen.findAllByText(/20°C to 36°C, rain risk up to 45%/i)

    const allowHeat = screen.getByLabelText('I dont mind the heat')
    await userEvent.click(allowHeat)
    await userEvent.click(allowHeat)
    expect(
      await screen.findByText('No matching campsites. Try a different search.'),
    ).toBeInTheDocument()

    await userEvent.click(allowHeat)
    const allowRain = screen.getByLabelText('I dont mind rain')
    await userEvent.click(allowRain)
    await userEvent.click(allowRain)
    expect(
      await screen.findByText('No matching campsites. Try a different search.'),
    ).toBeInTheDocument()
  })

  it('shows rain and heat icons when thresholds are met', async () => {
    render(<App />)

    await screen.findByText('Tidal River Campground')

    const input = screen.getByLabelText('Forecast date')
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10)
    await userEvent.clear(input)
    await userEvent.type(input, tomorrow)

    expect(await screen.findAllByLabelText('Rain expected')).toHaveLength(2)
    expect(screen.getAllByLabelText('Heat expected')).toHaveLength(2)
  })

  it('renders key controls on a mobile viewport', async () => {
    Object.defineProperty(window, 'innerWidth', { writable: true, value: 375 })
    window.dispatchEvent(new Event('resize'))

    render(<App />)

    await screen.findByText('Tidal River Campground')
    expect(screen.getByLabelText('Search parks or sites')).toBeInTheDocument()
    expect(screen.getByLabelText('Max drive time')).toBeInTheDocument()
    expect(screen.getByLabelText('Forecast date')).toBeInTheDocument()
  })

  it('shows availability labels once a date is selected', async () => {
    render(<App />)

    await screen.findByText('Tidal River Campground')
    await screen.findByText('Candlebark, Lake Eildon National Park')

    const input = screen.getByLabelText('Forecast date')
    const today = new Date().toISOString().slice(0, 10)
    await userEvent.clear(input)
    await userEvent.type(input, today)

    expect(await screen.findByText(/Available/i)).toBeInTheDocument()
    expect(screen.getByText(/Booked out/i)).toBeInTheDocument()
  })

  it('filters by availability status when selected', async () => {
    render(<App />)

    await screen.findByText('Tidal River Campground')

    const input = screen.getByLabelText('Forecast date')
    const today = new Date().toISOString().slice(0, 10)
    await userEvent.clear(input)
    await userEvent.type(input, today)

    const availableFilter = screen.getByLabelText('Availability Available')
    await userEvent.click(availableFilter)

    expect(await screen.findByText('Tidal River Campground')).toBeInTheDocument()
    expect(
      screen.getByText('Candlebark, Lake Eildon National Park'),
    ).toBeInTheDocument()
    expect(screen.queryByText('Wye River Campground')).not.toBeInTheDocument()
  })
})

describe('CAMPCASTER dataset', () => {
  it('includes facility flags for filters', () => {
    const filePath = path.resolve(__dirname, '../public/data/sites.json')
    const sites = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Array<{
      facilities?: { dogFriendly?: boolean | null; toilets?: boolean | null }
    }>

    const dogFriendlyCount = sites.filter(
      (site) => site.facilities?.dogFriendly === true,
    ).length
    const toiletsCount = sites.filter(
      (site) => site.facilities?.toilets === true,
    ).length

    expect(dogFriendlyCount).toBeGreaterThan(0)
    expect(toiletsCount).toBeGreaterThan(0)
  })
})
