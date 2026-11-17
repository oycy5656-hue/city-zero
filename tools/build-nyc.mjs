import fs from 'node:fs'
import path from 'node:path'
const raw=(name)=>JSON.parse(fs.readFileSync(path.join('tools/raw',name),'utf8'))
const LAT0=40.75, LON0=-73.99
const MX=111320*Math.cos(LAT0*Math.PI/180), MY=110540
const proj=([lon,lat])=>[(lon-LON0)*MX,-(lat-LAT0)*MY]
function rdp(points,tol){
  if(points.length<3)return points.slice()
  let maxD=0,idx=0
  const [x1,y1]=points[0],[x2,y2]=points[points.length-1]
  const dx=x2-x1,dy=y2-y1,len2=dx*dx+dy*dy
  for(let i=1;i<points.length-1;i++){
    const [px,py]=points[i]
    let t=len2?((px-x1)*dx+(py-y1)*dy)/len2:0
    t=Math.max(0,Math.min(1,t))
    const d=Math.hypot(px-(x1+t*dx),py-(y1+t*dy))
    if(d>maxD){maxD=d;idx=i}
  }
  if(maxD>tol){const a=rdp(points.slice(0,idx+1),tol),b=rdp(points.slice(idx),tol);return a.slice(0,-1).concat(b)}
  return [points[0],points[points.length-1]]
}
function simplifyRing(ring,tol){
  let pts=ring.map(proj)
  if(pts.length>1 && Math.hypot(pts[0][0]-pts[pts.length-1][0],pts[0][1]-pts[pts.length-1][1])<0.01)pts.pop()
  const simp=rdp(pts,tol)
  return simp
}
function area(ring){let s=0;for(let i=0,j=ring.length-1;i<ring.length;j=i++)s+=ring[j][0]*ring[i][1]-ring[i][0]*ring[j][1];return Math.abs(s)/2}
function centroid(ring){let x=0,y=0,a=0;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const f=ring[j][0]*ring[i][1]-ring[i][0]*ring[j][1];a+=f;x+=(ring[j][0]+ring[i][0])*f;y+=(ring[j][1]+ring[i][1])*f}if(Math.abs(a)<1e-9)return ring[0];return [x/(3*a),y/(3*a)]}
function outerRings(geom){
  if(geom.type==='Polygon')return [geom.coordinates[0]]
  if(geom.type==='MultiPolygon')return geom.coordinates.map(p=>p[0])
  return []
}

function clipPoly(poly,rect){
  const {minX,minY,maxX,maxY}=rect;
  const edges=[
    p=>p[0]>=minX,
    p=>p[0]<=maxX,
    p=>p[1]>=minY,
    p=>p[1]<=maxY,
  ];
  const inter=(a,b,edge)=>{
    const [ax,ay]=a,[bx,by]=b;
    if(edge===0){const t=(minX-ax)/(bx-ax);return [minX,ay+(by-ay)*t]}
    if(edge===1){const t=(maxX-ax)/(bx-ax);return [maxX,ay+(by-ay)*t]}
    if(edge===2){const t=(minY-ay)/(by-ay);return [ax+(bx-ax)*t,minY]}
    const t=(maxY-ay)/(by-ay);return [ax+(bx-ax)*t,maxY];
  };
  let out=poly;
  for(let e=0;e<4;e++){
    const input=out; out=[];
    for(let i=0;i<input.length;i++){
      const cur=input[i],prev=input[(i+input.length-1)%input.length];
      const curIn=edges[e](cur),prevIn=edges[e](prev);
      if(curIn){if(!prevIn)out.push(inter(prev,cur,e));out.push(cur)}
      else if(prevIn)out.push(inter(prev,cur,e));
    }
    if(!out.length)break;
  }
  return out;
}

const landF=raw('land.geojson').features.find(f=>f.properties.BoroName==='Manhattan')
let landRings=outerRings(landF.geometry).map(r=>simplifyRing(r,1.2)).filter(r=>r.length>10)
landRings.sort((a,b)=>area(b)-area(a))
let land=landRings[0]
const clipRect={minX:(-74.02-LON0)*MX,minY:-(40.80-LAT0)*MY,maxX:(-73.96-LON0)*MX,maxY:-(40.70-LAT0)*MY}
const clipped=clipPoly(land,clipRect)
land=clipped
const landBox=clipped.reduce((o,[x,y])=>({minX:Math.min(o.minX,x),maxX:Math.max(o.maxX,x),minY:Math.min(o.minY,y),maxY:Math.max(o.maxY,y)}),{minX:1e9,maxX:-1e9,minY:1e9,maxY:-1e9})
const margin=260
const WORLD={minX:Math.floor(landBox.minX-margin),minY:Math.floor(landBox.minY-margin),maxX:Math.ceil(landBox.maxX+margin),maxY:Math.ceil(landBox.maxY+margin)}
WORLD.width=WORLD.maxX-WORLD.minX; WORLD.height=WORLD.maxY-WORLD.minY; WORLD.areaKm2=+(area(land)/1e6).toFixed(2)
function inRing(x,y,ring){let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const xi=ring[i][0],yi=ring[i][1],xj=ring[j][0],yj=ring[j][1];const it=(yi>y)!==(yj>y)&&x<((xj-xi)*(y-yi))/(yj-yi)+xi;if(it)inside=!inside}return inside}
// buildings
const buildings=[]
for(const f of raw('buildings.geojson').features){
  const p=f.properties
  if(!String(p.BBL||'').startsWith('1'))continue
  const rings=outerRings(f.geometry)
  if(!rings.length)continue
  let ring=rings.sort((a,b)=>area(a)-area(b)).at(-1).map(proj)
  if(ring.length>1&&Math.hypot(ring[0][0]-ring[ring.length-1][0],ring[0][1]-ring[ring.length-1][1])<0.01)ring.pop()
  ring=rdp(ring,0.65)
  const a=area(ring)
  if(a<12||ring.length<3)continue
  const c=centroid(ring)
  if(!inRing(c[0],c[1],land))continue
  const floors=Number(p.NUM_FLOORS)||0
  const roof=Number(p.HEIGHT_ROOF)||0
  const h=Math.max(3,Math.min(360,roof>0?roof*0.3048:floors*3.2))
  const year=Number(p.CONSTRUCTION_YEAR)||0
  const style=year&&year<1930?'brick':year&&year<1975?'concrete':h>90?'glass':'concrete'
  const type=h>120?'tower':h>55?'office':h>28?'midrise':h>16?'walkup':'rowhouse'
  const tone=(Math.abs(Math.round(c[0]*7+c[1]*13))%1000)/1000
  buildings.push({
    id:buildings.length,bin:p.BIN||null,bbl:p.BBL||null,name:p.NAME||null,
    cx:+c[0].toFixed(1),cy:+c[1].toFixed(1),points:ring.map(([x,y])=>[+x.toFixed(1),+y.toFixed(1)]),
    h:+h.toFixed(1),height:+h.toFixed(1),floors:floors||Math.max(1,Math.round(h/3.2)),year,
    style,type,tone,area:+a.toFixed(1),roof:h>100?'spire':tone>0.8?'watertower':'flat'
  })
}
// roads
const roads=[]
for(const f of raw('streets.geojson').features){
  const p=f.properties
  if(p.LBoro!==1&&p.RBoro!==1)continue
  let pts=f.geometry.coordinates.map(proj)
  if(pts.length<2)continue
  const len=pts.slice(1).reduce((s,q,i)=>s+Math.hypot(q[0]-pts[i][0],q[1]-pts[i][1]),0)
  if(len<6)continue
  pts=rdp(pts,1.2)
  const name=(p.Street||'').trim()
  const width=Math.max(5,Math.min(34,(Number(p.StreetWidth)||0)*0.3048||10))
  roads.push({id:roads.length,name,width:+width.toFixed(1),points:pts.map(([x,y])=>[+x.toFixed(1),+y.toFixed(1)]),length:+len.toFixed(1)})
}
// parks
const parks=[]
for(const f of raw('parks.geojson').features){
  const p=f.properties
  if(!String(p.PARKNUM||'').startsWith('M'))continue
  const rings=outerRings(f.geometry)
  if(!rings.length)continue
  let ring=rings.sort((a,b)=>area(a)-area(b)).at(-1).map(proj)
  if(ring.length>1&&Math.hypot(ring[0][0]-ring[ring.length-1][0],ring[0][1]-ring[ring.length-1][1])<0.01)ring.pop()
  ring=rdp(ring,1.1)
  const a=area(ring)
  if(a<900||ring.length<3)continue
  const c=centroid(ring)
  if(!inRing(c[0],c[1],land))continue
  parks.push({id:'park-'+p.OBJECTID,name:p.PARK_NAME||'公园',kind:'park',poly:ring.map(([x,y])=>[+x.toFixed(1),+y.toFixed(1)]),centroid:[+c[0].toFixed(1),+c[1].toFixed(1)],water:null,paths:[],area:+a.toFixed(0)})
}
const y=(lat)=>-(lat-LAT0)*MY
const x=(lon)=>(lon-LON0)*MX
const yN=y(40.80), yRing=y(40.765), yMid=y(40.745), yLow=y(40.715), yS=y(40.70), xm=x(-73.982)
const rect=(x1,y1,x2,y2)=>[[x1,y1],[x2,y1],[x2,y2],[x1,y2]]
const baseDistricts=[
 {id:'harbor',name:'旧港',en:'OLD HARBOR',color:'#58b6ff',poly:rect(WORLD.minX,yLow,WORLD.maxX,yS)},
 {id:'rust',name:'锈带',en:'RUST BELT',color:'#ff9f5a',poly:rect(WORLD.minX,yMid,xm,yLow)},
 {id:'strip',name:'霓虹巷',en:'NEON STRIP',color:'#ff4fa3',poly:rect(xm,yMid,WORLD.maxX,yLow)},
 {id:'core',name:'中枢',en:'THE CORE',color:'#53e0d0',poly:rect(WORLD.minX,yRing,xm,yMid)},
 {id:'outlands',name:'外野',en:'THE OUTLANDS',color:'#b18cff',poly:rect(xm,yRing,WORLD.maxX,yMid)},
 {id:'ring',name:'环城',en:'THE RING',color:'#ffd36a',poly:rect(WORLD.minX,yN,WORLD.maxX,yRing)},
]
const centers={harbor:[x(-74.007),y(40.707)],rust:[x(-74.003),y(40.735)],strip:[x(-73.977),y(40.728)],core:[x(-73.997),y(40.755)],outlands:[x(-73.974),y(40.753)],ring:[x(-73.972),y(40.778)]}
const districts=baseDistricts.map(d=>({...d,centroid:centers[d.id]}))
function districtAt(x,y){return districts.find(d=>inRing(x,y,d.poly))?.id||'core'}
for(const b of buildings)b.district=districtAt(b.cx,b.cy)
// POIs
const poiDefs=[
 ['empire-state','帝国大厦','EMPIRE STATE',40.7484,-73.9857,'tower',381],
 ['times-square','时报广场','TIMES SQUARE',40.7580,-73.9855,'civic',20],
 ['nyse','纽约证券交易所','NYSE',40.7069,-74.0113,'civic',40],
 ['one-world','世界贸易中心','ONE WTC',40.7127,-74.0134,'tower',541],
 ['central-park','中央公园','CENTRAL PARK',40.7829,-73.9654,'park',30],
 ['brooklyn-bridge','布鲁克林大桥','BROOKLYN BRIDGE',40.7061,-73.9969,'civic',84],
 ['grand-central','中央车站','GRAND CENTRAL',40.7527,-73.9772,'civic',40],
 ['high-line','高线公园','THE HIGH LINE',40.7480,-74.0048,'park',10],
 ['washington-square','华盛顿广场','WASHINGTON SQ',40.7308,-73.9973,'park',10],
 ['msg','麦迪逊广场花园','MADISON SQ GARDEN',40.7505,-73.9934,'civic',40],
 ['chelsea-market','切尔西市场','CHELSEA MARKET',40.7420,-74.0060,'civic',20],
 ['seaport','南街海港','SOUTH ST SEAPORT',40.7065,-74.0030,'harbor',15],
]
const pois=poiDefs.map(([id,name,en,lat,lon,type,height])=>{const px=x(lon),py=y(lat);return{id,name,en,district:districtAt(px,py),x:+px.toFixed(1),y:+py.toFixed(1),height,type,status:'开放',description:'真实纽约地标。'}})
// write compact module as JSON
const map={WORLD,CITY_FOOTPRINT:land.map(([x,y])=>[+x.toFixed(1),+y.toFixed(1)]),DISTRICTS:districts,PARKS:parks,POIS:pois}
fs.mkdirSync('src/data',{recursive:true})
fs.writeFileSync('src/data/nyc-map.json',JSON.stringify(map))
fs.writeFileSync('src/data/nyc-buildings.json',JSON.stringify(buildings))
fs.writeFileSync('src/data/nyc-roads.json',JSON.stringify(roads))
console.log('world',WORLD,'buildings',buildings.length,'roads',roads.length,'parks',parks.length)
console.log('sizes MB',(fs.statSync('src/data/nyc-map.json').size/1048576).toFixed(2),(fs.statSync('src/data/nyc-buildings.json').size/1048576).toFixed(2),(fs.statSync('src/data/nyc-roads.json').size/1048576).toFixed(2))
