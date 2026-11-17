import { WORLD } from '../data/city.js'
import { normalizeStreamBuilding } from './generator.js'

const BASE = 'https://a841-dotweb01.nyc.gov/arcgis/rest/services/GAZETTEER/NYCDOTBaseMap_Street/MapServer'
export const TILE_SIZE = 500
export const ROAD_TILE_SIZE = 1000
const ROAD_TILE_PREFIX = 'road'

export function tileKey(tx, ty) {
  return `${tx}:${ty}`
}

export function tileBounds(tx, ty) {
  return {
    minX: WORLD.minX + tx * TILE_SIZE,
    minY: WORLD.minY + ty * TILE_SIZE,
    maxX: WORLD.minX + (tx + 1) * TILE_SIZE,
    maxY: WORLD.minY + (ty + 1) * TILE_SIZE,
  }
}

export function worldToLonLat(x, y) {
  return [WORLD.lon0 + x / WORLD.mx, WORLD.lat0 - y / WORLD.my]
}

export function lonLatToWorld(lon, lat) {
  return [(lon - WORLD.lon0) * WORLD.mx, -(lat - WORLD.lat0) * WORLD.my]
}

function queryUrl(layer, bounds, outFields) {
  const [west, north] = worldToLonLat(bounds.minX, bounds.minY)
  const [east, south] = worldToLonLat(bounds.maxX, bounds.maxY)
  const params = new URLSearchParams({
    where: '1=1',
    geometry: `${west},${south},${east},${north}`,
    geometryType: 'esriGeometryEnvelope',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields,
    returnGeometry: 'true',
    outSR: '4326',
    f: 'geojson',
    resultRecordCount: '1000',
    resultOffset: '0',
  })
  return `${BASE}/${layer}/query?${params.toString()}`
}

function normalizeRoad(feature) {
  const props = feature.properties || {}
  const coords = feature.geometry?.coordinates
  if (!coords || coords.length < 2) return null
  const projected = coords.map(([lon, lat]) => lonLatToWorld(lon, lat))
  const points = [projected[0]]
  for (let i = 1; i < projected.length; i += 1) {
    const [x, y] = projected[i]
    const [lx, ly] = points[points.length - 1]
    if (Math.hypot(x - lx, y - ly) >= 8) points.push([x, y])
  }
  const last = projected[projected.length - 1]
  const [fx, fy] = points[points.length - 1]
  if (Math.hypot(last[0] - fx, last[1] - fy) > 0.5) points.push(last)
  if (points.length < 2) return null
  return {
    name: (props.Street || '').trim(),
    width: Math.max(4, Math.min(38, (Number(props.StreetWidth) || 0) * 0.3048 || 10)),
    points,
  }
}

export function roadTileKey(tx, ty) {
  return `${ROAD_TILE_PREFIX}:${tx}:${ty}`
}

export function roadTileBounds(tx, ty) {
  return {
    minX: WORLD.minX + tx * ROAD_TILE_SIZE,
    minY: WORLD.minY + ty * ROAD_TILE_SIZE,
    maxX: WORLD.minX + (tx + 1) * ROAD_TILE_SIZE,
    maxY: WORLD.minY + (ty + 1) * ROAD_TILE_SIZE,
  }
}

export async function fetchRoadTile(tx, ty, signal) {
  const response = await fetch(queryUrl(30, roadTileBounds(tx, ty), 'OBJECTID,Street,StreetWidth'), { signal })
  if (!response.ok) throw new Error(`NYC road tile ${tx}:${ty} HTTP ${response.status}`)
  const json = await response.json()
  const roads = []
  for (const feature of json.features || []) {
    const road = normalizeRoad(feature)
    if (road) roads.push(road)
  }
  return roads
}

export async function fetchTile(tx, ty, signal) {
  const bounds = tileBounds(tx, ty)
  const buildingsResponse = await fetch(queryUrl(17, bounds, 'OBJECTID,BIN,BBL,HEIGHT_ROOF,NUM_FLOORS,CONSTRUCTION_YEAR'), { signal })
  if (!buildingsResponse.ok) {
    throw new Error(`NYC building tile ${tx}:${ty} HTTP ${buildingsResponse.status}`)
  }
  const buildingsJson = await buildingsResponse.json()
  const buildings = []
  for (const feature of buildingsJson.features || []) {
    const building = normalizeStreamBuilding(feature, `${tx}:${ty}:${feature.properties?.OBJECTID}`)
    if (building) buildings.push(building)
  }
  return { buildings, roads: [] }
}
