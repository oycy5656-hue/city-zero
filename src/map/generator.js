import {
  AIRPORTS,
  CITY_AREAS,
  COMMUNITIES,
  DISTRICTS,
  FACTIONS,
  PARKS,
  POIS,
  ROADS,
  TOTAL_BUILDINGS,
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

export function buildBuildingIndex(buildings) {
  const index = new Map()
  for (const building of buildings) {
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
  return index
}

function routeFromRoad(road) {
  const segments = []
  let length = 0
  for (let i = 0; i < road.points.length - 1; i += 1) {
    const [x1, y1] = road.points[i]
    const [x2, y2] = road.points[i + 1]
    const segmentLength = Math.hypot(x2 - x1, y2 - y1)
    if (segmentLength < 1) continue
    segments.push({ x1, y1, x2, y2, length: segmentLength, start: length })
    length += segmentLength
  }
  return { points: road.points, segments, length }
}

export function expandRoads(sourceRoads) {
  const roads = []
  for (const road of sourceRoads) {
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
  return roads
}

export function normalizeStreamBuilding(feature, id) {
  const props = feature.properties || {}
  const geom = feature.geometry
  if (!geom) return null
  const ring =
    geom.type === 'Polygon'
      ? geom.coordinates[0]
      : geom.type === 'MultiPolygon'
        ? geom.coordinates[0][0]
        : null
  if (!ring || ring.length < 3) return null
  const rawPoints = ring.map(([lon, lat]) => [
    (lon - WORLD.lon0) * WORLD.mx,
    -(lat - WORLD.lat0) * WORLD.my,
  ])
  const simplified = [rawPoints[0]]
  for (let i = 1; i < rawPoints.length; i += 1) {
    const [x, y] = rawPoints[i]
    const [lx, ly] = simplified[simplified.length - 1]
    if (Math.hypot(x - lx, y - ly) >= 2) simplified.push([x, y])
  }
  const lastPoint = rawPoints[rawPoints.length - 1]
  const [fx, fy] = simplified[simplified.length - 1]
  if (Math.hypot(lastPoint[0] - fx, lastPoint[1] - fy) > 0.5) simplified.push(lastPoint)
  const points = simplified.length >= 3 ? simplified : rawPoints
  const bbox = bboxOf(points)
  const area = Math.abs(
    points.reduce((sum, [x, y], index) => {
      const [nx, ny] = points[(index + 1) % points.length]
      return sum + x * ny - nx * y
    }, 0) / 2,
  )
  if (area < 8) return null
  const cx = (bbox[0] + bbox[2]) / 2
  const cy = (bbox[1] + bbox[3]) / 2
  const floors = Number(props.NUM_FLOORS) || 0
  const roof = Number(props.HEIGHT_ROOF) || 0
  const h = Math.max(2.5, Math.min(360, roof > 0 ? roof * 0.3048 : floors * 3.2 || 6))
  const year = Number(props.CONSTRUCTION_YEAR) || 0
  const style = year && year < 1930 ? 'brick' : year && year < 1975 ? 'concrete' : h > 90 ? 'glass' : 'concrete'
  const type = h > 120 ? 'tower' : h > 55 ? 'office' : h > 28 ? 'midrise' : h > 16 ? 'walkup' : 'rowhouse'
  const district = DISTRICTS.find((item) => (item.areas?.length ? item.areas : [item.poly]).some((poly) => pointInPolygon(cx, cy, poly)))?.id || 'manhattan'
  return {
    id,
    bin: props.BIN || null,
    bbl: props.BBL || null,
    x: cx,
    y: cy,
    cx,
    cy,
    points,
    bbox,
    area,
    height: h,
    h,
    floors: floors || Math.max(1, Math.round(h / 3.2)),
    year,
    style,
    type,
    tone: (Math.abs(Math.round(cx * 7 + cy * 13)) % 1000) / 1000,
    district,
  }
}

export function generateCity() {
  const roads = expandRoads(ROADS).map((road) => ({ ...road, static: true }))
  const trafficRoutes = []
  for (const road of ROADS) {
    if ((road.width || 0) < 16 || !road.points || road.points.length < 2) continue
    const route = routeFromRoad(road)
    if (route.length > 200) trafficRoutes.push(route)
  }

  const vehicles = Array.from({ length: 140 }).map((_, index) => ({
    route: trafficRoutes.length ? index % trafficRoutes.length : 0,
    t: (index * 0.037) % 1,
    speed: 0.012 + (index % 9) * 0.003,
    dir: index % 2 === 0 ? 1 : -1,
    color: index % 7 === 0 ? '#ff6b6b' : index % 5 === 0 ? '#ffb454' : '#9fe8f0',
  }))

  return {
    buildings: [],
    buildingIndex: new Map(),
    blocks: [],
    roads,
    highways: [],
    bridges: [],
    rivers: [],
    ramps: [],
    interchanges: [],
    trafficRoutes,
    vehicles,
    cityFootprint: null,
    cityAreas: CITY_AREAS,
    water: [],
    parks: PARKS,
    airports: AIRPORTS,
    districts: DISTRICTS,
    communities: COMMUNITIES,
    factions: FACTIONS,
    pois: POIS,
    cell: CELL,
    stats: {
      buildings: TOTAL_BUILDINGS,
      totalBuildings: TOTAL_BUILDINGS,
      roads: roads.length,
      streets: ROADS.length,
      area: WORLD.areaKm2,
    },
  }
}

let cached = null
export function getCityData() {
  if (!cached) cached = generateCity()
  return cached
}

export function getVisibleBuildings(data, bounds) {
  if (!data || !data.buildingIndex) return []
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
  if (!data || !data.buildingIndex) return null
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
