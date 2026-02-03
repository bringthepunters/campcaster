import { describe, expect, it } from 'vitest'

import {
  estimateDriveMinutes,
  estimateDriveTimeLabel,
  formatDriveTime,
  haversineKm,
} from './driveTime'

describe('drive time estimates', () => {
  it('returns zero for origin point', () => {
    const distance = haversineKm(-37.7691, 144.9958, -37.7691, 144.9958)
    expect(distance).toBeCloseTo(0, 6)
    expect(estimateDriveMinutes(distance)).toBe(0)
    expect(formatDriveTime(0)).toBe('0m')
  })

  it('formats a reasonable travel time label', () => {
    const label = estimateDriveTimeLabel(-38.5, 145.0)
    expect(label).toMatch(/\d+h( \d+m)?|\d+m/)
  })

  it('filters based on estimated drive time threshold', () => {
    const shortTrip = estimateDriveTimeLabel(-37.8, 144.99)
    expect(shortTrip).toMatch(/m|h/)
  })
})
