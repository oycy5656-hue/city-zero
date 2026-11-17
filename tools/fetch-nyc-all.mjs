import fs from 'node:fs/promises'
import path from 'node:path'
const base='https://a841-dotweb01.nyc.gov/arcgis/rest/services/GAZETTEER'
const bbox='-74.27,40.49,-73.69,40.92'
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms))
async function get(url,tries=4){let last;for(let i=0;i<tries;i++){try{const r=await fetch(url,{headers:{'User-Agent':'city-zero-nyc-import/1.0'}});if(!r.ok)throw new Error('HTTP '+r.status);return await r.json()}catch(e){last=e;await sleep(800*(i+1))}}throw last}
async function fetchLayer(url,fields,where='1=1',filter=null){
 const countUrl=`${url}/query?where=${encodeURIComponent(where)}&geometry=${bbox}&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&returnCountOnly=true&f=json`
 const count=(await get(countUrl)).count;console.log(url,'count',count)
 const features=[];const page=1000
 for(let offset=0;offset<count;offset+=page){
  const u=`${url}/query?where=${encodeURIComponent(where)}&geometry=${bbox}&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=${encodeURIComponent(fields)}&returnGeometry=true&outSR=4326&f=geojson&resultOffset=${offset}&resultRecordCount=${page}&orderByFields=OBJECTID`
  const j=await get(u);const fx=j.features||[];for(const f of fx){if(!filter||filter(f))features.push(f)}
  console.log(' ',offset+fx.length,'/',count,'kept',features.length);if(!fx.length)break
 }
 return features
}
const baseDOT=`${base}/NYCDOTBaseMap_Street/MapServer`
const land=await fetchLayer(`${baseDOT}/42`,'OBJECTID,BoroCode,BoroName,Shape_Area','1=1')
const roads=await fetchLayer(`${baseDOT}/30`,'OBJECTID,Street,StreetWidth,FeatureTyp,LBoro,RBoro,from_st,to_st',"StreetWidth>=60")
const parks=await fetchLayer(`${baseDOT}/38`,'OBJECTID,PARK_NAME,PARKNUM,LANDUSE',"Shape_Area>20000")
async function fetchNta(){
 const url=`${base}/Neighborhood_Tabulation_Areas_2020/MapServer/0/query?where=1%3D1&outFields=OBJECTID,BoroName,NTAName,NTA2020&returnGeometry=true&outSR=4326&f=json&resultRecordCount=1000`
 const j=await get(url); const features=[]
 for(const f of j.features||[]){ if(!f.geometry) continue; features.push({type:'Feature',properties:f.attributes,geometry:{type:'Polygon',coordinates:f.geometry.rings}}) }
 console.log('NTA features',features.length); return features
}
const nta=await fetchNta()
await fs.writeFile('tools/raw-all/land.geojson',JSON.stringify({type:'FeatureCollection',features:land}))
await fs.writeFile('tools/raw-all/roads.geojson',JSON.stringify({type:'FeatureCollection',features:roads}))
await fs.writeFile('tools/raw-all/parks.geojson',JSON.stringify({type:'FeatureCollection',features:parks}))
await fs.writeFile('tools/raw-all/nta.geojson',JSON.stringify({type:'FeatureCollection',features:nta}))
console.log('DONE',land.length,roads.length,parks.length,nta.length)
