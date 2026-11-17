import {
  AIRPORT,
  CITY_FOOTPRINT,
  DISTRICTS,
  EXPRESSWAYS,
  FACTIONS,
  INTERCHANGES,
  PARKS,
  POIS,
  WORLD,
} from '../data/city.js'

const TAU = Math.PI * 2
const CELL = 600
const ROAD_CELL = 280
const GRID_X = 200
const GRID_Y = 150
const START_X = -10400
const START_Y = -7900
const COLS = Math.ceil((10500 - START_X) / GRID_X)
const ROWS = Math.ceil((6600 - START_Y) / GRID_Y)

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

function pointInPark(x, y, parks) {
  return parks.some((park) => pointInPolygon(x, y, park.poly))
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
    if (value < 0.05) return 'plaza'
    if (value < 0.12) return 'supertower'
    if (value < 0.21) return 'twin'
    if (value < 0.3) return 'mall'
    if (value < 0.38) return 'parking'
    if (value < 0.46) return 'data'
    if (value < 0.62) return 'tower'
    return 'podium'
  }
  if (kind === 'ring') {
    if (value < 0.06) return 'plaza'
    if (value < 0.14) return 'tower'
    if (value < 0.22) return 'school'
    if (value < 0.3) return 'market'
    if (value < 0.38) return 'parking'
    if (value < 0.74) return 'perimeter'
    return 'rows'
  }
  if (kind === 'strip') {
    if (value < 0.05) return 'plaza'
    if (value < 0.15) return 'hotel'
    if (value < 0.23) return 'theater'
    if (value < 0.33) return 'mall'
    if (value < 0.72) return 'perimeter'
    return 'podium'
  }
  if (kind === 'rust') {
    if (value < 0.2) return 'tanks'
    if (value < 0.32) return 'silo'
    if (value < 0.48) return 'factory'
    if (value < 0.68) return 'warehouse'
    if (value < 0.76) return 'construction'
    return 'rows'
  }
  if (kind === 'harbor') {
    if (value < 0.42) return 'containers'
    if (value < 0.52) return 'fishmarket'
    if (value < 0.64) return 'crane'
    if (value < 0.82) return 'warehouse'
    return 'rows'
  }
  if (value < 0.2) return 'hangar'
  if (value < 0.34) return 'solarfield'
  if (value < 0.56) return 'garage'
  return 'outpost'
}

function styleFor(type, district, random) {
  if (type === 'container') return 'metal'
  if (type === 'tower' || type === 'office') return random > 0.25 ? 'glass' : 'concrete'
  if (type === 'housing') return random > 0.55 ? 'brick' : 'concrete'
  if (type === 'industrial' || type === 'warehouse' || type === 'factory') return random > 0.5 ? 'metal' : 'brick'
  if (type === 'hotel' || type === 'theater' || type === 'market') return random > 0.35 ? 'neon' : 'concrete'
  if (type === 'civic' || type === 'school') return 'concrete'
  if (district === 'harbor') return 'metal'
  return random > 0.6 ? 'concrete' : 'glass'
}

export function generateCity() {
  const rand = mulberry32(0x0c17a220)
  const buildings = []
  const blocks = []
  const roads = []
  let buildingId = 0

  const parks = PARKS.map((park) => ({
    ...park,
    trees:
      park.kind === 'solar'
        ? []
        : scatterTrees(park.poly, park.id === 'reservoir' ? 90 : 55, rand, park.water),
  }))

  const cellInfo = (i, j) => {
    if (i < 0 || j < 0 || i >= COLS || j >= ROWS) return null
    const x = START_X + (i + 0.5) * GRID_X
    const y = START_Y + (j + 0.5) * GRID_Y
    if (!pointInPolygon(x, y, CITY_FOOTPRINT)) return null
    if (pointInPark(x, y, parks)) return { x, y, park: true }
    if (pointInAirport(x, y, 10)) return { x, y, airport: true }
    const district = DISTRICTS.find((item) => pointInPolygon(x, y, item.poly))
    if (!district) return null
    return { x, y, district }
  }

  const addBuilding = (building) => {
    buildings.push({ ...building, id: buildingId++ })
  }

  // Roads are continuous across district borders. Each grid line is split only
  // where it hits the city edge, a park, or the airport.
  for (let i = 0; i <= COLS; i += 1) {
    const x = START_X + i * GRID_X
    const boundary = [-4200, 600, 1200, 4200].some((value) => Math.abs(x - value) < 1)
    const width = boundary ? 24 : i % 8 === 0 ? 19 : i % 4 === 0 ? 11 : 6
    let runStart = null
    for (let j = 0; j < ROWS; j += 1) {
      const y1 = START_Y + j * GRID_Y
      const y2 = y1 + GRID_Y
      const cellA = cellInfo(i - 1, j)
      const cellB = cellInfo(i, j)
      const skipLocal = width < 11 && (i * 13 + j * 7) % 9 === 0
      const keep =
        !skipLocal &&
        pointInPolygon(x, (y1 + y2) / 2, CITY_FOOTPRINT) &&
        ((cellA && !cellA.park && !cellA.airport) || (cellB && !cellB.park && !cellB.airport))
      if (keep && runStart === null) runStart = y1
      if (!keep && runStart !== null) {
        roads.push({ x1: x, y1: runStart, x2: x, y2: y1, width, kind: width > 11 ? 'arterial' : 'local', axis: 'v' })
        runStart = null
      }
    }
    if (runStart !== null) {
      roads.push({ x1: x, y1: runStart, x2: x, y2: START_Y + ROWS * GRID_Y, width, kind: width > 11 ? 'arterial' : 'local', axis: 'v' })
    }
  }

  for (let j = 0; j <= ROWS; j += 1) {
    const y = START_Y + j * GRID_Y
    const boundary = [-3100, -2500, 1550, 2150].some((value) => Math.abs(y - value) < 1)
    const width = boundary ? 24 : j % 8 === 0 ? 19 : j % 4 === 0 ? 11 : 6
    let runStart = null
    for (let i = 0; i < COLS; i += 1) {
      const x1 = START_X + i * GRID_X
      const x2 = x1 + GRID_X
      const cellA = cellInfo(i, j - 1)
      const cellB = cellInfo(i, j)
      const skipLocal = width < 11 && (i * 7 + j * 13) % 9 === 0
      const keep =
        !skipLocal &&
        pointInPolygon((x1 + x2) / 2, y, CITY_FOOTPRINT) &&
        ((cellA && !cellA.park && !cellA.airport) || (cellB && !cellB.park && !cellB.airport))
      if (keep && runStart === null) runStart = x1
      if (!keep && runStart !== null) {
        roads.push({ x1: runStart, y1: y, x2: x1, y2: y, width, kind: width > 11 ? 'arterial' : 'local', axis: 'h' })
        runStart = null
      }
    }
    if (runStart !== null) {
      roads.push({ x1: runStart, y1: y, x2: START_X + COLS * GRID_X, y2: y, width, kind: width > 11 ? 'arterial' : 'local', axis: 'h' })
    }
  }

  const blockW = GRID_X - 26
  const blockH = GRID_Y - 26

  for (let j = 0; j < ROWS; j += 1) {
    for (let i = 0; i < COLS; i += 1) {
      const info = cellInfo(i, j)
      if (!info || info.park || info.airport) continue
      const district = info.district
      const density = { core: 0.96, ring: 0.9, strip: 0.94, rust: 0.74, harbor: 0.72, outlands: 0.24 }[district.id] || 0.7
      if (rand() > density) continue

      const wx = info.x
      const wy = info.y
      const morph = pickMorphology(district.id, rand)
      const block = {
        x: wx,
        y: wy,
        w: blockW,
        h: blockH,
        angle: 0,
        corners: [
          [wx - blockW / 2, wy - blockH / 2],
          [wx + blockW / 2, wy - blockH / 2],
          [wx + blockW / 2, wy + blockH / 2],
          [wx - blockW / 2, wy + blockH / 2],
        ],
        district: district.id,
        height: 0,
        morph,
        plaza: morph === 'plaza',
      }

      const innerW = blockW * 0.76
      const innerH = blockH * 0.76
      let created = 0
      let totalHeight = 0

      const isBuildable = (x, y) =>
        pointInPolygon(x, y, CITY_FOOTPRINT) &&
        !pointInPark(x, y, parks) &&
        !pointInAirport(x, y, 8) &&
        pointInPolygon(x, y, district.poly)

      const addLocal = (lx, ly, w, h, height, type, shape = 'rect', tone = rand(), roof = 'flat', style = null) => {
        const x = wx + lx
        const y = wy + ly
        const halfW = w / 2
        const halfH = h / 2
        if (
          !isBuildable(x - halfW, y - halfH) ||
          !isBuildable(x + halfW, y - halfH) ||
          !isBuildable(x + halfW, y + halfH) ||
          !isBuildable(x - halfW, y + halfH)
        ) {
          return false
        }
        addBuilding({
          x,
          y,
          w,
          h,
          angle: 0,
          height,
          type,
          shape,
          roof,
          style: style || styleFor(type, district.id, tone),
          district: district.id,
          tone,
        })
        created += 1
        totalHeight += height
        return true
      }

      const baseHeight = (multiplier = 1) => {
        const ranges = {
          core: [40, 265],
          ring: [18, 105],
          strip: [16, 140],
          rust: [10, 78],
          harbor: [8, 50],
          outlands: [6, 32],
        }
        const [min, max] = ranges[district.id] || [10, 60]
        return Math.max(4, Math.round((min + Math.pow(rand(), 2.1) * (max - min)) * multiplier))
      }

      if (morph === 'plaza') {
        if (rand() > 0.5) addLocal(0, 0, 12, 9, 5 + rand() * 4, 'civic')
        block.courtyard = { w: innerW, h: innerH, green: true }
      } else if (morph === 'supertower') {
        const bw = innerW * (0.32 + rand() * 0.08)
        const bd = innerH * (0.32 + rand() * 0.08)
        addLocal(0, 0, bw, bd, baseHeight(1.65), 'tower', 'cross', rand(), 'spire', 'glass')
        addLocal(-innerW * 0.34, innerH * 0.27, innerW * 0.26, innerH * 0.22, baseHeight(0.4), 'podium', 'rect', rand(), 'flat', 'concrete')
        addLocal(innerW * 0.34, -innerH * 0.27, innerW * 0.24, innerH * 0.22, baseHeight(0.32), 'podium', 'rect', rand(), 'flat', 'concrete')
      } else if (morph === 'twin') {
        addLocal(-innerW * 0.22, 0, innerW * 0.3, innerH * 0.48, baseHeight(1.3), 'tower', 'rect', rand(), 'spire', 'glass')
        addLocal(innerW * 0.22, 0, innerW * 0.28, innerH * 0.46, baseHeight(1.22), 'tower', 'rect', rand(), 'flat', 'glass')
        addLocal(0, innerH * 0.32, innerW * 0.7, innerH * 0.2, baseHeight(0.3), 'podium', 'rect', rand(), 'flat', 'concrete')
      } else if (morph === 'mall') {
        addLocal(0, 0, innerW * 0.9, innerH * 0.72, 18 + rand() * 18, 'mall', 'rect', rand(), 'skylight', 'concrete')
        addLocal(innerW * 0.38, innerH * 0.32, innerW * 0.2, innerH * 0.18, 8 + rand() * 5, 'podium', 'rect', rand(), 'flat', 'concrete')
        block.yard = true
      } else if (morph === 'parking') {
        addLocal(0, 0, innerW * 0.8, innerH * 0.6, 12 + rand() * 8, 'parking', 'parking', rand(), 'open', 'concrete')
        block.yard = true
      } else if (morph === 'data') {
        addLocal(0, 0, innerW * 0.72, innerH * 0.58, 14 + rand() * 12, 'data', 'rect', rand(), 'cooling', 'metal')
        addLocal(innerW * 0.34, -innerH * 0.3, innerW * 0.18, innerH * 0.16, 6 + rand() * 4, 'industrial', 'rect', rand(), 'flat', 'metal')
        block.yard = true
      } else if (morph === 'school') {
        const t = Math.min(innerW, innerH) * 0.18
        addLocal(0, -innerH / 2 + t / 2, innerW * 0.75, t, baseHeight(0.4), 'school', 'rect', rand(), 'garden', 'concrete')
        addLocal(-innerW / 2 + t / 2, innerH * 0.08, t, innerH * 0.55, baseHeight(0.3), 'school', 'rect', rand(), 'flat', 'concrete')
        addLocal(innerW / 2 - t / 2, innerH * 0.08, t, innerH * 0.55, baseHeight(0.3), 'school', 'rect', rand(), 'flat', 'concrete')
        block.courtyard = { w: innerW * 0.58, h: innerH * 0.48, green: true }
      } else if (morph === 'market') {
        for (let s = 0; s < 5; s += 1) {
          addLocal(
            (rand() - 0.5) * innerW * 0.68,
            (rand() - 0.5) * innerH * 0.6,
            10 + rand() * 12,
            7 + rand() * 8,
            4 + rand() * 4,
            'market',
            'rect',
            rand(),
            rand() > 0.5 ? 'billboard' : 'canopy',
            'neon',
          )
        }
        block.yard = true
      } else if (morph === 'hotel') {
        addLocal(-innerW * 0.12, 0, innerW * 0.36, innerH * 0.46, baseHeight(1.12), 'hotel', 'rect', rand(), 'billboard', 'neon')
        addLocal(innerW * 0.3, innerH * 0.2, innerW * 0.26, innerH * 0.26, baseHeight(0.35), 'podium', 'rect', rand(), 'flat', 'concrete')
      } else if (morph === 'theater') {
        addLocal(0, 0, innerW * 0.58, innerH * 0.58, baseHeight(0.55), 'theater', 'round', rand(), 'dome', 'neon')
        block.yard = true
      } else if (morph === 'factory') {
        addLocal(-innerW * 0.08, 0, innerW * 0.78, innerH * 0.55, baseHeight(0.5), 'factory', 'sawtooth', rand(), 'sawtooth', 'brick')
        if (rand() > 0.5) addLocal(innerW * 0.38, innerH * 0.32, innerW * 0.16, innerH * 0.18, baseHeight(0.22), 'industrial', 'rect', rand(), 'flat', 'metal')
        block.yard = true
      } else if (morph === 'silo') {
        const count = 3
        for (let s = 0; s < count; s += 1) {
          addLocal(-innerW * 0.28 + s * innerW * 0.28, 0, 18 + rand() * 10, 18 + rand() * 10, 18 + rand() * 16, 'silo', 'round', rand(), 'flat', 'concrete')
        }
        block.yard = true
      } else if (morph === 'construction') {
        addLocal(-innerW * 0.3, innerH * 0.22, 14, 10, 5, 'civic', 'rect', rand(), 'flat', 'concrete')
        block.construction = true
        block.yard = true
      } else if (morph === 'fishmarket') {
        for (let s = 0; s < 4; s += 1) {
          addLocal(-innerW * 0.34 + s * innerW * 0.22, innerH * 0.05, innerW * 0.16, innerH * 0.14, 5 + rand() * 3, 'market', 'rect', rand(), 'canopy', 'neon')
        }
        block.yard = true
      } else if (morph === 'crane') {
        block.construction = true
        addLocal(innerW * 0.22, innerH * 0.24, 22, 16, 8, 'warehouse', 'rect', rand(), 'flat', 'metal')
        block.yard = true
      } else if (morph === 'hangar') {
        addLocal(0, 0, innerW * 0.86, innerH * 0.6, 18 + rand() * 16, 'hangar', 'hangar', rand(), 'arch', 'metal')
        block.yard = true
      } else if (morph === 'solarfield') {
        block.solar = true
        block.yard = true
      } else if (morph === 'garage') {
        addLocal(0, 0, innerW * 0.52, innerH * 0.46, 7 + rand() * 7, 'garage', 'rect', rand(), 'solar', 'metal')
        block.yard = true
      } else if (morph === 'tower') {
        const bw = innerW * (0.38 + rand() * 0.18)
        const bd = innerH * (0.38 + rand() * 0.18)
        addLocal(0, 0, bw, bd, baseHeight(1.35), 'tower')
        if (rand() > 0.4) addLocal(-innerW * 0.34, innerH * 0.28, innerW * 0.2, innerH * 0.2, baseHeight(0.4), 'podium')
        if (rand() > 0.5) addLocal(innerW * 0.33, -innerH * 0.26, innerW * 0.18, innerH * 0.18, baseHeight(0.34), 'podium')
      } else if (morph === 'podium') {
        const cols = district.id === 'core' ? 3 : 2
        const rows = 2
        for (let cx = 0; cx < cols; cx += 1) {
          for (let cy = 0; cy < rows; cy += 1) {
            if (rand() > 0.93) continue
            const w = (innerW / cols) * (0.6 + rand() * 0.22)
            const h = (innerH / rows) * (0.6 + rand() * 0.22)
            const x = -innerW / 2 + (cx + 0.5) * (innerW / cols)
            const y = -innerH / 2 + (cy + 0.5) * (innerH / rows)
            addLocal(x, y, w, h, baseHeight(district.id === 'core' ? 0.9 : 0.62), district.id === 'core' ? 'tower' : 'mixed')
          }
        }
      } else if (morph === 'perimeter') {
        const t = Math.min(innerW, innerH) * 0.16
        const sideW = innerW - t * 1.8
        const sideH = innerH - t * 1.8
        const horizontalSegments = 3
        const verticalSegments = 2
        for (let s = 0; s < horizontalSegments; s += 1) {
          const width = (sideW / horizontalSegments) * 0.88
          const x = -sideW / 2 + (s + 0.5) * (sideW / horizontalSegments)
          addLocal(x, -innerH / 2 + t / 2, width, t, baseHeight(0.82), 'housing')
          addLocal(x, innerH / 2 - t / 2, width, t, baseHeight(0.72), 'housing')
        }
        for (let s = 0; s < verticalSegments; s += 1) {
          const height = (sideH / verticalSegments) * 0.88
          const y = -sideH / 2 + (s + 0.5) * (sideH / verticalSegments)
          addLocal(-innerW / 2 + t / 2, y, t, height, baseHeight(0.76), 'housing')
          addLocal(innerW / 2 - t / 2, y, t, height, baseHeight(0.68), 'housing')
        }
        block.courtyard = { w: innerW - t * 1.8, h: innerH - t * 1.8, green: rand() > 0.82 }
      } else if (morph === 'rows') {
        const rows = district.id === 'rust' ? 2 : 3
        for (let row = 0; row < rows; row += 1) {
          const segments = 2
          for (let s = 0; s < segments; s += 1) {
            const w = (innerW / segments) * 0.82
            const h = (innerH / rows) * 0.44
            const x = -innerW / 2 + (s + 0.5) * (innerW / segments)
            const y = -innerH / 2 + (row + 0.5) * (innerH / rows)
            addLocal(x, y, w, h, baseHeight(0.45), district.id === 'rust' ? 'industrial' : 'housing')
          }
        }
      } else if (morph === 'warehouse') {
        const bw = innerW * (0.58 + rand() * 0.22)
        const bd = innerH * (0.52 + rand() * 0.2)
        addLocal(-innerW * 0.08, 0, bw, bd, baseHeight(0.45), district.id === 'harbor' ? 'warehouse' : 'industrial')
        if (rand() > 0.5) addLocal(innerW * 0.36, innerH * 0.3, innerW * 0.2, innerH * 0.2, baseHeight(0.22), 'industrial')
        block.yard = true
      } else if (morph === 'containers') {
        const cCols = 3
        const cRows = 2
        for (let cx = 0; cx < cCols; cx += 1) {
          for (let cy = 0; cy < cRows; cy += 1) {
            if (rand() > 0.78) continue
            const w = (innerW / cCols) * 0.56
            const h = (innerH / cRows) * 0.52
            const x = -innerW / 2 + (cx + 0.5) * (innerW / cCols)
            const y = -innerH / 2 + (cy + 0.5) * (innerH / cRows)
            addLocal(x, y, w, h, 3 + Math.round(rand() * 5), 'container', 'rect', rand())
          }
        }
        block.yard = true
      } else if (morph === 'tanks') {
        const count = 2 + Math.floor(rand() * 3)
        for (let t = 0; t < count; t += 1) {
          const size = 18 + rand() * 22
          const x = (rand() - 0.5) * innerW * 0.68
          const y = (rand() - 0.5) * innerH * 0.68
          addLocal(x, y, size, size, 8 + rand() * 16, 'tank', 'round')
        }
        block.yard = true
      } else {
        const count = 1 + (rand() > 0.55 ? 1 : 0)
        for (let s = 0; s < count; s += 1) {
          addLocal(
            (rand() - 0.5) * innerW * 0.6,
            (rand() - 0.5) * innerH * 0.6,
            10 + rand() * 16,
            8 + rand() * 14,
            5 + rand() * 10,
            'outpost',
          )
        }
      }

      if (created > 0 || block.plaza) {
        block.height = created ? totalHeight / created : 0
        block.density = created / 8
        blocks.push(block)
      } else {
        block.yard = true
        blocks.push(block)
      }
    }
  }

  const expresswaySegments = []
  for (const expressway of EXPRESSWAYS) {
    for (let i = 0; i < expressway.points.length - 1; i += 1) {
      const [x1, y1] = expressway.points[i]
      const [x2, y2] = expressway.points[i + 1]
      expresswaySegments.push({ x1, y1, x2, y2, width: expressway.width })
    }
  }

  const ramps = []
  for (const interchange of INTERCHANGES) {
    const directions =
      interchange.type === 'full'
        ? [[1, 1], [1, -1], [-1, 1], [-1, -1]]
        : [[1, 1], [-1, -1]]
    for (const [dx, dy] of directions) {
      ramps.push({
        id: `${interchange.id}-${dx}-${dy}`,
        x1: interchange.x,
        y1: interchange.y,
        x2: interchange.x + dx * 150,
        y2: interchange.y + dy * 90,
        width: 9,
      })
    }
  }

  const roadSegments = [
    ...roads.map((road) => ({
      x1: road.x1,
      y1: road.y1,
      x2: road.x2,
      y2: road.y2,
      width: road.width,
    })),
    ...expresswaySegments,
    ...ramps,
  ]
  const roadIndex = buildRoadIndex(roadSegments)
  const beforeClearance = buildings.length
  const kept = buildings.filter((building) => {
    const radius = Math.hypot(building.w, building.h) / 2
    const nearby = nearRoadSegments(roadIndex, building.x, building.y)
    for (const segment of nearby) {
      if (pointSegmentDistance(building.x, building.y, segment) < segment.width / 2 + radius * 0.66 + 2) {
        return false
      }
    }
    return true
  })

  const buildingIndex = new Map()
  for (const building of kept) {
    const key = `${Math.floor((building.x - WORLD.minX) / CELL)}:${Math.floor((building.y - WORLD.minY) / CELL)}`
    if (!buildingIndex.has(key)) buildingIndex.set(key, [])
    buildingIndex.get(key).push(building)
  }

  const trafficRoutes = []
  for (const expressway of EXPRESSWAYS) {
    let length = 0
    const segments = []
    for (let i = 0; i < expressway.points.length - 1; i += 1) {
      const [x1, y1] = expressway.points[i]
      const [x2, y2] = expressway.points[i + 1]
      const segmentLength = Math.hypot(x2 - x1, y2 - y1)
      segments.push({ x1, y1, x2, y2, length: segmentLength, start: length })
      length += segmentLength
    }
    trafficRoutes.push({ points: expressway.points, segments, length })
  }
  for (const road of roads) {
    if (road.kind !== 'arterial') continue
    const length = Math.hypot(road.x2 - road.x1, road.y2 - road.y1)
    if (length < 100) continue
    trafficRoutes.push({
      points: [[road.x1, road.y1], [road.x2, road.y2]],
      length,
      segments: [{ x1: road.x1, y1: road.y1, x2: road.x2, y2: road.y2, length, start: 0 }],
    })
  }

  const vehicles = Array.from({ length: 140 }).map(() => ({
    route: Math.floor(rand() * trafficRoutes.length),
    t: rand(),
    speed: 0.018 + rand() * 0.032,
    dir: rand() > 0.5 ? 1 : -1,
    color: rand() > 0.7 ? '#ff6b6b' : rand() > 0.5 ? '#ffb454' : '#9fe8f0',
  }))

  return {
    buildings: kept,
    blocks,
    roads,
    highways: EXPRESSWAYS,
    ramps,
    interchanges: INTERCHANGES,
    trafficRoutes,
    vehicles,
    cityFootprint: CITY_FOOTPRINT,
    water: [],
    parks,
    districts: DISTRICTS,
    factions: FACTIONS,
    pois: POIS,
    buildingIndex,
    cell: CELL,
    stats: {
      buildings: kept.length,
      blocks: blocks.length,
      roads: roads.length,
      area: WORLD.areaKm2,
      removedForRoads: beforeClearance - kept.length,
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
        if (
          Math.abs(worldX - b.x) <= b.w / 2 &&
          Math.abs(worldY - b.y) <= b.h / 2
        ) {
          return b
        }
      }
    }
  }
  return null
}

export { TAU }
