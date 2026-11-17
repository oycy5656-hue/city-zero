import {
  BUILDINGS,
  CITY_FOOTPRINT,
  DISTRICTS,
  FACTIONS,
  PARKS,
  POIS,
  ROADS,
  WORLD,
} from '../data/city.js'

const CELL = 500

function pointInPolygon(x, y, poly) {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0]
    const yi = poly[i][1]
    const xj = poly[j][0]
    const yj = poly[j][1]
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi
    if (intersect) inside = !inside
  }
  return inside
}

function bboxOf(points) {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const [x, y] of points) {
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
  }
  return [minX, minY, maxX, maxY]
}

function addToIndex(index, building) {
  const [minX, minY, maxX, maxY] = building.bbox
  const x1 = Math.floor((minX - WORLD.minX) / CELL)
  const x2 = Math.floor((maxX - WORLD.minX) / CELL)
  const y1 = Math.floor((minY - WORLD.minY) / CELL)
  const y2 = Math.floor((maxY - WORLD.minY) / CELL)
  for (let cx = x1; cx <= x2; cx += 1) {
    for (let cy = y1; cy <= y2; cy += 1) {
      const key = `${cx}:${cy}`
      if (!index.has(key)) index.set(key, [])
      index.get(key).push(building)
    }
  }
}

function routeFromRoad(road) {
  const points = road.points
  const segments = []
  let length = 0
  for (let i = 0; i < points.length - 1; i += 1) {
    const [x1, y1] = points[i]
    const [x2, y2] = points[i + 1]
    const segmentLength = Math.hypot(x2 - x1, y2 - y1)
    if (segmentLength < 1) continue
    segments.push({ x1, y1, x2, y2, length: segmentLength, start: length })
    length += segmentLength
  }
  return { points, segments, length }
}

export function generateCity() {
  const buildings = []
  const buildingIndex = new Map()

  for (const source of BUILDINGS) {
    const points = source.points
    if (!points || points.length < 3) continue
    const bbox = bboxOf(points)
    const building = {
      ...source,
      id: buildings.length,
      x: source.cx,
      y: source.cy,
      points,
      bbox,
      height: source.h,
      type: source.type,
      district: source.district,
      style: source.style,
      tone: source.tone,
      floorCount: source.floors,
    }
    buildings.push(building)
    addToIndex(buildingIndex, building)
  }

  const roads = []
  for (const road of ROADS) {
    const points = road.points
    const name = road.name || ''
    for (let i = 0; i < points.length - 1; i += 1) {
      const [x1, y1] = points[i]
      const [x2, y2] = points[i + 1]
      if (Math.hypot(x2 - x1, y2 - y1) < 2) continue
      const width = road.width || 10
      roads.push({
        x1,
        y1,
        x2,
        y2,
        width,
        name,
        kind: width >= 18 ? 'arterial' : width >= 12 ? 'secondary' : 'local',
        axis: Math.abs(x2 - x1) > Math.abs(y2 - y1) ? 'h' : 'v',
      })
    }
  }

  const trafficRoutes = []
  for (const road of ROADS) {
    if ((road.width || 0) < 13 || !road.points || road.points.length < 2) continue
    const route = routeFromRoad(road)
    if (route.length > 80) trafficRoutes.push(route)
  }

  const vehicles = Array.from({ length: 180 }).map((_, index) => ({
    route: trafficRoutes.length ? index % trafficRoutes.length : 0,
    t: (index * 0.037) % 1,
    speed: 0.012 + (index % 9) * 0.003,
    dir: index % 2 === 0 ? 1 : -1,
    color: index % 7 === 0 ? '#ff6b6b' : index % 5 === 0 ? '#ffb454' : '#9fe8f0',
  }))

  return {
    buildings,
    blocks: [],
    roads,
    highways: [],
    bridges: [],
    rivers: [],
    ramps: [],
    interchanges: [],
    trafficRoutes,
    vehicles,
    cityFootprint: CITY_FOOTPRINT,
    water: [],
    parks: PARKS,
    districts: DISTRICTS,
    factions: FACTIONS,
    pois: POIS,
    buildingIndex,
    cell: CELL,
    stats: {
      buildings: buildings.length,
      roads: roads.length,
      streets: ROADS.length,
      area: WORLD.areaKm2,
      removedForRoads: 0,
    },
  }
}

let cached = null
export function getCityData() {
  if (!cached) cached = generateCity()
  return cached
}

export function getVisibleBuildings(data, bounds) {
  if (!data) return []
  const result = []
  const minCellX = Math.floor((bounds.minX - WORLD.minX) / data.cell)
  const maxCellX = Math.floor((bounds.maxX - WORLD.minX) / data.cell)
  const minCellY = Math.floor((bounds.minY - WORLD.minY) / data.cell)
  const maxCellY = Math.floor((bounds.maxY - WORLD.minY) / data.cell)
  const seen = new Set()
  for (let cx = minCellX; cx <= maxCellX; cx += 1) {
    for (let cy = minCellY; cy <= maxCellY; cy += 1) {
      const bucket = data.buildingIndex.get(`${cx}:${cy}`)
      if (!bucket) continue
      for (const building of bucket) {
        if (seen.has(building.id)) continue
        seen.add(building.id)
        const [minX, minY, maxX, maxY] = building.bbox
        if (maxX < bounds.minX || minX > bounds.maxX || maxY < bounds.minY || minY > bounds.maxY) continue
        result.push(building)
      }
    }
  }
  return result
}

export function hitTestBuildings(data, worldX, worldY) {
  if (!data) return null
  const cx = Math.floor((worldX - WORLD.minX) / data.cell)
  const cy = Math.floor((worldY - WORLD.minY) / data.cell)
  let best = null
  let bestArea = Infinity
  for (let ox = -1; ox <= 1; ox += 1) {
    for (let oy = -1; oy <= 1; oy += 1) {
      const bucket = data.buildingIndex.get(`${cx + ox}:${cy + oy}`)
      if (!bucket) continue
      for (const building of bucket) {
        const [minX, minY, maxX, maxY] = building.bbox
        if (worldX < minX || worldX > maxX || worldY < minY || worldY > maxY) continue
        if (!pointInPolygon(worldX, worldY, building.points)) continue
        if (building.area < bestArea) {
          best = building
          bestArea = building.area
        }
      }
    }
  }
  return best
}

export { pointInPolygon }
