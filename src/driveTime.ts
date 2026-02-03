const ORIGIN = { lat: -37.7691, lng: 144.9958 }
const AVG_SPEED_KMH = 80

const toRad = (value: number) => (value * Math.PI) / 180

export const haversineKm = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
) => {
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  const earthRadiusKm = 6371
  return earthRadiusKm * c
}

export const estimateDriveMinutes = (distanceKm: number) => {
  return Math.round((distanceKm / AVG_SPEED_KMH) * 60)
}

export const formatDriveTime = (minutes: number) => {
  if (minutes <= 0) return '0m'
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  if (hours <= 0) return `${mins}m`
  if (mins === 0) return `${hours}h`
  return `${hours}h ${mins}m`
}

export const estimateDriveTimeLabel = (lat: number, lng: number) => {
  const distanceKm = haversineKm(ORIGIN.lat, ORIGIN.lng, lat, lng)
  const minutes = estimateDriveMinutes(distanceKm)
  return formatDriveTime(minutes)
}

export const estimateDriveTimeMinutesFromOrigin = (lat: number, lng: number) => {
  const distanceKm = haversineKm(ORIGIN.lat, ORIGIN.lng, lat, lng)
  return estimateDriveMinutes(distanceKm)
}
