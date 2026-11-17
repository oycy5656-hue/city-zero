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
const ROAD_CELL = 280

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

function pointInAirport(x, y, margin = 0) {
  const [lx, ly] = rotate(x - AIRPORT.x, y - AIRPORT.y, (-AIRPORT.angle * Math.PI) / 180)
  return Math.abs(lx) < AIRPORT.w / 2 + margin && Math.abs(ly) < AIRPORT.h / 2 + margin
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

function pointSegmentDistance(px, py, segment) {
  const dx = segment.x2 - segment.x1
  const dy = segment.y2 - segment.y1
  const lengthSq = dx * dx + dy * dy
  if (lengthSq === 0) return Math.hypot(px - segment.x1, py - segment.y1)
  let t = ((px - segment.x1) * dx + (py - segment.y1) * dy) / lengthSq
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(px - (segment.x1 + t * dx), py - (segment.y1 + t * dy))
}

function buildRoadIndex(segments) {
  const index = new Map()
  const add = (key, segment) => {
    if (!index.has(key)) index.set(key, [])
    index.get(key).push(segment)
  }
  for (const segment of segments) {
    const pad = segment.width / 2 + 8
    const minX = Math.floor((Math.min(segment.x1, segment.x2) - pad - WORLD.minX) / ROAD_CELL)
    const maxX = Math.floor((Math.max(segment.x1, segment.x2) + pad - WORLD.minX) / ROAD_CELL)
    const minY = Math.floor((Math.min(segment.y1, segment.y2) - pad - WORLD.minY) / ROAD_CELL)
    const maxY = Math.floor((Math.max(segment.y1, segment.y2) + pad - WORLD.minY) / ROAD_CELL)
    for (let cx = minX; cx <= maxX; cx += 1) {
      for (let cy = minY; cy <= maxY; cy += 1) {
        add(`${cx}:${cy}`, segment)
      }
    }
  }
  return index
}

function nearRoadSegments(index, x, y) {
  const cx = Math.floor((x - WORLD.minX) / ROAD_CELL)
  const cy = Math.floor((y - WORLD.minY) / ROAD_CELL)
  const result = []
  for (let ox = -1; ox <= 1; ox += 1) {
    for (let oy = -1; oy <= 1; oy += 1) {
      const bucket = index.get(`${cx + ox}:${cy + oy}`)
      if (bucket) result.push(...bucket)
    }
  }
  return result
}

function scatterTrees(poly, count, rand, water = null) {
  const trees = []
  const xs = poly.map((p) => p[0])
  const ys = poly.map((p) => p[1])
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  let tries = 0
  while (trees.length < count && tries < count * 20) {
    tries += 1
    const x = minX + rand() * (maxX - minX)
    const y = minY + rand() * (maxY - minY)
    if (!pointInPolygon(x, y, poly)) continue
    if (water && pointInPolygon(x, y, water)) continue
    trees.push({ x, y, size: 2 + rand() * 3.4, tone: rand() })
  }
  return trees
}

function pickMorphology(kind, random) {
  const value = random()
  if (kind === 'core') {
    if (value < 0.07) return 'plaza'
    if (value < 0.26) return 'tower'
    return 'podium'
  }
  if (kind === 'residential') {
    if (value < 0.08) return 'plaza'
    if (value < 0.2) return 'tower'
    if (value < 0.78) return 'perimeter'
    return 'rows'
  }
  if (kind === 'strip') {
    if (value < 0.06) return 'plaza'
    if (value < 0.18) return 'tower'
    if (value < 0.7) return 'perimeter'
    return 'podium'
  }
  if (kind === 'industrial') {
    if (value < 0.28) return 'tanks'
    if (value < 0.74) return 'warehouse'
    return 'rows'
  }
  if (kind === 'harbor') {
    if (value < 0.58) return 'containers'
    return 'warehouse'
  }
  return value < 0.45 ? 'outpost' : 'rows'
}

export function generateCity() {
  const rand = mulberry32(0x0c17a220)
  let buildings = []
  const blocks = []
  const roads = []
  let buildingId = 0

  const parks = PARKS.map((park) => ({
    ...park,
    trees:
      park.kind === 'solar'
        ? []
        : scatterTrees(park.poly, park.id === 'reservoir' ? 150 : 80, rand, park.water),
  }))
  const parkPolygons = parks.map((park) => park.poly)

  const addBuilding = (building) => {
    buildings.push({ ...building, id: buildingId++ })
  }

  for (const district of DISTRICTS) {
    for (const zone of district.zones) {
      const nx = Math.max(2, Math.round(zone.w / zone.blockW))
      const ny = Math.max(2, Math.round(zone.h / zone.blockH))
      const stepX = zone.w / nx
      const stepY = zone.h / ny
      const angle = (zone.angle * Math.PI) / 180
      const centerX = zone.x + zone.w / 2
      const centerY = zone.y + zone.h / 2

      const blockCenter = (ix, iy) => {
        const [dx, dy] = rotate(-zone.w / 2 + (ix + 0.5) * stepX, -zone.h / 2 + (iy + 0.5) * stepY, angle)
        return [centerX + dx, centerY + dy]
      }

      const isBuildable = (x, y) =>
        pointInPolygon(x, y, district.poly) &&
        !pointInPolygon(x, y, WATER) &&
        !pointInAirport(x, y) &&
        !parkPolygons.some((poly) => pointInPolygon(x, y, poly))

      // Roads follow the local street grid, but stop at park edges and water.
      for (let ix = 0; ix <= nx; ix += 1) {
        const localX = -zone.w / 2 + ix * stepX
        for (let iy = 0; iy < ny; iy += 1) {
          const [dx, dy] = rotate(localX, -zone.h / 2 + (iy + 0.5) * stepY, angle)
          const wx = centerX + dx
          const wy = centerY + dy
          if (!isBuildable(wx, wy)) continue
          const [ax, ay] = rotate(localX, -zone.h / 2 + iy * stepY, angle)
          const [bx, by] = rotate(localX, -zone.h / 2 + (iy + 1) * stepY, angle)
          const arterial = ix % 5 === 0
          roads.push({
            x1: centerX + ax,
            y1: centerY + ay,
            x2: centerX + bx,
            y2: centerY + by,
            width: arterial ? 17 : 7,
            kind: arterial ? 'arterial' : 'local',
            district: district.id,
          })
        }
      }

      for (let iy = 0; iy <= ny; iy += 1) {
        const localY = -zone.h / 2 + iy * stepY
        for (let ix = 0; ix < nx; ix += 1) {
          const [dx, dy] = rotate(-zone.w / 2 + (ix + 0.5) * stepX, localY, angle)
          const wx = centerX + dx
          const wy = centerY + dy
          if (!isBuildable(wx, wy)) continue
          const [ax, ay] = rotate(-zone.w / 2 + ix * stepX, localY, angle)
          const [bx, by] = rotate(-zone.w / 2 + (ix + 1) * stepX, localY, angle)
          const arterial = iy % 5 === 0
          roads.push({
            x1: centerX + ax,
            y1: centerY + ay,
            x2: centerX + bx,
            y2: centerY + by,
            width: arterial ? 17 : 7,
            kind: arterial ? 'arterial' : 'local',
            district: district.id,
          })
        }
      }

      for (let ix = 0; ix < nx; ix += 1) {
        for (let iy = 0; iy < ny; iy += 1) {
          const [wx, wy] = blockCenter(ix, iy)
          if (!isBuildable(wx, wy)) continue

          const blockW = stepX - zone.street
          const blockH = stepY - zone.street
          if (blockW < 28 || blockH < 24) continue

          const morph = pickMorphology(zone.kind, rand)
          const block = {
            x: wx,
            y: wy,
            w: blockW,
            h: blockH,
            angle,
            corners: blockCorners(wx, wy, blockW, blockH, angle),
            district: district.id,
            height: 0,
            morph,
            plaza: morph === 'plaza',
          }

          // Sparse zoning: leave whole blocks as yards / empty lots instead of
          // filling every parcel in the outer districts.
          if (rand() > zone.density) {
            block.yard = true
            block.density = 0
            blocks.push(block)
            continue
          }

          const innerW = blockW * 0.72
          const innerH = blockH * 0.72
          let created = 0
          let totalHeight = 0

          const addLocal = (lx, ly, w, h, height, type, shape = 'rect', tone = rand()) => {
            const cos = Math.cos(angle)
            const sin = Math.sin(angle)
            const halfW = w / 2
            const halfH = h / 2
            const footprint = [
              [lx - halfW, ly - halfH],
              [lx + halfW, ly - halfH],
              [lx + halfW, ly + halfH],
              [lx - halfW, ly + halfH],
            ]
            for (const [localX, localY] of footprint) {
              const x = wx + localX * cos - localY * sin
              const y = wy + localX * sin + localY * cos
              if (!isBuildable(x, y)) return false
            }
            const [dx, dy] = rotate(lx, ly, angle)
            const x = wx + dx
            const y = wy + dy
            addBuilding({
              x,
              y,
              w,
              h,
              angle: angle + (rand() > 0.94 ? (rand() - 0.5) * 0.08 : 0),
              height,
              type,
              shape,
              district: district.id,
              tone,
            })
            created += 1
            totalHeight += height
            return true
          }

          const baseHeight = (multiplier = 1) => {
            const value = zone.height[0] + Math.pow(rand(), 2.1) * (zone.height[1] - zone.height[0])
            return Math.max(4, Math.round(value * multiplier))
          }

          if (morph === 'plaza') {
            const kiosk = rand() > 0.55
            if (kiosk) {
              addLocal((rand() - 0.5) * innerW * 0.5, (rand() - 0.5) * innerH * 0.5, 12, 9, 5 + rand() * 4, 'civic')
            }
            block.courtyard = { w: innerW, h: innerH, green: true }
          } else if (morph === 'tower') {
            const bw = innerW * (0.38 + rand() * 0.16)
            const bd = innerH * (0.38 + rand() * 0.16)
            addLocal(0, 0, bw, bd, baseHeight(1.32), 'tower')
            if (rand() > 0.45) {
              addLocal(-innerW * 0.34, innerH * 0.28, innerW * 0.2, innerH * 0.22, baseHeight(0.42), 'podium')
            }
            if (rand() > 0.55) {
              addLocal(innerW * 0.33, -innerH * 0.26, innerW * 0.18, innerH * 0.18, baseHeight(0.34), 'podium')
            }
          } else if (morph === 'podium') {
            const cols = zone.kind === 'core' ? 3 : 2 + (rand() > 0.6 ? 1 : 0)
            const rows = zone.kind === 'core' ? 3 : 2
            for (let cx = 0; cx < cols; cx += 1) {
              for (let cy = 0; cy < rows; cy += 1) {
                if (rand() > 0.9) continue
                const w = (innerW / cols) * (0.58 + rand() * 0.22)
                const h = (innerH / rows) * (0.58 + rand() * 0.22)
                const x = -innerW / 2 + (cx + 0.5) * (innerW / cols)
                const y = -innerH / 2 + (cy + 0.5) * (innerH / rows)
                addLocal(x, y, w, h, baseHeight(zone.kind === 'core' ? 0.82 : 0.55), zone.kind === 'core' ? 'tower' : 'mixed')
              }
            }
            if (rand() > 0.82) {
              block.courtyard = { w: innerW * 0.5, h: innerH * 0.42, green: true }
            }
          } else if (morph === 'perimeter') {
            const t = Math.min(innerW, innerH) * 0.16
            const sideW = innerW - t * 1.7
            const sideH = innerH - t * 1.7
            const horizontalSegments = 2 + (rand() > 0.55 ? 1 : 0)
            const verticalSegments = 2
            const addRow = (y, segments, heightBase) => {
              for (let i = 0; i < segments; i += 1) {
                const width = (sideW / segments) * 0.88
                const x = -sideW / 2 + (i + 0.5) * (sideW / segments)
                addLocal(x, y, width, t, baseHeight(heightBase), 'housing')
              }
            }
            const addCol = (x, segments, heightBase) => {
              for (let i = 0; i < segments; i += 1) {
                const depth = (sideH / segments) * 0.88
                const y = -sideH / 2 + (i + 0.5) * (sideH / segments)
                addLocal(x, y, t, depth, baseHeight(heightBase), 'housing')
              }
            }
            addRow(-innerH / 2 + t / 2, horizontalSegments, 0.82)
            addRow(innerH / 2 - t / 2, horizontalSegments, 0.7)
            addCol(-innerW / 2 + t / 2, verticalSegments, 0.76)
            addCol(innerW / 2 - t / 2, verticalSegments, 0.62)
            block.courtyard = { w: innerW - t * 1.8, h: innerH - t * 1.8, green: rand() > 0.78 }
          } else if (morph === 'rows') {
            const rows = zone.kind === 'industrial' ? 2 : 3
            const rowH = (innerH / rows) * 0.44
            for (let i = 0; i < rows; i += 1) {
              const y = -innerH / 2 + (i + 0.5) * (innerH / rows)
              const segments = zone.kind === 'residential' ? 3 : 2
              for (let j = 0; j < segments; j += 1) {
                const width = (innerW / segments) * 0.82
                const x = -innerW / 2 + (j + 0.5) * (innerW / segments)
                addLocal(x, y, width, rowH, baseHeight(0.4 + rand() * 0.5), zone.kind === 'residential' ? 'housing' : 'industrial')
              }
            }
          } else if (morph === 'warehouse') {
            const bw = innerW * (0.58 + rand() * 0.22)
            const bd = innerH * (0.52 + rand() * 0.2)
            addLocal(-innerW * 0.08, 0, bw, bd, baseHeight(0.45), zone.kind === 'harbor' ? 'warehouse' : 'industrial')
            if (rand() > 0.5) {
              addLocal(innerW * 0.35, innerH * 0.3, innerW * 0.22, innerH * 0.2, baseHeight(0.22), 'industrial')
            }
            block.yard = true
          } else if (morph === 'containers') {
            const cols = 4
            const rows = 3
            for (let cx = 0; cx < cols; cx += 1) {
              for (let cy = 0; cy < rows; cy += 1) {
                if (rand() > 0.72) continue
                const w = (innerW / cols) * 0.62
                const h = (innerH / rows) * 0.58
                const x = -innerW / 2 + (cx + 0.5) * (innerW / cols)
                const y = -innerH / 2 + (cy + 0.5) * (innerH / rows)
                addLocal(x, y, w, h, 3 + Math.round(rand() * 5), 'container', 'rect', rand())
              }
            }
            block.yard = true
          } else if (morph === 'tanks') {
            const count = 2 + Math.floor(rand() * 3)
            for (let i = 0; i < count; i += 1) {
              const size = 18 + rand() * 22
              const x = (rand() - 0.5) * innerW * 0.68
              const y = (rand() - 0.5) * innerH * 0.68
              addLocal(x, y, size, size, 8 + rand() * 16, 'tank', 'round')
            }
            block.yard = true
          } else {
            const count = 1 + (rand() > 0.55 ? 1 : 0)
            for (let i = 0; i < count; i += 1) {
              addLocal(
                (rand() - 0.5) * innerW * 0.5,
                (rand() - 0.5) * innerH * 0.5,
                10 + rand() * 16,
                8 + rand() * 14,
                5 + rand() * 10,
                'outpost',
              )
            }
          }

          if (created > 0 || block.plaza) {
            block.height = created ? totalHeight / created : 0
            block.density = created / Math.max(1, 8)
            blocks.push(block)
          } else {
            block.yard = true
            block.density = 0
            blocks.push(block)
          }
        }
      }
    }
  }

  // Elevated highways. Buildings beneath them are removed by the corridor
  // clearance pass below, which keeps the road silhouette readable.
  const highways = [
    {
      id: 'ring',
      name: '环城高架',
      kind: 'highway',
      width: 34,
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
      width: 30,
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
      width: 28,
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
      width: 26,
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
      width: 24,
      points: [
        [5900, -2400],
        [7400, -2800],
        [8800, -3000],
        [10400, -2600],
      ],
    },
  ]

  const highwaySegments = []
  for (const highway of highways) {
    for (let i = 0; i < highway.points.length - 1; i += 1) {
      const [x1, y1] = highway.points[i]
      const [x2, y2] = highway.points[i + 1]
      highwaySegments.push({ x1, y1, x2, y2, width: highway.width })
    }
  }

  const roadSegments = [
    ...roads.map((road) => ({ x1: road.x1, y1: road.y1, x2: road.x2, y2: road.y2, width: road.width })),
    ...highwaySegments,
  ]
  const roadIndex = buildRoadIndex(roadSegments)

  const beforeRoadClearance = buildings.length
  buildings = buildings.filter((building) => {
    const radius = Math.hypot(building.w, building.h) / 2
    const nearby = nearRoadSegments(roadIndex, building.x, building.y)
    for (const segment of nearby) {
      if (pointSegmentDistance(building.x, building.y, segment) < segment.width / 2 + radius * 0.7 + 2) {
        return false
      }
    }
    return true
  })

  const finalIndex = new Map()
  for (const building of buildings) {
    const key = `${Math.floor((building.x - WORLD.minX) / CELL)}:${Math.floor((building.y - WORLD.minY) / CELL)}`
    if (!finalIndex.has(key)) finalIndex.set(key, [])
    finalIndex.get(key).push(building)
  }

  const arterialRoads = roads.filter((road) => road.kind === 'arterial')
  const trafficRoutes = []
  const makeRoute = (points) => {
    let length = 0
    const segments = []
    for (let i = 0; i < points.length - 1; i += 1) {
      const [x1, y1] = points[i]
      const [x2, y2] = points[i + 1]
      const segmentLength = Math.hypot(x2 - x1, y2 - y1)
      segments.push({ x1, y1, x2, y2, length: segmentLength, start: length })
      length += segmentLength
    }
    return { points, segments, length }
  }

  highways.forEach((highway) => trafficRoutes.push(makeRoute(highway.points)))
  for (let i = 0; i < arterialRoads.length; i += 3) {
    const road = arterialRoads[i]
    trafficRoutes.push(makeRoute([[road.x1, road.y1], [road.x2, road.y2]]))
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
    parks,
    districts: DISTRICTS,
    factions: FACTIONS,
    pois: POIS,
    buildingIndex: finalIndex,
    cell: CELL,
    stats: {
      buildings: buildings.length,
      blocks: blocks.length,
      roads: roads.length + highways.length,
      area: WORLD.areaKm2,
      removedForRoads: beforeRoadClearance - buildings.length,
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
