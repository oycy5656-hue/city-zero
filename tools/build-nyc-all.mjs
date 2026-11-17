import fs from 'node:fs'
import path from 'node:path'
const raw=(n)=>JSON.parse(fs.readFileSync(path.join('tools/raw-all',n),'utf8'))
const LAT0=40.705, LON0=-73.98
const MX=111320*Math.cos(LAT0*Math.PI/180), MY=110540
const proj=([lon,lat])=>[(lon-LON0)*MX,-(lat-LAT0)*MY]
const x=(lon)=>(lon-LON0)*MX, y=(lat)=>-(lat-LAT0)*MY
function rdp(points,tol){if(points.length<3)return points.slice();let maxD=0,idx=0;const [x1,y1]=points[0],[x2,y2]=points[points.length-1];const dx=x2-x1,dy=y2-y1,len2=dx*dx+dy*dy;for(let i=1;i<points.length-1;i++){const [px,py]=points[i];let t=len2?((px-x1)*dx+(py-y1)*dy)/len2:0;t=Math.max(0,Math.min(1,t));const d=Math.hypot(px-(x1+t*dx),py-(y1+t*dy));if(d>maxD){maxD=d;idx=i}}if(maxD>tol){const a=rdp(points.slice(0,idx+1),tol),b=rdp(points.slice(idx),tol);return a.slice(0,-1).concat(b)}return [points[0],points[points.length-1]]}
function area(ring){let s=0;for(let i=0,j=ring.length-1;i<ring.length;j=i++)s+=ring[j][0]*ring[i][1]-ring[i][0]*ring[j][1];return Math.abs(s)/2}
function centroid(ring){let x=0,y=0,a=0;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const f=ring[j][0]*ring[i][1]-ring[i][0]*ring[j][1];a+=f;x+=(ring[j][0]+ring[i][0])*f;y+=(ring[j][1]+ring[i][1])*f}if(Math.abs(a)<1e-9)return ring[0];return [x/(3*a),y/(3*a)]}
function outerRings(g){if(g.type==='Polygon')return [g.coordinates[0]];if(g.type==='MultiPolygon')return g.coordinates.map(p=>p[0]);return []}
function inRing(x,y,ring){let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const xi=ring[i][0],yi=ring[i][1],xj=ring[j][0],yj=ring[j][1];const it=(yi>y)!==(yj>y)&&x<((xj-xi)*(y-yi))/(yj-yi)+xi;if(it)inside=!inside}return inside}
function clipPoly(poly,rect){const {minX,minY,maxX,maxY}=rect;const edges=[p=>p[0]>=minX,p=>p[0]<=maxX,p=>p[1]>=minY,p=>p[1]<=maxY];const inter=(a,b,e)=>{const [ax,ay]=a,[bx,by]=b;if(e===0){const t=(minX-ax)/(bx-ax);return [minX,ay+(by-ay)*t]}if(e===1){const t=(maxX-ax)/(bx-ax);return [maxX,ay+(by-ay)*t]}if(e===2){const t=(minY-ay)/(by-ay);return [ax+(bx-ax)*t,minY]}const t=(maxY-ay)/(by-ay);return [ax+(bx-ax)*t,maxY]};let out=poly;for(let e=0;e<4;e++){const input=out;out=[];for(let i=0;i<input.length;i++){const cur=input[i],prev=input[(i+input.length-1)%input.length];const ci=edges[e](cur),pi=edges[e](prev);if(ci){if(!pi)out.push(inter(prev,cur,e));out.push(cur)}else if(pi)out.push(inter(prev,cur,e))}if(!out.length)break}return out}
const landFeats=raw('land.geojson').features
const areas=[]; const mains={}
for(const f of landFeats){const boro=f.properties.BoroName;const rings=outerRings(f.geometry).map(r=>{let rr=r.map(proj);if(rr.length>1&&Math.hypot(rr[0][0]-rr[rr.length-1][0],rr[0][1]-rr[rr.length-1][1])<0.01)rr.pop();return rdp(rr,1.2)}).filter(r=>r.length>3&&area(r)>20000)
 for(let i=0;i<rings.length;i++)areas.push({id:`${boro}-${i}`,name:boro,boro,poly:rings[i].map(([a,b])=>[+a.toFixed(0),+b.toFixed(0)])})
 rings.sort((a,b)=>area(b)-area(a)); if(rings[0])mains[boro]=rings[0]
}
const all=areas.flatMap(a=>a.poly);const box=all.reduce((o,[a,b])=>({minX:Math.min(o.minX,a),maxX:Math.max(o.maxX,a),minY:Math.min(o.minY,b),maxY:Math.max(o.maxY,b)}),{minX:1e9,maxX:-1e9,minY:1e9,maxY:-1e9});const margin=900
const WORLD={minX:Math.floor(box.minX-margin),minY:Math.floor(box.minY-margin),maxX:Math.ceil(box.maxX+margin),maxY:Math.ceil(box.maxY+margin)};WORLD.width=WORLD.maxX-WORLD.minX;WORLD.height=WORLD.maxY-WORLD.minY;WORLD.areaKm2=+(areas.reduce((s,a)=>s+area(a.poly),0)/1e6).toFixed(2)
WORLD.lon0=LON0;WORLD.lat0=LAT0;WORLD.mx=MX;WORLD.my=MY
const ySplit=y(40.710)
const mana=mains['Manhattan'];const rectN={minX:WORLD.minX,minY:WORLD.minY,maxX:WORLD.maxX,maxY:ySplit};const rectS={minX:WORLD.minX,minY:ySplit,maxX:WORLD.maxX,maxY:WORLD.maxY}
const polyCore=clipPoly(mana,rectN).map(([a,b])=>[+a.toFixed(1),+b.toFixed(1)]);const polyHarbor=clipPoly(mana,rectS).map(([a,b])=>[+a.toFixed(1),+b.toFixed(1)])
const baseDistricts=[
 {id:'core',name:'中枢',en:'THE CORE',color:'#53e0d0',poly:polyCore,realName:'曼哈顿 / 中城'},
 {id:'harbor',name:'旧港',en:'OLD HARBOR',color:'#58b6ff',poly:polyHarbor,realName:'曼哈顿 / 下城'},
 {id:'strip',name:'霓虹巷',en:'NEON STRIP',color:'#ff4fa3',poly:mains['Brooklyn'],realName:'布鲁克林'},
 {id:'outlands',name:'外野',en:'THE OUTLANDS',color:'#b18cff',poly:mains['Queens'],realName:'皇后区'},
 {id:'rust',name:'锈带',en:'RUST BELT',color:'#ff9f5a',poly:mains['Bronx'],realName:'布朗克斯'},
 {id:'ring',name:'环城',en:'THE RING',color:'#ffd36a',poly:mains['Staten Island'],realName:'斯塔滕岛'},
]
const meta=JSON.parse(fs.readFileSync('src/data/nyc-district-meta.json','utf8').replace(/^\uFEFF/,''))
const pops={core:1050000,harbor:550000,strip:2600000,outlands:2400000,rust:1470000,ring:500000}
const districts=baseDistricts.map(d=>{const c=centroid(d.poly);return{...d,...(meta[d.id]||{}),population:pops[d.id],centroid:[+c[0].toFixed(0),+c[1].toFixed(0)]}})
function districtAt(px,py){return districts.find(d=>inRing(px,py,d.poly))?.id||'core'}
// NTA communities
const communities=[]
for(const f of raw('nta.geojson').features){const p=f.properties;const rings=outerRings(f.geometry).map(r=>{let rr=r.map(proj);if(rr.length>1&&Math.hypot(rr[0][0]-rr[rr.length-1][0],rr[0][1]-rr[rr.length-1][1])<0.01)rr.pop();return rdp(rr,1.4)}).filter(r=>r.length>3&&area(r)>10000);if(!rings.length)continue;rings.sort((a,b)=>area(b)-area(a));const ring=rings[0];const c=centroid(ring);communities.push({id:'nta-'+p.OBJECTID,name:p.NTAName||p.NTACode,code:p.NTACode,boro:p.BoroName,poly:ring.map(([a,b])=>[+a.toFixed(0),+b.toFixed(0)]),centroid:[+c[0].toFixed(0),+c[1].toFixed(0)],area:+area(ring).toFixed(0)})}
// roads major
const roads=[]
for(const f of raw('roads.geojson').features){const p=f.properties;let pts=f.geometry.coordinates.map(proj);if(pts.length<2)continue;pts=rdp(pts,1.5);const width=Math.max(6,Math.min(38,(Number(p.StreetWidth)||0)*0.3048||12));roads.push({id:roads.length,name:(p.Street||'').trim(),width:+width.toFixed(1),points:pts.map(([a,b])=>[+a.toFixed(0),+b.toFixed(0)])})}
// parks major
const parks=[]
for(const f of raw('parks.geojson').features){const p=f.properties;const rings=outerRings(f.geometry).map(r=>{let rr=r.map(proj);if(rr.length>1&&Math.hypot(rr[0][0]-rr[rr.length-1][0],rr[0][1]-rr[rr.length-1][1])<0.01)rr.pop();return rdp(rr,1.4)}).filter(r=>r.length>3&&area(r)>12000);if(!rings.length)continue;rings.sort((a,b)=>area(b)-area(a));const ring=rings[0];const c=centroid(ring);parks.push({id:'park-'+p.OBJECTID,name:p.PARK_NAME||'Park',kind:'park',poly:ring.map(([a,b])=>[+a.toFixed(0),+b.toFixed(0)]),centroid:[+c[0].toFixed(0),+c[1].toFixed(0)],water:null,paths:[],area:+area(ring).toFixed(0)})}
// POIs
const poiDefs=[
 ['empire-state','帝国大厦','EMPIRE STATE',40.7484,-73.9857,'tower',381],
 ['times-square','时报广场','TIMES SQUARE',40.7580,-73.9855,'civic',20],
 ['one-world','世界贸易中心','ONE WTC',40.7127,-74.0134,'tower',541],
 ['central-park','中央公园','CENTRAL PARK',40.7829,-73.9654,'park',30],
 ['grand-central','中央车站','GRAND CENTRAL',40.7527,-73.9772,'civic',40],
 ['brooklyn-bridge','布鲁克林大桥','BROOKLYN BRIDGE',40.7061,-73.9969,'civic',84],
 ['prospect-park','展望公园','PROSPECT PARK',40.6602,-73.9690,'park',20],
 ['barclays','巴克莱中心','BARCLAYS CENTER',40.6826,-73.9754,'civic',40],
 ['coney-island','康尼岛','CONEY ISLAND',40.5749,-73.9856,'park',10],
 ['flushing-meadows','法拉盛草原','FLUSHING MEADOWS',40.7397,-73.8406,'park',20],
 ['citi-field','花旗球场','CITI FIELD',40.7571,-73.8458,'civic',30],
 ['yankee-stadium','洋基体育场','YANKEE STADIUM',40.8296,-73.9262,'civic',40],
 ['bronx-zoo','布朗克斯动物园','BRONX ZOO',40.8506,-73.8770,'park',15],
 ['staten-ferry','斯塔滕岛渡轮','STATEN ISLAND FERRY',40.6437,-74.0736,'harbor',15],
 ['snug-harbor','斯纳格港','SNUG HARBOR',40.6430,-74.1020,'park',15],
]
const pois=poiDefs.map(([id,name,en,lat,lon,type,height])=>{const px=x(lon),py=y(lat);return{id,name,en,district:districtAt(px,py),x:+px.toFixed(0),y:+py.toFixed(0),height,type,status:'开放',description:'真实纽约地标。'}})
const map={WORLD,CITY_AREAS:areas,DISTRICTS:districts,COMMUNITIES:communities,PARKS:parks,ROADS:roads,POIS:pois,TOTAL_BUILDINGS:1082349}
fs.writeFileSync('src/data/nyc-map.json',JSON.stringify(map))
console.log('areas',areas.length,'districts',districts.length,'communities',communities.length,'roads',roads.length,'parks',parks.length,'size MB',(fs.statSync('src/data/nyc-map.json').size/1048576).toFixed(2))
