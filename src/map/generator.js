import {
  AIRPORT,
  DISTRICTS,
  FACTIONS,
  PARKS,
  POIS,
  WATER,
  WORLD,
} from '../data/city.js'

const TAU = Math.PI * 2
const CELL = 600

function mulberry32(seed) {
  let a = seed >>> 0
  return function random() {
    a += 0x6d2b79f5
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function rotate(x, y, angle) {
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  return [x * cos - y * sin, x * sin + y * cos]
}

export function pointInPolygon(x, y, poly) {
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

function pointInAirport(x, y) {
  const [lx, ly] = rotate(x - AIRPORT.x, y - AIRPORT.y, (-AIRPORT.angle * Math.PI) / 180)
  return Math.abs(lx) < AIRPORT.w / 2 && Math.abs(ly) < AIRPORT.h / 2
}

function blockCorners(cx, cy, w, h, angle) {
  const halfW = w / 2
  const halfH = h / 2
  const points = [
    [-halfW, -halfH],
    [halfW, -halfH],
    [halfW, halfH],
    [-halfW, halfH],
  ]
  return points.map(([x, y]) => {
    const [rx, ry] = rotate(x, y, angle)
    return [cx + rx, cy + ry]
  })
}

function buildingType(kind) {
  if (kind === 'core') return 'tower'
  if (kind === 'residential') return 'housing'
  if (kind === 'strip') return 'mixed'
  if (kind === 'industrial') return 'industrial'
  if (kind === 'harbor') return 'warehouse'
  return 'outpost'
}

export function generateCity() {
  const rand = mulberry32(0x0c17a220)
  const buildings = []
  const blocks = []
  const roads = []
  const buildingIndex = new Map()
  let buildingId = 0

  const addBuilding = (building) => {
    const item = { ...building, id: buildingId++ }
    buildings.push(item)
    const key = `${Math.floor((item.x - WORLD.minX) / CELL)}:${Math.floor((item.y - WORLD.minY) / CELL)}`
    if (!buildingIndex.has(key)) buildingIndex.set(key, [])
    buildingIndex.get(key).push(item)
  }

  for (const district of DISTRICTS) {
    for (const zone of district.zones) {
      const radius = Math.hypot(zone.w, zone.h) / 2 + 200
      const nx = Math.max(2, Math.round(zone.w / zone.blockW))
      const ny = Math.max(2, Math.round(zone.h / zone.blockH))
      const stepX = zone.w / nx
      const stepY = zone.h / ny
      const angle = (zone.angle * Math.PI) / 180
      const centerX = zone.x + zone.w / 2
      const centerY = zone.y + zone.h / 2

      // Road grid: one segment per block edge. We keep both orientations so the
      // street network remains visually continuous even where blocks are skipped.
      for (let ix = 0; ix <= nx; ix += 1) {
        const localX = -zone.w / 2 + ix * stepX
        for (let iy = 0; iy < ny; iy += 1) {
          const localY = -zone.h / 2 + (iy + 0.5) * stepY
          const [dx, dy] = rotate(localX, localY, angle)
          const wx = centerX + dx
          const wy = centerY + dy
          if (!pointInPolygon(wx, wy, district.poly) || pointInPolygon(wx, wy, WATER)) continue
          const [ax, ay] = rotate(localX, -zone.h / 2 + iy * stepY, angle)
          const [bx, by] = rotate(localX, -zone.h / 2 + (iy + 1) * stepY, angle)
          const arterial = ix % 4 === 0
          roads.push({
            x1: centerX + ax,
            y1: centerY + ay,
            x2: centerX + bx,
            y2: centerY + by,
            width: arterial ? 19 : 8,
            kind: arterial ? 'arterial' : 'local',
            district: district.id,
          })
        }
      }

      for (let iy = 0; iy <= ny; iy += 1) {
        const localY = -zone.h / 2 + iy * stepY
        for (let ix = 0; ix < nx; ix += 1) {
          const localX = -zone.w / 2 + (ix + 0.5) * stepX
          const [dx, dy] = rotate(localX, localY, angle)
          const wx = centerX + dx
          const wy = centerY + dy
          if (!pointInPolygon(wx, wy, district.poly) || pointInPolygon(wx, wy, WATER)) continue
          const [ax, ay] = rotate(-zone.w / 2 + ix * stepX, localY, angle)
          const [bx, by] = rotate(-zone.w / 2 + (ix + 1) * stepX, localY, angle)
          const arterial = iy % 4 === 0
          roads.push({
            x1: centerX + ax,
            y1: centerY + ay,
            x2: centerX + bx,
            y2: centerY + by,
            width: arterial ? 19 : 8,
            kind: arterial ? 'arterial' : 'local',
            district: district.id,
          })
        }
      }

      for (let ix = 0; ix < nx; ix += 1) {
        for (let iy = 0; iy < ny; iy += 1) {
          const localX = -zone.w / 2 + (ix + 0.5) * stepX
          const localY = -zone.h / 2 + (iy + 0.5) * stepY
          const [dx, dy] = rotate(localX, localY, angle)
          const wx = centerX + dx
          const wy = centerY + dy

          if (!pointInPolygon(wx, wy, district.poly)) continue
          if (pointInPolygon(wx, wy, WATER)) continue
          if (PARKS.some((park) => pointInPolygon(wx, wy, park.poly))) continue
          if (pointInAirport(wx, wy)) continue

          const blockW = stepX - zone.street
          const blockH = stepY - zone.street
          if (blockW < 22 || blockH < 22) continue

          const corners = blockCorners(wx, wy, blockW, blockH, angle)
          const block = {
            x: wx,
            y: wy,
            w: blockW,
            h: blockH,
            angle,
            corners,
            district: district.id,
            height: 0,
          }

          const innerW = blockW * 0.8
          const innerH = blockH * 0.8
          let cols = 1
          let rows = 1
          if (zone.kind === 'residential') {
            cols = 3
            rows = rand() > 0.2 ? 2 : 1
          } else if (zone.kind === 'core') {
            cols = rand() > 0.2 ? 2 : 1
            rows = rand() > 0.2 ? 2 : 1
          } else if (zone.kind === 'strip') {
            cols = 2
            rows = rand() > 0.28 ? 2 : 1
          } else if (zone.kind === 'industrial') {
            cols = 2
            rows = rand() > 0.4 ? 2 : 1
          } else if (zone.kind === 'harbor') {
            cols = 2
            rows = rand() > 0.5 ? 2 : 1
          } else {
            cols = 1
            rows = 1
          }

          const lotW = innerW / cols
          const lotH = innerH / rows
          let created = 0
          let totalHeight = 0

          for (let cx = 0; cx < cols; cx += 1) {
            for (let cy = 0; cy < rows; cy += 1) {
              if (rand() > zone.density) continue
              const jitterX = (rand() - 0.5) * lotW * 0.16
              const jitterY = (rand() - 0.5) * lotH * 0.16
              const bw = Math.max(5, lotW * (0.56 + rand() * 0.3))
              const bd = Math.max(5, lotH * (0.56 + rand() * 0.3))
              const localBX = -innerW / 2 + (cx + 0.5) * lotW + jitterX
              const localBY = -innerH / 2 + (cy + 0.5) * lotH + jitterY
              const [bx, by] = rotate(localBX, localBY, angle)
              const bxWorld = wx + bx
              const byWorld = wy + by

              if (!pointInPolygon(bxWorld, byWorld, district.poly)) continue
              if (pointInPolygon(bxWorld, byWorld, WATER)) continue
              if (PARKS.some((park) => pointInPolygon(bxWorld, byWorld, park.poly))) continue
              if (pointInAirport(bxWorld, byWorld)) continue

              let height =
                zone.height[0] +
                Math.pow(rand(), 2.35) * (zone.height[1] - zone.height[0])

              if (zone.kind === 'core' && rand() > 0.965) {
                height *= 1.42
              }
              if (zone.kind === 'core' && rand() > 0.993) {
                height *= 1.55
              }
              height = Math.round(height)

              addBuilding({
                x: bxWorld,
                y: byWorld,
                w: bw,
                h: bd,
                angle: angle + (rand() > 0.92 ? (rand() - 0.5) * 0.12 : 0),
                height,
                type: buildingType(zone.kind),
                district: district.id,
                tone: rand(),
              })
              created += 1
              totalHeight += height
            }
          }

          if (created > 0) {
            block.height = totalHeight / created
            block.density = created / (cols * rows)
            blocks.push(block)
          }
        }
      }
    }
  }

  // Manual highways and elevated roads.
  const highways = [
    {
      id: 'ring',
      name: '环城高架',
      kind: 'highway',
      width: 42,
      points: [
        [-4600, -4400],
        [5400, -4400],
        [6600, -600],
        [5000, 3200],
        [1100, 5000],
        [-3600, 3900],
        [-5200, 1100],
        [-4800, -2200],
        [-4600, -4400],
      ],
    },
    {
      id: 'east-west',
      name: '中央大道',
      kind: 'highway',
      width: 36,
      points: [
        [-11600, -1000],
        [-7600, -800],
        [-3400, -600],
        [1800, -420],
        [7000, -700],
        [11600, -1200],
      ],
    },
    {
      id: 'north-south',
      name: '零号纵线',
      kind: 'highway',
      width: 34,
      points: [
        [-600, -9200],
        [-350, -6400],
        [0, -3400],
        [320, -200],
        [500, 3300],
        [250, 6200],
      ],
    },
    {
      id: 'harbor-link',
      name: '旧港联络线',
      kind: 'highway',
      width: 30,
      points: [
        [-7200, 800],
        [-6200, 1800],
        [-5300, 2800],
        [-4700, 3900],
        [-3800, 4800],
      ],
    },
    {
      id: 'airport-road',
      name: '空港路',
      kind: 'highway',
      width: 28,
      points: [
        [5900, -2400],
        [7400, -2800],
        [8800, -3000],
        [10400, -2600],
      ],
    },
  ]

  const arterialRoads = roads.filter((road) => road.kind === 'arterial')
  const trafficRoutes = []
  const makeRoute = (points) => {
    let length = 0
    const segments = []
    for (let i = 0; i < points.length - 1; i += 1) {
      const [x1, y1] = points[i]
      const [x2, y2] = points[i + 1]
      const segLength = Math.hypot(x2 - x1, y2 - y1)
      segments.push({ x1, y1, x2, y2, length: segLength, start: length })
      length += segLength
    }
    return { points, segments, length }
  }

  highways.forEach((highway) => trafficRoutes.push(makeRoute(highway.points)))
  for (let i = 0; i < arterialRoads.length; i += 3) {
    const road = arterialRoads[i]
    trafficRoutes.push(
      makeRoute([
        [road.x1, road.y1],
        [road.x2, road.y2],
      ]),
    )
  }

  const vehicles = Array.from({ length: 160 }).map((_, index) => {
    const route = Math.floor(rand() * trafficRoutes.length)
    return {
      route,
      t: rand(),
      speed: 0.018 + rand() * 0.032,
      dir: index % 2 === 0 ? 1 : -1,
      color: index % 3 === 0 ? '#ff6b6b' : index % 5 === 0 ? '#ffb454' : '#9fe8f0',
    }
  })

  return {
    buildings,
    blocks,
    roads,
    highways,
    trafficRoutes,
    vehicles,
    water: WATER,
    parks: PARKS,
    districts: DISTRICTS,
    factions: FACTIONS,
    pois: POIS,
    buildingIndex,
    cell: CELL,
    stats: {
      buildings: buildings.length,
      blocks: blocks.length,
      roads: roads.length + highways.length,
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
  if (!data) return []
  const result = []
  const minCellX = Math.max(0, Math.floor((bounds.minX - WORLD.minX) / data.cell))
  const maxCellX = Math.max(0, Math.floor((bounds.maxX - WORLD.minX) / data.cell))
  const minCellY = Math.max(0, Math.floor((bounds.minY - WORLD.minY) / data.cell))
  const maxCellY = Math.max(0, Math.floor((bounds.maxY - WORLD.minY) / data.cell))
  for (let cx = minCellX; cx <= maxCellX; cx += 1) {
    for (let cy = minCellY; cy <= maxCellY; cy += 1) {
      const bucket = data.buildingIndex.get(`${cx}:${cy}`)
      if (!bucket) continue
      for (let i = 0; i < bucket.length; i += 1) {
        const building = bucket[i]
        if (
          building.x >= bounds.minX &&
          building.x <= bounds.maxX &&
          building.y >= bounds.minY &&
          building.y <= bounds.maxY
        ) {
          result.push(building)
        }
      }
    }
  }
  return result
}

export function hitTestBuildings(data, worldX, worldY, maxHeight = Infinity) {
  if (!data) return null
  const cx = Math.floor((worldX - WORLD.minX) / data.cell)
  const cy = Math.floor((worldY - WORLD.minY) / data.cell)
  for (let ox = -1; ox <= 1; ox += 1) {
    for (let oy = -1; oy <= 1; oy += 1) {
      const bucket = data.buildingIndex.get(`${cx + ox}:${cy + oy}`)
      if (!bucket) continue
      for (let i = 0; i < bucket.length; i += 1) {
        const b = bucket[i]
        if (b.height > maxHeight) continue
        const cos = Math.cos(-b.angle)
        const sin = Math.sin(-b.angle)
        const dx = worldX - b.x
        const dy = worldY - b.y
        const lx = dx * cos - dy * sin
        const ly = dx * sin + dy * cos
        if (Math.abs(lx) <= b.w / 2 && Math.abs(ly) <= b.h / 2) return b
      }
    }
  }
  return null
}

export { TAU }
