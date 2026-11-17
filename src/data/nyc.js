import map from './nyc-map.json'
import buildings from './nyc-buildings.json'
import roads from './nyc-roads.json'

export const WORLD = { ...map.WORLD, name: '曼哈顿', english: 'MANHATTAN', year: '2088' }
export const CITY_FOOTPRINT = map.CITY_FOOTPRINT
export const DISTRICTS = map.DISTRICTS
export const DISTRICT_BY_ID = Object.fromEntries(DISTRICTS.map((district) => [district.id, district]))
export const PARKS = map.PARKS
export const POIS = map.POIS
export const BUILDINGS = buildings
export const ROADS = roads

// Real NYC has no need for procedural rivers/bridges here: the land polygon is
// the Manhattan shoreline, and the East/Hudson rivers are the water background.
export const RIVERS = []
export const BRIDGES = []
export const EXPRESSWAYS = []
export const INTERCHANGES = []
export const AIRPORT = null
export const WATER = []
export const ROAD_LABELS = []
