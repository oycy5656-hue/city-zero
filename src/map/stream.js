import { WORLD } from '../data/city.js'
import { normalizeStreamBuilding } from './generator.js'

const BASE = 'https://a841-dotweb01.nyc.gov/arcgis/rest/services/GAZETTEER/NYCDOTBaseMap_Street/MapServer'
export const TILE_SIZE = 500

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
  const points = coords.map(([lon, lat]) => lonLatToWorld(lon, lat))
  return {
    name: (props.Street || '').trim(),
    width: Math.max(4, Math.min(38, (Number(props.StreetWidth) || 0) * 0.3048 || 10)),
    points,
  }
}

export async function fetchTile(tx, ty, signal) {
  const bounds = tileBounds(tx, ty)
  const [buildingsResponse, roadsResponse] = await Promise.all([
    fetch(queryUrl(17, bounds, 'OBJECTID,BIN,BBL,HEIGHT_ROOF,NUM_FLOORS,CONSTRUCTION_YEAR'), { signal }),
    fetch(queryUrl(30, bounds, 'OBJECTID,Street,StreetWidth'), { signal }),
  ])
  if (!buildingsResponse.ok || !roadsResponse.ok) {
    throw new Error(`NYC tile ${tx}:${ty} HTTP ${buildingsResponse.status}/${roadsResponse.status}`)
  }
  const [buildingsJson, roadsJson] = await Promise.all([
    buildingsResponse.json(),
    roadsResponse.json(),
  ])
  const buildings = []
  for (const feature of buildingsJson.features || []) {
    const building = normalizeStreamBuilding(feature, `${tx}:${ty}:${feature.properties?.OBJECTID}`)
    if (building) buildings.push(building)
  }
  const roads = []
  for (const feature of roadsJson.features || []) {
    const road = normalizeRoad(feature)
    if (road) roads.push(road)
  }
  return { buildings, roads }
}
