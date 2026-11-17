import map from './nyc-map.json'

export const WORLD = { ...map.WORLD, name: '新纽约', english: 'NEW NEW YORK', year: '2077' }
export const CITY_AREAS = map.CITY_AREAS
export const DISTRICTS = map.DISTRICTS
export const DISTRICT_BY_ID = Object.fromEntries(DISTRICTS.map((district) => [district.id, district]))
export const COMMUNITIES = map.COMMUNITIES
export const PARKS = map.PARKS
export const POIS = map.POIS
export const AIRPORTS = map.AIRPORTS
export const ROADS = map.ROADS
export const TOTAL_BUILDINGS = map.TOTAL_BUILDINGS
export const BUILDINGS = []
export const CITY_FOOTPRINT = null
export const RIVERS = []
export const BRIDGES = []
export const EXPRESSWAYS = []
export const INTERCHANGES = []
export const AIRPORT = null
export const WATER = []
export const ROAD_LABELS = []
