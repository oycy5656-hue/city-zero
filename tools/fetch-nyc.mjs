import fs from 'node:fs/promises'
import path from 'node:path'
const base='https://a841-dotweb01.nyc.gov/arcgis/rest/services/GAZETTEER/NYCDOTBaseMap_Street/MapServer'
const bbox='-74.02,40.70,-73.96,40.80'
const outDir='tools/raw'
await fs.mkdir(outDir,{recursive:true})
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms))
async function get(url,tries=4){
  let last
  for(let i=0;i<tries;i++){
    try{const r=await fetch(url,{headers:{'User-Agent':'city-zero-nyc-import/1.0'}});if(!r.ok)throw new Error('HTTP '+r.status);return await r.json()}
    catch(e){last=e;await sleep(700*(i+1))}
  }
  throw last
}
async function fetchLayer(id,fields,where='1=1',filter=null){
  const countUrl=`${base}/${id}/query?where=${encodeURIComponent(where)}&geometry=${bbox}&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&returnCountOnly=true&f=json`
  const count=(await get(countUrl)).count
  console.log('layer',id,'count',count)
  const features=[]; const page=1000
  for(let offset=0;offset<count;offset+=page){
    const u=`${base}/${id}/query?where=${encodeURIComponent(where)}&geometry=${bbox}&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=${encodeURIComponent(fields)}&returnGeometry=true&outSR=4326&f=geojson&resultOffset=${offset}&resultRecordCount=${page}&orderByFields=OBJECTID`
    const j=await get(u); const fsx=j.features||[]
    for(const f of fsx){if(!filter||filter(f))features.push(f)}
    console.log(' ',offset+fsx.length,'/',count,'kept',features.length)
    if(fsx.length===0)break
  }
  return features
}
const buildings=await fetchLayer(17,'OBJECTID,BIN,BBL,HEIGHT_ROOF,NUM_FLOORS,CONSTRUCTION_YEAR,FEATURE_CODE,NAME',"BBL LIKE '1%'",f=>String(f.properties.BBL||'').startsWith('1'))
const streets=await fetchLayer(30,'OBJECTID,Street,StreetWidth,FeatureTyp,TrafDir,LBoro,RBoro,from_st,to_st',"LBoro=1 OR RBoro=1",f=>f.properties.LBoro===1||f.properties.RBoro===1)
const parks=await fetchLayer(38,'OBJECTID,PARK_NAME,PARKNUM,LANDUSE',"PARKNUM LIKE 'M%'",f=>String(f.properties.PARKNUM||'').startsWith('M'))
const landAll=await fetchLayer(42,'OBJECTID,BoroCode,BoroName,Shape_Area','1=1',f=>f.properties.BoroName==='Manhattan')
await fs.writeFile(path.join(outDir,'buildings.geojson'),JSON.stringify({type:'FeatureCollection',features:buildings}))
await fs.writeFile(path.join(outDir,'streets.geojson'),JSON.stringify({type:'FeatureCollection',features:streets}))
await fs.writeFile(path.join(outDir,'parks.geojson'),JSON.stringify({type:'FeatureCollection',features:parks}))
await fs.writeFile(path.join(outDir,'land.geojson'),JSON.stringify({type:'FeatureCollection',features:landAll}))
console.log('DONE buildings',buildings.length,'streets',streets.length,'parks',parks.length,'land',landAll.length)
